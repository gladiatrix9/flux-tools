// ══════ DAILY UPDATE ══════════════════════════════════════════
// Every save is a new entry. The page starts from the latest entry:
//   • same day  → counts, sales and notes carry over
//   • new day   → only the notes carry over (counts/sales start at zero)
// so each host edits the previous notes (delete what's resolved, add
// what's new) and saves. "Save & share" also makes an image for WhatsApp.
//
// Pool equipment is a table (pools × equipment) built from the water log
// and the Equipment tab of the water tool — hosts don't re-enter it here.
// Equipment status carries over from the last check until someone
// re-checks it. Water chemistry is today's test only.
// Other equipment (card reader, slushie machine…) and restock are open
// lists that carry over until someone marks them fixed / restocked.
//
// Data: everything → water-testing script (WATER_URL). Incidents go to a
// separate private "Flux Incident Log" spreadsheet; looking them up needs
// the team code (checked by the server).

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);

const POOLS = [
  { id: 'sl-hot',  room: 'Social Lounge', kind: 'Hot',  name: 'Social Lounge Hot' },
  { id: 'sl-cold', room: 'Social Lounge', kind: 'Cold', name: 'Social Lounge Cold' },
  { id: 'eq-hot',  room: 'Equinox',       kind: 'Hot',  name: 'Equinox Hot' },
  { id: 'eq-cold', room: 'Equinox',       kind: 'Cold', name: 'Equinox Cold' },
  { id: 'so-hot',  room: 'Solstice',      kind: 'Hot',  name: 'Solstice Hot' },
  { id: 'so-cold', room: 'Solstice',      kind: 'Cold', name: 'Solstice Cold' },
];
const POOL_NAME = Object.fromEntries(POOLS.map(p => [p.id, p.name]));

// Table rows. `part` = the name hosts tap on the Equipment tab's
// "Pool equipment" check (see POOL_EQUIP_PICKS in the water tool).
const EQUIP_ROWS = [
  { key: 'chem',   label: 'Water chemistry' },
  { key: 'ips',    label: 'IPS controller' },
  { key: 'pump',   label: 'Circulation pump', part: 'Circulation pump' },
  { key: 'jet',    label: 'Jet pump',         part: 'Jet pump', hotOnly: true },
  { key: 'filter', label: 'Filter',           part: 'Filter' },
  { key: 'uv',     label: 'UV unit',          part: 'UV unit' },
  { key: 'temp',   label: 'Heater / chiller', part: p => /-hot$/.test(p) ? 'Heater' : 'Chiller' },
  { key: 'stcl',   label: 'Stenner pump — chlorine', part: 'Stenner pump (chlorine)' },
  { key: 'stacid', label: 'Stenner pump — acid',     part: 'Stenner pump (acid)' },
  { key: 'cl',     label: 'Chlorine feed line',      part: 'Chlorine feed line' },
  { key: 'acid',   label: 'Acid feed line',          part: 'Acid feed line' },
];

const INCIDENT_TYPES = ['Guest conduct', 'Misuse of facilities', 'Alcohol (ID / intoxication / cut-off)', 'Injury', 'Medical event', 'Property damage', 'Theft / lost item', 'Safety hazard', 'Other'];
const LOCATIONS = ['Social Lounge', 'Equinox', 'Solstice', 'Showers / ADA shower', 'Locker rooms', 'Lobby / front desk', 'Patio', 'Parking lot', 'Other'];

let ctx = null;
let today = localDate();
let state = blankState();

function blankState() {
  return { staff: '', baseAt: '', counts: { new: 0, ret: 0, member: 0 }, sales: {}, extraSales: [],
           openAdd: [], openClose: [], notes: '', notesUndo: null, incidents: [] };
}
function localDate() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function prettyDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function shortDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── DRAFT (unsaved changes stay on this device) ───────────────
function draftKey() { return 'flux-update-draft-' + today; }
function saveDraft() { try { localStorage.setItem(draftKey(), JSON.stringify(state)); } catch (e) {} }
function loadDraft() { try { return JSON.parse(localStorage.getItem(draftKey()) || 'null'); } catch (e) { return null; } }
function clearDraft() { try { localStorage.removeItem(draftKey()); } catch (e) {} }

// ─── LOAD ──────────────────────────────────────────────────────
async function fetchCtx() {
  const res = await fetch(WATER_URL + '?action=getDailyUpdate');
  const c = await res.json();
  if (!c.success) throw new Error(c.error || 'load failed');
  return c;
}

