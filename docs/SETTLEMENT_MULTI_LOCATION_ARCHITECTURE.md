# SETTLEMENT-MULTI-LOCATION-001 — Multi-location settlement diorama architecture

**Status:** design only (no production code in this task)  
**Base:** `42f6796d588792b382886fc0d0c64f0eb201ee45` (`task/SHOWCASE-SCENARIO-002-living-trade-world`)  
**Package version context:** 1.84.3  
**Date:** 2026-07-16  

---

## 1. Executive summary

LoreRelay can already **render** an arbitrary settlement diorama from an in-memory
`SettlementViewSnapshot` (built from `SettlementStateV1` + optional `SettlementLayoutV1`).
The hard limit is **host loading**: production always reads workspace-root singletons

```text
settlement_state.json
settlement_layout.json
```

with no selection by World location. Mobile Base and “fixed town” both share that pair when
Settlement Mode is on. Selecting Sapphire Port vs Mistgrove in the World pane therefore
cannot switch dioramas — the same singleton payload is rebroadcast.

**Verdict: A — Ready for a bounded read-only implementation slice.**

The pure view/diorama pipeline need not be redesigned first. What is missing is a
**location-scoped document contract + host resolver** (with strict legacy fallback) so
`pushWorldViewToWebview()` can load the settlement that matches the displayed location.

**Recommended storage:** Option A — `settlements/<locationId>/settlement_state.json` +
`settlement_layout.json` for fixed settlements; keep Mobile Base on a dedicated path
(`settlements/_mobile_base/` or retain root singletons only for mobile base).

**Showcase Scenario 002 note:** Living Trade World already authors six fixed-town *intents*
and one runtime mobile-base layout. Multi-location storage is the missing link to render
Sapphire Port, Reedmarket, Mistgrove, Ironspire, Glass Oasis, and Watchkeep as separate
dioramas. Header comments in `scripts/create_living_trade_world.js` still say “8 biomes /
12 goods / 8 markets” while the body generates **9 biomes / 14 goods / 9 markets** — record
only; do not fix in this architecture task.

---

## 2. Current call graph

```text
Workspace root
  settlement_state.json  ──┐
  settlement_layout.json ──┤
                           ▼
        settlementState.ts
          loadSettlementState() / loadSettlementLayout()
          (mtime-cached; clearSettlementStateCache clears both)
                           │
     ┌─────────────────────┼──────────────────────────────┐
     ▼                     ▼                              ▼
worldView.ts          mobileBaseBridge.ts           mapOverlayBridge.ts
 load when            load same singletons          loadSettlementState()
 enableSettlementMode   for panel + interior          for pressure markers
     │                     │
     ▼                     ▼
settlementViewCore.ts   mobileBaseInteriorCore.ts
 buildSettlementViewSnapshot(state, layout, layer)
     │
     ▼
settlementDioramaBridge.ts → settlementDioramaCore.ts
 buildWorkspaceSettlementDiorama(view)
     │
     ▼
panel.webview.postMessage({
  type: 'worldView',
  settlementView,
  settlementDiorama,
  settlementExpansionPreviews,
  mobileBasePanel,
  mobileBaseInterior,
  ...
})
     │
     ▼
webview/modules/85-world.js
  worldMapMode === 'settlement' | 'diorama'
webview/modules/86b-settlement-isometric.js
  drawSettlementIsometric(settlementView)
webview/modules/86c-settlement-diorama.js
  (Three.js from settlementDiorama)
```

**Important:** `currentLocationId` is used for vehicles, markets, and map highlight, but
**not** as a key into settlement files. `SettlementStateV1.locationId` is optional metadata
only; the loader never filters by it.

---

## 3. Current readers and writers

### 3.1 Readers (production)

| Reader | Files | Notes |
|--------|-------|-------|
| `settlementState.loadSettlementState` | `settlement_state.json` | Singleton path + cache |
| `settlementState.loadSettlementLayout` | `settlement_layout.json` | Singleton path + cache |
| `worldView.pushWorldViewToWebview` | via loaders above | Emits `settlementView` / diorama |
| `mobileBaseBridge` panel/interior/prompt | same loaders | Triple gate: vehicle + settlement + mobile base flags |
| `mapOverlayBridge` | `settlement_state` only | Settlement pressure markers |
| `buildSettlementPromptContext` | state only | GM prompt chunk |
| `entityReferenceInventoryCore` | observers | Ledger inventory |
| `worldIntentSanityLoader` | both JSON | Sanity snapshots |
| `ledgerMigration*` | both | Migration catalog entries |

