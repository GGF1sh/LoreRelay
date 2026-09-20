const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const relayTrigger = '/text-adventure-gm process pending LoreRelay request';

function createClassList(el) {
    const classes = new Set();
    function sync() {
        el.className = Array.from(classes).join(' ');
    }
    return {
        add(...names) { names.forEach((name) => classes.add(name)); sync(); },
        remove(...names) { names.forEach((name) => classes.delete(name)); sync(); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
            const next = force === undefined ? !classes.has(name) : !!force;
            if (next) { classes.add(name); } else { classes.delete(name); }
            sync();
            return next;
        },
        setFromClassName(value) {
            classes.clear();
            String(value || '').split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
        },
    };
}

function createHarness() {
    const elements = new Map();
    const listeners = new Map();
    const systemMessages = [];
    const postMessages = [];
    const clipboardWrites = [];
    const clearedTimers = [];
    let timerId = 0;

    function register(el) {
        if (el.id) {
            elements.set(el.id, el);
        }
        el.children.forEach(register);
    }

    function createElement(tag) {
        const el = {
            tagName: String(tag).toUpperCase(),
            children: [],
            parentNode: null,
            style: {},
            dataset: {},
            attributes: new Map(),
            eventListeners: new Map(),
            disabled: false,
            value: '',
            textContent: '',
            type: '',
            _id: '',
            _className: '',
            appendChild(child) {
                child.parentNode = el;
                el.children.push(child);
                register(child);
                return child;
            },
            insertBefore(child, before) {
                child.parentNode = el;
                const idx = el.children.indexOf(before);
                if (idx >= 0) {
                    el.children.splice(idx, 0, child);
                } else {
                    el.children.unshift(child);
                }
                register(child);
                return child;
            },
            remove() {
                if (el.parentNode) {
                    el.parentNode.children = el.parentNode.children.filter((child) => child !== el);
                }
                if (el.id) {
                    elements.delete(el.id);
                }
            },
            setAttribute(name, value) {
                el.attributes.set(name, String(value));
            },
            getAttribute(name) {
                return el.attributes.get(name);
            },
            addEventListener(type, handler) {
                if (!el.eventListeners.has(type)) {
                    el.eventListeners.set(type, []);
                }
                el.eventListeners.get(type).push(handler);
            },
            click() {
                for (const handler of el.eventListeners.get('click') || []) {
                    handler({ preventDefault() {} });
                }
            },
            focus() {},
            querySelector(selector) {
                return querySelectorAllFrom(el, selector)[0] || null;
            },
            querySelectorAll(selector) {
                return querySelectorAllFrom(el, selector);
            },
        };
        Object.defineProperty(el, 'id', {
            get() { return el._id; },
            set(value) {
                if (el._id) { elements.delete(el._id); }
                el._id = String(value || '');
                if (el._id) { elements.set(el._id, el); }
            },
        });
        const classList = createClassList(el);
        Object.defineProperty(el, 'className', {
            get() { return el._className; },
            set(value) {
                el._className = String(value || '');
                classList.setFromClassName(el._className);
            },
        });
        Object.defineProperty(el, 'classList', { value: classList });
        Object.defineProperty(el, 'innerHTML', {
            get() { return ''; },
            set() { el.children = []; },
        });
        return el;
    }

    function walk(el, out = []) {
        for (const child of el.children) {
            out.push(child);
            walk(child, out);
        }
        return out;
    }

    function matches(el, selector) {
        if (selector.startsWith('.')) {
            return el.classList.contains(selector.slice(1));
        }
        if (selector === '[data-relay-status]') {
            return el.attributes.has('data-relay-status');
        }
        return false;
    }

    function querySelectorAllFrom(rootEl, selector) {
        return walk(rootEl).filter((el) => matches(el, selector));
    }

    const body = createElement('body');
    const document = {
        body,
        createElement,
        getElementById(id) {
            return elements.get(id) || null;
        },
        querySelectorAll(selector) {
            return querySelectorAllFrom(body, selector);
        },
        querySelector(selector) {
            return document.querySelectorAll(selector)[0] || null;
        },
        addEventListener() {},
    };

    function addRoot(id, tag = 'div') {
        const el = createElement(tag);
        el.id = id;
        body.appendChild(el);
        return el;
    }

    const chatLog = addRoot('chat-log');
    addRoot('free-input', 'textarea');
    addRoot('send-btn', 'button');
    addRoot('img-btn', 'button');
    addRoot('mic-btn', 'button');
    addRoot('undo-btn', 'button');
    addRoot('regen-btn', 'button');
    addRoot('options-bar');
    addRoot('relay-toggle-btn', 'button');
    addRoot('qr-undo', 'button');
    addRoot('qr-retry', 'button');
    addRoot('experience-profile-btn', 'button');
    addRoot('parlor-settings-btn', 'button');

    const strings = {
        'webview.button.send': 'Send',
        'webview.gm.failed': 'GM failed',
        'webview.gm.loading': 'GM is processing...',
        'webview.input.placeholder': 'Input',
        'webview.relay.banner.active': `Antigravity Relay\nSend ${relayTrigger}\nNo automatic chat injection is used.`,
        'webview.relay.button.prepare': 'Send to Antigravity',
        'webview.relay.copyTrigger': 'Copy trigger command',
        'webview.relay.copyTriggerCopied': 'Copied',
        'webview.relay.error.prefix': 'Antigravity Relay could not import the result.',
        'webview.relay.sender.name': 'Relay Mode',
        'webview.relay.state.error': 'Relay error - retry is available',
        'webview.relay.state.idle': 'Ready to send a LoreRelay action to Antigravity',
        'webview.relay.state.pending': 'Prepared - waiting for right-side processing',
        'webview.relay.toggle.off': 'Relay OFF',
        'webview.relay.toggle.on': 'Antigravity Relay ON',
        'webview.relay.toggle.title': 'Relay title',
        'webview.relay.waiting.label': `On the right, send the next command. Do not copy the long prompt.`,
        'webview.sender.gm': 'GM',
        'webview.sender.player': 'Player',
        'webview.sender.system': 'System',
    };

    const window = {
        antigravityRelayMode: false,
        speechSynthesis: { cancel() {} },
        addEventListener(type, handler) {
            if (!listeners.has(type)) {
                listeners.set(type, []);
            }
            listeners.get(type).push(handler);
        },
        dispatchMessage(message) {
            for (const handler of listeners.get('message') || []) {
                handler({ data: message });
            }
        },
    };

    const context = vm.createContext({
        console,
        document,
        window,
        navigator: {
            clipboard: {
                writeText: async (text) => {
                    clipboardWrites.push(text);
                },
            },
        },
        vscode: {
            postMessage(message) { postMessages.push(message); },
            getState() { return null; },
            setState() {},
        },
        localStorage: { getItem() { return null; }, setItem() {} },
        setInterval(fn) {
            timerId += 1;
            return timerId;
        },
        clearInterval(id) { clearedTimers.push(id); },
        setTimeout(fn) { fn(); return 0; },
        clearTimeout() {},
        requestAnimationFrame(fn) { fn(); return 0; },
        Date,
        T(key) { return strings[key] || key; },
        addSystemMessage(message) { systemMessages.push(message); },
        autoGrowFreeInput() {},
        clearAuthorsNote() {},
        getAuthorsNote() { return ''; },
        isInputLocked() { return false; },
        renderMessage() {},
        saveState() {},
        scrollToBottom() {},
        renderAllMessages() {},
        renderGallery() {},
        setTheme() {},
        updateStartHubVisibility() {},
        setBgmManifest() {},
        setSfxManifest() {},
        playBgmById() {},
        playBgmByMood() {},
        localeSelect() { return null; },
        currentLocale: 'en',
        currentTheme: 'fantasy',
        messageHistory: [],
        galleryImages: [],
        checkpointMetas: [],
        rewindTargets: [],
        seenHiddenDiceIds: new Set(),
        freeInput: elements.get('free-input'),
        sendBtn: elements.get('send-btn'),
        imgBtn: elements.get('img-btn'),
        micBtn: elements.get('mic-btn'),
        undoBtn: elements.get('undo-btn'),
        optionsBar: elements.get('options-bar'),
        chatLog,
        welcomeShown: false,
        gameOverActive: false,
        ttsEnabled: false,
        ttsSpeed: 1,
        ttsVolume: 0.8,
        parlorHasCharacter: false,
        experienceProfile: 'campaign',
        activeCharId: '',
        currentCharacters: [],
        currentPartyIds: [],
    });

    for (const file of [
        'webview/modules/10-game-state.js',
        'webview/modules/20-input-audio-prep.js',
        'webview/modules/90-bootstrap.js',
    ]) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    context.addSystemMessage = (message) => { systemMessages.push(message); };
    context.renderMessage = () => {};

    return {
        context,
        elements,
        body,
        chatLog,
        window,
        postMessages,
        systemMessages,
        clipboardWrites,
        clearedTimers,
    };
}

