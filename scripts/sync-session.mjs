#!/usr/bin/env node

/**
 * @fileoverview Sync local NotebookLM session to Cloudflare KV.
 * Launches a lightweight WebKit (Safari) browser for login,
 * extracts cookies, and pushes them to KV for instant Worker pickup.
 * Requirements: playwright, wrangler
 */

import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import readline from "node:readline";
import { webkit } from "playwright";

// --- CONFIGURATION ---
const KV_KEY = "ACTIVE_NOTEBOOKLM_SESSION";
const SESSION_DIR = join(homedir(), ".notebooklm");
const SESSION_PATH = join(SESSION_DIR, "session.json");

async function manualLogin() {
  console.log("🔐 Launching Safari (WebKit) for NotebookLM login...");

  const browser = await webkit.launch({
    headless: false,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.goto("https://notebooklm.google.com/");

  console.log("\n" + "=".repeat(60));
  console.log("👉 ACTION REQUIRED: Log in with your Google account.");
  console.log("👉 Once you see the NotebookLM dashboard, return here.");
  console.log("=".repeat(60) + "\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question("Press [ENTER] here once the session is ready: ", async () => {
      const cookies = await context.cookies();
      const sessionData = { cookies };

      if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true });
      writeFileSync(SESSION_PATH, JSON.stringify(sessionData, null, 2));

      console.log(`✅ Session extracted (${cookies.length} cookies) → ${SESSION_PATH}`);
      await browser.close();
      rl.close();
      resolve();
    });
  });
}

async function main() {
  const useStdin = process.argv.includes("--stdin");
  const forceLogin = process.argv.includes("--login");
  let cookieString = "";

  if (useStdin) {
    console.log("🔑 Reading cookies from stdin...");
    cookieString = readFileSync(0, "utf-8").trim();
  } else {
    // Trigger login if session is missing or --login flag is passed
    if (!existsSync(SESSION_PATH) || forceLogin) {
      await manualLogin();
    }

    const raw = readFileSync(SESSION_PATH, "utf-8");
    let session;
    try {
      session = JSON.parse(raw);
    } catch {
      session = raw.trim();
    }

    // Format for the Worker cookie header
    if (session && typeof session === "object" && Array.isArray(session.cookies)) {
      cookieString = session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    } else if (typeof session === "string") {
      cookieString = session;
    }
  }

  if (cookieString.length < 20) {
    console.error("❌ Cookie string is invalid. Try: pnpm run session:sync -- --login");
    process.exit(1);
  }

  console.log(`⬆️  Syncing to Cloudflare KV [${KV_KEY}]...`);
  try {
    const escaped = cookieString.replace(/'/g, "'\\''");
    execSync(`npx wrangler@latest kv key put --binding=KV "${KV_KEY}" '${escaped}'`, {
      stdio: "inherit",
    });
    console.log("✅ Sync complete. Session is live on your Worker.");
  } catch {
    console.error("❌ KV Write failed. Ensure you are logged in: 'npx wrangler login'");
    process.exit(1);
  }
}

main().catch(console.error);
