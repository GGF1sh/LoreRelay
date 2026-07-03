# Campaign Kit Quickstart

Campaign Kit adds a **genre-agnostic play loop** to LoreRelay without forking the engine per setting.

> Full design: [`CAMPAIGN_KIT_DESIGN.md`](CAMPAIGN_KIT_DESIGN.md)

## Core loop (any genre)

```
Hub → Job/Rumor Board → Expedition Site → Findings → Appraisal/Services → World Reaction
```

Post-apocalyptic scavenger, fantasy guild, space frontier, eastern fantasy, and cyberpunk courier are built-in presets.

## Fastest path: Scrapbound sample

1. Open [`sample-scenarios/scrapbound-settlement`](../sample-scenarios/scrapbound-settlement) as workspace.
2. Reload LoreRelay webview.
3. Play from the opening scene — notice board, ruin run, salvage, appraisal.

Files to notice:

| File | Role |
|------|------|
| `campaign_kit.json` | Custom loop labels (overrides preset) |
| `game_rules.json` | `enableCampaignKit: true` |
| `discoveries.json` | Active findings injected into GM prompt |
| `world_forge.json` | Ruin sites and settlement geography |

## Enable in your own workspace

### Option A — Built-in preset (simplest)

`game_rules.json`:

```json
{
  "enableCampaignKit": true,
  "campaignKitId": "postapoc_scavenger"
}
```

Preset IDs: `classic_fantasy_guild`, `postapoc_scavenger`, `space_frontier`, `eastern_fantasy`, `cyberpunk_courier`.

### Option B — Custom kit file

Create `campaign_kit.json` in workspace root. This **overrides** `campaignKitId`.

### Option C — Theme auto-detect

Set `enableCampaignKit: true` without `campaignKitId`. LoreRelay infers from `world_forge.json` `meta.theme` (e.g. `post-apocalyptic scavenger ruins` → `postapoc_scavenger`).

## Discovery Ledger (Phase B)

`discoveries.json` tracks expedition findings:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "find_001",
      "kind": "material",
      "label": "Warm black metal shard",
      "status": "unidentified",
      "siteId": "north_metro",
      "valueHint": "likely old-world electronics housing"
    }
  ]
}
```

Statuses: `unidentified` → `identified` → `appraised` → `sold` / `consumed`.

GM sees `[Campaign Discoveries]` in prompt. **Canonical updates** still go through `turn_result` — the ledger is guidance + player-facing memory.

## Pair with existing systems

| Goal | Enable in `game_rules.json` |
|------|----------------------------|
| Buy/sell salvage | `enableCommerce` + `enableCommerceUi` |
| NPC movement | `enableNpcAgency` |
| Structured quests | Quest Hooks (simulation) |
| Long campaign memory | Chronicle (default) |
| Tavern chatter | In-World Chat |

## Genre mapping cheat sheet

| Universal concept | Post-apoc | Fantasy | Space | Eastern |
|-------------------|-----------|---------|-------|---------|
| Hub | Scrap town | Guild hall | Starport | Inn / sect |
| Site | Ruins | Dungeon | Derelict | Spirit mountain |
| Appraisal | Fixer | Sage | Decode | Divination |
| Loot | Salvage | Treasure | Cargo/data | Relic |

## Next phases (not yet runtime-automated)

- **Phase C** — Job/Rumor board generation tied to Quest Hooks
- **Phase D** — Appraisal state machine (unidentified → identified) via turn ops
- **Phase E** — Genre preset packs in scenario import

Until then, GM + Commerce + discoveries file give a strong scavenger-loop feel.