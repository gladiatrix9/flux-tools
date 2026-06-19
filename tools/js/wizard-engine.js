// ══════ WIZARD ENGINE ══════════════════════════════════════════

const WIZ_STEPS = [
  { field:'temp',     label:'Water Temp',         hint:'thermometer reading',
    unit:'°F',    itype:'number', istep:'0.5', imin:'0',   imax:'130',
    instr:'<ol class="wiz-steps-ol"><li>Locate the thermometer at the pool.</li><li>Read the temperature in °F.</li><li>Enter the reading below.</li></ol>' },
    { field:'free',     label:'Free Chlorine',       hint:'R-0870 + R-0871 — count drops to colorless',
    unit:'drops', itype:'number',            imin:'0',   imax:'99',
    instr:'<ol class="wiz-steps-ol"><li>Sample water <strong>18 inches below the surface.</strong></li><li>Fill the large tube to the <strong>25 mL mark.</strong></li><li>Add <strong>2 dry level scoops of R-0870</strong> — scoop must be completely dry and residue-free.</li><li>Swirl until dissolved. If the sample turns pink, chlorine is present.</li><li>Add <strong>R-0871 drop by drop</strong> (hold dropper completely vertical), swirling and counting after each drop, until the sample turns <strong>colorless.</strong></li><li>At the endpoint: add one final confirming drop. If clear, stop — do not count it. If pink returns, keep titrating.</li><li>If no pink develops after R-0870, enter 0.</li><li><strong>Do not dump the tube — the next step uses the same sample.</strong></li></ol>' },
    { field:'combined', label:'Combined Chlorine',   hint:'same tube + R-0003 — once daily, midday or peak load',
    unit:'drops', itype:'number',            imin:'0',   imax:'99',
    instr:'<ol class="wiz-steps-ol"><li>Using the <strong>same tube from the Free Chlorine step</strong> — do not dump.</li><li>Add <strong>5 drops R-0003</strong> (hold dropper completely vertical). Swirl to mix.</li><li>If the sample turns pink again, combined chlorine is present.</li><li>Add <strong>R-0871 drop by drop</strong> (hold completely vertical), swirling and counting after each drop, until colorless.</li><li>At the endpoint: add one confirming drop. If clear, stop. If pink returns, keep titrating.</li><li>If the sample stays clear after R-0003, enter 0.</li></ol>' },
  { field:'ph',       label:'pH',                  hint:'color match — enter directly',
    unit:'',      itype:'number', istep:'0.1', imin:'6.8', imax:'8.4',
    instr:'<ol class="wiz-steps-ol"><li>Fill a <strong>fresh large tube to the 44 mL mark</strong> with pool water.</li><li>Add <strong>5 drops R-0004</strong> (hold dropper completely vertical).</li><li>Cap the tube and invert gently to mix — do not shake.</li><li>Compare the color to the <strong>pH comparator block</strong> in natural light, holding against a white background.</li><li>Enter the matching pH value below.</li></ol>' },
  { field:'alk',      label:'Total Alkalinity',    hint:'R-0009 drops × 10 = ppm TA',
    unit:'drops', itype:'number',            imin:'0',   imax:'30',
    instr:'<ol class="wiz-steps-ol"><li>Fill the large tube to the <strong>25 mL mark.</strong></li><li>Add <strong>2 drops R-0007,</strong> then <strong>5 drops R-0008.</strong></li><li>The sample will turn <strong>green.</strong></li><li>Add <strong>R-0009 drop by drop</strong> (hold dropper completely vertical), swirling after each drop, until the color changes to <strong>red.</strong></li><li>At the endpoint: add one confirming drop. If color holds, stop. If it returns to green, keep titrating.</li><li>Enter your drop count — drop count × 10 = ppm TA.</li></ol>' },
  { field:'orp',      label:'ORP',                 hint:'log from IPS M920 display',
    unit:'mV',    itype:'number',            imin:'0',   imax:'999',
    instr:'<ol class="wiz-steps-ol"><li>Go to the <strong>IPS M920 controller display.</strong></li><li>Read the ORP value shown.</li><li>Enter the reading below.</li><li>If the reading looks significantly different from recent readings, flag to Dini after saving.</li></ol>' }
];

