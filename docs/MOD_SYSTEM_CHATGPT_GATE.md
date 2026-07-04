# Mod System ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for **MOD1 pure resolver only**.

This gate reviews:

1. `docs/MOD_SYSTEM_DESIGN.md`
2. Existing LoreRelay package/scenario patterns
3. Existing pure-core and apply-gate conventions

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | Mod systems can become arbitrary code execution. | MOD1 is data-only pure resolution. No scripts, commands, VS Code commands, or runtime remote assets. |
| Critical | Applying mods can overwrite campaign state. | MOD1 does not write workspace files. Import/apply requires a later gate and user confirmation. |
| High | Silent ID auto-remap can corrupt campaigns. | Similar IDs warn only. Exact conflicts use load order. Explicit aliases require later compatibility patch gate. |
| High | Load order conflicts can be invisible. | MOD1 must produce conflict reports with winner/overridden mods. |
| High | Schema-blind merges can corrupt records. | MOD1 supports replace/later-wins only. Append/patch/delete require later gates. |
| Medium | Dependency order can create confusing failures. | Missing dependencies and dependency cycles must be reported. |
| Medium | Prompt mods can become prompt injection. | Prompt snippets are data records only in MOD1; no injection wiring. |
| Low | Users expect MO2-like behavior. | Use high-level virtual overlay/load-order patterns only; do not copy code/UI/formats. |

## Gate Verdict

Approved for MOD1:

- `src/modSystemCore.ts`
- parse manifests;
- parse profiles/load order;
- resolve virtual records;
- conflict reports;
- dependency warnings;
- tests.

Blocked until later gates:

- file scanning;
- Webview UI;
- drag/drop load order writes;
- profile persistence;
- workspace import/apply;
- compatibility alias application;
- append/patch/delete merge strategies;
- executable mods;
- remote downloads.

## Final MOD1 Contract

Implement:

```ts
// src/modSystemCore.ts
export function parseModManifest(input: unknown): ParsedModManifest | undefined;
export function parseModProfile(input: unknown): ModProfile;
export function resolveModProfile(input: ModResolveInput): ModResolveResult;
```

Rules:

- pure TypeScript only;
- no `vscode`;
- no `fs`;
- no DOM;
- deterministic output;
- no input mutation;
- closed unions normalized;
- manifests and profile arrays capped;
- exact `domain + id` conflict: later load order wins;
- conflict report includes winner and overridden mods;
- similar IDs create warning only;
- no silent auto-remap;
- dependency missing/cycle warnings;
- no workspace writes.

## Required MOD1 Tests

Add:

```text
scripts/test_mod_system_core.js
```

Required cases:

- invalid manifest rejected safely;
- valid manifest parsed;
- disabled mod ignored;
- priority/load order later wins exact conflict;
- conflict report lists winner and overridden mods;
- missing dependency reported;
- dependency cycle reported;
- similar IDs warn but do not remap;
- alias rule parsed but not applied;
- output deterministic;
- input not mutated.

## Required Verification

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_mod_system_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Copy-paste Prompt For Grok/Codex MOD1

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

## Handoff

After MOD1 passes, run a second gate for local mod folder scanning and a third
gate for any workspace import/apply behavior.

