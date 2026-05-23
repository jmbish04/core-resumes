import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { eq } from "drizzle-orm";

import { enqueueOrchestratorTask } from "../../ai/agents/orchestrator";
import { getDb } from "../../db";
import { insertRoleSchema, roles, selectRoleSchema } from "../../db/schema";
import { RoleLogService } from "../../services/role-log-service";
import { RoleStatusService } from "../../services/role-status-service";

const roleListQuery = z.object({
  status: z.string().optional(),
  sort: z.enum(["companyName", "jobTitle", "status", "createdAt"]).optional(),
  q: z.string().optional(),
});

const roleIdParams = z.object({ id: z.string() });
const roleListSchema = z.array(selectRoleSchema);
const rolePatchSchema = insertRoleSchema.partial().omit({ id: true, updatedAt: true });

export const rolesRouter = new OpenAPIHono<{ Bindings: Env }>();

rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "rolesList",
    request: { query: roleListQuery },
    responses: {
      200: {
        description: "List roles",
        content: { "application/json": { schema: roleListSchema } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const db = getDb(c.env);
    let rows = await db.select().from(roles);

    if (query.status) {
      rows = rows.filter((role) => role.status === query.status);
    }

    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter(
        (role) =>
          role.companyName.toLowerCase().includes(q) || role.jobTitle.toLowerCase().includes(q),
      );
    }

    if (query.sort) {
      rows = rows.sort((a, b) => String(a[query.sort!]).localeCompare(String(b[query.sort!])));
    }

    return c.json(rows);
  },
);

rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    operationId: "rolesGet",
    request: { params: roleIdParams },
    responses: {
      200: {
        description: "Get role",
        content: { "application/json": { schema: selectRoleSchema } },
      },
      404: { description: "Role not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [role] = await getDb(c.env).select().from(roles).where(eq(roles.id, id)).limit(1);

    return role ? c.json(role) : c.json({ error: "Role not found" }, 404);
  },
);

rolesRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "rolesCreate",
    request: {
      body: { content: { "application/json": { schema: insertRoleSchema.omit({ id: true }) } } },
    },
    responses: {
      201: {
        description: "Created role",
        content: { "application/json": { schema: selectRoleSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const [role] = await getDb(c.env)
      .insert(roles)
      .values({ ...body, id: crypto.randomUUID() })
      .returning();

    return c.json(role, 201);
  },
);

rolesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}",
    operationId: "rolesUpdate",
    request: {
      params: roleIdParams,
      body: { content: { "application/json": { schema: rolePatchSchema } } },
    },
    responses: {
      200: {
        description: "Updated role",
        content: { "application/json": { schema: selectRoleSchema } },
      },
      404: { description: "Role not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    // If status is being changed, route through RoleStatusService for audit trail
    if (body.status) {
      const { status, ...rest } = body;
      await RoleStatusService.transition(c.env, id, status, {
        trigger: "user",
      });

      // Apply any remaining fields
      if (Object.keys(rest).length > 0) {
        await getDb(c.env)
          .update(roles)
          .set({ ...rest, updatedAt: new Date() })
          .where(eq(roles.id, id));
      }
    } else {
      await getDb(c.env)
        .update(roles)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(roles.id, id));
    }

    const [role] = await getDb(c.env).select().from(roles).where(eq(roles.id, id)).limit(1);
    return role ? c.json(role) : c.json({ error: "Role not found" }, 404);
  },
);

rolesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    operationId: "rolesDelete",
    request: { params: roleIdParams },
    responses: {
      200: {
        description: "Deleted role",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await getDb(c.env).delete(roles).where(eq(roles.id, id));

    return c.json({ ok: true });
  },
);

rolesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/reprocess",
    operationId: "rolesReprocess",
    request: {
      params: roleIdParams,
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                taskId: z.string().optional(),
              })
              .optional(),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Reprocessing started",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              retried: z.number().optional(),
              taskId: z.string().optional(),
            }),
          },
        },
      },
      404: { description: "Role not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Worker → Agent DO RPC. The namespace generic from `wrangler types`
    // gives us a typed stub — no cast, no explicit generics needed.
    const stub = await getAgentByName(c.env.ORCHESTRATOR_AGENT, id);

    let body: { taskId?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      // empty body is fine — retry all
    }

    if (body?.taskId) {
      // Retry a single task
      const result = await stub.retryTask(body.taskId);
      return c.json({ ok: true, taskId: result.taskId });
    }

    // Retry all failed tasks
    const result = await stub.retryFailedTasks();
    return c.json({ ok: true, retried: result.retried });
  },
);

