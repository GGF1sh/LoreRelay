# Gameplay Slice 1 — Minimal UX Implementation Gate

Date: 2026-07-07 JST
Owner: Chief Integrator
Target design: `The Fading Spike`
Source of Truth: latest `main`
Production behavior verified against: `4b9db3016cdb89d9520166040a2471098adeea04`
Design repair: `2647102702250710c320147668be726119bb7455`
Final design review: `1ac68bccd967ce4b51b10efd141595914d6e1c05`

## Gate verdict

`SLICE1_IMPLEMENTATION_GATE_READY`

The task may proceed to implementation.

This gate authorizes only the minimum player-facing Decision Surface required for the hybrid 30-minute playtest.

It does **not** authorize the direct AI-off travel commit seam.

---

## Product purpose

Convert one existing background market drift into a player-facing commitment decision:

```text
existing market pressure
→ readable opportunity
→ compare local certainty vs remote commitment
→ choose Run or Sell local now
→ existing time / food / market drift produces the later outcome
```

This slice is successful only if the player must think before acting.

It is not successful merely because the UI shows more simulation data.

---

## Critical baseline truths

### B1 — Interactive commerce currently hides remote markets

In `webview/modules/85-world.js`, `renderLivingWorldMarkets()` currently does:

```text
commerce UI enabled + current location
→ show only the current-location market
```

Therefore the repaired design is not already playable by adding badges alone.

This implementation is explicitly allowed to surface a narrow set of remote market cards for the Decision Surface.

It must not turn the World tab into a ranked global arbitrage dashboard.

### B2 — Direct trade is already location-authoritative

Existing direct buy/sell controls are shown only for the current market, and host validation rejects `WRONG_LOCATION`.

Preserve that contract.

Remote cards are read-only except for the hybrid `Run the spike` action described below.

### B3 — The current hybrid travel path already exists

World-map location actions already use:

```text
postWorldInsertChatText(...)
→ insertChatText
→ player sends normal travel intent
→ existing AI-mediated travel path
```

Reuse this path for `Run the spike`.

Do not add a new travel mutation message.
Do not auto-send the chat turn.
Do not add direct departure authority.

### B4 — `worldView` is a derived display boundary

`src/worldView.ts` already builds and posts:

- current location;
- player commerce;
- market quote tables;
- recent changes;
- faction states;
- fog / discovered world data.

The new Decision Surface payload must remain read-only derived data.

No canonical state may be written while building or rendering it.

---

## V0 Decision Surface contract

### Explicit responses

Exactly two:

1. `Run the spike`
2. `Sell local now`

`Decline / Hold` is not a labeled response.

For v0, the Decision Surface activates only for commodities the player **already holds**.

Do not add buy-then-run orchestration in this slice.

### Candidate eligibility

A remote quote may receive a `Run the spike` affordance only when all are true:

1. the remote location is already discovered under existing fog/access state;
2. the player holds `qty > 0` of that commodity;
3. the current market trades that same commodity, so `Sell local now` is real;
4. the remote market trades that commodity;
5. current remote `unitPrice` is greater than current local `unitPrice`;
6. `planTravel()` returns a valid plan from current location to remote location.

This is a relevance filter, not a profit ranking.

### Ordering

Preserve forge / existing market order.

Do not sort by:

- price difference;
- `priceIndex`;
- travel days;
- food cost;
- expected profit;
- any composite score.

### Interactive market visibility

When Commerce UI is enabled:

- always show the current market;
- additionally show only remote markets containing at least one eligible Decision Surface quote;
- keep direct trade controls only on the current market;
- hide unrelated remote markets from this interactive v0 surface.

When Commerce UI is disabled, preserve the existing read-only market-table behavior.

---

## Read-only quote presentation

For each visible quote:

### Primary value

Show existing actual `unitPrice` as the primary price.

### Secondary pressure indicator

A price-pressure badge may show the existing `priceIndex` deviation from `1.0`, for example:

```text
▲ +10%
▼ -20%
```

This is a pressure indicator only.

Do not present it as:

- actual profit;
- arrival price;
- guaranteed future direction;
- a market ranking.

### Non-exclusive evidence labels

Show every true label; no precedence chain.

Allowed v0 labels:

- `recent event`
- reputation tier label (`hostile reputation`, `friendly reputation`, etc.; omit neutral)
- `low stock`

Rules:

#### `recent event`

May be shown for an elevated wheat quote only when an active tracked change:

- is a `resource` event;
- matches the existing food-crisis semantic rule;
- targets the market region, or is global.

The wording means only historical / recent linkage.

It must not claim the event is the exclusive or quantified cause of the current deviation.

The existing steel event must never be used as evidence for an elevated steel price because its production rule lowers steel price and raises stock.

#### reputation label

Use the controlling faction's existing player-reputation tier.

The label is evidence of an active pressure source, not a claim that reputation alone produced the full current price.

#### `low stock`

Show when:

```text
stock < targetStock * 0.3
```

Use the existing threshold only.

### Unknown cause

If no evidence label is provable, show no fabricated cause.

A neutral text such as `price pressure` is allowed.

---

## Travel preview contract

Each eligible remote market card shows one read-only preview from existing `planTravel()`:

