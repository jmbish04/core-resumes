import { getDb } from "@/backend/db";
import { logs } from "@/backend/db/schema";

export class Logger {
  constructor(private env: Env) {}

  private async log(level: "info" | "warn" | "error" | "debug", message: string, metadata?: Record<string, unknown>) {
    // 1. Mirror to console
    const consoleMsg = metadata ? `${message} ${JSON.stringify(metadata)}` : message;
    switch (level) {
      case "info":
        console.log(`[INFO] ${consoleMsg}`);
        break;
      case "warn":
        console.warn(`[WARN] ${consoleMsg}`);
        break;
      case "error":
        console.error(`[ERROR] ${consoleMsg}`);
        break;
      case "debug":
        console.debug(`[DEBUG] ${consoleMsg}`);
        break;
    }

    // 2. Insert to D1
    try {
      const db = getDb(this.env);
      await db.insert(logs).values({
        id: crypto.randomUUID(),
        level,
        message,
        metadata: metadata || null,
        createdAt: new Date(),
      });
    } catch (dbError) {
      // Fallback if DB insertion fails to prevent crashing the worker
      console.error(`[LOGGER_DB_ERROR] Failed to insert log to D1: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
    }
  }

  public async info(message: string, metadata?: Record<string, unknown>) {
    await this.log("info", message, metadata);
  }

  public async warn(message: string, metadata?: Record<string, unknown>) {
    await this.log("warn", message, metadata);
  }

  public async error(message: string, metadata?: Record<string, unknown>) {
    await this.log("error", message, metadata);
  }

  public async debug(message: string, metadata?: Record<string, unknown>) {
    await this.log("debug", message, metadata);
  }
}
