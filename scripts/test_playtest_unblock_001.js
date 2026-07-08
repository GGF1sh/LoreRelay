#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const scenarioPath = path.join(root, 'sample-scenarios', 'scrapbound-settlement', 'scenario.json');
const gameStateModulePath = path.join(root, 'webview', 'modules', '10-game-state.js');
const bootstrapModulePath = path.join(root, 'webview', 'modules', '90-bootstrap.js');
const scenarioPackPath = path.join(root, 'out', 'scenarioPack.js');
const characterManagerPath = path.join(root, 'out', 'characterManager.js');
const gameStateSyncPath = path.join(root, 'out', 'gameStateSync.js');
const mediaManifestPath = path.join(root, 'out', 'mediaManifest.js');

let failed = 0;
function fail(message) {
    console.error(`FAIL: ${message}`);
    failed++;
}
function ok(message) {
    console.log(`OK: ${message}`);
}

for (const p of [
    scenarioPath,
    gameStateModulePath,
    bootstrapModulePath,
    scenarioPackPath,
    characterManagerPath,
    gameStateSyncPath,
    mediaManifestPath,
]) {
    if (!fs.existsSync(p)) {
        fail(`missing ${path.relative(root, p)} (run npm run compile first)`);
        process.exit(1);
    }
}

function createClassList(initial = []) {
    const set = new Set(initial);
    return {
        add(...tokens) {
            for (const token of tokens) {
                set.add(token);
            }
        },
        remove(...tokens) {
            for (const token of tokens) {
                set.delete(token);
            }
        },
        contains(token) {
            return set.has(token);
        },
        toggle(token, force) {
            if (force === undefined) {
                if (set.has(token)) {
                    set.delete(token);
                    return false;
                }
                set.add(token);
                return true;
            }
            if (force) {
                set.add(token);
                return true;
            }
            set.delete(token);
            return false;
        },
    };
}

