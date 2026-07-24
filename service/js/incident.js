// ══════════════════════════════════════════════════════════════
// Flux — Alcohol Service Incident Report
// ══════════════════════════════════════════════════════════════

const DRAFT_KEY = 'flux-incident-draft';

// Types that mean "go find a manager now, don't wait for this form."
const SEVERE_TYPES = [
  'Medical event',
  'Injury',
  'Guest attempted to drive',
];

const REQUIRED = {
  incident_date:  'Required',
  incident_time:  'Required',
  reported_by:    'Required',
  incident_type:  'Select at least one',
  location:       'Required',
  narrative:      'Required',
  actions_taken:  'Required',
};

// Fields that make up the saved record, in the order they're reviewed.
const TEXT_FIELDS = [
  'incident_date', 'incident_time', 'reported_by', 'other_staff',
  'location', 'guest_description', 'guest_name', 'id_checked',
  'id_type', 'id_issue', 'drinks_served', 'service_period',
  'narrative', 'actions_taken', 'transportation', 'manager_notified',
  'manager_notified_at', 'police_ems', 'police_ems_detail', 'follow_up',
];

// One submission_id per filled-out form. Regenerated after a successful
// file so the next report is a distinct submission.
let submissionId = newSubmissionId();

const $ = id => document.getElementById(id);

// ─── INIT ────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  populateStaff();
  wireOptions();
  wireConditionals();
  wireDraftSaving();

  // restoreDraft sets the draft bar itself when it finds one; with no
  // draft the bar stays empty, which is the correct blank state.
  if (!restoreDraft()) {
    setNow();
  }
  refreshConditionals();
});

function populateStaff() {
  const reporter = $('reported_by');
  STAFF.forEach(function(name) {
    reporter.appendChild(new Option(name, name));
  });
  // Manager dropdown is managers only, not the full staff roster.
  const manager = $('manager_notified');
  MANAGERS.forEach(function(name) {
    manager.appendChild(new Option(name, name));
  });
}

function setNow() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  $('incident_date').value = now.getFullYear() + '-' +
                             pad(now.getMonth() + 1) + '-' +
                             pad(now.getDate());
  $('incident_time').value = pad(now.getHours()) + ':' + pad(now.getMinutes());
}

// ─── CHECKBOX / SELECT BEHAVIOR ──────────────────────────────

function wireOptions() {
  document.querySelectorAll('.opt input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      cb.closest('.opt').classList.toggle('checked', cb.checked);

      // "None observed" is exclusive — it contradicts every other sign.
      if (cb.name === 'signs_observed') {
        const isNone = cb.value === 'None observed';
        document.querySelectorAll('input[name="signs_observed"]').forEach(function(other) {
          if (other === cb) return;
          if (isNone ? cb.checked : (other.value === 'None observed' && cb.checked)) {
            other.checked = false;
            other.closest('.opt').classList.remove('checked');
          }
        });
      }

      if (cb.name === 'incident_type') {
        clearError('incident_type');
        refreshSevereCallout();
      }
      saveDraft();
    });
  });
}

function refreshSevereCallout() {
  const severe = checkedValues('incident_type')
    .some(v => SEVERE_TYPES.indexOf(v) >= 0);
  $('severe-callout').style.display = severe ? 'flex' : 'none';
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked'))
              .map(cb => cb.value);
}

// ─── CONDITIONAL SECTIONS ────────────────────────────────────

function wireConditionals() {
  ['id_checked', 'transportation', 'police_ems'].forEach(function(id) {
    $(id).addEventListener('change', refreshConditionals);
  });
}

function refreshConditionals() {
  const idChecked = $('id_checked').value;
  toggle('id-conditional',
    idChecked === 'Yes — rejected' || idChecked === 'No — guest refused to present');

  toggle('drove-conditional',
    $('transportation').value === 'Drove themselves — we tried to stop them');

  const pe = $('police_ems').value;
  toggle('police-conditional', !!pe && pe !== 'No');
}

