# MEDIA-M1.1 Repair: Canonical Install Chain (Single Human-Facing BAT)

Status: `MEDIA_M1_1_CANONICAL_CHAIN_READY_FOR_VERIFY`

## Delivery identity

- Base `origin/main`: `e9f9a916063ab530ccfe184cfe66a34f9588c399`
- Repair candidate (installed-Skill hash gate): `9644773f40442c7405e5e502916467ece49c4a0a`
- Accepted repair verify: `3f0cf43b33db9dc415de2c18b35cf080e9a6a147`
- Repair branch: `task/MEDIA-M1.1-repair-canonical-install-chain` (created from `9644773`)
- Scope: canonical install-chain orchestration only. No portrait-artifact logic touched.
  No M2–M7. No merge. Live BAT/installer not run; nothing installed.

## Exact blocker

The accepted reverify (`3f0cf43`) proved `install_antigravity_skill.bat →
install_antigravity_skill.ps1 → mandatory SHA-256 assert` works. But LoreRelay's only
human-facing Antigravity installer is `install_extension_antigravity.bat`, which called only:

```
managed checkout -> scripts/install_vscode_extension.ps1 -Target antigravity
```

It never installed the repo-owned GM Skill. So the normal human flow could still finish with
the extension updated to `1.78.1` while the installed Skill remained stale — the exact class of
false success MEDIA-M1.1 and its repairs exist to close.

## Repair

### Orchestration seam

`install_extension_antigravity.bat`, after the managed worktree is validated/updated to the
resolved `!DESIRED_SHA!` (unchanged bootstrap logic) and prepare-only mode has already returned:

```
1/2  scripts\install_vscode_extension.ps1 -Target antigravity   (managed checkout)
     -> failure: skip Skill install, exit nonzero
     -> success: continue
2/2  scripts\install_antigravity_skill.ps1 -ProjectDir <managed>\scripts   (SAME managed checkout)
     -> failure (including SHA-256 mismatch): exit nonzero
     -> success: print verified confirmation, exit 0
```

Both installer invocations use `%MANAGED_PATH%\scripts\...` — the same managed checkout SHA
(`!MANAGED_SHA!`) already validated earlier in the same BAT run, not the source working tree.
Prepare-only mode (`LORERELAY_BOOTSTRAP_PREPARE_ONLY=1`) still returns before either installer is
invoked — no logic was added between the existing prepare-only check and the first installer call
site. The mandatory SHA-256 authority was **not** moved: it remains entirely inside
`scripts/install_antigravity_skill.ps1` (via `Assert-InstalledSkillMatchesSource` in
`install_common.ps1`, from the prior repair). The BAT only orchestrates ordering and exit-code
propagation around that already-verified installer.

### Human-facing entry point

`ANTIGRAVITY_GUIDE.md` was updated: the documented single action is now
`install_extension_antigravity.bat` (installs extension + Skill, with SHA-256 verification of the
installed Skill). `install_antigravity_skill.bat` remains as an auxiliary Skill-only tool but the
guide now explicitly says it does not need to be run separately after the main BAT.

## Tests (behavioral, real BAT — no live install)

`scripts/test_antigravity_install_chain.js` (new) exercises the **real**
`install_extension_antigravity.bat` end-to-end without installing anything real: it builds a
throwaway commit via git plumbing (`hash-object` / `update-index` / `write-tree` /
`commit-tree` / `update-ref` under `refs/lorerelay-test/install-chain`) that is identical to
`HEAD` except `scripts/install_vscode_extension.ps1` and `scripts/install_antigravity_skill.ps1`
are replaced with stubs that record an invocation marker file and exit with a
caller-controlled code (`LORERELAY_TEST_EXT_EXIT` / `LORERELAY_TEST_SKILL_EXIT`). The BAT's
existing managed-worktree bootstrap resets the managed checkout to that commit, so the BAT's real
orchestration — ordering, conditional skip, exit-code propagation, and managed-checkout sourcing —
is observed directly, not reimplemented in the test.

