/**
 * ============================================================================
 * Setup.gs — One-time sheet initialization
 * ============================================================================
 *
 * Creates the DROPBOX tab with frozen header row and formatting.
 * Run once from the Script Editor: Setup > createDropboxSheet
 */

/**
 * Creates (or resets) the DROPBOX tab in the active spreadsheet.
 *
 * - Inserts the tab if it doesn't exist.
 * - Writes the header row from DROPBOX_HEADERS.
 * - Freezes the header row.
 * - Applies formatting (bold headers, column widths, data validation).
 */
function createDropboxSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DROPBOX_TAB_NAME); // Changed to let to allow reassignment
  const ui = SpreadsheetApp.getUi();

  if (sheet) {
    // Sheet exists — prompt user before resetting
    const response = ui.alert(
      "Reset DROPBOX Sheet?",
      "The DROPBOX tab already exists. This will clear all data and re-apply headers. Continue?",
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      ui.alert("Cancelled. DROPBOX sheet was not modified.");
      return;
    }
    sheet.clear();
  } else {
    sheet = ss.insertSheet(DROPBOX_TAB_NAME);
  }

  // ── Write headers ──────────────────────────────────────────────────────────
  const headers = getHeaderLabels();
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);

  // ── Style header row ───────────────────────────────────────────────────────
  headerRange
    .setFontWeight("bold")
    .setBackground("#1a1a2e")
    .setFontColor("#e0e0e0")
    .setHorizontalAlignment("center")
    .setBorder(
      false, false, true, false, false, false,
      "#4a4a6a", SpreadsheetApp.BorderStyle.SOLID_MEDIUM
    );

  // Freeze header row
  sheet.setFrozenRows(1);

  // ── Column widths ──────────────────────────────────────────────────────────
  const widths = {
    "Job URL":           320,
    "Company Name":      180,
    "Job Title":         220,
    "Salary Min":        100,
    "Salary Max":        100,
    "Salary Currency":    90,
    "Location":           160,
    "Workplace Type":    120,
    "Source":             100,
    "Role Instructions": 250,
    "Notes":             200,
    "Sync Status":        90,
    "Synced At":         160,
    "Sync Error":        250,
  };

  headers.forEach(function(header, i) {
    if (widths[header]) {
      sheet.setColumnWidth(i + 1, widths[header]);
    }
  });

  // ── Data validation: Workplace Type dropdown ───────────────────────────────
  const idx = getHeaderIndexMap();
  const workplaceCol = idx["workplaceType"] + 1; // 1-indexed
  const workplaceValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["remote", "hybrid", "onsite"], true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, workplaceCol, 500, 1).setDataValidation(workplaceValidation);

  // ── Data validation: Currency dropdown ─────────────────────────────────────
  const currencyCol = idx["salaryCurrency"] + 1;
  const currencyValidation = SpreadsheetApp.newDataValidation()
    .requireValueInList(["USD", "EUR", "GBP", "CAD", "AUD"], true)
    .setAllowInvalid(true)
    .build();

  sheet.getRange(2, currencyCol, 500, 1).setDataValidation(currencyValidation);

  // ── Data validation: Sync Status (read-only indicator) ─────────────────────
  const syncStatusCol = idx["syncStatus"] + 1;
  sheet.getRange(2, syncStatusCol, 500, 1)
    .setFontColor("#888888")
    .setHorizontalAlignment("center");

  // ── Sync Timestamp formatting ──────────────────────────────────────────────
  const syncTimestampCol = idx["syncTimestamp"] + 1;
  sheet.getRange(2, syncTimestampCol, 500, 1)
    .setNumberFormat("yyyy-MM-dd HH:mm:ss")
    .setFontColor("#888888");

  // ── Create SYNC_LOG tab ────────────────────────────────────────────────────
  createSyncLogSheet_(ss);

  // ── Create AGENTS.md tab (instructions for the scraping agent) ──────────────
  createAgentsSheet_(ss);

  // ── Auto-apply deploy-time properties, then prompt for anything missing ─────
  applyGeneratedProperties_();
  const missingProps = promptForMissingProperties_(ui);

  // ── Arm the onChange trigger so new rows auto-submit to the HITL queue ──────
  installOnChangeTrigger_();

  // ── Arm the daily trigger that refreshes the AGENTS.md skill ────────────────
  installDailyAgentsRefreshTrigger_();

  // ── Seed the AGENTS.md skill from the Worker (best-effort) ──────────────────
  let skillRefreshed = false;
  try {
    skillRefreshed = refreshAgentsSkill_(ss);
  } catch (refreshError) {
    Logger.log("Initial AGENTS.md refresh failed: " + refreshError.message);
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  let body = "✅ DROPBOX sheet created. The onChange trigger is armed and the " +
    "AGENTS.md skill will refresh daily.\n\n" +
    "New rows appended to DROPBOX will be submitted to the core-resumes role " +
    "queue for HITL review.\n\n";

  if (!skillRefreshed) {
    body += "Note: the AGENTS.md skill could not load live targeting criteria from " +
      "the Worker yet (it shows local instructions). It will retry on the daily " +
      "trigger, or run Setup > refreshAgentsSkill after setting WORKER_API_KEY.\n\n";
  }

  if (missingProps.length > 0) {
    body += "Next step: set WORKER_API_KEY (run Setup > checkScriptProperties). " +
      "Submissions will fail until the real key replaces the placeholder.";
  } else {
    body += "All set — you're ready to go.";
  }

  ui.alert(body);
}