async function load() {
  $('staff').innerHTML = '<option value="">— select —</option>' + STAFF.map(s => '<option>' + esc(s) + '</option>').join('');
  $('staff').onchange = function() { state.staff = this.value; this.classList.remove('invalid'); saveDraft(); };
  $('notes').oninput = function() { state.notes = this.value; saveDraft(); renderNotesTools(); };
  try {
    ctx = await fetchCtx();
    today = ctx.today || today;
  } catch (e) {
    console.log('Could not load daily update:', e);
    $('load-error').style.display = 'flex';
    ctx = { lists: { sale: [], restock: [], equipment: [] }, announcements: { text: '' }, openItems: [], pools: {},
            checks: { today: [], openIssues: [], latest: [] }, recent: [], latest: null, todayInfo: null };
  }
  startFromLatest();
  const draft = loadDraft();
  if (draft) {
    const base = draft.baseAt;
    state = Object.assign(blankState(), draft);
    if (ctx.latest && base !== ctx.latest.at) {
      $('draft-warn').style.display = 'flex';
      $('draft-warn-text').textContent = (ctx.latest.host || 'Someone') + ' saved an update at ' + ctx.latest.at +
        ' after you started. Your unsaved changes are shown — check the notes before saving, or start over from the latest.';
    }
  }
  $('staff').value = state.staff || '';
  $('notes').value = state.notes || '';
  $('hdr-date').textContent = prettyDate(today);
  renderAll();
}

// Fill the form from the latest saved entry.
function startFromLatest() {
  const keepStaff = state.staff;
  state = blankState();
  state.staff = keepStaff;
  const L = ctx.latest;
  if (L) {
    state.baseAt = L.at || '';
    state.notes = L.notes || '';
    if (L.date === today) {
      state.counts = { new: +L.new || 0, ret: +L.ret || 0, member: +L.member || 0 };
      state.sales = L.sales || {};
      Object.keys(state.sales).forEach(k => { if ((ctx.lists.sale || []).indexOf(k) < 0) state.extraSales.push(k); });
    }
  }
}
function startOver() {
  clearDraft(); startFromLatest();
  $('notes').value = state.notes; $('draft-warn').style.display = 'none';
  renderAll();
}

function renderAll() {
  renderSavedInfo(); renderAnnouncements(); renderPoolTable(); renderCounts(); renderSales();
  renderOpen('fix'); renderOpen('restock'); renderNotesTools(); renderIncidents(); renderHistory();
}

function renderSavedInfo() {
  const L = ctx.latest;
  $('saved-info').textContent = L ? 'last saved ' + (L.date === today ? 'today ' : shortDate(L.date) + ' ') + (L.at ? L.at.replace(/^\S+\s/, '') : '') + (L.host ? ' by ' + L.host : '') : '';
  $('notes-hint').textContent = L
    ? (L.date === today ? 'From the last update today' : 'Carried over from ' + shortDate(L.date)) + ' — delete what\'s resolved, add what\'s new. One per line.'
    : 'One per line.';
}

// ─── ANNOUNCEMENTS (editable by any host) ──────────────────────
function annLines() { return String((ctx.announcements || {}).text || '').split('\n').map(s => s.trim()).filter(Boolean); }
function renderAnnouncements() {
  const a = annLines(), A = ctx.announcements || {};
  $('ann-list').innerHTML = a.length ? a.map(x => '<li>' + esc(x) + '</li>').join('') : '<li class="up-muted">None right now.</li>';
  $('ann-meta').textContent = A.by ? 'Updated ' + (A.at ? A.at + ' ' : '') + 'by ' + A.by : '';
  $('ann-view').style.display = 'block';
  $('ann-edit').style.display = 'none';
}
function editAnnouncements() {
  $('ann-text').value = annLines().join('\n');
  $('ann-view').style.display = 'none';
  $('ann-edit').style.display = 'block';
  $('ann-text').focus();
}
async function saveAnnouncements() {
  const status = $('ann-status');
  if (!state.staff) { status.textContent = 'Select your name (under Today\'s update) first.'; status.className = 'submit-note err'; return; }
  const text = $('ann-text').value.split('\n').map(s => s.trim()).filter(Boolean).join('\n');
  status.textContent = 'Saving…'; status.className = 'submit-note';
  const post = async () => (await fetch(WATER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'saveAnnouncements', staff: state.staff, text }) })).json();
  let ok = false;
  try { ok = !!(await post()).success; } catch (e) { try { ok = !!(await post()).success; } catch (e2) {} }
  if (!ok) { status.textContent = 'Not saved — check the connection.'; status.className = 'submit-note err'; return; }
  ctx.announcements = { text, by: state.staff, at: 'just now' };
  status.textContent = ''; renderAnnouncements();
}

