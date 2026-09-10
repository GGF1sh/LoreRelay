// Presentation overlays intentionally never enter messageHistory, game state or VLM memory.
window.visualComposer = (() => {
  let root, form, status, preview, source, candidatesBox, draftsBox, brief;
  let candidates = [], drafts = [], busy = false, seq = 0, previewSeq = 0, timer;
  let previousFocus, baselineBackground, ownsBackground = false;
  const inertBefore = new Map();
  const pending = new Map();
  // VS Code's webview preload forwards dragenter/dragover to the editor, which
  // can put its file-opening drop overlay above our target before drop fires.
  // Stop bubbling at the document, after the actual drop target has handled it.
  // Cover the whole open composer so crossing another field cannot start that
  // editor drag. Leave normal editor/file behavior intact when closed.
  for (const type of ['dragenter', 'dragover', 'drag', 'drop']) {
    document.addEventListener(type, event => {
      if (!root || root.hidden) return;
      event.preventDefault();
      event.stopPropagation();
    });
  }
  const labels = (ja, en) => currentLocale === 'ja' ? ja : en;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function send(action, data = {}) {
    const requestId = ++seq;
    pending.set(requestId, action);
    if (action === 'preview') previewSeq = requestId;
    else if (action !== 'list') { previewSeq = -1; setBusy(true); }
    vscode.postMessage({ type: 'visualComposer', action, requestId, ...data });
  }
  function setBusy(value) {
    busy = value;
    if (!root) return;
    root.querySelectorAll('button, input, select, textarea').forEach(node => { if (!node.dataset.close) node.disabled = value; });
    root.setAttribute('aria-busy', String(value));
    if (!value) renderCandidates();
  }
  function edits() {
    return Object.fromEntries(['scene', 'preserve', 'avoid', 'composition', 'style', 'aspectRatio', 'tags', 'negative', 'destination'].map(key => [key, form.elements.namedItem(key).value]));
  }
  function action(name, extra = {}) {
    if (busy || !brief) return;
    clearTimeout(timer);
    send(name, { briefId: brief.id, edits: edits(), ...extra });
  }
  function button(text, click, parent = form) {
    const node = el('button', text); node.type = 'button'; node.addEventListener('click', click); parent.append(node); return node;
  }
  function field(key, title, parent, options) {
    const label = el('label', title);
    const node = el(options ? 'select' : 'textarea'); node.name = key;
    if (options) options.forEach(([value, text]) => { const opt = el('option', text); opt.value = value; node.append(opt); });
    else { node.rows = key === 'scene' ? 4 : 2; node.maxLength = 100000; }
    label.append(node); parent.append(label);
    node.addEventListener('input', () => {
      previewSeq = -1;
      clearTimeout(timer);
      timer = setTimeout(() => { if (brief && !busy) send('preview', { briefId: brief.id, edits: edits() }); }, 200);
    });
  }
  function close() {
    root.hidden = true;
    for (const [node, prior] of inertBefore) node.inert = prior;
    inertBefore.clear(); previousFocus?.focus();
  }
  function build() {
    root = el('section', '', 'visual-composer'); root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'visual-title');
    const header = el('header'); const title = el('h2', labels('この場面を絵にする', 'Illustrate this scene')); title.id = 'visual-title'; header.append(title);
    const exit = button(labels('閉じる', 'Close'), close, header); exit.dataset.close = 'true'; root.append(header);
    status = el('p', '', 'visual-status'); status.setAttribute('role', 'status'); root.append(status);
    draftsBox = el('div', '', 'visual-drafts'); root.append(draftsBox);
    form = el('form'); form.addEventListener('submit', e => e.preventDefault()); root.append(form);
    const original = el('details'); original.open = true; original.append(el('summary', labels('公開済みの場面（変更されません）', 'Published scene (unchanged)')));
    source = el('pre'); original.append(source); form.append(original);
    form.append(el('p', labels('以下は画像用の追加指示です。世界設定は変更しません。', 'The following art direction does not change world facts.')));
    const grid = el('div', '', 'visual-fields'); form.append(grid);
    [['scene', '場面の説明', 'Scene direction'], ['preserve', '必ず残す特徴', 'Must preserve'], ['avoid', '追加しない要素', 'Do not add'], ['composition', '構図', 'Composition'], ['style', '画風（空欄＝指定なし）', 'Style (blank = unspecified)']].forEach(([key, ja, en]) => field(key, labels(ja, en), grid));
    field('aspectRatio', labels('縦横比', 'Aspect ratio'), grid, ['16:9', '9:16', '1:1', '4:3', '3:4'].map(x => [x, x]));
    field('destination', labels('コピー先（自動送信しません）', 'Copy destination (no automatic transfer)'), grid, [['generic', labels('汎用', 'Generic')], ['ChatGPT', 'ChatGPT'], ['Gemini', 'Gemini'], ['Grok', 'Grok']]);
    const advanced = el('details'); advanced.append(el('summary', labels('詳細：手動タグ・Negative Prompt', 'Advanced: manual tags / negative prompt')));
    advanced.append(el('p', labels('自動翻訳・モデル用タグ変換は行いません。', 'No automatic translation or model-specific tag conversion.')));
    field('tags', labels('タグ（手動編集）', 'Tags (manual)'), advanced); field('negative', 'Negative Prompt', advanced); form.append(advanced);
    const previewLabel = el('label', labels('全文プロンプト', 'Full prompt')); preview = el('textarea'); preview.readOnly = true; preview.rows = 10; previewLabel.append(preview); form.append(previewLabel);
    const actions = el('div', '', 'visual-actions'); form.append(actions);
    button(labels('プロンプトをコピー', 'Copy prompt'), () => action('copy'), actions);
    button(labels('下書き保存', 'Save draft'), () => action('save'), actions);
    button(labels('テキスト保存', 'Save text'), () => action('export'), actions);
    const drop = el('div', labels('PNG・JPEG・WebPをここにドロップ（1枚20MiBまで）', 'Drop a PNG, JPEG or WebP here (up to 20 MiB)'), 'visual-drop');
    const serviceLabel = el('label', labels('生成サービス（自己申告・任意）', 'Generation service (self-reported, optional)'));
    const service = el('input'); service.name = 'service'; service.maxLength = 100; serviceLabel.append(service); form.append(serviceLabel);
    button(labels('画像ファイルを選択', 'Choose image file'), () => action('import', { service: service.value }), drop);
    drop.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('drop', async event => {
      event.preventDefault();
      if (busy || !brief) return;
      const files = event.dataTransfer.files;
      if (files.length !== 1 || files[0].size > 20 * 1024 * 1024) { status.textContent = labels('20MiB以下の画像を1枚選んでください。', 'Choose one image up to 20 MiB.'); return; }
      const id = brief.id; const draftEdits = edits(); const reported = service.value;
      setBusy(true);
      try {
        const bitmap = await createImageBitmap(files[0]); bitmap.close();
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(files[0]); });
        send('import', { briefId: id, edits: draftEdits, service: reported, data });
      } catch { status.textContent = labels('画像を読み込めません。', 'Cannot decode this image.'); setBusy(false); }
    }); form.append(drop);
    candidatesBox = el('div', '', 'visual-candidates'); root.append(el('h3', labels('画像候補・ギャラリー', 'Image candidates / gallery')), candidatesBox);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const nodes = [...root.querySelectorAll('button, input, select, textarea, summary')].filter(n => !n.disabled && n.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    document.body.append(root);
  }
  function show() {
    if (!root) build();
    if (root.hidden) {
      previousFocus = document.activeElement;
      for (const node of document.body.children) if (node !== root) { inertBefore.set(node, node.inert); node.inert = true; }
    }
    root.hidden = false; root.querySelector('[data-close]').focus();
  }
  function open(entryId) { if (busy) return; show(); status.textContent = labels('読み込み中…', 'Loading…'); send('open', { entryId }); }
  function renderCandidates() {
    if (!candidatesBox) return;
    candidatesBox.replaceChildren(); draftsBox.replaceChildren();
    const select = el('select'); select.setAttribute('aria-label', labels('保存済みの下書き', 'Saved drafts'));
    const placeholder = el('option', labels('保存済みの下書きを開く…', 'Open saved draft…')); placeholder.value = ''; select.append(placeholder);
    drafts.forEach(d => { const option = el('option', `${d.turnId}${d.valid ? '' : labels('（無効）', ' (inactive)')}`); option.value = d.id; select.append(option); });
    select.disabled = busy; select.addEventListener('change', () => { if (select.value && !busy) send('resume', { briefId: select.value }); }); draftsBox.append(select);
    candidates.forEach(c => {
      const card = el('article');
      const image = el('img'); if (c.uri) image.src = c.uri; image.alt = c.turnId; card.append(image);
      card.append(el('p', `${c.turnId} · ${c.service || labels('サービス不明', 'Service unknown')} · ${c.createdAt}`));
      if (!c.valid) card.append(el('p', labels('元のターンは無効です。ギャラリーに保持しています。', 'Source turn is inactive. Kept in the gallery.')));
      ['turn', 'background'].forEach(target => {
        const applied = c.savedTargets.includes(target);
        const name = target === 'turn' ? labels('ターン画像', 'Turn image') : labels('現在の背景', 'Current background');
        const btn = button(`${name}: ${applied ? labels('解除', 'Remove') : labels('採用', 'Use')}`, () => { if (!busy) send('bind', { candidateId: c.id, target, enabled: !applied }); }, card);
        btn.disabled = busy || (!c.valid && !applied);
      });
      if (!c.savedTargets.length) card.append(el('span', labels('ギャラリーのみ', 'Gallery only')));
      const remove = button(labels('画像を削除', 'Delete image'), () => {
        if (busy) return;
        remove.hidden = true;
        const confirmation = el('div');
        confirmation.append(el('p', labels('候補・ギャラリーから削除し、ターン画像・背景への採用も解除します。元ファイルは残ります。', 'Remove from candidates and gallery, including turn/background assignments. The original file is kept.')));
        button(labels('削除する', 'Delete'), () => { if (!busy) send('deleteCandidate', { candidateId: c.id }); }, confirmation);
        button(labels('キャンセル', 'Cancel'), () => { confirmation.remove(); remove.hidden = false; remove.focus(); }, confirmation);
        card.append(confirmation);
      }, card);
      remove.disabled = busy;
      candidatesBox.append(card);
    });
  }
  function renderPresentation() {
    document.querySelectorAll('.visual-adopted-image, .visual-gallery-item').forEach(node => node.remove());
    for (const c of candidates) {
      if (!c.uri) continue;
      if (c.targets.includes('turn')) {
        const message = document.getElementById(`msg-${c.turnId}`);
        if (message) { const img = el('img', '', 'visual-adopted-image'); img.src = c.uri; img.alt = labels('採用した場面画像', 'Adopted scene image'); message.append(img); }
      }
      const gallery = document.getElementById('gallery');
      if (gallery) {
        const item = el('button', '', 'gallery-item visual-gallery-item'); item.type = 'button';
        const img = el('img', '', 'gallery-thumb'); img.src = c.uri; img.alt = c.turnId; item.append(img);
        item.title = labels('画像候補を開く', 'Open image candidates');
        item.addEventListener('click', () => { if (!busy) { show(); send('resume', { briefId: c.briefId }); } }); gallery.append(item);
      }
    }
    const bg = candidates.find(c => c.targets.includes('background'));
    if (bg?.uri && bgLayer) {
      if (!ownsBackground) baselineBackground = { image: bgLayer.style.backgroundImage, className: bgLayer.className };
      setSceneBackground(bg.uri); ownsBackground = true;
    } else if (ownsBackground && bgLayer) {
      bgLayer.style.backgroundImage = baselineBackground?.image || ''; bgLayer.className = baselineBackground?.className || ''; ownsBackground = false;
    }
  }
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg.type === 'gameStateUpdate') {
      if (!shouldApplyGameStateUpdate(msg)) return;
      if (msg.state?.background) baselineBackground = { image: `url("${msg.state.background}")`, className: 'has-scene-bg' };
      else if (msg.fullHistory) baselineBackground = { image: '', className: '' };
      queueMicrotask(() => send('list'));
      return;
    }
    if (msg.type !== 'visualComposer') return;
    const request = pending.get(msg.requestId); pending.delete(msg.requestId);
    if (!request) return;
    if (request === 'preview' && msg.requestId !== previewSeq) return;
    if (request !== 'preview' && request !== 'list') setBusy(false);
    if (msg.error) { if (status) status.textContent = msg.error; else addSystemMessage(msg.error); return; }
    if (msg.preview !== undefined) { if (preview) preview.value = msg.preview; return; }
    if (msg.brief) {
      brief = msg.brief; source.textContent = brief.source.content;
      for (const [key, value] of Object.entries(brief.edits)) form.elements.namedItem(key).value = value;
      preview.value = msg.prompt;
      status.textContent = msg.valid ? (msg.notice || '') : labels('元のターンが無効です。下書きと画像は保持されます。', 'Source turn is inactive. Draft and images are retained.');
    } else if (msg.notice && status) status.textContent = msg.notice;
    if (msg.candidates) candidates = msg.candidates;
    if (msg.drafts) drafts = msg.drafts;
    renderCandidates(); renderPresentation();
  });
  return { open, renderPresentation, label: () => labels('この場面を絵にする', 'Illustrate this scene') };
})();
