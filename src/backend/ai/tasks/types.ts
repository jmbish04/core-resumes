export * from "./analyze/types";
export * from "./chat/types";
export * from "./classify/types";
export * from "./draft/types";
export * from "./extract/types";
export * from "./generate/types";
export * from "./prepare/types";

// ---------------------------------------------------------------------------
// Comment Response Types
// ---------------------------------------------------------------------------

export interface CommentResponseProgress {
  phase: "reading" | "responding" | "complete" | "error";
  message: string;
  commentId?: string;
  totalComments?: number;
  currentComment?: number;
}

export interface CommentResponseResult {
  commentsProcessed: number;
  replies: Array<{
    commentId: string;
    commentContent: string;
    replyContent: string;
    memoryId: string;
  }>;
}
