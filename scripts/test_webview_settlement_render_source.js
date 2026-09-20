#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-VIEW-SOURCE-001 — pure unit tests for render-source selection.
 * Loads 86a-settlement-render-source.js in a minimal sandbox (no DOM draw).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '86a-settlement-render-source.js');
const indexHtml = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
const isoSrc = fs.readFileSync(path.join(root, 'webview', 'modules', '86b-settlement-isometric.js'), 'utf8');
const dioSrc = fs.readFileSync(path.join(root, 'webview', 'modules', '86c-settlement-diorama.js'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));
const ja = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'ja.json'), 'utf8'));

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

if (!fs.existsSync(modulePath)) {
    fail('86a-settlement-render-source.js missing');
    process.exit(1);
}

function loadApi() {
    const code = fs.readFileSync(modulePath, 'utf8');
    const sandbox = {
        document: {
            addEventListener() {},
            getElementById() { return null; },
        },
        T(key) { return en[key] || key; },
        console,
    };
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: '86a-settlement-render-source.js' });
    // Export helpers via re-eval of names
    return vm.runInContext(`({
        resolveSettlementRenderSource,
        setSettlementRenderSourceChoice,
        getSettlementRenderSourceChoice,
        onSettlementRenderSourceWorldMsg,
        getSelectedSettlementView,
        getSelectedSettlementDiorama,
        getSelectedSettlementExpansionPreviews,
        shouldShowSettlementSourceSelector,
        isMobileBaseRenderSourceSelected,
        isFixedSettlementAvailable,
        isMobileBaseInteriorAvailable,
        SETTLEMENT_RENDER_SOURCE_FIXED,
        SETTLEMENT_RENDER_SOURCE_MOBILE_BASE,
    })`, sandbox);
}

