/**
 * @fileoverview API routes that serve structured metadata to the /docs
 * frontend pages (schema, agents, notebooklm).
 *
 * Table and column descriptions are imported from the Drizzle schema modules
 * so that documentation stays co-located with the source of truth.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { NotebookLMAgent } from "../../ai/agents/notebooklm";
import { NotebookLMMcpAgent } from "../../ai/agents/notebooklm-mcp";
import { OrchestratorAgent } from "../../ai/agents/orchestrator";
import {
  DOCUMENTS_TABLE_DESCRIPTION,
  DOCUMENTS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/documents";
import { EMAILS_TABLE_DESCRIPTION, EMAILS_COLUMN_DESCRIPTIONS } from "../../db/schemas/emails";
import {
  EMAIL_PARTIES_TABLE_DESCRIPTION,
  EMAIL_PARTIES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/email-parties";
import {
  EMAIL_ATTACHMENTS_TABLE_DESCRIPTION,
  EMAIL_ATTACHMENTS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/email-attachments";
import {
  GLOBAL_CONFIG_TABLE_DESCRIPTION,
  GLOBAL_CONFIG_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/global-config";
import {
  INTERVIEW_NOTES_TABLE_DESCRIPTION,
  INTERVIEW_NOTES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/interview-notes";
import {
  INTERVIEW_RECORDINGS_TABLE_DESCRIPTION,
  INTERVIEW_RECORDINGS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/interview-recordings";
import {
  JOB_FAILURES_TABLE_DESCRIPTION,
  JOB_FAILURES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/job-failures";
import {
  MESSAGES_TABLE_DESCRIPTION,
  MESSAGES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/messages";
import {
  RESUME_BULLETS_TABLE_DESCRIPTION,
  RESUME_BULLETS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/resume-bullets";
import {
  ROLE_BULLET_ANALYSES_TABLE_DESCRIPTION,
  ROLE_BULLET_ANALYSES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-bullet-analyses";
import {
  ROLE_BULLETS_TABLE_DESCRIPTION,
  ROLE_BULLETS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-bullets";
// Import table & column descriptions from schema modules
import {
  ROLE_INSIGHTS_TABLE_DESCRIPTION,
  ROLE_INSIGHTS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-insights";
import {
  ROLE_PODCASTS_TABLE_DESCRIPTION,
  ROLE_PODCASTS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-podcasts";
import { ROLES_TABLE_DESCRIPTION, ROLES_COLUMN_DESCRIPTIONS } from "../../db/schemas/roles";
import {
  SCORING_RUBRICS_TABLE_DESCRIPTION,
  SCORING_RUBRICS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/scoring-rubrics";
import { THREADS_TABLE_DESCRIPTION, THREADS_COLUMN_DESCRIPTIONS } from "../../db/schemas/threads";
import {
  TRANSCRIPTION_CHUNKS_TABLE_DESCRIPTION,
  TRANSCRIPTION_CHUNKS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/transcription-chunks";
import {
  TRANSCRIPTION_JOBS_TABLE_DESCRIPTION,
  TRANSCRIPTION_JOBS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/transcription-jobs";
import {
  NOTEBOOKLM_BLOBS_TABLE_DESCRIPTION,
  NOTEBOOKLM_BLOBS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/notebooklm-blobs";
import {
  NOTEBOOKLM_PODCAST_TRANSCRIPT_TABLE_DESCRIPTION,
  NOTEBOOKLM_PODCAST_TRANSCRIPT_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/notebooklm-podcast-transcript";
import {
  STATUSES_TABLE_DESCRIPTION,
  STATUSES_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/statuses";
import {
  ROLE_STATUS_LOG_TABLE_DESCRIPTION,
  ROLE_STATUS_LOG_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-status-log";
import {
  ROLE_LOGS_TABLE_DESCRIPTION,
  ROLE_LOGS_COLUMN_DESCRIPTIONS,
} from "../../db/schemas/role-logs";

// ---------------------------------------------------------------------------
// Registry — maps D1 table name → descriptions from schema modules
// ---------------------------------------------------------------------------

type TableDocEntry = {
  tableDescription: string;
  columnDescriptions: Record<string, string>;
};

/**
 * Central registry mapping each D1 table name to its documentation constants.
 * When adding a new table schema file, add its descriptions here as well.
 */
