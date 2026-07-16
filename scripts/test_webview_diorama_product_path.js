#!/usr/bin/env node
'use strict';

/**
 * HUMAN-PLAY-GATE-BLOCKERS-001
 * Production Webview resource/CSP contract and honest Three.js lazy-loader tests.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
const extensionSource = fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8');
const loaderSource = fs.readFileSync(path.join(root, 'webview', 'modules', '86c-settlement-diorama.js'), 'utf8');
const vscodeIgnore = fs.readFileSync(path.join(root, '.vscodeignore'), 'utf8');
const threePath = path.join(root, 'webview', 'vendor', 'three.min.js');

function scriptSrcDirective(html) {
    const match = html.match(/script-src\s+([^;]+);/i);
    return match ? match[1] : '';
}

assert(fs.existsSync(threePath), 'packaged webview/vendor/three.min.js must exist');
assert(fs.statSync(threePath).size > 500000, 'packaged Three.js file must be non-empty and plausible');
assert(!/^webview\/vendor(?:\/\*\*)?\s*$/m.test(vscodeIgnore), '.vscodeignore must not exclude webview/vendor');
assert(!/^webview\/vendor\/three\.min\.js\s*$/m.test(vscodeIgnore), '.vscodeignore must not exclude three.min.js');
assert(extensionSource.includes("webviewAssetUri(path.join('vendor', 'three.min.js'))"), 'extension must generate the Three.js URI');
assert(extensionSource.includes('webview.asWebviewUri'), 'extension must use webview.asWebviewUri');
assert(extensionSource.includes("path.join(context.extensionPath, 'webview')"), 'webview localResourceRoots must include packaged webview directory');

const compiledCorePath = path.join(root, 'out', 'webviewHtmlCore.js');
assert(fs.existsSync(compiledCorePath), 'compiled webviewHtmlCore missing — run npm run compile');
const { renderWebviewHtml } = require(compiledCorePath);
const sample = {
    styleUri: 'vscode-webview://unit/webview/style.css?v=1',
    scriptUri: 'vscode-webview://unit/webview/script.js?v=2',
    mermaidUri: 'vscode-webview://unit/webview/vendor/mermaid.min.js?v=3',
    threeUri: 'vscode-webview://unit/webview/vendor/three.min.js?v=4',
    genesisAssetBaseUri: 'vscode-webview://unit/webview',
    cspSource: 'vscode-webview://unit',
    nonce: 'unit-nonce',
};
const rendered = renderWebviewHtml(indexHtml, sample);
assert(rendered.includes(sample.threeUri), 'rendered product HTML must receive the Three.js Webview URI');
assert(rendered.includes("window.__LR_THREE_SCRIPT_URI__ = 'vscode-webview://unit/webview/vendor/three.min.js?v=4'"), 'Three.js global must contain the rendered URI');
assert(rendered.includes("window.__LR_SCRIPT_NONCE__ = 'unit-nonce'"), 'lazy loader must receive the host nonce');
assert(!rendered.includes('{{threeUri}}') && !rendered.includes('{{nonce}}'), 'runtime placeholders must be fully replaced');
const scriptSrc = scriptSrcDirective(rendered);
assert(scriptSrc.includes("'nonce-unit-nonce'"), 'CSP must authorize only host-nonced scripts');
assert(!/https?:/i.test(scriptSrc) && !scriptSrc.includes("'unsafe-inline'"), 'script-src must not allow remote or unsafe-inline scripts');

function loaderSlice() {
    const start = loaderSource.indexOf('function detectWebglSupport()');
    const end = loaderSource.indexOf('function getMobileBaseInteriorDiorama');
    assert(start >= 0 && end > start, 'Three.js loader source slice must be found');
    return loaderSource.slice(start, end);
}

async function exerciseLoader({ uri, nonce, load = 'success', contexts = { webgl: {} } }) {
    const errors = [];
    let appendedScript = null;
    const sandbox = {
        window: {
            __LR_THREE_SCRIPT_URI__: uri,
            __LR_SCRIPT_NONCE__: nonce,
            WebGLRenderingContext: contexts.webgl ? function WebGLRenderingContext() {} : undefined,
            WebGL2RenderingContext: contexts.webgl2 ? function WebGL2RenderingContext() {} : undefined,
        },
        document: {
            createElement(tag) {
                if (tag === 'canvas') {
                    return { getContext(kind) { return contexts[kind] || null; } };
                }
                return { tagName: tag.toUpperCase(), src: '', async: false, nonce: '' };
            },
            head: {
                appendChild(script) {
                    appendedScript = script;
                    if (load === 'success') {
                        sandbox.THREE = { Scene: function Scene() {} };
                        script.onload();
                    } else {
                        script.onerror(new Error('blocked'));
                    }
                },
            },
        },
        console: {
            error(...args) { errors.push(args.map(String).join(' ')); },
            warn() {}, log() {},
        },
        THREE: undefined,
    };
    sandbox.window.window = sandbox.window;
    const context = vm.createContext(sandbox);
    const api = vm.runInContext(`
        let _dioramaAvailable = null;
        let _dioramaThreeLoadPromise = null;
        ${loaderSlice()}
        ({ loadThreeJsLazy, detectWebglSupport });
    `, context);
    const ok = await api.loadThreeJsLazy();
    return { ok, appendedScript, errors, detectWebglSupport: api.detectWebglSupport };
}

(async () => {
    const success = await exerciseLoader({
        uri: sample.threeUri,
        nonce: sample.nonce,
        load: 'success',
        contexts: { webgl: {} },
    });
    assert.strictEqual(success.ok, true, 'successful packaged script load must expose THREE');
    assert.strictEqual(success.appendedScript.src, sample.threeUri, 'loader must use only the injected Webview URI');
    assert.strictEqual(success.appendedScript.nonce, sample.nonce, 'dynamic script must carry the CSP nonce');
    assert.deepStrictEqual(success.errors, [], 'successful load must not report an error');

    const webgl2 = await exerciseLoader({
        uri: sample.threeUri,
        nonce: sample.nonce,
        load: 'success',
        contexts: { webgl2: {} },
    });
    assert.strictEqual(webgl2.ok, true, 'WebGL2-only Webview must be accepted');

    const failed = await exerciseLoader({
        uri: sample.threeUri,
        nonce: sample.nonce,
        load: 'error',
        contexts: { webgl: {} },
    });
    assert.strictEqual(failed.ok, false, 'failed script load must remain unavailable');
    assert(failed.errors.some((line) => line.includes('Failed to load packaged Three.js')), 'failed load must log an honest product error');

    const missing = await exerciseLoader({
        uri: '',
        nonce: sample.nonce,
        load: 'success',
        contexts: { webgl: {} },
    });
    assert.strictEqual(missing.ok, false, 'missing URI must remain unavailable');
    assert(missing.errors.some((line) => line.includes('Webview URI is missing')), 'missing URI must log an honest product error');

    console.log('webview Diorama product path: all passed');
})().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
});
