# LoreRelay Identity / Reference Layer D1 Design

> Status: Design only  
> Date: 2026-07-05 JST  
> Scope: pure read-only cross-ledger entity inventory + reference validation contract  
> Related: World Intent, State Orchestrator, WI7 migration, Mod System MOD1, Context Engine, Determinism Spine

## 0. Summary

LoreRelay already has many stable-looking ID strings, but there is no shared contract that says what kind of entity an ID refers to, which ledger owns it, which appearances are mirrors, and what should happen after rename, merge, delete, or migration.

Identity / Reference Layer D1 keeps the first step deliberately narrow:

- define a small cross-ledger `EntityRef` contract;
- observe existing ledgers without changing their schemas;
- produce deterministic `EntityPresence[]` and `EntityReferenceObservation[]`;
- validate duplicates, stale refs, alias cycles, and tombstone references;
- avoid write-back, auto-fix, migration apply, and State Orchestrator integration.

D1 is a diagnostic and contract layer. It is not a new canonical identity ledger.

## 1. Findings / Risks

- Plain string IDs appear across `world_forge`, `npc_registry`, `vehicle_state`, `settlement_state`, `game_state.world`, `game_state.entries`, `game_state.guild`, `world_state`, and mod manifests.
- Existing IDs are often well-formed, but `kind` is usually not carried with the string. That makes rename/merge/delete/migration risky because `abc` as an NPC, vehicle, location, or settlement cannot be distinguished by the raw string alone.
- `npc` is the highest-risk early domain because NPCs can appear as seed data in `world_forge.initialNpcs` and as canonical runtime records in `npc_registry.npcs`.
- `mobile_base` should not become a D1 entity kind. Current Mobile Base state is represented through vehicle links such as `vehicle.mobileBase`, not a stable cross-ledger owner.
- MOD1 has `aliasRules`, but those apply to `ModRecordKey(domain,id)`. D1 must not treat them as generic cross-ledger entity aliases.
- `mobile_base_state.json` may appear in Determinism Spine file lists, but it is not a D1 inventory source until a real owner/descriptor exists.

## 2. Approved D1 Contract

D1 only covers entities that are likely to be referenced across more than one ledger.

```ts
export type EntityKind =
  | 'region'
  | 'location'
  | 'faction'
  | 'npc'
  | 'vehicle'
  | 'settlement'
  | 'mod';

export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export interface EntityTombstone {
  reason: 'deleted' | 'merged';
  mergedInto?: EntityRef;
}

export interface EntityIdentity {
  ref: EntityRef;
  aliases?: string[];
  tombstone?: EntityTombstone;
}

export interface EntityPresence {
  ref: EntityRef;
  ledger: string;
  path: string;
  role: 'canonical' | 'seed' | 'mirror' | 'embedded';
  displayName?: string;
}

export interface EntityReferenceObservation {
  sourceLedger: string;
  sourcePath: string;
  ownerRef?: EntityRef;
  targetRef: EntityRef;
  optional?: boolean;
}

export interface EntityResolveResult {
  status: 'exact' | 'alias' | 'merged' | 'deleted' | 'missing' | 'kind_mismatch' | 'ambiguous';
  canonicalRef?: EntityRef;
  matchedAlias?: string;
  tombstone?: EntityTombstone;
}
```

Rules:

- `EntityIdentity` is future-proof contract data, not a D1 persisted ledger.
- `aliases[]` are same-kind legacy IDs only.
- `mergedInto` must be same-kind.
- D1 may resolve exact, alias, merged, deleted, missing, kind mismatch, and ambiguous references.
- D1 must reject alias cycles, cross-kind aliases, and cross-kind merge chains.
- D1 must not rewrite existing canonical documents.

## 3. D1 Entity Scope

Included:

| Kind | Why included |
|---|---|
| `region` | `world_forge`, `game_state.world`, map/FoW projections |
| `location` | current location, NPC location, settlement/vehicle parking, guild hall |
| `faction` | region control, NPC affiliation, reputation, market/control systems |
| `npc` | registry, speaker attribution, guild/adventurer refs, vehicle crew, settlement residents |
| `vehicle` | garage, active vehicle, carriers/hangars, Mobile Base links |
| `settlement` | settlement state/layout, vehicle/mobile-base links |
| `mod` | mod profiles, dependencies, conflicts |

Excluded in D1:

