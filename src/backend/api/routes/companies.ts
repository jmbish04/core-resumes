import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, and } from "drizzle-orm";

import { BrowserRendering } from "@/backend/ai/tools/browser-rendering";
import { extractBrandColors } from "@/backend/ai/tools/google/templates/brand-colors";
import { getDb } from "@/backend/db";
import { companies, roles, selectCompanySchema, companyJobBoardDefs, companyJobBoardMapping, selectCompanyJobBoardMappingSchema } from "@/backend/db/schema";
import { getCloudflareAccountId, getCloudflareImagesToken } from "@/backend/utils/secrets";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const companyIdParam = z.object({ id: z.string() });

const createCompanyBody = z.object({
  name: z.string().min(1),
  url: z.string().optional(),
  description: z.string().optional(),
  greenhouseToken: z.string().optional(),
  colorPrimary: z.string().optional(),
  colorAccent: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const updateCompanyBody = z.object({
  name: z.string().min(1).optional(),
  url: z.string().optional(),
  description: z.string().optional(),
  greenhouseToken: z.string().optional(),
  colorPrimary: z.string().nullable().optional(),
  colorAccent: z.string().nullable().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
});

const extractColorsBody = z.object({
  url: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const companiesRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET / — List all companies
companiesRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "companiesList",
    responses: {
      200: {
        description: "List of all companies",
        content: { "application/json": { schema: z.array(selectCompanySchema) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(companies).orderBy(companies.name);
    return c.json(rows);
  },
);

// GET /analytics — Aggregated company analytics for charts
companiesRouter.openapi(
  createRoute({
    method: "get",
    path: "/analytics",
    operationId: "companiesAnalytics",
    responses: {
      200: {
        description: "Company analytics for dashboard charts",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const [allCompanies, allRoles] = await Promise.all([
      db.select().from(companies),
      db.select().from(roles),
    ]);

    // Build company → roles map
    const companyRoleMap = new Map<string, typeof allRoles>();
    for (const role of allRoles) {
      if (role.companyId) {
        const existing = companyRoleMap.get(role.companyId) || [];
        existing.push(role);
        companyRoleMap.set(role.companyId, existing);
      }
    }

    // Top 5 by role count
    const byRoleCount = allCompanies
      .map((c) => ({
        name: c.name,
        id: c.id,
        value: companyRoleMap.get(c.id)?.length ?? 0,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Salary avg per company
    const companyAvgSalaries = allCompanies
      .map((c) => {
        const compRoles = companyRoleMap.get(c.id) || [];
        const withSalary = compRoles.filter((r) => r.salaryMin || r.salaryMax);
        if (withSalary.length === 0) return null;
        const total = withSalary.reduce((sum, r) => {
          const avg =
            ((r.salaryMin ?? 0) + (r.salaryMax ?? 0)) / (r.salaryMin && r.salaryMax ? 2 : 1);
          return sum + avg;
        }, 0);
        return { name: c.name, id: c.id, value: Math.round(total / withSalary.length) };
      })
      .filter(Boolean) as { name: string; id: string; value: number }[];

    const topSalary = [...companyAvgSalaries].sort((a, b) => b.value - a.value).slice(0, 5);
    const bottomSalary = [...companyAvgSalaries].sort((a, b) => a.value - b.value).slice(0, 5);

    // Status distribution across all roles
    const statusDist: Record<string, number> = {};
    for (const role of allRoles) {
      statusDist[role.status] = (statusDist[role.status] ?? 0) + 1;
    }
    const statusDistribution = Object.entries(statusDist).map(([name, value]) => ({ name, value }));

    // Greenhouse board count
    const withGreenhouse = allCompanies.filter((c) => c.greenhouseToken).length;

    return c.json({
      topByRoleCount: byRoleCount,
      topByHighestSalary: topSalary,
      topByLowestSalary: bottomSalary,
      statusDistribution,
      totalCompanies: allCompanies.length,
      totalRoles: allRoles.length,
      companiesWithGreenhouse: withGreenhouse,
    });
  },
);

// GET /:id — Get single company
companiesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    operationId: "companiesGet",
    request: { params: companyIdParam },
    responses: {
      200: {
        description: "Single company",
        content: { "application/json": { schema: selectCompanySchema } },
      },
      404: { description: "Company not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [row] = await getDb(c.env).select().from(companies).where(eq(companies.id, id)).limit(1);

    if (!row) return c.json({ error: "Company not found" }, 404);
    return c.json(row);
  },
);

// POST / — Create company
companiesRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "companiesCreate",
    request: {
      body: { content: { "application/json": { schema: createCompanyBody } } },
    },
    responses: {
      201: {
        description: "Created company",
        content: { "application/json": { schema: selectCompanySchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const id = crypto.randomUUID();

    const [created] = await getDb(c.env)
      .insert(companies)
      .values({
        id,
        name: body.name,
        url: body.url,
        description: body.description,
        greenhouseToken: body.greenhouseToken,
        colorPrimary: body.colorPrimary,
        colorAccent: body.colorAccent,
        attributes: body.attributes,
      })
      .returning();

    return c.json(created, 201);
  },
);

// PUT /:id — Update company
companiesRouter.openapi(
  createRoute({
    method: "put",
    path: "/{id}",
    operationId: "companiesUpdate",
    request: {
      params: companyIdParam,
      body: { content: { "application/json": { schema: updateCompanyBody } } },
    },
    responses: {
      200: {
        description: "Updated company",
        content: { "application/json": { schema: selectCompanySchema } },
      },
      404: { description: "Company not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [updated] = await getDb(c.env)
      .update(companies)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!updated) return c.json({ error: "Company not found" }, 404);
    return c.json(updated);
  },
);

// DELETE /:id — Delete company
companiesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    operationId: "companiesDelete",
    request: { params: companyIdParam },
    responses: {
      200: { description: "Company deleted" },
      404: { description: "Company not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await getDb(c.env).delete(companies).where(eq(companies.id, id)).returning();

    if (result.length === 0) return c.json({ error: "Company not found" }, 404);
    return c.json({ ok: true });
  },
);

// POST /extract-colors — Extract brand colors from URL (no DB write)
companiesRouter.openapi(
  createRoute({
    method: "post",
    path: "/extract-colors",
    operationId: "companiesExtractColors",
    request: {
      body: { content: { "application/json": { schema: extractColorsBody } } },
    },
    responses: {
      200: {
        description: "Extracted brand color palette",
        content: {
          "application/json": {
            schema: z.object({
              primary: z.string(),
              accent: z.string(),
              source: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { url } = c.req.valid("json");
    const palette = await extractBrandColors(c.env, url);
    return c.json(palette);
  },
);

// POST /:id/logo-upload-url — Get Cloudflare Images direct upload URL
companiesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/logo-upload-url",
    operationId: "companiesLogoUploadUrl",
    request: { params: companyIdParam },
    responses: {
      200: {
        description: "Upload URL and ID",
        content: {
          "application/json": {
            schema: z.object({
              uploadURL: z.string(),
              id: z.string(),
            }),
          },
        },
      },
      500: {
        description: "Server error",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const accountId = await getCloudflareAccountId(c.env);
    const imagesToken = await getCloudflareImagesToken(c.env);

    if (!accountId || !imagesToken) {
      return c.json({ error: "Missing Cloudflare Images credentials" }, 500);
    }

    const formData = new FormData();
    formData.append("requireSignedURLs", "false");

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v2/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${imagesToken}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Cloudflare Images direct upload error:", errorText);
      return c.json({ error: "Failed to generate upload URL" }, 500);
    }

    const data = (await response.json()) as any;
    if (!data.success) {
      return c.json({ error: "Failed to generate upload URL" }, 500);
    }

    return c.json(
      {
        uploadURL: String(data.result.uploadURL),
        id: String(data.result.id),
      },
      200,
    );
  },
);

// POST /:id/logo-from-url — Extract and upload logo from URL
companiesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/logo-from-url",
    operationId: "companiesLogoFromUrl",
    request: {
      params: companyIdParam,
      body: { content: { "application/json": { schema: z.object({ url: z.string().url() }) } } },
    },
    responses: {
      200: {
        description: "Logo uploaded and company updated",
        content: {
          "application/json": {
            schema: z.object({
              logoUrl: z.string(),
            }),
          },
        },
      },
      404: { description: "Company not found" },
      500: { description: "Failed to upload image" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { url } = c.req.valid("json");

    const db = getDb(c.env);
    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);

    if (!company) {
      return c.json({ error: "Company not found" }, 404);
    }

    try {
      const browser = new BrowserRendering(c.env);
      const cfUrl = await browser.uploadImageFromUrl(url);

      await db
        .update(companies)
        .set({
          attributes: {
            ...(company.attributes as Record<string, unknown>),
            logoUrl: cfUrl,
          },
          updatedAt: new Date(),
        })
        .where(eq(companies.id, id));

      return c.json({ logoUrl: cfUrl }, 200);
    } catch (err) {
      console.error("Failed to extract logo from URL:", err);
      return c.json({ error: "Failed to upload image" }, 500);
    }
  },
);

// PATCH /:id — Partial update company
companiesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    operationId: "companiesPatch",
    request: {
      params: companyIdParam,
      body: { content: { "application/json": { schema: updateCompanyBody } } },
    },
    responses: {
      200: {
        description: "Patched company",
        content: { "application/json": { schema: selectCompanySchema } },
      },
      404: { description: "Company not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [updated] = await getDb(c.env)
      .update(companies)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!updated) return c.json({ error: "Company not found" }, 404);
    return c.json(updated);
  },
);

// GET /:id/job-boards — List job boards mapped to this company
companiesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/job-boards",
    operationId: "companiesGetJobBoards",
    request: { params: companyIdParam },
    responses: {
      200: {
        description: "List of job boards for company",
        content: { "application/json": { schema: z.any() } }, // Detailed mapping output
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);

    const rows = await db
      .select({
        mappingId: companyJobBoardMapping.id,
        boardIdentifier: companyJobBoardMapping.boardIdentifier,
        boardDefId: companyJobBoardDefs.id,
        boardName: companyJobBoardDefs.name,
        isApi: companyJobBoardDefs.isApi,
      })
      .from(companyJobBoardMapping)
      .innerJoin(companyJobBoardDefs, eq(companyJobBoardMapping.boardId, companyJobBoardDefs.id))
      .where(eq(companyJobBoardMapping.companyId, id));

    return c.json(rows);
  },
);

// POST /:id/job-boards — Map a job board to this company (creates definition if needed)
const mapJobBoardBody = z.object({
  boardName: z.string().min(1),
  boardIdentifier: z.string().min(1),
  isApi: z.boolean().default(false),
});

companiesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/job-boards",
    operationId: "companiesAddJobBoard",
    request: {
      params: companyIdParam,
      body: { content: { "application/json": { schema: mapJobBoardBody } } },
    },
    responses: {
      201: {
        description: "Mapped job board",
        content: { "application/json": { schema: selectCompanyJobBoardMappingSchema } },
      },
      404: { description: "Company not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { boardName, boardIdentifier, isApi } = c.req.valid("json");
    const db = getDb(c.env);

    // Verify company exists
    const [company] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!company) return c.json({ error: "Company not found" }, 404);

    // Find or create board def
    let [boardDef] = await db.select().from(companyJobBoardDefs).where(eq(companyJobBoardDefs.name, boardName)).limit(1);

    if (!boardDef) {
      const defId = crypto.randomUUID();
      [boardDef] = await db.insert(companyJobBoardDefs).values({
        id: defId,
        name: boardName,
        isApi,
      }).returning();
    }

    // Check if mapping already exists
    let [mapping] = await db.select().from(companyJobBoardMapping)
      .where(and(
        eq(companyJobBoardMapping.companyId, id),
        eq(companyJobBoardMapping.boardId, boardDef.id)
      ))
      .limit(1);

    if (!mapping) {
      const mappingId = crypto.randomUUID();
      [mapping] = await db.insert(companyJobBoardMapping).values({
        id: mappingId,
        companyId: id,
        boardId: boardDef.id,
        boardIdentifier,
      }).returning();
    } else {
      // Update identifier if it changed
      if (mapping.boardIdentifier !== boardIdentifier) {
        [mapping] = await db.update(companyJobBoardMapping)
          .set({ boardIdentifier })
          .where(eq(companyJobBoardMapping.id, mapping.id))
          .returning();
      }
    }

    return c.json(mapping, 201);
  },
);
