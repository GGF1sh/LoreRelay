/* global document, window, vscode */

// ---------------------------------------------------------------------------
// Settlement isometric view (M3b) — read-only Canvas renderer for settlementView
// ---------------------------------------------------------------------------

let _settlementWorldMsg = null;
let _settlementPan = { x: 0, y: 0 };
let _settlementZoom = 1;
let _settlementDrag = null;
let _settlementDidDrag = false;
let _settlementHits = [];
let _settlementSelected = null;
let _lastSettlementId = null;
let _lastSettlementLayerId = null;
let _settlementControlsReady = false;
let _settlementExpandHoverPreview = null;
let _lastSettlementExpandLayerId = null;

const SETTLEMENT_EXPAND_PROFILE_I18N_KEY = {
    cellar: 'webview.world.settlementExpandProfileCellar',
    waterworks: 'webview.world.settlementExpandProfileWaterworks',
    shelter: 'webview.world.settlementExpandProfileShelter',
    ruins: 'webview.world.settlementExpandProfileRuins',
    roof: 'webview.world.settlementExpandProfileRoof',
    watchtower: 'webview.world.settlementExpandProfileWatchtower',
    generic: 'webview.world.settlementExpandProfileGeneric',
};
const SETTLEMENT_EXPAND_PROFILE_FALLBACK = {
    cellar: 'Request cellar',
    waterworks: 'Request waterworks',
    shelter: 'Request shelter',
    ruins: 'Request ruins excavation',
    roof: 'Request roof access',
    watchtower: 'Request watch platform',
    generic: 'Request expansion',
};

const SETTLEMENT_TILE_W = 32;
const SETTLEMENT_TILE_H = 16;
const SETTLEMENT_LAYER_HEIGHT = 12;
const SETTLEMENT_ZOOM_MIN = 0.5;
const SETTLEMENT_ZOOM_MAX = 3;
const SETTLEMENT_ZOOM_STEP = 0.15;
const SETTLEMENT_HIT_RADIUS_PX = 12;
const SETTLEMENT_PREFS_PREFIX = 'lorerelay.settlementView.';

const SETTLEMENT_TILE_COLORS = {
    floor: { top: '#5a6270', left: '#4a5260', right: '#6a7280', glyph: '.' },
    wall: { top: '#707880', left: '#505860', right: '#808890', glyph: '#' },
    gate: { top: '#b09060', left: '#907040', right: '#c0a070', glyph: 'G' },
    market: { top: '#d8b060', left: '#b89040', right: '#e8c070', glyph: 'M' },
    workshop: { top: '#8090a8', left: '#607088', right: '#90a0b8', glyph: 'W' },
    stockpile: { top: '#a89868', left: '#887848', right: '#b8a878', glyph: 'S' },
    quarters: { top: '#68a870', left: '#488850', right: '#78b880', glyph: 'Q' },
    clinic: { top: '#58b0a8', left: '#389088', right: '#68c0b8', glyph: 'C' },
    barracks: { top: '#a86050', left: '#884030', right: '#b87060', glyph: 'B' },
    shrine: { top: '#9878c0', left: '#7858a0', right: '#a888d0', glyph: 'H' },
    water: { top: '#5090d0', left: '#3070b0', right: '#60a0e0', glyph: '~' },
    ruins: { top: '#808080', left: '#606060', right: '#909090', glyph: 'R' },
    hazard: { top: '#d05050', left: '#b03030', right: '#e06060', glyph: '!' },
    empty: { top: '#404850', left: '#303840', right: '#505860', glyph: ' ' },
    unknown: { top: '#686878', left: '#505058', right: '#787888', glyph: '?' },
};

const SETTLEMENT_MARKER_COLORS = {
    resident: '#6ecf8a',
    visitor: '#9aa8b8',
    merchant: '#e8c87a',
    project: '#80a8e0',
    incident: '#e07070',
    stock_low: '#e8b050',
    structure_note: '#b8c4d0',
    player: '#ffd75f',
};

const SETTLEMENT_MARKER_GLYPHS = {
    resident: 'o',
    visitor: 'v',
    merchant: '$',
    project: '*',
    incident: '!',
    stock_low: 'L',
    structure_note: 'n',
    player: '@',
};

