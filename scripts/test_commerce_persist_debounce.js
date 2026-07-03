#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'livingWorldCommercePersistCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(modPath)) {
    fail('out/livingWorldCommercePersistCore.js missing — run npm run compile');
    process.exit(1);
}

const { createCommercePersistScheduler } = require(modPath);

const commerce = (credits) => ({ credits, cargo: [], transportId: 'wagon', playerRole: 'merchant' });

{
    const flushed = [];
    let timerId = 0;
    const timers = new Map();
    const scheduler = createCommercePersistScheduler(
        (p) => flushed.push(p),
        80,
        (fn, ms) => {
            timerId++;
            timers.set(timerId, fn);
            return timerId;
        },
        (id) => { timers.delete(id); }
    );

    scheduler.schedule({ commerce: commerce(1) });
    scheduler.schedule({ commerce: commerce(99) });
    const pending = scheduler.peek();
    if (!pending?.commerce || pending.commerce.credits !== 99) {
        fail(`coalesces pending: ${JSON.stringify(pending)}`);
    } else {
        ok('coalesces rapid commerce updates');
    }

    const fn = timers.get(timerId);
    if (!fn) {
        fail('debounce timer scheduled');
    } else {
        fn();
    }

    if (flushed.length !== 1 || flushed[0].commerce.credits !== 99) {
        fail(`single flush with latest: ${JSON.stringify(flushed)}`);
    } else {
        ok('debounce flushes latest payload once');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('commerce persist debounce: all tests passed.');