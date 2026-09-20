'use strict';
const assert = require('assert/strict');
const { createUiPresentationStore, recommendUiPresentation } = require('../out/uiPresentationCore');
async function main() {
    const values = new Map(), posts = [];
    let current = { key: 'workspace-a:campaign', profile: 'campaign' }, fail = false, writes = 0;
    const bindings = { read: key => values.get(key), write: async (key, value) => {
        if (fail) throw Error('storage unavailable'); values.set(key, value); writes++;
    }, scope: () => current, post: value => posts.push(value) };
    const store = createUiPresentationStore(bindings);
    store.send(); assert.equal(posts.at(-1).preset, 'story'); assert.equal(writes, 0);
    await store.initialize(current.key, { playstyle: 'trade' }); assert.equal(values.get(current.key), 'management');
    await store.set({ type: 'setUiPresentation', scope: current.key, preset: 'cinematic' });
    await store.initialize(current.key, { playstyle: 'trade' }); assert.equal(values.get(current.key), 'cinematic', 'manual choice survives recommendation');
    await store.initialize(current.key, {}, 'story'); assert.equal(values.get(current.key), 'story', 'explicit wizard choice replaces preference');
    current = { key: 'workspace-a:parlor', profile: 'parlor' };
    await store.set({ type: 'setUiPresentation', scope: 'workspace-a:campaign', preset: 'management' });
    assert.equal(values.has(current.key), false, 'stale profile cannot save');
    await store.initialize(current.key, { playstyle: 'character_chat', imageGenerationWanted: true });
    assert.equal(values.get(current.key), 'cinematic');
    const reopened = createUiPresentationStore(bindings); reopened.send(); assert.equal(posts.at(-1).preset, 'cinematic');
    current = { key: 'workspace-b:parlor', profile: 'parlor' }; reopened.send(); assert.equal(posts.at(-1).saved, false);
    for (const invalid of ['unknown', null, { preset: 'management' }]) await store.set({ type: 'setUiPresentation', scope: current.key, preset: invalid });
    await store.set({ type: 'setUiPresentation', scope: current.key, preset: 'management', gameRules: {} });
    assert.equal(values.has(current.key), false);
    fail = true; await assert.rejects(store.set({ type: 'setUiPresentation', scope: current.key, preset: 'story' }));
    fail = false; await store.set({ type: 'setUiPresentation', scope: current.key, preset: 'management' });
    assert.equal(values.get(current.key), 'management', 'a failed write does not poison the queue');
    for (const style of ['trade','settlement','domain','guild','vehicle','mobile_base']) assert.equal(recommendUiPresentation({playstyle:style}), 'management');
    assert.equal(recommendUiPresentation({playstyle:'character_chat', imageGenerationWanted:false, bookkeeping:'detailed'}), 'story');
    assert.equal(recommendUiPresentation({playstyle:'adventure', bookkeeping:'detailed'}), 'management');
    assert.equal(recommendUiPresentation({playstyle:'adventure'}), 'story');
    // Queue identity is checked when work begins, not only when the message arrives.
    const prior = current.key;
    const pending = store.set({ type: 'setUiPresentation', scope: prior, preset: 'cinematic' });
    current = { key: 'workspace-c:campaign', profile:'campaign' }; await pending;
    assert.equal(values.get(prior), 'management'); assert.equal(values.has(current.key), false);
    console.log('UI presentation: recommendations, overrides, per-workspace/profile persistence, stale writes and failures passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
