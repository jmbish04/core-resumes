## Agent SQL Execution Constraints
- Never provide an agent with unrestricted env.DB access or raw sql.raw() capability without AST validation.
- All raw SQL from LLMs must pass through node-sql-parser (sqlite dialect) before execution.
- AST validation must fail closed: deny-by-default, hard-require ast.type === 'select', reject statements.length !== 1.
- All parsed table references must be checked against a hardcoded ALLOWED_TABLES set.
- LIMIT enforcement uses subquery-wrap, never string concatenation.
- D1 timeout via AbortSignal is advisory at the JS layer only — pair with strict row limits.
- Every executed query is audited to salary_agent_queries (fire-and-forget insert).
