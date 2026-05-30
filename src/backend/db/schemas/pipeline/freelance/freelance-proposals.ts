/**
 * @file Schema for freelance proposals — cover letters and bids per opportunity.
 *
 * Each row tracks a proposal drafted (and optionally submitted) for a
 * freelance opportunity. Supports version tracking, generation metadata,
 * and lifecycle status from draft through acceptance.
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "../../applications/roles";
import { freelanceOpportunities } from "./freelance-opportunities";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `freelance_proposals` table for the documentation UI. */
export const FREELANCE_PROPOSALS_TABLE_DESCRIPTION =
  "AI-generated proposals and bids for freelance opportunities. Tracks cover letter versions, bid amounts, submission status, and generation metadata.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FREELANCE_PROPOSALS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  opportunity_id: "FK to freelance_opportunities. The opportunity this proposal targets.",
  role_id: "Optional FK to roles. Links this proposal to an existing role for context reuse.",
  bid_amount: "Proposed bid amount in bid_currency.",
  bid_currency: "ISO 4217 currency for the bid. Defaults to USD.",
  cover_letter: "Full text of the proposal cover letter.",
  cover_letter_version: "Revision number for the cover letter. Starts at 1.",
  key_selling_points: "JSON array of key differentiators highlighted in the proposal.",
  estimated_timeline: "Proposed timeline for completing the work.",
  status:
    "Lifecycle status — draft, submitted, viewed, shortlisted, interview, accepted, rejected, or withdrawn.",
  generation_tier: "AI generation strategy — 'lightweight' (fast) or 'full' (deep pipeline).",
  ai_model: "AI model identifier used to generate the proposal.",
  generation_context: "JSON object with prompt context and parameters used during generation.",
  submitted_at: "Unix timestamp of when the proposal was submitted to the platform.",
  created_at: "Unix timestamp of when this row was created.",
  updated_at: "Unix timestamp of the last update to this row.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const freelanceProposals = sqliteTable(
  "freelance_proposals",
  {
    id: text("id").primaryKey(),
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => freelanceOpportunities.id, { onDelete: "cascade" }),
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    bidAmount: real("bid_amount").notNull(),
    bidCurrency: text("bid_currency").default("USD"),
    coverLetter: text("cover_letter").notNull(),
    coverLetterVersion: integer("cover_letter_version").default(1),
    keySellingPoints: text("key_selling_points", { mode: "json" }).$type<string[]>(),
    estimatedTimeline: text("estimated_timeline"),
    status: text("status", {
      enum: [
        "draft",
        "submitted",
        "viewed",
        "shortlisted",
        "interview",
        "accepted",
        "rejected",
        "withdrawn",
      ],
    })
      .notNull()
      .default("draft"),
    generationTier: text("generation_tier", {
      enum: ["lightweight", "full"],
    }).notNull(),
    aiModel: text("ai_model"),
    generationContext: text("generation_context", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    opportunityIdIdx: index("freelance_proposals_opportunity_id_idx").on(table.opportunityId),
    roleIdIdx: index("freelance_proposals_role_id_idx").on(table.roleId),
    statusIdx: index("freelance_proposals_status_idx").on(table.status),
    createdAtIdx: index("freelance_proposals_created_at_idx").on(table.createdAt),
  }),
);

export const insertFreelanceProposalSchema = createInsertSchema(freelanceProposals);
export const selectFreelanceProposalSchema = createSelectSchema(freelanceProposals);
export type FreelanceProposal = typeof freelanceProposals.$inferSelect;
export type NewFreelanceProposal = typeof freelanceProposals.$inferInsert;
