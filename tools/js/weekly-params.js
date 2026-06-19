
const SHEET_URL = SCRIPT_URL; // reuse same Apps Script
const POOLS_LIST = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];

// Show Tuesday banner if today is Tuesday
(function() {
  const day = new Date().getDay(); // 0=Sun, 2=Tue
  if (day === 2) {
    const banner = document.getElementById('tuesday-banner');
    if (banner) banner.style.display = 'flex';
  }
})();

// Cache of the last fetch from each sheet, used for discrepancy checks
let _poolStateParams = null;
let _weeklyParams    = null;

// Fetch Pool State — drives the hidden CH/TDS fields used for LSI calc
// and pre-fill on the Log Results tab. Updated automatically whenever
// Weekly Parameters is saved, or when a host overrides a value during
// a daily test.
async function fetchPoolState() {
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getPoolState');
    const data = await res.json();
    if (!data.success) return;
    console.log('Pool State loaded · backend version:', data.version);
    _poolStateParams = data.params || {};

    POOLS_LIST.forEach(function(pid) {
      const row = _poolStateParams[pid];
      if (!row) return;
      const cHid = document.getElementById(pid+'-calcium');
      const tHid = document.getElementById(pid+'-tds');
      const upd  = document.getElementById(pid+'-chtds-updated');
      if (row.calcium && cHid) cHid.value = row.calcium;
      if (row.tds     && tHid) tHid.value = row.tds;
      if (row.updated && upd)  upd.textContent = row.updated;
      if (row.calcium || row.tds) calc(pid);
    });

    checkDiscrepancies();
  } catch(e) {
    console.log('Could not fetch pool state:', e);
  }
}

// Fetch Weekly Parameters — the canonical record of Lucid's CH/TDS
// readings, written only by the Weekly Parameters tab. Drives the
// Weekly Parameters tab inputs and the staleness check.
async function fetchWeeklyParams() {
  try {
    const res  = await fetch(SCRIPT_URL + '?action=getWeeklyParams');
    const data = await res.json();
    if (!data.success) return;
    console.log('Weekly Parameters loaded · backend version:', data.version);
    _weeklyParams = data.params || {};

    // Determine last Monday's date for staleness check
    const now      = new Date();
    const dayOfWk  = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
    const daysBack = dayOfWk === 0 ? 6 : dayOfWk - 1; // days since last Monday
    const lastMon  = new Date(now); lastMon.setDate(now.getDate() - daysBack); lastMon.setHours(0,0,0,0);

    POOLS_LIST.forEach(function(pid) {
      const row = _weeklyParams[pid];
      if (!row) return;
      const wprCa  = document.getElementById('wpr-'+pid+'-calcium');
      const wprTds = document.getElementById('wpr-'+pid+'-tds');
      const wprUpd = document.getElementById('wpr-'+pid+'-updated');
      if (row.calcium && wprCa)  wprCa.value  = row.calcium;
      if (row.tds     && wprTds) wprTds.value = row.tds;
      if (row.updated && wprUpd) {
        const updDate = new Date(row.updated);
        const isStale = !isNaN(updDate.getTime()) && updDate < lastMon;
        wprUpd.textContent = fmtDay(row.updated) + (isStale ? ' ⚠ Update needed' : '');
        wprUpd.style.color = isStale ? 'var(--warn)' : '';
      }
    });

    checkDiscrepancies();
  } catch(e) {
    console.log('Could not fetch weekly params:', e);
  }
}

// Compare Pool State (what's currently driving the Log Results tab) against
// Weekly Parameters (Lucid's last official numbers). If they differ, flag it
// next to that pool's row on the Weekly Parameters tab — this can mean either
// a host corrected a value on-site that hasn't made it into Weekly Parameters
// yet, or Weekly Parameters was updated but a daily save hasn't run since.
function checkDiscrepancies() {
  if (!_poolStateParams || !_weeklyParams) return; // wait for both to load

  POOLS_LIST.forEach(function(pid) {
    const badge = document.getElementById('wpr-'+pid+'-discrepancy');
    if (!badge) return;

    const ps = _poolStateParams[pid];
    const wp = _weeklyParams[pid];
    if (!ps || !wp) { badge.style.display = 'none'; return; }

    const caDiff  = ps.calcium && wp.calcium && String(ps.calcium) !== String(wp.calcium);
    const tdsDiff = ps.tds     && wp.tds     && String(ps.tds)     !== String(wp.tds);

    if (caDiff || tdsDiff) {
      badge.style.display = 'block';
      badge.title = 'Log is currently using CH ' + (ps.calcium || '—') +
        ' / TDS ' + (ps.tds || '—') +
        ' — Weekly Parameters has CH ' + (wp.calcium || '—') +
        ' / TDS ' + (wp.tds || '—');
    } else {
      badge.style.display = 'none';
    }
  });
}


// Format any date string to "Wed May 28" — strip time and timezone
function fmtDay(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) {
      // If it's already something like "May 28, 2026, 1:21 PM", parse what we can
      const m = String(str).match(/(\w+ \d{1,2})/);
      return m ? m[1] : str;
    }
    return d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' });
  } catch(e) { return str; }
}

