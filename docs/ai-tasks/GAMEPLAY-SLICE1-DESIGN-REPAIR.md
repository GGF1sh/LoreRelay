# Gameplay Slice 1 — Design Repair

- AI: Claude Sonnet
- Role: Gameplay UX / Decision Surface Repair Designer
- Source of Truth: GitHub main, verified against `4b9db30`
- Review packet: `review/gameplay-slice1`
- Adversarial review: `dc54d4f` — `SLICE1_NOT_READY`
- Integrator intake: `main:docs/ai-tasks/GAMEPLAY-SLICE1-ADVERSARIAL-INTAKE.md`
- Repaired design: `The Fading Spike`

## Scope statement

This document repairs `docs/ai-tasks/GAMEPLAY-SLICE1-DECISION-SURFACE-DESIGN.md` against the integrator's **Minimum repair contract only** (14 items). It does not re-open any finding the integrator already closed, and it does not add anything the contract did not ask for.

**Not re-litigated (integrator already closed these):**

- R1 — `Decline` will not be made to advance time.
- R2 — no information-freshness, discovery, or visibility-economy state.
- R3 — no randomness added to manufacture uncertainty.
- R4 — reload/persistence/replay behavior is out of scope for this slice.

Everything below addresses only the 14 numbered items in the Minimum repair contract, in order.

---

## 1–6. Structural constraints

No new Ledger, Ops family, simulation subsystem, Town Action Budget, information-freshness system, or default-added state variable is introduced anywhere in this repair. Every change below is either a UI rendering/labeling change over already-existing fields (`priceIndex`, `recentChanges`, `factionReputations`, `plan.days`, `plan.foodCost`, `cargoWeight`, `capacity`) or a reduction of the response set. No field is added to `world_state.json`, `game_state.json`, or any patch/op payload.

## 7. Decision Surface reduced to two responses

`Decline / Hold` is removed as a labeled, explicit response.

Per the integrator's G2, `Decline / Hold` only counts as a meaningful response if it commits an existing scarce resource through a real action. No existing action does that without either (a) inventing a cost for declining, which R1 already forbids, or (b) inventing new state, which item 6 forbids. There is no way to satisfy G2 for a third explicit response inside the contract, so the contract's fallback ("reduce ... to two proven responses if necessary") applies.

The repaired **v0 Decision Surface is exactly two responses**:

- **Run the spike**
- **Sell local now**

A player who does neither is not choosing a designed third option — they are simply doing something else the game already allows (resting, trading a different commodity, pursuing a quest). If that other existing action advances time, the opportunity changes as a side effect, exactly as it already would today. This is the same resolution the integrator specified for R1: stop presenting a no-op as a formal choice, rather than taxing it.

## 8. Three concrete states where `Sell local now` is correct

All three use only fields already produced by `transportCore.planTravel()` and `worldSimCommerceCore`.

**S1 — Recovery outpaces the trip.** The remote `priceIndex` premium is small and event-caused (so it is already subject to `tickMarketRecovery` pulling it toward `1.0` every elapsed world turn). `plan.days` for the route is large enough that the number of recovery ticks consumed in transit reduces the arrival-time premium below the commodity's current local price. Selling now locks in a value the remote market will not still be offering on arrival.

**S2 — Travel is blocked by existing cost.** `plan.foodCost` for the route exceeds the player's current food reserve, or the cargo required to carry a profitable quantity leaves no capacity margin for that food (`cargoWeight` vs `capacity`, per existing `computeFoodConsumption` scaling). Per the design's own Commitment section, `Run` is blocked outright. The remote quote's size is irrelevant because the trip cannot be completed; `Sell local now` is the only real option.

**S3 — A second, real, expiring opportunity is already local.** The current location also shows an existing elevated `priceIndex` for goods the player is already holding (a second, independent event or reputation drift already in `worldSimCommerceCore`, not a new mechanic). Because that local premium is subject to the same recovery drift, leaving to chase the remote spike risks losing this already-real, already-certain local opportunity before returning. Taking the certain local sale now beats gambling both premiums at once.

## 9. Three concrete states where `Run` is wrong despite a higher remote quote

**R1 — Same as S1, mirrored.** A nominally higher remote `priceIndex` that is event-caused decays through `tickMarketRecovery` across `plan.days` of travel faster than a lower, reputation-caused local premium (reputation-driven drift is sustained by `tickFactionReputationMarketDemand` rather than pulled back toward `1.0`). The traveler arrives to a smaller number than the one they left with in mind.

**R2 — Same as S2, mirrored.** `plan.foodCost` exceeds reserves, or `cargoWeight` cannot fit both the profitable quantity and the food to sustain the trip. The higher quote cannot be reached at all; "wrong" here means infeasible, not merely suboptimal, which is the strongest possible counter-example to a pure biggest-number strategy.

