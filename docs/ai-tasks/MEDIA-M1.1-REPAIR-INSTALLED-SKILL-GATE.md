# MEDIA-M1.1 Repair: Restore Mandatory Installed-Skill Verification

Status: `MEDIA_M1_1_REPAIR_READY_FOR_VERIFY`

## Delivery identity

- Base `origin/main`: `e9f9a916063ab530ccfe184cfe66a34f9588c399`
- Candidate implementation (unchanged): `0836b18c2b126f4a5a1afa34cdf5054333eb4d31`
- Candidate report HEAD (branch point): `f2720fb0fa4c4145dc259830767129da34d85786`
- Accepted independent review: `f38e8ddd4c62129dab6e9074ec5b428b2c1dac6d` (`MEDIA_M1_1_REPAIR_REQUIRED`)
- Repair branch: `task/MEDIA-M1.1-repair-installed-skill-gate` (created from `f2720fb`)
- Scope: installer safety gate + version bump only. No portrait-artifact logic redesigned.
  No M2–M7. No merge. Canonical BAT not run; nothing installed into the live Antigravity IDE.

## Exact blocker (from the accepted review)

MEDIA-M1.1 changed `scripts/test_antigravity_file_bridge.js` so the installed-vs-repo `SKILL.md`
hash check runs only when `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1`. That env var was set by
**nothing** in the repository (a full-repo search found it only in the test and the report doc),
and the canonical Skill installer had **no** independent post-install hash assertion. Proven on the
canonical machine during review: installed `SKILL.md` (`6f51703d…`) ≠ repo source (`847426599f…`),
default `npm test` reported 237/237 green, while `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` correctly
failed. A stale installed Skill could therefore silently survive a green post-merge smoke — the very
"stale skill / false success" class MEDIA-M1.1 set out to eliminate on the AI side.

## Repair: the installer is now the mandatory authority

### Verification seam

`scripts/install_antigravity_skill.ps1` — after `Install-SkillFolderAtomic` copies the repo-owned
Skill folder to the canonical target (`~/.gemini/config/skills/text-adventure-gm`), the installer now
calls a new mandatory verifier before it prints any success:

`scripts/install_common.ps1` → `Assert-InstalledSkillMatchesSource -SourceSkillMd -InstalledSkillMd -TargetDir`

### Hash algorithm

SHA-256 (via the existing `Get-FileSha256` → `Get-FileHash -Algorithm SHA256`, lower-cased hex). The
installed `SKILL.md` must be a **byte-exact** copy of the repo-owned source `SKILL.md`. Because the
atomic install is a byte copy of the checked-out source, a correct install always matches regardless
of EOL settings.

### Failure behavior

1. Installed `SKILL.md` missing after copy → verifier throws → installer catch prints the error and
   `exit 1`.
2. Installed `SKILL.md` hash ≠ source hash → verifier throws a message reporting **source hash,
   installed hash, and target path** → `exit 1`.
3. Success prints the verified SHA-256 and only then the localized success lines; on any success path
   every installed target must have passed verification.
4. Atomic install behavior is preserved — verification is additive and runs after the atomic
   promotion; it does not alter the copy/rename/rollback sequence.

A stale/mismatched/missing installed Skill can no longer produce overall canonical installer success.

### Why ordinary source tests stay relaxed

Requirement 7 is honored: the default source test path is unchanged from the candidate — an ordinary
`npm test` on a machine with an older installed Skill still does **not** fail merely because the
installed Skill predates the repo (candidates legitimately change `SKILL.md` without being allowed to
run the installer). The mandatory authority now lives in the **installer**, which is the correct place
to prove installed == repo. `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` is retained as an optional
explicit drift diagnostic (Requirement 8).

## Version bump

Repair-only, human-smoke candidate → patch bump per `docs/VERSION_TRUTH.md`.

| Surface | Before | After |
| --- | --- | --- |
| `package.json` | 1.78.0 | **1.78.1** |
| `package-lock.json` root + `packages[""]` | 1.78.0 | **1.78.1** |
| `README.md` / `README_en.md` / `README_zh-CN.md` / `README_zh-TW.md` badge | 1.78.0 | **1.78.1** |
| `CHANGELOG.md` first section | `[1.78.0]` | new `[1.78.1] - 2026-07-10` (MEDIA-M1.1 adoption/sync + this installer gate) |
| `docs/VERSION_TRUTH.md` 現行 table | 1.78.0 | **1.78.1** + MEDIA-M1.1 row |

