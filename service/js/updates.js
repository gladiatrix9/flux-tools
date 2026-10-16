// ══════ DAILY UPDATE ══════════════════════════════════════════
// One update per day. The morning host saves; the closing host opens the
// same page, sees what's there, adds to it and saves again. "Save & share"
// turns the update into an image and opens the phone's share sheet so it
// can go straight to WhatsApp.
//
// Data: everything → water-testing script (WATER_URL). Incidents are kept
//       in a separate private "Flux Incident Log" spreadsheet; looking them
//       up from this page needs the team code (checked by the server).
// Announcements and the live equipment grid are for reference at the
// start of a shift; the equipment grid is also included in the image.

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

const POOL_NAMES = {
  'sl-hot':'Social Lounge Hot', 'sl-cold':'Social Lounge Cold',
  'eq-hot':'Equinox Hot',       'eq-cold':'Equinox Cold',
  'so-hot':'Solstice Hot',      'so-cold':'Solstice Cold',
};
const INCIDENT_TYPES = ['Guest conduct', 'Misuse of facilities', 'Alcohol (ID / intoxication / cut-off)', 'Injury', 'Medical event', 'Property damage', 'Theft / lost item', 'Safety hazard', 'Other'];
const LOCATIONS = ['Social Lounge', 'Equinox', 'Solstice', 'Showers / ADA shower', 'Locker rooms', 'Lobby / front desk', 'Patio', 'Parking lot', 'Other'];

let ctx = null;          // what the server returned
let today = localDate(); // replaced by the server's date on load
let state = blankState();

function blankState() {
  return { staff: '', counts: { new: 0, ret: 0, member: 0 }, sales: {}, extraSales: [],
           equipment: {}, equipNotes: {}, restockAdd: [], restockDone: [], notes: '', incidents: [] };
}
function localDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function prettyDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ─── DRAFT (kept on this device so nothing typed is lost) ──────
function draftKey() { return 'flux-update-draft-' + today; }
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(state)); } catch (e) {} }
function loadDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { return null; } }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }

// ─── LOAD ──────────────────────────────────────────────────────
async function load() {
  $('staff').innerHTML = '<option value="">— select —</option>' + STAFF.map(s => '<option>' + esc(s) + '</option>').join('');
  $('staff').onchange = function() { state.staff = this.value; this.classList.remove('invalid'); saveDraft(); };
  $('notes').oninput = function() { state.notes = this.value; saveDraft(); };
  try {
    const res = await fetch(WATER_URL + '?action=getDailyUpdate');
    ctx = await res.json();
    if (!ctx.success) throw new Error(ctx.error || 'load failed');
    today = ctx.today || today;
  } catch (e) {
    console.log('Could not load daily update:', e);
    $('load-error').style.display = 'flex';
    ctx = { lists: { sale: [], restock: [], equipment: [], announcement: [] }, restockOpen: [], pools: {}, checks: { today: [], openIssues: [] }, recent: [], update: null };
  }
  // Start from today's saved update, then layer this device's unsaved draft on top.
  const u = ctx.update;
  if (u) {
    state.counts = { new: +u.new || 0, ret: +u.ret || 0, member: +u.member || 0 };
    state.sales = u.sales || {};
    state.equipment = u.equipment || {};
    state.equipNotes = u.equipmentNotes || {};
    state.notes = u.notes || '';
    Object.keys(state.sales).forEach(k => { if ((ctx.lists.sale || []).indexOf(k) < 0) state.extraSales.push(k); });
  }
  const draft = loadDraft();
  if (draft) state = Object.assign(blankState(), draft, { incidents: (draft.incidents || []) });
  $('staff').value = state.staff || '';
  $('notes').value = state.notes || '';
  $('hdr-date').textContent = prettyDate(today);
  $('saved-info').textContent = u ? 'last saved ' + (u.hosts ? 'by ' + u.hosts : '') : '';
  renderAll();
}

function renderAll() {
  renderAnnouncements(); renderStatus(); renderCounts(); renderSales();
  renderEquipment(); renderRestock(); renderIncidents(); renderHistory();
}

// ─── ANNOUNCEMENTS ─────────────────────────────────────────────
function renderAnnouncements() {
  const a = ctx.lists.announcement || [];
  $('ann-list').innerHTML = a.length ? a.map(x => '<li>' + esc(x) + '</li>').join('') : '<li class="up-muted">None right now.</li>';
}

