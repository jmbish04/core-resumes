/**
 * @fileoverview Global health status badge for the Navbar.
 *
 * Polls `GET /api/health/latest` every 30 seconds to display the system's
 * most recent health screening status as an animated dot with label.
 */

import { Activity } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

import { toast } from "@/lib/api-client";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: "bg-emerald-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-500",
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: "HEALTHY",
  degraded: "DEGRADED",
  unhealthy: "UNHEALTHY",
  unknown: "UNKNOWN",
};

export function HealthBadge() {
  const [status, setStatus] = useState<HealthStatus>("unknown");

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/health/latest?t=${Date.now()}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          run: { status: HealthStatus } | null;
        };
        setStatus(data.run?.status ?? "unknown");
      } else {
        setStatus("unknown");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setStatus("unknown");
      toast({
        title: "Health Badge Polling Failed",
        description: message,
        variant: "destructive",
      });
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    const interval = setInterval(fetchLatest, 30_000);
    return () => clearInterval(interval);
  }, [fetchLatest]);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "health_screening_complete" && event.newValue) {
        try {
          const result = JSON.parse(event.newValue) as {
            status: HealthStatus;
            timestamp: number;
          };
          setStatus(result.status);
          toast({
            title: "Health diagnostic complete",
            description: `System: ${STATUS_LABELS[result.status]}`,
          });
          localStorage.removeItem("health_screening_complete");
        } catch {
          // Ignore
        }
      }
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const colorClass = STATUS_COLORS[status];

  return (
    <a
      href="/health"
      className="hover:opacity-80 transition-opacity"
      title={`System health: ${STATUS_LABELS[status]}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border/60 bg-background/50 backdrop-blur-sm shadow-sm">
        <div className="relative flex h-2.5 w-2.5">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${colorClass}`}
          />
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colorClass}`} />
        </div>
        <span className="text-xs font-medium text-foreground">
          System: <span className="uppercase">{STATUS_LABELS[status]}</span>
        </span>
        <Activity className="h-3.5 w-3.5 text-muted-foreground ml-1" />
      </div>
    </a>
  );
}