// Visual polish: per-code extrusion height (px at zoom 1). The left/right face
// colors in SETTLEMENT_TILE_COLORS were previously unused — the "isometric"
// view drew flat top diamonds only. Heights are display-only (hit testing and
// the M4c ghost preview still use the flat base position).
const SETTLEMENT_TILE_ELEVATION = {
    floor: 2,
    wall: 16,
    gate: 12,
    market: 8,
    workshop: 9,
    stockpile: 6,
    quarters: 9,
    clinic: 9,
    barracks: 10,
    shrine: 12,
    water: 0,
    ruins: 5,
    hazard: 3,
    empty: 0,
    unknown: 4,
};

let _settlementHover = null;

function settlementPrefsKey(settlementId, suffix) {
    return `${SETTLEMENT_PREFS_PREFIX}${settlementId}.${suffix}`;
}

function loadSettlementViewPrefs(settlementId) {
    if (!settlementId) { return; }
    try {
        const panRaw = localStorage.getItem(settlementPrefsKey(settlementId, 'pan'));
        const zoomRaw = localStorage.getItem(settlementPrefsKey(settlementId, 'zoom'));
        if (panRaw) {
            const pan = JSON.parse(panRaw);
            if (typeof pan.x === 'number' && typeof pan.y === 'number') {
                _settlementPan = { x: pan.x, y: pan.y };
            }
        }
        if (zoomRaw) {
            const zoom = Number(zoomRaw);
            if (Number.isFinite(zoom)) {
                _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, zoom));
            }
        }
    } catch { /* ignore */ }
}

function saveSettlementViewPrefs(settlementId) {
    if (!settlementId) { return; }
    try {
        localStorage.setItem(settlementPrefsKey(settlementId, 'pan'), JSON.stringify(_settlementPan));
        localStorage.setItem(settlementPrefsKey(settlementId, 'zoom'), String(_settlementZoom));
    } catch { /* ignore */ }
}

function resetSettlementViewTransform() {
    _settlementPan = { x: 0, y: 0 };
    _settlementZoom = 1;
}

function getMobileBaseInterior(msg) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return null; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return null; }
    return interior;
}

function getSettlementSnapshot() {
    const msg = _settlementWorldMsg;
    const interior = getMobileBaseInterior(msg);
    if (interior && interior.settlementView) {
        return interior.settlementView;
    }
    return msg && msg.settlementView ? msg.settlementView : null;
}

/** M4c: read-only ghost previews computed by the host (applyExpandLayerToLayout). Never written by the Webview. */
function getSettlementExpansionPreviews() {
    const msg = _settlementWorldMsg;
    const interior = getMobileBaseInterior(msg);
    if (interior && Array.isArray(interior.settlementExpansionPreviews)) {
        return interior.settlementExpansionPreviews;
    }
    return msg && Array.isArray(msg.settlementExpansionPreviews) ? msg.settlementExpansionPreviews : [];
}

function renderMobileBaseInteriorBanner(msg, view) {
    const banner = document.getElementById('world-settlement-mobile-base-banner');
    if (!banner) { return; }
    const interior = getMobileBaseInterior(msg);
    const show = Boolean(
        interior
        && interior.hasCanvas
        && view
        && view.settlementId === interior.settlementId
    );
    if (!show) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }
    const vars = { vehicle: interior.vehicleName, mode: interior.mode };
    banner.textContent = typeof T === 'function'
        ? T('webview.mobileBase.interiorBanner', vars)
        : `Mobile base interior — ${interior.vehicleName} (${interior.mode})`;
    banner.classList.remove('hidden');
}

function settlementExpandProfileLabel(profile) {
    const key = SETTLEMENT_EXPAND_PROFILE_I18N_KEY[profile];
    const translated = key && typeof T === 'function' ? T(key) : '';
    return translated && translated !== key ? translated : (SETTLEMENT_EXPAND_PROFILE_FALLBACK[profile] || profile);
}

function buildSettlementExpandRequestText(layerId, profile) {
    const reasonKey = 'webview.world.settlementExpandReasonDefault';
    const reason = typeof T === 'function'
        ? T(reasonKey, { profile: settlementExpandProfileLabel(profile) })
        : `Player requested ${profile} expansion from Settlement view.`;
    const textKey = 'webview.world.settlementExpandRequestText';
    const vars = { layerId, profile, reason };
    if (typeof T === 'function') {
        const translated = T(textKey, vars);
        if (translated !== textKey) { return translated; }
    }
    return `[Settlement expansion request]\nPlease consider emitting turn_result.settlementOps.expand_layer for this settlement.\nlayerId: ${layerId}\nprofile: ${profile}\nreason: ${reason}\nDo not add layers beyond z1/z0/z-1/z-2.`;
}

