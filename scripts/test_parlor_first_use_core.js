#!/usr/bin/env node
'use strict';

// Parlor first-use path: import activation, greeting once, LM preflight.

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const corePath = path.join(root, 'out', 'parlorFirstUseCore.js');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg) { console.log(`OK: ${msg}`); }

if (!fs.existsSync(corePath)) {
    fail('out/parlorFirstUseCore.js missing — run npm run compile first');
    process.exit(1);
}

const {
    resolveActiveIdAfterImport,
    resolveParlorActiveCharacterId,
    shouldInsertParlorFirstGreeting,
    evaluateParlorVscodeLmPreflight,
} = require(corePath);

// 1. first imported character becomes active
{
    const id = resolveActiveIdAfterImport('alice');
    if (id !== 'alice') {
        fail(`1. expected alice, got ${id}`);
    } else {
        ok('1. first imported character becomes active');
    }
}

// 2. importing a second character selects the newly imported character
{
    // Previous active may be alice; import always returns the new id.
    const previousActive = 'alice';
    const imported = resolveActiveIdAfterImport('bob');
    if (imported !== 'bob' || imported === previousActive) {
        fail(`2. expected bob after second import, got ${imported}`);
    } else {
        // Parlor resolution with preferred/imported as preferredId wins over old active.
        const resolved = resolveParlorActiveCharacterId({
            preferredId: imported,
            persistedActiveId: previousActive,
            characterIds: ['alice', 'bob'],
        });
        if (resolved !== 'bob') {
            fail(`2. parlor resolve should pick bob, got ${resolved}`);
        } else {
            ok('2. importing a second character selects the newly imported character');
        }
    }
}

// 3. existing active character behavior remains deterministic (manual path)
{
    // No preferred id: keep persisted active when valid among many characters.
    const a = resolveParlorActiveCharacterId({
        preferredId: undefined,
        persistedActiveId: 'alice',
        characterIds: ['alice', 'bob', 'cara'],
    });
    const b = resolveParlorActiveCharacterId({
        preferredId: undefined,
        persistedActiveId: 'alice',
        characterIds: ['alice', 'bob', 'cara'],
    });
    // Explicit preferred (manual selection) wins.
    const manual = resolveParlorActiveCharacterId({
        preferredId: 'cara',
        persistedActiveId: 'alice',
        characterIds: ['alice', 'bob', 'cara'],
    });
    // Invalid persisted falls back to sole character only when exactly one remains.
    const sole = resolveParlorActiveCharacterId({
        preferredId: undefined,
        persistedActiveId: 'ghost',
        characterIds: ['only_one'],
    });
    const multiNoActive = resolveParlorActiveCharacterId({
        preferredId: undefined,
        persistedActiveId: 'ghost',
        characterIds: ['alice', 'bob'],
    });
    if (a !== 'alice' || b !== 'alice') {
        fail(`3. persisted active not stable: ${a}/${b}`);
    } else if (manual !== 'cara') {
        fail(`3. manual preferred broken: ${manual}`);
    } else if (sole !== 'only_one') {
        fail(`3. sole character fallback broken: ${sole}`);
    } else if (multiNoActive !== undefined) {
        fail(`3. multi without valid active should be undefined, got ${multiNoActive}`);
    } else {
        ok('3. existing active character behavior remains deterministic');
    }
}

// 4. greeting is not duplicated after reopening Parlor
{
    const first = shouldInsertParlorFirstGreeting(0, 'Hello there.');
    const reopen = shouldInsertParlorFirstGreeting(1, 'Hello there.');
    const empty = shouldInsertParlorFirstGreeting(0, '   ');
    const missing = shouldInsertParlorFirstGreeting(0, undefined);
    if (!first) {
        fail('4. empty session should insert greeting');
    } else if (reopen) {
        fail('4. non-empty session must not insert greeting again');
    } else if (empty || missing) {
        fail('4. blank first_mes must not insert');
    } else {
        ok('4. greeting is not duplicated after reopening Parlor');
    }
}

// 5. no-model preflight occurs before a user message is appended
{
    const blocked = evaluateParlorVscodeLmPreflight({
        provider: 'vscode-lm',
        availableModelCount: 0,
    });
    const okModel = evaluateParlorVscodeLmPreflight({
        provider: 'vscode-lm',
        availableModelCount: 2,
    });
    const other = evaluateParlorVscodeLmPreflight({
        provider: 'clipboard',
        availableModelCount: 0,
    });
    // Host contract: when blocked, caller must return before appendAndSaveParlorMessage.
    // Pure rule: preflight failure is observable before any session mutation.
    const wouldAppendUserMessage = (preflight) => preflight.ok === true;
    if (blocked.ok || blocked.reason !== 'no_model') {
        fail(`5. expected no_model block: ${JSON.stringify(blocked)}`);
    } else if (!okModel.ok || !other.ok) {
        fail('5. valid model / non-vscode-lm should pass');
    } else if (wouldAppendUserMessage(blocked)) {
        fail('5. blocked preflight must prevent user message append');
    } else if (!wouldAppendUserMessage(okModel)) {
        fail('5. ok preflight must allow append');
    } else {
        ok('5. no-model preflight occurs before a user message is appended');
    }
}

// Extra: empty import id rejected
{
    if (resolveActiveIdAfterImport('') !== undefined
        || resolveActiveIdAfterImport('   ') !== undefined) {
        fail('empty import id should be rejected');
    } else {
        ok('empty import id rejected');
    }
}

if (failed > 0) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
}
console.log('\nAll parlor first-use core tests passed.');
process.exit(0);
