(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || localStorage.getItem('lr_token') || '';
  if (token) {
    localStorage.setItem('lr_token', token);
  }
  const roleParam = params.get('role');
  if (roleParam === 'spectator' || roleParam === 'player') {
    localStorage.setItem('lr_role', roleParam);
  }
  let clientRole = localStorage.getItem('lr_role') || 'player';

  const chatLog = document.getElementById('chat-log');
  const statusPanel = document.getElementById('status-panel');
  const optionsPanel = document.getElementById('options-panel');
  const inputForm = document.getElementById('input-form');
  const playerInput = document.getElementById('player-input');
  const sendBtn = document.getElementById('send-btn');
  const connStatus = document.getElementById('conn-status');
  const busyBanner = document.getElementById('busy-banner');
  const gameOverEl = document.getElementById('game-over');
  const gameOverMsg = document.getElementById('game-over-msg');

  let ws = null;
  let gmBusy = false;
  let gameOver = false;
  let isSpectator = clientRole === 'spectator';
  let reconnectTimer = null;
  let pingTimer = null;
  const seenIds = new Set();

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function setConnected(on) {
    connStatus.classList.toggle('online', on);
    connStatus.classList.toggle('offline', !on);
    connStatus.title = on ? 'Connected' : 'Disconnected';
  }

  function setInputLocked(locked) {
    const disabled = locked || gmBusy || gameOver || isSpectator;
    playerInput.disabled = disabled;
    sendBtn.disabled = disabled;
    busyBanner.classList.toggle('hidden', !gmBusy || gameOver);
    document.querySelectorAll('.opt-btn').forEach((b) => { b.disabled = disabled; });
    const inputPanel = document.getElementById('input-panel');
    if (inputPanel) {
      inputPanel.classList.toggle('spectator-mode', isSpectator);
    }
  }

  function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function renderMessage(entry) {
    if (!entry || !entry.id || seenIds.has(entry.id)) {
      return;
    }
    seenIds.add(entry.id);
    const div = document.createElement('div');
    div.className = `msg ${entry.role || 'gm'}`;
    div.id = `msg-${entry.id}`;
    const sender = entry.sender || (entry.role === 'user' ? 'Player' : 'GM');
    let html = `<div class="msg-sender">${escapeHtml(sender)}</div>`;
    html += `<div class="msg-body">${escapeHtml(entry.content || '')}</div>`;
    if (entry.image) {
      html += `<img class="msg-image" src="${escapeHtml(entry.image)}" alt="scene" loading="lazy" />`;
    }
    div.innerHTML = html;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderAll(entries) {
    if (!Array.isArray(entries)) {
      return;
    }
    chatLog.innerHTML = '';
    seenIds.clear();
    entries.forEach(renderMessage);
  }

  function renderStatus(status) {
    if (!status || typeof status !== 'object') {
      statusPanel.classList.add('hidden');
      return;
    }
    const parts = [];
    if (status.location) { parts.push(`📍 ${status.location}`); }
    if (status.time) { parts.push(`🕐 ${status.time}`); }
    if (status.hp) { parts.push(`❤️ ${status.hp.current}/${status.hp.max}`); }
    if (status.mp) { parts.push(`✨ ${status.mp.current}/${status.mp.max}`); }
    if (!parts.length) {
      statusPanel.classList.add('hidden');
      return;
    }
    statusPanel.textContent = parts.join('  ·  ');
    statusPanel.classList.remove('hidden');
  }

  function renderOptions(options) {
    optionsPanel.innerHTML = '';
    if (!Array.isArray(options) || !options.length || gameOver) {
      optionsPanel.classList.add('hidden');
      return;
    }
    optionsPanel.classList.remove('hidden');
    options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn';
      btn.textContent = opt;
      btn.addEventListener('click', () => sendAction('selectOption', opt));
      optionsPanel.appendChild(btn);
    });
    setInputLocked(false);
  }

  function renderGameOver(go) {
    gameOver = Boolean(go && go.active);
    if (!gameOver) {
      gameOverEl.classList.add('hidden');
      return;
    }
    gameOverMsg.textContent = go.message || 'The story has ended.';
    gameOverEl.classList.remove('hidden');
    setInputLocked(true);
  }

  function applyState(state) {
    if (!state) { return; }
    renderAll(state.entries);
    renderStatus(state.status);
    renderOptions(state.options);
    renderGameOver(state.gameOver);
    if (state.theme) {
      document.body.dataset.theme = state.theme;
    }
  }

  function sendWs(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  function sendAction(type, text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) { return; }
    sendWs({ type, text: trimmed });
  }

  function connect() {
    if (!token) {
      chatLog.innerHTML = '<p class="system-msg">Missing token. Open the URL shown in VS Code (includes ?token=…).</p>';
      return;
    }
    if (ws) {
      ws.close();
    }
    ws = new WebSocket(wsUrl());
    ws.onopen = () => {
      setConnected(true);
      sendWs({ type: 'auth', token, role: clientRole });
      if (pingTimer) { clearInterval(pingTimer); }
      pingTimer = setInterval(() => sendWs({ type: 'ping' }), 25000);
    };
    ws.onclose = () => {
      setConnected(false);
      setInputLocked(true);
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      reconnectTimer = setTimeout(connect, 3000);
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.type) {
        case 'welcome':
          if (msg.role === 'spectator' || msg.role === 'player') {
            clientRole = msg.role;
            isSpectator = clientRole === 'spectator';
            localStorage.setItem('lr_role', clientRole);
          }
          updateRoleBadge();
          setInputLocked(false);
          break;
        case 'state':
          applyState(msg.state);
          if (typeof msg.gmBusy === 'boolean') {
            gmBusy = msg.gmBusy;
            setInputLocked(false);
          }
          break;
        case 'gmBusy':
          gmBusy = Boolean(msg.busy);
          setInputLocked(false);
          break;
        case 'inputAccepted':
          renderMessage({ id: `user-${Date.now()}`, role: 'user', sender: 'Player', content: msg.text });
          playerInput.value = '';
          gmBusy = true;
          setInputLocked(false);
          break;
        case 'remoteInput':
          if (msg.text) {
            renderMessage({ id: `remote-${Date.now()}`, role: 'user', sender: 'Player', content: msg.text });
          }
          break;
        case 'error':
          addSystem(msg.message || 'Error');
          break;
        case 'authRequired':
          break;
        default:
          break;
      }
    };
  }

  function updateRoleBadge() {
    let badge = document.getElementById('role-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'role-badge';
      const topBar = document.getElementById('top-bar');
      if (topBar) {
        topBar.appendChild(badge);
      }
    }
    badge.textContent = isSpectator ? '👁 Spectator' : '🎮 Player';
    badge.className = isSpectator ? 'role-badge spectator' : 'role-badge player';
    if (isSpectator && playerInput) {
      playerInput.placeholder = 'Spectator mode — read only';
    }
  }

  function addSystem(text) {
    const p = document.createElement('p');
    p.className = 'system-msg';
    p.textContent = text;
    chatLog.appendChild(p);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  inputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = playerInput.value.trim();
    if (!text) { return; }
    sendAction('freeInput', text);
  });

  updateRoleBadge();
  connect();
})();