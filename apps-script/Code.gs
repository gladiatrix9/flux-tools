// ══════════════════════════════════════════════════════════════
// Flux Thermal Lounge — Water Testing Apps Script
// Sheets: Daily Log | Weekly Parameters | Pool State
//
// Sheet roles:
//  - Daily Log:        append-only audit trail of every test (unchanged
//                       behavior, plus a new "Pool ID" column).
//  - Weekly Parameters: canonical record of Lucid's CH/TDS readings,
//                       written ONLY by saveWeeklyParams (Weekly
//                       Parameters tab). Never touched by daily saves.
//  - Pool State:       the CH/TDS values currently in effect for LSI
//                       calc / pre-fill on the Log Results tab. Updated
//                       automatically whenever Weekly Parameters is
//                       saved, and also when a host manually overrides
//                       a pool's CH/TDS during a daily test.
// ══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1gWzJGFsXRmOqy2qn7VBKR4PYAmmszNK0sT42EtAOshE';
const SUMMARY_EMAIL  = 'hello@flux-lounge.com';

// Free-text fields (e.g. "action taken") are typed by staff and can start
// with =, +, -, or @ — Sheets treats any of those as the start of a
// formula and throws "Formula parse error" instead of storing the text.
// A leading apostrophe forces the cell to be stored as plain text.
function asPlainText(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

// Bump this whenever Code.gs is redeployed — every JSON response includes
// it, so the front end (and you, via the browser console) can confirm the
// live deployment is actually running this version.
const BACKEND_VERSION = '2026-06-19-poolstate-v2';

const POOL_LABELS = {
  'sl-hot':  'Social Lounge — Hot Soak',
  'sl-cold': 'Social Lounge — Cold Plunge',
  'eq-hot':  'Equinox — Hot Soak',
  'eq-cold': 'Equinox — Cold Plunge',
  'so-hot':  'Solstice — Hot Soak',
  'so-cold': 'Solstice — Cold Plunge',
};

// ─── DERIVE POOL_ID FROM ROOM + POOL TYPE ──────────────────
// Fallback for rows that don't have a "Pool ID" column value yet
// (historical rows). New rows write Pool ID directly — see saveDailyLog.

function derivePoolId(room, poolType) {
  const r = String(room     || '').trim().toLowerCase();
  const p = String(poolType || '').trim().toLowerCase();
  let prefix;
  if      (r.includes('social')) prefix = 'sl';
  else if (r.includes('equinox')) prefix = 'eq';
  else if (r.includes('solstice')) prefix = 'so';
  else return null;
  const suffix = p.includes('cold') ? 'cold' : 'hot';
  return prefix + '-' + suffix;
}

// ─── ROUTING ─────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action;
  if (action === 'getWeeklyParams')  return getWeeklyParams();
  if (action === 'getPoolState')     return getPoolState();
  if (action === 'getTodayStatus')   return getTodayStatus();
  return jsonResponse({ success: false, error: 'Unknown GET action' });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    if (action === 'saveWeeklyParams') return saveWeeklyParams(data);
    if (action === 'sendDailySummary') return sendDailySummary(data);

    // Default: daily pool log save
    return saveDailyLog(data);

  } catch(err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── GET: TODAY'S STATUS ─────────────────────────────────────
// Returns which pools have been saved today and their latest readings.
// Used on page load so the front end can restore summary state after refresh.

function getTodayStatus() {
  const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName('Daily Log');
  if (!logSheet) return jsonResponse({ success: false, error: 'Daily Log sheet not found' });

  const tz      = Session.getScriptTimeZone();
  const today   = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const allData = logSheet.getDataRange().getValues();
  const header  = allData[0].map(h => String(h).trim().toLowerCase());

  const colPid     = header.indexOf('pool id');
  const colRoom    = header.indexOf('room');
  const colPool    = header.indexOf('pool');          // "Pool" column (HOT / COLD)
  const colSavedAt = header.indexOf('saved at');      // full timestamp, e.g. "6/3/2026, 10:23:21 AM"

  // Fallback: if "saved at" not found by that exact name, try the last column
  const tsCol = colSavedAt >= 0 ? colSavedAt : header.length - 1;

  // Build a map of pool_id → latest row for today (last write wins)
  const byPool = {};
  allData.slice(1).forEach(function(row) {
    // Extract date from the Saved At cell. It may be a Date object or a string.
    const rawTs = row[tsCol];
    let rowDate = '';
    if (rawTs instanceof Date) {
      rowDate = Utilities.formatDate(rawTs, tz, 'yyyy-MM-dd');
    } else {
      // String like "6/3/2026, 10:23:21 AM" — parse to Date then format
      const parsed = new Date(rawTs);
      rowDate = isNaN(parsed.getTime())
        ? String(rawTs).substring(0, 10)
        : Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
    }
    if (rowDate !== today) return;

    // Prefer the "Pool ID" column (new rows); fall back to deriving it
    // from Room + Pool for older rows that don't have it.
    let pid = colPid >= 0 ? String(row[colPid] || '').trim() : '';
    if (!pid) {
      pid = derivePoolId(
        colRoom >= 0 ? row[colRoom] : '',
        colPool >= 0 ? row[colPool] : ''
      );
    }
    if (pid) byPool[pid] = row; // overwrite — last row for the day is latest
  });

  // Build response: pool_id → { saved: bool, readings: {} }
  const pools = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];
  const status = {};

  function v(row, colName) {
    const i = header.indexOf(colName);
    return i >= 0 ? String(row[i] || '').trim() : '';
  }

  pools.forEach(function(pid) {
    const row = byPool[pid];
    if (!row) { status[pid] = { saved: false }; return; }
    status[pid] = {
      saved:        true,
      temp:         v(row, 'temp (°f)'),
      free_ppm:     v(row, 'free cl — ppm'),
      combined_ppm: v(row, 'combined cl — ppm'),
      ph:           v(row, 'ph'),
      alk_ppm:      v(row, 'alkalinity — ppm'),
      orp:          v(row, 'orp (mv)'),
      lsi:          v(row, 'lsi'),
      status:       v(row, 'pool status'),
    };
  });

  return jsonResponse({ success: true, today, status });
}

