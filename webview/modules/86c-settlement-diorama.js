/* global document, window, vscode, THREE */

// ---------------------------------------------------------------------------
// Settlement low-poly diorama (M5b) — read-only Three.js renderer.
// Consumes ONLY msg.settlementDiorama (M5a SettlementDioramaSnapshot). Never
// reads settlement_state.json / settlement_layout.json / raw settlementView.
// Read-only: no turn ledger writes, no GM chat draft insertion in this pass.
// ---------------------------------------------------------------------------

let _dioramaWorldMsg = null;
let _dioramaControlsReady = false;
let _dioramaAvailable = null; // cached THREE/WebGL capability check
let _dioramaThreeLoadPromise = null;
let _dioramaThree = null; // { renderer, scene, camera, group, hitMeshes: [] }
let _dioramaOrbit = { yaw: 45, pitch: 35, distance: 16 };
let _dioramaTarget = { x: 0, y: 0, z: 0 };
let _dioramaDrag = null;
let _dioramaDidDrag = false;
let _lastDioramaSettlementId = null;
let _lastDioramaLayerId = null;
let _lastDioramaRevision = null;
let _dioramaSelected = null;
let _dioramaResizeQueued = false;

const DIORAMA_MATERIAL_COLOR = {
    stone: 0x8a8a90,
    wood: 0xa8794a,
    metal: 0x8090a8,
    cloth: 0xd8b060,
    water: 0x3a78b0,
    ruins: 0x707070,
    hazard: 0xc04030,
    light: 0xffe27a,
    neutral: 0x6a7280,
};

// Graphics Upgrade Track 2 — per-material PBR finish (metalness/roughness) so blocks/markers
// read as distinct surfaces under the directional light instead of one flat matte color.
// 'light'/'hazard' get a faint emissive glow so residents/incidents read as light sources
// even before the viewer notices the shadow. Display-only; no schema/payload change.
const DIORAMA_MATERIAL_FINISH = {
    stone: { metalness: 0.05, roughness: 0.9 },
    wood: { metalness: 0.0, roughness: 0.85 },
    metal: { metalness: 0.65, roughness: 0.35 },
    cloth: { metalness: 0.0, roughness: 0.95 },
    water: { metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.88 },
    ruins: { metalness: 0.05, roughness: 0.95 },
    hazard: { metalness: 0.0, roughness: 0.7, emissiveIntensity: 0.3 },
    light: { metalness: 0.0, roughness: 0.4, emissiveIntensity: 0.85 },
    neutral: { metalness: 0.05, roughness: 0.8 },
};

// Genre-linked lighting profile, keyed by the diorama snapshot's own `palette.theme`
// (already resolved server-side from the world genre — see `resolveDioramaThemeFromOvermap()`
// in src/settlementDioramaBridge.ts). No payload change: only client-side lighting tuning.
const DIORAMA_THEME_LIGHTING = {
    default: { dirIntensity: 0.75, ambientIntensity: 0.7, elevation: 55, azimuth: 35 },
    fantasy: { dirIntensity: 0.85, ambientIntensity: 0.7, elevation: 50, azimuth: 40 },
    postapoc: { dirIntensity: 0.7, ambientIntensity: 0.6, elevation: 40, azimuth: 30 },
    industrial: { dirIntensity: 0.6, ambientIntensity: 0.55, elevation: 60, azimuth: -20 },
    eastern: { dirIntensity: 0.9, ambientIntensity: 0.65, elevation: 45, azimuth: 55 },
    horror: { dirIntensity: 0.35, ambientIntensity: 0.45, elevation: 20, azimuth: 15 },
    scifi: { dirIntensity: 0.7, ambientIntensity: 0.6, elevation: 65, azimuth: -35 },
};

const DIORAMA_MARKER_SHAPE = {
    resident: 'cone',
    visitor: 'cone',
    merchant: 'cone',
    player: 'cone',
    incident: 'cylinder',
    stock_low: 'cylinder',
    project: 'box',
    structure_note: 'box',
};

