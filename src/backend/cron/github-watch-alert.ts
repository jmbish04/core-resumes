/**
 * @fileoverview Cron handler for monitoring poteto/hiring-without-whiteboards repo.
 *
 * Runs as part of the scheduled cron job. It polls the GitHub API for the latest
 * README.md from the target repository, compares the content SHA with the cached
 * value in KV, and if changed, fetches and parses the new companies.
 *
 * New companies are automatically added to the api_companies discovery table (D1)
 * and promoted immediately to the board_tokens table if they use Greenhouse.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/backend/db";
import { apiCompanies, boardTokens } from "@/backend/db/schema";
import { getGithubToken } from "@/backend/utils/secrets";
import { Logger } from "@/backend/lib/logger";

const KV_SHA_KEY = "hiring_without_whiteboards_last_sha";
const REPO_OWNER = "poteto";
const REPO_NAME = "hiring-without-whiteboards";
const SOURCE_URL = "https://github.com/poteto/hiring-without-whiteboards/";

export interface GithubWatchResult {
  checked: boolean;
  shaChanged: boolean;
  newCompaniesCount: number;
  newCompanies?: string[];
  error?: string;
}

/**
 * Main cron function called from worker `scheduled()`.
 */
export async function runGithubWatchCron(env: Env): Promise<GithubWatchResult> {
  const logger = new Logger(env);
  const db = getDb(env);

  try {
    const ghToken = await getGithubToken(env);
    const headers: Record<string, string> = {
      "User-Agent": "Core-Resumes-Worker",
      Accept: "application/vnd.github.v3+json",
    };

    if (ghToken) {
      headers["Authorization"] = `token ${ghToken}`;
    }

    // 1. Fetch README.md metadata to check for SHA changes
    const metaUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/README.md`;
    const metaRes = await fetch(metaUrl, { headers });
    
    if (!metaRes.ok) {
      const errText = await metaRes.text();
      throw new Error(`Failed to fetch metadata from GitHub: HTTP ${metaRes.status} -- ${errText}`);
    }

    const metaData = (await metaRes.json()) as { sha: string };
    const latestSha = metaData.sha;

    // 2. Read last processed SHA from KV
    const lastSha = await env.KV.get(KV_SHA_KEY);

    if (lastSha === latestSha) {
      console.log(`[cron:github-watch] README.md SHA is unchanged (${latestSha}). Skipping sync.`);
      return { checked: true, shaChanged: false, newCompaniesCount: 0 };
    }

    console.log(`[cron:github-watch] README.md SHA changed from "${lastSha}" to "${latestSha}". Syncing companies...`);

    // 3. Fetch the raw README.md content
    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/README.md`;
    const rawRes = await fetch(rawUrl);

    if (!rawRes.ok) {
      throw new Error(`Failed to fetch raw README.md: HTTP ${rawRes.status}`);
    }

    const readmeContent = await rawRes.text();

    // 4. Parse companies from the README.md content
    const discoveredCompanies = parseReadmeCompanies(readmeContent);
    
    if (discoveredCompanies.length === 0) {
      console.log("[cron:github-watch] Found 0 companies in README.md. Something might be wrong with parsing.");
      return { checked: true, shaChanged: true, newCompaniesCount: 0 };
    }

    // 5. Query D1 to find existing companies in api_companies to prevent duplicates
    const existingCompanies = await db
      .select({
        token: apiCompanies.jobBoardToken,
        system: apiCompanies.system,
      })
      .from(apiCompanies);

    const existingSet = new Set(existingCompanies.map((c) => `${c.token}:${c.system}`));

    // 6. Filter newly discovered companies
    const newCompaniesToInsert = discoveredCompanies.filter(
      (c) => !existingSet.has(`${c.token}:${c.system}`)
    );

    if (newCompaniesToInsert.length === 0) {
      console.log("[cron:github-watch] No new companies discovered. All are already in DB.");
      await env.KV.put(KV_SHA_KEY, latestSha);
      return { checked: true, shaChanged: true, newCompaniesCount: 0 };
    }

    // 7. Insert new companies into D1 api_companies table
    const now = new Date();
    let apiInsertedCount = 0;
    let boardTokensInsertedCount = 0;
    const insertedNames: string[] = [];

    for (const c of newCompaniesToInsert) {
      try {
        await db
          .insert(apiCompanies)
          .values({
            name: c.name,
            jobBoardToken: c.token,
            system: c.system,
            source: SOURCE_URL,
            isActive: true,
            isRecommended: false,
            recommendationReason: null,
            timestampAdded: now,
          })
          .onConflictDoNothing();

        apiInsertedCount++;
        insertedNames.push(c.name);

        // If it is Greenhouse, also promote automatically to board_tokens
        if (c.system === "greenhouse") {
          await db
            .insert(boardTokens)
            .values({
              token: c.token,
              companyName: c.name,
              companyUrl: c.url,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing();
          
          boardTokensInsertedCount++;
        }
      } catch (insertError) {
        console.error(`[cron:github-watch] Failed to insert company "${c.name}":`, insertError);
      }
    }

    // 8. Log discovery metrics and update KV
    await logger.info(
      `[GitHub Watch Alert] Discovered and indexed ${apiInsertedCount} new companies from ${REPO_NAME} repo.`,
      {
        status: "success",
        newCompaniesCount: apiInsertedCount,
        boardTokensAdded: boardTokensInsertedCount,
        companies: insertedNames,
      }
    );

    await env.KV.put(KV_SHA_KEY, latestSha);

    return {
      checked: true,
      shaChanged: true,
      newCompaniesCount: apiInsertedCount,
      newCompanies: insertedNames,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[cron:github-watch] Error during github watch cron:", errorMsg);
    await logger.error(`[GitHub Watch Alert Error] Failed: ${errorMsg}`, {
      status: "failed",
    });
    return { checked: false, shaChanged: false, newCompaniesCount: 0, error: errorMsg };
  }
}

/**
 * Parses company lines from README.md.
 * Expected format:
 * - [Company Name](url) | Location | Description
 */
function parseReadmeCompanies(content: string): Array<{
  name: string;
  url: string;
  location: string;
  description: string;
  token: string;
  system: string;
}> {
  const companies: Array<{
    name: string;
    url: string;
    location: string;
    description: string;
    token: string;
    system: string;
  }> = [];

  const lines = content.split("\n");
  
  // Bullet match: - [Company](url) | Location | Description
  // Or simple bullet match: - [Company](url)
  const regex = /^-\s*\[([^\]]+)\]\(([^)]+)\)(?:\s*\|\s*([^|]*))?(?:\s*\|\s*(.*))?$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- [")) continue;

    const match = trimmed.match(regex);
    if (!match) continue;

    const name = match[1].trim();
    const url = match[2].trim();
    const location = match[3] ? match[3].trim() : "";
    const description = match[4] ? match[4].trim() : "";

    // Skip lists of resources, guidelines or licenses
    if (
      url.includes("github.com/poteto/hiring-without-whiteboards") ||
      name.toLowerCase().includes("our recommendations") ||
      name.toLowerCase().includes("licensing") ||
      name.toLowerCase().includes("criteria")
    ) {
      continue;
    }

    const { system, token } = extractAtsInfo(url, name);

    companies.push({
      name,
      url,
      location,
      description,
      token,
      system,
    });
  }

  return companies;
}

/**
 * Heuristic helper to extract ATS system and token from URL or fall back to slugified name.
 */
function extractAtsInfo(url: string, name: string): { system: string; token: string } {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes("greenhouse.io")) {
    const ghMatch = url.match(/greenhouse\.io\/([^/]+)/) || url.match(/boards\.greenhouse\.io\/([^/]+)/);
    return {
      system: "greenhouse",
      token: ghMatch ? ghMatch[1] : slugify(name),
    };
  }
  
  if (urlLower.includes("lever.co")) {
    const leverMatch = url.match(/lever\.co\/([^/]+)/) || url.match(/jobs\.lever\.co\/([^/]+)/);
    return {
      system: "lever",
      token: leverMatch ? leverMatch[1] : slugify(name),
    };
  }
  
  if (urlLower.includes("ashbyhq.com")) {
    const ashbyMatch = url.match(/ashbyhq\.com\/([^/]+)/) || url.match(/jobs\.ashbyhq\.com\/([^/]+)/);
    return {
      system: "ashby",
      token: ashbyMatch ? ashbyMatch[1] : slugify(name),
    };
  }
  
  if (urlLower.includes("rippling.com")) {
    const ripplingMatch = url.match(/rippling\.com\/([^/]+)/) || url.match(/ats\.rippling\.com\/([^/]+)/);
    return {
      system: "rippling",
      token: ripplingMatch ? ripplingMatch[1] : slugify(name),
    };
  }

  // Fallback to greenhouse with slugified name
  return {
    system: "greenhouse",
    token: slugify(name),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
