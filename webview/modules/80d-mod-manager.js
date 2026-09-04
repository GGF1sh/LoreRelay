// ===== MOD Manager (new/empty campaign only) =====
(() => {
  const panel = document.getElementById('mod-manager-panel');
  const backdrop = document.getElementById('mod-manager-backdrop');
  const packagesEl = document.getElementById('mod-manager-packages');
  const safeEl = document.getElementById('mod-manager-safe');
  const noticeEl = document.getElementById('mod-manager-notice');
  const campaignEl = document.getElementById('mod-manager-campaign-state');
  const previewEl = document.getElementById('mod-manager-preview');
  const previewBody = document.getElementById('mod-manager-preview-body');
  const adultToggle = document.getElementById('mod-manager-show-adult');
  const commitBtn = document.getElementById('mod-manager-commit');
  let managerState = null;

  const open = () => {
    panel?.classList.remove('hidden');
    backdrop?.classList.remove('hidden');
    panel?.setAttribute('aria-hidden', 'false');
    backdrop?.setAttribute('aria-hidden', 'false');
    vscode.postMessage({ type: 'requestModManagerState' });
  };
  const close = () => {
    panel?.classList.add('hidden');
    backdrop?.classList.add('hidden');
    panel?.setAttribute('aria-hidden', 'true');
    backdrop?.setAttribute('aria-hidden', 'true');
    document.getElementById('mod-manager-btn')?.focus();
  };
  const text = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  };
  const label = (key, fallback) => {
    const translated = T(key);
    return translated === key ? fallback : translated;
  };

  function render() {
    if (!managerState || !packagesEl) return;
    packagesEl.replaceChildren();
    if (adultToggle) adultToggle.checked = managerState.adultVisible === true;
    if (safeEl) {
      safeEl.classList.toggle('hidden', !managerState.safeMode);
      safeEl.textContent = managerState.safeMode
        ? `${label('webview.modManager.safeMode', 'Safe Mode')}: ${(managerState.blockers || []).map(item => item.code).join(', ')}`
        : '';
    }
    if (noticeEl) {
      noticeEl.classList.toggle('hidden', !managerState.notice);
      noticeEl.textContent = managerState.notice ? label(`webview.modManager.notice.${managerState.notice}`, managerState.notice) : '';
    }
    if (campaignEl) {
      campaignEl.textContent = managerState.campaignEmpty
        ? label('webview.modManager.newCampaignReady', 'This new/empty campaign can accept a resolved MOD profile.')
        : label('webview.modManager.forkRequired', 'This campaign already has lineage. Copy/fork it before changing the MOD configuration.');
      campaignEl.classList.toggle('is-blocked', !managerState.campaignEmpty);
    }
    for (const item of managerState.packages || []) {
      const card = document.createElement('article');
      card.className = `mod-manager-card rating-${item.contentRating}`;
      const heading = text('h4', 'mod-manager-card-title', item.name);
      const identity = text('div', 'mod-manager-identity', `${item.id} @ ${item.version} · ${item.source}`);
      const meta = text('div', 'mod-manager-meta', `${label('webview.modManager.rating', 'Rating')}: ${item.contentRating} · ${label('webview.modManager.capabilities', 'Capabilities')}: ${(item.capabilities || []).join(', ') || '—'}`);
      const compatibility = text('div', item.compatible ? 'mod-manager-ok' : 'mod-manager-error', item.compatible
        ? label('webview.modManager.compatible', 'Compatible')
        : label('webview.modManager.incompatible', 'Incompatible'));
      card.append(heading, identity, meta, compatibility);
      if (item.dependencies?.length) card.append(text('div', 'mod-manager-meta', `${label('webview.modManager.dependencies', 'Dependencies')}: ${item.dependencies.map(dep => `${dep.id} ${dep.version}`).join(', ')}`));
      if (item.conflicts?.length) card.append(text('div', 'mod-manager-error', `${label('webview.modManager.conflicts', 'Conflicts')}: ${item.conflicts.map(dep => `${dep.id} ${dep.version}`).join(', ')}`));
      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'glass-btn';
      if (item.contentRating === 'adult') {
        action.textContent = item.sessionAuthorized
          ? label('webview.modManager.adultAuthorized', 'Adult session authorized')
          : label('webview.modManager.authorizeAdult', 'Authorize & enable adult MOD');
        action.disabled = item.sessionAuthorized && item.enabled;
        action.addEventListener('click', () => vscode.postMessage({ type: 'authorizeAdultMod', id: item.id, version: item.version, source: item.source }));
      } else {
        action.textContent = item.enabled ? label('webview.modManager.disable', 'Disable') : label('webview.modManager.enable', 'Enable');
        action.addEventListener('click', () => vscode.postMessage({ type: 'setModEnabled', id: item.id, version: item.version, source: item.source, enabled: !item.enabled }));
      }
      card.append(action);
      packagesEl.append(card);
    }
    if (!(managerState.packages || []).length) packagesEl.append(text('p', 'img-gen-hint', label('webview.modManager.empty', 'No visible installed MODs.')));
    if (previewEl && previewBody) {
      previewEl.classList.toggle('hidden', !managerState.preview);
      previewBody.replaceChildren();
      if (managerState.preview) {
        previewBody.append(text('div', 'mod-manager-identity', managerState.preview.fingerprint));
        for (const item of managerState.preview.packages || []) previewBody.append(text('div', '', `${item.id} @ ${item.version} · ${item.source}`));
      }
    }
    if (commitBtn) commitBtn.disabled = managerState.canCommit !== true;
  }

  document.getElementById('mod-manager-btn')?.addEventListener('click', open);
  document.getElementById('mod-manager-close')?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.getElementById('mod-manager-rescan')?.addEventListener('click', () => vscode.postMessage({ type: 'requestModManagerState' }));
  document.getElementById('mod-manager-resolve')?.addEventListener('click', () => vscode.postMessage({ type: 'resolveModProfilePreview' }));
  commitBtn?.addEventListener('click', () => vscode.postMessage({ type: 'commitModProfile' }));
  document.getElementById('mod-manager-export')?.addEventListener('click', () => vscode.postMessage({ type: 'exportModDiagnostics' }));
  adultToggle?.addEventListener('change', () => vscode.postMessage({ type: 'setModAdultVisibility', visible: adultToggle.checked }));
  document.querySelectorAll('[data-mod-install]').forEach(button => button.addEventListener('click', () => vscode.postMessage({
    type: 'installModPackage', kind: button.dataset.modInstall, destination: button.dataset.modDestination,
  })));
  window.addEventListener('message', event => {
    const message = event.data || {};
    if (message.type === 'modManagerState') { managerState = message; render(); }
    if (message.type === 'modManagerNotice' && noticeEl) {
      noticeEl.textContent = label(`webview.modManager.notice.${message.code}`, String(message.code || ''));
      noticeEl.classList.remove('hidden');
    }
    if (message.type === 'localeBundle' && managerState) setTimeout(render, 0);
  });
  window.LoreRelay = window.LoreRelay || {};
  window.LoreRelay.openModManager = open;
})();
