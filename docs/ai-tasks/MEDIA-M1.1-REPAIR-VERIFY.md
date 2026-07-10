# MEDIA-M1.1 Repair Verify (installed-Skill gate only)

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Narrow independent reverify of the installed-Skill gate repair (no implementation changes, no merge)  
- **Date:** 2026-07-10 (JST)  
- **Worktree:** `C:\AI\wt-media-m1.1-repair-verify` @ repair tip `9644773`  
- **Out of scope:** portrait artifact gates 1–7 (already independently verified); no live Antigravity install; no canonical BAT execution  

## Final verdict

```text
MEDIA_M1_1_REPAIR_VERIFY_PASS
```

---

## Context

Accepted blocker review `f38e8ddd4c62129dab6e9074ec5b428b2c1dac6d` (`MEDIA_M1_1_REPAIR_REQUIRED`) established that:

- installed-vs-repo `SKILL.md` hash checking lived only behind optional `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1`
- nothing in-repo set that env var for canonical install
- a stale installed Skill could survive a green post-merge smoke

This reverify checks **only** that the repair closes that blocker and does not regress the immediate surface around it.

---

## 1. Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `e9f9a916063ab530ccfe184cfe66a34f9588c399` | exact match; tip subject `docs: record INSTALLER-RELEASE-001 integration` | MATCH |
| Main moved? | no | tip still `e9f9a91` at end of verify | NO |
| Original candidate HEAD | `f2720fb0fa4c4145dc259830767129da34d85786` | present; parent of repair | MATCH |
| Repair commit | `b75be72b611000cd4a97a92adbca4711f7331dfa` | `fix(installer): mandatory post-copy installed-Skill hash verification; bump to 1.78.1` | MATCH |
| Repair report | `9644773f40442c7405e5e502916467ece49c4a0a` | `docs: record MEDIA-M1.1 installed-Skill gate repair (READY_FOR_VERIFY)` | MATCH |
| Accepted blocker review | `f38e8ddd4c62129dab6e9074ec5b428b2c1dac6d` | present on `task/MEDIA-M1.1-independent-verify` | MATCH |
| Ancestry | `f2720fb` → `b75be72` → `9644773` | `b75be72^` = `f2720fb`; `9644773^` = `b75be72` | MATCH |
| Repair branch | `task/MEDIA-M1.1-repair-installed-skill-gate` | tip `9644773` | MATCH |
| `main` ⊂ repair branch | yes | `merge-base --is-ancestor e9f9a91 repair` exit 0 | MATCH |

### Repair report scope

`git show --stat 9644773`:

```text
docs/ai-tasks/MEDIA-M1.1-REPAIR-INSTALLED-SKILL-GATE.md | 150 +
1 file changed, 150 insertions(+)
```

Report commit changes **only** its review/report document. PASS.

### Repair implementation touch set (`b75be72`)

```text
CHANGELOG.md
README.md / README_en.md / README_zh-CN.md / README_zh-TW.md
docs/VERSION_TRUTH.md
package.json / package-lock.json
scripts/install_antigravity_skill.ps1
scripts/install_common.ps1
scripts/run_all_tests.js
scripts/test_antigravity_installer.ps1
scripts/test_antigravity_skill_installer.js
scripts/test_antigravity_skill_installer.ps1
```

---

## 2. Mandatory installer authority

### Production wiring

`scripts/install_antigravity_skill.ps1` (canonical Skill installer):

```text
Install-SkillFolderAtomic -SourceDir $sourceDir -TargetDir $targetDir
  → Assert-InstalledSkillMatchesSource (source SKILL.md, installed SKILL.md, target dir)
  → verified log line
  → success messages
catch → exit 1
exit 0 only after the try completes
```

`Assert-InstalledSkillMatchesSource` in `scripts/install_common.ps1`:

- missing source → throw  
- missing installed `SKILL.md` → throw including **target** path  
- hash mismatch → throw with `source=<sha256> installed=<sha256> target=<path>`  
- match → return installed hash  

Success messages (`gm_success` / `gm_success_hint`) appear **only after** a successful assert. A throw aborts before them and exits nonzero. Stale / mismatched / missing installed Skill therefore **cannot** produce installer exit 0 on the canonical path.

### Focused behavioral evidence

`scripts/test_antigravity_skill_installer.ps1` (via `node scripts/test_antigravity_skill_installer.js`):

| Case | Required | Observed | Result |
| --- | --- | --- | --- |
| **A** | matching installed `SKILL.md` → success | atomic install + assert returns source hash | PASS |
| **B** | missing installed `SKILL.md` → failure | throws; message contains `missing` | PASS |
| **C** | mismatched installed `SKILL.md` → failure | throws; message includes **source hash**, **installed hash**, **target path** | PASS |
| **D** | multi-target independent verify | 3 targets each hash-verified | PASS |
| **E** | any mismatch forces overall failure | good+bad targets → overall fail | PASS |

All PASS on this host.

---

## 3. Atomic safety

Diff of `Install-SkillFolderAtomic` vs pre-repair (`f2720fb..b75be72`):

