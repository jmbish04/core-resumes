import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const ROLE_FAMILY_TAXONOMY_TABLE_DESCRIPTION =
  "Normalization mapping from raw job titles to role families and seniorities.";

export const ROLE_FAMILY_TAXONOMY_COLUMN_DESCRIPTIONS: Record<string, string> = {
  raw_title: "Lowercased raw job title (Primary Key).",
  family: "Normalized role family (e.g., 'Software Engineer').",
  level: "Normalized seniority level (e.g., 'junior', 'mid', 'senior', 'staff', 'principal'). Derived from title, may not match actual scope.",
};

export const roleFamilyTaxonomy = sqliteTable(
  "role_family_taxonomy",
  {
    rawTitle: text("raw_title").primaryKey(),
    family: text("family").notNull(),
    level: text("level").notNull(),
  }
);

export const insertRoleFamilyTaxonomySchema = createInsertSchema(roleFamilyTaxonomy);
export const selectRoleFamilyTaxonomySchema = createSelectSchema(roleFamilyTaxonomy);
export type RoleFamilyTaxonomy = typeof roleFamilyTaxonomy.$inferSelect;
export type NewRoleFamilyTaxonomy = typeof roleFamilyTaxonomy.$inferInsert;
