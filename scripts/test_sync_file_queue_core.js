#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'syncFileQueueCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/syncFileQueueCore.js missing — run npm run compile');
    process.exit(1);
}

const { createSyncFileQueue } = require(modPath);

{
    const q = createSyncFileQueue();
    const log = [];
    q.enqueue(() => log.push('a'));
    q.enqueue(() => log.push('b'));
    if (log.join(',') !== 'a,b') {
        fail(`fifo order: ${log.join(',')}`);
    } else {
        ok('fifo order');
    }
}

{
    const q = createSyncFileQueue();
    let nested = false;
    q.enqueue(() => {
        q.enqueue(() => { nested = true; });
    });
    if (!nested) {
        fail('nested enqueue drains');
    } else {
        ok('nested enqueue drains');
    }
}

{
    const game = createSyncFileQueue();
    const world = createSyncFileQueue();
    const log = [];
    game.enqueue(() => {
        log.push('g-start');
        world.enqueue(() => log.push('w'));
        log.push('g-end');
    });
    if (log.join(',') !== 'g-start,w,g-end') {
        fail(`independent queues: ${log.join(',')}`);
    } else {
        ok('independent per-file queues');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('syncFileQueueCore: all tests passed.');