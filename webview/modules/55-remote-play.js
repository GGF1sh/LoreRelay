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
}

(function initRemotePlayUi() {
  const btn = document.getElementById('remote-play-btn');
  if (!btn) { return; }
  btn.addEventListener('click', () => {
    vscode.postMessage({ type: 'toggleRemotePlay' });
  });
})();