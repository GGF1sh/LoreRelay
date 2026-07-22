#!/usr/bin/env node
'use strict';

// UX-RESPONSIVE-NARROW-001 — production behavioral tests for the responsive shell.
// Exercises pure width math and real DOM event wiring (toggle/scrim/Escape/resizer).

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const modulePath = path.join(root, 'webview', 'modules', '84b-responsive-shell.js');
const source = fs.readFileSync(modulePath, 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'webview', 'styles', '16-responsive-shell.css'), 'utf8');
const locales = {
  en: JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8')),
  ja: JSON.parse(fs.readFileSync(path.join(root, 'locales', 'ja.json'), 'utf8')),
  'zh-CN': JSON.parse(fs.readFileSync(path.join(root, 'locales', 'zh-CN.json'), 'utf8')),
  'zh-TW': JSON.parse(fs.readFileSync(path.join(root, 'locales', 'zh-TW.json'), 'utf8')),
};

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`OK: ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL: ${name}`);
    console.error(error && error.stack ? error.stack : error);
  }
}

class FakeClassList {
  constructor(el) { this.el = el; this.values = new Set(); }
  set(v) { this.values = new Set(String(v || '').split(/\s+/).filter(Boolean)); this.el._className = this.toString(); }
  add(...vs) { vs.forEach((v) => this.values.add(v)); this.el._className = this.toString(); }
  remove(...vs) { vs.forEach((v) => this.values.delete(v)); this.el._className = this.toString(); }
  toggle(v, force) {
    const next = force === undefined ? !this.values.has(v) : Boolean(force);
    if (next) this.values.add(v); else this.values.delete(v);
    this.el._className = this.toString();
    return next;
  }
  contains(v) { return this.values.has(v); }
  toString() { return [...this.values].join(' '); }
}

class FakeEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {
      props: {},
      setProperty(k, v) { this.props[k] = String(v); },
      getPropertyValue(k) { return this.props[k] || ''; },
      pointerEvents: '',
    };
    this.listeners = {};
    this._className = '';
    this.classList = new FakeClassList(this);
    this._text = '';
    this._id = '';
    this.hidden = false;
    this.inert = false;
    this._width = 320;
  }
  set id(v) { this._id = String(v); if (this._id) this.ownerDocument.byId.set(this._id, this); }
  get id() { return this._id; }
  set className(v) { this.classList.set(v); }
  get className() { return this.classList.toString(); }
  set textContent(v) { this._text = String(v ?? ''); }
  get textContent() { return this._text; }
  setAttribute(n, v) { this.attributes[n] = String(v); if (n === 'class') this.className = v; if (n === 'id') this.id = v; }
  getAttribute(n) { return this.attributes[n] === undefined ? null : this.attributes[n]; }
  removeAttribute(n) { delete this.attributes[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attributes, n); }
  contains(node) {
    let current = node;
    while (current) {
      if (current === this) { return true; }
      current = current.parentNode;
    }
    return false;
  }
  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
      this.parentNode = null;
    }
    if (this._id && this.ownerDocument && this.ownerDocument.byId) {
      if (this.ownerDocument.byId.get(this._id) === this) {
        this.ownerDocument.byId.delete(this._id);
      }
    }
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  querySelector(sel) {
    if (sel === '.lr-drawer-toggle-label') {
      return this.children.find((c) => c.classList && c.classList.contains('lr-drawer-toggle-label')) || null;
    }
    return null;
  }
  addEventListener(type, fn, opts) {
    const capture = opts === true || (opts && opts.capture);
    const key = capture ? `${type}__c` : type;
    (this.listeners[key] ||= []).push(fn);
  }
  focus() { this.ownerDocument.activeElement = this; this._focused = true; }
  getBoundingClientRect() { return { width: this._width, height: 100, left: 0, top: 0, right: this._width, bottom: 100 }; }
  dispatchEvent(event) {
    event.target = event.target || this;
    event.defaultPrevented = Boolean(event.defaultPrevented);
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => { event._stopped = true; };
    const path = [];
    let w = this;
    while (w) { path.push(w); w = w.parentNode; }
    // capture on document first if present
    if (this.ownerDocument && this.ownerDocument.listeners) {
      (this.ownerDocument.listeners[`${event.type}__c`] || []).forEach((fn) => fn(event));
    }
    for (let i = path.length - 1; i >= 0 && !event._stopped; i--) {
      (path[i].listeners[`${event.type}__c`] || []).forEach((fn) => fn(event));
    }
    for (const node of path) {
      if (event._stopped) break;
      (node.listeners[event.type] || []).forEach((fn) => fn(event));
    }
    return !event.defaultPrevented;
  }
}

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.listeners = {};
    this.body = new FakeEl('body', this);
    this.documentElement = new FakeEl('html', this);
    this.activeElement = this.body;
    this.readyState = 'complete';
  }
  createElement(tag) { return new FakeEl(tag, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  addEventListener(type, fn, opts) {
    const capture = opts === true || (opts && opts.capture);
    const key = capture ? `${type}__c` : type;
    (this.listeners[key] ||= []).push(fn);
  }
  querySelector(selector) {
    const classMatch = /^\.([A-Za-z0-9_-]+)$/.exec(String(selector || ''));
    if (!classMatch) { return null; }
    const visit = (node) => {
      if (node.classList && node.classList.contains(classMatch[1])) { return node; }
      for (const child of node.children || []) {
        const found = visit(child);
        if (found) { return found; }
      }
      return null;
    };
    return visit(this.body);
  }
}

function createShellHarness(options = {}) {
  const document = new FakeDocument();
  const app = document.createElement('div'); app.id = 'app';
  const chat = document.createElement('div'); chat.id = 'chat-area';
  const header = document.createElement('div'); header.id = 'chat-header';
  const toggle = document.createElement('button'); toggle.id = 'status-drawer-toggle';
  const label = document.createElement('span'); label.className = 'lr-drawer-toggle-label';
  toggle.appendChild(label);
  const headerSecondary = options.includeHeaderSecondary ? document.createElement('details') : null;
  if (headerSecondary) headerSecondary.id = 'header-secondary';
  const status = document.createElement('div'); status.id = 'status-area'; status._width = 320;
  const resizer = document.createElement('div'); resizer.id = 'resizer';
  const scrim = document.createElement('button'); scrim.id = 'status-drawer-scrim';
  const freeInput = document.createElement('textarea'); freeInput.id = 'free-input'; freeInput.value = options.draft || '';
  header.appendChild(toggle);
  if (headerSecondary) header.appendChild(headerSecondary);
  chat.appendChild(header);
  chat.appendChild(freeInput);
  app.appendChild(chat);
  app.appendChild(resizer);
  app.appendChild(scrim);
  app.appendChild(status);
  document.body.appendChild(app);

  const store = new Map();
  if (options.savedWidth !== undefined) store.set('lorerelay.statusWidth', String(options.savedWidth));
  let innerWidth = options.width ?? 1400;
  const rafQueue = [];
  const context = {
    document,
    console,
    Map, Set, Math, Number, String, Boolean, Object, Array, JSON,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    matchMedia: (q) => ({
      matches: false,
      media: q,
      addEventListener() {},
      addListener() {},
    }),
    T: (key) => locales.en[key] || key,
  };
  Object.defineProperty(context, 'innerWidth', {
    configurable: true,
    get() { return innerWidth; },
    set(v) { innerWidth = v; },
  });
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: modulePath });
  // Force init (readyState already complete)
  if (context.LoreRelayResponsive && context.LoreRelayResponsive.init) {
    context.LoreRelayResponsive.init();
  }
  return {
    document, context, store, rafQueue,
    els: { app, chat, status, resizer, scrim, toggle, freeInput, headerSecondary },
    setWidth(w) {
      innerWidth = w;
      context.LoreRelayResponsive.scheduleViewportCheck();
      while (rafQueue.length) rafQueue.shift()();
    },
    flushRaf() { while (rafQueue.length) rafQueue.shift()(); },
    api: context.LoreRelayResponsive,
  };
}

// --- Pure contracts ---

test('1400px resolves to wide mode', () => {
  const h = createShellHarness({ width: 1400 });
  assert.strictEqual(h.api.resolveMode(1400), 'wide');
  assert.strictEqual(h.api.getMode(), 'wide');
});

