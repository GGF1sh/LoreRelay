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
      if (isInputLocked() || btn.disabled) return;
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
  // ボタンのアクティブ状態を更新
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  saveState();
}

document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => setTheme(btn.dataset.theme));
});
