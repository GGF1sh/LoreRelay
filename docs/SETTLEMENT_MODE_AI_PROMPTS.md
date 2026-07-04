# Settlement Mode AI Prompts

Use this file to dispatch the Settlement Mode / StoneSense-style View work to
other AI agents. This is a coordination document only; it is not an
implementation spec by itself.

Primary design document:

- `docs/SETTLEMENT_MODE_DESIGN.md`

Current repository baseline:

- `package.json` version: `1.73.0`
- M5 complete on `main` (M5a/M5b/host wiring + 3-AI review fixes + lazy load)
- M4c UX **Approved** (`ff86f60`). M2 replay/remote overlay wiring complete

## 0. Common Header

Paste this before any role-specific prompt:

```markdown
LoreRelay v1.73.0 handoff.

Before working, read these files in order:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `CHANGELOG.md` `[1.62.0]` through `[1.45.0]` if needed
5. `docs/CAMPAIGN_KIT_DESIGN.md`
6. `docs/SETTLEMENT_MODE_DESIGN.md`
7. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`, if it exists
8. `docs/SETTLEMENT_REFERENCE_PATTERNS.md`, if working on M2+
9. `docs/SETTLEMENT_MODE_M2_DESIGN.md`, if working on M2+
10. `docs/SETTLEMENT_MODE_M3_DESIGN.md`, if working on M3+
11. `docs/SETTLEMENT_MODE_M4_DESIGN.md`, if working on M4+
12. `docs/SETTLEMENT_MODE_M4B_CHATGPT_GATE.md`, if working on M4b persistence
13. `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`, if working on M4 UX or post-UX gate

Task constraints:

- Do not copy code, schemas, data, sprites, names, or prose from Dwarf Fortress,
  DFHack, StoneSense, Cataclysm: Dark Days Ahead, RimWorld, RimTalk,
  Caves of Qud, Kenshi, or other reference projects.
- Extract only high-level design patterns.
- LoreRelay canonical state must remain JSON + `*Core.ts` pure functions +
  explicit turn ops.
- Renderers are read-only and replaceable.
- Feature flags default OFF.
- Do not implement full colony simulation, full pathfinding, a freeform tile
  editor, or 3D in the first slice.
```

## 1. Codex/ChatGPT Gate - Contract and Security Review

This gate is for the current ChatGPT/Codex session. If you are already using
ChatGPT/Codex, do **not** paste this prompt elsewhere just because the old file
said "ChatGPT Prompt". Execute the gate directly and save the result as:

- `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`

Use the copy-paste block below only when delegating the gate to another
ChatGPT/Codex chat.

Grok pre-review consensus to confirm or override:

1. `settlement_state.json` should be an independent ledger, not embedded in
   `world_state.json`.
2. M1 should include `settlementOps` only as a parser/contract stub. Full
   `turn_result` persistence wiring should wait for M1.5 or M2.
3. M1 should not automatically mirror `settlement_state.stocks` to
   `campaign_resources.json`.
4. The gate must decide which sanitization belongs in M1 and which can wait for
   M2: GM prompt, Webview, replay export, and remote play.

Direct output requirements:

1. Create or update `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`.
2. Include a Critical / High / Medium / Low findings table.
3. Include the final M1 data contract.
4. Include a Grok-ready M1 implementation checklist.
5. Include M1 non-goals.
6. Include acceptance tests and verification commands.

### Copy-Paste Prompt For Another ChatGPT/Codex Session

```markdown
You are the contract and security gate reviewer for LoreRelay's Settlement Mode
/ StoneSense-style View design.

Read these files first:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `CHANGELOG.md` `[1.62.0]` through `[1.45.0]` if needed
5. `docs/CAMPAIGN_KIT_DESIGN.md`
6. `docs/SETTLEMENT_MODE_DESIGN.md`
7. `docs/SETTLEMENT_MODE_AI_PROMPTS.md`

Constraints:

- Do not copy code, schemas, data, sprites, names, or prose from reference
  projects.
- Extract only high-level design patterns.
- LoreRelay canonical state must remain JSON + `*Core.ts` pure functions +
  explicit turn ops.
