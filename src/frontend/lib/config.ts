/**
 * @fileoverview Site-wide configuration constants for the Career Orchestrator
 * frontend.
 *
 * Consumed by:
 *  - `Navbar.astro` — renders the top navigation bar items
 *  - `Sidebar.tsx`  — renders the sidebar navigation (uses its own link set)
 *  - `BaseLayout.astro` — page titles and meta descriptions
 *
 * When adding a new page, add its nav entry to `navItems` here **and** to
 * the `mainLinks` / `docsSublinks` arrays in `Sidebar.tsx`.
 */

// ---------------------------------------------------------------------------
// Type definition
// ---------------------------------------------------------------------------

/** Shape of the global site configuration object. */
export type SiteConfig = {
  /** Application display name. */
  name: string;
  /** Short description used in meta tags. */
  description: string;
  /** Canonical production URL. */
  url: string;
  /** Author metadata. */
  author: {
    name: string;
    url: string;
  };
  /** External links. */
  links: {
    github: string;
  };
  /** Top-level navigation items rendered in the Navbar. */
  navItems: {
    /** Route path (relative) or full URL for external links. */
    href: string;
    /** Display label. */
    label: string;
    /** Optional Lucide icon string identifier. */
    icon?: string;
    /** If true, opens in a new tab with `rel="noreferrer"`. */
    external?: boolean;
  }[];
  /** Sidebar navigation items rendered in the Sidebar. */
  sidebarItems: {
    /** Route path (relative). */
    href: string;
    /** Display label. */
    label: string;
    /** Lucide icon string identifier. */
    icon: string;
  }[];
};

// ---------------------------------------------------------------------------
// Configuration instance
// ---------------------------------------------------------------------------

/** Global site configuration used across all frontend layouts and components. */
export const siteConfig: SiteConfig = {
  name: "Classified",
  description: "Single-user resume, role, email, and Colby agent workspace.",
  url: "https://core-resumes.hacolby.workers.dev",
  author: {
    name: "jmbish04",
    url: "https://github.com/jmbish04/core-resumes",
  },
  links: {
    github: "https://github.com/jmbish04/core-resumes",
  },
  navItems: [
    { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/config", label: "Config", icon: "Settings" },
    { href: "/health", label: "Health", icon: "Activity" },
    { href: "/docs", label: "Docs", icon: "ScrollText", external: true },
    { href: "/openapi.json", label: "OpenAPI", icon: "FileJson" },
    { href: "/scalar", label: "Scalar", icon: "BarChart3" },
    { href: "/swagger", label: "Swagger", icon: "Sparkles" },
  ],
  sidebarItems: [
    { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
    { href: "/companies", label: "Companies", icon: "Building2" },
    { href: "/roles", label: "Roles", icon: "BriefcaseBusiness" },
    { href: "/emails", label: "Emails", icon: "Mail" },
    { href: "/pipeline", label: "Pipeline", icon: "RefreshCw" },
    { href: "/discovery", label: "Discovery", icon: "Sparkles" },
    { href: "/salary-intelligence", label: "Salary Intel", icon: "TrendingUp" },
    { href: "/freelance", label: "Freelance", icon: "Briefcase" },
    { href: "/transcriptions", label: "Transcriptions", icon: "Mic" },
    { href: "/notebook", label: "Notebook", icon: "BookOpen" },
    { href: "/memory", label: "Memory", icon: "Brain" },
    { href: "/config", label: "Config", icon: "Settings" },
    { href: "/health", label: "Health", icon: "Activity" },
    { href: "/docs/mcp", label: "MCP", icon: "Plug" },
    { href: "/docs", label: "Docs", icon: "ScrollText" },
  ],
};