// ─── EQUIPMENT STATUS ──────────────────────────────────────────
// level: good | warn | bad | none
function statusRows() {
  const rows = [];
  Object.keys(POOL_NAMES).forEach(pid => {
    const p = (ctx.pools || {})[pid] || {};
    let level = 'none', text = 'Not tested yet';
    if (p.saved) {
      const s = String(p.status || '');
      if (/in range/i.test(s))          { level = 'good'; text = 'Good'; }
      else if (/adjustment/i.test(s))   { level = 'warn'; text = 'Needs adjustment'; }
      else if (/attention/i.test(s))    { level = 'bad';  text = 'Needs attention'; }
      else                              { level = 'good'; text = s || 'Tested'; }
    }
    rows.push({ name: POOL_NAMES[pid], level, text, group: 'Pools' });
  });
  // Feed system / equipment checks from the water tool's Equipment tab
  const tdy = (ctx.checks && ctx.checks.today) || [];
  const open = (ctx.checks && ctx.checks.openIssues) || [];
  if (open.length) {
    rows.push({ name: 'Chemical feed & pool equipment', level: 'bad', group: 'Pools',
      text: 'Needs attention', detail: open.map(e => e.item + (e.pool ? ' (' + POOL_NAMES[e.pool] + ')' : '')).join(', ') });
  } else if (tdy.length) {
    rows.push({ name: 'Chemical feed & pool equipment', level: 'good', text: 'Good', group: 'Pools' });
  } else {
    rows.push({ name: 'Chemical feed & pool equipment', level: 'none', text: 'Not checked yet', group: 'Pools' });
  }
  (ctx.lists.equipment || []).forEach(item => {
    const v = state.equipment[item];
    rows.push({ name: item, group: 'Other',
      level: v === 'good' ? 'good' : v === 'attention' ? 'bad' : 'none',
      text:  v === 'good' ? 'Good' : v === 'attention' ? 'Needs attention' : 'Not checked',
      detail: v === 'attention' ? (state.equipNotes[item] || '') : '' });
  });
  return rows;
}

function renderStatus() {
  $('status-live').innerHTML = statusRows().map(r =>
    '<div class="up-st ' + r.level + '"><span class="up-st-name">' + esc(r.name) + '</span>' +
    '<span class="up-st-val">' + esc(r.text) + '</span>' +
    (r.detail ? '<span class="up-st-detail">' + esc(r.detail) + '</span>' : '') + '</div>').join('');
}

function renderEquipment() {
  const items = ctx.lists.equipment || [];
  $('equip').innerHTML = items.map((item, i) => {
    const v = state.equipment[item];
    return '<div class="up-eq-row' + (v === 'attention' ? ' bad' : '') + '">' +
      '<span class="up-eq-name">' + esc(item) + '</span>' +
      '<span class="up-eq-btns">' +
        '<button class="up-tog good' + (v === 'good' ? ' on' : '') + '" onclick="setEquip(' + i + ',\'good\')">Good</button>' +
        '<button class="up-tog bad' + (v === 'attention' ? ' on' : '') + '" onclick="setEquip(' + i + ',\'attention\')">Needs attention</button>' +
      '</span>' +
      (v === 'attention' ? '<input type="text" class="up-eq-note" placeholder="What\'s wrong?" value="' + esc(state.equipNotes[item] || '') + '" oninput="setEquipNote(' + i + ',this.value)">' : '') +
    '</div>';
  }).join('') + '<div class="up-hint">Pools and the chemical feed system update automatically from the water log.</div>';
}
function setEquip(i, v) {
  const item = ctx.lists.equipment[i];
  state.equipment[item] = state.equipment[item] === v ? undefined : v;
  saveDraft(); renderEquipment(); renderStatus();
}
function setEquipNote(i, v) {
  state.equipNotes[ctx.lists.equipment[i]] = v; saveDraft();
}

// ─── GUESTS ────────────────────────────────────────────────────
const COUNT_LABELS = { new: 'New', ret: 'Return', member: 'Member' };
function renderCounts() {
  $('counts').innerHTML = Object.keys(COUNT_LABELS).map(k =>
    '<div class="up-step"><span class="up-step-label">' + COUNT_LABELS[k] + '</span>' +
    '<button class="up-step-btn" onclick="bump(\'' + k + '\',-1)" aria-label="minus">−</button>' +
    '<input class="up-step-val" type="number" inputmode="numeric" min="0" value="' + state.counts[k] + '" oninput="setCount(\'' + k + '\',this.value)">' +
    '<button class="up-step-btn plus" onclick="bump(\'' + k + '\',1)" aria-label="plus">+</button></div>').join('');
  $('guest-total').textContent = 'Total ' + guestTotal();
}
function guestTotal() { return state.counts.new + state.counts.ret + state.counts.member; }
function bump(k, d) { state.counts[k] = Math.max(0, state.counts[k] + d); saveDraft(); renderCounts(); }
function setCount(k, v) { state.counts[k] = Math.max(0, parseInt(v, 10) || 0); saveDraft(); $('guest-total').textContent = 'Total ' + guestTotal(); }

