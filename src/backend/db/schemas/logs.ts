import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const logs = sqliteTable("logs", {
  id: text("id").primaryKey(),
  level: text("level").notNull(), // 'info', 'warn', 'error', 'debug'
  message: text("message").notNull(),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
