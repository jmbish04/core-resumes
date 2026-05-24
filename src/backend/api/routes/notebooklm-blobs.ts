/**
 * @fileoverview NotebookLM blob management API routes.
 *
 * Provides CRUD operations for NotebookLM source/artifact tracking:
 *   - List blobs (sources + artifacts) for a role
 *   - Fetch podcast transcript lines
 *   - Delete (clawback) a source from NotebookLM
 *   - Soft-delete an artifact from our tracking
 *   - Trigger on-demand artifact generation (podcast, mind map, report, etc.)
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, asc, desc, eq } from "drizzle-orm";

import {
  deleteSource,
  listSources,
  sendPodcastChatPrompt,
  createMindMap,
} from "@/backend/ai/tools/notebooklm/notebooklm-sources";
import { getDb } from "@/backend/db";
import {
  globalConfig,
  notebooklmBlobs,
  notebooklmPodcastTranscript,
  roles,
} from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const notebooklmBlobsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/roles/:roleId/notebooklm/blobs — List blobs for a role
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:roleId/notebooklm/blobs",
    operationId: "listNotebooklmBlobs",
    responses: {
      200: {
        description: "List of NotebookLM source/artifact blobs for the role",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const type = new URL(c.req.url).searchParams.get("type"); // "source" | "artifact" | null
    const db = getDb(c.env);

    const conditions = [eq(notebooklmBlobs.roleId, roleId)];
    if (type === "source" || type === "artifact") {
      conditions.push(eq(notebooklmBlobs.notebooklmType, type));
    }

    const rows = await db
      .select()
      .from(notebooklmBlobs)
      .where(and(...conditions))
      .orderBy(desc(notebooklmBlobs.createdAt));

    return c.json(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt?.toISOString() ?? null,
        updatedAt: r.updatedAt?.toISOString() ?? null,
      })),
    );
  }) as any,
);

// ---------------------------------------------------------------------------
// GET /api/roles/:roleId/notebooklm/transcript — Get podcast transcript
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:roleId/notebooklm/transcript",
    operationId: "getNotebooklmPodcastTranscript",
    responses: {
      200: {
        description: "Podcast transcript lines ordered by line_order",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const podcastId = new URL(c.req.url).searchParams.get("podcastId");
    const db = getDb(c.env);

    const conditions = [eq(notebooklmPodcastTranscript.roleId, roleId)];
    if (podcastId) {
      conditions.push(eq(notebooklmPodcastTranscript.podcastId, podcastId));
    }

    const lines = await db
      .select()
      .from(notebooklmPodcastTranscript)
      .where(and(...conditions))
      .orderBy(asc(notebooklmPodcastTranscript.lineOrder));

    return c.json(
      lines.map((l) => ({
        ...l,
        createdAt: l.createdAt?.toISOString() ?? null,
      })),
    );
  }) as any,
);

// ---------------------------------------------------------------------------
// DELETE /api/roles/:roleId/notebooklm/blobs/:blobId/clawback — Delete source
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:roleId/notebooklm/blobs/:blobId/clawback",
    operationId: "clawbackNotebooklmSource",
    responses: {
      200: {
        description: "Source deleted from NotebookLM and marked inactive",
        content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
      },
      404: { description: "Blob not found or not a source" },
    },
  }),
  (async (c: any) => {
    const { roleId, blobId } = c.req.param();
    const db = getDb(c.env);

    const [blob] = await db
      .select()
      .from(notebooklmBlobs)
      .where(
        and(
          eq(notebooklmBlobs.id, blobId),
          eq(notebooklmBlobs.roleId, roleId),
          eq(notebooklmBlobs.notebooklmType, "source"),
        ),
      )
      .limit(1);

    if (!blob) return c.json({ error: "Blob not found or not a source" }, 404);

    // Delete from NotebookLM if we have a remote ID
    if (blob.notebooklmRemoteId) {
      try {
        await deleteSource(c.env, blob.notebooklmRemoteId);
      } catch (err) {
        console.error("[NotebookLM] Failed to delete source from NotebookLM:", err);
        // Continue with soft-delete even if remote deletion fails
      }
    }

    // Mark inactive in D1
    await db
      .update(notebooklmBlobs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(notebooklmBlobs.id, blobId));

    return c.json({ success: true });
  }) as any,
);

// ---------------------------------------------------------------------------
// DELETE /api/roles/:roleId/notebooklm/blobs/:blobId — Soft-delete artifact
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/:roleId/notebooklm/blobs/:blobId",
    operationId: "softDeleteNotebooklmBlob",
    responses: {
      200: {
        description: "Blob marked inactive (soft delete)",
        content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
      },
    },
  }),
  (async (c: any) => {
    const { blobId } = c.req.param();
    const db = getDb(c.env);

    await db
      .update(notebooklmBlobs)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(notebooklmBlobs.id, blobId));

    return c.json({ success: true });
  }) as any,
);

// ---------------------------------------------------------------------------
// Prompt template helpers
// ---------------------------------------------------------------------------

/** Map action names to their global_config prompt template keys. */
const ACTION_TO_CONFIG_KEY: Record<string, string> = {
  create_podcast: "notebooklm_prompt_podcast",
  create_mind_map: "notebooklm_prompt_mind_map",
  create_report: "notebooklm_prompt_report",
  create_quiz: "notebooklm_prompt_quiz",
  create_flashcards: "notebooklm_prompt_flashcards",
  create_infographic: "notebooklm_prompt_infographic",
  create_slide_deck: "notebooklm_prompt_slide_deck",
  create_data_table: "notebooklm_prompt_data_table",
  deep_research: "notebooklm_prompt_deep_research",
};

