const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function checkpointSnapshotLoad(request, parent, isMain) {
    if (request === 'vscode') {
        return { workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: (_key, fallback) => fallback }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const snapshotCore = require('../out/checkpointSnapshot.js');
Module._load = originalLoad;

let assertions = 0;
function equal(actual, expected, message) {
    assert.deepStrictEqual(actual, expected, message);
    assertions += 1;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-checkpoint-complete-'));
try {
    const gameState = {
        schemaVersion: 2,
        entries: [{ id: 'gm-1', role: 'gm', sender: 'GM', content: 'past' }],
        status: { hp: { current: 10, max: 20 } },
        commerce: { credits: 40, cargo: [], transportId: 'cart' },
        world: { currentLocationId: 'old-town', worldTurnAtLastSync: 4 },
        director: { act: 'one' },
        hiddenState: { culprit: 'mayor' },
        domain: { treasury: 9 },
        guild: { rank: 2 },
    };
    const expectedLedgers = {};
    for (const [index, fileName] of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES.entries()) {
        const value = { marker: `past-${index}`, nested: { turn: index } };
        expectedLedgers[fileName] = value;
        if (fileName !== 'settlement_layout.json') writeJson(path.join(root, fileName), value);
    }

    const snapshot = snapshotCore.captureCheckpointStateSnapshot(root, gameState);
    equal(Boolean(snapshot), true, 'complete snapshot captures valid mutable state');
    equal(snapshot.ledgers['settlement_layout.json'], { present: false }, 'absence is authoritative snapshot data');
    equal(snapshot.gameState.commerce, gameState.commerce, 'commerce root is preserved');
    equal(snapshot.gameState.hiddenState, gameState.hiddenState, 'hidden state is preserved');
    equal(snapshot.gameState.domain, gameState.domain, 'domain root is preserved');
    equal(snapshot.gameState.guild, gameState.guild, 'guild root is preserved');
    writeJson(path.join(root, 'game_state.json'), gameState);
    equal(snapshotCore.isCheckpointStateSnapshotCurrent(root, snapshot), true, 'unchanged game state and ledgers remain publishable');
    writeJson(path.join(root, 'game_state.json'), { ...gameState, commerce: { ...gameState.commerce, credits: 999 } });
    equal(snapshotCore.isCheckpointStateSnapshotCurrent(root, snapshot), false, 'game-state drift invalidates checkpoint publication');
    writeJson(path.join(root, 'game_state.json'), gameState);

    const history = [{ id: 'gm-1', role: 'gm', sender: 'GM', content: 'past' }];
    writeJson(path.join(root, 'game_history.json'), [{ id: 'gm-new' }]);
    for (const fileName of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES) {
        writeJson(path.join(root, fileName), { marker: 'future' });
    }
    let publishedState;
    const restored = snapshotCore.restoreCheckpointStateSnapshot(root, snapshot, history, {
        authorizationCurrent: () => true,
        writeGameState: state => {
            publishedState = state;
            writeJson(path.join(root, 'game_state.json'), state);
            return true;
        },
    });
    equal(restored, true, 'complete snapshot restores successfully');
    equal(readJson(path.join(root, 'game_history.json')), history, 'history returns to checkpoint');
    equal(publishedState, gameState, 'full game state is published without dropping canonical roots');
    for (const fileName of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES) {
        const filePath = path.join(root, fileName);
        if (fileName === 'settlement_layout.json') {
            equal(fs.existsSync(filePath), false, 'a ledger absent at checkpoint is removed on restore');
        } else {
            equal(readJson(filePath), expectedLedgers[fileName], `${fileName} returns to checkpoint`);
        }
    }

    const beforeFailure = {};
    writeJson(path.join(root, 'game_history.json'), [{ id: 'current-history' }]);
    for (const fileName of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES) {
        const value = { marker: `current-${fileName}` };
        writeJson(path.join(root, fileName), value);
        beforeFailure[fileName] = value;
    }
    const failed = snapshotCore.restoreCheckpointStateSnapshot(root, snapshot, history, {
        authorizationCurrent: () => true,
        writeGameState: () => {
            writeJson(path.join(root, 'game_state.json'), { partiallyPublished: true });
            return false;
        },
    });
    equal(failed, false, 'game-state publication failure fails the restore');
    equal(readJson(path.join(root, 'game_history.json')), [{ id: 'current-history' }], 'failed restore rolls history back');
    equal(readJson(path.join(root, 'game_state.json')), gameState, 'failed final publication rolls game state back');
    for (const fileName of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES) {
        equal(readJson(path.join(root, fileName)), beforeFailure[fileName], `failed restore rolls ${fileName} back`);
    }

    let guardChecks = 0;
    const expired = snapshotCore.restoreCheckpointStateSnapshot(root, snapshot, history, {
        authorizationCurrent: () => ++guardChecks < 4,
        writeGameState: () => true,
    });
    equal(expired, false, 'authorization drift aborts before game-state publication');
    equal(readJson(path.join(root, 'game_history.json')), [{ id: 'current-history' }], 'authorization drift rolls history back');

    const missingLedger = JSON.parse(JSON.stringify(snapshot));
    delete missingLedger.ledgers['world_state.json'];
    equal(snapshotCore.parseCheckpointStateSnapshot(missingLedger), undefined, 'missing enumerated ledger evidence is rejected');
    const extraLedger = JSON.parse(JSON.stringify(snapshot));
    extraLedger.ledgers['runtime_authority.json'] = { present: false };
    equal(snapshotCore.parseCheckpointStateSnapshot(extraLedger), undefined, 'unrecognized files cannot enter restore authority');
    const nonJsonSnapshot = JSON.parse(JSON.stringify(snapshot));
    nonJsonSnapshot.gameState.invalid = 1n;
    equal(snapshotCore.parseCheckpointStateSnapshot(nonJsonSnapshot), undefined, 'non-JSON values fail closed without escaping the parser');
    const malformedRoot = path.join(root, 'malformed');
    fs.mkdirSync(malformedRoot);
    fs.writeFileSync(path.join(malformedRoot, 'world_state.json'), '{', 'utf8');
    equal(snapshotCore.captureCheckpointStateSnapshot(malformedRoot, gameState), undefined, 'malformed existing ledger blocks checkpoint capture');

    const racingRoot = path.join(root, 'racing');
    fs.mkdirSync(racingRoot);
    for (const fileName of snapshotCore.CHECKPOINT_MUTABLE_LEDGER_FILES) {
        writeJson(path.join(racingRoot, fileName), { marker: 'stable' });
    }
    const worldPath = path.join(racingRoot, 'world_state.json');
    const originalReadFileSync = fs.readFileSync;
    let worldReads = 0;
    fs.readFileSync = function racingRead(filePath, ...args) {
        if (path.resolve(String(filePath)) === path.resolve(worldPath) && ++worldReads === 2) {
            fs.writeFileSync(worldPath, JSON.stringify({ marker: 'changed' }), 'utf8');
        }
        return originalReadFileSync.call(this, filePath, ...args);
    };
    try {
        equal(snapshotCore.captureCheckpointStateSnapshot(racingRoot, gameState), undefined, 'final revalidation rejects a ledger changed during capture');
    } finally {
        fs.readFileSync = originalReadFileSync;
    }
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}

console.log(`Checkpoint complete-state snapshot: ${assertions}/${assertions} assertions passed.`);
