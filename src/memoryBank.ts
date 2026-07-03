/**
 * 軽量 Memory Bank（TF-IDF）— GM プロンプト用。
 * 日本語 RAG 強化: 文字種別トークナイザ（カタカナ語 / 漢字 n-gram / ひらがな）+ IDF 重み付け。
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

/** Upper bound on indexed chunks to keep TF-IDF scans bounded. */
export const MAX_MEMORY_BANK_CHUNKS = 2000;
/** Per-chunk char cap before indexing (prevents one giant saga from dominating RAM). */
export const MAX_MEMORY_CHUNK_CHARS = 12_000;

const MEMORY_SOURCE_PRIORITY: Record<string, number> = {
    saga: 3,
    lorebook: 3,
    dynamic_profile: 2,
    history: 1,
};

function trimMemoryChunks(chunks: MemoryChunk[]): MemoryChunk[] {
    const capped = chunks.map((ch) => ({
        ...ch,
        text: ch.text.length > MAX_MEMORY_CHUNK_CHARS
            ? ch.text.slice(0, MAX_MEMORY_CHUNK_CHARS)
            : ch.text,
    }));
    if (capped.length <= MAX_MEMORY_BANK_CHUNKS) {
        return capped;
    }
    return capped
        .sort((a, b) => (MEMORY_SOURCE_PRIORITY[b.source] ?? 0) - (MEMORY_SOURCE_PRIORITY[a.source] ?? 0))
        .slice(0, MAX_MEMORY_BANK_CHUNKS);
}

// ── ひらがなストップワード ──────────────────────────────────────
// 助詞・助動詞・接続詞など、意味を持たない単体・2文字ひらがなを除外
const HIRAGANA_STOPS = new Set([
    // 一字助詞
    'は', 'が', 'を', 'に', 'へ', 'で', 'も', 'と', 'の', 'や', 'か', 'な',
    'て', 'ば', 'し', 'ね', 'よ', 'わ', 'ぞ', 'ぜ', 'さ', 'た', 'だ',
    'い', 'う', 'え', 'お', 'あ', 'ら', 'り', 'れ', 'ろ', 'ん',
    // 2〜4字の助詞・助動詞・高頻度語
    'から', 'まで', 'より', 'など', 'けど', 'ので', 'のに', 'ても',
    'には', 'では', 'でも', 'とも', 'への', 'ます', 'です',
    'した', 'する', 'いる', 'ある', 'ない', 'いた', 'あった',
    'こと', 'もの', 'とき', 'ため', 'ところ',
    'この', 'その', 'あの', 'どの', 'これ', 'それ', 'あれ',
    'ここ', 'そこ', 'あそこ',
]);

/**
 * 日本語 RAG 強化トークナイザ（外部依存なし）。
 *
 * 戦略:
 *  - 英数字: 単語そのまま（小文字化）
 *  - カタカナ連続: 全体を1トークン（固有名詞・外来語） + バイグラム（部分一致用）
 *  - 漢字連続: バイグラム + トライグラム（複合語対応）
 *  - ひらがな連続: ストップワード除外後、2〜4文字は全体トークン + バイグラム
 */
function tokenize(text: string): string[] {
    const lower = (text || '').toLowerCase();
    const tokens: string[] = [];

    // 1. ASCII / 半角英数
    const latin = lower.match(/[a-z0-9]+/g);
    if (latin) { tokens.push(...latin); }

    // 2. カタカナ（ー含む）— 外来語・固有名詞
    //    「アリス」→ token["アリス", "アリ", "リス"]
    const kataSeqs = lower.match(/[゠-ヿ]+/g);
    if (kataSeqs) {
        for (const seq of kataSeqs) {
            tokens.push(seq); // 全体（アリス, ドラゴン等）
            for (let i = 0; i < seq.length - 1; i++) {
                tokens.push(seq.slice(i, i + 2));
            }
        }
    }

    // 3. 漢字（CJK統合漢字 + 拡張A）— バイグラム + トライグラム
    //    「竜の洞窟」→ 漢字ブロック「竜」「洞窟」を個別処理
    const kanjiSeqs = lower.match(/[一-鿿㐀-䶿]+/g);
    if (kanjiSeqs) {
        for (const seq of kanjiSeqs) {
            if (seq.length === 1) {
                tokens.push(seq);
            } else {
                // バイグラム
                for (let i = 0; i < seq.length - 1; i++) {
                    tokens.push(seq.slice(i, i + 2));
                }
                // トライグラム（3文字以上の複合語カバー）
                for (let i = 0; i < seq.length - 2; i++) {
                    tokens.push(seq.slice(i, i + 3));
                }
            }
        }
    }

    // 4. ひらがな — ストップワード除外、内容語のみ
    //    「かがやく」→ ["かがやく", "かが", "がや", "やく"]
    const hiraSeqs = lower.match(/[ぁ-ゖ゛-ゞ]+/g);
    if (hiraSeqs) {
        for (const seq of hiraSeqs) {
            if (HIRAGANA_STOPS.has(seq)) { continue; }
            if (seq.length < 2) { continue; }
            // 短い内容語（2〜4文字）は全体もトークン化
            if (seq.length <= 4) { tokens.push(seq); }
            // バイグラム
            for (let i = 0; i < seq.length - 1; i++) {
                const bi = seq.slice(i, i + 2);
                if (!HIRAGANA_STOPS.has(bi)) { tokens.push(bi); }
            }
        }
    }

    return tokens;
}

