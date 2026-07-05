# Task Packet: PROMPT-001A

| Field | Description |
|:---|:---|
| **Task ID** | `PROMPT-001A` |
| **Status** | ADVERSARIAL_REVIEW |
| **As-of Commit** | `3eaae25` |
| **Depends On** | None |
| **Gate Report** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md)（Claude Opus 4.8, ChatGPT 5.5/5.4不在時の代行, 2026-07-05） |

## Objective
Evicted or undelivered context chunks must never be marked as "consumed" or "accepted". Establish a pure execution order for prompt assembly.

## Broken Invariant
Currently, items are being marked as "acknowledged" or "consumed" before the Context Budgeter guarantees they are actually delivered to the prompt payload. This violates the consumption guarantee, causing permanent loss of unrendered prompt entries.

## In Scope
- `src/gmPromptBuilder.ts`
- World summary ACK logic
- Chronicle ACK logic
- The execution contract regarding: Candidate → Budget → Delivered → Accepted → Consumed

## Out of Scope
- Redesigning the Category Budgeter
- Context Engine P2
- Memory retrieval redesign
- Inspector UI

## Touch Set
- `src/gmPromptBuilder.ts`

## Acceptance Criteria
- Candidate build function is pure (no side effects).
- Evicted chunks remain unconsumed and retryable.
- Provider failure or eviction keeps the item retryable for the next turn.

## Required Tests
- N/A (Gate drafting phase - no code execution yet)

## Known Related Findings
- `PROMPT-001B`
- `PROMPT-001C`
- `PROMPT-001D2`

## ⚠️ Do Not Touch
- Category Budgeter internal algorithm
- State Orchestrator (SO3) transaction saving logic
