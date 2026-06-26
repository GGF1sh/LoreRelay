/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'promptContext') {
            renderPromptContext(message.breakdown);
        }
        if (message.type === 'gameStateUpdate') {
            if (message.turnResult) {
                renderTurnResult(message.turnResult);
            }
            if (message.schemaErrors) {
                renderSchemaErrors(message.schemaErrors);
            } else if (message.state) {
                renderSchemaErrors([]);
            }
            if (message.state) {
                renderHiddenState(message.state.hiddenState);
            }
        }
    });
});

function renderPromptContext(breakdown) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const summaryDiv = document.getElementById('inspector-prompt-summary');
    const sectionsDiv = document.getElementById('inspector-prompt-sections');
    const memoryDiv = document.getElementById('inspector-memory-matches');
    const loreDiv = document.getElementById('inspector-lore-matches');

    if (!breakdown || !summaryDiv || !sectionsDiv) {
        return;
    }

    if (emptyText) {
        emptyText.classList.add('hidden');
    }
    if (content) {
        content.classList.remove('hidden');
    }

    const backend = breakdown.memoryBackend || 'auto';
    const tokens = breakdown.totalTokensEstimate ?? 0;
    const chars = breakdown.totalChars ?? 0;
    summaryDiv.textContent = typeof T === 'function'
        ? T('webview.inspector.promptSummary', {
            backend,
            tokens: String(tokens),
            chars: String(chars)
        })
        : `Backend: ${backend} · ~${tokens} tokens · ${chars} chars`;

    sectionsDiv.innerHTML = '';
    (breakdown.sections || []).forEach((section) => {
        const row = document.createElement('details');
        row.className = 'inspector-item prompt-section';
        row.innerHTML = `
            <summary><strong>${escapeHtml(section.label)}</strong>
              <span class="tag-item">~${section.tokenEstimate} tok</span>
            </summary>
            <pre class="prompt-preview">${escapeHtml(section.text)}</pre>
        `;
        sectionsDiv.appendChild(row);
    });
    if (!breakdown.sections || breakdown.sections.length === 0) {
        sectionsDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPromptSections'))}</span>`;
    }

    if (memoryDiv) {
        memoryDiv.innerHTML = '';
        const matches = breakdown.memoryMatches || [];
        if (matches.length === 0) {
            memoryDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noMemory'))}</span>`;
        } else {
            matches.forEach((m) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<strong>${escapeHtml(m.label)}</strong> <span class="tag-item">${escapeHtml(m.source)}</span><br><span class="patch-value">${escapeHtml(m.preview)}</span>`;
                memoryDiv.appendChild(row);
            });
        }
    }

    if (loreDiv) {
        loreDiv.innerHTML = '';
        const lore = breakdown.matchedLore || [];
        if (lore.length === 0) {
            loreDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        } else {
            lore.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                const keys = (entry.keys || []).join(', ');
                row.innerHTML = `<strong>📖 ${escapeHtml(entry.label)}</strong>${keys ? ` <span class="tag-item">${escapeHtml(keys)}</span>` : ''}<br><span class="patch-value">${escapeHtml(entry.preview)}</span>`;
                loreDiv.appendChild(row);
            });
        }
    }
}

function renderSchemaErrors(errors) {
    const schemaDiv = document.getElementById('inspector-schema-errors');
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    if (!schemaDiv) {
        return;
    }

    if (errors && errors.length > 0) {
        if (emptyText) {
            emptyText.classList.add('hidden');
        }
        if (content) {
            content.classList.remove('hidden');
        }
        schemaDiv.innerHTML = '';
        errors.forEach((err) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            row.style.color = 'var(--text-danger)';
            row.textContent = String(err);
            schemaDiv.appendChild(row);
        });
    } else {
        schemaDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noSchemaErrors') ? T('webview.inspector.noSchemaErrors') : 'No schema errors')}</span>`;
    }
}

function renderHiddenState(hiddenState) {
    const hiddenStateDiv = document.getElementById('inspector-hidden-state');
    if (!hiddenStateDiv) return;
    
    if (hiddenState && Object.keys(hiddenState).length > 0) {
        hiddenStateDiv.textContent = JSON.stringify(hiddenState, null, 2);
    } else {
        hiddenStateDiv.innerHTML = `<span class="empty-text">${escapeHtml(typeof T === 'function' && T('webview.inspector.noHiddenState') ? T('webview.inspector.noHiddenState') : 'No hidden state')}</span>`;
    }
}

function renderTurnResult(turnResult) {
    const emptyText = document.getElementById('inspector-empty-text');
    const content = document.getElementById('inspector-content');
    const turnIdDiv = document.getElementById('inspector-turn-id');
    const integrityDiv = document.getElementById('inspector-integrity');
    const diceLedgerDiv = document.getElementById('inspector-dice-ledger');
    const statePatchDiv = document.getElementById('inspector-state-patch');
    const lorebookDiv = document.getElementById('inspector-lorebook');

    if (!turnResult || !emptyText || !content) {
        return;
    }

    emptyText.classList.add('hidden');
    content.classList.remove('hidden');

    if (turnIdDiv) {
        turnIdDiv.innerHTML = '';
        const idSpan = document.createElement('span');
        idSpan.textContent = turnResult.turnId || '?';
        turnIdDiv.appendChild(idSpan);

        if (turnResult.turnId) {
            const branchBtn = document.createElement('button');
            branchBtn.className = 'glass-btn';
            branchBtn.style.marginLeft = '1rem';
            branchBtn.style.padding = '2px 6px';
            branchBtn.style.fontSize = '12px';
            branchBtn.textContent = '⎇ Branch Timeline';
            branchBtn.title = 'Branch timeline from this turn';
            branchBtn.onclick = () => {
                if (confirm('Create a new timeline branch starting from this turn?')) {
                    vscode.postMessage({ type: 'branchTimeline', turnId: turnResult.turnId });
                }
            };
            turnIdDiv.appendChild(branchBtn);
        }
    }

    if (integrityDiv) {
        integrityDiv.innerHTML = '';
        const rows = [];
        if (turnResult.beforeHash) {
            rows.push({ label: 'before', value: turnResult.beforeHash });
        }
        if (turnResult.afterHash) {
            rows.push({ label: 'after', value: turnResult.afterHash });
        }
        if (turnResult.appliedAt) {
            rows.push({ label: 'applied', value: turnResult.appliedAt });
        }
        if (rows.length === 0) {
            integrityDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noIntegrity'))}</span>`;
        } else {
            rows.forEach((row) => {
                const el = document.createElement('div');
                el.className = 'inspector-item';
                el.innerHTML = `<strong>${escapeHtml(row.label)}</strong> <code class="patch-value">${escapeHtml(row.value)}</code>`;
                integrityDiv.appendChild(el);
            });
        }
    }

    if (diceLedgerDiv) {
        diceLedgerDiv.innerHTML = '';
        if (turnResult.diceLedger && turnResult.diceLedger.length > 0) {
            const totalCount = turnResult.diceLedger.length;
            const visibleLedger = turnResult.diceLedger.slice(0, 30);
            visibleLedger.forEach((entry) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                let html = `<strong>${escapeHtml(entry.formula)}</strong> ➔ <span>${entry.total}</span>`;
                if (entry.reason) {
                    html += ` <span class="tag-item">${escapeHtml(entry.reason)}</span>`;
                }
                if (entry.success !== undefined) {
                    const tag = entry.success
                        ? T('webview.inspector.success')
                        : T('webview.inspector.failure');
                    const color = entry.success ? 'var(--text-success)' : 'var(--text-danger)';
                    html += ` <span style="color:${color}">[${escapeHtml(tag)}]</span>`;
                }
                row.innerHTML = html;
                diceLedgerDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.moreRolls', { count: String(totalCount - 30) });
                diceLedgerDiv.appendChild(row);
            }
        } else {
            diceLedgerDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noDice'))}</span>`;
        }
    }

    if (statePatchDiv) {
        statePatchDiv.innerHTML = '';
        if (turnResult.statePatch && turnResult.statePatch.length > 0) {
            const totalCount = turnResult.statePatch.length;
            const visiblePatches = turnResult.statePatch.slice(0, 30);
            visiblePatches.forEach((patch) => {
                const row = document.createElement('div');
                row.className = 'inspector-item diff-item';

                let icon = '🔄';
                let color = 'var(--text-color)';
                if (patch.op === 'add') { icon = '➕'; color = 'var(--text-success)'; }
                else if (patch.op === 'remove') { icon = '➖'; color = 'var(--text-danger)'; }

                row.innerHTML = `
                    <span title="${escapeHtml(patch.op)}">${icon}</span>
                    <code style="color:${color}">${escapeHtml(patch.path)}</code>
                    ${patch.value !== undefined ? `➔ <span class="patch-value">${escapeHtml(JSON.stringify(patch.value))}</span>` : ''}
                `;
                statePatchDiv.appendChild(row);
            });
            if (totalCount > 30) {
                const row = document.createElement('div');
                row.className = 'inspector-item empty-text';
                row.textContent = T('webview.inspector.morePatches', { count: String(totalCount - 30) });
                statePatchDiv.appendChild(row);
            }
        } else {
            statePatchDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noPatch'))}</span>`;
        }
    }

    if (lorebookDiv) {
        lorebookDiv.innerHTML = '';
        if (turnResult.triggeredLore && turnResult.triggeredLore.length > 0) {
            turnResult.triggeredLore.forEach((label) => {
                const row = document.createElement('div');
                row.className = 'inspector-item';
                row.innerHTML = `<span class="tag-item">📖 ${escapeHtml(label)}</span>`;
                lorebookDiv.appendChild(row);
            });
        } else {
            lorebookDiv.innerHTML = `<span class="empty-text">${escapeHtml(T('webview.inspector.noLore'))}</span>`;
        }
    }
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