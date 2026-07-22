// UX-RESPONSIVE-NARROW-001 — authoritative responsive shell controller.
// Shell-only: breakpoint / drawer / sidebar width. Does not rerender game state.

const LR_SHELL_WIDE_MIN = 960;
const LR_SHELL_COMPACT_MIN = 720;
const LR_SHELL_SIDEBAR_MIN = 280;
const LR_SHELL_SIDEBAR_MAX_ABS = 800;
const LR_SHELL_SIDEBAR_MAX_VW = 0.42;
const LR_SHELL_SIDEBAR_DEFAULT = 320;
const LR_SHELL_STATUS_WIDTH_KEY = 'lorerelay.statusWidth';

/** Pure: map viewport width → shell mode. */
function lrShellResolveMode(viewportWidth) {
  const w = Number(viewportWidth);
  if (!Number.isFinite(w) || w < 0) { return 'wide'; }
  if (w >= LR_SHELL_WIDE_MIN) { return 'wide'; }
  if (w >= LR_SHELL_COMPACT_MIN) { return 'drawer-compact'; }
  return 'drawer-narrow';
}

/**
 * Pure: reclamp saved/candidate sidebar width for the current viewport.
 * Malformed, non-positive, non-finite values fall back to default.
 */
function lrShellClampSidebarWidth(value, viewportWidth) {
  const vw = Number(viewportWidth);
  const safeVw = Number.isFinite(vw) && vw > 0 ? vw : 1200;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) { return LR_SHELL_SIDEBAR_DEFAULT; }
  const max = Math.min(Math.floor(safeVw * LR_SHELL_SIDEBAR_MAX_VW), LR_SHELL_SIDEBAR_MAX_ABS);
  const min = Math.min(LR_SHELL_SIDEBAR_MIN, max);
  return Math.max(min, Math.min(max, Math.round(n)));
}

function lrShellReadSavedWidth() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) { return null; }
    return localStorage.getItem(LR_SHELL_STATUS_WIDTH_KEY);
  } catch {
    return null;
  }
}

function lrShellWriteSavedWidth(px) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) { return; }
    localStorage.setItem(LR_SHELL_STATUS_WIDTH_KEY, String(px));
  } catch { /* quota / private mode */ }
}

const lrShellState = {
  mode: 'wide',
  drawerOpen: false,
  savedWideSidebarWidth: LR_SHELL_SIDEBAR_DEFAULT,
  rafPending: false,
  lastAppliedWidth: -1,
  initialized: false,
};

function lrShellDoc() {
  return typeof document !== 'undefined' ? document : null;
}

function lrShellEls() {
  const doc = lrShellDoc();
  if (!doc) { return {}; }
  return {
    root: doc.documentElement,
    body: doc.body,
    app: doc.getElementById('app'),
    chat: doc.getElementById('chat-area'),
    status: doc.getElementById('status-area'),
    resizer: doc.getElementById('resizer'),
    toggle: doc.getElementById('status-drawer-toggle'),
    scrim: doc.getElementById('status-drawer-scrim'),
    headerSecondary: doc.getElementById('header-secondary'),
  };
}

function lrShellViewportWidth() {
  if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
    return window.innerWidth;
  }
  const doc = lrShellDoc();
  if (doc && doc.documentElement && Number.isFinite(doc.documentElement.clientWidth)) {
    return doc.documentElement.clientWidth;
  }
  return 1200;
}

function lrShellSetStatusInert(closed) {
  const { status } = lrShellEls();
  if (!status) { return; }
  if (closed) {
    if ('inert' in status) {
      status.inert = true;
    } else {
      status.setAttribute('aria-hidden', 'true');
      status.setAttribute('data-lr-inert-fallback', '1');
    }
  } else {
    if ('inert' in status) {
      status.inert = false;
    }
    status.removeAttribute('aria-hidden');
    status.removeAttribute('data-lr-inert-fallback');
  }
}

function lrShellApplyStatusWidthPx(px) {
  const { status } = lrShellEls();
  if (!status || !status.style || typeof status.style.setProperty !== 'function') { return; }
  status.style.setProperty('--status-width', `${px}px`);
}

function lrShellSyncToggle() {
  const { toggle } = lrShellEls();
  if (!toggle) { return; }
  const open = lrShellState.drawerOpen && lrShellState.mode !== 'wide';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.classList.toggle('is-drawer-open', open);
  const labelKey = open ? 'webview.responsive.closeStatus' : 'webview.responsive.openStatus';
  const label = (typeof T === 'function') ? T(labelKey) : labelKey;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
  if (toggle.querySelector && toggle.querySelector('.lr-drawer-toggle-label')) {
    toggle.querySelector('.lr-drawer-toggle-label').textContent = open ? '◀' : '☰';
  }
}

