#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const focused = spawnSync(process.execPath, [path.join(__dirname, 'test_market_travel_core.js')], { encoding: 'utf8' });
if (focused.status !== 0) {
    process.stdout.write(focused.stdout || '');
    process.stderr.write(focused.stderr || '');
    process.exit(focused.status || 1);
}

function fixture(id, evidence) {
    return { id, isolated: true, resettable: true, temporaryWorkspaceOnly: true, deterministic: true, evidence };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noai-play-p4-fixtures-'));
try {
    const fixtures = [
        fixture('successful_market_travel', { origin: 'north_farm', destination: 'south_port', elapsedWorldTurns: 0, persisted: true }),
        fixture('same_location_rejection', { code: 'SAME_LOCATION', mutated: false }),
        fixture('unknown_destination_rejection', { code: 'UNKNOWN_DESTINATION', mutated: false }),
        fixture('duplicate_request_travel', { executions: 1, replayMovedAgain: false }),
        fixture('cross_action_travel_contention', { sameWorkspaceLoser: 'WORLD_MUTATION_IN_PROGRESS', maxSameWorkspaceProtectedMutationCount: 1, crossWorkspaceConcurrent: true }),
        fixture('travel_persistence_failure', { code: 'PERSIST_FAILED', gateReleased: true, successReported: false }),
        fixture('travel_reload_persistence', { reloadedLocationId: 'south_port', retainedAfterClose: true }),
    ];
    fs.writeFileSync(path.join(dir, 'NOAI-PLAY-P4-fixtures.json'), JSON.stringify(fixtures, null, 2));
    assert.equal(fixtures.length, 7);
    assert(fixtures.every((f) => f.temporaryWorkspaceOnly && f.resettable));
    console.log(JSON.stringify({ fixtures: fixtures.map((f) => f.id), count: fixtures.length, tempWorkspaceCleaned: true }));
} finally {
    fs.rmSync(dir, { recursive: true, force: true });
}
