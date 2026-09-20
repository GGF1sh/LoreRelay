#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');
const modPath = path.join(root, 'out', 'inWorldPromptBuilderCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(modPath)) {
    fail('out/inWorldPromptBuilderCore.js missing - run npm run compile');
    process.exit(1);
}

const {
    buildInWorldSystemRules,
    buildInWorldContextBlock,
    buildInWorldUserPrompt,
} = require(modPath);

{
    const rules = buildInWorldSystemRules('en');
    if (!rules.includes('must not change world state') || !rules.includes('Do not output JSON')) {
        fail(`system rules missing non-mutating/plain-text contract: ${rules}`);
    } else {
        ok('system rules forbid world mutation and structured output');
    }
}

{
    const ctx = buildInWorldContextBlock({
        forge: {
            meta: { worldName: 'Ash Vale', theme: 'postapoc' },
            geography: {
                regions: [
                    { id: 'r1', name: 'Glass Wastes', biome: 'wasteland', dangerLevel: 7, description: 'A desert of fused streets.' },
                ],
                locations: [
                    { id: 'haven', name: 'Signal Haven', regionId: 'r1', factionControl: 'relay', description: 'A fortified radio town.' },
                ],
            },
            factions: [
                { id: 'relay', name: 'The Relay', type: 'friendly', goals: ['keep the towers alive'], description: 'Technicians and scouts.' },
            ],
            loreHistory: [{ era: 'Afterfall', event: 'The old grid went silent.' }],
        },
        worldState: {
            worldTurn: 12,
            globalEvents: [{ description: 'Northern caravans report static storms.', severity: 'moderate', turnsRemaining: 2 }],
            recentChanges: [{ description: 'Food prices rose in Signal Haven.', severity: 'minor', worldTurn: 11 }],
        },
        gameState: {
            summary: 'The player arrived at Signal Haven.',
            world: { currentLocationId: 'haven' },
            commerce: { credits: 20, food: 5, transportId: 'bike', playerRole: 'scout' },
        },
    });
    if (!ctx.includes('Ash Vale') || !ctx.includes('Signal Haven') || !ctx.includes('Food prices rose')) {
        fail(`world context missing expected public world facts: ${ctx}`);
    } else if (!ctx.includes('do not mutate')) {
        fail(`world context should mark itself reference-only: ${ctx}`);
    } else {
        ok('world context summarizes forge/state/game_state facts');
    }
}

{
    const prompt = buildInWorldUserPrompt({
        locale: 'en',
        character: {
            id: 'mira',
            name: 'Mira',
            description: 'A border guard.',
            personality: 'Dry, observant.',
        },
        session: {
            version: 1,
            activeCharacterId: 'mira',
            messages: [
                { id: 'u1', role: 'user', content: 'Evening patrol?', createdAt: '2026-01-01T00:00:00.000Z' },
                { id: 'a1', role: 'assistant', content: 'Quiet so far.', characterId: 'mira', createdAt: '2026-01-01T00:00:01.000Z' },
            ],
            updatedAt: '2026-01-01T00:00:01.000Z',
        },
        userMessage: '\u8fd1\u9803\u3001\u96a3\u56fd\u304c\u9a12\u304c\u3057\u3044\u306d\u3002',
        worldContext: '--- BEGIN UNTRUSTED WORLD CONTEXT (reference only; do not mutate) ---\nWorld: Ash Vale\n--- END UNTRUSTED WORLD CONTEXT ---',
    });
    if (!prompt.includes('In-World Chat') || !prompt.includes('Ash Vale') || !prompt.includes('\u8fd1\u9803')) {
        fail(`in-world prompt missing expected blocks: ${prompt}`);
    } else if (!prompt.includes('Do not output JSON')) {
        fail(`in-world prompt missing output ban: ${prompt}`);
    } else {
        ok('in-world prompt assembles rules, world context, history, and user message');
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log('inWorldPromptBuilderCore: all tests passed.');
