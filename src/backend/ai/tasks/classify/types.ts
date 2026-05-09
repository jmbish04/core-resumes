export const VALID_STATUSES = [
  "preparing",
  "posting_expired",
  "applied",
  "interviewing",
  "offer",
  "negotiating",
  "accepted",
  "rejected",
  "withdrawn",
  "archived",
] as const;

export type StatusSuggestion = {
  suggestedStatus: (typeof VALID_STATUSES)[number] | null;
  confidence: number;
  reasoning: string;
};

export type EmailIntent =
  | "interview_scheduling"
  | "rejection"
  | "offer"
  | "status_update"
  | "general"
  | "unknown";

export type EmailNextAction =
  | "draft_reply"
  | "update_status"
  | "analyze_offer"
  | "draft_negotiation"
  | "none";

export type EmailClassification = StatusSuggestion & {
  companyName: string | null;
  companyDomain: string | null;
  jobTitle: string | null;
  senderPersonName: string | null;
  hiringManagerName: string | null;
  externalApplicationId: string | null;
  intent: EmailIntent;
  availabilityOptions: string[] | null;
  nextAction: EmailNextAction;
};
