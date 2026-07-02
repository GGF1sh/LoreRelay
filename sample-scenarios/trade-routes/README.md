# Trade Routes Sample

Purpose: exercise Living World commerce, travel turns, since-last-visit market snapshots, and NPC whereabouts in a tiny route.

## Quick start

1. Open this folder as a LoreRelay workspace (or copy into your play workspace).
2. Confirm `game_rules.json` has Commerce + NPC Agency ON.
3. Reload the webview and open the **World** tab.

## Playthrough (acceptance checklist)

1. **Buy wheat (UI)** — v1.26+: at Elda's Shop, use World tab **Buy** on wheat (or GM `tradeOps` path). Caravan cargo/credits update.
2. **Travel to South Port** — e.g. "南港へ3日かけて旅する". GM should set `elapsedWorldTurns`; **Caravan** food drops; markets tick during travel.
3. **Since last visit** — Return to a location you left; GM prompt may include `[Living World — Since last visit]` with stock/price deltas.
4. **Sell for profit** — Sell wheat at South Port (UI Sell or GM); credits increase.
5. **World keeps moving** — Run a few turns elsewhere, then return. Marcus may restock steel; Elda may move ports (NPC agency).
6. **playerRole** — Change role in Caravan; GM `[Living World — Caravan]` should show role motivation (v1.27+).
7. **Trust whereabouts** — Edit Elda `playerTrust` to 20 / 50 / 80; World tab + GM whereabouts precision changes (v1.27+). At ≤30, DevTools must not expose `locationId` (v1.27.1).

Quickstart: [`docs/LIVING_WORLD_QUICKSTART.md`](../../docs/LIVING_WORLD_QUICKSTART.md) · Full manual: [`testing_checklist.md`](../../testing_checklist.md) §9b–9c.

## World tab signals

- **Caravan** — credits, food, transport, cargo; **playerRole** select when Commerce UI ON.
- **Markets** — current location prices; **Buy/Sell** when Commerce UI ON.
- **NPC Whereabouts** — trust-based precision (exact / region / unknown); reason when high trust.

## Debug sandbox only

In `debug-sandbox`, you can also say **「小麦相場を2倍に」** to bump `priceIndex` at the current market.

## Flags OFF behavior

With `enableCommerce: false`, the story still runs; numeric panels hide and the GM should not rely on `tradeOps`.