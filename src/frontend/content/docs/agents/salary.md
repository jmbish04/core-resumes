---
title: "Salary Intelligence Agent"
description: "Autonomous compensation agent utilizing deterministic SQL benchmarks."
date_last_updated: "2026-05-28"
---

# Salary Intelligence Agent

The \`SalaryAgent\` is a Cloudflare Agents SDK stateful Durable Object designed for deep market salary trend analytics. It replaces the legacy Python Sandbox execution model with a deterministic, SQL-backed benchmark battery and Workers AI to deliver highly accurate salary trends & negotiation advice.

## Core Responsibilities

1. **Deterministic Benchmarking**: Runs a battery of SQL checks against ingested market data to determine compensation leverage (strong, moderate, weak).
2. **Career Pivot Analysis**: Synthesizes macro trends for the Career Dreamer dashboard, highlighting emerging high-paying segments.
3. **Interactive Salary Q&A**: Powers the \`/salary/chat\` endpoint and \`SalaryIntelChatProvider\` using SQL tools that dynamically query the D1 database.

## Architecture

The Agent has three primary operational modes:

### Mode A: Single-Role Analysis
Evaluates a specific role against market benchmarks (remote vs local, percentile curves, company segment comparisons, **cross-market COL-adjusted comparison**) and computes negotiation leverage. It produces a structured \`Finding\` for the role's market compensation.

### Mode B: Aggregate / Career Dreamer
Synthesizes macro-level trends across the market, including top-paying industries, in-demand roles, and pivot trajectories. It produces discriminated \`AggregateInsight\` types (\`series\`, \`ranking\`, \`projection\`, \`distribution\`).

### Mode C: Chat Mode
Interactive Q&A using the \`sql-tool.ts\`. The agent translates user questions into safe SQLite queries, parses the AST with \`node-sql-parser\`, executes against an allowlist of D1 tables with row limits, and returns narrative answers.

## SQL Tool Constraints
- **AST Validation**: All LLM-generated raw SQL is passed through \`node-sql-parser\` (using the \`sqlite\` dialect) before execution.
- **Fail Closed**: Validation denies-by-default, hard-requires \`ast.type === 'select'\`, and rejects stacked statements.
- **Table Allowlist**: All parsed table references are strictly checked against a hardcoded \`ALLOWED_TABLES\` set.
- **Row Limits**: Results are subquery-wrapped with strict limits to prevent memory exhaustion and timeout abuses.
- **Auditing**: Every executed query is logged to \`salary_agent_queries\`.

### Allowed Tables

| Table | Purpose |
|-------|---------|
| \`roles\` | Individual role records with \`geo_id\` FK to \`geo_locations\` |
| \`market_salary_snapshots\` | H1B/market data snapshot metadata |
| \`market_salary_stats\` | Aggregate salary statistics per snapshot |
| \`market_company_salaries\` | Per-company salary filing data |
| \`company_segments\` | Company classification (faang, big_tech, etc.) |
| \`role_family_taxonomy\` | Job title → normalized family + seniority level |
| \`geo_locations\` | Centralized geographic locations (metros, countries, micro-hubs) |
| \`geo_location_meta_definitions\` | EAV attribute registry (e.g., cost_of_living_index) |
| \`geo_location_mappings\` | EAV value store (geo_id × metric → value) |
| \`cost_of_living_index\` | ⚠️ DEPRECATED — use \`geo_location_mappings\` with key \`cost_of_living_index\` |
| \`salary_findings\` | Persisted benchmark findings |
| \`salary_agent_queries\` | Audit log for executed SQL queries |
| \`career_model_assumptions\` | Configurable career model parameters |

### Geo-Aware Query Patterns

The salary agent uses the centralized \`geo_locations\` + EAV tables for all geographic operations. The key pattern for COL-adjusted queries:

\`\`\`sql
-- Get a role's cost-of-living index via the EAV pipeline
SELECT r.company_name, gl.name AS metro, CAST(glm.value AS REAL) AS col_index
FROM roles r
LEFT JOIN geo_locations gl ON r.geo_id = gl.id
LEFT JOIN geo_location_mappings glm ON gl.id = glm.geo_id
  AND glm.meta_id = (
    SELECT id FROM geo_location_meta_definitions
    WHERE key = 'cost_of_living_index'
  )
WHERE r.id = '...';
\`\`\`

See the [Geo Data Architecture](/docs/data/geo) documentation for full EAV schema details.
