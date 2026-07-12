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

/** Mirrors LOCATION_TYPE_ICON in src/worldMapGenerator.ts so Mermaid and Parchment modes agree visually. */
const LOCATION_TYPE_ICON = {
    settlement: '🏘️',
    dungeon: '🕳️',
    landmark: '🗿',
    ruins: '🏚️',
    wilderness: '🌲',
    other: '📍'
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
        if (msg.type === 'livingWorldDirectTradeResult') {
            if (msg.ok) {
                const parts = [];
                if (msg.trade?.totalCost > 0) {
                    parts.push(`${T('webview.world.tradeCost')}: ${msg.trade.totalCost}`);
                }
                if (msg.trade?.totalRevenue > 0) {
                    parts.push(`${T('webview.world.tradeRevenue')}: ${msg.trade.totalRevenue}`);
                }
                setCommerceTradeToast(
                    parts.length > 0 ? parts.join(' · ') : T('webview.world.tradeOk'),
                    'ok'
                );
            } else {
                setCommerceTradeToast(
                    msg.message || msg.reason || T('webview.world.tradeFailed'),
                    'error'
                );
            }
        }
        if (msg.type === 'shopkeeperDirectTradeResult') {
            finishShopkeeperTrade(msg);
        }
        if (msg.type === 'marketTravelPreviewResult') {
            finishMarketTravelPreview(msg);
        }
        if (msg.type === 'marketTravelResult') {
            finishMarketTravel(msg);
        }
        if (msg.type === 'endDayPreviewResult') {
            finishEndDayPreview(msg);
        }
        if (msg.type === 'endDayResult') {
            finishEndDay(msg);
        }
        if (msg.type === 'livingWorldSetPlayerRoleResult') {
            if (!msg.ok) {
                setCommerceTradeToast(msg.reason || T('webview.world.roleFailed'), 'error');
            }
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
    const modeSettlement = document.getElementById('world-map-mode-settlement');
    const modeDiorama = document.getElementById('world-map-mode-diorama');
    if (modeMermaid) {
        modeMermaid.addEventListener('click', () => setWorldMapMode('mermaid'));
    }
    if (modeParchment) {
        modeParchment.addEventListener('click', () => setWorldMapMode('parchment'));
    }
    if (modeTile) {
        modeTile.addEventListener('click', () => setWorldMapMode('tile'));
    }
    if (modeSettlement) {
        modeSettlement.addEventListener('click', () => setWorldMapMode('settlement'));
    }
    if (modeDiorama) {
        modeDiorama.addEventListener('click', () => setWorldMapMode('diorama'));
    }

    try {
        const saved = localStorage.getItem(WORLD_MAP_MODE_KEY);
        if (saved === 'mermaid' || saved === 'parchment' || saved === 'tile' || saved === 'settlement' || saved === 'diorama') {
            worldMapMode = saved;
        }
    } catch { /* private mode */ }

    ensureCartographyStyles();
    ensureDomainStyles();
    ensureGuildStyles();
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
    _settlementWorldMsg = msg;
    syncSettlementMapModeUi(msg);
    _dioramaWorldMsg = msg;
    syncDioramaMapModeUi(msg);
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

    // Player commerce (credits / food / cargo / role)
    renderPlayerCommerce(
        msg.playerCommerce || null,
        msg.enableCommerce === true,
        msg.enableCommerceUi === true,
        msg.playerRoles || [],
        msg.currentLocationId
    );

    // Domain Mode (D3): lordship stats, audience, rivals, missions, battle
    renderDomainPanel(msg);

    // Guild Master (G1): quest board stats and roster
    renderGuildPanel(msg);

    // Campaign Kit: discoveries + hub job/rumor board
    renderCampaignKitPanel(msg);

    // Living World market prices (+ direct trade when UI enabled)
    renderLivingWorldMarkets(
        msg.livingWorldMarkets || [],
        msg.livingWorldDecisionSurface || null,
        msg.enableCommerce === true,
        msg.enableCommerceUi === true,
        msg.currentLocationId
    );

    // Living World NPC whereabouts
    renderNpcWhereabouts(msg.npcWhereabouts || null);

    // LW3: NPC-to-NPC bonds + LW3-P: player bonds
    renderNpcBonds(msg.npcBonds || null, msg.playerBonds || null);

    // Quest Board
    renderQuestHooks(msg.questHooks || []);

    // 派閥カード
    renderFactions(msg.factions || [], msg.factionStates || null, msg.enableFactionReputation === true);

    renderWorldMapItems(msg.mapItems || []);
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
        .world-map-items-section { margin-top: 0.65rem; font-size: 0.9em; }
        .world-map-items-section.hidden { display: none !important; }
        #world-commerce-details.hidden { display: none !important; }
        #world-markets-details.hidden { display: none !important; }
        #world-npc-whereabouts-details.hidden { display: none !important; }
        .world-commerce-row {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.28rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            font-size: 0.9em;
        }
        .world-commerce-row:last-child { border-bottom: none; }
        .world-npc-reason {
            grid-column: 1 / -1;
            font-size: 0.8em;
            opacity: 0.72;
            margin-top: 0.15rem;
        }
        .world-market-card {
            margin: 0.45rem 0;
            padding: 0.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 6px;
            background: rgba(255,255,255,0.025);
        }
        .world-market-title {
            font-weight: 600;
            margin-bottom: 0.35rem;
        }
        .world-market-row {
            display: grid;
            grid-template-columns: minmax(7rem, 1fr) auto auto auto;
            gap: 0.45rem;
            align-items: center;
            padding: 0.22rem 0;
            border-top: 1px solid rgba(255,255,255,0.05);
            font-size: 0.86em;
        }
        .world-market-row:first-of-type { border-top: none; }
        .world-market-num {
            font-variant-numeric: tabular-nums;
            text-align: right;
            opacity: 0.85;
        }
        .world-market-row.has-decision-surface {
            align-items: start;
        }
        .world-market-decision {
            grid-column: 1 / -1;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.35rem;
            margin-top: 0.28rem;
            padding-top: 0.32rem;
            border-top: 1px dashed rgba(255,255,255,0.08);
            font-size: 0.82em;
        }
        .world-market-pressure,
        .world-market-evidence {
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 999px;
            padding: 0.08rem 0.42rem;
            background: rgba(255,255,255,0.04);
        }
        .world-market-route,
        .world-market-local {
            opacity: 0.78;
        }
        .world-market-trade {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.35rem;
            margin-top: 0.35rem;
            padding-top: 0.35rem;
            border-top: 1px dashed rgba(255,255,255,0.08);
        }
        .world-market-trade input[type="number"] {
            width: 3.2rem;
            font-size: 0.85em;
            padding: 0.15rem 0.3rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
        }
        .world-market-trade-btn {
            font-size: 0.78em;
            padding: 0.18rem 0.5rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.25);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .world-market-trade-btn:hover:not(:disabled) {
            border-color: var(--vscode-focusBorder, #4a90e2);
        }
        .world-market-trade-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
        .world-commerce-role-select {
            font-size: 0.9em;
            padding: 0.15rem 0.35rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
            max-width: 12rem;
        }
        .world-commerce-trade-toast {
            font-size: 0.82em;
            margin-top: 0.35rem;
            opacity: 0.85;
        }
        .world-commerce-trade-toast.is-error {
            color: var(--vscode-errorForeground, #f48771);
        }
        .world-commerce-trade-toast.is-ok {
            color: var(--vscode-charts-green, #89d185);
        }
        .world-npc-whereabouts-row {
            display: grid;
            grid-template-columns: minmax(7rem, 1fr) minmax(7rem, 1fr) auto;
            gap: 0.45rem;
            align-items: center;
            padding: 0.35rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            font-size: 0.88em;
        }
        .world-npc-whereabouts-row:last-child { border-bottom: none; }
        .world-npc-transit {
            color: var(--vscode-charts-yellow, #c0a040);
            font-size: 0.84em;
            white-space: nowrap;
        }
        .world-map-item-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding: 0.35rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .world-map-item-label { flex: 1; min-width: 0; }
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
        #world-overmap {
            position: relative;
        }
        #world-overmap-canvas.world-pin-cursor {
            cursor: crosshair;
        }
        .world-map-overlay-tooltip {
            position: absolute;
            z-index: 8;
            max-width: min(240px, 90%);
            padding: 0.3rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(8, 12, 20, 0.92);
            color: var(--vscode-foreground, #dde4ec);
            font-size: 0.78em;
            line-height: 1.35;
            pointer-events: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        }
        .world-map-overlay-tooltip.hidden { display: none !important; }
        .world-map-overlay-legend {
            position: absolute;
            left: 6px;
            bottom: 6px;
            z-index: 7;
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            max-width: calc(100% - 12px);
            padding: 0.28rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(8, 12, 20, 0.72);
            font-size: 0.74em;
            line-height: 1.3;
            pointer-events: none;
        }
        .world-map-overlay-legend.hidden { display: none !important; }
        .world-map-overlay-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 0.28em;
            color: var(--vscode-foreground, #cdd6e0);
            white-space: nowrap;
        }
        .world-map-overlay-legend-glyph {
            font-weight: 700;
            font-family: "Courier New", monospace;
        }
        .world-map-overlay-legend-hint {
            opacity: 0.75;
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
        .world-cartography-routes {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 2;
            pointer-events: none;
        }
        .world-cartography-route-line {
            stroke: rgba(245, 226, 176, 0.55);
            stroke-width: 0.35;
            stroke-dasharray: 1.4 1.1;
            vector-effect: non-scaling-stroke;
        }
        #world-cartography-legend {
            position: absolute;
            left: 6px;
            bottom: 6px;
            z-index: 7;
        }
    `;
    document.head.appendChild(style);
}

function ensureDomainStyles() {
    if (document.getElementById('world-domain-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-domain-styles';
    style.textContent = `
        .domain-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .domain-header-title { font-weight: 600; font-size: 1.02em; }
        .domain-rank-badge {
            font-size: 0.72em;
            padding: 0.08rem 0.4rem;
            border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.18);
            opacity: 0.85;
            margin-left: 0.3rem;
        }
        .domain-header-date { font-size: 0.85em; opacity: 0.65; }
        .domain-resource-row { display: flex; gap: 1rem; margin-bottom: 0.6rem; }
        .domain-resource { display: flex; align-items: center; gap: 0.3rem; font-size: 0.95em; }
        .domain-resource-icon { font-size: 1.05em; }
        .domain-stats-grid { margin-bottom: 0.6rem; }
        .domain-stat-row {
            display: grid;
            grid-template-columns: minmax(6rem, 8rem) 1fr 2.4rem;
            align-items: center;
            gap: 0.5rem;
            padding: 0.14rem 0;
            font-size: 0.85em;
        }
        .domain-stat-label { opacity: 0.8; }
        .domain-stat-bar {
            height: 0.45rem;
            border-radius: 3px;
            background: rgba(255,255,255,0.08);
            overflow: hidden;
        }
        .domain-stat-fill {
            height: 100%;
            background: var(--vscode-charts-blue, #4a90e2);
            border-radius: 3px;
        }
        .domain-stat-value { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
        .domain-actions-left { font-size: 0.8em; opacity: 0.6; margin-top: 0.2rem; }
        .domain-officers-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.6rem; }
        .domain-officer-chip {
            font-size: 0.8em;
            padding: 0.14rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.03);
        }
        .domain-officer-chip.is-away { opacity: 0.6; border-style: dashed; }
        .domain-officer-away { font-style: italic; }
        .domain-action-chips-wrap { margin-bottom: 0.7rem; padding-bottom: 0.6rem; border-bottom: 1px dashed rgba(255,255,255,0.08); }
        .domain-action-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
        .domain-action-chip {
            font-size: 0.8em;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(0,0,0,0.2);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .domain-action-chip.is-selected {
            border-color: var(--vscode-focusBorder, #4a90e2);
            background: rgba(74,144,226,0.22);
        }
        .domain-section-heading { font-weight: 600; font-size: 0.92em; margin: 0.55rem 0 0.35rem; opacity: 0.9; }
        .domain-petition-card {
            margin-bottom: 0.45rem;
            padding: 0.4rem 0.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 5px;
            background: rgba(255,255,255,0.02);
        }
        .domain-petition-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .domain-petition-rulings { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .domain-ruling-btn, .domain-tactic-btn, .domain-dispatch-btn { font-size: 0.8em; }
        .domain-rival-body p, .domain-battle-progress p { font-size: 0.88em; margin: 0.2rem 0; }
        .domain-battle-troops { display: flex; gap: 1rem; font-size: 0.85em; opacity: 0.85; margin-bottom: 0.4rem; }
        .domain-battle-tactics { display: flex; gap: 0.35rem; }
        .domain-mission-list { margin-bottom: 0.3rem; }
        .domain-mission-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.86em;
            padding: 0.15rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .domain-mission-months { opacity: 0.6; }
        .domain-mission-report { font-size: 0.85em; opacity: 0.85; margin: 0.2rem 0; }
        .domain-dispatch-form { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-top: 0.4rem; }
        .domain-dispatch-select {
            font-size: 0.82em;
            padding: 0.15rem 0.3rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
}

function ensureGuildStyles() {
    if (document.getElementById('world-guild-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-guild-styles';
    style.textContent = `
        .guild-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .guild-header-title { font-weight: 600; font-size: 1.02em; }
        .guild-rank-badge {
            font-size: 0.72em;
            padding: 0.08rem 0.4rem;
            border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.18);
            opacity: 0.85;
            margin-left: 0.3rem;
        }
        .guild-header-date { font-size: 0.85em; opacity: 0.65; }
        .guild-resource-row { display: flex; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
        .guild-resource { display: flex; align-items: center; gap: 0.3rem; font-size: 0.95em; }
        .guild-stats-grid { margin-bottom: 0.6rem; }
        .guild-stat-row {
            display: grid;
            grid-template-columns: minmax(6rem, 8rem) 1fr 2.4rem;
            align-items: center;
            gap: 0.5rem;
            padding: 0.14rem 0;
            font-size: 0.85em;
        }
        .guild-stat-label { opacity: 0.8; }
        .guild-stat-bar {
            height: 0.45rem;
            border-radius: 3px;
            background: rgba(255,255,255,0.08);
            overflow: hidden;
        }
        .guild-stat-fill {
            height: 100%;
            background: var(--vscode-charts-orange, #ce9178);
            border-radius: 3px;
        }
        .guild-stat-value { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
        .guild-actions-left { font-size: 0.8em; opacity: 0.6; margin-top: 0.2rem; }
        .guild-adventurers-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
        .guild-board-section { margin-top: 0.5rem; }
        .guild-section-heading { font-size: 0.82em; font-weight: 600; opacity: 0.75; margin-bottom: 0.35rem; }
        .guild-request-card {
            padding: 0.45rem 0.5rem;
            margin-bottom: 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.02);
        }
        .guild-request-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .guild-request-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
        .guild-quests-section { margin-top: 0.5rem; }
        .guild-quest-card {
            padding: 0.45rem 0.5rem;
            margin-bottom: 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.02);
        }
        .guild-quest-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .guild-quest-active-row {
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            font-size: 0.85em;
            padding: 0.2rem 0;
        }
        .guild-party-form { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-top: 0.25rem; }
        .guild-party-checks { display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.85em; }
        .guild-party-check { display: flex; align-items: center; gap: 0.2rem; }
        .guild-quest-reports { font-size: 0.82em; opacity: 0.85; margin-top: 0.25rem; }
        .guild-adventurer-chip {
            font-size: 0.8em;
            padding: 0.14rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.03);
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

function renderWorldMapItems(items) {
    const section = document.getElementById('world-map-items-section');
    const list = document.getElementById('world-map-items-list');
    if (!section || !list) { return; }
    const held = Array.isArray(items) ? items.filter((i) => i && i.id && i.name) : [];
    if (held.length === 0) {
        section.classList.add('hidden');
        list.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    list.innerHTML = '';
    for (const item of held) {
        const row = document.createElement('div');
        row.className = 'world-map-item-row';
        const label = document.createElement('span');
        label.className = 'world-map-item-label';
        const kindIcon = item.kind === 'rumor' ? '💬' : item.kind === 'informant' ? '🗣' : '📜';
        label.textContent = `${kindIcon} ${item.name}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-pin-action-btn';
        btn.textContent = T('webview.world.mapItemUnfold');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            postWorldInsertChatText(T('webview.world.mapItemUnfoldText', { name: item.name }));
        });
        row.appendChild(label);
        row.appendChild(btn);
        list.appendChild(row);
    }
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

function hasSettlementMapContent(msg) {
    if (!msg) { return false; }
    const interior = msg.mobileBaseInterior;
    if (msg.enableMobileBaseSystem === true && interior && !interior.interiorBlocked && interior.hasCanvas) {
        return true;
    }
    return msg.enableSettlementMode === true && Boolean(msg.settlementView);
}

function syncSettlementMapModeUi(msg) {
    const btn = document.getElementById('world-map-mode-settlement');
    if (!btn) { return; }
    const show = hasSettlementMapContent(msg);
    btn.classList.toggle('hidden', !show);
    if (!show && worldMapMode === 'settlement') {
        setWorldMapMode('mermaid', { persist: true });
    }
}

/** M5b: Diorama button only appears when the flag is on AND the host sent a non-empty snapshot. */
function syncDioramaMapModeUi(msg) {
    const btn = document.getElementById('world-map-mode-diorama');
    if (!btn) { return; }
    const snapshot = msg.settlementDiorama;
    const hasContent = Boolean(snapshot && (
        (Array.isArray(snapshot.blocks) && snapshot.blocks.length > 0)
        || (Array.isArray(snapshot.markers) && snapshot.markers.length > 0)
    ));
    const show = msg.enableSettlementDiorama === true && hasContent;
    btn.classList.toggle('hidden', !show);
    if (!show && worldMapMode === 'diorama') {
        setWorldMapMode('mermaid', { persist: true });
    }
}

function setWorldMapMode(mode, options = {}) {
    const persist = options.persist !== false;
    if (mode === 'settlement') {
        const btn = document.getElementById('world-map-mode-settlement');
        if (btn?.classList.contains('hidden')) {
            worldMapMode = 'mermaid';
        } else {
            worldMapMode = 'settlement';
        }
    } else if (mode === 'diorama') {
        const btn = document.getElementById('world-map-mode-diorama');
        if (btn?.classList.contains('hidden')) {
            worldMapMode = 'mermaid';
        } else {
            worldMapMode = 'diorama';
        }
    } else {
        worldMapMode = (mode === 'parchment' || mode === 'tile') ? mode : 'mermaid';
    }
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
        settlement: document.getElementById('world-settlement'),
        diorama: document.getElementById('world-diorama'),
    };
    const buttons = {
        mermaid: document.getElementById('world-map-mode-mermaid'),
        parchment: document.getElementById('world-map-mode-parchment'),
        tile: document.getElementById('world-map-mode-tile'),
        settlement: document.getElementById('world-map-mode-settlement'),
        diorama: document.getElementById('world-map-mode-diorama'),
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
        if (typeof registerTileOvermapAnimation === 'function') { registerTileOvermapAnimation(); }
    } else if (typeof unregisterTileOvermapAnimation === 'function') {
        unregisterTileOvermapAnimation();
    }
    if (typeof syncVehicleTileHint === 'function') {
        syncVehicleTileHint(_worldViewMsg);
    }
    if (worldMapMode === 'settlement' && typeof drawSettlementIsometric === 'function') {
        requestAnimationFrame(() => drawSettlementIsometric());
    }
    if (worldMapMode === 'diorama' && typeof renderSettlementDiorama === 'function') {
        requestAnimationFrame(() => renderSettlementDiorama());
    }
    // Stop (or resume) the diorama's water-bob animation loop when leaving/entering
    // this mode — mirrors the tile-overmap register/unregister pattern above.
    if (typeof updateDioramaWaterAnimationState === 'function') {
        updateDioramaWaterAnimationState();
    }
}

function renderCartographyMap(msg) {
    const stage = document.getElementById('world-cartography-stage');
    const img = document.getElementById('world-cartography-img');
    const pinsEl = document.getElementById('world-cartography-pins');
    const empty = document.getElementById('world-cartography-empty');
    const routesEl = document.getElementById('world-cartography-routes');
    if (!stage || !img || !pinsEl) { return; }

    const hasImage = Boolean(msg.cartographyImage);
    if (empty) {
        empty.classList.toggle('hidden', hasImage);
    }
    stage.style.display = hasImage ? '' : 'none';

    if (!hasImage) {
        img.removeAttribute('src');
        pinsEl.innerHTML = '';
        if (routesEl) { routesEl.innerHTML = ''; }
        renderCartographyLegend([]);
        return;
    }

    img.src = msg.cartographyImage;
    img.alt = msg.worldName ? `${msg.worldName} map` : 'World map';

    pinsEl.innerHTML = '';
    renderFogOverlays(stage, msg);
    renderCartographyRoutes(routesEl, msg);

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
        const typeIcon = LOCATION_TYPE_ICON[pinMeta?.locationType] || LOCATION_TYPE_ICON.other;
        el.title = visibility === 'rumored' ? T('webview.world.pinRumoredTooltip') : (pin.locationName || pin.locationId || '');
        el.textContent = visibility === 'rumored' ? '?' : (pin.locationId === msg.currentLocationId ? '@' : typeIcon);
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

    renderCartographyLegend(pins.map((pin) => findWorldPinMeta(pin.locationId)).filter(Boolean));
}

/** Trade-road / travel-route lines between connected regions (parchment overlay only). */
function renderCartographyRoutes(routesEl, msg) {
    if (!routesEl) { return; }
    routesEl.setAttribute('viewBox', '0 0 100 100');
    routesEl.setAttribute('preserveAspectRatio', 'none');
    routesEl.innerHTML = '';
    const edges = Array.isArray(msg.cartographyRouteEdges) ? msg.cartographyRouteEdges : [];
    for (const edge of edges) {
        if ([edge.x1Pct, edge.y1Pct, edge.x2Pct, edge.y2Pct].some((v) => typeof v !== 'number')) { continue; }
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'world-cartography-route-line');
        line.setAttribute('x1', String(edge.x1Pct));
        line.setAttribute('y1', String(edge.y1Pct));
        line.setAttribute('x2', String(edge.x2Pct));
        line.setAttribute('y2', String(edge.y2Pct));
        routesEl.appendChild(line);
    }
}

const CARTOGRAPHY_LEGEND_ORDER = ['settlement', 'landmark', 'ruins', 'dungeon', 'wilderness'];

/** Compact legend keyed off the location types actually present on the current map. */
function renderCartographyLegend(pinMetas) {
    const el = document.getElementById('world-cartography-legend');
    if (!el) { return; }
    const seenTypes = new Set();
    let hasDanger = false;
    let hasRumored = false;
    for (const meta of pinMetas) {
        if (meta?.locationType) { seenTypes.add(meta.locationType); }
        if (meta?.dangerTier === 'high' || meta?.dangerTier === 'medium') { hasDanger = true; }
        if (meta?.fogVisibility === 'rumored') { hasRumored = true; }
    }
    if (seenTypes.size === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML = '';
    for (const type of CARTOGRAPHY_LEGEND_ORDER) {
        if (!seenTypes.has(type)) { continue; }
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        const glyph = document.createElement('span');
        glyph.className = 'world-map-overlay-legend-glyph';
        glyph.textContent = LOCATION_TYPE_ICON[type] || LOCATION_TYPE_ICON.other;
        item.appendChild(glyph);
        item.appendChild(document.createTextNode(T(`webview.world.locationType.${type}`)));
        el.appendChild(item);
    }
    if (hasDanger) {
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        item.innerHTML = '<span class="world-map-overlay-legend-glyph">⚠</span>';
        item.appendChild(document.createTextNode(T('webview.world.pinDetail.danger')));
        el.appendChild(item);
    }
    if (hasRumored) {
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        item.innerHTML = '<span class="world-map-overlay-legend-glyph">?</span>';
        item.appendChild(document.createTextNode(T('webview.world.overlayLegendRumored')));
        el.appendChild(item);
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

function formatMarketNumber(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) { return '-'; }
    return n.toFixed(digits);
}

const PLAYER_ROLE_I18N = {
    merchant: 'webview.world.playerRoleMerchant',
    adventurer: 'webview.world.playerRoleAdventurer',
    retainer: 'webview.world.playerRoleRetainer',
    smith: 'webview.world.playerRoleSmith',
    ruler: 'webview.world.playerRoleRuler',
};

let _commerceTradeToastTimer = null;

function setCommerceTradeToast(text, kind) {
    const panel = document.getElementById('world-commerce-panel');
    if (!panel) { return; }
    let toast = document.getElementById('world-commerce-trade-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'world-commerce-trade-toast';
        toast.className = 'world-commerce-trade-toast';
        panel.appendChild(toast);
    }
    toast.textContent = text || '';
    toast.classList.toggle('is-error', kind === 'error');
    toast.classList.toggle('is-ok', kind === 'ok');
    toast.classList.toggle('hidden', !text);
    if (_commerceTradeToastTimer) { clearTimeout(_commerceTradeToastTimer); }
    if (text) {
        _commerceTradeToastTimer = setTimeout(() => {
            toast.classList.add('hidden');
            toast.textContent = '';
        }, 4000);
    }
}

function playerRoleLabel(role) {
    const key = PLAYER_ROLE_I18N[role];
    return key ? T(key) : role;
}

function renderPlayerCommerce(commerce, commerceEnabled, commerceUiEnabled, playerRoles, currentLocationId) {
    const section = document.getElementById('world-commerce-details');
    const panel = document.getElementById('world-commerce-panel');
    const hint = document.getElementById('world-commerce-hint');
    if (!section || !panel) { return; }

    const visible = commerceEnabled && commerce && typeof commerce.credits === 'number';
    section.classList.toggle('hidden', !visible);
    if (hint) {
        hint.textContent = commerceUiEnabled
            ? T('webview.world.commerceHintInteractive')
            : T('webview.world.commerceHint');
    }
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const cargo = Array.isArray(commerce.cargo) ? commerce.cargo : [];
    const cargoLines = cargo.length > 0
        ? cargo.map((c) => `${escapeHtml(c.commodityId || '?')} × ${escapeHtml(c.qty ?? 0)}`).join(', ')
        : escapeHtml(T('webview.world.commerceCargoEmpty'));

    const roles = Array.isArray(playerRoles) && playerRoles.length > 0
        ? playerRoles
        : ['merchant', 'adventurer', 'retainer', 'smith', 'ruler'];
    const currentRole = commerce.playerRole || 'merchant';
    const roleRow = commerceUiEnabled
        ? `<div class="world-commerce-row">
            <span>${escapeHtml(T('webview.world.commercePlayerRole'))}</span>
            <select id="world-commerce-role-select" class="world-commerce-role-select" aria-label="${escapeHtml(T('webview.world.commercePlayerRole'))}">
                ${roles.map((role) => `<option value="${escapeHtml(role)}"${role === currentRole ? ' selected' : ''}>${escapeHtml(playerRoleLabel(role))}</option>`).join('')}
            </select>
           </div>`
        : '';

    panel.innerHTML = `
        ${roleRow}
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceCredits'))}</span><strong>${escapeHtml(commerce.credits)}</strong></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceFood'))}</span><strong>${escapeHtml(commerce.food ?? 30)}</strong></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceTransport'))}</span><code class="patch-value">${escapeHtml(commerce.transportId || 'wagon')}</code></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceCargo'))}</span><span>${cargoLines}</span></div>
        ${commerceUiEnabled ? '<button type="button" id="player-action-hub-open" class="world-market-trade-btn player-action-hub-open" aria-haspopup="dialog">暮らす</button><p class="img-gen-hint">取引・旅・一日を終える操作をまとめて行います。確定前に必ず確認し、AIは呼ばれません。</p>' : ''}
        <div id="world-commerce-trade-toast" class="world-commerce-trade-toast hidden"></div>
    `;

    if (commerceUiEnabled) {
        const hubOpen = document.getElementById('player-action-hub-open');
        if (hubOpen) {
            hubOpen.addEventListener('click', () => openPlayerActionHub(hubOpen));
        }
        const roleSelect = document.getElementById('world-commerce-role-select');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'livingWorldSetPlayerRole',
                    role: roleSelect.value,
                });
            });
        }
    }

    refreshPlayerActionHub();
    void currentLocationId;
}

function appendMarketTradeControls(row, market, quote, commerceUiEnabled, currentLocationId) {
    if (!commerceUiEnabled || !currentLocationId || market.locationId !== currentLocationId) {
        return;
    }

    const trade = document.createElement('div');
    trade.className = 'world-market-trade';
    trade.style.gridColumn = '1 / -1';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.max = '999';
    qtyInput.value = '1';
    qtyInput.setAttribute('aria-label', T('webview.world.tradeQty'));

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'world-market-trade-btn';
    buyBtn.textContent = T('webview.world.tradeBuy');
    buyBtn.addEventListener('click', () => {
        const qty = parseInt(qtyInput.value, 10) || 1;
        vscode.postMessage({
            type: 'livingWorldDirectTrade',
            op: 'buy',
            marketLocationId: market.locationId,
            commodityId: quote.commodityId,
            qty,
        });
        buyBtn.disabled = true;
        sellBtn.disabled = true;
    });

    const sellBtn = document.createElement('button');
    sellBtn.type = 'button';
    sellBtn.className = 'world-market-trade-btn';
    sellBtn.textContent = T('webview.world.tradeSell');
    sellBtn.addEventListener('click', () => {
        const qty = parseInt(qtyInput.value, 10) || 1;
        vscode.postMessage({
            type: 'livingWorldDirectTrade',
            op: 'sell',
            marketLocationId: market.locationId,
            commodityId: quote.commodityId,
            qty,
        });
        buyBtn.disabled = true;
        sellBtn.disabled = true;
    });

    trade.appendChild(qtyInput);
    trade.appendChild(buyBtn);
    trade.appendChild(sellBtn);
    row.appendChild(trade);
}

/* --- Player Action Hub (PLAYABLE-V0-UI-001) ---
 * One coherent, player-facing surface that unifies the deterministic
 * direct-trade (P2), zero-turn travel (P4), and end-day (P3) flows into a
 * single modal with 取引 / 旅 / 一日を終える sections. The host message
 * contracts, request-id semantics, persistence truth, and shared workspace
 * mutation gate are unchanged — this layer is presentation and client-side
 * state only. No AI narration and no AI-dependent state mutation. */

let _playerActionHub = null;
let _playerActionHubInitiator = null;
let _playerActionHubSection = 'trade';
/* Only one deterministic mutation may be in-flight in the hub at any time. */
let _hubMutationInFlight = null; // null | 'trade' | 'travel' | 'endday'
let _hubMarket = null;           // canonical current-market snapshot for 取引

/* 取引 — direct trade (P2) */
let _shopkeeperInFlight = false;
let _shopkeeperPendingRequestId = null;
let _shopkeeperPreviewReady = false;

/* 旅 — zero-turn travel (P4) */
let _marketTravelPendingRequestId = null;
let _marketTravelPreviewDestinationId = null;
let _marketTravelPreviewReady = false;
let _marketTravelLoaded = false;

/* 一日を終える — end-day world progression (P3) */
let _endDayPendingRequestId = null;
let _endDayPreviewReady = false;
let _endDayLoaded = false;

function createHubRequestId(prefix) {
    const random = new Uint32Array(2);
    if (window.crypto?.getRandomValues) { window.crypto.getRandomValues(random); }
    return `${prefix}_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
}

function hubCurrentMarket(msg) {
    const markets = Array.isArray(msg?.livingWorldMarkets) ? msg.livingWorldMarkets : [];
    const market = markets.find((entry) => entry && entry.locationId === msg?.currentLocationId);
    return market && Array.isArray(market.quotes) && market.quotes.length > 0 ? market : null;
}

function hubLocationName(msg) {
    const id = msg && msg.currentLocationId;
    if (!id) { return '—'; }
    const markets = Array.isArray(msg.livingWorldMarkets) ? msg.livingWorldMarkets : [];
    const market = markets.find((m) => m && m.locationId === id);
    if (market && (market.locationName || market.name)) { return market.locationName || market.name; }
    const pin = _worldPinCatalog.get(id);
    if (pin && pin.locationName) { return pin.locationName; }
    return id;
}

function hubCargoSummary(commerce) {
    const cargo = Array.isArray(commerce?.cargo) ? commerce.cargo : [];
    if (cargo.length === 0) { return T('webview.world.commerceCargoEmpty'); }
    return cargo.map((c) => `${c.commodityId || '?'} × ${c.qty ?? 0}`).join(', ');
}

function hubHeldQty(commerce, commodityId) {
    const cargo = Array.isArray(commerce?.cargo) ? commerce.cargo : [];
    const entry = cargo.find((c) => c && c.commodityId === commodityId);
    return entry ? (entry.qty ?? 0) : 0;
}

function hubCommodityName(commodityId) {
    if (!commodityId) { return '?'; }
    const quotes = _hubMarket && Array.isArray(_hubMarket.quotes) ? _hubMarket.quotes : [];
    const quote = quotes.find((q) => q.commodityId === commodityId);
    return quote ? (quote.commodityName || quote.commodityId) : commodityId;
}

function hubRecomputeMarket() {
    _hubMarket = hubCurrentMarket(_worldViewMsg || {});
}

function renderHubHeader() {
    if (!_playerActionHub) { return; }
    const status = _playerActionHub.querySelector('#player-action-hub-status');
    if (!status) { return; }
    const msg = _worldViewMsg || {};
    const commerce = msg.playerCommerce || {};
    const rows = [
        ['現在地', hubLocationName(msg)],
        [T('webview.world.commerceCredits'), commerce.credits ?? 0],
        [T('webview.world.commerceFood'), commerce.food ?? 0],
        [T('webview.world.commerceTransport'), commerce.transportId || 'wagon'],
        [T('webview.world.commerceCargo'), hubCargoSummary(commerce)],
    ];
    status.innerHTML = rows.map(([label, value]) =>
        `<div class="player-action-hub__stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join('');
}

/* Shared client-side state machine: only one mutation in-flight; no queuing,
 * no auto-retry. While a mutation is accepted by the host, the close control
 * and every other section's confirm are genuinely disabled. */
function hubSetMutationInFlight(kind) {
    _hubMutationInFlight = kind;
    if (_playerActionHub) { _playerActionHub.setAttribute('data-hub-inflight', kind); }
    hubSyncConfirmAvailability();
}

function hubClearMutationInFlight() {
    _hubMutationInFlight = null;
    if (_playerActionHub) { _playerActionHub.removeAttribute('data-hub-inflight'); }
    hubSyncConfirmAvailability();
}

function hubSyncConfirmAvailability() {
    if (!_playerActionHub) { return; }
    const busy = !!_hubMutationInFlight;
    const closeBtn = _playerActionHub.querySelector('#player-action-hub-close');
    if (closeBtn) { closeBtn.disabled = busy; }
    const tradeConfirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    const travelConfirm = _playerActionHub.querySelector('#market-travel-confirm');
    const endDayConfirm = _playerActionHub.querySelector('#end-day-confirm');
    if (busy) {
        if (tradeConfirm && _hubMutationInFlight !== 'trade') { tradeConfirm.disabled = true; }
        if (travelConfirm && _hubMutationInFlight !== 'travel') { travelConfirm.disabled = true; }
        if (endDayConfirm && _hubMutationInFlight !== 'endday') { endDayConfirm.disabled = true; }
    } else {
        if (tradeConfirm) { tradeConfirm.disabled = !_shopkeeperPreviewReady; }
        if (travelConfirm) { travelConfirm.disabled = !_marketTravelPreviewReady; }
        if (endDayConfirm) { endDayConfirm.disabled = !_endDayPreviewReady; }
    }
}

function activateHubSection(section, opts) {
    if (!_playerActionHub) { return; }
    _playerActionHubSection = section;
    _playerActionHub.querySelectorAll('.player-action-hub__tab').forEach((tab) => {
        const active = tab.getAttribute('data-section') === section;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    _playerActionHub.querySelectorAll('.player-action-hub__section').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-section') !== section;
    });
    if (section === 'travel') { hubLoadTravel(); }
    if (section === 'endday') { hubLoadEndDay(); }
    if (opts && opts.focusTab) {
        const activeTab = _playerActionHub.querySelector(`.player-action-hub__tab[data-section="${section}"]`);
        if (activeTab) { activeTab.focus(); }
    }
}

function wireHubNavigation() {
    const tabs = Array.from(_playerActionHub.querySelectorAll('.player-action-hub__tab'));
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activateHubSection(tab.getAttribute('data-section'), { focusTab: true }));
    });
    const nav = _playerActionHub.querySelector('.player-action-hub__nav');
    nav.addEventListener('keydown', (event) => {
        const idx = tabs.indexOf(document.activeElement);
        if (idx === -1) { return; }
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { next = (idx + 1) % tabs.length; }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { next = (idx - 1 + tabs.length) % tabs.length; }
        else if (event.key === 'Home') { next = 0; }
        else if (event.key === 'End') { next = tabs.length - 1; }
        if (next >= 0) {
            event.preventDefault();
            activateHubSection(tabs[next].getAttribute('data-section'), { focusTab: true });
        }
    });
}