const DIORAMA_PITCH_MIN = 8;
const DIORAMA_PITCH_MAX = 82;
const DIORAMA_DRAG_YAW_SENSITIVITY = 0.35;
const DIORAMA_DRAG_PITCH_SENSITIVITY = 0.3;
const DIORAMA_WHEEL_STEP_RATIO = 0.08;
const DIORAMA_HIT_RADIUS_PX = 3; // NDC-space hint only; raycaster does exact hit testing.

function dioramaPrefersReducedMotion() {
    try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function detectWebglSupport() {
    try {
        const canvas = document.createElement('canvas');
        return !!(window.WebGLRenderingContext
            && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch {
        return false;
    }
}

function resolveThreeScriptUri() {
    if (typeof window !== 'undefined' && window.__LR_THREE_SCRIPT_URI__) {
        return window.__LR_THREE_SCRIPT_URI__;
    }
    return null;
}

function isThreeAvailable() {
    if (_dioramaAvailable !== null) { return _dioramaAvailable; }
    const hasThree = typeof THREE !== 'undefined' && typeof THREE.Scene === 'function';
    _dioramaAvailable = hasThree && detectWebglSupport();
    return _dioramaAvailable;
}

/** Lazy-load vendor/three.min.js only when Diorama mode is actually used. */
function loadThreeJsLazy() {
    if (isThreeAvailable()) { return Promise.resolve(true); }
    const uri = resolveThreeScriptUri();
    if (!uri) { return Promise.resolve(false); }
    if (_dioramaThreeLoadPromise) { return _dioramaThreeLoadPromise; }
    _dioramaThreeLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = uri;
        script.async = true;
        script.onload = () => {
            _dioramaAvailable = null;
            resolve(isThreeAvailable());
        };
        script.onerror = () => resolve(false);
        document.head.appendChild(script);
    });
    return _dioramaThreeLoadPromise;
}

function getMobileBaseInteriorDiorama(msg) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return null; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return null; }
    return interior;
}

function getDioramaSnapshot() {
    const msg = _dioramaWorldMsg;
    const interior = getMobileBaseInteriorDiorama(msg);
    if (interior && interior.settlementDiorama) {
        return interior.settlementDiorama;
    }
    return msg && msg.settlementDiorama ? msg.settlementDiorama : null;
}

function escapeDioramaHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Coordinate mapping: snapshot uses (x, y=plane, z=height); Three.js scene is Y-up. ---
function toSceneVec(x, y, z) {
    return new THREE.Vector3(x, z, y);
}

function resolveDioramaMaterialColor(material) {
    return DIORAMA_MATERIAL_COLOR[material] !== undefined
        ? DIORAMA_MATERIAL_COLOR[material]
        : DIORAMA_MATERIAL_COLOR.neutral;
}

/** Builds a PBR material for a closed `SettlementDioramaMaterial` key (Track 2 finish differentiation). */
function buildDioramaMaterial(materialKey) {
    const color = resolveDioramaMaterialColor(materialKey);
    const finish = DIORAMA_MATERIAL_FINISH[materialKey] || DIORAMA_MATERIAL_FINISH.neutral;
    const opts = { color, metalness: finish.metalness, roughness: finish.roughness };
    if (finish.transparent) {
        opts.transparent = true;
        opts.opacity = finish.opacity ?? 1;
    }
    if (finish.emissiveIntensity) {
        opts.emissive = color;
        opts.emissiveIntensity = finish.emissiveIntensity;
    }
    return new THREE.MeshStandardMaterial(opts);
}

function buildGroundMaterial(hexColorString) {
    const color = parseInt(String(hexColorString).replace('#', ''), 16) || 0x3d4a3d;
    return new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 1 });
}

