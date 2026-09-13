/* Illustrated maps: host-owned image adoption, presentation-only editing. */
let mapAssetPreview = null;
let mapAssetDraft = null;
let mapAssetEditing = false;
let mapAssetIdentity = '';
let mapAssetZoom = 1;
const mapAssetEmptyOverlay = () => ({ pins: {}, regions: {}, showLabels: true, showRoutes: true });
const mapAssetClone = value => JSON.parse(JSON.stringify(value));
const mapAssetPost = (action, extra = {}) => vscode.postMessage({ type: 'worldMapAsset', action, ...extra });

function overlayCartographyMessage(msg) {
    const identity = `${msg.cartographyWorldKey || ''}:${msg.cartographyAsset?.revision || ''}`;
    if (identity !== mapAssetIdentity) {
        mapAssetIdentity = identity;
        mapAssetDraft = null;
        mapAssetEditing = false;
        if (mapAssetPreview && mapAssetPreview.worldKey !== msg.cartographyWorldKey) mapAssetPreview = null;
    }
    const overlay = mapAssetPreview ? mapAssetEmptyOverlay() : mapAssetDraft || msg.cartographyAsset?.overlay || mapAssetEmptyOverlay();
    const result = { ...msg,
        cartographyImage: mapAssetPreview?.image || msg.cartographyImage,
        cartographyShowLabels: overlay.showLabels, cartographyShowRoutes: overlay.showRoutes,
        cartographyPins: (msg.cartographyPins || []).map(p => ({ ...p, ...overlay.pins[p.locationId] })),
        cartographyRegionLabels: (msg.cartographyRegionLabels || []).map(r => ({ ...r, ...overlay.regions[r.regionId] })),
        cartographyRouteEdges: (msg.cartographyRouteEdges || []).map(e => {
            const a = overlay.regions[e.fromRegionId], b = overlay.regions[e.toRegionId];
            return { ...e, ...(a ? { x1Pct: a.leftPct, y1Pct: a.topPct } : {}),
                ...(b ? { x2Pct: b.leftPct, y2Pct: b.topPct } : {}) };
        }) };
    mapAssetUpdateControls(msg, overlay);
    return result;
}
function mapAssetStatus(text) {
    const el = document.getElementById('map-asset-status');
    if (el) el.textContent = text;
}
function mapAssetRedraw() { if (_worldViewMsg) renderCartographyMap(_worldViewMsg); }
function mapAssetSizeStage() {
    const viewport = document.getElementById('map-asset-viewport');
    const stage = document.getElementById('world-cartography-stage');
    const image = document.getElementById('world-cartography-img');
    if (!viewport || !stage || !image?.naturalWidth || !viewport.clientWidth) return;
    const fitWidth = Math.min(viewport.clientWidth, window.innerHeight * .7 * image.naturalWidth / image.naturalHeight);
    stage.style.width = `${fitWidth * mapAssetZoom}px`;
    scheduleCartographyLabelLayout();
}
function mapAssetStartEdit() {
    if (!_worldViewMsg?.cartographyAsset) return;
    mapAssetDraft = mapAssetClone(_worldViewMsg.cartographyAsset.overlay);
    mapAssetEditing = true;
    mapAssetRedraw();
    mapAssetStatus(T('webview.mapAssets.dragHint'));
}
function mapAssetUpdateControls(msg, overlay) {
    const controls = document.getElementById('map-asset-controls');
    if (!controls) return;
    const preview = Boolean(mapAssetPreview);
    controls.querySelector('[data-map-action="adopt"]').hidden = !preview;
    controls.querySelector('[data-map-action="adopt"]').disabled = !mapAssetPreview?.decoded;
    controls.querySelector('[data-map-action="cancel"]').hidden = !preview && !mapAssetEditing;
    controls.querySelector('[data-map-action="edit"]').hidden = preview || mapAssetEditing;
    controls.querySelector('[data-map-action="edit"]').disabled = msg.cartographySource !== 'illustrated';
    for (const action of ['save', 'reset']) controls.querySelector(`[data-map-action="${action}"]`).hidden = !mapAssetEditing;
    for (const key of ['showLabels', 'showRoutes']) {
        const input = controls.querySelector(`[data-map-toggle="${key}"]`);
        input.checked = overlay[key];
        input.disabled = preview;
    }
    const marker = controls.querySelector('[data-map-marker-mode]');
    marker.value = msg.cartographyMarker?.mode || 'standard';
    marker.disabled = preview || mapAssetEditing || !msg.cartographyAsset;
    marker.querySelector('[value="custom"]').disabled = !msg.cartographyMarker?.image;
    controls.querySelector('[data-map-action="markerImage"]').disabled = marker.disabled;
    document.getElementById('world-cartography-stage')?.classList.toggle('map-asset-editing', mapAssetEditing);
}

