/* global document, window */

// ---------------------------------------------------------------------------
// Tile Overmap (roguelike ASCII renderer)
//
// Tile data arrives pre-computed from tileOvermapCore.ts as single-char biome
// codes. Theme key is resolved in the extension (overmapThemeKey on worldView).
// This module maps codes to visuals — an image tileset (CDDA tile_config.json
// style: code → sprite atlas index) can replace drawOvermapTile() later.
// ---------------------------------------------------------------------------

let _tileOvermapMsg = null;
let _overmapResizeTimer;

window.addEventListener('resize', () => {
    if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'tile') { return; }
    clearTimeout(_overmapResizeTimer);
    _overmapResizeTimer = setTimeout(() => drawTileOvermap(), 150);
});

const TILE_OVERMAP_ASCII_THEME = {
    s: { bg: '#0a1420', fg: ['#2f5f92', '#3e78b2', '#356a9e'], glyphs: ['~', '≈', '~'] },
    c: { bg: '#0d1a24', fg: ['#4a8ab2', '#5a9ac2', '#3f7aa2'], glyphs: ['~', '.', '≈'] },
    p: { bg: '#11150b', fg: ['#7d9c4d', '#93b060', '#6d8a41'], glyphs: ['.', ',', "'"] },
    f: { bg: '#0b120c', fg: ['#2e7d3e', '#3f9950', '#57aa5f'], glyphs: ['♠', '♣', '♠'] },
    m: { bg: '#141210', fg: ['#9a9188', '#b0a89e', '#7d766e'], glyphs: ['^', '▲', '^'] },
    d: { bg: '#171208', fg: ['#c8a85a', '#d8bc72', '#b09048'], glyphs: ['~', '.', '~'] },
    w: { bg: '#0d120e', fg: ['#5d8060', '#4d6a50', '#6f9472'], glyphs: ['"', '%', ','] },
    x: { bg: '#141108', fg: ['#a08a68', '#8a7658', '#b09a78'], glyphs: ['.', '~', ','] },
    y: { bg: '#161311', fg: ['#c07a4a', '#d08a5a', '#a86a3e'], glyphs: ['#', '⌂', '#'] },
    r: { bg: '#121012', fg: ['#8a8090', '#9a90a0', '#7a7080'], glyphs: ['Π', '.', ','] },
    g: { bg: '#100c14', fg: ['#8a6aa8', '#7a5a98', '#9a7ab8'], glyphs: ['Ω', '∩', '.'] },
    u: { bg: '#0e0c12', fg: ['#6a6a8a', '#7a7a9a', '#5a5a7a'], glyphs: ['∩', '.', 'o'] },
    n: { bg: '#131720', fg: ['#cdd8e0', '#b8c4d0', '#dde8f0'], glyphs: ['*', '.', '·'] },
    v: { bg: '#170c08', fg: ['#c05030', '#d06040', '#a04028'], glyphs: ['^', '▲', '~'] },
    o: { bg: '#121212', fg: ['#888880', '#989890', '#787870'], glyphs: ['.', ',', '·'] },
};
const TILE_OVERMAP_WATER_CODES = new Set(['s', 'c']);