// ─── GET: WEEKLY PARAMETERS ──────────────────────────────────
// Returns the latest CH, TDS, and last-updated date for each pool from
// the "Weekly Parameters" sheet — i.e. what's currently on file from
// Lucid's most recent visit. Written only by saveWeeklyParams.

function getWeeklyParams() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet  = ss.getSheetByName('Weekly Parameters');
  if (!sheet) return jsonResponse({ success: false, error: 'Weekly Parameters sheet not found' });

  const data   = sheet.getDataRange().getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase());

  const pidCol = header.indexOf('pool id');
  const caCol  = header.indexOf('calcium hardness (ppm)');
  const tdsCol = header.indexOf('tds (ppm)');
  const updCol = header.indexOf('last updated');

  if (pidCol < 0 || caCol < 0 || tdsCol < 0) {
    return jsonResponse({ success: false, error: 'Column missing in Weekly Parameters' });
  }

  const params = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const pid = String(row[pidCol]).trim();
    if (!pid) continue;
    params[pid] = {
      calcium: row[caCol]  || '',
      tds:     row[tdsCol] || '',
      updated: updCol >= 0 ? String(row[updCol] || '').trim() : '',
    };
  }

  return jsonResponse({ success: true, params });
}

// ─── GET: POOL STATE ──────────────────────────────────────────
// Returns the CH/TDS values currently in effect for each pool — used to
// pre-fill the Log Results page (LSI calc) and to detect discrepancies
// against Weekly Parameters.

function getPoolState() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Pool State');
  if (!sheet) return jsonResponse({ success: false, error: 'Pool State sheet not found' });

  const data   = sheet.getDataRange().getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase());

  const pidCol = header.indexOf('pool id');
  const caCol  = header.indexOf('calcium hardness (ppm)');
  const tdsCol = header.indexOf('tds (ppm)');
  const updCol = header.indexOf('updated');
  const srcCol = header.indexOf('source');

  if (pidCol < 0 || caCol < 0 || tdsCol < 0) {
    return jsonResponse({ success: false, error: 'Column missing in Pool State' });
  }

  const params = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const pid = String(row[pidCol]).trim();
    if (!pid) continue;
    params[pid] = {
      calcium: row[caCol]  || '',
      tds:     row[tdsCol] || '',
      updated: updCol >= 0 ? String(row[updCol] || '').trim() : '',
      source:  srcCol >= 0 ? String(row[srcCol] || '').trim() : '',
    };
  }

  return jsonResponse({ success: true, params });
}

