import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const CAREER_MODEL_ASSUMPTIONS_TABLE_DESCRIPTION =
  "Configurable projection parameters for the career pivot trajectory and salary modelling.";

export const CAREER_MODEL_ASSUMPTIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  key: "Assumption key (e.g., 'time_in_level:senior') (Primary Key).",
  value: "Numeric value of the assumption (e.g., 3.0).",
  rationale: "Reasoning or source for this assumption.",
  updated_at: "ISO-8601 timestamp of last update.",
};

export const careerModelAssumptions = sqliteTable(
  "career_model_assumptions",
  {
    key: text("key").primaryKey(),
    value: real("value").notNull(),
    rationale: text("rationale"),
    updatedAt: text("updated_at").notNull(),
  }
);

export const insertCareerModelAssumptionSchema = createInsertSchema(careerModelAssumptions);
export const selectCareerModelAssumptionSchema = createSelectSchema(careerModelAssumptions);
export type CareerModelAssumption = typeof careerModelAssumptions.$inferSelect;
export type NewCareerModelAssumption = typeof careerModelAssumptions.$inferInsert;
