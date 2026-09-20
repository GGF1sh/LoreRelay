#!/usr/bin/env node
'use strict';

/**
 * Guards the combat test gate itself.
 *
 * The combat suites were invisible to CI because nothing referenced them. A
 * hand-maintained list can drift back into that state silently, so this asserts:
 *   - every compiled combat suite in out/ is owned by exactly one group,
 *   - no group lists a file twice or a file that does not exist,
 *   - every group is registered in the run_all_tests manifest.
 *
 * Requires `npm run compile` to have produced out/.
 */

const fs = require('fs');
const path = require('path');
const { COMBAT_TEST_GROUPS, COMBAT_TEST_FILES } = require('./combat_test_manifest');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');

let failures = 0;
function check(ok, message) {
    console.log(`${ok ? 'OK' : 'FAIL'}: ${message}`);
    if (!ok) { failures++; }
}

if (!fs.existsSync(OUT)) {
    console.error('combat manifest coverage: out/ is missing — run `npm run compile` first.');
    process.exit(1);
}

/** A compiled suite belongs to the combat stack when its module name starts with combat/gambitCombat. */
const compiled = fs.readdirSync(OUT)
    .filter((file) => file.endsWith('.test.js'))
    .filter((file) => /^(combat|gambitCombat)/.test(file))
    .sort();

check(compiled.length > 0, `found ${compiled.length} compiled combat suites in out/`);

const listed = COMBAT_TEST_FILES.slice().sort();
const duplicates = listed.filter((file, index) => listed.indexOf(file) !== index);
check(duplicates.length === 0, `no suite is listed twice (${duplicates.join(', ') || 'none'})`);

const unregistered = compiled.filter((file) => !listed.includes(file));
check(
    unregistered.length === 0,
    unregistered.length
        ? `every compiled combat suite is registered — MISSING: ${unregistered.join(', ')}`
        : 'every compiled combat suite is registered in a group',
);

const phantom = listed.filter((file) => !compiled.includes(file));
check(
    phantom.length === 0,
    phantom.length ? `no group lists a non-existent suite — UNKNOWN: ${phantom.join(', ')}` : 'no group lists a non-existent suite',
);

for (const group of COMBAT_TEST_GROUPS) {
    check(typeof group.id === 'string' && group.id.startsWith('combat:'), `group id is namespaced: ${group.id}`);
    check(Boolean(group.description), `group has a description: ${group.id}`);
    check(Array.isArray(group.files) && group.files.length > 0, `group lists at least one suite: ${group.id}`);
}

// The gate only counts if the runner actually schedules these groups.
const { MANIFEST, parseNodeTestTotals } = require('./run_all_tests');

// CI is non-TTY, where Node defaults to the tap reporter; local TTY runs use spec.
// If the summary parser only understood one of them, CI would silently report
// "0 combat tests" while still passing.
const tapSummary = 'ok 1 - suite\n# tests 42\n# suites 3\n# pass 41\n# fail 1\n';
const specSummary = 'ℹ tests 42\nℹ suites 3\nℹ pass 41\nℹ fail 1\n';
for (const [name, sample] of [['tap', tapSummary], ['spec', specSummary]]) {
    const totals = parseNodeTestTotals(sample);
    check(
        totals.tests === 42 && totals.pass === 41 && totals.fail === 1,
        `${name} reporter summary is parsed (got ${JSON.stringify(totals)})`,
    );
}
check(
    parseNodeTestTotals('no summary here').tests === 0,
    'output without a summary reports zero rather than throwing',
);
const registered = new Set(MANIFEST.filter((entry) => entry.runner === 'node-test').map((entry) => entry.file));
const missingFromManifest = COMBAT_TEST_GROUPS.filter((group) => !registered.has(group.id)).map((group) => group.id);
check(
    missingFromManifest.length === 0,
    missingFromManifest.length
        ? `every group is scheduled by run_all_tests — MISSING: ${missingFromManifest.join(', ')}`
        : `all ${COMBAT_TEST_GROUPS.length} groups are scheduled by run_all_tests`,
);
check(
    MANIFEST.filter((entry) => entry.runner === 'node-test').every((entry) => entry.category === 'unit'),
    'combat groups run in the unit category',
);

console.log('');
if (failures > 0) {
    console.error(`combat manifest coverage: ${failures} check(s) failed.`);
    process.exit(1);
}
console.log(`combat manifest coverage passed: ${compiled.length} suites across ${COMBAT_TEST_GROUPS.length} groups.`);
