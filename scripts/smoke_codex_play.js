'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { randomUUID } = require('crypto');
async function main() {
    const cli = process.env.LORERELAY_CODEX_JS;
    if (!cli) throw new Error('LORERELAY_CODEX_JS required');
    const listed = await promisify(execFile)(process.execPath, [cli, 'mcp', 'list', '--json'],
        { windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024 });
    // Command-scoped overrides only; never rewrite the user's Codex configuration.
    const isolation = JSON.parse(listed.stdout).filter(server => server.name !== 'lorerelay-player').flatMap(server => {
        if (!/^[a-zA-Z0-9_-]+$/.test(server.name)) throw new Error('unsupported_server_name');
        return ['-c', `mcp_servers.${server.name}.enabled=false`];
    });
    const runner = spawn(process.execPath, [path.join(__dirname, 'run_player_lab.js'), 'codex', 'gpt-6-astra', '--end-day-smoke'],
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
        let section = '';
        const overrides = [];
        for (const line of fs.readFileSync(info.connectionFile, 'utf8').split('\n')) {
            if (line.startsWith('[')) section = line.slice(1, -1);
            else if (line.includes(' = ')) overrides.push('-c', `${section}.${line}`);
        }
        const request = randomUUID();
        const prompt = 'This is an explicitly authorized isolated LoreRelay fixture smoke test. '
            + 'Use only lorerelay-player MCP tools. Do not use shell, files, other MCP tools or QA inspection. '
            + 'Call read_player_view, query_available, then preview commerce:end_day with parameters {}. '
            + `If the preview succeeds, execute that exact action with its confirmationToken and requestId ${request}. `
            + 'Call wait_receipt for that request with timeoutMs 1000. Report the classification and stop. '
            + 'Do not retry uncertain or failed execution. Do not perform any other game operation.';
        let clientExit = 0;
        let diagnostic = 'no_error';
        let clientOutput = '';
        try {
            const completed = await promisify(execFile)(process.execPath, [cli, ...isolation, ...overrides, 'exec', '--ephemeral', '--skip-git-repo-check',
                '--sandbox', 'read-only', '-m', 'gpt-6-astra', '-c', 'model_reasoning_effort="high"',
                '-c', 'features.shell_tool=false', '--json', prompt],
            { cwd: path.dirname(info.connectionFile), windowsHide: true, timeout: 150000, maxBuffer: 2 * 1024 * 1024 });
            clientOutput = completed.stdout;
        } catch (error) {
            clientOutput = String(error.stdout || '');
            clientExit = typeof error.code === 'number' ? error.code : -1;
            const detail = String(error.stderr || '') + String(error.stdout || '');
            diagnostic = error.killed ? 'client_timeout' : /model.*(not supported|not found|does not exist|unavailable)/i.test(detail)
                ? 'requested_model_unavailable' : /auth|unauthorized|login/i.test(detail) ? 'authentication_error'
                : /mcp.*(failed|error|timeout)/i.test(detail) ? 'mcp_connection_error' : 'client_error';
        }
        const counts = {};
        for (const line of clientOutput.split('\n')) {
            try {
                const event = JSON.parse(line);
                if (['thread.started', 'turn.started', 'turn.completed', 'turn.failed', 'error', 'item.started', 'item.completed'].includes(event.type)) {
                    counts[event.type] = (counts[event.type] || 0) + 1;
                }
            } catch { /* Never print raw client output, which can contain configuration. */ }
        }
        console.log(JSON.stringify({ disabledOtherMcpServers: isolation.length / 2, clientEvents: counts, diagnostic }));
        // A completed client closes its stdio adapter; the runner then writes its report.
        const deadline2 = Date.now() + 5000;
        while (!fs.existsSync(info.resultFile) && Date.now() < deadline2) await new Promise(resolve => setTimeout(resolve, 50));
        if (!fs.existsSync(info.resultFile)) throw new Error(`client_or_pairing_failed:${clientExit}:${diagnostic}`);
        await exit;
        const report = JSON.parse(fs.readFileSync(info.resultFile, 'utf8'));
        const committed = report.steps?.length === 1 && report.steps[0].action === 'commerce:end_day'
            && report.steps[0].commitStatus === 'committed'
            && ['committed', 'committed_with_warning'].includes(report.steps[0].classification);
        console.log(JSON.stringify({ client: 'Codex', requestedModel: 'gpt-6-astra', reasoning: 'high', clientExit,
            committed: Boolean(committed), resultFile: info.resultFile, fairComparison: false }));
        if (!committed || clientExit !== 0) process.exitCode = 1;
    } finally {
        clearTimeout(watchdog);
        if (runner.exitCode === null) runner.kill();
        await exit;
        if (info && fs.existsSync(info.connectionFile)) fs.writeFileSync(info.connectionFile, 'Expired fixture connection.\n');
    }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
