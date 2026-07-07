# Gameplay Slice 1 — Adversarial Fail Intake

- Role: Chief Integrator
- Review branch: `review/gameplay-slice1`
- Adversarial result: `SLICE1_NOT_READY`
- Target design: `The Fading Spike`

## Decision
The adversarial review found real design blockers, but not every proposed failure or repair is accepted as load-bearing.

The design must be repaired before implementation. The repair must remain a single minimal slice and must not add a new Ledger, Ops family, simulation subsystem, Town Action Budget, rumor system, contract system, route-risk system, weather system, encounter expansion, or broad architecture layer.

---

## Accepted Findings

### G1. Dominant-strategy / arbitrage-scanner risk
**Accepted.**

The current design can collapse into:

`scan all markets → compare biggest spread → subtract visible travel cost → choose maximum`

The repair must not add automatic ranking, expected-profit calculation, or a recommended destination. The slice must prove that at least two materially different first choices can be correct under existing state.

### G2. Remote-information surface is too strong for the intended decision
**Accepted as a gameplay risk, not as permission to invent an information-economy system.**

The repair must use existing UI/state only. It may narrow what the slice itself highlights, compare, or recommends, but it must not introduce information freshness state, discovery state, rumor state, or a new knowledge subsystem.

### G3. Single-cause attribution can lie
**Accepted.**

`event else reputation else supply` is not truthful when several existing causes contribute simultaneously.

The repair must not claim a single primary cause unless the existing state proves exclusivity. Use additive driver labels when multiple causes are directly supported, or use a neutral non-causal label when causality cannot be proven.

### G4. `fading` overclaims the future
**Accepted.**

An event-linked spike can remain high or rise because of other existing effects. The repair must not imply guaranteed decline.

Replace predictive certainty with a truthful label about known origin or pressure type.

### G5. The design has not yet proved that all explicit responses are real choices
**Accepted.**

Before implementation, the repaired design must give concrete existing-state examples for:

- at least 3 states where `Sell local now` is rationally preferable;
- at least 3 states where `Run` is wrong despite a higher remote quote.

If those states cannot be produced from existing mechanics, the response set must be reduced rather than padded with fake choices.

### G6. Hybrid playtest is not an AI-off gameplay pass
**Accepted.**

Hybrid execution may validate the Decision Surface UX only. It cannot satisfy the final AI-off gameplay gate.

---

## Findings Not Accepted as Slice-Blocking Without Further Proof

### N1. `Decline` must advance time
**Rejected.**

A no-op does not itself create a timing advantage when simulation time is action-driven. Staring at the UI indefinitely changes nothing.

Do not invent a time tax, half-day cost, or Action Point cost for declining.

The repair should instead avoid presenting `Decline` as a fake button. The player may simply choose another existing action; if that action advances time, the opportunity changes naturally.

### N2. Determinism means the future is fully solved
**Not proven.**

Deterministic simulation is not identical to fully observable simulation. The review did not prove that the player can derive the exact arrival quote from currently visible information.

Do not add RNG merely to create uncertainty. The repaired design should avoid exposing an exact arrival-price forecast or guaranteed profit calculation.

### N3. Save/reload abuse is a Slice 1 blocker
**Deferred.**

This is a broader persistence/replay policy concern, not unique to `The Fading Spike`. Do not expand this gameplay slice into save-system architecture.

### N4. Add information freshness / acquisition difficulty
**Rejected for this repair.**

That would introduce new state and a new information-economy layer, violating the slice constraints.

---

# Minimal Repair Contract

## R1. Keep the slice single and small
Exactly one causal chain:

`existing price pressure → player notices → player compares commitment → player acts or does something else → time advances through existing actions → later state differs`

## R2. No explicit fake `Decline` button
The repaired Decision Surface may contain:

- `Run`
- `Sell local now`

The alternative is simply to leave and pursue another existing action. Do not turn no-op into a formal action.

## R3. No automatic optimization assistance
Do not add:

- best-market ranking;
- expected-profit calculation;
- arrival-price forecast;
- recommended destination;
- global opportunity score.

The UI may show existing quote deviation and existing travel commitments (`days`, `foodCost`).

## R4. Truthful attribution only
Use existing evidence to show additive drivers when proven, for example:

`event-linked · hostile reputation · low stock`

If the system cannot prove a cause, show a neutral pressure label rather than a false explanation.

## R5. Remove `fading` certainty
Use a non-predictive label such as `event-linked` rather than implying guaranteed decline.

## R6. Prove counterexamples from existing mechanics
The repair must contain at least:

- 3 concrete `Sell local` winning states;
- 3 concrete `Run` losing states despite a higher remote quote.

No new mechanic may be invented to manufacture these cases.

## R7. Separate test gates
- Pre-seam hybrid test: Decision Surface UX only.
- Post-seam AI-off test: full gameplay loop.

The implementation gate must not be approved until the repaired design survives another narrow adversarial review.

---

# Required Next Artifact

`docs/ai-tasks/GAMEPLAY-SLICE1-DECISION-SURFACE-REPAIR.md`

Final verdict must be exactly one:

- `SLICE1_REPAIR_READY_FOR_SECOND_ADVERSARIAL_REVIEW`
- `SLICE1_REPAIR_BLOCKED`
