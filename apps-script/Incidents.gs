// ══════════════════════════════════════════════════════════════
// Flux Thermal Lounge — Alcohol Service Incident Reporting
//
// SEPARATE from the water-testing script (Code.gs) on purpose:
//  - separate Spreadsheet, so Sheet-level sharing can be tighter
//    (incident records contain guest information; pool readings
//    do not, and the two shouldn't share an access list)
//  - WRITE-ONLY: there is deliberately no GET action that returns
//    incident data. The deployment URL ships inside public JS on
//    flux-lounge.com/service, so anything this script will hand
//    back is readable by anyone who finds that URL. Incidents are
//    read in the Spreadsheet itself, behind real Google auth.
//  - APPEND-ONLY: no edit and no delete action. An incident record
//    that can be quietly revised after the fact is worth less than
//    one that can't. Corrections are filed as a new linked report.
//
// Deploy: Execute as = Me, Who has access = Anyone.
// ══════════════════════════════════════════════════════════════

const INCIDENT_SPREADSHEET_ID = 'PASTE_NEW_SPREADSHEET_ID_HERE';
const INCIDENT_SHEET_NAME     = 'Incidents';

// Immediate notification on submit. An incident report nobody reads
// until someone opens a Sheet is a filing cabinet, not an alert.
// hello@ reaches both managers (Dini and Mark); the form also tells the
// host to notify one of them directly for severe incidents.
const NOTIFY_EMAIL   = 'hello@flux-lounge.com';
const NOTIFY_ENABLED = true;

const BACKEND_VERSION = '2026-07-23-incidents-v1';

const COLUMNS = [
  'Timestamp',
  'Incident ID',
  'Submission ID',
  'Incident Date',
  'Incident Time',
  'Reported By',
  'Other Staff Present',
  'Incident Type',
  'Location',
  'Guest Description',
  'Guest Name',
  'ID Checked',
  'ID Type',
  'ID Issue',
  'Signs Observed',
  'Drinks Served',
  'Service Period',
  'Narrative',
  'Actions Taken',
  'Transportation',
  'Manager Notified',
  'Manager Notified At',
  'Police / EMS',
  'Police / EMS Detail',
  'Follow-Up Needed',
  'Corrects Incident ID',
  'Backend Version',
];

// ─── ROUTING ─────────────────────────────────────────────────

function doGet(e) {
  // No read actions by design — see header comment.
  return jsonResponse({
    success: false,
    error: 'This endpoint does not serve incident data.',
    version: BACKEND_VERSION,
  });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.action === 'saveIncident') return saveIncident(data);
    return jsonResponse({ success: false, error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─── SAVE INCIDENT ───────────────────────────────────────────

function saveIncident(data) {
  const required = ['incident_date', 'incident_time', 'reported_by',
                    'incident_type', 'location', 'narrative', 'actions_taken'];
  const missing = required.filter(function(k) {
    return !String(data[k] || '').trim();
  });
  if (missing.length) {
    return jsonResponse({
      success: false,
      error: 'Missing required field(s): ' + missing.join(', '),
    });
  }

  const ss    = SpreadsheetApp.openById(INCIDENT_SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  let incidentId;
  try {
    // Idempotency. Safari throws on the Apps Script POST redirect even
    // when the write succeeded, so the client retries with the same
    // submission_id. Without this, that retry files the incident twice.
    const existing = findBySubmissionId(sheet, data.submission_id);
    if (existing) {
      return jsonResponse({
        success:     true,
        incident_id: existing,
        duplicate:   true,
        version:     BACKEND_VERSION,
      });
    }

    incidentId = nextIncidentId(sheet, data.incident_date);

    const row = {
      'Timestamp':             new Date(),
      'Incident ID':           incidentId,
      'Submission ID':         data.submission_id || '',
      'Incident Date':         data.incident_date,
      'Incident Time':         data.incident_time,
      'Reported By':           data.reported_by,
      'Other Staff Present':   data.other_staff        || '',
      'Incident Type':         data.incident_type,
      'Location':              data.location,
      'Guest Description':     data.guest_description  || '',
      'Guest Name':            data.guest_name         || '',
      'ID Checked':            data.id_checked         || '',
      'ID Type':               data.id_type            || '',
      'ID Issue':              data.id_issue           || '',
      'Signs Observed':        data.signs_observed     || '',
      'Drinks Served':         data.drinks_served      || '',
      'Service Period':        data.service_period     || '',
      'Narrative':             data.narrative,
      'Actions Taken':         data.actions_taken,
      'Transportation':        data.transportation     || '',
      'Manager Notified':      data.manager_notified   || '',
      'Manager Notified At':   data.manager_notified_at|| '',
      'Police / EMS':          data.police_ems         || '',
      'Police / EMS Detail':   data.police_ems_detail  || '',
      'Follow-Up Needed':      data.follow_up          || '',
      'Corrects Incident ID':  data.corrects           || '',
      'Backend Version':       BACKEND_VERSION,
    };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
                         .getValues()[0];
    const values  = headers.map(function(h) {
      return row.hasOwnProperty(h) ? row[h] : '';
    });

    sheet.appendRow(values);
  } finally {
    lock.releaseLock();
  }

  if (NOTIFY_ENABLED) {
    try {
      notify(incidentId, data);
    } catch (err) {
      // A failed notification must never fail the save — the record
      // is already committed and that's the part that matters.
      console.error('Notification failed for ' + incidentId + ': ' + err.message);
    }
  }

  return jsonResponse({
    success:     true,
    incident_id: incidentId,
    version:     BACKEND_VERSION,
  });
}

// ─── SHEET SETUP ─────────────────────────────────────────────

function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(INCIDENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(INCIDENT_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNS);
    sheet.getRange(1, 1, 1, COLUMNS.length)
         .setFontWeight('bold')
         .setBackground('#004a79')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    // Free-text columns as plain text so a narrative starting with
    // -, +, = or @ isn't parsed as a formula.
    ['Guest Description', 'Guest Name', 'Narrative', 'Actions Taken',
     'Transportation', 'Police / EMS Detail', 'Follow-Up Needed',
     'Signs Observed', 'Other Staff Present', 'ID Issue']
      .forEach(function(name) {
        const idx = COLUMNS.indexOf(name);
        if (idx >= 0) sheet.getRange(2, idx + 1, sheet.getMaxRows() - 1, 1)
                           .setNumberFormat('@');
      });
  }
  return sheet;
}

// ─── IDEMPOTENCY ─────────────────────────────────────────────
// Returns the Incident ID already filed under this submission_id,
// or null. Lets the client retry a POST safely.

function findBySubmissionId(sheet, submissionId) {
  const sid = String(submissionId || '').trim();
  if (!sid) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const sidCol = COLUMNS.indexOf('Submission ID') + 1;
  const idCol  = COLUMNS.indexOf('Incident ID')   + 1;
  const rows   = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][sidCol - 1]).trim() === sid) {
      return String(rows[i][idCol - 1]);
    }
  }
  return null;
}

