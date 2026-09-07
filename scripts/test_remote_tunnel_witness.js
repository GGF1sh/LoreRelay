'use strict';
const assert = require('assert/strict');
const { createRemoteTunnelWitness } = require('../out/remoteTunnelWitness');
async function main() {
    let reply = 'foreign';
    let revocations = 0;
    let witness;
    const probe = async (url, options) => {
        assert.match(url, /^https:\/\/fixture\.invalid\/health\?probe=[a-f0-9]{32}$/);
        assert.equal(options.redirect, 'error');
        assert.deepEqual(options.headers, { 'Cache-Control': 'no-store' }, 'health probe must carry no bearer or Host IPC credential');
        if (reply === 'offline') throw new Error('offline');
        return new Response(reply === 'correct' ? `${witness.witness}:${new URL(url).searchParams.get('probe')}` : reply);
    };
    witness = createRemoteTunnelWitness('https://fixture.invalid', () => revocations++, probe);
    await witness.check();
    assert.equal(witness.isReady(), false);
    assert.equal(revocations, 0, 'allow initial setup before a tunnel has ever connected');
    reply = 'correct';
    await witness.check();
    assert(witness.isReady());
    reply = 'offline';
    await witness.check();
    assert.equal(witness.isReady(), false);
    assert.equal(revocations, 1);
    reply = 'correct';
    await witness.check();
    assert.equal(witness.isReady(), false, 'a reopened tunnel cannot revive an old session');
    let release, pendingUrl;
    const delayed = createRemoteTunnelWitness('https://fixture.invalid', () => revocations++, url => new Promise(resolve => { release = resolve; pendingUrl = url; }));
    const pending = delayed.check();
    delayed.close();
    release(new Response(`${delayed.witness}:${new URL(pendingUrl).searchParams.get('probe')}`));
    await pending;
    assert.equal(delayed.isReady(), false, 'late probe after shutdown must not revive');
    assert.equal(revocations, 1);
    console.log('Remote tunnel witness: initial setup, identity, outage revocation, no revival and late-response handling passed. No actual tunnel claimed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