// ─── POOL EQUIPMENT TABLE ──────────────────────────────────────
// level: good | warn | bad | none | na
function poolCells() {
  // Latest check per item & pool, whatever the date (carries over until re-checked)
  const latest = (ctx.checks && ctx.checks.latest) || [];
  const last = (id, pid) => latest.filter(e => e.id === id && e.pool === pid).pop();
  const cells = {}, issues = [], checked = {};
  POOLS.forEach(p => {
    const c = cells[p.id] = {};
    // Water chemistry — today's water test only
    const w = (ctx.pools || {})[p.id] || {};
    if (!w.saved) c.chem = 'none';
    else if (/in range/i.test(w.status)) c.chem = 'good';
    else if (/adjustment/i.test(w.status)) { c.chem = 'warn'; issues.push({ level: 'warn', pool: p.id, what: 'Water chemistry', text: 'Needs adjustment (see water log)' }); }
    else if (/attention/i.test(w.status))  { c.chem = 'bad';  issues.push({ level: 'bad',  pool: p.id, what: 'Water chemistry', text: 'Needs attention (see water log)' }); }
    else c.chem = 'good';
    // IPS controller
    const ips = last('ips-status', p.id);
    if (!ips) c.ips = 'none';
    else if (ips.result === 'Issue') {
      c.ips = 'bad';
      issues.push({ level: 'bad', pool: p.id, what: 'IPS controller', text: [ips.value, ips.notes].filter(Boolean).join(' — '), date: ips.date, by: ips.by });
    } else c.ips = 'good';
    // Parts — the latest "Pool equipment" check sets every part
    const pe = last('pool-equip', p.id);
    const picked = pe && pe.result === 'Issue' ? String(pe.value || '').split(/,\s*/) : [];
    EQUIP_ROWS.filter(r => r.part).forEach(r => {
      if (r.hotOnly && p.kind !== 'Hot') { c[r.key] = 'na'; return; }
      const part = typeof r.part === 'function' ? r.part(p.id) : r.part;
      if (!pe) { c[r.key] = 'none'; return; }
      if (picked.indexOf(part) >= 0) {
        c[r.key] = 'bad';
        issues.push({ level: 'bad', pool: p.id, what: part, text: pe.notes, date: pe.date, by: pe.by });
      } else c[r.key] = 'good';
    });
    // Filter pressure (weekly) — latest reading flagged
    const fp = last('filter-psi', p.id);
    if (fp && fp.result === 'Issue') { c.filter = 'bad'; issues.push({ level: 'bad', pool: p.id, what: 'Filter pressure', text: [fp.value ? fp.value + ' psi' : '', fp.notes].filter(Boolean).join(' — '), date: fp.date, by: fp.by }); }
    // When this pool's equipment was last checked
    const dates = [ips, pe].filter(Boolean).map(e => e.date).sort();
    checked[p.id] = dates.length ? dates[0] : '';
  });
  // Shared chemical supply
  const shared = ['cl-barrel', 'acid-barrel'].map(id => {
    const e = latest.filter(x => x.id === id).pop();
    const name = id === 'cl-barrel' ? 'Chlorine barrel' : 'Acid barrel';
    if (!e) return { name, level: 'none', text: 'not checked' };
    if (e.result === 'Issue') issues.push({ level: 'bad', pool: '', what: name, text: [e.value ? e.value + '%' : '', e.notes].filter(Boolean).join(' — '), date: e.date, by: e.by });
    const when = e.date === today ? '' : ' (' + shortDate(e.date) + ')';
    return { name, level: e.result === 'Issue' ? 'bad' : 'good', text: (e.value ? e.value + '%' : '') + (e.result === 'Issue' ? ' — issue' : '') + when };
  });
  return { cells, issues, shared, checked };
}
const ICON = { good: '✓', warn: '!', bad: '✕', none: '·', na: '—' };
const ICON_TITLE = { good: 'Good', warn: 'Needs adjustment', bad: 'Needs attention', none: 'Not checked yet', na: 'Not applicable' };

