/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'promptContext') {
            renderPromptContext(message.breakdown);
        }
        if (message.type === 'gameStateUpdate') {
            if (typeof shouldApplyGameStateUpdate === 'function' && !shouldApplyGameStateUpdate(message)) {
                return;
            }
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
        if (message.type === 'gitTimelineStatus') {
            renderGitTimeline(message);
        }
        if (message.type === 'chronicleData') {
            renderChronicle(message.chapters);
        }
        if (message.type === 'replayExportResult') {
            renderReplayExportResult(message);
        }
    });

    const refreshBtn = document.getElementById('inspector-git-refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', requestGitTimeline);
    }
    const chronicleRefreshBtn = document.getElementById('inspector-chronicle-refresh-btn');
    if (chronicleRefreshBtn) {
        chronicleRefreshBtn.addEventListener('click', requestChronicle);
    }
    const replayExportBtn = document.getElementById('inspector-replay-export-btn');
    if (replayExportBtn) {
        replayExportBtn.addEventListener('click', requestReplayExport);
    }

    requestGitTimeline();
    requestChronicle();
});

function requestReplayExport() {
    const formatEl = document.getElementById('inspector-replay-format');
    const imagesEl = document.getElementById('inspector-replay-images');
    const gmEl = document.getElementById('inspector-replay-gm');
    const diceEl = document.getElementById('inspector-replay-dice');
    const statusEl = document.getElementById('inspector-replay-status');
    const btn = document.getElementById('inspector-replay-export-btn');
    const format = formatEl && formatEl.value === 'html' ? 'html' : 'markdown';
    if (statusEl && typeof T === 'function') {
        statusEl.textContent = T('webview.inspector.replayExporting');
    }
    if (btn) {
        btn.disabled = true;
    }
    vscode.postMessage({
        type: 'exportReplay',
        format,
        includeImages: imagesEl ? imagesEl.checked : true,
        includeGm: gmEl ? gmEl.checked : true,
        includeDice: diceEl ? diceEl.checked : false
    });
}

function renderReplayExportResult(result) {
    const statusEl = document.getElementById('inspector-replay-status');
    const btn = document.getElementById('inspector-replay-export-btn');
    if (btn) {
        btn.disabled = false;
    }
    if (!statusEl) { return; }
    if (result && result.ok) {
        statusEl.textContent = typeof T === 'function'
            ? T('webview.inspector.replayResultOk', { path: String(result.path || '') })
            : `Exported: ${result.path || ''}`;
    } else {
        statusEl.textContent = typeof T === 'function'
            ? T('webview.inspector.replayResultFail', { message: String(result?.message || '') })
            : String(result?.message || 'Export failed');
    }
}

function requestChronicle() {
    vscode.postMessage({ type: 'requestChronicle' });
}

function renderChronicle(chapters) {
    const listEl = document.getElementById('inspector-chronicle-list');
    if (!listEl) { return; }
    listEl.innerHTML = '';
    const items = Array.isArray(chapters) ? chapters : [];
    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-text';
        empty.textContent = typeof T === 'function'
            ? T('webview.inspector.chronicleEmpty')
            : 'No chronicle entries yet. Complete GM turns to build the journal.';
        listEl.appendChild(empty);
        return;
    }

    for (const chapter of items) {
        if (!chapter || typeof chapter.title !== 'string') { continue; }
        const details = document.createElement('details');
        details.className = 'inspector-item';
        details.open = items.length <= 2;

        const summary = document.createElement('summary');
        const eventCount = Array.isArray(chapter.events) ? chapter.events.length : 0;
        const countLabel = typeof T === 'function'
            ? T('webview.inspector.chronicleEventCount', { count: String(eventCount) })
            : `${eventCount} events`;
        summary.textContent = `${chapter.title} — ${countLabel}`;
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'inspector-list';
        for (const ev of chapter.events || []) {
            if (!ev || typeof ev.text !== 'string') { continue; }
            const row = document.createElement('div');
            row.className = 'inspector-item';
            const kind = ev.kind ? `[${ev.kind}] ` : '';
            row.textContent = `${kind}${ev.text}`;
            body.appendChild(row);
        }
        details.appendChild(body);
        listEl.appendChild(details);
    }
}

