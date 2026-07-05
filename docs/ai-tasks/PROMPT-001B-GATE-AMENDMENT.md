# Gate Amendment: PROMPT-001B - Inspector / Preview read-only / no rebuild side effects

| Field | Value |
|:---|:---|
| Task | `PROMPT-001B` |
| Baseline reviewed | `1fab45bf9c4ca24159bc42d1456f7466bf42638c` |
| Gate branch | `gate/PROMPT-001B-inspector-readonly` |
| Prior gate commit | `1274625` |
| Amendment purpose | Incorporate required changes from Adversarial Review verdict `ACCEPT_GATE_WITH_REQUIRED_AMENDMENTS` |

## 1. Final Concrete Violations

### V1. Inspector can call lazy-init filesystem APIs

Current Inspector flow reaches party helpers from `buildGmPromptBreakdown()`:

- `src/gmPromptBuilder.ts:1188-1233`
- `party` at `src/gmPromptBuilder.ts:1218`
- `partyDirector` at `src/gmPromptBuilder.ts:1219`

Those read helpers currently depend on `getCharactersDir()`:

- `src/characterManager.ts:55-63`

`getCharactersDir()` creates `characters/` via `fs.mkdirSync(..., { recursive: true })` when absent. That is a durable workspace mutation triggered by preview/query behavior.

### V2. Inspector world-state reads mutate shared diagnostics / caches

Current Inspector flow reaches `loadWorldState()` through:

- `worldState` section at `src/gmPromptBuilder.ts:1226`
- `worldChangeSummary` section at `src/gmPromptBuilder.ts:1230`
- explicit parse-warning export at `src/gmPromptBuilder.ts:1246-1249`

`loadWorldState()` currently mutates:

- `lastWorldStateParseWarnings`
- `cachedWorldStateParseWarnings`
- `cachedState`
- cache path / mtime state

and can emit `console.warn` side effects:

- `src/worldState.ts:19-50`
- `src/worldState.ts:76-106`

Inspector read-only authority must not reuse that path.

### V3. Inspector display/report are rebuilt separately

`buildGmPromptBreakdown()` currently:

1. builds display sections directly
2. then rebuilds chunk specs via `buildPureCandidateSpecsWithMeta(...)`
3. then derives `buildContextInspectorReport(...)`

Relevant lines:

- `src/gmPromptBuilder.ts:1168-1249`
- `src/gmPromptBuilder.ts:1464-1468`

This causes:

- duplicate execution of read builders
- repeated exposure to V1/V2 side effects
- possible divergence between displayed sections and Context Inspector accounting

## 2. Exact Read-Only Authority Boundary

`PROMPT-001B` owns the Inspector / Preview query lane only.

The read-only authority boundary is:

1. Inspector may read files and assemble prompt-preview data.
2. Inspector may use harmless local-only values created inside the current function call.
3. Inspector must not call any API that can:
   - `mkdir*`
   - `write*`
   - `save*`
   - `consume*`
   - `mark*`
   - `clear*`
   - mutate shared diagnostic buffers or shared semantic caches
4. Production may keep its existing lazy-init and legacy authority behavior.
5. `PROMPT-001B` does not change production consumption timing and does not move any Accepted-boundary behavior.

## 3. Explicit Named APIs Required

Boolean mode flags or optional default behavior are rejected. The implementation contract requires explicit named APIs.

### Character / party read-only API

Required new explicit non-mutating accessor in `src/characterManager.ts`:

- `tryGetCharactersDirReadOnly(): string | undefined`

Contract:

- returns the resolved `characters/` path only if workspace exists
- does not create directories
- safe for Inspector read/query paths

Read-only party helpers used by Inspector must use that path, not `getCharactersDir()`.

Production / authoring APIs may keep `getCharactersDir()` unchanged.

### World-state read-only API

Required new explicit Inspector-safe API in `src/worldState.ts`:

- `readWorldStateSnapshotReadOnly(): { state: WorldState | undefined; warnings: readonly WorldStateParseWarning[] }`

Contract:

- reads and parses `world_state.json`
- returns snapshot-local warnings as data
- does not mutate `lastWorldStateParseWarnings`
- does not mutate world-state shared caches
- does not emit `console.warn`
- does not advance any durable markers

Inspector must not use `loadWorldState()` for its read-only lane after this change.

### Inspector-only assembly API

Required explicit Inspector-local assembly entry in `src/gmPromptBuilder.ts`:

- `buildInspectorPromptAssembly(playerAction: string, policy: PromptBudgetPolicy): InspectorPromptAssembly`