- Renderers are read-only and replaceable.
- Feature flags default OFF.
- Do not implement code in this gate.

Grok pre-review consensus:

1. `settlement_state.json` as an independent ledger is preferred.
2. M1 should include `settlementOps` only as a parser/contract stub.
3. M1 should not automatically mirror `settlement_state.stocks` to
   `campaign_resources.json`.
4. Decide which sanitization belongs in M1 versus M2.

Review targets:

- `settlement_state.json` v1
- optional `settlement_layout.json` v1
- future `turn_result.settlementOps`
- Settlement GM prompt chunk
- `settlementViewCore` snapshot boundary
- boundaries with Campaign Kit, campaign resources, discoveries, and
  `world_state.json`

Please produce:

1. Critical / High / Medium / Low findings table
2. Final M1 data contract
3. Grok-ready M1 implementation checklist
4. M1 non-goals
5. Acceptance criteria and test items

Do not write code.
```

## 2. Grok Prompt - M1 Pure Core Implementation

M1 is already implemented in the current baseline. Use this prompt only for
regression repair, rework, or if rebuilding the M1 slice on another branch.

```markdown
You are implementing Settlement Mode M1 for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_DESIGN.md`
2. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`
3. Existing patterns:
   - `src/campaignKitCore.ts`
   - `src/campaignResourcesCore.ts`
   - `src/worldStateCore.ts`
   - `src/workspaceStateQueue.ts`
   - `scripts/run_all_tests.js`

Implement only M1.

Scope:

- Add `src/settlementCore.ts` pure parser/helpers.
- Add `src/settlementState.ts` I/O wrapper only if needed by the gate.
- Add optional `settlement_state.json` support.
- Add feature flag support in `game_rules.json`:
  - `enableSettlementMode`: default false
- Add tests:
  - parser clamps invalid input
  - arrays are capped
  - IDs are validated
  - tick consumes resources deterministically
  - visitors/merchants expire deterministically
  - feature OFF means no settlement prompt chunk is emitted
  - no automatic mirror to `campaign_resources.json`

Do not implement:

- Webview UI
- isometric renderer
- Three.js
- full tile map storage
- full settlementOps persistence beyond contract stubs unless the gate
  explicitly requires it

Required verification:

- `npm run compile`
- `node scripts/test_settlement_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update:

- `CHANGELOG.md` Unreleased
- `AI_SHARED_LOG.md`

Commit only the files you intentionally changed.
```

## 3. Claude Prompt - M2/M3 UI Design, No Core Mutation

Use after M1 exists.

```markdown
You are the Webview and visualization engineer for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_DESIGN.md`
2. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`
3. `docs/SETTLEMENT_REFERENCE_PATTERNS.md`
4. `src/tileOvermapCore.ts`
5. `webview/modules/86-tile-overmap.js`
6. `webview/modules/85-world.js`
7. M1 settlement core files

Task:

Design M2/M3 without mutating canonical state.

Deliver:

1. A UI design for:
   - settlement panel
   - 2D overlay strengthening
   - StoneSense-style isometric view
   - layer selector `Z+1 / Z0 / Z-1 / Z-2`
   - Kenshi-like caravan/merchant/faction pressure markers
   - Qud-like discovery/appraisal markers without copying content
2. A proposed `settlementViewCore.ts` snapshot shape.
3. Webview implementation plan:
   - canvas renderer
   - pan/zoom
   - fallback glyph/sprite
   - marker caps
   - localStorage view preferences
4. Test plan:
   - webview bundle symbols
   - DOM smoke
   - snapshot caps

Do not implement yet unless explicitly told.
Do not use Three.js for M3.
Do not add state writes from tile clicks.
```

## 4. Grok Prompt - M2 Pure Cores + Tests

Use this after `docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md` exists.

```markdown
You are implementing Settlement Mode M2 pure cores for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_M2_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`
3. `src/tileOvermapCore.ts`
4. `src/campaignLedgerWebviewSanitizeCore.ts`
5. `src/settlementCore.ts`
6. `src/worldView.ts`