// ─── HELPER: READ A SINGLE POOL STATE ROW ───────────────────
// Used by saveDailyLog to compare an incoming CH/TDS value against
// what's currently on file, so we only update Pool State when a host
// actually changes the value (not on routine carried-forward saves).

function getPoolStateRow(ss, poolId) {
  const sheet = ss.getSheetByName('Pool State');
  if (!sheet) return null;

  const data   = sheet.getDataRange().getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase());
  const pidCol = header.indexOf('pool id');
  const caCol  = header.indexOf('calcium hardness (ppm)');
  const tdsCol = header.indexOf('tds (ppm)');
  if (pidCol < 0) return null;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]).trim() === poolId) {
      return {
        calcium: caCol  >= 0 ? data[i][caCol]  : '',
        tds:     tdsCol >= 0 ? data[i][tdsCol] : '',
      };
    }
  }
  return null;
}

// ─── POST: SAVE DAILY LOG ────────────────────────────────────
// Appends one row to "Daily Log". Does NOT touch Weekly Parameters.
// Only updates Pool State if the submitted CH/TDS differs from what's
// currently on file (i.e. a host manually corrected the value during
// this test) — routine saves that just carry forward the existing
// value leave Pool State untouched.

function saveDailyLog(data) {
  const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName('Daily Log');
  if (!logSheet) return jsonResponse({ success: false, error: 'Daily Log sheet not found' });

  const now = new Date();
  const ts  = Utilities.formatDate(now, Session.getScriptTimeZone(), 'M/d/yyyy, h:mm:ss a');

  // Build the row dynamically based on the sheet's header row, so adding
  // or reordering columns (e.g. "Pool ID") doesn't silently misalign data.
  const header = logSheet.getDataRange().getValues()[0].map(h => String(h).trim().toLowerCase());
  const row = new Array(header.length).fill('');

  function setCol(names, value) {
    for (let n = 0; n < names.length; n++) {
      const idx = header.indexOf(names[n]);
      if (idx >= 0) { row[idx] = value; return; }
    }
  }

  setCol(['recorded by'],            data.staff               || '');
  setCol(['room'],                   data.room                || '');
  setCol(['pool'],                   data.pool_type           || '');
  setCol(['volume (gal)'],           data.volume              || '');
  setCol(['temp (°f)'],              data.temp                || '');
  setCol(['free cl — drops'],        data.free_drops          || '');
  setCol(['free cl — ppm'],          data.free_ppm            || '');
  setCol(['combined cl — drops'],    data.combined_drops      || '');
  setCol(['combined cl — ppm'],      data.combined_ppm        || '');
  setCol(['ph'],                     data.ph                  || '');
  setCol(['alkalinity — drops'],     data.alk_drops           || '');
  setCol(['alkalinity — ppm'],       data.alk_ppm             || '');
  setCol(['orp (mv)'],               data.orp                 || '');
  setCol(['calcium hardness (ppm)'], data.calcium             || '');
  setCol(['tds (ppm)'],              data.tds                 || '');
  setCol(['lsi'],                    data.lsi                 || '');
  setCol(['pool status'],            data.status              || '');
  setCol(['recommended action'],     asPlainText(data.recommended_action  || ''));
  setCol(['action taken'],           asPlainText(data.action_taken        || ''));
  setCol(['pool id'],                data.pool_id             || '');
  setCol(['saved at'],               ts);

  logSheet.appendRow(row);

  // ── Pool State: only write if this changes the on-file CH/TDS.
  if (data.pool_id && (data.calcium || data.tds)) {
    const current = getPoolStateRow(ss, data.pool_id);
    const newCa  = data.calcium ? String(data.calcium) : '';
    const newTds = data.tds     ? String(data.tds)     : '';
    const curCa  = current ? String(current.calcium || '') : '';
    const curTds = current ? String(current.tds     || '') : '';
    const changed = (newCa && newCa !== curCa) || (newTds && newTds !== curTds);
    if (changed) {
      updatePoolState(ss, data.pool_id, data.calcium, data.tds, ts, 'daily-override');
    }
  }

  return jsonResponse({ success: true });
}

