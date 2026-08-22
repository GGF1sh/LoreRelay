#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
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

async function testCancellationLifecycle() {
    const errors = [];
    let currentModel;
    class CancellationTokenSource {
        constructor() {
            this.token = {};
        }
        cancel() {
            this.token.isCancellationRequested = true;
        }
        dispose() {}
    }
    class LanguageModelTextPart {
        constructor(value) {
            this.value = value;
        }
    }
    const restore = installVscodeStub({
        window: {
            showErrorMessage(message) { errors.push(message); },
            showWarningMessage() {},
            showInformationMessage() {},
            setStatusBarMessage() {},
            createOutputChannel() {
                return { append() {}, appendLine() {}, clear() {}, show() {} };
            },
        },
        workspace: {
            workspaceFolders: [{ name: 'test', uri: { fsPath: root } }],
            getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        },
        lm: {
            selectChatModels: async () => [currentModel],
        },
        CancellationTokenSource,
        LanguageModelChatMessage: { User: (text) => ({ text }) },
        LanguageModelTextPart,
    });
    try {
        const workspacePathsModulePath = path.join(root, 'out', 'workspacePaths.js');
        delete require.cache[require.resolve(workspacePathsModulePath)];
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

        assert.strictEqual(gm.cancelGmBridgeRun(), false, 'idle cancel has no worker to cancel');
        assert.deepStrictEqual(messages.pop(), { type: 'gmEnd', success: false, canceled: true });
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false, 'idle cancel must not poison the next request');

        assert.strictEqual(gm.cancelGmBridgeRun(true), true, 'pending gameplay request accepts pre-worker cancel');
        assert.deepStrictEqual(messages.pop(), { type: 'gmEnd', success: false, canceled: true });
        assert.strictEqual(gm.isGmBridgeCancellationRequested(), true);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), true);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false);

        gm.setAgenticBridgeBusy(true);
        assert.strictEqual(gm.cancelGmBridgeRun(), true);
        assert.strictEqual(gm.isGmBridgeBusy(), true, 'canceled run stays busy until its worker unwinds');
        assert.deepStrictEqual(messages, [{ type: 'gmEnd', success: false, canceled: true }]);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), true);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false);
        gm.setAgenticBridgeBusy(false);
        assert.strictEqual(gm.isGmBridgeBusy(), false);

        let preWorkerAgenticSendCount = 0;
        currentModel = {
            name: 'pre-worker-agentic-model',
            vendor: 'test',
            family: 'test',
            async sendRequest() {
                preWorkerAgenticSendCount += 1;
                return { stream: [] };
            },
        };
        assert.strictEqual(gm.cancelGmBridgeRun(true), true);
        const preWorkerCanceledAgentic = await gm.runVscodeLmAgenticStage({
            prompt: 'do not dispatch',
            stageLabel: 'Narrator',
            timeoutMs: 30_000,
        });
        assert.strictEqual(preWorkerCanceledAgentic.exitCode, 1);
        assert.strictEqual(preWorkerAgenticSendCount, 0, 'pre-worker Agentic cancel must stop before sendRequest');
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), true);

        let preWorkerSendCount = 0;
        currentModel = {
            name: 'pre-worker-model',
            vendor: 'test',
            family: 'test',
            async sendRequest() {
                preWorkerSendCount += 1;
                return { stream: [] };
            },
        };
        assert.strictEqual(gm.cancelGmBridgeRun(true), true);
        const preWorkerCanceledParlor = await gm.invokeParlorVscodeLm('do not dispatch');
        assert.strictEqual(preWorkerCanceledParlor.ok, false);
        assert.strictEqual(preWorkerSendCount, 0, 'pre-worker Parlor cancel must stop before sendRequest');
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false);

        currentModel = {
            name: 'cancel-model',
            vendor: 'test',
            family: 'test',
            async sendRequest() {
                assert.strictEqual(gm.cancelGmBridgeRun(), true);
                throw new Error('Canceled');
            },
        };
        const canceledParlor = await gm.invokeParlorVscodeLm('cancel this');
        assert.strictEqual(canceledParlor.ok, false);
        assert.strictEqual(gm.consumeGmBridgeCancellationRequest(), false, 'Parlor must consume its cancel flag');

        currentModel = {
            name: 'error-model',
            vendor: 'test',
            family: 'test',
            async sendRequest() {
                throw new Error('ordinary failure');
            },
        };
        const failedParlor = await gm.invokeParlorVscodeLm('next request');
        assert.strictEqual(failedParlor.ok, false);
        assert(errors.some((message) => message.includes('ordinary failure')), 'next Parlor failure is not suppressed');
        assert.deepStrictEqual(messages[messages.length - 1], { type: 'gmEnd', success: false });
    } finally {
        restore();
    }
}