/* --- 取引 (direct trade) section --- */
function renderHubTradeSection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-trade" data-section="trade" aria-labelledby="player-action-hub-tab-trade">
        <h3 class="player-action-hub__section-title">取引</h3>
        <p class="player-action-hub__note">現在地の市場で直接売り買いします。AIは呼ばれません。</p>
        <div class="player-action-hub__trade-body" id="player-action-hub-trade-body"></div>
      </section>`;
}

function hubRenderTradeBody() {
    if (!_playerActionHub) { return; }
    const body = _playerActionHub.querySelector('#player-action-hub-trade-body');
    if (!body) { return; }
    if (!_hubMarket) {
        body.innerHTML = '<p class="player-action-hub__review" id="shopkeeper-review" role="status" aria-live="polite" data-state="empty">現在地に取引できる市場がありません。「旅」から市場のある場所へ移動してください。</p>';
        _shopkeeperPreviewReady = false;
        return;
    }
    body.innerHTML = `
      <label class="player-action-hub__field">品目
        <select id="shopkeeper-commodity" class="player-action-hub__select"></select>
      </label>
      <fieldset class="player-action-hub__field player-action-hub__ops">
        <legend>操作</legend>
        <label class="player-action-hub__radio"><input type="radio" name="shopkeeper-op" value="buy" checked> 購入</label>
        <label class="player-action-hub__radio"><input type="radio" name="shopkeeper-op" value="sell"> 売却</label>
      </fieldset>
      <div class="player-action-hub__field player-action-hub__qty">
        <span class="player-action-hub__qty-label" id="shopkeeper-qty-label">数量</span>
        <div class="player-action-hub__stepper" role="group" aria-labelledby="shopkeeper-qty-label">
          <button type="button" class="player-action-hub__step" id="shopkeeper-qty-dec" aria-label="数量を1減らす">−</button>
          <input id="shopkeeper-qty" class="player-action-hub__qty-input" type="number" min="1" max="999" step="1" value="1" inputmode="numeric" aria-labelledby="shopkeeper-qty-label">
          <button type="button" class="player-action-hub__step" id="shopkeeper-qty-inc" aria-label="数量を1増やす">＋</button>
        </div>
      </div>
      <p class="player-action-hub__review" id="shopkeeper-review" role="status" aria-live="polite">確認を押すと、確定前の見積もりを表示します。</p>
      <div class="player-action-hub__actions">
        <button type="button" id="shopkeeper-review-btn" class="player-action-hub__btn">確認</button>
        <button type="button" id="shopkeeper-confirm-btn" class="player-action-hub__btn player-action-hub__btn--primary" disabled>確定</button>
      </div>`;
    hubRefreshTradeOptions();
    wireHubTradeInputs();
}

function hubRefreshTradeOptions() {
    if (!_playerActionHub || !_hubMarket) { return; }
    const select = _playerActionHub.querySelector('#shopkeeper-commodity');
    if (!select) { return; }
    const prev = select.value;
    select.innerHTML = _hubMarket.quotes.map((q) =>
        `<option value="${escapeHtml(q.commodityId)}">${escapeHtml(q.commodityName || q.commodityId)}（単価 ${escapeHtml(formatMarketNumber(q.unitPrice))} / 在庫 ${escapeHtml(formatMarketNumber(q.stock))}）</option>`
    ).join('');
    if (prev && _hubMarket.quotes.some((q) => q.commodityId === prev)) { select.value = prev; }
}

function hubDisableTradeInputs(disabled) {
    if (!_playerActionHub) { return; }
    ['#shopkeeper-commodity', '#shopkeeper-qty', '#shopkeeper-qty-inc', '#shopkeeper-qty-dec'].forEach((sel) => {
        const el = _playerActionHub.querySelector(sel);
        if (el) { el.disabled = disabled; }
    });
    _playerActionHub.querySelectorAll('input[name="shopkeeper-op"]').forEach((el) => { el.disabled = disabled; });
}

/* Any change to commodity, operation, or quantity invalidates the old preview. */
function hubInvalidateTradePreview() {
    _shopkeeperPreviewReady = false;
    if (!_playerActionHub) { return; }
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    if (confirm) { confirm.disabled = true; }
    if (_shopkeeperInFlight) { return; }
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    if (review) {
        review.setAttribute('data-state', 'idle');
        review.textContent = '確認を押すと、確定前の見積もりを表示します。';
    }
}

function wireHubTradeInputs() {
    const commoditySelect = _playerActionHub.querySelector('#shopkeeper-commodity');
    const qtyInput = _playerActionHub.querySelector('#shopkeeper-qty');
    const reviewBtn = _playerActionHub.querySelector('#shopkeeper-review-btn');
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    if (!commoditySelect || !qtyInput || !reviewBtn || !confirm || !review) { return; }

    commoditySelect.addEventListener('change', hubInvalidateTradePreview);
    _playerActionHub.querySelectorAll('input[name="shopkeeper-op"]').forEach((el) => {
        el.addEventListener('change', hubInvalidateTradePreview);
    });
    qtyInput.addEventListener('input', hubInvalidateTradePreview);
    const stepQty = (delta) => {
        const current = Number(qtyInput.value) || 0;
        const next = Math.min(999, Math.max(1, Math.trunc(current) + delta));
        qtyInput.value = String(next);
        hubInvalidateTradePreview();
    };
    _playerActionHub.querySelector('#shopkeeper-qty-dec').addEventListener('click', () => stepQty(-1));
    _playerActionHub.querySelector('#shopkeeper-qty-inc').addEventListener('click', () => stepQty(1));

    reviewBtn.addEventListener('click', () => {
        if (_shopkeeperInFlight || _hubMutationInFlight) { return; }
        const op = _playerActionHub.querySelector('input[name="shopkeeper-op"]:checked').value;
        const commodityId = commoditySelect.value;
        const qty = Number(qtyInput.value);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
            review.setAttribute('data-state', 'error');
            review.textContent = '数量は1から999までの整数で入力してください。';
            _shopkeeperPreviewReady = false;
            confirm.disabled = true;
            return;
        }
        const quote = _hubMarket.quotes.find((q) => q.commodityId === commodityId);
        const commerce = (_worldViewMsg && _worldViewMsg.playerCommerce) || {};
        const unit = quote ? quote.unitPrice : 0;
        const total = Math.round((unit || 0) * qty);
        const name = quote ? (quote.commodityName || quote.commodityId) : commodityId;
        const stock = quote ? quote.stock : 0;
        review.setAttribute('data-state', 'preview');
        review.textContent = op === 'buy'
            ? `購入（確定前）: ${name} × ${qty} / 単価 ${formatMarketNumber(unit)} / 合計 ${formatMarketNumber(total)} / 在庫 ${formatMarketNumber(stock)} / 所持 ${formatMarketNumber(commerce.credits ?? 0)}`
            : `売却（確定前）: ${name} × ${qty} / 単価 ${formatMarketNumber(unit)} / 合計 ${formatMarketNumber(total)} / 在庫 ${formatMarketNumber(stock)} / 保有 ${formatMarketNumber(hubHeldQty(commerce, commodityId))}`;
        _shopkeeperPreviewReady = true;
        confirm.disabled = false;
        confirm.focus();
    });

    confirm.addEventListener('click', () => {
        if (_shopkeeperInFlight || _hubMutationInFlight || !_shopkeeperPreviewReady) { return; }
        const op = _playerActionHub.querySelector('input[name="shopkeeper-op"]:checked').value;
        const commodityId = commoditySelect.value;
        const qty = Number(qtyInput.value);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) { return; }
        _shopkeeperInFlight = true;
        _shopkeeperPendingRequestId = createHubRequestId('shop');
        hubSetMutationInFlight('trade');
        confirm.disabled = true;
        reviewBtn.disabled = true;
        hubDisableTradeInputs(true);
        review.setAttribute('data-state', 'submitting');
        review.textContent = '処理中…';
        vscode.postMessage({
            type: 'shopkeeperDirectTrade',
            requestId: _shopkeeperPendingRequestId,
            op,
            marketLocationId: _hubMarket.locationId,
            commodityId,
            qty,
        });
    });
}

function wireHubTradeSection() {
    hubRenderTradeBody();
}

function finishShopkeeperTrade(msg) {
    if (!_playerActionHub) { return; }
    if (!msg || !msg.requestId || msg.requestId !== _shopkeeperPendingRequestId) { return; }
    _shopkeeperPendingRequestId = null;
    _shopkeeperInFlight = false;
    hubClearMutationInFlight();
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    const reviewBtn = _playerActionHub.querySelector('#shopkeeper-review-btn');
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    hubDisableTradeInputs(false);
    if (reviewBtn) { reviewBtn.disabled = false; }
    if (!review) { return; }
    if (msg.ok) {
        const r = msg.receipt || {};
        const name = hubCommodityName(r.commodityId);
        review.setAttribute('data-state', 'success');
        review.textContent = `${r.op === 'sell' ? '売却しました' : '購入しました'}: ${name} × ${r.qty || 0}（${formatMarketNumber(r.total || 0)}）`;
        if (msg.refreshFailed || r.refreshFailed) {
            review.setAttribute('data-state', 'success-stale');
            review.textContent += ' 保存は完了しましたが、表示の更新を確認できませんでした。画面を再読込してください。';
        }
        _shopkeeperPreviewReady = false;
        if (confirm) { confirm.disabled = true; }
        hubRecomputeMarket();
        renderHubHeader();
        hubRefreshTradeOptions();
        return;
    }
    const reject = msg.rejection || {};
    if (reject.code === 'WORLD_MUTATION_IN_PROGRESS') {
        review.setAttribute('data-state', 'busy');
        review.textContent = `${reject.message || '別の操作を確定中です。'} ${reject.nextStep || '完了後に、もう一度確認してください。'}`;
        if (confirm) { confirm.disabled = !_shopkeeperPreviewReady; }
        if (confirm && !confirm.disabled) { confirm.focus(); } else if (reviewBtn) { reviewBtn.focus(); }
        return;
    }
    review.setAttribute('data-state', 'error');
    review.textContent = `${reject.message || '取引を実行できませんでした。'} ${reject.nextStep || ''}`.trim();
    if (confirm) { confirm.disabled = !_shopkeeperPreviewReady; }
}

/* --- 旅 (zero-turn travel) section --- */
function renderHubTravelSection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-travel" data-section="travel" aria-labelledby="player-action-hub-tab-travel" hidden>
        <h3 class="player-action-hub__section-title">旅に出る</h3>
        <p class="player-action-hub__note">別の市場へ移動します。移動では日付や世界ターンは進みません。AIは呼ばれません。</p>
        <label class="player-action-hub__field">移動先
          <select id="market-travel-destination" class="player-action-hub__select"><option value="">読込中...</option></select>
        </label>
        <p class="player-action-hub__review" id="market-travel-review" role="status" aria-live="polite">市場の一覧を読込中です。</p>
        <div class="player-action-hub__actions">
          <button type="button" id="market-travel-preview" class="player-action-hub__btn" disabled>確認</button>
          <button type="button" id="market-travel-confirm" class="player-action-hub__btn player-action-hub__btn--primary" disabled>移動を確定</button>
        </div>
        <details class="player-action-hub__dev">
          <summary>開発者向け詳細</summary>
          <p class="player-action-hub__dev-body" id="market-travel-dev">—</p>
        </details>
      </section>`;
}

