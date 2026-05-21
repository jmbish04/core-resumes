import { Agent, callable, getAgentByName, type Connection } from "agents";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { TemplateType } from "@/ai/tools/google/templates/template-engine";

import { getDb } from "@/db";
import { threads, messages, roles } from "@/db/schema";

import type { OrchestratorState, OrchestratorTask } from "./types";

import { checkHealth as healthProbeImpl } from "./health";
import {
  handleEnqueueTask,
  handleProcessPendingTasks,
  handleScrapeJob,
  handleExtractJobDetails,
  handleConsultNotebook,
  handleCreateDocFromTemplate,
  handleCreateDocFromHtml,
  handleCreateDocFromHtmlTemplate,
  handleCreateBrandedDocFromTemplate,
  handleExtractBrandColors,
  handleReadDoc,
  handleWriteDoc,
  handleCommentOnDoc,
  handleReplyToThread,
  handleReplyToDocComment,
  handleListDocCommentsTagged,
  handleListRoles,
  handleUpdateRole,
  handleDraftEmailReply,
} from "./methods";

const IncomingMessage = z.object({
  type: z.literal("chat"),
  content: z.string().min(1),
  roleId: z.string().optional(),
});

export class OrchestratorAgent extends Agent<Env, OrchestratorState> {
  static docsMetadata() {
    return {
      name: "Colby",
      className: "OrchestratorAgent",
      description:
        "The primary Project Management orchestrator agent. Colby tracks task state (e.g., job analysis, resume drafts), manages global & role-specific threads, and interfaces with specialized backend tools like Jules, NotebookLM, and Google Docs.",
      docsPath: "/docs/agents/orchestrator",
      methods: [
        {
          name: "enqueueTask",
          description: "Adds a task to the queue and broadcasts progress",
          params: "task: OrchestratorTask",
          returns: "OrchestratorTask",
        },
        {
          name: "scrape_job",
          description: "Scrape a job URL and extract raw text",
          params: "url: string",
          returns: "ScrapedContent",
        },
        {
          name: "extract_job_details",
          description: "Extract structured job details from raw text",
          params: "text: string",
          returns: "JobPosting",
        },
        {
          name: "generate_docs_from_script",
          description:
            "Generate a deterministic Resume or Cover Letter from structured script inputs",
          params: 'data: any, type: "resume" | "cover_letter"',
          returns: "Document metadata (ID and URL)",
        },
      ],
      tools: ["Google Docs", "NotebookLM SDK", "Cloudflare Browser Rendering", "Docs Generator"],
    };
  }

  initialState: OrchestratorState = {
    roleId: "global",
    pendingTasks: [],
  };

  onConnect(_connection: Connection) {
    this.getLogger().then((logger) =>
      logger.info(`[OrchestratorAgent][${this.name}] WebSocket connected.`),
    );
  }

  onClose(_connection: Connection) {
    this.getLogger().then((logger) =>
      logger.info(`[OrchestratorAgent][${this.name}] WebSocket disconnected.`),
    );
  }

  onError(error: unknown) {
    this.getLogger().then((logger) =>
      logger.error(`[OrchestratorAgent][${this.name}] Server Error`, { error: String(error) }),
    );
  }

  private async getLogger() {
    const { Logger } = await import("@/backend/lib/logger");
    return new Logger(this.env);
  }

  // Callable RPC method invoked by the Workflow
  async handleWorkflowProgress(payload: { roleId: string; status: string; percent: number }) {
    // Broadcast progress to all connected frontend clients
    this.broadcast(
      JSON.stringify({
        type: "WORKFLOW_PROGRESS",
        payload,
      }),
    );
  }

  // Triggered via HTTP or internal logic to kick off the pipeline
  async analyzeRole(roleId: string) {
    // Pass our instance name so the Workflow can reach us via getAgentByName
    const orchestratorAgentName = this.name;

    // Kick off the durable Workflow
    await this.env.ROLE_ANALYSIS_WORKFLOW.create({
      params: { roleId, orchestratorAgentName },
    });

    this.broadcast(
      JSON.stringify({
        type: "WORKFLOW_STARTED",
        payload: { roleId, status: "started", percent: 0 },
      }),
    );
  }

  /** In-memory guard to prevent concurrent processPendingTasks loops */
  private _processing = false;
  private _processingRetrigger = false;