/**
 * Creates the SYNC_LOG tab for audit trail of sync operations.
 * @param {SpreadsheetApp.Spreadsheet} ss
 * @private
 */
function createSyncLogSheet_(ss) {
  let logSheet = ss.getSheetByName(SYNC_LOG_TAB_NAME); // Changed to let to allow reassignment

  if (!logSheet) {
    logSheet = ss.insertSheet(SYNC_LOG_TAB_NAME);
  } else {
    logSheet.clear();
  }

  const logHeaders = [
    "Timestamp", "Batch Size", "Queued", "Skipped",
    "Duration (ms)", "Details",
  ];

  const headerRange = logSheet.getRange(1, 1, 1, logHeaders.length);
  headerRange.setValues([logHeaders]);
  headerRange
    .setFontWeight("bold")
    .setBackground("#1a1a2e")
    .setFontColor("#e0e0e0")
    .setHorizontalAlignment("center");

  logSheet.setFrozenRows(1);
  logSheet.setColumnWidth(1, 180);
  logSheet.setColumnWidth(6, 400);
}

/**
 * Creates (or resets) the AGENTS.md tab — a single merged cell containing the
 * agent "skill" document — and immediately refreshes it from the Worker so it
 * reflects current targeting criteria. Run from the Script Editor:
 * Setup > createAgentsSheet
 */
function createAgentsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  createAgentsSheet_(ss);
  const refreshed = refreshAgentsSkill_(ss);
  SpreadsheetApp.getUi().alert(
    refreshed
      ? "✅ AGENTS.md skill tab created and refreshed from the Worker.\n\n" +
        "It contains the live targeting criteria plus the instructions the " +
        "scraping agent should follow when appending rows to the DROPBOX tab."
      : "✅ AGENTS.md tab created with local instructions.\n\n" +
        "Could not reach the Worker to load live targeting criteria — check " +
        "WORKER_BASE_URL / WORKER_API_KEY, then run Setup > refreshAgentsSkill."
  );
}

/**
 * Creates (or resets) the AGENTS.md tab as a single merged cell and seeds it
 * with the local fallback instructions. The cell is refreshed with the
 * Worker-generated skill via refreshAgentsSkill_().
 * @param {SpreadsheetApp.Spreadsheet} ss
 * @returns {SpreadsheetApp.Sheet} The AGENTS.md sheet.
 * @private
 */
