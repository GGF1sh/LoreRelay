import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { test } from 'node:test';
import { emptyCombatLabDocument, initialCombatLabScenarios } from './combatLabCore';
import { combatLabFile, loadCombatLabDocument, writeCombatLabDocument } from './combatLabStore';
test('Combat Lab workspace save and malformed document recovery preserve a safe document', () => { const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-lab-')); try { const document = { ...emptyCombatLabDocument(), scenarios: [initialCombatLabScenarios()[0]] }; writeCombatLabDocument(workspace, document); assert.equal(loadCombatLabDocument(workspace).document.scenarios.length, 1); fs.writeFileSync(combatLabFile(workspace), '{', 'utf8'); assert.equal(loadCombatLabDocument(workspace).document.scenarios.length, 0); assert.ok(loadCombatLabDocument(workspace).error); } finally { fs.rmSync(workspace, { recursive: true, force: true }); } });
