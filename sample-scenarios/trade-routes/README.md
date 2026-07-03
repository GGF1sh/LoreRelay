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
8. **Bonds (LW3, v1.29+)** — Elda and Marcus both start at Elda's Shop. Let several world turns pass (travel, rest, `elapsedWorldTurns`); their affinity grows by co-location (+3/tick). Once it crosses 30, the GM prompt gains `[Living World — Bonds]` with 「Elda と Marcus: 友好」 — ask the GM about them and it should narrate the two as acquainted, as hearsay. A conflict event (`recentChanges` with `category: "conflict"` or severity `critical`) pushes cross-faction pairs apart instead (merchants vs smiths).
9. **Bonds feed the world (LW3-W, v1.30+)** — Keep going until Elda×Marcus reach **ally (≥70)**, then move one of them to another market (agency or `npcAgencyOps`). Shared commodities at **both** markets now gain +1 stock/tick (ally trade route) — watch the Markets table drift upward. Conversely, seed an enemy pair (edit `world_state.npcRelationships` to `-80`) and watch `priceIndex` creep up at their locations. **Introduction:** set Marcus `playerTrust: 20` (unknown) while Elda is 100 and allied — Marcus becomes visible in whereabouts (introduced, effective 75).
10. **Life events (LW3-L, v1.31+)** — Keep the bond climbing. At **85** the pair reaches 「盟友の契り」(sworn allies); at **95** 「離れがたい仲」(inseparable). Each fires **once** as a hearsay world event ("EldaとMarcusは固い盟友の契りを結んだ") that the GM narrates, and shows as a badge (🛡️/💠) on the Bonds row. Then seed a fallout (edit `npcRelationships` to `-5`) — a couple that had sworn allies becomes 「決別」(💔). These milestones persist in `world_state.npcMilestones`. The GM interprets "inseparable" to fit the world (deep friendship, romance, sworn kin).
11. **Your bonds (LW3-P, v1.32+)** — Now it's about **you**. Raise Elda's `disposition.playerTrust` to **85** (help her, GM `dispositionDelta`, or edit the registry) — a one-time event fires (「Eldaはあなたを固い盟友と認めた」), the GM prompt gains `[Living World — Your Bonds]` with `★ Elda: sworn ally`, and the World tab Bonds section shows 「あなた × Elda 🤝固い盟友」. Try romance ≥80 (💗), trust ≤15 (⚔️ nemesis), fear ≥80 (😨), or betray a sworn ally by dropping trust ≤25 (💔背信). Milestones persist in `world_state.playerNpcMilestones`.
12. **Bond economics (LW3-P2, v1.32+)** — With Elda your sworn ally **and present at the market**, buy or sell there: your net spend gets **10% back** (buy 100 → effective 90). If a nemesis runs the market instead, you pay **10% more**. An estranged former ally gives no favor. Watch the Caravan credits after each trade.

Quickstart: [`docs/LIVING_WORLD_QUICKSTART.md`](../../docs/LIVING_WORLD_QUICKSTART.md) · Full manual: [`testing_checklist.md`](../../testing_checklist.md) §9b–9c.

## World tab signals

- **Caravan** — credits, food, transport, cargo; **playerRole** select when Commerce UI ON.
- **Markets** — current location prices; **Buy/Sell** when Commerce UI ON.
- **NPC Whereabouts** — trust-based precision (exact / region / unknown); reason when high trust.

## Debug sandbox only

In `debug-sandbox`, you can also say **「小麦相場を2倍に」** to bump `priceIndex` at the current market.

## Flags OFF behavior

With `enableCommerce: false`, the story still runs; numeric panels hide and the GM should not rely on `tradeOps`.