// ─── MAIN CALC ───────────────────────────────────────────────
// Principles:
//   • The Taylor kit is the ground truth. The IPS controller drifts, so
//     when its pH reading disagrees with Taylor, calibrate it first.
//   • Free chlorine and combined chlorine are evaluated separately.
//     Chlorine is never recommended when FC is already above range.
//   • Low FC → dose by hand now AND find out why the auto-feed isn't
//     keeping up (feed system vs. ORP set level).
//   • High FC → pause / turn down the feed. Chlorine dissipates on its own.
//   • ORP set level changes: 5 mV at a time, once per pool per day,
//     No min/max — ORP doesn't track real chlorine closely enough to cap it;
//     every change is logged so Dini can see drift over time.
//   • No closures. 0 ppm FC → dose by hand now; guests soak again once FC
//     is back in the comfortable range.

// Prefill hints for the review screen's "IPS adjustments" block.
const _calcHints = {};

function calc(poolId) {
  const pool  = POOLS[poolId];
  const doses = DOSES[poolId];
  const R     = getRanges(pool.type);
  const oset  = ORP_SET[pool.type];

  const num = id => parseFloat(document.getElementById(`${poolId}-${id}`)?.value);
  const tempV   = num('temp');
  const freeD   = num('free');
  const combD   = num('combined');
  const phV     = num('ph');
  const ipsPhV  = num('ipsph');
  const alkD    = num('alk');
  const orpV    = num('orp');
  const calcium = num('calcium');
  const tds     = num('tds');

  const freePpm = freeD * 0.2;
  const combPpm = combD * 0.2;
  const alkPpm  = alkD  * 10;

  const statuses = [];
  const actions  = [];   // { st, label, msg, pri }  pri: 0 urgent, 1 calibrate, 2 normal
  const hints    = {};
  _calcHints[poolId] = hints;

  // Current ORP1 set level: last one logged, else commissioning value.
  const loggedSet = currentOrpSetLevel(poolId);
  const setLevel  = loggedSet !== null ? loggedSet : oset.default;
  const setWord   = loggedSet !== null ? 'its' : 'the usual';   // until a set level has been recorded

  // ORP set-level advice with guardrails. dir = +1 raise / -1 lower.
  function orpSetAdvice(dir) {
    const done = orpAdjustedToday(poolId);
    if (done) {
      return ` The ORP1 set level was already adjusted today${done.by ? ' by ' + done.by : ''} (to ${done.to} mV) — <strong>don't adjust it again today.</strong> If this keeps happening, flag to Dini.`;
    }
    const next = setLevel + dir * oset.step;
    const flag = orpDriftFlag(poolId, setLevel, next);
    // Only prefill the review screen when we actually know the current set level.
    hints.orpRec = dir;
    if (loggedSet !== null) hints.orp = { from: setLevel, to: next };
    const known = loggedSet !== null
      ? `${setLevel} → ${next} mV`
      : `check the current value on the controller first`;
    return ` ${dir > 0 ? 'Raise' : 'Lower'} the <strong>ORP1 set level by 5 mV</strong> (${known}) and log it in the review screen.` +
      (flag ? ` <strong>Note:</strong> ${flag} — add a note when you log it; this gets flagged to Dini.` : '') + howtoInline('orpSet');
  }

  // ── TEMP ──
  if (!isNaN(tempV)) {
    const r = R.temp;
    let st;
    if      (tempV >= r.okLow && tempV <= r.okHigh)     st = 'ok';
    else if (tempV >= r.warnLow && tempV <= r.warnHigh) st = 'warn';
    else                                                  st = 'alert';
    statuses.push(st);
    setChip(`${poolId}-temp-result`, tempV.toFixed(1) + ' °F', st);
    if (st !== 'ok') {
      const sys = pool.type === 'hot' ? 'heating' : 'chilling';
      if (tempV < r.okLow) {
        actions.push({ st, pri: st === 'alert' ? 0 : 2, label: 'Temp', msg: st === 'alert'
          ? `Critically low — check ${sys} system and flag to Dini immediately.`
          : `Low — check ${sys} system. Re-test in 30 min.` });
      } else {
        actions.push({ st, pri: st === 'alert' ? 0 : 2, label: 'Temp', msg: st === 'alert'
          ? `Too high — ${pool.type === 'hot' ? 'pool must close immediately. Alert Dini.' : 'alert Dini immediately.'}`
          : `High — check ${sys} system. Alert Dini if not resolved in 30 min.` });
      }
    }
  } else { clearChip(`${poolId}-temp-result`, '—'); }

  // ── FREE CHLORINE ──
  const clTarget = pool.type === 'hot' ? 3.0 : 2.5;
  let freeSt = null, combSt = null;
  let fcCritical = false, fcLow = false, fcHigh = false, fcVeryHigh = false;

  if (!isNaN(freeD)) {
    const r = R.free;
    if      (freePpm >= r.okLow && freePpm <= r.okHigh)     freeSt = 'ok';
    else if (freePpm >= r.warnLow && freePpm <= r.warnHigh) freeSt = 'warn';
    else                                                     freeSt = 'alert';
    statuses.push(freeSt);
    setChip(`${poolId}-free-result`, freePpm.toFixed(1) + ' ppm', freeSt);

    fcCritical = freePpm < r.warnLow;
    fcLow      = !fcCritical && freePpm < r.okLow;
    fcHigh     = freePpm > r.okHigh;
    fcVeryHigh = freePpm > r.warnHigh;
    const fc   = freePpm.toFixed(1);

    if (fcCritical || fcLow) {
      const dose = fmtLiquid(doses.cl * (clTarget - freePpm));
      // Why isn't the controller keeping up? Compare its ORP reading to the set level.
      let why;
      const lowAlert = ipsSettingNum(poolId, 'ips-orp-low');
      const phHighAl = ipsSettingNum(poolId, 'ips-ph-high') ?? 8.0;
      if (!isNaN(ipsPhV) && ipsPhV >= phHighAl) {
        why = ` The controller reads pH ${ipsPhV.toFixed(1)}, at or above its pH High Alert (${phHighAl}), which <strong>also stops chlorine feed</strong>. Fix pH first (see pH below), then confirm the alert light goes off.`;
      } else if (lowAlert !== null && !isNaN(orpV) && orpV < lowAlert) {
        why = ` The controller reads ORP ${orpV} mV, below its Low Alert (${lowAlert} mV), so it has <strong>stopped feeding chlorine on purpose</strong> — that's the leak protection. Before relying on the auto-feed, check the feed system for leaks.` + howtoInline('feedCheck') +
          ` Once your hand dose brings ORP back above ${lowAlert} mV for a minute, the controller starts feeding again on its own — watch that FC holds.`;
      } else if (isNaN(orpV)) {
        why = ' Then check the IPS ORP reading to see whether the controller is calling for chlorine.';
      } else if (orpV >= setLevel - 10) {
        // Controller sees enough ORP → it isn't feeding. Set level is too low for real FC.
        why = ` The controller reads ORP ${orpV} mV — at or above ${setWord} ~${setLevel} mV set level, so it isn't feeding.` + orpSetAdvice(+1);
      } else {
        // Controller sees low ORP → it should be feeding. Feed system problem.
        why = ` The controller reads ORP ${orpV} mV, below ${setWord} ~${setLevel} mV set level, so it <em>should</em> be feeding chlorine — <strong>check the feed system</strong>.` + howtoInline('feedCheck');
      }
      if (freePpm === 0) {
        // No measurable chlorine — fix it right away; guests soak once it's back.
        actions.push({ st: 'alert', pri: 0, label: '⚠ Free Cl — none detected', msg:
          `No free chlorine detected. <strong>Add ${dose} Hasachlor by hand now</strong> with pumps running to bring FC to ${clTarget.toFixed(1)} ppm. Re-test in 30 min — guests can soak again once FC is at least ${r.okLow} ppm. Keep dosing by hand until the auto-feed is keeping up.${why} Alert Dini now.` });
      } else if (fcCritical) {
        const what = `Very low (${fc} ppm)`;
        actions.push({ st: 'alert', pri: 0, label: '⚠ Free Cl — urgent', msg:
          `${what}. <strong>Add ${dose} Hasachlor by hand now</strong> with pumps running to bring FC to ${clTarget.toFixed(1)} ppm. Re-test in 30 min and repeat until FC is back in range and the auto-feed is keeping up.${why} Alert Dini now.` });
      } else {
        actions.push({ st: 'warn', pri: 2, label: 'Free Cl', msg:
          `Low (${fc} ppm). Add <strong>${dose} Hasachlor</strong> with pumps running to bring FC to ${clTarget.toFixed(1)} ppm. Wait 10 min, re-test.${why}` });
      }

    } else if (fcHigh) {
      let msg = `${fcVeryHigh ? 'Very high' : 'Above the comfortable range'} (${fc} ppm) — <strong>don't add chlorine.</strong> It will come down on its own as it's used up.`;
      if (!isNaN(orpV) && orpV < setLevel - 10) {
        // Controller thinks ORP is low even though FC is high → sensor reading low.
        msg += ` The controller reads ORP ${orpV} mV (below ${setWord} ~${setLevel} mV set level), so it's probably still feeding — the ORP sensor is likely reading low. Pause the feed and flag to Dini to clean the ORP sensor.` + howtoInline('pauseFeed');
      } else {
        if (fcVeryHigh) msg += ' Pause the chlorine feed until FC is back in range.' + howtoInline('pauseFeed');
        msg += orpSetAdvice(-1);
      }
      actions.push({ st: freeSt, pri: 2, label: 'Free Cl', msg });
    }
  } else { clearChip(`${poolId}-free-result`); }

  // ── COMBINED CHLORINE (separate from FC) ──
  // Breakpoint: chloramines break down once FC reaches ~10 × CC.
  if (!isNaN(combD)) {
    if      (combPpm === 0)                  combSt = 'ok';
    else if (combPpm <= R.combined.warnHigh) combSt = 'warn';
    else                                      combSt = 'alert';
    statuses.push(combSt);
    setChip(`${poolId}-combined-result`, combPpm.toFixed(1) + ' ppm', combSt);

    if (combSt !== 'ok') {
      const cc = combPpm.toFixed(1);
      if (freeSt === null) {
        actions.push({ st: combSt, pri: 2, label: 'Combined Cl', msg:
          `Chloramines present (${cc} ppm CC). Enter Free Chlorine to get a recommendation.` });
      } else {
        const breakpoint = combPpm * 10;
        const fcAfter    = (fcCritical || fcLow) ? clTarget : freePpm;
        const extra      = breakpoint - fcAfter;
        const tail       = combSt === 'alert' ? ' Flag to Dini.' : '';

        if (extra < 0.1) {
          actions.push({ st: combSt, pri: 2, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). FC (${fcAfter.toFixed(1)} ppm) is already at or above the ~${breakpoint.toFixed(1)} ppm needed to break them down — <strong>no extra chlorine needed.</strong> Re-test FC and CC in 1 hr; if CC hasn't dropped, flag to Dini.${tail}` });
        } else if (fcHigh) {
          actions.push({ st: combSt, pri: 2, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). Breaking them down needs FC around ${breakpoint.toFixed(1)} ppm, but FC is already above the comfortable range — <strong>don't add chlorine now.</strong> Flag to Dini to schedule a breakpoint dose after close.` });
        } else {
          const dose    = fmtLiquid(doses.cl * extra);
          const prefix  = (fcCritical || fcLow) ? 'In addition to the Free Cl dose above, add' : 'Add';
          const overMax = breakpoint > R.free.okHigh
            ? ` This will put FC above the comfortable range for a while — best done after close or at a quiet time.`
            : '';
          actions.push({ st: combSt, pri: 2, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). Breaking them down needs FC around ${breakpoint.toFixed(1)} ppm. ${prefix} <strong>${dose} Hasachlor</strong> with pumps running.${overMax} Hold 30 min, then re-test FC and CC.${tail}` });
        }
      }
    }
  } else { clearChip(`${poolId}-combined-result`); }

  // ── ORP (IPS display) ──
  // FC-related ORP interpretation is folded into the Free Cl message above.
  // Here we only catch ORP readings that don't match a normal FC.
  if (!isNaN(orpV)) {
    const r = R.orp;
    let st;
    if      (orpV >= r.okLow && orpV <= r.okHigh)     st = 'ok';
    else if (orpV >= r.warnLow && orpV <= r.warnHigh) st = 'warn';
    else                                               st = 'alert';
    statuses.push(st);
    if (freeSt === 'ok' && st === 'alert') {
      actions.push({ st: 'warn', pri: 2, label: 'ORP', msg: orpV < r.warnLow
        ? (ipsSettingNum(poolId, 'ips-orp-low') !== null && orpV < ipsSettingNum(poolId, 'ips-orp-low')
            ? `Reads ${orpV} mV — below the controller's Low Alert (${ipsSettingNum(poolId, 'ips-orp-low')} mV), so <strong>chlorine feed is stopped</strong>, even though the Taylor test shows FC ${freePpm.toFixed(1)} ppm (fine). The ORP sensor is likely reading low. Don't change the set level — re-test FC in 2 hrs and hand-dose if it drops, check the feed lines for leaks, and flag to Dini to clean the ORP sensor.` + howtoInline('feedCheck')
            : `Reads ${orpV} mV, but the Taylor test shows FC ${freePpm.toFixed(1)} ppm (fine). The ORP sensor is likely reading low, which can make the controller over-feed chlorine. Don't change the set level — flag to Dini to clean the ORP sensor, and watch for FC climbing.`)
        : `Reads ${orpV} mV, but the Taylor test shows FC ${freePpm.toFixed(1)} ppm (fine). The ORP sensor may be reading high. Don't change the set level — flag to Dini.` });
    } else if (freeSt === null && orpV < r.warnLow) {
      actions.push({ st: 'alert', pri: 0, label: 'ORP', msg:
        `Very low (${orpV} mV) — test Free Chlorine now.` });
    }
  }

  // ── COMPUTE LSI ──
  const lsi = (!isNaN(tempV) && !isNaN(phV) && !isNaN(alkD) && !isNaN(calcium) && !isNaN(tds))
    ? calcLSI(phV, tempV, calcium, alkPpm, tds)
    : null;

  // ── pH ──
  let phCritical = false, phCalNeeded = false;
  if (!isNaN(phV)) {
    const r = R.ph;
    let st;
    if      (phV >= r.okLow && phV <= r.okHigh)     st = 'ok';
    else if (phV >= r.warnLow && phV <= r.warnHigh) st = 'warn';
    else                                             st = 'alert';
    statuses.push(st);
    setChip(`${poolId}-ph-result`, phV.toFixed(1), st);

    // Calibration check: IPS display vs Taylor (ground truth).
    if (!isNaN(ipsPhV)) {
      const diff = Math.round(Math.abs(ipsPhV - phV) * 100) / 100;
      if (diff >= PH_CAL_THRESHOLD) {
        phCalNeeded = true;
        hints.phCal = { from: Math.round(ipsPhV * 10) / 10, to: Math.round(phV * 10) / 10 };
        actions.push({ st: 'warn', pri: 1, label: 'pH calibration', msg:
          `The IPS controller reads pH ${ipsPhV.toFixed(1)}, but your Taylor test reads ${phV.toFixed(1)}. <strong>Calibrate the controller to ${phV.toFixed(1)}</strong> before adding any pH chemicals — it has been dosing acid against the wrong number.` + howtoInline('phCal') });
      }
    }

    if (st === 'alert') {
      phCritical = true;
      const calNote = phCalNeeded ? ' Calibrate the controller first (see pH calibration below) — that alone may fix the cause.' : '';
      let msg;
      if (phV < r.warnLow) {
        msg = `pH ${phV.toFixed(1)} is below ${r.warnLow} — too acidic (uncomfortable, and corrosive to equipment).${calNote} Disconnect the <strong>pH plug underneath the IPS controller</strong> to stop acid feed, and check the acid pump hasn't been over-feeding.`;
        if (!isNaN(alkD) && alkPpm < 80) {
          const bik = fmtDry(doses.alk * ((100 - alkPpm) / 10));
          msg += ` TA is also low (${alkPpm.toFixed(0)} ppm) — pre-dissolve <strong>${bik} baking soda</strong> in a bucket and add with pumps running; this raises both TA and pH.`;
        }
        msg += ' Re-test in 1 hr, plug the pH feed back in once pH is 7.4+. Alert Dini.';
      } else {
        const acid = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        msg = `pH ${phV.toFixed(1)} is above ${r.warnHigh} — chlorine is much less effective, and above 8.0 the controller also stops feeding chlorine.${calNote} Check the acid barrel isn't empty and the acid pump is running. Add <strong>${acid} muriatic acid</strong> slowly with pumps running. Re-test in 30 min. Alert Dini.`;
      }
      actions.push({ st: 'alert', pri: 0, label: '⚠ pH — urgent', msg });
    } else if (st !== 'ok' && lsi === null && isNaN(ipsPhV)) {
      actions.push({ st, pri: 2, label: 'pH', msg: (phV < r.okLow ? 'Low' : 'High') +
        ' — enter the IPS pH reading so the tool can check whether the controller needs calibrating.' });
    }
  } else { clearChip(`${poolId}-ph-result`, '—'); }

  // IPS pH chip (shows the controller reading, coloured by agreement with Taylor)
  if (!isNaN(ipsPhV)) {
    setChip(`${poolId}-ipsph-result`, ipsPhV.toFixed(1),
      isNaN(phV) ? 'ok' : (phCalNeeded ? 'warn' : 'ok'));
  } else { clearChip(`${poolId}-ipsph-result`, '—'); }

  // ── ALKALINITY — chip only, action driven by LSI below ──
  if (!isNaN(alkD)) {
    const r = R.alk;
    let st;
    if      (alkPpm >= r.okLow && alkPpm <= r.okHigh)     st = 'ok';
    else if (alkPpm >= r.warnLow && alkPpm <= r.warnHigh) st = 'warn';
    else                                                   st = 'alert';
    setChip(`${poolId}-alk-result`, alkPpm.toFixed(0) + ' ppm', st);
    if (st !== 'ok') statuses.push(st);
  } else { clearChip(`${poolId}-alk-result`); }

  // ── CALCIUM HARDNESS ──
  const chOkLow = 150, chOkHigh = 250;
  if (!isNaN(calcium) && calcium > 0) {
    if (calcium < chOkLow) {
      const delta  = chOkLow - calcium;
      const chDose = fmtDry(doses.ch * (delta / 10));
      actions.push({ st: 'warn', pri: 2, label: 'Calcium Hardness',
        msg: `Low (${calcium} ppm) — pre-dissolve <strong>${chDose} calcium chloride</strong> fully in a bucket, then add slowly with pumps running.` });
    } else if (calcium > chOkHigh) {
      actions.push({ st: 'warn', pri: 2, label: 'Calcium Hardness',
        msg: `High (${calcium} ppm) — no on-site fix. Log for Lucid to address on their next visit.` });
    }
  }

  // ── LSI-DRIVEN ACTION ──────────────────────────────────────
  // Uses the Taylor pH. If pH is outside the safe band, the pH action owns dosing.
  let lsiNoStatus = false;   // cold plunge, low LSI only from cold water → not a problem
  if (lsi !== null && !isNaN(phV) && !isNaN(alkD)) {
    const lsiHigh = lsi > 0.3;
    const lsiLow  = lsi < -0.3;
    const phLow   = phV < 7.4;
    const phHigh  = phV > 7.6;
    const taLow   = alkPpm < 80;
    const lsiStr  = (lsi > 0 ? '+' : '') + lsi.toFixed(2);
    const calFirst = phCalNeeded ? 'After calibrating the controller: ' : '';
    let lsiExpectedCold = false;

    if (phCritical && (lsiLow || lsiHigh)) {
      actions.push({ st: 'warn', pri: 2, label: 'LSI', msg:
        `LSI is ${lsiStr}. Fix pH first (see above) — re-test and reassess LSI once pH is back between 7.2 and 7.8.` });

    } else if (lsiLow) {
      if (taLow && phLow) {
        const taDelta    = 100 - alkPpm;
        const bikDose    = fmtDry(doses.alk * (taDelta / 10));
        const estPhAfter = Math.min(phV + (taDelta / 10) * 0.1, 7.8);
        const acidDelta  = Math.max(0, estPhAfter - 7.5);
        const acidDose   = acidDelta >= 0.1 ? fmtLiquid(doses.ph * (acidDelta / 0.1)) : null;
        const acidNote   = acidDose
          ? ` After 10 min, re-test pH — if above 7.5, add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Auto-feed should then maintain pH; flag to Dini if it does not.`
          : ` After 10 min, re-test pH — auto-feed should maintain it; flag to Dini if pH stays above 7.6.`;
        actions.push({ st: 'warn', pri: 2, label: 'LSI too low — action', msg:
          `${calFirst}LSI is ${lsiStr} (corrosive). TA and pH both low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && !phHigh) {
        const taDelta    = 100 - alkPpm;
        const bikDose    = fmtDry(doses.alk * (taDelta / 10));
        const estPhAfter = Math.min(phV + (taDelta / 10) * 0.1, 7.8);
        const acidDelta  = Math.max(0, estPhAfter - 7.5);
        const acidDose   = acidDelta >= 0.1 ? fmtLiquid(doses.ph * (acidDelta / 0.1)) : null;
        const acidNote   = acidDose
          ? ` pH will rise — after 10 min re-test. If above 7.5, add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Auto-feed should maintain pH after that; flag to Dini if it does not.`
          : ` pH may rise slightly — auto-feed should handle it. Flag to Dini if pH goes above 7.6.`;
        actions.push({ st: 'warn', pri: 2, label: 'LSI too low — action', msg:
          `${calFirst}LSI is ${lsiStr} (corrosive). TA is low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && phHigh) {
        const acidDose = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        actions.push({ st: 'warn', pri: 2, label: 'LSI too low — action', msg:
          `${calFirst}LSI is ${lsiStr} (corrosive). TA is low but pH is high — add acid first. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Wait 10 min, re-test. If TA is still low after pH is in range, add baking soda at that point.` });

      } else if (phLow) {
        actions.push({ st: 'warn', pri: 2, label: 'LSI too low — action', msg: phCalNeeded
          ? `LSI is ${lsiStr} (corrosive). TA is fine but pH is low (${phV.toFixed(1)}) — the controller has likely been over-feeding acid because it reads pH high. Calibrating (above) should fix that. Re-test in 1 hr; if pH is still low, disconnect the <strong>pH plug underneath the IPS controller</strong> until it recovers.`
          : `LSI is ${lsiStr} (corrosive). TA is fine but pH is low (${phV.toFixed(1)}). Disconnect the <strong>pH plug underneath the IPS controller</strong> to pause muriatic acid feed — pH will rise naturally as chlorine is consumed. Re-test in 1 hr.` });

      } else {
        const drivers = [];
        if (!isNaN(calcium) && calcium < chOkLow) drivers.push(`low calcium hardness (${calcium} ppm — see Calcium Hardness above)`);
        if (pool.type === 'cold' || tempV < 80) drivers.push(`cold water (${tempV.toFixed(1)} °F)`);
        let msg;
        if (drivers.length) {
          msg = `LSI is ${lsiStr} (corrosive). pH and TA are in range — this is driven by ${drivers.join(' and ')}.`;
          if (pool.type === 'cold' && !(calcium < chOkLow)) {
            msg = `LSI is ${lsiStr} — low because the water is cold (${tempV.toFixed(1)} °F), which is expected for a cold plunge. pH and TA are in range — no dose needed. Keep pH and TA at the top of their ranges.`;
            lsiExpectedCold = true;
          }
        } else {
          msg = `LSI is ${lsiStr} (corrosive), but pH, TA, temp and CH (${calcium} ppm) don't explain it. Re-check the CH/TDS values in Weekly Parameters, then flag to Dini.`;
        }
        actions.push({ st: lsiExpectedCold ? 'lsi-note' : 'warn', pri: 2, label: lsiExpectedCold ? 'LSI' : 'LSI too low', msg });
        lsiNoStatus = lsiExpectedCold;
      }

    } else if (lsiHigh) {
      if (phHigh) {
        const acidDose = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        actions.push({ st: 'warn', pri: 2, label: 'LSI too high — action', msg:
          `${calFirst}LSI is ${lsiStr} (scale risk). pH is high. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. pH will naturally drift back up — do not over-correct. Wait 10 min, re-test.` });

      } else {
        const drivers = [];
        if (!isNaN(calcium) && calcium > chOkHigh) drivers.push(`high calcium hardness (${calcium} ppm)`);
        if (alkPpm > 100) drivers.push(`high TA (${alkPpm.toFixed(0)} ppm)`);
        if (!isNaN(tds) && tds > 1500) drivers.push(`high TDS (${tds} ppm)`);
        const why = drivers.length
          ? drivers.join(' and ') + (drivers.length > 1 ? ' are' : ' is') + ' driving this'
          : 'the readings don\'t clearly explain this';
        const phDrop = Math.round((phV - 7.4) * 100) / 100; // avoid 7.5 − 7.4 = 0.0999…
        if (!phLow && phDrop >= 0.1) {
          const acidDose = fmtLiquid(doses.ph * (phDrop / 0.1));
          actions.push({ st: 'warn', pri: 2, label: 'LSI too high — action', msg:
            `${calFirst}LSI is ${lsiStr} (scale risk) — ${why}. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running to bring pH toward 7.4 — pH will naturally drift back up so do not over-correct. Wait 10 min, re-test.` });
        } else {
          actions.push({ st: 'warn', pri: 2, label: 'LSI too high', msg:
            `LSI is ${lsiStr} (scale risk) — ${why}. pH is already at or below 7.4 — <strong>do not add acid.</strong> No on-site fix; log and flag to Dini if sustained.` });
        }
      }
    }
  }

  updateLSIChip(poolId, lsi);

  if (lsi !== null && !lsiNoStatus) {
    if      (lsi > 0.5 || lsi < -0.5) statuses.push('alert');
    else if (lsi > 0.3 || lsi < -0.3) statuses.push('warn');
  }

  // Urgent first, then calibration (calibrate before dosing), then the rest.
  actions.sort((a, b) => (a.pri ?? 2) - (b.pri ?? 2));

  updateOverall(poolId, statuses, actions, lsi);
}

// ─── OVERALL STATUS + ACTIONS ────────────────────────────────
function updateOverall(poolId, statuses, actions, lsi) {
  const chip      = document.getElementById(`${poolId}-overall`);
  const actionsEl = document.getElementById(`${poolId}-actions`);
  if (!chip) return;

  if (!statuses.length) {
    chip.className = 'overall-chip empty';
    chip.textContent = 'Awaiting input';
    if (actionsEl) actionsEl.style.display = 'none';
    return;
  }

  if (statuses.includes('alert')) { chip.className = 'overall-chip alert'; chip.textContent = '⚠ Needs attention'; }
  else if (statuses.includes('warn')) { chip.className = 'overall-chip warn';  chip.textContent = 'Needs adjustment'; }
  else                                { chip.className = 'overall-chip ok';    chip.textContent = '✓ In range'; }

  if (actionsEl) {
    if (actions.length) {
      actionsEl.style.display = 'flex';
      actionsEl.innerHTML = actions.map(a =>
        `<div class="action-item ${a.st}"><span class="action-param">${a.label}:</span><span>${a.msg}</span></div>`
      ).join('');
    } else {
      actionsEl.style.display = 'none';
    }
  }
}

// ─── ORP SET-LEVEL DRIFT FLAG ────────────────────────────────
// No hard limits — but a change is flagged to Dini (with a required note)
// when it takes the set level more than 50 mV from where it was first
// recorded, or is the 3rd change in a row in the same direction.
function orpDriftFlag(poolId, from, to) {
  const hist = (_equipHist['orp-setlevel|' + poolId] || []).filter(h => h.to !== '');
  const base = hist.length ? parseFloat(hist[0].to) : ORP_SET[POOLS[poolId].type].default;
  const out  = [];
  if (!isNaN(base) && Math.abs(to - base) > 50) {
    out.push(`this puts it ${to > base ? '+' : ''}${to - base} mV from where it started (${base} mV)`);
  }
  const dir = Math.sign(to - from);
  const changes = hist.filter(h => h.result === 'Adjusted' || h.result === 'Changed')
                      .map(h => Math.sign(parseFloat(h.to) - parseFloat(h.from)));
  if (dir !== 0 && changes.length >= 2 && changes.slice(-2).every(d => d === dir)) {
    out.push(`this is the 3rd ${dir > 0 ? 'increase' : 'decrease'} in a row`);
  }
  return out.join(', and ');
}
