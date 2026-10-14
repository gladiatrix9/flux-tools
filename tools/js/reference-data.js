// ─── POOL DEFINITIONS ────────────────────────────────────────
const POOLS = {
  'sl-hot':  { room: 'Social Lounge', type: 'hot',  vol: 1822 },
  'sl-cold': { room: 'Social Lounge', type: 'cold', vol: 1106 },
  'eq-hot':  { room: 'Equinox',       type: 'hot',  vol: 888  },
  'eq-cold': { room: 'Equinox',       type: 'cold', vol: 490  },
  'so-hot':  { room: 'Solstice',      type: 'hot',  vol: 888  },
  'so-cold': { room: 'Solstice',      type: 'cold', vol: 490  },
};

// ─── BASE DOSES (from Lucid dosing reference) ─────────────────
// cl: fl oz per +1 ppm free chlorine (12.5% Hasachlor)
// alk: oz by weight per +10 ppm alkalinity (sodium bicarbonate)
// (ph: fl oz per -0.1 pH — auto-doser handles, not host action)
const DOSES = {
  'sl-hot':  { cl: 1.82, alk: 2.55, ch: 1.37, ph: 0.90 },
  'sl-cold': { cl: 1.11, alk: 1.55, ch: 0.83, ph: 0.55 },
  'eq-hot':  { cl: 0.89, alk: 1.24, ch: 0.67, ph: 0.44 },
  'eq-cold': { cl: 0.49, alk: 0.69, ch: 0.37, ph: 0.25 },
  'so-hot':  { cl: 0.89, alk: 1.24, ch: 0.67, ph: 0.44 },
  'so-cold': { cl: 0.49, alk: 0.69, ch: 0.37, ph: 0.25 },
};
// ph: fl oz muriatic acid per -0.1 pH unit (31.45% HCl)

// ─── DOSE FORMATTING ─────────────────────────────────────────
// Chlorine: fl oz (liquid)
function fmtDry(ozWeight) {
  return (Math.round(ozWeight * 2) / 2) + ' oz';
}

function fmtLiquid(floz) {
  return `${Math.round(floz * 10) / 10} fl oz`;
}

// Alkalinity: oz weight → tablespoons or cups
// 1 tbsp baking soda ≈ 0.49 oz by weight


// ─── RANGES ──────────────────────────────────────────────────
// free.ok = the comfortable range (no action). Below warnLow = urgent
// manual dosing + feed check. Above warnHigh = pause the feed.
// orp = how the IPS display reading is judged; bands sit around the
// commissioning set levels (spa 750 mV, plunge 700 mV — O&M manual).
function getRanges(type) {
  return {
    temp: type === 'hot'
      ? { okLow:100, okHigh:106, warnLow:98,  warnHigh:108 }
      : { okLow:45,  okHigh:58,  warnLow:40,  warnHigh:65  },
    free: type === 'hot'
      ? { okLow:2.5, okHigh:5,   warnLow:2,   warnHigh:6   }
      : { okLow:1.5, okHigh:4,   warnLow:1,   warnHigh:5   },
    combined: { warnHigh: 0.5 },
    ph:  { okLow:7.4, okHigh:7.6, warnLow:7.2, warnHigh:7.8 },
    alk: { okLow:80,  okHigh:100, warnLow:60,  warnHigh:120 },
    orp: type === 'hot'
      ? { okLow:700, okHigh:800, warnLow:650, warnHigh:850 }
      : { okLow:650, okHigh:750, warnLow:600, warnHigh:800 },
  };
}

// ─── IPS M920 ORP1 SET LEVEL — host adjustment guardrails ────
// default = commissioning set level (O&M manual, "Setpoints").
// Hosts move it 5 mV at a time, once per pool per day, and never
// outside min/max without Dini.
const ORP_SET = {
  hot:  { default: 750, min: 700, max: 800, step: 5 },
  cold: { default: 700, min: 650, max: 750, step: 5 },
};

// pH difference (IPS display vs Taylor) that calls for a pH Cal.
const PH_CAL_THRESHOLD = 0.2;

// Latest Equipment Checks entries, keyed "itemId|poolId" — filled by
// equipment-checks.js on load. Used for the once-a-day ORP guardrail
// and to know the current ORP set level.
let _equipLast = {};
let _equipToday = '';

function currentOrpSetLevel(poolId) {
  const e = _equipLast['orp-setlevel|' + poolId];
  const v = e ? parseFloat(e.to) : NaN;
  return isNaN(v) ? null : v;
}
function orpAdjustedToday(poolId) {
  const e = _equipLast['orp-setlevel|' + poolId];
  return !!(e && _equipToday && e.date === _equipToday) ? e : null;
}

// ─── CHIP HELPERS ────────────────────────────────────────────
function setChip(id, text, st) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `result-chip ${st}`;
  el.innerHTML = `<span class="chip-dot"></span>${text}`;
}
function clearChip(id, ph = '— ppm') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'result-chip empty';
  el.innerHTML = `<span class="chip-dot"></span>${ph}`;
}

