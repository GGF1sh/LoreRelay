# MEDIA-M1.1 Canonical Human Installer Chain — Independent Verification

Status: `MEDIA_M1_1_CANONICAL_CHAIN_VERIFY_PASS`

Narrow, independent verification of the canonical human installer chain. The exact human-facing
installer under test is `install_extension_antigravity.bat`. The standalone
`install_antigravity_skill.bat` was **not** substituted for it at any point — that substitution
was the previous verification mistake this review was explicitly instructed to avoid.

Verifier: Claude (Opus 4.8, high reasoning). Date: 2026-07-10 (JST).
Method: direct source inspection of the BAT and both PowerShell installers, plus behavioral
execution of the real BAT against a managed checkout carrying stubbed installers.
No implementation modified. No merge. **No live BAT run and nothing installed** — verified after
the fact (see §10).

---

## 1. Integrity — PASS

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `e9f9a916063ab530ccfe184cfe66a34f9588c399` | exact match | PASS |
| Candidate branch | `task/MEDIA-M1.1-repair-canonical-install-chain` | current | PASS |
| Previous repair HEAD → candidate | `9644773` + exactly 2 commits | `git rev-list --count` = `2` | PASS |
| Commit order | implementation precedes report | `43384be` is ancestor of `9c1d7f5` | PASS |
| Report commit | docs-only | `9c1d7f5` = 1 file, `docs/ai-tasks/MEDIA-M1.1-CANONICAL-INSTALL-CHAIN-REPAIR.md`, +142 | PASS |
| Implementation touch set | — | `install_extension_antigravity.bat` (+19/−…), `ANTIGRAVITY_GUIDE.md`, `scripts/run_all_tests.js` (+1), `scripts/test_antigravity_install_chain.js` (new, 196) | recorded |

`9644773` is an ancestor of `43384be`. Working tree clean apart from pre-existing untracked
`.claude/`.

---

## 2. Exact canonical human path — PASS

Verified by reading `install_extension_antigravity.bat` directly (not by trusting the report):

| Step | Line | Evidence |
| --- | --- | --- |
| One exact desired SHA | 126 | `if /I not "!MANAGED_SHA!"=="!DESIRED_SHA!"` → abort. Both installers therefore run against a checkout pinned to a single validated SHA. |
| Prepare-only returns first | 132–136 | returns before dependencies **and** before either installer call site. |
| Extension installer | 156 | `%MANAGED_PATH%\scripts\install_vscode_extension.ps1 -Target "antigravity"` |
| Conditional skip on extension failure | 158–162 | `if not "!PS_EXIT_CODE!"=="0"` → echo "Skipping Antigravity GM Skill installation" → `goto :finish` |
| Skill installer, same checkout | 168 | `%MANAGED_PATH%\scripts\install_antigravity_skill.ps1 -ProjectDir "%MANAGED_PATH%\scripts"` |
| Skill failure fails overall | 170–173 | `goto :finish` with the Skill installer's exit code retained |
| Success line only after both | 174 | "GM Skill installed and SHA-256 verified from managed checkout" |
| Exit code | 178 / 181 | `exit /b %PS_EXIT_CODE%` |

Nothing re-checks out or mutates tracked files between line 125 (`MANAGED_SHA` read) and line 168,
so the extension and the Skill provably come from the same selected managed SHA.

`scripts/install_antigravity_skill.ps1` (line 38) derives its **source** from the passed
`-ProjectDir`: `Join-Path $ProjectDir '..\antigravity-skill\text-adventure-gm'` →
`<managed>\antigravity-skill\text-adventure-gm`. `Assert-InstalledSkillMatchesSource` therefore
compares the **managed checkout's** `SKILL.md` against the installed copy. The extension and the
Skill hash authority are anchored to the same SHA.

Delayed expansion is enabled at line 1 (`setlocal EnableExtensions EnableDelayedExpansion`), so
`!PS_EXIT_CODE!` inside the `if (...)` blocks reads the freshly-`set` value; `set "PS_EXIT_CODE=%ERRORLEVEL%"`
sits on its own top-level line immediately after each `powershell.exe` call and expands correctly.

---

## 3. Failure propagation (A–D) — PASS, behaviorally