async function testAgenticNarratorCancellationStopsCanonicalCommit() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-agentic-cancel-'));
    const savedModules = new Map();
    const replaceModule = (relativePath, exports) => {
        const modulePath = require.resolve(path.join(root, 'out', `${relativePath}.js`));
        savedModules.set(modulePath, require.cache[modulePath]);
        require.cache[modulePath] = {
            id: modulePath,
            filename: modulePath,
            loaded: true,
            exports,
        };
    };
    let cancellationRequested = false;
    let stageCount = 0;
    let mergeCount = 0;
    const writes = [];
    const channelLines = [];
    const panelMessages = [];
    const restoreVscode = installVscodeStub({
        window: {
            showErrorMessage() {},
            showWarningMessage() {},
            showInformationMessage() {},
            setStatusBarMessage() {},
        },
        workspace: {
            isTrusted: true,
            getConfiguration: () => ({
                get(key, fallback) {
                    if (key === 'gmBridge.agentic.enabled') { return true; }
                    return fallback;
                },
            }),
        },
    });
    try {
        replaceModule('i18n', { t: (key) => key });
        replaceModule('gmPromptBuilder', {
            buildProductionPromptAssembly: () => ({ promptText: 'context', receipt: {} }),
            postPromptContextToWebview() {},
        });
        replaceModule('agenticGmCore', {
            MAX_AGENTIC_TEXT_BYTES: 1024 * 1024,
            buildFallbackNarration: () => 'fallback must not be used',
            buildNarratorPrompt: () => 'narrator prompt',
            buildRefereePrompt: () => 'referee prompt',
            isAgenticCapableProvider: () => true,
            mergeAgenticTurnResult: () => {
                mergeCount += 1;
                return { ok: true, result: { turnId: 'forbidden-turn' } };
            },
            parseNarratorResultJson: () => null,
            parseRefereeResultJson: () => ({ turnId: 'turn-1', narrationFacts: [] }),
            suggestNextTurnId: () => 'turn-1',
        });
        replaceModule('playerAction', {
            formatRedactedAction: (text) => text,
            safeUnlinkPlayerActionFile() {},
            writePromptFile: () => path.join(tempDir, 'stage-prompt.md'),
        });
        replaceModule('workspacePaths', {
            getGmProvider: () => 'vscode-lm',
            getWorkspacePath: () => tempDir,
            writeJsonAtomic: (filePath) => writes.push(filePath),
        });
        replaceModule('turnResultFallback', {
            beginGmRun: () => undefined,
            finishGmRun() {},
        });
        replaceModule('promptReceiptCore', {
            buildTurnResultPromptReceiptMeta: (value) => value,
            hashPromptReceiptText: () => 'hash',
            withPromptReceiptDiagnostics: (value) => value,
        });
        replaceModule('gmBridgeRunner', {
            getGmBridgeOutputChannel: () => ({
                append() {},
                appendLine: (line) => channelLines.push(line),
                clear() {},
                show() {},
            }),
            createPromptAcceptedCallbackForTests: () => undefined,
            runGrokPromptFile: async () => ({ exitCode: 1, timedOut: false, stdout: '' }),
            runLocalAgenticStage: async () => ({ exitCode: 1, timedOut: false, stdout: '' }),
            runVscodeLmAgenticStage: async () => {
                stageCount += 1;
                if (stageCount === 1) {
                    return { exitCode: 0, timedOut: false, stdout: '{}' };
                }
                cancellationRequested = true;
                return { exitCode: 1, timedOut: false, stdout: '' };
            },
            isGmBridgeCancellationRequested: () => cancellationRequested,
            setAgenticBridgeBusy() {},
        });
        replaceModule('remotePlayServer', { notifyRemoteGmBusy() {} });
        replaceModule('acceptedTurnReplayGuard', {
            ensureAcceptedTurnScope() {},
            ensureAcceptedTurnWriterLease: () => undefined,
            getAcceptedTurnRestoreRepairLatchOutcome: () => undefined,
        });

        const agenticModulePath = require.resolve(path.join(root, 'out', 'agenticGmRunner.js'));
        delete require.cache[agenticModulePath];
        const { maybeInvokeAgenticBridge } = require(agenticModulePath);
        const result = await maybeInvokeAgenticBridge(
            'player action',
            undefined,
            () => ({ webview: { postMessage: (message) => panelMessages.push(message) } })
        );

        assert.deepStrictEqual(result, {
            handled: true,
            success: false,
            fallbackToSingleStage: false,
        });
        assert.strictEqual(stageCount, 2);
        assert.strictEqual(mergeCount, 0, 'canceled Narrator must not merge fallback narration');
        assert(
            !writes.some((filePath) => filePath.endsWith('final_turn_result.json') || filePath.endsWith('turn_result.json')),
            'canceled Narrator must not write final or canonical turn JSON'
        );
        assert(!panelMessages.some((message) => message.type === 'gmEnd' && message.success === true));
        assert(channelLines.some((line) => line.includes('Canceled before canonical turn commit')));
        delete require.cache[agenticModulePath];
    } finally {
        for (const [modulePath, saved] of savedModules) {
            if (saved) {
                require.cache[modulePath] = saved;
            } else {
                delete require.cache[modulePath];
            }
        }
        restoreVscode();
        fs.rmSync(tempDir, { recursive: true, force: true });
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
    .then(testCancellationLifecycle)
    .then(testAgenticNarratorCancellationStopsCanonicalCommit)
    .then(() => {
        testPlayerFacingContracts();
        testScenarioAndMediaDefaults();
        testLocaleCoverage();
        console.log('Latest-main exploration fixes tests passed.');
    })
    .catch((error) => {
        console.error(error instanceof Error ? error.stack || error.message : String(error));
        process.exit(1);
    });
