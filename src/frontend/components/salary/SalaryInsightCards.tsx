/**
 * @fileoverview KPI insight cards that assert findings rather than just showing
 * numbers — following Tufte rule #22: "Titles assert findings".
 */

import { TrendingUp, TrendingDown, Building2, MapPin, Wifi, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";

type KPIs = {
  avgNationalMedian: number | null;
  avgLocalMedian: number | null;
  avgRemoteMedian: number | null;
  sfPremium: number | null;
  remoteDiscount: number | null;
  topCompany: { companyName: string; median: number; jobTitle: string } | null;
  totalCompanies: number;
  totalDataPoints: number;
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export function SalaryInsightCards({ kpis, activeMetricKey }: { kpis: KPIs; activeMetricKey?: string }) {
  const cards = [
    {
      key: "national",
      title:
        kpis.avgNationalMedian
          ? `National Median: ${fmt(kpis.avgNationalMedian)}`
          : "National Median",
      subtitle: "Across all tracked target roles",
      value: kpis.avgNationalMedian ? fmt(kpis.avgNationalMedian) : "—",
      icon: DollarSign,
      color: "text-emerald-400",
      bgGlow: "from-emerald-500/10 to-transparent",
    },
    {
      key: "local_market",
      title:
        kpis.sfPremium !== null
          ? `SF Engineers Earn ${kpis.sfPremium}% Above National`
          : "SF Bay Area Premium",
      subtitle: kpis.avgLocalMedian ? `Local median: ${fmt(kpis.avgLocalMedian)}` : "No local data",
      value: kpis.sfPremium !== null ? `+${kpis.sfPremium}%` : "—",
      icon: MapPin,
      color: "text-sky-400",
      bgGlow: "from-sky-500/10 to-transparent",
    },
    {
      key: "remote",
      title:
        kpis.remoteDiscount !== null
          ? `Remote Roles ${kpis.remoteDiscount > 0 ? "Discount" : "Premium"}: ${Math.abs(kpis.remoteDiscount)}%`
          : "Remote vs Local",
      subtitle: kpis.avgRemoteMedian ? `Remote median: ${fmt(kpis.avgRemoteMedian)}` : "No remote data",
      value:
        kpis.remoteDiscount !== null
          ? kpis.remoteDiscount > 0
            ? `-${kpis.remoteDiscount}%`
            : `+${Math.abs(kpis.remoteDiscount)}%`
          : "—",
      icon: Wifi,
      color: kpis.remoteDiscount && kpis.remoteDiscount > 0 ? "text-amber-400" : "text-emerald-400",
      bgGlow:
        kpis.remoteDiscount && kpis.remoteDiscount > 0
          ? "from-amber-500/10 to-transparent"
          : "from-emerald-500/10 to-transparent",
    },
    {
      key: "top_company",
      title: kpis.topCompany
        ? `Top Payer: ${kpis.topCompany.companyName}`
        : "Top Paying Company",
      subtitle: kpis.topCompany
        ? `${kpis.topCompany.jobTitle} — ${fmt(kpis.topCompany.median)} median`
        : "No company data",
      value: kpis.topCompany ? fmt(kpis.topCompany.median) : "—",
      icon: Building2,
      color: "text-violet-400",
      bgGlow: "from-violet-500/10 to-transparent",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const isActive = activeMetricKey && card.key === activeMetricKey;
        return (
          <Card
            key={card.title}
            className={`relative overflow-hidden bg-card/60 p-4 transition-all duration-300 ${
              isActive
                ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/30 scale-[1.01]"
                : "border-border/40"
            }`}
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${card.bgGlow} pointer-events-none`} />
            <div className="relative flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 pr-16">
                  {card.title.length > 40 ? card.title.slice(0, 40) + "…" : card.title}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{card.value}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{card.subtitle}</p>
              </div>
              <div className={`rounded-lg bg-muted/40 p-2 ${card.color}`}>
                <Icon className="size-5" />
              </div>
            </div>
            
            {isActive && (
              <div className="absolute top-3 right-12 flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 font-sans tracking-wide uppercase">
                Active Filter
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
