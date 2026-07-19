// ─── SAVE TO SHEET ───────────────────────────────────────────
async function savePool(poolId) {
  // Validate: staff name is required
  const staffEl = document.getElementById('session-staff');
  const staffMsg = document.getElementById('staff-required-msg');
  if (!staffEl || !staffEl.value) {
    if (staffEl) { staffEl.classList.add('required-error'); staffEl.focus(); }
    if (staffMsg) staffMsg.style.display = 'block';
    setTimeout(function() {
      if (staffEl) staffEl.classList.remove('required-error');
      if (staffMsg) staffMsg.style.display = 'none';
    }, 4000);
    return;
  }
  const pool = POOLS[poolId];
  const g = id => document.getElementById(id)?.value || '';

  const freeD = g(`${poolId}-free`);
  const combD = g(`${poolId}-combined`);
  const alkD  = g(`${poolId}-alk`);

  const actionsEl  = document.getElementById(`${poolId}-actions`);
  const recActions = actionsEl
    ? Array.from(actionsEl.querySelectorAll('.action-item')).map(el => el.textContent.trim()).join(' | ')
    : '';

  const lsiEl   = document.getElementById(`${poolId}-lsi`);
  const payload = {
        staff:              g('session-staff'),
    room:               pool.room,
    pool_type:          pool.type === 'hot' ? 'HOT' : 'COLD',
    volume:             pool.vol,
    temp:               g(`${poolId}-temp`),
    free_drops:         freeD,
    free_ppm:           freeD ? (parseFloat(freeD) * 0.2).toFixed(1) : '',
    combined_drops:     combD,
    combined_ppm:       combD ? (parseFloat(combD) * 0.2).toFixed(1) : '',
    ph:                 g(`${poolId}-ph`),
    alk_drops:          alkD,
    alk_ppm:            alkD  ? (parseFloat(alkD) * 10).toFixed(0) : '',
    orp:                g(`${poolId}-orp`),
    lsi:                lsiEl ? lsiEl.textContent.replace(/[^0-9.\-+]/g,'').trim() : '',
    status:             document.getElementById(`${poolId}-overall`)?.textContent || '',
    recommended_action: recActions,    pool_id:             poolId,
    calcium:             document.getElementById(`${poolId}-calcium`)?.value || '',
    tds:                 document.getElementById(`${poolId}-tds`)?.value || '',

    action_taken:       g(`${poolId}-action-taken`),
  };

  const btn = document.getElementById(`${poolId}-save-btn`);
  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

  try {
    const res  = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.success) {
      if (btn) { btn.textContent = 'Saved ✓'; btn.className = 'save-btn saved'; }
      try { localStorage.removeItem('flux-wiz-' + poolId); } catch(e) {}
      markPoolSaved(poolId);

      // If this save's CH/TDS differ from what we last loaded for Pool
      // State, the backend just recorded a 'daily-override' — mirror that
      // locally so the discrepancy badge updates without a page refresh.
      if (payload.calcium || payload.tds) {
        _poolStateParams = _poolStateParams || {};
        const prev = _poolStateParams[poolId] || {};
        const changed = (payload.calcium && String(payload.calcium) !== String(prev.calcium || '')) ||
                        (payload.tds     && String(payload.tds)     !== String(prev.tds     || ''));
        if (changed) {
          _poolStateParams[poolId] = {
            calcium: payload.calcium || prev.calcium || '',
            tds:     payload.tds     || prev.tds     || '',
            updated: new Date().toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }),
            source:  'daily-override',
          };
          checkDiscrepancies();
        }
      }

      setTimeout(() => {
        if (btn) { btn.textContent = 'Save to Sheet'; btn.className = 'save-btn'; btn.disabled = false; }
      }, 3000);
    } else {
      if (btn) { btn.textContent = 'Error — try again'; btn.className = 'save-btn error'; btn.disabled = false; }
      console.error('Save failed:', json.error);
    }
  } catch(e) {
    // Safari throws on GAS POST redirects even when the save succeeded.
    // Verify by checking today's status before showing error.
    try {
      const check = await fetch(SCRIPT_URL + '?action=getTodayStatus');
      const cdata = await check.json();
      if (cdata.success && cdata.status && cdata.status[poolId] && cdata.status[poolId].saved) {
        if (btn) { btn.textContent = 'Saved ✓'; btn.className = 'save-btn saved'; }
        markPoolSaved(poolId);
        setTimeout(() => {
          if (btn) { btn.textContent = 'Save to Sheet'; btn.className = 'save-btn'; btn.disabled = false; }
        }, 3000);
        return;
      }
    } catch(e2) {}
    if (btn) { btn.textContent = 'Error — try again'; btn.className = 'save-btn error'; btn.disabled = false; }
    console.error('Save error:', e);
  }
}

