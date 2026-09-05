#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { installVscodeStub } = require('./test_helpers/vscode_stub');

const root = path.join(__dirname, '..');
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-turn-side-effect-deferral-'));
const worldPath = path.join(workspace, 'world_state.json');
const npcPath = path.join(workspace, 'npc_registry.json');
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`FAIL: ${message}`);
        failed++;
    } else {
        console.log(`OK: ${message}`);
    }
}

const restoreVscode = installVscodeStub({
    workspace: {
        workspaceFolders: [{ name: 'turn-deferral', uri: { fsPath: workspace } }],
        getConfiguration: () => ({
            get(_key, defaultValue) { return defaultValue; },
            update: async () => undefined,
        }),
    },
});

try {
    const worldState = require(path.join(root, 'out', 'worldState.js'));
    const npcRegistry = require(path.join(root, 'out', 'npcRegistry.js'));
    const originalWorld = {
        format: 'lorerelay-world-state/1.1',
        worldTurn: 4,
        factions: {},
        regions: {},
        globalEvents: [],
    };
    const originalNpc = {
        format: 'lorerelay-npc-registry/1.0',
        npcs: {},
    };
    fs.writeFileSync(worldPath, JSON.stringify(originalWorld), 'utf8');
    fs.writeFileSync(npcPath, JSON.stringify(originalNpc), 'utf8');
    worldState.clearWorldStateCache();
    npcRegistry.clearNpcRegistryCache();

    assert(worldState.beginWorldStateWriteDeferral(), 'world deferral lease starts');
    assert(npcRegistry.beginNpcRegistryWriteDeferral(), 'NPC deferral lease starts');
    worldState.saveWorldState({ ...originalWorld, worldTurn: 5 });
    npcRegistry.saveNpcRegistry({
        ...originalNpc,
        npcs: {
            guide: {
                name: 'Guide',
                disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
                needs: [],
                memories: [],
            },
        },
    });
    assert(JSON.parse(fs.readFileSync(worldPath, 'utf8')).worldTurn === 4, 'pre-commit world write stays off disk');
    assert(!JSON.parse(fs.readFileSync(npcPath, 'utf8')).npcs.guide, 'pre-commit NPC write stays off disk');
    assert(worldState.loadWorldState().worldTurn === 5, 'staged world state is visible inside the turn');
    assert(Boolean(npcRegistry.loadNpcRegistry().npcs.guide), 'staged NPC registry is visible inside the turn');

    worldState.rollbackWorldStateWriteDeferral();
    npcRegistry.rollbackNpcRegistryWriteDeferral();
    assert(worldState.loadWorldState().worldTurn === 4, 'rollback restores disk world authority');
    assert(!npcRegistry.loadNpcRegistry().npcs.guide, 'rollback restores disk NPC authority');

    assert(worldState.beginWorldStateWriteDeferral(), 'world deferral lease restarts after rollback');
    assert(npcRegistry.beginNpcRegistryWriteDeferral(), 'NPC deferral lease restarts after rollback');
    worldState.saveWorldState({ ...originalWorld, worldTurn: 6 });
    npcRegistry.saveNpcRegistry({
        ...originalNpc,
        npcs: {
            scout: {
                name: 'Scout',
                disposition: { playerTrust: 50, playerRomance: 0, playerFear: 0, mood: 'neutral', lastInteractionTurn: 0 },
                needs: [],
                memories: [],
            },
        },
    });
    assert(worldState.commitWorldStateWriteDeferral(), 'world deferral publishes after commit boundary');
    assert(npcRegistry.commitNpcRegistryWriteDeferral(), 'NPC deferral publishes after commit boundary');
    assert(JSON.parse(fs.readFileSync(worldPath, 'utf8')).worldTurn === 6, 'committed world state reaches disk');
    assert(Boolean(JSON.parse(fs.readFileSync(npcPath, 'utf8')).npcs.scout), 'committed NPC registry reaches disk');
} finally {
    restoreVscode();
}

if (failed > 0) process.exit(1);
console.log('accepted turn side-effect deferral: all tests passed.');
