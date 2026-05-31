/**
 * @fileoverview Companies analytics dashboard — aggregated charts and listing
 * table for all tracked companies. Shows Top-5 breakdowns by role count,
 * salary averages, status distribution, and a full company listing with
 * clickable names linking to individual company viewports.
 */

import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Loader2,
  Search,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChartItem = { name: string; id: string; value: number };

type Analytics = {
  topByRoleCount: ChartItem[];
  topByHighestSalary: ChartItem[];
  topByLowestSalary: ChartItem[];
  statusDistribution: { name: string; value: number }[];
  totalCompanies: number;
  totalRoles: number;
  companiesWithGreenhouse: number;
};

type CompanyRow = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  greenhouseToken: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  preparing: "#3b82f6",
  processing_error: "#f97316",
  applied: "#f59e0b",
  interviewing: "#8b5cf6",
  offer: "#10b981",
  rejected: "#ef4444",
  withdrawn: "#64748b",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CompaniesPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsData, companiesData] = await Promise.all([
        apiGet<Analytics>("/api/companies/analytics"),
        apiGet<CompanyRow[]>("/api/companies"),
      ]);
      setAnalytics(analyticsData);
      setCompanies(companiesData);
    } catch {
      toast({ title: "Failed to load company data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered company list
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return companies;
    const q = searchQuery.toLowerCase();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.url?.toLowerCase() || "").includes(q) ||
        (c.greenhouseToken?.toLowerCase() || "").includes(q),
    );
  }, [companies, searchQuery]);

  // Map analytics role counts to company list for the table

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Loading company analytics…
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Companies</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analytics across all tracked companies. Click a company name to view its detail page.
        </p>
      </div>

      {/* Summary cards */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Total Companies"
            value={analytics.totalCompanies}
            icon={<Building2 className="size-4 text-blue-400" />}
          />
          <SummaryCard
            label="Total Roles"
            value={analytics.totalRoles}
            icon={<Users className="size-4 text-emerald-400" />}
          />
          <SummaryCard
            label="Greenhouse Boards"
            value={analytics.companiesWithGreenhouse}
            icon={<BarChart3 className="size-4 text-amber-400" />}
          />
        </div>
      )}

      {/* Charts grid */}
      {analytics && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Top 5 by Role Count */}
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="size-4 text-blue-400" />
                Top 5 Companies by Role Count
              </CardTitle>
              <CardDescription>Most tracked roles</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ChartContainer config={{ value: { label: "Roles", color: "#3b82f6" } }}>
                <BarChart data={analytics.topByRoleCount} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Top 5 Highest Avg Salary */}
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-emerald-400" />
                Top 5 Highest Avg Salary
              </CardTitle>
              <CardDescription>Mean of min/max salary per company</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ChartContainer config={{ value: { label: "Avg Salary", color: "#10b981" } }}>
                <BarChart
                  data={analytics.topByHighestSalary}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(v: any) => `$${Number(v).toLocaleString()}`}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Top 5 Lowest Avg Salary */}
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown className="size-4 text-amber-400" />
                Top 5 Lowest Avg Salary
              </CardTitle>
              <CardDescription>Companies with the lowest mean salary</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ChartContainer config={{ value: { label: "Avg Salary", color: "#f59e0b" } }}>
                <BarChart
                  data={analytics.topByLowestSalary}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                  <ChartTooltip
                    content={<ChartTooltipContent />}
                    formatter={(v: any) => `$${Number(v).toLocaleString()}`}
                  />
                  <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Status Distribution */}
          <Card className="rounded-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="size-4 text-purple-400" />
                Role Status Distribution
              </CardTitle>
              <CardDescription>All roles across all companies</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ChartContainer config={{}}>
                <PieChart>
                  <Pie
                    data={analytics.statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {analytics.statusDistribution.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Company listing table */}
      <Card className="rounded-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm">All Companies</CardTitle>
              <CardDescription>
                {filtered.length === companies.length
                  ? `${companies.length} companies`
                  : `${filtered.length} of ${companies.length} companies`}
              </CardDescription>
            </div>
            <div className="relative w-[280px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search companies…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {companies.length === 0
                ? "No companies tracked yet."
                : "No companies match your search."}
            </p>
          ) : (
            <div className="overflow-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Greenhouse Board</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {company.logoUrl ? (
                            <img
                              src={company.logoUrl}
                              alt=""
                              className="size-8 rounded-md border border-border/40 object-contain bg-muted/20 p-0.5"
                            />
                          ) : (
                            <div className="flex size-8 items-center justify-center rounded-md border border-border/40 bg-muted/20">
                              <Building2 className="size-4 text-muted-foreground" />
                            </div>
                          )}
                          <a
                            href={`/companies/${company.id}`}
                            className="inline-flex items-center gap-1 font-medium text-blue-400 hover:underline"
                          >
                            {company.name}
                            <ArrowUpRight className="size-3" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.url ? (
                          <a
                            href={company.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {new URL(company.url).hostname}
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {company.greenhouseToken ? (
                          <Badge variant="secondary" className="text-xs font-mono">
                            {company.greenhouseToken}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {company.colorPrimary ? (
                            <div
                              className="size-4 rounded-sm border border-border/40"
                              style={{ background: company.colorPrimary }}
                              title={`Primary: ${company.colorPrimary}`}
                            />
                          ) : null}
                          {company.colorAccent ? (
                            <div
                              className="size-4 rounded-sm border border-border/40"
                              style={{ background: company.colorAccent }}
                              title={`Accent: ${company.colorAccent}`}
                            />
                          ) : null}
                          {!company.colorPrimary && !company.colorAccent && (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(company.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SummaryCard
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="rounded-lg">
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
