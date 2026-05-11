import { useState, useEffect } from "react";
import { Printer, Copy, Loader2, ExternalLink, ArrowLeft, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateRoleReportMarkdown } from "@/lib/report-markdown";

export function RoleReport({ payload }: { payload: any }) {
  const [fetchedDocs, setFetchedDocs] = useState<Record<string, string>>({});
  const [isFetchingDocs, setIsFetchingDocs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const { role, analysis, alignmentScores, bullets, bulletAnalyses, mockInterviews, careerMemory, documents } = payload;

  useEffect(() => {
    async function fetchDocs() {
      if (!documents || documents.length === 0) return;
      setIsFetchingDocs(true);
      const docsData: Record<string, string> = {};
      
      for (const doc of documents) {
        if (doc.gdocId) {
          try {
            const res = await fetch(`/api/documents/${doc.gdocId}/markdown`);
            if (res.ok) {
              docsData[doc.id] = await res.text();
            } else {
              docsData[doc.id] = `> Error fetching document: ${res.statusText}`;
            }
          } catch (e) {
            docsData[doc.id] = `> Failed to fetch document content`;
          }
        }
      }
      setFetchedDocs(docsData);
      setIsFetchingDocs(false);
    }
    
    fetchDocs();
  }, [documents]);

  const handleCopyMarkdown = async () => {
    const md = generateRoleReportMarkdown(payload, fetchedDocs);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyJson = async () => {
    // Organize payload for better JSON reading by chat agents
    const cleanPayload = {
      role: payload.role,
      analysis: payload.analysis,
      alignmentScores: payload.alignmentScores,
      bullets: payload.bullets?.map((b: any) => ({
        ...b,
        revisions: (payload.bulletAnalyses || [])
          .filter((rev: any) => rev.bulletId === b.id)
          .sort((x: any, y: any) => x.revisionNumber - y.revisionNumber)
      })),
      mockInterviews: payload.mockInterviews,
      careerMemory: payload.careerMemory,
      documents: payload.documents,
    };
    await navigator.clipboard.writeText(JSON.stringify(cleanPayload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const analysesByBullet = (bulletAnalyses || []).reduce((acc: any, curr: any) => {
    if (!acc[curr.bulletId]) acc[curr.bulletId] = [];
    acc[curr.bulletId].push(curr);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-8 pb-20 print:gap-4 print:pb-0">
      {/* Actions (hidden in print) */}
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" onClick={() => window.history.back()} className="gap-2">
          <ArrowLeft className="size-4" />
          Back to Role
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopyJson} className="gap-2">
            <FileJson className="size-4" />
            {copiedJson ? "Copied JSON!" : "Export JSON"}
          </Button>
          <Button variant="outline" onClick={handleCopyMarkdown} className="gap-2">
            <Copy className="size-4" />
            {copied ? "Copied Markdown!" : "Export Markdown"}
          </Button>
          <Button variant="default" onClick={handlePrint} className="gap-2">
            <Printer className="size-4" />
            Print Report
          </Button>
        </div>
      </div>

      {/* Header */}
      <header className="border-b pb-6 print:border-b-2 print:border-black">
        <h1 className="text-3xl font-bold tracking-tight">{role.companyName}</h1>
        <h2 className="text-xl text-muted-foreground mt-1">{role.jobTitle}</h2>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {role.salaryMin || role.salaryMax ? (
            <div>
              <span className="font-semibold text-foreground">Compensation:</span> {role.salaryMin || role.salaryMax ? `${role.salaryMin ? new Intl.NumberFormat('en-US', { style: 'currency', currency: role.salaryCurrency || 'USD', maximumFractionDigits: 0 }).format(role.salaryMin) : "Not disclosed"} - ${role.salaryMax ? new Intl.NumberFormat('en-US', { style: 'currency', currency: role.salaryCurrency || 'USD', maximumFractionDigits: 0 }).format(role.salaryMax) : "Not disclosed"}` : "Not disclosed"}
            </div>
          ) : null}
          <div>
            <span className="font-semibold text-foreground">Status:</span> <span className="capitalize">{role.status}</span>
          </div>
          {role.jobUrl && (
            <div>
              <a href={role.jobUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-500 hover:underline">
                Job Posting <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>
      </header>

      {/* Overall Analysis */}
      {analysis && (
        <section className="print-avoid-break">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2">Overall Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="rounded-lg border p-4 bg-card">
              <div className="text-sm text-muted-foreground mb-1">Total Score</div>
              <div className="text-4xl font-bold">{analysis.hireScore}</div>
            </div>
            <div className="rounded-lg border p-4 bg-card">
              <div className="text-sm font-semibold text-emerald-500 mb-2">The Hook</div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis.theHook || "N/A"}</p>
            </div>
            <div className="rounded-lg border p-4 bg-card">
              <div className="text-sm font-semibold text-amber-500 mb-2">Counter Positioning</div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis.counterPositioning || "N/A"}</p>
            </div>
          </div>
          <div className="rounded-lg border p-4 bg-card">
            <h4 className="font-semibold mb-2">Strategic Recommendation</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{analysis.strategicRecommendation || "N/A"}</p>
          </div>
        </section>
      )}

      {/* Alignment Scores */}
      {alignmentScores && alignmentScores.length > 0 && (
        <section className="print-avoid-break mt-6">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2">Alignment Breakdown</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {alignmentScores.map((score: any) => (
              <div key={score.id} className="rounded-lg border p-4 bg-card print:p-2 print:border-gray-200 print:shadow-none print:break-inside-avoid">
                <div className="flex items-center justify-between mb-2 print:mb-1">
                  <span className="font-medium capitalize print:text-sm">{score.type ? score.type.replace(/_/g, ' ').toLowerCase() : 'Unknown'}</span>
                  <span className="font-bold print:text-sm">{score.score}/100</span>
                </div>
                <p className="text-sm text-muted-foreground print:text-xs print:leading-tight">{score.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bullets & Revisions */}
      {bullets && bullets.length > 0 && (
        <section className="mt-6 print-page-break-before">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2">Requirement Analysis</h3>
          <div className="space-y-6">
            {bullets.map((bullet: any) => {
              const revisions = analysesByBullet[bullet.id] || [];
              revisions.sort((a: any, b: any) => a.revisionNumber - b.revisionNumber);

              return (
                <div key={bullet.id} className="rounded-lg border p-4 bg-card print-avoid-break print:p-2 print:border-gray-200">
                  <div className="mb-4 print:mb-2">
                    <p className="font-medium print:text-sm">"{bullet.content}"</p>
                    <div className="flex gap-2 mt-2 text-xs">
                      <span className="px-2 py-1 bg-muted rounded-md capitalize print:bg-gray-100">{bullet.type ? bullet.type.replace(/_/g, ' ').toLowerCase() : 'Unknown'}</span>
                      {bullet.isCritical && <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md print:bg-red-50 print:border print:border-red-200">Critical</span>}
                    </div>
                  </div>

                  {revisions.length > 0 ? (
                    <div className="pl-4 border-l-2 space-y-4 print:space-y-2 print:pl-2">
                      {revisions.map((rev: any, index: number) => (
                        <div key={rev.id}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold print:text-xs">Revision {rev.revisionNumber}</span>
                            <span className="text-xs px-2 py-0.5 bg-muted rounded-full print:bg-gray-100">Score: {rev.aiScore}</span>
                            {index === revisions.length - 1 && <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full print:bg-blue-50 print:border print:border-blue-200">Latest</span>}
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap print:text-xs print:leading-tight">{rev.aiRationale}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No analysis performed yet.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mock Interviews */}
      {mockInterviews && mockInterviews.length > 0 && (
        <section className="mt-6 print-page-break-before">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2">Mock Interviews</h3>
          <div className="space-y-8">
            {mockInterviews.map((interview: any) => (
              <div key={interview.id} className="space-y-6">
                <h4 className="text-lg font-medium text-muted-foreground">Version {interview.version}</h4>
                {Array.isArray(interview.qaPairs) && interview.qaPairs.map((qa: any, idx: number) => (
                  <div key={idx} className="rounded-lg border p-4 bg-card print-avoid-break print:p-2 print:border-gray-200">
                    <div className="mb-4 print:mb-2">
                      <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1 block print:text-[10px]">Interviewer (Q{idx + 1})</span>
                      <p className="font-medium print:text-sm print:leading-tight">{qa.interviewer}</p>
                    </div>
                    <div className="mb-4 pl-4 border-l-2 border-blue-500/30 print:mb-2 print:pl-2">
                      <span className="text-xs font-semibold uppercase text-blue-500 tracking-wider mb-1 block print:text-[10px]">Candidate</span>
                      <p className="text-sm leading-relaxed print:text-xs print:leading-tight">{qa.candidate}</p>
                    </div>
                    <div className="pl-4 border-l-2 border-amber-500/30 print:pl-2">
                      <span className="text-xs font-semibold uppercase text-amber-500 tracking-wider mb-1 block print:text-[10px]">Coach's Insight</span>
                      <p className="text-sm italic text-muted-foreground print:text-xs print:leading-tight">{qa.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Career Memory */}
      {careerMemory && careerMemory.filter((m: any) => m.isActive).length > 0 && (
        <section className="mt-6 print-page-break-before">
          <div className="mb-4 border-b pb-2">
            <h3 className="text-xl font-semibold">Career Memory & Drafts</h3>
            <p className="text-sm text-muted-foreground mt-1">Contextual memories retrieved from the knowledge base based on the job role posting content.</p>
          </div>
          <div className="space-y-4">
            {careerMemory.filter((m: any) => m.isActive).map((mem: any) => (
              <div key={mem.id} className="rounded-lg border p-4 bg-card print-avoid-break print:p-2 print:border-gray-200">
                <div className="flex gap-2 mb-3 print:mb-1">
                  <span className="text-xs px-2 py-1 bg-muted rounded-md uppercase tracking-wide print:bg-gray-100">{mem.category}</span>
                  <span className="text-xs px-2 py-1 bg-muted rounded-md uppercase tracking-wide print:bg-gray-100">{mem.source}</span>
                </div>
                <div className="mb-3 print:mb-1">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1 print:text-[10px] print:mb-0">Query</span>
                  <p className="text-sm font-medium print:text-xs">{mem.query}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground block mb-1 print:text-[10px] print:mb-0">Response</span>
                  <div className="text-sm whitespace-pre-wrap text-muted-foreground prose prose-sm dark:prose-invert max-w-none print:text-xs print:leading-tight">
                    {mem.answer}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents */}
      {documents && documents.length > 0 && (
        <section className="mt-6 print-page-break-before">
          <h3 className="text-xl font-semibold mb-4 border-b pb-2 flex items-center gap-3">
            Generated Documents
            {isFetchingDocs && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </h3>
          <div className="space-y-6">
            {documents.map((doc: any) => (
              <div key={doc.id} className="rounded-lg border bg-card print-avoid-break overflow-hidden print:border-gray-200">
                <div className="p-4 border-b bg-muted/30 flex items-center justify-between print:p-2 print:bg-gray-50">
                  <div>
                    <h4 className="font-semibold print:text-sm">{doc.name}</h4>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-2 print:mt-0">
                      <span className="capitalize">{doc.type}</span>
                      <span>•</span>
                      <span>Version {doc.version}</span>
                    </div>
                  </div>
                  <a href={(doc.type === "resume" || doc.type === "cover_letter") ? `https://docs.google.com/document/d/${doc.gdocId}/edit` : `https://drive.google.com/file/d/${doc.gdocId}/view`} target="_blank" rel="noreferrer" className="print:hidden">
                    <Button variant="outline" size="sm" className="gap-2">
                      Open <ExternalLink className="size-3" />
                    </Button>
                  </a>
                </div>
                {fetchedDocs[doc.id] && (
                  <div className="p-6 prose prose-sm dark:prose-invert max-w-none text-sm print:p-2 print:text-xs">
                    {/* Render markdown using a pre tag or basic formatting for now, 
                        or just raw text. To properly render markdown we'd need react-markdown. 
                        Since we want it printable, a white-space pre-wrap works well enough if we don't have react-markdown. */}
                    <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/10 p-4 rounded border print:p-2 print:border-none print:text-[10px] print:leading-normal">
                      {fetchedDocs[doc.id]}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
