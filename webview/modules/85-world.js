/* global window, document, vscode */

const FACTION_TYPE_COLOR = {
    hostile: '#6b2020',
    neutral: '#2d4a2d',
    friendly: '#1a3a5c',
    'player-faction': '#4a3a00'
};

const FACTION_TYPE_ICON = {
    hostile: '💀',
    neutral: '⚖️',
    friendly: '🤝',
    'player-faction': '⭐'
};

const SEVERITY_COLOR = {
    minor: 'var(--vscode-charts-yellow)',
    moderate: 'var(--vscode-charts-orange, #e8a838)',
    major: '#c04040',
    catastrophic: '#800020'
};

let currentWorldLocationId = null;
let worldSceneImagePending = false;
let worldMapMode = 'mermaid';
const WORLD_MAP_MODE_KEY = 'lorerelay.worldMapMode';
let _worldViewMsg = null;
let _selectedPinId = null;
let _worldPinCatalog = new Map();
const WORLD_PIN_HIT_RADIUS_PX = 22;
let _worldPinDismissReady = false;
let _regionFeedbackMap = new Map();
let _lastDangerFlashLocationId = null;

const MAP_EVENT_SEVERITY_GLYPH = {
    info: '🔥',
    warning: '🔥',
    critical: '‼️',
};

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'worldView') {
            renderWorldView(msg);
        }
        if (msg.type === 'worldGenStart') {
            setWorldGenBusy(true);
        }
        if (msg.type === 'worldGenEnd') {
            setWorldGenBusy(false);
            if (!msg.success) {
                const btn = document.getElementById('world-gen-btn');
                if (btn) {
                    btn.classList.add('failed');
                    btn.innerHTML = `<span>${T('webview.world.worldGenFailed')}</span>`;
                }
            }
        }
        if (msg.type === 'worldMapGenStart') {
            setWorldMapGenBusy(true);
        }
        if (msg.type === 'worldMapGenEnd') {
            setWorldMapGenBusy(false, !msg.success);
        }
        if (msg.type === 'locationImageGenStart') {
            setWorldSceneImageBusy(true);
        }
        if (msg.type === 'locationImageGenEnd') {
            setWorldSceneImageBusy(false, !msg.success);
        }
        if (msg.type === 'imageGenEnd' && worldSceneImagePending) {
            setWorldSceneImageBusy(false, !msg.success);
        }
    });

    const tabBtn = document.getElementById('tab-btn-world');
    if (tabBtn) {
        tabBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'loadWorld' });
        });
    }

    const genImageBtn = document.getElementById('world-gen-image-btn');
    if (genImageBtn) {
        genImageBtn.addEventListener('click', () => {
            if (currentWorldLocationId) {
                worldSceneImagePending = true;
                setWorldSceneImageBusy(true);
                vscode.postMessage({ type: 'generateLocationImage', locationId: currentWorldLocationId });
            }
        });
    }

    const genMapBtn = document.getElementById('world-gen-map-btn');
    if (genMapBtn) {
        genMapBtn.addEventListener('click', () => {
            setWorldMapGenBusy(true);
            vscode.postMessage({ type: 'generateWorldMapImage' });
        });
    }

    const modeMermaid = document.getElementById('world-map-mode-mermaid');
    const modeParchment = document.getElementById('world-map-mode-parchment');
    const modeTile = document.getElementById('world-map-mode-tile');
    if (modeMermaid) {
        modeMermaid.addEventListener('click', () => setWorldMapMode('mermaid'));
    }
    if (modeParchment) {
        modeParchment.addEventListener('click', () => setWorldMapMode('parchment'));
    }
    if (modeTile) {
        modeTile.addEventListener('click', () => setWorldMapMode('tile'));
    }

    try {
        const saved = localStorage.getItem(WORLD_MAP_MODE_KEY);
        if (saved === 'mermaid' || saved === 'parchment' || saved === 'tile') {
            worldMapMode = saved;
        }
    } catch { /* private mode */ }

    ensureCartographyStyles();
    applyWorldMapModeVisibility();
    buildWorldGenForm();
    initWorldPinDismiss();
});

