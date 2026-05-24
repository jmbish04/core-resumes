/**
 * @fileoverview AI task to match inbound emails to active job application roles.
 */

import type { Role } from "@/backend/db/schema";

import { enforceTokenLimit } from "../../../utils/token-estimator";

export type EmailRoleMatchResult = {
  messageId: string;
  roleId: string | null;
  aiRationale: string;
  aiConfidence: number;
};

const EMAIL_ROLE_MATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    messageId: { type: "string" as const },
    roleId: {
      type: ["string", "null"] as const,
      description: "The ID of the matching role, or null if no confident match could be made.",
    },
    aiRationale: {
      type: "string" as const,
      description: "Detailed reasoning for the matching decision or why a match couldn't be made.",
    },
    aiConfidence: {
      type: "integer" as const,
      description: "Confidence score from 0 to 100 for the matching decision.",
    },
  },
  required: ["messageId", "roleId", "aiRationale", "aiConfidence"] as const,
};

const SYSTEM_PROMPT = `You are an intelligent email routing assistant. Your job is to determine which active job application role an inbound email belongs to.

<INSTRUCTIONS>
1. Examine the email sender domain, subject, and body.
2. Compare the email context against the provided <ACTIVE_ROLES>.
3. Look for strong domain matches (e.g., sender domain matches the company domain) or strong contextual matches (e.g., recruiter mentioning the specific company and job title).
4. If there are multiple roles at the same company, use context clues in the email body or subject to disambiguate.
5. If there is a clear, confident match, output the matching roleId.
6. If the email is generic (e.g., spam, newsletter), from an irrelevant domain, or does not match any active role, output null for roleId.
7. Provide a detailed rationale for your decision and a confidence score (0-100).
8. Only match if you are reasonably confident (>50).
</INSTRUCTIONS>`;

export async function matchEmailToRole(
  env: Env,
  messageId: string,
  subject: string,
  body: string,
  senderDomain: string,
  activeRoles: Role[],
): Promise<EmailRoleMatchResult> {
  enforceTokenLimit(body, 100000, "Email Body");

  const rolesList = activeRoles
    .map(
      (r) =>
        `- ID: ${r.id} | Company: ${r.companyName} | Title: ${r.jobTitle} | Domain: ${
          (r.metadata as any)?.domain || "unknown"
        }`,
    )
    .join("\n");

  const userPrompt = `
<INBOUND_EMAIL>
Message-ID: ${messageId}
Sender Domain: ${senderDomain}
Subject: ${subject}
Body:
${body}
</INBOUND_EMAIL>

<ACTIVE_ROLES>
${rolesList}
</ACTIVE_ROLES>
`;

  try {
    const response = (await env.AI.run(
      env.MODEL_EXTRACT as Parameters<typeof env.AI.run>[0],
      {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "email_role_match",
            strict: true,
            schema: EMAIL_ROLE_MATCH_SCHEMA,
          },
        },
        max_tokens: 1024,
        temperature: 0.1,
      },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { response?: string };

    const parsed = JSON.parse(response.response ?? "{}") as EmailRoleMatchResult;

    // Validate roleId exists in activeRoles
    if (parsed.roleId && !activeRoles.some((r) => r.id === parsed.roleId)) {
      parsed.roleId = null;
      parsed.aiRationale = "Selected role ID was not in the active roles list.";
      parsed.aiConfidence = 0;
    }

    return parsed;
  } catch (error) {
    console.error("Email role matching failed:", error);
    return {
      messageId,
      roleId: null,
      aiRationale: `Failed to execute AI matching: ${String(error)}`,
      aiConfidence: 0,
    };
  }
}
