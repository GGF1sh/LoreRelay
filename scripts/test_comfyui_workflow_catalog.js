#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'comfyui', 'templates.json');
const SIMPLE_REQUIRED = ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler', 'EmptyLatentImage', 'VAEDecode', 'SaveImage'];
const SCENE_IDS = { sampler: '3', checkpoint: '4', latent: '5', positive: '6', negative: '7' };

let failed = 0;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed++; }
function check(cond, message) { cond ? ok(message) : fail(message); }

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
check(catalog.schemaVersion === 1, 'catalog schemaVersion is 1');
check(Array.isArray(catalog.templates) && catalog.templates.length >= 7, 'catalog lists bundled templates');
check(catalog.runnerContract?.format === 'comfyui-prompt-api', 'catalog documents the prompt API contract');

const ids = catalog.templates.map((entry) => entry.id);
check(ids.length === new Set(ids).size, 'catalog ids are unique');

for (const entry of catalog.templates) {
    const file = path.join(root, 'comfyui', entry.file);
    check(fs.existsSync(file), `${entry.id} file exists: ${entry.file}`);
    if (!fs.existsSync(file)) { continue; }
    const workflow = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(workflow && typeof workflow === 'object' && !Array.isArray(workflow), `${entry.id} is an API-format object`);
    const classes = Object.values(workflow)
        .filter((node) => node && typeof node === 'object')
        .map((node) => node.class_type)
        .filter(Boolean);
    for (const required of SIMPLE_REQUIRED) {
        check(classes.includes(required), `${entry.id} has ${required}`);
    }
    if (entry.graphFamily === 'sdxl_checkpoint_simple') {
        check(workflow[SCENE_IDS.sampler]?.class_type === 'KSampler', `${entry.id} sampler is node 3`);
        check(workflow[SCENE_IDS.checkpoint]?.class_type === 'CheckpointLoaderSimple', `${entry.id} checkpoint is node 4`);
        check(workflow[SCENE_IDS.latent]?.class_type === 'EmptyLatentImage', `${entry.id} latent is node 5`);
        check(workflow[SCENE_IDS.positive]?.class_type === 'CLIPTextEncode', `${entry.id} positive is node 6`);
        check(workflow[SCENE_IDS.negative]?.class_type === 'CLIPTextEncode', `${entry.id} negative is node 7`);
        check(workflow[SCENE_IDS.latent].inputs.width === entry.width, `${entry.id} width matches catalog`);
        check(workflow[SCENE_IDS.latent].inputs.height === entry.height, `${entry.id} height matches catalog`);
    }
}

check(ids.includes('portrait-sdxl'), 'portrait template is catalogued');
check(ids.includes('scene-sdxl-landscape'), 'landscape template is catalogued');
check(ids.includes('scene-sdxl-wide'), 'wide template is catalogued');

if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log('\ncomfyui workflow catalog test passed.');
