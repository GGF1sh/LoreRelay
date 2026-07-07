# Gameplay Slice 1 — Design Repair 2

- AI: Claude
- Model: Claude Sonnet
- Reasoning: High
- Role: Gameplay UX / Decision Surface Repair Designer
- Source of Truth: GitHub main, verified against `4b9db30`
- Review packet: `review/gameplay-slice1`
- Repair baseline: `a6070a193a69f10d067fd1cca2dd23bf360413a6`
- Second review intake: `main:docs/ai-tasks/GAMEPLAY-SLICE1-SECOND-REVIEW-INTAKE.md` — `SECOND_REVIEW_PASS_REJECTED → DESIGN_REPAIR_REQUIRED`
- Repaired design: `The Fading Spike`

## Scope statement

This document fixes only the code-grounding errors the integrator confirmed in `GAMEPLAY-SLICE1-SECOND-REVIEW-INTAKE.md`. It is a patch over `GAMEPLAY-SLICE1-DESIGN-REPAIR.md`, not a rewrite.

**Unchanged — already accepted, not reopened:**

- the Decision Surface stays exactly two responses (`Run the spike`, `Sell local now`); `Decline / Hold` stays removed;
- non-exclusive attribution (multiple true cause labels, not one) stays the correct approach — only the *evidence rule* underneath it is corrected below;
- `fading` / `standing` certainty claims stay removed;
- no ranking or expected-profit calculator stays a rule;
- hybrid UX validation stays separate from true AI-off gameplay validation;
- R1–R4 from the first adversarial intake stay closed.

**Corrected below, and only below:** the two food/cargo-capacity examples, the missing stock/target conditions on recovery- and reputation-based examples, the attribution evidence rule, and the overclaim that removing ranking resolves the dominant-scanner risk.