function lrShellApplyDom() {
  const { root, status, resizer, scrim, toggle, headerSecondary } = lrShellEls();
  if (!root) { return; }
  root.setAttribute('data-lr-shell', lrShellState.mode);
  root.setAttribute('data-lr-drawer', lrShellState.drawerOpen ? 'open' : 'closed');
  // A closed <details> suppresses its non-summary content. In wide mode the
  // summary is intentionally hidden and the body is flattened into the header,
  // so keep the disclosure open or Electron will collapse every toolbar item.
  if (headerSecondary && lrShellState.mode === 'wide') {
    headerSecondary.setAttribute('open', '');
  }
  if (resizer) {
    const wide = lrShellState.mode === 'wide';
    resizer.hidden = !wide;
    resizer.setAttribute('aria-hidden', wide ? 'false' : 'true');
    resizer.style.pointerEvents = wide ? '' : 'none';
  }
  if (toggle) {
    const drawer = lrShellState.mode !== 'wide';
    toggle.hidden = !drawer;
    toggle.setAttribute('aria-hidden', drawer ? 'false' : 'true');
  }
  if (scrim) {
    const show = lrShellState.mode !== 'wide' && lrShellState.drawerOpen;
    scrim.hidden = !show;
    scrim.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  if (lrShellState.mode === 'wide') {
    lrShellSetStatusInert(false);
    if (status) {
      status.removeAttribute('tabindex');
    }
    const clamped = lrShellClampSidebarWidth(lrShellState.savedWideSidebarWidth, lrShellViewportWidth());
    lrShellState.savedWideSidebarWidth = clamped;
    lrShellApplyStatusWidthPx(clamped);
  } else {
    lrShellSetStatusInert(!lrShellState.drawerOpen);
    if (status && lrShellState.drawerOpen) {
      status.setAttribute('tabindex', '-1');
    }
  }
  lrShellSyncToggle();
}

function lrShellOpenDrawer(opts) {
  if (lrShellState.mode === 'wide') { return; }
  lrShellState.drawerOpen = true;
  lrShellApplyDom();
  const { status } = lrShellEls();
  if (opts && opts.focus === false) { return; }
  if (status && typeof status.focus === 'function') {
    try { status.focus({ preventScroll: true }); } catch { status.focus(); }
  }
}

function lrShellCloseDrawer(opts) {
  const wasOpen = lrShellState.drawerOpen;
  lrShellState.drawerOpen = false;
  lrShellApplyDom();
  if (!wasOpen) { return; }
  const { toggle } = lrShellEls();
  if (opts && opts.focus === false) { return; }
  if (toggle && typeof toggle.focus === 'function' && !toggle.hidden) {
    try { toggle.focus({ preventScroll: true }); } catch { toggle.focus(); }
  }
}

function lrShellToggleDrawer() {
  if (lrShellState.mode === 'wide') { return; }
  if (lrShellState.drawerOpen) { lrShellCloseDrawer(); }
  else { lrShellOpenDrawer(); }
}

function lrShellOnViewportChange(force) {
  const width = lrShellViewportWidth();
  if (!force && width === lrShellState.lastAppliedWidth) { return; }
  lrShellState.lastAppliedWidth = width;
  const next = lrShellResolveMode(width);
  const prev = lrShellState.mode;
  if (next !== prev) {
    lrShellState.mode = next;
    if (next === 'wide') {
      // Always restore an accessible visible sidebar in wide mode.
      lrShellState.drawerOpen = false;
    } else if (prev === 'wide') {
      // Entering drawer mode: close deterministically.
      lrShellState.drawerOpen = false;
      const { headerSecondary } = lrShellEls();
      if (headerSecondary && headerSecondary.hasAttribute('open')) {
        headerSecondary.removeAttribute('open');
        if (typeof document !== 'undefined' && document.activeElement && headerSecondary.contains(document.activeElement)) {
          if (typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        }
      }
    }
    // drawer-compact ↔ drawer-narrow: preserve drawerOpen.
  }
  if (lrShellState.mode === 'wide') {
    lrShellState.savedWideSidebarWidth = lrShellClampSidebarWidth(
      lrShellState.savedWideSidebarWidth,
      width
    );
  }
  lrShellApplyDom();
}

function lrShellScheduleViewportCheck() {
  if (lrShellState.rafPending) { return; }
  lrShellState.rafPending = true;
  const run = () => {
    lrShellState.rafPending = false;
    lrShellOnViewportChange(false);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    run();
  }
}

function lrShellIsResizerEnabled() {
  return lrShellState.mode === 'wide';
}

function lrShellPersistWidthFromElement() {
  if (lrShellState.mode !== 'wide') { return; }
  const { status } = lrShellEls();
  if (!status || typeof status.getBoundingClientRect !== 'function') { return; }
  const w = status.getBoundingClientRect().width;
  const clamped = lrShellClampSidebarWidth(w, lrShellViewportWidth());
  lrShellState.savedWideSidebarWidth = clamped;
  lrShellApplyStatusWidthPx(clamped);
  lrShellWriteSavedWidth(clamped);
}

function lrShellHasHigherPriorityEscapeOwner() {
  if (typeof document === 'undefined') { return false; }
  if (document.querySelector('.wv-confirm-backdrop')) { return true; }
  const genesis = document.getElementById('genesis-guide-modal');
  if (genesis && !genesis.classList.contains('hidden')) { return true; }
  const parlor = document.getElementById('parlor-settings-panel');
  if (parlor && !parlor.classList.contains('hidden')) { return true; }
  const charCreator = document.getElementById('char-creator-modal');
  if (charCreator && !charCreator.classList.contains('hidden')) { return true; }
  if (document.getElementById('player-action-hub')) { return true; }
  const lightbox = document.querySelector('.visual-lightbox');
  if (lightbox && !lightbox.classList.contains('hidden')) { return true; }
  return false;
}

function lrShellInit() {
  if (lrShellState.initialized) { return; }
  lrShellState.initialized = true;
  const saved = lrShellReadSavedWidth();
  lrShellState.savedWideSidebarWidth = lrShellClampSidebarWidth(saved, lrShellViewportWidth());

  const { toggle, scrim, status } = lrShellEls();
  if (status) {
    status.setAttribute('role', 'complementary');
    status.setAttribute('aria-label', (typeof T === 'function') ? T('webview.responsive.statusDrawer') : 'Adventure Status');
    if (!status.id) { status.id = 'status-area'; }
  }
  if (toggle) {
    toggle.setAttribute('aria-controls', 'status-area');
    toggle.setAttribute('type', 'button');
    toggle.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') { e.preventDefault(); }
      lrShellToggleDrawer();
    });
  }
  if (scrim) {
    scrim.addEventListener('click', () => lrShellCloseDrawer());
  }

  // Capture-phase Escape: close drawer before unrelated global Escape actions.
  // IME-safe: ignore while composing.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (event) => {
      if (!event || event.key !== 'Escape') { return; }
      if (event.isComposing || event.keyCode === 229) { return; }
      if (lrShellState.mode === 'wide' || !lrShellState.drawerOpen) { return; }
      if (lrShellHasHigherPriorityEscapeOwner()) { return; }
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      lrShellCloseDrawer();
    }, true);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', lrShellScheduleViewportCheck, { passive: true });
  }

  // matchMedia for authoritative breakpoint edges (still rAF-bounded via schedule).
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      const mqWide = window.matchMedia(`(min-width: ${LR_SHELL_WIDE_MIN}px)`);
      const mqCompact = window.matchMedia(`(min-width: ${LR_SHELL_COMPACT_MIN}px)`);
      const onMq = () => lrShellScheduleViewportCheck();
      if (typeof mqWide.addEventListener === 'function') {
        mqWide.addEventListener('change', onMq);
        mqCompact.addEventListener('change', onMq);
      } else if (typeof mqWide.addListener === 'function') {
        mqWide.addListener(onMq);
        mqCompact.addListener(onMq);
      }
    } catch { /* harness without matchMedia */ }
  }

  lrShellOnViewportChange(true);
}

