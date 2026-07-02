# Trade Routes Sample

Purpose: exercise Living World commerce, travel turns, since-last-visit market snapshots, and NPC whereabouts in a tiny route.

Suggested play:

1. Load the bundled `trade-routes` scenario pack.
2. Inspect the World tab. Markets should show North Farm, Elda's Shop, and South Port.
3. Ask the GM to travel to North Farm and buy wheat.
4. Travel to South Port and sell wheat.
5. Return to Elda's Shop after a few world turns.

Expected signs:

- `turn_result.tradeOps` appears in the Inspector after buy/sell turns.
- `turn_result.elapsedWorldTurns` advances world simulation during travel.
- The World tab market table changes as stock and `priceIndex` move.
- NPC Whereabouts shows Elda and Marcus, with movement if agency rules fire.
- The GM prompt can include a "Since last visit" block after returning to a location.
