#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-MULTI-LOCATION-001-SLICE2
 * Host: ephemeral settlement focus + display context via pushWorldViewToWebview.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

function writeJson(p, obj) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}

function baseRules(over = {}) {
    return {
        enableWorldForge: true,
        enableSettlementMode: true,
        enableSettlementDiorama: true,
        enableVehicleSystem: false,
        enableMobileBaseSystem: false,
        enableEmergentSimulation: false,
        enableCommerce: false,
        ...over,
    };
}

function baseForge() {
    return {
        format: 'lorerelay-world-forge/1.0',
        meta: { worldName: 'Focus Test World', theme: 'fantasy', worldSeed: 'slice2' },
        geography: {
            regions: [
                { id: 'reg_coast', name: 'Coast', type: 'coastal', x: 100, y: 100, connectedTo: ['reg_forest'] },
                { id: 'reg_forest', name: 'Forest', type: 'forest', x: 200, y: 150, connectedTo: ['reg_coast'] },
                { id: 'reg_delta', name: 'Reed Delta', type: 'swamp', x: 145, y: 125, connectedTo: ['reg_coast'] },
            ],
            locations: [
                { id: 'loc_sapphire_port', name: 'Sapphire Port', regionId: 'reg_coast', type: 'settlement' },
                { id: 'loc_mistgrove', name: 'Mistgrove', regionId: 'reg_forest', type: 'settlement' },
                { id: 'loc_reedmarket', name: 'Reedmarket', regionId: 'reg_delta', type: 'market' },
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

function prepareWorkspace(dir, opts = {}) {
    writeJson(path.join(dir, 'game_rules.json'), opts.rules || baseRules());
    writeJson(path.join(dir, 'world_forge.json'), opts.forge || baseForge());
    writeJson(path.join(dir, 'game_state.json'), {
        world: {
            currentLocationId: opts.currentLocationId || 'loc_sapphire_port',
            ...(opts.world || {}),
        },
    });
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
        }
    }
}

function withWorldView(workspaceDir, fn) {
    const messages = [];
    const vscodeStub = {
        workspace: {
            isTrusted: true,
            workspaceFolders: [{ uri: { fsPath: workspaceDir }, name: 'slice2' }],
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
                appendLine: () => {}, append: () => {}, clear: () => {}, show: () => {}, dispose: () => {},
            }),
            setStatusBarMessage: () => undefined,
        },
        env: { language: 'en' },
    };

    for (const key of Object.keys(require.cache)) {
        if (key.includes(`${path.sep}out${path.sep}`) && key.startsWith(root)) {
            delete require.cache[key];
        }
    }

    const restore = installVscodeStub(vscodeStub);
    try {
        const gameRules = require(path.join(root, 'out', 'gameRules.js'));
        const worldForge = require(path.join(root, 'out', 'worldForge.js'));
        if (typeof gameRules.clearGameRulesCache === 'function') gameRules.clearGameRulesCache();
        if (typeof worldForge.clearWorldForgeCache === 'function') worldForge.clearWorldForgeCache();

        const wv = require(path.join(root, 'out', 'worldView.js'));
        const fakePanel = {
            webview: {
                postMessage(msg) { messages.push(msg); },
            },
        };
        wv.initWorldView({ getPanel: () => fakePanel });

        function lastWorldView() {
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i] && messages[i].type === 'worldView') return messages[i];
            }
            return null;
        }

        function push(locationId) {
            messages.length = 0;
            wv.pushWorldViewToWebview(locationId);
            return lastWorldView();
        }

        return fn({ wv, push, lastWorldView, messages });
    } finally {
        restore();
        for (const key of Object.keys(require.cache)) {
            if (key.includes(`${path.sep}out${path.sep}`) && key.startsWith(root)) {
                delete require.cache[key];
            }
        }
    }
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-wv-focus-'));

