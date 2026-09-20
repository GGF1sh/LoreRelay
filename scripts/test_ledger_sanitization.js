#!/usr/bin/env node
'use strict';

/**
 * PR-E — Campaign Kit ledger sanitization for World tab webview + replay export.
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const webviewCorePath = path.join(root, 'out', 'campaignLedgerWebviewSanitizeCore.js');
const exportPath = path.join(root, 'out', 'replayExportSanitizeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [webviewCorePath, exportPath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile`);
        process.exit(1);
    }
}

const {
    WEBVIEW_DISCOVERY_ENTRY_KEYS,
    WEBVIEW_CAMPAIGN_RESOURCE_KEYS,
    pickDiscoveriesForWebviewCore,
    pickResourcesForWebviewCore,
    isWebviewDiscoveryEntrySanitized,
    isWebviewCampaignResourceEntrySanitized,
} = require(webviewCorePath);
const {
    sanitizeExportText,
    pickReplayExportEntry,
} = require(exportPath);

const fullLedger = {
    version: 1,
    entries: [
        {
            id: 'relic_u',
            kind: 'material',
            label: 'Strange shard',
            status: 'unidentified',
            valueHint: 'GM-only hint',
            notes: 'secret notes',
            estValue: 500,
            condition: 'damaged',
            siteId: 'metro_a',
        },
        {
            id: 'relic_a',
            kind: 'material',
            label: 'Shard',
            identifiedLabel: 'Relay housing',
            status: 'appraised',
            estValue: 200,
            condition: 'upgraded',
            valueHint: 'do not leak',
            siteId: 'hub',
        },
        {
            id: 'relic_sold',
            kind: 'material',
            label: 'Old part',
            status: 'sold',
            estValue: 10,
        },
        {
            id: 'relic_used',
            kind: 'lore',
            label: 'Map scrap',
            status: 'consumed',
        },
    ],
};

// --- Webview discovery FoW ---

{
    const rows = pickDiscoveriesForWebviewCore(fullLedger, {
        resolveSiteName: (id) => (id === 'hub' ? 'Trade Hub' : undefined),
    });
    if (!rows || rows.length !== 2) {
        fail(`active discovery count: ${rows?.length}`);
    } else {
        ok('webview hides sold/consumed discoveries');
    }

    const unidentified = rows.find((r) => r.id === 'relic_u');
    const appraised = rows.find((r) => r.id === 'relic_a');
    if (!unidentified || unidentified.suggestedValue !== undefined || unidentified.condition !== undefined) {
        fail(`unidentified hides value/condition: ${JSON.stringify(unidentified)}`);
    } else {
        ok('unidentified discovery hides suggestedValue and condition');
    }
    if (!appraised || appraised.suggestedValue !== 320 || appraised.condition !== 'upgraded') {
        fail(`appraised shows derived value: ${JSON.stringify(appraised)}`);
    } else {
        ok('appraised discovery exposes suggestedValue and non-standard condition');
    }
    if (appraised.siteName !== 'Trade Hub') {
        fail(`siteName resolved: ${appraised.siteName}`);
    } else {
        ok('webview discovery resolves siteName via host hook');
    }
}

{
    const rows = pickDiscoveriesForWebviewCore({
        version: 1,
        entries: [{
            id: 'std',
            kind: 'material',
            label: 'Crate',
            status: 'identified',
            identifiedLabel: 'Supply crate',
            estValue: 40,
            condition: 'standard',
        }],
    });
    if (!rows?.[0] || rows[0].condition !== undefined || rows[0].suggestedValue !== 40) {
        fail(`standard condition omitted: ${JSON.stringify(rows)}`);
    } else {
        ok('standard condition hidden; suggestedValue shown when identified');
    }
}

{
    const rows = pickDiscoveriesForWebviewCore(fullLedger);
    for (const row of rows ?? []) {
        if (!isWebviewDiscoveryEntrySanitized(row)) {
            fail(`discovery row has extra keys: ${JSON.stringify(row)}`);
        }
        if ('valueHint' in row || 'notes' in row || 'estValue' in row) {
            fail(`GM-only discovery fields leaked: ${JSON.stringify(row)}`);
        }
    }
    const keySet = new Set(WEBVIEW_DISCOVERY_ENTRY_KEYS);
    if (!keySet.has('id') || keySet.has('valueHint')) {
        fail(`WEBVIEW_DISCOVERY_ENTRY_KEYS manifest: ${WEBVIEW_DISCOVERY_ENTRY_KEYS.join(',')}`);
    } else {
        ok('webview discovery rows use whitelist keys only');
    }
}

// --- Webview campaign resources ---

{
    const resources = pickResourcesForWebviewCore(
        [
            { id: 'food', name: 'Food' },
            { id: 'ammo', name: 'Ammo' },
            { id: 'extra', name: 'Extra' },
        ],
        { food: 12, ammo: 3 },
        2
    );
    if (!resources || resources.length !== 2) {
        fail(`resource cap: ${JSON.stringify(resources)}`);
    } else if (resources[0].qty !== 12 || resources[1].qty !== 3) {
        fail(`resource quantities: ${JSON.stringify(resources)}`);
    } else {
        ok('webview resources expose id/name/qty with kit ordering');
    }

    for (const row of resources) {
        if (!isWebviewCampaignResourceEntrySanitized(row)) {
            fail(`resource row extra keys: ${JSON.stringify(row)}`);
        }
    }
    const allowed = new Set(WEBVIEW_CAMPAIGN_RESOURCE_KEYS);
    if (!allowed.has('qty') || allowed.has('quantities')) {
        fail(`WEBVIEW_CAMPAIGN_RESOURCE_KEYS manifest: ${WEBVIEW_CAMPAIGN_RESOURCE_KEYS.join(',')}`);
    } else {
        ok('webview campaign resource rows use whitelist keys only');
    }
}

// --- Replay export ledger redaction ---

{
    const raw = [
        'Ledger update:',
        '```json',
        '{"discoveryOps":[{"op":"update","id":"relic_a","status":"sold"}],"valueHint":"secret","estValue":999}',
        '```',
    ].join('\n');
    const out = sanitizeExportText(raw);
    if (out.includes('discoveryOps') || out.includes('valueHint') || out.includes('estValue')) {
        fail(`export redacts ledger JSON fence: ${out}`);
    } else if (!out.includes('[redacted]')) {
        fail('ledger fence should be redacted');
    } else {
        ok('replay export redacts discoveryOps/valueHint/estValue JSON fences');
    }
}

{
    const raw = [
        'Resources:',
        '```json',
        '{"campaignResourceOps":[{"resourceId":"food","delta":-1}],"campaign_resources.json":"path"}',
        '```',
    ].join('\n');
    const out = sanitizeExportText(raw);
    if (out.includes('campaignResourceOps') || out.includes('campaign_resources.json')) {
        fail(`export redacts campaign resource fence: ${out}`);
    } else {
        ok('replay export redacts campaignResourceOps JSON fences');
    }
}

{
    const picked = pickReplayExportEntry({
        id: 'gm-ledger',
        role: 'gm',
        sender: 'GM',
        content: 'Internal ```json\n{"discoveryOps":[],"estValue":1}\n```',
        discoveryOps: [{ op: 'add', id: 'x' }],
        campaignResourceOps: [{ resourceId: 'food', delta: -1 }],
        valueHint: 'leak',
        estValue: 100,
    });
    if (picked.discoveryOps || picked.campaignResourceOps || picked.valueHint || picked.estValue) {
        fail(`pickReplayExportEntry drops ledger roots: ${JSON.stringify(picked)}`);
    } else if (picked.content.includes('estValue')) {
        fail(`picked content should redact embedded ledger json: ${picked.content}`);
    } else if (!picked.content.includes('[redacted]')) {
        fail('embedded ledger json should be redacted in content');
    } else {
        ok('replay export entry whitelist strips ledger fields and redacts content');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('ledger sanitization: all tests passed.');