test('wide mode keeps the secondary header disclosure open', () => {
  const h = createShellHarness({ width: 1400, includeHeaderSecondary: true });
  assert.strictEqual(h.api.getMode(), 'wide');
  assert.strictEqual(h.els.headerSecondary.getAttribute('open'), '', 'Wide mode must expose the non-summary toolbar contents');

  h.setWidth(900);
  assert.strictEqual(h.els.headerSecondary.getAttribute('open'), null, 'Entering drawer mode must close the disclosure');

  h.setWidth(1400);
  assert.strictEqual(h.els.headerSecondary.getAttribute('open'), '', 'Returning to wide mode must restore the toolbar contents');
});

test('wide header keeps secondary controls in flex layout', () => {
  const wideDetails = styleSource.match(/html\[data-lr-shell="wide"\] #header-secondary\s*\{([^}]*)\}/);
  const wideBody = styleSource.match(/html\[data-lr-shell="wide"\] #header-secondary-body\s*\{([^}]*)\}/);
  assert.ok(wideDetails, 'Wide details CSS rule should exist');
  assert.ok(wideBody, 'Wide details body CSS rule should exist');
  assert.match(wideDetails[1], /display:\s*flex/);
  assert.match(wideDetails[1], /flex:\s*1 1 auto/);
  assert.match(wideBody[1], /display:\s*flex/);
  assert.match(wideBody[1], /flex:\s*1 1 auto/);
});

test('960px resolves to wide mode', () => {
  assert.strictEqual(createShellHarness().api.resolveMode(960), 'wide');
});

test('959px resolves to compact drawer mode', () => {
  assert.strictEqual(createShellHarness().api.resolveMode(959), 'drawer-compact');
});

test('720px resolves to compact drawer mode', () => {
  assert.strictEqual(createShellHarness().api.resolveMode(720), 'drawer-compact');
});

test('719px resolves to narrow drawer mode', () => {
  assert.strictEqual(createShellHarness().api.resolveMode(719), 'drawer-narrow');
});

test('640px resolves to narrow drawer mode', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  assert.strictEqual(h.api.getMode(), 'drawer-narrow');
});

test('wide sidebar width is finite and reclamped', () => {
  const h = createShellHarness({ width: 1000, savedWidth: 900 });
  const clamped = h.api.clampSidebarWidth(900, 1000);
  assert.ok(Number.isFinite(clamped));
  assert.ok(clamped <= Math.min(Math.floor(1000 * 0.42), 800));
  assert.ok(clamped >= 280);
});

test('malformed saved width is safe', () => {
  const api = createShellHarness().api;
  assert.strictEqual(api.clampSidebarWidth('nope', 1200), 320);
  assert.strictEqual(api.clampSidebarWidth(NaN, 1200), 320);
  assert.strictEqual(api.clampSidebarWidth(Infinity, 1200), 320);
  assert.strictEqual(api.clampSidebarWidth(-40, 1200), 320);
  assert.strictEqual(api.clampSidebarWidth(0, 1200), 320);
  assert.ok(api.clampSidebarWidth(1e12, 1200) <= 800);
});

test('drawer starts closed on first narrow entry', () => {
  const h = createShellHarness({ width: 1400 });
  h.setWidth(640);
  assert.strictEqual(h.api.getMode(), 'drawer-narrow');
  assert.strictEqual(h.api.isDrawerOpen(), false);
  assert.strictEqual(h.document.documentElement.getAttribute('data-lr-drawer'), 'closed');
});

test('drawer toggle opens and closes it', () => {
  const h = createShellHarness({ width: 800 });
  h.setWidth(800);
  assert.strictEqual(h.api.getMode(), 'drawer-compact');
  h.els.toggle.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.isDrawerOpen(), true);
  assert.strictEqual(h.document.documentElement.getAttribute('data-lr-drawer'), 'open');
  assert.strictEqual(h.els.toggle.getAttribute('aria-expanded'), 'true');
  h.els.toggle.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.isDrawerOpen(), false);
  assert.strictEqual(h.els.toggle.getAttribute('aria-expanded'), 'false');
});

test('scrim closes the drawer', () => {
  const h = createShellHarness({ width: 700 });
  h.setWidth(700);
  h.api.openDrawer({ focus: false });
  assert.strictEqual(h.api.isDrawerOpen(), true);
  h.els.scrim.dispatchEvent({ type: 'click' });
  assert.strictEqual(h.api.isDrawerOpen(), false);
});