Implement only:

- `src/mapOverlayCore.ts`
- `src/settlementEventCore.ts`
- tests for both modules
- thin `worldView` payload wiring for `mapOverlay` only after pure tests pass

Do not implement:

- Webview marker rendering
- isometric rendering
- Z-layer operations
- settlementOps disk application
- state writes from map clicks
- real-time NPC movement/pathfinding
- full economy simulation

M2a rules:

- map overlays are derived, non-persisted, never in GM prompt
- all Webview/replay/remote overlay payloads must come from
  `buildMapOverlaySnapshot`
- enforce marker key allow-list
- enforce FoW degradation
- no raw stock quantities, hidden-room IDs, exact danger values, unidentified
  discovery labels, or secret NPC movements

M2b rules:

- `settlementEventCore` returns candidates only
- no disk write
- no input mutation
- no `turn_result` apply wiring
- no campaign resource sync

Required verification:

- `npm run compile`
- `node scripts/test_map_overlay_core.js`
- `node scripts/test_settlement_event_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update:

- `CHANGELOG.md` Unreleased
- `AI_SHARED_LOG.md`

Commit only the files you intentionally changed.
```

## 5. Gemini Prompt - User-Facing Design and Positioning

```markdown
You are the documentation and product positioning reviewer for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_DESIGN.md`
2. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`
3. `docs/SETTLEMENT_REFERENCE_PATTERNS.md`
4. `docs/CAMPAIGN_KIT_DESIGN.md`
5. `README.md`
6. `docs/FEATURE_MATRIX.md`

Task:

Produce user-facing wording for Settlement Mode:

- short description
- "not a full colony sim" caveat
- Dwarf Fortress / CDDA / RimTalk / Caves of Qud / Kenshi inspiration without
  implying clone/copy
- how it connects to Campaign Kit, In-World Chat, Living World, and World
  Observatory
- screenshot/GIF plan for a future demo

Do not edit code.
Do not overpromise 3D.
```

## 6. Grok/Codex Prompt - M3a Settlement View Snapshot

Use this after `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md` exists.

```markdown
You are implementing Settlement Mode M3a for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_M3_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`
3. `src/settlementCore.ts`
4. `src/settlementState.ts`
5. `src/mapOverlayCore.ts`
6. existing pure-core tests

Implement only M3a:

- `src/settlementViewCore.ts`
- `scripts/test_settlement_view_core.js`
- test aggregator wiring

Do not implement:

- Webview Canvas renderer
- World tab mode button
- Three.js
- Z-layer expansion
- settlementOps disk apply
- tile editing
- pathfinding
- state writes from clicks

Rules:

- build a sanitized `SettlementViewSnapshot`
- support optional `settlement_layout.json`
- if layout is absent, derive a deterministic fallback layout with a warning
- enforce tile/marker/top-level allow-lists
- selected layer filters tiles and markers
- no prompt generation
- no disk writes
- no mutation of input state/layout

Required verification:

- `npm run compile`
- `node scripts/test_settlement_view_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update:

- `CHANGELOG.md` Unreleased
- `AI_SHARED_LOG.md`

Commit only the files you intentionally changed.
```

## 7. Claude Prompt - M3b Canvas Isometric Renderer

Use after M3a exists and passes tests.

```markdown
You are implementing Settlement Mode M3b Webview rendering for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_M3_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`
3. `src/settlementViewCore.ts`
4. `webview/modules/85-world.js`
5. `webview/modules/86-tile-overmap.js`
6. existing webview build conventions

Implement only M3b:

- add Settlement map mode to the World tab
- render `settlementView` snapshot on Canvas
- layer selector `Z+1 / Z0 / Z-1 / Z-2`
- pan/zoom/reset controls
- hover/select read-only detail
- ASCII-safe fallback glyphs/labels
- webview bundle/smoke tests

Do not implement:

- canonical state changes
- tile editing
- settlementOps disk apply
- Z-layer generation
- Three.js
- pathfinding
- GM prompt tile-grid injection

