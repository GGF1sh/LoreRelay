#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { makePlan, defaultConcurrency, ROOT } = require('./lib/planner');
const { collectPreflight } = require('./lib/preflight');
const { ExecutionEngine } = require('./lib/engine');
const { listen } = require('./lib/server');

function parse(argv) {
    const values = { _: [] };
    for (let index = 0; index < argv.length; index++) {
        const token = argv[index];
        if (!token.startsWith('--')) { values._.push(token); continue; }
        const key = token.slice(2);
        const next = argv[index + 1];
        if (next && !next.startsWith('--')) { values[key] = next; index++; }
        else values[key] = true;
    }
    return values;
}

function planPath(plan) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return path.join(plan.repositoryRoot, '.test-runs', 'plans', `${stamp}-${plan.headSha.slice(0, 8)}-${plan.mode}.json`);
}

async function main() {
    const args = parse(process.argv.slice(2));
    const command = args._[0] || 'serve';
    if (command === 'serve') {
        const app = await listen({ root: ROOT, port: args.port, open: Boolean(args.open) });
        console.log(`LoreRelay Test Console: ${app.url}`);
        console.log('Press Ctrl+C to stop the local dashboard.');
        return;
    }
    if (command === 'plan') {
        const plan = makePlan({ root: ROOT, base: args.base || 'origin/main', head: args.head || 'HEAD', mode: args.mode || 'verify' });
        const output = args.output ? path.resolve(args.output) : planPath(plan);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
        console.log(output);
        if (!plan.complete) console.warn(`WARNING: plan is incomplete; unknown files force a full suite: ${plan.unknownFiles.join(', ')}`);
        return;
    }
    if (command === 'run') {
        if (!args.plan) throw new Error('run requires --plan <plan.json>');
        const plan = JSON.parse(fs.readFileSync(path.resolve(args.plan), 'utf8'));
        const preflight = collectPreflight(plan);
        const engine = new ExecutionEngine(plan, preflight, {
            concurrency: args.concurrency || defaultConcurrency(),
            allowRepeatFullSuite: Boolean(args['allow-repeat-full-suite']),
            repeatReason: args.reason,
            onEvent(event) {
                if (event.type === 'command-start') console.log(`START ${event.command.id}`);
                if (event.type === 'output') process[event.stream].write(event.text);
                if (event.type === 'command-end') console.log(`END ${event.result.id}: ${event.result.status} (${event.result.durationMs}ms)`);
                if (event.type === 'command-reused') console.log(`REUSE ${event.command.id}: PASS`);
            },
        });
        process.once('SIGINT', () => engine.cancel());
        const result = await engine.run();
        console.log(`\n${result.summary}`);
        if (result.cancelled || result.commands.some((item) => ['FAIL', 'TIMEOUT'].includes(item.status))) process.exitCode = 1;
        return;
    }
    throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
