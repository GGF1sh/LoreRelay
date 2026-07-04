# Debug Trace Inspector UI Design

Status: Design (UI/UX) — Phase A **shipped** v1.77.8 · Phase B **pending**
Date: 2026-07-04
Owner: Claude Sonnet 5
Recommended implementation model: Claude Sonnet (Webview render module), Grok/Codex (host wiring gate)
Recommended reasoning: Medium

## 日本語サマリ（開発者向け）

- **目的:** シミュレーションが「何を根拠に、どう判断し、何を起こしたか」を Inspector で読み取る（`event → rule condition → decision → effect`）。
- **Context Inspector との違い:** Context Inspector は GM プロンプトのチャンク会計。Debug Trace はワールド/シミュレーションの因果。別セクションに置き、混ぜない。
- **Phase A（完了 v1.77.8）:** `debugTraceHostCore.ts` が buffer を保持し、`worldSimPersist` の各 step で trace を記録。`debugTraceUpdate` を debug-console 表示時のみ Webview へ post。
- **Phase B（次）:** `81-debug-trace.js` でタイムライン描画。監査者切替（`internal` / `gm_safe` / `player_safe`）は Webview 内の `projectDebugTraceBuffer` のみ。ホスト往復なし。
- **i18n:** 新規キーは `en` / **`ja`** / `zh-CN` / `zh-TW` 必須。例: セクション名「デバッグトレース」、監査者「内部 / GM向け / プレイヤー安全」、空状態「トレースはまだありません」。

## 1. Summary

`src/debugTraceCore.ts` (P1, shipped) is a pure, in-memory trace vocabulary: bounded ring buffer,
`event -> rule condition -> decision -> effect`, and an `internal` / `gm_safe` / `player_safe`
audience projection. Nothing produces entries yet and nothing renders them. This document designs
the Inspector-side UI for when a trace buffer exists, and separates that from the (smaller, but
non-UI) host wiring that has to exist first for there to be any data to show.

This is **read-only** design. No GM prompt integration, no state mutation, no Remote/Replay
exposure. It follows the same boundary discipline as `docs/CONTEXT_ENGINE_P0_INSPECTOR_DESIGN.md`.

## 2. Goals

1. Let a developer/GM open the Inspector and answer: "what did the simulation decide, and why?"
2. Show the causal chain (`input -> query -> decision -> effect`/`event`/`warning`) as a readable,
   collapsible timeline, not a JSON dump.
3. Make parent/child trace relationships (and `validateDebugTraceLinks` warnings) visible without
   a graph renderer.
4. Provide an audience switch (`internal` / `gm_safe` / `player_safe`) that demonstrates
   `projectDebugTraceBuffer` — this is a debugging aid to see what each audience *would* see, not a
   live player-facing feature.
5. Live in the existing Inspector tab without visually competing with Context Inspector
   (`inspector-context-inspector`), which explains prompt composition, not simulation causality.

## 3. Non-Goals

- No wiring `debugTraceCore` into any subsystem yet (that is P2 scope per
  `docs/DEBUG_TRACE_P1_DESIGN.md` §12 — deferred).
- No VS Code command, no Output Channel.
- No disk persistence of trace buffers.
- No GM prompt / TurnResult / statePatch integration.
- No Remote Play or replay export of trace data.
- No semantic redaction — `player_safe`/`gm_safe` filtering is exactly
  `projectDebugTraceBuffer`'s declared-audience filter, nothing smarter.
- No mutation postMessage (no "replay this decision", no "apply fix").

## 4. Phase A Host Wiring (shipped v1.77.8)

Phase A landed as **`src/debugTraceHostCore.ts`** (v1.77.8, Grok). The UI doc originally deferred
this layer; it now exists and matches §7.

Implemented:

- per-session `DebugTraceBuffer` via `createDebugTraceBuffer()`;
- `captureDebugTraceSimulationStep` on `worldSimPersist` `afterStep` (covers bulk sim, debug
  scenario `world_sim`, narrative time-passage sim — all paths through `persistWorldSimulationSteps`);
