// Shared gate for the combat authoring sandboxes (Combat Lab, Ability Workshop,
// Combat Loadout). These are developer tools, so they stay out of the player's
// Adventure Status pane entirely and mount into the Inspector QA lane only when
// the host reports textAdventure.debug.combatDevTools.
//
// Host truth arrives on the existing `debugCapabilities` message; until it does
// the tools stay hidden, so a player who never opts in never sees them render.
window.LR_combatDevTools = window.LR_combatDevTools || { enabled: false, ready: false, renderers: [] };

/** Where every combat authoring panel mounts. Never `#pane-status`. */
function combatDevToolsHost() {
  return document.getElementById('combat-dev-tools');
}

function combatDevToolsEnabled() {
  return window.LR_combatDevTools.enabled === true;
}

/**
 * Resolve a panel's root element, creating it under the QA-lane host on first
 * use. Returns null while the tools are disabled (and removes an existing panel
 * so toggling the setting off cleans up), which every caller treats as
 * "render nothing".
 */
function mountCombatDevToolPanel(panelId) {
  const existing = document.getElementById(panelId);
  if (!combatDevToolsEnabled()) {
    existing?.remove();
    return null;
  }
  const host = combatDevToolsHost();
  if (!host) return null;
  if (existing) {
    // Older builds appended these panels to #pane-status. Re-parent rather than
    // recreate so a live session does not lose panel state on the first toggle.
    if (existing.parentElement !== host) host.append(existing);
    return existing;
  }
  const root = document.createElement('section');
  root.id = panelId;
  root.className = 'card';
  host.append(root);
  return root;
}

/** Panels register their renderer so the gate can redraw them when it flips. */
function registerCombatDevToolRenderer(render) {
  if (typeof render === 'function') window.LR_combatDevTools.renderers.push(render);
}

function applyCombatDevToolsVisibility() {
  const section = document.getElementById('combat-dev-tools-section');
  section?.classList.toggle('hidden', !combatDevToolsEnabled());
  for (const render of window.LR_combatDevTools.renderers) {
    try { render(); } catch { /* one broken panel must not block the others */ }
  }
}

window.addEventListener('message', event => {
  const message = event.data || {};
  if (message.type === 'localeBundle') {
    // These panels build their labels with T() at render time, so applyI18n()
    // -- which only rewrites [data-i18n] nodes in the static DOM -- cannot
    // retranslate them. Redraw so switching language reaches them too.
    //
    // Deferred: this module is concatenated before 90-bootstrap, so its message
    // listener runs first and the bundle's strings are not stored yet. Redrawing
    // synchronously here would re-render with the previous locale still loaded.
    if (combatDevToolsEnabled()) queueMicrotask(applyCombatDevToolsVisibility);
    return;
  }
  if (message.type !== 'debugCapabilities') return;
  const next = message.combatDevTools === true;
  const changed = next !== window.LR_combatDevTools.enabled || !window.LR_combatDevTools.ready;
  window.LR_combatDevTools.enabled = next;
  window.LR_combatDevTools.ready = true;
  if (changed) applyCombatDevToolsVisibility();
});