/** Unit light direction from elevation/azimuth degrees (Track 2 genre lighting profiles). */
function dioramaLightDirection(elevationDeg, azimuthDeg) {
    const el = (elevationDeg * Math.PI) / 180;
    const az = (azimuthDeg * Math.PI) / 180;
    return {
        x: Math.cos(el) * Math.sin(az),
        y: Math.sin(el),
        z: Math.cos(el) * Math.cos(az),
    };
}

/**
 * Applies shadow-camera framing, genre-tinted directional light, ambient intensity, and
 * scene fog for the current snapshot's bounds/palette. Called on both initial scene build
 * and content rebuild (bounds/theme can differ between settlements/layers).
 */
function configureDioramaLighting(t, snapshot) {
    const { width, depth, height } = snapshot.bounds;
    const maxDim = Math.max(width, depth, height, 4);
    const profile = DIORAMA_THEME_LIGHTING[snapshot.palette.theme] || DIORAMA_THEME_LIGHTING.default;
    const targetX = width / 2;
    const targetZ = depth / 2;

    const dir = dioramaLightDirection(profile.elevation, profile.azimuth);
    t.dirLight.position.set(targetX + dir.x * maxDim, dir.y * maxDim, targetZ + dir.z * maxDim);
    t.dirLight.target.position.set(targetX, 0, targetZ);
    t.dirLight.color = new THREE.Color(snapshot.palette.accent || '#ffffff');
    t.dirLight.intensity = profile.dirIntensity;

    const shadowCam = t.dirLight.shadow.camera;
    shadowCam.left = -maxDim;
    shadowCam.right = maxDim;
    shadowCam.top = maxDim;
    shadowCam.bottom = -maxDim;
    shadowCam.near = 0.5;
    shadowCam.far = maxDim * 4;
    shadowCam.updateProjectionMatrix();

    t.ambientLight.color = new THREE.Color(snapshot.palette.ambient || '#8899aa');
    t.ambientLight.intensity = profile.ambientIntensity;

    const fogColor = snapshot.palette.background || '#1a1a2e';
    const fogNear = Math.max(4, maxDim * 0.9);
    t.scene.fog = new THREE.Fog(fogColor, fogNear, fogNear + Math.max(4, maxDim * 2.1));
}

