#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'spawnWithTimeout.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

async function main() {
    if (!fs.existsSync(corePath)) {
        fail('out/spawnWithTimeout.js missing - run npm run compile first');
        process.exit(1);
    }

    const { spawnWithTimeout } = require(corePath);
    const start = Date.now();
    const { result } = spawnWithTimeout(
        process.execPath,
        ['-e', 'setInterval(()=>{}, 100000)'],
        { timeoutMs: 1500 }
    );
    const outcome = await result;
    const elapsed = Date.now() - start;
    if (!outcome.timedOut) {
        fail(`expected timedOut=true, got code=${outcome.code}`);
    } else if (elapsed > 8000) {
        fail(`timeout took too long: ${elapsed}ms`);
    } else {
        ok('spawnWithTimeout kills hung subprocess');
    }

    if (failed > 0) {
        console.error(`\n${failed} test(s) failed`);
        process.exit(1);
    }
    console.log('\nAll spawn with timeout tests passed');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});