# Settlement Mode AI Prompts

Use this file to dispatch the Settlement Mode / StoneSense-style View work to
other AI agents. This is a coordination document only; it is not an
implementation spec by itself.

Primary design document:

- `docs/SETTLEMENT_MODE_DESIGN.md`

Current repository baseline:

- `package.json` version: `1.63.0`
- Current priority: design gate first, M1 implementation only after the gate.

## 0. Common Header

Paste this before any role-specific prompt:

```markdown
LoreRelay v1.62.0 handoff.

Before working, read these files in order:

1. `AI_HANDOVER.md`
2. `AI_ROADMAP.md`
3. `AI_SHARED_LOG.md` Current Snapshot and recent entries
4. `CHANGELOG.md` `[1.62.0]` through `[1.45.0]` if needed
5. `docs/CAMPAIGN_KIT_DESIGN.md`
6. `docs/SETTLEMENT_MODE_DESIGN.md`
7. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`, if it exists

Task constraints:

- Do not copy code, schemas, data, sprites, names, or prose from Dwarf Fortress,
  DFHack, StoneSense, Cataclysm: Dark Days Ahead, RimWorld, RimTalk, or other
  reference projects.
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

Use this only after `docs/SETTLEMENT_MODE_CHATGPT_GATE.md` exists.

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
3. `src/tileOvermapCore.ts`
4. `webview/modules/86-tile-overmap.js`
5. `webview/modules/85-world.js`
6. M1 settlement core files, if implemented

Task:

Design M2/M3 without mutating canonical state.

Deliver:

1. A UI design for:
   - settlement panel
   - 2D overlay strengthening
   - StoneSense-style isometric view
   - layer selector `Z+1 / Z0 / Z-1 / Z-2`
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

## 4. Gemini Prompt - User-Facing Design and Positioning

```markdown
You are the documentation and product positioning reviewer for LoreRelay.

Read:

1. `docs/SETTLEMENT_MODE_DESIGN.md`
2. `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`
3. `docs/CAMPAIGN_KIT_DESIGN.md`
4. `README.md`
5. `docs/FEATURE_MATRIX.md`

Task:

Produce user-facing wording for Settlement Mode:

- short description
- "not a full colony sim" caveat
- Dwarf Fortress / CDDA / RimTalk inspiration without implying clone/copy
- how it connects to Campaign Kit, In-World Chat, Living World, and World
  Observatory
- screenshot/GIF plan for a future demo

Do not edit code.
Do not overpromise 3D.
```

## 5. Recommended Order

1. Codex/ChatGPT: run the gate directly and save
   `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`.
2. Grok: M1 pure core implementation using the gate file.
3. Codex/ChatGPT: implementation gate after Grok finishes.
4. Claude: M2/M3 UI plan.
5. Grok or Claude: M2/M3 implementation after M1 stabilizes.
6. Gemini: README and screenshot plan.

Do not start with M3 or M5. Start with M1.