All examples below are grounded in the bundled `sample-scenarios/trade-routes/world_forge.json` constants (wagon capacity 20, `foodPerDay` 2; wheat weight 1/basePrice 10; steel weight 2/basePrice 45; spice weight 1/basePrice 80; Elda's Shop `targetStock` 35; South Port `targetStock` 40) plus the literal constants in `worldSimCommerceCore.ts` and `transportCore.ts`. `plan.days` values below are illustrative round numbers, since the exact figure depends on the runtime location graph — everything else is a real constant or a real formula applied to concrete inputs.

---

## Corrected fact base

- `cargoWeight()` (`commerceCore.ts`) sums only `CargoEntry[]` — carried commodities. `PlayerCommerceState.food` is a separate scalar never added to this sum, and `cargoFits()` / `transportCapacity()` never look at food. **Food does not occupy cargo capacity.**
- `computeFoodConsumption(days, transport, cargoWeight)` (`transportCore.ts`) uses `cargoWeight` only to scale a multiplier: `cargoFactor = 1 + floor(cargoWeight / 20) * 0.1`. Heavier cargo makes travel burn more food per day — a real, existing cost — but this is not a capacity reservation.
- `applyTravelFoodConsumption()` (`livingWorldTurnOpsCore.ts`) deducts `foodCost` once `elapsedWorldTurns` advances and floors the result at `0` ("Never goes negative"). Travel itself is still committed through the AI-mediated `buildLivingWorldTravelPromptContext()` path, which has no deterministic pre-commit check that rejects departure for insufficient food. **Insufficient food is a real, guaranteed depletion cost, not an existing travel block.**
- `tickMarketRecovery()` only decays an elevated `priceIndex` (`-0.05`/tick) when `entry.stock >= target`. When `entry.stock < target * 0.3`, the same function *raises* `priceIndex` (`+0.05`/tick) instead. Between those two bands, this function leaves `priceIndex` unchanged. Any example that claims decay must state that the stock condition (`stock >= target`) holds for every tick claimed.
- `tickFactionReputationMarketDemand()` drifts `priceIndex` toward `target = 1 + REPUTATION_PRICE_BIAS[tier]` by at most `0.03`/tick, in whichever direction closes the gap. A hostile market (`rep <= -60`, bias `+0.25`, target `1.25`) drifts **up** while `priceIndex < 1.25` and **down** while `priceIndex > 1.25`. It is convergence toward a tier-specific target, not indefinite support for whatever premium already exists.
- `applyWorldEventsToMarkets()` applies exactly two production rules, both gated on `category === 'resource'` plus a message-keyword match, and targeted at `marketsInRegion(ev.regionId)` if `regionId` is set or **all markets** if it is not:
  - food-crisis keyword match (`food`/`wheat`/`食料`/`小麦`) → **wheat only**, `priceIndex += 0.35` (one-time, at the tick the event fires).
  - steel keyword match (`steel`/`鍛冶`/`smith`/`forge`) → **steel only**, `stock += 3` and `priceIndex -= 0.1` (a price *decrease*).

  There is no rule that raises price for any commodity other than wheat, and the steel rule lowers price. Attribution evidence must follow these two rules exactly, not a text search for the location or commodity name inside a `recentChanges` message.

---

## Item 8 / 9 — replacement examples (existing state only)

Three mechanically distinct pairs, each usable as both a "`Sell local now` is correct" state (item 8) and a "`Run` is wrong despite a higher remote quote" state (item 9), since both are the same underlying trade-off observed at two different moments (decision time vs. arrival time).

### Pair 1 — event-driven recovery decay (stock condition stated)

South Port, wheat, `targetStock = 40`. A food-crisis event (`category: 'resource'`, message matching the food keyword rule, `regionId` empty or `r_south`) fires while stock is already at `40` (`>= target`), bumping `priceIndex` from `1.0` to `1.35`.

**Required condition:** stock must stay `>= 40` for every subsequent tick. Recovery only adds stock (capped at target) and never removes it absent a sale, so this holds as long as no third party depletes it. Under that condition, `tickMarketRecovery`'s `stock >= target && priceIndex > 1` branch fires every tick: `-0.05`/tick.

Over `plan.days = 4`: `1.35 → 1.30 → 1.25 → 1.20 → 1.15`.

Meanwhile the player's current location, Elda's Shop, already shows wheat `priceIndex = 1.20` right now — a real, already-established value from wheat stock there sitting below `targetStock(35) * 0.3 = 10.5` for some time (the same recovery function's *rising* branch, already resolved into the current number, so no forward modeling of the local side is needed).

- **S1:** Selling the held wheat at Elda's Shop now (`1.20`) beats traveling to South Port, where the wheat premium — despite reading `1.35` at the moment of the decision — decays to `1.15` by arrival under the stated stock condition.
- **R1 (mirrored):** `Run` is wrong here precisely because the nominally higher `1.35` quote is not the arrival quote; the guaranteed `1.20` locally is.

### Pair 2 — reputation drift toward a tier target (concrete current value and direction stated)

South Port is controlled by `faction_port`. Player reputation with `faction_port` is `-70` → hostile tier → bias `+0.25` → target `1.25`.

**Sub-case a (drift upward):** current steel `priceIndex = 1.05` (below target). Each tick, `diff = 1.25 - 1.05 = 0.20 > 0.03`, so the full `+0.03`/tick step applies: `1.05 → 1.08 → 1.11 → 1.14` over 4 days — still climbing, still below target. (This direction does not, by itself, make `Run` wrong — it is included to show the asymmetry with Pair 1: reputation-driven premiums can grow in transit rather than decay, so the two mechanisms must not be treated interchangeably.)

**Sub-case b (drift downward, used for the S/R pair):** an event has stacked on top of the same hostile market, pushing current steel `priceIndex` to `1.40` — above the `1.25` target. Now `diff = 1.25 - 1.40 = -0.15`, so `-0.03`/tick applies: `1.40 → 1.37 → 1.34 → 1.31 → 1.28` over 4 days. The player's current location shows a separate, already-elevated local steel `priceIndex = 1.30` right now (its own recent food/steel-unrelated local pressure, already resolved into the current number).

- **S2:** Selling locally now at `1.30` beats the remote `1.28` reached after 4 days of reputation-driven downward convergence, even though the remote read `1.40` — higher than local — at decision time.
- **R2 (mirrored):** `Run` is wrong here because a hostile-market premium above its tier target is drifting down toward `1.25`, not standing still or growing.

### Pair 3 — cargo capacity limits achievable quantity (no food-capacity coupling)

Wagon, `capacity = 20`. The player is already carrying `15` weight of unrelated, already-committed cargo (existing `CargoEntry[]` for another errand). Remaining capacity for the spiking commodity is `20 − 15 = 5` weight.

South Port spice (weight `1`, `basePrice 80`) shows `priceIndex = 1.5`, itself explained by stock sitting below `targetStock(40) * 0.3 = 12` for some time (the recovery function's rising branch — a real, existing reason the premium is there and still climbing, not fading).

Only `5` units of spice can physically be added under `cargoFits()` / `transportCapacity()` regardless of how attractive the quoted `priceIndex` is — capacity is consumed by commodity weight alone, never by food. Carrying those `5` extra weight also raises `cargoWeight` from `15` to `20`, crossing `floor(20/20) = 1` in `computeFoodConsumption`'s `cargoFactor`, so the trip's real, non-blocking food cost is higher than a naive per-unit-price comparison would assume.

- **S3:** The achievable gain from `5` units at the elevated remote price, net of the higher real food cost the extra weight causes, is smaller than simply selling the already-held `15` weight of cargo locally now.
- **R3 (replaces the invalid R3):** `Run` is wrong despite the higher quoted unit price because existing cargo capacity — not food, and not any blocking rule — caps how much of that price the player can actually realize, while the existing cargo-weight-scaled food formula makes the trip cost more than the quoted price alone suggests.

---

## Item 10 — attribution evidence rule (corrected)

The non-exclusive multi-label approach from the first repair stays. What changes is which existing facts are allowed to turn a label on:

- **`event`** may be shown **only for wheat**, and only when a `category: 'resource'` change matching the food/wheat keyword rule has fired with a `regionId` that is either absent (global) or equal to this market's region. It is never shown for any other commodity, because no other commodity has a price-raising event rule in the baseline.
- Steel's only event rule *lowers* price and raises stock. It must never be offered as a cause of an elevated badge; if it is surfaced at all, it explains a dip, not a spike.
- **`reputation`** may be shown when the controlling faction's tier is not neutral, exactly as before.
- **`low stock`** may be shown when stock is below the existing low-stock threshold, exactly as before.

The rule that must be dropped is inferring `event` causality from a `recentChanges` message merely *naming* the location or commodity in its text. The production rule keys off `category` + keyword match + `regionId` targeting, not location/commodity name matching, so evidence must follow that same key.

---

## Item 7 (contract) / dominant-scanner blocker — left open, not claimed resolved

Removing automatic ranking and expected-profit calculation (kept from the first repair) prevents the *UI* from doing the arbitrage arithmetic for the player. It does not prevent a player from manually reading the same raw, globally visible per-card numbers and reaching the same scan-and-run conclusion by hand.

This repair does not claim the dominant-scanner risk (G1) is resolved. Items 8–9 above establish that the scan-and-run heuristic is not always correct under existing mechanics, which is necessary for a real decision to exist — but whether players actually stop converging on it is an empirical question this document cannot settle by design alone.

**This blocker stays open**, carried forward exactly as the integrator required: it is resolved only by the existing 30-minute AI-off-eligible playtest protocol (`Dominant-strategy repetition`: at least 2 different first choices across 3 spike instances) from the repair-1 design, not by this document's reasoning. No implementation or further design work is proposed to close it here.

---

## Correction to a carried-over claim in Repair 1

Repair 1's restated Commitment section said `Run` is "Blocked if food is insufficient or cargo cannot support the move." Per the corrected fact base above, only the cargo half of that sentence is true (`cargoFits()` / `transportCapacity()` are real gates on commodity weight). The food half is false at the current baseline — insufficient food is a guaranteed depletion (floored at `0`), not a block. This sentence is corrected to: **"Blocked if cargo capacity cannot support the added quantity; food is always deducted once travel resolves and floors at zero, but does not itself block departure."**

---

# Final Verdict

`SLICE1_REPAIR2_READY_FOR_INTEGRATOR_REVIEW`
