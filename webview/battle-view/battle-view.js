// LoreRelay Battle View webview.
// Presentation + interaction only. CombatCommandPlaytestHost (extension host)
// is the sole session/scheduler authority; this script shares that one session
// as a distinct peer subscriber, mirroring the Combat Lab command protocol
// (startId, peer adoption, replacement/clear) without owning any timer.
const bvVscode = acquireVsCodeApi();

function bvT(key, fallback) {
    const bundle = (typeof window !== 'undefined' && window.BV_I18N) || {};
    return bundle[key] || fallback || key;
}

const BV = {
    scenarios: [],
    selected: '',
    playtestMode: 'command',
    playtest: null,
    selection: [],
    pendingOrder: null,
    running: false,
    error: '',
    instanceId: bvNamespace(),
    startEpoch: 0,
    pendingStart: false,
    pendingStartId: null,
    activeStartId: null,
    eligibleForHostRestore: true,
    pendingPeerAdopt: false,
    drag: null,
    view: { scale: 1, mode: 'fit' },
    prevHp: {},
    dockVisible: true,
    outcomeDismissed: false,
    feedPinned: true,
};

/* ---------------- pure helpers (unit-testable) ---------------- */
function bvNamespace() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(8);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'ns_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function bvNextStartId(state) {
    if (!state.instanceId) state.instanceId = bvNamespace();
    state.startEpoch = (state.startEpoch || 0) + 1;
    return `${state.instanceId}:${state.startEpoch}`;
}
function bvClamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function bvEsc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function bvUnitPercent(value, min, max) { return max === min ? 50 : bvClamp(((value - min) / (max - min)) * 100, 0, 100); }
function bvWorldSize(bounds) {
    return {
        w: Math.max(1, (bounds?.maxX ?? 200) - (bounds?.minX ?? -200)),
        h: Math.max(1, (bounds?.maxY ?? 150) - (bounds?.minY ?? -150)),
    };
}
function bvOrderView(order, dead) {
    if (dead) return { label: '', cls: '' };
    switch (order) {
        case 'attack_target': return { label: 'ATK', cls: 'bv-order-attack' };
        case 'attack_move': return { label: 'A-MV', cls: 'bv-order-attack' };
        case 'move_to': return { label: 'MOVE', cls: 'bv-order-move' };
        case 'stop': return { label: 'HOLD', cls: 'bv-order-hold' };
        case 'resume_gambit':
        case null:
        case undefined:
        default: return { label: 'GMBT', cls: 'bv-order-gambit' };
    }
}
function bvHpColor(percent) {
    if (percent <= 25) return 'var(--bv-hp-lo)';
    if (percent <= 55) return 'var(--bv-hp-mid)';
    return 'var(--bv-hp-hi)';
}
function bvMarkerModel(unit, bounds, selected) {
    const maxHp = typeof unit.maxHp === 'number' && unit.maxHp > 0 ? unit.maxHp : 1;
    const rawHp = unit.dead ? 0 : (typeof unit.hp === 'number' ? unit.hp : 0);
    const displayHp = Math.max(0, Math.min(rawHp, maxHp));
    const hpPercent = Math.max(0, Math.min(100, Math.round((displayHp / maxHp) * 100)));
    const shortId = String(unit.id).replace(/^ally_|^enemy_/, '');
    return {
        left: bvUnitPercent(unit.x, bounds.minX, bounds.maxX),
        top: bvUnitPercent(unit.y, bounds.minY, bounds.maxY),
        team: unit.team,
        dead: Boolean(unit.dead),
        selected: Boolean(selected),
        maxHp, displayHp, hpPercent,
        hpColor: bvHpColor(hpPercent),
        shortId,
        order: bvOrderView(unit.order, Boolean(unit.dead)),
        title: `${unit.id} · ${bvT('battleView.hp', 'HP')} ${displayHp}/${maxHp}`
            + `${unit.action ? ` · ${unit.action}` : ''}${unit.targetId ? ` → ${bvShortUnitId(unit.targetId)}` : ''}${unit.order ? ` · ${unit.order}` : ''}`,
    };
}
function bvShortUnitId(id) { return String(id).replace(/^ally_|^enemy_/, ''); }
/** Ticks after which a unit's last-seen target line fades, then disappears. */
const BV_TARGET_STALE_TICKS = 90;
const BV_TARGET_HIDE_TICKS = 300;
/**
 * World-space line from a living unit to its last engaged target.
 * Null when there is nothing meaningful to draw: no target yet, either end
 * dead (corpses keep their position — an arrow into one reads as a bug), the
 * target missing from the roster, or the sighting is too old to matter.
 */
