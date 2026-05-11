/**
 * @fileoverview Verify @cloudflare/sandbox SDK version and synchronize
 * Dockerfile image tags.
 *
 * Runs as part of `pnpm run deploy` to ensure the npm package and Docker
 * image versions always match. Ported from core-github-api.
 */

import { execSync } from "child_process";
import fs from "fs";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log(
  "[Sandbox Check] Verifying @cloudflare/sandbox SDK version and checking for updates...",
);

const cwd = process.cwd();

// 1. Get the currently installed version of @cloudflare/sandbox
let installedVersion = "";
try {
  // Try resolving from the current working directory first, fallback to script directory
  const pkgPath = path.resolve(cwd, "node_modules/@cloudflare/sandbox/package.json");
  const pkgStr = fs.readFileSync(pkgPath, "utf8");
  installedVersion = JSON.parse(pkgStr).version;
} catch (error) {
  try {
    const fallbackPkgPath = path.join(
      __dirname,
      "../node_modules/@cloudflare/sandbox/package.json",
    );
    const fallbackPkgStr = fs.readFileSync(fallbackPkgPath, "utf8");
    installedVersion = JSON.parse(fallbackPkgStr).version;
  } catch (fallbackError) {
    console.error(
      "[Sandbox Check] Error: Could not resolve @cloudflare/sandbox/package.json. Run pnpm install first?",
    );
    process.exit(1);
  }
}

// 2. Recursively find all Dockerfiles in the current working directory
function findDockerfiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    // Skip heavy or irrelevant directories
    if (
      ["node_modules", ".git", ".wrangler", "dist", "build", ".next", ".svelte-kit"].includes(file)
    )
      continue;

    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        findDockerfiles(filePath, fileList);
      } else if (file === "Dockerfile" || file.endsWith(".Dockerfile")) {
        fileList.push(filePath);
      }
    } catch (e) {
      // Ignore files that cannot be read due to permissions
    }
  }
  return fileList;
}

// 3. Check for SDK updates
let latestVersionStr = installedVersion;
try {
  latestVersionStr = execSync("pnpm info @cloudflare/sandbox version", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  }).trim();
} catch (error) {
  console.log(
    "[Sandbox Check] Could not check for updates (network issue or pnpm not configured). Proceeding with local validation.",
  );
}

const isUpdateAvailable = latestVersionStr && latestVersionStr !== installedVersion;
const targetVersion = isUpdateAvailable ? latestVersionStr : installedVersion;

if (isUpdateAvailable) {
  console.log(
    `\n[Sandbox Check] ⚠️  NEW VERSION AVAILABLE: v${targetVersion} (Current: v${installedVersion})`,
  );
  console.log(`[Sandbox Check] Automating the recommended update process...`);

  try {
    console.log(`[Sandbox Check] Running: pnpm add -w @cloudflare/sandbox@${targetVersion}`);
    execSync(`pnpm add -w @cloudflare/sandbox@${targetVersion}`, { stdio: "inherit" });
    console.log(`[Sandbox Check] Package successfully updated to v${targetVersion}.`);
  } catch (e) {
    console.error(
      `[Sandbox Check] Failed to run pnpm add. Please run: pnpm add @cloudflare/sandbox@${targetVersion}`,
    );
  }
} else {
  console.log(`[Sandbox Check] SDK is up to date (v${installedVersion}).`);
}

// 4. Update Dockerfiles to match the target version
console.log("[Sandbox Check] Scanning for Dockerfile(s) to synchronize image tags...");
const dockerfiles = findDockerfiles(cwd);

if (dockerfiles.length === 0) {
  console.warn(
    "[Sandbox Check] Warning: Could not find any Dockerfiles in the current working directory.",
  );
} else {
  let updatedCount = 0;

  for (const filePath of dockerfiles) {
    let fileContent = fs.readFileSync(filePath, "utf-8");
    let hasChanges = false;

    const lines = fileContent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match the Cloudflare Sandbox Docker image format
      if (line.startsWith("FROM docker.io/cloudflare/sandbox:")) {
        const match = line.match(/cloudflare\/sandbox:([0-9\.]+)(?:-\w+)?/);
        if (match) {
          const dockerfileVersion = match[1];
          // If the version in the Dockerfile doesn't match our target version, update it
          if (dockerfileVersion !== targetVersion) {
            console.log(
              `  -> Updating ${path.relative(cwd, filePath)} line ${i + 1}: v${dockerfileVersion} -> v${targetVersion}`,
            );
            // Replace the version string but keep any optional variant suffixes intact (e.g., -python)
            lines[i] = line.replace(/(cloudflare\/sandbox:)[0-9\.]+/, `$1${targetVersion}`);
            hasChanges = true;
          }
        }
      }
    }

    // Save the file if we made modifications
    if (hasChanges) {
      fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
      updatedCount++;
    }
  }

  if (updatedCount > 0) {
    console.log(
      `\n[Sandbox Check] Passed ✅ : Successfully updated and synced ${updatedCount} Dockerfile(s) with SDK v${targetVersion}`,
    );
  } else {
    console.log(
      `\n[Sandbox Check] Passed ✅ : All ${dockerfiles.length} Dockerfile(s) are already synced with SDK v${targetVersion}`,
    );
  }
}
