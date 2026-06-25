#!/usr/bin/env node
/**
 * Lightweight validation for CI-less projects.
 * - package.json version matches semver
 * - game_state_schema.json parses
 * - GameState.ts exists
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}

function ok(msg) {
  console.log(`OK: ${msg}`);
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  fail(`package.json version invalid: ${pkg.version}`);
} else {
  ok(`package.json version ${pkg.version}`);
}

const schemaPath = path.join(root, 'game_state_schema.json');
try {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  if (!schema.properties?.entries) {
    fail('game_state_schema.json missing entries');
  } else {
    ok('game_state_schema.json');
  }
  const entryIdPattern = schema.properties?.entries?.items?.properties?.id?.pattern;
  if (entryIdPattern !== '^[a-zA-Z0-9_-]{1,64}$') {
    fail('game_state_schema.json entries[].id pattern mismatch');
  } else {
    ok('game_state_schema.json entries[].id pattern');
  }
  const profileIdPattern = schema.properties?.profileUpdates?.items?.properties?.characterId?.pattern;
  if (profileIdPattern !== '^[a-zA-Z0-9_-]{1,64}$') {
    fail('game_state_schema.json profileUpdates[].characterId pattern mismatch');
  } else {
    ok('game_state_schema.json profileUpdates[].characterId pattern');
  }
  const hiddenDiceResultBan = schema.properties?.hiddenDice?.items?.not?.required?.includes('result');
  if (!hiddenDiceResultBan) {
    fail('game_state_schema.json hiddenDice[].result is not explicitly banned');
  } else {
    ok('game_state_schema.json hiddenDice[].result ban');
  }
} catch (e) {
  fail(`game_state_schema.json: ${e.message}`);
}

const typesPath = path.join(root, 'src', 'types', 'GameState.ts');
if (!fs.existsSync(typesPath)) {
  fail('src/types/GameState.ts missing');
} else {
  ok('GameState.ts');
}

const i18nPath = path.join(root, 'src', 'i18n.ts');
if (!fs.existsSync(i18nPath)) {
  fail('src/i18n.ts missing');
} else {
  ok('i18n.ts');
}

const localeDir = path.join(root, 'locales');
const localeFiles = ['ja.json', 'en.json', 'zh-CN.json', 'zh-TW.json'];
let baseKeys = null;
for (const file of localeFiles) {
  const p = path.join(localeDir, file);
  if (!fs.existsSync(p)) {
    fail(`locales/${file} missing`);
    continue;
  }
  try {
    const keys = Object.keys(JSON.parse(fs.readFileSync(p, 'utf-8'))).sort();
    if (!baseKeys) {
      baseKeys = keys;
      ok(`locales/${file} (${keys.length} keys)`);
    } else if (keys.length !== baseKeys.length || keys.some((k, i) => k !== baseKeys[i])) {
      fail(`locales/${file} keys mismatch vs en/ja baseline`);
    } else {
      ok(`locales/${file}`);
    }
  } catch (e) {
    fail(`locales/${file}: ${e.message}`);
  }
}

/** archivePrompt.ts の computeArchiveMilestone と同期 */
function computeArchiveMilestone(historyCount, threshold, remindStep) {
  if (historyCount < threshold) return undefined;
  const over = historyCount - threshold;
  const steps = Math.floor(over / remindStep);
  return threshold + steps * remindStep;
}

const milestoneCases = [
  [29, 30, 15, undefined],
  [30, 30, 15, 30],
  [44, 30, 15, 30],
  [45, 30, 15, 45],
  [79, 80, 15, undefined],
  [80, 80, 15, 80],
  [94, 80, 15, 80],
  [95, 80, 15, 95],
];
for (const [count, threshold, step, expected] of milestoneCases) {
  const got = computeArchiveMilestone(count, threshold, step);
  if (got !== expected) {
    fail(`archive milestone(${count}, ${threshold}, ${step}) = ${got}, expected ${expected}`);
  } else {
    ok(`archive milestone(${count}, ${threshold}, ${step})`);
  }
}

const validateGameStatePath = path.join(root, 'out', 'validateGameState.js');
if (!fs.existsSync(validateGameStatePath)) {
  fail('out/validateGameState.js missing — run npm run compile first');
} else {
  const { validateGameState } = require(validateGameStatePath);
  const fixtureDir = path.join(root, 'test', 'fixtures');
  const validFixture = path.join(fixtureDir, 'game_state_valid.json');
  try {
    const valid = JSON.parse(fs.readFileSync(validFixture, 'utf-8'));
    const validErrs = validateGameState(valid);
    if (validErrs.length > 0) {
      fail(`game_state_valid.json: ${validErrs.join('; ')}`);
    } else {
      ok('game_state_valid.json passes validateGameState');
    }
    for (const name of [
      'game_state_invalid_entries.json',
      'game_state_invalid_dice.json',
      'game_state_invalid_metadata.json'
    ]) {
      const bad = JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf-8'));
      const badErrs = validateGameState(bad);
      if (badErrs.length === 0) {
        fail(`${name} should fail validateGameState`);
      } else {
        ok(`${name} rejects invalid state (${badErrs.length} errors)`);
      }
    }
  } catch (e) {
    fail(`validateGameState fixtures: ${e.message}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log('\nAll validations passed.');
