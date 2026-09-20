# State Orchestrator SO3 Transaction Executor & Atomicity Design

> Status: Design Draft
> Date: 2026-07-05
> Depends on: State Orchestrator SO1 (Descriptors) & SO2 (Planning Gate)
> Scope: Transaction Executor, Rollback, 2PC, Retry Queues, Webview Apply, and Host Commands.

## 1. Why SO3 Exists

SO1 provided a read-only inventory of ledger write descriptors (`LedgerDescriptor`).
SO2 introduced the `StateTransactionPlan`, determining *what* needs to be written and in *what order*, but stopping strictly before side effects.

SO3 is the execution engine. It takes a `StateTransactionPlan` and safely applies it to the disk. Due to the increasing number of separated ledgers (`game_state`, `world_state`, `discoveries`, etc.), writing them directly risks partial failures (e.g., the primary game state commits, but the vehicle ledger fails, leading to ghost vehicles or lost references).

SO3 introduces a **Two-Phase Commit (2PC)** architecture to guarantee Multi-ledger Atomicity, backed by a robust Rollback system and a visual Webview transaction graph.

## 2. Core Architecture: The Transaction Executor

Recommended Module: `src/stateOrchestratorExecutorCore.ts`

The Executor will process the `StateTransactionPlan` through three distinct phases:

### Phase 1: Prepare (Pre-Commit)
1. **Serialize**: Generate the JSON strings for all planned ledgers in memory.
2. **Backup**: For every ledger about to be modified, copy the existing file (if any) to a temporary `.bak` file (e.g., `game_state.bak.json`).
3. **Stage**: Write the new serialized strings to `.tmp` files (e.g., `game_state.tmp.json`).
*If Phase 1 fails (e.g., OOM, disk full, serialization error), the transaction is cleanly aborted with zero impact on canonical files.*

### Phase 2: Commit (The Point of No Return)
1. The executor iterates through the staged `.tmp` files according to `TURN_LEDGER_PERSIST_ORDER`.
2. It performs a rapid atomic file rename (`fs.renameSync`) from `.tmp` to the canonical filename.
3. If the primary ledger (`game_state.json`) renames successfully, the transaction is considered structurally committed.

### Phase 3: Finalize & Cleanup
1. If the commit succeeds, all `.bak` files are asynchronously deleted.
2. If a non-critical secondary ledger fails during commit, the failure policy is checked.
3. Emit execution results to the Webview (Visual Transaction Graph).

## 3. Rollback & Failure Policies

If a failure occurs during the Commit phase, the executor consults the `LedgerFailurePolicy` defined in SO1:

- **`abort_before_commit`**: (Strict Atomicity) If this ledger fails, the executor triggers a full Rollback. All successfully renamed files are restored from their `.bak` counterparts.
- **`retain_primary_report_partial`**: The primary ledger remains committed. The failure is logged as a partial commit warning. No rollback is triggered.
- **`best_effort` / `skip_and_warn`**: The failure is appended to the diagnostic warning buffer; the transaction proceeds.
- **`queue_retry` (New)**: The failed ledger payload is serialized into a robust `workspaceStateQueue` retry envelope and will be re-attempted on the next extension activation or background loop.

## 4. Multi-Ledger Atomicity & Checkpoints

### Savepoint Integration
Before launching complex scripted World Intents (e.g., migrating 100 NPCs and a settlement), SO3 will allow the creation of a **Savepoint**.
A savepoint is a snapshot directory containing hard links (or fast copies) of all canonical ledgers.

If the transaction cascade fundamentally corrupts the World Intent runtime, a `restoreSavepoint()` command can forcefully revert the entire workspace state to the pre-intent condition.

## 5. User Interaction & Host Wiring

### State Orchestrator Host Command
A new VS Code command `textadventure.orchestrator.executePlan` will be registered. It accepts a `StateTransactionPlan` object.

### Webview Apply Buttons
The SO2 plan view in the UI currently shows what *would* happen. SO3 will introduce:
1. **"Apply Transaction" Button**: Dispatches the execute command to the host.
2. **Visual Transaction Graph**: A visual stepper (Node graph or Timeline) showing the Prepare -> Commit -> Cleanup phases in real-time, displaying green checkmarks or red crossmarks as the executor processes the ledgers.

## 6. Implementation Phasing

To safely roll out SO3 without destabilizing the current architecture, implementation must be phased:

### Phase SO3a: Core Executor & 2PC
- Implement `stateOrchestratorExecutorCore.ts` (pure functions for planning the IO operations).
- Implement `stateOrchestratorExecutorHost.ts` (actual `fs` operations for `.bak` and `.tmp`).
- Unit test atomicity failure scenarios.

### Phase SO3b: Rollback & Retry Queue
- Implement the rollback recovery loop using `.bak` files.
- Wire `queue_retry` into `workspaceStateQueue.ts`.
- Ensure `test_state_orchestrator_rollback.js` proves recovery from simulated `fs.renameSync` throws.

### Phase SO3c: UI & Host Integration
- Register `executePlan` host command.
- Add "Apply" buttons and the Visual Transaction Graph to the Webview.
- Retire the old legacy direct-write functions in favor of the Executor.
