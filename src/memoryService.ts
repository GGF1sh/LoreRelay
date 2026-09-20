import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { getWorkspacePath } from './workspacePaths';
import { loadMemoryChunks, type MemoryChunk } from './memoryBank';
import { estimateTokens, previewText } from './promptContext';
import {
    getMemoryBackendSetting,
    resolveGmBridgeScript,
    resolvePythonCommand,
    runSkillScript
} from './skillScriptRunner';

export interface MemoryMatchResult {
    id: string;
    label: string;
    source: string;
    preview: string;
    score?: number;
    tokenEstimate: number;
}

export interface MemoryStatus {
    backend: string;
    chunkCount: number;
    indexPath?: string;
    indexUpdated?: string;
}

function resolveMemoriesViaPython(ws: string, hintText: string, backend: string, maxResults: number): MemoryChunk[] {
    const scriptPath = resolveGmBridgeScript('memory_bank.py');
    if (!scriptPath) {
        return [];
    }
    const python = resolvePythonCommand();
    const result = spawnSync(
        python,
        [
            scriptPath,
            '--cwd', ws,
            '--resolve',
            '--json',
            '--text', hintText,
            '--max', String(maxResults),
            '--backend', backend
        ],
        { encoding: 'utf-8', timeout: 15000 }
    );
    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }
    try {
        const parsed = JSON.parse(result.stdout.trim());
        return Array.isArray(parsed) ? parsed as MemoryChunk[] : [];
    } catch {
        return [];
    }
}

function matchMemoriesWithScores(ws: string, hintText: string, maxResults: number): MemoryMatchResult[] {
    const chunks = loadMemoryChunks(ws);
    const lower = (hintText || '').toLowerCase();
    const tokens: string[] = [];
    const words = lower.match(/[a-z0-9]+/g);
    if (words) { tokens.push(...words); }
    const cjkSeqs = lower.match(/[\u3000-\u9fff\uff00-\uffef]+/g);
    if (cjkSeqs) {
        for (const seq of cjkSeqs) {
            if (seq.length === 1) { tokens.push(seq); }
            else {
                for (let i = 0; i < seq.length - 1; i++) {
                    tokens.push(seq.slice(i, i + 2));
                }
            }
        }
    }
    const qLen = tokens.length || 1;
    const qMap = new Map<string, number>();
    for (const t of tokens) {
        qMap.set(t, (qMap.get(t) || 0) + 1);
    }
    for (const [k, v] of qMap) {
        qMap.set(k, v / qLen);
    }

    const scored = chunks.map((ch) => {
        const chTokens: string[] = [];
        const text = (ch.text || '').toLowerCase();
        const w = text.match(/[a-z0-9]+/g);
        if (w) { chTokens.push(...w); }
        const cjk = text.match(/[\u3000-\u9fff\uff00-\uffef]+/g);
        if (cjk) {
            for (const seq of cjk) {
                if (seq.length === 1) { chTokens.push(seq); }
                else {
                    for (let i = 0; i < seq.length - 1; i++) {
                        chTokens.push(seq.slice(i, i + 2));
                    }
                }
            }
        }
        const cLen = chTokens.length || 1;
        const cMap = new Map<string, number>();
        for (const t of chTokens) {
            cMap.set(t, (cMap.get(t) || 0) + 1);
        }
        for (const [k, v] of cMap) {
            cMap.set(k, v / cLen);
        }
        let dot = 0;
        let na = 0;
        let nb = 0;
        const keys = new Set([...qMap.keys(), ...cMap.keys()]);
        for (const k of keys) {
            const a = qMap.get(k) || 0;
            const b = cMap.get(k) || 0;
            dot += a * b;
        }
        for (const v of qMap.values()) { na += v * v; }
        for (const v of cMap.values()) { nb += v * v; }
        const score = na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
        return { ch, score };
    }).filter((x) => x.score > 0.01)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

    return scored.map(({ ch, score }) => ({
        id: ch.id,
        label: ch.label,
        source: ch.source,
        preview: previewText(ch.text, 240),
        score: Math.round(score * 1000) / 1000,
        tokenEstimate: estimateTokens(ch.text)
    }));
}

export function getMemoryStatus(): MemoryStatus {
    const ws = getWorkspacePath();
    const backend = getMemoryBackendSetting();
    if (!ws) {
        return { backend, chunkCount: 0 };
    }
    const indexPath = path.join(ws, 'memories', 'index.json');
    let indexUpdated: string | undefined;
    if (fs.existsSync(indexPath)) {
        try {
            indexUpdated = fs.statSync(indexPath).mtime.toISOString();
        } catch {
            // ignore
        }
    }
    return {
        backend,
        chunkCount: loadMemoryChunks(ws).length,
        indexPath: fs.existsSync(indexPath) ? indexPath : undefined,
        indexUpdated
    };
}

export function searchMemoryPreview(hintText: string, maxResults = 8): MemoryMatchResult[] {
    const ws = getWorkspacePath();
    if (!ws || !hintText.trim()) {
        return [];
    }
    const backend = getMemoryBackendSetting();
    if (backend === 'tfidf') {
        return matchMemoriesWithScores(ws, hintText, maxResults);
    }
    const viaPy = resolveMemoriesViaPython(ws, hintText, backend, maxResults);
    if (viaPy.length > 0) {
        return viaPy.map((m) => ({
            id: m.id,
            label: m.label,
            source: m.source,
            preview: previewText(m.text, 240),
            tokenEstimate: estimateTokens(m.text)
        }));
    }
    const tfidf = matchMemoriesWithScores(ws, hintText, maxResults);
    return tfidf;
}

export async function setMemoryBackend(backend: string): Promise<void> {
    const normalized = backend.trim().toLowerCase();
    if (normalized !== 'auto' && normalized !== 'tfidf' && normalized !== 'chromadb') {
        throw new Error(`Invalid memory backend: ${backend}`);
    }
    const config = vscode.workspace.getConfiguration('textAdventure');
    await config.update('memory.backend', normalized, vscode.ConfigurationTarget.Workspace);
}

export async function rebuildMemoryIndex(): Promise<void> {
    const ws = getWorkspacePath();
    if (!ws) {
        throw new Error('Workspace not found');
    }
    await runSkillScript('memory_bank.py', ['--rebuild', '--backend', getMemoryBackendSetting()]);
}