// ─── INCIDENT ID ─────────────────────────────────────────────
// INC-YYYYMMDD-NN, sequential within the incident's own date.

function nextIncidentId(sheet, incidentDate) {
  const datePart = String(incidentDate).replace(/-/g, '');
  const prefix   = 'INC-' + datePart + '-';

  const lastRow = sheet.getLastRow();
  let maxSeq = 0;
  if (lastRow > 1) {
    const idCol = COLUMNS.indexOf('Incident ID') + 1;
    const ids   = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    ids.forEach(function(r) {
      const id = String(r[0] || '');
      if (id.indexOf(prefix) === 0) {
        const seq = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
      }
    });
  }
  const next = maxSeq + 1;
  return prefix + (next < 10 ? '0' + next : String(next));
}

// ─── NOTIFICATION ────────────────────────────────────────────

function notify(incidentId, data) {
  const urgent = /police|ems|removed|medical|injur/i.test(
    String(data.incident_type) + ' ' +
    String(data.actions_taken) + ' ' +
    String(data.police_ems)
  );

  const subject = (urgent ? '[URGENT] ' : '') +
                  'Incident report ' + incidentId + ' — ' + data.incident_type;

  const lines = [
    'Incident ID:   ' + incidentId,
    'When:          ' + data.incident_date + ' at ' + data.incident_time,
    'Reported by:   ' + data.reported_by,
    'Type:          ' + data.incident_type,
    'Location:      ' + data.location,
    '',
    'NARRATIVE',
    data.narrative,
    '',
    'ACTIONS TAKEN',
    data.actions_taken,
  ];

  if (data.transportation)   lines.push('', 'TRANSPORTATION', data.transportation);
  if (data.police_ems)       lines.push('', 'POLICE / EMS', data.police_ems +
                                        (data.police_ems_detail ? ' — ' + data.police_ems_detail : ''));
  if (data.manager_notified) lines.push('', 'MANAGER NOTIFIED', data.manager_notified +
                                        (data.manager_notified_at ? ' at ' + data.manager_notified_at : ''));
  if (data.follow_up)        lines.push('', 'FOLLOW-UP NEEDED', data.follow_up);

  lines.push('', '—', 'Full record: ' +
             SpreadsheetApp.openById(INCIDENT_SPREADSHEET_ID).getUrl());

  MailApp.sendEmail({
    to:      NOTIFY_EMAIL,
    subject: subject,
    body:    lines.join('\n'),
  });
}

// ─── UTIL ────────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── SETUP HELPER ────────────────────────────────────────────
// Run once from the Apps Script editor after pasting the
// Spreadsheet ID above. Creates the Incidents tab and headers.

function setupIncidentSheet() {
  const ss = SpreadsheetApp.openById(INCIDENT_SPREADSHEET_ID);
  getOrCreateSheet(ss);
  Logger.log('Incidents sheet ready: ' + ss.getUrl());
}
