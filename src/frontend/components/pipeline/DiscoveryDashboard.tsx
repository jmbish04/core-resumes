import { useCallback, useEffect, useState } from "react";
import {
  Briefcase,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
  MapPin,
  DollarSign,
  Award,
  Sparkles,
  HelpCircle,
  FileText,
  Bookmark,
  Share2,
} from "lucide-react";

import { apiGet, apiPost, toast } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JobPosting {
  id: number;
  jobSiteId: string;
  jobTitle: string;
  company: string;
  location: string | null;
  dateFirstSeen: string;
  triagePassed: boolean;
  triageReason: string | null;
  analysisExecuted: boolean;
  isFavorite: boolean;
  isRecommended: boolean;
  recommendationScore: number | null;
  recommendationReason: string | null;
  snapshot?: {
    id: number;
    matchScore: number | null;
    matchRationale: string | null;
    verdict: "High" | "Medium" | "Low" | null;
    verdictRationale: string | null;
    builderAlignment: number | null;
    jdTrapDetected: boolean | null;
    jobSummary: string | null;
    extractedSalaryRaw: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    extractedBenefitsRaw: string | null;
    benefitsMedical: string | null;
    benefitsEquity: string | null;
    benefitsRetirement: string | null;
    benefitsPto: string | null;
    benefitsBonus: string | null;
    benefitsOtherJson: string[] | null;
    historicComparison: string | null;
    historicSalaryAnalysis: string | null;
    historicBenefitsAnalysis: string | null;
    negotiationStrategy: string | null;
    extractedLocation: string | null;
    experienceLevel: string | null;
  };
  categories?: Array<{ name: string; aiRationale: string }>;
  tags?: Array<{ name: string; aiRationale: string }>;
  requirements?: Array<{ id: number; requirement: string; matchScore: number; matchRationale: string }>;
  skills?: Array<{ id: number; skill: string; matchScore: number; matchRationale: string }>;
  responsibilities?: Array<{ id: number; responsibility: string; matchScore: number; matchRationale: string }>;
}

interface ApiCompany {
  id: number;
  name: string | null;
  jobBoardToken: string | null;
  system: string;
  recommendationReason: string | null;
  isRecommended: boolean;
  timestampAdded: number | string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a URL-style token slug into a human-readable company name. */
function formatTokenAsName(token: string): string {
  return token
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscoveryDashboard() {
  const [loading, setLoading] = useState(true);
  const [recommendedJobs, setRecommendedJobs] = useState<JobPosting[]>([]);
  const [unscoredJobs, setUnscoredJobs] = useState<JobPosting[]>([]);
  const [discoveryCompanies, setDiscoveryCompanies] = useState<ApiCompany[]>([]);

  // Expanded items
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [analyzingJobId, setAnalyzingJobId] = useState<number | null>(null);
  const [promotingJobId, setPromotingJobId] = useState<number | null>(null);
  const [promotingCompanyId, setPromotingCompanyId] = useState<number | null>(null);

  // Stats
  const totalRecommended = recommendedJobs.length;
  const totalUnscored = unscoredJobs.length;
  const totalCompanies = discoveryCompanies.length;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet<{
        recommendedJobs: JobPosting[];
        unscoredJobs: JobPosting[];
        discoveryCompanies: ApiCompany[];
      }>("/api/pipeline/discovery/dashboard");

      if (res) {
        setRecommendedJobs(res.recommendedJobs || []);
        setUnscoredJobs(res.unscoredJobs || []);
        setDiscoveryCompanies(res.discoveryCompanies || []);
      }
    } catch (e) {
      console.error("Failed to load discovery dashboard data:", e);
      toast({ title: "Failed to load dashboard data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Trigger manual deep analysis
  const handleAnalyzeJob = async (jobId: number) => {
    try {
      setAnalyzingJobId(jobId);
      toast({ title: "Triggering deep analysis...", description: "Connecting to Greenhouse & analyzing posting via kimi-k2.5..." });
      
      const res = await apiPost<{
        status: string;
        job: JobPosting;
      }>(`/api/pipeline/jobs-postings/${jobId}/analyze`, {});

      if (res?.status === "analyzed" && res.job) {
        toast({ title: "Analysis Complete!", description: `Job: ${res.job.jobTitle} analyzed successfully.` });
        
        // Remove from unscored list
        setUnscoredJobs((prev) => prev.filter((j) => j.id !== jobId));
        // Add to recommended list
        setRecommendedJobs((prev) => [res.job, ...prev]);
        // Auto-expand
        setExpandedJobId(res.job.id);
      } else {
        throw new Error("Invalid response format.");
      }
    } catch (e: any) {
      console.error("Manual analysis failed:", e);
      toast({ title: "Deep Analysis Failed", description: e.message || "Could not complete Kimi analysis.", variant: "destructive" });
    } finally {
      setAnalyzingJobId(null);
    }
  };

  // Promote job to active role application
  const handlePromoteRole = async (jobId: number) => {
    try {
      setPromotingJobId(jobId);
      toast({ title: "Promoting to Active Role...", description: "Seeding intake data and requirement bullets..." });

      const res = await apiPost<{
        status: string;
        role: any;
      }>(`/api/pipeline/jobs-postings/${jobId}/promote-role`, {});

      if (res?.status === "promoted" || res?.status === "already_promoted") {
        toast({
          title: res.status === "promoted" ? "Role Promoted!" : "Role Already Active",
          description: `Copied intake requirements and seeded new active application in the workspace.`,
        });

        // Update local state to reflect that it's promoted
        setRecommendedJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, isFavorite: true } : j))
        );
      }
    } catch (e: any) {
      console.error("Role promotion failed:", e);
      toast({ title: "Promotion Failed", description: e.message || "Could not complete promotion.", variant: "destructive" });
    } finally {
      setPromotingJobId(null);
    }
  };

