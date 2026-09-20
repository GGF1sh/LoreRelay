#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const {
    MEDIA_ARTIFACT_RESULT_PREFIX,
    buildPortraitGeneratedMessage,
    parseMediaArtifactResult,
} = require('../out/mediaArtifactCore');
const { verifyAdoptedPortraitArtifact } = require('../out/portraitArtifact');

let failed = 0;
function check(condition, message) {
    if (condition) { console.log(`OK: ${message}`); }
    else { console.error(`FAIL: ${message}`); failed++; }
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-portrait-sync-'));
try {
    const characters = path.join(temp, 'characters');
    fs.mkdirSync(characters, { recursive: true });
    const oldPath = path.join(characters, 'hero_portrait_1111111111111111.png');
    const newPath = path.join(characters, 'hero_portrait_2222222222222222.png');
    fs.writeFileSync(oldPath, 'old');
    fs.writeFileSync(newPath, 'new');
    const createdAt = new Date().toISOString();
    fs.writeFileSync(path.join(characters, 'hero.json'), JSON.stringify({
        id: 'hero',
        name: 'Hero',
        portrait: newPath,
    }));

    const stdout = [
        oldPath,
        `${MEDIA_ARTIFACT_RESULT_PREFIX}{"success":true,"outputPath":${JSON.stringify(oldPath)},"createdAt":"2020-01-01T00:00:00Z","characterId":"hero"}`,
        newPath,
        `${MEDIA_ARTIFACT_RESULT_PREFIX}${JSON.stringify({ success: true, outputPath: newPath, createdAt, characterId: 'hero' })}`,
    ].join('\n');
    const parsed = parseMediaArtifactResult(stdout);
    check(parsed?.outputPath === newPath, 'last exact subprocess artifact wins; directory latest scanning is unnecessary');

    const verified = verifyAdoptedPortraitArtifact(temp, 'hero', parsed, Date.now() - 1000);
    check(verified.ok && verified.portraitPath === fs.realpathSync(newPath), 'host verifies exact adopted file and character JSON binding');

    if (verified.ok) {
        const oldUri = `vscode-webview://portrait/${path.basename(oldPath)}`;
        const newUri = `vscode-webview://portrait/${path.basename(verified.portraitPath)}`;
        const message = buildPortraitGeneratedMessage('hero', newUri, verified.createdAt);
        check(message.type === 'portraitGenerated' && message.id === 'hero', 'left UI receives portraitGenerated for intended character');
        check(message.uri === newUri && message.uri !== oldUri, 'versioned adopted path produces a fresh UI URI after regeneration');
    }

    const before = fs.readFileSync(path.join(characters, 'hero.json'), 'utf8');
    const missing = parseMediaArtifactResult(`${MEDIA_ARTIFACT_RESULT_PREFIX}${JSON.stringify({
        success: true,
        outputPath: path.join(characters, 'missing.png'),
        createdAt,
        characterId: 'hero',
    })}`);
    const missingVerification = verifyAdoptedPortraitArtifact(temp, 'hero', missing, Date.now() - 1000);
    check(!missingVerification.ok, 'missing adopted artifact is rejected by host verification');
    check(fs.readFileSync(path.join(characters, 'hero.json'), 'utf8') === before, 'host verification failure does not mutate character JSON');

    const stale = { success: true, outputPath: newPath, createdAt: '2020-01-01T00:00:00Z', characterId: 'hero' };
    check(!verifyAdoptedPortraitArtifact(temp, 'hero', stale, Date.now()).ok, 'stale artifact freshness evidence is rejected');
    check(parseMediaArtifactResult('scene_old.png') === undefined, 'legacy path alone is not accepted as a success contract');

    const skill = fs.readFileSync(path.join(root, 'antigravity-skill', 'text-adventure-gm', 'SKILL.md'), 'utf8');
    check(skill.includes('Never select the newest file in a directory'), 'Skill forbids latest-file guessing');
    check(skill.includes('Do not claim portrait success when generation or adoption fails'), 'Skill forbids false portrait success');
    check(skill.includes('do not write an old/stale portrait path into `turn_result.json`'), 'Skill forbids stale turn_result portrait paths');
    check(skill.includes('Do not invent `file:///` Markdown paths'), 'Skill forbids invented file URI Markdown');
} finally {
    fs.rmSync(temp, { recursive: true, force: true });
}

if (failed > 0) { process.exit(1); }
console.log('portrait artifact sync tests passed.');
