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
