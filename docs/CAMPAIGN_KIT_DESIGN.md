# Campaign Kit Foundation

Campaign Kit is a lightweight genre-loop layer for LoreRelay.

It does not replace Campaign, Living World, Commerce, Quest Hooks, or World Forge.
It gives the GM a compact vocabulary for "what play is about" in a given world:
hub, jobs, expedition sites, findings, appraisal/services, and world reaction.

## Activation

There are two supported activation paths.

1. Workspace file:

   `campaign_kit.json`

   If this file exists in the workspace root, LoreRelay parses it and injects it into
   the GM prompt as the active Campaign Kit.

2. `game_rules.json` flags:

```json
{
  "enableCampaignKit": true,
  "campaignKitId": "postapoc_scavenger"
}
```

If `campaignKitId` is omitted, LoreRelay infers a built-in preset from
`world_forge.json` theme text.

Invalid or unsupported `campaign_kit.json` (wrong `version`, malformed JSON) disables
the kit for that workspace — LoreRelay does **not** fall back to `game_rules` when the
file exists. Unknown `campaignKitId` values are ignored (no silent preset substitution).

## Built-in Presets

- `classic_fantasy_guild`
- `postapoc_scavenger`
- `space_frontier`
- `eastern_fantasy`
- `cyberpunk_courier`
- `modern_occult`
- `survival_horror`

Every non-generic genre in `CampaignKitGenre` now has at least one preset. Each preset
exposes the full six-kind discovery taxonomy (`material`, `lore`, `social`, `route`,
`threat`, `quest`).

## Custom File Example

```json
{
  "version": 1,
  "id": "my_scavenger_loop",
  "name": "My Scavenger Loop",
  "genre": "postapocalypse",
  "loop": {
    "hubLabel": "Settlement",
    "jobBoardLabel": "Notice Board",
    "siteLabel": "Ruin",
    "lootLabel": "Salvage",
    "appraisalLabel": "Appraisal",
    "serviceLabel": "Workshop",
    "worldReactionLabel": "Faction and market response"
  },
  "currencies": ["Credits", "Barter goods"],
  "resources": ["Food", "Water", "Fuel", "Ammo", "Medicine", "Parts"],
  "siteTypes": ["Urban ruins", "Bunker", "Dead factory"],
  "hazards": ["Radiation", "Raiders", "Collapse"],
  "services": ["Appraisal", "Repair", "Trade", "Rumor gathering"],
  "discoveryTypes": [
    { "id": "scrap", "name": "Scrap", "kind": "material" },
    { "id": "records", "name": "Old records", "kind": "lore" },
    { "id": "route", "name": "Safe route", "kind": "route" },
    { "id": "job_seed", "name": "Job lead", "kind": "quest" }
  ],
  "gmGuidance": [
    "Prepare in town, enter a dangerous site, bring back findings, appraise or repair them, then let markets and factions react.",
    "Unidentified finds should be described first, then clarified by appraisal, repair, research, or expert NPCs."
  ]
}
```

## Prompt Boundary

Campaign Kit is guidance only.

Persistent facts still belong to existing LoreRelay systems:

- `turn_result.json` / `statePatch` for canonical turn updates
- Quest Hooks for structured quests
- Commerce `tradeOps` for transactions
- World Forge / World State for map, factions, regions, and simulation

This keeps genre flavor flexible without forking the engine per setting.

## Integration Matrix

| Campaign Kit concept | LoreRelay system | Notes |
|---------------------|------------------|-------|
| Hub / services | World Forge locations + In-World Chat | Social atmosphere, not state |
| Job / rumor board | Quest Hooks + GM narration | Phase C: deterministic hub board (prompt + World tab) |
| Expedition site | World Forge geography + travel | Danger from region/location |
| Findings | `discoveries.json` + inventory | Phase B: ledger prompt |
| Appraisal / repair | GM + Commerce | Phase D: turn ops; Phase F: condition/estValue canonicalize repair value |
| Market reaction | Commerce + Living World | `tradeOps` canonical |
| World reaction | Faction rep + world_state | Simulation when enabled |

## Discovery Ledger (Phase B)

Optional workspace file: `discoveries.json`

```json
{
  "version": 1,
  "entries": [
    {
      "id": "find_001",
      "kind": "material",
      "label": "Black metal shard",
      "status": "unidentified",
      "siteId": "north_metro",
      "valueHint": "old-world electronics housing"
    }
  ]
}
```

Discovery kinds match Campaign Kit: `material`, `lore`, `social`, `route`, `threat`, `quest`.

Statuses: `unidentified` → `identified` → `appraised` → `sold` / `consumed`.

