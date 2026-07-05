# Gate Report: PROMPT-001B - Inspector / Preview read-only / no rebuild side effects

| Field | Value |
|:---|:---|
| Task | `PROMPT-001B` |
| Status entering gate | `CONFIRMED` |
| Current `origin/main` baseline reviewed | `1fab45bf9c4ca24159bc42d1456f7466bf42638c` |
| Working branch | `gate/PROMPT-001B-inspector-readonly` |
| Depends on | `PROMPT-001A` |
| Primary files audited | `src/gmPromptBuilder.ts`, `src/worldState.ts`, `src/characterManager.ts`, `src/worldForge.ts`, `src/npcRegistry.ts`, `src/visualMemory.ts`, `src/lorebookMatcher.ts`, `src/memoryBank.ts`, `src/partyDirector.ts`, `src/scenarioDirector.ts` |
| External runtime inspected | `C:\AI\TextAdventureGMSkill\scripts\memory_bank.py`, `memory_common.py`, `memory_chroma.py` |

## 1. Current Reality

### Exact Inspector / Preview call graph

1. Runner entry points call `postPromptContextToWebview(playerAction)` before GM execution:
   - `src/agenticGmRunner.ts:250`
   - `src/gmBridgeRunner.ts:460,585,690,1000`
2. `postPromptContextToWebview()` calls `buildGmPromptBreakdown(playerAction)`:
   - `src/gmPromptBuilder.ts:1497-1504`
3. `buildGmPromptBreakdown()` does three separate read paths:
   - preview-only lore/memory match cards
   - display `sections[]` via `maybeBuildSection(...)`
   - Context Inspector candidate rebuild via `buildPureCandidateSpecsWithMeta(...)` then `buildContextInspectorReport(...)`
4. The pure candidate rebuild is explicitly wired to peek-only consumables:
   - `PURE_CANDIDATE_CONSUMABLE_BUILDERS` at `src/gmPromptBuilder.ts:1363-1366`
   - `buildPureCandidateSpecsWithMeta()` at `src/gmPromptBuilder.ts:1464-1468`
5. Production remains separate and legacy:
   - `buildGmPromptContext()` -> `buildLegacyProductionSpecs()` -> `buildLegacyProductionSpecsWithMeta()` -> `LEGACY_PRODUCTION_CONSUMABLE_BUILDERS`
   - `src/gmPromptBuilder.ts:1477-1494`

### What PROMPT-001A already fixed

- Inspector no longer reaches `consumeChronicleRecapContext()`:
  - peek path at `src/gmPromptBuilder.ts:1152-1154`
  - consume path at `src/gmPromptBuilder.ts:1156-1158`
- Inspector no longer reaches `consumeWorldChangeSummaryContext()`:
  - peek path at `src/gmPromptBuilder.ts:1064-1076`
  - consume path at `src/gmPromptBuilder.ts:1079-1095`
- Therefore Inspector no longer advances:
  - `markWorldChangeSummaryInjected()` in `src/worldState.ts:124-129`
  - `markChronicleInjected()` in `src/worldState.ts:133-138`
  - `chronicleSessionPending` clear in `src/gmPromptBuilder.ts:1100-1113`

## 2. Side-Effect Inventory