window.addEventListener('DOMContentLoaded', () => {
    const map = document.getElementById('world-cartography');
    const stage = document.getElementById('world-cartography-stage');
    if (!map || !stage) return;
    const controls = document.createElement('div');
    controls.id = 'map-asset-controls';
    controls.className = 'map-asset-controls';
    const button = (action, key) => {
        const el = document.createElement('button'); el.type = 'button'; el.className = 'small-btn';
        el.dataset.mapAction = action; el.dataset.i18n = `webview.mapAssets.${key}`;
        el.textContent = T(el.dataset.i18n); controls.appendChild(el);
    };
    button('adopt', 'adopt'); button('edit', 'edit'); button('save', 'save'); button('reset', 'reset');
    button('cancel', 'cancel'); button('out', 'zoomOut'); button('fit', 'fit'); button('in', 'zoomIn');
    const markerLabel = document.createElement('label');
    const markerText = document.createElement('span'); markerText.dataset.i18n = 'webview.mapAssets.marker';
    markerText.textContent = T(markerText.dataset.i18n);
    const markerSelect = document.createElement('select'); markerSelect.dataset.mapMarkerMode = '';
    markerSelect.dataset.i18nAriaLabel = 'webview.mapAssets.marker';
    markerSelect.setAttribute('aria-label', T('webview.mapAssets.marker'));
    for (const mode of ['standard', 'custom']) {
        const option = document.createElement('option'); option.value = mode;
        option.dataset.i18n = `webview.mapAssets.marker${mode === 'standard' ? 'Standard' : 'Custom'}`;
        option.textContent = T(option.dataset.i18n); markerSelect.appendChild(option);
    }
    markerLabel.append(markerText, markerSelect); controls.appendChild(markerLabel);
    button('markerImage', 'markerImage');
    for (const [key, label] of [['showLabels', 'labels'], ['showRoutes', 'routes']]) {
        const wrapper = document.createElement('label'), input = document.createElement('input');
        input.type = 'checkbox'; input.checked = true; input.dataset.mapToggle = key;
        const text = document.createElement('span'); text.dataset.i18n = `webview.mapAssets.${label}`;
        text.textContent = T(text.dataset.i18n); wrapper.append(input, text); controls.appendChild(wrapper);
    }
    const status = document.createElement('p'); status.id = 'map-asset-status'; status.setAttribute('role', 'status');
    const viewport = document.createElement('div'); viewport.id = 'map-asset-viewport';
    stage.before(viewport); viewport.appendChild(stage); map.prepend(controls, status);
    document.getElementById('world-cartography-img').addEventListener('load', mapAssetSizeStage);
    window.addEventListener('resize', mapAssetSizeStage);
    controls.addEventListener('click', e => {
        const action = e.target.closest('[data-map-action]')?.dataset.mapAction;
        if (!action || !_worldViewMsg) return;
        if (action === 'adopt' && mapAssetPreview?.decoded) {
            mapAssetPost('adopt', { token: mapAssetPreview.token });
        } else if (action === 'edit') {
            if (_worldViewMsg.cartographyAsset) mapAssetStartEdit();
            else mapAssetPost('prepareEdit', { worldKey: _worldViewMsg.cartographyWorldKey });
        } else if (action === 'save') {
            mapAssetPost('save', { worldKey: _worldViewMsg.cartographyWorldKey,
                revision: _worldViewMsg.cartographyAsset?.revision, overlay: mapAssetDraft });
        } else if (action === 'markerImage') {
            mapAssetPost('markerImage', { worldKey: _worldViewMsg.cartographyWorldKey,
                revision: _worldViewMsg.cartographyAsset?.revision });
        } else if (action === 'reset') {
            mapAssetDraft = { ...mapAssetDraft, pins: {}, regions: {} }; mapAssetRedraw();
        } else if (action === 'cancel') {
            if (mapAssetPreview) mapAssetPost('cancel', { token: mapAssetPreview.token });
            mapAssetPreview = null; mapAssetDraft = null; mapAssetEditing = false; mapAssetStatus(''); mapAssetRedraw();
        } else if (['in', 'out', 'fit'].includes(action)) {
            mapAssetZoom = action === 'fit' ? 1 : Math.max(1, Math.min(4, mapAssetZoom * (action === 'in' ? 1.25 : .8)));
            mapAssetSizeStage();
            if (action === 'fit') { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
        }
    });
    controls.addEventListener('change', e => {
        if (e.target.hasAttribute('data-map-marker-mode')) {
            mapAssetPost('markerMode', { worldKey: _worldViewMsg.cartographyWorldKey,
                revision: _worldViewMsg.cartographyAsset?.revision, mode: e.target.value });
            return;
        }
        const key = e.target.dataset.mapToggle;
        if (!key || !_worldViewMsg) return;
        if (!mapAssetDraft) mapAssetDraft = mapAssetClone(_worldViewMsg.cartographyAsset?.overlay || mapAssetEmptyOverlay());
        mapAssetDraft[key] = e.target.checked;
        mapAssetRedraw();
        if (!mapAssetEditing && _worldViewMsg.cartographyAsset) mapAssetPost('save', {
            worldKey: _worldViewMsg.cartographyWorldKey, revision: _worldViewMsg.cartographyAsset.revision, overlay: mapAssetDraft });
    });
    let drag = null;
    stage.addEventListener('click', e => { if (mapAssetEditing || mapAssetPreview) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    stage.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const target = e.target.closest('[data-map-pin], [data-map-region]');
        if (mapAssetEditing && target) {
            e.preventDefault(); e.stopPropagation();
            drag = { target, id: target.dataset.mapPin || target.dataset.mapRegion,
                kind: target.dataset.mapPin ? 'pins' : 'regions', identity: mapAssetIdentity };
        } else if (!target) {
            drag = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
            e.preventDefault();
        }
        if (drag) stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
        if (!drag) return;
        if (drag.target) {
            if (!mapAssetDraft || drag.identity !== mapAssetIdentity) { drag = null; return; }
            const rect = stage.getBoundingClientRect();
            const point = { leftPct: Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100)),
                topPct: Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100)) };
            mapAssetDraft[drag.kind][drag.id] = point;
            drag.target.style.left = `${point.leftPct}%`; drag.target.style.top = `${point.topPct}%`;
            renderCartographyRoutes(document.getElementById('world-cartography-routes'), overlayCartographyMessage(_worldViewMsg));
        } else { viewport.scrollLeft = drag.left - e.clientX + drag.x; viewport.scrollTop = drag.top - e.clientY + drag.y; }
    });
    const finish = () => { if (drag?.target) mapAssetRedraw(); drag = null; };
    stage.addEventListener('pointerup', finish); stage.addEventListener('pointercancel', finish);
    document.getElementById('world-import-map-btn')?.addEventListener('click', () => {
        mapAssetPost('import'); setWorldMapMode('parchment');
    });
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type === 'worldMapGenEnd' && msg.success) setWorldMapMode('parchment');
        if (msg.type === 'worldView' && msg.cartographyAssetError) mapAssetStatus(msg.cartographyAssetError);
        if (msg.type !== 'worldMapAssetState') return;
        if (msg.status === 'preview') {
            if (msg.worldKey !== _worldViewMsg?.cartographyWorldKey) return;
            mapAssetPreview = { ...msg, decoded: false }; mapAssetEditing = false; mapAssetDraft = null;
            const image = new Image();
            image.onload = () => {
                if (mapAssetPreview?.token !== msg.token) return;
                mapAssetPreview.decoded = image.naturalWidth > 0 && image.naturalHeight > 0
                    && image.naturalWidth <= 16384 && image.naturalHeight <= 16384
                    && image.naturalWidth * image.naturalHeight <= 40000000;
                mapAssetStatus(T(mapAssetPreview.decoded ? 'webview.mapAssets.previewHint' : 'webview.mapAssets.invalidImage'));
                mapAssetRedraw();
            };
            image.onerror = () => { if (mapAssetPreview?.token === msg.token) mapAssetStatus(T('webview.mapAssets.invalidImage')); };
            image.src = msg.image;
            setWorldMapMode('parchment'); mapAssetRedraw();
        } else if (msg.status === 'adopted' || msg.status === 'saved' || msg.status === 'cancelled') {
            mapAssetPreview = null; mapAssetDraft = null; mapAssetEditing = false;
            mapAssetRedraw(); setWorldMapMode('parchment'); mapAssetStatus(msg.status === 'cancelled' ? '' : T('webview.mapAssets.saved'));
        } else if (msg.status === 'markerSaved') {
            mapAssetStatus(T('webview.mapAssets.markerSaved')); mapAssetRedraw();
        } else if (msg.status === 'markerCancelled') mapAssetRedraw();
        else if (msg.status === 'edit') mapAssetStartEdit();
        else if (msg.status === 'error') { mapAssetRedraw(); mapAssetStatus(msg.error); }
    });
    mapAssetRedraw();
});