```text
{days}d · {foodCost} food · {transportName}
```

Use:

- current authoritative location;
- current `playerCommerce.transportId`;
- current cargo weight;
- existing forge location / region graph;
- existing transport definitions.

Do not show:

- expected arrival price;
- predicted profit;
- food converted into credits;
- risk percentage;
- route score;
- recommendation text.

Insufficient food must not be shown as a deterministic travel block in this slice.

Food remains an existing depletion cost only.

---

## Hybrid `Run the spike` action

On an eligible remote market card:

- show `Run the spike`;
- clicking it inserts the existing normal move/travel text for that location into the chat input;
- reuse the existing world-pin move wording / insertion path;
- do not auto-send;
- do not mutate location, time, food, cargo, markets, or history from the button.

The player must still submit the normal chat turn.

This keeps the test honest:

```text
Decision Surface = AI-off UX
Travel execution = current AI-mediated path
```

The result may validate UX and scanner behavior only.

It is not a true AI-off gameplay pass.

---

## Touch set

### Required production files

- `src/livingWorldCommerceUiCore.ts`
  - pure read-only Decision Surface derivation helpers only;
  - no persistence, no VS Code API, no filesystem;
  - no new `*Core.ts` file.

- `src/worldView.ts`
  - assemble derived Decision Surface payload from existing state;
  - respect discovered-location access;
  - no writes.

- `webview/modules/85-world.js`
  - render narrow remote candidates;
  - render pressure/evidence/travel preview;
  - reuse existing chat-text insertion path for `Run the spike`.

- `locales/en.json`
- `locales/ja.json`
  - new user-facing strings only.

- `webview/script.js`
  - generated output only through the existing webview build command;
  - never hand-edit.

### Focused test file

Add one focused script under `scripts/` for the pure derivation contract.

No package-script change is required unless the existing repository test convention requires it.

### Forbidden touch set

Do not modify:

- `src/transportCore.ts`
- `src/worldSimCommerceCore.ts`
- `src/commerceCore.ts`
- `src/livingWorldCommercePersist.ts`
- `src/gmPromptBuilder.ts`
- action / intent schemas
- persistence schemas
- world-state schemas

unless compilation proves a narrow type-only adjustment unavoidable.

Any required forbidden-file change blocks implementation and returns to integrator review.

---

## No-new-foundation rule

This slice must not create:

- a new Ledger;
- a new Ops family;
- a new state variable;
- a new simulation subsystem;
- a new `*Core.ts` architecture layer;
- a Town Action Budget;
- an information-freshness system;
- route risk;
- weather;
- encounters;
- contracts;
- rumor economy;
- arrival-price prediction;
- expected-profit calculation.

---

## Focused acceptance tests

The focused test must prove at minimum:

### T1 — Held-cargo requirement

No held commodity → no remote `Run` candidate.

### T2 — Real local alternative

Remote commodity exists but current market does not trade it → no candidate.

### T3 — Actual price comparison

Eligibility compares actual existing `unitPrice`, not `priceIndex` alone.

### T4 — No ranking

Multiple eligible remote markets preserve input / forge order.

No score field is emitted.

### T5 — Discovered access

Unknown / rumored remote locations do not receive exact-price Decision Surface cards.

### T6 — Travel preview

Bundled sample:

```text
elda_shop → south_port
wagon
one hop
```

produces the existing one-day travel plan and existing food-cost formula.

### T7 — Non-exclusive labels

A quote may truthfully carry multiple evidence labels at once.

### T8 — Steel event truthfulness

The steel improvement event is not emitted as evidence for an elevated steel quote.

### T9 — No future-value fields

Payload contains no:

- expected arrival price;
- expected profit;
- recommendation;
- ranking score.

### T10 — Mutation-free derivation

Input state objects are unchanged after Decision Surface derivation.

---

## Verification commands

Required:

```text
npm run compile
npm run build:webview
node scripts/<focused-slice1-test>.js
npm test
```

Also verify:

- generated `webview/script.js` matches source modules;
- no unrelated EOL-only files are included;
- no canonical state changes occur merely by opening / refreshing the World tab;
- existing direct buy/sell still rejects wrong-location operations;
- existing non-interactive read-only market display remains unchanged.

---

## Hybrid 30-minute playtest hard stop

After focused verification succeeds:

```text
STOP IMPLEMENTATION
```

Do not add the direct travel seam.
Do not add another gameplay system.
Do not polish beyond bugs that block the test.

Run the recorded 30-minute hybrid playtest.

The test must record:

- at least three spike decisions;
- first choice for each instance;
- whether the player genuinely hesitated;
- whether the cause / pressure was understood;
- whether the sacrifice was understood;
- whether the player converged on a repeated scan-and-run routine.

The dominant-scanner Gate remains open until this test is completed.

A design/UX test may pass even though full AI-off gameplay remains unvalidated.

---

## Post-test branching rule

### If scanner / choice quality fails

Return to design repair.

Do not add infrastructure.

### If hybrid Decision Surface passes

Only then draft the separate minimal direct travel commit seam required for the true AI-off rerun.

Do not bundle that seam into this task retroactively.

---

## Implementation verdict

`SLICE1_IMPLEMENTATION_GATE_READY`
