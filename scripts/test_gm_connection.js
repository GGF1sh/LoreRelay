const assert = require('node:assert/strict');
const { GmCandidateGate } = require('../out/gmConnectionCore');
const witness = { workspace: 'fixture', campaignInstanceId: 'campaign', timelineEpochId: 'epoch',
    parentIdentityHash: null, hostSession: 'host', requestId: 'request' };
const candidate = { narration: 'Hello', turnId: 'turn-1' };
let writes = 0;
const gate = new GmCandidateGate(witness);
assert.equal(gate.submit(witness, candidate, () => writes++), 'ready');
assert.equal(gate.submit(witness, candidate, () => writes++), 'duplicate');
assert.equal(gate.submit(witness, { ...candidate, narration: 'Different' }, () => writes++), 'conflict');
assert.equal(writes, 1);
for (const field of Object.keys(witness)) {
    const stale = new GmCandidateGate(witness);
    assert.equal(stale.submit({ ...witness, [field]: 'changed' }, candidate, () => writes++), 'stale');
}
const cancelled = new GmCandidateGate(witness);
cancelled.cancel();
assert.equal(cancelled.submit(witness, candidate, () => writes++), 'cancelled');
const unknown = new GmCandidateGate(witness);
assert.equal(unknown.submit(witness, candidate, () => { writes++; throw new Error('after write'); }), 'outcome_unknown');
assert.equal(unknown.submit(witness, candidate, () => writes++), 'outcome_unknown');
assert.equal(writes, 2);
console.log('GM candidate gate: identity changes, cancellation, duplicates, conflicts and ambiguous persistence passed.');

const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const bootstrap = fs.readFileSync(path.join(__dirname, '../webview/modules/90-bootstrap.js'), 'utf8');
const endStart = bootstrap.indexOf("} else if (msg.type === 'gmEnd'");
const endBody = bootstrap.slice(bootstrap.indexOf('{', endStart) + 1, bootstrap.indexOf("} else if (msg.type === 'playerInputBusy')", endStart));
for (const newerInput of ['', 'new draft']) {
    let saves = 0;
    const note = { value: '' };
    const context = { msg: { canceled: true }, window: { gmPendingInput: { text: ' original input ', authorsNote: 'note' } },
        freeInput: { value: newerInput }, document: { getElementById: () => note },
        hideGmLoading() {}, autoGrowFreeInput() {}, saveState() { saves++; }, addSystemMessage() {}, T: key => key };
    vm.runInNewContext(endBody, context);
    assert.equal(context.freeInput.value, newerInput || ' original input ');
    assert.equal(context.window.gmPendingInput, undefined);
    assert.equal(saves, newerInput ? 0 : 1);
}
console.log('Cancelled GM input is restored without overwriting a newer draft or resending it.');
