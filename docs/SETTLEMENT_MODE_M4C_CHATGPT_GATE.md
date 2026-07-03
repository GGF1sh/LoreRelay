# Settlement Mode M4c ChatGPT UX Review Gate

Date: 2026-07-04 JST
Reviewer: Codex / ChatGPT (run **after** Claude implements M4 UX)
Status: **Approved** (2026-07-04 JST) — M4c UX may proceed to M2 replay/remote overlay wiring

Prerequisites:

- M4a pure core: `src/settlementLayerExpansionCore.ts`
- M4b persistence: `src/settlementLayoutTurnOps.ts`, commit `0b8bbb1` on `main`
- M3b renderer: `webview/modules/86b-settlement-isometric.js`
- Design: `docs/SETTLEMENT_MODE_M4_DESIGN.md` §7 Webview / UX Boundary

This gate reviews Claude's **M4 UX preview/request flow** only. It does not
authorize new persistence surfaces.

## Review Checklist (must pass)

| # | Check | Pass criteria |
|---|---|---|
| 1 | No Webview disk writes | Webview modules do not call `fs`, `writeJsonAtomic`, or workspace paths |
| 2 | No direct layout mutation | No handler writes `settlement_layout.json` from Webview or a new shortcut path |
| 3 | GM request only | User actions use `insertChatText` (or equivalent chat draft) — not turn apply |
| 4 | `expand_layer` only | Request text references bounded `expand_layer` with allowed `layerId` + `profile`; no other `settlementOps` |
| 5 | Allowed layer IDs | Only `z1`, `z0`, `z-1`, `z-2` offered in UI |
| 6 | Closed profiles | Only M4a profiles: `cellar`, `waterworks`, `shelter`, `ruins`, `roof`, `watchtower`, `generic` |
| 7 | Ghost preview is read-only | Preview uses in-memory `applyExpandLayerToLayout` (host or pure core); never persists preview |
| 8 | Existing layers no ghost CTA | Layers already in layout do not show "request expansion" for the same layer |
| 9 | Feature gate | UI hidden or disabled when `enableSettlementMode` is OFF |
| 10 | M3 renderer unchanged canonical rule | Renderer still displays canonical snapshot; ghost overlay is visually distinct |
| 11 | No tile editor | No click-to-dig, drag-build, or arbitrary layer naming |
| 12 | M4b path untouched | Persistence still only via `turn_result.settlementOps` → M4b ledger after GM turn |
| 13 | No false error UX | UI does not surface ledger/persist errors for valid no-op `expand_layer` (M4b `ok:true, applied:false`) |
| 14 | i18n | New user-facing strings in `locales/en.json`, `ja.json`, `zh-CN.json`, `zh-TW.json` |
| 15 | Tests / smoke | Webview smoke or module test updated if new symbols/handlers added |

## Findings (fill after review)

| Severity | Finding | Decision |
|---|---|---|
| Info | Static review confirmed the Webview path only inserts chat text for `expand_layer` requests; it does not write `settlement_layout.json` or apply `settlementOps` directly. | Pass |
| Info | `buildSettlementExpansionPreviews()` derives ghost previews in memory from M4a `applyExpandLayerToLayout()`, only for missing bounded layers/profiles, with allow-listed preview keys. | Pass |
| Info | Existing layer buttons remain bounded to `z1`, `z0`, `z-1`, `z-2`; offered profiles are the closed M4a set. Existing layers do not receive preview CTA entries. | Pass |
| Info | Verification run by Codex: `npm run compile`; `test_settlement_view_core.js`; `test_webview_world_modules.js`; `check_i18n_keys.js`; `validate_utf8_docs.js`. | Pass |

## Gate Result (2026-07-04 JST)

Approved. M4c stays within the UX-only boundary:

- No Webview disk writes.
- No direct `settlement_layout.json` mutation from UI.
- User action posts `insertChatText` with a bounded `expand_layer` request.
- Preview rendering is read-only and visually distinct.
- M4b persistence remains the only write path after a GM turn emits `turn_result.settlementOps.expand_layer`.

Follow-up may proceed to M2 replay/remote overlay wiring, unless manual UI testing finds a visual-only issue.

## Expected M4c Contract

### Allowed

- Settlement isometric panel shows **missing** layers as preview targets
- Buttons such as "Request cellar" / "Request watch platform" insert GM chat text
- Optional ghost overlay (dimmed zones/markers) from pure-core preview
- `localStorage` view prefs only (pan/zoom — existing M3b pattern)
- Extension may attach `expansionPreviews[]` to `worldView.settlementView` payload

### Forbidden

- Webview → disk for any settlement file
- Webview → `settlementOps` apply or `commitGameState`
- Combined game/world/settlement writes
- User-defined layer names or depth beyond M4 caps
- Pathfinding, mining sim, 3D

## Sample GM request text (reference)

Claude implementation should produce text **like** this (exact wording may vary):

```text
[Settlement expansion request]
Please consider emitting turn_result.settlementOps.expand_layer for this settlement.
layerId: z-1
profile: cellar
reason: Player requested cellar expansion from Settlement view.
Do not add layers beyond z1/z0/z-1/z-2.
```

## Required verification (post-implementation)

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
node scripts/test_settlement_layer_expansion_core.js
node scripts/test_settlement_layout_turn_ops_core.js
node scripts/test_settlement_layout_turn_ops.js
node scripts/test_cross_ledger_partial_failure.js
npm test
node scripts/validate_utf8_docs.js
```

Manual:

- Settlement Mode ON → preview visible for missing layer → request inserts chat text only
- Settlement Mode OFF → expansion UI absent
- After GM turn with valid `expand_layer` → layer appears via existing M4b path (no UI write)

## Handoff

If approved: proceed to M2 replay/remote overlay wiring.

If blocked: Claude fixes only UX scope; do not widen persistence.