function baseMsg(over = {}) {
    return {
        enableMobileBaseSystem: true,
        enableSettlementMode: true,
        enableSettlementDiorama: true,
        currentLocationId: 'loc_sapphire_port',
        settlementDisplayContext: {
            mode: 'current',
            currentLocationId: 'loc_sapphire_port',
            currentLocationName: 'Sapphire Port',
            displayLocationId: 'loc_sapphire_port',
            displayLocationName: 'Sapphire Port',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_sapphire_port', tiles: [{ x: 0, y: 0, z: 0, code: 'market' }], markers: [] },
        settlementDiorama: { settlementId: 'set_sapphire_port', blocks: [{ id: 'b1' }], markers: [] },
        settlementExpansionPreviews: [{ layerId: 'z1', profile: 'cellar' }],
        mobileBaseInterior: {
            settlementId: 'mb_sapphire_barge',
            hasCanvas: true,
            vehicleName: 'Bluefin Barge',
            mode: 'ship',
            settlementView: { settlementId: 'mb_sapphire_barge', tiles: [{ x: 1, y: 1, z: 0, code: 'floor' }], markers: [{ label: 'Grain crates' }] },
            settlementDiorama: { settlementId: 'mb_sapphire_barge', blocks: [{ id: 'mb1' }], markers: [] },
            settlementExpansionPreviews: [{ layerId: 'z1', profile: 'roof' }],
        },
        ...over,
    };
}

const api = loadApi();

// Reset helper between cases
function reset() {
    api.setSettlementRenderSourceChoice(null);
    api.onSettlementRenderSourceWorldMsg(null);
}

// 1. preview fixed + MB → fixed
{
    reset();
    const msg = baseMsg({
        settlementDisplayContext: {
            mode: 'preview',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_mistgrove',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_mistgrove', tiles: [{ x: 0, y: 0, z: 0, code: 'shrine' }], markers: [] },
        settlementDiorama: { settlementId: 'set_mistgrove', blocks: [{ id: 'g1' }], markers: [] },
    });
    api.setSettlementRenderSourceChoice('mobile_base');
    const r = api.resolveSettlementRenderSource(msg);
    check(r.source === 'fixed', '1 preview forces fixed despite MB choice');
    check(api.getSelectedSettlementView(msg).settlementId === 'set_mistgrove', '1 view is mistgrove');
    check(api.getSelectedSettlementDiorama(msg).settlementId === 'set_mistgrove', '1 diorama is mistgrove');
    check(!api.shouldShowSettlementSourceSelector(msg), '1 selector hidden in preview');
}

// 2. preview missing + MB → missing, not MB
{
    reset();
    const msg = baseMsg({
        settlementDisplayContext: {
            mode: 'preview',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_empty',
            availability: 'missing',
        },
        settlementView: null,
        settlementDiorama: null,
        settlementExpansionPreviews: [],
    });
    const r = api.resolveSettlementRenderSource(msg);
    check(r.source === null, '2 preview missing → no source');
    check(api.getSelectedSettlementView(msg) == null, '2 no MB fallback view');
    check(api.getSelectedSettlementDiorama(msg) == null, '2 no MB fallback diorama');
}

// 3. current fixed + MB → fixed by default
{
    reset();
    const msg = baseMsg();
    api.onSettlementRenderSourceWorldMsg(msg);
    const r = api.resolveSettlementRenderSource(msg);
    check(r.source === 'fixed', '3 default fixed when both available');
    check(api.getSelectedSettlementView(msg).settlementId === 'set_sapphire_port', '3 default view port');
    check(api.shouldShowSettlementSourceSelector(msg), '3 selector shown when both available');
    check(!api.isMobileBaseRenderSourceSelected(msg), '3 MB not selected by default');
}

// 4. explicit current MB selection
{
    reset();
    const msg = baseMsg();
    api.onSettlementRenderSourceWorldMsg(msg);
    api.setSettlementRenderSourceChoice('mobile_base');
    check(api.resolveSettlementRenderSource(msg).source === 'mobile_base', '4 explicit MB');
    check(api.getSelectedSettlementView(msg).settlementId === 'mb_sapphire_barge', '4 MB view');
    check(api.isMobileBaseRenderSourceSelected(msg), '4 MB selected flag');
}

// 5. Settlement and Diorama IDs match
{
    reset();
    const msg = baseMsg();
    api.setSettlementRenderSourceChoice('mobile_base');
    const v = api.getSelectedSettlementView(msg);
    const d = api.getSelectedSettlementDiorama(msg);
    check(v.settlementId === d.settlementId, '5 2D/3D IDs match (MB)');
    api.setSettlementRenderSourceChoice('fixed');
    const v2 = api.getSelectedSettlementView(msg);
    const d2 = api.getSelectedSettlementDiorama(msg);
    check(v2.settlementId === d2.settlementId && v2.settlementId === 'set_sapphire_port', '5 2D/3D IDs match (fixed)');
}

// 6. expansion previews follow same source
{
    reset();
    const msg = baseMsg();
    api.setSettlementRenderSourceChoice('fixed');
    check(api.getSelectedSettlementExpansionPreviews(msg)[0].profile === 'cellar', '6 fixed previews');
    api.setSettlementRenderSourceChoice('mobile_base');
    check(api.getSelectedSettlementExpansionPreviews(msg)[0].profile === 'roof', '6 MB previews');
}

// 7. banner only in MB mode — covered by isMobileBaseRenderSourceSelected
{
    reset();
    const msg = baseMsg();
    check(!api.isMobileBaseRenderSourceSelected(msg), '7a banner flag off for fixed');
    api.setSettlementRenderSourceChoice('mobile_base');
    check(api.isMobileBaseRenderSourceSelected(msg), '7b banner flag on for MB');
    const preview = baseMsg({
        settlementDisplayContext: {
            mode: 'preview',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_mistgrove',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_mistgrove', tiles: [{}], markers: [] },
    });
    check(!api.isMobileBaseRenderSourceSelected(preview), '7c banner flag off in preview even if choice MB');
}

// 8. MB → remote preview forces fixed
{
    reset();
    const current = baseMsg();
    api.onSettlementRenderSourceWorldMsg(current);
    api.setSettlementRenderSourceChoice('mobile_base');
    const preview = baseMsg({
        settlementDisplayContext: {
            mode: 'preview',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_reedmarket',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_reedmarket', tiles: [{}], markers: [] },
        settlementDiorama: { settlementId: 'set_reedmarket', blocks: [{}], markers: [] },
    });
    api.onSettlementRenderSourceWorldMsg(preview);
    check(api.resolveSettlementRenderSource(preview).source === 'fixed', '8 preview forces fixed');
    check(api.getSelectedSettlementView(preview).settlementId === 'set_reedmarket', '8 reedmarket not barge');
}

// 9. clear preview returns to fixed
{
    reset();
    const current = baseMsg();
    api.onSettlementRenderSourceWorldMsg(current);
    api.setSettlementRenderSourceChoice('mobile_base');
    const preview = baseMsg({
        settlementDisplayContext: {
            mode: 'preview',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_mistgrove',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_mistgrove', tiles: [{}], markers: [] },
    });
    api.onSettlementRenderSourceWorldMsg(preview);
    // return to current
    api.onSettlementRenderSourceWorldMsg(current);
    check(api.getSettlementRenderSourceChoice() == null, '9 choice cleared after leaving preview');
    check(api.resolveSettlementRenderSource(current).source === 'fixed', '9 returns to fixed default');
}

// 10. unchanged current refresh retains explicit MB
{
    reset();
    const msg = baseMsg();
    api.onSettlementRenderSourceWorldMsg(msg);
    api.setSettlementRenderSourceChoice('mobile_base');
    api.onSettlementRenderSourceWorldMsg(msg); // refresh same location
    check(api.getSettlementRenderSourceChoice() === 'mobile_base', '10 retain MB choice on refresh');
    check(api.resolveSettlementRenderSource(msg).source === 'mobile_base', '10 still MB');
}

// 11. current location change resets to fixed
{
    reset();
    const a = baseMsg({
        currentLocationId: 'loc_sapphire_port',
        settlementDisplayContext: {
            mode: 'current',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_sapphire_port',
            availability: 'available',
        },
    });
    api.onSettlementRenderSourceWorldMsg(a);
    api.setSettlementRenderSourceChoice('mobile_base');
    const b = baseMsg({
        currentLocationId: 'loc_mistgrove',
        settlementDisplayContext: {
            mode: 'current',
            currentLocationId: 'loc_mistgrove',
            displayLocationId: 'loc_mistgrove',
            availability: 'available',
        },
        settlementView: { settlementId: 'set_mistgrove', tiles: [{}], markers: [] },
        settlementDiorama: { settlementId: 'set_mistgrove', blocks: [{}], markers: [] },
    });
    api.onSettlementRenderSourceWorldMsg(b);
    check(api.getSettlementRenderSourceChoice() == null, '11 location change clears choice');
    check(api.resolveSettlementRenderSource(b).source === 'fixed', '11 new city defaults fixed');
}

// 12. current fixed-only
{
    reset();
    const msg = baseMsg({ mobileBaseInterior: null, enableMobileBaseSystem: false });
    check(api.resolveSettlementRenderSource(msg).source === 'fixed', '12 fixed only');
    check(!api.shouldShowSettlementSourceSelector(msg), '12 no selector');
}

// 13. current Mobile-Base-only
{
    reset();
    const msg = baseMsg({
        settlementView: null,
        settlementDiorama: null,
        settlementExpansionPreviews: [],
        settlementDisplayContext: {
            mode: 'current',
            currentLocationId: 'loc_sapphire_port',
            displayLocationId: 'loc_sapphire_port',
            availability: 'missing',
        },
    });
    check(api.resolveSettlementRenderSource(msg).source === 'mobile_base', '13 MB only when fixed missing');
    check(!api.shouldShowSettlementSourceSelector(msg), '13 no selector when only MB');
}

// 14. neither source
{
    reset();
    const msg = baseMsg({
        settlementView: null,
        settlementDiorama: null,
        mobileBaseInterior: null,
        settlementDisplayContext: {
            mode: 'current',
            currentLocationId: 'loc_empty',
            displayLocationId: 'loc_empty',
            availability: 'missing',
        },
    });
    check(api.resolveSettlementRenderSource(msg).source === null, '14 neither source');
    check(api.getSelectedSettlementView(msg) == null, '14 no stale view');
}

// 15. legacy context absent preserves MB-first
{
    reset();
    const msg = {
        enableMobileBaseSystem: true,
        settlementView: { settlementId: 'set_root', tiles: [{}], markers: [] },
        settlementDiorama: { settlementId: 'set_root', blocks: [{}], markers: [] },
        mobileBaseInterior: {
            settlementId: 'mb_x',
            settlementView: { settlementId: 'mb_x', tiles: [{}], markers: [] },
            settlementDiorama: { settlementId: 'mb_x', blocks: [{}], markers: [] },
        },
    };
    check(api.resolveSettlementRenderSource(msg).source === 'mobile_base', '15 legacy MB-first');
    check(api.getSelectedSettlementView(msg).settlementId === 'mb_x', '15 legacy selects MB');
}

// 16. no stale previous after source becomes unavailable
{
    reset();
    const msg = baseMsg();
    api.onSettlementRenderSourceWorldMsg(msg);
    api.setSettlementRenderSourceChoice('mobile_base');
    const gone = baseMsg({
        mobileBaseInterior: null,
        enableMobileBaseSystem: false,
    });
    api.onSettlementRenderSourceWorldMsg(gone);
    check(api.getSettlementRenderSourceChoice() == null || api.resolveSettlementRenderSource(gone).source === 'fixed',
        '16 MB choice cleared when unavailable');
    check(api.getSelectedSettlementView(gone).settlementId === 'set_sapphire_port', '16 falls back to fixed');
}

// Source wiring present in product modules
check(isoSrc.includes('getSelectedSettlementView'), '86b uses shared view selector');
check(isoSrc.includes('isMobileBaseRenderSourceSelected'), '86b gates MB banner');
check(dioSrc.includes('getSelectedSettlementDiorama'), '86c uses shared diorama selector');
check(indexHtml.includes('world-settlement-source-bar'), 'settlement source bar DOM');
check(indexHtml.includes('world-diorama-source-bar'), 'diorama source bar DOM');
check(en['webview.world.settlementSourceFixed'] && ja['webview.world.settlementSourceFixed'], 'locale keys en/ja');

if (failed > 0) {
    console.error(`\nsettlement render source: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nSettlement render source cases: ${cases}`);
console.log('webview settlement render source: all passed');
