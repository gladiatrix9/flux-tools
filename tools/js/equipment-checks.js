// ══════ EQUIPMENT CHECKS ══════════════════════════════════════
// Regular checks of the chemical feed system, controllers, filters and
// pumps. Every completed check is saved to the "Equipment Checks" sheet;
// the latest entry per item drives the "Done today / Due / Overdue"
// badges, the filter-pressure comparison, and the ORP set-level guardrail.
//
// Intervals come from the Flux O&M binder where it gives one:
//   • Filters: clean cartridge at 10 PSI above starting pressure (RIMOR O&M)
//   • IPS sensors: clean tips every 3–6 months (commercial); test pH & ORP
//     sensors every 6 months or after pH goes out of range (IPS M920 manual)
//   • Stenner: inspect tube frequently; clean injection point periodically
//   • UV: leak test at least once a year (Pentair BioShield manual)
//   • Heaters: annual service (Pentair MasterTemp manual)
// Edit EQUIP_SCHEDULE below to change items, wording, or intervals.

const EQUIP_POOLS = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];
const EQUIP_POOL_NAMES = {
  'sl-hot':'Social Lounge Hot', 'sl-cold':'Social Lounge Cold',
  'eq-hot':'Equinox Hot',       'eq-cold':'Equinox Cold',
  'so-hot':'Solstice Hot',      'so-cold':'Solstice Cold',
};

// Parts that make up each pool's system (O&M drawings: jet pumps on the
// three hot soaks only; heaters on hot soaks, chillers on cold plunges;
// a Stenner Classic peristaltic pump each for chlorine and acid).
function POOL_EQUIP_PICKS(pool) {
  const hot = /-hot$/.test(pool);
  return ['Circulation pump'].concat(hot ? ['Jet pump'] : [])
    .concat(['Filter', 'UV unit', hot ? 'Heater' : 'Chiller',
             'Stenner pump (chlorine)', 'Stenner pump (acid)', 'Chlorine feed line', 'Acid feed line']);
}

const LUCID_NOTE = '<span class="eq-lucid-note">Lucid does this — hosts don\'t. Log it here once Lucid confirms it\'s done.</span> ';