function hubLoadTravel() {
    if (_marketTravelLoaded) { return; }
    _marketTravelLoaded = true;
    vscode.postMessage({ type: 'marketTravelPreview' });
}

function wireHubTravelSection() {
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (!select || !previewBtn || !confirm) { return; }
    select.addEventListener('change', () => {
        _marketTravelPreviewReady = false;
        _marketTravelPreviewDestinationId = null;
        confirm.disabled = true;
        previewBtn.disabled = !select.value || !!_hubMutationInFlight;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'idle');
        review.textContent = select.value ? '確認を押すと、移動内容を表示します。' : '移動先を選んでください。';
    });
    previewBtn.addEventListener('click', () => {
        if (!select.value || _hubMutationInFlight) { return; }
        _marketTravelPreviewReady = false;
        _marketTravelPreviewDestinationId = select.value;
        confirm.disabled = true;
        previewBtn.disabled = true;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'loading');
        review.textContent = '確認中...';
        vscode.postMessage({ type: 'marketTravelPreview', destinationId: select.value });
    });
    confirm.addEventListener('click', () => {
        if (!_marketTravelPreviewReady || _marketTravelPendingRequestId || _hubMutationInFlight) { return; }
        if (!select.value || select.value !== _marketTravelPreviewDestinationId) { return; }
        _marketTravelPendingRequestId = createHubRequestId('travel');
        hubSetMutationInFlight('travel');
        confirm.disabled = true;
        previewBtn.disabled = true;
        select.disabled = true;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'submitting');
        review.textContent = '移動を保存中...';
        vscode.postMessage({ type: 'marketTravelCommit', requestId: _marketTravelPendingRequestId, destinationId: select.value, confirmed: true });
    });
}

