# PROMPT-001C Second Review Intake

| Field | Value |
|:---|:---|
| Task | `PROMPT-001C` |
| Current main at review | `8ca65d6a751bdb66192e771252c55352c8e1a9f4` |
| Review result branch tip | `897588afb0ec8a79b2f1f0edea369e94c4c1c634` |
| Review result docs commit | `897588afb0ec8a79b2f1f0edea369e94c4c1c634` |
| Reviewed implementation tip | `68581d9db529e2a7e3f1f075aa3fb47cb4567a9c` |
| Canonical implementation base | `5449d89c6c401bfc62b13d117d57e8b444408aa2` |
| Verdict | `SECOND_REVIEW_FAIL` |

## Merge Blockers

### SR-001 — Exact duplicate ACK no-op misclassified as failure

Already-satisfied Chronicle/WCS tokens may cause native ACK appliers to return `false`.

Current ACK result handling treats every `false` as compensation failure, so an idempotent exact duplicate no-op is incorrectly added to `failedTokenIds` and the compensation queue.

Required repair:

- distinguish truthful `alreadySatisfied` no-op from real persistence/application failure;
- repeated exact token application must remain idempotent and non-failing;
- do not weaken false-return failure truth for genuine failures.

### SR-002 — Provider-bound receipt loses runtime immutability

Trusted provider-bound callback authority is rewrapped with diagnostics using unfrozen object spread.

Affected host-owned/provider-bound paths include Grok, VS Code LM, and Agentic.

Required repair:

- preserve runtime immutability when adding diagnostics;
- do not expose mutable provider-bound receipt/token authority;
- no latest/current pending fallback.

## Passed Areas

- exact correlation;
- delayed A/current B isolation;
- Accepted-only ACK ordering;
- Chronicle generation/digest authority;
- WCS bounded same-turn digest authority;
- host-owned correlation and external safe-skip policy;
- process-local restart contract;
- mergeability with current main.

## Lifecycle Consequence

`SECOND_REVIEW` → `IMPLEMENTING (Narrow Repair)`

PROMPT-001A remains blocked until both SR-001 and SR-002 are resolved and re-reviewed.
