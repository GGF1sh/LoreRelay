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
let seenHiddenDiceIds = new Set();
let ttsEnabled = false;
let ttsSpeed = 1.0;
let ttsVolume = 0.8;
let gameOverActive = false;
let rewindTargets = [];
let checkpointMetas = [];

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

  startBtn.addEventListener('click', () => {
    const promptText = promptInput.value.trim();
    if (!promptText) {
      alert('Please describe your adventure first!');
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

/* --- 10-game-state.js --- */
// ===== Game State の適用 =====
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
      speakText(lastAddedEntry.content);
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
    speakBtn.onclick = () => speakText(entry.content);
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
      if (confirm(T('webview.msg.rewindConfirm') || 'Rewind history to this turn? (Future turns will be lost)')) {
        vscode.postMessage({ type: 'branchFromEntry', entryId: entry.id });
      }
    };
    actionsBar.appendChild(branchBtn);

    // ⎇ Gitブランチ（このターンから別世界線を作る）
    const gitBranchBtn = document.createElement('button');
    gitBranchBtn.className = 'msg-action-btn';
    gitBranchBtn.title = T('webview.msg.gitBranch') || 'Create alternate timeline (Git Branch) from this turn';
    gitBranchBtn.textContent = '⎇';
    gitBranchBtn.onclick = () => {
      if (confirm(T('webview.msg.gitBranchConfirm') || 'Create a new alternate timeline branch from this turn?')) {
        vscode.postMessage({ type: 'branchTimeline', turnId: entry.id });
      }
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
    promptEditor.appendChild(regenBtn);
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
  return gameOverActive;
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
    btn.textContent = `${i + 1}. ${opt}`;
    btn.addEventListener('click', () => {
      if (isInputLocked()) return;
      window.speechSynthesis?.cancel();
      vscode.postMessage({
        type: 'selectOption',
        text: `${i + 1}. ${opt}`,
        authorsNote: getAuthorsNote()
      });
      clearAuthorsNote();
      // UIにもPlayerメッセージとして追加
      const entry = { id: `user-${Date.now()}`, role: 'user', content: `${i + 1}. ${opt}`, sender: T('webview.sender.player') };
      messageHistory.push(entry);
      renderMessage(entry);
      optionsBar.innerHTML = '';
      scrollToBottom();
      saveState();
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
  if (e.key === 'Enter') sendFreeInput();
});

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
    const label = prompt(T('webview.checkpoint.savePrompt'), '');
    vscode.postMessage({ type: 'saveCheckpoint', label: label || '' });
  });
}

const rewindBtn = document.getElementById('rewind-btn');
const rewindSelect = document.getElementById('rewind-select');
if (rewindBtn && rewindSelect) {
  rewindBtn.addEventListener('click', () => {
    const entryId = rewindSelect.value;
    if (!entryId) return;
    window.speechSynthesis?.cancel();
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
  if (isInputLocked()) return;
  stopListening();
  const text = freeInput.value.trim();
  if (!text) return;
  window.speechSynthesis?.cancel();
  vscode.postMessage({ type: 'freeInput', text, authorsNote: getAuthorsNote() });
  clearAuthorsNote();
  const entry = { id: `user-${Date.now()}`, role: 'user', content: text, sender: T('webview.sender.player') };
  messageHistory.push(entry);
  renderMessage(entry);
  freeInput.value = '';
  scrollToBottom();
  saveState();
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
  body.textContent = T('webview.gm.loading');
  div.appendChild(sender);
  div.appendChild(body);
  chatLog.appendChild(div);
  scrollToBottom();
  // 入力をロック（二重送信防止）
  freeInput.disabled = true;
  sendBtn.disabled = true;
  document.querySelectorAll('.option-btn').forEach(b => b.disabled = true);
}

function hideGmLoading(success) {
  const el = document.getElementById('gm-loading');
  if (el) { el.remove(); }
  freeInput.disabled = false;
  sendBtn.disabled = false;
  document.querySelectorAll('.option-btn').forEach(b => { b.disabled = false; });
  if (success === false) {
    addSystemMessage(T('webview.gm.failed'));
  }
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
  vscode.postMessage({ type: 'freeInput', text });
  const entry = { id: `user-${Date.now()}`, role: 'user', content: text, sender: T('webview.sender.player') };
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

// ===== タブ切り替え =====
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');

    btn.classList.add('active');
    const targetId = btn.dataset.target;
    document.getElementById(targetId).style.display = 'flex';

    if (targetId === 'pane-character') {
      vscode.postMessage({ type: 'loadCharacters' });
    }
  });
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
    const isScrollableTarget = target === tabsHeader || Boolean(target?.closest('.tab-btn'));
    if (isScrollableTarget) {
      dragging = true;
      dragMoved = false;
      dragStartX = e.clientX;
      dragStartScrollLeft = tabsHeader.scrollLeft;
      tabsHeader.setPointerCapture(e.pointerId);
    }
  });

  tabsHeader.addEventListener('pointermove', (e) => {
    if (!dragging) { return; }
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 4) {
      dragMoved = true;
      tabsHeader.scrollLeft = dragStartScrollLeft - dx;
    }
  });

  tabsHeader.addEventListener('pointerup', (e) => {
    if (dragging && dragMoved) {
      suppressNextClick = true;
      setTimeout(() => { suppressNextClick = false; }, 0);
    }
    dragging = false;
  });
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
  if (currentSelection !== 'new' && currentCharacters.find(c => c.id === currentSelection)) {
    charSelect.value = currentSelection;
  } else if (activeId && currentCharacters.find(c => c.id === activeId)) {
    charSelect.value = activeId;
  }
  
  loadSelectedCharacter();
}

