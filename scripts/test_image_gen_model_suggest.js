#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function imageGenSuggestLoad(request, parent, isMain) {
    if (request === 'vscode') { return {}; }
    return originalLoad.call(this, parent ? request : request, parent, isMain);
};

const suggestPath = path.join(root, 'out', 'imageGenModelSuggestCore.js');
const hostPath = path.join(root, 'out', 'imageGenSettingsHost.js');
if (!fs.existsSync(suggestPath) || !fs.existsSync(hostPath)) {
    console.error('FAIL: compiled image-gen suggestion modules missing — run npm run compile first');
    process.exit(1);
}

const suggest = require(suggestPath);
const host = require(hostPath);
Module._load = originalLoad;

let failed = 0;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed++; }
function check(cond, message) { cond ? ok(message) : fail(message); }

{
    const sidecar = suggest.extractSidecarBaseModel({
        model: { baseModel: 'Illustrious XL' },
    });
    check(sidecar === 'Illustrious XL', 'reads nested local sidecar baseModel');
    check(suggest.familyFromBaseModelLabel('Pony Diffusion') === 'pony', 'sidecar Pony maps to pony');
    check(suggest.familyFromFilename('prefectIllustriousXL_v8.safetensors') === 'sdxl', 'filename Illustrious maps to sdxl');
    check(suggest.familyFromFilename('flux1-dev.safetensors') === 'unknown', 'unsupported Flux filename stays unknown');
}

{
    const paths = suggest.sidecarPathsForModelFile('C:/models/checkpoints/IL/hero.safetensors');
    check(paths.includes('C:/models/checkpoints/IL/hero.safetensors.json'), 'civitai-helper json is a local sidecar candidate');
    check(paths.includes('C:/models/checkpoints/IL/hero.civitai.info'), 'civitai.info is a local sidecar candidate');
    check(paths.includes('C:/models/checkpoints/IL/hero.cm-info.json'), 'Comfy Manager sidecar is a local candidate');
}

{
    const names = suggest.parseComfyCheckpointListOutput([
        '利用可能なチェックポイント (http://127.0.0.1:8188):',
        '  IL\\prefectIllustriousXL_v8.safetensors',
        '  ponyDiffusionV6XL.safetensors',
        'not a model',
    ].join('\n'));
    check(names.length === 2, 'parses Comfy checkpoint names from --list-models output');
    check(names[0] === 'IL\\prefectIllustriousXL_v8.safetensors', 'keeps the Comfy subfolder prefix');
}

{
    const ready = suggest.suggestImageGenModel({
        comfyName: 'IL\\prefectIllustriousXL_v8.safetensors',
        relativePath: 'models\\checkpoints\\IL\\prefectIllustriousXL_v8.safetensors',
        category: 'checkpoint',
        sidecar: { baseModel: 'Illustrious' },
        sidecarSource: 'prefectIllustriousXL_v8.civitai.info',
        knownComfyNames: ['IL\\prefectIllustriousXL_v8.safetensors'],
    });
    check(ready.status === 'ready', 'matching filename, sidecar, and Comfy name is ready');
    check(ready.modelFamily === 'sdxl', 'ready suggestion uses the sdxl family');
    check(ready.mode === 'illustrious', 'Illustrious sidecar selects illustrious mode');
    check(ready.workflowTemplateId === 'scene-sdxl-square', 'ready XL checkpoint suggests the SDXL scene template');
    check(ready.reasons.some((row) => row.includes('sidecar')), 'ready suggestion cites the local sidecar');
    check(ready.reasons.some((row) => row.includes('ComfyUI')), 'ready suggestion cites the Comfy name match');
}

{
    const conflict = suggest.suggestImageGenModel({
        comfyName: 'ponyMix.safetensors',
        relativePath: 'checkpoints\\ponyMix.safetensors',
        category: 'checkpoint',
        sidecar: { baseModel: 'Illustrious' },
        sidecarSource: 'ponyMix.json',
        knownComfyNames: ['ponyMix.safetensors'],
    });
    check(conflict.status === 'unresolved', 'filename vs sidecar family conflict is unresolved');
    check(conflict.modelFamily === 'unknown', 'conflict does not pick a family');
    check(conflict.workflowTemplateId === '', 'conflict does not suggest a template');
}

{
    const unverified = suggest.suggestImageGenModel({
        comfyName: 'illustriousXL_test.safetensors',
        relativePath: 'illustriousXL_test.safetensors',
        category: 'checkpoint',
        sidecar: { baseModel: 'SDXL' },
    });
    check(unverified.status === 'comfy-unverified', 'missing Comfy list is comfy-unverified, not a silent apply');
    check(unverified.workflowTemplateId === 'scene-sdxl-square', 'unverified still proposes a template for the user to apply');
}

{
    const unknownName = suggest.suggestImageGenModel({
        comfyName: 'missing.safetensors',
        relativePath: 'missing.safetensors',
        category: 'checkpoint',
        sidecar: { baseModel: 'Illustrious' },
        knownComfyNames: ['other.safetensors'],
    });
    check(unknownName.status === 'unresolved', 'name absent from Comfy list is unresolved');
}

{
    const anima = suggest.suggestImageGenModel({
        comfyName: 'matureritualANIMA.safetensors',
        relativePath: 'anima\\matureritualANIMA.safetensors',
        category: 'checkpoint',
        knownComfyNames: ['matureritualANIMA.safetensors'],
    });
    check(anima.status === 'unresolved', 'Anima is unresolved rather than assigned an SDXL template');
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-image-suggest-'));
try {
    const ckptDir = path.join(tmp, 'models', 'checkpoints');
    fs.mkdirSync(ckptDir, { recursive: true });
    const file = path.join(ckptDir, 'prefectIllustriousXL_v8.safetensors');
    fs.writeFileSync(file, Buffer.alloc(1024));
    fs.writeFileSync(path.join(ckptDir, 'prefectIllustriousXL_v8.json'), JSON.stringify({
        baseModel: 'Illustrious',
        downloadUrl: 'https://civitai.com/should-not-be-fetched',
    }));
    const rows = host.collectLocalImageGenModelSuggestions({
        roots: [tmp],
        knownComfyNames: ['prefectIllustriousXL_v8.safetensors'],
    });
    check(rows.length === 1, 'local folder scan suggests the checkpoint file');
    check(rows[0].status === 'ready', 'local sidecar + Comfy name produces a ready suggestion');
    check(rows[0].evidence.sidecarSource === 'prefectIllustriousXL_v8.json', 'records the local sidecar filename');
    check(!JSON.stringify(rows).includes('civitai.com/should-not-be-fetched'),
        'suggestion payload does not perform or copy a Civitai network lookup');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed) {
    console.error(`\n${failed} image-gen model suggestion check(s) failed`);
    process.exit(1);
}
console.log('\nimage-gen model suggestion tests passed.');
