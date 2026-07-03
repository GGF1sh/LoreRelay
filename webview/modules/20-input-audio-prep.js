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
  const profileBtn = document.getElementById('experience-profile-btn');
  if (profileBtn) profileBtn.disabled = true;
  const parlorSettingsBtn = document.getElementById('parlor-settings-btn');
  if (parlorSettingsBtn) parlorSettingsBtn.disabled = true;
}

function hideGmLoading(success) {
  const el = document.getElementById('gm-loading');
  if (el) { el.remove(); }
  freeInput.disabled = false;
  sendBtn.disabled = false;
  document.querySelectorAll('.option-btn').forEach(b => { b.disabled = false; });
  const profileBtn = document.getElementById('experience-profile-btn');
  if (profileBtn) profileBtn.disabled = false;
  const parlorSettingsBtn = document.getElementById('parlor-settings-btn');
  if (parlorSettingsBtn) parlorSettingsBtn.disabled = false;
  if (success === false) {
    addSystemMessage(T('webview.gm.failed'));
  }
}
