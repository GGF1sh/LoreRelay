'use strict';
// Explicit live-model/real-extension check, separate from deterministic npm test.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
exports.run = async () => {
    const vscode = require('vscode');
    const workspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const file = path.join(workspace, 'game_state.json');
    const read = () => JSON.parse(fs.readFileSync(file));
    const extension = vscode.extensions.getExtension('Miya.lorerelay');
    await extension.activate();
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline && JSON.parse(fs.readFileSync(path.join(workspace, 'lorerelay-start.json'))).status !== 'complete')
        await new Promise(r => setTimeout(r, 100));
    assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, 'lorerelay-start.json'))).status, 'complete');
    const { buildGmPromptContext } = require('../out/gmPromptBuilder');
    const { CodexGmClient } = require('../out/codexGmClient');
    const { buildVscodeLmTurnResult, extractVscodeLmJsonBlock } = require('../out/vscodeLmTurnResultCore');
    const { commitGameState } = require('../out/stateManager');
    const { submitGmTurnCandidate } = require('../out/gameStateSync');
    const { createDeterministicWorkspaceMutationGate } = require('../out/deterministicWorkspaceMutationGate');
    const { NARRATIVE_MEMORY_INSTRUCTION, activeNarrativeRecords } = require('../out/narrativeMemoryCore');
    const { narrativeMemoryView } = require('../out/narrativeMemoryHost');
    const gate = createDeterministicWorkspaceMutationGate();
    const accept = async candidate => {
        const result = await gate.run(workspace, { actionKind: 'live_reunion_smoke', requestId: candidate.turnId },
            () => submitGmTurnCandidate(workspace, candidate, () => true));
        assert.equal(result.status, 'completed'); assert.equal(result.value.kind, 'newlyAccepted', JSON.stringify(result.value));
        assert.equal(result.value.persistence, 'complete');
    };
    const ask = async (action, id) => {
        const previous = read();
        assert.equal(commitGameState({ ...previous, entries: [...previous.entries, { id: 'user-' + id, role: 'user', sender: 'Player', content: action }] }).ok, true);
        const prompt = '日本語のGMとして短く返答する。通常応答と末尾のJSONを返す。JSON形式: {entries:[{content:string}],options:[string],turn_result:{elapsedWorldTurns:0,narrativeMemoryProposals:[]}}。NPC登録は勝手に増やさない。\n'
            + NARRATIVE_MEMORY_INSTRUCTION + '\n' + buildGmPromptContext(action) + '\n[Player action]\n' + action;
        fs.writeFileSync(path.join(workspace, id + '-prompt.txt'), prompt);
        const offline = process.env.LORERELAY_REUNION_OFFLINE === '1';
        const client = !offline && new CodexGmClient({ executable: process.env.LORERELAY_GM_EXECUTABLE || 'codex',
            profileDirectory: process.env.LORERELAY_GM_PROFILE, workingDirectory: process.env.LORERELAY_GM_WORK,
            model: process.env.LORERELAY_GM_MODEL, timeoutMs: 180000 });
        let reply;
        try {
            if (offline) reply = '```json\n' + JSON.stringify({ entries: [{ content: 'ミナは青い風鈴、レンは星の観測、トワは旅の話の約束を覚えている。' }], options: ['話を続ける'],
                turn_result: { elapsedWorldTurns: 0, narrativeMemoryProposals: id === 'turn-1' ? [
                    ['ミナ', '青い風鈴を返す'], ['レン', '一緒に星を観測する'], ['トワ', '旅の話を聞かせる']
                ].map(([personName, content]) => ({ kind: 'promise', personName, content, quote: content, sourceRole: 'user', promisedBy: 'player' })) : [] } }) + '\n```';
            else {
                assert.equal(await client.initialize(), 'ready', 'existing GM login must be ready');
                reply = await client.generate(prompt, () => {});
            }
            fs.writeFileSync(path.join(workspace, id + '-reply.txt'), reply);
            fs.writeFileSync(path.join(workspace, id + '-model.json'), JSON.stringify({ fixture: offline, requested: offline ? null : process.env.LORERELAY_GM_MODEL, reported: client?.reportedModel, version: client?.clientVersion }));
        } finally { if (client) client.dispose(); }
        const json = extractVscodeLmJsonBlock(reply); assert.ok(json, 'model supplied JSON');
        const candidate = buildVscodeLmTurnResult({ prev: read(), llmJson: json, narrative: reply.replace(/```json[\s\S]*?```/g, ''), turnId: id, locale: 'ja', playerAction: action });
        await accept(candidate);
        return { reply, prompt };
    };
    const phase = process.env.LORERELAY_REUNION_PHASE;
    if (phase === 'first') {
        const action = 'カフェでミナと会い「青い風鈴を返す」と約束する。レンにも「一緒に星を観測する」と約束し、トワには「旅の話を聞かせる」と約束する。三人はそれぞれ別の人物です。';
        await ask(action, 'turn-1');
        const records = activeNarrativeRecords(read().narrativeMemory || { records: [] });
        assert.ok(records.some(r => r.kind === 'promise'), 'live proposals adopted through Accepted Turn');
        for (const name of ['ミナ', 'レン', 'トワ']) assert.ok(records.some(r => r.person.name === name), 'live record for ' + name);
        for (let i = 2; i <= 21; i++) await accept({ turnId: 'turn-' + i, narration: '三人と離れ、旅の記録を整理した。' + i, statePatch: [], elapsedWorldTurns: 0 });
        const count = read().narrativeMemory.records.length;
        const stale = await submitGmTurnCandidate(workspace, { turnId: 'turn-cancelled', narration: 'late', statePatch: [], narrativeMemoryProposals: [{}] }, () => false);
        assert.equal(stale.accepted, false); assert.equal(read().narrativeMemory.records.length, count);
        fs.writeFileSync(path.join(workspace, 'reunion-before-restart.json'), JSON.stringify({ records: read().narrativeMemory, world: read().world }));
    } else {
        const before = JSON.parse(fs.readFileSync(path.join(workspace, 'reunion-before-restart.json')));
        assert.deepEqual(read().narrativeMemory, before.records, 'restart preserves records');
        assert.deepEqual(read().world, before.world, 'conversation does not advance world clock');
        const { prompt, reply } = await ask('ミナ、レン、トワと再会し、それぞれに「久しぶり。前に話したことを覚えている？」と尋ねる。', 'turn-22');
        for (const word of ['風鈴', '星', '旅']) assert.ok(prompt.includes(word), 'actual sent prompt retains ' + word);
        fs.writeFileSync(path.join(workspace, 'reunion-result.json'), JSON.stringify({ promptContainsAllThree: true,
            replyReferences: ['風鈴', '星', '旅'].filter(w => reply.includes(w)), records: read().narrativeMemory.records.length,
            resume: narrativeMemoryView(workspace).resume, actualGm: process.env.LORERELAY_REUNION_OFFLINE !== '1', humanPlayTested: false }, null, 2));
    }
    gate.dispose();
};
async function main() {
    const { runTests } = require('@vscode/test-electron'), { spawnSync } = require('child_process'), os = require('os');
    for (const name of ['LORERELAY_GM_PROFILE', 'LORERELAY_GM_WORK', 'LORERELAY_GM_MODEL']) assert.ok(process.env[name], name + ' is required');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-reunion-live-'));
    const result = spawnSync('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'start_browser_adventure.ps1'),
        '-InputFile', path.join(root, 'resources/browser-start/reunion-three-people.json'), '-NoLaunch', '-SaveRoot', path.join(temp, 'adventures')], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr); const workspace = result.stdout.trim();
    console.log('Live reunion workspace: ' + workspace);
    for (const phase of ['first', 'reopen']) {
        // Existing writer leases retain a 30-second recovery window after abrupt
        // extension-test shutdown. Do not remove/bypass that persisted authority.
        if (phase === 'reopen') { console.log('Waiting for the existing writer lease recovery window.'); await new Promise(r => setTimeout(r, 35000)); }
        await runTests({ vscodeExecutablePath: process.env.LORERELAY_QA_VSCODE,
        extensionDevelopmentPath: root, extensionTestsPath: __filename,
        launchArgs: ['"' + workspace + '"', '--user-data-dir=' + path.join(temp, 'profile'), '--extensions-dir=' + path.join(temp, 'extensions'),
            '--disable-extensions', '--disable-extension', 'vscode.git', '--disable-extension', 'vscode.git-base', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--disable-gpu'],
        extensionTestsEnv: { LORERELAY_REUNION_PHASE: phase } });
    }
    console.log('PASS ' + (process.env.LORERELAY_REUNION_OFFLINE === '1' ? 'scripted Accepted Turn fixture' : 'actual GM') + ' reunion after restart and 20 accepted intervening turns: ' + workspace);
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