// Update hidden input + LSI when visible field changes
function chtdsUpdate(pid, field, val) {
  const hid = document.getElementById(pid+'-'+field);
  if (hid) hid.value = val;
  calc(pid);
}

// On page load: fetch CH/TDS from Sheet and today's saved pool status
fetchPoolState();
fetchWeeklyParams();
fetchTodayStatus();
updateSummaryStatus();


// On Tuesdays: highlight pool cards to signal CH/TDS required
(function() {
  if (new Date().getDay() !== 2) return;
  const pools = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];
  pools.forEach(function(pid) {
    const card = document.getElementById('card-'+pid);
    if (card) {
      card.style.outline = '2px solid var(--warn)';
      card.style.outlineOffset = '2px';
    }
  });
})();


// ══════ WEEKLY PER-POOL CH/TDS ══════════════════════════════

function weeklyPoolChange(pid, field, val) {
  // 1. Update the hidden input that calc() uses
  const hid = document.getElementById(pid+'-'+field);
  if (hid) hid.value = val;

  // 2. Trigger LSI recalc for this pool
  calc(pid);
}

// Weekly grid is populated from the Sheet on load via fetchWeeklyParams()
// No localStorage — Sheet is the single source of truth


// ══════ WEEKLY PARAMS SAVE TO SHEET ═════════════════════════

async function weeklyParamsSave() {
  const btn    = document.getElementById('weekly-save-btn');
  const status = document.getElementById('weekly-save-status');
  const pools  = ['sl-hot','sl-cold','eq-hot','eq-cold','so-hot','so-cold'];

  // Collect all values
  const entries = pools.map(pid => ({
    pool_id: pid,
    calcium: document.getElementById('wpr-'+pid+'-calcium')?.value || '',
    tds:     document.getElementById('wpr-'+pid+'-tds')?.value || '',
  })).filter(e => e.calcium || e.tds);

  if (entries.length === 0) {
    if (status) status.textContent = 'No values to save.';
    return;
  }

  if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
  if (status) status.textContent = '';

  const now = new Date().toLocaleString('en-US', {
    month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'
  });

  // Apply success UI: update timestamps, sync hidden inputs, recalc LSI
  function applyWeeklySaveSuccess() {
    pools.forEach(pid => {
      const updEl = document.getElementById('wpr-'+pid+'-updated');
      if (updEl) updEl.textContent = now;
      // Sync to pool card hidden inputs
      const ca  = document.getElementById('wpr-'+pid+'-calcium')?.value;
      const tds = document.getElementById('wpr-'+pid+'-tds')?.value;
      if (ca)  { const hid = document.getElementById(pid+'-calcium'); if (hid) hid.value = ca; }
      if (tds) { const hid = document.getElementById(pid+'-tds');     if (hid) hid.value = tds; }
      const chtdsUpd = document.getElementById(pid+'-chtds-updated');
      if (chtdsUpd) chtdsUpd.textContent = now;
      // saveWeeklyParams also pushes these values into Pool State server-side,
      // so update our local caches the same way.
      if (ca || tds) {
        _weeklyParams    = _weeklyParams    || {};
        _poolStateParams = _poolStateParams || {};
        const wpRow = _weeklyParams[pid]    || {};
        const psRow = _poolStateParams[pid] || {};
        if (ca)  { wpRow.calcium = ca;  psRow.calcium = ca; }
        if (tds) { wpRow.tds     = tds; psRow.tds     = tds; }
        wpRow.updated = now; psRow.updated = now; psRow.source = 'weekly';
        _weeklyParams[pid]    = wpRow;
        _poolStateParams[pid] = psRow;
      }
      if (ca || tds) calc(pid);
    });
    checkDiscrepancies();
    if (btn) { btn.textContent = 'Saved ✓'; }
    if (status) status.textContent = `Saved at ${now}`;
    setTimeout(() => {
      if (btn) { btn.textContent = 'Save CH & TDS to Sheet'; btn.disabled = false; }
    }, 3000);
  }

  try {
    const res  = await fetch(SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({ action: 'saveWeeklyParams', entries }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    applyWeeklySaveSuccess();
  } catch(e) {
    // Safari throws on Google Apps Script POST redirects even when the
    // save actually succeeded. Verify by re-fetching before showing error.
    try {
      const check = await fetch(SCRIPT_URL + '?action=getWeeklyParams');
      const cdata = await check.json();
      const first = entries[0];
      if (cdata.success && cdata.params && first &&
          String((cdata.params[first.pool_id] || {}).calcium) === String(first.calcium)) {
        applyWeeklySaveSuccess();
        return;
      }
    } catch(e2) {}
    if (btn) { btn.textContent = 'Error — try again'; btn.disabled = false; }
    if (status) status.textContent = 'Save failed.';
  }
}


function wizJumpTo(pid, stepIndex) {
  const st = _wizState[pid];
  if (!st) return;
  // Only allow jumping to completed steps or current step
  if (stepIndex > st.step) return;
  st.step = stepIndex;
  wizRender(pid);
  wizSaveLocal(pid);