function renderWorldView(msg) {
    if (typeof updateNpcTtsFromWorldView === 'function') {
        updateNpcTtsFromWorldView(msg);
    }
    const empty = document.getElementById('world-empty');
    const content = document.getElementById('world-content');
    if (!content) { return; }

    if (!msg.enabled) {
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');

    // ヘッダー
    const titleEl = document.getElementById('world-title');
    const themeEl = document.getElementById('world-theme');
    const statsEl = document.getElementById('world-stats');
    const genImageBtn = document.getElementById('world-gen-image-btn');

    if (titleEl) { titleEl.textContent = msg.worldName || ''; }
    if (themeEl) { themeEl.textContent = msg.theme ? `[${msg.theme}]` : ''; }
    window.currentWorldTheme = msg.theme || undefined;
    if (statsEl) {
        const turnStr = msg.simEnabled && msg.worldTurn !== null
            ? ` · Turn ${msg.worldTurn}`
            : '';
        statsEl.textContent = `${msg.regionCount ?? 0} regions · ${msg.locationCount ?? 0} locations${turnStr}`;
    }

    currentWorldLocationId = msg.currentLocationId;
    _worldViewMsg = msg;
    rebuildWorldPinCatalog(msg);
    rebuildRegionFeedbackMap(msg);
    maybeFlashHighDangerEntry(msg);
    if (genImageBtn) {
        genImageBtn.style.display = currentWorldLocationId ? '' : 'none';
    }

    // Mermaid + parchment + tile maps
    renderMermaidMap(msg.worldMap, msg);
    renderCartographyMap(msg);
    _tileOvermapMsg = msg;
    syncWorldPinSelectionUi();

    if (msg.cartographyHasImage && worldMapMode === 'parchment') {
        setWorldMapMode('parchment', { persist: false });
    } else {
        applyWorldMapModeVisibility();
    }

    // Location image history (from visual_memory.json)
    renderLocationImages(msg.locationImages || [], msg.currentLocationId);

    // NPCs at current location
    renderNpcsAtLocation(msg.npcsAtLocation || [], msg.currentLocationId);

    // グローバルイベント（シミュ有効時）
    renderGlobalEvents(msg.globalEvents || [], msg.simEnabled);

    // Living World recent events
    renderRecentChanges(msg.recentChanges || [], msg.simEnabled);

    // Quest Board
    renderQuestHooks(msg.questHooks || []);

    // 派閥カード
    renderFactions(msg.factions || [], msg.factionStates || null);
}

function ensureCartographyStyles() {
    if (document.getElementById('world-cartography-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-cartography-styles';
    style.textContent = `
        .world-map-mode-bar {
            display: flex;
            gap: 0.35rem;
            margin-bottom: 0.45rem;
        }
        .world-map-mode-btn {
            font-size: 0.78em;
            padding: 0.2rem 0.55rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.25);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .world-map-mode-btn.is-active {
            border-color: var(--vscode-focusBorder, #4a90e2);
            background: rgba(74,144,226,0.18);
        }
        .world-map-panel.hidden { display: none !important; }
        .world-cartography-stage {
            position: relative;
            border-radius: 4px;
            overflow: hidden;
            background: rgba(0,0,0,0.12);
        }
        .world-cartography-stage img {
            width: 100%;
            display: block;
            user-select: none;
            -webkit-user-drag: none;
        }
        .world-map-pin {
            position: absolute;
            transform: translate(-50%, -100%);
            border: none;
            background: transparent;
            font-size: 1.15em;
            line-height: 1;
            padding: 0;
            cursor: default;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.65));
            opacity: 0.88;
            z-index: 4;
        }
        .world-map-pin::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            min-width: 44px;
            min-height: 44px;
        }
        .world-map-pin.is-interactive {
            cursor: pointer;
        }
        .world-map-pin.is-interactive:hover,
        .world-map-pin.is-selected {
            transform: translate(-50%, -100%) scale(1.12);
            z-index: 6;
        }
        .world-map-pin.is-selected {
            filter: drop-shadow(0 0 8px rgba(120, 180, 255, 0.95));
        }
        .world-map-pin.is-current {
            font-size: 1.45em;
            opacity: 1;
            filter: drop-shadow(0 0 6px rgba(255,210,80,0.9));
            z-index: 5;
            animation: world-pin-pulse 2.4s ease-in-out infinite;
        }
        @keyframes world-pin-pulse {
            0%, 100% { filter: drop-shadow(0 0 4px rgba(255,210,80,0.75)); }
            50% { filter: drop-shadow(0 0 10px rgba(255,220,120,1)); }
        }
        .world-map-region-label {
            position: absolute;
            transform: translate(-50%, 0);
            font-size: 0.62em;
            line-height: 1.15;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(20, 14, 8, 0.72);
            color: #f5e6c8;
            border: 1px solid rgba(255, 220, 160, 0.35);
            pointer-events: none;
            white-space: nowrap;
            max-width: 28%;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
            z-index: 1;
        }
        #world-gen-map-btn.generating {
            opacity: 0.75;
        }
        .world-fog-overlay {
            position: absolute;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 3;
            transition: opacity 0.45s ease;
        }
        .world-fog-overlay.is-unknown {
            background: radial-gradient(circle, rgba(8, 10, 18, 0.92) 0%, rgba(8, 10, 18, 0.78) 55%, rgba(8, 10, 18, 0.35) 100%);
        }
        .world-fog-overlay.is-rumored {
            background: radial-gradient(circle, rgba(12, 16, 24, 0.55) 0%, rgba(12, 16, 24, 0.28) 60%, transparent 100%);
        }
        .world-map-pin.is-rumored {
            opacity: 0.72;
            font-size: 1.05em;
        }
        .world-map-pin.is-hidden-fog {
            display: none;
        }
        .world-map-region-label.is-hidden-fog {
            display: none;
        }
        .world-map-region-label.is-rumored {
            opacity: 0.82;
            font-style: italic;
        }
        .world-location-detail {
            margin-top: 0.55rem;
            padding: 0.65rem 0.75rem;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.22);
            font-size: 0.88em;
        }
        .world-location-detail.hidden { display: none !important; }
        .world-location-detail h4 {
            margin: 0 0 0.35rem;
            font-size: 1.05em;
        }
        .world-location-detail .world-pin-meta {
            opacity: 0.78;
            font-size: 0.9em;
            margin-bottom: 0.45rem;
        }
        .world-location-detail .world-pin-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .world-location-detail .world-pin-action-btn {
            font-size: 0.82em;
            padding: 0.25rem 0.55rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(74,144,226,0.15);
            color: var(--vscode-foreground, #ddd);
            cursor: pointer;
        }
        .world-location-detail .world-pin-action-btn:hover {
            border-color: var(--vscode-focusBorder, #4a90e2);
        }
        #world-overmap-canvas.world-pin-cursor {
            cursor: crosshair;
        }
        .world-map-pin-wrap {
            position: absolute;
            transform: translate(-50%, -100%);
            z-index: 4;
        }
        .world-map-pin-wrap .world-map-pin {
            position: relative;
            transform: none;
        }
        .world-map-pin-wrap .world-map-pin.is-interactive:hover,
        .world-map-pin-wrap .world-map-pin.is-selected {
            transform: scale(1.12);
        }
        .world-map-pin-wrap.is-selected { z-index: 6; }
        .world-map-pin.danger-tier-medium {
            filter: drop-shadow(0 0 5px rgba(232, 168, 56, 0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.65));
        }
        .world-map-pin.danger-tier-high {
            filter: drop-shadow(0 0 7px rgba(192, 64, 64, 0.98)) drop-shadow(0 1px 2px rgba(0,0,0,0.65));
        }
        .world-map-pin.danger-tier-high .world-pin-danger-mark {
            position: absolute;
            right: -0.35em;
            top: -0.2em;
            font-size: 0.72em;
            line-height: 1;
            pointer-events: none;
        }
        .world-map-region-label.faction-tint-friendly {
            border-color: rgba(90, 150, 220, 0.45);
            background: rgba(26, 58, 92, 0.72);
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-hostile {
            border-color: rgba(180, 70, 70, 0.5);
            background: rgba(60, 24, 24, 0.72);
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-neutral,
        .world-map-region-label.faction-tint-player-faction {
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-neutral {
            border-color: rgba(120, 150, 120, 0.4);
            background: rgba(30, 50, 30, 0.7);
        }
        .world-map-region-label.faction-tint-player-faction {
            border-color: rgba(210, 170, 60, 0.45);
            background: rgba(74, 58, 0, 0.68);
        }
        .world-map-region-label .world-label-faction-icon {
            margin-right: 0.2em;
        }
        .world-map-event-badge {
            position: absolute;
            left: 100%;
            top: 0;
            margin-left: 2px;
            font-size: 0.78em;
            line-height: 1;
            pointer-events: none;
            animation: world-map-event-pulse 2.2s ease-out 3;
        }
        .world-map-event-badge.is-critical {
            animation: world-map-event-fade 3.5s ease-out forwards;
        }
        @keyframes world-map-event-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.18); opacity: 0.82; }
        }
        @keyframes world-map-event-fade {
            0%, 70% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.9); }
        }
        .world-cartography-stage.danger-flash-once {
            animation: world-danger-flash 0.85s ease-out 1;
        }
        @keyframes world-danger-flash {
            0% { box-shadow: inset 0 0 0 rgba(192, 48, 48, 0); }
            35% { box-shadow: inset 0 0 120px rgba(192, 48, 48, 0.28); }
            100% { box-shadow: inset 0 0 0 rgba(192, 48, 48, 0); }
        }
    `;
    document.head.appendChild(style);
}

function rebuildWorldPinCatalog(msg) {
    _worldPinCatalog = new Map();
    const catalog = Array.isArray(msg.locationPinCatalog) ? msg.locationPinCatalog : [];
    for (const pin of catalog) {
        if (pin && pin.locationId) {
            _worldPinCatalog.set(pin.locationId, pin);
        }
    }
}

function rebuildRegionFeedbackMap(msg) {
    _regionFeedbackMap = new Map();
    const rows = Array.isArray(msg.regionMapFeedback) ? msg.regionMapFeedback : [];
    for (const row of rows) {
        if (row && row.regionId) {
            _regionFeedbackMap.set(row.regionId, row);
        }
    }
}

function getRegionFeedback(regionId) {
    if (!regionId) { return null; }
    return _regionFeedbackMap.get(regionId) || null;
}

function maybeFlashHighDangerEntry(msg) {
    const locId = msg.currentLocationId;
    if (!locId || locId === _lastDangerFlashLocationId) { return; }
    const meta = findWorldPinMeta(locId);
    if (!meta || meta.dangerTier !== 'high') { return; }
    _lastDangerFlashLocationId = locId;
    const stage = document.getElementById('world-cartography-stage');
    if (!stage) { return; }
    stage.classList.remove('danger-flash-once');
    void stage.offsetWidth;
    stage.classList.add('danger-flash-once');
    stage.addEventListener('animationend', () => {
        stage.classList.remove('danger-flash-once');
    }, { once: true });
}

function applyDangerClassesToPin(el, pinMeta) {
    if (!pinMeta || pinMeta.fogVisibility !== 'discovered') { return; }
    if (pinMeta.dangerTier === 'medium') {
        el.classList.add('danger-tier-medium');
    } else if (pinMeta.dangerTier === 'high') {
        el.classList.add('danger-tier-high');
        const mark = document.createElement('span');
        mark.className = 'world-pin-danger-mark';
        mark.textContent = '⚠';
        mark.setAttribute('aria-hidden', 'true');
        el.appendChild(mark);
    }
}

function appendMapEventBadge(wrap, pinMeta) {
    if (!pinMeta?.mapHighlight) { return; }
    const badge = document.createElement('span');
    badge.className = 'world-map-event-badge';
    const sev = pinMeta.highlightSeverity || 'info';
    if (sev === 'critical') { badge.classList.add('is-critical'); }
    badge.textContent = MAP_EVENT_SEVERITY_GLYPH[sev] || '🔥';
    badge.title = T('webview.world.mapEventBadge');
    wrap.appendChild(badge);
}

function decorateRegionLabelEl(el, label, visibility) {
    if (visibility !== 'discovered') { return; }
    const feedback = getRegionFeedback(label.regionId);
    if (!feedback) { return; }
    if (feedback.factionTint) {
        el.classList.add(`faction-tint-${feedback.factionTint}`);
    }
    if (feedback.controllingFactionName && feedback.factionType) {
        const icon = FACTION_TYPE_ICON[feedback.factionType] || '';
        if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'world-label-faction-icon';
            iconSpan.textContent = icon;
            el.prepend(iconSpan);
        }
    }
}

function findWorldPinMeta(locationId) {
    if (!locationId) { return null; }
    return _worldPinCatalog.get(locationId) || null;
}

function clearWorldPinSelection() {
    _selectedPinId = null;
    syncWorldPinSelectionUi();
    renderWorldLocationDetailPanel();
}

function selectWorldLocationPin(locationId) {
    const meta = findWorldPinMeta(locationId);
    if (!meta) { return; }
    if (meta.fogVisibility === 'rumored' || meta.fogVisibility === 'unknown') { return; }
    _selectedPinId = (_selectedPinId === locationId) ? null : locationId;
    syncWorldPinSelectionUi();
    renderWorldLocationDetailPanel();
}

function postWorldInsertChatText(text) {
    if (!text || typeof text !== 'string') { return; }
    vscode.postMessage({ type: 'insertChatText', text });
}

function buildWorldPinActionText(action, meta) {
    const name = meta.locationName || meta.locationId;
    if (action === 'move') {
        return T('webview.world.pinAction.move', { name });
    }
    if (action === 'examine') {
        return T('webview.world.pinAction.examine', { name });
    }
    return T('webview.world.pinAction.stay', { name });
}

function renderWorldLocationDetailPanel() {
    const panel = document.getElementById('world-location-detail');
    if (!panel) { return; }
    const meta = _selectedPinId ? findWorldPinMeta(_selectedPinId) : null;
    if (!meta || meta.fogVisibility !== 'discovered') {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    panel.classList.remove('hidden');
    const title = meta.locationName || meta.locationId;
    const typeLabel = meta.locationType || 'other';
    const metaParts = [`${T('webview.world.pinDetail.type')}: ${typeLabel}`];
    if (typeof meta.dangerLevel === 'number') {
        metaParts.push(`${T('webview.world.pinDetail.danger')}: ${meta.dangerLevel}/10`);
    }
    if (meta.factionName) {
        metaParts.push(`${T('webview.world.pinDetail.faction')}: ${meta.factionName}`);
    }
    if (meta.regionName) {
        metaParts.push(meta.regionName);
    }

    const actions = meta.isCurrent
        ? [{ action: 'stay', label: T('webview.world.pinDetail.stayBtn') }]
        : [
            { action: 'move', label: T('webview.world.pinDetail.moveBtn') },
            { action: 'examine', label: T('webview.world.pinDetail.examineBtn') },
        ];

    panel.innerHTML = '';
    const heading = document.createElement('h4');
    heading.textContent = title;
    panel.appendChild(heading);

    const metaEl = document.createElement('div');
    metaEl.className = 'world-pin-meta';
    metaEl.textContent = metaParts.join(' · ');
    panel.appendChild(metaEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'world-pin-actions';
    for (const item of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-pin-action-btn';
        btn.textContent = item.label;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            postWorldInsertChatText(buildWorldPinActionText(item.action, meta));
        });
        actionsEl.appendChild(btn);
    }
    panel.appendChild(actionsEl);
}

function syncWorldPinSelectionUi() {
    document.querySelectorAll('.world-map-pin[data-location-id]').forEach((el) => {
        const id = el.getAttribute('data-location-id');
        const selected = Boolean(id && id === _selectedPinId);
        el.classList.toggle('is-selected', selected);
        const wrap = el.closest('.world-map-pin-wrap');
        if (wrap) { wrap.classList.toggle('is-selected', selected); }
    });
}

function wireParchmentWorldPin(el, pin, msg) {
    const visibility = getRegionFogVisibility(pin.regionId, msg.fog);
    el.dataset.locationId = pin.locationId || '';
    if (visibility === 'rumored') {
        el.title = T('webview.world.pinRumoredTooltip');
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        return;
    }
    if (visibility !== 'discovered') { return; }
    el.classList.add('is-interactive');
    const meta = findWorldPinMeta(pin.locationId);
    const tooltipParts = [pin.locationName || pin.locationId];
    if (meta?.locationType) { tooltipParts.push(meta.locationType); }
    if (typeof meta?.dangerLevel === 'number') {
        tooltipParts.push(`${T('webview.world.pinDetail.danger')} ${meta.dangerLevel}/10`);
    }
    el.title = tooltipParts.join(' · ');
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectWorldLocationPin(pin.locationId);
    });
}

