// ─── MAIN CALC ───────────────────────────────────────────────
// Safety rules (checked first, and never contradicted by later advice):
//   • Free chlorine below the minimum (R.free.warnLow) → CLOSE the pool.
//   • pH outside the safe band (R.ph.warnLow–warnHigh)  → CLOSE the pool.
//   • Temp in the alert band                            → existing alerts.
// Chlorine is never recommended when FC is already above range, and
// combined-chlorine treatment is evaluated separately from FC.
function calc(poolId) {
  const pool  = POOLS[poolId];
  const doses = DOSES[poolId];
  const R     = getRanges(pool.type);
  const poolName = pool.room + ' ' + (pool.type === 'hot' ? 'Hot Soak' : 'Cold Plunge');

  const tempV   = parseFloat(document.getElementById(`${poolId}-temp`)?.value);
  const freeD   = parseFloat(document.getElementById(`${poolId}-free`)?.value);
  const combD   = parseFloat(document.getElementById(`${poolId}-combined`)?.value);
  const phV     = parseFloat(document.getElementById(`${poolId}-ph`)?.value);
  const alkD    = parseFloat(document.getElementById(`${poolId}-alk`)?.value);
  const orpV    = parseFloat(document.getElementById(`${poolId}-orp`)?.value);
  const calcium = parseFloat(document.getElementById(`${poolId}-calcium`)?.value);
  const tds     = parseFloat(document.getElementById(`${poolId}-tds`)?.value);

  const freePpm = freeD * 0.2;
  const combPpm = combD * 0.2;
  const alkPpm  = alkD  * 10;

  const statuses = [];
  const actions  = [];

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
        actions.push({ st, label: 'Temp', msg: st === 'alert'
          ? `Critically low — check ${sys} system and flag to Dini immediately.`
          : `Low — check ${sys} system. Re-test in 30 min.` });
      } else if (pool.type === 'hot' && st === 'alert') {
        actions.push({ st, close: true, label: '⛔ Close pool — Temp', msg:
          `Too hot (${tempV.toFixed(1)} °F). <strong>Close the ${poolName} to guests now</strong> and alert Dini. Do not reopen until temp is back in range.` });
      } else {
        actions.push({ st, label: 'Temp', msg: st === 'alert'
          ? 'Too high — alert Dini immediately.'
          : `High — check ${sys} system. Alert Dini if not resolved in 30 min.` });
      }
    }
  } else { clearChip(`${poolId}-temp-result`, '—'); }

  // ── FREE CHLORINE (evaluated on its own) ──
  const clTarget = pool.type === 'hot' ? 3.0 : 2.5;
  let freeSt = null, combSt = null;
  let fcCritical = false, fcLow = false, fcHigh = false;

  if (!isNaN(freeD)) {
    const r = R.free;
    if      (freePpm >= r.okLow && freePpm <= r.okHigh)     freeSt = 'ok';
    else if (freePpm >= r.warnLow && freePpm <= r.warnHigh) freeSt = 'warn';
    else                                                     freeSt = 'alert';
    statuses.push(freeSt);
    setChip(`${poolId}-free-result`, freePpm.toFixed(1) + ' ppm', freeSt);

    fcCritical = freePpm < r.warnLow;            // below minimum safe level
    fcLow      = !fcCritical && freePpm < r.okLow;
    fcHigh     = freePpm > r.okHigh;

    if (fcCritical) {
      const dose = fmtLiquid(doses.cl * (clTarget - freePpm));
      const what = freePpm === 0
        ? 'No free chlorine detected'
        : `Free chlorine is ${freePpm.toFixed(1)} ppm — below the ${r.warnLow} ppm minimum`;
      actions.push({ st: 'alert', close: true, label: '⛔ Close pool — Free Cl', msg:
        `${what}. <strong>Close the ${poolName} to guests now.</strong> Check the chlorine feed: Hasachlor tank not empty, feed pump running, tubing not kinked or air-locked. Add <strong>${dose} Hasachlor</strong> with pumps running to bring FC to ${clTarget.toFixed(1)} ppm. Alert Dini now. Do not reopen until a re-test shows FC of at least ${r.okLow} ppm.` });
    } else if (fcLow) {
      const dose = fmtLiquid(doses.cl * (clTarget - freePpm));
      actions.push({ st: 'warn', label: 'Free Cl', msg:
        `Low (${freePpm.toFixed(1)} ppm) — add <strong>${dose} Hasachlor</strong> with pumps running to bring FC to ${clTarget.toFixed(1)} ppm. Wait 10 min, re-test. If FC keeps dropping, check the chlorine feed and flag to Dini.` });
    } else if (fcHigh) {
      actions.push({ st: freeSt, label: 'Free Cl', msg: freeSt === 'alert'
        ? `Very high (${freePpm.toFixed(1)} ppm) — <strong>do not add chlorine.</strong> Disconnect the <strong>ORP1 plug underneath the IPS controller</strong> to pause chlorine feed for up to 4 hrs. Flag to Dini. Re-test before reconnecting.`
        : `Above target (${freePpm.toFixed(1)} ppm) — <strong>do not add chlorine.</strong> Disconnect the <strong>ORP1 plug underneath the IPS controller</strong> to pause chlorine feed. Re-test in 1–2 hrs and reconnect once FC is back in range.` });
    }
  } else { clearChip(`${poolId}-free-result`); }

  // ── COMBINED CHLORINE (evaluated separately from FC) ──
  // Breakpoint: chloramines are destroyed once FC reaches ~10 × CC.
  // Compare against the FC level after any FC correction above.
  if (!isNaN(combD)) {
    if      (combPpm === 0)                  combSt = 'ok';
    else if (combPpm <= R.combined.warnHigh) combSt = 'warn';
    else                                      combSt = 'alert';
    statuses.push(combSt);
    setChip(`${poolId}-combined-result`, combPpm.toFixed(1) + ' ppm', combSt);

    if (combSt !== 'ok') {
      const cc = combPpm.toFixed(1);
      if (freeSt === null) {
        actions.push({ st: combSt, label: 'Combined Cl', msg:
          `Chloramines present (${cc} ppm CC). Enter Free Chlorine to get a recommendation.` });
      } else {
        const breakpoint = combPpm * 10;
        const fcAfter    = (fcCritical || fcLow) ? clTarget : freePpm;
        const extra      = breakpoint - fcAfter;
        const tail       = combSt === 'alert' ? ' Flag to Dini.' : '';

        if (extra < 0.1) {
          actions.push({ st: combSt, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). FC (${fcAfter.toFixed(1)} ppm) is already at or above the ~${breakpoint.toFixed(1)} ppm needed to break them down — <strong>no extra chlorine needed.</strong> Keep pumps running and re-test FC and CC in 1 hr. If CC hasn't dropped, flag to Dini.${tail}` });
        } else if (fcHigh) {
          actions.push({ st: combSt, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). Breaking them down needs FC around ${breakpoint.toFixed(1)} ppm, but FC is already above the guest range — <strong>do not add chlorine now.</strong> Flag to Dini to schedule a breakpoint dose after close.` });
        } else {
          const dose    = fmtLiquid(doses.cl * extra);
          const prefix  = (fcCritical || fcLow) ? 'In addition to the Free Cl dose above, add' : 'Add';
          const overMax = breakpoint > R.free.okHigh
            ? ` This will push FC above the guest range — dose with the room empty (between bookings or after close) and keep guests out until FC is back to ${R.free.okHigh} ppm or below.`
            : '';
          actions.push({ st: combSt, label: 'Combined Cl', msg:
            `Chloramines present (${cc} ppm CC). Breaking them down needs FC around ${breakpoint.toFixed(1)} ppm. ${prefix} <strong>${dose} Hasachlor</strong> with pumps running.${overMax} Hold 30 min, then re-test FC and CC.${tail}` });
        }
      }
    }
  } else { clearChip(`${poolId}-combined-result`); }

  // ── ORP (from IPS controller) ──
  // Same bands as applyOrpChip() in wizard-engine.js.
  if (!isNaN(orpV)) {
    const ok   = orpV >= 650 && orpV <= 750;
    const warn = (orpV >= 600 && orpV < 650) || (orpV > 750 && orpV <= 800);
    const st   = ok ? 'ok' : warn ? 'warn' : 'alert';
    statuses.push(st);
    if (orpV < 600) {
      if (fcCritical || fcLow) {
        actions.push({ st: 'alert', label: 'ORP', msg:
          `Very low (${orpV} mV) — confirms the low chlorine above. Follow the chlorine steps; ORP should climb once FC is restored. If it doesn't within 30 min, the feed system is not working — keep the pool closed and alert Dini.` });
      } else if (freeSt !== null) {
        actions.push({ st: 'alert', label: 'ORP', msg:
          `Very low (${orpV} mV) but the Taylor test shows FC ${freePpm.toFixed(1)} ppm. The ORP probe likely needs cleaning or calibration — and the controller may be over-feeding chlorine because of it. Flag to Dini today and re-test FC in 1 hr.` });
      } else {
        actions.push({ st: 'alert', label: 'ORP', msg:
          `Very low (${orpV} mV) — test Free Chlorine now before any guests use this pool.` });
      }
    } else if (orpV > 800) {
      actions.push({ st: 'alert', label: 'ORP', msg:
        `Very high (${orpV} mV). Check FC above — if FC is in range, the probe needs cleaning/calibration. Flag to Dini.` });
    }
  }

  // ── COMPUTE LSI ──
  const lsi = (!isNaN(tempV) && !isNaN(phV) && !isNaN(alkD) && !isNaN(calcium) && !isNaN(tds))
    ? calcLSI(phV, tempV, calcium, alkPpm, tds)
    : null;

  // ── pH ──
  // Outside the safe band → close the pool, regardless of LSI.
  // Inside the safe band but off target → LSI block handles dosing.
  let phCritical = false;
  if (!isNaN(phV)) {
    const r = R.ph;
    let st;
    if      (phV >= r.okLow && phV <= r.okHigh)     st = 'ok';
    else if (phV >= r.warnLow && phV <= r.warnHigh) st = 'warn';
    else                                             st = 'alert';
    statuses.push(st);
    setChip(`${poolId}-ph-result`, phV.toFixed(1), st);

    if (st === 'alert') {
      phCritical = true;
      const low = phV < r.warnLow;
      let fix;
      if (low) {
        fix = 'Disconnect the <strong>pH plug underneath the IPS controller</strong> to stop acid feed, and check whether the acid pump has been over-feeding.';
        if (!isNaN(alkD) && alkPpm < 80) {
          const bik = fmtDry(doses.alk * ((100 - alkPpm) / 10));
          fix += ` TA is also low (${alkPpm.toFixed(0)} ppm) — pre-dissolve <strong>${bik} baking soda</strong> in a bucket and add with pumps running; this raises both TA and pH.`;
        }
      } else {
        const acid = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        fix = `Check the acid tank isn't empty and the acid pump is feeding. Add <strong>${acid} muriatic acid</strong> slowly with pumps running.`;
      }
      actions.push({ st: 'alert', close: true, label: '⛔ Close pool — pH', msg:
        `pH ${phV.toFixed(2)} is outside the safe range (${r.warnLow}–${r.warnHigh}). <strong>Close the ${poolName} to guests now.</strong> Re-test with a fresh sample to confirm. ${fix} Compare the Taylor reading to the IPS display and recalibrate if they differ. Alert Dini now. Do not reopen until pH is between ${r.warnLow} and ${r.warnHigh}.` });
    } else if (st !== 'ok' && lsi === null) {
      // LSI can't run yet — calibration note as a fallback
      actions.push({ st, label: 'pH', msg: (phV < r.okLow ? 'Low' : 'High') +
        ' — compare Taylor reading to IPS display. If they differ, recalibrate the IPS controller to match the Taylor result.' });
    }
  } else { clearChip(`${poolId}-ph-result`, '—'); }

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
      actions.push({ st: 'warn', label: 'Calcium Hardness',
        msg: `Low (${calcium} ppm) — pre-dissolve <strong>${chDose} calcium chloride</strong> fully in a bucket, then add slowly with pumps running.` });
    } else if (calcium > chOkHigh) {
      actions.push({ st: 'warn', label: 'Calcium Hardness',
        msg: `High (${calcium} ppm) — no on-site fix. Log for Lucid to address on their next visit.` });
    }
  }

  // ── LSI-DRIVEN ACTION ──────────────────────────────────────
  // Priority: 1) safety (FC, pH, temp)  2) LSI (equipment longevity).
  // If pH is outside the safe band, the pH action above owns dosing.
  if (lsi !== null && !isNaN(phV) && !isNaN(alkD)) {
    const lsiHigh = lsi > 0.3;
    const lsiLow  = lsi < -0.3;
    const phLow   = phV < 7.4;
    const phHigh  = phV > 7.6;
    const taLow   = alkPpm < 80;
    const lsiStr  = (lsi > 0 ? '+' : '') + lsi.toFixed(2);

    if (phCritical && (lsiLow || lsiHigh)) {
      actions.push({ st: 'warn', label: 'LSI', msg:
        `LSI is ${lsiStr}. Fix pH first (see above) — re-test and reassess LSI once pH is back in the safe range.` });

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
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsiStr} (corrosive). TA and pH both low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && !phHigh) {
        const taDelta    = 100 - alkPpm;
        const bikDose    = fmtDry(doses.alk * (taDelta / 10));
        const estPhAfter = Math.min(phV + (taDelta / 10) * 0.1, 7.8);
        const acidDelta  = Math.max(0, estPhAfter - 7.5);
        const acidDose   = acidDelta >= 0.1 ? fmtLiquid(doses.ph * (acidDelta / 0.1)) : null;
        const acidNote   = acidDose
          ? ` pH will rise — after 10 min re-test. If above 7.5, add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Auto-feed should maintain pH after that; flag to Dini if it does not.`
          : ` pH may rise slightly — auto-feed should handle it. Flag to Dini if pH goes above 7.6.`;
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsiStr} (corrosive). TA is low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && phHigh) {
        const acidDose = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsiStr} (corrosive). TA is low but pH is high — add acid first. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Wait 10 min, re-test. If TA is still low after pH is in range, add baking soda at that point.` });

      } else if (phLow) {
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsiStr} (corrosive). TA is fine but pH is low (${phV.toFixed(1)}). Disconnect the <strong>pH plug underneath the IPS controller</strong> to pause muriatic acid feed — pH will rise naturally as chlorine is consumed. Re-test in 1 hr.` });

      } else {
        // pH and TA in range — name the actual driver from the readings.
        const drivers = [];
        if (!isNaN(calcium) && calcium < chOkLow) drivers.push(`low calcium hardness (${calcium} ppm — see Calcium Hardness above)`);
        if (pool.type === 'cold' || tempV < 80) drivers.push(`cold water (${tempV.toFixed(1)} °F)`);
        let msg;
        if (drivers.length) {
          msg = `LSI is ${lsiStr} (corrosive). pH and TA are in range — this is driven by ${drivers.join(' and ')}.`;
          if (pool.type === 'cold' && !(calcium < chOkLow)) {
            msg += ` This is expected at cold-plunge temperatures — no dose needed. Keep pH and TA at the top of their ranges.`;
          }
        } else {
          msg = `LSI is ${lsiStr} (corrosive), but pH, TA, temp and CH (${calcium} ppm) don't explain it. Re-check the CH/TDS values in Weekly Parameters, then flag to Dini.`;
        }
        actions.push({ st: 'warn', label: 'LSI too low', msg });
      }

    } else if (lsiHigh) {
      if (phHigh) {
        const acidDose = fmtLiquid(doses.ph * ((phV - 7.5) / 0.1));
        actions.push({ st: 'warn', label: 'LSI too high — action', msg:
          `LSI is ${lsiStr} (scale risk). pH is high. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. pH will naturally drift back up — do not over-correct. Wait 10 min, re-test. Recalibrate IPS controller to match Taylor after re-testing.` });

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
          actions.push({ st: 'warn', label: 'LSI too high — action', msg:
            `LSI is ${lsiStr} (scale risk) — ${why}. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running to bring pH toward 7.4 — pH will naturally drift back up so do not over-correct. Wait 10 min, re-test. Recalibrate IPS controller to match Taylor after re-testing.` });
        } else {
          actions.push({ st: 'warn', label: 'LSI too high', msg:
            `LSI is ${lsiStr} (scale risk) — ${why}. pH is already at or below 7.4 — <strong>do not add acid.</strong> No on-site fix; log and flag to Dini if sustained.` });
        }
      }
    }
  }

  updateLSIChip(poolId, lsi);

  if (lsi !== null) {
    if      (lsi > 0.5 || lsi < -0.5) statuses.push('alert');
    else if (lsi > 0.3 || lsi < -0.3) statuses.push('warn');
  }

  // Closure actions always listed first.
  actions.sort((a, b) => (b.close ? 1 : 0) - (a.close ? 1 : 0));

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

  if (actions.some(a => a.close))     { chip.className = 'overall-chip alert'; chip.textContent = '⛔ CLOSE TO GUESTS'; }
  else if (statuses.includes('alert')) { chip.className = 'overall-chip alert'; chip.textContent = '⚠ Needs attention'; }
  else if (statuses.includes('warn'))  { chip.className = 'overall-chip warn';  chip.textContent = 'Needs adjustment'; }
  else                                 { chip.className = 'overall-chip ok';    chip.textContent = '✓ In range'; }

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
