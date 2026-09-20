'use strict';

const path = require('path');

const corePath = path.join(__dirname, '..', 'out', 'protagonistBootstrapCore.js');
const core = require(corePath);

let failed = 0;
function ok(label) { console.log(`OK: ${label}`); }
function fail(label, detail) {
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
}

const draft = core.parseProtagonistDraft({
    name: 'アリア',
    description: '旅の剣士',
    personality: '冷静',
    equipment: { weapon: '短剣' },
});
if (!draft || draft.name !== 'アリア') { fail('parseProtagonistDraft'); }
else { ok('parseProtagonistDraft'); }

const id = core.resolveUniqueCharacterId('Aria Test', new Set());
if (id !== 'ariatest') { fail('resolveUniqueCharacterId base', id); }
else { ok('resolveUniqueCharacterId base'); }

const id2 = core.resolveUniqueCharacterId('Aria Test', new Set(['ariatest']));
if (id2 === 'ariatest') { fail('resolveUniqueCharacterId dedup', id2); }
else { ok('resolveUniqueCharacterId dedup'); }

const jpId = core.slugifyCharacterId('アリア');
if (!jpId.startsWith('char_') || jpId.length < 10) { fail('slugifyCharacterId japanese', jpId); }
else { ok('slugifyCharacterId japanese'); }

const jpId2 = core.slugifyCharacterId('アリア');
if (jpId !== jpId2) { fail('slugifyCharacterId japanese stable', `${jpId} vs ${jpId2}`); }
else { ok('slugifyCharacterId japanese stable'); }

const profile = core.protagonistDraftToProfile(draft, 'aria');
if (profile.controlledBy !== 'player' || profile.name !== 'アリア') { fail('protagonistDraftToProfile'); }
else { ok('protagonistDraftToProfile'); }

const entries = [
    { id: 'u1', role: 'user', sender: 'Player', content: 'GMとして、ジャンル・主人公を質問しながら世界を組み立てて' },
    { id: 'g1', role: 'gm', sender: 'GM', content: '主人公の名前は？' },
    { id: 'u2', role: 'user', sender: 'Player', content: 'これで始めて。名前はレン、元傭兵の探索者。' },
];
if (!core.looksLikeInterviewSession(entries)) { fail('looksLikeInterviewSession'); }
else { ok('looksLikeInterviewSession'); }

const turnDraft = core.extractProtagonistFromTurnResult({
    turnId: 't1',
    narration: 'World ready.',
    playerCharacter: { name: 'Ren', description: 'Former mercenary scout' },
});
if (!turnDraft || turnDraft.name !== 'Ren') { fail('extractProtagonistFromTurnResult'); }
else { ok('extractProtagonistFromTurnResult'); }

const transcript = core.formatInterviewTranscript(entries);
if (!transcript.includes('レン')) { fail('formatInterviewTranscript'); }
else { ok('formatInterviewTranscript'); }

if (failed > 0) {
    console.error(`protagonist bootstrap core tests: ${failed} failure(s)`);
    process.exit(1);
}
console.log('All protagonist bootstrap core tests passed.');