function escapeMermaidNodeId(id) {
    return String(id).replace(/[^a-zA-Z0-9_]/g, '_');
}

function resolveLocationIdFromMermaidNode(nodeId) {
    const match = String(nodeId).match(/flowchart-(.+?)(?:-\d+)?$/);
    const escaped = match ? match[1] : String(nodeId).replace(/^flowchart-/, '').replace(/-\d+$/, '');
    for (const [locId] of _worldPinCatalog) {
        if (escapeMermaidNodeId(locId) === escaped) {
            return locId;
        }
    }
    return null;
}

function initMermaidPinClicks(container) {
    if (!container) { return; }
    const svg = container.querySelector('svg');
    if (!svg) { return; }
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach((node) => {
        const locationId = resolveLocationIdFromMermaidNode(node.id || '');
        const meta = locationId ? findWorldPinMeta(locationId) : null;
        if (!meta || meta.fogVisibility !== 'discovered') { return; }
        node.style.cursor = 'pointer';
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            selectWorldLocationPin(meta.locationId);
        });
    });
}

function initWorldPinDismiss() {
    if (_worldPinDismissReady) { return; }
    _worldPinDismissReady = true;
    document.addEventListener('click', (e) => {
        if (!_selectedPinId) { return; }
        const panel = document.getElementById('world-location-detail');
        const target = e.target;
        if (target && (
            target.closest('.world-map-pin')
            || target.closest('#world-location-detail')
            || target.closest('#world-mermaid g.node')
            || target.closest('#world-overmap-canvas')
        )) {
            return;
        }
        if (panel && !panel.classList.contains('hidden')) {
            clearWorldPinSelection();
        }
    });
}

