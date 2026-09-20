// @ts-nocheck
// LoreRelay - Webview Script
// Handles UI interactions and postMessage communication with extension host

const vscode = acquireVsCodeApi();

// ===== i18n =====
let i18nStrings = {};
let currentLocale = 'en';
let welcomeShown = false;

function T(key, vars) {
  let text = i18nStrings[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

function applyI18n() {
  document.documentElement.lang = currentLocale;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = T(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = T(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = T(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    el.setAttribute('aria-label', T(el.dataset.i18nAriaLabel));
  });
  const gallery = document.getElementById('gallery');
  if (gallery) {
    gallery.dataset.emptyText = T('webview.gallery.empty');
  }
  const bgmMode = document.getElementById('bgm-mode');
  if (bgmMode) {
    bgmMode.textContent = T('webview.bgm.auto');
    bgmMode.title = T('webview.bgm.autoTitle');
  }
}

const localeSelect = () => document.getElementById('locale-select');

/** #free-input is a <textarea>; grow it to fit its content (up to the CSS max-height, then it scrolls). */
function autoGrowFreeInput() {
  if (!freeInput) return;
  freeInput.style.height = 'auto';
  freeInput.style.height = `${freeInput.scrollHeight}px`;
}

// DOM Elements
const chatLog = document.getElementById('chat-log');
const optionsBar = document.getElementById('options-bar');
const freeInput = document.getElementById('free-input');
const sendBtn = document.getElementById('send-btn');
const imgBtn = document.getElementById('img-btn');
const bgLayer = document.getElementById('bg-layer');
const spriteLayer = document.getElementById('sprite-layer');

// State
let currentTheme = 'fantasy';
let messageHistory = [];
let experienceProfile = 'campaign';
let parlorHasCharacter = false;
let galleryImages = [];
let lastDiceRequestId = null;
let seenHiddenDiceIds = new Set();
let ttsEnabled = false;
let ttsSpeed = 1.0;
let ttsVolume = 0.8;
let gameOverActive = false;
let rewindTargets = [];
let checkpointMetas = [];

/**
 * Promise-based replacement for window.confirm() for purely client-side
 * (not-yet-persisted) actions. Native confirm()/alert() are silently ignored
 * by the VS Code webview iframe sandbox (no allow-modals), so this renders a
 * small in-page modal instead. For destructive actions that go through a
 * postMessage to the extension, prefer confirming there via
 * vscode.window.showWarningMessage({ modal: true }) instead of this.
 */
function webviewConfirm(message, confirmLabel) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'wv-confirm-backdrop';

    const box = document.createElement('div');
    box.className = 'wv-confirm-box';

    const msgEl = document.createElement('div');
    msgEl.className = 'wv-confirm-message';
    msgEl.textContent = message;
    box.appendChild(msgEl);

    const actions = document.createElement('div');
    actions.className = 'wv-confirm-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'glass-btn';
    cancelBtn.textContent = T('webview.confirm.cancel');

    const yesBtn = document.createElement('button');
    yesBtn.className = 'glass-btn wv-confirm-yes';
    yesBtn.textContent = confirmLabel || T('webview.confirm.ok');

    const finish = (result) => {
      backdrop.remove();
      document.removeEventListener('keydown', onKeydown);
      resolve(result);
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') finish(false);
    };

    cancelBtn.addEventListener('click', () => finish(false));
    yesBtn.addEventListener('click', () => finish(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
    document.addEventListener('keydown', onKeydown);

    actions.appendChild(cancelBtn);
    actions.appendChild(yesBtn);
    box.appendChild(actions);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    yesBtn.focus();
  });
}

/** Normalized path compare for gallery ↔ extension VLM events. */
function imagePathsLooselyMatch(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') { return false; }
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  return norm(a) === norm(b);
}

function findGalleryIndexByImagePath(imagePath) {
  return galleryImages.findIndex((e) => e.rawPath && imagePathsLooselyMatch(e.rawPath, imagePath));
}
