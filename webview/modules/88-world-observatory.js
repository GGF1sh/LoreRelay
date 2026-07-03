// webview/modules/88-world-observatory.js
// World Observatory: market sparklines / chronicle / NPC bonds dashboard + observer tick.
// Independent module — does not read or write any DOM owned by 85-world.js, only its own
// #world-observatory subtree. Receives the same broadcast 'worldView' message as 85-world.js.

(function () {
    // Mirrors worldObservatoryCore.ts MIN_AUTO_OBSERVE_INTERVAL_MS / MAX_AUTO_OBSERVE_TICKS_PER_SESSION.
    const AUTO_OBSERVE_INTERVAL_MS = 1100;
    const MAX_AUTO_OBSERVE_TICKS = 200;
    const MAX_SPARKLINE_POINTS = 24;
    const MAX_CHRONICLE_ROWS = 12;

    let autoTimer = null;
    let autoTickCount = 0;

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function ensureContainer() {
        let el = document.getElementById('world-observatory');
        if (el) return el;
        const parent = document.getElementById('world-content');
        if (!parent) return null;
        el = document.createElement('div');
        el.id = 'world-observatory';
        el.className = 'hidden';
        el.innerHTML = `
            <div class="observatory-header">
                <span class="observatory-title">${escapeHtml(T('webview.observatory.title'))}</span>
                <span class="observatory-turn-chip">
                    <span class="observatory-live-dot" id="observatory-live-dot"></span>
                    <span id="observatory-turn-label">T0</span>
                </span>
                <span class="observatory-spacer"></span>
                <select class="observatory-mode-select" id="observatory-mode-select" aria-label="${escapeHtml(T('webview.observatory.modeLabel'))}">
                    <option value="watch">${escapeHtml(T('webview.observatory.modeWatch'))}</option>
                    <option value="advance">${escapeHtml(T('webview.observatory.modeAdvance'))}</option>
                </select>
                <button class="observatory-btn" id="observatory-tick-btn">${escapeHtml(T('webview.observatory.tickOnce'))}</button>
                <button class="observatory-btn" id="observatory-auto-btn">${escapeHtml(T('webview.observatory.autoStart'))}</button>
            </div>
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.marketsHeading'))}</div>
            <div class="observatory-market-grid" id="observatory-market-grid"></div>
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.chronicleHeading'))}</div>
            <div class="observatory-chronicle-list" id="observatory-chronicle-list"></div>
        `;
        parent.appendChild(el);

        const tickBtn = el.querySelector('#observatory-tick-btn');
        const autoBtn = el.querySelector('#observatory-auto-btn');
        const modeSelect = el.querySelector('#observatory-mode-select');
        if (tickBtn) {
            tickBtn.addEventListener('click', () => sendObserverTick(modeSelect ? modeSelect.value : 'watch'));
        }
        if (autoBtn) {
            autoBtn.addEventListener('click', () => toggleAutoObserve(modeSelect ? modeSelect.value : 'watch'));
        }
        return el;
    }

    function sendObserverTick(mode) {
        vscode.postMessage({ type: 'observerWorldTick', mode: mode === 'advance' ? 'advance' : 'watch' });
    }

    function stopAutoObserve() {
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
        autoTickCount = 0;
        const dot = document.getElementById('observatory-live-dot');
        const btn = document.getElementById('observatory-auto-btn');
        if (dot) dot.classList.remove('auto-on');
        if (btn) btn.textContent = T('webview.observatory.autoStart');
    }

    function toggleAutoObserve(mode) {
        if (autoTimer) {
            stopAutoObserve();
            return;
        }
        const dot = document.getElementById('observatory-live-dot');
        const btn = document.getElementById('observatory-auto-btn');
        if (dot) dot.classList.add('auto-on');
        if (btn) btn.textContent = T('webview.observatory.autoStop');
        autoTickCount = 0;
        autoTimer = setInterval(() => {
            autoTickCount++;
            if (autoTickCount > MAX_AUTO_OBSERVE_TICKS) {
                stopAutoObserve();
                return;
            }
            const modeSelect = document.getElementById('observatory-mode-select');
            sendObserverTick(modeSelect ? modeSelect.value : mode);
        }, AUTO_OBSERVE_INTERVAL_MS);
    }

    function sparklinePoints(series) {
        const trimmed = series.slice(-MAX_SPARKLINE_POINTS);
        const n = trimmed.length;
        if (n === 0) return { points: '', trend: 0 };
        const min = Math.min(...trimmed);
        const max = Math.max(...trimmed);
        const range = (max - min) || 0.1;
        const points = trimmed
            .map((v, i) => {
                const x = n > 1 ? (i * 116 / (n - 1)).toFixed(1) : '0.0';
                const y = (28 - ((v - min) / range) * 24).toFixed(1);
                return `${x},${y}`;
            })
            .join(' ');
        const trend = n > 1 ? trimmed[n - 1] - trimmed[0] : 0;
        return { points, trend, last: trimmed[n - 1] };
    }

    function renderMarkets(marketPriceHistory) {
        const grid = document.getElementById('observatory-market-grid');
        if (!grid) return;
        if (!marketPriceHistory || Object.keys(marketPriceHistory).length === 0) {
            grid.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.marketsEmpty'))}</div>`;
            return;
        }
        const cards = [];
        for (const [locId, byCommodity] of Object.entries(marketPriceHistory)) {
            for (const [commodityId, series] of Object.entries(byCommodity)) {
                if (!Array.isArray(series) || series.length === 0) continue;
                const { points, trend, last } = sparklinePoints(series);
                const color = trend > 0.05 ? '#f4a261' : trend < -0.05 ? '#b0e57c' : '#8c93a0';
                const arrow = trend > 0.05 ? '▲' : trend < -0.05 ? '▼' : '–';
                cards.push(`
                    <div class="observatory-market-card">
                        <div class="observatory-market-name-row">
                            <span class="observatory-market-name">${escapeHtml(commodityId)}</span>
                            <span class="observatory-market-idx" style="color:${color}">${escapeHtml(formatIndex(last))} ${arrow}</span>
                        </div>
                        <div class="observatory-market-loc">${escapeHtml(locId)}</div>
                        <svg class="observatory-spark" viewBox="0 0 116 30" preserveAspectRatio="none">
                            <polyline fill="none" stroke="${color}" stroke-width="1.5" points="${points}" />
                        </svg>
                    </div>
                `);
            }
        }
        grid.innerHTML = cards.length > 0
            ? cards.join('')
            : `<div class="observatory-empty">${escapeHtml(T('webview.observatory.marketsEmpty'))}</div>`;
    }

    function formatIndex(v) {
        return typeof v === 'number' ? `x${v.toFixed(2)}` : '';
    }

    function renderChronicle(events) {
        const list = document.getElementById('observatory-chronicle-list');
        if (!list) return;
        if (!Array.isArray(events) || events.length === 0) {
            list.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.chronicleEmpty'))}</div>`;
            return;
        }
        const rows = events
            .slice(-MAX_CHRONICLE_ROWS)
            .slice()
            .reverse()
            .map((ev) => {
                const severityClass = ev.severity === 'critical'
                    ? 'severity-critical'
                    : ev.severity === 'warning'
                        ? 'severity-warning'
                        : '';
                return `
                    <div class="observatory-chronicle-row">
                        <span class="observatory-chronicle-dot ${severityClass}"></span>
                        <span class="observatory-chronicle-text">${escapeHtml(ev.text)}</span>
                        <span class="observatory-chronicle-turn">T${escapeHtml(ev.worldTurn ?? '?')}</span>
                    </div>
                `;
            });
        list.innerHTML = rows.join('');
    }

    function renderObservatory(msg) {
        const el = ensureContainer();
        if (!el) return;

        if (!msg.enableWorldObservatory) {
            el.classList.add('hidden');
            stopAutoObserve();
            return;
        }
        el.classList.remove('hidden');

        const turnLabel = document.getElementById('observatory-turn-label');
        if (turnLabel) {
            turnLabel.textContent = `T${msg.worldTurn ?? 0}`;
        }

        renderMarkets(msg.marketPriceHistory);
        renderChronicle(msg.chronicle);
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'worldView') {
            renderObservatory(msg);
        }
    });
})();
