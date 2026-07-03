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
let _settlementControlsReady = false;

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

function getSettlementSnapshot() {
    const msg = _settlementWorldMsg;
    return msg && msg.settlementView ? msg.settlementView : null;
}

function isoProject(x, y, z, originX, originY) {
    return {
        sx: originX + (x - y) * (SETTLEMENT_TILE_W / 2),
        sy: originY + (x + y) * (SETTLEMENT_TILE_H / 2) - z * SETTLEMENT_LAYER_HEIGHT,
    };
}

function drawIsoDiamond(ctx, sx, sy, colors, glyph) {
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
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (glyph && glyph !== ' ') {
        ctx.font = '600 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,12,20,0.9)';
        ctx.fillText(glyph, sx, sy + 1);
    }
}

function drawIsoMarker(ctx, sx, sy, kind) {
    const color = SETTLEMENT_MARKER_COLORS[kind] || '#b8c4d0';
    const glyph = SETTLEMENT_MARKER_GLYPHS[kind] || '+';
    ctx.beginPath();
    ctx.arc(sx, sy - SETTLEMENT_TILE_H, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,20,0.82)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '600 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(glyph, sx, sy - SETTLEMENT_TILE_H + 1);
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

function fitSettlementViewToCanvas() {
    const view = getSettlementSnapshot();
    const canvas = document.getElementById('world-settlement-canvas');
    if (!view || !canvas || !canvas.clientWidth) { return; }
    const boundsW = (view.width + view.height) * (SETTLEMENT_TILE_W / 2);
    const boundsH = (view.width + view.height) * (SETTLEMENT_TILE_H / 2) + SETTLEMENT_LAYER_HEIGHT * 2;
    const pad = 24;
    const scaleX = (canvas.clientWidth - pad) / Math.max(1, boundsW);
    const scaleY = (canvas.clientHeight - pad) / Math.max(1, boundsH);
    _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, Math.min(scaleX, scaleY)));
    _settlementPan = { x: 0, y: 0 };
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
    const x = clientX - rect.left;
    const y = clientY - rect.top;
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
    document.querySelectorAll('[data-settlement-layer]').forEach((btn) => {
        const layer = btn.getAttribute('data-settlement-layer');
        btn.classList.toggle('is-active', layer === layerId);
        btn.setAttribute('aria-pressed', layer === layerId ? 'true' : 'false');
    });
}

function drawSettlementIsometric() {
    const canvas = document.getElementById('world-settlement-canvas');
    const empty = document.getElementById('world-settlement-empty');
    const stage = document.getElementById('world-settlement-stage');
    if (!canvas || !stage) { return; }

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
    if (!view) {
        hideSettlementTooltip();
        renderSettlementDetailPanel(null);
        const list = document.getElementById('world-settlement-marker-fallback');
        if (list) {
            list.innerHTML = '';
            list.classList.add('hidden');
        }
        return;
    }

    if (view.settlementId !== _lastSettlementId) {
        _lastSettlementId = view.settlementId;
        resetSettlementViewTransform();
        loadSettlementViewPrefs(view.settlementId);
        _settlementSelected = null;
    }

    syncSettlementLayerButtons(view);
    renderSettlementMarkerFallback(view);

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
    ctx.fillStyle = 'rgba(8, 12, 20, 0.92)';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const { originX, originY } = computeSettlementOrigin(canvas, view);
    const zoom = _settlementZoom;
    ctx.save();
    ctx.translate(cssWidth / 2, cssHeight / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cssWidth / 2, -cssHeight / 2);

    _settlementHits = [];
    const tiles = Array.isArray(view.tiles) ? [...view.tiles] : [];
    tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);

    for (const tile of tiles) {
        const { sx, sy } = isoProject(tile.x, tile.y, tile.z, originX, originY);
        const colors = SETTLEMENT_TILE_COLORS[tile.code] || SETTLEMENT_TILE_COLORS.unknown;
        drawIsoDiamond(ctx, sx, sy, colors, colors.glyph);
        _settlementHits.push({
            type: 'tile',
            px: sx,
            py: sy,
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
            label: marker.label,
            detail: marker.detail,
        });
    }

    ctx.restore();

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
        if (hit) {
            showSettlementTooltip(hit, e.clientX, e.clientY);
        } else {
            hideSettlementTooltip();
        }
    });
    canvas.addEventListener('mouseleave', hideSettlementTooltip);

    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        if (_settlementDidDrag) { return; }
        const hit = hitTestSettlement(e.clientX, e.clientY, canvas);
        _settlementSelected = hit;
        renderSettlementDetailPanel(hit);
    });

    window.addEventListener('resize', () => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        drawSettlementIsometric();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initSettlementIsometricControls();
});