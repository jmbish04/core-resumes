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
   - \`geo_id\` (INTEGER): FK to \`geo_locations.id\`. The canonical geo record for this role's location.
   - \`metro\` (TEXT): DEPRECATED — normalized metropolitan area. Use \`geo_id\` FK instead.
   - *Note: \`seniority\` and \`industry\` are NOT columns on this table. You must derive them via JOINs (see below).*

2. **company_segments**
   - \`company_name\` (TEXT): Canonical lowercased company name.
   - \`segment\` (TEXT): One of faang, big_tech, public_mid_cap, late_stage_private, early_stage_startup, non_tech_enterprise, consulting, finance, unknown.
   - *Use this instead of an industry column.*

3. **role_family_taxonomy**
   - \`raw_title\` (TEXT): Canonical lowercased raw job title.
   - \`family\` (TEXT): Normalized family (e.g. 'Software Engineer').
   - \`level\` (TEXT): Derived seniority (junior, mid, senior, staff, principal).

4. **geo_locations** *(Single source of truth for all geographic data)*
   - \`id\` (INTEGER): Autoincrement primary key.
   - \`type\` (TEXT): One of 'metro', 'country', 'micro_hub', 'neighborhood'.
   - \`name\` (TEXT): Canonical display name (e.g., 'San Francisco, CA').
   - \`country\` (TEXT): ISO 3166-1 alpha-2 country code (e.g., 'US').
   - \`region\` (TEXT): State/province (e.g., 'CA').
   - \`city\` (TEXT): City name.
   - \`metro\` (TEXT): Normalized metro area string (unique for metros).
   - \`lat\` / \`lng\` (REAL): Coordinates.
   - \`parent_id\` (INTEGER): Self-referential FK for micro_hub → metro hierarchy.
   - \`is_active\` (INTEGER): Soft-delete flag (1 = active).

5. **geo_location_meta_definitions** *(EAV attribute registry)*
   - \`id\` (INTEGER): Autoincrement PK.
   - \`key\` (TEXT): Unique metric key (e.g., 'cost_of_living_index', 'tech_hub_tier').
   - \`label\` (TEXT): Human-readable label.
   - \`value_type\` (TEXT): 'number', 'string', or 'json'.

6. **geo_location_mappings** *(EAV value store)*
   - \`geo_id\` (INTEGER): FK to geo_locations.id.
   - \`meta_id\` (INTEGER): FK to geo_location_meta_definitions.id.
   - \`value\` (TEXT): The metric value (stringified).
   - *UNIQUE(geo_id, meta_id) — one value per location per metric.*

7. **cost_of_living_index**
   - \`metro\` (TEXT): Normalized metro string (PK, human-readable mirror).
   - \`geo_id\` (INTEGER): FK to \`geo_locations.id\` — the authoritative join key.
   - \`col_index\` (REAL): Multiplier (1.00 is baseline/remote).
   - \`source\` (TEXT), \`as_of\` (TEXT).
   - *Join COL via \`geo_id\` (e.g. \`roles.geo_id = cost_of_living_index.geo_id\`).*

8. **career_model_assumptions**
   - \`key\` (TEXT): e.g., 'baseline_anchor_salary', 'within_level_raise', 'time_in_level:senior'.
   - \`value\` (REAL): The numeric assumption value.

9. **salary_findings**
   - \`id\` (INTEGER)
   - \`role_id\` (TEXT)
   - \`mode\` (TEXT): 'A', 'B', or 'C'
   - \`finding\` (JSON): The structured finding payload.

10. **market_company_salaries** *(per-company H1B/LC percentile filings)*
    - \`snapshot_id\` (INTEGER): FK to market_salary_snapshots.id.
    - \`company_name\` (TEXT, lowercased), \`job_title\` (TEXT, lowercased).
    - \`seniority\` (TEXT): one of entry, mid, senior.
    - \`p25\` / \`median\` / \`p75\` (INTEGER): base-salary percentiles in USD.
    - \`sample_size\` (INTEGER).
    - *⚠️ No salary_min/salary_max, no metro, no role_id. Use p25/median/p75 and JOIN role_family_taxonomy on raw_title = job_title for family.*

11. **market_salary_stats** *(aggregated role-level percentiles; this is where GEOGRAPHY lives)*
    - \`snapshot_id\` (INTEGER): FK to market_salary_snapshots.id.
    - \`role_type\` (TEXT): matches a role family (e.g. 'Software Engineer').
    - \`metric_key\` (TEXT): one of remote, local_market, top_hubs, national — the geographic/market band.
    - \`metric_label\` (TEXT): display label, e.g. 'San Francisco Bay Area', 'Remote'.
    - \`p25\` / \`median\` / \`p75\` (INTEGER), \`sample_size\` (INTEGER).
    - *Cross-market / remote vs in-hub comparisons come from metric_key here, NOT from a metro column.*

12. **market_salary_snapshots** *(ingestion runs)*
    - \`id\` (INTEGER), \`run_timestamp\` (INTEGER unix seconds), \`status\` (TEXT: success | failed).
    - *Use \`status = 'success'\` and ORDER BY run_timestamp to find the latest data.*

### Example JOIN (modern — uses geo_locations)
To get a role's segment, seniority, and cost-of-living index:
\`\`\`sql
SELECT r.company_name, cs.segment, r.job_title, t.level,
       gl.name AS metro, CAST(glm.value AS REAL) AS col_index
FROM roles r
LEFT JOIN company_segments cs ON LOWER(r.company_name) = cs.company_name
LEFT JOIN role_family_taxonomy t ON LOWER(r.job_title) = t.raw_title
LEFT JOIN geo_locations gl ON r.geo_id = gl.id
LEFT JOIN geo_location_mappings glm ON gl.id = glm.geo_id
  AND glm.meta_id = (SELECT id FROM geo_location_meta_definitions WHERE key = 'cost_of_living_index')
WHERE r.id = '...';
\`\`\`

### Example: Cross-market COL comparison
\`\`\`sql
SELECT gl.name, CAST(glm.value AS REAL) AS col_index
FROM geo_locations gl
JOIN geo_location_mappings glm ON gl.id = glm.geo_id
JOIN geo_location_meta_definitions gmd ON glm.meta_id = gmd.id
WHERE gmd.key = 'cost_of_living_index' AND gl.type = 'metro'
ORDER BY CAST(glm.value AS REAL) DESC;
\`\`\`
`;
