# Agent Rules (LoreRelay / overnight work)

## AI workflow

Read `docs/AI_WORKFLOW.md` first, then `docs/DEVELOPMENT_VERIFICATION_POLICY.md`; size testing
to its Low/Medium/High risk tier. Most work is Low or Medium: focused evidence only, no
independent review or full suite. Documentation-only work does not need compile or a full suite.

- Before adding a shared helper, exported type, public webview function, or reusable constant, run `npm run knowledge -- <name>`.
- Before changing a host-to-webview or webview-to-host message, look up its message name. Before adding a `textAdventure.*` setting, look up its config key.
- Before entity/event vocabulary work, consult `docs/TERMINOLOGY_CONTRACT.md` or `docs/EVENT_CLASSIFICATION_GLOSSARY.md` as applicable.
- Choose focused tests through the Test Console plan first; supplement it only for a missing changed behavior. Full suites and independent review are risk-tier requirements, not defaults.
- Do not have another AI reconfirm identical evidence on the same tree.

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

After substantive executable changes when the risk tier requires it:

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
