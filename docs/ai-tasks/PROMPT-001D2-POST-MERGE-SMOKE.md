# PROMPT-001D2 Post-Merge Smoke

| Field | Value |
| --- | --- |
| Repository | `GGF1sh/LoreRelay` |
| Current main | `a319e68b3d054e8e370eaee3f6e229f92278dcaa` |
| Expected merge commit | `a319e68b3d054e8e370eaee3f6e229f92278dcaa` |
| Verdict | `PROMPT001D2_POST_MERGE_SMOKE_PASS` |

## Scope

Post-merge smoke only on current `main`. No source repair or scope expansion was performed.

## Compile

- `npm ci --include=dev` PASS
- `npm run compile` PASS

## Focused Tests

- `node scripts/test_prompt_budget_shadow_integration.js` PASS
- `node scripts/test_prompt_candidate_purity.js` PASS
- `node scripts/test_prompt_receipt_accepted_consumption.js` PASS
- `node scripts/test_context_inspector_integration.js` PASS

## Full Suite

- `npm test` PASS
- Result: `224/224 passed`

## i18n

- `node scripts/check_i18n_keys.js` PASS
- Missing keys: `0` in `ja`, `en`, `zh-CN`, `zh-TW`

## Contract Checks

- Shadow report remains present and result-local.
- No global latest/current report authority is used.
- Production `selected IDs`, `promptText`, receipt `assemblyDigest`, and `selectedTokens` remain unchanged by shadow evaluation.
- Empty top-level invalid output fails explicitly.
- Malformed nested `AllocationResult` / `AllocatedItem` output fails explicitly.
- Valid zero-selection remains successful.
- Inspector remains read-only.
- Chronicle/WCS consumption, Accepted/ACK, and provider behavior remain unchanged.
- World Map / README merge remains present on current `main`.

## Notes

- Compile/test runs produced the usual generated-file EOL-only working-tree noise for:
  - `webview/script.js`
  - `webview/style.css`
  - `webview/vendor/mermaid.min.js`
- No merge-only regression was observed in the PROMPT-001D2 scope.