function findByClass(rootEl, className) {
    const out = [];
    (function walk(el) {
        for (const child of el.children) {
            if (child.classList.contains(className)) {
                out.push(child);
            }
            walk(child);
        }
    })(rootEl);
    return out;
}

function collectText(el) {
    let text = el.textContent || '';
    for (const child of el.children || []) {
        text += collectText(child);
    }
    return text;
}

async function run() {
    console.log('--- test_antigravity_relay_webview.js ---');

    {
        const h = createHarness();
        h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
        h.elements.get('free-input').value = 'Open the bronze gate.';
        h.context.sendFreeInput();
        assert(h.postMessages.some((msg) => msg.type === 'freeInput' && msg.text === 'Open the bronze gate.'));
        let loading = h.elements.get('gm-loading');
        assert(loading, 'free-text Relay action starts optimistic generic loading');
        assert(!loading.classList.contains('relay-waiting'), 'optimistic row starts as generic loading');
        h.window.dispatchMessage({ type: 'relayWaitingStateStart' });
        loading = h.elements.get('gm-loading');
        assert(loading.classList.contains('relay-waiting'), 'Relay waiting converts existing generic gm-loading row');
        assert.strictEqual(findByClass(h.chatLog, 'relay-waiting').length, 1, 'Relay waiting does not duplicate the loading row');
        assert.strictEqual(h.elements.get('send-btn').textContent, 'Prepared - waiting for right-side processing');
        assert.strictEqual(h.body.getAttribute('data-relay-state'), 'pending');
        assert.strictEqual(h.elements.get('free-input').disabled, true);
        assert.strictEqual(h.elements.get('send-btn').disabled, true);
        assert(h.clearedTimers.length > 0, 'Relay conversion stops the generic elapsed timer');
        assert(findByClass(loading, 'gm-loading-elapsed').length === 0, 'Relay waiting row does not leave generic elapsed text behind');
        assert(loading.textContent !== 'GM is processing...', 'generic GM loading label is replaced');
        assert(findByClass(loading, 'relay-trigger-copy-btn').length === 1, 'pending UI exposes one trigger copy button');
        assert(loading.children.some((child) => child.textContent === 'Relay Mode'), 'Relay waiting sender is visible');
        assert(collectText(loading).includes(relayTrigger), 'pending UI shows the exact short trigger');
        findByClass(loading, 'relay-trigger-copy-btn')[0].click();
        await Promise.resolve();
        assert.deepStrictEqual(h.clipboardWrites, [relayTrigger], 'copy action copies only the short trigger');
        h.window.dispatchMessage({ type: 'relayWaitingStateDone', requestId: 'agr-ok' });
        assert.strictEqual(h.elements.get('gm-loading'), undefined, 'successful matching import clears waiting row');
        assert.strictEqual(h.elements.get('free-input').disabled, false, 'successful import unlocks input');
        assert.strictEqual(h.elements.get('send-btn').disabled, false, 'successful import unlocks send');
        assert.strictEqual(h.body.getAttribute('data-relay-state'), 'idle', 'accepted Relay result returns UI to idle');
        assert.strictEqual(h.elements.get('send-btn').textContent, 'Send to Antigravity');
        assert.strictEqual(h.systemMessages.length, 0, 'successful completion does not create duplicate system messages');
    }

    {
        const h = createHarness();
        h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
        h.context.showRelayWaitingState();
        h.window.dispatchMessage({ type: 'relayWaitingStateError', reason: 'requestId mismatch' });
        assert.strictEqual(h.elements.get('gm-loading'), undefined, 'failure clears Relay waiting row');
        assert.strictEqual(h.elements.get('free-input').disabled, false, 'failure unlocks input for recovery');
        assert.strictEqual(h.body.getAttribute('data-relay-state'), 'error', 'failure leaves visible retry-capable error state');
        assert.strictEqual(h.elements.get('send-btn').textContent, 'Relay error - retry is available');
        assert.strictEqual(h.systemMessages.length, 1, 'failure shows one Relay error message');
        assert(!h.systemMessages[0].includes('GM failed'), 'failure does not add a duplicate generic GM failure line');
    }

    {
        const h = createHarness();
        h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: false });
        h.elements.get('free-input').value = 'Normal action.';
        h.context.sendFreeInput();
        assert(h.postMessages.some((msg) => msg.type === 'freeInput' && msg.text === 'Normal action.'));
        const loading = h.elements.get('gm-loading');
        assert(loading && !loading.classList.contains('relay-waiting'), 'Relay OFF keeps ordinary GM loading behavior');
        assert.strictEqual(h.elements.get('send-btn').textContent, 'Send');
    }

    {
        const h = createHarness();
        h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
        h.context.renderOptions(['Wait', 'Follow the lantern']);
        const option = findByClass(h.elements.get('options-bar'), 'option-btn')[1];
        option.click();
        assert(h.postMessages.some((msg) => msg.type === 'selectOption'
            && msg.text === 'Follow the lantern'
            && msg.optionIndex === 1), 'quick option sends canonical text plus explicit presentation metadata');
        assert.strictEqual(option.textContent, '2. Follow the lantern', 'quick option keeps visible numbering');
        const acceptedCount = h.postMessages.length;
        option.click();
        h.elements.get('free-input').value = 'Racing input';
        h.context.sendFreeInput();
        assert.strictEqual(h.postMessages.length, acceptedCount, 'double-click and free-input race are blocked while pending');
        h.context.renderOptions(['Wait', 'Follow the lantern']);
        assert.strictEqual(findByClass(h.elements.get('options-bar'), 'option-btn').length, 0, 'state refresh cannot re-enable options while pending');
        h.window.dispatchMessage({ type: 'relayWaitingStateStart' });
        assert.strictEqual(h.body.getAttribute('data-relay-state'), 'pending', 'Relay option action enters pending state');
    }

    {
        const locale = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));
        const relayText = Object.entries(locale)
            .filter(([key]) => key.startsWith('webview.relay.'))
            .map(([, value]) => String(value))
            .join('\n');
        assert(relayText.includes(relayTrigger), 'locale text includes exact short trigger');
        assert(relayText.includes('No automatic chat injection is used'), 'locale text explicitly denies automatic chat injection');
        assert(!/automatically sends|auto-submit|auto submit/i.test(relayText), 'Relay UI never claims automatic right-side chat submission');
    }

    console.log('ok - Antigravity Relay webview completion-state UX');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
