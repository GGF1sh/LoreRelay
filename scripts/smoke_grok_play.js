'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-grok-play-'));
    fs.mkdirSync(path.join(root, '.grok'));
    const configFile = path.join(root, '.grok', 'config.toml');
    const runner = spawn(process.execPath, [path.join(__dirname, 'run_player_lab.js'), 'grok', 'grok-4.6', '--end-day-smoke'],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    runner.stdout.on('data', chunk => { output += chunk; });
    runner.stderr.resume();
    const exit = new Promise(resolve => runner.on('exit', resolve));
    const watchdog = setTimeout(() => runner.kill(), 180000);
    let info;
    try {
        const deadline = Date.now() + 10000;
        while (!output.includes('\n')) {
            if (Date.now() > deadline || runner.exitCode !== null) throw new Error('runner_start_failed');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        info = JSON.parse(output.split('\n')[0]);
        const userConfig = path.join(os.homedir(), '.grok', 'config.toml');
        const names = fs.existsSync(userConfig) ? [...fs.readFileSync(userConfig, 'utf8').replace(/\r\n/g, '\n')
            .matchAll(/^\[mcp_servers\.([a-zA-Z0-9_-]+)\]$/gm)].map(match => match[1]) : [];
        const disabled = names.filter(name => name !== 'lorerelay-player').map(name => `\n[mcp_servers.${name}]\nenabled = false\n`).join('');
        fs.writeFileSync(configFile, fs.readFileSync(info.connectionFile, 'utf8') + disabled
            + '\n[compat.claude]\nmcps = false\n[compat.cursor]\nmcps = false\n', { mode: 0o600 });
        const requestId = randomUUID();
        const prompt = 'This is an authorized isolated LoreRelay fixture smoke. Use only lorerelay-player MCP tools, no files, shell, web, QA or other servers. '
            + 'Read read_player_view and query_available. Preview commerce:end_day with parameters {}. '
            + `If successful, execute that exact action once with requestId ${requestId} and the returned confirmationToken. `
            + 'Call wait_receipt with the same requestId and timeoutMs 1000, report its classification and stop. Never retry failure or uncertainty.';
        let clientExit = 0, diagnostic = 'no_error';
        try {
            await promisify(execFile)(process.env.LORERELAY_GROK_EXECUTABLE || 'grok',
                ['--cwd', root, '--trust', '--no-subagents', '--disable-web-search', '--tools', '',
                    '--allow', 'MCPTool(lorerelay-player__*)', '--max-turns', '10', '--model', 'grok-4.6',
                    '--output-format', 'json', '--single', prompt],
                { cwd: root, windowsHide: true, timeout: 150000, maxBuffer: 2 * 1024 * 1024 });
        } catch (error) {
            clientExit = typeof error.code === 'number' ? error.code : -1;
            const detail = String(error.stderr || '') + String(error.stdout || '');
            diagnostic = error.killed ? 'client_timeout' : /auth|unauthorized|login/i.test(detail) ? 'authentication_error'
                : /permission|approval/i.test(detail) ? 'permission_required' : 'client_error';
        }
        const deadline2 = Date.now() + 5000;
        while (!fs.existsSync(info.resultFile) && Date.now() < deadline2) await new Promise(resolve => setTimeout(resolve, 50));
        if (!fs.existsSync(info.resultFile)) throw new Error(`client_or_pairing_failed:${clientExit}:${diagnostic}`);
        await exit;
        const report = JSON.parse(fs.readFileSync(info.resultFile, 'utf8'));
        const committed = report.steps?.length === 1 && report.steps[0].action === 'commerce:end_day'
            && report.steps[0].commitStatus === 'committed'
            && ['committed', 'committed_with_warning'].includes(report.steps[0].classification);
        console.log(JSON.stringify({ client: 'Grok Build', requestedModel: 'grok-4.6', clientExit, diagnostic,
            committed: Boolean(committed), resultFile: info.resultFile, fairComparison: false }));
        if (!committed || clientExit !== 0) process.exitCode = 1;
    } finally {
        clearTimeout(watchdog);
        if (runner.exitCode === null) runner.kill();
        await exit;
        if (fs.existsSync(configFile)) fs.writeFileSync(configFile, '# Expired fixture connection.\n');
        if (info && fs.existsSync(info.connectionFile)) fs.writeFileSync(info.connectionFile, 'Expired fixture connection.\n');
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