function requestGitTimeline() {
    vscode.postMessage({ type: 'requestGitTimeline' });
}

function renderGitTimeline(status) {
    const currentEl = document.getElementById('inspector-git-current-branch');
    const listEl = document.getElementById('inspector-git-branch-list');
    if (!currentEl || !listEl) { return; }

    if (!status.enabled) {
        currentEl.textContent = typeof T === 'function'
            ? T('webview.inspector.gitTimelineDisabled')
            : 'Git Timeline is not enabled for this workspace yet. Play a turn to be prompted.';
        currentEl.classList.add('empty-text');
        listEl.innerHTML = '';
        return;
    }

    currentEl.classList.remove('empty-text');
    currentEl.textContent = typeof T === 'function'
        ? T('webview.inspector.gitCurrentBranch', { branch: status.currentBranch || '(unknown)' })
        : `Current branch: ${status.currentBranch || '(unknown)'}`;

    listEl.innerHTML = '';
    const branches = Array.isArray(status.branches) ? status.branches : [];
    if (branches.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-text';
        empty.textContent = typeof T === 'function'
            ? T('webview.inspector.gitNoBranches')
            : 'No timeline branches yet. Use "Branch from here" on a past turn to create one.';
        listEl.appendChild(empty);
        return;
    }

    for (const b of branches) {
        if (!b || typeof b.name !== 'string') { continue; }
        const row = document.createElement('div');
        row.className = 'inspector-item';

        const label = document.createElement('span');
        label.textContent = b.name + (b.isCurrent ? ' (current)' : '');
        row.appendChild(label);

        if (!b.isCurrent) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'small-btn';
            btn.textContent = typeof T === 'function' ? T('webview.inspector.gitSwitch') : 'Switch';
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'switchGitBranch', branchName: b.name });
            });
            row.appendChild(btn);
        }

        listEl.appendChild(row);
    }
}

function contextInspectorDecisionLabel(decision) {
    const key = `webview.inspector.contextInspector.decision.${decision}`;
    return typeof T === 'function' ? T(key) : decision;
}

function contextInspectorCategoryLabel(category) {
    const key = `webview.inspector.contextInspector.category.${category}`;
    return typeof T === 'function' ? T(key) : category;
}

