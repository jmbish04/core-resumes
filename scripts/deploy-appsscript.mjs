/**
 * @fileoverview Deploy the Gemini Job Dropbox Apps Script project.
 *
 * Runs as `pnpm run deploy:appsscript`:
 *   1. Reads the Worker `name` from wrangler.jsonc.
 *   2. Derives the canonical Worker base URL: `https://<name>.hacolby.workers.dev`.
 *   3. Writes src/appscript-dropbox/Generated.gs with deploy-time defaults that
 *      Setup.gs applies to Script Properties (WORKER_BASE_URL is baked in;
 *      WORKER_API_KEY is seeded with the "ENTER_WORKER_API_KEY" placeholder for
 *      the operator to replace).
 *   4. Pushes the project to Apps Script via clasp.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const WRANGLER_PATH = path.join(REPO_ROOT, "wrangler.jsonc");
const APPSSCRIPT_DIR = path.join(REPO_ROOT, "src/appscript-dropbox");
const GENERATED_PATH = path.join(APPSSCRIPT_DIR, "Generated.gs");

const WORKERS_DEV_SUBDOMAIN = "hacolby.workers.dev";
const API_KEY_PLACEHOLDER = "ENTER_WORKER_API_KEY";

const log = (msg) => console.log(`[deploy:appsscript] ${msg}`);

/**
 * Strips // line comments and block comments from a JSONC string without
 * touching comment-like sequences that appear inside string literals.
 * @param {string} src
 * @returns {string}
 */
function stripJsonComments(src) {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }

    out += ch;
  }

  return out;
}

/**
 * Removes trailing commas (e.g. `[1, 2,]` or `{ "a": 1, }`) from a comment-free
 * JSON string, ignoring commas inside string literals.
 * @param {string} src
 * @returns {string}
 */
function stripTrailingCommas(src) {
  let out = "";
  let inString = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") {
        continue; // drop the trailing comma
      }
    }

    out += ch;
  }

  return out;
}

function readWorkerName() {
  let raw;
  try {
    raw = fs.readFileSync(WRANGLER_PATH, "utf8");
  } catch {
    log(`Error: could not read ${path.relative(REPO_ROOT, WRANGLER_PATH)}`);
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(stripTrailingCommas(stripJsonComments(raw)));
  } catch (err) {
    log(`Error: failed to parse wrangler.jsonc — ${err.message}`);
    process.exit(1);
  }

  if (!config.name || typeof config.name !== "string") {
    log('Error: wrangler.jsonc has no top-level "name".');
    process.exit(1);
  }

  return config.name;
}

function writeGeneratedFile(baseUrl) {
  const content = `/**
 * ============================================================================
 * Generated.gs — AUTO-GENERATED. DO NOT EDIT BY HAND.
 * ============================================================================
 *
 * Written by scripts/deploy-appsscript.mjs (\`pnpm run deploy:appsscript\`).
 * Holds deploy-time defaults that Setup.gs applies to Script Properties.
 *
 * - GENERATED_WORKER_BASE_URL is derived from the Worker name in wrangler.jsonc.
 * - GENERATED_WORKER_API_KEY is a placeholder; replace it in Script Properties
 *   (Project Settings > Script Properties) with the real WORKER_API_KEY.
 */

const GENERATED_WORKER_BASE_URL = ${JSON.stringify(baseUrl)};
const GENERATED_WORKER_API_KEY = ${JSON.stringify(API_KEY_PLACEHOLDER)};
`;

  fs.writeFileSync(GENERATED_PATH, content, "utf8");
  log(`Wrote ${path.relative(REPO_ROOT, GENERATED_PATH)}`);
}

function claspPush() {
  log("Pushing to Apps Script via clasp...");
  try {
    execSync("clasp push --force", { cwd: REPO_ROOT, stdio: "inherit" });
    log("Push complete ✅");
  } catch {
    log("Error: clasp push failed. Ensure you are logged in (`clasp login`).");
    process.exit(1);
  }
}

const workerName = readWorkerName();
const baseUrl = `https://${workerName}.${WORKERS_DEV_SUBDOMAIN}`;
log(`Worker name: ${workerName}`);
log(`Worker base URL: ${baseUrl}`);

writeGeneratedFile(baseUrl);
claspPush();
