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
      window.visualComposer.open(lastGm.id);
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
let imageGenCatalog = { scene: [], map: [] };
let imageGenResolved = null;
let imageGenManualSize = false;
let imageGenLastSuggestions = null;

function fillImageGenTemplateSelect(selectId, templates, selectedId) {
  const select = document.getElementById(selectId);
  if (!select) { return; }
  const previous = selectedId || '';
  select.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = T('webview.imageGen.noneTemplate');
  select.appendChild(none);
  for (const entry of templates || []) {
    const opt = document.createElement('option');
    opt.value = entry.id;
    opt.textContent = `${entry.title} (${entry.width}×${entry.height})`;
    select.appendChild(opt);
  }
  select.value = previous;
  if (select.value !== previous) {
    select.value = '';
  }
}

function templateSummary(templates, id) {
  const entry = (templates || []).find((row) => row.id === id);
  return entry ? String(entry.summary || '') : '';
}

function renderImageGenResolvedSize(resolved) {
  const sizeEl = document.getElementById('ig-resolved-size');
  const staleEl = document.getElementById('ig-ignored-stale-size');
  if (sizeEl) {
    if (resolved && resolved.sizeSource === 'template' && resolved.width > 0) {
      sizeEl.textContent = T('webview.imageGen.resolvedSizeTemplate', resolved);
    } else if (resolved && resolved.sizeSource === 'manual-override' && resolved.width > 0) {
      sizeEl.textContent = T('webview.imageGen.resolvedSizeManual', resolved);
    } else {
      sizeEl.textContent = '';
    }
  }
  if (staleEl) {
    if (resolved && resolved.ignoredStaleSize) {
      staleEl.textContent = T('webview.imageGen.ignoredStaleSize', resolved.ignoredStaleSize);
      staleEl.classList.remove('hidden');
    } else {
      staleEl.textContent = '';
      staleEl.classList.add('hidden');
    }
  }
}

function applyImageGenConfigForm(config, payload) {
  imageGenConfigDraft = config;
  if (payload && payload.catalog) {
    imageGenCatalog = {
      scene: payload.catalog.scene || [],
      map: payload.catalog.map || []
    };
  }
  imageGenResolved = payload && payload.resolved ? payload.resolved : imageGenResolved;
  imageGenManualSize = config.sizeFollowsTemplate === false;
  fillImageGenTemplateSelect('ig-workflow-template', imageGenCatalog.scene, config.workflowTemplateId || '');
  fillImageGenTemplateSelect('ig-cartography-template', imageGenCatalog.map, config.cartographyTemplateId || '');
  const sceneSummary = document.getElementById('ig-workflow-template-summary');
  if (sceneSummary) {
    sceneSummary.textContent = templateSummary(imageGenCatalog.scene, config.workflowTemplateId || '');
  }
  const mapSummary = document.getElementById('ig-cartography-template-summary');
  if (mapSummary) {
    mapSummary.textContent = templateSummary(imageGenCatalog.map, config.cartographyTemplateId || '');
  }
  renderImageGenResolvedSize(imageGenResolved);
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
    workflowTemplateId: str('ig-workflow-template'),
    cartographyTemplateId: str('ig-cartography-template'),
    sizeFollowsTemplate: !imageGenManualSize,
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

function renderImageGenSuggestions(payload) {
  imageGenLastSuggestions = payload;
  const list = document.getElementById('ig-suggest-list');
  const status = document.getElementById('ig-suggest-status');
  if (!list) { return; }
  list.replaceChildren();
  const suggestions = (payload && payload.suggestions) || [];
  if (status) {
    if (!payload || (payload.rootCount === 0 && suggestions.length === 0)) {
      status.textContent = T('webview.imageGen.noLocalModels');
    } else if (suggestions.length === 0) {
      status.textContent = T('webview.imageGen.suggestNone');
    } else {
      status.textContent = '';
    }
  }
  for (const row of suggestions) {
    const item = document.createElement('div');
    item.className = 'img-gen-suggest-item' + (row.status === 'unresolved' ? ' unresolved' : '');
    const name = document.createElement('div');
    name.className = 'img-gen-suggest-name';
    name.textContent = row.comfyName || '';
    const meta = document.createElement('div');
    meta.className = 'img-gen-suggest-meta';
    const bits = [];
    if (row.status === 'unresolved') { bits.push(T('webview.imageGen.suggestionUnresolved')); }
    if (row.status === 'comfy-unverified') { bits.push(T('webview.imageGen.comfyUnverified')); }
    if (row.modelFamily && row.modelFamily !== 'unknown') { bits.push(row.modelFamily); }
    if (row.mode) { bits.push(row.mode); }
    if (row.workflowTemplateId) { bits.push(row.workflowTemplateId); }
    meta.textContent = bits.join(' · ');
    const reasons = document.createElement('ul');
    reasons.className = 'img-gen-suggest-reasons';
    for (const reason of row.reasons || []) {
      const li = document.createElement('li');
      li.textContent = String(reason);
      reasons.appendChild(li);
    }
    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(reasons);
    if (row.status !== 'unresolved') {
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'glass-btn';
      applyBtn.textContent = T('webview.imageGen.applySuggestion');
      applyBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyImageGenModelSuggestion', comfyName: row.comfyName });
      });
      item.appendChild(applyBtn);
    }
    list.appendChild(item);
  }
}

