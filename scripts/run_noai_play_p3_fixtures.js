#!/usr/bin/env node
'use strict';

// Focused, temporary-workspace P3 fixture entry for the future Debug Lab.
const { spawnSync } = require('child_process');
const path = require('path');
const scenarios = ['quiet_day', 'market_recovery_day', 'event_emission_day', 'duplicate_request_day', 'persistence_failure_day'];
const format = process.argv.includes('--markdown') ? 'markdown' : 'json';
const focused = spawnSync(process.execPath, [path.join(__dirname, 'test_end_day_world_progression.js')], { encoding: 'utf8' });
const contention = spawnSync(process.execPath, [path.join(__dirname, 'run_cross_action_contention_fixture.js')], { encoding: 'utf8' });
const status = focused.status === 0 ? 'passed' : 'failed';
const contentionStatus = contention.status === 0 ? 'passed' : 'failed';
let contentionEvidence;
try { contentionEvidence = contention.status === 0 ? JSON.parse(contention.stdout.trim()) : undefined; } catch { contentionEvidence = undefined; }
const result = {
    suite: 'NOAI-PLAY-P3', isolated: true, resettable: true,
    scenarios: [...scenarios.map((id) => ({ id, status })), { id: 'cross_action_contention', status: contentionStatus }],
    contentionEvidence,
    diagnostic: focused.status !== 0
        ? (focused.stderr || focused.stdout || 'focused fixture failed').trim()
        : contention.status !== 0 ? (contention.stderr || contention.stdout || 'contention fixture failed').trim() : undefined,
};
if (format === 'markdown') {
    console.log('# NOAI-PLAY-P3 fixtures');
    console.log('Temporary-workspace only; no live workspace is targeted.');
    for (const item of result.scenarios) console.log(`- ${item.id}: ${item.status}`);
} else {
    console.log(JSON.stringify(result));
}
if (focused.status !== 0 || contention.status !== 0) process.exit(focused.status || contention.status || 1);
