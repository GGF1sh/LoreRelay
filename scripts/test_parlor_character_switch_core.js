#!/usr/bin/env node
'use strict';

// PARLOR-CHARACTER-SWITCH-001: host decision + character-owned session contract.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const switchCore = require(path.join(root, 'out', 'parlorCharacterSwitchCore.js'));
const firstUse = require(path.join(root, 'out', 'parlorFirstUseCore.js'));
const sessions = require(path.join(root, 'out', 'parlorSessionCore.js'));

function withGreeting(session, characterId, firstMes) {
    if (!firstUse.shouldInsertParlorFirstGreeting(session.messages.length, firstMes)) {
        return session;
    }
    return sessions.appendParlorMessage(session, {
        role: 'assistant', content: firstMes, characterId,
    });
}

function run() {
    assert.deepStrictEqual(
        switchCore.evaluateParlorCharacterSwitch({
            requestedCharacterId: 'bob', characterIds: ['alice', 'bob'], isBusy: false,
        }),
        { ok: true, characterId: 'bob' },
        'valid requested character is accepted'
    );
    assert.deepStrictEqual(
        switchCore.evaluateParlorCharacterSwitch({
            requestedCharacterId: 'bob', characterIds: ['alice', 'bob'], isBusy: true,
        }),
        { ok: false, reason: 'busy' },
        'busy switch is rejected before active state changes'
    );
    assert.deepStrictEqual(
        switchCore.evaluateParlorCharacterSwitch({
            requestedCharacterId: 'missing', characterIds: ['alice'], isBusy: false,
        }),
        { ok: false, reason: 'invalid-character' },
        'unknown character cannot select a session'
    );

    let alice = withGreeting(sessions.createEmptyParlorSession('alice'), 'alice', 'Alice greeting');
    alice = sessions.appendParlorMessage(alice, { role: 'user', content: 'Alice only', characterId: 'alice' });
    let bob = withGreeting(sessions.createEmptyParlorSession('bob'), 'bob', 'Bob greeting');
    assert.strictEqual(bob.messages.some((message) => message.content === 'Alice only'), false,
        'new B session contains no A history');
    const bobAfterRepeatSwitch = withGreeting(bob, 'bob', 'Bob greeting');
    assert.strictEqual(bobAfterRepeatSwitch.messages.filter((message) => message.content === 'Bob greeting').length, 1,
        'repeated B switches do not duplicate first greeting');
    assert.deepStrictEqual(alice.messages.map((message) => message.content), ['Alice greeting', 'Alice only'],
        'switching back restores A history exactly');
    assert.notStrictEqual(sessions.getCharacterParlorSessionFilename('alice'), sessions.getCharacterParlorSessionFilename('bob'),
        'A and B keep distinct authoritative session files');

    const bridge = fs.readFileSync(path.join(root, 'src', 'parlorBridge.ts'), 'utf8');
    const importer = fs.readFileSync(path.join(root, 'src', 'tavernCardImporter.ts'), 'utf8');
    assert(/switchParlorCharacter[\s\S]*if \(!isParlorMode\(\)\)[\s\S]*isBusy: parlorInFlight \|\| isParlorBridgeBusy\(\)[\s\S]*return startParlorMode\(decision\.characterId\)/.test(bridge),
        'host switch checks Parlor state and busy state then reuses the canonical transition');
    assert(/characters: getCharacters\(\)\.map\(\(character\) => \(\{[\s\S]*id: character\.id,[\s\S]*name: character\.name,[\s\S]*portrait/.test(bridge),
        'settings payload exposes only bounded selector fields');
    assert(!/characters: getCharacters\(\)[\s\S]{0,500}stSource/.test(bridge),
        'settings payload never exposes ST prompts');
    assert(/importTavernCard\(\{ activate: false \}\)/.test(fs.readFileSync(path.join(root, 'src', 'extension.ts'), 'utf8')),
        'Parlor import defers activation until the canonical session switch');
    assert(/options\?\.activate !== false/.test(importer), 'normal importer activation remains configurable for the Parlor wrapper');

    console.log('Parlor character-switch host/core regression tests passed.');
}

try {
    run();
} catch (error) {
    console.error(error.stack || error);
    process.exit(1);
}
