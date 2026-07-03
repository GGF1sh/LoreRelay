# Settlement Mode M2 ChatGPT Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT
Status: Approved for implementation with constraints

This gate reviews `docs/SETTLEMENT_MODE_M2_DESIGN.md`, focusing on the M2a
sanitize/FoW contract and the M2b pure selector boundary.

## Findings

| Severity | Finding | Decision |
|---|---|---|
| Critical | None if implementation keeps M2a projection-only and M2b selection-only. | Proceed under the constraints below. |
| High | Map overlays can leak hidden NPCs, undiscovered sites, unidentified discoveries, stockpiles, or faction certainty. | All overlay outputs must come from `buildMapOverlaySnapshot`; raw state must never be serialized to Webview, replay, or remote payloads. |
| High | Replay export and remote play are easy to forget when adding Webview data. | The same sanitized `MapOverlaySnapshot` contract applies to Webview, replay, and remote play. Tests should assert allow-listed keys. |
| High | Settlement pressure can leak raw resource amounts or hidden incidents. | Emit qualitative pressure bands only. No raw stock numbers, hidden room IDs, incident internals, or exact danger values. |
| High | Event pacing could become a hidden state writer if coupled to settlementOps too early. | `settlementEventCore.ts` returns candidates only. No disk write, no turn_result apply, no state mutation in M2. |
| Medium | Feature gating can become inconsistent if a new overlay master switch is added. | Reuse existing source feature flags. Marker kinds contribute zero when their source is unavailable or disabled. |
| Medium | Rumor/FoW states can expose certainty accidentally through labels. | Rumored markers must use degraded labels and `tone: 'unknown'` unless certainty is already public. |
| Medium | Discovery markers can conflict with existing discovery Webview sanitization. | Match the discipline of `pickDiscoveriesForWebviewCore`: unidentified means no identified label, value, notes, or secret details. |
| Low | M2b cooldowns add schema surface. | Keep cooldowns optional and parser-tolerant; no version bump required for design. |

## Final M2a Sanitize Contract

### Required Choke Point

Implement one pure function:

```ts
buildMapOverlaySnapshot(inputs: MapOverlayInputs): MapOverlaySnapshot
```

This is the only producer for map overlay data.

Required consumers:

- Webview `worldView` payload
- replay export, if overlay data is exported
- remote play payload, if overlay data is exposed remotely

No consumer may use raw canonical state for overlay display.

### Marker Contract

```ts
type MapOverlaySnapshot = {
  version: 1;
  markers: OverlayMarker[];
};

type OverlayMarkerKind =
  | 'npc'
  | 'merchant'
  | 'caravan'
  | 'faction_control'
  | 'quest'
  | 'discovery'
  | 'settlement_pressure';

type OverlayMarker = {
  id: string;
  kind: OverlayMarkerKind;
  x: number;
  y: number;
  label: string;
  fogVisibility: 'discovered' | 'rumored';
  tone?: 'friendly' | 'neutral' | 'hostile' | 'unknown';
  detail?: string;
};
```

Allowed marker keys:

- `id`
- `kind`
- `x`
- `y`
- `label`
- `fogVisibility`
- `tone`
- `detail`

Tests must prove that no extra keys are emitted.

### FoW Rules

1. Undiscovered regions emit no marker.
2. Rumored regions emit degraded markers only.
3. Unidentified discoveries never emit identified labels, value, notes, or
   secret details.
4. Secret, hidden, or unmet NPCs are not emitted.
5. Settlement pressure is a qualitative band only.
6. Raw stock quantities, hidden-room IDs, exact danger values, and incident
   internals are forbidden.
7. Per-kind and total caps are mandatory.

### Feature Gates

M2a must reuse existing feature gates:

- agency / Living World gate for NPC markers
- `enableSettlementMode` for merchant, caravan, and settlement pressure markers
- quest hook availability for quest markers
- `enableCampaignKit` for discovery markers
- world state availability for faction markers

If all sources are disabled or absent, return `{ version: 1, markers: [] }`.

## Final M2b Boundary

Implement `settlementEventCore.ts` as a pure selector only.

Allowed:

- compute candidate event weights;
- apply category cooldown filtering;
- return one candidate or `undefined`;
- derive short legacy-note text from already-resolved incidents.

Forbidden in M2:

- applying settlementOps;
- writing `settlement_state.json`;
- mutating input objects;
- wiring to `turn_result`;
- invoking circuit breakers;
- synchronizing with `campaign_resources.json`;
- adding a full event director subsystem.

## Implementation Checklist For Grok

1. Add `src/mapOverlayCore.ts`.
2. Add `MapOverlaySnapshot` types, marker caps, key allow-list, and FoW-safe
   marker builders.
3. Add tests in `scripts/test_map_overlay_core.js` for the M2a acceptance list.
4. Add `src/settlementEventCore.ts`.
5. Add deterministic candidate weighting, cooldown filtering, and no-mutation
   guarantees.
6. Add tests in `scripts/test_settlement_event_core.js`.
7. Wire tests into the repository test aggregator.
8. Only after pure tests pass, add thin `worldView` payload wiring for
   `mapOverlay`.
9. Do not add Webview rendering in the same Grok task unless explicitly asked.
10. Update `CHANGELOG.md` and `AI_SHARED_LOG.md`.

## Acceptance Commands

```powershell
npm run compile
node scripts/test_map_overlay_core.js
node scripts/test_settlement_event_core.js
npm test
node scripts/validate_utf8_docs.js
```

## Non-Goals

- No Webview marker rendering in the pure-core task unless explicitly assigned.
- No state writes from map clicks.
- No settlementOps disk application.
- No isometric view.
- No Z-layer operations.
- No 3D.
- No real-time NPC motion or pathfinding.
- No reference-game content copying.

## Handoff To Grok

Use:

1. `docs/SETTLEMENT_MODE_M2_DESIGN.md`
2. this gate file
3. existing pure-core patterns such as `tileOvermapCore.ts` and
   `campaignLedgerWebviewSanitizeCore.ts`

The key instruction is: implement sanitized projection plus pure event
selection, prove both with tests, and do not open a persistence/write surface.
