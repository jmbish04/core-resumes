"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import {
  BookOpenIcon,
  GlobeIcon,
  FileTextIcon,
  Loader2Icon,
  CheckCircle2Icon,
  SearchIcon,
  MessageSquareIcon,
  TagIcon,
} from "lucide-react";

/**
 * ConsultNotebookToolUI — shows NotebookLM query + result card.
 */
export const ConsultNotebookToolUI = makeAssistantToolUI({
  toolName: "consultNotebook",
  render: ({ args, result, status }) => (
    <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
      <div className="mt-0.5">
        {status?.type === "running" ? (
          <Loader2Icon className="size-4 animate-spin text-indigo-400" />
        ) : (
          <BookOpenIcon className="size-4 text-indigo-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-indigo-400 mb-1">NotebookLM Query</div>
        <p className="text-xs text-muted-foreground">
          {(args as { query?: string })?.query ?? "Querying knowledge base…"}
        </p>
        {!!result && (
          <div className="mt-2 p-2 rounded bg-muted/30 text-xs leading-relaxed">
            <CheckCircle2Icon className="size-3 inline mr-1 text-emerald-400" />
            Response received
            {(result as { sources?: Array<{ title: string }> })?.sources?.length ? (
              <span className="ml-2 text-muted-foreground">
                ({(result as { sources: Array<{ title: string }> }).sources.length} sources)
              </span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  ),
});

/**
 * ScrapeJobToolUI — shows scraping progress + extracted role data.
 */
export const ScrapeJobToolUI = makeAssistantToolUI({
  toolName: "scrapeJob",
  render: ({ args, result, status }) => (
    <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
      <div className="mt-0.5">
        {status?.type === "running" ? (
          <Loader2Icon className="size-4 animate-spin text-cyan-400" />
        ) : (
          <GlobeIcon className="size-4 text-cyan-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-cyan-400 mb-1">Scraping Job Posting</div>
        <p className="text-xs text-muted-foreground truncate">
          {(args as { url?: string })?.url ?? "Fetching…"}
        </p>
        {!!result && (
          <div className="mt-2 p-2 rounded bg-muted/30 text-xs leading-relaxed">
            <CheckCircle2Icon className="size-3 inline mr-1 text-emerald-400" />
            Scraped {(result as { textLength?: number })?.textLength ?? 0} characters
          </div>
        )}
      </div>
    </div>
  ),
});

/**
 * DraftDocumentToolUI — shows draft generation status + preview.
 */
export const DraftDocumentToolUI = makeAssistantToolUI({
  toolName: "draftDocument",
  render: ({ args, result, status }) => (
    <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-amber-500/5 border border-amber-500/20">
      <div className="mt-0.5">
        {status?.type === "running" ? (
          <Loader2Icon className="size-4 animate-spin text-amber-400" />
        ) : (
          <FileTextIcon className="size-4 text-amber-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-amber-400 mb-1">Drafting Document</div>
        <p className="text-xs text-muted-foreground">
          {(args as { docType?: string })?.docType === "cover_letter"
            ? "Cover Letter"
            : "Resume"}{" "}
          — {status?.type === "running" ? "generating…" : "queued"}
        </p>
        {!!result && (
          <div className="mt-2 p-2 rounded bg-muted/30 text-xs leading-relaxed">
            {(result as { status?: string })?.status === "queued" ? (
              <>
                <CheckCircle2Icon className="size-3 inline mr-1 text-emerald-400" />
                {(result as { message?: string })?.message ?? "Queued for generation"}
              </>
            ) : (
              <>⚠️ {(result as { message?: string })?.message ?? "Check status"}</>
            )}
          </div>
        )}
      </div>
    </div>
  ),
});

/**
 * SearchCareerMemoryToolUI — shows semantic search query and memory results.
 */
export const SearchCareerMemoryToolUI = makeAssistantToolUI({
  toolName: "searchCareerMemory",
  render: ({ args, result, status }) => {
    const typedArgs = args as { query?: string; category?: string; limit?: number };
    const typedResult = result as {
      count?: number;
      memories?: Array<{ category: string; source: string }>;
      error?: string;
    };

    return (
      <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-violet-500/5 border border-violet-500/20">
        <div className="mt-0.5">
          {status?.type === "running" ? (
            <Loader2Icon className="size-4 animate-spin text-violet-400" />
          ) : (
            <SearchIcon className="size-4 text-violet-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-violet-400 mb-1">Career Memory Search</div>
          <p className="text-xs text-muted-foreground">
            {typedArgs?.query ?? "Searching memory…"}
          </p>
          {typedArgs?.category && (
            <span className="inline-flex items-center gap-1 mt-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
              <TagIcon className="size-2.5" />
              {typedArgs.category}
            </span>
          )}
          {!!typedResult && (
            <div className="mt-2 p-2 rounded bg-muted/30 text-xs leading-relaxed">
              {typedResult.error ? (
                <span className="text-destructive">{typedResult.error}</span>
              ) : (
                <>
                  <CheckCircle2Icon className="size-3 inline mr-1 text-emerald-400" />
                  Found {typedResult.count ?? 0} memories
                  {(typedResult.memories?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {[
                        ...new Set(typedResult.memories?.map((m) => m.category) ?? []),
                      ].map((cat) => (
                        <span
                          key={cat}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
});

/**
 * GenerateMockInterviewToolUI — shows interview generation progress.
 */
export const GenerateMockInterviewToolUI = makeAssistantToolUI({
  toolName: "generateMockInterview",
  render: ({ args, result, status }) => {
    const typedArgs = args as { focus?: string };
    const typedResult = result as {
      status?: string;
      message?: string;
      interviewId?: string;
    };

    return (
      <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
        <div className="mt-0.5">
          {status?.type === "running" ? (
            <Loader2Icon className="size-4 animate-spin text-emerald-400" />
          ) : (
            <MessageSquareIcon className="size-4 text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-emerald-400 mb-1">
            Generating Mock Interview
          </div>
          <p className="text-xs text-muted-foreground">
            {status?.type === "running"
              ? `Creating interview questions${typedArgs?.focus ? ` (focus: ${typedArgs.focus})` : ""}…`
              : typedArgs?.focus
                ? `Focus: ${typedArgs.focus}`
                : "General interview prep"}
          </p>
          {!!typedResult && (
            <div className="mt-2 p-2 rounded bg-muted/30 text-xs leading-relaxed">
              {typedResult.status === "complete" ? (
                <>
                  <CheckCircle2Icon className="size-3 inline mr-1 text-emerald-400" />
                  {typedResult.message ?? "Interview questions generated"}
                </>
              ) : (
                <>⚠️ {typedResult.message ?? "Check status"}</>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
});
