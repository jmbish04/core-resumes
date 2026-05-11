import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

function getLocalD1DB() {
  try {
    const basePath = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
    const dbFile = fs
      .readdirSync(basePath)
      .find((x) => x.endsWith(".sqlite") && x !== "metadata.sqlite");

    if (!dbFile) {
      console.warn("⚠️ No local D1 database found in .wrangler/state. You may need to run `pnpm run dev` first.");
      return "";
    }

    return path.resolve(basePath, dbFile);
  } catch (err) {
    console.warn(`⚠️ Error finding local D1 db: ${err}`);
    return "";
  }
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/backend/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: getLocalD1DB(),
  },
});
