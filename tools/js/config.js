// ─── AUTH CHECK — redirect to login if not authenticated ─────
(function() {
  if (sessionStorage.getItem('flux-auth') !== 'ok') {
    window.location.replace('index.html');
  }
})();

// ─── CONFIG — paste your Apps Script URL here after setup ────
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxvQ9EI8IFGukipsQlM6rCdBhP2lCBjTTLdb9T2ISyUx3c-aQ9PpG8IsJQFPe5yaHhojg/exec';

