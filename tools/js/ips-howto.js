// ─── IPS M920 HOW-TO STEPS ───────────────────────────────────
// Button sequences from the IPS M920 Owner's Manual (Flux O&M binder,
// "Chemistry Controller" section). Shared by the Log Results
// recommendations (inline, collapsible) and the Equipment tab.
//
// Key facts from the manual that these steps are built around:
//  • Mode cycles: Auto → pH standby → ORP1 standby → ORP2 → Temp → Auto.
//  • NOTHING doses while the controller is in a standby mode. It only
//    doses when the red Auto light is on.
//  • Calibrate pH with water from the flow-cell sample port.
//  • ORP1 Set Level moves in 5 mV steps.
//  • A flashing display = overfeed timer tripped, that feed is stopped.
//    pH clears by cycling back to Auto; ORP clears only by turning the
//    controller off and on.
//  • No green Flow light = no water through the flow cell = no dosing.
//  • pH High Alert (default 8.0) also shuts off chlorine feed.

const IPS_HOWTO = {

  phCal: {
    title: 'Calibrate pH on the IPS controller',
    html:
      '<p class="hw-note">Your Taylor test is the ground truth. Calibrating tells the controller what the pH really is, so it doses acid correctly.</p>' +
      '<ol class="hw-steps">' +
        '<li>Take a fresh Taylor pH reading using water from the <strong>sample port</strong> (center valve) on the controller\'s flow cell — not from the pool. Let it run a few seconds first.</li>' +
        '<li>Press <strong>Mode</strong> once. The green <strong>pH standby</strong> light comes on and the displays show dashes. <em>Dosing is paused while you\'re in standby.</em></li>' +
        '<li>Press <strong>pH Cal</strong>. The pH display shows what the controller is reading.</li>' +
        '<li>Use <strong>▲ / ▼</strong> to change it to your Taylor reading.</li>' +
        '<li>Press <strong>Mode</strong> repeatedly until the red <strong>Auto</strong> light is on.</li>' +
        '<li>Wait 5 minutes and check the display reads close to your Taylor value.</li>' +
        '<li>Log it in the review screen: <strong>IPS read → set to</strong>.</li>' +
      '</ol>' +
      '<div class="hw-warn">⚠ The controller does not dose chlorine or acid until the red <strong>Auto</strong> light is on. Always finish there.</div>' +
      '<p class="hw-note">If it needs a correction of more than 0.5, or you calibrated yesterday and it\'s off again, the sensor probably needs cleaning — flag to Dini.</p>'
  },

  orpSet: {
    title: 'Adjust the ORP1 set level',
    html:
      '<p class="hw-note">The set level is the ORP the controller aims for. Higher set level = more chlorine. Only adjust when the Log tab tells you to.</p>' +
      '<div class="hw-rules"><strong>Rules:</strong> 5 mV per adjustment · once per pool per day · hot soaks 700–800 mV, cold plunges 650–750 mV — never go outside that without Dini · always log it.</div>' +
      '<ol class="hw-steps">' +
        '<li>Press <strong>Mode</strong> twice. The yellow <strong>ORP1 standby</strong> light comes on (the first press is pH standby).</li>' +
        '<li>Press <strong>Set Level</strong>. The ORP display shows the current set level — note it down.</li>' +
        '<li>Press <strong>▲ once</strong> to raise it 5 mV, or <strong>▼ once</strong> to lower it 5 mV.</li>' +
        '<li>Press <strong>Mode</strong> repeatedly until the red <strong>Auto</strong> light is on.</li>' +
        '<li>Log it in the review screen: <strong>ORP1 set level from → to</strong>.</li>' +
      '</ol>' +
      '<div class="hw-warn">⚠ Don\'t change ORP2, Dose Timer, Delay, Over Timer or Alert settings. Finish on the red <strong>Auto</strong> light.</div>'
  },

  feedCheck: {
    title: 'Chlorine not feeding — what to check',
    html:
      '<ol class="hw-steps">' +
        '<li><strong>Red Auto light on?</strong> If not, press Mode until it is — nothing doses in standby.</li>' +
        '<li><strong>Green Flow light on?</strong> If off, no water is reaching the flow cell and nothing doses. Check the flow-cell valves are open and the pump is running. Flag to Dini.</li>' +
        '<li><strong>ORP display flashing?</strong> The overfeed timer tripped and chlorine is stopped. It only clears by restarting the controller: press Mode to get to pH standby, <strong>hold Mode 2 seconds</strong> until the displays read OFF, press Mode to turn it back on, then press Mode until the red Auto light is on.</li>' +
        '<li><strong>Red alert light on?</strong> ORP or pH has been out of its alert range for 10+ min and feed is stopped. A pH High Alert (8.0+) also stops chlorine — fix pH first.</li>' +
        '<li><strong>Chlorine barrel</strong> not empty, suction line sitting in the liquid (2–3 in. above the bottom).</li>' +
        '<li><strong>Stenner pump</strong> for this pool: head turning while the controller\'s ORP dose light is on? No drips or chlorine leaking from the pump head?</li>' +
        '<li><strong>Feed tubing</strong> to the injection point: not kinked, cracked, crusted with white crystals, or full of air.</li>' +
      '</ol>' +
      '<p class="hw-note">While the feed is down, dose Hasachlor by hand as the Log tab says and re-test every 30 min until the controller is keeping up. Alert Dini with what you found.</p>'
  },

  flashing: {
    title: 'Display flashing / alert lights',
    html:
      '<ul class="hw-list">' +
        '<li><strong>pH display flashing:</strong> acid overfeed timer tripped — acid feed stopped. Press Mode until any standby light comes on, then press Mode until the red Auto light is on. Then find out why (acid barrel empty? pump or tubing problem?).</li>' +
        '<li><strong>ORP display flashing:</strong> chlorine overfeed timer tripped — chlorine stopped. Restart the controller: Mode to pH standby, hold Mode 2 sec until OFF, press Mode to turn on, then Mode until Auto. Then check the chlorine barrel, pump and tubing — if nothing\'s wrong it\'ll trip again, so flag to Dini.</li>' +
        '<li><strong>Red pH or ORP alert light:</strong> reading out of its alert range for 10+ min; that feed is stopped. Test with Taylor and follow the Log tab.</li>' +
        '<li><strong>Green Flow light off:</strong> no flow through the flow cell — nothing doses. Check valves and pump. Flag to Dini.</li>' +
        '<li><strong>Display blank:</strong> no power — check the breaker. Flag to Dini.</li>' +
      '</ul>'
  },

  pauseFeed: {
    title: 'Pause chlorine feed',
    html:
      '<ol class="hw-steps">' +
        '<li>Unplug the <strong>ORP1 plug underneath the IPS controller</strong> (center receptacle).</li>' +
        '<li>Write a note on the controller: pool, time, your name.</li>' +
        '<li>Re-test in 1–2 hours. Plug it back in once FC is back in the comfortable range — <strong>never leave it unplugged at close</strong> without telling Dini.</li>' +
      '</ol>'
  },
};

// Inline collapsible version for recommendation messages.
// The <details> block is stripped before the action text is saved to the Sheet.
function howtoInline(key) {
  const h = IPS_HOWTO[key];
  if (!h) return '';
  return '<details class="hw-inline"><summary>Show steps: ' + h.title + '</summary>' + h.html + '</details>';
}
