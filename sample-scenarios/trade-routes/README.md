# Trade Routes Sample

Purpose: exercise Living World commerce, travel turns, since-last-visit market snapshots, and NPC whereabouts in a tiny route.

## Quick start

1. Open this folder as a LoreRelay workspace (or copy into your play workspace).
2. Confirm `game_rules.json` has Commerce + NPC Agency ON.
3. Reload the webview and open the **World** tab.

## Playthrough (acceptance checklist)

1. **Buy wheat** — At North Farm or Elda's Shop, ask the GM to buy wheat (e.g. "小麦を10買う"). Inspector should show `turn_result.tradeOps`.
2. **Travel to South Port** — e.g. "南港へ3日かけて旅する". GM should set `elapsedWorldTurns`; your **Caravan** food drops; markets tick during travel.
3. **Since last visit** — Return to a location you left; GM prompt may include `[Living World — Since last visit]` with stock/price deltas.
4. **Sell for profit** — Sell wheat at South Port; World tab **Caravan** credits should increase.
5. **World keeps moving** — Run a few turns elsewhere, then return. Marcus may restock steel (Tier 1); Elda may move ports (Tier 2 NPC agency).

## World tab signals

- **Caravan** — credits, food, transport, cargo (read-only).
- **Markets** — North Farm / Elda's Shop / South Port prices.
- **NPC Whereabouts** — Elda and Marcus; reason text when agency moves them.

## Debug sandbox only

In `debug-sandbox`, you can also say **「小麦相場を2倍に」** to bump `priceIndex` at the current market.

## Flags OFF behavior

With `enableCommerce: false`, the story still runs; numeric panels hide and the GM should not rely on `tradeOps`.