function hitTestWorldPin(clientX, clientY, canvas) {
    if (!canvas || !_worldViewMsg) { return null; }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    let best = null;
    let bestDist = WORLD_PIN_HIT_RADIUS_PX + 1;
    for (const pin of _worldPinCatalog.values()) {
        if (pin.fogVisibility !== 'discovered') { continue; }
        const px = (pin.leftPct / 100) * cssWidth;
        const py = (pin.topPct / 100) * cssHeight;
        const dist = Math.hypot(px - x, py - y);
        if (dist <= WORLD_PIN_HIT_RADIUS_PX && dist < bestDist) {
            bestDist = dist;
            best = pin.locationId;
        }
    }
    return best;
}

window.selectWorldLocationPin = selectWorldLocationPin;
window.clearWorldLocationPinSelection = clearWorldPinSelection;
window.hitTestWorldPin = hitTestWorldPin;

function getRegionFogVisibility(regionId, fog) {
    if (!fog || !regionId) { return 'discovered'; }
    const discovered = new Set(fog.discoveredRegionIds || []);
    const rumored = new Set(fog.rumoredRegionIds || []);
    if (discovered.has(regionId)) { return 'discovered'; }
    if (rumored.has(regionId)) { return 'rumored'; }
    return 'unknown';
}

function renderFogOverlays(container, msg) {
    if (!container) { return; }
    container.querySelectorAll('.world-fog-overlay').forEach((el) => el.remove());
    const layout = Array.isArray(msg.fogRegionLayout) ? msg.fogRegionLayout : [];
    const fog = msg.fog;
    if (!fog || layout.length === 0) { return; }

    for (const entry of layout) {
        const visibility = getRegionFogVisibility(entry.regionId, fog);
        if (visibility === 'discovered') { continue; }
        const el = document.createElement('div');
        el.className = `world-fog-overlay ${visibility === 'unknown' ? 'is-unknown' : 'is-rumored'}`;
        const diameter = Math.max(8, (entry.radiusPct || 7) * 2);
        el.style.left = `${entry.leftPct}%`;
        el.style.top = `${entry.topPct}%`;
        el.style.width = `${diameter}%`;
        el.style.height = `${diameter}%`;
        container.appendChild(el);
    }
}

function setWorldMapMode(mode, options = {}) {
    const persist = options.persist !== false;
    worldMapMode = (mode === 'parchment' || mode === 'tile') ? mode : 'mermaid';
    if (persist) {
        try { localStorage.setItem(WORLD_MAP_MODE_KEY, worldMapMode); } catch { /* ignore */ }
    }
    applyWorldMapModeVisibility();
}

function applyWorldMapModeVisibility() {
    const panels = {
        mermaid: document.getElementById('world-mermaid'),
        parchment: document.getElementById('world-cartography'),
        tile: document.getElementById('world-overmap'),
    };
    const buttons = {
        mermaid: document.getElementById('world-map-mode-mermaid'),
        parchment: document.getElementById('world-map-mode-parchment'),
        tile: document.getElementById('world-map-mode-tile'),
    };
    for (const mode of Object.keys(panels)) {
        if (panels[mode]) {
            panels[mode].classList.toggle('hidden', worldMapMode !== mode);
        }
        if (buttons[mode]) {
            buttons[mode].classList.toggle('is-active', worldMapMode === mode);
        }
    }
    if (worldMapMode === 'tile') {
        // The canvas has zero width while its panel is hidden — draw after unhide.
        requestAnimationFrame(() => drawTileOvermap());
    }
}

function renderCartographyMap(msg) {
    const stage = document.getElementById('world-cartography-stage');
    const img = document.getElementById('world-cartography-img');
    const pinsEl = document.getElementById('world-cartography-pins');
    const empty = document.getElementById('world-cartography-empty');
    if (!stage || !img || !pinsEl) { return; }

    const hasImage = Boolean(msg.cartographyImage);
    if (empty) {
        empty.classList.toggle('hidden', hasImage);
    }
    stage.style.display = hasImage ? '' : 'none';

    if (!hasImage) {
        img.removeAttribute('src');
        pinsEl.innerHTML = '';
        return;
    }

    img.src = msg.cartographyImage;
    img.alt = msg.worldName ? `${msg.worldName} map` : 'World map';

    pinsEl.innerHTML = '';
    renderFogOverlays(stage, msg);

    const labels = Array.isArray(msg.cartographyRegionLabels) ? msg.cartographyRegionLabels : [];
    for (const label of labels) {
        if (typeof label.leftPct !== 'number' || typeof label.topPct !== 'number') { continue; }
        const visibility = getRegionFogVisibility(label.regionId, msg.fog);
        if (visibility === 'unknown') { continue; }
        const el = document.createElement('span');
        el.className = 'world-map-region-label';
        if (visibility === 'rumored') { el.classList.add('is-rumored'); }
        el.style.left = `${label.leftPct}%`;
        el.style.top = `${label.topPct}%`;
        el.textContent = label.regionName || label.regionId || '';
        el.title = label.regionName || label.regionId || '';
        decorateRegionLabelEl(el, label, visibility);
        pinsEl.appendChild(el);
    }

    const pins = Array.isArray(msg.cartographyPins) ? msg.cartographyPins : [];
    for (const pin of pins) {
        if (typeof pin.leftPct !== 'number' || typeof pin.topPct !== 'number') { continue; }
        const visibility = getRegionFogVisibility(pin.regionId, msg.fog);
        if (visibility === 'unknown') { continue; }
        const pinMeta = findWorldPinMeta(pin.locationId);
        const wrap = document.createElement('span');
        wrap.className = 'world-map-pin-wrap';
        wrap.style.left = `${pin.leftPct}%`;
        wrap.style.top = `${pin.topPct}%`;
        if (_selectedPinId && pin.locationId === _selectedPinId) {
            wrap.classList.add('is-selected');
        }

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'world-map-pin';
        el.style.left = '';
        el.style.top = '';
        el.style.position = 'relative';
        el.style.transform = 'none';
        if (pin.locationId && pin.locationId === msg.currentLocationId) {
            el.classList.add('is-current');
        }
        if (visibility === 'rumored') {
            el.classList.add('is-rumored');
        }
        const pinLabel = visibility === 'rumored' ? '?' : (pin.locationName || pin.locationId || '');
        el.title = visibility === 'rumored' ? T('webview.world.pinRumoredTooltip') : (pin.locationName || pin.locationId || '');
        el.textContent = visibility === 'rumored' ? '?' : (pin.locationId === msg.currentLocationId ? '@' : '📍');
        el.setAttribute('aria-label', pinLabel || 'Location');
        if (_selectedPinId && pin.locationId === _selectedPinId) {
            el.classList.add('is-selected');
        }
        if (pinMeta) {
            applyDangerClassesToPin(el, pinMeta);
            appendMapEventBadge(wrap, pinMeta);
        }
        wireParchmentWorldPin(el, pin, msg);
        wrap.appendChild(el);
        pinsEl.appendChild(wrap);
    }
}

