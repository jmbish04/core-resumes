/**
 * ============================================================================
 * Trigger.gs — Installable trigger management
 * ============================================================================
 *
 * Creates an onChange trigger that fires when Gemini appends new rows to the
 * DROPBOX sheet. The trigger delegates to syncNewRows() in Sync.gs.
 *
 * Run once from the Script Editor: Trigger > installOnChangeTrigger
 */

/**
 * Installs an onChange trigger on the active spreadsheet (no UI).
 *
 * Uses onChange (not onEdit) because Gemini's scheduled job writes via the
 * Sheets API, which does NOT fire simple/installable onEdit triggers.
 * onChange fires on any structural change, including API-driven appends.
 *
 * Idempotent: removes any existing dropbox triggers before creating a new one.
 * @private
 */
function installOnChangeTrigger_() {
  // Remove existing triggers to avoid duplicates
  removeDropboxTriggers_();

  ScriptApp.newTrigger("onSheetChange")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();

  Logger.log("✅ onChange trigger installed. Fires on new rows appended to DROPBOX.");
}

/**
 * Installs the onChange trigger and shows a confirmation dialog.
 *
 * Run once from the Script Editor: Trigger > installOnChangeTrigger
 * (createDropboxSheet() also installs this trigger automatically.)
 */
function installOnChangeTrigger() {
  installOnChangeTrigger_();
  SpreadsheetApp.getUi().alert(
    "✅ Trigger installed!\n\n" +
    "Whenever a new row is appended to the DROPBOX tab, the script submits it " +
    "to the core-resumes role queue for HITL review."
  );
}

/**
 * Removes all project triggers that call onSheetChange.
 */
function removeDropboxTriggers() {
  removeDropboxTriggers_();
  SpreadsheetApp.getUi().alert("All DROPBOX sync triggers have been removed.");
}

/**
 * @private
 */
function removeDropboxTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "onSheetChange") {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Removed existing trigger: " + trigger.getUniqueId());
    }
  });
}

/**
 * Entry point for the onChange trigger.
 *
 * Filters for changes on the DROPBOX tab and delegates to syncNewRows().
 * Guards against re-entrant execution via Lock Service.
 *
 * @param {Object} e - The onChange event object.
 */
function onSheetChange(e) {
  // Only react to EDIT or INSERT_ROW change types
  if (e && e.changeType && e.changeType !== "EDIT" && e.changeType !== "INSERT_ROW" && e.changeType !== "OTHER") {
    Logger.log("Ignoring change type: " + e.changeType);
    return;
  }

  // Acquire a lock to prevent concurrent sync runs
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(5000); // Wait up to 5 seconds
  if (!acquired) {
    Logger.log("Another sync is already running. Skipping.");
    return;
  }

  try {
    syncNewRows();
  } catch (err) {
    Logger.log("Sync error: " + err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manual trigger for testing — run from the Script Editor.
 * Calls syncNewRows() directly without event filtering.
 */
function manualSync() {
  syncNewRows();
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily AGENTS.md skill refresh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Installs a daily time-based trigger that refreshes the AGENTS.md skill tab
 * from the Worker, so Gemini always reads current targeting criteria before
 * its scheduled scrape. Fires once per day around 06:00.
 *
 * Idempotent: removes any existing refresh triggers before creating a new one.
 * @private
 */
function installDailyAgentsRefreshTrigger_() {
  removeAgentsRefreshTriggers_();

  ScriptApp.newTrigger("onDailyAgentsRefresh")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log("✅ Daily AGENTS.md refresh trigger installed (runs ~06:00).");
}

/**
 * Installs the daily AGENTS.md refresh trigger and shows a confirmation dialog.
 * Run once from the Script Editor: Trigger > installDailyAgentsRefreshTrigger
 * (createDropboxSheet() also installs this trigger automatically.)
 */
function installDailyAgentsRefreshTrigger() {
  installDailyAgentsRefreshTrigger_();
  SpreadsheetApp.getUi().alert(
    "✅ Daily refresh installed!\n\n" +
    "The AGENTS.md skill tab will refresh from the Worker once per day so the " +
    "scraping agent always sees current targeting criteria."
  );
}

/**
 * Removes all project triggers that call onDailyAgentsRefresh.
 * @private
 */
function removeAgentsRefreshTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "onDailyAgentsRefresh") {
      ScriptApp.deleteTrigger(trigger);
      Logger.log("Removed existing AGENTS.md refresh trigger: " + trigger.getUniqueId());
    }
  });
}

/**
 * Entry point for the daily time-based trigger.
 *
 * Runs WITHOUT a UI context (time-based triggers have no active user), so it
 * must never call SpreadsheetApp.getUi(). Delegates to refreshAgentsSkill_().
 */
function onDailyAgentsRefresh() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    var ok = refreshAgentsSkill_(ss);
    Logger.log(ok
      ? "Daily AGENTS.md refresh: updated from Worker."
      : "Daily AGENTS.md refresh: Worker unavailable; kept existing content.");
  } catch (err) {
    Logger.log("Daily AGENTS.md refresh error: " + err.message);
  }
}
