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
let galleryImages = [];
let lastDiceRequestId = null;
let ttsEnabled = false;
let ttsSpeed = 1.0;
let ttsVolume = 0.8;
let gameOverActive = false;
let rewindTargets = [];
let checkpointMetas = [];
