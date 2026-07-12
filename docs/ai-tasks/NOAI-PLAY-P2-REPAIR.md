# NOAI-PLAY-P2 repair

## Result

The shopkeeper direct-trade candidate was repaired without redesign, another role, version bump, merge, live workspace access, or external/AI service use. Version remains `1.78.2`.

## Blocker-to-fix mapping

1. **Host concurrency/idempotency** — `shopkeeperRequestGate.ts` adds a shopkeeper-only per-workspace single-flight gate. Every request and result carries `requestId`. A duplicate pending ID awaits the original promise; a completed ID replays the cached result; a different ID while active returns `TRADE_IN_PROGRESS`; a new ID after completion executes normally.
2. **Persistence honesty** — `flushScheduledCommercePersist()` now returns the real `CrossFileDualWriteOutcome`. The host emits success only when both game-state and world-state writes were attempted and succeeded. Total or partial/split failure returns `PERSIST_FAILED` / `PARTIAL_PERSIST_FAILED`, no success receipt and no `persisted:true`.
3. **Shipped bundle** — the canonical webview build was run and `webview/script.js` is committed with `shopkeeperDirectTrade`, request correlation, and the `暮らす` UI. The bundle diff contains the feature without unrelated style/vendor or broad EOL churn.
4. **Copy** — unintended player/report `証らす` copy is corrected to `暮らす` in the module, shipped bundle, and candidate report. The repair test asserts the old copy is absent from those surfaces.

## Request cache and lifecycle

The cache is scoped by workspace key, stores at most 32 completed results per workspace (FIFO eviction, hard implementation cap 128), and holds one active request/promise. It is cleared with panel disposal and exposes explicit workspace/dispose cleanup methods. Webview responses are ignored unless their `requestId` matches the current pending interaction, preventing a late result from overwriting a newer dialog state.

## Persistence-result contract

The existing Commerce scheduler and canonical dual writer remain authoritative. The narrow change preserves existing callers that ignore the flush return value while exposing `ok`, attempted/ok flags for both files, partial/split-brain state, and failed targets. Writer exceptions become failed target results. Existing behavior that still persists markets when trade-event materialization fails is preserved. Partial writes are never presented as authoritative shopkeeper success.

## Quote and quantity corrections

- Shopkeeper snapshots use production `quoteMarketPrice`; the non-production `floor(buyPrice * 0.8)` sell formula and separate sell quote are removed.
- Intent parsing accepts only a numeric, finite, positive integer from 1 through 999. Fractional values, numeric strings, NaN, Infinity, zero/negative and oversized values are rejected before host execution; production execution still revalidates.

## Verification

Focused behavioral tests prove duplicate pending execution once, completed replay, busy rejection, later new requests, success/total-failure/both partial-write directions, stale-response correlation, shipped-bundle content, copy, production quote authority, strict quantity input, original Commerce rejection immutability, existing Commerce behavior, and no shopkeeper AI/Relay/ComfyUI path.

Final gates:

- Focused repair + shopkeeper + Phase-0 persistence + Commerce UI + decision-surface tests: PASS.
- `npm run build:webview`: PASS.
- `npm run compile`: PASS.
- `node scripts/check_i18n_keys.js`: PASS.
- `npm run check:symbol-registry`: PASS (4016 entries).
- `npm test` (run once): PASS — **243/243**.

## Limitations

This remains only the local shopkeeper role. The completed-result cache is process-local and intentionally resets with the panel/extension lifecycle; it is not a durable cross-restart transaction ledger. The existing dual-write compensation policy still records split-brain risk rather than rolling back a successfully written game state, but the UI now reports that outcome as failure instead of authoritative success.
