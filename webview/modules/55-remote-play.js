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

// The panel had an `#remote-play-backdrop` element in index.html from the
// start, styled identically to the image-gen panel's backdrop, but nothing
// ever toggled it — so opening Remote Play left the Start Hub / chat log
// fully visible (and clickable) behind the panel instead of dimming it.
function syncRemotePlayBackdrop() {
  const panel = document.getElementById('remote-play-panel');
  const backdrop = document.getElementById('remote-play-backdrop');
  if (!panel || !backdrop) { return; }
  backdrop.classList.toggle('hidden', panel.classList.contains('hidden'));
}

function renderRemotePlayPanel(status) {
  const panel = document.getElementById('remote-play-panel');
  if (!panel) { return; }

  const running = Boolean(status && status.running);
  panel.classList.toggle('hidden', !running);
  syncRemotePlayBackdrop();
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
  const backdrop = document.getElementById('remote-play-backdrop');
  const closeBtn = document.getElementById('remote-play-close');
  const stopBtn = document.getElementById('remote-play-stop-btn');
  const copyPlayerBtn = document.getElementById('remote-play-copy-player');
  const copySpectatorBtn = document.getElementById('remote-play-copy-spectator');

  if (!btn) { return; }

  btn.addEventListener('click', () => {
    if (remotePlayActive && panel) {
      panel.classList.toggle('hidden');
      syncRemotePlayBackdrop();
      return;
    }
    vscode.postMessage({ type: 'toggleRemotePlay' });
  });

  if (closeBtn && panel) {
    closeBtn.addEventListener('click', () => {
      panel.classList.add('hidden');
      syncRemotePlayBackdrop();
    });
  }
  if (backdrop && panel) {
    backdrop.addEventListener('click', () => {
      panel.classList.add('hidden');
      syncRemotePlayBackdrop();
    });
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