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
  const mapPanel = document.getElementById('map-panel');
  const mapToggle = document.getElementById('map-toggle');
  const mapToggleCount = document.getElementById('map-toggle-count');
  const mapBody = document.getElementById('map-body');
  const mapCanvas = document.getElementById('map-canvas');
  const mapTooltip = document.getElementById('map-tooltip');
  const mapLegend = document.getElementById('map-legend');

  let ws = null;
  let gmBusy = false;
  let gameOver = false;
  let isSpectator = clientRole === 'spectator';
  let reconnectTimer = null;
  let pingTimer = null;
  const seenIds = new Set();

  // Read-only map overlay (M2 sanitized snapshot; see mapOverlayCore.ts).
  const MAP_GRID_SIZE = 64;
  const MAP_MARKER_STYLE = {
    npc: { color: '#5ab0e8', label: 'NPC' },
    merchant: { color: '#e8c87a', label: 'Merchant' },
    caravan: { color: '#d8a050', label: 'Caravan' },
    faction_control: { color: '#b8c4d0', label: 'Faction' },
    quest: { color: '#b080f0', label: 'Quest' },
    discovery: { color: '#50c8b8', label: 'Discovery' },
    settlement_pressure: { color: '#e8b050', label: 'Settlement' },
  };
  const MAP_TONE_COLORS = {
    friendly: '#6ecf8a',
    neutral: '#b8c4d0',
    hostile: '#e07070',
    unknown: '#9aa8b8',
  };
  let mapExpanded = false;
  let lastMapMarkers = [];
  let mapMarkerHits = [];
  let mapTooltipTimer = null;

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

  function mapMarkerColor(marker) {
    if (marker.tone && MAP_TONE_COLORS[marker.tone]) { return MAP_TONE_COLORS[marker.tone]; }
    const base = MAP_MARKER_STYLE[marker.kind];
    return base ? base.color : MAP_TONE_COLORS.neutral;
  }

  function hideMapTooltip() {
    mapTooltip.classList.add('hidden');
    mapTooltip.innerHTML = '';
    if (mapTooltipTimer) { clearTimeout(mapTooltipTimer); mapTooltipTimer = null; }
  }

  function showMapTooltip(marker) {
    let html = `<div class="map-tooltip-label">${escapeHtml(marker.label || '')}</div>`;
    if (marker.detail) {
      html += `<div class="map-tooltip-detail">${escapeHtml(marker.detail)}</div>`;
    }
    mapTooltip.innerHTML = html;
    mapTooltip.classList.remove('hidden');
    if (mapTooltipTimer) { clearTimeout(mapTooltipTimer); }
    mapTooltipTimer = setTimeout(hideMapTooltip, 4000);
  }

  function renderMapLegend(markers) {
    const seen = new Set();
    markers.forEach((m) => { if (m && m.kind) { seen.add(m.kind); } });
    const items = Object.keys(MAP_MARKER_STYLE)
      .filter((kind) => seen.has(kind))
      .map((kind) => {
        const style = MAP_MARKER_STYLE[kind];
        return `<span class="map-legend-item"><span class="map-legend-dot" style="background:${style.color}"></span>${escapeHtml(style.label)}</span>`;
      });
    mapLegend.innerHTML = items.join('');
  }

  function drawMapCanvas(markers) {
    const cssSize = mapCanvas.clientWidth || 280;
    if (!cssSize) { return; }
    const dpr = window.devicePixelRatio || 1;
    const targetPx = Math.round(cssSize * dpr);
    if (mapCanvas.width !== targetPx || mapCanvas.height !== targetPx) {
      mapCanvas.width = targetPx;
      mapCanvas.height = targetPx;
    }
    const ctx = mapCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, cssSize, cssSize);

    const cell = cssSize / MAP_GRID_SIZE;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= MAP_GRID_SIZE; i += 8) {
      const p = Math.round(i * cell) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, cssSize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(cssSize, p); ctx.stroke();
    }

    mapMarkerHits = [];
    const dotR = Math.max(2.2, cell * 0.42);
    markers.forEach((marker) => {
      if (!marker || typeof marker.x !== 'number' || typeof marker.y !== 'number') { return; }
      const px = marker.x * cell + cell / 2;
      const py = marker.y * cell + cell / 2;
      const rumored = marker.fogVisibility === 'rumored';
      ctx.globalAlpha = rumored ? 0.45 : 1;
      ctx.fillStyle = mapMarkerColor(marker);
      ctx.beginPath();
      ctx.arc(px, py, dotR, 0, Math.PI * 2);
      ctx.fill();
      if (rumored) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      mapMarkerHits.push({ px, py, marker });
    });
  }

  function handleMapTap(e) {
    const rect = mapCanvas.getBoundingClientRect();
    const point = e.touches && e.touches[0] ? e.touches[0] : e;
    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;
    let best = null;
    let bestDist = 14;
    mapMarkerHits.forEach((hit) => {
      const dx = hit.px - x;
      const dy = hit.py - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= bestDist) { bestDist = dist; best = hit.marker; }
    });
    if (best) {
      showMapTooltip(best);
    } else {
      hideMapTooltip();
    }
  }

  function setMapExpanded(expanded) {
    mapExpanded = expanded;
    mapPanel.dataset.expanded = expanded ? 'true' : 'false';
    mapToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    mapBody.classList.toggle('hidden', !expanded);
    if (expanded) {
      drawMapCanvas(lastMapMarkers);
      renderMapLegend(lastMapMarkers);
    } else {
      hideMapTooltip();
    }
  }

  function renderMapOverlay(overlay) {
    const markers = overlay && Array.isArray(overlay.markers) ? overlay.markers : [];
    lastMapMarkers = markers;
    if (!markers.length) {
      mapPanel.classList.add('hidden');
      hideMapTooltip();
      return;
    }
    mapPanel.classList.remove('hidden');
    mapToggleCount.textContent = `(${markers.length})`;
    if (mapExpanded) {
      drawMapCanvas(markers);
      renderMapLegend(markers);
    }
  }

  function applyState(state) {
    if (!state) { return; }
    renderAll(state.entries);
    renderStatus(state.status);
    renderOptions(state.options);
    renderGameOver(state.gameOver);
    renderMapOverlay(state.mapOverlay);
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

  mapToggle.addEventListener('click', () => setMapExpanded(!mapExpanded));
  mapCanvas.addEventListener('click', handleMapTap);
  window.addEventListener('resize', () => {
    if (mapExpanded) { drawMapCanvas(lastMapMarkers); }
  });

  updateRoleBadge();
  connect();
})();