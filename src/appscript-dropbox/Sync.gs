/**
 * ============================================================================
 * Sync.gs — Submit DROPBOX rows to the core-resumes HITL role queue
 * ============================================================================
 *
 * Reads un-submitted rows from the DROPBOX tab, packages them into the payload
 * expected by POST /api/pipeline/external-agents/jobs, sends via UrlFetchApp,
 * and writes back submission status to each row.
 *
 * The endpoint places each job into the discovery queue with triagePassed=false
 * so the user can decide in the app whether to promote/process the role (HITL).
 * It does NOT scrape or fully process the role on submission.
 */

/**
 * Scans the DROPBOX sheet for rows with an empty "Sync Status" column,
 * packages them into the external-agents jobs payload, POSTs to the Worker,
 * and updates each row with the result.
 */
function syncNewRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(DROPBOX_TAB_NAME);

  if (!sheet) {
    Logger.log("DROPBOX sheet not found. Run createDropboxSheet() first.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log("No data rows found in DROPBOX sheet.");
    return;
  }

  var idx = getHeaderIndexMap();
  var dataRange = sheet.getRange(2, 1, lastRow - 1, DROPBOX_HEADERS.length);
  var data = dataRange.getValues();

  // ── Collect un-submitted rows ──────────────────────────────────────────────
  var pendingRows = []; // { rowIndex: number (0-based in data), rowData: any[] }

  for (var i = 0; i < data.length; i++) {
    var syncStatus = String(data[i][idx["syncStatus"]] || "").trim();
    var companyName = String(data[i][idx["companyName"]] || "").trim();
    var jobTitle = String(data[i][idx["jobTitle"]] || "").trim();

    // Skip rows already submitted (any status) or missing the required fields.
    // The endpoint requires both company and jobTitle to queue a posting.
    if (syncStatus || !companyName || !jobTitle) {
      continue;
    }

    pendingRows.push({ rowIndex: i, rowData: data[i] });
  }

  if (pendingRows.length === 0) {
    Logger.log("No new rows to submit.");
    return;
  }

  Logger.log("Found " + pendingRows.length + " new row(s). Preparing submission...");

  // ── Build external-agents payload ──────────────────────────────────────────
  var jobs = pendingRows.map(function(entry) {
    var row = entry.rowData;
    var job = {
      jobTitle: String(row[idx["jobTitle"]]).trim(),
      company: String(row[idx["companyName"]]).trim(),
    };

    var location = String(row[idx["location"]] || "").trim();
    if (location) job.location = location;

    var jobUrl = String(row[idx["jobUrl"]] || "").trim();
    if (jobUrl) job.jobUrl = jobUrl;

    return job;
  });

  var payload = { jobs: jobs };
  var startTime = new Date().getTime();

  // ── POST to Worker ─────────────────────────────────────────────────────────
  var baseUrl = getWorkerBaseUrl();
  var apiKey = getWorkerApiKey();
  var url = baseUrl + EXTERNAL_AGENTS_JOBS_PATH;

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "x-api-key": apiKey,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  Logger.log("POSTing " + jobs.length + " job(s) to " + url);

  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (fetchError) {
    // Network-level failure — mark all rows as error
    var errorMsg = "Network error: " + fetchError.message;
    Logger.log(errorMsg);
    markAllRowsError_(sheet, pendingRows, idx, errorMsg);
    logSyncResult_(ss, pendingRows.length, 0, pendingRows.length, new Date().getTime() - startTime, errorMsg);
    return;
  }

  var statusCode = response.getResponseCode();
  var responseBody = response.getContentText();

  Logger.log("Response status: " + statusCode);
  Logger.log("Response body: " + responseBody.substring(0, 500));

  if (statusCode === 401) {
    var authError = "Authentication failed (401). Check WORKER_API_KEY in Script Properties.";
    Logger.log(authError);
    markAllRowsError_(sheet, pendingRows, idx, authError);
    logSyncResult_(ss, pendingRows.length, 0, pendingRows.length, new Date().getTime() - startTime, authError);
    return;
  }

  if (statusCode !== 200) {
    var httpError = "HTTP " + statusCode + ": " + responseBody.substring(0, 200);
    Logger.log(httpError);
    markAllRowsError_(sheet, pendingRows, idx, httpError);
    logSyncResult_(ss, pendingRows.length, 0, pendingRows.length, new Date().getTime() - startTime, httpError);
    return;
  }

  // ── Parse response ─────────────────────────────────────────────────────────
  // The endpoint returns aggregate counts only: { insertedCount, skippedCount }.
  // It does not report per-row results, so on a 200 every submitted row is
  // marked "queued" (skipped rows are duplicates already in the queue).
  var result;
  try {
    result = JSON.parse(responseBody);
  } catch (parseError) {
    var parseMsg = "Failed to parse response: " + parseError.message;
    Logger.log(parseMsg);
    markAllRowsError_(sheet, pendingRows, idx, parseMsg);
    logSyncResult_(ss, pendingRows.length, 0, pendingRows.length, new Date().getTime() - startTime, parseMsg);
    return;
  }

  var insertedCount = Number(result.insertedCount || 0);
  var skippedCount = Number(result.skippedCount || 0);
  var now = new Date();
  var syncStatusCol = idx["syncStatus"] + 1;     // 1-indexed
  var syncTimestampCol = idx["syncTimestamp"] + 1;
  var syncErrorCol = idx["syncError"] + 1;

  // Mark every submitted row as queued for HITL review.
  pendingRows.forEach(function(entry) {
    var sheetRow = entry.rowIndex + 2; // +2 because data starts at row 2, index is 0-based
    sheet.getRange(sheetRow, syncStatusCol).setValue("queued").setFontColor("#4caf50");
    sheet.getRange(sheetRow, syncTimestampCol).setValue(now);
    sheet.getRange(sheetRow, syncErrorCol).setValue("");
  });

  var duration = new Date().getTime() - startTime;
  Logger.log(
    "Submission complete: " + insertedCount + " queued, " +
    skippedCount + " skipped/duplicate (" + duration + "ms)"
  );

  logSyncResult_(
    ss, pendingRows.length, insertedCount, skippedCount, duration,
    skippedCount > 0 ? skippedCount + " skipped (duplicates already in queue)" : ""
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks all rows in the batch as "error" with the given message.
 * @param {SpreadsheetApp.Sheet} sheet
 * @param {Array} rows
 * @param {Object} idx - Header index map
 * @param {string} errorMsg
 * @private
 */
function markAllRowsError_(sheet, rows, idx, errorMsg) {
  var now = new Date();
  var syncStatusCol = idx["syncStatus"] + 1;
  var syncTimestampCol = idx["syncTimestamp"] + 1;
  var syncErrorCol = idx["syncError"] + 1;

  rows.forEach(function(entry) {
    var sheetRow = entry.rowIndex + 2;
    sheet.getRange(sheetRow, syncStatusCol).setValue("error").setFontColor("#f44336");
    sheet.getRange(sheetRow, syncTimestampCol).setValue(now);
    sheet.getRange(sheetRow, syncErrorCol).setValue(errorMsg);
  });
}

/**
 * Appends a row to the SYNC_LOG tab.
 * @param {SpreadsheetApp.Spreadsheet} ss
 * @param {number} batchSize
 * @param {number} succeededCount
 * @param {number} failedCount
 * @param {number} durationMs
 * @param {string} errorDetails
 * @private
 */
function logSyncResult_(ss, batchSize, succeededCount, failedCount, durationMs, errorDetails) {
  var logSheet = ss.getSheetByName(SYNC_LOG_TAB_NAME);
  if (!logSheet) return;

  logSheet.appendRow([
    new Date(),
    batchSize,
    succeededCount,
    failedCount,
    durationMs,
    errorDetails || "",
  ]);
}
