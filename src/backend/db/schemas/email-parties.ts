import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { emails } from "./emails";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `email_parties` table for the documentation UI. */
export const EMAIL_PARTIES_TABLE_DESCRIPTION =
  "Tracks every participant (FROM, TO, CC, BCC) of an inbound email. Used for allowed-email gating and domain-based role matching.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const EMAIL_PARTIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  email_id: "Foreign key to the parent email record. Cascade-deleted when the email is removed.",
  type: "Party role in the email: from, to, cc, or bcc.",
  name: "Display name of the party (e.g., 'Jane Doe'). Null if not provided.",
  address: "Email address of the party (e.g., 'jane@acme.com').",
  domain: "Domain extracted from the email address (e.g., 'acme.com').",
  is_self:
    "Whether this party matches one of the allowed email addresses (justin@126colby.com, jmbish04@gmail.com). 1 = self, 0 = external.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const emailParties = sqliteTable(
  "email_parties",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["from", "to", "cc", "bcc"] }).notNull(),
    name: text("name"),
    address: text("address").notNull(),
    domain: text("domain").notNull(),
    isSelf: integer("is_self", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    emailIdIdx: index("email_parties_email_id_idx").on(table.emailId),
    domainIdx: index("email_parties_domain_idx").on(table.domain),
    isSelfIdx: index("email_parties_is_self_idx").on(table.isSelf),
  }),
);

export const insertEmailPartySchema = createInsertSchema(emailParties);
export const selectEmailPartySchema = createSelectSchema(emailParties);
export type EmailParty = typeof emailParties.$inferSelect;
export type NewEmailParty = typeof emailParties.$inferInsert;
