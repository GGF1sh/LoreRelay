#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-MULTI-LOCATION-001-SLICE1
 * Integration: pushWorldViewToWebview() resolves fixed settlements by current World location.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const worldViewPath = path.join(root, 'out', 'worldView.js');
const gameRulesPath = path.join(root, 'out', 'gameRules.js');
const worldForgePath = path.join(root, 'out', 'worldForge.js');
const settlementStatePath = path.join(root, 'out', 'settlementState.js');
const vehicleStatePath = path.join(root, 'out', 'vehicleState.js');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(cond, msg) { if (cond) ok(msg); else fail(msg); }

for (const p of [worldViewPath, gameRulesPath, worldForgePath, settlementStatePath, vehicleStatePath]) {
    if (!fs.existsSync(p)) {
        fail(`${path.relative(root, p)} missing — run npm run compile`);
        process.exit(1);
    }
}

function writeJson(filePath, obj) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function baseRules(over = {}) {
    return {
        enableWorldForge: true,
        enableSettlementMode: true,
        enableSettlementDiorama: true,
        enableVehicleSystem: true,
        enableMobileBaseSystem: true,
        enableEmergentSimulation: false,
        enableCommerce: false,
        ...over,
    };
}

function baseForge(locations) {
    return {
        format: 'lorerelay-world-forge/1.0',
        meta: { worldName: 'Slice1 Test World', theme: 'fantasy', worldSeed: 'slice1' },
        geography: {
            regions: [
                { id: 'reg_coast', name: 'Coast', type: 'coastal', x: 100, y: 100, connectedTo: ['reg_forest'] },
                { id: 'reg_forest', name: 'Forest', type: 'forest', x: 200, y: 150, connectedTo: ['reg_coast'] },
            ],
            locations: locations || [
                { id: 'loc_sapphire_port', name: 'Sapphire Port', regionId: 'reg_coast', type: 'settlement' },
                { id: 'loc_mistgrove', name: 'Mistgrove', regionId: 'reg_forest', type: 'settlement' },
                { id: 'loc_empty', name: 'Empty Reach', regionId: 'reg_forest', type: 'wilderness' },
            ],
        },
        factions: [],
        loreHistory: [],
    };
}

function stateDoc(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        name: 'Sapphire Port',
        locationId: 'loc_sapphire_port',
        morale: 50,
        safety: 50,
        stocks: [],
        structures: [{ id: 'dock', name: 'Harbor Market', status: 'intact', layerId: 'z0' }],
        residents: [],
        visitors: [],
        merchants: [],
        incidents: [],
        ...over,
    };
}

function layoutDoc(over = {}) {
    return {
        version: 1,
        settlementId: 'set_port',
        layers: ['z0'],
        zones: [{ id: 'zone_a', layerId: 'z0', label: 'Harbor Market', x: 2, y: 2 }],
        markers: [],
        ...over,
    };
}

function vehicleWithMobileBase(settlementId) {
    return {
        version: 1,
        activeVehicleId: 'mb_hull',
        vehicles: [
            {
                id: 'mb_hull',
                name: 'Base Hull',
                kind: 'mobile_base',
                owner: { type: 'party' },
                status: 'parked',
                locationId: 'loc_sapphire_port',
                capacity: { crewRequired: 1, crewCapacity: 4, passengerCapacity: 2, cargoCapacity: 20 },
                access: { sizeClass: 'huge', accessTags: ['road'] },
                mobility: { speedBand: 'slow', rangeBand: 'regional', terrainTags: ['road'] },
                durability: { hp: 40, maxHp: 40, armorBand: 'heavy', condition: 'good' },
                mobileBase: {
                    settlementId,
                    mode: 'landship',
                    layoutProfile: 'deck',
                    dockedAtLocationId: 'loc_sapphire_port',
                },
            },
        ],
    };
}

function prepareWorkspace(dir, opts = {}) {
    const rules = opts.rules || baseRules();
    writeJson(path.join(dir, 'game_rules.json'), rules);
    if (opts.forge !== null) {
        writeJson(path.join(dir, 'world_forge.json'), opts.forge || baseForge());
    }
    if (opts.vehicleState) {
        writeJson(path.join(dir, 'vehicle_state.json'), opts.vehicleState);
    }
    if (opts.rootState) {
        writeJson(path.join(dir, 'settlement_state.json'), opts.rootState);
    }
    if (opts.rootLayout) {
        writeJson(path.join(dir, 'settlement_layout.json'), opts.rootLayout);
    }
    if (opts.scoped) {
        for (const [locId, docs] of Object.entries(opts.scoped)) {
            if (docs.state) {
                writeJson(path.join(dir, 'settlements', locId, 'settlement_state.json'), docs.state);
            }
            if (docs.layout) {
                writeJson(path.join(dir, 'settlements', locId, 'settlement_layout.json'), docs.layout);
            }
            if (docs.rawStateText != null) {
                const p = path.join(dir, 'settlements', locId, 'settlement_state.json');
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, docs.rawStateText, 'utf8');
            }
            if (docs.rawLayoutText != null) {
                const p = path.join(dir, 'settlements', locId, 'settlement_layout.json');
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, docs.rawLayoutText, 'utf8');
            }
        }
    }
}