// ─── SALES ─────────────────────────────────────────────────────
function saleItems() {
  const base = ctx.lists.sale || [];
  return base.concat(state.extraSales.filter(x => base.indexOf(x) < 0));
}
function renderSales() {
  $('sales').innerHTML = saleItems().map((item, i) => {
    const n = state.sales[item] || 0;
    return '<div class="up-sale' + (n ? ' has' : '') + '"><span class="up-sale-name">' + esc(item) + '</span>' +
      '<button class="up-step-btn sm" onclick="bumpSale(' + i + ',-1)" aria-label="minus">−</button>' +
      '<span class="up-sale-n">' + n + '</span>' +
      '<button class="up-step-btn sm plus" onclick="bumpSale(' + i + ',1)" aria-label="plus">+</button></div>';
  }).join('');
}
function bumpSale(i, d) {
  const item = saleItems()[i];
  const n = Math.max(0, (state.sales[item] || 0) + d);
  if (n) state.sales[item] = n; else delete state.sales[item];
  saveDraft(); renderSales();
}
function addSaleItem() {
  const v = $('sale-other').value.trim(); if (!v) return;
  if (saleItems().indexOf(v) < 0) state.extraSales.push(v);
  state.sales[v] = (state.sales[v] || 0) + 1;
  $('sale-other').value = ''; saveDraft(); renderSales();
}