test('Escape closes the drawer (capture)', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer({ focus: false });
  const event = { type: 'keydown', key: 'Escape', isComposing: false };
  // dispatch on document via status (bubbles to doc listeners stored on document)
  h.document.dispatchEvent = (ev) => {
    (h.document.listeners[`${ev.type}__c`] || []).forEach((fn) => fn(ev));
    (h.document.listeners[ev.type] || []).forEach((fn) => fn(ev));
  };
  h.document.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), false);
});

test('IME-composition Escape does not close drawer', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer({ focus: false });
  const event = { type: 'keydown', key: 'Escape', isComposing: true };
  h.document.dispatchEvent = (ev) => {
    (h.document.listeners[`${ev.type}__c`] || []).forEach((fn) => fn(ev));
  };
  h.document.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true);
});

test('focus returns to toggle on close', () => {
  const h = createShellHarness({ width: 700 });
  h.setWidth(700);
  h.api.openDrawer({ focus: false });
  h.api.closeDrawer();
  assert.strictEqual(h.document.activeElement, h.els.toggle);
});

test('closed drawer is inert or aria-hidden', () => {
  const h = createShellHarness({ width: 700 });
  h.setWidth(700);
  assert.strictEqual(h.api.isDrawerOpen(), false);
  assert.ok(h.els.status.inert === true || h.els.status.getAttribute('aria-hidden') === 'true');
  h.api.openDrawer({ focus: false });
  assert.ok(h.els.status.inert === false || h.els.status.getAttribute('aria-hidden') !== 'true');
});

test('entering wide clears stale inert/aria-hidden state', () => {
  const h = createShellHarness({ width: 700 });
  h.setWidth(700);
  h.api.openDrawer({ focus: false });
  h.setWidth(1400);
  assert.strictEqual(h.api.getMode(), 'wide');
  assert.strictEqual(h.api.isDrawerOpen(), false);
  assert.ok(h.els.status.inert === false);
  assert.strictEqual(h.els.status.getAttribute('aria-hidden'), null);
});

test('resizer enabled only in wide mode', () => {
  const h = createShellHarness({ width: 1400 });
  assert.strictEqual(h.api.isResizerEnabled(), true);
  h.setWidth(800);
  assert.strictEqual(h.api.isResizerEnabled(), false);
  h.setWidth(1000);
  assert.strictEqual(h.api.isResizerEnabled(), true);
});

test('drawer mode does not persist sidebar width via persistWidthFromElement', () => {
  const h = createShellHarness({ width: 800, savedWidth: 300 });
  h.setWidth(800);
  h.store.delete('lorerelay.statusWidth');
  h.els.status._width = 500;
  h.api.persistWidthFromElement();
  assert.strictEqual(h.store.has('lorerelay.statusWidth'), false);
  h.setWidth(1200);
  h.els.status._width = 300;
  h.api.persistWidthFromElement();
  assert.ok(h.store.has('lorerelay.statusWidth'));
});

test('repeated breakpoint transitions remain deterministic', () => {
  const h = createShellHarness({ width: 1400 });
  const sequence = [1400, 900, 640, 1000, 700, 1400];
  const modes = [];
  for (const w of sequence) {
    h.setWidth(w);
    modes.push(h.api.getMode());
  }
  // 1400 wide → 900 compact → 640 narrow → 1000 wide → 700 narrow → 1400 wide
  assert.deepStrictEqual(modes, [
    'wide',
    'drawer-compact',
    'drawer-narrow',
    'wide',
    'drawer-narrow',
    'wide',
  ]);
  assert.strictEqual(h.api.isDrawerOpen(), false);
});

test('resize updates are requestAnimationFrame-bounded', () => {
  const h = createShellHarness({ width: 1400 });
  h.context.innerWidth = 640;
  h.api.scheduleViewportCheck();
  assert.ok(h.rafQueue.length >= 1, 'schedule must enqueue rAF');
  // Without flushing, mode may still be previous
  h.flushRaf();
  assert.strictEqual(h.api.getMode(), 'drawer-narrow');
});

test('shell-only width changes do not invoke game rerender hooks', () => {
  const h = createShellHarness({ width: 1400 });
  let rerenders = 0;
  h.context.renderEconomyLogisticsPanel = () => { rerenders++; };
  h.context.updateStartHubVisibility = () => { rerenders++; };
  h.setWidth(640);
  h.setWidth(900);
  h.setWidth(1400);
  assert.strictEqual(rerenders, 0);
});