// Cosmetic fallback only (mirrors settlementViewCore.ts LAYER_LABELS) for the
// rare case a layer is missing from view.layers entirely (never built yet),
// so the expand-panel heading reads as a name instead of a raw layer id.
const SETTLEMENT_LAYER_NAME_FALLBACK = {
    z1: 'Upper deck',
    z0: 'Ground',
    'z-1': 'Cellar',
    'z-2': 'Deep ruins',
};

function settlementLayerDisplayLabel(view, layerId) {
    const layers = Array.isArray(view?.layers) ? view.layers : [];
    const found = layers.find((l) => l.id === layerId);
    return found?.label || SETTLEMENT_LAYER_NAME_FALLBACK[layerId] || layerId;
}

function renderSettlementExpandPanel(view, msg) {
    const panel = document.getElementById('world-settlement-expand-panel');
    const buttonsEl = document.getElementById('world-settlement-expand-buttons');
    const layerLabelEl = document.getElementById('world-settlement-expand-layer-label');
    if (!panel || !buttonsEl) { return; }

    const enabled = Boolean(msg && (msg.enableSettlementMode === true || getMobileBaseInterior(msg)));
    const previews = enabled ? getSettlementExpansionPreviews() : [];
    const layerId = view ? view.layerId : null;
    const forLayer = layerId ? previews.filter((p) => p && p.layerId === layerId) : [];

    if (!enabled || !view || !forLayer.length) {
        panel.classList.add('hidden');
        buttonsEl.innerHTML = '';
        if (layerLabelEl) { layerLabelEl.textContent = ''; }
        _settlementExpandHoverPreview = null;
        return;
    }

    if (layerId !== _lastSettlementExpandLayerId) {
        _lastSettlementExpandLayerId = layerId;
        _settlementExpandHoverPreview = forLayer[0];
    } else if (_settlementExpandHoverPreview && !forLayer.some((p) => p.profile === _settlementExpandHoverPreview.profile)) {
        _settlementExpandHoverPreview = forLayer[0];
    }

    if (layerLabelEl) {
        const layerLabel = settlementLayerDisplayLabel(view, layerId);
        layerLabelEl.textContent = typeof T === 'function'
            ? T('webview.world.settlementExpandForLayer', { layer: layerLabel })
            : `Preview options for ${layerLabel}`;
    }

    const activeProfile = _settlementExpandHoverPreview ? _settlementExpandHoverPreview.profile : null;
    buttonsEl.innerHTML = forLayer.map((preview) => {
        const isActive = preview.profile === activeProfile;
        const cls = isActive ? 'world-settlement-expand-btn is-active' : 'world-settlement-expand-btn';
        return `<button type="button" class="${cls}" aria-pressed="${isActive ? 'true' : 'false'}" data-expand-layer="${escapeSettlementHtml(preview.layerId)}" data-expand-profile="${escapeSettlementHtml(preview.profile)}">${escapeSettlementHtml(settlementExpandProfileLabel(preview.profile))}</button>`;
    }).join('');
    panel.classList.remove('hidden');

    buttonsEl.querySelectorAll('.world-settlement-expand-btn').forEach((btn) => {
        const profile = btn.getAttribute('data-expand-profile');
        const preview = forLayer.find((p) => p.profile === profile);
        if (!preview) { return; }
        const showGhost = () => {
            _settlementExpandHoverPreview = preview;
            drawSettlementIsometric();
        };
        btn.addEventListener('mouseenter', showGhost);
        btn.addEventListener('focus', showGhost);
        btn.addEventListener('click', () => {
            if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                    type: 'insertChatText',
                    text: buildSettlementExpandRequestText(preview.layerId, preview.profile),
                });
            }
        });
    });
}

function drawSettlementGhostPreview(ctx, view, originX, originY) {
    const preview = _settlementExpandHoverPreview;
    if (!preview || !view || preview.layerId !== view.layerId) { return; }

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 3]);
    const tiles = Array.isArray(preview.tiles) ? preview.tiles : [];
    for (const tile of tiles) {
        const { sx, sy } = isoProject(tile.x, tile.y, tile.z, originX, originY);
        const colors = SETTLEMENT_TILE_COLORS[tile.code] || SETTLEMENT_TILE_COLORS.unknown;
        drawIsoDiamond(ctx, sx, sy, colors, colors.glyph, SETTLEMENT_GHOST_STROKE);
    }
    ctx.setLineDash([]);
    const markers = Array.isArray(preview.markers) ? preview.markers : [];
    for (const marker of markers) {
        const { sx, sy } = isoProject(marker.x, marker.y, marker.z, originX, originY);
        drawIsoMarker(ctx, sx, sy, marker.kind);
    }
    ctx.restore();
}

