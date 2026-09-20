/* global window, document, T, vscode */

let partyDirectorDraft = null;
let partyMemberNames = {};

window.addEventListener('DOMContentLoaded', () => {
    const saveBtn = document.getElementById('party-save-btn');
    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (!partyDirectorDraft) {
                return;
            }
            vscode.postMessage({ type: 'savePartyDirector', director: partyDirectorDraft });
        });
    }
    if (banterCb) {
        banterCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.npcBanterEnabled = banterCb.checked;
                markPartyDirty(true);
            }
        });
    }
    if (quietCb) {
        quietCb.addEventListener('change', () => {
            if (partyDirectorDraft) {
                partyDirectorDraft.global.combatQuietMode = quietCb.checked;
                markPartyDirty(true);
            }
        });
    }

    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'partyDirector') {
            renderPartyDirector(message.director);
        }
        if (message.type === 'characterList') {
            const chars = message.characters || [];
            partyMemberNames = {};
            chars.forEach((c) => {
                if (c && c.id) {
                    partyMemberNames[c.id] = c.name || c.id;
                }
            });
            if (partyDirectorDraft) {
                renderPartyMembers(partyDirectorDraft);
            }
        }
        if (message.type === 'partyDirectorSaved') {
            markPartyDirty(false);
        }
    });
});

function renderPartyDirector(director) {
    const empty = document.getElementById('party-empty');
    const content = document.getElementById('party-content');
    const liveBadge = document.getElementById('party-live-badge');
    if (!content) {
        return;
    }

    if (!director || Object.keys(director.members || {}).length === 0) {
        partyDirectorDraft = null;
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    partyDirectorDraft = {
        format: 'lorerelay-party-director/1.0',
        global: {
            npcBanterEnabled: director.global.npcBanterEnabled !== false,
            combatQuietMode: director.global.combatQuietMode === true
        },
        members: {}
    };
    for (const [id, m] of Object.entries(director.members)) {
        partyDirectorDraft.members[id] = {
            verbosity: m.verbosity ?? 50,
            muted: !!m.muted,
            forceSpeak: !!m.forceSpeak,
            relationships: { ...(m.relationships || {}) }
        };
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');
    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    const banterCb = document.getElementById('party-banter-cb');
    const quietCb = document.getElementById('party-quiet-cb');
    if (banterCb) { banterCb.checked = partyDirectorDraft.global.npcBanterEnabled; }
    if (quietCb) { quietCb.checked = partyDirectorDraft.global.combatQuietMode; }

    renderPartyMembers(director);
    markPartyDirty(false);
}

function renderPartyMembers(director) {
    const container = document.getElementById('party-members-list');
    if (!container || !partyDirectorDraft) {
        return;
    }
    container.innerHTML = '';
    const memberIds = Object.keys(director.members || {});
    const relOptions = ['neutral', 'ally', 'friend', 'rival', 'enemy', 'romance'];

    memberIds.forEach((id) => {
        const cfg = partyDirectorDraft.members[id];
        const card = document.createElement('div');
        card.className = 'party-member-card';

        const title = document.createElement('h5');
        title.textContent = partyMemberNames[id] ? `${partyMemberNames[id]} (${id})` : id;
        card.appendChild(title);

        const verbRow = document.createElement('div');
        verbRow.className = 'party-control-row';
        const verbLabel = document.createElement('label');
        verbLabel.textContent = typeof T === 'function' ? T('webview.party.verbosity') : 'Verbosity';
        const verbSlider = document.createElement('input');
        verbSlider.type = 'range';
        verbSlider.min = '0';
        verbSlider.max = '100';
        verbSlider.value = String(cfg.verbosity);
        const verbVal = document.createElement('span');
        verbVal.className = 'party-verb-val';
        verbVal.textContent = String(cfg.verbosity);
        verbSlider.addEventListener('input', () => {
            cfg.verbosity = Number(verbSlider.value);
            verbVal.textContent = verbSlider.value;
            markPartyDirty(true);
        });
        verbRow.appendChild(verbLabel);
        verbRow.appendChild(verbSlider);
        verbRow.appendChild(verbVal);
        card.appendChild(verbRow);

        const flagsRow = document.createElement('div');
        flagsRow.className = 'party-flags-row';
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.muted') : 'Muted',
            cfg.muted,
            (v) => { cfg.muted = v; markPartyDirty(true); }
        ));
        flagsRow.appendChild(makePartyCheckbox(
            typeof T === 'function' ? T('webview.party.forceSpeak') : 'Force speak',
            cfg.forceSpeak,
            (v) => { cfg.forceSpeak = v; markPartyDirty(true); }
        ));
        card.appendChild(flagsRow);

        const others = memberIds.filter((oid) => oid !== id);
        if (others.length > 0) {
            const relTitle = document.createElement('div');
            relTitle.className = 'party-rel-title';
            relTitle.textContent = typeof T === 'function' ? T('webview.party.relationships') : 'Relationships';
            card.appendChild(relTitle);
            others.forEach((otherId) => {
                const row = document.createElement('div');
                row.className = 'party-rel-row';
                const label = document.createElement('span');
                label.textContent = partyMemberNames[otherId] || otherId;
                const sel = document.createElement('select');
                relOptions.forEach((opt) => {
                    const o = document.createElement('option');
                    o.value = opt;
                    o.textContent = opt;
                    sel.appendChild(o);
                });
                sel.value = cfg.relationships[otherId] || 'neutral';
                sel.addEventListener('change', () => {
                    if (sel.value === 'neutral') {
                        delete cfg.relationships[otherId];
                    } else {
                        cfg.relationships[otherId] = sel.value;
                    }
                    markPartyDirty(true);
                });
                row.appendChild(label);
                row.appendChild(sel);
                card.appendChild(row);
            });
        }

        container.appendChild(card);
    });
}

function makePartyCheckbox(labelText, checked, onChange) {
    const wrap = document.createElement('label');
    wrap.className = 'party-flag-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checked;
    cb.addEventListener('change', () => onChange(cb.checked));
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' ' + labelText));
    return wrap;
}

function markPartyDirty(dirty) {
    const badge = document.getElementById('party-dirty-badge');
    if (badge) {
        badge.classList.toggle('hidden', !dirty);
    }
}