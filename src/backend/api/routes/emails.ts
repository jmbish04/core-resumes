import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  emailAttachments,
  emailParties,
  emails,
  roles,
  selectEmailAttachmentSchema,
  selectEmailPartySchema,
  selectEmailSchema,
} from "../../db/schema";
import { associateEmailWithRole } from "../../email/handler";

const emailQuery = z.object({
  processedStatus: z.string().optional(),
  roleId: z.string().optional(),
  companyId: z.string().optional(),
});
const emailParam = z.object({ id: z.string() });
const associateBody = z.object({ roleId: z.string() });

export const emailsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET / — list all emails with optional filters
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "emailsList",
    request: { query: emailQuery },
    responses: {
      200: {
        description: "List emails",
        content: { "application/json": { schema: z.array(selectEmailSchema) } },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid("query");
    const db = getDb(c.env);
    let rows = await db.select().from(emails);

    if (query.processedStatus) {
      rows = rows.filter((email) => email.processedStatus === query.processedStatus);
    }

    if (query.roleId) {
      rows = rows.filter((email) => email.roleId === query.roleId);
    }

    // Filter by companyId: get all roles for this company, then match emails
    if (query.companyId) {
      const companyRoles = await db
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.companyId, query.companyId));
      const roleIds = new Set(companyRoles.map((r) => r.id));
      rows = rows.filter((email) => email.roleId && roleIds.has(email.roleId));
    }

    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// GET /unmatched — emails awaiting manual association
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/unmatched",
    operationId: "emailsUnmatched",
    responses: {
      200: {
        description: "Unmatched emails",
        content: { "application/json": { schema: z.array(selectEmailSchema) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env)
      .select()
      .from(emails)
      .where(eq(emails.processedStatus, "unmatched"));

    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// GET /stats — aggregate counts for the global emails dashboard badge
// NOTE: Must be registered BEFORE /{id} to prevent Hono matching "stats" as an id param
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/stats",
    operationId: "emailsStats",
    responses: {
      200: {
        description: "Email statistics",
        content: {
          "application/json": {
            schema: z.object({
              total: z.number(),
              unread: z.number(),
              byStatus: z.record(z.string(), z.number()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const allEmails = await getDb(c.env).select().from(emails);

    const byStatus: Record<string, number> = {};
    let unread = 0;

    for (const email of allEmails) {
      const status = email.processedStatus ?? "pending";
      byStatus[status] = (byStatus[status] || 0) + 1;
      if (status === "pending" || status === "unmatched") {
        unread++;
      }
    }

    return c.json({
      total: allEmails.length,
      unread,
      byStatus,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /{id} — single email by ID
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    operationId: "emailsGet",
    request: { params: emailParam },
    responses: {
      200: {
        description: "Get email",
        content: { "application/json": { schema: selectEmailSchema } },
      },
      404: { description: "Email not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const [email] = await getDb(c.env).select().from(emails).where(eq(emails.id, id)).limit(1);

    return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}/parties — list all participants of an email
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/parties",
    operationId: "emailsGetParties",
    request: { params: emailParam },
    responses: {
      200: {
        description: "Email parties (FROM, TO, CC, BCC)",
        content: { "application/json": { schema: z.array(selectEmailPartySchema) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rows = await getDb(c.env)
      .select()
      .from(emailParties)
      .where(eq(emailParties.emailId, id));

    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}/attachments — list attachments with Drive links
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/attachments",
    operationId: "emailsGetAttachments",
    request: { params: emailParam },
    responses: {
      200: {
        description: "Email attachments",
        content: { "application/json": { schema: z.array(selectEmailAttachmentSchema) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const rows = await getDb(c.env)
      .select()
      .from(emailAttachments)
      .where(eq(emailAttachments.emailId, id));

    return c.json(rows);
  },
);

// ---------------------------------------------------------------------------
// GET /{id}/thread — list emails in the same thread
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/thread",
    operationId: "emailsGetThread",
    request: { params: emailParam },
    responses: {
      200: {
        description: "Thread messages (parent + children)",
        content: { "application/json": { schema: z.array(selectEmailSchema) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);

    // Get the email to find its parent or use itself as root
    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return c.json([], 200);

    const rootId = email.parentEmailId || email.id;

    // Get root + all children
    const threadEmails = await db
      .select()
      .from(emails)
      .where(eq(emails.parentEmailId, rootId));

    // Include the root itself
    const [root] = await db.select().from(emails).where(eq(emails.id, rootId)).limit(1);
    const result = root ? [root, ...threadEmails] : threadEmails;

    return c.json(result);
  },
);

// ---------------------------------------------------------------------------
// POST /{id}/associate — associate (or re-associate) email with a role
// Re-association triggers the full email processing workflow.
// ---------------------------------------------------------------------------

emailsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/associate",
    operationId: "emailsAssociate",
    request: {
      params: emailParam,
      body: { content: { "application/json": { schema: associateBody } } },
    },
    responses: {
      200: {
        description: "Associated email — workflow re-triggered",
        content: { "application/json": { schema: selectEmailSchema } },
      },
      404: { description: "Email or role not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const { roleId } = c.req.valid("json");
    const db = getDb(c.env);

    // Look up the email and role
    const [email] = await db.select().from(emails).where(eq(emails.id, id)).limit(1);
    if (!email) return c.json({ error: "Email not found" }, 404);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return c.json({ error: "Role not found" }, 404);

    // Trigger full workflow (classify, draft, Drive, etc.)
    // Use waitUntil so the response returns immediately
    const ctx = c.executionCtx;
    ctx.waitUntil(
      associateEmailWithRole(c.env, null, id, role, email.subject, email.sender),
    );

    // Immediate update for the response
    const [updated] = await db
      .update(emails)
      .set({ roleId, processedStatus: "associated" })
      .where(eq(emails.id, id))
      .returning();

    return c.json(updated);
  },
);
