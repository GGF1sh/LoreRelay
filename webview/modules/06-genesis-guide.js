// ===== Genesis Guide Wizard (Genesis Mode G2) =====
// Webview UI only. Never writes game_rules.json or canonical state directly.
// The preview logic below MIRRORS src/rulesProfileCore.ts for local, instant
// feedback while the wizard is open. It is NOT authoritative: when the user
// clicks "Start with this", only a postMessage is sent — the host is expected
// to call the real resolveRulesProfile() before touching any files (RP2 gate,
// not implemented yet).

(function initGenesisGuide() {
  const backdrop = document.getElementById('genesis-guide-backdrop');
  const modal = document.getElementById('genesis-guide-modal');
  const closeBtn = document.getElementById('genesis-guide-close');
  const heroCta = document.getElementById('genesis-hero-cta');

  if (!modal) return;

  const progressEl = document.getElementById('genesis-guide-progress');
  const stepView = document.getElementById('genesis-guide-step-view');
  const summaryView = document.getElementById('genesis-guide-summary-view');
  const stepTitleEl = document.getElementById('genesis-step-title');
  const stepDescEl = document.getElementById('genesis-step-desc');
  const stepOptionsEl = document.getElementById('genesis-step-options');
  const portraitImg = document.getElementById('genesis-guide-portrait');
  const portraitFallback = document.getElementById('genesis-guide-portrait-fallback');
  const summaryPortraitImg = document.getElementById('genesis-summary-portrait');
  const summaryPortraitFallback = document.getElementById('genesis-summary-portrait-fallback');

  const stepNav = document.getElementById('genesis-guide-nav');
  const backBtn = document.getElementById('genesis-back-btn');
  const nextBtn = document.getElementById('genesis-next-btn');
  const skipToSummaryBtn = document.getElementById('genesis-skip-summary-btn');

  const summaryNav = document.getElementById('genesis-guide-summary-nav');
  const restartBtn = document.getElementById('genesis-restart-btn');
  const advancedBtn = document.getElementById('genesis-advanced-btn');
  const startBtn = document.getElementById('genesis-start-btn');
  const appliedToast = document.getElementById('genesis-applied-toast');

  const summaryRowsEl = document.getElementById('genesis-summary-rows');
  const summarySystemsEl = document.getElementById('genesis-summary-systems');
  const summaryWarningsEl = document.getElementById('genesis-summary-warnings');
  const notesInput = document.getElementById('genesis-summary-notes');
  const comfyPromptEl = document.getElementById('genesis-comfy-prompt');
  const copyPromptBtn = document.getElementById('genesis-copy-prompt-btn');
  const copyPromptToast = document.getElementById('genesis-copy-prompt-toast');
  const generateImageBtn = document.getElementById('genesis-generate-image-btn');
  const generateImageToast = document.getElementById('genesis-generate-image-toast');

  // ---- Answer domain (mirrors GENESIS_* enums in src/rulesProfileCore.ts) ----
  const STEPS = ['genre', 'playstyle', 'pressure', 'bookkeeping', 'protagonistMode', 'imageGenerationWanted'];

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

  function applyPortrait(imgEl, fallbackEl, webviewPath) {
    const uri = resolveAssetUri(webviewPath);
    if (uri) {
      imgEl.src = uri;
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

  function renderStep() {
    const stepId = STEPS[state.stepIndex];
    progressEl.textContent = T('webview.genesis.progress', { current: state.stepIndex + 1, total: STEPS.length });
    stepTitleEl.textContent = T(`webview.genesis.step.${stepId}.title`);
    stepDescEl.textContent = T(`webview.genesis.step.${stepId}.desc`);

    const hint = ASSET_HINT_BY_GENRE[state.answers.genre] || {};
    applyPortrait(portraitImg, portraitFallback, hint.guideWebviewPath);
    applyBackground(hint.backgroundWebviewPath);

    stepOptionsEl.innerHTML = '';
    OPTIONS[stepId].forEach((opt) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'genesis-option-chip';
      if (state.answers[stepId] === opt.id) chip.classList.add('selected');
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

    stepView.classList.remove('hidden');
    summaryView.classList.add('hidden');
    stepNav.classList.remove('hidden');
    summaryNav.classList.add('hidden');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function renderSummary() {
    const answers = state.answers;
    const preview = resolvePreview(answers);
    const hint = preview.assetHint || {};
    applyPortrait(summaryPortraitImg, summaryPortraitFallback, hint.guideWebviewPath);
    applyBackground(hint.backgroundWebviewPath);

    const rows = [
      ['webview.genesis.summary.genre', `${optionLabel('genre', answers.genre)} (${label(answers.genre)})`],
      ['webview.genesis.summary.playstyle', optionLabel('playstyle', answers.playstyle)],
      ['webview.genesis.summary.pressure', optionLabel('pressure', answers.pressure)],
      ['webview.genesis.summary.bookkeeping', optionLabel('bookkeeping', answers.bookkeeping)],
      ['webview.genesis.summary.protagonist', optionLabel('protagonistMode', answers.protagonistMode)],
      ['webview.genesis.summary.images', answers.imageGenerationWanted
        ? optionLabel('imageGenerationWanted', 'true')
        : optionLabel('imageGenerationWanted', 'false')],
    ];
    summaryRowsEl.innerHTML = rows.map(([labelKey, value]) => (
      `<div class="genesis-summary-row"><span class="genesis-summary-row-label">${escapeHtml(T(labelKey))}</span>` +
      `<span class="genesis-summary-row-value">${escapeHtml(value)}</span></div>`
    )).join('');

    const baselineChips = BASELINE_SYSTEM_KEYS.map((k) => (
      `<span class="genesis-system-chip genesis-system-chip-baseline">${escapeHtml(T(k))}</span>`
    ));
    const extraChips = preview.systemChips.map((label_) => (
      `<span class="genesis-system-chip">${escapeHtml(label_)}</span>`
    ));
    summarySystemsEl.innerHTML = baselineChips.concat(extraChips).join('') ||
      `<span class="genesis-system-chip genesis-system-chip-baseline">${escapeHtml(T('webview.genesis.summary.systemsNone'))}</span>`;

    summaryWarningsEl.classList.add('hidden');
    summaryWarningsEl.textContent = '';

    comfyPromptEl.value = preview.comfyUiStylePrompt;
    copyPromptToast.classList.add('hidden');
    generateImageToast.classList.add('hidden');

    stepView.classList.add('hidden');
    summaryView.classList.remove('hidden');
    stepNav.classList.add('hidden');
    summaryNav.classList.remove('hidden');
    progressEl.textContent = T('webview.genesis.summary.title');
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
    render();
  });

  advancedBtn.addEventListener('click', () => {
    closeGenesisGuide();
    const rulesBtn = document.getElementById('game-rules-settings-btn');
    if (rulesBtn) rulesBtn.click();
  });

  startBtn.addEventListener('click', () => {
    const preview = resolvePreview(state.answers);
    vscode.postMessage({
      type: 'genesisApplyProfile',
      answers: Object.assign({}, state.answers),
      freeformNotes: notesInput ? notesInput.value.slice(0, 2000) : '',
      previewProfileId: preview.profileId,
    });
    appliedToast.classList.remove('hidden');
    setTimeout(() => appliedToast.classList.add('hidden'), 4000);
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
      generateImageToast.classList.remove('hidden');
      setTimeout(() => generateImageToast.classList.add('hidden'), 4000);
    });
  }
})();
