/**
 * @fileoverview Google Docs & Drive agent method handlers.
 *
 * These functions are called by the OrchestratorAgent's `@callable()` methods.
 * They instantiate the appropriate client, apply `extractGoogleId` (via
 * the client), and execute the requested operation.
 */

import { GoogleDocsClient } from "@/ai/tools/google/docs";
import { GoogleDriveClient } from "@/ai/tools/google/drive";
import { extractBrandColors, DEFAULT_BRAND_COLORS } from "@/ai/tools/google/templates/brand-colors";
import {
  renderDocumentTemplate,
  renderBrandedDocumentTemplate,
  type TemplateType,
} from "@/ai/tools/google/templates/template-engine";
import { getDb } from "@/db";
import { companies } from "@/db/schema";

// ── Existing Docs methods ───────────────────────────────────────────────

export async function handleCreateDocFromTemplate(
  env: Env,
  templateId: string,
  vars: Record<string, string>,
  folderId: string,
) {
  return new GoogleDocsClient(env).createFromTemplate(templateId, vars, folderId);
}

export async function handleReadDoc(env: Env, docId: string) {
  return new GoogleDocsClient(env).read(docId);
}

export async function handleWriteDoc(env: Env, docId: string, text: string) {
  await new GoogleDocsClient(env).appendText(docId, text);
  return { ok: true };
}

export async function handleCommentOnDoc(env: Env, docId: string, anchor: string, text: string) {
  return new GoogleDocsClient(env).addComment(docId, anchor, text);
}

export async function handleReplyToDocComment(
  env: Env,
  docId: string,
  commentId: string,
  text: string,
) {
  return new GoogleDocsClient(env).replyToComment(docId, commentId, text);
}

export async function handleListDocCommentsTagged(env: Env, docId: string, tag = "#colby") {
  return new GoogleDocsClient(env).listComments(docId, tag);
}

// ── Drive + HTML methods ────────────────────────────────────────────────

/**
 * Create a native Google Doc from raw HTML content via multipart upload.
 */
export async function handleCreateDocFromHtml(
  env: Env,
  name: string,
  htmlContent: string,
  folderId: string,
) {
  return new GoogleDriveClient(env).createDocFromHtml(name, htmlContent, folderId);
}

/**
 * Load a shell HTML template (resume or cover_letter), render placeholders
 * with supplied variables, and upload as a native Google Doc.
 */
export async function handleCreateDocFromHtmlTemplate(
  env: Env,
  templateType: TemplateType,
  variables: Record<string, unknown>,
  folderId: string,
  name?: string,
) {
  const timestamp = new Date().toISOString();
  const docName =
    name ?? (templateType === "resume" ? `Resume - ${timestamp}` : `Cover Letter - ${timestamp}`);

  const renderedHtml = renderDocumentTemplate(templateType, variables);
  return new GoogleDriveClient(env).createDocFromHtml(docName, renderedHtml, folderId);
}

// ── Brand-aware document generation ─────────────────────────────────────

/**
 * Create a document with company brand colors injected into the CSS.
 *
 * Looks up the company in D1 by name (case-insensitive search) to find
 * stored brand colors. Falls back to default colors if no match is found
 * or if the matched company has no colors stored.
 */
export async function handleCreateBrandedDocFromTemplate(
  env: Env,
  templateType: TemplateType,
  variables: Record<string, unknown>,
  companyName: string,
  folderId: string,
  name?: string,
) {
  const timestamp = new Date().toISOString();
  const docName =
    name ??
    (templateType === "resume"
      ? `Resume - ${companyName} - ${timestamp}`
      : `Cover Letter - ${companyName} - ${timestamp}`);

  // Look up company brand colors from D1
  const brandColors = await lookupCompanyColors(env, companyName);

  const renderedHtml = renderBrandedDocumentTemplate(templateType, variables, brandColors);
  return new GoogleDriveClient(env).createDocFromHtml(docName, renderedHtml, folderId);
}

import { eq } from "drizzle-orm";

import { BrowserRendering } from "@/ai/tools/browser-rendering";

/**
 * Extract brand colors and logo from a company website via Browser Rendering.
 * Uploads the logo to Cloudflare Images and persists colors + logo to D1.
 */
export async function handleExtractBrandColors(env: Env, companyId: string) {
  const db = getDb(env);
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);

  if (!company || !company.url) {
    throw new Error("Company not found or has no URL.");
  }

  const result = await extractBrandColors(env, company.url);
  const logoUrlStr = result.logoUrl;

  let cfLogoUrl: string | undefined = undefined;

  if (logoUrlStr) {
    try {
      const browser = new BrowserRendering(env);
      cfLogoUrl = await browser.uploadImageFromUrl(logoUrlStr, {
        source: "extract_brand_colors",
        companyId,
      });
    } catch (error) {
      console.error("Failed to upload logo to CF Images", error);
    }
  }

  // Persist to D1
  await db
    .update(companies)
    .set({
      colorPrimary: result.primary,
      colorAccent: result.accent,
      ...(cfLogoUrl ? { logoUrl: cfLogoUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, companyId));

  return {
    ...result,
    logoUrl: cfLogoUrl || logoUrlStr,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Searches the companies table for a matching company name.
 * Returns brand colors if found, otherwise returns default colors.
 * Uses case-insensitive LIKE matching for flexibility (the Greenhouse
 * token may differ from the stored company name).
 */
async function lookupCompanyColors(
  env: Env,
  companyName: string,
): Promise<{ primary?: string; accent?: string }> {
  try {
    const db = getDb(env);
    const allCompanies = await db.select().from(companies);

    // Case-insensitive match — find the first company whose name
    // contains or is contained by the search term
    const normalizedSearch = companyName.toLowerCase().trim();
    const match = allCompanies.find((c) => {
      const normalizedName = c.name.toLowerCase().trim();
      return (
        normalizedName === normalizedSearch ||
        normalizedName.includes(normalizedSearch) ||
        normalizedSearch.includes(normalizedName)
      );
    });

    if (match?.colorPrimary || match?.colorAccent) {
      return {
        primary: match.colorPrimary ?? undefined,
        accent: match.colorAccent ?? undefined,
      };
    }

    return {};
  } catch (error) {
    console.error("Company color lookup failed:", error);
    return {};
  }
}
