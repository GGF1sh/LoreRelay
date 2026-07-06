# RUNTIME-003A — Durable Accepted Turn Identity / Restart Replay Guard

Status: `GATE_DRAFTED`
Severity: P1
Priority: Critical
Owner: ChatGPT 5.5
Reviewer: Gemini 3.1 Pro

## Problem

LoreRelay currently relies on in-memory turn-result dedupe state such as `lastProcessedTurnHash`.

A successful Accepted TurnResult can remain on disk as `turn_result.json`. If the extension host restarts, startup sweep can observe that file again after in-memory dedupe has been lost.

Resulting risk:

- the same already-Accepted TurnResult can be processed again after restart;
- canonical state changes may be replayed;
- world simulation / temporal progress may be repeated;
- prompt consumption or downstream effects may be re-entered depending on path;
- process-local exactly-once behavior is not sufficient for 100-turn reliability.

Finding sources:

- `CHATGPT-20260706-001`
- `GEMINI-20260706-002A-1` (duplicate/absorbed)

## Goal

Define a durable identity and replay-guard contract for Accepted TurnResults across process restart.

The design must answer:

1. What is the durable identity of one accepted turn result?
2. At what truthful boundary is that identity recorded?
3. What survives extension-host restart?
4. What happens if the process crashes:
   - before canonical commit;
   - after canonical commit but before durable accepted-identity recording;
   - after durable identity recording but before file cleanup/rename;
5. How does startup sweep distinguish:
   - new unprocessed turn result;
   - previously accepted turn result;
   - stale/invalid file;
   - same content delivered under a different file lifecycle?
6. How does this interact with:
   - RUNTIME-002A Accepted boundary;
   - PROMPT-001C receipt/ACK/consumption;
   - world simulation;
   - campaign/runtime identity;
   - restart and crash recovery?

## Required invariants

- Process restart must not make an already-Accepted turn eligible for mutation again.
- Durable replay guard must be written only at a truthful post-commit boundary.
- A pre-commit failure must remain retryable.
- A failed canonical apply must not be durably marked accepted.
- Recording durable identity must not revoke or redefine the existing Accepted boundary.
- The guard must be scoped so different campaigns/runtimes cannot suppress each other.
- Identity must be collision-resistant and not depend only on mutable file path or mtime.
- Duplicate observation must be an explicit no-op outcome, not a fake success mutation.
- Startup sweep behavior must be deterministic and explainable in trace/debug output.

## Non-goals

Do not solve in this gate:

- optimistic reapply double world-simulation candidate (`CHATGPT-20260706-002`), except where the contract boundary must acknowledge it;
- general temporal checkpoint/rollback;
- provider session identity redesign;
- prompt receipt redesign;
- cleanup of Windows EOL noise.

## Attack matrix

The architecture gate must explicitly reason through:

A. accepted file remains on disk -> restart -> startup sweep
B. crash immediately before canonical commit
C. crash immediately after canonical commit
D. crash after durable accepted record but before handled-file cleanup
E. same bytes copied to a new path
F. different turn result with hash collision assumption rejected by design
G. campaign A accepted identity observed while campaign B is active
H. manually edited old `turn_result.json`
I. duplicate filesystem events in one process
J. restart after partial durable-record write

## Deliverable

Create:

`docs/ai-tasks/RUNTIME-003A-ARCHITECTURE-GATE.md`

The gate must include:

- current-path audit
- durable identity candidate comparison
- chosen identity contract
- chosen persistence location/format
- exact write/read ordering
- crash-window table
- startup-sweep decision table
- interaction with Accepted / ACK / consumption
- migration/compatibility behavior for existing campaigns
- implementation touch set
- tests required before merge
- explicit unresolved questions

## Lifecycle

`CONFIRMED` -> `GATE_DRAFTED`

After Architecture Gate:

`ADVERSARIAL_REVIEW` by Gemini 3.1 Pro before implementation.