/** Hydrate template placeholders with role data and optional user instruction. */
function hydratePrompt(
  template: string,
  role: { jobTitle: string; companyName: string },
  instruction?: string,
): string {
  let hydrated = template
    .replaceAll("{{jobTitle}}", role.jobTitle)
    .replaceAll("{{companyName}}", role.companyName);

  // Replace {{instruction}} — append user instruction or remove the placeholder
  if (instruction) {
    hydrated = hydrated.replaceAll(
      "{{instruction}}",
      `\n\nAdditional instructions: ${instruction}`,
    );
  } else {
    hydrated = hydrated.replaceAll("{{instruction}}", "");
  }

  return hydrated;
}

/**
 * Fetch the prompt template for a given action from global_config.
 * Returns null if no config row exists (caller should use hardcoded default).
 */
async function getPromptTemplate(env: Env, action: string): Promise<string | null> {
  const configKey = ACTION_TO_CONFIG_KEY[action];
  if (!configKey) return null;

  const db = getDb(env);
  const [row] = await db
    .select()
    .from(globalConfig)
    .where(eq(globalConfig.key, configKey))
    .limit(1);

  if (row?.value && typeof row.value === "string" && row.value.trim()) {
    return row.value;
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET /api/roles/:roleId/notebooklm/prompt/:action — Get hydrated prompt
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:roleId/notebooklm/prompt/:action",
    operationId: "getNotebooklmPrompt",
    responses: {
      200: {
        description: "Hydrated prompt template for the action",
        content: {
          "application/json": {
            schema: z.object({
              prompt: z.string(),
              isDefault: z.boolean(),
              configKey: z.string(),
              templateTags: z.array(z.object({ tag: z.string(), description: z.string() })),
            }),
          },
        },
      },
      404: { description: "Role not found" },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const action = c.req.param("action");
    const db = getDb(c.env);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return c.json({ error: "Role not found" }, 404);

    const configKey = ACTION_TO_CONFIG_KEY[action] ?? `notebooklm_prompt_${action}`;

    // Try to fetch from config
    const configTemplate = await getPromptTemplate(c.env, action);
    const isDefault = !configTemplate;

    // Use config template or fall back to a basic default
    const template =
      configTemplate ??
      `Please generate content about the role "{{jobTitle}}" at {{companyName}}.{{instruction}}`;

    const hydrated = hydratePrompt(template, role);

    return c.json({
      prompt: hydrated,
      isDefault,
      configKey,
      templateTags: [
        {
          tag: "{{jobTitle}}",
          description: `The role's job title (currently: "${role.jobTitle}")`,
        },
        {
          tag: "{{companyName}}",
          description: `The company name (currently: "${role.companyName}")`,
        },
        {
          tag: "{{instruction}}",
          description:
            "Additional user instructions appended at runtime. Gets replaced with user input or removed if empty.",
        },
      ],
    });
  }) as any,
);

// ---------------------------------------------------------------------------
// POST /api/roles/:roleId/notebooklm/actions — Trigger on-demand actions
// ---------------------------------------------------------------------------

