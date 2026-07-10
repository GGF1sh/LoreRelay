// ===== Cinematic Play Mode (PLAY-UX-001) =====
// Presentation-only toggle: body[data-play-mode="cinematic"] switches the
// console into a focused play surface (see 9a-cinematic-mode.css).
// No postMessage, no state writes — the status strip passively mirrors the
// values 10-game-state.js already renders into the Adventure Status pane,
// so this module never has to know about game_state at all.

const cinematicModeBtn = document.getElementById('cinematic-mode-btn');
const cinematicTopbar = document.getElementById('cinematic-topbar');
const cinematicExitBtn = document.getElementById('cinematic-exit-btn');
const cinematicToolsBtn = document.getElementById('cinematic-tools-btn');

const CINEMATIC_MODE_STORAGE_KEY = 'lorerelay.cinematicMode';

function isCinematicModeActive() {
  return document.body.getAttribute('data-play-mode') === 'cinematic';
}

function setCinematicMode(on, manageFocus) {
  if (on) {
    document.body.setAttribute('data-play-mode', 'cinematic');
  } else {
    document.body.removeAttribute('data-play-mode');
    setCinematicToolsOpen(false);
  }
  if (cinematicModeBtn) { cinematicModeBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (cinematicTopbar) { cinematicTopbar.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  try { localStorage.setItem(CINEMATIC_MODE_STORAGE_KEY, on ? '1' : '0'); } catch (e) { /* storage may be unavailable */ }
  if (on) {
    syncCinematicStatusStrip();
    if (manageFocus && cinematicExitBtn) { cinematicExitBtn.focus(); }
  } else if (manageFocus && cinematicModeBtn) {
    cinematicModeBtn.focus();
  }
}

function setCinematicToolsOpen(open) {
  document.body.classList.toggle('cinematic-tools-open', open);
  if (cinematicToolsBtn) { cinematicToolsBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
}

// --- Status strip: mirror location / time / funds from the status pane ---
const CINEMATIC_STAT_MIRRORS = [
  { srcId: 'status-location', dstId: 'cin-stat-location', icon: '📍' },
  { srcId: 'status-time', dstId: 'cin-stat-time', icon: '🕐' },
  { srcId: 'status-funds', dstId: 'cin-stat-funds', icon: '💰' }
];

function syncCinematicStatusStrip() {
  for (const { srcId, dstId, icon } of CINEMATIC_STAT_MIRRORS) {
    const src = document.getElementById(srcId);
    const dst = document.getElementById(dstId);
    if (!src || !dst) { continue; }
    const value = (src.textContent || '').trim();
    const empty = !value || value === '---';
    dst.textContent = empty ? '---' : `${icon} ${value}`;
    dst.classList.toggle('cin-stat-empty', empty);
  }
}

function initCinematicStatusObserver() {
  const statusContent = document.getElementById('status-content');
  if (!statusContent || typeof MutationObserver === 'undefined') { return; }
  const observer = new MutationObserver(() => {
    if (isCinematicModeActive()) { syncCinematicStatusStrip(); }
  });
  observer.observe(statusContent, { childList: true, characterData: true, subtree: true });
}

// --- Wiring ---
if (cinematicModeBtn) {
  cinematicModeBtn.addEventListener('click', () => setCinematicMode(!isCinematicModeActive(), true));
}
if (cinematicExitBtn) {
  cinematicExitBtn.addEventListener('click', () => setCinematicMode(false, true));
}
if (cinematicToolsBtn) {
  cinematicToolsBtn.addEventListener('click', () => {
    setCinematicToolsOpen(!document.body.classList.contains('cinematic-tools-open'));
  });
}

// Esc leaves the mode (ignore IME composition and Esc inside our confirm modal,
// which handles its own Escape via 00-core.js webviewConfirm).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.isComposing) { return; }
  if (!isCinematicModeActive()) { return; }
  if (document.querySelector('.wv-confirm-backdrop')) { return; }
  setCinematicMode(false, true);
});

initCinematicStatusObserver();

// Restore the persisted mode. Values rendered later by gameStateUpdate are
// picked up by the MutationObserver; this initial sync covers saved DOM state.
try {
  if (localStorage.getItem(CINEMATIC_MODE_STORAGE_KEY) === '1') {
    setCinematicMode(true);
  }
} catch (e) { /* storage may be unavailable */ }