function withWorldView(workspaceDir, fn) {
    const messages = [];
    const vscodeStub = {
        workspace: {
            isTrusted: true,
            workspaceFolders: [{ uri: { fsPath: workspaceDir }, name: 'slice1' }],
            getConfiguration: () => ({
                get: (_key, def) => (def !== undefined ? def : ''),
                update: async () => undefined,
            }),
            onDidChangeConfiguration: () => ({ dispose: () => {} }),
        },
        Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
        window: {
            showInformationMessage: () => undefined,
            showWarningMessage: () => undefined,
            showErrorMessage: () => undefined,
            createOutputChannel: () => ({
                appendLine: () => {},
                append: () => {},
                clear: () => {},
                show: () => {},
                dispose: () => {},
            }),
            setStatusBarMessage: () => undefined,
        },
        env: { language: 'en' },
    };

    // Clear module cache so workspace-bound loaders rebind if needed.
    for (const key of Object.keys(require.cache)) {
        if (key.includes(`${path.sep}out${path.sep}`) && key.startsWith(root)) {
            delete require.cache[key];
        }
    }

    const restore = installVscodeStub(vscodeStub);
    try {
        const gameRules = require(path.join(root, 'out', 'gameRules.js'));
        const worldForge = require(path.join(root, 'out', 'worldForge.js'));
        const settlementState = require(path.join(root, 'out', 'settlementState.js'));
        const vehicleState = require(path.join(root, 'out', 'vehicleState.js'));
        if (typeof gameRules.clearGameRulesCache === 'function') gameRules.clearGameRulesCache();
        if (typeof worldForge.clearWorldForgeCache === 'function') worldForge.clearWorldForgeCache();
        if (typeof settlementState.clearSettlementStateCache === 'function') settlementState.clearSettlementStateCache();
        if (typeof settlementState.clearSettlementLayoutCache === 'function') settlementState.clearSettlementLayoutCache();
        if (typeof vehicleState.clearVehicleStateCache === 'function') vehicleState.clearVehicleStateCache();

        const { initWorldView, pushWorldViewToWebview } = require(path.join(root, 'out', 'worldView.js'));
        const fakePanel = {
            webview: {
                postMessage(msg) {
                    messages.push(msg);
                },
            },
        };
        initWorldView({ getPanel: () => fakePanel });
        return fn({
            pushWorldViewToWebview,
            messages,
            lastWorldView() {
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i] && messages[i].type === 'worldView') return messages[i];
                }
                return null;
            },
            push(locationId) {
                messages.length = 0;
                pushWorldViewToWebview(locationId);
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i] && messages[i].type === 'worldView') return messages[i];
                }
                return null;
            },
        });
    } finally {
        restore();
        for (const key of Object.keys(require.cache)) {
            if (key.includes(`${path.sep}out${path.sep}`) && key.startsWith(root)) {
                delete require.cache[key];
            }
        }
    }
}

function isEmptyFixedSettlement(msg) {
    if (!msg || msg.enabled !== true) return false;
    const viewEmpty = msg.settlementView == null;
    const dioramaEmpty = msg.settlementDiorama == null;
    const previewsEmpty = !Array.isArray(msg.settlementExpansionPreviews)
        || msg.settlementExpansionPreviews.length === 0;
    return viewEmpty && dioramaEmpty && previewsEmpty;
}