`scripts/test_antigravity_install_chain.js` drives the **real** BAT
(`cmd.exe /c <root>\install_extension_antigravity.bat`) and stubs only the two *managed*
installers, via a throwaway git-plumbing commit (identical to `HEAD` except those two scripts) that
the BAT's own bootstrap resets its managed worktree to. The BAT's orchestration is therefore
observed, not reimplemented.

| Case | Expected | Observed | Result |
| --- | --- | --- | --- |
| A | extension success → Skill installer invoked | `skill_invoked` marker present | PASS |
| B | extension failure → Skill installer **not** invoked | `LORERELAY_TEST_EXT_EXIT=3` → BAT exit `3`; extension marker present, Skill marker **absent**; stdout contains "Skipping Antigravity GM Skill installation" | PASS |
| C | Skill failure → root BAT nonzero | `LORERELAY_TEST_SKILL_EXIT=5` → BAT exit `5`; the "SHA-256 verified" success line never printed | PASS |
| D | both success → root BAT exit 0 | BAT exit `0`, both markers present | PASS |

**Discriminating power of the test (checked, not assumed).** The Skill marker is present exactly
when the Skill installer runs (A, C) and absent when it must not (B, F). Had the BAT failed to
invoke the Skill installer at all, A would fail; had it invoked the *source-tree* installer instead
of the managed stub, the real installer would have run and the marker would not exist. The test is a
genuine detector, not a tautology.

**Production-path corroboration:** the real `scripts/install_vscode_extension.ps1` ends with
`catch { ... exit 1 }`, so a genuine extension failure produces the nonzero exit code that gate B
depends on — the stub does not paper over a missing failure mode.

---

## 4. Same-checkout authority — PASS

The Skill stub records its own `$PSScriptRoot` and received `-ProjectDir`. The test asserts both
equal `<managedPath>\scripts`, and explicitly asserts the marker does **not** contain the source
tree's `scripts` path. Combined with §2 (`MANAGED_SHA == DESIRED_SHA` enforced before either
installer) this proves the Skill installer is invoked from
`%MANAGED_PATH%\scripts\install_antigravity_skill.ps1` — not the current (dirty) source tree, not
another checkout, and not a stale installed copy. The Skill *source* it verifies against is likewise
`<managed>\antigravity-skill\text-adventure-gm` (§2).

---

## 5. Prepare-only — PASS

`LORERELAY_BOOTSTRAP_PREPARE_ONLY=1` → BAT exits `0`, prints "Prepare-only mode requested", and
neither marker file is created. The managed checkout is nonetheless prepared: the chain test
proceeds to write into `<managedPath>\node_modules`, and `test_antigravity_installer_bootstrap.js`
independently asserts the managed worktree is created/updated at the requested ref under the same
prepare-only flag.

---

## 6. Single human action — PASS

`ANTIGRAVITY_GUIDE.md` now documents exactly one step: double-click
`install_extension_antigravity.bat`, which installs the extension and then the GM Skill with
mandatory SHA-256 verification, failing the whole batch on mismatch/absence. It adds an explicit
note that `install_antigravity_skill.bat` is auxiliary and **need not be run separately**.