const TILE_OVERMAP_THEME_OVERRIDES = {
    cyberpunk: {
        y: { bg: '#0d0a16', fg: ['#00c8c8', '#e040c0', '#8060ff'], glyphs: ['#', '▓', '■'] },
        p: { bg: '#0f1014', fg: ['#5a6a7a', '#6a7a8a', '#4a5a6a'], glyphs: ['.', ':', '·'] },
        f: { bg: '#0b100d', fg: ['#2a5a3a', '#356a45', '#204a30'], glyphs: ['↑', '♣', '.'] },
        x: { bg: '#12100c', fg: ['#7a6a50', '#8a7a5a', '#6a5a45'], glyphs: ['%', '≡', '.'] },
        s: { bg: '#08141a', fg: ['#3a5a6a', '#2f4f5f', '#456a7a'], glyphs: ['~', '≈', '~'] },
    },
    postapoc: {
        p: { bg: '#12100a', fg: ['#8a7a55', '#9a8a60', '#7a6a4a'], glyphs: ['.', ',', '"'] },
        f: { bg: '#100f0b', fg: ['#6a5f4f', '#7a6f5a', '#5a5045'], glyphs: ['†', '↑', ','] },
        y: { bg: '#121210', fg: ['#8a8a85', '#9a9a90', '#75756f'], glyphs: ['#', '≡', 'Π'] },
        s: { bg: '#0a1512', fg: ['#4a6a5a', '#3f5f50', '#557a65'], glyphs: ['~', '≈', '~'] },
        x: { bg: '#141108', fg: ['#b09a68', '#c0aa72', '#9a8658'], glyphs: ['~', '.', '∙'] },
    },
    zombie: {
        y: { bg: '#140d0d', fg: ['#9a4040', '#8a5a5a', '#aa5045'], glyphs: ['#', '⌂', '†'] },
        p: { bg: '#10130b', fg: ['#6a8a4a', '#7a9a55', '#5a7a40'], glyphs: ['"', ',', '.'] },
        r: { bg: '#121010', fg: ['#8a7070', '#9a8080', '#7a6060'], glyphs: ['Π', '†', ','] },
    },
    scifi: {
        p: { bg: '#101018', fg: ['#8a8a9a', '#9a9aaa', '#7a7a8a'], glyphs: ['.', '∙', '·'] },
        y: { bg: '#0a1416', fg: ['#40c0c0', '#50d0d0', '#30a0a0'], glyphs: ['∩', '#', '■'] },
        x: { bg: '#131008', fg: ['#9a7a6a', '#aa8a7a', '#8a6a5a'], glyphs: ['o', '.', '°'] },
        s: { bg: '#0e0a1a', fg: ['#5a4a9a', '#6a5aaa', '#4a3f8a'], glyphs: ['~', '≈', '~'] },
    },
    steampunk: {
        y: { bg: '#151009', fg: ['#b08050', '#c09060', '#906a40'], glyphs: ['#', '⌂', '■'] },
        x: { bg: '#121110', fg: ['#7a7068', '#8a8078', '#6a6058'], glyphs: ['%', '≡', '.'] },
        s: { bg: '#0a1216', fg: ['#4a6a7a', '#3f5f6f', '#557a8a'], glyphs: ['~', '≈', '~'] },
    },
    horror: {
        s: { bg: '#070a12', fg: ['#3a4a6a', '#2f3f5f', '#455a7a'], glyphs: ['~', '≈', '~'] },
        w: { bg: '#0d1010', fg: ['#5a6a6a', '#6a7a7a', '#4a5a5a'], glyphs: ['"', '~', ','] },
        f: { bg: '#0a100d', fg: ['#3a5a4a', '#2f4f40', '#456a55'], glyphs: ['♠', '†', '♣'] },
        r: { bg: '#0e1014', fg: ['#6a7a8a', '#7a8a9a', '#5a6a7a'], glyphs: ['Π', '◊', '.'] },
        c: { bg: '#0a1116', fg: ['#4a6a7a', '#3f5f6f', '#557a8a'], glyphs: ['~', '.', '≈'] },
    },
    oriental: {
        f: { bg: '#0b120c', fg: ['#4a9a50', '#5aaa5a', '#3f8a45'], glyphs: ['|', '↑', '♣'] },
        m: { bg: '#12141a', fg: ['#8a95a5', '#9aa5b5', '#7a8595'], glyphs: ['^', '▲', '∧'] },
        p: { bg: '#11150b', fg: ['#7aa050', '#8ab060', '#6a9045'], glyphs: ['.', '=', ','] },
        y: { bg: '#151109', fg: ['#c08a50', '#d09a60', '#a87a45'], glyphs: ['⌂', '#', '⌂'] },
    },
    modern: {
        y: { bg: '#101216', fg: ['#8a9aaa', '#9aaabb', '#7a8a9a'], glyphs: ['#', '▓', '⌂'] },
        p: { bg: '#10140b', fg: ['#7a9a5a', '#8aaa65', '#6a8a50'], glyphs: ['.', ':', ','] },
    },
};

