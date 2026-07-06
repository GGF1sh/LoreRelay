/* global window, document */
/* Inspector lane split (Phase 1, UX-only): pure presentation toggle between
   Timeline / Debug / QA. This module does not send or receive any
   postMessage traffic and does not touch any existing message handler,
   debugCapabilities flag, or runtime state — it only toggles the
   pre-existing `.hidden` utility class on the section containers that were
   regrouped into three lane wrappers in index.html.
   See docs/ux/DEBUG-HUB-UX-PROPOSAL.md — Safe Immediate Slice (Phase 1). */

(function () {
    const tabs = document.getElementById('inspector-lane-tabs');
    if (!tabs) { return; }

    const LANES = ['timeline', 'debug', 'qa'];
    const panels = {};
    LANES.forEach((lane) => {
        panels[lane] = document.getElementById(`inspector-lane-${lane}`);
    });

    function setActiveLane(lane) {
        if (LANES.indexOf(lane) === -1) { return; }
        LANES.forEach((l) => {
            if (panels[l]) {
                panels[l].classList.toggle('hidden', l !== lane);
            }
        });
        tabs.querySelectorAll('.inspector-lane-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.getAttribute('data-lane') === lane);
        });
    }

    tabs.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.inspector-lane-btn');
        if (!btn) { return; }
        setActiveLane(btn.getAttribute('data-lane'));
    });

    // Default lane on load. Not persisted across reloads in Phase 1 — this is
    // a presentation-only slice, so no new storage/message surface is added.
    setActiveLane('timeline');
})();
