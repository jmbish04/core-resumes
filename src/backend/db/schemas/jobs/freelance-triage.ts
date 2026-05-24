/**
 * @file Schema for freelance triage — AI bid/skip decisions per opportunity.
 *
 * Each row captures the AI's decision on whether to bid on a freelance
 * opportunity, including confidence scores, skill gap analysis, and
 * recommended bid strategy.
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { freelanceOpportunities } from "./freelance-opportunities";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `freelance_triage` table for the documentation UI. */
export const FREELANCE_TRIAGE_TABLE_DESCRIPTION =
  "AI triage decisions for freelance opportunities. Stores bid/skip verdicts with confidence scores, skill matching, and recommended bid strategy.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FREELANCE_TRIAGE_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  opportunity_id: "FK to freelance_opportunities. The opportunity being triaged.",
  decision: "AI verdict — 'bid', 'skip', 'pending', or 'manual_review'.",
  confidence: "Confidence in the decision, 0.0–1.0.",
  rationale: "AI-generated explanation for the triage decision.",
  skills_matched: "JSON array of skills the candidate possesses that match the listing.",
  skills_missing: "JSON array of required skills the candidate lacks.",
  budget_match: "Assessment of whether the budget aligns with rate expectations.",
  competition_assessment: "Assessment of competitive landscape based on proposals/bids.",
  win_probability: "Estimated probability of winning the bid, 0.0–1.0.",
  recommended_bid: "Suggested bid amount in recommended_bid_currency.",
  recommended_bid_currency: "ISO 4217 currency for the recommended bid. Defaults to USD.",
  bid_strategy: "AI-suggested approach for the proposal (e.g. 'undercut', 'premium', 'value').",
  model_used: "AI model identifier used for this triage decision.",
  decided_at: "Unix timestamp of when the triage decision was made.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const freelanceTriage = sqliteTable(
  "freelance_triage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => freelanceOpportunities.id, { onDelete: "cascade" }),
    decision: text("decision", {
      enum: ["bid", "skip", "pending", "manual_review"],
    }).notNull(),
    confidence: real("confidence").notNull(),
    rationale: text("rationale").notNull(),
    skillsMatched: text("skills_matched", { mode: "json" }).$type<string[]>(),
    skillsMissing: text("skills_missing", { mode: "json" }).$type<string[]>(),
    budgetMatch: text("budget_match"),
    competitionAssessment: text("competition_assessment"),
    winProbability: real("win_probability"),
    recommendedBid: real("recommended_bid"),
    recommendedBidCurrency: text("recommended_bid_currency").default("USD"),
    bidStrategy: text("bid_strategy"),
    modelUsed: text("model_used").notNull(),
    decidedAt: integer("decided_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    opportunityIdIdx: index("freelance_triage_opportunity_id_idx").on(table.opportunityId),
    decisionIdx: index("freelance_triage_decision_idx").on(table.decision),
    decidedAtIdx: index("freelance_triage_decided_at_idx").on(table.decidedAt),
  }),
);

export const insertFreelanceTriageSchema = createInsertSchema(freelanceTriage);
export const selectFreelanceTriageSchema = createSelectSchema(freelanceTriage);
export type FreelanceTriage = typeof freelanceTriage.$inferSelect;
export type NewFreelanceTriage = typeof freelanceTriage.$inferInsert;
