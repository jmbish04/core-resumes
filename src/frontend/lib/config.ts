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
    /** If true, opens in a new tab with `rel="noreferrer"`. */
    external?: boolean;
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
    { href: "/", label: "Dashboard" },
    { href: "/roles", label: "Roles" },
    { href: "/emails", label: "Emails" },
    { href: "/notebook", label: "Notebook" },
    { href: "/memory", label: "Memory" },
    { href: "/config", label: "Config" },
    { href: "/health", label: "Health" },
    { href: "/docs", label: "Docs" },
    { href: "/openapi.json", label: "OpenAPI" },
    { href: "/scalar", label: "Scalar" },
    { href: "/swagger", label: "Swagger" },
  ],
};