function finishMarketTravelPreview(msg) {
    if (!_playerActionHub) { return; }
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const review = _playerActionHub.querySelector('#market-travel-review');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (!select || !review || !previewBtn || !confirm) { return; }
    const requestedDestination = _marketTravelPreviewDestinationId;
    if (requestedDestination && msg.destinationId !== requestedDestination) { return; }
    if (!msg.ok) {
        review.setAttribute('data-state', 'error');
        review.textContent = `${msg.message || '移動内容を確認できませんでした。'} ${msg.nextStep || ''}`.trim();
        previewBtn.disabled = !select.value || !!_hubMutationInFlight;
        confirm.disabled = true;
        return;
    }
    if (!requestedDestination) {
        const options = Array.isArray(msg.destinations) ? msg.destinations : [];
        select.innerHTML = options.length
            ? `<option value="">移動先を選択</option>${options.map((dest) => `<option value="${escapeHtml(dest.id)}">${escapeHtml(dest.name || dest.id)}</option>`).join('')}`
            : '<option value="">移動先なし</option>';
        previewBtn.disabled = true;
        confirm.disabled = true;
        review.setAttribute('data-state', 'idle');
        review.textContent = options.length ? '移動先を選んで確認してください。' : '移動できる別の市場がありません。';
        select.disabled = options.length === 0;
        if (options.length > 0 && _playerActionHubSection === 'travel') { select.focus(); }
        return;
    }
    _marketTravelPreviewReady = true;
    const dest = msg.destination || {};
    const origin = msg.current || {};
    review.setAttribute('data-state', 'preview');
    review.textContent = `確認（確定前）: ${origin.name || origin.id || hubLocationName(_worldViewMsg)} → ${dest.name || dest.id || requestedDestination} / 市場あり / 移動では日付や世界ターンは進みません`;
    const dev = _playerActionHub.querySelector('#market-travel-dev');
    if (dev) {
        const systems = Array.isArray(msg.systemsNotAdvanced) ? msg.systemsNotAdvanced.join('、') : 'world turn';
        dev.textContent = `elapsedWorldTurns=${msg.elapsedWorldTurns} / reachabilityBasis=${msg.reachabilityBasis || 'known_market_location'} / systemsNotAdvanced=${systems}`;
    }
    previewBtn.disabled = !!_hubMutationInFlight;
    confirm.disabled = !!_hubMutationInFlight;
    if (!confirm.disabled) { confirm.focus(); }
}

function finishMarketTravel(msg) {
    if (!_playerActionHub || !msg || !msg.requestId || msg.requestId !== _marketTravelPendingRequestId) { return; }
    _marketTravelPendingRequestId = null;
    hubClearMutationInFlight();
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const review = _playerActionHub.querySelector('#market-travel-review');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (select) { select.disabled = false; }
    if (!review) { return; }
    if (!msg.ok) {
        const failure = msg.failure || {};
        if (failure.code === 'WORLD_MUTATION_IN_PROGRESS' || failure.code === 'BUSY') {
            review.setAttribute('data-state', 'busy');
        } else {
            review.setAttribute('data-state', 'error');
        }
        review.textContent = `${failure.message || '移動を保存できませんでした。'} ${failure.nextStep || ''}`.trim();
        if (previewBtn) { previewBtn.disabled = !select || !select.value; }
        if (confirm) {
            confirm.disabled = !_marketTravelPreviewReady;
            if (!confirm.disabled) { confirm.focus(); }
        }
        return;
    }
    const r = msg.receipt || {};
    review.setAttribute('data-state', 'success');
    review.textContent = `移動しました。${r.origin?.name || r.origin?.id || '?'} → ${r.destination?.name || r.destination?.id || '?'} / 日付・世界ターンは進みませんでした。`;
    if (msg.refreshFailed || r.refreshFailed) {
        review.setAttribute('data-state', 'success-stale');
        review.textContent += ' 保存は完了しましたが、表示の更新を確認できませんでした。画面を再読込してください。';
    }
    if (confirm) { confirm.disabled = true; }
    _marketTravelPreviewReady = false;
    hubRecomputeMarket();
    renderHubHeader();
    hubRenderTradeBody();
    if (_hubMarket) { activateHubSection('trade', { focusTab: false }); }
}