function bvTargetLineModel(unit, unitsById, bounds, tick) {
    if (!unit || unit.dead || !unit.targetId) return null;
    const target = unitsById[unit.targetId];
    if (!target || target.dead || target.id === unit.id) return null;
    const age = typeof unit.targetTick === 'number' ? Math.max(0, (tick || 0) - unit.targetTick) : 0;
    if (age > BV_TARGET_HIDE_TICKS) return null;
    return {
        x1: unit.x - bounds.minX,
        y1: unit.y - bounds.minY,
        x2: target.x - bounds.minX,
        y2: target.y - bounds.minY,
        team: unit.team,
        stale: age > BV_TARGET_STALE_TICKS,
    };
}
/** One roster row: HP + current action + target, readable without looking at the field. */
function bvRosterRowModel(unit, selected) {
    const maxHp = typeof unit.maxHp === 'number' && unit.maxHp > 0 ? unit.maxHp : 1;
    const rawHp = unit.dead ? 0 : (typeof unit.hp === 'number' ? unit.hp : 0);
    const displayHp = Math.round(Math.max(0, Math.min(rawHp, maxHp)));
    const hpPercent = Math.max(0, Math.min(100, Math.round((displayHp / maxHp) * 100)));
    return {
        id: unit.id,
        shortId: bvShortUnitId(unit.id),
        team: unit.team,
        dead: Boolean(unit.dead),
        selected: Boolean(selected),
        displayHp,
        maxHp: Math.round(maxHp),
        hpPercent,
        hpColor: bvHpColor(hpPercent),
        action: unit.dead ? '' : (unit.action || ''),
        targetShort: !unit.dead && unit.targetId ? bvShortUnitId(unit.targetId) : '',
    };
}
/** One result-table row from the snapshot's accumulated stats. Display-rounded. */
function bvResultRowModel(unit) {
    const stats = unit.stats || {};
    const round = value => Math.round(typeof value === 'number' && isFinite(value) ? value : 0);
    return {
        id: unit.id,
        shortId: bvShortUnitId(unit.id),
        team: unit.team,
        dead: Boolean(unit.dead),
        damageDealt: round(stats.damageDealt),
        damageTaken: round(stats.damageTaken),
        healingGiven: round(stats.healingGiven),
        kills: round(stats.kills),
        topTargetShort: stats.topTargetId ? bvShortUnitId(stats.topTargetId) : '',
    };
}
/** One battle-log line. Team colors come from the live roster, not id prefixes. */
function bvFeedEntryModel(entry, unitsById) {
    const teamOf = id => {
        const unit = id ? unitsById[id] : undefined;
        return unit ? unit.team : (String(id || '').startsWith('enemy_') ? 1 : 0);
    };
    const amount = Math.round(typeof entry.amount === 'number' && isFinite(entry.amount) ? entry.amount : 0);
    return {
        kind: entry.kind,
        tick: entry.tick,
        sourceShort: entry.sourceId ? bvShortUnitId(entry.sourceId) : '',
        sourceTeam: entry.sourceId ? teamOf(entry.sourceId) : null,
        targetShort: bvShortUnitId(entry.targetId),
        targetTeam: teamOf(entry.targetId),
        amountText: entry.kind === 'heal' ? `+${amount}` : (entry.dodged ? '' : `−${amount}`),
        dodged: Boolean(entry.dodged),
        lethal: Boolean(entry.lethal),
    };
}
function bvCommandMessageForPointer(ui, targetUnit, point) {
    if (!ui.selection || !ui.selection.length || !point) return null;
    if (ui.pendingOrder === 'attack_move') {
        return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'attack_move', point };
    }
    if (targetUnit && targetUnit.team === 1 && !targetUnit.dead) {
        return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'attack_target', targetId: targetUnit.id };
    }
    return { type: 'issueCombatCommand', unitIds: [...ui.selection], command: 'move_to', point };
}
/** Screen → world using the stage's post-transform rect, so it stays correct at any zoom. */
function bvScreenToWorld(stageRect, clientX, clientY, bounds) {
    const xRatio = stageRect.width ? bvClamp((clientX - stageRect.left) / stageRect.width, 0, 1) : 0;
    const yRatio = stageRect.height ? bvClamp((clientY - stageRect.top) / stageRect.height, 0, 1) : 0;
    return {
        x: bounds.minX + xRatio * (bounds.maxX - bounds.minX),
        y: bounds.minY + yRatio * (bounds.maxY - bounds.minY),
    };
}
function bvComputeFitScale(viewportW, viewportH, worldW, worldH) {
    if (!viewportW || !viewportH || !worldW || !worldH) return 1;
    return Math.max(0.05, Math.min(viewportW / worldW, viewportH / worldH) * 0.94);
}
/** Order controls are unavailable without a session or in spectator mode. */
function bvCommandControlsDisabled(state) {
    return !state.playtest || state.playtestMode === 'spectator';
}
function bvStatusText(state) {
    const sel = state.selection && state.selection.length
        ? `${state.selection.length} (${state.selection.map(String).join(', ')})`
        : bvT('battleView.none', 'none');
    return sel;
}
function bvFeedbackText(state) {
    if (state.error) return String(state.error);
    const playtest = state.playtest;
    const feedback = ((playtest && playtest.feedback) || []).map(r =>
        `${r.unitId}: ${r.command} ${r.kind}${r.reason ? ` (${r.reason})` : ''}`);
    const queued = playtest && playtest.lastIssued
        ? `${bvT('battleView.queued', 'Queued')} t${playtest.lastIssued.tick}: ${playtest.lastIssued.command} (${playtest.lastIssued.unitIds.join(', ')})`
        : '';
    return [queued, ...feedback].filter(Boolean).join('  ·  ');
}

/* ---------------- outbound commands ---------------- */
function bvPost(message) {
    if (BV.activeStartId) message.startId = BV.activeStartId;
    bvVscode.postMessage(message);
}
function bvSendSelectedCommand(command) {
    if (!BV.selection.length) { BV.error = bvT('battleView.errSelectAllies', 'Select allied units first.'); bvRefresh(); return; }
    BV.error = '';
    bvPost({ type: 'issueCombatCommand', unitIds: [...BV.selection], command });
}
function bvResetUi(state, clearPlaytest = true) {
    state.running = false;
    state.selection = [];
    state.pendingOrder = null;
    state.error = '';
    state.pendingStart = false;
    state.pendingStartId = null;
    state.pendingPeerAdopt = false;
    state.drag = null;
    if (clearPlaytest) {
        state.playtest = null; state.activeStartId = null; state.prevHp = {};
        state.outcomeDismissed = false; state.feedPinned = true;
    }
}
/** True when a host session exists or is being started for this peer. */
function bvHasSession(state) {
    return Boolean(state.playtest || state.pendingStart || state.activeStartId);
}
/**
 * Issue exactly one authoritative start with a fresh startId — the same
 * replacement-start contract Combat Lab uses. The host retires any prior
 * session and every subscriber adopts this scenario/startId; old-startId
 * snapshots are rejected while pendingStart is armed.
 */
