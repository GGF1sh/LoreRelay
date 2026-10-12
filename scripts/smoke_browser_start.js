'use strict';
// Explicit real VS Code smoke; not run by the ordinary unit/full suite.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');

exports.run = async function() {
    const vscode = require('vscode');
    const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const read = name => JSON.parse(fs.readFileSync(path.join(workspace, name), 'utf8'));
    const extension = vscode.extensions.getExtension('Miya.lorerelay');
    assert.ok(extension, 'development extension is present');
    // Do not activate explicitly: the launch marker must trigger activation itself.
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && read('lorerelay-start.json').status !== 'complete') {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(read('lorerelay-start.json').status, 'complete');
    assert.equal(extension.isActive, true);
    const panelOpen = () => vscode.window.tabGroups.all.flatMap(g => g.tabs).some(tab => /LoreRelay|Text Adventure|テキスト/.test(tab.label));
    while (Date.now() < deadline && !panelOpen()) await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(panelOpen(), 'game panel is open: ' + vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label).join(', '));
    const config = vscode.workspace.getConfiguration('textAdventure');
    assert.equal(config.get('promptBudget.mode'), 'compact');
    assert.equal(config.get('mediaAgent.enabled'), false);
    assert.equal(config.get('bgm.volume'), 17, 'omitted setting uses existing PC preference');
    assert.equal(config.inspect('bgm.volume').globalValue, 17, 'global preference unchanged');
    assert.equal(read('game_rules.json').enableRpgMechanics, false);
    const lorebook = read('lorebook.json');
    assert.ok(lorebook.entries.some(entry => entry.pinned && entry.content.includes('返答は短め')));
    assert.ok(lorebook.entries.some(entry => entry.pinned && entry.content.includes('港町')));
    const { buildGmPromptContext } = require(path.join(root, 'out', 'gmPromptBuilder'));
    const gmContext = buildGmPromptContext('カフェで話を聞く');
    assert.ok(gmContext.includes('返答は短め'), 'play style reaches the real GM context');
    assert.ok(gmContext.includes('港町'), 'world setting reaches the real GM context');
    assert.ok(fs.readdirSync(path.join(workspace, 'characters')).filter(n => n.endsWith('.json')).some(n => {
        const value = read('characters/' + n);
        return value.name === 'アオ' && value.controlledBy === 'player';
    }), 'starter protagonist registered');
    const state = read('game_state.json');
    if (process.env.LORERELAY_BROWSER_SMOKE_PHASE === 'first') {
        assert.ok(state.entries.some(entry => entry.content.includes('朝霧')));
        state.summary = 'browser-start-smoke-progress';
        fs.writeFileSync(path.join(workspace, 'game_state.json'), JSON.stringify(state));
        fs.writeFileSync(path.join(workspace, 'browser-setup.json'), 'invalid after successful import');
    } else {
        assert.equal(state.summary, 'browser-start-smoke-progress', 'reopening does not reset progress or reparse input');
    }
    fs.writeFileSync(path.join(workspace, 'smoke-' + process.env.LORERELAY_BROWSER_SMOKE_PHASE + '.json'), JSON.stringify({ passed: true, active: extension.isActive, tabs: vscode.window.tabGroups.all.flatMap(g => g.tabs).map(t => t.label) }));
};

async function main() {
    const { runTests } = require('@vscode/test-electron');
    const { spawnSync } = require('child_process');
    const os = require('os');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-browser-live-'));
    const saved = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'start_browser_adventure.ps1'), '-InputFile', path.join(root, 'resources/browser-start/example.json'), '-NoLaunch', '-SaveRoot', path.join(temporary, '冒険 フォルダ')], { encoding: 'utf8', windowsHide: true });
    assert.equal(saved.status, 0, saved.stderr);
    const workspace = saved.stdout.trim();
    assert.equal(fs.statSync(workspace).isDirectory(), true, 'launcher returned the Unicode workspace path');
    const profile = path.join(temporary, 'profile');
    fs.mkdirSync(path.join(profile, 'User'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({ 'textAdventure.bgm.volume': 17, 'extensions.autoUpdate': false, 'update.mode': 'none' }));
    const executable = process.env.LORERELAY_QA_VSCODE || path.join(process.env.LOCALAPPDATA, 'Programs/Microsoft VS Code/Code.exe');
    for (const phase of ['first', 'reopen']) {
        await runTests({
            vscodeExecutablePath: executable,
            extensionDevelopmentPath: root, extensionTestsPath: __filename,
            // The test SDK uses cmd.exe on Windows, so its workspace argument needs quotes.
            launchArgs: ['"' + workspace + '"', '--user-data-dir=' + profile, '--extensions-dir=' + path.join(temporary, 'extensions'), '--disable-extensions', '--disable-extension', 'vscode.git', '--disable-extension', 'vscode.git-base', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust', '--disable-gpu'],
            extensionTestsEnv: { LORERELAY_BROWSER_SMOKE_PHASE: phase },
        });
        assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'smoke-' + phase + '.json'), 'utf8')).passed, true);
    }
    console.log('PASS real VS Code browser start and reopen: ' + workspace);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
