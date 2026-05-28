import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const COMPANY_SEGMENTS_TABLE_DESCRIPTION =
  "Company taxonomy classifying companies into segments for salary benchmarking peers.";

export const COMPANY_SEGMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  company_name: "Lowercased company name (Primary Key).",
  segment: "Company segment: faang, big_tech, public_mid_cap, late_stage_private, early_stage_startup, non_tech_enterprise, consulting, finance, unknown.",
  classified_at: "ISO-8601 timestamp of classification.",
  classifier_version: "Version of the classifier model or heuristic used.",
};

export const companySegments = sqliteTable(
  "company_segments",
  {
    companyName: text("company_name").primaryKey(),
    segment: text("segment", {
      enum: [
        "faang",
        "big_tech",
        "public_mid_cap",
        "late_stage_private",
        "early_stage_startup",
        "non_tech_enterprise",
        "consulting",
        "finance",
        "unknown",
      ],
    }).notNull(),
    classifiedAt: text("classified_at").notNull(),
    classifierVersion: text("classifier_version").notNull(),
  },
  (table) => ({
    segmentIdx: index("company_segments_segment_idx").on(table.segment),
  })
);

export const insertCompanySegmentSchema = createInsertSchema(companySegments);
export const selectCompanySegmentSchema = createSelectSchema(companySegments);
export type CompanySegment = typeof companySegments.$inferSelect;
export type NewCompanySegment = typeof companySegments.$inferInsert;
