#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const root = path.join(__dirname, '..');

const originalLoad = Module._load;
Module._load = function mediaM1Load(request, parent, isMain) {
    if (request === 'vscode') { return {}; }
    return originalLoad.call(this, request, parent, isMain);
};

const core = require('../out/mediaProfileCore');
const compatibility = require('../out/mediaCompatibility');
const imageConfig = require('../out/imageGenConfig');
const circuit = require('../out/imageGenCircuitCore');
Module._load = originalLoad;

let failed = 0;
function fail(message) { console.error(`FAIL: ${message}`); failed++; }
function ok(message) { console.log(`OK: ${message}`); }
function check(condition, message) { condition ? ok(message) : fail(message); }
function equal(actual, expected, message) {
    check(actual === expected, `${message} (actual=${JSON.stringify(actual)}, expected=${JSON.stringify(expected)})`);
}
function hasReason(result, code) { return result.reasons.some(reason => reason.code === code); }

const simpleWorkflow = path.join(root, 'comfyui', 'workflow_sdxl_1024.json');
const cannyWorkflow = path.join(root, 'comfyui', 'workflow_cartography_sdxl_canny.json');
const directWorkflow = path.join(root, 'comfyui', 'workflow_cartography_sdxl_direct.json');
const compatibleWs = path.join(root, 'fixtures', 'media-m1', 'compatible');
const badWs = path.join(root, 'fixtures', 'media-m1', 'anima-incompatible');
const explicitSdxlWs = path.join(root, 'fixtures', 'media-m1', 'sdxl-explicit');
const explicitAnimaWs = path.join(root, 'fixtures', 'media-m1', 'anima-explicit');

// 1. Profile schema sanitization.
{
    const sanitized = core.sanitizeMediaProfile({
        id: ' Custom-SDXL ', displayName: ' Custom SDXL ', modelFamily: 'sdxl',
        graphFamily: 'sdxl_checkpoint_simple', mediaKinds: ['scene', 'scene', 'bogus'],
        promptModes: ['illustrious'], requiredNodeClasses: ['CheckpointLoaderSimple', 'KSampler'],
        defaults: { steps: 999, cfg: 7.5, width: 1024, height: 1024 },
    });
    equal(sanitized?.id, 'custom-sdxl', 'profile id is sanitized');
    equal(sanitized?.mediaKinds.length, 1, 'profile media kinds are deduplicated and filtered');
    equal(sanitized?.defaults.steps, 150, 'profile defaults are clamped');
    equal(core.sanitizeMediaProfile({ id: 'partial' }), undefined, 'partial profile is rejected');
}

// 2. Built-in lookup returns isolated copies.
{
    const first = core.getBuiltInMediaProfile('sdxl-illustrious-simple');
    const second = core.getBuiltInMediaProfile('sdxl-illustrious-simple');
    check(Boolean(first), 'built-in SDXL/Illustrious profile exists');
    first.mediaKinds.push('world_map');
    check(!second.mediaKinds.includes('world_map'), 'profile lookup does not expose mutable registry state');
    equal(core.getBuiltInMediaProfile('missing-profile'), undefined, 'missing profile lookup fails closed');
}

// 3-4. Deterministic v1 migration preserves legacy values and does not bless Anima.
{
    const compatibleRaw = JSON.parse(fs.readFileSync(path.join(compatibleWs, 'image_gen_config.json'), 'utf8'));
    const compatible = imageConfig.sanitizeImageGenConfig(compatibleRaw);
    equal(compatible.version, 2, 'v1 compatible config migrates to v2 envelope');
    equal(compatible.profileId, 'sdxl-illustrious-simple', 'v1 compatible config resolves safe profile candidate');
    equal(compatible.legacy.checkpoint, compatibleRaw.checkpoint, 'v1 checkpoint is preserved for rollback');

    const badRaw = JSON.parse(fs.readFileSync(path.join(badWs, 'image_gen_config.json'), 'utf8'));
    const bad = imageConfig.sanitizeImageGenConfig(badRaw);
    equal(bad.profileId, '', 'v1 Anima/Illustrious config is not assigned an SDXL profile');
    equal(bad.modelFamily, 'anima', 'v1 Anima diagnostic family is retained');
    equal(bad.legacy.workflowPath, badRaw.workflowPath, 'v1 incompatible workflow value remains visible');
}