function loadSelectedCharacter() {
  const id = charSelect.value;
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
  loadSelectedCharacter();
  if (charSelect.value !== 'new') {
    vscode.postMessage({ type: 'setActiveCharacter', id: charSelect.value });
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

  const DEFAULT_EXPRESSIONS = [
    { key: 'neutral',     label: 'Neutral',     icon: '😐' },
    { key: 'happy',       label: 'Happy',       icon: '😊' },
    { key: 'sad',         label: 'Sad',         icon: '😢' },
    { key: 'angry',       label: 'Angry',       icon: '😠' },
    { key: 'surprised',   label: 'Surprised',   icon: '😮' },
    { key: 'scared',      label: 'Scared',      icon: '😨' },
    { key: 'disgusted',   label: 'Disgusted',   icon: '🤢' },
    { key: 'thinking',    label: 'Thinking',    icon: '🤔' },
    { key: 'embarrassed', label: 'Embarrassed', icon: '😳' },
    { key: 'smug',        label: 'Smug',        icon: '😏' },
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
    if (subtitle) subtitle.textContent = charData?.name ? `— ${charData.name}` : '— New Character';

    // Saved toast reset
    const toast = $('cc-saved-toast');
    if (toast) toast.classList.add('hidden');

    // Reset format buttons
    document.querySelectorAll('.cc-fmt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === ccExportFormat);
    });

    updatePortraitPreview(ccPortraitData);
    renderExpressionsGrid();

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
      grid.appendChild(
        buildExpressionCard(key, meta?.label ?? key, meta?.icon ?? '🎭', expr?.uri ?? null)
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

    const uploadBtn = makeSpritActionBtn('📁', 'Upload image', false, () => triggerExpressionPicker(key));
    const genBtn    = makeSpritActionBtn('✨', 'Generate with ComfyUI', false, () => {
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
      const delBtn = makeSpritActionBtn('🗑', 'Remove', true, () => {
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
    input.placeholder = 'Expression name (e.g. "wink")';
    input.style.flex = '1';

    const addBtn = document.createElement('button');
    addBtn.className = 'glass-btn';
    addBtn.textContent = 'Add';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'glass-btn cc-del';
    cancelBtn.textContent = 'Cancel';

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

function renderRemotePlayPanel(status) {
  const panel = document.getElementById('remote-play-panel');
  if (!panel) { return; }

  const running = Boolean(status && status.running);
  panel.classList.toggle('hidden', !running);
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
  const closeBtn = document.getElementById('remote-play-close');
  const stopBtn = document.getElementById('remote-play-stop-btn');
  const copyPlayerBtn = document.getElementById('remote-play-copy-player');
  const copySpectatorBtn = document.getElementById('remote-play-copy-spectator');

  if (!btn) { return; }

  btn.addEventListener('click', () => {
    if (remotePlayActive && panel) {
      panel.classList.toggle('hidden');
      return;
    }
    vscode.postMessage({ type: 'toggleRemotePlay' });
  });

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
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
      const label = prompt(T('webview.checkpoint.savePrompt') || 'Checkpoint label:', '') ?? '';
      vscode.postMessage({ type: 'saveCheckpoint', label });
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
  if (!ttsEnabled || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  
  window.speechSynthesis.cancel();
  
  if (typeof text !== 'string') return;
  
  // Treat GM text as plain speech input; do not parse it as HTML.
  const plainText = text.replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (plainText === '') return;

  const utterance = new SpeechSynthesisUtterance(plainText);
  utterance.rate = ttsSpeed;
  utterance.volume = ttsVolume;
  
  const langMap = {
    'ja': 'ja-JP',
    'en': 'en-US',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW'
  };
  utterance.lang = langMap[currentLocale] || 'en-US';
  
  const voice = getBestVoiceForLocale(currentLocale);
  if (voice) {
    utterance.voice = voice;
  }
  
  window.speechSynthesis.speak(utterance);
}

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
            if (rules.simIntervalTurns !== undefined && inputs.simIntervalTurns) inputs.simIntervalTurns.value = rules.simIntervalTurns;
        }
    });

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
    });
});

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
    summaryDiv.textContent = typeof T === 'function'
        ? T('webview.inspector.promptSummary', {
            backend,
            tokens: String(tokens),
            chars: String(chars)
        })
        : `Backend: ${backend} · ~${tokens} tokens · ${chars} chars`;

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
                if (confirm('Create a new timeline branch starting from this turn?')) {
                    vscode.postMessage({ type: 'branchTimeline', turnId: turnResult.turnId });
                }
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
            } else if (message.errors && message.errors.length) {
                alert(message.errors.join('\n'));
            }
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

