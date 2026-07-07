# Gameplay Slice 1 — Design Repair 3

- AI: Claude
- Model: Claude Sonnet
- Reasoning: High
- Role: Gameplay UX / Decision Surface Repair Designer
- Source of Truth: GitHub main, verified against `4b9db30`
- Review packet: `review/gameplay-slice1`
- Repair baseline: `a98a2217c786dfdfffaea6017f27721574906cc1`
- Integrator review: `main:docs/ai-tasks/GAMEPLAY-SLICE1-REPAIR2-INTEGRATOR-REVIEW.md` — `SLICE1_REPAIR2_NOT_READY`
- Repaired design: `The Fading Spike`

## Scope statement

This document fixes only the six remaining code-grounding blockers (I1–I6) the integrator confirmed against Repair 2. It replaces Repair 2's three concrete example pairs with numbers that survive exact baseline evaluation, and adds one wording clarification (I6). Nothing else changes.

**Unchanged — accepted, not reopened:**

- exactly two explicit responses: `Run the spike` and `Sell local now`;
- `Decline / Hold` remains removed;
- food does not occupy cargo capacity;
- insufficient food is depletion, not a deterministic departure block;
- recovery decay is conditional on `stock >= target`;
- reputation drift converges toward `1 + bias`, in whichever direction closes the gap;
- non-exclusive attribution remains preferable to a single-cause chip;
- `fading` / `standing` certainty remains removed;
- no ranking or expected-profit calculator;
- dominant-scanner risk remains an open, empirical playtest blocker;
- hybrid UX test is not a true AI-off gameplay pass.

**Not adopted:** any food-to-credit conversion or fixed replacement price for food (I3). Food stays an unpriced, real, existing resource cost throughout this document — it is never subtracted from or added to a credit total.

All examples below use the bundled `sample-scenarios/trade-routes/world_forge.json` constants exactly, including real route lengths from `planTravel()`'s own graph:

- `elda_shop.connectedTo = [north_farm, south_port]`, `south_port.connectedTo = [elda_shop]` → **`elda_shop ↔ south_port` is one hop, one wagon day** (`speed = 1`).
- commodities: wheat `{basePrice: 10, weight: 1}` (traded at all three locations), steel `{basePrice: 45, weight: 2}` (traded at `elda_shop` and `south_port` only).
- markets: `elda_shop` `{supplyBias: 1.0, targetStock: 35}`, `south_port` `{supplyBias: 1.15, targetStock: 40, factionControl: faction_port}`.
- wagon `{capacity: 20, foodPerDay: 2}`.
- `computeUnitPrice = round(basePrice * priceIndex * supplyBias)` — every comparison below uses this exact formula, not `priceIndex` alone (I1).

---

## Corrected Pair 1 — event-tail wheat, `elda_shop → south_port`, 1 real day (fixes I1, I2)

Player is at `elda_shop`. `south_port` is one hop away — the real `planTravel()` output is `days = 1`, used as-is.

