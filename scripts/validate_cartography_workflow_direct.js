#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', 'comfyui', 'workflow_cartography_sdxl_direct.json');

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
    '13': 'ControlNetApplyAdvanced',
};

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(workflowPath)) {
    fail('workflow_cartography_sdxl_direct.json missing');
    process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

for (const [nodeId, classType] of Object.entries(CONTRACT)) {
    const node = workflow[nodeId];
    if (!node || node.class_type !== classType) {
        fail(`node ${nodeId} expected ${classType}`);
    } else {
        ok(`node ${nodeId} ${classType}`);
    }
}

const cnImage = workflow['13']?.inputs?.image;
if (!Array.isArray(cnImage) || cnImage[0] !== '11') {
    fail('node 13 image should link directly to LoadImage node 11 (no preprocessor)');
} else {
    ok('node 13 direct layout link');
}

if (failed > 0) {
    process.exit(1);
}
console.log('Cartography direct workflow contract validation passed.');
process.exit(0);