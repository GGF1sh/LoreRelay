# Gameplay Slice 1 — Adversarial Review

- Role: Adversarial Gameplay Breaker
- Target design: `The Fading Spike`
- Inputs:
  - `docs/ai-tasks/GAMEPLAY-SLICE1-EXISTING-DRIFT-REUSE-AUDIT.md`
  - `docs/ai-tasks/GAMEPLAY-SLICE1-DECISION-SURFACE-DESIGN.md`

## 1. Top 10 Break Cases

### 1. Biggest-number arbitrage scanner
**Initial state:** Three markets have spikes for the same commodity. The World tab exposes price, stock, and travel information.

**Player action:** Calculate remote sale value minus local sale value, food cost, and travel cost for every market; choose the maximum.

**Why it collapses:** The loop becomes spreadsheet optimization rather than a meaningful decision.

**Failure type:** dominant strategy / spreadsheet optimization.

### 2. Deterministic future exploit
**Initial state:** A grain spike exists. Travel duration and market recovery are deterministic.

**Player action:** Predict the arrival price from current price, recovery speed, and travel days; run only when profit is known.

**Why it collapses:** Risk becomes calculation. The choice is a schedule, not a wager.

**Failure type:** dominant strategy / solved arithmetic.

### 3. Global market omniscience
**Initial state:** The World tab exposes all remote market information instantly.

**Player action:** Scan every market, find the largest percentage difference, subtract travel cost, and choose the largest expected return.

**Why it collapses:** The game becomes an arbitrage scanner rather than a world-reading game.

**Failure type:** information saturation / spreadsheet optimization.

### 4. Decline / Hold time freeze
**Initial state:** A spike exists.

**Player action:** Decline and avoid all time-advancing actions until convenient.

**Why it collapses:** If no-op does not advance time, urgency can be suspended indefinitely.

**Failure type:** exploit / fake urgency.

### 5. Local sell lacks convincing winning states
The design does not yet establish enough concrete states where selling locally is clearly better than chasing the remote spike.

**Why it collapses:** `Sell local now` risks becoming a fake choice.

**Failure type:** fake choice.

### 6. Run lacks convincing losing states
The design does not yet establish enough concrete states where a higher remote price is still a bad run.

**Why it collapses:** Higher price becomes an obvious answer.

**Failure type:** fake choice / dominant strategy.

### 7. Attribution badge multi-cause failure
Event spike, hostile reputation, and low stock can coexist.

**Why it collapses:** A single cause chip can present a false causal story.

**Failure type:** unreadable or misleading causality.

### 8. `Fading` can overpromise
Another event, reputation drift, or stock movement may keep the spike high or push it higher.

**Why it collapses:** The UI can imply certainty that the existing simulation does not guarantee.

**Failure type:** misleading feedback.

### 9. Repeated arbitrage farming loop
**Player action:** buy low → chase spike → sell → scan next spike.

**Why it collapses:** If the opportunity set does not meaningfully change, one obvious loop repeats forever.

**Failure type:** repetitive farming / dominant loop.

### 10. Save/reload optimization
Because resolution is deterministic, the player can observe an outcome, reload, and commit only when the known result is favorable.

**Why it collapses:** Consequence can be erased after learning it.

**Failure type:** exploit.

---

## 2. Dominant Strategy Verdict

**Dominant strategy exists.**

The likely default loop is:

`scan all markets → calculate maximum expected return → Run`

The current design does not yet provide enough counter-pressure to prevent this from becoming the routine answer.

---

## 3. Fake Choice Verdict

| Response | Verdict | Reason |
|---|---|---|
| `Run the spike` | Fake-choice risk | If the largest number is usually correct, the decision collapses into arithmetic. |
| `Sell local now` | Fake choice risk | The design does not yet prove enough states where certainty now beats remote upside. |
| `Decline / Hold` | Fake choice / exploit risk | With no time advance, decline can freeze urgency or preserve optionality for free. |

---

## 4. Information Visibility Verdict

**Poor for decision quality.**

If the World tab exposes every remote market quote immediately, the player does not need to discover, infer, or prioritize. The loop tends toward global scanning and maximum-value selection.

---

## 5. Attribution Correctness Verdict

**Weak.**

Multiple price causes can coexist. A single `event / reputation / supply` chip with hard precedence can mislead the player about why the price is high.

---

## 6. Time-Freeze / No-Op Exploit Verdict

**Clearly present.**

If `Decline` advances no time, the player can inspect indefinitely or avoid opportunity expiration until a favorable time-advancing action is chosen.

---

## 7. AI-Off Test Validity Verdict

**Hybrid mode cannot count as a passed AI-off gameplay test.**

It may validate the Decision Surface UX, but it does not validate the complete AI-off gameplay loop while travel execution still routes through AI-mediated output.

---

## 8. Smallest Repair Set

1. Ensure decline/no-op cannot create a free indefinite pause of opportunity pressure.
2. Avoid global instant market omniscience; the current all-market display must not collapse into a universal arbitrage scanner.
3. Prove at least two or three concrete states where `Sell local now` is genuinely correct and two or three where `Run` is wrong despite a higher remote price.
4. Do not use a single causal chip when multiple existing effects contribute.
5. Do not label a spike `fading` as if decline is guaranteed when the existing simulation can sustain or raise it.
6. Keep hybrid testing separate from true AI-off validation.

No new Ledger, Ops, subsystem, Town Action Budget, rumor system, contract system, route-risk system, weather system, or encounter expansion is proposed.

# Final Verdict

`SLICE1_NOT_READY`
