#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const originalLoad = Module._load;
Module._load = function imageGenSettingsLoad(request, parent, isMain) {
    if (request === 'vscode') { return {}; }
    return originalLoad.call(this, parent ? request : request, parent, isMain);
};

const catalogCorePath = path.join(root, 'out', 'comfyWorkflowCatalogCore.js');
const resolvePath = path.join(root, 'out', 'imageGenSettingsResolveCore.js');
const hostPath = path.join(root, 'out', 'imageGenSettingsHost.js');
const configPath = path.join(root, 'out', 'imageGenConfig.js');
if (![catalogCorePath, resolvePath, hostPath, configPath].every((file) => fs.existsSync(file))) {
    console.error('FAIL: compiled image-gen settings modules missing — run npm run compile first');
    process.exit(1);
}

const catalogCore = require(catalogCorePath);
const resolveCore = require(resolvePath);
const host = require(hostPath);
const imageConfig = require(configPath);
Module._load = originalLoad;

let failed = 0;
function ok(message) { console.log(`OK: ${message}`); }
function fail(message) { console.error(`FAIL: ${message}`); failed++; }
function check(cond, message) { cond ? ok(message) : fail(message); }

const catalog = host.loadBundledWorkflowCatalog(path.join(root, 'comfyui'));
check(catalog.templates.length >= 7, 'loads templates.json as the catalog source of truth');
check(catalogCore.parseBundledWorkflowCatalog(JSON.parse(fs.readFileSync(path.join(root, 'comfyui', 'templates.json'), 'utf8'))),
    'parseBundledWorkflowCatalog accepts the bundled catalog');

const portrait = catalogCore.getCatalogTemplate(catalog, 'portrait-sdxl');
const landscape = catalogCore.getCatalogTemplate(catalog, 'scene-sdxl-landscape');
const mapCanny = catalogCore.getCatalogTemplate(catalog, 'map-sdxl-canny');
check(Boolean(portrait && landscape && mapCanny), 'catalog includes portrait, landscape, and map templates');

const bundledRoot = path.join(root, 'comfyui');
{
    const applied = resolveCore.applyWorkflowTemplateToSnapshot(
        { width: 1024, height: 1024, workflowPath: 'stale.json', sizeFollowsTemplate: false },
        portrait,
        bundledRoot,
    );
    check(applied.workflowTemplateId === 'portrait-sdxl', 'selecting 立ち絵 stores the portrait template id');
    check(applied.width === 0 && applied.height === 0, 'selecting a scene template clears leftover width/height');
    check(applied.sizeFollowsTemplate === true, 'selecting a scene template re-enables template size');
    check(String(applied.workflowPath).replace(/\\/g, '/').endsWith('/workflow_sdxl_portrait.json'),
        'selecting 立ち絵 points workflowPath at the portrait graph');
}

{
    const stale = {
        workflowTemplateId: 'portrait-sdxl',
        width: 1024,
        height: 1024,
        sizeFollowsTemplate: true,
    };
    const resolved = resolveCore.resolveImageGenExecutionSettings(stale, catalog);
    check(resolved.width === 896 && resolved.height === 1152, 'stale 1024×1024 does not square a portrait template');
    check(resolved.sizeSource === 'template', 'portrait size source is the template');
    check(resolved.ignoredStaleSize && resolved.ignoredStaleSize.width === 1024, 'stale square size is reported as ignored');
    check(resolved.workflowFile === 'workflow_sdxl_portrait.json', 'portrait resolves to the portrait workflow file');
}

{
    const manual = resolveCore.resolveImageGenExecutionSettings({
        workflowTemplateId: 'portrait-sdxl',
        width: 768,
        height: 1024,
        sizeFollowsTemplate: false,
    }, catalog);
    check(manual.width === 768 && manual.height === 1024, 'manual width/height override is honored when opted in');
    check(manual.sizeSource === 'manual-override', 'manual override is labeled');
}

{
    const inferred = resolveCore.resolveImageGenExecutionSettings({
        workflowPath: path.join(bundledRoot, 'workflow_sdxl_landscape.json'),
        width: 1024,
        height: 1024,
        sizeFollowsTemplate: true,
    }, catalog);
    check(inferred.templateId === '', 'without a trusted bundled root no path is inferred');
    const trusted = resolveCore.resolveImageGenExecutionSettings({ workflowPath: path.join(bundledRoot, 'workflow_sdxl_landscape.json'), width: 1024, height: 1024 }, catalog, bundledRoot);
    check(trusted.templateId === 'scene-sdxl-landscape' && trusted.width === 1152 && trusted.height === 896, 'verified bundled path infers landscape dimensions');
}