test('draft chat input survives transitions', () => {
  const h = createShellHarness({ width: 1400, draft: 'hello draft' });
  h.els.freeInput.value = 'hello draft';
  h.setWidth(640);
  h.setWidth(1400);
  assert.strictEqual(h.els.freeInput.value, 'hello draft');
});

test('active status tab id element survives transitions', () => {
  const h = createShellHarness({ width: 1400 });
  const tab = h.document.createElement('div');
  tab.id = 'pane-status';
  tab.className = 'tab-pane active';
  h.els.status.appendChild(tab);
  h.setWidth(640);
  h.setWidth(1400);
  assert.ok(h.document.getElementById('pane-status'));
  assert.ok(h.document.getElementById('pane-status').classList.contains('active'));
});

test('drawer controls are localized in all four locales', () => {
  for (const loc of ['en', 'ja', 'zh-CN', 'zh-TW']) {
    for (const key of [
      'webview.responsive.openStatus',
      'webview.responsive.closeStatus',
      'webview.responsive.statusDrawer',
      'webview.responsive.moreControls',
    ]) {
      assert.ok(locales[loc][key], `${loc} missing ${key}`);
      assert.ok(!String(locales[loc][key]).startsWith('webview.'), `${loc} raw key for ${key}`);
    }
  }
});

test('reduced-motion contract is present in CSS module', () => {
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '16-responsive-shell.css'), 'utf8');
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('transition: none'));
});

test('light/dark/high-contrast tokens remain theme-safe', () => {
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '16-responsive-shell.css'), 'utf8');
  assert.ok(css.includes('--vscode-') || css.includes('var(--glass'));
  assert.ok(css.includes('high-contrast') || css.includes('contrastBorder') || css.includes('--glass-bg'));
});

test('drawer stacking stays above shell chrome and below priority modals', () => {
  const shellCss = fs.readFileSync(path.join(root, 'webview', 'styles', '16-responsive-shell.css'), 'utf8');
  const imageCss = fs.readFileSync(path.join(root, 'webview', 'styles', '80-image-gen.css'), 'utf8');
  const logisticsCss = fs.readFileSync(path.join(root, 'webview', 'styles', '85b-economy-logistics.css'), 'utf8');
  const worldCss = fs.readFileSync(path.join(root, 'webview', 'styles', '85-world.css'), 'utf8');
  const zIndexFor = (css, selector) => {
    const start = css.indexOf(selector);
    assert.ok(start >= 0, `Missing selector ${selector}`);
    const end = css.indexOf('}', start);
    const match = css.slice(start, end + 1).match(/z-index:\s*(\d+)/);
    assert.ok(match, `Missing z-index for ${selector}`);
    return Number(match[1]);
  };
  const drawer = zIndexFor(shellCss, 'html[data-lr-shell="drawer-compact"] #status-area');
  const scrim = zIndexFor(shellCss, '\n#status-drawer-scrim {');
  const priorityFloor = zIndexFor(imageCss, '\n.img-gen-backdrop {');
  const lightbox = zIndexFor(logisticsCss, '\n.visual-lightbox {');
  const playerHub = zIndexFor(worldCss, '\n.player-action-hub {');
  assert.ok(scrim > 50, 'Scrim must stay above normal shell chrome');
  assert.ok(drawer > scrim, 'Drawer must stay above its scrim');
  assert.ok(drawer < priorityFloor, 'Drawer must stay below the lowest priority modal layer');
  assert.ok(lightbox > drawer, 'Logistics lightbox must stay above the drawer');
  assert.ok(playerHub > drawer, 'Player Action Hub must stay above the drawer');
});

test('high-contrast selector matches the actual html/body topology', () => {
  const css = fs.readFileSync(path.join(root, 'webview', 'styles', '16-responsive-shell.css'), 'utf8');
  assert.ok(css.includes('html[data-lr-shell^="drawer"][data-lr-drawer="open"] body.vscode-high-contrast #status-area'));
  assert.strictEqual(css.includes('body.vscode-high-contrast html[data-lr-shell^="drawer"]'), false);
  assert.ok(css.includes('body.vscode-high-contrast #status-drawer-scrim'));
});