const actionSchema = z.object({
  action: z.enum([
    "create_podcast",
    "create_mind_map",
    "create_report",
    "create_quiz",
    "create_flashcards",
    "create_infographic",
    "create_slide_deck",
    "create_data_table",
    "deep_research",
    "upload_source",
  ]),
  /** User instruction (legacy — still supported for backward compat). */
  instruction: z.string().optional(),
  /** Full prompt text from the 3-state modal. Takes priority over template hydration. */
  prompt: z.string().optional(),
  sourceContent: z.string().optional(),
  sourceUrl: z.string().optional(),
});

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/:roleId/notebooklm/actions",
    operationId: "triggerNotebooklmAction",
    request: {
      body: {
        content: { "application/json": { schema: actionSchema } },
      },
    },
    responses: {
      200: {
        description: "Action triggered successfully",
        content: { "application/json": { schema: z.any() } },
      },
      404: { description: "Role not found" },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const body = await c.req.json();
    const { action, instruction, prompt: userPrompt } = body;
    const db = getDb(c.env);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) return c.json({ error: "Role not found" }, 404);

    const pipelineDocTypeMap: Record<string, string> = {
      create_podcast: "podcast",
      create_mind_map: "mind_map",
      create_report: "report",
      create_quiz: "quiz",
      create_flashcards: "flashcards",
      create_infographic: "infographic",
      create_slide_deck: "slide_deck",
      create_data_table: "data_table",
      deep_research: "deep_research",
    };

    const docType = pipelineDocTypeMap[action] ?? "other";

    // ── Resolve final prompt ──────────────────────────────────────────────
    // Priority: 1) user-provided prompt (from 3-state modal),
    //           2) config template hydrated with role data,
    //           3) hardcoded fallback
    const resolvePrompt = async (): Promise<string> => {
      if (userPrompt && userPrompt.trim()) {
        return userPrompt;
      }

      const configTemplate = await getPromptTemplate(c.env, action);
      if (configTemplate) {
        return hydratePrompt(configTemplate, role, instruction);
      }

      // Hardcoded fallback — should rarely be reached
      return `Please generate ${docType.replaceAll("_", " ")} content about the role "${role.jobTitle}" at ${role.companyName}.${instruction ? `\n\nAdditional instructions: ${instruction}` : ""}`;
    };

    // For artifact creation, send prompt to NotebookLM via chat
    if (action !== "upload_source" && action !== "deep_research") {
      const fullPrompt = await resolvePrompt();

      let result;
      if (action === "create_mind_map") {
        result = await createMindMap(c.env);
      } else {
        result = await sendPodcastChatPrompt(c.env, fullPrompt);
      }

      // Log the artifact request in notebooklm_blobs
      const blobId = crypto.randomUUID();
      await db.insert(notebooklmBlobs).values({
        id: blobId,
        roleId,
        notebooklmId: c.env.CAREER_NOTEBOOKLM_ID,
        notebooklmMsgId: null,
        notebooklmSourceUuid: null,
        notebooklmRemoteId: null,
        filename: `${docType}-${blobId}`,
        md5: null,
        pipelineDocType: docType as any,
        notebooklmType: "artifact",
        artifactStatus: "requested",
        isActive: true,
      });

      return c.json({
        success: true,
        blobId,
        action,
        promptUsed: fullPrompt,
        result: action === "create_mind_map" ? { id: (result as any).id } : result,
      });
    }

    if (action === "deep_research") {
      const { startResearch } = await import("@/backend/ai/tools/notebooklm/notebooklm-sources");
      const query = userPrompt ?? (await resolvePrompt());
      const task = await startResearch(c.env, query, "web", "deep");

      const blobId = crypto.randomUUID();
      await db.insert(notebooklmBlobs).values({
        id: blobId,
        roleId,
        notebooklmId: c.env.CAREER_NOTEBOOKLM_ID,
        filename: `deep-research-${blobId}`,
        pipelineDocType: "deep_research",
        notebooklmType: "artifact",
        artifactStatus: "requested",
        isActive: true,
      });

      return c.json({ success: true, blobId, action, task });
    }

    // upload_source action handled separately
    return c.json({ error: "Use the source upload endpoint instead" }, 400);
  }) as any,
);

// ---------------------------------------------------------------------------
// GET /api/roles/:roleId/notebooklm/sources/sync — Sync sources from NotebookLM
// ---------------------------------------------------------------------------

notebooklmBlobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:roleId/notebooklm/sources/sync",
    operationId: "syncNotebooklmSources",
    responses: {
      200: {
        description: "Returns the current list of sources in the NotebookLM notebook",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  (async (c: any) => {
    const sources = await listSources(c.env);
    return c.json({ sources });
  }) as any,
);
