// Opt-in Ability Workshop. The authoritative validation and shot are performed
// by the extension host; this module only retains an editable JSON draft and
// presents the structured result without exposing a raw combat receipt.
window.LR_abilityWorkshop = window.LR_abilityWorkshop || { builtin: [], custom: [], draft: '', validation: null, shot: null };

function workshopEscape(value) { const node = document.createElement('span'); node.textContent = String(value || ''); return node.innerHTML; }
function workshopDefaultDraft() {
  return JSON.stringify({ id: 'custom_ability', name: 'Custom Ability', tier: 'normal', delivery: { shape: 'single_target', range: 1, maxTargets: 1, falloff: 1, dodgeable: true, blockedByCover: false, pierces: false }, effects: [{ kind: 'damage', vector: 'physical', penetration: { barrier: 'passes', armor: 'passes', requiresBodyContact: false, requiresDamageDealt: false }, targetRequirement: [], magnitude: 1 }], auto: { cooldown: 1, gambitTags: [] }, direct: { windupMs: 0, activeMs: 1, recoveryMs: 0, staminaCost: 0 }, scaleBehavior: { individual: 'full', huge: 'full', squad: 'full', fleet: 'full' }, counters: ['armor'], tags: [] }, null, 2);
}
function renderAbilityWorkshop() {
  const state = window.LR_abilityWorkshop;
  let root = document.getElementById('ability-workshop-panel');
  if (!root) { root = document.createElement('section'); root.id = 'ability-workshop-panel'; root.className = 'card'; document.querySelector('#pane-status')?.append(root); }
  const validation = state.validation;
  const issues = validation ? [...(validation.errors || []), ...(validation.warnings || [])] : [];
  const budget = validation?.powerBudget;
  const status = validation ? (validation.valid ? 'Valid' : 'Invalid') : 'Edit an ability to validate it.';
  root.innerHTML = `<h4>Ability Workshop V1</h4>
    <div class="inline-help">Built-in abilities are read-only. Duplicate one before editing. Invalid abilities cannot be saved or added to a loadout.</div>
    <p><button data-aw="new">New</button> <button data-aw="duplicate">Duplicate selected built-in</button> <button data-aw="save" ${validation && !validation.valid ? 'disabled' : ''}>Save custom</button> <button data-aw="delete">Delete custom</button> <button data-aw="loadout" ${validation && !validation.valid ? 'disabled' : ''}>Add to loadout</button></p>
    <textarea data-aw="draft" aria-label="Ability definition JSON" rows="18" style="width:100%;font-family:var(--vscode-editor-font-family,monospace)">${workshopEscape(state.draft || workshopDefaultDraft())}</textarea>
    <p><button data-aw="import">Import JSON</button> <button data-aw="export">Export JSON</button> <button data-aw="reset">Reset custom abilities</button> <button data-aw="shot">Test shot</button></p>
    <div class="inline-help"><b>${status}</b>${budget ? ` · power ${budget.cost}/${budget.budget} (tolerance ${budget.toleratedBudget})` : ''}</div>
    <ul>${issues.map(issue => `<li>${workshopEscape(issue.code)}: ${workshopEscape(issue.message)}</li>`).join('')}</ul>
    <div data-aw="shot-result">${state.shot ? `Damage ${state.shot.damageDealt || 0}; Heal ${state.shot.healingDone || 0}; Barrier Δ ${state.shot.barrierChange || 0}; ${state.shot.deterministic ? 'deterministic match' : 'determinism mismatch'}` : 'Test shot uses the configured attacker/target defaults in the host.'}</div>
    <details><summary>Built-in (${state.builtin.length}) / custom (${state.custom.length})</summary>${[...state.builtin, ...state.custom].map(ability => `<button data-aw-select="${workshopEscape(ability.id)}">${workshopEscape(ability.name)} (${state.builtin.some(item => item.id === ability.id) ? 'built-in' : 'custom'})</button>`).join(' ') || 'No abilities loaded.'}</details>`;
  const readDraft = () => { state.draft = root.querySelector('[data-aw="draft"]').value; return state.draft; };
  const sendValidation = () => vscode.postMessage({ type: 'validateCombatAbilityWorkshopDraft', json: readDraft() });
  root.querySelector('[data-aw="draft"]').addEventListener('input', sendValidation);
  root.querySelector('[data-aw="new"]').onclick = () => { state.draft = workshopDefaultDraft(); state.validation = null; renderAbilityWorkshop(); sendValidation(); };
  root.querySelector('[data-aw="duplicate"]').onclick = () => vscode.postMessage({ type: 'duplicateCombatAbilityWorkshopBuiltin', json: readDraft() });
  root.querySelector('[data-aw="save"]').onclick = () => vscode.postMessage({ type: 'saveCombatAbilityWorkshopDraft', json: readDraft() });
  root.querySelector('[data-aw="delete"]').onclick = () => vscode.postMessage({ type: 'deleteCombatAbilityWorkshopDraft', json: readDraft() });
  root.querySelector('[data-aw="loadout"]').onclick = () => vscode.postMessage({ type: 'addCombatAbilityWorkshopDraftToLoadout', json: readDraft() });
  root.querySelector('[data-aw="import"]').onclick = () => vscode.postMessage({ type: 'importCombatAbilityWorkshop' });
  root.querySelector('[data-aw="export"]').onclick = () => vscode.postMessage({ type: 'exportCombatAbilityWorkshop' });
  root.querySelector('[data-aw="reset"]').onclick = () => vscode.postMessage({ type: 'resetCombatAbilityWorkshop' });
  root.querySelector('[data-aw="shot"]').onclick = () => vscode.postMessage({ type: 'testCombatAbilityWorkshopShot', json: readDraft() });
  root.querySelectorAll('[data-aw-select]').forEach(button => button.onclick = () => {
    const ability = [...state.builtin, ...state.custom].find(item => item.id === button.dataset.awSelect);
    if (ability) { state.draft = JSON.stringify(ability, null, 2); state.validation = null; renderAbilityWorkshop(); sendValidation(); }
  });
}
window.addEventListener('message', event => {
  const message = event.data || {}; const state = window.LR_abilityWorkshop;
  if (message.type === 'combatAbilityWorkshopCatalog') { Object.assign(state, message.catalog || {}); renderAbilityWorkshop(); }
  if (message.type === 'combatAbilityWorkshopValidation') { state.validation = message.validation || null; renderAbilityWorkshop(); }
  if (message.type === 'combatAbilityWorkshopShot') { state.shot = message.shot || null; renderAbilityWorkshop(); }
  if (message.type === 'combatAbilityWorkshopExport' && typeof message.json === 'string') { state.draft = message.json; renderAbilityWorkshop(); }
});
document.addEventListener('DOMContentLoaded', () => { renderAbilityWorkshop(); vscode.postMessage({ type: 'requestCombatAbilityWorkshop' }); });
