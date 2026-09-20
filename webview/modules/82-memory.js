/* global window, document, T, vscode */

window.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('memory-search-btn');
    const rebuildBtn = document.getElementById('memory-rebuild-btn');
    const backendSel = document.getElementById('memory-backend-select');
    const hintInput = document.getElementById('memory-hint-input');

    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const hint = hintInput ? hintInput.value.trim() : '';
            vscode.postMessage({ type: 'searchMemory', hint });
        });
    }
    if (rebuildBtn) {
        rebuildBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'rebuildMemoryIndex' });
        });
    }
    if (backendSel) {
        backendSel.addEventListener('change', () => {
            vscode.postMessage({ type: 'setMemoryBackend', backend: backendSel.value });
        });
    }
    if (hintInput) {
        hintInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                vscode.postMessage({ type: 'searchMemory', hint: hintInput.value.trim() });
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'memoryStatus') {
            renderMemoryStatus(message.status);
        }
        if (message.type === 'memorySearchResult') {
            renderMemorySearch(message);
        }
    });
});

function renderMemoryStatus(status) {
    const meta = document.getElementById('memory-status-meta');
    const backendSel = document.getElementById('memory-backend-select');
    if (!status) {
        return;
    }
    if (backendSel && status.backend) {
        backendSel.value = status.backend;
    }
    if (meta) {
        const updated = status.indexUpdated
            ? new Date(status.indexUpdated).toLocaleString()
            : (typeof T === 'function' ? T('webview.memory.noIndex') : 'no index');
        meta.textContent = typeof T === 'function'
            ? T('webview.memory.statusMeta', {
                count: String(status.chunkCount ?? 0),
                backend: status.backend || 'auto',
                updated
            })
            : `${status.chunkCount} chunks · ${status.backend} · ${updated}`;
    }
}

function renderMemorySearch(payload) {
    const list = document.getElementById('memory-search-results');
    const budget = document.getElementById('memory-token-budget');
    if (!list) {
        return;
    }
    const matches = payload.matches || [];
    const totalTokens = matches.reduce((sum, m) => sum + (m.tokenEstimate || 0), 0);

    if (budget) {
        budget.textContent = typeof T === 'function'
            ? T('webview.memory.tokenBudget', { tokens: String(totalTokens), count: String(matches.length) })
            : `~${totalTokens} tokens (${matches.length} matches)`;
    }

    list.innerHTML = '';
    if (matches.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.memory.noMatches') : 'No matches')}</div>`;
        return;
    }

    matches.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const score = m.score !== undefined ? `score ${m.score}` : '';
        row.innerHTML = `
            <strong>${escapeHtml(m.label)}</strong>
            <span class="tag-item">${escapeHtml(m.source)}</span>
            ${score ? `<span class="tag-item">${escapeHtml(score)}</span>` : ''}
            <span class="tag-item">~${m.tokenEstimate || 0} tok</span>
            <div class="lorebook-preview">${escapeHtml(m.preview || '')}</div>
        `;
        list.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}