const TILE_OVERMAP_HAZARD_STYLE = {
    radiation: { glyph: '☢', fg: '#b0e030', tint: 'rgba(140,200,30,0.16)' },
    toxic: { glyph: '☣', fg: '#80d060', tint: 'rgba(90,180,70,0.16)' },
    infested: { glyph: '☠', fg: '#e06050', tint: 'rgba(200,60,50,0.16)' },
    quarantine: { glyph: '╬', fg: '#e0b040', tint: 'rgba(220,170,50,0.14)' },
    anomaly: { glyph: '◊', fg: '#b080f0', tint: 'rgba(150,100,240,0.16)' },
    haunted: { glyph: '†', fg: '#a0b0d0', tint: 'rgba(130,150,210,0.14)' },
    storm: { glyph: '§', fg: '#70c0e0', tint: 'rgba(90,180,230,0.14)' },
    corrupted: { glyph: '▒', fg: '#c060a0', tint: 'rgba(190,80,160,0.14)' },
};

function getRegionFogVisibility(regionId, fog) {
    if (!fog || !regionId) { return 'discovered'; }
    const discovered = new Set(fog.discoveredRegionIds || []);
    const rumored = new Set(fog.rumoredRegionIds || []);
    if (discovered.has(regionId)) { return 'discovered'; }
    if (rumored.has(regionId)) { return 'rumored'; }
    return 'unknown';
}

function resolveTileRegionFog(tx, ty, cols, rows, layout, fog) {
    if (!fog || !Array.isArray(layout) || layout.length === 0) { return 'discovered'; }
    const leftPct = ((tx + 0.5) / cols) * 100;
    const topPct = ((ty + 0.5) / rows) * 100;
    let bestId = layout[0].regionId;
    let bestScore = Infinity;
    for (const entry of layout) {
        const dx = entry.leftPct - leftPct;
        const dy = entry.topPct - topPct;
        const radius = Math.max(2, entry.radiusPct || 7);
        const score = Math.sqrt(dx * dx + dy * dy) / radius;
        if (score < bestScore) {
            bestScore = score;
            bestId = entry.regionId;
        }
    }
    return getRegionFogVisibility(bestId, fog);
}

/** Same integer hash as tileOvermapCore.hash2 — cosmetic per-tile variation only. */
function overmapHash(x, y, s) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function drawOvermapTile(ctx, tx, ty, cell, style, glyph, fg) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(tx * cell, ty * cell, cell, cell);
    ctx.fillStyle = fg;
    ctx.fillText(glyph, tx * cell + cell / 2, ty * cell + cell / 2 + 1);
}

function drawOvermapOutlinedText(ctx, text, x, y, fill) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

