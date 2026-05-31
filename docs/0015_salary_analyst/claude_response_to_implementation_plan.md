Gemini's advice is directionally right and the snippet is genuinely useful — AST validation is stronger than regex token matching, and `node-sql-parser` is a reasonable choice. But a few things in its specific implementation will misfire on D1 / Workers, and the broader architectural decision (AST allowlist *instead of* a read-only connection) is a false either/or. The strongest version is "both, plus a few D1-specific guards Gemini didn't mention."

Let me give you the consolidated review comment for your coding agent, with Gemini's AST approach integrated and its mistakes fixed.

---

## Review comment for the coding agent

Thanks for the thorough plan. Here are the five confirmations you're blocked on, plus targeted feedback. Treat the SQL tool guidance as a hard requirement — it incorporates a recommended pattern (AST validation via `node-sql-parser`) that supersedes the regex-based guards in the original spec.

### Confirmations

1. **Shared sandbox with TranscriptionAgent — your surgical-removal plan is correct.** Strip salary-related sandbox usage only, keep the `SANDBOX` binding, `Sandbox` export, containers block, Dockerfile, and `@cloudflare/sandbox` package. Drop only `salary_analysis.py` from the COPY.

2. **`roles.metro` column — option (a), add column + backfill.** Cleaner SQL, simpler indexes. See data-quality note below — backfill must fail to NULL, never guess.

3. **Derive seniority from `role_family_taxonomy.level` — confirmed.** Add a comment in the taxonomy seed noting this is title-derived and will misclassify roles whose scope doesn't match their title (e.g. staff-scoped work titled "Senior PM"). Acceptable for v1.

4. **Drop `roles.industry`, use `company_segments.segment` — confirmed.**

5. **`marketSandboxRuns` — freeze, do not migrate.** No structural overlap with `salary_findings` (verdicts) or `salary_agent_queries` (SQL audit). Leave read-only for history.

**On `pivot_trajectory` data feasibility:** the LinkedIn jobs worker and 9to5-scout are posting scrapers, not person-level tenure tracking, so no Option 3 data available. Proceed with Option 2 (cross-sectional ladder). `career_model_assumptions` is the upgrade path if person-level tenure data ever lands.

**On the Google anchor for `vs_google_anchor`:** before implementing the check, surface where the comp number should live (a `user_profile` row keyed to me, or a `career_model_assumptions` entry). Don't hardcode.

### Plan changes

**1. Split into stacked PRs.** 35 new files + a migration + agent rewrite + consumer updates in one PR, on a worker whose last PR failed to deploy, is not how this lands cleanly. PR boundaries:

- PR1: schema + seeds (Phases 1–2). Additive, zero behavior change, deployable on its own.
- PR2: types + battery + scorer + SQL tool + tests (3–6). Pure functions, fully testable, not yet wired.
- PR3: agent rewrite + routes + consumers + sandbox-extraction cleanup (8–10, 12). These must land together — Phase 8 deletes methods Phase 10 callers still depend on. Branch is build-broken between them; do not split.
- PR4: docs (13).
- PR5: Career Dreamer frontend + PivotTrajectoryChart (14).
- PR6: Dynamic Worker Loader (11), once the beta API is confirmed against the project's compat date.

**2. `Finding` type doesn't fit aggregate benchmarks.** `{ status: below|at|above, magnitude }` is a verdict shape — clean for the single-role battery, meaningless for `industry-comp-trends` (time series), `role-demand-heat` (ranking), or `pivot-trajectory` (two-curve projection). Add a discriminated `AggregateInsight` type with `payload: { kind: 'series' | 'ranking' | 'projection' | 'distribution', ... }`. Keep `Finding` for the per-role battery; don't force one shape to cover both.

**3. Time-series benchmarks must degrade honestly when history is thin.** `industry-comp-trends` and `vs_company_trend` both assume multiple snapshots across time. If the market system is new and you have one or a few recent snapshots, return `insufficient_data` with `reason: "need ≥N snapshots spanning ≥M months"` — do not draw a confident two-point trend.

**4. Battery cache key must include latest snapshot id.** The battery reads D1 data that changes on every ingest. Key the cache on `(roleId, inputs hash, latest_snapshot_id)` so new snapshots bust it automatically. Otherwise findings go stale silently.

**5. Normalization fails to NULL, never guesses.** For both the `roles.metro` backfill and `company_segments` classification: if the source signal is ambiguous, write `NULL` / `'unknown'`. The benchmarks already filter `WHERE metro IS NOT NULL`, so an unclassified row safely disappears rather than corrupting an average. For company segments: seed top-N by role frequency first (covers most of the 47k), canonicalize name variants ("Google" / "Google LLC" / "Google Inc.") before classifying, leave the long tail unknown. Segment quality directly gates `vs_peer_companies` — bad data here ≠ "low confidence finding," it = misleading finding.