  async onStart() {
    let updatedState = { ...this.state };
    let stateChanged = false;

    // If we're a role-specific agent, bind our role ID from our instance name.
    if (this.name !== "global" && this.state.roleId === "global") {
      updatedState.roleId = this.name;
      stateChanged = true;
    }

    // Recover any tasks that were stuck in "running" if the DO was evicted or crashed
    const hasStuckTasks = updatedState.pendingTasks.some((t) => t.status === "running");
    if (hasStuckTasks) {
      updatedState.pendingTasks = updatedState.pendingTasks.map((task) => {
        if (task.status === "running") {
          return { ...task, status: "failed", error: "Execution interrupted or timed out" };
        }
        return task;
      });
      stateChanged = true;
    }

    if (stateChanged) {
      this.setState(updatedState);
    }
  }

  async onMessage(connection: Connection, message: unknown) {
    const logger = await this.getLogger();
    await logger.info(`[OrchestratorAgent][${this.name}] Received message`, { message });
    try {
      const parsed = IncomingMessage.parse(
        typeof message === "string" ? JSON.parse(message) : message,
      );
      const roleId = parsed.roleId ?? (this.state.roleId !== "global" ? this.state.roleId : null);
      const thread = await this.ensureThread(roleId);

      await this.addMessage(thread.id, roleId, "user", parsed.content);

      this.broadcast(
        JSON.stringify({
          type: "message_ack",
          threadId: thread.id,
        }),
      );

      // Simple echo/acknowledgment reply for now (until full orchestration is hooked up here)
      await this.reply_to_thread(
        roleId ?? "global",
        "I've received your message and added it to the thread context.",
      );
    } catch {
      connection.send(JSON.stringify({ type: "error", message: "Invalid chat payload" }));
    }
  }

  @callable()
  async enqueueTask(task: Omit<OrchestratorTask, "id" | "status">) {
    const nextTask = await handleEnqueueTask(this, task);
    // Background execution
    this.ctx.waitUntil(this.processPendingTasks());
    return nextTask;
  }

  @callable()
  async processPendingTasks() {
    // Guard: if already processing, flag a re-trigger and return.
    // This prevents concurrent loops from racing on the same pending tasks.
    if (this._processing) {
      this._processingRetrigger = true;
      return;
    }

    this._processing = true;
    try {
      await handleProcessPendingTasks(this, this.env);
    } finally {
      this._processing = false;
    }

    // If new tasks were enqueued while we were processing, re-run
    if (this._processingRetrigger) {
      this._processingRetrigger = false;
      this.ctx.waitUntil(this.processPendingTasks());
    }
  }

  @callable()
  async getProcessingStatus() {
    return {
      roleId: this.state.roleId,
      tasks: this.state.pendingTasks.map((t) => ({
        id: t.id,
        type: t.type,
        status: t.status,
        error: t.error,
        roleId: t.roleId,
      })),
    };
  }

  @callable()
  async retryTask(taskId: string) {
    const task = this.state.pendingTasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (task.status !== "failed")
      throw new Error(`Task ${taskId} is not failed (status: ${task.status})`);

    // Reset to pending and re-process
    this.updateTask(taskId, { status: "pending", error: undefined });
    this.broadcastProgress("retry", { ...task, status: "pending" });
    this.ctx.waitUntil(this.processPendingTasks());
    return { taskId, status: "retrying" };
  }

  @callable()
  async retryFailedTasks() {
    const failedTasks = this.state.pendingTasks.filter((t) => t.status === "failed");
    if (failedTasks.length === 0) throw new Error("No failed tasks to retry");

    for (const task of failedTasks) {
      this.updateTask(task.id, { status: "pending", error: undefined });
      this.broadcastProgress("retry", { ...task, status: "pending" });
    }

    // Clear persisted processing errors from role metadata
    if (this.state.roleId && this.state.roleId !== "global") {
      try {
        const db = getDb(this.env);
        const [role] = await db
          .select()
          .from(roles)
          .where(eq(roles.id, this.state.roleId))
          .limit(1);
        if (role) {
          const meta = (role.metadata as Record<string, unknown>) ?? {};
          delete meta.processingErrors;
          await db
            .update(roles)
            .set({ status: "preparing", metadata: meta, updatedAt: new Date() })
            .where(eq(roles.id, this.state.roleId));
        }
      } catch (err) {
        const logger = await this.getLogger();
        await logger.error("Failed to clear processing errors (non-fatal)", { error: String(err) });
      }
    }

    this.ctx.waitUntil(this.processPendingTasks());
    return { retried: failedTasks.length };
  }

