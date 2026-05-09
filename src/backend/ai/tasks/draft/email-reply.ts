/**
 * @fileoverview AI task to generate contextual draft email replies based on
 * the email classification intent. Produces polite, professional replies
 * tailored to the specific situation.
 *
 * Draft types:
 *  - Interview scheduling: Polite acceptance with date placeholder
 *  - Offer: Multiple reply options (think about it, excited, negotiate)
 *  - General: Brief acknowledgment
 *  - Rejection: No draft (status auto-updated instead)
 */

import { enforceTokenLimit } from "../../utils/token-estimator";
import type { EmailClassification } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftReplyResult {
  /** Primary recommended draft */
  primaryDraft: string;
  /** Alternative draft options (for offers: 2-3 alternatives) */
  alternatives: string[];
  /** The intent that drove draft generation */
  intent: string;
}

// ---------------------------------------------------------------------------
// System prompts by intent
// ---------------------------------------------------------------------------

const INTERVIEW_SCHEDULING_PROMPT = `You are drafting a professional, warm email reply to an interview scheduling email on behalf of Justin.

<RULES>
- Address the sender by their first name
- Express genuine enthusiasm for the opportunity
- Reference the specific role/company naturally
- Include a placeholder << SELECTED_TIME >> where the user will fill in their chosen time
- If a hiring manager is mentioned, express looking forward to meeting them by name
- Keep it concise — 3-5 sentences max
- Sign off with "Thank you,\\nJustin"
- Do NOT include a subject line
</RULES>`;

const OFFER_PROMPT = `You are drafting professional email replies to a job offer email on behalf of Justin. Generate exactly 3 different reply options with different tones:

<OPTION_1>
A "let me think about it" reply — warm, appreciative, asks for weekend/a few days to review.
</OPTION_1>

<OPTION_2>
An "excited but reviewing" reply — enthusiastic, says reviewing overnight, signals positive intent.
</OPTION_2>

<OPTION_3>
A "direct acceptance with questions" reply — expresses excitement, asks about next steps and start date.
</OPTION_3>

<RULES>
- Address the sender by their first name
- Reference the specific role and company
- Each reply should be 3-5 sentences
- Sign off with "Thank you,\\nJustin"
- Do NOT include subject lines
- Separate each option with \\n---OPTION---\\n
</RULES>`;

const GENERAL_REPLY_PROMPT = `You are drafting a brief, professional email reply on behalf of Justin.

<RULES>
- Address the sender by their first name if known
- Keep it very concise — 2-3 sentences max
- Be warm but professional
- Acknowledge the content appropriately
- Sign off with "Thank you,\\nJustin"
- Do NOT include a subject line
</RULES>`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function draftEmailReply(
  env: Env,
  emailSubject: string,
  emailBody: string,
  classification: EmailClassification,
  roleContext?: { companyName: string; jobTitle: string },
): Promise<DraftReplyResult> {
  // Rejections don't get draft replies — status is auto-updated
  if (classification.intent === "rejection") {
    return {
      primaryDraft: "",
      alternatives: [],
      intent: "rejection",
    };
  }

  const senderName = classification.senderPersonName || "there";
  const companyName = roleContext?.companyName || classification.companyName || "the company";
  const jobTitle = roleContext?.jobTitle || classification.jobTitle || "the position";
  const hiringManager = classification.hiringManagerName;

  let systemPrompt: string;
  let isMultiOption = false;

  switch (classification.intent) {
    case "interview_scheduling":
      systemPrompt = INTERVIEW_SCHEDULING_PROMPT;
      break;
    case "offer":
      systemPrompt = OFFER_PROMPT;
      isMultiOption = true;
      break;
    default:
      systemPrompt = GENERAL_REPLY_PROMPT;
      break;
  }

  const contextBlock = [
    `Sender name: ${senderName}`,
    `Company: ${companyName}`,
    `Role: ${jobTitle}`,
    hiringManager ? `Hiring manager: ${hiringManager}` : null,
    classification.availabilityOptions?.length
      ? `Interview time options: ${classification.availabilityOptions.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Truncate email body for the prompt
  const truncatedBody = emailBody.slice(0, 8000);
  enforceTokenLimit(truncatedBody, 40000, "Email Body for Draft");

  const userPrompt = `${contextBlock}

Original email subject: ${emailSubject}

Original email body:
${truncatedBody}`;

  try {
    const response = (await env.AI.run(
      env.MODEL_DRAFT as Parameters<typeof env.AI.run>[0],
      {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { response?: string };

    const rawDraft = response.response?.trim() ?? "";

    if (isMultiOption) {
      // Split multi-option drafts on the separator
      const options = rawDraft
        .split(/---OPTION---/gi)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);

      return {
        primaryDraft: options[0] || rawDraft,
        alternatives: options.slice(1),
        intent: classification.intent,
      };
    }

    return {
      primaryDraft: rawDraft,
      alternatives: [],
      intent: classification.intent,
    };
  } catch (error) {
    console.error("Draft email reply failed:", error);
    return {
      primaryDraft: "",
      alternatives: [],
      intent: classification.intent,
    };
  }
}
