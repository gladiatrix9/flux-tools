// ══════════════════════════════════════════════════════════════
// Flux — Alcohol Service & ID Compliance wiki
// Tab switching + live age-cutoff date.
// ══════════════════════════════════════════════════════════════

// OLCC's minimum "check if they look under" age is 26; house policy
// sets ours higher. Kept as one constant so the stat tile, the
// checking-ID intro, and house policy item 1 never drift apart.
const CHECK_AGE = 30;
const PURCHASE_AGE = 21;

document.addEventListener('DOMContentLoaded', function() {
  injectAges();
  injectCutoffDate();
  wireTabs();
});

// ─── LIVE VALUES ─────────────────────────────────────────────

function injectAges() {
  document.querySelectorAll('[data-check-age]').forEach(function(el) {
    el.textContent = CHECK_AGE;
  });
}

// "Can't sell to anyone born after" — 21 years ago today. Anyone
// born after this date is not yet 21.
function injectCutoffDate() {
  const t = new Date();
  const cutoff = new Date(t.getFullYear() - PURCHASE_AGE, t.getMonth(), t.getDate());
  const str = cutoff.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  document.querySelectorAll('[data-cutoff-date]').forEach(function(el) {
    el.textContent = str;
  });
}

// ─── TABS ────────────────────────────────────────────────────

function wireTabs() {
  const pills = document.querySelectorAll('.pill');
  pills.forEach(function(pill) {
    pill.addEventListener('click', function() {
      switchTab(pill.getAttribute('data-tab'));
    });
  });
  // Default section — matches the design's initial state.
  switchTab('training');
}

function switchTab(key) {
  document.querySelectorAll('.pill').forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-tab') === key);
  });
  document.querySelectorAll('.wiki-section[data-tab]').forEach(function(s) {
    s.style.display = (s.getAttribute('data-tab') === key) ? '' : 'none';
  });
  // Bring the newly shown section under the sticky-ish hero.
  const hero = document.querySelector('.wiki-hero');
  if (hero && window.scrollY > hero.offsetHeight) {
    window.scrollTo({ top: hero.offsetHeight, behavior: 'smooth' });
  }
}
