---
description: Rules for maintaining and updating frontend documentation pages on every agentic turn.
alwaysApply: true
---

# Frontend Documentation Rules

On **every agentic turn**, you MUST ensure that all code you modified, fixed, or created is comprehensively covered in the frontend documentation (`src/content/docs/**/*.md`).

## 1. Comprehensive Coverage

- Any new features, schema changes, or UI updates must be documented.
- If you modify existing behavior, you must find the relevant docs page and update it.

## 2. Metadata Updates

- You MUST update the `date_last_updated` or similar metadata visible on the page whenever you modify a doc page.

## 3. Logical Organization & Navbar

- The doc pages and the sidebar/navbar must always be organized logically.
- **Split Large Pages:** If a doc page is starting to get really large, split it up into standalone docs pages.
- **Create New Categories:** If a new page is being created but existing sub-page categories don't make logical sense, create a new category in the sidebar.

## 4. Standalone Docs

- All standalone docs must have dedicated page URLs (e.g., `src/content/docs/new-feature.md` mapped to `/docs/new-feature`).

## 5. Hyperlinkable Sections & URL Sync

- Sections in docs must be hyperlinkable.
- As the user scrolls to sections, the section parameter MUST update in the URL.
- The user must be able to enter the doc page URL with the section parameter in the URL, and the page must render/scroll to that exact spot on load.
- Use `h2` and `h3` tags properly to ensure they are assigned IDs by the markdown renderer.