### 3.2 Writers (production)

| Writer | Files written | Queue | Atomic | Cache invalidation | Notes |
|--------|---------------|-------|--------|--------------------|-------|
| `settlementLayoutTurnOps` (`expand_layer` only) | `settlement_layout.json` | `runSerializedSettlementLayoutMutation` | `writeJsonAtomic` | `clearSettlementLayoutCache` | Only durable settlementOps path that mutates layout |
| Other `settlementOps` (set_score, stock, …) | **none** | — | — | — | Parsed / prompt-documented as stubs; not persisted as of this base |
| Ledger migration writeback/restore | both ledgers | migration host | atomic per migration design | host-specific | Exceptional path |
| State Orchestrator | plans may *include* settlement_layout descriptor | layout queue when executed | as SO executor | as SO | Descriptor knows `settlement_layout` queue; **no** `settlement_state` serialized queue today |
| Scenario generators / showcase | both (offline) | N/A | full rewrite | N/A | Not product host writers |
| Manual user edit | either | N/A | N/A | mtime cache miss | Supported by design |

**Finding:** There is **no** `runSerializedSettlementStateMutation` in `workspaceStateQueue.ts`.
State file is treated as mostly authored/migrated, not turn-committed (except migration).

---

## 4. Renderer capability matrix

### 4.1 What already works (pure / Webview)

| Capability | Support | Mechanism |
|------------|---------|-----------|
| Arbitrary in-memory state+layout | **Yes** | `buildSettlementViewSnapshot({ state, layout, selectedLayerId })` |
| Filename coupling in pure cores | **No** | Pure modules never open files |
| Host filename coupling | **Yes (limit)** | `settlementState.ts` hardcodes root filenames |
| Payload-only Webview draw | **Yes** | Isometric canvas + diorama consume message fields |
| Switch layout without full Webview rebuild | **Yes** | New `worldView` message re-renders settlement modes |
| Layers z1 / z0 / z-1 / z-2 | **Yes** | Layout layers + expansion previews |
| Tile codes: floor, wall, gate, market, workshop, stockpile, quarters, clinic, barracks, shrine, water, ruins, hazard | **Yes** | `SettlementTileCode` + isometric colors |
| Continuous roads / path polylines | **No** | No road primitive; only zone blobs |
| Explicit zone `code` field | **No** | Tile code **inferred from English-biased label keywords** |
| Large continuous walls | **Weak** | Zones expand to radius 0–1 around a center point |
| Open (unwalled) village | **Partial** | Omit wall-labeled zones; still sparse point layout |
| Docks / water | **Partial** | `water` via label keywords (e.g. “River”, “Docks”) |
| Elevation beyond discrete layers | **No** | Only layer stack |
| District polygons | **No** | Zones are labeled points (+ tiny radius for market/workshop) |
| Multi-settlement in one view | **No** | Single snapshot per message |

### 4.2 Separation of limitations

| Layer | Limitation |
|-------|------------|
| **Data-model** | One pair of root files; `locationId` optional and unused for routing; layout has no explicit tile code / path geometry |
| **Host/loading** | Always loads root singletons; no map from `currentLocationId` → documents; MB and fixed town share files |
| **Renderer** | Accepts any valid snapshot; cannot invent multi-city storage; silhouette fidelity limited by zone→tile expansion rules |

**Conclusion:** Multi-location *storage and host selection* unblocks the showcase. Richer silhouettes (true wall rings, roads) may need a **later** layout/renderer enhancement, but six *distinguishable* towns are achievable with careful labels + zone placement under current inference.

---

## 5. Selection semantics

### Recommended rule (fixed settlements)

```text
displayedFixedSettlementLocationId =
  explicitSettlementFocusId   // optional UI pin from World map click
  ?? currentPlayerLocationId  // game_state.world.currentLocationId
```

### UX contract

1. **Default:** settlement mode shows the settlement for the **player’s current location** when a location-scoped document exists.
2. **World pin focus:** if the user selects another location on the World map, settlement mode may show that location’s diorama **only if** a banner/chip states  
   `Preview: <name> (not current position)`  
   until the player travels there.
3. **Never** silently show location A’s layout while the status bar says the player is in B, without that chip.
4. **Empty state:** if no document for the resolved location, show empty copy  
   `No settlement diorama for this place`  
   — do **not** fall back to another city’s data.

### Mobile base

Always resolved via **active mobile-base vehicle** + mobile-base settlement documents (see §10), independent of fixed-city selection, unless the user is explicitly in “mobile base interior” UI.

