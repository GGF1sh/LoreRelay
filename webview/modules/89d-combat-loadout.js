// Opt-in combat loadout panel. Host sends combatLoadoutCatalog/State messages;
// state is retained locally so redraws do not discard a pre-battle selection.
window.LR_combatLoadout = window.LR_combatLoadout || { mode: 'legacy_gambit', loadouts: {}, abilities: [] };
function renderCombatLoadout() {
  const state = window.LR_combatLoadout;
  let root = document.getElementById('combat-loadout-panel');
  if (!root) { root = document.createElement('section'); root.id = 'combat-loadout-panel'; root.className = 'card'; document.querySelector('#pane-status')?.append(root); }
  const enabled = state.mode === 'mechanics_v1';
  root.innerHTML = `<h4>Combat mode</h4><label><input type="radio" name="combat-mode" value="legacy_gambit" ${enabled ? '' : 'checked'}> Legacy combat</label><label><input type="radio" name="combat-mode" value="mechanics_v1" ${enabled ? 'checked' : ''}> Extended combat</label><div class="inline-help">${enabled ? 'Abilities, statuses, barriers, and subsystems are enabled.' : 'Ability loadouts are disabled; legacy combat receives no mechanics data.'}</div><div id="combat-loadout-abilities"></div>`;
  const list = root.querySelector('#combat-loadout-abilities'); if (enabled && list) list.innerHTML = state.abilities.map(a => `<article class="combat-ability ${a.selectable ? '' : 'disabled'}"><b>${a.name}</b> · ${a.shape} · ${a.vector} · cd ${a.cooldown}s<br>${a.effect} · ${a.target}<br>${a.counters}<br>${a.selectable ? 'Budget valid' : 'Unavailable: ' + a.reason}</article>`).join('') || 'No validated abilities available.';
  root.querySelectorAll('input[name="combat-mode"]').forEach(input => input.onchange = () => { state.mode = input.value; vscode.postMessage({ type: 'updateCombatLoadout', state }); renderCombatLoadout(); });
}
window.addEventListener('message', event => { const message = event.data || {}; if (message.type === 'combatLoadoutCatalog') { Object.assign(window.LR_combatLoadout, message.state || {}, { abilities: message.abilities || [] }); renderCombatLoadout(); } if (message.type === 'combatMechanicsDisplay') { window.LR_combatLoadout.display = message.display; renderCombatLoadout(); } });
document.addEventListener('DOMContentLoaded', renderCombatLoadout);