| Function / path | Side effect | Class | Reachable from Inspector | Verdict |
|:---|:---|:---|:---|:---|
| `peekChronicleRecapContext()` -> `buildChronicleRecapContext(false, ...)` | Reads journal + world state, no marker advance, no pending clear | Read-only except downstream caches | Yes | Already fixed by `PROMPT-001A`; no remaining durable consume |
| `peekWorldChangeSummaryContext()` | Reads `world_state.json`, no summary ACK advance | Read-only except downstream caches | Yes | Already fixed by `PROMPT-001A`; no remaining durable consume |
| `loadWorldState()` in `src/worldState.ts:84-120` | Mutates `cachedState`, `cachedWorldStateParseWarnings`, `lastWorldStateParseWarnings`; may `console.warn` parse-cap warnings | In-memory diagnostic mutation | Yes | Concrete reachable mutation; not durable, but not query-pure |
| `loadAllLorebookEntriesRaw()` in `src/gmPromptBuilder.ts:267-293` | Mutates lorebook mtime cache | Harmless cache | Yes | Reachable but non-authoritative; not a blocking violation by itself |
| `loadWorldForge()` in `src/worldForge.ts:55-76` | Mutates forge mtime cache | Harmless cache | Yes | Reachable but non-authoritative |
| `loadNpcRegistry()` in `src/npcRegistry.ts:57-75` | Mutates registry mtime cache | Harmless cache | Yes | Reachable but non-authoritative |
| `getVisualMemoryEntry()` -> `loadVisualMemory()` | Mutates visual memory mtime cache | Harmless cache | Yes | Reachable but non-authoritative |
| `resolveMemoriesViaPython()` -> `memory_bank.py --resolve` | External memory lookup | External read path | Yes | Inspected: resolve path does not rebuild index, does not create Chroma dir |
| `getCharactersDir()` in `src/characterManager.ts:55-63` | Creates `characters/` directory via `fs.mkdirSync(..., { recursive: true })` when absent | Durable filesystem mutation | Yes, via `buildPartyPromptContext()` / `buildPartyDirectorPromptContext()` | Concrete hidden writer; violates read-only |
| `buildGmPromptBreakdown()` + `buildPureCandidateSpecsWithMeta()` | Rebuilds same builders independently; lore/memory are evaluated more than once | Structural rebuild side effect | Yes | Concrete double-build issue; both divergence and mutation exposure |

## 3. Surviving Read-Only Guarantees

The following guarantees survive on current main and should be preserved:

1. Inspector no longer consumes Chronicle recap.
2. Inspector no longer consumes World Change Summary.
3. Inspector no longer advances durable Chronicle / WCS markers.
4. Inspector no longer clears `chronicleSessionPending`.
5. Production `buildGmPromptContext()` remains isolated on the legacy authority lane and is not part of this task.

## 4. Remaining Violations

### V1. Hidden durable write through party helpers

`buildGmPromptBreakdown()` includes both:

- `maybeBuildSection('party', ...)` at `src/gmPromptBuilder.ts:1218`
- `maybeBuildSection('partyDirector', ...)` at `src/gmPromptBuilder.ts:1219`

Those flow into `buildPartyPromptContext()` / `buildPartyDirectorPromptContext()`, which call `loadDynamicProfiles()`, `getPartyIds()`, `loadCharacterById()`, and `getPartyMemberIds()`. All of those depend on `getCharactersDir()`, which will create `characters/` if missing:

- `src/characterManager.ts:55-63`

That means a preview/query operation can mutate workspace contents even when no party data exists yet.

### V2. Inspector mutates global world-state diagnostic buffers

`buildGmPromptBreakdown()` calls `loadWorldState()` through multiple builders and then explicitly again before exporting parse warnings:

- `src/gmPromptBuilder.ts:1226,1230,1246-1247`

`loadWorldState()` mutates:

- `lastWorldStateParseWarnings`
- `cachedWorldStateParseWarnings`
- `cachedState`

and may emit `console.warn` lines:

- `src/worldState.ts:27-45`
- `src/worldState.ts:84-120`

This is not a durable ledger mutation, but it is still a globally observable runtime mutation caused by Inspector/Preview.

### V3. Double-build is not just duplicate work

`buildGmPromptBreakdown()` builds display sections first and then independently rebuilds candidate specs through `buildPureCandidateSpecsWithMeta()`:

- `src/gmPromptBuilder.ts:1168-1249`
- `src/gmPromptBuilder.ts:1464-1468`

This means:

1. The same context builders run twice.
2. Some preview metadata runs even more than twice:
   - lore matching for preview cards
   - lorebook prompt section
   - pure candidate rebuild
   - memory match preview cards
   - memory prompt section
   - pure candidate rebuild
3. The hidden writer in `getCharactersDir()` is exposed multiple times.
4. The world-state diagnostic mutation path is exercised multiple times.
5. Display sections and Context Inspector report are computed from separate snapshots, so they can disagree under concurrent file changes or any hidden mutable builder behavior.

## 5. Double-Build Verdict

**Verdict: `both divergence and mutation risk`**

