// ===== Initialization =====
function updateRelayToggleButton(enabled) {
  const relayToggleBtn = document.getElementById('relay-toggle-btn');
  if (!relayToggleBtn) return;
  relayToggleBtn.classList.toggle('active', !!enabled);
  relayToggleBtn.textContent = enabled ? T('webview.relay.toggle.on') : T('webview.relay.toggle.off');
  relayToggleBtn.title = T('webview.relay.toggle.title');
  if (typeof relayToggleBtn.setAttribute === 'function') {
    relayToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  }
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
  } else if (msg.type === 'relayModeStatus') {
    window.antigravityRelayMode = msg.antigravityRelayMode;
    updateRelayToggleButton(window.antigravityRelayMode);
    const sBtn = document.getElementById('send-btn');
    if (sBtn) {
      sBtn.textContent = window.antigravityRelayMode ? T('webview.relay.button.prepare') : T('webview.button.send');
    }
    
    // Role clarification / suppression
    let relayBanner = document.getElementById('relay-mode-banner');
    if (window.antigravityRelayMode && !relayBanner) {
      relayBanner = document.createElement('div');
      relayBanner.id = 'relay-mode-banner';
      relayBanner.style.backgroundColor = 'var(--vscode-editorWarning-background, rgba(200, 150, 0, 0.2))';
      relayBanner.style.color = 'var(--vscode-editorWarning-foreground, #ffcc00)';
      relayBanner.style.padding = '8px';
      relayBanner.style.textAlign = 'center';
      relayBanner.style.fontWeight = 'bold';
      relayBanner.style.whiteSpace = 'pre-line';
      relayBanner.style.lineHeight = '1.35';
      relayBanner.textContent = T('webview.relay.banner.active');
      document.body.insertBefore(relayBanner, document.body.firstChild);
    } else if (!window.antigravityRelayMode && relayBanner) {
      relayBanner.remove();
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
    if (!welcomeShown && messageHistory.length === 0) {
      welcomeShown = true;
    }
    updateStartHubVisibility();
  }
});

// ===== Resizer =====
window.addEventListener('DOMContentLoaded', () => {
  const resizer = document.getElementById('resizer');
  const statusArea = document.getElementById('status-area');
  if (!resizer || !statusArea) return;

  const savedWidth = localStorage.getItem('lorerelay.statusWidth');
  if (savedWidth) {
    statusArea.style.setProperty('--status-width', `${savedWidth}px`);
  }

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = statusArea.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const diff = startX - e.clientX;
    let newWidth = startWidth + diff;
    if (newWidth < 60) newWidth = 60;
    if (newWidth > 800) newWidth = 800;

    statusArea.style.setProperty('--status-width', `${newWidth}px`);
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      const finalWidth = statusArea.getBoundingClientRect().width;
      localStorage.setItem('lorerelay.statusWidth', finalWidth);
    }
  });
});