function bvStartRequest(state, scenarioId, mode, autoRun) {
    state.eligibleForHostRestore = false;
    bvResetUi(state, true);
    state.selected = scenarioId;
    state.playtestMode = mode;
    state.running = Boolean(autoRun);
    const startId = bvNextStartId(state);
    state.pendingStart = true;
    state.pendingStartId = startId;
    bvVscode.postMessage({ type: 'startCombatCommandPlaytest', scenarioId, mode, startId, autoRun: Boolean(autoRun) });
    renderBattleView();
}
/** Scenario change: replacement start while a session is live, else just re-select. */
function bvScenarioChange(state, scenarioId) {
    if (bvHasSession(state)) {
        bvStartRequest(state, scenarioId, state.playtestMode, false);
    } else {
        state.selected = scenarioId;
        state.eligibleForHostRestore = false;
        bvRefresh();
    }
}
/** Mode change: replacement start while a session is live (keeps host authority aligned), else display-only. */
function bvModeChange(state, mode) {
    if (bvHasSession(state)) {
        bvStartRequest(state, state.selected, mode, false);
    } else {
        state.playtestMode = mode;
        bvRefresh();
    }
}

/* ---------------- view transform ---------------- */
function bvCurrentScale(viewport, worldW, worldH) {
    if (BV.view.mode === 'fit') {
        return bvComputeFitScale(viewport.clientWidth, viewport.clientHeight, worldW, worldH);
    }
    return BV.view.scale;
}
function bvApplyViewTransform() {
    const root = bvRoot();
    if (!root) return;
    const viewport = root.querySelector('[data-bv="viewport"]');
    const stage = root.querySelector('[data-bv="stage"]');
    if (!viewport || !stage) return;
    const bounds = (BV.playtest && BV.playtest.bounds) || { minX: -200, maxX: 200, minY: -150, maxY: 150 };
    const { w: worldW, h: worldH } = bvWorldSize(bounds);
    stage.style.width = `${worldW}px`;
    stage.style.height = `${worldH}px`;
    const scale = bvCurrentScale(viewport, worldW, worldH);
    BV.view.scale = scale;
    const offX = Math.max(0, (viewport.clientWidth - worldW * scale) / 2);
    const offY = Math.max(0, (viewport.clientHeight - worldH * scale) / 2);
    stage.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
    const readout = root.querySelector('[data-bv="zoom-readout"]');
    if (readout) readout.textContent = `${Math.round(scale * 100)}%`;
}
function bvSetZoom(nextScale) {
    BV.view.mode = 'manual';
    BV.view.scale = bvClamp(nextScale, 0.1, 6);
    bvApplyViewTransform();
}

/* ---------------- DOM helpers ---------------- */
function bvRoot() {
    return typeof document !== 'undefined' && typeof document.getElementById === 'function'
        ? document.getElementById('bv-root') : null;
}
function bvCanUpdateInPlace() {
    const root = bvRoot();
    if (!root || typeof root.querySelector !== 'function') return false;
    return Boolean(root.querySelector('[data-bv="stage"]') && root.querySelector('[data-bv="run"]'));
}
function bvRefresh() {
    if (bvCanUpdateInPlace()) bvUpdateInPlace();
    else renderBattleView();
}

/* ---------------- rendering ---------------- */
function bvScenarioOptions(state) {
    return (state.scenarios || []).map(s =>
        `<option value="${bvEsc(s.id)}" ${s.id === state.selected ? 'selected' : ''}>${bvEsc(s.name)} (${bvEsc(s.mode)})</option>`
    ).join('');
}
function renderBattleView() {
    const root = bvRoot();
    if (!root) return;
    const state = BV;
    const spectator = state.playtestMode === 'spectator';
    root.className = `bv-root${spectator ? ' bv-spectator' : ''}${state.dockVisible ? '' : ' bv-no-dock'}`;
    const hasSession = Boolean(state.playtest);
    root.innerHTML = `
    <div class="bv-chrome">
      <div class="bv-toolbar">
        <div class="bv-group">
          <div class="bv-group-label">${bvEsc(bvT('battleView.group.session', 'Session'))}</div>
          <div class="bv-group-row">
            <select class="bv-select-input" data-bv="scenario" title="${bvEsc(bvT('battleView.scenario', 'Scenario'))}">${bvScenarioOptions(state)}</select>
            <button class="bv-btn" data-bv="start">${bvEsc(bvT('battleView.start', 'Start / Restart'))}</button>
            <button class="bv-btn" data-bv="run">${bvEsc(state.running ? bvT('battleView.pause', 'Pause') : bvT('battleView.run', 'Run'))}</button>
            <button class="bv-btn bv-btn-secondary" data-bv="step">${bvEsc(bvT('battleView.step', '1 tick'))}</button>
          </div>
        </div>
        <div class="bv-group">
          <div class="bv-group-label">${bvEsc(bvT('battleView.group.orders', 'Orders'))}</div>
          <div class="bv-group-row">
            <button class="bv-btn bv-btn-secondary" data-bv="attack-move">${bvEsc(bvT('battleView.attackMove', 'Attack-move'))}</button>
            <button class="bv-btn bv-btn-secondary" data-bv="stop">${bvEsc(bvT('battleView.stop', 'Stop'))}</button>
            <button class="bv-btn bv-btn-secondary" data-bv="resume">${bvEsc(bvT('battleView.resume', 'Resume Gambit'))}</button>
          </div>
        </div>
        <div class="bv-group">
          <div class="bv-group-label">${bvEsc(bvT('battleView.group.mode', 'Mode'))}</div>
          <div class="bv-group-row">
            <select class="bv-select-input" data-bv="mode">
              <option value="command" ${!spectator ? 'selected' : ''}>${bvEsc(bvT('battleView.modeCommand', 'Command'))}</option>
              <option value="spectator" ${spectator ? 'selected' : ''}>${bvEsc(bvT('battleView.modeSpectator', 'Spectator'))}</option>
            </select>
          </div>
        </div>
        <div class="bv-group">
          <div class="bv-group-label">${bvEsc(bvT('battleView.group.view', 'View'))}</div>
          <div class="bv-group-row">
            <button class="bv-btn bv-btn-secondary" data-bv="fit">${bvEsc(bvT('battleView.fit', 'Fit'))}</button>
            <button class="bv-btn bv-btn-secondary" data-bv="zoom-out" title="${bvEsc(bvT('battleView.zoomOut', 'Zoom out'))}">−</button>
            <span class="bv-zoom-readout" data-bv="zoom-readout">100%</span>
            <button class="bv-btn bv-btn-secondary" data-bv="zoom-in" title="${bvEsc(bvT('battleView.zoomIn', 'Zoom in'))}">+</button>
            <button class="bv-btn bv-btn-secondary" data-bv="zoom-reset">${bvEsc(bvT('battleView.zoomReset', '100%'))}</button>
            <button class="bv-btn bv-btn-secondary${state.dockVisible ? ' bv-active' : ''}" data-bv="dock-toggle">${bvEsc(bvT('battleView.dock', 'Info'))}</button>
          </div>
        </div>
      </div>
      <div class="bv-status" data-bv="status"></div>
    </div>
    <div class="bv-main">
      <div class="bv-arena">
        <div class="bv-spectator-ribbon">${bvEsc(bvT('battleView.modeSpectator', 'Spectator'))}</div>
        <div class="bv-viewport" data-bv="viewport" tabindex="0" aria-label="Battle View battlefield">
          <div class="bv-stage" data-bv="stage"></div>
          <div class="bv-selbox" data-bv="selbox"></div>
        </div>
        <div class="bv-empty" data-bv="empty" style="display:${hasSession ? 'none' : 'flex'}">${bvEsc(bvT('battleView.empty', 'No active battle. Choose a scenario and press Start.'))}</div>
        <div class="bv-outcome-banner" data-bv="outcome">
          <span class="bv-outcome-key">${bvEsc(bvT('battleView.outcome', 'Outcome'))}</span>
          <span class="bv-outcome-value" data-bv="outcome-value"></span>
          <button class="bv-outcome-close" data-bv="outcome-close" title="${bvEsc(bvT('battleView.close', 'Close'))}">✕</button>
        </div>
      </div>
      <div class="bv-dock" data-bv="dock">
        <div class="bv-dock-section bv-dock-roster">
          <div class="bv-dock-title" data-bv="roster-title">${bvEsc(bvT('battleView.allies', 'Allies'))}</div>
          <div class="bv-roster" data-bv="roster"></div>
        </div>
        <div class="bv-dock-section bv-dock-feed">
          <div class="bv-dock-title">${bvEsc(bvT('battleView.feed', 'Battle Log'))}</div>
          <div class="bv-feed" data-bv="feed"></div>
        </div>
      </div>
    </div>
    <div class="bv-foot">
      <div class="bv-feedback" data-bv="feedback"></div>
      <div class="bv-hint">${bvEsc(bvT('battleView.hintSelect', 'Click allies to select.'))}</div>
    </div>`;
    bindBattleView(root);
    bvApplyViewTransform();
    bvUpdateInPlace();
    bvObserveViewport();
}
/**
 * Track the *current* viewport. renderBattleView replaces the arena DOM
 * (combatLabState, session adoption, scenario/mode replacement), so the
 * observer must be re-pointed at the fresh viewport each structural render.
 * Fit mode reflows to the new panel size; manual zoom is left untouched.
 */