Clicks must not write state. View preferences may use localStorage only.
```

## 8. Recommended Order

1. Codex/ChatGPT: keep `docs/SETTLEMENT_MODE_CHATGPT_GATE.md` as the M1
   contract and use it for implementation review.
2. Claude: M2 design plan using `docs/SETTLEMENT_REFERENCE_PATTERNS.md`.
3. Codex/ChatGPT: run `docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`.
4. Grok: M2 pure cores + tests.
5. Codex/ChatGPT: implementation gate after Grok finishes.
6. Claude: Webview marker rendering after pure-core gate passes.
7. Codex/ChatGPT: run `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`.
8. Grok/Codex: M3a `settlementViewCore.ts` + tests.
9. Claude: M3b Canvas renderer after M3a passes.
10. Codex/ChatGPT: run `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`.
11. Grok/Codex: M4a bounded layer expansion pure core + tests.
12. Codex/ChatGPT: M4b apply gate before any persistence wiring.
13. Grok/Codex: M4b persistence wiring after M4b gate approval.
14. Claude: M4 UX preview/request flow after M4b is on `main`.
15. Codex/ChatGPT: M4c UX gate after Claude delivery.
16. Gemini: README and screenshot plan.
17. Grok/Codex: M2 replay/remote overlay wiring after M4c gate.

Do not start with M5. M1 is the foundation; M2 should strengthen the 2D map
before M3 isometric work. M3 should produce a read-only snapshot before Webview
rendering. M4 may create layers only through bounded operations; persistence is
separate from the pure expansion core.

## 9. Grok/Codex Prompt - M4a Limited Layer Expansion Pure Core

Use this after `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md` exists.

```markdown
You are implementing Settlement Mode M4a for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`
3. `src/settlementCore.ts`
4. `docs/SETTLEMENT_MODE_M3_DESIGN.md`
5. existing pure-core tests

Implement M4a only:

- bounded in-memory layer expansion core
- `expand_layer` parser/type support only if it remains a non-persistent stub
- deterministic profile templates
- `scripts/test_settlement_layer_expansion_core.js`
- test aggregator wiring

Do not implement:

- disk persistence
- turn_result apply wiring
- direct Webview writes
- tile editor
- pathfinding
- mining/geology simulation
- Three.js / 3D
- combined game/world/settlement writes

Rules:

- valid layer IDs only: `z1`, `z0`, `z-1`, `z-2`
- one op adds at most one missing layer
- existing layer is a no-op
- preserve existing zones/markers
- never create a full tile array
- cap layers/zones/markers
- deterministic for same input
- no mutation of input layout/state/op

Required verification:

- `npm run compile`
- `node scripts/test_settlement_layer_expansion_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`

Update:

- `CHANGELOG.md` Unreleased
- `AI_SHARED_LOG.md`

Commit only the files you intentionally changed.
```

## 10. Codex/ChatGPT Prompt - M4b Apply Gate

Use this only after M4a exists and passes tests.

```markdown
You are reviewing whether LoreRelay may persist `settlementOps.expand_layer`.

Read:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md`
2. `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`
3. M4a implementation files and tests
4. existing workspace write queue / atomic write / circuit breaker patterns

Do not write code.

Produce:

- finding table
- final M4b persistence contract
- allowed write target(s)
- rollback/failure behavior
- required tests
- explicit non-goals

Default stance: do not approve persistence unless write path is narrow,
queue-backed, and writes only `settlement_layout.json`.
```

Gate output (2026-07-04): `docs/SETTLEMENT_MODE_M4B_CHATGPT_GATE.md` — **approved**
for M4b persistence (`expand_layer` only). Use that file as the Grok M4b implementation
contract.

## 11. Claude Prompt - M4c UX Preview / Request Flow

Use this after M4b is merged and pushed on `main` (`af24e9e`, `0b8bbb1`).

```markdown
You are implementing Settlement Mode M4c UX for LoreRelay — preview and GM request
only. Persistence already exists in M4b; do not add a second write path.

