#!/usr/bin/env node
'use strict';

/**
 * Commerce debounce must flush synchronously before GM prompt / turn merge (Grok P1).
 * Uses livingWorldCommercePersistCore only — no vscode/fs host deps.
 */

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'livingWorldCommercePersistCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const fs = require('fs');
if (!fs.existsSync(corePath)) {
    fail('compiled core module missing — run npm run compile');
    process.exit(1);
}

const { createCommercePersistScheduler } = require(corePath);

{
    const flushed = [];
    const scheduler = createCommercePersistScheduler(
        (payload) => flushed.push(payload),
        5000,
        (fn) => setTimeout(fn, 5000),
        clearTimeout
    );
    scheduler.schedule({ baseRevision: 1, commerce: { credits: 10, cargo: [] } });
    if (!scheduler.peek()) {
        fail('scheduler should have pending payload');
    } else {
        scheduler.flush();
        if (flushed.length !== 1 || flushed[0].commerce.credits !== 10) {
            fail(`sync flush should apply pending: ${JSON.stringify(flushed)}`);
        } else if (scheduler.peek()) {
            fail('flush should clear pending');
        } else {
            ok('commerce scheduler sync flush');
        }
    }
}

/** Mirrors livingWorldCommercePersist host pending + re-entry guard semantics. */
function createCommercePersistHost() {
    let pendingHost = null;
    let commerceFlushInProgress = false;
    const flushed = [];
    const scheduler = createCommercePersistScheduler(
        (payload) => {
            const snap = pendingHost;
            pendingHost = null;
            if (snap) {
                flushed.push({ ...payload, commerce: snap.commerce });
            }
        },
        80,
        (fn) => setTimeout(fn, 80),
        clearTimeout
    );

    return {
        flushed,
        schedule(update) {
            pendingHost = {
                ...pendingHost,
                ...update,
                commerce: update.commerce ?? pendingHost?.commerce,
                baseRevision: update.baseRevision ?? pendingHost?.baseRevision,
            };
            scheduler.schedule({
                baseRevision: pendingHost.baseRevision,
                commerce: pendingHost.commerce,
            });
        },
        isPending() {
            return pendingHost !== null || scheduler.peek() !== null;
        },
        flush() {
            if (commerceFlushInProgress) {
                return;
            }
            commerceFlushInProgress = true;
            try {
                scheduler.flush();
            } finally {
                commerceFlushInProgress = false;
            }
        },
        peek() {
            return pendingHost ? { ...pendingHost } : null;
        },
    };
}

{
    const host = createCommercePersistHost();
    host.schedule({
        baseRevision: 3,
        commerce: {
            credits: 80,
            food: 10,
            transportId: 'wagon',
            playerRole: 'merchant',
            cargo: [{ commodityId: 'wheat', qty: 2 }],
        },
    });
    if (!host.isPending()) {
        fail('schedule should leave pending state');
    } else {
        ok('schedule marks pending');
    }
    host.flush();
    if (host.isPending()) {
        fail('sync flush should clear pending');
    } else {
        ok('sync flush clears pending');
    }
    const peek = host.peek();
    if (peek !== null) {
        fail(`peek after flush should be null: ${JSON.stringify(peek)}`);
    } else {
        ok('peek null after flush');
    }
    if (host.flushed.length !== 1 || host.flushed[0].commerce.credits !== 80) {
        fail(`flush should apply commerce payload: ${JSON.stringify(host.flushed)}`);
    } else {
        ok('flush applies commerce payload');
    }
}

{
    const host = createCommercePersistHost();
    host.schedule({ baseRevision: 1, commerce: { credits: 5, cargo: [] } });
    host.flush();
    host.flush();
    if (host.flushed.length !== 1) {
        fail(`re-entry guard should not double-apply: ${host.flushed.length}`);
    } else {
        ok('re-entry guard prevents double flush');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('commerce flush GM timing: all tests passed.');