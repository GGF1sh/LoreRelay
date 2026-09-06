// Display preferences never send game actions or change feature flags.
(function () {
  const presets = ['story', 'management', 'cinematic'];
  let scope = null;
  let saved = false;
  let preset = 'story';
  const selector = document.getElementById('presentation-select');
  const action = document.getElementById('primary-action-btn');
  const detailsToggle = document.getElementById('presentation-details-btn');
  const historyToggle = document.getElementById('presentation-history-btn');
  const log = document.getElementById('chat-log');
  let world = null;
  function recommend(answers = {}) {
    if (answers.playstyle === 'character_chat') return answers.imageGenerationWanted === true ? 'cinematic' : 'story';
    return ['trade', 'settlement', 'domain', 'guild', 'vehicle', 'mobile_base'].includes(answers.playstyle)
      || answers.bookkeeping === 'detailed' ? 'management' : 'story';
  }
  function apply(value) {
    const top = log?.scrollTop;
    const anchor = log && Array.from(log.children).find(el => el.getBoundingClientRect().bottom > log.getBoundingClientRect().top);
    const offset = anchor ? anchor.getBoundingClientRect().top - log.getBoundingClientRect().top : 0;
    preset = presets.includes(value) ? value : 'story';
    document.body.dataset.presentation = preset;
    selector.value = preset;
    // Preserve the visible message even when a different column width reflows older text.
    requestAnimationFrame(() => {
      if (log && top !== undefined) log.scrollTop = anchor?.isConnected
        ? log.scrollTop + anchor.getBoundingClientRect().top - log.getBoundingClientRect().top - offset : top;
    });
  }
  function visible(el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function sync() {
    const modal = Array.from(document.querySelectorAll('[aria-modal="true"], #genesis-guide-modal, #game-rules-modal'))
      .some(visible);
    selector.disabled = !scope || modal;
    const canAct = experienceProfile === 'campaign' && !!document.getElementById('player-action-hub-open');
    if (action.hidden === canAct) action.hidden = !canAct;
    // Keep the initiator focusable when the existing dialog restores focus on close.
    action.disabled = !canAct;
    const context = document.getElementById('presentation-context');
    const commerce = world?.playerCommerce;
    const text = canAct && commerce ? [
      typeof hubLocationName === 'function' ? hubLocationName(world) : '',
      Number.isFinite(commerce.credits) ? `${T('webview.world.commerceCredits')}: ${commerce.credits}` : '',
      Number.isFinite(commerce.cargoWeight) && Number.isFinite(commerce.cargoCapacity)
        ? `${T('webview.world.actionHubTradeCapacity')}: ${commerce.cargoWeight} / ${commerce.cargoCapacity}` : '',
    ].filter(Boolean).join('  ·  ') : '';
    if (context.textContent !== text) context.textContent = text;
    if (context.hidden === Boolean(text)) context.hidden = !text;
    detailsToggle.setAttribute('aria-expanded', document.body.classList.contains('presentation-details-open') ? 'true' : 'false');
    historyToggle.setAttribute('aria-expanded', document.body.classList.contains('presentation-history-open') ? 'true' : 'false');
  }
  selector.addEventListener('change', () => {
    sync();
    if (!scope || selector.disabled) { selector.value = preset; return; }
    apply(selector.value);
    vscode.postMessage({ type: 'setUiPresentation', scope, preset });
  });
  action.addEventListener('click', () => {
    sync();
    if (!selector.disabled && !action.disabled && !action.hidden && typeof openPlayerActionHub === 'function') { openPlayerActionHub(action); sync(); }
  });
  detailsToggle.addEventListener('click', () => {
    document.body.classList.toggle('presentation-details-open'); sync();
  });
  historyToggle.addEventListener('click', () => {
    document.body.classList.toggle('presentation-history-open'); sync();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = event.target.closest?.('#header-secondary[open], #presentation-action-tools[open], #presentation-tool-tabs[open]');
    if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); event.preventDefault(); }
    else if (preset === 'cinematic' && document.body.classList.contains('presentation-details-open')
      && document.getElementById('status-area').contains(event.target)) {
      document.body.classList.remove('presentation-details-open'); detailsToggle.focus(); sync();
    }
  });
  window.addEventListener('message', ({ data: message }) => {
    if (message?.type === 'worldView') { world = message; queueMicrotask(sync); }
    if (message?.type === 'uiPresentation' && message.profile === experienceProfile && presets.includes(message.preset)) {
      scope = message.scope; saved = message.saved === true; apply(message.preset); sync();
    }
    if (message?.type === 'experienceProfile') {
      scope = null;
      world = null;
      queueMicrotask(() => { vscode.postMessage({ type: 'getUiPresentation' }); sync(); });
    }
  });
  window.LoreRelay = window.LoreRelay || {};
  window.LoreRelay.presentation = { recommend, current: () => ({ preset, saved }) };
  // Keep existing IDs and listeners; the tab click delegation still owns both groups.
  const tabs = document.getElementById('status-tabs');
  const tools = document.getElementById('presentation-tool-tabs');
  for (const id of ['pane-inspector', 'pane-director']) {
    const button = tabs?.querySelector(`[data-target="${id}"]`);
    if (button) tools.appendChild(button);
  }
  const extra = document.getElementById('presentation-extra-actions');
  document.querySelectorAll('#header-secondary-body button').forEach(button => {
    if (button.textContent.trim().length <= 3 && button.title) {
      const label = document.createElement('span'); label.className = 'presentation-setting-label';
      label.textContent = button.title; button.appendChild(label);
    }
  });
  for (const id of ['qr-summary', 'qr-genimage', 'qr-loadpack', 'qr-archive', 'qr-export', 'qr-forcespeak', 'qr-questflow', 'qr-relations', 'undo-btn', 'regen-btn', 'img-btn']) {
    const button = document.getElementById(id); if (button) extra.appendChild(button);
  }
  const demo = document.getElementById('start-hub-demo-options');
  const resume = document.getElementById('start-hub-resume-row');
  if (resume) document.getElementById('start-hub').prepend(resume);
  for (const id of ['start-hub-demo-btn', 'start-hub-trading-demo-btn', 'start-hub-map-demo-btn', 'start-hub-debug-btn', 'start-hub-scavenger-demo-btn']) {
    const button = document.getElementById(id); if (button) demo.appendChild(button);
  }
  apply('story');
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
  vscode.postMessage({ type: 'getUiPresentation' });
})();
