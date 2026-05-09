import { ArrowUpDown, MoreHorizontal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, toast } from "@/lib/api-client";

import type { RoleRow } from "../dashboard/types";

const statuses = [
  "all",
  "preparing",
  "processing_error",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
];
type SortKey = "companyName" | "jobTitle" | "status" | "createdAt";

export function RolesTable() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("createdAt");
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiGet<RoleRow[]>("/api/roles")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  const visibleRows = useMemo(() => {
    const normalized = query.toLowerCase();

    return rows
      .filter((role) => status === "all" || role.status === status)
      .filter(
        (role) =>
          role.companyName.toLowerCase().includes(normalized) ||
          role.jobTitle.toLowerCase().includes(normalized),
      )
      .sort((a, b) => String(a[sort]).localeCompare(String(b[sort])));
  }, [query, rows, sort, status]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/roles/${deleteTarget.id}`);
      setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      toast({
        title: "Role deleted",
        description: `${deleteTarget.companyName} — ${deleteTarget.jobTitle} has been removed.`,
      });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by company or title"
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {statuses.map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={status === item ? "secondary" : "outline"}
              onClick={() => setStatus(item)}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Company" sortKey="companyName" sort={sort} onSort={setSort} />
              <SortableHead label="Title" sortKey="jobTitle" sort={sort} onSort={setSort} />
              <SortableHead label="Status" sortKey="status" sort={sort} onSort={setSort} />
              <TableHead>Salary</TableHead>
              <SortableHead label="Created" sortKey="createdAt" sort={sort} onSort={setSort} />
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Loading roles...
                </TableCell>
              </TableRow>
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No roles match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    {role.companyId ? (
                      <a className="font-medium hover:underline text-primary" href={`/companies/${role.companyId}`}>
                        {role.companyName}
                      </a>
                    ) : (
                      <span className="font-medium">{role.companyName}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <a className="font-medium hover:underline text-foreground" href={`/roles/${role.id}`}>
                      {role.jobTitle}
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{role.status}</Badge>
                  </TableCell>
                  <TableCell>{formatSalary(role)}</TableCell>
                  <TableCell>{new Date(role.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="sm" className="size-8 p-0">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="gap-2 text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(role)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>
                {deleteTarget?.companyName} — {deleteTarget?.jobTitle}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
}) {
  return (
    <TableHead>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="-ml-2"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <ArrowUpDown className={sort === sortKey ? "size-3.5 text-foreground" : "size-3.5"} />
      </Button>
    </TableHead>
  );
}

function formatSalary(role: RoleRow) {
  if (role.salaryMin === null && role.salaryMax === null) {
    return "Not set";
  }

  const currency = role.salaryCurrency ?? "USD";
  const formatter = new Intl.NumberFormat(undefined, {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  });

  if (role.salaryMin !== null && role.salaryMax !== null) {
    return `${formatter.format(role.salaryMin)} - ${formatter.format(role.salaryMax)}`;
  }

  return formatter.format(role.salaryMin ?? role.salaryMax ?? 0);
}