/* --- 一日を終える (end-day world progression) section --- */
function renderHubEndDaySection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-endday" data-section="endday" aria-labelledby="player-action-hub-tab-endday" hidden>
        <h3 class="player-action-hub__section-title">一日を終える</h3>
        <p class="player-action-hub__note player-action-hub__note--strong">世界が1ターン進みます。市場と世界の住人が変化することがあります。AIは呼ばれません。</p>
        <p class="player-action-hub__review" id="end-day-review" role="status" aria-live="polite">確認中…</p>
        <div class="player-action-hub__actions">
          <button type="button" id="end-day-confirm" class="player-action-hub__btn player-action-hub__btn--danger" disabled>一日を終える</button>
        </div>
      </section>`;
}

function hubLoadEndDay() {
    if (_endDayLoaded) { return; }
    _endDayLoaded = true;
    vscode.postMessage({ type: 'endDayPreview' });
}

function wireHubEndDaySection() {
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!confirm) { return; }
    confirm.addEventListener('click', () => {
        if (!_endDayPreviewReady || _endDayPendingRequestId || _hubMutationInFlight) { return; }
        _endDayPendingRequestId = createHubRequestId('endday');
        hubSetMutationInFlight('endday');
        confirm.disabled = true;
        const review = _playerActionHub.querySelector('#end-day-review');
        review.setAttribute('data-state', 'submitting');
        review.textContent = '一日を進めています…';
        vscode.postMessage({ type: 'endDayCommit', requestId: _endDayPendingRequestId, confirmed: true });
    });
}

function finishEndDayPreview(msg) {
    if (!_playerActionHub) { return; }
    const review = _playerActionHub.querySelector('#end-day-review');
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!review || !confirm) { return; }
    if (!msg.ok) {
        review.setAttribute('data-state', 'error');
        review.textContent = `${msg.message || '一日を確認できませんでした。'} ${msg.nextStep || ''}`.trim();
        confirm.disabled = true;
        return;
    }
    _endDayPreviewReady = true;
    const systems = Array.isArray(msg.systems) ? msg.systems.join('、') : '世界の変化';
    const consumption = Array.isArray(msg.fixedResourceConsumption) && msg.fixedResourceConsumption.length > 0
        ? msg.fixedResourceConsumption.map((x) => `${x.resource} ${x.amount}`).join('、')
        : '固定消費なし';
    review.setAttribute('data-state', 'preview');
    review.textContent = `確認（確定前）: ${msg.currentWorldTurn} → ${msg.targetWorldTurn}ターン / 進む変化: ${systems} / ${consumption}`;
    confirm.disabled = !!_hubMutationInFlight;
    if (!confirm.disabled) { confirm.focus(); }
}

function finishEndDay(msg) {
    if (!_playerActionHub || !msg || !msg.requestId || msg.requestId !== _endDayPendingRequestId) { return; }
    _endDayPendingRequestId = null;
    hubClearMutationInFlight();
    const review = _playerActionHub.querySelector('#end-day-review');
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!review || !confirm) { return; }
    if (!msg.ok) {
        const failure = msg.failure || {};
        if (failure.code === 'WORLD_MUTATION_IN_PROGRESS') {
            review.setAttribute('data-state', 'busy');
            review.textContent = `${failure.message || '別の操作を確定中です。'} ${failure.nextStep || '完了後に、もう一度操作してください。'}`;
            confirm.disabled = !_endDayPreviewReady;
            if (!confirm.disabled) { confirm.focus(); }
            return;
        }
        review.setAttribute('data-state', 'error');
        review.textContent = `${failure.message || '日を終えたことを確認できませんでした。'} ${failure.nextStep || ''}`.trim();
        confirm.disabled = !_endDayPreviewReady;
        return;
    }
    const r = msg.receipt || {};
    const eventKinds = Array.isArray(r.eventCategories) && r.eventCategories.length > 0 ? r.eventCategories.join('、') : 'なし';
    const markets = Array.isArray(r.marketChanges) && r.marketChanges.length > 0
        ? r.marketChanges.map((change) => `${change.commodityId}: 在庫 ${change.stockDelta >= 0 ? '+' : ''}${change.stockDelta}`).join('、')
        : '目立つ変化なし';
    review.setAttribute('data-state', 'success');
    review.textContent = r.quiet
        ? `一日が終わりました。ターン ${r.worldTurn?.before} → ${r.worldTurn?.after} / 大きな出来事はありませんでした。`
        : `一日が終わりました。ターン ${r.worldTurn?.before} → ${r.worldTurn?.after} / 出来事 ${r.eventCount}件（${eventKinds}）/ 市場 ${markets}`;
    if (msg.refreshFailed) {
        review.setAttribute('data-state', 'success-stale');
        review.textContent += ' 表示の更新を確認できなかったため、画面を再読込してください。';
    }
    _endDayPreviewReady = false;
    confirm.disabled = true;
    hubRecomputeMarket();
    renderHubHeader();
    hubRefreshTradeOptions();
}

/* --- Hub shell open/close/refresh --- */
function openPlayerActionHub(initiator) {
    closePlayerActionHub();
    _playerActionHubInitiator = initiator;
    const msg = _worldViewMsg || {};
    hubRecomputeMarket();
    _shopkeeperPreviewReady = false;
    _marketTravelPreviewReady = false;
    _marketTravelLoaded = false;
    _endDayPreviewReady = false;
    _endDayLoaded = false;
    _hubMutationInFlight = null;

    const hasMarket = !!_hubMarket;
    _playerActionHubSection = hasMarket ? 'trade' : 'travel';

    const overlay = document.createElement('div');
    overlay.id = 'player-action-hub';
    overlay.className = 'player-action-hub';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '暮らす');
    overlay.innerHTML = `
      <div class="player-action-hub__scrim" data-hub-scrim="true"></div>
      <section class="player-action-hub__panel" role="document">
        <header class="player-action-hub__header">
          <div class="player-action-hub__titlebar">
            <h2 class="player-action-hub__title" id="player-action-hub-title">暮らす</h2>
            <button type="button" id="player-action-hub-close" class="player-action-hub__close" aria-label="暮らすを閉じる">閉じる</button>
          </div>
          <dl class="player-action-hub__status" id="player-action-hub-status" aria-label="現在の状態"></dl>
        </header>
        <nav class="player-action-hub__nav" role="tablist" aria-label="行動を選ぶ">
          <button type="button" class="player-action-hub__tab" role="tab" id="player-action-hub-tab-trade" data-section="trade" aria-controls="player-action-hub-panel-trade" aria-selected="false" tabindex="-1">取引</button>
          <button type="button" class="player-action-hub__tab" role="tab" id="player-action-hub-tab-travel" data-section="travel" aria-controls="player-action-hub-panel-travel" aria-selected="false" tabindex="-1">旅</button>
          <button type="button" class="player-action-hub__tab player-action-hub__tab--endday" role="tab" id="player-action-hub-tab-endday" data-section="endday" aria-controls="player-action-hub-panel-endday" aria-selected="false" tabindex="-1">一日を終える</button>
        </nav>
        <div class="player-action-hub__workspace">
          ${renderHubTradeSection()}
          ${renderHubTravelSection()}
          ${renderHubEndDaySection()}
        </div>
      </section>`;
    document.body.appendChild(overlay);
    _playerActionHub = overlay;

    renderHubHeader();
    wireHubNavigation();
    wireHubTradeSection();
    wireHubTravelSection();
    wireHubEndDaySection();

    const closeBtn = overlay.querySelector('#player-action-hub-close');
    closeBtn.addEventListener('click', () => {
        if (_hubMutationInFlight) { return; }
        closePlayerActionHub();
    });
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (_hubMutationInFlight) { return; }
            event.preventDefault();
            closePlayerActionHub();
        }
    });

    if (!hasMarket) {
        const emptyReview = overlay.querySelector('#shopkeeper-review');
        if (emptyReview) { emptyReview.textContent = '現在地に取引できる市場がありません。「旅」から市場のある場所へ移動してください。'; }
    }
    activateHubSection(_playerActionHubSection, { focusTab: true });
}

function closePlayerActionHub() {
    const overlay = _playerActionHub;
    if (overlay) { overlay.remove(); }
    _playerActionHub = null;
    _hubMutationInFlight = null;
    _shopkeeperInFlight = false;
    _shopkeeperPendingRequestId = null;
    _shopkeeperPreviewReady = false;
    _marketTravelPendingRequestId = null;
    _marketTravelPreviewReady = false;
    _marketTravelPreviewDestinationId = null;
    _marketTravelLoaded = false;
    _endDayPendingRequestId = null;
    _endDayPreviewReady = false;
    _endDayLoaded = false;
    if (_playerActionHubInitiator && typeof _playerActionHubInitiator.focus === 'function') {
        _playerActionHubInitiator.focus();
    }
}

/* Called on every worldView refresh so an open hub shows canonical resources
 * and market values. Never clobbers an in-flight trade submit. */
function refreshPlayerActionHub() {
    if (!_playerActionHub) { return; }
    hubRecomputeMarket();
    renderHubHeader();
    if (!_shopkeeperInFlight && _hubMutationInFlight !== 'trade') { hubRefreshTradeOptions(); }
}

function buildDecisionSurfaceLookup(decisionSurface) {
    const lookup = new Map();
    const markets = Array.isArray(decisionSurface?.markets) ? decisionSurface.markets : [];
    markets.forEach((market) => {
        if (!market?.locationId || !Array.isArray(market.quotes)) { return; }
        const quoteMap = new Map();
        market.quotes.forEach((quote) => {
            if (quote?.commodityId) {
                quoteMap.set(quote.commodityId, quote);
            }
        });
        if (quoteMap.size > 0) {
            lookup.set(market.locationId, quoteMap);
        }
    });
    return lookup;
}

function getDecisionQuote(decisionLookup, market, quote) {
    return decisionLookup.get(market?.locationId)?.get(quote?.commodityId);
}

function formatDecisionPressure(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) { return '0%'; }
    return `${n > 0 ? '+' : ''}${formatMarketNumber(n)}%`;
}

function decisionEvidenceLabel(kind) {
    switch (kind) {
        case 'recent_event':
            return T('webview.world.decisionEvidence.recentEvent');
        case 'reputation_hostile':
            return T('webview.world.decisionEvidence.reputationHostile');
        case 'reputation_unfriendly':
            return T('webview.world.decisionEvidence.reputationUnfriendly');
        case 'reputation_friendly':
            return T('webview.world.decisionEvidence.reputationFriendly');
        case 'reputation_allied':
            return T('webview.world.decisionEvidence.reputationAllied');
        case 'low_stock':
            return T('webview.world.decisionEvidence.lowStock');
        default:
            return T('webview.world.decisionEvidence.pricePressure');
    }
}

function buildRunSpikeText(market) {
    const meta = findWorldPinMeta(market?.locationId);
    if (meta) {
        return buildWorldPinActionText('move', meta);
    }
    return T('webview.world.pinAction.move', { name: market?.locationName || market?.locationId || 'there' });
}

function appendDecisionSurface(row, market, decisionQuote) {
    if (!decisionQuote) { return; }
    row.classList.add('has-decision-surface');

    const detail = document.createElement('div');
    detail.className = 'world-market-decision';

    const pressure = document.createElement('span');
    pressure.className = 'world-market-pressure';
    pressure.textContent = T('webview.world.decisionPressureValue', {
        pressure: formatDecisionPressure(decisionQuote.pressurePct),
    });
    detail.appendChild(pressure);

    const evidence = Array.isArray(decisionQuote.evidence) ? decisionQuote.evidence : [];
    const labels = evidence.length > 0
        ? evidence.map(decisionEvidenceLabel)
        : [T('webview.world.decisionEvidence.pricePressure')];
    labels.forEach((label) => {
        const badge = document.createElement('span');
        badge.className = 'world-market-evidence';
        badge.textContent = label;
        detail.appendChild(badge);
    });

    const route = document.createElement('span');
    route.className = 'world-market-route';
    route.textContent = T('webview.world.decisionTravelPreview', {
        days: formatMarketNumber(decisionQuote.travelPreview?.days),
        foodCost: formatMarketNumber(decisionQuote.travelPreview?.foodCost),
        transport: decisionQuote.travelPreview?.transportName || '?',
    });
    detail.appendChild(route);

    const local = document.createElement('span');
    local.className = 'world-market-local';
    local.textContent = T('webview.world.decisionSellLocalNow', {
        price: formatMarketNumber(decisionQuote.localUnitPrice),
    });
    detail.appendChild(local);

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'world-market-trade-btn';
    runBtn.textContent = T('webview.world.decisionRunSpike');
    runBtn.addEventListener('click', () => {
        postWorldInsertChatText(buildRunSpikeText(market));
    });
    detail.appendChild(runBtn);

    row.appendChild(detail);
}

function renderLivingWorldMarkets(markets, decisionSurface, commerceEnabled, commerceUiEnabled, currentLocationId) {
    const section = document.getElementById('world-markets-details');
    const list = document.getElementById('world-markets-list');
    const hint = document.getElementById('world-markets-hint');
    if (!section || !list) { return; }

    const visible = commerceEnabled && Array.isArray(markets) && markets.length > 0;
    section.classList.toggle('hidden', !visible);
    if (hint) {
        hint.textContent = commerceUiEnabled
            ? T('webview.world.marketsHintInteractive')
            : T('webview.world.marketsHint');
    }
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    const decisionLookup = buildDecisionSurfaceLookup(decisionSurface);
    const displayMarkets = commerceUiEnabled && currentLocationId
        ? markets.filter((m) => m.locationId === currentLocationId || decisionLookup.has(m.locationId))
        : markets;

    if (displayMarkets.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.style.margin = '0';
        empty.textContent = commerceUiEnabled
            ? T('webview.world.marketsNotHere')
            : T('webview.world.marketsEmpty');
        list.appendChild(empty);
        return;
    }

    displayMarkets.slice(0, 12).forEach((market) => {
        const card = document.createElement('div');
        card.className = 'world-market-card';

        const title = document.createElement('div');
        title.className = 'world-market-title';
        title.textContent = market.locationName || market.locationId || 'Market';
        if (commerceUiEnabled && currentLocationId === market.locationId) {
            const here = document.createElement('span');
            here.style.fontWeight = 'normal';
            here.style.opacity = '0.7';
            here.style.marginLeft = '0.35rem';
            here.textContent = `(${T('webview.world.marketsHere')})`;
            title.appendChild(here);
        }
        card.appendChild(title);

        const allQuotes = Array.isArray(market.quotes) ? market.quotes : [];
        const quotes = commerceUiEnabled && currentLocationId && market.locationId !== currentLocationId
            ? allQuotes.filter((quote) => getDecisionQuote(decisionLookup, market, quote)).slice(0, 8)
            : allQuotes.slice(0, 8);
        if (quotes.length === 0) { return; }

        quotes.forEach((quote) => {
            const row = document.createElement('div');
            row.className = 'world-market-row';
            row.innerHTML = `
                <span>${escapeHtml(quote.commodityName || quote.commodityId || '?')}</span>
                <span class="world-market-num">${escapeHtml(formatMarketNumber(quote.unitPrice))}</span>
                <span class="world-market-num">${escapeHtml(formatMarketNumber(quote.stock))}</span>
                <span class="world-market-num">x${escapeHtml(formatMarketNumber(quote.priceIndex, 2))}</span>
            `;
            if (commerceUiEnabled) {
                appendMarketTradeControls(row, market, quote, commerceUiEnabled, currentLocationId);
                if (market.locationId !== currentLocationId) {
                    appendDecisionSurface(row, market, getDecisionQuote(decisionLookup, market, quote));
                }
            }
            card.appendChild(row);
        });

        list.appendChild(card);
    });
}

function renderNpcWhereabouts(payload) {
    const section = document.getElementById('world-npc-whereabouts-details');
    const list = document.getElementById('world-npc-whereabouts-list');
    const clamped = document.getElementById('world-npc-whereabouts-clamped');
    if (!section || !list) { return; }

    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const visible = entries.length > 0;
    section.classList.toggle('hidden', !visible);
    if (clamped) {
        clamped.classList.toggle('hidden', !(visible && payload?.clamped));
    }
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    entries.slice(0, 10).forEach((npc) => {
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        const precision = npc.precision || 'unknown';
        let locationText;
        if (precision === 'unknown') {
            locationText = T('webview.world.npcWhereaboutsUnknown');
        } else if (npc.inTransit && precision === 'approximate') {
            locationText = npc.regionName
                ? T('webview.world.npcHeadingRegion', { region: npc.regionName })
                : T('webview.world.npcHeadingVague');
        } else if (precision === 'approximate' && npc.regionName) {
            locationText = npc.regionName;
        } else {
            locationText = npc.locationName || npc.locationId || '?';
        }
        const transit = npc.inTransit && precision !== 'unknown'
            ? `<span class="world-npc-transit">${escapeHtml(T('webview.world.npcInTransit'))} T${escapeHtml(npc.arrivesTurn ?? '?')}</span>`
            : precision === 'unknown'
                ? `<span class="tag-item">${escapeHtml(T('webview.world.npcWhereaboutsUnknown'))}</span>`
                : `<span class="tag-item">${escapeHtml(T('webview.world.npcPresent'))}</span>`;
        const introduced = npc.introducedByName
            ? `<span class="tag-item" title="${escapeHtml(T('webview.world.npcIntroducedTip'))}">${escapeHtml(T('webview.world.npcIntroducedBy', { name: npc.introducedByName }))}</span>`
            : '';
        row.innerHTML = `
            <strong>${escapeHtml(npc.name || npc.npcId || '?')}</strong>
            <span>${escapeHtml(locationText)}</span>
            ${transit}
            ${introduced}
        `;
        if (precision !== 'unknown' && (npc.reason || npc.agenda)) {
            row.title = [npc.agenda, npc.reason].filter(Boolean).join(' / ');
            const note = document.createElement('div');
            note.className = 'world-npc-reason';
            note.textContent = npc.reason || npc.agenda;
            row.appendChild(note);
        }
        list.appendChild(row);
    });
}

// LW3: notable bonds between named NPCs (labels only; hearsay for the player).
const NPC_BOND_LABEL_KEY = {
    ally: 'webview.world.npcBondAlly',
    friend: 'webview.world.npcBondFriend',
    rival: 'webview.world.npcBondRival',
    enemy: 'webview.world.npcBondEnemy',
};
const NPC_BOND_ICON = { ally: '🤝', friend: '🙂', rival: '⚡', enemy: '⚔️' };
const NPC_MILESTONE_KEY = {
    sworn_allies: 'webview.world.milestoneSwornAllies',
    inseparable: 'webview.world.milestoneInseparable',
    bitter_enemies: 'webview.world.milestoneBitterEnemies',
    estranged: 'webview.world.milestoneEstranged',
    reconciled: 'webview.world.milestoneReconciled',
};
const NPC_MILESTONE_ICON = {
    sworn_allies: '🛡️', inseparable: '💠', bitter_enemies: '🗡️', estranged: '💔', reconciled: '🕊️',
};

// LW3-P: プレイヤー自身の絆(kind ラベルのみ)
const PLAYER_BOND_KEY = {
    trusted_companion: 'webview.world.playerBondCompanion',
    romance: 'webview.world.playerBondRomance',
    nemesis: 'webview.world.playerBondNemesis',
    feared: 'webview.world.playerBondFeared',
    estrangement: 'webview.world.playerBondEstrangement',
};
const PLAYER_BOND_ICON = {
    trusted_companion: '🤝', romance: '💗', nemesis: '⚔️', feared: '😨', estrangement: '💔',
};

function renderNpcBonds(bonds, playerBonds) {
    const section = document.getElementById('world-npc-bonds-details');
    const list = document.getElementById('world-npc-bonds-list');
    if (!section || !list) { return; }

    const entries = Array.isArray(bonds) ? bonds : [];
    const yours = Array.isArray(playerBonds) ? playerBonds : [];
    const visible = entries.length > 0 || yours.length > 0;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    yours.slice(0, 8).forEach((pb) => {
        if (!PLAYER_BOND_KEY[pb.kind]) { return; }
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        row.innerHTML = `
            <strong>${escapeHtml(T('webview.world.playerBondYou'))} × ${escapeHtml(pb.name || '?')}</strong>
            <span class="tag-item">${PLAYER_BOND_ICON[pb.kind] || '•'} ${escapeHtml(T(PLAYER_BOND_KEY[pb.kind]))}</span>
        `;
        list.appendChild(row);
    });
    entries.slice(0, 8).forEach((bond) => {
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        const icon = NPC_BOND_ICON[bond.label] || '•';
        const labelKey = NPC_BOND_LABEL_KEY[bond.label];
        const labelText = labelKey ? T(labelKey) : (bond.label || '?');
        let milestoneTag = '';
        if (bond.milestone && NPC_MILESTONE_KEY[bond.milestone]) {
            const mIcon = NPC_MILESTONE_ICON[bond.milestone] || '✦';
            milestoneTag = `<span class="tag-item" style="opacity:0.85;">${mIcon} ${escapeHtml(T(NPC_MILESTONE_KEY[bond.milestone]))}</span>`;
        }
        row.innerHTML = `
            <strong>${escapeHtml(bond.nameA || '?')} × ${escapeHtml(bond.nameB || '?')}</strong>
            <span class="tag-item">${icon} ${escapeHtml(labelText)}</span>
            ${milestoneTag}
        `;
        list.appendChild(row);
    });
}

function renderFactions(factions, factionStates, showReputation) {
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
            card.appendChild(buildSimBars(liveState, showReputation));
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

function buildSimBars(liveState, showReputation) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:0.35rem;display:flex;flex-direction:column;gap:0.15rem;';

    // パワーバー
    wrapper.appendChild(buildBar(T('webview.world.simPower'), liveState.power, 100, 'var(--vscode-charts-red, #c04040)'));

    // モラルバー（ある場合のみ）
    if (liveState.morale !== undefined) {
        wrapper.appendChild(buildBar(T('webview.world.simMorale'), liveState.morale, 100, 'var(--vscode-charts-blue, #4080c0)'));
    }

    if (showReputation) {
        wrapper.appendChild(buildReputationBar(liveState.playerReputation ?? 0));
    }

    return wrapper;
}

function buildReputationBar(rep) {
    const value = Math.max(-100, Math.min(100, Math.round(rep)));
    const display = value >= 0 ? `+${value}` : String(value);
    const barValue = (value + 100) / 2;
    const color = value >= 20
        ? 'var(--vscode-charts-green, #40a060)'
        : value <= -20
            ? 'var(--vscode-charts-red, #c04040)'
            : 'var(--vscode-descriptionForeground, #888)';
    const row = buildBar(T('webview.world.playerReputation'), barValue, 100, color);
    const valEl = row.querySelector('span:last-child');
    if (valEl) {
        valEl.textContent = display;
    }
    return row;
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

// ===== Campaign Kit: discoveries + hub job/rumor board (read-only) =====

const CAMPAIGN_DISCOVERY_STATUS_KEYS = ['unidentified', 'identified', 'appraised'];
const CAMPAIGN_DISCOVERY_KIND_KEYS = ['material', 'lore', 'social', 'route', 'threat', 'quest'];

function ensureCampaignKitStyles() {
    if (document.getElementById('world-campaign-kit-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-campaign-kit-styles';
    style.textContent = `
        .campaign-kit-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.45rem; }
        .campaign-kit-kit-name { font-weight: 600; font-size: 0.95em; }
        .campaign-kit-hub { font-size: 0.82em; opacity: 0.7; }
        .campaign-kit-section { margin-top: 0.55rem; }
        .campaign-kit-section-heading { font-size: 0.82em; font-weight: 600; opacity: 0.75; margin-bottom: 0.35rem; }
        .campaign-discovery-card, .campaign-job-card {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 0.45rem 0.55rem;
            margin-bottom: 0.4rem;
            background: rgba(0,0,0,0.15);
        }
        .campaign-discovery-title, .campaign-job-title { font-size: 0.9em; font-weight: 600; margin-bottom: 0.2rem; }
        .campaign-discovery-meta, .campaign-job-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; font-size: 0.78em; opacity: 0.85; margin-bottom: 0.25rem; }
        .campaign-badge {
            display: inline-block;
            padding: 0.05rem 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.15);
            font-size: 0.92em;
        }
        .campaign-badge.status-unidentified { color: var(--vscode-charts-yellow, #e8c547); }
        .campaign-badge.status-identified { color: var(--vscode-charts-blue, #6cb6ff); }
        .campaign-badge.status-appraised { color: var(--vscode-charts-green, #73c991); }
        .campaign-badge.condition-repaired { color: var(--vscode-charts-green, #73c991); }
        .campaign-badge.condition-upgraded { color: var(--vscode-charts-blue, #6cb6ff); }
        .campaign-badge.condition-damaged { color: var(--vscode-charts-red, #f14c4c); }
        .campaign-badge.kind-job { color: var(--vscode-charts-orange, #e8a838); }
        .campaign-badge.kind-rumor { color: var(--vscode-charts-purple, #b180d7); }
        .campaign-resource-list { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
        .campaign-resource-chip.level-ok { color: var(--vscode-charts-green, #73c991); }
        .campaign-resource-chip.level-low { color: var(--vscode-charts-yellow, #e8c547); }
        .campaign-resource-chip.level-out { color: var(--vscode-charts-red, #f14c4c); border-color: var(--vscode-charts-red, #f14c4c); }
        .campaign-job-summary { font-size: 0.86em; opacity: 0.9; margin-bottom: 0.3rem; }
        .campaign-job-actions, .campaign-discovery-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    `;
    document.head.appendChild(style);
}

function campaignKitT(section, key) {
    return T(`webview.world.campaign${section}.${key}`) || key;
}

function renderCampaignKitPanel(msg) {
    ensureCampaignKitStyles();
    const section = document.getElementById('world-campaign-kit-details');
    const panel = document.getElementById('world-campaign-kit-panel');
    if (!section || !panel) { return; }

    const kit = msg.campaignKit;
    const visible = msg.enableCampaignKit === true && kit;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const discoveries = Array.isArray(msg.campaignDiscoveries) ? msg.campaignDiscoveries : [];
    const jobBoard = Array.isArray(msg.campaignJobBoard) ? msg.campaignJobBoard : [];
    const resources = Array.isArray(msg.campaignResources) ? msg.campaignResources : [];
    const boardLabel = kit.loop?.jobBoardLabel || T('webview.world.campaignJobBoardFallback');

    panel.innerHTML = `
        <div class="campaign-kit-header">
            <div class="campaign-kit-kit-name">${escapeHtml(kit.kitName || kit.kitId || '')}</div>
            <div class="campaign-kit-hub">${escapeHtml(T('webview.world.campaignKitHub', { hub: kit.hubLocationName || kit.hubLocationId || '' }))}</div>
        </div>
    `;

    if (resources.length) {
        panel.appendChild(buildCampaignResourcesSection(resources));
    }
    const appraisalLabel = kit.loop?.appraisalLabel || T('webview.world.campaignAppraisalFallback');
    panel.appendChild(buildCampaignDiscoveriesSection(discoveries, appraisalLabel));
    panel.appendChild(buildCampaignJobBoardSection(jobBoard, boardLabel));
}

function buildCampaignResourcesSection(resources) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignResourcesTitle');
    el.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'campaign-resource-list';
    resources.forEach((r) => {
        const chip = document.createElement('span');
        const level = r.qty === 0 ? 'out' : r.qty <= 2 ? 'low' : 'ok';
        chip.className = `campaign-badge campaign-resource-chip level-${level}`;
        chip.textContent = `${r.name}: ${r.qty}`;
        list.appendChild(chip);
    });
    el.appendChild(list);
    return el;
}

function buildCampaignDiscoveriesSection(discoveries, appraisalLabel) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignDiscoveriesTitle');
    el.appendChild(heading);

    if (!discoveries.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.campaignDiscoveriesEmpty');
        el.appendChild(empty);
        return el;
    }

    discoveries.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'campaign-discovery-card';
        const statusLabel = campaignKitT('DiscoveryStatus', entry.status || 'unidentified');
        const kindLabel = campaignKitT('DiscoveryKind', entry.kind || 'material');
        const siteLine = entry.siteName
            ? `<span>${escapeHtml(T('webview.world.campaignDiscoverySite', { site: entry.siteName }))}</span>`
            : '';
        const conditionLine = entry.condition
            ? `<span class="campaign-badge condition-${escapeHtml(entry.condition)}">${escapeHtml(campaignKitT('DiscoveryCondition', entry.condition))}</span>`
            : '';
        const valueLine = typeof entry.suggestedValue === 'number'
            ? `<span>${escapeHtml(T('webview.world.campaignSuggestedValue', { value: String(entry.suggestedValue) }))}</span>`
            : '';
        card.innerHTML = `
            <div class="campaign-discovery-title">${escapeHtml(entry.label || entry.id)}</div>
            <div class="campaign-discovery-meta">
                <span class="campaign-badge status-${escapeHtml(entry.status || 'unidentified')}">${escapeHtml(statusLabel)}</span>
                <span class="campaign-badge">${escapeHtml(kindLabel)}</span>
                ${conditionLine}
                ${siteLine}
                ${valueLine}
            </div>
        `;
        if (entry.status === 'unidentified' || entry.status === 'identified') {
            const actions = document.createElement('div');
            actions.className = 'campaign-discovery-actions';
            const appraiseBtn = document.createElement('button');
            appraiseBtn.type = 'button';
            appraiseBtn.className = 'small-btn';
            appraiseBtn.textContent = entry.status === 'unidentified'
                ? T('webview.world.campaignAppraiseBtn')
                : T('webview.world.campaignAppraiseFinalizeBtn');
            appraiseBtn.addEventListener('click', () => {
                const key = entry.status === 'unidentified'
                    ? 'webview.world.campaignAppraiseInsertText'
                    : 'webview.world.campaignAppraiseFinalizeText';
                postWorldInsertChatText(T(key, {
                    label: entry.label || entry.id,
                    id: entry.id,
                    appraisal: appraisalLabel,
                }));
            });
            actions.appendChild(appraiseBtn);
            card.appendChild(actions);
        } else if (entry.status === 'appraised') {
            const actions = document.createElement('div');
            actions.className = 'campaign-discovery-actions';
            const sellBtn = document.createElement('button');
            sellBtn.type = 'button';
            sellBtn.className = 'small-btn primary';
            sellBtn.textContent = T('webview.world.campaignSellFindingBtn');
            sellBtn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.campaignSellFindingText', {
                    label: entry.label || entry.id,
                    id: entry.id,
                }));
            });
            actions.appendChild(sellBtn);
            card.appendChild(actions);
        }
        el.appendChild(card);
    });
    return el;
}

function buildCampaignJobBoardSection(jobBoard, boardLabel) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignJobBoardTitle', { label: boardLabel });
    el.appendChild(heading);

    if (!jobBoard.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.campaignJobBoardEmpty');
        el.appendChild(empty);
        return el;
    }

    jobBoard.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'campaign-job-card';
        const kindLabel = campaignKitT('JobKind', entry.kind || 'job');
        const metaParts = [];
        if (entry.siteName) {
            metaParts.push(`<span>${escapeHtml(T('webview.world.campaignDiscoverySite', { site: entry.siteName }))}</span>`);
        }
        if (entry.rewardHint) {
            metaParts.push(`<span>${escapeHtml(T('webview.world.campaignJobReward', { reward: entry.rewardHint }))}</span>`);
        }
        if (entry.factionId) {
            metaParts.push(`<span class="campaign-badge">${escapeHtml(T('webview.world.campaignJobClient', { faction: entry.factionId }))}</span>`);
        }
        card.innerHTML = `
            <div class="campaign-job-title">${escapeHtml(entry.title || entry.id)}</div>
            <div class="campaign-job-meta">
                <span class="campaign-badge kind-${escapeHtml(entry.kind || 'job')}">${escapeHtml(kindLabel)}</span>
                ${metaParts.join('')}
            </div>
            <div class="campaign-job-summary">${escapeHtml(entry.summary || '')}</div>
        `;
        const actions = document.createElement('div');
        actions.className = 'campaign-job-actions';
        const inquireBtn = document.createElement('button');
        inquireBtn.type = 'button';
        inquireBtn.className = 'small-btn';
        inquireBtn.textContent = T('webview.world.campaignJobInquireBtn');
        inquireBtn.addEventListener('click', () => {
            const siteSuffix = entry.siteName ? ` — target: ${entry.siteName}` : '';
            postWorldInsertChatText(T('webview.world.campaignJobInquireText', {
                title: entry.title || entry.id,
                summary: entry.summary || '',
                siteSuffix,
            }));
        });
        actions.appendChild(inquireBtn);
        {
            const acceptBtn = document.createElement('button');
            acceptBtn.type = 'button';
            acceptBtn.className = 'small-btn primary';
            acceptBtn.textContent = T('webview.world.campaignJobAcceptBtn');
            acceptBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'acceptCampaignJob', boardEntryId: entry.id });
            });
            actions.appendChild(acceptBtn);
        }
        card.appendChild(actions);
        el.appendChild(card);
    });
    return el;
}

// ===== Guild Master (G1): quest board panel (read-only) =====

const GUILD_STAT_KEYS = ['discipline', 'townFavor', 'facilities', 'safety', 'lore', 'renown'];

function guildT(section, key) {
    return T(`webview.world.guild${section}.${key}`) || key;
}

function renderGuildPanel(msg) {
    const section = document.getElementById('world-guild-details');
    const panel = document.getElementById('world-guild-panel');
    if (!section || !panel) { return; }

    const guild = msg.guild;
    const visible = msg.enableGuildMode === true && guild;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const name = escapeHtml(guild.hallLocationName || guild.hallLocationId || '');
    const rank = escapeHtml(guildT('Rank', guild.rank || 'chartered'));
    const dateLabel = escapeHtml(T('webview.world.guildWeekYear', { week: guild.calendarWeek, year: guild.calendarYear }));

    panel.innerHTML = `
        <div class="guild-header">
            <div class="guild-header-title">${name} <span class="guild-rank-badge">${rank}</span></div>
            <div class="guild-header-date">${dateLabel}</div>
        </div>
        <div class="guild-resource-row">
            <div class="guild-resource" title="${escapeHtml(T('webview.world.guildCoffers'))}">
                <span>💰</span><strong>${escapeHtml(guild.coffers ?? 0)}</strong>
            </div>
            <div class="guild-resource" title="${escapeHtml(T('webview.world.guildSupplies'))}">
                <span>📦</span><strong>${escapeHtml(guild.supplies ?? 0)}</strong>
            </div>
        </div>
        <div class="guild-stats-grid">
            ${GUILD_STAT_KEYS.map((key) => {
                const value = Math.max(0, Math.min(100, Number(guild[key]) || 0));
                return `
                    <div class="guild-stat-row">
                        <span class="guild-stat-label">${escapeHtml(guildT('Stat', key))}</span>
                        <div class="guild-stat-bar"><div class="guild-stat-fill" style="width:${value}%"></div></div>
                        <span class="guild-stat-value">${value}</span>
                    </div>
                `;
            }).join('')}
            <div class="guild-actions-left">${escapeHtml(T('webview.world.guildActionsLeft', { n: guild.weeklyActionsRemaining ?? 0 }))}</div>
        </div>
        ${guild.adventurers && guild.adventurers.length > 0
            ? `<div class="guild-adventurers-row">${guild.adventurers.map((a) =>
                `<span class="guild-adventurer-chip">${escapeHtml(a.npcId)} · ${escapeHtml(guildT('Class', a.klass))}</span>`
            ).join('')}</div>`
            : `<p class="empty-text">${escapeHtml(T('webview.world.guildNoAdventurers'))}</p>`}
    `;

    if (msg.enableGuildRequests === true && Array.isArray(guild.pendingRequests) && guild.pendingRequests.length > 0) {
        panel.appendChild(buildGuildBoardSection(guild));
    }

    if (msg.enableGuildParties === true && Array.isArray(guild.quests) && guild.quests.length > 0) {
        panel.appendChild(buildGuildQuestsSection(guild));
    } else if (msg.enableGuildParties === true && Array.isArray(guild.lastQuestReports) && guild.lastQuestReports.length > 0) {
        panel.appendChild(buildGuildQuestReportsOnly(guild));
    }
}

function buildGuildQuestReportsOnly(guild) {
    const el = document.createElement('div');
    el.className = 'guild-quests-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildQuestsTitle');
    el.appendChild(heading);
    const reports = document.createElement('div');
    reports.className = 'guild-quest-reports';
    reports.innerHTML = guild.lastQuestReports.map((r) => `<p>${escapeHtml(r)}</p>`).join('');
    el.appendChild(reports);
    return el;
}

function buildGuildQuestsSection(guild) {
    const el = document.createElement('div');
    el.className = 'guild-quests-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildQuestsTitle');
    el.appendChild(heading);

    const active = (guild.quests || []).filter((q) => q.status === 'active');
    if (active.length > 0) {
        const list = document.createElement('div');
        list.innerHTML = active.map((q) => `
            <div class="guild-quest-active-row">
                <span>${escapeHtml(q.id)} · ${escapeHtml(guildT('QuestKind', q.questKind))}</span>
                <span>${escapeHtml(T('webview.world.guildQuestWeeksLeft', { n: q.weeksRemaining ?? 0 }))}</span>
            </div>
        `).join('');
        el.appendChild(list);
    }

    const reports = guild.lastQuestReports || [];
    if (reports.length > 0) {
        const reportsWrap = document.createElement('div');
        reportsWrap.className = 'guild-quest-reports';
        reportsWrap.innerHTML = reports.map((r) => `<p>${escapeHtml(r)}</p>`).join('');
        el.appendChild(reportsWrap);
    }

    const awayIds = new Set(active.flatMap((q) => q.partyNpcIds || []));
    const accepted = (guild.quests || []).filter((q) => q.status === 'accepted');
    accepted.forEach((quest) => {
        el.appendChild(buildGuildAssignForm(quest, guild.adventurers || [], awayIds));
    });

    return el;
}

function buildGuildAssignForm(quest, adventurers, awayIds) {
    const card = document.createElement('div');
    card.className = 'guild-quest-card';
    card.innerHTML = `
        <div class="guild-quest-summary">
            <strong>${escapeHtml(quest.id)}</strong> — ${escapeHtml(guildT('QuestKind', quest.questKind))}
            (${escapeHtml(T('webview.world.guildQuestReward', { n: quest.rewardCoffers ?? 0 }))})
        </div>
    `;

    const available = adventurers.filter((a) => !awayIds.has(a.npcId));
    if (available.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.guildNoAdventurersAvailable');
        card.appendChild(empty);
        return card;
    }

    const form = document.createElement('div');
    form.className = 'guild-party-form';

    const checks = document.createElement('div');
    checks.className = 'guild-party-checks';
    const selected = new Set();
    available.forEach((a) => {
        const label = document.createElement('label');
        label.className = 'guild-party-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = a.npcId;
        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (selected.size >= 3) {
                    cb.checked = false;
                    return;
                }
                selected.add(a.npcId);
            } else {
                selected.delete(a.npcId);
            }
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${a.npcId} (${guildT('Class', a.klass)})`));
        checks.appendChild(label);
    });

    const weeksSelect = document.createElement('select');
    weeksSelect.className = 'guild-party-weeks';
    weeksSelect.setAttribute('aria-label', T('webview.world.guildQuestWeeks'));
    [1, 2, 3].forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = T('webview.world.guildQuestWeeksLeft', { n });
        weeksSelect.appendChild(opt);
    });

    const dispatchBtn = document.createElement('button');
    dispatchBtn.type = 'button';
    dispatchBtn.className = 'small-btn';
    dispatchBtn.textContent = T('webview.world.guildAssignBtn');
    dispatchBtn.addEventListener('click', () => {
        const npcIds = [...selected];
        if (npcIds.length === 0) { return; }
        postWorldInsertChatText(T('webview.world.guildAssignInsertText', {
            questId: quest.id,
            npcIds: npcIds.join(', '),
            weeks: weeksSelect.value,
        }));
    });

    form.appendChild(checks);
    form.appendChild(weeksSelect);
    form.appendChild(dispatchBtn);
    card.appendChild(form);
    return card;
}

function buildGuildBoardSection(guild) {
    const el = document.createElement('div');
    el.className = 'guild-board-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildBoardTitle');
    el.appendChild(heading);

    guild.pendingRequests.forEach((request) => {
        const card = document.createElement('div');
        card.className = 'guild-request-card';
        card.innerHTML = `
            <div class="guild-request-summary">
                <strong>${escapeHtml(request.clientArchetype)}</strong> — ${escapeHtml(request.summary)}
            </div>
        `;
        const actionsRow = document.createElement('div');
        actionsRow.className = 'guild-request-actions';

        const parleyBtn = document.createElement('button');
        parleyBtn.type = 'button';
        parleyBtn.className = 'small-btn';
        parleyBtn.textContent = T('webview.world.guildParleyBtn');
        parleyBtn.addEventListener('click', () => {
            postWorldInsertChatText(T('webview.world.guildParleyInsertText', {
                requestId: request.id,
                client: request.clientArchetype,
                summary: request.summary,
            }));
        });
        actionsRow.appendChild(parleyBtn);

        (request.rulings || []).forEach((ruling) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn guild-ruling-btn';
            btn.textContent = guildT('Ruling', ruling.rulingId);
            btn.title = ruling.label;
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.guildRulingInsertText', {
                    requestId: request.id,
                    client: request.clientArchetype,
                    summary: request.summary,
                    ruling: ruling.label,
                }));
            });
            actionsRow.appendChild(btn);
        });

        card.appendChild(actionsRow);
        el.appendChild(card);
    });
    return el;
}

// ===== Domain Mode (D3): F7 Audience / F8 Rivals / F9 Missions / F10 Battle =====

const DOMAIN_STAT_KEYS = ['publicOrder', 'popularSupport', 'agriculture', 'commerce', 'defense', 'culture', 'prestige'];
let _domainSelectedActions = [];

function domainT(section, key) {
    return T(`webview.world.domain${section}.${key}`) || key;
}

function renderDomainPanel(msg) {
    const section = document.getElementById('world-domain-details');
    const panel = document.getElementById('world-domain-panel');
    if (!section || !panel) { return; }

    const domain = msg.domain;
    const visible = msg.enableDomainMode === true && domain;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    panel.innerHTML = '';
    panel.appendChild(buildDomainHeader(domain));
    panel.appendChild(buildDomainResourceRow(domain));
    panel.appendChild(buildDomainStatsGrid(domain));

    if (domain.officers && domain.officers.length > 0) {
        panel.appendChild(buildDomainOfficersList(domain));
    }

    if (domain.monthlyActionsRemaining > 0 && Array.isArray(domain.actionCatalog) && domain.actionCatalog.length > 0) {
        panel.appendChild(buildDomainActionChips(domain));
    }

    if (msg.enableDomainAudience === true && Array.isArray(domain.pendingPetitions) && domain.pendingPetitions.length > 0) {
        panel.appendChild(buildDomainAudienceSection(domain));
    }

    if (msg.enableDomainRivals === true && domain.rival) {
        panel.appendChild(buildDomainRivalSection(domain.rival));
    }

    if (msg.enableDomainMissions === true) {
        panel.appendChild(buildDomainMissionsSection(domain));
    }

    if (msg.enableMassBattle === true && (domain.activeBattle || domain.lastBattleReport)) {
        panel.appendChild(buildDomainBattleSection(domain));
    }
}

function buildDomainHeader(domain) {
    const el = document.createElement('div');
    el.className = 'domain-header';
    const name = escapeHtml(domain.regionName || domain.controlledRegionId || '');
    const rank = escapeHtml(domainT('Rank', domain.rank || 'minor_lord'));
    const dateLabel = escapeHtml(T('webview.world.domainMonthYear', { month: domain.calendarMonth, year: domain.calendarYear }));
    el.innerHTML = `
        <div class="domain-header-title">${name} <span class="domain-rank-badge">${rank}</span></div>
        <div class="domain-header-date">${dateLabel}</div>
    `;
    return el;
}

function buildDomainResourceRow(domain) {
    const el = document.createElement('div');
    el.className = 'domain-resource-row';
    const items = [
        ['💰', domain.treasury, T('webview.world.domainTreasury')],
        ['🌾', domain.food, T('webview.world.domainFood')],
        ['⚔️', domain.troops, T('webview.world.domainTroops')],
    ];
    el.innerHTML = items.map(([icon, value, label]) => `
        <div class="domain-resource" title="${escapeHtml(label)}">
            <span class="domain-resource-icon">${icon}</span><strong>${escapeHtml(value ?? 0)}</strong>
        </div>
    `).join('');
    return el;
}

function buildDomainStatsGrid(domain) {
    const el = document.createElement('div');
    el.className = 'domain-stats-grid';
    el.innerHTML = DOMAIN_STAT_KEYS.map((key) => {
        const value = Math.max(0, Math.min(100, Number(domain[key]) || 0));
        return `
            <div class="domain-stat-row">
                <span class="domain-stat-label">${escapeHtml(domainT('Stat', key))}</span>
                <div class="domain-stat-bar"><div class="domain-stat-fill" style="width:${value}%"></div></div>
                <span class="domain-stat-value">${value}</span>
            </div>
        `;
    }).join('') + `<div class="domain-actions-left">${escapeHtml(T('webview.world.domainActionsLeft', { n: domain.monthlyActionsRemaining ?? 0 }))}</div>`;
    return el;
}

function buildDomainOfficersList(domain) {
    const el = document.createElement('div');
    el.className = 'domain-officers-row';
    const awayIds = new Set((domain.activeMissions || []).map((m) => m.officerNpcId));
    el.innerHTML = domain.officers.map((o) => {
        const away = awayIds.has(o.npcId);
        const roleLabel = escapeHtml(domainT('OfficerRole', o.role));
        const awayTag = away ? ` <span class="domain-officer-away">(${escapeHtml(T('webview.world.domainOfficerAway'))})</span>` : '';
        return `<span class="domain-officer-chip${away ? ' is-away' : ''}">${escapeHtml(o.npcId)} · ${roleLabel}${awayTag}</span>`;
    }).join('');
    return el;
}

function buildDomainActionChips(domain) {
    const wrap = document.createElement('div');
    wrap.className = 'domain-action-chips-wrap';

    const maxSelectable = domain.monthlyActionsRemaining ?? 2;
    _domainSelectedActions = _domainSelectedActions.filter((a) => domain.actionCatalog.includes(a));

    const chipsRow = document.createElement('div');
    chipsRow.className = 'domain-action-chips';
    domain.actionCatalog.forEach((actionId) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'domain-action-chip';
        chip.textContent = domainT('Action', actionId);
        chip.classList.toggle('is-selected', _domainSelectedActions.includes(actionId));
        chip.addEventListener('click', () => {
            const idx = _domainSelectedActions.indexOf(actionId);
            if (idx >= 0) {
                _domainSelectedActions.splice(idx, 1);
            } else if (_domainSelectedActions.length < maxSelectable) {
                _domainSelectedActions.push(actionId);
            }
            renderDomainPanel(_worldViewMsg);
        });
        chipsRow.appendChild(chip);
    });
    wrap.appendChild(chipsRow);

    const commitBtn = document.createElement('button');
    commitBtn.type = 'button';
    commitBtn.className = 'small-btn primary domain-commit-btn';
    commitBtn.textContent = T('webview.world.domainCommitBtn');
    commitBtn.disabled = _domainSelectedActions.length === 0;
    commitBtn.addEventListener('click', () => {
        const labels = _domainSelectedActions.map((a) => domainT('Action', a)).join(', ');
        postWorldInsertChatText(T('webview.world.domainCommitText', { actions: labels }));
        _domainSelectedActions = [];
        renderDomainPanel(_worldViewMsg);
    });
    wrap.appendChild(commitBtn);

    return wrap;
}

function buildDomainAudienceSection(domain) {
    const el = document.createElement('div');
    el.className = 'domain-audience-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainAudienceTitle');
    el.appendChild(heading);

    domain.pendingPetitions.forEach((petition) => {
        const card = document.createElement('div');
        card.className = 'domain-petition-card';
        card.innerHTML = `
            <div class="domain-petition-summary">
                <strong>${escapeHtml(petition.petitionerArchetype)}</strong> — ${escapeHtml(petition.summary)}
            </div>
        `;
        const rulingsRow = document.createElement('div');
        rulingsRow.className = 'domain-petition-rulings';
        (petition.rulings || []).forEach((ruling) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn domain-ruling-btn';
            btn.textContent = domainT('Ruling', ruling.rulingId);
            btn.title = ruling.label;
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.domainAudienceInsertText', {
                    petitioner: petition.petitionerArchetype,
                    summary: petition.summary,
                    ruling: ruling.label,
                }));
            });
            rulingsRow.appendChild(btn);
        });
        card.appendChild(rulingsRow);
        el.appendChild(card);
    });
    return el;
}

function buildDomainRivalSection(rival) {
    const el = document.createElement('div');
    el.className = 'domain-rival-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainRivalTitle');
    el.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'domain-rival-body';
    const name = escapeHtml(rival.regionName || rival.regionId || '');
    if (rival.disclosedStrength === undefined || rival.disclosedStance === undefined) {
        body.innerHTML = `<p class="empty-text">${escapeHtml(T('webview.world.domainRivalUnknown', { name }))}</p>`;
    } else {
        const stance = escapeHtml(domainT('RivalStance', rival.disclosedStance));
        body.innerHTML = `<p>${escapeHtml(T('webview.world.domainRivalKnown', { name, strength: rival.disclosedStrength, stance }))}</p>`;
    }
    el.appendChild(body);
    return el;
}

