import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { eq, desc } from "drizzle-orm";
import { GoogleDriveClient } from "../../ai/tools/google/drive";
import { getDb } from "../../db";
import { documents } from "../../db/schema";
import type { AppBindings } from "../index";
import {
  ResumeRequestSchema,
  CoverLetterRequestSchema,
  DocumentResponseSchema,
  generateResumeHtml,
  generateCoverLetterHtml,
} from "../../services/docs-generator";

export const docsGeneratorRouter = new OpenAPIHono<AppBindings>();

// ---------------------------------------------------------------------------
// POST /api/docs-generator/generate-resume
// ---------------------------------------------------------------------------
docsGeneratorRouter.openapi(
  createRoute({
    method: "post",
    path: "/generate-resume",
    operationId: "generateResume",
    summary: "Generate a Resume Google Doc from a script payload",
    description: "Creates a formatted Google Doc resume from deterministic inputs.",
    request: {
      body: {
        content: { "application/json": { schema: ResumeRequestSchema } },
        description: "Payload containing resume data",
      },
    },
    responses: {
      200: {
        description: "Generated Document metadata",
        content: { "application/json": { schema: DocumentResponseSchema } },
      },
      500: { description: "Server Error" },
    },
  }),
  (async (c: any) => {
    const data = c.req.valid("json");
    const { roleId, targetRole } = data;
    
    // 1. Generate HTML
    const htmlContent = generateResumeHtml(data);
    
    // 2. Setup Google Drive Client
    const driveClient = new GoogleDriveClient(c.env);
    
    // Get folder ID (try role-specific or fallback to global)
    let folderId = c.env.PARENT_DRIVE_FOLDER_ID;
    
    // 3. Create folder if missing for role
    const db = getDb(c.env);
    if (roleId) {
      const { roles } = await import("@/backend/db/schema");
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (role) {
        if (role.driveFolderId) {
          folderId = role.driveFolderId;
        } else {
          const folder = await driveClient.createFolder(
            `${role.companyName} - ${role.jobTitle}`,
            c.env.PARENT_DRIVE_FOLDER_ID
          );
          folderId = folder.id;
          await db.update(roles).set({ driveFolderId: folderId, updatedAt: new Date() }).where(eq(roles.id, role.id));
        }
      }
    }
    
    // 4. Create document in Google Drive
    const docName = `Resume - ${targetRole} - Justin Bishop`;
    const createdDoc = await driveClient.createDocFromHtml(docName, htmlContent, folderId);
    
    // 5. Optionally insert into DB if roleId provided
    if (roleId) {
      // Determine version
      const existingDocs = await db.select().from(documents).where(eq(documents.roleId, roleId)).orderBy(desc(documents.version));
      const resumeDocs = existingDocs.filter(d => d.type === "resume");
      const nextVersion = resumeDocs.length > 0 ? resumeDocs[0].version + 1 : 1;

      await db.insert(documents).values({
        id: crypto.randomUUID(),
        gdocId: createdDoc.id,
        roleId,
        type: "resume",
        name: docName,
        version: nextVersion,
      });
    }

    return c.json({
      success: true,
      documentId: createdDoc.id,
      documentUrl: createdDoc.webViewLink || `https://docs.google.com/document/d/${createdDoc.id}/edit`,
    });
  }) as any
);

// ---------------------------------------------------------------------------
// POST /api/docs-generator/generate-cover-letter
// ---------------------------------------------------------------------------
docsGeneratorRouter.openapi(
  createRoute({
    method: "post",
    path: "/generate-cover-letter",
    operationId: "generateCoverLetter",
    summary: "Generate a Cover Letter Google Doc from a script payload",
    description: "Creates a formatted Google Doc cover letter from deterministic inputs.",
    request: {
      body: {
        content: { "application/json": { schema: CoverLetterRequestSchema } },
        description: "Payload containing cover letter data",
      },
    },
    responses: {
      200: {
        description: "Generated Document metadata",
        content: { "application/json": { schema: DocumentResponseSchema } },
      },
      500: { description: "Server Error" },
    },
  }),
  (async (c: any) => {
    const data = c.req.valid("json");
    const { roleId, targetRole, companyName } = data;
    
    // 1. Generate HTML
    const htmlContent = generateCoverLetterHtml(data);
    
    // 2. Setup Google Drive Client
    const driveClient = new GoogleDriveClient(c.env);
    
    // Get folder ID (try role-specific or fallback to global)
    let folderId = c.env.PARENT_DRIVE_FOLDER_ID;
    
    // 3. Create folder if missing for role
    const db = getDb(c.env);
    if (roleId) {
      const { roles } = await import("../../db/schema");
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
      if (role) {
        if (role.driveFolderId) {
          folderId = role.driveFolderId;
        } else {
          const folder = await driveClient.createFolder(
            `${role.companyName} - ${role.jobTitle}`,
            c.env.PARENT_DRIVE_FOLDER_ID
          );
          folderId = folder.id;
          await db.update(roles).set({ driveFolderId: folderId, updatedAt: new Date() }).where(eq(roles.id, role.id));
        }
      }
    }
    
    // 4. Create document in Google Drive
    const docName = `Cover Letter - ${companyName} - ${targetRole}`;
    const createdDoc = await driveClient.createDocFromHtml(docName, htmlContent, folderId);
    
    // 5. Optionally insert into DB if roleId provided
    if (roleId) {
      // Determine version
      const existingDocs = await db.select().from(documents).where(eq(documents.roleId, roleId)).orderBy(desc(documents.version));
      const clDocs = existingDocs.filter(d => d.type === "cover_letter");
      const nextVersion = clDocs.length > 0 ? clDocs[0].version + 1 : 1;

      await db.insert(documents).values({
        id: crypto.randomUUID(),
        gdocId: createdDoc.id,
        roleId,
        type: "cover_letter",
        name: docName,
        version: nextVersion,
      });
    }

    return c.json({
      success: true,
      documentId: createdDoc.id,
      documentUrl: createdDoc.webViewLink || `https://docs.google.com/document/d/${createdDoc.id}/edit`,
    });
  }) as any
);