// ─── POST: SAVE WEEKLY PARAMS ────────────────────────────────
// Updates "Weekly Parameters" (the canonical Lucid record) and pushes
// the same values into "Pool State" so they take effect immediately.

function saveWeeklyParams(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const entries = data.entries || [];
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy, h:mm:ss a');

  entries.forEach(function(entry) {
    if (entry.pool_id) {
      updateWeeklyParams(ss, entry.pool_id, entry.calcium, entry.tds, ts);
      updatePoolState(ss, entry.pool_id, entry.calcium, entry.tds, ts, 'weekly');
    }
  });

  return jsonResponse({ success: true });
}

// ─── HELPER: UPDATE WEEKLY PARAMETERS ───────────────────────
// Writes to the "Weekly Parameters" sheet. Called only from
// saveWeeklyParams — never from saveDailyLog.

function updateWeeklyParams(ss, poolId, calcium, tds, tsStr) {
  const sheet = ss.getSheetByName('Weekly Parameters');
  if (!sheet) return;

  const data   = sheet.getDataRange().getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase());

  const pidCol = header.indexOf('pool id');
  const caCol  = header.indexOf('calcium hardness (ppm)');
  const tdsCol = header.indexOf('tds (ppm)');
  const updCol = header.indexOf('last updated');

  if (pidCol < 0) return;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]).trim() === poolId) {
      const row = i + 1; // 1-indexed
      if (caCol  >= 0 && calcium) sheet.getRange(row, caCol  + 1).setValue(calcium);
      if (tdsCol >= 0 && tds)     sheet.getRange(row, tdsCol + 1).setValue(tds);
      if (updCol >= 0)             sheet.getRange(row, updCol + 1).setValue(tsStr);
      return;
    }
  }

  // Pool not found — append a new row
  const newRow = new Array(header.length).fill('');
  newRow[pidCol] = poolId;
  if (caCol  >= 0 && calcium) newRow[caCol]  = calcium;
  if (tdsCol >= 0 && tds)     newRow[tdsCol] = tds;
  if (updCol >= 0)             newRow[updCol] = tsStr;
  sheet.appendRow(newRow);
}

// ─── HELPER: UPDATE POOL STATE ───────────────────────────────
// Writes to the "Pool State" sheet. Called from saveWeeklyParams
// (source: 'weekly') and from saveDailyLog when a host changes a
// pool's CH/TDS during a test (source: 'daily-override').

function updatePoolState(ss, poolId, calcium, tds, tsStr, source) {
  const sheet = ss.getSheetByName('Pool State');
  if (!sheet) return;

  const data   = sheet.getDataRange().getValues();
  const header = data[0].map(h => String(h).trim().toLowerCase());

  const pidCol = header.indexOf('pool id');
  const caCol  = header.indexOf('calcium hardness (ppm)');
  const tdsCol = header.indexOf('tds (ppm)');
  const updCol = header.indexOf('updated');
  const srcCol = header.indexOf('source');

  if (pidCol < 0) return;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][pidCol]).trim() === poolId) {
      const row = i + 1; // 1-indexed
      if (caCol  >= 0 && calcium) sheet.getRange(row, caCol  + 1).setValue(calcium);
      if (tdsCol >= 0 && tds)     sheet.getRange(row, tdsCol + 1).setValue(tds);
      if (updCol >= 0)             sheet.getRange(row, updCol + 1).setValue(tsStr);
      if (srcCol >= 0)             sheet.getRange(row, srcCol + 1).setValue(source || '');
      return;
    }
  }

  // Pool not found — append a new row
  const newRow = new Array(header.length).fill('');
  newRow[pidCol] = poolId;
  if (caCol  >= 0 && calcium) newRow[caCol]  = calcium;
  if (tdsCol >= 0 && tds)     newRow[tdsCol] = tds;
  if (updCol >= 0)             newRow[updCol] = tsStr;
  if (srcCol >= 0)             newRow[srcCol] = source || '';
  sheet.appendRow(newRow);
}

