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
  ChevronLeft,
  ChevronRight,
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
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [pathname, setPathname] = useState("/");
  const [emailUnread, setEmailUnread] = useState(0);

  /** Read the current pathname on mount. */
  useEffect(() => {
    const p = window.location.pathname;
    setPathname(p);
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
                target={item.href.startsWith("/docs") ? "_blank" : undefined}
                rel={item.href.startsWith("/docs") ? "noopener noreferrer" : undefined}
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