function createAgentsSheet_(ss) {
  let sheet = ss.getSheetByName(AGENTS_TAB_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(AGENTS_TAB_NAME);
  } else {
    sheet.clear();
    // Drop any pre-existing merges before re-merging.
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).breakApart();
  }

  // One big merged cell spanning a generous block so the full doc is visible.
  const lastCol = 8; // A:H
  const lastRow = 80;
  sheet.getRange(1, 1, lastRow, lastCol).merge();

  sheet.getRange(1, 1)
    .setValue(buildAgentsInstructions_())
    .setWrap(true)
    .setVerticalAlignment("top")
    .setHorizontalAlignment("left")
    .setFontFamily("Consolas")
    .setFontSize(11)
    .setFontColor("#e0e0e0")
    .setBackground("#1a1a2e");

  // Reasonable column widths so the merged cell reads like a document.
  for (let col = 1; col <= lastCol; col++) {
    sheet.setColumnWidth(col, 110);
  }

  return sheet;
}

/**
 * Refreshes the AGENTS.md skill tab from the Worker (UI wrapper).
 * Run from the Script Editor: Setup > refreshAgentsSkill
 */
function refreshAgentsSkill() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ok = refreshAgentsSkill_(ss);
  SpreadsheetApp.getUi().alert(
    ok
      ? "✅ AGENTS.md skill refreshed from the Worker with current targeting criteria."
      : "⚠️ Could not refresh AGENTS.md from the Worker.\n\n" +
        "The existing instructions were left unchanged. Check WORKER_BASE_URL and " +
        "WORKER_API_KEY, then try again."
  );
}

/**
 * Fetches the Worker-generated skill (real-time targeting criteria), appends
 * the local sheet mechanics and a refresh timestamp, and writes the result
 * into the AGENTS.md merged cell.
 *
 * On any failure the existing cell content is left untouched so a transient
 * Worker outage never blanks the agent's instructions.
 *
 * @param {SpreadsheetApp.Spreadsheet} ss
 * @returns {boolean} true if refreshed from the Worker, false otherwise.
 * @private
 */
function refreshAgentsSkill_(ss) {
  const workerPrompt = fetchAgentTargetingPrompt_();
  if (!workerPrompt) {
    Logger.log("refreshAgentsSkill_: Worker prompt unavailable; keeping existing content.");
    return false;
  }

  const sheet = createAgentsSheetIfMissing_(ss);
  const timestamp = Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss z"
  );

  const content = [
    workerPrompt.replace(/\s+$/, ""),
    "",
    "---",
    "",
    buildSheetMechanics_(),
    "",
    "_Skill refreshed from the core-resumes Worker at " + timestamp + "._",
  ].join("\n");

  sheet.getRange(1, 1).setValue(content);
  return true;
}

/**
 * Returns the AGENTS.md sheet, creating it (with layout) if it doesn't exist.
 * @param {SpreadsheetApp.Spreadsheet} ss
 * @returns {SpreadsheetApp.Sheet}
 * @private
 */
function createAgentsSheetIfMissing_(ss) {
  const existing = ss.getSheetByName(AGENTS_TAB_NAME);
  return existing ? existing : createAgentsSheet_(ss);
}

/**
 * GETs the Worker's external-agents prompt with ?submitVia=sheet so the
 * returned submission instructions describe the DROPBOX sheet workflow.
 * @returns {string|null} The Markdown prompt, or null on any error.
 * @private
 */