const twoCityScoped = {
    loc_sapphire_port: {
        state: stateDoc({ settlementId: 'set_port', locationId: 'loc_sapphire_port', name: 'Sapphire Port' }),
        layout: layoutDoc({ settlementId: 'set_port' }),
    },
    loc_mistgrove: {
        state: stateDoc({
            settlementId: 'set_grove',
            locationId: 'loc_mistgrove',
            name: 'Mistgrove',
            structures: [{ id: 'shrine', name: 'Forest Shrine', status: 'intact', layerId: 'z0' }],
        }),
        layout: layoutDoc({
            settlementId: 'set_grove',
            zones: [{ id: 'z_grove', layerId: 'z0', label: 'Forest Shrine', x: 4, y: 5 }],
        }),
    },
    loc_reedmarket: {
        state: stateDoc({
            settlementId: 'set_reedmarket',
            locationId: 'loc_reedmarket',
            name: 'Reedmarket',
            structures: [{ id: 'reed_market', name: 'Open Fish Market', status: 'intact', layerId: 'z0' }],
        }),
        layout: layoutDoc({
            settlementId: 'set_reedmarket',
            zones: [{ id: 'reed_water', layerId: 'z0', label: 'North Canal Water', x: 1, y: 1 }],
        }),
    },
};

// 1. Default current city
{
    const ws = path.join(tmpRoot, 'default_current');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ push }) => {
        const msg = push('loc_sapphire_port');
        const ctx = msg?.settlementDisplayContext;
        check(ctx?.mode === 'current', '1 mode current');
        check(ctx?.displayLocationId === 'loc_sapphire_port', '1 displayLocationId port');
        check(msg?.settlementView?.settlementId === 'set_port', '1 settlement set_port');
        check(msg?.currentLocationId === 'loc_sapphire_port', '1 currentLocationId port');
    });
}

// 2. Remote preview
{
    const ws = path.join(tmpRoot, 'remote_preview');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        const msg = lastWorldView();
        const ctx = msg?.settlementDisplayContext;
        check(msg?.currentLocationId === 'loc_sapphire_port', '2 current stays port');
        check(ctx?.mode === 'preview', '2 mode preview');
        check(ctx?.displayLocationId === 'loc_mistgrove', '2 display mistgrove');
        check(ctx?.displayLocationName === 'Mistgrove', '2 display name');
        check(ctx?.currentLocationName === 'Sapphire Port', '2 current name');
        check(msg?.settlementView?.settlementId === 'set_grove', '2 settlement set_grove');
        // NPCs / commerce remain current-location based (empty lists ok; field identity)
        check(msg?.currentLocationId === 'loc_sapphire_port', '2 market/npc location field is port');
    });
}

// 3. Clear preview
{
    const ws = path.join(tmpRoot, 'clear_preview');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        check(lastWorldView()?.settlementView?.settlementId === 'set_grove', '3a focused grove');
        wv.clearWorldSettlementFocus();
        const msg = lastWorldView();
        check(msg?.settlementDisplayContext?.mode === 'current', '3b mode current after clear');
        check(msg?.settlementView?.settlementId === 'set_port', '3c port restored');
        check(!JSON.stringify(msg?.settlementView?.tiles || []).includes('Forest Shrine'), '3d no grove tiles');
    });
}

// 4. Select current pin normalizes
{
    const ws = path.join(tmpRoot, 'select_current');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        wv.setWorldSettlementFocus('loc_sapphire_port');
        const msg = lastWorldView();
        check(msg?.settlementDisplayContext?.mode === 'current', '4 mode current when focus=current');
        check(msg?.settlementView?.settlementId === 'set_port', '4 port payload');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '4 focus cleared');
    });
}

