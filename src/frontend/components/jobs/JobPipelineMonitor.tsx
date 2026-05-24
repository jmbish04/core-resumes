import { Activity, Clock, Loader2, Play } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost } from "@/lib/api-client";

interface PipelineSession {
  id: number;
  sessionUuid: string;
  totalScraped: number;
  totalTriaged: number;
  totalAnalyzed: number;
  totalFailed: number;
  runStart: string;
  runEnd: string | null;
  status: "running" | "completed" | "failed";
}

export function JobPipelineMonitor() {
  const [sessions, setSessions] = useState<PipelineSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    let mounted = true;

    const fetchSessions = async () => {
      try {
        const res = await apiGet<{ sessions: PipelineSession[] }>("/api/pipeline/sessions");
        if (mounted) {
          setSessions(res.sessions || []);
        }
      } catch {
        /* noop */
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSessions();
    const interval = setInterval(fetchSessions, 5000); // Live poll

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const triggerPipeline = async () => {
    setTriggering(true);
    try {
      await apiPost("/api/pipeline/trigger", {});
      // Session will update via interval
    } catch {
      /* noop */
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Active & Historical Runs</h2>
          <p className="text-sm text-muted-foreground">
            Session monitoring across all board tokens.
          </p>
        </div>
        <Button onClick={triggerPipeline} disabled={triggering} size="sm" className="gap-2">
          {triggering ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Trigger Manual Run
        </Button>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-indigo-400" />
            <CardTitle className="text-base">Session Log</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>UUID</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead className="text-right">Scraped</TableHead>
                  <TableHead className="text-right">Analyzed</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sessions.map((s) => {
                    const start = new Date(s.runStart);
                    const end = s.runEnd ? new Date(s.runEnd) : new Date();
                    const durationMins = Math.max(
                      1,
                      Math.round((end.getTime() - start.getTime()) / 60000),
                    );

                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">
                          {s.sessionUuid.split("-")[0]}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="size-3.5" />
                            {start.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{durationMins} min</TableCell>
                        <TableCell className="text-right font-medium">{s.totalScraped}</TableCell>
                        <TableCell className="text-right font-medium">{s.totalAnalyzed}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={
                              s.status === "completed"
                                ? "default"
                                : s.status === "running"
                                  ? "secondary"
                                  : "destructive"
                            }
                          >
                            {s.status === "running" ? (
                              <span className="flex items-center gap-1.5">
                                <Loader2 className="size-3 animate-spin" /> Running
                              </span>
                            ) : (
                              s.status
                            )}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
