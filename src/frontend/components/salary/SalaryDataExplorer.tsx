/**
 * @fileoverview Read-only explorer for the raw seeded salary/market data.
 *
 * Two layers:
 *  1. A visual dashboard (recharts + a mapcn cost-of-living map) summarizing every
 *     seeded table. All charts use a shades-of-blue palette tuned for the dark
 *     background, and each carries a data-derived insight footer.
 *  2. Full-transparency tables (paginated) with conditional formatting that
 *     flags bad data (e.g. the "unknown" sentinel) and a jump-to-errors control.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Map as GeoMap,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
} from "@/components/ui/map";
import { AlertTriangle, ChevronLeft, ChevronRight, Database, MapPin, TrendingUp } from "lucide-react";

import { PercentileInfoButton } from "./PercentileInfoModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TablePayload {
  key: string;
  label: string;
  count: number;
  rows: Record<string, unknown>[];
}

interface ExplorerResponse {
  success: boolean;
  generatedAt: string;
  tables: TablePayload[];
}

// ---------------------------------------------------------------------------
// Dark-theme chart constants — shades of blue only (high contrast)
// ---------------------------------------------------------------------------

// Bright → deep blue ramp; all members stay in the blue family.
const BLUE = [
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#93c5fd", // blue-300
  "#2563eb", // blue-600
  "#38bdf8", // sky-400
  "#1d4ed8", // blue-700
  "#7dd3fc", // sky-300
  "#0ea5e9", // sky-500
  "#bfdbfe", // blue-200
  "#1e40af", // blue-800
] as const;

// Distinct shades within blue for the percentile triad.
const P25_BLUE = "#93c5fd"; // light
const MEDIAN_BLUE = "#3b82f6"; // mid
const P75_BLUE = "#1d4ed8"; // deep

const ERROR_RED = "#f87171"; // reserved for "unknown"/bad data only

const AXIS_COLOR = "#cbd5e1"; // slate-300
const GRID_COLOR = "#334155"; // slate-700
const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 8,
  color: "#f1f5f9",
};
const LEGEND_STYLE = { color: "#e2e8f0", fontSize: 12 };

const usd = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(v);

// Fallback metro coordinates if a geo_locations row lacks lat/lng.
const FALLBACK_COORDS: Record<string, [number, number]> = {
  "san francisco": [-122.4194, 37.7749],
  "new york": [-74.006, 40.7128],
  seattle: [-122.3321, 47.6062],
  austin: [-97.7431, 30.2672],
  boston: [-71.0589, 42.3601],
  "los angeles": [-118.2437, 34.0522],
  denver: [-104.9903, 39.7392],
  chicago: [-87.6298, 41.8781],
  atlanta: [-84.388, 33.749],
  portland: [-122.6765, 45.5152],
  miami: [-80.1918, 25.7617],
  raleigh: [-78.6382, 35.7796],
  dallas: [-96.797, 32.7767],
  washington: [-77.0369, 38.9072],
  "san diego": [-117.1611, 32.7157],
  phoenix: [-112.074, 33.4484],
  "salt lake city": [-111.891, 40.7608],
};

function lookupCoords(metro: string): [number, number] | null {
  const lower = metro.toLowerCase().trim();
  if (FALLBACK_COORDS[lower]) return FALLBACK_COORDS[lower];
  for (const [key, coords] of Object.entries(FALLBACK_COORDS)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function tableRows(tables: TablePayload[], key: string): Record<string, unknown>[] {
  return tables.find((t) => t.key === key)?.rows ?? [];
}

function countBy(rows: Record<string, unknown>[], field: string) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const raw = r[field];
    const name = raw === null || raw === undefined || raw === "" ? "(empty)" : String(raw);
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function avgBy(
  rows: Record<string, unknown>[],
  groupField: string,
  valueFields: string[],
) {
  const buckets = new Map<string, { sums: Record<string, number>; n: number }>();
  for (const r of rows) {
    const g = String(r[groupField] ?? "(empty)");
    if (!buckets.has(g)) buckets.set(g, { sums: Object.fromEntries(valueFields.map((f) => [f, 0])), n: 0 });
    const b = buckets.get(g)!;
    b.n += 1;
    for (const f of valueFields) b.sums[f] += Number(r[f]) || 0;
  }
  return [...buckets.entries()].map(([name, b]) => {
    const out: Record<string, number | string> = { name };
    for (const f of valueFields) out[f] = Math.round(b.sums[f] / b.n);
    return out;
  });
}

// ---------------------------------------------------------------------------
// Bad-data detection
// ---------------------------------------------------------------------------

function isBadValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  if (v === "") return true;
  return v.includes("unknown");
}

function rowHasError(row: Record<string, unknown>): boolean {
  return Object.values(row).some(isBadValue);
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "number" && value > 1_000_000_000_000) return new Date(value).toISOString();
  return String(value);
}

// ---------------------------------------------------------------------------
// Chart wrapper — header (with optional action) + chart + insight footer
// ---------------------------------------------------------------------------

function ChartCard({
  title,
  description,
  action,
  insight,
  insightSub,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  insight?: React.ReactNode;
  insightSub?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex w-full flex-col border-border/50 bg-card/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base text-slate-100">{title}</CardTitle>
            {description && <CardDescription className="text-slate-400">{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      </CardContent>
      {(insight || insightSub) && (
        <CardFooter className="flex-col gap-2 text-sm">
          {insight && (
            <div className="flex items-center gap-2 leading-none font-medium">
              {insight} <TrendingUp className="h-4 w-4" />
            </div>
          )}
          {insightSub && <div className="leading-none text-muted-foreground">{insightSub}</div>}
        </CardFooter>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cost-of-living + geo map dashboard (full width, 2 cards)
// ---------------------------------------------------------------------------

interface ColPoint {
  metro: string;
  col: number;
  lat: number;
  lng: number;
}

function CostOfLivingMapDashboard({ tables }: { tables: TablePayload[] }) {
  const { points, geoTypeCounts } = useMemo(() => {
    const colRows = tableRows(tables, "cost_of_living_index");
    const geoRows = tableRows(tables, "geo_locations");

    const geoByMetro = new Map<string, Record<string, unknown>>();
    for (const g of geoRows) {
      const key = String(g.metro ?? g.name ?? "").toLowerCase().trim();
      if (key) geoByMetro.set(key, g);
    }

    const pts: ColPoint[] = [];
    for (const c of colRows) {
      const metro = String(c.metro ?? "").trim();
      if (!metro) continue;
      const geo = geoByMetro.get(metro.toLowerCase());
      const country = geo ? String(geo.country ?? "") : "";
      // Limit to the United States (include when country is US or unknown).
      if (country && country !== "US") continue;

      let lat = geo ? Number(geo.lat) : NaN;
      let lng = geo ? Number(geo.lng) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const fb = lookupCoords(metro);
        if (!fb) continue;
        [lng, lat] = fb;
      }
      pts.push({ metro, col: Number(c.colIndex) || 0, lat, lng });
    }
    pts.sort((a, b) => b.col - a.col);

    // Geo-by-type, US only — combined data point per the dashboard request.
    const usGeo = geoRows.filter((g) => {
      const country = String(g.country ?? "");
      return !country || country === "US";
    });
    const geoTypeCounts = countBy(usGeo, "type");

    return { points: pts, geoTypeCounts };
  }, [tables]);

  if (points.length === 0) {
    return null;
  }

  const cols = points.map((p) => p.col);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const centerLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const centerLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const priciest = points[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Card 1 — interactive map */}
      <Card className="relative overflow-hidden border-border/50 bg-card/50 p-0 lg:col-span-2">
        <div className="absolute top-3 left-3 z-10 rounded-lg border border-border/30 bg-card/80 px-3 py-2 backdrop-blur-sm">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
            <MapPin className="size-3.5 text-blue-400" />
            Cost of Living — US Metros
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Marker size = COL multiplier · {points.length} metros
          </p>
        </div>
        <div className="relative h-[480px]">
          <GeoMap center={[centerLng || -98.5, centerLat || 39.5]} zoom={3.4} scrollZoom={false}>
            <MapControls position="bottom-right" showZoom />
            {points.map((p) => {
              const t = maxCol > minCol ? (p.col - minCol) / (maxCol - minCol) : 0.5;
              const size = 12 + t * 26; // 12..38px
              return (
                <MapMarker key={p.metro} longitude={p.lng} latitude={p.lat}>
                  <MarkerContent>
                    <div
                      className="flex items-center justify-center rounded-full border-2 border-blue-300/70 transition-transform duration-200 hover:scale-110"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        backgroundColor: `rgba(59, 130, 246, ${0.35 + t * 0.4})`,
                        boxShadow: "0 0 8px rgba(59, 130, 246, 0.45)",
                      }}
                    >
                      <span className="text-[8px] font-bold tabular-nums text-blue-50">
                        {p.col.toFixed(2)}
                      </span>
                    </div>
                  </MarkerContent>
                  <MarkerTooltip>
                    <div className="min-w-[140px]">
                      <p className="text-[11px] font-semibold">{p.metro}</p>
                      <div className="mt-1 flex justify-between text-[10px]">
                        <span className="text-muted-foreground">COL index:</span>
                        <span className="font-bold tabular-nums">{p.col.toFixed(2)}×</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">vs national:</span>
                        <span
                          className={
                            "font-bold tabular-nums " +
                            (p.col >= 1 ? "text-blue-300" : "text-sky-300")
                          }
                        >
                          {p.col >= 1 ? "+" : ""}
                          {Math.round((p.col - 1) * 100)}%
                        </span>
                      </div>
                    </div>
                  </MarkerTooltip>
                </MapMarker>
              );
            })}
          </GeoMap>
        </div>
      </Card>

      {/* Card 2 — COL breakdown + geo-type summary */}
      <Card className="flex flex-col border-border/50 bg-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-slate-100">Cost of Living Index</CardTitle>
          <CardDescription className="text-slate-400">
            Multiplier vs national baseline (1.00×).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1">
          {geoTypeCounts.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {geoTypeCounts.map((g) => (
                <Badge
                  key={g.name}
                  variant="outline"
                  className="border-blue-500/40 bg-blue-500/10 text-blue-200"
                >
                  {g.name}: {g.value}
                </Badge>
              ))}
            </div>
          )}
          <div className="space-y-3">
            {points.slice(0, 12).map((p) => (
              <div key={p.metro} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-200">{p.metro}</span>
                  <span className="font-medium tabular-nums text-slate-100">{p.col.toFixed(2)}×</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-blue-500/85"
                    style={{ width: `${maxCol > 0 ? (p.col / maxCol) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter className="flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 leading-none font-medium">
            {priciest.metro} is the priciest at {priciest.col.toFixed(2)}× baseline
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="leading-none text-muted-foreground">
            {points.length} US metros mapped, ranging {minCol.toFixed(2)}×–{maxCol.toFixed(2)}×
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charts dashboard
// ---------------------------------------------------------------------------

function ChartsDashboard({ tables }: { tables: TablePayload[] }) {
  const segments = useMemo(() => countBy(tableRows(tables, "company_segments"), "segment"), [tables]);
  const families = useMemo(
    () => countBy(tableRows(tables, "role_family_taxonomy"), "family").slice(0, 7),
    [tables],
  );
  const levels = useMemo(() => countBy(tableRows(tables, "role_family_taxonomy"), "level"), [tables]);
  const statsByMetric = useMemo(
    () => avgBy(tableRows(tables, "market_salary_stats"), "metricLabel", ["p25", "median", "p75"]),
    [tables],
  );
  const topCompanies = useMemo(() => {
    const rows = avgBy(tableRows(tables, "market_company_salaries"), "companyName", ["median"]);
    return rows
      .filter((r) => (r.median as number) > 0 && r.name !== "(empty)")
      .sort((a, b) => (b.median as number) - (a.median as number))
      .slice(0, 7);
  }, [tables]);
  const bySeniority = useMemo(
    () => avgBy(tableRows(tables, "market_company_salaries"), "seniority", ["p25", "median", "p75"]),
    [tables],
  );

  const segmentTotal = segments.reduce((s, x) => s + x.value, 0);
  const levelTotal = levels.reduce((s, x) => s + x.value, 0);

  const widestSpread = useMemo(() => {
    const spreads = statsByMetric
      .map((s) => ({ name: String(s.name), spread: Number(s.p75) - Number(s.p25) }))
      .sort((a, b) => b.spread - a.spread);
    return spreads[0];
  }, [statsByMetric]);

  const seniorityMedians = bySeniority.map((s) => Number(s.median)).filter((n) => n > 0);
  const senLow = seniorityMedians.length ? Math.min(...seniorityMedians) : 0;
  const senHigh = seniorityMedians.length ? Math.max(...seniorityMedians) : 0;

  const hasAny =
    segments.length > 0 ||
    families.length > 0 ||
    levels.length > 0 ||
    statsByMetric.length > 0 ||
    topCompanies.length > 0;

  return (
    <div className="space-y-6">
      {/* Full-width cost-of-living map dashboard */}
      <CostOfLivingMapDashboard tables={tables} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Company segments — horizontal bar */}
        {segments.length > 0 && (
          <ChartCard
            title="Company Segments"
            description="How many companies fall into each classification."
            insight={`${segments[0].name} is the most common segment (${segments[0].value} companies)`}
            insightSub={`${segments.length} segments across ${segmentTotal} classified companies`}
          >
            <BarChart data={segments} layout="vertical" margin={{ top: 8, right: 24, left: 40, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 11 }} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1e293b66" }} />
              <Bar dataKey="value" name="Companies" radius={[0, 4, 4, 0]}>
                {segments.map((s, i) => (
                  <Cell
                    key={s.name}
                    fill={s.name.toLowerCase().includes("unknown") ? ERROR_RED : BLUE[i % BLUE.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        )}

        {/* Role families — top 7, horizontal bar */}
        {families.length > 0 && (
          <ChartCard
            title="Role Families (Top 7)"
            description="Most common normalized job-title families."
            insight={`${families[0].name} leads with ${families[0].value} normalized titles`}
            insightSub={`Top ${families.length} role families by title count`}
          >
            <BarChart data={families} layout="vertical" margin={{ top: 8, right: 24, left: 40, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 11 }} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1e293b66" }} />
              <Bar dataKey="value" name="Titles" radius={[0, 4, 4, 0]}>
                {families.map((f, i) => (
                  <Cell key={f.name} fill={BLUE[i % BLUE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        )}

        {/* Seniority levels — label-list pie */}
        {levels.length > 0 && (
          <ChartCard
            title="Seniority Levels"
            description="Share of titles by inferred level."
            insight={
              levelTotal > 0
                ? `${levels[0].name} accounts for ${Math.round((levels[0].value / levelTotal) * 100)}% of classified titles`
                : undefined
            }
            insightSub={`Distribution across ${levels.length} seniority levels`}
          >
            <PieChart>
              <Pie
                data={levels}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                stroke="#0f172a"
              >
                {levels.map((l, i) => (
                  <Cell key={l.name} fill={BLUE[i % BLUE.length]} />
                ))}
                <LabelList
                  dataKey="name"
                  stroke="none"
                  fontSize={11}
                  fill="#f8fafc"
                />
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={LEGEND_STYLE} />
            </PieChart>
          </ChartCard>
        )}

        {/* Market percentiles — grouped bar (+ explainer modal) */}
        {statsByMetric.length > 0 && (
          <ChartCard
            title="Market Percentiles"
            description="Avg P25 / Median / P75 by market segment."
            action={<PercentileInfoButton label="What do these mean?" />}
            insight={
              widestSpread
                ? `${widestSpread.name} has the widest P25–P75 spread (${usd(widestSpread.spread)})`
                : undefined
            }
            insightSub="Wider spreads mean more negotiation upside."
          >
            <BarChart data={statsByMetric} margin={{ top: 8, right: 16, left: 8, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={60} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={56} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1e293b66" }} formatter={(v) => usd(Number(v))} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="p25" name="P25" fill={P25_BLUE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="median" name="Median" fill={MEDIAN_BLUE} radius={[3, 3, 0, 0]} />
              <Bar dataKey="p75" name="P75" fill={P75_BLUE} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartCard>
        )}

        {/* Comp by seniority — line (+ explainer modal) */}
        {bySeniority.length > 0 && (
          <ChartCard
            title="Compensation by Seniority"
            description="Avg P25 / Median / P75 across companies."
            action={<PercentileInfoButton label="What do these mean?" />}
            insight={
              senHigh > 0
                ? `Median rises from ${usd(senLow)} to ${usd(senHigh)} across levels`
                : undefined
            }
            insightSub="Each line is a percentile band; the gap is the pay spread."
          >
            <LineChart data={bySeniority} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
              <XAxis dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 11 }} />
              <YAxis tick={{ fill: AXIS_COLOR, fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={56} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => usd(Number(v))} />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Line type="monotone" dataKey="p25" name="P25" stroke={P25_BLUE} strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="median" name="Median" stroke={MEDIAN_BLUE} strokeWidth={3} dot={{ r: 5 }} />
              <Line type="monotone" dataKey="p75" name="P75" stroke={P75_BLUE} strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartCard>
        )}

        {/* Top companies — top 7, horizontal bar */}
        {topCompanies.length > 0 && (
          <ChartCard
            title="Top Companies by Median Comp (Top 7)"
            description="Highest median compensation."
            insight={`${topCompanies[0].name} leads at ${usd(Number(topCompanies[0].median))} median`}
            insightSub="Top 7 companies ranked by median compensation."
          >
            <BarChart data={topCompanies} layout="vertical" margin={{ top: 8, right: 24, left: 40, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
              <XAxis type="number" tick={{ fill: AXIS_COLOR, fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" tick={{ fill: AXIS_COLOR, fontSize: 10 }} width={140} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1e293b66" }} formatter={(v) => usd(Number(v))} />
              <Bar dataKey="median" name="Median" radius={[0, 4, 4, 0]}>
                {topCompanies.map((c, i) => (
                  <Cell key={String(c.name)} fill={BLUE[i % BLUE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartCard>
        )}
      </div>

      {!hasAny && (
        <p className="text-sm text-slate-400">
          No seeded data yet — run the seed endpoints to populate these charts.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Paginated table with error highlighting
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

function DataTableCard({ table }: { table: TablePayload }) {
  const [page, setPage] = useState(0);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const columns = table.rows.length > 0 ? Object.keys(table.rows[0]) : [];
  const errorRowCount = useMemo(() => table.rows.filter(rowHasError).length, [table.rows]);

  const visibleRows = useMemo(
    () => (errorsOnly ? table.rows.filter(rowHasError) : table.rows),
    [table.rows, errorsOnly],
  );

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = visibleRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleErrors = () => {
    setErrorsOnly((v) => !v);
    setPage(0);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Card ref={cardRef} className="w-full border-border/50 bg-card/50 scroll-mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <Database className="size-4 text-blue-400" />
              {table.label}
            </CardTitle>
            <CardDescription className="font-mono text-xs text-slate-400">
              {table.key} · {table.count} row{table.count === 1 ? "" : "s"}
            </CardDescription>
          </div>
          {errorRowCount > 0 && (
            <Button
              variant={errorsOnly ? "destructive" : "outline"}
              size="sm"
              onClick={toggleErrors}
              className="gap-1.5"
            >
              <AlertTriangle className="size-3.5" />
              {errorsOnly ? "Show all rows" : "Jump to errors"}
              <Badge variant="destructive" className="ml-1">
                {errorRowCount}
              </Badge>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {table.rows.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            No rows. Run the seed endpoints to populate this table.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border/40">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30">
                    {columns.map((col) => (
                      <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-200">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row, i) => {
                    const bad = rowHasError(row);
                    return (
                      <tr
                        key={i}
                        className={
                          bad
                            ? "border-b border-red-500/20 bg-red-500/5"
                            : "border-b border-border/30 hover:bg-muted/30"
                        }
                      >
                        {columns.map((col) => {
                          const cellBad = isBadValue(row[col]);
                          return (
                            <td
                              key={col}
                              className={
                                "whitespace-nowrap px-3 py-2 font-mono text-xs " +
                                (cellBad
                                  ? "bg-red-500/20 font-semibold text-red-300"
                                  : "text-slate-300")
                              }
                            >
                              {formatCell(row[col])}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>
                {errorsOnly ? "Errors · " : ""}
                Showing {pageRows.length} of {visibleRows.length}
                {errorsOnly ? " error rows" : " rows"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="tabular-nums">
                  Page {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function SalaryDataExplorer() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ExplorerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/pipeline/salary/data-explorer");
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const json = (await res.json()) as ExplorerResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-72 w-full animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center text-slate-400">
        <p>Failed to load salary data.</p>
        {error && <p className="mt-2 text-sm">{error}</p>}
      </div>
    );
  }

  const totalErrors = data.tables.reduce((acc, t) => acc + t.rows.filter(rowHasError).length, 0);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-100">Visual Overview</h2>
          <div className="flex items-center gap-3">
            <PercentileInfoButton />
            <span className="text-xs text-slate-400">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </span>
          </div>
        </div>
        <ChartsDashboard tables={data.tables} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-100">Raw Tables</h2>
          {totalErrors > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="size-3" />
              {totalErrors} flagged rows
            </Badge>
          )}
        </div>
        <div className="space-y-6">
          {data.tables.map((table) => (
            <DataTableCard key={table.key} table={table} />
          ))}
        </div>
      </section>
    </div>
  );
}