This is an Inspector-only local immutable result, not a project-wide snapshot abstraction.

Minimum payload:

- `sections`
- `specs`
- `inactiveIds`
- `emptyIds`
- `orderedIds`
- `matchedLore`
- `memoryMatches`
- `memoryBackend`
- `hintPreview`
- `worldStateParseWarnings`

`buildGmPromptBreakdown()` should call this once and derive both:

- display output
- `buildContextInspectorReport(...)`

from that one local result.

## 4. Smallest Double-Build Fix

The required fix is intentionally narrow:

1. Do not introduce a project-wide snapshot architecture.
2. Do not redesign production prompt assembly.
3. Extract one Inspector-only pure assembly result inside `gmPromptBuilder.ts`.
4. Use explicit read-only builders / inputs for the Inspector assembly.
5. Reuse that one local immutable Inspector result for both:
   - rendered sections
   - Context Inspector accounting

This is the smallest fix that removes:

- duplicate builder execution
- display/report divergence risk
- repeated exposure to lazy-init and shared-diagnostic side effects

## 5. Final Touch Set

### MUST CHANGE

- `src/gmPromptBuilder.ts`
  - replace Inspector double-build with one Inspector-local assembly pass
  - wire Inspector to explicit read-only APIs only
- `src/characterManager.ts`
  - add explicit non-mutating directory accessor for Inspector reads
- `src/worldState.ts`
  - add explicit read-only world-state snapshot reader that does not mutate shared diagnostics/caches

### MAY CHANGE

- `src/worldStateCore.ts`
  - only if needed to support warning-return formatting or snapshot-local parse results
- Inspector-focused tests under `scripts/` and existing prompt inspector tests

### MUST NOT CHANGE

- production `getCharactersDir()` lazy-init behavior
- production `buildGmPromptContext()` authority / consumption timing
- receipt design
- ACK token design
- Accepted consumption timing
- provider identity/session work
- `PROMPT-001C` ownership
- budgeter redesign in `gmPromptBuilderCore.ts`

## 6. Required Tests

1. Inspector does not create `characters/` when the directory is absent.
2. Inspector does not consume Chronicle recap.
3. Inspector does not consume World Change Summary.
4. Inspector does not clear `chronicleSessionPending`.
5. Inspector world-state read path does not mutate shared warning buffers.
6. Inspector world-state read path does not mutate shared semantic caches.
7. One Inspector call and a repeated Inspector call produce identical Context Inspector accounting for unchanged inputs.
8. Display sections and Context Inspector report are derived from the same Inspector assembly result.
9. Production prompt behavior remains unchanged by the Inspector-only refactor.

## 7. Candidate Dispositions

| Candidate | Disposition | Amendment handling |
|:---|:---|:---|
| `PROMPT-001B-CAND-001` | `MERGE` | Merge into final concrete violation V1 and required named read-only filesystem API |
| `PROMPT-001B-CAND-002` | `ABSORB INTO PROMPT-001B` | Treat as owned by this task via the smallest Inspector-only assembly fix |
| `PROMPT-001B-CAND-003` | `KEEP, deferred to PROMPT-001C` | Keep out of this implementation contract; do not absorb into the 001B touch set |

## 8. PROMPT-001C Boundary

Still out of scope for `PROMPT-001B`:

- receipt
- immutable ACK token
- Accepted consumption
- provider identity
- production authority switch off legacy consumption

`PROMPT-001B` may remove Inspector-side divergence and query-lane mutation, but it must not implement receipt/ACK/Accepted semantics.

## 9. Implementation Acceptance Criteria

Implementation is acceptable only if all are true:

1. Inspector no longer reaches any lazy-init filesystem API.
2. Inspector no longer reuses `loadWorldState()` or any equivalent shared-cache/shared-diagnostic mutating path.
3. Inspector has explicit named read-only APIs for character-dir access and world-state reads.
4. `buildGmPromptBreakdown()` performs one Inspector-local assembly pass only.
5. Display sections and Context Inspector accounting are derived from that same Inspector-local result.
6. Production lazy-init and production legacy prompt authority remain behaviorally unchanged.
7. No `PROMPT-001C` semantics are introduced.

## 10. Final Lifecycle Verdict

**READY_TO_IMPLEMENT**

Reason:

- The required adversarial amendments are now concrete.
- The smallest acceptable architecture is defined.
- The ownership boundary with `PROMPT-001C` is explicit.
- The touch set is narrow and implementation-ready.