function renderWorldStateParseWarnings(warnings) {
    const container = document.getElementById('inspector-world-state-warnings');
    if (!container) { return; }

    container.innerHTML = '';
    if (!Array.isArray(warnings) || warnings.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const heading = document.createElement('div');
    heading.className = 'inspector-item context-inspector-group-title';
    heading.textContent = typeof T === 'function'
        ? T('webview.inspector.worldStateWarnings.title')
        : 'World state parse warnings';
    container.appendChild(heading);

    for (const line of warnings) {
        const row = document.createElement('div');
        row.className = 'inspector-item world-state-warning';
        row.textContent = String(line);
        container.appendChild(row);
    }
}

function renderContextInspector(report) {
    const container = document.getElementById('inspector-context-inspector');
    if (!container) { return; }

    container.innerHTML = '';
    if (!report || !Array.isArray(report.items) || report.items.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    const summary = document.createElement('div');
    summary.className = 'inspector-item context-inspector-summary';
    summary.textContent = typeof T === 'function'
        ? T('webview.inspector.contextInspector.summary', {
            target: String(report.targetChars ?? 0),
            original: String(report.totalOriginalChars ?? 0),
            final: String(report.totalFinalChars ?? 0),
            included: String(report.includedCount ?? 0),
            omitted: String(report.omittedCount ?? 0),
            truncated: String(report.truncatedCount ?? 0),
        })
        : `Budget ${report.targetChars} chars | original ${report.totalOriginalChars} | final ${report.totalFinalChars} | included ${report.includedCount} | omitted ${report.omittedCount} | truncated ${report.truncatedCount}`;
    container.appendChild(summary);

    const groups = [
        { key: 'included', titleKey: 'webview.inspector.contextInspector.included', filter: (item) => item.decision === 'included' || item.decision === 'included_pinned' || item.decision === 'truncated_by_budget' },
        { key: 'omitted', titleKey: 'webview.inspector.contextInspector.omitted', filter: (item) => item.decision === 'evicted_by_budget' || item.decision === 'skipped_inactive' || item.decision === 'skipped_empty' },
        { key: 'truncated', titleKey: 'webview.inspector.contextInspector.truncated', filter: (item) => item.decision === 'truncated_by_budget' },
    ];

    for (const group of groups) {
        const items = report.items.filter(group.filter);
        if (items.length === 0) { continue; }

        const heading = document.createElement('div');
        heading.className = 'inspector-item context-inspector-group-title';
        heading.textContent = typeof T === 'function' ? T(group.titleKey) : group.key;
        container.appendChild(heading);

        for (const item of items) {
            const row = document.createElement('details');
            row.className = 'inspector-item prompt-section context-inspector-item';

            const summaryEl = document.createElement('summary');
            const decision = contextInspectorDecisionLabel(item.decision);
            const charsLabel = typeof T === 'function'
                ? T('webview.inspector.contextInspector.chars', {
                    final: String(item.finalChars ?? 0),
                    original: String(item.originalChars ?? 0),
                })
                : `${item.finalChars}/${item.originalChars} chars`;
            summaryEl.innerHTML = `<strong>${escapeHtml(item.label || item.id)}</strong> `
                + `<span class="tag-item">${escapeHtml(contextInspectorCategoryLabel(item.category))}</span> `
                + `<span class="tag-item">P${escapeHtml(String(item.priority ?? 0))}</span> `
                + `<span class="tag-item">${escapeHtml(decision)}</span> `
                + `<span class="tag-item">${escapeHtml(charsLabel)}</span> `
                + `<span class="tag-item">~${escapeHtml(String(item.tokenEstimate ?? 0))} tok</span>`;
            row.appendChild(summaryEl);

            if (item.preview) {
                const preview = document.createElement('pre');
                preview.className = 'prompt-preview';
                preview.textContent = item.preview;
                row.appendChild(preview);
            }

            container.appendChild(row);
        }
    }
}

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
    const baseSummary = typeof T === 'function'
        ? T('webview.inspector.promptSummary', {
            backend,
            tokens: String(tokens),
            chars: String(chars)
        })
        : `Backend: ${backend} ? ~${tokens} tokens ? ${chars} chars`;
    const budget = breakdown.budget;
    const budgetSummary = budget
        ? (typeof T === 'function'
            ? T('webview.inspector.promptBudget', {
                mode: String(budget.mode || 'auto'),
                tokens: String(budget.targetTokens || 0)
            })
            : `Budget: ${budget.mode || 'auto'} / ~${budget.targetTokens || 0} tokens`)
        : '';
    summaryDiv.textContent = budgetSummary ? `${baseSummary} | ${budgetSummary}` : baseSummary;
    const budgetDetails = Array.isArray(budget?.details)
        ? budget.details.filter((d) => d && typeof d.label === 'string').slice(0, 9)
        : [];
    if (budgetDetails.length > 0) {
        const details = document.createElement('div');
        details.className = 'prompt-budget-details';
        details.textContent = budgetDetails
            .map((d) => `${d.label}: ${Number(d.usedChars || 0)}/${Number(d.limitChars || 0)} chars`)
            .join(' | ');
        summaryDiv.appendChild(details);
    }

    renderContextInspector(breakdown.contextInspector);
    renderWorldStateParseWarnings(breakdown.worldStateParseWarnings);

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
    const livingWorldOpsSection = document.getElementById('inspector-living-world-ops-section');
    const livingWorldOpsDiv = document.getElementById('inspector-living-world-ops');

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
                // Confirmation happens extension-side (native modal); webview confirm()
                // is silently blocked by the VS Code webview iframe sandbox.
                vscode.postMessage({ type: 'branchTimeline', turnId: turnResult.turnId });
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

    renderLivingWorldOps(turnResult, livingWorldOpsSection, livingWorldOpsDiv);
}

function renderLivingWorldOps(turnResult, section, listEl) {
    if (!section || !listEl) { return; }

    const tradeOps = Array.isArray(turnResult?.tradeOps) ? turnResult.tradeOps : [];
    const npcAgencyOps = Array.isArray(turnResult?.npcAgencyOps) ? turnResult.npcAgencyOps : [];
    const hasOps = tradeOps.length > 0 || npcAgencyOps.length > 0;
    section.classList.toggle('hidden', !hasOps);
    listEl.innerHTML = '';
    if (!hasOps) { return; }

    if (tradeOps.length > 0) {
        const head = document.createElement('div');
        head.className = 'inspector-item';
        head.innerHTML = `<strong>${escapeHtml(T('webview.inspector.tradeOps'))}</strong> <span class="tag-item">${tradeOps.length}</span>`;
        listEl.appendChild(head);
        tradeOps.slice(0, 12).forEach((op) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            row.innerHTML = `
                <span class="tag-item">${escapeHtml(op.op || '?')}</span>
                <span>${escapeHtml(op.qty ?? '?')} x ${escapeHtml(op.commodityId || '?')}</span>
                <code class="patch-value">@${escapeHtml(op.marketLocationId || '?')}</code>
            `;
            listEl.appendChild(row);
        });
    }

    if (npcAgencyOps.length > 0) {
        const head = document.createElement('div');
        head.className = 'inspector-item';
        head.innerHTML = `<strong>${escapeHtml(T('webview.inspector.npcAgencyOps'))}</strong> <span class="tag-item">${npcAgencyOps.length}</span>`;
        listEl.appendChild(head);
        npcAgencyOps.slice(0, 12).forEach((op) => {
            const row = document.createElement('div');
            row.className = 'inspector-item';
            const precision = op.precision || 'unknown';
            if (precision === 'unknown') {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span class="tag-item">${escapeHtml(T('webview.world.npcWhereaboutsUnknown'))}</span>
                `;
            } else if (precision === 'approximate') {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span>→ ${escapeHtml(T('webview.world.npcHeadingVague'))}</span>
                    <span class="tag-item">T${escapeHtml(op.arrivesTurn ?? '?')}</span>
                `;
            } else {
                row.innerHTML = `
                    <code class="patch-value">${escapeHtml(op.npcId || '?')}</code>
                    <span>→ ${escapeHtml(op.locationId || '?')}</span>
                    <span class="tag-item">T${escapeHtml(op.arrivesTurn ?? '?')}</span>
                    ${op.agenda ? `<span class="tag-item">${escapeHtml(op.agenda)}</span>` : ''}
                `;
            }
            listEl.appendChild(row);
        });
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

// Debug Console: bulk world sim + sandbox quick commands
(function () {
    const section = document.getElementById('inspector-debug-console-section');
    const stepsInput = document.getElementById('inspector-bulk-sim-steps');
    const runBtn = document.getElementById('inspector-bulk-sim-run');
    const resultEl = document.getElementById('inspector-bulk-sim-result');
    const sandboxBadge = document.getElementById('inspector-debug-sandbox-badge');
    const quickWrap = document.getElementById('inspector-debug-quick-wrap');
    const quickChips = document.getElementById('inspector-debug-quick-chips');
    const DEFAULT_QUICK = ['ヘルプ', '状態', '宿で休む', 'エルダの好感度を上げて', '地図の霧を晴らして', 'HPを全回復'];
    let maxSteps = 50;
    let running = false;

    function setVisible(show) {
        if (!section) { return; }
        section.classList.toggle('hidden', !show);
    }

    function renderQuickChips(commands) {
        if (!quickChips) { return; }
        quickChips.innerHTML = '';
        const list = Array.isArray(commands) && commands.length > 0 ? commands : DEFAULT_QUICK;
        list.forEach((cmd) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'start-hub-preset-chip';
            chip.textContent = cmd;
            chip.addEventListener('click', () => {
                vscode.postMessage({ type: 'insertChatText', text: cmd });
            });
            quickChips.appendChild(chip);
        });
    }

    function setSandboxUi(active) {
        if (sandboxBadge) {
            sandboxBadge.classList.toggle('hidden', !active);
        }
        if (quickWrap) {
            quickWrap.classList.toggle('hidden', !active);
        }
        if (active) {
            renderQuickChips(DEFAULT_QUICK);
        }
    }

    function renderSummary(summary) {
        if (!resultEl || typeof T !== 'function') { return; }
        resultEl.textContent = T('webview.inspector.bulkSimResult', {
            start: String(summary.startWorldTurn),
            end: String(summary.endWorldTurn),
            events: String(summary.totalEventsEmitted),
            available: String(summary.questHooksAvailable),
        });
        if (summary.notableEvents && summary.notableEvents.length > 0) {
            const lines = summary.notableEvents.map((e) => `[${e.severity}] T${e.worldTurn}: ${e.message}`);
            resultEl.textContent += '\n' + lines.join('\n');
        }
    }

    if (runBtn && stepsInput) {
        runBtn.addEventListener('click', () => {
            if (running) { return; }
            const steps = parseInt(stepsInput.value, 10) || 0;
            if (steps < 1) { return; }
            running = true;
            runBtn.disabled = true;
            if (resultEl && typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.bulkSimRunning');
            }
            vscode.postMessage({ type: 'bulkAdvanceWorldSim', steps: Math.min(steps, maxSteps) });
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            setVisible(show);
            setSandboxUi(!!message.debugScenarioActive);
            if (typeof message.bulkWorldSimMaxSteps === 'number' && message.bulkWorldSimMaxSteps > 0) {
                maxSteps = message.bulkWorldSimMaxSteps;
                if (stepsInput) {
                    stepsInput.max = String(maxSteps);
                    const cur = parseInt(stepsInput.value, 10) || 10;
                    if (cur > maxSteps) { stepsInput.value = String(maxSteps); }
                }
            }
        }
        if (message.type === 'bulkWorldSimResult') {
            running = false;
            if (runBtn) { runBtn.disabled = false; }
            if (!resultEl) { return; }
            if (message.ok && message.summary) {
                renderSummary(message.summary);
            } else if (typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.bulkSimFailed', {
                    reason: String(message.reason || 'unknown'),
                });
            }
        }
    });

    vscode.postMessage({ type: 'getDebugCapabilities' });
})();

