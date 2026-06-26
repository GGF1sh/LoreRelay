/* global window, document, T */

window.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message.type === 'scenarioDirector') {
            renderScenarioDirector(message.director);
        }
    });
});

function renderScenarioDirector(director) {
    const empty = document.getElementById('director-empty');
    const content = document.getElementById('director-content');
    const liveBadge = document.getElementById('director-live-badge');
    if (!content) {
        return;
    }

    if (!director) {
        if (empty) { empty.classList.remove('hidden'); }
        content.classList.add('hidden');
        return;
    }

    if (empty) { empty.classList.add('hidden'); }
    content.classList.remove('hidden');

    if (liveBadge) {
        liveBadge.classList.toggle('hidden', !director.hasRuntimeOverrides);
    }

    setText('director-title', director.scenarioTitle || '—');
    const actLive = [director.act, director.chapter].filter(Boolean).join(' / ');
    const actTemplate = director.templateSnapshot
        ? [director.templateSnapshot.act, director.templateSnapshot.chapter].filter(Boolean).join(' / ')
        : undefined;
    setFieldWithTemplate('director-act', actLive, actTemplate);
    setFieldWithTemplate('director-scene', director.scene, director.templateSnapshot?.scene);
    setFieldWithTemplate('director-objective', director.objective, director.templateSnapshot?.objective);
    setFieldWithTemplate('director-guidance', director.guidanceMode, director.templateSnapshot?.guidanceMode);

    renderList('director-success', director.successConditions);
    renderList('director-fail', director.failConditions);
    renderEndingFlags('director-endings', director.endingFlags, director.achievedEndings || []);
    renderList('director-achieved', director.achievedEndings);
    renderList('director-encounters', director.optionalEncounters);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value || '—';
    }
}

function setFieldWithTemplate(id, live, template) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    const text = live || '—';
    const changed = template !== undefined && live !== undefined && live !== template;
    if (changed && template) {
        el.innerHTML = `${escapeHtml(text)} <span class="tag-item">${escapeHtml(typeof T === 'function' ? T('webview.director.was') : 'was')}: ${escapeHtml(template)}</span>`;
    } else {
        el.textContent = text;
    }
}

function renderList(id, items) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!items || items.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    items.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        row.textContent = item;
        el.appendChild(row);
    });
}

function renderEndingFlags(id, allFlags, achieved) {
    const el = document.getElementById(id);
    if (!el) {
        return;
    }
    el.innerHTML = '';
    if (!allFlags || allFlags.length === 0) {
        el.innerHTML = `<span class="empty-text">—</span>`;
        return;
    }
    const achievedSet = new Set(achieved || []);
    allFlags.forEach((flag) => {
        const row = document.createElement('div');
        row.className = 'inspector-item';
        const done = achievedSet.has(flag);
        row.innerHTML = done
            ? `✅ ${escapeHtml(flag)}`
            : `○ ${escapeHtml(flag)}`;
        if (done) {
            row.style.color = 'var(--text-success)';
        }
        el.appendChild(row);
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