Reason:

- `mutation risk`: current Inspector path already reaches a concrete durable writer (`getCharactersDir()`) and a concrete in-memory diagnostic mutator (`loadWorldState()`).
- `divergence risk`: display and Context Inspector report are derived from separate rebuilds instead of one shared read-only snapshot.

This is not only a performance issue.

## 6. Required Architecture

Smallest correct Inspector authority model for `PROMPT-001B`:

1. Keep production authority unchanged.
   - `buildGmPromptContext()` must remain on the legacy production lane.
   - `PROMPT-001B` must not implement `PROMPT-001C`.
2. Define an explicit Inspector query lane.
   - Inspector path may read files and compute preview data.
   - Inspector path must not call any helper that can `consume*`, `mark*`, `clear*`, `write*`, `mkdir*`, or mutate shared diagnostic state as a side effect.
3. Build one Inspector snapshot, then fan out.
   - One read-only snapshot should feed both display sections and Context Inspector accounting.
   - Do not rebuild the same chunk set separately for UI display and report math.
4. Split read helpers from ensure/create helpers.
   - Example shape: `tryGetCharactersDir()` or equivalent read-only path resolution for Inspector.
   - Directory creation must stay on write/authoring paths only.
5. Parse warnings should be returned, not globally staged.
   - Inspector should obtain parse warnings as returned data for that snapshot.
   - It should not rely on mutating `lastWorldStateParseWarnings` as a global scratch buffer.

Prefer explicit named APIs over boolean mode switches.

## 7. Touch Set

### MUST CHANGE

- `src/gmPromptBuilder.ts`
  - remove Inspector double-build split by introducing one shared read-only snapshot/result flow
  - keep production legacy path intact
- `src/characterManager.ts`
  - separate read-only directory discovery from directory creation so Inspector cannot create `characters/`

### MAY CHANGE

- `src/worldState.ts`
  - only if needed to expose a read-only parse result / warning-returning helper that does not mutate global warning buffers
- Inspector-only tests under `scripts/` and existing prompt inspector tests

### MUST NOT CHANGE

- delivery receipt / immutable ACK / accepted consumption design
- `PROMPT-001C` authority switch
- production `buildGmPromptContext()` consumption timing
- `gmPromptBuilderCore.ts` budgeter redesign
- provider runner semantics in `gmBridgeRunner.ts` / `agenticGmRunner.ts`

## 8. Required Tests

Minimum required tests for implementation:

1. Inspector does not consume Chronicle recap.
2. Inspector does not consume World Change Summary.
3. Inspector does not clear `chronicleSessionPending`.
4. Inspector on a workspace without `characters/` does not create the directory.
5. Repeated Inspector calls do not change subsequent production output for the same causal inputs.
6. Inspector parse-warning path does not mutate shared global warning state, or the replacement contract is explicitly snapshot-scoped and verified.
7. Display sections and Context Inspector report are generated from one consistent snapshot.
8. Any hidden writer discovered during this gate has a regression test.

## 9. PROMPT-001C Boundary

Deferred to `PROMPT-001C`:

- accepted-time consumption
- immutable ACK / receipt wiring
- production authority switch off legacy consume timing
- delivery / selected / consumed identity unification

`PROMPT-001B` is only about Inspector / Preview query authority and rebuild purity.

## 10. New Finding Candidates

Candidate IDs only; not backlog edits:

- `PROMPT-001B-CAND-001` - Inspector preview can create `characters/` through read helper path.
- `PROMPT-001B-CAND-002` - Inspector breakdown rebuilds display and report independently, creating divergence and side-effect exposure.
- `PROMPT-001B-CAND-003` - Inspector world-state parse warning export relies on shared mutable diagnostic buffers instead of snapshot-local return data.

## 11. Final Verdict

**READY_FOR_ADVERSARIAL_REVIEW**

Reason:

- The source is not ambiguous.
- `PROMPT-001A` surviving guarantees are confirmed.
- Remaining issues are concrete, reachable, and small enough to adversarially pressure-test without returning to open-ended discovery.
- The correct next step is to attack the minimal read-only authority contract, not redesign production receipt/ACK flow.
