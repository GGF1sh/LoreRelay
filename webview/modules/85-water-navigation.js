/* Stored water geometry shared by the diagram, tile map and illustrated overlay. */
let waterTileZoom = 1;
let waterQuote = null;
let waterRoute = null;
let waterWorld = '';
let waterState = '';
let waterRequest = 0;
const waterPost = (action, extra = {}) => vscode.postMessage({ type: 'waterNavigation', action, ...extra });
const waterSvg = (tag, attributes = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
};
function waterClearQuote() {
    if (waterQuote) waterPost('cancel', { quoteId: waterQuote });
    waterRequest++;
    waterQuote = null; waterRoute = null;
    const button = document.getElementById('water-depart'); if (button) button.disabled = true;
    const check = document.getElementById('water-confirm'); if (check) check.checked = false;
    const label = document.getElementById('water-confirm-label'); if (label) label.hidden = true;
}
function renderWaterNavigationControls(msg) {
    const controls = document.getElementById('water-navigation'); if (!controls) return;
    controls.classList.toggle('hidden', !msg.navigation);
    if (!msg.navigation) { waterClearQuote(); return; }
    if (waterWorld !== msg.navigation.worldKey) { waterClearQuote(); waterWorld = msg.navigation.worldKey; }
    if (waterState && waterState !== msg.navigation.stateKey) waterClearQuote();
    waterState = msg.navigation.stateKey;
    const fill = (id, entries) => {
        const select = document.getElementById(id), previous = select.value; select.replaceChildren();
        entries.forEach(e => { const option = document.createElement('option'); option.value = e.id; option.textContent = e.name; select.appendChild(option); });
        if (entries.some(e => e.id === previous)) select.value = previous;
    };
    fill('water-vehicle', [{ id: '', name: '徒歩（船・車両はその場に残す）' }, ...msg.navigation.vehicles.map(v => ({ id: v.id, name: `${v.name} / HP ${v.hp}${v.waterProfile ? ` / 幅${v.waterProfile.width}・喫水${v.waterProfile.draft}・耐航${v.waterProfile.seaworthiness}` : ' / 水上性能未設定'}` }))]);
    fill('water-destination', msg.navigation.destinations.filter(l => l.id !== msg.currentLocationId));
    requestAnimationFrame(renderWaterCartography);
}
function updateWaterDetail(svg, scale) {
    if (!svg) return;
    const selected = new Set(waterRoute?.edgeIds || []);
    svg.querySelectorAll('[data-river-kind]').forEach(el => {
        el.style.display = selected.has(el.dataset.edgeId) || el.dataset.riverKind === 'major' || scale >= 1 && el.dataset.riverKind === 'river' || scale >= 2 ? '' : 'none';
    });
}
function paintWaterSvg(svg, msg, sea) {
    const nav = msg?.navigation; if (!nav) return;
    if (sea) for (let y = 0; y < nav.seaRows.length; y++) {
        const row = nav.seaRows[y];
        for (let x = 0; x < row.length;) {
            const code = row[x]; let end = x + 1; while (end < row.length && row[end] === code) end++;
            if (code !== '0') svg.appendChild(waterSvg('rect', { x: x * 1000 / 128, y: y * 1000 / 128, width: (end - x) * 1000 / 128 + .1, height: 1000 / 128 + .1, fill: code === '1' ? '#235775' : '#122b54' }));
            x = end;
        }
    }
    const line = (edge, color, width, river) => {
        const el = waterSvg('polyline', { points: edge.points.map(p => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        if (river) { el.dataset.riverKind = edge.kind; el.dataset.edgeId = edge.id; }
        svg.appendChild(el);
    };
    nav.roads.forEach(r => line(r, '#ac9467', 2, false));
    nav.rivers.forEach(r => line(r, '#66b9eb', r.width * 1.7, true));
    nav.crossings.forEach(c => {
        const glyph = waterSvg('text', { x: c.x, y: c.y, fill: '#fff1b0', 'font-size': 13, 'text-anchor': 'middle', stroke: '#16202b', 'stroke-width': 3, 'paint-order': 'stroke' });
        glyph.textContent = c.kind === 'bridge' ? '橋' : '渡'; svg.appendChild(glyph);
    });
    if (waterRoute) waterRoute.points.forEach(points => line({ points }, waterRoute.damage ? '#ff986b' : '#f5e45a', 4, false));
}
function renderWaterDiagram(container, msg) {
    container.replaceChildren();
    const svg = waterSvg('svg', { viewBox: '0 0 1000 1000', width: '100%', role: 'img', 'aria-label': '水系・道路・橋・渡し場の図解' });
    const fit = Math.max(280, Math.min(container.clientWidth || 700, window.innerHeight * .55));
    svg.style.width = fit + 'px'; svg.style.height = fit + 'px';
    svg.style.background = '#15201e';
    const known = new Set(msg.fog?.discoveredRegionIds || []);
    (msg.fogRegionLayout || []).filter(r => known.has(r.regionId)).forEach(r => svg.appendChild(waterSvg('circle', { cx: r.leftPct * 10, cy: r.topPct * 10, r: r.radiusPct * 10, fill: '#344939', opacity: .5 })));
    paintWaterSvg(svg, msg, true);
    (msg.cartographyRegionLabels || []).forEach(r => {
        if (msg.navigation.pins.some(p => p.regionId === r.regionId && p.locationName === r.regionName)) return;
        const text = waterSvg('text', { x: r.leftPct * 10, y: r.topPct * 10 - 18, fill: '#ddd', 'font-size': 16, 'text-anchor': 'middle' }); text.textContent = r.regionName || ''; svg.appendChild(text);
    });
    msg.navigation.pins.forEach(p => {
        const group = waterSvg('g', { role: 'button', tabindex: 0, 'aria-label': p.locationName });
        group.style.cursor = 'pointer';
        group.appendChild(waterSvg('circle', { cx: p.leftPct * 10, cy: p.topPct * 10, r: 6, fill: p.locationId === msg.currentLocationId ? '#ffe67a' : '#ddd' }));
        const label = waterSvg('text', { x: p.leftPct * 10, y: p.topPct * 10 + 23, fill: '#fff', stroke: '#142018', 'stroke-width': 4, 'paint-order': 'stroke', 'font-size': 15, 'text-anchor': 'middle' });
        label.textContent = (p.locationId === msg.currentLocationId ? '現在地 ' : '') + p.locationName; group.appendChild(label);
        group.addEventListener('click', () => selectWorldLocationPin(p.locationId));
        group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectWorldLocationPin(p.locationId); } });
        svg.appendChild(group);
    });
    container.appendChild(svg);
    initMapPanZoomOnce(container); applyMapTransform(container); addMapPanZoomHint(container);
}
function renderWaterCartography() {
    const stage = document.getElementById('world-cartography-stage'); if (!stage) return;
    let svg = document.getElementById('water-cartography-overlay');
    if (svg) svg.remove();
    if (!_worldViewMsg?.navigation) return;
    svg = waterSvg('svg', { id: 'water-cartography-overlay', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    Object.assign(svg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '1' });
    paintWaterSvg(svg, _worldViewMsg, false); updateWaterDetail(svg, mapAssetZoom);
    stage.appendChild(svg);
}
function drawWaterNavigationCanvas(ctx, msg, width, height) {
    const nav = msg.navigation; if (!nav) return;
    ctx.save(); ctx.scale(width / 1000, height / 1000);
    const selected = new Set(waterRoute?.edgeIds || []);
    const line = (points, color, size) => { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.strokeStyle = color; ctx.lineWidth = size; ctx.stroke(); };
    nav.rivers.filter(r => selected.has(r.id) || r.kind === 'major' || waterTileZoom >= 1 && r.kind === 'river' || waterTileZoom >= 2).forEach(r => line(r.points, '#66b9eb', r.width * 1.7));
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#fff1b0';
    nav.crossings.forEach(c => ctx.fillText(c.kind === 'bridge' ? '橋' : '渡', c.x, c.y));
    waterRoute?.points.forEach(p => line(p, waterRoute.damage ? '#ff986b' : '#f5e45a', 4));
    ctx.restore();
}
function waterRedraw() {
    if (!_worldViewMsg) return;
    if (_worldViewMsg.navigation) renderWaterDiagram(document.getElementById('world-mermaid'), _worldViewMsg);
    renderWaterCartography();
    if (worldMapMode === 'tile') drawTileOvermap();
}
window.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('water-navigation')) return;
    const preview = shortcut => { waterClearQuote(); waterPost('preview', { requestId: String(waterRequest), destination: document.getElementById('water-destination').value, vehicleId: document.getElementById('water-vehicle').value, shortcut }); document.getElementById('water-result').textContent = '経路を確認しています…'; };
    document.getElementById('water-preview').onclick = () => preview(false);
    document.getElementById('water-shortcut').onclick = () => preview(true);
    for (const id of ['water-vehicle', 'water-destination']) document.getElementById(id).onchange = () => { waterClearQuote(); document.getElementById('water-result').textContent = '移動条件を変更しました。再確認してください。'; waterRedraw(); };
    document.getElementById('water-cancel').onclick = () => { waterClearQuote(); document.getElementById('water-result').textContent = ''; waterRedraw(); };
    document.getElementById('water-confirm').onchange = e => { document.getElementById('water-depart').disabled = !waterQuote || !e.target.checked; };
    document.getElementById('water-depart').onclick = () => { if (waterQuote) { document.getElementById('water-depart').disabled = true; waterPost('depart', { quoteId: waterQuote, confirmDamage: document.getElementById('water-confirm').checked }); } };
    document.getElementById('water-zoom').onchange = e => {
        const scale = Number(e.target.value); waterTileZoom = scale; mapAssetZoom = scale; _mapPanState.scale = scale;
        mapAssetSizeStage(); waterRedraw();
    };
    window.addEventListener('message', event => {
        const msg = event.data; if (msg.type !== 'waterNavigationResult') return;
        if (msg.requestId !== undefined && msg.requestId !== String(waterRequest)) return;
        const result = document.getElementById('water-result');
        if (!msg.ok) { waterClearQuote(); result.textContent = msg.error; waterRedraw(); return; }
        if (msg.completed) { waterClearQuote(); result.textContent = msg.summary || 'この移動は保存済みです。'; waterRedraw(); return; }
        waterQuote = msg.quoteId; waterRoute = msg.route;
        const r = msg.route;
        result.textContent = `${r.status === 'safe' ? '安全に通れます' : r.status === 'risky' ? '危険ですが通れます' : '通行不可'} / 距離 ${Math.round(r.distance)}${r.hpBefore !== undefined ? ` / 船体HP ${r.hpBefore} → ${r.hpAfter}` : ''}。${r.reasons.join(' / ')}`;
        document.getElementById('water-shortcut').hidden = !msg.hasShortcut;
        document.getElementById('water-confirm-label').hidden = !r.damage;
        document.getElementById('water-depart').disabled = !waterQuote || !!r.damage;
        waterRedraw();
    });
});
