/* global window, document, T, vscode */

let lorebookEntries = [];
let lorebookWriteFile = 'lorebook.json';
let lorebookDirty = false;
let lorebookEditingId = null;

window.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('lorebook-add-btn');
    const saveBtn = document.getElementById('lorebook-save-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => addLorebookEntry());
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveLorebook());
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'lorebookList') {
            lorebookWriteFile = message.writeFile || 'lorebook.json';
            lorebookEntries = (message.entries || []).map(cloneEntry);
            lorebookDirty = false;
            lorebookEditingId = null;
            updateDirtyBadge();
            renderLorebookList(message);
        }
        if (message.type === 'lorebookSaveResult') {
            if (message.ok) {
                lorebookDirty = false;
                updateDirtyBadge();
            }
            // On failure the extension host already shows a native error message
            // with the same detail (webview alert() is silently blocked here anyway).
        }
    });
});

function cloneEntry(entry) {
    return {
        id: entry.id,
        label: entry.label || '',
        content: entry.content || entry.contentPreview || '',
        keys: Array.isArray(entry.keys) ? [...entry.keys] : [],
        secondary_keys: Array.isArray(entry.secondary_keys) ? [...entry.secondary_keys] : [],
        contentPreview: entry.contentPreview || '',
        enabled: entry.enabled !== false,
        use_regex: entry.use_regex === true,
        priority: entry.priority ?? 0,
        insertion_order: entry.insertion_order ?? 0,
        pinned: entry.pinned === true
    };
}

function markDirty() {
    lorebookDirty = true;
    updateDirtyBadge();
}

function updateDirtyBadge() {
    const badge = document.getElementById('lorebook-dirty');
    if (!badge) {
        return;
    }
    badge.classList.toggle('hidden', !lorebookDirty);
}

function splitKeys(text) {
    return String(text || '')
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean);
}

