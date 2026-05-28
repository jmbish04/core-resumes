import { Parser } from "node-sql-parser";
import { D1Database } from "@cloudflare/workers-types";

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

export type QueryResult =
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
  // parser.tableList() returns strings of the shape "type::db::table" (colon-delimited string).
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
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(ctx.roleId, ctx.mode, rawSql, returned.length, durationMs, new Date().toISOString())
    .run()
    .catch(() => {});

  return { ok: true, rows: returned, rowCount: rows.length, truncated, durationMs };
}
