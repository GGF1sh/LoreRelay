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

const {
    sanitizeExportText,
    pickReplayExportEntry,
    pickReplayExportEntries,
} = require(modPath);

{
    const raw = 'Saved to C:\\Users\\secret\\game_state.json and /home/player/data';
    const out = sanitizeExportText(raw);
    if (out.includes('C:\\Users') || out.includes('/home/player')) {
        fail(`absolute paths not redacted: ${out}`);
    } else if (!out.includes('[path redacted]')) {
        fail('redaction marker missing');
    } else {
        ok('sanitizeExportText redacts absolute paths');
    }
}

{
    const raw = [
        'Narration here.',
        '```json',
        '{"hiddenState":{"agenda":"secret"},"status":{"hp":1}}',
        '```',
    ].join('\n');
    const out = sanitizeExportText(raw);
    if (out.includes('secret') || out.includes('hiddenState')) {
        fail(`sensitive fenced json leaked: ${out}`);
    } else if (!out.includes('[redacted]')) {
        fail('sensitive fence should be redacted');
    } else {
        ok('sanitizeExportText redacts sensitive JSON fences');
    }
}

{
    const safeJson = '```json\n{"status":{"hp":1}}\n```';
    const out = sanitizeExportText(safeJson);
    if (!out.includes('"hp"')) {
        fail('benign JSON fence should remain');
    } else {
        ok('sanitizeExportText keeps benign JSON fences');
    }
}

{
    const ledgerJson = '```json\n{"discoveryOps":[],"valueHint":"x"}\n```';
    const out = sanitizeExportText(ledgerJson);
    if (out.includes('valueHint') || !out.includes('[redacted]')) {
        fail(`ledger markers redacted: ${out}`);
    } else {
        ok('sanitizeExportText redacts ledger markers in JSON fences');
    }
}

{
    const picked = pickReplayExportEntry({
        id: 'e1',
        role: 'gm',
        sender: 'GM',
        content: 'See C:\\AI\\LoreRelay\\hiddenState.json',
        status: { hp: 1 },
        hiddenState: { x: 1 },
        director: { notes: 'secret' },
        excludedFromPrompt: false,
    });
    if (picked.status !== undefined || picked.hiddenState !== undefined) {
        fail('pickReplayExportEntry drops non-export fields');
    } else if (picked.content.includes('C:\\AI')) {
        fail('picked content should redact paths');
    } else if (!picked.content.includes('[path redacted]')) {
        fail('picked content redaction marker');
    } else {
        ok('pickReplayExportEntry whitelist + content sanitize');
    }
}

{
    const list = pickReplayExportEntries([
        { id: '1', role: 'user', sender: 'P', content: 'hi' },
        null,
        { id: '2', role: 'gm', sender: 'GM', content: 'ok', options: ['a'] },
    ]);
    if (list.length !== 2 || list[1].options !== undefined) {
        fail(`pickReplayExportEntries: ${JSON.stringify(list)}`);
    } else {
        ok('pickReplayExportEntries filters and picks');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('replay export sanitize core: all tests passed.');