function buildDomainMissionsSection(domain) {
    const el = document.createElement('div');
    el.className = 'domain-missions-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainMissionsTitle');
    el.appendChild(heading);

    const active = domain.activeMissions || [];
    if (active.length > 0) {
        const list = document.createElement('div');
        list.className = 'domain-mission-list';
        list.innerHTML = active.map((m) => `
            <div class="domain-mission-row">
                <span>${escapeHtml(m.officerNpcId)} — ${escapeHtml(domainT('MissionKind', m.kind))}</span>
                <span class="domain-mission-months">${escapeHtml(T('webview.world.domainMissionMonthsLeft', { n: m.monthsRemaining }))}</span>
            </div>
        `).join('');
        el.appendChild(list);
    }

    const reports = domain.lastMissionReports || [];
    if (reports.length > 0) {
        const reportsWrap = document.createElement('div');
        reportsWrap.className = 'domain-mission-reports';
        reportsWrap.innerHTML = reports.map((r) => `<p class="domain-mission-report">${escapeHtml(r)}</p>`).join('');
        el.appendChild(reportsWrap);
    }

    const awayIds = new Set(active.map((m) => m.officerNpcId));
    const available = (domain.officers || []).filter((o) => !awayIds.has(o.npcId));
    if (available.length > 0) {
        el.appendChild(buildDomainDispatchForm(available));
    }

    return el;
}