- `debugTraceUpdate` postMessage from `extension.ts`, gated by `isBulkWorldSimDebugEnabled() ||
  isActiveDebugScenario()` (same visibility as `inspector-debug-console-section`);
- `scripts/test_debug_trace_host.js`.

Phase B (this doc) can assume real `debugTraceUpdate` messages during bulk sim / debug sandbox runs.
No further host work is required for the first Inspector render pass.

## 5. Placement In The Inspector Tab

Current `pane-inspector` layout (top to bottom, from `webview/index.html`):

```text
inspector-debug-console-section   (bulk sim / sandbox quick commands, debug-only)
inspector-chronicle-section
inspector-replay-section
inspector-git-timeline
inspector-content
  inspector-turn-id
  inspector-integrity
  inspector-dice-ledger
  inspector-state-patch
  inspector-lorebook
  inspector-living-world-ops-section
  (prompt context block)
    inspector-prompt-summary
    inspector-context-inspector      <- Context Engine P0 (prompt chunk accounting)
    inspector-world-state-warnings
    inspector-prompt-sections
  inspector-memory-matches
  inspector-lore-matches
  inspector-schema-errors
  inspector-hidden-state
```

Debug Trace is about **simulation/world decisions**, Context Inspector is about **prompt chunk
accounting**. They answer different questions and must not merge into one collapsible list.
Proposed placement: a new `inspector-debug-trace-section`, sibling to
`inspector-debug-console-section`, directly below it — both are "debug tooling" and both are
gated by the same debug-visibility flag. This keeps it physically separate from the
turn-result/prompt-context block that `inspector-content` renders per GM call.

```text
inspector-debug-console-section     (existing: bulk sim, sandbox quick commands)
inspector-debug-trace-section       (new)
inspector-chronicle-section
...
```

## 6. Audience Toggle

A 3-way segmented control at the top of the section, mirroring the visual language of existing
`small-btn`/tag-item chips (no new widget system):

```text
[ Internal ] [ GM-safe ] [ Player-safe ]
```

- Default: `internal` (this is developer tooling; defaulting to the most-open view is correct
  here, unlike a player-facing surface).
- Selecting a mode calls `projectDebugTraceBuffer(buffer, mode)` **in the Webview** against the
  already-received buffer — no round-trip to the host, since projection is a pure filter over data
  already sent. (If the host chooses to only ever send an `internal`-scoped buffer to the debug
  Inspector, this still works: the Webview can locally simulate what `gm_safe`/`player_safe` would
  drop, which is exactly the useful debugging question — "would the player have seen this?")
- Entries hidden by the current audience filter are not deleted from the DOM read model; they are
  simply not rendered, so switching modes is instant and stateless.

## 7. Data Contract (what Phase A must eventually send)

```ts
// New message type, additive, only sent when debug console is visible.
{
  type: 'debugTraceUpdate',
  buffer: DebugTraceBuffer,        // as defined in src/debugTraceCore.ts
  linkWarnings: DebugTraceWarning[] // from validateDebugTraceLinks(buffer)
}
```

The Webview never mutates or acks this message. If `debugTraceCore` types change, the Webview
render module must degrade gracefully (see §11, "no entries yet" state) rather than throw.

## 8. Timeline UI

Group entries by `runId`, newest run first, each run collapsible (`<details>`, matching the
existing `inspector-item` / `prompt-section` pattern used throughout `80-inspector.js`). Within a
run, render entries in buffer order (already deterministic/insertion-ordered per
`debugTraceCore.ts`), indented by parent/child depth computed from `parentTraceId`.

Per-entry row (collapsed):

```text
▸ [decision] npcAgency · food_crisis_buy_wheat · not_matched          T142  internal
```

- Phase icon/tag (`input`/`query`/`decision`/`effect`/`event`/`persist`/`prompt`/`warning`) —
  reuse the `tag-item` chip style already used for category/priority chips in
  `renderContextInspector`.
