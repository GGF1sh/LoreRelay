# RUNTIME-002A Verification Result

| Field | Value |
|:---|:---|
| **Task** | `RUNTIME-002A` |
| **Implementation Commit** | `5dd883349a99f322f7174d9c51763a2e62236cea` |
| **Verification Main** | `0d1e11d12bdf24838331c866eed6cd5b0c5d2f9c` |
| **Verifier Verdict** | **VERIFYING_FAIL** |
| **Chief Classification** | **REPAIR_REQUIRED — architecture survives** |

## 1. Snapshot

- implementation base: `4397c9f8f915b8ce7f2d379f7a9eb0adf0f8e275`
- implementation branch tip: `5dd883349a99f322f7174d9c51763a2e62236cea`
- current main advanced by docs only;
- no runtime/test source drift in the target files.

## 2. Diff Scope

The implementation changed exactly the five authorized files:

- `scripts/run_all_tests.js`
- `scripts/test_runtime_turn_result_acceptance.js`
- `src/gameStateSync.ts`
- `src/statePatch.ts`
- `src/turnResultFallback.ts`

No out-of-scope tracked file changed.

## 3. Contracts That Passed Verification

The implementation correctly establishes:

- read/hash/duplicate/parse before application;
- `processTurnResult() === false` returns before dedupe/Handled/callback/success side effects;
- accepted hash commits only after truthy application;
- Handled/callback occur after accepted hash commit;
- callback detach-before-invoke is preserved;
- callback exceptions are isolated;
- structured and thrown secondary-ledger failures remain Accepted;
- journal append failure remains Accepted;
- same-hash failed result remains retryable;
- duplicate accepted file does not reapply or re-fire callback;
- rejected result emits no success-only media/UI/bootstrap effects.

## 4. Merge-Blocking Post-Commit Closure Gap

Verifier verdict:

`POST_COMMIT_CLOSURE_GAP`

After successful canonical commit, `processTurnResult()` still executes:

```ts
const wsPath = getWorkspacePath();
```

outside post-commit exception isolation.

`getWorkspacePath()` calls `getActiveWorkspaceFolder()`. In multi-root workspaces, current `getActiveWorkspaceFolder()` executes:

```ts
config.get<string>('workspaceFolder', '').trim()
```

A malformed non-string configuration value can therefore throw after canonical commit. That exception reaches the outer `processTurnResult()` catch and returns `false`, violating the central contract:

```text
truthy = Accepted
false = Accepted boundary not crossed
```

This is a real merge-blocking gap.

## 5. Test Non-Vacuity

The focused test directly catches regressions for:

- hash moved before `processTurnResult()`;
- Handled before Accepted;
- rejected result success-side effects;
- same-hash failure suppressing retry;
- duplicate reapply;
- secondary ledger throw returning false;
- journal append failure returning false;
- callback exception escaping.

It does not currently catch the post-commit `getWorkspacePath()` escape.

## 6. Missing Required Proofs

### Restart with failed file

Missing exact proof:

```text
failed file remains
→ module state reset / restart
→ transient condition clears
→ startup/fallback processing succeeds
```

Classification: **merge-blocking missing proof**.

### Watcher + fallback integration

Current focused test repeatedly calls the file processor directly but does not exercise:

```text
watcher observation
+
checkPendingTurnResultFile / finishGmRun fallback
```

around one successful file.

Classification: **merge-blocking missing proof**.

## 7. Test Hooks

Accepted.

The `ForTests` exports are low-risk, explicit, and consistent with repository testing conventions. They do not alter production authority unless deliberately imported.

## 8. Independent Test Results

All currently implemented tests passed:

- `npm ci`: PASS
- `npm run compile`: PASS
- focused acceptance test: PASS
- related runtime/state tests: PASS
- full suite: `221/221` PASS

Passing tests do not override the uncovered post-commit closure gap or the two required proof gaps.

## 9. EOL Diagnosis

The three generated webview files were again classified:

`EOL_ONLY_DIRTY`

No content patch exists.

## 10. Required Repair

No architecture redesign is needed.

Repair only:

1. isolate all post-commit workspace-path/journal setup so no `getWorkspacePath()` failure can escape to outer `false`;
2. add a focused test that forces the post-commit workspace-path lookup to throw and proves the result remains truthy Accepted;
3. add restart-with-failed-file proof;
4. add watcher/fallback integration proof for exactly-once apply/Handled/callback.

## 11. Lifecycle Consequence

`VERIFYING_FAIL`

→ return to implementation for bounded repair on the same task branch.

The Architecture Gate remains valid.

No merge is authorized.
