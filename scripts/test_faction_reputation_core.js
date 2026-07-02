#!/usr/bin/env node
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'factionReputationCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!require('fs').existsSync(corePath)) {
    fail('out/factionReputationCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    clampReputation,
    reputationTier,
    applyReputationDeltas,
    applyPlayerReputationToFactions,
    parseReputationOps,
    deriveQuestCompletionDeltas,
    buildReputationPromptLine,
    resolveFactionIdForQuestHook,
} = require(corePath);

{
    if (clampReputation(200) !== 100 || clampReputation(-200) !== -100 || clampReputation(12.4) !== 12) {
        fail('clampReputation');
    } else {
        ok('clampReputation');
    }
}

{
    if (reputationTier(-70) !== 'hostile') { fail('tier hostile'); }
    else if (reputationTier(-30) !== 'unfriendly') { fail('tier unfriendly'); }
    else if (reputationTier(0) !== 'neutral') { fail('tier neutral'); }
    else if (reputationTier(40) !== 'friendly') { fail('tier friendly'); }
    else if (reputationTier(80) !== 'allied') { fail('tier allied'); }
    else {
        ok('reputationTier boundaries');
    }
}

{
    const merged = applyReputationDeltas({ guild: 5 }, [
        { factionId: 'guild', delta: 10 },
        { factionId: 'guild', delta: -3 },
        { factionId: 'bad id', delta: 5 }
    ]);
    if (merged.guild !== 12) {
        fail(`applyReputationDeltas merge: ${merged.guild}`);
    } else {
        ok('applyReputationDeltas');
    }
}

{
    const factions = applyPlayerReputationToFactions(
        { guild: { power: 50 } },
        [{ factionId: 'guild', delta: 15 }],
        new Set(['guild'])
    );
    if (factions.guild.playerReputation !== 15) {
        fail('applyPlayerReputationToFactions');
    } else {
        ok('applyPlayerReputationToFactions');
    }
}

{
    const ops = parseReputationOps([
        { factionId: 'guild_x', delta: 8, reason: 'quest' },
        { factionId: '', delta: 5 },
        { factionId: 'guild_x', delta: 999 }
    ]);
    if (ops.length !== 2 || ops[1].delta !== 50) {
        fail(`parseReputationOps: ${JSON.stringify(ops)}`);
    } else {
        ok('parseReputationOps');
    }
}

{
    const hook = {
        id: 'quest_npc_help',
        title: 'Help',
        description: 'd',
        source: 'npc',
        relatedId: 'need_1',
        status: 'active',
        turnGenerated: 1,
        npcId: 'npc_a'
    };
    const registry = {
        version: '1',
        npcs: {
            npc_a: {
                id: 'npc_a',
                name: 'A',
                disposition: { mood: 'neutral', playerTrust: 50 },
                needs: [],
                memories: [],
                factionId: 'watchers'
            }
        }
    };
    const factionId = resolveFactionIdForQuestHook(hook, [], registry);
    if (factionId !== 'watchers') {
        fail(`resolveFactionIdForQuestHook npc: ${factionId}`);
    } else {
        ok('resolveFactionIdForQuestHook npc');
    }
    const deltas = deriveQuestCompletionDeltas(
        [hook],
        new Set(['quest_npc_help']),
        [],
        registry
    );
    if (deltas.length !== 1 || deltas[0].factionId !== 'watchers') {
        fail('deriveQuestCompletionDeltas');
    } else {
        ok('deriveQuestCompletionDeltas');
    }
}

{
    const line = buildReputationPromptLine([
        { id: 'a', name: 'Guild', rep: 0 },
        { id: 'b', name: 'Cult', rep: -45 }
    ]);
    if (line === '' || !line.includes('Cult') || !line.includes('unfriendly')) {
        fail(`buildReputationPromptLine: ${line}`);
    } else {
        ok('buildReputationPromptLine');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('All faction reputation core tests passed.');