function renderMermaidMap(mmdCode, msg) {
    const container = document.getElementById('world-mermaid');
    if (!container || !mmdCode) { return; }

    container.removeAttribute('data-processed');
    container.innerHTML = escapeHtml(mmdCode);

    if (window.mermaid) {
        window.mermaid.run({ nodes: [container] })
            .then(() => {
                resetMapPanState();
                initMapPanZoomOnce(container);
                applyMapTransform(container);
                addMapPanZoomHint(container);
                initMermaidPinClicks(container);
                renderWorldLocationDetailPanel();
            })
            .catch((e) => {
                console.error('World map Mermaid render error:', e);
                container.textContent = mmdCode;
            });
    }
}

// ---------------------------------------------------------------------------
// World Map Pan & Zoom (フルスクラッチ軽量実装 / npm モジュール不使用)
// ---------------------------------------------------------------------------

let _mapPanZoomReady = false;
let _mapPanState = { scale: 1, tx: 0, ty: 0 };

function ensureMapPanZoomStyles() {
    if (document.getElementById('world-map-panzoom-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-map-panzoom-styles';
    style.textContent = `
        #world-mermaid {
            overflow: hidden !important;
            min-height: 300px;
            max-height: 65vh;
            position: relative;
            cursor: grab;
            user-select: none;
            -webkit-user-select: none;
            border-radius: 4px;
            background: rgba(0,0,0,0.1);
        }
        #world-mermaid.world-map-panning { cursor: grabbing !important; }
        #world-mermaid > svg {
            display: block;
            transform-origin: 0 0;
        }
        .world-map-hint {
            position: absolute;
            bottom: 5px;
            right: 8px;
            font-size: 0.65em;
            opacity: 0.38;
            pointer-events: none;
            color: var(--vscode-foreground, #ccc);
            font-family: var(--vscode-font-family, sans-serif);
        }
    `;
    document.head.appendChild(style);
}

function resetMapPanState() {
    _mapPanState = { scale: 1, tx: 0, ty: 0 };
}

function applyMapTransform(viewport) {
    const svg = viewport.querySelector('svg');
    if (!svg) { return; }
    const { scale, tx, ty } = _mapPanState;
    svg.style.transform = `matrix(${scale},0,0,${scale},${tx},${ty})`;
    svg.style.transformOrigin = '0 0';
}

function addMapPanZoomHint(viewport) {
    // innerHTML replacement cleared the old hint — always re-add after render
    let hint = viewport.querySelector('.world-map-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'world-map-hint';
        hint.textContent = T('webview.world.mapPanHint');
        viewport.appendChild(hint);
    }
}

function initMapPanZoomOnce(viewport) {
    ensureMapPanZoomStyles();
    if (_mapPanZoomReady) { return; }
    _mapPanZoomReady = true;

    let dragging = false;
    let startX = 0, startY = 0, startTx = 0, startTy = 0;

    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) { return; }
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startTx = _mapPanState.tx;
        startTy = _mapPanState.ty;
        viewport.classList.add('world-map-panning');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) { return; }
        _mapPanState.tx = startTx + (e.clientX - startX);
        _mapPanState.ty = startTy + (e.clientY - startY);
        applyMapTransform(viewport);
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            viewport.classList.remove('world-map-panning');
        }
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.max(0.15, Math.min(5, _mapPanState.scale * factor));
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        _mapPanState.tx = mx - (mx - _mapPanState.tx) * (next / _mapPanState.scale);
        _mapPanState.ty = my - (my - _mapPanState.ty) * (next / _mapPanState.scale);
        _mapPanState.scale = next;
        applyMapTransform(viewport);
    }, { passive: false });

    viewport.addEventListener('dblclick', () => {
        resetMapPanState();
        applyMapTransform(viewport);
    });
}

// ---------------------------------------------------------------------------
// ロケーション画像履歴
// ---------------------------------------------------------------------------

