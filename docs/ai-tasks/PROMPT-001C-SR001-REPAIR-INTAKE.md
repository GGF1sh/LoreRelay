# PROMPT-001C SR-001 Narrow Repair Intake

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Branch | `task/PROMPT-001C-receipt-accepted-consumption` |
| Repair commit | `8943765522a4e10bc876838ffca8be59234e7ee7` |
| Verdict | `SR001_REPAIR_COMPLETE_READY_FOR_RECHECK` |

## Changed Files

Exactly two files:

- `src/gmPromptBuilder.ts`
- `scripts/test_prompt_receipt_accepted_consumption.js`

## SR-001-R1 Repair

Compound Chronicle ACK outcome precedence is now:

`failed > applied > alreadySatisfied`

Therefore any genuine marker or generation sub-failure dominates and retains compensation truth.

## SR-001-R2 Repair

Generation identity is checked before `pending === false` can become `alreadySatisfied`.

An old generation can no longer be misclassified as satisfied merely because a newer generation was later cleared.

## Verification Evidence

- all 8 requested truth-table combinations covered;
- all 8 required edge-case behavior tests covered;
- mixed token outcomes remain independent;
- compensation-history exact retry behavior covered;
- mutation sanity A and B each failed the intended tests and were restored;
- compile clean;
- full suite `223/223`;
- no new findings.

## Lifecycle Consequence

`IMPLEMENTING (SR-001 Narrow Repair)` -> `SECOND_REVIEW (SR-001 Recheck)`
