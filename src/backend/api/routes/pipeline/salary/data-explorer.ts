import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc } from "drizzle-orm";
import { getDb } from "../../../../db";
import {
  companySegments,
  roleFamilyTaxonomy,
  careerModelAssumptions,
  costOfLivingIndex,
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  geoLocations,
} from "../../../../db/schema";

export const dataExplorerRouter = new OpenAPIHono<{ Bindings: Env }>();

const ROW_LIMIT = 500;

dataExplorerRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary/data-explorer",
    operationId: "getSalaryDataExplorer",
    summary: "Raw seeded salary/market data for transparency",
    description:
      "Returns the raw contents of every table the salary benchmark battery reads from, so the seeded data is fully inspectable on the deployed worker.",
    responses: {
      200: {
        description: "Raw rows from the salary data tables",
        content: { "application/json": { schema: z.any() } },
      },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    try {
      const db = getDb(c.env);

      const [
        segments,
        taxonomy,
        assumptions,
        col,
        snapshots,
        stats,
        companySalaries,
        metros,
      ] = await Promise.all([
        db.select().from(companySegments).limit(ROW_LIMIT),
        db.select().from(roleFamilyTaxonomy).limit(ROW_LIMIT),
        db.select().from(careerModelAssumptions).limit(ROW_LIMIT),
        db.select().from(costOfLivingIndex).limit(ROW_LIMIT),
        db
          .select()
          .from(marketSalarySnapshots)
          .orderBy(desc(marketSalarySnapshots.runTimestamp))
          .limit(50),
        db.select().from(marketSalaryStats).limit(ROW_LIMIT),
        db.select().from(marketCompanySalaries).limit(ROW_LIMIT),
        db.select().from(geoLocations).limit(ROW_LIMIT),
      ]);

      const tables = [
        { key: "company_segments", label: "Company Segments", rows: segments },
        { key: "role_family_taxonomy", label: "Role Family Taxonomy", rows: taxonomy },
        { key: "career_model_assumptions", label: "Career Model Assumptions", rows: assumptions },
        { key: "cost_of_living_index", label: "Cost of Living Index", rows: col },
        { key: "market_salary_snapshots", label: "Market Salary Snapshots", rows: snapshots },
        { key: "market_salary_stats", label: "Market Salary Stats", rows: stats },
        { key: "market_company_salaries", label: "Market Company Salaries", rows: companySalaries },
        { key: "geo_locations", label: "Geo Locations", rows: metros },
      ].map((t) => ({ ...t, count: t.rows.length }));

      return c.json({ success: true, generatedAt: new Date().toISOString(), tables }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
);
