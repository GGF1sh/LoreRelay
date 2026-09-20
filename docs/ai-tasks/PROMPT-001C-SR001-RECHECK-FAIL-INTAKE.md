# PROMPT-001C SR-001 Recheck Fail Intake

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Review result commit | `0f31b2764c2f082bfccca31941bb410f46d831ed` |
| Reviewed repair commit | `9eb5b14636bc460841c22556d12f08a6efe0021b` |
| Verdict | `SECOND_REVIEW_FAIL` |

## Remaining Blocker

`SR-001` remains unresolved.

### SR-001-R1 — Compound Chronicle failure masking

Current combine behavior lets `applied` mask a genuine `failed` sub-outcome.

Required truth:

- `failed + applied` -> `failed`
- `applied + failed` -> `failed`
- `applied + alreadySatisfied` -> `applied`
- `alreadySatisfied + applied` -> `applied`
- `alreadySatisfied + alreadySatisfied` -> `alreadySatisfied`

Any genuine sub-operation failure must dominate so compensation truth is retained.

### SR-001-R2 — Old generation misclassified after newer generation cleared

Generation mismatch must be checked before `pending === false` can be classified as `alreadySatisfied`.

An old token must never become `alreadySatisfied` merely because a newer generation was later cleared.

## Required Tests

- Chronicle `applied + failed` -> failed + compensation retained;
- Chronicle `failed + applied` -> failed + compensation retained;
- old generation after newer generation already cleared -> failed;
- mixed token outcomes remain independent;
- compensation-history exact retry behaves truthfully.

`SR-002` remains resolved and must not be reopened.

## Lifecycle Consequence

`SECOND_REVIEW (Repair Recheck)` -> `IMPLEMENTING (SR-001 Narrow Repair)`
