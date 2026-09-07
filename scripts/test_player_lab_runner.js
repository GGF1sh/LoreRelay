'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { randomUUID } = require('crypto');
const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');
async function main() {
    const child = spawn(process.execPath, [path.join(__dirname, 'run_player_lab.js'), 'gemini', 'sdk-fixture-test'],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume();
    const exit = new Promise(resolve => child.on('exit', resolve));
    const timer = setTimeout(() => child.kill(), 30000);
    const client = new Client({ name: 'lab-runner-sdk-test', version: '1.0.0' });
    try {
        const deadline = Date.now() + 10000;
        while (!output.includes('\n')) {
            if (Date.now() > deadline || child.exitCode !== null) throw new Error('runner_start_failed');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        const info = JSON.parse(output.split('\n')[0]);
        const config = JSON.parse(fs.readFileSync(info.connectionFile, 'utf8')).mcpServers['lorerelay-player'];
        await client.connect(new StdioClientTransport({ ...config, command: process.execPath, stderr: 'pipe' }));
        const call = async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
        await call('read_player_view');
        await call('query_available');
        const input = { actionId: 'commerce:end_day', parameters: {} };
        const preview = await call('preview', input);
        assert.equal(preview.ok, true);
        const receipt = await call('execute', { ...input, requestId: randomUUID(), confirmationToken: preview.confirmationToken });
        assert.equal(receipt.commitStatus, 'committed');
        await client.close();
        assert.equal(await exit, 0);
        const report = JSON.parse(fs.readFileSync(info.resultFile, 'utf8'));
        assert.equal(report.steps.length, 1);
        assert.equal(report.steps[0].action, 'commerce:end_day');
        assert.equal(report.steps[0].commitStatus, 'committed');
        assert.equal(report.complete, false);
        assert.match(report.conditions.taskDigest, /^[a-f0-9]{64}$/);
        assert(info.task.includes('public information'));
        assert(!fs.readFileSync(info.connectionFile, 'utf8').includes(config.env.LORERELAY_AGENT_SECRET));
        assert(!JSON.stringify(report).includes('confirmationToken'));
        const comparison = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'compare_player_lab.js'), info.resultFile], { encoding: 'utf8' }));
        assert.equal(comparison.comparable, false, 'SDK smoke is not an audited model comparison');
        assert.equal(comparison.runs[0].committed, 1);
        console.log('Player Lab runner: fixture read/preview/execute, disconnect report and expired credential cleanup passed. No model comparison claimed.');
    } finally { clearTimeout(timer); await client.close(); if (child.exitCode === null) child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