// Public surface for bootstrap resizer + tests.
window.LoreRelayResponsive = {
  resolveMode: lrShellResolveMode,
  clampSidebarWidth: lrShellClampSidebarWidth,
  getMode: () => lrShellState.mode,
  isDrawerOpen: () => lrShellState.drawerOpen,
  isResizerEnabled: lrShellIsResizerEnabled,
  openDrawer: lrShellOpenDrawer,
  closeDrawer: lrShellCloseDrawer,
  toggleDrawer: lrShellToggleDrawer,
  persistWidthFromElement: lrShellPersistWidthFromElement,
  scheduleViewportCheck: lrShellScheduleViewportCheck,
  applyViewport: (w) => {
    // Test helper: force a viewport width without full rerender.
    const prev = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => w });
    } catch {
      // ignore
    }
    lrShellOnViewportChange(true);
    return { mode: lrShellState.mode, drawerOpen: lrShellState.drawerOpen, prev };
  },
  getState: () => ({
    mode: lrShellState.mode,
    drawerOpen: lrShellState.drawerOpen,
    savedWideSidebarWidth: lrShellState.savedWideSidebarWidth,
  }),
  constants: {
    WIDE_MIN: LR_SHELL_WIDE_MIN,
    COMPACT_MIN: LR_SHELL_COMPACT_MIN,
    SIDEBAR_MIN: LR_SHELL_SIDEBAR_MIN,
    SIDEBAR_MAX_ABS: LR_SHELL_SIDEBAR_MAX_ABS,
    STATUS_WIDTH_KEY: LR_SHELL_STATUS_WIDTH_KEY,
  },
  init: lrShellInit,
  // pure exports for unit tests
  _resolveMode: lrShellResolveMode,
  _clampSidebarWidth: lrShellClampSidebarWidth,
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lrShellInit);
  } else {
    lrShellInit();
  }
}