When present, LoreRelay injects `[Campaign Discoveries]` into the GM prompt (priority 93, below Campaign Kit).

### discoveryOps (Phase D-lite)

GM may set `turn_result.discoveryOps` (max 8) when Campaign Kit is active:

```json
{
  "discoveryOps": [
    { "op": "add", "id": "find_metro_shard", "label": "Warm black shard", "discoveryKind": "material", "siteId": "north_metro", "status": "unidentified" },
    { "op": "update", "id": "find_metro_shard", "status": "appraised", "identifiedLabel": "Pre-collapse relay housing" }
  ]
}
```

Core persists to `discoveries.json` on turn apply.

### Appraisal state machine (Phase D)

Valid transitions: `unidentified` → `identified` → `appraised` → `sold` / `consumed`. Backward transitions are ignored by core.

- Setting `identifiedLabel` on an `unidentified` entry auto-promotes to `identified`.
- World tab **Request appraisal** / **Complete appraisal** inserts player intent into chat (GM responds with `discoveryOps`).

### Services state machine — condition & value (Phase F)

Repair/upgrade services now change a find's *canonical* value instead of only its description. `DiscoveryEntry` gained two optional fields:

- `condition`: `"standard"` (default) | `"repaired"` | `"upgraded"` | `"damaged"`
- `estValue`: GM base price estimate (integer, clamped 0–999999)

`computeSuggestedSellValue(entry)` = `estValue × multiplier` where standard=1x, repaired=1.3x, upgraded=1.6x, damaged=0.6x. The ledger prompt shows `[condition] ~suggestedValue` next to each entry once it's no longer `unidentified` — this stays vague pre-appraisal by design (no leak of value/condition before identification).

**Gating (`isServiceableStatus` / `resolveDiscoveryConditionAfterPatch` in `discoveryAppraisalCore.ts`):** a `condition` change only applies when the entry's resulting status is `identified` or `appraised`. Condition ops on `unidentified`, `sold`, or `consumed` entries are silently ignored by core — you have to know what you found before you can repair it, and you can't service something already sold. `estValue` has no such gate (it's a GM-side estimate, not a player-visible number until the entry is identified).

```json
{
  "discoveryOps": [
    { "op": "update", "id": "find_metro_shard", "condition": "repaired", "estValue": 180 }
  ]
}
```

GM guidance: anchor the negotiated `sell_discovery` price near the ledger's suggested value when one is shown; price/stock still route through Commerce `tradeOps`, condition/value state stays in `discoveryOps`.

## Job/Rumor Board (Phase C)

When Campaign Kit is active and World Forge has expedition sites, LoreRelay builds a deterministic hub board from kit genre + geography (seed: `worldSeed`, hub id, `worldTurn`). Entries are guidance prompts — accepting a posting does not auto-create quest hooks.

GM prompt chunk: `[Campaign {jobBoardLabel} @ Hub]` (priority 92, char cap 1400).

World tab **Campaign** panel shows:

- **Findings** — active `discoveries.json` entries (no GM-only `valueHint`)
- **Job board** — generated postings with **Inquire** (chat) and **Accept job** (creates active `questHooks` entry, `source: campaign`)

## Implementation Phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **A** Schema + presets + GM prompt | **done** | `campaignKitCore.ts`, `campaign_kit.json` |
| **B** Discovery ledger | **done** | `discoveries.json`, `discoveryLedgerCore.ts` |
| **C** Job/Rumor board runtime | **done** | Deterministic hub board + GM prompt (`campaignJobBoardCore.ts`) |
| **D** Appraisal state machine | **done** | Status transitions + GM guidance; webview appraisal request; `discoveryOps` persist |
| **E** Genre preset packs | **done** | 7 built-in genre presets (all `CampaignKitGenre` covered) + `scrapbound-settlement` sample |
| **F** Services state machine | **done** | `condition`/`estValue` on `DiscoveryEntry`, `computeSuggestedSellValue`, serviceable-status gating |

## Sample Workspace

[`sample-scenarios/scrapbound-settlement`](../sample-scenarios/scrapbound-settlement) — post-apocalyptic scavenger demo with Campaign Kit, discoveries seed, and Commerce.

Quickstart: [`CAMPAIGN_KIT_QUICKSTART.md`](CAMPAIGN_KIT_QUICKSTART.md)

## Prompt Budget

| Chunk | Priority | Char cap |
|-------|----------|----------|
| Campaign Kit | 94 | 1800 |
| Discovery Ledger | 93 | 1200 |
| Campaign Job Board | 92 | 1400 |

All three rank above Domain/Guild simulation helpers so genre loop guidance survives eviction.
