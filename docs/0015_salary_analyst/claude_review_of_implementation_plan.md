This is a strong plan — the agent did real homework rather than just transcribing the spec. The shared-sandbox discovery especially is the kind of thing that would have broken transcription if it had blindly followed my "delete the container" instruction. I'm going to confirm its questions first (those are what's blocking it), then flag what it got wrong or missed, because there are a few things that will bite during execution.

## Answers to the questions it's blocking on

**Shared sandbox with TranscriptionAgent — its plan is correct, endorse it.** Surgical removal (drop `salary_analysis.py` from the Dockerfile COPY, strip sandbox usage only from SalaryAgent files, keep the `SANDBOX` binding / `Sandbox` export / containers block) is exactly right. My original "delete it all" instruction was wrong given the shared dependency. Good catch by the agent.

**metro column — go with (a), add the column + backfill.** Confirmed. A normalized join-key column is far cleaner for SQL than normalizing in a join table. But see the normalization-quality warning below — the backfill logic is more dangerous than the plan implies.

**Derive seniority from `role_family_taxonomy.level` — acceptable, confirm.** Just be aware this makes seniority a pure function of title text. A "Senior PM" title that's actually a staff-scoped role gets mislabeled, and that flows into `vs_adjacent_levels`. Fine to ship, worth a comment in the taxonomy seed noting the limitation.

**Drop `roles.industry`, use `company_segments.segment` — confirm.** Segment is more useful than free-text industry anyway. Good simplification.

**`marketSandboxRuns` table — freeze it, don't migrate.** Those are Python execution logs, structurally unrelated to `salary_findings` (verdicts) or `salary_agent_queries` (SQL audit). There's nothing worth migrating; a migration is wasted effort. Leave it read-only for history or just ignore it.

**Career-history data for Option 3 (pivot_trajectory):** you'd know better than me, but your LinkedIn jobs worker and 9to5-scout are *posting* scrapers — snapshots, not person-level transitions. Unless one of them captures individual tenure timelines (person → role → dates), you don't have Option 3 data. Proceed with Option 2; the `career_model_assumptions` table is the upgrade path when/if you ever do.

## What the plan gets wrong or under-specifies