let bvResizeObserver = null;
function bvObserveViewport() {
    if (typeof ResizeObserver !== 'function') return;
    if (!bvResizeObserver) {
        bvResizeObserver = new ResizeObserver(() => { if (BV.view.mode === 'fit') bvApplyViewTransform(); });
    }
    bvResizeObserver.disconnect();
    const root = bvRoot();
    const viewport = root && root.querySelector('[data-bv="viewport"]');
    if (viewport) bvResizeObserver.observe(viewport);
}
function bvOrderBadgeHtml(model) {
    if (!model.order.label) return '';
    return `<span class="bv-order-badge ${model.order.cls}">${bvEsc(model.order.label)}</span>`;
}
function bvUnitHtml(unit, model) {
    return `<div class="bv-unit${model.selected ? ' bv-selected' : ''}${model.dead ? ' bv-dead' : ''}"
        data-unit-id="${bvEsc(unit.id)}" data-unit-team="${model.team}" title="${bvEsc(model.title)}"
        style="left:${model.left}%;top:${model.top}%">
        ${bvOrderBadgeHtml(model)}
        <div class="bv-token">${bvEsc(model.shortId)}</div>
        <div class="bv-hpbar"><div class="bv-hpfill" style="width:${model.hpPercent}%;background:${model.hpColor}"></div></div>
        <div class="bv-hpnum">${model.displayHp}/${model.maxHp}</div>
      </div>`;
}
function bvSyncMarkers(stage, state) {
    const playtest = state.playtest;
    const units = (playtest && playtest.units) || [];
    const bounds = (playtest && playtest.bounds) || { minX: -200, maxX: 200, minY: -150, maxY: 150 };
    const selected = new Set(state.selection || []);
    const existing = new Map();
    stage.querySelectorAll('[data-unit-id]').forEach(node => existing.set(node.dataset.unitId, node));
    const seen = new Set();
    const nextHp = {};
    for (const unit of units) {
        seen.add(unit.id);
        const model = bvMarkerModel(unit, bounds, selected.has(unit.id));
        const prev = state.prevHp ? state.prevHp[unit.id] : undefined;
        const tookDamage = typeof prev === 'number' && model.displayHp < prev;
        nextHp[unit.id] = model.displayHp;
        let node = existing.get(unit.id);
        if (!node) {
            const tmp = document.createElement('div');
            tmp.innerHTML = bvUnitHtml(unit, model);
            node = tmp.firstElementChild;
            stage.appendChild(node);
        } else {
            node.className = `bv-unit${model.selected ? ' bv-selected' : ''}${model.dead ? ' bv-dead' : ''}`;
            node.title = model.title;
            node.style.left = `${model.left}%`;
            node.style.top = `${model.top}%`;
            const fill = node.querySelector('.bv-hpfill');
            if (fill) { fill.style.width = `${model.hpPercent}%`; fill.style.background = model.hpColor; }
            const num = node.querySelector('.bv-hpnum');
            if (num) num.textContent = `${model.displayHp}/${model.maxHp}`;
            const badge = node.querySelector('.bv-order-badge');
            if (model.order.label) {
                if (badge) { badge.textContent = model.order.label; badge.className = `bv-order-badge ${model.order.cls}`; }
            } else if (badge) { badge.remove(); }
        }
        if (tookDamage && node && node.classList) {
            node.classList.remove('bv-hit');
            void (node.offsetWidth);
            node.classList.add('bv-hit');
        }
    }
    for (const [id, node] of existing) { if (!seen.has(id)) node.remove(); }
    state.prevHp = nextHp;
}
/**
 * Target lines live in one SVG kept as the stage's first child, under the unit
 * markers. The stage is world-sized in px, so world coordinates map 1:1 and the
 * existing translate/scale transform applies to lines and markers alike;
 * non-scaling-stroke keeps line weight constant at every zoom.
 */