{
    const current = { width: 1024, height: 1024, workflowPath: 'scene.json', workflowTemplateId: 'portrait-sdxl' };
    const appliedMap = resolveCore.applyWorkflowTemplateToSnapshot(current, mapCanny, bundledRoot);
    check(appliedMap.cartographyTemplateId === 'map-sdxl-canny', 'map template stores cartographyTemplateId');
    check(appliedMap.workflowPath === 'scene.json', 'map template does not replace the scene workflowPath');
    check(appliedMap.width === 1024 && appliedMap.height === 1024, 'map template does not rewrite scene size');
    check(appliedMap.workflowTemplateId === 'portrait-sdxl', 'map template leaves the scene template id alone');
}

{
    const workspace = resolveCore.resolveWorkspaceImageGenSettings({
        snapshot: {
            workflowTemplateId: 'portrait-sdxl',
            cartographyTemplateId: 'map-sdxl-direct',
            width: 1024,
            height: 1024,
            sizeFollowsTemplate: true,
        },
        catalog,
        bundledRoot,
        cartographyFallbackFile: 'workflow_cartography_sdxl_canny.json',
    });
    check(workspace.resolved.generationPath === 'scene', 'scene resolution stays on the scene path');
    check(workspace.cartographyWorkflowFile === 'workflow_cartography_sdxl_direct.json',
        'map template selects the cartography graph');
    check(workspace.sceneWorkflowPath.replace(/\\/g, '/').endsWith('/workflow_sdxl_portrait.json'),
        'scene workflow path is the portrait file, not a map graph');
}

{
    const fallback = resolveCore.resolveCartographyWorkflowFile(
        { width: 0, height: 0 },
        catalog,
        'workflow_cartography_sdxl_canny.json',
    );
    check(fallback === 'workflow_cartography_sdxl_canny.json', 'cartography without a template keeps the existing fallback');
}

{
    const sanitized = imageConfig.sanitizeImageGenConfig({
        version: 1,
        checkpoint: 'illustriousXL_test.safetensors',
        width: 1024,
        height: 1024,
        mode: 'illustrious',
    });
    check(sanitized.workflowTemplateId === '', 'v1 configs get an empty scene template id');
    check(sanitized.cartographyTemplateId === '', 'v1 configs get an empty map template id');
    check(sanitized.sizeFollowsTemplate === true, 'sizeFollowsTemplate defaults to true so leftover sizes cannot win a later template pick');
}

{
    for (const [width, height, expectedWidth, expectedHeight] of [[768, 0, 768, 1152], [0, 768, 896, 768]]) {
        const resolved = resolveCore.resolveImageGenExecutionSettings({ workflowTemplateId: portrait.id, width, height, sizeFollowsTemplate: false }, catalog);
        check(resolved.width === expectedWidth && resolved.height === expectedHeight, 'single dimension edit uses template only for the missing side');
    }
    const custom = path.join(root, 'custom', portrait.file);
    const resolved = resolveCore.resolveWorkspaceImageGenSettings({ snapshot: { workflowPath: custom, width: 640, height: 768 }, catalog, bundledRoot });
    check(resolved.sceneWorkflowPath === custom && !resolved.resolved.templateId, 'same basename custom graph remains untouched');
    check(!catalogCore.listSceneTemplates(catalog).some(t => t.id === 'scene-sd15-square'), 'unsupported SD1.5 is absent from selectable templates');
}