- **No edits** inside the atomic install body (tmp copy → backup rename → promote → cleanup).  
- Repair only **appends** `Assert-InstalledSkillMatchesSource` **after** the existing function.  
- Canonical installer still calls `Install-SkillFolderAtomic` first; verification is a **post-copy gate**, not a rewrite of staging/backup semantics.

No redesign and no weakening of atomic install. PASS.

---

## 4. Source-test separation

`test_antigravity_file_bridge.js` still gates installed-vs-source equality **only** when `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC === '1'`.

| Case | Required | Evidence | Result |
| --- | --- | --- | --- |
| Default source tests | do **not** require an older already-installed Skill to match candidate source | test **F**: bridge with drifted `USERPROFILE` Skill + empty env → exit 0 | PASS |
| Strict diagnostic | `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` still detects drift | test **G**: same drifted Skill → nonzero; message matches `/installed skill must match repo-owned source/i` | PASS |
| Blocker closed | installer is mandatory canonical authority | production `install_antigravity_skill.ps1` always asserts after atomic copy (not env-gated) | PASS |

Former blocker (optional env-only gate with no canonical post-install assert) is **actually closed**.

---

## 5. Canonical wiring (verifier not dead code)

| Path | Wiring | Result |
| --- | --- | --- |
| Root BAT | `install_antigravity_skill.bat` → `powershell.exe ... -File "%SCRIPT_DIR%scripts\install_antigravity_skill.ps1"` | LIVE |
| PS1 | after atomic install calls `Assert-InstalledSkillMatchesSource` | LIVE |
| Shared helper | defined in `install_common.ps1`, used by production PS1 + focused tests | LIVE |
| Suite registration | `run_all_tests.js` adds `test_antigravity_skill_installer.js` | LIVE |

`Assert-InstalledSkillMatchesSource` is not dead code: the canonical Antigravity Skill install path invokes `scripts/install_antigravity_skill.ps1`, which always runs the assert before success. (BAT was not executed live per instructions; wiring is source-level.)

---

## 6. Version

| Surface | Expected | Observed | Result |
| --- | --- | --- | --- |
| `package.json` | `1.78.1` | `1.78.1` | PASS |
| `package-lock` root + `packages[""]` | `1.78.1` | both | PASS |
| README badges (4 locales) | `version-1.78.1` | all match | PASS |
| CHANGELOG first release | `[1.78.1]` | `## [1.78.1] - 2026-07-10` | PASS |
| `docs/VERSION_TRUTH.md` | `1.78.1` | table + 現行 row | PASS |

`node scripts/check_version_consistency.js` → all checks passed.

### Version-agnostic installer test vs consistency checker

`scripts/test_antigravity_installer.ps1` no longer hard-codes `1.78.0`; it round-trips whatever `package.json` declares (semver shape + `lorerelay-<version>.vsix` naming + extract identity).

This does **not** weaken `check_version_consistency.js`:

- exact version identity across package / lock / badges / CHANGELOG / VERSION_TRUTH remains the **authority** of that checker  
- checker remains registered in `run_all_tests.js` (`validate` category) and was run green at `1.78.1`  

PASS.

---

## 7. Tests

Worktree: `C:\AI\wt-media-m1.1-repair-verify` @ `9644773`.

| Command | Result |
| --- | --- |
| `npm run compile` | PASS |
| `node scripts/test_antigravity_skill_installer.js` | PASS (A–G) |
| `node scripts/check_version_consistency.js` | PASS (`1.78.1`) |
| `node scripts/test_antigravity_file_bridge.js` | PASS |
| `npm test` (once) | **238/238** PASS |

Host note: Windows PowerShell 5.1 child processes inherit a clean Desktop `PSModulePath` so `Get-FileHash` resolves (same class of host hygiene used on prior installer verifies). Not a repair defect.

Not run (per instructions): canonical BAT; live Antigravity install.

---

## Residual / non-blockers

1. Full end-to-end live install into `~/.gemini/config/skills` was intentionally not executed; production order + synthetic multi-case hash gate fully exercise the mandatory authority.  
2. Portrait artifact gates 1–7 not re-reviewed (out of scope; prior independent verify stands).  
3. Repair branch is main + 4 commits (`0836b18` portrait adopt, `f2720fb` handoff, `b75be72` repair, `9644773` report) — expected lineage for this task, not main drift.

---

## Verdict rationale

- Main fixed at expected SHA; ancestry `f2720fb → b75be72 → 9644773` holds; report commit is docs-only.  
- Canonical Skill install always verifies installed `SKILL.md` after atomic copy; match/missing/mismatch behaviors and error fields confirmed.  
- Atomic install body unchanged; post-copy assert only.  
- Source tests stay default-relaxed; strict env still detects drift; installer is the mandatory authority — former blocker closed.  
- BAT → `install_antigravity_skill.ps1` → assert is live wiring.  
- All authoritative version surfaces `1.78.1`; consistency checker still enforces exact identity.  
- Compile, focused tests, and **238/238** full suite PASS once.

```text
MEDIA_M1_1_REPAIR_VERIFY_PASS
```
)