function poolTableHtml(data, forImage) {
  const rooms = ['Social Lounge', 'Equinox', 'Solstice'];
  let h = '<table class="' + (forImage ? 'rc-table' : 'up-table') + '">' +
    '<colgroup><col class="col-label">' + POOLS.map(() => '<col class="col-pool">').join('') + '</colgroup><thead><tr><th></th>' +
    rooms.map(r => '<th colspan="2" class="room">' + (forImage ? r : r.replace('Social Lounge', 'Social')) + '</th>').join('') + '</tr>' +
    '<tr><th></th>' + POOLS.map(p => '<th class="kind ' + p.kind.toLowerCase() + '">' + p.kind + '</th>').join('') + '</tr></thead><tbody>';
  EQUIP_ROWS.forEach(r => {
    h += '<tr><th class="rowh">' + r.label + '</th>' + POOLS.map(p => {
      const l = data.cells[p.id][r.key];
      return '<td class="c ' + l + '" title="' + esc(POOL_NAME[p.id] + ' — ' + r.label + ': ' + ICON_TITLE[l]) + '">' + ICON[l] + '</td>';
    }).join('') + '</tr>';
  });
  h += '<tr class="lastrow"><th class="rowh">Last checked</th>' + POOLS.map(p => {
    const d = data.checked[p.id];
    const old = d && d < today;
    return '<td class="lc' + (old ? ' old' : '') + '">' + (!d ? '—' : d === today ? 'today' : shortDate(d)) + '</td>';
  }).join('') + '</tr>';
  return h + '</tbody></table>';
}

function issuesHtml(data) {
  return data.issues.map(i => '<li class="' + i.level + '"><strong>' + esc(i.pool ? POOL_NAME[i.pool] + ' — ' : '') + esc(i.what) + '</strong>' +
    (i.text ? ': ' + esc(i.text) : '') +
    (i.date || i.by ? ' <span>(' + [i.date && i.date !== today ? 'flagged ' + shortDate(i.date) : '', i.by].filter(Boolean).join(', ') + ')</span>' : '') + '</li>').join('');
}