function addLorebookEntry() {
    const id = `entry-${Date.now().toString(36)}`;
    const entry = {
        id,
        label: typeof T === 'function' ? T('webview.lorebook.newEntryLabel') : 'New entry',
        content: '',
        keys: [],
        secondary_keys: [],
        contentPreview: '',
        enabled: true,
        use_regex: false,
        priority: 100,
        insertion_order: 100,
        pinned: false
    };
    lorebookEntries.unshift(entry);
    lorebookEditingId = id;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

async function deleteLorebookEntry(id) {
    const confirmMsg = typeof T === 'function' ? T('webview.lorebook.deleteConfirm') : 'Delete this entry?';
    // window.confirm() is silently blocked by the VS Code webview iframe sandbox
    // (no allow-modals); use the in-page confirm modal instead.
    const ok = await webviewConfirm(confirmMsg, T('webview.lorebook.deleteConfirmBtn'));
    if (!ok) {
        return;
    }
    lorebookEntries = lorebookEntries.filter((e) => e.id !== id);
    if (lorebookEditingId === id) {
        lorebookEditingId = null;
    }
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function toggleLorebookEntry(id, enabled) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    entry.enabled = enabled;
    markDirty();
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function setEditingId(id) {
    lorebookEditingId = lorebookEditingId === id ? null : id;
    renderLorebookList({ entries: lorebookEntries, writeFile: lorebookWriteFile });
}

function readFormIntoEntry(id) {
    const entry = lorebookEntries.find((e) => e.id === id);
    if (!entry) {
        return;
    }
    const labelEl = document.getElementById(`lore-label-${id}`);
    const keysEl = document.getElementById(`lore-keys-${id}`);
    const secEl = document.getElementById(`lore-sec-${id}`);
    const contentEl = document.getElementById(`lore-content-${id}`);
    const pinnedEl = document.getElementById(`lore-pinned-${id}`);
    const regexEl = document.getElementById(`lore-regex-${id}`);
    const prioEl = document.getElementById(`lore-prio-${id}`);
    const orderEl = document.getElementById(`lore-order-${id}`);

    if (labelEl) { entry.label = labelEl.value.trim(); }
    if (keysEl) { entry.keys = splitKeys(keysEl.value); }
    if (secEl) { entry.secondary_keys = splitKeys(secEl.value); }
    if (contentEl) {
        entry.content = contentEl.value;
        entry.contentPreview = entry.content.slice(0, 200);
    }
    if (pinnedEl) { entry.pinned = pinnedEl.checked; }
    if (regexEl) { entry.use_regex = regexEl.checked; }
    if (prioEl) { entry.priority = Number(prioEl.value) || 0; }
    if (orderEl) { entry.insertion_order = Number(orderEl.value) || 0; }
}

function saveLorebook() {
    lorebookEntries.forEach((e) => {
        if (lorebookEditingId === e.id) {
            readFormIntoEntry(e.id);
        }
    });
    vscode.postMessage({ type: 'saveLorebook', entries: lorebookEntries });
}

function renderLorebookList(payload) {
    const list = document.getElementById('lorebook-list');
    const meta = document.getElementById('lorebook-meta');
    if (!list) {
        return;
    }

    const entries = payload.entries || lorebookEntries;
    const writeFile = payload.writeFile || lorebookWriteFile;

    if (meta) {
        const count = entries.length;
        meta.textContent = typeof T === 'function'
            ? T('webview.lorebook.editorMeta', { file: writeFile, count: String(count) })
            : `${writeFile} — ${count} entries (edits save here)`;
    }

    list.innerHTML = '';
    if (entries.length === 0) {
        list.innerHTML = `<div class="empty-text">${escapeHtml(typeof T === 'function' ? T('webview.lorebook.noEntries') : 'No entries')}</div>`;
        return;
    }

    const sorted = [...entries].sort((a, b) => (b.insertion_order || 0) - (a.insertion_order || 0));
    sorted.forEach((entry) => {
        const isEditing = lorebookEditingId === entry.id;
        const card = document.createElement('div');
        card.className = 'lorebook-card inspector-item';
        card.dataset.entryId = entry.id;

        const status = entry.enabled
            ? (typeof T === 'function' ? T('webview.lorebook.enabled') : 'enabled')
            : (typeof T === 'function' ? T('webview.lorebook.disabled') : 'disabled');

        if (isEditing) {
            card.innerHTML = `
                <div class="lorebook-form">
                  <label>${escapeHtml(T('webview.lorebook.fieldLabel'))}</label>
                  <input id="lore-label-${escapeHtml(entry.id)}" type="text" value="${escapeAttr(entry.label)}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldKeys'))}</label>
                  <input id="lore-keys-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.keys || []).join(', '))}" placeholder="keyword1, keyword2" />
                  <label>${escapeHtml(T('webview.lorebook.fieldSecondary'))}</label>
                  <input id="lore-sec-${escapeHtml(entry.id)}" type="text" value="${escapeAttr((entry.secondary_keys || []).join(', '))}" />
                  <label>${escapeHtml(T('webview.lorebook.fieldContent'))}</label>
                  <textarea id="lore-content-${escapeHtml(entry.id)}" rows="4">${escapeHtml(entry.content || '')}</textarea>
                  <div class="lorebook-form-row">
                    <label><input id="lore-pinned-${escapeHtml(entry.id)}" type="checkbox" ${entry.pinned ? 'checked' : ''} /> ${escapeHtml(typeof T === 'function' ? T('webview.lorebook.fieldPinned') : 'Pin to GM')}</label>
                    <label><input id="lore-regex-${escapeHtml(entry.id)}" type="checkbox" ${entry.use_regex ? 'checked' : ''} /> ${escapeHtml(T('webview.lorebook.fieldRegex'))}</label>
                    <label>${escapeHtml(T('webview.lorebook.fieldPriority'))} <input id="lore-prio-${escapeHtml(entry.id)}" type="number" value="${entry.priority ?? 0}" style="width:4rem" /></label>
                    <label>${escapeHtml(T('webview.lorebook.fieldOrder'))} <input id="lore-order-${escapeHtml(entry.id)}" type="number" value="${entry.insertion_order ?? 0}" style="width:4rem" /></label>
                  </div>
                  <div class="lorebook-card-actions">
                    <button type="button" class="small-btn primary lore-done-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.done'))}</button>
                    <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                  </div>
                </div>
            `;
        } else {
            const keys = (entry.keys || []).join(', ');
            card.innerHTML = `
                <div class="lorebook-card-head">
                  <strong>${escapeHtml(entry.label)}</strong>
                  <span class="tag-item">${escapeHtml(status)}</span>
                  ${entry.pinned ? '<span class="tag-item">📌 pin</span>' : ''}
                  ${entry.use_regex ? '<span class="tag-item">regex</span>' : ''}
                </div>
                <div class="patch-value">${keys ? escapeHtml(keys) : '—'}</div>
                <div class="lorebook-preview">${escapeHtml(entry.contentPreview || entry.content || '')}</div>
                <div class="lorebook-card-actions">
                  <button type="button" class="small-btn lore-edit-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.edit'))}</button>
                  <button type="button" class="small-btn lore-toggle-btn" data-id="${escapeAttr(entry.id)}" data-enabled="${entry.enabled ? '0' : '1'}">${escapeHtml(entry.enabled ? (typeof T === 'function' ? T('webview.lorebook.disable') : 'Disable') : (typeof T === 'function' ? T('webview.lorebook.enable') : 'Enable'))}</button>
                  <button type="button" class="small-btn lore-delete-btn" data-id="${escapeAttr(entry.id)}">${escapeHtml(T('webview.lorebook.delete'))}</button>
                </div>
            `;
        }

        list.appendChild(card);
    });

    list.querySelectorAll('.lore-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => setEditingId(btn.dataset.id));
    });
    list.querySelectorAll('.lore-done-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            readFormIntoEntry(btn.dataset.id);
            markDirty();
            setEditingId(null);
        });
    });
    list.querySelectorAll('.lore-delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteLorebookEntry(btn.dataset.id));
    });
    list.querySelectorAll('.lore-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => toggleLorebookEntry(btn.dataset.id, btn.dataset.enabled === '1'));
    });
    list.querySelectorAll('input, textarea').forEach((el) => {
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
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

function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, '&#096;');
}