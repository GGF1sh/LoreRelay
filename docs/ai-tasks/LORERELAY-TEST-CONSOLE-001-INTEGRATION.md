# LORERELAY-TEST-CONSOLE-001-INTEGRATION

- Prompt timestamp: `2026-07-14 06:45:42 JST (Asia/Tokyo)`
- Repository: `GGF1sh/LoreRelay`
- Integration branch: `main`
- Pre-integration local main: `08807d98234cada6d10ee194779d56202afa2fbd`
- Pre-integration origin/main: `08807d98234cada6d10ee194779d56202afa2fbd`
- Fast-forward target: `584f7f07075c39f6e28e0f564dcc8ccb17b7ea98`
- Integrated executable/verifier tree before this report: `3e35f38cfed7e845df87244fda4c897e4214e7de`
- Version: `1.82.4` (unchanged)

## Guarded lineage audit

The command-trust repair branch passed every fail-closed lineage gate:

- original candidate tip: `dad0988cd94d616620b13fa946d6c3f036ca00da`;
- repair tip: `584f7f07075c39f6e28e0f564dcc8ccb17b7ea98`;
- ahead of original candidate: exactly 4 commits;
- behind original candidate: 0 commits;
- merge commits in the repair range: 0;
- local and remote repair refs both ended at the required repair tip.

The original verifier commit `ecad18b2198274f065d547c633efa096ed6318f6` had parent `dad0988...` and added only `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001-INDEPENDENT-VERIFY.md`. It was cherry-picked without conflict as:

- `ecad18b2198274f065d547c633efa096ed6318f6` -> `648b453d74025f4c7e99a69b446afcf785bd8f8b`.

The command-trust re-verifier commit `9eb52a1fd19303269a15b61e5af24a091600db2c` had parent `584f7f0...` and added only `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001-COMMAND-TRUST-REVERIFY.md`. It was cherry-picked without conflict as:

- `9eb52a1fd19303269a15b61e5af24a091600db2c` -> `3e35f38cfed7e845df87244fda4c897e4214e7de`.

The frozen Relay-banner candidate remained at `9e304d7188e2e0c61852e204879bf1580f5e3415`.

## Final linear sequence before this integration report

1. `560d11d35c2817f452ba6708e885443900f4d2b6` - `test(tooling): expose shared LoreRelay test manifest`
2. `3fdce5590177f8d2870b8ea87670b466d70f31ca` - `feat(tooling): add local LoreRelay test console`
3. `77decaf9d0682d266d5e5b9bc4593b0a81f04a81` - `test(tooling): harden cancellation and fixture cleanup`
4. `74d9af7e8b2648d639badaff62ef4c3e2673685c` - `docs: record LoreRelay Test Console candidate`
5. `419ac2e983be53eb1473cdce6b83f7f7adf24f75` - `fix(tooling): use shell for .cmd executables on Windows to fix EINVAL`
6. `dad0988cd94d616620b13fa946d6c3f036ca00da` - `docs: record test-console resumption and spawn fix`
7. `3b660be187b6e2b79d61aa24bb3755b435bf0180` - `fix(tooling): remove shell execution from Test Console`
8. `7322199505f46e0018f83111a2bb40799366ee34` - `fix(tooling): validate and hydrate canonical test plans`
9. `bf08601a9d7c7c9bed64f429a631f4bb3e202a0b` - `test(tooling): cover plan tampering and Windows metacharacters`
10. `584f7f07075c39f6e28e0f564dcc8ccb17b7ea98` - `docs: record Test Console command trust repair`
11. `648b453d74025f4c7e99a69b446afcf785bd8f8b` - original independent verifier report cherry-pick
12. `3e35f38cfed7e845df87244fda4c897e4214e7de` - command-trust re-verifier report cherry-pick

No merge commit, squash, rebase, force operation, or source-branch rewrite was used.

## Changed-file count

The integrated candidate, repair, and two verifier reports changed 22 paths relative to old main. Adding this integration report makes the final integration range 23 paths. No `src/`, locale, installer, packaged extension, live-world, campaign, or user-data path was changed by the integration operation.

## Command-trust architecture

Schema-version-2 plans persist only declarative command descriptors. Persisted commands cannot carry `executable`, `args`, `shell`, `cwd`, or `env`. On load, the console checks repository identity and current tree state, regenerates the canonical plan, rejects any declarative mismatch, and hydrates command IDs through the version-controlled trusted-command registry.

