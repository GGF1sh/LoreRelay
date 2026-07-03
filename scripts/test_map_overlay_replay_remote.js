#!/usr/bin/env node
'use strict';

/**
 * M2 replay/remote map overlay wiring — sanitize choke point + replay appendix (pure).
 */

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const overlayCorePath = path.join(root, 'out', 'mapOverlayCore.js');
const replayCorePath = path.join(root, 'out', 'replayExportCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

for (const p of [overlayCorePath, replayCorePath]) {
    if (!fs.existsSync(p)) {
        fail(`${p} missing — run npm run compile first`);
        process.exit(1);
    }
}

const {
    sanitizeMapOverlaySnapshot,
    pickMapOverlaySnapshotKeys,
    MAP_OVERLAY_SNAPSHOT_KEYS,
    OVERLAY_MARKER_KEYS,
} = require(overlayCorePath);
const {
    buildReplayMarkdown,
    formatMapOverlayMarkdownAppendix,
    formatMapOverlayHtmlAppendix,
} = require(replayCorePath);

const sampleOverlay = sanitizeMapOverlaySnapshot({
    version: 1,
    markers: [
        {
            id: 'npc_a',
            kind: 'npc',
            x: 8,
            y: 12,
            label: 'Traveler',
            fogVisibility: 'discovered',
            tone: 'friendly',
            detail: 'On patrol',
            leakedField: 'SECRET',
        },
    ],
});

{
    const keys = Object.keys(sampleOverlay.markers[0]);
    const allowed = new Set(OVERLAY_MARKER_KEYS);
    if (keys.some((k) => !allowed.has(k))) {
        fail(`sanitized marker leaked keys: ${keys.join(',')}`);
    } else if (sampleOverlay.markers[0].leakedField !== undefined) {
        fail('sanitized marker should drop leaked fields');
    } else {
        ok('sanitizeMapOverlaySnapshot enforces marker allow-list');
    }
}

{
    const picked = pickMapOverlaySnapshotKeys(sampleOverlay);
    const topKeys = Object.keys(picked);
    const allowedTop = new Set(MAP_OVERLAY_SNAPSHOT_KEYS);
    if (topKeys.some((k) => !allowedTop.has(k))) {
        fail(`snapshot export keys leaked: ${topKeys.join(',')}`);
    } else if (!Array.isArray(picked.markers) || picked.markers.length !== 1) {
        fail('pickMapOverlaySnapshotKeys should export markers array');
    } else {
        ok('pickMapOverlaySnapshotKeys is allow-listed');
    }
}

{
    const md = formatMapOverlayMarkdownAppendix(sampleOverlay);
    if (!md.includes('Map overlay (export snapshot)') || !md.includes('[npc] Traveler')) {
        fail(`markdown appendix missing content: ${md}`);
    } else if (md.includes('SECRET')) {
        fail('markdown appendix must not leak raw marker fields');
    } else {
        ok('replay markdown map overlay appendix');
    }
}

{
    const html = formatMapOverlayHtmlAppendix(sampleOverlay);
    if (!html.includes('Map overlay (export snapshot)') || !html.includes('Traveler')) {
        fail(`html appendix missing content: ${html}`);
    } else if (html.includes('SECRET')) {
        fail('html appendix must not leak raw marker fields');
    } else {
        ok('replay html map overlay appendix');
    }
}

{
    const doc = buildReplayMarkdown({
        entries: [{ id: 'e1', role: 'gm', sender: 'GM', content: 'Hello.' }],
        options: { format: 'markdown', includeImages: false, includeGm: true, includeDice: false },
        mapOverlay: sampleOverlay,
    });
    if (!doc.includes('Map overlay (export snapshot)') || !doc.includes('[npc] Traveler')) {
        fail('buildReplayMarkdown should append map overlay section');
    } else {
        ok('replay document embeds sanitized map overlay');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('map overlay replay/remote wiring: all tests passed.');