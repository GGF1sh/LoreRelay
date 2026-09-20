# Settlement Mode ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for M1 with constraints

This gate resolves the contract and security questions for Settlement Mode M1.
Use this file as the authoritative handoff for Grok M1 implementation.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | None, if M1 stays within the limited contract below. | Proceed with M1 only. |
| High | Embedding settlement state in `world_state.json` would increase contention with Observatory, Living World, market, and quest hook writes. | Use independent `settlement_state.json`. |
| High | Automatic mirroring between `settlement_state.stocks` and `campaign_resources.json` would create double-ledger ambiguity. | No automatic mirror in M1. GM prompt may mention that synchronization is narrative/manual. |
| High | Full `turn_result.settlementOps` apply wiring would enlarge the write surface before the data contract is proven. | M1 includes parser/type/stub only. Persistence wiring waits for M1.5 or M2. |
| High | Settlement data can leak hidden rooms, stockpiles, visitors, merchants, or incidents through prompt, Webview, replay export, or remote play. | M1 must include a prompt-safe formatter. Webview/replay/remote sanitizers are M2 blockers before public UI exposure. |
| Medium | Large settlement ledgers can crowd out lore, vision, and recent-turn context. | M1 prompt chunk must be capped, priority-bounded, and feature-flag gated. |
| Medium | Settlement stocks and campaign resources describe different scopes but may use similar names. | Treat settlement stocks as site supplies; treat campaign resources as party/campaign resources. No automatic conversion. |
| Medium | Optional layout data can accidentally become a full tile sim. | `settlement_layout.json` stays optional and zone/marker based. No full grid persistence in M1. |
| Low | Limited Z layers can invite over-design. | M1 only models layer IDs and validation. No digging/mining/pathfinding simulation. |

## Final M1 Contract

### Canonical Files

M1 may introduce:

- `settlement_state.json`
- Optional `settlement_layout.json` contract/types only if useful for tests

M1 must not embed settlement state in `world_state.json`.

### Feature Flag

Add or support:

```json
{
  "enableSettlementMode": false
}
```

When the flag is false:

- no settlement prompt chunk is emitted
- no settlement files are created as a side effect of normal play
- no settlement turn ops are applied

### `settlement_state.json` v1

Recommended shape:

```ts
type SettlementStateV1 = {
  version: 1;
  settlementId: string;
  name: string;
  worldTurn?: number;
  locationId?: string;
  morale?: number;
  safety?: number;
  stocks: SettlementStock[];
  structures: SettlementStructure[];
  residents: SettlementResident[];
  visitors: SettlementVisitor[];
  merchants: SettlementMerchant[];
  incidents: SettlementIncident[];
  notes?: string[];
  updatedAt?: string;
};
```

Rules:

- IDs use the existing LoreRelay safe ID style: lower-case ASCII, digits,
  `_`, `-`, and bounded length.
- Numeric scores are clamped to `0..100` unless a narrower field-specific range
  is chosen by implementation.
- Arrays are capped. M1 recommended caps:
  - stocks: 80
  - structures: 80
  - residents: 80
  - visitors: 40
  - merchants: 20
  - incidents: 80
  - notes: 40
- Free text is length capped and stripped of control characters.
- Parser must be tolerant: malformed optional entries are dropped, not fatal.
- Required top-level parse failure returns a safe empty/default settlement object
  or a structured failure result, following existing project patterns.

### `settlement_layout.json` v1

M1 may define the contract, but should not build UI around it yet.

Recommended shape:

```ts
type SettlementLayoutV1 = {
  version: 1;
  settlementId: string;
  layers: SettlementLayer[];
  zones: SettlementZone[];
  markers: SettlementMarker[];
};
```

Rules:

- Supported layer IDs: `z1`, `z0`, `z-1`, `z-2`.
- Zones and markers must be capped.
- Coordinates are abstract display coordinates, not physics tiles.
- No full tile array in M1.

### Settlement Tick

M1 may include a pure deterministic tick helper.

Allowed:

- consume abstract stock amounts
- expire visitors/merchants/incidents by turn
- clamp morale/safety
- emit structured warnings/events for prompt use

Not allowed:

- pathfinding
- construction simulation
- mining/digging
- autonomous NPC scheduling
- automatic campaign resource conversion

### Settlement Prompt Chunk

M1 should include a prompt-safe formatter such as
`buildSettlementPromptContext(...)`.

Requirements:

- emits nothing when feature flag is false
- bounded output length
- no raw JSON dump
- no hidden layout or FoW-sensitive details
- summarizes stocks, safety/morale, notable structures, active visitors,
  active merchants, and unresolved incidents
- includes a caution line that settlement stocks are not automatically synced
  with campaign resources

### Future `turn_result.settlementOps`

M1 may add types and parser stubs only.

Allowed stub ops:

- `set_score`
- `adjust_stock`
- `add_incident`
- `resolve_incident`
- `add_visitor`
- `remove_visitor`
- `add_merchant`
- `remove_merchant`
- `add_structure_note`

M1 must not apply these ops to disk unless the implementation includes a
separate follow-up gate and tests.

## Grok M1 Implementation Checklist

Implement only the M1 slice:

1. Add `src/settlementCore.ts`.
2. Add parser, validators, clamp helpers, array caps, text sanitizer, and safe
   default behavior.
3. Add pure tick helper for stock consumption and visitor/merchant/incident
   expiry.
4. Add prompt-safe formatter gated by `enableSettlementMode`.
5. Add `settlementOps` type/parser stubs only.
6. Add `src/settlementState.ts` I/O wrapper only if needed, following existing
   atomic write and workspace path patterns.
7. Add tests in `scripts/test_settlement_core.js`.
8. Hook the test into `scripts/run_all_tests.js` or the repository's current
   test aggregator.
9. Update `CHANGELOG.md` Unreleased and `AI_SHARED_LOG.md`.

## M1 Non-Goals

- No Webview settlement UI.
- No isometric renderer.
- No Three.js or 3D renderer.
- No full tile grid persistence.
- No pathfinding.
- No digging/mining/geology simulation.
- No automatic sync to `campaign_resources.json`.
- No full settlementOps persistence.
- No remote play exposure.
- No replay export exposure.

## Acceptance Tests

Required tests:

- invalid IDs are rejected or normalized safely
- invalid numbers are clamped
- arrays are capped
- malformed entries are dropped without crashing
- tick consumes stocks deterministically
- visitors/merchants/incidents expire deterministically
- prompt chunk is empty when `enableSettlementMode` is false
- prompt chunk is bounded when enabled
- settlement stocks do not mutate campaign resources
- settlementOps parser rejects unknown ops and unsafe values

Required verification:

```powershell
npm run compile
node scripts/test_settlement_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Handoff To Grok

Use:

1. `docs/SETTLEMENT_MODE_AI_PROMPTS.md` section 2
2. this file
3. `docs/SETTLEMENT_MODE_DESIGN.md`

The key instruction is: implement the smallest safe M1 pure core, prove it with
tests, and do not start UI or isometric work yet.