---

## 6. Storage option comparison

### Option A — per-location directory

```text
settlements/<locationId>/settlement_state.json
settlements/<locationId>/settlement_layout.json
settlements/_mobile_base/settlement_state.json   # recommended MB home
settlements/_mobile_base/settlement_layout.json
```

Legacy root files remain for migration only.

| Criterion | Assessment |
|-----------|------------|
| Backward compatibility | Strong: leave root files; add new tree |
| Atomic writes | Per-file atomic (existing `writeJsonAtomic`); two-file consistency is same as today |
| Independent editing | Excellent for humans and tools |
| Cache invalidation | Path-keyed cache required |
| Import/export | Folder copy per location |
| Scenario generation | Natural for showcase cities |
| Migration complexity | Low–medium (copy legacy once with ownership tag) |
| Path-safety | **Critical** — strict locationId sanitization |
| Human readability | High |
| Authoring tools | Easy |

### Option B — indexed multi-settlement documents

```text
settlements.json          // map locationId → state
settlement_layouts.json   // map locationId → layout
```

| Criterion | Assessment |
|-----------|------------|
| Atomic writes | Single-file rewrite of all towns on any edit — high blast radius |
| Concurrent edits | Worse |
| Human editing | Poor at scale |
| Migration | One-shot rewrite |
| Path-safety | Easier (no path segments) |

### Option C — single versioned root document

One file with `version` + `entries[]` of state+layout pairs.

| Criterion | Assessment |
|-----------|------------|
| Atomic whole-world swap | Good |
| Partial update risk | Any write rewrites all |
| Diff/review | Noisy |
| Matches vehicle v2 collection style | Somewhat, but settlements are larger |

### Recommended option

**Option A (per-location directory)** for fixed settlements.

**Rejected:**

- **B** as primary store — blast radius and poor human/scenario ergonomics.
- **C** as primary store — same whole-document churn; keep mental model of two small files.
- “Only enhance singleton with locationId field” — does not allow six concurrent towns on disk.

---

## 7. Recommended versioned contract

### 7.1 Path layout (v1 multi-location)

```text
settlements/
  _mobile_base/
    settlement_state.json    # version 1, same SettlementStateV1
    settlement_layout.json   # version 1, same SettlementLayoutV1
  <locationId>/
    settlement_state.json
    settlement_layout.json
```

Optional later:

```text
settlements/index.json   # { version: 1, locations: string[], mobileBase: true }
```

Not required for PRE1–SLICE1.

### 7.2 Document schemas

**Reuse** existing pure parsers:

- `parseSettlementState` / `SettlementStateV1`
- `parseSettlementLayout` / `SettlementLayoutV1`

**Contract additions (host-level, not necessarily file schema bump):**

| Field | Rule |
|-------|------|
| `state.locationId` | **Required** for fixed settlements; must equal directory key |
| `state.settlementId` | Stable id (may equal locationId or be distinct) |
| `layout.settlementId` | Must match `state.settlementId` |
| Mobile base state | `locationId` = vehicle dock location (may change); **not** used as directory key |

### 7.3 Pure resolver API (conceptual)

```ts
type SettlementDocumentKind = 'fixed' | 'mobile_base' | 'legacy_singleton';

interface ResolveSettlementInput {
  locationId?: string;           // focus or player location
  preferMobileBase?: boolean;
  hasActiveMobileBaseVehicle: boolean;
  forgeLocationIds: ReadonlySet<string>;
}

interface ResolveSettlementResult {
  kind: SettlementDocumentKind;
  locationId?: string;
  statePath: string;
  layoutPath: string;
  // or missing + reason
}
```

Parsing stays pure; path join happens only after ID validation.

---

## 8. Legacy fallback and migration rules

Existing workspaces with only root:

```text
settlement_state.json
settlement_layout.json
```

### Rules

1. **Default ownership:** treat root pair as **mobile base ledger** if an active vehicle has `mobileBase.settlementId` matching `state.settlementId`; else treat as **legacy unscoped** settlement.
2. **Never** present the same legacy singleton as the diorama for *every* World location.
3. **Fixed city resolution without multi-location files:** empty diorama for that city (honest empty state).
4. **Optional explicit migration (SLICE 3):**  
   - If MB-owned → copy to `settlements/_mobile_base/` and leave root as compatibility mirror **or** rewrite root to a pointer file in a later version.  
   - If unscoped with `locationId` set and ID ∈ forge → copy to `settlements/<locationId>/`.  
   - If unscoped without usable locationId → do not auto-assign; require author choice.
