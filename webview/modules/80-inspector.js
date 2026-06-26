/* global window, document */

window.addEventListener('DOMContentLoaded', () => {
    // 既存のモジュールから呼ばれるイベントリスナーなどを登録
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'gameStateUpdate') {
            // If the message contains turnResult, update the inspector
            // However, gameStateSync might not pass turn_result.json yet.
            // We need to fetch or receive turn_result.json
            if (message.turnResult) {
                renderTurnResult(message.turnResult);
            }
        }
    });

    // Handle tab switching
    const tabs = document.querySelectorAll('#status-tabs .tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.getAttribute('data-target');
            if (targetId === 'pane-inspector') {
                tabs.forEach(t => t.classList.remove('active'));
                panes.forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('pane-inspector').classList.add('active');
            }
        });
    });
});

function renderTurnResult(turnResult) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const diceLedgerDiv = document.getElementById('inspector-dice-ledger');
    const statePatchDiv = document.getElementById('inspector-state-patch');
    const lorebookDiv = document.getElementById('inspector-lorebook');

    if (!turnResult) {
        emptyText.classList.remove('hidden');
        content.classList.add('hidden');
        return;
    }

    emptyText.classList.add('hidden');
    content.classList.remove('hidden');

    // Render Dice Ledger
    diceLedgerDiv.innerHTML = '';
    if (turnResult.diceLedger && turnResult.diceLedger.length > 0) {
        turnResult.diceLedger.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            let html = `<strong>${escapeHtml(entry.formula)}</strong> ➔ <span>${entry.total}</span>`;
            if (entry.reason) {
                html += ` <span class="tag-item">${escapeHtml(entry.reason)}</span>`;
            }
            if (entry.success !== undefined) {
                html += entry.success ? ' <span style="color:var(--text-success)">[Success]</span>' : ' <span style="color:var(--text-danger)">[Failure]</span>';
            }
            row.innerHTML = html;
            diceLedgerDiv.appendChild(row);
        });
    } else {
        diceLedgerDiv.innerHTML = '<span class="empty-text">No dice rolls</span>';
    }

    // Render State Patches
    statePatchDiv.innerHTML = '';
    if (turnResult.statePatch && turnResult.statePatch.length > 0) {
        turnResult.statePatch.forEach(patch => {
            const row = document.createElement('div');
            row.className = 'inspector-item diff-item';
            
            let icon = '🔄';
            let color = 'var(--text-color)';
            if (patch.op === 'add') { icon = '➕'; color = 'var(--text-success)'; }
            else if (patch.op === 'remove') { icon = '➖'; color = 'var(--text-danger)'; }
            
            row.innerHTML = `
                <span title="${patch.op}">${icon}</span> 
                <code style="color:${color}">${escapeHtml(patch.path)}</code>
                ${patch.value !== undefined ? `➔ <span class="patch-value">${escapeHtml(JSON.stringify(patch.value))}</span>` : ''}
            `;
            statePatchDiv.appendChild(row);
        });
    } else {
        statePatchDiv.innerHTML = '<span class="empty-text">No state changes</span>';
    }

    // Render Lorebook
    lorebookDiv.innerHTML = '';
    // Lorebook triggers might be in game_state.status or turnResult. We will need to pass them.
    lorebookDiv.innerHTML = '<span class="empty-text">No lore triggered</span>';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}
