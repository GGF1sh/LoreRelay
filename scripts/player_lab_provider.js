'use strict';
// Transport reuse only. Fixed role entrypoints own separate profiles and fresh processes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { CodexGmClient } = require('../out/codexGmClient');
const { ClaudeGmClient } = require('../out/claudeGmClient');
const { AntigravityGmClient } = require('../out/antigravityGmClient');
const { GrokGmClient } = require('../out/grokGmClient');
const { DeepSeekGmClient } = require('../out/deepSeekGmClient');
const ROOT = path.resolve(__dirname, '..');
const providers = { codex: [CodexGmClient, 'codex'], claude: [ClaudeGmClient, 'claude'],
    google: [AntigravityGmClient, 'agy'], grok: [GrokGmClient, 'grok'], deepseek: [DeepSeekGmClient, process.platform === 'win32' ? 'python' : 'python3'] };
function create(role, options) {
    if (!Object.hasOwn(providers, options.provider) || !/^[A-Za-z0-9_.-]{1,100}$/.test(options.model || '')) throw new Error('invalid_lab_provider');
    if (options.consent !== true) throw new Error('fixture_context_consent_required');
    const maxTokens = options.maxTokens ?? 4096;
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768) throw new Error('invalid_lab_token_budget');
    const [Client, executable] = providers[options.provider];
    const profileDirectory = path.join(ROOT, '.test-runs', 'ai-lab-profiles', role, options.provider);
    // Do not inherit this repository's AGENTS.md or any campaign's instruction files.
    const workRoot = path.join(os.tmpdir(), `lorerelay-lab-model-${role}-${randomUUID()}`);
    fs.mkdirSync(profileDirectory, { recursive: true });
    fs.mkdirSync(workRoot, { recursive: true });
    let active, stopped = false, pending = false;
    const calls = [];
    const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_.:+/-]{1,128}$/.test(value) ? value : null;
    return {
        profileDirectory,
        async ask(prompt) {
            if (stopped || pending || calls.length >= 200) throw new Error('lab_model_stopped_or_busy');
            pending = true;
            const evidence = { requestedModel: options.model, reportedModel: null, clientVersion: null,
                modelRequestStarted: false, responseReceived: false };
            calls.push(evidence);
            try {
                const workingDirectory = path.join(workRoot, String(calls.length));
                fs.mkdirSync(workingDirectory);
                active = new Client({ executable: options.executable || executable, profileDirectory, workingDirectory,
                    model: options.model, maxTokens, getApiKey: options.getApiKey || (async () => ''),
                    script: path.join(ROOT, 'antigravity-skill', 'text-adventure-gm', 'scripts', 'deepseek_gm.py') });
                if (await active.initialize() !== 'ready') throw new Error('lab_login_required');
                if (stopped) throw new Error('lab_model_cancelled');
                evidence.modelRequestStarted = true;
                const text = await active.generate(prompt, () => {});
                if (stopped) throw new Error('lab_model_cancelled');
                evidence.responseReceived = true;
                return text;
            } finally {
                evidence.reportedModel = identifier(active?.reportedModel);
                evidence.clientVersion = identifier(active?.clientVersion);
                active?.dispose(); active = undefined; pending = false;
            }
        },
        evidence() { return { provider: options.provider, role, calls: structuredClone(calls),
            billing: options.provider === 'deepseek' ? 'metered_api' : 'subscription',
            maxOutputTokens: options.provider === 'deepseek' ? maxTokens : null,
            sessionPolicy: 'fresh_process_per_request_separate_role_profile' }; },
        dispose() { stopped = true; active?.dispose(); },
    };
}
exports.createPlayerLabModel = options => create('player', options);
exports.createQaLabModel = options => create('qa', options);
