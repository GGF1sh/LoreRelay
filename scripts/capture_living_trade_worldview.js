#!/usr/bin/env node
'use strict';

/**
 * Capture runtime worldView for 05-living-trade-world via pushWorldViewToWebview().
 */
const fs = require('fs');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const TARGET_DIR = 'C:\\AI\\artifacts\\LoreRelay\\showcase\\current\\05-living-trade-world';
const HARNESS_DIR = path.join('C:\\AI\\artifacts\\LoreRelay\\showcase\\current', '_harness');
const OUT_PATH = path.join(HARNESS_DIR, 'living-trade-worldView.json');

if (!fs.existsSync(TARGET_DIR)) {
    console.error('Scenario missing. Run: node scripts/create_ui_showcase_scenarios.js');
    process.exit(1);
}
if (!fs.existsSync(HARNESS_DIR)) {
    fs.mkdirSync(HARNESS_DIR, { recursive: true });
}

let capturedMessage = null;
const vscodeStub = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: TARGET_DIR } }],
        getConfiguration: () => ({
            get: (key, def) => (def !== undefined ? def : ''),
            update: async () => undefined,
        }),
    },
    Uri: { file: (p) => ({ fsPath: p }) },
    window: {
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showErrorMessage: () => undefined,
    },
};

const restore = installVscodeStub(vscodeStub);

try {
    const { initWorldView, pushWorldViewToWebview } = require('../out/worldView');
    const fakePanel = {
        webview: {
            postMessage: (msg) => {
                if (msg && msg.type === 'worldView') {
                    capturedMessage = msg;
                }
            },
        },
    };
    initWorldView({ getPanel: () => fakePanel });
    pushWorldViewToWebview('loc_sapphire_port');

    if (!capturedMessage) {
        console.error('Failed to capture worldView message.');
        process.exit(1);
    }

    fs.writeFileSync(OUT_PATH, JSON.stringify(capturedMessage, null, 2), 'utf8');
    console.log('Captured living-trade worldView to:', OUT_PATH);

    // Assertions required by SHOWCASE-SCENARIO-002
    const w = capturedMessage;
    const markets = Array.isArray(w.livingWorldMarkets) ? w.livingWorldMarkets : [];
    const vehicles = w.vehicleGarage && Array.isArray(w.vehicleGarage.vehicles)
        ? w.vehicleGarage.vehicles
        : [];
    const logistics = w.economyLogistics || {};
    const flows = Array.isArray(logistics.routes) ? logistics.routes : [];
    const locCount = typeof w.locationCount === 'number'
        ? w.locationCount
        : (Array.isArray(w.locationPinCatalog) ? w.locationPinCatalog.length : 0);

    const checks = {
        worldExists: Boolean(w.worldName || w.enabled),
        locationCount: locCount,
        marketCount: markets.length,
        playerCommerce: Boolean(w.playerCommerce),
        vehicleCount: vehicles.length,
        mobileBase: Boolean(w.mobileBasePanel || vehicles.some((v) => v.isMobileBase)),
        logisticsAvailable: logistics.available === true,
        logisticsFlowCount: flows.length,
        logisticsReason: logistics.unavailableReason || null,
        biomesHint: w.overmapThemeKey || null,
        factions: Array.isArray(w.factions) ? w.factions.length : 0,
    };

    console.log('RUNTIME_ASSERTIONS', JSON.stringify(checks, null, 2));

    const fail = [];
    if (locCount < 10) fail.push('location count < 10');
    if (markets.length < 6) fail.push('market count < 6');
    if (!w.playerCommerce) fail.push('playerCommerce missing');
    if (vehicles.length < 3) fail.push('vehicle count < 3');
    if (!checks.mobileBase) fail.push('mobile base missing');
    if (logistics.available !== true) fail.push('logistics.available !== true (' + logistics.unavailableReason + ')');
    if (flows.length < 8 && logistics.available) {
        // routes may be named differently - also count summary
        const active = logistics.summary && logistics.summary.activeRoutes;
        if (!(active >= 8) && flows.length < 8) fail.push('logistics routes < 8');
    }
    if (logistics.unavailableReason === 'missing_definition') fail.push('missing_definition');

    if (fail.length) {
        console.error('ASSERT_FAIL', fail.join('; '));
        process.exit(2);
    }
    console.log('All living-trade worldView runtime assertions passed.');
} finally {
    restore();
}