const TABLE_DOCS: Record<string, TableDocEntry> = {
  roles: {
    tableDescription: ROLES_TABLE_DESCRIPTION,
    columnDescriptions: ROLES_COLUMN_DESCRIPTIONS,
  },
  documents: {
    tableDescription: DOCUMENTS_TABLE_DESCRIPTION,
    columnDescriptions: DOCUMENTS_COLUMN_DESCRIPTIONS,
  },
  threads: {
    tableDescription: THREADS_TABLE_DESCRIPTION,
    columnDescriptions: THREADS_COLUMN_DESCRIPTIONS,
  },
  messages: {
    tableDescription: MESSAGES_TABLE_DESCRIPTION,
    columnDescriptions: MESSAGES_COLUMN_DESCRIPTIONS,
  },
  emails: {
    tableDescription: EMAILS_TABLE_DESCRIPTION,
    columnDescriptions: EMAILS_COLUMN_DESCRIPTIONS,
  },
  email_parties: {
    tableDescription: EMAIL_PARTIES_TABLE_DESCRIPTION,
    columnDescriptions: EMAIL_PARTIES_COLUMN_DESCRIPTIONS,
  },
  email_attachments: {
    tableDescription: EMAIL_ATTACHMENTS_TABLE_DESCRIPTION,
    columnDescriptions: EMAIL_ATTACHMENTS_COLUMN_DESCRIPTIONS,
  },
  global_config: {
    tableDescription: GLOBAL_CONFIG_TABLE_DESCRIPTION,
    columnDescriptions: GLOBAL_CONFIG_COLUMN_DESCRIPTIONS,
  },
  job_failures: {
    tableDescription: JOB_FAILURES_TABLE_DESCRIPTION,
    columnDescriptions: JOB_FAILURES_COLUMN_DESCRIPTIONS,
  },
  resume_bullets: {
    tableDescription: RESUME_BULLETS_TABLE_DESCRIPTION,
    columnDescriptions: RESUME_BULLETS_COLUMN_DESCRIPTIONS,
  },
  interview_notes: {
    tableDescription: INTERVIEW_NOTES_TABLE_DESCRIPTION,
    columnDescriptions: INTERVIEW_NOTES_COLUMN_DESCRIPTIONS,
  },
  interview_recordings: {
    tableDescription: INTERVIEW_RECORDINGS_TABLE_DESCRIPTION,
    columnDescriptions: INTERVIEW_RECORDINGS_COLUMN_DESCRIPTIONS,
  },
  transcription_jobs: {
    tableDescription: TRANSCRIPTION_JOBS_TABLE_DESCRIPTION,
    columnDescriptions: TRANSCRIPTION_JOBS_COLUMN_DESCRIPTIONS,
  },
  transcription_chunks: {
    tableDescription: TRANSCRIPTION_CHUNKS_TABLE_DESCRIPTION,
    columnDescriptions: TRANSCRIPTION_CHUNKS_COLUMN_DESCRIPTIONS,
  },
  role_bullets: {
    tableDescription: ROLE_BULLETS_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_BULLETS_COLUMN_DESCRIPTIONS,
  },
  role_bullet_analyses: {
    tableDescription: ROLE_BULLET_ANALYSES_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_BULLET_ANALYSES_COLUMN_DESCRIPTIONS,
  },
  role_podcasts: {
    tableDescription: ROLE_PODCASTS_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_PODCASTS_COLUMN_DESCRIPTIONS,
  },
  scoring_rubrics: {
    tableDescription: SCORING_RUBRICS_TABLE_DESCRIPTION,
    columnDescriptions: SCORING_RUBRICS_COLUMN_DESCRIPTIONS,
  },
  role_insights: {
    tableDescription: ROLE_INSIGHTS_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_INSIGHTS_COLUMN_DESCRIPTIONS,
  },
  notebooklm_blobs: {
    tableDescription: NOTEBOOKLM_BLOBS_TABLE_DESCRIPTION,
    columnDescriptions: NOTEBOOKLM_BLOBS_COLUMN_DESCRIPTIONS,
  },
  notebooklm_podcast_transcript: {
    tableDescription: NOTEBOOKLM_PODCAST_TRANSCRIPT_TABLE_DESCRIPTION,
    columnDescriptions: NOTEBOOKLM_PODCAST_TRANSCRIPT_COLUMN_DESCRIPTIONS,
  },
  statuses: {
    tableDescription: STATUSES_TABLE_DESCRIPTION,
    columnDescriptions: STATUSES_COLUMN_DESCRIPTIONS,
  },
  role_status_log: {
    tableDescription: ROLE_STATUS_LOG_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_STATUS_LOG_COLUMN_DESCRIPTIONS,
  },
  role_logs: {
    tableDescription: ROLE_LOGS_TABLE_DESCRIPTION,
    columnDescriptions: ROLE_LOGS_COLUMN_DESCRIPTIONS,
  },
};

const TABLE_NAMES = Object.keys(TABLE_DOCS);

// ---------------------------------------------------------------------------
// Zod schemas for responses
// ---------------------------------------------------------------------------

const columnSchema = z.object({
  cid: z.number(),
  name: z.string(),
  type: z.string(),
  notnull: z.number(),
  dflt_value: z.unknown().nullable(),
  pk: z.number(),
  description: z.string(),
});

const foreignKeySchema = z.object({
  id: z.number(),
  seq: z.number(),
  table: z.string(),
  from: z.string(),
  to: z.string(),
  on_update: z.string(),
  on_delete: z.string(),
});

const tableInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  columns: z.array(columnSchema),
  foreignKeys: z.array(foreignKeySchema),
});

const schemaResponseSchema = z.object({
  tables: z.array(tableInfoSchema),
});

