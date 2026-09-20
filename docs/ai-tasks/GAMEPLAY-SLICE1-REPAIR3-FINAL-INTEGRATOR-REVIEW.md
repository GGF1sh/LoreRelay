# Gameplay Slice 1 — Repair 3 Final Integrator Review

Date: 2026-07-07 JST
Target: `The Fading Spike`
Repair 3 commit: `2647102702250710c320147668be726119bb7455`
Code baseline: `4b9db3016cdb89d9520166040a2471098adeea04`
Integrator verdict: `SLICE1_DESIGN_PASS`

## Decision

Repair 3 closes the recorded code-grounding blockers from the Repair 2 Integrator Review.

The design is accepted for a minimal implementation gate.

This is a **design pass**, not a gameplay pass and not an AI-off pass.

## Verified closure

- comparisons now use actual `unitPrice`, including `supplyBias` and rounding;
- bundled-sample examples use the real one-hop / one-wagon-day route;
- food remains an unpriced resource and is not converted into credits;
- the invalid steel-event price-rise path is removed;
- the invalid South-Port-only spice acquisition example is removed;
- attribution wording is limited to non-exclusive historical linkage / evidence;
- the dominant-scanner risk remains explicitly open for empirical playtest.

The example arithmetic was independently rechecked against the baseline formulas.

## Remaining open Gate

`G1 — Dominant scanner risk` is not closed by design.

It must be tested empirically after the minimal Decision Surface exists.

The next implementation must therefore stop after the smallest playable UX slice and run the recorded 30-minute playtest before any new gameplay infrastructure is approved.

A hybrid pre-seam test may validate:

- whether the player understands the opportunity;
- whether `Run` vs `Sell local now` produces genuine hesitation;
- whether players converge on a scan-and-run routine.

It must not be reported as a true AI-off gameplay pass.

## Implementation direction

The next task should implement only the minimum player-facing Decision Surface needed for the hybrid test.

Do not include the direct AI-off travel commit seam in the same task unless the implementation gate later proves it is unavoidable for the UX test itself.

After the hybrid 30-minute test:

- if the scanner blocker fails, stop and repair the decision design;
- if it passes, draft the minimal direct travel commit seam needed for the true AI-off rerun.

## Final Verdict

`SLICE1_DESIGN_PASS`
