# PROMPT-001D2 Verifying Result

| Field | Value |
|:---|:---|
| Task | `PROMPT-001D2` |
| Repository | `GGF1sh/LoreRelay` |
| Current main | `c1e9d1bc211867aaecce3f66eec6c640b89f511f` |
| Reviewed branch | `task/PROMPT-001D2-budget-shadow-integration` |
| Reviewed branch tip | `3bf74bbc630dc2530e5974666f8a722111e1bf7b` |
| Verdict | `VERIFYING_FAIL` |

## Scope

Focused verification only. No source implementation, source modification, merge, or broad architecture review was performed.

Reviewed:

- `docs/ai-tasks/PROMPT-001D2-IMPLEMENTATION-RESULT.md`
- `docs/ai-tasks/PROMPT-001D2-RESCUE-INTAKE.md`
- PROMPT-001D1 budgeter core and tests
- PROMPT-001B Inspector read-only verification contract
- PROMPT-001C post-merge receipt / Accepted-consumption contract
- `scripts/test_prompt_budget_shadow_integration.js`

## 1. Production Authority Isolation

**PASS.**

Production selection is fixed before shadow evaluation. Shadow receives freshly built category inputs and cannot rewrite production `selectedSpecs`. Final `promptText`, receipt `assemblyDigest`, and receipt `selectedTokens` are all derived only from production `selectedSpecs`.

Shadow report data is not used by Accepted correlation, ACK processing, Chronicle/WCS token application, or provider dispatch. The implementation diff does not modify provider runners or Accepted-boundary code.

Attack assessment:

- radically different shadow selection: production remains unchanged;
- shadow throw: caught and production assembly still completes;
- structurally invalid output that throws during iteration: caught and production assembly still completes;
- empty array output: production remains unchanged, but failure truth is wrong (see blocker).

## 2. Inspector Purity

**PASS.**

- no module-level `lastShadowReport` or equivalent latest/current report authority exists in the reviewed implementation;
- `buildGmPromptBreakdown()` uses its own local Inspector assembly;
- Inspector does not call production assembly;
- Chronicle/WCS Inspector reads remain read-only;
- no world-state mutation path is introduced by shadow comparison;
- no shared shadow-report state exists that could alter future production reports.

## 3. Report Identity

**PASS.**

Each production assembly and Inspector breakdown receives its own report object. There is no implicit latest-report lookup. Turn A is not overwritten when turn B is built.

Successful reports are frozen at the top level and freeze partition arrays and per-category count records. Failure reports are frozen at the top level. This is sufficient to prevent post-capture mutation of report contents.

## 4. Failure Truth

**FAIL.**

Thrown failures are truthful: `status: 'failed'` and `failureMessage` are produced while production assembly still succeeds.

However, empty allocator output is not validated. If the shadow allocator returns `[]`, the loop completes normally and the implementation emits a successful report with:

- `status: 'ok'`
- `shadowSelectedCount: 0`
- empty shadow selection

For non-empty candidate input, the D1 allocator contract normally returns category results even when no items fit. Therefore a top-level empty result is an invalid/empty shadow result, but D2 currently misclassifies it as successful empty selection. This violates the required failure-truth attack contract.

## 5. Comparison Truth

**PASS for valid allocator output.**

- stable chunk IDs are comparison keys;
- overlap / production-only / shadow-only are derived by set membership;
- partitions are non-overlapping;
- production and shadow counts reconstruct the compared sets;
- per-category counts derive from actual candidate / production-selected / shadow-selected ID sets;
- repeated deterministic input preserves report ordering.

The empty-output failure-classification defect is handled under Failure Truth rather than reopening the valid-output comparison algorithm.

## 6. Test Quality

**FAIL.**

The suite has strong behavior coverage for:

- production selected-ID invariance against normal shadow execution;
- prompt payload invariance;
- receipt assemblyDigest invariance;
- Chronicle/WCS durable-marker non-consumption;
- thrown-failure isolation;
- stable ID comparison;
- deterministic repeated Inspector input;
- partition/count consistency;
- Inspector no-world-state mutation;
- A/B report isolation;
- explicit thrown-failure reporting.

But two required attacks are not load-bearing in the committed tests:

1. no custom allocator with radically different selection is used to prove production ID / payload / digest invariance under deliberate divergence;
2. no `allocator => []` or equivalent empty-output case asserts explicit failed status.

The second gap hides the real failure-truth defect above.

## 7. Compile / Test Execution

Independent execution was attempted but the verifier environment could not obtain a runnable checkout:

- direct `git` access to `github.com` failed at DNS / outbound connection;
- commit archive retrieval was unavailable;
- no GitHub Actions workflow run exists for the implementation commit.

Therefore these were not independently rerun:

- `npm run compile`
- `node scripts/test_prompt_budget_shadow_integration.js`
- `node scripts/test_prompt_candidate_purity.js`
- `node scripts/test_prompt_receipt_accepted_consumption.js`
- `node scripts/test_context_inspector_integration.js`
- `npm test`

Implementation evidence reports compile PASS and full suite `224/224`, but this does not resolve the static failure-truth blocker.

## Blocker

### D2-V1 — Empty shadow output is misclassified as success

Required narrow repair:

- validate the top-level allocator result before producing a success report;
- for non-empty shadow inputs, invalid/empty allocator output must produce frozen `status: 'failed'` with `failureMessage`;
- production selection, payload, receipt digest/tokens, Accepted boundary, ACK, consumption, and dispatch must remain unchanged;
- add behavior tests using a radically divergent allocator and an empty/invalid allocator result.

## New Findings

No unrelated findings. Only the in-scope failure-truth / attack-coverage defect above.

## Final Verdict

`VERIFYING_FAIL`
