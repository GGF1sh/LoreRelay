const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

(async () => {
    let provider = 'grok-acp', enabled = true;
    const clipboard = [], notices = [];
    const restore = installVscodeStub({
        workspace: { getConfiguration: () => ({ get: (key, fallback) => key === 'gmBridge.provider' ? provider
            : key === 'grokBridge.fallbackToClipboard' ? enabled : fallback }) },
        env: { clipboard: { writeText: async text => clipboard.push(text) } },
        window: { showInformationMessage: text => notices.push(text) },
    });
    try {
        const gm = require('../out/gmBridgeRunner');
        for (const selected of ['codex-app-server', 'claude-code-subscription', 'antigravity-cli', 'grok-acp', 'deepseek-api']) {
            provider = selected;
            await gm.fallbackToClipboard('private input');
            provider = 'clipboard'; // A setting change during the pending request cannot change its failure route.
            await gm.fallbackToClipboard('private input', selected);
        }
        assert.equal(clipboard.length, 0); assert.equal(notices.length, 0);
        await gm.fallbackToClipboard('manual');
        await gm.fallbackToClipboard('legacy', 'grok');
        assert.deepEqual(clipboard, ['manual', 'legacy']);
        enabled = false;
        await gm.fallbackToClipboard('disabled', 'grok');
        assert.equal(clipboard.length, 2);
    } finally { restore(); }

    // Run the real Parlor/In-World handlers. Invalidate after the model result is
    // returned but before the caller resumes to persist the assistant reply.
    for (const mode of ['parlor', 'inworld']) {
        for (const invalidate of [false, true]) {
            let current = true;
            const saved = [];
            const character = { id: 'fixture', name: 'Fixture' };
            const append = (session, message) => { saved.push(message); return session; };
            const mocks = {
                vscode: { workspace: { getConfiguration: () => ({ get: (_, fallback) => fallback }) }, window: { showWarningMessage() {} } },
                './workspacePaths': { getWorkspacePath: () => 'fixture' },
                './experience': { isParlorMode: () => mode === 'parlor', isInWorldMode: () => mode === 'inworld' },
                './characterManager': { getActiveCharacterProfile: () => character, getActiveCharacterId: () => character.id },
                './mods/modActivationGateHost': { areModCanonicalWritesAllowed: () => true },
                './mods/modHashCore': { ModDataError: class extends Error {} },
                './connectionProfile': { getActiveParlorConnectionProfile: () => ({ provider: 'grok-acp' }) },
                './gmBridgeRunner': { isParlorBridgeBusy: () => false, consumeGmBridgeCancellationRequest: () => false },
                './gmConnectionHost': { runConnectedGmChat: async () => {
                    queueMicrotask(() => { if (invalidate) current = false; });
                    return { ok: true, text: 'reply', isCurrent: () => current };
                } },
                './parlorSession': { getOrCreateParlorSession: () => ({}), appendAndSaveParlorMessage: append },
                './inWorldSession': { getOrCreateInWorldSession: () => ({}), appendAndSaveInWorldMessage: append },
                './parlorPromptBuilder': { buildParlorUserPrompt: () => 'prompt' },
                './inWorldPromptBuilder': { buildInWorldChatPrompt: () => 'prompt' },
                './parlorPromptBuilderCore': { sanitizeParlorAssistantReply: text => text },
                './i18n': { getConfiguredLocale: () => 'en' },
            };
            const filename = path.resolve(__dirname, '../out/parlorBridge.js');
            const exported = {};
            vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { exports: exported,
                require: id => mocks[id] || {}, console }, { filename });
            await exported[mode === 'parlor' ? 'handleParlorPlayerInput' : 'handleInWorldPlayerInput']('hello');
            assert.deepEqual(saved.map(item => item.role), invalidate ? ['user'] : ['user', 'assistant'], mode);
        }
    }
    console.log('GM failure routing and chat persistence-boundary cancellation passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
