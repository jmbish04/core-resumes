/**
 * @fileoverview Sidebar — the primary left-hand navigation component for the
 * Career Orchestrator application.
 *
 * Renders three navigation sections:
 *  1. **Main links** — Dashboard, Roles, Notebook, Memory, Config
 *  2. **Docs** — collapsible tree with grouped doc sublinks (getting started,
 *     integrations, agents, database, API, templates, etc.)
 *  3. **Bottom links** — OpenAPI and Scalar external references
 *
 * The sidebar is sticky (beneath the navbar), collapsible to icon-only mode,
 * and only visible on `lg+` breakpoints (desktop).  On `/docs/*` routes the
 * docs tree is auto-expanded.
 *
 * Rendered as `client:load` in every page layout.
 */

import * as LucideIcons from "lucide-react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiGet } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/config";

// ---------------------------------------------------------------------------
// Navigation data
// ---------------------------------------------------------------------------

/** Top-level application pages dynamically populated from siteConfig.sidebarItems. */
const mainLinks = siteConfig.sidebarItems.map((item) => ({
  href: item.href,
  label: item.label,
  icon: (LucideIcons as any)[item.icon || "BookOpen"] || LucideIcons.BookOpen,
  badgeKey: item.href === "/emails" ? ("emails" as const) : undefined,
}));

/**
 * Grouped sub-navigation items rendered inside the collapsible "Docs" section.
 * Each group has a category label and an array of doc page links.
 */
const docsSublinks = [
  {
    label: "Getting Started",
    links: [
      { href: "/docs/overview", label: "Overview" },
      { href: "/docs/architecture", label: "Architecture" },
      { href: "/docs/configuration", label: "Configuration" },
      { href: "/docs/health", label: "Health Diagnostics" },
    ],
  },
  {
    label: "Integrations",
    links: [
      { href: "/docs/integrations/notebooklm", label: "NotebookLM" },
      { href: "/docs/integrations/google-drive", label: "Google Drive" },
      { href: "/docs/integrations/google-docs", label: "Google Docs" },
      { href: "/docs/integrations/greenhouse", label: "Greenhouse" },
      { href: "/docs/integrations/openroute", label: "OpenRoute" },
    ],
  },
  { label: "Data", links: [{ href: "/docs/database", label: "Database Schema" }] },
  {
    label: "Pipelines",
    links: [
      { href: "/docs/role-intake", label: "Role Intake" },
      { href: "/docs/role-insights", label: "Role Insights" },
      { href: "/docs/greenhouse-pipeline", label: "Greenhouse Pipeline" },
      { href: "/docs/freelance-pipeline", label: "Freelance Pipeline" },
    ],
  },
  {
    label: "AI Agents",
    links: [
      { href: "/docs/agents", label: "Agents Overview" },
      { href: "/docs/agents/orchestrator", label: "OrchestratorAgent" },
      { href: "/docs/agents/notebooklm", label: "NotebookLMAgent" },
      { href: "/docs/agents/notebooklm-mcp", label: "NotebookLMMcpAgent" },
    ],
  },
  { label: "API", links: [{ href: "/docs/api", label: "API Reference" }] },
  {
    label: "Templates",
    links: [
      { href: "/docs/resume-template", label: "Resume Template" },
      { href: "/docs/cover-letter-template", label: "Cover Letter Template" },
    ],
  },
];

/** External tool links completely removed from sidebar. */
const bottomLinks: any[] = [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Collapsible left-hand sidebar navigation.
 *
 * State:
 *  - `collapsed` — whether the sidebar is in icon-only mode
 *  - `pathname` — current URL path (set once on mount for active-link styling)
 *  - `docsExpanded` — whether the docs tree is expanded (auto-opens on `/docs/*`)
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [pathname, setPathname] = useState("/");
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [emailUnread, setEmailUnread] = useState(0);

  /** Read the current pathname on mount and auto-expand docs if applicable. */
  useEffect(() => {
    const p = window.location.pathname;
    setPathname(p);
    if (p.startsWith("/docs")) {
      setDocsExpanded(true);
    }
    // Fetch email unread count
    apiGet<{ unread: number }>("/api/emails/stats")
      .then((stats) => setEmailUnread(stats.unread))
      .catch(() => {});
  }, []);

  return (
    <aside
      className={cn(
        "sticky top-14 hidden h-[calc(100svh-3.5rem)] shrink-0 border-r border-border/60 bg-sidebar/60 p-3 lg:block",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-full flex-col gap-3">
        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </Button>

        <nav className="grid gap-1">
          {/* Main links */}
          {mainLinks.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            const badgeCount = (item as any).badgeKey === "emails" ? emailUnread : 0;

            return (
              <a
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && badgeCount > 0 && (
                  <Badge variant="default" className="ml-auto px-1.5 text-[10px]">
                    {badgeCount}
                  </Badge>
                )}
                {collapsed && badgeCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
                )}
              </a>
            );
          })}

          {/* Docs — collapsible header with grouped sublinks */}
          <div>
            <button
              type="button"
              onClick={() => setDocsExpanded((v) => !v)}
              title={collapsed ? "Docs" : undefined}
              className={cn(
                "flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname.startsWith("/docs") && "bg-sidebar-accent text-sidebar-accent-foreground",
                collapsed && "justify-center",
              )}
            >
              <ScrollText className="size-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 truncate text-left">Docs</span>
                  {docsExpanded ? (
                    <ChevronDown className="size-3" />
                  ) : (
                    <ChevronRight className="size-3" />
                  )}
                </>
              )}
            </button>

            {docsExpanded && !collapsed && (
              <div className="ml-4 mt-1 grid gap-2 border-l border-border/40 pl-2">
                {docsSublinks.map((group) => (
                  <div key={group.label}>
                    <span className="mb-0.5 block px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {group.label}
                    </span>
                    {group.links.map((link) => {
                      const active = pathname === link.href;
                      return (
                        <a
                          key={link.href}
                          href={link.href}
                          className={cn(
                            "block rounded-md px-2 py-1 text-xs text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            active &&
                              "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
                          )}
                        >
                          {link.label}
                        </a>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom links — external tools */}
          {bottomLinks.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;

            return (
              <a
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-md px-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  active && "bg-sidebar-accent text-sidebar-accent-foreground",
                  collapsed && "justify-center",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </a>
            );
          })}
        </nav>

        {/* Footer info card */}
        <div className={cn("mt-auto rounded-lg bg-muted/40 p-3", collapsed && "hidden")}>
          <div className="text-xs font-medium text-foreground">Colby Agent</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Tasks, drafts, and email matching route through one Worker.
          </div>
        </div>
      </div>
    </aside>
  );
}