const EQUIP_SCHEDULE = [
  { key:'Daily', days:1, who:'Host', title:'Daily — opening round', items:[
    { id:'ips-status', perPool:true, name:'IPS controller status', howto:'flashing',
      picks:['Not in Auto','No Flow light','ORP flashing','pH flashing','ORP alert light','pH alert light','Display blank'],
      detail:'Red <strong>Auto</strong> light on · green <strong>Flow</strong> light on · displays <strong>not flashing</strong> · no red alert lights.' },
    { id:'cl-barrel', name:'Chlorine barrel', value:{ label:'Level', unit:'%', ph:'50' }, usage:true,
      detail:'Estimate how full it is (%) — the tool compares with past readings, and <strong>using more than usual is an early sign of a leak</strong>. Tell Dini when it\'s under ¼. Lid on. Refilled it? Enter the new level and note "refilled".' },
    { id:'acid-barrel', name:'Acid barrel', value:{ label:'Level', unit:'%', ph:'50' }, usage:true,
      detail:'Estimate how full it is (%) — compared with past readings like the chlorine barrel. Tell Dini when it\'s under ¼. Lid on.' },
    { id:'pool-equip', perPool:true, name:'Pool equipment', howto:'feedCheck',
      picks: function(pool) { return POOL_EQUIP_PICKS(pool); },
      detail:'For each pool, walk its equipment: <strong>circulation pump</strong> running and sounding normal · <strong>jet pump</strong> (hot soaks) · <strong>filter</strong> — no leaks · <strong>UV unit</strong> power light on · <strong>heater / chiller</strong> running · <strong>Stenner pumps</strong> (chlorine &amp; acid peristaltic pumps) — no drips inside the clear cover, pump tube not flattened or weeping · <strong>chlorine &amp; acid feed lines</strong> — tubing not kinked, cracked, crusty or full of air, injection point dry with no white crystals. Mark Issue and tap the part that\'s wrong.' },
  ]},
  { key:'Weekly', days:7, who:'Host', title:'Weekly', items:[
    { id:'filter-psi', perPool:true, name:'Filter pressure', value:{ label:'Gauge', unit:'psi', ph:'12' },
      detail:'Read each filter\'s pressure gauge and enter it. When it\'s <strong>10 PSI above its clean starting pressure</strong> the cartridge needs cleaning — mark Issue and <strong>report it to Dini or Lucid</strong>. Lucid does the cleaning and replacement; hosts don\'t.' },
    { id:'chem-stock', name:'Chemical & reagent stock',
      detail:'Enough Hasachlor, muriatic acid, baking soda and calcium chloride for 2+ weeks. Taylor reagents not expired and not running low.' },
  ]},
  { key:'Quarterly', days:91, who:'Lucid', title:'Every 3 months', items:[
    { id:'sensor-clean', perPool:true, name:'Clean pH & ORP sensor tips', who:'Lucid',
      detail: LUCID_NOTE + 'IPS manual: every 3–6 months for commercial spas. Controller off → close both flow-cell valves → remove sensor → swirl 30 s in dish-soap water, rinse → swirl 5 s in muriatic acid or white vinegar, rinse (don\'t touch or brush the tip) → reinstall → open valves → controller on → back to Auto → re-check pH calibration.' },
  ]},
  { key:'Every 6 months', days:182, who:'Lucid', title:'Every 6 months', items:[
    { id:'sensor-test', perPool:true, name:'Test pH & ORP sensors', who:'Lucid',
      detail: LUCID_NOTE + '<strong>ORP:</strong> in tap water 200–400 mV; with a pinch of dichlor/trichlor 750–800 mV. <strong>pH:</strong> tap water + a little acid reads low; in water above 7.5 the reading rises. Replace a sensor that fails. Also after any time pH went out of range.' },
  ]},
  { key:'Yearly', days:365, who:'Lucid', title:'Yearly', items:[
    { id:'uv-service', name:'UV units — leak test & lamp', who:'Lucid',
      detail: LUCID_NOTE + 'Pentair BioShield manual: leak test at least once a year; replace lamps per the lamp-life chart; clean the quartz sleeve when changing the lamp.' },
    { id:'heater-service', name:'Heaters — annual service', who:'Lucid',
      detail: LUCID_NOTE + 'MasterTemp manual: heater and venting inspected and serviced by a qualified technician every year.' },
  ]},
  { key:'As needed', days:0, who:'Log when done', title:'As needed — log when done', items:[
    { id:'filter-clean', perPool:true, name:'Filter cartridge cleaned / replaced', value:{ label:'Clean PSI', unit:'psi', ph:'10' }, done:true, who:'Lucid',
      detail: LUCID_NOTE + 'After Lucid cleans or replaces a cartridge and the pump is running again, read the gauge and log it here. Weekly readings are compared to this.' },
    { id:'stenner-tube-change', name:'Stenner pump tube replaced', done:true, who:'Lucid',
      detail: LUCID_NOTE + 'Stenner manual: replace the duckbill check valve and ferrules at every tube change.' },
  ]},
];

// ─── STATE ─────────────────────────────────────────────────────
const _equipSel = {};   // "itemId|pool" → { result, value, notes }

function equipKey(id, pool) { return id + '|' + (pool || ''); }

