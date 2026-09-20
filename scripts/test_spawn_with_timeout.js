#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'spawnWithTimeout.js');
const grandchildFixture = path.join(__dirname, 'fixtures', 'spawn_grandchild_hang.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessAlive(pid) {
    if (!pid || pid <= 0) { return false; }
    if (process.platform === 'win32') {
        try {
            const out = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', windowsHide: true });
            return out.includes(String(pid));
        } catch {
            return false;
        }
    }
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return e && e.code === 'EPERM';
    }
}

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

    if (!fs.existsSync(grandchildFixture)) {
        fail(`missing fixture ${grandchildFixture}`);
    } else {
        let grandchildPid = null;
        const treeStart = Date.now();
        const { result: treeResult } = spawnWithTimeout(
            process.execPath,
            [grandchildFixture],
            { timeoutMs: 2000 },
            {
                stdout: (chunk) => {
                    const match = String(chunk).match(/GRANDCHILD_PID=(\d+)/);
                    if (match) { grandchildPid = Number(match[1]); }
                },
            }
        );
        const treeOutcome = await treeResult;
        await sleep(800);
        const treeElapsed = Date.now() - treeStart;
        if (!treeOutcome.timedOut) {
            fail(`grandchild fixture expected timeout, code=${treeOutcome.code}`);
        } else if (!grandchildPid) {
            fail('grandchild fixture did not report GRANDCHILD_PID');
        } else if (isProcessAlive(grandchildPid)) {
            fail(`grandchild pid ${grandchildPid} still alive after tree kill`);
        } else if (treeElapsed > 10000) {
            fail(`grandchild tree kill took too long: ${treeElapsed}ms`);
        } else {
            ok('spawnWithTimeout kills grandchild process tree');
        }
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