function bvSyncTargetLines(stage, state) {
    let svg = stage.querySelector('[data-bv="lines"]');
    const playtest = state.playtest;
    const units = (playtest && playtest.units) || [];
    const bounds = (playtest && playtest.bounds) || { minX: -200, maxX: 200, minY: -150, maxY: 150 };
    const { w: worldW, h: worldH } = bvWorldSize(bounds);
    if (!svg) {
        stage.insertAdjacentHTML('afterbegin',
            `<svg data-bv="lines" class="bv-lines" viewBox="0 0 ${worldW} ${worldH}" preserveAspectRatio="none"></svg>`);
        svg = stage.querySelector('[data-bv="lines"]');
        if (!svg) return;
    } else {
        svg.setAttribute('viewBox', `0 0 ${worldW} ${worldH}`);
    }
    const unitsById = {};
    for (const unit of units) unitsById[unit.id] = unit;
    const selected = new Set(state.selection || []);
    const tick = playtest ? playtest.tick : 0;
    const parts = [];
    for (const unit of units) {
        const line = bvTargetLineModel(unit, unitsById, bounds, tick);
        if (!line) continue;
        const cls = `bv-line ${line.team === 0 ? 'bv-line-ally' : 'bv-line-enemy'}` +
            `${line.stale ? ' bv-line-stale' : ''}${selected.has(unit.id) ? ' bv-line-selected' : ''}`;
        parts.push(`<line class="${cls}" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" vector-effect="non-scaling-stroke"></line>` +
            `<circle class="${cls}" cx="${line.x2}" cy="${line.y2}" r="4" vector-effect="non-scaling-stroke"></circle>`);
    }
    svg.innerHTML = parts.join('');
}
function bvRosterRowHtml(model) {
    return `<button class="bv-roster-row${model.selected ? ' bv-selected' : ''}${model.dead ? ' bv-dead' : ''}"
        data-roster-id="${bvEsc(model.id)}" data-roster-team="${model.team}">
        <span class="bv-roster-dot bv-team-${model.team}"></span>
        <span class="bv-roster-id">${bvEsc(model.shortId)}</span>
        <span class="bv-roster-hp"><span class="bv-roster-hpbar"><span class="bv-roster-hpfill" style="width:${model.hpPercent}%;background:${model.hpColor}"></span></span>
        <span class="bv-roster-hpnum">${model.displayHp}/${model.maxHp}</span></span>
        <span class="bv-roster-act">${model.dead ? '✕' : bvEsc(model.action || '—')}${model.targetShort ? `<span class="bv-roster-target">→ ${bvEsc(model.targetShort)}</span>` : ''}</span>
      </button>`;
}
function bvResultHeaderHtml() {
    return `<div class="bv-result-row bv-result-head">
        <span class="bv-roster-dot"></span>
        <span class="bv-roster-id"></span>
        <span class="bv-result-num">${bvEsc(bvT('battleView.col.dmg', 'DMG'))}</span>
        <span class="bv-result-num">${bvEsc(bvT('battleView.col.taken', 'TKN'))}</span>
        <span class="bv-result-num">${bvEsc(bvT('battleView.col.heal', 'HEAL'))}</span>
        <span class="bv-result-num">${bvEsc(bvT('battleView.col.kills', 'KO'))}</span>
      </div>`;
}
function bvResultRowHtml(model) {
    return `<div class="bv-result-row${model.dead ? ' bv-dead' : ''}">
        <span class="bv-roster-dot bv-team-${model.team}"></span>
        <span class="bv-roster-id">${model.dead ? '✕ ' : ''}${bvEsc(model.shortId)}</span>
        <span class="bv-result-num">${model.damageDealt}</span>
        <span class="bv-result-num">${model.damageTaken}</span>
        <span class="bv-result-num">${model.healingGiven}</span>
        <span class="bv-result-num">${model.kills}</span>
      </div>`;
}
/** Roster while fighting; per-unit results (both teams) once the battle ends. */
function bvSyncRoster(root, state) {
    const container = root.querySelector('[data-bv="roster"]');
    const title = root.querySelector('[data-bv="roster-title"]');
    if (!container) return;
    const playtest = state.playtest;
    const units = (playtest && playtest.units) || [];
    const resultMode = Boolean(playtest && playtest.outcome);
    if (title) title.textContent = resultMode ? bvT('battleView.result', 'Results') : bvT('battleView.allies', 'Allies');
    if (!playtest) { container.innerHTML = ''; return; }
    if (resultMode) {
        const allies = units.filter(u => u.team === 0).map(bvResultRowModel);
        const enemies = units.filter(u => u.team === 1).map(bvResultRowModel);
        container.innerHTML =
            bvResultHeaderHtml() + allies.map(bvResultRowHtml).join('') +
            (enemies.length ? `<div class="bv-result-sep">${bvEsc(bvT('battleView.enemies', 'Enemies'))}</div>` + enemies.map(bvResultRowHtml).join('') : '');
        return;
    }
    const selected = new Set(state.selection || []);
    container.innerHTML = units.filter(u => u.team === 0)
        .map(unit => bvRosterRowHtml(bvRosterRowModel(unit, selected.has(unit.id)))).join('');
}
function bvFeedRowHtml(model) {
    const src = model.sourceShort
        ? `<span class="bv-feed-name bv-team-${model.sourceTeam}">${bvEsc(model.sourceShort)}</span>` : '';
    const tgt = `<span class="bv-feed-name bv-team-${model.targetTeam}">${bvEsc(model.targetShort)}</span>`;
    if (model.kind === 'death') {
        return `<div class="bv-feed-row bv-feed-death">💀 ${tgt} <span class="bv-feed-note">${bvEsc(bvT('battleView.down', 'down'))}</span></div>`;
    }
    if (model.kind === 'heal') {
        return `<div class="bv-feed-row bv-feed-heal">${src} ✚ ${tgt} <span class="bv-feed-amt">${bvEsc(model.amountText)}</span></div>`;
    }
    const amt = model.dodged
        ? `<span class="bv-feed-note">${bvEsc(bvT('battleView.dodge', 'dodge'))}</span>`
        : `<span class="bv-feed-amt">${bvEsc(model.amountText)}</span>`;
    return `<div class="bv-feed-row${model.lethal ? ' bv-feed-lethal' : ''}">${src} ⚔ ${tgt} ${amt}${model.lethal ? ' 💀' : ''}</div>`;
}
function bvSyncFeed(root, state) {
    const feed = root.querySelector('[data-bv="feed"]');
    if (!feed) return;
    const playtest = state.playtest;
    const events = (playtest && playtest.recentEvents) || [];
    const unitsById = {};
    for (const unit of (playtest && playtest.units) || []) unitsById[unit.id] = unit;
    feed.innerHTML = events.map(entry => bvFeedRowHtml(bvFeedEntryModel(entry, unitsById))).join('');
    if (state.feedPinned) feed.scrollTop = feed.scrollHeight;
}
function bvUpdateInPlace() {
    const root = bvRoot();
    if (!root || !bvCanUpdateInPlace()) { renderBattleView(); return; }
    const state = BV;
    const spectator = state.playtestMode === 'spectator';
    root.className = `bv-root${spectator ? ' bv-spectator' : ''}${state.dockVisible ? '' : ' bv-no-dock'}`;
    const playtest = state.playtest;

    const runBtn = root.querySelector('[data-bv="run"]');
    if (runBtn) runBtn.textContent = state.running ? bvT('battleView.pause', 'Pause') : bvT('battleView.run', 'Run');
    const stepBtn = root.querySelector('[data-bv="step"]');
    if (stepBtn) stepBtn.disabled = !playtest;
    // Order controls: unavailable without a session or in spectator mode.
    const commandDisabled = bvCommandControlsDisabled(state);
    ['attack-move', 'stop', 'resume'].forEach(name => {
        const btn = root.querySelector(`[data-bv="${name}"]`);
        if (btn) btn.disabled = commandDisabled;
    });
    const attackBtn = root.querySelector('[data-bv="attack-move"]');
    if (attackBtn) {
        const active = state.pendingOrder === 'attack_move';
        attackBtn.classList.toggle('bv-active', active);
        attackBtn.textContent = active ? bvT('battleView.attackMoveActive', 'Attack-move — choose ground') : bvT('battleView.attackMove', 'Attack-move');
    }
    const modeSel = root.querySelector('[data-bv="mode"]');
    if (modeSel && typeof state.playtestMode === 'string') modeSel.value = state.playtestMode;

    const status = root.querySelector('[data-bv="status"]');
    if (status) {
        const tick = playtest ? playtest.tick : 0;
        const modeLabel = spectator ? bvT('battleView.modeSpectator', 'Spectator') : bvT('battleView.modeCommand', 'Command');
        let html =
            `<span class="bv-chip bv-chip-ally"><span class="bv-chip-key">${bvEsc(bvT('battleView.selected', 'Selected'))}</span><b>${bvEsc(bvStatusText(state))}</b></span>` +
            `<span class="bv-chip"><span class="bv-chip-key">${bvEsc(bvT('battleView.tick', 'Tick'))}</span><b>${tick}</b></span>` +
            `<span class="bv-chip"><span class="bv-chip-key">${bvEsc(bvT('battleView.mode', 'Mode'))}</span><b>${bvEsc(modeLabel)}</b></span>`;
        if (playtest && playtest.outcome) {
            html += `<span class="bv-chip bv-chip-outcome">${bvEsc(playtest.outcome)}</span>`;
        }
        status.innerHTML = html;
    }
    const empty = root.querySelector('[data-bv="empty"]');
    if (empty) empty.style.display = playtest ? 'none' : 'flex';

    const stage = root.querySelector('[data-bv="stage"]');
    if (stage) {
        bvSyncTargetLines(stage, state);
        bvSyncMarkers(stage, state);
    }
    bvSyncRoster(root, state);
    bvSyncFeed(root, state);

    const dockToggle = root.querySelector('[data-bv="dock-toggle"]');
    if (dockToggle) dockToggle.classList.toggle('bv-active', state.dockVisible);

    const outcome = root.querySelector('[data-bv="outcome"]');
    const outcomeValue = root.querySelector('[data-bv="outcome-value"]');
    if (outcome && outcomeValue) {
        if (playtest && playtest.outcome && !state.outcomeDismissed) {
            outcome.classList.add('bv-show');
            outcomeValue.textContent = playtest.outcome;
        } else {
            outcome.classList.remove('bv-show');
            outcomeValue.textContent = '';
        }
    }
    const feedback = root.querySelector('[data-bv="feedback"]');
    if (feedback) {
        feedback.textContent = bvFeedbackText(state);
        feedback.classList.toggle('bv-error', Boolean(state.error));
    }
}