### SQL tool — adopt AST validation, with D1-specific guards

**Replace the regex token approach in Phase 5 with `node-sql-parser` AST validation, layered with D1-specific defense-in-depth.** AST parsing is materially stronger than string matching — it survives SQL comments, whitespace tricks, keyword fragments inside identifiers, and stacked statements that regex can fumble.

Use this implementation, **not the version in the Gemini reference snippet**, which has D1-specific bugs noted inline:

```typescript
// src/backend/services/salary/sql-tool.ts
import { Parser } from "node-sql-parser";

// One parser instance, reused. Specify SQLite dialect — D1 is SQLite, NOT MySQL
// (which is node-sql-parser's default and would parse some D1 queries incorrectly).
const parser = new Parser();
const PARSE_OPTS = { database: "sqlite" } as const;

// Allowlist of tables the agent may read. Curated for analysis only;
// no auth / config / PII / billing tables here.
const ALLOWED_TABLES = new Set<string>([
  "roles",
  "market_salary_snapshots",
  "market_salary_stats",
  "market_company_salaries",
  "company_segments",
  "cost_of_living_index",
  "role_family_taxonomy",
  "salary_findings",
  "salary_agent_queries",
  "career_model_assumptions",
]);

const HARD_ROW_LIMIT = 5000;
const RETURN_ROW_LIMIT = 1000;
const TIMEOUT_MS = 5000;

type QueryResult =
  | { ok: true; rows: Record<string, unknown>[]; rowCount: number; truncated: boolean; durationMs: number }
  | { ok: false; error: string; code: "PARSE" | "STATEMENT_TYPE" | "TABLE_DENIED" | "TIMEOUT" | "EXEC" };

export async function querySalaryData(
  db: D1Database,
  rawSql: string,
  ctx: { roleId: string | null; mode: string; auditDb: D1Database },
): Promise<QueryResult> {
  const started = Date.now();

  // --- AST validation ---
  let ast;
  try {
    ast = parser.astify(rawSql, PARSE_OPTS);
  } catch (e) {
    return { ok: false, code: "PARSE", error: e instanceof Error ? e.message : "parse failed" };
  }

  const statements = Array.isArray(ast) ? ast : [ast];

  // Reject stacked statements outright. D1 prepared statements run one query,
  // but rejecting at the AST layer is defense in depth and produces a clearer error.
  if (statements.length !== 1) {
    return { ok: false, code: "STATEMENT_TYPE", error: "Exactly one statement allowed" };
  }

  const stmt = statements[0];
  // SELECT only. node-sql-parser surfaces WITH (CTE) queries as type "select"
  // when sqlite dialect is set, so plain WITH ... SELECT works.
  if (stmt.type !== "select") {
    return { ok: false, code: "STATEMENT_TYPE", error: `Only SELECT permitted, got ${stmt.type}` };
  }

  // --- Table allowlist ---
  // BUG IN REFERENCE SNIPPET: parser.tableList() returns strings of the shape
  // "type::db::table" (colon-delimited string), NOT a [type, db, table] array.
  // Splitting on "::" is the documented contract.
  const tableRefs = parser.tableList(rawSql, PARSE_OPTS);
  for (const ref of tableRefs) {
    const parts = ref.split("::");
    const action = parts[0]?.toLowerCase();      // "select" expected
    const table = parts[2]?.toLowerCase();
    if (action !== "select") {
      return { ok: false, code: "STATEMENT_TYPE", error: `Non-read action on table: ${action}` };
    }
    if (!table || !ALLOWED_TABLES.has(table)) {
      return { ok: false, code: "TABLE_DENIED", error: `Table not allowed: ${table ?? "<unknown>"}` };
    }
  }

  // --- LIMIT wrapping ---
  // String-appending " LIMIT N" is fragile: breaks on trailing semicolons, on
  // existing LIMITs, and on UNION queries (binds to last SELECT only).
  // Subquery wrap is robust against all of it.
  const wrapped = `SELECT * FROM (${rawSql}) AS sandboxed LIMIT ${HARD_ROW_LIMIT}`;

  // --- Execute ---
  // NOTE on timeouts: D1's .all() does not currently honor AbortSignal in any
  // documented way — the timeout below is advisory at the JS layer only.
  // A runaway query will still consume D1 wall time server-side. Accept this
  // and rely on the row limit + tight allowlist to bound damage.
  let rows: Record<string, unknown>[];
  try {
    const exec = db.prepare(wrapped).all<Record<string, unknown>>();
    const timeout = new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error("client-side timeout")), TIMEOUT_MS),
    );
    const result = await Promise.race([exec, timeout]);
    if (!result.success) {
      return { ok: false, code: "EXEC", error: result.error ?? "D1 execution failed" };
    }
    rows = result.results;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exec failed";
    return {
      ok: false,
      code: msg.includes("timeout") ? "TIMEOUT" : "EXEC",
      error: msg,
    };
  }

  const truncated = rows.length > RETURN_ROW_LIMIT;
  const returned = truncated ? rows.slice(0, RETURN_ROW_LIMIT) : rows;
  const durationMs = Date.now() - started;

  // Audit — fire-and-forget; never block the response on logging.
  ctx.auditDb
    .prepare(
      `INSERT INTO salary_agent_queries (role_id, mode, sql, rows_returned, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(ctx.roleId, ctx.mode, rawSql, returned.length, durationMs, new Date().toISOString())
    .run()
    .catch(() => {});

  return { ok: true, rows: returned, rowCount: rows.length, truncated, durationMs };
}
```

**Specific divergences from the Gemini snippet, with reasons:**

- **Pass `{ database: "sqlite" }` to `astify` and `tableList`.** Default dialect is MySQL; some D1-valid SQL parses incorrectly without this.
- **`tableList()` returns delimited strings, not arrays.** The snippet's `tableDescriptor[2]` indexing would throw on the actual return type. Split on `"::"`.
- **Reject `length !== 1` statements before checking type.** Stacked statements get a clearer error than "only SELECT permitted."
- **Subquery-wrap the LIMIT instead of string-appending.** Robust against trailing semicolons, existing LIMITs, `UNION`s.
- **Don't trust `AbortSignal.timeout` against D1.** D1's `.all()` doesn't document signal cancellation. The `Promise.race` here returns control to the agent on time, but does not actually cancel the query server-side. Accept this and rely on row caps + the allowlist to bound damage.
- **Audit log writes are fire-and-forget.** Blocking the agent on audit insert is worse than dropping the occasional audit row.
- **Structured error codes** (`PARSE | STATEMENT_TYPE | TABLE_DENIED | TIMEOUT | EXEC`) so the agent's narrative layer can react appropriately rather than getting a string blob.

**Security tests required:**

- Stacked statement: `SELECT 1; DROP TABLE roles;` → rejected
- Comment-hidden injection: `SELECT 1 /* */ ; DELETE FROM roles` → rejected
- DDL/DML: `DROP`, `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `REPLACE`, `ATTACH`, `PRAGMA` → all rejected
- Disallowed table: `SELECT * FROM users` (or any non-allowlist table) → rejected with `TABLE_DENIED`
- UNION to disallowed table: `SELECT id FROM roles UNION SELECT id FROM users` → rejected (`tableList` catches both sides)
- Subquery to disallowed table: `SELECT * FROM roles WHERE id IN (SELECT id FROM users)` → rejected
- Valid CTE: `WITH r AS (SELECT * FROM roles) SELECT * FROM r` → permitted
- Row truncation: query returning > 1000 rows → `truncated: true`, rows array length = 1000

