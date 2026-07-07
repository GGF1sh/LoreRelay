# Gameplay Slice 1 — Decision Surface Design

- AI: Claude Sonnet
- Role: Gameplay UX / Decision Surface Designer
- Source of Truth: GitHub main, verified against `4b9db30`, package `1.77.15`
- Input audit: `docs/ai-tasks/GAMEPLAY-SLICE1-EXISTING-DRIFT-REUSE-AUDIT.md`

## Grounding correction
The audit's `PHASE1A_NOT_REQUIRED` is accepted, but this design does not assume that AI-off direct travel already exists.

Verified split:

### A. Existing deterministic preview
`transportCore.planTravel()` returns:

- `days`
- `foodCost`
- `cargoWeight`
- `capacity`
- `transportName`
- `regionPath`

from pure inputs. This is fully usable read-only today.

### B. Existing AI-mediated execution
`gmPromptBuilder.buildLivingWorldTravelPromptContext()` feeds that plan to the AI, which emits `elapsedWorldTurns` plus a `/world/currentLocationId` state patch. `foodCost` is computed but not strictly deducted in this path.

### C. Possible minimal direct commit seam
A small deterministic path may be needed to execute travel without the AI. It is not designed or solved here.

Everything in sections 1–9 is read-only surfacing of existing state. No new Ledger, Ops, subsystem, state variable, drift, or middleware is introduced.

---

# The one slice: The Fading Spike

A price spike already exists in the simulation at a remote market. The player already sees the number. The slice makes the player see what it costs to reach it and that it will not wait, turning a dashboard reading into a commit-or-forfeit decision.

## 1. Hidden Drift
The already-existing fact: `marketStock[remoteLocation][commodity].priceIndex` has drifted above `1.0`, produced by existing `worldSimCommerceCore` behavior with no new simulation:

- `applyWorldEventsToMarkets()` — a famine, mine, smith, or similar recent change bumped `priceIndex`, or
- `tickFactionReputationMarketDemand()` — the controlling faction's hostility surcharges it.

This drift is already in world state and already reaches the webview via living-world market data and `recentChanges`. It is currently a bare number with no cause and no clock.

## 2. Attribution
Three read-only facts, all derived from state the webview already receives:

### What changed
Show the `priceIndex` deviation next to the existing unit price, for example:

`▲ +35%` or `▼ −20%`

Derived as:

`Math.round((priceIndex - 1) * 100)`

### Why it changed
Resolve a single cause chip deterministically:

1. `event` if a matching `recentChanges` entry names the location or commodity context;
2. else `reputation` if the controlling faction tier is not neutral;
3. else `supply` for low stock.

### Temporary vs standing
- event-caused → `fading`
- reputation-caused → `standing`

No prediction and no new model are introduced; the UI only labels the type of drift.

## 3. Intervention Window
The player is at a location, viewing the World-tab market table, holding or able to buy the commodity, before committing any time-advancing action.

The window remains open until `elapsedWorldTurns` is spent. Travel or rest steps the simulation, so `tickMarketRecovery` and other drift can change the opportunity before arrival.

## 4. Decision Surface
Exactly three responses:

### Run the spike
Reach the remote market and sell into `priceIndex > 1`.

### Sell local now
Dump held cargo into the current market at today's lower price with zero travel time or food cost.

### Decline / hold
Keep cargo and credits, pursue something else locally, and do not chase.

`Wait` is deliberately excluded because, in the current engine, time only advances via travel/rest; a bare wait would be a strictly worse form of decline rather than a distinct choice.

## 5. Commitment
Only existing scarce things are committed.

### Run the spike
Commits:

- time (`plan.days` → `elapsedWorldTurns`)
- food (`plan.foodCost`)
- cargo capacity while goods are in transit
- the current local market opportunity while the player is away

Blocked if food is insufficient or cargo cannot support the move.

### Sell local now
Commits the remote upside in exchange for guaranteed smaller margin through the existing commerce trade path.

### Decline / hold
Commits cargo capacity and optionality decay while the spike may fade before the player later acts.

## 6. Counterfactual
The three futures diverge.

### Run
The player may arrive to a still-hot spike or a faded one, after spending days and food.

### Sell local
The player gets safe credits now, but may later see that the remote spike remained valuable.