Read first:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md` (especially §7 Webview / UX Boundary)
2. `docs/SETTLEMENT_MODE_M4B_CHATGPT_GATE.md`
3. `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md` (review checklist you must satisfy)
4. `src/settlementLayerExpansionCore.ts` — `applyExpandLayerToLayout()` for ghost preview
5. `src/worldView.ts` — `settlementView` payload wiring
6. `webview/modules/86b-settlement-isometric.js` — M3b Canvas renderer
7. `webview/modules/85-world.js` — `postWorldInsertChatText` / `insertChatText` pattern
8. `src/settlementLayoutTurnOps.ts` — M4b persist path (read only; do not duplicate)

## Goal

Let the player **see** what a missing layer would look like and **ask the GM** to
emit `turn_result.settlementOps.expand_layer`. The GM turn + M4b ledger handles
actual persistence.

## Implement

### A. Missing-layer discovery UI

In Settlement / World tab isometric view:

- Detect which of `z1`, `z0`, `z-1`, `z-2` are **not** in current layout
- Show bounded action buttons, e.g.:
  - "Request cellar" → `layerId: z-1`, `profile: cellar`
  - "Request watch platform" → `layerId: z1`, `profile: watchtower`
  - "Request roof access" → `layerId: z1`, `profile: roof`
- Hide expansion UI when `enableSettlementMode` is OFF

### B. Ghost preview (read-only)

- For a selected missing layer, show a **visually distinct** ghost overlay
  (dimmed / dashed zones or markers) derived from `applyExpandLayerToLayout()`
- Preferred: compute preview in extension (`worldView.ts`) and send via
  `settlementView.expansionPreviews[]` or equivalent — Webview renders only
- Do not write `settlement_layout.json` or any canonical file for preview

### C. GM request channel

On confirm/request button:

- `vscode.postMessage({ type: 'insertChatText', text })` only
- Request text must ask GM for `settlementOps.expand_layer` with explicit
  `layerId`, `profile`, short `reason`
- Allowed layer IDs: `z1`, `z0`, `z-1`, `z-2` only
- Allowed profiles: `cellar`, `waterworks`, `shelter`, `ruins`, `roof`,
  `watchtower`, `generic`

### D. i18n

Add user-facing strings to all four locale files.

## Do NOT implement

- Webview disk writes or new persistence handlers
- Direct `settlement_layout.json` mutation from UI
- `settlementOps` apply from Webview (no bypass of GM turn)
- Non-`expand_layer` settlement ops
- Tile editor, click-to-dig, drag-build, pathfinding, 3D
- Changes to M4b ledger / `tryApplySettlementLayoutTurnOps` behavior

## Tests

- Extend `scripts/test_webview_world_modules.js` if new settlement UX symbols/handlers added
- Do not break existing settlement isometric smoke
- Run full suite:

```powershell
npm run compile
node scripts/test_settlement_layer_expansion_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Docs

- `CHANGELOG.md` Unreleased
- `AI_SHARED_LOG.md`

Commit only files you intentionally changed.
```

## 12. Codex/ChatGPT Prompt - M4c UX Gate (post-Claude)

Run after Claude delivers M4 UX. Do not write code unless blocking issues require
a minimal fix list for Grok.

```markdown
Review Claude's M4 UX preview/request flow against:

1. `docs/SETTLEMENT_MODE_M4_DESIGN.md` §7
2. `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`
3. Changed Webview / worldView / handler files
4. M4b persistence files (must be unchanged except i18n-safe imports)

Verify checklist items 1–15 in the M4c gate doc.

Produce:

- findings table (severity / finding / decision)
- pass or block verdict
- if block: minimal fix list for Claude or Grok (no scope creep)

Default stance: block if Webview touches disk, applies settlementOps, or widens
beyond `expand_layer` request text.
```

## 13. Codex/ChatGPT Gate - M5 Low-poly Diorama

Gate output (2026-07-04): `docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md` - **approved
for M5a pure diorama snapshot only**. M5b Three.js renderer requires a later
post-M5a gate.

## 14. Grok/Codex Prompt - M5a Pure Diorama Snapshot

Use this after `docs/SETTLEMENT_MODE_M5_DESIGN.md` and
`docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md` exist.

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
