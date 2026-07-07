# Gameplay Slice 1 — Repair 2 Integrator Review

Date: 2026-07-07 JST
Target: `The Fading Spike`
Repair 2 commit: `a98a2217c786dfdfffaea6017f27721574906cc1`
Code baseline: `4b9db3016cdb89d9520166040a2471098adeea04`
Integrator verdict: `SLICE1_REPAIR2_NOT_READY`

## Decision

Repair 2 is materially better grounded than Repair 1 and correctly fixes the food/cargo-capacity confusion, insufficient-food blocking claim, conditional recovery rule, reputation-target direction, and open scanner status.

However, several remaining examples still do not survive exact baseline evaluation. Do not implement from Repair 2 yet.

The next repair should be small and example-focused. Do not reopen accepted UX decisions.

## Accepted from Repair 2

Keep these decisions unchanged:

- exactly two explicit responses: `Run the spike` and `Sell local now`;
- `Decline / Hold` remains removed;
- food does not occupy cargo capacity;
- insufficient food is depletion, not a deterministic departure block;
- recovery decay is conditional on `stock >= target`;
- reputation drift converges toward `1 + bias`;
- non-exclusive attribution remains preferable to a single-cause chip;
- `fading / standing` certainty remains removed;
- no ranking / expected-profit calculator;
- dominant-scanner risk remains an empirical playtest blocker;
- hybrid UX test is not a true AI-off gameplay pass.

## Remaining code-grounding blockers

### I1 — Profit comparisons must use `unitPrice`, not `priceIndex` alone

`computeUnitPrice()` uses:

```text
basePrice * priceIndex * supplyBias
```

and rounds the result.

The sample markets have different `supplyBias` values:

- Elda's Shop: `1.0`
- South Port: `1.15`

Therefore Repair 2 Pair 1 is not valid as written.

Its example compares:

```text
local priceIndex 1.20
vs
remote arrival priceIndex 1.15
```

For wheat in the bundled sample:

```text
local unitPrice = round(10 * 1.20 * 1.0) = 12
remote unitPrice = round(10 * 1.15 * 1.15) = 13
```

The supposedly worse remote arrival is still better in credits.

The same problem affects Pair 2. Every concrete `Run` vs `Sell local` example must compare actual quoted `unitPrice` and quantity, not index alone.

### I2 — Repair 2 uses four-day sample examples where the bundled route is shorter

The bundled sample graph has:

```text
elda_shop <-> south_port
```

as one direct hop.

With wagon `speed = 1`, `planTravel()` returns one day for that route. North Farm to South Port is two hops and therefore two wagon days.

Repair 2 repeatedly uses `plan.days = 4` while also grounding itself in the bundled sample constants. The UI preview path does not pass a `narrativeDays` override.

Concrete sample examples must use actual route days, or clearly switch to a different hypothetical forge instead of claiming bundled-sample grounding.

### I3 — Food has no existing credit replacement value

The chat-only Gemini Revision 2 proposes:

```text
net profit = remote gross margin - local replacement cost of food
```

and treats food as a fixed credit travel cost.

That conversion does not exist in the baseline:

- `PlayerCommerceState.food` is a separate scalar resource;
- the bundled commerce forge has only wheat, steel, and spice commodities;
- no canonical food-to-credit replacement price is defined.

Food is a real scarce resource and opportunity cost, but the design cannot claim `net credit loss` by subtracting food units from credits without a new valuation rule.

Therefore the Gemini S2/R2 and its capacity-vs-fixed-food-cost R3 are not accepted.

### I4 — Repair 2 Pair 2 gives steel an impossible price-raising event

Repair 2 says an event stacked on hostile South Port and pushed steel `priceIndex` to `1.40`.

At the baseline, the steel event rule does the opposite:

```text
steel stock += 3
steel priceIndex -= 0.1
```

A steel value above the hostile target can still exist, but the example must derive it from a valid existing state path and state the stock band so `tickMarketRecovery()` does not contradict the claimed reputation-only downward path.

### I5 — Repair 2 Pair 3 is not coherent with the bundled sample market graph

Repair 2 uses a remote South Port spice spike and says only five spice units can be added because the wagon already carries weight 15.

But in the bundled sample:

- spice is traded only at South Port;
- Elda's Shop does not sell spice;
- North Farm does not sell spice.

The player cannot buy five spice at the current market and then run that spice to South Port.

The capacity example must use a commodity that is both available/held at the current location and sellable at the remote destination, or explicitly define the player as already holding that commodity and make `Sell local now` available for the same goods.

### I6 — Event attribution must distinguish historical linkage from current causal share

Repair 2 correctly aligns event matching with production semantics, but a matching recent event only proves that the event rule applied to that market/commodity at some point.

Later recovery, reputation drift, low-stock pressure, and trades may all change the current price.

The UI may truthfully say `recent event` or `event-linked`; it must not imply that the event is the exclusive or quantified cause of the current deviation.

The accepted multi-label approach already supports this. Keep wording non-exclusive.

## Scanner blocker

No design-only document can prove the dominant scanner problem closed while all remote raw market data remains visible.

This is not a reason to invent an information-freshness subsystem.

After the factual example repair, the scanner blocker should remain an explicit empirical Gate for the 30-minute playtest.

## Minimum Repair 3 contract

Revise examples only.

1. Compare actual `unitPrice`, including `supplyBias` and rounding.
2. Use actual `plan.days` for the bundled sample, or stop claiming sample-specific grounding.
3. Do not convert food units into credits.
4. Replace the invalid steel event path.
5. Replace the invalid South Port spice acquisition/capacity example.
6. Keep attribution wording as non-exclusive historical linkage/evidence.
7. Keep the scanner blocker open for playtest.

Do not change the accepted two-choice UX, attribution structure, scope limits, or test boundary.

## Next lifecycle state

`DESIGN_REPAIR_REQUIRED` remains unchanged.
