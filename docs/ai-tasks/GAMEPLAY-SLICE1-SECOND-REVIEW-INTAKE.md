# Gameplay Slice 1 — Second Review Intake

Date: 2026-07-07 JST
Target: `The Fading Spike` design repair
Repair commit: `a6070a193a69f10d067fd1cca2dd23bf360413a6`
External second-review verdict: `SLICE1_SECOND_ADVERSARIAL_PASS`
Integrator verdict: **PASS REJECTED — CODE-GROUNDING ERRORS**

## Decision

Do not advance to implementation.

The second review correctly confirms some repair points, but its PASS depends on several claims that are not true at the exact code baseline `4b9db3016cdb89d9520166040a2471098adeea04`.

The design remains repairable, but the current `SLICE1_SECOND_ADVERSARIAL_PASS` is invalid.

## Confirmed review errors

### S2 / R2 — food does not occupy cargo capacity

The second review claims that transport capacity must fit both profitable goods and travel food.

At the baseline:

- `PlayerCommerceState.food` is a separate scalar field.
- cargo is `CargoEntry[]`.
- `cargoFits()` checks commodity cargo weight against transport capacity.
- `computeFoodConsumption()` uses cargo weight to calculate how much food is consumed, but it does not place food inside cargo capacity.

Therefore the claimed `goods + food must fit capacity` behavior does not exist.

### S2 / R2 — insufficient food is not yet an existing deterministic travel block

The current travel path computes `plan.foodCost`, but travel execution is still AI-mediated through `buildLivingWorldTravelPromptContext()`.

The existing path instructs the AI to emit `elapsedWorldTurns` and a location state patch. It does not currently provide the required direct AI-off food deduction / insufficient-food rejection seam.

Therefore `trip is physically impossible in the current simulation when food is insufficient` is not established by the baseline.

### R3 — no existing capacity reservation for food

The repair's R3 depends on reserving cargo space for `plan.foodCost`, reducing profitable cargo quantity.

That coupling does not exist in the baseline. R3 is invalid as written.

### S1 / R1 — market recovery is conditional, not guaranteed decay

`tickMarketRecovery()` only reduces `priceIndex` by `0.05` when stock is at or above target.

When stock is below `targetStock * 0.3`, the same function raises `priceIndex` by `0.05` instead.

Therefore an event-linked remote premium does not automatically decay across travel days. Any winning/losing state that relies on guaranteed per-tick decay must prove the stock condition.

### S1 / R1 — reputation drift is toward a target, not indefinite premium support

`tickFactionReputationMarketDemand()` drifts price toward `1 + reputation bias`.

It can raise or lower the current price depending on the current `priceIndex` relative to that target.

The repair may use this asymmetry only with concrete values that prove the direction at departure and through the tested interval.

### Attribution — event evidence must match actual event application semantics

`applyWorldEventsToMarkets()` applies food/steel effects by semantic event type and `regionId` target; without a region it can apply to all markets.

The repaired attribution logic must not infer causality merely because a `recentChanges` message names a location or commodity. It must use evidence aligned with the actual production rule that could have affected that market/commodity.

### Dominant scanner — no-ranking does not by itself resolve the blocker

Removing an automatic ranking or expected-profit calculator is useful, but it does not prevent a player from manually scanning globally visible raw market data and doing the same comparison.

The second review's statement that no-ranking `effectively blocks` spreadsheet optimization is not proven.

This blocker remains open until either:

- the repaired slice demonstrates meaningful competing feasible states using existing mechanics; or
- the AI-off playtest shows that players do not converge on the same scan-and-run routine.

## What remains valid from the repair

These repair decisions remain accepted:

- reduce the explicit response set to `Run` vs `Sell local now`;
- remove `Decline / Hold` as a formal choice;
- use non-exclusive attribution labels;
- remove `fading / standing` certainty claims;
- add no ranking or expected-profit calculator;
- keep hybrid UX validation separate from true AI-off gameplay validation;
- do not reopen R1–R4 from the first adversarial intake.

## Minimum repair required now

Revise only the invalid examples and unsupported claims.

The next repair must:

1. remove all assumptions that food consumes cargo capacity;
2. not use insufficient-food blocking as an existing behavior before the direct travel seam exists;
3. replace R3 with a fully existing-state counterexample;
4. make every recovery-based example state the stock condition required for price decay;
5. make every reputation-based example state concrete current values and target direction;
6. align event attribution with actual `applyWorldEventsToMarkets()` semantics;
7. stop claiming no-ranking alone resolves the global scanner risk;
8. define which part is design-ready now and which blocker must remain for the 30-minute playtest.

## Closed scope remains closed

Do not add:

- new Ledger;
- new Ops;
- new simulation subsystem;
- Town Action Budget;
- information freshness system;
- randomness;
- route risk;
- reload/persistence redesign.

## Next lifecycle state

`SECOND_REVIEW_PASS_REJECTED → DESIGN_REPAIR_REQUIRED`