function createFakeElement(id, initialClasses = []) {
    return {
        id,
        className: '',
        classList: createClassList(initialClasses),
        style: {},
        dataset: {},
        children: [],
        listeners: new Map(),
        disabled: false,
        value: '',
        textContent: '',
        innerHTML: '',
        title: '',
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        remove() {
            this.removed = true;
        },
        addEventListener(type, handler) {
            if (!this.listeners.has(type)) {
                this.listeners.set(type, []);
            }
            this.listeners.get(type).push(handler);
        },
        click() {
            const handlers = this.listeners.get('click') || [];
            for (const handler of handlers) {
                handler({ target: this, stopPropagation() {} });
            }
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        focus() {},
        setSelectionRange() {},
        getBoundingClientRect() {
            return { width: 320 };
        },
    };
}

function runStartHubBehaviorTest() {
    const elements = new Map();
    const ensureElement = (id, initialClasses = []) => {
        if (!elements.has(id)) {
            elements.set(id, createFakeElement(id, initialClasses));
        }
        return elements.get(id);
    };

    const chatLog = ensureElement('chat-log');
    const startHub = ensureElement('start-hub', ['hidden']);
    const homeBtn = ensureElement('start-hub-home-btn', ['hidden']);
    const resumeRow = ensureElement('start-hub-resume-row', ['hidden']);
    const resumeBtn = ensureElement('start-hub-resume-btn');
    ensureElement('story-summary');
    ensureElement('status-content');
    ensureElement('options-bar');
    ensureElement('free-input');
    ensureElement('send-btn');
    ensureElement('img-btn');
    ensureElement('mic-btn');
    ensureElement('undo-btn');

    const windowListeners = new Map();
    const windowStub = {
        LoreRelay: {},
        speechSynthesis: { cancel() {} },
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) {
                windowListeners.set(type, []);
            }
            windowListeners.get(type).push(handler);
        },
    };
    const documentStub = {
        body: { classList: createClassList(), style: {} },
        getElementById(id) {
            return ensureElement(id);
        },
        createElement(tag) {
            return createFakeElement(tag);
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        addEventListener() {},
    };

    const context = vm.createContext({
        console,
        window: windowStub,
        document: documentStub,
        vscode: {
            getState() { return null; },
            postMessage() {},
        },
        navigator: { clipboard: { writeText: async () => undefined } },
        localStorage: { getItem() { return null; }, setItem() {} },
        setTimeout(fn) {
            fn();
            return 0;
        },
        clearTimeout() {},
        messageHistory: [{ id: 'gm-1', role: 'gm', sender: 'GM', content: 'Existing session' }],
        galleryImages: [],
        currentTheme: 'fantasy',
        freeInput: ensureElement('free-input'),
        sendBtn: ensureElement('send-btn'),
        imgBtn: ensureElement('img-btn'),
        micBtn: ensureElement('mic-btn'),
        undoBtn: ensureElement('undo-btn'),
        optionsBar: ensureElement('options-bar'),
        chatLog,
        seenHiddenDiceIds: new Set(),
        lastDiceRequestId: '',
        gameOverActive: false,
        ttsEnabled: false,
        ttsSpeed: 1,
        ttsVolume: 0.8,
        parlorHasCharacter: false,
        experienceProfile: 'campaign',
        checkpointMetas: [],
        rewindTargets: [],
        welcomeShown: false,
        i18nStrings: {},
        currentCharacters: [],
        activeCharId: '',
        currentPartyIds: [],
        saveState() {},
        autoGrowFreeInput() {},
        renderGallery() {},
        updateCharacterList() {},
        updateEffectsTierButton() {},
        updateRemotePlayButton() {},
        showImageLoading() {},
        hideImageLoading() {},
        setBgmManifest() {},
        setSfxManifest() {},
        showGmLoading() {},
        hideGmLoading() {},
        setTheme() {},
        playBgmById() {},
        playBgmByMood() {},
        playSfx() {},
        setSceneBackground() {},
        setSceneSprite() {},
        scrollToBottom() {},
        speakEntryText() {},
        handleDiceRequest() {},
        getCharacterColor() { return '#fff'; },
        escapeHtml(value) { return String(value); },
        addImageToGallery() {},
        localeSelect() { return ensureElement('locale-select'); },
        applyI18n() {},
        renderCheckpointUi() {},
        startInlineEdit() {},
        T(key) { return key; },
    });

    vm.runInContext(fs.readFileSync(gameStateModulePath, 'utf8'), context, { filename: '10-game-state.js' });
    vm.runInContext(fs.readFileSync(bootstrapModulePath, 'utf8'), context, { filename: '90-bootstrap.js' });

    for (const handler of windowListeners.get('DOMContentLoaded') || []) {
        handler();
    }

    if (!startHub.classList.contains('hidden')) {
        fail('active session should initially show chat, not Start Hub');
        return;
    }
    if (homeBtn.classList.contains('hidden')) {
        fail('active session should expose Home button');
        return;
    }

    homeBtn.click();
    if (startHub.classList.contains('hidden') || !chatLog.classList.contains('hidden')) {
        fail('Home should keep Start Hub visible and hide chat');
        return;
    }
    if (resumeRow.classList.contains('hidden')) {
        fail('Home should expose Resume row');
        return;
    }

    const messageHandlers = windowListeners.get('message') || [];
    for (const handler of messageHandlers) {
        handler({
            data: {
                type: 'gameStateUpdate',
                syncSeq: 1,
                fullHistory: false,
                state: {
                    entries: [{ id: 'gm-1', role: 'gm', sender: 'GM', content: 'Existing session' }],
                    status: {
                        location: 'Scrapbound',
                        time: 'Late afternoon',
                        condition: 'steady',
                        funds: '120',
                    },
                    options: ['Resume'],
                },
            },
        });
    }

    if (startHub.classList.contains('hidden') || !chatLog.classList.contains('hidden')) {
        fail('incremental gameStateUpdate should not kick Home back to chat');
        return;
    }
    if (context.messageHistory.length !== 1 || context.messageHistory[0].content !== 'Existing session') {
        fail('incremental gameStateUpdate should keep existing session history intact');
        return;
    }

    resumeBtn.click();
    if (!startHub.classList.contains('hidden') || chatLog.classList.contains('hidden')) {
        fail('Resume should return to the exact active session');
        return;
    }
    if (context.messageHistory.length !== 1 || context.messageHistory[0].content !== 'Existing session') {
        fail('Resume should preserve the existing session history');
        return;
    }

    ok('Start Hub stays open across incremental sync and Resume restores the active session');
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createPanel(messageLog) {
    return {
        webview: {
            postMessage(message) {
                messageLog.push(message);
            },
            asWebviewUri(uri) {
                return { toString: () => `webview:${uri.fsPath}` };
            },
        },
    };
}

function clearModuleCache(modulePath) {
    delete require.cache[require.resolve(modulePath)];
}

async function runScenarioBootstrapIntegrationTests() {
    const workspaceRoots = [];
    let currentWorkspace;
    let currentPanel;
    let currentMessages = [];
    let openGameCalls = 0;

    const restore = installVscodeStub({
        workspace: {
            isTrusted: true,
            get workspaceFolders() {
                return currentWorkspace
                    ? [{ name: path.basename(currentWorkspace), uri: { fsPath: currentWorkspace } }]
                    : undefined;
            },
            getConfiguration() {
                return {
                    get(key, fallback) {
                        const values = {
                            locale: 'ja',
                            'bgm.enabled': true,
                            'bgm.manifestPath': '',
                            'bgm.volume': 50,
                            'sfx.enabled': true,
                            'sfx.manifestPath': '',
                            'sfx.volume': 70,
                            enableNpcRegistry: false,
                            enableEmergentSimulation: false,
                        };
                        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : fallback;
                    },
                    async update() {
                        return undefined;
                    },
                };
            },
        },
        window: {
            async showWarningMessage(_message, ...items) {
                return items.find((item) => typeof item === 'string') ?? undefined;
            },
            async showInformationMessage() {
                return undefined;
            },
            showErrorMessage() {},
            createOutputChannel() {
                return { append() {}, appendLine() {}, clear() {}, show() {} };
            },
            setStatusBarMessage() {},
        },
        commands: {
            async executeCommand(command) {
                if (command === 'textadventure.openGame') {
                    openGameCalls++;
                    currentPanel = createPanel(currentMessages);
                }
                return undefined;
            },
        },
        ConfigurationTarget: { Workspace: 1 },
        Uri: { file: (filePath) => ({ fsPath: filePath }) },
    });

    const originalSetTimeout = global.setTimeout;
    global.setTimeout = ((fn) => {
        fn();
        return 0;
    });

    try {
        for (const modulePath of [scenarioPackPath, characterManagerPath, gameStateSyncPath, mediaManifestPath]) {
            clearModuleCache(modulePath);
        }
        const scenarioPack = require(scenarioPackPath);
        const characterManager = require(characterManagerPath);
        const gameStateSync = require(gameStateSyncPath);
        const mediaManifest = require(mediaManifestPath);

        const getPanel = () => currentPanel;
        characterManager.initCharacterManager({ getPanel });
        mediaManifest.initMediaManifest({ getPanel });
        gameStateSync.initGameStateSync({
            getPanel,
            getGameStatePath() {
                return currentWorkspace ? path.join(currentWorkspace, 'game_state.json') : undefined;
            },
            getWorkspacePath() {
                return currentWorkspace;
            },
            getSkillDir() {
                return path.join(root, 'assets');
            },
            getHistoryPath() {
                return currentWorkspace ? path.join(currentWorkspace, 'game_history.json') : undefined;
            },
            processProfileUpdates() {},
            maybeSuggestArchive() {},
            appendGmBridgeLog() {},
        });

        async function loadCase(caseName, options = {}) {
            currentWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), `lr-playtest-unblock-${caseName}-`));
            workspaceRoots.push(currentWorkspace);
            currentPanel = undefined;
            currentMessages = [];
            openGameCalls = 0;

            if (typeof options.prepare === 'function') {
                options.prepare(currentWorkspace);
            }

            const times = options.repeat ?? 1;
            for (let i = 0; i < times; i++) {
                await scenarioPack.loadBundledSampleScenario('scrapbound-settlement');
            }

            const charsDir = path.join(currentWorkspace, 'characters');
            const characterFiles = fs.existsSync(charsDir)
                ? fs.readdirSync(charsDir).filter((name) => name.endsWith('.json') && name !== 'party.json' && name !== 'dynamic_profiles.json' && name !== 'party_director.json')
                : [];
            const characters = characterFiles.map((name) => readJson(path.join(charsDir, name)));
            const activeCharacterPath = path.join(charsDir, 'active_character.txt');
            const partyPath = path.join(charsDir, 'party.json');
            return {
                workspace: currentWorkspace,
                messages: currentMessages.slice(),
                openGameCalls,
                gameState: readJson(path.join(currentWorkspace, 'game_state.json')),
                scenario: readJson(path.join(currentWorkspace, 'scenario.json')),
                characters,
                characterFiles,
                activeCharacterId: fs.existsSync(activeCharacterPath)
                    ? fs.readFileSync(activeCharacterPath, 'utf8').trim()
                    : undefined,
                partyIds: fs.existsSync(partyPath) ? readJson(partyPath) : [],
            };
        }

        const sampleScenario = readJson(scenarioPath);
        const expectedNarrative = sampleScenario.locales.ja.opening.narrative;
        const expectedOptions = sampleScenario.locales.ja.opening.options;
        const expectedStatus = sampleScenario.locales.ja.opening.status;
        const expectedName = sampleScenario.locales.ja.setup.playerCharacter.name;

        const starterCase = await loadCase('starter-default', { repeat: 2 });
        const starter = starterCase.characters.find((character) => character.id === 'scrapbound_runner');
        const characterListMessages = starterCase.messages.filter((message) => message && message.type === 'characterList');
        if (!starter) {
            fail('no existing player: Scrapbound starter should be created');
        } else if (starter.name !== expectedName || starter.controlledBy !== 'player') {
            fail('starter profile should persist Japanese name and player control');
        } else if (starterCase.activeCharacterId !== 'scrapbound_runner') {
            fail('starter bootstrap should activate scrapbound_runner');
        } else if (!starterCase.partyIds.includes('scrapbound_runner')) {
            fail('starter bootstrap should add scrapbound_runner to the party');
        } else if (starterCase.characterFiles.filter((name) => name === 'scrapbound_runner.json').length !== 1) {
            fail('repeated Scrapbound load should not duplicate starter character files');
        } else if (!starterCase.messages.some((message) => message.type === 'gameStateUpdate')) {
            fail('post-openGame sync should still send the refreshed game state');
        } else if (characterListMessages.length === 0 || !characterListMessages.some((message) =>
            Array.isArray(message.characters) && message.characters.some((character) => character.id === 'scrapbound_runner')
        )) {
            fail('post-openGame sync should re-send the active Character List to the opened panel');
        } else if (starterCase.openGameCalls !== 2) {
            fail('repeated Scrapbound load should still go through openGame for panel sync');
        } else if (starterCase.gameState.entries[0].content !== expectedNarrative) {
            fail('workspace game_state.json should persist the Japanese opening narrative');
        } else if (
            starterCase.gameState.status.location !== expectedStatus.location
            || starterCase.gameState.status.time !== expectedStatus.time
            || JSON.stringify(starterCase.gameState.status.condition) !== JSON.stringify([expectedStatus.condition])
            || starterCase.gameState.status.funds !== expectedStatus.funds
        ) {
            fail('workspace game_state.json should persist the Japanese opening status fields');
        } else if (JSON.stringify(starterCase.gameState.options) !== JSON.stringify(expectedOptions)) {
            fail('workspace game_state.json should persist all Japanese opening options');
        } else if (starterCase.scenario.meta.title !== sampleScenario.locales.ja.meta.title) {
            fail('workspace scenario.json should persist the localized Japanese scenario title');
        } else if (Object.prototype.hasOwnProperty.call(starterCase.scenario, 'locales')) {
            fail('workspace scenario.json should be the localized canonical copy without top-level locales');
        } else {
            ok('temp workspace bootstrap persists localized Scrapbound state and re-sends Character List after openGame');
        }

        const unrelatedCase = await loadCase('existing-player', {
            prepare(workspace) {
                writeJson(path.join(workspace, 'characters', 'veteran.json'), {
                    id: 'veteran',
                    name: 'Veteran Mora',
                    description: 'Existing player profile',
                    controlledBy: 'player',
                });
            },
        });
        if (unrelatedCase.characters.some((character) => character.id === 'scrapbound_runner')) {
            fail('valid unrelated player should remain authoritative and block starter creation');
        } else {
            ok('valid unrelated player remains authoritative');
        }

        const matchingCase = await loadCase('matching-starter', {
            prepare(workspace) {
                writeJson(path.join(workspace, 'characters', 'scrapbound_runner.json'), {
                    id: 'scrapbound_runner',
                    name: expectedName,
                    description: 'Existing localized starter',
                    controlledBy: 'player',
                });
            },
        });
        if (matchingCase.characterFiles.filter((name) => name === 'scrapbound_runner.json').length !== 1) {
            fail('matching starter should be reused instead of duplicated');
        } else if (matchingCase.activeCharacterId !== 'scrapbound_runner' || !matchingCase.partyIds.includes('scrapbound_runner')) {
            fail('matching starter should be reused for active character and party');
        } else {
            ok('matching starter is reused without duplication');
        }

        const blankNameCase = await loadCase('blank-name-player', {
            prepare(workspace) {
                writeJson(path.join(workspace, 'characters', 'broken_player.json'), {
                    id: 'broken_player',
                    name: '   ',
                    description: 'Malformed player profile',
                    controlledBy: 'player',
                });
            },
        });
        if (!blankNameCase.characters.some((character) => character.id === 'scrapbound_runner')) {
            fail('whitespace-only-name player should not block deterministic starter creation');
        } else {
            ok('whitespace-only-name player no longer blocks starter creation');
        }
    } finally {
        global.setTimeout = originalSetTimeout;
        restore();
        for (const workspace of workspaceRoots) {
            try {
                fs.rmSync(workspace, { recursive: true, force: true });
            } catch {
                // ignore temp cleanup failures
            }
        }
    }
}

runStartHubBehaviorTest();
Promise.resolve()
    .then(() => runScenarioBootstrapIntegrationTests())
    .then(() => {
        if (failed > 0) {
            process.exit(1);
        }
        console.log('PLAYTEST-UNBLOCK-001 tests passed.');
    })
    .catch((error) => {
        fail(error instanceof Error ? error.stack || error.message : String(error));
        process.exit(1);
    });