function renderPoolTable() {
  const d = poolCells();
  $('pool-table').innerHTML = poolTableHtml(d, false);
  $('shared-supply').innerHTML = d.shared.map(s => '<span class="up-shared ' + s.level + '">' + ICON[s.level] + ' ' + esc(s.name) + (s.text ? ' · ' + esc(s.text) : '') + '</span>').join('');
  const notChecked = POOLS.reduce((n, p) => n + EQUIP_ROWS.filter(r => d.cells[p.id][r.key] === 'none').length, 0);
  $('pool-summary').textContent = (d.issues.length ? d.issues.length + ' issue' + (d.issues.length > 1 ? 's' : '') : 'No issues') +
    (notChecked ? ' · ' + notChecked + ' not checked yet' : '');
  $('pool-issues').innerHTML = d.issues.length ? '<ul class="up-issues">' + issuesHtml(d) + '</ul>' : '<div class="up-muted">Nothing flagged.</div>';
  $('pool-details').classList.toggle('has-issues', d.issues.length > 0);
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

// ─── OPEN ITEMS: needs fixing + restock (carry over until closed) ─────
const OPEN_KINDS = {
  fix:     { list: 'equipment', box: 'fix',     doneLabel: 'Fixed', doneOn: 'Fixed ✓',     empty: 'Nothing broken on the list.', detailPh: 'What\'s wrong?' },
  restock: { list: 'restock',   box: 'restock', doneLabel: 'Restocked?', doneOn: 'Restocked ✓', empty: 'Nothing on the list.' },
};
function openList(kind) {
  const open = (ctx.openItems || []).filter(o => o.kind === kind).map(o => Object.assign({}, o));
  state.openAdd.filter(o => o.kind === kind).forEach(a => {
    const ex = open.find(o => o.item === a.item);
    if (ex) { if (a.detail) ex.detail = a.detail; }
    else open.push({ kind, item: a.item, detail: a.detail, since: today, by: state.staff, isNew: true });
  });
  return open;
}
function isClosing(kind, item) { return state.openClose.some(o => o.kind === kind && o.item === item); }
function renderOpen(kind) {
  const K = OPEN_KINDS[kind], open = openList(kind);
  $(K.box + '-open').innerHTML = open.length ? open.map((o, i) => {
    const done = isClosing(kind, o.item);
    const since = o.since === today ? 'today' : o.since ? 'since ' + shortDate(o.since) : '';
    return '<div class="up-rs' + (done ? ' done' : '') + '"><span class="up-rs-item">' + esc(o.item) + '</span>' +
      '<span class="up-rs-since">' + since + (o.by ? ' · ' + esc(o.by) : '') + '</span>' +
      '<button class="up-tog good' + (done ? ' on' : '') + '" onclick="toggleClose(\'' + kind + '\',' + i + ')">' + (done ? K.doneOn : K.doneLabel + (kind === 'fix' ? '?' : '')) + '</button>' +
      (kind === 'fix' ? '<input type="text" class="up-eq-note" placeholder="' + K.detailPh + '" value="' + esc(o.detail || '') + '" oninput="setOpenDetail(\'' + kind + '\',' + i + ',this.value)">' : '') +
      '</div>';
  }).join('') : '<div class="up-muted">' + K.empty + '</div>';
  const names = open.map(o => o.item);
  $(K.box + '-chips').innerHTML = (ctx.lists[K.list] || []).filter(x => names.indexOf(x) < 0)
    .map(x => '<button class="up-chip" data-item="' + esc(x) + '" onclick="addOpen(\'' + kind + '\',this.dataset.item)">+ ' + esc(x) + '</button>').join('');
}
function addOpen(kind, item, detail) {
  if (!state.openAdd.some(o => o.kind === kind && o.item === item)) state.openAdd.push({ kind, item, detail: detail || '' });
  state.openClose = state.openClose.filter(o => !(o.kind === kind && o.item === item));
  saveDraft(); renderOpen(kind);
  if (kind === 'fix') { const ins = document.querySelectorAll('#fix-open .up-eq-note'); const last = ins[ins.length - 1]; if (last && !last.value) last.focus(); }
}
function addOpenOther(kind) {
  const el = $(OPEN_KINDS[kind].box + '-other'), v = el.value.trim(); if (!v) return;
  el.value = ''; addOpen(kind, v);
}
function setOpenDetail(kind, i, v) {
  const o = openList(kind)[i];
  const a = state.openAdd.find(x => x.kind === kind && x.item === o.item);
  if (a) a.detail = v; else state.openAdd.push({ kind, item: o.item, detail: v });
  saveDraft();
}
function toggleClose(kind, i) {
  const o = openList(kind)[i];
  const isServer = (ctx.openItems || []).some(x => x.kind === kind && x.item === o.item);
  if (!isServer) {                                        // just added here — undo it
    state.openAdd = state.openAdd.filter(x => !(x.kind === kind && x.item === o.item));
  } else if (isClosing(kind, o.item)) {
    state.openClose = state.openClose.filter(x => !(x.kind === kind && x.item === o.item));
  } else {
    state.openClose.push({ kind, item: o.item });
  }
  saveDraft(); renderOpen(kind);
}

// ─── NOTES: clear / undo ───────────────────────────────────────
function renderNotesTools() {
  $('notes-clear').style.display = state.notes ? 'inline-block' : 'none';
  $('notes-undo').style.display = state.notesUndo !== null && !state.notes ? 'inline-block' : 'none';
}
function clearNotes() {
  state.notesUndo = state.notes; state.notes = '';
  $('notes').value = ''; saveDraft(); renderNotesTools(); $('notes').focus();
}
function undoClearNotes() {
  state.notes = state.notesUndo || ''; state.notesUndo = null;
  $('notes').value = state.notes; saveDraft(); renderNotesTools();
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
      (u.opened ? '<div class="up-hint">Added: ' + esc(u.opened) + '</div>' : '') +
      (u.closed ? '<div class="up-hint">Fixed / restocked: ' + esc(u.closed) + '</div>' : '') +
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
  const pe = poolCells();
  const payload = {
    action: 'saveDailyUpdate', staff: state.staff, counts: state.counts, sales: state.sales, notes: state.notes,
    open_add: state.openAdd, open_close: state.openClose,
    pool_equipment: { cells: pe.cells, issues: pe.issues.map(i => (i.pool ? POOL_NAME[i.pool] + ' — ' : '') + i.what + (i.text ? ': ' + i.text : '')) },
    incidents_new: state.incidents.filter(x => !x.id).map(x => ({ sid: x.sid, time: x.time, type: x.type, location: x.location,
      who: x.who, guestName: x.guestName, what: x.what, action: x.action, police: x.police === 'No' ? '' : x.police })),
  };
  const post = async () => (await fetch(WATER_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) })).json();
  let json = null;
  try { json = await post(); }
  catch (e) {
    // Safari throws on the Apps Script redirect even when the save landed.
    // A retry could add a duplicate entry — check first.
    try {
      const c = await fetchCtx();
      const L = c.latest;
      if (L && L.host === state.staff && String(L.notes || '') === String(state.notes || '') && L.date === c.today) json = { success: true, incident_ids: {} , _ctx: c };
      else json = await post();
    } catch (e2) {}
  }
  disableButtons(false);
  if (!json || !json.success) { setStatus('Not saved — check the connection and try again. Your update is kept on this device.', 'err'); return false; }
  const ids = json.incident_ids || {};
  state.incidents.forEach(x => { if (!x.id && ids[x.sid]) x.id = ids[x.sid]; });
  try { ctx = json._ctx || await fetchCtx(); } catch (e) {}
  state.openAdd = []; state.openClose = []; state.notesUndo = null;
  state.baseAt = ctx.latest ? ctx.latest.at : state.baseAt;
  saveDraft();
  $('draft-warn').style.display = 'none';
  renderAll();
  setStatus('Saved ✓', 'ok');
  return true;
}
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
    $('img-out').src = URL.createObjectURL(blob);
    $('img-view').style.display = 'flex';
    setStatus('Saved ✓', 'ok');
  } catch (e) {
    console.error(e);
    setStatus('Saved ✓ — but the image could not be made. Take a screenshot instead.', 'err');
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

// The image: everything except the start-of-shift announcements.
function buildCard() {
  const sales = Object.keys(state.sales).filter(k => state.sales[k] > 0);
  const restock = openList('restock').filter(o => !isClosing('restock', o.item));
  const fixes = openList('fix').filter(o => !isClosing('fix', o.item));
  const notes = String(state.notes || '').split('\n').map(s => s.trim()).filter(Boolean);
  const hosts = (ctx.todayInfo && ctx.todayInfo.hosts) || state.staff;
  const pe = poolCells();
  const sec = (title, body) => body ? '<div class="rc-sec"><div class="rc-h">' + title + '</div>' + body + '</div>' : '';
  const filed = state.incidents.filter(x => x.id);
  $('report-card').innerHTML =
    '<div class="rc-top"><div><div class="rc-brand">FLUX</div><div class="rc-sub">Daily update</div></div>' +
      '<div class="rc-date">' + esc(prettyDate(today)) + '<span>' + esc(hosts) + '</span></div></div>' +
    '<div class="rc-guests"><div class="rc-big">' + guestTotal() + '</div><div class="rc-gl">guests<br><span>' +
      state.counts.new + ' new · ' + state.counts.ret + ' return · ' + state.counts.member + ' member</span></div></div>' +
    sec('Pool equipment', poolTableHtml(pe, true) +
      '<div class="rc-legend">✓ good · ! needs adjustment · ✕ needs attention · · not checked · — n/a</div>' +
      '<div class="rc-shared">' + pe.shared.map(s => '<span class="' + s.level + '">' + ICON[s.level] + ' ' + esc(s.name) + (s.text ? ' · ' + esc(s.text) : '') + '</span>').join('') + '</div>' +
      (pe.issues.length ? '<ul class="rc-issues">' + issuesHtml(pe) + '</ul>' : '')) +
    sec('Needs fixing', fixes.length ? '<ul class="rc-notes">' + fixes.map(o => '<li><b>' + esc(o.item) + '</b>' + (o.detail ? ' — ' + esc(o.detail) : '') +
      (o.since && o.since !== today ? ' <span class="rc-since">since ' + shortDate(o.since) + '</span>' : '') + '</li>').join('') + '</ul>' : '') +
    sec('Notes', notes.length ? '<ul class="rc-notes">' + notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '') +
    sec('Restock needed', restock.length ? '<div class="rc-chips">' + restock.map(o => '<span>' + esc(o.item) + '</span>').join('') + '</div>' : '') +
    sec('Sales', sales.length ? '<div class="rc-sales">' + sales.map(k => '<span>' + esc(k) + ' <b>' + state.sales[k] + '</b></span>').join('') + '</div>' : '') +
    sec('Incidents', filed.map(x =>
      '<div class="rc-inc"><div class="rc-inc-h">⚠ ' + esc(x.type) + ' · ' + esc(x.location) + ' · ' + esc(x.time) + ' <span>' + esc(x.id) + '</span></div>' +
      (x.who ? '<div><b>Who:</b> ' + esc(x.who) + '</div>' : '') +
      '<div><b>What happened:</b> ' + esc(x.what) + '</div>' +
      '<div><b>What we did:</b> ' + esc(x.action) + '</div>' +
      (x.police && x.police !== 'No' ? '<div><b>' + esc(x.police) + ' called</b></div>' : '') + '</div>').join(''));
}

load();