- `commodityId`
- `resourceId`
- `transportId`
- `discoveryId`
- `petitionId`
- `requestId`
- `questId`
- `relatedEventId`
- `guild`
- `domain`
- `mobile_base`
- `mod_record`

These excluded IDs are either catalog/local IDs, still subsystem-local, or too poorly bounded for the first shared layer.

## 4. Cross-Ledger Reference Inventory

| Ledger | Canonical / seed entities | Outbound refs | D1 kind | D1 note |
|---|---|---|---|---|
| `world_forge.json` | `region`, `location`, `faction`, seed `npc` | `Region.connectedTo[]`, `Location.regionId`, `Location.factionControl`, `Faction.allies/enemies[]`, `InitialNpc.locationId/factionId`, `MapItem.revealsRegionIds[]` | region/location/faction/npc | NPCs are seed only |
| `npc_registry.json` | canonical `npc` | `NpcEntry.locationId`, `NpcEntry.factionId` | npc/location/faction | `relatedEventId` is out of D1 scope |
| `vehicle_state.json` | canonical `vehicle` | `owner.id`, `locationId`, `parkedAt.locationId`, `parkedAt.parkingLocationId`, `activeVehicleId`, `carriedByVehicleId`, `hangar.carriedVehicleIds[]`, `crew[].npcId`, `mobileBase.settlementId/homeLocationId/dockedAtLocationId` | vehicle/npc/location/settlement/faction | `mobile_base` remains a vehicle link |
| `settlement_state.json` | canonical `settlement` | `locationId`, `residents[].npcId`, `visitors[].npcId`, `merchants[].npcId` | settlement/location/npc | stock/incident IDs are local |
| `settlement_layout.json` | mirror `settlement` | `settlementId` | settlement | mirror, not owner |
| `game_state.world` | embedded refs only | `currentLocationId`, `visitedLocationIds[]`, `discoveredRegionIds[]`, `knownFactionIds[]`, `regions[*].controllingFaction`, `lastGeneratedLocationId`, `rumorKnownRegionIds[]` | location/region/faction | not a write owner |
| `game_state.entries` | none | `speakerNpcId` | npc | speaker/TTS attribution only |
| `game_state.guild` | embedded guild blob | `hallLocationId`, `adventurers[].npcId`, `quests[].partyNpcIds[]` | location/npc | request/quest IDs are guild-local |
| `world_state.json` | simulation state, no D1 owner | `controllingFaction`, NPC position maps, faction-keyed maps | faction/npc/location | adapter only; no ownership |
| `mod_profile.json` / mod manifests | canonical `mod` | `dependency.modId`, `conflict.modId` | mod | MOD1 alias rules stay local |
| `turn_result.json` | ephemeral refs only | `speakerNpcId`, `factionId`, `marketLocationId`, `npcAgencyOps`, domain/guild ops, `vehicleOps`, `mobileBaseOps` | mixed | validation helper only |

## 5. Relationship To Existing Systems

### World Intent

`worldIntentCore.ts` already defines an `EntityRef`-like shape. D1 may add a shared type and compatibility adapters, but must not change supported intent kinds or runtime behavior.

### World Intent Sanity

`worldIntentSanityCore.ts` has `WorldSanityEntityRef`. D1 may provide conversion helpers later. D1 must not make sanity checks depend on a complete inventory yet.

### State Orchestrator

D1 must not enter write planning or queue order. Future SO phases can consume D1 inventory as an input for diagnostics.

### WI7 Migration

D1 only detects stale refs and defines tombstone/alias semantics. It does not apply migration rewrite.

### Mod System

D1 includes `mod` identities for mod manifests, dependencies, and conflicts. It does not merge MOD1 `ModAliasRule` into generic entity aliasing.

### Context Engine

Context Engine documents reserve broader identity concepts such as public identity or alias-like references. D1 should not solve disguise/public-identity mechanics. It only establishes canonical cross-ledger entity refs.

### Determinism Spine

D1 inventory ordering must be stable so it can later be hashed or reported without order drift.

## 6. Deferred Items

- `entity_identity.json` or any new persisted identity ledger.
- Adding alias/tombstone fields to existing ledgers.
- State Orchestrator write-path integration.
- World Intent execute-time inventory requirements.
- WI7 automatic reference rewrite.
- Generic merge of MOD1 alias rules with entity aliases.
- Promoting `guild`, `domain`, `mobile_base`, or `mod_record` to D1 kinds.
- Name-based auto-match.
- Cross-kind merge.
- Bulk rewrite.
- ECS, Event Sourcing, or JSON Patch redesign.

