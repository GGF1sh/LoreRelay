# MOD Substrate V1 Slice 3B1 — Post-Merge Repair

## Status

`IMPLEMENTATION_FOCUSED_PASS_FINAL_VERIFICATION_PENDING`

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

## Remaining gates

- Test Console plan and its selected verification commands.
- One full suite on the final unchanged executable tree, including Combat regression.
- Narrow native Computer Use smoke for adult enabled-to-disabled only.
- Exact-head PR CI and Standard Close.
