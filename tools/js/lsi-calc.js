// ─── LSI CALCULATION ─────────────────────────────────────────
// Interpolated temperature factor (Orenda-style, not lookup table)
// ─── LSI FACTOR LOOKUP TABLES ────────────────────────────────
// Source: Langelier Saturation Index standard table (SI = pH + TF + CF + AF - 12.1)
// All three factors use the same interpolation approach.

function lsiLookup(pts, val) {
  if (val <= pts[0][0])              return pts[0][1];
  if (val >= pts[pts.length-1][0])   return pts[pts.length-1][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0,y0] = pts[i], [x1,y1] = pts[i+1];
    if (val >= x0 && val <= x1)
      return y0 + (y1 - y0) * (val - x0) / (x1 - x0);
  }
  return pts[pts.length-1][1];
}

// TF: temperature in °F (converted from standard Celsius table)
function tempFactor(tempF) {
  const tempC = (tempF - 32) * 5 / 9;
  const pts = [
    [0,0.0],[3,0.1],[8,0.2],[12,0.3],[16,0.4],
    [19,0.5],[24,0.6],[29,0.7],[34,0.8],[40,0.9],[53,1.0]
  ];
  return lsiLookup(pts, tempC);
}

// CF: calcium hardness factor (ppm)
function calciumFactor(ch) {
  const pts = [
    [5,0.3],[25,1.0],[50,1.3],[75,1.5],[100,1.6],
    [150,1.8],[200,1.9],[300,2.1],[400,2.2],[800,2.5],[1000,2.6]
  ];
  return lsiLookup(pts, ch);
}

// AF: total alkalinity factor (ppm)
function alkFactor(alk) {
  const pts = [
    [5,0.7],[25,1.4],[50,1.7],[75,1.9],[100,2.0],
    [150,2.2],[200,2.3],[300,2.5],[400,2.6],[800,2.9],[1000,3.0]
  ];
  return lsiLookup(pts, alk);
}

// TDS correction to the 12.1 constant
function tdsConstant(tds) {
  if (tds < 1000) return 12.1;
  if (tds < 2000) return 12.2;
  return 12.3;
}

function calcLSI(pH, tempF, calcium, alkalinity, tds) {
  if ([pH, tempF, calcium, alkalinity, tds].some(v => isNaN(v) || v <= 0)) return null;
  const lsi = pH + tempFactor(tempF) + calciumFactor(calcium) + alkFactor(alkalinity) - tdsConstant(tds);
  return Math.round(lsi * 100) / 100;
}

function updateLSIChip(poolId, lsi) {
  const el = document.getElementById(`${poolId}-lsi`);
  if (!el) return;
  if (lsi === null) {
    el.className = 'lsi-chip empty';
    const ca  = document.getElementById(poolId+'-calcium')?.value;
    const tds = document.getElementById(poolId+'-tds')?.value;
    const msg = (!ca || !tds) ? '— enter CH &amp; TDS in Weekly Parameters' : '— complete test to calculate';
    el.innerHTML = '<span class="chip-dot"></span>' + msg;
    return;
  }
  let cls, label;
  if      (lsi >= 0.31)  { cls = 'purple'; label = `${lsi > 0 ? '+' : ''}${lsi.toFixed(2)} Scale risk`; }
  else if (lsi >= 0.0)   { cls = 'green';  label = `+${lsi.toFixed(2)} Balanced`; }
  else if (lsi >= -0.30) { cls = 'yellow'; label = `${lsi.toFixed(2)} Acceptable`; }
  else                   { cls = 'red';    label = `${lsi.toFixed(2)} Corrosive`; }
  el.className = `lsi-chip ${cls}`;
  el.innerHTML = `<span class="chip-dot"></span>${label}`;
}