  @callable()
  async scrape_job(url: string) {
    return handleScrapeJob(this.env, url);
  }

  @callable()
  async extract_job_details(
    text: string,
    scrapedElements?: import("@/ai/tools/browser-rendering").ScrapeResult,
  ) {
    return handleExtractJobDetails(this.env, text, scrapedElements);
  }

  @callable()
  async consult_notebook(query: string) {
    return handleConsultNotebook(this.env, query);
  }

  @callable()
  async create_doc_from_template(
    templateId: string,
    vars: Record<string, string>,
    folderId: string,
  ) {
    return handleCreateDocFromTemplate(this.env, templateId, vars, folderId);
  }

  @callable()
  async create_doc_from_html(name: string, htmlContent: string, folderId: string) {
    return handleCreateDocFromHtml(this.env, name, htmlContent, folderId);
  }

  @callable()
  async create_doc_from_html_template(
    templateType: TemplateType,
    variables: Record<string, unknown>,
    folderId: string,
    name?: string,
  ) {
    return handleCreateDocFromHtmlTemplate(this.env, templateType, variables, folderId, name);
  }

  @callable()
  async create_branded_doc(
    templateType: TemplateType,
    variables: Record<string, unknown>,
    companyName: string,
    folderId: string,
    name?: string,
  ) {
    return handleCreateBrandedDocFromTemplate(
      this.env,
      templateType,
      variables,
      companyName,
      folderId,
      name,
    );
  }

  @callable()
  async extract_brand_colors(companyId: string) {
    return handleExtractBrandColors(this.env, companyId);
  }

  @callable()
  async read_doc(docId: string) {
    return handleReadDoc(this.env, docId);
  }

  @callable()
  async write_doc(docId: string, text: string) {
    return handleWriteDoc(this.env, docId, text);
  }

  @callable()
  async comment_on_doc(docId: string, anchor: string, text: string) {
    return handleCommentOnDoc(this.env, docId, anchor, text);
  }

  @callable()
  async reply_to_thread(roleId: string, text: string) {
    return handleReplyToThread(this, roleId, text);
  }

  @callable()
  async reply_to_doc_comment(docId: string, commentId: string, text: string) {
    return handleReplyToDocComment(this.env, docId, commentId, text);
  }

  @callable()
  async list_doc_comments_tagged(docId: string, tag = "#colby") {
    return handleListDocCommentsTagged(this.env, docId, tag);
  }

  @callable()
  async list_roles(status?: string) {
    return handleListRoles(this, this.env, status);
  }

  @callable()
  async update_role(id: string, patch: Partial<typeof roles.$inferInsert>) {
    return handleUpdateRole(this, this.env, id, patch);
  }

  @callable()
  async draft_email_reply(emailId: string) {
    return handleDraftEmailReply(this, this.env, emailId);
  }

  /**
   * Draft a resume or cover letter for a role using the NotebookLM-backed
   * multi-phase pipeline. Broadcasts progress via WebSocket.
   */
  @callable()
  async draft_resume(roleId: string, docType: "resume" | "cover_letter" = "resume") {
    const { draftWithNotebook } = await import("@/ai/tasks/draft/notebook");
    return draftWithNotebook({
      env: this.env,
      roleId,
      docType,
      onProgress: (progress) =>
        this.broadcast(JSON.stringify({ type: "draft_progress", roleId, progress })),
    });
  }

  /**
   * Respond to all @colby / #colby tagged comments on a Google Doc.
   * Consults NotebookLM for career evidence and posts replies.
   */
  @callable()
  async respond_to_comments(roleId: string, gdocId: string) {
    const { respondToComments } = await import("@/ai/tasks/respond-to-comments");
    return respondToComments(this.env, roleId, gdocId, (progress) => {
      this.broadcast(JSON.stringify({ type: "comment_progress", roleId, gdocId, progress }));
    });
  }

