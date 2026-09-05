# MOD Substrate V1 Slice 3B1 — Post-Merge Repair

## Status

`GUI_SMOKE_PASS_STANDARD_CLOSE_PENDING`

Base: `dab625b1b93f3b3207d5b2bb24f2ecf7b26654c7`

This narrow repair addresses the three findings posted by the ordinary Code Review after PR #94 merged. The final-head PR #94 review is the authorized independent review stage for this High Risk repair; no additional review chain is required.

## Scope

- Build hidden-adult identifier redaction from discovered manifests plus authoritative profile approvals and lock packages, so missing or malformed installed packages cannot expose a hidden adult MOD identifier through Safe Mode state or diagnostic export.
- Run empty-campaign inspection, deterministic resolve revalidation, final eligibility inspection, and profile/lock publication under the shared deterministic workspace mutation gate.
- Recheck campaign eligibility immediately before publication, fail busy concurrent canonical writes with `WORLD_MUTATION_IN_PROGRESS`, and leave both control files unpublished if campaign state appears during resolve.
- Allow an enabled adult MOD to be disabled without a new adult read or enable confirmation. Remove its enabled draft entry and persisted approval, clear `adultContent.allow` when no approvals remain, and invalidate the prior resolve preview.
- Expose the adult disable action in the MOD Manager webview while retaining the separate authorization path for enable.

Explicitly excluded: campaign fork lifecycle, update, uninstall, installer changes, Prompt MOD, Campaign Kit, Combat fixtures, replace/patch, arbitrary code, and broader MOD Manager redesign.

## Direct regression evidence

- `npm run compile`: PASS.
- `node scripts/test_mod_manager.js`: PASS, 88 assertions.
- The focused test directly covers:
  - hidden adult lock identity after the installed package is moved out of its locked path, in both manager state and exported diagnostics;
  - a competing owner of the shared workspace mutation gate;
  - campaign state created during asynchronous resolve before profile/lock publication;
  - authorized adult enabled-to-disabled behavior, zero additional confirmation, empty resolve result, and persisted approval removal.
- `npm run check:symbol-registry`: PASS, 5,581 entries.

## Final non-GUI verification

- Test Console plan: `.test-runs/plans/2026-09-04T16-23-35-951Z-be931485-verify.json`.
  - Clean tree: yes.
  - Complete plan: yes.
  - Selected commands: 21.
  - Focused commands: 18.
  - Unknown changed files: 0.
  - Policy-selected full suite: no; this High Risk lane nevertheless ran the required full suite explicitly.
- Saved-plan execution: PASS, 21/21 commands and 18/18 focused commands.
  - Result: `.test-runs/2026-09-04T16-24-00-500Z-be931485`.
  - Target executable HEAD: `be931485e4cdb861964f15c423cae5a1273414a3`.
- First full-suite attempt: 341/342 suites PASS; Combat 736/736 PASS.
  - The sole failure was the known synchronized stale-takeover timing race in `test_runtime_accepted_replay_guard.js`.
  - The unchanged PR #94 tree and the repair tree each passed the failing candidate in direct isolation, and this repair does not change accepted-replay code or its test.
  - The failure was therefore classified as an unrelated pre-existing timing flake, and the workflow-policy retry after a failed run was used once.
- Final unchanged-tree full suite: PASS, 342/342 suites; Combat 736/736; 191.9 seconds.
- No executable or production change was made after the passing final full suite.

## Computer Use terminal gate

- PASS using the native `@oai/sky` entry point and a fresh extension-development host launched explicitly from this repair worktree.
- The smoke used the existing harmless `smoke.adult @ 1.0.0` package in `campaign-empty`.
- The enabled adult package initially exposed `Disable`. Activating it required no new adult approval, removed the enabled draft state, invalidated the prior preview, and changed the action to `Authorize & enable adult MOD`.
- No production or executable file changed during the smoke, and the broader MOD Manager flow was not repeated.
- The earlier blocked monitor placement is superseded by this passing run; the user explicitly authorized either monitor and VS Code launch/restart for completion.

## PR verification

- Draft PR: `#95`.
- PR HEAD before this documentation-only completion update: `b654b7aad339387e81dcafb5ce62ad8c222641dd`.
- CI run `33896261800` / run number `866`: PASS for `validate-and-smoke` and `coverage` against that HEAD.
- The final documentation-only HEAD must receive its own CI before Ready and Standard Close.

## Remaining gates

- Exact-head PR CI after this documentation-only update.
- Ready and Standard Close.
