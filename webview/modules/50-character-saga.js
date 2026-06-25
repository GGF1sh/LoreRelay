// ===== Character Profile ロジック =====
let currentCharacters = [];
let activeCharId = null;
let currentPartyIds = [];

const charSelect = document.getElementById('char-select');
const charPartyCb = document.getElementById('char-party-cb');
const charNameInput = document.getElementById('char-name');
const charDescInput = document.getElementById('char-desc');
const charPersonalityInput = document.getElementById('char-personality');
const charPortraitImg = document.getElementById('char-portrait-img');
const charPortraitPlaceholder = document.getElementById('char-portrait-placeholder');

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
    charDescInput.value = '';
    charPersonalityInput.value = '';
    charPortraitImg.src = '';
    charPortraitImg.style.display = 'none';
    charPortraitPlaceholder.style.display = 'flex';
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
      charDescInput.value = char.description || '';
      charPersonalityInput.value = char.personality || '';
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
    description: charDescInput.value.trim(),
    personality: charPersonalityInput.value.trim()
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
