# Agent Rules (LoreRelay / overnight work)

## Verification scope

Read `docs/DEVELOPMENT_AND_VERIFICATION_POLICY.md` first and size review/testing to the change's
risk tier (Low/Medium/High) defined there. Most work is Low or Medium: focused tests only, no
independent review, no full suite, no durable report. Reserve independent verification, repair
passes, and full-suite runs for genuinely High-risk changes (shell/process execution, deletion,
installer/updater, save-data migration, auth/networking, concurrent writes, security boundaries).

## Goal

Implement only the task described. Prefer small, reviewable diffs.

## Safety (mandatory)

- Do **not** delete files unless explicitly instructed.
- Do **not** run: `rm -rf`, `del /s /q`, `format`, `git reset --hard`, `git clean -fdx`.
- Before large changes: summarize plan; ensure git commit or backup exists.
- Do **not** add dependencies unless necessary.
- Do **not** implement features outside the spec.
- On repeated test failures: stop after 3 attempts and report logs.

## Build & test

After substantive changes:

```bash
npm run compile
npm test
```

## Reporting

End with: changed files, what was implemented, commands run, test result, remaining issues.

## Living World / world-kit

- Pure logic lives in `src/*Core.ts` (no vscode in `*Core` files).
- Host wiring: `livingWorldBridge.ts`, `statePatch.ts`, `emergentSimulator.ts`.
- Design: `docs/COMMERCE_AND_AGENCY_BRIEF.md`, `../lorerelay-world-kit/docs/DESIGN.md`.