function isoProject(x, y, z, originX, originY) {
    return {
        sx: originX + (x - y) * (SETTLEMENT_TILE_W / 2),
        sy: originY + (x + y) * (SETTLEMENT_TILE_H / 2) - z * SETTLEMENT_LAYER_HEIGHT,
    };
}

function drawIsoDiamond(ctx, sx, sy, colors, glyph, strokeOverride) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh);
    ctx.lineTo(sx + hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx - hw, sy);
    ctx.closePath();
    ctx.fillStyle = colors.top;
    ctx.fill();
    ctx.strokeStyle = strokeOverride ? strokeOverride.color : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = strokeOverride ? strokeOverride.width : 1;
    ctx.stroke();
    if (glyph && glyph !== ' ') {
        ctx.font = '600 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,12,20,0.9)';
        ctx.fillText(glyph, sx, sy + 1);
    }
}

/**
 * Extruded isometric block: side faces from the flat base at `sy` up to the
 * top face at `sy - elev`, then the lit top diamond with a sun-side edge
 * highlight. `sy` stays the logical (hit-test / marker) position.
 */
function drawIsoBlock(ctx, sx, sy, colors, glyph, elev) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    const topY = sy - elev;

    if (elev > 0) {
        // Left face (in shade)
        ctx.beginPath();
        ctx.moveTo(sx - hw, topY);
        ctx.lineTo(sx, topY + hh);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx - hw, sy);
        ctx.closePath();
        ctx.fillStyle = colors.left;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.30)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Right face (half light)
        ctx.beginPath();
        ctx.moveTo(sx + hw, topY);
        ctx.lineTo(sx, topY + hh);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx + hw, sy);
        ctx.closePath();
        ctx.fillStyle = colors.right;
        ctx.fill();
        ctx.stroke();

        // Ambient-occlusion line where the block meets the ground
        ctx.beginPath();
        ctx.moveTo(sx - hw, sy);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx + hw, sy);
        ctx.strokeStyle = 'rgba(0,0,0,0.40)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Top face
    ctx.beginPath();
    ctx.moveTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx - hw, topY);
    ctx.closePath();
    ctx.fillStyle = colors.top;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sun-side rim light on the two upper edges of the top face
    ctx.beginPath();
    ctx.moveTo(sx - hw, topY);
    ctx.lineTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (glyph && glyph !== ' ') {
        ctx.font = '600 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,12,20,0.9)';
        ctx.fillText(glyph, sx, topY + 1);
    }
}

/** Water reads better flat and glossy: translucent fill + two ripple highlights. */
function drawIsoWater(ctx, sx, sy, colors) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh);
    ctx.lineTo(sx + hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx - hw, sy);
    ctx.closePath();
    ctx.fillStyle = colors.top;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,240,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.45, sy - hh * 0.15);
    ctx.quadraticCurveTo(sx - hw * 0.1, sy - hh * 0.45, sx + hw * 0.3, sy - hh * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.25, sy + hh * 0.3);
    ctx.quadraticCurveTo(sx + hw * 0.15, sy + hh * 0.05, sx + hw * 0.45, sy + hh * 0.25);
    ctx.stroke();
}

/** Accent outline on the (possibly elevated) top face for hover / selection. */
function drawIsoHighlight(ctx, sx, sy, elev, color, width) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    const topY = sy - (elev || 0);
    ctx.beginPath();
    ctx.moveTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx - hw, topY);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

/** Bright, high-contrast dashed outline so the ghost preview reads clearly against any tile color. */
const SETTLEMENT_GHOST_STROKE = { color: 'rgba(255,255,255,0.9)', width: 1.5 };

