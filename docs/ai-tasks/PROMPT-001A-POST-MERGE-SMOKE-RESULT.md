# Post-Merge Smoke Result: PROMPT-001A

| Field | Value |
|:---|:---|
| **Executor** | Codex (VS Code) |
| **Smoke Target** | current `origin/main` |
| **Smoke HEAD** | `7070912f223364e0b19049336ba3ea0a39e4e046` |
| **Implementation Merge** | `99a3b8ed2e02898eb5f0f2db45b5bd15b1074ac5` |
| **Final Verdict** | **POST_MERGE_SMOKE_PASS** |

---

## 1. Snapshot

- current `origin/main`: `7070912f223364e0b19049336ba3ea0a39e4e046`
- clean detached smoke worktree HEAD: same commit
- `99a3b8e` ancestry check: PASS (`git merge-base --is-ancestor`, exit code 0)
- starting `git status --short`: empty

The smoke run therefore tested current main, not the stale original implementation worktree.

---

## 2. Source Smoke

All required authority checks passed on merged main:

- `buildGmPromptBreakdown` → `buildPureCandidateSpecsWithMeta`
- `buildGmPromptContext` → `buildLegacyProductionSpecs`
- `buildGmPromptContext` directly calls `evictPromptChunksByBudget`
- Pure strategy uses:
  - `peekChronicleRecapContext`
  - `peekWorldChangeSummaryContext`
- Legacy strategy uses:
  - `consumeChronicleRecapContext`
  - `consumeWorldChangeSummaryContext`

Result: **PASS**.

---

## 3. Build and Test Evidence

### Dependency setup

- `npm ci`: PASS
- no tracked diff immediately after install

### Compile

- `npm run compile`: PASS

### PROMPT-001A targeted test

- `node scripts/test_prompt_candidate_purity.js`: PASS
- 19 assertions PASS

### Existing Inspector integration test

- `node scripts/test_context_inspector_integration.js`: PASS

### Related tests

All PASS:

- `test_gm_prompt_builder_core.js`
- `test_prompt_budget_eviction.js`
- `test_prompt_chunk_activation.js`
- `test_prompt_context_budget.js`
- `test_chronicle_core.js`

### Full suite

- `npm test`: PASS
- `220/220 passed`

No GitHub CI/status checks exist; this remains local smoke evidence.

---

## 4. Final Cleanliness Investigation

After compile, `git status --short` reported:

```text
 M webview/script.js
 M webview/style.css
 M webview/vendor/mermaid.min.js
```

These are exactly the tracked generated outputs written by the existing compile pipeline:

```text
npm run compile
→ npm run build:webview
→ sync_cartography_theme_styles
→ tsc
```

The generated-file dirtiness was investigated without modifying or restoring the worktree.

### Plain diff

- `git diff --exit-code ...`: exit 0
- no patch body
- warnings only

### Ignore CR at EOL

- `git diff --ignore-cr-at-eol --exit-code ...`: exit 0

### Numstat

- no additions/deletions
- warnings only

### Binary diff

- no patch body
- warnings only

### EOL state

```text
i/lf    w/mixed attr/                     webview/script.js
i/lf    w/mixed attr/                     webview/style.css
i/lf    w/lf    attr/                     webview/vendor/mermaid.min.js
```

### Git configuration

- `core.autocrlf=true` from system Git config
- `core.safecrlf` unset

### Classification

`EOL_ONLY_DIRTY`

There is no real content diff. The tracked generated-file status noise is caused by Windows EOL normalization behavior, not by PROMPT-001A, the merge, or the tests.

---

## 5. Chief Integrator Disposition

The post-merge smoke is accepted as:

`POST_MERGE_SMOKE_PASS`

The earlier apparent cleanliness failure is reclassified as a separate repository-hygiene concern and does not block PROMPT-001A staging completion.

Required lifecycle transition:

`PROMPT-001A → BLOCKED (Waiting for PROMPT-001C)`

PROMPT-001A must not be marked DONE until PROMPT-001C completes the production authority switch and downstream integration proves the full Candidate → Delivered → Accepted → Consumed contract.