- `subsystem · ruleId · decision` as the main label (fields are optional; omit gracefully).
- `worldTurn`/`gmTurn` badge if present.
- `audience` chip, colored by rank (`internal` most visible/warning color, `player_safe` calmest
  color) so a scan of the timeline immediately shows how "loud" a run was.

Expanded (on click, matching existing `<details>`/`<pre class="prompt-preview">` convention):

- `message` (free text, escaped).
- `conditions[]` as a small checklist: `✓`/`✗` + `label` + optional `actual → expected` — this is
  the single most useful part for the causal bugs in `DEBUG_TRACE_P1_DESIGN.md` §2 (e.g. the
  faction-warning-mistaken-for-food-crisis bug becomes one glance: `category === resource: ✗
  (actual: faction, expected: resource)`).
- `inputRefs[]` / `outputRefs[]` as tag chips: `kind:id` (e.g. `event:wce_142_faction_merchants_smiths`).
- `parentTraceId`, if present, as a clickable chip that scrolls/highlights the parent row within
  the same run (pure DOM scroll, no host round-trip).

## 9. Linkage Warnings

Render `linkWarnings` (from `validateDebugTraceLinks`) as a small warning list above the timeline,
same visual treatment as `inspector-world-state-warnings` (`.world-state-warning` class already
exists and is reused, not duplicated):

```text
⚠ Duplicate traceId "trace_food_crisis_001"
⚠ parentTraceId "trace_x" is not present in buffer
```

Clicking a warning scrolls to the offending `traceId`'s row (same highlight mechanism as §8's
parent-link chip).

## 10. Empty / Disabled States

- No debug buffer wired yet (Phase A not merged): section stays `hidden`, same pattern as
  `inspector-debug-console-section`'s `showDebugConsole`/`bulkWorldSim` gate — do not show an
  empty section to non-debug users.
- Buffer wired but empty (`entries.length === 0`): show the section with an `empty-text` line,
  matching `T('webview.inspector.noDice')`-style empty states elsewhere in this file.
- Malformed/missing message payload: render nothing, log nothing user-visible (mirrors how
  `renderPromptContext` bails out silently when `breakdown` is falsy).

## 11. File-Level Breakdown

### Phase A (host wiring — **done** v1.77.8)

- `src/debugTraceHostCore.ts` — shipped.
- `worldSimPersist.ts` `afterStep` capture — shipped.
- `extension.ts` `debugTraceUpdate` post — shipped.
- `scripts/test_debug_trace_host.js` — shipped.

### Phase B (Webview UI — **next**, safe for Claude)

- `webview/modules/81-debug-trace.js` (new, numbered after `80-inspector.js` since it's an Inspector
  sub-feature, registered in `JS_MODULE_ORDER` in `scripts/build-webview.js`).
  - `window.addEventListener('message', ...)` handling `debugTraceUpdate`.
  - `renderDebugTrace(buffer, linkWarnings)`, audience toggle state, `<details>` tree builder per
    §8, warning list per §9.
  - Pure DOM/string logic only — no `postMessage` other than none (fully read-only, so possibly
    zero outbound messages from this module).
- `webview/styles/91-debug-trace.css` (new; or fold into `90-inspector.css` if small — prefer a
  new file so Debug Trace visual language, e.g. audience chip colors, doesn't get lost inside the
  larger Inspector stylesheet). Register in `CSS_MODULE_ORDER`.
- `webview/index.html`: add `inspector-debug-trace-section` per §5, initially `hidden`.
- i18n keys (`en`/`ja`/`zh-CN`/`zh-TW`) for section title, audience labels, empty-state text,
  hint text — following the existing `webview.inspector.*` key namespace, e.g.
  `webview.inspector.debugTrace.title` (`ja`: デバッグトレース),
  `webview.inspector.debugTrace.audience.internal` (`ja`: 内部),
  `webview.inspector.debugTrace.audience.gmSafe` (`ja`: GM向け),
  `webview.inspector.debugTrace.audience.playerSafe` (`ja`: プレイヤー安全),
  `webview.inspector.debugTrace.empty` (`ja`: トレースはまだありません).