// ─── POST: SEND DAILY SUMMARY EMAIL ─────────────────────────
// Reads today's rows from Daily Log, formats a summary email,
// and sends it to hello@flux-lounge.com.

function sendDailySummary(data) {
  const ss       = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName('Daily Log');
  if (!logSheet) return jsonResponse({ success: false, error: 'Daily Log sheet not found' });

  const tz      = Session.getScriptTimeZone();
  const today   = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const allData = logSheet.getDataRange().getValues();
  const header  = allData[0].map(h => String(h).trim().toLowerCase());

  const colPid  = header.indexOf('pool id');
  const colRoom = header.indexOf('room');
  const colPool = header.indexOf('pool');
  const tsCol   = header.indexOf('saved at') >= 0 ? header.indexOf('saved at') : header.length - 1;

  // Collect today's rows, deriving pool_id as we go
  const byPool = {};
  allData.slice(1).forEach(function(row) {
    const rawTs = row[tsCol];
    let rowDate = '';
    if (rawTs instanceof Date) {
      rowDate = Utilities.formatDate(rawTs, tz, 'yyyy-MM-dd');
    } else {
      const parsed = new Date(rawTs);
      rowDate = isNaN(parsed.getTime())
        ? String(rawTs).substring(0, 10)
        : Utilities.formatDate(parsed, tz, 'yyyy-MM-dd');
    }
    if (rowDate !== today) return;

    let pid = colPid >= 0 ? String(row[colPid] || '').trim() : '';
    if (!pid) {
      pid = derivePoolId(
        colRoom >= 0 ? row[colRoom] : '',
        colPool >= 0 ? row[colPool] : ''
      );
    }
    if (pid) byPool[pid] = row;
  });

  const staff     = data.staff || 'Host';
  const dateLabel = Utilities.formatDate(new Date(), tz, 'MMMM d, yyyy');

  // Helper to get a value by column name
  function val(row, colName) {
    const i = header.indexOf(colName);
    return i >= 0 ? String(row[i] || '').trim() : '—';
  }

  // Build plain-text and HTML versions
  const poolOrder = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];
  let bodyHtml = '';
  let bodyText = '';

  poolOrder.forEach(function(pid) {
    const label = POOL_LABELS[pid] || pid;
    const row   = byPool[pid];

    if (!row) {
      bodyHtml += `<tr><td colspan="2" style="padding:8px 12px;color:#888;font-size:13px;">
        <strong>${label}</strong> — not logged today</td></tr>`;
      bodyText += `\n${label}\n  Not logged today\n`;
      return;
    }

    const temp    = val(row, 'temp (°f)');
    const fcPpm   = val(row, 'free cl — ppm');
    const ccPpm   = val(row, 'combined cl — ppm');
    const ph      = val(row, 'ph');
    const alkPpm  = val(row, 'alkalinity — ppm');
    const orp     = val(row, 'orp (mv)');
    const calcium = val(row, 'calcium hardness (ppm)');
    const tds     = val(row, 'tds (ppm)');
    const lsi     = val(row, 'lsi');
    const status  = val(row, 'pool status');
    const recAct  = val(row, 'recommended action');
    const actTkn  = val(row, 'action taken');

    const statusColor = status.includes('attention') ? '#c0282e'
                      : status.includes('adjustment') ? '#b85c00'
                      : '#006b5b';

    bodyHtml += `
      <tr><td colspan="2" style="padding:12px 12px 4px;background:#f5ede6;">
        <strong style="font-size:14px;">${label}</strong>
        <span style="float:right;color:${statusColor};font-size:12px;font-weight:600;">${status}</span>
      </td></tr>
      <tr>
        <td style="padding:4px 12px;font-size:13px;color:#555;width:50%;vertical-align:top;">
          Temp: ${temp} °F<br>
          FC: ${fcPpm} ppm<br>
          CC: ${ccPpm} ppm<br>
          pH: ${ph}<br>
          TA: ${alkPpm} ppm<br>
          ORP: ${orp} mV<br>
          CH: ${calcium} ppm &nbsp;·&nbsp; TDS: ${tds} ppm<br>
          LSI: ${lsi}
        </td>
        <td style="padding:4px 12px;font-size:13px;color:#555;vertical-align:top;">
          ${recAct ? `<strong>Recommended:</strong><br>${recAct}<br><br>` : ''}
          ${actTkn ? `<strong>Action taken:</strong><br>${actTkn}` : '<em style="color:#aaa;">No action noted</em>'}
        </td>
      </tr>
      <tr><td colspan="2" style="padding:0 12px 10px;border-bottom:1px solid #ddd6cc;"></td></tr>`;

    bodyText += `\n${label} — ${status}\n`;
    bodyText += `  Temp ${temp}°F  FC ${fcPpm}  CC ${ccPpm}  pH ${ph}  TA ${alkPpm}  ORP ${orp}  CH ${calcium}  TDS ${tds}  LSI ${lsi}\n`;
    if (recAct) bodyText += `  Recommended: ${recAct}\n`;
    if (actTkn) bodyText += `  Action taken: ${actTkn}\n`;
  });

  const missing = poolOrder.filter(p => !byPool[p]);
  const missingNote = missing.length > 0
    ? `<p style="margin:16px 0 0;color:#b85c00;font-size:13px;">⚠ Not logged today: ${missing.map(p => POOL_LABELS[p]).join(', ')}</p>`
    : '';

  const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:680px;margin:0 auto;color:#1a2331;">
      <div style="background:#004a79;padding:20px 24px;border-radius:10px 10px 0 0;">
        <span style="color:white;font-size:18px;font-weight:600;">Flux Thermal Lounge</span>
        <span style="color:rgba(255,255,255,0.6);font-size:13px;float:right;padding-top:4px;">Daily Water Report</span>
      </div>
      <div style="background:white;padding:16px 24px 8px;border:1px solid #ddd6cc;border-top:none;">
        <p style="margin:0 0 4px;font-size:13px;color:#6b7a8d;">${dateLabel} &nbsp;·&nbsp; Recorded by ${staff}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:white;border:1px solid #ddd6cc;border-top:none;border-radius:0 0 10px 10px;">
        ${bodyHtml}
      </table>
      ${missingNote}
      <p style="margin:20px 0 0;font-size:11px;color:#aaa;">Sent from Flux water testing tool · flux-lounge.com/tools</p>
    </div>`;

  GmailApp.sendEmail(
    SUMMARY_EMAIL,
    `Flux water report — ${dateLabel}`,
    `Daily water report — ${dateLabel}\nRecorded by: ${staff}\n${bodyText}`,
    { htmlBody: html, name: 'Flux Water Testing' }
  );

  return jsonResponse({ success: true });
}

// ─── HELPER ──────────────────────────────────────────────────

function jsonResponse(obj) {
  obj.version = BACKEND_VERSION;
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── DIAGNOSTIC: CHECK SHEET HEADERS ─────────────────────────
// Run this directly from the Apps Script editor to verify both sheets
// are configured correctly. Does NOT write any data.

function testWeeklyParamsSave() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy, h:mm:ss a');

  // ── Check Weekly Parameters sheet ──
  const wpSheet = ss.getSheetByName('Weekly Parameters');
  Logger.log('Weekly Parameters sheet found: ' + !!wpSheet);
  if (wpSheet) {
    const header = wpSheet.getDataRange().getValues()[0].map(h => String(h).trim().toLowerCase());
    Logger.log('Weekly Parameters headers: ' + JSON.stringify(header));
    Logger.log('pool id col: ' + header.indexOf('pool id'));
    Logger.log('calcium col: ' + header.indexOf('calcium hardness (ppm)'));
    Logger.log('tds col: ' + header.indexOf('tds (ppm)'));
    Logger.log('last updated col: ' + header.indexOf('last updated'));
  }

  // ── Check Pool State sheet ──
  const psSheet = ss.getSheetByName('Pool State');
  Logger.log('Pool State sheet found: ' + !!psSheet);
  if (psSheet) {
    const header = psSheet.getDataRange().getValues()[0].map(h => String(h).trim().toLowerCase());
    Logger.log('Pool State headers: ' + JSON.stringify(header));
    Logger.log('pool id col: ' + header.indexOf('pool id'));
    Logger.log('calcium col: ' + header.indexOf('calcium hardness (ppm)'));
    Logger.log('tds col: ' + header.indexOf('tds (ppm)'));
  }
}