// ─── TAB SWITCHING ───────────────────────────────────────────
function switchTab(id) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active',
      (i === 0 && id === 'howto')     ||
      (i === 1 && id === 'log')       ||
      (i === 2 && id === 'weekly')    ||
      (i === 3 && id === 'reference')
    );
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + id).classList.add('active');
}


// ─── DAILY SUMMARY ───────────────────────────────────────────

// Track which pools have been saved this session
// Track which pools have been saved today — restored from Sheet on load
const _savedPools = new Set();

function markPoolSaved(pid) {
  _savedPools.add(pid);
  updateSummaryStatus();
}

function updateSummaryStatus() {
  const all       = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];
  const names     = {
    'sl-hot':'SL Hot','sl-cold':'SL Cold',
    'eq-hot':'Eq Hot','eq-cold':'Eq Cold',
    'so-hot':'Sol Hot','so-cold':'Sol Cold'
  };
  const saved     = all.filter(p => _savedPools.has(p));
  const remaining = all.filter(p => !_savedPools.has(p));
  const sub = document.getElementById('summary-pool-status');
  const btn = document.getElementById('summary-send-btn');

  if (saved.length === 0) {
    if (sub) { sub.textContent = 'Save all 6 pools before sending.'; sub.className = 'summary-footer-sub'; }
    if (btn) btn.disabled = true;
  } else if (saved.length < 6) {
    const rem = remaining.map(p => names[p]).join(', ');
    if (sub) { sub.textContent = `${saved.length}/6 saved — still need: ${rem}.`; sub.className = 'summary-footer-sub partial'; }
    if (btn) btn.disabled = true;
  } else {
    if (sub) { sub.textContent = 'All 6 pools saved — ready to send.'; sub.className = 'summary-footer-sub ready'; }
    if (btn) btn.disabled = false;
  }
}

// On page load: fetch today's saved pools from the Sheet and restore state
async function fetchTodayStatus() {
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getTodayStatus');
    const data = await res.json();
    if (!data.success) return;
    Object.entries(data.status).forEach(function([pid, info]) {
      if (info.saved) {
        _savedPools.add(pid);
        // Update the pool's save button to show it was already saved today
        const btn = document.getElementById(pid+'-save-btn');
        if (btn) { btn.textContent = 'Saved ✓'; btn.className = 'save-btn saved'; }
      }
    });
    updateSummaryStatus();
  } catch(e) {
    console.log('Could not fetch today status:', e);
  }
}

async function sendDailySummary() {
  const btn    = document.getElementById('summary-send-btn');
  const status = document.getElementById('summary-send-status');
  const staff  = document.getElementById('session-staff')?.value || '';

  if (!staff) {
    if (status) status.textContent = 'Please select your name at the top of the page first.';
    return;
  }

  if (btn) { btn.textContent = 'Sending…'; btn.disabled = true; }
  if (status) status.textContent = '';

  try {
    const res  = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({ action: 'sendDailySummary', staff }),
    });
    const json = await res.json();
    if (json.success) {
      if (btn) { btn.textContent = 'Sent ✓'; btn.className = 'summary-send-btn sent'; btn.disabled = true; }
      if (status) status.textContent = `Summary sent to hello@flux-lounge.com · ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`;
    } else {
      if (btn) { btn.textContent = 'Send daily summary →'; btn.disabled = false; }
      if (status) status.textContent = 'Send failed — check your connection and try again.';
    }
  } catch(e) {
    // Safari throws on GAS POST redirects even when the action succeeded.
    // Do a quick GET to confirm the backend is reachable; if so, assume sent.
    try {
      const check = await fetch(SCRIPT_URL + '?action=getTodayStatus');
      const cdata = await check.json();
      if (cdata.success) {
        if (btn) { btn.textContent = 'Sent ✓'; btn.className = 'summary-send-btn sent'; btn.disabled = true; }
        if (status) status.textContent = `Summary sent to hello@flux-lounge.com · ${new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}`;
        return;
      }
    } catch(e2) {}
    if (btn) { btn.textContent = 'Send daily summary →'; btn.disabled = false; }
    if (status) status.textContent = 'Send failed — check your connection and try again.';
  }
}

// ─── AUTO DATE ───────────────────────────────────────────────

