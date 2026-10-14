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

const EQUIP_SCHEDULE = [
  { key:'Daily', days:1, who:'Host', title:'Daily — opening round', items:[
    { id:'ips-status', perPool:true, name:'IPS controller status', howto:'flashing',
      detail:'Red <strong>Auto</strong> light on · green <strong>Flow</strong> light on · displays <strong>not flashing</strong> · no red alert lights.' },
    { id:'cl-barrel', name:'Chlorine barrel', value:{ label:'Level', unit:'%', ph:'50' },
      detail:'At least ¼ full — tell Dini when it\'s under ¼. Suction line in the liquid, 2–3 in. above the bottom. Lid on.' },
    { id:'acid-barrel', name:'Acid barrel', value:{ label:'Level', unit:'%', ph:'50' },
      detail:'At least ¼ full — tell Dini when it\'s under ¼. Suction line in the liquid, 2–3 in. above the bottom. Lid on.' },
    { id:'feed-lines', name:'Feed pumps & tubing', howto:'feedCheck',
      detail:'No drips or chemical inside the Stenner pumps\' clear covers. Tubing to every injection point not kinked, cracked, crusted with white crystals, or full of air.' },
    { id:'circulation', name:'Pumps, filters & UV',
      detail:'Circulation pumps running and sounding normal. No leaks at pumps, filters, valves or UV units. UV power lights on.' },
  ]},
  { key:'Weekly', days:7, who:'Host', title:'Weekly', items:[
    { id:'filter-psi', perPool:true, name:'Filter pressure', value:{ label:'Gauge', unit:'psi', ph:'12' },
      detail:'Read the filter\'s pressure gauge. The cartridge needs cleaning when it\'s <strong>10 PSI above its clean starting pressure</strong> — the tool compares for you if the clean pressure has been logged (see "As needed").' },
    { id:'stenner-tubes', name:'Stenner pump tubes & suction lines',
      detail:'Through each clear cover: tube not flattened, cracked or weeping. Weighted strainer at the end of each suction line clean and 2–3 in. above the barrel bottom.' },
  ]},
  { key:'Monthly', days:30, who:'Host', title:'Monthly', items:[
    { id:'injection-points', name:'Injection points',
      detail:'Where the chlorine and acid tubing enters each pool\'s plumbing: look for white crystal buildup or drips. Report anything — cleaning needs the line isolated (Dini / Lucid).' },
    { id:'chem-stock', name:'Chemical & reagent stock',
      detail:'Enough Hasachlor, muriatic acid, baking soda and calcium chloride for 2+ weeks. Taylor reagents not expired and not running low.' },
  ]},
  { key:'Quarterly', days:91, who:'Dini / Lucid', title:'Every 3 months', items:[
    { id:'sensor-clean', perPool:true, name:'Clean pH & ORP sensor tips',
      detail:'IPS manual: every 3–6 months for commercial spas. Controller off → close both flow-cell valves → loosen nut, remove sensor → swirl 30 s in dish-soap water, rinse → swirl 5 s in muriatic acid or white vinegar, rinse (<strong>don\'t touch or brush the tip</strong>) → reinstall hand-tight → open valves → controller on → back to <strong>Auto</strong> → re-check pH calibration after a few minutes.' },
  ]},
  { key:'Every 6 months', days:182, who:'Dini / Lucid', title:'Every 6 months', items:[
    { id:'sensor-test', perPool:true, name:'Test pH & ORP sensors',
      detail:'Clean first. <strong>ORP:</strong> in a glass of tap water it should read 200–400 mV; add a pinch of dichlor/trichlor and it should read 750–800 mV. <strong>pH:</strong> tap water + a little acid should read low; in water above 7.5 the reading should rise. Replace a sensor that fails. Also do this after any time pH went out of range.' },
  ]},
  { key:'Yearly', days:365, who:'Dini / Lucid', title:'Yearly', items:[
    { id:'uv-service', name:'UV units — leak test & lamp',
      detail:'Pentair BioShield manual: leak test at least once a year; replace lamps per the manual\'s lamp-life chart; clean the quartz sleeve when changing the lamp.' },
    { id:'heater-service', name:'Heaters — annual service',
      detail:'MasterTemp manual: heater and venting inspected and serviced by a qualified technician every year.' },
  ]},
  { key:'As needed', days:0, who:'Whoever did it', title:'As needed — log when done', items:[
    { id:'filter-clean', perPool:true, name:'Filter cartridge cleaned', value:{ label:'Clean PSI', unit:'psi', ph:'10' }, done:true,
      detail:'After cleaning or replacing a cartridge, restart the pump and log the gauge reading. Weekly readings are compared to this.' },
    { id:'stenner-tube-change', name:'Stenner pump tube replaced', done:true,
      detail:'Stenner manual: replace the duckbill check valve and ferrules at every tube change.' },
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
  if (!sec.days) return '<span class="eq-badge info">Last: ' + when + (e.value ? ' · ' + e.value + ' psi' : '') + by + '</span>';
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
  if (!clean || isNaN(v)) return clean ? '' : 'No clean pressure logged yet — log one under "As needed" next time the cartridge is cleaned.';
  const base = parseFloat(clean.value);
  if (isNaN(base)) return '';
  const rise = Math.round((v - base) * 10) / 10;
  if (rise >= 10) return '⚠ ' + rise + ' PSI above clean (' + base + ') — cartridge needs cleaning. Flag to Dini.';
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
        const fnote = (it.id === 'filter-psi' && s.value) ? '<div class="eq-fnote">' + equipFilterNote(pool, s.value) + '</div>' : '';
        return '<div class="eq-row' + (s.result === 'Issue' ? ' is-issue' : '') + '">' +
          '<div class="eq-row-main">' +
            (pool ? '<span class="eq-pool">' + EQUIP_POOL_NAMES[pool] + '</span>' : '') +
            equipBadge(sec, it.id, pool) +
          '</div>' +
          '<div class="eq-row-ctl">' + valIn +
            '<button class="eq-btn ok' + (s.result === okLabel ? ' on' : '') + '" onclick="equipSetRes(\'' + k + '\',\'' + okLabel + '\')">' + okLabel + '</button>' +
            '<button class="eq-btn issue' + (s.result === 'Issue' ? ' on' : '') + '" onclick="equipSetRes(\'' + k + '\',\'Issue\')">Issue</button>' +
          '</div>' + fnote +
          (s.result === 'Issue'
            ? '<input class="eq-note" placeholder="What\'s wrong? (required)" value="' + (s.notes || '').replace(/"/g,'&quot;') + '" oninput="equipSetNote(\'' + k + '\',this.value)">'
            : '') +
        '</div>';
      }).join('');
      return '<div class="eq-item">' +
        '<div class="eq-item-head"><span class="eq-item-name">' + it.name + '</span></div>' +
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
  el.innerHTML = ['phCal','orpSet','feedCheck','flashing','pauseFeed'].map(function(k) {
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
  // Live filter comparison without losing input focus
  if (k.indexOf('filter-psi|') === 0) {
    const row = document.activeElement && document.activeElement.closest('.eq-row');
    if (row) {
      let n = row.querySelector('.eq-fnote');
      if (!n) { n = document.createElement('div'); n.className = 'eq-fnote'; row.querySelector('.eq-row-ctl').after(n); }
      n.textContent = equipFilterNote(k.split('|')[1], v);
    }
  }
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
  let missingNote = false;
  sec.items.forEach(function(it) {
    (it.perPool ? EQUIP_POOLS : ['']).forEach(function(pool) {
      const s = _equipSel[equipKey(it.id, pool)];
      if (!s || !s.result) return;
      if (s.result === 'Issue' && !(s.notes || '').trim()) missingNote = true;
      let notes = s.notes || '';
      if (it.id === 'filter-psi' && s.value) {
        const fn = equipFilterNote(pool, s.value);
        if (fn.indexOf('⚠') === 0) notes = (notes ? notes + ' — ' : '') + fn;
      }
      entries.push({ frequency: sec.key, item_id: it.id, item: it.name, pool: pool,
                     result: s.result, value: s.value || '', notes: notes });
    });
  });
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
  entries.forEach(function(e) {
    _equipLast[equipKey(e.item_id, e.pool)] = {
      date: _equipToday, result: e.result, value: e.value || '', from: e.from || '', to: e.to || '', by: staff || '' };
  });
  equipRender();
}

// ─── LOAD ──────────────────────────────────────────────────────
async function fetchEquipmentChecks() {
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getEquipmentChecks');
    const data = await res.json();
    if (!data.success) return;
    _equipLast  = data.last || {};
    _equipToday = data.today || '';
    equipRender();
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

(function initEquipment() {
  const sel = document.getElementById('equip-staff');
  const main = document.getElementById('session-staff');
  if (sel && main) {
    sel.innerHTML = main.innerHTML;
    sel.addEventListener('change', function() { main.value = sel.value; main.dispatchEvent(new Event('change')); });
    main.addEventListener('change', function() { if (sel.value !== main.value) sel.value = main.value; });
  }
  equipRender();
  equipRenderHowto();
  fetchEquipmentChecks();
})();