function tileCodes(msg) {
    const tiles = msg?.settlementView?.tiles;
    if (!Array.isArray(tiles)) return [];
    return tiles.map((t) => t.code).sort();
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wv-slice1-'));

// ---------------------------------------------------------------------------
// 1. Two-city switching
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'two_city');
    prepareWorkspace(ws, {
        scoped: {
            loc_sapphire_port: {
                state: stateDoc({
                    settlementId: 'set_port',
                    name: 'Sapphire Port',
                    locationId: 'loc_sapphire_port',
                    structures: [{ id: 'dock', name: 'Harbor Market', status: 'intact', layerId: 'z0' }],
                }),
                layout: layoutDoc({
                    settlementId: 'set_port',
                    zones: [{ id: 'z_port', layerId: 'z0', label: 'Harbor Market', x: 1, y: 1 }],
                }),
            },
            loc_mistgrove: {
                state: stateDoc({
                    settlementId: 'set_grove',
                    name: 'Mistgrove',
                    locationId: 'loc_mistgrove',
                    structures: [{ id: 'shrine', name: 'Forest Shrine', status: 'intact', layerId: 'z0' }],
                }),
                layout: layoutDoc({
                    settlementId: 'set_grove',
                    zones: [{ id: 'z_grove', layerId: 'z0', label: 'Forest Shrine', x: 3, y: 4 }],
                }),
            },
        },
    });

    withWorldView(ws, ({ push }) => {
        const a = push('loc_sapphire_port');
        const b = push('loc_mistgrove');
        const c = push('loc_sapphire_port');

        check(a && a.enabled === true && a.settlementView?.settlementId === 'set_port', '1a port settlementId');
        check(b && b.settlementView?.settlementId === 'set_grove', '1b grove settlementId');
        check(c && c.settlementView?.settlementId === 'set_port', '1c return to port');
        check(a.settlementView?.name !== b.settlementView?.name, '1d names differ');
        const codesA = tileCodes(a).join(',');
        const codesB = tileCodes(b).join(',');
        check(codesA !== codesB || (a.settlementView?.tiles?.length !== b.settlementView?.tiles?.length)
            || JSON.stringify(a.settlementView?.tiles) !== JSON.stringify(b.settlementView?.tiles),
            '1e view tiles/markers differ between cities');
        check(a.settlementDiorama && b.settlementDiorama
            && a.settlementDiorama.settlementId === 'set_port'
            && b.settlementDiorama.settlementId === 'set_grove',
            '1f diorama follows same source as view');
    });
}

// ---------------------------------------------------------------------------
// 2. Empty location clears previous town
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'empty_clear');
    prepareWorkspace(ws, {
        scoped: {
            loc_mistgrove: {
                state: stateDoc({
                    settlementId: 'set_grove',
                    name: 'Mistgrove',
                    locationId: 'loc_mistgrove',
                }),
                layout: layoutDoc({ settlementId: 'set_grove' }),
            },
        },
    });

    withWorldView(ws, ({ push }) => {
        const grove = push('loc_mistgrove');
        const empty = push('loc_empty');
        check(grove?.settlementView?.settlementId === 'set_grove', '2a grove present first');
        check(isEmptyFixedSettlement(empty), '2b empty location clears fixed settlement fields');
        check(empty?.settlementView == null, '2c settlementView null');
        check(empty?.settlementDiorama == null, '2d settlementDiorama null');
        check(Array.isArray(empty?.settlementExpansionPreviews) && empty.settlementExpansionPreviews.length === 0,
            '2e expansion previews empty');
    });
}

// ---------------------------------------------------------------------------
// 3. State-only settlement (layout absent)
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'state_only');
    prepareWorkspace(ws, {
        scoped: {
            loc_sapphire_port: {
                state: stateDoc({ settlementId: 'set_port', locationId: 'loc_sapphire_port' }),
            },
        },
        // Valid root layout must NOT be mixed in for scoped state-only city
        rootLayout: layoutDoc({
            settlementId: 'set_other_root',
            zones: [{ id: 'z_root', layerId: 'z0', label: 'Root Only Zone', x: 9, y: 9 }],
        }),
        rootState: stateDoc({
            settlementId: 'set_other_root',
            locationId: 'loc_mistgrove',
            name: 'Wrong Root',
        }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(msg?.settlementView?.settlementId === 'set_port', '3a state-only view settles port');
        check(Array.isArray(msg?.settlementView?.warnings)
            && msg.settlementView.warnings.includes('layout_fallback'),
            '3b state-only uses layout_fallback');
        check(!JSON.stringify(msg?.settlementView || {}).includes('Root Only Zone'),
            '3c does not read root layout data');
    });
}

// ---------------------------------------------------------------------------
// 4. Scoped invalid data fails closed (no root fallback)
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'scoped_invalid');
    prepareWorkspace(ws, {
        scoped: {
            loc_sapphire_port: {
                rawStateText: '{ not valid json',
            },
        },
        rootState: stateDoc({
            settlementId: 'set_legacy_port',
            locationId: 'loc_sapphire_port',
            name: 'Legacy Port Should Not Show',
        }),
        rootLayout: layoutDoc({ settlementId: 'set_legacy_port' }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(isEmptyFixedSettlement(msg), '4a scoped invalid fails closed');
        check(msg?.settlementView?.settlementId !== 'set_legacy_port', '4b no root legacy fallback');
    });
}