function disposeObject3D(obj) {
    if (!obj) { return; }
    obj.traverse((child) => {
        if (child.geometry) { child.geometry.dispose(); }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
}

function disposeSceneObjects() {
    const t = _dioramaThree;
    if (!t || !t.group) { return; }
    t.scene.remove(t.group);
    disposeObject3D(t.group);
    t.group = null;
    t.hitMeshes = [];
}

function disposeSettlementDioramaRenderer() {
    const t = _dioramaThree;
    if (!t) { return; }
    disposeSceneObjects();
    if (t.renderer) {
        t.renderer.dispose();
        if (typeof t.renderer.forceContextLoss === 'function') { t.renderer.forceContextLoss(); }
    }
    _dioramaThree = null;
    _lastDioramaSettlementId = null;
    _lastDioramaLayerId = null;
    _lastDioramaRevision = null;
}

function disposeSettlementDiorama() {
    disposeSettlementDioramaRenderer();
}

function rebuildDioramaSceneContent(snapshot) {
    const t = _dioramaThree;
    if (!t) { return null; }
    disposeSceneObjects();
    const group = new THREE.Group();
    const hitMeshes = [];
    group.add(buildGroundPlane(snapshot));
    for (const block of snapshot.blocks) {
        const mesh = buildBlockMesh(block);
        group.add(mesh);
        hitMeshes.push(mesh);
    }
    for (const marker of snapshot.markers) {
        const mesh = buildMarkerMesh(marker);
        group.add(mesh);
        hitMeshes.push(mesh);
    }
    t.scene.add(group);
    t.group = group;
    t.hitMeshes = hitMeshes;
    if (snapshot.palette?.background) {
        t.scene.background = new THREE.Color(snapshot.palette.background);
    }
    configureDioramaLighting(t, snapshot);
    return t;
}

function buildBlockMesh(block) {
    const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
    const mat = buildDioramaMaterial(block.material);
    const mesh = new THREE.Mesh(geo, mat);
    const center = toSceneVec(block.x, block.y, block.z);
    mesh.position.set(center.x, center.y + block.h / 2, center.z);
    mesh.userData = { kind: 'block', label: block.code };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
}

function buildMarkerMesh(marker) {
    const shape = DIORAMA_MARKER_SHAPE[marker.kind] || 'box';
    let geo;
    if (shape === 'cone') {
        geo = new THREE.ConeGeometry(0.16, 0.42, 8);
    } else if (shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
    } else {
        geo = new THREE.BoxGeometry(0.22, 0.3, 0.22);
    }
    const mat = buildDioramaMaterial(marker.material);
    const mesh = new THREE.Mesh(geo, mat);
    const pos = toSceneVec(marker.x, marker.y, marker.z);
    mesh.position.set(pos.x, pos.y + 0.2, pos.z);
    mesh.userData = { kind: 'marker', id: marker.id, label: marker.label };
    // Markers stay shadow receivers only (not casters) — 80 of them casting adds little
    // visible value over the block shadows and would double the shadow-pass draw calls.
    mesh.receiveShadow = true;
    return mesh;
}

function buildGroundPlane(snapshot) {
    const { width, depth } = snapshot.bounds;
    const geo = new THREE.BoxGeometry(width, 0.06, depth);
    const mat = buildGroundMaterial(snapshot.palette.ground);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((width - 1) / 2, -0.03, (depth - 1) / 2);
    mesh.userData = { kind: 'ground' };
    mesh.receiveShadow = true;
    return mesh;
}

function applyOrbitFromCamera(camera) {
    _dioramaOrbit = {
        yaw: camera.yaw,
        pitch: Math.max(DIORAMA_PITCH_MIN, Math.min(DIORAMA_PITCH_MAX, camera.pitch)),
        distance: camera.distance,
    };
    _dioramaTarget = { x: camera.target.x, y: camera.target.y, z: camera.target.z };
}

function updateDioramaCameraPosition() {
    const t = _dioramaThree;
    if (!t) { return; }
    const yawRad = (_dioramaOrbit.yaw * Math.PI) / 180;
    const pitchRad = (_dioramaOrbit.pitch * Math.PI) / 180;
    const dist = _dioramaOrbit.distance;
    const target = toSceneVec(_dioramaTarget.x, _dioramaTarget.y, _dioramaTarget.z);
    const horiz = dist * Math.cos(pitchRad);
    const x = target.x + horiz * Math.sin(yawRad);
    const y = target.y + dist * Math.sin(pitchRad);
    const z = target.z + horiz * Math.cos(yawRad);
    t.camera.position.set(x, y, z);
    t.camera.lookAt(target.x, target.y, target.z);
}

function renderDioramaOnce() {
    const t = _dioramaThree;
    if (!t) { return; }
    t.renderer.render(t.scene, t.camera);
}

function fitSettlementDioramaToSnapshot(snapshot) {
    applyOrbitFromCamera(snapshot.camera);
    updateDioramaCameraPosition();
    renderDioramaOnce();
}

function buildSettlementDioramaScene(canvas, snapshot) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(snapshot.palette.background);

    const ambientLight = new THREE.AmbientLight(snapshot.palette.ambient || '#8899aa', 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0015;
    scene.add(dirLight);
    scene.add(dirLight.target);

    const cssWidth = Math.max(1, canvas.clientWidth || 320);
    const cssHeight = Math.max(1, canvas.clientHeight || 260);
    const camera = new THREE.PerspectiveCamera(45, cssWidth / cssHeight, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const group = new THREE.Group();
    const hitMeshes = [];

    group.add(buildGroundPlane(snapshot));

    for (const block of snapshot.blocks) {
        const mesh = buildBlockMesh(block);
        group.add(mesh);
        hitMeshes.push(mesh);
    }
    for (const marker of snapshot.markers) {
        const mesh = buildMarkerMesh(marker);
        group.add(mesh);
        hitMeshes.push(mesh);
    }

    scene.add(group);

    const t = { renderer, scene, camera, group, hitMeshes, ambientLight, dirLight };
    configureDioramaLighting(t, snapshot);
    return t;
}

function dioramaSceneChanged(snapshot) {
    const revision = snapshot.revision || '';
    return snapshot.settlementId !== _lastDioramaSettlementId
        || snapshot.layerId !== _lastDioramaLayerId
        || revision !== _lastDioramaRevision;
}

function markDioramaSceneState(snapshot) {
    _lastDioramaSettlementId = snapshot.settlementId;
    _lastDioramaLayerId = snapshot.layerId;
    _lastDioramaRevision = snapshot.revision || '';
}

function ensureSettlementDioramaScene(snapshot) {
    if (_dioramaThree && !dioramaSceneChanged(snapshot)) {
        return _dioramaThree;
    }

    const canvas = document.getElementById('world-diorama-canvas');
    if (!canvas) { return null; }

    if (_dioramaThree) {
        rebuildDioramaSceneContent(snapshot);
        markDioramaSceneState(snapshot);
        applyOrbitFromCamera(snapshot.camera);
        _dioramaSelected = null;
        renderSettlementDioramaDetailPanel(null);
        return _dioramaThree;
    }

    disposeSettlementDioramaRenderer();
    _dioramaThree = buildSettlementDioramaScene(canvas, snapshot);
    markDioramaSceneState(snapshot);
    applyOrbitFromCamera(snapshot.camera);
    _dioramaSelected = null;
    renderSettlementDioramaDetailPanel(null);
    return _dioramaThree;
}

function hideSettlementDioramaTooltip() {
    const el = document.getElementById('world-diorama-tooltip');
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

function showSettlementDioramaTooltip(hit, clientX, clientY) {
    const el = document.getElementById('world-diorama-tooltip');
    const stage = document.getElementById('world-diorama-stage');
    if (!el || !stage || !hit) { return; }
    el.textContent = hit.label || '';
    el.classList.remove('hidden');
    const rect = stage.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left + 8, 4), rect.width - 4);
    const top = Math.min(Math.max(clientY - rect.top - 28, 4), rect.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function renderSettlementDioramaDetailPanel(hit) {
    const panel = document.getElementById('world-diorama-detail');
    if (!panel) { return; }
    if (!hit) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    panel.innerHTML = `<h4>${escapeDioramaHtml(hit.label || '')}</h4>`;
    panel.classList.remove('hidden');
}

function hitTestSettlementDiorama(clientX, clientY) {
    const t = _dioramaThree;
    const canvas = document.getElementById('world-diorama-canvas');
    if (!t || !canvas || !t.hitMeshes.length) { return null; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { return null; }
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), t.camera);
    const intersects = raycaster.intersectObjects(t.hitMeshes, false);
    if (!intersects.length) { return null; }
    return intersects[0].object.userData || null;
}

function renderSettlementDioramaMarkerFallback(snapshot) {
    const list = document.getElementById('world-diorama-marker-fallback');
    if (!list) { return; }
    const markers = Array.isArray(snapshot?.markers) ? snapshot.markers : [];
    if (!markers.length) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
    }
    const items = markers.slice(0, 80).map((m) => (
        `<li><button type="button" class="world-diorama-marker-item" data-marker-id="${escapeDioramaHtml(m.id)}">${escapeDioramaHtml(m.kind)}: ${escapeDioramaHtml(m.label)}</button></li>`
    )).join('');
    list.innerHTML = `<span class="world-diorama-marker-fallback-title">${typeof T === 'function' ? T('webview.world.dioramaMarkerList') : 'Markers'}</span><ul>${items}</ul>`;
    list.classList.remove('hidden');
    list.querySelectorAll('.world-diorama-marker-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-marker-id');
            const marker = markers.find((m) => m.id === id);
            if (marker) {
                _dioramaSelected = { label: `${marker.kind}: ${marker.label}` };
                renderSettlementDioramaDetailPanel(_dioramaSelected);
            }
        });
    });
}

