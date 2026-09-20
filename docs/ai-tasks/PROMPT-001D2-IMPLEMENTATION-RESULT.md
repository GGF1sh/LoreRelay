# PROMPT-001D2 - Local Draft Rescue / Implementation Result

Date: 2026-07-06
Role: Local Draft Rescue / Architecture-Aware Verification

## 1. Located worktree

- Original local draft was found in `C:\AI\text-adventure-vsce`
- Dirty files there:
  - `src/promptContext.ts`
  - `src/gmPromptBuilder.ts`
  - `docs/ai-tasks/PROMPT-001D2-IMPLEMENTATION-RESULT.md` (untracked local draft)
- That worktree was on `ux/genesis-mode-visual-polish` at `906be99eef1cf2b8264610a0b3d8d15a097472a4`

## 2. Original local diff audit

The rescued draft had three main issues:

1. **Global mutable authority**
   - `lastShadowReport` was module-level mutable state.
   - `buildGmPromptBreakdown()` read that shared mutable report instead of threading a report tied to its own assembly result.
   - This created a real turn-correlation risk: turn B could overwrite the “latest” report observed by turn A.

2. **Truthful failure reporting violation**
   - Shadow exceptions were swallowed into a normal-looking empty report with `shadowSelectedCount: 0` and empty partitions.
   - That looked like success-with-no-selection instead of an explicit failed comparison.

3. **Stale-main / wrong-base problem**
   - The draft lived on `ux/genesis-mode-visual-polish`, not on current main.
   - Current `origin/main` had already advanced to `16be517466a4f0a5947a54caa5de89214f539304` (Genesis merged, PROMPT-001C preserved).

## 3. Stale-main verdict

- **STALE / WRONG BASE**
- The original dirty worktree base was not current main.
- Rescue work was redone on fresh `origin/main` branch `task/PROMPT-001D2-budget-shadow-integration`.

## 4. Repairs made

### A. Production authority isolation

- Added a pure `buildCategoryBudgetShadowReport(...)` helper.
- Production shadow evaluation now runs only after `selectedSpecs` is fixed.
- Shadow report is attached to the returned `ProductionPromptAssembly`, not cached globally.
- Receipt creation still uses only production `selectedSpecs`.
- Shadow result does not feed:
  - selected IDs
  - final prompt payload
  - receipt `assemblyDigest`
  - selected tokens
  - ACK / Accepted
  - provider dispatch

### B. Inspector purity

- Removed the global “latest report” model entirely.
- `buildGmPromptBreakdown()` now computes an Inspector-local shadow report from its own read-only assembly.
- Inspector does not call `buildProductionPromptAssembly()`.
- Inspector report is threaded explicitly through `finalizeBreakdown(..., shadowReport)`.
- Report is frozen and remains attached to that specific breakdown result.

### C. Failure isolation

- Shadow evaluation failure now returns an explicit discriminated failure report:
  - `status: 'failed'`
  - `failureMessage`
- Production assembly still succeeds and keeps the same selected IDs / payload / receipt digest.
- No fake “empty successful comparison” is emitted.

### D. Stable IDs / deterministic output

- Comparison keys use stable chunk IDs.
- Partition arrays are derived from compared sets by stable IDs, not array positions.
- Category counts are derived from actual candidate / production-selected / shadow-selected sets.

### E. Fresh-main compatibility

- Work was rebuilt on top of current main `16be517`.
- No PROMPT-001C behavior was changed.
- Genesis merged content from main was preserved.

## 5. Changed files

- `src/promptContext.ts`
- `src/gmPromptBuilder.ts`
- `scripts/test_prompt_budget_shadow_integration.js`
- `scripts/test_prompt_receipt_accepted_consumption.js`
- `scripts/run_all_tests.js`
- `docs/ai-tasks/PROMPT-001D2-IMPLEMENTATION-RESULT.md`

## 6. Focused verification

### Focused tests run

- `node scripts/test_prompt_budget_shadow_integration.js`
- `node scripts/test_prompt_candidate_purity.js`
- `node scripts/test_prompt_receipt_accepted_consumption.js`
- `node scripts/test_context_inspector_integration.js`

### Focused test outcomes

- shadow cannot alter production selected IDs
- shadow cannot alter final prompt payload
- shadow cannot alter receipt `assemblyDigest`
- shadow cannot consume Chronicle / WCS
- shadow failure cannot block production
- comparison uses stable IDs
- repeated identical input yields identical report
- category counts are truthful
- overlap / production-only / shadow-only partition is complete
- Inspector read has no rebuild / mutation side effect
- turn A report cannot be mistaken for turn B report
- failed shadow evaluation is explicitly reported as failure

## 7. Compile / suite

- `npm run compile`: PASS
- `npm test`: PASS (`224/224`)
- `node scripts/check_i18n_keys.js`: PASS
  - `ja: 0`
  - `en: 0`
  - `zh-CN: 0`
  - `zh-TW: 0`

## 8. New findings

- The original Antigravity draft’s core risk was not the category allocator itself, but the mutable `lastShadowReport` authority model.
- Existing receipt tests needed a tiny structural allowance for the new internal production-assembly helper name.

## 9. Final verdict

`PROMPT001D2_RESCUED_READY_FOR_REVIEW`