const _wizState = {};

function wizInit(pid) {
  let saved = null;
  try { const r = localStorage.getItem('flux-wiz-'+pid); if (r) saved = JSON.parse(r); } catch(e) {}
  if (saved && !saved.submitted && saved.values && Object.keys(saved.values).length > 0) {
    const banner = document.getElementById('wiz-'+pid+'-resume');
    if (banner) banner.style.display = 'flex';
    _wizState[pid] = { step:0, values:{}, instrOpen:false };
  } else {
    wizStart(pid, false);
  }
}

function wizStart(pid, fresh) {
  const b = document.getElementById('wiz-'+pid+'-resume');
  if (b) b.style.display = 'none';
  if (fresh) {
    try { localStorage.removeItem('flux-wiz-'+pid); } catch(e) {}
    WIZ_STEPS.forEach(function(s) {
      const el = document.getElementById(pid+'-'+s.field);
      if (el) el.value = '';
    });
    calc(pid);
  }
  _wizState[pid] = { step:0, values:{}, instrOpen:false };
  wizRender(pid);
}

// ORP chip update — calc() skips ORP, so we handle it here and in wizRenderReview
function applyOrpChip(pid, val) {
  const orpChip = document.getElementById(pid+'-orp-result');
  if (!orpChip || !val) return;
  const v = parseFloat(val);
  const ok   = v >= 650 && v <= 750;
  const warn = (v >= 600 && v < 650) || (v > 750 && v <= 800);
  orpChip.className = ok ? 'result-chip ok' : warn ? 'result-chip warn' : 'result-chip alert';
  orpChip.innerHTML = `<span class="chip-dot"></span>${val} mV`;
}

function wizResume(pid) {
  const b = document.getElementById('wiz-'+pid+'-resume');
  if (b) b.style.display = 'none';
  try {
    const r = localStorage.getItem('flux-wiz-'+pid);
    if (r) {
      const sv = JSON.parse(r);
      _wizState[pid] = { step: sv.step||0, values: sv.values||{}, instrOpen:false };
      Object.entries(_wizState[pid].values).forEach(function(kv) {
        if (kv[0] === 'actionTaken') return;
        const el = document.getElementById(pid+'-'+kv[0]);
        if (el) el.value = kv[1];
      });
      calc(pid);
      applyOrpChip(pid, _wizState[pid].values.orp); // calc() doesn't handle ORP
    }
  } catch(e) { wizStart(pid,false); return; }
  wizRender(pid);
}

function wizSaveLocal(pid) {
  try {
    localStorage.setItem('flux-wiz-'+pid, JSON.stringify({
      step: _wizState[pid].step,
      values: _wizState[pid].values
    }));
  } catch(e) {}
}

function wizRender(pid) {
  const st = _wizState[pid];
  if (!st) return;
  WIZ_STEPS.forEach(function(_, i) {
    const d = document.getElementById('wiz-'+pid+'-dot-'+i);
    if (!d) return;
    d.className = 'wiz-step-dot' + (i < st.step ? ' done' : i === st.step ? ' active' : '');
  });
  const cntEl = document.getElementById('wiz-'+pid+'-stepcount');
  if (cntEl) cntEl.textContent = st.step < WIZ_STEPS.length
    ? 'Step '+(st.step+1)+' of '+WIZ_STEPS.length : 'Review';
  if (st.step >= WIZ_STEPS.length) wizRenderReview(pid);
  else wizRenderStep(pid);
}

