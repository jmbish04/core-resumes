import fs from "node:fs";
import path from "node:path";

const DRIZZLE_DIR = path.resolve(process.cwd(), "drizzle");

const postProcessMigrations = () => {
  try {
    if (!fs.existsSync(DRIZZLE_DIR)) {
      console.warn(`[post-drizzle] Migration directory not found at: ${DRIZZLE_DIR}`);
      return;
    }

    const files = fs.readdirSync(DRIZZLE_DIR);
    const sqlFiles = files.filter(f => f.endsWith(".sql") && f !== "seed-statuses.sql");

    let processedCount = 0;

    for (const file of sqlFiles) {
      const filePath = path.join(DRIZZLE_DIR, file);
      let content = fs.readFileSync(filePath, "utf-8");
      let modified = false;

      // 1. Enforce IF NOT EXISTS on CREATE TABLE
      const tableRegex = /CREATE TABLE\s+(?!IF\s+NOT\s+EXISTS\s+)(\`[^\`]+\`|"[^"]+"|\w+)/gi;
      if (tableRegex.test(content)) {
        content = content.replace(tableRegex, "CREATE TABLE IF NOT EXISTS $1");
        modified = true;
      }

      // 2. Enforce IF NOT EXISTS on CREATE INDEX or CREATE UNIQUE INDEX
      const indexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS\s+)(\`[^\`]+\`|"[^"]+"|\w+)/gi;
      if (indexRegex.test(content)) {
        content = content.replace(indexRegex, "CREATE $1INDEX IF NOT EXISTS $2");
        modified = true;
      }

      if (modified) {
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`[post-drizzle] Enforced 'IF NOT EXISTS' in: ${file}`);
        processedCount++;
      }
    }

    console.log(`[post-drizzle] Completed! Post-processed ${processedCount} migration files.`);
  } catch (error) {
    console.error("[post-drizzle] Failed to post-process Drizzle migrations:", error);
  }
};

postProcessMigrations();
