// Opt-in combat loadout panel. Host sends combatLoadoutCatalog/State messages;
// state is retained locally so redraws do not discard a pre-battle selection.
// Mounts into the Inspector QA lane behind the combat dev-tools gate.
window.LR_combatLoadout = window.LR_combatLoadout || { mode: 'legacy_gambit', loadouts: {}, abilities: [] };
function loadoutEsc(value) { const node = document.createElement('span'); node.textContent = String(value || ''); return node.innerHTML; }
function renderCombatLoadout() {
  const state = window.LR_combatLoadout;
  const root = mountCombatDevToolPanel('combat-loadout-panel');
  if (!root) return;
  const enabled = state.mode === 'mechanics_v1';
  root.innerHTML = `<h4>${loadoutEsc(T('webview.combatLoadout.title'))}</h4><label><input type="radio" name="combat-mode" value="legacy_gambit" ${enabled ? '' : 'checked'}> ${loadoutEsc(T('webview.combatLoadout.modeLegacy'))}</label><label><input type="radio" name="combat-mode" value="mechanics_v1" ${enabled ? 'checked' : ''}> ${loadoutEsc(T('webview.combatLoadout.modeExtended'))}</label><div class="inline-help">${loadoutEsc(enabled ? T('webview.combatLoadout.helpExtended') : T('webview.combatLoadout.helpLegacy'))}</div><div id="combat-loadout-abilities"></div>`;
  const list = root.querySelector('#combat-loadout-abilities'); if (enabled && list) list.innerHTML = state.abilities.map(a => `<article class="combat-ability ${a.selectable ? '' : 'disabled'}"><b>${a.name}</b> · ${a.shape} · ${a.vector} · cd ${a.cooldown}s<br>${a.effect} · ${a.target}<br>${a.counters}<br>${a.selectable ? loadoutEsc(T('webview.combatLoadout.budgetValid')) : loadoutEsc(T('webview.combatLoadout.unavailable')) + ': ' + a.reason}</article>`).join('') || loadoutEsc(T('webview.combatLoadout.noAbilities'));
  root.querySelectorAll('input[name="combat-mode"]').forEach(input => input.onchange = () => { state.mode = input.value; vscode.postMessage({ type: 'updateCombatLoadout', state }); renderCombatLoadout(); });
}
window.addEventListener('message', event => { const message = event.data || {}; if (message.type === 'combatLoadoutCatalog') { Object.assign(window.LR_combatLoadout, message.state || {}, { abilities: message.abilities || [] }); renderCombatLoadout(); } if (message.type === 'combatMechanicsDisplay') { window.LR_combatLoadout.display = message.display; renderCombatLoadout(); } });
registerCombatDevToolRenderer(renderCombatLoadout);
