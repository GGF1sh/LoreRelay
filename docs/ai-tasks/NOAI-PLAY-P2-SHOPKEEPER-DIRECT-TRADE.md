# NOAI-PLAY-P2: Shopkeeper deterministic direct trade

## Scope

This slice adds one complete deterministic role surface, **暮らす**: local market inspection, buy/sell selection, bounded quantity, explicit review, explicit confirmation, host-authoritative commit, and a readable result. It intentionally does not add travel, gathering, treatment, conversation, role progression, free-text actions, world advancement, narration, or a generic action framework.

## Production authority reused

- `livingWorldCommerceUiCore.executeDirectTrade` and `commerceCore.applyTradeOps` remain the trade authority.
- `livingWorldCommerceUi.executeLivingWorldDirectTrade` remains the canonical host/persistence path.
- Existing `GameState` commerce, `WorldState` markets, `CommerceForge`, current-location checks, and commerce receipt/event draft path are reused.
- `shopkeeperDirectTradeCore` only builds local snapshots, rejects untrusted protocol data, maps production failures, and shapes deterministic UI receipts. It does not own price math or mutate canonical state.

## Protocol and trust boundary

- Webview-to-host message: `shopkeeperDirectTrade`.
- Trusted inputs are only `op`, `marketLocationId`, `commodityId`, and `qty`.
- The host ignores any supplied price, total, preview, or before/after data, re-reads and revalidates through the production path, flushes the scheduled canonical persistence, refreshes the World view, then emits `shopkeeperDirectTradeResult`.
- Preview text is explicitly unconfirmed. The persisted production result is the authority. The shopkeeper flow has no AI, Relay, narration, ComfyUI, or free-text mutation path.

## UI touch set

- `webview/modules/85-world.js`: a compact shopkeeper entry in the existing Commerce panel, modal review/confirm flow, in-flight double-submit guard, Japanese receipt/rejection text, Esc close, focus restoration, keyboard-native controls, and a narrow `width:min(100%,460px)` dialog.
- `src/extension.ts` and `src/webviewHandlers.ts`: shopkeeper-specific host/webview protocol routing.
- `src/shopkeeperDirectTradeCore.ts`: local snapshot, receipt and rejection adapter.

## Rejections

Mapped production conditions: `INSUFFICIENT_CREDITS`, `INSUFFICIENT_CARGO`, `INSUFFICIENT_STOCK`, `CARGO_CAPACITY`, `NOT_TRADED_HERE`, `INVALID_QTY`, and `WRONG_LOCATION`. Each has a Japanese explanation plus a conservative next step; rejection never becomes a success receipt.

## Concurrency and persistence

The confirm button disables during commit and repeated activation is ignored. The host accepts no preview authority and revalidates current state at commit time. State refresh occurs only after the production execution/persistence path; failed persistence is represented as failure in the adapter test contract and does not present an authoritative success state.

## Tests and limitations

Focused tests cover local-only snapshot data, untrusted price/total rejection, production buy/sell execution, core rejection immutability, persistence-failure non-success, Japanese mapping, and dialog/focus/narrow-layout/no-AI static contracts. Existing Commerce and decision-surface tests remain green. Final gate counts are recorded by the completed test run.

## Gate results

- Focused shopkeeper, Commerce UI, and decision-surface tests: PASS.
- `npm run compile`: PASS.
- `node scripts/check_i18n_keys.js`: PASS.
- `npm run check:symbol-registry`: PASS.
- `npm test` (run once): PASS — **242/242**.

Limitations: this is only the local shopkeeper role. It does not provide travel or any other player roles/actions; current market facts remain limited to the production World view payload.

Recommended next slice: one deterministic travel commitment that reuses the existing transport core and leads into another local role surface, without adding a universal action framework.
