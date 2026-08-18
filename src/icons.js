/* Stylized SVG icon set (campaign emblems + mission-type glyphs).
   Monochrome, drawn with currentColor so CSS can tint them per faction/type.
   viewBox 0 0 24 24. Not ripped from the game — a clean, on-theme placeholder set;
   authentic game sprites can later be produced with tools/extract_icons.py. */
(function () {
  const S = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ` +
    `stroke-linecap="round" stroke-linejoin="round" class="ic">${inner}</svg>`;

  // ---- campaign / faction emblems ----
  const CAMPAIGN = {
    // Tutorial — shield
    tutorial: S('<path d="M12 2.5 19 5v6c0 5-3.5 8-7 10.5C8.5 19 5 16 5 11V5z"/>'),
    // Xiomara Masks — theatrical mask
    xio: S('<path d="M4 5c5-1.5 11-1.5 16 0 0 7-2.5 13-8 15C6.5 18 4 12 4 5z"/><path d="M8.5 9.5c1 .8 2.2.8 3 0M12.5 9.5c.8.8 2 .8 3 0"/><path d="M9 14c1.5 1.4 4.5 1.4 6 0"/>'),
    // AnCom — circle-A (anarchy)
    anc: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 16 12 7l3.5 9M9.6 13h4.8"/>'),
    // Civil Resistance — flag
    civ: S('<path d="M7 3v18"/><path d="M7 4h11l-2.5 3.5L18 11H7z"/>'),
    // Hive — honeycomb
    hiv: S('<path d="M9 3.5h3l1.5 2.6-1.5 2.6H9L7.5 6.1z"/><path d="M15 9.5h3l1.5 2.6L18 14.7h-3L13.5 12z"/><path d="M9 15.5h3l1.5 2.6L12 20.7H9l-1.5-2.6z"/>'),
    // RealWare — corporate cube
    rwa: S('<path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M12 3v18M3 8l9 5 9-5"/>'),
    // Tezctlan — sun / aztec
    tez: S('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>'),
    // Unchained Belt — broken chain
    unc: S('<rect x="3.5" y="9.5" width="7" height="5" rx="2.5"/><rect x="13.5" y="9.5" width="7" height="5" rx="2.5"/><path d="M10.5 12h-.5M14 12h-.5" stroke-dasharray="0.1 2.2"/>')
  };

  // ---- mission-type glyphs ----
  const TYPE = {
    RaiderCapture: S('<path d="M6 3v18"/><path d="M6 4h11l-2.5 3L17 10H6z"/>'),          // flag / capture
    Defense: S('<path d="M12 2.5 19 5v6c0 5-3.5 8-7 10.5C8.5 19 5 16 5 11V5z"/>'),        // shield
    Elimination: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>'), // target
    Sabotage: S('<circle cx="11" cy="14" r="6"/><path d="M15 10l2.5-2.5M17 6l1.5-1.5M19 8.5 20.5 7"/>'), // bomb
    Espionage: S('<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/>'), // eye
    Robbery: S('<path d="M8 8 9.5 4h5L16 8"/><path d="M6.5 8h11l1.5 12H5z"/>'),             // sack / loot
    Ritual: S('<circle cx="12" cy="12" r="9"/><path d="m12 4 2.4 7.4H22l-6.2 4.5 2.4 7.3L12 18.7 5.8 23.2l2.4-7.3L2 11.4h7.6z" transform="scale(0.62) translate(7.5 6.5)"/>'), // pentagram-ish star in circle
    Escort: S('<path d="M4 12h11"/><path d="M12 8l4 4-4 4"/><circle cx="19" cy="12" r="2"/>'), // move / escort
    Infiltration: S('<circle cx="12" cy="9" r="3.5"/><path d="M12 12.5V17M10 15h4"/>'),      // keyhole
    Control: S('<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="12" r="6.2"/><circle cx="12" cy="12" r="9.6"/>'), // radar / control
    Counterattack: S('<path d="M4 4l16 16M20 4 4 20"/><path d="M4 4l3 1-1 3M20 4l-3 1 1 3"/>'), // crossed blades
    Security: S('<rect x="5" y="10.5" width="14" height="10" rx="1.6"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/>') // padlock
  };

  window.QM_ICONS = {
    campaign: (key) => CAMPAIGN[key] || '',
    type: (key) => TYPE[key] || ''
  };
})();
