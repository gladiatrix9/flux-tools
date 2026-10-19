// ══════ SHARED TOP BAR + TOOLS MENU ═══════════════════════════
// Used by every staff page (/service and /tools) so the top bar is
// identical everywhere:  FLUX logo (→ home) · tool name · [☰ Tools]
// Each page puts <div id="fx-topbar" data-tool="…"></div> in its header.
// Tabs under the bar are only for sections inside that tool.
//
// data-tool: home | update | water | alcohol | (anything else = none)
// data-sub-id (optional): id for a small line under the tool name,
// which the page can fill in (e.g. the date on Daily Update).

(function () {
  const WATER_URL = 'https://script.google.com/macros/s/AKfycbxvQ9EI8IFGukipsQlM6rCdBhP2lCBjTTLdb9T2ISyUx3c-aQ9PpG8IsJQFPe5yaHhojg/exec';

  const TOOLS = [
    { id: 'update',    name: 'Daily Update',     icon: '📝', href: '/service/updates.html',        desc: 'Notes, restock, repairs, incidents' },
    { id: 'water',     name: 'Water Testing',    icon: '💧', href: '/tools/log.html#log',          desc: 'Test and log all 6 pools' },
    { id: 'equipment', name: 'Equipment Checks', icon: '🔧', href: '/tools/log.html#equipment',    desc: 'Daily & weekly pool equipment' },
    { id: 'alcohol',   name: 'Alcohol Service',  icon: '🍷', href: '/service/wiki.html',           desc: 'Guide & compliance' },
  ];
  const NAMES = { home: 'Staff Portal', update: 'Daily Update', water: 'Water Testing', alcohol: 'Alcohol Service' };

  // ── status lines (shared with the home page) ──
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
  function statusLines(c) {
    const out = {};
    if (!c || !c.success) return out;
    const today = c.today, span = (cls, t) => '<span class="fx-' + cls + '">' + esc(t) + '</span>';
    const L = c.latest, open = c.openItems || [];
    const fix = open.filter(o => o.kind === 'fix').length, rs = open.filter(o => o.kind === 'restock').length;
    out.update = (L && L.date === today
      ? span('ok', 'Updated ' + String(L.at || '').replace(/^\S+\s/, '') + (L.host ? ' by ' + L.host : ''))
      : span('warn', 'Not updated yet today')) +
      (fix || rs ? ' · ' + esc([fix ? fix + ' to fix' : '', rs ? rs + ' to restock' : ''].filter(Boolean).join(', ')) : '');
    const pools = Object.values(c.pools || {});
    const tested = pools.filter(p => p.saved).length;
    const att = pools.filter(p => p.saved && /attention/i.test(p.status || '')).length;
    out.water = span(tested === 6 ? 'ok' : 'warn', tested + ' of 6 pools tested today') + (att ? ' · ' + span('bad', att + ' need attention') : '');
    const tdy = (c.checks && c.checks.today) || [];
    const keys = new Set(tdy.filter(e => ['ips-status', 'pool-equip', 'cl-barrel', 'acid-barrel'].indexOf(e.id) >= 0).map(e => e.id + '|' + e.pool));
    const issues = ((c.checks && c.checks.latest) || []).filter(e => e.result === 'Issue').length;
    out.equipment = span(keys.size >= 14 ? 'ok' : 'warn', 'Daily checks ' + Math.min(keys.size, 14) + ' of 14 done') +
      (issues ? ' · ' + span('bad', issues + ' open issue' + (issues > 1 ? 's' : '')) : '');
    return out;
  }
  // Cached for 2 minutes so opening the menu is instant.
  async function fetchStatus() {
    try {
      const cached = JSON.parse(sessionStorage.getItem('fx-status') || 'null');
      if (cached && Date.now() - cached.t < 120000) return cached.c;
    } catch (e) {}
    const c = await (await fetch(WATER_URL + '?action=getDailyUpdate')).json();
    try { sessionStorage.setItem('fx-status', JSON.stringify({ t: Date.now(), c })); } catch (e) {}
    return c;
  }
  function signOut() {
    try { localStorage.removeItem('flux-auth'); sessionStorage.removeItem('flux-auth'); } catch (e) {}
    location.href = '/service/index.html';
  }
  window.FX = { TOOLS, statusLines, fetchStatus, signOut, WATER_URL };

  // ── render ──
  function currentTool(bar) {
    const t = bar.dataset.tool || '';
    if (t === 'water' && /^#equipment/.test(location.hash)) return 'equipment';
    return t;
  }
  function render() {
    const bar = document.getElementById('fx-topbar');
    if (!bar) return;
    const tool = bar.dataset.tool || '';
    const subId = bar.dataset.subId;
    bar.className = 'fx-bar';
    bar.innerHTML =
      '<a class="fx-logo" href="/service/index.html" title="Staff home">FLUX</a>' +
      '<div class="fx-title"><span class="fx-tool">' + esc(NAMES[tool] || bar.dataset.name || '') + '</span>' +
        (subId ? '<span class="fx-sub" id="' + esc(subId) + '"></span>' : '') + '</div>' +
      '<button class="fx-btn" id="fx-menu-btn" aria-haspopup="true" aria-expanded="false" aria-controls="fx-menu">' +
        '<span class="fx-burger" aria-hidden="true"></span><span class="fx-btn-label">Tools</span></button>' +
      '<div class="fx-menu" id="fx-menu" role="menu" hidden></div>';
    const btn = document.getElementById('fx-menu-btn');
    const menu = document.getElementById('fx-menu');
    btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('hashchange', () => { if (!menu.hidden) fillMenu(); });

    function fillMenu(status) {
      const cur = currentTool(bar);
      menu.innerHTML =
        '<a class="fx-item' + (cur === 'home' ? ' on' : '') + '" role="menuitem" href="/service/index.html"><span class="fx-ic">⌂</span><span>Home</span></a>' +
        '<div class="fx-sep"></div>' +
        TOOLS.map(t => '<a class="fx-item' + (cur === t.id ? ' on' : '') + '" role="menuitem" href="' + t.href + '">' +
          '<span class="fx-ic">' + t.icon + '</span><span>' + esc(t.name) +
          '<small>' + ((status && status[t.id]) || esc(t.desc)) + '</small></span></a>').join('') +
        '<div class="fx-sep"></div>' +
        '<button class="fx-item fx-dim" role="menuitem" id="fx-signout">Sign out of this device</button>';
      menu.querySelector('#fx-signout').addEventListener('click', signOut);
      // Clicking Equipment / Water while already in the water tool: just switch tab.
      menu.querySelectorAll('a.fx-item').forEach(a => a.addEventListener('click', () => closeMenu()));
    }
    function openMenu() {
      fillMenu();
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.classList.add('open');
      btn.querySelector('.fx-btn-label').textContent = 'Close';
      fetchStatus().then(c => { if (!menu.hidden) fillMenu(statusLines(c)); }).catch(() => {});
    }
    function closeMenu() {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      btn.classList.remove('open');
      btn.querySelector('.fx-btn-label').textContent = 'Tools';
    }
  }

  if (document.getElementById('fx-topbar') || document.readyState !== 'loading') render();
  else document.addEventListener('DOMContentLoaded', render);
})();
