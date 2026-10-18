// ─── AUTH CHECK — send to the staff home page if not signed in ─────
// Signing in on the home page (/service/index.html) is remembered on the
// device (localStorage) until "Sign out". Same origin, so it covers every tool.
(function() {
  let ok = false;
  try { ok = localStorage.getItem('flux-auth') === 'ok' || sessionStorage.getItem('flux-auth') === 'ok'; } catch (e) {}
  if (!ok) window.location.replace('/service/index.html');
})();

// ─── CONFIG — paste your Apps Script URL here after setup ────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvQ9EI8IFGukipsQlM6rCdBhP2lCBjTTLdb9T2ISyUx3c-aQ9PpG8IsJQFPe5yaHhojg/exec';