5. **Migration must be explicit** (command or SO-owned job), **reversible** via backup, and must not run on mere World View push.
6. **Do not** reinterpret a mobile-base deck layout as Sapphire Port.

---

## 9. Location ID validation

Before any path join under `settlements/`:

```text
ALLOWED: /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/
```

Reject if:

- empty, longer than 64;
- contains `/`, `\`, `.` path segments, `..`, drive prefix, URL encoding tricks;
- equals `.` or `..`;
- reserved: `_mobile_base` used only for MB namespace (not a forge location);
- not present in active World Forge `geography.locations[].id` (for fixed settlements);
- prototype pollution keys (`__proto__`, `constructor`, …) if ever used as object map keys.

**Never** pass raw UI strings into `path.join(ws, 'settlements', id)`.

---

## 10. Mobile-base separation

| Choice | Verdict |
|--------|---------|
| Keep only root singletons for MB forever | Works short-term; blocks clean multi-city tree |
| Share fixed multi-settlement schema with `owner: mobile` | Possible later; higher coupling |
| **Dedicated namespace `settlements/_mobile_base/` + share renderer only** | **Recommended** |

Mobile base:

- remains tied to **vehicle** `mobileBase.settlementId` / dock location;
- uses same pure view/diorama pipeline;
- must not be selected as a fixed World city directory;
- may move with the vehicle without renaming directories.

---

## 11. Concurrency and durability risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Two writers replace different towns concurrently | Medium | Per-path serialized queues or one settlement queue with path key |
| Layout write without state | Medium (existing) | expand_layer already requires state on disk |
| No settlement_state turn writer | Low for read-only SLICE1 | Document; add state queue only when ops persist |
| Cache serves wrong location after switch | High if path cache is global | Key cache by absolute path; clear on write |
| Migration vs normal write race | High | Migration remains exceptional direct writer until coordinated (same lesson as vehicle PRE2/PRE3) |
| Showcase generator vs live host | Low | Generator writes multi-path tree once |

**Initial read-only slice does not require** stronger fsync or full document-owner refactor, but **does require** correct cache keys and no cross-location fallback.

**Later write slices should** introduce a small `settlementDocumentOwner` pattern analogous to vehicle PRE2 (path resolve → parse → mutate → atomic write → clear cache), without inventing a generic ledger framework.

---

## 12. Proposed implementation slices

### PRE1 — Pure multi-location path contract

| | |
|--|--|
| **Scope** | ID validation helpers; path builders; parse-only types for resolve results; unit tests |
| **Exclusions** | Host I/O, Webview, migration, writers |
| **Modules** | e.g. `settlementLocationPathCore.ts` |
| **Tests** | Reject traversal IDs; accept forge IDs; MB reserved namespace |
| **Stop** | Pure tests green |
| **VSIX** | No |

### PRE2 — Read-only resolver + legacy policy

| | |
|--|--|
| **Scope** | Resolve fixed path vs `_mobile_base` vs legacy root; no Webview yet |
| **Exclusions** | Writes, migration auto-run, UI |
| **Modules** | `settlementLocationResolveCore.ts` + thin host adapter |
| **Tests** | Matrix: multi-path hit, legacy MB ownership, unscoped legacy → empty for other cities |
| **Stop** | Resolver matrix green |
| **VSIX** | No |

### SLICE 1 — Host loads selected/current fixed settlement into existing payload

| | |
|--|--|
| **Scope** | `worldView` uses resolver for `settlementView` / diorama; empty states; cache by path |
| **Exclusions** | Settlement editor, migration, SO changes, layout format redesign |
| **Modules** | `settlementState.ts`, `worldView.ts`, maybe `mobileBaseBridge.ts` for MB path |
| **Tests** | Focused host/fixture tests: two locations → two different `settlementId`s in payload |
| **Stop** | Fixture workspace with 2 towns proves payload switch |
| **VSIX** | Optional focused human smoke |

### SLICE 2 — World / settlement selection synchronization

| | |
|--|--|
| **Scope** | Map pin focus + “preview vs current” chip; empty copy; no wrong-city silent fallback |
| **Exclusions** | Authoring UI, writes |
| **Modules** | `webview/modules/85-world.js`, host message for focus location |
| **Tests** | Webview/message contract tests |
| **Stop** | Manual World pin preview matches payload |
| **VSIX** | Yes (human) |

### SLICE 3 — Writes, import/export, explicit migration

| | |
|--|--|
| **Scope** | expand_layer path-aware writes; optional migration command; SO path updates |
| **Exclusions** | Full settlement “city builder” |
| **Modules** | layout turn ops, migration host, queues |
| **Tests** | Write isolation per location; migration reverse |
| **Stop** | Migration + write fixtures green |
| **VSIX** | Yes |

### SHOWCASE — Sapphire Roads six cities

| | |
|--|--|
| **Scope** | Generate six location-scoped layouts under `05-living-trade-world`; capture real dioramas |
| **Exclusions** | Renderer redesign unless PRE fails silhouette gate |
| **Tests** | Six distinct `settlementId`s + screenshot sanity |
| **Stop** | Human-visible differences for Port / Reed / Grove / Spire / Oasis / Keep |
| **VSIX** | Yes |

---

## 13. Showcase Scenario 002 acceptance plan

### Required cities (fixed)

| Location | Conceptual layout (expressible today) |
|----------|----------------------------------------|
| **Sapphire Port** | Dense market/workshop/stockpile labels near water-labeled zones; gate + wall labels |
| **Reedmarket** | Multiple water labels, market, sparse walls |
| **Mistgrove** | Only quarters/shrine/workshop; **no** wall/gate labels |
| **Ironspire** | Multi-layer z0+z1; barracks/workshop; compact coords |
| **Glass Oasis** | Central market; ring of quarters/stockpile; few walls |
| **Watchkeep** | wall + gate + barracks labels; tight coords |

### Acceptance (product path)

1. Workspace contains `settlements/<loc_*>/` documents (after SLICE1+SHOWCASE).
2. Setting `currentLocationId` (or approved focus) causes `worldView.settlementView.settlementId` to match that city’s document.
3. Switching location changes tiles/markers (not only the name string).
4. Mobile base interior still loads when MB vehicle active, without overwriting fixed-city documents.
5. No city shows another city’s layout.
6. Screenshots from real Webview Dark+ JA harness — **not** generated art.

### If silhouettes still too similar

Classify as **renderer/layout primitive gap** (no continuous walls/roads; label-inferred codes). Spin a separate task; do not block multi-location **storage** shipping.

---

## 14. Open risks

1. Zone→tile inference is English-keyword biased; JA-only labels may become generic `floor`.
2. Showcase `settlement_layout_samples` used unsupported `code` fields — ignored by parser today.
3. No production writer for `settlement_state` turn ops — multi-city **live sim** still limited.
4. Dual root + multi-path during migration window can confuse users if not documented.
5. Map overlay pressure uses singleton settlement state only — needs multi-location awareness later.
6. Header comment mismatch in Living Trade World generator (counts) may confuse reviewers.

---

## 15. Final A / B / C verdict

# **A. Ready for a bounded read-only implementation slice**

**Rationale:**

- Pure view + diorama already accept arbitrary state/layout payloads.
- Webview already switches on new `worldView` messages without full rebuild.
- The blocking defect is **singleton host loading**, not canvas/Three.js architecture.
- Option A storage + strict ID validation + explicit legacy policy is implementable without redesigning Settlement Mode.

**Not C:** renderer does not require redesign before multi-location **storage**.  
**Not B as a hard stop:** no separate prerequisite product feature is mandatory before PRE1/PRE2/SLICE1 (though layout primitive upgrades would improve showcase beauty later).

---

## Appendix A — File map (this base)

| Role | Path |
|------|------|
| State/layout loaders | `src/settlementState.ts` |
| Parsers / ops stubs | `src/settlementCore.ts` |
| View snapshot | `src/settlementViewCore.ts` |
| Diorama pure | `src/settlementDioramaCore.ts` |
| Diorama host | `src/settlementDioramaBridge.ts` |
| Layout expand write | `src/settlementLayoutTurnOps.ts` + `Core` |
| Layout queue | `src/workspaceStateQueue.ts` → `runSerializedSettlementLayoutMutation` |
| World push | `src/worldView.ts` |
| Mobile base | `src/mobileBaseBridge.ts`, `mobileBaseCore.ts`, `mobileBaseInteriorCore.ts` |
| Isometric UI | `webview/modules/86b-settlement-isometric.js` |
| World mode switch | `webview/modules/85-world.js` |
| Migration catalog | `src/ledgerMigrationHostCore.ts` |

## Appendix B — Living Trade World comment mismatch (do not fix here)

In `scripts/create_living_trade_world.js` header coverage matrix:

- comments: 8 biomes, 12 goods, 8 markets  
- body: 9 biomes, 14 commodities, 9 markets  

Recorded for follow-up hygiene only.