  /**
   * Generate a deterministic Resume or Cover Letter using the scripted templates.
   */
  @callable()
  async generate_docs_from_script(data: any, type: "resume" | "cover_letter") {
    const { generateResumeHtml, generateCoverLetterHtml } =
      await import("@/services/docs-generator");
    const { GoogleDriveClient } = await import("@/ai/tools/google/drive");
    const { getDb } = await import("@/db");
    const { documents, roles } = await import("@/db/schema");
    const { eq, desc } = await import("drizzle-orm");

    const driveClient = new GoogleDriveClient(this.env);
    let folderId: string = this.env.PARENT_DRIVE_FOLDER_ID;
    let db = null;

    if (data.roleId) {
      db = getDb(this.env);
      const [role] = await db.select().from(roles).where(eq(roles.id, data.roleId)).limit(1);
      if (role) {
        if (role.driveFolderId) {
          folderId = role.driveFolderId;
        } else {
          const folder = await driveClient.createFolder(
            `${role.companyName} - ${role.jobTitle}`,
            this.env.PARENT_DRIVE_FOLDER_ID,
          );
          folderId = folder.id;
          await db
            .update(roles)
            .set({ driveFolderId: folderId, updatedAt: new Date() })
            .where(eq(roles.id, role.id));
        }
      }
    }

    if (type === "resume") {
      const htmlContent = generateResumeHtml(data);
      const docName = `Resume - ${data.targetRole} - Justin Bishop`;
      const createdDoc = await driveClient.createDocFromHtml(docName, htmlContent, folderId);

      if (data.roleId && db) {
        const existingDocs = await db
          .select()
          .from(documents)
          .where(eq(documents.roleId, data.roleId))
          .orderBy(desc(documents.version));
        const resumeDocs = existingDocs.filter((d) => d.type === "resume");
        const nextVersion = resumeDocs.length > 0 ? resumeDocs[0].version + 1 : 1;

        await db.insert(documents).values({
          id: crypto.randomUUID(),
          gdocId: createdDoc.id,
          roleId: data.roleId,
          type: "resume",
          name: docName,
          version: nextVersion,
        });
      }
      return {
        success: true,
        documentId: createdDoc.id,
        documentUrl:
          createdDoc.webViewLink || `https://docs.google.com/document/d/${createdDoc.id}/edit`,
      };
    } else {
      const htmlContent = generateCoverLetterHtml(data);
      const docName = `Cover Letter - ${data.companyName} - ${data.targetRole}`;
      const createdDoc = await driveClient.createDocFromHtml(docName, htmlContent, folderId);

      if (data.roleId && db) {
        const existingDocs = await db
          .select()
          .from(documents)
          .where(eq(documents.roleId, data.roleId))
          .orderBy(desc(documents.version));
        const clDocs = existingDocs.filter((d) => d.type === "cover_letter");
        const nextVersion = clDocs.length > 0 ? clDocs[0].version + 1 : 1;

        await db.insert(documents).values({
          id: crypto.randomUUID(),
          gdocId: createdDoc.id,
          roleId: data.roleId,
          type: "cover_letter",
          name: docName,
          version: nextVersion,
        });
      }
      return {
        success: true,
        documentId: createdDoc.id,
        documentUrl:
          createdDoc.webViewLink || `https://docs.google.com/document/d/${createdDoc.id}/edit`,
      };
    }
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }

  public updateTask(id: string, patch: Partial<OrchestratorTask>) {
    this.setState({
      ...this.state,
      pendingTasks: this.state.pendingTasks.map((task) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    });
  }

  public broadcastProgress(stage: string, task: OrchestratorTask) {
    this.broadcast(JSON.stringify({ type: "task", stage, task }));
  }

  public async ensureThread(roleId: string | null) {
    const db = getDb(this.env);
    const whereClause = roleId ? eq(threads.roleId, roleId) : eq(threads.title, "Global");
    const [existing] = await db
      .select()
      .from(threads)
      .where(whereClause)
      .orderBy(desc(threads.createdAt))
      .limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(threads)
      .values({
        id: crypto.randomUUID(),
        title: roleId ? "Role thread" : "Global",
        roleId,
      })
      .returning();

    return created;
  }

  public async addMessage(
    threadId: string,
    roleId: string | null,
    author: "user" | "agent" | "system",
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    const db = getDb(this.env);
    const [message] = await db
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        threadId,
        roleId,
        author,
        content,
        metadata,
      })
      .returning();

    return message;
  }
}

export async function enqueueOrchestratorTask(
  env: Env,
  roleId: string | "global",
  task: Omit<OrchestratorTask, "id" | "status">,
) {
  const stub = await getAgentByName(env.ORCHESTRATOR_AGENT, roleId);
  return stub.enqueueTask(task);
}