// Actual host selector: unsaved edits and template selection are one save.
{
    const vm = require('vm');
    const source = fs.readFileSync(path.join(root, 'out/imageGenRunner.js'), 'utf8');
    const start = source.indexOf('async function handleSelectImageGenTemplate(');
    const handler = source.slice(start, source.indexOf('async function collectKnownComfyCheckpointNames', start));
    let config = imageConfig.sanitizeImageGenConfig({ checkpoint: 'old.safetensors' });
    const ctx = vm.createContext({
        workspacePaths_1: { getWorkspacePath: () => 'test' },
        imageGenSettingsHost_1: { getBundledComfyRoot: () => bundledRoot, loadBundledWorkflowCatalog: () => catalog },
        imageGenConfig_1: { loadImageGenConfig: () => config, sanitizeImageGenConfig: imageConfig.sanitizeImageGenConfig, saveImageGenConfig: (_ws, value) => { config = imageConfig.sanitizeImageGenConfig({ ...config, ...value }); } },
        comfyWorkflowCatalogCore_1: catalogCore, imageGenSettingsResolveCore_1: resolveCore,
        getImageGenExtensionPath() {}, postImageGenConfig() {}, console,
        vscode: { window: { showWarningMessage() {}, showErrorMessage() {} } }, i18n_1: { t: s => s },
    });
    vm.runInContext(handler, ctx);
    ctx.handleSelectImageGenTemplate({ group: 'scene', id: portrait.id, config: { checkpoint: 'edited.safetensors', cfg: 6, positivePrefix: 'pending text' } });
    check(config.checkpoint === 'edited.safetensors' && config.cfg === 6 && config.positivePrefix === 'pending text' && config.workflowTemplateId === portrait.id, 'scene selection retains all pending edits');
    ctx.handleSelectImageGenTemplate({ group: 'map', id: mapCanny.id, config: { checkpoint: 'map-edit.safetensors' } });
    check(config.checkpoint === 'map-edit.safetensors' && config.workflowTemplateId === portrait.id, 'map selection retains pending edits and scene choice');
    ctx.handleSelectImageGenTemplate({ group: 'scene', id: '' });
    check(!config.workflowPath && !resolveCore.resolveSceneTemplate(config, catalog, bundledRoot), 'None removes the bundled workflow without reinference');
}

{
    const vm = require('vm');
    const source = fs.readFileSync(path.join(root, 'out/cartographyRunner.js'), 'utf8');
    const start = source.indexOf('function buildCartographyEnv(');
    const ctx = vm.createContext({
        process: { env: {} }, path, imageGenRunner_1: { buildImageGenEnv: () => ({}), getResolvedImageMode: () => 'natural' },
        imageGenSettingsHost_1: { loadBundledWorkflowCatalog: () => catalog },
        imageGenConfig_1: { loadImageGenConfig: () => ({ cartographyTemplateId: 'map-sdxl-direct' }) },
        imageGenSettingsResolveCore_1: resolveCore, comfyWorkflowCatalogCore_1: catalogCore,
        cartographyFallbackFile: () => 'workflow_cartography_sdxl_canny.json', resolveCartographyLoraFromConfig: () => ({}),
        vscode: { workspace: { getConfiguration: () => ({ get: () => '' }) } },
    });
    vm.runInContext(source.slice(start, source.indexOf('function spawnAndWait(', start)), ctx);
    check(ctx.buildCartographyEnv('test', root).TA_LAYOUT_MODE === 'lineart', 'direct map template selects lineart without an environment override');
}
{
    const vm = require('vm'), handlers = {}, messages = [];
    const source = fs.readFileSync(path.join(root, 'webview/modules/60-tts-quickreply-imagegen.js'), 'utf8');
    const start = source.indexOf('(function initImageGenSettingsPanel()');
    const ctx = vm.createContext({
        document: { getElementById: id => ['ig-workflow-template', 'ig-cartography-template'].includes(id)
            ? { value: 'selected', addEventListener: (event, cb) => { handlers[id] = cb; } } : null },
        imageGenSaveTimer: 1, imageGenManualSize: true, clearTimeout() {},
        collectImageGenConfigFromForm: () => ({ checkpoint: 'unsaved', width: 768 }),
        vscode: { postMessage: m => messages.push(m) },
    });
    vm.runInContext(source.slice(start, source.indexOf('function speakText(', start)), ctx);
    handlers['ig-workflow-template'](); handlers['ig-cartography-template']();
    check(messages.length === 2 && messages.every(m => m.config.checkpoint === 'unsaved' && m.config.width === 768), 'both webview selectors deliver pending form edits with the selection');
}

if (failed) {
    console.error(`\n${failed} image-gen settings resolve check(s) failed`);
    process.exit(1);
}
console.log('\nimage-gen settings resolve tests passed.');
