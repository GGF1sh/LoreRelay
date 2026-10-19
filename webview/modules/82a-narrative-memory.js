/* global T, vscode */
(() => {
    let view, refreshTimer, lastCount;
    const L = key => T(['webview', 'narrative', key].join('.'));
    const send = (action, extra = {}) => vscode.postMessage({ type: 'narrativeMemory', action, token: view?.token, ...extra });
    const node = (tag, text) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; return e; };
    const button = (text, fn) => { const e = node('button', text); e.type = 'button'; e.className = 'glass-btn'; e.onclick = fn; return e; };
    function shell() {
        let root = document.getElementById('narrative-memory-panel');
        if (!root) {
            root = node('details'); root.id = 'narrative-memory-panel'; root.className = 'narrative-memory-panel';
            root.append(node('summary', L('title')));
            const body = node('div'); body.id = 'narrative-memory-body'; root.append(body);
            document.getElementById('chat-log')?.before(root);
        }
        return root;
    }
    function focusSource(id) { document.getElementById('msg-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    function draw() {
        if (!view) return;
        const root = shell(), body = root.querySelector('#narrative-memory-body');
        root.querySelector('summary').textContent = L('title'); body.replaceChildren();
        const mode = node('select'); mode.setAttribute('aria-label', L('mode'));
        for (const key of ['auto', 'review']) { const opt = node('option', L(key)); opt.value = key; mode.append(opt); }
        mode.value = view.mode; mode.onchange = () => send('mode', { mode: mode.value });
        const modeLabel = node('label', L('mode') + ' '); modeLabel.append(mode); body.append(modeLabel);
        const records = view.records || [], superseded = new Set(records.filter(r => r.approval === 'accepted').map(r => r.targetId));
        const people = new Map();
        for (const record of records.filter(r => r.approval !== 'rejected' && !superseded.has(r.id))) {
            if (!people.has(record.person.id)) people.set(record.person.id, { person: record.person, records: [] });
            people.get(record.person.id).records.push(record);
        }
        for (const npc of view.npcs || []) {
            const id = 'npc:' + npc.id;
            if (!people.has(id)) people.set(id, { person: { id, name: npc.name, npcId: npc.id }, records: [] });
            people.get(id).legacy = npc.memories;
        }
        if (!people.size) body.append(node('p', L('empty')));
        for (const { person, records: rows, legacy } of people.values()) {
            const section = node('section'); section.append(node('h4', person.name + ' · ' + L(person.npcId ? 'registered' : 'storyPerson')));
            for (const text of legacy || []) section.append(node('p', L('memory') + ': ' + text));
            for (const r of rows) {
                const item = node('article'); item.className = 'narrative-record';
                const overdue = r.due && r.status === 'open' && Number.isFinite(view.worldTurn) && view.worldTurn > r.due.value;
                item.append(node('strong', L(r.kind) + ' · ' + L(r.approval === 'pending' ? 'pending' : r.status)));
                item.append(node('p', r.content));
                if (r.due) item.append(node('p', L('deadline') + ': ' + r.due.value + (overdue ? ' · ' + L('overdue') : '')));
                item.append(button(L('source'), () => focusSource(r.sourceId)));
                if (r.approval === 'pending') item.append(button(L('accept'), () => send('accept', { id: r.id })));
                item.append(button(L('link'), () => send('link', { id: r.id })), button(L('edit'), () => send('edit', { id: r.id })),
                    button(L('reject'), () => send('reject', { id: r.id })));
                section.append(item);
            }
            body.append(section);
        }
        let resume = document.getElementById('narrative-resume');
        if (!resume) { resume = node('details'); resume.id = 'narrative-resume'; resume.className = 'narrative-memory-panel'; resume.open = true; root.before(resume); }
        const isOpen = resume.open; resume.replaceChildren(node('summary', L('resume'))); resume.open = isOpen;
        resume.append(node('p', L('location') + ': ' + (view.resume?.location || L('unknown'))));
        for (const text of view.resume?.recent || []) resume.append(node('p', text));
        for (const r of view.resume?.promises || []) resume.append(node('p', r.person.name + ': ' + r.content));
        resume.append(button(L('conversation'), () => document.getElementById('free-input')?.focus()));
        resume.append(button(L('map'), () => document.getElementById('tab-btn-world')?.click()));
        const actionHub = document.getElementById('player-action-hub-open');
        if (actionHub) resume.append(button(L('actions'), () => actionHub.click()));
        const count = records.filter(r => r.approval === 'accepted').length;
        if (lastCount !== undefined && count > lastCount) status(L('recorded'));
        lastCount = count;
    }
    function status(text) {
        let e = document.getElementById('narrative-status');
        if (!e) { e = node('p'); e.id = 'narrative-status'; e.setAttribute('role', 'status'); shell().after(e); }
        e.textContent = text;
    }
    function receipt(msg) {
        if (!['shopkeeperDirectTradeResult', 'marketTravelResult', 'endDayResult'].includes(msg.type)) return;
        if (msg.commitStatus !== 'committed') {
            status(L(msg.commitStatus === 'partial' ? 'partial' : msg.commitStatus === 'unknown' ? 'unknownResult' : 'notCommitted')); return;
        }
        const r = msg.receipt || {}, parts = [L('committed')];
        if (r.credits) parts.push(L('credits') + ': ' + r.credits.before + ' → ' + r.credits.after);
        if (r.commodityId && Number.isFinite(r.qty)) parts.push(r.commodityId + ': ' + (r.op === 'buy' ? '+' : '−') + r.qty);
        if (r.destination) parts.push(L('location') + ': ' + (r.destination.name || r.destination.id || r.destination));
        if (r.worldTurn) parts.push(L('day') + ': ' + r.worldTurn.before + ' → ' + r.worldTurn.after);
        else if (r.elapsedWorldTurns === 0) parts.push(L('noTime'));
        else if (Number.isFinite(r.elapsedWorldTurns)) parts.push(L('day') + ': +' + r.elapsedWorldTurns);
        for (const change of r.resourceChanges || []) parts.push(change.resource + ': ' + change.before + ' → ' + change.after);
        if (msg.refreshFailed) parts.push(L('refreshWarning'));
        status(parts.join(' / '));
    }
    window.narrativeMemoryEntry = id => send('entry', { entryId: id });
    window.addEventListener('message', e => {
        const msg = e.data || {};
        if (msg.type === 'narrativeMemoryView') { view = msg; draw(); }
        if (msg.type === 'narrativeMemoryError') status(msg.error);
        if (msg.type === 'narrativeAuthorNote') { const input = document.getElementById('authors-note-input'); if (input) { input.value = msg.content; input.focus(); } }
        if (msg.type === 'gameStateUpdate') { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => send('view'), 120); }
        if (msg.type === 'localeBundle') draw();
        receipt(msg);
    });
    window.addEventListener('DOMContentLoaded', () => send('view'));
})();
