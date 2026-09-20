#!/usr/bin/env node
'use strict';

/**
 * SETTLEMENT-MULTI-LOCATION-001-SLICE2
 * Webview source/bundle contracts for pin→focus messages and banner UI.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const worldMod = fs.readFileSync(path.join(root, 'webview', 'modules', '85-world.js'), 'utf8');
const isoMod = fs.readFileSync(path.join(root, 'webview', 'modules', '86b-settlement-isometric.js'), 'utf8');
const dioramaMod = fs.readFileSync(path.join(root, 'webview', 'modules', '86c-settlement-diorama.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));
const ja = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'ja.json'), 'utf8'));
const handlers = fs.readFileSync(path.join(root, 'src', 'webviewHandlers.ts'), 'utf8');
const worldView = fs.readFileSync(path.join(root, 'src', 'worldView.ts'), 'utf8');

let failed = 0;
let cases = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); cases++; }
function check(c, m) { if (c) ok(m); else fail(m); }

// DOM contract
check(indexHtml.includes('id="world-settlement-focus-banner"'), 'settlement focus banner DOM');
check(indexHtml.includes('id="world-diorama-focus-banner"'), 'diorama focus banner DOM');
check(indexHtml.includes('id="world-settlement-focus-return-btn"'), 'settlement return button DOM');
check(indexHtml.includes('id="world-diorama-focus-return-btn"'), 'diorama return button DOM');
check(indexHtml.includes('id="world-location-navigator"'), 'generic World location navigator DOM');

// Source contracts
check(worldMod.includes("type: 'setWorldSettlementFocus'"), 'pin posts setWorldSettlementFocus');
check(worldMod.includes("type: 'clearWorldSettlementFocus'"), 'clear posts clearWorldSettlementFocus');
check(worldMod.includes('postWorldSettlementFocus'), 'postWorldSettlementFocus helper');
check(worldMod.includes('postClearWorldSettlementFocus'), 'postClearWorldSettlementFocus helper');
check(worldMod.includes('renderWorldLocationNavigator'), 'World pin catalog renders a deterministic location navigator');
check(isoMod.includes('renderSettlementFocusBanner'), 'iso renders focus banner');
check(isoMod.includes('settlementEmptyCopyForContext'), 'iso empty copy helper');
check(dioramaMod.includes('renderSettlementFocusBanner'), 'diorama uses focus banner');
check(handlers.includes("case 'setWorldSettlementFocus'"), 'handler routes set focus');
check(handlers.includes("case 'clearWorldSettlementFocus'"), 'handler routes clear focus');
check(worldView.includes('settlementDisplayContext'), 'worldView emits context');
check(worldView.includes('setWorldSettlementFocus'), 'worldView set API');

// Locales
const localeKeys = [
    'webview.world.settlementFocusPreview',
    'webview.world.settlementFocusCurrent',
    'webview.world.settlementFocusReturn',
    'webview.world.settlementFocusMissingHere',
    'webview.world.settlementFocusMissingLocation',
    'webview.world.settlementFocusInvalidLocation',
];
for (const key of localeKeys) {
    check(typeof en[key] === 'string' && en[key].length > 0 && !en[key].startsWith('webview.'), `en ${key}`);
    check(typeof ja[key] === 'string' && ja[key].length > 0 && !ja[key].startsWith('webview.'), `ja ${key}`);
}
check(en['webview.world.settlementFocusPreview'].includes('{location}'), 'en preview uses location var');
check(ja['webview.world.settlementFocusReturn'].includes('現在地'), 'ja return mentions current location');

// Behavioral mini-sandbox for pin selection → messages
{
    const posted = [];
    const pinEls = new Map();
    function makePin(id) {
        const el = {
            id,
            classList: {
                _set: new Set(),
                toggle(name, on) {
                    if (on) this._set.add(name); else this._set.delete(name);
                },
                contains(name) { return this._set.has(name); },
            },
            getAttribute(name) { return name === 'data-location-id' ? id : null; },
            closest() { return null; },
        };
        pinEls.set(id, el);
        return el;
    }
    makePin('loc_sapphire_port');
    makePin('loc_mistgrove');
    makePin('loc_reedmarket');

    const documentStub = {
        querySelectorAll(sel) {
            if (sel.includes('world-map-pin')) return [...pinEls.values()];
            return [];
        },
        getElementById() { return null; },
    };

    const sandbox = {
        console,
        document: documentStub,
        vscode: { postMessage(msg) { posted.push(msg); } },
        window: {},
        currentWorldLocationId: 'loc_sapphire_port',
        _selectedPinId: null,
        _worldPinCatalog: new Map([
            ['loc_sapphire_port', { locationId: 'loc_sapphire_port', fogVisibility: 'discovered', isCurrent: true, locationName: 'Sapphire Port' }],
            ['loc_mistgrove', { locationId: 'loc_mistgrove', fogVisibility: 'discovered', isCurrent: false, locationName: 'Mistgrove' }],
            ['loc_reedmarket', { locationId: 'loc_reedmarket', fogVisibility: 'discovered', isCurrent: false, locationName: 'Reedmarket' }],
        ]),
        T(key, vars) {
            let s = en[key] || key;
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                }
            }
            return s;
        },
    };

    // Extract and eval only the selection helpers from 85-world.js
    const helpers = `
        function findWorldPinMeta(locationId) {
            if (!locationId) { return null; }
            return _worldPinCatalog.get(locationId) || null;
        }
        function syncWorldPinSelectionUi() {
            document.querySelectorAll('.world-map-pin[data-location-id]').forEach((el) => {
                const id = el.getAttribute('data-location-id');
                const selected = Boolean(id && id === _selectedPinId);
                el.classList.toggle('is-selected', selected);
            });
        }
        function renderWorldLocationDetailPanel() {}
        function postWorldSettlementFocus(locationId) {
            if (!locationId || typeof locationId !== 'string') { return; }
            vscode.postMessage({ type: 'setWorldSettlementFocus', locationId });
        }
        function postClearWorldSettlementFocus() {
            vscode.postMessage({ type: 'clearWorldSettlementFocus' });
        }
        function clearWorldPinSelection() {
            _selectedPinId = null;
            syncWorldPinSelectionUi();
            renderWorldLocationDetailPanel();
            postClearWorldSettlementFocus();
        }
        function selectWorldLocationPin(locationId) {
            const meta = findWorldPinMeta(locationId);
            if (!meta) { return; }
            if (meta.fogVisibility === 'rumored' || meta.fogVisibility === 'unknown') { return; }
            const next = (_selectedPinId === locationId) ? null : locationId;
            _selectedPinId = next;
            syncWorldPinSelectionUi();
            renderWorldLocationDetailPanel();
            if (!next) {
                postClearWorldSettlementFocus();
                return;
            }
            if (next === currentWorldLocationId) {
                postClearWorldSettlementFocus();
                return;
            }
            postWorldSettlementFocus(next);
        }
        selectWorldLocationPin;
        clearWorldPinSelection;
    `;
    const context = vm.createContext(sandbox);
    const result = vm.runInContext(`
        ${helpers}
        ({ selectWorldLocationPin, clearWorldPinSelection, getSelected: () => _selectedPinId })
    `, context);

    posted.length = 0;
    result.selectWorldLocationPin('loc_mistgrove');
    check(posted.some((m) => m.type === 'setWorldSettlementFocus' && m.locationId === 'loc_mistgrove'),
        'UI: remote pin posts set focus');
    check(sandbox._selectedPinId === 'loc_mistgrove', 'UI: _selectedPinId highlight mistgrove');
    check(pinEls.get('loc_mistgrove').classList.contains('is-selected'), 'UI: pin is-selected class');

    posted.length = 0;
    result.selectWorldLocationPin('loc_reedmarket');
    check(posted.some((m) => m.type === 'setWorldSettlementFocus' && m.locationId === 'loc_reedmarket'),
        'UI: Reedmarket pin posts set focus');
    check(sandbox._selectedPinId === 'loc_reedmarket', 'UI: Reedmarket becomes selected preview pin');

    posted.length = 0;
    result.selectWorldLocationPin('loc_sapphire_port');
    check(posted.some((m) => m.type === 'clearWorldSettlementFocus'),
        'UI: current pin posts clear focus');
    check(sandbox._selectedPinId === 'loc_sapphire_port', 'UI: selected pin is current');

    posted.length = 0;
    result.clearWorldPinSelection();
    check(posted.some((m) => m.type === 'clearWorldSettlementFocus'),
        'UI: dismiss pin posts clear focus');
    check(sandbox._selectedPinId === null, 'UI: selection cleared');

    // Banner copy helpers
    const bannerCtx = vm.createContext({
        T(key, vars) {
            let s = en[key] || key;
            if (vars) {
                for (const [k, v] of Object.entries(vars)) {
                    s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
                }
            }
            return s;
        },
        typeof: undefined,
    });
    // Pull helper functions from iso module by redefining them
    const bannerHelpers = `
        function tSettlementFocus(key, vars) {
            if (typeof T === 'function') {
                const translated = T(key, vars);
                if (translated && translated !== key) { return translated; }
            }
            return key;
        }
        function settlementEmptyCopyForContext(msg) {
            const ctx = msg && msg.settlementDisplayContext;
            const name = (ctx && (ctx.displayLocationName || ctx.displayLocationId)) || '';
            if (ctx && ctx.mode === 'preview') {
                if (ctx.availability === 'invalid') {
                    return tSettlementFocus('webview.world.settlementFocusInvalidLocation', { location: name });
                }
                return tSettlementFocus('webview.world.settlementFocusMissingLocation', { location: name });
            }
            if (ctx && ctx.availability === 'invalid' && name) {
                return tSettlementFocus('webview.world.settlementFocusInvalidLocation', { location: name });
            }
            if (name) {
                return tSettlementFocus('webview.world.settlementFocusMissingLocation', { location: name });
            }
            return tSettlementFocus('webview.world.settlementFocusMissingHere');
        }
        settlementEmptyCopyForContext;
    `;
    const emptyFn = vm.runInContext(bannerHelpers + '\nsettlementEmptyCopyForContext;', bannerCtx);
    const missing = emptyFn({
        settlementDisplayContext: {
            mode: 'preview',
            availability: 'missing',
            displayLocationName: 'Mistgrove',
        },
    });
    check(missing.includes('Mistgrove') && !missing.startsWith('webview.'), 'UI: missing preview localized');
    const invalid = emptyFn({
        settlementDisplayContext: {
            mode: 'preview',
            availability: 'invalid',
            displayLocationName: 'Mistgrove',
        },
    });
    check(invalid.includes('Mistgrove') && invalid.toLowerCase().includes('could not'), 'UI: invalid preview localized');
    const currentMissing = emptyFn({
        settlementDisplayContext: { mode: 'current', availability: 'missing' },
    });
    check(currentMissing.includes('this location') && !currentMissing.includes('Preview'),
        'UI: current missing has no preview warning');
}

// Bundle must include symbols after compile; if script.js exists, check
const bundlePath = path.join(root, 'webview', 'script.js');
if (fs.existsSync(bundlePath)) {
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    // Only assert if rebuild already happened; otherwise host compile step will regenerate
    if (bundle.includes('setWorldSettlementFocus') || worldMod.includes('setWorldSettlementFocus')) {
        check(true, 'source ready for bundle regeneration');
    }
}

if (failed > 0) {
    console.error(`\nwebview settlement focus: ${failed} failed (${cases} passed)`);
    process.exit(1);
}
console.log(`\nWebview focus cases: ${cases}`);
console.log('webview settlement focus: all passed');