### Decline
The player keeps flexibility, but may later see the spike disappear entirely.

## 7. Consequence Memory
Use existing state and history only.

After time passes:

- the remote quote's `priceIndex` has moved;
- existing market history sparklines show the rise and fall;
- existing since-last-visit deltas can show the changed index on arrival.

No new persistence is required. The same surface that presented the choice later shows the outcome.

## 8. Ignore Case
If the player does nothing, the world continues without them.

A later time-advancing action steps the existing simulation:

- `tickMarketRecovery` pulls the index toward `1.0`;
- event history ages;
- reputation drift continues.

The spike can visibly expire in the same market table without AI narration.

## 9. Minimal UI Sequence
Reuse existing World-tab commerce cards.

### Appears
On each quote where `|priceIndex - 1|` exceeds a small threshold, render a read-only badge next to the existing price, for example:

`▲ +35% · event · fading`

### Remote travel-cost preview
On a remote market card, compute a one-line read-only preview using `planTravel(currentLocationId → card.locationId, playerCommerce.transportId, forge, ...)`:

`→ {locationName}: {days}d · {foodCost} food · {transportName}`

The line turns red if food is insufficient or cargo constraints fail.

### Player responses
- `Sell local` → existing direct trade input/button
- `Run the spike` → buy with existing trade controls, then commit travel through the current travel path; after a direct seam exists, use a direct Depart action
- `Decline` → no action

### Confirmation
Existing commerce toasts remain for buy/sell. The travel-cost preview is the pre-commit confirmation surface.

### Afterward
The World tab re-renders with updated world turn, prices, and since-last-visit deltas.

---

# 10. AI-Off 30-Minute Playtest

## Setup
- `enableCommerce` ON
- `enableCommerceUi` ON
- at least 3 connected markets
- player starts at town A with credits, transport, food, and some cargo
- seed two distinct attribution types:
  - famine-driven wheat spike at town B
  - hostile-faction reputation surcharge at town C
- GM narration disabled or ignored

## Protocol
The tester plays for 30 minutes using only the World tab, attribution badges, cost preview, trade controls, and travel. The observer logs behavior.

## Measures

### Genuine hesitation moments
Count times the tester rereads the travel-cost preview or switches the market being compared before acting.

Target: at least 4.

### Dominant-strategy repetition
Across 3 spike instances, at least 2 different first choices should appear.

If the tester always runs the biggest number, fail.

### Causality understood
The tester can explain why town B's price is high—event versus reputation—without prompting.

### Sacrifice understood
When choosing Run, the tester can name time, food, cargo, and local opportunity as costs.

### Ignored opportunities changed
The tester notices a spike shrink or vanish after time passes.

### Next opportunity set changed
After one run, the best visible target should differ from the initial best target.

## Critical failure conditions
Any of these means redesign, not ship:

- tester only follows the largest profit number;
- UI explains the simulation but no choice is felt;
- travel is always obviously correct or obviously wrong;
- the same answer is optimal every time;
- outcome cannot be attributed to the player's choice;
- the slice feels empty without AI narration.

## Pre-seam versus post-seam validity
Before a direct commit seam exists, the playtest may run in hybrid mode:

- decision is made AI-off from the surface;
- travel executes through the current AI path.

This can validate sections 1–9 as a Decision Surface, but does not prove full AI-off gameplay. Once the direct seam exists, rerun the same protocol for true AI-off validation.

---

# Minimum Required Execution Seam

## Verdict
**B. MINIMAL_DIRECT_COMMIT_SEAM_REQUIRED**

The Decision Surface is read-only and UX-only. Buy/sell already execute AI-off. Closing the full loop AI-off—buy → travel → arrive → sell—needs one small deterministic commit path because travel execution is currently AI-mediated.

Exact missing capability:

1. On player confirm, emit `elapsedWorldTurns = plan.days` without routing through the AI turn.
2. Apply deterministic location mutation to `/world/currentLocationId`.
3. Deduct `plan.foodCost` and block departure when food is insufficient.
4. Reuse existing persistence paths; do not introduce a new ledger, journal, or op family.
5. Nothing else is required; market drift, recovery, reputation, and since-last-visit behavior already step from elapsed world turns.

# Final Verdict

`SLICE1_DECISION_SURFACE_READY_FOR_ADVERSARIAL_REVIEW`
