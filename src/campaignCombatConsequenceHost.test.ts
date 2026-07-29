import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import {
    ackCombatConsequenceInjectedMarker,
    readCombatConsequenceInjectedMarker,
    writeCombatConsequenceInjectedMarker,
} from './campaignCombatPendingStore';

test('inject marker write once; exact re-ACK is alreadySatisfied; digest mismatch fails', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-v1c-inject-'));
    const token = {
        combatSessionId: 'sess-x',
        receiptHash: 'a'.repeat(64),
        sourceDigest: 'digest-1',
    };
    const first = ackCombatConsequenceInjectedMarker(root, token);
    assert.equal(first, 'applied');
    const marker = readCombatConsequenceInjectedMarker(root, token.receiptHash);
    assert.ok(marker);
    assert.equal(marker!.sourceDigest, 'digest-1');

    const second = ackCombatConsequenceInjectedMarker(root, token);
    assert.equal(second, 'alreadySatisfied');

    const badDigest = ackCombatConsequenceInjectedMarker(root, {
        ...token,
        sourceDigest: 'digest-2',
    });
    assert.equal(badDigest, 'failed');

    // Pre-write then exact match still alreadySatisfied
    writeCombatConsequenceInjectedMarker(root, {
        schemaVersion: 'combat-consequence-injected-v1',
        combatSessionId: 'sess-y',
        receiptHash: 'b'.repeat(64),
        sourceDigest: 'd2',
    });
    assert.equal(
        ackCombatConsequenceInjectedMarker(root, {
            combatSessionId: 'sess-y',
            receiptHash: 'b'.repeat(64),
            sourceDigest: 'd2',
        }),
        'alreadySatisfied',
    );
});
