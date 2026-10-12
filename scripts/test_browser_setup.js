'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseBrowserSetup } = require('../out/browserSetupCore');
const { normalizeGameRules } = require('../out/gameRulesCore');
const dir = path.resolve(__dirname, '../resources/browser-start');
const schema = JSON.parse(fs.readFileSync(path.join(dir, 'settings.schema.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(dir, 'example.json'), 'utf8'));
const parse = value => parseBrowserSetup(JSON.stringify(value), schema);
const change = mutate => { const copy = structuredClone(example); mutate(copy); return copy; };
assert.equal(parse(example).scenario.setup.playerCharacter.name, 'アオ');
assert.deepEqual(parse(example).gameRules, normalizeGameRules(example.gameRules));
assert.equal(parse(example).lorebook.entries[0].content, example.scenario.setup.tone);
assert.equal(parse(example).lorebook.entries[1].content, example.scenario.setup.world);
assert.ok(parse(example).lorebook.entries.every(entry => entry.pinned && entry.enabled));
assert.ok(parse(change(p => p.scenario.setup.rules = '判定は穏やかに')).lorebook.entries[0].content.includes('判定は穏やかに'));
assert.deepEqual(parseBrowserSetup('\uFEFF```json\n' + JSON.stringify(example) + '\n```', schema), parse(example));
assert.throws(() => parseBrowserSetup('Explanation\n' + JSON.stringify(example), schema), /without surrounding/);
assert.throws(() => parseBrowserSetup('x'.repeat(262145), schema), /maximum size/);
assert.throws(() => parse(change(p => p.format = 'lorerelay-browser-start/2')), /package.format/);
assert.throws(() => parse(change(p => p.settings['textAdventure.gmBridge.endpoint'] = 'https://example.invalid')), /unsupported key/);
assert.throws(() => parse(change(p => p.settings['textAdventure.tts.local.command'] = 'echo unsafe')), /unsupported key/);
assert.throws(() => parse(change(p => p.settings['textAdventure.bgm.volume'] = 101)), /range/);
assert.throws(() => parse(change(p => p.gameRules.defaultMaxHp = 0)), /gameRules.defaultMaxHp/);
assert.throws(() => parse(change(p => p.gameRules.defaultMaxHp = 2.5)), /expected integer/);
assert.throws(() => parse(change(p => p.gameRules.diceDifficulty = 'Extreme')), /choose/);
assert.throws(() => parse(change(p => p.gameRules.enableGuildRequests = true)), /conflicting dependent/);
assert.throws(() => parse(change(p => p.gameRules.enableRpgMechanics = 'false')), /expected boolean/);
assert.throws(() => parse(change(p => delete p.scenario.setup.playerCharacter)), /missing playerCharacter/);
assert.throws(() => parse(change(p => p.scenario.opening.options = [])), /invalid array length/);
assert.throws(() => parse(change(p => p.scenario.opening.status.location = ' ')), /invalid text length/);
assert.throws(() => parse(change(p => p.scenario.setup.playerCharacter.command = 'run')), /unsupported key/);
assert.throws(() => parseBrowserSetup(JSON.stringify(example).replace('"settings":{', '"settings":{"__proto__":{},'), schema), /unsupported key/);
for (const [key, def] of Object.entries(schema.properties.gameRules.properties)) {
    const base = structuredClone(example);
    base.gameRules = { [key]: def.default };
    parse(base);
    if (def.type === 'integer') {
        for (const value of [def.minimum, def.maximum]) {
            base.gameRules = { [key]: value };
            assert.equal(parse(base).gameRules[key], value);
        }
    }
}
for (const preset of Object.values(JSON.parse(fs.readFileSync(path.join(dir, 'settings.presets.json'), 'utf8')))) {
    parse({ ...example, gameRules: preset.gameRules, settings: preset.settings });
}
const check = spawnSync(process.execPath, [path.join(__dirname, 'generate_browser_start_kit.js'), '--check'], { encoding: 'utf8' });
assert.equal(check.status, 0, check.stderr);
if (process.platform === 'win32') {
    const launcher = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'test_browser_launcher.ps1')], { encoding: 'utf8', windowsHide: true });
    assert.equal(launcher.status, 0, launcher.stdout + launcher.stderr);
    console.log(launcher.stdout.trim());
}
console.log('PASS browser setup: complete input, fences/BOM, strict keys/types/ranges, dependencies, presets and dictionary consistency');