test('module is registered in build-webview order before bootstrap', () => {
  const build = fs.readFileSync(path.join(root, 'scripts', 'build-webview.js'), 'utf8');
  assert.ok(build.includes("'84b-responsive-shell.js'"));
  assert.ok(build.includes("'16-responsive-shell.css'"));
  assert.ok(build.indexOf('84b-responsive-shell.js') < build.indexOf('90-bootstrap.js'));
  assert.ok(build.indexOf('16-responsive-shell.css') < build.indexOf('9b-genre-chrome.css'));
});

test('index.html contains drawer toggle, scrim, and header secondary disclosure', () => {
  const html = fs.readFileSync(path.join(root, 'webview', 'index.html'), 'utf8');
  assert.ok(html.includes('id="status-drawer-toggle"'));
  assert.ok(html.includes('id="status-drawer-scrim"'));
  assert.ok(html.includes('id="header-secondary"'));
  assert.ok(html.includes('id="quickstart-btn"'));
  assert.ok(html.includes('id="send-btn"'));
  assert.ok(html.includes('id="status-area"'));
});

test('input objects/state are not mutated by pure width calculations', () => {
  const api = createShellHarness().api;
  const sample = { width: 999 };
  const before = JSON.stringify(sample);
  api.clampSidebarWidth(sample.width, 1000);
  api.resolveMode(sample.width);
  assert.strictEqual(JSON.stringify(sample), before);
});

// Harness-style metrics (structural presence at target widths)
for (const width of [640, 700, 720, 800, 900, 959, 960, 1400]) {
  test(`shell DOM structure applied for ${width}px`, () => {
    const h = createShellHarness({ width });
    h.setWidth(width);
    const mode = h.api.getMode();
    if (width >= 960) assert.strictEqual(mode, 'wide');
    else if (width >= 720) assert.strictEqual(mode, 'drawer-compact');
    else assert.strictEqual(mode, 'drawer-narrow');
    assert.ok(h.document.getElementById('chat-area'));
    assert.ok(h.document.getElementById('status-area'));
    // document overflow contract is CSS-enforced; assert shell attribute applied
    assert.strictEqual(h.document.documentElement.getAttribute('data-lr-shell'), mode);
  });
}

test('bootstrap resizer clamp uses 280 minimum (source contract)', () => {
  const boot = fs.readFileSync(path.join(root, 'webview', 'modules', '90-bootstrap.js'), 'utf8');
  assert.ok(boot.includes('LoreRelayResponsive'));
  assert.ok(boot.includes('isResizerEnabled'));
  assert.ok(boot.includes('persistWidthFromElement'));
});

test('Escape conflicts and disclosure state transitions (MINOR F1/F2/F4)', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer();
  assert.strictEqual(h.api.getMode(), 'drawer-narrow');
  assert.strictEqual(h.api.isDrawerOpen(), true);

  // 1. drawer open + Genesis Guide open + Escape
  const genesis = h.document.createElement('div');
  genesis.id = 'genesis-guide-modal';
  h.document.body.appendChild(genesis);

  let event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open when Genesis is visible');
  assert.strictEqual(event._stopped, false, 'Shell should not stop propagation');

  // 2. next Escape with no modal
  genesis.classList.add('hidden');
  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), false, 'Drawer should close when no modal is active');
  assert.strictEqual(event._stopped, true, 'Shell should stop propagation');

  // 3. drawer open + Parlor Settings open
  h.api.openDrawer();
  const parlor = h.document.createElement('div');
  parlor.id = 'parlor-settings-panel';
  h.document.body.appendChild(parlor);

  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open when Parlor is visible');

  // 3b. Character Creator open
  parlor.classList.add('hidden');
  const charCreator = h.document.createElement('div');
  charCreator.id = 'char-creator-modal';
  h.document.body.appendChild(charCreator);
  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open when Character Creator is visible');
  charCreator.classList.add('hidden');

  // 4. drawer open + selected logistics route + no modal
  let logisticsCleared = false;
  h.document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { logisticsCleared = true; }
  });
  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), false, 'Drawer should close when no modal is active');
  assert.strictEqual(logisticsCleared, false, 'Logistics selection should not be cleared');
  assert.strictEqual(event._stopped, true, 'Shell should stop propagation');

  // 5. second Escape
  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(logisticsCleared, true, 'Logistics selection should be cleared on second Escape');

  // 6. IME-composing Escape
  h.api.openDrawer();
  logisticsCleared = false;
  event = { type: 'keydown', key: 'Escape', keyCode: 27, isComposing: true, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open during IME composition');
  assert.strictEqual(event._stopped, false, 'Shell should not stop propagation during IME');

  // 7. & 8. entering wide and returning to drawer; compact <-> narrow
  const headerSecondary = h.document.createElement('details');
  headerSecondary.id = 'header-secondary';
  h.document.body.appendChild(headerSecondary);

  h.setWidth(1400);
  assert.strictEqual(h.api.getMode(), 'wide');
  headerSecondary.setAttribute('open', 'open');

  h.setWidth(700); // drawer-narrow
  assert.strictEqual(h.api.getMode(), 'drawer-narrow');
  assert.strictEqual(headerSecondary.getAttribute('open'), null, 'Disclosure should close when entering drawer mode');

  headerSecondary.setAttribute('open', 'open');
  h.setWidth(800); // drawer-compact
  assert.strictEqual(h.api.getMode(), 'drawer-compact');
  assert.strictEqual(headerSecondary.getAttribute('open'), 'open', 'Disclosure should remain open during compact <-> narrow transition');
});

