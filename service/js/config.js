// ─── AUTH CHECK — redirect to login if not authenticated ─────
// Same sessionStorage key as /tools, and same origin, so a host who
// signed in on either page is already signed in on the other.
(function() {
  if (sessionStorage.getItem('flux-auth') !== 'ok') {
    window.location.replace('index.html');
  }
})();

// ─── CONFIG ──────────────────────────────────────────────────
// Deployment URL for the *incidents* Apps Script (apps-script/Incidents.gs).
// This is a different script and a different Spreadsheet from the water
// testing one — paste the /exec URL here after deploying.
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyYEiGmJcGD8OBOnxixs2AqjNwsyTGofLQC-e6v5f4J3NQTyM1af0FceLFvfhS80mlGxg/exec';

// Staff roster for "Reported By". The water testing page keeps its own
// roster (tools/log.html); update both if a host is added or removed.
const STAFF = ['Dini', 'Elizabeth', 'Elise', 'Gigi', 'Mark', 'Meredith', 'Michael', 'Nate', 'Sarah', 'Zach'];

// Managers who can be notified of an incident — the only names offered in
// the "Manager Notified" dropdown.
const MANAGERS = ['Dini', 'Mark'];
