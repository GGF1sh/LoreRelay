#!/usr/bin/env node
'use strict';

/**
 * Capture real worldView postMessage for six Living Trade fixed settlements
 * via production pushWorldViewToWebview + SLICE2 focus API.
 */

const fs = require('fs');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const REPO = path.join(__dirname, '..');
const TARGET = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\05-living-trade-world';
const OUT_DIR = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\_harness\\living-trade-settlements';

const CITIES = [
    'loc_sapphire_port',
    'loc_reedmarket',
    'loc_mistgrove',
    'loc_ironspire',
    'loc_glass_oasis',
    'loc_watchkeep',
];

const EXPECTED_IDS = {
    loc_sapphire_port: 'set_sapphire_port',
    loc_reedmarket: 'set_reedmarket',
    loc_mistgrove: 'set_mistgrove',
    loc_ironspire: 'set_ironspire',
    loc_glass_oasis: 'set_glass_oasis',
    loc_watchkeep: 'set_watchkeep',
};

if (!fs.existsSync(TARGET)) {
    console.error('Missing scenario. Run: node scripts/create_ui_showcase_scenarios.js');
    process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Clear require cache for out modules
for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}out${path.sep}`) && key.startsWith(REPO)) {
        delete require.cache[key];
    }
}

const messages = [];
const restore = installVscodeStub({
    workspace: {
        isTrusted: true,
        workspaceFolders: [{ uri: { fsPath: TARGET }, name: 'living-trade' }],
        getConfiguration: () => ({
            get: (_k, d) => (d !== undefined ? d : ''),
            update: async () => undefined,
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
    },
    Uri: { file: (p) => ({ fsPath: p, toString: () => `file://${p}` }) },
    window: {
        createOutputChannel: () => ({
            appendLine() {}, append() {}, clear() {}, show() {}, dispose() {},
        }),
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
        setStatusBarMessage: () => undefined,
    },
    env: { language: 'en' },
});

let failed = 0;
function fail(msg) { console.error('FAIL:', msg); failed++; }
function ok(msg) { console.log('OK:', msg); }

try {
    const gameRules = require(path.join(REPO, 'out', 'gameRules.js'));
    const worldForge = require(path.join(REPO, 'out', 'worldForge.js'));
    if (gameRules.clearGameRulesCache) gameRules.clearGameRulesCache();
    if (worldForge.clearWorldForgeCache) worldForge.clearWorldForgeCache();

    const wv = require(path.join(REPO, 'out', 'worldView.js'));
    wv.initWorldView({
        getPanel: () => ({
            webview: {
                postMessage(msg) {
                    if (msg && msg.type === 'worldView') messages.push(msg);
                },
            },
        }),
    });

    function last() {
        return messages[messages.length - 1] || null;
    }

    function pushCurrent() {
        messages.length = 0;
        wv.pushWorldViewToWebview('loc_sapphire_port');
        return last();
    }

    // 1) Port current
    let msg = pushCurrent();
    if (!msg || msg.settlementView?.settlementId !== 'set_sapphire_port') {
        fail('port current settlementId');
    } else if (msg.settlementDisplayContext?.mode !== 'current') {
        fail('port mode current');
    } else {
        ok('port current mode');
    }
    fs.writeFileSync(path.join(OUT_DIR, 'loc_sapphire_port.worldView.json'), JSON.stringify(msg, null, 2));

    // 2) Preview each remote city
    for (const locId of CITIES) {
        if (locId === 'loc_sapphire_port') continue;
        messages.length = 0;
        wv.setWorldSettlementFocus(locId);
        msg = last();
        const ctx = msg?.settlementDisplayContext;
        const sid = msg?.settlementView?.settlementId;
        if (!msg) {
            fail(`${locId} no message`);
            continue;
        }
        if (msg.currentLocationId !== 'loc_sapphire_port') {
            fail(`${locId} currentLocationId changed`);
        }
        if (ctx?.mode !== 'preview') {
            fail(`${locId} mode not preview (${ctx?.mode})`);
        }
        if (ctx?.displayLocationId !== locId) {
            fail(`${locId} display mismatch (${ctx?.displayLocationId})`);
        }
        if (ctx?.availability !== 'available') {
            fail(`${locId} availability ${ctx?.availability}`);
        }
        if (sid !== EXPECTED_IDS[locId]) {
            fail(`${locId} settlementId ${sid} expected ${EXPECTED_IDS[locId]}`);
        }
        if (!msg.settlementView) {
            fail(`${locId} missing settlementView`);
        }
        if (msg.enableSettlementDiorama && !msg.settlementDiorama) {
            fail(`${locId} missing settlementDiorama`);
        }
        // No MB id as fixed city
        if (sid === 'mb_sapphire_barge') {
            fail(`${locId} resolved Mobile Base root`);
        }
        // No cross-city ids
        for (const other of CITIES) {
            if (other === locId) continue;
            if (sid === EXPECTED_IDS[other]) {
                fail(`${locId} leaked ${other} id`);
            }
        }
        ok(`${locId} preview ${sid}`);
        fs.writeFileSync(path.join(OUT_DIR, `${locId}.worldView.json`), JSON.stringify(msg, null, 2));
    }

    // 3) Clear focus → Port
    messages.length = 0;
    wv.clearWorldSettlementFocus();
    msg = last();
    if (msg?.settlementDisplayContext?.mode !== 'current'
        || msg?.settlementDisplayContext?.displayLocationId !== 'loc_sapphire_port'
        || msg?.settlementView?.settlementId !== 'set_sapphire_port') {
        fail('clear focus did not restore Port');
    } else {
        ok('clear focus restores Port');
    }

    console.log('Captured settlement worldViews to', OUT_DIR);
} finally {
    restore();
}

if (failed > 0) {
    console.error(`${failed} assertion(s) failed`);
    process.exit(1);
}
console.log('capture_living_trade_settlements: all assertions passed');
