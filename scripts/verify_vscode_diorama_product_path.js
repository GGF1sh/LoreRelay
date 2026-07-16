#!/usr/bin/env node
'use strict';

/**
 * Attach to an isolated VS Code Extension Development Host started with
 * --remote-debugging-port and verify the real LoreRelay Webview/Diorama path.
 */

const DEBUG_PORT = Number(process.argv[2] || 9333);
const TIMEOUT_MS = Number(process.argv[3] || 30000);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function cdpJson(pathname) {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}${pathname}`);
    if (!response.ok) { throw new Error(`CDP HTTP ${response.status}`); }
    return response.json();
}

class Cdp {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }
    async connect() {
        const WebSocket = (await import('ws')).default;
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.once('open', resolve);
            this.ws.once('error', reject);
        });
        this.ws.on('message', (data) => {
            const message = JSON.parse(String(data));
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) { pending.reject(new Error(JSON.stringify(message.error))); }
                else { pending.resolve(message.result); }
                return;
            }
            for (const listener of this.listeners.get(message.method) || []) {
                listener(message.params || {});
            }
        });
    }
    on(method, listener) {
        if (!this.listeners.has(method)) { this.listeners.set(method, []); }
        this.listeners.get(method).push(listener);
    }
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression, contextId = undefined) {
        const params = {
            expression,
            returnByValue: true,
            awaitPromise: true,
        };
        if (contextId !== undefined) { params.contextId = contextId; }
        const result = await this.send('Runtime.evaluate', params);
        if (result.exceptionDetails) { throw new Error(JSON.stringify(result.exceptionDetails)); }
        return result.result && result.result.value;
    }
    close() {
        try { this.ws?.close(); } catch { /* ignore */ }
    }
}

async function press(cdp, key, code, windowsVirtualKeyCode) {
    await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key, code, windowsVirtualKeyCode,
    });
    await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key, code, windowsVirtualKeyCode,
    });
}

function isLoreRelayWebviewTarget(target) {
    const url = String(target?.url || '');
    const title = String(target?.title || '');
    return url.startsWith('vscode-webview://')
        || url.includes('/webview/index.html')
        || (target?.type === 'iframe' && title.includes('LoreRelay'));
}

async function main() {
    const started = Date.now();
    let targets = await cdpJson('/json/list');
    const workbench = targets.find((target) => target.type === 'page' && String(target.url).includes('workbench.html'));
    if (!workbench?.webSocketDebuggerUrl) { throw new Error('VS Code workbench CDP target not found'); }

    const workbenchCdp = new Cdp(workbench.webSocketDebuggerUrl);
    await workbenchCdp.connect();
    await workbenchCdp.send('Runtime.enable');
    await workbenchCdp.send('Page.enable');

    let webviewTarget = targets.find(isLoreRelayWebviewTarget) || null;
    if (!webviewTarget) {
        // Open the extension command through VS Code's command palette only
        // when the product Webview is not already present.
        await press(workbenchCdp, 'F1', 'F1', 112);
        await sleep(400);
        await workbenchCdp.send('Input.insertText', { text: 'LoreRelay: Open Game UI' });
        await sleep(500);
        await press(workbenchCdp, 'Enter', 'Enter', 13);
    }

    while (Date.now() - started < TIMEOUT_MS) {
        targets = await cdpJson('/json/list');
        webviewTarget = targets.find(isLoreRelayWebviewTarget);
        if (webviewTarget?.webSocketDebuggerUrl) { break; }
        await sleep(250);
    }
    if (!webviewTarget?.webSocketDebuggerUrl) {
        throw new Error(`LoreRelay Webview CDP target not found: ${JSON.stringify(targets.map((t) => ({ type: t.type, title: t.title, url: t.url })))}`);
    }

    const webviewCdp = new Cdp(webviewTarget.webSocketDebuggerUrl);
    const consoleErrors = [];
    const executionContexts = [];
    webviewCdp.on('Runtime.executionContextCreated', ({ context }) => {
        if (context && !executionContexts.some((item) => item.id === context.id)) {
            executionContexts.push(context);
        }
    });
    webviewCdp.on('Runtime.consoleAPICalled', (params) => {
        if (params.type === 'error') {
            consoleErrors.push((params.args || []).map((arg) => arg.value || arg.description || '').join(' '));
        }
    });
    webviewCdp.on('Log.entryAdded', ({ entry }) => {
        if (entry?.level === 'error') { consoleErrors.push(entry.text || ''); }
    });
    await webviewCdp.connect();
    await webviewCdp.send('Runtime.enable');
    await webviewCdp.send('Log.enable');
    await webviewCdp.send('Page.enable');

    let ready = false;
    let loreRelayContextId;
    while (Date.now() - started < TIMEOUT_MS) {
        const contextIds = [undefined, ...executionContexts.map((context) => context.id)];
        for (const contextId of contextIds) {
            try {
                ready = await webviewCdp.eval(`Boolean(
                    document.getElementById('world-diorama-canvas')
                    && document.getElementById('world-map-mode-diorama')
                )`, contextId);
            } catch {
                ready = false;
            }
            if (ready) {
                loreRelayContextId = contextId;
                break;
            }
        }
        if (ready) { break; }
        await sleep(200);
    }
    if (!ready) {
        const summary = executionContexts.map((context) => ({
            id: context.id,
            name: context.name,
            origin: context.origin,
            auxData: context.auxData,
        }));
        throw new Error(`LoreRelay Webview DOM did not become ready; contexts=${JSON.stringify(summary)}`);
    }

    const result = await webviewCdp.eval(`(async () => {
        if (typeof setWorldMapMode === 'function') {
            setWorldMapMode('diorama', { persist: false });
        }
        if (typeof renderSettlementDiorama === 'function') {
            renderSettlementDiorama();
        }
        for (let i = 0; i < 50; i++) {
            if (typeof THREE !== 'undefined') { break; }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        const canvas = document.getElementById('world-diorama-canvas');
        const stage = document.getElementById('world-diorama-stage');
        const unavailable = document.getElementById('world-diorama-unavailable');
        const probe2 = document.createElement('canvas');
        const probe1 = document.createElement('canvas');
        let gl2 = null;
        let gl1 = null;
        try { gl2 = probe2.getContext('webgl2'); } catch (_) {}
        try { gl1 = probe1.getContext('webgl') || probe1.getContext('experimental-webgl'); } catch (_) {}
        return {
            three: typeof THREE !== 'undefined' && typeof THREE.Scene === 'function',
            threeUri: window.__LR_THREE_SCRIPT_URI__ || null,
            noncePresent: Boolean(window.__LR_SCRIPT_NONCE__),
            loadedThreeScript: [...document.scripts].some((script) => String(script.src).includes('three.min.js')),
            webgl: Boolean(gl1),
            webgl2: Boolean(gl2),
            canvasExists: Boolean(canvas),
            canvasWidth: canvas ? canvas.width : 0,
            canvasHeight: canvas ? canvas.height : 0,
            stageVisible: Boolean(stage && !stage.classList.contains('hidden')),
            unavailableHidden: Boolean(unavailable && unavailable.classList.contains('hidden')),
            csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '',
            reedmarketNavigator: Boolean(document.querySelector('.world-location-chip[data-location-id="loc_reedmarket"]')),
        };
    })()`, loreRelayContextId);

    const relevantErrors = consoleErrors.filter((line) => /three|webgl|content security policy|csp|resource/i.test(line));
    const failures = [];
    if (!result.three) { failures.push('window.THREE unavailable'); }
    if (!result.threeUri || !result.threeUri.includes('three.min.js')) { failures.push('Three.js Webview URI missing'); }
    if (!result.noncePresent || !result.loadedThreeScript) { failures.push('nonced Three.js script not present'); }
    if (!result.webgl && !result.webgl2) { failures.push('WebGL/WebGL2 unavailable'); }
    if (!result.canvasExists || result.canvasWidth <= 0 || result.canvasHeight <= 0) { failures.push('Diorama canvas not rendered'); }
    if (!result.stageVisible || !result.unavailableHidden) { failures.push('Diorama unavailable state still visible'); }
    if (!result.reedmarketNavigator) { failures.push('Reedmarket location navigator entry missing'); }
    if (relevantErrors.length) { failures.push(`CSP/resource console errors: ${relevantErrors.join(' | ')}`); }

    console.log(JSON.stringify({ target: { type: webviewTarget.type, title: webviewTarget.title, url: webviewTarget.url }, result, relevantErrors }, null, 2));
    webviewCdp.close();
    workbenchCdp.close();
    if (failures.length) { throw new Error(failures.join('; ')); }
    console.log('VS Code Diorama product-path verification: passed');
}

main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
});
