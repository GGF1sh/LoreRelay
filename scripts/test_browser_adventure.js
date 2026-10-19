'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-browser-host-'));
const example = fs.readFileSync(path.resolve(__dirname, '../resources/browser-start/example.json'), 'utf8');
const errors = [], updates = [], commands = [];
let root, loadCount = 0, failLoad = false, gate;
const context = { extensionPath: path.resolve(__dirname, '..') };
const vscode = {
    workspace: {
        isTrusted: true, workspaceFolders: [{ uri: {} }],
        getConfiguration: () => ({ update: async (...args) => updates.push(args) }),
    },
    ConfigurationTarget: { Workspace: 2 },
    commands: { executeCommand: async name => commands.push(name) },
    window: { showErrorMessage: msg => errors.push(msg) },
};
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
    if (name === 'vscode') return vscode;
    if (parent?.filename.endsWith('browserAdventure.js')) {
        if (name === './workspacePaths') return {
            getWorkspacePath: () => root,
            writeJsonAtomic: (file, value) => fs.writeFileSync(file, JSON.stringify(value)),
        };
        if (name === './gameRules') return { clearGameRulesCache() {} };
        if (name === './scenarioPack') return { loadScenarioPackFromDir: async source => {
            loadCount++;
            assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'game_rules.json'))).enableRpgMechanics, false);
            if (gate) await gate;
            if (failLoad) return false;
            fs.writeFileSync(path.join(root, 'game_state.json'), JSON.stringify({ progress: 1 }));
            assert.equal(JSON.parse(fs.readFileSync(path.join(source, 'scenario.json'))).setup.playerCharacter.name, 'アオ');
            return true;
        } };
    }
    return realLoad.call(this, name, parent, isMain);
};
const { initializeBrowserAdventure } = require('../out/browserAdventure');
Module._load = realLoad;
function workspace(name, input = example, status = 'pending') {
    root = path.join(temp, name);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'browser-setup.json'), input);
    fs.writeFileSync(path.join(root, 'lorerelay-start.json'), JSON.stringify({ format: 'lorerelay-launch/1', status }));
}
const marker = () => JSON.parse(fs.readFileSync(path.join(root, 'lorerelay-start.json'))).status;
async function run() {
    workspace('信頼 前');
    vscode.workspace.isTrusted = false;
    await initializeBrowserAdventure(context);
    assert.equal(updates.length, 0); assert.equal(loadCount, 0); assert.equal(marker(), 'pending');
    vscode.workspace.isTrusted = true;
    await initializeBrowserAdventure(context);
    assert.equal(marker(), 'complete'); assert.equal(loadCount, 1);
    const lorebook = JSON.parse(fs.readFileSync(path.join(root, 'lorebook.json')));
    assert.equal(lorebook.entries[0].content, JSON.parse(example).scenario.setup.tone);
    assert.ok(lorebook.entries.every(entry => entry.enabled && entry.pinned));
    assert.ok(updates.every(args => args[2] === 2));
    assert.ok(!updates.some(([key]) => /endpoint|apiKey|gmBridge|command/.test(key)));
    assert.ok(updates.some(([key, value]) => key === 'textAdventure.mediaAgent.enabled' && value === false));
    fs.writeFileSync(path.join(root, 'game_state.json'), '{"progress":42}');
    fs.writeFileSync(path.join(root, 'browser-setup.json'), 'broken after import');
    const updateCount = updates.length;
    await initializeBrowserAdventure(context);
    assert.equal(loadCount, 1); assert.equal(updates.length, updateCount);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'game_state.json'))).progress, 42);
    assert.equal(commands.at(-1), 'textadventure.openGame');
    workspace('existing'); fs.writeFileSync(path.join(root, 'game_state.json'), '{"keep":true}');
    await initializeBrowserAdventure(context);
    assert.equal(loadCount, 1); assert.equal(marker(), 'pending');
    assert.equal(fs.readFileSync(path.join(root, 'game_state.json'), 'utf8'), '{"keep":true}');
    workspace('invalid', '{"format":"unsupported"}');
    await initializeBrowserAdventure(context);
    assert.equal(marker(), 'pending'); assert.equal(updates.length, updateCount);
    assert.deepEqual(fs.readdirSync(root).sort(), ['browser-setup.json', 'lorerelay-start.json']);
    workspace('interrupted', example, 'initializing');
    await initializeBrowserAdventure(context); assert.equal(loadCount, 1);
    workspace('loader-failure'); failLoad = true;
    await initializeBrowserAdventure(context);
    assert.equal(marker(), 'failed');
    await initializeBrowserAdventure(context); assert.equal(loadCount, 2);
    workspace('concurrent'); failLoad = false;
    let release; gate = new Promise(resolve => release = resolve);
    const first = initializeBrowserAdventure(context);
    await new Promise(resolve => setImmediate(resolve));
    await initializeBrowserAdventure(context);
    release(); await first; gate = undefined;
    assert.equal(loadCount, 3); assert.equal(marker(), 'complete');
    workspace('claimed'); fs.writeFileSync(path.join(root, '.lorerelay-import.lock'), '');
    await initializeBrowserAdventure(context); assert.equal(loadCount, 3);
    workspace('multi-root'); vscode.workspace.workspaceFolders.push({ uri: {} });
    await initializeBrowserAdventure(context); assert.equal(loadCount, 3);
    assert.ok(errors.some(msg => msg.includes('Existing adventure data')));
    assert.ok(errors.some(msg => msg.includes('Previous import')));
    console.log(`PASS browser host: trust, workspace-only settings, complete/reopen, untouched saves, invalid input, interruption, loader failure and concurrent claim (${temp})`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