A repo-wide search of `*.md` (excluding `CHANGELOG.md` history and this review's own report) found
no remaining document instructing the user to run `install_antigravity_skill.bat` as a required
step. The one other mention, inside `install_vscode_extension_ja.bat`, is a disambiguation notice on
the *VS Code* (non-Antigravity) path, not an instruction to run it.

---

## 7. Existing Skill hash authority — PASS (not weakened, not duplicated)

- `install_extension_antigravity.bat` contains **no** hashing logic whatsoever
  (`grep -i "sha256|Get-FileHash|Assert-Installed"` → no matches). It only orchestrates.
- `scripts/install_antigravity_skill.ps1` still wraps `Install-SkillFolderAtomic` **and**
  `Assert-InstalledSkillMatchesSource` in one `try`, with `catch { … exit 1 }` and a trailing
  `exit 0`. The verifier remains the sole authority, in its original location.

**"Stale/missing/mismatched installed `SKILL.md` → whole root BAT fails" is established by
composition**, each link proven at the strongest seam permitted without a live install:

1. `Assert-InstalledSkillMatchesSource` throws on a missing or mismatched installed `SKILL.md`
   — behavioral (`test_antigravity_skill_installer.js` cases B/C, which also assert the message
   carries source hash, installed hash, and target path).
2. `install_antigravity_skill.ps1` converts a failure into a nonzero exit — behavioral: invoking the
   **real** script with a `-ProjectDir` lacking a Skill source returned exit `1` with no filesystem
   mutation (see §10). The specific `catch → exit 1` branch reached by a hash mismatch is the same
   three-line construct, verified by direct source reading.
3. A nonzero Skill-installer exit fails the root BAT — behavioral (§3 case C, exit `5` propagated).

Limitation recorded honestly: no single test exercises the *real* Skill installer through the BAT
with a corrupted installed `SKILL.md`, because that requires an actual install into
`%USERPROFILE%\.gemini\...`, which this task forbids. The composition above is complete and each
link is independently verified.

---

## 8. Version — PASS

`package.json` = `1.78.1`. No second bump. `node scripts/check_version_consistency.js` passes across
`package.json`, `package-lock.json` (root and `packages[""]`), four README badges,
`docs/VERSION_TRUTH.md`, and `CHANGELOG.md`.

---

## 9. Tests — PASS (239/239)

```
node scripts/test_antigravity_install_chain.js       -> PASS (F, A, D, G, E, B, C + authority + source-tree-unchanged)
node scripts/test_antigravity_skill_installer.js     -> PASS (A-G)
node scripts/test_antigravity_installer_bootstrap.js -> PASS
node scripts/check_version_consistency.js            -> PASS (1.78.1 everywhere)
npm run compile                                      -> PASS (lorerelay@1.78.1)
npm test                                             -> PASS 239/239 (69.9s, run once)
```

---

## 10. Safety of this verification

- The live canonical BAT was never executed against the default managed path:
  `C:\AI\wt-lorerelay-installer-current` still sits at `e9f9a91` (untouched).
- The installed Skill was not modified: `~/.gemini/config/skills/text-adventure-gm/SKILL.md`
  retains its pre-existing mtime (Jul 9 23:06).
- The §7 probe of the real Skill installer used a source-less `-ProjectDir` and exits before any
  directory creation or copy; the temp probe directory was confirmed to contain nothing new.
- The chain test's temporary git worktree and its `refs/lorerelay-test/install-chain` ref were both
  cleaned up; `git worktree list` and `git for-each-ref refs/lorerelay-test` show no residue, and the
  source tree's branch/HEAD/dirty state are unchanged.

---

## 11. Observations (non-blocking)

1. **Hash-mismatch catch branch is source-verified, not executed** (§7). Unavoidable under the
   "do not install" constraint; the surrounding exit-code mechanism was behaviorally probed.
2. **Pre-existing, out of scope, NOT introduced by `43384be`:** if a user sets
   `LORERELAY_INSTALLER_WORKTREE` to the source repository root, the bootstrap's identity checks
   (root-of-worktree, matching common dir) both pass, and the BAT would `git reset --hard` /
   `git clean -fd` the source tree. The default managed path avoids this. This behavior predates the
   canonical-chain change; flagged for the backlog, not a blocker for this candidate.
3. **Out of scope:** the VS Code (non-Antigravity) installer BATs still do not install the GM Skill.
   Requirement 6 is scoped to the Antigravity canonical human path, which is now single-action.
4. The chain test does not *explicitly* assert managed-worktree creation during prepare-only; that
   property is covered by `test_antigravity_installer_bootstrap.js`.

## 12. Blockers

None.

---

## Final verdict

`MEDIA_M1_1_CANONICAL_CHAIN_VERIFY_PASS`

`install_extension_antigravity.bat` is now the single human action for the Antigravity path. It pins
one managed checkout SHA, installs the extension from it, and — only on extension success — installs
the repo-owned GM Skill from that same SHA, whose mandatory SHA-256 verification still lives
untouched and un-duplicated inside `install_antigravity_skill.ps1`. Extension failure skips the Skill
install; either failure fails the root BAT; prepare-only invokes neither. Gates A–G were proven
behaviorally against the real BAT without installing anything, the version stays at `1.78.1`, and the
full suite passes 239/239.
