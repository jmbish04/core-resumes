import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, and, isNotNull } from "drizzle-orm";
import { getDb } from "@/backend/db";
import { AiProvider } from "@/backend/ai/providers";
import {
  companySegments,
  costOfLivingIndex,
  geoLocations,
  geoLocationMetaDefinitions,
  geoLocationMappings,
  marketCompanySalaries,
  roleFamilyTaxonomy,
  roles,
  careerModelAssumptions,
} from "@/backend/db/schema";

export const seedSalaryRefactorRouter = new OpenAPIHono<{ Bindings: Env }>();

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/company-segments",
    operationId: "seedCompanySegments",
    responses: {
      200: { description: "Seeded company segments", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const provider = new AiProvider(c.env);

    // Get unique companies
    const fromRoles = await db
      .select({ name: roles.companyName })
      .from(roles)
      .where(isNotNull(roles.companyName));
    const fromMarket = await db
      .select({ name: marketCompanySalaries.companyName })
      .from(marketCompanySalaries);

    const allNames = [...fromRoles.map(r => r.name), ...fromMarket.map(m => m.name)];
    // Canonicalize and deduplicate
    const uniqueNames = [...new Set(allNames.map(n => n.toLowerCase().trim()))].filter(Boolean);
    // Take top 100 for now to avoid massive LLM calls. In real scenario, we might batch.
    const batch = uniqueNames.slice(0, 100);

    const prompt = `Classify the following company names into one of these segments:
    faang, big_tech, public_mid_cap, late_stage_private, early_stage_startup, non_tech_enterprise, consulting, finance, unknown.
    If you don't recognize the company, or it's ambiguous, use "unknown".
    Companies to classify:
    ${JSON.stringify(batch)}

    Output exactly JSON array of objects with { "name": string, "segment": string }`;

    const result = await provider.generateStructuredOutput({
      messages: [{ role: "user", content: prompt }],
      schema: z.array(z.object({ name: z.string(), segment: z.string() })),
      schemaName: "CompanySegments",
    });

    const now = new Date().toISOString();
    const values = result.map((r: any) => ({
      companyName: r.name,
      segment: r.segment,
      classifiedAt: now,
      classifierVersion: "gpt-oss-120b-seed-v1",
    }));

    // D1 caps bound parameters at 100 per query; 4 cols/row → chunk at 20 rows (80 params).
    for (let i = 0; i < values.length; i += 20) {
      await db.insert(companySegments).values(values.slice(i, i + 20)).onConflictDoNothing().run();
    }

    return c.json({ seeded: values.length, totalUnique: uniqueNames.length }, 200);
  }
);

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/col-index",
    operationId: "seedColIndex",
    responses: {
      200: { description: "Seeded COL index + geo data", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const rawDb = c.env.DB;
    const now = new Date();
    const nowIso = now.toISOString();
    const nowUnix = Math.floor(now.getTime() / 1000);

    const counts = { metros: 0, countries: 0, microHubs: 0, eavMappings: 0, legacyCOL: 0 };

    // ─── 1. Upsert EAV meta definition for COL index ───
    const [existingColDef] = await db
      .select()
      .from(geoLocationMetaDefinitions)
      .where(eq(geoLocationMetaDefinitions.key, "cost_of_living_index"))
      .limit(1);

    let colMetaId: number;
    if (existingColDef) {
      colMetaId = existingColDef.id;
    } else {
      const defResult = await rawDb
        .prepare(
          `INSERT INTO geo_location_meta_definitions (key, label, description, value_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          "cost_of_living_index",
          "Cost of Living Index",
          "BLS-sourced multiplier for cross-market salary normalization. 1.00 = national baseline.",
          "number",
          nowUnix,
          nowUnix,
        )
        .run();
      colMetaId = defResult.meta.last_row_id as number;
    }

    // ─── 2. Upsert metros with coordinates ───
    const metros = [
      { metro: "San Francisco, CA", colIndex: 1.34, lat: 37.7749, lng: -122.4194, region: "CA", city: "San Francisco" },
      { metro: "New York, NY", colIndex: 1.29, lat: 40.7128, lng: -74.006, region: "NY", city: "New York" },
      { metro: "Seattle, WA", colIndex: 1.15, lat: 47.6062, lng: -122.3321, region: "WA", city: "Seattle" },
      { metro: "Austin, TX", colIndex: 1.05, lat: 30.2672, lng: -97.7431, region: "TX", city: "Austin" },
      { metro: "Los Angeles, CA", colIndex: 1.25, lat: 34.0522, lng: -118.2437, region: "CA", city: "Los Angeles" },
      { metro: "Chicago, IL", colIndex: 1.05, lat: 41.8781, lng: -87.6298, region: "IL", city: "Chicago" },
      { metro: "Boston, MA", colIndex: 1.20, lat: 42.3601, lng: -71.0589, region: "MA", city: "Boston" },
      { metro: "Denver, CO", colIndex: 1.05, lat: 39.7392, lng: -104.9903, region: "CO", city: "Denver" },
      { metro: "Atlanta, GA", colIndex: 1.00, lat: 33.749, lng: -84.388, region: "GA", city: "Atlanta" },
      { metro: "Washington, DC", colIndex: 1.18, lat: 38.9072, lng: -77.0369, region: "DC", city: "Washington" },
      { metro: "Dallas, TX", colIndex: 1.02, lat: 32.7767, lng: -96.797, region: "TX", city: "Dallas" },
      { metro: "San Diego, CA", colIndex: 1.22, lat: 32.7157, lng: -117.1611, region: "CA", city: "San Diego" },
      { metro: "Remote", colIndex: 1.00, lat: 39.5, lng: -98.5, region: null, city: null },
    ];

    for (const m of metros) {
      // Upsert the canonical metro record (geo_locations.metro is uniquely indexed)
      await db
        .insert(geoLocations)
        .values({
          type: "metro",
          name: m.metro,
          metro: m.metro,
          country: "US",
          region: m.region,
          city: m.city,
          lat: m.lat,
          lng: m.lng,
        })
        .onConflictDoNothing()
        .run();

      // Retrieve the ID (may have been pre-existing)
      const [geo] = await db
        .select({ id: geoLocations.id })
        .from(geoLocations)
        .where(eq(geoLocations.metro, m.metro))
        .limit(1);

      if (geo) {
        // Update coords/region/city if they were missing on a pre-existing record
        await db
          .update(geoLocations)
          .set({
            lat: m.lat,
            lng: m.lng,
            country: "US",
            region: m.region,
            city: m.city,
            updatedAt: now,
          })
          .where(eq(geoLocations.id, geo.id));

        // Upsert EAV COL value
        const [existingMapping] = await db
          .select()
          .from(geoLocationMappings)
          .where(
            and(
              eq(geoLocationMappings.geoId, geo.id),
              eq(geoLocationMappings.metaId, colMetaId),
            ),
          )
          .limit(1);

        if (existingMapping) {
          await db
            .update(geoLocationMappings)
            .set({ value: String(m.colIndex), source: "BLS 2024", asOf: nowIso, updatedAt: now })
            .where(eq(geoLocationMappings.id, existingMapping.id));
        } else {
          await db.insert(geoLocationMappings).values({
            geoId: geo.id,
            metaId: colMetaId,
            value: String(m.colIndex),
            source: "BLS 2024",
            asOf: nowIso,
          });
        }
        counts.eavMappings++;

        // Legacy cost_of_living_index table (backward compat)
        await db
          .insert(costOfLivingIndex)
          .values({ metro: m.metro, geoId: geo.id, colIndex: m.colIndex, source: "BLS 2024", asOf: nowIso })
          .onConflictDoUpdate({
            target: costOfLivingIndex.metro,
            set: { geoId: geo.id, colIndex: m.colIndex, source: "BLS 2024", asOf: nowIso },
          })
          .run();
        counts.legacyCOL++;
      }

      counts.metros++;
    }

    // ─── 3. Upsert country centroids ───
    const countries: Array<{ code: string; name: string; lat: number; lng: number }> = [
      { code: "US", name: "United States", lat: 37.09, lng: -95.71 },
      { code: "GB", name: "United Kingdom", lat: 55.38, lng: -3.44 },
      { code: "AU", name: "Australia", lat: -25.27, lng: 133.78 },
      { code: "DE", name: "Germany", lat: 51.17, lng: 10.45 },
      { code: "CA", name: "Canada", lat: 56.13, lng: -106.35 },
      { code: "IN", name: "India", lat: 20.59, lng: 78.96 },
      { code: "PK", name: "Pakistan", lat: 30.38, lng: 69.35 },
      { code: "BD", name: "Bangladesh", lat: 23.68, lng: 90.36 },
      { code: "PH", name: "Philippines", lat: 12.88, lng: 121.77 },
      { code: "UA", name: "Ukraine", lat: 48.38, lng: 31.17 },
      { code: "BR", name: "Brazil", lat: -14.24, lng: -51.93 },
      { code: "FR", name: "France", lat: 46.23, lng: 2.21 },
      { code: "NL", name: "Netherlands", lat: 52.13, lng: 5.29 },
      { code: "ES", name: "Spain", lat: 40.46, lng: -3.75 },
      { code: "IT", name: "Italy", lat: 41.87, lng: 12.57 },
      { code: "PL", name: "Poland", lat: 51.92, lng: 19.15 },
      { code: "RO", name: "Romania", lat: 45.94, lng: 24.97 },
      { code: "EG", name: "Egypt", lat: 26.82, lng: 30.80 },
      { code: "NG", name: "Nigeria", lat: 9.08, lng: 8.68 },
      { code: "KE", name: "Kenya", lat: -0.02, lng: 37.91 },
      { code: "ZA", name: "South Africa", lat: -30.56, lng: 22.94 },
      { code: "AR", name: "Argentina", lat: -38.42, lng: -63.62 },
      { code: "MX", name: "Mexico", lat: 23.63, lng: -102.55 },
      { code: "SG", name: "Singapore", lat: 1.35, lng: 103.82 },
      { code: "AE", name: "UAE", lat: 23.42, lng: 53.85 },
      { code: "IL", name: "Israel", lat: 31.05, lng: 34.85 },
      { code: "JP", name: "Japan", lat: 36.20, lng: 138.25 },
      { code: "CN", name: "China", lat: 35.86, lng: 104.20 },
      { code: "KR", name: "South Korea", lat: 35.91, lng: 127.77 },
      { code: "SE", name: "Sweden", lat: 60.13, lng: 18.64 },
      { code: "NO", name: "Norway", lat: 60.47, lng: 8.47 },
      { code: "DK", name: "Denmark", lat: 56.26, lng: 9.50 },
      { code: "FI", name: "Finland", lat: 61.92, lng: 25.75 },
      { code: "CH", name: "Switzerland", lat: 46.82, lng: 8.23 },
      { code: "AT", name: "Austria", lat: 47.52, lng: 14.55 },
      { code: "BE", name: "Belgium", lat: 50.50, lng: 4.47 },
      { code: "NZ", name: "New Zealand", lat: -40.90, lng: 174.89 },
      { code: "PT", name: "Portugal", lat: 39.40, lng: -8.22 },
      { code: "CZ", name: "Czech Republic", lat: 49.82, lng: 15.47 },
      { code: "RS", name: "Serbia", lat: 44.02, lng: 21.01 },
      { code: "HR", name: "Croatia", lat: 45.10, lng: 15.20 },
      { code: "TR", name: "Turkey", lat: 38.96, lng: 35.24 },
      { code: "RU", name: "Russia", lat: 61.52, lng: 105.32 },
      { code: "ID", name: "Indonesia", lat: -0.79, lng: 113.92 },
      { code: "VN", name: "Vietnam", lat: 14.06, lng: 108.28 },
      { code: "TH", name: "Thailand", lat: 15.87, lng: 100.99 },
      { code: "MY", name: "Malaysia", lat: 4.21, lng: 101.98 },
      { code: "CL", name: "Chile", lat: -35.68, lng: -71.54 },
      { code: "CO", name: "Colombia", lat: 4.57, lng: -74.30 },
      { code: "PE", name: "Peru", lat: -9.19, lng: -75.02 },
      { code: "SA", name: "Saudi Arabia", lat: 23.89, lng: 45.08 },
      { code: "QA", name: "Qatar", lat: 25.35, lng: 51.18 },
      { code: "IE", name: "Ireland", lat: 53.14, lng: -7.69 },
      { code: "HK", name: "Hong Kong", lat: 22.40, lng: 114.11 },
      { code: "TW", name: "Taiwan", lat: 23.70, lng: 120.96 },
      { code: "LK", name: "Sri Lanka", lat: 7.87, lng: 80.77 },
    ];

    for (const ct of countries) {
      // Use name+type uniqueness for country records (no metro field)
      const [existing] = await db
        .select()
        .from(geoLocations)
        .where(
          and(
            eq(geoLocations.name, ct.name),
            eq(geoLocations.type, "country"),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(geoLocations)
          .set({ lat: ct.lat, lng: ct.lng, country: ct.code, updatedAt: now })
          .where(eq(geoLocations.id, existing.id));
      } else {
        await rawDb
          .prepare(
            `INSERT INTO geo_locations (type, name, country, lat, lng, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind("country", ct.name, ct.code, ct.lat, ct.lng, nowUnix, nowUnix)
          .run();
      }
      counts.countries++;
    }

    // ─── 4. Upsert Bay Area micro-hubs (parent_id → SF metro) ───
    const [sfGeo] = await db
      .select({ id: geoLocations.id })
      .from(geoLocations)
      .where(eq(geoLocations.metro, "San Francisco, CA"))
      .limit(1);

    const sfParentId = sfGeo?.id ?? null;

    const microHubs: Array<{ name: string; lat: number; lng: number; city: string }> = [
      { name: "Mountain View", lat: 37.3861, lng: -122.0838, city: "Mountain View" },
      { name: "Palo Alto", lat: 37.4419, lng: -122.1430, city: "Palo Alto" },
      { name: "Menlo Park", lat: 37.4530, lng: -122.1817, city: "Menlo Park" },
      { name: "Sunnyvale", lat: 37.3688, lng: -122.0363, city: "Sunnyvale" },
      { name: "Cupertino", lat: 37.3230, lng: -122.0322, city: "Cupertino" },
      { name: "Santa Clara", lat: 37.3541, lng: -121.9552, city: "Santa Clara" },
      { name: "Redwood City", lat: 37.4852, lng: -122.2364, city: "Redwood City" },
      { name: "San Mateo", lat: 37.5630, lng: -122.3255, city: "San Mateo" },
      { name: "Foster City", lat: 37.5585, lng: -122.2661, city: "Foster City" },
      { name: "Milpitas", lat: 37.4323, lng: -121.8996, city: "Milpitas" },
      { name: "Berkeley", lat: 37.8716, lng: -122.2727, city: "Berkeley" },
      { name: "Oakland", lat: 37.8044, lng: -122.2711, city: "Oakland" },
      { name: "Fremont", lat: 37.5485, lng: -121.9886, city: "Fremont" },
      { name: "Pleasanton", lat: 37.6624, lng: -121.8747, city: "Pleasanton" },
      { name: "Walnut Creek", lat: 37.9101, lng: -122.0652, city: "Walnut Creek" },
      { name: "San Jose", lat: 37.3382, lng: -121.8863, city: "San Jose" },
    ];

    for (const hub of microHubs) {
      const [existing] = await db
        .select()
        .from(geoLocations)
        .where(
          and(
            eq(geoLocations.name, hub.name),
            eq(geoLocations.type, "micro_hub"),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(geoLocations)
          .set({ lat: hub.lat, lng: hub.lng, city: hub.city, country: "US", region: "CA", parentId: sfParentId, updatedAt: now })
          .where(eq(geoLocations.id, existing.id));
      } else {
        await rawDb
          .prepare(
            `INSERT INTO geo_locations (type, name, country, region, city, lat, lng, parent_id, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind("micro_hub", hub.name, "US", "CA", hub.city, hub.lat, hub.lng, sfParentId, nowUnix, nowUnix)
          .run();
      }
      counts.microHubs++;
    }

    return c.json({
      seeded: counts,
      colMetaDefinitionId: colMetaId,
      sfParentId,
    }, 200);
  }
);

function normalizeRoleType(role: string): string {
  if (!role) return "";
  const clean = role.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  if (clean === "fullstack" || clean === "fullstackengineer" || clean === "fullstackdeveloper") return "Full Stack";
  if (clean === "frontend" || clean === "frontendengineer" || clean === "frontenddeveloper") return "Frontend";
  if (clean === "backend" || clean === "backendengineer" || clean === "backenddeveloper") return "Backend";
  if (clean === "softwareengineer" || clean === "swe" || clean === "developer" || clean === "softwaredeveloper") return "Software Engineer";
  if (clean === "legalops" || clean === "legaloperations" || clean === "legaloperationstech" || clean === "legaltechnologist") return "Legal Ops";
  if (clean === "productmanager" || clean === "pm" || clean === "productmanagement") return "Product Manager";
  if (clean === "devops" || clean === "sre" || clean === "infrastructure" || clean === "devopsengineer") return "DevOps";
  return role.split(/[ -]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function inferLevel(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("principal") || t.includes("distinguished")) return "principal";
  if (t.includes("staff")) return "staff";
  if (t.includes("senior") || t.includes("sr") || t.includes("lead")) return "senior";
  if (t.includes("junior") || t.includes("jr") || t.includes("associate")) return "junior";
  return "mid";
}

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/taxonomy",
    operationId: "seedRoleTaxonomy",
    responses: {
      200: { description: "Seeded role taxonomy", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    const fromRoles = await db.select({ title: roles.jobTitle }).from(roles).where(isNotNull(roles.jobTitle));
    const fromMarket = await db.select({ title: marketCompanySalaries.jobTitle }).from(marketCompanySalaries).where(isNotNull(marketCompanySalaries.jobTitle));
    
    const allTitles = [...fromRoles.map(r => r.title), ...fromMarket.map(m => m.title)];
    const uniqueTitles = [...new Set(allTitles.map(t => t.toLowerCase().trim()))].filter(Boolean);

    const values = uniqueTitles.map(t => ({
      rawTitle: t,
      family: normalizeRoleType(t),
      level: inferLevel(t),
    }));

    // D1 caps bound parameters at 100 per query; 3 cols/row → chunk at 30 rows (90 params).
    for (let i = 0; i < values.length; i += 30) {
      const batch = values.slice(i, i + 30);
      await db.insert(roleFamilyTaxonomy).values(batch).onConflictDoNothing().run();
    }

    return c.json({ seeded: values.length }, 200);
  }
);

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/assumptions",
    operationId: "seedCareerAssumptions",
    responses: {
      200: { description: "Seeded career assumptions", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    const seedData = [
      { key: "time_in_level:junior", value: 2.0, rationale: "Industry standard" },
      { key: "time_in_level:mid", value: 3.0, rationale: "Industry standard" },
      { key: "time_in_level:senior", value: 3.0, rationale: "Industry standard" },
      { key: "time_in_level:staff", value: 4.0, rationale: "Industry standard" },
      { key: "within_level_raise", value: 0.035, rationale: "Average annual merit increase" },
      { key: "baseline_anchor_salary", value: 150000, rationale: "Google anchor base salary" },
    ].map(r => ({ ...r, updatedAt: new Date().toISOString() }));

    await db.insert(careerModelAssumptions).values(seedData).onConflictDoNothing().run();

    return c.json({ seeded: seedData.length }, 200);
  }
);