function renderSettlementDioramaScene(snapshot) {
    const stage = document.getElementById('world-diorama-stage');
    const unavailable = document.getElementById('world-diorama-unavailable');
    const canvas = document.getElementById('world-diorama-canvas');
    if (!stage || !canvas || !snapshot) { return; }

    if (!isThreeAvailable()) {
        stage.classList.add('hidden');
        if (unavailable) {
            unavailable.classList.remove('hidden');
            unavailable.textContent = typeof T === 'function' ? T('webview.world.dioramaUnavailable') : 'Three.js / WebGL is unavailable in this Webview.';
        }
        disposeSettlementDiorama();
        renderSettlementDioramaMarkerFallback(snapshot);
        return;
    }

    if (unavailable) { unavailable.classList.add('hidden'); }
    stage.classList.remove('hidden');

    if (!stage.clientWidth) { return; }

    const t = ensureSettlementDioramaScene(snapshot);
    if (!t) { return; }
    resizeSettlementDiorama();
    renderSettlementDioramaMarkerFallback(snapshot);
    renderDioramaOnce();
}

function renderSettlementDiorama() {
    const stage = document.getElementById('world-diorama-stage');
    const empty = document.getElementById('world-diorama-empty');
    const unavailable = document.getElementById('world-diorama-unavailable');
    const canvas = document.getElementById('world-diorama-canvas');
    if (!stage || !canvas) { return; }

    const msg = _dioramaWorldMsg;
    const snapshot = getDioramaSnapshot();
    const flagOn = Boolean(msg && msg.enableSettlementDiorama === true);

    if (!flagOn || !snapshot) {
        stage.classList.add('hidden');
        if (unavailable) { unavailable.classList.add('hidden'); }
        if (empty) {
            empty.classList.remove('hidden');
            empty.textContent = typeof T === 'function' ? T('webview.world.dioramaEmpty') : 'No diorama data yet.';
        }
        disposeSettlementDiorama();
        renderSettlementDioramaMarkerFallback(null);
        renderSettlementDioramaDetailPanel(null);
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    renderSettlementDioramaMarkerFallback(snapshot);

    loadThreeJsLazy().then((ok) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        const fresh = getDioramaSnapshot();
        if (!fresh) { return; }
        if (!ok) {
            renderSettlementDioramaScene(fresh);
            return;
        }
        renderSettlementDioramaScene(fresh);
    });
}