- `scripts/test_debug_trace_render_contract.js` (optional, static harness): given a fixture
  `DebugTraceBuffer` + `linkWarnings`, assert the render function produces expected grouping/order
  without a live VS Code host — same spirit as existing static preview harnesses used for other
  Webview polish work in this project.

## 12. P0 / P1 / P2 Priority For This Effort

- **P0 (done):** this design doc + Claude's static HTML prototype (audience toggle, warning jump
  validated).
- **P1 (ready now — Phase A shipped v1.77.8):** wire `81-debug-trace.js` + CSS into
  `index.html` / `build-webview.js` behind the debug-visible flag; consume live `debugTraceUpdate`
  messages. Pure Webview work — Claude's primary scope.
- **P2 (defer):** additional call sites beyond `worldSimPersist`, replay/remote-safe trace
  summaries, `LoreRelay: Inspect Last Simulation Tick` command, Output Channel formatting.

## 13. Required Tests (Phase B)

1. Render with empty buffer shows empty-state text, not an error.
2. Render with one internal-only entry: `player_safe` toggle hides it, `internal` shows it.
3. Parent/child indentation matches `parentTraceId` chain depth.
4. `linkWarnings` render and clicking one scrolls/highlights the correct `traceId` row.
5. Conditions render `✓`/`✗` correctly and `actual`/`expected` are escaped.
6. Missing/malformed `debugTraceUpdate` payload does not throw (module degrades silently).
7. Toggling audience does not send any `postMessage` to the host (purely local filter).
8. i18n keys exist for all new labels in `en`, `ja`, `zh-CN`, `zh-TW`
   (`node scripts/check_i18n_keys.js`).

## 14. Implementation Prompt (Phase B, for whichever AI picks this up)

```markdown
LoreRelay Debug Trace Inspector UI (Phase B — Webview render only).

推奨モデル: Claude Sonnet
推奨推論: Medium

Read first:
1. AI_SHARED_LOG.md Current Snapshot
2. docs/DEBUG_TRACE_P1_DESIGN.md
3. docs/DEBUG_TRACE_INSPECTOR_UI_DESIGN.md (this file)
4. src/debugTraceCore.ts
5. src/debugTraceHostCore.ts (Phase A — already shipped v1.77.8)
6. webview/modules/80-inspector.js
7. webview/index.html (pane-inspector section)
8. webview/styles/90-inspector.css
9. scripts/build-webview.js (JS_MODULE_ORDER / CSS_MODULE_ORDER)

Task:
Implement the Phase B Webview render module per §11. Phase A is shipped — wire against live
`debugTraceUpdate` messages. Do not add host-side trace emission; use fixture only for unit tests.
i18n: include Japanese (`ja`) labels per §11 examples.

Scope:
- webview/modules/81-debug-trace.js
- webview/styles/91-debug-trace.css (or fold into 90-inspector.css if trivially small)
- inspector-debug-trace-section in webview/index.html, hidden by default
- i18n keys in en/ja/zh-CN/zh-TW
- Register both new module files in scripts/build-webview.js order arrays

Forbidden:
- No host-side trace buffer/emission wiring (separate gate).
- No new postMessage types from the Webview.
- No GM prompt / TurnResult / statePatch / Remote / Replay changes.
- No mutation actions (no "apply", "replay", "fix" buttons).

Verification:
- npm run build:webview
- node scripts/check_i18n_keys.js
- node scripts/validate_utf8_docs.js
- npm test
```

## 15. Acceptance Criteria

Phase B is done when a developer can open the Inspector, see a collapsible per-run trace timeline
with parent/child structure, conditions, refs, and linkage warnings, switch between
`internal`/`gm_safe`/`player_safe` views instantly with no host round-trip, and see a clean empty
state when no trace data exists yet — all without any change to GM prompt output, ledger writes,
or player-visible behavior.