// 5. Missing remote settlement
{
    const ws = path.join(tmpRoot, 'missing_remote');
    prepareWorkspace(ws, {
        currentLocationId: 'loc_sapphire_port',
        scoped: {
            loc_sapphire_port: twoCityScoped.loc_sapphire_port,
            // loc_empty has no docs
        },
    });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_empty');
        const msg = lastWorldView();
        const ctx = msg?.settlementDisplayContext;
        check(ctx?.mode === 'preview', '5 mode still preview');
        check(ctx?.displayLocationId === 'loc_empty', '5 display empty location');
        check(ctx?.availability === 'missing', '5 availability missing');
        check(msg?.settlementView == null, '5 no settlementView');
        check(msg?.settlementDiorama == null, '5 no diorama');
        check(msg?.settlementView?.settlementId !== 'set_port', '5 no previous city leak');
    });
}

// 6. Invalid remote documents
{
    const ws = path.join(tmpRoot, 'invalid_remote');
    prepareWorkspace(ws, {
        currentLocationId: 'loc_sapphire_port',
        scoped: {
            loc_sapphire_port: twoCityScoped.loc_sapphire_port,
            loc_mistgrove: { rawStateText: '{ broken' },
        },
    });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        const msg = lastWorldView();
        const ctx = msg?.settlementDisplayContext;
        check(ctx?.availability === 'invalid', '6 availability invalid');
        check(msg?.settlementView == null, '6 no view fallback');
        check(msg?.settlementView?.settlementId !== 'set_port', '6 no previous/legacy leak');
        const blob = JSON.stringify(msg);
        check(!blob.includes('stack') && !blob.includes('{ broken'), '6 no raw error exposure');
    });
}

// 7. Invalid focus request
{
    const ws = path.join(tmpRoot, 'invalid_focus');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('../evil');
        check(lastWorldView()?.settlementView?.settlementId === 'set_port', '7a path-like rejected');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '7a no focus set');
        wv.setWorldSettlementFocus('_mobile_base');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '7b mobile_base rejected');
        wv.setWorldSettlementFocus('loc_unknown_city');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '7c unknown catalog rejected');
        check(lastWorldView()?.settlementDisplayContext?.mode === 'current', '7d stays current');
    });
}

// 8. Travel while focused
{
    const ws = path.join(tmpRoot, 'travel_focus');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        check(lastWorldView()?.settlementDisplayContext?.mode === 'preview', '8a preview grove');
        // Player travels to Grove
        writeJson(path.join(ws, 'game_state.json'), { world: { currentLocationId: 'loc_mistgrove' } });
        const msg = push('loc_mistgrove');
        check(msg?.settlementDisplayContext?.mode === 'current', '8b mode current after travel');
        check(msg?.currentLocationId === 'loc_mistgrove', '8c current grove');
        check(msg?.settlementDisplayContext?.displayLocationId === 'loc_mistgrove', '8d display grove');
        check(msg?.settlementView?.settlementId === 'set_grove', '8e grove settlement');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '8f focus cleared');
    });
}

// 9. Refresh retention
{
    const ws = path.join(tmpRoot, 'refresh_retain');
    prepareWorkspace(ws, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        const a = lastWorldView();
        const b = push('loc_sapphire_port');
        check(b?.settlementDisplayContext?.mode === 'preview', '9a preview retained');
        check(b?.settlementView?.settlementId === 'set_grove', '9b grove retained');
        check(b?.currentLocationId === 'loc_sapphire_port', '9c current unchanged');
        check(a?.settlementView?.settlementId === b?.settlementView?.settlementId, '9d same settlement');
    });
}

// 10. Workspace isolation
{
    const wsA = path.join(tmpRoot, 'ws_a');
    const wsB = path.join(tmpRoot, 'ws_b');
    prepareWorkspace(wsA, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });
    prepareWorkspace(wsB, { scoped: twoCityScoped, currentLocationId: 'loc_sapphire_port' });

    // Focus in A
    withWorldView(wsA, ({ wv, push, lastWorldView }) => {
        push('loc_sapphire_port');
        wv.setWorldSettlementFocus('loc_mistgrove');
        check(lastWorldView()?.settlementDisplayContext?.mode === 'preview', '10a A preview set');
    });
    // Re-init as B — initWorldView clears focus
    withWorldView(wsB, ({ wv, push }) => {
        const msg = push('loc_sapphire_port');
        check(msg?.settlementDisplayContext?.mode === 'current', '10b B does not inherit A focus');
        check(msg?.settlementView?.settlementId === 'set_port', '10c B shows current port');
        check(wv.getWorldSettlementFocusLocationId() === undefined, '10d B focus empty');
    });
}