(function initImageGenSettingsPanel() {
  const openBtn = document.getElementById('img-gen-settings-btn');
  const closeBtn = document.getElementById('img-gen-panel-close');
  const backdrop = document.getElementById('img-gen-backdrop');
  const panel = document.getElementById('img-gen-panel');
  const sceneSelect = document.getElementById('ig-workflow-template');
  const mapSelect = document.getElementById('ig-cartography-template');
  const suggestBtn = document.getElementById('ig-suggest-models');

  openBtn?.addEventListener('click', () => setImageGenPanelOpen(true));
  closeBtn?.addEventListener('click', () => setImageGenPanelOpen(false));
  backdrop?.addEventListener('click', () => setImageGenPanelOpen(false));

  panel?.querySelectorAll('.img-gen-input, .img-gen-textarea').forEach((el) => {
    el.addEventListener('change', scheduleImageGenConfigSave);
    el.addEventListener('blur', scheduleImageGenConfigSave);
  });
  document.getElementById('ig-width')?.addEventListener('input', () => { imageGenManualSize = true; });
  document.getElementById('ig-height')?.addEventListener('input', () => { imageGenManualSize = true; });
  document.getElementById('ig-profile')?.addEventListener('change', scheduleImageGenConfigSave);
  document.getElementById('ig-model-family')?.addEventListener('change', scheduleImageGenConfigSave);

  sceneSelect?.addEventListener('change', () => {
    if (imageGenSaveTimer) { clearTimeout(imageGenSaveTimer); imageGenSaveTimer = null; }
    const config = collectImageGenConfigFromForm();
    imageGenManualSize = false;
    vscode.postMessage({ type: 'selectImageGenTemplate', group: 'scene', id: sceneSelect.value, config });
  });
  mapSelect?.addEventListener('change', () => {
    if (imageGenSaveTimer) { clearTimeout(imageGenSaveTimer); imageGenSaveTimer = null; }
    vscode.postMessage({ type: 'selectImageGenTemplate', group: 'map', id: mapSelect.value, config: collectImageGenConfigFromForm() });
  });
  suggestBtn?.addEventListener('click', () => {
    const status = document.getElementById('ig-suggest-status');
    if (status) { status.textContent = T('webview.imageGen.suggestScanning'); }
    vscode.postMessage({ type: 'requestImageGenModelSuggestions' });
  });
})();

function speakText(text) {
  speakWithProfile(text, null);
}
