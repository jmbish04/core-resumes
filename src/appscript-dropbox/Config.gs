/**
 * ============================================================================
 * Config.gs — Central configuration for the Gemini Job Dropbox
 * ============================================================================
 *
 * Container-bound Apps Script for the "Gemini Job Dropbox" Google Sheet.
 * Gemini's scheduled job appends rows here; an onChange trigger submits each
 * new row to the core-resumes Worker HITL role queue
 * (POST /api/pipeline/external-agents/jobs) for the user to review.
 *
 * SETUP:
 *   1. Deploy from the repo: `pnpm run deploy:appsscript` (regenerates
 *      Generated.gs with WORKER_BASE_URL and pushes via clasp).
 *   2. Run Setup.createDropboxSheet() once — it auto-applies WORKER_BASE_URL and
 *      seeds WORKER_API_KEY with the "ENTER_WORKER_API_KEY" placeholder.
 *   3. In Project Settings > Script Properties, replace WORKER_API_KEY with your
 *      real core-resumes WORKER_API_KEY.
 *   4. Run Trigger.installOnChangeTrigger() once to arm the sync trigger.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Sheet & tab constants
// ─────────────────────────────────────────────────────────────────────────────

/** Name of the tab where Gemini appends scraped jobs. */
const DROPBOX_TAB_NAME = "DROPBOX";

/** Name of the tab where sync audit logs are written. */
const SYNC_LOG_TAB_NAME = "SYNC_LOG";

/** Name of the tab holding agent (Gemini) instructions for updating the sheet. */
const AGENTS_TAB_NAME = "AGENTS.md";

// ─────────────────────────────────────────────────────────────────────────────
// Header definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DROPBOX_HEADERS defines every column in the DROPBOX sheet.
 * The `key` is the internal field name used when building the submission
 * payload (see Sync.gs); only jobTitle, companyName, location, and jobUrl are
 * sent to the HITL queue endpoint — the rest are sheet-only reference columns.
 * The `header` is the human-readable column label in the sheet.
 * The `required` flag marks columns that must have a value to submit.
 */
const DROPBOX_HEADERS = [
  { key: "jobUrl",            header: "Job URL",             required: true  },
  { key: "companyName",       header: "Company Name",        required: true  },
  { key: "jobTitle",          header: "Job Title",           required: true  },
  { key: "salaryMin",         header: "Salary Min",          required: false },
  { key: "salaryMax",         header: "Salary Max",          required: false },
  { key: "salaryCurrency",    header: "Salary Currency",     required: false },
  { key: "location",          header: "Location",            required: false },
  { key: "workplaceType",     header: "Workplace Type",      required: false },
  { key: "source",            header: "Source",              required: false },
  { key: "roleInstructions",  header: "Role Instructions",   required: false },
  { key: "notes",             header: "Notes",               required: false },
  { key: "syncStatus",        header: "Sync Status",         required: false },
  { key: "syncTimestamp",     header: "Synced At",           required: false },
  { key: "syncError",         header: "Sync Error",          required: false },
];

/**
 * Returns just the header labels for building the sheet row.
 * @return {string[]}
 */
function getHeaderLabels() {
  return DROPBOX_HEADERS.map(function(h) { return h.header; });
}

/**
 * Returns a map of header label → column index (0-based).
 * @return {Object.<string, number>}
 */
function getHeaderIndexMap() {
  const map = {};
  DROPBOX_HEADERS.forEach(function(h, i) {
    map[h.key] = i;
  });
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// API configuration (read from Script Properties at runtime)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Placeholder value seeded for WORKER_API_KEY by `pnpm run deploy:appsscript`.
 * Treated as "not configured" until the operator replaces it with a real key.
 */
const WORKER_API_KEY_PLACEHOLDER = "ENTER_WORKER_API_KEY";

/**
 * Returns the core-resumes Worker base URL.
 * @return {string}
 */
function getWorkerBaseUrl() {
  const url = PropertiesService.getScriptProperties().getProperty("WORKER_BASE_URL");
  if (!url) {
    throw new Error(
      "WORKER_BASE_URL not set. Go to Project Settings > Script Properties and add it."
    );
  }
  // Strip trailing slash
  return url.replace(/\/+$/, "");
}

/**
 * Returns the WORKER_API_KEY for authenticating with the core-resumes API.
 * @return {string}
 */
function getWorkerApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty("WORKER_API_KEY");
  if (!key || key === WORKER_API_KEY_PLACEHOLDER) {
    throw new Error(
      "WORKER_API_KEY not set. Go to Project Settings > Script Properties and replace " +
      '"' + WORKER_API_KEY_PLACEHOLDER + '" with your real core-resumes WORKER_API_KEY.'
    );
  }
  return key;
}

/**
 * The external-agents ingestion endpoint path.
 *
 * Rows are submitted here as job postings for HITL (human-in-the-loop) review:
 * the Worker inserts them into the discovery queue with `triagePassed: false`
 * so the user decides whether to promote/process each role. This is distinct
 * from `/api/intake/batch`, which would scrape and fully process roles
 * immediately, bypassing the review step.
 *
 * Body shape: { jobs: [{ jobTitle, company, location?, jobUrl?, jobSiteId? }] }
 * Response:   { insertedCount, skippedCount }
 */
const EXTERNAL_AGENTS_JOBS_PATH = "/api/pipeline/external-agents/jobs";

/**
 * The external-agents prompt endpoint path.
 *
 * Returns a Markdown "skill" document generated from real-time configuration
 * (target roles, locations, tracked companies, and exclusion URLs). The
 * AGENTS.md tab is refreshed from this endpoint daily so Gemini always reads
 * current targeting criteria before its scheduled scrape.
 *
 * Pass ?submitVia=sheet so the returned submission instructions describe
 * appending rows to the DROPBOX tab (this sheet's workflow) rather than a
 * direct API POST.
 */
const EXTERNAL_AGENTS_PROMPT_PATH = "/api/pipeline/external-agents/prompt";
