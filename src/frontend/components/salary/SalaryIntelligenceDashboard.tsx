/**
 * @fileoverview Salary Intelligence Dashboard — main orchestrator component.
 *
 * Manages global filter state, fetches data from the salary intelligence APIs,
 * and arranges chart components, insight cards, saved views, and pinned role
 * comparisons into a responsive grid layout.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  Pin,
  Sparkles,
  BarChart3,
  Database,
} from "lucide-react";import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiGet, apiPost, apiPatch, apiDelete, toast } from "@/lib/api-client";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSeparator,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";

import { SalaryInsightCards } from "./SalaryInsightCards";
import { PercentileRangeChart } from "./charts/PercentileRangeChart";
import { RemoteDiscountChart } from "./charts/RemoteDiscountChart";
import { CompanySalaryHeatmap } from "./charts/CompanySalaryHeatmap";
import { SeniorityLadderChart } from "./charts/SeniorityLadderChart";
import { GeographicPremiumChart, type GeoLocationData } from "./charts/GeographicPremiumChart";
import { TopCompaniesChart } from "./charts/TopCompaniesChart";
import { TrendSparklines } from "./charts/TrendSparklines";
import { RoleComparisonRadar } from "./charts/RoleComparisonRadar";
import { SalaryAIInsights } from "./SalaryAIInsights";
import { PinnedRoleComparison } from "./PinnedRoleComparison";
import { DashboardSkeleton } from "./SalaryChartSkeleton";
import { SalaryIntelChatProvider } from "./SalaryIntelChatProvider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DashboardFilters = {
  roleType: string[];
  metricKey: string;
  seniority: string;
};

type SavedView = {
  id: number;
  name: string;
  filters: Record<string, unknown>;
  isDefault: number;
};

type OverviewData = {
  snapshot: Record<string, unknown> | null;
  stats: any[];
  companySalaries: any[];
  latestInsight: any | null;
  roleTypes: string[];
  companyNames: string[];
  kpis: {
    avgNationalMedian: number | null;
    avgLocalMedian: number | null;
    avgRemoteMedian: number | null;
    sfPremium: number | null;
    remoteDiscount: number | null;
    topCompany: { companyName: string; median: number; jobTitle: string } | null;
    totalCompanies: number;
    totalDataPoints: number;
  };
};

type PinnedRole = {
  id: number;
  roleId: string;
  roleTitle: string;
  companyName: string;
  salaryMin: number | null;
  salaryMax: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRoleMatch(jobTitle: string, filterRole: string): boolean {
  if (!jobTitle || !filterRole) return false;
  const cleanTitle = jobTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cleanFilter = filterRole.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (cleanFilter === "fullstack" || cleanFilter === "fullstackengineer" || cleanFilter === "fullstackdeveloper" || cleanFilter === "fullstack") {
    return cleanTitle.includes("fullstack") || (cleanTitle.includes("full") && cleanTitle.includes("stack"));
  }
  if (cleanFilter === "frontend" || cleanFilter === "frontendengineer" || cleanFilter === "frontenddeveloper") {
    return cleanTitle.includes("frontend") || (cleanTitle.includes("front") && cleanTitle.includes("end"));
  }
  if (cleanFilter === "backend" || cleanFilter === "backendengineer" || cleanFilter === "backenddeveloper") {
    return cleanTitle.includes("backend") || (cleanTitle.includes("back") && cleanTitle.includes("end"));
  }
  return cleanTitle.includes(cleanFilter);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SalaryIntelligenceDashboard() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [pinnedRoles, setPinnedRoles] = useState<PinnedRole[]>([]);
  const [geoLocations, setGeoLocations] = useState<GeoLocationData[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>("all");
  const [newViewName, setNewViewName] = useState("");
  const [savingView, setSavingView] = useState(false);
  const anchor = useComboboxAnchor();

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>({
    roleType: [],
    metricKey: "all",
    seniority: "all",
  });

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, trendsRes, viewsRes, pinnedRes, geoRes] = await Promise.allSettled([
        apiGet<OverviewData>("/api/pipeline/salary-intelligence/overview"),
        apiGet<{ trends: any[] }>("/api/pipeline/salary-intelligence/trends"),
        apiGet<{ views: SavedView[] }>("/api/pipeline/salary-intelligence/views"),
        apiGet<{ pinnedRoles: PinnedRole[] }>("/api/pipeline/salary-intelligence/pinned-roles"),
        apiGet<{ data: GeoLocationData[] }>("/api/geo/locations"),
      ]);

      if (overviewRes.status === "fulfilled") setOverview(overviewRes.value);
      if (trendsRes.status === "fulfilled") setTrends(trendsRes.value.trends);
      if (viewsRes.status === "fulfilled") setSavedViews(viewsRes.value.views);
      if (pinnedRes.status === "fulfilled") setPinnedRoles(pinnedRes.value.pinnedRoles);
      if (geoRes.status === "fulfilled") setGeoLocations(geoRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Listen for filter events from assistant-ui modal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.filters) {
        setFilters((prev) => {
          let rolesVal: string[] = [];
          if (Array.isArray(detail.filters.roleType)) {
            rolesVal = detail.filters.roleType;
          } else if (typeof detail.filters.roleType === "string") {
            rolesVal = detail.filters.roleType === "all" ? [] : [detail.filters.roleType];
          }
          return {
            ...prev,
            ...detail.filters,
            roleType: detail.filters.roleType !== undefined ? rolesVal : prev.roleType,
          };
        });
      }
    };
    window.addEventListener("salary:update-filters", handler);
    return () => window.removeEventListener("salary:update-filters", handler);
  }, []);

  // ---------------------------------------------------------------------------
  // Saved view management
  // ---------------------------------------------------------------------------

  const applyView = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      if (viewId === "all") {
        setFilters({ roleType: [], metricKey: "all", seniority: "all" });
        return;
      }
      const view = savedViews.find((v) => v.id === Number(viewId));
      if (view?.filters) {
        let viewRoles: string[] = [];
        if (Array.isArray(view.filters.roleType)) {
          viewRoles = view.filters.roleType;
        } else if (typeof view.filters.roleType === "string") {
          viewRoles = view.filters.roleType === "all" ? [] : [view.filters.roleType];
        }
        setFilters({
          roleType: viewRoles,
          metricKey: (view.filters.metricKey as string) || "all",
          seniority: (view.filters.seniority as string) || "all",
        });
      }
    },
    [savedViews],
  );

  const handleSaveView = useCallback(async () => {
    if (!newViewName.trim()) return;
    setSavingView(true);
    try {
      const res = await apiPost<{ view: SavedView }>("/api/pipeline/salary-intelligence/views", {
        name: newViewName.trim(),
        filters,
      });
      setSavedViews((prev) => [res.view, ...prev]);
      setActiveViewId(String(res.view.id));
      setNewViewName("");
      toast({ title: "View saved", description: `"${res.view.name}" created`, variant: "success" });
    } finally {
      setSavingView(false);
    }
  }, [newViewName, filters]);

  const handleDeleteView = useCallback(async (id: number) => {
    await apiDelete(`/api/pipeline/salary-intelligence/views/${id}`);
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
    if (activeViewId === String(id)) {
      setActiveViewId("all");
      setFilters({ roleType: [], metricKey: "all", seniority: "all" });
    }
    toast({ title: "View deleted", variant: "default" });
  }, [activeViewId]);

  const handleUnpin = useCallback(async (id: number) => {
    await apiDelete(`/api/pipeline/salary-intelligence/pinned-roles/${id}`);
    setPinnedRoles((prev) => prev.filter((r) => r.id !== id));
    toast({ title: "Role unpinned", variant: "default" });
  }, []);

  // ---------------------------------------------------------------------------
  // Derived / filtered data
  // ---------------------------------------------------------------------------

  const filteredStats = useMemo(() => {
    if (!overview) return [];
    let stats = overview.stats;
    if (filters.roleType.length > 0 && !filters.roleType.includes("all")) {
      stats = stats.filter((s) => filters.roleType.includes(s.roleType));
    }
    if (filters.metricKey !== "all") stats = stats.filter((s) => s.metricKey === filters.metricKey);
    return stats;
  }, [overview, filters]);

  const filteredCompanies = useMemo(() => {
    if (!overview) return [];
    let companies = overview.companySalaries;
    if (filters.seniority !== "all") companies = companies.filter((c: any) => c.seniority === filters.seniority);
    if (filters.roleType.length > 0 && !filters.roleType.includes("all")) {
      companies = companies.filter((c: any) => {
        return filters.roleType.some((role) => isRoleMatch(c.jobTitle || "", role));
      });
    }
    return companies;
  }, [overview, filters]);

  const uniqueSeniorities = useMemo(() => {
    if (!overview) return [];
    return [...new Set(overview.companySalaries.map((c: any) => c.seniority).filter(Boolean))];
  }, [overview]);

  // Compute summary KPIs dynamically based on active filter selections
  const kpis = useMemo(() => {
    if (!overview) return null;

    // Filter stats according to active role type selection
    let targetStats = overview.stats;
    if (filters.roleType.length > 0 && !filters.roleType.includes("all")) {
      targetStats = targetStats.filter((s) => filters.roleType.includes(s.roleType));
    }

    // Filter company salaries by role selection and seniority
    let targetCompanies = overview.companySalaries;
    if (filters.roleType.length > 0 && !filters.roleType.includes("all")) {
      targetCompanies = targetCompanies.filter((c: any) => {
        return filters.roleType.some((role) => isRoleMatch(c.jobTitle || "", role));
      });
    }
    if (filters.seniority !== "all") {
      targetCompanies = targetCompanies.filter((c: any) => c.seniority === filters.seniority);
    }

    // Seniority multiplier calculation: dynamically scale stats if seniority filter is active
    let seniorityMultiplier = 1;
    if (filters.seniority !== "all" && overview.companySalaries.length > 0) {
      const levelSalaries = overview.companySalaries.filter((c: any) => c.seniority === filters.seniority);
      if (levelSalaries.length > 0) {
        const avgLevel = levelSalaries.reduce((sum, c) => sum + c.median, 0) / levelSalaries.length;
        const avgAll = overview.companySalaries.reduce((sum, c) => sum + c.median, 0) / overview.companySalaries.length;
        if (avgAll > 0) {
          seniorityMultiplier = avgLevel / avgAll;
        }
      }
    }

    const nationalStats = targetStats.filter((s) => s.metricKey === "national");
    const localStats = targetStats.filter((s) => s.metricKey === "local_market");
    const remoteStats = targetStats.filter((s) => s.metricKey === "remote");

    const avgNationalMedian =
      nationalStats.length > 0
        ? Math.round((nationalStats.reduce((sum, s) => sum + s.median, 0) / nationalStats.length) * seniorityMultiplier)
        : null;

    const avgLocalMedian =
      localStats.length > 0
        ? Math.round((localStats.reduce((sum, s) => sum + s.median, 0) / localStats.length) * seniorityMultiplier)
        : null;

    const avgRemoteMedian =
      remoteStats.length > 0
        ? Math.round((remoteStats.reduce((sum, s) => sum + s.median, 0) / remoteStats.length) * seniorityMultiplier)
        : null;

    const sfPremium =
      avgNationalMedian && avgLocalMedian
        ? Math.round(((avgLocalMedian - avgNationalMedian) / avgNationalMedian) * 100)
        : null;

    const remoteDiscount =
      avgLocalMedian && avgRemoteMedian
        ? Math.round(((avgLocalMedian - avgRemoteMedian) / avgLocalMedian) * 100)
        : null;

    // Top paying company
    const topCompany = targetCompanies.length > 0
      ? targetCompanies.reduce((top, cs) => (cs.median > (top?.median ?? 0) ? cs : top), targetCompanies[0])
      : null;

    return {
      avgNationalMedian,
      avgLocalMedian,
      avgRemoteMedian,
      sfPremium,
      remoteDiscount,
      topCompany: topCompany
        ? { companyName: topCompany.companyName, median: topCompany.median, jobTitle: topCompany.jobTitle }
        : null,
      totalCompanies: new Set(targetCompanies.map((c: any) => c.companyName)).size,
      totalDataPoints: targetStats.length + targetCompanies.length,
    };
  }, [overview, filters]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return <DashboardSkeleton />;
  }

  const hasData = overview && (overview.stats.length > 0 || overview.companySalaries.length > 0);

  const filterSummary = `Filters: roleType=${filters.roleType.join(",")}, metricKey=${filters.metricKey}, seniority=${filters.seniority}`;

  return (
    <SalaryIntelChatProvider filterSummary={filterSummary}>
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="size-6 text-emerald-400" />
            <h1 className="text-2xl font-semibold tracking-tight">Salary Intelligence</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Market compensation data, trends, and career pivot insights from{" "}
            {kpis?.totalDataPoints?.toLocaleString() ?? 0} data points across{" "}
            {kpis?.totalCompanies?.toLocaleString() ?? 0} companies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 font-sans"
            render={<a href="/salary-data" />}
          >
            <Database className="size-3.5" />
            Salary Data
          </Button>
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5 font-sans">
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar (Max 2 Rows) */}
      <Card className="flex flex-col gap-4 border-border/50 bg-card/50 p-4 rounded-lg">
        {/* Row 1: Role Type Multiselect Combobox & Saved Views Trigger on the right */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Role selector (Combobox Multiselect) */}
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Role:</span>
            <div className="flex-1 w-full max-w-xl">
              <Combobox
                multiple
                value={filters.roleType}
                onValueChange={(val) => {
                  if (val.includes("select-all")) {
                    setFilters((p) => ({ ...p, roleType: overview?.roleTypes ?? [] }));
                  } else if (val.includes("deselect-all")) {
                    setFilters((p) => ({ ...p, roleType: [] }));
                  } else {
                    setFilters((p) => ({ ...p, roleType: val }));
                  }
                }}
              >
                <ComboboxChips ref={anchor} className="w-full bg-input/20 border-border/40 hover:border-border/80 focus-within:border-emerald-500/50">
                  <ComboboxValue>
                    {(values) => (
                      <div className="flex flex-wrap gap-1 items-center min-h-[26px]">
                        {values.length === 0 ? (
                          <span className="text-muted-foreground text-sm pl-1 font-sans">All Roles</span>
                        ) : (
                          values.map((value: string) => (
                            <ComboboxChip key={value} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-sans rounded-sm px-1.5 py-0.5">
                              {value}
                            </ComboboxChip>
                          ))
                        )}
                        <ComboboxChipsInput className="text-sm text-foreground placeholder:text-muted-foreground/50 font-sans" placeholder={values.length === 0 ? "Select roles..." : ""} />
                      </div>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={anchor} className="bg-popover border border-border shadow-xl rounded-md min-w-[280px]">
                  <ComboboxEmpty className="text-sm text-muted-foreground py-2 text-center font-sans">No roles found.</ComboboxEmpty>
                  <ComboboxList className="p-1">
                    <ComboboxItem value="select-all" className="text-sm font-sans font-semibold text-emerald-400 hover:bg-emerald-500/10 cursor-pointer">
                      Select All
                    </ComboboxItem>
                    <ComboboxItem value="deselect-all" className="text-sm font-sans font-semibold text-rose-400 hover:bg-rose-500/10 cursor-pointer">
                      Deselect All
                    </ComboboxItem>
                    <ComboboxSeparator className="bg-border/40 my-1" />
                    {(overview?.roleTypes ?? []).map((role) => (
                      <ComboboxItem key={role} value={role} className="text-sm font-sans capitalize cursor-pointer">
                        {role}
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          </div>

          {/* Saved Views trigger (kept cleanly off to the side) */}
          <div className="flex items-center gap-2 shrink-0 md:ml-auto">
            <span className="text-xs text-muted-foreground font-sans">Saved View:</span>
            <Select value={activeViewId} onValueChange={(v) => applyView(v ?? "all")}>
              <SelectTrigger className="h-9 w-44 text-sm font-sans bg-input/20 border-border/40">
                <SelectValue placeholder="All Data" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border rounded-md shadow-lg">
                <SelectItem value="all" className="text-sm font-sans cursor-pointer">All Data</SelectItem>
                {savedViews.map((v) => (
                  <SelectItem key={v.id} value={String(v.id)} className="text-sm font-sans cursor-pointer">
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Dialog>
              <DialogTrigger
                render={<Button variant="outline" size="icon" className="h-9 w-9 bg-input/20 border-border/40 hover:bg-muted" />}
              >
                <Save className="size-4 text-foreground" />
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm bg-popover border border-border rounded-lg shadow-xl font-sans">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold">Save Current View</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3 pt-2">
                  <Input
                    placeholder="e.g. SF Senior Engineers"
                    value={newViewName}
                    onChange={(e) => setNewViewName(e.target.value)}
                    className="h-9 border-border/60 font-sans"
                  />
                  <div className="text-xs text-muted-foreground font-sans">
                    Saves current filters: Roles={filters.roleType.length > 0 ? filters.roleType.join(", ") : "All"}, Metric={filters.metricKey}, Seniority={filters.seniority}
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <DialogClose render={<Button variant="ghost" size="sm" className="font-sans" />}>
                    Cancel
                  </DialogClose>
                  <DialogClose
                    render={<Button size="sm" onClick={handleSaveView} disabled={savingView || !newViewName.trim()} className="gap-1.5 font-sans bg-emerald-600 hover:bg-emerald-500 text-white" />}
                  >
                    <Plus className="size-4" />
                    Save View
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {activeViewId !== "all" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                onClick={() => handleDeleteView(Number(activeViewId))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Separator */}
        <Separator className="bg-border/30 h-px" />

        {/* Row 2: Metric & Seniority aligned side-by-side with correct triggers */}
        <div className="flex flex-wrap items-center gap-6">
          {/* Metric Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Metric:</span>
            <Select value={filters.metricKey} onValueChange={(v) => setFilters((p) => ({ ...p, metricKey: v ?? "all" }))}>
              <SelectTrigger className="h-9 w-36 text-sm font-sans bg-input/20 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border rounded-md shadow-lg">
                <SelectItem value="all" className="text-sm font-sans cursor-pointer">All Metrics</SelectItem>
                <SelectItem value="national" className="text-sm font-sans cursor-pointer">National</SelectItem>
                <SelectItem value="local_market" className="text-sm font-sans cursor-pointer">Local (SF)</SelectItem>
                <SelectItem value="remote" className="text-sm font-sans cursor-pointer">Remote</SelectItem>
                <SelectItem value="top_hubs" className="text-sm font-sans cursor-pointer">Top Hubs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seniority Selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Level:</span>
            <Select value={filters.seniority} onValueChange={(v) => setFilters((p) => ({ ...p, seniority: v ?? "all" }))}>
              <SelectTrigger className="h-9.5 w-32 text-sm font-sans bg-input/20 border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border rounded-md shadow-lg">
                <SelectItem value="all" className="text-sm font-sans cursor-pointer">All Levels</SelectItem>
                {uniqueSeniorities.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm font-sans capitalize cursor-pointer">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reset Filters button (Visible only when filters are active) */}
          {(filters.roleType.length > 0 || filters.metricKey !== "all" || filters.seniority !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ roleType: [], metricKey: "all", seniority: "all" })}
              className="text-xs font-sans text-muted-foreground hover:text-foreground"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {!hasData ? (
        /* Empty state */
        <Card className="flex flex-col items-center justify-center gap-4 py-20">
          <TrendingUp className="size-12 text-muted-foreground/30" />
          <div className="text-center animate-fade-in">
            <h3 className="text-lg font-medium">No Salary Data Yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Salary data is synced automatically by the Pipeline GitHub Action. Once the next sync
              completes, charts will populate here automatically.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI Insight Cards */}
          <SalaryInsightCards kpis={kpis!} activeMetricKey={filters.metricKey} />

          {/* Row 1: Percentile Range + Remote Discount */}
          <div className="grid gap-5 lg:grid-cols-2">
            <PercentileRangeChart data={filteredStats} />
            <RemoteDiscountChart data={overview!.stats} roleTypes={overview!.roleTypes} />
          </div>

          {/* Row 2: Top Companies + Geographic Premium */}
          <div className="grid gap-5 lg:grid-cols-2">
            <TopCompaniesChart data={filteredCompanies} />
            <GeographicPremiumChart data={overview!.stats} roleTypes={overview!.roleTypes} geoLocations={geoLocations.length > 0 ? geoLocations : undefined} />
          </div>

          {/* Row 3: Company Heatmap (full width) */}
          <CompanySalaryHeatmap data={filteredCompanies} />

          {/* Row 4: Seniority Ladder + Trend Sparklines */}
          <div className="grid gap-5 lg:grid-cols-2">
            <SeniorityLadderChart data={filteredCompanies} />
            <TrendSparklines data={trends} roleTypes={overview!.roleTypes} />
          </div>

          {/* Row 5: AI Insights */}
          <SalaryAIInsights insight={overview!.latestInsight} />

          {/* Row 6: Pinned Role Comparison */}
          {pinnedRoles.length > 0 && (
            <PinnedRoleComparison
              pinnedRoles={pinnedRoles}
              onUnpin={handleUnpin}
              marketStats={overview!.stats}
            />
          )}

          {/* Radar chart for pinned roles */}
          {pinnedRoles.length >= 2 && (
            <RoleComparisonRadar pinnedRoles={pinnedRoles} marketStats={overview!.stats} />
          )}
        </>
      )}
    </div>
    </SalaryIntelChatProvider>
  );
}
