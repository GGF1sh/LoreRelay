/* global document, window, T, vscode, bgLayer */

(function () {
    const settingsBtn = document.getElementById('parlor-settings-btn');
    const panel = document.getElementById('parlor-settings-panel');
    const backdrop = document.getElementById('parlor-settings-backdrop');
    const closeBtn = document.getElementById('parlor-settings-panel-close');
    const connSelect = document.getElementById('parlor-connection-select');
    const characterSelect = document.getElementById('parlor-character-select');
    const importCharacterBtn = document.getElementById('parlor-import-character-btn');
    const editCharacterBtn = document.getElementById('parlor-edit-character-btn');
    const personaName = document.getElementById('parlor-persona-name');
    const personaDesc = document.getElementById('parlor-persona-description');
    const personaStyle = document.getElementById('parlor-persona-style');
    const personaSaveBtn = document.getElementById('parlor-persona-save-btn');
    const personaSaved = document.getElementById('parlor-persona-saved');
    const bgGallery = document.getElementById('parlor-bg-gallery');
    const bgHint = document.getElementById('parlor-bg-hint');
    const promoteBtn = document.getElementById('parlor-promote-btn');
    const freshWrap = document.getElementById('parlor-campaign-fresh-wrap');
    const frozenWrap = document.getElementById('parlor-campaign-frozen-wrap');
    const emptyHint = document.getElementById('parlor-campaign-empty-hint');
    const resumeCampaignBtn = document.getElementById('parlor-resume-campaign-btn');
    const freshCampaignBtn = document.getElementById('parlor-fresh-campaign-btn');

    let activeConnectionId = '';
    let activeBackgroundId = null;
    let activeCharacterId = null;
    let personaSaveTimeout = null;
    let campaignTransition = {
        hasGameState: false,
        hasFrozenCampaign: false,
        parlorMessageCount: 0,
        canCreateFresh: false,
        canResumeFrozen: false,
    };

    function openPanel() {
        if (!panel) return;
        vscode.postMessage({ type: 'requestParlorSettings' });
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
        }
        if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    }

    function closePanel(options) {
        if (!panel) return;
        const restoreFocus = !options || options.restoreFocus !== false;
        const wasOpen = !panel.classList.contains('hidden');
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        if (restoreFocus && wasOpen && settingsBtn && typeof settingsBtn.focus === 'function') {
            settingsBtn.focus();
        }
    }

    // Availability (the launcher is Parlor-only) and open state are separate.
    // Leaving Parlor closes the surface; entering it never opens the surface.
    function setPanelAvailability(isParlor) {
        if (!isParlor) closePanel({ restoreFocus: false });
    }

    function showPersonaSaved() {
        if (!personaSaved) return;
        personaSaved.classList.remove('hidden');
        if (personaSaveTimeout) clearTimeout(personaSaveTimeout);
        personaSaveTimeout = setTimeout(() => {
            personaSaved.classList.add('hidden');
        }, 2000);
    }

    function applyParlorBackground(uri) {
        if (!bgLayer || !uri) return;
        bgLayer.style.backgroundImage = `url("${uri}")`;
        bgLayer.className = 'has-scene-bg';
    }

    function clearParlorBackground() {
        if (!bgLayer) return;
        bgLayer.style.backgroundImage = '';
        const theme = window.currentTheme || 'dark';
        bgLayer.className = `theme-${theme}`;
    }

    function renderConnectionProfiles(profiles, activeId) {
        if (!connSelect) return;
        connSelect.innerHTML = '';
        const list = Array.isArray(profiles) ? profiles : [];
        for (const p of list) {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.label || p.id;
            if (p.provider) {
                opt.dataset.provider = p.provider;
            }
            connSelect.appendChild(opt);
        }
        activeConnectionId = activeId || (list[0] && list[0].id) || '';
        if (activeConnectionId) {
            connSelect.value = activeConnectionId;
        }
    }

    function renderCharacters(characters, activeId) {
        if (!characterSelect) return;
        const list = Array.isArray(characters) ? characters : [];
        activeCharacterId = activeId || null;
        characterSelect.innerHTML = '';
        for (const character of list) {
            const opt = document.createElement('option');
            opt.value = character.id;
            opt.textContent = character.name || character.id;
            characterSelect.appendChild(opt);
        }
        if (activeCharacterId && list.some((character) => character.id === activeCharacterId)) {
            characterSelect.value = activeCharacterId;
        }
        if (editCharacterBtn) editCharacterBtn.disabled = !activeCharacterId;
    }

    function renderPersona(persona) {
        const p = persona || {};
        if (personaName) personaName.value = p.name || '';
        if (personaDesc) personaDesc.value = p.description || '';
        if (personaStyle) personaStyle.value = p.speakingStyle || '';
    }

    function renderBackgroundGallery(backgrounds, activeId) {
        if (!bgGallery) return;
        bgGallery.innerHTML = '';
        activeBackgroundId = activeId || null;
        const list = Array.isArray(backgrounds) ? backgrounds : [];

        const noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.className = 'parlor-bg-thumb parlor-bg-none' + (activeBackgroundId ? '' : ' active');
        noneBtn.textContent = typeof T === 'function' ? T('webview.parlor.bgNone') : 'None';
        noneBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'setParlorBackground', backgroundId: null });
        });
        bgGallery.appendChild(noneBtn);

        for (const bg of list) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'parlor-bg-thumb' + (bg.id === activeBackgroundId ? ' active' : '');
            btn.title = bg.label || bg.id;
            if (bg.uri) {
                const img = document.createElement('img');
                img.src = bg.uri;
                img.alt = bg.label || '';
                btn.appendChild(img);
            } else {
                btn.textContent = bg.label || bg.id;
            }
            btn.addEventListener('click', () => {
                vscode.postMessage({ type: 'setParlorBackground', backgroundId: bg.id });
            });
            bgGallery.appendChild(btn);
        }

        if (bgHint) {
            const empty = list.length === 0;
            bgHint.classList.toggle('hidden', !empty);
        }
    }

    function normalizeCampaignTransition(raw) {
        const t = raw && typeof raw === 'object' ? raw : {};
        const parlorMessageCount = Number.isFinite(t.parlorMessageCount)
            ? Math.max(0, Math.floor(t.parlorMessageCount))
            : 0;
        const hasGameState = t.hasGameState === true;
        const hasFrozenCampaign = hasGameState && t.hasFrozenCampaign === true;
        return {
            hasGameState,
            hasFrozenCampaign,
            parlorMessageCount,
            canCreateFresh: t.canCreateFresh === true || parlorMessageCount > 0,
            canResumeFrozen: t.canResumeFrozen === true || hasFrozenCampaign,
        };
    }

    function setButtonDisabled(btn, disabled, titleKey) {
        if (!btn) return;
        btn.disabled = !!disabled;
        if (disabled && titleKey && typeof T === 'function') {
            btn.title = T(titleKey);
            btn.setAttribute('aria-disabled', 'true');
        } else {
            btn.removeAttribute('aria-disabled');
            if (!disabled) {
                btn.removeAttribute('title');
            }
        }
    }

    function renderCampaignTransition(raw) {
        campaignTransition = normalizeCampaignTransition(raw);
        const frozen = campaignTransition.canResumeFrozen;
        const canFresh = campaignTransition.canCreateFresh;

        if (freshWrap) {
            freshWrap.classList.toggle('hidden', frozen);
        }
        if (frozenWrap) {
            frozenWrap.classList.toggle('hidden', !frozen);
        }
        if (emptyHint) {
            // Show why fresh creation is disabled when no messages and not only-resume UI clutter.
            const showEmpty = !canFresh;
            emptyHint.classList.toggle('hidden', !showEmpty);
        }

        setButtonDisabled(
            promoteBtn,
            !canFresh,
            'webview.parlor.promoteEmptyHint'
        );
        setButtonDisabled(resumeCampaignBtn, !campaignTransition.canResumeFrozen, null);
        setButtonDisabled(
            freshCampaignBtn,
            !canFresh,
            'webview.parlor.promoteEmptyHint'
        );
    }

    function postPromote(intent) {
        if (document.getElementById('gm-loading')) {
            return;
        }
        vscode.postMessage({ type: 'promoteParlor', intent: intent || 'auto' });
    }

    function applyParlorSettings(msg) {
        renderCharacters(msg.characters, msg.activeCharacterId);
        renderConnectionProfiles(msg.connectionProfiles, msg.activeConnectionId);
        renderPersona(msg.persona);
        renderBackgroundGallery(msg.backgrounds, msg.activeBackgroundId);
        renderCampaignTransition(msg.campaignTransition);
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (backdrop) backdrop.addEventListener('click', closePanel);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
            event.preventDefault();
            closePanel();
        }
    });

    if (connSelect) {
        connSelect.addEventListener('change', () => {
            const id = connSelect.value;
            if (id && id !== activeConnectionId) {
                vscode.postMessage({ type: 'setParlorConnectionProfile', profileId: id });
            }
        });
    }

    if (characterSelect) {
        characterSelect.addEventListener('change', () => {
            const requestedId = characterSelect.value;
            // A refreshed characterList/settings payload is the host acceptance ack.
            characterSelect.value = activeCharacterId || '';
            if (requestedId && requestedId !== activeCharacterId) {
                vscode.postMessage({ type: 'switchParlorCharacter', id: requestedId });
            }
        });
    }

    if (importCharacterBtn) {
        importCharacterBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'importParlorTavernCard' });
        });
    }

    if (editCharacterBtn) {
        editCharacterBtn.addEventListener('click', () => {
            const current = Array.isArray(window.currentCharacters)
                ? window.currentCharacters.find((character) => character.id === activeCharacterId)
                : null;
            if (current) window.openCharacterCreator?.(current);
        });
    }

    if (promoteBtn) {
        promoteBtn.addEventListener('click', () => {
            if (promoteBtn.disabled) return;
            postPromote('fresh');
        });
    }
    if (resumeCampaignBtn) {
        resumeCampaignBtn.addEventListener('click', () => {
            if (resumeCampaignBtn.disabled) return;
            postPromote('resume');
        });
    }
    if (freshCampaignBtn) {
        freshCampaignBtn.addEventListener('click', () => {
            if (freshCampaignBtn.disabled) return;
            postPromote('fresh');
        });
    }

    if (personaSaveBtn) {
        personaSaveBtn.addEventListener('click', () => {
            vscode.postMessage({
                type: 'saveParlorPersona',
                persona: {
                    name: personaName ? personaName.value.trim() : '',
                    description: personaDesc ? personaDesc.value.trim() : '',
                    speakingStyle: personaStyle ? personaStyle.value.trim() : '',
                },
            });
            showPersonaSaved();
        });
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'parlorSettings') {
            applyParlorSettings(msg);
        } else if (msg.type === 'parlorBackground') {
            if (msg.uri) {
                applyParlorBackground(msg.uri);
            } else {
                clearParlorBackground();
            }
        }
    });

    window.setParlorSettingsPanelAvailability = setPanelAvailability;
    // A Webview reload must always start with this transient panel closed.
    closePanel({ restoreFocus: false });
})();