/* ---------------- interaction binding ---------------- */
function bindBattleView(root) {
    const state = BV;
    const viewport = root.querySelector('[data-bv="viewport"]');
    const stage = root.querySelector('[data-bv="stage"]');

    root.querySelector('[data-bv="scenario"]').onchange = event => bvScenarioChange(state, event.target.value);
    root.querySelector('[data-bv="mode"]').onchange = event => bvModeChange(state, event.target.value);
    root.querySelector('[data-bv="start"]').onclick = () => bvStartRequest(state, state.selected, state.playtestMode, false);
    root.querySelector('[data-bv="run"]').onclick = () => {
        if (!state.playtest) { bvStartRequest(state, state.selected, state.playtestMode, true); return; }
        state.eligibleForHostRestore = false;
        state.running = !state.running;
        bvRefresh();
        const payload = { type: 'setCombatCommandPlaytestRunning', running: state.running };
        if (state.activeStartId) payload.startId = state.activeStartId;
        bvVscode.postMessage(payload);
    };
    root.querySelector('[data-bv="step"]').onclick = () => {
        if (!state.playtest) return;
        const payload = { type: 'stepCombatCommandPlaytest', ticks: 1 };
        if (state.activeStartId) payload.startId = state.activeStartId;
        bvVscode.postMessage(payload);
    };
    root.querySelector('[data-bv="attack-move"]').onclick = () => {
        if (state.playtestMode === 'spectator') return;
        state.pendingOrder = state.pendingOrder === 'attack_move' ? null : 'attack_move';
        bvRefresh();
    };
    root.querySelector('[data-bv="stop"]').onclick = () => bvSendSelectedCommand('stop');
    root.querySelector('[data-bv="resume"]').onclick = () => bvSendSelectedCommand('resume_gambit');

    root.querySelector('[data-bv="fit"]').onclick = () => { state.view.mode = 'fit'; bvApplyViewTransform(); };
    root.querySelector('[data-bv="zoom-in"]').onclick = () => bvSetZoom(state.view.scale * 1.25);
    root.querySelector('[data-bv="zoom-out"]').onclick = () => bvSetZoom(state.view.scale * 0.8);
    root.querySelector('[data-bv="zoom-reset"]').onclick = () => bvSetZoom(1);
    const dockToggle = root.querySelector('[data-bv="dock-toggle"]');
    if (dockToggle) dockToggle.onclick = () => {
        state.dockVisible = !state.dockVisible;
        bvRefresh();
        // The arena just gained/lost the dock's width; refit so nothing crops.
        if (state.view.mode === 'fit') bvApplyViewTransform();
    };
    const outcomeClose = root.querySelector('[data-bv="outcome-close"]');
    if (outcomeClose) outcomeClose.onclick = () => { state.outcomeDismissed = true; bvRefresh(); };
    const roster = root.querySelector('[data-bv="roster"]');
    if (roster) roster.onclick = event => {
        const row = event.target.closest && event.target.closest('[data-roster-id]');
        if (!row || !roster.contains(row)) return;
        const playtest = state.playtest;
        const unit = playtest && playtest.units.find(u => u.id === row.dataset.rosterId);
        // Same selection contract as battlefield markers: living allies only.
        if (!unit || unit.team !== 0 || unit.dead) return;
        const selection = new Set(state.selection);
        if (event.shiftKey) { selection.has(unit.id) ? selection.delete(unit.id) : selection.add(unit.id); }
        else { selection.clear(); selection.add(unit.id); }
        state.selection = [...selection]; state.error = '';
        bvRefresh();
    };
    const feed = root.querySelector('[data-bv="feed"]');
    if (feed) feed.onscroll = () => {
        state.feedPinned = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 6;
    };

    if (!viewport || !stage) return;
    stage.onclick = event => {
        const marker = event.target.closest && event.target.closest('[data-unit-id]');
        if (!marker || !stage.contains(marker)) return;
        const playtest = state.playtest;
        const unit = playtest && playtest.units.find(u => u.id === marker.dataset.unitId);
        if (!unit || unit.team !== 0 || unit.dead) return;
        const selection = new Set(state.selection);
        if (event.shiftKey) { selection.has(unit.id) ? selection.delete(unit.id) : selection.add(unit.id); }
        else { selection.clear(); selection.add(unit.id); }
        state.selection = [...selection]; state.error = '';
        bvRefresh();
    };
    stage.onmouseover = event => {
        const marker = event.target.closest && event.target.closest('[data-unit-id]');
        if (marker && stage.contains(marker)) marker.classList.add('bv-hovered');
    };
    stage.onmouseout = event => {
        const marker = event.target.closest && event.target.closest('[data-unit-id]');
        if (marker && stage.contains(marker)) marker.classList.remove('bv-hovered');
    };
    viewport.oncontextmenu = event => {
        event.preventDefault();
        const playtest = state.playtest;
        if (!playtest) { state.error = bvT('battleView.errStartFirst', 'Start the battle first.'); bvRefresh(); return; }
        if (state.playtestMode === 'spectator') { state.error = bvT('battleView.spectatorNote', 'Spectator mode.'); bvRefresh(); return; }
        const targetMarker = event.target.closest && event.target.closest('[data-unit-id]');
        const targetUnit = targetMarker ? playtest.units.find(u => u.id === targetMarker.dataset.unitId) : null;
        const point = bvScreenToWorld(stage.getBoundingClientRect(), event.clientX, event.clientY, playtest.bounds);
        const message = bvCommandMessageForPointer(state, targetUnit, point);
        if (!message) { state.error = bvT('battleView.errSelectAllies', 'Select allied units first.'); bvRefresh(); return; }
        if (message.command === 'attack_move') state.pendingOrder = null;
        if (state.activeStartId) message.startId = state.activeStartId;
        state.error = ''; bvVscode.postMessage(message);
        if (message.command === 'attack_move') bvRefresh();
    };
    viewport.onpointerdown = event => {
        if (event.button !== 0 || (event.target.closest && event.target.closest('[data-unit-id]'))) return;
        const rect = viewport.getBoundingClientRect();
        state.drag = { x: event.clientX - rect.left, y: event.clientY - rect.top, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top };
        viewport.setPointerCapture && viewport.setPointerCapture(event.pointerId);
    };
    viewport.onpointermove = event => {
        if (!state.drag) return;
        const rect = viewport.getBoundingClientRect();
        const box = root.querySelector('[data-bv="selbox"]');
        state.drag.currentX = bvClamp(event.clientX - rect.left, 0, rect.width);
        state.drag.currentY = bvClamp(event.clientY - rect.top, 0, rect.height);
        const left = Math.min(state.drag.x, state.drag.currentX);
        const top = Math.min(state.drag.y, state.drag.currentY);
        box.style.display = 'block';
        box.style.left = `${left}px`; box.style.top = `${top}px`;
        box.style.width = `${Math.abs(state.drag.currentX - state.drag.x)}px`;
        box.style.height = `${Math.abs(state.drag.currentY - state.drag.y)}px`;
    };
    viewport.onpointerup = event => {
        if (!state.drag) return;
        const vpRect = viewport.getBoundingClientRect();
        const left = Math.min(state.drag.x, state.drag.currentX);
        const right = Math.max(state.drag.x, state.drag.currentX);
        const top = Math.min(state.drag.y, state.drag.currentY);
        const bottom = Math.max(state.drag.y, state.drag.currentY);
        const selected = [];
        stage.querySelectorAll('[data-unit-id][data-unit-team="0"]').forEach(marker => {
            if (marker.classList && marker.classList.contains('bv-dead')) return;
            const rect = marker.getBoundingClientRect();
            const x = (rect.left + rect.right) / 2 - vpRect.left;
            const y = (rect.top + rect.bottom) / 2 - vpRect.top;
            if (x >= left && x <= right && y >= top && y <= bottom) selected.push(marker.dataset.unitId);
        });
        const box = root.querySelector('[data-bv="selbox"]');
        if (box) box.style.display = 'none';
        state.drag = null; state.selection = selected; state.error = '';
        viewport.releasePointerCapture && viewport.releasePointerCapture(event.pointerId);
        bvRefresh();
    };
}