// ─── RESTOCK ───────────────────────────────────────────────────
function openRestock() {
  const open = (ctx.restockOpen || []).map(r => ({ item: r.item, since: r.since, by: r.by }));
  state.restockAdd.forEach(i => { if (!open.some(o => o.item === i)) open.push({ item: i, since: today, by: state.staff, isNew: true }); });
  return open;
}
function renderRestock() {
  const open = openRestock();
  $('restock-open').innerHTML = open.length ? open.map((o, i) => {
    const done = state.restockDone.indexOf(o.item) >= 0;
    const since = o.since === today ? 'today' : o.since ? 'since ' + new Date(o.since + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    return '<div class="up-rs' + (done ? ' done' : '') + '"><span class="up-rs-item">' + esc(o.item) + '</span>' +
      '<span class="up-rs-since">' + since + (o.by ? ' · ' + esc(o.by) : '') + '</span>' +
      '<button class="up-tog good' + (done ? ' on' : '') + '" onclick="toggleRestocked(' + i + ')">' + (done ? 'Restocked ✓' : 'Restocked?') + '</button></div>';
  }).join('') : '<div class="up-muted">Nothing on the list.</div>';
  const openNames = open.map(o => o.item);
  $('restock-chips').innerHTML = (ctx.lists.restock || []).filter(x => openNames.indexOf(x) < 0)
    .map((x, i) => '<button class="up-chip" onclick="addRestock(\'' + esc(x).replace(/'/g, '&#39;') + '\')">+ ' + esc(x) + '</button>').join('');
}
function addRestock(item) {
  if (state.restockAdd.indexOf(item) < 0) state.restockAdd.push(item);
  state.restockDone = state.restockDone.filter(x => x !== item);
  saveDraft(); renderRestock();
}
function addRestockOther() {
  const v = $('restock-other').value.trim(); if (!v) return;
  $('restock-other').value = ''; addRestock(v);
}
function toggleRestocked(i) {
  const item = openRestock()[i].item;
  // Tapping a just-added item removes it instead of marking it restocked.
  if (state.restockAdd.indexOf(item) >= 0 && !(ctx.restockOpen || []).some(o => o.item === item)) {
    state.restockAdd = state.restockAdd.filter(x => x !== item);
  } else {
    const k = state.restockDone.indexOf(item);
    if (k >= 0) state.restockDone.splice(k, 1); else state.restockDone.push(item);
  }
  saveDraft(); renderRestock();
}

// ─── INCIDENTS ─────────────────────────────────────────────────
function newSid() { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'sub-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9); }
function addIncident() {
  const d = new Date();
  state.incidents.push({ sid: newSid(), type: '', location: '', time: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'),
                         what: '', who: '', guestName: '', action: '', police: 'No', id: '' });
  saveDraft(); renderIncidents();
}
function renderIncidents() {
  $('incidents').innerHTML = state.incidents.map((x, i) => {
    if (x.id) {
      return '<div class="up-inc filed"><strong>' + esc(x.id) + '</strong> · ' + esc(x.type) + ' · ' + esc(x.location) +
        '<div class="up-hint">Saved to the incident log. To add or correct something, add a new incident that mentions this ID.</div></div>';
    }
    const sel = (opts, v, f) => '<select onchange="setInc(' + i + ',\'' + f + '\',this.value)"><option value="">— select —</option>' +
      opts.map(o => '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>').join('') + '</select>';
    const txt = (f, ph, rows) => '<textarea rows="' + rows + '" placeholder="' + ph + '" oninput="setInc(' + i + ',\'' + f + '\',this.value)">' + esc(x[f]) + '</textarea>';
    return '<div class="up-inc">' +
      '<div class="field-row"><div class="field"><label class="field-label">Type *</label>' + sel(INCIDENT_TYPES, x.type, 'type') + '</div>' +
      '<div class="field"><label class="field-label">Where *</label>' + sel(LOCATIONS, x.location, 'location') + '</div></div>' +
      '<div class="field-row"><div class="field"><label class="field-label">Time *</label><input type="time" value="' + esc(x.time) + '" oninput="setInc(' + i + ',\'time\',this.value)"></div>' +
      '<div class="field"><label class="field-label">Police / EMS called?</label>' + sel(['No', 'Police', 'EMS', 'Both'], x.police, 'police') + '</div></div>' +
      '<div class="field"><label class="field-label">What happened *</label>' + txt('what', 'Facts only — what you saw and heard.', 3) + '</div>' +
      '<div class="field"><label class="field-label">Who was involved</label>' + txt('who', 'Description (e.g. two men, 30s, regulars). Shared in the update.', 2) + '</div>' +
      '<div class="field"><label class="field-label">Guest name(s) — incident log only</label><input type="text" placeholder="Only if known. Not shown in the WhatsApp image." value="' + esc(x.guestName) + '" oninput="setInc(' + i + ',\'guestName\',this.value)"></div>' +
      '<div class="field"><label class="field-label">What we did *</label>' + txt('action', 'Warned them, asked them to leave, cleaned up, told Dini…', 2) + '</div>' +
      '<button class="up-link" onclick="removeIncident(' + i + ')">Remove</button></div>';
  }).join('');
}
function setInc(i, f, v) { state.incidents[i][f] = v; saveDraft(); }
function removeIncident(i) { state.incidents.splice(i, 1); saveDraft(); renderIncidents(); }

// ─── INCIDENT LOOKUP ───────────────────────────────────────────
// Needs the team code (Dini sets it in Apps Script → Script properties →
// INCIDENT_KEY). Kept for this browser session only.
async function searchIncidents() {
  const out = $('inc-results');
  let key = '';
  try { key = sessionStorage.getItem('flux-inc-key') || ''; } catch (e) {}
  if (!key) {
    key = ($('inc-key').value || '').trim();
    if (!key) { $('inc-key-row').style.display = 'flex'; $('inc-key').focus(); out.innerHTML = '<div class="up-hint">Enter the team code to look up incidents.</div>'; return; }
  }
  out.innerHTML = '<div class="up-muted">Searching…</div>';
  try {
    const q = ($('inc-q').value || '').trim();
    const r = await (await fetch(WATER_URL + '?action=getIncidents&key=' + encodeURIComponent(key) + '&q=' + encodeURIComponent(q))).json();
    if (!r.success) {
      if (r.error === 'wrong-code') { try { sessionStorage.removeItem('flux-inc-key'); } catch (e) {} $('inc-key-row').style.display = 'flex'; out.innerHTML = '<div class="up-hint" style="color:var(--alert)">That code didn\'t work. Ask Dini for the current one.</div>'; return; }
      if (r.error === 'not-set-up') { out.innerHTML = '<div class="up-hint">The incident log isn\'t set up for lookups yet — Dini needs to add the team code.</div>'; return; }
      throw new Error(r.error);
    }
    try { sessionStorage.setItem('flux-inc-key', key); } catch (e) {}
    $('inc-key-row').style.display = 'none';
    out.innerHTML = r.incidents.length ? r.incidents.map(x =>
      '<div class="up-hist"><div class="up-hist-top"><strong>' + esc(x.type) + ' · ' + esc(x.where) + '</strong><span>' + esc(x.date) + ' ' + esc(x.time) + ' · ' + esc(x.id) + '</span></div>' +
      (x.guestName ? '<div><b>Guest:</b> ' + esc(x.guestName) + '</div>' : '') +
      (x.who ? '<div><b>Who:</b> ' + esc(x.who) + '</div>' : '') +
      '<div><b>What happened:</b> ' + esc(x.what) + '</div><div><b>What we did:</b> ' + esc(x.action) + '</div>' +
      (x.police ? '<div><b>' + esc(x.police) + ' called</b></div>' : '') +
      '<div class="up-hint">Reported by ' + esc(x.by) + '</div></div>').join('')
      : '<div class="up-muted">No incidents found' + (q ? ' for “' + esc(q) + '”' : '') + '.</div>';
  } catch (e) {
    out.innerHTML = '<div class="up-hint" style="color:var(--alert)">Couldn\'t load incidents. Check the connection.</div>';
  }
}

// ─── HISTORY ───────────────────────────────────────────────────
function renderHistory() {
  const r = ctx.recent || [];
  $('history').innerHTML = r.length ? r.map(u => {
    const notes = String(u.notes || '').split('\n').map(s => s.trim()).filter(Boolean);
    return '<div class="up-hist"><div class="up-hist-top"><strong>' + esc(prettyDate(u.date)) + '</strong>' +
      '<span>' + (u.total || 0) + ' guests' + (u.hosts ? ' · ' + esc(u.hosts) : '') + '</span></div>' +
      (notes.length ? '<ul>' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
      (u.restock ? '<div class="up-hint">Restock requested: ' + esc(u.restock) + '</div>' : '') +
      (u.incidents ? '<div class="up-hint">⚠ Incidents: ' + esc(u.incidents) + '</div>' : '') + '</div>';
  }).join('') : '<div class="up-muted">No earlier updates yet.</div>';
}

// ─── SAVE ──────────────────────────────────────────────────────
function validate() {
  if (!state.staff) { $('staff').classList.add('invalid'); $('staff').scrollIntoView({ behavior: 'smooth', block: 'center' }); return 'Select your name first.'; }
  for (const x of state.incidents) {
    if (x.id) continue;
    if (!x.type || !x.location || !x.time || !x.what.trim() || !x.action.trim()) {
      $('incidents').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return 'Fill in the required incident fields (type, where, time, what happened, what we did).';
    }
  }
  return '';
}

async function save() {
  const err = validate();
  if (err) { setStatus(err, 'err'); return false; }
  setStatus('Saving…');
  disableButtons(true);
  const payload = {
    action: 'saveDailyUpdate', staff: state.staff, counts: state.counts, sales: state.sales,
    notes: state.notes, equipment: cleanObj(state.equipment), equipment_notes: cleanObj(state.equipNotes),
    restock_add: state.restockAdd, restock_done: state.restockDone,
    incidents_new: state.incidents.filter(x => !x.id).map(x => ({ sid: x.sid, time: x.time, type: x.type, location: x.location,
      who: x.who, guestName: x.guestName, what: x.what, action: x.action, police: x.police === 'No' ? '' : x.police })),
  };
  const post = async () => (await fetch(WATER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) })).json();
  let ok = false, json = null;
  try { json = await post(); }
  catch (e) {
    // Safari throws on the Apps Script redirect even when the save landed.
    // Re-sending is safe: the day's row is overwritten, restock is deduped,
    // and incidents are deduped by their submission id.
    try { json = await post(); } catch (e2) {}
  }
  ok = !!(json && json.success);
  if (ok) {
    const ids = json.incident_ids || {};
    state.incidents.forEach(x => { if (!x.id && ids[x.sid]) x.id = ids[x.sid]; });
  }
  disableButtons(false);
  if (!ok) { setStatus('Not saved — check the connection and try again. Your update is kept on this device.', 'err'); return false; }
  // Restock changes are now on the server; refresh from it.
  try {
    const c = await (await fetch(WATER_URL + '?action=getDailyUpdate')).json();
    if (c.success) { ctx = c; }
  } catch (e) {}
  state.restockAdd = []; state.restockDone = [];
  saveDraft();
  $('saved-info').textContent = 'last saved by ' + state.staff;
  renderAll();
  setStatus('Saved ✓', 'ok');
  return true;
}
function cleanObj(o) { const r = {}; Object.keys(o || {}).forEach(k => { if (o[k] !== undefined && o[k] !== '') r[k] = o[k]; }); return r; }
function setStatus(t, cls) { $('save-status').textContent = t; $('save-status').className = 'submit-note ' + (cls || ''); }
function disableButtons(b) { $('share-btn').disabled = b; $('save-btn').disabled = b; }

async function saveOnly() { await save(); }

// ─── SHARE AS IMAGE ────────────────────────────────────────────
async function saveAndShare() {
  if (!(await save())) return;
  setStatus('Making the image…');
  try {
    const blob = await renderCardImage();
    const file = new File([blob], 'flux-update-' + today + '.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Flux daily update' });
        setStatus('Saved ✓ · shared', 'ok');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') { setStatus('Saved ✓ (share cancelled)', 'ok'); return; }
      }
    }
    // Fallback: show the image to press-and-hold / download it.
    const url = URL.createObjectURL(blob);
    $('img-out').src = url;
    $('img-view').style.display = 'flex';
    setStatus('Saved ✓', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Saved ✓ — but the image could not be made. Take a screenshot of the Start of shift section instead.', 'err');
  }
}

function loadHtml2Canvas() {
  if (window.html2canvas) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = resolve; s.onerror = () => reject(new Error('image library failed to load'));
    document.head.appendChild(s);
  });
}

