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
| Appraisal / repair | GM + Commerce | Phase D: turn ops |
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

## Job/Rumor Board (Phase C)

When Campaign Kit is active and World Forge has expedition sites, LoreRelay builds a deterministic hub board from kit genre + geography (seed: `worldSeed`, hub id, `worldTurn`). Entries are guidance prompts — accepting a posting does not auto-create quest hooks.

GM prompt chunk: `[Campaign {jobBoardLabel} @ Hub]` (priority 92, char cap 1400).

World tab **Campaign** panel shows:

- **Findings** — active `discoveries.json` entries (no GM-only `valueHint`)
- **Job board** — generated postings with **Inquire** (inserts chat text)

## Implementation Phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **A** Schema + presets + GM prompt | **done** | `campaignKitCore.ts`, `campaign_kit.json` |
| **B** Discovery ledger | **done** | `discoveries.json`, `discoveryLedgerCore.ts` |
| **C** Job/Rumor board runtime | **done** | Deterministic hub board + GM prompt (`campaignJobBoardCore.ts`) |
| **D** Appraisal state machine | **partial** | `turn_result.discoveryOps` → `discoveries.json` (add/update/remove) |
| **E** Genre preset packs | partial | `scrapbound-settlement` sample |

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