function drawTileOvermap() {
    const canvas = document.getElementById('world-overmap-canvas');
    const empty = document.getElementById('world-overmap-empty');
    if (!canvas) { return; }

    const msg = _tileOvermapMsg;
    const om = msg && msg.tileOvermap;
    const hasData = Boolean(om && Array.isArray(om.tileRows) && om.tileRows.length > 0 && (msg.regionCount ?? 0) > 0);
    if (empty) { empty.classList.toggle('hidden', hasData); }
    canvas.style.display = hasData ? 'block' : 'none';
    if (!hasData) { return; }

    const panel = canvas.parentElement;
    const panelWidth = panel ? panel.clientWidth : 0;
    if (!panelWidth) { return; }

    const cell = Math.max(5, Math.floor(panelWidth / om.cols));
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = om.cols * cell;
    const cssHeight = om.rows * cell;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.borderRadius = '4px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(6, cell - 2)}px "Courier New", monospace`;

    const seed = om.seed >>> 0;
    const roadSet = new Set((om.roads || []).map(([x, y]) => `${x},${y}`));
    const themeKey = msg.overmapThemeKey || 'fantasy';
    const themeOverrides = TILE_OVERMAP_THEME_OVERRIDES[themeKey] || {};

    const fogLayout = Array.isArray(msg.fogRegionLayout) ? msg.fogRegionLayout : [];
    const fog = msg.fog;

    for (let ty = 0; ty < om.rows; ty++) {
        const row = om.tileRows[ty] || '';
        for (let tx = 0; tx < om.cols; tx++) {
            const code = row[tx] || 'o';
            const style = themeOverrides[code] || TILE_OVERMAP_ASCII_THEME[code] || TILE_OVERMAP_ASCII_THEME.o;
            const variant = overmapHash(tx, ty, seed + 99);
            let glyph = style.glyphs[Math.floor(variant * style.glyphs.length)];
            let fg = style.fg[Math.floor(overmapHash(tx, ty, seed + 55) * style.fg.length)];
            if (roadSet.has(`${tx},${ty}`)) {
                glyph = TILE_OVERMAP_WATER_CODES.has(code) ? '=' : '·';
                fg = TILE_OVERMAP_WATER_CODES.has(code) ? '#8aa0b8' : '#c9b083';
            }
            drawOvermapTile(ctx, tx, ty, cell, style, glyph, fg);

            const tileFog = resolveTileRegionFog(tx, ty, om.cols, om.rows, fogLayout, fog);
            if (tileFog === 'unknown') {
                ctx.fillStyle = 'rgba(6, 8, 14, 0.78)';
                ctx.fillRect(tx * cell, ty * cell, cell, cell);
            } else if (tileFog === 'rumored') {
                ctx.fillStyle = 'rgba(10, 14, 22, 0.42)';
                ctx.fillRect(tx * cell, ty * cell, cell, cell);
            }
        }
    }

    const hazardGroups = Array.isArray(om.hazards) ? om.hazards : [];
    for (const group of hazardGroups) {
        const hz = TILE_OVERMAP_HAZARD_STYLE[group.hazard];
        if (!hz || !Array.isArray(group.tiles)) { continue; }
        for (const [tx, ty] of group.tiles) {
            ctx.fillStyle = hz.tint;
            ctx.fillRect(tx * cell, ty * cell, cell, cell);
            ctx.fillStyle = hz.fg;
            ctx.fillText(hz.glyph, tx * cell + cell / 2, ty * cell + cell / 2 + 1);
        }
    }

    const pins = Array.isArray(msg.cartographyPins) ? msg.cartographyPins : [];
    ctx.font = `600 ${Math.max(8, cell)}px "Courier New", monospace`;
    let currentPin = null;
    for (const pin of pins) {
        if (typeof pin.leftPct !== 'number' || typeof pin.topPct !== 'number') { continue; }
        const pinFog = getRegionFogVisibility(pin.regionId, fog);
        if (pinFog === 'unknown') { continue; }
        const px = (pin.leftPct / 100) * cssWidth;
        const py = (pin.topPct / 100) * cssHeight;
        const isCurrent = pin.locationId && pin.locationId === msg.currentLocationId;
        if (isCurrent) { currentPin = { pin, px, py, pinFog }; continue; }
        const glyph = pinFog === 'rumored' ? '?' : '⌂';
        drawOvermapOutlinedText(ctx, glyph, px, py, pinFog === 'rumored' ? '#9aa8b8' : '#e8c87a');
    }
    if (currentPin) {
        ctx.font = `600 ${Math.max(10, cell + 3)}px "Courier New", monospace`;
        drawOvermapOutlinedText(ctx, '@', currentPin.px, currentPin.py, '#ffd75f');
        if (currentPin.pinFog === 'discovered') {
            ctx.font = '600 11px sans-serif';
            const label = currentPin.pin.locationName || currentPin.pin.locationId || '';
            const lx = Math.min(Math.max(currentPin.px, 30), cssWidth - 30);
            drawOvermapOutlinedText(ctx, label, lx, Math.min(currentPin.py + cell + 8, cssHeight - 6), '#ffe9a8');
        }
    }

    ctx.font = '600 11px sans-serif';
    const labels = Array.isArray(msg.cartographyRegionLabels) ? msg.cartographyRegionLabels : [];
    for (const label of labels) {
        if (typeof label.leftPct !== 'number' || typeof label.topPct !== 'number') { continue; }
        const labelFog = getRegionFogVisibility(label.regionId, fog);
        if (labelFog === 'unknown') { continue; }
        const lx = Math.min(Math.max((label.leftPct / 100) * cssWidth, 36), cssWidth - 36);
        const ly = Math.min(Math.max((label.topPct / 100) * cssHeight, 10), cssHeight - 6);
        const color = labelFog === 'rumored' ? '#8a98a8' : '#b8c4d0';
        drawOvermapOutlinedText(ctx, label.regionName || label.regionId || '', lx, ly, color);
    }
}