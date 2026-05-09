/**
 * @fileoverview AI task to classify an inbound email with full intent
 * analysis. Extracts company/person names, scheduling options, and
 * determines the next action for the email processing workflow.
 *
 * Backwards-compatible: still returns the StatusSuggestion fields
 * (suggestedStatus, confidence, reasoning) plus the expanded
 * EmailClassification fields (intent, nextAction, names, etc.).
 *
 * Called from the email handler after an email is matched to a role.
 */

import { enforceTokenLimit } from "../../../utils/token-estimator";
import { VALID_STATUSES, type EmailClassification, type StatusSuggestion } from "../../types";

// ---------------------------------------------------------------------------
// JSON Schema for structured output
// ---------------------------------------------------------------------------

const EMAIL_CLASSIFICATION_SCHEMA = {
  type: "object" as const,
  properties: {
    suggestedStatus: {
      type: ["string", "null"] as const,
      enum: [...VALID_STATUSES, null],
      description:
        "The suggested new status for the role based on the email content. Null if no status change is warranted.",
    },
    confidence: {
      type: "number" as const,
      minimum: 0,
      maximum: 1,
      description: "Confidence score from 0 to 1 for the classification.",
    },
    reasoning: {
      type: "string" as const,
      description: "Brief explanation of why this status/intent was determined.",
    },
    companyName: {
      type: ["string", "null"] as const,
      description: "The company name mentioned in the email.",
    },
    companyDomain: {
      type: ["string", "null"] as const,
      description: "The company domain (e.g., 'stripe.com') if identifiable.",
    },
    jobTitle: {
      type: ["string", "null"] as const,
      description: "The job title/position mentioned in the email.",
    },
    senderPersonName: {
      type: ["string", "null"] as const,
      description:
        "The first name or full name of the person who sent the email, for use in reply drafts.",
    },
    hiringManagerName: {
      type: ["string", "null"] as const,
      description: "Name of the hiring manager if mentioned (e.g., 'You will be meeting with...').",
    },
    externalApplicationId: {
      type: ["string", "null"] as const,
      description:
        "Any candidate ID, requisition ID, or application ID found in the email (e.g., 'Application #12345').",
    },
    intent: {
      type: "string" as const,
      enum: [
        "interview_scheduling",
        "rejection",
        "offer",
        "status_update",
        "general",
        "unknown",
      ],
      description: "The primary intent of the email.",
    },
    availabilityOptions: {
      type: ["array", "null"] as const,
      items: { type: "string" as const },
      description:
        "Date/time options proposed for interviews. Extract verbatim (e.g., 'Tuesday, May 6 at 2:00 PM EST').",
    },
    nextAction: {
      type: "string" as const,
      enum: ["draft_reply", "update_status", "analyze_offer", "draft_negotiation", "none"],
      description: "The recommended next action for the email processing workflow.",
    },
  },
  required: [
    "suggestedStatus",
    "confidence",
    "reasoning",
    "companyName",
    "companyDomain",
    "jobTitle",
    "senderPersonName",
    "hiringManagerName",
    "externalApplicationId",
    "intent",
    "availabilityOptions",
    "nextAction",
  ] as const,
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert at analyzing recruiting and job application emails. Given an email's subject and body along with the current application status, perform a comprehensive classification.

<EXTRACTION_RULES>
1. Extract the sender's name (first name or full name) from the email signature, greeting, or "From" line.
2. Extract any hiring manager name mentioned (e.g., "You'll be meeting with Sarah Chen").
3. If the email proposes interview times, extract ALL options verbatim.
4. Identify any application/candidate/requisition IDs.
5. Extract company name and domain from context or sender address.
</EXTRACTION_RULES>

<STATUS_SIGNALS>
- "schedule an interview" / "availability" / "phone screen" / "technical interview" → interviewing
- "unfortunately" / "not moving forward" / "other candidates" / "position has been filled" → rejected
- "offer letter" / "compensation" / "we'd like to extend" / "congratulations" → offer
- "thank you for applying" / "application received" → applied (only if currently preparing)
- General updates, newsletters, or irrelevant emails → null (no change)
</STATUS_SIGNALS>

<INTENT_RULES>
- interview_scheduling: Email proposes or confirms interview times
- rejection: Email communicates that the candidate is not moving forward
- offer: Email contains or references an offer letter, compensation package, or DocuSign
- status_update: Email provides a general update on application progress
- general: Newsletter, marketing, or non-application content
- unknown: Cannot determine intent
</INTENT_RULES>

<NEXT_ACTION_RULES>
- draft_reply: Almost always for interview_scheduling, status_update, and general (if relevant)
- update_status: For rejection emails (auto-update role to rejected)
- analyze_offer: For offer emails with attachments or compensation details
- draft_negotiation: For offer emails where negotiation strategy is needed
- none: For emails that need no action (marketing, newsletters)
</NEXT_ACTION_RULES>

Only suggest a status change when you are confident. If the email is ambiguous, set suggestedStatus to null and confidence low.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full email classification — returns both legacy StatusSuggestion fields
 * and the expanded EmailClassification fields.
 */
export async function classifyEmailStatus(
  env: Env,
  emailSubject: string,
  emailBody: string,
  currentStatus: string,
): Promise<EmailClassification> {
  enforceTokenLimit(emailBody, 120000, "Email Body");

  const userPrompt = `Current role status: ${currentStatus}

Email subject: ${emailSubject}

Email body:
${emailBody}`;

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
            name: "email_classification",
            strict: true,
            schema: EMAIL_CLASSIFICATION_SCHEMA,
          },
        },
        max_tokens: 1024,
        temperature: 0.1,
      },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { response?: string };

    const parsed = JSON.parse(response.response ?? "{}") as EmailClassification;

    // Validate the suggested status
    if (
      parsed.suggestedStatus &&
      !VALID_STATUSES.includes(parsed.suggestedStatus as (typeof VALID_STATUSES)[number])
    ) {
      parsed.suggestedStatus = null;
      parsed.confidence = 0;
    }

    // Ensure required fields have defaults
    if (!parsed.intent) parsed.intent = "unknown";
    if (!parsed.nextAction) parsed.nextAction = "none";

    return parsed;
  } catch (error) {
    console.error("Email classification failed:", error);
    return {
      suggestedStatus: null,
      confidence: 0,
      reasoning: "Classification failed",
      companyName: null,
      companyDomain: null,
      jobTitle: null,
      senderPersonName: null,
      hiringManagerName: null,
      externalApplicationId: null,
      intent: "unknown",
      availabilityOptions: null,
      nextAction: "none",
    };
  }
}
