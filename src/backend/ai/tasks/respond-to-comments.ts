/**
 * @fileoverview Google Docs comment response task — handles @colby/#colby
 * tagged comment threads by consulting NotebookLM and posting replies.
 *
 * For each unresolved tagged comment:
 *   1. Read the full document text
 *   2. Extract the comment's highlighted text + surrounding context
 *   3. Consult NotebookLM with career evidence for the specific feedback
 *   4. Workers AI formats the response into a concise reply
 *   5. Post the reply to the comment thread
 *   6. Store the interaction in career memory
 */

import { eq } from "drizzle-orm";

import type { CommentResponseProgress, CommentResponseResult } from "./types";

import { getDb } from "../../db";
import { roles, resumeBullets } from "../../db/schema";
import { CareerMemoryService } from "../../services/career-memory";
import { getModelRegistry } from "../models";
import { AiProvider } from "../providers";
import { GoogleDocsClient } from "../tools/google/docs";
import { consultNotebook } from "../tools/notebooklm/notebooklm";
import { extractText } from "../utils/extract-text";
import { enforceTokenLimit } from "../utils/token-estimator";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import { WRITING_RULES } from "./generate/resume-bullets";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function respondToComments(
  env: Env,
  roleId: string,
  gdocId: string,
  onProgress?: (progress: CommentResponseProgress) => void,
): Promise<CommentResponseResult> {
  const progress = onProgress ?? (() => {});
  const memory = new CareerMemoryService(env);
  const docsClient = new GoogleDocsClient(env);
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).chat;

  // Load role context
  const db = getDb(env);
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new Error(`Role not found: ${roleId}`);

  // Load resume bullets for career context
  const bullets = await db
    .select()
    .from(resumeBullets)
    .where(eq(resumeBullets.isActive, true))
    .orderBy(resumeBullets.category);

  const bulletsContext =
    bullets.length > 0 ? bullets.map((b) => `[${b.category}] ${b.content}`).join("\n") : "";

  // ── Step 1: Read document + comments ────────────────────────────────

  progress({ phase: "reading", message: "Reading document and comments..." });

  const [docText, comments] = await Promise.all([
    docsClient.read(gdocId),
    docsClient.listComments(gdocId),
  ]);

  // Filter for @colby or #colby tagged, unresolved comments
  const taggedComments = comments.filter((c) => {
    const content = c.content.toLowerCase();
    return !c.resolved && (content.includes("@colby") || content.includes("#colby"));
  });

  if (taggedComments.length === 0) {
    progress({ phase: "complete", message: "No tagged comments found." });
    return { commentsProcessed: 0, replies: [] };
  }

  // ── Step 2: Process each comment ────────────────────────────────────

  const replies: CommentResponseResult["replies"] = [];

  for (let i = 0; i < taggedComments.length; i++) {
    const comment = taggedComments[i];

    progress({
      phase: "responding",
      message: `Responding to comment ${i + 1} of ${taggedComments.length}...`,
      commentId: comment.id,
      totalComments: taggedComments.length,
      currentComment: i + 1,
    });

    try {
      // Extract highlighted text context from the document
      // The comment anchor contains the quoted text reference
      const highlightedText = extractHighlightedContext(docText, comment);

      // Consult NotebookLM with the specific comment context
      const notebookQuery = `The user has commented on their ${role.jobTitle} resume for ${role.companyName}.

Their comment on the text "${highlightedText.quoted}" says:
"${cleanCommentText(comment.content)}"

Based on my career history, please provide:
1. Alternative wordings or approaches for this section
2. Supporting evidence from my actual experience
3. Suggestions to make this more impactful for the role

Context around this section:
${highlightedText.surrounding}
${bulletsContext ? `\nResume bullets for reference:\n${bulletsContext}` : ""}`;

      enforceTokenLimit(notebookQuery, 120000, "Comment Notebook Query");

      const notebookResult = await consultNotebook(env, notebookQuery);

      // Format the response into a concise reply
      const formattedResult = await provider.invokeModel(model, {
        messages: [
          {
            role: "system",
            content: `You are Colby, a career assistant responding to document review comments.

${WRITING_RULES}

Format your response as a concise, actionable Google Docs comment reply.
Keep it under 300 words. Be specific and helpful.
If the highlighted text is a resume bullet, rewrite it following the strict "What + How + Result/Impact" format from the WRITING_RULES above.
If suggesting rewording, provide the EXACT suggested text — not a description of what to change.
Don't repeat the user's comment or use unnecessary pleasantries.`,
          },
          {
            role: "user",
            content: `User comment: "${cleanCommentText(comment.content)}"
On text: "${highlightedText.quoted}"

Career knowledge base says:
${notebookResult.answer}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });

      const replyText = extractText(formattedResult);

      // Post reply to the comment thread
      await docsClient.replyToComment(gdocId, comment.id, replyText);

      // Store in career memory
      const memoryId = await memory.remember({
        query: `Comment on resume: "${cleanCommentText(comment.content)}" (on text: "${highlightedText.quoted}")`,
        answer: replyText,
        source: "comment_response",
        agent: "orchestrator",
        category: "comment_feedback",
        roleId,
        references: notebookResult.references ?? [],
        metadata: {
          commentId: comment.id,
          gdocId,
          highlightedText: highlightedText.quoted,
          notebookAnswer: notebookResult.answer.slice(0, 2000),
        },
      });

      replies.push({
        commentId: comment.id,
        commentContent: comment.content,
        replyContent: replyText,
        memoryId,
      });
    } catch (error) {
      console.error(`Failed to respond to comment ${comment.id}:`, error);
    }
  }

  progress({
    phase: "complete",
    message: `Responded to ${replies.length} of ${taggedComments.length} comments`,
    totalComments: taggedComments.length,
  });

  return { commentsProcessed: replies.length, replies };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the quoted/highlighted text and surrounding context from the document.
 *
 * The Google Drive API provides comment anchors but they're opaque strings.
 * We attempt to find the quoted text in the comment content itself (Google
 * Docs often includes it) and then extract surrounding context from the doc.
 */
function extractHighlightedContext(
  docText: string,
  comment: { content: string; anchor?: string },
): { quoted: string; surrounding: string } {
  // Try to extract quoted text from the comment content
  // Users often quote the text they're commenting on
  const quotedMatch = comment.content.match(/"([^"]+)"/);
  const quoted = quotedMatch?.[1] ?? "";

  if (quoted && docText.includes(quoted)) {
    const idx = docText.indexOf(quoted);
    const start = Math.max(0, idx - 250);
    const end = Math.min(docText.length, idx + quoted.length + 250);
    return {
      quoted,
      surrounding: docText.slice(start, end),
    };
  }

  // Fallback: use the full document text as context
  return {
    quoted: quoted || "(highlighted text not extractable)",
    surrounding: docText,
  };
}

/**
 * Remove @colby / #colby tags from comment text for cleaner NLM queries.
 */
function cleanCommentText(text: string): string {
  return text
    .replace(/@colby/gi, "")
    .replace(/#colby/gi, "")
    .trim();
}
