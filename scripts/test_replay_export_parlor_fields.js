#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'replayExportSanitizeCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/replayExportSanitizeCore.js missing — run npm run compile');
    process.exit(1);
}

const { sanitizeExportText } = require(modPath);

{
    const raw = [
        'The guild hall was quiet.',
        '```json',
        '{"lastParlorSnapshot":{"parlorSessionPath":"parlor_session.json"},"frozenAt":"2026-01-01"}',
        '```',
        'C:\\Users\\secret\\game_state.json',
    ].join('\n');
    const out = sanitizeExportText(raw);
    if (out.includes('parlor_session.json') || out.includes('lastParlorSnapshot') || out.includes('C:\\Users')) {
        fail(`parlor/path leak in export: ${out}`);
    } else if (!out.includes('[redacted]') || !out.includes('[path redacted]')) {
        fail(`expected redaction markers: ${out}`);
    } else {
        ok('export redacts parlor snapshot JSON and absolute paths');
    }
}

{
    const raw = [
        'Rumor spread.',
        '```json',
        '{"guildSinceLastVisit":{"turnsAway":14},"domainSinceLastVisit":{"turnsAway":3}}',
        '```',
    ].join('\n');
    const out = sanitizeExportText(raw);
    if (out.includes('guildSinceLastVisit') || out.includes('domainSinceLastVisit')) {
        fail(`drift delta should be redacted in fenced json: ${out}`);
    } else if (!out.includes('[redacted]')) {
        fail(`expected redacted fence: ${out}`);
    } else {
        ok('export redacts drift fenced JSON');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('replay export parlor fields: all tests passed.');