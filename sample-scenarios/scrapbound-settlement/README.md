# Scrapbound Settlement Sample

Post-apocalyptic **Campaign Kit** demo inspired by hub-life scavenger loops (ruin runs, unidentified salvage, appraisal, market trade).

## Quick start

1. Open `sample-scenarios/scrapbound-settlement` as a LoreRelay workspace (or copy into your play folder).
2. Confirm `game_rules.json` has `enableCampaignKit` + Commerce ON.
3. Reload webview. GM prompts include **Campaign Kit** + **Discoveries** when `discoveries.json` exists.

## What this exercises

| Layer | File | Purpose |
|-------|------|---------|
| Genre loop | `campaign_kit.json` | Hub → notice board → ruin → salvage → appraisal |
| Preset fallback | `game_rules.campaignKitId` | `postapoc_scavenger` when custom kit removed |
| Findings | `discoveries.json` | Unidentified salvage + rumor seeds for GM |
| Economy | Commerce + `world_state.json` | Buy supplies, sell parts |
| Geography | `world_forge.json` | Market row, factory yard, metro entrance |

## Suggested playthrough

1. Read the notice board (opening options).
2. Buy food or a filter mask at Market Row.
3. Enter **Dead Factory Yard** or **North Metro** — GM should frame hazards.
4. Return with salvage; `discoveries.json` entries should stay vague until appraisal.
5. Sell via Commerce UI or GM `tradeOps`.

## Docs

- [`docs/CAMPAIGN_KIT_QUICKSTART.md`](../../docs/CAMPAIGN_KIT_QUICKSTART.md)
- [`docs/CAMPAIGN_KIT_DESIGN.md`](../../docs/CAMPAIGN_KIT_DESIGN.md)