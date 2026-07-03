# Settlement Mode M2 Design - Map Overlays + Event Pacing

Status: design only. No implementation in this document.

Depends on:

- M1 settlement core (`src/settlementCore.ts`, `src/settlementState.ts`)
- Settlement design: [`docs/SETTLEMENT_MODE_DESIGN.md`](SETTLEMENT_MODE_DESIGN.md)
- Simulation-shaped references: [`docs/SETTLEMENT_REFERENCE_PATTERNS.md`](SETTLEMENT_REFERENCE_PATTERNS.md)
- Narrative-shaped references: [`docs/NARRATIVE_PATTERNS.md`](NARRATIVE_PATTERNS.md)

This document does not authorize copying code, schemas, data, sprites, names,
or prose from any referenced game. Use patterns only.

## 0. Key Design Decision - Split M2 Into Two Tracks

M2 combines two unrelated concerns, so they are split and may ship
independently.

| Track | Purpose | Shape | Main Risk |
|---|---|---|---|
| M2a Map Overlay Layer | NPC, merchant, caravan, faction, quest, discovery, and settlement-pressure markers on the macro tile overmap | derived, non-persisted, never in GM prompt, display-only | FoW / hidden-information leakage |
| M2b Settlement Event Pacing | adaptive event weighting, cooldowns, and short legacy notes | pure selector, no disk apply | write-surface creep |

Neither track writes canonical state from a UI action. M2a is a projection of
existing canonical state. M2b returns event candidates only.

## 1. M2a - Map Overlay Layer

### 1.1 Architectural Anchor

M2a follows the pattern established by `src/tileOvermapCore.ts`:

- pure derivation from canonical state;
- never persisted to JSON;
- never injected into a GM prompt;
- delivered to Webview next to `tileOvermap`;
- rendered as display-only UI.

Markers use the same 64x64 overmap grid as `tileOvermap`. Region-based markers
derive tile coordinates from the same cartography layout centers.

### 1.2 Single Sanitization Choke Point

M1's gate identified Webview, replay export, and remote play as leakage paths.
M2a therefore has one producer for overlay data:

```ts
// src/mapOverlayCore.ts
buildMapOverlaySnapshot(inputs: MapOverlayInputs): MapOverlaySnapshot
```

All channels must consume this snapshot:

- Webview push via `worldView`
- replay export
- remote play payload

No channel may serialize raw world, campaign, discovery, NPC, or settlement
state directly for overlay display. This mirrors the allow-list discipline in
`campaignLedgerWebviewSanitizeCore.ts`.

### 1.3 Data Contract

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

Allow-listed marker keys:

- `id`
- `kind`
- `x`
- `y`
- `label`
- `fogVisibility`
- `tone`
- `detail`

No extra keys may be emitted.

### 1.4 Canonical Sources And Gates

| Marker Kind | Canonical Source | Gate |
|---|---|---|
| `npc` | `world_state.npcPositions` | existing agency / Living World gate |
| `merchant` | `settlement_state.merchants` | `enableSettlementMode` |
| `caravan` | settlement merchants in transit or world motion | `enableSettlementMode` |
| `faction_control` | `world_state.regions[].controllingFaction`, faction reputation | world state present |
| `quest` | `world_state.questHooks`, campaign job board | quest hooks present |
| `discovery` | Campaign Kit discovery ledger | `enableCampaignKit` |
| `settlement_pressure` | settlement safety, morale, and shortage bands | `enableSettlementMode` |

M2a should not add a new master feature switch. Marker kinds are gated by their
source feature. If all sources are off, emit `{ version: 1, markers: [] }`.

### 1.5 FoW And Sanitization Rules

These rules are normative for M2a.

1. **Undiscovered region: no marker.** Never emit a marker for a region the
   player has not discovered or learned by rumor.
2. **Rumored region: degraded marker.** Use `fogVisibility: 'rumored'`, generic
   labels, and no exact identity, danger tier, faction certainty, stock, or
   hidden-room detail.
3. **Discovery markers respect appraisal.** Unidentified discoveries may show a
   generic unknown marker, but never their identified label, value, notes, or
   exact secret.
4. **NPC markers respect acquaintance and visibility.** Do not reveal secret,
   hidden, or unmet NPC movement. NPCs appear only when met, public, or located
   in a discovered region where their presence is already safe to reveal.
5. **Settlement pressure is aggregate only.** Emit qualitative bands such as
   `calm`, `strained`, `unrest`, or `crisis`; never raw stock numbers,
   stockpile contents, hidden rooms, or incident internals.
6. **Caps are required.** Recommended caps: NPC 40, merchant 20, caravan 20,
   faction_control 50, quest 40, discovery 40, settlement_pressure 20, total
   200.
