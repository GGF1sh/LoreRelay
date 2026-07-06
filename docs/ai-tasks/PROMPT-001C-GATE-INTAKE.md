# PROMPT-001C Gate Intake

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Gate branch | `gate/PROMPT-001C-receipt-accepted-consumption` |
| Gate commit | `4829dc52209d1da2819161898ccf167f91d04543` |
| Verdict | `READY_FOR_ADVERSARIAL_REVIEW` |

## Gate Summary

The Gate defines the final production authority transition from legacy pre-budget consumption to:

```text
pure candidate assembly
→ budget selection
→ final payload construction
→ immutable receipt creation
→ provider dispatch begins
→ receipt promoted to Delivered
→ provider result
→ truthful Accepted boundary
→ receiptId correlation
→ token-bound consumption
```

Key decisions:

- receipt creation occurs after budget selection and final payload construction;
- receipt becomes pending-delivered only after provider dispatch successfully starts;
- one process-local pending provider lifecycle matches current source reality;
- Accepted callback closure captures immutable receipt data;
- generic `receiptId` correlation is required to distinguish delayed result A from later pending receipt B;
- cross-restart exactly-once guarantees remain out of scope;
- Chronicle and WCS require separate immutable ACK token semantics.

## Identity Boundary

PROMPT-001C must solve process-local delivered-receipt ↔ Accepted TurnResult correlation with `receiptId`.

It must not absorb:

- durable accepted-result replay/dedupe;
- campaign identity;
- provider-specific session identity.

## Lifecycle Consequence

`CONFIRMED` → `ADVERSARIAL_REVIEW`