// Pure core unit checks
{
    const core = require(path.join(root, 'out', 'worldViewSettlementFocusCore.js'));
    const catalog = new Set(['loc_sapphire_port', 'loc_mistgrove']);
    check(!core.validateSettlementFocusLocationId('../evil', catalog).ok, 'pure reject path');
    check(!core.validateSettlementFocusLocationId('_mobile_base', catalog).ok, 'pure reject mobile_base');
    check(core.validateSettlementFocusLocationId('loc_mistgrove', catalog).ok, 'pure accept mistgrove');
    const r = core.resolveSettlementDisplayLocationId({
        currentLocationId: 'loc_sapphire_port',
        focusedLocationId: 'loc_mistgrove',
    });
    check(r.mode === 'preview' && r.displayLocationId === 'loc_mistgrove', 'pure display resolve preview');
}

// 11. Exact Human Play Gate lifecycle: catalog -> pin -> Reedmarket preview -> clear.
{
    const ws = path.join(tmpRoot, 'reedmarket_lifecycle');
    prepareWorkspace(ws, {
        scoped: twoCityScoped,
        currentLocationId: 'loc_sapphire_port',
        world: {
            discoveredRegionIds: ['reg_coast', 'reg_delta'],
            visitedLocationIds: ['loc_sapphire_port'],
        },
    });
    withWorldView(ws, ({ wv, push, lastWorldView }) => {
        const initial = push('loc_sapphire_port');
        const reedPin = initial?.locationPinCatalog?.find((pin) => pin.locationId === 'loc_reedmarket');
        check(Boolean(reedPin), '11a Reedmarket is present in host locationPinCatalog');
        check(reedPin?.locationName === 'Reedmarket' && reedPin?.fogVisibility === 'discovered', '11b Reedmarket pin is named and selectable');
        check(Number.isFinite(reedPin?.leftPct) && reedPin.leftPct >= 0 && reedPin.leftPct <= 100
            && Number.isFinite(reedPin?.topPct) && reedPin.topPct >= 0 && reedPin.topPct <= 100,
        '11c Reedmarket coordinates are in map bounds');
        check(initial?.currentLocationId === 'loc_sapphire_port', '11d current starts at Sapphire Port');

        wv.setWorldSettlementFocus('loc_reedmarket');
        const preview = lastWorldView();
        check(preview?.currentLocationId === 'loc_sapphire_port', '11e preview keeps current location at Sapphire Port');
        check(preview?.settlementDisplayContext?.mode === 'preview'
            && preview?.settlementDisplayContext?.displayLocationId === 'loc_reedmarket', '11f Reedmarket preview context');
        check(preview?.settlementView?.settlementId === 'set_reedmarket', '11g Settlement uses set_reedmarket');
        check(preview?.settlementDiorama?.settlementId === 'set_reedmarket', '11h Diorama uses set_reedmarket');

        wv.clearWorldSettlementFocus();
        const restored = lastWorldView();
        check(restored?.currentLocationId === 'loc_sapphire_port', '11i clear keeps current at Sapphire Port');
        check(restored?.settlementDisplayContext?.mode === 'current'
            && restored?.settlementView?.settlementId === 'set_port', '11j clear restores Sapphire Port settlement');
    });
}

try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }

if (failed > 0) {
    console.error(`\nworldview settlement focus: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nHost focus cases: ${cases}`);
console.log('worldview settlement focus: all passed');
