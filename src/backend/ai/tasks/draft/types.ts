export type DraftDocType = "resume" | "cover_letter" | "email_reply";

export type DraftPhase =
  | "consulting"
  | "drafting"
  | "accuracy_review"
  | "strategic_review"
  | "creating_doc"
  | "complete"
  | "error";

export interface DraftProgress {
  phase: DraftPhase;
  message: string;
  docId?: string;
  gdocId?: string;
  webViewLink?: string;
}

export interface DraftWithNotebookOpts {
  env: Env;
  roleId: string;
  docType: DraftDocType;
  onProgress?: (progress: DraftProgress) => void;
}

export interface DraftResult {
  content: string;
  docId: string;
  gdocId: string;
  webViewLink?: string;
  memoryIds: string[];
}