// ── TF / TF-IDF ───────────────────────────────────────────────

function tf(tokens: string[]): Map<string, number> {
    const out = new Map<string, number>();
    if (tokens.length === 0) { return out; }
    for (const t of tokens) { out.set(t, (out.get(t) || 0) + 1); }
    for (const [k, v] of out) { out.set(k, v / tokens.length); }
    return out;
}

/**
 * コーパス全体から IDF を計算する。
 * 平滑化: log((N + 1) / (df + 1)) + 1  ← sklearn デフォルトと同等
 */
function buildIdf(chunks: MemoryChunk[]): Map<string, number> {
    const N = chunks.length;
    if (N === 0) { return new Map(); }
    const df = new Map<string, number>();
    for (const chunk of chunks) {
        for (const term of new Set(tokenize(chunk.text))) {
            df.set(term, (df.get(term) || 0) + 1);
        }
    }
    const idf = new Map<string, number>();
    for (const [term, docFreq] of df) {
        idf.set(term, Math.log((N + 1) / (docFreq + 1)) + 1);
    }
    return idf;
}

function tfidfVec(tokens: string[], idf: Map<string, number>): Map<string, number> {
    const tfMap = tf(tokens);
    const result = new Map<string, number>();
    for (const [term, tfVal] of tfMap) {
        // コーパスに出現しなかった語（クエリ固有）は小さめの IDF を与える
        const idfVal = idf.get(term) ?? Math.log(2) + 1;
        result.set(term, tfVal * idfVal);
    }
    return result;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
    if (a.size === 0 || b.size === 0) { return 0; }
    let dot = 0;
    for (const [k, av] of a) {
        const bv = b.get(k);
        if (bv) { dot += av * bv; }
    }
    let na = 0; for (const v of a.values()) { na += v * v; }
    let nb = 0; for (const v of b.values()) { nb += v * v; }
    if (na === 0 || nb === 0) { return 0; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── ファイル読み込みユーティリティ ────────────────────────────

function readJsonFile<T>(filePath: string): T | undefined {
    if (!fs.existsSync(filePath)) { return undefined; }
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
    if (!index?.chapters?.length) { return []; }
    const out: Array<{ id?: string; title?: string; content?: string }> = [];
    for (const cid of index.chapters) {
        const ch = readJsonFile<{ id?: string; title?: string; content?: string }>(
            path.join(ws, 'sagas', `${cid}.json`)
        );
        if (ch?.content) { out.push(ch); }
    }
    return out;
}

// ── 公開 API ──────────────────────────────────────────────────

/** memories/index.json があればそれを使い、なければ各ソースから都度収集 */
export function loadMemoryChunks(ws: string): MemoryChunk[] {
    const indexPath = path.join(ws, 'memories', 'index.json');
    const indexed = readJsonFile<{ chunks?: MemoryChunk[] }>(indexPath);
    if (indexed?.chunks?.length) {
        return trimMemoryChunks(indexed.chunks.filter((c) => c?.text));
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
        if (!Array.isArray(raw?.entries)) { continue; }
        for (const e of raw.entries) {
            if (e.enabled === false) { continue; }
            const content = String(e.content || '').trim();
            if (!content) { continue; }
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
            if (entry.excludedFromPrompt === true) { continue; }
            const content = String(entry.content || '').trim();
            if (content.length < 40) { continue; }
            chunks.push({
                id: `history:${entry.id || 'turn'}`,
                source: 'history',
                label: `${entry.sender || entry.role || 'GM'} (${entry.id || '?'})`,
                text: content
            });
        }
    }

    return trimMemoryChunks(chunks);
}

/**
 * ヒント文に関連するメモリをスコア順で返す。
 * TF-IDF コサイン類似度（IDF はコーパス全体から算出）。
 */
export function matchMemories(ws: string, hintText: string, maxResults = 3): MemoryChunk[] {
    const chunks = loadMemoryChunks(ws);
    if (chunks.length === 0) { return []; }

    const idf = buildIdf(chunks);
    const qTokens = tokenize(hintText);
    const qVec = tfidfVec(qTokens, idf);
    if (qVec.size === 0) { return []; }

    const scored = chunks
        .map((ch) => ({ ch, score: cosine(qVec, tfidfVec(tokenize(ch.text), idf)) }))
        .filter((x) => x.score > 0.005)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults).map((x) => x.ch);
}

/** GM プロンプト用 — 直近 N 章の Saga テキスト */
export function buildSagaPromptContext(ws: string, maxChapters = 2): string {
    const chapters = listSagaChapters(ws);
    if (chapters.length === 0) { return ''; }
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
    if (matches.length === 0) { return ''; }
    const parts = ['[Memory Bank — relevant memories]'];
    for (const m of matches) {
        parts.push(`--- ${m.label} (${m.source}) ---`);
        parts.push(m.text.trim());
    }
    return parts.join('\n');
}

/** テスト・デバッグ用: トークン列を直接返す（本番コードでは使用しない） */
export function tokenizeForDebug(text: string): string[] {
    return tokenize(text);
}
