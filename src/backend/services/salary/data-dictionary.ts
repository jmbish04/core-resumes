export const SALARY_DATA_DICTIONARY = `
## D1 SQL Database Schema & Data Dictionary

You have read-only SQL access to the salary market database. 
All queries must be exactly ONE \`SELECT\` statement.
Do not use \`PERCENTILE_CONT\` (SQLite does not support it). Use the nearest-rank pattern:
\`\`\`sql
-- Nearest-rank median pattern
SELECT salary FROM (
  SELECT salary, ROW_NUMBER() OVER (ORDER BY salary) as rn, count(*) OVER () as ct
  FROM market_company_salaries
) WHERE rn = (ct + 1) / 2
\`\`\`

### Allowed Tables

1. **roles**
   - \`id\` (TEXT): Role UUID.
   - \`company_name\` (TEXT): Raw company name.
   - \`job_title\` (TEXT): Raw job title.
   - \`salary_min\` / \`salary_max\` (INTEGER): Offer bounds.
   - \`metro\` (TEXT): Normalized metropolitan area (e.g., 'San Francisco, CA'). NULL if unknown.
   - *Note: \`seniority\` and \`industry\` are NOT columns on this table. You must derive them via JOINs (see below).*

2. **company_segments**
   - \`company_name\` (TEXT): Canonical lowercased company name.
   - \`segment\` (TEXT): One of faang, big_tech, public_mid_cap, late_stage_private, early_stage_startup, non_tech_enterprise, consulting, finance, unknown.
   - *Use this instead of an industry column.*

3. **role_family_taxonomy**
   - \`raw_title\` (TEXT): Canonical lowercased raw job title.
   - \`family\` (TEXT): Normalized family (e.g. 'Software Engineer').
   - \`level\` (TEXT): Derived seniority (junior, mid, senior, staff, principal).

4. **cost_of_living_index**
   - \`metro\` (TEXT): Normalized metro string.
   - \`col_index\` (REAL): Multiplier (1.00 is baseline/remote).

5. **career_model_assumptions**
   - \`key\` (TEXT): e.g., 'baseline_anchor_salary', 'time_in_level:senior'.
   - \`value\` (REAL): The numeric assumption value.

6. **salary_findings**
   - \`id\` (INTEGER)
   - \`role_id\` (TEXT)
   - \`mode\` (TEXT): 'A', 'B', or 'C'
   - \`finding\` (JSON): The structured finding payload.

7. **market_company_salaries**
   - Contains H1B and scraped filing data.

### Example JOIN
To get a role's segment and seniority:
\`\`\`sql
SELECT r.company_name, cs.segment, r.job_title, t.level, r.metro, col.col_index
FROM roles r
LEFT JOIN company_segments cs ON LOWER(r.company_name) = cs.company_name
LEFT JOIN role_family_taxonomy t ON LOWER(r.job_title) = t.raw_title
LEFT JOIN cost_of_living_index col ON r.metro = col.metro
WHERE r.id = '...';
\`\`\`
`;