function fetchAgentTargetingPrompt_() {
  let baseUrl, apiKey;
  try {
    baseUrl = getWorkerBaseUrl();
    apiKey = getWorkerApiKey();
  } catch (configError) {
    Logger.log("fetchAgentTargetingPrompt_: " + configError.message);
    return null;
  }

  const url = baseUrl + EXTERNAL_AGENTS_PROMPT_PATH + "?submitVia=sheet";
  const options = {
    method: "get",
    headers: { "x-api-key": apiKey },
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    if (statusCode !== 200) {
      Logger.log("fetchAgentTargetingPrompt_: HTTP " + statusCode + " from " + url);
      return null;
    }
    const body = response.getContentText();
    return body && body.trim() ? body : null;
  } catch (fetchError) {
    Logger.log("fetchAgentTargetingPrompt_: " + fetchError.message);
    return null;
  }
}

/**
 * Builds the full local fallback instruction document used when the Worker is
 * unreachable. Composed of an intro header plus the shared sheet mechanics.
 * @returns {string}
 * @private
 */
function buildAgentsInstructions_() {
  return [
    "# AGENTS.md — Job Dropbox Instructions",
    "",
    "You are an automated job-scraping agent. When you find a relevant open",
    "role, append ONE row per job to the `" + DROPBOX_TAB_NAME + "` tab using the",
    "Google Sheets API (values.append). Each appended row is automatically",
    "submitted to the core-resumes role queue for human review (HITL) — the",
    "user decides whether to process it. Do NOT process or apply to roles.",
    "",
    "_Live targeting criteria load here when the skill is refreshed from the",
    "Worker. Until then, follow the mechanics below._",
    "",
    "---",
    "",
    buildSheetMechanics_(),
  ].join("\n");
}

/**
 * Builds the "how to write to this sheet" mechanics shared by the local
 * fallback doc and the Worker-refreshed skill. Column order is derived from
 * DROPBOX_HEADERS so it never drifts.
 * @returns {string}
 * @private
 */
function buildSheetMechanics_() {
  const autoFilled = { syncStatus: true, syncTimestamp: true, syncError: true };

  const columnLines = DROPBOX_HEADERS.map(function(h, i) {
    const colLetter = String.fromCharCode(65 + i); // A, B, C, ...
    let tag;
    if (autoFilled[h.key]) {
      tag = "DO NOT WRITE — auto-filled by the script";
    } else if (h.required) {
      tag = "REQUIRED";
    } else {
      tag = "optional";
    }
    return "  " + colLetter + ". " + h.header + " (" + tag + ")";
  }).join("\n");

  return [
    "## Where to write",
    "",
    "- Tab: `" + DROPBOX_TAB_NAME + "` (append rows below the header row).",
    "- Write one job per row. Never edit existing rows.",
    "- Never write to the `" + SYNC_LOG_TAB_NAME + "` or `" + AGENTS_TAB_NAME + "` tabs.",
    "",
    "## Columns (left to right)",
    "",
    columnLines,
    "",
    "## Rules",
    "",
    "1. Company Name and Job Title are REQUIRED — a row without both is ignored.",
    "2. Always include Job URL when available (used to de-duplicate postings).",
    "3. Workplace Type must be one of: remote, hybrid, onsite.",
    "4. Salary Currency is an ISO 4217 code (e.g. USD, EUR, GBP). Salary Min/Max",
    "   are plain numbers (no symbols or commas).",
    "5. Leave the auto-filled columns (Sync Status, Synced At, Sync Error) blank —",
    "   the script populates them. 'queued' means the job reached the review queue.",
    "6. Do not submit a job whose Job URL already appears in the sheet.",
    "",
    "## What happens next",
    "",
    "Appending a row fires an onChange trigger that POSTs the job to",
    "`/api/pipeline/external-agents/jobs`. Only Job Title, Company Name, Location,",
    "and Job URL are sent to the queue; the other columns stay here for reference.",
  ].join("\n");
}

