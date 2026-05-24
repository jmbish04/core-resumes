import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";

function getLocalD1DB() {
  try {
    const basePath = path.resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
    if (!fs.existsSync(basePath)) {
      return "";
    }
    const dbFile = fs
      .readdirSync(basePath)
      .find((x) => x.endsWith(".sqlite") && x !== "metadata.sqlite");

    if (!dbFile) {
      return "";
    }

    return path.resolve(basePath, dbFile);
  } catch (err) {
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
