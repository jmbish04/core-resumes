/**
 * @fileoverview Dedicated sidebar for docs pages with collapsible grouped sections.
 */

import {
  Book,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  Cpu,
  Code,
  Plug,
  ScrollText,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type DocLink = { href: string; label: string };
type DocGroup = { label: string; icon: React.ElementType; links: DocLink[] };

const docGroups: DocGroup[] = [
  {
    label: "Getting Started",
    icon: Book,
    links: [
      { href: "/docs/overview", label: "Overview" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/configuration", label: "Configuration" },
    ],
  },
  {
    label: "Integrations",
    icon: Plug,
    links: [
      { href: "/docs/integrations/notebooklm", label: "NotebookLM" },
      { href: "/docs/integrations/google-drive", label: "Google Drive" },
      { href: "/docs/integrations/google-docs", label: "Google Docs" },
      { href: "/docs/integrations/greenhouse", label: "Greenhouse" },
      { href: "/docs/integrations/openroute", label: "OpenRoute" },
    ],
  },
  {
    label: "Data",
    icon: Database,
    links: [{ href: "/docs/database", label: "Database Schema" }],
  },
  {
    label: "Pipelines",
    icon: Workflow,
    links: [
      { href: "/docs/role-intake", label: "Role Intake" },
      { href: "/docs/role-viewport", label: "Role Viewport" },
      { href: "/docs/role-insights", label: "Role Insights" },
    ],
  },
  {
    label: "AI Agents",
    icon: Cpu,
    links: [
      { href: "/docs/agents", label: "Agents Overview" },
      { href: "/docs/agents/orchestrator", label: "OrchestratorAgent" },
      { href: "/docs/agents/notebooklm", label: "NotebookLMAgent" },
      { href: "/docs/agents/notebooklm-mcp", label: "NotebookLMMcpAgent" },
    ],
  },
  {
    label: "API",
    icon: Code,
    links: [{ href: "/docs/api", label: "API Reference" }],
  },
  {
    label: "Templates",
    icon: FileText,
    links: [
      { href: "/docs/resume-template", label: "Resume Template" },
      { href: "/docs/cover-letter-template", label: "Cover Letter Template" },
    ],
  },
];

export function DocsSidebar() {
  const [pathname, setPathname] = useState("/docs");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(docGroups.map((g) => g.label)));

  useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <aside className="sticky top-14 hidden h-[calc(100svh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border/60 bg-sidebar/60 p-3 lg:block">
      <div className="flex flex-col gap-1">
        <a
          href="/docs"
          className={cn(
            "mb-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-sidebar-foreground transition hover:bg-sidebar-accent",
            (pathname === "/docs" || pathname === "/docs/overview") &&
              "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <ScrollText className="size-4 shrink-0" />
          Documentation
        </a>

        {docGroups.map((group) => {
          const isOpen = openGroups.has(group.label);
          const GroupIcon = group.icon;

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
              >
                <GroupIcon className="size-3.5 shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              </button>
              {isOpen && (
                <nav className="ml-4 mt-0.5 grid gap-0.5 border-l border-border/40 pl-2">
                  {group.links.map((link) => {
                    const active = pathname === link.href;
                    return (
                      <a
                        key={link.href}
                        href={link.href}
                        className={cn(
                          "rounded-md px-2 py-1 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                        )}
                      >
                        {link.label}
                      </a>
                    );
                  })}
                </nav>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