// Living World market debug (Inspector, commerce ON + debug console visible)
(function () {
    const wrap = document.getElementById('inspector-lw-market-debug');
    const locSelect = document.getElementById('inspector-lw-market-location');
    const commoditySelect = document.getElementById('inspector-lw-market-commodity');
    const multInput = document.getElementById('inspector-lw-market-mult');
    const applyBtn = document.getElementById('inspector-lw-market-apply');
    const resultEl = document.getElementById('inspector-lw-market-result');
    let busy = false;

    function fillSelect(select, items, fallbackLabel) {
        if (!select) { return; }
        select.innerHTML = '';
        (items || []).forEach((item) => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name || item.id;
            select.appendChild(opt);
        });
        if (!select.options.length && fallbackLabel) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = fallbackLabel;
            select.appendChild(opt);
        }
    }

    function setVisible(show) {
        if (wrap) {
            wrap.classList.toggle('hidden', !show);
        }
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            if (busy || !locSelect || !commoditySelect || !multInput) { return; }
            const locationId = locSelect.value;
            const commodityId = commoditySelect.value;
            const multiplier = parseFloat(multInput.value);
            if (!locationId || !commodityId || !Number.isFinite(multiplier) || multiplier <= 0) { return; }
            busy = true;
            applyBtn.disabled = true;
            if (resultEl && typeof T === 'function') {
                resultEl.textContent = T('webview.inspector.lwMarketRunning');
            }
            vscode.postMessage({
                type: 'livingWorldMarketDebug',
                locationId,
                commodityId,
                multiplier,
            });
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'debugCapabilities') {
            setVisible(!!message.livingWorldMarketDebug);
            if (message.livingWorldMarketDebug) {
                fillSelect(locSelect, message.marketLocations, '—');
                fillSelect(commoditySelect, message.marketCommodities, '—');
            }
        }
        if (message.type === 'livingWorldMarketDebugResult') {
            busy = false;
            if (applyBtn) { applyBtn.disabled = false; }
            if (!resultEl || typeof T !== 'function') { return; }
            if (message.ok) {
                resultEl.textContent = T('webview.inspector.lwMarketDone', {
                    applied: String(message.applied ?? 1),
                });
            } else {
                resultEl.textContent = T('webview.inspector.lwMarketFailed', {
                    reason: String(message.reason || 'unknown'),
                });
            }
        }
    });
})();