function resizeSettlementDiorama() {
    const t = _dioramaThree;
    const canvas = document.getElementById('world-diorama-canvas');
    if (!t || !canvas) { return; }
    const cssWidth = Math.max(1, canvas.clientWidth || 1);
    const cssHeight = Math.max(180, Math.min(420, cssWidth * 0.7));
    const stage = document.getElementById('world-diorama-stage');
    if (stage) { stage.style.minHeight = `${cssHeight}px`; }
    t.camera.aspect = cssWidth / cssHeight;
    t.camera.updateProjectionMatrix();
    t.renderer.setSize(cssWidth, cssHeight, false);
    updateDioramaCameraPosition();
    renderDioramaOnce();
}

function queueSettlementDioramaResize() {
    if (_dioramaResizeQueued) { return; }
    _dioramaResizeQueued = true;
    requestAnimationFrame(() => {
        _dioramaResizeQueued = false;
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        resizeSettlementDiorama();
    });
}

function initSettlementDioramaControls() {
    if (_dioramaControlsReady) { return; }
    _dioramaControlsReady = true;

    const canvas = document.getElementById('world-diorama-canvas');
    const stage = document.getElementById('world-diorama-stage');
    if (!canvas || !stage) { return; }

    const zoomIn = document.getElementById('world-diorama-zoom-in');
    const zoomOut = document.getElementById('world-diorama-zoom-out');
    const zoomReset = document.getElementById('world-diorama-zoom-reset');
    const zoomFit = document.getElementById('world-diorama-zoom-fit');

    function clampDistance(d) {
        const snapshot = getDioramaSnapshot();
        const min = snapshot?.camera?.minDistance ?? 4;
        const max = snapshot?.camera?.maxDistance ?? 64;
        return Math.max(min, Math.min(max, d));
    }

    if (zoomIn) {
        zoomIn.addEventListener('click', () => {
            _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * (1 - DIORAMA_WHEEL_STEP_RATIO));
            updateDioramaCameraPosition();
            renderDioramaOnce();
        });
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', () => {
            _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * (1 + DIORAMA_WHEEL_STEP_RATIO));
            updateDioramaCameraPosition();
            renderDioramaOnce();
        });
    }
    if (zoomReset || zoomFit) {
        const resetHandler = () => {
            const snapshot = getDioramaSnapshot();
            if (snapshot) { fitSettlementDioramaToSnapshot(snapshot); }
        };
        if (zoomReset) { zoomReset.addEventListener('click', resetHandler); }
        if (zoomFit) { zoomFit.addEventListener('click', resetHandler); }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        _dioramaDidDrag = false;
        _dioramaDrag = { x: e.clientX, y: e.clientY, yaw: _dioramaOrbit.yaw, pitch: _dioramaOrbit.pitch };
    });
    window.addEventListener('mousemove', (e) => {
        if (!_dioramaDrag) { return; }
        const dx = e.clientX - _dioramaDrag.x;
        const dy = e.clientY - _dioramaDrag.y;
        if (Math.hypot(dx, dy) > 4) { _dioramaDidDrag = true; }
        _dioramaOrbit.yaw = _dioramaDrag.yaw + dx * DIORAMA_DRAG_YAW_SENSITIVITY;
        _dioramaOrbit.pitch = Math.max(
            DIORAMA_PITCH_MIN,
            Math.min(DIORAMA_PITCH_MAX, _dioramaDrag.pitch - dy * DIORAMA_DRAG_PITCH_SENSITIVITY)
        );
        updateDioramaCameraPosition();
        renderDioramaOnce();
    });
    window.addEventListener('mouseup', () => { _dioramaDrag = null; });

    canvas.addEventListener('wheel', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        e.preventDefault();
        const factor = e.deltaY > 0 ? (1 + DIORAMA_WHEEL_STEP_RATIO) : (1 - DIORAMA_WHEEL_STEP_RATIO);
        _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * factor);
        updateDioramaCameraPosition();
        renderDioramaOnce();
    }, { passive: false });

    canvas.addEventListener('mousemove', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') {
            hideSettlementDioramaTooltip();
            return;
        }
        if (_dioramaDrag) { return; }
        const hit = hitTestSettlementDiorama(e.clientX, e.clientY);
        if (hit) {
            showSettlementDioramaTooltip(hit, e.clientX, e.clientY);
        } else {
            hideSettlementDioramaTooltip();
        }
    });
    canvas.addEventListener('mouseleave', hideSettlementDioramaTooltip);

    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        if (_dioramaDidDrag) { return; }
        const hit = hitTestSettlementDiorama(e.clientX, e.clientY);
        _dioramaSelected = hit;
        renderSettlementDioramaDetailPanel(hit);
    });

    window.addEventListener('resize', () => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        queueSettlementDioramaResize();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initSettlementDioramaControls();
});
