const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-gm-host-'));
const ledgers = ['world_state.json', 'npc_registry.json', 'vehicle_state.json', 'settlement_state.json',
    'settlement_layout.json', 'discoveries.json', 'campaign_resources.json'];
let resume, parentLease, writes = 0, claudeStarts = 0, busy = false, partial = false, epoch = 'epoch', afterAuthorization = () => {};
class Client {
    async initialize() { return 'ready'; }
    generate() { return new Promise(resolve => { resume = () => resolve('candidate'); }); }
    dispose() {} // Deliberately delivers late after cancellation: Host must still reject it.
}
const filename = path.resolve(__dirname, '../out/gmConnectionHost.js');
const nativeRequire = createRequire(filename);
const mocks = {
    vscode: { workspace: { onDidChangeWorkspaceFolders: () => ({}), onDidChangeConfiguration: () => ({}) } },
    './codexGmClient': { CodexGmClient: Client },
    './claudeGmClient': { ClaudeGmClient: class extends Client { constructor() { super(); claudeStarts++; } } },
    './experience': { onExperienceProfileChanged: () => ({}) },
    './checkpointSnapshot': { CHECKPOINT_MUTABLE_LEDGER_FILES: ledgers },
    './workspacePaths': { getWorkspacePath: () => workspace },
    './acceptedTurnReplayGuard': {
        loadExistingAcceptedTurnScope: () => ({ campaignInstanceId: 'campaign', timelineEpochId: epoch }),
        loadAcceptedTurnLedger: () => ({ records: [] }),
    },
    './gameStateSync': { submitGmTurnCandidate: async (_, candidate, isCurrent) => {
        afterAuthorization();
        if (!isCurrent()) return { kind: 'stale', reason: 'stale candidate' };
        writes++;
        return { kind: 'newlyAccepted', persistence: partial ? 'partial' : 'complete' };
    } },
};
const exportsObject = {};
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports: exportsObject, require: id => Object.hasOwn(mocks, id) ? mocks[id] : nativeRequire(id),
    console, Buffer,
}, { filename });
exportsObject.initializeGmConnectionHost({ subscriptions: [], globalStorageUri: { fsPath: workspace },
    workspaceState: { get: () => ({ executable: 'fixture', model: 'fixture-model' }) },
}, { run: async (_, identity, fn) => busy ? { status: 'busy' } : { status: 'completed', value: await fn() } }, () => parentLease);
const start = async provider => {
    fs.writeFileSync(path.join(workspace, 'game_state.json'), '{}');
    const pending = exportsObject.runConnectedGmCandidate('input', () => ({ turnId: 'one' }), () => {}, undefined, provider);
    // Register rejection immediately, before adversarial mutation and delivery.
    const result = pending.then(value => ({ value }), error => ({ error }));
    await new Promise(resolve => setImmediate(resolve));
    return { result, deliver: resume };
};
(async () => {
    let operation = await start(); operation.deliver();
    assert.equal((await operation.result).value, true); assert.equal(writes, 1);
    for (const file of [...ledgers, 'game_rules.json', 'world_forge.json']) {
        operation = await start();
        fs.writeFileSync(path.join(workspace, file), '{"changed":true}');
        operation.deliver(); assert.match((await operation.result).error.message, /stale/);
    }
    operation = await start(); epoch = 'restored'; operation.deliver();
    assert.match((await operation.result).error.message, /stale/);
    operation = await start(); exportsObject.cancelGmConnection(); operation.deliver();
    assert.match((await operation.result).error.message, /stale/);
    busy = true; operation = await start(); operation.deliver();
    assert.match((await operation.result).error.message, /WORLD_MUTATION/); busy = false;
    afterAuthorization = () => exportsObject.cancelGmConnection();
    operation = await start(); operation.deliver();
    assert.match((await operation.result).error.message, /stale/); afterAuthorization = () => {};
    assert.equal(writes, 1, 'No stale, cancelled or busy candidate may reach persistence');
    partial = true; operation = await start(); operation.deliver();
    assert.match((await operation.result).error.message, /partial persistence/);
    assert.equal(writes, 2, 'A partial write is surfaced without replay');
    partial = false; busy = true;
    parentLease = { workspaceKey: workspace, identity: { actionKind: 'gameplay_request', requestId: 'human' } };
    operation = await start(); operation.deliver();
    assert.equal((await operation.result).value, true, 'Use the existing gameplay lease instead of reacquiring it');
    operation = await start(); parentLease = undefined; operation.deliver();
    assert.match((await operation.result).error.message, /stale/);
    assert.equal(writes, 3, 'An expired parent gameplay lease cannot authorize commit');
    busy = false;
    operation = await start('claude-code-subscription'); operation.deliver();
    assert.equal((await operation.result).value, true);
    operation = await start('claude-code-subscription');
    fs.writeFileSync(path.join(workspace, 'world_state.json'), '{"changedAgain":true}'); operation.deliver();
    assert.match((await operation.result).error.message, /stale/);
    assert.equal(claudeStarts, 2); assert.equal(writes, 4, 'Claude shares the same late-candidate guard');
    console.log('GM Host adversarial fixture: ledger/settings changes, epoch, late delivery, post-authorization cancel, busy and partial persistence passed. No model used.');
})().catch(error => { console.error(error); process.exitCode = 1; });
