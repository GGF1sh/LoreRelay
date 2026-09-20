# Mod System AI Prompts

Use this file to dispatch LoreRelay's Mod System work.

Design contract:

- `docs/MOD_SYSTEM_DESIGN.md`
- `docs/MOD_SYSTEM_CHATGPT_GATE.md`

## 0. Common Header

```markdown
LoreRelay Mod System handoff.

Before working, read these files in order:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `docs/MOD_SYSTEM_DESIGN.md`
5. `docs/MOD_SYSTEM_CHATGPT_GATE.md`
6. `src/scenarioPackCore.ts`

Task constraints:

- Do not copy code, UI, file formats, names, or prose from MO2, Bethesda tools,
  Nexus tools, Steam Workshop, SillyTavern extensions, or any other project.
- Extract only high-level design patterns.
- MOD1 is data-only pure resolution.
- No executable mods.
- No workspace writes.
- Later load order wins exact record conflicts.
- Similar IDs warn only; no silent auto-remap.
```

## 1. Grok/Codex Prompt - MOD1 Pure Resolver

```markdown
You are implementing LoreRelay Mod System MOD1.

Read first:

1. `docs/MOD_SYSTEM_DESIGN.md`
2. `docs/MOD_SYSTEM_CHATGPT_GATE.md`
3. Existing pure-core patterns:
   - `src/scenarioPackCore.ts`
   - `src/campaignKitCore.ts`
   - `scripts/run_all_tests.js`

Implement MOD1 only:

- `src/modSystemCore.ts`
- `scripts/test_mod_system_core.js`
- test runner registration

Core exports:

- `parseModManifest(input)`
- `parseModProfile(input)`
- `resolveModProfile(input)`

Required behavior:

- pure TypeScript only
- no `vscode`
- no `fs`
- no DOM
- no input mutation
- deterministic output
- data-only mods
- parse safe manifest/profile
- load order later wins exact domain+id conflicts
- report conflict winner and overridden mods
- report missing dependencies and dependency cycles
- warn on similar IDs but do not auto-remap
- parse explicit alias rules but do not apply them yet

Do not implement:

- file scanning
- Webview UI
- profile persistence
- workspace import/apply
- executable mods
- remote downloads
- append/patch/delete merge strategies
- compatibility patch application

Verification:

- `npm run compile`
- `node scripts/test_mod_system_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update docs/logs only if you can avoid mixing unrelated dirty work. Commit only
intentional files.
```

## 2. Codex/ChatGPT Prompt - MOD1 Implementation Gate

```markdown
Review the LoreRelay Mod System MOD1 implementation against:

1. `docs/MOD_SYSTEM_DESIGN.md`
2. `docs/MOD_SYSTEM_CHATGPT_GATE.md`
3. `src/modSystemCore.ts`
4. `scripts/test_mod_system_core.js`

Verify:

- pure core has no `vscode`, `fs`, DOM, or disk writes
- exact domain+id conflict resolves by load order
- conflict report includes winner and overridden mods
- missing dependencies and dependency cycles are reported
- similar IDs warn only and do not auto-remap
- alias rules are parsed but not applied
- no executable mod support exists
- no workspace import/apply exists

Produce:

- findings table
- pass/block verdict
- minimal fix list if blocked
```

## 3. Future Claude Prompt - Conflict Viewer UI

Do not use until MOD1 and folder scanning pass.

```markdown
Design a read-only Mod Conflict Viewer for LoreRelay.

Read:

1. `docs/MOD_SYSTEM_DESIGN.md`
2. `docs/MOD_SYSTEM_CHATGPT_GATE.md`
3. MOD1 implementation and tests
4. Webview module conventions

Goal:

- show enabled mods in load order
- show exact record conflicts
- show winner and overridden mods
- show missing dependencies
- show similar-ID warnings

Do not implement:

- drag/drop persistence
- workspace import/apply
- executable mods
- remote downloads
- automatic ID remap
```