**1. Split this into stacked PRs — this is my strongest piece of feedback.** Thirty-five new files + 13 modified + a migration in one PR, on a worker whose last PR (#6) failed to deploy, is asking for a hard-to-debug red build. Phase boundaries are natural PR boundaries:

- PR1: schema + seeds (Phases 1–2) — deployable, additive, zero behavior change
- PR2: battery + scorer + SQL tool + tests (3–6) — pure functions, fully testable, still not wired in
- PR3: agent rewrite + routes + consumers + cleanup (8–10, 12) — **these must land together** because Phase 8 deletes the old methods that Phase 10's consumers still call; the branch is build-broken between them
- PR4: docs (13), PR5: frontend (14), PR6: Dynamic Worker Loader (11, whenever the beta API is confirmed)

Each PR deploys green on its own. Given PR #6's history, this matters more than usual.

**2. The `Finding` type doesn't fit the aggregate benchmarks.** `{ status: below|at|above, magnitude }` is an offer-vs-anchor verdict shape. It maps cleanly to the single-role battery. It does *not* map to `industry-comp-trends` (a time series) or `role-demand-heat` (a ranking/grid) — those aren't "below/at/above" anything. Forcing them into the same type will produce findings with meaningless `status` fields and a `supporting_data` blob doing all the real work. Recommend two result types: keep `Finding` for the single-role battery, add an `AggregateInsight` type with a discriminated `payload` (`series` | `ranking` | `projection` | `distribution`). The agent's plan inherited this from my spec — my spec was wrong to imply one shape covers both.

**3. The SQL tool guards have three concrete holes.** The plan's regex-token approach is roughly right but:
- **LIMIT injection by string-append is fragile.** Appending ` LIMIT 5000` breaks on trailing semicolons, existing LIMITs, and compound `UNION` queries (it binds to the last SELECT only). Wrap instead: `SELECT * FROM (<user sql>) LIMIT 5000`. That's robust against all of it and neutralizes trailing-`;` smuggling for free.
- **AbortSignal.timeout may not actually cancel a D1 query.** D1's `.all()` doesn't clearly honor a signal the way `fetch` does — verify before relying on it, or the 5s timeout is advisory only and a runaway query still runs to completion server-side.
- **The keyword denylist misses `ATTACH`, `PRAGMA`, and SQL comments.** Add those, reject `;` outright (no multi-statement), and require the first token ∈ {`SELECT`, `WITH`}. D1 prepared statements run one statement so multi-statement risk is partly mitigated by the platform, but defense-in-depth is cheap here.

**4. `vs_google_anchor` has no defined input source.** The whole battery hinges on comparing against your Google comp, but the plan never says where that number lives. It needs a home — a user-profile row, a `career_model_assumptions` entry, or an explicit input on the analyze request. Flag this to the agent or the first benchmark it writes will hardcode a magic number.

**5. Dynamic Worker Loader (Phase 11) has a subtlety that will bite: arquero won't exist inside the sandbox automatically.** The loader takes `modules: { "agent.js": code }`. Agent-generated code that does `import { from } from 'arquero'` will fail unless arquero is *also* provided in the module map (bundle it) or you expose dataframe ops as an RPC API the sandbox calls (the Code Mode TypeScript-interface pattern). The plan says "seed an arquero DataFrame in the dynamic worker" as if the library is just there — it isn't. Decide which approach before building, and note you'll also need a `worker_loaders` binding added to `wrangler.jsonc` (the plan's cleanup section doesn't add it). Deferring this phase until the beta API is confirmed is the right call regardless.

**6. Time-series benchmarks need history to bootstrap.** `industry-comp-trends` ("over snapshot timeline") and `vs_company_trend` ("last 2 years") assume you have multiple snapshots spanning time. If this market system is new, you have one or a few recent snapshots and these return thin/empty results until history accumulates. Not a bug, but the benchmarks should degrade honestly ("insufficient history") rather than drawing a confident two-point "trend," and you should expect them to be weak for a while.

**7. Normalization quality (metro + company_segment) is the silent failure risk.** Both backfills are fuzzy text→category problems, same class as title normalization. The plan hand-waves them. The rule that keeps you safe: **fail to NULL/unknown, never guess.** The cross-market and geo benchmarks already drop NULL metro, so an unbackfilled or uncertain row safely disappears rather than corrupting an average. For `company_segments`, classifying thousands of distinct company names from name-alone will be noisy and expensive — seed the top-N companies by role frequency first (covers most of the 47k), normalize name variants ("Google" / "Google LLC") before classifying, and leave the long tail `unknown`. Segment quality directly gates `vs_peer_companies`.

**8. Cache key must incorporate snapshot version.** The battery is called "cacheable," but it reads D1 data that changes when new snapshots land. Key the cache on the latest snapshot id (plus role id + inputs) so new data busts it automatically; otherwise you'll serve stale findings after every ingest.

## One connecting-the-dots note

Tie this back to the observability dump that started this thread: that snapshot had **two** exception clusters. This refactor kills the ~5 container `default.exec` provisioning errors (the salary sandbox). It does **not** touch the larger cluster — the ~25 `ResumeIdeation` Zod validation failures in the workflow path. That's a different subsystem (resume ideation, `gpt-oss-120b` returning the wrong JSON shape), and it'll keep firing after this lands. Worth keeping on the list so "salary agent fixed" doesn't get mistaken for "worker exceptions cleared."

Net: approve the plan, hand back the five confirmations, and ask the agent to (a) split into stacked PRs, (b) introduce a separate `AggregateInsight` type, (c) harden the SQL tool with the subquery-wrap + ATTACH/PRAGMA/`;` rejections, and (d) tell you where the Google anchor value should live. Everything else can proceed as written.

Want me to write that back up as a concise review comment you can paste straight to the agent?