const agentMetadataSchema = z.object({
  name: z.string(),
  className: z.string(),
  description: z.string(),
  docsPath: z.string(),
  methods: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      params: z.string().optional(),
      returns: z.string().optional(),
    }),
  ),
  tools: z.array(z.string()),
  aiModels: z.array(z.string()).optional(),
  mcpTools: z
    .array(z.object({ name: z.string(), description: z.string(), inputSchema: z.string() }))
    .optional(),
  systemPrompt: z.string().optional(),
  stateShape: z.string().optional(),
  scheduledTasks: z.array(z.string()).optional(),
});

const agentsResponseSchema = z.object({
  agents: z.array(agentMetadataSchema),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const docsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET /api/docs/schema
docsRouter.openapi(
  createRoute({
    method: "get",
    path: "/schema",
    operationId: "docsSchema",
    responses: {
      200: {
        description:
          "Live D1 table schema via PRAGMA queries, enriched with descriptions from schema modules",
        content: { "application/json": { schema: schemaResponseSchema } },
      },
    },
  }),
  (async (c: any) => {
    const d1 = c.env.DB;
    const tables = [];

    for (const tableName of TABLE_NAMES) {
      const docs = TABLE_DOCS[tableName]!;

      const [columnsResult, fkResult] = await Promise.all([
        d1.prepare(`PRAGMA table_info("${tableName}")`).all(),
        d1.prepare(`PRAGMA foreign_key_list("${tableName}")`).all(),
      ]);

      // Enrich each PRAGMA column with its human-readable description
      const columns = (
        columnsResult.results as unknown as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: unknown;
          pk: number;
        }[]
      ).map((col) => ({
        ...col,
        description: docs.columnDescriptions[col.name] ?? "",
      }));

      tables.push({
        name: tableName,
        description: docs.tableDescription,
        columns,
        foreignKeys: fkResult.results as unknown as z.infer<typeof foreignKeySchema>[],
      });
    }

    return c.json({ tables });
  }) as any,
);

// GET /api/docs/agents
docsRouter.openapi(
  createRoute({
    method: "get",
    path: "/agents",
    operationId: "docsAgents",
    responses: {
      200: {
        description: "Agent metadata for documentation",
        content: { "application/json": { schema: agentsResponseSchema } },
      },
    },
  }),
  (async (c: any) => {
    const agents = [
      OrchestratorAgent.docsMetadata(),
      NotebookLMAgent.docsMetadata(),
      NotebookLMMcpAgent.docsMetadata(),
    ];

    return c.json({ agents });
  }) as any,
);

// ---------------------------------------------------------------------------
// GET /api/docs/notebooklm — NotebookLM configuration & metadata
// ---------------------------------------------------------------------------

const notebookInfoSchema = z.object({
  notebookId: z.string(),
  notebookUrl: z.string(),
  notebookName: z.string(),
  chatEndpoint: z.string(),
  mcpEndpoint: z.string(),
  credentialSources: z.array(
    z.object({
      name: z.string(),
      storage: z.string(),
      binding: z.string(),
    }),
  ),
  agentIntegrations: z.array(
    z.object({
      agentName: z.string(),
      agentDocsPath: z.string(),
      description: z.string(),
    }),
  ),
});

docsRouter.openapi(
  createRoute({
    method: "get",
    path: "/notebooklm",
    operationId: "docsNotebookLM",
    responses: {
      200: {
        description: "NotebookLM configuration and integration metadata",
        content: { "application/json": { schema: notebookInfoSchema } },
      },
    },
  }),
  (async (c: any) => {
    const notebookId = c.env.CAREER_NOTEBOOKLM_ID ?? "";

    return c.json({
      notebookId,
      notebookUrl: `https://notebooklm.google.com/notebook/${notebookId}`,
      notebookName: "Career Knowledge Base",
      chatEndpoint: "/api/notebook/chat",
      mcpEndpoint: "/mcp/notebooklm",
      credentialSources: [
        {
          name: "Session Cookies",
          storage: "KV (hot-swap)",
          binding: "ACTIVE_NOTEBOOKLM_SESSION",
        },
        {
          name: "CSRF Token Cache",
          storage: "KV (auto-managed, sliding TTL)",
          binding: "NOTEBOOKLM_CSRF_CACHE",
        },
        {
          name: "Notebook ID",
          storage: "Env var (wrangler.jsonc)",
          binding: "CAREER_NOTEBOOKLM_ID",
        },
      ],
      agentIntegrations: [
        {
          agentName: "OrchestratorAgent",
          agentDocsPath: "/docs/agents/orchestrator",
          description:
            "Calls consult_notebook() during resume generation and job analysis to retrieve full career context from the knowledge base.",
        },
        {
          agentName: "NotebookLMAgent",
          agentDocsPath: "/docs/agents/notebooklm",
          description:
            "Dedicated Durable Object providing callable RPC and WebSocket access to the knowledge base for the frontend chat and internal code.",
        },
        {
          agentName: "NotebookLMMcpAgent",
          agentDocsPath: "/docs/agents/notebooklm-mcp",
          description:
            "Remote MCP server exposing the knowledge base to external AI tools (Claude, Cursor) via the Model Context Protocol.",
        },
      ],
    });
  }) as any,
);