function renderLocationImages(images, currentLocationId) {
    const SECTION_ID = 'world-location-images';
    let section = document.getElementById(SECTION_ID);
    if (!section) {
        const mermaidEl = document.getElementById('world-mermaid');
        if (!mermaidEl) { return; }
        section = document.createElement('div');
        section.id = SECTION_ID;
        mermaidEl.parentNode.insertBefore(section, mermaidEl.nextSibling);
    }

    if (!currentLocationId || images.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'world-section-heading';
    heading.textContent = T('webview.world.sceneHistoryHeader');
    section.appendChild(heading);

    const strip = document.createElement('div');
    strip.className = 'world-image-strip';

    for (const img of images) {
        if (!img.src) { continue; }
        const wrap = document.createElement('div');
        wrap.className = 'world-image-thumb-wrap';

        const el = document.createElement('img');
        el.className = 'world-image-thumb';
        el.src = img.src;
        if (img.description) { el.title = img.description; }
        wrap.appendChild(el);

        if (img.worldTurn !== undefined) {
            const badge = document.createElement('span');
            badge.className = 'world-image-turn-badge';
            badge.textContent = 'T' + img.worldTurn;
            wrap.appendChild(badge);
        }

        strip.appendChild(wrap);
    }

    section.appendChild(strip);
}

// ---------------------------------------------------------------------------
// 現在地のNPCパネル
// ---------------------------------------------------------------------------

function renderNpcsAtLocation(npcs, currentLocationId) {
    const SECTION_ID = 'world-npcs-section';
    let section = document.getElementById(SECTION_ID);
    if (!section) {
        const imageSection = document.getElementById('world-location-images');
        const anchor = imageSection || document.getElementById('world-mermaid');
        if (!anchor) { return; }
        section = document.createElement('div');
        section.id = SECTION_ID;
        anchor.parentNode.insertBefore(section, anchor.nextSibling);
    }

    if (!currentLocationId || npcs.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'world-section-heading';
    heading.textContent = T('webview.world.npcsHereHeader');
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'world-npc-grid';

    for (const npc of npcs) {
        const card = document.createElement('div');
        card.className = 'world-npc-card';

        // Portrait or placeholder
        const portrait = document.createElement('div');
        portrait.className = 'world-npc-portrait';
        if (npc.portraitUri) {
            const img = document.createElement('img');
            img.src = npc.portraitUri;
            img.alt = npc.name;
            portrait.appendChild(img);
        } else {
            portrait.textContent = '👤';
            portrait.classList.add('placeholder');
        }
        card.appendChild(portrait);

        // Info column
        const info = document.createElement('div');
        info.className = 'world-npc-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'world-npc-name';
        nameEl.textContent = npc.name;
        info.appendChild(nameEl);

        const moodEl = document.createElement('div');
        moodEl.className = 'world-npc-mood';
        moodEl.textContent = npc.mood;
        info.appendChild(moodEl);

        if (npc.urgentNeedCount > 0) {
            const needEl = document.createElement('div');
            needEl.className = 'world-npc-needs';
            needEl.textContent = `⚠ ${npc.urgentNeedCount} urgent`;
            info.appendChild(needEl);
        }

        // "Set Portrait" — picks image via extension QuickPick
        const setBtn = document.createElement('button');
        setBtn.className = 'world-npc-portrait-btn';
        setBtn.textContent = npc.hasPortrait ? '🖼 Change' : '🖼 Set Portrait';
        setBtn.title = 'Choose a gallery image to use as this NPC\'s portrait';
        setBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'requestNpcPortraitLink', npcId: npc.id });
        });
        info.appendChild(setBtn);

        if (npc.hasVoice && npc.voice) {
            if (npc.voiceLabel) {
                const voiceLabelEl = document.createElement('div');
                voiceLabelEl.className = 'world-npc-voice-label';
                voiceLabelEl.textContent = npc.voiceLabel;
                info.appendChild(voiceLabelEl);
            }
            const previewBtn = document.createElement('button');
            previewBtn.className = 'world-npc-voice-btn';
            previewBtn.textContent = T('webview.world.npcVoicePreviewBtn') || '🔊 Preview';
            previewBtn.title = T('webview.world.npcVoicePreviewTitle') ||
                "Speak a short sample using this NPC's voice";
            previewBtn.addEventListener('click', () => previewNpcVoice(npc));
            info.appendChild(previewBtn);
        }

        card.appendChild(info);
        grid.appendChild(card);
    }

    section.appendChild(grid);
}

// ---------------------------------------------------------------------------
// グローバルイベント
// ---------------------------------------------------------------------------

function renderGlobalEvents(events, simEnabled) {
    // コンテナが無ければ生成
    let section = document.getElementById('world-events-section');
    if (!section) {
        const list = document.getElementById('world-factions-list');
        if (!list) { return; }
        section = document.createElement('div');
        section.id = 'world-events-section';
        section.style.cssText = 'margin-bottom:0.6rem;';
        list.parentNode.insertBefore(section, list);
    }

    if (!simEnabled || events.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;opacity:0.6;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;';
    heading.textContent = T('webview.world.activeEventsHeader');
    section.appendChild(heading);

    for (const ev of events) {
        const badge = document.createElement('div');
        const color = SEVERITY_COLOR[ev.severity] || SEVERITY_COLOR.minor;
        badge.style.cssText = `
            border-left: 3px solid ${color};
            padding: 0.3rem 0.5rem;
            margin-bottom: 0.3rem;
            background: rgba(0,0,0,0.2);
            border-radius: 2px;
            font-size: 0.82em;
        `;
        const remaining = ev.turnsRemaining !== undefined ? ` (${ev.turnsRemaining} turns)` : '';
        badge.innerHTML = `<span style="opacity:0.6;font-size:0.85em;">[${escapeHtml(ev.severity)}]</span> ${escapeHtml(ev.description)}<span style="opacity:0.5;">${escapeHtml(remaining)}</span>`;
        section.appendChild(badge);
    }
}

// ---------------------------------------------------------------------------
// Living World — Recent Events (recentChanges)
// ---------------------------------------------------------------------------

const CHANGE_CATEGORY_ICON = {
    faction: '⚔️',
    region: '🗺️',
    resource: '📦',
    npc: '👤',
    global: '🌐',
};

const CHANGE_SEVERITY_COLOR = {
    info: 'var(--vscode-charts-blue, #4080c0)',
    warning: 'var(--vscode-charts-yellow, #c0a040)',
    critical: '#c04040',
};

function renderRecentChanges(events, simEnabled) {
    let section = document.getElementById('world-recent-changes-section');
    if (!section) {
        const eventsSection = document.getElementById('world-events-section');
        if (!eventsSection) { return; }
        section = document.createElement('div');
        section.id = 'world-recent-changes-section';
        section.style.cssText = 'margin-bottom:0.6rem;';
        eventsSection.parentNode.insertBefore(section, eventsSection.nextSibling);
    }

    const visible = simEnabled && events.length > 0;
    section.style.display = visible ? '' : 'none';
    if (!visible) { return; }

    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;opacity:0.6;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;';
    heading.textContent = T('webview.world.recentChangesHeader');
    section.appendChild(heading);

    // Show newest first, up to 5 entries
    const shown = events.slice(-5).reverse();
    for (const ev of shown) {
        const badge = document.createElement('div');
        const color = CHANGE_SEVERITY_COLOR[ev.severity] || CHANGE_SEVERITY_COLOR.info;
        const icon = CHANGE_CATEGORY_ICON[ev.category] || '📌';
        badge.style.cssText = `
            border-left: 3px solid ${color};
            padding: 0.3rem 0.5rem;
            margin-bottom: 0.25rem;
            background: rgba(0,0,0,0.2);
            border-radius: 2px;
            font-size: 0.8em;
            display: flex;
            align-items: flex-start;
            gap: 0.4rem;
        `;

        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'flex-shrink:0;';
        iconSpan.textContent = icon;
        badge.appendChild(iconSpan);

        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'flex:1;min-width:0;';
        const msgSpan = document.createElement('span');
        msgSpan.textContent = ev.message;
        textDiv.appendChild(msgSpan);

        if (ev.mapHighlight) {
            const flameSpan = document.createElement('span');
            flameSpan.style.cssText = 'margin-left:0.3rem;opacity:0.8;';
            flameSpan.textContent = '🔥';
            textDiv.appendChild(flameSpan);
        }

        const turnSpan = document.createElement('div');
        turnSpan.style.cssText = 'opacity:0.45;font-size:0.85em;margin-top:0.1rem;';
        turnSpan.textContent = `T${ev.worldTurn}`;
        textDiv.appendChild(turnSpan);

        badge.appendChild(textDiv);
        section.appendChild(badge);
    }
}

// ---------------------------------------------------------------------------
// 派閥カード
// ---------------------------------------------------------------------------

function renderFactions(factions, factionStates) {
    const list = document.getElementById('world-factions-list');
    if (!list) { return; }

    if (factions.length === 0) {
        list.innerHTML = `<p class="empty-text" style="margin:0;">${T('webview.world.factionsEmpty')}</p>`;
        return;
    }

    list.innerHTML = '';
    for (const faction of factions) {
        const icon = FACTION_TYPE_ICON[faction.type] || '❓';
        const bgColor = FACTION_TYPE_COLOR[faction.type] || '#333';
        const liveState = factionStates ? factionStates[faction.id] : null;

        const card = document.createElement('div');
        card.className = 'inspector-item';
        card.style.cssText = `
            background: ${bgColor};
            border-radius: 4px;
            padding: 0.5rem 0.7rem;
            margin-bottom: 0.4rem;
            border-left: 3px solid var(--vscode-focusBorder);
        `;

        // ヘッダー行（名前 + パワー）
        const livePower = liveState ? Math.round(liveState.power) : faction.power;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = `
            <strong>${icon} ${escapeHtml(faction.name)}</strong>
            ${livePower !== undefined
                ? `<span style="font-size:0.8em;opacity:0.8;">⚡${livePower}</span>`
                : ''}
        `;
        card.appendChild(header);

        // ライブシムデータがあればバー表示
        if (liveState) {
            card.appendChild(buildSimBars(liveState));
        }

        // 静的説明文
        if (faction.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:0.82em;opacity:0.75;margin-top:0.25rem;';
            desc.textContent = faction.description;
            card.appendChild(desc);
        }

        // ゴール・敵対・同盟タグ
        const tags = [];
        if (faction.goals && faction.goals.length > 0) {
            tags.push(`🎯 ${faction.goals.slice(0, 2).join(' / ')}`);
        }
        if (faction.enemies && faction.enemies.length > 0) {
            tags.push(`⚔️ Enemy of: ${faction.enemies.slice(0, 2).join(', ')}`);
        }
        if (faction.allies && faction.allies.length > 0) {
            tags.push(`🤝 Ally of: ${faction.allies.slice(0, 2).join(', ')}`);
        }
        if (tags.length > 0) {
            const tagDiv = document.createElement('div');
            tagDiv.style.cssText = 'font-size:0.78em;opacity:0.7;margin-top:0.3rem;';
            tagDiv.textContent = tags.join(' · ');
            card.appendChild(tagDiv);
        }

        // 最近のシムイベント
        if (liveState && liveState.recentEvents && liveState.recentEvents.length > 0) {
            const evDiv = document.createElement('div');
            evDiv.style.cssText = 'font-size:0.76em;opacity:0.6;margin-top:0.25rem;font-style:italic;';
            evDiv.textContent = liveState.recentEvents.join(' / ');
            card.appendChild(evDiv);
        }

        list.appendChild(card);
    }
}

function buildSimBars(liveState) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:0.35rem;display:flex;flex-direction:column;gap:0.15rem;';

    // パワーバー
    wrapper.appendChild(buildBar(T('webview.world.simPower'), liveState.power, 100, 'var(--vscode-charts-red, #c04040)'));

    // モラルバー（ある場合のみ）
    if (liveState.morale !== undefined) {
        wrapper.appendChild(buildBar(T('webview.world.simMorale'), liveState.morale, 100, 'var(--vscode-charts-blue, #4080c0)'));
    }

    return wrapper;
}