| Case | Result | Proof |
| --- | --- | --- |
| A | PASS | extension-installer marker exists after a normal run; Skill-installer marker exists too |
| B | PASS | `LORERELAY_TEST_EXT_EXIT=3` → BAT exits `3`; extension marker exists, Skill marker does **not**; stdout shows "Skipping Antigravity GM Skill installation" |
| C | PASS | `LORERELAY_TEST_SKILL_EXIT=5` → BAT exits `5`; both markers exist (extension ran first); stdout shows the Skill failure message and never the "verified" success line |
| D | PASS | both stubs succeed → BAT exits `0` |
| E | PASS | the Skill-installer marker records `root=<managedPath>\scripts` and `projectDir=<managedPath>\scripts`, and explicitly does **not** contain the source working tree's `scripts` path |
| F | PASS | `LORERELAY_BOOTSTRAP_PREPARE_ONLY=1` → BAT exits `0` with "Prepare-only mode requested"; neither marker file exists |
| G | PASS | a single BAT invocation produces both markers; source-file assertions confirm the BAT references `scripts\install_antigravity_skill.ps1` under `%MANAGED_PATH%` and that `install_antigravity_skill.ps1` still contains `Assert-InstalledSkillMatchesSource` |

The test also re-asserts (as it did before this repair) that the source working tree's branch,
`HEAD`, and dirty status are unchanged after the whole exercise, and cleans up the temporary git
worktree, marker directory, and the throwaway `refs/lorerelay-test/install-chain` ref.

Wired into `npm test` as a new manifest entry (`scripts/run_all_tests.js`), timeout raised to
240s to accommodate five sequential BAT invocations.

### Commands run

```
node scripts/test_antigravity_install_chain.js       -> PASS (A, D, G, E, B, C, F all OK)
node scripts/test_antigravity_skill_installer.js     -> PASS (A-G, unchanged from prior repair)
node scripts/test_antigravity_installer_bootstrap.js -> PASS (unchanged bootstrap behavior)
npm run compile                                      -> PASS (lorerelay@1.78.1)
node scripts/check_version_consistency.js            -> PASS (all surfaces still 1.78.1)
npm test                                             -> PASS 239/239 (71.6s, run once)
```

Test count: 238 → **239** (one new manifest entry). Version confirmed unchanged at `1.78.1`
throughout (`node -p "require('./package.json').version"` → `1.78.1`); this repair did not bump
it, per instruction — 1.78.1 has not yet been integrated or human-smoked.

No focused test failed, so no repair iteration beyond the initial implementation was required.

## Changed files

Implementation commit:
- `install_extension_antigravity.bat` — orchestrates extension install → (on success) Skill
  install from the same managed checkout, with per-step failure handling and clear messaging.
- `ANTIGRAVITY_GUIDE.md` — single documented human action is `install_extension_antigravity.bat`;
  notes the auxiliary `install_antigravity_skill.bat` no longer needs to be run separately.
- `scripts/test_antigravity_install_chain.js` (new) — behavioral A–G proof against the real BAT.
- `scripts/run_all_tests.js` — new manifest entry.

Report commit (separate): `docs/ai-tasks/MEDIA-M1.1-CANONICAL-INSTALL-CHAIN-REPAIR.md`.

No portrait-artifact source (`mediaArtifactCore.ts`, `portraitArtifact.ts`, `characterManager.ts`,
`portrait_artifact.py`, `comfyui_generate.py`) was touched. No installer-hash-verification logic
was duplicated or relocated out of `install_antigravity_skill.ps1` / `install_common.ps1`.

## Exact next reverify steps

1. `git fetch`; confirm this branch's base is repair candidate `9644773` and `origin/main` is
   still `e9f9a91` (no unexpected movement).
2. Run, in order: `node scripts/test_antigravity_install_chain.js`,
   `node scripts/test_antigravity_skill_installer.js`,
   `node scripts/test_antigravity_installer_bootstrap.js`, `npm run compile`,
   `node scripts/check_version_consistency.js`, `npm test` once (expect 239/239, version 1.78.1).
3. Independently re-derive gates A–G directly from `install_extension_antigravity.bat`'s source:
   confirm the Skill installer call site is gated behind the extension installer's exit code,
   sourced from `%MANAGED_PATH%`, and that prepare-only returns before either call site.
4. When ready to actually install (outside this task, after integration): run
   `install_extension_antigravity.bat` for real; require overall `exit 0`; confirm both the
   Antigravity extension and the installed `SKILL.md` (hash-verified against repo source) are
   current. Only then continue the existing MEDIA-M1.1 human smoke A–E from
   `docs/ai-tasks/MEDIA-M1.1-PORTRAIT-ARTIFACT-SYNC.md`.

## Final verdict

`MEDIA_M1_1_CANONICAL_CHAIN_READY_FOR_VERIFY`