function wizRenderStep(pid) {
  const st = _wizState[pid];
  const s  = WIZ_STEPS[st.step];
  const stepEl = document.getElementById('wiz-'+pid+'-step');
  const navEl  = document.getElementById('wiz-'+pid+'-nav');
  if (!stepEl || !navEl) return;
  const val    = st.values[s.field] !== undefined ? st.values[s.field] : '';
  const isLast = st.step === WIZ_STEPS.length - 1;
  const isFirst= st.step === 0;
  const chipEl = document.getElementById(pid+'-'+s.field+'-result');
  const chipH  = chipEl ? chipEl.outerHTML.replace(/id="[^"]*"/,'id="wiz-rc-'+pid+'"') : '';
  const arr    = st.instrOpen ? '▾' : '▸';
  const iopen  = st.instrOpen ? ' open' : '';
  const stepAttr = s.istep ? ' step="'+s.istep+'"' : '';

  stepEl.innerHTML =
    '<div class="wiz-param-name">'+s.label+'</div>'+
    '<div class="wiz-param-hint">'+s.hint+'</div>'+
    '<button class="wiz-instr-toggle" onclick="wizToggleInstr(\''+pid+'\')">'+
      '<span id="wiz-'+pid+'-arr">'+arr+'</span>\u00a0 How to measure'+
    '</button>'+
    '<div class="wiz-instr-body'+iopen+'" id="wiz-'+pid+'-instr">'+s.instr+'</div>'+
    '<div class="wiz-input-row">'+
      '<input class="wiz-input" type="'+s.itype+'"'+stepAttr+
        ' min="'+(s.imin||'')+'" max="'+(s.imax||'')+'"'+
        ' value="'+_wizEsc(val)+'" placeholder="—"'+
        ' id="wiz-inp-'+pid+'"'+
        ' oninput="wizOnInput(\''+pid+'\',\''+s.field+'\',this.value)">'+
      (s.unit ? '<span class="wiz-unit">'+s.unit+'</span>' : '')+
      chipH+
    '</div>';

  navEl.innerHTML =
    '<button class="wiz-btn-back" onclick="wizBack(\''+pid+'\')"'+
      (isFirst ? ' style="visibility:hidden"' : '')+'>&#8592; Back</button>'+
    '<button class="wiz-btn-next" onclick="wizNext(\''+pid+'\')">'+
      (isLast ? 'Review &#8594;' : 'Next &#8594;')+'</button>';

  setTimeout(function() {
    const inp = document.getElementById('wiz-inp-'+pid);
    if (inp) inp.focus();
  }, 60);
}

