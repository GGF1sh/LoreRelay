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
