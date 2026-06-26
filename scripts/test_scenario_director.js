#!/usr/bin/env node
/**
 * Scenario Director merge/validation tests (v0.6c).
 */
const {
    mergeScenarioDirector,
    parseGameStateDirector,
    parseScenarioDirectorTemplate,
    seedDirectorFromTemplate,
    validateGameStateDirector,
    validateScenarioDirectorBlock
} = require('../out/scenarioDirectorCore');

let failed = 0;

function fail(msg) {
    console.error(`FAIL: ${msg}`);
    failed++;
}

function ok(msg) {
    console.log(`OK: ${msg}`);
}

const template = parseScenarioDirectorTemplate({
    act: 'Act I',
    scene: 'Antechamber',
    objective: 'Find the seal',
    guidanceMode: 'guided',
    successConditions: ['Get seal'],
    endingFlags: ['good_end', 'bad_end']
}, { title: 'Catacombs' });

if (!template || template.scenarioTitle !== 'Catacombs') {
    fail('parse template');
} else {
    ok('parse template');
}

const seed = seedDirectorFromTemplate(template);
if (seed.scene !== 'Antechamber' || seed.guidanceMode !== 'guided') {
    fail('seed from template');
} else {
    ok('seed from template');
}

const runtime = parseGameStateDirector({
    scene: 'Inner Sanctum',
    achievedEndings: ['good_end']
});
const merged = mergeScenarioDirector(template, runtime);
if (!merged || merged.scene !== 'Inner Sanctum' || merged.act !== 'Act I') {
    fail('runtime overrides scene only');
} else {
    ok('runtime overrides scene only');
}
if (!merged.hasRuntimeOverrides) {
    fail('detects runtime overrides');
} else {
    ok('detects runtime overrides');
}
if (!merged.achievedEndings.includes('good_end')) {
    fail('achieved endings preserved');
} else {
    ok('achieved endings preserved');
}

const badScenario = validateScenarioDirectorBlock({ guidanceMode: 'invalid' });
if (badScenario.length === 0) {
    fail('reject invalid guidanceMode in scenario');
} else {
    ok('reject invalid guidanceMode in scenario');
}

const badState = validateGameStateDirector({ achievedEndings: [1, 2] });
if (badState.length === 0) {
    fail('reject invalid achievedEndings');
} else {
    ok('reject invalid achievedEndings');
}

if (failed > 0) {
    process.exit(1);
}
console.log('All scenario director tests passed.');