Hydrated Node tests use `process.execPath` with fixed script paths and `shell:false`. Trusted npm boundaries resolve the npm JavaScript CLI and also run through Node, without `npm.cmd`, `.bat`, `cmd.exe`, PowerShell command strings, or `shell:true`. A non-serializable `Symbol` marker prevents a JSON plan from forging trusted-command status.

The re-verifier recorded one non-blocking hardening recommendation: `hydrateTrustedCommand()` currently allows descriptor-supplied `exclusiveGroup` and `workspaceWriter` scheduling metadata to override registry defaults for an internal caller. Current CLI and dashboard routes remain safe because only freshly regenerated canonical planner descriptors reach hydration. This was not modified during integration.

## Persisted full-suite evidence

The tested executable tree is `bf08601a9d7c7c9bed64f429a631f4bb3e202a0b`. The only commits after that tree and before this report are documentation-only. The persisted artifact was read and cross-checked at:

`C:\AI\wt-lorerelay-test-console-001-command-trust-repair\.test-runs\2026-07-13T21-29-20-568Z-bf08601a`

- fingerprint: `10b28786e10bd35f4694ecb1e4fdd71a97a1a33b575a0510c52564716f3ef30e`;
- result marker: `TEST_RUN_PASS`;
- focused checks: 3/3 PASS;
- full suite: 251/251 PASS;
- full-suite exit code: 0;
- failed scripts: 0;
- full-suite command: direct Node execution of `scripts/run_all_tests.js`;
- recorded full-suite duration: 185.8 seconds.

The complete 251-test suite was not rerun during integration because the integrated executable/config/test tree is byte-for-byte represented by `bf08601...`; every later commit is report-only; the artifact and its logs were present and consistent; and independent command-trust re-verification had already accepted that evidence. No integration conflict or code repair created a reason to invalidate it.

## Post-integration validation

Validation was performed in a clean detached worktree at exact integrated HEAD `3e35f38cfed7e845df87244fda4c897e4214e7de`, because the primary checkout already contained one unrelated nested-worktree status entry. That unrelated entry was not modified.

Direct checks:

- `npm.cmd install`: PASS (`202` packages installed in the clean validation worktree);
- `npm.cmd run compile`: PASS;
- `npm.cmd run test:console:self`: PASS, 34/34;
- `npm.cmd test -- --list`: PASS, exactly 251 manifest entries;
- `node scripts/check_version_consistency.js`: PASS, version `1.82.4`;
- `node scripts/validate_utf8_docs.js`: PASS, 1,143 files before the plan run.

Test Console verify plan:

- base: `08807d98234cada6d10ee194779d56202afa2fbd`;
- head: `3e35f38cfed7e845df87244fda4c897e4214e7de`;
- mode: `verify`;
- schemaVersion: 2;
- changed files: 22;
- unknown files: 0;
- full-suite command: absent;
- persisted spawn-authority fields: 0;
- selected commands with reasons: 3/3;
- hydrated unsafe commands (`.cmd`, `.bat`, `cmd.exe`, PowerShell, `shell:true`, or missing trust marker): 0;
- execution result: `TEST_RUN_PASS`, 3/3 PASS;
- verify fingerprint: `d1d4798725577c941483378ab913d1df171c4d4f18bc0d904d59d628d083e010`;
- artifact: `C:\AI\wt-lorerelay-test-console-001-integration-validate\.test-runs\2026-07-13T21-57-16-234Z-3e35f38c`;
- human smoke: not performed and not required.

The primary checkout compile attempt encountered a local Windows `EPERM` while copying the already tracked cartography theme file. The exact same integrated commit compiled successfully in the clean validation worktree, establishing that the primary-checkout event was a local file conflict rather than an executable-tree defect. Build-generated webview byproducts were restored and were not committed.

## Post-push validation

Pending the first normal push of `main`. This section will be updated with exact fetched SHA equality and the required self-test/version/UTF-8 results. The 251-test suite will not be rerun.

## Untouched confirmations

- Package version, README badges, CHANGELOG product release version, and `docs/VERSION_TRUTH.md` remain at `1.82.4`.
- Frozen Relay candidate `task/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001` remains at `9e304d7188e2e0c61852e204879bf1580f5e3415`.
- Installer refresh and installer state were untouched.
- Installed VS Code extension state was untouched.
- Live world data, campaign data, user settings, and user data were untouched.
- Human smoke was not performed and is not required for this tooling-only integration.
