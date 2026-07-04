# Settlement Mode M5 ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for **M5a pure diorama snapshot only**. M5b Three.js renderer
requires a second post-M5a gate.

This gate reviews:

1. `docs/SETTLEMENT_MODE_DESIGN.md` sections 7.4 and M5
2. `docs/SETTLEMENT_MODE_M3_DESIGN.md` (M3a/M3b split)
3. `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md` (Webview boundary)
4. `docs/SETTLEMENT_MODE_M5_DESIGN.md`

M5 is a dream track, default OFF.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | A Three.js view can accidentally become a second canonical settlement model. | M5a must derive from the existing sanitized M3 `SettlementViewSnapshot`; M5b renders only `SettlementDioramaSnapshot`. No raw settlement JSON in renderer. |
| Critical | Webview-side 3D controls can become a building editor. | M5b is read-only. No tile edits, no drag-build, no layer expansion, no `settlementOps`, no direct disk writes. |
| High | M5 can add weight to normal Settlement Mode. | Add dedicated `enableSettlementDiorama`, default OFF. Do not compute or send `settlementDiorama` when OFF. |
| High | Three.js can widen the asset/security surface. | M5b may use a bundled Three.js file only. No external models, textures, shader strings, or remote asset URLs in initial scope. |
| High | Diorama payload could leak data excluded by M3 sanitization. | M5a input is M3 `SettlementViewSnapshot`, not `settlement_state.json` / `settlement_layout.json`. Apply allow-list keys and caps again. |
| Medium | Low-poly primitives can grow into a full tile/world renderer. | Cap blocks/markers/labels. Render selected layer only. No full map, no remote/replay initial scope. |
| Medium | Camera controls can become first-person/exploration mechanics. | Fixed or limited orbit camera only. No free fly, no first-person movement, no click-to-move. |
| Medium | Labels may reintroduce unsafe text. | Clamp and strip labels; no hidden IDs, raw stock numbers, or prompt-only data. |
| Low | M5 could supersede the stable Canvas view too early. | M3 Canvas remains the primary view. Diorama mode is optional and hidden if unsupported. |

## Gate Verdict

Approved for M5a only:

- pure `settlementDioramaCore.ts`;
- derives from sanitized M3 `SettlementViewSnapshot`;
- outputs capped `SettlementDioramaSnapshot`;
- no `vscode`, no `fs`, no DOM, no Three.js;
- no persistence;
- tests required before any M5b Webview work.

Blocked until a later gate:

- Three.js renderer implementation;
- vendor asset wiring;
- Webview Diorama mode;
- remote/replay diorama payloads;
- GM action/request buttons from diorama;
- textures/models/shaders.

## Final M5a Contract

Implement a pure module:

```ts
// src/settlementDioramaCore.ts
export function buildSettlementDioramaSnapshot(
  inputs: SettlementDioramaInputs
): SettlementDioramaSnapshot | undefined;
```

Input:

```ts
type SettlementDioramaInputs = {
  view?: SettlementViewSnapshot;
  options?: {
    maxBlocks?: number;
    maxMarkers?: number;
    maxLabels?: number;
    theme?: SettlementDioramaTheme;
    includeLabels?: boolean;
  };
};
```

Rules:

- if `view` is missing, return `undefined`;
- do not read files;
- do not import `vscode`;
- do not import Three.js;
- do not mutate `view`;
- do not include raw canonical JSON;
- derive block/marker coordinates from M3 tile/marker coordinates;
- clamp all numeric values;
- map M3 tile codes to a closed material union;
- cap blocks/markers/labels deterministically;
- warnings are bounded strings;
- same input produces identical output.

Required output shape:

```ts
type SettlementDioramaSnapshot = {
  version: 1;
  settlementId: string;
  name: string;
  layerId: SettlementLayerId;
  bounds: { width: number; depth: number; height: number };
  camera: SettlementDioramaCamera;
  blocks: SettlementDioramaBlock[];
  markers: SettlementDioramaMarker[];
  labels?: SettlementDioramaLabel[];
  palette: SettlementDioramaPalette;
  warnings?: string[];
};
```

All object shapes must have allow-list pickers or equivalent sanitizer tests.

## M5b Future Gate Requirements

Do not implement M5b until M5a passes tests and this separate review happens.

The future M5b gate must verify:

- `enableSettlementDiorama` default OFF and respected by host/Webview;
- Three.js is bundled locally or gracefully unavailable;
- Webview module has no `fs`, workspace path, `writeJsonAtomic`, `settlementOps`,
  or `insertChatText` in initial M5b;
- no external model/texture/shader loading;
- limited orbit camera only;
- no state writes from pointer/keyboard controls;
- renderer initializes and disposes without leaking animation loops;
- fallback text panel exists when WebGL/Three.js is unavailable.

## Required M5a Tests

Add:

```text
scripts/test_settlement_diorama_core.js
```

Required cases:

- no `view` returns `undefined`;
- valid M3 snapshot creates bounded blocks/markers;
- same input deterministic;
- input snapshot not mutated;
- top-level/block/marker/label keys are allow-listed;
- numeric values are finite and clamped;
- labels are clamped and control characters stripped;
- material mapping is closed;
- caps produce warnings;
- no raw stock quantities or unexpected fields leak.

Register the test in the unified test runner.

## Required Verification

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_settlement_view_core.js
node scripts/test_settlement_diorama_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Non-Goals

- No Three.js in M5a.
- No Webview code in M5a.
- No state writes.
- No `settlement_layout.json` edits.
- No layer expansion.
- No tile editor.
- No pathfinding.
- No physics.
- No remote/replay payload changes.
- No GM prompt changes.

## Copy-paste Prompt For Grok/Codex M5a

```markdown
You are implementing Settlement Mode M5a for LoreRelay.

Read first:

1. `docs/SETTLEMENT_MODE_M5_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`
3. `docs/SETTLEMENT_MODE_M3_DESIGN.md`
4. `src/settlementViewCore.ts`
5. `scripts/test_settlement_view_core.js`

Implement M5a only:

- `src/settlementDioramaCore.ts`
- pure `buildSettlementDioramaSnapshot()`
- capped `SettlementDioramaSnapshot` from sanitized `SettlementViewSnapshot`
- allow-list pickers/sanitizers
- `scripts/test_settlement_diorama_core.js`
- test runner registration

Do not implement:

- Three.js
- Webview Diorama mode
- vendor assets
- persistence
- settlementOps
- insertChatText
- remote/replay changes
- prompt changes

Verification:

- `npm run compile`
- `node scripts/test_settlement_view_core.js`
- `node scripts/test_settlement_diorama_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update `CHANGELOG.md` and `AI_SHARED_LOG.md`.
Commit only intentional files.
```

## Handoff

If M5a implementation passes this gate, run a new ChatGPT/Codex review before
Claude starts M5b. The Three.js renderer is intentionally not approved by this
gate.