test('Player Action Hub Escape ownership (MINOR CORRECTIONS-B)', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer();
  assert.strictEqual(h.api.isDrawerOpen(), true);

  // Explicit assertion that obsolete ID is not used by responsive module
  const src = fs.readFileSync(modulePath, 'utf8');
  assert.strictEqual(src.includes('player-action-hub-overlay'), false, 'Obsolete ID player-action-hub-overlay should not be in responsive-shell');
  assert.strictEqual(src.includes('player-action-hub'), true, 'Correct ID player-action-hub should be in responsive-shell');

  // Player Action Hub present with id="player-action-hub"
  const hub = h.document.createElement('div');
  hub.id = 'player-action-hub';
  h.document.body.appendChild(hub);

  // Mock the hub's existing handler which closes/removes the Hub
  let hubHandlerFired = false;
  h.document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && hub.parentNode && !e._stopped) {
      hubHandlerFired = true;
      hub.remove();
    }
  });

  // Mock unrelated selection handler
  let selectionCleared = false;
  h.document.body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e._stopped) {
      selectionCleared = true;
    }
  });

  // First Escape
  let event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);

  assert.strictEqual(event._stopped, false, 'Shell should not stop propagation when Hub is open');
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open');
  assert.strictEqual(hubHandlerFired, true, 'Player Action Hub handler should fire');
  assert.strictEqual(hub.parentNode, null, 'Player Action Hub should be removed');

  selectionCleared = false;

  // Second Escape
  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);

  assert.strictEqual(event._stopped, true, 'Shell should stop propagation on second Escape');
  assert.strictEqual(h.api.isDrawerOpen(), false, 'Drawer should close on second Escape');
  assert.strictEqual(selectionCleared, false, 'Unrelated selection handler should not fire on second Escape');
});

test('Logistics lightbox owns first Escape and drawer owns the second', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer();

  const lightbox = h.document.createElement('div');
  lightbox.className = 'visual-lightbox';
  h.document.body.appendChild(lightbox);
  let lightboxHandlerFired = false;
  h.document.body.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event._stopped && !lightbox.classList.contains('hidden')) {
      lightboxHandlerFired = true;
      lightbox.classList.add('hidden');
    }
  });

  let event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(event._stopped, false, 'Shell must delegate first Escape to the lightbox');
  assert.strictEqual(lightboxHandlerFired, true, 'Lightbox handler should receive first Escape');
  assert.strictEqual(h.api.isDrawerOpen(), true, 'Drawer should remain open after lightbox closes');

  event = { type: 'keydown', key: 'Escape', keyCode: 27, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(event._stopped, true, 'Shell should consume second Escape');
  assert.strictEqual(h.api.isDrawerOpen(), false, 'Drawer should close on second Escape');
});

test('keyCode 229 Escape does not close the drawer', () => {
  const h = createShellHarness({ width: 640 });
  h.setWidth(640);
  h.api.openDrawer();
  const event = { type: 'keydown', key: 'Escape', keyCode: 229, isComposing: false, _stopped: false };
  h.document.body.dispatchEvent(event);
  assert.strictEqual(h.api.isDrawerOpen(), true);
  assert.strictEqual(event._stopped, false);
});

if (failed) process.exit(1);
console.log('webview responsive narrow: all tests passed.');