function deleteLorebookEntry(id) {
    const confirmMsg = typeof T === 'function' ? T('webview.lorebook.deleteConfirm') : 'Delete this entry?';
    if (!window.confirm(confirmMsg)) {
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
    if (modeMermaid) {
        modeMermaid.addEventListener('click', () => setWorldMapMode('mermaid'));
    }
    if (modeParchment) {
        modeParchment.addEventListener('click', () => setWorldMapMode('parchment'));
    }

    try {
        const saved = localStorage.getItem(WORLD_MAP_MODE_KEY);
        if (saved === 'mermaid' || saved === 'parchment') {
            worldMapMode = saved;
        }
    } catch { /* private mode */ }

    ensureCartographyStyles();
    applyWorldMapModeVisibility();
    buildWorldGenForm();
});

function renderWorldView(msg) {
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
    if (statsEl) {
        const turnStr = msg.simEnabled && msg.worldTurn !== null
            ? ` · Turn ${msg.worldTurn}`
            : '';
        statsEl.textContent = `${msg.regionCount ?? 0} regions · ${msg.locationCount ?? 0} locations${turnStr}`;
    }

    currentWorldLocationId = msg.currentLocationId;
    if (genImageBtn) {
        genImageBtn.style.display = currentWorldLocationId ? '' : 'none';
    }

    // Mermaid + parchment maps
    renderMermaidMap(msg.worldMap, msg.currentLocationId);
    renderCartographyMap(msg);

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

    // 派閥カード
    renderFactions(msg.factions || [], msg.factionStates || null);
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
        }
        .world-map-pin.is-current {
            font-size: 1.45em;
            opacity: 1;
            filter: drop-shadow(0 0 6px rgba(255,210,80,0.9));
            z-index: 2;
        }
        #world-gen-map-btn.generating {
            opacity: 0.75;
        }
    `;
    document.head.appendChild(style);
}

function setWorldMapMode(mode, options = {}) {
    const persist = options.persist !== false;
    worldMapMode = mode === 'parchment' ? 'parchment' : 'mermaid';
    if (persist) {
        try { localStorage.setItem(WORLD_MAP_MODE_KEY, worldMapMode); } catch { /* ignore */ }
    }
    applyWorldMapModeVisibility();
}

function applyWorldMapModeVisibility() {
    const mermaidPanel = document.getElementById('world-mermaid');
    const cartographyPanel = document.getElementById('world-cartography');
    const btnMermaid = document.getElementById('world-map-mode-mermaid');
    const btnParchment = document.getElementById('world-map-mode-parchment');
    const showParchment = worldMapMode === 'parchment';

    if (mermaidPanel) {
        mermaidPanel.classList.toggle('hidden', showParchment);
    }
    if (cartographyPanel) {
        cartographyPanel.classList.toggle('hidden', !showParchment);
    }
    if (btnMermaid) {
        btnMermaid.classList.toggle('is-active', !showParchment);
    }
    if (btnParchment) {
        btnParchment.classList.toggle('is-active', showParchment);
    }
}

function renderCartographyMap(msg) {
    const stage = document.getElementById('world-cartography-stage');
    const img = document.getElementById('world-cartography-img');
    const pinsEl = document.getElementById('world-cartography-pins');
    const empty = document.getElementById('world-cartography-empty');
    if (!stage || !img || !pinsEl) { return; }

    const hasImage = Boolean(msg.cartographyImage);
    if (empty) {
        empty.classList.toggle('hidden', hasImage);
    }
    stage.style.display = hasImage ? '' : 'none';

    if (!hasImage) {
        img.removeAttribute('src');
        pinsEl.innerHTML = '';
        return;
    }

    img.src = msg.cartographyImage;
    img.alt = msg.worldName ? `${msg.worldName} map` : 'World map';

    pinsEl.innerHTML = '';
    const pins = Array.isArray(msg.cartographyPins) ? msg.cartographyPins : [];
    for (const pin of pins) {
        if (typeof pin.leftPct !== 'number' || typeof pin.topPct !== 'number') { continue; }
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'world-map-pin';
        if (pin.locationId && pin.locationId === msg.currentLocationId) {
            el.classList.add('is-current');
        }
        el.style.left = `${pin.leftPct}%`;
        el.style.top = `${pin.topPct}%`;
        el.title = pin.locationName || pin.locationId || '';
        el.textContent = '📍';
        el.setAttribute('aria-label', pin.locationName || pin.locationId || 'Location');
        pinsEl.appendChild(el);
    }
}

function renderMermaidMap(mmdCode, currentLocationId) {
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

function renderFactions(factions, factionStates) {
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
            card.appendChild(buildSimBars(liveState));
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

function buildSimBars(liveState) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-top:0.35rem;display:flex;flex-direction:column;gap:0.15rem;';

    // パワーバー
    wrapper.appendChild(buildBar(T('webview.world.simPower'), liveState.power, 100, 'var(--vscode-charts-red, #c04040)'));

    // モラルバー（ある場合のみ）
    if (liveState.morale !== undefined) {
        wrapper.appendChild(buildBar(T('webview.world.simMorale'), liveState.morale, 100, 'var(--vscode-charts-blue, #4080c0)'));
    }

    return wrapper;
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
    for (const t of ['dungeon-crawler', 'dark-fantasy', 'cyberpunk', 'default']) {
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

/* --- 90-bootstrap.js --- */
// ===== Initialization =====
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
});

// ===== Extension → Webview メッセージ受信 =====
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg.type === 'gameStateUpdate') {
    applyGameState(msg.state, msg.fullHistory);
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
  } else if (msg.type === 'bgmManifest') {
    setBgmManifest(msg.tracks, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'sfxManifest') {
    setSfxManifest(msg.sounds, msg.defaultVolume, msg.enabled);
  } else if (msg.type === 'gmStart' || msg.type === 'grokStart') {
    showGmLoading();
  } else if (msg.type === 'gmEnd' || msg.type === 'grokEnd') {
    hideGmLoading(msg.success);
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
    if (!welcomeShown && messageHistory.length === 0) {
      welcomeShown = true;
      addSystemMessage(T('webview.welcome'));
    }
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
