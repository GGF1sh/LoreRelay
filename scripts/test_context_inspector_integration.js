#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

const gmBuilderPath = path.join(root, 'out', 'gmPromptBuilder.js');
const inspectorJs = path.join(root, 'webview', 'modules', '80-inspector.js');
const indexHtml = path.join(root, 'webview', 'index.html');
const locales = ['en', 'ja', 'zh-CN', 'zh-TW'];

if (!fs.existsSync(gmBuilderPath)) {
    fail('out/gmPromptBuilder.js missing — run npm run compile');
    process.exit(1);
}

const gmBuilderSource = fs.readFileSync(path.join(root, 'src', 'gmPromptBuilder.ts'), 'utf-8');
const inspectorSource = fs.readFileSync(inspectorJs, 'utf-8');
const indexSource = fs.readFileSync(indexHtml, 'utf-8');

{
    if (!gmBuilderSource.includes('buildContextInspectorReport')) {
        fail('gmPromptBuilder must attach contextInspector report');
    } else if (!gmBuilderSource.includes('buildGmPromptChunkSpecsWithMeta')) {
        fail('gmPromptBuilder must track inactive/empty chunk metadata');
    } else if (!gmBuilderSource.includes('contextInspector')) {
        fail('gmPromptBuilder must pass contextInspector to finalizeBreakdown');
    } else {
        ok('gmPromptBuilder wires contextInspector into breakdown');
    }
}

{
    const buildContext = gmBuilderSource.match(/export function buildGmPromptContext[\s\S]*?^}/m);
    if (!buildContext || !buildContext[0].includes('evictPromptChunksByBudget')) {
        fail('buildGmPromptContext must still use evictPromptChunksByBudget');
    } else if (buildContext[0].includes('buildContextInspectorReport')) {
        fail('buildGmPromptContext must not call inspector builder');
    } else {
        ok('buildGmPromptContext path unchanged aside from shared chunk specs helper');
    }
}

{
    if (!inspectorSource.includes('renderContextInspector')) {
        fail('80-inspector.js must render contextInspector');
    } else if (!inspectorSource.includes('inspector-context-inspector')) {
        fail('80-inspector.js must target inspector-context-inspector container');
    } else if (inspectorSource.includes('applySuggestedPriority')) {
        fail('inspector must not expose apply-priority mutation actions');
    } else {
        ok('webview inspector renders contextInspector without mutation buttons');
    }
}

{
    const contextInspectorBlock = inspectorSource.slice(
        inspectorSource.indexOf('function renderContextInspector'),
        inspectorSource.indexOf('function renderPromptContext')
    );
    if (contextInspectorBlock.includes('vscode.postMessage')) {
        fail('context inspector renderer must not post host mutations');
    } else {
        ok('context inspector renderer does not send host mutation messages');
    }
}

{
    if (!indexSource.includes('id="inspector-context-inspector"')) {
        fail('index.html must include inspector-context-inspector container');
    } else {
        ok('index.html includes context inspector container');
    }
}

{
    const requiredKeys = [
        'webview.inspector.contextInspector.summary',
        'webview.inspector.contextInspector.included',
        'webview.inspector.contextInspector.omitted',
        'webview.inspector.contextInspector.truncated',
        'webview.inspector.contextInspector.decision.included_pinned',
        'webview.inspector.contextInspector.category.vehicle',
    ];
    for (const locale of locales) {
        const filePath = path.join(root, 'locales', `${locale}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        for (const key of requiredKeys) {
            if (typeof data[key] !== 'string' || !data[key].trim()) {
                fail(`missing i18n key ${key} in ${locale}.json`);
            }
        }
    }
    ok('context inspector i18n keys exist in en/ja/zh-CN/zh-TW');
}

{
    const replaySrc = fs.readFileSync(path.join(root, 'src', 'replayExportCore.ts'), 'utf-8');
    if (replaySrc.includes('contextInspector')) {
        fail('replay export must not include contextInspector');
    } else {
        ok('replay export core does not reference contextInspector');
    }
}

if (failed > 0) {
    console.error(`\n${failed} test(s) failed.`);
    process.exit(1);
}
console.log('\nAll context_inspector_integration tests passed.');