function appendCartographyCurrentMarker(button, msg, pin) {
    button.classList.add('world-player-marker');
    const title = `${T('webview.mapAssets.currentLocation')}: ${pin.locationName || pin.locationId}`;
    button.title = title; button.setAttribute('aria-label', title);
    const standard = () => {
        button.replaceChildren();
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
        const head = document.createElementNS(svg.namespaceURI, 'circle');
        head.setAttribute('cx', '12'); head.setAttribute('cy', '7'); head.setAttribute('r', '4');
        const body = document.createElementNS(svg.namespaceURI, 'path');
        body.setAttribute('d', 'M4 22v-3a8 8 0 0 1 16 0v3Z'); svg.append(head, body); button.appendChild(svg);
    };
    if (msg.cartographyMarker?.mode === 'custom' && msg.cartographyMarker.image) {
        const image = document.createElement('img'); image.className = 'world-player-portrait'; image.alt = '';
        image.onerror = standard; image.onload = scheduleCartographyLabelLayout;
        image.src = msg.cartographyMarker.image; button.replaceChildren(image);
    } else standard();
}

let cartographyLabelFrame = 0;
function scheduleCartographyLabelLayout() {
    if (cartographyLabelFrame) cancelAnimationFrame(cartographyLabelFrame);
    cartographyLabelFrame = requestAnimationFrame(() => { cartographyLabelFrame = 0; layoutCartographyLabels(); });
}
function layoutCartographyLabels() {
    const stage = document.getElementById('world-cartography-stage');
    if (!stage || !stage.clientWidth) return;
    const labels = [...stage.querySelectorAll('[data-map-region]')];
    labels.forEach(label => { label.style.transform = 'translate(-50%, 0)'; });
    if (mapAssetEditing) return;
    const bounds = stage.getBoundingClientRect();
    const obstacles = [...stage.querySelectorAll('.world-map-pin')].map(pin => pin.getBoundingClientRect());
    const overlaps = (a, b) => a.left < b.right + 5 && a.right > b.left - 5 && a.top < b.bottom + 5 && a.bottom > b.top - 5;
    for (const label of labels) {
        if (label.hidden) continue;
        const initial = label.getBoundingClientRect();
        const candidates = [[0,0]];
        for (let distance = 1; distance <= 5; distance++) {
            const y = distance * (initial.height + 8), x = distance * (initial.width / 2 + 12);
            candidates.push([0,y],[0,-y],[x,0],[-x,0],[x,y],[-x,y],[x,-y],[-x,-y]);
        }
        let best, score = Infinity;
        for (const [dx,dy] of candidates) {
            const left = Math.max(bounds.left + 3, Math.min(bounds.right - initial.width - 3, initial.left + dx));
            const top = Math.max(bounds.top + 3, Math.min(bounds.bottom - initial.height - 3, initial.top + dy));
            const rect = { left, top, right: left + initial.width, bottom: top + initial.height };
            const cost = obstacles.filter(other => overlaps(rect,other)).length * 100000 + Math.hypot(left-initial.left,top-initial.top);
            if (cost < score) { best = rect; score = cost; }
            if (cost === 0) break;
        }
        if (best) {
            label.style.transform = `translate(calc(-50% + ${best.left-initial.left}px), ${best.top-initial.top}px)`;
            obstacles.push(best);
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const panel = document.getElementById('world-map-models');
    if (!panel) return;
    const toolbar = document.createElement('div'); toolbar.className = 'map-asset-controls';
    for (const [action, key] of [['addRoot', 'addFolder'], ['list', 'refresh'], ['close', 'close']]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'small-btn';
        button.dataset.i18n = `webview.mapAssets.${key}`; button.textContent = T(button.dataset.i18n);
        button.onclick = () => action === 'close' ? panel.classList.add('hidden') : vscode.postMessage({ type: 'worldMapModels', action });
        toolbar.appendChild(button);
    }
    const template = document.createElement('select'); template.setAttribute('aria-label', T('webview.mapAssets.workflow'));
    template.dataset.i18nAriaLabel = 'webview.mapAssets.workflow';
    for (const [id, title] of [['map-sdxl-canny', 'SDXL Canny / ControlNet'], ['map-sdxl-direct', 'SDXL Direct']]) {
        const option = document.createElement('option'); option.value = id; option.textContent = title; template.appendChild(option);
    }
    toolbar.appendChild(template);
    const hint = document.createElement('p'); hint.textContent = T('webview.mapAssets.modelHint');
    hint.dataset.i18n = 'webview.mapAssets.modelHint';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const roots = document.createElement('p');
    const list = document.createElement('div'); list.className = 'map-model-list';
    panel.append(toolbar, hint, roots, status, list);
    document.getElementById('world-map-models-btn')?.addEventListener('click', () => {
        panel.classList.remove('hidden'); vscode.postMessage({ type: 'worldMapModels', action: 'list' });
    });
    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg.type !== 'worldMapModelsState') return;
        const busy = msg.status === 'loading';
        toolbar.querySelectorAll('button').forEach(button => { button.disabled = busy; });
        list.querySelectorAll('button').forEach(button => { button.disabled = busy || button.dataset.compatible !== 'true'; });
        if (busy) { status.textContent = T('webview.mapAssets.scanning'); return; }
        if (msg.status === 'cancelled') { status.textContent = ''; return; }
        if (msg.status === 'error') { status.textContent = msg.error; return; }
        roots.textContent = (msg.roots || []).join(' / ');
        status.textContent = `${T(msg.comfyVerified ? 'webview.mapAssets.verified' : 'webview.mapAssets.unverified')} · ${msg.rows?.length || 0} · ${msg.selected || ''}`;
        list.replaceChildren();
        const table = document.createElement('table'), head = document.createElement('tr');
        for (const key of ['model', 'family', 'evidence', 'compatibility']) {
            const th = document.createElement('th'); th.dataset.i18n = `webview.mapAssets.${key}`;
            th.textContent = T(th.dataset.i18n); head.appendChild(th);
        }
        table.appendChild(head);
        for (const row of msg.rows || []) {
            const tr = document.createElement('tr');
            for (const text of [row.comfyName, `${row.evidence.category} / ${row.evidence.sidecarBaseModel || row.modelFamily}`,
                `${row.evidence.sidecarSource || 'filename'}: ${row.reasons.join(' ')}`]) {
                const td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
            }
            const td = document.createElement('td'), apply = document.createElement('button'); apply.type = 'button';
            apply.className = 'small-btn'; apply.disabled = !row.compatible;
            apply.dataset.compatible = String(row.compatible);
            apply.textContent = T(row.compatible ? 'webview.mapAssets.useModel' : 'webview.mapAssets.unsupported');
            apply.dataset.i18n = row.compatible ? 'webview.mapAssets.useModel' : 'webview.mapAssets.unsupported';
            apply.title = row.reason;
            apply.onclick = () => vscode.postMessage({ type: 'worldMapModels', action: 'apply',
                id: row.id, templateId: template.value });
            td.appendChild(apply); tr.appendChild(td); table.appendChild(tr);
        }
        list.appendChild(table);
    });
});