/* ---------------- inbound messages (peer adoption state machine) ---------------- */
function bvHandleStateMessage(m) {
    const state = BV;
    if (!m.state) {
        state.eligibleForHostRestore = false;
        const keepPending = Boolean(state.pendingStart && state.pendingStartId);
        const pendingStartId = state.pendingStartId;
        const peerAdopt = m.sessionEvent === 'replaced';
        bvResetUi(state, true);
        if (keepPending) { state.pendingStart = true; state.pendingStartId = pendingStartId; }
        if (peerAdopt) state.pendingPeerAdopt = true;
        renderBattleView();
        return;
    }
    let forceStructural = false;
    if (state.pendingStart) {
        if (m.state.scenarioId !== state.selected) return;
        if (!m.state.startId || m.state.startId !== state.pendingStartId) return;
        state.pendingStart = false; state.pendingStartId = null; state.activeStartId = m.state.startId;
        state.pendingPeerAdopt = false; state.eligibleForHostRestore = false;
        forceStructural = true;
    } else if (state.pendingPeerAdopt) {
        if (!m.state.startId) return;
        const previousSelected = state.selected;
        if (m.state.scenarioId) state.selected = m.state.scenarioId;
        state.activeStartId = m.state.startId;
        if (m.state.mode === 'command' || m.state.mode === 'spectator') state.playtestMode = m.state.mode;
        state.pendingPeerAdopt = false; state.eligibleForHostRestore = false;
        if (m.state.scenarioId && m.state.scenarioId !== previousSelected) forceStructural = true;
    } else if (state.eligibleForHostRestore) {
        state.eligibleForHostRestore = false;
        if (!state.playtest && m.state.scenarioId) {
            state.selected = m.state.scenarioId;
            state.activeStartId = m.state.startId || null;
            if (m.state.mode === 'command' || m.state.mode === 'spectator') state.playtestMode = m.state.mode;
            forceStructural = true;
        }
    } else if (!state.activeStartId) {
        return;
    }
    if (m.state.scenarioId && m.state.scenarioId !== state.selected) return;
    if (state.activeStartId && m.state.startId !== state.activeStartId) return;
    // A freshly decided battle must always surface its banner, even if a
    // previous battle's banner was dismissed.
    const hadOutcome = Boolean(state.playtest && state.playtest.outcome);
    if (!hadOutcome && m.state.outcome) state.outcomeDismissed = false;
    state.playtest = m.state; state.error = '';
    const controllable = new Set((m.state.units || []).filter(u => u.team === 0 && !u.dead).map(u => u.id));
    state.selection = state.selection.filter(id => controllable.has(id));
    if (m.state.outcome) state.running = false;
    else if (typeof m.state.running === 'boolean') state.running = m.state.running;
    if (forceStructural) renderBattleView();
    else bvRefresh();
}
function bvHandleErrorMessage(m) {
    const state = BV;
    if (m.operation === 'start') {
        if (state.pendingStart) {
            if (!m.startId || !state.pendingStartId || m.startId !== state.pendingStartId) return;
            if (m.scenarioId && m.scenarioId !== state.selected) return;
            state.pendingStart = false; state.pendingStartId = null; state.pendingPeerAdopt = false;
            if (!state.playtest) state.running = false;
        } else if (state.playtest) {
            return;
        } else {
            state.running = false; state.pendingPeerAdopt = false;
        }
    }
    state.error = String(m.error || 'Command rejected');
    if (m.operation === 'start' || !bvCanUpdateInPlace()) renderBattleView();
    else bvUpdateInPlace();
}

function bvOnMessage(event) {
    const m = (event && event.data) || {};
    if (m.type === 'combatLabState') {
        const doc = m.state && m.state.document;
        if (doc && Array.isArray(doc.scenarios)) {
            BV.scenarios = doc.scenarios.map(s => ({ id: s.id, name: s.name, mode: s.mode }));
            if (!BV.selected && BV.scenarios.length) BV.selected = BV.scenarios[0].id;
        }
        renderBattleView();
        return;
    }
    if (m.type === 'combatCommandPlaytestState') { bvHandleStateMessage(m); return; }
    if (m.type === 'combatCommandPlaytestError') { bvHandleErrorMessage(m); return; }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('message', bvOnMessage);
    // The ResizeObserver is (re)attached to the current viewport inside
    // renderBattleView via bvObserveViewport, so it survives structural rerenders.
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        renderBattleView();
        bvVscode.postMessage({ type: 'requestCombatLab' });
    });
}