// ---------------------------------------------------------------------------
// 5. Legacy Mobile Base exclusion
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'mb_exclude');
    prepareWorkspace(ws, {
        vehicleState: vehicleWithMobileBase('set_mb_home'),
        rootState: stateDoc({
            settlementId: 'set_mb_home',
            name: 'Mobile Base Town',
            locationId: 'loc_sapphire_port',
            structures: [{ id: 'bridge', name: 'Bridge Deck', status: 'intact', layerId: 'z0' }],
        }),
        rootLayout: layoutDoc({ settlementId: 'set_mb_home' }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(isEmptyFixedSettlement(msg), '5a root MB not emitted as fixed settlement');
        // Existing Mobile Base panel path still runs (may be null if settlement id mismatch validation)
        check(msg && msg.enableMobileBaseSystem === true, '5b mobile base system flag still present');
        // Panel may be null when root settlement is the MB and loadSettlementState finds it —
        // either way fixed settlement must stay empty.
        check(msg?.settlementView == null, '5c fixed settlementView remains null');
    });
}

// ---------------------------------------------------------------------------
// 6. Exact legacy fixed fallback
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'legacy_fixed');
    prepareWorkspace(ws, {
        vehicleState: vehicleWithMobileBase('set_mb_other'),
        rootState: stateDoc({
            settlementId: 'set_legacy_town',
            name: 'Legacy Sapphire',
            locationId: 'loc_sapphire_port',
        }),
        rootLayout: layoutDoc({ settlementId: 'set_legacy_town' }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(msg?.settlementView?.settlementId === 'set_legacy_town', '6a exact legacy fixed resolves');
        check(msg?.settlementView?.name === 'Legacy Sapphire', '6b legacy name');
        const wrong = push('loc_mistgrove');
        check(isEmptyFixedSettlement(wrong), '6c same root not shown for other city');
    });
}

// ---------------------------------------------------------------------------
// 7. Non-World-Forge compatibility
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'no_wf');
    prepareWorkspace(ws, {
        rules: baseRules({ enableWorldForge: false }),
        forge: null,
        rootState: stateDoc({ settlementId: 'set_root_only', locationId: 'loc_sapphire_port' }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(msg && msg.enabled === false, '7a non-World-Forge worldView disabled');
        check(msg.settlementView === undefined, '7b no settlementView on disabled worldView');
    });
}

// ---------------------------------------------------------------------------
// 8. Repeated deterministic push
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'deterministic');
    prepareWorkspace(ws, {
        scoped: {
            loc_sapphire_port: {
                state: stateDoc({ settlementId: 'set_port', locationId: 'loc_sapphire_port' }),
                layout: layoutDoc({ settlementId: 'set_port' }),
            },
        },
    });

    withWorldView(ws, ({ push }) => {
        const a = push('loc_sapphire_port');
        const b = push('loc_sapphire_port');
        const pick = (m) => ({
            settlementId: m?.settlementView?.settlementId,
            name: m?.settlementView?.name,
            tiles: m?.settlementView?.tiles,
            markers: m?.settlementView?.markers,
            dioramaId: m?.settlementDiorama?.settlementId,
            previews: m?.settlementExpansionPreviews,
        });
        check(JSON.stringify(pick(a)) === JSON.stringify(pick(b)), '8 repeated push semantically equal');
    });
}

// ---------------------------------------------------------------------------
// Bonus: owner-mismatched scoped does not use root
// ---------------------------------------------------------------------------
{
    const ws = path.join(tmpRoot, 'owner_mismatch');
    prepareWorkspace(ws, {
        scoped: {
            loc_sapphire_port: {
                state: stateDoc({
                    settlementId: 'set_port',
                    locationId: 'loc_mistgrove', // wrong location
                    name: 'Mismatched',
                }),
                layout: layoutDoc({ settlementId: 'set_port' }),
            },
        },
        rootState: stateDoc({
            settlementId: 'set_root_ok',
            locationId: 'loc_sapphire_port',
            name: 'Root OK',
        }),
        rootLayout: layoutDoc({ settlementId: 'set_root_ok' }),
    });

    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        check(isEmptyFixedSettlement(msg), 'bonus scoped location mismatch fails closed');
        check(msg?.settlementView?.settlementId !== 'set_root_ok', 'bonus no root after mismatch');
    });
}

try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
    // best-effort cleanup
}

if (failed > 0) {
    console.error(`\nworldview location-scoped settlement: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nHost integration cases: ${cases}`);
console.log('worldview location-scoped settlement: all passed');
