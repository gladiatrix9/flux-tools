// ─── MAIN CALC ───────────────────────────────────────────────
function calc(poolId) {
  const pool  = POOLS[poolId];
  const doses = DOSES[poolId];
  const R     = getRanges(pool.type);

  const tempV   = parseFloat(document.getElementById(`${poolId}-temp`)?.value);
  const freeD   = parseFloat(document.getElementById(`${poolId}-free`)?.value);
  const combD   = parseFloat(document.getElementById(`${poolId}-combined`)?.value);
  const phV     = parseFloat(document.getElementById(`${poolId}-ph`)?.value);
  const alkD    = parseFloat(document.getElementById(`${poolId}-alk`)?.value);
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
      } else {
        actions.push({ st, label: 'Temp', msg: st === 'alert'
          ? `Too high — ${pool.type === 'hot' ? 'pool must close immediately. Alert Dini.' : 'alert Dini immediately.'}`
          : `High — check ${sys} system. Alert Dini if not resolved in 30 min.` });
      }
    }
  } else { clearChip(`${poolId}-temp-result`, '—'); }

  // ── FREE CHLORINE & COMBINED CHLORINE ──
  // The 10x-CC "shock" amount is chlorine that gets CONSUMED breaking down
  // chloramines — it does not remain as free chlorine. So it stacks on top
  // of whatever's needed to bring FC itself up to target; the two amounts
  // are additive, not alternatives.
  //
  // total needed  = clTarget + (10 × CC)
  // total present = current FC
  // change        = total needed − total present
  //   change > 0  → add ONE Hasachlor dose covering the full change
  //   change <= 0 → FC already covers target + chloramine destruction → pause feed
  const clTarget = pool.type === 'hot' ? 3.0 : 2.5;
  let freeSt = null, combSt = null;

  if (!isNaN(freeD)) {
    const r = R.free;
    if      (freePpm >= r.okLow && freePpm <= r.okHigh)     freeSt = 'ok';
    else if (freePpm >= r.warnLow && freePpm <= r.warnHigh) freeSt = 'warn';
    else                                                     freeSt = 'alert';
    statuses.push(freeSt);
    setChip(`${poolId}-free-result`, freePpm.toFixed(1) + ' ppm', freeSt);
  } else { clearChip(`${poolId}-free-result`); }

  if (!isNaN(combD)) {
    if      (combPpm === 0)                  combSt = 'ok';
    else if (combPpm <= R.combined.warnHigh) combSt = 'warn';
    else                                      combSt = 'alert';
    statuses.push(combSt);
    setChip(`${poolId}-combined-result`, combPpm.toFixed(1) + ' ppm', combSt);
  } else { clearChip(`${poolId}-combined-result`); }

  const fcFlagged = freeSt !== null && freeSt !== 'ok';
  const ccActive  = combSt !== null && combSt !== 'ok';

  if (fcFlagged || ccActive) {

    if (isNaN(freePpm)) {
      // CC present but FC wasn't tested — can't compute the total dose.
      actions.push({ st: combSt, label: 'Combined Cl', msg:
        `Chloramines present (${combPpm.toFixed(1)} ppm CC). Enter Free Chlorine first to calculate the dose.` });

    } else {
      const ccTerm      = isNaN(combPpm) ? 0 : combPpm * 10;
      const totalNeeded = clTarget + ccTerm;
      const change      = totalNeeded - freePpm;

      if (change > 0) {
        const dose = fmtLiquid(doses.cl * change);
        const st   = (freeSt === 'alert' || combSt === 'alert') ? 'alert' : 'warn';

        if (ccActive && fcFlagged) {
          actions.push({ st, label: 'Chlorine', msg:
            `FC is low (${freePpm.toFixed(1)} ppm) and chloramines are present (${combPpm.toFixed(1)} ppm CC). Add <strong>${dose} Hasachlor</strong> total with pumps running — this covers raising FC to ${clTarget.toFixed(1)} ppm and breaking down the chloramines. Hold 30 min, then re-test FC and CC.` });
        } else if (ccActive) {
          actions.push({ st, label: 'Combined Cl', msg:
            `Chloramines present (${combPpm.toFixed(1)} ppm CC). FC is already in range. Add <strong>${dose} Hasachlor</strong> with pumps running to break down the chloramines. Hold 30 min, then re-test FC and CC.` });
        } else {
          actions.push({ st, label: 'Free Cl', msg:
            `Low — add <strong>${dose} Hasachlor</strong> with pumps running. Wait 10 min, re-test.` });
        }

      } else {
        // FC already covers the target plus any chloramine-destroying dose — pause feed.
        const st = freeSt === 'alert' ? 'alert' : 'warn';
        actions.push({ st, label: 'Free Cl', msg: st === 'alert'
          ? 'Very high — disconnect the <strong>ORP1 plug underneath the IPS controller</strong> to pause chlorine feed for up to 4 hrs. Re-test before reconnecting.'
          : 'Elevated — disconnect the <strong>ORP1 plug underneath the IPS controller</strong> to pause chlorine feed. Re-test in 1–2 hrs.' });
        if (ccActive) {
          actions.push({ st: combSt, label: 'Combined Cl', msg:
            `Chloramines present (${combPpm.toFixed(1)} ppm CC). FC is already high enough to cover this — pause the feed per Free Cl above, then re-test once FC has come down.` });
        }
      }
    }
  }

  // ── COMPUTE LSI NOW — drives pH and TA recommendations ──
  const lsi = (!isNaN(tempV) && !isNaN(phV) && !isNaN(alkD) && !isNaN(calcium) && !isNaN(tds))
    ? calcLSI(phV, tempV, calcium, alkPpm, tds)
    : null;

  // ── pH — chip only, action driven by LSI below ──
  // Calibration note fires only when LSI can't be computed (CH/TDS missing).
  // When LSI is available the LSI block owns all pH action messages.
  if (!isNaN(phV)) {
    const r = R.ph;
    let st;
    if      (phV >= r.okLow && phV <= r.okHigh)     st = 'ok';
    else if (phV >= r.warnLow && phV <= r.warnHigh) st = 'warn';
    else                                             st = 'alert';
    statuses.push(st);
    setChip(`${poolId}-ph-result`, phV.toFixed(1), st);
    if (st !== 'ok' && lsi === null) {
      // LSI block can't run yet — surface the calibration note as a fallback
      const dir = phV < r.okLow ? 'low' : 'high';
      actions.push({ st, label: 'pH', msg: dir === 'low'
        ? 'Low — compare Taylor reading to IPS display. If they differ, recalibrate the IPS controller to match the Taylor result.'
        : 'High — compare Taylor reading to IPS display. If they differ, recalibrate the IPS controller to match the Taylor result.' });
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
    // Only push TA status to the overall chip at warn/alert levels.
    // Being inside the ok band never degrades the chip; the LSI block
    // handles any corrective action if TA is nudging LSI out of range.
    if (st !== 'ok') statuses.push(st);
    // No standalone TA action — LSI block below handles dose action
  } else { clearChip(`${poolId}-alk-result`); }

  // ── CALCIUM HARDNESS ──
  if (!isNaN(calcium) && calcium > 0) {
    const chOkLow = 150, chOkHigh = 250;
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

  // ── LSI-DRIVEN ACTION — primary recommendation ──────────────
  // Priority: 1) FC  2) pH (health dept)  3) LSI (pool longevity)
  // All doses are specific. Auto-feed handles pH drift after dosing.
  // Flag to Dini if auto-feed cannot keep up.

  if (lsi !== null && !isNaN(phV) && !isNaN(alkD)) {
    const lsiHigh = lsi > 0.3;
    const lsiLow  = lsi < -0.3;
    const phLow   = phV < 7.4;
    const phHigh  = phV > 7.6;
    const taLow   = alkPpm < 80;

    if (lsiLow) {

      if (taLow && phLow) {
        // TA low + pH low → bicarb fixes both. Then note pH will rise — acid may follow.
        const taDelta   = 100 - alkPpm;
        const bikDose   = fmtDry(doses.alk * (taDelta / 10));
        // Estimate pH rise from bicarb (~0.1 per 10 ppm TA increase) then acid to correct
        const estPhRise = (taDelta / 10) * 0.1;
        const estPhAfter = Math.min(phV + estPhRise, 7.8);
        const acidDelta  = Math.max(0, estPhAfter - 7.5);
        const acidDose   = acidDelta >= 0.1 ? fmtLiquid(doses.ph * (acidDelta / 0.1)) : null;
        const acidNote   = acidDose
          ? ` After 10 min, re-test pH — if above 7.5, add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Auto-feed should then maintain pH; flag to Dini if it does not.`
          : ` After 10 min, re-test pH — auto-feed should maintain it; flag to Dini if pH stays above 7.6.`;
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsi.toFixed(2)} (corrosive). TA and pH both low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && !phLow && !phHigh) {
        // TA low + pH fine → add bicarb. pH will rise as side effect — acid to follow.
        const taDelta   = 100 - alkPpm;
        const bikDose   = fmtDry(doses.alk * (taDelta / 10));
        const estPhRise = (taDelta / 10) * 0.1;
        const estPhAfter = Math.min(phV + estPhRise, 7.8);
        const acidDelta  = Math.max(0, estPhAfter - 7.5);
        const acidDose   = acidDelta >= 0.1 ? fmtLiquid(doses.ph * (acidDelta / 0.1)) : null;
        const acidNote   = acidDose
          ? ` pH will rise — after 10 min re-test. If above 7.5, add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Auto-feed should maintain pH after that; flag to Dini if it does not.`
          : ` pH may rise slightly — auto-feed should handle it. Flag to Dini if pH goes above 7.6.`;
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsi.toFixed(2)} (corrosive). TA is low. Pre-dissolve <strong>${bikDose} baking soda</strong> in a bucket, add with pumps running.${acidNote}` });

      } else if (taLow && phHigh) {
        // TA low + pH high → acid first (lowers pH and nudges TA). Then reassess.
        const phDrop  = phV - 7.5;
        const acidDose = fmtLiquid(doses.ph * (phDrop / 0.1));
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsi.toFixed(2)} (corrosive). TA is low but pH is high — add acid first. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. Wait 10 min, re-test. If TA is still low after pH is in range, add baking soda at that point.` });

      } else if (!taLow && phLow) {
        // TA fine + pH low → pause acid feed, let chlorine consumption raise pH naturally.
        const phDelta = 7.4 - phV;
        actions.push({ st: 'warn', label: 'LSI too low — action', msg:
          `LSI is ${lsi.toFixed(2)} (corrosive). TA is fine but pH is low (${phV.toFixed(1)}). Disconnect the <strong>pH plug underneath the IPS controller</strong> to pause muriatic acid feed — pH will rise naturally as chlorine is consumed. Re-test in 1 hr.` });

      } else {
        // TA fine + pH fine → temp or CH driving it. Flag.
        actions.push({ st: 'warn', label: 'LSI too low', msg:
          `LSI is ${lsi.toFixed(2)} (corrosive). pH and TA are in range — low temp or low CH is likely driving this. Flag to Dini if sustained.` });
      }

    } else if (lsiHigh) {

      if (phHigh) {
        // pH above 7.6 — acid is the primary lever.
        const phDrop   = phV - 7.5;
        const acidDose = fmtLiquid(doses.ph * (phDrop / 0.1));
        actions.push({ st: 'warn', label: 'LSI too high — action', msg:
          `LSI is +${lsi.toFixed(2)} (scale risk). pH is high. Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running. pH will naturally drift back up — do not over-correct. Wait 10 min, re-test. Recalibrate IPS controller to match Taylor after re-testing.` });

      } else if (!phLow) {
        // pH in the 7.4–7.6 band — nudge toward 7.4 to help LSI.
        // High CH is often a co-driver but hosts can't fix CH; lowering pH slightly is the available lever.
        const phDrop   = phV - 7.4;
        const acidDose = fmtLiquid(doses.ph * (phDrop / 0.1));
        if (phDrop >= 0.1) {
          actions.push({ st: 'warn', label: 'LSI too high — action', msg:
            `LSI is +${lsi.toFixed(2)} (scale risk). Add <strong>${acidDose} muriatic acid</strong> slowly with pumps running to bring pH toward 7.4 — pH will naturally drift back up so do not over-correct. Wait 10 min, re-test. Recalibrate IPS controller to match Taylor after re-testing.` });
        } else {
          // pH already at 7.4, nothing more to dose — CH or TA is the remaining driver
          actions.push({ st: 'warn', label: 'LSI too high', msg:
            `LSI is +${lsi.toFixed(2)} (scale risk). pH is already at target — high CH or TA is driving this and there is no on-site fix. Log and flag to Dini if sustained.` });
        }

      } else {
        // pH already low — no acid. TA or CH driving it.
        actions.push({ st: 'warn', label: 'LSI too high', msg:
          `LSI is +${lsi.toFixed(2)} (scale risk). pH is already low — do not add acid. High TA or CH is likely driving this. Flag to Dini; no on-site fix.` });
      }
    }
  }

  updateLSIChip(poolId, lsi);

  // Push LSI into overall status
  if (lsi !== null) {
    if      (lsi > 0.5 || lsi < -0.5) statuses.push('alert');
    else if (lsi > 0.3 || lsi < -0.3) statuses.push('warn');
  }

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

  if (statuses.includes('alert'))     { chip.className = 'overall-chip alert'; chip.textContent = '⚠ Needs attention'; }
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