  // Promote api company to watchlist
  const handlePromoteCompany = async (companyId: number) => {
    try {
      setPromotingCompanyId(companyId);
      toast({ title: "Promoting Company...", description: "Adding company metadata to core watch list..." });

      const res = await apiPost<{
        status: string;
        company: any;
      }>(`/api/pipeline/api-companies/${companyId}/promote-company`, {});

      if (res?.status === "promoted" || res?.status === "already_promoted") {
        toast({
          title: res.status === "promoted" ? "Company Promoted!" : "Company Already Active",
          description: `Added to core company list with Greenhouse board tracking.`,
        });

        // Remove promoted company from discovery list
        setDiscoveryCompanies((prev) =>
          prev.filter((c) => c.id !== companyId)
        );
      }
    } catch (e: any) {
      console.error("Company promotion failed:", e);
      toast({ title: "Promotion Failed", description: e.message || "Could not promote company.", variant: "destructive" });
    } finally {
      setPromotingCompanyId(null);
    }
  };

  // Trigger full bulk analysis
  const handleBulkAnalysis = async () => {
    try {
      setLoading(true);
      toast({ title: "Running Discovery Scan", description: "Scoring all jobs and triggering batch deep analysis..." });

      // Trigger the discovery scan which runs scorer + analyzer
      await apiPost("/api/pipeline/discovery/scan", {});
      await fetchData();
      toast({ title: "Discovery Scan Complete", description: "Successfully refreshed scores and analysis." });
    } catch (e) {
      console.error("Bulk scan failed:", e);
      toast({ title: "Discovery Scan Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleExpandJob = (id: number) => {
    setExpandedJobId(expandedJobId === id ? null : id);
  };

  const getVerdictStyle = (verdict: string | null | undefined) => {
    switch (verdict) {
      case "High":
        return "border-emerald-500/30 text-emerald-500 bg-emerald-500/10";
      case "Medium":
        return "border-amber-500/30 text-amber-500 bg-amber-500/10";
      case "Low":
        return "border-rose-500/30 text-rose-500 bg-rose-500/10";
      default:
        return "border-zinc-700 text-zinc-400 bg-zinc-900";
    }
  };

  const formatSalary = (min: number | null, max: number | null, currency: string | null) => {
    if (!min && !max) return "Not Disclosed";
    const currSym = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
    if (min && max) return `${currSym}${min.toLocaleString()} - ${currSym}${max.toLocaleString()}`;
    if (min) return `${currSym}${min.toLocaleString()}+`;
    return `Up to ${currSym}${max!.toLocaleString()}`;
  };

  if (loading && recommendedJobs.length === 0 && unscoredJobs.length === 0) {
    return (
      <div className="flex flex-col h-[70vh] items-center justify-center gap-4">
        <Loader2 className="size-10 animate-spin text-purple-500" />
        <p className="text-zinc-400 text-sm font-medium animate-pulse">Loading Discovery Workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-1">
      {/* Title block */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-[#111115] border border-zinc-800 p-5 rounded-xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-6 text-purple-400 animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight text-white" id="discovery-title-header">
              Wide Net Discovery Pipeline
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            Review automatically harvested open roles and companies matching target locations (Remote or SF Bay Area) and keywords.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchData} className="border-zinc-800 hover:bg-zinc-800 text-zinc-300">
            Refresh Dashboard
          </Button>
          {unscoredJobs.length > 0 && (
            <Button size="sm" onClick={handleBulkAnalysis} className="bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-lg hover:shadow-purple-500/20">
              Run Discovery Scan
            </Button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <Tabs defaultValue="recommended" className="w-full">
        <TabsList className="bg-[#111115] border border-zinc-800/80 p-1 w-full sm:w-auto grid grid-cols-3 sm:inline-flex rounded-xl">
          <TabsTrigger value="recommended" className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Analyzed Jobs ({totalRecommended})
          </TabsTrigger>
          <TabsTrigger value="unscored" className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Unanalyzed Queue ({totalUnscored})
          </TabsTrigger>
          <TabsTrigger value="companies" className="rounded-lg text-xs font-semibold px-4 py-2 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
            Hot Companies ({totalCompanies})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Recommended Jobs (Analyzed) */}
        <TabsContent value="recommended" className="space-y-4 mt-6">
          {totalRecommended === 0 ? (
            <Card className="bg-[#111115] border-zinc-800/80 p-12 text-center text-zinc-500 rounded-xl">
              <Briefcase className="size-12 mx-auto text-zinc-700 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">No Deep Analyzed Jobs</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                No recommended jobs have been analyzed by the AI yet. Go to the "Unanalyzed Queue" tab and trigger analysis on a job!
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {recommendedJobs.map((job) => {
                const isExpanded = expandedJobId === job.id;
                const snap = job.snapshot;
                const isPromoted = job.isFavorite; // mapped locally to toggle

                return (
                  <Card key={job.id} className="bg-[#111115] border-zinc-800 hover:border-zinc-700 transition-all rounded-xl overflow-hidden shadow-lg">
                    {/* Header line */}
                    <div
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer select-none"
                      onClick={() => toggleExpandJob(job.id)}
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-white hover:text-purple-400 transition-colors">
                            {job.jobTitle}
                          </span>
                          <Badge variant="outline" className={getVerdictStyle(snap?.verdict)}>
                            {snap?.verdict || "Unscored"} Fit
                          </Badge>
                          {snap?.jdTrapDetected && (
                            <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/30 text-[10px] gap-1 flex items-center h-5">
                              <AlertTriangle className="size-3" /> JD Trap
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Building2 className="size-3 text-zinc-500" />
                            {job.company}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3 text-zinc-500" />
                            {job.location || snap?.extractedLocation || "Remote"}
                          </span>
                          {snap?.salaryMax && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="size-3 text-zinc-500" />
                              {formatSalary(snap.salaryMin, snap.salaryMax, snap.salaryCurrency)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Radial Gauge / Score */}
                        {snap?.matchScore !== null && (
                          <div className="flex items-center gap-2 bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800">
                            <TrendingUp className="size-4 text-purple-400" />
                            <span className="text-sm font-mono font-bold text-purple-300">
                              Score: {snap?.matchScore}%
                            </span>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-8 p-0 border border-zinc-800 hover:bg-zinc-800"
                        >
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable detailed content */}
                    {isExpanded && snap && (
                      <CardContent className="border-t border-zinc-800 bg-[#0d0d10] p-6 space-y-6">
                        {/* AI Summary and Verdict Details */}
                        <div className="grid gap-6 md:grid-cols-3">
                          <div className="md:col-span-2 space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                              Job Summary & Assessment Rationale
                            </h4>
                            <p className="text-xs text-zinc-300 leading-relaxed bg-[#111115] p-3 rounded-lg border border-zinc-800/80">
                              {snap.jobSummary || "No summary extracted."}
                            </p>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              <span className="font-bold text-zinc-300">Match Rationale:</span> {snap.matchRationale}
                            </p>
                          </div>

                          <div className="bg-[#111115] border border-zinc-800 p-4 rounded-xl space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                              Alignment Scores
                            </h4>
                            <div className="space-y-3">
                              <div>
                                <div className="flex justify-between text-xs font-medium mb-1">
                                  <span className="text-zinc-400">Builder Alignment (0-to-1)</span>
                                  <span className="text-purple-300 font-mono font-bold">{snap.builderAlignment || 0}%</span>
                                </div>
                                <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                                  <div className="bg-purple-600 h-full rounded-full" style={{ width: `${snap.builderAlignment || 0}%` }} />
                                </div>
                              </div>
                              {snap.experienceLevel && (
                                <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/50">
                                  <span className="text-zinc-400">Experience Level</span>
                                  <span className="text-white font-medium">{snap.experienceLevel}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/50">
                                <span className="text-zinc-400">Triage Match Context</span>
                                <span className="text-white font-mono text-[10px] max-w-[150px] truncate" title={job.recommendationReason || ""}>
                                  {job.recommendationReason}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Extracted requirement bullet lists */}
                        {job.requirements && job.requirements.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                              <Award className="size-4" /> Key Qualifications & Fit
                            </h4>
                            <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-[#111115]/50">
                              <Table>
                                <TableHeader className="bg-[#111115]">
                                  <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                                    <TableHead className="text-[10px] text-zinc-400 uppercase tracking-wider py-2">Requirement</TableHead>
                                    <TableHead className="text-[10px] text-zinc-400 uppercase tracking-wider text-center py-2 w-[80px]">Score</TableHead>
                                    <TableHead className="text-[10px] text-zinc-400 uppercase tracking-wider py-2">Match Analysis</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {job.requirements.map((req) => (
                                    <TableRow key={req.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/10">
                                      <TableCell className="text-xs text-white py-2.5 font-medium">{req.requirement}</TableCell>
                                      <TableCell className="text-center py-2.5">
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${req.matchScore >= 8 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : req.matchScore >= 5 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                                          {req.matchScore}/10
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-xs text-zinc-400 py-2.5 leading-relaxed">{req.matchRationale}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}

                        {/* Historic Comparison & Negotiation */}
                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="bg-[#111115]/50 border border-zinc-800/80 p-4 rounded-xl space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                              <FileText className="size-4" /> Career Fit & Historic Match
                            </h4>
                            <p className="text-xs text-zinc-300 leading-relaxed font-light">
                              {snap.historicComparison}
                            </p>
                          </div>

                          <div className="bg-[#111115]/50 border border-zinc-800/80 p-4 rounded-xl space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                              <TrendingUp className="size-4" /> Compensation & Negotiation Strategy
                            </h4>
                            <p className="text-xs text-zinc-300 leading-relaxed font-light">
                              {snap.negotiationStrategy}
                            </p>
                          </div>
                        </div>

                        {/* Categories and tags display */}
                        <div className="flex flex-wrap gap-4 items-center justify-between pt-4 border-t border-zinc-800/80">
                          <div className="flex flex-wrap gap-2">
                            {job.categories?.map((cat, i) => (
                              <Badge key={i} variant="outline" className="border-purple-500/20 text-purple-300 bg-purple-500/5 text-[10px] py-0.5" title={cat.aiRationale}>
                                Category: {cat.name}
                              </Badge>
                            ))}
                            {job.tags?.map((tag, i) => (
                              <Badge key={i} variant="outline" className="border-blue-500/20 text-blue-300 bg-blue-500/5 text-[10px] py-0.5" title={tag.aiRationale}>
                                #{tag.name}
                              </Badge>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-zinc-800 hover:bg-zinc-800 text-zinc-300 gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(job.triageReason?.match(/URL:\s*(https?:\/\/\S+)/)?.[1] || "#", "_blank");
                              }}
                            >
                              <Share2 className="size-3.5" /> View Posting
                            </Button>
                            <Button
                              size="sm"
                              disabled={isPromoted || promotingJobId === job.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePromoteRole(job.id);
                              }}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold gap-1.5"
                            >
                              {promotingJobId === job.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Bookmark className="size-3.5" />
                              )}
                              {isPromoted ? "Promoted to Intake" : "Promote to Core Applications"}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Unanalyzed Queue */}
        <TabsContent value="unscored" className="space-y-4 mt-6">
          {totalUnscored === 0 ? (
            <Card className="bg-[#111115] border-zinc-800/80 p-12 text-center text-zinc-500 rounded-xl">
              <CheckCircle2 className="size-12 mx-auto text-emerald-500/40 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">Queue is Clear!</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                No recommended jobs are awaiting deep analysis. All harvested recommended postings have been successfully scored!
              </p>
            </Card>
          ) : (
            <div className="rounded-xl border border-zinc-800 bg-[#111115] overflow-hidden shadow-xl">
              <Table>
                <TableHeader className="bg-zinc-900/60">
                  <TableRow className="border-b border-zinc-800">
                    <TableHead className="text-xs text-zinc-300 font-bold">Job Title</TableHead>
                    <TableHead className="text-xs text-zinc-300 font-bold">Company</TableHead>
                    <TableHead className="text-xs text-zinc-300 font-bold">Location</TableHead>
                    <TableHead className="text-xs text-zinc-300 font-bold">Recommendation Reason</TableHead>
                    <TableHead className="text-xs text-zinc-300 font-bold text-center w-[160px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unscoredJobs.map((job) => (
                    <TableRow key={job.id} className="border-b border-zinc-800/80 hover:bg-zinc-800/10">
                      <TableCell className="text-xs font-bold text-white py-3">{job.jobTitle}</TableCell>
                      <TableCell className="text-xs text-zinc-300 py-3">{job.company}</TableCell>
                      <TableCell className="text-xs text-zinc-400 py-3">{job.location || "Remote"}</TableCell>
                      <TableCell className="text-xs text-zinc-400 py-3 italic max-w-xs truncate" title={job.recommendationReason || ""}>
                        {job.recommendationReason}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        <Button
                          size="xs"
                          disabled={analyzingJobId === job.id}
                          onClick={() => handleAnalyzeJob(job.id)}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] py-1 px-3 h-7 gap-1"
                        >
                          {analyzingJobId === job.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Sparkles className="size-3" />
                          )}
                          {analyzingJobId === job.id ? "Analyzing..." : "Analyze Job"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Discover Companies */}
        <TabsContent value="companies" className="space-y-4 mt-6">
          {totalCompanies === 0 ? (
            <Card className="bg-[#111115] border-zinc-800/80 p-12 text-center text-zinc-500 rounded-xl">
              <Building2 className="size-12 mx-auto text-zinc-700 mb-3" />
              <h3 className="text-sm font-semibold text-zinc-300">No Recommended Companies</h3>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                No hot companies flagged by the heuristic yet. Promote roles to automatically add their companies!
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {discoveryCompanies.map((company) => {
                const displayName = company.name || formatTokenAsName(company.jobBoardToken || "Unknown");
                const addedDate = company.timestampAdded
                  ? new Date(
                      typeof company.timestampAdded === "number"
                        ? company.timestampAdded * 1000
                        : company.timestampAdded
                    ).toLocaleDateString()
                  : "Unknown";

                return (
                  <Card key={company.id} className="bg-[#111115] border border-zinc-800 hover:border-zinc-700 transition-all rounded-xl p-5 flex flex-col justify-between gap-4 shadow-lg">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-white">{displayName}</h4>
                        <div className="flex items-center gap-2">
                          {company.system && (
                            <Badge variant="outline" className="border-blue-500/20 text-blue-300 bg-blue-500/5 text-[10px] uppercase">
                              {company.system}
                            </Badge>
                          )}
                          {company.jobBoardToken && (
                            <Badge variant="outline" className="border-purple-500/20 text-purple-300 bg-purple-500/5 text-[10px] font-mono">
                              {company.jobBoardToken}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {company.recommendationReason && (
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          {company.recommendationReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 mt-1">
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Discovered: {addedDate}
                      </span>
                      <Button
                        size="xs"
                        disabled={promotingCompanyId === company.id}
                        onClick={() => handlePromoteCompany(company.id)}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] h-7 px-3 gap-1"
                      >
                        {promotingCompanyId === company.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Building2 className="size-3" />
                        )}
                        Promote to Watch List
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
