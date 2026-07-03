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
                <span class="observatory-glyph" aria-hidden="true">🔭</span>
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
            <div class="observatory-section-heading">${escapeHtml(T('webview.observatory.bondsHeading'))}</div>
            <div class="observatory-bonds-wrap" id="observatory-bonds-wrap"></div>
            <div class="observatory-bonds-legend" id="observatory-bonds-legend"></div>
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

    // Shared vocab from 85-world.js (same bundle, loaded first — the 86-tile-overmap pattern).
    // Guarded with local fallbacks so this module stays self-sufficient if 85 renames them.
    const BOND_MILESTONE_ICON = typeof NPC_MILESTONE_ICON !== 'undefined'
        ? NPC_MILESTONE_ICON
        : { sworn_allies: '🛡️', inseparable: '💠', bitter_enemies: '🗡️', estranged: '💔', reconciled: '🕊️' };
    const BOND_LABEL_KEY = typeof NPC_BOND_LABEL_KEY !== 'undefined'
        ? NPC_BOND_LABEL_KEY
        : {
            ally: 'webview.world.npcBondAlly',
            friend: 'webview.world.npcBondFriend',
            rival: 'webview.world.npcBondRival',
            enemy: 'webview.world.npcBondEnemy',
        };
    const BOND_EDGE_STYLE = {
        ally: { stroke: 'var(--accent, #4f8ef7)', width: 3, opacity: 0.85, dash: '' },
        friend: { stroke: 'var(--accent, #4f8ef7)', width: 1.3, opacity: 0.45, dash: '' },
        rival: { stroke: '#f4a261', width: 1.5, opacity: 0.7, dash: '5 4' },
        enemy: { stroke: '#e76f51', width: 2.4, opacity: 0.85, dash: '5 4' },
    };
    const MAX_BOND_GRAPH_NODES = 12;

    function renderBondsGraph(bonds) {
        const wrap = document.getElementById('observatory-bonds-wrap');
        const legend = document.getElementById('observatory-bonds-legend');
        if (!wrap || !legend) return;

        const entries = (Array.isArray(bonds) ? bonds : [])
            .filter((b) => b && b.nameA && b.nameB && BOND_EDGE_STYLE[b.label]);
        if (entries.length === 0) {
            wrap.innerHTML = `<div class="observatory-empty">${escapeHtml(T('webview.observatory.bondsEmpty'))}</div>`;
            legend.innerHTML = '';
            return;
        }

        // Deterministic node set: first-appearance order, capped.
        const names = [];
        for (const b of entries) {
            if (!names.includes(b.nameA) && names.length < MAX_BOND_GRAPH_NODES) names.push(b.nameA);
            if (!names.includes(b.nameB) && names.length < MAX_BOND_GRAPH_NODES) names.push(b.nameB);
        }
        const drawable = entries.filter((b) => names.includes(b.nameA) && names.includes(b.nameB));

        // Ellipse layout — plenty for <=10 named NPCs, no physics needed.
        const W = 320;
        const H = names.length > 6 ? 210 : 180;
        const cx = W / 2;
        const cy = H / 2 - 8;
        const rx = W / 2 - 44;
        const ry = cy - 26;
        const pos = {};
        names.forEach((name, i) => {
            const angle = -Math.PI / 2 + (i * 2 * Math.PI) / names.length;
            pos[name] = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
        });

        const edgeParts = [];
        const badgeParts = [];
        for (const b of drawable) {
            const a = pos[b.nameA];
            const z = pos[b.nameB];
            const s = BOND_EDGE_STYLE[b.label];
            edgeParts.push(
                `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${z.x.toFixed(1)}" y2="${z.y.toFixed(1)}"`
                + ` stroke="${s.stroke}" stroke-width="${s.width}" opacity="${s.opacity}"`
                + (s.dash ? ` stroke-dasharray="${s.dash}"` : '')
                + ' />'
            );
            if (b.milestone && BOND_MILESTONE_ICON[b.milestone]) {
                const mx = (a.x + z.x) / 2;
                const my = (a.y + z.y) / 2;
                badgeParts.push(
                    `<text x="${mx.toFixed(1)}" y="${(my - 4).toFixed(1)}" text-anchor="middle" font-size="12">${BOND_MILESTONE_ICON[b.milestone]}</text>`
                );
            }
        }

        const nodeParts = names.map((name) => {
            const p = pos[name];
            const initial = escapeHtml(String(name).charAt(0));
            return `
                <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="13" class="observatory-bond-node" />
                <text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle" class="observatory-bond-initial">${initial}</text>
                <text x="${p.x.toFixed(1)}" y="${(p.y + 26).toFixed(1)}" text-anchor="middle" class="observatory-bond-name">${escapeHtml(name)}</text>
            `;
        });

        wrap.innerHTML = `
            <svg class="observatory-bonds-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(T('webview.observatory.bondsHeading'))}">
                ${edgeParts.join('')}
                ${nodeParts.join('')}
                ${badgeParts.join('')}
            </svg>
        `;

        // Legend: only labels actually present, using the same i18n as the Bonds list.
        const seenLabels = [...new Set(drawable.map((b) => b.label))];
        legend.innerHTML = seenLabels
            .map((label) => {
                const s = BOND_EDGE_STYLE[label];
                const line = `<span class="observatory-legend-line" style="background:${s.stroke};opacity:${s.opacity};${s.dash ? 'background:repeating-linear-gradient(90deg,' + s.stroke + ' 0 5px,transparent 5px 9px);' : ''}"></span>`;
                return `<span class="observatory-legend-item">${line}${escapeHtml(T(BOND_LABEL_KEY[label]))}</span>`;
            })
            .join('');
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
        renderBondsGraph(msg.npcBonds);
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'worldView') {
            renderObservatory(msg);
        }
    });
})();
