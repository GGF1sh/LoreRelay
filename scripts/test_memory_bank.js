#!/usr/bin/env node
/**
 * memoryBank テスト — 日本語 RAG 強化トークナイザ + TF-IDF マッチング
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tokenizeForDebug, matchMemories, loadMemoryChunks } = require('../out/memoryBank');

let failed = 0;
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function ok(msg)   { console.log(`OK: ${msg}`); }

function assertIncludes(tokens, expected, label) {
    if (!tokens.includes(expected)) {
        fail(`${label}: expected "${expected}" in [${tokens.slice(0, 10).join(', ')}]`);
    } else {
        ok(`${label}: contains "${expected}"`);
    }
}
function assertNotIncludes(tokens, unexpected, label) {
    if (tokens.includes(unexpected)) {
        fail(`${label}: "${unexpected}" should NOT be in tokens`);
    } else {
        ok(`${label}: "${unexpected}" correctly excluded`);
    }
}

// ── 1. 英数字 ─────────────────────────────────────────────────
const latinTokens = tokenizeForDebug('Hello World RPG 2024');
assertIncludes(latinTokens, 'hello', 'latin lowercase');
assertIncludes(latinTokens, 'rpg',   'latin abbreviation');
assertIncludes(latinTokens, '2024',  'latin digits');

// ── 2. カタカナ: 全体トークン + バイグラム ──────────────────
const kataTokens = tokenizeForDebug('アリスはドラゴンを倒した');
assertIncludes(kataTokens, 'アリス',  'katakana full word アリス');
assertIncludes(kataTokens, 'アリ',    'katakana bigram アリ');
assertIncludes(kataTokens, 'リス',    'katakana bigram リス');
assertIncludes(kataTokens, 'ドラゴン','katakana full word ドラゴン');
assertIncludes(kataTokens, 'ドラ',   'katakana bigram ドラ');

// ── 3. 漢字: バイグラム + トライグラム ──────────────────────
const kanjiTokens = tokenizeForDebug('竜の洞窟探索');
// バイグラム（漢字ブロック「洞窟探索」から）
assertIncludes(kanjiTokens, '洞窟', 'kanji bigram 洞窟');
assertIncludes(kanjiTokens, '窟探', 'kanji bigram 窟探');
assertIncludes(kanjiTokens, '探索', 'kanji bigram 探索');
// トライグラム
assertIncludes(kanjiTokens, '洞窟探', 'kanji trigram 洞窟探');
assertIncludes(kanjiTokens, '窟探索', 'kanji trigram 窟探索');
// 単独漢字
assertIncludes(kanjiTokens, '竜', 'single kanji 竜');

// ── 4. ひらがなストップワード除外 ───────────────────────────
const hiraTokens = tokenizeForDebug('彼女は魔法をつかう');
// 助詞「は」「を」は除外されること
assertNotIncludes(hiraTokens, 'は', 'hiragana stop は excluded');
assertNotIncludes(hiraTokens, 'を', 'hiragana stop を excluded');
// 「をつかう」は1ひらがな連続として全体トークンになる（形態素解析なしの制約）
// バイグラム「かう」「つか」は生成される
assertIncludes(hiraTokens, 'をつかう', 'hiragana sequence をつかう (whole)');
assertIncludes(hiraTokens, 'かう', 'hiragana bigram かう');
assertIncludes(hiraTokens, 'つか', 'hiragana bigram つか');

// ── 5. TF-IDF マッチング — 一時ワークスペースで検証 ─────────
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-'));
try {
    // lorebook.json を置く
    const lore = {
        entries: [
            {
                id: 'dragon-cave',
                comment: 'Dragon Cave',
                content: 'ドラゴンが棲む洞窟。深部には黄金の宝物がある。',
                keys: ['ドラゴン', '洞窟'],
                enabled: true
            },
            {
                id: 'alice',
                comment: 'Alice',
                content: 'アリスは若き冒険者。赤い外套と金色の短剣がトレードマーク。',
                keys: ['アリス'],
                enabled: true
            },
            {
                id: 'unrelated',
                comment: 'Tavern',
                content: 'The old tavern sits at the crossroads of two forgotten roads.',
                keys: ['tavern'],
                enabled: true
            }
        ]
    };
    fs.writeFileSync(path.join(ws, 'lorebook.json'), JSON.stringify(lore), 'utf-8');

    // ドラゴン洞窟に関する検索
    const dragonMatches = matchMemories(ws, 'ドラゴンの巣を探して洞窟に入る', 3);
    // loadMemoryChunks が "lore:" プレフィックスを付けるため id は "lore:dragon-cave" など
    if (dragonMatches.length === 0) {
        fail('TF-IDF: dragon query returned no matches');
    } else if (dragonMatches[0].id !== 'lore:dragon-cave') {
        fail(`TF-IDF: dragon query top match was "${dragonMatches[0].id}", expected "lore:dragon-cave"`);
    } else {
        ok('TF-IDF: dragon query top match = lore:dragon-cave');
    }

    // アリスに関する検索
    const aliceMatches = matchMemories(ws, 'アリスはどこにいるか？', 3);
    if (aliceMatches.length === 0) {
        fail('TF-IDF: alice query returned no matches');
    } else if (aliceMatches[0].id !== 'lore:alice') {
        fail(`TF-IDF: alice query top match was "${aliceMatches[0].id}", expected "lore:alice"`);
    } else {
        ok('TF-IDF: alice query top match = lore:alice');
    }

    // 英語クエリ
    const tavernMatches = matchMemories(ws, 'tavern crossroads', 3);
    if (tavernMatches.length === 0) {
        fail('TF-IDF: English tavern query returned no matches');
    } else if (tavernMatches[0].id !== 'lore:unrelated') {
        fail(`TF-IDF: tavern top match was "${tavernMatches[0].id}", expected "lore:unrelated"`);
    } else {
        ok('TF-IDF: English tavern query top match = lore:unrelated');
    }

    // 空クエリは空配列
    const emptyMatches = matchMemories(ws, '', 3);
    if (emptyMatches.length !== 0) {
        fail('TF-IDF: empty query should return []');
    } else {
        ok('TF-IDF: empty query returns []');
    }

} finally {
    fs.rmSync(ws, { recursive: true, force: true });
}

// ── 6. チャンクなしのワークスペース ─────────────────────────
const pairedWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-pairs-'));
try {
    const question = '港へ小麦を届けて戻ったら様子を知らせる約束をします。農場主に名前と安全な道を聞いてから出発します。';
    fs.writeFileSync(path.join(pairedWs, 'game_history.json'), JSON.stringify([
        { id: 'ask', role: 'user', content: question },
        { id: 'answer', role: 'gm', content: '私はトーマスだ。ネリの様子を知らせてくれるなら、こっちも安心できる。約束だよ。' },
        { id: 'ask-hidden', role: 'user', content: question },
        { id: 'hidden', role: 'gm', content: 'HIDDEN_SECRET ' + question, excludedFromPrompt: true },
        { id: 'failed-question', role: 'user', content: question },
        { id: 'retry', role: 'user', content: question },
    ]));
    const paired = loadMemoryChunks(pairedWs);
    if (!paired.find(c => c.id === 'history:ask')?.text.includes('トーマス')) {
        fail('retrieved player question must retain its adjacent GM answer');
    } else { ok('retrieved player question retains the named GM answer'); }
    if (paired.some(c => c.text.includes('HIDDEN_SECRET'))
        || paired.find(c => c.id === 'history:ask-hidden')?.text.includes('[GM reply')
        || paired.find(c => c.id === 'history:failed-question')?.text.includes('[GM reply')) {
        fail('history pairing must not cross hidden replies or consecutive user entries');
    } else { ok('history pairing respects exclusions and failed/retried input boundaries'); }
} finally { fs.rmSync(pairedWs, { recursive: true, force: true }); }

const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-empty-'));
try {
    const chunks = loadMemoryChunks(emptyWs);
    if (chunks.length !== 0) {
        fail('empty workspace should have 0 chunks');
    } else {
        ok('empty workspace loadMemoryChunks = []');
    }
    const result = matchMemories(emptyWs, 'anything', 3);
    if (result.length !== 0) {
        fail('empty workspace matchMemories should return []');
    } else {
        ok('empty workspace matchMemories = []');
    }
} finally {
    fs.rmSync(emptyWs, { recursive: true, force: true });
}

if (failed > 0) {
    process.exit(1);
}
console.log('All memory bank tests passed.');