function toggle(id, open) {
  $(id).classList.toggle('open', open);
}

// ─── DRAFT PERSISTENCE ───────────────────────────────────────
// Hosts fill this out on a phone mid-shift. A screen lock, a tab
// eviction, or an accidental back-swipe should not cost them a
// half-written narrative.

function wireDraftSaving() {
  TEXT_FIELDS.forEach(function(id) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('input',  saveDraft);
    el.addEventListener('change', saveDraft);
  });
}

function saveDraft() {
  const draft = { submission_id: submissionId, saved_at: Date.now() };
  TEXT_FIELDS.forEach(function(id) {
    const el = $(id);
    if (el) draft[id] = el.value;
  });
  draft.incident_type  = checkedValues('incident_type');
  draft.signs_observed = checkedValues('signs_observed');

  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    updateDraftBar(draft.saved_at);
  } catch (e) {
    // Private browsing, quota — not worth interrupting the host over.
  }
}

function restoreDraft() {
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
  } catch (e) { return false; }
  if (!draft) return false;

  TEXT_FIELDS.forEach(function(id) {
    const el = $(id);
    if (el && draft[id]) el.value = draft[id];
  });
  restoreChecks('incident_type',  draft.incident_type);
  restoreChecks('signs_observed', draft.signs_observed);

  if (draft.submission_id) submissionId = draft.submission_id;

  refreshSevereCallout();
  updateDraftBar(draft.saved_at);
  return true;
}

function restoreChecks(name, values) {
  if (!Array.isArray(values)) return;
  document.querySelectorAll('input[name="' + name + '"]').forEach(function(cb) {
    const on = values.indexOf(cb.value) >= 0;
    cb.checked = on;
    cb.closest('.opt').classList.toggle('checked', on);
  });
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
}

function discardDraft() {
  if (!confirm('Clear this draft and start over? This cannot be undone.')) return;
  clearDraft();
  location.reload();
}

function updateDraftBar(savedAt) {
  const bar = $('draft-bar');
  if (!savedAt) { bar.innerHTML = ''; return; }
  const t = new Date(savedAt).toLocaleTimeString('en-US',
    { hour: 'numeric', minute: '2-digit' });
  bar.innerHTML =
    '<span class="draft-dot"></span>' +
    '<span>Draft saved on this device at ' + t + ' — not yet filed</span>' +
    '<button class="draft-clear" onclick="discardDraft()">Discard draft</button>';
}

// ─── VALIDATION ──────────────────────────────────────────────

function clearError(id) {
  const err = $('err-' + id);
  if (err) err.classList.remove('visible');
  const el = $(id);
  if (el) el.classList.remove('invalid');
}

function showError(id, msg) {
  const err = $('err-' + id);
  if (err) { err.textContent = msg; err.classList.add('visible'); }
  const el = $(id);
  if (el) el.classList.add('invalid');
}

function validate() {
  let firstBad = null;

  Object.keys(REQUIRED).forEach(function(id) {
    clearError(id);

    const empty = (id === 'incident_type')
      ? checkedValues('incident_type').length === 0
      : !String($(id).value || '').trim();

    if (empty) {
      showError(id, REQUIRED[id]);
      if (!firstBad) firstBad = id === 'incident_type' ? $('type-grid') : $(id);
    }
  });

  if (firstBad) {
    firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (firstBad.focus) firstBad.focus({ preventScroll: true });
    return false;
  }
  return true;
}

// ─── REVIEW ──────────────────────────────────────────────────

function collect() {
  const payload = { action: 'saveIncident', submission_id: submissionId };
  TEXT_FIELDS.forEach(function(id) {
    const el = $(id);
    payload[id] = el ? String(el.value || '').trim() : '';
  });
  payload.incident_type  = checkedValues('incident_type').join(' | ');
  payload.signs_observed = checkedValues('signs_observed').join(' | ');
  return payload;
}

