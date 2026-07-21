// Combat Lab is an opt-in, workspace-local simulator. The host owns all
// validation and execution; this module owns only transient UI interaction state.
window.LR_combatLab = window.LR_combatLab || {
  document: { scenarios: [] }, selected: '', result: null, compare: null,
  playtest: null, playtestMode: 'command', selection: [], pendingOrder: null,
  running: false, timer: null, error: '',
};

function labEsc(value) { const n = document.createElement('span'); n.textContent = String(value || ''); return n.innerHTML; }
function labClamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function combatCommandMessageForPointer(ui, targetUnit, point) {
  if (!ui.selection?.length || !point) return null;
  if (ui.pendingOrder === 'attack_move') {
    return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'attack_move', point };
  }
  if (targetUnit?.team === 1 && !targetUnit.dead) {
    return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'attack_target', targetId: targetUnit.id };
  }
  return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'move_to', point };
}
function combatBattlefieldPoint(field, clientX, clientY, bounds) {
  const rect = field.getBoundingClientRect();
  const xRatio = rect.width ? labClamp((clientX - rect.left) / rect.width, 0, 1) : 0;
  const yRatio = rect.height ? labClamp((clientY - rect.top) / rect.height, 0, 1) : 0;
  return {
    x: bounds.minX + xRatio * (bounds.maxX - bounds.minX),
    y: bounds.minY + yRatio * (bounds.maxY - bounds.minY),
  };
}
function combatUnitPercent(value, min, max) { return max === min ? 50 : labClamp(((value - min) / (max - min)) * 100, 0, 100); }
function sendSelectedCombatCommand(command) {
  const state = window.LR_combatLab;
  if (!state.selection.length) { state.error = 'Select one or more allied units first.'; renderCombatLab(); return; }
  vscode.postMessage({ type: 'issueCombatCommand', unitIds: [...state.selection], command });
}
function resetCombatCommandPlaytestUi(state, clearPlaytest = true) {
  if (state.timer) clearInterval(state.timer);
  state.timer = null; state.running = false; state.selection = []; state.pendingOrder = null; state.error = '';
  if (clearPlaytest) state.playtest = null;
}
function selectCombatLabScenarioForPlaytest(state, scenarioId) {
  const restart = Boolean(state.playtest); state.selected = scenarioId;
  resetCombatCommandPlaytestUi(state);
  return restart ? { type: 'startCombatCommandPlaytest', scenarioId, mode: state.playtestMode } : null;
}
function syncCombatPlaytestTimer() {
  const state = window.LR_combatLab;
  if (state.running && state.playtest && !state.playtest.outcome && !state.timer) {
    state.timer = setInterval(() => vscode.postMessage({ type: 'stepCombatCommandPlaytest', ticks: 3 }), 100);
  }
  if ((!state.running || !state.playtest || state.playtest.outcome) && state.timer) {
    clearInterval(state.timer); state.timer = null;
  }
}
function renderCombatCommandPlaytest(state) {
  const playtest = state.playtest;
  const units = playtest?.units || [];
  const bounds = playtest?.bounds || { minX: -200, maxX: 200, minY: -150, maxY: 150 };
  const selected = new Set(state.selection || []);
  const markers = units.map(unit => {
    const left = combatUnitPercent(unit.x, bounds.minX, bounds.maxX);
    const top = combatUnitPercent(unit.y, bounds.minY, bounds.maxY);
    const color = unit.team === 0 ? '#4aa3ff' : '#e66a6a';
    const outline = selected.has(unit.id) ? '3px solid #ffd866' : '1px solid rgba(255,255,255,.65)';
    return `<button data-unit-id="${labEsc(unit.id)}" data-unit-team="${unit.team}" ${unit.dead ? 'disabled' : ''}
      title="${labEsc(unit.id)} HP ${unit.hp}/${unit.maxHp}${unit.order ? ` order ${labEsc(unit.order)}` : ''}"
      style="position:absolute;left:${left}%;top:${top}%;transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;border:${outline};background:${color};color:white;font-size:10px;opacity:${unit.dead ? '.35' : '1'}">${labEsc(unit.id.replace(/^ally_|^enemy_/, ''))}</button>`;
  }).join('');
  const feedback = (playtest?.feedback || []).map(receipt => `${receipt.unitId}: ${receipt.command} ${receipt.kind}${receipt.reason ? ` (${receipt.reason})` : ''}`);
  const queued = playtest?.lastIssued
    ? `Queued tick ${playtest.lastIssued.tick} seq ${playtest.lastIssued.seq}: ${playtest.lastIssued.command} (${playtest.lastIssued.unitIds.join(', ')})`
    : '';
  return `<hr><h4>Command Playtest</h4>
    <div class="inline-help">Real CombatState via stepCombat. Command is the default; spectator keeps the same simulation but rejects player orders.</div>
    <p><label>Mode <select data-lab="playtest-mode"><option value="command" ${state.playtestMode === 'command' ? 'selected' : ''}>Command</option><option value="spectator" ${state.playtestMode === 'spectator' ? 'selected' : ''}>Spectator</option></select></label>
      <button data-lab="playtest-start">Start / restart</button>
      <button data-lab="playtest-run">${state.running ? 'Pause' : 'Run'}</button>
      <button data-lab="playtest-step">1 tick</button></p>
    <p><button data-lab="attack-move" aria-pressed="${state.pendingOrder === 'attack_move'}">Attack-move${state.pendingOrder === 'attack_move' ? ' (choose ground)' : ''}</button>
      <button data-lab="stop">Stop</button> <button data-lab="resume">Resume Gambit</button></p>
    <div class="inline-help">Selected: ${state.selection.length ? state.selection.map(labEsc).join(', ') : 'none'}${playtest ? ` · tick ${playtest.tick} · ${labEsc(playtest.mode)}` : ''}${playtest?.outcome ? ` · ${labEsc(playtest.outcome)}` : ''}</div>
    <div data-lab="battlefield" tabindex="0" aria-label="Combat command battlefield"
      style="position:relative;height:340px;margin:.5rem 0;border:1px solid var(--vscode-panel-border,#666);background:rgba(0,0,0,.18);overflow:hidden;touch-action:none;user-select:none">${markers}<div data-lab="selection-box" style="display:none;position:absolute;border:1px dashed #ffd866;background:rgba(255,216,102,.12);pointer-events:none"></div></div>
    <div class="inline-help">Click allies to select (Shift toggles). Drag empty ground for box selection. Right-click ground to move; right-click an enemy to attack.</div>
    <div role="status">${state.error ? labEsc(state.error) : [queued, ...feedback].filter(Boolean).map(labEsc).join(' · ')}</div>`;
}
function bindCombatCommandPlaytest(root) {
  const state = window.LR_combatLab;
  const field = root.querySelector('[data-lab="battlefield"]');
  root.querySelector('[data-lab="playtest-mode"]').onchange = event => { state.playtestMode = event.target.value; };
  root.querySelector('[data-lab="playtest-start"]').onclick = () => {
    const scenarioId = state.selected; const mode = state.playtestMode;
    resetCombatCommandPlaytestUi(state); renderCombatLab();
    vscode.postMessage({ type: 'startCombatCommandPlaytest', scenarioId, mode });
  };
  root.querySelector('[data-lab="playtest-run"]').onclick = () => {
    if (!state.playtest) { vscode.postMessage({ type: 'startCombatCommandPlaytest', scenarioId: state.selected, mode: state.playtestMode }); return; }
    state.running = !state.running; renderCombatLab();
  };
  root.querySelector('[data-lab="playtest-step"]').onclick = () => vscode.postMessage({ type: 'stepCombatCommandPlaytest', ticks: 1 });
  root.querySelector('[data-lab="attack-move"]').onclick = () => { state.pendingOrder = state.pendingOrder === 'attack_move' ? null : 'attack_move'; renderCombatLab(); };
  root.querySelector('[data-lab="stop"]').onclick = () => sendSelectedCombatCommand('stop');
  root.querySelector('[data-lab="resume"]').onclick = () => sendSelectedCombatCommand('resume_gambit');

  const playtest = state.playtest;
  root.querySelectorAll('[data-unit-id]').forEach(marker => {
    marker.onclick = event => {
      const unit = playtest?.units.find(entry => entry.id === marker.dataset.unitId);
      if (!unit || unit.team !== 0 || unit.dead) return;
      const selection = new Set(state.selection);
      if (event.shiftKey) { selection.has(unit.id) ? selection.delete(unit.id) : selection.add(unit.id); }
      else { selection.clear(); selection.add(unit.id); }
      state.selection = [...selection]; state.error = ''; renderCombatLab();
    };
    marker.onmouseenter = () => { marker.style.filter = 'brightness(1.35)'; };
    marker.onmouseleave = () => { marker.style.filter = ''; };
  });
  field.oncontextmenu = event => {
    event.preventDefault();
    if (!playtest) { state.error = 'Start the command playtest first.'; renderCombatLab(); return; }
    const targetMarker = event.target.closest?.('[data-unit-id]');
    const targetUnit = targetMarker ? playtest.units.find(unit => unit.id === targetMarker.dataset.unitId) : null;
    const point = combatBattlefieldPoint(field, event.clientX, event.clientY, playtest.bounds);
    const message = combatCommandMessageForPointer(state, targetUnit, point);
    if (!message) { state.error = 'Select one or more allied units first.'; renderCombatLab(); return; }
    if (message.command === 'attack_move') state.pendingOrder = null;
    state.error = ''; vscode.postMessage(message);
  };
  field.onpointerdown = event => {
    if (event.button !== 0 || event.target.closest?.('[data-unit-id]')) return;
    const rect = field.getBoundingClientRect();
    state.drag = { x: event.clientX - rect.left, y: event.clientY - rect.top, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top };
    field.setPointerCapture?.(event.pointerId);
  };
  field.onpointermove = event => {
    if (!state.drag) return;
    const rect = field.getBoundingClientRect(); const box = root.querySelector('[data-lab="selection-box"]');
    state.drag.currentX = labClamp(event.clientX - rect.left, 0, rect.width); state.drag.currentY = labClamp(event.clientY - rect.top, 0, rect.height);
    const left = Math.min(state.drag.x, state.drag.currentX); const top = Math.min(state.drag.y, state.drag.currentY);
    box.style.display = 'block'; box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${Math.abs(state.drag.currentX - state.drag.x)}px`; box.style.height = `${Math.abs(state.drag.currentY - state.drag.y)}px`;
  };
  field.onpointerup = event => {
    if (!state.drag) return;
    const fieldRect = field.getBoundingClientRect(); const left = Math.min(state.drag.x, state.drag.currentX); const right = Math.max(state.drag.x, state.drag.currentX); const top = Math.min(state.drag.y, state.drag.currentY); const bottom = Math.max(state.drag.y, state.drag.currentY);
    const selected = [];
    root.querySelectorAll('[data-unit-id][data-unit-team="0"]:not(:disabled)').forEach(marker => {
      const rect = marker.getBoundingClientRect(); const x = (rect.left + rect.right) / 2 - fieldRect.left; const y = (rect.top + rect.bottom) / 2 - fieldRect.top;
      if (x >= left && x <= right && y >= top && y <= bottom) selected.push(marker.dataset.unitId);
    });
    state.drag = null; state.selection = selected; state.error = ''; field.releasePointerCapture?.(event.pointerId); renderCombatLab();
  };
}
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
    <details><summary>Combat timeline (${timeline.length})</summary><ol>${timeline.slice(0, 250).map(line => `<li>${labEsc(line)}</li>`).join('')}</ol></details>${renderCombatCommandPlaytest(state)}`;
  const json = () => root.querySelector('[data-lab="json"]').value;
  root.querySelector('[data-lab="scenario"]').onchange = event => {
    const restartMessage = selectCombatLabScenarioForPlaytest(state, event.target.value);
    renderCombatLab(); if (restartMessage) vscode.postMessage(restartMessage);
  };
  root.querySelector('[data-lab="run"]').onclick = () => vscode.postMessage({ type: 'runCombatLab', scenarioId: state.selected });
  root.querySelector('[data-lab="repeat"]').onclick = () => vscode.postMessage({ type: 'runCombatLab', scenarioId: state.selected });
  root.querySelector('[data-lab="swap"]').onclick = () => vscode.postMessage({ type: 'swapCombatLabSides', scenarioId: state.selected });
  root.querySelector('[data-lab="compare"]').onclick = () => vscode.postMessage({ type: 'compareCombatLabRuns' });
  root.querySelector('[data-lab="tick"]').onclick = () => vscode.postMessage({ type: 'advanceCombatLabPlayback', ticks: 1 });
  root.querySelector('[data-lab="pause"]').onclick = () => vscode.postMessage({ type: 'pauseCombatLabPlayback' });
  root.querySelectorAll('[data-lab="speed"]').forEach(button => button.onclick = () => vscode.postMessage({ type: 'setCombatLabSpeed', speed: Number(button.dataset.speed) }));
  root.querySelector('[data-lab="export"]').onclick = () => vscode.postMessage({ type: 'exportCombatLab' }); root.querySelector('[data-lab="import"]').onclick = () => vscode.postMessage({ type: 'importCombatLab' }); root.querySelector('[data-lab="save"]').onclick = () => vscode.postMessage({ type: 'saveCombatLab' });
  root.querySelector('[data-lab="apply"]').onclick = () => vscode.postMessage({ type: 'applyCombatLabScenario', json: json() }); root.querySelector('[data-lab="clone"]').onclick = () => vscode.postMessage({ type: 'cloneCombatLabScenario', scenarioId: state.selected });
  bindCombatCommandPlaytest(root); syncCombatPlaytestTimer();
}
window.addEventListener('message', event => {
  const m = event.data || {}; const state = window.LR_combatLab;
  if (m.type === 'combatLabState') { Object.assign(state, m.state || {}); renderCombatLab(); }
  if (m.type === 'combatLabResult') { state.result = m.run; renderCombatLab(); }
  if (m.type === 'combatLabComparison') { state.compare = m.comparison; renderCombatLab(); }
  if (m.type === 'combatLabExport') { navigator.clipboard?.writeText(m.json); }
  if (m.type === 'combatCommandPlaytestState') {
    state.playtest = m.state; state.error = '';
    const controllable = new Set((m.state?.units || []).filter(unit => unit.team === 0 && !unit.dead).map(unit => unit.id));
    state.selection = state.selection.filter(id => controllable.has(id));
    if (m.state?.outcome) state.running = false;
    renderCombatLab();
  }
  if (m.type === 'combatCommandPlaytestError') { state.error = String(m.error || 'Command rejected'); renderCombatLab(); }
});
document.addEventListener('DOMContentLoaded', () => { renderCombatLab(); vscode.postMessage({ type: 'requestCombatLab' }); });
