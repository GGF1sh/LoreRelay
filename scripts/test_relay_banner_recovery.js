'use strict';

/**
 * HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001
 *
 * Exercises the real collapse/expand/recovery logic in
 * webview/modules/90-bootstrap.js inside a DOM + localStorage harness
 * (mousedown/mousemove/mouseup, click, dblclick, keyboard activation,
 * getBoundingClientRect, dynamic element insertion/removal, class lists,
 * attributes, localStorage read/write/remove, and viewport height changes).
 * This is source-behavior verification, not text matching.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function createClassList(el) {
    const classes = new Set();
    function sync() { el.className = Array.from(classes).join(' '); }
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

function createHarness(options = {}) {
    const elements = new Map();
    const windowListeners = new Map();

    function register(el) {
        if (el.id) { elements.set(el.id, el); }
        el.children.forEach(register);
    }

    function unregister(el) {
        if (el.id) { elements.delete(el.id); }
        el.children.forEach(unregister);
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
            _rect: { width: 0, height: 0 },
            appendChild(child) {
                child.parentNode = el;
                el.children.push(child);
                register(child);
                return child;
            },
            insertBefore(child, before) {
                child.parentNode = el;
                const idx = el.children.indexOf(before);
                if (idx >= 0) { el.children.splice(idx, 0, child); } else { el.children.unshift(child); }
                register(child);
                return child;
            },
            remove() {
                if (el.parentNode) {
                    el.parentNode.children = el.parentNode.children.filter((child) => child !== el);
                }
                unregister(el);
            },
            setAttribute(name, value) { el.attributes.set(name, String(value)); },
            getAttribute(name) { return el.attributes.has(name) ? el.attributes.get(name) : null; },
            removeAttribute(name) { el.attributes.delete(name); },
            addEventListener(type, handler) {
                if (!el.eventListeners.has(type)) { el.eventListeners.set(type, []); }
                el.eventListeners.get(type).push(handler);
            },
            fire(type, detail) {
                const base = { preventDefault() {}, stopPropagation() {} };
                for (const handler of (el.eventListeners.get(type) || [])) {
                    handler(Object.assign({}, base, detail));
                }
            },
            click() { el.fire('click', {}); },
            dblclick() { el.fire('dblclick', {}); },
            focus() {},
            getBoundingClientRect() { return el._rect; },
            setRect(rect) { el._rect = Object.assign({}, el._rect, rect); },
            querySelector(selector) { return querySelectorAllFrom(el, selector)[0] || null; },
            querySelectorAll(selector) { return querySelectorAllFrom(el, selector); },
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
            set(value) { el._className = String(value || ''); classList.setFromClassName(el._className); },
        });
        Object.defineProperty(el, 'classList', { value: classList });
        Object.defineProperty(el, 'innerHTML', {
            get() { return ''; },
            set() { el.children.forEach(unregister); el.children = []; },
        });
        return el;
    }

    function walk(el, out = []) {
        for (const child of el.children) { out.push(child); walk(child, out); }
        return out;
    }

    function matches(el, selector) {
        if (selector.startsWith('.')) { return el.classList.contains(selector.slice(1)); }
        if (selector.startsWith('[') && selector.endsWith(']')) {
            const attr = selector.slice(1, -1);
            return el.attributes.has(attr);
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
        getElementById(id) { return elements.get(id) || null; },
        querySelectorAll(selector) { return querySelectorAllFrom(body, selector); },
        querySelector(selector) { return document.querySelectorAll(selector)[0] || null; },
        addEventListener() {},
        documentElement: { lang: '' },
    };

    function addRoot(id, tag = 'div') {
        const el = createElement(tag);
        el.id = id;
        body.appendChild(el);
        return el;
    }

    // Minimal chat-area roots referenced elsewhere in 90-bootstrap.js's message
    // handler (guarded null-checks make most of these optional, but a few are
    // dereferenced unconditionally by sibling branches exercised indirectly).
    addRoot('chat-log');
    addRoot('free-input', 'textarea');
    addRoot('send-btn', 'button');
    addRoot('img-btn', 'button');
    addRoot('mic-btn', 'button');
    addRoot('undo-btn', 'button');
    addRoot('regen-btn', 'button');
    addRoot('relay-toggle-btn', 'button');
    addRoot('options-bar');
    // #resizer / #status-area gate the DOMContentLoaded handler that wires the
    // window-level mousemove/mouseup listeners the Relay-banner sash drag
    // depends on (webview/modules/90-bootstrap.js: `if (!resizer || !statusArea) return;`).
    const statusArea = addRoot('status-area');
    addRoot('resizer');

    const storage = new Map(
        options.initialStorage ? Object.entries(options.initialStorage) : []
    );
    const localStorage = {
        getItem(key) { return storage.has(key) ? storage.get(key) : null; },
        setItem(key, value) { storage.set(key, String(value)); },
        removeItem(key) { storage.delete(key); },
    };

    const strings = Object.assign({
        'webview.button.send': 'Send',
        'webview.relay.banner.active': 'Antigravity Relay explanation text',
        'webview.relay.banner.collapse': 'Hide details',
        'webview.relay.banner.expand': 'Show details',
        'webview.relay.banner.resetTitle': 'Double-click to reset banner height',
        'webview.relay.button.prepare': 'Send to Antigravity',
        'webview.relay.state.idle': 'idle',
        'webview.relay.toggle.off': 'Relay OFF',
        'webview.relay.toggle.on': 'Antigravity Relay ON',
        'webview.relay.toggle.title': 'Relay title',
        'webview.sender.gm': 'GM',
        'webview.sender.player': 'Player',
        'webview.sender.system': 'System',
    }, options.stringsOverride || {});

    const window = {
        antigravityRelayMode: false,
        innerHeight: options.innerHeight === undefined ? 900 : options.innerHeight,
        speechSynthesis: { cancel() {} },
        addEventListener(type, handler) {
            if (!windowListeners.has(type)) { windowListeners.set(type, []); }
            windowListeners.get(type).push(handler);
        },
        fire(type, detail) {
            const base = { preventDefault() {}, stopPropagation() {} };
            for (const handler of (windowListeners.get(type) || [])) {
                handler(Object.assign({}, base, detail));
            }
        },
        dispatchMessage(message) { window.fire('message', { data: message }); },
    };

    // i18nStrings starts populated in this harness (most tests target
    // post-locale-load behavior); a dedicated case below constructs its own
    // harness variant with i18nStrings intentionally empty.
    const i18nStrings = options.emptyI18n ? {} : Object.assign({}, strings);

    const context = vm.createContext({
        console,
        document,
        window,
        localStorage,
        navigator: { clipboard: { writeText: async () => {} } },
        vscode: { postMessage() {}, getState() { return null; }, setState() {} },
        setInterval() { return 0; },
        clearInterval() {},
        setTimeout(fn) { fn(); return 0; },
        clearTimeout() {},
        requestAnimationFrame(fn) { fn(); return 0; },
        Date,
        i18nStrings,
        addSystemMessage() {},
        // Defined in 00-core.js (not loaded here -- it also redeclares vscode/T/
        // i18nStrings, which this harness already supplies). Only its no-op
        // effect on data-i18n-attributed elements matters here, which this
        // test's DOM does not use.
        applyI18n() {},
        autoGrowFreeInput() {},
        clearAuthorsNote() {},
        getAuthorsNote() { return ''; },
        isInputLocked() { return false; },
        renderMessage() {},
        saveState() {},
        scrollToBottom() {},
        renderAllMessages() {},
        renderGallery() {},
        renderCheckpointUi() {},
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
        welcomeShown: true,
        gameOverActive: false,
        parlorHasCharacter: false,
        experienceProfile: 'campaign',
        activeCharId: '',
        currentCharacters: [],
        currentPartyIds: [],
        freeInput: elements.get('free-input'),
        sendBtn: elements.get('send-btn'),
        imgBtn: elements.get('img-btn'),
        micBtn: elements.get('mic-btn'),
        undoBtn: elements.get('undo-btn'),
        optionsBar: elements.get('options-bar'),
        chatLog: elements.get('chat-log'),
        ttsEnabled: false,
        ttsSpeed: 1,
        ttsVolume: 0.8,
    });

    // Defined via vm.runInContext (not as a sandbox-object closure) so its
    // `i18nStrings` reference resolves against the vm's own global on every
    // call. A closure captured in the outer Node.js realm would instead keep
    // reading the original `i18nStrings` object forever, even after
    // in-context code reassigns the global (as the real localeBundle handler
    // does) -- vm.createContext contextifies the sandbox object for global
    // property access, but functions authored outside the vm keep their
    // original outer-realm closure scope.
    vm.runInContext(
        'function T(key) { return (typeof i18nStrings !== "undefined" && i18nStrings[key]) || key; }',
        context,
        { filename: 'test-harness-i18n.js' }
    );

    for (const file of [
        'webview/modules/10-game-state.js',
        'webview/modules/20-input-audio-prep.js',
        'webview/modules/90-bootstrap.js',
    ]) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }

    // Fire DOMContentLoaded so the window-level mousemove/mouseup listeners the
    // sash drag depends on get registered (see #resizer / #status-area above).
    window.fire('DOMContentLoaded');

    return { context, elements, body, window, localStorage, statusArea };
}

function setRelayOn(h) {
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
}

function banner(h) {
    return {
        root: h.elements.get('relay-mode-banner'),
        content: h.elements.get('relay-mode-banner-content'),
        header: h.elements.get('relay-banner-header'),
        label: h.elements.get('relay-banner-header-label'),
        toggleBtn: h.elements.get('relay-banner-toggle-btn'),
        sash: h.elements.get('relay-banner-sash'),
    };
}

function isCollapsed(b) {
    return b.content.style.display === 'none';
}

let failed = 0;
function check(name, fn) {
    try { fn(); console.log(`OK: ${name}`); }
    catch (e) { failed++; console.error(`FAIL: ${name}\n${e.stack || e}`); }
}

console.log('--- test_relay_banner_recovery.js ---');

// ---------------------------------------------------------------------
// 1. No stored value -> expanded default
// ---------------------------------------------------------------------
check('no stored value -> expanded default, no blank strip', () => {
    const h = createHarness();
    setRelayOn(h);
    const b = banner(h);
    assert(b.root, 'banner must exist');
    assert(!isCollapsed(b), 'content must be expanded by default');
    assert.strictEqual(b.content.style.height, '', 'natural/default height leaves no inline height');
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(b.toggleBtn.textContent, 'Hide details');
    assert(b.header, 'header row is always present (never a blank region)');
});

// ---------------------------------------------------------------------
// 2. Stored 0 -> compact collapsed strip visible
// ---------------------------------------------------------------------
check('stored 0 -> compact collapsed strip visible', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    const b = banner(h);
    assert(isCollapsed(b), 'content must be collapsed');
    assert.strictEqual(b.label.textContent, 'Antigravity Relay ON', 'collapsed strip shows the active label');
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'false');
    assert.strictEqual(b.toggleBtn.textContent, 'Show details', 'collapsed strip shows an explicit expand control');
    assert(b.header, 'header row remains visible while collapsed (no blank region)');
});

// ---------------------------------------------------------------------
// 3. Legacy 1 and 19 -> collapsed migration
// ---------------------------------------------------------------------
check('legacy stored 1 migrates to collapsed', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '1' } });
    setRelayOn(h);
    assert(isCollapsed(banner(h)), 'legacy value 1 must migrate to the explicit collapsed strip');
});
check('legacy stored 19 migrates to collapsed', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '19' } });
    setRelayOn(h);
    assert(isCollapsed(banner(h)), 'legacy value 19 must migrate to the explicit collapsed strip');
});

// ---------------------------------------------------------------------
// 4. Malformed / whitespace / negative / NaN / Infinity -> safe expanded reset
// ---------------------------------------------------------------------
for (const bad of ['not-a-number', '   ', '-5', 'NaN', 'Infinity', '-Infinity']) {
    check(`invalid stored value ${JSON.stringify(bad)} -> safe expanded reset`, () => {
        const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': bad } });
        setRelayOn(h);
        const b = banner(h);
        assert(!isCollapsed(b), `invalid value ${bad} must not collapse or blank the banner`);
        assert.strictEqual(b.content.style.height, '', 'invalid value resets to natural default height, not 0px/NaNpx/Infinitypx');
    });
}

// ---------------------------------------------------------------------
// 5. Huge finite value -> safe maximum clamp
// ---------------------------------------------------------------------
check('huge finite stored value clamps to the safe viewport maximum', () => {
    const h = createHarness({ innerHeight: 800, initialStorage: { 'lorerelay.relayBannerHeight': '999999' } });
    setRelayOn(h);
    const b = banner(h);
    assert(!isCollapsed(b));
    const px = parseFloat(b.content.style.height);
    assert(Number.isFinite(px) && px > 0, 'clamped height must be finite and positive');
    assert(px <= 800 * 0.5 + 0.001, `clamped height (${px}) must not exceed the safe viewport maximum`);
});

// ---------------------------------------------------------------------
// 6. Drag expanded banner below threshold -> explicit collapsed state
// ---------------------------------------------------------------------
check('dragging below the threshold collapses to the explicit strip', () => {
    const h = createHarness();
    setRelayOn(h);
    const b = banner(h);
    b.content.setRect({ height: 120 });
    b.sash.fire('mousedown', { clientY: 500 });
    h.window.fire('mousemove', { clientY: 400 }); // 500 -> 400 => height 120 - 100 = 20 (>= threshold, still expanded)
    assert(!isCollapsed(banner(h)), 'sanity: 20px stays at the expanded boundary');
    h.window.fire('mousemove', { clientY: 395 }); // height drops to 15 -> below threshold
    assert(isCollapsed(banner(h)), 'dragging below the threshold must collapse immediately, not leave a sliver');
    h.window.fire('mouseup', {});
    assert.strictEqual(h.localStorage.getItem('lorerelay.relayBannerHeight'), '0', 'collapse from drag persists as 0');
});

// ---------------------------------------------------------------------
// 7. Collapsed state persists through banner recreation (Relay OFF/ON)
// ---------------------------------------------------------------------
check('collapsed state persists through Relay OFF -> ON (banner recreation)', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    assert(isCollapsed(banner(h)));
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: false });
    assert.strictEqual(h.elements.get('relay-mode-banner'), undefined, 'Relay OFF removes the banner entirely, no residual space');
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
    assert(isCollapsed(banner(h)), 'Relay ON recreates the banner honoring the persisted collapsed state');
});

// ---------------------------------------------------------------------
// 8 / 11. Explicit control click expands + aria-expanded updates
// ---------------------------------------------------------------------
check('explicit control click expands a collapsed banner and flips aria-expanded', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    let b = banner(h);
    assert(isCollapsed(b));
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'false');
    b.toggleBtn.click();
    b = banner(h);
    assert(!isCollapsed(b), 'click on the explicit control must expand the banner');
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'true');
    assert.strictEqual(b.toggleBtn.textContent, 'Hide details');
});

check('explicit control click also collapses an expanded banner (symmetric toggle)', () => {
    const h = createHarness();
    setRelayOn(h);
    let b = banner(h);
    assert(!isCollapsed(b));
    b.toggleBtn.click();
    b = banner(h);
    assert(isCollapsed(b), 'the same control collapses when already expanded');
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'false');
});

// ---------------------------------------------------------------------
// 9. Enter expands
// ---------------------------------------------------------------------
check('Enter key on the explicit control expands a collapsed banner', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    let b = banner(h);
    assert(isCollapsed(b));
    b.toggleBtn.fire('keydown', { key: 'Enter' });
    b = banner(h);
    assert(!isCollapsed(b), 'Enter must activate the control like a native button');
});

// ---------------------------------------------------------------------
// 10. Space expands
// ---------------------------------------------------------------------
check('Space key on the explicit control expands a collapsed banner', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    let b = banner(h);
    assert(isCollapsed(b));
    b.toggleBtn.fire('keydown', { key: ' ' });
    b = banner(h);
    assert(!isCollapsed(b), 'Space must activate the control like a native button');
});

// ---------------------------------------------------------------------
// 12. Sash double-click resets to expanded default
// ---------------------------------------------------------------------
check('sash double-click resets to the expanded default and clears storage', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    let b = banner(h);
    assert(isCollapsed(b));
    b.sash.dblclick();
    b = banner(h);
    assert(!isCollapsed(b), 'double-click must restore the expanded default');
    assert.strictEqual(b.content.style.height, '', 'reset uses the natural default height');
    assert.strictEqual(h.localStorage.getItem('lorerelay.relayBannerHeight'), null, 'reset clears the persisted preference');
    assert.strictEqual(b.toggleBtn.getAttribute('aria-expanded'), 'true', 'the explicit control reflects the reset state');
});

// ---------------------------------------------------------------------
// 13. Relay OFF removes all banner space
// ---------------------------------------------------------------------
check('Relay OFF removes the banner with no residual vertical space', () => {
    const h = createHarness();
    setRelayOn(h);
    assert(banner(h).root, 'banner exists while Relay is on');
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: false });
    assert.strictEqual(h.elements.get('relay-mode-banner'), undefined);
    assert.strictEqual(h.elements.get('relay-banner-header'), undefined);
    assert.strictEqual(h.elements.get('relay-mode-banner-content'), undefined);
    assert(!h.body.classList.contains('relay-mode-active'));
});

// ---------------------------------------------------------------------
// 14 / 15. Relay ON restores persisted collapsed / expanded state
// ---------------------------------------------------------------------
check('Relay ON restores a persisted collapsed state', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    assert(isCollapsed(banner(h)));
});

check('expanded persistence survives Relay OFF/ON', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '150' } });
    setRelayOn(h);
    assert(!isCollapsed(banner(h)));
    assert.strictEqual(banner(h).content.style.height, '150px');
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: false });
    h.window.dispatchMessage({ type: 'relayModeStatus', antigravityRelayMode: true });
    assert(!isCollapsed(banner(h)), 'expanded state must survive an OFF/ON cycle');
    assert.strictEqual(banner(h).content.style.height, '150px');
});

// ---------------------------------------------------------------------
// 16 / 17. Locale switch updates labels; locale arrival after creation
//           leaves no raw keys.
// ---------------------------------------------------------------------
check('locale switch mid-session updates collapsed and expanded labels', () => {
    const h = createHarness({ initialStorage: { 'lorerelay.relayBannerHeight': '0' } });
    setRelayOn(h);
    let b = banner(h);
    assert.strictEqual(b.label.textContent, 'Antigravity Relay ON');
    assert.strictEqual(b.toggleBtn.textContent, 'Show details');
    h.window.dispatchMessage({
        type: 'localeBundle',
        locale: 'ja',
        strings: Object.assign({}, h.context.i18nStrings, {
            'webview.relay.toggle.on': 'Antigravity Relay 起動中',
            'webview.relay.banner.expand': '詳細を表示',
            'webview.relay.banner.collapse': '詳細を隠す',
        }),
    });
    b = banner(h);
    assert.strictEqual(b.label.textContent, 'Antigravity Relay 起動中', 'locale switch must refresh the collapsed active label');
    assert.strictEqual(b.toggleBtn.textContent, '詳細を表示', 'locale switch must refresh the collapsed control label');
});

check('locale arriving after banner creation leaves no raw i18n keys', () => {
    const h = createHarness({ emptyI18n: true });
    setRelayOn(h);
    let b = banner(h);
    assert(!/^webview\./.test(b.label.textContent), `label must not show a raw i18n key, got: ${b.label.textContent}`);
    assert(!/^webview\./.test(b.toggleBtn.textContent), `control must not show a raw i18n key, got: ${b.toggleBtn.textContent}`);
    assert.notStrictEqual(b.label.textContent, '', 'control must not be blank before locale arrives');
    h.window.dispatchMessage({
        type: 'localeBundle',
        locale: 'en',
        strings: {
            'webview.relay.toggle.on': 'Antigravity Relay ON',
            'webview.relay.banner.expand': 'Show details',
            'webview.relay.banner.collapse': 'Hide details',
            'webview.relay.banner.resetTitle': 'Double-click to reset banner height',
            'webview.relay.button.prepare': 'Send to Antigravity',
            'webview.button.send': 'Send',
        },
    });
    b = banner(h);
    assert.strictEqual(b.label.textContent, 'Antigravity Relay ON', 'label must adopt the real string once locale arrives');
    assert.strictEqual(b.toggleBtn.textContent, 'Hide details');
});

// ---------------------------------------------------------------------
// 18. Very short viewport produces finite safe dimensions
// ---------------------------------------------------------------------
check('very short viewport produces finite, non-inverted safe dimensions', () => {
    const h = createHarness({ innerHeight: 10, initialStorage: { 'lorerelay.relayBannerHeight': '999999' } });
    setRelayOn(h);
    const b = banner(h);
    assert(!isCollapsed(b));
    const px = parseFloat(b.content.style.height);
    assert(Number.isFinite(px) && px > 0, `height must be finite and positive even at a 10px viewport, got ${b.content.style.height}`);
});

// ---------------------------------------------------------------------
// 19. Collapse/expand does not change pending/input-lock state
// ---------------------------------------------------------------------
check('toggling the banner does not touch input lock or send-btn text', () => {
    const h = createHarness();
    setRelayOn(h);
    const sendBtn = h.elements.get('send-btn');
    const freeInput = h.elements.get('free-input');
    const sendTextBefore = sendBtn.textContent;
    const sendDisabledBefore = sendBtn.disabled;
    const inputDisabledBefore = freeInput.disabled;
    banner(h).toggleBtn.click();
    banner(h).toggleBtn.click();
    assert.strictEqual(sendBtn.textContent, sendTextBefore, 'Send button text must be unaffected by banner collapse/expand');
    assert.strictEqual(sendBtn.disabled, sendDisabledBefore);
    assert.strictEqual(freeInput.disabled, inputDisabledBefore);
});

// ---------------------------------------------------------------------
// 20. Source module and generated bundle remain equivalent
// ---------------------------------------------------------------------
check('module and bundle stay equivalent after EOL normalization', () => {
    const bundlePath = path.join(root, 'webview', 'script.js');
    assert(fs.existsSync(bundlePath), 'webview/script.js missing -- run "npm run build:webview" first');
    const cleanStr = (str) => str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const moduleSrc = cleanStr(fs.readFileSync(path.join(root, 'webview', 'modules', '90-bootstrap.js'), 'utf8')).trimEnd();
    const bundleSrc = cleanStr(fs.readFileSync(bundlePath, 'utf8'));
    assert(bundleSrc.includes(moduleSrc), 'bundle must contain the complete normalized contents of 90-bootstrap.js');
});

// ---------------------------------------------------------------------
// Extra: direct pure-function coverage for the normalization table (defense
// in depth beyond the DOM-level assertions above).
// ---------------------------------------------------------------------
check('normalizeRelayBannerHeight direct coverage of the required table', () => {
    const h = createHarness({ innerHeight: 800 });
    const fn = h.context.normalizeRelayBannerHeight;
    // vm.createContext runs fn's object literals in a separate realm, so
    // assert.deepStrictEqual's prototype check fails even on structurally
    // identical plain objects; compare fields directly instead.
    const expect = (raw, max, wantCollapsed, wantHeight, label) => {
        const result = fn(raw, max);
        assert.strictEqual(result.collapsed, wantCollapsed, `${label}: collapsed`);
        assert.strictEqual(result.height, wantHeight, `${label}: height`);
    };
    expect(null, 400, false, null, 'absent (null)');
    expect(undefined, 400, false, null, 'absent (undefined)');
    expect('', 400, false, null, 'empty string');
    expect('   ', 400, false, null, 'whitespace');
    expect('0', 400, true, 0, 'stored 0');
    expect('1', 400, true, 0, 'legacy 1');
    expect('19', 400, true, 0, 'legacy 19');
    expect('20', 400, false, 20, 'boundary 20');
    expect('150', 400, false, 150, 'valid 150');
    expect('99999', 400, false, 400, 'huge finite clamps to max');
    expect('NaN', 400, false, null, 'NaN literal');
    expect('Infinity', 400, false, null, 'Infinity literal');
    expect('-Infinity', 400, false, null, 'negative Infinity literal');
    expect('-5', 400, false, null, 'negative');
    expect('abc', 400, false, null, 'malformed text');
});

if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
}
console.log('\nRelay banner collapse recovery tests passed.');