- **Local, `elda_shop`, wheat, now:** current `priceIndex = 1.20` (an already-elevated existing value — `elda_shop`'s wheat stock has been sitting below `35 * 0.3 = 10.5` for some prior ticks, which is `tickMarketRecovery`'s existing rising branch). `unitPrice = round(10 * 1.20 * 1.0) = 12`.
- **Remote, `south_port`, wheat, at decision time:** current `priceIndex = 1.10` — the fading tail of an earlier food-crisis event (the only rule that raises wheat's price), already decayed most of the way back toward `1.0` by earlier ticks before this decision point. `unitPrice = round(10 * 1.10 * 1.15) = 13`. This is the higher quote the player sees.
- **Required stock condition:** `south_port` wheat stock must stay `>= 40` (`targetStock`) for the single travel day, so `tickMarketRecovery`'s `stock >= target && priceIndex > 1` branch fires once: `priceIndex → 1.05`.
- **Remote, at arrival:** `unitPrice = round(10 * 1.05 * 1.15) = 12`.

**Result:** the remote quote reads `13` at decision time — higher than the local `12` — but arrives at `12`, the same as selling locally right now. `Run` spends a real day and real food for the same credits `Sell local now` pays out immediately.

- **S1:** `Sell local now` (`12`, instantly) is at least as good as `Run` (`12`, after a day of real food and time and forfeiting whatever else `elda_shop` offered that day).
- **R1 (mirrored):** `Run` is wrong to choose on the strength of the `13` quote — that number does not survive the one real day the trip actually takes.

---

## Corrected Pair 2 — hostile-reputation steel, `elda_shop → south_port`, 1 real day (fixes I1, I2, I4)

Same route, same single real day. Steel is traded at both `elda_shop` and `south_port`.

- **Remote, `south_port`, steel, at decision time:** current `priceIndex = 1.30`, current stock `= 20`. This value is reached by a valid existing path that does **not** use the steel event rule (which only ever lowers steel's price): stock previously dipped below `40 * 0.3 = 12`, and `tickMarketRecovery`'s rising branch pushed `priceIndex` up to `1.30` over those earlier ticks. Stock has since recovered to `20`, which is inside the band `12 <= stock < 40` — **too high for the rising branch, too low for the `stock >= target` decay branch** — so from this point on, `tickMarketRecovery` does not move this `priceIndex` at all; only reputation drift acts on it going forward.
- `south_port` is controlled by `faction_port`; player reputation there is `-70` → hostile tier → bias `+0.25` → target `1.25`. Current `1.30 > 1.25`, so `tickFactionReputationMarketDemand` drifts it **down**: `diff = 1.25 - 1.30 = -0.05`, step `= -min(0.05, 0.03) = -0.03`.
- `unitPrice` at decision time `= round(45 * 1.30 * 1.15) = 67`.
- After the one real travel day: `priceIndex → 1.27`, `unitPrice = round(45 * 1.27 * 1.15) = 66`.
- **Local, `elda_shop`, steel, now:** current `priceIndex = 1.46` (an already-elevated existing local value). `unitPrice = round(45 * 1.46 * 1.0) = 66`.

**Result:** remote reads `67` — higher than local's `66` — at decision time, but arrives at `66`, tying local.

- **S2:** `Sell local now` (`66`, instantly) matches what `Run` delivers (`66`) after a real day of food, time, and forfeited local opportunity, despite the remote quote reading higher (`67`) when the player had to decide.
- **R2 (mirrored):** `Run` is wrong to choose here because a hostile-market premium already above its reputation target is drifting down, not standing still, while the player travels toward it.

---

## Corrected Pair 3 — cargo-capacity-limited wheat, `elda_shop → south_port`, 1 real day (fixes I1, I2, I5)

Same route, same real day. Wheat is used here specifically because it is sold at **both** `elda_shop` and `south_port` (fixing Repair 2's spice example, which used a commodity `elda_shop` never trades).

The player is already carrying `9` units of steel (weight `2` each `= 18` weight) for an unrelated, already-committed purpose. Wagon `capacity = 20`, so only `20 − 18 = 2` weight of capacity remains — enough for `2` wheat units (weight `1` each), and no more, regardless of how attractive the remote quote looks. This is `cargoFits()` / `transportCapacity()` exactly as they exist; food is not part of this calculation.

- **Local, `elda_shop`, wheat, now:** `priceIndex = 1.20`, `unitPrice = 12` (same figure as Pair 1's local value; both stem from the same existing low-stock condition at `elda_shop`). Selling the `2` units achievable under the capacity limit now: `2 × 12 = 24` credits.
- **Remote, `south_port`, wheat, at decision time:** `priceIndex = 1.10`, `unitPrice = 13`. For the same `2` units: `2 × 13 = 26` credits — the higher-looking option.
- **Required stock condition:** `south_port` wheat stock `>= 40` for the one travel day, so `priceIndex → 1.05` on arrival, `unitPrice = round(10 * 1.05 * 1.15) = 12`. For `2` units: `2 × 12 = 24` credits.

**Result:** at only `2` units — the actual achievable quantity under existing cargo capacity, independent of food — the remote trip arrives at the same `24` credits as selling locally now, after real food and a real day are spent to get there.

- **S3:** `Sell local now` for the `2` achievable units (`24`, instantly) is at least as good as `Run`ning them (`24`, after a day of real cost), and existing cargo capacity — not any new mechanic — is why only `2` units were ever on the table.
- **R3 (replaces the invalid R3):** `Run` is wrong here not because of a blocking rule, but because the quantity that existing capacity actually allows is small enough that the higher per-unit quote does not translate into a better outcome once the trip's real (unpriced) cost is paid.

---

## I6 — attribution wording clarification

The non-exclusive, production-rule-aligned evidence from Repair 2 stays exactly as specified. The wording it renders is narrowed: a matched `event` label means only that the matching production rule (the food-crisis rule, for wheat) applied to this market/commodity at some point in the tracked history — for example Pair 1's `south_port` wheat, where the badge should read something like `event-linked` rather than implying the event is still the current, exclusive, or fully quantified reason for the remaining `0.10` premium. Recovery, reputation drift, low stock, and trades can all move price after the event fired, exactly as Pair 1 shows. The label states historical linkage, not a claim about the present size of that linkage's contribution.

---

## Scanner blocker — unchanged, still open

As in Repair 2: no ranking or expected-profit calculator is added, and this document does not claim the dominant-scanner risk (G1) is resolved. It remains an explicit, empirical Gate for the existing 30-minute AI-off-eligible playtest protocol. No new mechanic, information system, or valuation rule is proposed to close it here.

---

# Final Verdict

`SLICE1_REPAIR3_READY_FOR_FINAL_INTEGRATOR_REVIEW`
