# Gameplay Slice 1 — Adversarial Intake

Date: 2026-07-07 JST
Target: `The Fading Spike`
External reviewer verdict: `SLICE1_NOT_READY`

## Integrator decision

The adversarial review is accepted as a valid design failure signal. The slice must not proceed to implementation yet.

However, not every proposed repair is accepted. The repair must remain inside the original small-scope contract.

## Confirmed blockers

### G1 — Dominant scanner risk

The current design can collapse into:

```text
scan visible markets
→ compare visible spread and travel cost
→ choose the numerically best route
```

The slice must prove that the player faces a meaningful commitment rather than a simple ranking problem.

### G2 — Weak choice set

`Run`, `Sell local now`, and `Decline / Hold` are not yet all proven to be real choices.

The repaired design must provide concrete states where:

- `Run` is correct;
- `Sell local now` is correct;
- a higher remote price can still be the wrong choice.

`Decline / Hold` must not be counted as a meaningful response unless it commits an existing scarce resource through a real action.

### G3 — False single-cause attribution

The proposed exclusive cause rule:

```text
event
else reputation
else supply
```

can misrepresent a price affected by multiple existing causes.

The UI must not claim one exclusive cause when the state supports multiple contributors.

### G4 — `Fading` is too certain

An event-linked spike may still be maintained or increased by other existing effects.

The UI must not promise decline when only event linkage or recovery pressure is known.

### G5 — AI-off test boundary

Hybrid execution may validate the Decision Surface UX only.

It must not be counted as a passed AI-off gameplay loop while travel execution still requires AI mediation.

## Rejected or narrowed repair proposals

### R1 — Do not make Decline advance time

Rejected.

A no-op should not be turned into a mutation merely to create urgency. Instead, remove `Decline / Hold` from the claimed decision set unless it is paired with a real existing time-advancing alternative.

### R2 — Do not add information freshness state

Rejected for this slice.

Information freshness, acquisition difficulty, or a new visibility economy would broaden scope and risk creating a new subsystem.

This slice must not solve the full information economy problem.

### R3 — Do not add randomness to fix determinism

Rejected.

Determinism is not itself the defect. The slice must first prove whether existing time, food, quantity, and price movement create sufficient trade-offs without exposing an exact future-value answer.

### R4 — Reload knowledge is not a slice-specific blocker

Defer.

Do not redesign persistence or replay behavior for this gameplay slice.

## Minimum repair contract

The repaired design must:

1. use no new Ledger;
2. use no new Ops;
3. use no new simulation subsystem;
4. use no Town Action Budget;
5. use no information-freshness system;
6. add no new state variable by default;
7. reduce the explicit v0 decision to two proven responses if necessary: `Run` vs `Sell local now`;
8. provide at least three concrete states where `Sell local now` is better;
9. provide at least three concrete states where `Run` is wrong despite a higher remote quote;
10. replace exclusive single-cause attribution with truthful multi-factor or non-exclusive labels derived from existing state;
11. replace `fading` with wording that does not guarantee future decline;
12. avoid adding a global best-market ranking or expected-profit calculator;
13. treat hybrid testing as UX-only validation;
14. require a later true AI-off test after the minimal direct travel commit seam exists.

## Repair question

Can the same existing-state slice be repaired into a real commitment decision without creating a new economy, information, time-budget, or simulation system?

## Next lifecycle state

`ADVERSARIAL_REVIEW_FAIL → GATE_REPAIR_REQUIRED`
