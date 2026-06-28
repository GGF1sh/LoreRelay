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

if (failed > 0) {
    console.error(`Cartography workflow contract: ${failed} failure(s)`);
    process.exit(1);
}

console.log('Cartography workflow contract validation passed.');
process.exit(0);