async function renderCardImage() {
  buildCard();
  await loadHtml2Canvas();
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const canvas = await html2canvas($('report-card'), { scale: 2, backgroundColor: '#f5ede6', useCORS: true });
  return await new Promise(r => canvas.toBlob(r, 'image/png'));
}

// The image: everything in the update except the start-of-shift announcements.
function buildCard() {
  const sales = Object.keys(state.sales).filter(k => state.sales[k] > 0);
  const restock = openRestock().filter(o => state.restockDone.indexOf(o.item) < 0);
  const notes = String(state.notes || '').split('\n').map(s => s.trim()).filter(Boolean);
  const hosts = ctx.update && ctx.update.hosts ? ctx.update.hosts : state.staff;
  const st = statusRows();
  const pill = r => '<span class="rc-pill ' + r.level + '">' + (r.level === 'good' ? '✓ ' : r.level === 'none' ? '' : '⚠ ') + esc(r.text) + '</span>';
  const sec = (title, body) => body ? '<div class="rc-sec"><div class="rc-h">' + title + '</div>' + body + '</div>' : '';
  $('report-card').innerHTML =
    '<div class="rc-top"><div><div class="rc-brand">FLUX</div><div class="rc-sub">Daily update</div></div>' +
      '<div class="rc-date">' + esc(prettyDate(today)) + '<span>' + esc(hosts) + '</span></div></div>' +
    '<div class="rc-guests"><div class="rc-big">' + guestTotal() + '</div><div class="rc-gl">guests<br><span>' +
      state.counts.new + ' new · ' + state.counts.ret + ' return · ' + state.counts.member + ' member</span></div></div>' +
    sec('Sales', sales.length ? '<div class="rc-sales">' + sales.map(k => '<span>' + esc(k) + ' <b>' + state.sales[k] + '</b></span>').join('') + '</div>' : '<div class="rc-muted">None</div>') +
    sec('Equipment', '<div class="rc-grid">' + st.map(r => '<div class="rc-row"><span class="rc-name">' + esc(r.name) + '</span>' + pill(r) +
      (r.detail ? '<div class="rc-detail">' + esc(r.detail) + '</div>' : '') + '</div>').join('') + '</div>') +
    sec('Restock needed', restock.length ? '<div class="rc-chips">' + restock.map(o => '<span>' + esc(o.item) + '</span>').join('') + '</div>' : '') +
    sec('Notes', notes.length ? '<ul class="rc-notes">' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
    sec('Incidents', state.incidents.filter(x => x.id).map(x =>
      '<div class="rc-inc"><div class="rc-inc-h">⚠ ' + esc(x.type) + ' · ' + esc(x.location) + ' · ' + esc(x.time) + ' <span>' + esc(x.id) + '</span></div>' +
      (x.who ? '<div><b>Who:</b> ' + esc(x.who) + '</div>' : '') +
      '<div><b>What happened:</b> ' + esc(x.what) + '</div>' +
      '<div><b>What we did:</b> ' + esc(x.action) + '</div>' +
      (x.police && x.police !== 'No' ? '<div><b>' + esc(x.police) + ' called</b></div>' : '') + '</div>').join(''));
}

load();
