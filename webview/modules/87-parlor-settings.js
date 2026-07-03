/* global document, window, T, vscode, bgLayer */

(function () {
    const settingsBtn = document.getElementById('parlor-settings-btn');
    const panel = document.getElementById('parlor-settings-panel');
    const backdrop = document.getElementById('parlor-settings-backdrop');
    const closeBtn = document.getElementById('parlor-settings-panel-close');
    const connSelect = document.getElementById('parlor-connection-select');
    const personaName = document.getElementById('parlor-persona-name');
    const personaDesc = document.getElementById('parlor-persona-description');
    const personaStyle = document.getElementById('parlor-persona-style');
    const personaSaveBtn = document.getElementById('parlor-persona-save-btn');
    const personaSaved = document.getElementById('parlor-persona-saved');
    const bgGallery = document.getElementById('parlor-bg-gallery');
    const bgHint = document.getElementById('parlor-bg-hint');
    const promoteBtn = document.getElementById('parlor-promote-btn');

    let activeConnectionId = '';
    let activeBackgroundId = null;
    let personaSaveTimeout = null;

    function openPanel() {
        if (!panel) return;
        vscode.postMessage({ type: 'requestParlorSettings' });
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        if (backdrop) backdrop.classList.remove('hidden');
    }

    function closePanel() {
        if (!panel) return;
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        if (backdrop) backdrop.classList.add('hidden');
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

    function applyParlorSettings(msg) {
        renderConnectionProfiles(msg.connectionProfiles, msg.activeConnectionId);
        renderPersona(msg.persona);
        renderBackgroundGallery(msg.backgrounds, msg.activeBackgroundId);
    }

    if (settingsBtn) settingsBtn.addEventListener('click', openPanel);
    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (backdrop) backdrop.addEventListener('click', closePanel);

    if (connSelect) {
        connSelect.addEventListener('change', () => {
            const id = connSelect.value;
            if (id && id !== activeConnectionId) {
                vscode.postMessage({ type: 'setParlorConnectionProfile', profileId: id });
            }
        });
    }

    if (promoteBtn) {
        promoteBtn.addEventListener('click', () => {
            if (document.getElementById('gm-loading')) {
                return;
            }
            vscode.postMessage({ type: 'promoteParlor' });
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
})();