7. **Key allow-list is required.** Tests must prove no extra marker keys leak.

### 1.6 Webview Wiring

- Add `mapOverlay` next to `tileOvermap` in the `worldView` message.
- Draw markers over the existing overmap canvas or equivalent display layer.
- Hover may show `label` and `detail`.
- Clicks must not write state. At most, they may open a read-only detail panel
  or insert chat text if explicitly designed later.
- No GM prompt budget change.

## 2. M2b - Settlement Event Pacing

### 2.1 Scope

M2b adds a pure selector:

```ts
// src/settlementEventCore.ts
selectSettlementEvent(state, context): SettlementEventCandidate | undefined
```

It does not:

- apply settlementOps;
- write to disk;
- mutate input;
- wire into `turn_result`;
- interact with rollback or circuit breakers.

Those actions require a later apply-gate.

### 2.2 Candidate Contract

```ts
type SettlementEventCategory =
  | 'raid'
  | 'shortage'
  | 'unrest'
  | 'windfall'
  | 'arrival'
  | 'departure'
  | 'repair';

type SettlementEventCandidate = {
  category: SettlementEventCategory;
  severity: 'info' | 'warning' | 'critical';
  weight: number;
  suggestedText?: string;
};

type SettlementEventContext = {
  worldTurn: number;
  seed: number;
  cooldowns?: Record<SettlementEventCategory, number>;
};
```

### 2.3 Adaptive Weighting

Use LoreRelay's own bounded logic:

- low safety increases `raid` and `unrest`;
- low morale increases `unrest` and `departure`;
- tracked stock shortage increases `shortage`;
- many unresolved recent incidents dampen additional negative events;
- stable healthy settlements allow occasional `windfall` or `arrival`.

Do not copy RimWorld formulas, incident lists, or terminology. This is only an
adaptive pacing pattern.

### 2.4 Cooldowns

Optional additive field:

```ts
eventCooldowns?: Record<SettlementEventCategory, number>
```

Rules:

- parser remains tolerant;
- no settlement_state version bump required for M2b design;
- a category inside cooldown is not selected;
- cooldowns exist to bound repetition, not to create a new subsystem.

### 2.5 Legacy Notes

M2b may include:

```ts
deriveLegacyNote(incident): string | undefined
```

Purpose:

- turn resolved incidents into short reusable names;
- reuse existing `settlement_state.notes` or structure notes later;
- no new "legacy object" schema in M2.

## 3. M2 Non-Goals

- No pathfinding.
- No real-time NPC movement animation.
- No tile editor.
- No state writes from map clicks.
- No isometric or Z-layer view. That is M3/M4.
- No 3D.
- No settlementOps disk application.
- No full economy simulation.
- No copying reference-game content.

## 4. Module Plan

New pure modules:

- `src/mapOverlayCore.ts`
- `src/settlementEventCore.ts`

Thin wiring:

- `src/worldView.ts`: add `mapOverlay` to the Webview message.
- replay export and remote play payload builders: route through
  `buildMapOverlaySnapshot` before exposing overlay data.

Tests:

- `scripts/test_map_overlay_core.js`
- `scripts/test_settlement_event_core.js`

## 5. Acceptance Tests

### M2a

- undiscovered region emits zero markers;
- rumored region emits degraded markers;
- unidentified discovery never emits the identified label;
- secret or unmet NPC never appears;
- settlement pressure emits only a qualitative band;
- raw stock numbers are not emitted;
- per-kind and total caps are enforced;
- key allow-list is enforced;
- source flags gate each marker kind;
- deterministic: same inputs produce the same snapshot.

### M2b

- deterministic for a fixed seed;
- low safety raises raid/unrest weight against baseline;
- stock shortage is required for shortage selection;
- category inside cooldown is never selected;
- high recent incident count dampens new negative events;
- selection never mutates the input state;
- returns `undefined` cleanly when nothing qualifies.

Verification:

```powershell
npm run compile
node scripts/test_map_overlay_core.js
node scripts/test_settlement_event_core.js
npm test
node scripts/validate_utf8_docs.js
```

## 6. Handoff / AI Division

1. **Codex/ChatGPT - sanitize/FoW gate.** Confirm the allow-list, the FoW
   rules, the single choke point for Webview/replay/remote, and the deferred
   apply-gate for settlementOps.
2. **Grok - pure cores and tests.** Implement `mapOverlayCore.ts` and
   `settlementEventCore.ts`. No UI and no disk apply.
3. **Claude - Webview overlay rendering.** Draw markers over the existing
   overmap display. Hover detail only. No state writes from clicks.
4. **Gemini - user-facing explanation and screenshot plan.**

The key instruction: M2a is a sanitized projection. M2b is a pure selector.
Nothing in M2 persists new canonical state or applies ops to disk.