const badPreflight = compatibility.preflightSceneGeneration(
    badWs,
    { TA_WORKFLOW: simpleWorkflow, TA_CHECKPOINT: 'Anima\\matureritualANIMA_test011.safetensors', TA_MODE: 'illustrious' },
    simpleWorkflow
);

// 5. Exact human failure: Anima + SDXL simple + Illustrious rejects with useful text.
{
    check(!badPreflight.ok, 'Anima + SDXL-simple + Illustrious is rejected');
    check(hasReason(badPreflight, 'MODEL_GRAPH_MISMATCH'), 'rejection identifies model/workflow mismatch');
    check(badPreflight.message.includes('Model family anima') && badPreflight.message.includes('sdxl_checkpoint_simple'),
        'human-readable reason names both model and workflow families');
    check(!badPreflight.env.TA_MEDIA_PREFLIGHT, 'rejected plan is not marked validated');
}

// 6. Legal SDXL/Illustrious path passes and carries a narrow Python contract.
const goodPreflight = compatibility.preflightSceneGeneration(
    compatibleWs,
    { TA_WORKFLOW: simpleWorkflow, TA_CHECKPOINT: 'illustriousXL_test.safetensors', TA_MODE: 'illustrious' },
    simpleWorkflow
);
{
    check(goodPreflight.ok, `legal SDXL/Illustrious stack passes: ${goodPreflight.message}`);
    equal(goodPreflight.env.TA_MEDIA_PREFLIGHT, 'validated', 'valid plan is marked for Python boundary');
    equal(goodPreflight.env.TA_MEDIA_PROFILE_ID, 'sdxl-illustrious-simple', 'resolved profile identity reaches executor contract');
}

// Pony remains representable without a recommendation database or separate architecture.
{
    const ponyRaw = imageConfig.sanitizeImageGenConfig({
        version: 1,
        checkpoint: 'ponyDiffusionXL_test.safetensors',
        workflowPath: '',
        mode: 'pony',
    });
    equal(ponyRaw.profileId, 'pony-sdxl-simple', 'v1 Pony binding resolves to the SDXL-compatible Pony profile');
    const pony = core.validateMediaCompatibility({
        profile: core.getBuiltInMediaProfile(ponyRaw.profileId),
        requestedProfileId: ponyRaw.profileId,
        modelFamily: ponyRaw.modelFamily,
        checkpoint: ponyRaw.checkpoint,
        checkpointFamilyHint: 'pony',
        promptMode: 'pony',
        mediaKind: 'scene',
        workflow: {
            exists: true, readable: true, path: simpleWorkflow, graphFamily: 'sdxl_checkpoint_simple',
            nodeClasses: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler'],
        },
    });
    check(pony.ok, `Pony profile remains compatible with the SDXL-simple graph: ${pony.message}`);
}

// 7. Wrong media kind is rejected by the profile unit.
{
    const profile = core.getBuiltInMediaProfile('sdxl-illustrious-simple');
    const result = core.validateMediaCompatibility({
        profile, requestedProfileId: profile.id, modelFamily: 'sdxl', checkpoint: 'model.safetensors',
        checkpointFamilyHint: 'unknown', promptMode: 'illustrious', mediaKind: 'world_map',
        workflow: {
            exists: true, readable: true, path: simpleWorkflow, graphFamily: 'sdxl_checkpoint_simple',
            nodeClasses: ['CheckpointLoaderSimple', 'CLIPTextEncode', 'KSampler'], checkpointBinding: 'model.safetensors',
        },
    });
    check(hasReason(result, 'MEDIA_KIND_UNSUPPORTED'), 'wrong media kind is rejected');
}

// 8. Missing workflow rejects before execution.
{
    const result = compatibility.preflightSceneGeneration(
        compatibleWs,
        { TA_WORKFLOW: path.join(root, 'fixtures', 'media-m1', 'missing.json'), TA_CHECKPOINT: 'illustriousXL_test.safetensors', TA_MODE: 'illustrious' },
        simpleWorkflow
    );
    check(!result.ok && hasReason(result, 'WORKFLOW_NOT_FOUND'), 'missing workflow is rejected');
}

// 9. Declared simple profile cannot use a cartography graph.
{
    const result = compatibility.preflightSceneGeneration(
        compatibleWs,
        { TA_WORKFLOW: cannyWorkflow, TA_CHECKPOINT: 'illustriousXL_test.safetensors', TA_MODE: 'illustrious' },
        simpleWorkflow
    );
    check(!result.ok && hasReason(result, 'GRAPH_FAMILY_MISMATCH'), 'graph-family mismatch is rejected');
}