function wizRenderReview(pid) {
  const st     = _wizState[pid];
  const stepEl = document.getElementById('wiz-'+pid+'-step');
  const navEl  = document.getElementById('wiz-'+pid+'-nav');
  if (!stepEl || !navEl) return;

  applyOrpChip(pid, st.values.orp); // ensure ORP chip is current before reading outerHTML
  const rows = WIZ_STEPS.map(function(s) {
    const chipEl = document.getElementById(pid+'-'+s.field+'-result');
    const chipH  = chipEl ? chipEl.outerHTML.replace(/id="[^"]*"/,'') : '';
    return '<div class="wiz-review-row">'+
      '<span class="wiz-review-label">'+s.label+'</span>'+
      (chipH || '<span>'+(st.values[s.field]||'—')+'</span>')+
    '</div>';
  }).join('');

  const lsiEl  = document.getElementById(pid+'-lsi');
  const lsiH   = lsiEl ? lsiEl.outerHTML.replace(/id="[^"]*"/,'') : '';
  const ovEl   = document.getElementById(pid+'-overall');
  const ovH    = ovEl  ? ovEl.outerHTML.replace(/id="[^"]*"/,'')  : '';
  const actEl  = document.getElementById(pid+'-actions');
  const actH   = (actEl && actEl.children.length)
    ? '<div class="wiz-rec-actions">'+actEl.innerHTML+'</div>' : '';
  const atVal  = _wizEsc(st.values.actionTaken || '');

  const caVal  = document.getElementById(pid+'-calcium')?.value || '';
  const tdsVal = document.getElementById(pid+'-tds')?.value || '';
  const caUpd  = document.getElementById(pid+'-chtds-updated')?.textContent || '';
  const updTag = caUpd ? ' <span class="wiz-chtds-upd">(last updated '+fmtDay(caUpd)+')</span>' : '';
  const chRow  =
    '<div class="wiz-review-row wiz-chtds-row">'+
      '<span class="wiz-review-label wiz-chtds-label">Calcium Hardness'+updTag+'</span>'+
      '<div class="wiz-chtds-cell">'+
        '<input class="wiz-chtds-input" type="number" value="'+caVal+'" placeholder="—"'+
          ' oninput="chtdsUpdate(\''+pid+'\',\'calcium\',this.value)">'+
        '<span class="wiz-chtds-unit">ppm</span>'+
      '</div>'+
    '</div>';
  const tdsRow =
    '<div class="wiz-review-row wiz-chtds-row">'+
      '<span class="wiz-review-label wiz-chtds-label">TDS'+updTag+'</span>'+
      '<div class="wiz-chtds-cell">'+
        '<input class="wiz-chtds-input" type="number" value="'+tdsVal+'" placeholder="—"'+
          ' oninput="chtdsUpdate(\''+pid+'\',\'tds\',this.value)">'+
        '<span class="wiz-chtds-unit">ppm</span>'+
      '</div>'+
    '</div>';
  stepEl.innerHTML =
    '<div class="wiz-review-title">Review readings</div>'+
    rows+
    chRow+tdsRow+
    '<div class="wiz-lsi-row"><span class="wiz-lsi-label">LSI</span>'+lsiH+'</div>'+
    '<div class="wiz-status-row"><span class="wiz-status-label">Pool Status</span>'+ovH+'</div>'+
    actH+
    '<div class="wiz-action-section">'+
      '<div class="wiz-action-label">Action Taken</div>'+
      '<textarea class="action-taken-input" id="'+pid+'-action-taken" rows="2"'+
        ' placeholder="Note what was done, or \'no action needed\'..."'+
        ' oninput="wizSaveAt(\''+pid+'\',this.value)">'+atVal+'</textarea>'+
    '</div>';

  navEl.innerHTML =
    '<button class="wiz-btn-back" onclick="wizBack(\''+pid+'\')">&#8592; Back</button>'+
    '<button class="wiz-btn-next wiz-btn-save" id="'+pid+'-save-btn"'+
      ' onclick="savePool(\''+pid+'\')">Save to Sheet</button>';

  // Scroll card into view on mobile
  const card = document.getElementById('card-'+pid);
  if (card) card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function wizOnInput(pid, field, val) {
  const st = _wizState[pid]; if (!st) return;
  st.values[field] = val;
  const hidden = document.getElementById(pid+'-'+field);
  if (hidden) { hidden.value = val; calc(pid); }
  // ORP: calc() doesn't evaluate it, update chip directly
  if (field === 'orp') {
    applyOrpChip(pid, val);
    const orpChip = document.getElementById(pid+'-orp-result');
    const disp    = document.getElementById('wiz-rc-'+pid);
    if (orpChip && disp) { disp.className = orpChip.className; disp.innerHTML = orpChip.innerHTML; }
  } else {
    const srcChip  = document.getElementById(pid+'-'+field+'-result');
    const dispChip = document.getElementById('wiz-rc-'+pid);
    if (srcChip && dispChip) { dispChip.className = srcChip.className; dispChip.innerHTML = srcChip.innerHTML; }
  }
  wizSaveLocal(pid);
}


function wizSaveAt(pid, val) {
  if (_wizState[pid]) _wizState[pid].values.actionTaken = val;
  wizSaveLocal(pid);
}

function wizToggleInstr(pid) {
  const st = _wizState[pid]; if (!st) return;
  st.instrOpen = !st.instrOpen;
  const body = document.getElementById('wiz-'+pid+'-instr');
  const arr  = document.getElementById('wiz-'+pid+'-arr');
  if (body) body.classList.toggle('open', st.instrOpen);
  if (arr)  arr.textContent = st.instrOpen ? '▾' : '▸';
}

function wizNext(pid) {
  const st = _wizState[pid]; if (!st) return;
  st.step = Math.min(st.step+1, WIZ_STEPS.length);
  wizSaveLocal(pid);
  wizRender(pid);
}

function wizBack(pid) {
  const st = _wizState[pid]; if (!st || st.step <= 0) return;
  st.step--;
  wizRender(pid);
}

function _wizEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// Initialise all wizards once DOM ready
(function() {
  ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'].forEach(wizInit);
})();


// ══════ CH/TDS MANAGEMENT ══════════════════════════════════════