function buildBar(label, value, max, fillColor) {
    const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.3rem;';

    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:0.72em;opacity:0.6;width:3.2rem;flex-shrink:0;';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const track = document.createElement('div');
    track.style.cssText = 'flex:1;background:rgba(255,255,255,0.1);border-radius:2px;height:5px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = `width:${pct}%;height:100%;background:${fillColor};border-radius:2px;transition:width 0.4s;`;
    track.appendChild(fill);
    row.appendChild(track);

    const valEl = document.createElement('span');
    valEl.style.cssText = 'font-size:0.72em;opacity:0.7;width:2rem;text-align:right;flex-shrink:0;';
    valEl.textContent = String(Math.round(value));
    row.appendChild(valEl);

    return row;
}

// ---------------------------------------------------------------------------
// World Forge Generator UI
// ---------------------------------------------------------------------------

function buildWorldGenForm() {
    const empty = document.getElementById('world-empty');
    if (!empty) { return; }

    // Inject styles
    const styleId = 'world-gen-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .world-gen-card {
                padding: 1.5rem;
                margin: 1.5rem auto;
                max-width: 420px;
                background: linear-gradient(145deg, rgba(30,30,35,0.8), rgba(20,20,25,0.95));
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
                backdrop-filter: blur(10px);
                font-family: var(--vscode-font-family), sans-serif;
            }
            .world-gen-title {
                font-size: 1.25em;
                font-weight: 600;
                color: #f0f0f0;
                margin-bottom: 0.4rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .world-gen-desc {
                font-size: 0.85em;
                color: #a0a0a8;
                line-height: 1.5;
                margin-bottom: 1.2rem;
                padding-bottom: 0.8rem;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .world-gen-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.8rem;
            }
            .world-gen-label {
                font-size: 0.88em;
                color: #d0d0d0;
                font-weight: 500;
                flex: 1;
            }
            .world-gen-input {
                background: rgba(0,0,0,0.4);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                padding: 0.45rem 0.6rem;
                font-size: 0.85em;
                transition: all 0.2s ease;
                width: 55%;
                box-sizing: border-box;
            }
            .world-gen-input:focus {
                outline: none;
                border-color: #4a90e2;
                box-shadow: 0 0 0 2px rgba(74,144,226,0.25);
                background: rgba(0,0,0,0.6);
            }
            .world-gen-input[type="number"] {
                width: 4.5rem;
                text-align: center;
            }
            .world-gen-btn {
                width: 100%;
                margin-top: 1.2rem;
                padding: 0.7rem;
                background: linear-gradient(180deg, #4a90e2 0%, #357abd 100%);
                color: #fff;
                border: 1px solid #2a649d;
                border-radius: 6px;
                font-weight: 600;
                font-size: 0.95em;
                cursor: pointer;
                transition: all 0.2s ease;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.4rem;
            }
            .world-gen-btn:hover:not(:disabled) {
                background: linear-gradient(180deg, #5b9ce6 0%, #4085c7 100%);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
                transform: translateY(-1px);
            }
            .world-gen-btn:active:not(:disabled) {
                transform: translateY(1px);
                box-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }
            .world-gen-btn:disabled {
                background: #3a3a40;
                color: #6a6a70;
                border-color: #2a2a30;
                cursor: not-allowed;
                box-shadow: none;
                text-shadow: none;
            }
            .world-gen-btn.generating {
                background: linear-gradient(180deg, #b06520 0%, #8c4c13 100%);
                border-color: #633308;
                color: #f0f0f0;
            }
            .world-gen-btn.failed {
                background: linear-gradient(180deg, #c04040 0%, #802020 100%);
                border-color: #501010;
            }
        `;
        document.head.appendChild(style);
    }

    empty.innerHTML = '';
    
    const card = document.createElement('div');
    card.className = 'world-gen-card';
    empty.appendChild(card);

    const title = document.createElement('div');
    title.className = 'world-gen-title';
    title.innerHTML = T('webview.world.forgeTitle');
    card.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'world-gen-desc';
    desc.textContent = T('webview.world.forgeDesc');
    card.appendChild(desc);

    // Rows
    card.appendChild(makeFormRow(T('webview.world.forgeSeed'), makeTextInput('world-gen-seed', 'e.g. lost-catacombs')));

    const themeSelect = document.createElement('select');
    themeSelect.id = 'world-gen-theme';
    themeSelect.className = 'world-gen-input';
    for (const t of ['dungeon-crawler', 'dark-fantasy', 'cyberpunk', 'post-apocalyptic', 'zombie-apocalypse', 'scifi', 'steampunk', 'cosmic-horror', 'oriental-fantasy', 'default']) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ');
        themeSelect.appendChild(opt);
    }
    card.appendChild(makeFormRow(T('webview.world.forgeTheme'), themeSelect));

    card.appendChild(makeFormRow(T('webview.world.forgeRegions'), makeNumberInput('world-gen-regions', 3, 12, 5)));
    card.appendChild(makeFormRow(T('webview.world.forgeFactions'), makeNumberInput('world-gen-factions', 2, 6, 3)));
    card.appendChild(makeFormRow(T('webview.world.forgeNpcs'), makeNumberInput('world-gen-npcs', 2, 20, 6)));

    // Generate button
    const btn = document.createElement('button');
    btn.id = 'world-gen-btn';
    btn.className = 'world-gen-btn';
    btn.innerHTML = `<span>${T('webview.world.forgeBtn')}</span>`;
    btn.addEventListener('click', () => {
        const rawSeed = document.getElementById('world-gen-seed')?.value?.trim() || '';
        const seed = rawSeed.slice(0, 64);
        if (!seed || !/^[a-zA-Z0-9_-]+$/.test(seed)) {
            document.getElementById('world-gen-seed')?.focus();
            return;
        }
        const theme = document.getElementById('world-gen-theme')?.value || 'default';
        const regionCount = Math.max(3, Math.min(12, parseInt(document.getElementById('world-gen-regions')?.value || '5', 10) || 5));
        const factionCount = Math.max(2, Math.min(6, parseInt(document.getElementById('world-gen-factions')?.value || '3', 10) || 3));
        const npcCount = Math.max(2, Math.min(20, parseInt(document.getElementById('world-gen-npcs')?.value || '6', 10) || 6));
        vscode.postMessage({ type: 'generateWorldForge', seed, theme, regionCount, factionCount, npcCount });
    });
    card.appendChild(btn);
}

function makeFormRow(label, input) {
    const row = document.createElement('div');
    row.className = 'world-gen-row';
    const lbl = document.createElement('label');
    lbl.className = 'world-gen-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
}

function makeTextInput(id, placeholder) {
    const el = document.createElement('input');
    el.id = id;
    el.type = 'text';
    el.placeholder = placeholder;
    el.className = 'world-gen-input';
    return el;
}

function makeNumberInput(id, min, max, defaultVal) {
    const el = document.createElement('input');
    el.id = id;
    el.type = 'number';
    el.min = String(min);
    el.max = String(max);
    el.value = String(defaultVal);
    el.className = 'world-gen-input';
    return el;
}

function setWorldGenBusy(busy) {
    const btn = document.getElementById('world-gen-btn');
    if (!btn) { return; }
    btn.disabled = busy;
    if (busy) {
        btn.classList.add('generating');
        btn.classList.remove('failed');
        btn.innerHTML = `<span>${T('webview.world.worldGenBusy')}</span>`;
    } else {
        btn.classList.remove('generating');
        btn.innerHTML = `<span>${T('webview.world.forgeBtn')}</span>`;
    }
}

function setWorldMapGenBusy(busy, failed = false) {
    const btn = document.getElementById('world-gen-map-btn');
    if (!btn) { return; }
    btn.disabled = busy;
    btn.classList.toggle('generating', busy);
    if (busy) {
        btn.textContent = T('webview.world.mapGenerating');
    } else if (failed) {
        btn.textContent = T('webview.world.mapFailed');
    } else {
        btn.textContent = T('webview.world.mapImage');
    }
}

function setWorldSceneImageBusy(busy, failed = false) {
    const btn = document.getElementById('world-gen-image-btn');
    if (!btn) { return; }
    if (!busy) {
        worldSceneImagePending = false;
    }
    btn.disabled = busy;
    if (busy) {
        btn.innerHTML = `<span>${T('webview.world.worldGenBusy')}</span>`;
    } else if (failed) {
        btn.innerHTML = `<span>${T('webview.world.sceneImageFailed')}</span>`;
    } else {
        btn.innerHTML = T('webview.world.sceneImageBtn');
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderQuestHooks(quests) {
    const listEl = document.getElementById('world-quests-list');
    if (!listEl) return;

    if (!quests || quests.length === 0) {
        listEl.innerHTML = '<p class="empty-text">' + escapeHtml(T('webview.world.questEmpty')) + '</p>';
        return;
    }

    listEl.innerHTML = '';
    quests.forEach(q => {
        const item = document.createElement('div');
        item.className = 'quest-item status-' + escapeHtml(q.status);
        const sourceLabel = q.source === 'npc'
            ? T('webview.world.questSourceNpc')
            : T('webview.world.questSourceEvent');
        
        let actionsHtml = '';
        if (q.status === 'available') {
            actionsHtml = '<button type="button" class="small-btn primary quest-accept-btn">' + escapeHtml(T('webview.world.questAccept')) + '</button>';
        } else if (q.status === 'active') {
            actionsHtml = `<span style="font-size:11px; color:var(--vscode-charts-orange); font-weight:600;">${escapeHtml(T('webview.world.questActive'))}</span>`;
        }

        const rewardHtml = q.reward
            ? `<div class="quest-reward">${escapeHtml(T('webview.world.questReward'))}: ${escapeHtml(q.reward)}</div>`
            : '';

        item.innerHTML = `
            <div class="quest-header">
                <span class="quest-title">${escapeHtml(q.title)}</span>
                <span class="quest-badge" style="border: 1px solid rgba(255,255,255,0.2)">${escapeHtml(sourceLabel)}</span>
            </div>
            <div class="quest-desc">${escapeHtml(q.description)}</div>
            ${rewardHtml}
            <div class="quest-actions">
                ${actionsHtml}
            </div>
        `;
        const acceptBtn = item.querySelector('.quest-accept-btn');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'acceptQuest', questId: q.id });
            });
        }
        listEl.appendChild(item);
    });
}
