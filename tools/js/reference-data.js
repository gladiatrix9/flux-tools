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


// ─── RANGES (pending Lucid confirmation for hot soak Cl) ─────
function getRanges(type) {
  return {
    temp: type === 'hot'
      ? { okLow:100, okHigh:106, warnLow:98,  warnHigh:108 }
      : { okLow:45,  okHigh:58,  warnLow:40,  warnHigh:65  },
    free: type === 'hot'
      ? { okLow:2.5, okHigh:3.5, warnLow:2,   warnHigh:5   }
      : { okLow:2,   okHigh:3,   warnLow:1,   warnHigh:4   },
    combined: { warnHigh: 0.5 },
    ph:  { okLow:7.4, okHigh:7.6, warnLow:7.2, warnHigh:7.8 },
    alk: { okLow:80,  okHigh:100, warnLow:60,  warnHigh:120 },
  };
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