function equipDaysSince(dateStr) {
  if (!dateStr || !_equipToday) return null;
  const a = new Date(dateStr + 'T00:00:00'), b = new Date(_equipToday + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function equipBadge(sec, id, pool) {
  const e = _equipLast[equipKey(id, pool)];
  if (!e) return sec.days ? '<span class="eq-badge due">Not yet logged</span>' : '';
  const d = equipDaysSince(e.date);
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
  const by = e.by ? ' · ' + e.by : '';
  const res = e.result === 'Issue' ? ' · <strong>issue</strong>' : '';
  const unit = id === 'orp-setlevel' ? ' mV' : ' psi';
  const shown = id === 'orp-setlevel' ? (e.to || e.value) : e.value;
  if (!sec.days) return '<span class="eq-badge info">Last: ' + when + (shown ? ' · ' + shown + unit : '') + by + '</span>';
  let cls = 'ok', label = 'Done ' + when;
  if (d >= sec.days * 1.5 && sec.days > 1) { cls = 'over'; label = 'Overdue · last ' + when; }
  else if (d >= sec.days)                  { cls = 'due';  label = 'Due · last ' + when; }
  if (e.result === 'Issue') cls = 'issue';
  return '<span class="eq-badge ' + cls + '">' + label + res + by + '</span>';
}

// Filter PSI vs the logged clean pressure.
function equipFilterNote(pool, psi) {
  const clean = _equipLast[equipKey('filter-clean', pool)];
  const v = parseFloat(psi);
  if (!clean || isNaN(v)) return clean ? '' : 'No clean pressure logged yet — log one under "As needed" the next time Lucid cleans the cartridge.';
  const base = parseFloat(clean.value);
  if (isNaN(base)) return '';
  const rise = Math.round((v - base) * 10) / 10;
  if (rise >= 10) return '⚠ ' + rise + ' PSI above clean (' + base + ') — cartridge needs cleaning. Mark Issue and report to Dini or Lucid.';
  return rise + ' PSI above clean (' + base + ') — OK.';
}

// ─── RENDER ────────────────────────────────────────────────────
function equipRender() {
  const wrap = document.getElementById('equip-sections');
  if (!wrap) return;
  wrap.innerHTML = EQUIP_SCHEDULE.map(function(sec, si) {
    const items = sec.items.map(function(it) {
      const pools = it.perPool ? EQUIP_POOLS : [''];
      const rows = pools.map(function(pool) {
        const k = equipKey(it.id, pool);
        const s = _equipSel[k] || {};
        const okLabel = it.done || sec.days > 7 ? 'Done' : 'OK';
        const valIn = it.value
          ? '<span class="eq-val"><input type="number" inputmode="decimal" placeholder="' + it.value.ph + '" value="' + (s.value || '') + '"' +
              ' oninput="equipSetVal(\'' + k + '\',this.value)">' + it.value.unit + '</span>'
          : '';
        const rn = equipRowNote(it, pool, s);
        const fnote = rn ? '<div class="eq-fnote' + (rn.indexOf('⚠') === 0 ? ' warn' : '') + '">' + rn + '</div>' : '';
        const pickList = typeof it.picks === 'function' ? it.picks(pool) : (it.picks || []);
        const picks = (it.picks && s.result === 'Issue')
          ? '<div class="eq-picks">' + pickList.map(function(pk) {
              const on = (s.picks || []).indexOf(pk) >= 0;
              return '<button class="eq-pick' + (on ? ' on' : '') + '" onclick="equipTogglePick(\'' + k + '\',\'' + pk + '\')">' + pk + '</button>';
            }).join('') + '</div>'
          : '';
        return '<div class="eq-row' + (s.result === 'Issue' ? ' is-issue' : '') + '">' +
          '<div class="eq-row-main">' +
            (pool ? '<span class="eq-pool">' + EQUIP_POOL_NAMES[pool] + '</span>' : '') +
            equipBadge(sec, it.id, pool) +
          '</div>' +
          '<div class="eq-row-ctl">' + valIn +
            '<button class="eq-btn ok' + (s.result === okLabel ? ' on' : '') + '" onclick="equipSetRes(\'' + k + '\',\'' + okLabel + '\')">' + okLabel + '</button>' +
            '<button class="eq-btn issue' + (s.result === 'Issue' ? ' on' : '') + '" onclick="equipSetRes(\'' + k + '\',\'Issue\')">Issue</button>' +
          '</div>' + picks + fnote +
          (s.result === 'Issue'
            ? '<input class="eq-note" placeholder="What\'s wrong? (required)" value="' + (s.notes || '').replace(/"/g,'&quot;') + '" oninput="equipSetNote(\'' + k + '\',this.value)">'
            : '') +
        '</div>';
      }).join('');
      return '<div class="eq-item">' +
        '<div class="eq-item-head"><span class="eq-item-name">' + it.name + '</span>' +
          (it.who ? '<span class="eq-who-badge">' + it.who + '</span>' : '') + '</div>' +
        '<div class="eq-item-detail">' + it.detail +
          (it.howto ? howtoInline(it.howto) : '') + '</div>' +
        rows + '</div>';
    }).join('');
    return '<div class="ref-section eq-section">' +
      '<div class="ref-section-header">' +
        '<div class="ref-section-title">' + sec.title + '</div>' +
        '<span class="eq-who">' + sec.who + '</span>' +
      '</div>' + items +
      '<div class="eq-save-row"><span class="eq-save-status" id="eq-status-' + si + '"></span>' +
        '<button class="save-btn" id="eq-save-' + si + '" onclick="equipSave(' + si + ')">Save ' + sec.key.toLowerCase() + ' checks</button></div>' +
    '</div>';
  }).join('');
}

function equipRenderHowto() {
  const el = document.getElementById('equip-howto');
  if (!el) return;
  el.innerHTML = ['readSettings','phCal','orpSet','feedCheck','flashing','pauseFeed'].map(function(k) {
    const h = IPS_HOWTO[k];
    return '<details class="hw-card"><summary>' + h.title + '</summary><div class="hw-body">' + h.html + '</div></details>';
  }).join('');
}

function equipSetRes(k, res) {
  const s = _equipSel[k] = _equipSel[k] || {};
  s.result = (s.result === res) ? undefined : res;   // tap again to clear
  equipRender();
}
function equipSetVal(k, v) {
  const s = _equipSel[k] = _equipSel[k] || {};
  s.value = v;
  // Live comparison note, without re-rendering (keeps input focus)
  const id = k.split('|')[0], pool = k.split('|')[1];
  const it = equipItem(id);
  const row = document.activeElement && document.activeElement.closest('.eq-row');
  if (it && row) {
    const txt = equipRowNote(it, pool, s);
    let n = row.querySelector('.eq-fnote');
    if (!n) { n = document.createElement('div'); n.className = 'eq-fnote'; row.querySelector('.eq-row-ctl').after(n); }
    n.textContent = txt;
    n.className = 'eq-fnote' + (txt.indexOf('⚠') === 0 ? ' warn' : '');
  }
}
function equipTogglePick(k, pk) {
  const s = _equipSel[k] = _equipSel[k] || {};
  s.picks = s.picks || [];
  const i = s.picks.indexOf(pk);
  if (i >= 0) s.picks.splice(i, 1); else s.picks.push(pk);
  equipRender();
}
function equipItem(id) {
  for (const sec of EQUIP_SCHEDULE) for (const it of sec.items) if (it.id === id) return it;
  return null;
}

// ─── TREND NOTES ───────────────────────────────────────────────
function equipDayDiff(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function equipRowNote(it, pool, s) {
  if (it.id === 'filter-psi' && s.value) return equipFilterNote(pool, s.value);
  if (it.usage && s.value !== undefined && s.value !== '') return equipUsageNote(it.id, s.value);
  if (it.id === 'ips-status') return equipRepeatTrip(pool, s.picks || []);
  return '';
}

// Barrel level vs. recent usage. A leak shows up as the barrel dropping
// faster than normal while FC isn't rising.
function equipUsageNote(id, val) {
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  const h = (_equipHist[equipKey(id, '')] || []).filter(x => x.value !== '' && !isNaN(parseFloat(x.value)));
  if (!h.length) return 'First reading — the tool will start comparing from tomorrow.';
  const rates = [];
  for (let i = 1; i < h.length; i++) {
    const d = equipDayDiff(h[i-1].date, h[i].date);
    const drop = parseFloat(h[i-1].value) - parseFloat(h[i].value);
    if (d >= 1 && drop >= 0) rates.push(drop / d);      // skip refills
  }
  const prev = h[h.length - 1], pv = parseFloat(prev.value);
  const d = equipDaysSince(prev.date);
  if (v > pv) return 'Up from ' + pv + '% — refilled? Add a note if so.';
  if (!d || d < 1) return '';
  const rate = Math.round(((pv - v) / d) * 10) / 10;
  const since = d === 1 ? 'yesterday' : d + ' days ago';
  if (rates.length < 5) return 'Down ' + (pv - v) + '% since ' + since + '. (Normal usage is learned after about a week of readings.)';
  const recent = rates.slice(-14).sort((a, b) => a - b);
  const usual  = Math.round(recent[Math.floor(recent.length / 2)] * 10) / 10;
  if (rate > Math.max(usual * 1.75, usual + 5)) {
    return '⚠ Down ' + rate + '% per day since ' + since + ' — usually about ' + usual + '% per day. Possible leak: check for puddles or a bleach/acid smell in the pump room, drips inside the Stenner covers, wet or crusty tubing and fittings. Mark Issue and note what you found (busy day, shock dose, refill spill, etc.).';
  }
  return 'Down ' + rate + '% per day since ' + since + ' (usual ~' + usual + '%) — normal.';
}

// A flashing display that comes back within 2 days means something keeps
// tripping the overfeed timer — don't just reset it.
function equipRepeatTrip(pool, picks) {
  const flashing = picks.filter(p => p.indexOf('flashing') >= 0 || p.indexOf('alert light') >= 0);
  if (!flashing.length) return '';
  const h = _equipHist[equipKey('ips-status', pool)] || [];
  const repeat = flashing.filter(p => h.some(x => {
    const dd = equipDaysSince(x.date);
    return dd !== null && dd <= 2 && (x.value || '').indexOf(p) >= 0;
  }));
  if (!repeat.length) {
    return 'Follow the steps above to clear it, then check the feed system (barrel, Stenner pump, tubing) for why it tripped.';
  }
  return '⚠ ' + repeat.join(' + ') + ' again within 2 days. <strong>Don\'t just reset it</strong> — something keeps stopping the feed. Look for a leak or air in the tubing, an empty barrel, or a pump not turning. Dose by hand meanwhile and flag to Dini.';
}
function equipSetNote(k, v) {
  const s = _equipSel[k] = _equipSel[k] || {};
  s.notes = v;
}

function equipStaff() {
  const a = document.getElementById('equip-staff');
  const b = document.getElementById('session-staff');
  return (a && a.value) || (b && b.value) || '';
}

// ─── SAVE ──────────────────────────────────────────────────────
async function equipSave(si) {
  const sec    = EQUIP_SCHEDULE[si];
  const btn    = document.getElementById('eq-save-' + si);
  const status = document.getElementById('eq-status-' + si);
  const staff  = equipStaff();
  if (!staff) { status.textContent = 'Select your name at the top first.'; status.className = 'eq-save-status err'; return; }

  const entries = [];
  let missingNote = false, missingValue = false, usageNotIssue = false;
  sec.items.forEach(function(it) {
    (it.perPool ? EQUIP_POOLS : ['']).forEach(function(pool) {
      const s = _equipSel[equipKey(it.id, pool)];
      if (!s || !s.result) return;
      if (s.result === 'Issue' && !(s.notes || '').trim()) missingNote = true;
      let notes = s.notes || '';
      let value = s.value || '';
      if (it.picks && s.result === 'Issue') value = (s.picks || []).join(', ');
      const rn = equipRowNote(it, pool, Object.assign({}, s, { value: it.picks ? undefined : s.value }));
      if (rn.indexOf('⚠') === 0) {
        if ((it.usage || it.id === 'filter-psi') && s.result !== 'Issue') { usageNotIssue = true; return; }
        const plain = rn.replace(/<[^>]+>/g, '').replace(/^⚠\s*/, '');
        notes = (notes ? notes + ' — ' : '') + '⚑ ' + plain.split('.')[0];
      }
      if (it.record && s.result !== 'Issue') {
        if (!s.value) { missingValue = true; return; }
        entries.push({ frequency: sec.key, item_id: it.id, item: it.name, pool: pool,
                       result: 'Recorded', value: s.value, from: '', to: s.value, notes: notes });
        return;
      }
      entries.push({ frequency: sec.key, item_id: it.id, item: it.name, pool: pool,
                     result: s.result, value: value, notes: notes });
    });
  });
  if (usageNotIssue) { status.textContent = 'Something needs reporting (barrel usage or filter pressure) — mark it Issue and add a note.'; status.className = 'eq-save-status err'; return; }
  if (missingValue) { status.textContent = 'Enter the set level you read on the controller.'; status.className = 'eq-save-status err'; return; }
  if (missingNote) { status.textContent = 'Add a note for each issue.'; status.className = 'eq-save-status err'; return; }
  if (!entries.length) { status.textContent = 'Tap OK / Done or Issue on at least one item.'; status.className = 'eq-save-status err'; return; }

  btn.disabled = true; btn.textContent = 'Saving…'; status.textContent = '';
  const done = function() {
    equipRecordLocal(staff, entries);
    entries.forEach(function(e) { delete _equipSel[equipKey(e.item_id, e.pool)]; });
    equipRender();
    const s2 = document.getElementById('eq-status-' + si);
    const issues = entries.filter(function(e) { return e.result === 'Issue'; }).length;
    if (s2) { s2.textContent = 'Saved ' + entries.length + ' check' + (entries.length > 1 ? 's' : '') + (issues ? ' · ' + issues + ' issue' + (issues > 1 ? 's' : '') + ' — tell Dini' : '') + ' ✓'; s2.className = 'eq-save-status ok'; }
  };
  try {
    const res  = await fetch(SCRIPT_URL, { method:'POST', headers:{ 'Content-Type':'text/plain' },
      body: JSON.stringify({ action:'saveEquipmentChecks', staff: staff, entries: entries }) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    done();
  } catch (e) {
    // Safari throws on Apps Script POST redirects even when the save worked —
    // confirm by checking the first entry was recorded today.
    try {
      const c = await (await fetch(SCRIPT_URL + '?action=getEquipmentChecks')).json();
      const f = entries[0], last = c.last && c.last[equipKey(f.item_id, f.pool)];
      if (c.success && last && last.date === c.today) { _equipToday = c.today; done(); return; }
    } catch (e2) {}
    btn.disabled = false; btn.textContent = 'Error — try again';
    status.textContent = 'Not saved. Check your connection.'; status.className = 'eq-save-status err';
    return;
  }
  btn.disabled = false; btn.textContent = 'Save ' + sec.key.toLowerCase() + ' checks';
}

// Mirror a save into _equipLast so badges and the ORP guardrail update
// immediately. Also called by savePool() for IPS adjustments.
function equipRecordLocal(staff, entries) {
  if (!entries || !entries.length) return;
  if (!_equipToday) {
    const d = new Date();
    _equipToday = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  const HIST_IDS = { 'cl-barrel':1, 'acid-barrel':1, 'ips-status':1, 'orp-setlevel':1 };
  entries.forEach(function(e) {
    const k = equipKey(e.item_id, e.pool);
    const rec = { date: _equipToday, result: e.result, value: e.value || '', from: e.from || '', to: e.to || '', by: staff || '', notes: e.notes || '' };
    _equipLast[k] = rec;
    if (HIST_IDS[e.item_id]) (_equipHist[k] = _equipHist[k] || []).push(rec);
  });
  equipRender();
  equipRenderSettings();
  equipReminders();
}

// ─── LOAD ──────────────────────────────────────────────────────
async function fetchEquipmentChecks() {
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getEquipmentChecks');
    const data = await res.json();
    if (!data.success) return;
    _equipLast  = data.last || {};
    _equipHist  = data.hist || {};
    _equipToday = data.today || '';
    equipRender();
    equipRenderSettings();
    equipReminders();
    // ORP set level / guardrail depend on this — refresh any pool in progress.
    EQUIP_POOLS.forEach(function(pid) {
      const st = (typeof _wizState !== 'undefined') && _wizState[pid];
      if (st && Object.keys(st.values || {}).length) {
        calc(pid);
        if (st.step >= WIZ_STEPS.length) wizRenderReview(pid);
      }
    });
  } catch (e) {
    console.log('Could not fetch equipment checks:', e);
  }
}




// ══════ IPS CONTROLLER SETTINGS ═══════════════════════════════
// Record each controller's settings once (starting point), then whenever
// anything changes. Daily-test pH calibrations and ORP set-level changes
// are recorded automatically from the Log tab.
const _setSel = {};   // poolId → { settingId: typedValue, note }

function equipSettingsSummary(pid) {
  let latest = null, missing = 0;
  IPS_SETTINGS.forEach(function(x) {
    const e = _equipLast[x.id + '|' + pid];
    if (!e) { missing++; return; }
    if (!latest || e.date > latest.date) latest = e;
  });
  if (missing === IPS_SETTINGS.length) return '<span class="eq-badge due">Not recorded yet</span>';
  const d = equipDaysSince(latest.date);
  const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
  return (missing ? '<span class="eq-badge due">' + missing + ' not recorded</span> ' : '') +
         '<span class="eq-badge info">Last change ' + when + (latest.by ? ' · ' + latest.by : '') + '</span>';
}

function equipRenderSettings() {
  const el = document.getElementById('equip-settings');
  if (!el) return;
  const open = {};
  el.querySelectorAll('details[data-pid]').forEach(function(d) { open[d.dataset.pid] = d.open; });
  el.innerHTML = EQUIP_POOLS.map(function(pid) {
    const sel = _setSel[pid] || {};
    const groups = ['pH', 'ORP1'].map(function(g) {
      const fields = IPS_SETTINGS.filter(x => x.grp === g).map(function(x) {
        const known = ipsSetting(pid, x.id);
        const val = sel[x.id] !== undefined ? sel[x.id] : (known !== null ? known : '');
        const changed = sel[x.id] !== undefined && String(sel[x.id]) !== String(known ?? '');
        return '<label class="eq-set-field' + (changed ? ' changed' : '') + '"><span>' + x.label + '</span>' +
          '<input ' + (x.text ? 'type="text"' : 'type="number" step="' + x.step + '"') +
          ' placeholder="—" value="' + String(val).replace(/"/g, '&quot;') + '"' +
          ' oninput="equipSetSetting(\'' + pid + '\',\'' + x.id + '\',this.value)">' +
          '<em>' + (x.unit ? x.unit + ' · ' : '') + 'factory ' + x.def + '</em></label>';
      }).join('');
      return '<div class="eq-set-grp"><div class="eq-set-grp-name">' + g + '</div>' + fields + '</div>';
    }).join('');
    return '<details class="hw-card eq-set-card" data-pid="' + pid + '"' + (open[pid] ? ' open' : '') + '>' +
      '<summary>' + EQUIP_POOL_NAMES[pid] + ' ' + equipSettingsSummary(pid) + '</summary>' +
      '<div class="hw-body">' + groups +
        '<input class="eq-note" placeholder="Why changed? (required for changes, not for first recording)" value="' + (sel.note || '').replace(/"/g, '&quot;') + '"' +
        ' oninput="equipSetSetting(\'' + pid + '\',\'note\',this.value)">' +
        '<div class="eq-save-row"><span class="eq-save-status" id="eq-set-status-' + pid + '"></span>' +
          '<button class="save-btn" id="eq-set-save-' + pid + '" onclick="equipSaveSettings(\'' + pid + '\')">Save settings</button></div>' +
      '</div></details>';
  }).join('');
}

function equipSetSetting(pid, id, v) {
  _setSel[pid] = _setSel[pid] || {};
  _setSel[pid][id] = v;
}

async function equipSaveSettings(pid) {
  const status = document.getElementById('eq-set-status-' + pid);
  const btn    = document.getElementById('eq-set-save-' + pid);
  const staff  = equipStaff();
  const say = (t, cls) => { status.textContent = t; status.className = 'eq-save-status ' + (cls || ''); };
  if (!staff) return say('Select your name at the top first.', 'err');
  const sel  = _setSel[pid] || {};
  const note = (sel.note || '').trim();
  const entries = [];
  let changes = 0;
  IPS_SETTINGS.forEach(function(x) {
    if (sel[x.id] === undefined) return;
    const v = String(sel[x.id]).trim();
    const known = ipsSetting(pid, x.id);
    if (v === '' || v === String(known ?? '')) return;
    const isChange = known !== null;
    if (isChange) changes++;
    let n = isChange ? note : '';
    if (/over timer/i.test(x.label) && /^off$/i.test(v)) {
      n = '⚑ Over Timer OFF — removes the leak/overfeed protection (and voids NSF certification per the IPS manual)' + (n ? ' — ' + n : '');
    }
    if (x.id === 'orp-setlevel' && isChange) {
      const flag = orpDriftFlag(pid, parseFloat(known), parseFloat(v));
      if (flag) n = '⚑ ' + flag + (n ? ' — ' + n : '');
    }
    entries.push({ frequency: 'Settings', item_id: x.id, item: 'IPS ' + x.grp + ' ' + x.label, pool: pid,
                   result: isChange ? 'Changed' : 'Recorded', value: v, from: isChange ? known : '', to: v, notes: n });
  });
  if (!entries.length) return say('Nothing new to save — type the values you see on the controller.', 'err');
  if (changes && !note) return say('Add a note saying why the setting changed.', 'err');

  btn.disabled = true; btn.textContent = 'Saving…';
  const done = function() {
    equipRecordLocal(staff, entries);
    delete _setSel[pid];
    equipRenderSettings();
    const s2 = document.getElementById('eq-set-status-' + pid);
    if (s2) { s2.textContent = 'Saved ' + entries.length + ' setting' + (entries.length > 1 ? 's' : '') + ' ✓'; s2.className = 'eq-save-status ok'; }
  };
  try {
    const res  = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveEquipmentChecks', staff: staff, entries: entries }) });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    done();
  } catch (e) {
    try {
      const c = await (await fetch(SCRIPT_URL + '?action=getEquipmentChecks')).json();
      const f = entries[0], last = c.last && c.last[equipKey(f.item_id, f.pool)];
      if (c.success && last && last.date === c.today && String(last.to) === String(f.to)) { _equipToday = c.today; done(); return; }
    } catch (e2) {}
    btn.disabled = false; btn.textContent = 'Error — try again';
    say('Not saved. Check your connection.', 'err');
  }
}

// ══════ REMINDERS ═════════════════════════════════════════════
// Weekly (and any longer-interval host) checks that are due pop up once a
// day when the tool opens, and stay as a banner on Log Results until done.
// Everything due — including Lucid's items — goes into the daily email.

function equipDueItems(includeLucid) {
  const out = [];
  EQUIP_SCHEDULE.forEach(function(sec) {
    if (!sec.days) return;
    sec.items.forEach(function(it) {
      const who = it.who || sec.who;
      const lucid = who === 'Lucid';
      if (lucid && !includeLucid) return;
      const pools = it.perPool ? EQUIP_POOLS : [''];
      let due = 0, overdue = 0, never = 0;
      pools.forEach(function(pool) {
        const e = _equipLast[equipKey(it.id, pool)];
        const d = e ? equipDaysSince(e.date) : null;
        if (!e) { never++; due++; }
        else if (d >= sec.days) { due++; if (sec.days > 1 && d >= sec.days * 1.5) overdue++; }
      });
      if (due) out.push({ freq: sec.key, days: sec.days, name: it.name, who: who, lucid: lucid,
                          due: due, of: pools.length, overdue: overdue, never: never });
    });
  });
  return out;
}

function equipDueLabel(x) {
  const n = x.of > 1 ? ' (' + x.due + ' of ' + x.of + ' pools)' : '';
  const tag = x.overdue ? 'overdue' : x.never === x.due ? 'not logged yet' : 'due';
  return x.freq + ' — ' + x.name + n + ' · ' + tag + (x.lucid ? ' · Lucid' : '');
}

// Plain-text list for the daily email.
function equipDueSummary() {
  if (!_equipToday) return [];
  return equipDueItems(true).map(equipDueLabel);
}

function equipReminders() {
  if (!_equipToday) return;
  const due = equipDueItems(false).filter(x => x.days > 1);   // weekly+ host checks
  const banner = document.getElementById('equip-due-banner');
  if (banner) {
    banner.style.display = due.length ? 'flex' : 'none';
    const t = banner.querySelector('.equip-due-text');
    if (t) t.innerHTML = '<strong>' + (due.length === 1 ? '1 check is' : due.length + ' checks are') + ' due:</strong> ' +
      due.map(x => x.name).join(', ') + '.';
  }
  if (!due.length) return;
  let seen = '';
  try { seen = localStorage.getItem('flux-equip-reminder') || ''; } catch (e) {}
  if (seen === _equipToday) return;
  try { localStorage.setItem('flux-equip-reminder', _equipToday); } catch (e) {}
  equipShowReminderModal(due);
}

function equipShowReminderModal(due) {
  const old = document.getElementById('equip-reminder-modal');
  if (old) old.remove();
  const m = document.createElement('div');
  m.id = 'equip-reminder-modal';
  m.className = 'eq-modal-backdrop';
  m.innerHTML =
    '<div class="eq-modal" role="dialog" aria-modal="true" aria-labelledby="eq-modal-title">' +
      '<div class="eq-modal-title" id="eq-modal-title">🔧 Equipment checks due</div>' +
      '<ul class="eq-modal-list">' + due.map(x => '<li class="' + (x.overdue ? 'over' : '') + '">' + equipDueLabel(x) + '</li>').join('') + '</ul>' +
      '<div class="eq-modal-note">Takes a few minutes on the Equipment tab. You\'ll also see a reminder on Log Results until they\'re done.</div>' +
      '<div class="eq-modal-btns">' +
        '<button class="eq-btn" onclick="equipCloseReminder()">Later</button>' +
        '<button class="save-btn" onclick="equipCloseReminder(); switchTab(\'equipment\')">Do them now →</button>' +
      '</div>' +
    '</div>';
  m.addEventListener('click', function(e) { if (e.target === m) equipCloseReminder(); });
  document.body.appendChild(m);
}
function equipCloseReminder() {
  const m = document.getElementById('equip-reminder-modal');
  if (m) m.remove();
}

// ─── INIT (last, so every declaration above exists) ─────────────
(function initEquipment() {
  const sel = document.getElementById('equip-staff');
  const main = document.getElementById('session-staff');
  if (sel && main) {
    sel.innerHTML = main.innerHTML;
    sel.addEventListener('change', function() { main.value = sel.value; main.dispatchEvent(new Event('change')); });
    main.addEventListener('change', function() { if (sel.value !== main.value) sel.value = main.value; });
  }
  equipRender();
  equipRenderSettings();
  equipRenderHowto();
  fetchEquipmentChecks();
})();
