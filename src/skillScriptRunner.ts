import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { getConfiguredLocale } from './i18n';
import { t } from './i18n';
import { getWorkspacePath } from './workspacePaths';
import { getGmBridgeOutputChannel } from './gmBridgeRunner';

let activeScriptProcess: ChildProcess | undefined;

export function resolveGmBridgeScript(scriptName: string): string | undefined {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const configured = config.get<string>('gmBridge.scriptPath', '').trim();
    if (configured) {
        const dir = path.dirname(configured);
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const skillScript = config.get<string>('skillPath', '').trim();
    if (skillScript) {
        const dir = path.dirname(skillScript);
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const wsPath = getWorkspacePath() || process.cwd();
    const possibleDirs = [
        path.join('C:', 'AI', 'TextAdventureGMSkill', 'scripts'),
        path.join(wsPath, '.agents', 'skills', 'text-adventure-gm', 'scripts'),
        path.join(wsPath, '.grok', 'skills', 'text-adventure-gm', 'scripts')
    ];
    for (const dir of possibleDirs) {
        const candidate = path.join(dir, scriptName);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

export function resolvePythonCommand(): string {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return config.get<string>('gmBridge.python', 'python').trim() || 'python';
}

/** textAdventure.memory.backend — tfidf | chromadb | auto */
export function getMemoryBackendSetting(): string {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const v = config.get<string>('memory.backend', 'auto').trim().toLowerCase();
    if (v === 'tfidf' || v === 'chromadb' || v === 'auto') {
        return v;
    }
    return 'auto';
}

export function buildLocalGmEnv(provider: 'ollama' | 'koboldcpp' | 'openrouter'): NodeJS.ProcessEnv {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const env: NodeJS.ProcessEnv = { ...process.env };
    const python = resolvePythonCommand();
    if (python) {
        env.TA_GM_PYTHON = python;
    }
    env.TA_LOCALE = getConfiguredLocale();
    env.TA_MEMORY_BACKEND = getMemoryBackendSetting();

    if (provider === 'ollama') {
        const url = config.get<string>('gmBridge.ollama.url', '').trim();
        const model = config.get<string>('gmBridge.ollama.model', '').trim();
        if (url) { env.OLLAMA_URL = url; }
        if (model) { env.OLLAMA_MODEL = model; }
    } else if (provider === 'koboldcpp') {
        const url = config.get<string>('gmBridge.koboldcpp.url', '').trim();
        if (url) { env.KOBOLDCPP_URL = url; }
    } else if (provider === 'openrouter') {
        const model = config.get<string>('gmBridge.openRouter.model', '').trim();
        if (model) { env.OPENROUTER_MODEL = model; }
    }
    return env;
}

export async function runSkillScript(
    scriptName: string,
    args: string[],
    resolveOpenRouterKey?: () => Promise<string>
): Promise<number> {
    if (!vscode.workspace.isTrusted) {
        vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
        return 1;
    }

    const wsPath = getWorkspacePath() || process.cwd();
    const scriptPath = resolveGmBridgeScript(scriptName);
    if (!scriptPath) {
        vscode.window.showErrorMessage(t('extension.error.scriptNotFound', { script: scriptName }));
        return 1;
    }
    const python = resolvePythonCommand();
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        TA_MEMORY_BACKEND: getMemoryBackendSetting(),
        TA_LOCALE: getConfiguredLocale()
    };
    const needsOpenRouterKey = args.includes('openrouter');
    if (needsOpenRouterKey && resolveOpenRouterKey) {
        const openRouterApiKey = await resolveOpenRouterKey();
        if (openRouterApiKey) {
            env.OPENROUTER_API_KEY = openRouterApiKey;
        }
    }
    return new Promise((resolve) => {
        const child = spawn(python, [scriptPath, ...args], { cwd: wsPath, shell: false, env });
        activeScriptProcess = child;
        child.stdout?.on('data', (d: Buffer) => getGmBridgeOutputChannel().append(d.toString()));
        child.stderr?.on('data', (d: Buffer) => getGmBridgeOutputChannel().append(d.toString()));

        let finished = false;
        const finishScript = (code: number) => {
            if (finished) { return; }
            finished = true;
            activeScriptProcess = undefined;
            resolve(code);
        };

        child.on('close', (code) => {
            finishScript(code ?? 1);
        });
        child.on('error', () => {
            finishScript(1);
        });
    });
}

export function killActiveScriptProcess(): void {
    if (activeScriptProcess) {
        activeScriptProcess.kill();
        activeScriptProcess = undefined;
    }
}