function drawIsoMarker(ctx, sx, sy, kind) {
    const color = SETTLEMENT_MARKER_COLORS[kind] || '#b8c4d0';
    const glyph = SETTLEMENT_MARKER_GLYPHS[kind] || '+';
    const bubbleY = sy - SETTLEMENT_TILE_H;

    // Grounding: soft contact shadow + stem from the tile up to the bubble
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx, sy - 1);
    ctx.lineTo(sx, bubbleY + 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Player marker gets a halo so "you are here" pops like a DF cursor
    if (kind === 'player') {
        ctx.beginPath();
        ctx.arc(sx, bubbleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,215,95,0.22)';
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sx, bubbleY, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '600 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(glyph, sx, bubbleY + 1);
}

/** Atmospheric canvas backdrop: vertical sky gradient + soft glow behind the settlement + vignette. */
function drawSettlementBackdrop(ctx, cssWidth, cssHeight, pivotX, pivotY) {
    const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
    sky.addColorStop(0, '#101527');
    sky.addColorStop(0.6, '#0a0e1c');
    sky.addColorStop(1, '#05070d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowR = Math.max(cssWidth, cssHeight) * 0.55;
    const glow = ctx.createRadialGradient(pivotX, pivotY, 0, pivotX, pivotY, glowR);
    glow.addColorStop(0, 'rgba(90, 130, 200, 0.10)');
    glow.addColorStop(1, 'rgba(90, 130, 200, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
}

function drawSettlementVignette(ctx, cssWidth, cssHeight) {
    const r = Math.max(cssWidth, cssHeight);
    const v = ctx.createRadialGradient(
        cssWidth / 2, cssHeight / 2, r * 0.45,
        cssWidth / 2, cssHeight / 2, r * 0.85
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
}

function computeSettlementOrigin(canvas, view) {
    const boundsW = (view.width + view.height) * (SETTLEMENT_TILE_W / 2);
    const boundsH = (view.width + view.height) * (SETTLEMENT_TILE_H / 2) + SETTLEMENT_LAYER_HEIGHT * 2;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    const originX = cssWidth / 2 - boundsW / 2 + _settlementPan.x;
    const originY = cssHeight / 4 - boundsH / 4 + _settlementPan.y;
    return { originX, originY, boundsW, boundsH, cssWidth, cssHeight };
}

/** Shared fit-to-bounds math for the manual "Fit" button and the automatic per-layer recenter. */
function applySettlementFitTransform(view, canvas) {
    if (!view || !canvas || !canvas.clientWidth) { return false; }
    const boundsW = (view.width + view.height) * (SETTLEMENT_TILE_W / 2);
    const boundsH = (view.width + view.height) * (SETTLEMENT_TILE_H / 2) + SETTLEMENT_LAYER_HEIGHT * 2;
    const pad = 24;
    const scaleX = (canvas.clientWidth - pad) / Math.max(1, boundsW);
    const scaleY = (canvas.clientHeight - pad) / Math.max(1, boundsH);
    _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, Math.min(scaleX, scaleY)));
    _settlementPan = { x: 0, y: 0 };
    return true;
}

function fitSettlementViewToCanvas() {
    const view = getSettlementSnapshot();
    const canvas = document.getElementById('world-settlement-canvas');
    if (!applySettlementFitTransform(view, canvas)) { return; }
    const settlementId = view.settlementId;
    if (settlementId) { saveSettlementViewPrefs(settlementId); }
}

function hideSettlementTooltip() {
    const el = document.getElementById('world-settlement-tooltip');
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

function showSettlementTooltip(hit, clientX, clientY) {
    const el = document.getElementById('world-settlement-tooltip');
    const stage = document.getElementById('world-settlement-stage');
    if (!el || !stage || !hit) { return; }
    const parts = [hit.label || ''];
    if (hit.detail) { parts.push(hit.detail); }
    el.textContent = parts.filter(Boolean).join(' · ');
    el.classList.remove('hidden');
    const rect = stage.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left + 8, 4), rect.width - 4);
    const top = Math.min(Math.max(clientY - rect.top - 28, 4), rect.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function renderSettlementDetailPanel(hit) {
    const panel = document.getElementById('world-settlement-detail');
    if (!panel) { return; }
    if (!hit) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    const title = hit.kind
        ? `${hit.kind}: ${hit.label || ''}`
        : (hit.label || 'Tile');
    const detail = hit.detail ? `<p class="world-settlement-detail-body">${escapeSettlementHtml(hit.detail)}</p>` : '';
    panel.innerHTML = `<h4>${escapeSettlementHtml(title)}</h4>${detail}`;
    panel.classList.remove('hidden');
}

function updateSettlementLayerNote(view) {
    const note = document.getElementById('world-settlement-layer-note');
    if (!note) { return; }
    const expandPanel = document.getElementById('world-settlement-expand-panel');
    const expandShown = Boolean(expandPanel && !expandPanel.classList.contains('hidden'));
    const tiles = Array.isArray(view?.tiles) ? view.tiles : [];
    const markers = Array.isArray(view?.markers) ? view.markers : [];
    const isEmpty = !expandShown && tiles.length === 0 && markers.length === 0;
    note.classList.toggle('hidden', !isEmpty);
    if (isEmpty) {
        note.textContent = typeof T === 'function'
            ? T('webview.world.settlementLayerEmpty')
            : 'This layer has no tiles or markers yet.';
    }
}

function escapeSettlementHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderSettlementMarkerFallback(view) {
    const list = document.getElementById('world-settlement-marker-fallback');
    if (!list) { return; }
    const markers = Array.isArray(view.markers) ? view.markers : [];
    if (!markers.length) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
    }
    const items = markers.slice(0, 40).map((m) => {
        const detail = m.detail ? ` — ${escapeSettlementHtml(m.detail)}` : '';
        return `<li><button type="button" class="world-settlement-marker-item" data-marker-id="${escapeSettlementHtml(m.id)}">${escapeSettlementHtml(m.kind)}: ${escapeSettlementHtml(m.label)}${detail}</button></li>`;
    }).join('');
    list.innerHTML = `<span class="world-settlement-marker-fallback-title">${typeof T === 'function' ? T('webview.world.settlementMarkers') : 'Markers'}</span><ul>${items}</ul>`;
    list.classList.remove('hidden');
    list.querySelectorAll('.world-settlement-marker-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-marker-id');
            const marker = markers.find((m) => m.id === id);
            if (marker) {
                _settlementSelected = { type: 'marker', id: marker.id, label: marker.label, detail: marker.detail, kind: marker.kind };
                renderSettlementDetailPanel(_settlementSelected);
            }
        });
    });
}

