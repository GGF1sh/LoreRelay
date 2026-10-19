#!/usr/bin/env node
/**
 * memoryBank テスト — 日本語 RAG 強化トークナイザ + TF-IDF マッチング
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { tokenizeForDebug, matchMemories, loadMemoryChunks, mergeMemoryMatches, MAX_MEMORY_BANK_CHUNKS } = require('../out/memoryBank');

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

// Inline correction observed in the real Host: similar later questions must not
// crowd the edited barn description out of the two-slot compact memory budget.
const editedWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-edited-'));
try {
    const question = '農場主の名前と、納屋の軒に下がっているものを確認してください。過去の購入記録と、ハルカが次の行き先を決めているかも短く確認します。ここから新しい出来事や行動は起こさず、返答を待ちます。';
    const repeatedQuestion = '話を続けます。農場主の名前と、北農場での過去の小麦購入の数量・支払額を確認してください。白塔の王都を訪問済みか、ハルカが次の行き先を決めたかも確認してください。私はまだ行動も台詞も決めず、返答を待っています。';
    const history = [
        { id: 'ask-59', role: 'user', content: '農場主と短く話し、これまでの小麦取引と今後の旅について聞きます。取引・移動・時間経過は実行しません。' },
        { id: 'turn-59', role: 'gm', editedAt: '2026-09-19T19:26:00.512Z', content: '農場主のトーマスは、納屋の扉にもたれてあなたを迎えた。納屋の軒には小さな真鍮の風鈴が下がっている。\n\n「以前の小麦10個、90crの取引は助かったよ」\n\n白塔の王都はまだ訪問していない。ハルカは次の行き先も台詞も決めておらず、農場主の話を聞いている。取引・移動・時間経過はない。' },
        { id: 'ask-61', role: 'user', content: repeatedQuestion },
        { id: 'turn-61', role: 'gm', content: 'トーマスは納屋の前で帳簿を確かめ、静かにうなずく。\n\n「北農場での購入記録は、小麦10個・支払額90crです」\n\n農場主の名はトーマス。白塔の王都は未訪問で、ハルカが次の行き先を決めた記録もない。いまは北農場に留まり、取引・移動・時間経過はいっさい発生していない。' },
        { id: 'ask-62', role: 'user', content: repeatedQuestion },
        { id: 'turn-62', role: 'gm', content: 'トーマスは帳簿の頁を押さえ、確認する。\n\n「農場主は私、トーマスです。北農場での過去の購入は小麦10個、支払額90cr――記録どおりです」\n\n白塔の王都は未訪問。ハルカが次の行き先を決めた記録もなく、いまは北農場で返答を待つ静かな時間が続いている。' },
    ];
    const writeHistory = entries => fs.writeFileSync(path.join(editedWs, 'game_history.json'), JSON.stringify(entries));
    writeHistory(history);
    const current = loadMemoryChunks(editedWs);
    const edited = current.find(c => c.id === 'history:ask-59');
    assert.strictEqual(edited.editedAt, history[1].editedAt, 'a visible edited reply supplies the pair edit timestamp');
    assert(edited.label.includes('user-edited'), 'the prompt label identifies an authored inline edit');
    const local = matchMemories(editedWs, question, 2);
    assert.strictEqual(local.length, 2, 'inline edit priority retains the compact count limit');
    assert.strictEqual(local[0].id, edited.id, 'the relevant edited pair precedes similar later confirmation questions');
    assert(local[0].text.includes('小さな真鍮の風鈴'));
    assert.strictEqual(matchMemories(editedWs, question, 1)[0].id, edited.id);
    assert.deepStrictEqual(matchMemories(editedWs, question, 0), []);

    const backend = [
        current.find(c => c.id === 'history:ask-62'),
        current.find(c => c.id === 'history:ask-61'),
        { id: 'history:turn-59', source: 'history', text: 'STALE_BARN_DESCRIPTION' },
        { id: edited.id, source: 'history', text: 'STALE_BARN_DESCRIPTION' },
    ];
    const merged = mergeMemoryMatches(current, local, backend, 2);
    assert.strictEqual(merged[0].id, edited.id, 'backend rank votes cannot evict the relevant live edit');
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(new Set(merged.map(c => c.id)).size, 2, 'edited question and backend answer aliases use one slot');
    assert(!merged.some(c => c.text.includes('STALE_BARN_DESCRIPTION')));

    // Latest means the latest relevant edit, not the last file row or an edit
    // of an unrelated topic. Only that one edit is promoted; the other slot
    // continues to use normal relevance ranking.
    writeHistory([
        ...history.map(entry => entry.id === 'turn-61' ? { ...entry, editedAt: '2026-09-19T19:25:00.000Z' } : entry),
        { id: 'astronomy', role: 'gm', editedAt: '2026-09-19T19:27:00.000Z', content: 'Nebula telescopes spectroscopy ultraviolet astronomy observatory galaxies constellations.' },
    ]);
    const latestRelevant = matchMemories(editedWs, question, 2);
    assert.strictEqual(latestRelevant[0].id, edited.id);
    assert(!latestRelevant.some(c => c.id === 'history:astronomy'), 'an unrelated newer edit cannot reserve a slot');

    writeHistory(history.map(entry => entry.id === 'turn-59' ? { ...entry, excludedFromPrompt: true } : entry));
    const excludedCurrent = loadMemoryChunks(editedWs);
    assert(!excludedCurrent.find(c => c.id === edited.id)?.editedAt, 'an excluded reply cannot donate its edit timestamp');
    const excludedMerged = mergeMemoryMatches(excludedCurrent, local, backend, 2);
    assert(!excludedMerged.some(c => c.text.includes('真鍮の風鈴')), 'stale local/backend matches cannot revive an excluded edit');

    writeHistory(history.slice(2));
    const undoneMerged = mergeMemoryMatches(loadMemoryChunks(editedWs), local, backend, 2);
    assert(!undoneMerged.some(c => c.id === edited.id || c.text.includes('真鍮の風鈴')), 'Undo removal wins over stale edited IDs');
    assert(!fs.existsSync(path.join(editedWs, 'memories')), 'edit priority requires no persisted memory schema or index');
    ok('inline edit priority, compact limits, backend deduplication, relevance, exclusion and Undo');
} finally { fs.rmSync(editedWs, { recursive: true, force: true }); }

const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-empty-'));
const longWs = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-memtest-long-'));
try {
    const history = [
        { id: 'meeting', role: 'user', content: '農場主のお名前は？' },
        { id: 'meeting-answer', role: 'gm', content: '北の農場で麦を育てるトーマスだ。青いリボンを目印に、雨上がりの翌朝にまた会おう。' },
        ...Array.from({ length: 40 }, (_, n) => [
            { id: 'filler-' + n, role: 'user', content: '中央辻で陶工と焼き物の釉薬について話す。' },
            { id: 'filler-answer-' + n, role: 'gm', content: '陶工は窯の温度と透明な釉薬を説明し、器の丈夫さを実演した。昨日焼いた皿の色も確認する。' },
        ]).flat(),
        { id: 'excluded', role: 'gm', content: 'HIDDEN_SECRET farmer name must never be sent again.', excludedFromPrompt: true },
    ];
    const write = (name, data) => fs.writeFileSync(path.join(longWs, name), JSON.stringify(data));
    write('game_history.json', history);
    const matches = matchMemories(longWs, '北の農場主との再会、名前と青いリボンの約束', 2);
    assert(matches.some(c => c.id === 'history:meeting' && c.text.includes('トーマス')));
    assert(!loadMemoryChunks(longWs).some(c => c.id === 'history:meeting-answer'), 'paired answer cannot crowd out a second meeting');
    fs.mkdirSync(path.join(longWs, 'memories'));
    write('memories/index.json', { chunks: [
        { id: 'history:meeting', source: 'history', label: 'old', text: 'STALE_NAME' },
        { id: 'history:excluded', source: 'history', label: 'hidden', text: 'HIDDEN_SECRET' },
        { id: 'lore:farmer', source: 'lorebook', label: 'old', text: 'STALE_NAME' },
        { id: 'lore:disabled', source: 'lorebook', label: 'disabled', text: 'DISABLED_LORE' },
        { id: 'manual:extra', source: 'import', label: 'custom', text: 'A custom imported source remains available.' },
    ]});
    write('lorebook.json', { entries: [
        { id: 'farmer', content: 'Explicit authored correction: the farmer is Thomas, not Harold.' },
        { id: 'disabled', content: 'DISABLED_LORE', enabled: false },
    ]});
    write('world_info.json', { entries: [{ id: 'farmer', content: 'STALE_NAME from the fallback file' }] });
    const current = loadMemoryChunks(longWs);
    assert(current.some(c => c.id === 'manual:extra'), 'custom index sources are preserved');
    assert(!current.some(c => /STALE_NAME|HIDDEN_SECRET|DISABLED_LORE/.test(c.text)), 'cached text cannot bypass current edits or exclusions');
    const fused = mergeMemoryMatches(current, matchMemories(longWs, '農場主の青いリボン', 2), [
        { id: 'history:excluded', source: 'history', text: 'HIDDEN_SECRET' },
        { id: 'lore:farmer', source: 'lorebook', text: 'STALE_NAME' },
    ], 2);
    assert(fused.some(c => c.id === 'history:meeting'), 'live older dialogue survives a stale backend');
    assert(!fused.some(c => /STALE_NAME|HIDDEN_SECRET/.test(c.text)), 'all backend matches use current source text');
    const semanticOnly = mergeMemoryMatches(current, [], [
        { id: 'history:meeting-answer', source: 'history', text: 'STALE_NAME' },
        { id: 'history:meeting', source: 'history', text: 'STALE_NAME' },
    ], 2);
    assert.strictEqual(semanticOnly.length, 1, 'backend question and answer IDs share one retrieval slot');
    assert.strictEqual(semanticOnly[0].id, 'history:meeting');
    assert(semanticOnly[0].text.includes('トーマス'), 'answer-only backend match hydrates its current pair');
    assert.strictEqual(current.filter(c => c.id === 'lore:farmer').length, 1);
    assert(current.find(c => c.id === 'lore:farmer').text.includes('Thomas, not Harold'));
    const correction = { id: 'correction', role: 'user', content: 'Explicit correction: Thomas is the farmer; Harold was a mistaken name, not another person.' };
    const confirmation = { id: 'confirmed', role: 'gm', content: 'I understand. The original farmer is Thomas.' };
    write('game_history.json', [...history.slice(0,2), correction, confirmation, ...history.slice(2)]);
    assert(loadMemoryChunks(longWs).find(c => c.id === 'history:meeting').followingExchange.includes('Explicit correction'));
    write('game_history.json', [...history.slice(0,2), correction, {...confirmation,excludedFromPrompt:true}]);
    assert(!loadMemoryChunks(longWs).find(c => c.id === 'history:meeting').followingExchange, 'excluded continuation is not supplied');
    write('game_history.json', [...history.slice(0,2), correction, {...correction,id:'retry'}, confirmation]);
    assert(!loadMemoryChunks(longWs).find(c => c.id === 'history:meeting').followingExchange, 'do not jump over a failed/retried input');
    // Undo/removal must not restore a departed timeline through an old index.
    write('game_history.json', []);
    assert(!loadMemoryChunks(longWs).some(c => c.source === 'history'));
    write('game_history.json', Array.from({ length: MAX_MEMORY_BANK_CHUNKS + 20 }, (_, n) =>
        ({ id: 'standalone-' + n, role: 'gm', content: 'Retained standalone dialogue is bounded even in a very long campaign. ' + n })));
    const bounded = loadMemoryChunks(longWs);
    assert(bounded.length <= MAX_MEMORY_BANK_CHUNKS);
    assert(bounded.some(c => c.id === 'history:standalone-2019'));
    assert(!fs.existsSync(path.join(longWs, 'npc_registry.json')), 'retrieval must not invent canonical NPCs');
    ok('40-exchange recall, short questions, fresh sources, stale backend, undo and corpus bound');
} finally { fs.rmSync(longWs, { recursive: true, force: true }); }

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