**Update `.agent/rules/agent-architecture.md`** with the Gemini-suggested constraints, modified for accuracy:

```markdown
## Agent SQL Execution Constraints
- Never provide an agent with unrestricted env.DB access or raw sql.raw() capability without AST validation.
- All raw SQL from LLMs must pass through node-sql-parser (sqlite dialect) before execution.
- AST validation must fail closed: deny-by-default, hard-require ast.type === 'select', reject statements.length !== 1.
- All parsed table references must be checked against a hardcoded ALLOWED_TABLES set.
- LIMIT enforcement uses subquery-wrap, never string concatenation.
- D1 timeout via AbortSignal is advisory at the JS layer only — pair with strict row limits.
- Every executed query is audited to salary_agent_queries (fire-and-forget insert).
```

### Phase 11 specifics (whenever you get to it)

Dynamic Worker Loader does not magically expose arquero inside the loaded worker. You have two patterns:

- **Bundle arquero into the `modules` map** the agent-authored code can import from. Heavier per-load.
- **Code Mode pattern** — expose dataframe ops as a TypeScript-typed RPC API the sandbox calls, keeping arquero in the parent worker. Lighter sandboxes, fewer tokens for the agent to read.

Lean toward the Code Mode pattern (a typed `DataframeAPI` interface) — that's the modern Cloudflare-blessed shape and uses fewer agent tokens. Also add a `worker_loaders` binding to `wrangler.jsonc` when this lands; the plan's cleanup section currently doesn't.

### Out of scope for this refactor

The observability dump that motivated this work showed two exception clusters: the salary container provisioning errors (~5 events — this refactor kills them) and the `ResumeIdeation` Zod validation failures in the resume ideation workflow (~25 events — different subsystem, `gpt-oss-120b` returning the wrong JSON shape). The latter will keep firing after this lands. Don't conflate the two; "salary agent fixed" ≠ "worker exceptions cleared."

---

Net: this is approved with the changes above. Most important: stacked PRs, `AggregateInsight` discriminated type, AST-based SQL guard with the D1-specific corrections above, and snapshot-aware cache keys. The rest are refinements.