/**
 * Applies deploy-time defaults (from Generated.gs) to Script Properties so the
 * operator doesn't have to enter them by hand.
 *
 * - WORKER_BASE_URL is baked in from the Worker name in wrangler.jsonc. It is
 *   set when absent, keeping any value the operator already configured.
 * - WORKER_API_KEY is seeded with the "ENTER_WORKER_API_KEY" placeholder so the
 *   property exists; the operator must replace it with the real key.
 * @private
 */
function applyGeneratedProperties_() {
  const scriptProps = PropertiesService.getScriptProperties();
  const props = scriptProps.getProperties();

  if (typeof GENERATED_WORKER_BASE_URL !== "undefined" && GENERATED_WORKER_BASE_URL) {
    if (!props["WORKER_BASE_URL"]) {
      scriptProps.setProperty("WORKER_BASE_URL", GENERATED_WORKER_BASE_URL);
    }
  }

  if (!props["WORKER_API_KEY"]) {
    const seed =
      typeof GENERATED_WORKER_API_KEY !== "undefined"
        ? GENERATED_WORKER_API_KEY
        : WORKER_API_KEY_PLACEHOLDER;
    scriptProps.setProperty("WORKER_API_KEY", seed);
  }
}

/**
 * Returns the list of required properties that are still unconfigured.
 * The WORKER_API_KEY placeholder counts as unconfigured.
 * @returns {string[]}
 * @private
 */
function getMissingProperties_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const missing = [];
  if (!props["WORKER_BASE_URL"]) missing.push("WORKER_BASE_URL");
  if (!props["WORKER_API_KEY"] || props["WORKER_API_KEY"] === WORKER_API_KEY_PLACEHOLDER) {
    missing.push("WORKER_API_KEY");
  }
  return missing;
}

/**
 * Prompts the user to enter any missing script properties.
 * @param {GoogleAppsScript.Base.Ui} ui
 * @returns {string[]} Array of property keys still missing after prompting.
 * @private
 */
function promptForMissingProperties_(ui) {
  const scriptProps = PropertiesService.getScriptProperties();
  const props = scriptProps.getProperties();

  if (!props["WORKER_BASE_URL"]) {
    const response = ui.prompt(
      "Missing Property: WORKER_BASE_URL",
      "Please enter your WORKER_BASE_URL (e.g., https://core-resumes.hacolby.workers.dev):",
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() === ui.Button.OK) {
      const val = response.getResponseText().trim();
      if (val) scriptProps.setProperty("WORKER_BASE_URL", val);
    }
  }

  if (!props["WORKER_API_KEY"] || props["WORKER_API_KEY"] === WORKER_API_KEY_PLACEHOLDER) {
    const response = ui.prompt(
      "Set Property: WORKER_API_KEY",
      'Please enter your WORKER_API_KEY (from Cloudflare Secrets). ' +
      'It is currently the "' + WORKER_API_KEY_PLACEHOLDER + '" placeholder:',
      ui.ButtonSet.OK_CANCEL
    );
    if (response.getSelectedButton() === ui.Button.OK) {
      const val = response.getResponseText().trim();
      if (val) scriptProps.setProperty("WORKER_API_KEY", val);
    }
  }

  return getMissingProperties_();
}

/**
 * Checks if the required script properties are configured.
 * Prompts the user to enter them if they are missing.
 * Run from the Script Editor: Setup > checkScriptProperties
 */
function checkScriptProperties() {
  const ui = SpreadsheetApp.getUi();
  applyGeneratedProperties_();
  const missing = promptForMissingProperties_(ui);

  if (missing.length > 0) {
    ui.alert(
      "⚠️ Missing Script Properties",
      "The following properties are missing and must be added:\n\n" + 
      missing.join("\n") + "\n\n" +
      "Sync will fail until these are configured.",
      ui.ButtonSet.OK
    );
    return false;
  } else {
    ui.alert(
      "✅ Properties Configured",
      "All required script properties (WORKER_BASE_URL, WORKER_API_KEY) are correctly set.",
      ui.ButtonSet.OK
    );
    return true;
  }
}