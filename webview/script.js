// AUTO-GENERATED from webview/modules/*.js — run: npm run build:webview
// @ts-nocheck
// LoreRelay - Webview Script


/* --- 00-core.js --- */
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

/* --- 05-quickstart.js --- */
// ===== Zero-Config Quickstart =====

(function initQuickstart() {
  const modal = document.getElementById('quickstart-modal');
  const overlay = document.getElementById('quickstart-overlay');
  const closeBtn = document.getElementById('quickstart-close');
  const startBtn = document.getElementById('quickstart-start-btn');
  const promptInput = document.getElementById('quickstart-prompt');
  const overwriteCb = document.getElementById('quickstart-overwrite-cb');
  const loadingDiv = document.getElementById('quickstart-loading');

  if (!modal) return;

  function openQuickstart() {
    modal.classList.remove('hidden');
    promptInput.focus();
  }

  function closeQuickstart() {
    modal.classList.add('hidden');
  }

  // Global exposure
  window.LoreRelay = window.LoreRelay || {};
  window.LoreRelay.openQuickstart = openQuickstart;

  closeBtn.addEventListener('click', closeQuickstart);
  overlay.addEventListener('click', closeQuickstart);

  promptInput.addEventListener('input', () => promptInput.classList.remove('invalid'));

  startBtn.addEventListener('click', () => {
    const promptText = promptInput.value.trim();
    if (!promptText) {
      // alert() is silently blocked by the VS Code webview iframe sandbox;
      // use an inline invalid state instead.
      promptInput.classList.add('invalid');
      promptInput.focus();
      return;
    }

    loadingDiv.classList.remove('hidden');
    startBtn.disabled = true;

    // Send to extension
    vscode.postMessage({
      type: 'runQuickstart',
      prompt: promptText,
      overwrite: !!overwriteCb.checked
    });
  });

  // Listen for completion to hide loading
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'stateUpdate' || message.type === 'scenarioDirector') {
      if (!modal.classList.contains('hidden')) {
        loadingDiv.classList.add('hidden');
        startBtn.disabled = false;
        closeQuickstart();
      }
    }
  });

})();

/* --- 06-genesis-guide.js --- */
// ===== Genesis Guide Wizard (Genesis Mode G2) =====
// Webview UI only. Never writes game_rules.json or canonical state directly.
// The preview logic below MIRRORS src/rulesProfileCore.ts for local, instant
// feedback while the wizard is open. It is NOT authoritative: when the user
// clicks "Start with this", only a postMessage is sent — the host re-resolves
// the answers through the real resolveRulesProfile() (RP2 apply gate) before
// touching game_rules.json.

(function initGenesisGuide() {
  const backdrop = document.getElementById('genesis-guide-backdrop');
  const modal = document.getElementById('genesis-guide-modal');
  const closeBtn = document.getElementById('genesis-guide-close');
  const heroCta = document.getElementById('genesis-hero-cta');

  if (!modal) return;

  const progressEl = document.getElementById('genesis-guide-progress');
  const progressDotsEl = document.getElementById('genesis-guide-progress-dots');
  const stepView = document.getElementById('genesis-guide-step-view');
  const summaryView = document.getElementById('genesis-guide-summary-view');
  const stepTitleEl = document.getElementById('genesis-step-title');
  const stepDescEl = document.getElementById('genesis-step-desc');
  const stepOptionsEl = document.getElementById('genesis-step-options');
  const portraitImg = document.getElementById('genesis-guide-portrait');
  const portraitFallback = document.getElementById('genesis-guide-portrait-fallback');
  const portraitCaption = document.getElementById('genesis-guide-portrait-caption');
  const summaryPortraitImg = document.getElementById('genesis-summary-portrait');
  const summaryPortraitFallback = document.getElementById('genesis-summary-portrait-fallback');
  const summaryPortraitCaption = document.getElementById('genesis-summary-portrait-caption');

  const stepNav = document.getElementById('genesis-guide-nav');
  const backBtn = document.getElementById('genesis-back-btn');
  const nextBtn = document.getElementById('genesis-next-btn');
  const skipToSummaryBtn = document.getElementById('genesis-skip-summary-btn');
  const altLinksEl = document.getElementById('genesis-alt-links');
  const quickstartLink = document.getElementById('genesis-quickstart-link');

  const summaryNav = document.getElementById('genesis-guide-summary-nav');
  const restartBtn = document.getElementById('genesis-restart-btn');
  const advancedBtn = document.getElementById('genesis-advanced-btn');
  const startBtn = document.getElementById('genesis-start-btn');
  const appliedToast = document.getElementById('genesis-applied-toast');

  const summaryRowsEl = document.getElementById('genesis-summary-rows');
  const summarySystemsEl = document.getElementById('genesis-summary-systems');
  const summaryWarningsEl = document.getElementById('genesis-summary-warnings');
  const notesInput = document.getElementById('genesis-summary-notes');
  const comfyBlock = document.getElementById('genesis-comfy-block');
  const imagesSkipHint = document.getElementById('genesis-images-skip-hint');
  const comfyPromptEl = document.getElementById('genesis-comfy-prompt');
  const copyPromptBtn = document.getElementById('genesis-copy-prompt-btn');
  const copyPromptToast = document.getElementById('genesis-copy-prompt-toast');
  const generateImageBtn = document.getElementById('genesis-generate-image-btn');
  const generateImageToast = document.getElementById('genesis-generate-image-toast');

  // ---- Answer domain (mirrors GENESIS_* enums in src/rulesProfileCore.ts) ----
  const STEPS = ['genre', 'playstyle', 'pressure', 'bookkeeping', 'protagonistMode', 'imageGenerationWanted'];

  // Locale files use "step.images.*" for the imageGenerationWanted step.
  const STEP_I18N_ALIAS = { imageGenerationWanted: 'images' };

  function stepI18nId(stepId) {
    return STEP_I18N_ALIAS[stepId] || stepId;
  }

  const OPTIONS = {
    genre: [
      { id: 'fantasy', icon: '🏰' },
      { id: 'post_apocalypse', icon: '☢️' },
      { id: 'cyberpunk', icon: '🌆' },
      { id: 'sci_fi', icon: '🛸' },
      { id: 'eastern', icon: '⛩️' },
      { id: 'horror', icon: '🕯️' },
      { id: 'modern', icon: '🔮' },
    ],
    playstyle: [
      { id: 'adventure', icon: '🗺️' },
      { id: 'settlement', icon: '🏘️' },
      { id: 'vehicle', icon: '🚗' },
      { id: 'mobile_base', icon: '🚚' },
      { id: 'trade', icon: '💰' },
      { id: 'domain', icon: '👑' },
      { id: 'guild', icon: '🛡️' },
      { id: 'character_chat', icon: '💬' },
    ],
    pressure: [
      { id: 'tourist', icon: '🌤️' },
      { id: 'standard', icon: '⚖️' },
      { id: 'survival', icon: '🔥' },
      { id: 'nightmare', icon: '💀' },
    ],
    bookkeeping: [
      { id: 'minimal', icon: '📝' },
      { id: 'light', icon: '🎒' },
      { id: 'detailed', icon: '📊' },
    ],
    protagonistMode: [
      { id: 'generate', icon: '✨' },
      { id: 'sillytavern', icon: '📥' },
      { id: 'manual', icon: '🧑' },
      { id: 'skip', icon: '⏭️' },
    ],
    imageGenerationWanted: [
      { id: true, icon: '🎨' },
      { id: false, icon: '📝' },
    ],
  };

  const DEFAULTS = {
    genre: 'fantasy',
    playstyle: 'adventure',
    pressure: 'standard',
    bookkeeping: 'light',
    protagonistMode: 'generate',
    imageGenerationWanted: true,
  };

  // ---- rulesProfileCore.ts mirror tables (UI preview only) ----
  const STYLE_PROMPT_BY_GENRE = {
    fantasy: 'classic fantasy, warm lantern light, ancient ruins, painterly adventure key visual',
    post_apocalypse: 'post-apocalyptic wasteland, scavenger settlement, rusted vehicles, dramatic survival key visual',
    cyberpunk: 'cyberpunk neon city, rainy streets, holograms, high contrast sci-fi key visual',
    sci_fi: 'space frontier, starport, exploration vessel, alien horizon, cinematic science fiction key visual',
    eastern: 'eastern fantasy, misty mountains, shrine path, elegant ink-painting adventure key visual',
    horror: 'survival horror, abandoned streets, tense shadows, desperate safe room key visual',
    modern: 'modern occult, urban night, hidden ritual signs, investigative supernatural key visual',
  };

  const ASSET_HINT_BY_GENRE = {
    fantasy: { guideWebviewPath: 'assets/genesis/guide_fantasy_goddess.png', backgroundWebviewPath: 'assets/genesis/background_fantasy.png' },
    post_apocalypse: { guideWebviewPath: 'assets/genesis/guide_post_apocalypse_mechanic.png', backgroundWebviewPath: 'assets/genesis/background_post_apocalypse.png' },
    cyberpunk: { guideWebviewPath: 'assets/genesis/guide_cyberpunk_ai_avatar.png', backgroundWebviewPath: 'assets/genesis/background_cyberpunk.png' },
    sci_fi: { guideWebviewPath: 'assets/genesis/guide_space_alien_mercenary.png', backgroundWebviewPath: 'assets/genesis/background_sci_fi.png' },
    eastern: { guideWebviewPath: 'assets/genesis/guide_eastern_xianxia_fairy.png', backgroundWebviewPath: 'assets/genesis/background_eastern.png' },
    horror: { guideWebviewPath: 'assets/genesis/guide_horror_hooded.png', backgroundWebviewPath: 'assets/genesis/background_horror.png' },
    modern: { guideWebviewPath: 'assets/genesis/guide_modern_occult_librarian.png', backgroundWebviewPath: 'assets/genesis/background_modern.png' },
  };

  // System chips shown on the summary screen: [flagName, i18n key, baseline?]
  const BASELINE_SYSTEM_KEYS = [
    'webview.genesis.system.worldForge',
    'webview.genesis.system.campaignKit',
    'webview.genesis.system.npcRegistry',
  ];

  function applyPlaystylePreview(playstyle) {
    const flags = {};
    switch (playstyle) {
      case 'settlement':
        flags.settlement = true;
        flags.commerce = true;
        break;
      case 'vehicle':
        flags.vehicle = true;
        flags.commerce = true;
        break;
      case 'mobile_base':
        flags.vehicle = true;
        flags.settlement = true;
        flags.mobileBase = true;
        flags.commerce = true;
        break;
      case 'trade':
        flags.commerce = true;
        flags.observatory = true;
        break;
      case 'domain':
        flags.domain = true;
        break;
      case 'guild':
        flags.guild = true;
        break;
      default:
        break;
    }
    return flags;
  }

  function applyBookkeepingPreview(flags, answers) {
    const playstyleNeedsCommerce = ['trade', 'settlement', 'vehicle', 'mobile_base'].includes(answers.playstyle);
    if (answers.bookkeeping === 'minimal') {
      flags.observatory = false;
      if (!playstyleNeedsCommerce) { flags.commerce = false; }
    } else if (answers.bookkeeping === 'detailed') {
      flags.observatory = true;
      if (flags.commerce === undefined) { flags.commerce = playstyleNeedsCommerce; }
    }
  }

  function label(value) {
    return String(value).split('_').map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part)).join(' ');
  }

  /** Local preview mirror of resolveRulesProfile(). Not authoritative. */
  function resolvePreview(answers) {
    // character_chat skips the adventure common package (World Forge / Campaign Kit / NPC registry).
    if (answers.playstyle === 'character_chat') {
      return {
        profileId: [answers.genre, answers.playstyle, answers.pressure, answers.bookkeeping].join('.'),
        systemChips: [T('webview.genesis.system.characterChat')],
        includeBaselineSystems: false,
        comfyUiStylePrompt: STYLE_PROMPT_BY_GENRE[answers.genre] || '',
        assetHint: ASSET_HINT_BY_GENRE[answers.genre] || {},
      };
    }

    const flags = applyPlaystylePreview(answers.playstyle);
    applyBookkeepingPreview(flags, answers);

    const systemChips = [];
    if (flags.settlement) systemChips.push(T('webview.genesis.system.settlement'));
    if (flags.vehicle) systemChips.push(T('webview.genesis.system.vehicle'));
    if (flags.mobileBase) systemChips.push(T('webview.genesis.system.mobileBase'));
    if (flags.domain) systemChips.push(T('webview.genesis.system.domain'));
    if (flags.guild) systemChips.push(T('webview.genesis.system.guild'));
    if (flags.commerce) systemChips.push(T('webview.genesis.system.commerce'));
    if (flags.observatory) systemChips.push(T('webview.genesis.system.observatory'));

    return {
      profileId: [answers.genre, answers.playstyle, answers.pressure, answers.bookkeeping].join('.'),
      systemChips,
      includeBaselineSystems: true,
      comfyUiStylePrompt: STYLE_PROMPT_BY_GENRE[answers.genre] || '',
      assetHint: ASSET_HINT_BY_GENRE[answers.genre] || {},
    };
  }

  // ---- Wizard state ----
  const state = {
    open: false,
    stepIndex: 0,
    answers: Object.assign({}, DEFAULTS),
    touched: {},
    applied: false,
  };

  function assetBaseUri() {
    const raw = window.__LR_GENESIS_ASSET_BASE_URI__;
    if (!raw || raw.indexOf('{{') !== -1) return null;
    return raw.replace(/\/$/, '');
  }

  function resolveAssetUri(webviewPath) {
    const base = assetBaseUri();
    if (!base || !webviewPath) return null;
    return `${base}/${String(webviewPath).replace(/^\/+/, '')}`;
  }

  function guideCaptionText() {
    const genreLabel = optionLabel('genre', state.answers.genre);
    return T('webview.genesis.guideCaption', { genre: genreLabel });
  }

  function applyPortrait(imgEl, fallbackEl, captionEl, webviewPath) {
    const uri = resolveAssetUri(webviewPath);
    const caption = guideCaptionText();
    if (captionEl) captionEl.textContent = caption;
    if (uri) {
      if (imgEl.getAttribute('src') !== uri) {
        imgEl.classList.add('genesis-portrait-loading');
        imgEl.onload = () => imgEl.classList.remove('genesis-portrait-loading');
        imgEl.src = uri;
      }
      imgEl.alt = caption;
      imgEl.classList.remove('hidden');
      fallbackEl.classList.add('hidden');
      imgEl.onerror = () => {
        imgEl.classList.add('hidden');
        fallbackEl.classList.remove('hidden');
      };
    } else {
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
    }
  }

  function applyBackground(webviewPath) {
    const uri = resolveAssetUri(webviewPath);
    if (uri) {
      modal.style.setProperty('--genesis-background-image', `url("${uri.replace(/["\\]/g, '')}")`);
    } else {
      modal.style.removeProperty('--genesis-background-image');
    }
  }

  function optionLabel(stepId, optionId) {
    return T(`webview.genesis.${stepId}.${optionId}.label`);
  }

  function optionDesc(stepId, optionId) {
    return T(`webview.genesis.${stepId}.${optionId}.desc`);
  }

  function renderProgressDots() {
    if (!progressDotsEl) return;
    progressDotsEl.innerHTML = '';
    const onSummary = state.stepIndex >= STEPS.length;
    STEPS.forEach((stepId, idx) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'genesis-progress-dot';
      if (idx === state.stepIndex) dot.classList.add('active');
      else if (idx < state.stepIndex) dot.classList.add('done');
      dot.title = T(`webview.genesis.step.${stepI18nId(stepId)}.title`);
      dot.setAttribute('aria-label', dot.title);
      dot.addEventListener('click', () => {
        state.stepIndex = idx;
        render();
      });
      progressDotsEl.appendChild(dot);
    });
    const summaryDot = document.createElement('button');
    summaryDot.type = 'button';
    summaryDot.className = 'genesis-progress-dot genesis-progress-dot-summary';
    if (onSummary) summaryDot.classList.add('active');
    summaryDot.textContent = '✓';
    summaryDot.title = T('webview.genesis.summary.title');
    summaryDot.setAttribute('aria-label', summaryDot.title);
    summaryDot.addEventListener('click', () => {
      state.stepIndex = STEPS.length;
      render();
    });
    progressDotsEl.appendChild(summaryDot);
  }

  function renderStep() {
    const stepId = STEPS[state.stepIndex];
    progressEl.textContent = T('webview.genesis.progress', { current: state.stepIndex + 1, total: STEPS.length });
    stepTitleEl.textContent = T(`webview.genesis.step.${stepI18nId(stepId)}.title`);
    stepDescEl.textContent = T(`webview.genesis.step.${stepI18nId(stepId)}.desc`);

    const hint = ASSET_HINT_BY_GENRE[state.answers.genre] || {};
    applyPortrait(portraitImg, portraitFallback, portraitCaption, hint.guideWebviewPath);
    applyBackground(hint.backgroundWebviewPath);

    stepOptionsEl.innerHTML = '';
    OPTIONS[stepId].forEach((opt) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'genesis-option-chip';
      if (state.answers[stepId] === opt.id) chip.classList.add('selected');
      chip.setAttribute('aria-pressed', state.answers[stepId] === opt.id ? 'true' : 'false');
      chip.innerHTML = `<span class="genesis-option-chip-label">${opt.icon} ${escapeHtml(optionLabel(stepId, String(opt.id)))}</span>` +
        `<span class="genesis-option-chip-desc">${escapeHtml(optionDesc(stepId, String(opt.id)))}</span>`;
      chip.addEventListener('click', () => {
        state.answers[stepId] = opt.id;
        state.touched[stepId] = true;
        renderStep();
      });
      stepOptionsEl.appendChild(chip);
    });

    backBtn.disabled = state.stepIndex === 0;
    backBtn.style.visibility = state.stepIndex === 0 ? 'hidden' : 'visible';
    skipToSummaryBtn.style.visibility = state.stepIndex >= 1 ? 'visible' : 'hidden';
    nextBtn.textContent = state.stepIndex === STEPS.length - 1
      ? T('webview.genesis.summaryBtnShort')
      : T('webview.genesis.nextBtn');

    renderProgressDots();
    stepView.classList.remove('hidden');
    summaryView.classList.add('hidden');
    stepNav.classList.remove('hidden');
    summaryNav.classList.add('hidden');
    if (altLinksEl) altLinksEl.classList.remove('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function resetAppliedState() {
    state.applied = false;
    startBtn.disabled = false;
    startBtn.textContent = T('webview.genesis.summary.startBtn');
    appliedToast.classList.add('hidden');
    appliedToast.textContent = '';
  }

  function renderSummary() {
    const answers = state.answers;
    const preview = resolvePreview(answers);
    const hint = preview.assetHint || {};
    applyPortrait(summaryPortraitImg, summaryPortraitFallback, summaryPortraitCaption, hint.guideWebviewPath);
    applyBackground(hint.backgroundWebviewPath);

    const rows = [
      ['webview.genesis.summary.genre', optionLabel('genre', answers.genre)],
      ['webview.genesis.summary.playstyle', optionLabel('playstyle', answers.playstyle)],
      ['webview.genesis.summary.pressure', optionLabel('pressure', answers.pressure)],
      ['webview.genesis.summary.bookkeeping', optionLabel('bookkeeping', answers.bookkeeping)],
      ['webview.genesis.summary.protagonist', optionLabel('protagonistMode', answers.protagonistMode)],
      ['webview.genesis.summary.images', answers.imageGenerationWanted
        ? optionLabel('imageGenerationWanted', 'true')
        : optionLabel('imageGenerationWanted', 'false')],
    ];
    const stepIndexByRow = [0, 1, 2, 3, 4, 5];
    summaryRowsEl.innerHTML = rows.map(([labelKey, value], rowIdx) => (
      `<button type="button" class="genesis-summary-row" data-step="${stepIndexByRow[rowIdx]}" ` +
      `title="${escapeHtml(T('webview.genesis.summary.editRowHint'))}">` +
      `<span class="genesis-summary-row-label">${escapeHtml(T(labelKey))}</span>` +
      `<span class="genesis-summary-row-value">${escapeHtml(value)} <span class="genesis-summary-row-edit" aria-hidden="true">✎</span></span></button>`
    )).join('');
    summaryRowsEl.querySelectorAll('.genesis-summary-row').forEach((rowEl) => {
      rowEl.addEventListener('click', () => {
        const idx = parseInt(rowEl.dataset.step || '0', 10);
        state.stepIndex = Number.isFinite(idx) ? idx : 0;
        render();
      });
    });

    const baselineChips = preview.includeBaselineSystems === false
      ? []
      : BASELINE_SYSTEM_KEYS.map((k) => (
        `<span class="genesis-system-chip genesis-system-chip-baseline">${escapeHtml(T(k))}</span>`
      ));
    const extraChips = preview.systemChips.map((label_) => (
      `<span class="genesis-system-chip">${escapeHtml(label_)}</span>`
    ));
    summarySystemsEl.innerHTML = baselineChips.concat(extraChips).join('') ||
      `<span class="genesis-system-chip genesis-system-chip-baseline">${escapeHtml(T('webview.genesis.summary.systemsNone'))}</span>`;

    summaryWarningsEl.classList.add('hidden');
    summaryWarningsEl.textContent = '';

    const wantsImages = answers.imageGenerationWanted === true;
    if (comfyBlock) comfyBlock.classList.toggle('hidden', !wantsImages);
    if (imagesSkipHint) imagesSkipHint.classList.toggle('hidden', wantsImages);
    comfyPromptEl.value = preview.comfyUiStylePrompt;
    copyPromptToast.classList.add('hidden');
    generateImageToast.classList.add('hidden');

    renderProgressDots();
    stepView.classList.add('hidden');
    summaryView.classList.remove('hidden');
    stepNav.classList.add('hidden');
    summaryNav.classList.remove('hidden');
    if (altLinksEl) altLinksEl.classList.add('hidden');
    progressEl.textContent = '';
  }

  function render() {
    if (state.stepIndex >= STEPS.length) {
      renderSummary();
    } else {
      renderStep();
    }
  }

  function openGenesisGuide() {
    state.open = true;
    state.stepIndex = 0;
    state.answers = Object.assign({}, DEFAULTS);
    state.touched = {};
    resetAppliedState();
    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    render();
  }

  function closeGenesisGuide() {
    state.open = false;
    modal.classList.add('hidden');
    backdrop.classList.add('hidden');
  }

  window.LoreRelay = window.LoreRelay || {};
  window.LoreRelay.openGenesisGuide = openGenesisGuide;

  if (heroCta) heroCta.addEventListener('click', openGenesisGuide);
  if (closeBtn) closeBtn.addEventListener('click', closeGenesisGuide);
  if (backdrop) backdrop.addEventListener('click', closeGenesisGuide);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.open) {
      closeGenesisGuide();
    }
  });

  backBtn.addEventListener('click', () => {
    if (state.stepIndex > 0) {
      state.stepIndex -= 1;
      render();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (state.stepIndex < STEPS.length - 1) {
      state.stepIndex += 1;
    } else {
      state.stepIndex = STEPS.length;
    }
    render();
  });

  skipToSummaryBtn.addEventListener('click', () => {
    state.stepIndex = STEPS.length;
    render();
  });

  restartBtn.addEventListener('click', () => {
    state.stepIndex = 0;
    state.answers = Object.assign({}, DEFAULTS);
    state.touched = {};
    resetAppliedState();
    render();
  });

  advancedBtn.addEventListener('click', () => {
    closeGenesisGuide();
    const rulesBtn = document.getElementById('game-rules-settings-btn');
    if (rulesBtn) rulesBtn.click();
  });

  if (quickstartLink) {
    quickstartLink.addEventListener('click', () => {
      closeGenesisGuide();
      const quickBtn = document.getElementById('start-hub-quick-btn');
      if (quickBtn) quickBtn.click();
    });
  }

  // "What happens next" after a successful apply: protagonistMode was only
  // ever decorative for resolveRulesProfile() (it does not map to any
  // game_rules key — see src/rulesProfileCore.ts), so acting on it here is a
  // pure Webview navigation shortcut, not new backend behavior. 'generate'
  // and 'skip' have no extra action (the GM improvises / user decides later).
  function protagonistNextStepLabelKey() {
    switch (state.answers.protagonistMode) {
      case 'manual': return 'webview.genesis.summary.closeAndCreateBtn';
      case 'sillytavern': return 'webview.genesis.summary.closeAndImportBtn';
      default: return 'webview.genesis.summary.closeAndStartBtn';
    }
  }

  function runProtagonistNextStep() {
    closeGenesisGuide();
    if (state.answers.protagonistMode === 'manual') {
      window.openCharacterCreator?.(null);
    } else if (state.answers.protagonistMode === 'sillytavern') {
      vscode.postMessage({ type: 'importTavernCard' });
    }
  }

  startBtn.addEventListener('click', () => {
    if (state.applied) {
      // Second click after a successful apply: close, then jump straight to
      // the protagonist step the user already chose (create / import), or
      // just hand back to the Start Hub for generate/skip.
      runProtagonistNextStep();
      return;
    }
    const preview = resolvePreview(state.answers);
    startBtn.disabled = true;
    vscode.postMessage({
      type: 'genesisApplyProfile',
      answers: Object.assign({}, state.answers),
      freeformNotes: notesInput ? notesInput.value.slice(0, 2000) : '',
      previewProfileId: preview.profileId,
    });
    appliedToast.textContent = T('webview.genesis.summary.applyingToast');
    appliedToast.classList.remove('hidden');
  });

  let imageGenTimeoutId = null;
  const exclusionHintEl = document.getElementById('genesis-exclusion-hint');

  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (message.type === 'genesisProfileApplied') {
      startBtn.disabled = false;
      if (message.ok) {
        state.applied = true;
        const count = Array.isArray(message.changedKeys) ? message.changedKeys.length : 0;
        appliedToast.textContent = T('webview.genesis.summary.appliedSuccess', { count });
        startBtn.textContent = T(protagonistNextStepLabelKey());
        if (Array.isArray(message.warnings) && message.warnings.length > 0) {
          summaryWarningsEl.textContent = T('webview.genesis.summary.appliedWarnings');
          summaryWarningsEl.classList.remove('hidden');
        }
        // C4: Show GM exclusion suggestion hint if any events were suggested
        if (exclusionHintEl) {
          const excludedCount = Array.isArray(message.suggestedExclusionCount)
            ? message.suggestedExclusionCount
            : (typeof message.suggestedExclusionCount === 'number' ? message.suggestedExclusionCount : 0);
          if (excludedCount > 0) {
            exclusionHintEl.textContent = T('webview.genesis.summary.exclusionHint', { count: excludedCount });
            exclusionHintEl.classList.remove('hidden');
          } else {
            exclusionHintEl.classList.add('hidden');
          }
        }
      } else {
        appliedToast.textContent = T('webview.genesis.summary.appliedFailed');
        if (exclusionHintEl) exclusionHintEl.classList.add('hidden');
      }
      appliedToast.classList.remove('hidden');
    } else if (message.type === 'genesisImageGenerated') {
      if (imageGenTimeoutId) {
        clearTimeout(imageGenTimeoutId);
        imageGenTimeoutId = null;
      }
      generateImageBtn.disabled = false;
      generateImageToast.classList.add('hidden');
      if (message.success && message.imageUri) {
        applyPortrait(portraitImg, portraitFallback, portraitCaption, message.imageUri);
        applyPortrait(summaryPortraitImg, summaryPortraitFallback, summaryPortraitCaption, message.imageUri);
      }
    }
  });

  if (copyPromptBtn) {
    copyPromptBtn.addEventListener('click', () => {
      const text = comfyPromptEl.value || '';
      const done = () => {
        copyPromptToast.classList.remove('hidden');
        setTimeout(() => copyPromptToast.classList.add('hidden'), 2500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => {
          comfyPromptEl.select();
          done();
        });
      } else {
        comfyPromptEl.select();
        done();
      }
    });
  }

  if (generateImageBtn) {
    generateImageBtn.addEventListener('click', () => {
      const preview = resolvePreview(state.answers);
      vscode.postMessage({
        type: 'genesisGenerateImage',
        genre: state.answers.genre,
        prompt: preview.comfyUiStylePrompt,
        assetHint: preview.assetHint,
      });
      generateImageBtn.disabled = true;
      generateImageToast.classList.remove('hidden');
      if (imageGenTimeoutId) clearTimeout(imageGenTimeoutId);
      imageGenTimeoutId = setTimeout(() => {
        generateImageToast.classList.add('hidden');
        generateImageBtn.disabled = false;
        imageGenTimeoutId = null;
      }, 90000);
    });
  }
})();

/* --- 10-game-state.js --- */
// ===== Game State の適用 =====
let lastGameStateSyncSeq = 0;

function shouldApplyGameStateUpdate(msg) {
  if (msg?.syncSeq === undefined || msg.syncSeq === null) {
    return true;
  }
  const seq = Number(msg.syncSeq);
  if (!Number.isFinite(seq)) {
    return true;
  }
  if (seq < lastGameStateSyncSeq) {
    return false;
  }
  if (seq > lastGameStateSyncSeq) {
    lastGameStateSyncSeq = seq;
  }
  return true;
}

function applyEntryPatch(patch) {
  if (!patch?.id) return;
  const idx = messageHistory.findIndex(m => m.id === patch.id);
  if (idx < 0) return;
  const prev = messageHistory[idx];
  const next = { ...prev, ...patch };
  messageHistory[idx] = next;
  const el = document.getElementById(`msg-${patch.id}`);
  if (el) {
    el.remove();
    renderMessage(next);
  }
  if (next.image) {
    addImageToGallery(next.image, {
      rawPath: next.rawImagePath,
      prompt: next.imagePrompt,
      locationId: next.locationId,
      worldTurn: next.worldTurn,
    });
  }
  saveState();
}

function applyGameState(state, fullHistory) {
  if (!state) return;

  // ログエントリの追加
  if (state.entries && Array.isArray(state.entries)) {
    if (fullHistory) {
      // パネル再表示時: 全履歴を新しい WebviewURI で置き換え
      messageHistory = [];
      chatLog.innerHTML = '';
      seenHiddenDiceIds.clear();
    }
    const existingIds = new Set(messageHistory.map(m => m.id));
    let lastAddedEntry = null;
    for (const entry of state.entries) {
      if (!existingIds.has(entry.id)) {
        messageHistory.push(entry);
        renderMessage(entry);
        if (entry.role === 'gm') {
          lastAddedEntry = entry;
        }
      } else {
        const idx = messageHistory.findIndex(m => m.id === entry.id);
        if (idx >= 0) {
          const prev = messageHistory[idx];
          const imageChanged = entry.image && entry.image !== prev.image;
          const promptChanged = entry.imagePrompt !== undefined && entry.imagePrompt !== prev.imagePrompt;
          if (imageChanged || promptChanged) {
            applyEntryPatch({
              id: entry.id,
              ...(imageChanged ? { image: entry.image } : {}),
              ...(promptChanged ? { imagePrompt: entry.imagePrompt } : {})
            });
          }
        }
      }
    }
    if (lastAddedEntry && !fullHistory) {
      speakEntryText(lastAddedEntry);
    }
  }

  // ステータスの更新
  updateStatus(state.status);

  // 選択肢の更新
  if (state.options && Array.isArray(state.options)) {
    renderOptions(state.options);
  }

  // 画像の更新
  if (state.latestImage) {
    addImageToGallery(state.latestImage, {
      rawPath: state.latestImageRawPath,
      description: state.latestImageDescription,
    });
  }

  // テーマの更新
  if (state.theme) {
    setTheme(state.theme);
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.theme-btn[data-theme="${state.theme}"]`);
    if (btn) btn.classList.add('active');
  }

  // Summary
  if (state.summary !== undefined) {
    document.getElementById('story-summary').value = state.summary;
  }

  if (state.background) {
    setSceneBackground(state.background);
  }

  if (state.sprite) {
    setSceneSprite(state.sprite);
  }

  if (state.gameOver) {
    setGameOverOverlay(state.gameOver);
  } else {
    setGameOverOverlay({ active: false });
  }

  // BGM の更新（GM が bgm=トラックID か mood=ムード名を指定）
  if (state.bgm) {
    playBgmById(state.bgm);
  } else if (state.mood) {
    playBgmByMood(state.mood);
  }

  // 効果音(SE)の再生（GM が sfx=ID または [ID,...] を指定）
  if (state.sfx) {
    const ids = Array.isArray(state.sfx) ? state.sfx : [state.sfx];
    ids.forEach(id => playSfx(id));
  }

  // 隠しダイス通知（GM が hiddenDice に振ったダイスを記録）
  if (Array.isArray(state.hiddenDice)) {
    state.hiddenDice.forEach(entry => {
      const entryId = entry.id || `hd-${entry.notation}-${entry.purpose || ''}`;
      if (!seenHiddenDiceIds.has(entryId)) {
        seenHiddenDiceIds.add(entryId);
        const label = entry.notation || '?d?';
        const purposeText = entry.purpose ? `（${entry.purpose}）` : '';
        addSystemMessage(T('webview.dice.hiddenRoll', { notation: label }) + purposeText);
        playSfx('dice');
      }
    });
  }

  // GM からのダイス要求（diceRequest）→ 自動ロール + 音で成否確認
  if (state.diceRequest) {
    const req = state.diceRequest;
    const reqId = req.id || `${req.notation}|${req.purpose || ''}`;
    if (reqId !== lastDiceRequestId) {
      lastDiceRequestId = reqId;
      handleDiceRequest(req);
    }
  }

  // 状態を保存
  saveState();

  // 自動スクロール
  scrollToBottom();
}

// ===== メッセージ描画 =====
function renderMessage(entry) {
  const div = document.createElement('div');
  div.className = `msg ${entry.role || 'gm'}`;
  if (entry.excludedFromPrompt) { div.classList.add('excluded'); }
  div.id = `msg-${entry.id}`;

  // キャラ名の色分け
  const senderColor = getCharacterColor(entry.sender || (entry.role === 'user' ? 'Player' : 'Game Master'));

  const defaultSender = entry.role === 'user' ? T('webview.sender.player') : T('webview.sender.gm');
  let html = `<div class="msg-sender" style="color: ${senderColor}">${escapeHtml(entry.sender || defaultSender)}</div>`;

  let bodyHtml = escapeHtml(entry.content);
  if (bodyHtml.includes('```mermaid')) {
    bodyHtml = bodyHtml.replace(/```mermaid\n([\s\S]*?)```/g, (match, p1) => {
      return `<div class="mermaid">${p1}</div>`;
    });
    // Trigger mermaid run after DOM update
    setTimeout(() => {
      if (window.mermaid) {
        window.mermaid.run({ querySelector: '.mermaid' }).catch(e => console.error('Mermaid render error:', e));
      }
    }, 100);
  }

  html += `<div class="msg-body">${bodyHtml}</div>`;

  div.innerHTML = html;

  // ===== メッセージアクションバー =====
  if (entry.role !== 'system') {
    const actionsBar = document.createElement('div');
    actionsBar.className = 'msg-actions';

    // 📄 コピー
    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.title = T('webview.msg.copy') || 'Copy';
    copyBtn.textContent = '📄';
    copyBtn.onclick = () => {
      navigator.clipboard?.writeText(entry.content).catch(() => {});
      copyBtn.textContent = '✅';
      setTimeout(() => { copyBtn.textContent = '📄'; }, 1200);
    };
    actionsBar.appendChild(copyBtn);

    // 📢 読み上げ (TTS)
    const speakBtn = document.createElement('button');
    speakBtn.className = 'msg-action-btn';
    speakBtn.title = T('webview.msg.speak') || 'Speak';
    speakBtn.textContent = '📢';
    speakBtn.onclick = () => speakEntryText(entry);
    actionsBar.appendChild(speakBtn);

    // 🎨 画像生成
    const genImgBtn = document.createElement('button');
    genImgBtn.className = 'msg-action-btn';
    genImgBtn.title = T('webview.msg.genImage') || 'Generate Image';
    genImgBtn.textContent = '🎨';
    genImgBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: entry.imagePrompt || entry.content.substring(0, 300),
        mode: 'illustrious',
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested'));
    };
    actionsBar.appendChild(genImgBtn);

    // 🚩 チェックポイント
    const cpBtn = document.createElement('button');
    cpBtn.className = 'msg-action-btn';
    cpBtn.title = T('webview.msg.checkpoint') || 'Save Checkpoint';
    cpBtn.textContent = '🚩';
    cpBtn.onclick = () => vscode.postMessage({ type: 'saveCheckpoint', label: `Turn-${entry.id}` });
    actionsBar.appendChild(cpBtn);

    // 👁️ プロンプト除外トグル
    const excludeBtn = document.createElement('button');
    excludeBtn.className = 'msg-action-btn' + (entry.excludedFromPrompt ? ' active' : '');
    excludeBtn.dataset.action = 'exclude';
    excludeBtn.title = T('webview.msg.exclude') || 'Toggle prompt exclusion';
    excludeBtn.textContent = '👁️';
    excludeBtn.onclick = () => vscode.postMessage({ type: 'toggleExcludeEntry', id: entry.id });
    actionsBar.appendChild(excludeBtn);

    // 🔱 巻き戻し（このターンまで戻る・簡易版）
    const branchBtn = document.createElement('button');
    branchBtn.className = 'msg-action-btn';
    branchBtn.title = T('webview.msg.rewind') || 'Rewind to this turn';
    branchBtn.textContent = '🔱';
    branchBtn.onclick = () => {
      // Confirmation happens extension-side (native modal); webview confirm()
      // is silently blocked by the VS Code webview iframe sandbox.
      vscode.postMessage({ type: 'branchFromEntry', entryId: entry.id });
    };
    actionsBar.appendChild(branchBtn);

    // ⎇ Gitブランチ（このターンから別世界線を作る）
    const gitBranchBtn = document.createElement('button');
    gitBranchBtn.className = 'msg-action-btn';
    gitBranchBtn.title = T('webview.msg.gitBranch') || 'Create alternate timeline (Git Branch) from this turn';
    gitBranchBtn.textContent = '⎇';
    gitBranchBtn.onclick = () => {
      // Confirmation happens extension-side (native modal); webview confirm()
      // is silently blocked by the VS Code webview iframe sandbox.
      vscode.postMessage({ type: 'branchTimeline', turnId: entry.id });
    };
    actionsBar.appendChild(gitBranchBtn);

    // ✏️ 編集
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn';
    editBtn.title = T('webview.msg.edit') || 'Edit';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => startInlineEdit(div, entry, editBtn);
    actionsBar.appendChild(editBtn);

    div.appendChild(actionsBar);
  }

  // 画像があれば表示 (セキュリティのためcreateElementを使用)
  if (entry.image) {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'scene-img-container';
    
    const imgEl = document.createElement('img');
    imgEl.className = 'scene-img';
    imgEl.src = entry.image;
    imgEl.alt = 'Scene';
    imgEl.dataset.msgId = entry.id;
    imgContainer.appendChild(imgEl);

    // プロンプト編集・再生成UI
    const promptEditor = document.createElement('div');
    promptEditor.className = 'image-prompt-editor';

    const label = document.createElement('div');
    label.className = 'prompt-label';
    label.textContent = T('webview.image.promptLabel');
    promptEditor.appendChild(label);

    const textarea = document.createElement('textarea');
    textarea.className = 'prompt-textarea';
    textarea.placeholder = T('webview.image.promptPlaceholder');
    textarea.value = entry.imagePrompt || '';
    promptEditor.appendChild(textarea);

    const editorActions = document.createElement('div');
    editorActions.className = 'image-editor-actions';

    // 🗯️ 画像にツッコむ: 本文と画像が食い違っている時、定型文を入力欄に差し込んでGMに指摘できるようにする
    const flagBtn = document.createElement('button');
    flagBtn.className = 'regen-img-btn image-flag-btn';
    flagBtn.innerHTML = `🗯️ ${T('webview.image.flagMismatchBtn')}`;
    flagBtn.title = T('webview.image.flagMismatchTitle');
    flagBtn.onclick = () => {
      if (freeInput) {
        freeInput.value = T('webview.image.flagMismatchTemplate');
        autoGrowFreeInput();
        freeInput.focus();
        if (typeof freeInput.setSelectionRange === 'function') {
          const end = freeInput.value.length;
          freeInput.setSelectionRange(end, end);
        }
      }
    };
    editorActions.appendChild(flagBtn);

    const regenBtn = document.createElement('button');
    regenBtn.className = 'regen-img-btn';
    regenBtn.innerHTML = `🔄 ${T('webview.image.regenerateBtn')}`;
    regenBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: textarea.value.trim(),
        mode: 'illustrious', // TODO: 汎用化できるならする
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested') || 'Requested image generation...');
    };
    editorActions.appendChild(regenBtn);

    promptEditor.appendChild(editorActions);
    imgContainer.appendChild(promptEditor);

    div.appendChild(imgContainer);
  } else if (entry.imageBlocked) {
    const ph = document.createElement('div');
    ph.className = 'scene-img-placeholder';
    ph.textContent = T('webview.image.blocked');
    div.appendChild(ph);
  } else if (entry.role === 'gm') {
    // 画像がないGMターンでの手動生成ボタン
    const manualGenBtn = document.createElement('button');
    manualGenBtn.className = 'manual-gen-btn glass-btn';
    manualGenBtn.textContent = T('webview.image.manualGenBtn');
    manualGenBtn.onclick = () => {
      vscode.postMessage({
        type: 'generateImage',
        prompt: entry.imagePrompt || entry.content.substring(0, 300),
        mode: 'illustrious',
        entryId: entry.id
      });
      addSystemMessage(T('webview.image.requested') || 'Requested image generation...');
    };
    div.appendChild(manualGenBtn);
  }

  chatLog.appendChild(div);
  updateStartHubVisibility();
}

function renderAllMessages() {
  chatLog.innerHTML = '';
  for (const m of messageHistory) {
    renderMessage(m);
  }
}

function addSystemMessage(text) {
  const entry = { id: `sys-${Date.now()}`, role: 'system', content: text, sender: T('webview.sender.system') };
  messageHistory.push(entry);
  renderMessage(entry);
  saveState();
}

// ===== ステータス更新 =====
function updateStatus(status) {
  const statusContent = document.getElementById('status-content');
  if (!status) {
    if (statusContent) statusContent.style.display = 'none';
    return;
  }
  if (statusContent) statusContent.style.display = '';

  // Location
  const locRow = document.getElementById('status-row-location');
  if (status.location) {
    document.getElementById('status-location').textContent = status.location;
    if (locRow) locRow.style.display = '';
  } else {
    if (locRow) locRow.style.display = 'none';
  }

  // Time
  const timeRow = document.getElementById('status-row-time');
  if (status.time) {
    document.getElementById('status-time').textContent = status.time;
    if (timeRow) timeRow.style.display = '';
  } else {
    if (timeRow) timeRow.style.display = 'none';
  }

  // Funds
  const fundsRow = document.getElementById('status-row-funds');
  if (status.funds) {
    document.getElementById('status-funds').textContent = status.funds;
    if (fundsRow) fundsRow.style.display = '';
  } else {
    if (fundsRow) fundsRow.style.display = 'none';
  }

  // Dynamic Resources (HP, MP, Sanity, Shields, etc.)
  const dynamicContainer = document.getElementById('dynamic-resources-container');
  if (dynamicContainer) {
    dynamicContainer.innerHTML = '';
    
    // Default icons/colors mapping
    const resourceMeta = {
      hp: { icon: '❤️', label: 'HP', class: 'hp' },
      mp: { icon: '🔷', label: 'MP', class: 'mp' },
      sanity: { icon: '🧠', label: 'Sanity', class: 'sanity' },
      stamina: { icon: '⚡', label: 'Stamina', class: 'stamina' },
      shield: { icon: '🛡️', label: 'Shield', class: 'shield' }
    };

    let renderedCount = 0;
    for (const [key, value] of Object.entries(status)) {
      if (value && typeof value === 'object' && 'current' in value && 'max' in value) {
        // キー名のバリデーション（安全な英数字のみ）
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          console.warn(`[game-state] Ignored dynamic resource with suspicious key: ${key}`);
          continue;
        }

        // 描画上限チェック
        if (++renderedCount > 10) {
          console.warn(`[game-state] Dynamic resource count exceeded limit (max 10). Omitted: ${key}`);
          break;
        }

        const current = Number(value.current) || 0;
        const max = Number(value.max) || 1;
        const pct = Math.max(0, Math.min(100, (current / max) * 100));
        
        const meta = resourceMeta[key.toLowerCase()] || { 
          icon: '📊', 
          label: key.toUpperCase(), 
          class: 'generic-resource' 
        };

        const block = document.createElement('div');
        block.className = 'status-block';
        block.id = `status-block-${key}`;
        
        block.innerHTML = `
          <div class="status-row">
            <span class="status-label">${meta.icon} ${escapeHtml(meta.label)}</span>
          </div>
          <div class="resource-bar-container">
            <div id="status-${key}-bar" class="resource-bar-fill ${meta.class}" style="width: ${pct}%;"></div>
            <div id="status-${key}-text" class="resource-text">${current} / ${max}</div>
          </div>
        `;
        dynamicContainer.appendChild(block);
        
      } else if (typeof value === 'number' && key !== 'funds') {
        // affection や reputation のような単一の数値 (0-100を想定) の場合
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
        if (++renderedCount > 15) break;

        const current = Math.max(0, Math.min(100, Number(value)));
        const meta = resourceMeta[key.toLowerCase()] || { 
          icon: '💖', 
          label: key.charAt(0).toUpperCase() + key.slice(1), 
          class: 'affection' 
        };

        const block = document.createElement('div');
        block.className = 'status-block';
        block.id = `status-block-${key}`;
        
        block.innerHTML = `
          <div class="status-row">
            <span class="status-label">${meta.icon} ${escapeHtml(meta.label)}</span>
          </div>
          <div class="resource-bar-container">
            <div id="status-${key}-bar" class="resource-bar-fill ${meta.class}" style="width: ${current}%;"></div>
            <div id="status-${key}-text" class="resource-text">${current} / 100</div>
          </div>
        `;
        dynamicContainer.appendChild(block);
      }
    }
  }

  // リスト（タグ）の更新ヘルパー
  const renderList = (elementId, items) => {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    if (!items || !Array.isArray(items) || items.length === 0) {
      container.innerHTML = `<span class="tag-item empty-tag" style="color:var(--text-dim);">${escapeHtml(T('webview.empty'))}</span>`;
      return;
    }
    items.forEach(item => {
      const span = document.createElement('span');
      span.className = 'tag-item';
      span.textContent = item;
      container.appendChild(span);
    });
  };

  // 後方互換: 旧形式の文字列 condition も配列として扱う
  const condBlock = document.getElementById('status-block-condition');
  if (status.hasOwnProperty('condition') && status.condition !== null && status.condition !== undefined) {
    const conditions = Array.isArray(status.condition)
      ? status.condition
      : (status.condition ? [String(status.condition)] : []);
    renderList('status-condition-list', conditions);
    if (condBlock) condBlock.style.display = '';
  } else {
    if (condBlock) condBlock.style.display = 'none';
  }

  // Inventory
  const invBlock = document.getElementById('status-block-inventory');
  if (status.inventory && Array.isArray(status.inventory)) {
    renderList('status-inventory-list', status.inventory);
    if (invBlock) invBlock.style.display = '';
  } else {
    if (invBlock) invBlock.style.display = 'none';
  }

  // Skills
  const skillBlock = document.getElementById('status-block-skills');
  if (status.skills && Array.isArray(status.skills)) {
    renderList('status-skills-list', status.skills);
    if (skillBlock) skillBlock.style.display = '';
  } else {
    if (skillBlock) skillBlock.style.display = 'none';
  }
}

function isInputLocked() {
  return gameOverActive || !!document.getElementById('gm-loading');
}

function setInputLocked(locked) {
  const els = [freeInput, sendBtn, imgBtn, micBtn, undoBtn, document.getElementById('regen-btn')];
  els.forEach((el) => { if (el) el.disabled = locked; });
  document.querySelectorAll('.option-btn').forEach((btn) => { btn.disabled = locked; });
  document.querySelectorAll('.qr-btn').forEach((btn) => { btn.disabled = locked; });
}

function setGameOverOverlay(gameOver) {
  const overlay = document.getElementById('game-over-overlay');
  const titleEl = document.getElementById('game-over-title');
  const msgEl = document.getElementById('game-over-message');
  if (!overlay || !titleEl || !msgEl) return;
  gameOverActive = !!(gameOver && gameOver.active);
  if (!gameOverActive) {
    overlay.classList.add('hidden');
    setInputLocked(false);
    return;
  }
  const victory = !!gameOver.victory;
  titleEl.textContent = victory ? T('webview.gameOver.victory') : T('webview.gameOver.defeat');
  msgEl.textContent = gameOver.message || titleEl.textContent;
  const card = overlay.querySelector('.game-over-card');
  if (card) {
    card.classList.toggle('victory', victory);
    card.classList.toggle('defeat', !victory);
  }
  overlay.classList.remove('hidden');
  setInputLocked(true);
  window.speechSynthesis?.cancel();
}

// ===== 選択肢ボタン =====
function renderOptions(options) {
  optionsBar.innerHTML = '';
  if (isInputLocked()) return;
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    const displayText = `${i + 1}. ${opt}`;
    btn.textContent = displayText;
    btn.addEventListener('click', () => {
      if (isInputLocked() || btn.disabled) return;
      window.speechSynthesis?.cancel();

      const entryId = `user-${Date.now()}`;
      // Share this id with the extension so the persisted entry it later sends back
      // in gameStateUpdate matches this optimistic one instead of rendering a duplicate.
      vscode.postMessage({
        type: 'selectOption',
        text: opt,
        optionIndex: i,
        authorsNote: getAuthorsNote(),
        entryId
      });
      clearAuthorsNote();
      // UIにもPlayerメッセージとして追加
      const entry = { id: entryId, role: 'user', content: displayText, sender: T('webview.sender.player') };
      messageHistory.push(entry);
      renderMessage(entry);
      optionsBar.innerHTML = '';
      scrollToBottom();
      saveState();
      // Lock immediately, client-side -- don't wait for the extension's
      // 'gmStart' round trip, or a fast second click before it arrives can resend.
      showGmLoading();
    });
    optionsBar.appendChild(btn);
  });
}

// ===== ギャラリー =====
/**
 * Add or update a gallery entry.
 * @param {string} src - WebviewURI of the image (used as unique key)
 * @param {{ rawPath?: string, prompt?: string, locationId?: string, worldTurn?: number, description?: string }} [meta]
 */
function addImageToGallery(src, meta) {
  const idx = galleryImages.findIndex(e =>
    e.src === src ||
    (meta?.rawPath && e.rawPath && imagePathsLooselyMatch(e.rawPath, meta.rawPath))
  );
  if (idx >= 0) {
    // Merge new metadata into existing entry (never overwrite description with undefined)
    const existing = galleryImages[idx];
    if (meta) {
      galleryImages[idx] = {
        ...existing,
        ...(meta.rawPath !== undefined && { rawPath: meta.rawPath }),
        ...(meta.prompt !== undefined && { prompt: meta.prompt }),
        ...(meta.locationId !== undefined && { locationId: meta.locationId }),
        ...(meta.worldTurn !== undefined && { worldTurn: meta.worldTurn }),
        ...(meta.description !== undefined && { description: meta.description }),
      };
    }
    renderGallery();
    return;
  }
  galleryImages.push({
    src,
    rawPath: meta?.rawPath,
    prompt: meta?.prompt,
    locationId: meta?.locationId,
    worldTurn: meta?.worldTurn,
    description: meta?.description,
  });
  renderGallery();
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  if (!gallery) return;
  gallery.innerHTML = '';

  for (const entry of galleryImages) {
    const item = document.createElement('div');
    item.className = 'gallery-item';

    // Thumbnail
    const thumb = document.createElement('img');
    thumb.className = 'gallery-thumb';
    thumb.src = entry.src;
    if (entry.description) {
      thumb.title = entry.description;
    }
    thumb.addEventListener('click', () => {
      const msgWithImg = messageHistory.find(m => m.image === entry.src);
      if (msgWithImg) {
        const el = document.getElementById(`msg-${msgWithImg.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    item.appendChild(thumb);

    // Metadata badges (overlaid on top of image)
    const badgeRow = document.createElement('div');
    badgeRow.className = 'gallery-badge-row';
    if (entry.locationId) {
      const locBadge = document.createElement('span');
      locBadge.className = 'gallery-badge gallery-location';
      locBadge.textContent = '📍 ' + entry.locationId;
      badgeRow.appendChild(locBadge);
    }
    if (entry.worldTurn !== undefined) {
      const turnBadge = document.createElement('span');
      turnBadge.className = 'gallery-badge gallery-turn';
      turnBadge.textContent = 'T' + entry.worldTurn;
      badgeRow.appendChild(turnBadge);
    }
    if (entry.description) {
      const analyzedBadge = document.createElement('span');
      analyzedBadge.className = 'gallery-badge gallery-analyzed';
      analyzedBadge.textContent = '👁 Analyzed';
      badgeRow.appendChild(analyzedBadge);
    }
    if (badgeRow.childElementCount > 0) {
      item.appendChild(badgeRow);
    }

    // Action row: "Analyze" button or analyzed indicator
    if (entry.rawPath) {
      const actionRow = document.createElement('div');
      actionRow.className = 'gallery-action-row';

      const btn = document.createElement('button');
      btn.className = 'gallery-analyze-btn' + (entry.description ? ' analyzed' : '');
      btn.textContent = entry.description ? '👁 Analyzed' : '👁 Analyze';
      if (!entry.description) {
        btn.addEventListener('click', () => {
          btn.disabled = true;
          btn.textContent = '⏳ Analyzing…';
          btn.dataset.analyzingPath = entry.rawPath;
          vscode.postMessage({ type: 'requestVlmAnalysis', imagePath: entry.rawPath });
        });
      }
      actionRow.appendChild(btn);
      item.appendChild(actionRow);
    }

    gallery.appendChild(item);
  }
}

// ===== テーマ切り替え =====
function setSceneBackground(uri) {
  if (!bgLayer || !uri) return;
  bgLayer.style.backgroundImage = `url("${uri}")`;
  bgLayer.className = 'has-scene-bg';
}

function setSceneSprite(sprite) {
  if (!spriteLayer) return;
  spriteLayer.classList.remove('visible', 'pos-left', 'pos-right', 'pos-center');
  spriteLayer.innerHTML = '';
  
  let imgPath = '';
  if (typeof sprite === 'string') {
    imgPath = sprite;
  } else if (sprite && sprite.name) {
    const char = window.currentCharacters?.find(c => c.name === sprite.name);
    if (char) {
      if (sprite.expression && char.expressions && char.expressions[sprite.expression]) {
        imgPath = char.expressions[sprite.expression];
      } else {
        imgPath = char.portrait || sprite.image || '';
      }
    } else {
      imgPath = sprite.image || '';
    }
  } else {
    imgPath = sprite?.image || '';
  }

  if (!imgPath) return;
  const img = document.createElement('img');
  img.src = imgPath;
  img.alt = (typeof sprite === 'object' && sprite?.name) ? sprite.name : 'Character';
  spriteLayer.appendChild(img);
  const pos = (typeof sprite === 'object' && sprite?.position) ? sprite.position : 'center';
  if (pos === 'left') spriteLayer.classList.add('pos-left');
  else if (pos === 'right') spriteLayer.classList.add('pos-right');
  else spriteLayer.classList.add('pos-center');
  spriteLayer.classList.add('visible');
}

function setTheme(theme) {
  currentTheme = theme;
  if (!bgLayer.style.backgroundImage) {
    bgLayer.className = `theme-${theme}`;
  }
  // UIアクセント配色（97-visual-refresh.css の data-ui-theme パレット）は
  // 背景画像の有無に関係なく常に切り替える
  document.body.setAttribute('data-ui-theme', theme);
  // ボタンのアクティブ状態を更新
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  saveState();
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});

/* --- 20-input-audio-prep.js --- */
// ===== 自由入力 =====
sendBtn.addEventListener('click', sendFreeInput);
freeInput.addEventListener('keydown', (e) => {
  // Ctrl/Cmd+Enter sends; plain Enter (and Shift+Enter) inserts a newline instead --
  // avoids accidentally sending on a plain Enter meant to start a new line.
  // The Send button next to the field still sends on a single click either way.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendFreeInput();
  }
});
freeInput.addEventListener('input', autoGrowFreeInput);

const undoBtn = document.getElementById('undo-btn');
if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    window.speechSynthesis?.cancel();
    vscode.postMessage({ type: 'undoLastTurn' });
  });
}

const regenBtn = document.getElementById('regen-btn');
if (regenBtn) {
  regenBtn.addEventListener('click', () => {
    if (isInputLocked()) return;
    window.speechSynthesis?.cancel();
    vscode.postMessage({ type: 'regenerateLastTurn' });
  });
}

const checkpointSaveBtn = document.getElementById('checkpoint-save-btn');
if (checkpointSaveBtn) {
  checkpointSaveBtn.addEventListener('click', () => {
    // Label input happens extension-side (native input box); webview prompt()
    // is silently blocked by the VS Code webview iframe sandbox.
    vscode.postMessage({ type: 'saveCheckpoint' });
  });
}

const rewindBtn = document.getElementById('rewind-btn');
const rewindSelect = document.getElementById('rewind-select');
if (rewindBtn && rewindSelect) {
  rewindBtn.addEventListener('click', () => {
    const entryId = rewindSelect.value;
    if (!entryId) return;
    window.speechSynthesis?.cancel();
    // Confirmation happens extension-side (native modal); webview confirm()
    // is silently blocked by the VS Code webview iframe sandbox.
    vscode.postMessage({ type: 'restoreToTurn', entryId });
  });
}

function renderCheckpointUi() {
  const list = document.getElementById('checkpoint-list');
  const empty = document.getElementById('checkpoint-empty');
  const select = document.getElementById('rewind-select');
  if (!list || !empty || !select) return;

  list.innerHTML = '';
  if (checkpointMetas.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    for (const cp of checkpointMetas) {
      const li = document.createElement('li');
      li.className = 'checkpoint-item';
      const label = document.createElement('span');
      label.className = 'checkpoint-label';
      label.textContent = `${cp.label} — ${cp.turnLabel}`;
      const restoreBtn = document.createElement('button');
      restoreBtn.textContent = T('webview.checkpoint.restore');
      restoreBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'restoreCheckpoint', checkpointId: cp.id });
      });
      const delBtn = document.createElement('button');
      delBtn.textContent = T('webview.checkpoint.delete');
      delBtn.className = 'checkpoint-delete';
      delBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'deleteCheckpoint', checkpointId: cp.id });
      });
      li.appendChild(label);
      li.appendChild(restoreBtn);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  const current = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = T('webview.checkpoint.rewind');
  select.appendChild(placeholder);
  for (const t of rewindTargets) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.label;
    select.appendChild(opt);
  }
  if (current && [...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

// ===== 音声入力 (STT) — DREAMIO 参考 =====
const micBtn = document.getElementById('mic-btn');
let speechRecognition = null;
let isListening = false;

function getSpeechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSttLocale() {
  const map = {
    ja: 'ja-JP',
    en: 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  return map[currentLocale] || 'en-US';
}

function stopListening() {
  if (speechRecognition && isListening) {
    try { speechRecognition.stop(); } catch { /* ignore */ }
  }
  isListening = false;
  if (micBtn) {
    micBtn.classList.remove('listening');
    micBtn.title = T('webview.stt.title');
  }
}

function startListening() {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    addSystemMessage(T('webview.stt.unsupported'));
    return;
  }
  if (isListening) {
    stopListening();
    return;
  }

  window.speechSynthesis?.cancel();
  speechRecognition = new Ctor();
  speechRecognition.lang = getSttLocale();
  speechRecognition.interimResults = true;
  speechRecognition.continuous = false;
  speechRecognition.maxAlternatives = 1;

  speechRecognition.onstart = () => {
    isListening = true;
    if (micBtn) {
      micBtn.classList.add('listening');
      micBtn.title = T('webview.stt.listening');
    }
    if (freeInput) {
      freeInput.placeholder = T('webview.stt.listening');
    }
  };

  speechRecognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    if (freeInput) {
      freeInput.value = transcript.trim();
      autoGrowFreeInput();
    }
    const last = event.results[event.results.length - 1];
    if (last?.isFinal && transcript.trim()) {
      stopListening();
      sendFreeInput();
    }
  };

  speechRecognition.onerror = (event) => {
    stopListening();
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      addSystemMessage(`${T('webview.stt.error')}: ${event.error}`);
    }
  };

  speechRecognition.onend = () => {
    isListening = false;
    if (micBtn) {
      micBtn.classList.remove('listening');
      micBtn.title = T('webview.stt.title');
    }
    if (freeInput) {
      freeInput.placeholder = T('webview.input.placeholder');
    }
  };

  try {
    speechRecognition.start();
  } catch {
    stopListening();
    addSystemMessage(T('webview.stt.unsupported'));
  }
}

if (micBtn) {
  micBtn.addEventListener('click', startListening);
}

function getAuthorsNote() {
  const el = document.getElementById('authors-note-input');
  return el ? el.value.trim() : '';
}

function clearAuthorsNote() {
  const el = document.getElementById('authors-note-input');
  if (el) el.value = '';
}

function sendFreeInput() {
  if (isInputLocked() || sendBtn.disabled) return;
  stopListening();
  const text = freeInput.value.trim();
  if (!text) return;
  window.speechSynthesis?.cancel();
  const entryId = `user-${Date.now()}`;
  // Share this id with the extension so the persisted entry it later sends back
  // in gameStateUpdate matches this optimistic one instead of rendering a duplicate.
  vscode.postMessage({ type: 'freeInput', text, authorsNote: getAuthorsNote(), entryId });
  clearAuthorsNote();
  const entry = { id: entryId, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  freeInput.value = '';
  autoGrowFreeInput();
  scrollToBottom();
  saveState();
  // Lock immediately, client-side -- don't wait for the extension's 'gmStart'
  // round trip, or a fast second Enter/click before it arrives can resend.
  showGmLoading();
}

// ===== 画像生成ボタン =====
imgBtn.addEventListener('click', () => {
  const lastGmEntry = [...messageHistory].reverse().find(m => m && m.role === 'gm' && m.id);
  if (!lastGmEntry) {
    addSystemMessage(T('webview.image.noTurn'));
    return;
  }
  const promptSource = lastGmEntry.imagePrompt || lastGmEntry.content || 'current scene';
  const prompt = String(promptSource).trim().slice(0, 300) || 'current scene';
  vscode.postMessage({
    type: 'generateImage',
    prompt,
    mode: 'illustrious',
    entryId: lastGmEntry.id
  });
  addSystemMessage(T('webview.image.requested'));
});

// ===== ユーティリティ =====
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatLog.scrollTop = chatLog.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// キャラ名ごとの色を自動割り当て
const characterColors = {};
const colorPalette = [
  '#7cb3ff', // GM blue
  '#a8d8a8', // Player green
  '#ff9ebc', // NPC pink
  '#ffd700', // gold
  '#c8a8ff', // lavender
  '#ff8c42', // orange
  '#42f5e3', // cyan
  '#f5e642', // yellow
];
let colorIndex = 2; // 0=GM, 1=Player already assigned

function getCharacterColor(name) {
  if (name === 'Game Master' || name === 'GM' || name === T('webview.sender.gm')) return colorPalette[0];
  if (name === 'Player' || name === T('webview.sender.player')) return colorPalette[1];
  if (name === 'System' || name === T('webview.sender.system')) return '#ffd700';
  if (!characterColors[name]) {
    characterColors[name] = colorPalette[colorIndex % colorPalette.length];
    colorIndex++;
  }
  return characterColors[name];
}

function saveState() {
  const draftText = freeInput ? freeInput.value : '';
  const noteEl = document.getElementById('authors-note-input');
  const authorsNoteText = noteEl ? noteEl.value : '';
  vscode.setState({ messageHistory, galleryImages, currentTheme, ttsEnabled, ttsSpeed, ttsVolume, draftText, authorsNoteText });
}

// ===== 画像生成ローディング =====
function showImageLoading() {
  if (document.getElementById('img-loading')) return;
  const div = document.createElement('div');
  div.id = 'img-loading';
  div.className = 'msg system';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.style.color = '#ffd700';
  sender.textContent = T('webview.sender.system');
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = T('webview.image.loading');
  div.appendChild(sender);
  div.appendChild(body);
  chatLog.appendChild(div);
  scrollToBottom();
}

function hideImageLoading(success) {
  const el = document.getElementById('img-loading');
  if (el) el.remove();
  if (success === false) {
    addSystemMessage(T('webview.image.failed'));
  }
}

// ===== GM ターン待ちローディング =====
let gmLoadingTimer = null;
const ANTIGRAVITY_RELAY_TRIGGER_COMMAND = '/text-adventure-gm process pending LoreRelay request';
let relayUiState = 'idle';

function setTurnControlsLocked(locked) {
  freeInput.disabled = locked;
  sendBtn.disabled = locked;
  document.querySelectorAll('.option-btn').forEach(b => { b.disabled = locked; });
  const qrUndoBtn = document.getElementById('qr-undo');
  if (qrUndoBtn) qrUndoBtn.disabled = locked;
  const qrRetryBtn = document.getElementById('qr-retry');
  if (qrRetryBtn) qrRetryBtn.disabled = locked;
  const profileBtn = document.getElementById('experience-profile-btn');
  if (profileBtn) profileBtn.disabled = locked;
  const parlorSettingsBtn = document.getElementById('parlor-settings-btn');
  if (parlorSettingsBtn) parlorSettingsBtn.disabled = locked;
}

function setRelayUiState(state) {
  relayUiState = ['idle', 'pending', 'accepted', 'error'].includes(state) ? state : 'idle';
  if (document.body && typeof document.body.setAttribute === 'function') {
    document.body.setAttribute('data-relay-state', relayUiState);
  }
  const relayEnabled = !!window.antigravityRelayMode;
  const sBtn = document.getElementById('send-btn');
  if (sBtn) {
    if (!relayEnabled) {
      sBtn.textContent = T('webview.button.send');
    } else if (relayUiState === 'pending') {
      sBtn.textContent = T('webview.relay.state.pending');
    } else if (relayUiState === 'error') {
      sBtn.textContent = T('webview.relay.state.error');
    } else {
      sBtn.textContent = T('webview.relay.button.prepare');
    }
  }
  const banner = document.getElementById('relay-mode-banner');
  if (banner) {
    let status = banner.querySelector ? banner.querySelector('[data-relay-status]') : null;
    if (!status && typeof document.createElement === 'function') {
      status = document.createElement('div');
      status.setAttribute('data-relay-status', 'true');
      status.className = 'relay-mode-status';
      banner.appendChild(status);
    }
    if (status) {
      status.textContent = relayEnabled
        ? T(`webview.relay.state.${relayUiState}`)
        : T('webview.relay.toggle.off');
    }
  }
}

function showGmLoading() {
  if (document.getElementById('gm-loading')) { return; }
  const div = document.createElement('div');
  div.id = 'gm-loading';
  div.className = 'msg gm';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.style.color = '#7cb3ff';
  sender.textContent = T('webview.sender.gm');
  const body = document.createElement('div');
  body.className = 'msg-body';
  const label = document.createElement('span');
  label.textContent = T('webview.gm.loading');
  const dots = document.createElement('span');
  dots.className = 'gm-typing-dots';
  for (let i = 0; i < 3; i++) { dots.appendChild(document.createElement('span')); }
  const elapsedEl = document.createElement('span');
  elapsedEl.className = 'gm-loading-elapsed';
  body.appendChild(label);
  body.appendChild(dots);
  body.appendChild(elapsedEl);
  div.appendChild(sender);
  div.appendChild(body);
  chatLog.appendChild(div);
  scrollToBottom();
  // 経過秒カウンタ（3秒を超えたら表示、長考時の生存感）
  const startedAt = Date.now();
  if (gmLoadingTimer) { clearInterval(gmLoadingTimer); }
  gmLoadingTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - startedAt) / 1000);
    if (sec >= 3) { elapsedEl.textContent = `${sec}s`; }
  }, 1000);
  // 入力をロック（二重送信防止）
  setTurnControlsLocked(true);
}

function showRelayWaitingState() {
  let div = document.getElementById('gm-loading');
  if (!div) {
    div = document.createElement('div');
    div.id = 'gm-loading';
    chatLog.appendChild(div);
  }
  if (gmLoadingTimer) { clearInterval(gmLoadingTimer); gmLoadingTimer = null; }
  div.id = 'gm-loading';
  div.className = 'msg gm relay-waiting';
  div.innerHTML = '';
  const sender = document.createElement('div');
  sender.className = 'msg-sender';
  sender.style.color = 'var(--vscode-charts-yellow, #ffcc00)';
  sender.textContent = typeof T === 'function' && T('webview.relay.sender.name') ? T('webview.relay.sender.name') : 'Relay Mode';
  const body = document.createElement('div');
  body.className = 'msg-body';
  const label = document.createElement('span');
  label.textContent = typeof T === 'function' && T('webview.relay.waiting.label') ? T('webview.relay.waiting.label') : 'Waiting for Antigravity... Send the short trigger on the right.';
  const trigger = document.createElement('code');
  trigger.className = 'relay-trigger-command';
  trigger.textContent = ANTIGRAVITY_RELAY_TRIGGER_COMMAND;
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'glass-btn relay-trigger-copy-btn';
  copyBtn.textContent = T('webview.relay.copyTrigger');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(ANTIGRAVITY_RELAY_TRIGGER_COMMAND).then(() => {
      copyBtn.textContent = T('webview.relay.copyTriggerCopied');
      setTimeout(() => { copyBtn.textContent = T('webview.relay.copyTrigger'); }, 1400);
    }).catch(() => {});
  });
  body.appendChild(label);
  body.appendChild(document.createElement('br'));
  body.appendChild(trigger);
  body.appendChild(document.createElement('br'));
  body.appendChild(copyBtn);
  div.appendChild(sender);
  div.appendChild(body);
  scrollToBottom();

  setRelayUiState('pending');
  setTurnControlsLocked(true);
}

function hideGmLoading(success) {
  const el = document.getElementById('gm-loading');
  if (el) { el.remove(); }
  if (gmLoadingTimer) { clearInterval(gmLoadingTimer); gmLoadingTimer = null; }
  setTurnControlsLocked(false);
  if (success !== false && window.antigravityRelayMode) {
    setRelayUiState('idle');
  }
  if (success === false) {
    addSystemMessage(T('webview.gm.failed'));
  }
}

function showRelayWaitingError(reason) {
  hideGmLoading(true);
  setRelayUiState('error');
  const detail = typeof reason === 'string' && reason.trim() ? reason.trim() : '';
  const prefix = typeof T === 'function' ? T('webview.relay.error.prefix') : 'Antigravity Relay could not import the result.';
  addSystemMessage(detail ? `${prefix} ${detail}` : prefix);
}

/* --- 30-bgm-sfx.js --- */
// ===== BGM プレイヤー =====
// マニフェスト（extension が bgm.json を解決して webview URI 付きで送ってくる）
// 各 track: { id, uri, mood, description, loop, volume }
let bgmTracks = [];
let bgmCurrentId = null;
let bgmEnabled = true;
let bgmUserMuted = false;
let bgmBaseVolume = 0.5; // 0..1 ユーザー音量
let bgmAudioReady = false; // ユーザー操作で自動再生が解禁されたか

const bgmNowEl = document.getElementById('bgm-now');
const bgmListEl = document.getElementById('bgm-list');
const bgmEmptyEl = document.getElementById('bgm-empty');
const bgmToggleBtn = document.getElementById('bgm-toggle');
const bgmVolumeEl = document.getElementById('bgm-volume');
const bgmMuteBtn = document.getElementById('bgm-mute');

// 2つの audio 要素でクロスフェード
const bgmAudioA = new Audio();
const bgmAudioB = new Audio();
let bgmActive = bgmAudioA;
let bgmIdle = bgmAudioB;
[bgmAudioA, bgmAudioB].forEach(a => { a.preload = 'auto'; });

function setBgmManifest(tracks, defaultVolume, enabled) {
  bgmTracks = Array.isArray(tracks) ? tracks : [];
  if (typeof defaultVolume === 'number') {
    bgmBaseVolume = Math.min(1, Math.max(0, defaultVolume / 100));
    bgmVolumeEl.value = String(Math.round(bgmBaseVolume * 100));
  }
  if (typeof enabled === 'boolean') bgmEnabled = enabled;
  renderBgmList();
}

function renderBgmList() {
  bgmListEl.innerHTML = '';
  if (!bgmTracks.length) {
    bgmEmptyEl.style.display = 'block';
    bgmNowEl.textContent = '♪ ---';
    return;
  }
  bgmEmptyEl.style.display = 'none';
  for (const t of bgmTracks) {
    const item = document.createElement('button');
    item.className = 'bgm-item' + (t.id === bgmCurrentId ? ' active' : '');
    item.textContent = t.id;
    if (t.description) item.title = t.description;
    item.addEventListener('click', () => {
      bgmAudioReady = true; // ユーザー操作
      playBgmById(t.id);
    });
    bgmListEl.appendChild(item);
  }
}

function findTrack(id) {
  return bgmTracks.find(t => t.id === id);
}

function playBgmByMood(mood) {
  if (!mood) return;
  const m = String(mood).toLowerCase();
  // mood フィールドが一致するトラックを探す（カンマ区切り複数対応）
  const match = bgmTracks.find(t => {
    if (!t.mood) return false;
    return String(t.mood).toLowerCase().split(',').map(s => s.trim()).includes(m);
  });
  if (match) playBgmById(match.id);
}

function playBgmById(id) {
  if (!bgmEnabled) return;
  const track = findTrack(id);
  if (!track || !track.uri) return;
  if (id === bgmCurrentId && !bgmActive.paused) return; // 既に再生中

  bgmCurrentId = id;
  bgmNowEl.textContent = '♪ ' + id;
  renderBgmList();

  // 自動再生がまだ解禁されていない場合は「曲名だけ表示」して待機
  if (!bgmAudioReady) {
    bgmNowEl.textContent = '♪ ' + id + T('webview.bgm.clickToPlay');
    return;
  }

  crossfadeTo(track);
}

function effectiveVolume(track) {
  const trackVol = (track && typeof track.volume === 'number') ? Math.min(1, Math.max(0, track.volume)) : 1;
  return bgmUserMuted ? 0 : bgmBaseVolume * trackVol;
}

function crossfadeTo(track) {
  const target = effectiveVolume(track);

  // idle 側に新トラックをロードして再生
  bgmIdle.src = track.uri;
  bgmIdle.loop = track.loop !== false; // 既定 loop:true
  bgmIdle.volume = 0;
  const playPromise = bgmIdle.play();
  if (playPromise && playPromise.catch) {
    playPromise.catch(() => { /* 自動再生ブロック時は無視 */ });
  }
  bgmToggleBtn.textContent = '⏸';

  const fadeMs = 1200;
  const steps = 24;
  const fadingOut = bgmActive;
  const fadingIn = bgmIdle;
  const startOutVol = fadingOut.volume;
  let i = 0;
  const timer = setInterval(() => {
    i++;
    const r = i / steps;
    fadingIn.volume = Math.min(target, target * r);
    fadingOut.volume = Math.max(0, startOutVol * (1 - r));
    if (i >= steps) {
      clearInterval(timer);
      fadingOut.pause();
      // active/idle を入れ替え
      const tmp = bgmActive; bgmActive = bgmIdle; bgmIdle = tmp;
    }
  }, fadeMs / steps);
}

function applyBgmVolume() {
  const track = findTrack(bgmCurrentId);
  bgmActive.volume = effectiveVolume(track);
}

// UI: 再生/一時停止トグル
bgmToggleBtn.addEventListener('click', () => {
  bgmAudioReady = true;
  if (bgmActive.paused) {
    if (!bgmActive.src && bgmCurrentId) {
      playBgmById(bgmCurrentId);
    } else if (bgmActive.src) {
      bgmActive.play().catch(() => {});
      bgmToggleBtn.textContent = '⏸';
    } else if (bgmTracks.length) {
      playBgmById(bgmTracks[0].id);
    }
  } else {
    bgmActive.pause();
    bgmToggleBtn.textContent = '▶';
  }
});

[bgmAudioA, bgmAudioB].forEach(a => {
  a.addEventListener('play', () => { if (a === bgmActive) bgmToggleBtn.textContent = '⏸'; });
  a.addEventListener('pause', () => { if (a === bgmActive) bgmToggleBtn.textContent = '▶'; });
});

// UI: 音量スライダー
bgmVolumeEl.addEventListener('input', () => {
  bgmBaseVolume = Math.min(1, Math.max(0, parseInt(bgmVolumeEl.value, 10) / 100));
  applyBgmVolume();
});

// UI: ミュート
bgmMuteBtn.addEventListener('click', () => {
  bgmUserMuted = !bgmUserMuted;
  bgmMuteBtn.textContent = bgmUserMuted ? '🔇' : '🔊';
  applyBgmVolume();
});

// ===== 効果音(SE) =====
// マニフェスト（extension が sfx.json を解決して webview URI 付きで送る）
// 各 sound: { id, uri, description, volume }
let sfxSounds = [];
let sfxEnabled = true;
let sfxMuted = false;
let sfxBaseVolume = 0.7;

const sfxVolumeEl = document.getElementById('sfx-volume');
const sfxMuteBtn = document.getElementById('sfx-mute');

function setSfxManifest(sounds, defaultVolume, enabled) {
  sfxSounds = Array.isArray(sounds) ? sounds : [];
  if (typeof defaultVolume === 'number') {
    sfxBaseVolume = Math.min(1, Math.max(0, defaultVolume / 100));
    if (sfxVolumeEl) sfxVolumeEl.value = String(Math.round(sfxBaseVolume * 100));
  }
  if (typeof enabled === 'boolean') sfxEnabled = enabled;
}

function playSfx(id) {
  if (!sfxEnabled || sfxMuted) return;
  const s = sfxSounds.find(x => x.id === id);
  if (!s || !s.uri) return;
  // ワンショット: 毎回新しい Audio で重ね再生（BGM を止めない）
  const a = new Audio(s.uri);
  const sv = (typeof s.volume === 'number') ? Math.min(1, Math.max(0, s.volume)) : 1;
  a.volume = Math.min(1, Math.max(0, sfxBaseVolume * sv));
  a.play().catch(() => { /* 自動再生ブロック時は無視 */ });
}

// Promise を返す版 — 音が実際に鳴ったかどうか検出できる
async function playSfxAsync(id) {
  if (!sfxEnabled || sfxMuted) return false;
  const s = sfxSounds.find(x => x.id === id);
  if (!s || !s.uri) return false;
  const a = new Audio(s.uri);
  const sv = (typeof s.volume === 'number') ? Math.min(1, Math.max(0, s.volume)) : 1;
  a.volume = Math.min(1, Math.max(0, sfxBaseVolume * sv));
  try { await a.play(); return true; } catch { return false; }
}

if (sfxVolumeEl) {
  sfxVolumeEl.addEventListener('input', () => {
    sfxBaseVolume = Math.min(1, Math.max(0, parseInt(sfxVolumeEl.value, 10) / 100));
  });
}
if (sfxMuteBtn) {
  sfxMuteBtn.addEventListener('click', () => {
    sfxMuted = !sfxMuted;
    sfxMuteBtn.textContent = sfxMuted ? '🔇' : '🔔';
  });
}

/* --- 40-dice-calc-tabs.js --- */
// ===== ダイスローラー =====
const diceResultEl = document.getElementById('dice-result');
const diceLogEl = document.getElementById('dice-log');
const diceSendGmBtn = document.getElementById('dice-send-gm');
let diceHistory = [];
let lastDiceRoll = '';

function rollDice(count, sides, skipSound = false) {
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides) + 1);
  }
  const total = results.reduce((a, b) => a + b, 0);
  const label = count === 1 ? `d${sides}` : `${count}d${sides}`;

  // 結果表示（アニメーション風に）
  diceResultEl.textContent = `${total}`;
  diceResultEl.style.transform = 'scale(1.2)';
  setTimeout(() => { diceResultEl.style.transform = 'scale(1)'; }, 150);

  // ログに追加
  const detail = count > 1 ? ` [${results.join(' + ')}]` : '';
  const logText = `${label}: ${total}${detail}`;
  lastDiceRoll = logText;
  if (diceSendGmBtn) diceSendGmBtn.disabled = false;

  diceHistory.unshift(logText);
  if (diceHistory.length > 5) diceHistory.pop();
  diceLogEl.textContent = diceHistory.join(' | ');

  // ゲームログにも通知
  addSystemMessage(`${T('webview.dice.logPrefix')} ${logText}`);

  // ダイスSEを再生（あれば）
  if (!skipSound) { playSfx('dice'); }
}

// GM からのダイス要求を処理 — 自動ロールし音の成否でフォールバックを判定
async function handleDiceRequest(req) {
  const notation = (req.notation || '').trim();
  const purposeText = req.purpose ? `（${req.purpose}）` : '';
  const match = /^(\d+)d(\d+)$/i.exec(notation);

  if (!match) {
    // 形式不明 — 手動ロールを促す
    addSystemMessage(T('webview.dice.requestInvalid', { notation: notation || '?' }) + purposeText);
    return;
  }

  const count = Math.max(1, Math.min(100, parseInt(match[1], 10)));
  const sides = Math.max(2, Math.min(10000, parseInt(match[2], 10)));

  // バナー表示
  addSystemMessage(T('webview.dice.requestBanner', { notation }) + purposeText);

  // 音なしで自動ロール → 別途 playSfxAsync で音を鳴らして成否を検出
  rollDice(count, sides, true);
  const soundOk = await playSfxAsync('dice');

  if (!soundOk) {
    addSystemMessage(T('webview.dice.requestFallback'));
  }
}

function sendDiceResultToGm() {
  if (!lastDiceRoll) return;
  const text = `${T('webview.dice.sendPrefix')} ${lastDiceRoll}`;
  const entryId = `user-${Date.now()}`;
  // Share this id with the extension so the persisted entry it later sends back
  // in gameStateUpdate matches this optimistic one instead of rendering a duplicate.
  vscode.postMessage({ type: 'freeInput', text, entryId });
  const entry = { id: entryId, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  scrollToBottom();
  saveState();
}

if (diceSendGmBtn) {
  diceSendGmBtn.disabled = true;
  diceSendGmBtn.addEventListener('click', sendDiceResultToGm);
}

// プリセットボタン（1d固定）
document.querySelectorAll('.dice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sides = parseInt(btn.dataset.sides, 10);
    rollDice(1, sides);
  });
});

// カスタムロール
document.getElementById('dice-custom-btn').addEventListener('click', () => {
  const count = Math.max(1, Math.min(100, parseInt(document.getElementById('dice-count').value, 10) || 1));
  const sides = Math.max(2, Math.min(10000, parseInt(document.getElementById('dice-sides').value, 10) || 6));
  rollDice(count, sides);
});

// ===== 電卓 =====
const calcResultEl = document.getElementById('calc-result');
const calcHistoryEl = document.getElementById('calc-history');
const calcInput = document.getElementById('calc-input');
let calcHistory = [];

// Function()/eval を使わない安全な再帰下降パーサー
function evaluateMath(str) {
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    if (/\s/.test(str[i])) { i++; continue; }
    if (/[\d.]/.test(str[i])) {
      let num = '';
      while (i < str.length && /[\d.]/.test(str[i])) num += str[i++];
      const n = Number(num);
      if (isNaN(n)) throw new Error('invalid number');
      tokens.push({ t: 'n', v: n });
    } else if (['+', '-', '*', '/', '^', '%', '(', ')'].includes(str[i])) {
      tokens.push({ t: 'o', v: str[i++] });
    } else {
      throw new Error('invalid char: ' + str[i]);
    }
  }
  let pos = 0;
  const peek = () => tokens[pos] || null;
  const consume = () => tokens[pos++];
  function parseExpr() { return parseAddSub(); }
  function parseAddSub() {
    let val = parseMulDiv();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = consume().v;
      const r = parseMulDiv();
      val = op === '+' ? val + r : val - r;
    }
    return val;
  }
  function parseMulDiv() {
    let val = parsePow();
    while (peek() && ['*', '/', '%'].includes(peek().v)) {
      const op = consume().v;
      const r = parsePow();
      val = op === '*' ? val * r : op === '/' ? val / r : val % r;
    }
    return val;
  }
  function parsePow() {
    const val = parseUnary();
    if (peek() && peek().v === '^') { consume(); return Math.pow(val, parsePow()); }
    return val;
  }
  function parseUnary() {
    if (peek() && peek().v === '-') { consume(); return -parseUnary(); }
    if (peek() && peek().v === '+') { consume(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('unexpected end');
    if (t.t === 'n') { consume(); return t.v; }
    if (t.v === '(') {
      consume();
      const val = parseExpr();
      if (!peek() || peek().v !== ')') throw new Error('expected )');
      consume();
      return val;
    }
    throw new Error('unexpected: ' + t.v);
  }
  const result = parseExpr();
  if (pos < tokens.length) throw new Error('trailing tokens');
  return result;
}

function calculate() {
  const expr = calcInput.value.trim();
  if (!expr) return;
  try {
    const result = evaluateMath(expr);
    if (!isFinite(result)) { calcResultEl.textContent = T('webview.calc.infinityError'); return; }
    const rounded = Math.round(result * 1e10) / 1e10;
    calcResultEl.textContent = `= ${rounded}`;
    calcHistory.unshift(`${expr} = ${rounded}`);
    if (calcHistory.length > 5) calcHistory.pop();
    calcHistoryEl.innerHTML = calcHistory.map(h => `<div>${escapeHtml(h)}</div>`).join('');
  } catch (e) {
    calcResultEl.textContent = T('webview.calc.error');
  }
}

document.getElementById('calc-btn').addEventListener('click', calculate);
calcInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    calculate();
  }
});

// ===== Status tab switching =====
function activateStatusPane(targetId) {
  if (!targetId) { return false; }
  const targetPane = document.getElementById(targetId);
  if (!targetPane) {
    console.warn(`[LoreRelay] Status tab target not found: ${targetId}`);
    return false;
  }

  document.querySelectorAll('#status-tabs .tab-btn').forEach(b => {
    const isActive = b.dataset.target === targetId;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('#status-area .tab-pane').forEach((p) => {
    const isActive = p.id === targetId;
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    // display は .tab-pane.active の CSS に任せる（inline style と !important の競合を避ける）
    p.style.removeProperty('display');
  });

  const statusArea = document.getElementById('status-area');
  if (statusArea) {
    statusArea.dataset.activePane = targetId;
    // 冒険ステータス等の長い pane で下までスクロールした後、別タブへ切替えると
    // スクロール位置が残り「真っ黒」に見えるため先頭へ戻す。
    statusArea.scrollTop = 0;
  }
  targetPane.scrollTop = 0;

  if (targetId === 'pane-character') {
    vscode.postMessage({ type: 'loadCharacters' });
  }
  if (targetId === 'pane-world') {
    vscode.postMessage({ type: 'loadWorld' });
  }
  return true;
}

const PARLOR_STATUS_PANES = new Set([
  'pane-character',
  'pane-lorebook',
  'pane-memory',
  'pane-ooc',
]);

/** Keep Parlor's useful right pane while hiding only CRPG/world-management tabs. */
function syncStatusTabsForExperienceProfile(profile) {
  const parlor = profile === 'parlor';
  const buttons = Array.from(document.querySelectorAll('#status-tabs .tab-btn'));
  const panes = Array.from(document.querySelectorAll('#status-area .tab-pane'));
  const statusArea = document.getElementById('status-area');
  const currentTarget = buttons.find((button) => button.classList.contains('active'))?.dataset.target
    || statusArea?.dataset.activePane
    || 'pane-status';

  buttons.forEach((button) => {
    const allowed = !parlor || PARLOR_STATUS_PANES.has(button.dataset.target);
    button.classList.toggle('profile-parlor-hidden', !allowed);
    button.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    button.tabIndex = allowed ? 0 : -1;
  });
  panes.forEach((pane) => {
    const allowed = !parlor || PARLOR_STATUS_PANES.has(pane.id);
    pane.classList.toggle('profile-parlor-hidden', !allowed);
  });

  const nextTarget = parlor && !PARLOR_STATUS_PANES.has(currentTarget)
    ? 'pane-character'
    : currentTarget;
  activateStatusPane(nextTarget);
}

window.syncStatusTabsForExperienceProfile = syncStatusTabsForExperienceProfile;

const statusTabs = document.getElementById('status-tabs');
if (statusTabs) {
  statusTabs.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.tab-btn') : null;
    if (!btn || !statusTabs.contains(btn)) { return; }
    e.preventDefault();
    activateStatusPane(btn.dataset.target);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const initial =
    document.querySelector('#status-area .tab-pane.active')?.id ||
    document.querySelector('#status-tabs .tab-btn.active')?.dataset.target ||
    'pane-status';
  activateStatusPane(initial);
});

// ===== タブバー横スクロール =====
// 通常マウスホイール（縦）をタブバーの横スクロールに変換
(function initTabBarScroll() {
  const tabsHeader = document.getElementById('status-tabs');
  if (!tabsHeader) { return; }

  // 縦ホイール → 横スクロール変換
  tabsHeader.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabsHeader.scrollLeft += e.deltaY * 0.8;
    }
  }, { passive: false });

  // ポインタドラッグで横スクロール（タッチ操作 / タブ背景上のドラッグ）
  let dragging = false;
  let dragStartX = 0;
  let dragStartScrollLeft = 0;
  let dragMoved = false;
  let suppressNextClick = false;

  tabsHeader.addEventListener('click', (e) => {
    if (!suppressNextClick) { return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    suppressNextClick = false;
  }, true);

  tabsHeader.addEventListener('pointerdown', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (target === tabsHeader || target?.closest('.tab-btn')) {
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartScrollLeft = tabsHeader.scrollLeft;
      // setPointerCapture を使わない — 使うと click が tabsHeader に再ターゲットされ
      // .tab-btn の click ハンドラーが全滅するため
    }
  });

  // document レベルで追跡することでタブバー外へドラッグしても追従する
  document.addEventListener('pointermove', (e) => {
    if (!dragging) { return; }
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 4) {
      dragMoved = true;
      tabsHeader.scrollLeft = dragStartScrollLeft - dx;
    }
  });

  document.addEventListener('pointerup', () => {
    if (dragging && dragMoved) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
    }
    dragging = false;
  });
})();

// ===== クイックリプライバー横スクロール =====
// 通常マウスホイール（縦）をクイックリプライバーの横スクロールに変換
(function initQuickReplyBarScroll() {
  const bar = document.getElementById('quick-reply-bar');
  if (!bar) { return; }

  bar.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      bar.scrollLeft += e.deltaY * 0.8;
    }
  }, { passive: false });
})();

/* --- 50-character-saga.js --- */
// ===== Character Profile ロジック =====
let currentCharacters = [];
let activeCharId = null;
let currentPartyIds = [];

const charSelect = document.getElementById('char-select');
const charPartyCb = document.getElementById('char-party-cb');
const charNameInput = document.getElementById('char-name');
const charControlledBySelect = document.getElementById('char-controlled-by');
const charLlmProviderSelect = document.getElementById('char-llm-provider');
const charLlmModelInput = document.getElementById('char-llm-model');
const charDescInput = document.getElementById('char-desc');
const charPersonalityInput = document.getElementById('char-personality');
const charPortraitImg = document.getElementById('char-portrait-img');
const charPortraitPlaceholder = document.getElementById('char-portrait-placeholder');

const charEquipWeapon = document.getElementById('char-equip-weapon');
const charEquipArmor = document.getElementById('char-equip-armor');
const charEquipAccessory = document.getElementById('char-equip-accessory');
const charEquipNotifyBtn = document.getElementById('char-equip-notify-btn');

// ===== あらすじ / Saga アーカイブ =====

function showArchiveSuggest(count, threshold, tier) {
  const banner = document.getElementById('archive-suggest-banner');
  const textEl = document.getElementById('archive-suggest-text');
  if (!banner || !textEl) return;
  const tierLabel = tier === 'large'
    ? T('webview.saga.suggestTierLarge')
    : T('webview.saga.suggestTierSmall');
  textEl.textContent = T('webview.saga.suggestBanner', { count, threshold, tier: tierLabel });
  banner.style.display = 'flex';
}

function hideArchiveSuggest() {
  const banner = document.getElementById('archive-suggest-banner');
  if (banner) banner.style.display = 'none';
}

function resetSummarizeButton() {
  const btn = document.getElementById('summarize-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = T('webview.summary.generate');
}

/** Saga アーカイブ完了後にボタンを元に戻す */
function resetArchiveButton() {
  const btn = document.getElementById('archive-saga-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = T('webview.saga.archive');
}

function updateCharacterList(characters, activeId, partyIds) {
  currentCharacters = characters || [];
  window.currentCharacters = currentCharacters;
  activeCharId = activeId;
  currentPartyIds = partyIds || [];
  
  const currentSelection = charSelect.value;
  charSelect.innerHTML = '';
  const newOpt = document.createElement('option');
  newOpt.value = 'new';
  newOpt.textContent = T('webview.character.newOption');
  charSelect.appendChild(newOpt);

  const activeSuffix = T('webview.character.activeSuffix');
  currentCharacters.forEach(char => {
    const opt = document.createElement('option');
    opt.value = char.id;
    opt.textContent = (char.name || char.id) + (char.id === activeId ? activeSuffix : '');
    charSelect.appendChild(opt);
  });
  
  // 選択状態を復元、または Active キャラクターを選択
  const mustFollowActive = experienceProfile === 'parlor';
  if (!mustFollowActive && currentSelection !== 'new' && currentCharacters.find(c => c.id === currentSelection)) {
    charSelect.value = currentSelection;
  } else if (activeId && currentCharacters.find(c => c.id === activeId)) {
    charSelect.value = activeId;
  }
  
  loadSelectedCharacter();
}

function loadSelectedCharacter() {
  const id = charSelect.value;
  const deleteBtn = document.getElementById('char-delete-btn');
  if (deleteBtn) deleteBtn.disabled = (id === 'new');
  if (id === 'new') {
    charNameInput.value = '';
    charControlledBySelect.value = 'gm';
    charLlmProviderSelect.value = '';
    charLlmModelInput.value = '';
    charDescInput.value = '';
    charPersonalityInput.value = '';
    charPortraitImg.src = '';
    charPortraitImg.style.display = 'none';
    charPortraitPlaceholder.style.display = 'flex';
    if (charEquipWeapon) charEquipWeapon.value = '';
    if (charEquipArmor) charEquipArmor.value = '';
    if (charEquipAccessory) charEquipAccessory.value = '';
    if (charPartyCb) {
      charPartyCb.checked = false;
      charPartyCb.disabled = true;
    }
  } else {
    if (charPartyCb) {
      charPartyCb.disabled = false;
      charPartyCb.checked = currentPartyIds.includes(id);
    }
    const char = currentCharacters.find(c => c.id === id);
    if (char) {
      charNameInput.value = char.name || '';
      charControlledBySelect.value = char.controlledBy || 'gm';
      charLlmProviderSelect.value = char.llmProvider || '';
      charLlmModelInput.value = char.llmModel || '';
      charDescInput.value = char.description || '';
      charPersonalityInput.value = char.personality || '';
      if (charEquipWeapon) charEquipWeapon.value = char.equipment?.weapon || '';
      if (charEquipArmor) charEquipArmor.value = char.equipment?.armor || '';
      if (charEquipAccessory) charEquipAccessory.value = char.equipment?.accessory || '';
      if (char.portrait) {
        charPortraitImg.src = char.portrait;
        charPortraitImg.style.display = 'block';
        charPortraitPlaceholder.style.display = 'none';
      } else {
        charPortraitImg.style.display = 'none';
        charPortraitPlaceholder.style.display = 'flex';
      }
    }
  }
}

charSelect.addEventListener('change', () => {
  const requestedId = charSelect.value;
  if (experienceProfile === 'parlor' && requestedId !== 'new') {
    // The host sends characterList only after the canonical transition succeeds.
    // Restore the persisted selection now when a request is rejected as busy.
    charSelect.value = activeCharId || 'new';
    loadSelectedCharacter();
    if (requestedId !== activeCharId) {
      vscode.postMessage({ type: 'switchParlorCharacter', id: requestedId });
    }
    return;
  }
  loadSelectedCharacter();
  if (requestedId !== 'new') {
    vscode.postMessage({ type: 'setActiveCharacter', id: requestedId });
  }
});

document.getElementById('char-save-btn').addEventListener('click', () => {
  let id = charSelect.value;
  if (id === 'new') {
    id = 'char_' + Date.now();
  }
  
  const character = {
    id: id,
    name: charNameInput.value.trim(),
    controlledBy: charControlledBySelect.value,
    llmProvider: charLlmProviderSelect.value,
    llmModel: charLlmModelInput.value.trim(),
    description: charDescInput.value.trim(),
    personality: charPersonalityInput.value.trim(),
    equipment: {
      weapon: charEquipWeapon ? charEquipWeapon.value.trim() : '',
      armor: charEquipArmor ? charEquipArmor.value.trim() : '',
      accessory: charEquipAccessory ? charEquipAccessory.value.trim() : ''
    }
  };
  
  // 既存のportrait等を保持
  const existing = currentCharacters.find(c => c.id === id);
  if (existing && existing.portrait) {
    character.portrait = existing.portrait;
  }
  
  vscode.postMessage({ type: 'saveCharacter', character, inParty: charPartyCb.checked });
  if (charSelect.value === 'new') {
    vscode.postMessage({ type: 'setActiveCharacter', id });
  }
});

document.getElementById('char-delete-btn')?.addEventListener('click', () => {
  const id = charSelect.value;
  if (id === 'new') return;
  const char = currentCharacters.find(c => c.id === id);
  const name = char?.name || id;
  // Confirmation happens extension-side (native modal); webview confirm()
  // is silently blocked by the VS Code webview iframe sandbox.
  vscode.postMessage({ type: 'deleteCharacter', id, name });
});

charPartyCb.addEventListener('change', () => {
  const id = charSelect.value;
  if (id === 'new') return;
  vscode.postMessage({ type: charPartyCb.checked ? 'addToParty' : 'removeFromParty', id });
});

if (charEquipNotifyBtn) {
  charEquipNotifyBtn.addEventListener('click', () => {
    const weapon = charEquipWeapon ? charEquipWeapon.value.trim() : '';
    const armor = charEquipArmor ? charEquipArmor.value.trim() : '';
    const accessory = charEquipAccessory ? charEquipAccessory.value.trim() : '';
    vscode.postMessage({
      type: 'notifyEquipment',
      id: charSelect.value,
      name: charNameInput.value.trim(),
      weapon,
      armor,
      accessory
    });
  });
}

document.getElementById('summarize-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'summarizeHistory' });
  const btn = document.getElementById('summarize-btn');
  btn.textContent = T('webview.summary.generating');
  btn.disabled = true;
});

document.getElementById('archive-saga-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'archiveSaga' });
  const btn = document.getElementById('archive-saga-btn');
  btn.textContent = T('webview.saga.archiving');
  btn.disabled = true;
});

document.getElementById('archive-suggest-btn')?.addEventListener('click', () => {
  hideArchiveSuggest();
  vscode.postMessage({ type: 'archiveSaga' });
  const btn = document.getElementById('archive-saga-btn');
  if (btn) {
    btn.textContent = T('webview.saga.archiving');
    btn.disabled = true;
  }
});

document.getElementById('archive-suggest-dismiss')?.addEventListener('click', () => {
  hideArchiveSuggest();
});

document.getElementById('story-summary').addEventListener('blur', (e) => {
  vscode.postMessage({ type: 'updateSummary', summary: e.target.value });
});

document.getElementById('char-import-st-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'importTavernCard' });
});

document.getElementById('char-upload-btn').addEventListener('click', () => {
  const id = charSelect.value;
  if (id === 'new') {
    // VSCode Webviewのalertは使えないのでSystemメッセージなどで警告すべきだが簡易的にreturn
    return;
  }
  vscode.postMessage({ type: 'uploadPortrait', id });
});

document.getElementById('char-generate-btn').addEventListener('click', () => {
  const id = charSelect.value;
  if (id === 'new') return;
  vscode.postMessage({ type: 'generatePortrait', id });
});

// ===== メッセージインライン編集 =====
function startInlineEdit(msgDiv, entry, editBtn) {
  const bodyEl = msgDiv.querySelector('.msg-body');
  if (!bodyEl || msgDiv.dataset.editing) { return; }
  msgDiv.dataset.editing = '1';
  editBtn.disabled = true;

  const original = entry.content;
  const ta = document.createElement('textarea');
  ta.className = 'msg-edit-textarea';
  ta.value = original;
  ta.rows = Math.max(3, original.split('\n').length + 1);

  const btnRow = document.createElement('div');
  btnRow.className = 'msg-edit-btnrow';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = T('webview.msg.editSave') || '💾 Save';
  saveBtn.onclick = () => {
    const newContent = ta.value.trim();
    if (newContent && newContent !== original) {
      entry.content = newContent;
      bodyEl.textContent = newContent;
      vscode.postMessage({ type: 'editEntry', id: entry.id, content: newContent });
    }
    finishEdit();
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = T('webview.msg.editCancel') || '✕ Cancel';
  cancelBtn.onclick = finishEdit;

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  bodyEl.style.display = 'none';
  bodyEl.insertAdjacentElement('afterend', ta);
  ta.insertAdjacentElement('afterend', btnRow);
  ta.focus();

  function finishEdit() {
    ta.remove();
    btnRow.remove();
    bodyEl.style.display = '';
    editBtn.disabled = false;
    delete msgDiv.dataset.editing;
  }
}

/* --- 52-character-creator.js --- */
// ===== Character Creator / Editor Modal =====
// Full SillyTavern V2/V3-compatible character creation UI

(function initCharacterCreator() {

  // ── State ──────────────────────────────────────────────────────────────
  let ccCharId = null;
  let ccPortraitData = null;       // base64 data URI or webview URI
  let ccExpressions = {};          // { expressionKey: { uri: string } }
  let ccExportFormat = 'json';
  let ccIsDirty = false;
  let ccAdaptDraft = null;

  const DEFAULT_EXPRESSIONS = [
    { key: 'neutral',     i18nKey: 'webview.characterCreator.expr.neutral',     icon: '😐' },
    { key: 'happy',       i18nKey: 'webview.characterCreator.expr.happy',       icon: '😊' },
    { key: 'sad',         i18nKey: 'webview.characterCreator.expr.sad',         icon: '😢' },
    { key: 'angry',       i18nKey: 'webview.characterCreator.expr.angry',       icon: '😠' },
    { key: 'surprised',   i18nKey: 'webview.characterCreator.expr.surprised',   icon: '😮' },
    { key: 'scared',      i18nKey: 'webview.characterCreator.expr.scared',      icon: '😨' },
    { key: 'disgusted',   i18nKey: 'webview.characterCreator.expr.disgusted',   icon: '🤢' },
    { key: 'thinking',    i18nKey: 'webview.characterCreator.expr.thinking',    icon: '🤔' },
    { key: 'embarrassed', i18nKey: 'webview.characterCreator.expr.embarrassed', icon: '😳' },
    { key: 'smug',        i18nKey: 'webview.characterCreator.expr.smug',        icon: '😏' },
  ];

  // ── DOM helpers ────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const $v = (id) => ($(`cc-${id}`)?.value?.trim() ?? '');
  const $set = (id, val) => { const el = $(`cc-${id}`); if (el) el.value = val ?? ''; };

  // ── Open / Close ───────────────────────────────────────────────────────
  function openCreator(charData) {
    const modal = $('char-creator-modal');
    const backdrop = $('char-creator-backdrop');
    if (!modal || !backdrop) return;

    ccCharId      = charData?.id ?? null;
    ccPortraitData = charData?.portrait ?? null;
    ccExpressions = {};
    ccIsDirty     = false;

    if (charData?.expressions) {
      for (const [k, v] of Object.entries(charData.expressions)) {
        ccExpressions[k] = { uri: v };
      }
    }

    // Populate fields
    $set('name',          charData?.name ?? charData?.char_name ?? '');
    $set('creator',       charData?.creator ?? '');
    $set('version',       charData?.char_version ?? '1.0');
    $set('tags',          Array.isArray(charData?.tags)
                            ? charData.tags.join(', ')
                            : (charData?.tags ?? ''));
    $set('controlled-by', charData?.controlledBy ?? 'gm');
    $set('description',   charData?.description ?? charData?.char_desc ?? '');
    $set('personality',   charData?.personality ?? '');
    $set('scenario',      charData?.scenario ?? '');
    $set('first-mes',     charData?.first_mes ?? '');
    $set('mes-example',   charData?.mes_example ?? '');
    $set('creator-notes', charData?.creator_notes ?? '');
    $set('system-prompt', charData?.system_prompt ?? '');
    $set('post-history',  charData?.post_history_instructions ?? '');
    $set('llm-provider',  charData?.llmProvider ?? '');
    $set('llm-model',     charData?.llmModel ?? '');
    $set('equip-weapon',  charData?.equipment?.weapon ?? '');
    $set('equip-armor',   charData?.equipment?.armor ?? '');
    $set('equip-accessory', charData?.equipment?.accessory ?? '');

    // Party checkbox
    const partyCb = $('cc-party-cb');
    if (partyCb) {
      partyCb.checked = ccCharId ? (currentPartyIds || []).includes(ccCharId) : false;
    }

    // Subtitle
    const subtitle = modal.querySelector('.cc-subtitle');
    if (subtitle) subtitle.textContent = charData?.name ? `— ${charData.name}` : T('webview.characterCreator.newSubtitle');

    // Saved toast reset
    const toast = $('cc-saved-toast');
    if (toast) toast.classList.add('hidden');

    // Reset format buttons
    document.querySelectorAll('.cc-fmt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === ccExportFormat);
    });

    updatePortraitPreview(ccPortraitData);
    renderExpressionsGrid();

    // World adaptation panel reset
    ccAdaptDraft = null;
    $('cc-adapt-draft')?.classList.add('hidden');
    const adaptBtn = $('cc-adapt-world-btn');
    if (adaptBtn) adaptBtn.disabled = !window.currentWorldTheme;

    modal.classList.remove('hidden');
    backdrop.classList.remove('hidden');

    // Focus name field
    setTimeout(() => $('cc-name')?.focus(), 80);
  }

  function closeCreator() {
    $('char-creator-modal')?.classList.add('hidden');
    $('char-creator-backdrop')?.classList.add('hidden');
  }

  // ── Portrait ───────────────────────────────────────────────────────────
  function updatePortraitPreview(src) {
    const img     = $('cc-portrait-img-preview');
    const pholder = $('cc-portrait-placeholder-inner');
    if (!img || !pholder) return;

    if (src) {
      img.src = src;
      img.style.display = 'block';
      pholder.style.display = 'none';
    } else {
      img.src = '';
      img.style.display = 'none';
      pholder.style.display = 'flex';
    }
  }

  function initPortraitDrop() {
    const drop = $('cc-portrait-drop');
    if (!drop) return;

    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('cc-dragging');
    });
    drop.addEventListener('dragleave', (e) => {
      if (!drop.contains(e.relatedTarget)) {
        drop.classList.remove('cc-dragging');
      }
    });
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('cc-dragging');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        readImageAsDataUrl(file, (dataUrl) => {
          ccPortraitData = dataUrl;
          ccIsDirty = true;
          updatePortraitPreview(dataUrl);
        });
      }
    });

    // Click anywhere on drop zone (except buttons) triggers picker
    drop.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      triggerPortraitPicker();
    });
  }

  function triggerPortraitPicker() {
    // Try native file input first (works in most VS Code webview contexts)
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        readImageAsDataUrl(file, (dataUrl) => {
          ccPortraitData = dataUrl;
          ccIsDirty = true;
          updatePortraitPreview(dataUrl);
        });
      }
      input.remove();
    };
    input.click();
  }

  function readImageAsDataUrl(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => callback(/** @type {string} */ (e.target.result));
    reader.readAsDataURL(file);
  }

  // ── Expressions grid ───────────────────────────────────────────────────
  function renderExpressionsGrid() {
    const grid = $('cc-sprites-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Build ordered key list: defaults first, then any extras
    const allKeys = [
      ...DEFAULT_EXPRESSIONS.map(e => e.key),
      ...Object.keys(ccExpressions).filter(k => !DEFAULT_EXPRESSIONS.find(e => e.key === k))
    ];

    for (const key of allKeys) {
      const meta = DEFAULT_EXPRESSIONS.find(e => e.key === key);
      const expr = ccExpressions[key];
      const label = meta?.i18nKey ? T(meta.i18nKey) : key;
      grid.appendChild(
        buildExpressionCard(key, label, meta?.icon ?? '🎭', expr?.uri ?? null)
      );
    }
  }

  function buildExpressionCard(key, label, icon, imageSrc) {
    const card = document.createElement('div');
    card.className = 'cc-sprite-card' + (imageSrc ? ' cc-sprite-has-img' : '');

    // Thumb or placeholder
    if (imageSrc) {
      const img = document.createElement('img');
      img.className = 'cc-sprite-thumb';
      img.src = imageSrc;
      img.alt = label;
      card.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'cc-sprite-placeholder';
      ph.textContent = icon;
      card.appendChild(ph);
    }

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'cc-sprite-label';
    lbl.textContent = label;
    card.appendChild(lbl);

    // Hover-action overlay
    const actions = document.createElement('div');
    actions.className = 'cc-sprite-actions';

    const uploadBtn = makeSpritActionBtn('📁', T('webview.characterCreator.spriteUpload'), false, () => triggerExpressionPicker(key));
    const genBtn    = makeSpritActionBtn('✨', T('webview.characterCreator.spriteGenerate'), false, () => {
      vscode.postMessage({
        type: 'generateExpression',
        characterName: $v('name') || 'Character',
        expression: key,
        charId: ccCharId
      });
    });
    actions.appendChild(uploadBtn);
    actions.appendChild(genBtn);

    if (imageSrc) {
      const delBtn = makeSpritActionBtn('🗑', T('webview.characterCreator.spriteRemove'), true, () => {
        delete ccExpressions[key];
        ccIsDirty = true;
        renderExpressionsGrid();
      });
      actions.appendChild(delBtn);
    }

    card.appendChild(actions);
    return card;
  }

  function makeSpritActionBtn(emoji, title, isDanger, onClick) {
    const btn = document.createElement('button');
    btn.className = 'cc-sprite-action-btn' + (isDanger ? ' cc-del' : '');
    btn.title = title;
    btn.textContent = emoji;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  function triggerExpressionPicker(expressionKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        readImageAsDataUrl(file, (dataUrl) => {
          ccExpressions[expressionKey] = { uri: dataUrl };
          ccIsDirty = true;
          renderExpressionsGrid();
        });
      }
      input.remove();
    };
    input.click();
  }

  function addCustomExpression() {
    const container = $('cc-add-custom-expression-btn')?.parentElement;
    if (!container) return;

    if (container.querySelector('.cc-expression-input-wrapper')) return; // Already open

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'cc-expression-input-wrapper';
    inputWrapper.style.display = 'flex';
    inputWrapper.style.gap = '8px';
    inputWrapper.style.marginTop = '8px';
    inputWrapper.style.alignItems = 'center';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cc-input';
    input.placeholder = T('webview.characterCreator.expressionNamePlaceholder');
    input.style.flex = '1';

    const addBtn = document.createElement('button');
    addBtn.className = 'glass-btn';
    addBtn.textContent = T('webview.characterCreator.add');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'glass-btn cc-del';
    cancelBtn.textContent = T('webview.characterCreator.cancel');

    const finish = (name) => {
      inputWrapper.remove();
      if (!name) return;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!key) return;
      if (!ccExpressions[key]) ccExpressions[key] = null;
      ccIsDirty = true;
      renderExpressionsGrid();
    };

    addBtn.onclick = () => finish((input.value || '').trim());
    cancelBtn.onclick = () => finish(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') finish((input.value || '').trim());
      if (e.key === 'Escape') finish(null);
    };

    inputWrapper.appendChild(input);
    inputWrapper.appendChild(addBtn);
    inputWrapper.appendChild(cancelBtn);
    container.appendChild(inputWrapper);
    input.focus();
  }

  // ── World Adaptation ───────────────────────────────────────────────────
  function renderAdaptDraft(draft) {
    const panel = $('cc-adapt-draft');
    if (!panel) return;
    const noChange = T('webview.characterCreator.noChange');
    $('cc-adapt-description').textContent = draft.description || noChange;
    $('cc-adapt-personality').textContent = draft.personality || noChange;
    const eq = draft.equipment || {};
    $('cc-adapt-equipment').textContent =
      [eq.weapon, eq.armor, eq.accessory].filter(Boolean).join(' / ') || noChange;
    $('cc-adapt-arrival').textContent = draft.arrivalReason || noChange;
    panel.classList.remove('hidden');
  }

  function applyAdaptDraft() {
    if (!ccAdaptDraft) return;
    if (ccAdaptDraft.description) {
      const merged = ccAdaptDraft.arrivalReason
        ? `${ccAdaptDraft.description}\n\n${ccAdaptDraft.arrivalReason}`
        : ccAdaptDraft.description;
      $set('description', merged);
    }
    if (ccAdaptDraft.personality) $set('personality', ccAdaptDraft.personality);
    const eq = ccAdaptDraft.equipment || {};
    if (eq.weapon) $set('equip-weapon', eq.weapon);
    if (eq.armor) $set('equip-armor', eq.armor);
    if (eq.accessory) $set('equip-accessory', eq.accessory);
    ccIsDirty = true;
    ccAdaptDraft = null;
    $('cc-adapt-draft')?.classList.add('hidden');
  }

  function discardAdaptDraft() {
    ccAdaptDraft = null;
    $('cc-adapt-draft')?.classList.add('hidden');
  }

  // ── Collect & Save ─────────────────────────────────────────────────────
  function collectPayload() {
    const tags = $v('tags').split(',').map(t => t.trim()).filter(Boolean);

    // Only include expressions that have an image
    const expressions = {};
    for (const [k, v] of Object.entries(ccExpressions)) {
      if (v?.uri) expressions[k] = v.uri;
    }

    const id = ccCharId || `char_${Date.now()}`;

    return {
      // LoreRelay runtime fields
      id,
      name:        $v('name'),
      controlledBy: $v('controlled-by') || 'gm',
      llmProvider: $v('llm-provider'),
      llmModel:    $v('llm-model'),
      portrait:    ccPortraitData,
      expressions,
      equipment: {
        weapon:    $v('equip-weapon'),
        armor:     $v('equip-armor'),
        accessory: $v('equip-accessory'),
      },

      // SillyTavern spec fields (V2/V3)
      spec:         'chara_card_v2',
      spec_version: ccExportFormat === 'st-v3' ? '3.0' : '2.0',
      char_name:    $v('name'),
      char_version: $v('version') || '1.0',
      creator:      $v('creator'),
      creator_notes: $v('creator-notes'),
      tags,
      description:  $v('description'),
      char_desc:    $v('description'),
      personality:  $v('personality'),
      scenario:     $v('scenario'),
      first_mes:    $v('first-mes'),
      mes_example:  $v('mes-example'),
      system_prompt: $v('system-prompt'),
      post_history_instructions: $v('post-history'),

      // Export hint for backend
      exportFormat: ccExportFormat,
    };
  }

  function saveCharacter() {
    const data   = collectPayload();
    const inParty = $('cc-party-cb')?.checked ?? false;

    vscode.postMessage({ type: 'saveCharacter', data, character: data, inParty });

    if (!ccCharId) {
      vscode.postMessage({ type: 'setActiveCharacter', id: data.id });
    }
    ccCharId  = data.id;
    ccIsDirty = false;

    // Show toast
    const toast = $('cc-saved-toast');
    if (toast) {
      toast.classList.remove('hidden');
      setTimeout(() => toast.classList.add('hidden'), 2500);
    }

    // Refresh character list
    vscode.postMessage({ type: 'loadCharacters' });

    // Close after a short delay so user sees the toast
    setTimeout(() => closeCreator(), 1800);
  }

  // ── Init ───────────────────────────────────────────────────────────────
  function init() {
    // Close
    $('char-creator-close')?.addEventListener('click', closeCreator);
    $('char-creator-backdrop')?.addEventListener('click', (e) => {
      if (e.target === $('char-creator-backdrop')) closeCreator();
    });

    // ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('char-creator-modal')?.classList.contains('hidden')) {
        closeCreator();
      }
    });

    // "Open Full Editor" button in pane-character
    $('char-open-creator-btn')?.addEventListener('click', () => {
      const id = $('char-select')?.value;
      if (id && id !== 'new') {
        const char = (window.currentCharacters || []).find(c => c.id === id);
        openCreator(char ?? null);
      } else {
        openCreator(null);
      }
    });

    // "New" shortcut button
    $('char-new-creator-btn')?.addEventListener('click', () => openCreator(null));

    // Portrait drop + upload
    initPortraitDrop();
    $('cc-portrait-upload-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerPortraitPicker();
    });
    $('cc-portrait-generate-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      vscode.postMessage({
        type: 'generatePortrait',
        id: ccCharId,
        name: $v('name') || 'Character',
        description: $v('description'),
      });
    });

    // Expression: add custom
    $('cc-add-expression-btn')?.addEventListener('click', addCustomExpression);

    // World adaptation
    $('cc-adapt-world-btn')?.addEventListener('click', () => {
      if (!window.currentWorldTheme) return;
      vscode.postMessage({
        type: 'adaptCharacterToWorld',
        character: collectPayload(),
      });
    });
    $('cc-adapt-apply-btn')?.addEventListener('click', applyAdaptDraft);
    $('cc-adapt-discard-btn')?.addEventListener('click', discardAdaptDraft);

    // Format toggle
    document.querySelectorAll('.cc-fmt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cc-fmt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ccExportFormat = btn.dataset.fmt ?? 'json';
      });
    });

    // Save
    $('cc-save-btn')?.addEventListener('click', saveCharacter);

    // Mark dirty on any field input inside the modal
    $('char-creator-modal')?.addEventListener('input', () => { ccIsDirty = true; });
  }

  // ── Extension message handler ──────────────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;

    // Portrait generation result
    if (msg.type === 'portraitGenerated') {
      const uri = msg.uri || msg.image;
      if (uri && (msg.id === ccCharId || !ccCharId)) {
        ccPortraitData = uri;
        ccIsDirty      = true;
        updatePortraitPreview(uri);
      }
    }

    // Expression generation result
    if (msg.type === 'expressionGenerated' && msg.expression) {
      const uri = msg.uri || msg.image;
      if (uri && msg.id === ccCharId) {
        ccExpressions[msg.expression] = { uri };
        ccIsDirty = true;
        renderExpressionsGrid();
      }
    }

    // World adaptation draft result
    if (msg.type === 'characterWorldAdaptationDraft' && msg.draft) {
      ccAdaptDraft = msg.draft;
      renderAdaptDraft(msg.draft);
    }
  });

  // ── Expose API ────────────────────────────────────────────────────────
  window.openCharacterCreator = openCreator;
  window.closeCharacterCreator = closeCreator;

  // Delay init until DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* --- 55-remote-play.js --- */
// ===== Remote Play (LAN player screen) =====
let remotePlayActive = false;

function updateRemotePlayButton(status) {
  const btn = document.getElementById('remote-play-btn');
  if (!btn) { return; }
  remotePlayActive = Boolean(status && status.running);
  btn.classList.toggle('active', remotePlayActive);
  const clients = status && typeof status.clientCount === 'number' ? status.clientCount : 0;
  btn.title = remotePlayActive
    ? `${T('webview.remotePlay.active')} (${clients})`
    : T('webview.remotePlay.toggle');
  renderRemotePlayPanel(status);
}

// The panel had an `#remote-play-backdrop` element in index.html from the
// start, styled identically to the image-gen panel's backdrop, but nothing
// ever toggled it — so opening Remote Play left the Start Hub / chat log
// fully visible (and clickable) behind the panel instead of dimming it.
function syncRemotePlayBackdrop() {
  const panel = document.getElementById('remote-play-panel');
  const backdrop = document.getElementById('remote-play-backdrop');
  if (!panel || !backdrop) { return; }
  backdrop.classList.toggle('hidden', panel.classList.contains('hidden'));
}

function renderRemotePlayPanel(status) {
  const panel = document.getElementById('remote-play-panel');
  if (!panel) { return; }

  const running = Boolean(status && status.running);
  panel.classList.toggle('hidden', !running);
  syncRemotePlayBackdrop();
  if (!running) {
    return;
  }

  const playerUrl = (status.urls && status.urls[0]) || '';
  const spectatorUrl = (status.spectatorUrls && status.spectatorUrls[0]) || '';
  const playerUrlEl = document.getElementById('remote-play-player-url');
  const spectatorUrlEl = document.getElementById('remote-play-spectator-url');
  const clientsEl = document.getElementById('remote-play-clients');

  if (playerUrlEl) { playerUrlEl.textContent = playerUrl; }
  if (spectatorUrlEl) { spectatorUrlEl.textContent = spectatorUrl; }

  if (clientsEl) {
    clientsEl.innerHTML = '';
    const clients = status.clients || [];
    if (!clients.length) {
      clientsEl.innerHTML = `<span class="empty-text">${T('webview.remotePlay.noClients')}</span>`;
    } else {
      clients.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'remote-client-row';
        const roleLabel = c.role === 'spectator'
          ? T('webview.remotePlay.roleSpectator')
          : T('webview.remotePlay.rolePlayer');
        row.textContent = `${c.id} · ${roleLabel}`;
        clientsEl.appendChild(row);
      });
    }
  }

  panel.dataset.playerUrl = playerUrl;
  panel.dataset.spectatorUrl = spectatorUrl;
}

(function initRemotePlayUi() {
  const btn = document.getElementById('remote-play-btn');
  const panel = document.getElementById('remote-play-panel');
  const backdrop = document.getElementById('remote-play-backdrop');
  const closeBtn = document.getElementById('remote-play-close');
  const stopBtn = document.getElementById('remote-play-stop-btn');
  const copyPlayerBtn = document.getElementById('remote-play-copy-player');
  const copySpectatorBtn = document.getElementById('remote-play-copy-spectator');

  if (!btn) { return; }

  btn.addEventListener('click', () => {
    if (remotePlayActive && panel) {
      panel.classList.toggle('hidden');
      syncRemotePlayBackdrop();
      return;
    }
    vscode.postMessage({ type: 'toggleRemotePlay' });
  });

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('hidden');
      syncRemotePlayBackdrop();
    });
  }
  if (backdrop && panel) {
    backdrop.addEventListener('click', () => {
      panel.classList.add('hidden');
      syncRemotePlayBackdrop();
    });
  }
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'toggleRemotePlay' });
    });
  }
  if (copyPlayerBtn) {
    copyPlayerBtn.addEventListener('click', () => {
      const url = panel ? panel.dataset.playerUrl : '';
      if (url) {
        vscode.postMessage({ type: 'copyRemotePlayUrl', url, role: 'player' });
      }
    });
  }
  if (copySpectatorBtn) {
    copySpectatorBtn.addEventListener('click', () => {
      const url = panel ? panel.dataset.spectatorUrl : '';
      if (url) {
        vscode.postMessage({ type: 'copyRemotePlayUrl', url, role: 'spectator' });
      }
    });
  }
})();

/* --- 60-tts-quickreply-imagegen.js --- */
// ===== AI音声ナレーション (TTS) コアロジック =====
function getBestVoiceForLocale(locale) {
  if (!window.speechSynthesis) return null;
  const langMap = {
    'ja': 'ja-JP',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  const targetLang = langMap[locale] || 'en-US';
  const voices = window.speechSynthesis.getVoices();
  
  // 1. 完全一致
  let matched = voices.filter(v => v.lang === targetLang || v.lang.replace('_', '-').startsWith(targetLang));
  if (matched.length > 0) {
    const localVoice = matched.find(v => v.localService);
    return localVoice || matched[0];
  }
  
  // 2. 部分一致 (言語コードの先頭部分が一致)
  const baseLang = targetLang.split('-')[0];
  matched = voices.filter(v => v.lang.startsWith(baseLang));
  if (matched.length > 0) {
    return matched[0];
  }
  
  return null;
}

// ===== Quick Reply バー =====
(function initQuickReplyBar() {
  const qrUndo = document.getElementById('qr-undo');
  if (qrUndo) {
    qrUndo.addEventListener('click', () => {
      window.speechSynthesis?.cancel();
      vscode.postMessage({ type: 'undoLastTurn' });
    });
  }

  const qrRetry = document.getElementById('qr-retry');
  if (qrRetry) {
    qrRetry.addEventListener('click', () => {
      if (isInputLocked()) { return; }
      window.speechSynthesis?.cancel();
      vscode.postMessage({ type: 'regenerateLastTurn' });
    });
  }

  const qrCheckpoint = document.getElementById('qr-checkpoint');
  if (qrCheckpoint) {
    qrCheckpoint.addEventListener('click', () => {
      // Label input happens extension-side (native input box); webview prompt()
      // is silently blocked by the VS Code webview iframe sandbox.
      vscode.postMessage({ type: 'saveCheckpoint' });
    });
  }

  const qrSummary = document.getElementById('qr-summary');
  if (qrSummary) {
    qrSummary.addEventListener('click', () => {
      vscode.postMessage({ type: 'summarizeHistory' });
      const btn = document.getElementById('summarize-btn');
      if (btn) { btn.textContent = T('webview.summary.generating'); btn.disabled = true; }
    });
  }

  const qrGenImage = document.getElementById('qr-genimage');
  if (qrGenImage) {
    qrGenImage.addEventListener('click', () => {
      const lastGm = [...messageHistory].reverse().find((m) => m && m.role === 'gm' && m.id);
      if (!lastGm) { addSystemMessage(T('webview.image.noTurn')); return; }
      const prompt = String(lastGm.imagePrompt || lastGm.content || 'current scene').trim().slice(0, 300) || 'current scene';
      vscode.postMessage({ type: 'generateImage', prompt, entryId: lastGm.id });
      addSystemMessage(T('webview.image.requested'));
    });
  }

  const qrLoadPack = document.getElementById('qr-loadpack');
  if (qrLoadPack) {
    qrLoadPack.addEventListener('click', () => {
      vscode.postMessage({ type: 'loadScenario' });
    });
  }

  const qrArchive = document.getElementById('qr-archive');
  if (qrArchive) {
    qrArchive.addEventListener('click', () => {
      vscode.postMessage({ type: 'archiveSaga' });
      const btn = document.getElementById('archive-saga-btn');
      if (btn) { btn.textContent = T('webview.saga.archiving'); btn.disabled = true; }
    });
  }

  const qrExport = document.getElementById('qr-export');
  if (qrExport) {
    qrExport.addEventListener('click', () => {
      vscode.postMessage({ type: 'exportHtml' });
    });
  }

  const qrForceSpeak = document.getElementById('qr-forcespeak');
  if (qrForceSpeak) {
    qrForceSpeak.addEventListener('click', () => {
      vscode.postMessage({ type: 'requestForceSpeak' });
    });
  }
})();

// ===== Image Gen Settings パネル =====
let imageGenConfigDraft = null;
let imageGenSaveTimer = null;

function applyImageGenConfigForm(config) {
  imageGenConfigDraft = config;
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el) { el.value = value ?? ''; }
  };
  setVal('ig-profile', config.profileId || '');
  setVal('ig-model-family', config.modelFamily || 'unknown');
  setVal('ig-checkpoint', config.checkpoint || '');
  setVal('ig-mode', config.mode || 'illustrious');
  setVal('ig-steps', config.steps ?? 0);
  setVal('ig-cfg', config.cfg ?? 0);
  setVal('ig-width', config.width ?? 0);
  setVal('ig-height', config.height ?? 0);
  setVal('ig-sampler', config.samplerName || '');
  setVal('ig-scheduler', config.scheduler || '');
  setVal('ig-pos-prefix', config.positivePrefix || '');
  setVal('ig-pos-suffix', config.positiveSuffix || '');
  setVal('ig-negative', config.negativePrompt || '');
  const tpl = config.templates || {};
  setVal('ig-tpl-scene', tpl.scene || '');
  setVal('ig-tpl-portrait', tpl.portrait || '');
  setVal('ig-tpl-background', tpl.background || '');
  setVal('ig-tpl-freeform', tpl.freeform || '');
}

function collectImageGenConfigFromForm() {
  const num = (id) => {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : 0;
    return Number.isFinite(v) ? v : 0;
  };
  const str = (id) => {
    const el = document.getElementById(id);
    return el ? String(el.value).trim() : '';
  };
  return {
    version: 2,
    profileId: str('ig-profile'),
    modelFamily: str('ig-model-family') || 'unknown',
    checkpoint: str('ig-checkpoint'),
    mode: str('ig-mode') || 'illustrious',
    steps: num('ig-steps'),
    cfg: num('ig-cfg'),
    width: num('ig-width'),
    height: num('ig-height'),
    samplerName: str('ig-sampler'),
    scheduler: str('ig-scheduler'),
    positivePrefix: str('ig-pos-prefix'),
    positiveSuffix: str('ig-pos-suffix'),
    negativePrompt: str('ig-negative'),
    templates: {
      scene: str('ig-tpl-scene'),
      portrait: str('ig-tpl-portrait'),
      background: str('ig-tpl-background'),
      freeform: str('ig-tpl-freeform')
    }
  };
}

function scheduleImageGenConfigSave() {
  if (imageGenSaveTimer) { clearTimeout(imageGenSaveTimer); }
  imageGenSaveTimer = setTimeout(() => {
    imageGenSaveTimer = null;
    const config = collectImageGenConfigFromForm();
    vscode.postMessage({ type: 'updateImageGenConfig', config });
    const savedEl = document.getElementById('img-gen-saved');
    if (savedEl) {
      savedEl.classList.remove('hidden');
      setTimeout(() => savedEl.classList.add('hidden'), 1500);
    }
  }, 400);
}

function setImageGenPanelOpen(open) {
  const panel = document.getElementById('img-gen-panel');
  const backdrop = document.getElementById('img-gen-backdrop');
  if (!panel || !backdrop) { return; }
  panel.classList.toggle('hidden', !open);
  backdrop.classList.toggle('hidden', !open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    vscode.postMessage({ type: 'requestImageGenConfig' });
  }
}

(function initImageGenSettingsPanel() {
  const openBtn = document.getElementById('img-gen-settings-btn');
  const closeBtn = document.getElementById('img-gen-panel-close');
  const backdrop = document.getElementById('img-gen-backdrop');
  const panel = document.getElementById('img-gen-panel');

  openBtn?.addEventListener('click', () => setImageGenPanelOpen(true));
  closeBtn?.addEventListener('click', () => setImageGenPanelOpen(false));
  backdrop?.addEventListener('click', () => setImageGenPanelOpen(false));

  panel?.querySelectorAll('.img-gen-input, .img-gen-textarea').forEach((el) => {
    el.addEventListener('change', scheduleImageGenConfigSave);
    el.addEventListener('blur', scheduleImageGenConfigSave);
  });
})();

function speakText(text) {
  speakWithProfile(text, null);
}

/* --- 61-tts-npc.js --- */
// ===== Phase 11: NPC-aware TTS (system + local/external bridge in 11B) =====
//
// Runtime mirror of src/ttsProviderCore.ts + src/npcVoiceCore.ts (no shared bundle).
// local/external plans post requestNpcTts → extension ttsBridgeRunner.ts → ttsAudioReady.
//
// Attribution: entry.sender + optional entry.speakerNpcId; duplicate names use currentLocationId.

const TTS_MAX_TEXT_LEN = 4000;

const TTS_MOOD_MODIFIERS = {
  excited: { rateDelta: 0.18, pitchDelta: 0.15 },
  angry: { rateDelta: 0.12, pitchDelta: 0.05 },
  fearful: { rateDelta: 0.15, pitchDelta: 0.12 },
  happy: { rateDelta: 0.08, pitchDelta: 0.10 },
  neutral: { rateDelta: 0, pitchDelta: 0 },
  worried: { rateDelta: -0.05, pitchDelta: -0.05 },
  sad: { rateDelta: -0.15, pitchDelta: -0.10 },
};

let npcTtsCatalog = [];
let ttsExternalEnabled = false;
let ttsLocalAvailable = false;
let ttsExternalProvider = '';
let npcTtsCurrentLocationId = null;
let npcVoiceCount = 0;
let ttsFallbackLogged = { external: false, local: false };
const pendingBridgeTts = new Map();
let activeBridgeAudio = null;

function clampVoiceRateJs(v, fallback = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(0.5, Math.min(2, v));
}

function clampVoiceVolumeJs(v, fallback = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(0, Math.min(1, v));
}

function clampVoicePitchJs(v, fallback = 0) {
  if (typeof v !== 'number' || !Number.isFinite(v)) { return fallback; }
  return Math.max(-1, Math.min(1, v));
}

function localeToBcp47Js(locale) {
  const map = { ja: 'ja-JP', en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW' };
  return map[locale] || map.en;
}

function applyMoodModifiersJs(rate, pitch, mood) {
  const mod = TTS_MOOD_MODIFIERS[mood] || TTS_MOOD_MODIFIERS.neutral;
  return {
    rate: clampVoiceRateJs(rate + mod.rateDelta),
    pitch: clampVoicePitchJs(pitch + mod.pitchDelta),
  };
}

function resolveTtsPlanJs(text, voiceCtx) {
  const plain = typeof text === 'string'
    ? text.replace(/\s+/g, ' ').trim().slice(0, TTS_MAX_TEXT_LEN)
    : '';
  if (!plain) {
    return null;
  }

  const profile = voiceCtx && voiceCtx.voice ? voiceCtx.voice : null;
  let provider = (profile && profile.provider) || 'system';

  if (provider === 'external' && !ttsExternalEnabled) {
    if (!ttsFallbackLogged.external) {
      console.warn('[LoreRelay TTS] external provider disabled; using system TTS');
      ttsFallbackLogged.external = true;
    }
    provider = 'system';
  }
  if (provider === 'local' && !ttsLocalAvailable) {
    if (!ttsFallbackLogged.local) {
      console.warn('[LoreRelay TTS] local provider unavailable; using system TTS');
      ttsFallbackLogged.local = true;
    }
    provider = 'system';
  }
  if (provider === 'external' && ttsExternalEnabled && ttsExternalProvider !== 'openai') {
    if (!ttsFallbackLogged.external) {
      console.warn('[LoreRelay TTS] external provider not configured; using system TTS');
      ttsFallbackLogged.external = true;
    }
    provider = 'system';
  }

  const globalSpeed = clampVoiceRateJs(typeof ttsSpeed === 'number' ? ttsSpeed : 1);
  const globalVolume = clampVoiceVolumeJs(typeof ttsVolume === 'number' ? ttsVolume : 0.8);

  let rate = globalSpeed * (profile && profile.rate !== undefined ? clampVoiceRateJs(profile.rate) : 1);
  let volume = globalVolume * (profile && profile.volume !== undefined ? clampVoiceVolumeJs(profile.volume) : 1);
  let pitch = profile && profile.pitch !== undefined ? clampVoicePitchJs(profile.pitch) : 0;

  const mood = (voiceCtx && voiceCtx.mood) || 'neutral';
  if (profile && profile.moodAdaptive) {
    const adjusted = applyMoodModifiersJs(rate, pitch, mood);
    rate = adjusted.rate;
    pitch = adjusted.pitch;
  }

  const lang = (profile && profile.lang) || localeToBcp47Js(currentLocale);

  return {
    provider,
    text: plain,
    lang,
    rate: clampVoiceRateJs(rate),
    volume: clampVoiceVolumeJs(volume),
    pitch: clampVoicePitchJs(pitch),
    voiceId: profile && profile.voiceId,
  };
}

function findNpcVoiceForSenderJs(sender, speakerNpcId) {
  if (speakerNpcId) {
    const byId = npcTtsCatalog.find((e) => e.id === speakerNpcId);
    if (byId) { return byId; }
  }
  const name = (sender || '').trim();
  if (!name) { return null; }
  const lower = name.toLowerCase();
  const matches = npcTtsCatalog.filter((e) => e.name.toLowerCase() === lower);
  if (matches.length === 0) { return null; }
  if (matches.length === 1) { return matches[0]; }
  if (npcTtsCurrentLocationId) {
    const atLoc = matches.filter((e) => e.locationId === npcTtsCurrentLocationId);
    if (atLoc.length === 1) { return atLoc[0]; }
  }
  return null;
}

function pickVoiceByHint(voiceId, lang) {
  if (!window.speechSynthesis) { return null; }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) { return null; }
  if (voiceId) {
    const hint = String(voiceId).toLowerCase();
    const match = voices.find((v) =>
      v.name.toLowerCase() === hint ||
      v.voiceURI.toLowerCase().includes(hint) ||
      v.name.toLowerCase().includes(hint)
    );
    if (match) { return match; }
  }
  const langMap = { ja: 'ja-JP', en: 'en-US', 'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW' };
  const target = lang || langMap[currentLocale] || 'en-US';
  const matched = voices.filter((v) => v.lang === target || v.lang.replace('_', '-').startsWith(target));
  if (matched.length) {
    return matched.find((v) => v.localService) || matched[0];
  }
  return getBestVoiceForLocale(currentLocale);
}

function speakPlanWithSystem(plan) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(plan.text);
  utterance.rate = plan.rate;
  utterance.volume = plan.volume;
  utterance.pitch = plan.pitch;
  utterance.lang = plan.lang;
  const voice = pickVoiceByHint(plan.voiceId, plan.lang);
  if (voice) {
    utterance.voice = voice;
  }
  window.speechSynthesis.speak(utterance);
}

function requestBridgeTts(plan) {
  const requestId = `tts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  pendingBridgeTts.set(requestId, plan);
  vscode.postMessage({
    type: 'requestNpcTts',
    requestId,
    provider: plan.provider,
    text: plan.text,
    lang: plan.lang,
    rate: plan.rate,
    volume: plan.volume,
    pitch: plan.pitch,
    voiceId: plan.voiceId,
  });
}

function playBridgeAudio(msg, fallbackPlan) {
  window.speechSynthesis?.cancel();
  if (activeBridgeAudio) {
    activeBridgeAudio.pause();
    activeBridgeAudio = null;
  }
  const mime = msg.mimeType || 'audio/mpeg';
  const audio = new Audio(`data:${mime};base64,${msg.audioBase64}`);
  audio.volume = typeof msg.volume === 'number' ? Math.max(0, Math.min(1, msg.volume)) : 1;
  activeBridgeAudio = audio;
  audio.onerror = () => {
    if (fallbackPlan) { speakPlanWithSystem(fallbackPlan); }
  };
  audio.play().catch(() => {
    if (fallbackPlan) { speakPlanWithSystem(fallbackPlan); }
  });
  if (msg.requestId) {
    pendingBridgeTts.delete(msg.requestId);
  }
}

function speakWithProfile(text, voiceCtx) {
  if (!ttsEnabled) { return; }

  const plan = resolveTtsPlanJs(text, voiceCtx);
  if (!plan) { return; }

  if (plan.provider === 'local' || plan.provider === 'external') {
    requestBridgeTts(plan);
    return;
  }

  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { return; }
  speakPlanWithSystem(plan);
}

function speakEntryText(entry) {
  if (!entry) { return; }
  const voiceCtx = findNpcVoiceForSenderJs(entry.sender, entry.speakerNpcId);
  if (voiceCtx) {
    speakWithProfile(entry.content, { voice: voiceCtx.voice, mood: voiceCtx.mood });
  } else {
    speakText(entry.content);
  }
}

function previewNpcVoice(npc) {
  if (!npc || !npc.voice) { return; }
  const sample = T('webview.world.npcVoiceSample', { name: npc.name }) ||
    `Hello, I am ${npc.name}.`;
  speakWithProfile(sample, { voice: npc.voice, mood: npc.mood || 'neutral' });
}

function updateTtsCapabilities(msg) {
  ttsExternalEnabled = !!msg.externalEnabled;
  ttsLocalAvailable = !!msg.localAvailable;
  ttsExternalProvider = typeof msg.externalProvider === 'string' ? msg.externalProvider : '';
}

function updateNpcTtsFromWorldView(msg) {
  npcTtsCatalog = Array.isArray(msg.npcTtsCatalog) ? msg.npcTtsCatalog : [];
  if (msg.ttsExternalEnabled !== undefined) {
    ttsExternalEnabled = !!msg.ttsExternalEnabled;
  }
  if (msg.ttsLocalAvailable !== undefined) {
    ttsLocalAvailable = !!msg.ttsLocalAvailable;
  }
  if (msg.ttsExternalProvider !== undefined) {
    ttsExternalProvider = typeof msg.ttsExternalProvider === 'string' ? msg.ttsExternalProvider : '';
  }
  npcTtsCurrentLocationId = msg.currentLocationId || null;
  npcVoiceCount = typeof msg.npcVoiceCount === 'number' ? msg.npcVoiceCount : 0;
  updateNpcVoiceCountLabel();
}

function updateNpcVoiceCountLabel() {
  const el = document.getElementById('tts-npc-voice-count');
  if (!el) { return; }
  if (npcVoiceCount > 0) {
    el.textContent = T('webview.tts.npcVoiceCount', { count: String(npcVoiceCount) }) ||
      `NPC voices: ${npcVoiceCount}`;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg.type !== 'string') { return; }
  if (msg.type === 'ttsCapabilities') {
    updateTtsCapabilities(msg);
  } else if (msg.type === 'ttsAudioReady' && msg.requestId) {
    const plan = pendingBridgeTts.get(msg.requestId);
    playBridgeAudio(msg, plan);
  } else if (msg.type === 'ttsAudioFailed' && msg.requestId) {
    const plan = pendingBridgeTts.get(msg.requestId);
    pendingBridgeTts.delete(msg.requestId);
    if (plan) {
      speakPlanWithSystem(plan);
    }
  }
});

/* --- 70-game-rules.js --- */
// webview/modules/70-game-rules.js

(function() {
    const rulesBtn = document.getElementById('game-rules-settings-btn');
    const rulesPanel = document.getElementById('game-rules-panel');
    const rulesClose = document.getElementById('game-rules-panel-close');
    const rulesBackdrop = document.getElementById('game-rules-backdrop');
    const rulesSavedToast = document.getElementById('game-rules-saved');

    const inputs = {
        enableRpgMechanics: document.getElementById('gr-enable-rpg'),
        defaultMaxHp: document.getElementById('gr-default-hp'),
        defaultMaxMp: document.getElementById('gr-default-mp'),
        diceDifficulty: document.getElementById('gr-dice-diff'),
        skillCommentary: document.getElementById('gr-skill-commentary'),
        backgroundSimulation: document.getElementById('gr-bg-sim'),
        autoLorebookGrowth: document.getElementById('gr-auto-lore'),
        enableNpcRegistry: document.getElementById('gr-npc-registry'),
        enableWorldForge: document.getElementById('gr-world-forge'),
        enableEmergentSimulation: document.getElementById('gr-emergent-sim'),
        enableFactionReputation: document.getElementById('gr-faction-reputation'),
        enableCampaignKit: document.getElementById('gr-campaign-kit'),
        campaignKitId: document.getElementById('gr-campaign-kit-id'),
        enableWorldObservatory: document.getElementById('gr-world-observatory'),
        enableCommerce: document.getElementById('gr-commerce'),
        enableCommerceUi: document.getElementById('gr-commerce-ui'),
        economyProfile: document.getElementById('gr-economy-profile'),
        playerRole: document.getElementById('gr-player-role'),
        enableNpcAgency: document.getElementById('gr-npc-agency'),
        enableDomainMode: document.getElementById('gr-domain-mode'),
        enableDomainAudience: document.getElementById('gr-domain-audience'),
        enableDomainRivals: document.getElementById('gr-domain-rivals'),
        enableDomainMissions: document.getElementById('gr-domain-missions'),
        enableMassBattle: document.getElementById('gr-mass-battle'),
        enableGuildMode: document.getElementById('gr-guild-mode'),
        enableGuildRequests: document.getElementById('gr-guild-requests'),
        enableGuildParties: document.getElementById('gr-guild-parties'),
        enableNpcRelationships: document.getElementById('gr-npc-relationships'),
        enableTravelEncounters: document.getElementById('gr-travel-encounters'),
        travelEncounterDensity: document.getElementById('gr-travel-density'),
        simIntervalTurns: document.getElementById('gr-sim-interval')
    };

    let saveTimeout = null;

    function openPanel() {
        rulesPanel.classList.remove('hidden');
        rulesPanel.setAttribute('aria-hidden', 'false');
        rulesBackdrop.classList.remove('hidden');
    }

    function closePanel() {
        rulesPanel.classList.add('hidden');
        rulesPanel.setAttribute('aria-hidden', 'true');
        rulesBackdrop.classList.add('hidden');
    }

    if (rulesBtn) rulesBtn.addEventListener('click', openPanel);
    if (rulesClose) rulesClose.addEventListener('click', closePanel);
    if (rulesBackdrop) rulesBackdrop.addEventListener('click', closePanel);

    function notifySave() {
        if (saveTimeout) clearTimeout(saveTimeout);
        rulesSavedToast.classList.remove('hidden');
        saveTimeout = setTimeout(() => {
            rulesSavedToast.classList.add('hidden');
        }, 2000);
    }

    function triggerSave() {
        const rules = {
            enableRpgMechanics: inputs.enableRpgMechanics.checked,
            defaultMaxHp: parseInt(inputs.defaultMaxHp.value, 10) || 100,
            defaultMaxMp: parseInt(inputs.defaultMaxMp.value, 10) || 50,
            diceDifficulty: inputs.diceDifficulty.value || 'Normal',
            skillCommentary: inputs.skillCommentary.checked,
            backgroundSimulation: inputs.backgroundSimulation.checked,
            autoLorebookGrowth: inputs.autoLorebookGrowth.checked,
            enableNpcRegistry: inputs.enableNpcRegistry ? inputs.enableNpcRegistry.checked : false,
            enableWorldForge: inputs.enableWorldForge ? inputs.enableWorldForge.checked : false,
            enableEmergentSimulation: inputs.enableEmergentSimulation ? inputs.enableEmergentSimulation.checked : false,
            enableFactionReputation: inputs.enableFactionReputation ? inputs.enableFactionReputation.checked : false,
            enableCampaignKit: inputs.enableCampaignKit ? inputs.enableCampaignKit.checked : false,
            campaignKitId: inputs.campaignKitId ? inputs.campaignKitId.value : '',
            enableWorldObservatory: inputs.enableWorldObservatory ? inputs.enableWorldObservatory.checked : false,
            enableCommerce: inputs.enableCommerce ? inputs.enableCommerce.checked : false,
            enableCommerceUi: inputs.enableCommerceUi ? inputs.enableCommerceUi.checked : false,
            economyProfile: inputs.economyProfile ? inputs.economyProfile.value : 'normal',
            playerRole: inputs.playerRole ? inputs.playerRole.value : 'merchant',
            enableNpcAgency: inputs.enableNpcAgency ? inputs.enableNpcAgency.checked : false,
            enableDomainMode: inputs.enableDomainMode ? inputs.enableDomainMode.checked : false,
            enableDomainAudience: inputs.enableDomainAudience ? inputs.enableDomainAudience.checked : false,
            enableDomainRivals: inputs.enableDomainRivals ? inputs.enableDomainRivals.checked : false,
            enableDomainMissions: inputs.enableDomainMissions ? inputs.enableDomainMissions.checked : false,
            enableMassBattle: inputs.enableMassBattle ? inputs.enableMassBattle.checked : false,
            enableGuildMode: inputs.enableGuildMode ? inputs.enableGuildMode.checked : false,
            enableGuildRequests: inputs.enableGuildRequests ? inputs.enableGuildRequests.checked : false,
            enableGuildParties: inputs.enableGuildParties ? inputs.enableGuildParties.checked : false,
            enableNpcRelationships: inputs.enableNpcRelationships ? inputs.enableNpcRelationships.checked : false,
            enableTravelEncounters: inputs.enableTravelEncounters ? inputs.enableTravelEncounters.checked : false,
            travelEncounterDensity: inputs.travelEncounterDensity ? inputs.travelEncounterDensity.value : 'medium',
            simIntervalTurns: inputs.simIntervalTurns ? (parseInt(inputs.simIntervalTurns.value, 10) || 5) : 5
        };
        vscode.postMessage({ type: 'updateGameRules', rules });
        notifySave();
    }

    // Bind change events
    Object.values(inputs).forEach(input => {
        if (!input) return;
        if (input.type === 'checkbox') {
            input.addEventListener('change', triggerSave);
        } else {
            input.addEventListener('change', triggerSave);
            // Auto save on blur for number/text inputs
            input.addEventListener('blur', triggerSave);
        }
    });

    window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'gameRules' && message.rules) {
            const rules = message.rules;
            if (rules.enableRpgMechanics !== undefined) inputs.enableRpgMechanics.checked = rules.enableRpgMechanics;
            if (rules.defaultMaxHp !== undefined) inputs.defaultMaxHp.value = rules.defaultMaxHp;
            if (rules.defaultMaxMp !== undefined) inputs.defaultMaxMp.value = rules.defaultMaxMp;
            if (rules.diceDifficulty !== undefined) inputs.diceDifficulty.value = rules.diceDifficulty;
            if (rules.skillCommentary !== undefined) inputs.skillCommentary.checked = rules.skillCommentary;
            if (rules.backgroundSimulation !== undefined) inputs.backgroundSimulation.checked = rules.backgroundSimulation;
            if (rules.autoLorebookGrowth !== undefined) inputs.autoLorebookGrowth.checked = rules.autoLorebookGrowth;
            if (rules.enableNpcRegistry !== undefined && inputs.enableNpcRegistry) inputs.enableNpcRegistry.checked = rules.enableNpcRegistry;
            if (rules.enableWorldForge !== undefined && inputs.enableWorldForge) inputs.enableWorldForge.checked = rules.enableWorldForge;
            if (rules.enableEmergentSimulation !== undefined && inputs.enableEmergentSimulation) inputs.enableEmergentSimulation.checked = rules.enableEmergentSimulation;
            if (rules.enableFactionReputation !== undefined && inputs.enableFactionReputation) inputs.enableFactionReputation.checked = rules.enableFactionReputation;
            if (rules.enableCampaignKit !== undefined && inputs.enableCampaignKit) inputs.enableCampaignKit.checked = rules.enableCampaignKit;
            if (rules.campaignKitId !== undefined && inputs.campaignKitId) inputs.campaignKitId.value = rules.campaignKitId || '';
            if (rules.enableWorldObservatory !== undefined && inputs.enableWorldObservatory) inputs.enableWorldObservatory.checked = rules.enableWorldObservatory;
            if (rules.enableCommerce !== undefined && inputs.enableCommerce) inputs.enableCommerce.checked = rules.enableCommerce;
            if (rules.enableCommerceUi !== undefined && inputs.enableCommerceUi) inputs.enableCommerceUi.checked = rules.enableCommerceUi;
            if (rules.economyProfile !== undefined && inputs.economyProfile) inputs.economyProfile.value = rules.economyProfile;
            if (rules.playerRole !== undefined && inputs.playerRole) inputs.playerRole.value = rules.playerRole;
            if (rules.enableNpcAgency !== undefined && inputs.enableNpcAgency) inputs.enableNpcAgency.checked = rules.enableNpcAgency;
            if (rules.enableDomainMode !== undefined && inputs.enableDomainMode) inputs.enableDomainMode.checked = rules.enableDomainMode;
            if (rules.enableDomainAudience !== undefined && inputs.enableDomainAudience) inputs.enableDomainAudience.checked = rules.enableDomainAudience;
            if (rules.enableDomainRivals !== undefined && inputs.enableDomainRivals) inputs.enableDomainRivals.checked = rules.enableDomainRivals;
            if (rules.enableDomainMissions !== undefined && inputs.enableDomainMissions) inputs.enableDomainMissions.checked = rules.enableDomainMissions;
            if (rules.enableMassBattle !== undefined && inputs.enableMassBattle) inputs.enableMassBattle.checked = rules.enableMassBattle;
            if (rules.enableGuildMode !== undefined && inputs.enableGuildMode) inputs.enableGuildMode.checked = rules.enableGuildMode;
            if (rules.enableGuildRequests !== undefined && inputs.enableGuildRequests) inputs.enableGuildRequests.checked = rules.enableGuildRequests;
            if (rules.enableGuildParties !== undefined && inputs.enableGuildParties) inputs.enableGuildParties.checked = rules.enableGuildParties;
            if (rules.enableNpcRelationships !== undefined && inputs.enableNpcRelationships) inputs.enableNpcRelationships.checked = rules.enableNpcRelationships;
            if (rules.enableTravelEncounters !== undefined && inputs.enableTravelEncounters) inputs.enableTravelEncounters.checked = rules.enableTravelEncounters;
            if (rules.travelEncounterDensity !== undefined && inputs.travelEncounterDensity) inputs.travelEncounterDensity.value = rules.travelEncounterDensity;
            if (rules.simIntervalTurns !== undefined && inputs.simIntervalTurns) inputs.simIntervalTurns.value = rules.simIntervalTurns;

            if (message.eventCatalog) {
                renderEventCatalog(message.eventCatalog, rules.excludedEventIds || []);
            }
        }
    });

    let catalogRendered = false;
    
    function renderEventCatalog(catalog, excludedEventIds) {
        const excludedSet = new Set(excludedEventIds);

        if (catalogRendered) {
            catalog.forEach(entry => {
                const cbId = 'gr-ev-' + entry.namespacedId.replace(':', '-');
                const cb = document.getElementById(cbId);
                if (cb) {
                    cb.checked = !excludedSet.has(entry.namespacedId);
                }
            });
            updateCounts(catalog, excludedSet);
            return;
        }
        
        const domainList = document.getElementById('gr-domain-events-list');
        const guildList = document.getElementById('gr-guild-events-list');
        const audienceList = document.getElementById('gr-audience-events-list');
        
        if (!domainList || !guildList || !audienceList) return;
        
        domainList.innerHTML = '';
        guildList.innerHTML = '';
        audienceList.innerHTML = '';
        
        catalog.forEach(entry => {
            const isExcluded = excludedSet.has(entry.namespacedId);
            const isChecked = !isExcluded;
            const cbId = 'gr-ev-' + entry.namespacedId.replace(':', '-');
            
            const row = document.createElement('div');
            row.className = 'img-gen-row';
            row.style.alignItems = 'center';
            row.style.marginBottom = '0.25rem';
            
            const label = document.createElement('label');
            label.htmlFor = cbId;
            label.textContent = entry.label;
            label.setAttribute('data-i18n', 'webview.events.' + entry.label);
            label.title = 'Enabled in this world';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = cbId;
            cb.checked = isChecked;
            cb.addEventListener('change', (e) => {
                vscode.postMessage({
                    type: 'excludeEvent',
                    id: entry.namespacedId,
                    excluded: !e.target.checked
                });
                
                if (e.target.checked) {
                    excludedSet.delete(entry.namespacedId);
                } else {
                    excludedSet.add(entry.namespacedId);
                }
                updateCounts(catalog, excludedSet);
                notifySave();
            });
            
            row.appendChild(label);
            row.appendChild(cb);
            
            if (entry.kind === 'domain') domainList.appendChild(row);
            else if (entry.kind === 'guild') guildList.appendChild(row);
            else if (entry.kind === 'audience') audienceList.appendChild(row);
        });
        
        updateCounts(catalog, excludedSet);
        if (window.i18nApplyToElement) {
            window.i18nApplyToElement(domainList);
            window.i18nApplyToElement(guildList);
            window.i18nApplyToElement(audienceList);
        }
        catalogRendered = true;
    }
    
    function updateCounts(catalog, excludedSet) {
        let domainCount = 0, guildCount = 0, audienceCount = 0;
        catalog.forEach(entry => {
            if (!excludedSet.has(entry.namespacedId)) {
                if (entry.kind === 'domain') domainCount++;
                else if (entry.kind === 'guild') guildCount++;
                else if (entry.kind === 'audience') audienceCount++;
            }
        });
        const dCountEl = document.getElementById('gr-domain-count');
        const gCountEl = document.getElementById('gr-guild-count');
        const aCountEl = document.getElementById('gr-audience-count');
        if (dCountEl) dCountEl.textContent = domainCount;
        if (gCountEl) gCountEl.textContent = guildCount;
        if (aCountEl) aCountEl.textContent = audienceCount;
    }

    // Request initial rules
    vscode.postMessage({ type: 'getGameRules' });

})();

/* --- 80-inspector.js --- */
/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'promptContext') {
            renderPromptContext(message.breakdown);
        }
        if (message.type === 'gameStateUpdate') {
            if (typeof shouldApplyGameStateUpdate === 'function' && !shouldApplyGameStateUpdate(message)) {
                return;
            }
            if (message.turnResult) {
                renderTurnResult(message.turnResult);
            }
            if (message.schemaErrors) {
                renderSchemaErrors(message.schemaErrors);
            } else if (message.state) {
                renderSchemaErrors([]);
            }
            if (message.state) {
                renderHiddenState(message.state.hiddenState);
            }
        }
        if (message.type === 'gitTimelineStatus') {
            renderGitTimeline(message);
        }
        if (message.type === 'chronicleData') {
            renderChronicle(message.chapters);
        }
        if (message.type === 'replayExportResult') {
            renderReplayExportResult(message);
        }
    });

    const refreshBtn = document.getElementById('inspector-git-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', requestGitTimeline);
    }
    const chronicleRefreshBtn = document.getElementById('inspector-chronicle-refresh-btn');
    if (chronicleRefreshBtn) {
        chronicleRefreshBtn.addEventListener('click', requestChronicle);
    }
    const replayExportBtn = document.getElementById('inspector-replay-export-btn');
    if (replayExportBtn) {
        replayExportBtn.addEventListener('click', requestReplayExport);
    }

    requestGitTimeline();
    requestChronicle();
});

function requestReplayExport() {
    const formatEl = document.getElementById('inspector-replay-format');
    const imagesEl = document.getElementById('inspector-replay-images');
    const gmEl = document.getElementById('inspector-replay-gm');
    const diceEl = document.getElementById('inspector-replay-dice');
    const statusEl = document.getElementById('inspector-replay-status');
    const btn = document.getElementById('inspector-replay-export-btn');
    const format = formatEl && formatEl.value === 'html' ? 'html' : 'markdown';
    if (statusEl && typeof T === 'function') {
        statusEl.textContent = T('webview.inspector.replayExporting');
    }
    if (btn) {
        btn.disabled = true;
    }
    vscode.postMessage({
        type: 'exportReplay',
        format,
        includeImages: imagesEl ? imagesEl.checked : true,
        includeGm: gmEl ? gmEl.checked : true,
        includeDice: diceEl ? diceEl.checked : false
    });
}

function renderReplayExportResult(result) {
    const statusEl = document.getElementById('inspector-replay-status');
    const btn = document.getElementById('inspector-replay-export-btn');
    if (btn) {
        btn.disabled = false;
    }
    if (!statusEl) { return; }
    if (result && result.ok) {
        statusEl.textContent = typeof T === 'function'
            ? T('webview.inspector.replayResultOk', { path: String(result.path || '') })
            : `Exported: ${result.path || ''}`;
    } else {
        statusEl.textContent = typeof T === 'function'
            ? T('webview.inspector.replayResultFail', { message: String(result?.message || '') })
            : String(result?.message || 'Export failed');
    }
}

function requestChronicle() {
    vscode.postMessage({ type: 'requestChronicle' });
}

function renderChronicle(chapters) {
    const listEl = document.getElementById('inspector-chronicle-list');
    if (!listEl) { return; }
    listEl.innerHTML = '';
    const items = Array.isArray(chapters) ? chapters : [];
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-text';
        empty.textContent = typeof T === 'function'
            ? T('webview.inspector.chronicleEmpty')
            : 'No chronicle entries yet. Complete GM turns to build the journal.';
        listEl.appendChild(empty);
        return;
    }

    for (const chapter of items) {
        if (!chapter || typeof chapter.title !== 'string') { continue; }
        const details = document.createElement('details');
        details.className = 'inspector-item';
        details.open = items.length <= 2;

        const summary = document.createElement('summary');
        const eventCount = Array.isArray(chapter.events) ? chapter.events.length : 0;
        const countLabel = typeof T === 'function'
            ? T('webview.inspector.chronicleEventCount', { count: String(eventCount) })
            : `${eventCount} events`;
        summary.textContent = `${chapter.title} — ${countLabel}`;
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'inspector-list';
        for (const ev of chapter.events || []) {
            if (!ev || typeof ev.text !== 'string') { continue; }
            const row = document.createElement('div');
            row.className = 'inspector-item';
            const kind = ev.kind ? `[${ev.kind}] ` : '';
            row.textContent = `${kind}${ev.text}`;
            body.appendChild(row);
        }
        details.appendChild(body);
        listEl.appendChild(details);
    }
}

function requestGitTimeline() {
    vscode.postMessage({ type: 'requestGitTimeline' });
}

function renderGitTimeline(status) {
    const currentEl = document.getElementById('inspector-git-current-branch');
    const listEl = document.getElementById('inspector-git-branch-list');
    if (!currentEl || !listEl) { return; }

    if (!status.enabled) {
        currentEl.textContent = typeof T === 'function'
            ? T('webview.inspector.gitTimelineDisabled')
            : 'Git Timeline is not enabled for this workspace yet. Play a turn to be prompted.';
        currentEl.classList.add('empty-text');
        listEl.innerHTML = '';
        return;
    }

    currentEl.classList.remove('empty-text');
    currentEl.textContent = typeof T === 'function'
        ? T('webview.inspector.gitCurrentBranch', { branch: status.currentBranch || '(unknown)' })
        : `Current branch: ${status.currentBranch || '(unknown)'}`;

    listEl.innerHTML = '';
    const branches = Array.isArray(status.branches) ? status.branches : [];
    if (branches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-text';
        empty.textContent = typeof T === 'function'
            ? T('webview.inspector.gitNoBranches')
            : 'No timeline branches yet. Use "Branch from here" on a past turn to create one.';
        listEl.appendChild(empty);
        return;
    }

    for (const b of branches) {
        if (!b || typeof b.name !== 'string') { continue; }
        const row = document.createElement('div');
        row.className = 'inspector-item';

        const label = document.createElement('span');
        label.textContent = b.name + (b.isCurrent ? ' (current)' : '');
        row.appendChild(label);

        if (!b.isCurrent) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn';
            btn.textContent = typeof T === 'function' ? T('webview.inspector.gitSwitch') : 'Switch';
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'switchGitBranch', branchName: b.name });
            });
            row.appendChild(btn);
        }

        listEl.appendChild(row);
    }
}

function contextInspectorDecisionLabel(decision) {
    const key = `webview.inspector.contextInspector.decision.${decision}`;
    return typeof T === 'function' ? T(key) : decision;
}

function contextInspectorCategoryLabel(category) {
    const key = `webview.inspector.contextInspector.category.${category}`;
    return typeof T === 'function' ? T(key) : category;
}

function renderWorldStateParseWarnings(warnings) {
    const container = document.getElementById('inspector-world-state-warnings');
    if (!container) { return; }

    container.innerHTML = '';
    if (!Array.isArray(warnings) || warnings.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const heading = document.createElement('div');
    heading.className = 'inspector-item context-inspector-group-title';
    heading.textContent = typeof T === 'function'
        ? T('webview.inspector.worldStateWarnings.title')
        : 'World state parse warnings';
    container.appendChild(heading);

    for (const line of warnings) {
        const row = document.createElement('div');
        row.className = 'inspector-item world-state-warning';
        row.textContent = String(line);
        container.appendChild(row);
    }
}

function renderContextInspector(report) {
    const container = document.getElementById('inspector-context-inspector');
    if (!container) { return; }

    container.innerHTML = '';
    if (!report || !Array.isArray(report.items) || report.items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const summary = document.createElement('div');
    summary.className = 'inspector-item context-inspector-summary';
    summary.textContent = typeof T === 'function'
        ? T('webview.inspector.contextInspector.summary', {
            target: String(report.targetChars ?? 0),
            original: String(report.totalOriginalChars ?? 0),
            final: String(report.totalFinalChars ?? 0),
            included: String(report.includedCount ?? 0),
            omitted: String(report.omittedCount ?? 0),
            truncated: String(report.truncatedCount ?? 0),
        })
        : `Budget ${report.targetChars} chars | original ${report.totalOriginalChars} | final ${report.totalFinalChars} | included ${report.includedCount} | omitted ${report.omittedCount} | truncated ${report.truncatedCount}`;
    container.appendChild(summary);

    const groups = [
        { key: 'included', titleKey: 'webview.inspector.contextInspector.included', filter: (item) => item.decision === 'included' || item.decision === 'included_pinned' || item.decision === 'truncated_by_budget' },
        { key: 'omitted', titleKey: 'webview.inspector.contextInspector.omitted', filter: (item) => item.decision === 'evicted_by_budget' || item.decision === 'skipped_inactive' || item.decision === 'skipped_empty' },
        { key: 'truncated', titleKey: 'webview.inspector.contextInspector.truncated', filter: (item) => item.decision === 'truncated_by_budget' },
    ];

    for (const group of groups) {
        const items = report.items.filter(group.filter);
        if (items.length === 0) { continue; }

        const heading = document.createElement('div');
        heading.className = 'inspector-item context-inspector-group-title';
        heading.textContent = typeof T === 'function' ? T(group.titleKey) : group.key;
        container.appendChild(heading);

        for (const item of items) {
            const row = document.createElement('details');
            row.className = 'inspector-item prompt-section context-inspector-item';

            const summaryEl = document.createElement('summary');
            const decision = contextInspectorDecisionLabel(item.decision);
            const charsLabel = typeof T === 'function'
                ? T('webview.inspector.contextInspector.chars', {
                    final: String(item.finalChars ?? 0),
                    original: String(item.originalChars ?? 0),
                })
                : `${item.finalChars}/${item.originalChars} chars`;
            summaryEl.innerHTML = `<strong>${escapeHtml(item.label || item.id)}</strong> `
                + `<span class="tag-item">${escapeHtml(contextInspectorCategoryLabel(item.category))}</span> `
                + `<span class="tag-item">P${escapeHtml(String(item.priority ?? 0))}</span> `
                + `<span class="tag-item">${escapeHtml(decision)}</span> `
                + `<span class="tag-item">${escapeHtml(charsLabel)}</span> `
                + `<span class="tag-item">~${escapeHtml(String(item.tokenEstimate ?? 0))} tok</span>`;
            row.appendChild(summaryEl);

            if (item.preview) {
                const preview = document.createElement('pre');
                preview.className = 'prompt-preview';
                preview.textContent = item.preview;
                row.appendChild(preview);
            }

            container.appendChild(row);
        }
    }
}

function renderPromptContext(breakdown) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const summaryDiv = document.getElementById('inspector-prompt-summary');
    const sectionsDiv = document.getElementById('inspector-prompt-sections');
    const memoryDiv = document.getElementById('inspector-memory-matches');
    const loreDiv = document.getElementById('inspector-lore-matches');

    if (!breakdown || !summaryDiv || !sectionsDiv) {
        return;
    }

    if (emptyText) {
        emptyText.classList.add('hidden');
    }
    if (content) {
        content.classList.remove('hidden');
    }

    const backend = breakdown.memoryBackend || 'auto';
    const tokens = breakdown.totalTokensEstimate ?? 0;
    const chars = breakdown.totalChars ?? 0;
    const baseSummary = typeof T === 'function'
        ? T('webview.inspector.promptSummary', {
            backend,
            tokens: String(tokens),
            chars: String(chars)
        })
        : `Backend: ${backend} ? ~${tokens} tokens ? ${chars} chars`;
    const budget = breakdown.budget;
    const budgetSummary = budget
        ? (typeof T === 'function'
            ? T('webview.inspector.promptBudget', {
                mode: String(budget.mode || 'auto'),
                tokens: String(budget.targetTokens || 0)
            })
            : `Budget: ${budget.mode || 'auto'} / ~${budget.targetTokens || 0} tokens`)
        : '';
    summaryDiv.textContent = budgetSummary ? `${baseSummary} | ${budgetSummary}` : baseSummary;
    const budgetDetails = Array.isArray(budget?.details)
        ? budget.details.filter((d) => d && typeof d.label === 'string').slice(0, 9)
        : [];
    if (budgetDetails.length > 0) {
        const details = document.createElement('div');
        details.className = 'prompt-budget-details';
        details.textContent = budgetDetails
            .map((d) => `${d.label}: ${Number(d.usedChars || 0)}/${Number(d.limitChars || 0)} chars`)
            .join(' | ');
        summaryDiv.appendChild(details);
    }

    renderContextInspector(breakdown.contextInspector);
    renderWorldStateParseWarnings(breakdown.worldStateParseWarnings);

    sectionsDiv.innerHTML = '';
    (breakdown.sections || []).forEach((section) => {
        const row = document.createElement('details');
        row.className = 'inspector-item prompt-section';
        row.innerHTML = `
            <summary><strong>${escapeHtml(section.label)}</strong>
              <span class="tag-item">~${section.tokenEstimate} tok</span>
            </summary>
            <pre class="prompt-preview">${escapeHtml(section.text)}</pre>
        `;
        sectionsDiv.appendChild(row);
    });
    if (!breakdown.sections || breakdown.sections.length === 0) {
        sectionsDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPromptSections'))}</span>`;
    }

    if (memoryDiv) {
        memoryDiv.innerHTML = '';
        const matches = breakdown.memoryMatches || [];
        if (matches.length === 0) {
            memoryDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noMemory'))}</span>`;
        } else {
            matches.forEach((m) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<strong>${escapeHtml(m.label)}</strong> <span class="tag-item">${escapeHtml(m.source)}</span><br><span class="patch-value">${escapeHtml(m.preview)}</span>`;
                memoryDiv.appendChild(row);
            });
        }
    }

    if (loreDiv) {
        loreDiv.innerHTML = '';
        const lore = breakdown.matchedLore || [];
        if (lore.length === 0) {
            loreDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        } else {
            lore.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                const keys = (entry.keys || []).join(', ');
                row.innerHTML = `<strong>📖 ${escapeHtml(entry.label)}</strong>${keys ? ` <span class="tag-item">${escapeHtml(keys)}</span>` : ''}<br><span class="patch-value">${escapeHtml(entry.preview)}</span>`;
                loreDiv.appendChild(row);
            });
        }
    }
}

function renderSchemaErrors(errors) {
    const schemaDiv = document.getElementById('inspector-schema-errors');
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    if (!schemaDiv) {
        return;
    }

    if (errors && errors.length > 0) {
        if (emptyText) {
            emptyText.classList.add('hidden');
        }
        if (content) {
            content.classList.remove('hidden');
        }
        schemaDiv.innerHTML = '';
        errors.forEach((err) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            row.style.color = 'var(--text-danger)';
            row.textContent = String(err);
            schemaDiv.appendChild(row);
        });
    } else {
        schemaDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noSchemaErrors') ? T('webview.inspector.noSchemaErrors') : 'No schema errors')}</span>`;
    }
}

function renderHiddenState(hiddenState) {
    const hiddenStateDiv = document.getElementById('inspector-hidden-state');
    if (!hiddenStateDiv) return;
    
    if (hiddenState && Object.keys(hiddenState).length > 0) {
        hiddenStateDiv.textContent = JSON.stringify(hiddenState, null, 2);
    } else {
        hiddenStateDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noHiddenState') ? T('webview.inspector.noHiddenState') : 'No hidden state')}</span>`;
    }
}

function renderTurnResult(turnResult) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const turnIdDiv = document.getElementById('inspector-turn-id');
    const integrityDiv = document.getElementById('inspector-integrity');
    const diceLedgerDiv = document.getElementById('inspector-dice-ledger');
    const statePatchDiv = document.getElementById('inspector-state-patch');
    const lorebookDiv = document.getElementById('inspector-lorebook');
    const livingWorldOpsSection = document.getElementById('inspector-living-world-ops-section');
    const livingWorldOpsDiv = document.getElementById('inspector-living-world-ops');

    if (!turnResult || !emptyText || !content) {
        return;
    }

    emptyText.classList.add('hidden');
    content.classList.remove('hidden');

    if (turnIdDiv) {
        turnIdDiv.innerHTML = '';
        const idSpan = document.createElement('span');
        idSpan.textContent = turnResult.turnId || '?';
        turnIdDiv.appendChild(idSpan);

        if (turnResult.turnId) {
            const branchBtn = document.createElement('button');
            branchBtn.className = 'glass-btn';
            branchBtn.style.marginLeft = '1rem';
            branchBtn.style.padding = '2px 6px';
            branchBtn.style.fontSize = '12px';
            branchBtn.textContent = '⎇ Branch Timeline';
            branchBtn.title = 'Branch timeline from this turn';
            branchBtn.onclick = () => {
                // Confirmation happens extension-side (native modal); webview confirm()
                // is silently blocked by the VS Code webview iframe sandbox.
                vscode.postMessage({ type: 'branchTimeline', turnId: turnResult.turnId });
            };
            turnIdDiv.appendChild(branchBtn);
        }
    }

    if (integrityDiv) {
        integrityDiv.innerHTML = '';
        const rows = [];
        if (turnResult.beforeHash) {
            rows.push({ label: 'before', value: turnResult.beforeHash });
        }
        if (turnResult.afterHash) {
            rows.push({ label: 'after', value: turnResult.afterHash });
        }
        if (turnResult.appliedAt) {
            rows.push({ label: 'applied', value: turnResult.appliedAt });
        }
        if (rows.length === 0) {
            integrityDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noIntegrity'))}</span>`;
        } else {
            rows.forEach((row) => {
                const el = document.createElement('div');
                el.className = 'inspector-item';
                el.innerHTML = `<strong>${escapeHtml(row.label)}</strong> <code class="patch-value">${escapeHtml(row.value)}</code>`;
                integrityDiv.appendChild(el);
            });
        }
    }

    if (diceLedgerDiv) {
        diceLedgerDiv.innerHTML = '';
        if (turnResult.diceLedger && turnResult.diceLedger.length > 0) {
            const totalCount = turnResult.diceLedger.length;
            const visibleLedger = turnResult.diceLedger.slice(0, 30);
            visibleLedger.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                let html = `<strong>${escapeHtml(entry.formula)}</strong> ➔ <span>${entry.total}</span>`;
                if (entry.reason) {
                    html += ` <span class="tag-item">${escapeHtml(entry.reason)}</span>`;
                }
                if (entry.success !== undefined) {
                    const tag = entry.success
                        ? T('webview.inspector.success')
                        : T('webview.inspector.failure');
                    const color = entry.success ? 'var(--text-success)' : 'var(--text-danger)';
                    html += ` <span style="color:${color}">[${escapeHtml(tag)}]</span>`;
                }
                row.innerHTML = html;
                diceLedgerDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.moreRolls', { count: String(totalCount - 30) });
                diceLedgerDiv.appendChild(row);
            }
        } else {
            diceLedgerDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noDice'))}</span>`;
        }
    }

    if (statePatchDiv) {
        statePatchDiv.innerHTML = '';
        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            const totalCount = turnResult.statePatch.length;
            const visiblePatches = turnResult.statePatch.slice(0, 30);
            visiblePatches.forEach((patch) => {
                const row = document.createElement('div');
                row.className = 'inspector-item diff-item';

                let icon = '🔄';
                let color = 'var(--text-color)';
                if (patch.op === 'add') { icon = '➕'; color = 'var(--text-success)'; }
                else if (patch.op === 'remove') { icon = '➖'; color = 'var(--text-danger)'; }

                row.innerHTML = `
                    <span title="${escapeHtml(patch.op)}">${icon}</span>
                    <code style="color:${color}">${escapeHtml(patch.path)}</code>
                    ${patch.value !== undefined ? `➔ <span class="patch-value">${escapeHtml(JSON.stringify(patch.value))}</span>` : ''}
                `;
                statePatchDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.morePatches', { count: String(totalCount - 30) });
                statePatchDiv.appendChild(row);
            }
        } else {
            statePatchDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPatch'))}</span>`;
        }
    }

    if (lorebookDiv) {
        lorebookDiv.innerHTML = '';
        if (turnResult.triggeredLore && turnResult.triggeredLore.length > 0) {
            turnResult.triggeredLore.forEach((label) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<span class="tag-item">📖 ${escapeHtml(label)}</span>`;
                lorebookDiv.appendChild(row);
            });
        } else {
            lorebookDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        }
    }

    renderLivingWorldOps(turnResult, livingWorldOpsSection, livingWorldOpsDiv);
}

function renderLivingWorldOps(turnResult, section, listEl) {
    if (!section || !listEl) { return; }

    const tradeOps = Array.isArray(turnResult?.tradeOps) ? turnResult.tradeOps : [];
    const npcAgencyOps = Array.isArray(turnResult?.npcAgencyOps) ? turnResult.npcAgencyOps : [];
    const hasOps = tradeOps.length > 0 || npcAgencyOps.length > 0;
    section.classList.toggle('hidden', !hasOps);
    listEl.innerHTML = '';
    if (!hasOps) { return; }

    if (tradeOps.length > 0) {
        const head = document.createElement('div');
        head.className = 'inspector-item';
        head.innerHTML = `<strong>${escapeHtml(T('webview.inspector.tradeOps'))}</strong> <span class="tag-item">${tradeOps.length}</span>`;
        listEl.appendChild(head);
        tradeOps.slice(0, 12).forEach((op) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            row.innerHTML = `
                <span class="tag-item">${escapeHtml(op.op || '?')}</span>
                <span>${escapeHtml(op.qty ?? '?')} x ${escapeHtml(op.commodityId || '?')}</span>
                <code class="patch-value">@${escapeHtml(op.marketLocationId || '?')}</code>
            `;
            listEl.appendChild(row);
        });
    }

    if (npcAgencyOps.length > 0) {
        const head = document.createElement('div');
        head.className = 'inspector-item';
        head.innerHTML = `<strong>${escapeHtml(T('webview.inspector.npcAgencyOps'))}</strong> <span class="tag-item">${npcAgencyOps.length}</span>`;
        listEl.appendChild(head);
        npcAgencyOps.slice(0, 12).forEach((op) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            const precision = op.precision || 'unknown';
            if (precision === 'unknown') {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span class="tag-item">${escapeHtml(T('webview.world.npcWhereaboutsUnknown'))}</span>
                `;
            } else if (precision === 'approximate') {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span>→ ${escapeHtml(T('webview.world.npcHeadingVague'))}</span>
                    <span class="tag-item">T${escapeHtml(op.arrivesTurn ?? '?')}</span>
                `;
            } else {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span>→ ${escapeHtml(op.locationId || '?')}</span>
                    <span class="tag-item">T${escapeHtml(op.arrivesTurn ?? '?')}</span>
                    ${op.agenda ? `<span class="tag-item">${escapeHtml(op.agenda)}</span>` : ''}
                `;
            }
            listEl.appendChild(row);
        });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

// Debug Console: bulk world sim + sandbox quick commands
(function () {
    const section = document.getElementById('inspector-debug-console-section');
    const stepsInput = document.getElementById('inspector-bulk-sim-steps');
    const runBtn = document.getElementById('inspector-bulk-sim-run');
    const resultEl = document.getElementById('inspector-bulk-sim-result');
    const sandboxBadge = document.getElementById('inspector-debug-sandbox-badge');
    const quickWrap = document.getElementById('inspector-debug-quick-wrap');
    const quickChips = document.getElementById('inspector-debug-quick-chips');
    const DEFAULT_QUICK = ['ヘルプ', '状態', '宿で休む', 'エルダの好感度を上げて', '地図の霧を晴らして', 'HPを全回復'];
    let maxSteps = 50;
    let running = false;

    function setVisible(show) {
        if (!section) { return; }
        section.classList.toggle('hidden', !show);
    }

    function renderQuickChips(commands) {
        if (!quickChips) { return; }
        quickChips.innerHTML = '';
        const list = Array.isArray(commands) && commands.length > 0 ? commands : DEFAULT_QUICK;
        list.forEach((cmd) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'start-hub-preset-chip';
            chip.textContent = cmd;
            chip.addEventListener('click', () => {
                vscode.postMessage({ type: 'insertChatText', text: cmd });
            });
            quickChips.appendChild(chip);
        });
    }

    function setSandboxUi(active) {
        if (sandboxBadge) {
            sandboxBadge.classList.toggle('hidden', !active);
        }
        if (quickWrap) {
            quickWrap.classList.toggle('hidden', !active);
        }
        if (active) {
            renderQuickChips(DEFAULT_QUICK);
        }
    }

    function renderSummary(summary) {
        if (!resultEl || typeof T !== 'function') { return; }
        resultEl.textContent = T('webview.inspector.bulkSimResult', {
            start: String(summary.startWorldTurn),
            end: String(summary.endWorldTurn),
            events: String(summary.totalEventsEmitted),
            available: String(summary.questHooksAvailable),
        });
        if (summary.notableEvents && summary.notableEvents.length > 0) {
            const lines = summary.notableEvents.map((e) => `[${e.severity}] T${e.worldTurn}: ${e.message}`);
            resultEl.textContent += '\n' + lines.join('\n');
        }
    }

    if (runBtn && stepsInput) {
        runBtn.addEventListener('click', () => {
            if (running) { return; }
            const steps = parseInt(stepsInput.value, 10) || 0;
            if (steps < 1) { return; }
            running = true;
            runBtn.disabled = true;
            if (resultEl && typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.bulkSimRunning');
            }
            vscode.postMessage({ type: 'bulkAdvanceWorldSim', steps: Math.min(steps, maxSteps) });
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            setVisible(show);
            setSandboxUi(!!message.debugScenarioActive);
            if (typeof message.bulkWorldSimMaxSteps === 'number' && message.bulkWorldSimMaxSteps > 0) {
                maxSteps = message.bulkWorldSimMaxSteps;
                if (stepsInput) {
                    stepsInput.max = String(maxSteps);
                    const cur = parseInt(stepsInput.value, 10) || 10;
                    if (cur > maxSteps) { stepsInput.value = String(maxSteps); }
                }
            }
        }
        if (message.type === 'bulkWorldSimResult') {
            running = false;
            if (runBtn) { runBtn.disabled = false; }
            if (!resultEl) { return; }
            if (message.ok && message.summary) {
                renderSummary(message.summary);
            } else if (typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.bulkSimFailed', {
                    reason: String(message.reason || 'unknown'),
                });
            }
        }
    });

    vscode.postMessage({ type: 'getDebugCapabilities' });
})();

// Living World market debug (Inspector, commerce ON + debug console visible)
(function () {
    const wrap = document.getElementById('inspector-lw-market-debug');
    const locSelect = document.getElementById('inspector-lw-market-location');
    const commoditySelect = document.getElementById('inspector-lw-market-commodity');
    const multInput = document.getElementById('inspector-lw-market-mult');
    const applyBtn = document.getElementById('inspector-lw-market-apply');
    const resultEl = document.getElementById('inspector-lw-market-result');
    let busy = false;

    function fillSelect(select, items, fallbackLabel) {
        if (!select) { return; }
        select.innerHTML = '';
        (items || []).forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name || item.id;
            select.appendChild(opt);
        });
        if (!select.options.length && fallbackLabel) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = fallbackLabel;
            select.appendChild(opt);
        }
    }

    function setVisible(show) {
        if (wrap) {
            wrap.classList.toggle('hidden', !show);
        }
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            if (busy || !locSelect || !commoditySelect || !multInput) { return; }
            const locationId = locSelect.value;
            const commodityId = commoditySelect.value;
            const multiplier = parseFloat(multInput.value);
            if (!locationId || !commodityId || !Number.isFinite(multiplier) || multiplier <= 0) { return; }
            busy = true;
            applyBtn.disabled = true;
            if (resultEl && typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.lwMarketRunning');
            }
            vscode.postMessage({
                type: 'livingWorldMarketDebug',
                locationId,
                commodityId,
                multiplier,
            });
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'debugCapabilities') {
            setVisible(!!message.livingWorldMarketDebug);
            if (message.livingWorldMarketDebug) {
                fillSelect(locSelect, message.marketLocations, '—');
                fillSelect(commoditySelect, message.marketCommodities, '—');
            }
        }
        if (message.type === 'livingWorldMarketDebugResult') {
            busy = false;
            if (applyBtn) { applyBtn.disabled = false; }
            if (!resultEl || typeof T !== 'function') { return; }
            if (message.ok) {
                resultEl.textContent = T('webview.inspector.lwMarketDone', {
                    applied: String(message.applied ?? 1),
                });
            } else {
                resultEl.textContent = T('webview.inspector.lwMarketFailed', {
                    reason: String(message.reason || 'unknown'),
                });
            }
        }
    });
})();

/* --- 80a-debug-trace.js --- */
/* global window, document, T, escapeHtml */
/* Debug Trace Inspector (Phase B): read-only render of `debugTraceUpdate` messages.
   No postMessage other than none — audience filtering is a pure local projection,
   mirroring src/debugTraceCore.ts:projectDebugTraceBuffer(). See
   docs/DEBUG_TRACE_INSPECTOR_UI_DESIGN.md for the full design. */

(function () {
    const section = document.getElementById('inspector-debug-trace-section');
    const toggle = document.getElementById('debug-trace-audience-toggle');
    const warningsEl = document.getElementById('inspector-debug-trace-warnings');
    const runsEl = document.getElementById('inspector-debug-trace-runs');

    if (!section || !toggle || !warningsEl || !runsEl) {
        return;
    }

    const AUDIENCES = ['internal', 'gm_safe', 'player_safe'];
    let currentAudience = 'internal';
    let lastBuffer = null;
    let lastLinkWarnings = [];
    // UX polish (2026-07-04 review): preserve user expand/collapse state across the
    // frequent `debugTraceUpdate` re-renders a multi-step bulk sim produces (one
    // message per simulated step). Only a run's *first* appearance gets a default.
    const openEntryIds = new Set(); // `${runId}:${traceId}`
    const runOpenState = new Map(); // runId -> boolean, once known (first-seen default applied once)

    function audienceRank(audience) {
        if (audience === 'internal') { return 2; }
        if (audience === 'gm_safe') { return 1; }
        if (audience === 'player_safe') { return 0; }
        return -1;
    }

    function audienceLabel(audience) {
        const key = `webview.inspector.debugTrace.audience.${audience === 'gm_safe' ? 'gmSafe' : audience === 'player_safe' ? 'playerSafe' : 'internal'}`;
        return typeof T === 'function' ? T(key) : audience;
    }

    function phaseLabel(phase) {
        const key = `webview.inspector.debugTrace.phase.${phase}`;
        return typeof T === 'function' ? T(key) : phase;
    }

    // Local projection mirroring debugTraceCore.ts:projectDebugTraceBuffer — no host round-trip.
    function projectEntries(entries, audience) {
        const maxRank = audienceRank(audience);
        return entries.filter((e) => audienceRank(e.audience) <= maxRank);
    }

    function groupByRun(entries) {
        const order = [];
        const byRun = new Map();
        for (const entry of entries) {
            if (!byRun.has(entry.runId)) {
                byRun.set(entry.runId, []);
                order.push(entry.runId);
            }
            byRun.get(entry.runId).push(entry);
        }
        // Newest run last-in-buffer first.
        return order.reverse().map((runId) => ({ runId, entries: byRun.get(runId) }));
    }

    // Adjacency-grouped depth-first order: a child renders immediately after its
    // parent (and before any of the parent's later siblings), instead of raw
    // insertion order. debugTraceHostCore/debugTraceEmitCore append phase-by-phase
    // (all scans, then the gate, then all per-NPC decisions, then all effects), so
    // without this a decision's own effect row can land several rows below
    // unrelated sibling decisions — confirmed during the 2026-07-04 UX review.
    function traceEntryKey(runId, traceId) {
        return `${runId}:${traceId}`;
    }

    function buildOrderedEntries(entries) {
        const byId = new Map(entries.map((e) => [e.traceId, e]));
        const childrenByParent = new Map();
        const roots = [];
        for (const e of entries) {
            const parent = e.parentTraceId && e.parentTraceId !== e.traceId ? byId.get(e.parentTraceId) : undefined;
            if (parent) {
                if (!childrenByParent.has(parent.traceId)) { childrenByParent.set(parent.traceId, []); }
                childrenByParent.get(parent.traceId).push(e);
            } else {
                roots.push(e);
            }
        }
        const out = [];
        function visit(entry, depth, ancestors) {
            out.push({ entry, depth });
            const kids = childrenByParent.get(entry.traceId) || [];
            for (const kid of kids) {
                if (ancestors.has(kid.traceId)) { continue; } // defensive cycle guard
                const nextAncestors = new Set(ancestors);
                nextAncestors.add(kid.traceId);
                visit(kid, depth + 1, nextAncestors);
            }
        }
        for (const root of roots) {
            visit(root, 0, new Set([root.traceId]));
        }
        return out;
    }

    function renderConditions(conditions) {
        if (!Array.isArray(conditions) || conditions.length === 0) { return ''; }
        // Failures first — the diagnostic value of a conditions[] list is almost
        // always "which check failed", so surface that before the checks that passed.
        const ordered = conditions
            .map((c, idx) => ({ c, idx }))
            .sort((a, b) => (a.c.result === b.c.result ? a.idx - b.idx : (a.c.result ? 1 : -1)));
        const rows = ordered.map(({ c }) => {
            const cls = c.result ? 'pass' : 'fail';
            const mark = c.result ? '✓' : '✗';
            let extra = '';
            if (c.actual !== undefined || c.expected !== undefined) {
                extra = ` (${T ? T('webview.inspector.debugTrace.actual') : 'actual'}: ${escapeHtml(c.actual)}, ${T ? T('webview.inspector.debugTrace.expected') : 'expected'}: ${escapeHtml(c.expected)})`;
            }
            return `<div class="debug-trace-cond debug-trace-cond-${cls}">${mark} ${escapeHtml(c.label)}${extra}</div>`;
        }).join('');
        return `<div class="debug-trace-conditions">${rows}</div>`;
    }

    function renderConditionsBadge(conditions) {
        if (!Array.isArray(conditions) || conditions.length === 0) { return ''; }
        const passed = conditions.filter((c) => c.result).length;
        const allPass = passed === conditions.length;
        return `<span class="tag-item debug-trace-cond-badge-${allPass ? 'pass' : 'fail'}">${passed}/${conditions.length}${allPass ? '✓' : '✗'}</span>`;
    }

    function renderRefs(refs) {
        if (!Array.isArray(refs) || refs.length === 0) { return ''; }
        return `<div class="debug-trace-refs">${refs.map((r) => `<span class="tag-item">${escapeHtml(r.kind)}:${escapeHtml(r.id)}</span>`).join('')}</div>`;
    }

    function entryDomId(runId, traceId) {
        return `debug-trace-entry-${runId}-${traceId}`;
    }

    function renderEntry(entry, depth) {
        const turnBadge = entry.worldTurn !== undefined
            ? `<span class="tag-item">T${escapeHtml(String(entry.worldTurn))}</span>` : '';
        const labelParts = [entry.subsystem, entry.ruleId, entry.decision].filter(Boolean);
        const label = labelParts.map((p) => escapeHtml(p)).join(' · ') || escapeHtml(entry.subsystem);
        let parentLink = '';
        if (entry.parentTraceId) {
            const parentText = typeof T === 'function'
                ? T('webview.inspector.debugTrace.parentLink', { traceId: entry.parentTraceId })
                : `parent: ${entry.parentTraceId}`;
            parentLink = `<div class="debug-trace-parent-link" data-goto-run="${escapeHtml(entry.runId)}" data-goto-trace="${escapeHtml(entry.parentTraceId)}">↑ ${escapeHtml(parentText)}</div>`;
        }
        const isOpen = openEntryIds.has(traceEntryKey(entry.runId, entry.traceId));
        return `
            <details class="inspector-item debug-trace-entry" id="${escapeHtml(entryDomId(entry.runId, entry.traceId))}" data-run-id="${escapeHtml(entry.runId)}" data-trace-id="${escapeHtml(entry.traceId)}" style="margin-left:${depth * 16}px"${isOpen ? ' open' : ''}>
                <summary>
                    <span class="tag-item debug-trace-phase-${escapeHtml(entry.phase)}">${escapeHtml(phaseLabel(entry.phase))}</span>
                    <strong>${label}</strong>
                    ${turnBadge}
                    ${renderConditionsBadge(entry.conditions)}
                    <span class="tag-item debug-trace-aud-${escapeHtml(entry.audience)}">${escapeHtml(audienceLabel(entry.audience))}</span>
                </summary>
                <div class="debug-trace-body">
                    <div class="debug-trace-message">${escapeHtml(entry.message)}</div>
                    ${renderConditions(entry.conditions)}
                    ${renderRefs(entry.inputRefs)}
                    ${renderRefs(entry.outputRefs)}
                    ${parentLink}
                </div>
            </details>
        `;
    }

    function goToTraceEntry(runId, traceId) {
        if (!runId || !traceId) { return; }
        const el = document.getElementById(entryDomId(runId, traceId));
        if (!el) { return; }
        el.open = true;
        openEntryIds.add(traceEntryKey(runId, traceId));
        el.classList.add('debug-trace-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('debug-trace-highlight'), 1200);
    }

    function projectLinkWarnings(buffer, linkWarnings, audience) {
        if (!buffer || audience === 'internal' || !Array.isArray(linkWarnings)) {
            return linkWarnings || [];
        }
        const visibleKeys = new Set(
            projectEntries(buffer.entries || [], audience).map((e) => traceEntryKey(e.runId, e.traceId))
        );
        return linkWarnings.filter((w) => {
            if (!w.traceId) { return true; }
            if (!w.runId) {
                return (buffer.entries || []).some(
                    (e) => e.traceId === w.traceId && visibleKeys.has(traceEntryKey(e.runId, e.traceId))
                );
            }
            return visibleKeys.has(traceEntryKey(w.runId, w.traceId));
        });
    }

    function renderWarnings(linkWarnings) {
        warningsEl.innerHTML = '';
        const projected = projectLinkWarnings(lastBuffer, linkWarnings, currentAudience);
        if (!Array.isArray(projected) || projected.length === 0) {
            warningsEl.classList.add('hidden');
            return;
        }
        warningsEl.classList.remove('hidden');
        projected.forEach((w) => {
            const row = document.createElement('div');
            row.className = 'debug-trace-warning-item';
            row.textContent = `⚠ ${w.message}`;
            if (w.traceId && w.runId) {
                row.dataset.gotoRun = w.runId;
                row.dataset.gotoTrace = w.traceId;
                row.addEventListener('click', () => goToTraceEntry(w.runId, w.traceId));
            }
            warningsEl.appendChild(row);
        });
    }

    function emptyMessage(key) {
        return `<span class="empty-text">${escapeHtml(typeof T === 'function' ? T(key) : key)}</span>`;
    }

    function renderRuns(buffer, audience) {
        if (!buffer || !Array.isArray(buffer.entries) || buffer.entries.length === 0) {
            runsEl.innerHTML = emptyMessage('webview.inspector.debugTrace.empty');
            return;
        }
        const visible = projectEntries(buffer.entries, audience);
        if (visible.length === 0) {
            // Distinct from "no data at all": entries exist, this audience just
            // doesn't see any of them (e.g. Player-safe with only internal/gm_safe rows).
            runsEl.innerHTML = emptyMessage('webview.inspector.debugTrace.emptyForAudience');
            return;
        }
        const runs = groupByRun(visible);
        let html = '';
        runs.forEach((run, index) => {
            if (!runOpenState.has(run.runId)) {
                // First time we've seen this runId: default the newest run open, older ones closed.
                runOpenState.set(run.runId, index === 0);
            }
            const isOpen = runOpenState.get(run.runId);
            const countLabel = typeof T === 'function'
                ? T('webview.inspector.debugTrace.runEntryCount', { count: String(run.entries.length) })
                : `${run.entries.length} entries`;
            html += `<details class="inspector-item debug-trace-run" data-run-id="${escapeHtml(run.runId)}"${isOpen ? ' open' : ''}>`;
            html += `<summary><strong>${escapeHtml(run.runId)}</strong> — ${escapeHtml(countLabel)}</summary>`;
            html += `<div class="debug-trace-entries">`;
            for (const { entry, depth } of buildOrderedEntries(run.entries)) {
                html += renderEntry(entry, depth);
            }
            html += `</div></details>`;
        });
        runsEl.innerHTML = html;

        runsEl.querySelectorAll('[data-goto-trace]').forEach((el) => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                goToTraceEntry(el.getAttribute('data-goto-run'), el.getAttribute('data-goto-trace'));
            });
        });
        runsEl.querySelectorAll('.debug-trace-entry').forEach((el) => {
            el.addEventListener('toggle', () => {
                const key = traceEntryKey(el.dataset.runId, el.dataset.traceId);
                if (el.open) { openEntryIds.add(key); } else { openEntryIds.delete(key); }
            });
        });
        runsEl.querySelectorAll('.debug-trace-run').forEach((el) => {
            el.addEventListener('toggle', () => {
                runOpenState.set(el.dataset.runId, el.open);
            });
        });
    }

    function render() {
        renderWarnings(lastLinkWarnings);
        renderRuns(lastBuffer, currentAudience);
    }

    toggle.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.debug-trace-audience-btn');
        if (!btn) { return; }
        const audience = btn.getAttribute('data-audience');
        if (!AUDIENCES.includes(audience) || audience === currentAudience) { return; }
        currentAudience = audience;
        toggle.querySelectorAll('.debug-trace-audience-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
        });
        render();
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message && message.type === 'debugTraceUpdate') {
            lastBuffer = message.buffer || null;
            lastLinkWarnings = Array.isArray(message.linkWarnings) ? message.linkWarnings : [];
            section.classList.remove('hidden');
            render();
        }
        if (message && message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            if (!show) {
                section.classList.add('hidden');
            }
        }
    });
})();

/* --- 80b-state-orchestrator.js --- */
/* global window, document, vscode */
(function () {
    const section = document.getElementById('inspector-state-orchestrator-section');
    const previewBtn = document.getElementById('inspector-so-preview-btn');
    const retryBtn = document.getElementById('inspector-so-retry-btn');
    const mermaidEl = document.getElementById('inspector-so-mermaid');
    const errorEl = document.getElementById('inspector-so-error');

    if (!section || !previewBtn || !retryBtn || !mermaidEl) {
        return;
    }

    // Bind actions
    previewBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'previewGmTurnTransactionPlan' });
    });

    retryBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'retryFailedTransactions' });
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message && message.type === 'stateOrchestratorUpdate') {
            section.classList.remove('hidden');

            // Show error message if exists
            if (message.errorMessage) {
                if (errorEl) {
                    errorEl.textContent = `Error: ${message.errorMessage}`;
                    errorEl.classList.remove('hidden');
                }
            } else {
                if (errorEl) {
                    errorEl.classList.add('hidden');
                }
            }

            // Render mermaid chart
            if (message.mermaid && window.mermaid) {
                mermaidEl.textContent = message.mermaid;
                // Add data-processed="false" so mermaid.run knows to parse it
                mermaidEl.removeAttribute('data-processed');
                window.mermaid.run({ nodes: [mermaidEl] })
                    .catch((e) => console.error('State Orchestrator Mermaid render error:', e));
            }

            // Disable/enable retry button based on status
            if (message.status === 'committed') {
                retryBtn.disabled = true;
            } else if (message.status === 'rolled_back' || message.status === 'partial_commit_warn') {
                retryBtn.disabled = false;
            } else {
                retryBtn.disabled = true; // planned/aborted etc.
            }
        }

        // Hide if debug capabilities are disabled
        if (message && message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            if (!show) {
                section.classList.add('hidden');
            }
        }
    });
})();

/* --- 80c-inspector-lanes.js --- */
/* global window, document */
/* Inspector lane split (Phase 1, UX-only): pure presentation toggle between
   Timeline / Debug / QA. This module does not send or receive any
   postMessage traffic and does not touch any existing message handler,
   debugCapabilities flag, or runtime state — it only toggles the
   pre-existing `.hidden` utility class on the section containers that were
   regrouped into three lane wrappers in index.html.
   See docs/ux/DEBUG-HUB-UX-PROPOSAL.md — Safe Immediate Slice (Phase 1). */

(function () {
    const tabs = document.getElementById('inspector-lane-tabs');
    if (!tabs) { return; }

    const LANES = ['timeline', 'debug', 'qa'];
    const panels = {};
    LANES.forEach((lane) => {
        panels[lane] = document.getElementById(`inspector-lane-${lane}`);
    });

    function setActiveLane(lane) {
        if (LANES.indexOf(lane) === -1) { return; }
        LANES.forEach((l) => {
            if (panels[l]) {
                panels[l].classList.toggle('hidden', l !== lane);
            }
        });
        tabs.querySelectorAll('.inspector-lane-btn').forEach((btn) => {
            const isSelected = btn.getAttribute('data-lane') === lane;
            btn.classList.toggle('is-active', isSelected);
            btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
    }

    tabs.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.inspector-lane-btn');
        if (!btn) { return; }
        setActiveLane(btn.getAttribute('data-lane'));
    });

    // Default lane on load. Not persisted across reloads in Phase 1 — this is
    // a presentation-only slice, so no new storage/message surface is added.
    setActiveLane('timeline');
})();

/* --- 81-lorebook.js --- */
/* global window, document, T, vscode */

let lorebookEntries = [];
let lorebookWriteFile = 'lorebook.json';
let lorebookDirty = false;
let lorebookEditingId = null;

window.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('lorebook-add-btn');
    const saveBtn = document.getElementById('lorebook-save-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addLorebookEntry());
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveLorebook());
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'lorebookList') {
            lorebookWriteFile = message.writeFile || 'lorebook.json';
            lorebookEntries = (message.entries || []).map(cloneEntry);
            lorebookDirty = false;
            lorebookEditingId = null;
            updateDirtyBadge();
            renderLorebookList(message);
        }
        if (message.type === 'lorebookSaveResult') {
            if (message.ok) {
                lorebookDirty = false;
                updateDirtyBadge();
            }
            // On failure the extension host already shows a native error message
            // with the same detail (webview alert() is silently blocked here anyway).
        }
    });
});

function cloneEntry(entry) {
    return {
        id: entry.id,
        label: entry.label || '',
        content: entry.content || entry.contentPreview || '',
        keys: Array.isArray(entry.keys) ? [...entry.keys] : [],
        secondary_keys: Array.isArray(entry.secondary_keys) ? [...entry.secondary_keys] : [],
        contentPreview: entry.contentPreview || '',
        enabled: entry.enabled !== false,
        use_regex: entry.use_regex === true,
        priority: entry.priority ?? 0,
        insertion_order: entry.insertion_order ?? 0,
        pinned: entry.pinned === true
    };
}

function markDirty() {
    lorebookDirty = true;
    updateDirtyBadge();
}

function updateDirtyBadge() {
    const badge = document.getElementById('lorebook-dirty');
    if (!badge) {
        return;
    }
    badge.classList.toggle('hidden', !lorebookDirty);
}

function splitKeys(text) {
    return String(text || '')
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
}

function addLorebookEntry() {
    const id = `entry-${Date.now().toString(36)}`;
    const entry = {
        id,
        label: typeof T === 'function' ? T('webview.lorebook.newEntryLabel') : 'New entry',
        content: '',
        keys: [],
        secondary_keys: [],
        contentPreview: '',
        enabled: true,
        use_regex: false,
        priority: 100,
        insertion_order: 100,
        pinned: false
    };
    lorebookEntries.unshift(entry);
    lorebookEditingId = id;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

async function deleteLorebookEntry(id) {
    const confirmMsg = typeof T === 'function' ? T('webview.lorebook.deleteConfirm') : 'Delete this entry?';
    // window.confirm() is silently blocked by the VS Code webview iframe sandbox
    // (no allow-modals); use the in-page confirm modal instead.
    const ok = await webviewConfirm(confirmMsg, T('webview.lorebook.deleteConfirmBtn'));
    if (!ok) {
        return;
    }
    lorebookEntries = lorebookEntries.filter((e) => e.id !== id);
    if (lorebookEditingId === id) {
        lorebookEditingId = null;
    }
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function toggleLorebookEntry(id, enabled) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    entry.enabled = enabled;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function setEditingId(id) {
    lorebookEditingId = lorebookEditingId === id ? null : id;
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function readFormIntoEntry(id) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    const labelEl = document.getElementById(`lore-label-${id}`);
    const keysEl = document.getElementById(`lore-keys-${id}`);
    const secEl = document.getElementById(`lore-sec-${id}`);
    const contentEl = document.getElementById(`lore-content-${id}`);
    const pinnedEl = document.getElementById(`lore-pinned-${id}`);
    const regexEl = document.getElementById(`lore-regex-${id}`);
    const prioEl = document.getElementById(`lore-prio-${id}`);
    const orderEl = document.getElementById(`lore-order-${id}`);

    if (labelEl) { entry.label = labelEl.value.trim(); }
    if (keysEl) { entry.keys = splitKeys(keysEl.value); }
    if (secEl) { entry.secondary_keys = splitKeys(secEl.value); }
    if (contentEl) {
        entry.content = contentEl.value;
        entry.contentPreview = entry.content.slice(0, 200);
    }
    if (pinnedEl) { entry.pinned = pinnedEl.checked; }
    if (regexEl) { entry.use_regex = regexEl.checked; }
    if (prioEl) { entry.priority = Number(prioEl.value) || 0; }
    if (orderEl) { entry.insertion_order = Number(orderEl.value) || 0; }
}

function saveLorebook() {
    lorebookEntries.forEach((e) => {
        if (lorebookEditingId === e.id) {
            readFormIntoEntry(e.id);
        }
    });
    vscode.postMessage({ type: 'saveLorebook', entries: lorebookEntries });
}

function renderLorebookList(payload) {
    const list = document.getElementById('lorebook-list');
    const meta = document.getElementById('lorebook-meta');
    if (!list) {
        return;
    }

    const entries = payload.entries || lorebookEntries;
    const writeFile = payload.writeFile || lorebookWriteFile;

    if (meta) {
        const count = entries.length;
        meta.textContent = typeof T === 'function'
            ? T('webview.lorebook.editorMeta', { file: writeFile, count: String(count) })
            : `${writeFile} — ${count} entries (edits save here)`;
    }

    list.innerHTML = '';
    if (entries.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.lorebook.noEntries') : 'No entries')}</div>`;
        return;
    }

    const sorted = [...entries].sort((a, b) => (b.insertion_order || 0) - (a.insertion_order || 0));
    sorted.forEach((entry) => {
        const isEditing = lorebookEditingId === entry.id;
        const card = document.createElement('div');
        card.className = 'lorebook-card inspector-item';
        card.dataset.entryId = entry.id;

        const status = entry.enabled
            ? (typeof T === 'function' ? T('webview.lorebook.enabled') : 'enabled')
            : (typeof T === 'function' ? T('webview.lorebook.disabled') : 'disabled');

        if (isEditing) {
            card.innerHTML = `
                <div class="lorebook-form">
                  <label>${escapeHtml(T('webview.lorebook.fieldLabel'))}</label>
                  <input id="lore-label-${escapeHtml(entry.id)}" type="text" value="${escapeAttr(entry.label)}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldKeys'))}</label>
                  <input id="lore-keys-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.keys || []).join(', '))}" placeholder="keyword1, keyword2" />
                  <label>${escapeHtml(T('webview.lorebook.fieldSecondary'))}</label>
                  <input id="lore-sec-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.secondary_keys || []).join(', '))}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldContent'))}</label>
                  <textarea id="lore-content-${escapeHtml(entry.id)}" rows="4">${escapeHtml(entry.content || '')}</textarea>
                  <div class="lorebook-form-row">
                    <label><input id="lore-pinned-${escapeHtml(entry.id)}" type="checkbox" ${entry.pinned ? 'checked' : ''} /> ${escapeHtml(typeof T === 'function' ? T('webview.lorebook.fieldPinned') : 'Pin to GM')}</label>
                    <label><input id="lore-regex-${escapeHtml(entry.id)}" type="checkbox" ${entry.use_regex ? 'checked' : ''} /> ${escapeHtml(T('webview.lorebook.fieldRegex'))}</label>
                    <label>${escapeHtml(T('webview.lorebook.fieldPriority'))} <input id="lore-prio-${escapeHtml(entry.id)}" type="number" value="${entry.priority ?? 0}" style="width:4rem" /></label>
                    <label>${escapeHtml(T('webview.lorebook.fieldOrder'))} <input id="lore-order-${escapeHtml(entry.id)}" type="number" value="${entry.insertion_order ?? 0}" style="width:4rem" /></label>
                  </div>
                  <div class="lorebook-card-actions">
                    <button type="button" class="small-btn primary lore-done-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.done'))}</button>
                    <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                  </div>
                </div>
            `;
        } else {
            const keys = (entry.keys || []).join(', ');
            card.innerHTML = `
                <div class="lorebook-card-head">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <span class="tag-item">${escapeHtml(status)}</span>
                  ${entry.pinned ? '<span class="tag-item">📌 pin</span>' : ''}
                  ${entry.use_regex ? '<span class="tag-item">regex</span>' : ''}
                </div>
                <div class="patch-value">${keys ? escapeHtml(keys) : '—'}</div>
                <div class="lorebook-preview">${escapeHtml(entry.contentPreview || entry.content || '')}</div>
                <div class="lorebook-card-actions">
                  <button type="button" class="small-btn lore-edit-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.edit'))}</button>
                  <button type="button" class="small-btn lore-toggle-btn" data-id="${escapeAttr(entry.id)}" data-enabled="${entry.enabled ? '0' : '1'}">${escapeHtml(entry.enabled ? (typeof T === 'function' ? T('webview.lorebook.disable') : 'Disable') : (typeof T === 'function' ? T('webview.lorebook.enable') : 'Enable'))}</button>
                  <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                </div>
            `;
        }

        list.appendChild(card);
    });

    list.querySelectorAll('.lore-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => setEditingId(btn.dataset.id));
    });
    list.querySelectorAll('.lore-done-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            readFormIntoEntry(btn.dataset.id);
            markDirty();
            setEditingId(null);
        });
    });
    list.querySelectorAll('.lore-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteLorebookEntry(btn.dataset.id));
    });
    list.querySelectorAll('.lore-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => toggleLorebookEntry(btn.dataset.id, btn.dataset.enabled === '1'));
    });
    list.querySelectorAll('input, textarea').forEach((el) => {
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#096;');
}

/* --- 82-memory.js --- */
/* global window, document, T, vscode */

window.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('memory-search-btn');
    const rebuildBtn = document.getElementById('memory-rebuild-btn');
    const backendSel = document.getElementById('memory-backend-select');
    const hintInput = document.getElementById('memory-hint-input');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const hint = hintInput ? hintInput.value.trim() : '';
            vscode.postMessage({ type: 'searchMemory', hint });
        });
    }
    if (rebuildBtn) {
        rebuildBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'rebuildMemoryIndex' });
        });
    }
    if (backendSel) {
        backendSel.addEventListener('change', () => {
            vscode.postMessage({ type: 'setMemoryBackend', backend: backendSel.value });
        });
    }
    if (hintInput) {
        hintInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                vscode.postMessage({ type: 'searchMemory', hint: hintInput.value.trim() });
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'memoryStatus') {
            renderMemoryStatus(message.status);
        }
        if (message.type === 'memorySearchResult') {
            renderMemorySearch(message);
        }
    });
});

function renderMemoryStatus(status) {
    const meta = document.getElementById('memory-status-meta');
    const backendSel = document.getElementById('memory-backend-select');
    if (!status) {
        return;
    }
    if (backendSel && status.backend) {
        backendSel.value = status.backend;
    }
    if (meta) {
        const updated = status.indexUpdated
            ? new Date(status.indexUpdated).toLocaleString()
            : (typeof T === 'function' ? T('webview.memory.noIndex') : 'no index');
        meta.textContent = typeof T === 'function'
            ? T('webview.memory.statusMeta', {
                count: String(status.chunkCount ?? 0),
                backend: status.backend || 'auto',
                updated
            })
            : `${status.chunkCount} chunks · ${status.backend} · ${updated}`;
    }
}

function renderMemorySearch(payload) {
    const list = document.getElementById('memory-search-results');
    const budget = document.getElementById('memory-token-budget');
    if (!list) {
        return;
    }
    const matches = payload.matches || [];
    const totalTokens = matches.reduce((sum, m) => sum + (m.tokenEstimate || 0), 0);

    if (budget) {
        budget.textContent = typeof T === 'function'
            ? T('webview.memory.tokenBudget', { tokens: String(totalTokens), count: String(matches.length) })
            : `~${totalTokens} tokens (${matches.length} matches)`;
    }

    list.innerHTML = '';
    if (matches.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.memory.noMatches') : 'No matches')}</div>`;
        return;
    }

    matches.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const score = m.score !== undefined ? `score ${m.score}` : '';
        row.innerHTML = `
            <strong>${escapeHtml(m.label)}</strong>
            <span class="tag-item">${escapeHtml(m.source)}</span>
            ${score ? `<span class="tag-item">${escapeHtml(score)}</span>` : ''}
            <span class="tag-item">~${m.tokenEstimate || 0} tok</span>
            <div class="lorebook-preview">${escapeHtml(m.preview || '')}</div>
        `;
        list.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

/* --- 83-director.js --- */
/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'scenarioDirector') {
            renderScenarioDirector(message.director);
        }
    });
});

function renderScenarioDirector(director) {
    const empty = document.getElementById('director-empty');
    const content = document.getElementById('director-content');
    const liveBadge = document.getElementById('director-live-badge');
    if (!content) {
        return;
    }

    if (!director) {
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');

    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    setText('director-title', director.scenarioTitle || '—');
    const actLive = [director.act, director.chapter].filter(Boolean).join(' / ');
    const actTemplate = director.templateSnapshot
        ? [director.templateSnapshot.act, director.templateSnapshot.chapter].filter(Boolean).join(' / ')
        : undefined;
    setFieldWithTemplate('director-act', actLive, actTemplate);
    setFieldWithTemplate('director-scene', director.scene, director.templateSnapshot?.scene);
    setFieldWithTemplate('director-objective', director.objective, director.templateSnapshot?.objective);
    setFieldWithTemplate('director-guidance', director.guidanceMode, director.templateSnapshot?.guidanceMode);

    renderList('director-success', director.successConditions);
    renderList('director-fail', director.failConditions);
    renderEndingFlags('director-endings', director.endingFlags, director.achievedEndings || []);
    renderList('director-achieved', director.achievedEndings);
    renderList('director-encounters', director.optionalEncounters);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value || '—';
    }
}

function setFieldWithTemplate(id, live, template) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    const text = live || '—';
    const changed = template !== undefined && live !== undefined && live !== template;
    if (changed && template) {
        el.innerHTML = `${escapeHtml(text)} <span class="tag-item">${escapeHtml(typeof T === 'function' ? T('webview.director.was') : 'was')}: ${escapeHtml(template)}</span>`;
    } else {
        el.textContent = text;
    }
}

function renderList(id, items) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        row.textContent = item;
        el.appendChild(row);
    });
}

function renderEndingFlags(id, allFlags, achieved) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!allFlags || allFlags.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    const achievedSet = new Set(achieved || []);
    allFlags.forEach((flag) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const done = achievedSet.has(flag);
        row.innerHTML = done
            ? `✅ ${escapeHtml(flag)}`
            : `○ ${escapeHtml(flag)}`;
        if (done) {
            row.style.color = 'var(--text-success)';
        }
        el.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

/* --- 84-party.js --- */
/* global window, document, T, vscode */

let partyDirectorDraft = null;
let partyMemberNames = {};

window.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('party-save-btn');
    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (!partyDirectorDraft) {
                return;
            }
            vscode.postMessage({ type: 'savePartyDirector', director: partyDirectorDraft });
        });
    }
    if (banterCb) {
        banterCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.npcBanterEnabled = banterCb.checked;
                markPartyDirty(true);
            }
        });
    }
    if (quietCb) {
        quietCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.combatQuietMode = quietCb.checked;
                markPartyDirty(true);
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'partyDirector') {
            renderPartyDirector(message.director);
        }
        if (message.type === 'characterList') {
            const chars = message.characters || [];
            partyMemberNames = {};
            chars.forEach((c) => {
                if (c && c.id) {
                    partyMemberNames[c.id] = c.name || c.id;
                }
            });
            if (partyDirectorDraft) {
                renderPartyMembers(partyDirectorDraft);
            }
        }
        if (message.type === 'partyDirectorSaved') {
            markPartyDirty(false);
        }
    });
});

function renderPartyDirector(director) {
    const empty = document.getElementById('party-empty');
    const content = document.getElementById('party-content');
    const liveBadge = document.getElementById('party-live-badge');
    if (!content) {
        return;
    }

    if (!director || Object.keys(director.members || {}).length === 0) {
        partyDirectorDraft = null;
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    partyDirectorDraft = {
        format: 'lorerelay-party-director/1.0',
        global: {
            npcBanterEnabled: director.global.npcBanterEnabled !== false,
            combatQuietMode: director.global.combatQuietMode === true
        },
        members: {}
    };
    for (const [id, m] of Object.entries(director.members)) {
        partyDirectorDraft.members[id] = {
            verbosity: m.verbosity ?? 50,
            muted: !!m.muted,
            forceSpeak: !!m.forceSpeak,
            relationships: { ...(m.relationships || {}) }
        };
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');
    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');
    if (banterCb) { banterCb.checked = partyDirectorDraft.global.npcBanterEnabled; }
    if (quietCb) { quietCb.checked = partyDirectorDraft.global.combatQuietMode; }

    renderPartyMembers(director);
    markPartyDirty(false);
}

function renderPartyMembers(director) {
    const container = document.getElementById('party-members-list');
    if (!container || !partyDirectorDraft) {
        return;
    }
    container.innerHTML = '';
    const memberIds = Object.keys(director.members || {});
    const relOptions = ['neutral', 'ally', 'friend', 'rival', 'enemy', 'romance'];

    memberIds.forEach((id) => {
        const cfg = partyDirectorDraft.members[id];
        const card = document.createElement('div');
        card.className = 'party-member-card';

        const title = document.createElement('h5');
        title.textContent = partyMemberNames[id] ? `${partyMemberNames[id]} (${id})` : id;
        card.appendChild(title);

        const verbRow = document.createElement('div');
        verbRow.className = 'party-control-row';
        const verbLabel = document.createElement('label');
        verbLabel.textContent = typeof T === 'function' ? T('webview.party.verbosity') : 'Verbosity';
        const verbSlider = document.createElement('input');
        verbSlider.type = 'range';
        verbSlider.min = '0';
        verbSlider.max = '100';
        verbSlider.value = String(cfg.verbosity);
        const verbVal = document.createElement('span');
        verbVal.className = 'party-verb-val';
        verbVal.textContent = String(cfg.verbosity);
        verbSlider.addEventListener('input', () => {
            cfg.verbosity = Number(verbSlider.value);
            verbVal.textContent = verbSlider.value;
            markPartyDirty(true);
        });
        verbRow.appendChild(verbLabel);
        verbRow.appendChild(verbSlider);
        verbRow.appendChild(verbVal);
        card.appendChild(verbRow);

        const flagsRow = document.createElement('div');
        flagsRow.className = 'party-flags-row';
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.muted') : 'Muted',
            cfg.muted,
            (v) => { cfg.muted = v; markPartyDirty(true); }
        ));
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.forceSpeak') : 'Force speak',
            cfg.forceSpeak,
            (v) => { cfg.forceSpeak = v; markPartyDirty(true); }
        ));
        card.appendChild(flagsRow);

        const others = memberIds.filter((oid) => oid !== id);
        if (others.length > 0) {
            const relTitle = document.createElement('div');
            relTitle.className = 'party-rel-title';
            relTitle.textContent = typeof T === 'function' ? T('webview.party.relationships') : 'Relationships';
            card.appendChild(relTitle);
            others.forEach((otherId) => {
                const row = document.createElement('div');
                row.className = 'party-rel-row';
                const label = document.createElement('span');
                label.textContent = partyMemberNames[otherId] || otherId;
                const sel = document.createElement('select');
                relOptions.forEach((opt) => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.textContent = opt;
                    sel.appendChild(o);
                });
                sel.value = cfg.relationships[otherId] || 'neutral';
                sel.addEventListener('change', () => {
                    if (sel.value === 'neutral') {
                        delete cfg.relationships[otherId];
                    } else {
                        cfg.relationships[otherId] = sel.value;
                    }
                    markPartyDirty(true);
                });
                row.appendChild(label);
                row.appendChild(sel);
                card.appendChild(row);
            });
        }

        container.appendChild(card);
    });
}

function makePartyCheckbox(labelText, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'party-flag-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + labelText));
    return wrap;
}

function markPartyDirty(dirty) {
    const badge = document.getElementById('party-dirty-badge');
    if (badge) {
        badge.classList.toggle('hidden', !dirty);
    }
}

/* --- 84a-webview-anim.js --- */
// webview/modules/84a-webview-anim.js
// Shared decorative animation driver for Webview visual polish (Graphics Upgrade Track 1-3).
// Single rAF loop shared by all animated overlays — no canonical state, no persistence, no ops.
// Consumers register a tick(phase) callback; this module owns start/stop, throttling,
// prefers-reduced-motion, tab-visibility pause, and the user-facing effects tier.

(function () {
    const TIER_STORAGE_KEY = 'lr.effectsTier';
    const TIERS = ['off', 'light', 'full'];
    const DEFAULT_TIER = 'light';

    const _handlers = new Map(); // id -> { tick, fps, lastCall }
    let _rafId = null;
    let _startTime = null;
    let _tierListeners = [];

    function prefersReducedMotion() {
        return typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function normalizeTier(raw) {
        return TIERS.includes(raw) ? raw : DEFAULT_TIER;
    }

    function getEffectsTier() {
        try {
            return normalizeTier(window.localStorage.getItem(TIER_STORAGE_KEY));
        } catch {
            return DEFAULT_TIER;
        }
    }

    function setEffectsTier(tier) {
        const normalized = normalizeTier(tier);
        try {
            window.localStorage.setItem(TIER_STORAGE_KEY, normalized);
        } catch { /* ignore (private browsing / quota) */ }
        for (const listener of _tierListeners) {
            try { listener(normalized); } catch { /* consumer error must not break the loop */ }
        }
        syncLoopState();
        return normalized;
    }

    function onTierChange(fn) {
        if (typeof fn === 'function') { _tierListeners.push(fn); }
    }

    /** Motion runs only when the OS/browser doesn't request reduced motion AND the tier isn't 'off'. */
    function isMotionEnabled() {
        return !prefersReducedMotion() && getEffectsTier() !== 'off';
    }

    function loopTick(now) {
        _rafId = null;
        if (!isMotionEnabled() || document.hidden || !_handlers.size) { return; }
        if (_startTime === null) { _startTime = now; }
        const phase = now - _startTime;
        for (const [, entry] of _handlers) {
            const minInterval = entry.fps > 0 ? 1000 / entry.fps : 0;
            if (minInterval > 0 && entry.lastCall !== null && (now - entry.lastCall) < minInterval) { continue; }
            entry.lastCall = now;
            try { entry.tick(phase); } catch (err) { console.error('[LR_anim] tick handler failed:', err); }
        }
        scheduleLoop();
    }

    function scheduleLoop() {
        if (_rafId !== null) { return; }
        if (!isMotionEnabled() || document.hidden || !_handlers.size) { return; }
        _rafId = window.requestAnimationFrame(loopTick);
    }

    function stopLoop() {
        if (_rafId !== null) {
            window.cancelAnimationFrame(_rafId);
            _rafId = null;
        }
    }

    /** Re-evaluate whether the loop should be running (call after tier/visibility changes). */
    function syncLoopState() {
        if (isMotionEnabled() && !document.hidden && _handlers.size) {
            scheduleLoop();
        } else {
            stopLoop();
        }
    }

    /**
     * Register a decorative animation tick. `tick(phaseMs)` is called on every eligible frame
     * (throttled to `fps` if provided). Never called while motion is disabled — consumers must
     * keep rendering their static (non-animated) appearance via their existing draw paths;
     * this driver only adds animated redraws on top.
     */
    function register(id, tick, options) {
        if (!id || typeof tick !== 'function') { return; }
        _handlers.set(id, { tick, fps: (options && options.fps) || 0, lastCall: null });
        syncLoopState();
    }

    function unregister(id) {
        _handlers.delete(id);
        if (!_handlers.size) { stopLoop(); }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stopLoop(); } else { syncLoopState(); }
    });

    if (typeof window.matchMedia === 'function') {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => syncLoopState();
        if (typeof mq.addEventListener === 'function') { mq.addEventListener('change', onChange); }
        else if (typeof mq.addListener === 'function') { mq.addListener(onChange); }
    }

    window.LR_anim = {
        register,
        unregister,
        isMotionEnabled,
        getEffectsTier,
        setEffectsTier,
        onTierChange,
        TIERS,
    };
})();

/* --- 84b-responsive-shell.js --- */
// UX-RESPONSIVE-NARROW-001 — authoritative responsive shell controller.
// Shell-only: breakpoint / drawer / sidebar width. Does not rerender game state.

const LR_SHELL_WIDE_MIN = 960;
const LR_SHELL_COMPACT_MIN = 720;
const LR_SHELL_SIDEBAR_MIN = 280;
const LR_SHELL_SIDEBAR_MAX_ABS = 800;
const LR_SHELL_SIDEBAR_MAX_VW = 0.42;
const LR_SHELL_SIDEBAR_DEFAULT = 320;
const LR_SHELL_STATUS_WIDTH_KEY = 'lorerelay.statusWidth';

/** Pure: map viewport width → shell mode. */
function lrShellResolveMode(viewportWidth) {
  const w = Number(viewportWidth);
  if (!Number.isFinite(w) || w < 0) { return 'wide'; }
  if (w >= LR_SHELL_WIDE_MIN) { return 'wide'; }
  if (w >= LR_SHELL_COMPACT_MIN) { return 'drawer-compact'; }
  return 'drawer-narrow';
}

/**
 * Pure: reclamp saved/candidate sidebar width for the current viewport.
 * Malformed, non-positive, non-finite values fall back to default.
 */
function lrShellClampSidebarWidth(value, viewportWidth) {
  const vw = Number(viewportWidth);
  const safeVw = Number.isFinite(vw) && vw > 0 ? vw : 1200;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) { return LR_SHELL_SIDEBAR_DEFAULT; }
  const max = Math.min(Math.floor(safeVw * LR_SHELL_SIDEBAR_MAX_VW), LR_SHELL_SIDEBAR_MAX_ABS);
  const min = Math.min(LR_SHELL_SIDEBAR_MIN, max);
  return Math.max(min, Math.min(max, Math.round(n)));
}

function lrShellReadSavedWidth() {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) { return null; }
    return localStorage.getItem(LR_SHELL_STATUS_WIDTH_KEY);
  } catch {
    return null;
  }
}

function lrShellWriteSavedWidth(px) {
  try {
    if (typeof localStorage === 'undefined' || !localStorage) { return; }
    localStorage.setItem(LR_SHELL_STATUS_WIDTH_KEY, String(px));
  } catch { /* quota / private mode */ }
}

const lrShellState = {
  mode: 'wide',
  drawerOpen: false,
  savedWideSidebarWidth: LR_SHELL_SIDEBAR_DEFAULT,
  rafPending: false,
  lastAppliedWidth: -1,
  initialized: false,
};

function lrShellDoc() {
  return typeof document !== 'undefined' ? document : null;
}

function lrShellEls() {
  const doc = lrShellDoc();
  if (!doc) { return {}; }
  return {
    root: doc.documentElement,
    body: doc.body,
    app: doc.getElementById('app'),
    chat: doc.getElementById('chat-area'),
    status: doc.getElementById('status-area'),
    resizer: doc.getElementById('resizer'),
    toggle: doc.getElementById('status-drawer-toggle'),
    scrim: doc.getElementById('status-drawer-scrim'),
    headerSecondary: doc.getElementById('header-secondary'),
  };
}

function lrShellViewportWidth() {
  if (typeof window !== 'undefined' && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
    return window.innerWidth;
  }
  const doc = lrShellDoc();
  if (doc && doc.documentElement && Number.isFinite(doc.documentElement.clientWidth)) {
    return doc.documentElement.clientWidth;
  }
  return 1200;
}

function lrShellSetStatusInert(closed) {
  const { status } = lrShellEls();
  if (!status) { return; }
  if (closed) {
    if ('inert' in status) {
      status.inert = true;
    } else {
      status.setAttribute('aria-hidden', 'true');
      status.setAttribute('data-lr-inert-fallback', '1');
    }
  } else {
    if ('inert' in status) {
      status.inert = false;
    }
    status.removeAttribute('aria-hidden');
    status.removeAttribute('data-lr-inert-fallback');
  }
}

function lrShellApplyStatusWidthPx(px) {
  const { status } = lrShellEls();
  if (!status || !status.style || typeof status.style.setProperty !== 'function') { return; }
  status.style.setProperty('--status-width', `${px}px`);
}

function lrShellSyncToggle() {
  const { toggle } = lrShellEls();
  if (!toggle) { return; }
  const open = lrShellState.drawerOpen && lrShellState.mode !== 'wide';
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.classList.toggle('is-drawer-open', open);
  const labelKey = open ? 'webview.responsive.closeStatus' : 'webview.responsive.openStatus';
  const label = (typeof T === 'function') ? T(labelKey) : labelKey;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('title', label);
  if (toggle.querySelector && toggle.querySelector('.lr-drawer-toggle-label')) {
    toggle.querySelector('.lr-drawer-toggle-label').textContent = open ? '◀' : '☰';
  }
}

function lrShellApplyDom() {
  const { root, status, resizer, scrim, toggle } = lrShellEls();
  if (!root) { return; }
  root.setAttribute('data-lr-shell', lrShellState.mode);
  root.setAttribute('data-lr-drawer', lrShellState.drawerOpen ? 'open' : 'closed');
  if (resizer) {
    const wide = lrShellState.mode === 'wide';
    resizer.hidden = !wide;
    resizer.setAttribute('aria-hidden', wide ? 'false' : 'true');
    resizer.style.pointerEvents = wide ? '' : 'none';
  }
  if (toggle) {
    const drawer = lrShellState.mode !== 'wide';
    toggle.hidden = !drawer;
    toggle.setAttribute('aria-hidden', drawer ? 'false' : 'true');
  }
  if (scrim) {
    const show = lrShellState.mode !== 'wide' && lrShellState.drawerOpen;
    scrim.hidden = !show;
    scrim.setAttribute('aria-hidden', show ? 'false' : 'true');
  }
  if (lrShellState.mode === 'wide') {
    lrShellSetStatusInert(false);
    if (status) {
      status.removeAttribute('tabindex');
    }
    const clamped = lrShellClampSidebarWidth(lrShellState.savedWideSidebarWidth, lrShellViewportWidth());
    lrShellState.savedWideSidebarWidth = clamped;
    lrShellApplyStatusWidthPx(clamped);
  } else {
    lrShellSetStatusInert(!lrShellState.drawerOpen);
    if (status && lrShellState.drawerOpen) {
      status.setAttribute('tabindex', '-1');
    }
  }
  lrShellSyncToggle();
}

function lrShellOpenDrawer(opts) {
  if (lrShellState.mode === 'wide') { return; }
  lrShellState.drawerOpen = true;
  lrShellApplyDom();
  const { status } = lrShellEls();
  if (opts && opts.focus === false) { return; }
  if (status && typeof status.focus === 'function') {
    try { status.focus({ preventScroll: true }); } catch { status.focus(); }
  }
}

function lrShellCloseDrawer(opts) {
  const wasOpen = lrShellState.drawerOpen;
  lrShellState.drawerOpen = false;
  lrShellApplyDom();
  if (!wasOpen) { return; }
  const { toggle } = lrShellEls();
  if (opts && opts.focus === false) { return; }
  if (toggle && typeof toggle.focus === 'function' && !toggle.hidden) {
    try { toggle.focus({ preventScroll: true }); } catch { toggle.focus(); }
  }
}

function lrShellToggleDrawer() {
  if (lrShellState.mode === 'wide') { return; }
  if (lrShellState.drawerOpen) { lrShellCloseDrawer(); }
  else { lrShellOpenDrawer(); }
}

function lrShellOnViewportChange(force) {
  const width = lrShellViewportWidth();
  if (!force && width === lrShellState.lastAppliedWidth) { return; }
  lrShellState.lastAppliedWidth = width;
  const next = lrShellResolveMode(width);
  const prev = lrShellState.mode;
  if (next !== prev) {
    lrShellState.mode = next;
    if (next === 'wide') {
      // Always restore an accessible visible sidebar in wide mode.
      lrShellState.drawerOpen = false;
    } else if (prev === 'wide') {
      // Entering drawer mode: close deterministically.
      lrShellState.drawerOpen = false;
    }
    // drawer-compact ↔ drawer-narrow: preserve drawerOpen.
  }
  if (lrShellState.mode === 'wide') {
    lrShellState.savedWideSidebarWidth = lrShellClampSidebarWidth(
      lrShellState.savedWideSidebarWidth,
      width
    );
  }
  lrShellApplyDom();
}

function lrShellScheduleViewportCheck() {
  if (lrShellState.rafPending) { return; }
  lrShellState.rafPending = true;
  const run = () => {
    lrShellState.rafPending = false;
    lrShellOnViewportChange(false);
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(run);
  } else {
    run();
  }
}

function lrShellIsResizerEnabled() {
  return lrShellState.mode === 'wide';
}

function lrShellPersistWidthFromElement() {
  if (lrShellState.mode !== 'wide') { return; }
  const { status } = lrShellEls();
  if (!status || typeof status.getBoundingClientRect !== 'function') { return; }
  const w = status.getBoundingClientRect().width;
  const clamped = lrShellClampSidebarWidth(w, lrShellViewportWidth());
  lrShellState.savedWideSidebarWidth = clamped;
  lrShellApplyStatusWidthPx(clamped);
  lrShellWriteSavedWidth(clamped);
}

function lrShellInit() {
  if (lrShellState.initialized) { return; }
  lrShellState.initialized = true;
  const saved = lrShellReadSavedWidth();
  lrShellState.savedWideSidebarWidth = lrShellClampSidebarWidth(saved, lrShellViewportWidth());

  const { toggle, scrim, status } = lrShellEls();
  if (status) {
    status.setAttribute('role', 'complementary');
    status.setAttribute('aria-label', (typeof T === 'function') ? T('webview.responsive.statusDrawer') : 'Adventure Status');
    if (!status.id) { status.id = 'status-area'; }
  }
  if (toggle) {
    toggle.setAttribute('aria-controls', 'status-area');
    toggle.setAttribute('type', 'button');
    toggle.addEventListener('click', (e) => {
      if (e && typeof e.preventDefault === 'function') { e.preventDefault(); }
      lrShellToggleDrawer();
    });
  }
  if (scrim) {
    scrim.addEventListener('click', () => lrShellCloseDrawer());
  }

  // Capture-phase Escape: close drawer before unrelated global Escape actions.
  // IME-safe: ignore while composing.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('keydown', (event) => {
      if (!event || event.key !== 'Escape') { return; }
      if (event.isComposing || event.keyCode === 229) { return; }
      if (lrShellState.mode === 'wide' || !lrShellState.drawerOpen) { return; }
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      lrShellCloseDrawer();
    }, true);
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', lrShellScheduleViewportCheck, { passive: true });
  }

  // matchMedia for authoritative breakpoint edges (still rAF-bounded via schedule).
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      const mqWide = window.matchMedia(`(min-width: ${LR_SHELL_WIDE_MIN}px)`);
      const mqCompact = window.matchMedia(`(min-width: ${LR_SHELL_COMPACT_MIN}px)`);
      const onMq = () => lrShellScheduleViewportCheck();
      if (typeof mqWide.addEventListener === 'function') {
        mqWide.addEventListener('change', onMq);
        mqCompact.addEventListener('change', onMq);
      } else if (typeof mqWide.addListener === 'function') {
        mqWide.addListener(onMq);
        mqCompact.addListener(onMq);
      }
    } catch { /* harness without matchMedia */ }
  }

  lrShellOnViewportChange(true);
}

// Public surface for bootstrap resizer + tests.
window.LoreRelayResponsive = {
  resolveMode: lrShellResolveMode,
  clampSidebarWidth: lrShellClampSidebarWidth,
  getMode: () => lrShellState.mode,
  isDrawerOpen: () => lrShellState.drawerOpen,
  isResizerEnabled: lrShellIsResizerEnabled,
  openDrawer: lrShellOpenDrawer,
  closeDrawer: lrShellCloseDrawer,
  toggleDrawer: lrShellToggleDrawer,
  persistWidthFromElement: lrShellPersistWidthFromElement,
  scheduleViewportCheck: lrShellScheduleViewportCheck,
  applyViewport: (w) => {
    // Test helper: force a viewport width without full rerender.
    const prev = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => w });
    } catch {
      // ignore
    }
    lrShellOnViewportChange(true);
    return { mode: lrShellState.mode, drawerOpen: lrShellState.drawerOpen, prev };
  },
  getState: () => ({
    mode: lrShellState.mode,
    drawerOpen: lrShellState.drawerOpen,
    savedWideSidebarWidth: lrShellState.savedWideSidebarWidth,
  }),
  constants: {
    WIDE_MIN: LR_SHELL_WIDE_MIN,
    COMPACT_MIN: LR_SHELL_COMPACT_MIN,
    SIDEBAR_MIN: LR_SHELL_SIDEBAR_MIN,
    SIDEBAR_MAX_ABS: LR_SHELL_SIDEBAR_MAX_ABS,
    STATUS_WIDTH_KEY: LR_SHELL_STATUS_WIDTH_KEY,
  },
  init: lrShellInit,
  // pure exports for unit tests
  _resolveMode: lrShellResolveMode,
  _clampSidebarWidth: lrShellClampSidebarWidth,
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lrShellInit);
  } else {
    lrShellInit();
  }
}

/* --- 85-world.js --- */
/* global window, document, vscode */

const FACTION_TYPE_COLOR = {
    hostile: '#6b2020',
    neutral: '#2d4a2d',
    friendly: '#1a3a5c',
    'player-faction': '#4a3a00'
};

const FACTION_TYPE_ICON = {
    hostile: '💀',
    neutral: '⚖️',
    friendly: '🤝',
    'player-faction': '⭐'
};

/** Mirrors LOCATION_TYPE_ICON in src/worldMapGenerator.ts so Mermaid and Parchment modes agree visually. */
const LOCATION_TYPE_ICON = {
    settlement: '🏘️',
    dungeon: '🕳️',
    landmark: '🗿',
    ruins: '🏚️',
    wilderness: '🌲',
    other: '📍'
};

const SEVERITY_COLOR = {
    minor: 'var(--vscode-charts-yellow)',
    moderate: 'var(--vscode-charts-orange, #e8a838)',
    major: '#c04040',
    catastrophic: '#800020'
};

let currentWorldLocationId = null;
let worldSceneImagePending = false;
let worldMapMode = 'mermaid';
const WORLD_MAP_MODE_KEY = 'lorerelay.worldMapMode';
let _worldViewMsg = null;
let _selectedPinId = null;
let _worldPinCatalog = new Map();
let _pendingWorldLocationFocusId = null;
let _worldLocationFocusClearTimer = null;
const WORLD_PIN_HIT_RADIUS_PX = 22;
let _worldPinDismissReady = false;
let _regionFeedbackMap = new Map();
let _lastDangerFlashLocationId = null;

const MAP_EVENT_SEVERITY_GLYPH = {
    info: '🔥',
    warning: '🔥',
    critical: '‼️',
};

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'worldView') {
            renderWorldView(msg);
        }
        if (msg.type === 'worldGenStart') {
            setWorldGenBusy(true);
        }
        if (msg.type === 'worldGenEnd') {
            setWorldGenBusy(false);
            if (!msg.success) {
                const btn = document.getElementById('world-gen-btn');
                if (btn) {
                    btn.classList.add('failed');
                    btn.innerHTML = `<span>${T('webview.world.worldGenFailed')}</span>`;
                }
            }
        }
        if (msg.type === 'worldMapGenStart') {
            setWorldMapGenBusy(true);
        }
        if (msg.type === 'worldMapGenEnd') {
            setWorldMapGenBusy(false, !msg.success);
        }
        if (msg.type === 'locationImageGenStart') {
            setWorldSceneImageBusy(true);
        }
        if (msg.type === 'locationImageGenEnd') {
            setWorldSceneImageBusy(false, !msg.success);
        }
        if (msg.type === 'imageGenEnd' && worldSceneImagePending) {
            setWorldSceneImageBusy(false, !msg.success);
        }
        if (msg.type === 'livingWorldDirectTradeResult') {
            if (msg.ok) {
                const parts = [];
                if (msg.trade?.totalCost > 0) {
                    parts.push(`${T('webview.world.tradeCost')}: ${msg.trade.totalCost}`);
                }
                if (msg.trade?.totalRevenue > 0) {
                    parts.push(`${T('webview.world.tradeRevenue')}: ${msg.trade.totalRevenue}`);
                }
                setCommerceTradeToast(
                    parts.length > 0 ? parts.join(' · ') : T('webview.world.tradeOk'),
                    'ok'
                );
            } else {
                setCommerceTradeToast(
                    msg.message || msg.reason || T('webview.world.tradeFailed'),
                    'error'
                );
            }
        }
        if (msg.type === 'shopkeeperDirectTradeResult') {
            finishShopkeeperTrade(msg);
        }
        if (msg.type === 'marketTravelPreviewResult') {
            finishMarketTravelPreview(msg);
        }
        if (msg.type === 'marketTravelResult') {
            finishMarketTravel(msg);
        }
        if (msg.type === 'endDayPreviewResult') {
            finishEndDayPreview(msg);
        }
        if (msg.type === 'endDayResult') {
            finishEndDay(msg);
        }
        if (msg.type === 'livingWorldSetPlayerRoleResult') {
            if (!msg.ok) {
                setCommerceTradeToast(msg.reason || T('webview.world.roleFailed'), 'error');
            }
        }
    });

    const tabBtn = document.getElementById('tab-btn-world');
    if (tabBtn) {
        tabBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'loadWorld' });
        });
    }

    const genImageBtn = document.getElementById('world-gen-image-btn');
    if (genImageBtn) {
        genImageBtn.addEventListener('click', () => {
            if (currentWorldLocationId) {
                worldSceneImagePending = true;
                setWorldSceneImageBusy(true);
                vscode.postMessage({ type: 'generateLocationImage', locationId: currentWorldLocationId });
            }
        });
    }

    const genMapBtn = document.getElementById('world-gen-map-btn');
    if (genMapBtn) {
        genMapBtn.addEventListener('click', () => {
            setWorldMapGenBusy(true);
            vscode.postMessage({ type: 'generateWorldMapImage' });
        });
    }

    const modeMermaid = document.getElementById('world-map-mode-mermaid');
    const modeParchment = document.getElementById('world-map-mode-parchment');
    const modeTile = document.getElementById('world-map-mode-tile');
    const modeSettlement = document.getElementById('world-map-mode-settlement');
    const modeDiorama = document.getElementById('world-map-mode-diorama');
    if (modeMermaid) {
        modeMermaid.addEventListener('click', () => setWorldMapMode('mermaid'));
    }
    if (modeParchment) {
        modeParchment.addEventListener('click', () => setWorldMapMode('parchment'));
    }
    if (modeTile) {
        modeTile.addEventListener('click', () => setWorldMapMode('tile'));
    }
    if (modeSettlement) {
        modeSettlement.addEventListener('click', () => setWorldMapMode('settlement'));
    }
    if (modeDiorama) {
        modeDiorama.addEventListener('click', () => setWorldMapMode('diorama'));
    }

    try {
        const saved = localStorage.getItem(WORLD_MAP_MODE_KEY);
        if (saved === 'mermaid' || saved === 'parchment' || saved === 'tile' || saved === 'settlement' || saved === 'diorama') {
            worldMapMode = saved;
        }
    } catch { /* private mode */ }

    ensureCartographyStyles();
    ensureDomainStyles();
    ensureGuildStyles();
    applyWorldMapModeVisibility();
    buildWorldGenForm();
    initWorldPinDismiss();
});

function renderWorldView(msg) {
    if (typeof updateNpcTtsFromWorldView === 'function') {
        updateNpcTtsFromWorldView(msg);
    }
    const empty = document.getElementById('world-empty');
    const content = document.getElementById('world-content');
    if (!content) { return; }

    if (!msg.enabled) {
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');

    // ヘッダー
    const titleEl = document.getElementById('world-title');
    const themeEl = document.getElementById('world-theme');
    const statsEl = document.getElementById('world-stats');
    const genImageBtn = document.getElementById('world-gen-image-btn');

    if (titleEl) { titleEl.textContent = msg.worldName || ''; }
    if (themeEl) { themeEl.textContent = msg.theme ? `[${msg.theme}]` : ''; }
    window.currentWorldTheme = msg.theme || undefined;
    if (statsEl) {
        const turnStr = msg.simEnabled && msg.worldTurn !== null
            ? ` · Turn ${msg.worldTurn}`
            : '';
        statsEl.textContent = `${msg.regionCount ?? 0} regions · ${msg.locationCount ?? 0} locations${turnStr}`;
    }

    currentWorldLocationId = msg.currentLocationId;
    _worldViewMsg = msg;
    rebuildWorldPinCatalog(msg);
    renderWorldLocationNavigator();
    rebuildRegionFeedbackMap(msg);
    maybeFlashHighDangerEntry(msg);
    if (genImageBtn) {
        genImageBtn.style.display = currentWorldLocationId ? '' : 'none';
    }

    // Mermaid + parchment + tile maps
    renderMermaidMap(msg.worldMap, msg);
    renderCartographyMap(msg);
    _tileOvermapMsg = msg;
    _settlementWorldMsg = msg;
    _dioramaWorldMsg = msg;
    // SETTLEMENT-VIEW-SOURCE-001: normalize fixed vs Mobile Base choice before drawing.
    if (typeof onSettlementRenderSourceWorldMsg === 'function') {
        onSettlementRenderSourceWorldMsg(msg);
    }
    if (typeof renderSettlementSourceSelector === 'function') {
        renderSettlementSourceSelector(msg);
    }
    syncSettlementMapModeUi(msg);
    syncDioramaMapModeUi(msg);
    syncWorldPinSelectionUi();

    if (msg.cartographyHasImage && worldMapMode === 'parchment') {
        setWorldMapMode('parchment', { persist: false });
    } else {
        applyWorldMapModeVisibility();
    }

    // Location image history (from visual_memory.json)
    renderLocationImages(msg.locationImages || [], msg.currentLocationId);

    // NPCs at current location
    renderNpcsAtLocation(msg.npcsAtLocation || [], msg.currentLocationId);

    // グローバルイベント（シミュ有効時）
    renderGlobalEvents(msg.globalEvents || [], msg.simEnabled);

    // Living World recent events
    renderRecentChanges(msg.recentChanges || [], msg.simEnabled);

    // Player commerce (credits / food / cargo / role)
    renderPlayerCommerce(
        msg.playerCommerce || null,
        msg.enableCommerce === true,
        msg.enableCommerceUi === true,
        msg.playerRoles || [],
        msg.currentLocationId
    );

    // Domain Mode (D3): lordship stats, audience, rivals, missions, battle
    renderDomainPanel(msg);

    // Guild Master (G1): quest board stats and roster
    renderGuildPanel(msg);

    // Campaign Kit: discoveries + hub job/rumor board
    renderCampaignKitPanel(msg);

    // Living World market prices (+ direct trade when UI enabled)
    renderLivingWorldMarkets(
        msg.livingWorldMarkets || [],
        msg.livingWorldDecisionSurface || null,
        msg.enableCommerce === true,
        msg.enableCommerceUi === true,
        msg.currentLocationId
    );

    // Read-only economy logistics network (NOAI-ECON-FLOWS-005)
    renderEconomyLogistics(msg.economyLogistics || null, msg.enableCommerce === true);

    // Living World NPC whereabouts
    renderNpcWhereabouts(msg.npcWhereabouts || null);

    // LW3: NPC-to-NPC bonds + LW3-P: player bonds
    renderNpcBonds(msg.npcBonds || null, msg.playerBonds || null);

    // Quest Board
    renderQuestHooks(msg.questHooks || []);

    // 派閥カード
    renderFactions(msg.factions || [], msg.factionStates || null, msg.enableFactionReputation === true);

    renderWorldMapItems(msg.mapItems || []);
}

function ensureCartographyStyles() {
    if (document.getElementById('world-cartography-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-cartography-styles';
    style.textContent = `
        .world-map-mode-bar {
            display: flex;
            gap: 0.35rem;
            margin-bottom: 0.45rem;
        }
        .world-map-mode-btn {
            font-size: 0.78em;
            padding: 0.2rem 0.55rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.25);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .world-map-mode-btn.is-active {
            border-color: var(--vscode-focusBorder, #4a90e2);
            background: rgba(74,144,226,0.18);
        }
        .world-map-panel.hidden { display: none !important; }
        .world-map-items-section { margin-top: 0.65rem; font-size: 0.9em; }
        .world-map-items-section.hidden { display: none !important; }
        #world-commerce-details.hidden { display: none !important; }
        #world-markets-details.hidden { display: none !important; }
        #world-logistics-details.hidden { display: none !important; }
        #world-npc-whereabouts-details.hidden { display: none !important; }
        .world-commerce-row {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.28rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            font-size: 0.9em;
        }
        .world-commerce-row:last-child { border-bottom: none; }
        .world-npc-reason {
            grid-column: 1 / -1;
            font-size: 0.8em;
            opacity: 0.72;
            margin-top: 0.15rem;
        }
        .world-market-card {
            margin: 0.45rem 0;
            padding: 0.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 6px;
            background: rgba(255,255,255,0.025);
        }
        .world-market-title {
            font-weight: 600;
            margin-bottom: 0.35rem;
        }
        .world-market-row {
            display: grid;
            grid-template-columns: minmax(7rem, 1fr) auto auto auto;
            gap: 0.45rem;
            align-items: center;
            padding: 0.22rem 0;
            border-top: 1px solid rgba(255,255,255,0.05);
            font-size: 0.86em;
        }
        .world-market-row:first-of-type { border-top: none; }
        .world-market-num {
            font-variant-numeric: tabular-nums;
            text-align: right;
            opacity: 0.85;
        }
        .world-market-row.has-decision-surface {
            align-items: start;
        }
        .world-market-decision {
            grid-column: 1 / -1;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.35rem;
            margin-top: 0.28rem;
            padding-top: 0.32rem;
            border-top: 1px dashed rgba(255,255,255,0.08);
            font-size: 0.82em;
        }
        .world-market-pressure,
        .world-market-evidence {
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 999px;
            padding: 0.08rem 0.42rem;
            background: rgba(255,255,255,0.04);
        }
        .world-market-route,
        .world-market-local {
            opacity: 0.78;
        }
        .world-market-trade {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.35rem;
            margin-top: 0.35rem;
            padding-top: 0.35rem;
            border-top: 1px dashed rgba(255,255,255,0.08);
        }
        .world-market-trade input[type="number"] {
            width: 3.2rem;
            font-size: 0.85em;
            padding: 0.15rem 0.3rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
        }
        .world-market-trade-btn {
            font-size: 0.78em;
            padding: 0.18rem 0.5rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.25);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .world-market-trade-btn:hover:not(:disabled) {
            border-color: var(--vscode-focusBorder, #4a90e2);
        }
        .world-market-trade-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }
        .world-commerce-role-select {
            font-size: 0.9em;
            padding: 0.15rem 0.35rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
            max-width: 12rem;
        }
        .world-commerce-trade-toast {
            font-size: 0.82em;
            margin-top: 0.35rem;
            opacity: 0.85;
        }
        .world-commerce-trade-toast.is-error {
            color: var(--vscode-errorForeground, #f48771);
        }
        .world-commerce-trade-toast.is-ok {
            color: var(--vscode-charts-green, #89d185);
        }
        .world-npc-whereabouts-row {
            display: grid;
            grid-template-columns: minmax(7rem, 1fr) minmax(7rem, 1fr) auto;
            gap: 0.45rem;
            align-items: center;
            padding: 0.35rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            font-size: 0.88em;
        }
        .world-npc-whereabouts-row:last-child { border-bottom: none; }
        .world-npc-transit {
            color: var(--vscode-charts-yellow, #c0a040);
            font-size: 0.84em;
            white-space: nowrap;
        }
        .world-map-item-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding: 0.35rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .world-map-item-label { flex: 1; min-width: 0; }
        .world-cartography-stage {
            position: relative;
            border-radius: 4px;
            overflow: hidden;
            background: rgba(0,0,0,0.12);
        }
        .world-cartography-stage img {
            width: 100%;
            display: block;
            user-select: none;
            -webkit-user-drag: none;
        }
        .world-map-pin {
            position: absolute;
            transform: translate(-50%, -100%);
            border: none;
            background: transparent;
            font-size: 1.15em;
            line-height: 1;
            padding: 0;
            cursor: default;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.65));
            opacity: 0.88;
            z-index: 4;
        }
        .world-map-pin::before {
            content: '';
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            min-width: 44px;
            min-height: 44px;
        }
        .world-map-pin.is-interactive {
            cursor: pointer;
        }
        .world-map-pin.is-interactive:hover,
        .world-map-pin.is-selected {
            transform: translate(-50%, -100%) scale(1.12);
            z-index: 6;
        }
        .world-map-pin.is-selected {
            filter: drop-shadow(0 0 8px rgba(120, 180, 255, 0.95));
        }
        .world-map-pin.is-current {
            font-size: 1.45em;
            opacity: 1;
            filter: drop-shadow(0 0 6px rgba(255,210,80,0.9));
            z-index: 5;
            animation: world-pin-pulse 2.4s ease-in-out infinite;
        }
        @keyframes world-pin-pulse {
            0%, 100% { filter: drop-shadow(0 0 4px rgba(255,210,80,0.75)); }
            50% { filter: drop-shadow(0 0 10px rgba(255,220,120,1)); }
        }
        .world-map-region-label {
            position: absolute;
            transform: translate(-50%, 0);
            font-size: 0.62em;
            line-height: 1.15;
            padding: 1px 4px;
            border-radius: 3px;
            background: rgba(20, 14, 8, 0.72);
            color: #f5e6c8;
            border: 1px solid rgba(255, 220, 160, 0.35);
            pointer-events: none;
            white-space: nowrap;
            max-width: 28%;
            overflow: hidden;
            text-overflow: ellipsis;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
            z-index: 1;
        }
        #world-gen-map-btn.generating {
            opacity: 0.75;
        }
        .world-fog-overlay {
            position: absolute;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 3;
            transition: opacity 0.45s ease;
        }
        .world-fog-overlay.is-unknown {
            background: radial-gradient(circle, rgba(8, 10, 18, 0.92) 0%, rgba(8, 10, 18, 0.78) 55%, rgba(8, 10, 18, 0.35) 100%);
        }
        .world-fog-overlay.is-rumored {
            background: radial-gradient(circle, rgba(12, 16, 24, 0.55) 0%, rgba(12, 16, 24, 0.28) 60%, transparent 100%);
        }
        .world-map-pin.is-rumored {
            opacity: 0.72;
            font-size: 1.05em;
        }
        .world-map-pin.is-hidden-fog {
            display: none;
        }
        .world-map-region-label.is-hidden-fog {
            display: none;
        }
        .world-map-region-label.is-rumored {
            opacity: 0.82;
            font-style: italic;
        }
        .world-location-detail {
            margin-top: 0.55rem;
            padding: 0.65rem 0.75rem;
            border-radius: 6px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(0,0,0,0.22);
            font-size: 0.88em;
        }
        .world-location-detail.hidden { display: none !important; }
        .world-location-detail h4 {
            margin: 0 0 0.35rem;
            font-size: 1.05em;
        }
        .world-location-detail .world-pin-meta {
            opacity: 0.78;
            font-size: 0.9em;
            margin-bottom: 0.45rem;
        }
        .world-location-detail .world-pin-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .world-location-detail .world-pin-action-btn {
            font-size: 0.82em;
            padding: 0.25rem 0.55rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(74,144,226,0.15);
            color: var(--vscode-foreground, #ddd);
            cursor: pointer;
        }
        .world-location-detail .world-pin-action-btn:hover {
            border-color: var(--vscode-focusBorder, #4a90e2);
        }
        #world-overmap {
            position: relative;
        }
        #world-overmap-canvas.world-pin-cursor {
            cursor: crosshair;
        }
        .world-map-overlay-tooltip {
            position: absolute;
            z-index: 8;
            max-width: min(240px, 90%);
            padding: 0.3rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(8, 12, 20, 0.92);
            color: var(--vscode-foreground, #dde4ec);
            font-size: 0.78em;
            line-height: 1.35;
            pointer-events: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 8px rgba(0,0,0,0.45);
        }
        .world-map-overlay-tooltip.hidden { display: none !important; }
        .world-map-overlay-legend {
            position: absolute;
            left: 6px;
            bottom: 6px;
            z-index: 7;
            display: flex;
            flex-wrap: wrap;
            gap: 0.4rem;
            max-width: calc(100% - 12px);
            padding: 0.28rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(8, 12, 20, 0.72);
            font-size: 0.74em;
            line-height: 1.3;
            pointer-events: none;
        }
        .world-map-overlay-legend.hidden { display: none !important; }
        .world-map-overlay-legend-item {
            display: inline-flex;
            align-items: center;
            gap: 0.28em;
            color: var(--vscode-foreground, #cdd6e0);
            white-space: nowrap;
        }
        .world-map-overlay-legend-glyph {
            font-weight: 700;
            font-family: "Courier New", monospace;
        }
        .world-map-overlay-legend-hint {
            opacity: 0.75;
        }
        .world-map-pin-wrap {
            position: absolute;
            transform: translate(-50%, -100%);
            z-index: 4;
        }
        .world-map-pin-wrap .world-map-pin {
            position: relative;
            transform: none;
        }
        .world-map-pin-wrap .world-map-pin.is-interactive:hover,
        .world-map-pin-wrap .world-map-pin.is-selected {
            transform: scale(1.12);
        }
        .world-map-pin-wrap.is-selected { z-index: 6; }
        .world-map-pin.danger-tier-medium {
            filter: drop-shadow(0 0 5px rgba(232, 168, 56, 0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.65));
        }
        .world-map-pin.danger-tier-high {
            filter: drop-shadow(0 0 7px rgba(192, 64, 64, 0.98)) drop-shadow(0 1px 2px rgba(0,0,0,0.65));
        }
        .world-map-pin.danger-tier-high .world-pin-danger-mark {
            position: absolute;
            right: -0.35em;
            top: -0.2em;
            font-size: 0.72em;
            line-height: 1;
            pointer-events: none;
        }
        .world-map-region-label.faction-tint-friendly {
            border-color: rgba(90, 150, 220, 0.45);
            background: rgba(26, 58, 92, 0.72);
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-hostile {
            border-color: rgba(180, 70, 70, 0.5);
            background: rgba(60, 24, 24, 0.72);
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-neutral,
        .world-map-region-label.faction-tint-player-faction {
            transition: background 0.4s ease, border-color 0.4s ease;
        }
        .world-map-region-label.faction-tint-neutral {
            border-color: rgba(120, 150, 120, 0.4);
            background: rgba(30, 50, 30, 0.7);
        }
        .world-map-region-label.faction-tint-player-faction {
            border-color: rgba(210, 170, 60, 0.45);
            background: rgba(74, 58, 0, 0.68);
        }
        .world-map-region-label .world-label-faction-icon {
            margin-right: 0.2em;
        }
        .world-map-event-badge {
            position: absolute;
            left: 100%;
            top: 0;
            margin-left: 2px;
            font-size: 0.78em;
            line-height: 1;
            pointer-events: none;
            animation: world-map-event-pulse 2.2s ease-out 3;
        }
        .world-map-event-badge.is-critical {
            animation: world-map-event-fade 3.5s ease-out forwards;
        }
        @keyframes world-map-event-pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.18); opacity: 0.82; }
        }
        @keyframes world-map-event-fade {
            0%, 70% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0.9); }
        }
        .world-cartography-stage.danger-flash-once {
            animation: world-danger-flash 0.85s ease-out 1;
        }
        @keyframes world-danger-flash {
            0% { box-shadow: inset 0 0 0 rgba(192, 48, 48, 0); }
            35% { box-shadow: inset 0 0 120px rgba(192, 48, 48, 0.28); }
            100% { box-shadow: inset 0 0 0 rgba(192, 48, 48, 0); }
        }
        .world-cartography-routes {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 2;
            pointer-events: none;
        }
        .world-cartography-route-line {
            stroke: rgba(245, 226, 176, 0.55);
            stroke-width: 0.35;
            stroke-dasharray: 1.4 1.1;
            vector-effect: non-scaling-stroke;
        }
        #world-cartography-legend {
            position: absolute;
            left: 6px;
            bottom: 6px;
            z-index: 7;
        }
    `;
    document.head.appendChild(style);
}

function ensureDomainStyles() {
    if (document.getElementById('world-domain-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-domain-styles';
    style.textContent = `
        .domain-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .domain-header-title { font-weight: 600; font-size: 1.02em; }
        .domain-rank-badge {
            font-size: 0.72em;
            padding: 0.08rem 0.4rem;
            border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.18);
            opacity: 0.85;
            margin-left: 0.3rem;
        }
        .domain-header-date { font-size: 0.85em; opacity: 0.65; }
        .domain-resource-row { display: flex; gap: 1rem; margin-bottom: 0.6rem; }
        .domain-resource { display: flex; align-items: center; gap: 0.3rem; font-size: 0.95em; }
        .domain-resource-icon { font-size: 1.05em; }
        .domain-stats-grid { margin-bottom: 0.6rem; }
        .domain-stat-row {
            display: grid;
            grid-template-columns: minmax(6rem, 8rem) 1fr 2.4rem;
            align-items: center;
            gap: 0.5rem;
            padding: 0.14rem 0;
            font-size: 0.85em;
        }
        .domain-stat-label { opacity: 0.8; }
        .domain-stat-bar {
            height: 0.45rem;
            border-radius: 3px;
            background: rgba(255,255,255,0.08);
            overflow: hidden;
        }
        .domain-stat-fill {
            height: 100%;
            background: var(--vscode-charts-blue, #4a90e2);
            border-radius: 3px;
        }
        .domain-stat-value { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
        .domain-actions-left { font-size: 0.8em; opacity: 0.6; margin-top: 0.2rem; }
        .domain-officers-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.6rem; }
        .domain-officer-chip {
            font-size: 0.8em;
            padding: 0.14rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.03);
        }
        .domain-officer-chip.is-away { opacity: 0.6; border-style: dashed; }
        .domain-officer-away { font-style: italic; }
        .domain-action-chips-wrap { margin-bottom: 0.7rem; padding-bottom: 0.6rem; border-bottom: 1px dashed rgba(255,255,255,0.08); }
        .domain-action-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.4rem; }
        .domain-action-chip {
            font-size: 0.8em;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(0,0,0,0.2);
            color: var(--vscode-foreground, #ccc);
            cursor: pointer;
        }
        .domain-action-chip.is-selected {
            border-color: var(--vscode-focusBorder, #4a90e2);
            background: rgba(74,144,226,0.22);
        }
        .domain-section-heading { font-weight: 600; font-size: 0.92em; margin: 0.55rem 0 0.35rem; opacity: 0.9; }
        .domain-petition-card {
            margin-bottom: 0.45rem;
            padding: 0.4rem 0.5rem;
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 5px;
            background: rgba(255,255,255,0.02);
        }
        .domain-petition-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .domain-petition-rulings { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .domain-ruling-btn, .domain-tactic-btn, .domain-dispatch-btn { font-size: 0.8em; }
        .domain-rival-body p, .domain-battle-progress p { font-size: 0.88em; margin: 0.2rem 0; }
        .domain-battle-troops { display: flex; gap: 1rem; font-size: 0.85em; opacity: 0.85; margin-bottom: 0.4rem; }
        .domain-battle-tactics { display: flex; gap: 0.35rem; }
        .domain-mission-list { margin-bottom: 0.3rem; }
        .domain-mission-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.86em;
            padding: 0.15rem 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .domain-mission-months { opacity: 0.6; }
        .domain-mission-report { font-size: 0.85em; opacity: 0.85; margin: 0.2rem 0; }
        .domain-dispatch-form { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-top: 0.4rem; }
        .domain-dispatch-select {
            font-size: 0.82em;
            padding: 0.15rem 0.3rem;
            background: var(--vscode-input-background, #2d2d2d);
            color: var(--vscode-input-foreground, #ccc);
            border: 1px solid var(--vscode-input-border, #555);
            border-radius: 3px;
        }
    `;
    document.head.appendChild(style);
}

function ensureGuildStyles() {
    if (document.getElementById('world-guild-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-guild-styles';
    style.textContent = `
        .guild-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem; }
        .guild-header-title { font-weight: 600; font-size: 1.02em; }
        .guild-rank-badge {
            font-size: 0.72em;
            padding: 0.08rem 0.4rem;
            border-radius: 3px;
            border: 1px solid rgba(255,255,255,0.18);
            opacity: 0.85;
            margin-left: 0.3rem;
        }
        .guild-header-date { font-size: 0.85em; opacity: 0.65; }
        .guild-resource-row { display: flex; gap: 1rem; margin-bottom: 0.6rem; flex-wrap: wrap; }
        .guild-resource { display: flex; align-items: center; gap: 0.3rem; font-size: 0.95em; }
        .guild-stats-grid { margin-bottom: 0.6rem; }
        .guild-stat-row {
            display: grid;
            grid-template-columns: minmax(6rem, 8rem) 1fr 2.4rem;
            align-items: center;
            gap: 0.5rem;
            padding: 0.14rem 0;
            font-size: 0.85em;
        }
        .guild-stat-label { opacity: 0.8; }
        .guild-stat-bar {
            height: 0.45rem;
            border-radius: 3px;
            background: rgba(255,255,255,0.08);
            overflow: hidden;
        }
        .guild-stat-fill {
            height: 100%;
            background: var(--vscode-charts-orange, #ce9178);
            border-radius: 3px;
        }
        .guild-stat-value { text-align: right; font-variant-numeric: tabular-nums; opacity: 0.85; }
        .guild-actions-left { font-size: 0.8em; opacity: 0.6; margin-top: 0.2rem; }
        .guild-adventurers-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
        .guild-board-section { margin-top: 0.5rem; }
        .guild-section-heading { font-size: 0.82em; font-weight: 600; opacity: 0.75; margin-bottom: 0.35rem; }
        .guild-request-card {
            padding: 0.45rem 0.5rem;
            margin-bottom: 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.02);
        }
        .guild-request-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .guild-request-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
        .guild-quests-section { margin-top: 0.5rem; }
        .guild-quest-card {
            padding: 0.45rem 0.5rem;
            margin-bottom: 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(255,255,255,0.02);
        }
        .guild-quest-summary { font-size: 0.88em; margin-bottom: 0.3rem; }
        .guild-quest-active-row {
            display: flex;
            justify-content: space-between;
            gap: 0.5rem;
            font-size: 0.85em;
            padding: 0.2rem 0;
        }
        .guild-party-form { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin-top: 0.25rem; }
        .guild-party-checks { display: flex; flex-wrap: wrap; gap: 0.4rem; font-size: 0.85em; }
        .guild-party-check { display: flex; align-items: center; gap: 0.2rem; }
        .guild-quest-reports { font-size: 0.82em; opacity: 0.85; margin-top: 0.25rem; }
        .guild-adventurer-chip {
            font-size: 0.8em;
            padding: 0.14rem 0.45rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.03);
        }
    `;
    document.head.appendChild(style);
}

function rebuildWorldPinCatalog(msg) {
    _worldPinCatalog = new Map();
    const catalog = Array.isArray(msg.locationPinCatalog) ? msg.locationPinCatalog : [];
    for (const pin of catalog) {
        if (pin && pin.locationId) {
            _worldPinCatalog.set(pin.locationId, pin);
        }
    }
}

/** Catalog order and membership never depend on Settlement/Diorama data
 * availability (only on `fogVisibility === 'discovered'`), so the button row
 * itself is already stable across location switches. What this function must
 * still protect is keyboard focus: every call fully rebuilds the DOM nodes,
 * and a worldView message following a click (near-immediate) used to drop
 * focus back to <body> the instant the user's own click had set it. */
function renderWorldLocationNavigator() {
    const el = document.getElementById('world-location-navigator');
    if (!el) { return; }
    const locations = [..._worldPinCatalog.values()].filter((pin) => (
        pin && pin.locationId && pin.locationName && pin.fogVisibility === 'discovered'
    ));
    if (!locations.length) {
        el.innerHTML = '';
        el.classList.add('hidden');
        return;
    }
    const activeElement = (typeof document.activeElement !== 'undefined') ? document.activeElement : null;
    const focusedLocationId = (activeElement && activeElement.classList
        && activeElement.classList.contains('world-location-chip'))
        ? activeElement.dataset.locationId
        : _pendingWorldLocationFocusId;
    el.classList.remove('hidden');
    el.innerHTML = '';
    const title = document.createElement('span');
    title.className = 'world-location-navigator-title';
    title.textContent = T('webview.world.locationNavigator');
    el.appendChild(title);
    let focusTarget = null;
    for (const pin of locations) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-location-chip';
        btn.dataset.locationId = pin.locationId;
        btn.textContent = `${LOCATION_TYPE_ICON[pin.locationType] || LOCATION_TYPE_ICON.other} ${pin.locationName}`;
        btn.title = pin.regionName ? `${pin.locationName} · ${pin.regionName}` : pin.locationName;
        const selected = pin.locationId === _selectedPinId;
        btn.classList.toggle('is-selected', selected);
        btn.classList.toggle('is-current', pin.locationId === currentWorldLocationId);
        btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            // Keep the user's chosen focus target across the asynchronous
            // host round-trip, even if Chromium briefly reports <body> while
            // the Webview message rebuilds this row.
            _pendingWorldLocationFocusId = pin.locationId;
            if (_worldLocationFocusClearTimer && typeof clearTimeout === 'function') {
                clearTimeout(_worldLocationFocusClearTimer);
                _worldLocationFocusClearTimer = null;
            }
            selectWorldLocationPin(pin.locationId);
        });
        el.appendChild(btn);
        if (pin.locationId === focusedLocationId) { focusTarget = btn; }
    }
    if (focusTarget && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true });
        if (typeof setTimeout === 'function') {
            if (_worldLocationFocusClearTimer && typeof clearTimeout === 'function') {
                clearTimeout(_worldLocationFocusClearTimer);
            }
            _worldLocationFocusClearTimer = setTimeout(() => {
                const active = document.activeElement;
                if (active && active.dataset?.locationId === focusedLocationId) {
                    _pendingWorldLocationFocusId = null;
                }
                _worldLocationFocusClearTimer = null;
            }, 750);
        }
    }
}

function rebuildRegionFeedbackMap(msg) {
    _regionFeedbackMap = new Map();
    const rows = Array.isArray(msg.regionMapFeedback) ? msg.regionMapFeedback : [];
    for (const row of rows) {
        if (row && row.regionId) {
            _regionFeedbackMap.set(row.regionId, row);
        }
    }
}

function getRegionFeedback(regionId) {
    if (!regionId) { return null; }
    return _regionFeedbackMap.get(regionId) || null;
}

function maybeFlashHighDangerEntry(msg) {
    const locId = msg.currentLocationId;
    if (!locId || locId === _lastDangerFlashLocationId) { return; }
    const meta = findWorldPinMeta(locId);
    if (!meta || meta.dangerTier !== 'high') { return; }
    _lastDangerFlashLocationId = locId;
    const stage = document.getElementById('world-cartography-stage');
    if (!stage) { return; }
    stage.classList.remove('danger-flash-once');
    void stage.offsetWidth;
    stage.classList.add('danger-flash-once');
    stage.addEventListener('animationend', () => {
        stage.classList.remove('danger-flash-once');
    }, { once: true });
}

function applyDangerClassesToPin(el, pinMeta) {
    if (!pinMeta || pinMeta.fogVisibility !== 'discovered') { return; }
    if (pinMeta.dangerTier === 'medium') {
        el.classList.add('danger-tier-medium');
    } else if (pinMeta.dangerTier === 'high') {
        el.classList.add('danger-tier-high');
        const mark = document.createElement('span');
        mark.className = 'world-pin-danger-mark';
        mark.textContent = '⚠';
        mark.setAttribute('aria-hidden', 'true');
        el.appendChild(mark);
    }
}

function appendMapEventBadge(wrap, pinMeta) {
    if (!pinMeta?.mapHighlight) { return; }
    const badge = document.createElement('span');
    badge.className = 'world-map-event-badge';
    const sev = pinMeta.highlightSeverity || 'info';
    if (sev === 'critical') { badge.classList.add('is-critical'); }
    badge.textContent = MAP_EVENT_SEVERITY_GLYPH[sev] || '🔥';
    badge.title = T('webview.world.mapEventBadge');
    wrap.appendChild(badge);
}

function decorateRegionLabelEl(el, label, visibility) {
    if (visibility !== 'discovered') { return; }
    const feedback = getRegionFeedback(label.regionId);
    if (!feedback) { return; }
    if (feedback.factionTint) {
        el.classList.add(`faction-tint-${feedback.factionTint}`);
    }
    if (feedback.controllingFactionName && feedback.factionType) {
        const icon = FACTION_TYPE_ICON[feedback.factionType] || '';
        if (icon) {
            const iconSpan = document.createElement('span');
            iconSpan.className = 'world-label-faction-icon';
            iconSpan.textContent = icon;
            el.prepend(iconSpan);
        }
    }
}

function findWorldPinMeta(locationId) {
    if (!locationId) { return null; }
    return _worldPinCatalog.get(locationId) || null;
}

function postWorldSettlementFocus(locationId) {
    if (!locationId || typeof locationId !== 'string') { return; }
    vscode.postMessage({ type: 'setWorldSettlementFocus', locationId });
}

function postClearWorldSettlementFocus() {
    vscode.postMessage({ type: 'clearWorldSettlementFocus' });
}

function clearWorldPinSelection() {
    _selectedPinId = null;
    syncWorldPinSelectionUi();
    renderWorldLocationDetailPanel();
    // Dismissing pin selection also clears remote settlement preview focus.
    postClearWorldSettlementFocus();
}

function selectWorldLocationPin(locationId) {
    const meta = findWorldPinMeta(locationId);
    if (!meta) { return; }
    if (meta.fogVisibility === 'rumored' || meta.fogVisibility === 'unknown') { return; }
    const next = (_selectedPinId === locationId) ? null : locationId;
    _selectedPinId = next;
    syncWorldPinSelectionUi();
    renderWorldLocationDetailPanel();
    // Reuse World-pin selection for settlement diorama preview (does not travel).
    if (!next) {
        postClearWorldSettlementFocus();
        return;
    }
    if (next === currentWorldLocationId) {
        // Selecting current pin normalizes to current-location settlement display.
        postClearWorldSettlementFocus();
        return;
    }
    postWorldSettlementFocus(next);
}

function postWorldInsertChatText(text) {
    if (!text || typeof text !== 'string') { return; }
    vscode.postMessage({ type: 'insertChatText', text });
}

function renderWorldMapItems(items) {
    const section = document.getElementById('world-map-items-section');
    const list = document.getElementById('world-map-items-list');
    if (!section || !list) { return; }
    const held = Array.isArray(items) ? items.filter((i) => i && i.id && i.name) : [];
    if (held.length === 0) {
        section.classList.add('hidden');
        list.innerHTML = '';
        return;
    }
    section.classList.remove('hidden');
    list.innerHTML = '';
    for (const item of held) {
        const row = document.createElement('div');
        row.className = 'world-map-item-row';
        const label = document.createElement('span');
        label.className = 'world-map-item-label';
        const kindIcon = item.kind === 'rumor' ? '💬' : item.kind === 'informant' ? '🗣' : '📜';
        label.textContent = `${kindIcon} ${item.name}`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-pin-action-btn';
        btn.textContent = T('webview.world.mapItemUnfold');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            postWorldInsertChatText(T('webview.world.mapItemUnfoldText', { name: item.name }));
        });
        row.appendChild(label);
        row.appendChild(btn);
        list.appendChild(row);
    }
}

function buildWorldPinActionText(action, meta) {
    const name = meta.locationName || meta.locationId;
    if (action === 'move') {
        return T('webview.world.pinAction.move', { name });
    }
    if (action === 'examine') {
        return T('webview.world.pinAction.examine', { name });
    }
    return T('webview.world.pinAction.stay', { name });
}

function renderWorldLocationDetailPanel() {
    const panel = document.getElementById('world-location-detail');
    if (!panel) { return; }
    const meta = _selectedPinId ? findWorldPinMeta(_selectedPinId) : null;
    if (!meta || meta.fogVisibility !== 'discovered') {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    panel.classList.remove('hidden');
    const title = meta.locationName || meta.locationId;
    const typeLabel = meta.locationType || 'other';
    const metaParts = [`${T('webview.world.pinDetail.type')}: ${typeLabel}`];
    if (typeof meta.dangerLevel === 'number') {
        metaParts.push(`${T('webview.world.pinDetail.danger')}: ${meta.dangerLevel}/10`);
    }
    if (meta.factionName) {
        metaParts.push(`${T('webview.world.pinDetail.faction')}: ${meta.factionName}`);
    }
    if (meta.regionName) {
        metaParts.push(meta.regionName);
    }

    const actions = meta.isCurrent
        ? [{ action: 'stay', label: T('webview.world.pinDetail.stayBtn') }]
        : [
            { action: 'move', label: T('webview.world.pinDetail.moveBtn') },
            { action: 'examine', label: T('webview.world.pinDetail.examineBtn') },
        ];

    panel.innerHTML = '';
    const heading = document.createElement('h4');
    heading.textContent = title;
    panel.appendChild(heading);

    const metaEl = document.createElement('div');
    metaEl.className = 'world-pin-meta';
    metaEl.textContent = metaParts.join(' · ');
    panel.appendChild(metaEl);

    const actionsEl = document.createElement('div');
    actionsEl.className = 'world-pin-actions';
    for (const item of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-pin-action-btn';
        btn.textContent = item.label;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            postWorldInsertChatText(buildWorldPinActionText(item.action, meta));
        });
        actionsEl.appendChild(btn);
    }
    panel.appendChild(actionsEl);
}

function syncWorldPinSelectionUi() {
    document.querySelectorAll('.world-map-pin[data-location-id], .world-location-chip[data-location-id]').forEach((el) => {
        const id = el.getAttribute('data-location-id');
        const selected = Boolean(id && id === _selectedPinId);
        el.classList.toggle('is-selected', selected);
        if (el.classList.contains('world-location-chip')) {
            el.setAttribute('aria-pressed', selected ? 'true' : 'false');
        }
        const wrap = el.closest('.world-map-pin-wrap');
        if (wrap) { wrap.classList.toggle('is-selected', selected); }
    });
}

function wireParchmentWorldPin(el, pin, msg) {
    const visibility = getRegionFogVisibility(pin.regionId, msg.fog);
    el.dataset.locationId = pin.locationId || '';
    if (visibility === 'rumored') {
        el.title = T('webview.world.pinRumoredTooltip');
        el.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        return;
    }
    if (visibility !== 'discovered') { return; }
    el.classList.add('is-interactive');
    const meta = findWorldPinMeta(pin.locationId);
    const tooltipParts = [pin.locationName || pin.locationId];
    if (meta?.locationType) { tooltipParts.push(meta.locationType); }
    if (typeof meta?.dangerLevel === 'number') {
        tooltipParts.push(`${T('webview.world.pinDetail.danger')} ${meta.dangerLevel}/10`);
    }
    el.title = tooltipParts.join(' · ');
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectWorldLocationPin(pin.locationId);
    });
}

function escapeMermaidNodeId(id) {
    return String(id).replace(/[^a-zA-Z0-9_]/g, '_');
}

function resolveLocationIdFromMermaidNode(nodeId) {
    const match = String(nodeId).match(/flowchart-(.+?)(?:-\d+)?$/);
    const escaped = match ? match[1] : String(nodeId).replace(/^flowchart-/, '').replace(/-\d+$/, '');
    for (const [locId] of _worldPinCatalog) {
        if (escapeMermaidNodeId(locId) === escaped) {
            return locId;
        }
    }
    return null;
}

function initMermaidPinClicks(container) {
    if (!container) { return; }
    const svg = container.querySelector('svg');
    if (!svg) { return; }
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach((node) => {
        const locationId = resolveLocationIdFromMermaidNode(node.id || '');
        const meta = locationId ? findWorldPinMeta(locationId) : null;
        if (!meta || meta.fogVisibility !== 'discovered') { return; }
        node.style.cursor = 'pointer';
        node.addEventListener('click', (e) => {
            e.stopPropagation();
            selectWorldLocationPin(meta.locationId);
        });
    });
}

function initWorldPinDismiss() {
    if (_worldPinDismissReady) { return; }
    _worldPinDismissReady = true;
    document.addEventListener('click', (e) => {
        if (!_selectedPinId) { return; }
        const panel = document.getElementById('world-location-detail');
        const target = e.target;
        if (target && (
            target.closest('.world-map-pin')
            || target.closest('#world-location-detail')
            || target.closest('#world-mermaid g.node')
            || target.closest('#world-overmap-canvas')
        )) {
            return;
        }
        if (panel && !panel.classList.contains('hidden')) {
            clearWorldPinSelection();
        }
    });
}

function hitTestWorldPin(clientX, clientY, canvas) {
    if (!canvas || !_worldViewMsg) { return null; }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    let best = null;
    let bestDist = WORLD_PIN_HIT_RADIUS_PX + 1;
    for (const pin of _worldPinCatalog.values()) {
        if (pin.fogVisibility !== 'discovered') { continue; }
        const px = (pin.leftPct / 100) * cssWidth;
        const py = (pin.topPct / 100) * cssHeight;
        const dist = Math.hypot(px - x, py - y);
        if (dist <= WORLD_PIN_HIT_RADIUS_PX && dist < bestDist) {
            bestDist = dist;
            best = pin.locationId;
        }
    }
    return best;
}

window.selectWorldLocationPin = selectWorldLocationPin;
window.clearWorldLocationPinSelection = clearWorldPinSelection;
window.hitTestWorldPin = hitTestWorldPin;

function getRegionFogVisibility(regionId, fog) {
    if (!fog || !regionId) { return 'discovered'; }
    const discovered = new Set(fog.discoveredRegionIds || []);
    const rumored = new Set(fog.rumoredRegionIds || []);
    if (discovered.has(regionId)) { return 'discovered'; }
    if (rumored.has(regionId)) { return 'rumored'; }
    return 'unknown';
}

function renderFogOverlays(container, msg) {
    if (!container) { return; }
    container.querySelectorAll('.world-fog-overlay').forEach((el) => el.remove());
    const layout = Array.isArray(msg.fogRegionLayout) ? msg.fogRegionLayout : [];
    const fog = msg.fog;
    if (!fog || layout.length === 0) { return; }

    for (const entry of layout) {
        const visibility = getRegionFogVisibility(entry.regionId, fog);
        if (visibility === 'discovered') { continue; }
        const el = document.createElement('div');
        el.className = `world-fog-overlay ${visibility === 'unknown' ? 'is-unknown' : 'is-rumored'}`;
        const diameter = Math.max(8, (entry.radiusPct || 7) * 2);
        el.style.left = `${entry.leftPct}%`;
        el.style.top = `${entry.topPct}%`;
        el.style.width = `${diameter}%`;
        el.style.height = `${diameter}%`;
        container.appendChild(el);
    }
}

function hasSettlementMapContent(msg) {
    if (!msg) { return false; }
    const interior = msg.mobileBaseInterior;
    if (msg.enableMobileBaseSystem === true && interior && !interior.interiorBlocked && interior.hasCanvas) {
        return true;
    }
    if (msg.enableSettlementMode !== true) {
        return false;
    }
    // Available canvas, or honest empty/invalid display context (SLICE2 preview/current).
    if (msg.settlementView) {
        return true;
    }
    return Boolean(msg.settlementDisplayContext);
}

/** Mermaid, parchment, and tile are never campaign-gated: this is the one
 * mode always safe to fall back to when a persisted mode becomes unavailable. */
const WORLD_MAP_MODE_SAFE_FALLBACK = 'mermaid';

/** A persisted mode (localStorage) that a *previous* campaign supported can
 * outlive that campaign. This distinguishes the two causes a mode can be
 * unavailable so only a genuine capability loss forces a fallback:
 *   - "this location has no data" (location-level) -> keep the mode selected,
 *     the panel renders its own honest empty state;
 *   - "this campaign does not have the feature at all" (campaign-level) ->
 *     the mode cannot be restored from storage and must fall back once. */
function syncSettlementMapModeUi(msg) {
    const btn = document.getElementById('world-map-mode-settlement');
    if (!btn) { return; }
    const campaignSupportsSettlement = Boolean(msg && (
        msg.enableSettlementMode === true
        || msg.enableMobileBaseSystem === true
        || hasSettlementMapContent(msg)
    ));
    btn.classList.toggle('hidden', !campaignSupportsSettlement);
    if (!campaignSupportsSettlement && worldMapMode === 'settlement') {
        setWorldMapMode(WORLD_MAP_MODE_SAFE_FALLBACK, { persist: true });
    }
}

/** Diorama is a persistent campaign mode even when the focused location has no snapshot. */
function syncDioramaMapModeUi(msg) {
    const btn = document.getElementById('world-map-mode-diorama');
    if (!btn) { return; }
    const campaignSupportsDiorama = Boolean(msg && msg.enableSettlementDiorama === true);
    btn.classList.toggle('hidden', !campaignSupportsDiorama);
    if (!campaignSupportsDiorama && worldMapMode === 'diorama') {
        setWorldMapMode(WORLD_MAP_MODE_SAFE_FALLBACK, { persist: true });
    }
}

function setWorldMapMode(mode, options = {}) {
    const persist = options.persist !== false;
    const supported = new Set(['mermaid', 'parchment', 'tile', 'settlement', 'diorama']);
    worldMapMode = supported.has(mode) ? mode : WORLD_MAP_MODE_SAFE_FALLBACK;
    if (persist) {
        try { localStorage.setItem(WORLD_MAP_MODE_KEY, worldMapMode); } catch { /* ignore */ }
    }
    applyWorldMapModeVisibility();
}

function applyWorldMapModeVisibility() {
    const panels = {
        mermaid: document.getElementById('world-mermaid'),
        parchment: document.getElementById('world-cartography'),
        tile: document.getElementById('world-overmap'),
        settlement: document.getElementById('world-settlement'),
        diorama: document.getElementById('world-diorama'),
    };
    const buttons = {
        mermaid: document.getElementById('world-map-mode-mermaid'),
        parchment: document.getElementById('world-map-mode-parchment'),
        tile: document.getElementById('world-map-mode-tile'),
        settlement: document.getElementById('world-map-mode-settlement'),
        diorama: document.getElementById('world-map-mode-diorama'),
    };
    for (const mode of Object.keys(panels)) {
        if (panels[mode]) {
            panels[mode].classList.toggle('hidden', worldMapMode !== mode);
        }
        if (buttons[mode]) {
            buttons[mode].classList.toggle('is-active', worldMapMode === mode);
        }
    }
    if (worldMapMode === 'tile') {
        // The canvas has zero width while its panel is hidden — draw after unhide.
        requestAnimationFrame(() => drawTileOvermap());
        if (typeof registerTileOvermapAnimation === 'function') { registerTileOvermapAnimation(); }
    } else if (typeof unregisterTileOvermapAnimation === 'function') {
        unregisterTileOvermapAnimation();
    }
    if (typeof syncVehicleTileHint === 'function') {
        syncVehicleTileHint(_worldViewMsg);
    }
    if (worldMapMode === 'settlement' && typeof drawSettlementIsometric === 'function') {
        requestAnimationFrame(() => drawSettlementIsometric());
    }
    if (worldMapMode === 'diorama' && typeof renderSettlementDiorama === 'function') {
        requestAnimationFrame(() => renderSettlementDiorama());
    }
    // Stop (or resume) the diorama's water-bob animation loop when leaving/entering
    // this mode — mirrors the tile-overmap register/unregister pattern above.
    if (typeof updateDioramaWaterAnimationState === 'function') {
        updateDioramaWaterAnimationState();
    }
}

function renderCartographyMap(msg) {
    const stage = document.getElementById('world-cartography-stage');
    const img = document.getElementById('world-cartography-img');
    const pinsEl = document.getElementById('world-cartography-pins');
    const empty = document.getElementById('world-cartography-empty');
    const routesEl = document.getElementById('world-cartography-routes');
    if (!stage || !img || !pinsEl) { return; }

    const hasImage = Boolean(msg.cartographyImage);
    if (empty) {
        empty.classList.toggle('hidden', hasImage);
    }
    stage.style.display = hasImage ? '' : 'none';

    if (!hasImage) {
        img.removeAttribute('src');
        pinsEl.innerHTML = '';
        if (routesEl) { routesEl.innerHTML = ''; }
        renderCartographyLegend([]);
        return;
    }

    img.src = msg.cartographyImage;
    img.alt = msg.worldName ? `${msg.worldName} map` : 'World map';

    pinsEl.innerHTML = '';
    renderFogOverlays(stage, msg);
    renderCartographyRoutes(routesEl, msg);

    const labels = Array.isArray(msg.cartographyRegionLabels) ? msg.cartographyRegionLabels : [];
    for (const label of labels) {
        if (typeof label.leftPct !== 'number' || typeof label.topPct !== 'number') { continue; }
        const visibility = getRegionFogVisibility(label.regionId, msg.fog);
        if (visibility === 'unknown') { continue; }
        const el = document.createElement('span');
        el.className = 'world-map-region-label';
        if (visibility === 'rumored') { el.classList.add('is-rumored'); }
        el.style.left = `${label.leftPct}%`;
        el.style.top = `${label.topPct}%`;
        el.textContent = label.regionName || label.regionId || '';
        el.title = label.regionName || label.regionId || '';
        decorateRegionLabelEl(el, label, visibility);
        pinsEl.appendChild(el);
    }

    const pins = Array.isArray(msg.cartographyPins) ? msg.cartographyPins : [];
    for (const pin of pins) {
        if (typeof pin.leftPct !== 'number' || typeof pin.topPct !== 'number') { continue; }
        const visibility = getRegionFogVisibility(pin.regionId, msg.fog);
        if (visibility === 'unknown') { continue; }
        const pinMeta = findWorldPinMeta(pin.locationId);
        const wrap = document.createElement('span');
        wrap.className = 'world-map-pin-wrap';
        wrap.style.left = `${pin.leftPct}%`;
        wrap.style.top = `${pin.topPct}%`;
        if (_selectedPinId && pin.locationId === _selectedPinId) {
            wrap.classList.add('is-selected');
        }

        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'world-map-pin';
        el.style.left = '';
        el.style.top = '';
        el.style.position = 'relative';
        el.style.transform = 'none';
        if (pin.locationId && pin.locationId === msg.currentLocationId) {
            el.classList.add('is-current');
        }
        if (visibility === 'rumored') {
            el.classList.add('is-rumored');
        }
        const pinLabel = visibility === 'rumored' ? '?' : (pin.locationName || pin.locationId || '');
        const typeIcon = LOCATION_TYPE_ICON[pinMeta?.locationType] || LOCATION_TYPE_ICON.other;
        el.title = visibility === 'rumored' ? T('webview.world.pinRumoredTooltip') : (pin.locationName || pin.locationId || '');
        el.textContent = visibility === 'rumored' ? '?' : (pin.locationId === msg.currentLocationId ? '@' : typeIcon);
        el.setAttribute('aria-label', pinLabel || 'Location');
        if (_selectedPinId && pin.locationId === _selectedPinId) {
            el.classList.add('is-selected');
        }
        if (pinMeta) {
            applyDangerClassesToPin(el, pinMeta);
            appendMapEventBadge(wrap, pinMeta);
        }
        wireParchmentWorldPin(el, pin, msg);
        wrap.appendChild(el);
        pinsEl.appendChild(wrap);
    }

    renderCartographyLegend(pins.map((pin) => findWorldPinMeta(pin.locationId)).filter(Boolean));
}

/** Trade-road / travel-route lines between connected regions (parchment overlay only). */
function renderCartographyRoutes(routesEl, msg) {
    if (!routesEl) { return; }
    routesEl.setAttribute('viewBox', '0 0 100 100');
    routesEl.setAttribute('preserveAspectRatio', 'none');
    routesEl.innerHTML = '';
    const edges = Array.isArray(msg.cartographyRouteEdges) ? msg.cartographyRouteEdges : [];
    for (const edge of edges) {
        if ([edge.x1Pct, edge.y1Pct, edge.x2Pct, edge.y2Pct].some((v) => typeof v !== 'number')) { continue; }
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'world-cartography-route-line');
        line.setAttribute('x1', String(edge.x1Pct));
        line.setAttribute('y1', String(edge.y1Pct));
        line.setAttribute('x2', String(edge.x2Pct));
        line.setAttribute('y2', String(edge.y2Pct));
        routesEl.appendChild(line);
    }
}

const CARTOGRAPHY_LEGEND_ORDER = ['settlement', 'landmark', 'ruins', 'dungeon', 'wilderness'];

/** Compact legend keyed off the location types actually present on the current map. */
function renderCartographyLegend(pinMetas) {
    const el = document.getElementById('world-cartography-legend');
    if (!el) { return; }
    const seenTypes = new Set();
    let hasDanger = false;
    let hasRumored = false;
    for (const meta of pinMetas) {
        if (meta?.locationType) { seenTypes.add(meta.locationType); }
        if (meta?.dangerTier === 'high' || meta?.dangerTier === 'medium') { hasDanger = true; }
        if (meta?.fogVisibility === 'rumored') { hasRumored = true; }
    }
    if (seenTypes.size === 0) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    el.classList.remove('hidden');
    el.innerHTML = '';
    for (const type of CARTOGRAPHY_LEGEND_ORDER) {
        if (!seenTypes.has(type)) { continue; }
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        const glyph = document.createElement('span');
        glyph.className = 'world-map-overlay-legend-glyph';
        glyph.textContent = LOCATION_TYPE_ICON[type] || LOCATION_TYPE_ICON.other;
        item.appendChild(glyph);
        item.appendChild(document.createTextNode(T(`webview.world.locationType.${type}`)));
        el.appendChild(item);
    }
    if (hasDanger) {
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        item.innerHTML = '<span class="world-map-overlay-legend-glyph">⚠</span>';
        item.appendChild(document.createTextNode(T('webview.world.pinDetail.danger')));
        el.appendChild(item);
    }
    if (hasRumored) {
        const item = document.createElement('span');
        item.className = 'world-map-overlay-legend-item';
        item.innerHTML = '<span class="world-map-overlay-legend-glyph">?</span>';
        item.appendChild(document.createTextNode(T('webview.world.overlayLegendRumored')));
        el.appendChild(item);
    }
}

function renderMermaidMap(mmdCode, msg) {
    const container = document.getElementById('world-mermaid');
    if (!container || !mmdCode) { return; }

    container.removeAttribute('data-processed');
    container.innerHTML = escapeHtml(mmdCode);

    if (window.mermaid) {
        window.mermaid.run({ nodes: [container] })
            .then(() => {
                resetMapPanState();
                initMapPanZoomOnce(container);
                applyMapTransform(container);
                addMapPanZoomHint(container);
                initMermaidPinClicks(container);
                renderWorldLocationDetailPanel();
            })
            .catch((e) => {
                console.error('World map Mermaid render error:', e);
                container.textContent = mmdCode;
            });
    }
}

// ---------------------------------------------------------------------------
// World Map Pan & Zoom (フルスクラッチ軽量実装 / npm モジュール不使用)
// ---------------------------------------------------------------------------

let _mapPanZoomReady = false;
let _mapPanState = { scale: 1, tx: 0, ty: 0 };

function ensureMapPanZoomStyles() {
    if (document.getElementById('world-map-panzoom-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-map-panzoom-styles';
    style.textContent = `
        #world-mermaid {
            overflow: hidden !important;
            min-height: 300px;
            max-height: 65vh;
            position: relative;
            cursor: grab;
            user-select: none;
            -webkit-user-select: none;
            border-radius: 4px;
            background: rgba(0,0,0,0.1);
        }
        #world-mermaid.world-map-panning { cursor: grabbing !important; }
        #world-mermaid > svg {
            display: block;
            transform-origin: 0 0;
        }
        .world-map-hint {
            position: absolute;
            bottom: 5px;
            right: 8px;
            font-size: 0.65em;
            opacity: 0.38;
            pointer-events: none;
            color: var(--vscode-foreground, #ccc);
            font-family: var(--vscode-font-family, sans-serif);
        }
    `;
    document.head.appendChild(style);
}

function resetMapPanState() {
    _mapPanState = { scale: 1, tx: 0, ty: 0 };
}

function applyMapTransform(viewport) {
    const svg = viewport.querySelector('svg');
    if (!svg) { return; }
    const { scale, tx, ty } = _mapPanState;
    svg.style.transform = `matrix(${scale},0,0,${scale},${tx},${ty})`;
    svg.style.transformOrigin = '0 0';
}

function addMapPanZoomHint(viewport) {
    // innerHTML replacement cleared the old hint — always re-add after render
    let hint = viewport.querySelector('.world-map-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'world-map-hint';
        hint.textContent = T('webview.world.mapPanHint');
        viewport.appendChild(hint);
    }
}

function initMapPanZoomOnce(viewport) {
    ensureMapPanZoomStyles();
    if (_mapPanZoomReady) { return; }
    _mapPanZoomReady = true;

    let dragging = false;
    let startX = 0, startY = 0, startTx = 0, startTy = 0;

    viewport.addEventListener('mousedown', (e) => {
        if (e.button !== 0) { return; }
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startTx = _mapPanState.tx;
        startTy = _mapPanState.ty;
        viewport.classList.add('world-map-panning');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) { return; }
        _mapPanState.tx = startTx + (e.clientX - startX);
        _mapPanState.ty = startTy + (e.clientY - startY);
        applyMapTransform(viewport);
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            viewport.classList.remove('world-map-panning');
        }
    });

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const next = Math.max(0.15, Math.min(5, _mapPanState.scale * factor));
        const rect = viewport.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        _mapPanState.tx = mx - (mx - _mapPanState.tx) * (next / _mapPanState.scale);
        _mapPanState.ty = my - (my - _mapPanState.ty) * (next / _mapPanState.scale);
        _mapPanState.scale = next;
        applyMapTransform(viewport);
    }, { passive: false });

    viewport.addEventListener('dblclick', () => {
        resetMapPanState();
        applyMapTransform(viewport);
    });
}

// ---------------------------------------------------------------------------
// ロケーション画像履歴
// ---------------------------------------------------------------------------

function renderLocationImages(images, currentLocationId) {
    const SECTION_ID = 'world-location-images';
    let section = document.getElementById(SECTION_ID);
    if (!section) {
        const mermaidEl = document.getElementById('world-mermaid');
        if (!mermaidEl) { return; }
        section = document.createElement('div');
        section.id = SECTION_ID;
        mermaidEl.parentNode.insertBefore(section, mermaidEl.nextSibling);
    }

    if (!currentLocationId || images.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'world-section-heading';
    heading.textContent = T('webview.world.sceneHistoryHeader');
    section.appendChild(heading);

    const strip = document.createElement('div');
    strip.className = 'world-image-strip';

    for (const img of images) {
        if (!img.src) { continue; }
        const wrap = document.createElement('div');
        wrap.className = 'world-image-thumb-wrap';

        const el = document.createElement('img');
        el.className = 'world-image-thumb';
        el.src = img.src;
        if (img.description) { el.title = img.description; }
        wrap.appendChild(el);

        if (img.worldTurn !== undefined) {
            const badge = document.createElement('span');
            badge.className = 'world-image-turn-badge';
            badge.textContent = 'T' + img.worldTurn;
            wrap.appendChild(badge);
        }

        strip.appendChild(wrap);
    }

    section.appendChild(strip);
}

// ---------------------------------------------------------------------------
// 現在地のNPCパネル
// ---------------------------------------------------------------------------

function renderNpcsAtLocation(npcs, currentLocationId) {
    const SECTION_ID = 'world-npcs-section';
    let section = document.getElementById(SECTION_ID);
    if (!section) {
        const imageSection = document.getElementById('world-location-images');
        const anchor = imageSection || document.getElementById('world-mermaid');
        if (!anchor) { return; }
        section = document.createElement('div');
        section.id = SECTION_ID;
        anchor.parentNode.insertBefore(section, anchor.nextSibling);
    }

    if (!currentLocationId || npcs.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.className = 'world-section-heading';
    heading.textContent = T('webview.world.npcsHereHeader');
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'world-npc-grid';

    for (const npc of npcs) {
        const card = document.createElement('div');
        card.className = 'world-npc-card';

        // Portrait or placeholder
        const portrait = document.createElement('div');
        portrait.className = 'world-npc-portrait';
        if (npc.portraitUri) {
            const img = document.createElement('img');
            img.src = npc.portraitUri;
            img.alt = npc.name;
            portrait.appendChild(img);
        } else {
            portrait.textContent = '👤';
            portrait.classList.add('placeholder');
        }
        card.appendChild(portrait);

        // Info column
        const info = document.createElement('div');
        info.className = 'world-npc-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'world-npc-name';
        nameEl.textContent = npc.name;
        info.appendChild(nameEl);

        const moodEl = document.createElement('div');
        moodEl.className = 'world-npc-mood';
        moodEl.textContent = npc.mood;
        info.appendChild(moodEl);

        if (npc.urgentNeedCount > 0) {
            const needEl = document.createElement('div');
            needEl.className = 'world-npc-needs';
            needEl.textContent = `⚠ ${npc.urgentNeedCount} urgent`;
            info.appendChild(needEl);
        }

        // "Set Portrait" — picks image via extension QuickPick
        const setBtn = document.createElement('button');
        setBtn.className = 'world-npc-portrait-btn';
        setBtn.textContent = npc.hasPortrait ? '🖼 Change' : '🖼 Set Portrait';
        setBtn.title = 'Choose a gallery image to use as this NPC\'s portrait';
        setBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'requestNpcPortraitLink', npcId: npc.id });
        });
        info.appendChild(setBtn);

        if (npc.hasVoice && npc.voice) {
            if (npc.voiceLabel) {
                const voiceLabelEl = document.createElement('div');
                voiceLabelEl.className = 'world-npc-voice-label';
                voiceLabelEl.textContent = npc.voiceLabel;
                info.appendChild(voiceLabelEl);
            }
            const previewBtn = document.createElement('button');
            previewBtn.className = 'world-npc-voice-btn';
            previewBtn.textContent = T('webview.world.npcVoicePreviewBtn') || '🔊 Preview';
            previewBtn.title = T('webview.world.npcVoicePreviewTitle') ||
                "Speak a short sample using this NPC's voice";
            previewBtn.addEventListener('click', () => previewNpcVoice(npc));
            info.appendChild(previewBtn);
        }

        card.appendChild(info);
        grid.appendChild(card);
    }

    section.appendChild(grid);
}

// ---------------------------------------------------------------------------
// グローバルイベント
// ---------------------------------------------------------------------------

function renderGlobalEvents(events, simEnabled) {
    // コンテナが無ければ生成
    let section = document.getElementById('world-events-section');
    if (!section) {
        const list = document.getElementById('world-factions-list');
        if (!list) { return; }
        section = document.createElement('div');
        section.id = 'world-events-section';
        section.style.cssText = 'margin-bottom:0.6rem;';
        list.parentNode.insertBefore(section, list);
    }

    if (!simEnabled || events.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = '';
    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;opacity:0.6;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;';
    heading.textContent = T('webview.world.activeEventsHeader');
    section.appendChild(heading);

    for (const ev of events) {
        const badge = document.createElement('div');
        const color = SEVERITY_COLOR[ev.severity] || SEVERITY_COLOR.minor;
        badge.style.cssText = `
            border-left: 3px solid ${color};
            padding: 0.3rem 0.5rem;
            margin-bottom: 0.3rem;
            background: rgba(0,0,0,0.2);
            border-radius: 2px;
            font-size: 0.82em;
        `;
        const remaining = ev.turnsRemaining !== undefined ? ` (${ev.turnsRemaining} turns)` : '';
        badge.innerHTML = `<span style="opacity:0.6;font-size:0.85em;">[${escapeHtml(ev.severity)}]</span> ${escapeHtml(ev.description)}<span style="opacity:0.5;">${escapeHtml(remaining)}</span>`;
        section.appendChild(badge);
    }
}

// ---------------------------------------------------------------------------
// Living World — Recent Events (recentChanges)
// ---------------------------------------------------------------------------

const CHANGE_CATEGORY_ICON = {
    faction: '⚔️',
    region: '🗺️',
    resource: '📦',
    npc: '👤',
    global: '🌐',
};

const CHANGE_SEVERITY_COLOR = {
    info: 'var(--vscode-charts-blue, #4080c0)',
    warning: 'var(--vscode-charts-yellow, #c0a040)',
    critical: '#c04040',
};

function renderRecentChanges(events, simEnabled) {
    let section = document.getElementById('world-recent-changes-section');
    if (!section) {
        const eventsSection = document.getElementById('world-events-section');
        if (!eventsSection) { return; }
        section = document.createElement('div');
        section.id = 'world-recent-changes-section';
        section.style.cssText = 'margin-bottom:0.6rem;';
        eventsSection.parentNode.insertBefore(section, eventsSection.nextSibling);
    }

    const visible = simEnabled && events.length > 0;
    section.style.display = visible ? '' : 'none';
    if (!visible) { return; }

    section.innerHTML = '';

    const heading = document.createElement('div');
    heading.style.cssText = 'font-size:0.78em;opacity:0.6;margin-bottom:0.3rem;text-transform:uppercase;letter-spacing:0.05em;';
    heading.textContent = T('webview.world.recentChangesHeader');
    section.appendChild(heading);

    // Show newest first, up to 5 entries
    const shown = events.slice(-5).reverse();
    for (const ev of shown) {
        const badge = document.createElement('div');
        const color = CHANGE_SEVERITY_COLOR[ev.severity] || CHANGE_SEVERITY_COLOR.info;
        const icon = CHANGE_CATEGORY_ICON[ev.category] || '📌';
        badge.style.cssText = `
            border-left: 3px solid ${color};
            padding: 0.3rem 0.5rem;
            margin-bottom: 0.25rem;
            background: rgba(0,0,0,0.2);
            border-radius: 2px;
            font-size: 0.8em;
            display: flex;
            align-items: flex-start;
            gap: 0.4rem;
        `;

        const iconSpan = document.createElement('span');
        iconSpan.style.cssText = 'flex-shrink:0;';
        iconSpan.textContent = icon;
        badge.appendChild(iconSpan);

        const textDiv = document.createElement('div');
        textDiv.style.cssText = 'flex:1;min-width:0;';
        const msgSpan = document.createElement('span');
        msgSpan.textContent = ev.message;
        textDiv.appendChild(msgSpan);

        if (ev.mapHighlight) {
            const flameSpan = document.createElement('span');
            flameSpan.style.cssText = 'margin-left:0.3rem;opacity:0.8;';
            flameSpan.textContent = '🔥';
            textDiv.appendChild(flameSpan);
        }

        const turnSpan = document.createElement('div');
        turnSpan.style.cssText = 'opacity:0.45;font-size:0.85em;margin-top:0.1rem;';
        turnSpan.textContent = `T${ev.worldTurn}`;
        textDiv.appendChild(turnSpan);

        badge.appendChild(textDiv);
        section.appendChild(badge);
    }
}

// ---------------------------------------------------------------------------
// 派閥カード
// ---------------------------------------------------------------------------

function formatMarketNumber(value, digits = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) { return '-'; }
    return n.toFixed(digits);
}

const PLAYER_ROLE_I18N = {
    merchant: 'webview.world.playerRoleMerchant',
    adventurer: 'webview.world.playerRoleAdventurer',
    retainer: 'webview.world.playerRoleRetainer',
    smith: 'webview.world.playerRoleSmith',
    ruler: 'webview.world.playerRoleRuler',
};

let _commerceTradeToastTimer = null;

function setCommerceTradeToast(text, kind) {
    const panel = document.getElementById('world-commerce-panel');
    if (!panel) { return; }
    let toast = document.getElementById('world-commerce-trade-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'world-commerce-trade-toast';
        toast.className = 'world-commerce-trade-toast';
        panel.appendChild(toast);
    }
    toast.textContent = text || '';
    toast.classList.toggle('is-error', kind === 'error');
    toast.classList.toggle('is-ok', kind === 'ok');
    toast.classList.toggle('hidden', !text);
    if (_commerceTradeToastTimer) { clearTimeout(_commerceTradeToastTimer); }
    if (text) {
        _commerceTradeToastTimer = setTimeout(() => {
            toast.classList.add('hidden');
            toast.textContent = '';
        }, 4000);
    }
}

function playerRoleLabel(role) {
    const key = PLAYER_ROLE_I18N[role];
    return key ? T(key) : role;
}

function renderPlayerCommerce(commerce, commerceEnabled, commerceUiEnabled, playerRoles, currentLocationId) {
    const section = document.getElementById('world-commerce-details');
    const panel = document.getElementById('world-commerce-panel');
    const hint = document.getElementById('world-commerce-hint');
    if (!section || !panel) { return; }

    const visible = commerceEnabled && commerce && typeof commerce.credits === 'number';
    section.classList.toggle('hidden', !visible);
    section.querySelector('.world-simulation-actions')?.remove();
    if (hint) {
        hint.textContent = commerceUiEnabled
            ? T('webview.world.commerceHintInteractive')
            : T('webview.world.commerceHint');
    }
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const cargo = Array.isArray(commerce.cargo) ? commerce.cargo : [];
    const cargoLines = cargo.length > 0
        ? cargo.map((c) => `${escapeHtml(c.commodityId || '?')} × ${escapeHtml(c.qty ?? 0)}`).join(', ')
        : escapeHtml(T('webview.world.commerceCargoEmpty'));

    const roles = Array.isArray(playerRoles) && playerRoles.length > 0
        ? playerRoles
        : ['merchant', 'adventurer', 'retainer', 'smith', 'ruler'];
    const currentRole = commerce.playerRole || 'merchant';
    const roleRow = commerceUiEnabled
        ? `<div class="world-commerce-row">
            <span>${escapeHtml(T('webview.world.commercePlayerRole'))}</span>
            <select id="world-commerce-role-select" class="world-commerce-role-select" aria-label="${escapeHtml(T('webview.world.commercePlayerRole'))}">
                ${roles.map((role) => `<option value="${escapeHtml(role)}"${role === currentRole ? ' selected' : ''}>${escapeHtml(playerRoleLabel(role))}</option>`).join('')}
            </select>
           </div>`
        : '';

    panel.innerHTML = `
        ${roleRow}
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceCredits'))}</span><strong>${escapeHtml(commerce.credits)}</strong></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceFood'))}</span><strong>${escapeHtml(commerce.food ?? 30)}</strong></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceTransport'))}</span><code class="patch-value">${escapeHtml(commerce.transportId || 'wagon')}</code></div>
        <div class="world-commerce-row"><span>${escapeHtml(T('webview.world.commerceCargo'))}</span><span>${cargoLines}</span></div>
        ${commerceUiEnabled ? '<button type="button" id="player-action-hub-open" class="world-market-trade-btn player-action-hub-open" aria-haspopup="dialog">暮らす</button><p class="img-gen-hint">取引・旅・一日を終える操作をまとめて行います。確定前に必ず確認し、AIは呼ばれません。</p>' : ''}
        <div id="world-commerce-trade-toast" class="world-commerce-trade-toast hidden"></div>
    `;

    if (commerceUiEnabled) {
        const hubOpen = document.getElementById('player-action-hub-open');
        if (hubOpen) {
            hubOpen.textContent = T('webview.world.actionHubOpen');
            const hubHint = hubOpen.nextElementSibling;
            if (hubHint) { hubHint.textContent = T('webview.world.simulationActionsDescription'); }
            const indicator = document.createElement('div');
            indicator.className = 'world-simulation-actions img-gen-hint';
            indicator.setAttribute('role', 'status');
            indicator.innerHTML = `<strong>${escapeHtml(T('webview.world.simulationActionsTitle'))}</strong>`;
            const heading = section.querySelector('summary');
            if (heading) { heading.after(indicator); }
            hubOpen.addEventListener('click', () => openPlayerActionHub(hubOpen));
            if (cargo.length === 0) {
                const emptyCargo = document.createElement('div');
                emptyCargo.className = 'world-commerce-empty-cargo';
                const guidance = document.createElement('p');
                guidance.className = 'img-gen-hint';
                guidance.textContent = T('webview.world.emptyCargoGuidance');
                const action = document.createElement('button');
                action.type = 'button';
                action.className = 'world-market-trade-btn';
                action.textContent = T('webview.world.emptyCargoAction');
                action.addEventListener('click', () => openPlayerActionHub(action));
                emptyCargo.append(guidance, action);
                hubOpen.after(emptyCargo);
            }
        }
        const roleSelect = document.getElementById('world-commerce-role-select');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => {
                vscode.postMessage({
                    type: 'livingWorldSetPlayerRole',
                    role: roleSelect.value,
                });
            });
        }
    }

    refreshPlayerActionHub();
    void currentLocationId;
}

function appendMarketTradeControls(row, market, quote, commerceUiEnabled, currentLocationId) {
    if (!commerceUiEnabled || !currentLocationId || market.locationId !== currentLocationId) {
        return;
    }

    const trade = document.createElement('div');
    trade.className = 'world-market-trade';
    trade.style.gridColumn = '1 / -1';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.max = '999';
    qtyInput.value = '1';
    qtyInput.setAttribute('aria-label', T('webview.world.tradeQty'));

    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'world-market-trade-btn';
    buyBtn.textContent = T('webview.world.tradeBuy');
    buyBtn.addEventListener('click', () => {
        const qty = parseInt(qtyInput.value, 10) || 1;
        vscode.postMessage({
            type: 'livingWorldDirectTrade',
            op: 'buy',
            marketLocationId: market.locationId,
            commodityId: quote.commodityId,
            qty,
        });
        buyBtn.disabled = true;
        sellBtn.disabled = true;
    });

    const sellBtn = document.createElement('button');
    sellBtn.type = 'button';
    sellBtn.className = 'world-market-trade-btn';
    sellBtn.textContent = T('webview.world.tradeSell');
    sellBtn.addEventListener('click', () => {
        const qty = parseInt(qtyInput.value, 10) || 1;
        vscode.postMessage({
            type: 'livingWorldDirectTrade',
            op: 'sell',
            marketLocationId: market.locationId,
            commodityId: quote.commodityId,
            qty,
        });
        buyBtn.disabled = true;
        sellBtn.disabled = true;
    });

    trade.appendChild(qtyInput);
    trade.appendChild(buyBtn);
    trade.appendChild(sellBtn);
    row.appendChild(trade);
}

/* --- Player Action Hub (PLAYABLE-V0-UI-001) ---
 * One coherent, player-facing surface that unifies the deterministic
 * direct-trade (P2), zero-turn travel (P4), and end-day (P3) flows into a
 * single modal with 取引 / 旅 / 一日を終える sections. The host message
 * contracts, request-id semantics, persistence truth, and shared workspace
 * mutation gate are unchanged — this layer is presentation and client-side
 * state only. No AI narration and no AI-dependent state mutation. */

let _playerActionHub = null;
let _playerActionHubInitiator = null;
let _playerActionHubSection = 'trade';
/* Only one deterministic mutation may be in-flight in the hub at any time. */
let _hubMutationInFlight = null; // null | 'trade' | 'travel' | 'endday'
let _hubMarket = null;           // canonical current-market snapshot for 取引

/* 取引 — direct trade (P2) */
let _shopkeeperInFlight = false;
let _shopkeeperPendingRequestId = null;
let _shopkeeperPreviewReady = false;

/* 旅 — zero-turn travel (P4) */
let _marketTravelPendingRequestId = null;
let _marketTravelPreviewDestinationId = null;
let _marketTravelPreviewReady = false;
let _marketTravelLoaded = false;

/* 一日を終える — end-day world progression (P3) */
let _endDayPendingRequestId = null;
let _endDayPreviewReady = false;
let _endDayLoaded = false;

function createHubRequestId(prefix) {
    const random = new Uint32Array(2);
    if (window.crypto?.getRandomValues) { window.crypto.getRandomValues(random); }
    return `${prefix}_${Date.now().toString(36)}_${random[0].toString(36)}${random[1].toString(36)}`;
}

function hubCurrentMarket(msg) {
    const markets = Array.isArray(msg?.livingWorldMarkets) ? msg.livingWorldMarkets : [];
    const market = markets.find((entry) => entry && entry.locationId === msg?.currentLocationId);
    return market && Array.isArray(market.quotes) && market.quotes.length > 0 ? market : null;
}

function hubLocationName(msg) {
    const id = msg && msg.currentLocationId;
    if (!id) { return '—'; }
    const markets = Array.isArray(msg.livingWorldMarkets) ? msg.livingWorldMarkets : [];
    const market = markets.find((m) => m && m.locationId === id);
    if (market && (market.locationName || market.name)) { return market.locationName || market.name; }
    const pin = _worldPinCatalog.get(id);
    if (pin && pin.locationName) { return pin.locationName; }
    return id;
}

function hubCargoSummary(commerce) {
    const cargo = Array.isArray(commerce?.cargo) ? commerce.cargo : [];
    if (cargo.length === 0) { return T('webview.world.commerceCargoEmpty'); }
    return cargo.map((c) => `${c.commodityId || '?'} × ${c.qty ?? 0}`).join(', ');
}

function hubHeldQty(commerce, commodityId) {
    const cargo = Array.isArray(commerce?.cargo) ? commerce.cargo : [];
    const entry = cargo.find((c) => c && c.commodityId === commodityId);
    return entry ? (entry.qty ?? 0) : 0;
}

/** Deterministic, presentation-only projection of a proposed trade.
 * The host remains authoritative: this helper never mutates state or posts a message. */
/** Distinguishes an honest "unknown" (null/undefined/non-numeric) from an
 * actual numeric zero. `Number(null) === 0` and `Number(undefined) === NaN`
 * both defeat a naive `Number(x) || 0` fallback: null silently becomes a
 * real-looking zero. Never use that pattern for capacity/weight fields that
 * the host may legitimately not know yet. */
function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildHubTradeProjection(commerce, quote, operation, rawQty) {
    const qty = Number(rawQty);
    const op = operation === 'sell' ? 'sell' : 'buy';
    const unitPrice = Number(quote?.unitPrice) || 0;
    const unitWeight = Math.max(0, Number(quote?.unitWeight) || 0);
    const stockBefore = Math.max(0, Number(quote?.stock) || 0);
    const moneyBefore = Number(commerce?.credits) || 0;
    const cargoBeforeKnown = numberOrNull(commerce?.cargoWeight);
    const cargoWeightUnknown = cargoBeforeKnown === null;
    const cargoBefore = cargoWeightUnknown ? null : Math.max(0, cargoBeforeKnown);
    const capacityKnown = numberOrNull(commerce?.cargoCapacity);
    const capacity = capacityKnown === null ? null : Math.max(0, capacityKnown);
    const heldBefore = quote ? hubHeldQty(commerce, quote.commodityId) : 0;
    const qtyValid = Number.isInteger(qty) && qty >= 1 && qty <= 999;
    const total = qtyValid ? Math.round(unitPrice * qty) : 0;
    const direction = op === 'buy' ? 1 : -1;
    const moneyAfter = moneyBefore - (direction * total);
    const cargoAfter = cargoWeightUnknown
        ? null
        : Math.max(0, cargoBefore + (direction * unitWeight * (qtyValid ? qty : 0)));
    const stockAfter = Math.max(0, stockBefore - (direction * (qtyValid ? qty : 0)));
    const heldAfter = Math.max(0, heldBefore + (direction * (qtyValid ? qty : 0)));
    let reasonKey = null;
    if (!quote) { reasonKey = 'webview.world.actionHubTradeReasonNoCommodity'; }
    else if (!qtyValid) { reasonKey = 'webview.world.actionHubTradeReasonQuantity'; }
    else if (op === 'buy' && stockBefore < qty) { reasonKey = 'webview.world.actionHubTradeReasonStock'; }
    else if (op === 'sell' && heldBefore < qty) { reasonKey = 'webview.world.actionHubTradeReasonHeld'; }
    else if (op === 'buy' && moneyBefore < total) { reasonKey = 'webview.world.actionHubTradeReasonCredits'; }
    // The projection would otherwise have to invent a "before" figure to show
    // an "after" figure. An unknown baseline blocks confirmation honestly
    // rather than silently defaulting cargo weight to zero.
    else if (cargoWeightUnknown) { reasonKey = 'webview.world.actionHubTradeReasonCargoUnknown'; }
    // Capacity only gates buying (adding cargo); selling never needs it.
    else if (op === 'buy' && capacity === null) { reasonKey = 'webview.world.actionHubTradeReasonCapacityUnknown'; }
    else if (op === 'buy' && capacity !== null && cargoAfter > capacity) { reasonKey = 'webview.world.actionHubTradeReasonCapacity'; }
    return {
        valid: !reasonKey,
        reasonKey,
        op,
        qty,
        unitPrice,
        total,
        moneyBefore,
        moneyAfter,
        cargoBefore,
        cargoAfter,
        capacity,
        stockBefore,
        stockAfter,
        heldBefore,
        heldAfter,
    };
}

function hubTradeProjectionValue(value) {
    return value === null || value === undefined ? T('webview.world.actionHubTradeUnknown') : formatMarketNumber(value);
}

function hubRenderTradeProjection() {
    if (!_playerActionHub || !_hubMarket) { return null; }
    const commoditySelect = _playerActionHub.querySelector('#shopkeeper-commodity');
    const qtyInput = _playerActionHub.querySelector('#shopkeeper-qty');
    const selectedOp = _playerActionHub.querySelector('input[name="shopkeeper-op"]:checked');
    if (!commoditySelect || !qtyInput || !selectedOp) { return null; }
    const quote = _hubMarket.quotes.find((candidate) => candidate.commodityId === commoditySelect.value);
    const commerce = (_worldViewMsg && _worldViewMsg.playerCommerce) || {};
    const projection = buildHubTradeProjection(commerce, quote, selectedOp.value, Number(qtyInput.value));
    const values = {
        unit: projection.unitPrice,
        total: projection.total,
        money: projection.moneyAfter,
        cargo: projection.cargoAfter,
        capacity: projection.capacity,
        stock: projection.stockAfter,
        held: projection.heldAfter,
    };
    Object.entries(values).forEach(([name, value]) => {
        const element = _playerActionHub.querySelector(`[data-trade-value="${name}"]`);
        if (element) { element.textContent = hubTradeProjectionValue(value); }
    });
    const reason = _playerActionHub.querySelector('#shopkeeper-disabled-reason');
    if (reason) {
        reason.hidden = projection.valid;
        reason.textContent = projection.reasonKey ? T(projection.reasonKey) : '';
    }
    _playerActionHub.querySelectorAll('.player-action-hub__radio').forEach((label) => {
        const input = label.querySelector('input[name="shopkeeper-op"]');
        label.classList.toggle('is-selected', !!input?.checked);
    });
    return projection;
}

function hubCommodityName(commodityId) {
    if (!commodityId) { return '?'; }
    const quotes = _hubMarket && Array.isArray(_hubMarket.quotes) ? _hubMarket.quotes : [];
    const quote = quotes.find((q) => q.commodityId === commodityId);
    return quote ? (quote.commodityName || quote.commodityId) : commodityId;
}

function hubRecomputeMarket() {
    _hubMarket = hubCurrentMarket(_worldViewMsg || {});
}

function renderHubHeader() {
    if (!_playerActionHub) { return; }
    const status = _playerActionHub.querySelector('#player-action-hub-status');
    if (!status) { return; }
    const msg = _worldViewMsg || {};
    const commerce = msg.playerCommerce || {};
    const rows = [
        [T('webview.world.actionHubCurrentLocation'), hubLocationName(msg)],
        [T('webview.world.commerceCredits'), commerce.credits ?? 0],
        [T('webview.world.commerceFood'), commerce.food ?? 0],
        [T('webview.world.commerceTransport'), commerce.transportName || commerce.transportId || 'wagon'],
        [T('webview.world.actionHubTradeCapacity'), `${hubTradeProjectionValue(commerce.cargoWeight ?? 0)} / ${hubTradeProjectionValue(commerce.cargoCapacity)}`],
        [T('webview.world.commerceCargo'), hubCargoSummary(commerce)],
    ];
    status.innerHTML = rows.map(([label, value]) =>
        `<div class="player-action-hub__stat"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join('');
}

/* Shared client-side state machine: only one mutation in-flight; no queuing,
 * no auto-retry. While a mutation is accepted by the host, the close control
 * and every other section's confirm are genuinely disabled. */
function hubSetMutationInFlight(kind) {
    _hubMutationInFlight = kind;
    if (_playerActionHub) { _playerActionHub.setAttribute('data-hub-inflight', kind); }
    hubSyncConfirmAvailability();
}

function hubClearMutationInFlight() {
    _hubMutationInFlight = null;
    if (_playerActionHub) { _playerActionHub.removeAttribute('data-hub-inflight'); }
    hubSyncConfirmAvailability();
}

function hubSyncConfirmAvailability() {
    if (!_playerActionHub) { return; }
    const busy = !!_hubMutationInFlight;
    const closeBtn = _playerActionHub.querySelector('#player-action-hub-close');
    if (closeBtn) { closeBtn.disabled = busy; }
    const tradeConfirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    const travelConfirm = _playerActionHub.querySelector('#market-travel-confirm');
    const endDayConfirm = _playerActionHub.querySelector('#end-day-confirm');
    if (busy) {
        if (tradeConfirm && _hubMutationInFlight !== 'trade') { tradeConfirm.disabled = true; }
        if (travelConfirm && _hubMutationInFlight !== 'travel') { travelConfirm.disabled = true; }
        if (endDayConfirm && _hubMutationInFlight !== 'endday') { endDayConfirm.disabled = true; }
    } else {
        if (tradeConfirm) { tradeConfirm.disabled = !_shopkeeperPreviewReady; }
        if (travelConfirm) { travelConfirm.disabled = !_marketTravelPreviewReady; }
        if (endDayConfirm) { endDayConfirm.disabled = !_endDayPreviewReady; }
    }
}

function activateHubSection(section, opts) {
    if (!_playerActionHub) { return; }
    _playerActionHubSection = section;
    _playerActionHub.querySelectorAll('.player-action-hub__tab').forEach((tab) => {
        const active = tab.getAttribute('data-section') === section;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.setAttribute('tabindex', active ? '0' : '-1');
    });
    _playerActionHub.querySelectorAll('.player-action-hub__section').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-section') !== section;
    });
    if (section === 'travel') { hubLoadTravel(); }
    if (section === 'endday') { hubLoadEndDay(); }
    if (opts && opts.focusTab) {
        const activeTab = _playerActionHub.querySelector(`.player-action-hub__tab[data-section="${section}"]`);
        if (activeTab) { activeTab.focus(); }
    }
}

function wireHubNavigation() {
    const tabs = Array.from(_playerActionHub.querySelectorAll('.player-action-hub__tab'));
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activateHubSection(tab.getAttribute('data-section'), { focusTab: true }));
    });
    const nav = _playerActionHub.querySelector('.player-action-hub__nav');
    nav.addEventListener('keydown', (event) => {
        const idx = tabs.indexOf(document.activeElement);
        if (idx === -1) { return; }
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { next = (idx + 1) % tabs.length; }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { next = (idx - 1 + tabs.length) % tabs.length; }
        else if (event.key === 'Home') { next = 0; }
        else if (event.key === 'End') { next = tabs.length - 1; }
        if (next >= 0) {
            event.preventDefault();
            activateHubSection(tabs[next].getAttribute('data-section'), { focusTab: true });
        }
    });
}

/* --- 取引 (direct trade) section --- */
function renderHubTradeSection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-trade" data-section="trade" aria-labelledby="player-action-hub-tab-trade">
        <h3 class="player-action-hub__section-title">取引</h3>
        <p class="player-action-hub__note">現在地の市場で直接売り買いします。AIは呼ばれません。</p>
        <div class="player-action-hub__trade-body" id="player-action-hub-trade-body"></div>
      </section>`;
}

function hubRenderTradeBody() {
    if (!_playerActionHub) { return; }
    const body = _playerActionHub.querySelector('#player-action-hub-trade-body');
    if (!body) { return; }
    if (!_hubMarket) {
        body.innerHTML = '<p class="player-action-hub__review" id="shopkeeper-review" role="status" aria-live="polite" data-state="empty">現在地に取引できる市場がありません。「旅」から市場のある場所へ移動してください。</p>';
        _shopkeeperPreviewReady = false;
        localizePlayerActionHub();
        return;
    }
    body.innerHTML = `
      <div class="player-action-hub__trade-composer">
      <label class="player-action-hub__field">${escapeHtml(T('webview.world.actionHubCommodity'))}
        <select id="shopkeeper-commodity" class="player-action-hub__select"></select>
      </label>
      <fieldset class="player-action-hub__field player-action-hub__ops">
        <legend>${escapeHtml(T('webview.world.actionHubTradeOperation'))}</legend>
        <label class="player-action-hub__radio is-selected"><input type="radio" name="shopkeeper-op" value="buy" checked> ${escapeHtml(T('webview.world.actionHubTradeBuy'))}</label>
        <label class="player-action-hub__radio"><input type="radio" name="shopkeeper-op" value="sell"> ${escapeHtml(T('webview.world.actionHubTradeSell'))}</label>
      </fieldset>
      <div class="player-action-hub__field player-action-hub__qty">
        <span class="player-action-hub__qty-label" id="shopkeeper-qty-label">${escapeHtml(T('webview.world.actionHubTradeQuantity'))}</span>
        <div class="player-action-hub__stepper" role="group" aria-labelledby="shopkeeper-qty-label">
          <button type="button" class="player-action-hub__step" id="shopkeeper-qty-dec" aria-label="${escapeHtml(T('webview.world.actionHubTradeDecrease'))}">−</button>
          <input id="shopkeeper-qty" class="player-action-hub__qty-input" type="number" min="1" max="999" step="1" value="1" inputmode="numeric" aria-labelledby="shopkeeper-qty-label">
          <button type="button" class="player-action-hub__step" id="shopkeeper-qty-inc" aria-label="${escapeHtml(T('webview.world.actionHubTradeIncrease'))}">＋</button>
        </div>
      </div>
      </div>
      <section class="player-action-hub__projection" aria-labelledby="shopkeeper-projection-title">
        <h4 id="shopkeeper-projection-title">${escapeHtml(T('webview.world.actionHubTradeProjection'))}</h4>
        <dl class="player-action-hub__projection-grid">
          <div><dt>${escapeHtml(T('webview.world.actionHubTradeUnitPrice'))}</dt><dd data-trade-value="unit">—</dd></div>
          <div class="is-emphasis"><dt>${escapeHtml(T('webview.world.actionHubTradeTotal'))}</dt><dd data-trade-value="total">—</dd></div>
          <div><dt>${escapeHtml(T('webview.world.actionHubTradeMoneyAfter'))}</dt><dd data-trade-value="money">—</dd></div>
          <div><dt>${escapeHtml(T('webview.world.actionHubTradeCargoAfter'))}</dt><dd><span data-trade-value="cargo">—</span> / <span data-trade-value="capacity">—</span></dd></div>
          <div><dt>${escapeHtml(T('webview.world.actionHubTradeStockAfter'))}</dt><dd data-trade-value="stock">—</dd></div>
          <div><dt>${escapeHtml(T('webview.world.actionHubTradeHeldAfter'))}</dt><dd data-trade-value="held">—</dd></div>
        </dl>
        <p class="player-action-hub__disabled-reason" id="shopkeeper-disabled-reason" role="status" aria-live="polite" hidden></p>
      </section>
      <p class="player-action-hub__review" id="shopkeeper-review" role="status" aria-live="polite">${escapeHtml(T('webview.world.actionHubTradeReviewHint'))}</p>
      <div class="player-action-hub__actions">
        <button type="button" id="shopkeeper-review-btn" class="player-action-hub__btn">${escapeHtml(T('webview.world.actionHubReview'))}</button>
        <button type="button" id="shopkeeper-confirm-btn" class="player-action-hub__btn player-action-hub__btn--primary" disabled>${escapeHtml(T('webview.world.actionHubConfirm'))}</button>
      </div>`;
    hubRefreshTradeOptions();
    wireHubTradeInputs();
    localizePlayerActionHub();
}

function hubRefreshTradeOptions() {
    if (!_playerActionHub || !_hubMarket) { return; }
    const select = _playerActionHub.querySelector('#shopkeeper-commodity');
    if (!select) { return; }
    const prev = select.value;
    select.innerHTML = _hubMarket.quotes.map((q) =>
        `<option value="${escapeHtml(q.commodityId)}">${escapeHtml(q.commodityName || q.commodityId)}（単価 ${escapeHtml(formatMarketNumber(q.unitPrice))} / 在庫 ${escapeHtml(formatMarketNumber(q.stock))}）</option>`
    ).join('');
    if (prev && _hubMarket.quotes.some((q) => q.commodityId === prev)) { select.value = prev; }
}

function hubDisableTradeInputs(disabled) {
    if (!_playerActionHub) { return; }
    ['#shopkeeper-commodity', '#shopkeeper-qty', '#shopkeeper-qty-inc', '#shopkeeper-qty-dec'].forEach((sel) => {
        const el = _playerActionHub.querySelector(sel);
        if (el) { el.disabled = disabled; }
    });
    _playerActionHub.querySelectorAll('input[name="shopkeeper-op"]').forEach((el) => { el.disabled = disabled; });
}

/* Any change to commodity, operation, or quantity invalidates the old preview. */
function hubInvalidateTradePreview() {
    _shopkeeperPreviewReady = false;
    if (!_playerActionHub) { return; }
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    if (confirm) { confirm.disabled = true; }
    if (_shopkeeperInFlight) { return; }
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    if (review) {
        review.setAttribute('data-state', 'idle');
        review.textContent = T('webview.world.actionHubTradeReviewHint');
    }
    hubRenderTradeProjection();
}

function wireHubTradeInputs() {
    const commoditySelect = _playerActionHub.querySelector('#shopkeeper-commodity');
    const qtyInput = _playerActionHub.querySelector('#shopkeeper-qty');
    const reviewBtn = _playerActionHub.querySelector('#shopkeeper-review-btn');
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    if (!commoditySelect || !qtyInput || !reviewBtn || !confirm || !review) { return; }

    commoditySelect.addEventListener('change', hubInvalidateTradePreview);
    _playerActionHub.querySelectorAll('input[name="shopkeeper-op"]').forEach((el) => {
        el.addEventListener('change', hubInvalidateTradePreview);
    });
    qtyInput.addEventListener('input', hubInvalidateTradePreview);
    const stepQty = (delta) => {
        const current = Number(qtyInput.value) || 0;
        const next = Math.min(999, Math.max(1, Math.trunc(current) + delta));
        qtyInput.value = String(next);
        hubInvalidateTradePreview();
    };
    _playerActionHub.querySelector('#shopkeeper-qty-dec').addEventListener('click', () => stepQty(-1));
    _playerActionHub.querySelector('#shopkeeper-qty-inc').addEventListener('click', () => stepQty(1));

    reviewBtn.addEventListener('click', () => {
        if (_shopkeeperInFlight || _hubMutationInFlight) { return; }
        const op = _playerActionHub.querySelector('input[name="shopkeeper-op"]:checked').value;
        const commodityId = commoditySelect.value;
        const qty = Number(qtyInput.value);
        const quote = _hubMarket.quotes.find((q) => q.commodityId === commodityId);
        const projection = hubRenderTradeProjection();
        if (!projection || !projection.valid) {
            review.setAttribute('data-state', 'error');
            review.textContent = projection?.reasonKey ? T(projection.reasonKey) : T('webview.world.actionHubTradeReasonQuantity');
            _shopkeeperPreviewReady = false;
            confirm.disabled = true;
            return;
        }
        const name = quote ? (quote.commodityName || quote.commodityId) : commodityId;
        review.setAttribute('data-state', 'preview');
        review.textContent = op === 'buy'
            ? `${T('webview.world.actionHubTradeBuy')} (${T('webview.world.actionHubTradeProjection')}): ${name} × ${qty} / ${T('webview.world.actionHubTradeTotal')} ${formatMarketNumber(projection.total)}`
            : `${T('webview.world.actionHubTradeSell')} (${T('webview.world.actionHubTradeProjection')}): ${name} × ${qty} / ${T('webview.world.actionHubTradeTotal')} ${formatMarketNumber(projection.total)}`;
        _shopkeeperPreviewReady = true;
        confirm.disabled = false;
        confirm.focus();
    });

    hubRenderTradeProjection();

    confirm.addEventListener('click', () => {
        if (_shopkeeperInFlight || _hubMutationInFlight || !_shopkeeperPreviewReady) { return; }
        const op = _playerActionHub.querySelector('input[name="shopkeeper-op"]:checked').value;
        const commodityId = commoditySelect.value;
        const qty = Number(qtyInput.value);
        if (!Number.isInteger(qty) || qty < 1 || qty > 999) { return; }
        _shopkeeperInFlight = true;
        _shopkeeperPendingRequestId = createHubRequestId('shop');
        hubSetMutationInFlight('trade');
        confirm.disabled = true;
        reviewBtn.disabled = true;
        hubDisableTradeInputs(true);
        review.setAttribute('data-state', 'submitting');
        review.textContent = '処理中…';
        vscode.postMessage({
            type: 'shopkeeperDirectTrade',
            requestId: _shopkeeperPendingRequestId,
            op,
            marketLocationId: _hubMarket.locationId,
            commodityId,
            qty,
        });
    });
}

function wireHubTradeSection() {
    hubRenderTradeBody();
}

function finishShopkeeperTrade(msg) {
    if (!_playerActionHub) { return; }
    if (!msg || !msg.requestId || msg.requestId !== _shopkeeperPendingRequestId) { return; }
    _shopkeeperPendingRequestId = null;
    _shopkeeperInFlight = false;
    hubClearMutationInFlight();
    const review = _playerActionHub.querySelector('#shopkeeper-review');
    const reviewBtn = _playerActionHub.querySelector('#shopkeeper-review-btn');
    const confirm = _playerActionHub.querySelector('#shopkeeper-confirm-btn');
    hubDisableTradeInputs(false);
    if (reviewBtn) { reviewBtn.disabled = false; }
    if (!review) { return; }
    if (msg.ok) {
        const r = msg.receipt || {};
        const name = hubCommodityName(r.commodityId);
        review.setAttribute('data-state', 'success');
        review.textContent = `${r.op === 'sell' ? '売却しました' : '購入しました'}: ${name} × ${r.qty || 0}（${formatMarketNumber(r.total || 0)}）`;
        if (msg.refreshFailed || r.refreshFailed) {
            review.setAttribute('data-state', 'success-stale');
            review.textContent += ' 保存は完了しましたが、表示の更新を確認できませんでした。画面を再読込してください。';
        }
        _shopkeeperPreviewReady = false;
        if (confirm) { confirm.disabled = true; }
        hubRecomputeMarket();
        renderHubHeader();
        hubRefreshTradeOptions();
        return;
    }
    const reject = msg.rejection || {};
    if (reject.code === 'WORLD_MUTATION_IN_PROGRESS') {
        review.setAttribute('data-state', 'busy');
        review.textContent = `${reject.message || '別の操作を確定中です。'} ${reject.nextStep || '完了後に、もう一度確認してください。'}`;
        if (confirm) { confirm.disabled = !_shopkeeperPreviewReady; }
        if (confirm && !confirm.disabled) { confirm.focus(); } else if (reviewBtn) { reviewBtn.focus(); }
        return;
    }
    review.setAttribute('data-state', 'error');
    review.textContent = `${reject.message || '取引を実行できませんでした。'} ${reject.nextStep || ''}`.trim();
    if (confirm) { confirm.disabled = !_shopkeeperPreviewReady; }
}

/* --- 旅 (zero-turn travel) section --- */
function renderHubTravelSection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-travel" data-section="travel" aria-labelledby="player-action-hub-tab-travel" hidden>
        <h3 class="player-action-hub__section-title">旅に出る</h3>
        <p class="player-action-hub__note">別の市場へ移動します。移動では日付や世界ターンは進みません。AIは呼ばれません。</p>
        <label class="player-action-hub__field">移動先
          <select id="market-travel-destination" class="player-action-hub__select"><option value="">読込中...</option></select>
        </label>
        <p class="player-action-hub__review" id="market-travel-review" role="status" aria-live="polite">市場の一覧を読込中です。</p>
        <div class="player-action-hub__actions">
          <button type="button" id="market-travel-preview" class="player-action-hub__btn" disabled>確認</button>
          <button type="button" id="market-travel-confirm" class="player-action-hub__btn player-action-hub__btn--primary" disabled>移動を確定</button>
        </div>
        <details class="player-action-hub__dev">
          <summary>開発者向け詳細</summary>
          <p class="player-action-hub__dev-body" id="market-travel-dev">—</p>
        </details>
      </section>`;
}

function hubLoadTravel() {
    if (_marketTravelLoaded) { return; }
    _marketTravelLoaded = true;
    vscode.postMessage({ type: 'marketTravelPreview' });
}

function wireHubTravelSection() {
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (!select || !previewBtn || !confirm) { return; }
    select.addEventListener('change', () => {
        _marketTravelPreviewReady = false;
        _marketTravelPreviewDestinationId = null;
        confirm.disabled = true;
        previewBtn.disabled = !select.value || !!_hubMutationInFlight;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'idle');
        review.textContent = select.value ? '確認を押すと、移動内容を表示します。' : '移動先を選んでください。';
    });
    previewBtn.addEventListener('click', () => {
        if (!select.value || _hubMutationInFlight) { return; }
        _marketTravelPreviewReady = false;
        _marketTravelPreviewDestinationId = select.value;
        confirm.disabled = true;
        previewBtn.disabled = true;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'loading');
        review.textContent = '確認中...';
        vscode.postMessage({ type: 'marketTravelPreview', destinationId: select.value });
    });
    confirm.addEventListener('click', () => {
        if (!_marketTravelPreviewReady || _marketTravelPendingRequestId || _hubMutationInFlight) { return; }
        if (!select.value || select.value !== _marketTravelPreviewDestinationId) { return; }
        _marketTravelPendingRequestId = createHubRequestId('travel');
        hubSetMutationInFlight('travel');
        confirm.disabled = true;
        previewBtn.disabled = true;
        select.disabled = true;
        const review = _playerActionHub.querySelector('#market-travel-review');
        review.setAttribute('data-state', 'submitting');
        review.textContent = '移動を保存中...';
        vscode.postMessage({ type: 'marketTravelCommit', requestId: _marketTravelPendingRequestId, destinationId: select.value, confirmed: true });
    });
}

function finishMarketTravelPreview(msg) {
    if (!_playerActionHub) { return; }
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const review = _playerActionHub.querySelector('#market-travel-review');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (!select || !review || !previewBtn || !confirm) { return; }
    const requestedDestination = _marketTravelPreviewDestinationId;
    if (requestedDestination && msg.destinationId !== requestedDestination) { return; }
    if (!msg.ok) {
        review.setAttribute('data-state', 'error');
        review.textContent = `${msg.message || '移動内容を確認できませんでした。'} ${msg.nextStep || ''}`.trim();
        previewBtn.disabled = !select.value || !!_hubMutationInFlight;
        confirm.disabled = true;
        return;
    }
    if (!requestedDestination) {
        const options = Array.isArray(msg.destinations) ? msg.destinations : [];
        select.innerHTML = options.length
            ? `<option value="">移動先を選択</option>${options.map((dest) => `<option value="${escapeHtml(dest.id)}">${escapeHtml(dest.name || dest.id)}</option>`).join('')}`
            : '<option value="">移動先なし</option>';
        previewBtn.disabled = true;
        confirm.disabled = true;
        review.setAttribute('data-state', 'idle');
        review.textContent = options.length ? '移動先を選んで確認してください。' : '移動できる別の市場がありません。';
        if (!options.length) {
            const emptyOption = select.querySelector('option');
            if (emptyOption) { emptyOption.textContent = T('webview.world.actionHubNoDestinations'); }
            review.textContent = T('webview.world.actionHubNoDestinations');
        }
        select.disabled = options.length === 0;
        if (options.length > 0 && _playerActionHubSection === 'travel') { select.focus(); }
        return;
    }
    _marketTravelPreviewReady = true;
    const dest = msg.destination || {};
    const origin = msg.current || {};
    review.setAttribute('data-state', 'preview');
    review.textContent = `確認（確定前）: ${origin.name || origin.id || hubLocationName(_worldViewMsg)} → ${dest.name || dest.id || requestedDestination} / 市場あり / 移動では日付や世界ターンは進みません`;
    const dev = _playerActionHub.querySelector('#market-travel-dev');
    if (dev) {
        const systems = Array.isArray(msg.systemsNotAdvanced) ? msg.systemsNotAdvanced.join('、') : 'world turn';
        dev.textContent = `elapsedWorldTurns=${msg.elapsedWorldTurns} / reachabilityBasis=${msg.reachabilityBasis || 'known_market_location'} / systemsNotAdvanced=${systems}`;
    }
    previewBtn.disabled = !!_hubMutationInFlight;
    confirm.disabled = !!_hubMutationInFlight;
    if (!confirm.disabled) { confirm.focus(); }
}

function finishMarketTravel(msg) {
    if (!_playerActionHub || !msg || !msg.requestId || msg.requestId !== _marketTravelPendingRequestId) { return; }
    _marketTravelPendingRequestId = null;
    hubClearMutationInFlight();
    const select = _playerActionHub.querySelector('#market-travel-destination');
    const review = _playerActionHub.querySelector('#market-travel-review');
    const previewBtn = _playerActionHub.querySelector('#market-travel-preview');
    const confirm = _playerActionHub.querySelector('#market-travel-confirm');
    if (select) { select.disabled = false; }
    if (!review) { return; }
    if (!msg.ok) {
        const failure = msg.failure || {};
        if (failure.code === 'WORLD_MUTATION_IN_PROGRESS' || failure.code === 'BUSY') {
            review.setAttribute('data-state', 'busy');
        } else {
            review.setAttribute('data-state', 'error');
        }
        review.textContent = `${failure.message || '移動を保存できませんでした。'} ${failure.nextStep || ''}`.trim();
        if (previewBtn) { previewBtn.disabled = !select || !select.value; }
        if (confirm) {
            confirm.disabled = !_marketTravelPreviewReady;
            if (!confirm.disabled) { confirm.focus(); }
        }
        return;
    }
    const r = msg.receipt || {};
    review.setAttribute('data-state', 'success');
    review.textContent = `移動しました。${r.origin?.name || r.origin?.id || '?'} → ${r.destination?.name || r.destination?.id || '?'} / 日付・世界ターンは進みませんでした。`;
    if (msg.refreshFailed || r.refreshFailed) {
        review.setAttribute('data-state', 'success-stale');
        review.textContent += ' 保存は完了しましたが、表示の更新を確認できませんでした。画面を再読込してください。';
    }
    if (confirm) { confirm.disabled = true; }
    _marketTravelPreviewReady = false;
    hubRecomputeMarket();
    renderHubHeader();
    hubRenderTradeBody();
    if (_hubMarket) { activateHubSection('trade', { focusTab: false }); }
}

/* --- 一日を終える (end-day world progression) section --- */
function renderHubEndDaySection() {
    return `
      <section class="player-action-hub__section" role="tabpanel" id="player-action-hub-panel-endday" data-section="endday" aria-labelledby="player-action-hub-tab-endday" hidden>
        <h3 class="player-action-hub__section-title">一日を終える</h3>
        <p class="player-action-hub__note player-action-hub__note--strong">世界が1ターン進みます。市場と世界の住人が変化することがあります。AIは呼ばれません。</p>
        <p class="player-action-hub__review" id="end-day-review" role="status" aria-live="polite">確認中…</p>
        <div class="player-action-hub__actions">
          <button type="button" id="end-day-confirm" class="player-action-hub__btn player-action-hub__btn--danger" disabled>一日を終える</button>
        </div>
      </section>`;
}

function hubLoadEndDay() {
    if (_endDayLoaded) { return; }
    _endDayLoaded = true;
    vscode.postMessage({ type: 'endDayPreview' });
}

function wireHubEndDaySection() {
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!confirm) { return; }
    confirm.addEventListener('click', () => {
        if (!_endDayPreviewReady || _endDayPendingRequestId || _hubMutationInFlight) { return; }
        _endDayPendingRequestId = createHubRequestId('endday');
        hubSetMutationInFlight('endday');
        confirm.disabled = true;
        const review = _playerActionHub.querySelector('#end-day-review');
        review.setAttribute('data-state', 'submitting');
        review.textContent = '一日を進めています…';
        vscode.postMessage({ type: 'endDayCommit', requestId: _endDayPendingRequestId, confirmed: true });
    });
}

function finishEndDayPreview(msg) {
    if (!_playerActionHub) { return; }
    const review = _playerActionHub.querySelector('#end-day-review');
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!review || !confirm) { return; }
    if (!msg.ok) {
        review.setAttribute('data-state', 'error');
        review.textContent = `${msg.message || '一日を確認できませんでした。'} ${msg.nextStep || ''}`.trim();
        confirm.disabled = true;
        return;
    }
    _endDayPreviewReady = true;
    const systems = Array.isArray(msg.systems) ? msg.systems.join('、') : '世界の変化';
    const consumption = Array.isArray(msg.fixedResourceConsumption) && msg.fixedResourceConsumption.length > 0
        ? msg.fixedResourceConsumption.map((x) => `${x.resource} ${x.amount}`).join('、')
        : '固定消費なし';
    review.setAttribute('data-state', 'preview');
    review.textContent = `確認（確定前）: ${msg.currentWorldTurn} → ${msg.targetWorldTurn}ターン / 進む変化: ${systems} / ${consumption}`;
    confirm.disabled = !!_hubMutationInFlight;
    if (!confirm.disabled) { confirm.focus(); }
}

function finishEndDay(msg) {
    if (!_playerActionHub || !msg || !msg.requestId || msg.requestId !== _endDayPendingRequestId) { return; }
    _endDayPendingRequestId = null;
    hubClearMutationInFlight();
    const review = _playerActionHub.querySelector('#end-day-review');
    const confirm = _playerActionHub.querySelector('#end-day-confirm');
    if (!review || !confirm) { return; }
    if (!msg.ok) {
        const failure = msg.failure || {};
        if (failure.code === 'WORLD_MUTATION_IN_PROGRESS') {
            review.setAttribute('data-state', 'busy');
            review.textContent = `${failure.message || '別の操作を確定中です。'} ${failure.nextStep || '完了後に、もう一度操作してください。'}`;
            confirm.disabled = !_endDayPreviewReady;
            if (!confirm.disabled) { confirm.focus(); }
            return;
        }
        review.setAttribute('data-state', 'error');
        review.textContent = `${failure.message || '日を終えたことを確認できませんでした。'} ${failure.nextStep || ''}`.trim();
        confirm.disabled = !_endDayPreviewReady;
        return;
    }
    const r = msg.receipt || {};
    const eventKinds = Array.isArray(r.eventCategories) && r.eventCategories.length > 0 ? r.eventCategories.join('、') : 'なし';
    const markets = Array.isArray(r.marketChanges) && r.marketChanges.length > 0
        ? r.marketChanges.map((change) => `${change.commodityId}: 在庫 ${change.stockDelta >= 0 ? '+' : ''}${change.stockDelta}`).join('、')
        : '目立つ変化なし';
    review.setAttribute('data-state', 'success');
    review.textContent = r.quiet
        ? `一日が終わりました。ターン ${r.worldTurn?.before} → ${r.worldTurn?.after} / 大きな出来事はありませんでした。`
        : `一日が終わりました。ターン ${r.worldTurn?.before} → ${r.worldTurn?.after} / 出来事 ${r.eventCount}件（${eventKinds}）/ 市場 ${markets}`;
    if (msg.refreshFailed) {
        review.setAttribute('data-state', 'success-stale');
        review.textContent += ' 表示の更新を確認できなかったため、画面を再読込してください。';
    }
    _endDayPreviewReady = false;
    confirm.disabled = true;
    hubRecomputeMarket();
    renderHubHeader();
    hubRefreshTradeOptions();
}

function setHubLeadingLabel(control, text) {
    const label = control && control.closest('label');
    if (label && label.firstChild) { label.firstChild.textContent = text; }
}

/** Keep the deterministic action surface in the normal Webview locale system.
 * The host contracts and mutation flow are intentionally not part of this UI-only helper. */
function localizePlayerActionHub() {
    if (!_playerActionHub) { return; }
    _playerActionHub.setAttribute('aria-label', T('webview.world.actionHubTitle'));
    const textBySelector = {
        '#player-action-hub-title': 'webview.world.actionHubTitle',
        '#player-action-hub-close': 'webview.world.actionHubClose',
        '#player-action-hub-tab-trade': 'webview.world.actionHubTrade',
        '#player-action-hub-tab-travel': 'webview.world.actionHubTravel',
        '#player-action-hub-tab-endday': 'webview.world.actionHubEndDay',
        '#shopkeeper-review-btn': 'webview.world.actionHubReview',
        '#shopkeeper-confirm-btn': 'webview.world.actionHubConfirm',
        '#market-travel-preview': 'webview.world.actionHubReview',
        '#market-travel-confirm': 'webview.world.actionHubTravelConfirm',
        '#end-day-confirm': 'webview.world.actionHubEndDay',
    };
    Object.entries(textBySelector).forEach(([selector, key]) => {
        const element = _playerActionHub.querySelector(selector);
        if (element) { element.textContent = T(key); }
    });
    const close = _playerActionHub.querySelector('#player-action-hub-close');
    if (close) { close.setAttribute('aria-label', T('webview.world.actionHubClose')); }
    const status = _playerActionHub.querySelector('#player-action-hub-status');
    if (status) { status.setAttribute('aria-label', T('webview.world.actionHubStatus')); }
    const nav = _playerActionHub.querySelector('.player-action-hub__nav');
    if (nav) { nav.setAttribute('aria-label', T('webview.world.actionHubChooseAction')); }
    const sectionText = [
        ['#player-action-hub-panel-trade .player-action-hub__section-title', 'webview.world.actionHubTrade'],
        ['#player-action-hub-panel-trade .player-action-hub__note', 'webview.world.actionHubTradeDescription'],
        ['#player-action-hub-panel-travel .player-action-hub__section-title', 'webview.world.actionHubTravel'],
        ['#player-action-hub-panel-travel .player-action-hub__note', 'webview.world.actionHubTravelDescription'],
        ['#player-action-hub-panel-endday .player-action-hub__section-title', 'webview.world.actionHubEndDay'],
        ['#player-action-hub-panel-endday .player-action-hub__note', 'webview.world.actionHubEndDayDescription'],
    ];
    sectionText.forEach(([selector, key]) => {
        const element = _playerActionHub.querySelector(selector);
        if (element) { element.textContent = T(key); }
    });
    setHubLeadingLabel(_playerActionHub.querySelector('#shopkeeper-commodity'), T('webview.world.actionHubCommodity'));
    setHubLeadingLabel(_playerActionHub.querySelector('#market-travel-destination'), T('webview.world.actionHubDestination'));
    const tradeEmpty = _playerActionHub.querySelector('#shopkeeper-review[data-state="empty"]');
    if (tradeEmpty) { tradeEmpty.textContent = T('webview.world.actionHubNoCurrentMarket'); }
    const travelReview = _playerActionHub.querySelector('#market-travel-review');
    if (travelReview && travelReview.getAttribute('data-state') === 'idle') {
        travelReview.textContent = T('webview.world.actionHubTravelLoading');
    }
}

/* --- Hub shell open/close/refresh --- */
function openPlayerActionHub(initiator) {
    closePlayerActionHub();
    _playerActionHubInitiator = initiator;
    const msg = _worldViewMsg || {};
    hubRecomputeMarket();
    _shopkeeperPreviewReady = false;
    _marketTravelPreviewReady = false;
    _marketTravelLoaded = false;
    _endDayPreviewReady = false;
    _endDayLoaded = false;
    _hubMutationInFlight = null;

    const hasMarket = !!_hubMarket;
    _playerActionHubSection = hasMarket ? 'trade' : 'travel';

    const overlay = document.createElement('div');
    overlay.id = 'player-action-hub';
    overlay.className = 'player-action-hub';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '暮らす');
    overlay.innerHTML = `
      <div class="player-action-hub__scrim" data-hub-scrim="true"></div>
      <section class="player-action-hub__panel" role="document">
        <header class="player-action-hub__header">
          <div class="player-action-hub__titlebar">
            <h2 class="player-action-hub__title" id="player-action-hub-title">暮らす</h2>
            <button type="button" id="player-action-hub-close" class="player-action-hub__close" aria-label="暮らすを閉じる">閉じる</button>
          </div>
          <dl class="player-action-hub__status" id="player-action-hub-status" aria-label="現在の状態"></dl>
        </header>
        <nav class="player-action-hub__nav" role="tablist" aria-label="行動を選ぶ">
          <button type="button" class="player-action-hub__tab" role="tab" id="player-action-hub-tab-trade" data-section="trade" aria-controls="player-action-hub-panel-trade" aria-selected="false" tabindex="-1">取引</button>
          <button type="button" class="player-action-hub__tab" role="tab" id="player-action-hub-tab-travel" data-section="travel" aria-controls="player-action-hub-panel-travel" aria-selected="false" tabindex="-1">旅</button>
          <button type="button" class="player-action-hub__tab player-action-hub__tab--endday" role="tab" id="player-action-hub-tab-endday" data-section="endday" aria-controls="player-action-hub-panel-endday" aria-selected="false" tabindex="-1">一日を終える</button>
        </nav>
        <div class="player-action-hub__workspace">
          ${renderHubTradeSection()}
          ${renderHubTravelSection()}
          ${renderHubEndDaySection()}
        </div>
      </section>`;
    document.body.appendChild(overlay);
    _playerActionHub = overlay;

    renderHubHeader();
    wireHubNavigation();
    wireHubTradeSection();
    wireHubTravelSection();
    wireHubEndDaySection();
    localizePlayerActionHub();

    const closeBtn = overlay.querySelector('#player-action-hub-close');
    closeBtn.addEventListener('click', () => {
        if (_hubMutationInFlight) { return; }
        closePlayerActionHub();
    });
    overlay.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (_hubMutationInFlight) { return; }
            event.preventDefault();
            closePlayerActionHub();
        }
    });

    if (!hasMarket) {
        const emptyReview = overlay.querySelector('#shopkeeper-review');
        if (emptyReview) { emptyReview.textContent = '現在地に取引できる市場がありません。「旅」から市場のある場所へ移動してください。'; }
    }
    activateHubSection(_playerActionHubSection, { focusTab: true });
}

function closePlayerActionHub() {
    const overlay = _playerActionHub;
    if (overlay) { overlay.remove(); }
    _playerActionHub = null;
    _hubMutationInFlight = null;
    _shopkeeperInFlight = false;
    _shopkeeperPendingRequestId = null;
    _shopkeeperPreviewReady = false;
    _marketTravelPendingRequestId = null;
    _marketTravelPreviewReady = false;
    _marketTravelPreviewDestinationId = null;
    _marketTravelLoaded = false;
    _endDayPendingRequestId = null;
    _endDayPreviewReady = false;
    _endDayLoaded = false;
    if (_playerActionHubInitiator && typeof _playerActionHubInitiator.focus === 'function') {
        _playerActionHubInitiator.focus();
    }
}

/* Called on every worldView refresh so an open hub shows canonical resources
 * and market values. Never clobbers an in-flight trade submit. */
function refreshPlayerActionHub() {
    if (!_playerActionHub) { return; }
    hubRecomputeMarket();
    renderHubHeader();
    if (!_shopkeeperInFlight && _hubMutationInFlight !== 'trade') {
        hubRefreshTradeOptions();
        hubInvalidateTradePreview();
    }
}

function buildDecisionSurfaceLookup(decisionSurface) {
    const lookup = new Map();
    const markets = Array.isArray(decisionSurface?.markets) ? decisionSurface.markets : [];
    markets.forEach((market) => {
        if (!market?.locationId || !Array.isArray(market.quotes)) { return; }
        const quoteMap = new Map();
        market.quotes.forEach((quote) => {
            if (quote?.commodityId) {
                quoteMap.set(quote.commodityId, quote);
            }
        });
        if (quoteMap.size > 0) {
            lookup.set(market.locationId, quoteMap);
        }
    });
    return lookup;
}

function getDecisionQuote(decisionLookup, market, quote) {
    return decisionLookup.get(market?.locationId)?.get(quote?.commodityId);
}

function formatDecisionPressure(pct) {
    const n = Number(pct);
    if (!Number.isFinite(n)) { return '0%'; }
    return `${n > 0 ? '+' : ''}${formatMarketNumber(n)}%`;
}

function decisionEvidenceLabel(kind) {
    switch (kind) {
        case 'recent_event':
            return T('webview.world.decisionEvidence.recentEvent');
        case 'reputation_hostile':
            return T('webview.world.decisionEvidence.reputationHostile');
        case 'reputation_unfriendly':
            return T('webview.world.decisionEvidence.reputationUnfriendly');
        case 'reputation_friendly':
            return T('webview.world.decisionEvidence.reputationFriendly');
        case 'reputation_allied':
            return T('webview.world.decisionEvidence.reputationAllied');
        case 'low_stock':
            return T('webview.world.decisionEvidence.lowStock');
        default:
            return T('webview.world.decisionEvidence.pricePressure');
    }
}

function buildRunSpikeText(market) {
    const meta = findWorldPinMeta(market?.locationId);
    if (meta) {
        return buildWorldPinActionText('move', meta);
    }
    return T('webview.world.pinAction.move', { name: market?.locationName || market?.locationId || 'there' });
}

function appendDecisionSurface(row, market, decisionQuote) {
    if (!decisionQuote) { return; }
    row.classList.add('has-decision-surface');

    const detail = document.createElement('div');
    detail.className = 'world-market-decision';

    const pressure = document.createElement('span');
    pressure.className = 'world-market-pressure';
    pressure.textContent = T('webview.world.decisionPressureValue', {
        pressure: formatDecisionPressure(decisionQuote.pressurePct),
    });
    detail.appendChild(pressure);

    const evidence = Array.isArray(decisionQuote.evidence) ? decisionQuote.evidence : [];
    const labels = evidence.length > 0
        ? evidence.map(decisionEvidenceLabel)
        : [T('webview.world.decisionEvidence.pricePressure')];
    labels.forEach((label) => {
        const badge = document.createElement('span');
        badge.className = 'world-market-evidence';
        badge.textContent = label;
        detail.appendChild(badge);
    });

    const route = document.createElement('span');
    route.className = 'world-market-route';
    route.textContent = T('webview.world.decisionTravelPreview', {
        days: formatMarketNumber(decisionQuote.travelPreview?.days),
        foodCost: formatMarketNumber(decisionQuote.travelPreview?.foodCost),
        transport: decisionQuote.travelPreview?.transportName || '?',
    });
    detail.appendChild(route);

    const local = document.createElement('span');
    local.className = 'world-market-local';
    local.textContent = T('webview.world.decisionSellLocalNow', {
        price: formatMarketNumber(decisionQuote.localUnitPrice),
    });
    detail.appendChild(local);

    const runBtn = document.createElement('button');
    runBtn.type = 'button';
    runBtn.className = 'world-market-trade-btn';
    runBtn.textContent = T('webview.world.decisionRunSpike');
    runBtn.addEventListener('click', () => {
        postWorldInsertChatText(buildRunSpikeText(market));
    });
    detail.appendChild(runBtn);

    row.appendChild(detail);
}

function renderLivingWorldMarkets(markets, decisionSurface, commerceEnabled, commerceUiEnabled, currentLocationId) {
    const section = document.getElementById('world-markets-details');
    const list = document.getElementById('world-markets-list');
    const hint = document.getElementById('world-markets-hint');
    if (!section || !list) { return; }

    const visible = commerceEnabled && Array.isArray(markets) && markets.length > 0;
    section.classList.toggle('hidden', !visible);
    if (hint) {
        hint.textContent = commerceUiEnabled
            ? T('webview.world.marketsHintInteractive')
            : T('webview.world.marketsHint');
    }
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    const decisionLookup = buildDecisionSurfaceLookup(decisionSurface);
    const displayMarkets = commerceUiEnabled && currentLocationId
        ? markets.filter((m) => m.locationId === currentLocationId || decisionLookup.has(m.locationId))
        : markets;

    if (displayMarkets.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.style.margin = '0';
        empty.textContent = commerceUiEnabled
            ? T('webview.world.marketsNotHere')
            : T('webview.world.marketsEmpty');
        list.appendChild(empty);
        return;
    }

    displayMarkets.slice(0, 12).forEach((market) => {
        const card = document.createElement('div');
        card.className = 'world-market-card';

        const title = document.createElement('div');
        title.className = 'world-market-title';
        title.textContent = market.locationName || market.locationId || 'Market';
        if (commerceUiEnabled && currentLocationId === market.locationId) {
            const here = document.createElement('span');
            here.style.fontWeight = 'normal';
            here.style.opacity = '0.7';
            here.style.marginLeft = '0.35rem';
            here.textContent = `(${T('webview.world.marketsHere')})`;
            title.appendChild(here);
        }
        card.appendChild(title);

        const allQuotes = Array.isArray(market.quotes) ? market.quotes : [];
        const quotes = commerceUiEnabled && currentLocationId && market.locationId !== currentLocationId
            ? allQuotes.filter((quote) => getDecisionQuote(decisionLookup, market, quote)).slice(0, 8)
            : allQuotes.slice(0, 8);
        if (quotes.length === 0) { return; }

        quotes.forEach((quote) => {
            const row = document.createElement('div');
            row.className = 'world-market-row';
            row.innerHTML = `
                <span>${escapeHtml(quote.commodityName || quote.commodityId || '?')}</span>
                <span class="world-market-num">${escapeHtml(formatMarketNumber(quote.unitPrice))}</span>
                <span class="world-market-num">${escapeHtml(formatMarketNumber(quote.stock))}</span>
                <span class="world-market-num">x${escapeHtml(formatMarketNumber(quote.priceIndex, 2))}</span>
            `;
            if (commerceUiEnabled) {
                appendMarketTradeControls(row, market, quote, commerceUiEnabled, currentLocationId);
                if (market.locationId !== currentLocationId) {
                    appendDecisionSurface(row, market, getDecisionQuote(decisionLookup, market, quote));
                }
            }
            card.appendChild(row);
        });

        list.appendChild(card);
    });
}

function renderNpcWhereabouts(payload) {
    const section = document.getElementById('world-npc-whereabouts-details');
    const list = document.getElementById('world-npc-whereabouts-list');
    const clamped = document.getElementById('world-npc-whereabouts-clamped');
    if (!section || !list) { return; }

    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    const visible = entries.length > 0;
    section.classList.toggle('hidden', !visible);
    if (clamped) {
        clamped.classList.toggle('hidden', !(visible && payload?.clamped));
    }
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    entries.slice(0, 10).forEach((npc) => {
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        const precision = npc.precision || 'unknown';
        let locationText;
        if (precision === 'unknown') {
            locationText = T('webview.world.npcWhereaboutsUnknown');
        } else if (npc.inTransit && precision === 'approximate') {
            locationText = npc.regionName
                ? T('webview.world.npcHeadingRegion', { region: npc.regionName })
                : T('webview.world.npcHeadingVague');
        } else if (precision === 'approximate' && npc.regionName) {
            locationText = npc.regionName;
        } else {
            locationText = npc.locationName || npc.locationId || '?';
        }
        const transit = npc.inTransit && precision !== 'unknown'
            ? `<span class="world-npc-transit">${escapeHtml(T('webview.world.npcInTransit'))} T${escapeHtml(npc.arrivesTurn ?? '?')}</span>`
            : precision === 'unknown'
                ? `<span class="tag-item">${escapeHtml(T('webview.world.npcWhereaboutsUnknown'))}</span>`
                : `<span class="tag-item">${escapeHtml(T('webview.world.npcPresent'))}</span>`;
        const introduced = npc.introducedByName
            ? `<span class="tag-item" title="${escapeHtml(T('webview.world.npcIntroducedTip'))}">${escapeHtml(T('webview.world.npcIntroducedBy', { name: npc.introducedByName }))}</span>`
            : '';
        row.innerHTML = `
            <strong>${escapeHtml(npc.name || npc.npcId || '?')}</strong>
            <span>${escapeHtml(locationText)}</span>
            ${transit}
            ${introduced}
        `;
        if (precision !== 'unknown' && (npc.reason || npc.agenda)) {
            row.title = [npc.agenda, npc.reason].filter(Boolean).join(' / ');
            const note = document.createElement('div');
            note.className = 'world-npc-reason';
            note.textContent = npc.reason || npc.agenda;
            row.appendChild(note);
        }
        list.appendChild(row);
    });
}

// LW3: notable bonds between named NPCs (labels only; hearsay for the player).
const NPC_BOND_LABEL_KEY = {
    ally: 'webview.world.npcBondAlly',
    friend: 'webview.world.npcBondFriend',
    rival: 'webview.world.npcBondRival',
    enemy: 'webview.world.npcBondEnemy',
};
const NPC_BOND_ICON = { ally: '🤝', friend: '🙂', rival: '⚡', enemy: '⚔️' };
const NPC_MILESTONE_KEY = {
    sworn_allies: 'webview.world.milestoneSwornAllies',
    inseparable: 'webview.world.milestoneInseparable',
    bitter_enemies: 'webview.world.milestoneBitterEnemies',
    estranged: 'webview.world.milestoneEstranged',
    reconciled: 'webview.world.milestoneReconciled',
};
const NPC_MILESTONE_ICON = {
    sworn_allies: '🛡️', inseparable: '💠', bitter_enemies: '🗡️', estranged: '💔', reconciled: '🕊️',
};

// LW3-P: プレイヤー自身の絆(kind ラベルのみ)
const PLAYER_BOND_KEY = {
    trusted_companion: 'webview.world.playerBondCompanion',
    romance: 'webview.world.playerBondRomance',
    nemesis: 'webview.world.playerBondNemesis',
    feared: 'webview.world.playerBondFeared',
    estrangement: 'webview.world.playerBondEstrangement',
};
const PLAYER_BOND_ICON = {
    trusted_companion: '🤝', romance: '💗', nemesis: '⚔️', feared: '😨', estrangement: '💔',
};

function renderNpcBonds(bonds, playerBonds) {
    const section = document.getElementById('world-npc-bonds-details');
    const list = document.getElementById('world-npc-bonds-list');
    if (!section || !list) { return; }

    const entries = Array.isArray(bonds) ? bonds : [];
    const yours = Array.isArray(playerBonds) ? playerBonds : [];
    const visible = entries.length > 0 || yours.length > 0;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    yours.slice(0, 8).forEach((pb) => {
        if (!PLAYER_BOND_KEY[pb.kind]) { return; }
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        row.innerHTML = `
            <strong>${escapeHtml(T('webview.world.playerBondYou'))} × ${escapeHtml(pb.name || '?')}</strong>
            <span class="tag-item">${PLAYER_BOND_ICON[pb.kind] || '•'} ${escapeHtml(T(PLAYER_BOND_KEY[pb.kind]))}</span>
        `;
        list.appendChild(row);
    });
    entries.slice(0, 8).forEach((bond) => {
        const row = document.createElement('div');
        row.className = 'world-npc-whereabouts-row';
        const icon = NPC_BOND_ICON[bond.label] || '•';
        const labelKey = NPC_BOND_LABEL_KEY[bond.label];
        const labelText = labelKey ? T(labelKey) : (bond.label || '?');
        let milestoneTag = '';
        if (bond.milestone && NPC_MILESTONE_KEY[bond.milestone]) {
            const mIcon = NPC_MILESTONE_ICON[bond.milestone] || '✦';
            milestoneTag = `<span class="tag-item" style="opacity:0.85;">${mIcon} ${escapeHtml(T(NPC_MILESTONE_KEY[bond.milestone]))}</span>`;
        }
        row.innerHTML = `
            <strong>${escapeHtml(bond.nameA || '?')} × ${escapeHtml(bond.nameB || '?')}</strong>
            <span class="tag-item">${icon} ${escapeHtml(labelText)}</span>
            ${milestoneTag}
        `;
        list.appendChild(row);
    });
}

function renderFactions(factions, factionStates, showReputation) {
    const list = document.getElementById('world-factions-list');
    if (!list) { return; }

    if (factions.length === 0) {
        list.innerHTML = `<p class="empty-text" style="margin:0;">${T('webview.world.factionsEmpty')}</p>`;
        return;
    }

    list.innerHTML = '';
    for (const faction of factions) {
        const icon = FACTION_TYPE_ICON[faction.type] || '❓';
        const bgColor = FACTION_TYPE_COLOR[faction.type] || '#333';
        const liveState = factionStates ? factionStates[faction.id] : null;

        const card = document.createElement('div');
        card.className = 'inspector-item';
        card.style.cssText = `
            background: ${bgColor};
            border-radius: 4px;
            padding: 0.5rem 0.7rem;
            margin-bottom: 0.4rem;
            border-left: 3px solid var(--vscode-focusBorder);
        `;

        // ヘッダー行（名前 + パワー）
        const livePower = liveState ? Math.round(liveState.power) : faction.power;
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
        header.innerHTML = `
            <strong>${icon} ${escapeHtml(faction.name)}</strong>
            ${livePower !== undefined
                ? `<span style="font-size:0.8em;opacity:0.8;">⚡${livePower}</span>`
                : ''}
        `;
        card.appendChild(header);

        // ライブシムデータがあればバー表示
        if (liveState) {
            card.appendChild(buildSimBars(liveState, showReputation));
        }

        // 静的説明文
        if (faction.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'font-size:0.82em;opacity:0.75;margin-top:0.25rem;';
            desc.textContent = faction.description;
            card.appendChild(desc);
        }

        // ゴール・敵対・同盟タグ
        const tags = [];
        if (faction.goals && faction.goals.length > 0) {
            tags.push(`🎯 ${faction.goals.slice(0, 2).join(' / ')}`);
        }
        if (faction.enemies && faction.enemies.length > 0) {
            tags.push(`⚔️ Enemy of: ${faction.enemies.slice(0, 2).join(', ')}`);
        }
        if (faction.allies && faction.allies.length > 0) {
            tags.push(`🤝 Ally of: ${faction.allies.slice(0, 2).join(', ')}`);
        }
        if (tags.length > 0) {
            const tagDiv = document.createElement('div');
            tagDiv.style.cssText = 'font-size:0.78em;opacity:0.7;margin-top:0.3rem;';
            tagDiv.textContent = tags.join(' · ');
            card.appendChild(tagDiv);
        }

        // 最近のシムイベント
        if (liveState && liveState.recentEvents && liveState.recentEvents.length > 0) {
            const evDiv = document.createElement('div');
            evDiv.style.cssText = 'font-size:0.76em;opacity:0.6;margin-top:0.25rem;font-style:italic;';
            evDiv.textContent = liveState.recentEvents.join(' / ');
            card.appendChild(evDiv);
        }

        list.appendChild(card);
    }
}

function buildSimBars(liveState, showReputation) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:0.35rem;display:flex;flex-direction:column;gap:0.15rem;';

    // パワーバー
    wrapper.appendChild(buildBar(T('webview.world.simPower'), liveState.power, 100, 'var(--vscode-charts-red, #c04040)'));

    // モラルバー（ある場合のみ）
    if (liveState.morale !== undefined) {
        wrapper.appendChild(buildBar(T('webview.world.simMorale'), liveState.morale, 100, 'var(--vscode-charts-blue, #4080c0)'));
    }

    if (showReputation) {
        wrapper.appendChild(buildReputationBar(liveState.playerReputation ?? 0));
    }

    return wrapper;
}

function buildReputationBar(rep) {
    const value = Math.max(-100, Math.min(100, Math.round(rep)));
    const display = value >= 0 ? `+${value}` : String(value);
    const barValue = (value + 100) / 2;
    const color = value >= 20
        ? 'var(--vscode-charts-green, #40a060)'
        : value <= -20
            ? 'var(--vscode-charts-red, #c04040)'
            : 'var(--vscode-descriptionForeground, #888)';
    const row = buildBar(T('webview.world.playerReputation'), barValue, 100, color);
    const valEl = row.querySelector('span:last-child');
    if (valEl) {
        valEl.textContent = display;
    }
    return row;
}

function buildBar(label, value, max, fillColor) {
    const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:0.3rem;';

    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'font-size:0.72em;opacity:0.6;width:3.2rem;flex-shrink:0;';
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const track = document.createElement('div');
    track.style.cssText = 'flex:1;background:rgba(255,255,255,0.1);border-radius:2px;height:5px;overflow:hidden;';
    const fill = document.createElement('div');
    fill.style.cssText = `width:${pct}%;height:100%;background:${fillColor};border-radius:2px;transition:width 0.4s;`;
    track.appendChild(fill);
    row.appendChild(track);

    const valEl = document.createElement('span');
    valEl.style.cssText = 'font-size:0.72em;opacity:0.7;width:2rem;text-align:right;flex-shrink:0;';
    valEl.textContent = String(Math.round(value));
    row.appendChild(valEl);

    return row;
}

// ---------------------------------------------------------------------------
// World Forge Generator UI
// ---------------------------------------------------------------------------

function buildWorldGenForm() {
    const empty = document.getElementById('world-empty');
    if (!empty) { return; }

    // Inject styles
    const styleId = 'world-gen-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .world-gen-card {
                padding: 1.5rem;
                margin: 1.5rem auto;
                max-width: 420px;
                background: linear-gradient(145deg, rgba(30,30,35,0.8), rgba(20,20,25,0.95));
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05);
                backdrop-filter: blur(10px);
                font-family: var(--vscode-font-family), sans-serif;
            }
            .world-gen-title {
                font-size: 1.25em;
                font-weight: 600;
                color: #f0f0f0;
                margin-bottom: 0.4rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            .world-gen-desc {
                font-size: 0.85em;
                color: #a0a0a8;
                line-height: 1.5;
                margin-bottom: 1.2rem;
                padding-bottom: 0.8rem;
                border-bottom: 1px solid rgba(255,255,255,0.06);
            }
            .world-gen-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.8rem;
            }
            .world-gen-label {
                font-size: 0.88em;
                color: #d0d0d0;
                font-weight: 500;
                flex: 1;
            }
            .world-gen-input {
                background: rgba(0,0,0,0.4);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 6px;
                padding: 0.45rem 0.6rem;
                font-size: 0.85em;
                transition: all 0.2s ease;
                width: 55%;
                box-sizing: border-box;
            }
            .world-gen-input:focus {
                outline: none;
                border-color: #4a90e2;
                box-shadow: 0 0 0 2px rgba(74,144,226,0.25);
                background: rgba(0,0,0,0.6);
            }
            .world-gen-input[type="number"] {
                width: 4.5rem;
                text-align: center;
            }
            .world-gen-btn {
                width: 100%;
                margin-top: 1.2rem;
                padding: 0.7rem;
                background: linear-gradient(180deg, #4a90e2 0%, #357abd 100%);
                color: #fff;
                border: 1px solid #2a649d;
                border-radius: 6px;
                font-weight: 600;
                font-size: 0.95em;
                cursor: pointer;
                transition: all 0.2s ease;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                box-shadow: 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.4rem;
            }
            .world-gen-btn:hover:not(:disabled) {
                background: linear-gradient(180deg, #5b9ce6 0%, #4085c7 100%);
                box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.3);
                transform: translateY(-1px);
            }
            .world-gen-btn:active:not(:disabled) {
                transform: translateY(1px);
                box-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }
            .world-gen-btn:disabled {
                background: #3a3a40;
                color: #6a6a70;
                border-color: #2a2a30;
                cursor: not-allowed;
                box-shadow: none;
                text-shadow: none;
            }
            .world-gen-btn.generating {
                background: linear-gradient(180deg, #b06520 0%, #8c4c13 100%);
                border-color: #633308;
                color: #f0f0f0;
            }
            .world-gen-btn.failed {
                background: linear-gradient(180deg, #c04040 0%, #802020 100%);
                border-color: #501010;
            }
        `;
        document.head.appendChild(style);
    }

    empty.innerHTML = '';
    
    const card = document.createElement('div');
    card.className = 'world-gen-card';
    empty.appendChild(card);

    const title = document.createElement('div');
    title.className = 'world-gen-title';
    title.innerHTML = T('webview.world.forgeTitle');
    card.appendChild(title);

    const desc = document.createElement('div');
    desc.className = 'world-gen-desc';
    desc.textContent = T('webview.world.forgeDesc');
    card.appendChild(desc);

    // Rows
    card.appendChild(makeFormRow(T('webview.world.forgeSeed'), makeTextInput('world-gen-seed', 'e.g. lost-catacombs')));

    const themeSelect = document.createElement('select');
    themeSelect.id = 'world-gen-theme';
    themeSelect.className = 'world-gen-input';
    for (const t of ['dungeon-crawler', 'dark-fantasy', 'cyberpunk', 'post-apocalyptic', 'zombie-apocalypse', 'scifi', 'steampunk', 'cosmic-horror', 'oriental-fantasy', 'default']) {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1).replace('-', ' ');
        themeSelect.appendChild(opt);
    }
    card.appendChild(makeFormRow(T('webview.world.forgeTheme'), themeSelect));

    card.appendChild(makeFormRow(T('webview.world.forgeRegions'), makeNumberInput('world-gen-regions', 3, 12, 5)));
    card.appendChild(makeFormRow(T('webview.world.forgeFactions'), makeNumberInput('world-gen-factions', 2, 6, 3)));
    card.appendChild(makeFormRow(T('webview.world.forgeNpcs'), makeNumberInput('world-gen-npcs', 2, 20, 6)));

    // Generate button
    const btn = document.createElement('button');
    btn.id = 'world-gen-btn';
    btn.className = 'world-gen-btn';
    btn.innerHTML = `<span>${T('webview.world.forgeBtn')}</span>`;
    btn.addEventListener('click', () => {
        const rawSeed = document.getElementById('world-gen-seed')?.value?.trim() || '';
        const seed = rawSeed.slice(0, 64);
        if (!seed || !/^[a-zA-Z0-9_-]+$/.test(seed)) {
            document.getElementById('world-gen-seed')?.focus();
            return;
        }
        const theme = document.getElementById('world-gen-theme')?.value || 'default';
        const regionCount = Math.max(3, Math.min(12, parseInt(document.getElementById('world-gen-regions')?.value || '5', 10) || 5));
        const factionCount = Math.max(2, Math.min(6, parseInt(document.getElementById('world-gen-factions')?.value || '3', 10) || 3));
        const npcCount = Math.max(2, Math.min(20, parseInt(document.getElementById('world-gen-npcs')?.value || '6', 10) || 6));
        vscode.postMessage({ type: 'generateWorldForge', seed, theme, regionCount, factionCount, npcCount });
    });
    card.appendChild(btn);
}

function makeFormRow(label, input) {
    const row = document.createElement('div');
    row.className = 'world-gen-row';
    const lbl = document.createElement('label');
    lbl.className = 'world-gen-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(input);
    return row;
}

function makeTextInput(id, placeholder) {
    const el = document.createElement('input');
    el.id = id;
    el.type = 'text';
    el.placeholder = placeholder;
    el.className = 'world-gen-input';
    return el;
}

function makeNumberInput(id, min, max, defaultVal) {
    const el = document.createElement('input');
    el.id = id;
    el.type = 'number';
    el.min = String(min);
    el.max = String(max);
    el.value = String(defaultVal);
    el.className = 'world-gen-input';
    return el;
}

function setWorldGenBusy(busy) {
    const btn = document.getElementById('world-gen-btn');
    if (!btn) { return; }
    btn.disabled = busy;
    if (busy) {
        btn.classList.add('generating');
        btn.classList.remove('failed');
        btn.innerHTML = `<span>${T('webview.world.worldGenBusy')}</span>`;
    } else {
        btn.classList.remove('generating');
        btn.innerHTML = `<span>${T('webview.world.forgeBtn')}</span>`;
    }
}

function setWorldMapGenBusy(busy, failed = false) {
    const btn = document.getElementById('world-gen-map-btn');
    if (!btn) { return; }
    btn.disabled = busy;
    btn.classList.toggle('generating', busy);
    if (busy) {
        btn.textContent = T('webview.world.mapGenerating');
    } else if (failed) {
        btn.textContent = T('webview.world.mapFailed');
    } else {
        btn.textContent = T('webview.world.mapImage');
    }
}

function setWorldSceneImageBusy(busy, failed = false) {
    const btn = document.getElementById('world-gen-image-btn');
    if (!btn) { return; }
    if (!busy) {
        worldSceneImagePending = false;
    }
    btn.disabled = busy;
    if (busy) {
        btn.innerHTML = `<span>${T('webview.world.worldGenBusy')}</span>`;
    } else if (failed) {
        btn.innerHTML = `<span>${T('webview.world.sceneImageFailed')}</span>`;
    } else {
        btn.innerHTML = T('webview.world.sceneImageBtn');
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ===== Campaign Kit: discoveries + hub job/rumor board (read-only) =====

const CAMPAIGN_DISCOVERY_STATUS_KEYS = ['unidentified', 'identified', 'appraised'];
const CAMPAIGN_DISCOVERY_KIND_KEYS = ['material', 'lore', 'social', 'route', 'threat', 'quest'];

function ensureCampaignKitStyles() {
    if (document.getElementById('world-campaign-kit-styles')) { return; }
    const style = document.createElement('style');
    style.id = 'world-campaign-kit-styles';
    style.textContent = `
        .campaign-kit-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.45rem; }
        .campaign-kit-kit-name { font-weight: 600; font-size: 0.95em; }
        .campaign-kit-hub { font-size: 0.82em; opacity: 0.7; }
        .campaign-kit-section { margin-top: 0.55rem; }
        .campaign-kit-section-heading { font-size: 0.82em; font-weight: 600; opacity: 0.75; margin-bottom: 0.35rem; }
        .campaign-discovery-card, .campaign-job-card {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 0.45rem 0.55rem;
            margin-bottom: 0.4rem;
            background: rgba(0,0,0,0.15);
        }
        .campaign-discovery-title, .campaign-job-title { font-size: 0.9em; font-weight: 600; margin-bottom: 0.2rem; }
        .campaign-discovery-meta, .campaign-job-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; font-size: 0.78em; opacity: 0.85; margin-bottom: 0.25rem; }
        .campaign-badge {
            display: inline-block;
            padding: 0.05rem 0.35rem;
            border-radius: 4px;
            border: 1px solid rgba(255,255,255,0.15);
            font-size: 0.92em;
        }
        .campaign-badge.status-unidentified { color: var(--vscode-charts-yellow, #e8c547); }
        .campaign-badge.status-identified { color: var(--vscode-charts-blue, #6cb6ff); }
        .campaign-badge.status-appraised { color: var(--vscode-charts-green, #73c991); }
        .campaign-badge.condition-repaired { color: var(--vscode-charts-green, #73c991); }
        .campaign-badge.condition-upgraded { color: var(--vscode-charts-blue, #6cb6ff); }
        .campaign-badge.condition-damaged { color: var(--vscode-charts-red, #f14c4c); }
        .campaign-badge.kind-job { color: var(--vscode-charts-orange, #e8a838); }
        .campaign-badge.kind-rumor { color: var(--vscode-charts-purple, #b180d7); }
        .campaign-resource-list { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.4rem; }
        .campaign-resource-chip.level-ok { color: var(--vscode-charts-green, #73c991); }
        .campaign-resource-chip.level-low { color: var(--vscode-charts-yellow, #e8c547); }
        .campaign-resource-chip.level-out { color: var(--vscode-charts-red, #f14c4c); border-color: var(--vscode-charts-red, #f14c4c); }
        .campaign-job-summary { font-size: 0.86em; opacity: 0.9; margin-bottom: 0.3rem; }
        .campaign-job-actions, .campaign-discovery-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
    `;
    document.head.appendChild(style);
}

function campaignKitT(section, key) {
    return T(`webview.world.campaign${section}.${key}`) || key;
}

function renderCampaignKitPanel(msg) {
    ensureCampaignKitStyles();
    const section = document.getElementById('world-campaign-kit-details');
    const panel = document.getElementById('world-campaign-kit-panel');
    if (!section || !panel) { return; }

    const kit = msg.campaignKit;
    const visible = msg.enableCampaignKit === true && kit;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const discoveries = Array.isArray(msg.campaignDiscoveries) ? msg.campaignDiscoveries : [];
    const jobBoard = Array.isArray(msg.campaignJobBoard) ? msg.campaignJobBoard : [];
    const resources = Array.isArray(msg.campaignResources) ? msg.campaignResources : [];
    const boardLabel = kit.loop?.jobBoardLabel || T('webview.world.campaignJobBoardFallback');

    panel.innerHTML = `
        <div class="campaign-kit-header">
            <div class="campaign-kit-kit-name">${escapeHtml(kit.kitName || kit.kitId || '')}</div>
            <div class="campaign-kit-hub">${escapeHtml(T('webview.world.campaignKitHub', { hub: kit.hubLocationName || kit.hubLocationId || '' }))}</div>
        </div>
    `;

    if (resources.length) {
        panel.appendChild(buildCampaignResourcesSection(resources));
    }
    const appraisalLabel = kit.loop?.appraisalLabel || T('webview.world.campaignAppraisalFallback');
    panel.appendChild(buildCampaignDiscoveriesSection(discoveries, appraisalLabel));
    panel.appendChild(buildCampaignJobBoardSection(jobBoard, boardLabel));
}

function buildCampaignResourcesSection(resources) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignResourcesTitle');
    el.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'campaign-resource-list';
    resources.forEach((r) => {
        const chip = document.createElement('span');
        const level = r.qty === 0 ? 'out' : r.qty <= 2 ? 'low' : 'ok';
        chip.className = `campaign-badge campaign-resource-chip level-${level}`;
        chip.textContent = `${r.name}: ${r.qty}`;
        list.appendChild(chip);
    });
    el.appendChild(list);
    return el;
}

function buildCampaignDiscoveriesSection(discoveries, appraisalLabel) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignDiscoveriesTitle');
    el.appendChild(heading);

    if (!discoveries.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.campaignDiscoveriesEmpty');
        el.appendChild(empty);
        return el;
    }

    discoveries.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'campaign-discovery-card';
        const statusLabel = campaignKitT('DiscoveryStatus', entry.status || 'unidentified');
        const kindLabel = campaignKitT('DiscoveryKind', entry.kind || 'material');
        const siteLine = entry.siteName
            ? `<span>${escapeHtml(T('webview.world.campaignDiscoverySite', { site: entry.siteName }))}</span>`
            : '';
        const conditionLine = entry.condition
            ? `<span class="campaign-badge condition-${escapeHtml(entry.condition)}">${escapeHtml(campaignKitT('DiscoveryCondition', entry.condition))}</span>`
            : '';
        const valueLine = typeof entry.suggestedValue === 'number'
            ? `<span>${escapeHtml(T('webview.world.campaignSuggestedValue', { value: String(entry.suggestedValue) }))}</span>`
            : '';
        card.innerHTML = `
            <div class="campaign-discovery-title">${escapeHtml(entry.label || entry.id)}</div>
            <div class="campaign-discovery-meta">
                <span class="campaign-badge status-${escapeHtml(entry.status || 'unidentified')}">${escapeHtml(statusLabel)}</span>
                <span class="campaign-badge">${escapeHtml(kindLabel)}</span>
                ${conditionLine}
                ${siteLine}
                ${valueLine}
            </div>
        `;
        if (entry.status === 'unidentified' || entry.status === 'identified') {
            const actions = document.createElement('div');
            actions.className = 'campaign-discovery-actions';
            const appraiseBtn = document.createElement('button');
            appraiseBtn.type = 'button';
            appraiseBtn.className = 'small-btn';
            appraiseBtn.textContent = entry.status === 'unidentified'
                ? T('webview.world.campaignAppraiseBtn')
                : T('webview.world.campaignAppraiseFinalizeBtn');
            appraiseBtn.addEventListener('click', () => {
                const key = entry.status === 'unidentified'
                    ? 'webview.world.campaignAppraiseInsertText'
                    : 'webview.world.campaignAppraiseFinalizeText';
                postWorldInsertChatText(T(key, {
                    label: entry.label || entry.id,
                    id: entry.id,
                    appraisal: appraisalLabel,
                }));
            });
            actions.appendChild(appraiseBtn);
            card.appendChild(actions);
        } else if (entry.status === 'appraised') {
            const actions = document.createElement('div');
            actions.className = 'campaign-discovery-actions';
            const sellBtn = document.createElement('button');
            sellBtn.type = 'button';
            sellBtn.className = 'small-btn primary';
            sellBtn.textContent = T('webview.world.campaignSellFindingBtn');
            sellBtn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.campaignSellFindingText', {
                    label: entry.label || entry.id,
                    id: entry.id,
                }));
            });
            actions.appendChild(sellBtn);
            card.appendChild(actions);
        }
        el.appendChild(card);
    });
    return el;
}

function buildCampaignJobBoardSection(jobBoard, boardLabel) {
    const el = document.createElement('div');
    el.className = 'campaign-kit-section';
    const heading = document.createElement('div');
    heading.className = 'campaign-kit-section-heading';
    heading.textContent = T('webview.world.campaignJobBoardTitle', { label: boardLabel });
    el.appendChild(heading);

    if (!jobBoard.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.campaignJobBoardEmpty');
        el.appendChild(empty);
        return el;
    }

    jobBoard.forEach((entry) => {
        const card = document.createElement('div');
        card.className = 'campaign-job-card';
        const kindLabel = campaignKitT('JobKind', entry.kind || 'job');
        const metaParts = [];
        if (entry.siteName) {
            metaParts.push(`<span>${escapeHtml(T('webview.world.campaignDiscoverySite', { site: entry.siteName }))}</span>`);
        }
        if (entry.rewardHint) {
            metaParts.push(`<span>${escapeHtml(T('webview.world.campaignJobReward', { reward: entry.rewardHint }))}</span>`);
        }
        if (entry.factionId) {
            metaParts.push(`<span class="campaign-badge">${escapeHtml(T('webview.world.campaignJobClient', { faction: entry.factionId }))}</span>`);
        }
        card.innerHTML = `
            <div class="campaign-job-title">${escapeHtml(entry.title || entry.id)}</div>
            <div class="campaign-job-meta">
                <span class="campaign-badge kind-${escapeHtml(entry.kind || 'job')}">${escapeHtml(kindLabel)}</span>
                ${metaParts.join('')}
            </div>
            <div class="campaign-job-summary">${escapeHtml(entry.summary || '')}</div>
        `;
        const actions = document.createElement('div');
        actions.className = 'campaign-job-actions';
        const inquireBtn = document.createElement('button');
        inquireBtn.type = 'button';
        inquireBtn.className = 'small-btn';
        inquireBtn.textContent = T('webview.world.campaignJobInquireBtn');
        inquireBtn.addEventListener('click', () => {
            const siteSuffix = entry.siteName ? ` — target: ${entry.siteName}` : '';
            postWorldInsertChatText(T('webview.world.campaignJobInquireText', {
                title: entry.title || entry.id,
                summary: entry.summary || '',
                siteSuffix,
            }));
        });
        actions.appendChild(inquireBtn);
        {
            const acceptBtn = document.createElement('button');
            acceptBtn.type = 'button';
            acceptBtn.className = 'small-btn primary';
            acceptBtn.textContent = T('webview.world.campaignJobAcceptBtn');
            acceptBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'acceptCampaignJob', boardEntryId: entry.id });
            });
            actions.appendChild(acceptBtn);
        }
        card.appendChild(actions);
        el.appendChild(card);
    });
    return el;
}

// ===== Guild Master (G1): quest board panel (read-only) =====

const GUILD_STAT_KEYS = ['discipline', 'townFavor', 'facilities', 'safety', 'lore', 'renown'];

function guildT(section, key) {
    return T(`webview.world.guild${section}.${key}`) || key;
}

function renderGuildPanel(msg) {
    const section = document.getElementById('world-guild-details');
    const panel = document.getElementById('world-guild-panel');
    if (!section || !panel) { return; }

    const guild = msg.guild;
    const visible = msg.enableGuildMode === true && guild;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    const name = escapeHtml(guild.hallLocationName || guild.hallLocationId || '');
    const rank = escapeHtml(guildT('Rank', guild.rank || 'chartered'));
    const dateLabel = escapeHtml(T('webview.world.guildWeekYear', { week: guild.calendarWeek, year: guild.calendarYear }));

    panel.innerHTML = `
        <div class="guild-header">
            <div class="guild-header-title">${name} <span class="guild-rank-badge">${rank}</span></div>
            <div class="guild-header-date">${dateLabel}</div>
        </div>
        <div class="guild-resource-row">
            <div class="guild-resource" title="${escapeHtml(T('webview.world.guildCoffers'))}">
                <span>💰</span><strong>${escapeHtml(guild.coffers ?? 0)}</strong>
            </div>
            <div class="guild-resource" title="${escapeHtml(T('webview.world.guildSupplies'))}">
                <span>📦</span><strong>${escapeHtml(guild.supplies ?? 0)}</strong>
            </div>
        </div>
        <div class="guild-stats-grid">
            ${GUILD_STAT_KEYS.map((key) => {
                const value = Math.max(0, Math.min(100, Number(guild[key]) || 0));
                return `
                    <div class="guild-stat-row">
                        <span class="guild-stat-label">${escapeHtml(guildT('Stat', key))}</span>
                        <div class="guild-stat-bar"><div class="guild-stat-fill" style="width:${value}%"></div></div>
                        <span class="guild-stat-value">${value}</span>
                    </div>
                `;
            }).join('')}
            <div class="guild-actions-left">${escapeHtml(T('webview.world.guildActionsLeft', { n: guild.weeklyActionsRemaining ?? 0 }))}</div>
        </div>
        ${guild.adventurers && guild.adventurers.length > 0
            ? `<div class="guild-adventurers-row">${guild.adventurers.map((a) =>
                `<span class="guild-adventurer-chip">${escapeHtml(a.npcId)} · ${escapeHtml(guildT('Class', a.klass))}</span>`
            ).join('')}</div>`
            : `<p class="empty-text">${escapeHtml(T('webview.world.guildNoAdventurers'))}</p>`}
    `;

    if ((Array.isArray(guild.pendingEvents) && guild.pendingEvents.length > 0) || guild.lastEventId) {
        panel.appendChild(buildGuildEventsSection(guild, msg));
    }

    if (msg.enableGuildRequests === true && Array.isArray(guild.pendingRequests) && guild.pendingRequests.length > 0) {
        panel.appendChild(buildGuildBoardSection(guild, msg));
    }

    if (msg.enableGuildParties === true && Array.isArray(guild.quests) && guild.quests.length > 0) {
        panel.appendChild(buildGuildQuestsSection(guild));
    } else if (msg.enableGuildParties === true && Array.isArray(guild.lastQuestReports) && guild.lastQuestReports.length > 0) {
        panel.appendChild(buildGuildQuestReportsOnly(guild));
    }
}

function buildGuildQuestReportsOnly(guild) {
    const el = document.createElement('div');
    el.className = 'guild-quests-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildQuestsTitle');
    el.appendChild(heading);
    const reports = document.createElement('div');
    reports.className = 'guild-quest-reports';
    reports.innerHTML = guild.lastQuestReports.map((r) => `<p>${escapeHtml(r)}</p>`).join('');
    el.appendChild(reports);
    return el;
}

function buildGuildQuestsSection(guild) {
    const el = document.createElement('div');
    el.className = 'guild-quests-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildQuestsTitle');
    el.appendChild(heading);

    const active = (guild.quests || []).filter((q) => q.status === 'active');
    if (active.length > 0) {
        const list = document.createElement('div');
        list.innerHTML = active.map((q) => `
            <div class="guild-quest-active-row">
                <span>${escapeHtml(q.id)} · ${escapeHtml(guildT('QuestKind', q.questKind))}</span>
                <span>${escapeHtml(T('webview.world.guildQuestWeeksLeft', { n: q.weeksRemaining ?? 0 }))}</span>
            </div>
        `).join('');
        el.appendChild(list);
    }

    const reports = guild.lastQuestReports || [];
    if (reports.length > 0) {
        const reportsWrap = document.createElement('div');
        reportsWrap.className = 'guild-quest-reports';
        reportsWrap.innerHTML = reports.map((r) => `<p>${escapeHtml(r)}</p>`).join('');
        el.appendChild(reportsWrap);
    }

    const awayIds = new Set(active.flatMap((q) => q.partyNpcIds || []));
    const accepted = (guild.quests || []).filter((q) => q.status === 'accepted');
    accepted.forEach((quest) => {
        el.appendChild(buildGuildAssignForm(quest, guild.adventurers || [], awayIds));
    });

    return el;
}

function buildGuildAssignForm(quest, adventurers, awayIds) {
    const card = document.createElement('div');
    card.className = 'guild-quest-card';
    card.innerHTML = `
        <div class="guild-quest-summary">
            <strong>${escapeHtml(quest.id)}</strong> — ${escapeHtml(guildT('QuestKind', quest.questKind))}
            (${escapeHtml(T('webview.world.guildQuestReward', { n: quest.rewardCoffers ?? 0 }))})
        </div>
    `;

    const available = adventurers.filter((a) => !awayIds.has(a.npcId));
    if (available.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-text';
        empty.textContent = T('webview.world.guildNoAdventurersAvailable');
        card.appendChild(empty);
        return card;
    }

    const form = document.createElement('div');
    form.className = 'guild-party-form';

    const checks = document.createElement('div');
    checks.className = 'guild-party-checks';
    const selected = new Set();
    available.forEach((a) => {
        const label = document.createElement('label');
        label.className = 'guild-party-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = a.npcId;
        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (selected.size >= 3) {
                    cb.checked = false;
                    return;
                }
                selected.add(a.npcId);
            } else {
                selected.delete(a.npcId);
            }
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(`${a.npcId} (${guildT('Class', a.klass)})`));
        checks.appendChild(label);
    });

    const weeksSelect = document.createElement('select');
    weeksSelect.className = 'guild-party-weeks';
    weeksSelect.setAttribute('aria-label', T('webview.world.guildQuestWeeks'));
    [1, 2, 3].forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = T('webview.world.guildQuestWeeksLeft', { n });
        weeksSelect.appendChild(opt);
    });

    const dispatchBtn = document.createElement('button');
    dispatchBtn.type = 'button';
    dispatchBtn.className = 'small-btn';
    dispatchBtn.textContent = T('webview.world.guildAssignBtn');
    dispatchBtn.addEventListener('click', () => {
        const npcIds = [...selected];
        if (npcIds.length === 0) { return; }
        postWorldInsertChatText(T('webview.world.guildAssignInsertText', {
            questId: quest.id,
            npcIds: npcIds.join(', '),
            weeks: weeksSelect.value,
        }));
    });

    form.appendChild(checks);
    form.appendChild(weeksSelect);
    form.appendChild(dispatchBtn);
    card.appendChild(form);
    return card;
}

function buildGuildBoardSection(guild, msg) {
    const el = document.createElement('div');
    el.className = 'guild-board-section';
    const heading = document.createElement('div');
    heading.className = 'guild-section-heading';
    heading.textContent = T('webview.world.guildBoardTitle');
    el.appendChild(heading);

    guild.pendingRequests.forEach((request) => {
        const card = document.createElement('div');
        card.className = 'guild-request-card';
        card.innerHTML = `
            <div class="guild-request-summary">
                <strong>${escapeHtml(request.clientArchetype)}</strong> — ${escapeHtml(request.summary)}
            </div>
        `;
        const actionsRow = document.createElement('div');
        actionsRow.className = 'guild-request-actions';

        const parleyBtn = document.createElement('button');
        parleyBtn.type = 'button';
        parleyBtn.className = 'small-btn';
        parleyBtn.textContent = T('webview.world.guildParleyBtn');
        parleyBtn.addEventListener('click', () => {
            postWorldInsertChatText(T('webview.world.guildParleyInsertText', {
                requestId: request.id,
                client: request.clientArchetype,
                summary: request.summary,
            }));
        });
        actionsRow.appendChild(parleyBtn);

        (request.rulings || []).forEach((ruling) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn guild-ruling-btn';
            btn.textContent = guildT('Ruling', ruling.rulingId);
            btn.title = ruling.label;
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.guildRulingInsertText', {
                    requestId: request.id,
                    client: request.clientArchetype,
                    summary: request.summary,
                    ruling: ruling.label,
                }));
            });
            actionsRow.appendChild(btn);
        });

        const isExcluded = Array.isArray(msg.excludedEventIds) && msg.excludedEventIds.includes(`guild:${request.id}`);
        actionsRow.appendChild(buildEventExclusionControl('guild', request.id, isExcluded));

        card.appendChild(actionsRow);
        el.appendChild(card);
    });
    return el;
}

// ===== Domain Mode (D3): F7 Audience / F8 Rivals / F9 Missions / F10 Battle =====

const DOMAIN_STAT_KEYS = ['publicOrder', 'popularSupport', 'agriculture', 'commerce', 'defense', 'culture', 'prestige'];
let _domainSelectedActions = [];

function domainT(section, key) {
    return T(`webview.world.domain${section}.${key}`) || key;
}

function renderDomainPanel(msg) {
    const section = document.getElementById('world-domain-details');
    const panel = document.getElementById('world-domain-panel');
    if (!section || !panel) { return; }

    const domain = msg.domain;
    const visible = msg.enableDomainMode === true && domain;
    section.classList.toggle('hidden', !visible);
    if (!visible) {
        panel.innerHTML = '';
        return;
    }

    panel.innerHTML = '';
    panel.appendChild(buildDomainHeader(domain));
    panel.appendChild(buildDomainResourceRow(domain));
    panel.appendChild(buildDomainStatsGrid(domain));

    if (domain.officers && domain.officers.length > 0) {
        panel.appendChild(buildDomainOfficersList(domain));
    }

    if (domain.monthlyActionsRemaining > 0 && Array.isArray(domain.actionCatalog) && domain.actionCatalog.length > 0) {
        panel.appendChild(buildDomainActionChips(domain));
    }

    if ((Array.isArray(domain.pendingEvents) && domain.pendingEvents.length > 0) || domain.lastEventId) {
        panel.appendChild(buildDomainEventsSection(domain, msg));
    }

    if (msg.enableDomainAudience === true && Array.isArray(domain.pendingPetitions) && domain.pendingPetitions.length > 0) {
        panel.appendChild(buildDomainAudienceSection(domain, msg));
    }

    if (msg.enableDomainRivals === true && domain.rival) {
        panel.appendChild(buildDomainRivalSection(domain.rival));
    }

    if (msg.enableDomainMissions === true) {
        panel.appendChild(buildDomainMissionsSection(domain));
    }

    if (msg.enableMassBattle === true && (domain.activeBattle || domain.lastBattleReport)) {
        panel.appendChild(buildDomainBattleSection(domain));
    }
}

function buildDomainHeader(domain) {
    const el = document.createElement('div');
    el.className = 'domain-header';
    const name = escapeHtml(domain.regionName || domain.controlledRegionId || '');
    const rank = escapeHtml(domainT('Rank', domain.rank || 'minor_lord'));
    const dateLabel = escapeHtml(T('webview.world.domainMonthYear', { month: domain.calendarMonth, year: domain.calendarYear }));
    el.innerHTML = `
        <div class="domain-header-title">${name} <span class="domain-rank-badge">${rank}</span></div>
        <div class="domain-header-date">${dateLabel}</div>
    `;
    return el;
}

function buildDomainResourceRow(domain) {
    const el = document.createElement('div');
    el.className = 'domain-resource-row';
    const items = [
        ['💰', domain.treasury, T('webview.world.domainTreasury')],
        ['🌾', domain.food, T('webview.world.domainFood')],
        ['⚔️', domain.troops, T('webview.world.domainTroops')],
    ];
    el.innerHTML = items.map(([icon, value, label]) => `
        <div class="domain-resource" title="${escapeHtml(label)}">
            <span class="domain-resource-icon">${icon}</span><strong>${escapeHtml(value ?? 0)}</strong>
        </div>
    `).join('');
    return el;
}

function buildDomainStatsGrid(domain) {
    const el = document.createElement('div');
    el.className = 'domain-stats-grid';
    el.innerHTML = DOMAIN_STAT_KEYS.map((key) => {
        const value = Math.max(0, Math.min(100, Number(domain[key]) || 0));
        return `
            <div class="domain-stat-row">
                <span class="domain-stat-label">${escapeHtml(domainT('Stat', key))}</span>
                <div class="domain-stat-bar"><div class="domain-stat-fill" style="width:${value}%"></div></div>
                <span class="domain-stat-value">${value}</span>
            </div>
        `;
    }).join('') + `<div class="domain-actions-left">${escapeHtml(T('webview.world.domainActionsLeft', { n: domain.monthlyActionsRemaining ?? 0 }))}</div>`;
    return el;
}

function buildDomainOfficersList(domain) {
    const el = document.createElement('div');
    el.className = 'domain-officers-row';
    const awayIds = new Set((domain.activeMissions || []).map((m) => m.officerNpcId));
    el.innerHTML = domain.officers.map((o) => {
        const away = awayIds.has(o.npcId);
        const roleLabel = escapeHtml(domainT('OfficerRole', o.role));
        const awayTag = away ? ` <span class="domain-officer-away">(${escapeHtml(T('webview.world.domainOfficerAway'))})</span>` : '';
        return `<span class="domain-officer-chip${away ? ' is-away' : ''}">${escapeHtml(o.npcId)} · ${roleLabel}${awayTag}</span>`;
    }).join('');
    return el;
}

function buildDomainActionChips(domain) {
    const wrap = document.createElement('div');
    wrap.className = 'domain-action-chips-wrap';

    const maxSelectable = domain.monthlyActionsRemaining ?? 2;
    _domainSelectedActions = _domainSelectedActions.filter((a) => domain.actionCatalog.includes(a));

    const chipsRow = document.createElement('div');
    chipsRow.className = 'domain-action-chips';
    domain.actionCatalog.forEach((actionId) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'domain-action-chip';
        chip.textContent = domainT('Action', actionId);
        chip.classList.toggle('is-selected', _domainSelectedActions.includes(actionId));
        chip.addEventListener('click', () => {
            const idx = _domainSelectedActions.indexOf(actionId);
            if (idx >= 0) {
                _domainSelectedActions.splice(idx, 1);
            } else if (_domainSelectedActions.length < maxSelectable) {
                _domainSelectedActions.push(actionId);
            }
            renderDomainPanel(_worldViewMsg);
        });
        chipsRow.appendChild(chip);
    });
    wrap.appendChild(chipsRow);

    const commitBtn = document.createElement('button');
    commitBtn.type = 'button';
    commitBtn.className = 'small-btn primary domain-commit-btn';
    commitBtn.textContent = T('webview.world.domainCommitBtn');
    commitBtn.disabled = _domainSelectedActions.length === 0;
    commitBtn.addEventListener('click', () => {
        const labels = _domainSelectedActions.map((a) => domainT('Action', a)).join(', ');
        postWorldInsertChatText(T('webview.world.domainCommitText', { actions: labels }));
        _domainSelectedActions = [];
        renderDomainPanel(_worldViewMsg);
    });
    wrap.appendChild(commitBtn);

    return wrap;
}

function buildDomainAudienceSection(domain, msg) {
    const el = document.createElement('div');
    el.className = 'domain-audience-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainAudienceTitle');
    el.appendChild(heading);

    domain.pendingPetitions.forEach((petition) => {
        const card = document.createElement('div');
        card.className = 'domain-petition-card';
        card.innerHTML = `
            <div class="domain-petition-summary">
                <strong>${escapeHtml(petition.petitionerArchetype)}</strong> — ${escapeHtml(petition.summary)}
            </div>
        `;
        const rulingsRow = document.createElement('div');
        rulingsRow.className = 'domain-petition-rulings';
        (petition.rulings || []).forEach((ruling) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn domain-ruling-btn';
            btn.textContent = domainT('Ruling', ruling.rulingId);
            btn.title = ruling.label;
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.domainAudienceInsertText', {
                    petitioner: petition.petitionerArchetype,
                    summary: petition.summary,
                    ruling: ruling.label,
                }));
            });
            rulingsRow.appendChild(btn);
        });

        const isExcluded = Array.isArray(msg.excludedEventIds) && msg.excludedEventIds.includes(`audience:${petition.id}`);
        rulingsRow.appendChild(buildEventExclusionControl('audience', petition.id, isExcluded));

        card.appendChild(rulingsRow);
        el.appendChild(card);
    });
    return el;
}

function buildDomainRivalSection(rival) {
    const el = document.createElement('div');
    el.className = 'domain-rival-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainRivalTitle');
    el.appendChild(heading);

    const body = document.createElement('div');
    body.className = 'domain-rival-body';
    const name = escapeHtml(rival.regionName || rival.regionId || '');
    if (rival.disclosedStrength === undefined || rival.disclosedStance === undefined) {
        body.innerHTML = `<p class="empty-text">${escapeHtml(T('webview.world.domainRivalUnknown', { name }))}</p>`;
    } else {
        const stance = escapeHtml(domainT('RivalStance', rival.disclosedStance));
        body.innerHTML = `<p>${escapeHtml(T('webview.world.domainRivalKnown', { name, strength: rival.disclosedStrength, stance }))}</p>`;
    }
    el.appendChild(body);
    return el;
}

function buildDomainMissionsSection(domain) {
    const el = document.createElement('div');
    el.className = 'domain-missions-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainMissionsTitle');
    el.appendChild(heading);

    const active = domain.activeMissions || [];
    if (active.length > 0) {
        const list = document.createElement('div');
        list.className = 'domain-mission-list';
        list.innerHTML = active.map((m) => `
            <div class="domain-mission-row">
                <span>${escapeHtml(m.officerNpcId)} — ${escapeHtml(domainT('MissionKind', m.kind))}</span>
                <span class="domain-mission-months">${escapeHtml(T('webview.world.domainMissionMonthsLeft', { n: m.monthsRemaining }))}</span>
            </div>
        `).join('');
        el.appendChild(list);
    }

    const reports = domain.lastMissionReports || [];
    if (reports.length > 0) {
        const reportsWrap = document.createElement('div');
        reportsWrap.className = 'domain-mission-reports';
        reportsWrap.innerHTML = reports.map((r) => `<p class="domain-mission-report">${escapeHtml(r)}</p>`).join('');
        el.appendChild(reportsWrap);
    }

    const awayIds = new Set(active.map((m) => m.officerNpcId));
    const available = (domain.officers || []).filter((o) => !awayIds.has(o.npcId));
    if (available.length > 0) {
        el.appendChild(buildDomainDispatchForm(available));
    }

    return el;
}

const DOMAIN_MISSION_KINDS = ['espionage', 'trade_run', 'survey', 'parley'];

function buildDomainDispatchForm(availableOfficers) {
    const form = document.createElement('div');
    form.className = 'domain-dispatch-form';

    const officerSelect = document.createElement('select');
    officerSelect.className = 'domain-dispatch-select';
    officerSelect.setAttribute('aria-label', T('webview.world.domainDispatchOfficer'));
    availableOfficers.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.npcId;
        opt.textContent = `${o.npcId} (${domainT('OfficerRole', o.role)})`;
        officerSelect.appendChild(opt);
    });

    const kindSelect = document.createElement('select');
    kindSelect.className = 'domain-dispatch-select';
    kindSelect.setAttribute('aria-label', T('webview.world.domainDispatchKind'));
    DOMAIN_MISSION_KINDS.forEach((kind) => {
        const opt = document.createElement('option');
        opt.value = kind;
        opt.textContent = domainT('MissionKind', kind);
        kindSelect.appendChild(opt);
    });

    const monthsSelect = document.createElement('select');
    monthsSelect.className = 'domain-dispatch-select';
    monthsSelect.setAttribute('aria-label', T('webview.world.domainDispatchMonths'));
    [1, 2, 3].forEach((n) => {
        const opt = document.createElement('option');
        opt.value = String(n);
        opt.textContent = T('webview.world.domainMissionMonthsLeft', { n });
        monthsSelect.appendChild(opt);
    });

    const dispatchBtn = document.createElement('button');
    dispatchBtn.type = 'button';
    dispatchBtn.className = 'small-btn domain-dispatch-btn';
    dispatchBtn.textContent = T('webview.world.domainDispatchBtn');
    dispatchBtn.addEventListener('click', () => {
        postWorldInsertChatText(T('webview.world.domainDispatchText', {
            officer: officerSelect.value,
            kind: domainT('MissionKind', kindSelect.value),
            months: monthsSelect.value,
        }));
    });

    form.appendChild(officerSelect);
    form.appendChild(kindSelect);
    form.appendChild(monthsSelect);
    form.appendChild(dispatchBtn);
    return form;
}

const DOMAIN_BATTLE_TACTICS = ['assault', 'hold', 'stratagem'];

function buildDomainBattleSection(domain) {
    const el = document.createElement('div');
    el.className = 'domain-battle-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainBattleTitle');
    el.appendChild(heading);

    const battle = domain.activeBattle;
    if (battle) {
        const name = escapeHtml(battle.opponentName || battle.opponentLabel || '');
        const progress = document.createElement('div');
        progress.className = 'domain-battle-progress';
        progress.innerHTML = `
            <p>${escapeHtml(T('webview.world.domainBattleRound', { round: battle.round, max: battle.maxRounds, name }))}</p>
            <div class="domain-battle-troops">
                <span>${escapeHtml(T('webview.world.domainBattleOurTroops', { n: battle.playerTroopsRemaining }))}</span>
                <span>${escapeHtml(T('webview.world.domainBattleEnemyTroops', { n: battle.enemyTroopsRemaining }))}</span>
            </div>
        `;
        el.appendChild(progress);

        const tacticsRow = document.createElement('div');
        tacticsRow.className = 'domain-battle-tactics';
        DOMAIN_BATTLE_TACTICS.forEach((tactic) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn domain-tactic-btn';
            btn.textContent = domainT('BattleTactic', tactic);
            btn.addEventListener('click', () => {
                postWorldInsertChatText(T('webview.world.domainBattleTacticText', {
                    tactic: domainT('BattleTactic', tactic),
                }));
            });
            tacticsRow.appendChild(btn);
        });
        el.appendChild(tacticsRow);
    } else if (domain.lastBattleReport) {
        const report = document.createElement('p');
        report.className = 'domain-battle-report';
        report.textContent = domain.lastBattleReport;
        el.appendChild(report);
    }

    return el;
}

function renderQuestHooks(quests) {
    const listEl = document.getElementById('world-quests-list');
    if (!listEl) return;

    if (!quests || quests.length === 0) {
        listEl.innerHTML = '<p class="empty-text">' + escapeHtml(T('webview.world.questEmpty')) + '</p>';
        return;
    }

    listEl.innerHTML = '';
    quests.forEach(q => {
        const item = document.createElement('div');
        item.className = 'quest-item status-' + escapeHtml(q.status);
        const sourceLabel = q.source === 'npc'
            ? T('webview.world.questSourceNpc')
            : q.source === 'campaign'
                ? T('webview.world.questSourceCampaign')
                : T('webview.world.questSourceEvent');
        
        let actionsHtml = '';
        if (q.status === 'available') {
            actionsHtml = '<button type="button" class="small-btn primary quest-accept-btn">' + escapeHtml(T('webview.world.questAccept')) + '</button>';
        } else if (q.status === 'active') {
            actionsHtml = `<span style="font-size:11px; color:var(--vscode-charts-orange); font-weight:600;">${escapeHtml(T('webview.world.questActive'))}</span>`;
        }

        const rewardHtml = q.reward
            ? `<div class="quest-reward">${escapeHtml(T('webview.world.questReward'))}: ${escapeHtml(q.reward)}</div>`
            : '';

        item.innerHTML = `
            <div class="quest-header">
                <span class="quest-title">${escapeHtml(q.title)}</span>
                <span class="quest-badge" style="border: 1px solid rgba(255,255,255,0.2)">${escapeHtml(sourceLabel)}</span>
            </div>
            <div class="quest-desc">${escapeHtml(q.description)}</div>
            ${rewardHtml}
            <div class="quest-actions">
                ${actionsHtml}
            </div>
        `;
        const acceptBtn = item.querySelector('.quest-accept-btn');
        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'acceptQuest', questId: q.id });
            });
        }
        listEl.appendChild(item);
    });
}

function buildEventExclusionControl(kind, eventId, isExcluded) {
    const label = document.createElement('label');
    label.className = 'domain-event-exclude-toggle';
    label.title = T('webview.world.excludeEventHint');
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isExcluded;
    cb.addEventListener('change', (e) => {
        vscode.postMessage({ type: 'excludeEvent', id: `${kind}:${eventId}`, excluded: e.target.checked });
    });
    
    const span = document.createElement('span');
    span.textContent = T('webview.world.excludeEventLabel');
    
    label.appendChild(cb);
    label.appendChild(span);
    return label;
}

function buildDomainEventsSection(domain, msg) {
    const el = document.createElement('div');
    el.className = 'domain-events-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.domainRecentEventsTitle');
    el.appendChild(heading);

    const eventIds = Array.isArray(domain.pendingEvents) && domain.pendingEvents.length > 0 
        ? domain.pendingEvents 
        : (domain.lastEventId ? [domain.lastEventId] : []);
        
    eventIds.forEach(id => {
        const row = document.createElement('div');
        row.className = 'domain-event-row';
        const name = document.createElement('span');
        name.textContent = domainT('Event', id) || id;
        
        const isExcluded = Array.isArray(msg.excludedEventIds) && msg.excludedEventIds.includes(`domain:${id}`);
        const toggle = buildEventExclusionControl('domain', id, isExcluded);
        
        row.appendChild(name);
        row.appendChild(toggle);
        el.appendChild(row);
    });
    return el;
}

function buildGuildEventsSection(guild, msg) {
    const el = document.createElement('div');
    el.className = 'domain-events-section';
    const heading = document.createElement('div');
    heading.className = 'domain-section-heading';
    heading.textContent = T('webview.world.guildRecentEventsTitle');
    el.appendChild(heading);

    const eventIds = Array.isArray(guild.pendingEvents) && guild.pendingEvents.length > 0 
        ? guild.pendingEvents 
        : (guild.lastEventId ? [guild.lastEventId] : []);
        
    eventIds.forEach(id => {
        const row = document.createElement('div');
        row.className = 'domain-event-row';
        const name = document.createElement('span');
        name.textContent = guildT('Event', id) || id;
        
        const isExcluded = Array.isArray(msg.excludedEventIds) && msg.excludedEventIds.includes(`guild:${id}`);
        const toggle = buildEventExclusionControl('guild', id, isExcluded);
        
        row.appendChild(name);
        row.appendChild(toggle);
        el.appendChild(row);
    });
    return el;
}

/* --- 85b1-logistics-layout.js --- */
// LOGISTICS-GRAPH-CANVAS-SLICE2 - pure deterministic regional layout.
// This module deliberately has no DOM, storage, clock, or random dependency.

const LOGISTICS_LAYOUT_ALGO = 'region-hybrid-1';
const LOGISTICS_LAYOUT_RANK_GAP_X = 260;
const LOGISTICS_LAYOUT_NODE_GAP_Y = 36;
const LOGISTICS_LAYOUT_REGION_PADDING = 28;
const LOGISTICS_LAYOUT_REGION_GAP = 120;

function logisticsLayoutCompareId(a, b) {
  const aa = String(a || '');
  const bb = String(b || '');
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsLayoutFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function logisticsLayoutNodeSize(node, routes) {
  const degree = routes.reduce((total, route) => total + (route.fromNodeId === node.id || route.toNodeId === node.id ? 1 : 0), 0);
  const tier = node.scale === 'major' || degree >= 4 ? 'major' : (node.scale === 'minor' || degree === 1 ? 'minor' : 'standard');
  return tier === 'major'
    ? { w: 184, h: 72, tier }
    : tier === 'minor'
      ? { w: 112, h: 44, tier }
      : { w: 152, h: 60, tier };
}

function logisticsLayoutValidRegionId(value) {
  return typeof value === 'string' && value.trim().length > 0 && value !== '__unassigned';
}

function logisticsLayoutManualEntry(manualPositions, id) {
  if (!manualPositions) { return null; }
  if (manualPositions instanceof Map) { return manualPositions.get(id) || null; }
  return manualPositions[id] || null;
}

function logisticsLayoutCanReach(adjacency, from, target) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop();
    if (id === target) { return true; }
    if (seen.has(id)) { continue; }
    seen.add(id);
    const next = adjacency.get(id) || [];
    for (let i = next.length - 1; i >= 0; i--) { stack.push(next[i]); }
  }
  return false;
}

function logisticsLayoutRegionLocal(memberNodes, routes) {
  const ids = memberNodes.map((node) => node.id).sort(logisticsLayoutCompareId);
  const byId = new Map(memberNodes.map((node) => [node.id, node]));
  const nodeIds = new Set(ids);
  const edges = routes
    .filter((route) => nodeIds.has(route.fromNodeId) && nodeIds.has(route.toNodeId) && route.fromNodeId !== route.toNodeId)
    .slice()
    .sort((a, b) => logisticsLayoutCompareId(a.fromNodeId, b.fromNodeId)
      || logisticsLayoutCompareId(a.toNodeId, b.toNodeId)
      || logisticsLayoutCompareId(a.id, b.id));
  const adjacency = new Map(ids.map((id) => [id, []]));
  const dag = [];
  const droppedRouteIds = [];
  for (const edge of edges) {
    if (logisticsLayoutCanReach(adjacency, edge.toNodeId, edge.fromNodeId)) {
      droppedRouteIds.push(edge.id);
      continue;
    }
    adjacency.get(edge.fromNodeId).push(edge.toNodeId);
    dag.push(edge);
  }
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of dag) { indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) || 0) + 1); }
  const ready = ids.filter((id) => indegree.get(id) === 0).sort(logisticsLayoutCompareId);
  const topo = [];
  while (ready.length) {
    const id = ready.shift();
    topo.push(id);
    for (const next of (adjacency.get(id) || []).slice().sort(logisticsLayoutCompareId)) {
      const value = (indegree.get(next) || 0) - 1;
      indegree.set(next, value);
      if (value === 0) {
        ready.push(next);
        ready.sort(logisticsLayoutCompareId);
      }
    }
  }
  const rank = new Map(ids.map((id) => [id, 0]));
  for (const id of topo) {
    for (const next of adjacency.get(id) || []) {
      rank.set(next, Math.max(rank.get(next) || 0, (rank.get(id) || 0) + 1));
    }
  }
  const ranks = new Map();
  for (const id of ids) {
    const key = rank.get(id) || 0;
    if (!ranks.has(key)) { ranks.set(key, []); }
    ranks.get(key).push(id);
  }
  [...ranks.values()].forEach((list) => list.sort(logisticsLayoutCompareId));
  const incoming = new Map(ids.map((id) => [id, []]));
  const outgoing = new Map(ids.map((id) => [id, []]));
  for (const edge of dag) {
    incoming.get(edge.toNodeId).push(edge.fromNodeId);
    outgoing.get(edge.fromNodeId).push(edge.toNodeId);
  }
  const orderedRanks = [...ranks.keys()].sort((a, b) => a - b);
  const order = new Map();
  function refreshOrder() {
    for (const r of orderedRanks) { (ranks.get(r) || []).forEach((id, index) => order.set(id, index)); }
  }
  function sweep(direction) {
    refreshOrder();
    const targetRanks = direction === 'down' ? orderedRanks : orderedRanks.slice().reverse();
    for (const r of targetRanks) {
      const list = ranks.get(r) || [];
      list.sort((a, b) => {
        const aNeighbors = (direction === 'down' ? incoming.get(a) : outgoing.get(a)) || [];
        const bNeighbors = (direction === 'down' ? incoming.get(b) : outgoing.get(b)) || [];
        const aValues = aNeighbors.filter((id) => (rank.get(id) || 0) !== r).map((id) => order.get(id));
        const bValues = bNeighbors.filter((id) => (rank.get(id) || 0) !== r).map((id) => order.get(id));
        const aBary = aValues.length ? aValues.reduce((sum, value) => sum + value, 0) / aValues.length : order.get(a);
        const bBary = bValues.length ? bValues.reduce((sum, value) => sum + value, 0) / bValues.length : order.get(b);
        return aBary - bBary || logisticsLayoutCompareId(a, b);
      });
      refreshOrder();
    }
  }
  // Exactly four fixed sweeps: no convergence check, no early exit.
  sweep('down'); sweep('up'); sweep('down'); sweep('up');
  const size = new Map(ids.map((id) => [id, logisticsLayoutNodeSize(byId.get(id), routes)]));
  let maxStack = 0;
  const stackHeights = new Map();
  for (const r of orderedRanks) {
    const list = ranks.get(r) || [];
    const height = list.reduce((sum, id, index) => sum + size.get(id).h + (index ? LOGISTICS_LAYOUT_NODE_GAP_Y : 0), 0);
    stackHeights.set(r, height);
    maxStack = Math.max(maxStack, height);
  }
  const positions = new Map();
  for (const r of orderedRanks) {
    const list = ranks.get(r) || [];
    let y = (maxStack - (stackHeights.get(r) || 0)) / 2;
    for (const id of list) {
      const box = size.get(id);
      positions.set(id, { x: r * LOGISTICS_LAYOUT_RANK_GAP_X + box.w / 2, y: y + box.h / 2, ...box, rank: r, manual: false });
      y += box.h + LOGISTICS_LAYOUT_NODE_GAP_Y;
    }
  }
  const maxRank = orderedRanks.length ? Math.max(...orderedRanks) : 0;
  return {
    positions,
    width: maxRank * LOGISTICS_LAYOUT_RANK_GAP_X + Math.max(...ids.map((id) => size.get(id).w), 0),
    height: maxStack,
    droppedRouteIds,
    sweeps: 4,
  };
}

function computeLogisticsLayout(nodes, routes, options = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes.filter((node) => node && typeof node.id === 'string' && node.id) : [];
  const safeRoutes = Array.isArray(routes) ? routes.filter((route) => route && typeof route.fromNodeId === 'string' && typeof route.toNodeId === 'string') : [];
  const ids = new Set();
  const uniqueNodes = safeNodes.filter((node) => !ids.has(node.id) && ids.add(node.id)).slice().sort((a, b) => logisticsLayoutCompareId(a.id, b.id));
  const populatedRegionIds = new Set(uniqueNodes.filter((node) => node.kind !== 'region' && logisticsLayoutValidRegionId(node.regionId)).map((node) => node.regionId));
  const regionIdentity = new Map();
  for (const node of uniqueNodes) {
    if (node.kind === 'region' && populatedRegionIds.has(node.id) && !regionIdentity.has(node.id)) {
      regionIdentity.set(node.id, node);
    }
  }
  const buckets = new Map([...populatedRegionIds].sort(logisticsLayoutCompareId).map((id) => [id, []]));
  buckets.set('__unassigned', []);
  for (const node of uniqueNodes) {
    if (node.kind === 'region' && regionIdentity.get(node.id) === node) { continue; }
    const regionId = node.kind !== 'region' && logisticsLayoutValidRegionId(node.regionId) ? node.regionId : '__unassigned';
    buckets.get(regionId).push(node);
  }
  const regions = new Map();
  const local = new Map();
  for (const [regionId, members] of [...buckets.entries()].sort((a, b) => logisticsLayoutCompareId(a[0], b[0]))) {
    if (!members.length) { continue; }
    local.set(regionId, logisticsLayoutRegionLocal(members, safeRoutes));
  }
  const visibleRegionIds = [...local.keys()].filter((id) => id !== '__unassigned').sort(logisticsLayoutCompareId);
  const nodeById = new Map(uniqueNodes.map((node) => [node.id, node]));
  // Region ordering is topology-only. Flow metrics must never move a graph.
  const interRegionRouteCount = new Map(visibleRegionIds.map((id) => [id, 0]));
  for (const route of safeRoutes) {
    const from = nodeById.get(route.fromNodeId);
    const to = nodeById.get(route.toNodeId);
    const fromRegion = from && from.kind !== 'region' && logisticsLayoutValidRegionId(from.regionId) ? from.regionId : '__unassigned';
    const toRegion = to && to.kind !== 'region' && logisticsLayoutValidRegionId(to.regionId) ? to.regionId : '__unassigned';
    if (fromRegion === toRegion || fromRegion === '__unassigned' || toRegion === '__unassigned') { continue; }
    interRegionRouteCount.set(fromRegion, (interRegionRouteCount.get(fromRegion) || 0) + 1);
    interRegionRouteCount.set(toRegion, (interRegionRouteCount.get(toRegion) || 0) + 1);
  }
  const placementOrder = visibleRegionIds.slice().sort((a, b) => (interRegionRouteCount.get(b) || 0) - (interRegionRouteCount.get(a) || 0)
    || (buckets.get(b)?.length || 0) - (buckets.get(a)?.length || 0) || logisticsLayoutCompareId(a, b));
  const columns = Math.max(1, Math.ceil(Math.sqrt(placementOrder.length)));
  const regionOffset = new Map();
  let cursorX = 0; let cursorY = 0; let rowHeight = 0;
  placementOrder.forEach((id, index) => {
    if (index > 0 && index % columns === 0) { cursorX = 0; cursorY += rowHeight + LOGISTICS_LAYOUT_REGION_GAP; rowHeight = 0; }
    const result = local.get(id);
    const w = result.width + LOGISTICS_LAYOUT_REGION_PADDING * 2;
    const h = result.height + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24;
    regionOffset.set(id, { x: cursorX, y: cursorY });
    cursorX += w + LOGISTICS_LAYOUT_REGION_GAP;
    rowHeight = Math.max(rowHeight, h);
  });
  const unassignedOffset = { x: 0, y: cursorY + rowHeight + LOGISTICS_LAYOUT_REGION_GAP };
  const positions = new Map();
  const manualPositions = options.manualPositions || options.positions || null;
  const droppedManualIds = [];
  const wrongRegionManualIds = [];
  for (const [regionId, result] of local) {
    const offset = regionOffset.get(regionId) || (regionId === '__unassigned' ? unassignedOffset : { x: 0, y: 0 });
    const members = buckets.get(regionId) || [];
    for (const node of members) {
      const value = result.positions.get(node.id);
      const stored = logisticsLayoutManualEntry(manualPositions, node.id);
      const validStored = stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)
        && Math.abs(stored.x) <= 50000 && Math.abs(stored.y) <= 50000
        && stored.regionId === regionId;
      if (stored && !validStored) {
        droppedManualIds.push(node.id);
        if (stored.regionId !== regionId) { wrongRegionManualIds.push(node.id); }
      }
      // Region-local storage (space === 'local'): world = pack offset + local.
      // Legacy absolute world entries omit space / use space === 'world'.
      const pad = LOGISTICS_LAYOUT_REGION_PADDING;
      let worldX = value.x + offset.x + pad;
      let worldY = value.y + offset.y + pad;
      if (validStored) {
        if (stored.space === 'local') {
          worldX = stored.x + offset.x;
          worldY = stored.y + offset.y;
        } else {
          worldX = stored.x;
          worldY = stored.y;
        }
      }
      positions.set(node.id, {
        ...value,
        x: worldX,
        y: worldY,
        regionId,
        manual: Boolean(validStored),
      });
    }
    if (regionId !== '__unassigned') {
      const identity = regionIdentity.get(regionId);
      regions.set(regionId, {
        x: offset.x,
        y: offset.y,
        w: result.width + LOGISTICS_LAYOUT_REGION_PADDING * 2,
        h: result.height + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24,
        label: identity?.label || regionId,
        memberIds: members.map((node) => node.id).sort(logisticsLayoutCompareId),
        collapsed: Boolean(options.collapsedRegionIds && (options.collapsedRegionIds instanceof Set ? options.collapsedRegionIds.has(regionId) : options.collapsedRegionIds.includes(regionId))),
      });
    }
  }
  // Pure-layout invariant (independent of the UI drag clamp): a manual node of
  // region A must never occupy another populated region's packed container.
  // Empty space outside A is allowed (region A may later expand into free
  // space); intrusion into B is projected back into A's valid interior.
  // Input manual objects are never mutated — only layout output coordinates.
  const crossRegionManualIds = [];
  function logisticsLayoutNodeIntersectsRegion(pos, region) {
    if (!pos || !region) { return false; }
    const left = pos.x - pos.w / 2;
    const right = pos.x + pos.w / 2;
    const top = pos.y - pos.h / 2;
    const bottom = pos.y + pos.h / 2;
    return right > region.x && left < region.x + region.w
      && bottom > region.y && top < region.y + region.h;
  }
  function logisticsLayoutClampManualToRegionInterior(pos, region) {
    const pad = LOGISTICS_LAYOUT_REGION_PADDING;
    const title = 24;
    const halfW = (Number.isFinite(pos.w) ? pos.w : 152) / 2;
    const halfH = (Number.isFinite(pos.h) ? pos.h : 60) / 2;
    const minX = region.x + pad + halfW;
    const maxX = region.x + region.w - pad - halfW;
    const minY = region.y + pad + title + halfH;
    const maxY = region.y + region.h - pad - halfH;
    pos.x = minX <= maxX
      ? Math.min(maxX, Math.max(minX, pos.x))
      : region.x + region.w / 2;
    pos.y = minY <= maxY
      ? Math.min(maxY, Math.max(minY, pos.y))
      : region.y + region.h / 2;
  }
  // Deterministic order: id ascending. Only populated-region manuals are checked
  // against other populated packed boxes (__unassigned is not a container).
  for (const id of [...positions.keys()].sort(logisticsLayoutCompareId)) {
    const pos = positions.get(id);
    if (!pos || !pos.manual || pos.regionId === '__unassigned') { continue; }
    const own = regions.get(pos.regionId);
    if (!own) { continue; }
    let crosses = false;
    for (const [otherId, other] of regions) {
      if (otherId === pos.regionId) { continue; }
      if (logisticsLayoutNodeIntersectsRegion(pos, other)) {
        crosses = true;
        break;
      }
    }
    if (!crosses) { continue; }
    crossRegionManualIds.push(id);
    logisticsLayoutClampManualToRegionInterior(pos, own);
  }
  // Manual nodes are fixed obstacles: place them at (corrected) coordinates
  // first, never mutate them during collision resolution. Collision is strictly
  // region-local so a drag in region A cannot displace region B members.
  const manuals = [...positions.entries()].filter(([, pos]) => pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  const automatics = [...positions.entries()].filter(([, pos]) => !pos.manual).sort((a, b) => logisticsLayoutCompareId(a[0], b[0]));
  function overlaps(a, b) {
    return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  }
  function sameRegion(a, b) {
    return a.regionId === b.regionId;
  }
  const finalized = [];
  const overflowPlacedIds = [];
  const unresolvedOverlapIds = [];
  // 1) Place every valid manual node exactly; overlapping manuals keep both
  // stored coordinates and surface an honest diagnostic (no silent move).
  for (const [id, manual] of manuals) {
    if (finalized.some((other) => sameRegion(manual, other) && overlaps(manual, other))) {
      unresolvedOverlapIds.push(id);
    }
    finalized.push(manual);
  }
  // 2–3) Resolve automatic nodes around the fixed-obstacle set, per region only.
  for (const [id, automatic] of automatics) {
    const startX = automatic.x;
    const startY = automatic.y;
    let clear = !finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other));
    if (!clear) {
      for (let attempt = 0; attempt < 8; attempt++) {
        automatic.y += LOGISTICS_LAYOUT_NODE_GAP_Y;
        if (!finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other))) {
          clear = true;
          break;
        }
      }
    }
    if (!clear) {
      // Bounded overflow lane inside this region only.
      automatic.x = startX;
      automatic.y = startY;
      for (let lane = 1; lane <= 8 && !clear; lane++) {
        automatic.x = startX + lane * (automatic.w + LOGISTICS_LAYOUT_NODE_GAP_Y);
        automatic.y = startY;
        if (!finalized.some((other) => sameRegion(automatic, other) && overlaps(automatic, other))) {
          clear = true;
        }
      }
      if (clear) {
        overflowPlacedIds.push(id);
      } else {
        // Exhausted bounded attempts: restore start pose, keep deterministic
        // output, and report unresolved overlap honestly (do not claim success).
        automatic.x = startX;
        automatic.y = startY;
        unresolvedOverlapIds.push(id);
      }
    }
    finalized.push(automatic);
  }
  // Final containers are derived from final member boxes (including manuals).
  // Expansion may grow a region to contain its members, but region packing
  // offsets of unrelated regions are never recomputed — only this region's
  // measured box changes — so other regions remain byte-identical.
  for (const [regionId, region] of regions) {
    const members = region.memberIds.map((id) => positions.get(id)).filter(Boolean);
    if (!members.length) { continue; }
    const minX = Math.min(...members.map((pos) => pos.x - pos.w / 2));
    const minY = Math.min(...members.map((pos) => pos.y - pos.h / 2));
    const maxX = Math.max(...members.map((pos) => pos.x + pos.w / 2));
    const maxY = Math.max(...members.map((pos) => pos.y + pos.h / 2));
    region.x = minX - LOGISTICS_LAYOUT_REGION_PADDING;
    region.y = minY - LOGISTICS_LAYOUT_REGION_PADDING - 24;
    region.w = maxX - minX + LOGISTICS_LAYOUT_REGION_PADDING * 2;
    region.h = maxY - minY + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24;
  }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x - pos.w / 2); minY = Math.min(minY, pos.y - pos.h / 2);
    maxX = Math.max(maxX, pos.x + pos.w / 2); maxY = Math.max(maxY, pos.y + pos.h / 2);
  }
  for (const region of regions.values()) {
    minX = Math.min(minX, region.x); minY = Math.min(minY, region.y);
    maxX = Math.max(maxX, region.x + region.w); maxY = Math.max(maxY, region.y + region.h);
  }
  return {
    nodes: positions,
    // Compatibility alias for the existing camera helper; both references are
    // the same read-only-by-convention Map.
    positions,
    regions,
    bounds: positions.size || regions.size ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    algo: LOGISTICS_LAYOUT_ALGO,
    diagnostics: {
      sweeps: 4,
      droppedManualIds: droppedManualIds.sort(logisticsLayoutCompareId),
      wrongRegionManualIds: wrongRegionManualIds.sort(logisticsLayoutCompareId),
      // Manuals whose stored world/local position intersected another populated
      // region's packed container and were projected back into the owner interior.
      // Distinct from wrongRegionManualIds (stored.regionId mismatch / dropped).
      crossRegionManualIds: crossRegionManualIds.sort(logisticsLayoutCompareId),
      overflowPlacedIds: overflowPlacedIds.sort(logisticsLayoutCompareId),
      // Honest residual overlaps after bounded Y/lane attempts (manual-manual
      // or automatic exhaustion). Prefer reporting over silently moving manuals.
      unresolvedOverlapIds: unresolvedOverlapIds.sort(logisticsLayoutCompareId),
      cycleBreaks: [...local.values()].flatMap((item) => item.droppedRouteIds).sort(logisticsLayoutCompareId),
    },
  };
}

/* --- 85b2-logistics-route-geometry.js --- */
// LOGISTICS-GRAPH-CANVAS-SLICE3 - pure, deterministic, obstacle-aware route
// geometry. See docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md SS6.
//
// This module has no DOM, no localStorage, no camera state, no clock, and no
// randomness. It never mutates its inputs. Everything a consumer needs
// (visible stroke, hit path, arrowhead orientation, particle <mpath> target,
// label anchor, warning anchor, bounds) comes from the one geometry object
// this module returns per route.
//
// Bounded candidate policy: direct/lane, above/below/left/right of the union
// envelope of direct blockers, one deterministic graph-envelope outer
// corridor, then a finite honestly-conflicted fallback. Every candidate is
// checked against every unrelated inflated node box.
//   - Path bounds are the convex hull of {start, c1, c2, end} per segment,
//     which contains a cubic Bezier exactly (hull property) rather than a
//     bound derived only from sampled points.
//   - Label/route collapse-control avoidance is scoped to node boxes and
//     already-placed labels; region-collapse-control boxes are not threaded
//     into this pure module in this slice (their bounds live in the DOM
//     render step), so that specific avoidance is a no-op here.

const LOGISTICS_GEOM_LANE_GAP = 14;
const LOGISTICS_GEOM_OBSTACLE_INFLATE = 14;
const LOGISTICS_GEOM_DETOUR_STEP = 28;
const LOGISTICS_GEOM_SAMPLE_COUNT = 24;
const LOGISTICS_GEOM_LABEL_MIN_GAP = 44;
const LOGISTICS_GEOM_LABEL_NODE_GAP = 12;
const LOGISTICS_GEOM_LABEL_CANDIDATES = [0.5, 0.35, 0.65, 0.28, 0.72, 0.2, 0.8];
const LOGISTICS_GEOM_ENVELOPE_CLEARANCE = 28;
const LOGISTICS_GEOM_PAIR_SEPARATOR = '\u001f';

function logisticsGeomCompareId(a, b) {
  const aa = String(a == null ? '' : a);
  const bb = String(b == null ? '' : b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsGeomFinite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function logisticsGeomFiniteBox(box) {
  return Boolean(box)
    && Number.isFinite(box.x) && Number.isFinite(box.y)
    && Number.isFinite(box.w) && Number.isFinite(box.h)
    && box.w > 0 && box.h > 0;
}

/** 12 deterministic ports on a node's boundary: 3 per side at 25/50/75%. */
function logisticsGeomTwelvePorts(box) {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const offsetsW = [-0.25 * box.w, 0, 0.25 * box.w];
  const offsetsH = [-0.25 * box.h, 0, 0.25 * box.h];
  const ports = [];
  offsetsW.forEach((off, i) => ports.push({ side: 'top', slot: i, x: box.x + off, y: box.y - halfH }));
  offsetsH.forEach((off, i) => ports.push({ side: 'right', slot: i, x: box.x + halfW, y: box.y + off }));
  offsetsW.forEach((off, i) => ports.push({ side: 'bottom', slot: i, x: box.x + off, y: box.y + halfH }));
  offsetsH.forEach((off, i) => ports.push({ side: 'left', slot: i, x: box.x - halfW, y: box.y + off }));
  return ports;
}

/** Which side of `box` the ray from its centre toward (otherX, otherY) exits through. */
function logisticsGeomExitSide(box, otherX, otherY) {
  const dx = otherX - box.x;
  const dy = otherY - box.y;
  if (dx === 0 && dy === 0) { return 'right'; }
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const tx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  if (tx <= ty) { return dx >= 0 ? 'right' : 'left'; }
  return dy >= 0 ? 'bottom' : 'top';
}

function logisticsGeomPortsBySide(box) {
  const bySide = new Map([['top', []], ['right', []], ['bottom', []], ['left', []]]);
  for (const port of logisticsGeomTwelvePorts(box)) { bySide.get(port.side).push(port); }
  for (const list of bySide.values()) { list.sort((a, b) => a.slot - b.slot); }
  return bySide;
}

/**
 * Deterministic port assignment for every route endpoint.
 * Returns Map<nodeId, Map<routeId, {port, exitPort}>> keyed by which end
 * (source/target) the route touches that node from.
 */
function logisticsGeomAssignPorts(routes, positions) {
  // exits[nodeId][side] = [{routeId, end, angle}]
  const exits = new Map();
  function pushExit(nodeId, side, entry) {
    if (!exits.has(nodeId)) { exits.set(nodeId, new Map()); }
    const bySide = exits.get(nodeId);
    if (!bySide.has(side)) { bySide.set(side, []); }
    bySide.get(side).push(entry);
  }
  const sideChoice = new Map(); // `${routeId}:${end}` -> side
  for (const route of routes) {
    const fromBox = positions.get(route.fromNodeId);
    const toBox = positions.get(route.toNodeId);
    if (!logisticsGeomFiniteBox(fromBox) || !logisticsGeomFiniteBox(toBox)) { continue; }
    const fromSide = logisticsGeomExitSide(fromBox, toBox.x, toBox.y);
    const toSide = logisticsGeomExitSide(toBox, fromBox.x, fromBox.y);
    sideChoice.set(`${route.id}:from`, fromSide);
    sideChoice.set(`${route.id}:to`, toSide);
    const angleFrom = Math.atan2(toBox.y - fromBox.y, toBox.x - fromBox.x);
    const angleTo = Math.atan2(fromBox.y - toBox.y, fromBox.x - toBox.x);
    pushExit(route.fromNodeId, fromSide, { routeId: route.id, end: 'from', angle: angleFrom, dirRank: 0 });
    pushExit(route.toNodeId, toSide, { routeId: route.id, end: 'to', angle: angleTo, dirRank: 1 });
  }
  const slotOf = new Map(); // `${nodeId}:${side}:${routeId}:${end}` -> slot index (0..2)
  for (const [nodeId, bySide] of exits) {
    for (const [side, list] of bySide) {
      const ordered = list.slice().sort((a, b) => (a.angle - b.angle) || (a.dirRank - b.dirRank) || logisticsGeomCompareId(a.routeId, b.routeId));
      ordered.forEach((entry, index) => {
        slotOf.set(`${nodeId}:${side}:${entry.routeId}:${entry.end}`, index % 3);
      });
    }
  }
  const portTableCache = new Map();
  function portsForBox(nodeId, box) {
    if (!portTableCache.has(nodeId)) { portTableCache.set(nodeId, logisticsGeomPortsBySide(box)); }
    return portTableCache.get(nodeId);
  }
  const result = new Map(); // routeId -> { sourcePort, targetPort }
  for (const route of routes) {
    const fromBox = positions.get(route.fromNodeId);
    const toBox = positions.get(route.toNodeId);
    if (!logisticsGeomFiniteBox(fromBox) || !logisticsGeomFiniteBox(toBox)) { continue; }
    const fromSide = sideChoice.get(`${route.id}:from`);
    const toSide = sideChoice.get(`${route.id}:to`);
    const fromSlot = slotOf.get(`${route.fromNodeId}:${fromSide}:${route.id}:from`) || 0;
    const toSlot = slotOf.get(`${route.toNodeId}:${toSide}:${route.id}:to`) || 0;
    const fromPorts = portsForBox(route.fromNodeId, fromBox).get(fromSide);
    const toPorts = portsForBox(route.toNodeId, toBox).get(toSide);
    result.set(route.id, {
      sourcePort: { ...fromPorts[fromSlot], nodeId: route.fromNodeId },
      targetPort: { ...toPorts[toSlot], nodeId: route.toNodeId },
    });
  }
  return result;
}

/** Deterministic centred lane index per unordered node pair, forward before reverse. */
function logisticsGeomAssignLanes(routes) {
  const groups = new Map(); // pairKey -> [{routeId, dirRank}]
  for (const route of routes) {
    const ids = [route.fromNodeId, route.toNodeId].sort(logisticsGeomCompareId);
    const pairKey = ids.join('\u001f');
    const dirRank = route.fromNodeId === ids[0] ? 0 : 1;
    if (!groups.has(pairKey)) { groups.set(pairKey, []); }
    groups.get(pairKey).push({ routeId: route.id, dirRank });
  }
  const laneOf = new Map();
  for (const list of groups.values()) {
    const ordered = list.slice().sort((a, b) => (a.dirRank - b.dirRank) || logisticsGeomCompareId(a.routeId, b.routeId));
    const n = ordered.length;
    ordered.forEach((entry, index) => {
      laneOf.set(entry.routeId, index - (n - 1) / 2);
    });
  }
  return laneOf;
}

/** Stable topology-only metadata reused by full renders and pointer moves. */
function buildLogisticsRouteTopologyIndex(routes) {
  const routesById = new Map();
  for (const route of Array.isArray(routes) ? routes : []) {
    if (!route || typeof route.id !== 'string' || typeof route.fromNodeId !== 'string' || typeof route.toNodeId !== 'string'
      || route.fromNodeId === route.toNodeId || routesById.has(route.id)) { continue; }
    routesById.set(route.id, { id: route.id, fromNodeId: route.fromNodeId, toNodeId: route.toNodeId });
  }
  const sortedRouteIds = [...routesById.keys()].sort(logisticsGeomCompareId);
  const byNodeId = new Map();
  const byUnorderedEndpointPair = new Map();
  const pairKeyByRouteId = new Map();
  for (const routeId of sortedRouteIds) {
    const route = routesById.get(routeId);
    for (const nodeId of [route.fromNodeId, route.toNodeId]) {
      if (!byNodeId.has(nodeId)) { byNodeId.set(nodeId, []); }
      byNodeId.get(nodeId).push(routeId);
    }
    const endpoints = [route.fromNodeId, route.toNodeId].sort(logisticsGeomCompareId);
    const pairKey = endpoints.join(LOGISTICS_GEOM_PAIR_SEPARATOR);
    pairKeyByRouteId.set(routeId, pairKey);
    if (!byUnorderedEndpointPair.has(pairKey)) { byUnorderedEndpointPair.set(pairKey, []); }
    byUnorderedEndpointPair.get(pairKey).push(routeId);
  }
  for (const ids of byNodeId.values()) { ids.sort(logisticsGeomCompareId); }
  const laneAllocationMetadata = new Map();
  for (const [pairKey, ids] of byUnorderedEndpointPair) {
    const endpoints = pairKey.split(LOGISTICS_GEOM_PAIR_SEPARATOR);
    ids.sort((a, b) => {
      const routeA = routesById.get(a); const routeB = routesById.get(b);
      const dirA = routeA.fromNodeId === endpoints[0] ? 0 : 1;
      const dirB = routeB.fromNodeId === endpoints[0] ? 0 : 1;
      return dirA - dirB || logisticsGeomCompareId(a, b);
    });
    ids.forEach((routeId, rank) => laneAllocationMetadata.set(routeId, {
      pairKey, rank, count: ids.length, laneIndex: rank - (ids.length - 1) / 2,
    }));
  }
  return {
    routesById,
    byNodeId,
    byUnorderedEndpointPair,
    pairKeyByRouteId,
    sortedRouteIds,
    portAllocationMetadata: byNodeId,
    laneAllocationMetadata,
  };
}

/** Routes whose factual source or destination is `nodeId`.
 *
 * A live drag is deliberately endpoint-bounded: port assignment still orders
 * each endpoint against the stable global topology, but no route without the
 * moved node as an endpoint is recomputed or has its DOM/particles touched. */
function logisticsAffectedRouteIdsForNode(nodeId, topologyIndex) {
  return [...(topologyIndex?.byNodeId?.get(nodeId) || [])].sort(logisticsGeomCompareId);
}

/** Assign ports only for requested routes, while ordering each endpoint against
 * every incident route from the stable global topology index. */
function logisticsGeomAssignPortsForRouteIds(topologyIndex, positions, routeIds) {
  const requested = new Set(routeIds);
  const relevantNodes = new Set();
  for (const routeId of routeIds) {
    const route = topologyIndex.routesById.get(routeId);
    if (route) { relevantNodes.add(route.fromNodeId); relevantNodes.add(route.toNodeId); }
  }
  const endpointPorts = new Map();
  for (const nodeId of [...relevantNodes].sort(logisticsGeomCompareId)) {
    const nodeBox = positions.get(nodeId);
    if (!logisticsGeomFiniteBox(nodeBox)) { continue; }
    const bySide = new Map([['top', []], ['right', []], ['bottom', []], ['left', []]]);
    for (const routeId of topologyIndex.byNodeId.get(nodeId) || []) {
      const route = topologyIndex.routesById.get(routeId);
      const end = route.fromNodeId === nodeId ? 'from' : 'to';
      const otherId = end === 'from' ? route.toNodeId : route.fromNodeId;
      const otherBox = positions.get(otherId);
      if (!logisticsGeomFiniteBox(otherBox)) { continue; }
      const side = logisticsGeomExitSide(nodeBox, otherBox.x, otherBox.y);
      bySide.get(side).push({
        routeId, end, side,
        angle: Math.atan2(otherBox.y - nodeBox.y, otherBox.x - nodeBox.x),
        dirRank: end === 'from' ? 0 : 1,
      });
    }
    const portsBySide = logisticsGeomPortsBySide(nodeBox);
    for (const [side, entries] of bySide) {
      entries.sort((a, b) => a.angle - b.angle || a.dirRank - b.dirRank || logisticsGeomCompareId(a.routeId, b.routeId));
      entries.forEach((entry, index) => {
        if (!requested.has(entry.routeId)) { return; }
        const slot = index % 3;
        endpointPorts.set(`${entry.routeId}:${entry.end}`, { ...portsBySide.get(side)[slot], nodeId });
      });
    }
  }
  const result = new Map();
  for (const routeId of routeIds) {
    const sourcePort = endpointPorts.get(`${routeId}:from`);
    const targetPort = endpointPorts.get(`${routeId}:to`);
    if (sourcePort && targetPort) { result.set(routeId, { sourcePort, targetPort }); }
  }
  return result;
}

function logisticsGeomPerpendicularUnit(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  // Rotate the direction vector 90 degrees.
  return { x: -dy / len, y: dx / len };
}

function logisticsGeomCubicPoint(start, c1, c2, end, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
    y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
  };
}

function logisticsGeomCubicTangent(start, c1, c2, end, t) {
  const u = 1 - t;
  const dx = 3 * u ** 2 * (c1.x - start.x) + 6 * u * t * (c2.x - c1.x) + 3 * t ** 2 * (end.x - c2.x);
  const dy = 3 * u ** 2 * (c1.y - start.y) + 6 * u * t * (c2.y - c1.y) + 3 * t ** 2 * (end.y - c2.y);
  return Math.atan2(dy, dx);
}

function logisticsGeomSampleCubic(start, c1, c2, end, count) {
  const points = [];
  for (let i = 0; i <= count; i++) { points.push(logisticsGeomCubicPoint(start, c1, c2, end, i / count)); }
  return points;
}

function logisticsGeomPointInBox(point, box) {
  return point.x >= box.x - box.w / 2 && point.x <= box.x + box.w / 2
    && point.y >= box.y - box.h / 2 && point.y <= box.y + box.h / 2;
}

function logisticsGeomInflatedObstacles(positions, excludeIds, inflate) {
  const obstacles = [];
  for (const [id, box] of positions) {
    if (excludeIds.has(id) || !logisticsGeomFiniteBox(box)) { continue; }
    obstacles.push({ id, x: box.x, y: box.y, w: box.w + inflate * 2, h: box.h + inflate * 2 });
  }
  return obstacles.sort((a, b) => logisticsGeomCompareId(a.id, b.id));
}

function logisticsGeomFirstCollision(points, obstacles) {
  for (const obstacle of obstacles) {
    for (const point of points) {
      if (logisticsGeomPointInBox(point, obstacle)) { return obstacle; }
    }
  }
  return null;
}

function logisticsGeomCollisionIdsForSegments(segments, obstacles) {
  const hitIds = [];
  for (const obstacle of obstacles) {
    let hit = false;
    for (const segment of segments) {
      const points = logisticsGeomSampleCubic(segment.start, segment.c1, segment.c2, segment.end, LOGISTICS_GEOM_SAMPLE_COUNT);
      if (points.some((point) => logisticsGeomPointInBox(point, obstacle))) { hit = true; break; }
    }
    if (hit) { hitIds.push(obstacle.id); }
  }
  return hitIds.sort(logisticsGeomCompareId);
}

function logisticsGeomObstacleEnvelope(obstacles) {
  if (!obstacles.length) { return null; }
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const obstacle of obstacles) {
    minX = Math.min(minX, obstacle.x - obstacle.w / 2);
    minY = Math.min(minY, obstacle.y - obstacle.h / 2);
    maxX = Math.max(maxX, obstacle.x + obstacle.w / 2);
    maxY = Math.max(maxY, obstacle.y + obstacle.h / 2);
  }
  return { minX, minY, maxX, maxY };
}

function logisticsGeomLinearSegment(start, end) {
  return {
    start,
    c1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
    c2: { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 },
    end,
  };
}

function logisticsGeomSegmentsThrough(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].x === points[i].x && points[i - 1].y === points[i].y) { continue; }
    segments.push(logisticsGeomLinearSegment(points[i - 1], points[i]));
  }
  return segments;
}

function logisticsGeomPortStub(port, distance) {
  const delta = port.side === 'top' ? { x: 0, y: -distance }
    : port.side === 'right' ? { x: distance, y: 0 }
      : port.side === 'bottom' ? { x: 0, y: distance }
        : { x: -distance, y: 0 };
  return { x: port.x + delta.x, y: port.y + delta.y };
}

function logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor) {
  const sourceStub = logisticsGeomPortStub(sourcePort, LOGISTICS_GEOM_ENVELOPE_CLEARANCE);
  const targetStub = logisticsGeomPortStub(targetPort, LOGISTICS_GEOM_ENVELOPE_CLEARANCE);
  const middle = side === 'above' || side === 'below'
    ? [{ x: sourceStub.x, y: corridor }, { x: targetStub.x, y: corridor }]
    : [{ x: corridor, y: sourceStub.y }, { x: corridor, y: targetStub.y }];
  return logisticsGeomSegmentsThrough([start, sourceStub, ...middle, targetStub, end]);
}

function logisticsGeomHullBounds(points) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function logisticsGeomMergeBounds(a, b) {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Builds one cubic segment's d-fragment plus its point/tangent samplers.
 * A "segment" is {start, c1, c2, end}; several are concatenated for a detour.
 */
function logisticsGeomSegmentD(segment, isFirst) {
  const move = isFirst ? `M ${segment.start.x},${segment.start.y} ` : '';
  return `${move}C ${segment.c1.x},${segment.c1.y} ${segment.c2.x},${segment.c2.y} ${segment.end.x},${segment.end.y}`;
}

/** Legacy private helper, not invoked by the public API; production calls
 * logisticsGeomComputeEnvelopeRoute below. */
function logisticsGeomComputeOne(route, sourcePort, targetPort, lane, obstacles) {
  const start = { x: sourcePort.x, y: sourcePort.y };
  const end = { x: targetPort.x, y: targetPort.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const [ux, uy] = [logisticsGeomPerpendicularUnit(start, end).x, logisticsGeomPerpendicularUnit(start, end).y];
  const laneOffset = lane * LOGISTICS_GEOM_LANE_GAP;
  function candidateSegments(extraPush) {
    const push = laneOffset + extraPush;
    const c1 = { x: start.x + dx * 0.36 + ux * push, y: start.y + dy * 0.36 + uy * push };
    const c2 = { x: end.x - dx * 0.36 + ux * push, y: end.y - dy * 0.36 + uy * push };
    return [{ start, c1, c2, end }];
  }
  const obstacleIds = new Set();
  let chosen = null;
  let detourKind = 'direct';
  let conflicted = false;
  // Attempt 0: direct + lane offset. Attempts 1-3: push further perpendicular,
  // away from whichever obstacle was hit, by DETOUR_STEP * attempt.
  let pushSign = 1;
  for (let attempt = 0; attempt <= 3; attempt++) {
    const segments = candidateSegments(attempt === 0 ? 0 : pushSign * LOGISTICS_GEOM_DETOUR_STEP * attempt);
    const points = logisticsGeomSampleCubic(segments[0].start, segments[0].c1, segments[0].c2, segments[0].end, LOGISTICS_GEOM_SAMPLE_COUNT);
    const hit = logisticsGeomFirstCollision(points, obstacles);
    if (!hit) { chosen = segments; detourKind = attempt === 0 ? 'direct' : 'detour'; break; }
    obstacleIds.add(hit.id);
    // Push away from the blocking obstacle's centre on subsequent attempts.
    const cross = (hit.x - start.x) * uy - (hit.y - start.y) * ux;
    pushSign = cross >= 0 ? -1 : 1;
  }
  if (!chosen) {
    // Deterministic 2-segment fallback via the chord midpoint, displaced
    // perpendicular past one deterministic blocking obstacle's bound.
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const blockingObstacleId = [...obstacleIds].sort(logisticsGeomCompareId)[0];
    const blockingObstacle = obstacles.find((o) => o.id === blockingObstacleId) || obstacles[0] || { w: 0, h: 0 };
    const clearance = Math.max(blockingObstacle.w, blockingObstacle.h) / 2 + LOGISTICS_GEOM_DETOUR_STEP;
    const waypoint = { x: mid.x + ux * clearance * pushSign, y: mid.y + uy * clearance * pushSign };
    const seg1 = { start, c1: { x: start.x + (waypoint.x - start.x) * 0.5, y: start.y + (waypoint.y - start.y) * 0.5 }, c2: { x: waypoint.x - (waypoint.x - start.x) * 0.5, y: waypoint.y - (waypoint.y - start.y) * 0.5 }, end: waypoint };
    const seg2 = { start: waypoint, c1: { x: waypoint.x + (end.x - waypoint.x) * 0.5, y: waypoint.y + (end.y - waypoint.y) * 0.5 }, c2: { x: end.x - (end.x - waypoint.x) * 0.5, y: end.y - (end.y - waypoint.y) * 0.5 }, end };
    chosen = [seg1, seg2];
    detourKind = 'fallback';
    const points = [...logisticsGeomSampleCubic(seg1.start, seg1.c1, seg1.c2, seg1.end, LOGISTICS_GEOM_SAMPLE_COUNT), ...logisticsGeomSampleCubic(seg2.start, seg2.c1, seg2.c2, seg2.end, LOGISTICS_GEOM_SAMPLE_COUNT)];
    const stillHit = logisticsGeomFirstCollision(points, obstacles);
    if (stillHit) { obstacleIds.add(stillHit.id); conflicted = true; }
  }
  const pathD = chosen.map((segment, index) => logisticsGeomSegmentD(segment, index === 0)).join(' ');
  let bounds = logisticsGeomHullBounds([chosen[0].start, chosen[0].c1, chosen[0].c2, chosen[0].end]);
  for (let i = 1; i < chosen.length; i++) {
    bounds = logisticsGeomMergeBounds(bounds, logisticsGeomHullBounds([chosen[i].start, chosen[i].c1, chosen[i].c2, chosen[i].end]));
  }
  // pointAt/tangentAt operate on normalized t across the whole (possibly
  // multi-segment) path by mapping t into the owning segment's local t.
  function pointAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    const localT = scaled - index;
    const s = chosen[index];
    return logisticsGeomCubicPoint(s.start, s.c1, s.c2, s.end, localT);
  }
  function tangentAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    const localT = scaled - index;
    const s = chosen[index];
    return logisticsGeomCubicTangent(s.start, s.c1, s.c2, s.end, localT);
  }
  return {
    routeId: route.id,
    fromNodeId: route.fromNodeId,
    toNodeId: route.toNodeId,
    sourcePort,
    targetPort,
    laneIndex: lane,
    laneOffset,
    pathD,
    pathSegments: chosen,
    bounds,
    obstacleIds: [...obstacleIds].sort(logisticsGeomCompareId),
    detourKind,
    conflicted,
    start,
    end,
    d: pathD,
    pointAt,
    tangentAt,
  };
}

/** Bounded obstacle-envelope route. Accepted routes report no obstacle IDs;
 * the finite fallback reports every inflated obstacle actually intersected. */
function logisticsGeomComputeEnvelopeRoute(route, sourcePort, targetPort, laneMetadata, obstacles) {
  const start = { x: sourcePort.x, y: sourcePort.y };
  const end = { x: targetPort.x, y: targetPort.y };
  const dx = end.x - start.x; const dy = end.y - start.y;
  const perpendicular = logisticsGeomPerpendicularUnit(start, end);
  const laneIndex = laneMetadata?.laneIndex || 0;
  const laneOffset = laneIndex * LOGISTICS_GEOM_LANE_GAP;
  const directSegments = [{
    start,
    c1: { x: start.x + dx * 0.36 + perpendicular.x * laneOffset, y: start.y + dy * 0.36 + perpendicular.y * laneOffset },
    c2: { x: end.x - dx * 0.36 + perpendicular.x * laneOffset, y: end.y - dy * 0.36 + perpendicular.y * laneOffset },
    end,
  }];
  const directBlockingIds = logisticsGeomCollisionIdsForSegments(directSegments, obstacles);
  let chosen = directBlockingIds.length ? null : directSegments;
  let detourKind = 'direct';
  const laneRank = laneMetadata?.rank || 0;
  if (!chosen) {
    const blockingObstacles = obstacles.filter((obstacle) => directBlockingIds.includes(obstacle.id));
    const obstacleEnvelope = logisticsGeomObstacleEnvelope(blockingObstacles);
    const gap = LOGISTICS_GEOM_ENVELOPE_CLEARANCE + 1 + laneRank * LOGISTICS_GEOM_LANE_GAP;
    const candidates = [
      ['above', obstacleEnvelope.minY - gap],
      ['below', obstacleEnvelope.maxY + gap],
      ['left', obstacleEnvelope.minX - gap],
      ['right', obstacleEnvelope.maxX + gap],
    ];
    for (const [side, corridor] of candidates) {
      const segments = logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor);
      if (!logisticsGeomCollisionIdsForSegments(segments, obstacles).length) {
        chosen = segments; detourKind = side; break;
      }
    }
    if (!chosen && obstacles.length) {
      const graphEnvelope = logisticsGeomObstacleEnvelope(obstacles);
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const side = horizontal ? 'above' : 'left';
      const corridor = horizontal
        ? graphEnvelope.minY - LOGISTICS_GEOM_ENVELOPE_CLEARANCE - 1 - laneRank * LOGISTICS_GEOM_LANE_GAP
        : graphEnvelope.minX - LOGISTICS_GEOM_ENVELOPE_CLEARANCE - 1 - laneRank * LOGISTICS_GEOM_LANE_GAP;
      const outerCorridor = logisticsGeomCorridorSegments(start, end, sourcePort, targetPort, side, corridor);
      if (!logisticsGeomCollisionIdsForSegments(outerCorridor, obstacles).length) {
        chosen = outerCorridor; detourKind = 'outerCorridor';
      }
    }
  }
  const conflicted = !chosen;
  if (!chosen) { chosen = directSegments; detourKind = 'fallback'; }
  const obstacleIds = conflicted ? logisticsGeomCollisionIdsForSegments(chosen, obstacles) : [];
  const pathD = chosen.map((segment, index) => logisticsGeomSegmentD(segment, index === 0)).join(' ');
  let bounds = logisticsGeomHullBounds([chosen[0].start, chosen[0].c1, chosen[0].c2, chosen[0].end]);
  for (let i = 1; i < chosen.length; i++) {
    bounds = logisticsGeomMergeBounds(bounds, logisticsGeomHullBounds([chosen[i].start, chosen[i].c1, chosen[i].c2, chosen[i].end]));
  }
  function segmentAt(t) {
    const clamped = Math.max(0, Math.min(1, t));
    const scaled = clamped * chosen.length;
    const index = Math.min(chosen.length - 1, Math.floor(scaled));
    return { segment: chosen[index], localT: scaled - index };
  }
  function pointAt(t) {
    const value = segmentAt(t); const s = value.segment;
    return logisticsGeomCubicPoint(s.start, s.c1, s.c2, s.end, value.localT);
  }
  function tangentAt(t) {
    const value = segmentAt(t); const s = value.segment;
    return logisticsGeomCubicTangent(s.start, s.c1, s.c2, s.end, value.localT);
  }
  return {
    routeId: route.id, fromNodeId: route.fromNodeId, toNodeId: route.toNodeId,
    sourcePort, targetPort, laneIndex, laneOffset, pathD, pathSegments: chosen,
    bounds, obstacleIds, detourKind, conflicted, start, end, d: pathD, pointAt, tangentAt,
  };
}

function logisticsGeomEstimateLabelSize(text) {
  const value = typeof text === 'string' ? text : '';
  let units = 0;
  for (const ch of value) { units += ch.codePointAt(0) > 0x2E7F ? 2 : 1; }
  return { width: Math.max(18, units * 6), height: 14 };
}

function logisticsGeomBoxFromCentre(cx, cy, w, h) {
  return { x: cx, y: cy, w, h };
}

function logisticsGeomBoxesOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
}

/**
 * Chooses a deterministic label anchor for each route, avoiding node boxes,
 * unrelated node boxes, and already-placed labels. Routes are scored in a
 * stable order (routeId) so placement never depends on render/iteration order.
 */
function logisticsGeomPlaceLabels(routeGeoms, positions, labelMetrics, fixedLabelBoxes) {
  const placed = fixedLabelBoxes instanceof Map
    ? [...fixedLabelBoxes.entries()].sort((a, b) => logisticsGeomCompareId(a[0], b[0])).map(([, box]) => box).filter(logisticsGeomFiniteBox)
    : [];
  const anchors = new Map();
  const ordered = [...routeGeoms.values()].sort((a, b) => logisticsGeomCompareId(a.routeId, b.routeId));
  const nodeBoxes = [...positions.values()].filter(logisticsGeomFiniteBox);
  for (const geom of ordered) {
    const metric = labelMetrics && labelMetrics.get ? labelMetrics.get(geom.routeId) : null;
    const size = logisticsGeomEstimateLabelSize(metric && metric.text);
    let chosen = null;
    let conflicted = true;
    for (const t of LOGISTICS_GEOM_LABEL_CANDIDATES) {
      const point = geom.pointAt(t);
      const box = logisticsGeomBoxFromCentre(point.x, point.y, size.width, size.height);
      const hitsNode = nodeBoxes.some((nb) => {
        const inflated = { x: nb.x, y: nb.y, w: nb.w + LOGISTICS_GEOM_LABEL_NODE_GAP * 2, h: nb.h + LOGISTICS_GEOM_LABEL_NODE_GAP * 2 };
        return logisticsGeomBoxesOverlap(box, inflated);
      });
      const hitsLabel = placed.some((p) => {
        const inflated = { x: p.x, y: p.y, w: p.w + LOGISTICS_GEOM_LABEL_MIN_GAP, h: p.h + LOGISTICS_GEOM_LABEL_MIN_GAP };
        return logisticsGeomBoxesOverlap(box, inflated);
      });
      if (!hitsNode && !hitsLabel) { chosen = { t, point, box }; conflicted = false; break; }
    }
    if (!chosen) {
      // Least-conflicting deterministic fallback: first candidate, flagged.
      const t = LOGISTICS_GEOM_LABEL_CANDIDATES[0];
      const point = geom.pointAt(t);
      chosen = { t, point, box: logisticsGeomBoxFromCentre(point.x, point.y, size.width, size.height) };
    }
    placed.push(chosen.box);
    anchors.set(geom.routeId, {
      x: chosen.point.x,
      y: chosen.point.y,
      t: chosen.t,
      conflicted,
      warningAnchor: { x: chosen.point.x, y: chosen.point.y + size.height },
    });
  }
  return anchors;
}

/**
 * @param {object} input
 * @param {Array} input.routes - [{id, fromNodeId, toNodeId, ...}], read-only.
 * @param {Map} input.positions - Map<nodeId, {x,y,w,h,...}>, read-only. This
 *   is the already-collapsed/aggregate-remapped rendered graph's position
 *   map (SLICE 2 output as consumed by logisticsBuildRenderedGraph): it is
 *   the sole obstacle source, so region containers are never obstacles and
 *   collapsed aggregates are ordinary obstacles by construction.
 * @param {Map} [input.labelMetrics] - Map<routeId, {text}> for conservative
 *   deterministic label-size estimation (CJK-aware).
 * @param {object} [input.topologyIndex] - topology-only reusable index.
 * @param {Array|Set} [input.routeIds] - optional bounded subset to compute.
 * @param {Map} [input.fixedLabelBoxes] - unrelated labels treated as obstacles.
 * @param {object} [input.options]
 * @returns {{routes: Map, diagnostics: object}}
 */
function computeLogisticsRouteGeometry(input) {
  const routesIn = Array.isArray(input && input.routes) ? input.routes : [];
  const positions = input && input.positions instanceof Map ? input.positions : new Map();
  const labelMetrics = input && input.labelMetrics instanceof Map ? input.labelMetrics : null;
  const topologyIndex = input?.topologyIndex || buildLogisticsRouteTopologyIndex(routesIn);
  const requestedIds = input?.routeIds instanceof Set ? [...input.routeIds]
    : Array.isArray(input?.routeIds) ? input.routeIds.slice()
      : topologyIndex.sortedRouteIds.slice();
  const orderedIds = [...new Set(requestedIds)]
    .filter((routeId) => topologyIndex.routesById.has(routeId))
    .sort(logisticsGeomCompareId);
  const orderedForCompute = orderedIds.map((routeId) => topologyIndex.routesById.get(routeId))
    .filter((route) => positions.has(route.fromNodeId) && positions.has(route.toNodeId));
  const ports = logisticsGeomAssignPortsForRouteIds(topologyIndex, positions, orderedForCompute.map((route) => route.id));
  const inflate = LOGISTICS_GEOM_OBSTACLE_INFLATE;

  const routeGeoms = new Map();
  const conflictedIds = [];
  for (const route of orderedForCompute) {
    const portPair = ports.get(route.id);
    if (!portPair) { continue; }
    const laneMetadata = topologyIndex.laneAllocationMetadata.get(route.id) || { laneIndex: 0, rank: 0, count: 1 };
    const obstacles = logisticsGeomInflatedObstacles(positions, new Set([route.fromNodeId, route.toNodeId]), inflate);
    const geom = logisticsGeomComputeEnvelopeRoute(route, portPair.sourcePort, portPair.targetPort, laneMetadata, obstacles);
    routeGeoms.set(route.id, geom);
    if (geom.conflicted) { conflictedIds.push(route.id); }
  }
  const labelAnchors = logisticsGeomPlaceLabels(routeGeoms, positions, labelMetrics, input?.fixedLabelBoxes);
  for (const [routeId, geom] of routeGeoms) {
    const anchor = labelAnchors.get(routeId);
    geom.labelAnchor = anchor ? { x: anchor.x, y: anchor.y, t: anchor.t } : { x: geom.start.x, y: geom.start.y, t: 0 };
    geom.warningAnchor = anchor ? anchor.warningAnchor : { x: geom.start.x, y: geom.start.y + 14 };
    geom.labelConflicted = anchor ? anchor.conflicted : true;
  }
  const orderedOutput = new Map();
  for (const routeId of orderedIds) { if (routeGeoms.has(routeId)) { orderedOutput.set(routeId, routeGeoms.get(routeId)); } }
  return {
    routes: orderedOutput,
    diagnostics: {
      conflictedIds: conflictedIds.sort(logisticsGeomCompareId),
      routeCount: orderedOutput.size,
      computedRouteIds: [...orderedOutput.keys()],
    },
  };
}

/* --- 85b3-logistics-visual-encoding.js --- */
// LOGISTICS-GRAPH-CANVAS-SLICE4 -- pure factual visual encoding.
// This module intentionally knows nothing about SVG, theme colours, storage,
// camera state, or time.  It only turns factual payload fields into stable
// visual tokens; the renderer and CSS decide how those tokens are painted.

const LOGISTICS_VISUAL_MIN_WIDTH = 2;
const LOGISTICS_VISUAL_MAX_WIDTH = 7;
const LOGISTICS_VISUAL_DIM_OPACITY = 0.18;
const LOGISTICS_VISUAL_SECONDARY_OPACITY = 0.55;

function logisticsVisualCompare(a, b) {
  const aa = String(a == null ? '' : a);
  const bb = String(b == null ? '' : b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

function logisticsVisualFiniteVolume(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function logisticsVisualStatus(route, geometryByRoute) {
  const raw = String(route?.status || 'open').toLowerCase();
  if (raw === 'rumored' || raw === 'unconfirmed') { return { key: 'rumored', tone: 'neutral', dash: '7 5', labelKey: 'rumored', operational: false }; }
  if (raw === 'disrupted' || raw === 'impaired' || raw === 'strained' || raw === 'raided') { return { key: 'impaired', tone: 'warning', dash: '8 3 2 3', labelKey: 'impaired', operational: true }; }
  if (raw === 'blocked' || raw === 'sealed' || raw === 'closed' || raw === 'disabled') { return { key: 'blocked', tone: 'danger', dash: '3 5', labelKey: 'blocked', operational: false }; }
  if (raw === 'bottleneck' || route?.bottleneck) { return { key: 'bottleneck', tone: 'bottleneck', dash: '12 3 2 3', labelKey: 'bottleneck', operational: true }; }
  if (raw === 'open' || raw === 'normal' || raw === '') { return { key: 'open', tone: 'normal', dash: '', labelKey: 'open', operational: true }; }
  return { key: 'unknown', tone: 'neutral', dash: '1 4', labelKey: 'unknown', operational: false };
}

function logisticsVisualFamily(commodity) {
  if (!commodity || typeof commodity !== 'object') { return null; }
  for (const field of ['family', 'familyKey', 'category']) {
    if (typeof commodity[field] === 'string' && commodity[field].trim()) { return commodity[field].trim(); }
  }
  return null;
}

function logisticsVisualNodeMatchesCommodity(node, commodityId, routes, shortages) {
  const has = (value) => Array.isArray(value) && value.some((entry) => (typeof entry === 'string' ? entry : entry?.commodityId) === commodityId);
  return has(node?.commodityIds) || has(node?.production) || has(node?.consumption) || has(node?.storage)
    || (routes || []).some((route) => route?.commodityId === commodityId && (route.fromNodeId === node?.id || route.toNodeId === node?.id))
    || (shortages || []).some((shortage) => shortage?.commodityId === commodityId && shortage.nodeId === node?.id);
}

function logisticsVisualNodeCommodityIds(node, routes, shortages) {
  const ids = new Set();
  const collect = (value) => {
    if (!Array.isArray(value)) { return; }
    for (const entry of value) {
      const id = typeof entry === 'string' ? entry : entry?.commodityId;
      if (typeof id === 'string' && id) { ids.add(id); }
    }
  };
  collect(node?.commodityIds); collect(node?.production); collect(node?.consumption); collect(node?.storage);
  for (const route of routes || []) {
    if (route && (route.fromNodeId === node?.id || route.toNodeId === node?.id) && typeof route.commodityId === 'string') { ids.add(route.commodityId); }
  }
  for (const shortage of shortages || []) {
    if (shortage?.nodeId === node?.id && typeof shortage.commodityId === 'string') { ids.add(shortage.commodityId); }
  }
  return ids;
}

/**
 * Computes stable factual visual tokens.  Family tokens are ordinal tokens,
 * never colours and never derived from commodity identifiers or names.
 */
function computeLogisticsVisualEncoding({ routes, nodes, commodities, selectedCommodityId, selectedRouteId, selectedNodeId, currentLocationId, options } = {}) {
  const safeRoutes = Array.isArray(routes) ? routes.slice().filter(Boolean).sort((a, b) => logisticsVisualCompare(a.id, b.id)) : [];
  const safeNodes = Array.isArray(nodes) ? nodes.slice().filter(Boolean).sort((a, b) => logisticsVisualCompare(a.id, b.id)) : [];
  const safeCommodities = Array.isArray(commodities) ? commodities.slice().filter(Boolean) : [];
  const geometryByRoute = options?.geometryByRoute;
  const shortages = Array.isArray(options?.shortages) ? options.shortages : [];
  const selectedCommodity = typeof selectedCommodityId === 'string' && selectedCommodityId && selectedCommodityId !== 'all' ? selectedCommodityId : null;
  const commodityById = new Map(safeCommodities.filter((item) => typeof item.id === 'string').map((item) => [item.id, item]));
  const selectedFamily = selectedCommodity ? logisticsVisualFamily(commodityById.get(selectedCommodity)) : null;
  const familyKeys = [...new Set(safeCommodities.map(logisticsVisualFamily).filter(Boolean))].sort(logisticsVisualCompare).slice(0, 6);
  const familyTokenByKey = new Map(familyKeys.map((key, index) => [key, `family-${index + 1}`]));
  const volumes = safeRoutes.map((route) => logisticsVisualFiniteVolume(route.volume)).filter((value) => value > 0).sort((a, b) => a - b);
  // A 75th-percentile reference prevents a single extreme from flattening the
  // ordinary routes while the clamp retains monotonicity for every value.
  const reference = volumes.length ? volumes[Math.max(0, Math.ceil(volumes.length * 0.75) - 1)] : 0;
  const widthFor = (volume) => {
    if (!(volume > 0) || !(reference > 0)) { return LOGISTICS_VISUAL_MIN_WIDTH; }
    return LOGISTICS_VISUAL_MIN_WIDTH + (LOGISTICS_VISUAL_MAX_WIDTH - LOGISTICS_VISUAL_MIN_WIDTH) * Math.sqrt(Math.min(volume, reference) / reference);
  };
  const sortedVolumes = [...new Set(volumes)];
  const routeStyles = new Map();
  for (const route of safeRoutes) {
    const throughputValue = logisticsVisualFiniteVolume(route.volume);
    const commodity = commodityById.get(route.commodityId);
    const familyKey = logisticsVisualFamily(commodity);
    const selected = route.id === selectedRouteId;
    const navigationKind = options?.filterModel?.routeMatchKinds?.get(route.id);
    const relevanceKind = selected ? 'primary'
      : selectedRouteId ? 'unrelated'
        : options?.filterModel?.active ? (navigationKind || 'unrelated')
        : !selectedCommodity || route.commodityId === selectedCommodity ? 'primary'
          : selectedFamily && familyKey === selectedFamily ? 'secondary' : 'unrelated';
    const relevance = relevanceKind === 'primary' ? 1
      : relevanceKind === 'secondary' ? LOGISTICS_VISUAL_SECONDARY_OPACITY : LOGISTICS_VISUAL_DIM_OPACITY;
    const status = logisticsVisualStatus(route, geometryByRoute);
    const geometry = geometryByRoute && typeof geometryByRoute.get === 'function' ? geometryByRoute.get(route.id) : null;
    const geometryConflicted = Boolean(route.geometryConflicted || route.conflicted || route.labelConflicted || geometry?.conflicted);
    routeStyles.set(route.id, {
      routeId: route.id,
      statusKey: status.key,
      statusTone: status.tone,
      statusLabelKey: status.labelKey,
      dashPattern: status.dash,
      throughputValue,
      throughputRank: throughputValue > 0 ? sortedVolumes.indexOf(throughputValue) + 1 : 0,
      strokeWidth: Number(widthFor(throughputValue).toFixed(2)),
      relevance,
      relevanceKind,
      commodityFamilyKey: familyKey,
      commodityFamilyToken: familyKey ? (familyTokenByKey.get(familyKey) || 'unclassified') : 'unclassified',
      commodityAccentState: relevanceKind === 'secondary' ? 'secondary'
        : relevanceKind === 'primary' && selectedCommodity && route.commodityId === selectedCommodity ? 'primary' : 'none',
      selected,
      // Geometry diagnostics must never replace the factual movement state.
      // Renderers may add an independent diagnostic affordance while status
      // colour, dash and particle eligibility remain truthful.
      conflicted: geometryConflicted,
      geometryConflicted,
      operational: status.operational,
    });
  }
  const selectedRoute = safeRoutes.find((route) => route.id === selectedRouteId) || null;
  const nodeStyles = new Map();
  for (const node of safeNodes) {
    const endpoint = Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id));
    const current = Boolean(currentLocationId && node.locationId === currentLocationId);
    const selected = node.id === selectedNodeId;
    const commodityIds = logisticsVisualNodeCommodityIds(node, safeRoutes, shortages);
    const exactCommodity = Boolean(selectedCommodity && commodityIds.has(selectedCommodity));
    const sameFamily = Boolean(selectedCommodity && selectedFamily && [...commodityIds].some((id) => id !== selectedCommodity && logisticsVisualFamily(commodityById.get(id)) === selectedFamily));
    const navigationKind = options?.filterModel?.nodeMatchKinds?.get(node.id);
    const relevanceKind = selected || current || endpoint ? 'primary'
      : selectedRouteId ? 'unrelated'
        : options?.filterModel?.active ? (navigationKind || 'unrelated')
        : !selectedCommodity || exactCommodity ? 'primary'
          : sameFamily ? 'secondary' : 'unrelated';
    const relevance = relevanceKind === 'primary' ? 1
      : relevanceKind === 'secondary' ? LOGISTICS_VISUAL_SECONDARY_OPACITY : LOGISTICS_VISUAL_DIM_OPACITY;
    nodeStyles.set(node.id, {
      nodeId: node.id,
      relevance,
      relevanceKind,
      selected,
      current,
      selectedRouteEndpoint: endpoint,
      commodityAccentState: selectedCommodity && relevanceKind === 'primary' && !selected && !current && !endpoint ? 'primary'
        : selectedCommodity && relevanceKind === 'secondary' ? 'secondary' : 'none',
    });
  }
  return {
    routeStyles,
    nodeStyles,
    legend: {
      channels: [
        ['status', 'hue'], ['throughput', 'width'], ['relevance', 'opacity'], ['direction', 'arrow'], ['uncertainty', 'dash'],
      ],
      commodityAccent: selectedCommodity ? 'selected-commodity-only' : 'none',
    },
    diagnostics: {
      familyMetadataAvailable: Boolean(selectedFamily),
      familyTokens: [...familyTokenByKey.entries()].map(([key, token]) => ({ key, token })),
      throughputReference: reference,
    },
  };
}

/* --- 85b4-logistics-navigation.js --- */
// LOGISTICS-GRAPH-CANVAS-SLICE5 -- pure navigation, filter, and semantic zoom models.

const LOGISTICS_MINIMAP_SIZE = 132;
const LOGISTICS_SEMANTIC_OVERVIEW_ENTER = 0.53;
const LOGISTICS_SEMANTIC_OVERVIEW_EXIT = 0.57;
const LOGISTICS_SEMANTIC_DETAIL_ENTER = 1.17;
const LOGISTICS_SEMANTIC_DETAIL_EXIT = 1.13;

function logisticsNavigationCompare(a, b) { return String(a ?? '').localeCompare(String(b ?? '')); }
function logisticsNavigationFinite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function logisticsNavigationClamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function logisticsNavigationNormalize(value) { return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase(); }
function logisticsNavigationFamily(commodity) { return typeof commodity?.family === 'string' && commodity.family.trim() ? commodity.family.trim() : null; }
function logisticsNavigationRegionNames(regions) {
  const entries = regions instanceof Map ? [...regions.entries()] : Array.isArray(regions) ? regions.map((region) => [region?.id || region?.regionId, region]) : [];
  return new Map(entries.filter(([id]) => typeof id === 'string' && id).sort((a, b) => logisticsNavigationCompare(a[0], b[0])).map(([id, region]) => [id, String(region?.label ?? region?.name ?? region?.title ?? '')]));
}
function logisticsNavigationBounds(bounds) {
  const minX = logisticsNavigationFinite(bounds?.minX); const minY = logisticsNavigationFinite(bounds?.minY);
  const maxX = Math.max(minX + 1, logisticsNavigationFinite(bounds?.maxX, minX + 1));
  const maxY = Math.max(minY + 1, logisticsNavigationFinite(bounds?.maxY, minY + 1));
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function computeLogisticsMinimapProjectionBounds({ graphBounds, viewportSize, camera, nodes, regions, options } = {}) {
  const base = logisticsNavigationBounds(graphBounds);
  let minX = base.minX; let minY = base.minY; let maxX = base.maxX; let maxY = base.maxY;
  const include = (x, y, w = 0, h = 0) => {
    const safeX = logisticsNavigationFinite(x); const safeY = logisticsNavigationFinite(y);
    const safeW = Math.max(0, logisticsNavigationFinite(w)); const safeH = Math.max(0, logisticsNavigationFinite(h));
    minX = Math.min(minX, safeX); minY = Math.min(minY, safeY);
    maxX = Math.max(maxX, safeX + safeW); maxY = Math.max(maxY, safeY + safeH);
  };
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const w = Math.max(0, logisticsNavigationFinite(node?.w)); const h = Math.max(0, logisticsNavigationFinite(node?.h));
    include(logisticsNavigationFinite(node?.x) - w / 2, logisticsNavigationFinite(node?.y) - h / 2, w, h);
  }
  for (const [, region] of regions instanceof Map ? regions.entries() : []) {
    include(region?.x, region?.y, region?.w, region?.h);
  }
  const worldPadding = Math.max(0, logisticsNavigationFinite(options?.worldPadding, 24));
  return logisticsNavigationBounds({ minX: minX - worldPadding, minY: minY - worldPadding, maxX: maxX + worldPadding, maxY: maxY + worldPadding });
}

function expandLogisticsMinimapProjectionBounds(current, candidate) {
  const a = logisticsNavigationBounds(current); const b = logisticsNavigationBounds(candidate);
  return logisticsNavigationBounds({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
}

function computeLogisticsMinimapModel({ graphBounds, viewportSize, camera, nodes, regions, options } = {}) {
  const worldBounds = options?.projectionBounds
    ? logisticsNavigationBounds(options.projectionBounds)
    : computeLogisticsMinimapProjectionBounds({ graphBounds, viewportSize, camera, nodes, regions, options });
  const width = Math.max(1, logisticsNavigationFinite(options?.width, LOGISTICS_MINIMAP_SIZE));
  const height = Math.max(1, logisticsNavigationFinite(options?.height, LOGISTICS_MINIMAP_SIZE));
  const pad = Math.max(0, logisticsNavigationFinite(options?.padding, 6));
  const scale = Math.min((width - pad * 2) / worldBounds.w, (height - pad * 2) / worldBounds.h);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const project = (x, y) => ({ x: pad + (x - worldBounds.minX) * safeScale, y: pad + (y - worldBounds.minY) * safeScale });
  const safeCamera = { k: Math.max(0.0001, logisticsNavigationFinite(camera?.k, 1)), tx: logisticsNavigationFinite(camera?.tx), ty: logisticsNavigationFinite(camera?.ty) };
  const vpW = Math.max(0, logisticsNavigationFinite(viewportSize?.width)); const vpH = Math.max(0, logisticsNavigationFinite(viewportSize?.height));
  const worldX = -safeCamera.tx / safeCamera.k; const worldY = -safeCamera.ty / safeCamera.k;
  const start = project(worldX, worldY);
  const contentRect = { x: pad, y: pad, w: worldBounds.w * safeScale, h: worldBounds.h * safeScale };
  const viewportW = Math.min(contentRect.w, vpW / safeCamera.k * safeScale);
  const viewportH = Math.min(contentRect.h, vpH / safeCamera.k * safeScale);
  const viewportRect = {
    x: logisticsNavigationClamp(start.x, contentRect.x, contentRect.x + contentRect.w - viewportW),
    y: logisticsNavigationClamp(start.y, contentRect.y, contentRect.y + contentRect.h - viewportH),
    w: viewportW,
    h: viewportH,
  };
  const regionRects = [...(regions instanceof Map ? regions.entries() : [])].sort((a, b) => logisticsNavigationCompare(a[0], b[0])).map(([id, region]) => {
    const p = project(region.x, region.y); return { id, x: p.x, y: p.y, w: Math.max(1, region.w * safeScale), h: Math.max(1, region.h * safeScale) };
  });
  const nodeMarkers = (Array.isArray(nodes) ? nodes : []).slice().sort((a, b) => logisticsNavigationCompare(a.id, b.id)).map((node) => {
    const p = project(node.x, node.y); return { id: node.id, x: p.x, y: p.y, selected: Boolean(node.selected), current: Boolean(node.current) };
  });
  return { worldBounds, minimapBounds: { width, height, padding: pad }, scale: safeScale, contentRect, viewportRect, regionRects, nodeMarkers, selectedMarker: nodeMarkers.find((node) => node.selected) || null, currentLocationMarker: nodeMarkers.find((node) => node.current) || null };
}

function isLogisticsRouteFlowEligible({ flowEnabled, reducedMotion, relevanceKind, volume, operational } = {}) {
  return flowEnabled === true
    && reducedMotion !== true
    && relevanceKind === 'primary'
    && Number.isFinite(volume) && volume > 0
    && operational === true;
}

function logisticsMinimapCameraAt(model, point, viewportSize, camera) {
  const k = Math.max(0.0001, logisticsNavigationFinite(camera?.k, 1));
  let worldX = model.worldBounds.minX + (logisticsNavigationFinite(point?.x) - model.minimapBounds.padding) / model.scale;
  let worldY = model.worldBounds.minY + (logisticsNavigationFinite(point?.y) - model.minimapBounds.padding) / model.scale;
  const halfW = Math.max(0, logisticsNavigationFinite(viewportSize?.width)) / (2 * k);
  const halfH = Math.max(0, logisticsNavigationFinite(viewportSize?.height)) / (2 * k);
  worldX = model.worldBounds.w <= halfW * 2
    ? (model.worldBounds.minX + model.worldBounds.maxX) / 2
    : logisticsNavigationClamp(worldX, model.worldBounds.minX + halfW, model.worldBounds.maxX - halfW);
  worldY = model.worldBounds.h <= halfH * 2
    ? (model.worldBounds.minY + model.worldBounds.maxY) / 2
    : logisticsNavigationClamp(worldY, model.worldBounds.minY + halfH, model.worldBounds.maxY - halfH);
  return { k, tx: logisticsNavigationFinite(viewportSize?.width) / 2 - worldX * k, ty: logisticsNavigationFinite(viewportSize?.height) / 2 - worldY * k, userModified: true };
}

function computeLogisticsSemanticZoom({ cameraScale, selection, options } = {}) {
  const k = logisticsNavigationFinite(cameraScale, 1);
  const previous = options?.previousLevel;
  let level = 'standard';
  if (previous === 'overview' ? k < LOGISTICS_SEMANTIC_OVERVIEW_EXIT : k < LOGISTICS_SEMANTIC_OVERVIEW_ENTER) { level = 'overview'; }
  else if (previous === 'detail' ? k >= LOGISTICS_SEMANTIC_DETAIL_EXIT : k >= LOGISTICS_SEMANTIC_DETAIL_ENTER) { level = 'detail'; }
  return { level, selectedProtection: Boolean(selection), hideRouteLabels: level === 'overview', hideMinorDetail: level === 'overview', hideParticles: level === 'overview' };
}

function computeLogisticsFilterModel({ nodes, routes, commodities, regions, query, commodityId, statusKeys } = {}) {
  const normalizedQuery = logisticsNavigationNormalize(query);
  const activeStatuses = new Set(Array.isArray(statusKeys) ? statusKeys.map((value) => String(value)) : []);
  const commodityById = new Map((Array.isArray(commodities) ? commodities : []).map((item) => [item.id, item]));
  const nodeById = new Map((Array.isArray(nodes) ? nodes : []).map((item) => [item.id, item]));
  const regionNameById = logisticsNavigationRegionNames(regions);
  const selectedCommodityId = typeof commodityId === 'string' && commodityId && commodityId !== 'all' ? commodityId : null;
  const selectedFamily = logisticsNavigationFamily(commodityById.get(selectedCommodityId));
  const active = Boolean(normalizedQuery || activeStatuses.size || selectedCommodityId);
  const routeMatchKinds = new Map(); const nodeMatchKinds = new Map();
  const routeList = Array.isArray(routes) ? routes : [];
  for (const route of routeList) {
    const from = nodeById.get(route.fromNodeId); const to = nodeById.get(route.toNodeId); const commodity = commodityById.get(route.commodityId);
    const text = logisticsNavigationNormalize([route.id, from?.id, to?.id, from?.label, to?.label, from?.regionId, to?.regionId, regionNameById.get(from?.regionId), regionNameById.get(to?.regionId), commodity?.name, route.commodityId].filter(Boolean).join(' '));
    const queryMatch = !normalizedQuery || text.includes(normalizedQuery);
    const statusMatch = !activeStatuses.size || activeStatuses.has(String(route.status || 'open'));
    const family = logisticsNavigationFamily(commodity);
    const commodityKind = !selectedCommodityId ? 'primary'
      : route.commodityId === selectedCommodityId ? 'primary'
        : selectedFamily && family === selectedFamily ? 'secondary' : 'unrelated';
    routeMatchKinds.set(route.id, queryMatch && statusMatch ? commodityKind : 'unrelated');
  }
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const text = logisticsNavigationNormalize([node.id, node.label, node.regionId, regionNameById.get(node.regionId)].filter(Boolean).join(' '));
    const incidentKinds = routeList.filter((route) => route.fromNodeId === node.id || route.toNodeId === node.id).map((route) => routeMatchKinds.get(route.id));
    const incidentKind = incidentKinds.includes('primary') ? 'primary' : incidentKinds.includes('secondary') ? 'secondary' : 'unrelated';
    const directQueryMatch = Boolean(normalizedQuery) && text.includes(normalizedQuery) && !activeStatuses.size && !selectedCommodityId;
    nodeMatchKinds.set(node.id, !active ? 'primary' : incidentKind !== 'unrelated' ? incidentKind : directQueryMatch ? 'primary' : 'unrelated');
  }
  return { active, query: normalizedQuery, routeMatchKinds, nodeMatchKinds, matchCount: [...routeMatchKinds.values()].filter((value) => value !== 'unrelated').length, regionNameById };
}

/* --- 85b-economy-logistics.js --- */
// NOAI-ECON-FLOWS-005 — read-only deterministic logistics network.
// NOAI-ECON-FLOWS-005C — optional flow direction animation (particles when the
// panel is wide enough, marching dashes when it is narrow; both purely
// decorative/informational, never touching simulation state).

const LOGISTICS_FLOW_ANIM_STORAGE_KEY = 'lorerelay.logisticsFlowAnimation';
const LOGISTICS_COMPACT_WIDTH_PX = 420;
const LOGISTICS_LAYOUT_STORAGE_SCHEMA = 1;
const LOGISTICS_LAYOUT_STORAGE_ALGO = 'region-hybrid-1';
const LOGISTICS_LAYOUT_STORAGE_LIMIT = 500;

// LOGISTICS-GRAPH-CANVAS-SLICE1 — pointer-centred camera over a fixed-size
// viewport. See docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md §2. Layout,
// route geometry, and colour are unchanged in this slice; only a camera
// transform is layered on top of the existing content.
const LOGISTICS_ZOOM_MIN = 0.25;
const LOGISTICS_ZOOM_MAX = 3.0;
const LOGISTICS_ZOOM_STEP = 1.15;
const LOGISTICS_WHEEL_K = 0.0015;
const LOGISTICS_FIT_PADDING = 32;
const LOGISTICS_FIT_SLACK = 0.92;
const LOGISTICS_PAN_STEP = 48;
const LOGISTICS_PAN_STEP_FAST = LOGISTICS_PAN_STEP * 4;
const LOGISTICS_DRAG_THRESHOLD_PX = 4;
// Max |normalized CSS-pixel| wheel delta accepted before zoom math runs.
// Extremely large page/line deltas (or pathological input devices) clamp here
// so exp() never produces non-finite k/tx/ty.
const LOGISTICS_WHEEL_DELTA_MAX = 4096;
// Half-extent of a rendered node box (see renderLogisticsNode's -76/-30
// translate below) — used only to give a single node a sane fit-all bbox.
const LOGISTICS_NODE_HALF_W = 76;
const LOGISTICS_NODE_HALF_H = 30;
// Viewport CSS size is fixed and independent of graph content (see
// .logistics-network-viewport). These mirror that CSS so fit-all can be
// computed without racing DOM layout.
const LOGISTICS_VIEWPORT_HEIGHT = 420;
const LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX = 640;
const LOGISTICS_VIEWPORT_WIDTH_FALLBACK = 760;
const LOGISTICS_CAMERA_EASE_MS = 200;

function logisticsClampZoom(k) {
  const n = Number(k);
  if (!Number.isFinite(n)) { return LOGISTICS_ZOOM_MIN; }
  return Math.max(LOGISTICS_ZOOM_MIN, Math.min(LOGISTICS_ZOOM_MAX, n));
}

function logisticsIsValidCamera(camera) {
  return Boolean(camera)
    && Number.isFinite(camera.k) && Number.isFinite(camera.tx) && Number.isFinite(camera.ty)
    && camera.k >= LOGISTICS_ZOOM_MIN - 1e-9 && camera.k <= LOGISTICS_ZOOM_MAX + 1e-9;
}

/** Rejects NaN/±Infinity/non-object bboxes so Fit All never builds
 * translate(Infinity) from malformed content bounds. */
function logisticsIsFiniteBBox(bbox) {
  return Boolean(bbox)
    && Number.isFinite(bbox.minX) && Number.isFinite(bbox.minY)
    && Number.isFinite(bbox.maxX) && Number.isFinite(bbox.maxY)
    && bbox.maxX >= bbox.minX && bbox.maxY >= bbox.minY;
}

/** Recovers a positive finite viewport size; used by Fit All and zoom-by-step. */
function logisticsSanitizeViewportSize(viewportSize) {
  const width = Number(viewportSize && viewportSize.width);
  const height = Number(viewportSize && viewportSize.height);
  return {
    width: Number.isFinite(width) && width > 0 ? width : LOGISTICS_VIEWPORT_WIDTH_FALLBACK,
    height: Number.isFinite(height) && height > 0 ? height : LOGISTICS_VIEWPORT_HEIGHT,
  };
}

function logisticsWorldToScreen(camera, point) {
  return { x: point.x * camera.k + camera.tx, y: point.y * camera.k + camera.ty };
}

function logisticsScreenToWorld(camera, point) {
  return { x: (point.x - camera.tx) / camera.k, y: (point.y - camera.ty) / camera.k };
}

/** Pointer-centred zoom: the world point under `screenPoint` is unchanged.
 * Non-finite inputs retain the previous camera (never emit Infinity into SVG). */
function logisticsZoomAt(camera, screenPoint, nextK) {
  if (!logisticsIsValidCamera(camera)) { return camera; }
  const k = logisticsClampZoom(nextK);
  if (k === camera.k) { return camera; }
  const sx = Number(screenPoint && screenPoint.x);
  const sy = Number(screenPoint && screenPoint.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) { return camera; }
  const ratio = k / camera.k;
  if (!Number.isFinite(ratio)) { return camera; }
  const tx = sx - (sx - camera.tx) * ratio;
  const ty = sy - (sy - camera.ty) * ratio;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) { return camera; }
  return { k, tx, ty, userModified: true };
}

/** Normalizes wheel deltaMode: 0 = pixel, 1 = line, 2 = page. Result is
 * always finite and clamped to ±LOGISTICS_WHEEL_DELTA_MAX CSS pixels. */
function logisticsWheelDeltaY(event) {
  let deltaY = Number(event && event.deltaY);
  if (!Number.isFinite(deltaY)) { deltaY = 0; }
  const mode = Number(event && event.deltaMode) || 0;
  if (mode === 1) { deltaY *= 16; } else if (mode === 2) { deltaY *= 320; }
  if (!Number.isFinite(deltaY)) { return 0; }
  if (deltaY > LOGISTICS_WHEEL_DELTA_MAX) { return LOGISTICS_WHEEL_DELTA_MAX; }
  if (deltaY < -LOGISTICS_WHEEL_DELTA_MAX) { return -LOGISTICS_WHEEL_DELTA_MAX; }
  return deltaY;
}

function logisticsZoomFromWheel(camera, screenPoint, deltaY) {
  const dy = Number(deltaY);
  if (!Number.isFinite(dy)) { return camera; }
  const factor = Math.exp(-dy * LOGISTICS_WHEEL_K);
  if (!Number.isFinite(factor)) { return camera; }
  return logisticsZoomAt(camera, screenPoint, camera.k * factor);
}

function logisticsZoomByStep(camera, viewportSize, direction) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const center = { x: vp.width / 2, y: vp.height / 2 };
  const dir = Number(direction);
  if (!Number.isFinite(dir)) { return camera; }
  const factor = Math.pow(LOGISTICS_ZOOM_STEP, dir);
  if (!Number.isFinite(factor)) { return camera; }
  return logisticsZoomAt(camera, center, camera.k * factor);
}

function logisticsPanBy(camera, dx, dy) {
  if (!logisticsIsValidCamera(camera)) { return camera; }
  const ddx = Number(dx);
  const ddy = Number(dy);
  if (!Number.isFinite(ddx) || !Number.isFinite(ddy)) { return camera; }
  const tx = camera.tx + ddx;
  const ty = camera.ty + ddy;
  if (!Number.isFinite(tx) || !Number.isFinite(ty)) { return camera; }
  return { k: camera.k, tx, ty, userModified: true };
}

/** bbox of rendered node boxes (world space), or null for an empty graph. */
function logisticsComputeContentBBox(nodePositions) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;
  nodePositions.forEach((pos) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) { return; }
    found = true;
    minX = Math.min(minX, pos.x - LOGISTICS_NODE_HALF_W);
    maxX = Math.max(maxX, pos.x + LOGISTICS_NODE_HALF_W);
    minY = Math.min(minY, pos.y - LOGISTICS_NODE_HALF_H);
    maxY = Math.max(maxY, pos.y + LOGISTICS_NODE_HALF_H);
  });
  if (!found) { return null; }
  const bbox = { minX, minY, maxX, maxY };
  return logisticsIsFiniteBBox(bbox) ? bbox : null;
}

function logisticsDefaultCamera(viewportSize) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  return { k: 1, tx: vp.width / 2, ty: vp.height / 2, userModified: false };
}

/** Fits bbox into viewportSize with screen-space padding, then multiplies the
 * free scale by LOGISTICS_FIT_SLACK (0.92) so decorations keep breathing room.
 * Symmetric excess slack is preserved by centering on the content midpoint. */
function logisticsFitAllCamera(bbox, viewportSize, padding = LOGISTICS_FIT_PADDING) {
  const vp = logisticsSanitizeViewportSize(viewportSize);
  if (!logisticsIsFiniteBBox(bbox)) { return logisticsDefaultCamera(vp); }
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : LOGISTICS_FIT_PADDING;
  const contentW = Math.max(1, bbox.maxX - bbox.minX);
  const contentH = Math.max(1, bbox.maxY - bbox.minY);
  const availW = Math.max(1, vp.width - pad * 2);
  const availH = Math.max(1, vp.height - pad * 2);
  const freeScale = Math.min(availW / contentW, availH / contentH);
  const k = logisticsClampZoom(freeScale * LOGISTICS_FIT_SLACK);
  const centerX = (bbox.minX + bbox.maxX) / 2;
  const centerY = (bbox.minY + bbox.maxY) / 2;
  const tx = vp.width / 2 - centerX * k;
  const ty = vp.height / 2 - centerY * k;
  if (!Number.isFinite(k) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
    return logisticsDefaultCamera(vp);
  }
  return { k, tx, ty, userModified: false };
}

function logisticsBBoxIntersectsViewport(bbox, camera, viewportSize) {
  if (!logisticsIsFiniteBBox(bbox) || !logisticsIsValidCamera(camera)) { return true; }
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const a = logisticsWorldToScreen(camera, { x: bbox.minX, y: bbox.minY });
  const b = logisticsWorldToScreen(camera, { x: bbox.maxX, y: bbox.maxY });
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) { return true; }
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return right >= 0 && left <= vp.width && bottom >= 0 && top <= vp.height;
}

/** Deterministic identity of a dataset's graph shape, independent of the
 * active commodity filter and of ordinary per-tick value changes. */
function logisticsDatasetIdentity(payload) {
  if (!payload) { return ''; }
  const nodeIds = (payload.nodes || []).map((item) => item && item.id).filter(Boolean).slice().sort();
  const routeIds = (payload.routes || []).map((item) => item && item.id).filter(Boolean).slice().sort();
  return `${nodeIds.join(',')}|${routeIds.join(',')}`;
}

/** Which host is currently being rendered: independent camera memory per host. */
function logisticsCameraHostKey() {
  return economyLogisticsUiState.lightboxHost ? 'lightbox' : 'normal';
}

function logisticsActiveCameraContext() {
  const key = logisticsCameraHostKey();
  const contexts = economyLogisticsUiState.cameraContexts;
  if (!contexts[key]) {
    contexts[key] = { camera: null, identity: null };
  }
  return contexts[key];
}

function logisticsEmptyCameraContexts() {
  return {
    normal: { camera: null, identity: null },
    lightbox: { camera: null, identity: null },
  };
}

/** Resolves the camera for this host/render.
 *
 * same dataset identity → always retain a valid camera
 * changed identity + userModified → retain exactly, update identity, never Fit All
 * changed identity + !userModified + content intersects viewport → retain
 * changed identity + !userModified + all content off-screen → one bounded Fit All
 */
function logisticsResolveCameraForRender(payload, bbox, viewportSize) {
  const ctx = logisticsActiveCameraContext();
  const identity = logisticsDatasetIdentity(payload);
  const vp = logisticsSanitizeViewportSize(viewportSize);
  if (!logisticsIsValidCamera(ctx.camera)) {
    ctx.camera = logisticsFitAllCamera(bbox, vp);
    ctx.identity = identity;
    return ctx.camera;
  }
  if (ctx.identity === identity) {
    return ctx.camera;
  }
  // Dataset identity changed.
  if (ctx.camera.userModified === true) {
    ctx.identity = identity;
    return ctx.camera;
  }
  if (logisticsBBoxIntersectsViewport(bbox, ctx.camera, vp)) {
    ctx.identity = identity;
    return ctx.camera;
  }
  ctx.camera = logisticsFitAllCamera(bbox, vp);
  ctx.identity = identity;
  return ctx.camera;
}

function logisticsPrefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function logisticsLoadFlowAnimationPref() {
  try {
    return window.localStorage.getItem(LOGISTICS_FLOW_ANIM_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function logisticsSaveFlowAnimationPref(enabled) {
  try {
    window.localStorage.setItem(LOGISTICS_FLOW_ANIM_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch { /* private browsing / quota — animation choice just won't persist */ }
}

/** Deterministic pseudo-random unit value from an id, used only to stagger
 *  particle start times so parallel routes don't all pulse in lockstep. */
function logisticsHashUnit(id) {
  let h = 0;
  const s = String(id || '');
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return (h % 997) / 997;
}

function logisticsFlowMotionActive() {
  return economyLogisticsUiState.flowAnimationEnabled && !logisticsPrefersReducedMotion();
}

function logisticsFlowDurationSeconds(route) {
  const util = Math.max(0, Math.min(1, route.utilization || 0));
  if (route.status === 'raided') { return 2.8 + (1 - util) * 1.6; }
  if (route.status === 'strained') { return 2.2 + (1 - util) * 1.4; }
  return 1.6 + (1 - util) * 1.2;
}

let logisticsNetworkResizeObserver = null;

/** Measures the actual scrollable viewport (not the min-width-forced SVG) so a
 *  docked, narrow status column reliably falls back to marching dashes even
 *  when the overall VS Code window is wide. */
function logisticsObserveNetworkWidth(viewportEl) {
  if (typeof ResizeObserver !== 'function') { return; }
  if (!logisticsNetworkResizeObserver) {
    logisticsNetworkResizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      const compact = width < LOGISTICS_COMPACT_WIDTH_PX;
      if (compact !== economyLogisticsUiState.compactAnimation) {
        economyLogisticsUiState.compactAnimation = compact;
        renderEconomyLogisticsPanel();
      }
    });
  } else {
    logisticsNetworkResizeObserver.disconnect();
  }
  logisticsNetworkResizeObserver.observe(viewportEl);
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const logisticsMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onLogisticsMotionChange = () => renderEconomyLogisticsPanel();
  if (typeof logisticsMotionQuery.addEventListener === 'function') {
    logisticsMotionQuery.addEventListener('change', onLogisticsMotionChange);
  } else if (typeof logisticsMotionQuery.addListener === 'function') {
    logisticsMotionQuery.addListener(onLogisticsMotionChange);
  }
}

const economyLogisticsUiState = {
  payload: null,
  commodityId: 'all',
  selection: null,
  flowAnimationEnabled: logisticsLoadFlowAnimationPref(),
  // Conservative default (marching dashes, no particles) until the real
  // container width is measured by ResizeObserver on first paint.
  compactAnimation: true,
  searchQuery: '',
  statusKeys: new Set(),
  // Non-null while the panel is rendering inside the "view large" lightbox
  // instead of its normal sidebar location (see ensureVisualLightbox below).
  lightboxHost: null,
  // Independent in-memory cameras per host (normal 420px vs lightbox 640px).
  // Selection/filter remain shared; no localStorage persistence in this slice.
  cameraContexts: {
    normal: { camera: null, identity: null },
    lightbox: { camera: null, identity: null },
  },
  // True while the Space key is held with focus inside the graph viewport,
  // enabling background-style pan even when the pointer starts on a node.
  // Cleared on focus loss / window blur so a stale Space cannot sticky-pan.
  spaceHeld: false,
  scopeKey: 'default',
  persistedScopeKey: null,
  manualPositions: {},
  collapsedRegionIds: new Set(),
  layout: null,
  rendered: null,
  filterCountElement: null,
  storageFallback: new Map(),
  cameraSaveTimers: {},
  // Authoritative node-drag particle suppression (HUMAN-BLOCKERS-F).
  // While active, incident routes of movedNodeId must not create or display
  // flow particles in ANY render path (initial paint, raised layer, filter/
  // search/zoom refresh, or geometry refresh). Cleared only on drag cleanup.
  nodeDragSession: null,
  lightboxMaximized: false,
};

/** True when an active drag session forbids particles for this route. */
function isRouteSuppressedByActiveNodeDrag(routeId) {
  const session = economyLogisticsUiState.nodeDragSession;
  return Boolean(session && session.active && routeId && session.affectedRouteIds
    && (session.affectedRouteIds.has ? session.affectedRouteIds.has(routeId) : session.affectedRouteIds.includes(routeId)));
}

/** Combined flow gate used by every particle creation / visibility path. */
function logisticsRouteMayShowFlowParticles(route, relevanceKind, style) {
  if (!route || isRouteSuppressedByActiveNodeDrag(route.id)) { return false; }
  if (economyLogisticsUiState.compactAnimation) { return false; }
  return isLogisticsRouteFlowEligible({
    flowEnabled: economyLogisticsUiState.flowAnimationEnabled,
    reducedMotion: logisticsPrefersReducedMotion(),
    relevanceKind: relevanceKind || 'primary',
    volume: route.volume,
    operational: style?.operational,
  });
}

/** Strip tracked particles from a route group and drop is-flowing. */
function logisticsClearRouteParticles(group) {
  if (!group || !group._logisticsParts) { return; }
  const parts = group._logisticsParts;
  if (parts.particles && parts.particles.length) {
    for (const p of parts.particles) {
      if (p && p.parentNode) { p.parentNode.removeChild(p); }
    }
  }
  parts.particles = [];
  if (group.classList) { group.classList.remove('is-flowing'); }
}

function logisticsFlowDotRouteGroup(dot) {
  let candidate = dot?.parentNode || null;
  while (candidate) {
    if (candidate.dataset?.routeId) { return candidate; }
    candidate = candidate.parentNode;
  }
  return null;
}

function logisticsFlowDotMotion(dot) {
  const motions = typeof dot?.querySelectorAll === 'function'
    ? dot.querySelectorAll('animateMotion') : [];
  return motions && motions.length ? motions[0] : null;
}

/**
 * Active-view drag audit. Direct animateMotion paths have no mpath ID to
 * inspect, so route ancestry is the suppression authority. Missing motion
 * geometry is also purged, catching raised-layer/orphan remnants.
 */
function logisticsPurgeSuppressedFlowDots(rendered) {
  const session = economyLogisticsUiState.nodeDragSession;
  if (!session || !session.active) { return; }
  const routeIds = session.affectedRouteIds;
  const hasRoute = (id) => routeIds && (routeIds.has ? routeIds.has(id) : routeIds.includes(id));
  const roots = [];
  if (rendered?.svg) { roots.push(rendered.svg); }
  if (rendered?.viewport) { roots.push(rendered.viewport); }
  // Always also audit the currently mounted host (lightbox or panel).
  const host = economyLogisticsUiState.lightboxHost
    || (typeof document !== 'undefined' ? document.getElementById('world-logistics-panel') : null);
  if (host) { roots.push(host); }
  const seen = new Set();
  for (const root of roots) {
    if (!root || seen.has(root)) { continue; }
    seen.add(root);
    const dots = typeof root.querySelectorAll === 'function'
      ? root.querySelectorAll('.logistics-flow-dot')
      : [];
    for (const dot of dots) {
      const group = logisticsFlowDotRouteGroup(dot);
      const routeId = group?.dataset?.routeId || '';
      const motionPath = logisticsFlowDotMotion(dot)?.getAttribute?.('path') || '';
      if (hasRoute(routeId) || !routeId || !motionPath) {
        if (dot.parentNode) { dot.parentNode.removeChild(dot); }
      }
    }
  }
  // Keep tracked arrays coherent with the purge.
  if (rendered?.routeElements) {
    for (const routeId of (session.affectedRouteIds || [])) {
      logisticsClearRouteParticles(rendered.routeElements.get(routeId));
    }
  }
}

/**
 * Enumerate the current active SVG after restoration and remove any visible
 * dot whose direct motion geometry is not byte-identical to its live route
 * line. The rendered route group and line are the sole geometry authority.
 */
function logisticsAuditActiveFlowDots(rendered) {
  const activeContextId = logisticsCameraHostKey();
  if (!rendered || economyLogisticsUiState.rendered !== rendered
    || rendered.contextId !== activeContextId || !rendered.svg) {
    return { visibleCount: 0, staleCount: 0, removedCount: 0, records: [] };
  }
  const dots = typeof rendered.svg.querySelectorAll === 'function'
    ? rendered.svg.querySelectorAll('.logistics-flow-dot') : [];
  const records = [];
  let staleCount = 0;
  let removedCount = 0;
  for (const dot of dots) {
    if (dot.getAttribute?.('display') === 'none') { continue; }
    const group = logisticsFlowDotRouteGroup(dot);
    const routeId = group?.dataset?.routeId || '';
    const activeGroup = routeId ? rendered.routeElements?.get(routeId) : null;
    const line = activeGroup?._logisticsParts?.line || null;
    const lineD = line?.getAttribute?.('d') || '';
    const motion = logisticsFlowDotMotion(dot);
    const motionD = motion?.getAttribute?.('path') || '';
    const current = Boolean(group && activeGroup === group && lineD && motionD === lineD);
    records.push({ routeId, lineD, motionD, current });
    if (!current) {
      staleCount += 1;
      if (dot.parentNode) { dot.parentNode.removeChild(dot); removedCount += 1; }
      if (group?._logisticsParts?.particles) {
        group._logisticsParts.particles = group._logisticsParts.particles.filter((particle) => particle !== dot);
      }
    }
  }
  return { visibleCount: records.length - removedCount, staleCount, removedCount, records };
}

function logisticsBeginNodeDragSession(rendered, nodeId) {
  const topology = rendered?.routeTopologyIndex;
  const affectedRouteIds = logisticsAffectedRouteIdsForNode(nodeId, topology) || [];
  const affectedPathIds = [];
  for (const routeId of affectedRouteIds) {
    const group = rendered?.routeElements?.get(routeId);
    const pathId = group?._logisticsParts?.line?.getAttribute?.('id')
      || (group ? `logistics-route-path-${logisticsDomId(routeId)}` : '');
    if (pathId) { affectedPathIds.push(pathId); }
  }
  economyLogisticsUiState.nodeDragSession = {
    active: true,
    renderedContextId: economyLogisticsUiState.lightboxHost ? 'lightbox' : 'normal',
    movedNodeId: nodeId,
    affectedRouteIds: new Set(affectedRouteIds),
    affectedPathIds: new Set(affectedPathIds),
  };
  // Immediate suppression — do not wait for the first geometry frame.
  for (const routeId of affectedRouteIds) {
    logisticsClearRouteParticles(rendered?.routeElements?.get(routeId));
  }
  logisticsPurgeSuppressedFlowDots(rendered);
}

function logisticsEndNodeDragSession() {
  economyLogisticsUiState.nodeDragSession = null;
}

function logisticsScopeKey(payload) {
  const value = String(payload?.scopeKey || 'default').toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(value) ? value : 'default';
}

function logisticsStorageKey(kind, scopeKey) {
  return `lorerelay.logistics.${kind}.v1.${scopeKey}`;
}

function logisticsStorageGet(key) {
  // A failed write can be more recent than the underlying store. Keep an
  // overlay (including a null tombstone) until a later storage operation
  // succeeds, rather than allowing stale localStorage data to reappear.
  if (economyLogisticsUiState.storageFallback.has(key)) { return economyLogisticsUiState.storageFallback.get(key); }
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function logisticsStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    economyLogisticsUiState.storageFallback.delete(key);
  } catch { economyLogisticsUiState.storageFallback.set(key, value); }
}

function logisticsStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
    economyLogisticsUiState.storageFallback.delete(key);
  } catch { economyLogisticsUiState.storageFallback.set(key, null); }
}

function logisticsValidStoredPosition(value) {
  return Boolean(value) && Number.isFinite(value.x) && Number.isFinite(value.y)
    && Math.abs(value.x) <= 50000 && Math.abs(value.y) <= 50000
    && typeof value.regionId === 'string';
}

function logisticsLoadLayoutPositions(scopeKey) {
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('layout', scopeKey)) || 'null');
    if (!parsed || parsed.v !== LOGISTICS_LAYOUT_STORAGE_SCHEMA || parsed.algo !== LOGISTICS_LAYOUT_STORAGE_ALGO
      || !parsed.positions || typeof parsed.positions !== 'object' || Array.isArray(parsed.positions)) { return {}; }
    const valid = Object.entries(parsed.positions)
      .filter(([, value]) => logisticsValidStoredPosition(value))
      .map(([id, value]) => [id, { x: value.x, y: value.y, regionId: value.regionId, ts: Number.isFinite(value.ts) ? value.ts : 0 }]);
    valid.sort((a, b) => a[1].ts - b[1].ts || logisticsLayoutCompareId(a[0], b[0]));
    return Object.fromEntries(valid.slice(Math.max(0, valid.length - LOGISTICS_LAYOUT_STORAGE_LIMIT)));
  } catch { return {}; }
}

function logisticsSaveLayoutPositions() {
  const entries = Object.entries(economyLogisticsUiState.manualPositions).filter(([, value]) => logisticsValidStoredPosition(value));
  entries.sort((a, b) => a[1].ts - b[1].ts || logisticsLayoutCompareId(a[0], b[0]));
  economyLogisticsUiState.manualPositions = Object.fromEntries(entries.slice(Math.max(0, entries.length - LOGISTICS_LAYOUT_STORAGE_LIMIT)));
  logisticsStorageSet(logisticsStorageKey('layout', economyLogisticsUiState.scopeKey), JSON.stringify({
    v: LOGISTICS_LAYOUT_STORAGE_SCHEMA,
    algo: LOGISTICS_LAYOUT_STORAGE_ALGO,
    positions: economyLogisticsUiState.manualPositions,
  }));
}

function logisticsPruneWrongRegionManualPositions(layout) {
  let removed = false;
  for (const id of layout?.diagnostics?.wrongRegionManualIds || []) {
    if (Object.prototype.hasOwnProperty.call(economyLogisticsUiState.manualPositions, id)) {
      delete economyLogisticsUiState.manualPositions[id];
      removed = true;
    }
  }
  if (removed) { logisticsSaveLayoutPositions(); }
  return removed;
}

function logisticsValidStoredCamera(value) {
  return logisticsIsValidCamera(value) && typeof value.userModified === 'boolean';
}

function logisticsLoadCameraContexts(scopeKey) {
  const contexts = logisticsEmptyCameraContexts();
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('camera', scopeKey)) || 'null');
    if (!parsed || parsed.v !== 1) { return contexts; }
    for (const key of ['normal', 'lightbox']) {
      if (logisticsValidStoredCamera(parsed[key])) { contexts[key].camera = { ...parsed[key] }; }
    }
  } catch { /* fresh in-memory cameras are valid fallback */ }
  return contexts;
}

function logisticsSaveCameraContext(scopeKey, hostKey, camera) {
  let out = { v: 1 };
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('camera', scopeKey)) || 'null');
    if (parsed && parsed.v === 1) { out = { v: 1 }; for (const key of ['normal', 'lightbox']) { if (logisticsValidStoredCamera(parsed[key])) { out[key] = parsed[key]; } } }
  } catch { /* write a fresh, valid context below */ }
  if (logisticsValidStoredCamera(camera)) { out[hostKey] = { ...camera }; }
  logisticsStorageSet(logisticsStorageKey('camera', scopeKey), JSON.stringify(out));
}

function logisticsQueueCameraSave(immediate) {
  const hostKey = logisticsCameraHostKey();
  const scopeKey = economyLogisticsUiState.scopeKey;
  const camera = { ...economyLogisticsUiState.cameraContexts[hostKey].camera };
  const key = `${scopeKey}:${hostKey}`;
  const timers = economyLogisticsUiState.cameraSaveTimers;
  if (timers[key]) { clearTimeout(timers[key]); timers[key] = null; }
  if (immediate) { logisticsSaveCameraContext(scopeKey, hostKey, camera); return; }
  timers[key] = setTimeout(() => { timers[key] = null; logisticsSaveCameraContext(scopeKey, hostKey, camera); }, 220);
}

function logisticsCancelCameraSaves(scopeKey) {
  const prefix = `${scopeKey}:`;
  for (const [key, timer] of Object.entries(economyLogisticsUiState.cameraSaveTimers)) {
    if (!key.startsWith(prefix)) { continue; }
    if (timer) { clearTimeout(timer); }
    delete economyLogisticsUiState.cameraSaveTimers[key];
  }
}

function logisticsLoadPrefs(scopeKey) {
  try {
    const parsed = JSON.parse(logisticsStorageGet(logisticsStorageKey('prefs', scopeKey)) || 'null');
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.collapsed)) { return new Set(); }
    return new Set(parsed.collapsed.filter((id) => typeof id === 'string' && id && id !== '__unassigned'));
  } catch { return new Set(); }
}

function logisticsSavePrefs() {
  logisticsStorageSet(logisticsStorageKey('prefs', economyLogisticsUiState.scopeKey), JSON.stringify({
    v: 1,
    collapsed: [...economyLogisticsUiState.collapsedRegionIds].sort(logisticsLayoutCompareId),
  }));
}

function logisticsEnsureScope(payload) {
  const scopeKey = logisticsScopeKey(payload);
  if (economyLogisticsUiState.persistedScopeKey === scopeKey) { return; }
  economyLogisticsUiState.scopeKey = scopeKey;
  economyLogisticsUiState.persistedScopeKey = scopeKey;
  economyLogisticsUiState.manualPositions = logisticsLoadLayoutPositions(scopeKey);
  economyLogisticsUiState.collapsedRegionIds = logisticsLoadPrefs(scopeKey);
  economyLogisticsUiState.cameraContexts = logisticsLoadCameraContexts(scopeKey);
}

function logisticsElement(tag, className, value) {
  const node = document.createElement(tag);
  if (className) { node.className = className; }
  if (value !== undefined && value !== null) { node.textContent = String(value); }
  return node;
}

function logisticsSvgElement(tag, className) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className) { node.setAttribute('class', className); }
  return node;
}

function logisticsNumber(value, digits = 1) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0+$/, '');
}

function logisticsPercent(value) {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function logisticsStatusLabel(status) {
  return T(`webview.world.logisticsStatus${String(status || 'open').replace(/^./, (c) => c.toUpperCase())}`);
}

function logisticsRiskLabel(risk) {
  if (risk >= 0.67) { return T('webview.world.logisticsRiskHigh'); }
  if (risk >= 0.34) { return T('webview.world.logisticsRiskMedium'); }
  return T('webview.world.logisticsRiskLow');
}

function logisticsNodeKindLabel(kind) {
  const role = logisticsNodeRole(kind).replace('-', '');
  return T(`webview.world.logisticsNode${role.replace(/^./, (c) => c.toUpperCase())}`);
}

function logisticsCommodityName(payload, commodityId) {
  const commodity = (payload?.commodities || []).find((item) => item.id === commodityId);
  return commodity?.name || commodityId || '?';
}

function logisticsNodeName(payload, nodeId) {
  const node = (payload?.nodes || []).find((item) => item.id === nodeId);
  return node?.label || nodeId || '?';
}

function logisticsUnavailableText(reason) {
  const keyByReason = {
    commerce_disabled: 'webview.world.logisticsCommerceDisabled',
    missing_definition: 'webview.world.logisticsMissingDefinition',
    snapshot_unavailable: 'webview.world.logisticsSnapshotUnavailable',
    no_route_summaries: 'webview.world.logisticsNoRoutes',
  };
  return T(keyByReason[reason] || 'webview.world.logisticsUnavailable');
}

function logisticsNodeRank(kind) {
  if (kind === 'region') { return 0; }
  if (kind === 'settlement' || kind === 'facility') { return 1; }
  return 2;
}

/** Stable, CSS-safe fragment id for sharing the rendered route path with
 * animateMotion. Encoding code points avoids collisions from punctuation. */
function logisticsDomId(value) {
  return Array.from(String(value ?? 'route'))
    .map((character) => character.codePointAt(0).toString(16))
    .join('-');
}

function logisticsNodeRole(kind) {
  const value = String(kind || 'region').toLowerCase();
  if (value === 'city' || value === 'town' || value === 'village') { return 'settlement'; }
  if (value === 'vehicle' || value === 'wagon' || value === 'ship') { return 'vehicle'; }
  if (value === 'caravan') { return 'caravan'; }
  if (value === 'envoy' || value === 'group' || value === 'moving_group') { return 'envoy'; }
  if (value === 'mobile_base' || value === 'base') { return 'mobile-base'; }
  return ['region', 'settlement', 'market', 'facility', 'store'].includes(value) ? value : 'region';
}

/** Factual scale only: explicit payload tier, otherwise deterministic route degree. */
function logisticsNodeScale(node, routes) {
  if (['minor', 'standard', 'major'].includes(node?.scale)) { return node.scale; }
  const degree = (routes || []).filter((route) => route.fromNodeId === node?.id || route.toNodeId === node?.id).length;
  if (degree >= 4) { return 'major'; }
  if (degree === 1) { return 'minor'; }
  return 'standard';
}

function logisticsNodeShapePath(role) {
  const paths = {
    settlement: 'M 8 0 H 144 L 152 8 V 52 L 144 60 H 8 L 0 52 V 8 Z',
    market: 'M 18 0 H 134 Q 152 0 152 18 V 42 Q 152 60 134 60 H 18 Q 0 60 0 42 V 18 Q 0 0 18 0 Z',
    facility: 'M 0 0 H 152 V 60 H 0 Z',
    vehicle: 'M 16 6 H 136 L 152 30 L 136 54 H 16 L 0 30 Z',
    caravan: 'M 4 8 H 70 V 52 H 4 Z M 82 8 H 148 V 52 H 82 Z',
    envoy: 'M 76 0 L 152 30 L 76 60 L 0 30 Z',
    'mobile-base': 'M 14 0 H 138 L 152 30 L 138 60 H 14 L 0 30 Z',
    region: 'M 20 0 H 132 Q 152 0 152 20 V 40 Q 152 60 132 60 H 20 Q 0 60 0 40 V 20 Q 0 0 20 0 Z',
    store: 'M 6 0 H 146 L 152 10 V 60 H 0 V 10 Z',
  };
  return paths[role] || paths.region;
}

function logisticsNodeSymbol(role) {
  return ({ settlement: '◆', market: 'M', facility: 'F', vehicle: '→', caravan: 'C', envoy: 'E', 'mobile-base': 'B', store: 'S', region: '○' })[role] || '○';
}

// CJK glyphs are roughly twice as wide as ASCII at the node-label font size, so
// truncate by width units instead of characters to keep labels inside the box.
function logisticsTruncateLabel(label) {
  const text = String(label ?? '');
  const wide = /[ᄀ-ᇿ⺀-鿿　-ヿ㄰-㆏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
  let units = 0;
  let out = '';
  for (const ch of text) {
    units += wide.test(ch) ? 2 : 1;
    if (units > 19) { return `${out}…`; }
    out += ch;
  }
  return text;
}

function buildLogisticsLayout(nodes, routes, options) {
  return computeLogisticsLayout(nodes, routes, options);
}

function appendLogisticsTitle(parent, value) {
  const title = logisticsSvgElement('title');
  title.textContent = value;
  parent.appendChild(title);
}

function activateLogisticsSelection(selection) {
  economyLogisticsUiState.selection = selection;
  renderEconomyLogisticsPanel();
}

/** True when the given selection descriptor is the one already active, so a
 * repeat activation (second click / Enter on the same route or node) is a
 * request to return to the neutral state rather than reselect. */
function logisticsSelectionIsActive(selection) {
  const current = economyLogisticsUiState.selection;
  return Boolean(selection && current && current.type === selection.type && current.id === selection.id);
}

/** Second activation of the already-selected entity clears it; activating a
 * different entity selects it as before. */
function toggleLogisticsSelection(selection) {
  activateLogisticsSelection(logisticsSelectionIsActive(selection) ? null : selection);
}

function bindLogisticsActivation(node, selection) {
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.addEventListener('click', () => toggleLogisticsSelection(selection));
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleLogisticsSelection(selection);
    }
  });
}

function renderLogisticsSummary(payload, parent) {
  const summary = logisticsElement('div', 'logistics-summary');
  const items = [
    ['webview.world.logisticsActiveRoutes', payload.summary?.activeRoutes ?? 0],
    ['webview.world.logisticsDisruptedRoutes', (payload.summary?.blockedRoutes ?? 0) + (payload.summary?.raidedRoutes ?? 0)],
    ['webview.world.logisticsShortages', payload.summary?.shortageCount ?? 0],
    ['webview.world.logisticsTotalFlow', logisticsNumber(payload.summary?.totalVolume ?? 0)],
  ];
  items.forEach(([key, value]) => {
    const chip = logisticsElement('div', 'logistics-summary-chip');
    chip.appendChild(logisticsElement('span', 'logistics-summary-label', T(key)));
    chip.appendChild(logisticsElement('strong', '', value));
    summary.appendChild(chip);
  });
  parent.appendChild(summary);
}

function renderLogisticsFilter(payload, parent) {
  const row = logisticsElement('div', 'logistics-filter-row');
  const label = logisticsElement('label', '', T('webview.world.logisticsCommodityFilter'));
  label.setAttribute('for', 'world-logistics-commodity-filter');
  const select = logisticsElement('select', 'logistics-filter');
  select.id = 'world-logistics-commodity-filter';
  const all = logisticsElement('option', '', T('webview.world.logisticsAllCommodities'));
  all.value = 'all';
  select.appendChild(all);
  (payload.commodities || []).forEach((commodity) => {
    const flags = [
      commodity.localSpecialty ? T('webview.world.logisticsSpecialtyShort') : '',
      commodity.strategic ? T('webview.world.logisticsStrategicShort') : '',
    ].filter(Boolean);
    const option = logisticsElement('option', '', `${commodity.name}${flags.length ? ` · ${flags.join(' · ')}` : ''}`);
    option.value = commodity.id;
    select.appendChild(option);
  });
  if (!(payload.commodities || []).some((item) => item.id === economyLogisticsUiState.commodityId)) {
    economyLogisticsUiState.commodityId = 'all';
  }
  select.value = economyLogisticsUiState.commodityId;
  select.addEventListener('change', () => {
    economyLogisticsUiState.commodityId = select.value || 'all';
    logisticsApplyNavigationFilters();
  });
  row.appendChild(label);
  row.appendChild(select);
  const search = logisticsElement('input', 'logistics-search');
  search.type = 'search'; search.value = economyLogisticsUiState.searchQuery;
  search.setAttribute('aria-label', T('webview.world.logisticsSearch'));
  search.placeholder = T('webview.world.logisticsSearch');
  search.addEventListener('input', () => { economyLogisticsUiState.searchQuery = search.value || ''; logisticsApplyNavigationFilters(); });
  search.addEventListener('keydown', (event) => { if (event.key === 'Escape') { search.value = ''; economyLogisticsUiState.searchQuery = ''; logisticsApplyNavigationFilters(); } });
  row.appendChild(search);
  let statusSelect = null;
  const statuses = [...new Set((payload.routes || []).map((route) => String(route.status || 'open')))].sort(logisticsLayoutCompareId);
  if (statuses.length) {
    const status = logisticsElement('select', 'logistics-status-filter');
    status.setAttribute('aria-label', T('webview.world.logisticsStatusFilter'));
    const any = logisticsElement('option', '', T('webview.world.logisticsStatusFilter')); any.value = ''; status.appendChild(any);
    statuses.forEach((key) => { const option = logisticsElement('option', '', logisticsStatusLabel(key)); option.value = key; status.appendChild(option); });
    status.addEventListener('change', () => { economyLogisticsUiState.statusKeys = new Set(status.value ? [status.value] : []); logisticsApplyNavigationFilters(); });
    row.appendChild(status);
    statusSelect = status;
  }
  const clear = logisticsElement('button', 'logistics-clear-filters-btn', T('webview.world.logisticsClearFilters'));
  clear.type = 'button'; clear.addEventListener('click', () => {
    economyLogisticsUiState.commodityId = 'all'; economyLogisticsUiState.searchQuery = ''; economyLogisticsUiState.statusKeys = new Set();
    select.value = 'all'; search.value = ''; if (statusSelect) { statusSelect.value = ''; }
    logisticsApplyNavigationFilters();
  });
  row.appendChild(clear);
  const results = logisticsElement('span', 'logistics-filter-results', `${T('webview.world.logisticsFilterResults')}: 0`);
  results.setAttribute('role', 'status');
  results.setAttribute('aria-live', 'polite');
  row.appendChild(results);
  economyLogisticsUiState.filterCountElement = results;
  renderLogisticsFlowToggle(row);
  parent.appendChild(row);
}

function logisticsUpdateFilterCount(filterModel) {
  const element = economyLogisticsUiState.filterCountElement;
  if (!element) { return; }
  const count = Number.isFinite(filterModel?.matchCount) ? filterModel.matchCount : 0;
  element.textContent = `${T('webview.world.logisticsFilterResults')}: ${count}`;
}

function logisticsApplyNavigationFilters() {
  const payload = economyLogisticsUiState.payload; const rendered = economyLogisticsUiState.rendered;
  if (!payload || !rendered?.graphRoutes || !rendered?.graphNodes) { renderEconomyLogisticsPanel(); return; }
  const selection = economyLogisticsUiState.selection || null;
  const filterModel = computeLogisticsFilterModel({ nodes: rendered.graphNodes, routes: rendered.graphRoutes, commodities: payload.commodities || [], regions: economyLogisticsUiState.layout?.regions, query: economyLogisticsUiState.searchQuery, commodityId: economyLogisticsUiState.commodityId, statusKeys: [...economyLogisticsUiState.statusKeys] });
  const visual = computeLogisticsVisualEncoding({ routes: rendered.graphRoutes, nodes: rendered.graphNodes, commodities: payload.commodities || [], selectedCommodityId: economyLogisticsUiState.commodityId, selectedRouteId: selection?.type === 'route' ? selection.id : null, selectedNodeId: selection?.type === 'node' ? selection.id : null, currentLocationId: typeof currentWorldLocationId === 'string' ? currentWorldLocationId : null, options: { geometryByRoute: rendered.routeGeoms, shortages: payload.shortages || [], filterModel } });
  const apply = (group, style) => {
    if (!group || !style) { return; }
    const kind = style.relevanceKind; group.dataset.relevance = kind;
    if (group.style) { group.style.opacity = String(style.relevance); }
    if (group.classList) {
      group.classList.remove('is-unrelated', 'is-secondary', 'is-related', 'is-relevance-primary', 'is-relevance-secondary', 'is-relevance-unrelated', 'is-commodity-primary', 'is-commodity-secondary');
      group.classList.add(`is-relevance-${kind}`, kind === 'primary' ? 'is-related' : kind === 'secondary' ? 'is-secondary' : 'is-unrelated');
      if (style.commodityAccentState !== 'none') { group.classList.add(`is-commodity-${style.commodityAccentState}`); }
    }
    const annotations = group._logisticsAnnotations;
    if (annotations) {
      annotations.dataset.relevance = kind;
      if (annotations.style) { annotations.style.opacity = String(style.relevance); }
      if (annotations.classList) {
        annotations.classList.remove('is-unrelated', 'is-secondary', 'is-related', 'is-relevance-primary', 'is-relevance-secondary', 'is-relevance-unrelated', 'is-commodity-primary', 'is-commodity-secondary');
        annotations.classList.add(`is-relevance-${kind}`, kind === 'primary' ? 'is-related' : kind === 'secondary' ? 'is-secondary' : 'is-unrelated');
        if (style.commodityAccentState !== 'none') { annotations.classList.add(`is-commodity-${style.commodityAccentState}`); }
      }
    }
    logisticsApplyFlowParticleVisibility(group, group._logisticsRoute, kind);
  };
  for (const route of rendered.graphRoutes) { apply(rendered.routeElements.get(route.id), visual.routeStyles.get(route.id)); }
  for (const node of rendered.graphNodes) { apply(rendered.nodeElements.get(node.id), visual.nodeStyles.get(node.id)); }
  rendered.visualEncoding = visual; rendered.filterModel = filterModel;
  logisticsUpdateFilterCount(filterModel);
}

function renderLogisticsFlowToggle(row) {
  const reduced = logisticsPrefersReducedMotion();
  const enabled = economyLogisticsUiState.flowAnimationEnabled;
  const btn = logisticsElement(
    'button',
    `logistics-flow-toggle-btn${enabled && !reduced ? ' is-active' : ''}`,
    T(enabled ? 'webview.world.logisticsFlowAnimationOn' : 'webview.world.logisticsFlowAnimationOff')
  );
  btn.type = 'button';
  btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  btn.title = reduced
    ? T('webview.world.logisticsFlowAnimationReducedMotionTitle')
    : T('webview.world.logisticsFlowAnimationTitle');
  btn.disabled = reduced;
  btn.addEventListener('click', () => {
    economyLogisticsUiState.flowAnimationEnabled = !economyLogisticsUiState.flowAnimationEnabled;
    logisticsSaveFlowAnimationPref(economyLogisticsUiState.flowAnimationEnabled);
    renderEconomyLogisticsPanel();
  });
  row.appendChild(btn);
}

function visibleLogisticsData(payload) {
  const commodityId = economyLogisticsUiState.commodityId;
  // Layout and topology always come from the complete sanitized payload. The
  // active commodity filter only changes relevance treatment, never positions.
  const routes = (payload.routes || []).slice();
  const shortages = (payload.shortages || []).filter((item) => item.unmetDemand > 0 && (commodityId === 'all' || item.commodityId === commodityId));
  const nodes = (payload.nodes || []).slice();
  return { routes, shortages, nodes, commodityId };
}

function logisticsAggregateId(regionId) {
  // NUL cannot occur in sanitized authored ids, so this cannot collide.
  return `\u0000lr-region-aggregate:${regionId}`;
}

function logisticsCurrentLocationRegionId(payload) {
  return [...logisticsCurrentLocationRegionIds(payload)][0] || null;
}

function logisticsCurrentLocationRegionIds(payload) {
  const currentId = typeof currentWorldLocationId === 'string' ? currentWorldLocationId : '';
  if (!currentId) { return new Set(); }
  return new Set((payload.nodes || [])
    .filter((node) => node.locationId === currentId && logisticsLayoutValidRegionId(node.regionId))
    .map((node) => node.regionId));
}

function logisticsNodeIsRelevant(payload, node, commodityId, routes, shortages) {
  if (commodityId === 'all') { return true; }
  const selected = economyLogisticsUiState.selection;
  const selectedRoute = selected?.type === 'route' ? (payload.routes || []).find((route) => route.id === selected.id) : null;
  const currentId = typeof currentWorldLocationId === 'string' ? currentWorldLocationId : '';
  const listsCommodity = (node.commodityIds || []).includes(commodityId)
    || (node.production || []).some((entry) => entry.commodityId === commodityId)
    || (node.consumption || []).some((entry) => entry.commodityId === commodityId)
    || (node.storage || []).some((entry) => entry.commodityId === commodityId);
  const routeEndpoint = routes.some((route) => route.commodityId === commodityId && (route.fromNodeId === node.id || route.toNodeId === node.id));
  const shortage = shortages.some((item) => item.nodeId === node.id && item.commodityId === commodityId);
  const processing = (payload.processingSites || []).some((site) => site.nodeId === node.id && (site.commodityId === commodityId || (site.commodityIds || []).includes(commodityId)));
  return listsCommodity || routeEndpoint || shortage || processing
    || (selected?.type === 'node' && selected.id === node.id)
    || Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id))
    || Boolean(currentId && node.locationId === currentId);
}

function logisticsBuildRenderedGraph(payload, layout, commodityId) {
  const positions = new Map(layout.nodes);
  const collapsed = new Set([...economyLogisticsUiState.collapsedRegionIds].filter((id) => layout.regions.has(id)));
  const aggregateByMember = new Map();
  const nodes = [];
  for (const node of payload.nodes || []) {
    const regionId = layout.nodes.get(node.id)?.regionId;
    if (regionId && collapsed.has(regionId)) {
      aggregateByMember.set(node.id, logisticsAggregateId(regionId));
    } else {
      nodes.push({ ...node, filterMatch: logisticsNodeIsRelevant(payload, node, commodityId, payload.routes || [], payload.shortages || []) });
    }
  }
  for (const regionId of [...collapsed].sort(logisticsLayoutCompareId)) {
    const region = layout.regions.get(regionId);
    if (!region) { continue; }
    const id = logisticsAggregateId(regionId);
    positions.set(id, { x: region.x + region.w / 2, y: region.y + region.h / 2, w: 184, h: 72, tier: 'major', regionId, aggregate: true, manual: false });
    const memberNodes = (payload.nodes || []).filter((node) => node.regionId === regionId);
    nodes.push({ id, label: region.label, kind: 'region', scale: 'major', aggregate: true, memberCount: region.memberIds.length, regionId, commodityIds: [], production: [], processingSiteIds: [], shortageCommodityIds: [], filterMatch: memberNodes.some((node) => logisticsNodeIsRelevant(payload, node, commodityId, payload.routes || [], payload.shortages || [])) });
  }
  const routes = [];
  const selected = economyLogisticsUiState.selection;
  for (const route of payload.routes || []) {
    const fromNodeId = aggregateByMember.get(route.fromNodeId) || route.fromNodeId;
    const toNodeId = aggregateByMember.get(route.toNodeId) || route.toNodeId;
    if (fromNodeId === toNodeId || !positions.has(fromNodeId) || !positions.has(toNodeId)) { continue; }
    // Route is relevant when the commodity matches OR the route itself is
    // selected. Do not treat every route incident to a selected node as selected.
    const routeSelected = selected?.type === 'route' && selected.id === route.id;
    const filterMatch = commodityId === 'all' || route.commodityId === commodityId || routeSelected;
    routes.push({ ...route, fromNodeId, toNodeId, filterMatch });
  }
  return { nodes, routes, positions, collapsed };
}

function logisticsNodeTransform(position) {
  return `translate(${position.x - position.w / 2} ${position.y - position.h / 2})`;
}

/** LOGISTICS-GRAPH-CANVAS-SLICE3 single-route adapter over the shared,
 * obstacle-aware geometry engine (85b2-logistics-route-geometry.js). Kept
 * for callers that only have two boxes (no sibling/obstacle context);
 * production rendering uses computeLogisticsRouteGeometry directly over the
 * full route set so ports, lanes and detours are computed with full context. */
function logisticsRouteGeometry(route, from, to) {
  if (!from || !to || ![from.x, from.y, to.x, to.y].every(Number.isFinite)) { return null; }
  const fromId = (route && route.fromNodeId) || '__logistics_from';
  const toId = (route && route.toNodeId) || '__logistics_to';
  if (fromId === toId) { return null; }
  // Callers historically supplied bare {x,y} centres (no box size); default to
  // the standard node tier so port geometry still has a boundary to sit on.
  const fromBox = { x: from.x, y: from.y, w: Number.isFinite(from.w) ? from.w : 152, h: Number.isFinite(from.h) ? from.h : 60 };
  const toBox = { x: to.x, y: to.y, w: Number.isFinite(to.w) ? to.w : 152, h: Number.isFinite(to.h) ? to.h : 60 };
  const positions = new Map([[fromId, fromBox], [toId, toBox]]);
  const routeId = (route && route.id) || '__logistics_route';
  const { routes: geoms } = computeLogisticsRouteGeometry({
    routes: [{ id: routeId, fromNodeId: fromId, toNodeId: toId }],
    positions,
  });
  return geoms.get(routeId) || null;
}

/** Builds label text metrics for every route, deterministically, from the
 * same factual volume/capacity numbers the label already displays. */
function logisticsRouteLabelMetrics(routes) {
  const metrics = new Map();
  for (const route of routes) {
    metrics.set(route.id, { text: `${logisticsNumber(route.volume)}/${logisticsNumber(route.effectiveCapacity)}` });
  }
  return metrics;
}

/** Recomputes only the topology-bounded route group whose endpoint port order
 * can change for a moved node. Unrelated labels remain fixed obstacles. */
function logisticsRefreshRoutesAfterMove(rendered, nodeId) {
  if (!rendered || !rendered.geometryRoutes || !rendered.routeTopologyIndex) { return; }
  const affectedRouteIds = logisticsAffectedRouteIdsForNode(nodeId, rendered.routeTopologyIndex);
  if (!affectedRouteIds.length) { return; }
  const affectedSet = new Set(affectedRouteIds);
  const previous = rendered.routeGeoms || new Map();
  const fixedLabelBoxes = new Map();
  for (const [routeId, geom] of previous) {
    if (affectedSet.has(routeId) || !geom?.labelAnchor) { continue; }
    const size = logisticsGeomEstimateLabelSize(rendered.geometryLabelMetrics.get(routeId)?.text);
    fixedLabelBoxes.set(routeId, { x: geom.labelAnchor.x, y: geom.labelAnchor.y, w: size.width, h: size.height });
  }
  const partial = computeLogisticsRouteGeometry({
    routes: rendered.geometryRoutes,
    positions: rendered.positions,
    labelMetrics: rendered.geometryLabelMetrics,
    topologyIndex: rendered.routeTopologyIndex,
    routeIds: affectedRouteIds,
    fixedLabelBoxes,
  }).routes;
  const next = new Map(previous);
  rendered.lastGeometryRouteIds = affectedRouteIds.slice();
  for (const [routeId, geom] of partial) {
    next.set(routeId, geom);
    const group = rendered.routeElements.get(routeId);
    if (!group || !group._logisticsParts) { continue; }
    const parts = group._logisticsParts;
    // Always clear particles for drag-affected routes. A direct animateMotion
    // path is an immutable creation-time geometry snapshot and must not remain
    // alive while the visible line's d changes.
    logisticsClearRouteParticles(group);
    parts.line.setAttribute('d', geom.pathD);
    parts.line.dataset.routePath = geom.pathD;
    if (parts.hit) { parts.hit.setAttribute('d', geom.pathD); }
    if (parts.label) { parts.label.setAttribute('x', String(Math.round(geom.labelAnchor.x))); parts.label.setAttribute('y', String(Math.round(geom.labelAnchor.y - 7))); }
    if (parts.warning) { parts.warning.setAttribute('x', String(Math.round(geom.warningAnchor.x))); parts.warning.setAttribute('y', String(Math.round(geom.warningAnchor.y + 5))); }
    if (parts.label?.classList) {
      if (geom.labelConflicted) { parts.label.classList.add('is-label-conflicted'); } else { parts.label.classList.remove('is-label-conflicted'); }
    }
    if (group.classList) {
      if (geom.conflicted) { group.classList.add('is-geometry-conflicted'); } else { group.classList.remove('is-geometry-conflicted'); }
      if (!geom.conflicted && geom.detourKind !== 'direct') { group.classList.add('is-detoured'); } else { group.classList.remove('is-detoured'); }
    }
    group._logisticsGeometry = geom;
  }
  rendered.routeGeoms = next;
  // Full active-view audit (not only tracked route descendants).
  if (economyLogisticsUiState.nodeDragSession?.active) {
    logisticsPurgeSuppressedFlowDots(rendered);
  }
}

/** LOGISTICS-GRAPH-CANVAS-SLICE3: every visual (stroke, hit target, arrow,
 * particles, label, warning) is driven by the one `geometry` object computed
 * once for the whole route set by computeLogisticsRouteGeometry. Nothing here
 * re-derives a coordinate. `layerEdges`/`layerEdgesRaised` decide which layer
 * receives the group (Part G) — the group itself never changes route id,
 * path id, or selection/detail state when it moves between them. */
function renderLogisticsRoute(layerEdges, layerEdgesRaised, layerLabels, payload, route, geometry, visual, rendered) {
  if (!geometry) { return; }
  const selectedRouteId = economyLogisticsUiState.selection?.type === 'route' ? economyLogisticsUiState.selection.id : null;
  const selected = selectedRouteId === route.id;
  const status = route.status === 'unconfirmed' ? 'rumored' : (route.status || 'open');
  const style = visual || { statusKey: 'unknown', dashPattern: '1 4', strokeWidth: 2, relevance: 1, commodityAccentState: 'none', operational: false };
  const movement = route.volume > 0 ? 'active' : 'idle';
  const conflictClass = geometry.conflicted ? ' is-geometry-conflicted' : geometry.detourKind !== 'direct' ? ' is-detoured' : '';
  const relevanceKind = style.relevanceKind || (style.relevance < 1 ? 'unrelated' : 'primary');
  const flowInput = { flowEnabled: economyLogisticsUiState.flowAnimationEnabled, reducedMotion: logisticsPrefersReducedMotion(), relevanceKind, volume: route.volume, operational: style.operational };
  const particleEligible = logisticsRouteMayShowFlowParticles(route, 'primary', style);
  const flowing = logisticsRouteMayShowFlowParticles(route, relevanceKind, style);
  const group = logisticsSvgElement('g', `logistics-route logistics-route-${status} logistics-route-status-${style.statusKey} is-${movement}${route.bottleneck ? ' is-bottleneck' : ''}${selected ? ' is-selected' : ''}${style.commodityAccentState !== 'none' ? ` is-commodity-${style.commodityAccentState}` : ''} is-relevance-${relevanceKind}${relevanceKind === 'unrelated' ? ' is-unrelated' : relevanceKind === 'secondary' ? ' is-secondary' : ' is-related'}${flowing ? ' is-flowing' : ''}${conflictClass}`);
  if (group.style) { group.style.opacity = String(style.relevance); }
  if (flowing && typeof group.style.setProperty === 'function') {
    group.style.setProperty('--logistics-flow-duration', `${logisticsFlowDurationSeconds(route).toFixed(2)}s`);
  }
  group.dataset.routeId = route.id;
  group.dataset.relevance = relevanceKind;
  const pathId = `logistics-route-path-${logisticsDomId(route.id)}`;
  // Invisible wide hit target sharing the exact same `d` as the visible
  // stroke, so the clickable area is not limited to a thin high-volume line.
  const hit = logisticsSvgElement('path', 'logistics-route-hit');
  hit.setAttribute('d', geometry.pathD);
  hit.setAttribute('stroke-width', '12');
  group.appendChild(hit);
  const line = logisticsSvgElement('path', 'logistics-route-line');
  line.setAttribute('id', pathId);
  line.setAttribute('d', geometry.pathD);
  line.dataset.routePath = geometry.pathD;
  line.setAttribute('stroke-width', Number(style.strokeWidth).toFixed(2));
  line.setAttribute('marker-end', `url(#logistics-arrow-${style.statusKey})`);
  if (style.dashPattern) { line.style.setProperty('stroke-dasharray', style.dashPattern); }
  group.appendChild(line);
  // Drag-session gate: never create particles for routes incident to the
  // actively dragged node (raised layer / filter / search re-renders included).
  const particles = particleEligible
    ? logisticsRenderFlowParticles(group, route, geometry, line) : [];

  const labelX = Math.round(geometry.labelAnchor.x);
  const labelY = Math.round(geometry.labelAnchor.y);
  const label = logisticsSvgElement('text', `logistics-route-label${geometry.labelConflicted ? ' is-label-conflicted' : ''}`);
  label.setAttribute('x', String(labelX));
  label.setAttribute('y', String(labelY - 7));
  label.textContent = `${logisticsNumber(route.volume)}/${logisticsNumber(route.effectiveCapacity)}`;
  label.setAttribute('aria-label', `${T('webview.world.logisticsVolumeCapacity')}: ${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)}`);
  appendLogisticsTitle(label, `${T('webview.world.logisticsVolumeCapacity')}: ${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)}`);
  const annotations = logisticsSvgElement('g', `logistics-route-annotations${selected ? ' is-selected' : ''}`);
  annotations.dataset.relevance = relevanceKind;
  if (annotations.style) { annotations.style.opacity = String(style.relevance); }
  annotations.appendChild(label);
  let warning = null;
  if (status === 'blocked' || status === 'raided' || status === 'rumored' || route.bottleneck) {
    const warnY = Math.round(geometry.warningAnchor.y);
    warning = logisticsSvgElement('text', 'logistics-route-warning');
    warning.setAttribute('x', String(labelX));
    warning.setAttribute('y', String(warnY + 5));
    warning.textContent = route.bottleneck ? '◆' : status === 'blocked' ? '×' : status === 'rumored' ? '?' : '!';
    annotations.appendChild(warning);
  }
  const aria = `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}, ${logisticsCommodityName(payload, route.commodityId)}, ${logisticsStatusLabel(route.status)}`;
  group.setAttribute('aria-label', aria);
  appendLogisticsTitle(group, `${aria}; ${T('webview.world.logisticsVolume')} ${logisticsNumber(route.volume)}; ${T('webview.world.logisticsRisk')} ${logisticsRiskLabel(route.risk)}`);
  bindLogisticsActivation(group, { type: 'route', id: route.id });
  group._logisticsRoute = route;
  group._logisticsGeometry = geometry;
  group._logisticsStyle = style;
  group._logisticsParts = { line, hit, label, warning, particles };
  group._logisticsAnnotations = annotations;
  if (rendered) { rendered.routeElements.set(route.id, group); }
  // Part G: ordinary route -> layer-edges, selected route -> layer-edges-raised.
  // The group's route id / path id never change when it moves between layers.
  (selected ? layerEdgesRaised : layerEdges).appendChild(group);
  layerLabels.appendChild(annotations);
  logisticsApplyFlowParticleVisibility(group, route, relevanceKind);
}

/** Single-route backward-compatible refresh (no sibling/obstacle context).
 * Production node-drag refresh uses logisticsRefreshRoutesAfterMove with the
 * bounded topology group needed to keep endpoint port/lane siblings stable. */
function logisticsRefreshRouteElement(group, positions) {
  const route = group?._logisticsRoute;
  const parts = group?._logisticsParts;
  const geometry = route && logisticsRouteGeometry(route, positions.get(route.fromNodeId), positions.get(route.toNodeId));
  if (!geometry || !parts) { return; }
  parts.line.setAttribute('d', geometry.pathD || geometry.d);
  parts.line.dataset.routePath = geometry.pathD || geometry.d;
  if (parts.hit) { parts.hit.setAttribute('d', geometry.pathD || geometry.d); }
  const anchor = geometry.labelAnchor || geometry.pointAt(0.5);
  if (parts.label) { parts.label.setAttribute('x', String(Math.round(anchor.x))); parts.label.setAttribute('y', String(Math.round(anchor.y - 7))); }
  if (parts.warning) {
    const warn = geometry.warningAnchor || anchor;
    parts.warning.setAttribute('x', String(Math.round(warn.x))); parts.warning.setAttribute('y', String(Math.round(warn.y + 5)));
  }
  group._logisticsGeometry = geometry;
}

/** Declarative SMIL particles (no rAF loop, no canonical state): 2 steady dots
 *  for open/strained flow, 1 sparse flickering dot for raided routes so a
 *  convoy under threat visibly reads as different from healthy flow.
 *
 *  Coordinates must be finite before any circle is created. The particle is
 *  rooted at local (0,0) and follows a direct animateMotion path; assigning
 *  both absolute cx/cy and an absolute motion path double-applies the source
 *  offset and visibly throws dots away from their routes. The live visible
 *  line's current d is read at creation time so Electron cannot reuse a stale
 *  SMIL mpath cache after node dragging. */
function logisticsRenderFlowParticles(group, route, geometry, routeLine) {
  // Central gate: creation is forbidden while this route is drag-suppressed.
  if (route && isRouteSuppressedByActiveNodeDrag(route.id)) { return []; }
  if (!geometry || !geometry.start || !geometry.end || !geometry.d) { return []; }
  const currentPathD = routeLine?.getAttribute?.('d') || '';
  if (!currentPathD) { return []; }
  const duration = logisticsFlowDurationSeconds(route);
  if (!(duration > 0) || !Number.isFinite(duration)) { return []; }
  const dotCount = route.status === 'raided' ? 1 : 2;
  const stagger = logisticsHashUnit(route.id) * duration;
  const particles = [];
  for (let i = 0; i < dotCount; i++) {
    const dot = logisticsSvgElement('circle', `logistics-flow-dot logistics-flow-dot-${route.status}`);
    dot.setAttribute('r', '2.6');
    dot.setAttribute('cx', '0');
    dot.setAttribute('cy', '0');
    // An engine without SMIL support must not leave a static dot at the SVG
    // origin. SMIL-capable engines reveal it as the motion begins.
    dot.setAttribute('visibility', 'hidden');
    const motion = document.createElementNS('http://www.w3.org/2000/svg', 'animateMotion');
    motion.setAttribute('dur', `${duration.toFixed(2)}s`);
    motion.setAttribute('repeatCount', 'indefinite');
    motion.setAttribute('path', currentPathD);
    const phase = (stagger + (i * duration) / dotCount) % duration;
    // Negative begin = animation already "running" at t=0 (mid-path), so the
    // particle never waits at the static cx/cy for a delayed positive begin.
    motion.setAttribute('begin', `-${phase.toFixed(2)}s`);
    dot.appendChild(motion);
    const reveal = document.createElementNS('http://www.w3.org/2000/svg', 'set');
    reveal.setAttribute('attributeName', 'visibility');
    reveal.setAttribute('to', 'visible');
    reveal.setAttribute('begin', '-0.01s');
    reveal.setAttribute('dur', 'indefinite');
    dot.appendChild(reveal);
    if (route.status === 'raided') {
      const flicker = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
      flicker.setAttribute('attributeName', 'opacity');
      flicker.setAttribute('values', '1;0.2;1;0.7;1');
      flicker.setAttribute('dur', `${(duration * 0.7).toFixed(2)}s`);
      flicker.setAttribute('repeatCount', 'indefinite');
      // Match motion phase so flicker is also active from first paint.
      flicker.setAttribute('begin', `-${phase.toFixed(2)}s`);
      dot.appendChild(flicker);
    }
    group.appendChild(dot);
    particles.push(dot);
  }
  return particles;
}

function logisticsApplyFlowParticleVisibility(group, route, relevanceKind) {
  const particles = group?._logisticsParts?.particles || [];
  const style = group?._logisticsStyle;
  // Drag suppression wins over every other eligibility path.
  if (route && isRouteSuppressedByActiveNodeDrag(route.id)) {
    if (group?.classList) { group.classList.toggle('is-flowing', false); }
    for (const particle of particles) { particle.setAttribute('display', 'none'); }
    return;
  }
  const eligible = isLogisticsRouteFlowEligible({ flowEnabled: economyLogisticsUiState.flowAnimationEnabled, reducedMotion: logisticsPrefersReducedMotion(), relevanceKind, volume: route?.volume, operational: style?.operational });
  if (group?.classList) { group.classList.toggle('is-flowing', eligible); }
  // Secondary/unrelated routes and non-moving operational statuses keep their
  // factual stroke, but animation is reserved for truthful active movement.
  const display = eligible ? 'inline' : 'none';
  for (const particle of particles) { particle.setAttribute('display', display); }
}

function renderLogisticsNode(layerNodes, layerLabels, payload, node, position, shortages, routes, visual, rendered) {
  // Focused persistence tests and small extension integrations historically
  // called this internal helper before the final label layer existed. Keep that
  // narrow calling convention working while production always supplies both
  // SVG layers.
  if (!layerLabels || typeof layerLabels.appendChild !== 'function') {
    const legacyPayload = layerLabels;
    const legacyNode = payload;
    const legacyPosition = node;
    const legacyShortages = position;
    const legacyRoutes = shortages;
    const legacyRendered = routes;
    layerLabels = layerNodes;
    payload = legacyPayload;
    node = legacyNode;
    position = legacyPosition;
    shortages = legacyShortages;
    routes = legacyRoutes;
    visual = undefined;
    rendered = legacyRendered;
  }
  const selected = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const selectedRouteId = economyLogisticsUiState.selection?.type === 'route' ? economyLogisticsUiState.selection.id : null;
  const selectedRoute = selectedRouteId ? (routes || []).find((route) => route.id === selectedRouteId) : null;
  const selectedNode = economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id;
  const currentNode = Boolean(typeof currentWorldLocationId === 'string' && node.locationId === currentWorldLocationId);
  const selectedEndpoint = Boolean(selectedRoute && (selectedRoute.fromNodeId === node.id || selectedRoute.toNodeId === node.id));
  const style = visual || { relevance: 1, commodityAccentState: 'none' };
  const relevanceKind = style.relevanceKind || (style.relevance < 1 ? 'unrelated' : 'primary');
  const role = logisticsNodeRole(node.kind);
  const scale = position.tier || logisticsNodeScale(node, routes);
  const nodeWidth = Number.isFinite(position.w) ? position.w : 152;
  const nodeHeight = Number.isFinite(position.h) ? position.h : 60;
  const horizontalScale = nodeWidth / 152;
  const verticalScale = nodeHeight / 60;
  const padding = Math.max(8, Math.round(nodeWidth * 0.08));
  const kindY = Math.max(14, Math.round(nodeHeight * 0.29));
  const labelY = Math.min(nodeHeight - 10, Math.max(kindY + 16, Math.round(nodeHeight * 0.68)));
  const badgeX = nodeWidth - padding - 5;
  const holdingSelection = Boolean(node.aggregate && ((economyLogisticsUiState.selection?.type === 'node' && (payload.nodes || []).find((item) => item.id === economyLogisticsUiState.selection.id)?.regionId === node.regionId)
    || (economyLogisticsUiState.selection?.type === 'route' && (payload.routes || []).find((item) => item.id === economyLogisticsUiState.selection.id) && [payload.routes.find((item) => item.id === economyLogisticsUiState.selection.id).fromNodeId, payload.routes.find((item) => item.id === economyLogisticsUiState.selection.id).toNodeId].some((id) => (payload.nodes || []).find((item) => item.id === id)?.regionId === node.regionId))));
  const group = logisticsSvgElement('g', `logistics-node logistics-node-${role} logistics-node-scale-${scale}${node.aggregate ? ' logistics-node-aggregate' : ''}${selected ? ' is-selected' : ''}${selectedEndpoint ? ' is-route-endpoint' : ''}${holdingSelection ? ' is-holding-selection' : ''}${style.commodityAccentState !== 'none' ? ` is-commodity-${style.commodityAccentState}` : ''} is-relevance-${relevanceKind}${relevanceKind === 'unrelated' ? ' is-unrelated' : relevanceKind === 'secondary' ? ' is-secondary' : ' is-related'}`);
  if (group.style) { group.style.opacity = String(style.relevance); }
  group.dataset.nodeId = node.id;
  group.dataset.relevance = relevanceKind;
  const transform = logisticsNodeTransform(position);
  group.setAttribute('transform', transform);
  const annotations = logisticsSvgElement('g', `logistics-node-label-overlay logistics-node-scale-${scale}${selected ? ' is-selected' : ''}${selectedEndpoint ? ' is-route-endpoint' : ''} is-relevance-${relevanceKind}`);
  annotations.dataset.relevance = relevanceKind;
  annotations.setAttribute('transform', transform);
  annotations.setAttribute('pointer-events', 'none');
  if (annotations.style) { annotations.style.opacity = String(style.relevance); }
  group.setAttribute('aria-label', node.aggregate ? `${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}` : `${node.label}, ${logisticsNodeKindLabel(node.kind)}`);
  const shape = logisticsSvgElement('path', 'logistics-node-shape');
  shape.setAttribute('d', logisticsNodeShapePath(role));
  shape.setAttribute('transform', `scale(${horizontalScale} ${verticalScale})`);
  group.appendChild(shape);
  if (node.aggregate) {
    // Stacked outline must share the aggregate/region silhouette (not envoy).
    const outline = logisticsSvgElement('path', 'logistics-node-aggregate-outline');
    outline.setAttribute('d', logisticsNodeShapePath(role));
    outline.setAttribute('transform', `translate(4 4) scale(${horizontalScale} ${verticalScale})`);
    group.appendChild(outline);
  }
  const accent = logisticsSvgElement('path', 'logistics-node-accent');
  accent.setAttribute('d', 'M 12 5 H 140');
  accent.setAttribute('transform', `scale(${horizontalScale} ${verticalScale})`);
  group.appendChild(accent);
  const kind = logisticsSvgElement('text', 'logistics-node-kind');
  kind.setAttribute('x', String(padding));
  kind.setAttribute('y', String(kindY));
  kind.textContent = logisticsNodeKindLabel(node.kind);
  annotations.appendChild(kind);
  const label = logisticsSvgElement('text', 'logistics-node-label');
  label.setAttribute('x', String(padding));
  label.setAttribute('y', String(labelY));
  label.textContent = logisticsTruncateLabel(node.label);
  annotations.appendChild(label);
  const symbol = logisticsSvgElement('text', 'logistics-node-symbol');
  symbol.setAttribute('x', String(nodeWidth - padding - 12));
  symbol.setAttribute('y', String(labelY + 4));
  symbol.textContent = logisticsNodeSymbol(role);
  annotations.appendChild(symbol);
  if (node.aggregate) {
    const badge = logisticsSvgElement('text', 'logistics-aggregate-badge');
    badge.setAttribute('x', String(badgeX));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = String(node.memberCount || 0);
    annotations.appendChild(badge);
  }
  const nodeShortages = shortages.filter((item) => item.nodeId === node.id);
  if (nodeShortages.length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-shortage-badge');
    badge.setAttribute('x', String(badgeX));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = '!';
    annotations.appendChild(badge);
  } else if ((node.processingSiteIds || []).length > 0) {
    const badge = logisticsSvgElement('text', 'logistics-processing-badge');
    badge.setAttribute('x', String(badgeX - 3));
    badge.setAttribute('y', String(kindY + 1));
    badge.textContent = '⚙';
    annotations.appendChild(badge);
  }
  appendLogisticsTitle(group, `${node.label}; ${logisticsNodeKindLabel(node.kind)}; ${T(`webview.world.logisticsScale${scale.replace(/^./, (c) => c.toUpperCase())}`)}${nodeShortages.length ? `; ${T('webview.world.logisticsShortage')}` : ''}`);
  if (node.aggregate) {
    const expand = () => {
      economyLogisticsUiState.collapsedRegionIds.delete(node.regionId);
      logisticsSavePrefs();
      renderEconomyLogisticsPanel();
    };
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `${T('webview.world.logisticsExpandRegion')} ${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}`);
    appendLogisticsTitle(group, `${T('webview.world.logisticsExpandRegion')} ${node.label}, ${node.memberCount} ${T('webview.world.logisticsRegionMembers')}`);
    group.addEventListener('click', (event) => { if (event?.stopPropagation) { event.stopPropagation(); } expand(); });
    group.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(); } });
  } else {
    bindLogisticsActivation(group, { type: 'node', id: node.id });
  }
  group._logisticsPosition = position;
  group._logisticsAnnotations = annotations;
  if (rendered) { rendered.nodeElements.set(node.id, group); }
  layerNodes.appendChild(group);
  layerLabels.appendChild(annotations);
}

function renderLogisticsLegend(parent) {
  const legend = logisticsElement('div', 'logistics-legend');
  legend.setAttribute('role', 'group');
  legend.setAttribute('aria-label', T('webview.world.logisticsLegend'));
  const title = logisticsElement('strong', 'logistics-legend-title', T('webview.world.logisticsLegend'));
  legend.appendChild(title);
  const statusList = logisticsElement('div', 'logistics-legend-list logistics-legend-status-list');
  statusList.setAttribute('role', 'list');
  const statuses = [
    ['open', '→', `${T('webview.world.logisticsStatusOpen')} · ${T('webview.world.logisticsLegendActive')}`],
    ['impaired', '!', `${T('webview.world.logisticsStatusStrained')} · ${T('webview.world.logisticsLegendActive')}`],
    ['blocked', '×', `${T('webview.world.logisticsStatusBlocked')} · ${T('webview.world.logisticsFlowAnimationOff')}`],
    ['rumored', '?', T('webview.world.logisticsStatusRumored')],
    ['selected', '◎', T('webview.world.logisticsLegendSelected')],
  ];
  for (const [status, glyph, label] of statuses) {
    const item = logisticsElement('span', `logistics-legend-item logistics-legend-${status}`);
    item.setAttribute('role', 'listitem');
    item.appendChild(logisticsElement('span', 'logistics-legend-swatch', glyph));
    item.appendChild(logisticsElement('span', 'logistics-legend-label', label));
    statusList.appendChild(item);
  }
  legend.appendChild(statusList);
  legend.appendChild(logisticsElement('p', 'logistics-legend-encoding', T('webview.world.logisticsLegendEncoding')));
  const nodeList = logisticsElement('div', 'logistics-legend-list logistics-legend-node-list');
  nodeList.setAttribute('role', 'list');
  for (const role of ['settlement', 'market', 'facility', 'vehicle', 'caravan', 'envoy', 'mobile_base']) {
    const cssRole = role.replace('_', '-');
    const item = logisticsElement('span', `logistics-legend-item logistics-legend-node logistics-legend-node-${cssRole}`);
    item.setAttribute('role', 'listitem');
    item.appendChild(logisticsElement('span', 'logistics-legend-node-symbol', logisticsNodeSymbol(cssRole)));
    item.appendChild(logisticsElement('span', 'logistics-legend-label', logisticsNodeKindLabel(role)));
    nodeList.appendChild(item);
  }
  legend.appendChild(nodeList);
  parent.appendChild(legend);
}

function renderLogisticsMinimap(viewport, layout, graph, positions, viewportSize, camera, graphSvg, onCamera) {
  const nodeCount = graph.nodes.length;
  const bounds = layout?.bounds;
  if (!bounds || nodeCount < 3) { return null; }
  const shell = logisticsElement('div', 'logistics-minimap');
  shell.setAttribute('role', 'img'); shell.setAttribute('aria-label', T('webview.world.logisticsMinimap'));
  const mini = logisticsElement('div', 'logistics-minimap-canvas');
  shell.appendChild(mini); viewport.appendChild(shell);
  const regionLayer = logisticsElement('div', 'logistics-minimap-regions');
  const nodeLayer = logisticsElement('div', 'logistics-minimap-nodes');
  const viewportRect = logisticsElement('div', 'logistics-minimap-viewport');
  mini.appendChild(regionLayer); mini.appendChild(nodeLayer); mini.appendChild(viewportRect);
  let model = null; let drag = null; let semantic = null; let projectionBounds = null; let expansionFrame = null; let pendingCamera = null;
  const nodeInput = () => graph.nodes.map((node) => { const pos = positions.get(node.id); return { id: node.id, x: pos?.x || 0, y: pos?.y || 0, w: pos?.w || 0, h: pos?.h || 0, selected: economyLogisticsUiState.selection?.type === 'node' && economyLogisticsUiState.selection.id === node.id, current: typeof currentWorldLocationId === 'string' && node.locationId === currentWorldLocationId }; });
  function paint(nextCamera, canonical) {
    const nodes = nodeInput();
    const candidate = computeLogisticsMinimapProjectionBounds({ graphBounds: bounds, viewportSize, camera: nextCamera, nodes, regions: layout.regions });
    projectionBounds = canonical || !projectionBounds ? candidate : expandLogisticsMinimapProjectionBounds(projectionBounds, candidate);
    model = computeLogisticsMinimapModel({ graphBounds: bounds, viewportSize, camera: nextCamera, nodes, regions: layout.regions, options: { projectionBounds } });
    if (!regionLayer._built) {
      model.regionRects.forEach((region) => { const rect = logisticsElement('span', 'logistics-minimap-region'); rect.dataset.regionId = region.id; regionLayer.appendChild(rect); });
      model.nodeMarkers.forEach((node) => { const dot = logisticsElement('span', 'logistics-minimap-node'); dot.dataset.minimapNodeId = node.id; nodeLayer.appendChild(dot); });
      regionLayer._built = true;
    }
    const box = (element, rect) => { if (element?.style?.setProperty) { element.style.setProperty('left', `${rect.x}px`); element.style.setProperty('top', `${rect.y}px`); element.style.setProperty('width', `${rect.w}px`); element.style.setProperty('height', `${rect.h}px`); } };
    model.regionRects.forEach((region, index) => { box(regionLayer.children[index], region); });
    model.nodeMarkers.forEach((node, index) => { const dot = nodeLayer.children[index]; if (dot?.classList) { dot.classList.toggle('is-selected', Boolean(node.selected)); dot.classList.toggle('is-current', Boolean(node.current)); } box(dot, { x: node.x - (node.selected || node.current ? 2.5 : 1.5), y: node.y - (node.selected || node.current ? 2.5 : 1.5), w: node.selected || node.current ? 5 : 3, h: node.selected || node.current ? 5 : 3 }); });
    box(viewportRect, model.viewportRect);
    const nextSemantic = computeLogisticsSemanticZoom({ cameraScale: nextCamera.k, selection: economyLogisticsUiState.selection, options: { previousLevel: semantic } });
    semantic = nextSemantic.level;
    if (graphSvg?.classList) { graphSvg.classList.remove('is-zoom-overview', 'is-zoom-standard', 'is-zoom-detail'); graphSvg.classList.add(`is-zoom-${semantic}`); }
  }
  function update(nextCamera) { paint(nextCamera, false); }
  function canonical(nextCamera) {
    pendingCamera = null;
    if (expansionFrame !== null && typeof window.cancelAnimationFrame === 'function') { window.cancelAnimationFrame(expansionFrame); }
    expansionFrame = null;
    paint(nextCamera, true);
  }
  function expand(nextCamera) {
    pendingCamera = nextCamera;
    if (expansionFrame !== null) { return; }
    if (typeof window.requestAnimationFrame !== 'function') { const pending = pendingCamera; pendingCamera = null; paint(pending, false); return; }
    expansionFrame = window.requestAnimationFrame(() => {
      expansionFrame = null;
      const pending = pendingCamera; pendingCamera = null;
      paint(pending, false);
    });
  }
  function point(event) { const rect = mini.getBoundingClientRect ? mini.getBoundingClientRect() : { left: 0, top: 0 }; return { x: (Number(event.clientX) || 0) - (rect.left || 0), y: (Number(event.clientY) || 0) - (rect.top || 0) }; }
  function move(event, immediate) { if (!model) { return; } onCamera(logisticsMinimapCameraAt(model, point(event), viewportSize, onCamera.current()), immediate); }
  mini.addEventListener('pointerdown', (event) => { drag = event.pointerId; if (mini.setPointerCapture) { try { mini.setPointerCapture(drag); } catch {} } if (event.preventDefault) { event.preventDefault(); } move(event, false); });
  mini.addEventListener('pointermove', (event) => { if (drag === event.pointerId) { move(event, false); } });
  const end = (event) => { if (drag !== null && (event.pointerId === undefined || event.pointerId === drag)) { move(event, true); drag = null; } };
  mini.addEventListener('pointerup', end); mini.addEventListener('pointercancel', () => { drag = null; }); mini.addEventListener('lostpointercapture', () => { drag = null; });
  canonical(camera);
  return { update, expand, canonical, currentModel: () => model };
}

/** Camera updates touch only the group transform, the constant-screen-size
 * CSS var, and toolbar disabled state — never the graph DOM (L15 fix).
 * Non-finite cameras fall back to identity scale at origin rather than writing
 * translate(Infinity) into the SVG. */
function applyLogisticsCameraTransform(svg, cameraGroup, camera, toolbarEls) {
  const safe = logisticsIsValidCamera(camera)
    ? camera
    : { k: 1, tx: 0, ty: 0, userModified: false };
  cameraGroup.setAttribute('transform', `translate(${safe.tx} ${safe.ty}) scale(${safe.k})`);
  if (svg.style && typeof svg.style.setProperty === 'function') {
    svg.style.setProperty('--logistics-camera-k', String(safe.k));
  }
  if (toolbarEls) {
    toolbarEls.zoomInBtn.disabled = safe.k >= LOGISTICS_ZOOM_MAX - 1e-6;
    toolbarEls.zoomOutBtn.disabled = safe.k <= LOGISTICS_ZOOM_MIN + 1e-6;
  }
}

/** Discrete camera commands (buttons, 0, Shift+0) may ease briefly; wheel and
 * direct drag never do (always 1:1 with input). Reduced motion applies the
 * command immediately, with no transition class added. */
function logisticsEaseCameraCommand(cameraGroup, run) {
  const reduced = logisticsPrefersReducedMotion();
  if (!reduced && cameraGroup.classList && typeof cameraGroup.classList.add === 'function') {
    cameraGroup.classList.add('is-easing');
    if (typeof setTimeout === 'function') {
      setTimeout(() => {
        if (cameraGroup.classList) { cameraGroup.classList.remove('is-easing'); }
      }, LOGISTICS_CAMERA_EASE_MS);
    }
  }
  run();
}

function renderLogisticsCameraToolbar(viewport, onCommand) {
  const toolbar = logisticsElement('div', 'logistics-camera-toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', T('webview.world.logisticsCameraToolbar'));

  function makeButton(className, labelKey, command) {
    const btn = logisticsElement('button', `logistics-camera-btn ${className}`, T(labelKey));
    btn.type = 'button';
    btn.title = T(labelKey);
    btn.addEventListener('click', () => onCommand(command));
    toolbar.appendChild(btn);
    return btn;
  }

  const zoomOutBtn = makeButton('logistics-camera-zoom-out', 'webview.world.logisticsZoomOut', 'zoomOut');
  const zoomInBtn = makeButton('logistics-camera-zoom-in', 'webview.world.logisticsZoomIn', 'zoomIn');
  const fitBtn = makeButton('logistics-camera-fit', 'webview.world.logisticsFitAll', 'fitAll');
  const resetBtn = makeButton('logistics-camera-reset', 'webview.world.logisticsResetCamera', 'reset');
  const resetLayoutBtn = makeButton('logistics-layout-reset', 'webview.world.logisticsResetLayout', 'resetLayout');
  // Camera Reset and Layout Reset are visually adjacent but do different
  // things; explicit titles/aria keep them distinguishable.
  resetBtn.title = T('webview.world.logisticsResetCameraTitle');
  resetBtn.setAttribute('aria-label', T('webview.world.logisticsResetCameraTitle'));
  resetLayoutBtn.title = T('webview.world.logisticsResetLayoutTitle');
  resetLayoutBtn.setAttribute('aria-label', T('webview.world.logisticsResetLayoutTitle'));

  viewport.appendChild(toolbar);

  // Non-modal, polite live region for Layout Reset feedback. It survives a full
  // panel rerender because the message is stashed on the ui state and replayed
  // here on the next render.
  const layoutStatus = logisticsElement('div', 'logistics-layout-status');
  layoutStatus.setAttribute('role', 'status');
  layoutStatus.setAttribute('aria-live', 'polite');
  viewport.appendChild(layoutStatus);
  const pending = economyLogisticsUiState.layoutStatusMessage;
  if (pending) {
    layoutStatus.textContent = pending;
    layoutStatus.classList.add('is-visible');
    economyLogisticsUiState.layoutStatusMessage = null;
    if (typeof setTimeout === 'function') {
      setTimeout(() => { if (layoutStatus.classList) { layoutStatus.classList.remove('is-visible'); } }, 4000);
    }
  }

  return { toolbar, zoomOutBtn, zoomInBtn, fitBtn, resetBtn, resetLayoutBtn, layoutStatus };
}

function logisticsFindNodeTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList && el.classList.contains('logistics-node')) { return el; }
    el = el.parentNode;
  }
  return null;
}

/** Node or route under the pointer (selection targets; normal left-pan skips). */
function logisticsIsGraphContentTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList && (el.classList.contains('logistics-node') || el.classList.contains('logistics-route'))) {
      return true;
    }
    el = el.parentNode;
  }
  return false;
}

/** Toolbar, expand button, form controls, links — never start a left-button pan. */
function logisticsIsControlTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList) {
      if (
        el.classList.contains('logistics-camera-toolbar')
        || el.classList.contains('logistics-camera-btn')
        || el.classList.contains('logistics-expand-btn')
        || el.classList.contains('logistics-region-collapse')
        || el.classList.contains('logistics-region-collapse-hit')
      ) {
        return true;
      }
    }
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (
      tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA'
      || tag === 'A' || tag === 'OPTION' || tag === 'LABEL'
    ) {
      return true;
    }
    if (el.isContentEditable) { return true; }
    if (typeof el.getAttribute === 'function' && el.getAttribute('contenteditable') === 'true') {
      return true;
    }
    el = el.parentNode;
  }
  return false;
}

/** The minimap is inside the viewport; its own pointer handlers drive the
 * camera, so a click there must never clear the graph selection. */
function logisticsIsMinimapTarget(target, boundary) {
  let el = target;
  while (el && el !== boundary) {
    if (el.classList && el.classList.contains('logistics-minimap')) { return true; }
    el = el.parentNode;
  }
  return false;
}

/** Normal primary-button pan may begin only on SVG background / layer chrome. */
function logisticsIsBackgroundPanTarget(target, boundary) {
  if (!target || logisticsIsControlTarget(target, boundary) || logisticsIsGraphContentTarget(target, boundary)) {
    return false;
  }
  let el = target;
  while (el && el !== boundary) {
    const tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (tag === 'SVG' || tag === 'svg') { return true; }
    if (el.classList) {
      if (
        el.classList.contains('logistics-network')
        || el.classList.contains('logistics-camera')
        || el.classList.contains('layer-regions')
        || el.classList.contains('layer-edges')
        || el.classList.contains('layer-edges-raised')
        || el.classList.contains('layer-nodes')
        || el.classList.contains('layer-labels')
      ) {
        return true;
      }
    }
    el = el.parentNode;
  }
  // Direct hit on the viewport chrome (empty padding around the SVG) is also background.
  return target === boundary;
}

function logisticsIsFocusedButtonLike(doc) {
  const active = doc && doc.activeElement;
  if (!active) { return false; }
  const tag = active.tagName ? String(active.tagName).toUpperCase() : '';
  return tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA';
}

/** Wires wheel/drag/keyboard camera interactions on an already-mounted
 * viewport. Mutates the active host's camera context and repaints only via
 * applyLogisticsCameraTransform — never renderEconomyLogisticsPanel. */
/** Keep a dragged node from sitting inside another region's packed container.
 * Own region may still expand on the next layout pass; cross-region intrusion
 * is rejected by clamping the centre to the nearest exterior edge. */
function logisticsClampManualAwayFromOtherRegions(position, layout) {
  if (!position || !layout || !layout.regions || !position.regionId) { return; }
  const halfW = (Number.isFinite(position.w) ? position.w : 152) / 2;
  const halfH = (Number.isFinite(position.h) ? position.h : 60) / 2;
  for (const [regionId, region] of layout.regions) {
    if (regionId === position.regionId || !region) { continue; }
    const left = region.x;
    const right = region.x + region.w;
    const top = region.y;
    const bottom = region.y + region.h;
    // Node box intersects another region container.
    if (position.x + halfW <= left || position.x - halfW >= right
      || position.y + halfH <= top || position.y - halfH >= bottom) {
      continue;
    }
    const distLeft = Math.abs((position.x + halfW) - left);
    const distRight = Math.abs((position.x - halfW) - right);
    const distTop = Math.abs((position.y + halfH) - top);
    const distBottom = Math.abs((position.y - halfH) - bottom);
    const min = Math.min(distLeft, distRight, distTop, distBottom);
    if (min === distLeft) { position.x = left - halfW - 1; }
    else if (min === distRight) { position.x = right + halfW + 1; }
    else if (min === distTop) { position.y = top - halfH - 1; }
    else { position.y = bottom + halfH + 1; }
  }
}

function logisticsSetupCameraInteractions(ctx) {
  const { viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox, rendered, layout, onCameraChange } = ctx;
  const state = economyLogisticsUiState;
  const hostCtx = logisticsActiveCameraContext();
  const vp = logisticsSanitizeViewportSize(viewportSize);
  const doc = typeof document !== 'undefined' ? document : null;
  const win = typeof window !== 'undefined' ? window : null;

  function setCamera(next, immediateSave, projectionMode) {
    if (!logisticsIsValidCamera(next)) {
      // Retain last valid camera when an operation cannot produce a transform.
      if (logisticsIsValidCamera(hostCtx.camera)) { return; }
      next = logisticsDefaultCamera(vp);
    }
    hostCtx.camera = next;
    applyLogisticsCameraTransform(svg, cameraGroup, next, toolbarEls);
    if (typeof onCameraChange === 'function') { onCameraChange(next, projectionMode); }
    logisticsQueueCameraSave(Boolean(immediateSave));
  }

  function resetCamera() {
    logisticsStorageRemove(logisticsStorageKey('camera', state.scopeKey));
    logisticsCancelCameraSaves(state.scopeKey);
    hostCtx.identity = logisticsDatasetIdentity(state.payload);
    hostCtx.camera = logisticsFitAllCamera(currentBBox(), vp);
    applyLogisticsCameraTransform(svg, cameraGroup, hostCtx.camera, toolbarEls);
    if (typeof onCameraChange === 'function') { onCameraChange(hostCtx.camera, 'canonical'); }
  }

  function screenPointFromEvent(event) {
    const rect = typeof viewport.getBoundingClientRect === 'function'
      ? viewport.getBoundingClientRect() : { left: 0, top: 0 };
    const x = Number(event && event.clientX);
    const y = Number(event && event.clientY);
    return {
      x: (Number.isFinite(x) ? x : 0) - (rect.left || 0),
      y: (Number.isFinite(y) ? y : 0) - (rect.top || 0),
    };
  }

  viewport.addEventListener('wheel', (event) => {
    if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    const point = screenPointFromEvent(event);
    setCamera(logisticsZoomFromWheel(hostCtx.camera, point, logisticsWheelDeltaY(event)));
  }, { passive: false });

  // Initiating pointer ID is the drag invariant. Cleanup is idempotent.
  let drag = null;
  let suppressClick = false;
  let cleaningUp = false;
  let nodeDragFrame = null;
  let pendingNodeDrag = null;

  /** Paint one coherent live node frame from the latest pointer sample. The
   * authoritative position is written before any consumer reads it; region,
   * incident routes and minimap then observe the same coordinates. */
  function paintNodeDragFrame(update) {
    if (!update) { return; }
    const position = rendered.positions.get(update.nodeId);
    if (!position) { return; }
    // Ensure drag-session is active for every paint frame (covers restored
    // session identity if a re-render replaced route groups mid-drag).
    if (!economyLogisticsUiState.nodeDragSession?.active
      || economyLogisticsUiState.nodeDragSession.movedNodeId !== update.nodeId) {
      logisticsBeginNodeDragSession(rendered, update.nodeId);
    }
    position.x = update.x;
    position.y = update.y;
    logisticsClampManualAwayFromOtherRegions(position, layout);
    const nodeEl = rendered.nodeElements.get(update.nodeId);
    if (nodeEl) {
      const transform = logisticsNodeTransform(position);
      nodeEl.setAttribute('transform', transform);
      nodeEl._logisticsAnnotations?.setAttribute('transform', transform);
    }
    logisticsLiveUpdateOwningRegion(rendered, layout, update.nodeId, false);
    logisticsRefreshRoutesAfterMove(rendered, update.nodeId);
    logisticsPurgeSuppressedFlowDots(rendered);
    rendered.minimap?.expand?.(hostCtx.camera);
  }

  function flushPendingNodeDrag() {
    if (nodeDragFrame !== null && typeof win?.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(nodeDragFrame);
    }
    nodeDragFrame = null;
    const update = pendingNodeDrag;
    pendingNodeDrag = null;
    paintNodeDragFrame(update);
  }

  function cancelPendingNodeDrag() {
    if (nodeDragFrame !== null && typeof win?.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(nodeDragFrame);
    }
    nodeDragFrame = null;
    pendingNodeDrag = null;
  }

  function scheduleNodeDrag(update) {
    pendingNodeDrag = update;
    if (nodeDragFrame !== null) { return; }
    if (typeof win?.requestAnimationFrame !== 'function') {
      flushPendingNodeDrag();
      return;
    }
    nodeDragFrame = win.requestAnimationFrame(() => {
      nodeDragFrame = null;
      const latest = pendingNodeDrag;
      pendingNodeDrag = null;
      paintNodeDragFrame(latest);
    });
  }

  function releaseStoredCapture() {
    if (!drag || drag.pointerId === undefined || drag.pointerId === null) { return; }
    if (typeof viewport.releasePointerCapture === 'function') {
      try { viewport.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    }
  }

  function cleanupDrag(options = {}) {
    if (!drag || cleaningUp) { return; }
    cleaningUp = true;
    const active = drag;
    // Snapshot drag-session membership before any geometry flush can re-arm it.
    const sessionRouteIds = active.type === 'node'
      ? (logisticsAffectedRouteIdsForNode(active.nodeId, rendered.routeTopologyIndex) || [])
      : [];
    const sessionContextId = active.type === 'node'
      ? economyLogisticsUiState.nodeDragSession?.renderedContextId : null;
    if (active.type === 'node') {
      if (options.restoreNode) { cancelPendingNodeDrag(); } else { flushPendingNodeDrag(); }
    }
    if (options.restoreCamera && active.startCamera) {
      setCamera(active.startCamera);
    }
    if (active.type === 'node') {
      const position = rendered.positions.get(active.nodeId);
      if (options.restoreNode && position) {
        position.x = active.startNode.x;
        position.y = active.startNode.y;
        const nodeEl = rendered.nodeElements.get(active.nodeId);
        if (nodeEl) {
          const transform = logisticsNodeTransform(position);
          nodeEl.setAttribute('transform', transform);
          nodeEl._logisticsAnnotations?.setAttribute('transform', transform);
        }
        logisticsLiveUpdateOwningRegion(rendered, layout, active.nodeId, false);
        logisticsRefreshRoutesAfterMove(rendered, active.nodeId);
        rendered.minimap?.canonical?.(hostCtx.camera);
      } else if (active.moved && options.commitNode && position) {
        logisticsClampManualAwayFromOtherRegions(position, layout);
        position.x = Math.round(position.x); position.y = Math.round(position.y);
        // Fixed world coordinates (space: 'world'). Layout applies them as
        // fixed obstacles and resolves automatics only within the same region,
        // so a drop in region A cannot move region B members or re-origin them.
        // Optional space:'local' entries (tests/migrations) are applied as
        // pack-offset + local inside computeLogisticsLayout.
        const stored = {
          x: position.x,
          y: position.y,
          regionId: position.regionId,
          ts: Date.now(),
          space: 'world',
        };
        const nodeEl = rendered.nodeElements.get(active.nodeId);
        if (nodeEl) {
          const transform = logisticsNodeTransform(position);
          nodeEl.setAttribute('transform', transform);
          nodeEl._logisticsAnnotations?.setAttribute('transform', transform);
        }
        // Finalize the owning region's bounds from the rounded/clamped commit
        // position so a subsequent full rerender is byte-identical.
        logisticsLiveUpdateOwningRegion(rendered, layout, active.nodeId, false);
        logisticsRefreshRoutesAfterMove(rendered, active.nodeId);
        rendered.minimap?.canonical?.(hostCtx.camera);
        economyLogisticsUiState.manualPositions[active.nodeId] = stored;
        logisticsSaveLayoutPositions();
        // A manual override now exists; enable Layout Reset immediately without
        // waiting for a full panel rerender.
        if (toolbarEls && toolbarEls.resetLayoutBtn) {
          toolbarEls.resetLayoutBtn.disabled = false;
          toolbarEls.resetLayoutBtn.title = T('webview.world.logisticsResetLayoutTitle');
          toolbarEls.resetLayoutBtn.setAttribute('aria-label', T('webview.world.logisticsResetLayoutTitle'));
        }
      }
      // Keep suppression active through the final rounded position, route/line/
      // annotation and minimap commits. Only the context that owns this drag may
      // then rebuild particles, each from its live line's current d.
      const restoreInActiveContext = economyLogisticsUiState.rendered === rendered
        && rendered.contextId === sessionContextId
        && logisticsCameraHostKey() === sessionContextId;
      logisticsEndNodeDragSession();
      if (restoreInActiveContext) {
        // Session begins on pointerdown, so even a no-move click restores dots.
        for (const routeId of sessionRouteIds) {
          const group = rendered.routeElements.get(routeId);
          if (group && group._logisticsRoute && group._logisticsGeometry && group._logisticsStyle && group._logisticsParts) {
            const route = group._logisticsRoute;
            const style = group._logisticsStyle;
            const relevanceKind = group.dataset.relevance || 'unrelated';
            logisticsClearRouteParticles(group);
            if (logisticsRouteMayShowFlowParticles(route, 'primary', style)) {
              group._logisticsParts.particles = logisticsRenderFlowParticles(
                group, route, group._logisticsGeometry, group._logisticsParts.line
              );
            }
            logisticsApplyFlowParticleVisibility(group, route, relevanceKind);
          }
        }
        rendered.lastFlowParticleAudit = logisticsAuditActiveFlowDots(rendered);
      }
    }
    if (active.moved && options.commitNode) {
      suppressClick = active.type === 'node' ? { nodeId: active.nodeId } : { nodeId: null };
      if (typeof setTimeout === 'function') { setTimeout(() => { suppressClick = false; }, 0); }
    }
    releaseStoredCapture();
    if (viewport.classList) { viewport.classList.remove('is-panning', 'is-node-dragging'); }
    if (active.type === 'camera' && active.moved) { logisticsQueueCameraSave(true); }
    drag = null;
    cleaningUp = false;
  }

  viewport.addEventListener('pointerdown', (event) => {
    // A second pointer cannot hijack an active drag.
    if (drag) { return; }
    const button = Number(event.button);
    const isMiddle = button === 1;
    const isPrimary = button === 0;
    if (!isMiddle && !isPrimary) { return; }

    // Middle-button pan must not activate controls / scroll gestures.
    if (isMiddle && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    const onControl = logisticsIsControlTarget(event.target, viewport);
    const onContent = logisticsIsGraphContentTarget(event.target, viewport);
    const isSpace = state.spaceHeld;

    const nodeTarget = isPrimary && !isSpace ? logisticsFindNodeTarget(event.target, viewport) : null;
    const nodeId = nodeTarget?.dataset?.nodeId;
    const nodePosition = nodeId ? rendered.positions.get(nodeId) : null;
    if (nodeTarget && nodePosition && !nodePosition.aggregate) {
      const startX = Number(event.clientX);
      const startY = Number(event.clientY);
      drag = {
        type: 'node', nodeId, pointerId: event.pointerId,
        startX: Number.isFinite(startX) ? startX : 0, startY: Number.isFinite(startY) ? startY : 0,
        startCamera: hostCtx.camera, startNode: { x: nodePosition.x, y: nodePosition.y }, moved: false,
      };
      // Begin authoritative particle suppression immediately on pointerdown so
      // no filter/selection/raise refresh can recreate dots before the first move.
      logisticsBeginNodeDragSession(rendered, nodeId);
      if (typeof viewport.setPointerCapture === 'function' && event.pointerId !== undefined) {
        try { viewport.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
      }
      if (viewport.classList) { viewport.classList.add('is-node-dragging'); }
      return;
    }

    if (isPrimary && !isSpace) {
      // Normal left-button: background only (SVG / permitted layers).
      if (onControl || onContent || !logisticsIsBackgroundPanTarget(event.target, viewport)) {
        return;
      }
    } else if (isPrimary && isSpace) {
      // Space+primary may pan over nodes/routes but never from controls.
      if (onControl) { return; }
    } else if (isMiddle) {
      // Middle may pan over nodes/routes; still skip pure control chrome so
      // toolbar buttons are not entangled with a pan gesture.
      if (onControl) { return; }
    }

    const startX = Number(event.clientX);
    const startY = Number(event.clientY);
    drag = {
      type: 'camera',
      pointerId: event.pointerId,
      startX: Number.isFinite(startX) ? startX : 0,
      startY: Number.isFinite(startY) ? startY : 0,
      startCamera: hostCtx.camera,
      moved: false,
    };
    if (typeof viewport.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try { viewport.setPointerCapture(event.pointerId); } catch { /* capture unsupported */ }
    }
    if (viewport.classList) { viewport.classList.add('is-panning'); }
  });

  function endDrag(event) {
    if (!drag) { return; }
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    cleanupDrag({ commitNode: true });
  }

  viewport.addEventListener('pointermove', (event) => {
    if (!drag) { return; }
    if (event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    const cx = Number(event.clientX);
    const cy = Number(event.clientY);
    const dx = (Number.isFinite(cx) ? cx : 0) - drag.startX;
    const dy = (Number.isFinite(cy) ? cy : 0) - drag.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) { return; }
    if (!drag.moved && Math.hypot(dx, dy) < LOGISTICS_DRAG_THRESHOLD_PX) { return; }
    drag.moved = true;
    if (drag.type === 'node') {
      if (!logisticsIsValidCamera(drag.startCamera)) { return; }
      scheduleNodeDrag({
        nodeId: drag.nodeId,
        x: drag.startNode.x + dx / drag.startCamera.k,
        y: drag.startNode.y + dy / drag.startCamera.k,
      });
      return;
    }
    const base = drag.startCamera;
    if (!logisticsIsValidCamera(base)) { return; }
    const next = { k: base.k, tx: base.tx + dx, ty: base.ty + dy, userModified: true };
    setCamera(next);
  });
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', (event) => {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) { return; }
    cleanupDrag({ restoreNode: drag.type === 'node' });
  });
  viewport.addEventListener('lostpointercapture', (event) => {
    if (!drag) { return; }
    if (event && event.pointerId !== undefined && event.pointerId !== drag.pointerId) { return; }
    cleanupDrag({ restoreNode: drag.type === 'node' });
  });

  // Suppress the synthesized click that follows a real pan (threshold crossed).
  viewport.addEventListener('click', (event) => {
    if (!suppressClick) { return; }
    if (logisticsIsControlTarget(event.target, viewport)) { return; }
    const nodeTarget = logisticsFindNodeTarget(event.target, viewport);
    if (suppressClick.nodeId && nodeTarget?.dataset?.nodeId !== suppressClick.nodeId) { return; }
    suppressClick = false;
    if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
  }, true);

  // Background click (SVG chrome — not a node, route, control or minimap)
  // returns the graph to the neutral state: a discoverable pointer alternative
  // to Escape. Runs in bubble phase, after any node/route activation handler,
  // so selecting a different entity is never undone. Camera/layout untouched.
  viewport.addEventListener('click', (event) => {
    if (!economyLogisticsUiState.selection) { return; }
    if (logisticsIsGraphContentTarget(event.target, viewport)) { return; }
    if (logisticsIsControlTarget(event.target, viewport)) { return; }
    if (logisticsIsMinimapTarget(event.target, viewport)) { return; }
    activateLogisticsSelection(null);
  });

  function currentBBox() { return bbox; }

  function onWindowBlur() {
    cleanupDrag({ restoreNode: drag?.type === 'node' });
    state.spaceHeld = false;
  }
  if (win && typeof win.addEventListener === 'function') {
    win.addEventListener('blur', onWindowBlur);
  }

  viewport.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat) {
      // Space on a focused toolbar/control button must keep native activation.
      // Only when the viewport itself owns focus (or a non-control descendant)
      // does Space become a pan modifier and prevent page scroll.
      if (logisticsIsFocusedButtonLike(doc) && logisticsIsControlTarget(doc.activeElement, viewport)) {
        return;
      }
      state.spaceHeld = true;
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
    }
    if (event.key === 'Escape' && drag) {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      cleanupDrag({ restoreCamera: drag.type === 'camera', restoreNode: drag.type === 'node' });
      return;
    }
    const arrow = {
      ArrowUp: { dx: 0, dy: 1 }, ArrowDown: { dx: 0, dy: -1 },
      ArrowLeft: { dx: 1, dy: 0 }, ArrowRight: { dx: -1, dy: 0 },
    }[event.key];
    if (arrow) {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      const step = event.shiftKey ? LOGISTICS_PAN_STEP_FAST : LOGISTICS_PAN_STEP;
      setCamera(logisticsPanBy(hostCtx.camera, arrow.dx * step, arrow.dy * step));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      logisticsEaseCameraCommand(cameraGroup, () => setCamera(logisticsZoomByStep(hostCtx.camera, vp, 1)));
      return;
    }
    if (event.key === '-') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      logisticsEaseCameraCommand(cameraGroup, () => setCamera(logisticsZoomByStep(hostCtx.camera, vp, -1)));
      return;
    }
    // Shift+0 often reports key ')' on US layouts; check the physical key
    // (code) so Reset Camera is reachable regardless of layout. Fit All and
    // Reset Camera resolve identically in this slice — there is no persisted
    // camera or manual node layout yet to distinguish them from.
    if (event.code === 'Digit0' || event.key === '0' || event.key === ')') {
      if (typeof event.preventDefault === 'function') { event.preventDefault(); }
      const identity = logisticsDatasetIdentity(state.payload);
      logisticsEaseCameraCommand(cameraGroup, () => {
        if (event.shiftKey) { resetCamera(); return; }
        const next = logisticsFitAllCamera(currentBBox(), vp);
        hostCtx.identity = identity;
        setCamera(next, true, 'canonical');
      });
    }
  });
  viewport.addEventListener('keyup', (event) => {
    if (event.code === 'Space') { state.spaceHeld = false; }
  });
  viewport.addEventListener('blur', () => { state.spaceHeld = false; });
  viewport.addEventListener('focusout', () => { state.spaceHeld = false; });

  return {
    setCamera,
    currentCamera() { return hostCtx.camera; },
    onToolbarCommand(command) {
      const identity = logisticsDatasetIdentity(state.payload);
      logisticsEaseCameraCommand(cameraGroup, () => {
        if (command === 'zoomIn') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, 1), true); return; }
        if (command === 'zoomOut') { setCamera(logisticsZoomByStep(hostCtx.camera, vp, -1), true); return; }
        if (command === 'resetLayout') {
          // window.confirm is unreliable inside VS Code webviews (frequently a
          // silent no-op), which is exactly why the human saw "nothing happens".
          // Reset directly and report the outcome through the polite live region.
          const hasOverrides = Object.keys(economyLogisticsUiState.manualPositions || {}).length > 0;
          if (!hasOverrides) {
            economyLogisticsUiState.layoutStatusMessage = T('webview.world.logisticsResetLayoutNoneStatus');
            renderEconomyLogisticsPanel();
            return;
          }
          logisticsStorageRemove(logisticsStorageKey('layout', state.scopeKey));
          state.manualPositions = {};
          hostCtx.camera = null;
          economyLogisticsUiState.layoutStatusMessage = T('webview.world.logisticsResetLayoutDoneStatus');
          renderEconomyLogisticsPanel();
          return;
        }
        if (command === 'reset') { resetCamera(); return; }
        hostCtx.identity = identity;
        setCamera(logisticsFitAllCamera(currentBBox(), vp), true, 'canonical');
      });
    },
  };
}

function renderLogisticsRegionContainers(layer, layerLabels, payload, layout, rendered) {
  const protectedRegionIds = logisticsCurrentLocationRegionIds(payload);
  if (rendered && !rendered.regionElements) { rendered.regionElements = new Map(); }
  for (const [regionId, region] of [...layout.regions.entries()].sort((a, b) => logisticsLayoutCompareId(a[0], b[0]))) {
    const group = logisticsSvgElement('g', `logistics-region${economyLogisticsUiState.collapsedRegionIds.has(regionId) ? ' is-collapsed' : ''}`);
    group.dataset.regionId = regionId;
    const rect = logisticsSvgElement('rect', 'logistics-region-box');
    rect.setAttribute('x', String(region.x)); rect.setAttribute('y', String(region.y));
    rect.setAttribute('width', String(region.w)); rect.setAttribute('height', String(region.h)); rect.setAttribute('rx', '14');
    group.appendChild(rect);
    const control = logisticsSvgElement('g', 'logistics-region-collapse');
    const protectedRegion = protectedRegionIds.has(regionId);
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.setAttribute('aria-expanded', economyLogisticsUiState.collapsedRegionIds.has(regionId) ? 'false' : 'true');
    control.setAttribute('aria-label', protectedRegion ? T('webview.world.logisticsCannotCollapseCurrentRegion') : T(economyLogisticsUiState.collapsedRegionIds.has(regionId) ? 'webview.world.logisticsExpandRegion' : 'webview.world.logisticsCollapseRegion'));
    if (protectedRegion) { control.setAttribute('aria-disabled', 'true'); appendLogisticsTitle(control, T('webview.world.logisticsCannotCollapseCurrentRegion')); }
    const hit = logisticsSvgElement('rect', 'logistics-region-collapse-hit');
    hit.setAttribute('x', String(region.x + 4)); hit.setAttribute('y', String(region.y + 2));
    hit.setAttribute('width', String(Math.max(120, Math.min(region.w - 8, 260)))); hit.setAttribute('height', '28');
    hit.setAttribute('rx', '5');
    control.appendChild(hit);
    const label = logisticsSvgElement('text', `logistics-region-label${protectedRegion ? ' is-protected' : ''}`);
    label.setAttribute('x', String(region.x + 12)); label.setAttribute('y', String(region.y + 20));
    // Protected (current-location) regions cannot collapse; a persistent lock
    // glyph makes that intentional state visible instead of relying on a
    // hover-only tooltip / prohibited cursor.
    const collapseGlyph = protectedRegion ? '🔒' : (economyLogisticsUiState.collapsedRegionIds.has(regionId) ? '▸' : '▾');
    label.textContent = `${collapseGlyph} ${region.label} (${region.memberIds.length})`;
    label.setAttribute('pointer-events', 'none');
    const toggle = () => {
      if (protectedRegion) { return; }
      if (economyLogisticsUiState.collapsedRegionIds.has(regionId)) { economyLogisticsUiState.collapsedRegionIds.delete(regionId); }
      else { economyLogisticsUiState.collapsedRegionIds.add(regionId); }
      logisticsSavePrefs();
      renderEconomyLogisticsPanel();
    };
    control.addEventListener('click', (event) => { if (event?.stopPropagation) { event.stopPropagation(); } toggle(); });
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
    });
    control.addEventListener('focus', () => label.classList.add('is-focus-visible'));
    control.addEventListener('blur', () => label.classList.remove('is-focus-visible'));
    group.appendChild(control);
    layer.appendChild(group);
    layerLabels.appendChild(label);
    if (rendered && rendered.regionElements) {
      rendered.regionElements.set(regionId, { group, rect, hit, label, region });
    }
  }
}

/** Recompute a single region's dashed-container bounds from the live positions
 * of its members and push them straight to the already-rendered rect / label /
 * hit-area, plus the minimap projection — without a full panel render or a
 * complete graph relayout. The formula is byte-identical to the bounds
 * finalization in computeLogisticsLayout (85b1), so committing a drag and then
 * doing a full rerender yields the same region box. Only the owning region is
 * touched; unrelated regions are never read or written. */
function logisticsLiveUpdateOwningRegion(rendered, layout, nodeId, updateMinimap = true) {
  if (!rendered || !layout || !layout.regions) { return; }
  const position = rendered.positions?.get(nodeId);
  const regionId = position?.regionId;
  if (!regionId) { return; }
  const region = layout.regions.get(regionId);
  if (!region) { return; }
  const members = region.memberIds.map((id) => rendered.positions.get(id)).filter(Boolean);
  if (!members.length) { return; }
  const minX = Math.min(...members.map((pos) => pos.x - pos.w / 2));
  const minY = Math.min(...members.map((pos) => pos.y - pos.h / 2));
  const maxX = Math.max(...members.map((pos) => pos.x + pos.w / 2));
  const maxY = Math.max(...members.map((pos) => pos.y + pos.h / 2));
  region.x = minX - LOGISTICS_LAYOUT_REGION_PADDING;
  region.y = minY - LOGISTICS_LAYOUT_REGION_PADDING - 24;
  region.w = maxX - minX + LOGISTICS_LAYOUT_REGION_PADDING * 2;
  region.h = maxY - minY + LOGISTICS_LAYOUT_REGION_PADDING * 2 + 24;
  const refs = rendered.regionElements?.get(regionId);
  if (refs) {
    if (refs.rect) {
      refs.rect.setAttribute('x', String(region.x)); refs.rect.setAttribute('y', String(region.y));
      refs.rect.setAttribute('width', String(region.w)); refs.rect.setAttribute('height', String(region.h));
    }
    if (refs.label) {
      refs.label.setAttribute('x', String(region.x + 12)); refs.label.setAttribute('y', String(region.y + 20));
    }
    if (refs.hit) {
      refs.hit.setAttribute('x', String(region.x + 4)); refs.hit.setAttribute('y', String(region.y + 2));
      refs.hit.setAttribute('width', String(Math.max(120, Math.min(region.w - 8, 260))));
    }
  }
  if (updateMinimap && rendered.minimap && typeof rendered.minimap.expand === 'function') {
    rendered.minimap.expand(logisticsActiveCameraContext().camera);
  }
}

function renderLogisticsNetwork(payload, parent) {
  logisticsEnsureScope(payload);
  const data = visibleLogisticsData(payload);
  renderLogisticsLegend(parent);
  // Best-effort synchronous read of the (already laid out) render target so
  // the very first paint already picks the right mode instead of always
  // starting compact and correcting itself once ResizeObserver's async
  // initial callback lands a frame later (visible as a brief flash when the
  // host — sidebar column or lightbox — is actually wide, e.g. right after
  // opening the "view large" lightbox).
  let hostWidth = 0;
  if (typeof parent.clientWidth === 'number' && parent.clientWidth > 0) {
    hostWidth = parent.clientWidth;
  } else if (typeof parent.getBoundingClientRect === 'function') {
    hostWidth = parent.getBoundingClientRect().width || 0;
  }
  if (hostWidth > 0) {
    economyLogisticsUiState.compactAnimation = hostWidth < LOGISTICS_COMPACT_WIDTH_PX;
  }
  let lightboxHeight = LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX;
  if (economyLogisticsUiState.lightboxHost) {
    // Maximize: use the full body client area so the SVG fills available space
    // without Fit All (camera k/tx/ty stay as stored).
    const bodyH = Number(economyLogisticsUiState.lightboxHost.clientHeight);
    if (Number.isFinite(bodyH) && bodyH > 0) {
      lightboxHeight = Math.max(LOGISTICS_VIEWPORT_HEIGHT_LIGHTBOX, Math.floor(bodyH - 8));
    }
  }
  const viewportSize = {
    width: hostWidth > 0 ? hostWidth : LOGISTICS_VIEWPORT_WIDTH_FALLBACK,
    height: economyLogisticsUiState.lightboxHost ? lightboxHeight : LOGISTICS_VIEWPORT_HEIGHT,
  };
  const viewport = logisticsElement('div', 'logistics-network-viewport');
  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', T('webview.world.logisticsAria'));
  if (economyLogisticsUiState.lightboxHost && economyLogisticsUiState.lightboxMaximized) {
    viewport.classList.add('is-lightbox-maximized');
  }
  if (!economyLogisticsUiState.lightboxHost) {
    const expandBtn = logisticsElement('button', 'logistics-expand-btn', '⤢');
    expandBtn.type = 'button';
    expandBtn.title = T('webview.world.logisticsExpand');
    expandBtn.setAttribute('aria-label', T('webview.world.logisticsExpand'));
    expandBtn.addEventListener('click', () => logisticsOpenLightbox(expandBtn));
    viewport.appendChild(expandBtn);
  }
  if (data.routes.length === 0) {
    const empty = logisticsElement('p', 'empty-text logistics-filter-empty', T('webview.world.logisticsFilterEmpty'));
    viewport.appendChild(empty);
  }
  // Always feed the complete payload into the pure layout; filters only dim.
  const layout = buildLogisticsLayout(payload.nodes || [], payload.routes || [], {
    manualPositions: economyLogisticsUiState.manualPositions,
    collapsedRegionIds: economyLogisticsUiState.collapsedRegionIds,
  });
  // A manual coordinate belongs to the region it was dragged in. Once the
  // payload says otherwise, delete it from this scope so it cannot resurrect
  // when the node later returns to the old region.
  logisticsPruneWrongRegionManualPositions(layout);
  economyLogisticsUiState.layout = layout;
  const rendered = {
    positions: new Map(),
    nodeElements: new Map(),
    routeElements: new Map(),
    contextId: economyLogisticsUiState.lightboxHost ? 'lightbox' : 'normal',
    svg: null,
    viewport: null,
  };
  const graph = logisticsBuildRenderedGraph(payload, layout, data.commodityId);
  rendered.positions = graph.positions;
  rendered.graphRoutes = graph.routes;
  rendered.graphNodes = graph.nodes;
  economyLogisticsUiState.rendered = rendered;
  const motionActive = logisticsFlowMotionActive();
  const svgClass = `logistics-network${motionActive ? ' is-animated' : ''}${economyLogisticsUiState.compactAnimation ? ' is-compact' : ''}`;
  const svg = logisticsSvgElement('svg', svgClass);
  svg.setAttribute('viewBox', `0 0 ${viewportSize.width} ${viewportSize.height}`);
  svg.setAttribute('aria-hidden', 'true');
  const defs = logisticsSvgElement('defs');
  ['open', 'rumored', 'impaired', 'blocked', 'bottleneck', 'conflicted', 'unknown'].forEach((status) => {
    const marker = logisticsSvgElement('marker', `logistics-arrow logistics-arrow-${status}`);
    marker.id = `logistics-arrow-${status}`;
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    // Fixed-size arrowheads: the default strokeWidth marker units make
    // high-volume routes grow node-sized triangles.
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('markerWidth', '13');
    marker.setAttribute('markerHeight', '13');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = logisticsSvgElement('path', 'logistics-arrow-path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    marker.appendChild(arrow);
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  const cameraGroup = logisticsSvgElement('g', 'logistics-camera');
  const layerRegions = logisticsSvgElement('g', 'layer-regions');
  const layerEdges = logisticsSvgElement('g', 'layer-edges');
  const layerEdgesRaised = logisticsSvgElement('g', 'layer-edges-raised');
  const layerNodes = logisticsSvgElement('g', 'layer-nodes');
  const layerLabels = logisticsSvgElement('g', 'layer-labels');
  [layerRegions, layerEdges, layerEdgesRaised, layerNodes, layerLabels].forEach((layer) => cameraGroup.appendChild(layer));
  svg.appendChild(cameraGroup);

  renderLogisticsRegionContainers(layerRegions, layerLabels, payload, layout, rendered);
  // One shared, obstacle-aware geometry computation for the whole route set;
  // every consumer (stroke, hit path, arrow, particles, label, warning, drag
  // refresh) reads from this single result. See 85b2-logistics-route-geometry.js.
  const labelMetrics = logisticsRouteLabelMetrics(graph.routes);
  const routeTopologyIndex = buildLogisticsRouteTopologyIndex(graph.routes);
  const geometryResult = computeLogisticsRouteGeometry({ routes: graph.routes, positions: graph.positions, labelMetrics, topologyIndex: routeTopologyIndex });
  const selection = economyLogisticsUiState.selection || null;
  const filterModel = computeLogisticsFilterModel({ nodes: graph.nodes, routes: graph.routes, commodities: payload.commodities || [], regions: layout.regions, query: economyLogisticsUiState.searchQuery, commodityId: economyLogisticsUiState.commodityId, statusKeys: [...economyLogisticsUiState.statusKeys] });
  const visualEncoding = computeLogisticsVisualEncoding({
    routes: graph.routes,
    nodes: graph.nodes,
    commodities: payload.commodities || [],
    selectedCommodityId: data.commodityId,
    selectedRouteId: selection?.type === 'route' ? selection.id : null,
    selectedNodeId: selection?.type === 'node' ? selection.id : null,
    currentLocationId: typeof currentWorldLocationId === 'string' ? currentWorldLocationId : null,
    options: { geometryByRoute: geometryResult.routes, shortages: data.shortages, filterModel },
  });
  rendered.geometryRoutes = graph.routes;
  rendered.geometryLabelMetrics = labelMetrics;
  rendered.routeTopologyIndex = routeTopologyIndex;
  rendered.routeGeoms = geometryResult.routes;
  rendered.visualEncoding = visualEncoding;
  rendered.filterModel = filterModel;
  logisticsUpdateFilterCount(filterModel);
  graph.routes.forEach((route) => renderLogisticsRoute(layerEdges, layerEdgesRaised, layerLabels, payload, route, geometryResult.routes.get(route.id), visualEncoding.routeStyles.get(route.id), rendered));
  graph.nodes.forEach((node) => {
    const position = graph.positions.get(node.id);
    if (position) { renderLogisticsNode(layerNodes, layerLabels, payload, node, position, data.shortages, graph.routes, visualEncoding.nodeStyles.get(node.id), rendered); }
  });
  viewport.appendChild(svg);
  rendered.svg = svg;
  rendered.viewport = viewport;
  // If a full re-render lands during an active drag (filter/search/selection),
  // re-apply suppression so newly created route groups stay particle-free.
  if (economyLogisticsUiState.nodeDragSession?.active) {
    logisticsPurgeSuppressedFlowDots(rendered);
  }

  const bbox = layout.bounds;
  const camera = logisticsResolveCameraForRender(payload, bbox, viewportSize);
  const toolbarEls = renderLogisticsCameraToolbar(viewport, (command) => interactions.onToolbarCommand(command));
  // Layout Reset is meaningful only when manual node positions exist; otherwise
  // it is disabled with an explanatory title so it is never a silent dead
  // control, and stays distinct from the always-available Camera Reset.
  const hasLayoutOverrides = Object.keys(economyLogisticsUiState.manualPositions || {}).length > 0;
  toolbarEls.resetLayoutBtn.disabled = !hasLayoutOverrides;
  if (!hasLayoutOverrides) {
    toolbarEls.resetLayoutBtn.title = T('webview.world.logisticsResetLayoutNoneTitle');
    toolbarEls.resetLayoutBtn.setAttribute('aria-label', T('webview.world.logisticsResetLayoutNoneTitle'));
  }
  applyLogisticsCameraTransform(svg, cameraGroup, camera, toolbarEls);
  let minimap = null;
  const interactions = logisticsSetupCameraInteractions({ viewport, svg, cameraGroup, toolbarEls, viewportSize, bbox, rendered, layout, onCameraChange: (next, mode) => { if (minimap) { if (mode === 'canonical') { minimap.canonical(next); } else { minimap.update(next); } } } });
  const minimapCamera = (next, immediate) => interactions.setCamera(next, immediate);
  minimapCamera.current = () => interactions.currentCamera();
  minimap = renderLogisticsMinimap(viewport, layout, graph, graph.positions, viewportSize, camera, svg, minimapCamera);
  rendered.minimap = minimap;

  parent.appendChild(viewport);
  logisticsObserveNetworkWidth(viewport);
}

function appendLogisticsDetailRow(parent, label, value) {
  const row = logisticsElement('div', 'logistics-detail-row');
  row.appendChild(logisticsElement('span', 'logistics-detail-label', label));
  row.appendChild(logisticsElement('span', 'logistics-detail-value', value));
  parent.appendChild(row);
}

function renderLogisticsDetails(payload, parent) {
  const details = logisticsElement('div', 'logistics-details');
  details.setAttribute('aria-live', 'polite');
  const headingRow = logisticsElement('div', 'logistics-details-heading');
  headingRow.appendChild(logisticsElement('strong', '', T('webview.world.logisticsDetails')));
  const clear = logisticsElement('button', 'logistics-clear-btn', T('webview.world.logisticsClearSelection'));
  clear.type = 'button';
  clear.disabled = !economyLogisticsUiState.selection;
  clear.title = T('webview.world.logisticsSelectionClearHint');
  clear.setAttribute('aria-label', `${T('webview.world.logisticsClearSelection')} — ${T('webview.world.logisticsSelectionClearHint')}`);
  clear.addEventListener('click', () => {
    economyLogisticsUiState.selection = null;
    renderEconomyLogisticsPanel();
  });
  headingRow.appendChild(clear);
  details.appendChild(headingRow);
  if (economyLogisticsUiState.selection) {
    // Compact discoverability hint, not a permanent instruction panel: shown
    // only while something is selected.
    details.appendChild(logisticsElement('p', 'logistics-selection-hint', T('webview.world.logisticsSelectionClearHint')));
  }

  const selection = economyLogisticsUiState.selection;
  if (!selection) {
    details.appendChild(logisticsElement('p', 'img-gen-hint', T('webview.world.logisticsSelectHint')));
  } else if (selection.type === 'route') {
    const route = (payload.routes || []).find((item) => item.id === selection.id);
    if (route) {
      appendLogisticsDetailRow(details, T('webview.world.logisticsRoute'), route.id);
      appendLogisticsDetailRow(details, T('webview.world.logisticsCommodity'), logisticsCommodityName(payload, route.commodityId));
      appendLogisticsDetailRow(details, T('webview.world.logisticsDirection'), `${logisticsNodeName(payload, route.fromNodeId)} → ${logisticsNodeName(payload, route.toNodeId)}`);
      appendLogisticsDetailRow(details, T('webview.world.logisticsStatus'), logisticsStatusLabel(route.status));
      appendLogisticsDetailRow(details, T('webview.world.logisticsVolumeCapacity'), `${logisticsNumber(route.volume)} / ${logisticsNumber(route.effectiveCapacity)} (${T('webview.world.logisticsBase')} ${logisticsNumber(route.baseCapacity)})`);
      appendLogisticsDetailRow(details, T('webview.world.logisticsUtilization'), logisticsPercent(route.utilization));
      appendLogisticsDetailRow(details, T('webview.world.logisticsRisk'), `${logisticsRiskLabel(route.risk)} · ${logisticsPercent(route.risk)}`);
      if (route.bottleneck) { appendLogisticsDetailRow(details, T('webview.world.logisticsBottleneck'), T('webview.world.logisticsBottleneckHint')); }
    }
  } else {
    const node = (payload.nodes || []).find((item) => item.id === selection.id);
    if (node) {
      appendLogisticsDetailRow(details, T('webview.world.logisticsNode'), node.label);
      appendLogisticsDetailRow(details, T('webview.world.logisticsKind'), logisticsNodeKindLabel(node.kind));
      const production = (node.production || []).map((item) => `${logisticsCommodityName(payload, item.commodityId)} ${logisticsNumber(item.effectiveOutput)} (${Math.round(item.productivePotential * 100)}% · ${Math.round(item.condition * 100)}%)`).join(', ');
      if (production) { appendLogisticsDetailRow(details, T('webview.world.logisticsProduction'), production); }
      const nodeShortages = (payload.shortages || []).filter((item) => item.nodeId === node.id && item.unmetDemand > 0);
      if (nodeShortages.length) {
        appendLogisticsDetailRow(details, T('webview.world.logisticsShortage'), nodeShortages.map((item) => `${logisticsCommodityName(payload, item.commodityId)} ${logisticsNumber(item.unmetDemand)}`).join(', '));
      }
      const sites = (payload.processingSites || []).filter((site) => site.nodeId === node.id);
      if (sites.length) {
        appendLogisticsDetailRow(details, T('webview.world.logisticsProcessing'), sites.map((site) => `${site.recipeId}: ${site.active ? T('webview.world.logisticsActive') : T('webview.world.logisticsInactive')} · ${site.batches}/${site.effectiveMaxBatches}`).join(', '));
      }
    }
  }
  parent.appendChild(details);
}

function renderEconomyLogisticsPanel() {
  const panel = economyLogisticsUiState.lightboxHost || document.getElementById('world-logistics-panel');
  const payload = economyLogisticsUiState.payload;
  if (!panel || !payload) { return; }
  panel.replaceChildren();
  panel.onkeydown = (event) => {
    if (event.key === 'Escape' && economyLogisticsUiState.selection) {
      event.preventDefault();
      // Clearing a selection and closing the expanded view are both bound to
      // Escape; stop here so one press only ever does the innermost thing.
      if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
      economyLogisticsUiState.selection = null;
      renderEconomyLogisticsPanel();
    }
  };
  if (!payload.available) {
    panel.appendChild(logisticsElement('div', 'logistics-empty', logisticsUnavailableText(payload.unavailableReason)));
    return;
  }
  if (payload.snapshotSource === 'derived_preview') {
    panel.appendChild(logisticsElement(
      'div',
      'logistics-preview-note',
      T('webview.world.logisticsPreviewNote')
    ));
  }
  renderLogisticsSummary(payload, panel);
  renderLogisticsFilter(payload, panel);
  if (payload.unavailableReason === 'no_route_summaries') {
    panel.appendChild(logisticsElement('div', 'logistics-empty', logisticsUnavailableText(payload.unavailableReason)));
  } else {
    renderLogisticsNetwork(payload, panel);
  }
  renderLogisticsDetails(payload, panel);
}

/** Generic "view large" lightbox: a single reusable overlay any read-only
 *  visual panel can borrow (only the logistics network uses it so far). It
 *  never owns feature state — callers get a body element to render into and
 *  an onClose callback to unwind their own state when the user leaves. */
function ensureVisualLightbox() {
  if (window.__lrVisualLightbox) { return window.__lrVisualLightbox; }
  const root = document.createElement('div');
  root.className = 'visual-lightbox hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const backdrop = document.createElement('div');
  backdrop.className = 'visual-lightbox-backdrop';
  const panel = document.createElement('div');
  panel.className = 'visual-lightbox-panel';
  const header = document.createElement('div');
  header.className = 'visual-lightbox-header';
  const title = document.createElement('span');
  title.className = 'visual-lightbox-title';
  const headerActions = document.createElement('div');
  headerActions.className = 'visual-lightbox-actions';
  const maximizeBtn = document.createElement('button');
  maximizeBtn.type = 'button';
  maximizeBtn.className = 'visual-lightbox-maximize';
  maximizeBtn.textContent = '⛶';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'visual-lightbox-close';
  closeBtn.textContent = '✕';
  headerActions.appendChild(maximizeBtn);
  headerActions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(headerActions);
  const body = document.createElement('div');
  body.className = 'visual-lightbox-body';
  panel.appendChild(header);
  panel.appendChild(body);
  root.appendChild(backdrop);
  root.appendChild(panel);
  document.body.appendChild(root);

  let onCloseCb = null;
  let restoreFocusEl = null;

  function syncMaximizeChrome() {
    const maximized = Boolean(economyLogisticsUiState.lightboxMaximized);
    panel.classList.toggle('is-maximized', maximized);
    root.classList.toggle('is-maximized', maximized);
    const key = maximized ? 'webview.world.logisticsLightboxRestore' : 'webview.world.logisticsLightboxMaximize';
    const label = typeof T === 'function' ? T(key) : key;
    maximizeBtn.setAttribute('aria-label', label);
    maximizeBtn.title = label;
    maximizeBtn.setAttribute('aria-pressed', maximized ? 'true' : 'false');
    maximizeBtn.textContent = maximized ? '❐' : '⛶';
  }

  function toggleMaximize() {
    economyLogisticsUiState.lightboxMaximized = !economyLogisticsUiState.lightboxMaximized;
    syncMaximizeChrome();
    // Re-render into the same lightbox host so the graph SVG/viewBox matches
    // the new body size. Camera contexts, filters, and selection are preserved
    // in economyLogisticsUiState — no Fit All.
    if (typeof renderEconomyLogisticsPanel === 'function') {
      renderEconomyLogisticsPanel();
    }
  }

  function close() {
    if (root.classList.contains('hidden')) { return; }
    root.classList.add('hidden');
    economyLogisticsUiState.lightboxMaximized = false;
    panel.classList.remove('is-maximized');
    root.classList.remove('is-maximized');
    // Restore focus to the trigger before the consumer's onClose callback
    // runs — that callback typically re-renders its own panel (e.g. the
    // logistics panel rebuilds and replaces its expand button), which would
    // detach the very node we're about to focus if we waited until after.
    if (restoreFocusEl && typeof restoreFocusEl.focus === 'function') { restoreFocusEl.focus(); }
    restoreFocusEl = null;
    const cb = onCloseCb;
    onCloseCb = null;
    if (typeof cb === 'function') { cb(); }
  }

  function open(titleText, triggerEl, onClose) {
    title.textContent = titleText || '';
    closeBtn.setAttribute('aria-label', T('webview.world.logisticsLightboxClose'));
    closeBtn.title = T('webview.world.logisticsLightboxClose');
    onCloseCb = onClose || null;
    restoreFocusEl = triggerEl || document.activeElement;
    economyLogisticsUiState.lightboxMaximized = false;
    syncMaximizeChrome();
    root.classList.remove('hidden');
    closeBtn.focus();
  }

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  maximizeBtn.addEventListener('click', (event) => {
    if (typeof event.stopPropagation === 'function') { event.stopPropagation(); }
    toggleMaximize();
  });
  // Double-click title bar toggles maximize when it does not conflict.
  header.addEventListener('dblclick', (event) => {
    if (event.target === closeBtn || event.target === maximizeBtn) { return; }
    toggleMaximize();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.classList.contains('hidden')) {
      event.preventDefault();
      close();
    }
  });

  window.__lrVisualLightbox = { open, close, body, panel, toggleMaximize, syncMaximizeChrome };
  return window.__lrVisualLightbox;
}

function logisticsOpenLightbox(triggerEl) {
  const lightbox = ensureVisualLightbox();
  lightbox.body.classList.add('visual-lightbox-body--logistics');
  economyLogisticsUiState.lightboxHost = lightbox.body;
  lightbox.open(T('webview.world.logisticsTitle'), triggerEl, () => {
    economyLogisticsUiState.lightboxHost = null;
    lightbox.body.classList.remove('visual-lightbox-body--logistics');
    renderEconomyLogisticsPanel();
  });
  renderEconomyLogisticsPanel();
}

function renderEconomyLogistics(payload, commerceEnabled) {
  const section = document.getElementById('world-logistics-details');
  const panel = document.getElementById('world-logistics-panel');
  if (!section || !panel) { return; }
  const visible = Boolean(payload);
  section.classList.toggle('hidden', !visible);
  if (!visible) {
    if (economyLogisticsUiState.lightboxHost) {
      economyLogisticsUiState.lightboxHost = null;
      ensureVisualLightbox().close();
    }
    panel.replaceChildren();
    economyLogisticsUiState.payload = null;
    economyLogisticsUiState.selection = null;
    economyLogisticsUiState.cameraContexts = logisticsEmptyCameraContexts();
    economyLogisticsUiState.spaceHeld = false;
    return;
  }
  if (economyLogisticsUiState.payload !== payload) {
    economyLogisticsUiState.payload = payload;
    // Host ticks always allocate a new payload object. Retain a selection only
    // when the same factual id+type still exists; never key off object identity.
    economyLogisticsUiState.selection = logisticsRetainValidSelection(
      economyLogisticsUiState.selection,
      payload
    );
  }
  if (!commerceEnabled && payload.available) {
    economyLogisticsUiState.payload = { ...payload, available: false, unavailableReason: 'commerce_disabled' };
  }
  renderEconomyLogisticsPanel();
}

/** Keep a selection across payload pushes when its factual id remains present. */
function logisticsRetainValidSelection(selection, payload) {
  if (!selection || !payload) { return null; }
  if (selection.type === 'node') {
    const stillThere = (payload.nodes || []).some((node) => node && node.id === selection.id);
    return stillThere ? { type: 'node', id: selection.id } : null;
  }
  if (selection.type === 'route') {
    const stillThere = (payload.routes || []).some((route) => route && route.id === selection.id);
    return stillThere ? { type: 'route', id: selection.id } : null;
  }
  return null;
}

/* --- 86-tile-overmap.js --- */
/* global document, window */

// ---------------------------------------------------------------------------
// Tile Overmap (roguelike ASCII renderer)
//
// Tile data arrives pre-computed from tileOvermapCore.ts as single-char biome
// codes. Theme key is resolved in the extension (overmapThemeKey on worldView).
// This module maps codes to visuals — an image tileset (CDDA tile_config.json
// style: code → sprite atlas index) can replace drawOvermapTile() later.
// ---------------------------------------------------------------------------

let _tileOvermapMsg = null;
let _overmapResizeTimer;

// --- Graphics Upgrade Track 1: Atmosphere Pass -----------------------------
// Decorative-only animation phase driven by LR_anim (webview/modules/84a-webview-anim.js).
// Never persisted, never read back into state; when motion is disabled (reduced-motion or
// effects tier "off") drawTileOvermap() falls back to the exact pre-animation static formulas.
let _tileAnimPhase = 0;
let _tileAnimRegistered = false;

function registerTileOvermapAnimation() {
    if (_tileAnimRegistered || !window.LR_anim) { return; }
    _tileAnimRegistered = true;
    window.LR_anim.register('tile-overmap', (phase) => {
        _tileAnimPhase = phase;
        drawTileOvermap();
    }, { fps: 10 });
}

function unregisterTileOvermapAnimation() {
    _tileAnimRegistered = false;
    if (window.LR_anim) { window.LR_anim.unregister('tile-overmap'); }
}

function effectsTierLabel(tier) {
    const key = `webview.world.effectsTier.${tier}`;
    const translated = typeof T === 'function' ? T(key) : '';
    return translated && translated !== key ? translated : tier;
}

function updateEffectsTierButton() {
    const btn = document.getElementById('world-effects-tier-btn');
    if (!btn || !window.LR_anim) { return; }
    const tier = window.LR_anim.getEffectsTier();
    const titlePrefix = typeof T === 'function' ? T('webview.world.effectsTierTitle') : 'Motion effects';
    btn.textContent = `✨ ${effectsTierLabel(tier)}`;
    btn.classList.toggle('is-off', tier === 'off');
    btn.classList.toggle('is-full', tier === 'full');
    btn.title = `${titlePrefix}: ${effectsTierLabel(tier)}`;
    btn.setAttribute('aria-label', btn.title);
}

function initEffectsTierButton() {
    const btn = document.getElementById('world-effects-tier-btn');
    if (!btn || !window.LR_anim) { return; }
    updateEffectsTierButton();
    btn.addEventListener('click', () => {
        const order = window.LR_anim.TIERS;
        const current = window.LR_anim.getEffectsTier();
        window.LR_anim.setEffectsTier(order[(order.indexOf(current) + 1) % order.length]);
        updateEffectsTierButton();
    });
    window.LR_anim.onTierChange(() => {
        updateEffectsTierButton();
        if (typeof worldMapMode !== 'undefined' && worldMapMode === 'tile') { drawTileOvermap(); }
    });
}
// ---------------------------------------------------------------------------

window.addEventListener('resize', () => {
    if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'tile') { return; }
    clearTimeout(_overmapResizeTimer);
    _overmapResizeTimer = setTimeout(() => drawTileOvermap(), 150);
});

let _tileOvermapClickReady = false;

function initTileOvermapPinClicks() {
    if (_tileOvermapClickReady) { return; }
    _tileOvermapClickReady = true;
    const canvas = document.getElementById('world-overmap-canvas');
    if (!canvas) { return; }
    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'tile') { return; }
        const overlayMarker = hitTestMapOverlayMarker(e.clientX, e.clientY, canvas);
        if (overlayMarker) {
            const labels = window.LR_vehicleLabels;
            const vehicleId = labels && typeof labels.vehicleIdFromOverlayMarker === 'function'
                ? labels.vehicleIdFromOverlayMarker(overlayMarker)
                : null;
            if (vehicleId && typeof window.openVehicleFromMapMarker === 'function') {
                e.stopPropagation();
                window.openVehicleFromMapMarker(vehicleId);
                return;
            }
        }
        if (typeof hitTestWorldPin !== 'function' || typeof selectWorldLocationPin !== 'function') { return; }
        const locationId = hitTestWorldPin(e.clientX, e.clientY, canvas);
        if (locationId) {
            e.stopPropagation();
            selectWorldLocationPin(locationId);
        } else if (typeof clearWorldLocationPinSelection === 'function') {
            clearWorldLocationPinSelection();
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initTileOvermapPinClicks();
    initMapOverlayHover();
    initEffectsTierButton();
});

function ensureMapOverlayTooltip() {
    if (_mapOverlayTooltipEl) { return _mapOverlayTooltipEl; }
    const panel = document.getElementById('world-overmap');
    if (!panel) { return null; }
    const el = document.createElement('div');
    el.id = 'world-map-overlay-tooltip';
    el.className = 'world-map-overlay-tooltip hidden';
    el.setAttribute('role', 'tooltip');
    panel.appendChild(el);
    _mapOverlayTooltipEl = el;
    return el;
}

function hideMapOverlayTooltip() {
    if (_mapOverlayTooltipEl) {
        _mapOverlayTooltipEl.classList.add('hidden');
        _mapOverlayTooltipEl.textContent = '';
    }
}

function showMapOverlayTooltip(marker, clientX, clientY, cluster) {
    const el = ensureMapOverlayTooltip();
    if (!el || !marker) { return; }
    let parts;
    if (Array.isArray(cluster) && cluster.length > 1) {
        parts = cluster.slice(0, 4).map((m) => (m && m.label) || '');
        if (cluster.length > 4) { parts.push(`+${cluster.length - 4}`); }
    } else {
        parts = [marker.label || ''];
        if (marker.detail) { parts.push(marker.detail); }
    }
    el.textContent = parts.filter(Boolean).join(' · ');
    el.classList.remove('hidden');
    const panel = document.getElementById('world-overmap');
    if (!panel) { return; }
    const rect = panel.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left + 8, 4), rect.width - 4);
    const top = Math.min(Math.max(clientY - rect.top - 28, 4), rect.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

/** Returns the full hit record ({ marker, cluster, px, py }) for the nearest marker/cluster under the cursor, or null. */
function hitTestMapOverlayMarkerHit(clientX, clientY, canvas) {
    if (!canvas || !_overlayMarkerHits.length) { return null; }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best = null;
    let bestDist = MAP_OVERLAY_HIT_RADIUS_PX + 1;
    for (const hit of _overlayMarkerHits) {
        const dist = Math.hypot(hit.px - x, hit.py - y);
        if (dist <= MAP_OVERLAY_HIT_RADIUS_PX && dist < bestDist) {
            bestDist = dist;
            best = hit;
        }
    }
    return best;
}

function hitTestMapOverlayMarker(clientX, clientY, canvas) {
    const hit = hitTestMapOverlayMarkerHit(clientX, clientY, canvas);
    return hit ? hit.marker : null;
}

function initMapOverlayHover() {
    if (_mapOverlayHoverReady) { return; }
    _mapOverlayHoverReady = true;
    const canvas = document.getElementById('world-overmap-canvas');
    if (!canvas) { return; }
    canvas.addEventListener('mousemove', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'tile') {
            hideMapOverlayTooltip();
            return;
        }
        const hit = hitTestMapOverlayMarkerHit(e.clientX, e.clientY, canvas);
        if (hit) {
            showMapOverlayTooltip(hit.marker, e.clientX, e.clientY, hit.cluster);
        } else {
            hideMapOverlayTooltip();
        }
    });
    canvas.addEventListener('mouseleave', hideMapOverlayTooltip);
}

function resolveOverlayMarkerColor(marker) {
    if (marker.kind === 'settlement_pressure' && marker.detail) {
        const match = /Mood:\s*(calm|strained|unrest|crisis)/i.exec(marker.detail);
        if (match) {
            return MAP_OVERLAY_PRESSURE_COLORS[match[1].toLowerCase()] || MAP_OVERLAY_MARKER_STYLE.settlement_pressure.fg;
        }
    }
    if (marker.tone && MAP_OVERLAY_TONE_COLORS[marker.tone]) {
        return MAP_OVERLAY_TONE_COLORS[marker.tone];
    }
    const base = MAP_OVERLAY_MARKER_STYLE[marker.kind];
    return base ? base.fg : MAP_OVERLAY_TONE_COLORS.neutral;
}

function resolveOverlayMarkerGlyph(marker) {
    const base = MAP_OVERLAY_MARKER_STYLE[marker.kind];
    if (!base) { return '·'; }
    if (marker.fogVisibility === 'rumored' && marker.kind !== 'settlement_pressure') {
        return '?';
    }
    return base.glyph;
}

/** Groups markers sharing the same tile so overlapping entries draw as one glyph + count badge instead of a stacked blob (F13). */
function groupOverlayMarkersByCell(markers) {
    const groups = new Map();
    for (const marker of markers) {
        const key = `${marker.x},${marker.y}`;
        if (!groups.has(key)) { groups.set(key, []); }
        groups.get(key).push(marker);
    }
    return groups;
}

function drawMapOverlayMarkers(ctx, msg, cell, cssWidth, cssHeight) {
    _overlayMarkerHits = [];
    const overlay = msg && msg.mapOverlay;
    const markers = overlay && Array.isArray(overlay.markers) ? overlay.markers : [];
    if (!markers.length) { return; }

    const om = msg.tileOvermap;
    const cols = om && om.cols ? om.cols : 64;
    const rows = om && om.rows ? om.rows : 64;

    const inBounds = markers.filter((marker) => (
        marker && typeof marker.x === 'number' && typeof marker.y === 'number'
        && marker.x >= 0 && marker.y >= 0 && marker.x < cols && marker.y < rows
    ));
    if (!inBounds.length) { return; }

    const motionOn = Boolean(window.LR_anim && window.LR_anim.isMotionEnabled());

    ctx.save();
    // Floors keep glyphs legible at narrow sidebar widths where `cell` shrinks toward its minimum (F13).
    const fontPx = Math.max(8, cell);
    const badgeFontPx = Math.max(7, Math.round(fontPx * 0.72));
    ctx.font = `600 ${fontPx}px "Courier New", monospace`;

    for (const group of groupOverlayMarkersByCell(inBounds).values()) {
        const marker = group[0];
        const px = marker.x * cell + cell / 2;
        const py = marker.y * cell + cell / 2;
        const rumored = marker.fogVisibility === 'rumored';
        const glyph = resolveOverlayMarkerGlyph(marker);
        let color = resolveOverlayMarkerColor(marker);
        if (rumored) {
            color = MAP_OVERLAY_TONE_COLORS.unknown;
        }

        if (rumored && motionOn) {
            // Deterministic per-marker phase offset so rumored markers don't all flicker in lockstep.
            const offset = overmapHash(marker.x, marker.y, 4271) * Math.PI * 2;
            ctx.globalAlpha = 0.4 + 0.25 * (0.5 + 0.5 * Math.sin(_tileAnimPhase / 650 + offset));
        } else {
            ctx.globalAlpha = rumored ? 0.52 : 1;
        }
        const radius = Math.max(4, cell * 0.42);
        ctx.fillStyle = rumored ? 'rgba(12, 16, 24, 0.55)' : 'rgba(8, 12, 20, 0.72)';
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `600 ${fontPx}px "Courier New", monospace`;
        drawOvermapOutlinedText(ctx, glyph, px, py, color);

        if (group.length > 1) {
            ctx.font = `700 ${badgeFontPx}px "Courier New", monospace`;
            drawOvermapOutlinedText(ctx, `+${group.length - 1}`, px + radius * 0.85, py - radius * 0.85, '#ffe9a8');
        }
        ctx.globalAlpha = 1;

        _overlayMarkerHits.push({ marker, cluster: group, px, py });
    }

    ctx.restore();
}

const TILE_OVERMAP_ASCII_THEME = {
    s: { bg: '#0a1420', fg: ['#2f5f92', '#3e78b2', '#356a9e'], glyphs: ['~', '≈', '~'] },
    c: { bg: '#0d1a24', fg: ['#4a8ab2', '#5a9ac2', '#3f7aa2'], glyphs: ['~', '.', '≈'] },
    p: { bg: '#11150b', fg: ['#7d9c4d', '#93b060', '#6d8a41'], glyphs: ['.', ',', "'"] },
    f: { bg: '#0b120c', fg: ['#2e7d3e', '#3f9950', '#57aa5f'], glyphs: ['♠', '♣', '♠'] },
    m: { bg: '#141210', fg: ['#9a9188', '#b0a89e', '#7d766e'], glyphs: ['^', '▲', '^'] },
    d: { bg: '#171208', fg: ['#c8a85a', '#d8bc72', '#b09048'], glyphs: ['~', '.', '~'] },
    w: { bg: '#0d120e', fg: ['#5d8060', '#4d6a50', '#6f9472'], glyphs: ['"', '%', ','] },
    x: { bg: '#141108', fg: ['#a08a68', '#8a7658', '#b09a78'], glyphs: ['.', '~', ','] },
    y: { bg: '#161311', fg: ['#c07a4a', '#d08a5a', '#a86a3e'], glyphs: ['#', '⌂', '#'] },
    r: { bg: '#121012', fg: ['#8a8090', '#9a90a0', '#7a7080'], glyphs: ['Π', '.', ','] },
    g: { bg: '#100c14', fg: ['#8a6aa8', '#7a5a98', '#9a7ab8'], glyphs: ['Ω', '∩', '.'] },
    u: { bg: '#0e0c12', fg: ['#6a6a8a', '#7a7a9a', '#5a5a7a'], glyphs: ['∩', '.', 'o'] },
    n: { bg: '#131720', fg: ['#cdd8e0', '#b8c4d0', '#dde8f0'], glyphs: ['*', '.', '·'] },
    v: { bg: '#170c08', fg: ['#c05030', '#d06040', '#a04028'], glyphs: ['^', '▲', '~'] },
    o: { bg: '#121212', fg: ['#888880', '#989890', '#787870'], glyphs: ['.', ',', '·'] },
};
const TILE_OVERMAP_WATER_CODES = new Set(['s', 'c']);

const TILE_OVERMAP_THEME_OVERRIDES = {
    cyberpunk: {
        y: { bg: '#0d0a16', fg: ['#00c8c8', '#e040c0', '#8060ff'], glyphs: ['#', '▓', '■'] },
        p: { bg: '#0f1014', fg: ['#5a6a7a', '#6a7a8a', '#4a5a6a'], glyphs: ['.', ':', '·'] },
        f: { bg: '#0b100d', fg: ['#2a5a3a', '#356a45', '#204a30'], glyphs: ['↑', '♣', '.'] },
        x: { bg: '#12100c', fg: ['#7a6a50', '#8a7a5a', '#6a5a45'], glyphs: ['%', '≡', '.'] },
        s: { bg: '#08141a', fg: ['#3a5a6a', '#2f4f5f', '#456a7a'], glyphs: ['~', '≈', '~'] },
    },
    postapoc: {
        p: { bg: '#12100a', fg: ['#8a7a55', '#9a8a60', '#7a6a4a'], glyphs: ['.', ',', '"'] },
        f: { bg: '#100f0b', fg: ['#6a5f4f', '#7a6f5a', '#5a5045'], glyphs: ['†', '↑', ','] },
        y: { bg: '#121210', fg: ['#8a8a85', '#9a9a90', '#75756f'], glyphs: ['#', '≡', 'Π'] },
        s: { bg: '#0a1512', fg: ['#4a6a5a', '#3f5f50', '#557a65'], glyphs: ['~', '≈', '~'] },
        x: { bg: '#141108', fg: ['#b09a68', '#c0aa72', '#9a8658'], glyphs: ['~', '.', '∙'] },
    },
    zombie: {
        y: { bg: '#140d0d', fg: ['#9a4040', '#8a5a5a', '#aa5045'], glyphs: ['#', '⌂', '†'] },
        p: { bg: '#10130b', fg: ['#6a8a4a', '#7a9a55', '#5a7a40'], glyphs: ['"', ',', '.'] },
        r: { bg: '#121010', fg: ['#8a7070', '#9a8080', '#7a6060'], glyphs: ['Π', '†', ','] },
    },
    scifi: {
        p: { bg: '#101018', fg: ['#8a8a9a', '#9a9aaa', '#7a7a8a'], glyphs: ['.', '∙', '·'] },
        y: { bg: '#0a1416', fg: ['#40c0c0', '#50d0d0', '#30a0a0'], glyphs: ['∩', '#', '■'] },
        x: { bg: '#131008', fg: ['#9a7a6a', '#aa8a7a', '#8a6a5a'], glyphs: ['o', '.', '°'] },
        s: { bg: '#0e0a1a', fg: ['#5a4a9a', '#6a5aaa', '#4a3f8a'], glyphs: ['~', '≈', '~'] },
    },
    steampunk: {
        y: { bg: '#151009', fg: ['#b08050', '#c09060', '#906a40'], glyphs: ['#', '⌂', '■'] },
        x: { bg: '#121110', fg: ['#7a7068', '#8a8078', '#6a6058'], glyphs: ['%', '≡', '.'] },
        s: { bg: '#0a1216', fg: ['#4a6a7a', '#3f5f6f', '#557a8a'], glyphs: ['~', '≈', '~'] },
    },
    horror: {
        s: { bg: '#070a12', fg: ['#3a4a6a', '#2f3f5f', '#455a7a'], glyphs: ['~', '≈', '~'] },
        w: { bg: '#0d1010', fg: ['#5a6a6a', '#6a7a7a', '#4a5a5a'], glyphs: ['"', '~', ','] },
        f: { bg: '#0a100d', fg: ['#3a5a4a', '#2f4f40', '#456a55'], glyphs: ['♠', '†', '♣'] },
        r: { bg: '#0e1014', fg: ['#6a7a8a', '#7a8a9a', '#5a6a7a'], glyphs: ['Π', '◊', '.'] },
        c: { bg: '#0a1116', fg: ['#4a6a7a', '#3f5f6f', '#557a8a'], glyphs: ['~', '.', '≈'] },
    },
    oriental: {
        f: { bg: '#0b120c', fg: ['#4a9a50', '#5aaa5a', '#3f8a45'], glyphs: ['|', '↑', '♣'] },
        m: { bg: '#12141a', fg: ['#8a95a5', '#9aa5b5', '#7a8595'], glyphs: ['^', '▲', '∧'] },
        p: { bg: '#11150b', fg: ['#7aa050', '#8ab060', '#6a9045'], glyphs: ['.', '=', ','] },
        y: { bg: '#151109', fg: ['#c08a50', '#d09a60', '#a87a45'], glyphs: ['⌂', '#', '⌂'] },
    },
    modern: {
        y: { bg: '#101216', fg: ['#8a9aaa', '#9aaabb', '#7a8a9a'], glyphs: ['#', '▓', '⌂'] },
        p: { bg: '#10140b', fg: ['#7a9a5a', '#8aaa65', '#6a8a50'], glyphs: ['.', ':', ','] },
    },
};

const TILE_OVERMAP_HAZARD_STYLE = {
    radiation: { glyph: '☢', fg: '#b0e030', tint: 'rgba(140,200,30,0.16)' },
    toxic: { glyph: '☣', fg: '#80d060', tint: 'rgba(90,180,70,0.16)' },
    infested: { glyph: '☠', fg: '#e06050', tint: 'rgba(200,60,50,0.16)' },
    quarantine: { glyph: '╬', fg: '#e0b040', tint: 'rgba(220,170,50,0.14)' },
    anomaly: { glyph: '◊', fg: '#b080f0', tint: 'rgba(150,100,240,0.16)' },
    haunted: { glyph: '†', fg: '#a0b0d0', tint: 'rgba(130,150,210,0.14)' },
    storm: { glyph: '§', fg: '#70c0e0', tint: 'rgba(90,180,230,0.14)' },
    corrupted: { glyph: '▒', fg: '#c060a0', tint: 'rgba(190,80,160,0.14)' },
};

const MAP_OVERLAY_TONE_COLORS = {
    friendly: '#6ecf8a',
    neutral: '#b8c4d0',
    hostile: '#e07070',
    unknown: '#9aa8b8',
};

const MAP_OVERLAY_MARKER_STYLE = {
    npc: { glyph: '●', fg: '#5ab0e8' },
    merchant: { glyph: '$', fg: '#e8c87a' },
    caravan: { glyph: '⇄', fg: '#d8a050' },
    faction_control: { glyph: '⚑', fg: '#b8c4d0' },
    quest: { glyph: '!', fg: '#b080f0' },
    discovery: { glyph: '✦', fg: '#50c8b8' },
    settlement_pressure: { glyph: '▲', fg: '#e8b050' },
    vehicle: { glyph: 'V', fg: '#70b8f0' },
    vehicle_parking: { glyph: 'P', fg: '#a0a8b8' },
};

const MAP_OVERLAY_PRESSURE_COLORS = {
    calm: '#6ecf8a',
    strained: '#e8c87a',
    unrest: '#e09050',
    crisis: '#e05050',
};

const MAP_OVERLAY_HIT_RADIUS_PX = 10;
let _overlayMarkerHits = [];
let _mapOverlayHoverReady = false;
let _mapOverlayTooltipEl = null;

const MAP_OVERLAY_LEGEND_I18N_KEY = {
    npc: 'webview.world.overlayLegendNpc',
    merchant: 'webview.world.overlayLegendMerchant',
    caravan: 'webview.world.overlayLegendCaravan',
    faction_control: 'webview.world.overlayLegendFaction',
    quest: 'webview.world.overlayLegendQuest',
    discovery: 'webview.world.overlayLegendDiscovery',
    settlement_pressure: 'webview.world.overlayLegendPressure',
    vehicle: 'webview.world.overlayLegendVehicle',
    vehicle_parking: 'webview.world.overlayLegendVehicleParking',
};
const MAP_OVERLAY_LEGEND_FALLBACK = {
    npc: 'NPC',
    merchant: 'Merchant',
    caravan: 'Caravan',
    faction_control: 'Faction control',
    quest: 'Quest lead',
    discovery: 'Discovery',
    settlement_pressure: 'Settlement pressure',
    vehicle: 'Vehicle',
    vehicle_parking: 'Vehicle parking',
    rumored: 'Rumored (unconfirmed)',
};

function overlayLegendLabel(kind) {
    const key = MAP_OVERLAY_LEGEND_I18N_KEY[kind];
    const translated = key && typeof T === 'function' ? T(key) : '';
    return translated && translated !== key ? translated : MAP_OVERLAY_LEGEND_FALLBACK[kind] || kind;
}

/** Display-only legend: lists marker kinds present in the current sanitized snapshot. No state writes. */
function renderMapOverlayLegend(msg) {
    const el = document.getElementById('world-overmap-legend');
    if (!el) { return; }
    const markers = msg && msg.mapOverlay && Array.isArray(msg.mapOverlay.markers) ? msg.mapOverlay.markers : [];
    if (!markers.length) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const seenKinds = [];
    let hasRumored = false;
    for (const marker of markers) {
        if (marker && marker.kind && MAP_OVERLAY_MARKER_STYLE[marker.kind] && !seenKinds.includes(marker.kind)) {
            seenKinds.push(marker.kind);
        }
        if (marker && marker.fogVisibility === 'rumored') { hasRumored = true; }
    }
    if (!seenKinds.length) {
        el.classList.add('hidden');
        el.innerHTML = '';
        return;
    }
    const items = seenKinds.map((kind) => {
        const style = MAP_OVERLAY_MARKER_STYLE[kind];
        const label = escapeHtml(overlayLegendLabel(kind));
        return `<span class="world-map-overlay-legend-item"><span class="world-map-overlay-legend-glyph" style="color:${style.fg}">${style.glyph}</span>${label}</span>`;
    });
    if (hasRumored) {
        const rumoredLabel = escapeHtml(overlayLegendLabel('rumored'));
        items.push(`<span class="world-map-overlay-legend-item world-map-overlay-legend-hint"><span class="world-map-overlay-legend-glyph">?</span>${rumoredLabel}</span>`);
    }
    const vehicleMarkers = markers.filter((m) => m && (m.kind === 'vehicle' || m.kind === 'vehicle_parking'));
    if (vehicleMarkers.length) {
        const listLabel = typeof T === 'function' ? T('webview.world.overlayVehicleList') : 'Vehicles on map';
        const listItems = vehicleMarkers.slice(0, 6).map((m) => {
            const vid = window.LR_vehicleLabels?.vehicleIdFromOverlayMarker?.(m);
            const clickable = vid ? ` data-vehicle-marker-id="${escapeHtml(vid)}"` : '';
            return `<li class="world-map-overlay-vehicle-item"${clickable}>${escapeHtml(m.label || m.kind)}</li>`;
        }).join('');
        items.push(`<div class="world-map-overlay-vehicle-list" role="list"><span class="world-map-overlay-vehicle-list-title">${escapeHtml(listLabel)}</span><ul>${listItems}</ul></div>`);
    }
    el.innerHTML = items.join('');
    el.classList.remove('hidden');
    el.querySelectorAll('[data-vehicle-marker-id]').forEach((node) => {
        node.addEventListener('click', () => {
            const id = node.getAttribute('data-vehicle-marker-id');
            if (id && typeof window.openVehicleFromMapMarker === 'function') {
                window.openVehicleFromMapMarker(id);
            }
        });
    });
}

function syncVehicleTileHint(msg) {
    const el = document.getElementById('world-vehicle-tile-hint');
    if (!el) { return; }
    const enabled = msg && msg.enableVehicleSystem === true;
    const hasVehicleMarkers = Boolean(
        msg && msg.mapOverlay && Array.isArray(msg.mapOverlay.markers)
        && msg.mapOverlay.markers.some((m) => m && (m.kind === 'vehicle' || m.kind === 'vehicle_parking'))
    );
    const notTile = typeof worldMapMode !== 'undefined' && worldMapMode !== 'tile';
    el.classList.toggle('hidden', !(enabled && hasVehicleMarkers && notTile));
}

function flashMapOverlayMarkerTooltip(marker) {
    const hit = _overlayMarkerHits.find((h) => h.marker && h.marker.id === marker.id);
    if (!hit) { return; }
    const panel = document.getElementById('world-overmap');
    const canvas = document.getElementById('world-overmap-canvas');
    if (!panel || !canvas) { return; }
    const rect = panel.getBoundingClientRect();
    showMapOverlayTooltip(marker, rect.left + hit.px, rect.top + hit.py, hit.cluster);
    window.setTimeout(() => hideMapOverlayTooltip(), 3200);
}

window.focusVehicleOnMap = function focusVehicleOnMap(vehicleId) {
    if (!vehicleId || !_tileOvermapMsg) { return; }
    const markers = _tileOvermapMsg.mapOverlay && Array.isArray(_tileOvermapMsg.mapOverlay.markers)
        ? _tileOvermapMsg.mapOverlay.markers
        : [];
    const marker = markers.find((m) => {
        const vid = window.LR_vehicleLabels?.vehicleIdFromOverlayMarker?.(m);
        return vid === vehicleId;
    });
    if (typeof activateStatusPane === 'function') {
        activateStatusPane('pane-world');
    } else {
        document.getElementById('tab-btn-world')?.click();
    }
    if (typeof setWorldMapMode === 'function') {
        setWorldMapMode('tile', { persist: true });
    }
    requestAnimationFrame(() => {
        drawTileOvermap();
        if (marker) {
            requestAnimationFrame(() => flashMapOverlayMarkerTooltip(marker));
        }
    });
};

function getRegionFogVisibility(regionId, fog) {
    if (!fog || !regionId) { return 'discovered'; }
    const discovered = new Set(fog.discoveredRegionIds || []);
    const rumored = new Set(fog.rumoredRegionIds || []);
    if (discovered.has(regionId)) { return 'discovered'; }
    if (rumored.has(regionId)) { return 'rumored'; }
    return 'unknown';
}

function buildPinMetaMap(msg) {
    const map = new Map();
    const catalog = Array.isArray(msg.locationPinCatalog) ? msg.locationPinCatalog : [];
    for (const entry of catalog) {
        if (entry?.locationId) { map.set(entry.locationId, entry); }
    }
    return map;
}

function buildRegionFeedbackMapFromMsg(msg) {
    const map = new Map();
    const rows = Array.isArray(msg.regionMapFeedback) ? msg.regionMapFeedback : [];
    for (const row of rows) {
        if (row?.regionId) { map.set(row.regionId, row); }
    }
    return map;
}

function drawDangerRing(ctx, px, py, tier, cell) {
    if (tier !== 'medium' && tier !== 'high') { return; }
    ctx.save();
    ctx.strokeStyle = tier === 'high' ? 'rgba(192,64,64,0.95)' : 'rgba(232,168,56,0.9)';
    ctx.lineWidth = tier === 'high' ? 2.5 : 2;
    ctx.beginPath();
    ctx.arc(px, py, cell * (tier === 'high' ? 0.88 : 0.72), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawMapEventBadge(ctx, px, py, cell, severity) {
    const glyph = severity === 'critical' ? '‼' : '🔥';
    ctx.font = `600 ${Math.max(7, cell - 1)}px sans-serif`;
    drawOvermapOutlinedText(ctx, glyph, px + cell * 0.65, py - cell * 0.45, '#ffb347');
}

function resolveTileRegionFog(tx, ty, cols, rows, layout, fog) {
    if (!fog || !Array.isArray(layout) || layout.length === 0) { return 'discovered'; }
    const leftPct = ((tx + 0.5) / cols) * 100;
    const topPct = ((ty + 0.5) / rows) * 100;
    let bestId = layout[0].regionId;
    let bestScore = Infinity;
    for (const entry of layout) {
        const dx = entry.leftPct - leftPct;
        const dy = entry.topPct - topPct;
        const radius = Math.max(2, entry.radiusPct || 7);
        const score = Math.sqrt(dx * dx + dy * dy) / radius;
        if (score < bestScore) {
            bestScore = score;
            bestId = entry.regionId;
        }
    }
    return getRegionFogVisibility(bestId, fog);
}

/** Same integer hash as tileOvermapCore.hash2 — cosmetic per-tile variation only. */
function overmapHash(x, y, s) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function drawOvermapTile(ctx, tx, ty, cell, style, glyph, fg) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(tx * cell, ty * cell, cell, cell);
    ctx.fillStyle = fg;
    ctx.fillText(glyph, tx * cell + cell / 2, ty * cell + cell / 2 + 1);
}

function drawOvermapOutlinedText(ctx, text, x, y, fill) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
}

/** Scales the alpha channel of an `rgba(...)` string; returns the input unchanged if it doesn't match. */
function scaleRgbaAlpha(rgba, factor) {
    const m = /^rgba\(([^,]+),([^,]+),([^,]+),([^)]+)\)$/.exec(rgba);
    if (!m) { return rgba; }
    const alpha = Math.max(0, Math.min(1, parseFloat(m[4]) * factor));
    return `rgba(${m[1]},${m[2]},${m[3]},${alpha.toFixed(3)})`;
}

/** "Full" effects tier only: sparse, deterministic rising embers over a hazard tile. Decorative, not persisted. */
function drawEmberParticle(ctx, tx, ty, cell, phase, seed) {
    const chance = overmapHash(tx, ty, seed + 311);
    if (chance > 0.18) { return; }
    const cycleMs = 1800;
    const t = ((phase + chance * cycleMs) % cycleMs) / cycleMs;
    const xJitter = (overmapHash(tx, ty, seed + 727) - 0.5) * cell * 0.6;
    const px = tx * cell + cell / 2 + xJitter;
    const py = ty * cell + cell * (1 - t * 0.9);
    const alpha = Math.max(0, 1 - t);
    if (alpha <= 0) { return; }
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1, cell * 0.06), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawTileOvermap() {
    const canvas = document.getElementById('world-overmap-canvas');
    const empty = document.getElementById('world-overmap-empty');
    if (!canvas) { return; }

    const msg = _tileOvermapMsg;
    const om = msg && msg.tileOvermap;
    const hasData = Boolean(om && Array.isArray(om.tileRows) && om.tileRows.length > 0 && (msg.regionCount ?? 0) > 0);
    if (empty) { empty.classList.toggle('hidden', hasData); }
    canvas.style.display = hasData ? 'block' : 'none';
    if (!hasData) {
        renderMapOverlayLegend(null);
        return;
    }

    const panel = canvas.parentElement;
    const panelWidth = panel ? panel.clientWidth : 0;
    if (!panelWidth) { return; }

    const cell = Math.max(5, Math.floor(panelWidth / om.cols));
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = om.cols * cell;
    const cssHeight = om.rows * cell;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.style.borderRadius = '4px';

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(6, cell - 2)}px "Courier New", monospace`;

    const seed = om.seed >>> 0;
    const roadSet = new Set((om.roads || []).map(([x, y]) => `${x},${y}`));
    const themeKey = msg.overmapThemeKey || 'fantasy';
    const themeOverrides = TILE_OVERMAP_THEME_OVERRIDES[themeKey] || {};

    const fogLayout = Array.isArray(msg.fogRegionLayout) ? msg.fogRegionLayout : [];
    const fog = msg.fog;

    // Graphics Upgrade Track 1 (Atmosphere Pass): when motion is disabled, every branch below
    // falls back to the original static formula, so the rendered frame is unchanged from before.
    const motionOn = Boolean(window.LR_anim && window.LR_anim.isMotionEnabled());
    const effectsTier = window.LR_anim ? window.LR_anim.getEffectsTier() : 'light';

    for (let ty = 0; ty < om.rows; ty++) {
        const row = om.tileRows[ty] || '';
        for (let tx = 0; tx < om.cols; tx++) {
            const code = row[tx] || 'o';
            const style = themeOverrides[code] || TILE_OVERMAP_ASCII_THEME[code] || TILE_OVERMAP_ASCII_THEME.o;
            const variant = overmapHash(tx, ty, seed + 99);
            let glyph;
            if (motionOn && TILE_OVERMAP_WATER_CODES.has(code)) {
                const cyclePos = (variant * style.glyphs.length + _tileAnimPhase / 500) % style.glyphs.length;
                glyph = style.glyphs[Math.floor(cyclePos)];
            } else {
                glyph = style.glyphs[Math.floor(variant * style.glyphs.length)];
            }
            let fg = style.fg[Math.floor(overmapHash(tx, ty, seed + 55) * style.fg.length)];
            if (roadSet.has(`${tx},${ty}`)) {
                glyph = TILE_OVERMAP_WATER_CODES.has(code) ? '=' : '·';
                fg = TILE_OVERMAP_WATER_CODES.has(code) ? '#8aa0b8' : '#c9b083';
            }
            drawOvermapTile(ctx, tx, ty, cell, style, glyph, fg);

            const tileFog = resolveTileRegionFog(tx, ty, om.cols, om.rows, fogLayout, fog);
            if (tileFog === 'unknown') {
                ctx.fillStyle = 'rgba(6, 8, 14, 0.78)';
                ctx.fillRect(tx * cell, ty * cell, cell, cell);
            } else if (tileFog === 'rumored') {
                ctx.fillStyle = 'rgba(10, 14, 22, 0.42)';
                ctx.fillRect(tx * cell, ty * cell, cell, cell);
            }
        }
    }

    const regionFeedbackMap = buildRegionFeedbackMapFromMsg(msg);
    const pinMetaMap = buildPinMetaMap(msg);

    const hazardGroups = Array.isArray(om.hazards) ? om.hazards : [];
    for (const group of hazardGroups) {
        const hz = TILE_OVERMAP_HAZARD_STYLE[group.hazard];
        if (!hz || !Array.isArray(group.tiles)) { continue; }
        for (const [tx, ty] of group.tiles) {
            const tileFog = resolveTileRegionFog(tx, ty, om.cols, om.rows, fogLayout, fog);
            if (tileFog !== 'discovered') { continue; }
            const regionId = resolveTileRegionId(tx, ty, om.cols, om.rows, fogLayout);
            const feedback = regionFeedbackMap.get(regionId);
            const boost = feedback?.dangerTier === 'high';
            let tint = boost ? hz.tint.replace('0.16', '0.28') : hz.tint;
            if (motionOn) {
                const offset = overmapHash(tx, ty, seed + 613) * Math.PI * 2;
                tint = scaleRgbaAlpha(tint, 0.8 + 0.2 * Math.sin(_tileAnimPhase / 900 + offset));
            }
            ctx.fillStyle = tint;
            ctx.fillRect(tx * cell, ty * cell, cell, cell);
            ctx.fillStyle = hz.fg;
            ctx.fillText(hz.glyph, tx * cell + cell / 2, ty * cell + cell / 2 + 1);
            if (motionOn && effectsTier === 'full') {
                drawEmberParticle(ctx, tx, ty, cell, _tileAnimPhase, seed);
            }
        }
    }

    function resolveTileRegionId(tx, ty, cols, rows, layout) {
        if (!layout.length) { return ''; }
        const leftPct = ((tx + 0.5) / cols) * 100;
        const topPct = ((ty + 0.5) / rows) * 100;
        let bestId = layout[0].regionId;
        let bestScore = Infinity;
        for (const entry of layout) {
            const dx = entry.leftPct - leftPct;
            const dy = entry.topPct - topPct;
            const radius = Math.max(2, entry.radiusPct || 7);
            const score = Math.sqrt(dx * dx + dy * dy) / radius;
            if (score < bestScore) {
                bestScore = score;
                bestId = entry.regionId;
            }
        }
        return bestId;
    }

    const pins = Array.isArray(msg.cartographyPins) ? msg.cartographyPins : [];
    ctx.font = `600 ${Math.max(8, cell)}px "Courier New", monospace`;
    let currentPin = null;
    for (const pin of pins) {
        if (typeof pin.leftPct !== 'number' || typeof pin.topPct !== 'number') { continue; }
        const pinFog = getRegionFogVisibility(pin.regionId, fog);
        if (pinFog === 'unknown') { continue; }
        const px = (pin.leftPct / 100) * cssWidth;
        const py = (pin.topPct / 100) * cssHeight;
        const meta = pin.locationId ? pinMetaMap.get(pin.locationId) : null;
        const isCurrent = pin.locationId && pin.locationId === msg.currentLocationId;
        if (meta?.dangerTier) { drawDangerRing(ctx, px, py, meta.dangerTier, cell); }
        if (meta?.mapHighlight) {
            drawMapEventBadge(ctx, px, py, cell, meta.highlightSeverity || 'info');
        }
        if (isCurrent) { currentPin = { pin, px, py, pinFog, meta }; continue; }
        const glyph = pinFog === 'rumored' ? '?' : '⌂';
        const pinColor = pinFog === 'rumored' ? '#9aa8b8' : (meta?.dangerTier === 'high' ? '#f0a0a0' : '#e8c87a');
        drawOvermapOutlinedText(ctx, glyph, px, py, pinColor);
        if (meta?.dangerTier === 'high') {
            drawOvermapOutlinedText(ctx, '⚠', px + cell * 0.55, py - cell * 0.35, '#ffb0a0');
        }
    }
    if (currentPin) {
        ctx.font = `600 ${Math.max(10, cell + 3)}px "Courier New", monospace`;
        if (motionOn) {
            ctx.globalAlpha = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(_tileAnimPhase / 700));
        }
        drawOvermapOutlinedText(ctx, '@', currentPin.px, currentPin.py, '#ffd75f');
        ctx.globalAlpha = 1;
        if (currentPin.pinFog === 'discovered') {
            ctx.font = '600 11px sans-serif';
            const label = currentPin.pin.locationName || currentPin.pin.locationId || '';
            const lx = Math.min(Math.max(currentPin.px, 30), cssWidth - 30);
            drawOvermapOutlinedText(ctx, label, lx, Math.min(currentPin.py + cell + 8, cssHeight - 6), '#ffe9a8');
        }
    }

    ctx.font = '600 11px sans-serif';
    const labels = Array.isArray(msg.cartographyRegionLabels) ? msg.cartographyRegionLabels : [];
    for (const label of labels) {
        if (typeof label.leftPct !== 'number' || typeof label.topPct !== 'number') { continue; }
        const labelFog = getRegionFogVisibility(label.regionId, fog);
        if (labelFog === 'unknown') { continue; }
        const lx = Math.min(Math.max((label.leftPct / 100) * cssWidth, 36), cssWidth - 36);
        const ly = Math.min(Math.max((label.topPct / 100) * cssHeight, 10), cssHeight - 6);
        const feedback = regionFeedbackMap.get(label.regionId);
        let labelText = label.regionName || label.regionId || '';
        if (labelFog === 'discovered' && feedback?.factionType) {
            const icons = { hostile: '💀', neutral: '⚖️', friendly: '🤝', 'player-faction': '⭐' };
            const icon = icons[feedback.factionType] || '';
            if (icon) { labelText = `${icon} ${labelText}`; }
        }
        const color = labelFog === 'rumored' ? '#8a98a8' : '#b8c4d0';
        drawOvermapOutlinedText(ctx, labelText, lx, ly, color);
    }

    drawMapOverlayMarkers(ctx, msg, cell, cssWidth, cssHeight);
    renderMapOverlayLegend(msg);
    syncVehicleTileHint(msg);
    hideMapOverlayTooltip();
}

/* --- 86a-settlement-render-source.js --- */
/* global document, T */

// ---------------------------------------------------------------------------
// SETTLEMENT-VIEW-SOURCE-001
// Shared fixed-city vs Mobile Base interior selection for Settlement + Diorama.
// Ephemeral Webview UI state only — not persisted to disk/game state.
// ---------------------------------------------------------------------------

const SETTLEMENT_RENDER_SOURCE_FIXED = 'fixed';
const SETTLEMENT_RENDER_SOURCE_MOBILE_BASE = 'mobile_base';

/** User override: 'fixed' | 'mobile_base' | null (null = use default rules). */
let _settlementRenderSourceChoice = null;
let _lastRenderSourceCurrentLocationId = null;
let _lastRenderSourceMode = null; // 'preview' | 'current' | null
let _settlementSourceControlsWired = false;

function isSettlementPreviewMode(msg) {
    return Boolean(msg && msg.settlementDisplayContext && msg.settlementDisplayContext.mode === 'preview');
}

function isLegacySettlementPayload(msg) {
    // Messages without multi-location context use pre-SLICE2 Mobile Base-first rules.
    return !msg || !msg.settlementDisplayContext;
}

function isFixedSettlementAvailable(msg) {
    if (!msg || !msg.settlementView) { return false; }
    const ctx = msg.settlementDisplayContext;
    if (ctx) {
        return ctx.availability === 'available';
    }
    // Legacy: any top-level settlementView counts as fixed/root available.
    return true;
}

function isMobileBaseInteriorAvailable(msg, forDiorama) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return false; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return false; }
    if (forDiorama) {
        return Boolean(interior.settlementDiorama);
    }
    return Boolean(interior.settlementView);
}

/**
 * Resolve which logical source Settlement and Diorama must both use.
 * @returns {{ source: 'fixed'|'mobile_base'|null, reason: string }}
 */
function resolveSettlementRenderSource(msg, options) {
    const forDiorama = Boolean(options && options.forDiorama);
    const choice = options && Object.prototype.hasOwnProperty.call(options, 'explicitChoice')
        ? options.explicitChoice
        : _settlementRenderSourceChoice;

    if (!msg) {
        return { source: null, reason: 'no_msg' };
    }

    const fixedOk = isFixedSettlementAvailable(msg);
    const mbOk = isMobileBaseInteriorAvailable(msg, forDiorama);

    // 1) Remote preview: always fixed; never MB fallback.
    if (isSettlementPreviewMode(msg)) {
        if (fixedOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'preview_fixed' };
        }
        return { source: null, reason: 'preview_missing_or_invalid' };
    }

    // 6) Legacy (no settlementDisplayContext): preserve Mobile Base-first.
    if (isLegacySettlementPayload(msg)) {
        if (mbOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'legacy_mb_first' };
        }
        if (fixedOk) {
            return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'legacy_fixed' };
        }
        return { source: null, reason: 'legacy_none' };
    }

    // 2–4) Current location with multi-location context.
    if (fixedOk && mbOk) {
        if (choice === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
            return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'user_mobile_base' };
        }
        return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'default_fixed' };
    }
    if (fixedOk) {
        return { source: SETTLEMENT_RENDER_SOURCE_FIXED, reason: 'fixed_only' };
    }
    if (mbOk) {
        return { source: SETTLEMENT_RENDER_SOURCE_MOBILE_BASE, reason: 'mobile_base_only' };
    }
    return { source: null, reason: 'none' };
}

function setSettlementRenderSourceChoice(source) {
    if (source === SETTLEMENT_RENDER_SOURCE_FIXED || source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        _settlementRenderSourceChoice = source;
        return;
    }
    if (source === null || source === undefined) {
        _settlementRenderSourceChoice = null;
    }
}

function getSettlementRenderSourceChoice() {
    return _settlementRenderSourceChoice;
}

/**
 * Normalize ephemeral choice when worldView updates (location / preview transitions).
 */
function onSettlementRenderSourceWorldMsg(msg) {
    const ctx = msg && msg.settlementDisplayContext;
    const currentLoc = (ctx && ctx.currentLocationId)
        || (msg && msg.currentLocationId)
        || null;
    const mode = isSettlementPreviewMode(msg) ? 'preview' : 'current';

    // Leaving remote preview → default fixed (clear explicit MB choice).
    if (_lastRenderSourceMode === 'preview' && mode === 'current') {
        _settlementRenderSourceChoice = null;
    }

    // Current location change → default fixed for the new city.
    if (
        mode === 'current'
        && _lastRenderSourceCurrentLocationId
        && currentLoc
        && _lastRenderSourceCurrentLocationId !== currentLoc
    ) {
        _settlementRenderSourceChoice = null;
    }

    // Drop explicit MB choice when MB is no longer available.
    if (_settlementRenderSourceChoice === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const mb2d = isMobileBaseInteriorAvailable(msg, false);
        const mb3d = isMobileBaseInteriorAvailable(msg, true);
        if (!mb2d && !mb3d) {
            _settlementRenderSourceChoice = null;
        }
    }

    _lastRenderSourceMode = mode;
    _lastRenderSourceCurrentLocationId = currentLoc;
}

function getSelectedSettlementView(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && interior.settlementView ? interior.settlementView : null;
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && msg.settlementView ? msg.settlementView : null;
    }
    return null;
}

function getSelectedSettlementDiorama(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: true });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && interior.settlementDiorama ? interior.settlementDiorama : null;
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && msg.settlementDiorama ? msg.settlementDiorama : null;
    }
    return null;
}

function getSelectedSettlementExpansionPreviews(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
        const interior = msg && msg.mobileBaseInterior;
        return interior && Array.isArray(interior.settlementExpansionPreviews)
            ? interior.settlementExpansionPreviews
            : [];
    }
    if (resolved.source === SETTLEMENT_RENDER_SOURCE_FIXED) {
        return msg && Array.isArray(msg.settlementExpansionPreviews)
            ? msg.settlementExpansionPreviews
            : [];
    }
    return [];
}

function shouldShowSettlementSourceSelector(msg) {
    if (!msg || isSettlementPreviewMode(msg) || isLegacySettlementPayload(msg)) {
        return false;
    }
    return isFixedSettlementAvailable(msg) && isMobileBaseInteriorAvailable(msg, false);
}

function tSettlementSource(key) {
    if (typeof T === 'function') {
        const tr = T(key);
        if (tr && tr !== key) { return tr; }
    }
    if (key === 'webview.world.settlementSourceFixed') { return 'Settlement'; }
    if (key === 'webview.world.settlementSourceMobileBase') { return 'Mobile Base interior'; }
    if (key === 'webview.world.settlementSourceAria') { return 'Settlement view source'; }
    return key;
}

function wireSettlementSourceControlsOnce() {
    if (_settlementSourceControlsWired) { return; }
    _settlementSourceControlsWired = true;
    document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest
            ? e.target.closest('[data-settlement-source]')
            : null;
        if (!btn) { return; }
        const source = btn.getAttribute('data-settlement-source');
        if (source !== SETTLEMENT_RENDER_SOURCE_FIXED && source !== SETTLEMENT_RENDER_SOURCE_MOBILE_BASE) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        setSettlementRenderSourceChoice(source);
        const msg = (typeof _settlementWorldMsg !== 'undefined' && _settlementWorldMsg)
            || (typeof _dioramaWorldMsg !== 'undefined' && _dioramaWorldMsg)
            || null;
        renderSettlementSourceSelector(msg);
        if (typeof drawSettlementIsometric === 'function') {
            try { drawSettlementIsometric(); } catch (_err) { /* ignore */ }
        }
        if (typeof renderSettlementDiorama === 'function') {
            try { renderSettlementDiorama(); } catch (_err) { /* ignore */ }
        }
    });
}

function syncSourceBar(prefix, msg) {
    const bar = document.getElementById(`world-${prefix}-source-bar`);
    if (!bar) { return; }
    const show = shouldShowSettlementSourceSelector(msg);
    bar.classList.toggle('hidden', !show);
    if (!show) { return; }

    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    const active = resolved.source || SETTLEMENT_RENDER_SOURCE_FIXED;
    const fixedBtn = document.getElementById(`world-${prefix}-source-fixed`);
    const mbBtn = document.getElementById(`world-${prefix}-source-mb`);
    if (fixedBtn) {
        fixedBtn.textContent = tSettlementSource('webview.world.settlementSourceFixed');
        fixedBtn.classList.toggle('is-active', active === SETTLEMENT_RENDER_SOURCE_FIXED);
        fixedBtn.setAttribute('aria-pressed', active === SETTLEMENT_RENDER_SOURCE_FIXED ? 'true' : 'false');
    }
    if (mbBtn) {
        mbBtn.textContent = tSettlementSource('webview.world.settlementSourceMobileBase');
        mbBtn.classList.toggle('is-active', active === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE);
        mbBtn.setAttribute('aria-pressed', active === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE ? 'true' : 'false');
    }
    bar.setAttribute('aria-label', tSettlementSource('webview.world.settlementSourceAria'));
}

function renderSettlementSourceSelector(msg) {
    wireSettlementSourceControlsOnce();
    syncSourceBar('settlement', msg);
    syncSourceBar('diorama', msg);
}

function isMobileBaseRenderSourceSelected(msg) {
    const resolved = resolveSettlementRenderSource(msg, { forDiorama: false });
    return resolved.source === SETTLEMENT_RENDER_SOURCE_MOBILE_BASE;
}

/* --- 86b0-settlement-iso-geometry.js --- */
/* global */

// ---------------------------------------------------------------------------
// SETTLEMENT-2D-FRAMING-001 / CENTERING-002 — pure projected-bounds + transform.
//
// Unified transform contract (content space → screen space):
//
//   content (sx0, sy0)  = iso projection with origin at (0,0)
//   origin  (originX, originY)  = absolute isometric origin (stored as pan)
//   pivot   = (originX + contentCenterX, originY + contentCenterY)
//   draw    = (originX + sx0, originY + sy0)
//   screen  = pivot + zoom * (draw - pivot)
//           = pivot + zoom * (sx0 - contentCenter)
//
// Automatic Fit sets origin so pivot === canvas centre, and zoom so the
// content AABB has >= padding slack on every edge (when geometrically possible).
// ---------------------------------------------------------------------------

const ISO_TILE_W = 32;
const ISO_TILE_H = 16;
const ISO_LAYER_HEIGHT = 12;
const ISO_MARKER_BUBBLE = 14;

const ISO_TILE_ELEVATION = {
    floor: 2,
    wall: 16,
    gate: 12,
    market: 8,
    workshop: 9,
    stockpile: 6,
    quarters: 9,
    clinic: 9,
    barracks: 10,
    shrine: 12,
    water: 0,
    ruins: 5,
    hazard: 3,
    empty: 0,
    unknown: 4,
};

/** Preference schema version — v1 absolute-origin prefs from FRAMING-001 may be invalid. */
const SETTLEMENT_TRANSFORM_PREF_VERSION = 2;

function isoProjectRaw(x, y, z) {
    return {
        sx: (x - y) * (ISO_TILE_W / 2),
        sy: (x + y) * (ISO_TILE_H / 2) - (z || 0) * ISO_LAYER_HEIGHT,
    };
}

/**
 * Actual projected content AABB of the active settlement view (origin at 0,0).
 * Includes tile diamonds, extrusion tops, and marker bubbles.
 */
function computeSettlementProjectedContentBounds(view) {
    if (!view) { return null; }
    const tiles = Array.isArray(view.tiles) ? view.tiles : [];
    const markers = Array.isArray(view.markers) ? view.markers : [];
    if (!tiles.length && !markers.length) { return null; }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const hw = ISO_TILE_W / 2;
    const hh = ISO_TILE_H / 2;

    for (const tile of tiles) {
        const x = Number(tile.x) || 0;
        const y = Number(tile.y) || 0;
        const z = Number(tile.z) || 0;
        const { sx, sy } = isoProjectRaw(x, y, z);
        const elev = ISO_TILE_ELEVATION[tile.code] ?? 4;
        const topY = sy - elev;
        minX = Math.min(minX, sx - hw);
        maxX = Math.max(maxX, sx + hw);
        minY = Math.min(minY, topY - hh, sy - hh);
        maxY = Math.max(maxY, sy + hh, topY + hh);
    }

    for (const marker of markers) {
        const x = Number(marker.x) || 0;
        const y = Number(marker.y) || 0;
        const z = Number(marker.z) || 0;
        const { sx, sy } = isoProjectRaw(x, y, z);
        minX = Math.min(minX, sx - 10);
        maxX = Math.max(maxX, sx + 10);
        minY = Math.min(minY, sy - ISO_TILE_H - ISO_MARKER_BUBBLE);
        maxY = Math.max(maxY, sy + 6);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) { return null; }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        tileCount: tiles.length,
        markerCount: markers.length,
    };
}

/**
 * Map content-space point through the unified transform to screen CSS pixels.
 */
function contentToScreen(sx0, sy0, originX, originY, zoom, contentCenterX, contentCenterY) {
    const pivotX = originX + contentCenterX;
    const pivotY = originY + contentCenterY;
    const drawX = originX + sx0;
    const drawY = originY + sy0;
    return {
        x: pivotX + (drawX - pivotX) * zoom,
        y: pivotY + (drawY - pivotY) * zoom,
    };
}

/**
 * Exact inverse of contentToScreen(). Input/output use CSS pixels and raw
 * projected settlement content coordinates (before the absolute origin).
 */
function screenToSettlementContent(screenX, screenY, originX, originY, zoom, contentCenterX, contentCenterY) {
    if (!Number.isFinite(zoom) || zoom <= 0) {
        return { x: NaN, y: NaN };
    }
    const pivotX = originX + contentCenterX;
    const pivotY = originY + contentCenterY;
    const drawX = pivotX + (screenX - pivotX) / zoom;
    const drawY = pivotY + (screenY - pivotY) / zoom;
    return {
        x: drawX - originX,
        y: drawY - originY,
    };
}

/** Stable renderer identity; tile ids are absent in the settlement payload. */
function settlementHitKey(hit) {
    if (!hit) { return ''; }
    if (hit.key) { return String(hit.key); }
    if (hit.type === 'marker') { return `marker:${hit.id || ''}`; }
    if (hit.type === 'tile') {
        return `tile:${Number(hit.x) || 0},${Number(hit.y) || 0},${Number(hit.z) || 0}:${hit.code || 'unknown'}`;
    }
    return `${hit.type || 'hit'}:${hit.id || ''}:${hit.contentX || 0},${hit.contentY || 0}`;
}

/** Hit-test in content space while keeping a constant CSS-pixel radius. */
function hitTestSettlementContent(hits, contentPoint, screenRadiusPx, zoom) {
    if (!Array.isArray(hits) || !contentPoint || !Number.isFinite(contentPoint.x)
        || !Number.isFinite(contentPoint.y) || !Number.isFinite(zoom) || zoom <= 0) {
        return null;
    }
    const radius = Math.max(0, Number(screenRadiusPx) || 0) / zoom;
    let best = null;
    let bestDist = radius + Number.EPSILON;
    for (const hit of hits) {
        if (!Number.isFinite(hit?.contentX) || !Number.isFinite(hit?.contentY)) { continue; }
        const dist = Math.hypot(hit.contentX - contentPoint.x, hit.contentY - contentPoint.y);
        if (dist <= radius && dist < bestDist) {
            bestDist = dist;
            best = hit;
        }
    }
    return best;
}

/**
 * Exact screen-space layout of content bounds under the renderer transform.
 * Returns edge slacks, crossings, and centre counts.
 */
function computeSettlementScreenLayout(view, canvasSize, pan, zoom) {
    const empty = {
        ok: false,
        leftSlack: 0,
        rightSlack: 0,
        topSlack: 0,
        bottomSlack: 0,
        crossingLeft: 0,
        crossingRight: 0,
        crossingTop: 0,
        crossingBottom: 0,
        centersInside: 0,
        visibleRatio: 0,
        screenBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        contentBounds: null,
        pivot: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        zoom: zoom || 1,
    };
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    if (!view || !cw || !ch || !zoom || zoom <= 0 || !pan) { return empty; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return empty; }

    const originX = pan.x;
    const originY = pan.y;
    const pivotX = originX + bounds.centerX;
    const pivotY = originY + bounds.centerY;

    const corners = [
        contentToScreen(bounds.minX, bounds.minY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.maxX, bounds.minY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.minX, bounds.maxY, originX, originY, zoom, bounds.centerX, bounds.centerY),
        contentToScreen(bounds.maxX, bounds.maxY, originX, originY, zoom, bounds.centerX, bounds.centerY),
    ];
    let sMinX = Infinity;
    let sMinY = Infinity;
    let sMaxX = -Infinity;
    let sMaxY = -Infinity;
    for (const c of corners) {
        sMinX = Math.min(sMinX, c.x);
        sMinY = Math.min(sMinY, c.y);
        sMaxX = Math.max(sMaxX, c.x);
        sMaxY = Math.max(sMaxY, c.y);
    }

    const leftSlack = sMinX;
    const rightSlack = cw - sMaxX;
    const topSlack = sMinY;
    const bottomSlack = ch - sMaxY;

    // Crossing counts: corners of content AABB outside edge (strict)
    let crossingLeft = 0;
    let crossingRight = 0;
    let crossingTop = 0;
    let crossingBottom = 0;
    if (sMinX < -0.5) { crossingLeft = 1; }
    if (sMaxX > cw + 0.5) { crossingRight = 1; }
    if (sMinY < -0.5) { crossingTop = 1; }
    if (sMaxY > ch + 0.5) { crossingBottom = 1; }

    let centersInside = 0;
    const tiles = Array.isArray(view.tiles) ? view.tiles : [];
    for (const tile of tiles) {
        const p0 = isoProjectRaw(Number(tile.x) || 0, Number(tile.y) || 0, Number(tile.z) || 0);
        const sc = contentToScreen(p0.sx, p0.sy, originX, originY, zoom, bounds.centerX, bounds.centerY);
        if (sc.x >= 0 && sc.x <= cw && sc.y >= 0 && sc.y <= ch) {
            centersInside++;
        }
    }

    const ix0 = Math.max(0, sMinX);
    const iy0 = Math.max(0, sMinY);
    const ix1 = Math.min(cw, sMaxX);
    const iy1 = Math.min(ch, sMaxY);
    const interArea = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
    const contentArea = Math.max(1, (sMaxX - sMinX) * (sMaxY - sMinY));

    return {
        ok: crossingLeft === 0 && crossingRight === 0 && crossingTop === 0 && crossingBottom === 0
            && centersInside > 0,
        leftSlack,
        rightSlack,
        topSlack,
        bottomSlack,
        crossingLeft,
        crossingRight,
        crossingTop,
        crossingBottom,
        centersInside,
        visibleRatio: interArea / contentArea,
        screenBounds: { minX: sMinX, minY: sMinY, maxX: sMaxX, maxY: sMaxY },
        contentBounds: bounds,
        pivot: { x: pivotX, y: pivotY },
        origin: { x: originX, y: originY },
        zoom,
    };
}

/**
 * Fit zoom + origin so content is centred with equal slack on opposite sides.
 *
 * @returns {{ zoom, pan: {x,y}, origin, pivot, bounds, padding, layout } | null}
 */
function computeSettlementFitTransform(view, canvasSize, options) {
    const pad = (options && options.padding != null) ? options.padding : 24;
    const minPad = (options && options.minPadding != null) ? options.minPadding : 18;
    const zoomMin = (options && options.zoomMin != null) ? options.zoomMin : 0.25;
    const zoomMax = (options && options.zoomMax != null) ? options.zoomMax : 3;
    const cw = canvasSize && canvasSize.width;
    const ch = canvasSize && canvasSize.height;
    if (!view || !cw || !ch) { return null; }

    const bounds = computeSettlementProjectedContentBounds(view);
    if (!bounds) { return null; }

    // Uniform scale: content must fit inside canvas with target padding on all sides.
    const usableW = Math.max(1, cw - pad * 2);
    const usableH = Math.max(1, ch - pad * 2);
    let zoom = Math.min(usableW / bounds.width, usableH / bounds.height);
    zoom = Math.max(zoomMin, Math.min(zoomMax, zoom));

    // Pivot at canvas centre; origin so content centre maps to canvas centre.
    // screen = canvasCentre + zoom * (sx0 - contentCentre)
    // ⇒ origin + contentCentre = canvasCentre  (for pre-zoom draw position of centre)
    const originX = cw / 2 - bounds.centerX;
    const originY = ch / 2 - bounds.centerY;
    const pan = { x: originX, y: originY };
    const pivot = { x: cw / 2, y: ch / 2 };

    const layout = computeSettlementScreenLayout(view, canvasSize, pan, zoom);

    // If zoom was clamped by zoomMin and still clips, accept best-effort (caller may still use it).
    return {
        zoom,
        pan,
        origin: { x: originX, y: originY },
        pivot,
        bounds,
        padding: pad,
        minPadding: minPad,
        layout,
        version: SETTLEMENT_TRANSFORM_PREF_VERSION,
    };
}

/**
 * Whether a stored transform is acceptable to keep (centred enough, no clipping).
 */
function isSettlementTransformMeaningfullyVisible(view, canvasSize, pan, zoom, options) {
    const minPad = (options && options.minPadding != null) ? options.minPadding : 12;
    const requireSymmetric = options && options.requireSymmetric === true;
    const maxAsym = (options && options.maxAsymmetry != null) ? options.maxAsymmetry : 24;
    const layout = computeSettlementScreenLayout(view, canvasSize, pan, zoom);
    if (!layout || !layout.contentBounds) {
        return {
            ok: false,
            visibleRatio: 0,
            centersInside: 0,
            interArea: 0,
            contentArea: 0,
            screenBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
            layout,
        };
    }

    const noCross = layout.crossingLeft === 0 && layout.crossingRight === 0
        && layout.crossingTop === 0 && layout.crossingBottom === 0;
    const enoughPad = layout.leftSlack >= minPad && layout.rightSlack >= minPad
        && layout.topSlack >= minPad && layout.bottomSlack >= minPad;
    const symOk = !requireSymmetric
        || (Math.abs(layout.leftSlack - layout.rightSlack) <= maxAsym
            && Math.abs(layout.topSlack - layout.bottomSlack) <= maxAsym);

    return {
        ok: noCross && enoughPad && layout.centersInside > 0 && symOk,
        visibleRatio: layout.visibleRatio,
        centersInside: layout.centersInside,
        interArea: layout.visibleRatio, // kept for older callers
        contentArea: 1,
        screenBounds: layout.screenBounds,
        layout,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ISO_TILE_W,
        ISO_TILE_H,
        ISO_LAYER_HEIGHT,
        ISO_TILE_ELEVATION,
        SETTLEMENT_TRANSFORM_PREF_VERSION,
        isoProjectRaw,
        contentToScreen,
        screenToSettlementContent,
        settlementHitKey,
        hitTestSettlementContent,
        computeSettlementProjectedContentBounds,
        computeSettlementScreenLayout,
        computeSettlementFitTransform,
        isSettlementTransformMeaningfullyVisible,
    };
}

/* --- 86b-settlement-isometric.js --- */
/* global document, window, vscode */

// ---------------------------------------------------------------------------
// Settlement isometric view (M3b) — read-only Canvas renderer for settlementView
// ---------------------------------------------------------------------------

let _settlementWorldMsg = null;
let _settlementPan = { x: 0, y: 0 };
let _settlementZoom = 1;
let _settlementDrag = null;
let _settlementDidDrag = false;
let _settlementHits = [];
let _settlementSelected = null;
let _lastSettlementId = null;
let _lastSettlementLayerId = null;
let _lastSettlementSourceKey = null; // fixed vs mobile_base + settlementId
let _settlementControlsReady = false;
let _settlementExpandHoverPreview = null;
let _lastSettlementExpandLayerId = null;
let _settlementResizeObserver = null;
let _settlementLastCssSize = { w: 0, h: 0 };
let _settlementPendingFit = false;
let _settlementUserPanActive = false;

const SETTLEMENT_EXPAND_PROFILE_I18N_KEY = {
    cellar: 'webview.world.settlementExpandProfileCellar',
    waterworks: 'webview.world.settlementExpandProfileWaterworks',
    shelter: 'webview.world.settlementExpandProfileShelter',
    ruins: 'webview.world.settlementExpandProfileRuins',
    roof: 'webview.world.settlementExpandProfileRoof',
    watchtower: 'webview.world.settlementExpandProfileWatchtower',
    generic: 'webview.world.settlementExpandProfileGeneric',
};
const SETTLEMENT_EXPAND_PROFILE_FALLBACK = {
    cellar: 'Request cellar',
    waterworks: 'Request waterworks',
    shelter: 'Request shelter',
    ruins: 'Request ruins excavation',
    roof: 'Request roof access',
    watchtower: 'Request watch platform',
    generic: 'Request expansion',
};

const SETTLEMENT_TILE_W = 32;
const SETTLEMENT_TILE_H = 16;
const SETTLEMENT_LAYER_HEIGHT = 12;
// Min lowered so dense declared-size mismatches can still fit; content-based
// fit normally lands near 0.6–1.5 for showcase cities.
const SETTLEMENT_ZOOM_MIN = 0.25;
const SETTLEMENT_ZOOM_MAX = 3;
const SETTLEMENT_ZOOM_STEP = 0.15;
const SETTLEMENT_FIT_PADDING = 24;
const SETTLEMENT_HIT_RADIUS_PX = 12;
// v2: pan is absolute iso origin under content-centred pivot (CENTERING-002).
const SETTLEMENT_PREFS_PREFIX = 'lorerelay.settlementView.v2.';
const SETTLEMENT_PREFS_MIN_PAD = 12;

const SETTLEMENT_TILE_COLORS = {
    floor: { top: '#5a6270', left: '#4a5260', right: '#6a7280', glyph: '.' },
    wall: { top: '#707880', left: '#505860', right: '#808890', glyph: '#' },
    gate: { top: '#b09060', left: '#907040', right: '#c0a070', glyph: 'G' },
    market: { top: '#d8b060', left: '#b89040', right: '#e8c070', glyph: 'M' },
    workshop: { top: '#8090a8', left: '#607088', right: '#90a0b8', glyph: 'W' },
    stockpile: { top: '#a89868', left: '#887848', right: '#b8a878', glyph: 'S' },
    quarters: { top: '#68a870', left: '#488850', right: '#78b880', glyph: 'Q' },
    clinic: { top: '#58b0a8', left: '#389088', right: '#68c0b8', glyph: 'C' },
    barracks: { top: '#a86050', left: '#884030', right: '#b87060', glyph: 'B' },
    shrine: { top: '#9878c0', left: '#7858a0', right: '#a888d0', glyph: 'H' },
    water: { top: '#5090d0', left: '#3070b0', right: '#60a0e0', glyph: '~' },
    ruins: { top: '#808080', left: '#606060', right: '#909090', glyph: 'R' },
    hazard: { top: '#d05050', left: '#b03030', right: '#e06060', glyph: '!' },
    empty: { top: '#404850', left: '#303840', right: '#505860', glyph: ' ' },
    unknown: { top: '#686878', left: '#505058', right: '#787888', glyph: '?' },
};

const SETTLEMENT_MOBILE_BASE_FOOTPRINT_COLORS = {
    ship: { top: '#596777', left: '#394858', right: '#68798b' },
    wagon: { top: '#74654f', left: '#514432', right: '#88765b' },
    caravan: { top: '#6b6051', left: '#4a4034', right: '#7d705d' },
    camp: { top: '#4f6658', left: '#34483b', right: '#607866' },
    'mobile-base': { top: '#59616c', left: '#3c444e', right: '#6b7480' },
};

const SETTLEMENT_MARKER_COLORS = {
    resident: '#6ecf8a',
    visitor: '#9aa8b8',
    merchant: '#e8c87a',
    project: '#80a8e0',
    incident: '#e07070',
    stock_low: '#e8b050',
    structure_note: '#b8c4d0',
    player: '#ffd75f',
};

const SETTLEMENT_MARKER_GLYPHS = {
    resident: 'o',
    visitor: 'v',
    merchant: '$',
    project: '*',
    incident: '!',
    stock_low: 'L',
    structure_note: 'n',
    player: '@',
};

// Visual polish: per-code extrusion height (px at zoom 1). The left/right face
// colors in SETTLEMENT_TILE_COLORS were previously unused — the "isometric"
// view drew flat top diamonds only. Heights are display-only (hit testing and
// the M4c ghost preview still use the flat base position).
const SETTLEMENT_TILE_ELEVATION = {
    floor: 2,
    wall: 16,
    gate: 12,
    market: 8,
    workshop: 9,
    stockpile: 6,
    quarters: 9,
    clinic: 9,
    barracks: 10,
    shrine: 12,
    water: 0,
    ruins: 5,
    hazard: 3,
    empty: 0,
    unknown: 4,
};

let _settlementHover = null;

// P2: manual day/dusk/night toggle. There is no structured world-clock field
// in game_state/world_state (GM-authored status.time is free text), so this
// is a display-only, per-settlement preference rather than an automatic
// simulation-time readout. Cycles day -> dusk -> night -> day.
const SETTLEMENT_TIME_OF_DAY_ORDER = ['day', 'dusk', 'night'];
const SETTLEMENT_TIME_OF_DAY_ICON = { day: '☀️', dusk: '🌆', night: '🌙' };
let _settlementTimeOfDay = 'day';

// Sky/glow backdrop and top-face rim-light tint per time of day. Side-face
// shading (drawIsoBlock) reuses these via SETTLEMENT_TIME_SHADE_FACTOR.
const SETTLEMENT_TIME_PALETTE = {
    day: {
        sky: ['#1c2438', '#141c30', '#0a0e1c'],
        glow: 'rgba(120, 160, 220, 0.12)',
        rim: 'rgba(255,255,255,0.22)',
        vignette: 'rgba(0,0,0,0.32)',
    },
    dusk: {
        sky: ['#2a1c30', '#1c1428', '#0e0a16'],
        glow: 'rgba(230, 140, 90, 0.14)',
        rim: 'rgba(255,205,150,0.28)',
        vignette: 'rgba(20,8,10,0.42)',
    },
    night: {
        sky: ['#0a0c16', '#07080f', '#04050a'],
        glow: 'rgba(90, 110, 200, 0.10)',
        rim: 'rgba(170,190,255,0.20)',
        vignette: 'rgba(0,0,4,0.55)',
    },
};

// Multiplies the left/right face lightness so night reads darker/moodier and
// day reads brighter, without needing per-tile-code night variants.
const SETTLEMENT_TIME_SHADE_FACTOR = { day: 1, dusk: 0.88, night: 0.62 };

function settlementTimeOfDayKey(settlementId) {
    return settlementPrefsKey(settlementId, 'timeOfDay');
}

function loadSettlementTimeOfDay(settlementId) {
    if (!settlementId) { return; }
    try {
        const raw = localStorage.getItem(settlementTimeOfDayKey(settlementId));
        if (raw && SETTLEMENT_TIME_OF_DAY_ORDER.includes(raw)) {
            _settlementTimeOfDay = raw;
            return;
        }
    } catch { /* ignore */ }
    _settlementTimeOfDay = 'day';
}

function saveSettlementTimeOfDay(settlementId) {
    if (!settlementId) { return; }
    try {
        localStorage.setItem(settlementTimeOfDayKey(settlementId), _settlementTimeOfDay);
    } catch { /* ignore */ }
}

function syncSettlementTimeToggleButton() {
    const btn = document.getElementById('world-settlement-time-toggle');
    if (!btn) { return; }
    btn.textContent = SETTLEMENT_TIME_OF_DAY_ICON[_settlementTimeOfDay] || '☀️';
    const labelKey = `webview.world.settlementTimeOfDay.${_settlementTimeOfDay}`;
    const label = typeof T === 'function' ? T(labelKey) : _settlementTimeOfDay;
    btn.title = label && label !== labelKey ? label : _settlementTimeOfDay;
}

function darkenHexColor(hex, factor) {
    if (factor >= 1) { return hex; }
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) { return hex; }
    const num = parseInt(m[1], 16);
    const r = Math.round(((num >> 16) & 0xff) * factor);
    const g = Math.round(((num >> 8) & 0xff) * factor);
    const b = Math.round((num & 0xff) * factor);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function settlementPrefsKey(settlementId, suffix) {
    return `${SETTLEMENT_PREFS_PREFIX}${settlementId}.${suffix}`;
}

function loadSettlementViewPrefs(settlementId) {
    if (!settlementId) { return false; }
    let loaded = false;
    try {
        const panRaw = localStorage.getItem(settlementPrefsKey(settlementId, 'pan'));
        const zoomRaw = localStorage.getItem(settlementPrefsKey(settlementId, 'zoom'));
        if (panRaw) {
            const pan = JSON.parse(panRaw);
            if (typeof pan.x === 'number' && typeof pan.y === 'number'
                && Number.isFinite(pan.x) && Number.isFinite(pan.y)
                && Math.abs(pan.x) < 20000 && Math.abs(pan.y) < 20000) {
                _settlementPan = { x: pan.x, y: pan.y };
                loaded = true;
            }
        }
        if (zoomRaw) {
            const zoom = Number(zoomRaw);
            if (Number.isFinite(zoom)) {
                _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, zoom));
                loaded = true;
            }
        }
    } catch { /* ignore */ }
    return loaded;
}

function saveSettlementViewPrefs(settlementId) {
    if (!settlementId) { return; }
    try {
        localStorage.setItem(settlementPrefsKey(settlementId, 'pan'), JSON.stringify(_settlementPan));
        localStorage.setItem(settlementPrefsKey(settlementId, 'zoom'), String(_settlementZoom));
    } catch { /* ignore */ }
}

function resetSettlementViewTransform() {
    _settlementPan = { x: 0, y: 0 };
    _settlementZoom = 1;
}

function getMobileBaseInterior(msg) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return null; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return null; }
    return interior;
}

function getSettlementSnapshot() {
    const msg = _settlementWorldMsg;
    // SETTLEMENT-VIEW-SOURCE-001: shared fixed vs Mobile Base selection (never silent MB override).
    if (typeof getSelectedSettlementView === 'function') {
        return getSelectedSettlementView(msg);
    }
    // Fallback if shared helper not loaded (should not happen after build).
    return msg && msg.settlementView ? msg.settlementView : null;
}

function isMobileBaseVisualSource(msg, view) {
    if (!msg || !view) { return false; }
    const interior = getMobileBaseInterior(msg);
    if (!interior || view.settlementId !== interior.settlementId) { return false; }
    if (typeof resolveSettlementRenderSource === 'function') {
        return resolveSettlementRenderSource(msg, { forDiorama: false })?.source === 'mobile_base';
    }
    return false;
}

function mobileBaseLayerZ(view) {
    const match = /^z(-?\d+)$/.exec(String(view?.layerId || 'z0'));
    return match ? Number(match[1]) : 0;
}

function mobileBaseVisualKind(interior) {
    const identity = [interior?.vehicleKind, interior?.mode, interior?.layoutProfile]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
    if (/\b(ship|boat|barge|airship)\b/.test(identity)) { return 'ship'; }
    if (/\b(wagon|landship|crawler)\b/.test(identity)) { return 'wagon'; }
    if (/\b(caravan|train|mobile_community)\b/.test(identity)) { return 'caravan'; }
    if (/\b(camp|nomad_camp)\b/.test(identity)) { return 'camp'; }
    return 'mobile-base';
}

/**
 * Display-only structural floor for sparse Mobile Base payloads. It is derived
 * deterministically from authoritative occupied-tile bounds and never enters
 * hit testing, messages, persistence, or the settlement data contract.
 */
function deriveMobileBaseStructuralFootprint(msg, view) {
    if (!isMobileBaseVisualSource(msg, view)) { return []; }
    const interior = getMobileBaseInterior(msg);
    const tiles = Array.isArray(view?.tiles) ? view.tiles : [];
    const markers = Array.isArray(view?.markers) ? view.markers : [];
    const tilePoints = tiles.filter((item) => Number.isFinite(item?.x) && Number.isFinite(item?.y));
    const markerPoints = markers.filter((item) => Number.isFinite(item?.x) && Number.isFinite(item?.y));
    if (tilePoints.length === 0 && markerPoints.length === 0) { return []; }
    // Settlement state markers can have deterministic fallback coordinates
    // spread across the generic 16x16 settlement canvas. Those coordinates are
    // not authored rooms and must not inflate a four-cell deck into a giant
    // square. Occupied tiles define the body; marker-only payloads use a stable
    // centroid anchor and are visually associated with that body below.
    const points = tilePoints.length > 0
        ? tilePoints
        : [{
            x: Math.round(markerPoints.reduce((sum, marker) => sum + marker.x, 0) / markerPoints.length),
            y: Math.round(markerPoints.reduce((sum, marker) => sum + marker.y, 0) / markerPoints.length),
        }];
    const visualKind = mobileBaseVisualKind(interior);
    const profile = visualKind === 'ship'
        ? { kind: 'ship', minW: 8, minH: 4, padX: 0, padY: 0 }
        : visualKind === 'wagon'
            ? { kind: 'wagon', minW: 6, minH: 3, padX: 0, padY: 0 }
            : visualKind === 'caravan'
                ? { kind: 'caravan', minW: 7, minH: 4, padX: 0, padY: 0 }
                : visualKind === 'camp'
                    ? { kind: 'camp', minW: 7, minH: 5, padX: 0, padY: 0 }
                    : { kind: 'mobile-base', minW: 6, minH: 4, padX: 0, padY: 0 };
    let minX = Math.floor(Math.min(...points.map((p) => p.x))) - profile.padX;
    let maxX = Math.ceil(Math.max(...points.map((p) => p.x))) + profile.padX;
    let minY = Math.floor(Math.min(...points.map((p) => p.y))) - profile.padY;
    let maxY = Math.ceil(Math.max(...points.map((p) => p.y))) + profile.padY;
    const addX = Math.max(0, profile.minW - (maxX - minX + 1));
    const addY = Math.max(0, profile.minH - (maxY - minY + 1));
    minX -= Math.floor(addX / 2);
    maxX += Math.ceil(addX / 2);
    minY -= Math.floor(addY / 2);
    maxY += Math.ceil(addY / 2);
    // Defensive presentation bound for malformed coordinates. Authoritative
    // points remain visible through the normal tile/marker renderer.
    if ((maxX - minX + 1) > 24 || (maxY - minY + 1) > 24) { return []; }
    const z = mobileBaseLayerZ(view);
    const occupied = new Set(tiles.map((tile) => `${tile.x}:${tile.y}:${tile.z ?? z}`));
    const footprint = [];
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const taperedShipCorner = profile.kind === 'ship'
                && (y === minY || y === maxY)
                && (x === minX || x === maxX);
            if (taperedShipCorner || occupied.has(`${x}:${y}:${z}`)) { continue; }
            footprint.push({
                x,
                y,
                z,
                code: 'floor',
                label: '',
                decorative: true,
                visualKind: profile.kind,
            });
        }
    }
    return footprint;
}

/** Mobile-base state markers are often placed by the generic settlement
 * fallback grid rather than an authored vehicle layout. Associate those visual
 * markers with the display-only body without mutating the authoritative view.
 * Their identity, kind, label, detail, and layer remain untouched. */
function associateMobileBaseMarkersWithFootprint(view, structuralTiles) {
    const markers = Array.isArray(view?.markers) ? view.markers : [];
    if (markers.length === 0 || structuralTiles.length === 0) { return markers; }
    const minX = Math.min(...structuralTiles.map((tile) => tile.x));
    const maxX = Math.max(...structuralTiles.map((tile) => tile.x));
    const minY = Math.min(...structuralTiles.map((tile) => tile.y));
    const maxY = Math.max(...structuralTiles.map((tile) => tile.y));
    const innerMinX = minX + (maxX - minX >= 4 ? 1 : 0);
    const innerMaxX = maxX - (maxX - minX >= 4 ? 1 : 0);
    const innerMinY = minY + (maxY - minY >= 3 ? 1 : 0);
    const innerMaxY = maxY - (maxY - minY >= 3 ? 1 : 0);
    const sourceWidth = Math.max(1, Number(view?.width) - 1 || 1);
    const sourceHeight = Math.max(1, Number(view?.height) - 1 || 1);
    return markers.map((marker) => {
        const unitX = Math.max(0, Math.min(1, Number(marker.x) / sourceWidth));
        const unitY = Math.max(0, Math.min(1, Number(marker.y) / sourceHeight));
        return {
            ...marker,
            x: Math.round(innerMinX + unitX * Math.max(0, innerMaxX - innerMinX)),
            y: Math.round(innerMinY + unitY * Math.max(0, innerMaxY - innerMinY)),
        };
    });
}

function buildSettlementVisualView(msg, view) {
    if (!view) { return null; }
    const footprint = deriveMobileBaseStructuralFootprint(msg, view);
    if (footprint.length === 0) { return view; }
    const authoritativeTiles = Array.isArray(view.tiles) ? view.tiles : [];
    const structuralTiles = [...footprint, ...authoritativeTiles];
    return {
        ...view,
        tiles: structuralTiles,
        markers: associateMobileBaseMarkersWithFootprint(view, structuralTiles),
    };
}

function mobileBaseLayerSemanticLabel(interior, layerId, known) {
    const supplied = typeof known?.label === 'string' ? known.label.trim() : '';
    const genericSettlementLabels = new Set(['Upper deck', 'Ground', 'Cellar', 'Deep ruins']);
    if (supplied && !/^z[+-]?\d+$/i.test(supplied) && !genericSettlementLabels.has(supplied)) { return supplied; }
    const visualKind = mobileBaseVisualKind(interior);
    const labels = visualKind === 'ship'
        ? { z1: 'Deck', z0: 'Hold', 'z-1': 'Lower hold', 'z-2': 'Bilge' }
        : visualKind === 'wagon'
            ? { z1: 'Roof', z0: 'Cabin', 'z-1': 'Storage' }
            : visualKind === 'camp'
                ? { z1: 'Lookout', z0: 'Camp', 'z-1': 'Cache' }
                : { z1: 'Upper level', z0: 'Interior', 'z-1': 'Storage', 'z-2': 'Lower level' };
    return labels[layerId] || supplied || layerId.toUpperCase();
}

/** M4c: read-only ghost previews — same logical source as settlementView. */
function getSettlementExpansionPreviews() {
    const msg = _settlementWorldMsg;
    if (typeof getSelectedSettlementExpansionPreviews === 'function') {
        return getSelectedSettlementExpansionPreviews(msg);
    }
    return msg && Array.isArray(msg.settlementExpansionPreviews) ? msg.settlementExpansionPreviews : [];
}

function renderMobileBaseInteriorBanner(msg, view) {
    const banner = document.getElementById('world-settlement-mobile-base-banner');
    if (!banner) { return; }
    const interior = getMobileBaseInterior(msg);
    // Banner only while the selected source is Mobile Base and snapshot IDs match.
    const mbSelected = typeof isMobileBaseRenderSourceSelected === 'function'
        ? isMobileBaseRenderSourceSelected(msg)
        : false;
    const show = Boolean(
        mbSelected
        && interior
        && interior.hasCanvas
        && view
        && view.settlementId === interior.settlementId
    );
    if (!show) {
        banner.classList.add('hidden');
        banner.textContent = '';
        return;
    }
    const vars = { vehicle: interior.vehicleName, mode: mobileBaseVisualKind(interior) };
    banner.textContent = typeof T === 'function'
        ? T('webview.mobileBase.interiorBanner', vars)
        : `Mobile base interior — ${interior.vehicleName} (${interior.mode})`;
    banner.classList.remove('hidden');
}

function tSettlementFocus(key, vars) {
    if (typeof T === 'function') {
        const translated = T(key, vars);
        if (translated && translated !== key) { return translated; }
    }
    return key;
}

function wireSettlementFocusReturnButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn || btn.dataset.focusReturnWired === '1') { return; }
    btn.dataset.focusReturnWired = '1';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof vscode !== 'undefined' && vscode.postMessage) {
            vscode.postMessage({ type: 'clearWorldSettlementFocus' });
        }
    });
}

/**
 * SLICE2: compact preview/current context banner for Settlement and Diorama panels.
 * Does not imply travel. Empty/invalid copy is localized and bounded.
 */
function renderSettlementFocusBanner(msg, options) {
    const prefix = options && options.prefix === 'diorama' ? 'diorama' : 'settlement';
    const banner = document.getElementById(`world-${prefix}-focus-banner`);
    const previewLine = document.getElementById(`world-${prefix}-focus-preview-line`);
    const currentLine = document.getElementById(`world-${prefix}-focus-current-line`);
    const returnBtn = document.getElementById(`world-${prefix}-focus-return-btn`);
    if (!banner || !previewLine || !currentLine) { return; }
    wireSettlementFocusReturnButton(`world-${prefix}-focus-return-btn`);

    const ctx = msg && msg.settlementDisplayContext;
    const isPreview = ctx && ctx.mode === 'preview';
    if (!isPreview) {
        banner.classList.add('hidden');
        previewLine.textContent = '';
        currentLine.textContent = '';
        return;
    }

    const displayName = ctx.displayLocationName || ctx.displayLocationId || '';
    const currentName = ctx.currentLocationName || ctx.currentLocationId || '';
    previewLine.textContent = tSettlementFocus('webview.world.settlementFocusPreview', { location: displayName });
    currentLine.textContent = tSettlementFocus('webview.world.settlementFocusCurrent', { location: currentName });
    if (returnBtn) {
        returnBtn.textContent = tSettlementFocus('webview.world.settlementFocusReturn');
    }
    banner.classList.remove('hidden');
}

function settlementEmptyCopyForContext(msg) {
    const ctx = msg && msg.settlementDisplayContext;
    const name = (ctx && (ctx.displayLocationName || ctx.displayLocationId)) || '';
    if (ctx && ctx.mode === 'preview') {
        if (ctx.availability === 'invalid') {
            return tSettlementFocus('webview.world.settlementFocusInvalidLocation', { location: name });
        }
        return tSettlementFocus('webview.world.settlementFocusMissingLocation', { location: name });
    }
    if (ctx && ctx.availability === 'invalid' && name) {
        return tSettlementFocus('webview.world.settlementFocusInvalidLocation', { location: name });
    }
    if (name) {
        return tSettlementFocus('webview.world.settlementFocusMissingLocation', { location: name });
    }
    return tSettlementFocus('webview.world.settlementFocusMissingHere');
}

function settlementExpandProfileLabel(profile) {
    const key = SETTLEMENT_EXPAND_PROFILE_I18N_KEY[profile];
    const translated = key && typeof T === 'function' ? T(key) : '';
    return translated && translated !== key ? translated : (SETTLEMENT_EXPAND_PROFILE_FALLBACK[profile] || profile);
}

function buildSettlementExpandRequestText(layerId, profile) {
    const reasonKey = 'webview.world.settlementExpandReasonDefault';
    const reason = typeof T === 'function'
        ? T(reasonKey, { profile: settlementExpandProfileLabel(profile) })
        : `Player requested ${profile} expansion from Settlement view.`;
    const textKey = 'webview.world.settlementExpandRequestText';
    const vars = { layerId, profile, reason };
    if (typeof T === 'function') {
        const translated = T(textKey, vars);
        if (translated !== textKey) { return translated; }
    }
    return `[Settlement expansion request]\nPlease consider emitting turn_result.settlementOps.expand_layer for this settlement.\nlayerId: ${layerId}\nprofile: ${profile}\nreason: ${reason}\nDo not add layers beyond z1/z0/z-1/z-2.`;
}

// Cosmetic fallback only (mirrors settlementViewCore.ts LAYER_LABELS) for the
// rare case a layer is missing from view.layers entirely (never built yet),
// so the expand-panel heading reads as a name instead of a raw layer id.
const SETTLEMENT_LAYER_NAME_FALLBACK = {
    z1: 'Upper deck',
    z0: 'Ground',
    'z-1': 'Cellar',
    'z-2': 'Deep ruins',
};

function settlementLayerDisplayLabel(view, layerId) {
    const layers = Array.isArray(view?.layers) ? view.layers : [];
    const found = layers.find((l) => l.id === layerId);
    return found?.label || SETTLEMENT_LAYER_NAME_FALLBACK[layerId] || layerId;
}

function renderSettlementExpandPanel(view, msg) {
    const panel = document.getElementById('world-settlement-expand-panel');
    const buttonsEl = document.getElementById('world-settlement-expand-buttons');
    const layerLabelEl = document.getElementById('world-settlement-expand-layer-label');
    if (!panel || !buttonsEl) { return; }

    const enabled = Boolean(msg && (msg.enableSettlementMode === true || getMobileBaseInterior(msg)));
    const previews = enabled ? getSettlementExpansionPreviews() : [];
    const layerId = view ? view.layerId : null;
    const forLayer = layerId ? previews.filter((p) => p && p.layerId === layerId) : [];

    if (!enabled || !view || !forLayer.length) {
        panel.classList.add('hidden');
        buttonsEl.innerHTML = '';
        if (layerLabelEl) { layerLabelEl.textContent = ''; }
        _settlementExpandHoverPreview = null;
        return;
    }

    if (layerId !== _lastSettlementExpandLayerId) {
        _lastSettlementExpandLayerId = layerId;
        _settlementExpandHoverPreview = forLayer[0];
    } else if (_settlementExpandHoverPreview && !forLayer.some((p) => p.profile === _settlementExpandHoverPreview.profile)) {
        _settlementExpandHoverPreview = forLayer[0];
    }

    if (layerLabelEl) {
        const layerLabel = settlementLayerDisplayLabel(view, layerId);
        layerLabelEl.textContent = typeof T === 'function'
            ? T('webview.world.settlementExpandForLayer', { layer: layerLabel })
            : `Preview options for ${layerLabel}`;
    }

    const activeProfile = _settlementExpandHoverPreview ? _settlementExpandHoverPreview.profile : null;
    buttonsEl.innerHTML = forLayer.map((preview) => {
        const isActive = preview.profile === activeProfile;
        const cls = isActive ? 'world-settlement-expand-btn is-active' : 'world-settlement-expand-btn';
        return `<button type="button" class="${cls}" aria-pressed="${isActive ? 'true' : 'false'}" data-expand-layer="${escapeSettlementHtml(preview.layerId)}" data-expand-profile="${escapeSettlementHtml(preview.profile)}">${escapeSettlementHtml(settlementExpandProfileLabel(preview.profile))}</button>`;
    }).join('');
    panel.classList.remove('hidden');

    buttonsEl.querySelectorAll('.world-settlement-expand-btn').forEach((btn) => {
        const profile = btn.getAttribute('data-expand-profile');
        const preview = forLayer.find((p) => p.profile === profile);
        if (!preview) { return; }
        const showGhost = () => {
            _settlementExpandHoverPreview = preview;
            drawSettlementIsometric();
        };
        btn.addEventListener('mouseenter', showGhost);
        btn.addEventListener('focus', showGhost);
        btn.addEventListener('click', () => {
            if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                    type: 'insertChatText',
                    text: buildSettlementExpandRequestText(preview.layerId, preview.profile),
                });
            }
        });
    });
}

function drawSettlementGhostPreview(ctx, view, originX, originY) {
    const preview = _settlementExpandHoverPreview;
    if (!preview || !view || preview.layerId !== view.layerId) { return; }

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([4, 3]);
    const tiles = Array.isArray(preview.tiles) ? preview.tiles : [];
    for (const tile of tiles) {
        const { sx, sy } = isoProject(tile.x, tile.y, tile.z, originX, originY);
        const colors = SETTLEMENT_TILE_COLORS[tile.code] || SETTLEMENT_TILE_COLORS.unknown;
        drawIsoDiamond(ctx, sx, sy, colors, colors.glyph, SETTLEMENT_GHOST_STROKE);
    }
    ctx.setLineDash([]);
    const markers = Array.isArray(preview.markers) ? preview.markers : [];
    for (const marker of markers) {
        const { sx, sy } = isoProject(marker.x, marker.y, marker.z, originX, originY);
        drawIsoMarker(ctx, sx, sy, marker.kind);
    }
    ctx.restore();
}

function isoProject(x, y, z, originX, originY) {
    return {
        sx: originX + (x - y) * (SETTLEMENT_TILE_W / 2),
        sy: originY + (x + y) * (SETTLEMENT_TILE_H / 2) - z * SETTLEMENT_LAYER_HEIGHT,
    };
}

// Below this zoom level, glyph text is skipped: on a large settlement zoomed
// out to fit, 200+ tiny fillText() calls cost more than they read, and the
// letters are illegible at that scale anyway.
const SETTLEMENT_GLYPH_ZOOM_THRESHOLD = 0.65;

function drawIsoDiamond(ctx, sx, sy, colors, glyph, strokeOverride) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh);
    ctx.lineTo(sx + hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx - hw, sy);
    ctx.closePath();
    ctx.fillStyle = colors.top;
    ctx.fill();
    ctx.strokeStyle = strokeOverride ? strokeOverride.color : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = strokeOverride ? strokeOverride.width : 1;
    ctx.stroke();
    if (glyph && glyph !== ' ' && _settlementZoom >= SETTLEMENT_GLYPH_ZOOM_THRESHOLD) {
        ctx.font = '600 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,12,20,0.9)';
        ctx.fillText(glyph, sx, sy + 1);
    }
}

/**
 * Extruded isometric block: side faces from the flat base at `sy` up to the
 * top face at `sy - elev`, then the lit top diamond with a sun-side edge
 * highlight. `sy` stays the logical (hit-test / marker) position.
 *
 * `timeOfDay` darkens the side faces (SETTLEMENT_TIME_SHADE_FACTOR) and tints
 * the rim light (SETTLEMENT_TIME_PALETTE[...].rim) so the manual day/dusk/
 * night toggle reads as a real lighting change, not just a background swap.
 */
function drawIsoBlock(ctx, sx, sy, colors, glyph, elev, timeOfDay) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    const topY = sy - elev;
    const shade = SETTLEMENT_TIME_SHADE_FACTOR[timeOfDay] ?? 1;
    const rimColor = (SETTLEMENT_TIME_PALETTE[timeOfDay] || SETTLEMENT_TIME_PALETTE.day).rim;

    if (elev > 0) {
        // Left face (in shade)
        ctx.beginPath();
        ctx.moveTo(sx - hw, topY);
        ctx.lineTo(sx, topY + hh);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx - hw, sy);
        ctx.closePath();
        ctx.fillStyle = darkenHexColor(colors.left, shade);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.30)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Right face (half light)
        ctx.beginPath();
        ctx.moveTo(sx + hw, topY);
        ctx.lineTo(sx, topY + hh);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx + hw, sy);
        ctx.closePath();
        ctx.fillStyle = darkenHexColor(colors.right, shade);
        ctx.fill();
        ctx.stroke();

        // Ambient-occlusion line where the block meets the ground
        ctx.beginPath();
        ctx.moveTo(sx - hw, sy);
        ctx.lineTo(sx, sy + hh);
        ctx.lineTo(sx + hw, sy);
        ctx.strokeStyle = 'rgba(0,0,0,0.40)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    // Top face
    ctx.beginPath();
    ctx.moveTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx - hw, topY);
    ctx.closePath();
    ctx.fillStyle = darkenHexColor(colors.top, Math.min(1, shade + 0.15));
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Sun/moon-side rim light on the two upper edges of the top face
    ctx.beginPath();
    ctx.moveTo(sx - hw, topY);
    ctx.lineTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    if (glyph && glyph !== ' ' && _settlementZoom >= SETTLEMENT_GLYPH_ZOOM_THRESHOLD) {
        ctx.font = '600 10px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(8,12,20,0.9)';
        ctx.fillText(glyph, sx, topY + 1);
    }
}

function drawMobileBaseFootprintCell(ctx, sx, sy, visualKind, timeOfDay) {
    const colors = SETTLEMENT_MOBILE_BASE_FOOTPRINT_COLORS[visualKind]
        || SETTLEMENT_MOBILE_BASE_FOOTPRINT_COLORS['mobile-base'];
    ctx.save();
    ctx.globalAlpha = 0.82;
    drawIsoBlock(ctx, sx, sy, colors, '', 2, timeOfDay);
    ctx.restore();
}

/** Water reads better flat and glossy: translucent fill + two ripple highlights. */
function drawIsoWater(ctx, sx, sy, colors, timeOfDay) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    const shade = SETTLEMENT_TIME_SHADE_FACTOR[timeOfDay] ?? 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - hh);
    ctx.lineTo(sx + hw, sy);
    ctx.lineTo(sx, sy + hh);
    ctx.lineTo(sx - hw, sy);
    ctx.closePath();
    ctx.fillStyle = darkenHexColor(colors.top, shade);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,240,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.45, sy - hh * 0.15);
    ctx.quadraticCurveTo(sx - hw * 0.1, sy - hh * 0.45, sx + hw * 0.3, sy - hh * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sx - hw * 0.25, sy + hh * 0.3);
    ctx.quadraticCurveTo(sx + hw * 0.15, sy + hh * 0.05, sx + hw * 0.45, sy + hh * 0.25);
    ctx.stroke();
}

/** Accent outline on the (possibly elevated) top face for hover / selection. */
function drawIsoHighlight(ctx, sx, sy, elev, color, width) {
    const hw = SETTLEMENT_TILE_W / 2;
    const hh = SETTLEMENT_TILE_H / 2;
    const topY = sy - (elev || 0);
    ctx.beginPath();
    ctx.moveTo(sx, topY - hh);
    ctx.lineTo(sx + hw, topY);
    ctx.lineTo(sx, topY + hh);
    ctx.lineTo(sx - hw, topY);
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

/** Bright, high-contrast dashed outline so the ghost preview reads clearly against any tile color. */
const SETTLEMENT_GHOST_STROKE = { color: 'rgba(255,255,255,0.9)', width: 1.5 };

function drawIsoMarker(ctx, sx, sy, kind) {
    const color = SETTLEMENT_MARKER_COLORS[kind] || '#b8c4d0';
    const glyph = SETTLEMENT_MARKER_GLYPHS[kind] || '+';
    const bubbleY = sy - SETTLEMENT_TILE_H;

    // Grounding: soft contact shadow + stem from the tile up to the bubble
    ctx.beginPath();
    ctx.ellipse(sx, sy, 5, 2.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx, sy - 1);
    ctx.lineTo(sx, bubbleY + 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Player marker gets a halo so "you are here" pops like a DF cursor
    if (kind === 'player') {
        ctx.beginPath();
        ctx.arc(sx, bubbleY, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,215,95,0.22)';
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sx, bubbleY, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,12,20,0.85)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = '600 9px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(glyph, sx, bubbleY + 1);
}

/** Atmospheric canvas backdrop: vertical sky gradient + soft glow behind the settlement + vignette. */
function drawSettlementBackdrop(ctx, cssWidth, cssHeight, pivotX, pivotY, timeOfDay) {
    const palette = SETTLEMENT_TIME_PALETTE[timeOfDay] || SETTLEMENT_TIME_PALETTE.day;
    const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
    sky.addColorStop(0, palette.sky[0]);
    sky.addColorStop(0.6, palette.sky[1]);
    sky.addColorStop(1, palette.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowR = Math.max(cssWidth, cssHeight) * 0.55;
    const glow = ctx.createRadialGradient(pivotX, pivotY, 0, pivotX, pivotY, glowR);
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
}

function drawSettlementVignette(ctx, cssWidth, cssHeight, timeOfDay) {
    const palette = SETTLEMENT_TIME_PALETTE[timeOfDay] || SETTLEMENT_TIME_PALETTE.day;
    const r = Math.max(cssWidth, cssHeight);
    const v = ctx.createRadialGradient(
        cssWidth / 2, cssHeight / 2, r * 0.45,
        cssWidth / 2, cssHeight / 2, r * 0.85
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, palette.vignette);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
}

/**
 * SETTLEMENT-2D-FRAMING-001: origin is the absolute iso origin (stored in pan).
 * Pivot is the projected content center so zoom scales the settlement in place.
 */
function computeSettlementOrigin(canvas, view) {
    const cssWidth = canvas.clientWidth || 0;
    const cssHeight = canvas.clientHeight || 0;
    const contentBounds = (typeof computeSettlementProjectedContentBounds === 'function')
        ? computeSettlementProjectedContentBounds(view)
        : null;
    const originX = _settlementPan.x;
    const originY = _settlementPan.y;
    let boundsW = 1;
    let boundsH = 1;
    let pivotX = cssWidth / 2;
    let pivotY = cssHeight / 2;
    if (contentBounds) {
        boundsW = contentBounds.width;
        boundsH = contentBounds.height;
        pivotX = originX + contentBounds.centerX;
        pivotY = originY + contentBounds.centerY;
    }
    return {
        originX,
        originY,
        boundsW,
        boundsH,
        cssWidth,
        cssHeight,
        contentBounds,
        pivotX,
        pivotY,
    };
}

/** Shared fit using actual projected tile/marker bounds (not declared width/height). */
function applySettlementFitTransform(view, canvas) {
    if (!view || !canvas) { return false; }
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) {
        _settlementPendingFit = true;
        return false;
    }
    if (typeof computeSettlementFitTransform !== 'function') { return false; }
    const fit = computeSettlementFitTransform(
        view,
        { width: cw, height: ch },
        {
            padding: SETTLEMENT_FIT_PADDING,
            zoomMin: SETTLEMENT_ZOOM_MIN,
            zoomMax: SETTLEMENT_ZOOM_MAX,
        }
    );
    if (!fit) { return false; }
    _settlementZoom = fit.zoom;
    _settlementPan = { x: fit.pan.x, y: fit.pan.y };
    _settlementPendingFit = false;
    return true;
}

/**
 * Strict visibility for retained transforms: no edge clipping + min padding.
 * Weaker "partially on screen" is NOT enough to skip auto-fit.
 */
function settlementTransformIsVisible(view, canvas) {
    if (typeof isSettlementTransformMeaningfullyVisible !== 'function') { return true; }
    const cw = canvas && canvas.clientWidth;
    const ch = canvas && canvas.clientHeight;
    if (!cw || !ch) { return false; }
    const result = isSettlementTransformMeaningfullyVisible(
        view,
        { width: cw, height: ch },
        _settlementPan,
        _settlementZoom,
        { minPadding: SETTLEMENT_PREFS_MIN_PAD, requireSymmetric: false }
    );
    return Boolean(result && result.ok);
}

/**
 * Load stored transform if valid; otherwise auto-fit.
 * When forceFit is true (new settlement/source/layer), always fit unless a
 * strictly valid stored transform was already applied.
 * @returns {'loaded'|'fitted'|'pending'|'empty'}
 */
function ensureSettlementFraming(view, canvas, options) {
    const forceFit = Boolean(options && options.forceFit);
    if (!view) { return 'empty'; }
    if (!canvas || !canvas.clientWidth) {
        _settlementPendingFit = true;
        return 'pending';
    }
    // Keep a valid user/stored transform only when not forcing a fresh layout.
    if (!forceFit && settlementTransformIsVisible(view, canvas)) {
        _settlementPendingFit = false;
        return 'loaded';
    }
    // After settlement change we load prefs first; keep them only if well-framed.
    if (forceFit && settlementTransformIsVisible(view, canvas)) {
        _settlementPendingFit = false;
        return 'loaded';
    }
    if (applySettlementFitTransform(view, canvas)) {
        return 'fitted';
    }
    return 'pending';
}

function fitSettlementViewToCanvas() {
    const view = getSettlementSnapshot();
    const visualView = buildSettlementVisualView(_settlementWorldMsg, view);
    const canvas = document.getElementById('world-settlement-canvas');
    if (!applySettlementFitTransform(visualView, canvas)) { return; }
    const settlementId = view.settlementId;
    if (settlementId) { saveSettlementViewPrefs(settlementId); }
    drawSettlementIsometric();
}

function settlementSourceKey(msg, view) {
    const sid = view && view.settlementId ? view.settlementId : '';
    let source = 'fixed';
    if (typeof resolveSettlementRenderSource === 'function' && msg) {
        const r = resolveSettlementRenderSource(msg, { forDiorama: false });
        if (r && r.source) { source = r.source; }
    }
    return `${source}:${sid}`;
}

function ensureSettlementResizeObserver(stage) {
    if (!stage || typeof ResizeObserver === 'undefined') { return; }
    if (_settlementResizeObserver) { return; }
    _settlementResizeObserver = new ResizeObserver(() => {
        const canvas = document.getElementById('world-settlement-canvas');
        const view = getSettlementSnapshot();
        const visualView = buildSettlementVisualView(_settlementWorldMsg, view);
        if (!canvas || !view) { return; }
        const w = stage.clientWidth;
        const h = stage.clientHeight || canvas.clientHeight;
        const prev = _settlementLastCssSize;
        const grewFromZero = (prev.w === 0 || prev.h === 0) && w > 0 && h > 0;
        const changed = Math.abs(w - prev.w) > 8 || Math.abs(h - prev.h) > 8;
        _settlementLastCssSize = { w, h };
        if (grewFromZero || _settlementPendingFit) {
            ensureSettlementFraming(visualView, canvas);
            drawSettlementIsometric();
            return;
        }
        if (!changed || _settlementUserPanActive) { return; }
        // Significant resize: recover only when content left the usable area.
        if (!settlementTransformIsVisible(visualView, canvas)) {
            ensureSettlementFraming(visualView, canvas);
        }
        drawSettlementIsometric();
    });
    _settlementResizeObserver.observe(stage);
}

function hideSettlementTooltip() {
    const el = document.getElementById('world-settlement-tooltip');
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

function showSettlementTooltip(hit, clientX, clientY) {
    const el = document.getElementById('world-settlement-tooltip');
    const stage = document.getElementById('world-settlement-stage');
    if (!el || !stage || !hit) { return; }
    const parts = [hit.label || ''];
    if (hit.detail) { parts.push(hit.detail); }
    el.textContent = parts.filter(Boolean).join(' · ');
    el.classList.remove('hidden');
    const rect = stage.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left + 8, 4), rect.width - 4);
    const top = Math.min(Math.max(clientY - rect.top - 28, 4), rect.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function renderSettlementDetailPanel(hit) {
    const panel = document.getElementById('world-settlement-detail');
    if (!panel) { return; }
    if (!hit) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    const title = hit.kind
        ? `${hit.kind}: ${hit.label || ''}`
        : (hit.label || 'Tile');
    const detail = hit.detail ? `<p class="world-settlement-detail-body">${escapeSettlementHtml(hit.detail)}</p>` : '';
    panel.innerHTML = `<h4>${escapeSettlementHtml(title)}</h4>${detail}`;
    panel.classList.remove('hidden');
}

function updateSettlementLayerNote(view) {
    const note = document.getElementById('world-settlement-layer-note');
    if (!note) { return; }
    const expandPanel = document.getElementById('world-settlement-expand-panel');
    const expandShown = Boolean(expandPanel && !expandPanel.classList.contains('hidden'));
    const tiles = Array.isArray(view?.tiles) ? view.tiles : [];
    const markers = Array.isArray(view?.markers) ? view.markers : [];
    const isEmpty = !expandShown && tiles.length === 0 && markers.length === 0;
    note.classList.toggle('hidden', !isEmpty);
    if (isEmpty) {
        note.textContent = typeof T === 'function'
            ? T('webview.world.settlementLayerEmpty')
            : 'This layer has no tiles or markers yet.';
    }
}

function escapeSettlementHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderSettlementMarkerFallback(view) {
    const list = document.getElementById('world-settlement-marker-fallback');
    if (!list) { return; }
    const markers = Array.isArray(view.markers) ? view.markers : [];
    if (!markers.length) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
    }
    const items = markers.slice(0, 40).map((m) => {
        const detail = m.detail ? ` — ${escapeSettlementHtml(m.detail)}` : '';
        return `<li><button type="button" class="world-settlement-marker-item" data-marker-id="${escapeSettlementHtml(m.id)}">${escapeSettlementHtml(m.kind)}: ${escapeSettlementHtml(m.label)}${detail}</button></li>`;
    }).join('');
    list.innerHTML = `<span class="world-settlement-marker-fallback-title">${typeof T === 'function' ? T('webview.world.settlementMarkers') : 'Markers'}</span><ul>${items}</ul>`;
    list.classList.remove('hidden');
    list.querySelectorAll('.world-settlement-marker-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-marker-id');
            const marker = markers.find((m) => m.id === id);
            if (marker) {
                _settlementSelected = { type: 'marker', id: marker.id, label: marker.label, detail: marker.detail, kind: marker.kind };
                renderSettlementDetailPanel(_settlementSelected);
            }
        });
    });
}

function hitTestSettlement(clientX, clientY, canvas) {
    if (!canvas || !_settlementHits.length) { return null; }
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const view = getSettlementSnapshot();
    const visualView = buildSettlementVisualView(_settlementWorldMsg, view);
    if (!view || typeof screenToSettlementContent !== 'function'
        || typeof hitTestSettlementContent !== 'function') { return null; }
    const origin = computeSettlementOrigin(canvas, visualView);
    const bounds = origin.contentBounds;
    if (!bounds) { return null; }
    const contentPoint = screenToSettlementContent(
        screenX,
        screenY,
        origin.originX,
        origin.originY,
        _settlementZoom,
        bounds.centerX,
        bounds.centerY
    );
    return hitTestSettlementContent(
        _settlementHits,
        contentPoint,
        SETTLEMENT_HIT_RADIUS_PX,
        _settlementZoom
    );
}

function syncSettlementLayerButtons(view) {
    const layerId = view?.layerId || 'z0';
    const layers = Array.isArray(view?.layers) ? view.layers : [];
    const layerById = new Map(layers.map((l) => [l.id, l]));
    if (view && !layerById.has(layerId)) { layerById.set(layerId, { id: layerId, label: '' }); }
    const mobileBase = isMobileBaseVisualSource(_settlementWorldMsg, view);
    const interior = mobileBase ? getMobileBaseInterior(_settlementWorldMsg) : null;
    const unbuiltTitle = typeof T === 'function'
        ? T('webview.world.settlementLayerUnbuilt')
        : 'Not built yet — select to preview expansion options';
    document.querySelectorAll('[data-settlement-layer]').forEach((btn) => {
        const layer = btn.getAttribute('data-settlement-layer');
        if (!btn.dataset.defaultLabel) { btn.dataset.defaultLabel = btn.textContent; }
        const known = layerById.get(layer);
        if (mobileBase) {
            btn.hidden = !known;
            btn.classList.remove('is-missing');
            if (known) {
                const semanticLabel = mobileBaseLayerSemanticLabel(interior, layer, known);
                btn.textContent = semanticLabel;
                btn.title = semanticLabel;
            }
        } else {
            btn.hidden = false;
            btn.textContent = btn.dataset.defaultLabel;
        }
        btn.classList.toggle('is-active', layer === layerId);
        btn.setAttribute('aria-pressed', layer === layerId ? 'true' : 'false');
        const missing = layers.length > 0 && !known;
        if (!mobileBase) {
            btn.classList.toggle('is-missing', missing);
            btn.title = missing ? unbuiltTitle : (known?.label || '');
        }
    });
}

function drawSettlementIsometric() {
    const canvas = document.getElementById('world-settlement-canvas');
    const empty = document.getElementById('world-settlement-empty');
    const stage = document.getElementById('world-settlement-stage');
    if (!canvas || !stage) { return; }

    const msg = _settlementWorldMsg;
    const view = getSettlementSnapshot();
    const visualView = buildSettlementVisualView(msg, view);
    if (typeof renderSettlementSourceSelector === 'function') {
        renderSettlementSourceSelector(msg);
    }
    renderSettlementFocusBanner(msg, { prefix: 'settlement' });
    if (empty) {
        const showEmpty = !view;
        empty.classList.toggle('hidden', !showEmpty);
        if (showEmpty) {
            empty.textContent = settlementEmptyCopyForContext(msg);
        }
    }
    stage.classList.toggle('hidden', !view);
    const mobileBase = isMobileBaseVisualSource(msg, view);
    stage.classList.toggle('is-mobile-base', mobileBase);
    if (mobileBase) {
        stage.dataset.mobileBaseMode = mobileBaseVisualKind(getMobileBaseInterior(msg));
    } else {
        delete stage.dataset.mobileBaseMode;
    }
    renderMobileBaseInteriorBanner(msg, view);
    if (!view) {
        hideSettlementTooltip();
        renderSettlementDetailPanel(null);
        const list = document.getElementById('world-settlement-marker-fallback');
        if (list) {
            list.innerHTML = '';
            list.classList.add('hidden');
        }
        renderSettlementExpandPanel(null, msg);
        const note = document.getElementById('world-settlement-layer-note');
        if (note) { note.classList.add('hidden'); }
        return;
    }

    ensureSettlementResizeObserver(stage);

    const sourceKey = settlementSourceKey(msg, view);
    const settlementChanged = view.settlementId !== _lastSettlementId;
    const sourceChanged = sourceKey !== _lastSettlementSourceKey;
    const layerChanged = view.layerId !== _lastSettlementLayerId;

    if (settlementChanged || sourceChanged) {
        _lastSettlementId = view.settlementId;
        _lastSettlementSourceKey = sourceKey;
        _lastSettlementLayerId = view.layerId;
        resetSettlementViewTransform();
        loadSettlementViewPrefs(view.settlementId);
        loadSettlementTimeOfDay(view.settlementId);
        syncSettlementTimeToggleButton();
        _settlementSelected = null;
        _settlementExpandHoverPreview = null;
        _lastSettlementExpandLayerId = null;
        // Framing applied after canvas size is known (below).
        _settlementPendingFit = true;
    } else if (layerChanged) {
        // Active layer content bounds change — refit to the new layer.
        _lastSettlementLayerId = view.layerId;
        _settlementPendingFit = true;
    }

    syncSettlementLayerButtons(view);
    renderSettlementMarkerFallback(view);
    renderSettlementExpandPanel(view, msg);
    updateSettlementLayerNote(view);

    const panelWidth = stage.clientWidth;
    if (!panelWidth) {
        _settlementPendingFit = true;
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = stage.clientWidth;
    const cssHeight = Math.max(180, Math.min(420, cssWidth * 0.72));
    stage.style.minHeight = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    // Match clientHeight to the CSS height we just set so fit math sees nonzero height.
    // (clientHeight may lag one frame; use cssHeight explicitly via style.)
    _settlementLastCssSize = { w: cssWidth, h: cssHeight };

    // CENTERING-002: force fit after settlement/source/layer change (pendingFit).
    // Ordinary refresh keeps a strictly valid user transform.
    if (_settlementPendingFit) {
        ensureSettlementFraming(visualView, canvas, { forceFit: true });
    } else if (!settlementTransformIsVisible(visualView, canvas)) {
        ensureSettlementFraming(visualView, canvas, { forceFit: false });
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const origin = computeSettlementOrigin(canvas, visualView);
    const { originX, originY, pivotX, pivotY } = origin;
    const zoom = _settlementZoom;

    drawSettlementBackdrop(ctx, cssWidth, cssHeight, pivotX, pivotY, _settlementTimeOfDay);

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.scale(zoom, zoom);
    ctx.translate(-pivotX, -pivotY);

    _settlementHits = [];
    const tiles = Array.isArray(visualView?.tiles) ? [...visualView.tiles] : [];
    // Painter's order for extruded blocks: back-to-front by (x+y), then lower
    // z first so raised sub-layers stack correctly.
    tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y) || (a.z || 0) - (b.z || 0) || a.x - b.x);

    for (const tile of tiles) {
        const { sx, sy } = isoProject(tile.x, tile.y, tile.z, originX, originY);
        if (tile.decorative === true) {
            drawMobileBaseFootprintCell(ctx, sx, sy, tile.visualKind, _settlementTimeOfDay);
            continue;
        }
        const colors = SETTLEMENT_TILE_COLORS[tile.code] || SETTLEMENT_TILE_COLORS.unknown;
        const elev = SETTLEMENT_TILE_ELEVATION[tile.code] ?? 4;
        if (tile.code === 'water') {
            drawIsoWater(ctx, sx, sy, colors, _settlementTimeOfDay);
        } else {
            drawIsoBlock(ctx, sx, sy, colors, colors.glyph, elev, _settlementTimeOfDay);
        }
        _settlementHits.push({
            type: 'tile',
            key: settlementHitKey({ type: 'tile', x: tile.x, y: tile.y, z: tile.z || 0, code: tile.code }),
            x: tile.x,
            y: tile.y,
            z: tile.z || 0,
            px: sx,
            py: sy,
            contentX: sx - originX,
            contentY: sy - originY - elev,
            elev,
            label: tile.label,
            detail: tile.code,
            code: tile.code,
        });
    }

    // Draw and hit-test at the same visual coordinates used for fitting/framing
    // (visualView.markers). The authoritative view.markers array (read by the
    // marker-fallback list and layer-empty check above) is never touched.
    const markers = Array.isArray(visualView?.markers) ? visualView.markers : [];
    for (const marker of markers) {
        const { sx, sy } = isoProject(marker.x, marker.y, marker.z, originX, originY);
        drawIsoMarker(ctx, sx, sy, marker.kind);
        _settlementHits.push({
            type: 'marker',
            key: settlementHitKey({ type: 'marker', id: marker.id }),
            id: marker.id,
            kind: marker.kind,
            px: sx,
            py: sy - SETTLEMENT_TILE_H,
            contentX: sx - originX,
            contentY: sy - originY - SETTLEMENT_TILE_H,
            elev: 0,
            label: marker.label,
            detail: marker.detail,
        });
    }

    drawSettlementGhostPreview(ctx, view, originX, originY);

    // Hover / selection outlines on top of everything (accent + gold)
    if (_settlementHover && _settlementHover.type === 'tile') {
        drawIsoHighlight(ctx, _settlementHover.px, _settlementHover.py, _settlementHover.elev, 'rgba(139,183,255,0.9)', 1.5);
    }
    const selectedHit = _settlementSelected
        ? _settlementHits.find((h) => (
            h.type === _settlementSelected.type
            && settlementHitKey(h) === settlementHitKey(_settlementSelected)
        ))
        : null;
    if (selectedHit && selectedHit.type === 'tile') {
        drawIsoHighlight(ctx, selectedHit.px, selectedHit.py, selectedHit.elev, 'rgba(255,215,95,0.95)', 2);
    } else if (selectedHit && selectedHit.type === 'marker') {
        ctx.beginPath();
        ctx.arc(selectedHit.px, selectedHit.py, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,215,95,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.restore();

    drawSettlementVignette(ctx, cssWidth, cssHeight, _settlementTimeOfDay);

    if (_settlementSelected) {
        const still = _settlementHits.find((h) => (
            h.type === _settlementSelected.type
            && settlementHitKey(h) === settlementHitKey(_settlementSelected)
        ));
        if (!still) {
            _settlementSelected = null;
            renderSettlementDetailPanel(null);
        }
    }
}

function initSettlementIsometricControls() {
    if (_settlementControlsReady) { return; }
    _settlementControlsReady = true;

    const canvas = document.getElementById('world-settlement-canvas');
    const stage = document.getElementById('world-settlement-stage');
    if (!canvas || !stage) { return; }

    document.querySelectorAll('[data-settlement-layer]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const layerId = btn.getAttribute('data-settlement-layer');
            if (layerId && typeof vscode !== 'undefined') {
                vscode.postMessage({ type: 'setSettlementViewLayer', layerId });
            }
        });
    });

    const zoomIn = document.getElementById('world-settlement-zoom-in');
    const zoomOut = document.getElementById('world-settlement-zoom-out');
    const zoomReset = document.getElementById('world-settlement-zoom-reset');
    const zoomFit = document.getElementById('world-settlement-zoom-fit');
    const timeToggle = document.getElementById('world-settlement-time-toggle');

    if (timeToggle) {
        syncSettlementTimeToggleButton();
        timeToggle.addEventListener('click', () => {
            const idx = SETTLEMENT_TIME_OF_DAY_ORDER.indexOf(_settlementTimeOfDay);
            _settlementTimeOfDay = SETTLEMENT_TIME_OF_DAY_ORDER[(idx + 1) % SETTLEMENT_TIME_OF_DAY_ORDER.length];
            syncSettlementTimeToggleButton();
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementTimeOfDay(view.settlementId); }
            drawSettlementIsometric();
        });
    }

    if (zoomIn) {
        zoomIn.addEventListener('click', () => {
            _settlementZoom = Math.min(SETTLEMENT_ZOOM_MAX, _settlementZoom + SETTLEMENT_ZOOM_STEP);
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', () => {
            _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, _settlementZoom - SETTLEMENT_ZOOM_STEP);
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomReset) {
        zoomReset.addEventListener('click', () => {
            resetSettlementViewTransform();
            const view = getSettlementSnapshot();
            if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
            drawSettlementIsometric();
        });
    }
    if (zoomFit) {
        zoomFit.addEventListener('click', () => {
            fitSettlementViewToCanvas();
            drawSettlementIsometric();
        });
    }

    canvas.addEventListener('mousedown', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        _settlementDidDrag = false;
        _settlementDrag = { x: e.clientX, y: e.clientY, panX: _settlementPan.x, panY: _settlementPan.y };
    });
    window.addEventListener('mousemove', (e) => {
        if (!_settlementDrag) { return; }
        if (Math.hypot(e.clientX - _settlementDrag.x, e.clientY - _settlementDrag.y) > 4) {
            _settlementDidDrag = true;
        }
        _settlementPan = {
            x: _settlementDrag.panX + (e.clientX - _settlementDrag.x),
            y: _settlementDrag.panY + (e.clientY - _settlementDrag.y),
        };
        drawSettlementIsometric();
    });
    window.addEventListener('mouseup', () => {
        if (!_settlementDrag) { return; }
        _settlementDrag = null;
        const view = getSettlementSnapshot();
        if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
    });

    canvas.addEventListener('wheel', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        e.preventDefault();
        const delta = e.deltaY > 0 ? -SETTLEMENT_ZOOM_STEP : SETTLEMENT_ZOOM_STEP;
        _settlementZoom = Math.max(SETTLEMENT_ZOOM_MIN, Math.min(SETTLEMENT_ZOOM_MAX, _settlementZoom + delta));
        const view = getSettlementSnapshot();
        if (view?.settlementId) { saveSettlementViewPrefs(view.settlementId); }
        drawSettlementIsometric();
    }, { passive: false });

    canvas.addEventListener('mousemove', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') {
            hideSettlementTooltip();
            return;
        }
        if (_settlementDrag) { return; }
        const hit = hitTestSettlement(e.clientX, e.clientY, canvas);
        const hoverKey = hit ? settlementHitKey(hit) : null;
        const prevKey = _settlementHover ? settlementHitKey(_settlementHover) : null;
        if (hoverKey !== prevKey) {
            _settlementHover = hit;
            drawSettlementIsometric();
        }
        if (hit) {
            showSettlementTooltip(hit, e.clientX, e.clientY);
        } else {
            hideSettlementTooltip();
        }
    });
    canvas.addEventListener('mouseleave', () => {
        hideSettlementTooltip();
        if (_settlementHover) {
            _settlementHover = null;
            drawSettlementIsometric();
        }
    });

    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        if (_settlementDidDrag) { return; }
        const hit = hitTestSettlement(e.clientX, e.clientY, canvas);
        _settlementSelected = hit;
        renderSettlementDetailPanel(hit);
        drawSettlementIsometric();
    });

    window.addEventListener('resize', () => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'settlement') { return; }
        drawSettlementIsometric();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initSettlementIsometricControls();
});

/* --- 86c-settlement-diorama.js --- */
/* global document, window, vscode, THREE */

// ---------------------------------------------------------------------------
// Settlement low-poly diorama (M5b) — read-only Three.js renderer.
// Consumes ONLY msg.settlementDiorama (M5a SettlementDioramaSnapshot). Never
// reads settlement_state.json / settlement_layout.json / raw settlementView.
// Read-only: no turn ledger writes, no GM chat draft insertion in this pass.
// ---------------------------------------------------------------------------

let _dioramaWorldMsg = null;
let _dioramaControlsReady = false;
let _dioramaAvailable = null; // cached THREE/WebGL capability check
let _dioramaThreeLoadPromise = null;
let _dioramaThree = null; // { renderer, scene, camera, group, hitMeshes: [] }
let _dioramaOrbit = { yaw: 45, pitch: 35, distance: 16 };
let _dioramaTarget = { x: 0, y: 0, z: 0 };
let _dioramaDrag = null;
let _dioramaDidDrag = false;
let _lastDioramaSettlementId = null;
let _lastDioramaLayerId = null;
let _lastDioramaRevision = null;
let _dioramaSelected = null;
let _dioramaResizeQueued = false;

const DIORAMA_MATERIAL_COLOR = {
    stone: 0x8a8a90,
    wood: 0xa8794a,
    metal: 0x8090a8,
    cloth: 0xd8b060,
    water: 0x3a78b0,
    ruins: 0x707070,
    hazard: 0xc04030,
    light: 0xffe27a,
    neutral: 0x6a7280,
};

// Graphics Upgrade Track 2 — per-material PBR finish (metalness/roughness) so blocks/markers
// read as distinct surfaces under the directional light instead of one flat matte color.
// 'light'/'hazard' get a faint emissive glow so residents/incidents read as light sources
// even before the viewer notices the shadow. Display-only; no schema/payload change.
const DIORAMA_MATERIAL_FINISH = {
    stone: { metalness: 0.05, roughness: 0.9 },
    wood: { metalness: 0.0, roughness: 0.85 },
    metal: { metalness: 0.65, roughness: 0.35 },
    cloth: { metalness: 0.0, roughness: 0.95 },
    water: { metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.88 },
    ruins: { metalness: 0.05, roughness: 0.95 },
    hazard: { metalness: 0.0, roughness: 0.7, emissiveIntensity: 0.3 },
    light: { metalness: 0.0, roughness: 0.4, emissiveIntensity: 0.85 },
    neutral: { metalness: 0.05, roughness: 0.8 },
};

// Genre-linked lighting profile, keyed by the diorama snapshot's own `palette.theme`
// (already resolved server-side from the world genre — see `resolveDioramaThemeFromOvermap()`
// in src/settlementDioramaBridge.ts). No payload change: only client-side lighting tuning.
const DIORAMA_THEME_LIGHTING = {
    default: { dirIntensity: 0.75, ambientIntensity: 0.7, elevation: 55, azimuth: 35 },
    fantasy: { dirIntensity: 0.85, ambientIntensity: 0.7, elevation: 50, azimuth: 40 },
    postapoc: { dirIntensity: 0.7, ambientIntensity: 0.6, elevation: 40, azimuth: 30 },
    industrial: { dirIntensity: 0.6, ambientIntensity: 0.55, elevation: 60, azimuth: -20 },
    eastern: { dirIntensity: 0.9, ambientIntensity: 0.65, elevation: 45, azimuth: 55 },
    horror: { dirIntensity: 0.35, ambientIntensity: 0.45, elevation: 20, azimuth: 15 },
    scifi: { dirIntensity: 0.7, ambientIntensity: 0.6, elevation: 65, azimuth: -35 },
};

const DIORAMA_MARKER_SHAPE = {
    resident: 'cone',
    visitor: 'cone',
    merchant: 'cone',
    player: 'cone',
    incident: 'cylinder',
    stock_low: 'cylinder',
    project: 'box',
    structure_note: 'box',
};

const DIORAMA_PITCH_MIN = 8;
const DIORAMA_PITCH_MAX = 82;
const DIORAMA_DRAG_YAW_SENSITIVITY = 0.35;
const DIORAMA_DRAG_PITCH_SENSITIVITY = 0.3;
const DIORAMA_WHEEL_STEP_RATIO = 0.08;
const DIORAMA_HIT_RADIUS_PX = 3; // NDC-space hint only; raycaster does exact hit testing.

function dioramaPrefersReducedMotion() {
    try {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

function detectWebglSupport() {
    try {
        const canvas = document.createElement('canvas');
        const webgl2 = window.WebGL2RenderingContext && canvas.getContext('webgl2');
        const webgl = window.WebGLRenderingContext
            && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        return !!(webgl2 || webgl);
    } catch {
        return false;
    }
}

function resolveThreeScriptUri() {
    if (typeof window !== 'undefined' && window.__LR_THREE_SCRIPT_URI__) {
        return window.__LR_THREE_SCRIPT_URI__;
    }
    return null;
}

function resolveWebviewScriptNonce() {
    if (typeof window !== 'undefined' && window.__LR_SCRIPT_NONCE__) {
        return window.__LR_SCRIPT_NONCE__;
    }
    return null;
}

function reportDioramaLoaderError(message, detail) {
    if (typeof console === 'undefined' || typeof console.error !== 'function') { return; }
    if (detail) {
        console.error(`[LoreRelay Diorama] ${message}`, detail);
    } else {
        console.error(`[LoreRelay Diorama] ${message}`);
    }
}

function isThreeAvailable() {
    if (_dioramaAvailable !== null) { return _dioramaAvailable; }
    const hasThree = typeof THREE !== 'undefined' && typeof THREE.Scene === 'function';
    _dioramaAvailable = hasThree && detectWebglSupport();
    return _dioramaAvailable;
}

/** Lazy-load vendor/three.min.js only when Diorama mode is actually used. */
function loadThreeJsLazy() {
    if (isThreeAvailable()) { return Promise.resolve(true); }
    const uri = resolveThreeScriptUri();
    if (!uri) {
        reportDioramaLoaderError('Packaged Three.js Webview URI is missing.');
        return Promise.resolve(false);
    }
    if (_dioramaThreeLoadPromise) { return _dioramaThreeLoadPromise; }
    _dioramaThreeLoadPromise = new Promise((resolve) => {
        const script = document.createElement('script');
        const nonce = resolveWebviewScriptNonce();
        if (nonce) { script.nonce = nonce; }
        script.src = uri;
        script.async = true;
        script.onload = () => {
            _dioramaAvailable = null;
            const ok = isThreeAvailable();
            if (!ok) {
                reportDioramaLoaderError('Packaged Three.js loaded, but THREE/WebGL is unavailable.', {
                    three: typeof THREE !== 'undefined',
                    webgl: detectWebglSupport(),
                });
            }
            resolve(ok);
        };
        script.onerror = (error) => {
            reportDioramaLoaderError('Failed to load packaged Three.js.', error);
            resolve(false);
        };
        try {
            document.head.appendChild(script);
        } catch (error) {
            reportDioramaLoaderError('Failed to append packaged Three.js script.', error);
            resolve(false);
        }
    });
    return _dioramaThreeLoadPromise;
}

function getMobileBaseInteriorDiorama(msg) {
    if (!msg || msg.enableMobileBaseSystem !== true) { return null; }
    const interior = msg.mobileBaseInterior;
    if (!interior || interior.interiorBlocked) { return null; }
    return interior;
}

function getDioramaSnapshot() {
    const msg = _dioramaWorldMsg;
    // SETTLEMENT-VIEW-SOURCE-001: same logical source as 2D settlement view.
    if (typeof getSelectedSettlementDiorama === 'function') {
        return getSelectedSettlementDiorama(msg);
    }
    return msg && msg.settlementDiorama ? msg.settlementDiorama : null;
}

function escapeDioramaHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Coordinate mapping: snapshot uses (x, y=plane, z=height); Three.js scene is Y-up. ---
function toSceneVec(x, y, z) {
    return new THREE.Vector3(x, z, y);
}

function resolveDioramaMaterialColor(material) {
    return DIORAMA_MATERIAL_COLOR[material] !== undefined
        ? DIORAMA_MATERIAL_COLOR[material]
        : DIORAMA_MATERIAL_COLOR.neutral;
}

/** Builds a PBR material for a closed `SettlementDioramaMaterial` key (Track 2 finish differentiation). */
function buildDioramaMaterial(materialKey) {
    const color = resolveDioramaMaterialColor(materialKey);
    const finish = DIORAMA_MATERIAL_FINISH[materialKey] || DIORAMA_MATERIAL_FINISH.neutral;
    const opts = { color, metalness: finish.metalness, roughness: finish.roughness };
    if (finish.transparent) {
        opts.transparent = true;
        opts.opacity = finish.opacity ?? 1;
    }
    if (finish.emissiveIntensity) {
        opts.emissive = color;
        opts.emissiveIntensity = finish.emissiveIntensity;
    }
    return new THREE.MeshStandardMaterial(opts);
}

function buildGroundMaterial(hexColorString) {
    const color = parseInt(String(hexColorString).replace('#', ''), 16) || 0x3d4a3d;
    return new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 1 });
}

/** Unit light direction from elevation/azimuth degrees (Track 2 genre lighting profiles). */
function dioramaLightDirection(elevationDeg, azimuthDeg) {
    const el = (elevationDeg * Math.PI) / 180;
    const az = (azimuthDeg * Math.PI) / 180;
    return {
        x: Math.cos(el) * Math.sin(az),
        y: Math.sin(el),
        z: Math.cos(el) * Math.cos(az),
    };
}

/**
 * Applies shadow-camera framing, genre-tinted directional light, ambient intensity, and
 * scene fog for the current snapshot's bounds/palette. Called on both initial scene build
 * and content rebuild (bounds/theme can differ between settlements/layers).
 */
function configureDioramaLighting(t, snapshot) {
    const { width, depth, height } = snapshot.bounds;
    const maxDim = Math.max(width, depth, height, 4);
    const profile = DIORAMA_THEME_LIGHTING[snapshot.palette.theme] || DIORAMA_THEME_LIGHTING.default;
    const targetX = width / 2;
    const targetZ = depth / 2;

    const dir = dioramaLightDirection(profile.elevation, profile.azimuth);
    t.dirLight.position.set(targetX + dir.x * maxDim, dir.y * maxDim, targetZ + dir.z * maxDim);
    t.dirLight.target.position.set(targetX, 0, targetZ);
    t.dirLight.color = new THREE.Color(snapshot.palette.accent || '#ffffff');
    t.dirLight.intensity = profile.dirIntensity;

    const shadowCam = t.dirLight.shadow.camera;
    shadowCam.left = -maxDim;
    shadowCam.right = maxDim;
    shadowCam.top = maxDim;
    shadowCam.bottom = -maxDim;
    shadowCam.near = 0.5;
    shadowCam.far = maxDim * 4;
    shadowCam.updateProjectionMatrix();

    t.ambientLight.color = new THREE.Color(snapshot.palette.ambient || '#8899aa');
    if (t.ambientLight.groundColor) {
        t.ambientLight.groundColor = new THREE.Color(snapshot.palette.ground || '#3d4a3d');
    }
    t.ambientLight.intensity = profile.ambientIntensity;

    const fogColor = snapshot.palette.background || '#1a1a2e';
    const fogNear = Math.max(4, maxDim * 0.9);
    t.scene.fog = new THREE.Fog(fogColor, fogNear, fogNear + Math.max(4, maxDim * 2.1));
}

function disposeObject3D(obj) {
    if (!obj) { return; }
    obj.traverse((child) => {
        if (child.geometry) { child.geometry.dispose(); }
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });
}

function disposeSceneObjects() {
    const t = _dioramaThree;
    if (!t || !t.group) { return; }
    _dioramaHighlight = null;
    _dioramaLastHitMesh = null;
    t.scene.remove(t.group);
    disposeObject3D(t.group);
    t.group = null;
    t.hitMeshes = [];
    t.waterMeshes = [];
    stopDioramaWaterAnimation();
}

function disposeSettlementDioramaRenderer() {
    const t = _dioramaThree;
    if (!t) { return; }
    disposeSceneObjects();
    stopDioramaWaterAnimation();
    if (t.renderer) {
        t.renderer.dispose();
        if (typeof t.renderer.forceContextLoss === 'function') { t.renderer.forceContextLoss(); }
    }
    _dioramaThree = null;
    _lastDioramaSettlementId = null;
    _lastDioramaLayerId = null;
    _lastDioramaRevision = null;
}

function disposeSettlementDiorama() {
    disposeSettlementDioramaRenderer();
}

/** Clear location-specific scene content without losing the canvas WebGL
 * context. A data -> no-data -> same-data preview cycle reuses this canvas;
 * forceContextLoss() makes the subsequent renderer permanently blank in the
 * VS Code Webview. Reset the scene identity so the same snapshot rebuilds. */
function clearSettlementDioramaScene() {
    disposeSceneObjects();
    _lastDioramaSettlementId = null;
    _lastDioramaLayerId = null;
    _lastDioramaRevision = null;
    _dioramaSelected = null;
}

function rebuildDioramaSceneContent(snapshot) {
    const t = _dioramaThree;
    if (!t) { return null; }
    disposeSceneObjects();
    _dioramaHighlight = null;
    const group = new THREE.Group();
    const hitMeshes = [];
    const waterMeshes = [];
    group.add(buildGroundPlane(snapshot));
    const withEdges = snapshot.blocks.length <= DIORAMA_EDGE_LINES_MAX_BLOCKS;
    for (const block of snapshot.blocks) {
        const mesh = buildBlockMesh(block, withEdges);
        group.add(mesh);
        hitMeshes.push(mesh);
        if (mesh.userData.isWater) { waterMeshes.push(mesh); }
    }
    for (const marker of snapshot.markers) {
        const mesh = buildMarkerMesh(marker);
        group.add(mesh);
        hitMeshes.push(mesh);
    }
    t.scene.add(group);
    t.group = group;
    t.hitMeshes = hitMeshes;
    t.waterMeshes = waterMeshes;
    if (snapshot.palette?.background) {
        t.scene.background = new THREE.Color(snapshot.palette.background);
    }
    configureDioramaLighting(t, snapshot);
    updateDioramaWaterAnimationState();
    return t;
}

// Low-poly definition: subtle dark edge lines make each block read as a
// distinct model (the DF-visualizer look) instead of merged color masses.
// Capped by block count so a huge settlement doesn't double its draw calls.
const DIORAMA_EDGE_LINES_MAX_BLOCKS = 350;

function buildBlockMesh(block, withEdges) {
    const geo = new THREE.BoxGeometry(block.w, block.h, block.d);
    const mat = buildDioramaMaterial(block.material);
    const mesh = new THREE.Mesh(geo, mat);
    const center = toSceneVec(block.x, block.y, block.z);
    const baseY = center.y + block.h / 2;
    mesh.position.set(center.x, baseY, center.z);
    mesh.userData = { kind: 'block', label: block.code };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (withEdges) {
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
        );
        mesh.add(edges);
    }
    // Water blocks get a gentle bob + opacity shimmer (see updateDioramaWaterAnimation).
    // No cast shadow flicker: castShadow stays fixed, only position/opacity animate.
    if (block.material === 'water') {
        mesh.userData.isWater = true;
        mesh.userData.baseY = baseY;
        mesh.userData.baseOpacity = mat.opacity ?? 0.88;
        mesh.userData.animPhase = (block.x * 0.7 + block.y * 1.3) % (Math.PI * 2);
    }
    return mesh;
}

function buildMarkerMesh(marker) {
    const shape = DIORAMA_MARKER_SHAPE[marker.kind] || 'box';
    const isPlayer = marker.kind === 'player';
    let geo;
    if (shape === 'cone') {
        geo = isPlayer
            ? new THREE.ConeGeometry(0.2, 0.55, 8)
            : new THREE.ConeGeometry(0.16, 0.42, 8);
    } else if (shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(0.1, 0.1, 0.4, 8);
    } else {
        geo = new THREE.BoxGeometry(0.22, 0.3, 0.22);
    }
    const mat = buildDioramaMaterial(marker.material);
    if (isPlayer) {
        // "You are here" should glow like a cursor even in dim horror lighting.
        mat.emissive = new THREE.Color(0xffd75f);
        mat.emissiveIntensity = 0.6;
    }
    const mesh = new THREE.Mesh(geo, mat);
    const pos = toSceneVec(marker.x, marker.y, marker.z);
    mesh.position.set(pos.x, pos.y + (isPlayer ? 0.27 : 0.2), pos.z);
    mesh.userData = { kind: 'marker', id: marker.id, label: marker.label };
    // Markers stay shadow receivers only (not casters) — 80 of them casting adds little
    // visible value over the block shadows and would double the shadow-pass draw calls.
    mesh.receiveShadow = true;
    return mesh;
}

function buildGroundPlane(snapshot) {
    const { width, depth } = snapshot.bounds;
    const group = new THREE.Group();

    // Diorama plinth: a slightly oversized base slab so the settlement reads
    // as a tabletop model instead of blocks floating on a paper-thin sheet.
    const geo = new THREE.BoxGeometry(width + 1, 0.3, depth + 1);
    const mat = buildGroundMaterial(snapshot.palette.ground);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((width - 1) / 2, -0.15, (depth - 1) / 2);
    mesh.userData = { kind: 'ground' };
    mesh.receiveShadow = true;
    group.add(mesh);

    // Faint survey grid on top of the plinth (DF-visualizer vibe, read-only decoration)
    const gridSize = Math.max(width, depth) + 1;
    const grid = new THREE.GridHelper(gridSize, gridSize, 0xffffff, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.06;
    grid.material.depthWrite = false;
    grid.position.set((width - 1) / 2, 0.005, (depth - 1) / 2);
    grid.userData = { kind: 'ground' };
    group.add(grid);

    group.userData = { kind: 'ground' };
    return group;
}

function applyOrbitFromCamera(camera) {
    _dioramaOrbit = {
        yaw: camera.yaw,
        pitch: Math.max(DIORAMA_PITCH_MIN, Math.min(DIORAMA_PITCH_MAX, camera.pitch)),
        distance: camera.distance,
    };
    _dioramaTarget = { x: camera.target.x, y: camera.target.y, z: camera.target.z };
}

function updateDioramaCameraPosition() {
    const t = _dioramaThree;
    if (!t) { return; }
    const yawRad = (_dioramaOrbit.yaw * Math.PI) / 180;
    const pitchRad = (_dioramaOrbit.pitch * Math.PI) / 180;
    const dist = _dioramaOrbit.distance;
    const target = toSceneVec(_dioramaTarget.x, _dioramaTarget.y, _dioramaTarget.z);
    const horiz = dist * Math.cos(pitchRad);
    const x = target.x + horiz * Math.sin(yawRad);
    const y = target.y + dist * Math.sin(pitchRad);
    const z = target.z + horiz * Math.cos(yawRad);
    t.camera.position.set(x, y, z);
    t.camera.lookAt(target.x, target.y, target.z);
}

function renderDioramaOnce() {
    const t = _dioramaThree;
    if (!t) { return; }
    t.renderer.render(t.scene, t.camera);
}

// P2: water-only animation loop. Bobs each water block on its own sine phase
// (offset by tile position so a pond doesn't pulse in unison) and shimmers
// opacity slightly. Only runs while the diorama tab is visible, there is at
// least one water block, and the OS reduced-motion preference is off — the
// water simply stays static (at its base Y/opacity) in all other cases.
let _dioramaWaterAnimHandle = null;
let _dioramaWaterAnimStart = 0;
const DIORAMA_WATER_BOB_AMPLITUDE = 0.025;
const DIORAMA_WATER_BOB_SPEED = 1.4; // radians/sec
const DIORAMA_WATER_OPACITY_AMPLITUDE = 0.06;

function stopDioramaWaterAnimation() {
    if (_dioramaWaterAnimHandle !== null) {
        cancelAnimationFrame(_dioramaWaterAnimHandle);
        _dioramaWaterAnimHandle = null;
    }
}

function dioramaWaterAnimTick(now) {
    const t = _dioramaThree;
    if (!t || !Array.isArray(t.waterMeshes) || !t.waterMeshes.length) {
        _dioramaWaterAnimHandle = null;
        return;
    }
    if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') {
        _dioramaWaterAnimHandle = null;
        return;
    }
    const elapsed = (now - _dioramaWaterAnimStart) / 1000;
    for (const mesh of t.waterMeshes) {
        const phase = elapsed * DIORAMA_WATER_BOB_SPEED + (mesh.userData.animPhase || 0);
        mesh.position.y = mesh.userData.baseY + Math.sin(phase) * DIORAMA_WATER_BOB_AMPLITUDE;
        if (mesh.material) {
            mesh.material.opacity = mesh.userData.baseOpacity + Math.sin(phase * 0.6) * DIORAMA_WATER_OPACITY_AMPLITUDE;
        }
    }
    renderDioramaOnce();
    _dioramaWaterAnimHandle = requestAnimationFrame(dioramaWaterAnimTick);
}

/** Starts/stops the loop to match current scene contents, tab visibility, and reduced-motion. */
function updateDioramaWaterAnimationState() {
    const t = _dioramaThree;
    const hasWater = Boolean(t && Array.isArray(t.waterMeshes) && t.waterMeshes.length);
    const shouldRun = hasWater
        && !dioramaPrefersReducedMotion()
        && !(typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama');
    if (shouldRun && _dioramaWaterAnimHandle === null) {
        _dioramaWaterAnimStart = performance.now();
        _dioramaWaterAnimHandle = requestAnimationFrame(dioramaWaterAnimTick);
    } else if (!shouldRun) {
        stopDioramaWaterAnimation();
        // Reset to the resting position/opacity so a paused/reduced-motion
        // scene doesn't stay mid-bob.
        if (t && Array.isArray(t.waterMeshes)) {
            for (const mesh of t.waterMeshes) {
                mesh.position.y = mesh.userData.baseY;
                if (mesh.material) { mesh.material.opacity = mesh.userData.baseOpacity; }
            }
            if (t.waterMeshes.length) { renderDioramaOnce(); }
        }
    }
}

function fitSettlementDioramaToSnapshot(snapshot) {
    applyOrbitFromCamera(snapshot.camera);
    updateDioramaCameraPosition();
    renderDioramaOnce();
}

function buildSettlementDioramaScene(canvas, snapshot) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(snapshot.palette.background);

    // Hemisphere light (sky tint from palette.ambient, bounce tint from the
    // ground color) instead of a flat AmbientLight — gives every face a subtle
    // top/bottom gradient so unlit sides still read as 3D.
    const ambientLight = new THREE.HemisphereLight(
        snapshot.palette.ambient || '#8899aa',
        snapshot.palette.ground || '#3d4a3d',
        0.7
    );
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.bias = -0.0015;
    scene.add(dirLight);
    scene.add(dirLight.target);

    const cssWidth = Math.max(1, canvas.clientWidth || 320);
    const cssHeight = Math.max(1, canvas.clientHeight || 260);
    const camera = new THREE.PerspectiveCamera(45, cssWidth / cssHeight, 0.1, 500);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cssWidth, cssHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Filmic tone mapping + sRGB output: softer highlights and richer mids than
    // the linear default, which rendered the low-poly blocks flat and washed out.
    if (THREE.ACESFilmicToneMapping !== undefined) {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
    }
    if (THREE.sRGBEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
    }

    const group = new THREE.Group();
    const hitMeshes = [];
    const waterMeshes = [];

    group.add(buildGroundPlane(snapshot));

    const withEdges = snapshot.blocks.length <= DIORAMA_EDGE_LINES_MAX_BLOCKS;
    for (const block of snapshot.blocks) {
        const mesh = buildBlockMesh(block, withEdges);
        group.add(mesh);
        hitMeshes.push(mesh);
        if (mesh.userData.isWater) { waterMeshes.push(mesh); }
    }
    for (const marker of snapshot.markers) {
        const mesh = buildMarkerMesh(marker);
        group.add(mesh);
        hitMeshes.push(mesh);
    }

    scene.add(group);

    const t = { renderer, scene, camera, group, hitMeshes, waterMeshes, ambientLight, dirLight };
    configureDioramaLighting(t, snapshot);
    return t;
}

function dioramaSceneChanged(snapshot) {
    const revision = snapshot.revision || '';
    return snapshot.settlementId !== _lastDioramaSettlementId
        || snapshot.layerId !== _lastDioramaLayerId
        || revision !== _lastDioramaRevision;
}

function markDioramaSceneState(snapshot) {
    _lastDioramaSettlementId = snapshot.settlementId;
    _lastDioramaLayerId = snapshot.layerId;
    _lastDioramaRevision = snapshot.revision || '';
}

function ensureSettlementDioramaScene(snapshot) {
    if (_dioramaThree && !dioramaSceneChanged(snapshot)) {
        return _dioramaThree;
    }

    const canvas = document.getElementById('world-diorama-canvas');
    if (!canvas) { return null; }

    if (_dioramaThree) {
        rebuildDioramaSceneContent(snapshot);
        markDioramaSceneState(snapshot);
        applyOrbitFromCamera(snapshot.camera);
        _dioramaSelected = null;
        renderSettlementDioramaDetailPanel(null);
        return _dioramaThree;
    }

    disposeSettlementDioramaRenderer();
    _dioramaThree = buildSettlementDioramaScene(canvas, snapshot);
    markDioramaSceneState(snapshot);
    applyOrbitFromCamera(snapshot.camera);
    _dioramaSelected = null;
    renderSettlementDioramaDetailPanel(null);
    updateDioramaWaterAnimationState();
    return _dioramaThree;
}

function hideSettlementDioramaTooltip() {
    const el = document.getElementById('world-diorama-tooltip');
    if (el) {
        el.classList.add('hidden');
        el.textContent = '';
    }
}

function showSettlementDioramaTooltip(hit, clientX, clientY) {
    const el = document.getElementById('world-diorama-tooltip');
    const stage = document.getElementById('world-diorama-stage');
    if (!el || !stage || !hit) { return; }
    el.textContent = hit.label || '';
    el.classList.remove('hidden');
    const rect = stage.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left + 8, 4), rect.width - 4);
    const top = Math.min(Math.max(clientY - rect.top - 28, 4), rect.height - 4);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function renderSettlementDioramaDetailPanel(hit) {
    const panel = document.getElementById('world-diorama-detail');
    if (!panel) { return; }
    if (!hit) {
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }
    panel.innerHTML = `<h4>${escapeDioramaHtml(hit.label || '')}</h4>`;
    panel.classList.remove('hidden');
}

// Click-to-highlight: remembers the last raycast mesh + its original emissive
// so a selected block/marker glows until deselected or the scene rebuilds.
let _dioramaLastHitMesh = null;
let _dioramaHighlight = null; // { mesh, emissive, intensity }

function clearDioramaSelectionHighlight() {
    const h = _dioramaHighlight;
    if (h && h.mesh && h.mesh.material) {
        h.mesh.material.emissive = h.emissive;
        h.mesh.material.emissiveIntensity = h.intensity;
    }
    _dioramaHighlight = null;
}

function applyDioramaSelectionHighlight(mesh) {
    clearDioramaSelectionHighlight();
    if (!mesh || !mesh.material || !mesh.material.emissive) { return; }
    _dioramaHighlight = {
        mesh,
        emissive: mesh.material.emissive.clone(),
        intensity: mesh.material.emissiveIntensity ?? 0,
    };
    mesh.material.emissive = new THREE.Color(0xffd75f);
    mesh.material.emissiveIntensity = 0.45;
}

function hitTestSettlementDiorama(clientX, clientY) {
    const t = _dioramaThree;
    const canvas = document.getElementById('world-diorama-canvas');
    if (!t || !canvas || !t.hitMeshes.length) { return null; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { return null; }
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), t.camera);
    const intersects = raycaster.intersectObjects(t.hitMeshes, false);
    if (!intersects.length) {
        _dioramaLastHitMesh = null;
        return null;
    }
    _dioramaLastHitMesh = intersects[0].object;
    return intersects[0].object.userData || null;
}

function renderSettlementDioramaMarkerFallback(snapshot) {
    const list = document.getElementById('world-diorama-marker-fallback');
    if (!list) { return; }
    const markers = Array.isArray(snapshot?.markers) ? snapshot.markers : [];
    if (!markers.length) {
        list.innerHTML = '';
        list.classList.add('hidden');
        return;
    }
    const items = markers.slice(0, 80).map((m) => (
        `<li><button type="button" class="world-diorama-marker-item" data-marker-id="${escapeDioramaHtml(m.id)}">${escapeDioramaHtml(m.kind)}: ${escapeDioramaHtml(m.label)}</button></li>`
    )).join('');
    list.innerHTML = `<span class="world-diorama-marker-fallback-title">${typeof T === 'function' ? T('webview.world.dioramaMarkerList') : 'Markers'}</span><ul>${items}</ul>`;
    list.classList.remove('hidden');
    list.querySelectorAll('.world-diorama-marker-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-marker-id');
            const marker = markers.find((m) => m.id === id);
            if (marker) {
                _dioramaSelected = { label: `${marker.kind}: ${marker.label}` };
                renderSettlementDioramaDetailPanel(_dioramaSelected);
            }
        });
    });
}

function renderSettlementDioramaScene(snapshot) {
    const stage = document.getElementById('world-diorama-stage');
    const unavailable = document.getElementById('world-diorama-unavailable');
    const canvas = document.getElementById('world-diorama-canvas');
    if (!stage || !canvas || !snapshot) { return; }

    if (!isThreeAvailable()) {
        stage.classList.add('hidden');
        if (unavailable) {
            unavailable.classList.remove('hidden');
            unavailable.textContent = typeof T === 'function' ? T('webview.world.dioramaUnavailable') : 'Three.js / WebGL is unavailable in this Webview.';
        }
        disposeSettlementDiorama();
        renderSettlementDioramaMarkerFallback(snapshot);
        return;
    }

    if (unavailable) { unavailable.classList.add('hidden'); }
    stage.classList.remove('hidden');

    if (!stage.clientWidth) { return; }

    const t = ensureSettlementDioramaScene(snapshot);
    if (!t) { return; }
    resizeSettlementDiorama();
    renderSettlementDioramaMarkerFallback(snapshot);
    renderDioramaOnce();
}

function renderSettlementDiorama() {
    const stage = document.getElementById('world-diorama-stage');
    const empty = document.getElementById('world-diorama-empty');
    const unavailable = document.getElementById('world-diorama-unavailable');
    const canvas = document.getElementById('world-diorama-canvas');
    if (!stage || !canvas) { return; }

    const msg = _dioramaWorldMsg;
    const snapshot = getDioramaSnapshot();
    const flagOn = Boolean(msg && msg.enableSettlementDiorama === true);
    if (typeof renderSettlementSourceSelector === 'function') {
        renderSettlementSourceSelector(msg);
    }
    if (typeof renderSettlementFocusBanner === 'function') {
        renderSettlementFocusBanner(msg, { prefix: 'diorama' });
    }

    if (!flagOn || !snapshot) {
        stage.classList.add('hidden');
        if (unavailable) { unavailable.classList.add('hidden'); }
        if (empty) {
            empty.classList.remove('hidden');
            const ctx = msg && msg.settlementDisplayContext;
            const location = (ctx && (ctx.displayLocationName || ctx.displayLocationId)) || '';
            empty.textContent = typeof T === 'function'
                ? T('webview.world.dioramaNoDataLocation', { location })
                : (location ? `${location} has no Diorama data.` : 'This location has no Diorama data.');
        }
        clearSettlementDioramaScene();
        renderSettlementDioramaMarkerFallback(null);
        renderSettlementDioramaDetailPanel(null);
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    renderSettlementDioramaMarkerFallback(snapshot);

    loadThreeJsLazy().then((ok) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        const fresh = getDioramaSnapshot();
        if (!fresh) { return; }
        if (!ok) {
            renderSettlementDioramaScene(fresh);
            return;
        }
        renderSettlementDioramaScene(fresh);
    });
}

function resizeSettlementDiorama() {
    const t = _dioramaThree;
    const canvas = document.getElementById('world-diorama-canvas');
    if (!t || !canvas) { return; }
    const cssWidth = Math.max(1, canvas.clientWidth || 1);
    const cssHeight = Math.max(180, Math.min(420, cssWidth * 0.7));
    const stage = document.getElementById('world-diorama-stage');
    if (stage) { stage.style.minHeight = `${cssHeight}px`; }
    t.camera.aspect = cssWidth / cssHeight;
    t.camera.updateProjectionMatrix();
    t.renderer.setSize(cssWidth, cssHeight, false);
    updateDioramaCameraPosition();
    renderDioramaOnce();
}

function queueSettlementDioramaResize() {
    if (_dioramaResizeQueued) { return; }
    _dioramaResizeQueued = true;
    requestAnimationFrame(() => {
        _dioramaResizeQueued = false;
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        resizeSettlementDiorama();
    });
}

function initSettlementDioramaControls() {
    if (_dioramaControlsReady) { return; }
    _dioramaControlsReady = true;

    const canvas = document.getElementById('world-diorama-canvas');
    const stage = document.getElementById('world-diorama-stage');
    if (!canvas || !stage) { return; }

    const zoomIn = document.getElementById('world-diorama-zoom-in');
    const zoomOut = document.getElementById('world-diorama-zoom-out');
    const zoomReset = document.getElementById('world-diorama-zoom-reset');
    const zoomFit = document.getElementById('world-diorama-zoom-fit');

    function clampDistance(d) {
        const snapshot = getDioramaSnapshot();
        const min = snapshot?.camera?.minDistance ?? 4;
        const max = snapshot?.camera?.maxDistance ?? 64;
        return Math.max(min, Math.min(max, d));
    }

    if (zoomIn) {
        zoomIn.addEventListener('click', () => {
            _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * (1 - DIORAMA_WHEEL_STEP_RATIO));
            updateDioramaCameraPosition();
            renderDioramaOnce();
        });
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', () => {
            _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * (1 + DIORAMA_WHEEL_STEP_RATIO));
            updateDioramaCameraPosition();
            renderDioramaOnce();
        });
    }
    if (zoomReset || zoomFit) {
        const resetHandler = () => {
            const snapshot = getDioramaSnapshot();
            if (snapshot) { fitSettlementDioramaToSnapshot(snapshot); }
        };
        if (zoomReset) { zoomReset.addEventListener('click', resetHandler); }
        if (zoomFit) { zoomFit.addEventListener('click', resetHandler); }
    }

    canvas.addEventListener('mousedown', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        _dioramaDidDrag = false;
        _dioramaDrag = { x: e.clientX, y: e.clientY, yaw: _dioramaOrbit.yaw, pitch: _dioramaOrbit.pitch };
    });
    window.addEventListener('mousemove', (e) => {
        if (!_dioramaDrag) { return; }
        const dx = e.clientX - _dioramaDrag.x;
        const dy = e.clientY - _dioramaDrag.y;
        if (Math.hypot(dx, dy) > 4) { _dioramaDidDrag = true; }
        _dioramaOrbit.yaw = _dioramaDrag.yaw + dx * DIORAMA_DRAG_YAW_SENSITIVITY;
        _dioramaOrbit.pitch = Math.max(
            DIORAMA_PITCH_MIN,
            Math.min(DIORAMA_PITCH_MAX, _dioramaDrag.pitch - dy * DIORAMA_DRAG_PITCH_SENSITIVITY)
        );
        updateDioramaCameraPosition();
        renderDioramaOnce();
    });
    window.addEventListener('mouseup', () => { _dioramaDrag = null; });

    canvas.addEventListener('wheel', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        e.preventDefault();
        const factor = e.deltaY > 0 ? (1 + DIORAMA_WHEEL_STEP_RATIO) : (1 - DIORAMA_WHEEL_STEP_RATIO);
        _dioramaOrbit.distance = clampDistance(_dioramaOrbit.distance * factor);
        updateDioramaCameraPosition();
        renderDioramaOnce();
    }, { passive: false });

    canvas.addEventListener('mousemove', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') {
            hideSettlementDioramaTooltip();
            return;
        }
        if (_dioramaDrag) { return; }
        const hit = hitTestSettlementDiorama(e.clientX, e.clientY);
        if (hit) {
            showSettlementDioramaTooltip(hit, e.clientX, e.clientY);
        } else {
            hideSettlementDioramaTooltip();
        }
    });
    canvas.addEventListener('mouseleave', hideSettlementDioramaTooltip);

    canvas.addEventListener('click', (e) => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        if (_dioramaDidDrag) { return; }
        const hit = hitTestSettlementDiorama(e.clientX, e.clientY);
        _dioramaSelected = hit;
        renderSettlementDioramaDetailPanel(hit);
        if (hit && _dioramaLastHitMesh) {
            applyDioramaSelectionHighlight(_dioramaLastHitMesh);
        } else {
            clearDioramaSelectionHighlight();
        }
        renderDioramaOnce();
    });

    window.addEventListener('resize', () => {
        if (typeof worldMapMode !== 'undefined' && worldMapMode !== 'diorama') { return; }
        queueSettlementDioramaResize();
    });
}

window.addEventListener('DOMContentLoaded', () => {
    initSettlementDioramaControls();
});

/* --- 87-parlor-settings.js --- */
/* global document, window, T, vscode, bgLayer */

(function () {
    const settingsBtn = document.getElementById('parlor-settings-btn');
    const panel = document.getElementById('parlor-settings-panel');
    const backdrop = document.getElementById('parlor-settings-backdrop');
    const closeBtn = document.getElementById('parlor-settings-panel-close');
    const connSelect = document.getElementById('parlor-connection-select');
    const characterSelect = document.getElementById('parlor-character-select');
    const importCharacterBtn = document.getElementById('parlor-import-character-btn');
    const editCharacterBtn = document.getElementById('parlor-edit-character-btn');
    const personaName = document.getElementById('parlor-persona-name');
    const personaDesc = document.getElementById('parlor-persona-description');
    const personaStyle = document.getElementById('parlor-persona-style');
    const personaPresetSelect = document.getElementById('parlor-persona-preset-select');
    const personaFromCharacterBtn = document.getElementById('parlor-persona-from-character-btn');
    const personaImportJsonBtn = document.getElementById('parlor-persona-import-json-btn');
    const personaApplyBtn = document.getElementById('parlor-persona-apply-btn');
    const personaSaveNewBtn = document.getElementById('parlor-persona-save-new-btn');
    const personaUpdateBtn = document.getElementById('parlor-persona-update-btn');
    const personaSaved = document.getElementById('parlor-persona-saved');
    const bgGallery = document.getElementById('parlor-bg-gallery');
    const bgHint = document.getElementById('parlor-bg-hint');
    const promoteBtn = document.getElementById('parlor-promote-btn');
    const freshWrap = document.getElementById('parlor-campaign-fresh-wrap');
    const frozenWrap = document.getElementById('parlor-campaign-frozen-wrap');
    const emptyHint = document.getElementById('parlor-campaign-empty-hint');
    const resumeCampaignBtn = document.getElementById('parlor-resume-campaign-btn');
    const freshCampaignBtn = document.getElementById('parlor-fresh-campaign-btn');

    let activeConnectionId = '';
    let activeBackgroundId = null;
    let activeCharacterId = null;
    let activePersonaId = null;
    let personaDraftMeta = null;
    let personaSaveTimeout = null;
    let campaignTransition = {
        hasGameState: false,
        hasFrozenCampaign: false,
        parlorMessageCount: 0,
        canCreateFresh: false,
        canResumeFrozen: false,
    };

    function openPanel() {
        if (!panel) return;
        vscode.postMessage({ type: 'requestParlorSettings' });
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
        }
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    }

    function closePanel(options) {
        if (!panel) return;
        const restoreFocus = !options || options.restoreFocus !== false;
        const wasOpen = !panel.classList.contains('hidden');
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        if (restoreFocus && wasOpen && settingsBtn && typeof settingsBtn.focus === 'function') {
            settingsBtn.focus();
        }
    }

    // Availability (the launcher is Parlor-only) and open state are separate.
    // Leaving Parlor closes the surface; entering it never opens the surface.
    function setPanelAvailability(isParlor) {
        if (!isParlor) closePanel({ restoreFocus: false });
    }

    function showPersonaSaved() {
        if (!personaSaved) return;
        personaSaved.classList.remove('hidden');
        if (personaSaveTimeout) clearTimeout(personaSaveTimeout);
        personaSaveTimeout = setTimeout(() => {
            personaSaved.classList.add('hidden');
        }, 2000);
    }

    function applyParlorBackground(uri) {
        if (!bgLayer || !uri) return;
        bgLayer.style.backgroundImage = `url("${uri}")`;
        bgLayer.className = 'has-scene-bg';
    }

    function clearParlorBackground() {
        if (!bgLayer) return;
        bgLayer.style.backgroundImage = '';
        const theme = window.currentTheme || 'dark';
        bgLayer.className = `theme-${theme}`;
    }

    function renderConnectionProfiles(profiles, activeId) {
        if (!connSelect) return;
        connSelect.innerHTML = '';
        const list = Array.isArray(profiles) ? profiles : [];
        for (const p of list) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label || p.id;
            if (p.provider) {
                opt.dataset.provider = p.provider;
            }
            connSelect.appendChild(opt);
        }
        activeConnectionId = activeId || (list[0] && list[0].id) || '';
        if (activeConnectionId) {
            connSelect.value = activeConnectionId;
        }
    }

    function renderCharacters(characters, activeId) {
        if (!characterSelect) return;
        const list = Array.isArray(characters) ? characters : [];
        activeCharacterId = activeId || null;
        characterSelect.innerHTML = '';
        for (const character of list) {
            const opt = document.createElement('option');
            opt.value = character.id;
            opt.textContent = character.name || character.id;
            characterSelect.appendChild(opt);
        }
        if (activeCharacterId && list.some((character) => character.id === activeCharacterId)) {
            characterSelect.value = activeCharacterId;
        }
        if (editCharacterBtn) editCharacterBtn.disabled = !activeCharacterId;
    }

    function renderPersona(persona) {
        const p = persona || {};
        if (personaName) personaName.value = p.name || '';
        if (personaDesc) personaDesc.value = p.description || '';
        if (personaStyle) personaStyle.value = p.speakingStyle || '';
    }

    function personaDraft() {
        return {
            name: personaName ? personaName.value.trim() : '',
            description: personaDesc ? personaDesc.value.trim() : '',
            speakingStyle: personaStyle ? personaStyle.value.trim() : '',
        };
    }

    function renderPersonaPresets(presets, selectedId) {
        if (!personaPresetSelect) return;
        const list = Array.isArray(presets) ? presets : [];
        activePersonaId = selectedId || null;
        personaPresetSelect.innerHTML = '';
        const current = document.createElement('option');
        current.value = '';
        current.textContent = typeof T === 'function' ? T('webview.parlor.personaCurrent') : 'Current persona';
        personaPresetSelect.appendChild(current);
        for (const preset of list) {
            const option = document.createElement('option');
            option.value = preset.id;
            option.textContent = preset.sourceLabel
                ? `${preset.displayName || preset.id} — ${preset.sourceLabel}`
                : (preset.displayName || preset.id);
            personaPresetSelect.appendChild(option);
        }
        personaPresetSelect.value = activePersonaId || '';
        if (personaUpdateBtn) personaUpdateBtn.disabled = !activePersonaId;
    }

    function renderBackgroundGallery(backgrounds, activeId) {
        if (!bgGallery) return;
        bgGallery.innerHTML = '';
        activeBackgroundId = activeId || null;
        const list = Array.isArray(backgrounds) ? backgrounds : [];

        const noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.className = 'parlor-bg-thumb parlor-bg-none' + (activeBackgroundId ? '' : ' active');
        noneBtn.textContent = typeof T === 'function' ? T('webview.parlor.bgNone') : 'None';
        noneBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'setParlorBackground', backgroundId: null });
        });
        bgGallery.appendChild(noneBtn);

        for (const bg of list) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'parlor-bg-thumb' + (bg.id === activeBackgroundId ? ' active' : '');
            btn.title = bg.label || bg.id;
            if (bg.uri) {
                const img = document.createElement('img');
                img.src = bg.uri;
                img.alt = bg.label || '';
                btn.appendChild(img);
            } else {
                btn.textContent = bg.label || bg.id;
            }
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'setParlorBackground', backgroundId: bg.id });
            });
            bgGallery.appendChild(btn);
        }

        if (bgHint) {
            const empty = list.length === 0;
            bgHint.classList.toggle('hidden', !empty);
        }
    }

    function normalizeCampaignTransition(raw) {
        const t = raw && typeof raw === 'object' ? raw : {};
        const parlorMessageCount = Number.isFinite(t.parlorMessageCount)
            ? Math.max(0, Math.floor(t.parlorMessageCount))
            : 0;
        const hasGameState = t.hasGameState === true;
        const hasFrozenCampaign = hasGameState && t.hasFrozenCampaign === true;
        return {
            hasGameState,
            hasFrozenCampaign,
            parlorMessageCount,
            canCreateFresh: t.canCreateFresh === true || parlorMessageCount > 0,
            canResumeFrozen: t.canResumeFrozen === true || hasFrozenCampaign,
        };
    }

    function setButtonDisabled(btn, disabled, titleKey) {
        if (!btn) return;
        btn.disabled = !!disabled;
        if (disabled && titleKey && typeof T === 'function') {
            btn.title = T(titleKey);
            btn.setAttribute('aria-disabled', 'true');
        } else {
            btn.removeAttribute('aria-disabled');
            if (!disabled) {
                btn.removeAttribute('title');
            }
        }
    }

    function renderCampaignTransition(raw) {
        campaignTransition = normalizeCampaignTransition(raw);
        const frozen = campaignTransition.canResumeFrozen;
        const canFresh = campaignTransition.canCreateFresh;

        if (freshWrap) {
            freshWrap.classList.toggle('hidden', frozen);
        }
        if (frozenWrap) {
            frozenWrap.classList.toggle('hidden', !frozen);
        }
        if (emptyHint) {
            // Show why fresh creation is disabled when no messages and not only-resume UI clutter.
            const showEmpty = !canFresh;
            emptyHint.classList.toggle('hidden', !showEmpty);
        }

        setButtonDisabled(
            promoteBtn,
            !canFresh,
            'webview.parlor.promoteEmptyHint'
        );
        setButtonDisabled(resumeCampaignBtn, !campaignTransition.canResumeFrozen, null);
        setButtonDisabled(
            freshCampaignBtn,
            !canFresh,
            'webview.parlor.promoteEmptyHint'
        );
    }

    function postPromote(intent) {
        if (document.getElementById('gm-loading')) {
            return;
        }
        vscode.postMessage({ type: 'promoteParlor', intent: intent || 'auto' });
    }

    function applyParlorSettings(msg) {
        renderCharacters(msg.characters, msg.activeCharacterId);
        renderConnectionProfiles(msg.connectionProfiles, msg.activeConnectionId);
        renderPersona(msg.persona);
        renderPersonaPresets(msg.personaPresets, msg.activePersonaId);
        personaDraftMeta = null;
        renderBackgroundGallery(msg.backgrounds, msg.activeBackgroundId);
        renderCampaignTransition(msg.campaignTransition);
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (backdrop) backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
            event.preventDefault();
            closePanel();
        }
    });

    if (connSelect) {
        connSelect.addEventListener('change', () => {
            const id = connSelect.value;
            if (id && id !== activeConnectionId) {
                vscode.postMessage({ type: 'setParlorConnectionProfile', profileId: id });
            }
        });
    }

    if (personaPresetSelect) {
        personaPresetSelect.addEventListener('change', () => {
            vscode.postMessage({ type: 'selectParlorPersonaPreset', id: personaPresetSelect.value || null });
        });
    }

    if (personaFromCharacterBtn) {
        personaFromCharacterBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'createParlorPersonaFromCharacter' });
        });
    }

    if (personaImportJsonBtn) {
        personaImportJsonBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'importParlorPersonaJson' });
        });
    }

    if (personaApplyBtn) {
        personaApplyBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'saveParlorPersona', persona: personaDraft() });
        });
    }

    if (personaSaveNewBtn) {
        personaSaveNewBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'saveNewParlorPersonaPreset', persona: personaDraft(), meta: personaDraftMeta });
        });
    }

    if (personaUpdateBtn) {
        personaUpdateBtn.addEventListener('click', () => {
            if (!activePersonaId) return;
            vscode.postMessage({ type: 'updateParlorPersonaPreset', id: activePersonaId, persona: personaDraft() });
        });
    }

    if (characterSelect) {
        characterSelect.addEventListener('change', () => {
            const requestedId = characterSelect.value;
            // A refreshed characterList/settings payload is the host acceptance ack.
            characterSelect.value = activeCharacterId || '';
            if (requestedId && requestedId !== activeCharacterId) {
                vscode.postMessage({ type: 'switchParlorCharacter', id: requestedId });
            }
        });
    }

    if (importCharacterBtn) {
        importCharacterBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'importParlorTavernCard' });
        });
    }

    if (editCharacterBtn) {
        editCharacterBtn.addEventListener('click', () => {
            const current = Array.isArray(window.currentCharacters)
                ? window.currentCharacters.find((character) => character.id === activeCharacterId)
                : null;
            if (current) window.openCharacterCreator?.(current);
        });
    }

    if (promoteBtn) {
        promoteBtn.addEventListener('click', () => {
            if (promoteBtn.disabled) return;
            postPromote('fresh');
        });
    }
    if (resumeCampaignBtn) {
        resumeCampaignBtn.addEventListener('click', () => {
            if (resumeCampaignBtn.disabled) return;
            postPromote('resume');
        });
    }
    if (freshCampaignBtn) {
        freshCampaignBtn.addEventListener('click', () => {
            if (freshCampaignBtn.disabled) return;
            postPromote('fresh');
        });
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'parlorSettings') {
            applyParlorSettings(msg);
        } else if (msg.type === 'parlorPersonaDraft') {
            renderPersona(msg.persona);
            personaDraftMeta = msg.meta || null;
        } else if (msg.type === 'parlorBackground') {
            if (msg.uri) {
                applyParlorBackground(msg.uri);
            } else {
                clearParlorBackground();
            }
        }
    });

    window.setParlorSettingsPanelAvailability = setPanelAvailability;
    // A Webview reload must always start with this transient panel closed.
    closePanel({ restoreFocus: false });
})();

/* --- 88-world-observatory.js --- */
// webview/modules/88-world-observatory.js
// World Observatory: market sparklines / chronicle / NPC bonds dashboard + observer tick.
// Independent module — does not read or write any DOM owned by 85-world.js, only its own
// #world-observatory subtree. Receives the same broadcast 'worldView' message as 85-world.js.

(function () {
    // Mirrors worldObservatoryCore.ts MIN_AUTO_OBSERVE_INTERVAL_MS / MAX_AUTO_OBSERVE_TICKS_PER_SESSION.
    const AUTO_OBSERVE_INTERVAL_MS = 1100;
    const MAX_AUTO_OBSERVE_TICKS = 200;
    const MAX_SPARKLINE_POINTS = 24;
    const MAX_CHRONICLE_ROWS = 12;

    let autoTimer = null;
    let autoTickCount = 0;

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureContainer() {
        let el = document.getElementById('world-observatory');
        if (el) return el;
        const parent = document.getElementById('world-content');
        if (!parent) return null;
        el = document.createElement('div');
        el.id = 'world-observatory';
        el.className = 'hidden';
        el.innerHTML = `
            <div class="observatory-header">
                <span class="observatory-glyph" aria-hidden="true">🔭</span>
                <span class="observatory-title">${escapeHtml(T('webview.observatory.title'))}</span>
                <span class="observatory-turn-chip">
                    <span class="observatory-live-dot" id="observatory-live-dot"></span>
                    <span id="observatory-turn-label">T0</span>
                </span>
                <span class="observatory-spacer"></span>
                <select class="observatory-mode-select" id="observatory-mode-select" aria-label="${escapeHtml(T('webview.observatory.modeLabel'))}">
                    <option value="watch">${escapeHtml(T('webview.observatory.modeWatch'))}</option>
                    <option value="advance">${escapeHtml(T('webview.observatory.modeAdvance'))}</option>
                </select>
                <button class="observatory-btn" id="observatory-tick-btn">${escapeHtml(T('webview.observatory.tickOnce'))}</button>
                <button class="observatory-btn" id="observatory-auto-btn">${escapeHtml(T('webview.observatory.autoStart'))}</button>
            </div>
            <p class="observatory-side-effects" id="observatory-side-effects" role="note"></p>
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.marketsHeading'))}</div>
            <div class="observatory-market-grid" id="observatory-market-grid"></div>
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.chronicleHeading'))}</div>
            <div class="observatory-chronicle-list" id="observatory-chronicle-list"></div>
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.bondsHeading'))}</div>
            <div class="observatory-bonds-wrap" id="observatory-bonds-wrap"></div>
            <div class="observatory-bonds-legend" id="observatory-bonds-legend"></div>
        `;
        parent.appendChild(el);

        const tickBtn = el.querySelector('#observatory-tick-btn');
        const autoBtn = el.querySelector('#observatory-auto-btn');
        const modeSelect = el.querySelector('#observatory-mode-select');
        if (tickBtn) {
            tickBtn.addEventListener('click', () => sendObserverTick(modeSelect ? modeSelect.value : 'watch'));
        }
        if (autoBtn) {
            autoBtn.addEventListener('click', () => toggleAutoObserve(modeSelect ? modeSelect.value : 'watch'));
        }
        if (modeSelect) {
            modeSelect.addEventListener('change', () => updateSideEffectsNote(modeSelect.value));
            updateSideEffectsNote(modeSelect.value);
        }
        return el;
    }

    function updateSideEffectsNote(mode) {
        const el = document.getElementById('observatory-side-effects');
        if (!el) return;
        const key = mode === 'advance'
            ? 'webview.observatory.sideEffectsAdvance'
            : 'webview.observatory.sideEffectsWatch';
        el.textContent = T(key);
    }

    function sendObserverTick(mode) {
        vscode.postMessage({ type: 'observerWorldTick', mode: mode === 'advance' ? 'advance' : 'watch' });
    }

    function stopAutoObserve() {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
        autoTickCount = 0;
        const dot = document.getElementById('observatory-live-dot');
        const btn = document.getElementById('observatory-auto-btn');
        if (dot) dot.classList.remove('auto-on');
        if (btn) btn.textContent = T('webview.observatory.autoStart');
    }

    function toggleAutoObserve(mode) {
        if (autoTimer) {
            stopAutoObserve();
            return;
        }
        const dot = document.getElementById('observatory-live-dot');
        const btn = document.getElementById('observatory-auto-btn');
        if (dot) dot.classList.add('auto-on');
        if (btn) btn.textContent = T('webview.observatory.autoStop');
        autoTickCount = 0;
        autoTimer = setInterval(() => {
            autoTickCount++;
            if (autoTickCount > MAX_AUTO_OBSERVE_TICKS) {
                stopAutoObserve();
                return;
            }
            const modeSelect = document.getElementById('observatory-mode-select');
            sendObserverTick(modeSelect ? modeSelect.value : mode);
        }, AUTO_OBSERVE_INTERVAL_MS);
    }

    function sparklinePoints(series) {
        const trimmed = series.slice(-MAX_SPARKLINE_POINTS);
        const n = trimmed.length;
        if (n === 0) return { points: '', trend: 0 };
        const min = Math.min(...trimmed);
        const max = Math.max(...trimmed);
        const range = (max - min) || 0.1;
        const points = trimmed
            .map((v, i) => {
                const x = n > 1 ? (i * 116 / (n - 1)).toFixed(1) : '0.0';
                const y = (28 - ((v - min) / range) * 24).toFixed(1);
                return `${x},${y}`;
            })
            .join(' ');
        const trend = n > 1 ? trimmed[n - 1] - trimmed[0] : 0;
        return { points, trend, last: trimmed[n - 1] };
    }

    function renderMarkets(marketPriceHistory) {
        const grid = document.getElementById('observatory-market-grid');
        if (!grid) return;
        if (!marketPriceHistory || Object.keys(marketPriceHistory).length === 0) {
            grid.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.marketsEmpty'))}</div>`;
            return;
        }
        const cards = [];
        for (const [locId, byCommodity] of Object.entries(marketPriceHistory)) {
            for (const [commodityId, series] of Object.entries(byCommodity)) {
                if (!Array.isArray(series) || series.length === 0) continue;
                const { points, trend, last } = sparklinePoints(series);
                const color = trend > 0.05 ? '#f4a261' : trend < -0.05 ? '#b0e57c' : '#8c93a0';
                const arrow = trend > 0.05 ? '▲' : trend < -0.05 ? '▼' : '–';
                cards.push(`
                    <div class="observatory-market-card">
                        <div class="observatory-market-name-row">
                            <span class="observatory-market-name">${escapeHtml(commodityId)}</span>
                            <span class="observatory-market-idx" style="color:${color}">${escapeHtml(formatIndex(last))} ${arrow}</span>
                        </div>
                        <div class="observatory-market-loc">${escapeHtml(locId)}</div>
                        <svg class="observatory-spark" viewBox="0 0 116 30" preserveAspectRatio="none">
                            <polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}" />
                        </svg>
                    </div>
                `);
            }
        }
        grid.innerHTML = cards.length > 0
            ? cards.join('')
            : `<div class="observatory-empty">${escapeHtml(T('webview.observatory.marketsEmpty'))}</div>`;
    }

    function formatIndex(v) {
        return typeof v === 'number' ? `x${v.toFixed(2)}` : '';
    }

    function renderChronicle(events) {
        const list = document.getElementById('observatory-chronicle-list');
        if (!list) return;
        if (!Array.isArray(events) || events.length === 0) {
            list.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.chronicleEmpty'))}</div>`;
            return;
        }
        const rows = events
            .slice(-MAX_CHRONICLE_ROWS)
            .slice()
            .reverse()
            .map((ev) => {
                const severityClass = ev.severity === 'critical'
                    ? 'severity-critical'
                    : ev.severity === 'warning'
                        ? 'severity-warning'
                        : '';
                return `
                    <div class="observatory-chronicle-row">
                        <span class="observatory-chronicle-dot ${severityClass}"></span>
                        <span class="observatory-chronicle-text">${escapeHtml(ev.text)}</span>
                        <span class="observatory-chronicle-turn">T${escapeHtml(ev.worldTurn ?? '?')}</span>
                    </div>
                `;
            });
        list.innerHTML = rows.join('');
    }

    // Shared vocab from 85-world.js (same bundle, loaded first — the 86-tile-overmap pattern).
    // Guarded with local fallbacks so this module stays self-sufficient if 85 renames them.
    const BOND_MILESTONE_ICON = typeof NPC_MILESTONE_ICON !== 'undefined'
        ? NPC_MILESTONE_ICON
        : { sworn_allies: '🛡️', inseparable: '💠', bitter_enemies: '🗡️', estranged: '💔', reconciled: '🕊️' };
    const BOND_LABEL_KEY = typeof NPC_BOND_LABEL_KEY !== 'undefined'
        ? NPC_BOND_LABEL_KEY
        : {
            ally: 'webview.world.npcBondAlly',
            friend: 'webview.world.npcBondFriend',
            rival: 'webview.world.npcBondRival',
            enemy: 'webview.world.npcBondEnemy',
        };
    const BOND_EDGE_STYLE = {
        ally: { stroke: 'var(--accent, #4f8ef7)', width: 3, opacity: 0.85, dash: '' },
        friend: { stroke: 'var(--accent, #4f8ef7)', width: 1.3, opacity: 0.45, dash: '' },
        rival: { stroke: '#f4a261', width: 1.5, opacity: 0.7, dash: '5 4' },
        enemy: { stroke: '#e76f51', width: 2.4, opacity: 0.85, dash: '5 4' },
    };
    const MAX_BOND_GRAPH_NODES = 12;

    function renderBondsGraph(bonds) {
        const wrap = document.getElementById('observatory-bonds-wrap');
        const legend = document.getElementById('observatory-bonds-legend');
        if (!wrap || !legend) return;

        const entries = (Array.isArray(bonds) ? bonds : [])
            .filter((b) => b && b.nameA && b.nameB && BOND_EDGE_STYLE[b.label]);
        if (entries.length === 0) {
            wrap.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.bondsEmpty'))}</div>`;
            legend.innerHTML = '';
            return;
        }

        // Deterministic node set: first-appearance order, capped.
        const names = [];
        for (const b of entries) {
            if (!names.includes(b.nameA) && names.length < MAX_BOND_GRAPH_NODES) names.push(b.nameA);
            if (!names.includes(b.nameB) && names.length < MAX_BOND_GRAPH_NODES) names.push(b.nameB);
        }
        const drawable = entries.filter((b) => names.includes(b.nameA) && names.includes(b.nameB));

        // Ellipse layout — plenty for <=10 named NPCs, no physics needed.
        const W = 320;
        const H = names.length > 6 ? 210 : 180;
        const cx = W / 2;
        const cy = H / 2 - 8;
        const rx = W / 2 - 44;
        const ry = cy - 26;
        const pos = {};
        names.forEach((name, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
            pos[name] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
        });

        const edgeParts = [];
        const badgeParts = [];
        for (const b of drawable) {
            const a = pos[b.nameA];
            const z = pos[b.nameB];
            const s = BOND_EDGE_STYLE[b.label];
            edgeParts.push(
                `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${z.x.toFixed(1)}" y2="${z.y.toFixed(1)}"`
                + ` stroke="${s.stroke}" stroke-width="${s.width}" opacity="${s.opacity}"`
                + (s.dash ? ` stroke-dasharray="${s.dash}"` : '')
                + ' />'
            );
            if (b.milestone && BOND_MILESTONE_ICON[b.milestone]) {
                const mx = (a.x + z.x) / 2;
                const my = (a.y + z.y) / 2;
                badgeParts.push(
                    `<text x="${mx.toFixed(1)}" y="${(my - 4).toFixed(1)}" text-anchor="middle" font-size="12">${BOND_MILESTONE_ICON[b.milestone]}</text>`
                );
            }
        }

        const nodeParts = names.map((name) => {
            const p = pos[name];
            const initial = escapeHtml(String(name).charAt(0));
            return `
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13" class="observatory-bond-node" />
                <text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" class="observatory-bond-initial">${initial}</text>
                <text x="${p.x.toFixed(1)}" y="${(p.y + 26).toFixed(1)}" text-anchor="middle" class="observatory-bond-name">${escapeHtml(name)}</text>
            `;
        });

        wrap.innerHTML = `
            <svg class="observatory-bonds-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(T('webview.observatory.bondsHeading'))}">
                ${edgeParts.join('')}
                ${nodeParts.join('')}
                ${badgeParts.join('')}
            </svg>
        `;

        // Legend: only labels actually present, using the same i18n as the Bonds list.
        const seenLabels = [...new Set(drawable.map((b) => b.label))];
        legend.innerHTML = seenLabels
            .map((label) => {
                const s = BOND_EDGE_STYLE[label];
                const line = `<span class="observatory-legend-line" style="background:${s.stroke};opacity:${s.opacity};${s.dash ? 'background:repeating-linear-gradient(90deg,' + s.stroke + ' 0 5px,transparent 5px 9px);' : ''}"></span>`;
                return `<span class="observatory-legend-item">${line}${escapeHtml(T(BOND_LABEL_KEY[label]))}</span>`;
            })
            .join('');
    }

    function renderObservatory(msg) {
        const el = ensureContainer();
        if (!el) return;

        if (!msg.enableWorldObservatory) {
            el.classList.add('hidden');
            stopAutoObserve();
            return;
        }
        el.classList.remove('hidden');

        const turnLabel = document.getElementById('observatory-turn-label');
        if (turnLabel) {
            turnLabel.textContent = `T${msg.worldTurn ?? 0}`;
        }

        renderMarkets(msg.marketPriceHistory);
        renderChronicle(msg.chronicle);
        renderBondsGraph(msg.npcBonds);
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'worldView') {
            renderObservatory(msg);
        }
    });
})();

/* --- 89a-vehicle-labels.js --- */
// webview/modules/89a-vehicle-labels.js
// Shared display-only i18n helpers for Vehicle / Mobile Base panels (no disk writes).

(function () {
    function humanizeCode(code) {
        if (!code) { return '—'; }
        return String(code).replace(/_/g, ' ');
    }

    function enumLabel(group, code) {
        if (!code) { return '—'; }
        const key = `webview.vehicles.enum.${group}.${code}`;
        if (typeof T !== 'function') { return humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(code);
    }

    function accessReasonLabel(code) {
        if (!code || code === 'ok') { return ''; }
        const key = `webview.vehicles.accessReason.${code}`;
        if (typeof T !== 'function') { return humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(code);
    }

    function fuelBandLabel(band) {
        if (!band || band === 'ok') { return ''; }
        const key = `webview.vehicles.fuelBand.${band}`;
        if (typeof T !== 'function') { return band; }
        const translated = T(key);
        return translated && translated !== key ? translated : band;
    }

    function stockLabel(id) {
        if (!id) { return '—'; }
        const key = `webview.stock.${id}`;
        if (typeof T !== 'function') { return humanizeCode(id); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(id);
    }

    function joinLabels(codes, group) {
        if (!codes || !codes.length) { return ''; }
        return codes.map((c) => enumLabel(group, c)).join(', ');
    }

    function vehicleIdFromOverlayMarker(marker) {
        if (!marker || !marker.id) { return null; }
        const prefixes = [
            'vehicle_park_fallback_',
            'vehicle_settlement_park_',
            'vehicle_park_',
            'vehicle_',
        ];
        for (const prefix of prefixes) {
            if (marker.id.startsWith(prefix)) {
                return marker.id.slice(prefix.length);
            }
        }
        return null;
    }

    window.LR_vehicleLabels = {
        enumLabel,
        accessReasonLabel,
        fuelBandLabel,
        stockLabel,
        joinLabels,
        vehicleIdFromOverlayMarker,
        humanizeCode,
    };
})();

/* --- 89c-vehicle-intent-preview.js --- */
// webview/modules/89c-vehicle-intent-preview.js
// World Intent WI3a-1: Tier 1 read-only preview for the Vehicles tab (no disk writes).
//
// Pure function of fields already present in the `vehicleGarage` payload the host
// already sends (see docs/WORLD_INTENT_WI3A_PREVIEW_UI_DESIGN.md, Phase WI3a-1).
// This module does not call any WorldIntentCore host query/execute function and
// does not import any src/*.ts module. It re-derives only the payload-free subset
// of that taxonomy that can be answered from state already on screen.
// `move_vehicle` has no candidate destination here, so it is intentionally left as
// a "needs_input" pseudo-state rather than a real allowed/valid_noop verdict.

(function () {
    const PREVIEW_ACTIONS = ['set_active_vehicle', 'move_vehicle', 'repair_vehicle', 'refuel_vehicle'];

    function blockedRow(action, reasonKey) {
        return {
            action,
            statusClass: 'blocked',
            textKey: 'webview.vehicles.intentPreview.status.blockedPrefix',
            reasonKey,
        };
    }

    function computeRow(action, item, enableVehicleSystem) {
        if (enableVehicleSystem === false) {
            return blockedRow(action, 'webview.vehicles.intentPreview.reason.systemDisabled');
        }
        if (item.status === 'lost') {
            return blockedRow(action, 'webview.vehicles.intentPreview.reason.vehicleLost');
        }

        switch (action) {
            case 'set_active_vehicle':
                if (item.isActive) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyActive' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.availableActivate' };
            case 'move_vehicle':
                return { action, statusClass: 'needs_input', textKey: 'webview.vehicles.intentPreview.status.needsDestination' };
            case 'repair_vehicle':
                if (item.hp >= item.maxHp) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyMaxHp' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.repairable' };
            case 'refuel_vehicle':
                if (!item.powerType) {
                    return blockedRow(action, 'webview.vehicles.intentPreview.reason.noFuelTank');
                }
                if ((item.fuelCurrent ?? 0) >= (item.fuelMax ?? 0)) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyFull' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.refuelable' };
            default:
                return blockedRow(action, 'webview.vehicles.intentPreview.reason.systemDisabled');
        }
    }

    function computeRows(item, enableVehicleSystem) {
        if (!item) { return []; }
        return PREVIEW_ACTIONS.map((action) => computeRow(action, item, enableVehicleSystem));
    }

    window.LR_vehicleIntentPreview = {
        PREVIEW_ACTIONS,
        computeRows,
    };
})();

/* --- 89-vehicles.js --- */
// webview/modules/89-vehicles.js
// Vehicle System V4: read-only garage/dock/stable panel (no disk writes).

(function () {
    let selectedVehicleId = null;
    let _lastWorldMsg = null;

    const L = () => (window.LR_vehicleLabels || {
        enumLabel: (_g, c) => (c || '—'),
        accessReasonLabel: (c) => (c || ''),
        fuelBandLabel: (b) => (b && b !== 'ok' ? b : ''),
        joinLabels: (codes, g) => (codes || []).join(', '),
        humanizeCode: (c) => String(c || '').replace(/_/g, ' '),
    });

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pct(load, cap) {
        if (!cap || cap <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((load / cap) * 100)));
    }

    function fuelBandClass(band) {
        if (band === 'empty') return 'vehicle-fuel-empty';
        if (band === 'low') return 'vehicle-fuel-low';
        return 'vehicle-fuel-ok';
    }

    function renderBar(load, cap, label) {
        const p = pct(load, cap);
        return `
            <div class="vehicle-bar-row">
                <span class="vehicle-bar-label">${escapeHtml(label)}</span>
                <div class="vehicle-bar-track" role="presentation">
                    <div class="vehicle-bar-fill" style="width:${p}%"></div>
                </div>
                <span class="vehicle-bar-value">${escapeHtml(String(load))}/${escapeHtml(String(cap))}</span>
            </div>`;
    }

    function renderModuleChips(modules) {
        if (!modules || !modules.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.vehicles.noModules'))}</span>`;
        }
        return modules.map((mod) => {
            const cond = mod.condition
                ? ` (${L().enumLabel('moduleCondition', mod.condition)})`
                : '';
            return `<span class="vehicle-module-chip" title="${escapeHtml(mod.slot)}">${escapeHtml(mod.name)}${escapeHtml(cond)}</span>`;
        }).join('');
    }

    function renderListItem(item) {
        const active = item.isActive ? ' is-active' : '';
        const here = item.atCurrentLocation ? ' is-here' : '';
        const selected = item.id === selectedVehicleId ? ' is-selected' : '';
        const mobile = item.isMobileBase ? `<span class="vehicle-badge mobile-base">${escapeHtml(T('webview.vehicles.mobileBase'))}</span>` : '';
        const kind = L().enumLabel('kind', item.kind);
        const status = L().enumLabel('status', item.status);
        return `
            <button type="button" class="vehicle-list-item${active}${here}${selected}" data-vehicle-id="${escapeHtml(item.id)}">
                <span class="vehicle-list-name">${escapeHtml(item.name)}</span>
                ${mobile}
                <span class="vehicle-list-meta">${escapeHtml(kind)} · ${escapeHtml(status)} · ${escapeHtml(item.locationLabel)}</span>
            </button>`;
    }

    const INTENT_ACTION_LABEL_KEYS = {
        set_active_vehicle: 'webview.vehicles.intentPreview.action.setActive',
        move_vehicle: 'webview.vehicles.intentPreview.action.move',
        repair_vehicle: 'webview.vehicles.intentPreview.action.repair',
        refuel_vehicle: 'webview.vehicles.intentPreview.action.refuel',
    };

    function renderIntentPreview(item) {
        if (!item || typeof window.LR_vehicleIntentPreview?.computeRows !== 'function') {
            return '';
        }
        const enableVehicleSystem = _lastWorldMsg ? _lastWorldMsg.enableVehicleSystem === true : true;
        const rows = window.LR_vehicleIntentPreview.computeRows(item, enableVehicleSystem);
        if (!rows.length) { return ''; }

        const rowsHtml = rows.map((row) => {
            const actionLabel = T(INTENT_ACTION_LABEL_KEYS[row.action] || row.action);
            const statusText = row.reasonKey
                ? T(row.textKey, { reason: T(row.reasonKey) })
                : T(row.textKey);
            const srText = T('webview.vehicles.intentPreview.srStatusPrefix', { status: statusText });
            return `
                <div class="vehicle-intent-row" data-intent-status="${escapeHtml(row.statusClass)}">
                    <span class="vehicle-intent-dot" aria-hidden="true"></span>
                    <span class="vehicle-intent-sr-only">${escapeHtml(srText)}</span>
                    <span class="vehicle-intent-action">${escapeHtml(actionLabel)}</span>
                    <span class="vehicle-intent-status-text">${escapeHtml(statusText)}</span>
                </div>`;
        }).join('');

        return `
            <div class="vehicle-intent-preview" aria-label="${escapeHtml(T('webview.vehicles.intentPreview.ariaLabel'))}">
                <span class="vehicle-bar-label">${escapeHtml(T('webview.vehicles.intentPreview.title'))}</span>
                <div class="vehicle-intent-rows">${rowsHtml}</div>
            </div>`;
    }

    function hasMapMarkerForVehicle(vehicleId) {
        const markers = _lastWorldMsg?.mapOverlay?.markers;
        if (!vehicleId || !Array.isArray(markers)) { return false; }
        return markers.some((m) => {
            if (!m || !m.id) { return false; }
            return m.id === `vehicle_${vehicleId}`
                || m.id === `vehicle_park_${vehicleId}`
                || m.id === `vehicle_park_fallback_${vehicleId}`
                || m.id === `vehicle_settlement_park_${vehicleId}`;
        });
    }

    function renderDetail(item) {
        if (!item) {
            return `<p class="empty-text">${escapeHtml(T('webview.vehicles.selectHint'))}</p>`;
        }
        const warnings = [];
        if (item.accessReasonCode) {
            const reason = L().accessReasonLabel(item.accessReasonCode);
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.accessWarning'))}: ${escapeHtml(reason)}</div>`);
        }
        if (item.parkingFallbackId) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.parkingFallback'))}: ${escapeHtml(item.parkingFallbackId)}</div>`);
        }
        if (item.accessRestrictions && item.accessRestrictions.length) {
            const limits = L().joinLabels(item.accessRestrictions, 'blocker');
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.accessLimits'))}: ${escapeHtml(limits)}</div>`);
        }

        const fuelBandText = L().fuelBandLabel(item.fuelBand);
        const fuelLine = item.powerType
            ? `<div class="vehicle-stat-row ${fuelBandClass(item.fuelBand)}">
                <span>${escapeHtml(T('webview.vehicles.fuel'))}</span>
                <span>${escapeHtml(L().enumLabel('powerType', item.powerType))} ${escapeHtml(String(item.fuelCurrent ?? 0))}/${escapeHtml(String(item.fuelMax ?? 0))}${fuelBandText ? ` <span class="vehicle-fuel-band-label">${escapeHtml(fuelBandText)}</span>` : ''}</span>
               </div>`
            : '';

        const parking = item.parkingLabel
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.parking'))}</span><span>${escapeHtml(item.parkingLabel)}</span></div>`
            : '';

        const carried = item.carriedSummary
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.carrier'))}</span><span>${escapeHtml(item.carriedSummary)}</span></div>`
            : '';

        const showOnMap = hasMapMarkerForVehicle(item.id)
            ? `<button type="button" class="small-btn vehicle-show-on-map-btn" data-vehicle-id="${escapeHtml(item.id)}">${escapeHtml(T('webview.vehicles.showOnMap'))}</button>`
            : '';

        const sub = [
            L().enumLabel('kind', item.kind),
            L().enumLabel('sizeClass', item.sizeClass),
            L().enumLabel('status', item.status),
            item.locationLabel,
        ].filter(Boolean).join(' · ');

        const conditionLine = [
            L().enumLabel('condition', item.condition),
            `HP ${item.hp}/${item.maxHp}`,
            L().enumLabel('armorBand', item.armorBand),
        ].join(' · ');

        return `
            <div class="vehicle-detail-card">
                <div class="vehicle-detail-header">
                    <h4 class="vehicle-detail-title">${escapeHtml(item.name)}</h4>
                    ${item.isActive ? `<span class="vehicle-badge active">${escapeHtml(T('webview.vehicles.active'))}</span>` : ''}
                    ${item.isMobileBase ? `<span class="vehicle-badge mobile-base">${escapeHtml(T('webview.vehicles.mobileBase'))}</span>` : ''}
                </div>
                <div class="vehicle-detail-sub">${escapeHtml(sub)}</div>
                ${warnings.join('')}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.condition'))}</span><span>${escapeHtml(conditionLine)}</span></div>
                ${fuelLine}
                ${parking}
                ${carried}
                ${renderBar(item.cargoLoad, item.cargoCapacity, T('webview.vehicles.cargo'))}
                ${renderBar(item.crewRequired, item.crewCapacity, T('webview.vehicles.crew'))}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.passengers'))}</span><span>${escapeHtml(String(item.passengerCapacity))}</span></div>
                ${renderIntentPreview(item)}
                <div class="vehicle-modules-wrap">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.vehicles.modules'))}</span>
                    <div class="vehicle-module-list">${renderModuleChips(item.modules)}</div>
                </div>
                ${showOnMap ? `<div class="vehicle-detail-actions">${showOnMap}</div>` : ''}
            </div>`;
    }

    function wireListClicks(garage) {
        const list = document.getElementById('vehicles-list');
        if (!list) return;
        list.querySelectorAll('[data-vehicle-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedVehicleId = btn.getAttribute('data-vehicle-id');
                renderGarage(garage);
            });
        });
    }

    function wireDetailActions() {
        const detail = document.getElementById('vehicles-detail');
        if (!detail) return;
        detail.querySelectorAll('.vehicle-show-on-map-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-vehicle-id');
                if (id && typeof window.focusVehicleOnMap === 'function') {
                    window.focusVehicleOnMap(id);
                }
            });
        });
    }

    function renderGarage(garage) {
        const empty = document.getElementById('vehicles-empty');
        const content = document.getElementById('vehicles-content');
        const list = document.getElementById('vehicles-list');
        const detail = document.getElementById('vehicles-detail');
        const fleetMeta = document.getElementById('vehicles-fleet-meta');
        const warnings = document.getElementById('vehicles-warnings');
        if (!content || !list || !detail) return;

        if (!garage || !garage.vehicles || !garage.vehicles.length) {
            if (empty) empty.classList.remove('hidden');
            content.classList.add('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');
        content.classList.remove('hidden');

        if (!selectedVehicleId || !garage.vehicles.some((v) => v.id === selectedVehicleId)) {
            selectedVehicleId = garage.activeVehicleId || garage.vehicles[0].id;
        }

        if (fleetMeta) {
            const loc = garage.currentLocationLabel || garage.currentLocationId || '—';
            fleetMeta.textContent = T('webview.vehicles.fleetMeta', {
                count: String(garage.fleetCount),
                location: loc,
            });
        }

        if (warnings) {
            if (garage.warnings && garage.warnings.length) {
                warnings.classList.remove('hidden');
                warnings.setAttribute('aria-live', 'polite');
                warnings.textContent = `${T('webview.vehicles.fleetWarning')}: ${garage.warnings.join(' · ')}`;
            } else {
                warnings.classList.add('hidden');
                warnings.textContent = '';
            }
        }

        list.innerHTML = garage.vehicles.map(renderListItem).join('');
        const activeItem = garage.vehicles.find((v) => v.id === selectedVehicleId);
        detail.innerHTML = renderDetail(activeItem);
        wireListClicks(garage);
        wireDetailActions();

        const selectedBtn = list.querySelector(`[data-vehicle-id="${CSS.escape(selectedVehicleId)}"]`);
        if (selectedBtn) {
            selectedBtn.focus({ preventScroll: true });
        }
    }

    function setTabVisible(visible) {
        const tabBtn = document.getElementById('tab-btn-vehicles');
        if (!tabBtn) return;
        tabBtn.classList.toggle('hidden', !visible);
    }

    function renderFromWorldView(msg) {
        _lastWorldMsg = msg;
        const enabled = msg.enableVehicleSystem === true;
        setTabVisible(enabled);
        if (!enabled) {
            const pane = document.getElementById('pane-vehicles');
            if (pane && pane.classList.contains('active')) {
                const statusTab = document.querySelector('.tab-btn[data-target="pane-status"]');
                if (statusTab) statusTab.click();
            }
            return;
        }
        renderGarage(msg.vehicleGarage || null);
    }

    window.selectGarageVehicle = function selectGarageVehicle(vehicleId) {
        if (!vehicleId) { return; }
        selectedVehicleId = vehicleId;
        renderGarage(_lastWorldMsg?.vehicleGarage || null);
    };

    window.openVehicleFromMapMarker = function openVehicleFromMapMarker(vehicleId) {
        if (!vehicleId) { return; }
        if (typeof activateStatusPane === 'function') {
            activateStatusPane('pane-vehicles');
        } else {
            document.getElementById('tab-btn-vehicles')?.click();
        }
        window.selectGarageVehicle(vehicleId);
    };

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg && msg.type === 'worldView') {
            renderFromWorldView(msg);
        }
    });
})();

/* --- 89b-mobile-base-panel.js --- */
// webview/modules/89b-mobile-base-panel.js
// Mobile Base System MB4/MB5: read-only panel + Settlement interior view entry (no disk writes).
// Persistence channel: turn_result.mobileBaseOps (MB3 apply gate).

(function () {
    let _mbPanelWorldMsg = null;

    const L = () => (window.LR_vehicleLabels || {
        enumLabel: (_g, c) => (c || '—'),
        accessReasonLabel: (c) => (c || ''),
        fuelBandLabel: (b) => (b && b !== 'ok' ? b : ''),
        stockLabel: (id) => id,
        joinLabels: (codes, g) => (codes || []).join(', '),
        humanizeCode: (c) => String(c || '').replace(/_/g, ' '),
    });

    function mbLabel(group, code) {
        if (!code) { return '—'; }
        const key = `webview.mobileBase.enum.${group}.${code}`;
        if (typeof T !== 'function') { return L().humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : L().humanizeCode(code);
    }

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stockBandClass(band) {
        if (band === 'empty') return 'mb-stock-empty';
        if (band === 'low') return 'mb-stock-low';
        return 'mb-stock-ok';
    }

    function stockBandLabel(band) {
        if (band === 'empty') return T('webview.mobileBase.stockBand.empty');
        if (band === 'low') return T('webview.mobileBase.stockBand.low');
        return T('webview.mobileBase.stockBand.ok');
    }

    function fuelBandClass(band) {
        if (band === 'empty') return 'vehicle-fuel-empty';
        if (band === 'low') return 'vehicle-fuel-low';
        return 'vehicle-fuel-ok';
    }

    function renderFacilityRows(facilities) {
        if (!facilities || !facilities.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.mobileBase.noFacilities'))}</span>`;
        }
        return facilities.map((f) => (
            `<span class="mb-facility-chip status-${escapeHtml(f.status)}">${escapeHtml(f.name)}</span>`
        )).join('');
    }

    function openMobileBaseInteriorView(mapMode) {
        if (typeof activateStatusPane === 'function') {
            activateStatusPane('pane-world');
        } else {
            document.getElementById('tab-btn-world')?.click();
        }
        if (typeof setWorldMapMode === 'function') {
            setWorldMapMode(mapMode, { persist: true });
        }
    }

    function renderInteriorActions(interior) {
        if (!interior) {
            return '';
        }
        if (interior.interiorBlocked) {
            const reasonCode = interior.interiorBlockReason || interior.interiorAccess || 'blocked';
            const reason = mbLabel('interiorAccess', reasonCode);
            return `<p class="vehicle-warning mb-interior-blocked">${escapeHtml(T('webview.mobileBase.interiorBlocked'))}: ${escapeHtml(reason)}</p>`;
        }
        const buttons = [];
        if (interior.hasCanvas) {
            buttons.push(`<button type="button" class="small-btn mb-interior-btn" data-mb-view="settlement">${escapeHtml(T('webview.mobileBase.viewInteriorCanvas'))}</button>`);
        }
        if (interior.hasDiorama) {
            buttons.push(`<button type="button" class="small-btn mb-interior-btn" data-mb-view="diorama">${escapeHtml(T('webview.mobileBase.viewInteriorDiorama'))}</button>`);
        }
        if (!buttons.length) {
            return '';
        }
        return `<div class="mb-interior-actions">${buttons.join('')}</div>`;
    }

    function wireInteriorActionButtons(root) {
        root.querySelectorAll('.mb-interior-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mb-view');
                if (mode === 'settlement' || mode === 'diorama') {
                    openMobileBaseInteriorView(mode);
                }
            });
        });
    }

    function renderStockRows(stocks) {
        if (!stocks || !stocks.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.mobileBase.noStocks'))}</span>`;
        }
        return stocks.map((s) => (
            `<span class="mb-stock-chip ${stockBandClass(s.band)}">${escapeHtml(L().stockLabel(s.id))}: ${escapeHtml(stockBandLabel(s.band))}</span>`
        )).join('');
    }

    function renderLinkUnavailable() {
        return `<div class="mobile-base-panel-card mobile-base-unavailable">
            <p class="vehicle-warning">${escapeHtml(T('webview.mobileBase.linkUnavailable'))}</p>
        </div>`;
    }

    function renderMobileBasePanel(panel) {
        const section = document.getElementById('vehicles-mobile-base-section');
        const root = document.getElementById('vehicles-mobile-base-panel');
        if (!section || !root) return;

        if (!panel) {
            root.innerHTML = renderLinkUnavailable();
            return;
        }

        section.open = true;

        const warnings = [];
        if (panel.linkWarnings && panel.linkWarnings.length) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(panel.linkWarnings.join(' · '))}</div>`);
        }
        if (panel.accessReasonCode) {
            const reason = L().accessReasonLabel(panel.accessReasonCode);
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.access'))}: ${escapeHtml(reason)}</div>`);
        }
        if (panel.parkingFallbackId) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.parkingFallback'))}: ${escapeHtml(panel.parkingFallbackId)}</div>`);
        }
        if (panel.exteriorLimits && panel.exteriorLimits.length) {
            const limits = L().joinLabels(panel.exteriorLimits, 'blocker');
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.exteriorLimits'))}: ${escapeHtml(limits)}</div>`);
        }

        const hereBadge = panel.atCurrentLocation
            ? `<span class="vehicle-badge active">${escapeHtml(T('webview.mobileBase.atPartyLocation'))}</span>`
            : '';

        const fuelBandText = L().fuelBandLabel(panel.fuelBand);
        const fuelLine = panel.powerType
            ? `<div class="vehicle-stat-row ${fuelBandClass(panel.fuelBand)}">
                <span>${escapeHtml(T('webview.mobileBase.power'))}</span>
                <span>${escapeHtml(L().enumLabel('powerType', panel.powerType))} ${escapeHtml(String(panel.fuelCurrent ?? 0))}/${escapeHtml(String(panel.fuelMax ?? 0))}${fuelBandText ? ` <span class="vehicle-fuel-band-label">${escapeHtml(fuelBandText)}</span>` : ''}</span>
               </div>`
            : '';

        const hangar = panel.hangarSummary
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.hangar'))}</span><span>${escapeHtml(panel.hangarSummary)}</span></div>`
            : '';

        const community = typeof panel.communityCount === 'number'
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.community'))}</span><span>${escapeHtml(String(panel.communityCount))}</span></div>`
            : '';

        const interior = panel.interiorAccess
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.interiorAccess'))}</span><span>${escapeHtml(mbLabel('interiorAccess', panel.interiorAccess))}</span></div>`
            : '';

        const problems = panel.problems && panel.problems.length
            ? `<div class="mb-problems"><span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.concerns'))}</span><ul>${panel.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
            : '';

        const interiorActions = renderInteriorActions(_mbPanelWorldMsg ? _mbPanelWorldMsg.mobileBaseInterior : null);

        const sub = [
            panel.vehicleName,
            mbLabel('mode', panel.mode),
            mbLabel('layoutProfile', panel.layoutProfile),
            panel.dockLabel,
        ].filter(Boolean).join(' · ');

        const conditionParts = [
            L().enumLabel('condition', panel.condition),
            `HP ${panel.hp}/${panel.maxHp}`,
            L().enumLabel('armorBand', panel.armorBand),
        ];
        if (panel.threatBand) {
            conditionParts.push(L().enumLabel('threatBand', panel.threatBand));
        }

        root.innerHTML = `
            <div class="mobile-base-panel-card">
                <div class="vehicle-detail-header">
                    <h4 class="vehicle-detail-title">${escapeHtml(panel.settlementName)}</h4>
                    ${hereBadge}
                </div>
                <div class="vehicle-detail-sub">${escapeHtml(sub)}</div>
                <p class="vehicle-garage-hint">${escapeHtml(T('webview.mobileBase.hint'))}</p>
                ${warnings.join('')}
                ${interior}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.condition'))}</span><span>${escapeHtml(conditionParts.join(' · '))}</span></div>
                ${fuelLine}
                ${hangar}
                ${community}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.crew'))}</span><span>${escapeHtml(String(panel.crewRequired))}/${escapeHtml(String(panel.crewCapacity))}</span></div>
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.passengers'))}</span><span>${escapeHtml(String(panel.passengerCapacity))}</span></div>
                <div class="mb-section">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.facilities'))}</span>
                    <div class="mb-chip-row">${renderFacilityRows(panel.facilities)}</div>
                </div>
                <div class="mb-section">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.stocks'))}</span>
                    <div class="mb-chip-row">${renderStockRows(panel.stocks)}</div>
                </div>
                ${problems}
                ${interiorActions}
            </div>`;
        wireInteriorActionButtons(root);
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'worldView') { return; }
        _mbPanelWorldMsg = msg;
        const section = document.getElementById('vehicles-mobile-base-section');
        if (!section) { return; }
        if (msg.enableMobileBaseSystem === true) {
            section.classList.remove('hidden');
            renderMobileBasePanel(msg.mobileBasePanel || null);
        } else {
            section.classList.add('hidden');
            const root = document.getElementById('vehicles-mobile-base-panel');
            if (root) { root.innerHTML = ''; }
        }
    });
})();

/* --- 90-bootstrap.js --- */
// ===== Initialization =====
function updateRelayToggleButton(enabled) {
  const relayToggleBtn = document.getElementById('relay-toggle-btn');
  if (!relayToggleBtn) return;
  relayToggleBtn.classList.toggle('active', !!enabled);
  // i18nStrings is populated asynchronously by the 'localeBundle' message, which
  // can arrive after DOMContentLoaded; skip the text/title write until it has
  // loaded so the button keeps its static HTML label instead of a raw i18n key.
  if (typeof i18nStrings !== 'undefined' && Object.keys(i18nStrings).length > 0) {
    relayToggleBtn.textContent = enabled ? T('webview.relay.toggle.on') : T('webview.relay.toggle.off');
    relayToggleBtn.title = T('webview.relay.toggle.title');
  }
  if (typeof relayToggleBtn.setAttribute === 'function') {
    relayToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
}

let isResizingBanner = false;
let bannerStartY = 0;
let bannerStartHeight = 0;
// Session-only memory of the last valid expanded height, kept even after the
// banner collapses (or Relay is toggled off/on) so the explicit expand
// control can restore it instead of falling back to the natural default.
// Intentionally not persisted under a second localStorage key -- see
// HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001 report for the single-key rationale.
let relayBannerLastExpandedHeight = null;

// ===== Relay banner collapse/expand state =====
const RELAY_BANNER_STORAGE_KEY = 'lorerelay.relayBannerHeight';
// Heights below this normalize to the explicit collapsed strip; this is also
// the safe expanded minimum (an "expanded" banner is never shorter than this).
const RELAY_BANNER_COLLAPSE_THRESHOLD = 20;
const RELAY_BANNER_VIEWPORT_MAX_RATIO = 0.5;
// Used only when window.innerHeight is unavailable (e.g. a non-browser harness).
const RELAY_BANNER_FALLBACK_VIEWPORT_HEIGHT = 600;

/** Safe expanded maximum for the current viewport; floored at the collapse threshold so a
 * tiny viewport can never produce an inverted (max < min) clamp range. */
function relayBannerViewportMax() {
  const vh = (typeof window !== 'undefined' && typeof window.innerHeight === 'number' && window.innerHeight > 0)
    ? window.innerHeight
    : RELAY_BANNER_FALLBACK_VIEWPORT_HEIGHT;
  return Math.max(RELAY_BANNER_COLLAPSE_THRESHOLD, vh * RELAY_BANNER_VIEWPORT_MAX_RATIO);
}

/**
 * Normalizes a raw localStorage value (string|null|undefined) into a safe banner
 * preference. Pure and DOM-free so it is directly unit-testable.
 * Returns { collapsed: boolean, height: number|null } -- height is null for the
 * natural/default expanded height (no inline height should be applied).
 */
function normalizeRelayBannerHeight(raw, viewportMax) {
  const max = (typeof viewportMax === 'number' && viewportMax > 0) ? viewportMax : relayBannerViewportMax();
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { collapsed: false, height: null };
  }
  const h = parseFloat(raw);
  // Number.isFinite rejects NaN and +/-Infinity in one check; negative values
  // and non-numeric/whitespace strings (parseFloat -> NaN) are also covered.
  if (!Number.isFinite(h) || h < 0) {
    return { collapsed: false, height: null };
  }
  if (h < RELAY_BANNER_COLLAPSE_THRESHOLD) {
    return { collapsed: true, height: 0 };
  }
  return { collapsed: false, height: Math.min(h, max) };
}

function readRelayBannerPreference() {
  let raw = null;
  try {
    raw = localStorage.getItem(RELAY_BANNER_STORAGE_KEY);
  } catch (e) {
    raw = null;
  }
  return normalizeRelayBannerHeight(raw, relayBannerViewportMax());
}

function relayBannerCollapsedInDom(content) {
  return !content || content.style.display === 'none';
}

function setRelayBannerCollapsed(content) {
  if (!content) { return; }
  content.style.display = 'none';
  content.style.height = '0px';
}

function setRelayBannerExpanded(content, height) {
  if (!content) { return; }
  content.style.display = '';
  content.style.height = (typeof height === 'number' && height > 0) ? `${height}px` : '';
}

/** Snapshots the current expanded height before a collapse so the explicit
 * expand control can restore it later in this session. */
function rememberRelayBannerHeightIfValid(content) {
  if (!content || relayBannerCollapsedInDom(content)) { return; }
  const rect = typeof content.getBoundingClientRect === 'function' ? content.getBoundingClientRect() : null;
  const height = rect && typeof rect.height === 'number' ? rect.height : NaN;
  if (Number.isFinite(height) && height >= RELAY_BANNER_COLLAPSE_THRESHOLD) {
    relayBannerLastExpandedHeight = height;
  }
}

function persistRelayBannerHeight(content) {
  if (!content) { return; }
  try {
    if (relayBannerCollapsedInDom(content)) {
      localStorage.setItem(RELAY_BANNER_STORAGE_KEY, '0');
    } else {
      const rect = typeof content.getBoundingClientRect === 'function' ? content.getBoundingClientRect() : null;
      const height = rect && typeof rect.height === 'number' ? rect.height : 0;
      localStorage.setItem(RELAY_BANNER_STORAGE_KEY, String(height));
    }
  } catch (e) { /* ignore persistence failures (e.g. storage disabled) */ }
}

/** Applies the persisted preference to a freshly created banner and seeds the
 * in-session "last expanded height" memory so an immediate collapse -> expand
 * cycle restores it instead of jumping to the natural default. */
function applyRelayBannerPreference(content) {
  if (!content) { return; }
  const pref = readRelayBannerPreference();
  if (pref.collapsed) {
    setRelayBannerCollapsed(content);
  } else {
    setRelayBannerExpanded(content, pref.height);
    if (typeof pref.height === 'number') {
      relayBannerLastExpandedHeight = pref.height;
    }
  }
}

// The collapse/expand control and header label are created entirely in JS (no
// static HTML fallback exists for them, unlike #relay-toggle-btn). If
// i18nStrings has not loaded yet, an English fallback is used instead of
// skipping the write -- skipping would leave the control blank/unlabeled,
// which is worse than a briefly-English label that self-corrects once
// 'localeBundle' arrives and calls updateRelayBannerI18n() again.
const RELAY_BANNER_FALLBACK_STRINGS = {
  active: 'Antigravity Relay ON',
  expand: 'Show details',
  collapse: 'Hide details',
  resetTitle: 'Double-click to reset banner height',
};

function relayBannerText(key, fallback) {
  if (typeof i18nStrings !== 'undefined' && Object.keys(i18nStrings).length > 0) {
    return T(key);
  }
  return fallback;
}

/** Refreshes the collapse/expand control's localized text and aria-expanded
 * state from the banner's current DOM state. Safe to call at any time
 * (banner creation, toggle, drag, dblclick reset, and locale change). */
function updateRelayBannerI18n() {
  const label = document.getElementById('relay-banner-header-label');
  const toggleBtn = document.getElementById('relay-banner-toggle-btn');
  const content = document.getElementById('relay-mode-banner-content');
  const sash = document.getElementById('relay-banner-sash');
  if (label) {
    label.textContent = relayBannerText('webview.relay.toggle.on', RELAY_BANNER_FALLBACK_STRINGS.active);
  }
  const collapsed = relayBannerCollapsedInDom(content);
  if (toggleBtn) {
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const text = collapsed
      ? relayBannerText('webview.relay.banner.expand', RELAY_BANNER_FALLBACK_STRINGS.expand)
      : relayBannerText('webview.relay.banner.collapse', RELAY_BANNER_FALLBACK_STRINGS.collapse);
    toggleBtn.textContent = text;
    toggleBtn.title = text;
  }
  if (sash) {
    sash.title = relayBannerText('webview.relay.banner.resetTitle', RELAY_BANNER_FALLBACK_STRINGS.resetTitle);
  }
}

/** Click/keyboard handler for the explicit collapse/expand control. */
function toggleRelayBannerCollapsed() {
  const content = document.getElementById('relay-mode-banner-content');
  if (!content) { return; }
  if (relayBannerCollapsedInDom(content)) {
    setRelayBannerExpanded(content, relayBannerLastExpandedHeight);
  } else {
    rememberRelayBannerHeightIfValid(content);
    setRelayBannerCollapsed(content);
  }
  persistRelayBannerHeight(content);
  updateRelayBannerI18n();
}

window.addEventListener('DOMContentLoaded', () => {
  // 保存された状態を復元
  const savedState = vscode.getState();
  if (savedState) {
    messageHistory = savedState.messageHistory || [];
    // Migrate old string[] gallery format to GalleryEntry[] object format
    galleryImages = (savedState.galleryImages || []).map(item =>
      typeof item === 'string' ? { src: item } : item
    );
    currentTheme = savedState.currentTheme || 'fantasy';
    renderAllMessages();
    renderGallery();
    setTheme(currentTheme);
    if (savedState.draftText && freeInput) {
      freeInput.value = savedState.draftText;
      autoGrowFreeInput();
    }
    const noteEl = document.getElementById('authors-note-input');
    if (savedState.authorsNoteText && noteEl) {
      noteEl.value = savedState.authorsNoteText;
    }
  }

  // extension に状態リクエスト
  vscode.postMessage({ type: 'requestState' });
  vscode.postMessage({ type: 'getRemotePlayStatus' });

  // 入力の変更時に状態を自動保存
  if (freeInput) {
    freeInput.addEventListener('input', saveState);
  }
  const noteEl = document.getElementById('authors-note-input');
  if (noteEl) {
    noteEl.addEventListener('input', saveState);
  }

  const sel = localeSelect();
  if (sel) {
    sel.addEventListener('change', () => {
      vscode.postMessage({ type: 'setLocale', locale: sel.value });
    });
  }

  const relayToggleBtn = document.getElementById('relay-toggle-btn');
  if (relayToggleBtn) {
    relayToggleBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'setAntigravityRelayMode', enabled: !window.antigravityRelayMode });
    });
    updateRelayToggleButton(!!window.antigravityRelayMode);
  }

  if (savedState && messageHistory.length > 0) {
    welcomeShown = true;
  }

  // ===== TTS (Voice Narration) Initialization =====
  const ttsToggleBtn = document.getElementById('tts-toggle-btn');
  const ttsMenu = document.getElementById('tts-menu');
  const ttsEnabledCb = document.getElementById('tts-enabled-cb');
  const ttsSpeedSlider = document.getElementById('tts-speed-slider');
  const ttsVolumeSlider = document.getElementById('tts-volume-slider');
  const ttsSpeedVal = document.getElementById('tts-speed-val');
  const ttsVolumeVal = document.getElementById('tts-volume-val');

  if (savedState) {
    ttsEnabled = savedState.ttsEnabled || false;
    ttsSpeed = typeof savedState.ttsSpeed === 'number' ? savedState.ttsSpeed : 1.0;
    ttsVolume = typeof savedState.ttsVolume === 'number' ? savedState.ttsVolume : 0.8;
  }

  if (ttsEnabledCb && ttsToggleBtn) {
    ttsEnabledCb.checked = ttsEnabled;
    ttsToggleBtn.classList.toggle('active', ttsEnabled);
  }
  if (ttsSpeedSlider && ttsSpeedVal) {
    ttsSpeedSlider.value = ttsSpeed;
    ttsSpeedVal.textContent = ttsSpeed.toFixed(1) + 'x';
  }
  if (ttsVolumeSlider && ttsVolumeVal) {
    ttsVolumeSlider.value = ttsVolume;
    ttsVolumeVal.textContent = Math.round(ttsVolume * 100) + '%';
  }

  if (ttsToggleBtn && ttsMenu) {
    ttsToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      ttsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!ttsMenu.classList.contains('hidden') && !ttsMenu.contains(e.target) && e.target !== ttsToggleBtn) {
        ttsMenu.classList.add('hidden');
      }
    });
  }

  if (ttsEnabledCb && ttsToggleBtn) {
    ttsEnabledCb.addEventListener('change', () => {
      ttsEnabled = ttsEnabledCb.checked;
      ttsToggleBtn.classList.toggle('active', ttsEnabled);
      if (!ttsEnabled) {
        window.speechSynthesis?.cancel();
      }
      saveState();
    });
  }

  if (ttsSpeedSlider && ttsSpeedVal) {
    ttsSpeedSlider.addEventListener('input', () => {
      ttsSpeed = parseFloat(ttsSpeedSlider.value);
      ttsSpeedVal.textContent = ttsSpeed.toFixed(1) + 'x';
      saveState();
    });
  }

  if (ttsVolumeSlider && ttsVolumeVal) {
    ttsVolumeSlider.addEventListener('input', () => {
      ttsVolume = parseFloat(ttsVolumeSlider.value);
      ttsVolumeVal.textContent = Math.round(ttsVolume * 100) + '%';
      saveState();
    });
  }

  // ===== Start Hub (空ワークスペース時の導線) =====
  initStartHub();
});

const START_HUB_PRESETS = {
  beginnerFantasy: '初心者向けの、危険度低めの牧歌的ファンタジー世界。',
  postApocalypse: '文明が崩壊した後のポストアポカリプス世界。生存と探索が中心。',
  cyberpunk: '巨大企業が支配するネオンきらめくサイバーパンク都市。',
  urbanFantasy: '現代日本を舞台にした、隠された異能・怪異が存在する世界。',
  freeform: ''
};

let selectedStartHubPreset = '';
let startHubForcedVisible = false;

function openStartHubHome() {
  if (messageHistory.length === 0) return;
  startHubForcedVisible = true;
  updateStartHubVisibility();
}

function resumeCurrentSession() {
  startHubForcedVisible = false;
  updateStartHubVisibility();
}

/** Empty state shows Start Hub by default; active sessions can also reopen it without clearing progress. */
function updateStartHubVisibility() {
  const hub = document.getElementById('start-hub');
  const homeBtn = document.getElementById('start-hub-home-btn');
  const resumeRow = document.getElementById('start-hub-resume-row');
  if (!hub || !chatLog) return;
  const hasHistory = messageHistory.length > 0;
  const showHub = !hasHistory || startHubForcedVisible;
  hub.classList.toggle('hidden', !showHub);
  chatLog.classList.toggle('hidden', showHub);
  if (homeBtn) {
    homeBtn.classList.toggle('hidden', !hasHistory || showHub);
  }
  if (resumeRow) {
    resumeRow.classList.toggle('hidden', !hasHistory || !showHub);
  }
}

function applyExperienceProfile(profile) {
  experienceProfile = profile === 'parlor' || profile === 'inworld' ? profile : 'campaign';
  document.body.classList.toggle('profile-parlor', experienceProfile === 'parlor');
  document.body.classList.toggle('profile-inworld', experienceProfile === 'inworld');
  document.body.classList.toggle('profile-campaign', experienceProfile === 'campaign');
  if (typeof window.setParlorSettingsPanelAvailability === 'function') {
    window.setParlorSettingsPanelAvailability(experienceProfile === 'parlor');
  }
  if (typeof window.syncStatusTabsForExperienceProfile === 'function') {
    window.syncStatusTabsForExperienceProfile(experienceProfile);
  }
  const profileBtn = document.getElementById('experience-profile-btn');
  if (profileBtn) {
    profileBtn.textContent = experienceProfile === 'parlor' ? '🎭' : (experienceProfile === 'inworld' ? '🌐' : '⚔️');
    profileBtn.title = experienceProfile === 'parlor'
      ? (T('webview.parlor.modeLabel') || 'Parlor')
      : (experienceProfile === 'inworld'
        ? (T('webview.inWorld.modeLabel') || 'In-World Chat')
        : (T('webview.campaign.modeLabel') || 'Campaign'));
  }
}

function applyParlorSession(msg) {
  if (!Array.isArray(msg.entries)) return;
  startHubForcedVisible = false;
  messageHistory = msg.entries.map((e) => ({
    id: e.id,
    role: e.role,
    sender: e.sender,
    content: e.content,
  }));
  chatLog.innerHTML = '';
  messageHistory.forEach((entry) => renderMessage(entry));
  updateStartHubVisibility();
  saveState();
}

function initStartHub() {
  const parlorBtn = document.getElementById('start-hub-parlor-btn');
  const inWorldBtn = document.getElementById('start-hub-inworld-btn');
  const demoBtn = document.getElementById('start-hub-demo-btn');
  const tradingDemoBtn = document.getElementById('start-hub-trading-demo-btn');
  const mapDemoBtn = document.getElementById('start-hub-map-demo-btn');
  const debugBtn = document.getElementById('start-hub-debug-btn');
  const scavengerDemoBtn = document.getElementById('start-hub-scavenger-demo-btn');
  const quickBtn = document.getElementById('start-hub-quick-btn');
  const interviewBtn = document.getElementById('start-hub-interview-btn');
  const presetsWrap = document.getElementById('start-hub-presets');
  const charNewBtn = document.getElementById('start-hub-char-new-btn');
  const charImportBtn = document.getElementById('start-hub-char-import-btn');
  const homeBtn = document.getElementById('start-hub-home-btn');
  const resumeBtn = document.getElementById('start-hub-resume-btn');

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      openStartHubHome();
    });
  }

  if (resumeBtn) {
    resumeBtn.addEventListener('click', () => {
      resumeCurrentSession();
    });
  }

  if (parlorBtn) {
    parlorBtn.addEventListener('click', () => {
      resumeCurrentSession();
      if (!parlorHasCharacter) {
        vscode.postMessage({ type: 'importTavernCard' });
        return;
      }
      vscode.postMessage({ type: 'startParlor' });
    });
  }

  if (inWorldBtn) {
    inWorldBtn.addEventListener('click', () => {
      resumeCurrentSession();
      if (!parlorHasCharacter) {
        vscode.postMessage({ type: 'importTavernCard' });
        return;
      }
      vscode.postMessage({ type: 'startInWorld' });
    });
  }

  const profileBtn = document.getElementById('experience-profile-btn');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      if (document.getElementById('gm-loading')) {
        return;
      }
      const next = experienceProfile === 'campaign'
        ? 'parlor'
        : (experienceProfile === 'parlor' ? 'inworld' : 'campaign');
      if ((next === 'parlor' || next === 'inworld') && !parlorHasCharacter) {
        vscode.postMessage({ type: 'importTavernCard' });
        return;
      }
      vscode.postMessage({ type: 'switchExperienceProfile', profile: next });
    });
  }

  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      resumeCurrentSession();
      vscode.postMessage({ type: 'loadBundledScenario', sampleId: 'harbor-mist' });
    });
  }
  if (tradingDemoBtn) {
    tradingDemoBtn.addEventListener('click', () => {
      resumeCurrentSession();
      vscode.postMessage({ type: 'loadBundledScenario', sampleId: 'trade-routes' });
    });
  }
  if (mapDemoBtn) {
    mapDemoBtn.addEventListener('click', () => {
      resumeCurrentSession();
      vscode.postMessage({ type: 'loadBundledScenario', sampleId: 'lost-catacombs' });
    });
  }
  if (debugBtn) {
    debugBtn.addEventListener('click', () => {
      resumeCurrentSession();
      vscode.postMessage({ type: 'loadBundledScenario', sampleId: 'debug-sandbox' });
    });
  }
  if (scavengerDemoBtn) {
    scavengerDemoBtn.addEventListener('click', () => {
      resumeCurrentSession();
      vscode.postMessage({ type: 'loadBundledScenario', sampleId: 'scrapbound-settlement' });
    });
  }

  if (presetsWrap) {
    presetsWrap.querySelectorAll('.start-hub-preset-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const key = chip.dataset.preset || '';
        const alreadyActive = chip.classList.contains('active');
        presetsWrap.querySelectorAll('.start-hub-preset-chip').forEach((c) => c.classList.remove('active'));
        if (alreadyActive) {
          selectedStartHubPreset = '';
        } else {
          chip.classList.add('active');
          selectedStartHubPreset = key;
        }
      });
    });
  }

  if (quickBtn) {
    quickBtn.addEventListener('click', () => {
      resumeCurrentSession();
      const presetText = START_HUB_PRESETS[selectedStartHubPreset] || '';
      const promptField = document.getElementById('quickstart-prompt');
      if (promptField && presetText) {
        promptField.value = presetText;
      }
      window.LoreRelay?.openQuickstart?.();
    });
  }

  if (interviewBtn) {
    interviewBtn.addEventListener('click', () => {
      resumeCurrentSession();
      const presetText = START_HUB_PRESETS[selectedStartHubPreset] || '';
      const template = presetText
        ? T('webview.startHub.interviewTemplateWithPreset', { preset: presetText })
        : T('webview.startHub.interviewTemplate');
      if (freeInput) {
        freeInput.value = template;
        autoGrowFreeInput();
        freeInput.focus();
        if (typeof freeInput.setSelectionRange === 'function') {
          const end = freeInput.value.length;
          freeInput.setSelectionRange(end, end);
        }
      }
    });
  }

  if (charNewBtn) {
    charNewBtn.addEventListener('click', () => {
      window.openCharacterCreator?.(null);
    });
  }

  if (charImportBtn) {
    charImportBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'importTavernCard' });
    });
  }

  updateStartHubVisibility();
}

// ===== Extension → Webview メッセージ受信 =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'gameStateUpdate') {
    if (!shouldApplyGameStateUpdate(msg)) {
      return;
    }
    if (msg.state) {
      applyGameState(msg.state, msg.fullHistory);
    }
  } else if (msg.type === 'imageGenStart') {
    showImageLoading();
  } else if (msg.type === 'imageGenEnd') {
    hideImageLoading(msg.success);
  } else if (msg.type === 'mediaTrigger') {
    if (msg.bgm) { playBgmById(msg.bgm); }
    else if (msg.mood) { playBgmByMood(msg.mood); }
    if (msg.sfx) {
      const ids = Array.isArray(msg.sfx) ? msg.sfx : [msg.sfx];
      ids.forEach((id) => playSfx(id));
    }
  } else if (msg.type === 'turnResult') {
    if (window.antigravityRelayMode) {
      hideGmLoading(true);
    }
    setBgmManifest(msg.tracks, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'sfxManifest') {
    setSfxManifest(msg.sounds, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'gmStart' || msg.type === 'grokStart') {
    showGmLoading();
  } else if (msg.type === 'gmEnd' || msg.type === 'grokEnd') {
    hideGmLoading(msg.success);
  } else if (msg.type === 'playerInputBusy') {
    // A duplicate gameplay message must not unlock the accepted request.
    // A competing non-gameplay mutation rejection clears this attempt's row.
    if (msg.owner?.actionKind !== 'gameplay_request') {
      hideGmLoading(true);
    }
  } else if (msg.type === 'relayModeStatus') {
    window.antigravityRelayMode = msg.antigravityRelayMode;
    updateRelayToggleButton(window.antigravityRelayMode);
    const sBtn = document.getElementById('send-btn');
    if (sBtn) {
      sBtn.textContent = window.antigravityRelayMode ? T('webview.relay.button.prepare') : T('webview.button.send');
    }
    
    // Role clarification / suppression
    let relayBanner = document.getElementById('relay-mode-banner');
    if (window.antigravityRelayMode) {
      document.body.classList.add('relay-mode-active');
      if (!relayBanner) {
        relayBanner = document.createElement('div');
        relayBanner.id = 'relay-mode-banner';

        // Always-visible header: active-label + explicit collapse/expand
        // control. This is what a persisted collapsed banner renders as, so
        // it is never a blank/near-invisible region (HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001).
        const bannerHeader = document.createElement('div');
        bannerHeader.id = 'relay-banner-header';

        const bannerHeaderLabel = document.createElement('span');
        bannerHeaderLabel.id = 'relay-banner-header-label';
        bannerHeader.appendChild(bannerHeaderLabel);

        const bannerToggleBtn = document.createElement('button');
        bannerToggleBtn.type = 'button';
        bannerToggleBtn.id = 'relay-banner-toggle-btn';
        bannerToggleBtn.setAttribute('aria-controls', 'relay-mode-banner-content');
        bannerToggleBtn.addEventListener('click', () => {
          toggleRelayBannerCollapsed();
        });
        bannerToggleBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleRelayBannerCollapsed();
          }
        });
        bannerHeader.appendChild(bannerToggleBtn);

        relayBanner.appendChild(bannerHeader);

        const bannerContent = document.createElement('div');
        bannerContent.id = 'relay-mode-banner-content';

        const bannerText = document.createElement('div');
        bannerText.textContent = T('webview.relay.banner.active');
        const bannerStatus = document.createElement('div');
        bannerStatus.setAttribute('data-relay-status', 'true');
        bannerStatus.className = 'relay-mode-status';

        bannerContent.appendChild(bannerText);
        bannerContent.appendChild(bannerStatus);
        relayBanner.appendChild(bannerContent);

        const bannerSash = document.createElement('div');
        bannerSash.id = 'relay-banner-sash';
        bannerSash.addEventListener('mousedown', (e) => {
          isResizingBanner = true;
          bannerStartY = e.clientY;
          const content = document.getElementById('relay-mode-banner-content');
          bannerStartHeight = relayBannerCollapsedInDom(content) ? 0 : content.getBoundingClientRect().height;
          bannerSash.classList.add('dragging');
          document.body.style.cursor = 'row-resize';
          document.body.style.userSelect = 'none';
        });

        // Retained as a secondary shortcut alongside the explicit header
        // control (double-click is no longer the only discoverable recovery
        // path -- HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001).
        bannerSash.addEventListener('dblclick', () => {
          const content = document.getElementById('relay-mode-banner-content');
          if (content) {
            setRelayBannerExpanded(content, null);
            localStorage.removeItem(RELAY_BANNER_STORAGE_KEY);
            relayBannerLastExpandedHeight = null;
            updateRelayBannerI18n();
          }
        });

        relayBanner.appendChild(bannerSash);

        document.body.insertBefore(relayBanner, document.body.firstChild);

        applyRelayBannerPreference(bannerContent);
        updateRelayBannerI18n();
      }
    } else {
      document.body.classList.remove('relay-mode-active');
      if (relayBanner) {
        relayBanner.remove();
      }
    }
    if (!window.antigravityRelayMode) {
      const loading = document.getElementById('gm-loading');
      if (loading && loading.classList && loading.classList.contains('relay-waiting')) {
        hideGmLoading(true);
      }
      if (typeof setRelayUiState === 'function') {
        setRelayUiState('idle');
      }
    } else if (typeof setRelayUiState === 'function') {
      setRelayUiState(relayUiState === 'pending' ? 'pending' : 'idle');
    }

    const controlsToHide = [
      'img-btn', 'mic-btn', 'undo-btn', 'regen-btn',
      'qr-undo', 'qr-retry', 'experience-profile-btn', 'parlor-settings-btn'
    ];
    controlsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = window.antigravityRelayMode ? 'none' : '';
      }
    });

  } else if (msg.type === 'relayWaitingStateStart') {
    if (typeof showRelayWaitingState === 'function') {
      showRelayWaitingState();
    }
  } else if (msg.type === 'relayWaitingStateDone') {
    if (typeof hideGmLoading === 'function') {
      hideGmLoading(true);
    }
    if (typeof setRelayUiState === 'function') {
      setRelayUiState('idle');
    }
  } else if (msg.type === 'relayWaitingStateError') {
    if (typeof showRelayWaitingError === 'function') {
      showRelayWaitingError(msg.reason);
    } else {
      hideGmLoading(false);
    }
  } else if (msg.type === 'oocMessage') {
    const oocLog = document.getElementById('ooc-log');
    if (oocLog) {
      const emptyEl = oocLog.querySelector('.empty-text');
      if (emptyEl) emptyEl.style.display = 'none';
      const div = document.createElement('div');
      div.className = 'ooc-entry';
      div.style.marginBottom = '8px';
      div.style.paddingBottom = '8px';
      div.style.borderBottom = '1px solid var(--vscode-panel-border)';
      div.textContent = msg.text;
      oocLog.appendChild(div);
      oocLog.scrollTop = oocLog.scrollHeight;
    }
  } else if (msg.type === 'characterList') {
    parlorHasCharacter = Array.isArray(msg.characters) && msg.characters.length > 0;
    const parlorHubBtn = document.getElementById('start-hub-parlor-btn');
    const inWorldHubBtn = document.getElementById('start-hub-inworld-btn');
    if (parlorHubBtn) {
      parlorHubBtn.disabled = !parlorHasCharacter;
      parlorHubBtn.classList.toggle('start-hub-btn-disabled', !parlorHasCharacter);
    }
    if (inWorldHubBtn) {
      inWorldHubBtn.disabled = !parlorHasCharacter;
      inWorldHubBtn.classList.toggle('start-hub-btn-disabled', !parlorHasCharacter);
    }
    updateCharacterList(msg.characters, msg.activeCharacterId, msg.partyIds);
  } else if (msg.type === 'summaryUpdated') {
    if (msg.summary !== undefined) {
      document.getElementById('story-summary').value = msg.summary || '';
    }
    resetSummarizeButton();
  } else if (msg.type === 'sagaArchived') {
    resetArchiveButton();
    hideArchiveSuggest();
  } else if (msg.type === 'archiveSuggest') {
    showArchiveSuggest(msg.count, msg.threshold, msg.tier);
  } else if (msg.type === 'checkpointList') {
    checkpointMetas = msg.checkpoints || [];
    rewindTargets = msg.rewindTargets || [];
    renderCheckpointUi();
  } else if (msg.type === 'updateEntry') {
    applyEntryPatch(msg.entry);
  } else if (msg.type === 'entryEdited') {
    const msgDiv = document.getElementById(`msg-${msg.id}`);
    if (msgDiv) {
      const bodyEl = msgDiv.querySelector('.msg-body');
      if (bodyEl) { bodyEl.textContent = msg.content; }
    }
    const entry = messageHistory.find((m) => m.id === msg.id);
    if (entry) { entry.content = msg.content; }
    saveState();
  } else if (msg.type === 'entryExcludeToggled') {
    const msgDiv = document.getElementById(`msg-${msg.id}`);
    if (msgDiv) {
      msgDiv.classList.toggle('excluded', !!msg.excluded);
      const excludeBtn = msgDiv.querySelector('.msg-action-btn[data-action="exclude"]');
      if (excludeBtn) { excludeBtn.classList.toggle('active', !!msg.excluded); }
    }
    const entry = messageHistory.find((m) => m.id === msg.id);
    if (entry) { entry.excludedFromPrompt = !!msg.excluded; }
    saveState();
  } else if (msg.type === 'vlmAnalysisComplete') {
    if (typeof msg.imagePath === 'string' && typeof msg.description === 'string') {
      const idx = findGalleryIndexByImagePath(msg.imagePath);
      if (idx >= 0) {
        galleryImages[idx] = { ...galleryImages[idx], description: msg.description };
        renderGallery();
        saveState();
      }
    }
  } else if (msg.type === 'vlmAnalysisFailed') {
    if (typeof msg.imagePath === 'string') {
      const idx = findGalleryIndexByImagePath(msg.imagePath);
      if (idx >= 0) {
        renderGallery();
      }
    }
  } else if (msg.type === 'imageGenConfig') {
    applyImageGenConfigForm(msg.config || {});
  } else if (msg.type === 'remotePlayStatus') {
    updateRemotePlayButton(msg.status);
  } else if (msg.type === 'remoteInput') {
    if (typeof msg.text === 'string' && msg.text.trim()) {
      const entry = {
        id: `user-remote-${Date.now()}`,
        role: 'user',
        content: msg.text.trim(),
        sender: T('webview.sender.player')
      };
      messageHistory.push(entry);
      renderMessage(entry);
      scrollToBottom();
      saveState();
    }
  } else if (msg.type === 'experienceProfile') {
    parlorHasCharacter = !!msg.hasCharacter;
    applyExperienceProfile(msg.profile || 'campaign');
    const parlorHubBtn = document.getElementById('start-hub-parlor-btn');
    const inWorldHubBtn = document.getElementById('start-hub-inworld-btn');
    if (parlorHubBtn) {
      parlorHubBtn.disabled = !parlorHasCharacter;
      parlorHubBtn.classList.toggle('start-hub-btn-disabled', !parlorHasCharacter);
    }
    if (inWorldHubBtn) {
      inWorldHubBtn.disabled = !parlorHasCharacter;
      inWorldHubBtn.classList.toggle('start-hub-btn-disabled', !parlorHasCharacter);
    }
  } else if (msg.type === 'parlorSessionUpdate') {
    applyExperienceProfile(msg.profile || 'parlor');
    applyParlorSession(msg);
  } else if (msg.type === 'localeBundle') {
    i18nStrings = msg.strings || {};
    currentLocale = msg.locale || 'en';
    const sel = localeSelect();
    if (sel && sel.value !== currentLocale) {
      sel.value = currentLocale;
    }
    applyI18n();
    if (currentCharacters.length > 0 || activeCharId) {
      updateCharacterList(currentCharacters, activeCharId, currentPartyIds);
    }
    // Re-render dynamic UI that depends on translations
    renderAllMessages();
    renderGallery();
    renderCheckpointUi();
    if (typeof updateEffectsTierButton === 'function') { updateEffectsTierButton(); }
    // Relay toggle/send-btn text is set programmatically (not data-i18n) so it
    // survives a locale switch mid-session instead of staying in the old language.
    updateRelayToggleButton(window.antigravityRelayMode);
    const sBtnLocale = document.getElementById('send-btn');
    if (sBtnLocale) {
      sBtnLocale.textContent = window.antigravityRelayMode ? T('webview.relay.button.prepare') : T('webview.button.send');
    }
    updateRelayBannerI18n();
    if (!welcomeShown && messageHistory.length === 0) {
      welcomeShown = true;
    }
    updateStartHubVisibility();
  }
});

// ===== Resizer (wide mode only; clamp shared with LoreRelayResponsive) =====
function clampStatusPaneWidth(value) {
  const vw = (typeof window !== 'undefined' && Number.isFinite(window.innerWidth)) ? window.innerWidth : 1200;
  if (window.LoreRelayResponsive && typeof window.LoreRelayResponsive.clampSidebarWidth === 'function') {
    return window.LoreRelayResponsive.clampSidebarWidth(value, vw);
  }
  const width = Number(value);
  if (!Number.isFinite(width) || width <= 0) return 320;
  const max = Math.min(Math.floor(vw * 0.42), 800);
  return Math.max(280, Math.min(max, Math.round(width)));
}

window.addEventListener('DOMContentLoaded', () => {
  const resizer = document.getElementById('resizer');
  const statusArea = document.getElementById('status-area');
  if (!resizer || !statusArea) return;

  const savedWidth = localStorage.getItem('lorerelay.statusWidth');
  if (savedWidth !== null) {
    statusArea.style.setProperty('--status-width', `${clampStatusPaneWidth(savedWidth)}px`);
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    // Drawer modes disable the resizer; do not begin a drag or persist width.
    if (window.LoreRelayResponsive && typeof window.LoreRelayResponsive.isResizerEnabled === 'function'
      && !window.LoreRelayResponsive.isResizerEnabled()) {
      return;
    }
    isResizing = true;
    startX = e.clientX;
    startWidth = statusArea.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (isResizing) {
      if (window.LoreRelayResponsive && typeof window.LoreRelayResponsive.isResizerEnabled === 'function'
        && !window.LoreRelayResponsive.isResizerEnabled()) {
        return;
      }
      const diff = startX - e.clientX;
      let newWidth = startWidth + diff;
      newWidth = clampStatusPaneWidth(newWidth);
      statusArea.style.setProperty('--status-width', `${newWidth}px`);
    }

    if (isResizingBanner) {
      const content = document.getElementById('relay-mode-banner-content');
      if (content) {
        const diff = e.clientY - bannerStartY;
        let newHeight = bannerStartHeight + diff;

        const maxH = relayBannerViewportMax();
        if (newHeight > maxH) newHeight = maxH;

        const wasCollapsed = relayBannerCollapsedInDom(content);
        if (newHeight < RELAY_BANNER_COLLAPSE_THRESHOLD) {
          // Dragging below the threshold still collapses the banner, but it
          // immediately shows the explicit recovery strip rather than a
          // near-invisible sliver (HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001).
          if (!wasCollapsed) { rememberRelayBannerHeightIfValid(content); }
          setRelayBannerCollapsed(content);
        } else {
          setRelayBannerExpanded(content, newHeight);
        }
        if (wasCollapsed !== relayBannerCollapsedInDom(content)) {
          updateRelayBannerI18n();
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Only persist while wide mode remains active (drawer drag must not write).
      if (!window.LoreRelayResponsive || window.LoreRelayResponsive.isResizerEnabled()) {
        if (window.LoreRelayResponsive && typeof window.LoreRelayResponsive.persistWidthFromElement === 'function') {
          window.LoreRelayResponsive.persistWidthFromElement();
        } else {
          const finalWidth = clampStatusPaneWidth(statusArea.getBoundingClientRect().width);
          localStorage.setItem('lorerelay.statusWidth', finalWidth);
        }
      }
    }

    if (isResizingBanner) {
      isResizingBanner = false;
      const sash = document.getElementById('relay-banner-sash');
      if (sash) sash.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      const content = document.getElementById('relay-mode-banner-content');
      if (content) {
        persistRelayBannerHeight(content);
        updateRelayBannerI18n();
      }
    }
  });
});
