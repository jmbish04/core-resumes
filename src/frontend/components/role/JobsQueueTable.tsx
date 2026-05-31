import { Loader2, ExternalLink, ThumbsDown, Eye, CheckCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, toast } from "@/lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface QueuedJob {
  id: number;
  jobSiteId: string;
  jobTitle: string;
  company: string;
  location: string | null;
  jobUrl: string | null;
  dateFirstSeen: string;
  isWatching: boolean;
  isDetectedChange: boolean;
  pipelineSource: string;
}

export function JobsQueueTable({ source }: { source: string }) {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  const [loading, setLoading] = useState(true);

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [source]);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const data = await apiGet<QueuedJob[]>(`/api/pipeline/jobs/queued?pipelineSource=${source}`);
      setJobs(data || []);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load jobs", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    setIsRejecting(true);
    try {
      await apiPost(`/api/pipeline/jobs/${rejectId}/reject`, { reason: rejectReason });
      setJobs((prev) => prev.filter((j) => j.id !== rejectId));
      toast({ title: "Job rejected" });
      setRejectId(null);
      setRejectReason("");
    } catch (e) {
      toast({ title: "Failed to reject job", variant: "destructive" });
    } finally {
      setIsRejecting(false);
    }
  };

  const handleWatch = async (id: number) => {
    try {
      await apiPost(`/api/pipeline/jobs/${id}/watch`, {});
      toast({ title: "Job added to watchlist" });
      fetchJobs();
    } catch (e) {
      toast({ title: "Failed to watch job", variant: "destructive" });
    }
  };

  const handlePromote = async (job: QueuedJob) => {
    toast({ title: "Promoting job...", description: "Copy job URL and create new application manually for now." });
    // In a full implementation, this would trigger the intake modal
  };

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin mr-2" />
        Loading queued jobs...
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-muted-foreground border rounded-lg">
        No queued jobs found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{job.company}</TableCell>
              <TableCell>
                {job.jobUrl ? (
                  <a
                    href={job.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-purple-400 hover:underline"
                  >
                    {job.jobTitle}
                    <ExternalLink className="size-3 shrink-0 text-zinc-500" />
                  </a>
                ) : (
                  job.jobTitle
                )}
              </TableCell>
              <TableCell>{job.location || "Remote"}</TableCell>
              <TableCell>
                {job.isDetectedChange ? (
                  <Badge variant="outline" className="border-amber-500 text-amber-500">Changed</Badge>
                ) : job.isWatching ? (
                  <Badge variant="outline" className="border-blue-500 text-blue-500">Watching</Badge>
                ) : (
                  <Badge variant="outline" className="text-zinc-500">New</Badge>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Button size="xs" variant="outline" onClick={() => handlePromote(job)} className="border-purple-500 text-purple-400">
                  <CheckCircle className="size-3 mr-1" /> Promote
                </Button>
                {!job.isWatching && (
                  <Button size="xs" variant="outline" onClick={() => handleWatch(job.id)}>
                    <Eye className="size-3 mr-1" /> Watch
                  </Button>
                )}
                <Button size="xs" variant="outline" className="text-red-400" onClick={() => setRejectId(job.id)}>
                  <ThumbsDown className="size-3 mr-1" /> Reject
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!rejectId} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Job</DialogTitle>
            <DialogDescription>
              Provide an optional reason for rejecting this job. It will be hidden from future queue runs.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Too senior, bad tech stack, fake listing..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)} disabled={isRejecting}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={isRejecting}>
              {isRejecting ? <Loader2 className="size-4 animate-spin" /> : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
