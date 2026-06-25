/**
 * 軽量 Memory Bank（TF-IDF）— Grok プロンプト用。
 * Python 側 memory_common.py と同じアルゴリズム。ChromaDB 不要。
 */
import * as fs from 'fs';
import * as path from 'path';

/** メモリチャンク1件（Saga / ロアブック / 動的プロフィール / 履歴など） */
export interface MemoryChunk {
    id: string;
    source: string;
    label: string;
    text: string;
}

/** 英単語 + 日本語・中国語の2文字バイグラムでトークン化 */
function tokenize(text: string): string[] {
    const lower = (text || '').toLowerCase();
    const tokens: string[] = [];
    const words = lower.match(/[a-z0-9]+/g);
    if (words) {
        tokens.push(...words);
    }
    const cjkSeqs = lower.match(/[\u3000-\u9fff\uff00-\uffef]+/g);
    if (cjkSeqs) {
        for (const seq of cjkSeqs) {
            if (seq.length === 1) {
                tokens.push(seq);
            } else {
                for (let i = 0; i < seq.length - 1; i++) {
                    tokens.push(seq.slice(i, i + 2));
                }
            }
        }
    }
    return tokens;
}

function tf(tokens: string[]): Map<string, number> {
    const out = new Map<string, number>();
    if (tokens.length === 0) {
        return out;
    }
    for (const t of tokens) {
        out.set(t, (out.get(t) || 0) + 1);
    }
    for (const [k, v] of out) {
        out.set(k, v / tokens.length);
    }
    return out;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
    if (a.size === 0 || b.size === 0) {
        return 0;
    }
    let dot = 0;
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const k of keys) {
        dot += (a.get(k) || 0) * (b.get(k) || 0);
    }
    let na = 0;
    let nb = 0;
    for (const v of a.values()) { na += v * v; }
    for (const v of b.values()) { nb += v * v; }
    if (na === 0 || nb === 0) {
        return 0;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function readJsonFile<T>(filePath: string): T | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
    } catch {
        return undefined;
    }
}

/** sagas/index.json から章一覧を読み込む */
function listSagaChapters(ws: string): Array<{ id?: string; title?: string; content?: string }> {
    const indexPath = path.join(ws, 'sagas', 'index.json');
    const index = readJsonFile<{ chapters?: string[] }>(indexPath);
    if (!index?.chapters?.length) {
        return [];
    }
    const out: Array<{ id?: string; title?: string; content?: string }> = [];
    for (const cid of index.chapters) {
        const ch = readJsonFile<{ id?: string; title?: string; content?: string }>(
            path.join(ws, 'sagas', `${cid}.json`)
        );
        if (ch?.content) {
            out.push(ch);
        }
    }
    return out;
}

/** memories/index.json があればそれを使い、なければ各ソースから都度収集 */
export function loadMemoryChunks(ws: string): MemoryChunk[] {
    const indexPath = path.join(ws, 'memories', 'index.json');
    const indexed = readJsonFile<{ chunks?: MemoryChunk[] }>(indexPath);
    if (indexed?.chunks?.length) {
        return indexed.chunks.filter((c) => c?.text);
    }

    const chunks: MemoryChunk[] = [];

    for (const ch of listSagaChapters(ws)) {
        chunks.push({
            id: `saga:${ch.id || 'unknown'}`,
            source: 'saga',
            label: String(ch.title || ch.id || 'saga'),
            text: String(ch.content)
        });
    }

    for (const name of ['lorebook.json', 'world_info.json']) {
        const raw = readJsonFile<{ entries?: Array<Record<string, unknown>> }>(path.join(ws, name));
        if (!Array.isArray(raw?.entries)) {
            continue;
        }
        for (const e of raw.entries) {
            if (e.enabled === false) {
                continue;
            }
            const content = String(e.content || '').trim();
            if (!content) {
                continue;
            }
            chunks.push({
                id: `lore:${e.id || e.comment || 'entry'}`,
                source: 'lorebook',
                label: String(e.comment || e.id || 'lore'),
                text: content
            });
        }
    }

    const dyn = readJsonFile<Record<string, string>>(path.join(ws, 'characters', 'dynamic_profiles.json'));
    if (dyn) {
        for (const [cid, prof] of Object.entries(dyn)) {
            const text = String(prof || '').trim();
            if (text) {
                chunks.push({
                    id: `dynamic:${cid}`,
                    source: 'dynamic_profile',
                    label: `Character ${cid}`,
                    text
                });
            }
        }
    }

    const hist = readJsonFile<Array<Record<string, unknown>>>(path.join(ws, 'game_history.json'));
    if (Array.isArray(hist)) {
        for (const entry of hist.slice(-30)) {
            if (entry.excludedFromPrompt === true) {
                continue;
            }
            const content = String(entry.content || '').trim();
            if (content.length < 40) {
                continue;
            }
            chunks.push({
                id: `history:${entry.id || 'turn'}`,
                source: 'history',
                label: `${entry.sender || entry.role || 'GM'} (${entry.id || '?'})`,
                text: content
            });
        }
    }

    return chunks;
}

/** ヒント文（直近ナラティブ + プレイヤー行動）に関連するメモリをスコア順で返す */
export function matchMemories(ws: string, hintText: string, maxResults = 3): MemoryChunk[] {
    const chunks = loadMemoryChunks(ws);
    const qVec = tf(tokenize(hintText));
    if (qVec.size === 0) {
        return [];
    }
    const scored = chunks
        .map((ch) => ({ ch, score: cosine(qVec, tf(tokenize(ch.text))) }))
        .filter((x) => x.score > 0.01)
        .sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).map((x) => x.ch);
}

/** GM プロンプト用 — 直近 N 章の Saga テキスト */
export function buildSagaPromptContext(ws: string, maxChapters = 2): string {
    const chapters = listSagaChapters(ws);
    if (chapters.length === 0) {
        return '';
    }
    const recent = chapters.slice(-maxChapters);
    const parts = ['[Saga Archive — recent chapters]'];
    for (const ch of recent) {
        parts.push(`--- ${ch.title || ch.id || 'chapter'} ---`);
        parts.push(String(ch.content || '').trim());
    }
    return parts.join('\n');
}

/** GM プロンプト用 — Memory Bank マッチ結果を整形 */
export function buildMemoryPromptContext(ws: string, hintText: string, maxResults = 3): string {
    const matches = matchMemories(ws, hintText, maxResults);
    if (matches.length === 0) {
        return '';
    }
    const parts = ['[Memory Bank — relevant memories]'];
    for (const m of matches) {
        parts.push(`--- ${m.label} (${m.source}) ---`);
        parts.push(m.text.trim());
    }
    return parts.join('\n');
}