`node scripts/check_version_consistency.js` passes (package.json / lock root / `packages[""]` / four
README badges / VERSION_TRUTH / CHANGELOG all `1.78.1`). No new release automation was added.

## Tests

New behavioral coverage, wired into `npm test` as `scripts/test_antigravity_skill_installer.js`
(one new manifest entry; test-script count 237 → 238). It runs a PowerShell test
(`scripts/test_antigravity_skill_installer.ps1`, cases A–E) plus node-level F–G:

| Case | Proves |
| --- | --- |
| A | successful atomic copy + matching hash → verification succeeds and returns the source hash |
| B | installed `SKILL.md` missing after copy → verification fails, message reports the missing file |
| C | corrupted/mismatched installed `SKILL.md` → verification fails, message reports source hash, installed hash, and target path |
| D | multiple successfully-installed targets → every target is hash-verified independently |
| E | one matching + one mismatched target → a single mismatch forces overall failure |
| F | with a **drifted** synthetic installed Skill under a temp home, the default source test (`test_antigravity_file_bridge.js`) still exits 0 (no reinstall required) |
| G | with the same drift, `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` exits nonzero and names the installed-vs-source mismatch |
| H | `check_version_consistency.js` confirms every surface = 1.78.1 |

F/G are genuinely behavioral: the test creates `<tempHome>/.gemini/config/skills/text-adventure-gm/SKILL.md`
with content that differs from the repo source and spawns `test_antigravity_file_bridge.js` twice with
`USERPROFILE`/`HOME` pointed at the temp home — default → exit 0, strict → exit 1.

The existing `test_antigravity_installer.ps1` version assertions (added in INSTALLER-RELEASE-001, which
hard-coded `1.78.0`) were made version-agnostic — they now derive expected VSIX naming/extraction from
the live `package.json` version, so future bumps do not falsely fail that installer test. The exact
number remains authoritatively checked by `check_version_consistency.js`.

### Commands run

```
npm run compile                                  -> PASS (lorerelay@1.78.1)
node scripts/test_antigravity_skill_installer.js -> PASS (A–G)
node scripts/check_version_consistency.js        -> PASS (all surfaces 1.78.1)
node scripts/test_antigravity_file_bridge.js     -> PASS (default relaxed)
powershell parse-check of both edited installers -> PASS (no syntax errors; verifier wired)
npm test                                         -> PASS 238/238 (run once)
```

The canonical BAT was not run and nothing was installed into the live Antigravity IDE; the installer
seam is proven via `Install-SkillFolderAtomic` + `Assert-InstalledSkillMatchesSource` against temp
targets and by parse/wiring verification of the installer script.

## Changed files

Repair commit (production/tooling + version + tests):
- `scripts/install_common.ps1` — new `Assert-InstalledSkillMatchesSource` verifier.
- `scripts/install_antigravity_skill.ps1` — mandatory post-copy verification wired in.
- `scripts/test_antigravity_skill_installer.ps1` (new), `scripts/test_antigravity_skill_installer.js` (new).
- `scripts/run_all_tests.js` — manifest entry for the new test.
- `scripts/test_antigravity_installer.ps1` — version-agnostic assertions.
- `package.json`, `package-lock.json`, `README.md`, `README_en.md`, `README_zh-CN.md`,
  `README_zh-TW.md`, `CHANGELOG.md`, `docs/VERSION_TRUTH.md` — 1.78.1.

Report commit (separate): `docs/ai-tasks/MEDIA-M1.1-REPAIR-INSTALLED-SKILL-GATE.md`.

## Exact next reverify steps

1. `git fetch`; confirm this repair branch base is candidate HEAD `f2720fb` and that `origin/main`
   is still `e9f9a91` (no unexpected movement).
2. `npm run compile` → `node scripts/test_antigravity_skill_installer.js` →
   `node scripts/check_version_consistency.js` → `npm test` (expect 238/238).
3. Independently confirm the installer wiring: `Install-SkillFolderAtomic` followed by
   `Assert-InstalledSkillMatchesSource` in `install_antigravity_skill.ps1`, and that a mismatched
   installed `SKILL.md` throws with source/installed/target detail.
4. When ready to actually install (outside this task): run the canonical Skill installer and require
   `exit 0` with the "Verified installed SKILL.md matches repo source" line; a stale target must now
   fail the installer. Reinstall clears the current drift on the canonical machine before the
   MEDIA-M1.1 human smoke A–E.

## Final verdict

`MEDIA_M1_1_REPAIR_READY_FOR_VERIFY`
