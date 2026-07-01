#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'comfyui', 'workflow_cartography_sdxl_canny.json');

const CONTRACT = {
    '3': 'KSampler',
    '4': 'CheckpointLoaderSimple',
    '5': 'EmptyLatentImage',
    '6': 'CLIPTextEncode',
    '7': 'CLIPTextEncode',
    '8': 'VAEDecode',
    '9': 'SaveImage',
    '10': 'ControlNetLoader',
    '11': 'LoadImage',
    '12': 'Canny',
    '13': 'ControlNetApplyAdvanced',
};

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(workflowPath)) {
    fail('workflow_cartography_sdxl_canny.json missing');
    process.exit(1);
}

let workflow;
try {
    workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));
} catch (e) {
    fail(`invalid workflow JSON: ${e.message}`);
    process.exit(1);
}

for (const [nodeId, classType] of Object.entries(CONTRACT)) {
    const node = workflow[nodeId];
    if (!node || typeof node !== 'object') {
        fail(`missing node ${nodeId}`);
        continue;
    }
    if (node.class_type !== classType) {
        fail(`node ${nodeId} expected class_type ${classType}, got ${node.class_type}`);
    } else {
        ok(`node ${nodeId} ${classType}`);
    }
}

if (workflow['9']?.inputs?.filename_prefix !== 'world_map') {
    fail('node 9 filename_prefix should be world_map');
} else {
    ok('node 9 filename_prefix');
}

function expectInputLink(nodeId, inputName, expected) {
    const actual = workflow[nodeId]?.inputs?.[inputName];
    if (!Array.isArray(actual) || actual.length !== 2 || actual[0] !== expected[0] || actual[1] !== expected[1]) {
        fail(`node ${nodeId}.${inputName} should link to [${expected[0]}, ${expected[1]}], got ${JSON.stringify(actual)}`);
    } else {
        ok(`node ${nodeId}.${inputName} link`);
    }
}

expectInputLink('3', 'model', ['4', 0]);
expectInputLink('3', 'positive', ['13', 0]);
expectInputLink('3', 'negative', ['13', 1]);
expectInputLink('3', 'latent_image', ['5', 0]);
expectInputLink('8', 'samples', ['3', 0]);
expectInputLink('13', 'positive', ['6', 0]);
expectInputLink('13', 'negative', ['7', 0]);
expectInputLink('13', 'control_net', ['10', 0]);
expectInputLink('13', 'image', ['12', 0]);

const lowThreshold = workflow['12']?.inputs?.low_threshold;
const highThreshold = workflow['12']?.inputs?.high_threshold;
if (typeof lowThreshold !== 'number' || lowThreshold < 0.01 || lowThreshold > 0.99) {
    fail(`node 12 low_threshold should be a 0..1 Canny value, got ${lowThreshold}`);
} else {
    ok('node 12 low_threshold range');
}
if (typeof highThreshold !== 'number' || highThreshold < 0.01 || highThreshold > 0.99) {
    fail(`node 12 high_threshold should be a 0..1 Canny value, got ${highThreshold}`);
} else {
    ok('node 12 high_threshold range');
}

if (failed > 0) {
    console.error(`Cartography workflow contract: ${failed} failure(s)`);
    process.exit(1);
}

console.log('Cartography workflow contract validation passed.');
process.exit(0);
