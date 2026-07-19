// Combat Lab is an opt-in, workspace-local simulator. The host owns all
// validation and execution; this module preserves the selected scenario across redraws.
window.LR_combatLab = window.LR_combatLab || { document: { scenarios: [] }, selected: '', result: null, compare: null };
function labEsc(value) { const n = document.createElement('span'); n.textContent = String(value || ''); return n.innerHTML; }
function renderCombatLab() {
  const state = window.LR_combatLab; let root = document.getElementById('combat-lab-panel');
  if (!root) { root = document.createElement('section'); root.id = 'combat-lab-panel'; root.className = 'card'; document.querySelector('#pane-status')?.append(root); }
  const scenarios = state.document?.scenarios || []; const selected = scenarios.find(s => s.id === state.selected) || scenarios[0]; if (selected && !state.selected) state.selected = selected.id;
  const result = state.result?.summary; const timeline = state.result?.timeline || [];
  root.innerHTML = `<h4>Combat Lab V1</h4><div class="inline-help">Workspace-only deterministic sandbox. It never writes battle outcomes to the world or characters.</div>
    <p><select data-lab="scenario">${scenarios.map(s => `<option value="${labEsc(s.id)}" ${s.id === state.selected ? 'selected' : ''}>${labEsc(s.name)} (${s.mode})</option>`).join('')}</select> <button data-lab="run">Run</button> <button data-lab="repeat">Repeat</button> <button data-lab="swap">Swap sides & run</button> <button data-lab="compare">Compare last two</button></p>
    <p><button data-lab="tick">1 tick</button> <button data-lab="pause">Pause</button> <button data-lab="speed" data-speed="1">1×</button> <button data-lab="speed" data-speed="2">2×</button> <button data-lab="speed" data-speed="4">4×</button> <button data-lab="export">Export</button> <button data-lab="import">Import clipboard</button> <button data-lab="save">Save settings</button></p>
    <textarea data-lab="json" rows="12" style="width:100%;font-family:var(--vscode-editor-font-family,monospace)" aria-label="Combat Lab scenario JSON">${labEsc(selected ? JSON.stringify(selected, null, 2) : '')}</textarea>
    <p><button data-lab="apply">Apply scenario JSON</button> <button data-lab="clone">Clone scenario</button></p>
    <div class="inline-help">${result ? `<b>${labEsc(result.outcome)}</b> · ${result.ticks} ticks · ${result.durationSeconds.toFixed(2)}s · damage ${result.totalDamage} · heal ${result.totalHealing} · barrier ${result.barrierAbsorbed} · status ${result.statusApplications}` : 'Choose a reference scenario or provide valid JSON.'}</div>
    <div>${state.compare ? `Comparison: winner ${state.compare.winnerChanged ? 'changed' : 'same'}, duration Δ ${state.compare.durationDelta.toFixed(2)}, damage Δ ${state.compare.damageDelta}, changed inputs ${state.compare.changedInputs.length}.` : ''}</div>
    <details><summary>Combat timeline (${timeline.length})</summary><ol>${timeline.slice(0, 250).map(line => `<li>${labEsc(line)}</li>`).join('')}</ol></details>`;
  const json = () => root.querySelector('[data-lab="json"]').value;
  root.querySelector('[data-lab="scenario"]').onchange = event => { state.selected = event.target.value; renderCombatLab(); };
  root.querySelector('[data-lab="run"]').onclick = () => vscode.postMessage({ type: 'runCombatLab', scenarioId: state.selected });
  root.querySelector('[data-lab="repeat"]').onclick = () => vscode.postMessage({ type: 'runCombatLab', scenarioId: state.selected });
  root.querySelector('[data-lab="swap"]').onclick = () => vscode.postMessage({ type: 'swapCombatLabSides', scenarioId: state.selected });
  root.querySelector('[data-lab="compare"]').onclick = () => vscode.postMessage({ type: 'compareCombatLabRuns' });
  root.querySelector('[data-lab="tick"]').onclick = () => vscode.postMessage({ type: 'advanceCombatLabPlayback', ticks: 1 });
  root.querySelector('[data-lab="pause"]').onclick = () => vscode.postMessage({ type: 'pauseCombatLabPlayback' });
  root.querySelectorAll('[data-lab="speed"]').forEach(button => button.onclick = () => vscode.postMessage({ type: 'setCombatLabSpeed', speed: Number(button.dataset.speed) }));
  root.querySelector('[data-lab="export"]').onclick = () => vscode.postMessage({ type: 'exportCombatLab' }); root.querySelector('[data-lab="import"]').onclick = () => vscode.postMessage({ type: 'importCombatLab' }); root.querySelector('[data-lab="save"]').onclick = () => vscode.postMessage({ type: 'saveCombatLab' });
  root.querySelector('[data-lab="apply"]').onclick = () => vscode.postMessage({ type: 'applyCombatLabScenario', json: json() }); root.querySelector('[data-lab="clone"]').onclick = () => vscode.postMessage({ type: 'cloneCombatLabScenario', scenarioId: state.selected });
}
window.addEventListener('message', event => { const m = event.data || {}; const s = window.LR_combatLab; if (m.type === 'combatLabState') { Object.assign(s, m.state || {}); renderCombatLab(); } if (m.type === 'combatLabResult') { s.result = m.run; renderCombatLab(); } if (m.type === 'combatLabComparison') { s.compare = m.comparison; renderCombatLab(); } if (m.type === 'combatLabExport') { navigator.clipboard?.writeText(m.json); } });
document.addEventListener('DOMContentLoaded', () => { renderCombatLab(); vscode.postMessage({ type: 'requestCombatLab' }); });