const REVIEW_LABELS = [
  ['incident_date',       'Date'],
  ['incident_time',       'Time'],
  ['reported_by',         'Reported by'],
  ['other_staff',         'Others present'],
  ['incident_type',       'Type'],
  ['location',            'Location'],
  ['guest_description',   'Guest'],
  ['guest_name',          'Guest name'],
  ['id_checked',          'ID checked'],
  ['id_type',             'ID type'],
  ['id_issue',            'ID issue'],
  ['signs_observed',      'Signs observed'],
  ['drinks_served',       'Drinks served'],
  ['service_period',      'Over'],
  ['narrative',           'Narrative'],
  ['actions_taken',       'Actions taken'],
  ['transportation',      'Transportation'],
  ['manager_notified',    'Manager notified'],
  ['manager_notified_at', 'Notified at'],
  ['police_ems',          'Police / EMS'],
  ['police_ems_detail',   'Police / EMS detail'],
  ['follow_up',           'Follow-up'],
];

function reviewIncident() {
  if (!validate()) return;

  const data = collect();
  const rows = REVIEW_LABELS
    .filter(pair => data[pair[0]])
    .map(pair => '<dt>' + pair[1] + '</dt><dd>' + escapeHtml(data[pair[0]]) + '</dd>')
    .join('');

  $('confirm-body').innerHTML =
    '<dl>' + rows + '</dl>' +
    '<div class="callout note"><span class="callout-icon">🔒</span><span>' +
    'Filing this adds a permanent line to the incident log and emails management. ' +
    'It can&rsquo;t be edited afterward &mdash; if something needs correcting later, ' +
    'file a second report that references the ID you get back.' +
    '</span></div>';

  $('confirm-panel').classList.add('open');
  $('confirm-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelReview() {
  $('confirm-panel').classList.remove('open');
  $('review-btn').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ─── SUBMIT ──────────────────────────────────────────────────

async function submitIncident() {
  const btn = $('submit-btn');
  btn.textContent = 'Filing…';
  btn.disabled = true;

  const payload = collect();

  try {
    const json = await postIncident(payload);
    if (json && json.success) return onFiled(json.incident_id);
    fail(btn, json && json.error);
  } catch (e) {
    // Safari throws on the Apps Script POST redirect even when the write
    // landed. Retry once — submission_id makes the backend return the
    // already-filed incident instead of creating a second one.
    try {
      const retry = await postIncident(payload);
      if (retry && retry.success) return onFiled(retry.incident_id);
      fail(btn, retry && retry.error);
    } catch (e2) {
      console.error('Submit failed:', e, e2);
      fail(btn, null);
    }
  }
}

async function postIncident(payload) {
  const res = await fetch(SCRIPT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },  // avoids CORS preflight
    body:    JSON.stringify(payload),
  });
  return res.json();
}

function onFiled(incidentId) {
  clearDraft();
  submissionId = newSubmissionId();
  $('success-id').textContent = incidentId || '—';
  $('form-wrap').style.display = 'none';
  $('success-panel').classList.add('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fail(btn, error) {
  btn.textContent = 'Could not file — try again';
  btn.className   = 'submit-btn error';
  btn.disabled    = false;
  if (error) console.error('Save failed:', error);

  // The draft is still on the device, so nothing typed is lost.
  const body = $('confirm-body');
  if (!body.querySelector('.callout.warn')) {
    const warn = document.createElement('div');
    warn.className = 'callout warn';
    warn.innerHTML = '<span class="callout-icon">⚠</span><span>' +
      'Nothing was filed, but your draft is saved on this device — ' +
      'you can retry now or reopen this page later. If it keeps failing, ' +
      'tell a manager (Dini or Mark) tonight and write the details down somewhere else.' +
      '</span>';
    body.appendChild(warn);
  }
}

// ─── UTIL ────────────────────────────────────────────────────

function newSubmissionId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}
