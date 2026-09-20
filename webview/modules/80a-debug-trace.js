/* global window, document, T, escapeHtml */
/* Debug Trace Inspector (Phase B): read-only render of `debugTraceUpdate` messages.
   No postMessage other than none — audience filtering is a pure local projection,
   mirroring src/debugTraceCore.ts:projectDebugTraceBuffer(). See
   docs/DEBUG_TRACE_INSPECTOR_UI_DESIGN.md for the full design. */

(function () {
    const section = document.getElementById('inspector-debug-trace-section');
    const toggle = document.getElementById('debug-trace-audience-toggle');
    const warningsEl = document.getElementById('inspector-debug-trace-warnings');
    const runsEl = document.getElementById('inspector-debug-trace-runs');

    if (!section || !toggle || !warningsEl || !runsEl) {
        return;
    }

    const AUDIENCES = ['internal', 'gm_safe', 'player_safe'];
    let currentAudience = 'internal';
    let lastBuffer = null;
    let lastLinkWarnings = [];
    // UX polish (2026-07-04 review): preserve user expand/collapse state across the
    // frequent `debugTraceUpdate` re-renders a multi-step bulk sim produces (one
    // message per simulated step). Only a run's *first* appearance gets a default.
    const openEntryIds = new Set(); // `${runId}:${traceId}`
    const runOpenState = new Map(); // runId -> boolean, once known (first-seen default applied once)

    function audienceRank(audience) {
        if (audience === 'internal') { return 2; }
        if (audience === 'gm_safe') { return 1; }
        if (audience === 'player_safe') { return 0; }
        return -1;
    }

    function audienceLabel(audience) {
        const key = `webview.inspector.debugTrace.audience.${audience === 'gm_safe' ? 'gmSafe' : audience === 'player_safe' ? 'playerSafe' : 'internal'}`;
        return typeof T === 'function' ? T(key) : audience;
    }

    function phaseLabel(phase) {
        const key = `webview.inspector.debugTrace.phase.${phase}`;
        return typeof T === 'function' ? T(key) : phase;
    }

    // Local projection mirroring debugTraceCore.ts:projectDebugTraceBuffer — no host round-trip.
    function projectEntries(entries, audience) {
        const maxRank = audienceRank(audience);
        return entries.filter((e) => audienceRank(e.audience) <= maxRank);
    }

    function groupByRun(entries) {
        const order = [];
        const byRun = new Map();
        for (const entry of entries) {
            if (!byRun.has(entry.runId)) {
                byRun.set(entry.runId, []);
                order.push(entry.runId);
            }
            byRun.get(entry.runId).push(entry);
        }
        // Newest run last-in-buffer first.
        return order.reverse().map((runId) => ({ runId, entries: byRun.get(runId) }));
    }

    // Adjacency-grouped depth-first order: a child renders immediately after its
    // parent (and before any of the parent's later siblings), instead of raw
    // insertion order. debugTraceHostCore/debugTraceEmitCore append phase-by-phase
    // (all scans, then the gate, then all per-NPC decisions, then all effects), so
    // without this a decision's own effect row can land several rows below
    // unrelated sibling decisions — confirmed during the 2026-07-04 UX review.
    function traceEntryKey(runId, traceId) {
        return `${runId}:${traceId}`;
    }

    function buildOrderedEntries(entries) {
        const byId = new Map(entries.map((e) => [e.traceId, e]));
        const childrenByParent = new Map();
        const roots = [];
        for (const e of entries) {
            const parent = e.parentTraceId && e.parentTraceId !== e.traceId ? byId.get(e.parentTraceId) : undefined;
            if (parent) {
                if (!childrenByParent.has(parent.traceId)) { childrenByParent.set(parent.traceId, []); }
                childrenByParent.get(parent.traceId).push(e);
            } else {
                roots.push(e);
            }
        }
        const out = [];
        function visit(entry, depth, ancestors) {
            out.push({ entry, depth });
            const kids = childrenByParent.get(entry.traceId) || [];
            for (const kid of kids) {
                if (ancestors.has(kid.traceId)) { continue; } // defensive cycle guard
                const nextAncestors = new Set(ancestors);
                nextAncestors.add(kid.traceId);
                visit(kid, depth + 1, nextAncestors);
            }
        }
        for (const root of roots) {
            visit(root, 0, new Set([root.traceId]));
        }
        return out;
    }

    function renderConditions(conditions) {
        if (!Array.isArray(conditions) || conditions.length === 0) { return ''; }
        // Failures first — the diagnostic value of a conditions[] list is almost
        // always "which check failed", so surface that before the checks that passed.
        const ordered = conditions
            .map((c, idx) => ({ c, idx }))
            .sort((a, b) => (a.c.result === b.c.result ? a.idx - b.idx : (a.c.result ? 1 : -1)));
        const rows = ordered.map(({ c }) => {
            const cls = c.result ? 'pass' : 'fail';
            const mark = c.result ? '✓' : '✗';
            let extra = '';
            if (c.actual !== undefined || c.expected !== undefined) {
                extra = ` (${T ? T('webview.inspector.debugTrace.actual') : 'actual'}: ${escapeHtml(c.actual)}, ${T ? T('webview.inspector.debugTrace.expected') : 'expected'}: ${escapeHtml(c.expected)})`;
            }
            return `<div class="debug-trace-cond debug-trace-cond-${cls}">${mark} ${escapeHtml(c.label)}${extra}</div>`;
        }).join('');
        return `<div class="debug-trace-conditions">${rows}</div>`;
    }

    function renderConditionsBadge(conditions) {
        if (!Array.isArray(conditions) || conditions.length === 0) { return ''; }
        const passed = conditions.filter((c) => c.result).length;
        const allPass = passed === conditions.length;
        return `<span class="tag-item debug-trace-cond-badge-${allPass ? 'pass' : 'fail'}">${passed}/${conditions.length}${allPass ? '✓' : '✗'}</span>`;
    }

    function renderRefs(refs) {
        if (!Array.isArray(refs) || refs.length === 0) { return ''; }
        return `<div class="debug-trace-refs">${refs.map((r) => `<span class="tag-item">${escapeHtml(r.kind)}:${escapeHtml(r.id)}</span>`).join('')}</div>`;
    }

    function entryDomId(runId, traceId) {
        return `debug-trace-entry-${runId}-${traceId}`;
    }

    function renderEntry(entry, depth) {
        const turnBadge = entry.worldTurn !== undefined
            ? `<span class="tag-item">T${escapeHtml(String(entry.worldTurn))}</span>` : '';
        const labelParts = [entry.subsystem, entry.ruleId, entry.decision].filter(Boolean);
        const label = labelParts.map((p) => escapeHtml(p)).join(' · ') || escapeHtml(entry.subsystem);
        let parentLink = '';
        if (entry.parentTraceId) {
            const parentText = typeof T === 'function'
                ? T('webview.inspector.debugTrace.parentLink', { traceId: entry.parentTraceId })
                : `parent: ${entry.parentTraceId}`;
            parentLink = `<div class="debug-trace-parent-link" data-goto-run="${escapeHtml(entry.runId)}" data-goto-trace="${escapeHtml(entry.parentTraceId)}">↑ ${escapeHtml(parentText)}</div>`;
        }
        const isOpen = openEntryIds.has(traceEntryKey(entry.runId, entry.traceId));
        return `
            <details class="inspector-item debug-trace-entry" id="${escapeHtml(entryDomId(entry.runId, entry.traceId))}" data-run-id="${escapeHtml(entry.runId)}" data-trace-id="${escapeHtml(entry.traceId)}" style="margin-left:${depth * 16}px"${isOpen ? ' open' : ''}>
                <summary>
                    <span class="tag-item debug-trace-phase-${escapeHtml(entry.phase)}">${escapeHtml(phaseLabel(entry.phase))}</span>
                    <strong>${label}</strong>
                    ${turnBadge}
                    ${renderConditionsBadge(entry.conditions)}
                    <span class="tag-item debug-trace-aud-${escapeHtml(entry.audience)}">${escapeHtml(audienceLabel(entry.audience))}</span>
                </summary>
                <div class="debug-trace-body">
                    <div class="debug-trace-message">${escapeHtml(entry.message)}</div>
                    ${renderConditions(entry.conditions)}
                    ${renderRefs(entry.inputRefs)}
                    ${renderRefs(entry.outputRefs)}
                    ${parentLink}
                </div>
            </details>
        `;
    }

    function goToTraceEntry(runId, traceId) {
        if (!runId || !traceId) { return; }
        const el = document.getElementById(entryDomId(runId, traceId));
        if (!el) { return; }
        el.open = true;
        openEntryIds.add(traceEntryKey(runId, traceId));
        el.classList.add('debug-trace-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => el.classList.remove('debug-trace-highlight'), 1200);
    }

    function projectLinkWarnings(buffer, linkWarnings, audience) {
        if (!buffer || audience === 'internal' || !Array.isArray(linkWarnings)) {
            return linkWarnings || [];
        }
        const visibleKeys = new Set(
            projectEntries(buffer.entries || [], audience).map((e) => traceEntryKey(e.runId, e.traceId))
        );
        return linkWarnings.filter((w) => {
            if (!w.traceId) { return true; }
            if (!w.runId) {
                return (buffer.entries || []).some(
                    (e) => e.traceId === w.traceId && visibleKeys.has(traceEntryKey(e.runId, e.traceId))
                );
            }
            return visibleKeys.has(traceEntryKey(w.runId, w.traceId));
        });
    }

    function renderWarnings(linkWarnings) {
        warningsEl.innerHTML = '';
        const projected = projectLinkWarnings(lastBuffer, linkWarnings, currentAudience);
        if (!Array.isArray(projected) || projected.length === 0) {
            warningsEl.classList.add('hidden');
            return;
        }
        warningsEl.classList.remove('hidden');
        projected.forEach((w) => {
            const row = document.createElement('div');
            row.className = 'debug-trace-warning-item';
            row.textContent = `⚠ ${w.message}`;
            if (w.traceId && w.runId) {
                row.dataset.gotoRun = w.runId;
                row.dataset.gotoTrace = w.traceId;
                row.addEventListener('click', () => goToTraceEntry(w.runId, w.traceId));
            }
            warningsEl.appendChild(row);
        });
    }

    function emptyMessage(key) {
        return `<span class="empty-text">${escapeHtml(typeof T === 'function' ? T(key) : key)}</span>`;
    }

    function renderRuns(buffer, audience) {
        if (!buffer || !Array.isArray(buffer.entries) || buffer.entries.length === 0) {
            runsEl.innerHTML = emptyMessage('webview.inspector.debugTrace.empty');
            return;
        }
        const visible = projectEntries(buffer.entries, audience);
        if (visible.length === 0) {
            // Distinct from "no data at all": entries exist, this audience just
            // doesn't see any of them (e.g. Player-safe with only internal/gm_safe rows).
            runsEl.innerHTML = emptyMessage('webview.inspector.debugTrace.emptyForAudience');
            return;
        }
        const runs = groupByRun(visible);
        let html = '';
        runs.forEach((run, index) => {
            if (!runOpenState.has(run.runId)) {
                // First time we've seen this runId: default the newest run open, older ones closed.
                runOpenState.set(run.runId, index === 0);
            }
            const isOpen = runOpenState.get(run.runId);
            const countLabel = typeof T === 'function'
                ? T('webview.inspector.debugTrace.runEntryCount', { count: String(run.entries.length) })
                : `${run.entries.length} entries`;
            html += `<details class="inspector-item debug-trace-run" data-run-id="${escapeHtml(run.runId)}"${isOpen ? ' open' : ''}>`;
            html += `<summary><strong>${escapeHtml(run.runId)}</strong> — ${escapeHtml(countLabel)}</summary>`;
            html += `<div class="debug-trace-entries">`;
            for (const { entry, depth } of buildOrderedEntries(run.entries)) {
                html += renderEntry(entry, depth);
            }
            html += `</div></details>`;
        });
        runsEl.innerHTML = html;

        runsEl.querySelectorAll('[data-goto-trace]').forEach((el) => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                goToTraceEntry(el.getAttribute('data-goto-run'), el.getAttribute('data-goto-trace'));
            });
        });
        runsEl.querySelectorAll('.debug-trace-entry').forEach((el) => {
            el.addEventListener('toggle', () => {
                const key = traceEntryKey(el.dataset.runId, el.dataset.traceId);
                if (el.open) { openEntryIds.add(key); } else { openEntryIds.delete(key); }
            });
        });
        runsEl.querySelectorAll('.debug-trace-run').forEach((el) => {
            el.addEventListener('toggle', () => {
                runOpenState.set(el.dataset.runId, el.open);
            });
        });
    }

    function render() {
        renderWarnings(lastLinkWarnings);
        renderRuns(lastBuffer, currentAudience);
    }

    toggle.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.debug-trace-audience-btn');
        if (!btn) { return; }
        const audience = btn.getAttribute('data-audience');
        if (!AUDIENCES.includes(audience) || audience === currentAudience) { return; }
        currentAudience = audience;
        toggle.querySelectorAll('.debug-trace-audience-btn').forEach((b) => {
            b.classList.toggle('active', b === btn);
        });
        render();
    });

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message && message.type === 'debugTraceUpdate') {
            lastBuffer = message.buffer || null;
            lastLinkWarnings = Array.isArray(message.linkWarnings) ? message.linkWarnings : [];
            section.classList.remove('hidden');
            render();
        }
        if (message && message.type === 'debugCapabilities') {
            const show = !!(message.showDebugConsole || message.bulkWorldSim);
            if (!show) {
                section.classList.add('hidden');
            }
        }
    });
})();