// GET /:id/processing-status — query orchestrator DO for live task state
rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/processing-status",
    operationId: "rolesProcessingStatus",
    request: { params: roleIdParams },
    responses: {
      200: {
        description: "Processing task statuses",
        content: {
          "application/json": {
            schema: z.object({
              roleId: z.string(),
              tasks: z.array(
                z.object({
                  id: z.string(),
                  type: z.string(),
                  status: z.string(),
                  error: z.string().optional(),
                  roleId: z.string().optional(),
                }),
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    // Worker → Agent DO RPC. The namespace generic from `wrangler types`
    // gives us a typed stub — no cast, no explicit generics needed.
    const stub = await getAgentByName(c.env.ORCHESTRATOR_AGENT, id);

    const status = await stub.getProcessingStatus();
    return c.json(status);
  },
);

rolesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/drive",
    operationId: "rolesCreateDriveFolder",
    request: { params: roleIdParams },
    responses: {
      200: {
        description: "Created drive folder",
        content: { "application/json": { schema: z.object({ driveFolderId: z.string() }) } },
      },
      404: { description: "Role not found" },
      500: { description: "Failed to create folder" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    if (role.driveFolderId) {
      return c.json({ driveFolderId: role.driveFolderId });
    }

    try {
      const { GoogleDriveClient } = await import("../../ai/tools/google/drive");
      const client = new GoogleDriveClient(c.env);
      const folder = await client.createFolder(
        `${role.companyName} - ${role.jobTitle}`,
        c.env.PARENT_DRIVE_FOLDER_ID,
      );

      await db
        .update(roles)
        .set({ driveFolderId: folder.id, updatedAt: new Date() })
        .where(eq(roles.id, id));

      return c.json({ driveFolderId: folder.id });
    } catch (err) {
      console.error("Failed to create drive folder:", err);
      return c.json({ error: "Failed to create folder" }, 500);
    }
  },
);

// POST /:id/generate — Enqueue resume or cover letter generation
rolesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/generate",
    operationId: "rolesGenerate",
    request: {
      params: roleIdParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              type: z.enum(["resume", "cover_letter"]),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Generation task enqueued",
        content: {
          "application/json": {
            schema: z.object({ ok: z.boolean(), taskType: z.string() }),
          },
        },
      },
      404: {
        description: "Role not found",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { type } = c.req.valid("json");
    const db = getDb(c.env);
    const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    const taskType = type === "resume" ? "resume_review" : "cover_letter_draft";
    await enqueueOrchestratorTask(c.env, id, {
      type: taskType,
      roleId: id,
    });

    return c.json({ ok: true, taskType }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /statuses — List all active statuses for frontend dropdown/stepper
// ---------------------------------------------------------------------------

rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/statuses",
    operationId: "statusesList",
    responses: {
      200: {
        description: "All active status definitions",
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                description: z.string().nullable(),
                group: z.string(),
                sortOrder: z.number(),
                isActive: z.boolean(),
                requiresNotesPrompt: z.boolean(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const rows = await RoleStatusService.getAllStatuses(c.env);
    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// GET /:id/status-log — Audit ledger for a role's status transitions
// ---------------------------------------------------------------------------

rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/status-log",
    operationId: "rolesStatusLog",
    request: { params: roleIdParams },
    responses: {
      200: {
        description: "Status transition history",
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                id: z.number(),
                roleId: z.string(),
                previousStatus: z.string().nullable(),
                newStatus: z.string(),
                trigger: z.string(),
                notes: z.string().nullable(),
                metadata: z.unknown().nullable(),
                createdAt: z.string(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rows = await RoleStatusService.getLog(c.env, id);
    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// POST /:id/status-transition — Atomic status change with optional notes
// ---------------------------------------------------------------------------

rolesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/status-transition",
    operationId: "rolesStatusTransition",
    request: {
      params: roleIdParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              newStatus: z.string(),
              notes: z.string().optional(),
              trigger: z.enum(["user", "agent", "email_inference", "system"]).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Transition completed",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.boolean(),
              previousStatus: z.string().nullable(),
            }),
          },
        },
      },
      404: { description: "Role not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { newStatus, notes, trigger } = c.req.valid("json");

    try {
      const result = await RoleStatusService.transition(c.env, id, newStatus, {
        trigger: trigger ?? "user",
        notes,
      });
      return c.json({ ok: true, previousStatus: result.previousStatus });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        return c.json({ error: "Role not found" }, 404);
      }
      throw err;
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:id/logs — Paginated activity logs for a role
// ---------------------------------------------------------------------------

rolesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/logs",
    operationId: "rolesLogs",
    request: {
      params: roleIdParams,
      query: z.object({
        limit: z.coerce.number().optional(),
        offset: z.coerce.number().optional(),
      }),
    },
    responses: {
      200: {
        description: "Activity logs",
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                id: z.string(),
                roleId: z.string().nullable(),
                category: z.string(),
                action: z.string(),
                message: z.string(),
                metadata: z.unknown().nullable(),
                createdAt: z.string(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const query = c.req.valid("query");
    const rows = await RoleLogService.getByRole(c.env, id, {
      limit: query.limit,
      offset: query.offset,
    });
    return c.json(rows);
  },
);