function hitTestSettlement(clientX, clientY, canvas) {
    if (!canvas || !_settlementHits.length) { return null; }
    const rect = canvas.getBoundingClientRect();
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    // Hit positions are stored in pre-zoom content coordinates, but the mouse
    // arrives in screen coordinates. Invert the draw transform (scale around
    // the content pivot) so hovering/clicking stays accurate at any zoom.
    const view = getSettlementSnapshot();
    if (view && _settlementZoom !== 1) {
        const { originX, originY, boundsH } = computeSettlementOrigin(canvas, view);
        const pivotX = originX + ((view.width - view.height) / 2) * (SETTLEMENT_TILE_W / 2);
        const pivotY = originY + boundsH / 2;
        x = pivotX + (x - pivotX) / _settlementZoom;
        y = pivotY + (y - pivotY) / _settlementZoom;
    }
    let best = null;
    let bestDist = SETTLEMENT_HIT_RADIUS_PX + 1;
    for (const hit of _settlementHits) {
        const dist = Math.hypot(hit.px - x, hit.py - y);
        if (dist <= SETTLEMENT_HIT_RADIUS_PX && dist < bestDist) {
            bestDist = dist;
            best = hit;
        }
    }
    return best;
}

function syncSettlementLayerButtons(view) {
    const layerId = view?.layerId || 'z0';
    const layers = Array.isArray(view?.layers) ? view.layers : [];
    const layerById = new Map(layers.map((l) => [l.id, l]));
    const unbuiltTitle = typeof T === 'function'
        ? T('webview.world.settlementLayerUnbuilt')
        : 'Not built yet — select to preview expansion options';
    document.querySelectorAll('[data-settlement-layer]').forEach((btn) => {
        const layer = btn.getAttribute('data-settlement-layer');
        btn.classList.toggle('is-active', layer === layerId);
        btn.setAttribute('aria-pressed', layer === layerId ? 'true' : 'false');
        const known = layerById.get(layer);
        const missing = layers.length > 0 && !known;
        btn.classList.toggle('is-missing', missing);
        btn.title = missing ? unbuiltTitle : (known?.label || '');
    });
}