// 10-11. Preflight rejection consumes no runtime circuit failure and invokes no executor.
{
    const before = circuit.createImageGenCircuitState();
    let spawnCalls = 0;
    const execution = compatibility.executeAfterMediaPreflight(badPreflight, () => { spawnCalls++; return true; });
    equal(execution.executed, false, 'preflight rejection does not enter executor seam');
    equal(spawnCalls, 0, 'queue/spawn callback is not invoked on rejection');
    equal(before.consecutiveFailures, 0, 'preflight rejection leaves runtime circuit failure count untouched');
}

// 12. Valid plan still reaches the existing executor seam.
{
    let spawnCalls = 0;
    const execution = compatibility.executeAfterMediaPreflight(goodPreflight, env => {
        spawnCalls++;
        return env.TA_WORKFLOW;
    });
    check(execution.executed && spawnCalls === 1, 'valid scene path reaches executor exactly once');
    equal(execution.value, path.resolve(simpleWorkflow), 'executor receives resolved validated workflow');
}

// 13-15. Portrait, expression, and scene/queue helpers all apply the same preflight.
{
    const env = { TA_WORKFLOW: simpleWorkflow, TA_CHECKPOINT: 'Anima\\bad.safetensors', TA_MODE: 'illustrious' };
    const portrait = compatibility.preflightPortraitGeneration(badWs, env, simpleWorkflow);
    const expression = compatibility.preflightExpressionGeneration(badWs, env, simpleWorkflow);
    const scene = compatibility.preflightSceneGeneration(badWs, env, simpleWorkflow);
    check(!portrait.ok && hasReason(portrait, 'MODEL_GRAPH_MISMATCH'), 'portrait path uses compatibility preflight');
    check(!expression.ok && hasReason(expression, 'MODEL_GRAPH_MISMATCH'), 'expression path uses compatibility preflight');
    check(!scene.ok && hasReason(scene, 'MODEL_GRAPH_MISMATCH'), 'scene/queue path uses compatibility preflight');
}

// 16-17. World-map guard rejects inherited Anima and preserves SDXL canny/direct paths.
{
    const badMap = compatibility.preflightWorldMapGeneration(
        explicitAnimaWs,
        { TA_CHECKPOINT: 'installed_anima_checkpoint.safetensors', TA_MODE: 'illustrious' },
        cannyWorkflow
    );
    check(!badMap.ok && hasReason(badMap, 'MODEL_GRAPH_MISMATCH'), 'world-map Anima inheritance is rejected');
    let mapSpawnCalls = 0;
    compatibility.executeAfterMediaPreflight(badMap, () => { mapSpawnCalls++; });
    equal(mapSpawnCalls, 0, 'rejected world map never reaches executor');

    const goodCanny = compatibility.preflightWorldMapGeneration(
        explicitSdxlWs,
        { TA_CHECKPOINT: 'installed_checkpoint.safetensors', TA_MODE: 'illustrious' },
        cannyWorkflow
    );
    const goodDirect = compatibility.preflightWorldMapGeneration(
        explicitSdxlWs,
        { TA_CHECKPOINT: 'installed_checkpoint.safetensors', TA_MODE: 'illustrious' },
        directWorkflow
    );
    check(goodCanny.ok, `SDXL canny world-map binding passes: ${goodCanny.message}`);
    check(goodDirect.ok, `SDXL direct world-map binding passes: ${goodDirect.message}`);
    compatibility.executeAfterMediaPreflight(goodCanny, () => { mapSpawnCalls++; });
    equal(mapSpawnCalls, 1, 'valid world map reaches existing executor seam');
}

// 18. The real compatibility wording and Japanese user-facing copy are drift guards.
{
    const mismatch = badPreflight.reasons.find(reason => reason.code === 'MODEL_GRAPH_MISMATCH');
    equal(mismatch?.message,
        'Model family anima is incompatible with workflow family sdxl_checkpoint_simple.',
        'real failure compatibility text remains specific');
    const ja = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'ja.json'), 'utf8'));
    const userText = ja['extension.error.mediaCompatibility'];
    check(userText.includes('互換性') && userText.includes('Media Profile'), 'Japanese compatibility UX remains understandable');
}

if (failed > 0) {
    console.error(`media profile compatibility: ${failed} failure(s)`);
    process.exit(1);
}
console.log('media profile compatibility: all tests passed.');