const DOMAIN_MISSION_KINDS = ['espionage', 'trade_run', 'survey', 'parley'];

function buildDomainDispatchForm(availableOfficers) {
    const form = document.createElement('div');
    form.className = 'domain-dispatch-form';

    const officerSelect = document.createElement('select');
    officerSelect.className = 'domain-dispatch-select';
    officerSelect.setAttribute('aria-label', T('webview.world.domainDispatchOfficer'));
    availableOfficers.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.npcId;
        opt.textContent = `${o.npcId} (${domainT('OfficerRole', o.role)})`;
        officerSelect.appendChild(opt);
    });

    const kindSelect = document.createElement('select');
    kindSelect.className = 'domain-dispatch-select';
    kindSelect.setAttribute('aria-label', T('webview.world.domainDispatchKind'));
    DOMAIN_MISSION_KINDS.forEach((kind) => {
        const opt = document.createElement('option');
        opt.value = kind;
        opt.textContent = domainT('MissionKind', kind);
        kindSelect.appendChild(opt);
    });

    const monthsSelect = document.createElement('select');
    monthsSelect.className = 'domain-dispatch-select';
    monthsSelect.setAttribute('aria-label', T('webview.world.domainDispatchMonths'));
    [1, 2, 3].forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = T('webview.world.domainMissionMonthsLeft', { n });
        monthsSelect.appendChild(opt);
    });

    const dispatchBtn = document.createElement('button');
    dispatchBtn.type = 'button';
    dispatchBtn.className = 'small-btn domain-dispatch-btn';
    dispatchBtn.textContent = T('webview.world.domainDispatchBtn');
    dispatchBtn.addEventListener('click', () => {
        postWorldInsertChatText(T('webview.world.domainDispatchText', {
            officer: officerSelect.value,
            kind: domainT('MissionKind', kindSelect.value),
            months: monthsSelect.value,
        }));
    });

    form.appendChild(officerSelect);
    form.appendChild(kindSelect);
    form.appendChild(monthsSelect);
    form.appendChild(dispatchBtn);
    return form;
}