function drawSettlementIsometric() {
    const canvas = document.getElementById('world-settlement-canvas');
    const empty = document.getElementById('world-settlement-empty');
    const stage = document.getElementById('world-settlement-stage');
    if (!canvas || !stage) { return; }

    const msg = _settlementWorldMsg;
    const view = getSettlementSnapshot();
    if (empty) {
        const showEmpty = !view;
        empty.classList.toggle('hidden', !showEmpty);
        if (showEmpty) {
            empty.textContent = typeof T === 'function'
                ? T('webview.world.settlementEmpty')
                : 'No settlement view yet. Enable Settlement Mode and add settlement_state.json.';
        }
    }
    stage.classList.toggle('hidden', !view);
    renderMobileBaseInteriorBanner(msg, view);
    if (!view) {
        hideSettlementTooltip();
        renderSettlementDetailPanel(null);
        const list = document.getElementById('world-settlement-marker-fallback');
        if (list) {
            list.innerHTML = '';
            list.classList.add('hidden');
        }
        renderSettlementExpandPanel(null, msg);
        const note = document.getElementById('world-settlement-layer-note');
        if (note) { note.classList.add('hidden'); }
        return;
    }

    if (view.settlementId !== _lastSettlementId) {
        _lastSettlementId = view.settlementId;
        _lastSettlementLayerId = view.layerId;
        resetSettlementViewTransform();
        loadSettlementViewPrefs(view.settlementId);
        _settlementSelected = null;
        _settlementExpandHoverPreview = null;
        _lastSettlementExpandLayerId = null;
    } else if (view.layerId !== _lastSettlementLayerId) {
        // M3b/M4c polish: switching layers keeps a settlement-wide pan/zoom pref,
        // which can leave a differently-sized layer mostly out of frame. Recenter
        // transiently (no localStorage write) rather than persisting a surprise view.
        _lastSettlementLayerId = view.layerId;
        applySettlementFitTransform(view, canvas);
    }

    syncSettlementLayerButtons(view);
    renderSettlementMarkerFallback(view);
    renderSettlementExpandPanel(view, msg);
    updateSettlementLayerNote(view);

    const panelWidth = stage.clientWidth;
    if (!panelWidth) { return; }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = stage.clientWidth;
    const cssHeight = Math.max(180, Math.min(420, cssWidth * 0.72));
    stage.style.minHeight = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const { originX, originY, boundsH } = computeSettlementOrigin(canvas, view);
    const zoom = _settlementZoom;
    // Zoom must pivot on the content's own geometric center (not the canvas
    // center — the isometric origin already places tile (0,0) asymmetrically
    // within the canvas). Otherwise any zoom != 1 (including "Fit") drifts the
    // whole layer toward a corner instead of scaling in place.
    const pivotX = originX + ((view.width - view.height) / 2) * (SETTLEMENT_TILE_W / 2);
    const pivotY = originY + boundsH / 2;

    drawSettlementBackdrop(ctx, cssWidth, cssHeight, pivotX, pivotY);

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.scale(zoom, zoom);
    ctx.translate(-pivotX, -pivotY);

    _settlementHits = [];
    const tiles = Array.isArray(view.tiles) ? [...view.tiles] : [];
    // Painter's order for extruded blocks: back-to-front by (x+y), then lower
    // z first so raised sub-layers stack correctly.
    tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y) || (a.z || 0) - (b.z || 0) || a.x - b.x);

    for (const tile of tiles) {
        const { sx, sy } = isoProject(tile.x, tile.y, tile.z, originX, originY);
        const colors = SETTLEMENT_TILE_COLORS[tile.code] || SETTLEMENT_TILE_COLORS.unknown;
        const elev = SETTLEMENT_TILE_ELEVATION[tile.code] ?? 4;
        if (tile.code === 'water') {
            drawIsoWater(ctx, sx, sy, colors);
        } else {
            drawIsoBlock(ctx, sx, sy, colors, colors.glyph, elev);
        }
        _settlementHits.push({
            type: 'tile',
            px: sx,
            py: sy,
            elev,
            label: tile.label,
            detail: tile.code,
            code: tile.code,
        });
    }

    const markers = Array.isArray(view.markers) ? view.markers : [];
    for (const marker of markers) {
        const { sx, sy } = isoProject(marker.x, marker.y, marker.z, originX, originY);
        drawIsoMarker(ctx, sx, sy, marker.kind);
        _settlementHits.push({
            type: 'marker',
            id: marker.id,
            kind: marker.kind,
            px: sx,
            py: sy - SETTLEMENT_TILE_H,
            elev: 0,
            label: marker.label,
            detail: marker.detail,
        });
    }

    drawSettlementGhostPreview(ctx, view, originX, originY);

    // Hover / selection outlines on top of everything (accent + gold)
    if (_settlementHover && _settlementHover.type === 'tile') {
        drawIsoHighlight(ctx, _settlementHover.px, _settlementHover.py, _settlementHover.elev, 'rgba(139,183,255,0.9)', 1.5);
    }
    const selectedHit = _settlementSelected
        ? _settlementHits.find((h) => (
            h.type === _settlementSelected.type
            && (h.id === _settlementSelected.id || h.label === _settlementSelected.label)
        ))
        : null;
    if (selectedHit && selectedHit.type === 'tile') {
        drawIsoHighlight(ctx, selectedHit.px, selectedHit.py, selectedHit.elev, 'rgba(255,215,95,0.95)', 2);
    } else if (selectedHit && selectedHit.type === 'marker') {
        ctx.beginPath();
        ctx.arc(selectedHit.px, selectedHit.py, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,95,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.restore();

    drawSettlementVignette(ctx, cssWidth, cssHeight);

    if (_settlementSelected) {
        const still = _settlementHits.find((h) => (
            h.type === _settlementSelected.type
            && (h.id === _settlementSelected.id || h.label === _settlementSelected.label)
        ));
        if (!still) {
            _settlementSelected = null;
            renderSettlementDetailPanel(null);
        }
    }
}

function initSettlementIsometricControls() {
    if (_settlementControlsReady) { return; }
    _settlementControlsReady = true;

    const canvas = document.getElementById('world-settlement-canvas');
    const stage = document.getElementById('world-settlement-stage');
    if (!canvas || !stage) { return; }

    document.querySelectorAll('[data-settlement-layer]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const layerId = btn.getAttribute('data-settlement-layer');
            if (layerId && typeof vscode !== 'undefined') {
                vscode.postMessage({ type: 'setSettlementViewLayer', layerId });
            }
        });
    });

    const zoomIn = document.getElementById('world-settlement-zoom-in');
    const zoomOut = document.getElementById('world-settlement-zoom-out');
    const zoomReset = document.getElementById('world-settlement-zoom-reset');
    const zoomFit = document.getElementById('world-settlement-zoom-fit');

    if (zoomIn) {
        zoomIn.addEventListener('click', () => {
            _settlementZoom = Math.min(SETTLEMENT_ZOOM_MAX, _settlementZoom + SETTLEMENT_ZOOM_STEP);
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', () => {
            _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, _settlementZoom - SETTLEMENT_ZOOM_STEP);
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomReset) {
        zoomReset.addEventListener('click', () => {
            resetSettlementViewTransform();
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomFit) {
        zoomFit.addEventListener('click', () => {
            fitSettlementViewToCanvas();
            drawSettlementIsometric();
        });
    }

    canvas.addEventListener('mousedown', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        _settlementDidDrag = false;
        _settlementDrag = { x: e.clientX, y: e.clientY, panX: _settlementPan.x, panY: _settlementPan.y };
    });
    window.addEventListener('mousemove', (e) => {
        if (!_settlementDrag) { return; }
        if (Math.hypot(e.clientX - _settlementDrag.x, e.clientY - _settlementDrag.y) > 4) {
            _settlementDidDrag = true;
        }
        _settlementPan = {
            x: _settlementDrag.panX + (e.clientX - _settlementDrag.x),
            y: _settlementDrag.panY + (e.clientY - _settlementDrag.y),
        };
        drawSettlementIsometric();
    });
    window.addEventListener('mouseup', () => {
        if (!_settlementDrag) { return; }
        _settlementDrag = null;
        const view = getSettlementSnapshot();
        if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
    });

    canvas.addEventListener('wheel', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        e.preventDefault();
        const delta = e.deltaY > 0 ? -SETTLEMENT_ZOOM_STEP : SETTLEMENT_ZOOM_STEP;
        _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, _settlementZoom + delta));
        const view = getSettlementSnapshot();
        if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
        drawSettlementIsometric();
    }, { passive: false });

    canvas.addEventListener('mousemove', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') {
            hideSettlementTooltip();
            return;
        }
        if (_settlementDrag) { return; }
        const hit = hitTestSettlement(e.clientX, e.clientY, canvas);
        const hoverKey = hit ? `${hit.type}:${hit.id || ''}:${hit.px},${hit.py}` : null;
        const prevKey = _settlementHover ? `${_settlementHover.type}:${_settlementHover.id || ''}:${_settlementHover.px},${_settlementHover.py}` : null;
        if (hoverKey !== prevKey) {
            _settlementHover = hit;
            drawSettlementIsometric();
        }
        if (hit) {
            showSettlementTooltip(hit, e.clientX, e.clientY);
        } else {
            hideSettlementTooltip();
        }
    });
    canvas.addEventListener('mouseleave', () => {
        hideSettlementTooltip();
        if (_settlementHover) {
            _settlementHover = null;
            drawSettlementIsometric();
        }
    });

    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        if (_settlementDidDrag) { return; }
        const hit = hitTestSettlement(e.clientX, e.clientY, canvas);
        _settlementSelected = hit;
        renderSettlementDetailPanel(hit);
        drawSettlementIsometric();
    });

    window.addEventListener('resize', () => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        drawSettlementIsometric();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initSettlementIsometricControls();
});