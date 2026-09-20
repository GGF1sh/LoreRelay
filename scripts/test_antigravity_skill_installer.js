#!/usr/bin/env node
'use strict';

// MEDIA-M1.1 repair: mandatory installed-Skill hash gate.
//   A-E: the PowerShell installer verification (Assert-InstalledSkillMatchesSource +
//        Install-SkillFolderAtomic) behaves correctly across missing/mismatch/multi-target.
//   F-G: the ordinary source test (test_antigravity_file_bridge.js) stays relaxed by default
//        even when a drifted Skill is installed, but still detects drift under
//        LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1.

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;
function check(condition, message) {
    if (condition) { console.log(`OK: ${message}`); }
    else { console.error(`FAIL: ${message}`); failed++; }
}

// A-E: PowerShell installer gate behavior.
{
    const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const ps = spawnSync(powershell, [
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(__dirname, 'test_antigravity_skill_installer.ps1'),
    ], { cwd: root, encoding: 'utf8' });
    if (ps.stdout) { process.stdout.write(ps.stdout); }
    if (ps.stderr) { process.stderr.write(ps.stderr); }
    check(ps.status === 0, 'A-E: PowerShell installer hash-gate tests pass');
}

// F-G: default-relaxed vs explicit-strict source-test behavior against a drifted installed Skill.
{
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-skill-home-'));
    try {
        const installedSkillDir = path.join(tempHome, '.gemini', 'config', 'skills', 'text-adventure-gm');
        fs.mkdirSync(installedSkillDir, { recursive: true });
        // Deliberately drifted installed SKILL.md (differs from repo-owned source).
        fs.writeFileSync(path.join(installedSkillDir, 'SKILL.md'), '# stale drifted installed skill\n');

        const sourceSkill = fs.readFileSync(
            path.join(root, 'antigravity-skill', 'text-adventure-gm', 'SKILL.md'), 'utf8');
        check(sourceSkill !== '# stale drifted installed skill\n',
            'F/G precondition: synthetic installed Skill genuinely differs from repo source');

        const bridgeTest = path.join(__dirname, 'test_antigravity_file_bridge.js');
        const runBridge = (extraEnv) => spawnSync(process.execPath, [bridgeTest], {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, USERPROFILE: tempHome, HOME: tempHome, ...extraEnv },
        });

        // F. Default source test does not fail merely because an older Skill is installed.
        const relaxed = runBridge({ LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC: '' });
        check(relaxed.status === 0,
            'F: default source test passes despite a drifted installed Skill (no reinstall required)');

        // G. Explicit strict mode still detects the real drift.
        const strict = runBridge({ LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC: '1' });
        check(strict.status !== 0,
            'G: LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1 still detects installed-Skill drift');
        const strictOut = `${strict.stdout || ''}${strict.stderr || ''}`;
        check(/installed skill must match repo-owned source/i.test(strictOut),
            'G: strict-mode failure names the installed-vs-source Skill mismatch');
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
}

if (failed > 0) {
    console.error(`antigravity skill installer gate: ${failed} failure(s)`);
    process.exit(1);
}
console.log('antigravity skill installer gate tests passed.');
