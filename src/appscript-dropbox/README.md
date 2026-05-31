# Gemini Job Dropbox — Apps Script

Container-bound Google Apps Script for the **Gemini Job Dropbox** spreadsheet.

Gemini's scheduled job scrapes job postings it thinks are relevant and appends rows to the `DROPBOX` tab. This script automatically submits those rows to the core-resumes Worker's `POST /api/pipeline/external-agents/jobs` endpoint, which places each job into the **HITL queue** (`triagePassed: false`). The user then decides in the app whether to promote/process each role — submission does **not** scrape or process the role.

## Architecture

```
Gemini Scheduled Job
  → Appends rows to DROPBOX tab (Sheets API)
    → onChange trigger fires
      → Sync.gs reads un-submitted rows
        → Packages into { jobs: [{ jobTitle, company, location?, jobUrl? }] }
          → POST /api/pipeline/external-agents/jobs (x-api-key auth)
            → core-resumes Worker inserts into the HITL discovery queue
              → User reviews & decides whether to process each role
                → Sync.gs marks each row "queued"
```

## Files

| File | Purpose |
|------|---------|
| `Config.gs` | Constants: `DROPBOX_HEADERS`, API URL/key accessors, tab names |
| `Generated.gs` | **Auto-generated** by `pnpm run deploy:appsscript` — deploy-time `WORKER_BASE_URL` / `WORKER_API_KEY` defaults. Do not edit by hand. |
| `Setup.gs` | One-time `createDropboxSheet()` — creates tabs, headers, formatting, auto-applies properties |
| `Trigger.gs` | `installOnChangeTrigger()` — arms the onChange listener; `installDailyAgentsRefreshTrigger()` — arms the daily AGENTS.md skill refresh |
| `Sync.gs` | `syncNewRows()` — core sync logic, batch POST, row status updates |

## Sheet Columns

The HITL queue endpoint accepts a lightweight discovery payload, so only **Job Title**, **Company Name**, **Location**, and **Job URL** are submitted. The remaining columns stay in the sheet for the reviewer's reference; richer extraction (salary, instructions, etc.) happens later when the user promotes the role for full processing.

| Column | Submitted As | Required | Description |
|--------|--------------|----------|-------------|
| Job Title | `jobTitle` | ✅ | Position title |
| Company Name | `company` | ✅ | Hiring company name |
| Location | `location` | | Job location |
| Job URL | `jobUrl` | | URL of the job posting (used for de-duplication) |
| Salary Min | — (sheet only) | | Lower salary bound |
| Salary Max | — (sheet only) | | Upper salary bound |
| Salary Currency | — (sheet only) | | ISO 4217 code (default: USD) |
| Workplace Type | — (sheet only) | | `remote` / `hybrid` / `onsite` |
| Source | — (sheet only) | | Where Gemini found the job |
| Role Instructions | — (sheet only) | | AI instructions for this role |
| Notes | — (sheet only) | | Gemini's reasoning/notes |
| Sync Status | — | | Auto-filled: `queued` / `error` |
| Synced At | — | | Auto-filled: timestamp |
| Sync Error | — | | Auto-filled: error details |

## Setup Instructions

### 1. Create the Google Sheet

1. Create a new Google Sheet (or open an existing one)
2. Open **Extensions > Apps Script**

### 2. Add the Script Files

Copy each `.gs` file into the Apps Script editor:
- `Config.gs` → rename `Code.gs` to `Config` and paste
- `Setup.gs` → create new file named `Setup` and paste
- `Trigger.gs` → create new file named `Trigger` and paste
- `Sync.gs` → create new file named `Sync` and paste

### 3. Configure Script Properties

Both properties are applied automatically when you run `createDropboxSheet` (see step 4):

| Property | Value |
|----------|-------|
| `WORKER_BASE_URL` | Baked in from the Worker name in `wrangler.jsonc` (e.g. `https://core-resumes.hacolby.workers.dev`) |
| `WORKER_API_KEY` | Seeded with the placeholder `ENTER_WORKER_API_KEY` — you must replace it with your real key |

> **Deploying from this repo:** Run `pnpm run deploy:appsscript` from the project root. It reads the Worker `name` from `wrangler.jsonc`, regenerates `Generated.gs` with the correct `WORKER_BASE_URL`, and pushes all files to Apps Script via `clasp`. Then in **Project Settings > Script Properties**, replace the `WORKER_API_KEY` placeholder with the real key from Cloudflare Secrets Store. Run `checkScriptProperties` any time to verify (the placeholder counts as "not configured").

### 4. Initialize the Sheet (also arms the trigger)

1. In the Script Editor, select `createDropboxSheet` from the function dropdown
2. Click **Run**
3. Authorize the script when prompted
4. The DROPBOX, SYNC_LOG, and AGENTS.md tabs are created **and the onChange trigger is armed automatically** — new rows appended to DROPBOX will be submitted to the HITL queue

> The **AGENTS.md** tab is a single merged cell holding a **skill document** for the scraping agent (Gemini). It combines live targeting criteria — target roles, locations, tracked companies, and exclusion URLs — pulled in real time from the Worker (`GET /api/pipeline/external-agents/prompt?submitVia=sheet`) with the local "how to write to this sheet" mechanics. Gemini should read this tab before each scheduled scrape.

> The skill **refreshes automatically once per day** (~06:00) via a time-based trigger so the criteria stay current. Refresh on demand any time with `refreshAgentsSkill`, or rebuild the whole tab with `createAgentsSheet`. If the Worker is unreachable, the existing content is kept (a transient outage never blanks the instructions); a freshly created tab falls back to local-only mechanics until the next successful refresh.

> To re-arm or repair the row-sync trigger later, run `installOnChangeTrigger`. To remove it, run `removeDropboxTriggers`. The daily skill-refresh trigger is armed by `createDropboxSheet` and can be re-armed with `installDailyAgentsRefreshTrigger`.

### 5. Test

1. Select `manualSync` and click **Run** to test with any existing rows
2. Or manually add a row (Company Name + Job Title required) and watch it queue

## Gemini Integration

The Gemini scheduled job should write rows to the DROPBOX tab using the Google Sheets API:

```python
# Example: Gemini appending a scraped job
sheets_service.spreadsheets().values().append(
    spreadsheetId=SPREADSHEET_ID,
    range="DROPBOX!A:K",
    valueInputOption="USER_ENTERED",
    body={
        "values": [[
            "https://boards.greenhouse.io/company/jobs/12345",  # Job URL
            "Acme Corp",                                        # Company Name
            "Senior Frontend Engineer",                         # Job Title
            150000,                                             # Salary Min
            200000,                                             # Salary Max
            "USD",                                              # Currency
            "San Francisco, CA",                                # Location
            "hybrid",                                           # Workplace Type
            "gemini-greenhouse-scan",                           # Source
            "",                                                 # Role Instructions
            "Strong TypeScript + React match",                  # Notes
        ]]
    }
).execute()
```

> **Note:** Leave columns L–N (Sync Status, Synced At, Sync Error) empty — the script fills those automatically.