**R3 — Capacity forces an unprofitable marginal load.** Existing `capacity` constraints mean the quantity of goods that can actually be carried to the remote market (after reserving weight for `plan.foodCost`) is small enough that the per-unit premium, multiplied by that reduced quantity, no longer clears the trip's food cost — even though the *quoted unit price* is higher than local. The visible number (`priceIndex`) is not the number that matters; the carriable, food-cost-adjusted total is, and it is already computable from existing fields without any new mechanic.

These six states are deliberately built only from fields the audit already confirmed exist (`planTravel`'s `days`/`foodCost`/`cargoWeight`/`capacity`, and the existing event-vs-reputation decay asymmetry). No new mechanic is invented to manufacture them, satisfying the contract's requirement that the response set be reduced rather than padded if such states could not be produced.

## 10. Non-exclusive attribution

The original single-cause chip (`event else reputation else supply`) is replaced with **independent evaluation of each existing signal**, rendering all that are true rather than the first that matches:

- `event` — a matching `recentChanges` entry names this location or commodity.
- `reputation` — the controlling faction's tier at this market is not neutral.
- `low stock` — stock is below the existing low-stock threshold.

Render every true label, for example `event-linked · hostile reputation`, instead of picking one. If none of the three can be proven true from existing state, render a neutral, non-causal label such as `price pressure` rather than guessing. This is a change to the resolution logic only (independent checks instead of an if/else ladder) — it reads the same existing state the original design already specified and adds nothing new.

## 11. `fading` / `standing` certainty removed

The temporary-vs-standing prediction (`event-caused → fading`, `reputation-caused → standing`) is dropped entirely rather than patched, because the integrator's objection (G4) applies to any binary certainty claim, not just the word "fading": an event-linked spike can still be sustained or increased by a concurrent reputation effect, and the design has no model that proves otherwise.

The badge now shows only the truthful origin label(s) from item 10 (for example `▲ +35% · event-linked`) with no accompanying claim about future direction. The player still sees magnitude and cause; they no longer see a promise the simulation cannot back.

## 12. No ranking or expected-profit calculator

Each market card continues to show only its own existing raw fields — `priceIndex` deviation, the item-10 cause label(s), and (for remote cards) the one-line `planTravel` preview (`days`, `foodCost`, `transportName`). No card, list, or summary combines these into a single sortable or comparable score, and no cross-market sort order is introduced. A player can still do the arithmetic themselves, but the UI does not do it for them, and items 8–9 ensure that arithmetic is not reliably correct even when they do.

## 13–14. Test gating

The existing 30-minute playtest protocol (design section 10) is kept, with its gating made explicit rather than advisory:

- **Pre-seam (today):** the protocol may run in hybrid mode (decision made AI-off, travel executed through the current AI-mediated path). This is recorded as validating the **Decision Surface UX only**. It does not close the AI-off gameplay gate and must not be reported as doing so.
- **Post-seam (future, not designed here):** once the minimal direct travel commit seam described in the original design's "Minimum Required Execution Seam" section exists, the same protocol must be rerun end-to-end with no AI mediation before the full gameplay loop can be considered validated. That seam remains undesigned and out of scope for this repair, exactly as it was left in the reviewed design.

---

## Repaired sections (supersede the corresponding sections of the original design)

### 2. Attribution (repaired)

Show the existing `priceIndex` deviation next to the existing unit price (`▲ +35%`, `▼ −20%`, via `Math.round((priceIndex - 1) * 100)`), followed by every true cause label from item 10, joined with `·`. If no cause can be proven, show `price pressure` instead of a guess. No direction/duration claim is shown.

### 4. Decision Surface (repaired)

Exactly two responses: **Run the spike** and **Sell local now**. `Decline / Hold` is not a labeled UI response (see item 7); any other existing action remains available as before.

### 5. Commitment (repaired)

- **Run the spike** — unchanged from the original design (time, food, cargo capacity, forfeited local opportunity; blocked if food is insufficient or cargo cannot support the move).
- **Sell local now** — unchanged from the original design (remote upside forfeited for guaranteed smaller margin now).
- *(the original design's third "Decline / hold" commitment entry is removed along with the response itself)*

### 6. Counterfactual (repaired)

Only two futures diverge now: **Run** (arrive to a still-elevated or already-decayed quote, having spent days and food) and **Sell local** (guaranteed smaller credits now, possibly foregoing a remote value that would have held up — see items 8–9 for when each is actually correct).

### 9. Minimal UI Sequence (repaired)

Unchanged from the original design except: the badge text follows the repaired item-11 wording (no `fading`/`standing`), the attribution portion follows item 10 (non-exclusive), and the player-response row offers only `Sell local` and `Run the spike` (no `Decline` control). The travel-cost preview line and its existing red/insufficient-food styling are unchanged. No aggregate or sorted view is added, per item 12.

---

# Final Verdict

`SLICE1_REPAIR_READY_FOR_SECOND_ADVERSARIAL_REVIEW`
