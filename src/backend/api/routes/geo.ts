/**
 * @fileoverview Geo locations API — exposes the centralized geo_locations table
 * with EAV metric mappings. Serves as the single source of truth for all
 * geographic data in the Career Orchestrator.
 *
 * Endpoints:
 *   GET /api/geo/locations       — list locations with optional filters
 *   GET /api/geo/locations/list  — lightweight list for AI agent injection
 *   GET /api/geo/locations/:id   — single location with EAV mappings
 *   POST /api/geo/locations/seed — seed/upsert geo locations + EAV data
 *   POST /api/geo/locations/backfill-roles — backfill roles.geo_id from metro strings
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute, z } from "@hono/zod-openapi";
import { eq, and, sql, like } from "drizzle-orm";
import { getDb } from "../../db";
import {
  geoLocations,
  geoLocationMetaDefinitions,
  geoLocationMappings,
  roles,
} from "../../db/schema";

export const geoRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

const GeoLocationSchema = z.object({
  id: z.number(),
  type: z.string(),
  name: z.string(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  metro: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  parentId: z.number().nullable(),
  isActive: z.boolean(),
  metrics: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ description: "EAV metrics keyed by definition key" }),
});

const GeoLocationListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  country: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// GET /locations — full list with optional filters
// ---------------------------------------------------------------------------

const listRoute = createRoute({
  method: "get",
  path: "/locations",
  tags: ["Geo"],
  summary: "List geo locations",
  description: "List all geographic locations with optional type/country filters and EAV metrics.",
  request: {
    query: z.object({
      type: z.enum(["metro", "country", "micro_hub", "neighborhood"]).optional(),
      country: z.string().optional(),
      includeMetrics: z.string().optional().openapi({ description: "'true' to include EAV metrics" }),
    }),
  },
  responses: {
    200: {
      description: "List of geo locations",
      content: { "application/json": { schema: z.object({ data: z.array(GeoLocationSchema) }) } },
    },
  },
});

geoRouter.openapi(listRoute, async (c) => {
  const db = getDb(c.env);
  const { type, country, includeMetrics } = c.req.valid("query");

  const conditions = [eq(geoLocations.isActive, true)];
  if (type) conditions.push(eq(geoLocations.type, type));
  if (country) conditions.push(eq(geoLocations.country, country));

  const where = conditions.length === 1 ? conditions[0] : and(...conditions);

  const locations = await db
    .select()
    .from(geoLocations)
    .where(where!)
    .orderBy(geoLocations.type, geoLocations.name);

  if (includeMetrics === "true") {
    // Batch-fetch all EAV mappings for these locations
    const locIds = locations.map((l) => l.id);
    if (locIds.length > 0) {
      const mappings = await db
        .select({
          geoId: geoLocationMappings.geoId,
          key: geoLocationMetaDefinitions.key,
          value: geoLocationMappings.value,
        })
        .from(geoLocationMappings)
        .innerJoin(
          geoLocationMetaDefinitions,
          eq(geoLocationMappings.metaId, geoLocationMetaDefinitions.id),
        );

      // Build a map of geoId -> { key: value }
      const metricsMap = new Map<number, Record<string, string>>();
      for (const m of mappings) {
        if (!locIds.includes(m.geoId)) continue;
        if (!metricsMap.has(m.geoId)) metricsMap.set(m.geoId, {});
        metricsMap.get(m.geoId)![m.key] = m.value;
      }

      const enriched = locations.map((loc) => ({
        ...loc,
        metrics: metricsMap.get(loc.id) ?? {},
      }));

      return c.json({ data: enriched });
    }
  }

  return c.json({ data: locations });
});

// ---------------------------------------------------------------------------
// GET /locations/list — lightweight for AI agent prompt injection
// ---------------------------------------------------------------------------

const listCompactRoute = createRoute({
  method: "get",
  path: "/locations/list",
  tags: ["Geo"],
  summary: "Compact geo location list for AI agents",
  description: "Returns a minimal list (id, name, type, country) suitable for injection into AI system prompts.",
  responses: {
    200: {
      description: "Compact geo list",
      content: {
        "application/json": { schema: z.object({ data: z.array(GeoLocationListItemSchema) }) },
      },
    },
  },
});

geoRouter.openapi(listCompactRoute, async (c) => {
  const db = getDb(c.env);
  const list = await db
    .select({
      id: geoLocations.id,
      name: geoLocations.name,
      type: geoLocations.type,
      country: geoLocations.country,
    })
    .from(geoLocations)
    .where(eq(geoLocations.isActive, true))
    .orderBy(geoLocations.type, geoLocations.name);

  return c.json({ data: list });
});

// ---------------------------------------------------------------------------
// GET /locations/:id — single location with all EAV mappings
// ---------------------------------------------------------------------------

const getByIdRoute = createRoute({
  method: "get",
  path: "/locations/{id}",
  tags: ["Geo"],
  summary: "Get geo location by ID",
  description: "Returns a single geo location with all EAV metric mappings.",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Geo location with metrics",
      content: { "application/json": { schema: z.object({ data: GeoLocationSchema }) } },
    },
    404: {
      description: "Not found",
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
    },
  },
});

geoRouter.openapi(getByIdRoute, async (c) => {
  const db = getDb(c.env);
  const id = parseInt(c.req.valid("param").id, 10);

  const [location] = await db
    .select()
    .from(geoLocations)
    .where(eq(geoLocations.id, id))
    .limit(1);

  if (!location) {
    return c.json({ error: `Geo location ${id} not found` }, 404);
  }

  // Fetch EAV mappings
  const mappings = await db
    .select({
      key: geoLocationMetaDefinitions.key,
      value: geoLocationMappings.value,
    })
    .from(geoLocationMappings)
    .innerJoin(
      geoLocationMetaDefinitions,
      eq(geoLocationMappings.metaId, geoLocationMetaDefinitions.id),
    )
    .where(eq(geoLocationMappings.geoId, id));

  const metrics: Record<string, string> = {};
  for (const m of mappings) {
    metrics[m.key] = m.value;
  }

  return c.json({ data: { ...location, metrics } }, 200);
});

// ---------------------------------------------------------------------------
// POST /locations/seed — bulk upsert geo locations + EAV
// ---------------------------------------------------------------------------

const GeoSeedItemSchema = z.object({
  type: z.enum(["metro", "country", "micro_hub", "neighborhood"]),
  name: z.string(),
  country: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  metro: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  parentMetro: z.string().nullable().optional().openapi({
    description: "Metro name of the parent location (resolved to parent_id)",
  }),
  metrics: z
    .record(z.string(), z.string())
    .optional()
    .openapi({ description: "EAV metrics to attach (key → value)" }),
});

const seedRoute = createRoute({
  method: "post",
  path: "/locations/seed",
  tags: ["Geo"],
  summary: "Seed/upsert geo locations",
  description: "Bulk upsert geo locations and their EAV metrics. Idempotent — updates existing records by metro/name match.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            locations: z.array(GeoSeedItemSchema),
            metaDefinitions: z
              .array(
                z.object({
                  key: z.string(),
                  label: z.string(),
                  description: z.string().optional(),
                  valueType: z.enum(["number", "string", "json"]).optional(),
                }),
              )
              .optional()
              .openapi({ description: "Meta definitions to upsert before seeding" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Seed results",
      content: {
        "application/json": {
          schema: z.object({
            inserted: z.number(),
            updated: z.number(),
            metricsSet: z.number(),
          }),
        },
      },
    },
  },
});

geoRouter.openapi(seedRoute, async (c) => {
  const rawDb = c.env.DB;
  const db = getDb(c.env);
  const { locations, metaDefinitions } = c.req.valid("json");
  const now = new Date();

  let inserted = 0;
  let updated = 0;
  let metricsSet = 0;

  // 1. Upsert meta definitions
  if (metaDefinitions && metaDefinitions.length > 0) {
    for (const def of metaDefinitions) {
      const [existing] = await db
        .select()
        .from(geoLocationMetaDefinitions)
        .where(eq(geoLocationMetaDefinitions.key, def.key))
        .limit(1);

      if (existing) {
        await db
          .update(geoLocationMetaDefinitions)
          .set({
            label: def.label,
            description: def.description ?? existing.description,
            valueType: def.valueType ?? existing.valueType,
            updatedAt: now,
          })
          .where(eq(geoLocationMetaDefinitions.id, existing.id));
      } else {
        await db.insert(geoLocationMetaDefinitions).values({
          key: def.key,
          label: def.label,
          description: def.description ?? null,
          valueType: def.valueType ?? "number",
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 2. Build a parent lookup (metro name → id) for micro_hub/neighborhood parent resolution
  const existingMetros = await db
    .select({ id: geoLocations.id, metro: geoLocations.metro })
    .from(geoLocations)
    .where(eq(geoLocations.type, "metro"));
  const metroIdMap = new Map<string, number>();
  for (const m of existingMetros) {
    if (m.metro) metroIdMap.set(m.metro.toLowerCase(), m.id);
  }

  // 3. Upsert locations
  for (const loc of locations) {
    // Match by metro (unique) for metros, or by name+type for others
    let existing;
    if (loc.type === "metro" && loc.metro) {
      [existing] = await db
        .select()
        .from(geoLocations)
        .where(eq(geoLocations.metro, loc.metro))
        .limit(1);
    } else {
      [existing] = await db
        .select()
        .from(geoLocations)
        .where(and(eq(geoLocations.name, loc.name), eq(geoLocations.type, loc.type)))
        .limit(1);
    }

    // Resolve parent_id from parentMetro
    let parentId: number | null = null;
    if (loc.parentMetro) {
      parentId = metroIdMap.get(loc.parentMetro.toLowerCase()) ?? null;
    }

    let geoId: number;

    if (existing) {
      await db
        .update(geoLocations)
        .set({
          name: loc.name,
          country: loc.country ?? existing.country,
          region: loc.region ?? existing.region,
          city: loc.city ?? existing.city,
          metro: loc.metro ?? existing.metro,
          lat: loc.lat ?? existing.lat,
          lng: loc.lng ?? existing.lng,
          parentId: parentId ?? existing.parentId,
          updatedAt: now,
        })
        .where(eq(geoLocations.id, existing.id));
      geoId = existing.id;
      updated++;
    } else {
      const result = await rawDb
        .prepare(
          `INSERT INTO geo_locations (type, name, country, region, city, metro, lat, lng, parent_id, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          loc.type,
          loc.name,
          loc.country ?? null,
          loc.region ?? null,
          loc.city ?? null,
          loc.metro ?? null,
          loc.lat ?? null,
          loc.lng ?? null,
          parentId,
          Math.floor(now.getTime() / 1000),
          Math.floor(now.getTime() / 1000),
        )
        .run();
      geoId = result.meta.last_row_id as number;
      inserted++;

      // Update parent lookup so later micro_hubs can find their metro parent
      if (loc.type === "metro" && loc.metro) {
        metroIdMap.set(loc.metro.toLowerCase(), geoId);
      }
    }

    // 4. Upsert EAV metrics
    if (loc.metrics) {
      for (const [key, value] of Object.entries(loc.metrics)) {
        // Find meta definition
        const [metaDef] = await db
          .select({ id: geoLocationMetaDefinitions.id })
          .from(geoLocationMetaDefinitions)
          .where(eq(geoLocationMetaDefinitions.key, key))
          .limit(1);

        if (!metaDef) continue; // Skip unknown metric keys

        const [existingMapping] = await db
          .select()
          .from(geoLocationMappings)
          .where(
            and(
              eq(geoLocationMappings.geoId, geoId),
              eq(geoLocationMappings.metaId, metaDef.id),
            ),
          )
          .limit(1);

        if (existingMapping) {
          await db
            .update(geoLocationMappings)
            .set({ value, updatedAt: now })
            .where(eq(geoLocationMappings.id, existingMapping.id));
        } else {
          await db.insert(geoLocationMappings).values({
            geoId,
            metaId: metaDef.id,
            value,
            source: "seed",
            createdAt: now,
            updatedAt: now,
          });
        }
        metricsSet++;
      }
    }
  }

  return c.json({ inserted, updated, metricsSet });
});

// ---------------------------------------------------------------------------
// POST /locations/backfill-roles — backfill roles.geo_id from metro strings
// ---------------------------------------------------------------------------

const backfillRoute = createRoute({
  method: "post",
  path: "/locations/backfill-roles",
  tags: ["Geo"],
  summary: "Backfill roles.geo_id from metro strings",
  description:
    "For all roles with metro but no geo_id, fuzzy-match against geo_locations and set the FK. " +
    "Returns count of matched/unmatched roles and the list of unmatched metros.",
  responses: {
    200: {
      description: "Backfill results",
      content: {
        "application/json": {
          schema: z.object({
            matched: z.number(),
            unmatched: z.number(),
            unmatchedMetros: z.array(z.string()),
          }),
        },
      },
    },
  },
});

geoRouter.openapi(backfillRoute, async (c) => {
  const db = getDb(c.env);

  // Get all geo locations for matching
  const allGeos = await db
    .select({
      id: geoLocations.id,
      name: geoLocations.name,
      metro: geoLocations.metro,
      city: geoLocations.city,
    })
    .from(geoLocations)
    .where(eq(geoLocations.isActive, true));

  // Build lookup maps for matching
  const byMetro = new Map<string, number>();
  const byName = new Map<string, number>();
  const byCity = new Map<string, number>();
  for (const g of allGeos) {
    if (g.metro) byMetro.set(g.metro.toLowerCase(), g.id);
    byName.set(g.name.toLowerCase(), g.id);
    if (g.city) byCity.set(g.city.toLowerCase(), g.id);
  }

  // Get roles with metro but no geo_id
  const rolesNeedingBackfill = await db
    .select({ id: roles.id, metro: roles.metro })
    .from(roles)
    .where(
      and(
        sql`${roles.metro} IS NOT NULL`,
        sql`${roles.geoId} IS NULL`,
      ),
    );

  let matched = 0;
  const unmatchedMetros: string[] = [];

  for (const role of rolesNeedingBackfill) {
    if (!role.metro) continue;
    const lower = role.metro.toLowerCase().trim();

    // Try exact metro match → exact name match → city match
    const geoId = byMetro.get(lower) ?? byName.get(lower) ?? byCity.get(lower);

    if (geoId) {
      await db.update(roles).set({ geoId }).where(eq(roles.id, role.id));
      matched++;
    } else {
      if (!unmatchedMetros.includes(role.metro)) {
        unmatchedMetros.push(role.metro);
      }
    }
  }

  return c.json({
    matched,
    unmatched: rolesNeedingBackfill.length - matched,
    unmatchedMetros,
  });
});
