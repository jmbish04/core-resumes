// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const site = process.env.SITE ?? "http://localhost:4321";
const base = process.env.BASE || "/";

import { fileURLToPath } from "node:url";

// https://astro.build/config
export default defineConfig({
  site,
  srcDir: "./src/frontend",
  base,
  output: "server",
  adapter: cloudflare({
    imageService: "cloudflare",
    platformProxy: {
      enabled: true,
    },
    sessionKVBindingName: "SESSIONS",
    workerEntryPoint: {
      path: "src/_worker.ts",
      namedExports: [
        "OrchestratorAgent",
        "NotebookLMAgent",
        "NotebookLMMcpAgent",
        "CoreResumesMcpAgent",
        "TranscriptionAgent",
        "RoleAssetsWorkflow",
        "RoleAnalysisWorkflow",
        "Sandbox",
        "JobScannerAgent",
        "JobAnalysisAgent",
        "SyncBroadcastAgent",
        "RoleChatAgent",
        "SalaryAgent",
        "FreelanceScannerAgent",
      ],
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: [
        // Backend-specific aliases — must come BEFORE the general "@" catch-all
        {
          find: "@/backend",
          replacement: fileURLToPath(new URL("./src/backend", import.meta.url)),
        },
        {
          find: "@/db",
          replacement: fileURLToPath(new URL("./src/backend/db", import.meta.url)),
        },
        {
          find: "@/ai",
          replacement: fileURLToPath(new URL("./src/backend/ai", import.meta.url)),
        },
        {
          find: "@/utils",
          replacement: fileURLToPath(new URL("./src/backend/utils", import.meta.url)),
        },
        {
          find: "@/services",
          replacement: fileURLToPath(new URL("./src/backend/services", import.meta.url)),
        },
        {
          find: "@/email",
          replacement: fileURLToPath(new URL("./src/backend/email", import.meta.url)),
        },
        {
          find: "@/logging",
          replacement: fileURLToPath(new URL("./src/backend/logging", import.meta.url)),
        },
        {
          find: "@/modules",
          replacement: fileURLToPath(new URL("./src/backend/modules", import.meta.url)),
        },
        {
          find: "@/health",
          replacement: fileURLToPath(new URL("./src/backend/health", import.meta.url)),
        },
        // General @ prefix — maps to frontend (must be last)
        {
          find: "@",
          replacement: fileURLToPath(new URL("./src/frontend", import.meta.url)),
        },
        // Library shims
        { find: "playwright", replacement: "@cloudflare/playwright" },
      ],
    },
    ssr: {
      external: [
        "node:async_hooks",
        "node:assert",
        "node:buffer",
        "node:constants",
        "node:crypto",
        "node:diagnostics_channel",
        "node:dns",
        "node:events",
        "node:fs",
        "node:fs/promises",
        "node:http",
        "node:http2",
        "node:https",
        "node:net",
        "node:os",
        "node:path",
        "node:path/posix",
        "node:stream",
        "node:tls",
        "node:url",
        "node:util",
        "node:zlib",
        "assert",
        "buffer",
        "crypto",
        "events",
        "fs",
        "os",
        "path",
        "stream",
        "util",
      ],
    },
  },
});
