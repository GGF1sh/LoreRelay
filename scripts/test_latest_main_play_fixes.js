#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = (relativePath) => JSON.parse(read(relativePath));

async function testWebviewIngress() {
    const restore = installVscodeStub({
        window: { showWarningMessage: async () => undefined },
    });
    try {
        const modulePath = path.join(root, 'out', 'webviewHandlers.js');
        delete require.cache[require.resolve(modulePath)];
        const { handleWebviewMessage } = require(modulePath);
        const playerCalls = [];
        let cancelCalls = 0;
        const deps = {
            async handlePlayerInput(...args) { playerCalls.push(args); },
            cancelGmTurn() { cancelCalls++; },
        };

        await handleWebviewMessage({
            type: 'freeInput',
            text: 'internal world-interview prompt',
            presentationText: 'Create a world with me',
            entryId: 'user-test-1',
        }, deps);
        await handleWebviewMessage({ type: 'cancelGmTurn' }, deps);

        assert.strictEqual(playerCalls.length, 1);
        assert.strictEqual(playerCalls[0][0], 'internal world-interview prompt');
        assert.strictEqual(playerCalls[0][4], 'Create a world with me');
        assert.strictEqual(cancelCalls, 1);
    } finally {
        restore();
    }
}

function testCancellationLifecycle() {
    const restore = installVscodeStub({
        window: {
            showErrorMessage() {},
            showWarningMessage() {},
            showInformationMessage() {},
            setStatusBarMessage() {},
            createOutputChannel() {
                return { append() {}, appendLine() {}, clear() {}, show() {} };
            },
        },
    });
    try {
        const modulePath = path.join(root, 'out', 'gmBridgeRunner.js');
        delete require.cache[require.resolve(modulePath)];
        const gm = require(modulePath);
        const messages = [];
        gm.initGmBridgeRunner({
            getPanel: () => ({ webview: { postMessage: (message) => messages.push(message) } }),
            buildGrokPrompt: () => '',
            getOpenRouterApiKey: async () => '',
            subscriptions: [],
        });
        gm.setAgenticBridgeBusy(true);
        assert.strictEqual(gm.cancelGmBridgeRun(), true);
        assert.strictEqual(gm.isGmBridgeBusy(), true, 'canceled run stays busy until its worker unwinds');
        assert.deepStrictEqual(messages, [{ type: 'gmEnd', success: false, canceled: true }]);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), true);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false);
        gm.setAgenticBridgeBusy(false);
        assert.strictEqual(gm.isGmBridgeBusy(), false);
    } finally {
        restore();
    }
}

function testPlayerFacingContracts() {
    const index = read('webview/index.html');
    const rules = read('webview/modules/70-game-rules.js');
    assert(index.includes('id="gr-story-combat"'));
    assert(rules.includes('enableStoryCombat: document.getElementById(\'gr-story-combat\')'));
    assert(rules.includes('enableStoryCombat: inputs.enableStoryCombat ? inputs.enableStoryCombat.checked : false'));

    const inputUx = read('webview/modules/20-input-audio-prep.js');
    assert(inputUx.includes("vscode.postMessage({ type: 'cancelGmTurn' })"));
    assert(inputUx.includes("T('webview.gm.loadingWorld')"));
    assert(inputUx.includes("T('webview.gm.loadingLong')"));
    assert(inputUx.includes('storySummary'));

    const summary = read('webview/modules/50-character-saga.js');
    assert(summary.includes("getElementById('story-summary').addEventListener('input'"));
    assert(summary.includes("vscode.postMessage({ type: 'updateSummary'"));

    const bootstrap = read('webview/modules/90-bootstrap.js');
    assert(bootstrap.includes("presentationText"));
    assert(bootstrap.includes("vscode.postMessage({ type: 'freeInput', text: template, presentationText, entryId })"));
    assert(!bootstrap.includes('freeInput.value = template'));
    assert(bootstrap.includes('hideGmLoading(msg.canceled ? true : msg.success)'));
}

function testScenarioAndMediaDefaults() {
    const scenario = read('src/scenarioPack.ts');
    assert(scenario.includes('await sendCurrentState(0, true);'));
    assert(!/setTimeout\(\(\) => \{\s*sendCurrentState/.test(scenario));
    assert(scenario.includes("runtimeAcceptedTurnWitnessMode: 'clear'"));

    const pkg = json('package.json');
    assert.strictEqual(pkg.contributes.configuration.properties['textAdventure.mediaAgent.autoImage'].default, false);
    assert(read('src/mediaAgent.ts').includes("get<boolean>('mediaAgent.autoImage', false)"));
    assert(read('src/imageGenRunner.ts').includes("reportMediaCompatibilityFailure(preflight, { revealOutput: false })"));
    assert(!read('src/gmBridgeRunner.ts').includes('channel.show(true)'));
}

function testLocaleCoverage() {
    const required = [
        'webview.gameRules.storyCombat',
        'webview.gm.cancel',
        'webview.gm.canceled',
        'webview.gm.loadingLong',
        'webview.startHub.interviewRequest',
    ];
    for (const localePath of ['locales/en.json', 'locales/ja.json', 'locales/zh-CN.json', 'locales/zh-TW.json']) {
        const locale = json(localePath);
        for (const key of required) {
            assert.strictEqual(typeof locale[key], 'string', `${localePath} missing ${key}`);
            assert(locale[key].trim(), `${localePath} has blank ${key}`);
        }
    }
}

Promise.resolve()
    .then(testWebviewIngress)
    .then(() => {
        testCancellationLifecycle();
        testPlayerFacingContracts();
        testScenarioAndMediaDefaults();
        testLocaleCoverage();
        console.log('Latest-main exploration fixes tests passed.');
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : String(error));
        process.exit(1);
    });
