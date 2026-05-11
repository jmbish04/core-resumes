# Schema Documentation Rules

Every Drizzle schema table file under `src/backend/db/schemas/` **must** export two documentation constants alongside the table definition:

## Required Exports

```typescript
// 1. Table-level description — consumed by the docs frontend
export const <TABLE_NAME>_TABLE_DESCRIPTION = "Human-readable description of what the table stores and its purpose.";

// 2. Per-column descriptions — keyed by D1 column name (snake_case)
export const <TABLE_NAME>_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Description of the id column.",
  some_column: "Description of some_column.",
  // ... every column defined in the table
};
```

## Naming Convention

- Use the **UPPER_SNAKE_CASE** table name as prefix (e.g., `ROLES_`, `DOCUMENTS_`, `GLOBAL_CONFIG_`).
- Column description keys must use the **D1 column name** (snake_case), **not** the Drizzle camelCase property name.
  - ✅ `company_name: "Name of the hiring company."`
  - ❌ `companyName: "Name of the hiring company."`

## When Adding a New Table

1. Define the table in `src/backend/db/schemas/<table-name>.ts`.
2. Add the `_TABLE_DESCRIPTION` and `_COLUMN_DESCRIPTIONS` exports above the table definition.
3. Re-export from `src/backend/db/schema.ts` (barrel).
4. Register the table in the `TABLE_DOCS` map in `src/backend/api/routes/docs.ts` so the docs API picks it up.
5. Run `pnpm run db:generate` to create the migration.

## When Modifying a Table

- If you add or rename a column, update `_COLUMN_DESCRIPTIONS` to include the new/renamed column.
- If you change the table's purpose, update `_TABLE_DESCRIPTION`.

## Why

The docs frontend at `/docs/database` displays a live schema viewer that fetches column metadata via `PRAGMA table_info` and enriches it with these exported descriptions. Without them, the frontend shows blank description cells.