## 7. Required Tests

1. Inventory builder extracts deterministic `EntityPresence[]` from `world_forge`, `npc_registry`, `vehicle_state`, `settlement_state`, `settlement_layout`, and guild blobs.
2. Inventory builder extracts deterministic `EntityReferenceObservation[]` for the D1 ledgers.
3. Seed NPC in `world_forge.initialNpcs` plus canonical NPC in `npc_registry.npcs` is allowed.
4. Duplicate canonical owner in the same ledger is detected.
5. Dangling refs are detected for `vehicle.carriedByVehicleId`, `settlement.residents[].npcId`, and `npc.locationId`.
6. `resolveEntityRef` returns exact, alias, merged, deleted, and missing correctly.
7. Alias cycles, cross-kind aliases, and cross-kind `mergedInto` chains are rejected.
8. Tombstoned old IDs can report a replacement without modifying canonical docs.
9. World Intent compatibility adapter does not change existing vehicle behavior.
10. Inventory serialization is stable for Determinism Spine use.
11. `mobile_base_state.json` absence is harmless because it is not a D1 source.

## 8. Implementation Phases

### D1a - Identity core

Files:

- `src/entityIdentityCore.ts`
- `scripts/test_entity_identity_core.js`

Implement:

- `EntityKind`
- `EntityRef`
- `EntityTombstone`
- `EntityIdentity`
- `EntityPresence`
- `EntityReferenceObservation`
- `EntityResolveResult`
- `entityRefKey`
- `sameEntityRef`
- `resolveEntityRef`
- `validateEntityIdentitySet`

No filesystem, VS Code API, host commands, or write-back.

### D1b - Reference inventory core

Files:

- `src/entityReferenceInventoryCore.ts`
- `scripts/test_entity_reference_inventory_core.js`

Implement pure observers for:

- `world_forge`
- `npc_registry`
- `vehicle_state`
- `settlement_state`
- `settlement_layout`
- `game_state.world`
- `game_state.entries`
- `game_state.guild`
- `world_state`
- mod profile/manifests

Return deterministic sorted presences and observations.

### D1c - Compatibility adapters

Optional and only if zero behavior change:

- shared `EntityRef` import path for World Intent;
- conversion helpers for World Intent Sanity.

No runtime behavior change.

## 9. Acceptance Criteria

D1 is complete when:

- `npm run compile` passes.
- `npm test` passes.
- New tests cover identity resolution, validation, inventory extraction, dangling refs, duplicate owners, seed/canonical NPC handling, and stable ordering.
- Existing World Intent behavior is unchanged.
- No canonical ledger schema changes are introduced.
- No host command, Webview UI, or State Orchestrator write integration is added.

## 10. Grok / Codex Implementation Prompt

```markdown
LoreRelay Identity / Reference Layer D1 を実装してください。

推奨モデル: Grok / Codex
推奨推論: Medium

必読:
1. docs/IDENTITY_REFERENCE_LAYER_D1_DESIGN.md
2. AI_SHARED_LOG.md Current Snapshot
3. CHANGELOG.md [Unreleased] and latest release
4. docs/VERSION_TRUTH.md
5. src/worldForgeCore.ts
6. src/npcRegistry.ts
7. src/vehicleCore.ts
8. src/mobileBaseCore.ts
9. src/settlementCore.ts
10. src/guildCore.ts
11. src/modSystemCore.ts
12. src/statePatch.ts
13. src/worldIntentSanityCore.ts
14. src/worldIntentCore.ts
15. src/types/GameState.ts
16. src/types/TurnResult.ts

目的:
既存ledger schemaを変えず、pure read-only inventory + validation + helper coreだけを追加します。

実装:
- src/entityIdentityCore.ts
- src/entityReferenceInventoryCore.ts
- scripts/test_entity_identity_core.js
- scripts/test_entity_reference_inventory_core.js
- scripts/run_all_tests.js への登録

禁止:
- 新しい canonical identity ledger
- canonical write-back
- migration apply / auto-fix
- host command / Webview UI
- State Orchestrator queue/order changes
- ECS / Event Sourcing / JSON Patch redesign
- `mobile_base` を D1 entity kind にすること
- MOD1 aliasRules を generic entity alias と統合すること

検証:
- npm run compile
- npm test
```