const DOMAIN_BATTLE_TACTICS = ['assault', 'hold', 'stratagem'];

function buildDomainBattleSection(domain) {
    const el = document.createElement('div');
    el.className = 'domain-battle-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainBattleTitle');
    el.appendChild(heading);

    const battle = domain.activeBattle;
    if (battle) {
        const name = escapeHtml(battle.opponentName || battle.opponentLabel || '');
        const progress = document.createElement('div');
        progress.className = 'domain-battle-progress';
        progress.innerHTML = `
            <p>${escapeHtml(T('webview.world.domainBattleRound', { round: battle.round, max: battle.maxRounds, name }))}</p>
            <div class="domain-battle-troops">
                <span>${escapeHtml(T('webview.world.domainBattleOurTroops', { n: battle.playerTroopsRemaining }))}</span>
                <span>${escapeHtml(T('webview.world.domainBattleEnemyTroops', { n: battle.enemyTroopsRemaining }))}</span>
            </div>
        `;
        el.appendChild(progress);

        const tacticsRow = document.createElement('div');
        tacticsRow.className = 'domain-battle-tactics';
        DOMAIN_BATTLE_TACTICS.forEach((tactic) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn domain-tactic-btn';
            btn.textContent = domainT('BattleTactic', tactic);
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.domainBattleTacticText', {
                    tactic: domainT('BattleTactic', tactic),
                }));
            });
            tacticsRow.appendChild(btn);
        });
        el.appendChild(tacticsRow);
    } else if (domain.lastBattleReport) {
        const report = document.createElement('p');
        report.className = 'domain-battle-report';
        report.textContent = domain.lastBattleReport;
        el.appendChild(report);
    }

    return el;
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
            : q.source === 'campaign'
                ? T('webview.world.questSourceCampaign')
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
