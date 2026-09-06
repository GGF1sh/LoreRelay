'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
function seed(workspace) {
    fs.mkdirSync(path.join(workspace, '.vscode'));
    fs.writeFileSync(path.join(workspace, '.vscode/.lorerelay-qa-fixture.json'), '{}');
    for (const rating of ['general', 'adult']) {
        const root = path.join(workspace, '.text-adventure/mods', `qa.${rating}`, '1.0.0');
        fs.mkdirSync(path.join(root, 'content'), { recursive: true });
        fs.writeFileSync(path.join(root, 'lorerelay.mod.json'), JSON.stringify({
            format: 'lorerelay-mod/1', id: `qa.${rating}`, version: '1.0.0', name: `Synthetic ${rating}`,
            authors: ['QA'], lorerelay: { minVersion: '1.84.32' }, contentRating: rating, contentTags: [],
            capabilities: ['persona'], dependencies: [], optionalDependencies: [], conflicts: [],
            entrypoints: { personas: [{ id: 'traveler', path: 'content/persona.json' }] },
        }));
        fs.writeFileSync(path.join(root, 'content/persona.json'), JSON.stringify({ version: 1, id: 'traveler', name: 'QA_PRIVATE_SENTINEL' }));
    }
    // Fixed invalid pair exercises the production Safe Mode, then Manager resolves it.
    fs.writeFileSync(path.join(workspace, '.text-adventure/mod-profile.json'), '{}');
    fs.writeFileSync(path.join(workspace, '.text-adventure/mod-lock.json'), '{}');
}
async function exercise(request, reload) {
    const pause = () => new Promise(resolve => setTimeout(resolve, 100));
    async function state(predicate) {
        let last;
        for (let i = 0; i < 50; i++) {
            const { host } = await request('mod_state'); last = host;
            if (host && predicate(host)) {
                assert(!JSON.stringify(host).includes('qa.adult'));
                assert(!JSON.stringify(host).includes('QA_PRIVATE_SENTINEL'));
                const dom = await request('rendered_state');
                if (dom.confirmed && dom.rendered.visible && dom.rendered.revision === host.semanticRevision) {
                    assert.equal(dom.rendered.safeMode, host.safeMode);
                    assert.equal(dom.rendered.adultVisible, false);
                    assert.equal(dom.rendered.previewVisible, !!host.preview);
                    if (host.notice) assert(dom.rendered.notice.length > 0);
                    assert.deepEqual(dom.rendered.packages.map(p => ({ id: p.id, enabled: p.enabled })),
                        host.packages.map(p => ({ id: p.id, enabled: p.enabled })));
                    assert.equal(dom.rendered.controls['mod-manager-commit'].enabled, host.canCommit);
                    return { host, dom };
                }
            }
            await pause();
        }
        throw new Error('mod_host_render_not_confirmed: ' + JSON.stringify(last));
    }
    async function click(controlId) {
        const result = await request('ui_action', { controlId, event: 'click' });
        assert.equal(result.rendered?.actionAccepted, true, `actual visible enabled control: ${controlId}`);
    }
    // Read-only probes may be retried while the real Webview starts; clicks never replay.
    for (let i = 0; i < 30; i++) {
        const result = await request('rendered_state');
        if (result.confirmed && result.rendered.controls['header-secondary-toggle'].visible) break;
        await pause();
    }
    await click('header-secondary-toggle');
    const selection = await request('ui_action', { controlId: 'locale-select', event: 'select', value: 'en' });
    assert.equal(selection.rendered.actionAccepted, true);
    assert.equal(selection.rendered.controls['locale-select'].selected, 'en');
    await click('mod-manager-btn');
    await state(s => s.safeMode && s.packages.length === 1);
    assert.deepEqual(await request('adult_denial'), { denied: true });
    await click('mod-manager-resolve');
    await state(s => s.canCommit);
    await click('mod-manager-commit');
    await state(s => !s.safeMode && !s.preview);
    await click('qa-mod-general-toggle');
    await state(s => s.packages[0].enabled);
    await click('mod-manager-resolve');
    await state(s => s.canCommit);
    await click('mod-manager-commit');
    const beforeReopen = await state(s => !s.preview && s.packages[0].enabled);
    await request('reopen');
    const notRendered = await request('rendered_state');
    assert.equal(notRendered.confirmed, false, 'new panel cannot confirm old rendered state');
    await click('header-secondary-toggle');
    await click('mod-manager-btn');
    const reopened = await state(s => s.packages[0].enabled);
    assert.notEqual(reopened.dom.generation, beforeReopen.dom.generation);
    await reload();
    // New panel has no published MOD state yet; open via its actual control.
    for (let i = 0; i < 30; i++) {
        const result = await request('rendered_state');
        if (result.confirmed && result.rendered.controls['header-secondary-toggle'].visible) break;
        await pause();
    }
    await click('header-secondary-toggle');
    await click('mod-manager-btn');
    await state(s => !s.safeMode && s.packages[0].enabled);
    await click('qa-mod-general-toggle');
    await state(s => !s.packages[0].enabled);
    await click('mod-manager-resolve');
    await state(s => s.canCommit);
    await click('mod-manager-commit');
    await state(s => !s.preview && !s.packages[0].enabled);
}
module.exports = { seed, exercise };
