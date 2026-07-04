# AI Shared Log

## Current Snapshot (2026-07-04)

> **版の正本:** `package.json` + `CHANGELOG.md` + [`docs/VERSION_TRUTH.md`](docs/VERSION_TRUTH.md)

| Item | Value |
|------|-------|
| Package version | **1.77.8** |
| Campaign Kit | **Phase A–G** · 7 genre presets · sell_discovery · services state machine(condition/estValue)· **campaign resources**(campaignResourceOps)· campaign quest factionId + reputationOps prompt |
| Living World | LW1 Commerce に評判連動 market demand 追加(v1.51.0) |
| World Observatory | 新規(v1.53.0): 相場スパークライン・年代記・観測者モード(watch/advance)。`enableWorldObservatory` 既定OFF |
| Tests | `npm test` **207/207** (+ `test:simulation` batch) |
| Vehicle System | V1–V5 core/ops + **V4** garage panel + **V5** map/prompt integration |
| Mobile Base | MB1–MB5 core/ops + **MB4** panel + **MB5** interior view reuse |
| Mod System | MOD1 pure resolver (`modSystemCore.ts`) |
| Settlement Mode M4 | M4a (v1.71.0) + M4b persistence (v1.72.0) + M4c UX preview/request (`40ba354`, gate **Approved** `ff86f60`) + M3b/M4c isometric Webview UX polish(Claude, ズーム軸バグ修正含む) |
| Settlement Mode M5 | **完了**（v1.73.0）— M5a/M5b/host配線 + 3-AI review fixes + Three.js lazy load |
| M2 overlay wiring | FoW-safe rumored marker ids + replay/remote sanitize choke point |
| World Intent | **WI1–WI3b** core/bridge · **WI4** refuel accounting · **WI5/WI5b** sanity checker · **WI6–WI7b** migration preview/write-back/restore pilot |
| State Orchestrator | **SO1** ledger descriptor inventory · **SO2** transaction planning gate · **SO2b** turn_result diagnostic command |
| Context Engine | **P0 Inspector** — read-only prompt chunk accounting in Inspector (`contextInspectorCore.ts`) |
| Debug / QA | Simulation regression batch · **Debug Trace P1** core · **Debug Trace P2** host wiring (`debugTraceUpdate`) |
| Idea parking | **Information & Rumor System** idea note |
| Next (推奨) | Debug Trace Inspector UI (Claude Phase B) · SO3 transaction executor design · Context Engine P1 category budgeter |
| Git | `main` synced through v1.77.8 |

---

## 2026-07-04 JST - Grok - v1.77.8 Debug Trace P2 Phase A host wiring

- `debugTraceHostCore.ts`: session buffer, `captureDebugTraceSimulationStep` on `worldSimPersist` afterStep, `debugTraceUpdate` postMessage (debug-console gated).

---

## 2026-07-04 JST - Grok - v1.77.7 Debug Trace P1 core (Codex design + world_state buffer fix)

- `debugTraceCore.ts` + `test_debug_trace_core.js`; bundles Codex `47319be` world_state warning buffer fix.

---

## 2026-07-04 JST - Codex - world_state parse warning buffer P1 fix

- Fixed `loadWorldState()` diagnostic freshness: missing/no-workspace/parse-failure paths now clear stale parse cap warnings, cache hits restore the cached warning snapshot, and missing `world_state.json` updates cache identity to avoid workspace-switch stale `undefined`.
- Added `scripts/test_world_state_warning_buffer.js` and wired it into `run_all_tests.js`.

---

## 2026-07-04 JST - Codex - Debug Trace P1 design

- Added `docs/DEBUG_TRACE_P1_DESIGN.md`: pure structured trace core gate for causal world-debugging.
- Scope: bounded trace entries, immutable ring buffer, parent/child linkage warnings, deterministic ordering, and internal/gm-safe/player-safe projection. No runtime wiring, Webview, VS Code command, disk persistence, `statePatch`, `TurnResult`, Remote/Replay, or GM prompt changes.
- Intended next step after v1.77.6 simulation regression batch: `debugTraceCore.ts` + `scripts/test_debug_trace_core.js`.

---

## 2026-07-04 JST - Grok - v1.77.6 merge simulation regression batch (Gemini)

- Merged `feature/debug-simulation-test-suite`; wired `run_simulation_tests.js` into `npm test` simulation category.

---

## 2026-07-04 JST - Grok - v1.77.5 Inspector world_state cap warnings

- `PromptContextBreakdown.worldStateParseWarnings` + Webview Inspector block.

---

## 2026-07-04 JST - Grok - v1.77.4 WI5 world_state cap warnings + SO2 loadWorldState

- WI5b surfaces `world_state` parse cap overflows; SO2 preview refreshes warning buffer via `loadWorldState()`.

---

## 2026-07-04 JST - Grok - v1.77.3 SO2b GM-turn transaction plan preview command

- `stateOrchestratorPlanHostCore.ts` + `previewGmTurnTransactionPlan` command; `peekLastWorldStateParseWarnings()`.
- Tests **203/203**.

---

## 2026-07-04 JST - Grok - v1.77.2 world_state cap warnings + WI5 settlement validation

- `worldState.ts` logs bounded `parseWorldStateWithWarnings` cap overflows on load.
- WI5 `structural_validation_failed` for invalid settlement ledger; README zh parity. Tests **202/202**.

---

## 2026-07-04 JST - Grok - v1.77.1 follow-up (README restore, SO1/WI5/LW3 test)

- README 4言語: v1.69 以降の文字化けを `2a14bfb` ベースで復元、v1.59+ 機能バッジ追記。
- SO1 `mobile_base_vehicle_turn_ops` descriptor; `parseWorldStateWithWarnings`; WI5 ledger JSON parse errors.
- Integration test: emergent friction stepEvents → faction dynamics. Tests **202/202**.

---

## 2026-07-04 JST - Grok - Claude review P1/P2 batch (v1.77.0)

- **Living World P1** — `stepEvents` separation for faction conflict + food crisis; faction pair binding (`factionId` + `targetFactionId`); emergent sim emits friction `stepEvents`; `isFoodCrisisEvent` unified in `livingWorldTypes.ts`.
- **WI3bR** — sequential batch parity running state in `vehicleWorldIntentBridgeCore.ts`.
- **gameRulesCore** — `normalizeGameRules()` load/save clamp; WI5 sanity loader uses same normalization.
- **Pair key canonicalization** — `worldStateCore` parse + `canonicalizeAffinityPairMap`.
- **WI7 backup** — ms timestamps + collision suffix + exclusive backup dir.
- **SO1** — `checkPhysicalResourceCoordination`; WI5 `diagnoseVehicleStateRaw`.
- Tests **202/202**.

---

## 2026-07-04 JST - Codex - Information & Rumor System idea note

- Added `docs/INFORMATION_RUMOR_SYSTEM_IDEA.md`: parked future design ideas for campaign-time in-world information sharing, rumor spreading, false claims, source concealment, proxy rumor spreaders, trace risk, and reputation consequences.
- Not implemented. Intended future bridge points: Context Engine, In-World Chat, Faction Reputation, Living World, Cartography C9, Settlement hubs, Caravan/Mobile Base routes, and World Intent.

---

## 2026-07-04 JST - Grok - State Orchestrator SO2 Transaction Planning Gate implementation

- `stateOrchestratorPlanCore.ts`: pure `buildStateTransactionPlan` for `gm_turn` using SO1 descriptors + `TURN_LEDGER_PERSIST_ORDER`.
- Reports planned/skipped/blocked steps, descriptor-backed policies, out-of-scope ledger ids, bounded warnings; `resolvePlannedLedgerAttempts` parity helper.
- Tests: `scripts/test_state_orchestrator_plan_core.js`. `npm test` **200/200**.

---

## 2026-07-04 JST - Codex - State Orchestrator SO2 Transaction Planning Gate design

- Added `docs/STATE_ORCHESTRATOR_SO2_TRANSACTION_PLANNING_GATE.md`: pure read-only transaction planning report for GM turn ledger order.
- Scope: use SO1 `LEDGER_DESCRIPTORS` + `TURN_LEDGER_PERSIST_ORDER` to explain planned/skipped/blocked ledger steps and failure policies. No file writes, queue/order changes, rollback, `statePatch`, `TurnResult`, Webview, Remote, Replay, GM prompt, or World Intent execution changes.
- Handoff recommends `stateOrchestratorPlanCore.ts` + `scripts/test_state_orchestrator_plan_core.js`.

---

## 2026-07-04 JST - Grok - Context Engine P0 Inspector implementation

- `contextInspectorCore.ts`: pure `buildContextInspectorReport` with decision semantics (`included` / `included_pinned` / `truncated_by_budget` / `evicted_by_budget` / `skipped_inactive` / `skipped_empty`).
- `gmPromptBuilderCore.ts`: shared `applyPromptChunkBudgetRecords` primitive used by `evictPromptChunksByBudget` and inspector parity.
- `gmPromptBuilder.ts`: `buildGmPromptChunkSpecsWithMeta` tracks inactive/empty ids; `buildGmPromptBreakdown` attaches `contextInspector` to `PromptContextBreakdown`.
- Webview: `80-inspector.js` + `inspector-context-inspector` container; i18n keys in en/ja/zh-CN/zh-TW.
- Tests: `test_context_inspector_core.js`, `test_context_inspector_integration.js`. `npm test` **199/199**.

---

## 2026-07-04 JST - Codex - Context Engine P0 Inspector design

- Added `docs/CONTEXT_ENGINE_P0_INSPECTOR_DESIGN.md`: P0 is a read-only evolution of the existing Inspector prompt context display, not a new retrieval engine.
- Scope: trace current GM prompt chunks as included / pinned / truncated / evicted / empty / inactive, preserve `buildGmPromptContext()` output, and avoid new ledgers, semantic retrieval, Remote/Replay exposure, `TurnResult`, `statePatch`, or State Orchestrator wiring.
- Implementation handoff recommends a pure report builder plus optional `PromptContextBreakdown.contextInspector`, with Webview rendering inside the existing Inspector panel.

---

## 2026-07-04 JST - Grok - State Orchestrator SO1 Ledger Descriptor Inventory implementation

- Added `stateOrchestratorDescriptorCore.ts`: pure descriptor registry + `buildStateOrchestratorDescriptorReport` / `checkTurnLedgerDescriptorOrder` consistency checks against read-only `TURN_LEDGER_PERSIST_ORDER`.
- Nine ledgers cataloged (GM turn primary/secondary, world_state, npc_registry, WI7/WI7b migration commands). No write-path, queue, or order changes.
- `scripts/test_state_orchestrator_descriptor_core.js` (design §15). `npm test` **197/197**.

---

## 2026-07-04 JST - Grok - World Intent WI7b Migration Backup Restore Gate implementation

- Added `ledgerMigrationRestoreCore.ts` (pure metadata/path/report), `ledgerMigrationRestoreHost.ts` (backup listing + pre-restore backup + atomic restore), and `ledgerMigrationRestoreRunner.ts` (QuickPick + modal confirmation + Output Channel).
- Command: `textadventure.restoreVehicleStateMigrationBackup` — manual restore from WI7 migration backups only; not auto-called by WI7.
- `scripts/test_ledger_migration_restore_core.js` (design §18). `npm test` **195/196**.

---

## 2026-07-04 JST - Grok - World Intent WI7 Migration Write-Back Gate implementation

- Added `ledgerMigrationWritebackCore.ts` (pure eligibility/format), `ledgerMigrationWritebackHost.ts` (strict backup + atomic write + post-validation), and `ledgerMigrationWritebackRunner.ts` (modal confirmation + Output Channel).
- Command: `textadventure.applyVehicleStateMigration` — `vehicle_state.json` v0→v1 only; fresh dry-run before write; backup under `.lorerelay/backups/migrations/<timestamp>/`; no apply-all/rollback.
- `scripts/test_ledger_migration_writeback_core.js` (design §16). `npm test` **195/195**.

---

## 2026-07-04 JST - Codex - World Intent WI7b Migration Backup Restore Gate design

- Added `docs/WORLD_INTENT_WI7B_MIGRATION_RESTORE_GATE.md`: manual restore gate for WI7-created `vehicle_state.json` migration backups.
- Scope is explicit user-selected restore only: fixed backup directory, metadata validation, modal confirmation, strict pre-restore backup, atomic replacement, post-restore validation, bounded Output Channel reporting. Automatic rollback, checkpoint/Git restore, Webview/Remote/Replay/GM-turn wiring, and State Orchestrator behavior are deferred.

---

## 2026-07-04 JST - Codex - State Orchestrator SO1 Ledger Descriptor Inventory design

- Added `docs/STATE_ORCHESTRATOR_SO1_DESIGN.md`: observation-only descriptor inventory for existing ledger write surfaces.
- SO1 catalogs ledger owners, phases, queues, backup policies, circuit breakers, and failure policies, then tests parity with `TURN_LEDGER_PERSIST_ORDER`. It explicitly forbids changing write paths, ledger order, queues, `statePatch`, `TurnResult`, Webview/Remote/Replay wiring, transaction plans, rollback, or orchestrated writes.

---

## 2026-07-04 JST - Grok - World Intent WI6b Migration Preview Command implementation

- Added `ledgerMigrationHostCore.ts` (pure report/totals/format), `ledgerMigrationLoader.ts` (fs-only known ledger loader), and `ledgerMigrationRunner.ts` (VS Code command + Output Channel).
- Command: `textadventure.previewWorkspaceMigrations` — loads 8 fixed workspace ledgers, runs WI6 dry-run migration preview, no writes. Output always ends with `No files were changed.`
- `scripts/test_ledger_migration_host_core.js` (design §13). `npm test` **194/194**.

---

## 2026-07-04 JST - Codex - World Intent WI7 Migration Write-Back Gate design

- Added `docs/WORLD_INTENT_WI7_MIGRATION_WRITEBACK_GATE.md`: first explicit migration write-back gate.
- Scope is deliberately narrow: user-confirmed `vehicle_state.json` v0 -> v1 only, fresh dry-run before write, strict timestamped backup before `writeJsonAtomic`, post-write validation, bounded Output Channel reporting. Apply-all, rollback, Webview/Remote/Replay/GM-turn wiring, and State Orchestrator behavior are deferred.

---

## 2026-07-04 JST - Grok - World Intent WI6 Per-Ledger Migration Helper implementation

- Added `ledgerMigrationCore.ts` (`migrateLedgerDocument`, `probeNumericVersion`) and `vehicleMigrationCore.ts` (pilot `vehicle_state` v0→v1).
- Dry-run only: explicit status/appliedSteps/issues; no writes, no semantic auto-fix.
- `scripts/test_ledger_migration_core.js` (design §12). `npm test` **193/193**.

---

## 2026-07-04 JST - Claude - World Intent WI3a-1 Vehicles tab preview (Tier 1)

- Design: `docs/WORLD_INTENT_WI3A_PREVIEW_UI_DESIGN.md` — split the WI3a prompt's ask into Tier 1 (payload-free, state-only, Webview-only) and Tier 2 (payload-aware, needs a new gated host read-only query endpoint), since `move_vehicle` / `repair_vehicle` / `refuel_vehicle`'s real `allowed`/`valid_noop` verdict depends on a destination/amount the Webview never receives. Codex reviewed and endorsed the split; scoped Tier 1 to Claude, Tier 2 to a later Codex gate.
- Implemented Tier 1 only, per Codex's scoped prompt: new pure `webview/modules/89c-vehicle-intent-preview.js` (`LR_vehicleIntentPreview.computeRows(item, enableVehicleSystem)`) derives `set_active_vehicle` / `move_vehicle` / `repair_vehicle` / `refuel_vehicle` status from fields already in the existing `vehicleGarage` payload only. `damage_vehicle` excluded (no player affordance). `move_vehicle` renders as a `needs_input` pseudo-state ("pick a destination to preview"), never a real verdict.
- `89-vehicles.js`'s `renderDetail()` now calls `renderIntentPreview(item)`; block has no buttons/inputs/`addEventListener`, status shown via icon + text (not color-only), screen-reader-only status text span. CSS added to `webview/styles/89-vehicles.css`. i18n keys added to all 4 locales.
- `scripts/test_webview_vehicle_intent_preview.js`: asserts build-manifest order, no host query/message symbols in the pure module, no interactive DOM in the render block, i18n key presence in all locales, and functional `computeRows()` taxonomy (system-disabled/lost blocks everything; already-active/already-max-hp/already-full → `valid_noop`; `move_vehicle` never claims a verdict; no-fuel-tank blocks refuel specifically).
- No `src/*.ts` change, no new Webview→host `postMessage`, no `queryWorldIntent()`/`executeWorldIntent()` call. `npm run compile`, `npm test` **192/192**, `check_i18n_keys.js` 0 missing, `validate_utf8_docs.js` OK.
- Note: `scripts/run_all_tests.js` had a concurrent edit (another AI's WI5 test registration) land while this was in progress; re-added this task's manifest line after re-reading the file rather than overwriting the concurrent change.

---

## 2026-07-04 JST - Codex - World Intent WI3b Gate + Claude WI3a prompt

- Added `docs/WORLD_INTENT_WI3B_CHATGPT_GATE.md` (**Approved with constraints**): vehicle World Intent host bridge may run only `off` / `shadow` / `compare_only` diagnostics around the existing `vehicleTurnOps` ledger path. Legacy `vehicleOps` remains canonical; parity uses pre-write cloned vehicle state and must never write, block, retry, or compensate.
- Added `docs/WORLD_INTENT_WI3A_CLAUDE_PROMPT.md`: Claude task packet for read-only Vehicles tab preview UX design. Host read-only query endpoints and any Webview trust-boundary changes remain separate gate work.

---

## 2026-07-04 JST - Grok - World Intent WI4R self-review fixes

- WI4 accounting: reject `after > max`; skip bridge accounting when vehicle system disabled; added sequential batch + bounds tests.

---

## 2026-07-04 JST - Grok - World Intent WI4 Effect Accounting implementation

- Added `src/worldIntentEffectAccountingCore.ts`: pure `refuel_vehicle` accounting entries from legacy pre/post state (`before`/`delta`/`after`/`cause`).
- Extended `vehicleWorldIntentBridgeCore.ts` batch report with `accountingEntries`; `compare_only` output logs fuel deltas.
- No fuel consumption, persist, TurnResult/statePatch/replay/GM prompt changes.
- `scripts/test_world_intent_wi4_effect_accounting.js` (design §10). `npm test` **190/190**.

---

## 2026-07-04 JST - Grok - World Intent WI5R / WI5bR self-review fixes

- Mod loader: only enabled profile mods (not all scanned manifests); pass empty `mods: {}` when profile exists so missing-registry errors surface.
- Core: mobile base warns when settlement ledger not supplied; alias cycle dedupe.
- Runner: append to Output Channel (no `clear()`); i18n for command toasts.
- Tests: mobile base without settlement, disabled mod exclusion. `npm test` **192/192**.

---

## 2026-07-04 JST - Grok - World Intent WI5b host command

- Added `worldIntentSanityHostCore.ts` (pure snapshot/format), `worldIntentSanityLoader.ts` (fs-only ledger loader), and `worldIntentSanityRunner.ts` (VS Code command + Output Channel).
- Command: `textadventure.runWorkspaceSanityCheck` — loads parsed ledgers/mod profile, runs WI5 report, no writes.
- `scripts/test_world_intent_wi5b_sanity_host.js`. `npm test` **192/192**.

---

## 2026-07-04 JST - Grok - World Intent WI5 Semantic Sanity Checker implementation

- Added `src/worldIntentSanityCore.ts`: pure `buildWorldSanityReport` with domain helpers (`checkVehicleSanity`, `checkModSanity`, `checkGameRuleSanity`, `checkWorldIntentSanity`, `checkMobileBaseSanity`). Report-only; reuses `validateVehicleFleet`, `validateMobileBaseLink`, `resolveModProfile`, `parseVehicleWorldIntentBridgeMode`. Active vehicle lost = warning; disabled mod dependency = warning.
- `scripts/test_world_intent_wi5_sanity_core.js` (design §12 Required Tests 1–20). `npm test` **191/191**.

---

## 2026-07-04 JST - Codex - World Intent WI6 Per-Ledger Migration Helper design

- Added `docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md`: pure dry-run per-ledger migration helper design.
- The first pilot is intentionally tiny (`vehicle_state` v0 -> v1 by adding `version: 1`). Global workspace migration, write-back, semantic auto-fix, GM-turn integration, and State Orchestrator wiring are deferred.

---

## 2026-07-04 JST - Codex - World Intent WI6b Migration Preview Command design

- Added `docs/WORLD_INTENT_WI6B_MIGRATION_PREVIEW_COMMAND_DESIGN.md`: opt-in read-only host command design for `LoreRelay: Preview Workspace Migrations`.
- The command may read fixed known workspace ledgers, run WI6 dry-run migration helpers, and print bounded Output Channel diagnostics. Write-back, backups, apply buttons, GM-turn hooks, Webview/Remote/Replay wiring, and raw JSON diagnostics are forbidden.

---

## 2026-07-04 JST - Codex - World Intent WI5 Semantic Sanity Checker design

- Added `docs/WORLD_INTENT_WI5_SANITY_CHECKER_DESIGN.md`: pure report-only sanity checker design for vehicle, mobile-base, mod/profile, and game-rule consistency.
- The gate forbids auto-fix, persistence, turn blocking, raw JSON diagnostics, and State Orchestrator wiring. Existing local validators remain authoritative; WI5 only normalizes findings into a bounded report.

---

## 2026-07-04 JST - Codex - World Intent WI4 Effect Accounting design

- Added `docs/WORLD_INTENT_WI4_EFFECT_ACCOUNTING_DESIGN.md`: narrow vehicle `refuel_vehicle` accounting pilot. It derives bounded before/delta/after fuel explanation entries from canonical legacy pre/post vehicle state only.
- Explicitly deferred fuel consumption, movement costs, generic Effect Kernel, persistence, replay export, GM prompt injection, and State Orchestrator wiring.

---

## 2026-07-04 JST - Grok - World Intent Core WI3b host bridge

- Added `vehicleWorldIntentBridgeCore.ts` (pure batch parity) and `vehicleWorldIntentBridge.ts` (VS Code config + Output Channel).
- Integrated into `vehicleTurnOpsCore.ts` at pre-write boundary; `statePatch.ts` unchanged.
- Setting: `textAdventure.worldIntent.vehicleBridgeMode` (`off` default). Legacy vehicleOps authoritative; one `vehicle_state.json` write.
- Fixed parity `updated_turn` false positive on blocked/no-op when `worldTurn` provided.
- `scripts/test_world_intent_wi3b.js` (Gate §10). `npm test` **189/189**.

---

## 2026-07-04 JST - Grok - World Intent Core WI2 implementation

- Refactored `src/worldIntentCore.ts`: immutable closed `GameAction` registry (5 V3 vehicle keys); `queryWorldIntent` / `executeWorldIntent` share one `GameActionResolution`; allowed execute consumes `candidateNextVehicleState` (no double apply).
- Added `src/worldIntentVehicleParityCore.ts`: pure legacy↔WorldIntent parity reports (`match` / `mismatch` / `not_comparable`); `vehicleOpsCore` remains authoritative oracle.
- Bridge contract only: `off` / `shadow` / `compare_only` (`parseVehicleWorldIntentBridgeMode`); no `apply`, no `processTurnResult` / persist / Webview wiring.
- Added `scripts/test_world_intent_wi2.js` (Gate Required Tests 30/30). `npm test` **188/188**, `validate_utf8_docs.js` OK.
- Parity mismatches: **none** (full V3 sweep + taxonomy cases match).

---

## 2026-07-04 JST - ChatGPT - World Intent WI2 Gate

- Added `docs/WORLD_INTENT_WI2_CHATGPT_GATE.md` (**Approved with constraints**). Baseline WI1R @ `7b71e31`. Defines legacy↔WorldIntent taxonomy mapping, closed registry, shadow parity module, bridge modes (`off`/`shadow`/`compare_only` only), Required Tests 30.

---

## 2026-07-04 JST - Grok - World Intent Core WI1R (Codex review fixes)

- P1 fixes in `src/worldIntentCore.ts` only: amount caps via `MAX_VEHICLE_OP_AMOUNT` / `MAX_VEHICLE_REFUEL_AMOUNT`; `invalid_entity_kind` when `target.kind` is not `vehicle`; `execute_precondition_failed` → `attempted: true`.
- Extended `scripts/test_world_intent_core.js`: invalid entity kind, payload-only `vehicleId`, refuel amount 1500 parity.
- `npm test` **187/187**. Unresolved P2 (query/execute drift, double apply, array depth cap, etc.) deferred to WI2+.

---

## 2026-07-04 JST - Grok - World Intent Core WI1 implementation

- Added `src/worldIntentCore.ts`: pure `WorldIntent` parse/sanitize/query/execute + vehicleOps adapter (5 V3 actions).
- `executeWorldIntent` returns in-memory `nextVehicleState` only; no ledger plan, no disk write, no `TurnResult`/`statePatch` wiring.
- Added `scripts/test_world_intent_core.js` covering ChatGPT gate Required Tests 14/14.
- `npm test` **187/187**, `validate_utf8_docs.js` OK.

---

## 2026-07-04 JST - Codex - World Intent Core design

- Added `docs/WORLD_INTENT_CORE_DESIGN.md` as a design-only common mutation-request layer for future LoreRelay systems.
- Design extracts patterns from Screeps (intent pipeline), OpenRCT2 (query/execute split), FreeOrion (effect cause/priority/accounting), and Freeciv (requirements/sanity) while explicitly forbidding GPL code/schema copying.
- Scope is pure-core and adapter-first: existing `statePatch`, `vehicleOps`, `mobileBaseOps`, `settlementOps`, `campaignResourceOps`, and `discoveryOps` remain intact. No runtime code or persistence behavior changed.

## 2026-07-04 JST - Codex - World Intent Core ChatGPT gate

- Added `docs/WORLD_INTENT_CORE_CHATGPT_GATE.md`.
- Gate result: **Approved with constraints** for WI1. Allowed scope is `src/worldIntentCore.ts` + `scripts/test_world_intent_core.js`, pure-only, no VS Code/fs/persistence imports, no `TurnResult.ts` or `statePatch.ts` changes.
- WI1 supported surface is only `subsystem: "vehicle"` with current V3 vehicle actions (`set_active_vehicle`, `move_vehicle`, `damage_vehicle`, `repair_vehicle`, `refuel_vehicle`). `RequirementExpr`, `EffectAccountingEntry`, ledger plans, Webview execution, Mobile Base, Settlement, Campaign, Discovery, and State Orchestrator integration are deferred.

## 2026-07-04 JST - Codex - World Intent DeepResearch addendum

- Extended `docs/WORLD_INTENT_CORE_DESIGN.md` with the DeepResearch synthesis: thin Action Execution Kernel over existing subsystem cores, Intent vs GameAction split, two future kernels (Action Execution Kernel + Rule Kernel), post-commit-only Event Bus, staged EffectAccounting, visibility-aware ChangeSet as defense-in-depth alongside existing FoW-safe projections, per-ledger migration chain, scheduler descriptors, and deferred materialization.
- Updated `docs/WORLD_INTENT_CORE_CHATGPT_GATE.md` to clarify that these research-backed ideas **do not expand WI1**. WI1 remains pure `WorldIntent` skeleton + `vehicleOps` adapter only.

---

## 2026-07-04 JST - Grok - Graphics Upgrade Track 1-3 ship (v1.76.0)

- Claude Track3 実装のコミット代行（コンテキスト上限直前）。Track1（`84a-webview-anim.js` + タイル Atmosphere）、Track2（ジオラマ照明）、Track3（`9b-genre-chrome.css` + `#genre-fx-overlay`）を **v1.76.0** としてまとめて出荷。
- Track3 は `data-genre` 自動付与ではなく既存 `body[data-ui-theme]` 再利用（設計逸脱を CHANGELOG に明記）。
- 新規テスト `test_webview_genre_chrome.js`。`npm test` **186/186**（version consistency 同期込み）。
- RULES_PROFILE / Genesis Guide 変更は本コミット対象外（別作業ツリーに残置）。

---

## 2026-07-04 JST - Claude - Graphics Upgrade Track 3: Genre chrome (Unreleased)

- `webview/styles/9b-genre-chrome.css` を bundle 末尾に追加。`#genre-fx-overlay`（`index.html`）でテーマ別エッジ処理（cyberpunk/scifi=CRT、horror=ビネット+SVG grain、postapoc/steampunk=dust、eastern=暖色ビネット）。
- 既存手動 `body[data-ui-theme]` を再利用 — ワールド genre（overmap/diorama）とプレイヤー選択 UI テーマの三重重複を避ける（`GRAPHICS_UPGRADE_DESIGN.md` §4 からの意図的逸脱）。
- `97-visual-refresh.css` で定義済みだった `--cyber-glow` / `--glass-glow` を GM/overmap/vehicle/mobile-base カードへ配線。GM `.msg-sender::before` にテーマ別グリフ。
- 静的 CSS のみ（`@keyframes` なし）。`scripts/test_webview_genre_chrome.js` で manifest 順序・`data-ui-theme` 契約・no-animation を検証。

---

## 2026-07-04 JST - Claude - Graphics Upgrade Track 2: Diorama lighting/depth (Unreleased)

- 前回の Track1（アニメ土台）に続き、Track2（ジオラマ照明/奥行き）を実装。ペイロード変更ゼロ ——
  `SettlementDioramaSnapshot.palette.theme`/`.accent` は既にサーバー側で解決済みだったが
  クライアントで未使用だったので、そこに乗せた（`accent` は今回まで完全に unused だった）。
- `86c-settlement-diorama.js`: シャドウマッピング（`PCFSoftShadowMap`、bounds連動のシャドウカメラ
  フラスタム）、`THREE.Fog`（`palette.background`と同色でブレンド、箱庭の浮遊感を解消）、
  マテリアルを `MeshLambertMaterial` 一律から `MeshStandardMaterial` + 素材別 metalness/roughness
  （metal/water で質感差、light/hazard に微発光）へ。ジャンル連動ライティング
  （`DIORAMA_THEME_LIGHTING`、snapshotの`palette.theme`——default/fantasy/postapoc/industrial/
  eastern/horror/scifi——をキーに方向光の色相/強度/角度を変える）は `palette.accent` で色付け。
- 初回シーン構築時・コンテンツ再構築時（レイヤー/施設切替でboundsが変わりうる）の両方で
  ライティング/フォグを再設定する `configureDioramaLighting()` に集約。
- 常時アニメーションは入れていない（設計判断どおり、diorama はカメラ操作時のみ再レンダのまま）。
- 検証: `npm run compile`、`npm test` **184/185**（唯一の失敗 `check_version_consistency.js` は
  ChatGPTレビュー側の別コミット `16df79d`（v1.75.2 への package.json 更新）が README/
  package-lock/VERSION_TRUTH の同期をまだ済ませていない**既存のズレ**で、本タスクとは無関係。
  package.json 等は一切変更していない）。`check_i18n_keys.js` / `validate_utf8_docs.js` も
  新規文字列なしのため影響なし。
- Idea note (`docs/GRAPHICS_UPGRADE_IDEAS.md`) を更新済み。

---

## 2026-07-04 JST - Grok - ChatGPT review fixes (v1.75.2)

- **P1** Vehicle `statusAfterDamage` / `statusAfterRepair` split — parked+heavy damage → `damaged`; full repair → `available`.
- **P1** Mobile Base `undock_mobile_base` clears `parkedAt`.
- **P1** FoW invariant: all `rumored` markers get `rumor_*` public ids (vehicle/parking/pressure + sanitize choke point).
- **P2** Module tags free-form; MOD1 `mergeStrategy` replace-only contract.
- **P3** `normalizeCountCap()` for garage/prompt vehicle caps.
- `npm test` **185/185**.

---

## 2026-07-04 JST - Claude - Graphics Upgrade: animation foundation + Track 1 Atmosphere Pass (Unreleased)

- ブレスト（設計は前段の `docs/GRAPHICS_UPGRADE_DESIGN.md`）の Track 1-3 実装に着手。今回は**土台＋Track1のみ**（Track2 ジオラマ照明・Track3 ジャンルクロームは未着手）。
- 新規 `webview/modules/84a-webview-anim.js` — 全アニメの単一 rAF 駆動系 `window.LR_anim`。`prefers-reduced-motion` / タブ非表示で自動停止、`localStorage`（`lr.effectsTier`: off/light/full, 既定 light）でユーザー切替可能。canonical state 非依存。
- `86-tile-overmap.js` に Track1 を配線 — 水面グリフの巡回、hazard tint の脈動、現在地 `@` の明滅、rumored マーカーの点滅。すべて `f(seed, phase)` の決定論オーバーレイで、モーション無効時は**変更前と完全に同じ静的描画式にフォールバック**（既存の見た目を一切壊さない設計）。`full` ティアのみ hazard タイルに疎な残り火パーティクルを追加。
- World マップツールバーに `#world-effects-tier-btn`（off→light→full 循環）を追加、`85-world.js` がタイルモード切替に合わせて register/unregister。i18n 4ロケール追加。
- レビュー時に見つけた副産物: `applyI18n()` の `data-i18n-aria-label` 更新呼び出しが `localeBundle` ハンドラから漏れていたので `updateEffectsTierButton()` 呼び出しを追加（本来は前回のVehicles UX polishターンの続き）。
- 検証: `npm run compile`、`npm test` **185/185**（新規アサーション込み）、`check_i18n_keys.js` 0 missing、`validate_utf8_docs.js` OK。
- 残り: Track2（ジオラマ ライティング/フォグ/マテリアル質感）・Track3（`body[data-genre]` 適用 + ジャンル別クローム/ポストエフェクト）は次回以降。

---

## 2026-07-04 JST - Grok - Mod System design docs commit

- Added `docs/MOD_SYSTEM_DESIGN.md`, `docs/MOD_SYSTEM_CHATGPT_GATE.md`, `docs/MOD_SYSTEM_AI_PROMPTS.md` to git (MOD1–MOD5 contract, ChatGPT gate for data-only resolver, handoff prompts).
- MOD1 pure resolver (`modSystemCore.ts`) already shipped; docs formalize later MOD2+ phases. No runtime code changed.
- `validate_utf8_docs.js` OK.

---

## 2026-07-04 JST - Codex - AI Command Tower design

- Added `docs/AI_COMMAND_TOWER_DESIGN.md` as the coordination-layer design for routing LoreRelay work across Codex/ChatGPT, Claude, Grok, Gemini, and optional local coder models.
- Defined task classes, recommended reasoning levels, dispatch packet format, gate triggers, review pairs, conflict rules, and the separation between AI Command Tower and a future runtime State Orchestrator.
- Updated `CHANGELOG.md` [Unreleased]. No runtime code or persistence behavior changed.

---

## 2026-07-04 JST - Codex - Rules Profile Onboarding design

- Added `docs/RULES_PROFILE_ONBOARDING_DESIGN.md` for a goddess-style first-run setup flow that asks genre/playstyle/pressure/bookkeeping/signature-system questions and resolves them into safe `game_rules.json` presets.
- Design keeps LLM goddess narration non-authoritative: deterministic profile resolver owns feature flags, while the LLM may ask questions and summarize.
- Proposed RP1-RP5 phases: pure resolver, host apply gate, Start Hub wizard UI, Quickstart integration, and custom profile editor. No runtime code changed.

---

## 2026-07-04 JST - Claude - Vehicles tab UX polish review (post-457639b, Unreleased)

- Reviewed Grok's V-UX0 P1 implementation (`89-vehicles.js`, `89a-vehicle-labels.js`, `86-tile-overmap.js`, i18n) — enum/i18n labels, access-reason i18n, map↔Vehicles cross-nav, Mobile Base placeholder/auto-expand all sound. No regressions found in existing P1 scope.
- Found and fixed a real gap: `data-i18n-aria-label` (added to `vehicles-list`/`vehicles-detail`/`vehicles-mobile-base-panel` in v1.75.0) was never wired in `applyI18n()` — aria-labels stayed English in every locale. Added the handler + extended `world-overmap-legend` to the same pattern (new key `overlayLegendAriaLabel`, 4 locales) — closes F16/F17. `check_i18n_keys.js` regex now also scans this attribute so it can't silently regress again.
- Implemented F13 (marker declutter/legibility): `86-tile-overmap.js` groups overlay markers sharing a tile into one glyph + `+N` badge instead of overdrawing stacked circles; raised marker radius/font floors for narrow sidebar widths. Tooltip/flash show all clustered labels. `hitTestMapOverlayMarker()` return contract unchanged (new `hitTestMapOverlayMarkerHit()` added for cluster access) — map→Vehicles click nav untouched.
- Read-only Webview/i18n/CSS polish only; no canonical state, ops, or persistence touched. F4 (Diagram/Parchment marker rendering) intentionally left untouched per scope.
- Verified: `npm run compile`, `npm test` **183/183**, `check_i18n_keys.js` (0 missing, 4 locales), `validate_utf8_docs.js`. No browser preview run — this is a VSCode Webview (requires Extension Development Host, not a standalone dev server); verification was via the above scripted checks + source reading.

---

## 2026-07-04 JST - Grok - Gemini review PR1 + Claude Vehicles P2 (v1.75.1)

- `spawnWithTimeout.ts` — `killProcessTree()` (`taskkill /T` on Windows, `pkill -P` on POSIX).
- Tests: `test_spawn_with_timeout.js` grandchild fixture, `test_mobile_base_interior_disclosure.js`, `test_mobile_base_move_vehicle_only.js`.
- Claude carry: F13 overlay declutter, F16 `data-i18n-aria-label` in `00-core.js`.

---

## 2026-07-04 JST - Grok - Claude Vehicle/Mobile Base UI/UX audit (v1.75.0)

- P1: enum i18n labels, `accessReasonCode` in view cores, map↔Vehicles cross-nav, Tile mode hint, Mobile Base link placeholder.
- `89a-vehicle-labels.js`, updates to `89-vehicles.js`, `89b-mobile-base-panel.js`, `86-tile-overmap.js`. `npm test` **183/183**.

---

## 2026-07-04 JST - Grok - ChatGPT review fixes (v1.74.0)

- `mapOverlayCore.ts` — `overlayMarkerPublicId()` redacts rumored marker ids; `deriveKnownNpcIds()` interaction-only acquaintance.
- `replayExportCore.ts` — `advanceReplayGmSourceTimeline()` before exclusion skip; gallery matches `gmTurn` not `worldTurn`.
- `replayExport.ts` — `openReplayExport()` uses `isPathUnderWorkspaceExports()`.
- `visualMemoryCore.ts` — optional `gmTurn` / `sourceEntryId` on entries.
- Tests: `test_map_overlay_core.js` (id redaction + late-arrival NPC), `test_replay_export_gm_timeline.js`. `npm test` **183/183**.

---

## 2026-07-04 JST - Grok - Tech debt: GM prompt bloat + region hazard line

- `gmPromptBuilderCore.ts` — `vehicles` 89→64, `mobileBase` 88→63 (evict before `worldForge`).
- `vehicleState.ts` — compact mode skips V5 integration append; `gmPromptBuilder` passes `policy`.
- `regionHazardPromptCore.ts` — one-line hazard GM flavor in `buildWorldForgePromptContext()`.
- Tests: `test_prompt_budget_eviction.js`, `test_region_hazard_prompt_core.js`. `npm test` **176/176**.

---

## 2026-07-04 JST - Grok - Vehicle System V5 trade/map integration

- `vehicleIntegrationCore.ts` — GM helpers: cannot-enter access, trade narration, repair/refuel service hooks.
- `world_forge` optional `vehicleAccess` on locations; map overlay `vehicle` / `vehicle_parking` markers.
- `vehicleState` prompt append + garage uses forge access profiles.
- Tests: `test_vehicle_integration_core.js`, `test_webview_vehicle_integration.js`. `npm test` **175/175**.

---

## 2026-07-04 JST - Grok - Mobile Base MB5 interior view reuse

- `mobileBaseInteriorCore.ts` — `buildMobileBaseInteriorPayload()` reuses `settlementView` + `settlementDiorama` for validated mobile-base link.
- `mobileBaseBridge.buildMobileBaseInteriorWebviewPayload()` + `worldView.mobileBaseInterior`.
- Webview: `86b`/`86c` prefer `mobileBaseInterior`; `89b` interior view buttons; settlement banner.
- Tests: `test_mobile_base_interior_core.js`, `test_webview_mobile_base_interior.js`. `npm test` **173/173**.

---

## 2026-07-04 JST - Grok - Mobile Base MB4 read-only Webview panel

- `mobileBaseViewCore.ts` — `buildMobileBasePanelSnapshot()` for linked vehicle+settlement.
- `mobileBaseBridge.buildMobileBasePanelWebviewPayload()` + `worldView` (`enableMobileBaseSystem`, `mobileBasePanel`).
- `89b-mobile-base-panel.js` — collapsible section in Vehicles tab (read-only).
- Tests: `test_mobile_base_view_core.js`, `test_webview_mobile_base_panel.js`. `npm test` **171/171**.

---

## 2026-07-04 JST - Grok - Vehicle System V4 read-only Webview garage

- `vehicleViewCore.ts` — `buildVehicleGarageSnapshot()` capped fleet/detail for Webview.
- `vehicleBridge.ts` + `worldView.ts` — `vehicleGarage` postMessage when `enableVehicleSystem` ON.
- `89-vehicles.js` / `89-vehicles.css` — Vehicles tab (read-only, no disk writes).
- Tests: `test_vehicle_view_core.js`, `test_webview_vehicle_garage.js`. `npm test` **169/169**.

---

## 2026-07-04 JST - Grok - Mobile Base MB3 mobileBaseOps apply gate

- `mobileBaseOpsCore.ts` — dock/undock/move/consume fuel; vehicle_state.json only.
- `mobileBaseTurnOps.ts` — triple gate persist; combined with `vehicleOps` in `statePatch`.
- Tests: `test_mobile_base_ops.js`. `npm test` **167/167**.

---

## 2026-07-04 JST - Grok - Vehicle System V3 vehicleOps apply gate

- `vehicleOpsCore.ts` — `parseVehicleOps()` / `applyVehicleOps()` for active, move, damage, repair, refuel.
- `vehicleTurnOps.ts` — persists to `vehicle_state.json` when `enableVehicleSystem` ON; wired in `statePatch` + `turnLedgerPersistCore` (`vehicle_state` last in persist order).
- Prompt line updated to document wired `turn_result.vehicleOps` slice.
- Tests: `test_vehicle_ops.js`. `npm test` **166/166**.

---

## 2026-07-04 JST - Grok - Mobile Base MB2 prompt wiring

- `src/mobileBaseBridge.ts` — `buildMobileBasePromptContext()`; triple gate (`enableVehicleSystem` + `enableSettlementMode` + `enableMobileBaseSystem`).
- `enableMobileBaseSystem: false` default in `gameRules.ts`; `[Mobile Base]` chunk in `gmPromptBuilder` (priority 88).
- `resolveActiveMobileBaseVehicle()` prefers `activeVehicleId` when it has `mobileBase`, else first linked vehicle.
- Tests: `test_mobile_base_bridge.js`, `test_prompt_chunk_activation.js` extended. `npm test` **165/165**.

---

## 2026-07-04 JST - Grok - Vehicle System V2 I/O + GM prompt

- `src/vehicleState.ts` — `loadVehicleState()` / `readVehicleStateFromDisk()` for `vehicle_state.json`; `buildVehiclePromptContext()` with current-location bias.
- `enableVehicleSystem: false` default in `gameRules.ts`; `[Vehicles]` chunk in `gmPromptBuilder` (priority 89).
- Tests: `test_vehicle_state.js`, `test_prompt_chunk_activation.js` extended. `npm test` **164/164**.

---

## 2026-07-04 JST - Grok - Vehicle V1 + Mobile Base MB1 pure cores

- `src/vehicleCore.ts` — `parseVehicleState`, `canVehicleAccessLocation`, `validateVehicleFleet`, `buildVehiclePromptLines`. Fleet/carrier/hangar, size/access restrictions, capped prompt summaries. No I/O/Webview/vehicleOps.
- `src/mobileBaseCore.ts` — `parseMobileBaseLink`, `validateMobileBaseLink`, `buildMobileBasePromptLines`. Links `vehicle.mobileBase.settlementId` to Settlement ledger; caravan/mobile_community as social moving base. No cross-ledger writes.
- Tests: `test_vehicle_core.js`, `test_mobile_base_core.js`. `npm test` **163/163**.

---

## 2026-07-04 JST - Grok - Settlement Mode M5 finish (v1.73.0)

- **Three.js lazy load** — `build-webview.js` no longer prepends `three.min.js` into `script.js`. `extension.ts` exposes `threeUri`; `86c-settlement-diorama.js` loads vendor on first Diorama use via `loadThreeJsLazy()`. Default-OFF users skip Three.js parse cost.
- **Version** — `1.73.0`; M5 roadmap items marked complete.
- 検証: `npm test` **161/161** / `test_webview_world_modules.js` lazy-load assertions.

---

## 2026-07-04 JST - Grok - 3-AI code review fixes (M5 diorama + overlay + subprocess)

- **ChatGPT P1**: M5a `revision` on `SettlementDioramaSnapshot`; M5b rebuilds scene when `revision` changes (not only settlementId/layerId). Selected-layer local Z — `z-1`/`z-2` no longer render below ground plane.
- **ChatGPT P2/P3**: M5b reuses renderer — `disposeSceneObjects()` on content change; `forceContextLoss` only on full teardown. M5a `normalizeDioramaCap()` clamps negative/NaN caps.
- **ChatGPT P2**: `buildMapOverlayFromContext()` — World View passes already-loaded forge/worldState/fog/registry (no second disk read / turn drift).
- **Gemini P1**: `spawnWithTimeout.ts` — image gen (10m), cartography (5m), list-models (60s) subprocess kill on hang. `shell: false` preserved.
- 検証: `npm test` **161/161**.
- **Deferred** (design-scale): Gemini P0 WAL/reconciliation; Grok P1 prompt bloat.

---

## 2026-07-04 JST - Grok - Settlement Mode M5b host diorama wiring

- `src/settlementDioramaBridge.ts` — `buildWorkspaceSettlementDiorama()` from sanitized `settlementView` when `enableSettlementMode` **and** `enableSettlementDiorama` are ON. `resolveDioramaThemeFromOvermap()` maps overmap theme → diorama palette.
- `src/gameRules.ts` — `enableSettlementDiorama: false` default + save sanitization.
- `src/worldView.ts` — postMessage adds `enableSettlementDiorama` / `settlementDiorama` (no GM prompt, no persistence, no remote/replay).
- `scripts/test_settlement_diorama_bridge.js` — dual-gate, default OFF, theme mapping, no-mutation.
- 検証: `npm run compile` / `npm test` **158/158** / `validate_utf8_docs.js` OK.
- 有効化: `game_rules.json` に `"enableSettlementMode": true` と `"enableSettlementDiorama": true` を設定し `settlement_state.json` が存在すること。

---

## 2026-07-04 JST - Claude (Sonnet 5) - Settlement Mode M5b Three.js diorama Webview renderer

- 必読: `docs/SETTLEMENT_MODE_M5_DESIGN.md`、`docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`、`src/settlementDioramaCore.ts`(M5a, Grok実装済み、無変更)。
- **注記**: M5 gateドキュメントには「M5bの実装はこのgateでは未承認、Claude着手前に別途Codex/ChatGPTレビューが必要」と明記されている。今回はユーザーからGrok作成のM5b実装プロンプトを直接依頼される形でこのタスクに着手した(=実質的なユーザー承認)。設計文書中の安全制約(read-only/no settlementOps/no insertChatText/M3 Canvas無変更/フラグ既定OFF等)は全て遵守した上で実装。ChatGPT/Codexによる正式なM5bゲートレビューはまだ行われていない — 次のAIが引き継ぐ際は`docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`の「M5b Future Gate Requirements」チェックリストに沿ったレビューを推奨。
- `webview/modules/86c-settlement-diorama.js`(新規) + `webview/styles/99-settlement-diorama.css`(新規): World タブに6番目のマップモード「Diorama」を追加(既存のSettlement Canvas M3bは無変更)。`msg.settlementDiorama`(M5a snapshot)と`msg.enableSettlementDiorama`のみを消費し、生の`settlement_state.json`/`settlement_layout.json`/`settlementView`には一切触れない。
- シーン構築: `blocks[]`→`BoxGeometry`、`markers[]`→kind別のcone/cylinder/box、色は閉じたclient-side material→colorマップ×`snapshot.palette`。カメラは自前実装のlimited orbit(ドラッグでyaw/pitch回転、pitch clamp付き、ホイールでズーム、distance clamp付き、Reset/Fitボタン)— OrbitControls不使用、fly/first-person無し。ホバー/クリックはraycasterでヒットテストし、サニタイズ済み`label`のみを検出パネルに表示(HTMLエスケープ済み)。
- **Three.js vendor**: 最新npm版(0.185.1)はESモジュール専用ビルドのみで、UMD/グローバル`THREE`ビルド(`build/three.min.js`)が存在しないことが判明(r150前後で廃止)。UMDビルドが残っている最後のバージョン`three@0.149.0`(MIT)から`build/three.min.js`を取得し`webview/vendor/three.min.js`として静的にコミット(package.jsonへの依存追加なし、`--no-save`でインストール後`node_modules/three`は削除済み)。`build-webview.js`を修正し、`script.js`バンドルの先頭(モジュール一覧より前)にthree.min.jsの中身を直接連結する方式を採用 — mermaidと違いCDNなし・`extension.ts`変更なし・別`<script>`タグ不要で`THREE`グローバルが86c実行前に存在する。
- グレースフルデグレード: `THREE`/WebGL利用不可時は`#world-diorama-unavailable`+マーカーのテキスト一覧(`#world-diorama-marker-fallback`)にフォールバック。フラグOFFまたはsnapshot未着時は`#world-diorama-empty`。
- `webview/modules/85-world.js`: `syncDioramaMapModeUi(msg)`追加(既存の`settlement`モード切替パターンを踏襲、`enableSettlementDiorama === true` **かつ** snapshotにblocks/markersが実際にある場合のみボタン表示)。`setWorldMapMode`/`applyWorldMapModeVisibility`を拡張。
- i18n: `mapModeDiorama`/`dioramaEmpty`/`dioramaUnavailable`/`dioramaReset`/`dioramaFit`/`dioramaZoomIn`/`dioramaZoomOut`/`dioramaMarkerList`をen/ja/zh-CN/zh-TW全4言語に追加。
- テスト: `scripts/test_webview_world_modules.js`にバンドル順序・シンボル・read-only制約(`insertChatText`/`writeJsonAtomic`/`fs`/`settlementOps`が一切含まれないこと)のアサーションを追加。
- 検証: `npm run compile` / `npm test` **157/157** / `test_webview_world_modules.js` / `check_i18n_keys.js`(0 missing全言語) / `validate_utf8_docs.js` OK。手動確認はスクラッチパッドの静的ハーネス(`_dioramaWorldMsg`を直接モック注入)で実施 — WebGLピクセルサンプリング+スクリーンショットで実際に低ポリシーンが描画されることを確認、ズームイン/アウト/リセット、クリックでの検出パネル選択、データなし/THREE利用不可の両フォールバック状態も確認。
- **Grok引き継ぎ事項(host配線、未着手)**: (1) `game_rules.json`に`enableSettlementDiorama: false`追加、(2) `src/worldView.ts`で`settlementView`(選択中レイヤー)→`buildSettlementDioramaSnapshot()`を配線し`worldView`postMessageに`enableSettlementDiorama`/`settlementDiorama`を追加、(3) `extension.ts`の変更は不要だった(vendor埋め込み方式採用のため`threeUri`シム不要)、(4) `AI_ROADMAP.md`のM5bチェックボックスを`[x]`に、(5) remote/replayへの`settlementDiorama`配信は今回スコープ外(design docの非ゴール通り、GM prompt/turn_result変更も一切なし)。

---

## 2026-07-04 JST - Grok - Settlement Mode M5a diorama snapshot pure core

- `src/settlementDioramaCore.ts` — pure `buildSettlementDioramaSnapshot()` from sanitized M3 `SettlementViewSnapshot`. Capped `blocks`/`markers`/optional `labels`, `fixed_orbit` camera, theme `palette`, closed tile-code → material mapping, allow-list pickers. No Three.js/Webview/persistence.
- `scripts/test_settlement_diorama_core.js` — determinism, no-mutation, allow-lists, material mapping, caps/warnings, no secret/stock-quantity leak.
- 検証: `npm run compile` / `test_settlement_view_core.js` / `test_settlement_diorama_core.js` / `npm test` **157/157** / `validate_utf8_docs.js` OK.
- 次: ChatGPT/Codex M5a implementation gate → Claude M5b Three.js renderer.

---

## 2026-07-04 JST - Codex - Settlement Mode M5 Low-poly Diorama design/gate

- Added `docs/SETTLEMENT_MODE_M5_DESIGN.md`: dream-track, default-OFF Low-poly Diorama plan split into M5a pure `SettlementDioramaSnapshot` from sanitized M3 `settlementView`, and M5b Three.js read-only renderer.
- Added `docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`: approves M5a pure core only; M5b renderer requires a later post-M5a gate. The gate blocks Webview writes, settlementOps, external assets, textures/models/shaders, and canonical 3D state.
- Updated `docs/SETTLEMENT_MODE_DESIGN.md` and `docs/SETTLEMENT_MODE_AI_PROMPTS.md` with M5 links and the M5a implementation handoff prompt.
- Design only; no runtime code.

---

## 2026-07-04 JST - Claude (Sonnet 5) - Settlement Mode M3b/M4c isometric Webview UX polish

- 必読: `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`(承認済み境界を破らないこと)、`webview/modules/86b-settlement-isometric.js`、`85-world.js`、`98-settlement-isometric.css`。純コア(`settlementViewCore.ts`)は無変更 — Webview/CSS/i18nのみの見た目調整タスク。
- レイヤーセレクタ: `view.layers`に存在しない(=真に未構築の)レイヤーボタンにドット表示+タイトルツールチップ(`settlementLayerUnbuilt`)を追加。存在するが空(tiles/markers共に0)のレイヤーには新規`#world-settlement-layer-note`で「このレイヤーにはまだタイルやマーカーがありません」を表示(拡張パネルが出ている場合は重複回避で非表示)。
- 拡張パネル: レイヤー見出し「Preview options for {layer}」を追加(`settlementExpandForLayer`)、複数プロファイル候補がある場合に現在プレビュー中のボタンへ`is-active`ハイライトを付与。
- ゴーストプレビュー: 破線アウトラインが`rgba(0,0,0,0.35)`という黒に近い色で、暗いタイル上でほぼ見えなかった可読性バグを修正。`drawIsoDiamond`に`strokeOverride`引数を追加し、ゴースト専用に明るい白破線(`rgba(255,255,255,0.9)`)を使用。
- **バグ修正(既存, ズーム軸)**: `drawSettlementIsometric()`のcanvas拡大縮小が常にcanvas中央を軸にscaleしていたが、アイソメトリック原点(`computeSettlementOrigin`)はcanvas中央からずれた位置にコンテンツを配置する設計だったため、zoom=1以外(既存の「Fit」ボタン含む)で描画がコーナー外へドリフトする既存バグを発見・修正。軸をコンテンツの実際の幾何中心に変更(zoom=1の初期表示は無変更、ズーム時のみ修正)。レイヤー切替時の自動フィット(下記)を実装する過程で顕在化。
- レイヤー切替時、設定(`localStorage`)を上書きしない一時的な自動フィットを追加(`applySettlementFitTransform`を共有化)。サイズの異なるレイヤーへ切り替えた際に古いpan/zoomのまま表示がほぼ画面外になる体験を解消(上記ズーム軸バグ修正とセットで機能)。
- 詳細パネル本文・マーカー一覧に`max-height`+スクロールを追加(長いサニタイズ済みテキストでカードが際限なく伸びるのを防止)。
- i18n: `settlementExpandForLayer`/`settlementLayerUnbuilt`/`settlementLayerEmpty`をen/ja/zh-CN/zh-TW全4言語に追加。
- 検証: `npm run compile` / `npm test` **156/156** / `test_webview_world_modules.js` / `test_settlement_view_core.js`(無変更、回帰なし確認)/ `check_i18n_keys.js`(0 missing全言語)/ `validate_utf8_docs.js` OK。手動確認はスクラッチパッドの静的ハーネス(`_settlementWorldMsg`を直接モック注入)で present/missing/empty の3レイヤー状態・ゴーストhover切替・Fit/ズーム軸修正を確認。
- Webviewはfs/settlementOps適用/`settlement_layout.json`書き込みに一切触れず(M4cゲート境界を維持)、クリックは既存の`insertChatText`のみ。

---

## 2026-07-04 JST - Claude (Sonnet 5) - M2a remote player mini-map

- 必読: `docs/SETTLEMENT_MODE_M2_DESIGN.md` §1.2/1.6、`docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`、`src/mapOverlayCore.ts`、`src/mapOverlayBridge.ts`(host側、Grok実装、無変更)。
- `remote-player/index.html` に `#map-panel`(折りたたみ式)を `#chat-log` の上に追加。`remote-player/player.css` にダークテーマのパネル/canvas/凡例/tooltipスタイルを追加。`remote-player/player.js` に `renderMapOverlay()`/`drawMapCanvas()`/`handleMapTap()`/`renderMapLegend()` を追加し、`applyState()` から `state.mapOverlay` を配線(既存の `state` WebSocketメッセージが `mapOverlay` を含むのは Grok の M2 配線で既に対応済み — 新規サーバー変更なし)。
- 64x64グリッドをcanvasに描画し、`markers[]` を色付きドットで投影(`kind`別パレット、`tone`があれば優先、`86-tile-overmap.js` のカラーパレットに準拠)。`fogVisibility:'rumored'` は半透明+リング表示。タップで `label`/`detail` をツールチップ表示(4秒後自動非表示、`escapeHtml` で常時エスケープ)。`mapOverlay` 欠如または `markers` 空ならパネル自体を非表示。
- 安全性: canvasクリックは `vscode.postMessage` や `insertChatText` を一切呼ばない(読み取り専用)。`mapOverlayBridge.ts`/`mapOverlayCore.ts` は無変更。remote-player は生の world/settlement JSONを取得しない — 既存の sanitized `state.mapOverlay` のみ消費。
- 検証: `npm run compile` / `node scripts/test_remote_play_server.js` / `npm test` **156/156** / `node scripts/validate_utf8_docs.js` OK。手動確認は静的プレビューハーネスで WebSocket をモックし、`state` push 経由で7種のマーカー種別・rumored劣化・空マーカー・`mapOverlay`欠如の4パターンをモバイル幅(375px)で確認。
- 次: 実機(VSCode Remote Play起動→携帯ブラウザ)でのエンドツーエンド確認は未実施(任意)。

---

## 2026-07-04 JST - Claude (Sonnet 5) - Settlement Mode M4c UX preview/request flow

- 必読: `docs/SETTLEMENT_MODE_AI_PROMPTS.md` §11、`docs/SETTLEMENT_MODE_M4_DESIGN.md` §7、`docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md`。M4b (`af24e9e`, `0b8bbb1`) はmain push済み・未変更。
- `src/settlementViewCore.ts` に `buildSettlementExpansionPreviews()` を追加。欠けているlayer(`z1`/`z0`/`z-1`/`z-2`)ごとに、M4aの `applyExpandLayerToLayout()` をメモリ上でのみ呼び出してghost preview(tiles/markers)を生成。既存layerにはpreviewを出さない。純関数・非破壊・決定論的（テストで確認）。
- `src/worldView.ts` — `settlementExpansionPreviews` を `worldView` postMessageに追加(`settlementView`と並列、`mapOverlay`/`tileOvermap`と同じ「host側で計算してWebviewは描画のみ」パターン)。
- `webview/modules/86b-settlement-isometric.js` — 現在表示中のlayerが欠けている場合のみ、`world-settlement-expand-panel` にプロファイル別ボタン(cellar/waterworks/shelter/ruins/roof/watchtower/generic)を表示。hoverでghost overlay(dashed+半透明)をisometric canvasに重ね描画。クリックは `vscode.postMessage({ type: 'insertChatText', ... })` のみ — `settlement_layout.json` への書き込みも `settlementOps` の直接適用も一切なし。永続化は既存M4b ledger(`turn_result.settlementOps.expand_layer`)のみ。
- i18n: en/ja/zh-CN/zh-TW 全4言語に追加。
- テスト: `scripts/test_settlement_view_core.js` に決定性・非破壊・key allow-list・missing-layer/profile網羅のテストを追加。`scripts/test_webview_world_modules.js` に新規シンボル検証 + 「settlement isometricモジュールがfsに触れないこと」のアサーションを追加。
- 検証: `npm run compile` / `test_settlement_layer_expansion_core.js` / `test_settlement_layout_turn_ops_core.js` / `test_settlement_layout_turn_ops.js` / `test_cross_ledger_partial_failure.js`(M4a/M4b既存テストは無変更で全通過) / `npm test` **149/149** / `validate_utf8_docs.js` OK。
- 次: `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md` のレビューチェックリスト1–15をCodex/ChatGPTに確認してもらう。

---

## 2026-07-04 JST - Grok - M2 replay/remote map overlay wiring

- `mapOverlayBridge.ts` — `buildWorkspaceMapOverlay()` loads workspace canonical state into `buildMapOverlaySnapshot()`.
- `worldView.ts` refactored to use bridge; `remotePlayServer.ts` adds `mapOverlay` to remote `state`; `replayExport.ts` appends FoW-safe overlay appendix.
- `mapOverlayCore.ts` — `sanitizeMapOverlaySnapshot()`, `pickMapOverlaySnapshotKeys()`.
- `scripts/test_map_overlay_replay_remote.js` — sanitize + replay appendix tests. `npm test` **156/156**.

---

## 2026-07-04 JST - Grok - Settlement state entity dedupe (ChatGPT follow-up)

- `parseSettlementState()` dedupes structures/incidents by `id`, residents/visitors/merchants by `npcId` (last-wins).
- `scripts/test_settlement_state_entity_dedupe.js` added.

---

## 2026-07-04 JST - Grok - Settlement layout layer normalization (PR3)

- ChatGPT review PR3: `deriveEffectiveSettlementLayers()` unions declared layers + zone/marker refs; parse-time ID dedupe (last-wins).
- `buildLayerSummaries()` / `buildSettlementExpansionPreviews()` use effective layers — no false missing-layer CTA for orphan zones.
- `scripts/test_settlement_layout_layer_normalization.js` added.

---

## 2026-07-04 JST - Grok - Settlement Z-level marker semantics (PR5)

- ChatGPT review PR5: `buildStateMarkers()` — people + `stock_low` on `z0` only; incidents on associated structure layer.
- `scripts/test_settlement_marker_layer_semantics.js` — no duplicate NPCs across layers.

---

## 2026-07-04 JST - Grok - Settlement expansion retry determinism (PR4)

- ChatGPT review PR4: `deriveExpansionSeed()` default hash drops `worldTurn` — stable `settlementId:layerId:profile` only.
- Explicit `op.seed` / `context.seed` overrides unchanged. Retry/reconcile at different turns yields identical layout.
- `scripts/test_settlement_expansion_retry_determinism.js` + updated `test_settlement_layer_expansion_core.js` seed test.

---

## 2026-07-04 JST - Grok - Cross-ledger valid no-op contract (PR2)

- ChatGPT review PR2: discovery/campaign ledger apply unified with settlement `{ ok, applied }` structured results.
- `tryApplyDiscoveryTurnOps`, `tryApplyCampaignResourceTurnOps`; `normalizeLedgerApplyResult` for all ledgers.
- `scripts/test_turn_ledger_valid_noop.js` + cross-ledger regression extension. `npm test` **151/151**.

---

## 2026-07-04 JST - Grok - Settlement zero-stock semantics (PR1)

- ChatGPT review PR1: `adjustStockList` no longer drops `amount: 0` stocks after consumption.
- `scripts/test_settlement_stock_zero_semantics.js` — OUT prompt, shortage weight, pressure band with zero entry vs missing entry.
- `npm test` **150/150**.

---

## 2026-07-04 JST - Codex - Settlement Mode M4c UX gate approved

- Static review of Claude M4c delivery (`40ba354`): Webview uses `insertChatText` only; no `settlement_layout.json` write; no direct `settlementOps` apply; ghost preview via `buildSettlementExpansionPreviews()` (in-memory M4a core).
- Gate doc updated: `docs/SETTLEMENT_MODE_M4C_CHATGPT_GATE.md` — **Approved**. Commit `ff86f60` pushed.
- Next: M2 replay/remote overlay wiring. Optional manual smoke: missing layer → preview → GM request text → GM turn → M4b persist.

---

## 2026-07-04 JST - Codex - Settlement Mode M4b ledger no-op review fix

- Reviewed M4b `expand_layer` persistence after Grok commit `af24e9e`.
- Found a ledger integration edge case: `applySettlementLayoutTurnOps()` correctly returned `false` for valid no-op expansions, but `persistTurnLedgersAfterCommit()` interpreted every settlement layout `false` as a failed target.
- Added structured settlement layout apply results (`ok` / `applied`) for the post-commit ledger path while preserving the old boolean API for direct callers.
- Added regression tests for settlement layout no-op vs structured failure. Verification: `npm run compile`; targeted M4b tests; `npm test` **149/149**.

---

## 2026-07-04 JST - Grok - Settlement Mode M4b layout persistence (v1.72.0)

- `settlementLayoutTurnOpsCore.ts` / `settlementLayoutTurnOps.ts` — `expand_layer` only post-commit apply to `settlement_layout.json` (FIFO queue, atomic write, feature gate).
- `settlementState.ts` — `readSettlementLayoutFromDisk`, `clearSettlementLayoutCache`.
- `turnLedgerPersistCore.ts` / `statePatch.ts` — `settlement_layout` ledger target + partial-failure logging.
- Tests: `test_settlement_layout_turn_ops_core.js`, `test_settlement_layout_turn_ops.js`, cross-ledger extension. `npm test` **149/149**.

---

## 2026-07-04 JST - Grok - Settlement Mode M4a layer expansion pure core (v1.71.0)

- `src/settlementLayerExpansionCore.ts` — `applyExpandLayerToLayout()` bounded in-memory layer expansion; 7 profile templates; no tile arrays; caps + determinism.
- `settlementCore.ts` — `ExpandLayerOp` + `parseSettlementOps` stub for `expand_layer`.
- Tests: `test_settlement_layer_expansion_core.js`. `npm test` **147/147**. No disk persistence.

---

## 2026-07-04 JST - Grok - Settlement Mode M3b isometric Webview renderer (v1.70.0)

- `webview/modules/86b-settlement-isometric.js` — Canvas isometric renderer for `settlementView` (ASCII glyphs, pan/zoom, layer selector, hover/select read-only detail, marker list fallback).
- `worldView.ts` — `settlementView` payload + `setPreferredSettlementLayer`; `settlementState.ts` — `settlement_layout.json` loader.
- `setSettlementViewLayer` webview handler. 4-locale i18n. Tests **146/146**.

---

## 2026-07-04 JST - Grok - Settlement Mode M3a settlement view snapshot (v1.69.0)

- `src/settlementViewCore.ts` — pure `buildSettlementViewSnapshot()`: layer-filtered tiles/markers, deterministic fallback layout, optional `settlement_layout.json` projection, allow-list sanitization, caps, qualitative stock/incident markers.
- `scripts/test_settlement_view_core.js` — 12 test cases (undefined state, fallback, layer filter, caps, allow-lists, determinism, no mutation).
- Tests: `npm test` **146/146**.

---

## 2026-07-04 JST - Grok - Settlement Mode M2a Webview map overlay (v1.68.0)

- `webview/modules/86-tile-overmap.js` — `worldView.mapOverlay` を tile overmap Canvas 上に描画。7種マーカー（色/記号分離）、rumored 半透明劣化、hover ツールチップ（label/detail read-only）、クリック state 書き込みなし。
- `webview/modules/85-world.js` — overlay tooltip CSS + `#world-overmap` position:relative。
- `scripts/test_webview_world_modules.js` — overlay シンボル smoke 追加。
- Tests: `npm test` **145/145**.

---

## 2026-07-04 JST - Claude (Opus 4.8) - Settlement Mode M2 design

- 新規 `docs/SETTLEMENT_MODE_M2_DESIGN.md` — M2を2トラックに分離する設計正本。
- **M2a Map Overlay Layer**: 既存マクロ tile overmap への NPC/merchant/caravan/faction/quest/discovery/settlement-pressure マーカー。`tileOvermapCore` と同じく **純導出・非永続・GM prompt非注入**。単一choke point `buildMapOverlaySnapshot`（新規 `src/mapOverlayCore.ts`）に webview/replay/remote を全て通し、6つのFoW正規則でM1ゲートのリーク blocker を解消。マーカー種別ごとに既存feature flagでgate（新masterスイッチは作らない）。
- **M2b Settlement Event Pacing**: 新規 `src/settlementEventCore.ts` を**純選択のみ**（RimWorld風 adaptive weighting + per-category cooldown、Wildermyth風 legacy note）。settlementOps の disk適用は M1同様に別ゲート（apply-gate/M2.5）へ据え置き。cooldownは settlement_state に optional 追加フィールド（v1据え置き・後方互換）。
- データ契約・受け入れテスト・モジュール計画・AI振り分け（ChatGPT=sanitize gate → Grok=pure core → Claude=webview → Gemini=説明）を明記。`AI_ROADMAP.md` M2にリンク追加。
- 設計のみ、コード変更なし。次アクションはChatGPTへ §6-1 の sanitize/FoW contract gate を投げること。

---

## 2026-07-04 JST - Claude (Sonnet 5) - Narrative structure patterns doc

- 新規 `docs/NARRATIVE_PATTERNS.md` — Settlement Mode向けの参照パターン群のうち、シム寄り（DF/CDDA/StoneSense/Kenshi/Qud、`SETTLEMENT_REFERENCE_PATTERNS.md`）とは別軸の「状態をどう場面に変換するか」を整理。
- 抽出元: Fallen London/StoryNexus（Quality-Based Narrative）、RimWorld（adaptive event pacing / storyteller）、Wildermyth（legacy props / scars）、King of Dragon Pass・Six Ages（単一の意味ある選択で拠点運営を進める形）。
- `docs/SETTLEMENT_REFERENCE_PATTERNS.md` 冒頭に相互参照を追加。`AI_ROADMAP.md` Phase 13にリンクとM2チェックリスト2項目（RimWorld風weighting/cooldown、Wildermyth風named note運用）を追加。
- 設計のみ、コード変更なし。`node scripts\validate_utf8_docs.js` で確認予定。

---

## 2026-07-04 JST - Claude (Fable 5) - Theme-driven UI accent palettes (v1.66.0)

- **世界観テーマボタンでUI全体の配色が切り替わるように** — `setTheme()`(10-game-state.js)が `body[data-ui-theme]` を常時セット（背景画像の有無に関係なく）。`97-visual-refresh.css` のアクセント色を RGBトリプレット変数（`--vr-accent-rgb`/`--vr-accent2-rgb`/`--vr-gm-rgb`）駆動に書き換え、テーマ別パレットを `body[data-ui-theme="..."]` で定義。
- **⚠️CSS変数の罠（後続AI向け）**: カスタムプロパティ内の `var()` は「宣言した要素」で解決される。`:root { --accent: rgb(var(--vr-accent-rgb)) }` と書くと body 側のトリプレット上書きに追従しない。派生変数（--accent/--gm-color/--accent-dim等）は `body[data-ui-theme]` セレクタで宣言してある。
- **FF14ボタン削除**（ユーザー要望: 名称が直接的すぎる）。旧セーブ `theme:"ff14"` は既定ブルー＋`.theme-ff14` 背景グラデ（50-scrollbar-themes.css に残置）で互換。
- **新テーマ3種**: Eastern（茜×金）/ Horror（血赤）/ Steampunk（真鍮）。背景グラデは97ファイル内、`gmBridgeRunner.ts:766` の theme 語彙も `fantasy/cyberpunk/scifi/postapoc/modern/eastern/horror/steampunk` に更新。
- 検証: 静的ハーネスで全8テーマの computed style を確認（送信ボタン/バブル/ドット等が追従）。※検証ブラウザのアニメクロック凍結により transition 付きプロパティが古い値で固まって見える現象があったが、クローン要素で正値を確認済み（実VSCodeでは正常）。
- テスト 143/143・version consistency PASS。

---

## 2026-07-04 JST - Claude (Fable 5) - Webview visual refresh (v1.65.0)

- **見た目の洗練レイヤー** — 新規 `webview/styles/97-visual-refresh.css` を CSS_MODULE_ORDER の**最後**に追加（後勝ちで確実に上書き、既存CSSファイルは一切書き換えない）。ブランド（dark glass + blue accent）は維持したまま質感を統一。
- 内容: 背景ラジアルグラデで奥行き / タイトルにグラデーションテキスト / バブル非対称ラウンド＋グラデ面（GM=左上4px角、user=右上4px角）/ senderマイクロキャップス / アクティブタブ＝ピル＋発光 / セクション見出しにアクセント縦チック / option-btnカード風 / qr-btnゴーストチップ / 入力欄インセットシャドウ / Author's Noteアンダーライン化 / リソースバー内側ハイライト / スクロールバー5px化。
- **バグ修正**: `#chat-header` が固定50pxのため、狭いパネルでボタン群が折り返すと切れていた → 高さ可変（min-height:50px）。
- **検証**: 静的ハーネス（style.css＋実DOM構造の複製）をローカルHTTPで描画し、1000px/750px幅でスクリーンショット確認。テスト 143/143・version consistency PASS。
- 今後見た目を調整する場合はこの97ファイルに書くと衝突しにくい。

---

## 2026-07-04 JST - Claude (Fable 5) - Webview UX polish (v1.64.0)

- **GMターン待ちの生存感** — `20-input-audio-prep.js` の `showGmLoading`/`hideGmLoading` のみ変更。「考え中…」にタイピングドット（CSSアニメ3点）＋経過秒カウンタ（3秒超で `Ns` 表示）。`hideGmLoading` で interval 確実クリア。
- **二重操作防止** — GM実行中に Quick Reply の `#qr-undo`/`#qr-retry` もロック（従来は free-input/send/options のみ）。
- **横スクロールの可視化** — `.tabs-header`（9タブ）と `#quick-reply-bar`（11ボタン）はスクロールバー非表示で続きが見えなかったため、`mask-image` の端フェードを追加。
- **a11y** — `:focus-visible` フォーカスリング（マウスクリックには出ない）、`prefers-reduced-motion: reduce` で全アニメ停止。
- 全スタイルは新規 `webview/styles/15-ux-polish.css`（`build-webview.js` の CSS_MODULE_ORDER に登録）。既存CSS・他モジュール非破壊。テスト **143/143**、version consistency PASS。
- **次候補（UX）**: chat-log の「新着メッセージ↓」ジャンプボタン（下端から離れてスクロール中に新メッセージが来た時）・ヘッダーのアイコンボタン群（8個）の狭幅時オーバーフローメニュー化。

---

## 2026-07-04 JST - Grok - Settlement Mode M2 pure cores (v1.67.0)

- `src/mapOverlayCore.ts` — `buildMapOverlaySnapshot()` FoW/sanitize choke point; marker kinds gated by source features.
- `src/settlementEventCore.ts` — pure `selectSettlementEvent()` + cooldowns + `deriveLegacyNote()`.
- `worldView.ts` — `mapOverlay` field on `worldView` message (no Webview renderer yet).
- Tests: `test_map_overlay_core.js`, `test_settlement_event_core.js`. `npm test` **145/145**.

---

## 2026-07-04 JST - Grok - Settlement Mode M1 (v1.63.0)

- Implemented M1 pure core per `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`.
- `src/settlementCore.ts` — parser/caps/tick/prompt formatter/`settlementOps` stubs; `src/settlementState.ts` — `settlement_state.json` loader + GM prompt bridge.
- `game_rules.json` flag `enableSettlementMode` (default OFF); GM prompt chunk `settlement` gated via `gmPromptBuilderCore.shouldIncludePromptChunk`.
- `scripts/test_settlement_core.js`; `npm test` **143/143**.

---

## 2026-07-04 JST - Codex - Settlement Mode M4 design/gate

- Added `docs/SETTLEMENT_MODE_M4_DESIGN.md`: limited Z-level expansion is split into M4a pure in-memory `expand_layer` layout expansion and M4b persistence wiring behind a later apply-gate.
- Added `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`: M4a only is approved now; valid layers are bounded to `z1`, `z0`, `z-1`, `z-2`; no direct Webview writes, no full tile arrays, no geology/mining/pathfinding, no combined game/world/settlement writes.
- Updated `docs/SETTLEMENT_MODE_AI_PROMPTS.md` with M4a Grok/Codex and M4b ChatGPT/Codex gate prompts.
- Updated `AI_ROADMAP.md` and `CHANGELOG.md`. Design/gate update only; no code implementation and no version bump.

---

## 2026-07-04 JST - Codex - Settlement Mode M3 design/gate

- Added `docs/SETTLEMENT_MODE_M3_DESIGN.md`: StoneSense-style isometric settlement view is split into M3a pure `settlementViewCore.ts` snapshot generation and M3b Canvas Webview renderer.
- Added `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`: M3 must remain read-only and snapshot-driven; no state writes from clicks, no settlementOps apply, no Z-layer expansion, no Three.js.
- Updated `docs/SETTLEMENT_MODE_AI_PROMPTS.md` with M3a Grok/Codex and M3b Claude handoff prompts.
- Updated `AI_ROADMAP.md` and `CHANGELOG.md` links. Design/gate update only; no code implementation and no version bump.

---

## 2026-07-04 JST - Codex - Settlement Mode M2 ChatGPT/Codex gate

- Reviewed Claude's M2 design and rewrote `docs/SETTLEMENT_MODE_M2_DESIGN.md` to remove mojibake and make the contract handoff-safe.
- Added `docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`: M2a map overlays must route Webview/replay/remote through one sanitized `buildMapOverlaySnapshot`; M2b settlement event pacing remains a pure selector with no disk apply or `turn_result` wiring.
- Updated `docs/SETTLEMENT_MODE_AI_PROMPTS.md` with a Grok M2 pure-core prompt and revised recommended order.
- Design/gate update only. No code implementation and no version bump.

---

## 2026-07-04 JST - Codex - Settlement reference patterns (Qud / Kenshi)

- Added `docs/SETTLEMENT_REFERENCE_PATTERNS.md` as design-only notes for Caves of Qud and Kenshi inspirations.
- Qud is scoped to procedural history, village hubs, unidentified discoveries, appraisal, and data-driven expansion.
- Kenshi is scoped to outpost vulnerability, faction world-states, merchant/visitor pressure, away-time progression, and expedition-return loops.
- Updated `docs/SETTLEMENT_MODE_DESIGN.md`, `docs/SETTLEMENT_MODE_AI_PROMPTS.md`, and `AI_ROADMAP.md` so M2+ agents can use these patterns without expanding M1 into a clone, combat sim, freeform builder, or real-time squad AI.
- No code implementation and no version bump.

---

## 2026-07-04 JST - Codex - Settlement Mode / StoneSense-style View design

- Grok research + ChatGPT phase discussionを統合し、LoreRelay向けの Settlement Mode 設計正本を追加。
- Added `docs/SETTLEMENT_MODE_DESIGN.md`: `settlement_state.json`, optional `settlement_layout.json`, future `settlementOps`, limited Z layers, display-only snapshot, M1-M5 phases.
- Added `docs/SETTLEMENT_MODE_AI_PROMPTS.md`: Codex/ChatGPT contract/security gate, Grok M1 pure core prompt, Claude UI/isometric prompt, Gemini user-facing wording prompt.
- Added `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`: the contract/security gate result was executed directly in this ChatGPT/Codex session, so Grok can start M1 from a concrete gate file instead of a "paste this into ChatGPT" loop.
- Design-only update. No code implementation and no version bump.

---

## 2026-07-03 JST - Claude (Sonnet 5) - World Observatory v1.53.0

- **「変わりゆく世界を見守る」観測ダッシュボードを実装**。設計ブリーフは前セッション(Opus 4.8)作成の `docs/WORLD_OBSERVATORY_WIRING_BRIEF.md`、見た目のモックは Fable5 が別途作成。`enableWorldObservatory`(既定OFF)。
- **相場スパークライン** — `world_state.json` に `marketPriceHistory`(locationId→commodityId→直近24件のpriceIndex、リングバッファ)を新規追加。純関数 `worldObservatoryCore.ts:appendMarketPriceHistory()`。`worldStateCore.ts` に型・パーサーを既存の `markets`/`npcPositions` と同じ検証パターンで追加。
- **年代記** — 既存の F1 Chronicle(`chronicleCore.ts`/`chronicleLoader.ts`)の出力をそのまま World タブへ横流し。新規計算ロジックなし。`enableWorldObservatory` 時のみ計算してI/Oコストを避ける(`state_journal.ndjson` の再読込が入るため)。
- **観測者モード(watch/advance)** — プレイヤーのターンなしで世界を1ティック進める。`watch`=無コストで世界のみ進行。`advance`=それに加え作中1日ぶんの旅費食料を消費(既存 `applyTravelFoodConsumption` を再利用、Commerce有効時のみ)。
- **器は非破壊** — `webview/modules/88-world-observatory.js`(新規、独立モジュール)が自前の `message` リスナーで描画し、ホットな `85-world.js` は1行も変更していない。
- **安全性の核心** — `emergentSimulator.ts:maybeTickSimulation` の中核ロジックを `runOneWorldStep()` として抽出・共有(挙動は不変、`test_emergent_simulator.js` で確認済み)。`watch` モードは `world_state.json` のみ変更し `game_state.json`(Persist-Before-Narrate領域)には触れないため観測ティックがセーブを壊すことはない。`advance` の資源消費のみ、Commerce UI の直接取引(`executeLivingWorldDirectTrade`)と同じ安全な非同期・楽観的並行制御(`scheduleCommercePersist`)を再利用。
- 自動観測はWebview側の `setInterval`(最短1.1秒・連続200tickで自動停止)で駆動、ホストは冪等ハンドラに徹する。
- `test_world_observatory_core.js` 新規(9ケース)。テスト **132/132**、`check_version_consistency.js` PASS。
- **次候補:** NPC相関図(Fable5がモック作成済み、配線は今回スコープ外)・観測モードの速度/上限のUXチューニング。

---

## 2026-07-03 JST - Claude (Opus 5) - Campaign Kit Phase G v1.52.0 campaign resources

- **Phase G 完了** — Campaign Kitのジャンル別資源(water/ammo/medicine等、これまでプロンプト上のラベルだけだった)を`campaignResourcesCore.ts`で実プレイヤー状態として正本化。`campaign_resources.json`(任意ファイル、discoveries.jsonと同じ独立ファイルパターン)、未作成時はアクティブキットの全資源にデフォルト10を自動補完。
- **campaignResourceOps** — `delta`/`set`、resourceIdはアクティブキットの`resources`語彙のみ許可(語彙外は無害に無視 — discoveries.jsonの`DiscoveryKind`ゲーティングと同じ思想)。`statePatch.ts`で`discoveryOps`の直後に配線。
- GM prompt `[Campaign Resources]`(優先度91)で残量+`(low)`/`(OUT)`表示。World タブに物資チップ(緑/黄/赤)追加(i18n×4)。
- **意図的に非連携にした点** — Commerce `tradeOps`での購入は自動的にresourceを補充しない(id空間が独立)。GMが「井戸で水を補給した」等を物語としてcampaignResourceOpsに反映する設計。1:1マッピングを強制すると、商品idと資源idの命名を無理に揃える必要が生じ、既存のcommerce_forge.json設計を歪めるリスクがあったため、疎結合のまま据え置いた。
- **既存機能との関係** — `applyTravelFoodConsumption`(旅行時food消費、Commerce本体の`PlayerCommerceState.food`)とは別軸。あちらはエンジン標準resource、こちらはCampaign Kit有効時のみのジャンル別resource。共存可能、競合なし。
- `test_campaign_resources_core.js`新規(10ケース)。テスト131/131、version consistency PASS。
- **次候補:** Campaign ResourcesとCommerce tradeOpsの緩い連携(GM裁量のプロンプト誘導を厚くする程度に留めるか、要相談)・G5ライバルギルド。

---

## 2026-07-03 JST - Claude (Opus 5) - Faction reputation market demand v1.51.0

- **`worldSimCommerceCore.ts`** に `tickFactionReputationMarketDemand()` 追加 — 派閥支配下の市場で、プレイヤー評判tier(hostile/unfriendly/neutral/friendly/allied)に応じてpriceIndexが+25%〜-20%の目標値へ1tickあたり最大0.03ずつdrift。既存の食料危機/鍛冶イベント連動(`applyWorldEventsToMarkets`)とは独立した第二の価格ドライバ(元設計 `docs/COMMERCE_AND_AGENCY_BRIEF.md` LW1-PR1「派閥/regionイベント連動」の評判版拡張)。
- **配線** — `worldKitTickCore.ts`(`WorldKitTickInput.marketFactionIds`/`factionReputations` 追加、両方指定時のみ適用)→`livingWorldBridge.ts`(`factionMarketDemandEnabled()` = `enableCommerce && enableFactionReputation`、市場locationIdをWorld Forgeの`factionControl`から解決)。新規game_rulesフラグなし、既存2フラグの組み合わせで自動有効化。
- **前回メモリの訂正** — 「resupply消費ループ(食料/水/弾薬)」を次候補として書いたが、調査したところ **食料の旅行消費は`livingWorldTurnOpsCore.ts:applyTravelFoodConsumption`で既に実装・配線済み**(elapsedWorldTurns×輸送手段×積載量)だった。未実装なのはCampaign Kitのジャンル別資源(water/ammo/medicine等)を実際のプレイヤー状態として消費させる部分のみ — これは新規サブシステム相当の大きめの変更なので、今回は手を出さず次候補として残す。
- `test_faction_market_demand.js` 新規(4ケース: tier別drift・1tickあたりcap・無関係派閥無反応・opt-in配線)。テスト130/130、version consistency PASS。
- **次候補:** Campaign Kit資源の消費ループ(water/ammo/medicine — 新サブシステム、要設計相談)・G5ライバルギルド。

---

## 2026-07-03 JST - Claude (Opus 4.8) - Campaign Kit Phase F v1.50.0 services state machine

- **Phase F 完了** — `DiscoveryEntry.condition`(standard/repaired/upgraded/damaged)+ `estValue` 追加。`computeSuggestedSellValue()` = estValue×倍率(1x/1.3x/1.6x/0.6x)。前回(v1.49.0)は「修理で価値が変わる」がプロンプト文言だけだった穴を、数値としてCore正本化。
- **ゲーティング** — `isServiceableStatus`/`resolveDiscoveryConditionAfterPatch`(discoveryAppraisalCore.ts)で、condition変更は identified/appraised のみ適用。unidentified/sold/consumedへのcondition opは無害に無視。estValueはゲート無し(GM側見積もり、鑑定前は非公開)。
- **曖昧さ維持** — formatEntryLine・pickDiscoveriesForWebview 双方で「unidentifiedの間はcondition/推定額を出さない」ガードを追加(実装中に自分で見つけた設計バグ、鑑定前に価値が漏れるところだった)。
- GM prompt に `[condition] ~推定額` 追記、sell_discovery交渉額をこれに近づける指示。World タブに condition バッジ+推定額表示(i18n ×4)。
- `discoveryLedgerCore.ts`/`discoveryAppraisalCore.ts`/`discoveryTurnOpsCore.ts`/`campaignKitBridge.ts`/`campaignKitCore.ts` 拡張。テスト129/129・version consistency PASS。
- **次候補:** 動的market demand(派閥/事件で相場変動)・resupply消費ループ(食料/水/弾薬)・G5ライバルギルド。

---

## 2026-07-03 JST - Claude (Opus 4.8) - Campaign Kit Phase E v1.49.0 genre presets + services loop

- **Phase E 完了** — `modern_occult`（現代オカルト調査員）+ `survival_horror`（サバイバルホラー）プリセット追加。`CampaignKitGenre` enum の全ジャンルにプリセットが揃い、job board の occult/horror テンプレート分岐が実プリセットで裏打ち。各プリセット 6-kind discovery taxonomy 完備。
- **theme 推定拡張** — occult/心霊/儀式/除霊→occult、horror/感染/outbreak/恐怖→horror。post-apoc bare-`ruins` フォールバックより前に評価（「haunted ruins」誤判定回避）。
- **Services ループ GM 誘導** — `buildCampaignKitPromptBlock` に修理/改造/補給/訓練ガイダンス。**修理で価値・用途が変わる**ことを明示、価格は tradeOps・状態は discoveryOps 経由で正本化。ChatGPT 設計の「Appraisal / Repair で価値変化」ギャップを prompt-only で補完（発見物 status 機への非破壊）。
- **Game Rules UI** — プリセット dropdown に 2 件追加（i18n ×4）。
- 全変更を `campaignKitCore.ts` 一本に集約しホット共有ファイル同時編集を回避。`test_campaign_kit_core.js` 拡張。`check_version_consistency.js` PASS · tests **129/129**。
- **次候補（未着手）:** Services を状態機化（`repaired`/`upgraded` status で価値バフを Core 正本化）· 派閥/事件による動的 market demand（相場変動）· resupply 消費ループ。

## 2026-07-03 JST - Grok - Campaign Kit v1.48.0 sell_discovery + reputation

- **sell_discovery** `tradeOps` — credits 加算；GM プロンプトで `discoveryOps sold` 連携案内。
- **Campaign reputation** — board/quest `factionId` 伝播；`buildActiveQuestObjective` が `reputationOps` を促す。
- TS ビルド修正（factionControl / sell_discovery delta）· webview i18n · tests **129/129**。

## 2026-07-03 JST - Grok - Campaign Kit v1.47.0 Phase D + job→questHooks

- **Phase D** `discoveryAppraisalCore.ts` — status transitions, auto-promote, GM guidance; webview appraisal chat inserts.
- **Accept job** → `questHooks` (`source: campaign`, status active); board filters accepted rows.
- Tests **129/129**.

## 2026-07-03 JST - Grok - Campaign Kit v1.46.0 Phase C + Webview panel

- **Phase C** `campaignJobBoardCore.ts` — deterministic hub job/rumor board from kit + World Forge sites; GM prompt chunk `campaignJobBoard` (prio 92).
- **Webview** World tab **Campaign** panel — discoveries ledger + job board with Inquire → chat insert.
- `campaignKitBridge.ts` · `worldView.ts` · `85-world.js` · i18n ×4 · tests **127/127**.

## 2026-07-03 JST - Grok - Campaign Kit v1.45.3 review fixes

### Summary

- discoveryOps を commit 成功後にのみ永続化；Agentic parse/merge；campaignKitId クリア；キャッシュ無効化。

### Verification

- `npm test` **126/126**

---

## 2026-07-03 JST - Grok - Campaign Kit Phase D-lite + UX (v1.45.2)

### Summary

- `discoveryOps` → `discoveries.json` 永続化（turn apply）。
- Start Hub: `scrapbound-settlement` ボタン · BUNDLED_SAMPLE_IDS 登録。
- Game Rules UI: `enableCampaignKit` + preset セレクト。
- `buildGameRulesPromptContext` に Campaign Kit 行追加。

### Verification

- `npm test` **125/125**

---

## 2026-07-03 JST - Grok - Campaign Kit code review fixes (v1.45.1)

### Summary

- kit ファイル存在時のフォールバック封じ、未知 preset ID 拒否、version 検証、テーマ推定順序修正。
- Discovery Ledger を Campaign Kit 有効時に限定。
- Scrapbound sample: commerce ブロック・playerRole 修正。
- `test_scrapbound_sample_integrity.js` 追加。

### Verification

- `npm test` **124/124**

---

## 2026-07-03 JST - Grok - Campaign Kit Phase A+B supplement

### Summary

- Phase B: `discoveryLedgerCore.ts` + `discoveries.json` → GM `[Campaign Discoveries]` chunk（priority 93）。
- Sample: `sample-scenarios/scrapbound-settlement`（post-apoc scavenger + Commerce）。
- Docs: `CAMPAIGN_KIT_QUICKSTART.md` · DESIGN 拡充 · FEATURE_MATRIX 行追加。
- Tests: `test_discovery_ledger_core.js` · preset list · scenario pack optional files。

---

## 2026-07-03 JST - Codex - Campaign Kit foundation

### Summary

- Added a genre-agnostic Campaign Kit layer for hub/job/expedition/discovery loops.
- New files: `src/campaignKitCore.ts`, `src/campaignKit.ts`, `docs/CAMPAIGN_KIT_DESIGN.md`, `scripts/test_campaign_kit_core.js`.
- `campaign_kit.json` in the workspace overrides built-in presets; otherwise `game_rules.enableCampaignKit` + optional `campaignKitId` activates the layer.
- Built-in presets: `classic_fantasy_guild`, `postapoc_scavenger`, `space_frontier`, `eastern_fantasy`, `cyberpunk_courier`.

### Verification

- `npm run compile`
- `node scripts/test_campaign_kit_core.js`
- `node scripts/test_prompt_budget_eviction.js`
- `node scripts/test_scenario_pack_core.js`

---

## 2026-07-03 JST - Grok - Cross-review hardening (v1.44.3)

### Summary

- Grok/Gemini レビュー指摘: Commerce GM-turn flush 同期化、Domain/Guild prompt cap、export Parlor/LW3 redact、status merge 正規化、Webview FoW 回帰テスト。
- テスト: `test_commerce_flush_gm_timing.js` · `test_replay_export_parlor_fields.js` · `test_world_view_simulation_payload.js` · `test_prompt_budget_eviction.js` 拡張。

### Verification

- `npm test` **121/121**
- `npm run compile` クリーン

---

## 2026-07-03 JST - Grok - G1–G4 docs sync + version consistency (v1.44.2)

### Summary

- README バッジ・Roadmap（4 ロケール）· `VERSION_TRUTH` · `FEATURE_MATRIX` Guild 行 · Current Snapshot を **1.44.2** に同期。
- `scripts/check_version_consistency.js` 新規（`package.json` / lock / README バッジ）。

### Verification

- `npm test` **118/118**
- `npm run compile` クリーン

---

## 2026-07-03 JST - Grok - G1–G4 Guild hardening (v1.44.1)

### Summary

- コードレビュー指摘 7 bug + 5 suggestion を修正（drift 時計 · bond map · quest cap · party dedupe · parse hardening 等）。

### Verification

- `npm test` **117/117**

---

## 2026-07-03 JST - Grok - Domain Wave 2 security review + hardening (v1.40.1)

### Summary

- Claude 実装（F8/F9/F10/D3 UI）のコードレビュー完了。重大な設計欠陥はなし。v1.39.7 と同型の **入力検証ギャップ** を修正。
- `validateRivalLord` / `parseDomainOps` dispatch / `parseBattleState` に allowlist 検証を追加。
- `DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS` は `domain` ルートで F8–F10 ネスト状態を既にカバー — 回帰テストを追加。
- **FoW / webview 漏洩**: `gameStateWebviewSanitizeCore` に `domain` なし（意図的）。`worldView` は `pickDomainForWebview` 経由で `disclosed*` のみ rival に送信 — 問題なし。
- **D3 UI XSS**: `renderDomainPanel` は `escapeHtml` / `textContent` 使用。静的陳情カタログ由来の `title` 属性は `.title` 代入で安全。

### Verification

- `npm test` **113/113**
- `npm run compile` クリーン

---

## 2026-07-03 JST - Claude Sonnet 5 - D3 Domain UI + F7-F10 panels (v1.40.0)

### Summary

- **D3 Domain UI** を実装し、Wave2 の F7 謁見 / F8 隣国ライバル / F9 主命・派遣 / F10 合戦を World タブ「🏰 Domain」パネルとして統合。エンジンのみだった4機能が実際に触れる形になった。
- `domainCore.DOMAIN_ACTION_CATALOG`（新規 export）· `domainBridge.pickDomainForWebview`（陳情の完全内容・region 名解決・action catalog を追加）· `worldView.ts`（`domain` payload を `worldView` message に追加）。
- `webview/modules/85-world.js` に `renderDomainPanel` 他 12 個のレンダー関数を追加。全ての操作（月次行動チップ・陳情裁定・派遣・采配）は既存の `insertChatText` パターンでチャット入力欄にテキストを挿入するのみ — Commerce Buy/Sell のような直接適用とは異なり、GM が読んで `domainOps` を書く既存契約を維持。
- Game Rules パネルに `enableDomainAudience`/`enableDomainRivals`/`enableDomainMissions`/`enableMassBattle` のチェックボックスを追加（`enableDomainMode` の子項目）。
- i18n: 4 言語 74 キー追加（`webview.world.domain*` 66 + `webview.gameRules.*` 8）。

### Verification

- `npm test` **113/113**（`check_i18n_keys.js` 0 missing、`validate_webview_html_structure.js` div balance OK）
- `npm run compile` クリーン、`node --check webview/script.js` 構文 OK
- **Extension Development Host（F5）での手動確認は未実施** — 次セッションで推奨（本リポジトリの既存慣習どおり、webview UI は最終的に手動テストが必要）

---

## 2026-07-03 JST - Claude Sonnet 5 - §F10 Mass Battle Resolver engine (v1.39.13)

### Summary

- Fable5 Wave 2 の **F10 合戦リゾルバ** をエンジン部まで実装。troops/defense に初めて明確な「出口」が生まれた。
- `src/massBattleCore.ts`（3ラウンド固定・assault/hold/stratagem 三すくみ・決定論損耗計算・victory/costly_victory/stalemate/retreat/rout の5分類）+ `domainCore`/`gameRules`/`domainTurnOps`/`domainBridge` 配線。
- **F8 との統合が核心**: `enableMassBattle` ON 時、隣国ライバルの `raid` は F8 出荷時の即時delta（暫定解決、CHANGELOG 1.39.11 に明記済み）ではなく `domain.activeBattle` を開始するよう置き換え。決着時に rival.strength にも反映。OFF（既定）時は F8 の挙動を完全維持（後方互換をテストで保証）。
- `battle_round` op は月次コミットに縛られない独立チャネル（audience_ruling と同型）— 数ターンかけて采配を宣言できる。

### Verification

- `npm test` **113/113**（`test_mass_battle_core.js` 24 assert、F8→F10 双方向の連携テスト含む）
- `npm run compile` クリーン

---

## 2026-07-03 JST - Claude Sonnet 5 - §F9 Officer Missions engine (v1.39.12)

### Summary

- Fable5 Wave 2 の **F9 主命・派遣** をエンジン部まで実装。「任命したのに使い道がない」家臣問題への対応。
- `src/domainMissionCore.ts`（4 kind × 4 grade の決定論解決、officer.skill + playerTrust + seed）+ `domainCore`/`domainOfficerBondCore`/`gameRules`/`domainTurnOps`/`domainBridge`/`domainDriftCore` 配線。
- `dispatch_officer` で任命済み家臣を1–3ヶ月派遣。低 trust（D5 Bond の rival 以下）家臣を派遣すると `disaster` 重みが上昇し、D5 の Bond 設計がそのままリスク管理ゲームになる。派遣中は評定・留守ドリフトの steward 判定から除外。

### Verification

- `npm test` **112/112**（`test_domain_mission_core.js` 23 assert）
- `npm run compile` クリーン

---

## 2026-07-03 JST - Claude Sonnet 5 - §F8 Rival Lord tick engine (v1.39.11)

### Summary

- Fable5 Wave 2 の **F8 隣国ライバル領主** をエンジン部まで実装（1領地ソリティア問題への対応）。
- `src/rivalLordCore.ts`（strength/aggression/stance の3変数 + 決定論月次tick + raid_prep→raid ゲート + FoW型開示ゲート）+ `domainCore`/`gameRules`/`domainTurnOps`/`domainBridge` 配線。
- `domain.rival` を `enableDomainRivals` ON 時に World Forge 隣接（`connectedTo`）から自動選定し月次コミットで遅延初期化。`diplomacy`/`espionage`/`gather_rumors` 行動が rival の stance/開示に作用。`raid_prep` は既存 `neighbor_militarize` イベント重みを押し上げる（F8 ブリーフどおり）。
- `raid` 発生時は playerDomain troops/defense との比較で暫定 delta を適用（**F10 合戦リゾルバが後で本実装に置き換える**、と明記）。

### Verification

- `npm test` **111/111**（`test_rival_lord_core.js` 21 assert）
- `npm run compile` クリーン

---

## 2026-07-03 JST - Claude Fable 5 / Opus 4.8 - §F7 Audience Hall engine (v1.39.10)

### Summary

- Fable5 Wave 2 ブリーフ（F7–F12）を `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` に追加後、**F7 謁見の間のエンジン部を実装**。
- `src/domainAudienceCore.ts`（陳情10種 allowlist・決定論キュー・裁定 delta）+ `domainCore`/`TurnResult`/`chronicleCore`/`domainBridge`/`gameRules` 配線。`audience` 月次行動 → `pendingPetitions` → GM `[Domain — Audience]` → `domainOps.audience_ruling` で裁定。
- `game_rules.enableDomainAudience`（既定 OFF）+ `domainAudienceSize`（既定 3）。**UI は D3 と同梱予定**。

### Verification

- `npm test` **110/110**（`test_domain_audience_core.js` 17 assert）
- `npm run compile` クリーン

---

## 2026-07-03 JST - Grok - Domain PR-A turn merge (v1.39.9)

### Summary

- `DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS` in `workspaceStateQueueCore.ts`; `test_domain_turn_merge_conflict.js` (commerce-ui interleave + domain monthly_commit).

### Verification

- `npm test` **109/109**

## 2026-07-03 JST - Grok - Domain §14 balance harness (v1.39.8)

### Summary

- `domain_balance_harness_lib.js`: shared strategies + trajectory/event summaries.
- Harness: min/max/delta per stat, event frequency, `npm run domain:balance`, `--json` / `--months`.
- `test_domain_balance_core.js`: balanced / martial / trade assertions.

### Verification

- `npm test` **108/108**
- `npm run domain:balance`

## 2026-07-03 JST - Grok - Domain review + hardening (v1.39.7)

### Summary

- Security: `parseDomainOps` officer id sanitization; `validateDomain` region pattern + event allowlist; council personality newline strip.
- Bug: `applyTurnResultToGameState` — `elapsedWorldTurns` before domain drift (conflict-reapply path).
- Docs: `VERSION_TRUTH`, README badges ×4, `FEATURE_MATRIX`, Current Snapshot.

### Verification

- `npm test` **108/108**

## 2026-07-03 JST - Grok - Domain §12 phase reorg (docs)

### Summary

- `DOMAIN_MODE_DESIGN.md` §12: status table D1→D1b→D1.5→D2→D3→D4→D5, shipped Ver 1.39.0–1.39.6, next = D3 UI.
- `PHASE_NAMING.md` Domain subtrack synced; §14 test table · §19 handoff · §20 next actions updated.

## 2026-07-03 JST - Grok - Domain §10.3 compact prompt (v1.39.6)

### Summary

- `domainPromptCore.ts`: 3-line compact base (`DOMAIN_COMPACT_BASE_LINES`), standard tier (+ officers count / single pending), `countDomainPromptLines`.
- `domainCore.ts`: `resolveDomainPromptTier` — minimal when no officers/pending/lastEvent; full on `monthly_commit` only.
- `domainBridge.ts`: event hint / seasonal / bond / ledger / council on full tier only; `DOMAIN_EVENT_FOCUS_LINE` on standard when event active.

### Verification

- `npm test` **108/108**

## 2026-07-03 JST - Grok - Domain §9.3 monthly council (v1.39.5)

### Summary

- `domainCouncilCore.ts`: per-role stat templates, lastMonthlyActions, personality, bond suffix; commit-only injection.

### Verification

- `npm test` **108/108**

## 2026-07-03 JST - Grok - Domain §9.2 officer bonds (v1.39.4)

### Summary

- `domainOfficerBondCore.ts`: assessOfficerBonds, syncOfficerDiscontentFlag, registry appoint gate, council + GM bond hints.
- Wired via `domainTurnOps.ts` / `domainBridge.ts` (playerNpcMilestones + npc registry).

### Verification

- `npm test` **107/107**

## 2026-07-03 JST - Grok - Domain code review + hardening (v1.39.3)

### Summary

- Review fixes: drift after `elapsedWorldTurns`, one-shot since-last-visit, depart without `nextLocationId`, snapshot refresh on all `domainOps`, `sanitizeDomainPromptLabel`, capped-month honesty, parser allowlists.

### Verification

- `npm test` **106/106**

## 2026-07-03 JST - Grok - Domain §9.1 absence drift (v1.39.3)

### Summary

- `domainDriftCore.ts`: steward `simulateStewardMonth`, `computeSinceLastDomainVisitDelta`, GM lines with `[domain:eventId]`.
- `domainRegionDriftCore.ts`: `domainSnapshotAtDepart`, return drift apply, monthly commit snapshot refresh.
- `statePatch`: region leave/enter hooks; Domain prompt injects since-last-visit block.

### Verification

- `npm test` **106/106**

## 2026-07-03 JST - Grok - Domain §8 event-first + seasonal (v1.39.2)

### Summary

- Seasonal action bonuses: spring `agriculture` +1, winter `festival` +1 support/culture via `resolveSeasonalActionBonus`.
- Events: `festival_gathering` (winter weight UP), `officer_discontent` (officers + `flags.officerDiscontent`).
- GM: `buildSeasonalDomainGmHint` on commit/full tier; `computeDomainEventWeight` for tests.

### Verification

- `npm test` **105/105**

## 2026-07-03 JST - Grok - Domain §1.4 risk mitigations (v1.39.1)

### Summary

- Event-first: `applyDomainEventEffect`, `applyMonthlyDomainIncome`, `buildDomainEventGmHint`, quieter `domain_quiet_month` weight.
- Prompt tiers: `resolveDomainPromptTier` minimal/standard/full; ledger line via `domainLedgerCore` when Commerce+Domain ON.
- Tests: `test_domain_balance_core.js`, `test_domain_ledger_core.js`.

### Verification

- `npm test` **105/105**

## 2026-07-03 JST - Grok - Domain Mode D1–D2 (v1.39.0)

### Summary

- Implemented Domain Mode core: `domainCore.ts`, monthly `domainOps` channel, seasonal/event roll, `domainTurnOps` wired into `statePatch`, GM `[Domain — …]` prompt chunk, Agentic Referee `domainOps`, Chronicle `domain` events.
- Game Rules: `enableDomainMode` (OFF default), `domainMonthDays`, `domainMonthlyActions`; webview checkbox + i18n 4 locales.
- Balance harness: `scripts/domain_balance_harness.js`.

### Verification

- `npm run compile`
- `npm test` **103/103**

## 2026-07-03 JST - Grok - Narrative Time three-clock model + release v1.38.0

### Summary

- Added `buildNarrativeTimePromptBlock()` to Campaign GM prompts (`narrativeTime` chunk, priority 98): Exchange / Narrative Time / World Day separation with beat-specific density rules.
- Updated `ELAPSED_WORLD_TURNS_PROMPT_LINE` and Agentic Referee `elapsedWorldTurns` contract (default 0; commit on rest/travel/skip only).
- Documented §C in `docs/WORLD_TIME_PASSAGE_IDEA.md`.
- Release **v1.38.0** bundles In-World Chat (205416c), webview sanitizer follow-up, and this prompt work.

### Verification

- `npm run compile`
- `node scripts/test_gm_prompt_builder_core.js`
- `node scripts/test_prompt_budget_eviction.js`
- `npm test` **100/100**

## 2026-07-03 JST - Codex - In-World Chat mode

### Summary

- Added `inworld` as a third experience profile alongside `campaign` and `parlor`.
- Added `inworld_session.json` persistence and an In-World prompt builder that injects public campaign/world context as reference-only, untrusted context.
- Wired Start Hub "In-World Chat" entry, header profile toggle, Webview message handling, and backend chat routing through the Parlor-style non-`turn_result.json` path.
- In-World Chat keeps World/Inspector panes visible and explicitly forbids world-state mutation, `statePatch`, `turn_result`, dice macros, and canonizing new facts.

### Verification

- `npm run compile`
- `node scripts/test_in_world_prompt_builder_core.js`
- `node scripts/check_i18n_keys.js`
- `npm test` **100/100**

## 2026-07-03 JST - Codex - Gemini review follow-up: Webview payload + OCC tests

### Summary

- Hardened `gameStateWebviewSanitizeCore`: Webview now receives sanitized public subsets for `commerce` / `world`, while private nested fields are stripped.
- Replaced `statePatch` Webview filtering with an allowlist policy; unknown future roots and sensitive paths no longer pass through to Inspector.
- Added `test_state_merge_inventory_race.js` for stale-turn inventory/condition/skills rollback prevention.
- Extended `test_commerce_persist_debounce.js` to cover explicit synchronous flush before deactivate.

### Verification

- `npm run compile`
- `node scripts/test_webview_payload_whitelist.js`
- `node scripts/test_state_merge_inventory_race.js`
- `node scripts/test_commerce_persist_debounce.js`
- `npm test` **99/99**

## 2026-07-03 JST - Grok - Campaign PR3 export sanitization (v1.37.7)

### Summary

- `replayExportSanitizeCore` — path redaction, sensitive JSON fence stripping, entry field whitelist for replay/saga export.
- `replayExportCore` / `exportHtml.ts` wired; saga images gated by `resolveAllowedImagePath`.
- Tests: `test_replay_export_sanitize_core.js`, replay export integration case.

### Verification

- `npm test` **98/98**

## 2026-07-03 JST - Grok - Campaign PR2 LW bond chunks + PR4 interleave tests (v1.37.6)

### Summary

- PR2: `livingWorldNpcBonds` / `livingWorldPlayerBonds` prompt chunks (priority 62/61), split from `worldState`.
- PR4: `test_commerce_turn_interleave.js` — flush-before-turn, coalesce, late flush after revision advance.
- Extended `test_prompt_budget_eviction.js` for bond chunk ordering.

### Verification

- `npm test` **97/97**

## 2026-07-03 JST - Grok - Campaign P0 PR1-lite commerce-ui merge (v1.37.5)

### Summary

- `mergeCommerceUiForPersist` — commerce-ui profile always updates `commerce` only (+ entry id merge), never spreads stale debounced snapshots on matching revision.
- Test: no-conflict stale status/entries must not overwrite disk in `test_state_merge_commerce_race.js`.

### Verification

- `npm test` **96/96**

## 2026-07-03 JST - Grok - Campaign P0 PR6-lite status array OCC (v1.37.4)

### Summary

- `mergeTurnStatusOnConflict` — on `turn` profile conflict, disk wins for `inventory` / `condition` / `skills`; GM fields (`hp`, etc.) from incoming.
- `UI_PROTECTED_STATUS_FIELDS_ON_TURN_COMMIT` constant.
- Test: inventory consume during stale turn merge in `test_state_merge_commerce_race.js`.

### Verification

- `npm test` **96/96**

## 2026-07-03 JST - Grok - Campaign P0 PR3 queue split + commerce debounce (v1.37.3)

### Summary

- Separate `runSerializedGameStateMutation` / `runSerializedWorldStateMutation` FIFO queues.
- `livingWorldCommercePersist` — 80ms debounced game+world commerce writes; flush before GM turn.
- `writeJsonAtomic` / `writeJsonAtomicAsync` rename retry for Windows file locks.

### Verification

- `npm test` **96/96**

## 2026-07-03 JST - Grok - Campaign P0 PR2 webview whitelist (v1.37.2)

### Summary

- `gameStateWebviewSanitizeCore` — whitelist-only `pickGameStateForWebview` / `pickTurnResultForWebview`.
- `sanitizeStatePatchForWebview` drops `/hiddenState`, `/director/notes`, ephemeral update arrays.
- `test_webview_payload_whitelist.js` guards unknown keys in CI.

### Verification

- `npm test` **94/94**

## 2026-07-03 JST - Grok - Campaign P0 PR1 merge semantics (v1.37.1)

### Summary

- `mergeGameStateForPersist` profiles: `turn` (disk commerce wins on conflict), `commerce-ui`, `entries-only`.
- `processTurnResult`: re-read disk before commit; re-apply turn delta when `stateRevision` advanced.
- `persistPlayerInputEntry` / Commerce UI pass `baseRevision` + profile.
- Tests: `test_state_merge_commerce_race.js`, updated `test_workspace_state_queue_core.js`.

### Verification

- `npm test` **93/93**

## 2026-07-03 JST - Grok - Campaign P0 state race + trust leak (v1.37.0)

### Summary

- `workspaceStateQueue` serializes `game_state.json` / `world_state.json` writes (FIFO).
- `commitGameState` / `saveWorldState`: reload-before-write + entry/map merge + revision counters.
- Turn pipeline batches world_state mutations; direct commerce trade uses single queued op.
- Webview sanitization: `npcAgencyOps` trust filter, strip `hiddenState` / `director.notes`.
- Inspector + World tab defensive rendering for low-trust whereabouts.

### Verification

- `npm test` **92/92**

## 2026-07-03 JST - Grok - Parlor Phase C Gemini review follow-up

### Summary

- `splitCampaignImportForParlor` — 500 active + overflow to ndjson (P0 demote memory).
- Archive write queue serializes ndjson appends (P0 I/O).
- Promote wizard: resume frozen Campaign vs fresh promote when `frozenAt` + game_state exist (P1).
- `sanitizePromotedGameState` + validateGameState log (P1 schema).
- `compressParlorSessionSummary` for long-running archives (P2).
- Grok broader Campaign/LW review documented as out-of-scope appendix.

## 2026-07-03 JST - Grok - Phase 12 Parlor Mode Phase C (v1.36.0)

### Summary

- `parlorPromoteCore` + host wizard: scenario.json, game_state.json, game_rules.json bootstrap from Parlor session.
- Campaign → Parlor demote with optional `game_history` import; `campaign.frozenAt` on experience.json.
- `parlor_archive.ndjson` compaction when messages exceed 500; summary delta on archive.
- Command `textadventure.promoteParlorToCampaign`; Webview promote button in Parlor settings.
- 🎭/⚔️ toggle: Parlor→Campaign runs promote wizard; Campaign→Parlor runs demote import prompt.

### Verification

- `npm test` **90/90**

## 2026-07-03 JST - Grok - Parlor Gemini review follow-up #2

### Summary

- Expanded `docs/PARLOR_MODE_GEMINI_CODE_REVIEW.md` with full P0–P3 triage (改定レビュー基準).
- `effectivePromptCharBudget` in `promptContext.ts`; Parlor assembler uses ratio + fixed margin.
- `clampDelimitedContext` drops whole inner lines (keeps BEGIN/END delimiters).
- `invokeParlorVscodeLm`: `gmStart` before model select; `gmEnd` on all early exits.
- Webview: disable `parlor-settings-btn` during GM loading.

### Verification

- `npm test` — parlor prompt tests extended (margin · lore delimiters · campaign isolation)

## 2026-07-03 JST - Grok - Phase 12 Parlor Mode Phase B (v1.35.0)

### Summary

- Implemented Phase B: `connection_profiles.json` UI, `persona.json` editor, `backgrounds/` gallery, clipboard `PARLOR_SKILL.md` header flow.
- Core: `connectionProfileCore` · `personaCore` · `parlorBackgroundCore` + host adapters.
- Webview: `87-parlor-settings.js`, header 🎛️ panel, `profile-parlor-only` CSS.
- Extension wiring: `sendParlorSettingsToWebview`, connection/persona/background handlers in `webviewHandlers.ts`.

### Verification

- `npm run build:webview`
- `npm run compile`
- `npm test` (**87/87**)

## 2026-07-03 JST - Codex - Phase 12 Parlor Mode Phase 3 gate

### Summary

- Reviewed Grok Phase A implementation (`159404e`) against `docs/PARLOR_MODE_CHATGPT_REVIEW.md`.
- Found one High-class prompt-safety issue: `assembleParlorUserPrompt()` used tail slicing when over budget, so a huge character/lore/history payload could drop Parlor system rules and UNTRUSTED boundaries.
- Fixed prompt budgeting to preserve system rules, current user message, and delimited character/lore boundaries; added regression coverage in `test_parlor_prompt_builder_core.js`.
- No Critical/High blockers remain from the code paths reviewed for Phase A.

### Verification

- `npm run compile`
- `node scripts/test_parlor_prompt_builder_core.js`
- `node scripts/test_parlor_session_core.js`
- `npm test` (**84/84**)

## 2026-07-03 JST - Codex - Phase 12 Parlor Mode ChatGPT review package

### Summary

- Added `docs/PARLOR_MODE_CHATGPT_REVIEW.md` with the design-stage security audit, Parlor -> Campaign promotion boundary, and post-Grok implementation gate checklist.
- Added `TextAdventureGMSkill/PARLOR_SKILL.md` as the Parlor-specific plain-text GM contract for clipboard / Codex / ChatGPT-extension workflows.
- No production TypeScript/Webview code was changed; this is the ChatGPT Phase 1 deliverable that Grok should read before Phase A implementation.

### Next

- Grok Phase A should treat Critical/High items in `docs/PARLOR_MODE_CHATGPT_REVIEW.md` as release blockers.
- After Grok implementation, run the Phase 3 gate checklist from the same review doc before tagging v1.34.0.

## Current Snapshot (2026-07-03)

> **版の正本:** `package.json` + `CHANGELOG.md` + [`docs/VERSION_TRUTH.md`](docs/VERSION_TRUTH.md)

| Item | Value |
|------|-------|
| Package version (`main`) | **1.34.0** |
| GitHub Release (VSIX) | `git push origin v1.34.0` で Release 更新 |
| Canonical repo path | `C:\AI\text-adventure-vsce` |
| Parlor Mode | **Phase A 出荷** — ChatGPT Phase 3 gate 通過（`906e5d4`） |
| Living World | **v1.23–1.33** + LW3-P2 hardening（1.34.0 同梱） |
| Tests | `npm test` **84/84** |
| Next (推奨) | Phase B: connection_profiles · Promote ウィザード · README Parlor 4言語全文 |

---

## 2026-07-03 JST - ChatGPT + Grok - v1.34.0 Parlor gate + release

### Summary

- ChatGPT Phase 3 gate: **1 High 修正** — `assembleParlorUserPrompt` が末尾切り詰めで safety rules を落とす問題 → 予算配分で system rules / UNTRUSTED / user message を固定保持（`906e5d4`）。
- Critical/High ブロッカー **0** → **v1.34.0** リリース整理。

---

## 2026-07-03 JST - Grok - Parlor Mode Phase A 実装

### Summary

- Gemini/ChatGPT ドラフト反映後、**Phase A MVP** 実装: `experience.json`, `parlor_session.json`, `invokeParlorVscodeLm`（JSON/turn_result 非書込）, Start Hub 🎭, Webview `profile-parlor` CSS。
- ChatGPT **Critical/High** 対応: ワークスペース固定パス、Parlor/Campaign 分離、プロンプト未検証コンテキスト区切り、assistant JSON strip。
- `npm test` **84/84**（+2 parlor core tests）。

### Next

- ChatGPT に `docs/PARLOR_MODE_CHATGPT_REVIEW.md` Phase 3 ゲート
- Phase B: `connection_profiles` · README 4言語 Parlor 全文

---

## 2026-07-03 JST - Grok - Phase 12 Parlor Mode 設計 doc + 3AI 振り分け

### Summary

- **`docs/PARLOR_MODE_DESIGN.md`** — Parlor ⟷ Campaign 体験プロファイル設計（JSON 不要の 1対1 チャット、vscode-lm 月額 AI 優先、1クリック昇格/降格、Phase A–C）。
- **`docs/PARLOR_MODE_AI_PROMPTS.md`** — Gemini（UX/README）· ChatGPT（セキュリティ/PARLOR_SKILL）· Grok（Phase A 実装）のコピー用プロンプト。Claude 5h 制限のため除外。
- **`AI_ROADMAP.md`** Phase 12 追加 · **`AI_HANDOVER_PROMPTS.md`** §9 追加。

### Next

- ユーザーが Gemini / ChatGPT / Grok に `PARLOR_MODE_AI_PROMPTS.md` を貼って並列着手
- Phase A 完了時 **v1.34.0** 候補

---

## 2026-07-03 JST - Claude Fable 5 - v1.32.0 LW3-P あなたの絆(主人公が関係の網に入る)

### Summary

- **`playerBondCore.ts`** — 既存 disposition(playerTrust/playerRomance/playerFear)の閾値越えで**プレイヤー↔NPC の転機**を一度きり発火: 固い盟友(trust≥85)/特別な想い(romance≥80)/敵対(trust≤15)/畏怖(fear≥80)/背信(盟友・想い後に trust≤25)。`world_state.playerNpcMilestones` で再発火抑制。
- **GM `[Living World — Your Bonds]`** — 現在の立ち位置を毎ターン注入、このtickの転機は ★。数値は出さない。romance の解釈は世界観に委ねる。
- **UI** — World タブ Bonds 先頭に「あなた × Elda 🤝固い盟友」行(kindラベルのみ、4ロケール)。
- 転機は伝聞イベント(category npc, expires 20)にも昇格 → Since-last-visit 経由で GM へ。
- これで LW3 関係網が完成: NPC↔NPC(v1.29-31) + プレイヤー↔NPC(本版)。
- **途中でディスク100%満杯(ENOSPC)により中断→ユーザーが空けて再開**した経緯あり。作業ファイルは無傷で全て反映済み。

### Verification

- `npm run compile` · `npm test` (**81/81** — 新規 `test_player_bond_core.js` 16件 + host統合2件)

### Update (同日追記): LW3-P2 絆の交易波及 実装済み

- `applyPlayerBondTradeAdjustment()`(playerBondCore, 純関数): tradeOps 後、同一市場バッチで
  盟友同席=純増減の10%有利 / 敵対同席=10%不利(上限500, 盟友優先, 背信・不在は無効)。
  `livingWorldTurnOps` に配線。core テスト+10件、81/81 緑。

### Next (v1+ 候補)

- 絆マイルストーンの共有史タイムライン(NPC↔NPC + player 統合ビュー)
- ally_trade / enemy_friction の噂イベント化(v1.30 からの残タスク)
- 絆調整の GM 通知(現状は無言の経済 — narration で「まけてくれた」を促す1行)

---

## 2026-07-02 JST (深夜) - Claude Opus 4.8 - v1.31.0 LW3-L 関係のライフイベント(北極星最深部)

### Summary

- **`npcLifeEventsCore.ts`** — affinity が極端閾値を跨いだ瞬間の「決定的転機」を一度だけ発火(決定論): 盟友の契り(≥85) / 離れがたい仲(≥95) / 宿敵(≤-85) / 決別(契り後に0未満) / 和解(宿敵後に+10)。`world_state.npcMilestones`(ペアキー→到達id)で再発火抑制。
- **伝聞化** — 転機を `recentChanges`(category npc, expires 20)に昇格 → Since-last-visit で GM に届く。**theme-neutral**: "inseparable" は深い友情/恋/義兄弟のいずれにも読めると gmHint 明示。**破壊的削除なし**(意味づけは GM)。
- **UI** — World タブ Bonds 行にマイルストーンバッジ(🛡️盟友の契り/💠離れがたい仲/🗡️宿敵/💔決別/🕊️和解, 4ロケール)。raw affinity 非送信のまま。
- 双方向ループ(v1.29→v1.30)の上に「転機」層が乗り、ガンパレの emergent drama に最も近づいた。
- trade-routes README 手順10。

### Verification

- `npm run compile` · `npm test` (**80/80** — 新規 `test_npc_life_events_core.js` 15件 + host統合3件)

### Next (v1+ 候補)

- ライフイベントの World タブ「共有史」タイムライン表示(listPairMilestones)
- ally_trade / enemy_friction の噂イベント化(v1.30 の残タスク)
- プレイヤー↔NPC の関係にも life events を拡張(現状は NPC↔NPC のみ)

---

## 2026-07-02 JST (深夜) - Claude Fable 5 - v1.30.0 LW3-W 絆の世界波及(双方向ループ完成)

### Summary

- **`npcBondEffectsCore.ts`** — 関係→世界のフィードバック(決定論・GM非関与): **盟友物流**(ally ペアが別市場に居ると共通商品の在庫 +1/tick 両市場, 上限60) / **敵対摩擦**(enemy ペアの市場 priceIndex +0.05/tick, 上限4)。移動中は不参加。recovery の**後**に適用。
- **紹介効果(太閤の紹介状)** — `applyIntroductionTrustBoost()`(npcRelationshipCore): 盟友の playerTrust が -25 で伝播。低信頼 NPC も盟友経由で whereabouts が見える。GM プロンプト(bridge)と World タブ(worldView)の両経路に配線。
- v1.29.0(直前エントリ)と合わせ、**世界→関係→世界 の双方向ループが閉じた**。
- trade-routes README 手順9(盟友物流・敵対摩擦・紹介の体験手順)。

### Verification

- `npm run compile` · `npm test` (**79/79** — 新規 `test_npc_bond_effects_core.js` 19件 + host統合2件)

### Next (v1+ 候補)

- Bonds の World タブに introducedBy 表示(「(Eldaの紹介)」)
- ally_trade / enemy_friction を噂イベント化(現状は相場の動きとしてのみ体感)
- 恋愛・死などの重いライフイベント(affinity 基盤の上の future arc)

---

## 2026-07-02 JST (深夜) - Claude Opus 4.8 - v1.29.0 LW3 NPC間関係(北極星/ガンパレ第一歩)

### Summary

- **`npcRelationshipCore.ts`** — 名ありNPC(≤10)同士の決定論的関係進化。同席 +3/tick・共通の危機 +8・派閥動態(紛争時 異派閥-10/同派閥+4)。affinity ±100、ラベル ally70/friend30/rival-30/enemy-70。会話自動生成なし(黄金律維持)。
- **ホスト配線** — `game_rules.enableNpcRelationships`(既定OFF, Registry+Agency前提) / `world_state.npcRelationships` 永続化(parseWorldState検証付き) / `tickLivingWorldAfterSim`→`evolveRelationships`(tick.npcMoves で shared_crisis 判定) / GM `[Living World — Bonds]` / `turn_result.relationshipOps` / `RELATIONSHIP_OPS_PROMPT_LINE`。
- **噂イベント** — affinity のラベル遷移(中立→友好 等)のみ `recentChanges` に `category:'npc'` の伝聞イベント昇格(最大4件/tick, expires 10)。「留守中に二人が親しくなっていた」が Since-last-visit に乗る。
- **UI** — Game Rules「Enable NPC Bonds (LW3)」/ World タブ「NPC Bonds」(🤝🙂⚡⚔️ ラベルのみ、raw affinity は webview に送らない=v1.27.1方針) / 4ロケール i18n。
- **デモ** — trade-routes `enableNpcRelationships:true` + README 手順8(Elda×Marcus 同席で友好、紛争で異派閥が離れる)。
- Docs: `docs/LIVING_WORLD_LW3_RELATIONSHIPS.md`(設計+配線記録+残タスク)。

### Verification

- `npm run compile` · `npm test` (**78/78** — 新規 `test_npc_relationship_core.js` 26件 + `test_npc_relationship_host.js` 15件)

### Next (v1+ 候補)

- Bonds の信頼連動曖昧化(低 playerTrust では「親しいらしい」程度に) — `npcWhereaboutsTrustCore` パターン
- 関係が世界へ波及(盟友の商人は融通、敵対は妨害) — LW3 が Commerce/whereabouts に影響する段階
- 恋愛・死などの重いライフイベントは affinity 基盤の上に future arc(BRIEF §5.6)

---

## 2026-07-02 JST - Grok - v1.28.0 ChatGPT/Gemini review follow-up

### Summary

- **Docs:** `FEATURE_MATRIX.md`, `LIVING_WORLD_QUICKSTART.md`, `REVIEW_FOLLOWUP_v1_28.md`
- **Release:** `release.yml` tag ↔ `package.json` version gate
- **Replay:** `formatMarkdownImageRef()` for Markdown paths with spaces/parens
- **CHANGELOG:** remove `C:\AI\` local paths from header

### Verification

- `npm run compile` · `npm test` (76/76)

### User

- `git tag v1.28.0 && git push origin v1.28.0` for VSIX Release
- `testing_checklist.md` §9b–9c

---

## 2026-07-02 JST - Grok + Gemini - Living World v1.26.0–v1.27.1

### Summary

- **v1.26.0** — BRIEF v1+ Commerce UI (`enableCommerceUi`, Buy/Sell, playerRole selector, `livingWorldCommerceUiCore`).
- **v1.27.0** — trust-linked NPC whereabouts + playerRole GM motivation (`npcWhereaboutsTrustCore`, `livingWorldPlayerRoleCore`).
- **v1.27.1** (Gemini patch) — unknown payload strips `locationId`/transit fields; GM approximate transit wording; trust constants shared with `gmPromptBuilder`.
- Docs: `CODE_REVIEW_PROMPT_LIVING_WORLD.md`, `COMMERCE_UI_V1_26_0_REVIEW.md`, `LW2_TRUST_ROLE_V1_27_0_REVIEW.md`.
- Manual: `testing_checklist.md` §9b–9c, trade-routes README updated.

### Verification

- `node scripts/build-webview.js`
- `npm run compile`
- `npm test` (76/76)

### User manual (required before tag)

- `testing_checklist.md` §9b–9c on trade-routes workspace
- Optional: F5 extension host smoke on Commerce UI Buy/Sell

---

## 2026-07-02 JST - Grok - Living World v1.25.0 (LW2-PR2 + Inspector market debug)

### Summary

- **LW2-PR2** — `[Living World — Caravan]` in GM prompt; `formatNpcAgencyReason()` for NPC whereabouts lines (stationary + transit).
- **Inspector** — market debug controls (location/commodity/multiplier) when Commerce ON + debug console visible.
- **`livingWorldMarketDebugCore.ts`** — shared with sandbox 「小麦相場を2倍に」 path.

### Verification

- `lorerelay-world-kit npm test` (5/5)
- `node scripts/build-webview.js`
- `npm test` (73/73)

---

## 2026-07-02 JST - Grok - Living World v1.24.0 (bulk sim tick + UI polish)

### Summary

- **Critical fix:** `elapsedWorldTurns` / bulk sim now runs Living World market+NPC tick via `afterStep` hook in `worldSimBulkCore` → `worldSimPersist`.
- **World tab Caravan panel** — credits / food / transport / cargo.
- **NPC whereabouts** — reason/agenda inline in UI.
- **Debug sandbox** — 「小麦相場を2倍に」 → `applyMarketPriceMultiplier()`.
- trade-routes README playthrough checklist. Version **1.24.0**.

### Verification

- `node scripts/build-webview.js`
- `npm run compile`
- `npm test` (72/72)

---

## 2026-07-02 JST - Grok - Living World v1.23.0 finish (post-Codex)

### Summary

- Continued after ChatGPT/Codex overnight work (`fdfec2e`). Confirmed 69/69 baseline; added remaining LW1-PR3 + schema gaps.
- **`commerce.food`** — travel rations on `game_state.commerce`; `applyTravelFoodConsumption()` on `elapsedWorldTurns` (pure core in `livingWorldTurnOpsCore.ts`).
- **GM prompts** — `TRADE_OPS_PROMPT_LINE`, `NPC_AGENCY_OPS_PROMPT_LINE`, depleted-food warning when `food <= 0`.
- **Agentic Referee** — parse/merge `tradeOps`, `npcAgencyOps`, `elapsedWorldTurns`; instructions updated.
- Removed junk `test_write.txt`. Version **1.23.0**.

### Verification

- `cd lorerelay-world-kit && npm test` (5/5)
- `npm run compile`
- `npm test` (70/70)

---

## 2026-07-02 JST - Codex - Living World overnight supervision

### Summary

- Verified the since-last-visit market snapshot fix already present in `livingWorldBridge.ts` / `statePatch.ts`.
- Added World tab read-only market tables from `world_forge.json` commerce + `world_state.json` markets.
- Added Inspector read-only display for `turn_result.tradeOps` and `turn_result.npcAgencyOps`.
- Added World tab NPC whereabouts using `listNpcPresence()` with a 10-NPC clamp notice.
- Added a Living World travel-plan prompt block that tells the GM estimated travel turns / food cost and how to emit `elapsedWorldTurns`.
- Added bundled `sample-scenarios/trade-routes` demo pack for commerce + NPC agency.

### Verification

- `npm run compile`
- `npm test` (69/69)
- Qwen2.5-Coder via LM Studio was attempted twice but timed out on both a full TASK 2 prompt and a short review prompt.

### Notes

- Working tree already contained a large v1.22.x dirty implementation from previous agents. To make a clean checkout buildable, the Living World core files must be committed together with these UI/demo changes.
- `test_write.txt` is local junk and should not be committed.

---

## 2026-07-02 JST - Grok - world-kit v0.1.0 (Living World cores)

### Summary

- New package **`C:\AI\lorerelay-world-kit`** — host-agnostic Living World cores:
  - `commerceCore` (tradeOps, prices, cargo)
  - `transportCore` (location/region paths, travel days)
  - `worldSimCommerceCore` (Tier 1 market ticks, since-last-visit)
  - `npcAgencyCore` (≤10 NPC reactions)
  - `livingWorldPromptCore` + `worldKitTickCore`
- Fixtures: `trade_routes_forge.json` (3 ports, 3 commodities, Elda/Marcus NPCs).
- `npm test` → 5/5 pass.

### Next

- LoreRelay integration: LW-W1 wire `runLivingWorldTick` after emergent sim; LW1 `tradeOps` pipeline.

---

## 2026-07-02 JST - Grok - F5 Replay Export (v1.21.1)

### Summary

- `replayExportCore.ts` / `replayExportPathsCore.ts` / `replayExport.ts`: Markdown + self-contained HTML from chat entries, F1 chronicle chapter headings, `visual_memory.json` gallery; writes under `exports/`.
- Inspector UI (format, images/GM/dice toggles) + `textadventure.exportReplay` command; HTML opens in browser, MD in editor.
- Respects `excludedFromPrompt` and `imageBlocked`.

### Verification

- `npm run compile`
- `npm test`

---

## 2026-07-02 JST - Grok - F4 Travel Encounter (v1.21.0)

### Summary

- `travelEncounterCore.ts`: BFS region path, deterministic hazard encounters, `[Travel — Encounters]` GM injection on travel commands.
- Gated by `game_rules.enableTravelEncounters` + `travelEncounterDensity` (low/medium/high).

### Verification

- `npm run compile`
- `npm test`

---

## 2026-07-02 JST - Grok - F3 Faction Reputation (v1.20.0)

### Summary

- `factionReputationCore.ts` + `FactionWorldState.playerReputation`; quest completion and `reputationOps` apply deltas.
- Gated by `game_rules.enableFactionReputation`; GM line via `textAdventure.reputation.inPrompt`.
- World tab reputation bar on faction cards.

### Verification

- `npm run compile`
- `npm test`

---

## 2026-07-02 JST - Grok - F2 Pacing Director (v1.19.1)

### Summary

- `journalBeatCore.ts` shared beat classifier; `pacingCore.ts` for window skew + one-line `[Director — Pacing]` hint.
- Gated by `textAdventure.pacing.hintInPrompt` (default off); i18n hint strings in 4 locales.
- Appended to Scenario Director prompt block when enabled.

### Verification

- `npm run compile`
- `npm test`

---

## 2026-07-02 JST - Grok - F1 Chronicle (v1.19.0)

### Summary

- Implemented deterministic Chronicle from `state_journal.ndjson` + `world_state.recentChanges` + `questHooks`.
- `chronicleCore.ts`, `chronicleJournalCore.ts`, `chronicleLoader.ts`; inject-once `[Previously]` via `textAdventure.chronicle.recapInPrompt` (default off).
- Inspector read-only chapter view; `lastInjectedChronicleTurn` in `world_state.json`.

### Verification

- `npm run compile`
- `npm test`

---

## 2026-07-02 JST - Grok - Debug sandbox scenario (v1.17.0)

### Summary

- Bundled `sample-scenarios/debug-sandbox` with `meta.tags: ["debug"]`.
- Natural-language commands bypass GM: NPC trust (`npc_registry`), map fog (`cartographyReveal`), world sim N steps (`world_state.json`).
- Start Hub **🔧 デバッグサンドボックス**; `debugScenarioCore.ts` + `debugScenarioRunnerCore.ts`.
- Guide: `sample-scenarios/debug-sandbox/DEBUG_SANDBOX.md`.

### Verification

- `npm run compile`
- `npm test` (all pass)

---

## 2026-07-02 JST - Grok - Debug bulk world simulation (World Time Passage A)

### Summary

- Implemented debug bulk advance for Emergent Simulation: Inspector UI + `textAdventure.debug.bulkWorldSim` (default off).
- `worldSimBulkCore.ts` loops `runSimulationStep` N times; GM turn count and FoW unchanged.
- Documented narrative time-passage ideas (rest / travel / long skip) in `docs/WORLD_TIME_PASSAGE_IDEA.md` (layer B = not implemented).

### Verification

- `npm run compile`
- `node scripts/test_world_sim_bulk_core.js`

---

## 2026-07-02 JST - Grok - Cartography C9 implementation (v1.16.0)

### Summary

- Implemented Claude design `docs/CARTOGRAPHY_C9_DESIGN.md` (PR1+2+3): `cartographyReveal` channel, rumorKnown merge, map items UX, gated GM prompt, agentic passthrough.
- Version **1.16.0** (Cartography feature minor bump, same rationale as C8 → 1.15).

### Verification

- `npm run compile`
- `node scripts/test_cartography_reveal_core.js`

---

## 2026-07-02 JST - Grok - Next roadmap (Fable5 + Living World + Ver policy)

### Summary

- `docs/FABLE5_FEATURE_PROPOSALS_DESIGN.md` (F1–F6) — design only, no version bump.
- `AI_ROADMAP.md` — 3 tracks: Fable5 (implement first F1→F2), Living World (LW-W1→LW1→LW2), polish.
- `docs/PHASE_NAMING.md` — LW + Fable5 axes; design ≠ version bump; F1+F2 ship → **1.19.0**.

---

## 2026-07-02 JST - Grok - Commerce & NPC Agency brief (LW1/LW2)

### Summary

- Added `docs/COMMERCE_AND_AGENCY_BRIEF.md` — trade/transport + ~10 named moving NPCs, `game_rules` ON/OFF, reusable `*Core.ts` + JSON contracts.
- `AI_ROADMAP.md` — next major tract when LoreRelay core feels complete.

---

## 2026-07-02 JST - Grok - Debug v2 + Layer B time passage (v1.18.0)

### Summary

- Debug sandbox commands: HP, location, romance/fear, map items, narrative rest/travel.
- Inspector **Debug Console** unifies bulk sim + sandbox quick-insert chips.
- `turn_result.elapsedWorldTurns` for GM-driven world time passage (Layer B v1).

### Verification

- `npm run compile`
- `npm test`

---

## Current Snapshot (2026-07-02) — 旧・参照用

> 最新はファイル先頭の **Current Snapshot (2026-07-03)** を正とする。

---

## 2026-07-02 JST - Gemini - Cartography C8 implementation review PASS

### Summary

- Cartography **C8**（FoW & Living Map, PR1〜6, v1.15.0–1.15.2）の実装レビューを完了。
- 設計正本 `docs/CARTOGRAPHY_PHASE8_DESIGN.md` とコミット `c8432b8`〜`28463c3` を照合。
- **総合判定: PASS** — 不変条件 6 項目すべてクリア。PR1〜6 チェックリストすべて合格。
- 次フェーズ（C9 設計）へ進行して問題なし、と Gemini が結論。

### Files touched

- `docs/CARTOGRAPHY_C8_REVIEW_GEMINI.md`（本レビュー報告書・新規）

### Decisions

- C8 実装はマージ済み状態でクローズ。追加コード修正はレビュー起因では不要。

### Remaining / Next

- Claude に `docs/CARTOGRAPHY_C9_BRIEF.md` を渡して C9 設計 doc を起こす。
- 案 B（allowlist 拡張）採用時は ChatGPT セキュリティレビューをゲートにする。

### Verification

- Gemini コードベース照合（設計 doc §3–§5, §7 PR Plan, 不変条件）。自動 `npm test` の再実行は本エントリでは未記載。

---

## 2026-07-02 JST - Codex - Maintenance hardening v1.14.5

### Summary

- Added per-test timeouts to `scripts/run_all_tests.js` and marked remote-play smoke tests with longer limits.
- Added `test_webview_world_modules.js` to catch World tab / Tile Overmap bundle and DOM regressions before manual UI testing.
- Split CI into `validate-and-smoke` and `coverage` jobs so the unit suite is not run twice.
- Added tag-based release workflow for packaging and attaching the VSIX.
- Expanded Turn Inspector Prompt Budget output with per-section used/limit character details.

### Verification

- `npm run compile` passed.
- `npm run test:validate` passed.
- `npm run test:smoke` passed.
- `npm run test:unit` passed.
- `npm run test:coverage` passed (92.15% lines/statements, 74.54% branches, 97.77% functions).

---

## 2026-07-02 JST - Codex - Prompt Budget / token compression controls

### Summary

- Added configurable GM prompt budgeting via `textAdventure.promptBudget.mode` (`auto`, `compact`, `balanced`, `expanded`) and `textAdventure.promptBudget.maxTokens`.
- The builder now caps Story Summary, Saga Archive, Memory Bank matches, Lorebook entries, Party/SillyTavern card fields, dynamic profiles, World State summaries, NPC awareness, and Vision context before injecting them into GM prompts.
- Turn Inspector now reports the active budget mode and target token budget alongside estimated injected tokens.
- Updated the external `C:\AI\TextAdventureGMSkill\SKILL.md` with file-reading discipline: do not read `state_journal.ndjson` or full verbatim archives during normal play.

### Verification

- `npm run compile` passed.
- `node scripts/test_gm_prompt_builder_core.js` passed.
- `node scripts/check_i18n_keys.js` passed.

---

## 2026-07-02 JST - Claude (Fable 5) - Feature: Genre theme reskins + Region hazards — released as v1.14.0

### Summary

v1.13.0 Tile Overmap の続き。ユーザー要望「ジャンル別の特殊地形（放射能汚染地域・スラム等）が欲しい、他の世界観も追加してよい」に対し、「テーマ別リスキン（表示のみ）」と「ハザード属性（データはリージョンあたり1単語）」の2層で実装。

1. **テーマリスキン（85-world.js）** — `TILE_OVERMAP_THEME_OVERRIDES`: cyberpunk / postapoc / zombie / scifi / steampunk / horror(cosmic) / oriental / modern の8キー。`resolveOvermapThemeKey()` が `meta.theme` 自由文字列をキーワードマッチで解決（羊皮紙の `resolveCartographyThemeStyle` と同方式・実装は別物なので両方触る時は注意）。部分オーバーライドで未定義バイオームはベーステーブルにフォールバック。
2. **`Region.hazard`（worldForgeCore.ts）** — 8種（radiation/toxic/infested/quarantine/anomaly/haunted/storm/corrupted）、`VALID_REGION_HAZARDS` で検証し不正値は黙って破棄。cartographyLayoutCore が layout spec にパススルー、tileOvermapCore が owner リージョン追跡つきで散布密度 14% のマーカータイル（`hazards` 配列）を決定論生成。海岸線上書きタイル（owner=-1）には乗らない。
3. **Generator 新テーマ6種（worldForgeGeneratorCore.ts）** — post-apocalyptic / zombie-apocalypse / scifi / steampunk / cosmic-horror / oriental-fantasy の名前テーブル・ロア・型ウェイト・バイオームマップ、`HAZARD_RULES_BY_THEME` によるテーマ×バイオーム条件の確率散布（rng 消費順が変わるので旧バージョンと同シードでも出力は変わる — 意図的）。ハザード付きリージョンは dangerLevel 底上げ。
4. **羊皮紙テーマスタイル** — cartographyThemeStyles.json に steampunk / cosmic / oriental 追加。**重要**: ルールは先勝ちで、`cosmic-horror` は `horror`（zombie ルール）にもマッチするため cosmic ルールを zombie より前に配置してある。`test_cartography_theme_styles_sync.py` はルールをインデックスで参照しているので、ルール追加時は必ずこのテストのインデックスも更新すること（今回1敗してから直した）。

### Verification

- `npm run compile` passed。full `npm test` passed（exit 0。初回は theme_styles_sync のインデックスずれで3件fail → テスト更新後に全通過）。
- 拡張テスト: tile overmap core（hazard 散布の決定論・owner整合・非ハザードリージョン無汚染）、world forge（hazard parse 正常/欠落/不正値）、generator（新テーマ6種の valid/biome/hazard 妥当性・決定論）。
- 未確認: 実機での見た目（各テーマのタイル配色・ハザードマーカーの視認性）。

### Next

- 実機確認（特に cyberpunk のネオン配色と ☢/☠ マーカーの視認性、セルが小さい時の潰れ）。
- 検討中アイデア（AI_ROADMAP.md Phase 12）: 現在地リージョンに hazard がある時だけ GM prompt に1行注入（数トークン）。着手前にユーザーへ相談推奨。

---

## 2026-07-02 JST - Claude (Fable 5) - Feature: Tile Overmap (roguelike map mode) — released as v1.13.0

### Summary

ユーザー要望「DF/CDDA 風のタイルマップを World タブに」を実装。設計原則は 2 つ: (1) **GM に読ませるデータを 1 バイトも増やさない** — タイルグリッドは `src/tileOvermapCore.ts` が worldSeed + `buildCartographyLayoutSpec()` のリージョンレイアウトからノイズ付き Voronoi で決定論的に導出する表示専用レイヤーで、`game_state.json` にも GM プロンプトにも一切入らない。(2) **将来の画像タイルセット対応**（ユーザー明示要望）— 15 種の単一文字バイオームコードを安定タイル ID 語彙として定義し、webview 側は `TILE_OVERMAP_ASCII_THEME` テーブル + `drawOvermapTile()` に描画を隔離してあるので、CDDA `tile_config.json` 方式（コード → スプライトアトラス）への移行はこの 2 箇所の差し替えで済む。

変更点: `src/tileOvermapCore.ts`（新規・純関数・メモ化）、`worldView.ts`（`tileOvermap` を worldView message に追加）、`webview/index.html` + `webview/modules/85-world.js`（第3マップモード「タイル」、Canvas ASCII レンダラー、街道 = `connectedTo` エッジの Bresenham、ピン/現在地 @/リージョンラベルは羊皮紙マップの percent 座標を再利用、リサイズ対応）、i18n 4ロケール、`scripts/test_tile_overmap_core.js`（npm test 組み込み）、version 1.13.0。

注意点: 海岸線ノイズは sea/coast リージョンを持つ世界のみ適用（ダンジョン世界に海が出ないように）。空リージョンでは 'o' 一色の fallback グリッドを返す（Cartography の Voronoi 空リージョン IndexError とは独立で、こちらはクラッシュしない）。

### Verification

- `npm run compile`（build:webview + tsc）passed。
- `node scripts/test_tile_overmap_core.js`（12 assertions: 決定論・コード妥当性・sea カバレッジ・道路 dedup/bounds・内陸世界の海なし・空世界 fallback）passed。
- `check_i18n_keys.js`（4 locales missing 0）/ `validate_webview_html_structure.js` / `test_webview_bundle.js` passed。
- full `npm test` passed（exit 0）。
- 未確認: 実機での見た目（Extension Host で World タブ → タイルモード切替）。

### Next

- 実機で見た目確認（グリフサイズ・ラベル重なり・現在地ピン）。
- 将来候補（AI_ROADMAP.md Phase 12 に記載）: 画像タイルセットローダー、visited ベースの fog of war。ローカル戦術マップは GM 連携設計が必要なので着手前に設計相談を。

---

## 2026-07-02 JST - Codex - Release v1.11.2 input persistence / first-session fixes

### Summary

- Promoted `[Unreleased]` fixes to `v1.11.2`.
- Updated `package.json` / `package-lock.json` / README badge to `1.11.2`.
- Release scope includes first-session demo/help polish, multiline input, player input persistence, matching optimistic/persisted player entry IDs, status array normalization, and localized installer BAT wrapper fixes.

### Verification

- `npm run compile` passed.
- `npm test` passed.
- `npx vsce package --out lorerelay-1.11.2.vsix` succeeded.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: duplicate player message render caused by mismatched entry ids

### Summary

**Important context first**: the user's install script had been building from `C:\AI\LoreRelay` (a stale, disconnected clone, 12 commits behind, still at v1.11.0) instead of `C:\AI\text-adventure-vsce` (this repo, the actual canonical source per `AI_HANDOVER.md`) for most of today's session — confirmed independently by Grok and ChatGPT when the user asked them to check. That explains a lot of the earlier "I fixed it but it's still broken" back-and-forth in this log. User declined to delete the stale `C:\AI\LoreRelay` for now (rename was suggested as a safer alternative by ChatGPT) — nothing done there yet, awaiting the user's call.

With the *actual* current build installed, the duplicate-player-message bug still reproduced, but with a new, precise detail from the user: after closing and restarting, the log always shows only *one* copy — so it's a live-session rendering duplicate, not an actual double-write to disk.

Root cause: `sendFreeInput()` (and the Options-button handler, and `sendDiceResultToGm()`) optimistically render the player's message immediately with a client-generated `id: user-${Date.now()}`. Once `persistPlayerInputEntry()` (a few entries below) started actually writing that message to `game_state.json`, the extension was minting its *own separate* `user-${Date.now()}` id for the same logical entry. `applyGameState()`'s dedup logic in `10-game-state.js` (`const existingIds = new Set(messageHistory.map(m => m.id)); ... if (!existingIds.has(entry.id)) { push + render }`) checks by id — since the ids never matched, the incremental `gameStateUpdate` that later arrived with the persisted entry looked "new" to the client and got rendered a second time. This bug was *latent* until the persistence fix above started actually sending the player's entry back through this path at all.

Fix: webview now generates the `entryId` up front and includes it on the `freeInput`/`selectOption` postMessage; `handlePlayerInput()`/`persistPlayerInputEntry()` (both `extension.ts`) now accept and reuse that id (validated via `isValidEntryId`) instead of generating a fresh one, so the later `gameStateUpdate` correctly recognizes it as already-rendered. Applied consistently across all three client-side optimistic-render call sites (`sendFreeInput`, the Options-button click handler, `sendDiceResultToGm`). The one non-webview call path (`notifyEquipment` → synthetic "System: [Equipment changed]..." text) has no matching optimistic render, so it was left generating its own id as before — nothing to deduplicate there.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing), `node scripts/validate_webview_html_structure.js`, full `npm test` — all passed.
- Not replayed live — diagnosis followed directly from reading `applyGameState()`'s dedup logic once the user's "only one copy survives a restart" detail pointed at a client-side rendering issue rather than a persistence one.

### Next

- User to confirm, from the correct `C:\AI\text-adventure-vsce` build this time, that a normal send/select/dice-roll no longer double-renders even without restarting.
- Decide what to do with the stale `C:\AI\LoreRelay` clone (rename vs. sync vs. leave alone) — not touched yet.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: player messages after turn 1 never persisted to disk

### Summary

User caught this from a screenshot pair: their free-text reply ("メタルマックスやメタルサーガみたいな...") showed up correctly in the live chat right after sending, sandwiched between two GM turns — but after a reload, that same message was gone entirely from the log, while both surrounding GM turns were still there. Their own diagnosis was spot on: "自分の発言がどのタイミングで何処に書かれたかが記録されてないっぽい" (seems like my own message isn't recorded anywhere).

Traced it to `extension.ts`'s `ensureInitialGameStateForPlayerInput()`:
```ts
function ensureInitialGameStateForPlayerInput(playerAction: string): void {
    const statePath = getGameStatePath();
    if (!statePath || fs.existsSync(statePath)) { return; }  // <-- only runs when the file doesn't exist yet!
    commitGameState({ entries: [{ role: 'user', content: playerAction, ... }], ... });
}
```
This was Codex's "bootstrap minimal `game_state.json`" fix from earlier today, scoped to *only* the very first turn of a brand-new workspace. But it's the *only* place in the codebase that ever writes a player's chat entry to `game_state.json` — `mergeGmEntryFromTurn()` (`statePatch.ts`) only ever appends the GM's `role: 'gm'` entry, never a `role: 'user'` one. So from turn 2 onward, the player's message was **never durably persisted anywhere** — only ever rendered client-side in the webview (`sendFreeInput()`'s `messageHistory.push()` + `renderMessage()`), backed only by `vscode.setState()`, which gets fully overwritten the moment the authoritative `game_state.json` gets re-applied (reload, or any other `sendCurrentState()` trigger). Confirmed the in-memory `gameEntryHistory` in `gameStateSync.ts` has the same gap — it's only ever populated by re-reading the file, never by a live player-input event.

Fix: renamed to `persistPlayerInputEntry()`. It now *always* reads the current `game_state.json` (or starts a minimal one if it truly doesn't exist yet), appends the player's `role: 'user'` entry, and calls `commitGameState()` — every single turn, not just the first — before the GM bridge is invoked. Matches Persist-Before-Narrate for both halves of a turn.

### Verification

- `npx tsc --noEmit` and full `npm test` passed.
- Not replayed live (no VS Code session here) — diagnosis was from the user's own screenshots plus reading the actual persistence code path, not a live repro.

### Next

- User to confirm: send several turns in a row, reload the window, and verify every player message survives (not just GM replies).
- Separately, the user also reported Shift+Enter still sending instead of inserting a newline after installing the Ctrl+Enter fix (`f423a67`) — the keydown handler in the built `webview/script.js` was re-verified correct (`e.key === 'Enter' && (e.ctrlKey || e.metaKey)`, so Shift+Enter alone shouldn't match), and no other `keydown` listener touches `#free-input`. Most likely still testing a build from before `f423a67`, given the install script (`install_vscode_extension.ps1`) requires a fresh `npm run compile` + reinstall to pick up any of these changes. Flagged back to the user to confirm rather than guessed at further without being able to reproduce.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Multi-line free input + Ctrl+Enter to send

### Summary

User feedback while testing the fixes above: the free-text input is an `<input type="text">`, which can never hold a newline regardless of keydown handling (a single-line `<input>` just doesn't support `\n`), and Enter always sent immediately — no way to write a multi-line message at all. Initially planned "Enter sends, Shift+Enter newlines" (the common chat-app convention), but the user pushed back: they'd rather have **Ctrl+Enter send** and plain **Enter (or Shift+Enter) insert a newline**, reasoning that people who just hit Enter out of habit expecting a newline shouldn't accidentally send, and the Send button is right there for a one-click send anyway.

Changes:
- `webview/index.html`: `#free-input` changed from `<input type="text">` to `<textarea rows="1">`. Verified every other usage of the `freeInput` JS variable across modules (`.value`, `.focus()`, `.setSelectionRange()`, `.disabled`, `.placeholder`, `.addEventListener('input', ...)`) — all supported identically by `<textarea>`, safe drop-in swap.
- `20-input-audio-prep.js`: keydown handler now checks `e.ctrlKey || e.metaKey` before sending (Cmd+Enter on Mac too); plain/Shift+Enter falls through to the textarea's normal newline insertion.
- `00-core.js`: added `autoGrowFreeInput()` (resize height to `scrollHeight`, capped by CSS `max-height` which then scrolls). Wired to the `input` event, and called manually at every other place across `10-game-state.js`/`20-input-audio-prep.js`/`90-bootstrap.js` that sets `freeInput.value` directly (STT transcript, image-flag template, Start Hub interview template, restored draft state, clear-on-send) since programmatic `.value` assignment doesn't fire `input`.
- `styles/20-quickreply-messages.css`: `#input-area` gets `align-items: flex-end` so the buttons stay bottom-aligned as the textarea grows; `#free-input` gets `resize: none; overflow-y: auto; max-height: 140px; line-height: 1.4`.
- `webview.input.placeholder` updated in all 4 locales to mention Ctrl+Enter.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing), `node scripts/validate_webview_html_structure.js`, full `npm test` — all passed.

### Next

- User to confirm multi-line typing + auto-grow looks right, and Ctrl+Enter/Cmd+Enter sends as expected, in a real session.

---

## 2026-07-02 JST - Grok - First session polish (A) + TTS/character help (B)

### Summary

- **Start Hub:** `🎮 お試しデモ` → bundled `harbor-mist`; `🗺️ 地図デモ` → `lost-catacombs`. `loadBundledSampleScenario()` + `scenarioPackCore.ts`.
- **Docs:** `docs/FIRST_SESSION.md`, `docs/TTS_QUICKSTART.md`; README / DEMO.md updated.
- **Inline help:** TTS menu + Character tab (party vs active, delete image scope).

### Next

- Manual `testing_checklist.md` §0; install + Reload; play harbor-mist demo end-to-end.

---

## 2026-07-02 JST - Codex - Localized installer BAT wrapper fix

### Summary

- `install_vscode_extension_ja.bat` failed under `cmd.exe` with mojibake and stray commands such as `'-NoProfile' is not recognized`.
- Root cause was localized wrapper `echo` text inside parenthesized batch blocks interacting badly with cmd encoding/parsing.
- Replaced wrapper messages in `install_vscode_extension_ja.bat`, `install_vscode_extension_zh-CN.bat`, and `install_vscode_extension_zh-TW.bat` with ASCII-only text while preserving `-Language ja/zh-CN/zh-TW` for the PowerShell installer.

### Verification

- `cmd /c "install_vscode_extension_ja.bat < NUL"` completed successfully and installed `lorerelay-1.11.1.vsix`.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: schema violation silently dropping GM turns

### Summary

Continuing the same debugging thread as the two entries below (with the user, live, in `g:\AI\LoreRelayWorlds\PostApocalypse`). After the `turn_result.json` recovery fix, the GM turn started merging correctly — but the user then hit a new visible error toast: `extension.error.gameStateLoad (Schema Violation)`, and the duplicate-player-message symptom reappeared (same visual pattern as before: second message appears *after* the "GM がターンを処理中..." placeholder).

Investigated the schema violation: compared the two `turn_result.json` files seen earlier in this thread. The first (failed) one had `statePatch` replacing `/status` wholesale with `condition: "—"` and `inventory: "—"` (plain strings). The second (succeeded) one had `status.condition: ["世界構築フェーズ"]` (array). `validateGameState.ts` requires `condition`/`inventory`/`skills` to be arrays when present (`errors.push('status.${arrField} must be an array')` if not) — and `processTurnResult()` rejects the *entire turn* on any schema violation (`return false` before `commitGameState`), so a single field-shape inconsistency from the LLM (string vs. array) silently ate the whole turn, matching exactly what the user hit.

Fix: added `normalizeStatusArrayFields()` in `statePatch.ts`, called in `processTurnResult()` right after `mergeGmEntryFromTurn()` and before `validateGameState()`. Wraps a lone string in `status.condition`/`inventory`/`skills` into a single-element array (or `[]` if blank/whitespace), rather than rejecting the turn outright. This is a lenient-acceptance fix, not a prompt fix — the underlying Text Adventure GM Skill (outside this repo) could also be made more explicit about the array requirement, but wasn't touched here.

Also noted: the duplicate-player-message symptom looked *exactly* like the pre-fix behavior from the entry two below (`43bd071`, immediate client-side lock on send) — asked the user directly whether they're testing via a rebuilt/reinstalled build or possibly still on a stale one, since `git log` shows they'd already cut a `release: v1.11.1` version-bump commit themselves at 01:39 (metadata-only: `CHANGELOG.md`/`package.json`/`README.md`, no `webview/script.js` or `src/*.ts` changes) around the same time as their testing — worth confirming whether their install/test loop is picking up source changes made *after* that release commit.

### Verification

- `npx tsc --noEmit` and full `npm test` passed.
- Could not reproduce the exact live failure again — the workspace folder was empty by the time this was investigated (user likely wiped it to restart clean). Diagnosis based on comparing the two `turn_result.json` snapshots captured earlier in this same conversation.

### Next

- Confirm with the user whether their build/install loop was actually up to date when the duplicate-send symptom reappeared.
- If schema violations recur with a different shape mismatch, extend `normalizeStatusArrayFields()` or consider making `validateGameState()`'s status-field checks more broadly lenient (coerce rather than reject) for LLM-authored content specifically.

---

## 2026-07-02 JST - Codex - Release v1.11.1 Webview / onboarding fixes

### Summary

- Promoted `[Unreleased]` fixes to `v1.11.1`.
- Updated `package.json` / `package-lock.json` / README badge to `1.11.1`.
- Built `lorerelay-1.11.1.vsix`.

### Verification

- `npm run compile` passed.
- `npm test` passed.
- `npx vsce package --out lorerelay-1.11.1.vsix` succeeded.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: duplicate player message race on send

### Summary

Follow-up after the `turn_result.json` recovery fix below — that one worked (the same reproduction now shows the GM turn correctly merged and rendered with option buttons), but the user still saw the player's message duplicated in the chat log, with the second copy appearing *after* the "GM がターンを処理中..." loading placeholder.

Root cause: `showGmLoading()` (`20-input-audio-prep.js`) — which sets `freeInput.disabled = true` / `sendBtn.disabled = true` — only runs when the webview receives the extension's `gmStart` postMessage, which is a round trip (webview → extension → back) after `handlePlayerInput()` starts processing. `isInputLocked()` (`10-game-state.js`) only checks `gameOverActive`, not "GM currently processing." So there's a real window between "user sends" and "input visibly locks" where a fast second Enter-press or Send click (impatient retry, or literally just fast typing) goes through and resends, since by the time it's disabled the first send has already round-tripped partway.

Fix: `sendFreeInput()` and the Options-button click handler (`renderOptions()` in `10-game-state.js`) now call `showGmLoading()` immediately, client-side, right after `vscode.postMessage(...)`, instead of waiting for `gmStart` to come back. `showGmLoading()` is idempotent (`if (document.getElementById('gm-loading')) return;`), so it's safe to still also be triggered by the later `gmStart` message. Also added a defensive `|| sendBtn.disabled` / `|| btn.disabled` to both guard checks as a second layer.

Also answered two side questions from the user: (1) a `tool_error: tool_output_error` from grok's own internal "Read" tool call appeared in the Output channel on a truly empty first-turn folder but self-recovered (exit code 0, valid `turn_result.json` still produced) — this looks like it's inside the Text Adventure GM Skill's own tool-use loop (reading a file that doesn't exist yet in a brand-new folder), not the extension's TS code, so left uninvestigated for now; (2) the "Enable Git Timeline for this workspace?" modal is the existing one-time `gitManager.ts` consent prompt (Phase 10 feature) — explained what it does, that it's optional, and left the decision to the user.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing), `node scripts/validate_webview_html_structure.js`, full `npm test` — all passed.

### Next

- User to confirm sending quickly (fast Enter-mashing, rapid option clicks) no longer duplicates.
- If the internal grok "Read" tool_output_error recurs or actually breaks something (rather than self-recovering), investigate the Text Adventure GM Skill's file-read assumptions for brand-new empty workspaces — that's outside this VS Code extension repo.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: GM turn_result.json silently never applied (fresh workspace first turn)

### Summary

User reported (in `g:\AI\LoreRelayWorlds\PostApocalypse`, a brand-new empty world): sent the "Build via Q&A" interview kickoff message, the grok CLI GM bridge ran successfully (exit code 0, full narrative + clarifying questions visible in the "LoreRelay: GM Bridge" Output channel), but nothing appeared in the chat log — and the player's message ended up duplicated (almost certainly because the user resent it after seeing no response, not a separate bug: `sendFreeInput()`'s listeners are registered exactly once, confirmed via grep).

This is exactly the scenario Codex flagged as unverified in its "Next" note two entries below ("Retest `G:\...\PostApocalypse` after reloading the Extension Host... delete stale `turn_result.json` if present"). Inspected the actual workspace files directly:
- `turn_result.json` (3.4KB, valid JSON, `turnId: "turn-1"`, full `narration` matching the Output channel text, a 3-op `statePatch`) — mtime **after** `game_state.json`.
- `game_state.json` / `game_history.json` / `last_good_game_state.json` all identical: just the single `user` role entry, no `gm` entry, `options: []` (not the patched values) — proving `turn_result.json` was written correctly but **never actually processed**.
- No `game_state.invalid.latest.json` salvage file, ruling out a schema-validation rejection.

Root cause: `gameStateSync.ts`'s `turn_result.json` `FileSystemWatcher` relies on `onDidCreate`, which doesn't reliably fire for a file's very first creation in a directory (more failure-prone than `onDidChange` on subsequent writes) — and this is precisely the first-ever `turn_result.json` write in a brand-new workspace. `turnResultFallback.ts`'s `finishGmRun()` already had a 250ms-after-close fallback, but it only handled "GM edited `game_state.json` directly instead of writing `turn_result.json`" (`synthesizeTurnResultIfNeeded`) — there was no fallback for "wrote `turn_result.json` correctly, watcher just didn't fire."

Fix:
- `gameStateSync.ts`: extracted the watcher's read-hash-dedupe-process-postMessage logic into `processTurnResultFileAt()` (async, returns whether it processed something new) and exported `checkPendingTurnResultFile()` on top of it.
- `turnResultFallback.ts`: added `initTurnResultFallback(checkFn)` (dependency injection — avoids a circular import, since `gameStateSync.ts` already imports `markTurnResultHandled` from here). `finishGmRun()` now awaits `checkPendingTurnResultFile()` first; only falls back to the old `game_state.json`-diff synthesis if that found nothing.
- `extension.ts`: wires `initTurnResultFallback(checkPendingTurnResultFile)` alongside the existing `initGmBridgeRunner` call.
- `gameStateSync.ts`'s `startGameStateWatcher()` also now sweeps once for a leftover unprocessed `turn_result.json` on startup — so the user's *currently* stuck turn should self-heal on the next "Reload Window" once this fix is compiled in, no manual file surgery needed.

### Verification

- `npx tsc --noEmit` and full `npm test` both passed.
- Could not reproduce live (no VS Code Extension Host access from here) — inspected the user's actual on-disk files directly instead to confirm the diagnosis empirically.

### Next

- User should recompile/reload and confirm: (1) the stuck turn now appears after a reload, (2) a *fresh* first turn in a new empty workspace now shows the GM response without needing a retry.
- If this recurs even after the fix, next suspect would be `processTurnResult()` itself throwing past the retry's hash-dedupe guard (was ruled out here since `game_state.invalid.latest.json` didn't exist and `processTurnResult` already catches its own errors and returns `false` rather than throwing — but worth re-checking if a new failure mode shows up).

---

## 2026-07-02 JST - Claude (Sonnet 5) - Audit + fix remaining webview confirm()/prompt()/alert() calls

### Summary

Follow-up to the delete-character confirm fix below (same root cause: VS Code webview iframes lack `allow-modals`, so `confirm()`/`prompt()`/`alert()` are silently ignored — they return falsy/undefined immediately with no UI, so code guarded by them just does nothing). Per the user's request, audited every remaining call site (`grep -rn "confirm(\|prompt(\|alert("` across `webview/modules/`) and fixed each:

- **Rewind to turn** — 🔱 per-message action (`10-game-state.js`, sends `branchFromEntry`) and the input-bar rewind button (`20-input-audio-prep.js`, sends `restoreToTurn`) both reach `handleRestoreToTurn` in the extension. Both now gate on a shared `confirmDestructive()` helper added to `webviewHandlers.ts` (native `vscode.window.showWarningMessage({ modal: true })`), removing the broken webview `confirm()` from the first and adding the same guard to the second (which previously had no confirm attempt at all, silently inconsistent with the first).
- **Git Timeline branch creation** — ⎇ button in both `10-game-state.js` and the Inspector panel (`80-inspector.js`) send `branchTimeline`; confirmation is now centralized in the `branchTimeline` case in `webviewHandlers.ts`, fixing both call sites at once.
- **Checkpoint label** — both the input-bar and quick-reply "save checkpoint" buttons used `window.prompt()` for an optional label, always silently ignored (label always ended up blank/auto-generated `Turn N` — `saveCheckpointFile()` already had that fallback, so saves "worked" but custom naming silently never did). Replaced with `vscode.window.showInputBox()` in the `saveCheckpoint` case.
- **Lorebook entry delete** — this one is purely client-side draft state (not persisted until the explicit Save button), so instead of a round trip to the extension host, added a small reusable `webviewConfirm(message, label): Promise<boolean>` in `00-core.js` (in-page modal, styled via new `.wv-confirm-*` classes in `00-base.css`) and used it here.
- **Lorebook save-failure `alert()`** — removed; `handleSaveLorebook()` in `extension.ts` already calls `vscode.window.showErrorMessage()` with the same error detail, so the webview alert was both broken and redundant.
- **Quickstart empty-prompt `alert()`** (`05-quickstart.js`) — replaced with an inline `.invalid` state on the textarea (red border + focus) instead of a popup; new `.cc-input.invalid`/`.cc-textarea.invalid` style in `95-character-creator.css`.

New i18n keys added (4 locales): `webview.confirm.cancel`, `webview.confirm.ok`, `webview.lorebook.deleteConfirmBtn`, `extension.confirm.rewind(Button)`, `extension.confirm.gitBranch(Button)`, `extension.prompt.checkpointLabel(Placeholder)`. Removed now-unused `webview.msg.rewindConfirm`, `webview.msg.gitBranchConfirm`, `webview.checkpoint.savePrompt`.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing), `node scripts/validate_webview_html_structure.js`, full `npm test` — all passed.
- Still not manually played in a live VS Code session. Someone should verify: rewind/branch/checkpoint-label modals actually appear and behave correctly, lorebook delete's in-page confirm works, and quickstart's empty-field state is visible.

### Next

- Manual in-app verification of all five fixes above in a real VS Code session.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Fix: delete-character confirm dialog never appeared

### Summary

Follow-up to the same-day Character Creator i18n + delete fix below. User reported: clicking 🗑 Delete in the Character Profile pane did nothing — no confirmation popup, no deletion.

Root cause: the click handler used the webview's `window.confirm()`. VS Code webviews render content inside a sandboxed iframe that is **not** granted `allow-modals`, so `confirm()`/`alert()`/`prompt()` are silently no-ops there — the call returns falsy immediately with no UI shown, and `if (!confirm(...)) return;` bailed out every time. This is a general VS Code webview limitation, not specific to this feature; other `confirm()` calls already in this codebase (rewind-to-turn, git branch creation, lorebook delete in `webview/modules/*.js`) are likely affected the same way but hadn't been reported yet — worth checking during a future pass.

Fix: moved the confirmation off the webview entirely. `webview/modules/50-character-saga.js`'s delete handler now just posts `{ type: 'deleteCharacter', id, name }` directly (no `confirm()`). `webviewHandlers.ts`'s `deleteCharacter` case now shows a native `vscode.window.showWarningMessage(msg, { modal: true }, 'Delete')` and only calls `deps.deleteCharacter(id)` if the user picks the Delete button — this matches the existing modal-confirm pattern already used in `gitManager.ts` (Git Timeline init consent), `extension.ts`, and `scenarioPack.ts`. Added `extension.confirm.deleteCharacter` / `extension.confirm.deleteCharacterButton` i18n keys (4 locales) and removed the now-unused `webview.character.deleteConfirm` key.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing), full `npm test` all passed.
- Still not manually played in a live VS Code session — user should confirm the native modal now appears and deletion actually happens end-to-end.

### Next

- Consider auditing the other `confirm()` calls in webview modules (rewind, git branch, lorebook delete) for the same silent-no-op issue and moving them to extension-host modal dialogs too.

---

## 2026-07-02 JST - Claude (Sonnet 5) - Character Creator i18n + delete character

### Summary

User reported two issues in the Full Character Editor ("✏️ Full Editor" modal, opened from the Character Profile pane): switching the app locale to Japanese left the whole editor in English, and there was no way to delete a character at all.

Investigated and confirmed both:
- `webview/index.html`'s `#char-creator-modal` block (~170 lines) had zero `data-i18n`/`data-i18n-placeholder`/`data-i18n-title` attributes, and `webview/modules/52-character-creator.js` built several dynamic strings (default sprite-expression labels, sprite action tooltips, the "— New Character" subtitle, the add-custom-expression mini-form, the world-adaptation draft's "(no change)" fallback) as raw JS literals — none of it wired into the `T()` i18n system used everywhere else in the webview.
- There was no delete-character code path anywhere: no button, no `deleteCharacter` postMessage type, no backend function. `characterManager.ts` only had create/save/set-active/party add-remove.

Fixed:
- Added ~90 new `webview.characterCreator.*` i18n keys (plus a few `webview.character.*` ones for the compact panel) across all 4 locale files (en/ja/zh-TW/zh-CN), matching the existing tone/style of each locale's other `webview.character.*` entries.
- Retrofitted `index.html`'s full editor markup with `data-i18n`/`-placeholder`/`-title` attributes (simplified the portrait drop-zone hint from a `<br>`-containing string to one line, since `applyI18n()` sets `textContent` and can't render HTML tags) and switched `52-character-creator.js`'s dynamic strings to `T()` calls.
- Added a 🗑 Delete button next to Save in the compact Character Profile pane (disabled when "-- New Character --" is selected), guarded by a `confirm()` dialog. Wired `deleteCharacter(id)` in `characterManager.ts` — removes the character JSON, any portrait/expression image files it references (path-validated to stay inside `characters/`), clears `active_character.txt` if it pointed at the deleted id, and calls the existing `removeFromParty()` — through `webviewHandlers.ts` (`deleteCharacter` case, mirrors the `deleteCheckpoint` pattern) and `extension.ts` wiring.

### Verification

- `npm run build:webview`, `npx tsc --noEmit`, `node scripts/check_i18n_keys.js` (0 missing across all 4 locales), `node scripts/validate_webview_html_structure.js`, and the full `npm test` all passed.
- Not manually played in a live VS Code Extension Host session (no interactive environment here) — someone should confirm in-app that the Full Editor now renders in Japanese/zh-TW/zh-CN and that deleting a character actually removes its files and updates the character dropdown.

### Next

- Manual in-app verification of both fixes (locale switch + delete flow) in a real VS Code session.

---

## 2026-07-02 JST - Codex - Empty world onboarding / active character leak fix

### Summary

- Fixed first-turn onboarding in an empty workspace: `handlePlayerInput()` now creates a minimal `game_state.json` before invoking the GM bridge when no state file exists yet.
- `processTurnResult()` can now merge a `turn_result.json` even if `game_state.json` is absent, using a minimal schema-current state as the merge base.
- Imported/active character cards no longer auto-enter GM party context. `getPartyMemberIds()` and `buildPartyPromptContext()` now use explicit party membership only, preventing test ST cards such as `クロノ` from being treated as the protagonist/companion.
- GM prompt locale strings now explicitly require `turn_result.json` as UTF-8 JSON and warn Windows PowerShell users to use `-Encoding utf8`.
- Local GM skill copy updated at `C:\AI\TextAdventureGMSkill\SKILL.md` with the same UTF-8 warning; this file is outside the VS Code extension Git repo.

### Verification

- `npm run compile` passed.
- `npm test` passed.

### Next

- Retest `G:\AI\LoreRelayWorlds\PostApocalypse` after reloading the Extension Host. If an old mojibake `turn_result.json` remains, delete it once before retrying so the watcher does not keep seeing stale invalid output.

---

## 2026-07-01 JST - Grok - Release v1.11.0 Adaptive TTS

### Summary

- `[Unreleased]` → **v1.11.0**（Phase 11A/11B + ChatGPT review fixes）。
- `package.json` / `package-lock.json` / README バッジ → `1.11.0`。
- `AI_ROADMAP.md` Phase 11 を v1.11.0 完了に更新。`AI_HANDOVER.md` / `AI_COLLABORATION.md` バージョン表記更新。
- `install_vscode_extension.ps1` で `lorerelay-1.11.0.vsix` ビルド・インストール。
- `edge-tts` 導入 + `tts_local.py` スモークテスト OK（16KB MP3 生成）。

### Verification

- `npm run compile` / `npm test` passed
- Local TTS subprocess smoke: `tts_local.py` + edge-tts
- §7–8 UI 項目（World Preview / 📢 / OpenAI）はエディタ実機で要確認

### Next

- git tag `v1.11.0` + GitHub Release（VSIX 添付）
- ユーザー: `testing_checklist.md` §7–8 実機チェック

---

## 2026-07-01 JST - Grok - ChatGPT Phase 11 review fixes

### Summary

- **High:** `61-tts-npc.js` — `playBridgeAudio(msg, plan)` retains fallback plan until handlers are wired; delete pending entry after setup.
- **Medium:** `ttsBridgeRunner.ts` — `tts.local.timeoutMs` (default 30s) kills subprocess; OpenAI fetch `AbortController`; temp MP3 `safeUnlink` after read/failure.
- **Medium:** `npcVoiceCore.ts` — `sanitizeVoiceId` regex `/[\\/]|[\x00-\x1f\x7f]/`; tests for newline/tab rejection.
- **Low:** TTS logs → `chars=N voice=…` only; `phase8_planning_and_prompts.md` privacy bullet updated.

### Next

- Manual `testing_checklist.md` §7–8; v1.11.0 tag when checklist passes.

---

## 2026-07-01 JST - Grok - Phase 11B local/external TTS bridge

### Summary

- **Core:** `ttsBridgeCore.ts` (payload sanitize, path safety, OpenAI voice mapping).
- **Runner:** `ttsBridgeRunner.ts` — spawn `tts_local.py` (edge-tts) or OpenAI `/v1/audio/speech`; Webview `requestNpcTts` → `ttsAudioReady` base64 MP3.
- **Skill:** `TextAdventureGMSkill/scripts/tts_local.py`.
- **Schema:** `GameEntry.speakerNpcId`, `TurnGmEntryMeta.sender/speakerNpcId`, merge in `statePatch.ts`.
- **Settings/commands:** `tts.local.*`, `tts.external.provider/voice`, Set/Clear TTS API Key, Test Local TTS.
- **Tests:** `test_tts_bridge_core.js`, provider local fallback, state_patch speakerNpcId.

### Next

- Manual `testing_checklist.md` §7–8 (edge-tts + OpenAI).
- **ChatGPT:** copy-paste prompt in `phase8_planning_and_prompts.md` →「Copy-paste prompt for ChatGPT (Phase 11A+11B review)」

---

## 2026-07-01 JST - Grok - Code Comments rule + Phase 11 doc pass

### Summary

- Added **Code Comments** section to `AI_COLLABORATION.md` (Core headers, Webview mirror sync, JSDoc when ambiguous/fallback).
- Linked from `AI_HANDOVER.md` §4.
- Enriched Phase 11A sources: `npcVoiceCore.ts`, `ttsProviderCore.ts`, `61-tts-npc.js`, hooks in `npcRegistry.ts` / `worldView.ts`.

### Next

- New modules should follow `AI_COLLABORATION.md` § Code Comments on first commit.

---

## 2026-07-01 JST - Grok - Phase 11A NPC voice profiles + system TTS

### Summary

Implemented Phase 11A per Claude-reviewed `PHASE11_ADAPTIVE_TTS_DESIGN.md`:

- **Core:** `npcVoiceCore.ts` (parse/clamp/sanitize, mood modifiers), `ttsProviderCore.ts` (resolveTtsPlan, buildNpcTtsCatalog, findNpcVoiceForSender).
- **Registry:** optional `NpcEntry.voice`, parser hook in `npcRegistry.ts`, World view pushes `npcTtsCatalog` / `npcVoiceCount` / `ttsExternalEnabled`.
- **Webview:** `61-tts-npc.js` — `speakWithProfile`, `speakEntryText`, World Preview; module 60/10 wired to NPC-aware TTS.
- **Settings/i18n:** `textAdventure.tts.external.enabled` (default false), 4 locale keys for preview + voice count.
- **Tests:** `test_npc_voice_core.js`, `test_tts_provider_core.js`, voice round-trip in `test_npc_registry.js`.

11B (local Piper/edge-tts bridge, external API, `speakerNpcId`) remains deferred.

### Next

- Manual Phase 11A checklist in `testing_checklist.md` §7.
- ChatGPT review of Phase 11A prototype per design doc.
- Phase 11B when user wants local/external providers.

---

## 2026-07-01 JST - Claude (Sonnet 5) - Phase 11 schema/mood/UI review

### Summary

Completed the Claude review requested in `phase8_planning_and_prompts.md` (Phase 11 "Prompt for Claude"). Patched `PHASE11_ADAPTIVE_TTS_DESIGN.md` §5–7 only, no implementation:

- **§5 (schema/clamps):** confirmed `NpcVoiceProfile` fields; added concrete `clampVoiceRate/Volume/Pitch` pseudocode using `Number.isFinite` (not just `!isNaN`, to also reject `Infinity` — same class of gap flagged for `validateGameState.ts` HP/MP fields) and a `sanitizeVoiceId()` that **rejects** (not truncates) strings containing path separators/control chars. Firmed up `speakerNpcId` recommendation to **defer to 11B** with explicit reasons (turn_result schema risk, unreliable across clipboard/manual providers, small marginal win over sender-name matching).
- **§6 (mood table):** proposed a concrete `applyMoodModifiers()` numeric table for all 7 `NpcMood` values (excited/angry/fearful fastest+brightest, sad slowest+flattest, neutral no-op), additive deltas re-clamped after applying so `moodAdaptive` only nudges an explicit profile, never overrides it.
- **§7 (attribution + UI):** documented 3 edge cases — duplicate NPC names (prefer location match, else skip override rather than guess), GM self-narration/quoted dialogue (attribution stays entry-granularity only, no substring guessing inside prose), NPC renamed mid-campaign (accepted best-effort miss). Specified the World tab 🔊 Preview button DOM placement (`world-npc-info`, after the portrait button in `webview/modules/85-world.js`) and 3 new `webview.world.*` i18n keys for the 4 locale files, confirmed `T(key, vars)` already supports `{name}`-style interpolation (`webview/modules/00-core.js`).

No code changes — design doc only, per the prompt's "Do NOT implement yet" constraint. Phase 10 (also assigned to Claude in the same file) is already fully implemented per `AI_ROADMAP.md`; only the manual real-play branch-switch test remains outstanding there.

### Next

- Grok: Phase 11A implementation per updated `PHASE11_ADAPTIVE_TTS_DESIGN.md`.
- Someone with an interactive VS Code session: manual Phase 10 Git Timeline branch/switch playtest (still unconfirmed per roadmap).

---

## 2026-07-01 JST - Grok - Phase 11 Adaptive TTS design + AI prompts

### Summary

- Added `PHASE11_ADAPTIVE_TTS_DESIGN.md` — NPC voice profiles on `npc_registry.json`, `npcVoiceCore` / `ttsProviderCore`, system TTS first (Web Speech API), Phase 11A vs 11B split.
- Expanded `phase8_planning_and_prompts.md` with Claude (schema review), Grok (11A impl), ChatGPT (post-review) prompts.
- Updated `AI_ROADMAP.md` Phase 11 — design done, implementation pending.

### Next

- Claude: schema/mood modifier review per Phase 11 prompt (optional).
- Grok: Phase 11A implementation when user is ready.

---

## Current Snapshot (2026-07-01)

| Item | Value |
|------|-------|
| Package version | **1.11.0** (`package.json`, `CHANGELOG.md` [1.11.0]) |
| Latest release theme | **Adaptive TTS** — NPC voice profiles, edge-tts local bridge, OpenAI external |
| Phase status | 1–11 コア実装完了 |
| Next manual checks | `testing_checklist.md` §7–8（TTS 実機）、Agentic E2E、Git Timeline branch/switch |

---

## 2026-07-01 JST - Grok - Release v1.10.0 Campaign Engine

### Summary

- ChatGPT/Grok レビュー反映: `[Unreleased]` の Phase 8〜10 塊を **v1.10.0** に正式リリース分割。
- `package.json` / `package-lock.json` → `1.10.0`。README バッジ更新。
- `commitGameState` に **strict/salvage** モード（default salvage）。invalid 時は `game_state.invalid.latest.json` に退避。
- `test_state_manager.js` 追加。agentic 設定説明更新、`@types/vscode` → `^1.93.0`。
- `AI_HANDOVER.md` / `AI_ROADMAP.md` を v1.10.0 状態に更新。

### Verification

- `npm run compile` passed
- `npm test` passed (includes `test_state_manager.js`)

### Next

- git tag `v1.10.0` + push。実機 E2E（agentic / git timeline）。

---

## 2026-07-01 JST - Claude (Sonnet 5) - Start Hub for empty workspaces + index.html mojibake cleanup

### Summary

- User tested a fresh world folder (`G:\AI\LoreRelayWorlds\PostApocalypse`) and found the empty-state chat log gave no indication of what to do. Discussed with ChatGPT, who investigated the existing Quickstart feature (already fully implemented: `#quickstart-modal` + `quickstartRunner.ts`, just poorly discoverable behind an unlabeled 🚀 icon) and produced a hybrid spec: keep Quickstart as "generate roughly from one line," add a new (future) "GM interview" mode as "build via Q&A," and show both as a `Start Hub` choice screen whenever the workspace is empty, with theme presets feeding either path.
- Implemented the UI/discoverability half per ChatGPT's spec (backend interview-mode logic intentionally deferred as future work, per spec):
  - `webview/index.html` — new `#start-hub` block (sibling of `#chat-log`, not a child — `chatLog.innerHTML = ''` on re-render would otherwise wipe it) with a title, two big option buttons (Quick Generate / Build via Q&A), and 5 preset chips.
  - `webview/styles/10-layout-chat.css` — `.start-hub` fills the same flex slot as `#chat-log`; `#chat-log.hidden`/`.start-hub.hidden` toggle between them.
  - `webview/modules/90-bootstrap.js` — `updateStartHubVisibility()` (single source of truth: shows hub iff `messageHistory.length === 0`), preset chip single-select state, Quick Generate button opens the existing quickstart modal and pre-fills its prompt textarea with the selected preset's one-line description, Q&A button pre-fills `freeInput` with an interview-kickoff template (consistent with the earlier image-mismatch-flag button pattern) and focuses it rather than auto-sending.
  - `webview/modules/10-game-state.js` — `renderMessage()` now calls `updateStartHubVisibility()` at its very end, so every code path that adds a message (welcome check, `applyGameState` loading real entries, remote input, system messages) automatically keeps the hub's visibility correct without needing to hook each call site individually.
  - Replaced the old unconditional `addSystemMessage(T('webview.welcome'))` call with the hub (its title serves the same purpose); i18n key `webview.welcome` is now unused but left defined (harmless, not worth the risk of touching it).
  - 13 new i18n keys × 4 locales.
- **Unrelated finding, fixed while in the file**: `webview/index.html` had real mojibake — 11 quick-reply button fallback labels (garbled emoji + text), ~15 corrupted HTML comments, and an `…` (ellipsis) that had been mangled into `窶ｦ` repeated across ~13 character-creator placeholder strings. Verified against the corresponding `locales/*.json` values (which were clean) that this was low-severity — `applyI18n()` overwrites the fallback text immediately on load — but cleaned it up for source readability. Confirmed 0 remaining occurrences of the known corruption markers across `webview/`, `src/`, and `locales/` afterward.

### Verification

- `npm run compile` passed.
- `node scripts/check_i18n_keys.js` — 0 missing in all 4 locales.
- `node scripts/validate_webview_html_structure.js` passed.
- `node scripts/validate_utf8_docs.js` — OK (267 files).
- `npm test` passed (full suite green).

### Next

- GM interview mode itself (the "💬 Build via Q&A" backend) is not implemented — clicking it only pre-fills a kickoff message into the normal chat input, which then flows through whichever GM bridge provider is already configured. Per ChatGPT's spec, when that gets built: keep `setupComplete` as an advisory signal only, use an explicit always-visible "generate the world from this" button as the real trigger (not AI self-judgment), and route through `invokeGmBridge` (not `quickstartRunner.ts`'s `generateText()`, which only supports openrouter/ollama/koboldcpp) so it works with any configured provider.

## 2026-07-01 JST - Claude (Sonnet 5) - Image/narrative mismatch feedback button

### Summary

- User + ChatGPT identified a UX gap during test play: a generated scene image (map spread on a table, per the narration) didn't match what was actually rendered (map on the ground, no table/characters). ChatGPT proposed a "flag this image" button that pre-fills a template complaint for the GM.
- Implemented the simpler of ChatGPT's two proposals (template pre-fill into free input, sent through the existing GM turn flow) rather than the fuller accept/discard/retake variant, to avoid new message types or backend changes.
- `webview/modules/10-game-state.js` — added a "🗯️ Flag Mismatch" button next to the existing regenerate button on every scene image; wrapped both in a new `.image-editor-actions` flex row. Clicking it sets `freeInput.value` to a template string and focuses/positions the cursor at the end so the user can type the specific complaint before sending normally.
- `webview/styles/80-image-gen.css` — new `.image-editor-actions` row wrapper; `.image-flag-btn` gets a distinct amber accent from the existing purple regenerate/manual-gen buttons; restored `align-self: flex-end` on `.manual-gen-btn` specifically since it's still used standalone outside the new row.
- i18n: 3 new keys (`webview.image.flagMismatchBtn/Title/Template`) in all 4 locales.

### Verification

- `npm run compile` passed.
- `node scripts/check_i18n_keys.js` — 0 missing in all 4 locales.
- `node scripts/validate_webview_html_structure.js` passed.
- `npm test` passed (full suite green).

### Next

- Not yet built: the fuller "accept / discard / regenerate with corrected prompt" 4-button variant ChatGPT also proposed. Left as a follow-up if the simple version proves not enough — would need a new postMessage type and prompt-rewriting logic on the image-gen side.

## 2026-07-01 JST - Claude (Sonnet 5) - Phase 8A quest completion rewards + Phase 10 status check

### Summary

- User relayed Grok's phase-assignment status table showing Phase 10 as "prototype only, real implementation still to come." Verified against the actual committed code: Grok's table was stale — my earlier Phase 10 work (gitManager.ts hardening, branch panel UI, commitTurn file-list fix, CHANGELOG mojibake fix) is already committed in `0dbcd63` and confirmed intact/passing after the Phase 9A/9B work landed on top of it. Phase 10 is functionally done; nothing further planned unless new gaps surface.
- Assessed Phase 8A's flagged remaining work ("reward/disposition design") and judged it worth completing now (user gave standing permission to proceed autonomously while away): quest hooks previously had a `reward` field in the type/parser that nothing ever populated or applied — completing a quest only flipped `status` to `'completed'` with no mechanical effect.
- Implemented reward application for NPC-sourced quest hooks only (event-sourced hooks have no natural reward recipient):
  - `worldStateCore.ts` — added `npcId?`/`needId?` to `QuestHook`, parsed only when `source === 'npc'`.
  - `questGeneratorCore.ts` — `createNpcQuestHook` now sets `npcId`, `needId`, and a `reward` description.
  - `statePatch.ts` — `completeResolvedQuestHooks()` now takes a `currentTurn` param (derived from existing `state.entries` GM-role count, no new cross-module dependency) and, for each newly-completed npc-sourced hook, calls the existing `applyNpcMemoryUpdates()` (Phase 3-reviewed, already safe/clamped) with `+10 playerTrust`, resolves the matching need, and appends a memory entry.
  - `webview/modules/85-world.js` + all 4 locales — Quest Board now shows the reward text when present.
  - `scripts/test_quest_generator.js` — added assertions that npc hooks carry `npcId`/`needId`/`reward`, that event hooks never pick up stray `npcId`/`needId` from raw data, and that round-trip parsing preserves the new fields.

### Verification

- `npm run compile` passed.
- `node scripts/test_quest_generator.js` passed (including new assertions).
- `node scripts/check_i18n_keys.js` — 0 missing in all 4 locales.
- `npm test` passed (full suite green).

### Next

- None from this entry. Original Phase 10 mojibake follow-up is already resolved (see below).

## 2026-07-01 JST - Codex - Phase 9B code review hardening

### Summary

- Reviewed Grok commit `218ffe4` for Phase 9B multi-provider agentic GM.
- Fixed prompt ambiguity for non-file runtimes: Referee/Narrator prompts now explicitly allow stdout JSON when the provider cannot write `.text-adventure/agentic/*_result.json` directly.
- Fixed OpenRouter local agentic stage key handling so `getOpenRouterApiKey()` is called once per stage instead of twice.
- Fixed `killGmBridgeProcesses()` so an agentic-only busy state is cleared even when no child process is active.
- Added a unit assertion that agentic prompts include the stdout fallback instruction.

### Verification

- `npm run compile` passed.
- `python -m py_compile C:\AI\TextAdventureGMSkill\scripts\agentic_stage_gm.py` passed.
- `node scripts/test_agentic_gm_core.js` passed.
- `npm test` passed.

### Next

- Run real E2E turns for `grok`, `vscode-lm`, and one local API provider.
- Confirm only the merged final output writes workspace `turn_result.json`; provider stage output should be either stage JSON files or stdout parsed into those files.

## 2026-07-01 JST - Grok - Phase 9B agentic multi-provider

### Summary

- Extended Phase 9A split-role GM beyond Grok-only per `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`:
  - `agenticGmCore.ts` — `AgenticGmProvider`, `isAgenticCapableProvider()`, provider metadata in `mergeAgenticTurnResult()`
  - `agenticGmRunner.ts` — provider dispatch (`grok` / `vscode-lm` / local LLM); stdout or stage JSON parsing; `clipboard`/`command` unchanged (handled: false)
  - `gmBridgeRunner.ts` — `runVscodeLmAgenticStage()`, `runLocalAgenticStage()`, `setAgenticBridgeBusy()`; `getOpenRouterApiKey` wired into agentic gate
  - `TextAdventureGMSkill/scripts/agentic_stage_gm.py` — ollama/koboldcpp/openrouter stage runner (stdout only, no game_state writes)
- Tests: `isAgenticCapableProvider`, provider metadata merge in `test_agentic_gm_core.js`

### Verification

- `npm run compile` passed
- `node scripts/test_agentic_gm_core.js` passed
- `npm test` passed

### Next

- Real E2E with `textAdventure.gmBridge.agentic.enabled=true` on each target provider (especially vscode-lm and one local API).

## 2026-07-01 JST - Codex - Phase 9A code review hardening

### Summary

- Reviewed Grok commit `76884e0` for Phase 9A split-role GM.
- Found and fixed a high-risk stale file issue: `referee_result.json` / `narrator_result.json` could be reused from a previous turn if Grok exited successfully but did not write a fresh stage result.
- Found and fixed an instruction conflict: agentic stages were using the normal single-stage Grok prompt as their base, which includes `turn_result.json` write instructions. Agentic stages now use GM context only plus explicit stage instructions.

### Verification

- `npm run compile` passed.
- `node scripts/test_agentic_gm_core.js` passed.
- `npm test` passed.

### Next

- Before Phase 9B, run one real Grok E2E turn with `textAdventure.gmBridge.agentic.enabled=true` and confirm:
  - Referee writes only `.text-adventure/agentic/referee_result.json`.
  - Narrator writes only `.text-adventure/agentic/narrator_result.json`.
  - Only the merged final result writes workspace `turn_result.json`.

## 2026-07-01 JST - Grok - Phase 9A split-role GM prototype

### Summary

- Implemented Phase 9A per `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`:
  - `src/agenticGmCore.ts` — pure prompt builders, JSON parsers, `mergeAgenticTurnResult()`
  - `src/agenticGmRunner.ts` — Grok-only two-stage runner (`.text-adventure/agentic/` intermediates)
  - `src/gmBridgeRunner.ts` — optional gate before provider switch; `runGrokPromptFile()` for staged spawns
  - Settings: `textAdventure.gmBridge.agentic.enabled` (default false), `fallbackToSingleStage`, `stageTimeoutMs`
  - `scripts/test_agentic_gm_core.js` in `npm test`
- Safety: narrator cannot override `statePatch`/`diceLedger`/`resolvedQuests`; only merged `turn_result.json` is written; `processTurnResult()` unchanged.

### Verification

- `npm run compile` + `npm test` — all green
- `node scripts/validate_utf8_docs.js` — OK

### Next

- ChatGPT review Phase 9A for fallback double-call, process cleanup, and real Grok e2e manual test.
- Phase 9B: extend beyond Grok-only if review passes.

## 2026-07-01 JST - Codex - Phase 9 Agentic Campaign Engine design

### Summary

- Added `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md` as the source-of-truth design for Phase 9.
- Defined Phase 9A as an optional Grok-only split-role GM prototype:
  - State Referee writes mechanics-only candidate output.
  - Narrator writes prose/media hints only.
  - final `turn_result.json` remains the only accepted result.
  - `processTurnResult()` remains the final validation/application point.
- Updated `phase8_planning_and_prompts.md` with a copy-ready Grok prompt that points to the new design file.
- Updated `AI_ROADMAP.md` to mark the ChatGPT/Codex design part complete and leave the Grok prototype as the next implementation task.

### Verification

- Documentation-only change. UTF-8 validation should be run after any follow-up edits.

### Next

- Give Grok the Phase 9A prompt from `phase8_planning_and_prompts.md` or `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`.
- After Grok implements, review for direct `game_state.json` writes, premature `turn_result.json` writes, narrator mechanic override, process cleanup, and fallback duplication.

## 2026-07-01 JST - Claude (Sonnet 5) - Phase 10 Git Timeline hardening + branch panel

### Summary

- Multi-phase code review this session (Phase 2-6 + original vscode-lm/Cartography diff) found and verified fixes for issues later implemented by Grok/Gemini; see prior entries for those.
- Discovered `src/gitManager.ts` (`ensureGitInit`/`commitTurn`/`branchFromTurn`) was already implemented and live (auto `git init` + auto-commit every turn by default), not something to build from scratch as the Phase 10 handoff prompt assumed.
- Hardened it: one-time modal consent before the first `git init` (declining sets `textAdventure.gitAutoCommitInterval` to 0 so it isn't asked again), workspace-appropriate `.gitignore` defaults, and a guard in `branchFromTurn` that blocks branching while there are uncommitted changes (previously could silently carry dirty state onto a new branch).
- Added the "minimal Webview panel" deliverable from the Phase 10 prompt: a Git Timeline section in the Inspector tab showing the current branch and `timeline/*` branches with a Switch button. New `getGitTimelineStatus()` (read-only, only reports `timeline/`-prefixed branches) and `switchToBranch()` (checkout-only, re-verifies the branch still exists, refuses with uncommitted changes) in `gitManager.ts`; `requestGitTimeline`/`switchGitBranch` postMessage wiring in `webviewHandlers.ts`/`extension.ts`; i18n keys in all 4 locales.
- Fixed the mojibake in `CHANGELOG.md`'s `[Unreleased]` section (header + Added/Fixed lists) by cross-referencing commit messages and this session's own verified knowledge, then rewriting in clean UTF-8.
- **Found but not fixed**: mojibake is more widespread than the `[Unreleased]` section alone — at least 155 occurrences remain further down in `CHANGELOG.md` (e.g. the `[1.7.3]`/`[1.7.2]` historical entries), likely predating this session. Codex's entry above independently found similar corruption in `package.json`/`webview/index.html` around the same time, so this looks like a recurring encoding issue in whatever tool chain does bulk edits (Python scripts on Windows without explicit `encoding='utf-8'` are the most likely culprit). Whoever touches `CHANGELOG.md` next should budget time to reconstruct the older sections from git history/commit messages rather than trust the current text.
- Still open from the Phase 10 handoff prompt: `commitTurn`'s `git add` list only covers `game_state.json`/`game_history.json`/`party.json`/`characters/`/`dice_ledger.json` — it does not include `world_forge.json`/`world_state.json`/`npc_registry.json`, so branching to an old turn does not restore world/NPC state. Flagged to the user, not yet actioned.

### Verification

- `npm run compile` passed.
- `npm test` passed (all suites green).
- `node scripts/check_i18n_keys.js` — 0 missing in all 4 locales.
- `node scripts/validate_webview_html_structure.js` passed.
- `node scripts/validate_utf8_docs.js` — OK (263 files; note this only checks byte-level UTF-8 validity, not semantic legibility, which is why the mojibake above went undetected).

- **Follow-up (same session)**: expanded `commitTurn`'s `git add` list to include `world_forge.json`/`world_state.json`/`npc_registry.json` so timeline branches actually restore world/NPC state. While implementing this, found and fixed a related pre-existing bug: `git add` fails atomically (stages nothing at all) if any single pathspec matches no files — confirmed with a throwaway repo (`git add exists.txt nonexistent.txt` exits 128 and stages neither). Since `characters/` may not exist yet early in a game, the original hardcoded `git add` list could already silently fail every auto-commit until a character file appeared. Fixed by filtering the candidate path list to `fs.existsSync` paths before calling `git add`, verified with a manual two-commit repro (turn 1 with only `game_state.json`, turn 2 after `world_forge.json` appears — both commit cleanly).
- **Follow-up 2 (same session)**: fixed the remaining historical `CHANGELOG.md` mojibake (155 occurrences across `[1.7.3]` down to `[0.1.0]`). Found that commit `9df8738` ("docs: fix mojibake and standardize UTF-8 across repository", 2026-06-29) actually held a fully clean version of the entire file (0 mojibake markers, 54 version headers matching the current file 1:1) — the corruption was reintroduced in a later commit that touched `CHANGELOG.md` again without preserving encoding. Verified the version-header list is byte-identical in order/count between that commit and the current file, then spliced: kept the current file's `[Unreleased]` section (already fixed earlier this session) and replaced everything from `## [1.7.3]` onward with the clean text from `9df8738`. `validate_utf8_docs.js` still passes (byte-level only, as before), and a manual scan confirms 0 remaining mojibake markers.

### Next

- None outstanding from this session's Phase 10 / mojibake work.

## 2026-07-01 JST - Codex - Phase 8A Quest Hooks + planning cleanup

### Summary

- Read the current handoff/planning files and found Phase 8 work already partially present but mixed with mojibake and broken JSON/HTML fragments.
- Restored `package.json` to valid JSON and fixed malformed Webview header tags in `webview/index.html`.
- Implemented a hardened deterministic Phase 8A baseline:
  - `questGeneratorCore.ts` creates Quest Hooks from `world_state.recentChanges` and urgent NPC needs.
  - `worldStateCore.ts` parses/caps `questHooks` safely.
  - `worldView.ts` sends `questHooks` to the Webview.
  - `85-world.js` renders Quest Board items without inline onclick injection.
  - `webviewHandlers.ts` validates `acceptQuest` IDs.
  - `statePatch.ts` applies `turn_result.resolvedQuests` to `world_state.json` instead of `game_state.json`.
  - `gmPromptBuilderCore.ts` caps active quest prompt injection.
- Added `scripts/test_quest_generator.js` and included it in `npm test`.
- Added `phase8_planning_and_prompts.md` with copy-ready prompts for Phase 8-11.
- Rewrote `implementation_plan.md` as a pointer to active planning files and replaced the Phase 8-11 section of `AI_ROADMAP.md` with readable UTF-8 text.

### Verification

- `npm run compile` passed.
- `npm test` passed, including the new quest generator tests.

### Next

- Phase 8 polish: i18n labels for Quest Board, reward/disposition effects, manual checklist steps.
- Then decide whether to continue Phase 8 polish or move to Phase 9 split-role GM architecture.

---
## 2026-07-01 JST - Antigravity - Architecture Refactor: Single Choke Point for Game State

### 螟画峩讎りｦ・- Claude 3.5 Sonnet 縺ｫ繧医ｋ險ｭ險医Ξ繝薙Η繝ｼ縺ｮ謖・遭縺ｫ蝓ｺ縺･縺阪～game_state.json` 縺ｮ譖ｸ縺崎ｾｼ縺ｿ邨瑚ｷｯ繧貞腰荳縺ｮ螳牙・縺ｪ髢｢謨ｰ (`commitGameState`) 縺ｫ髮・ｴ・☆繧句､ｧ隕乗ｨ｡縺ｪ繝ｪ繝輔ぃ繧ｯ繧ｿ繝ｪ繝ｳ繧ｰ繧貞ｮ滓命縲・- `src/stateManager.ts` 繧呈眠險ｭ縺励～commitGameState` 蜀・〒蠢・★ `validateGameState` 縺ｨ `sanitizeGameStateForPersist` 繧貞ｼｷ蛻ｶ縺吶ｋ繧｢繝ｼ繧ｭ繝・け繝√Ε縺ｫ螟画峩縲・- 10蛟九・繧ｳ繧｢繝輔ぃ繧､繝ｫ (`statePatch.ts`, `gameStateSync.ts`, `checkpointHandlers.ts`, `gmBridgeRunner.ts` 遲・ 縺ｧ繝舌Λ繝舌Λ縺ｫ陦後ｏ繧後※縺・◆ `writeJsonAtomic` 縺ｮ蜻ｼ縺ｳ蜃ｺ縺励ｒ縲￣ython繧ｹ繧ｯ繝ｪ繝励ヨ縺ｫ繧医ｋ豁｣隕剰｡ｨ迴ｾ鄂ｮ謠帙〒荳諡ｬ縺ｧ `commitGameState` 縺ｫ鄂ｮ縺肴鋤縺医・
### 讀懆ｨｼ
- `npm run compile` 縺後お繝ｩ繝ｼ縺ｪ縺城夐℃縺吶ｋ縺薙→繧堤｢ｺ隱阪・- `npm test` 縺ｫ繧医ｋ蜈ｨ70莉ｶ莉･荳翫・繝・せ繝医せ繧､繝ｼ繝医ｒ繝弱・繧ｨ繝ｩ繝ｼ縺ｧ騾夐℃縲よｧ矩逧・↑遐ｴ螢翫′襍ｷ縺阪※縺・↑縺・％縺ｨ繧定ｨｼ譏弱・
### 邨檎ｷｯ繝ｻ逕ｳ縺鈴√ｊ莠矩・- 莉雁ｾ後∵眠縺励＞讖溯・繧貞ｮ溯｣・＠縺ｦ `game_state.json` 縺ｫ迥ｶ諷九ｒ菫晏ｭ倥☆繧矩圀縺ｯ縲∝ｿ・★ `import { commitGameState } from './stateManager'` 繧剃ｽｿ逕ｨ縺励※縺上□縺輔＞縲ら峩謗･ `writeJsonAtomic` 繧剃ｽｿ逕ｨ縺吶ｋ縺薙→縺ｯ縲√ユ繧ｹ繝医Δ繝・け縺ｪ縺ｩ迚ｹ谿翫↑蝣ｴ蜷医ｒ髯､縺埼撼謗ｨ螂ｨ縺ｨ縺ｪ繧翫∪縺吶・
> **譛譁ｰ迥ｶ諷九・蜈磯ｭ縺ｮ Current Snapshot 繧呈ｭ｣縺ｨ縺吶ｋ縲・* 莉･荳九・螻･豁ｴ縲ょｮ溯｣・・豁｣譛ｬ縺ｯ `CHANGELOG.md` + 繧ｽ繝ｼ繧ｹ繧ｳ繝ｼ繝峨・
---

## Current Snapshot

**譖ｴ譁ｰ: 2026-06-30 JST・医ち繝也ｩｺ逋ｽ菫ｮ豁｣・・*

| 鬆・岼 | 蛟､ |
|------|-----|
| Package version | **1.7.3** (`package.json`, `CHANGELOG.md` [1.7.3]) |
| Source of truth | `CHANGELOG.md` + source code |
| Task blackboard | `AI_ROADMAP.md` |
| Handover doc | `AI_HANDOVER.md`・・026-06-29 蛻ｷ譁ｰ・・|
| Text encoding | **UTF-8・・OM 縺ｪ縺暦ｼ・* 窶・`.editorconfig` + `scripts/validate_utf8_docs.js` |

### v1.7.x 縺ｧ蜈･縺｣縺溘％縺ｨ・郁ｦ∫ｴ・ｼ・
- **v1.7.0** 窶・Cartography UI・・iagram / Parchment縲，omfyUI縲√ヴ繝ｳ overlay・・- **v1.7.1** 窶・繝代せ讀懆ｨｼ縲『orkflow 螂醍ｴ・√ョ繝｢ layout縲ヽEADME 4險隱・- **v1.7.2** 窶・Python/TS 繝代せ莉墓ｧ倡ｵｱ荳・・hatGPT review・・- **v1.7.3** 窶・`copyFileSync` 蜑肴､懆ｨｼ縲〕ayout 蟄舌・繝ｭ繧ｻ繧ｹ霑ｽ霍｡縲ヽemote Play `/media` 繝√ぉ繝・け鬆・ｼ・laude review・・
### Main remaining work

- README **螳溘せ繧ｯ繧ｷ繝ｧ / GIF**・・docs/assets/*.svg` 縺ｯ繝｢繝・け縲よ焔鬆・・ `DEMO.md`・・- [`testing_checklist.md`](testing_checklist.md) 縺ｮ謇句虚遒ｺ隱・- Cartography UX polish・・tale 陦ｨ遉ｺ縲∝・逕滓・菫・＠・俄・莉ｻ諢・- **v1.8 Event-to-Quest** 窶・谺｡縺ｮ讖溯・蛟呵｣懶ｼ・AI_ROADMAP.md` Phase 8・・- Private scenario vault: 蜈ｬ髢・Git / 蜈ｱ譛峨ラ繧ｭ繝･繝｡繝ｳ繝医・蟇ｾ雎｡螟・
### AI騾｣謳ｺ譎ゅ・蜍穂ｽ懃｢ｺ隱阪Ν繝ｼ繝ｫ

- 螳溯｣・＠縺溘′繝ｦ繝ｼ繧ｶ繝ｼ譛ｪ遒ｺ隱阪・讖溯・縺ｯ `testing_checklist.md` 縺ｫ谿九☆
- 縲後→繧翫≠縺医★蜈医↓騾ｲ繧√※縲阪〒繧よ悴遒ｺ隱阪・遨阪∩荳翫￡繧呈滑謠｡縺励・←螳懊・繝ｬ繧､遒ｺ隱阪ｒ菫・☆
- 菴懈･ｭ髢句ｧ句燕縺ｫ `AI_ROADMAP.md` 縺ｨ譛ｬ Snapshot 繧堤｢ｺ隱阪＠縲∝ｮ御ｺ・ｸ医∩繝輔ぉ繝ｼ繧ｺ繧貞｣翫＆縺ｪ縺・
---

## 2026-06-30 JST - Claude - World tab i18n 谿句ｭ俶ｼ上ｌ菫ｮ豁｣ + check_i18n_keys.js 菫ｮ豁｣

### Summary

- `85-world.js` 縺ｮ 21 邂・園繝上・繝峨さ繝ｼ繝芽恭隱樊枚蟄怜・繧・`T()` 蛹厄ｼ・orld Forge UI 繝輔か繝ｼ繝蜈ｨ繝ｩ繝吶Ν縲√そ繧ｯ繧ｷ繝ｧ繝ｳ隕句・縺・莉ｶ縲∵ｴｾ髢･遨ｺ迥ｶ諷九√す繝 Power/Morale 繝舌・縲ヾcene Image 繝懊ち繝ｳ迥ｶ諷九√・繝・・繝代Φ繝偵Φ繝茨ｼ・- 4 險隱橸ｼ・a / en / zh-CN / zh-TW・峨↓ 21 譁ｰ繧ｭ繝ｼ繧定ｿｽ蜉
- `webview.inspector.noHiddenState` 繧・4 險隱櫁ｿｽ蜉・・heck 譎ゅ↓逋ｺ隕壹＠縺滓ｼ上ｌ・・- `check_i18n_keys.js` 窶・`T()` 螟ｧ譁・ｭ励′豁｣隕剰｡ｨ迴ｾ縺ｫ蠑輔▲縺九°繧峨↑縺・ヰ繧ｰ繧剃ｿｮ豁｣・・(?:t|i18n)` 竊・`(?:T|t|i18n)`・・- `C:\AITest\game_rules.json` 縺ｮ `enableWorldForge` / `enableEmergentSimulation` / `enableNpcRegistry` 繧・`true` 縺ｫ螟画峩・・orld 繧ｿ繝冶｡ｨ遉ｺ縺ｫ蠢・茨ｼ・
### Files touched

- `locales/ja.json`, `locales/en.json`, `locales/zh-CN.json`, `locales/zh-TW.json`
- `webview/modules/85-world.js`
- `scripts/check_i18n_keys.js`
- `C:\AITest\game_rules.json`
- `CHANGELOG.md`, `AI_SHARED_LOG.md`

### Verification

- `npm run compile && npm test` 窶・蜈ｨ騾夐℃

### Remaining (manual in Extension Host)

- Extension Host 繝ｪ繝ｭ繝ｼ繝会ｼ・trl+Shift+P 竊・Developer: Reload Window・峨〒 i18n 菫ｮ豁｣繧堤｢ｺ隱・- World 繧ｿ繝悶ｒ髢九＞縺ｦ Mermaid Diagram / Parchment 蛻・崛繝ｻPan&Zoom 繧堤｢ｺ隱・- game_rules.json 縺梧怏蜉ｹ縺ｫ縺ｪ繧・world_forge.json 縺ｮ 3 Region / 2 Faction 縺瑚｡ｨ遉ｺ縺輔ｌ繧九°遒ｺ隱・
---

## 2026-06-30 JST - ChatGPT - Claude/Grok 邨ｱ蜷医ご繝ｼ繝医Ξ繝薙Η繝ｼ

### Summary

- `CHATGPT_INTEGRATION_REVIEW.md` 縺ｫ豐ｿ縺｣縺ｦ Current Snapshot / CHANGELOG [Unreleased] / v1.7.3 蜑肴署繧堤｢ｺ隱・- Claude/Grok 蟾ｮ蛻・ｒ邨ｱ蜷医Ξ繝薙Η繝ｼ縲・ritical / High 縺ｮ繧ｳ繝ｼ繝牙撫鬘後・讀懷・縺ｪ縺・- 繧ｿ繝悶ヰ繝ｼ讓ｪ繝峨Λ繝・げ縺ｧ繧ｹ繧ｯ繝ｭ繝ｼ繝ｫ蠕後↓繧ｯ繝ｪ繝・け縺檎匱轣ｫ縺怜ｾ励ｋ縺溘ａ縲～webview/modules/40-dice-calc-tabs.js` 縺ｫ capture click suppression 繧定ｿｽ蜉
- `C:\AITest` 縺ｯ `world_map.layout.png` 縺ゅｊ縲～world_map.png` 縺ｪ縺励・omfyUI 鄒顔坩邏呎悴逕滓・縺ｯ checkpoint 譛ｪ險ｭ螳壹↓繧医ｋ迺ｰ蠅・ｦ∝屏謇ｱ縺・
### Verification

- `node scripts/check_i18n_keys.js` 窶・4 險隱・missing 0
- `npm run compile` 窶・騾夐℃
- `npm test` 窶・蜈ｨ騾夐℃
- `git diff --check` 窶・whitespace error 縺ｪ縺・
### Remaining (manual in Extension Host)

- Extension Host 繝ｪ繝ｭ繝ｼ繝牙ｾ後仝orld 繧ｿ繝悶・繧ｿ繝紋ｽ咲ｽｮ繝ｻ讓ｪ繧ｹ繧ｯ繝ｭ繝ｼ繝ｫ繝ｻ譛ｪ鄙ｻ險ｳ繧ｭ繝ｼ隗｣豸医ｒ逕ｻ髱｢縺ｧ遒ｺ隱・- ComfyUI checkpoint 險ｭ螳壼ｾ後↓ `world_map.png` 逕滓・縺ｨ Parchment 陦ｨ遉ｺ繧堤｢ｺ隱・
---

## 2026-06-30 JST - Grok - Status tab black pane fix (scroll + flex)

### Summary

- 蜿ｳ蛛ｴ繧ｿ繝悶′ active 陦ｨ遉ｺ縺縺代＆繧御ｸｭ霄ｫ縺檎悄縺｣鮟・窶・`#status-area` 縺ｮ scrollTop 縺後ち繝門・譖ｿ蠕後ｂ谿九ｋ縺ｮ縺悟次蝗縺ｨ迚ｹ螳・- 繧ｿ繝門・譖ｿ譎ゅ↓ scroll 繝ｪ繧ｻ繝・ヨ縲～#status-area` 繧・`overflow:hidden` + `min-height:0`縲〃SIX 蜀阪ヱ繝・こ繝ｼ繧ｸ繝ｻ蜀阪う繝ｳ繧ｹ繝医・繝ｫ

### Verification

- `npm run compile && npm test`
- `lorerelay-1.7.3.vsix` 蜀咲函謌・+ `code --install-extension --force`

### User verify

- `code --new-window C:\AITest` 竊・繧ｲ繝ｼ繝UI 竊・繧ｭ繝｣繝ｩ繧ｯ繧ｿ繝ｼ/繝ｯ繝ｼ繝ｫ繝峨ち繝悶〒荳ｭ霄ｫ縺瑚ｦ九∴繧九°

---

## 2026-06-30 JST - Grok - AITest workspace review (i18n + Cartography)

### Summary

- `C:\AITest` 縺ｧ layout PNG 逕滓・謌仙粥・・world_map.layout.png`・・- ComfyUI 鄒顔坩邏咏函謌舌・ layout 繝舌げ菫ｮ豁｣蠕後↓繧ｭ繝･繝ｼ縺ｾ縺ｧ蛻ｰ驕斐ゅΘ繝ｼ繧ｶ迺ｰ蠅・〒縺ｯ `sd_xl_base_1.0.safetensors` 縺梧悴繧､繝ｳ繧ｹ繝医・繝ｫ縺ｮ縺溘ａ 400・・TA_CHECKPOINT` 隕∬ｨｭ螳夲ｼ・- Quick Reply 遲・19 繧ｭ繝ｼ縺ｮ i18n 荳崎ｶｳ繧・4 險隱槭〒陬懷ｮ後８orld縲勲ap Image縲阪・繧ｿ繝ｳ繧・i18n 蛹・
### Files touched

- `locales/*.json`, `webview/index.html`, `webview/modules/85-world.js`
- `scripts/comfyui_generate_cartography.py`, `scripts/check_i18n_keys.js`, `package.json`
- `CHANGELOG.md`, `AI_SHARED_LOG.md`

### Verification

- `npm run compile && npm test`
- `python scripts/render_cartography_layout.py C:\AITest\world_forge.json C:\AITest\world_map.layout.png`

### Remaining (manual in Extension Host)

- World 繧ｿ繝門ｮ溯｡ｨ遉ｺ・・ermaid / 豢ｾ髢･ / Diagram竊捻archment・・- ComfyUI 縺ｧ `world_map.png` 逕滓・・・heckpoint 險ｭ螳壼ｾ鯉ｼ・- Extension Host 繝ｪ繝ｭ繝ｼ繝峨〒 i18n 菫ｮ豁｣繧堤｢ｺ隱・
---

## 2026-06-29 JST - Grok - UTF-8 encoding fix (docs)

### Summary

- 14 蛟九・ Markdown 縺御ｸ肴ｭ｣ UTF-8 / 譁・ｭ怜喧縺代＠縺ｦ縺・◆縺溘ａ縲・㍾隕√ラ繧ｭ繝･繝｡繝ｳ繝医ｒ UTF-8 縺ｧ譖ｸ縺咲峩縺・- 繝ｬ繝薙Η繝ｼ邉ｻ繝ｻ`implementation_plan.md` 縺ｯ繧ｹ繧ｿ繝門喧・・CHANGELOG.md` / `C:\AI\*_REVIEW.md` 縺ｸ隱伜ｰ趣ｼ・- `AI_SHARED_LOG.md` 譌ｧ螻･豁ｴ・・1.1.2 莉･髯阪・遐ｴ謳阪ヶ繝ｭ繝・け・峨ｒ繧｢繝ｼ繧ｫ繧､繝匁ｳｨ險倥↓蟾ｮ縺玲崛縺・- `.editorconfig`・・harset=utf-8・峨→ `scripts/validate_utf8_docs.js` 繧定ｿｽ蜉

### Files touched

- `AI_COLLABORATION.md`, `AI_HANDOVER_PROMPTS.md`, `ANTIGRAVITY_GUIDE.md`, `GM_BRIDGE_PRESETS.md`, `SILLYTAVERN_COMPAT.md`
- `DEVELOPMENT_TIMELINE.md`, `docs/readme-screenshots-plan.md`
- `CLAUDE_*.md`, `GROK_REVIEW_v1_BASELINE.md`, `implementation_plan.md`
- `AI_SHARED_LOG.md`, `.editorconfig`, `scripts/validate_utf8_docs.js`, `CHANGELOG.md`

### Verification

- `node scripts/validate_utf8_docs.js`

---

## 2026-06-29 JST - Grok - AI handover docs refresh

### Summary

- `AI_HANDOVER.md` 繧貞・髱｢譖ｸ縺咲峩縺暦ｼ域枚蟄怜喧縺題ｧ｣豸医」1.7.3縲～turn_result` 繝輔Ο繝ｼ縲∵ｮ倶ｻｶ譖ｴ譁ｰ・・- `AI_SHARED_LOG.md` 蜈磯ｭ縺ｫ Current Snapshot 繧貞・驟咲ｽｮ
- `AI_ROADMAP.md` 縺ｫ Phase 7・・artography・牙ｮ御ｺ・→ Phase 8 蛟呵｣懊ｒ霑ｽ險・
### Files touched

- `AI_HANDOVER.md`, `AI_SHARED_LOG.md`, `AI_ROADMAP.md`, `CHANGELOG.md`

### Verification

- 繝峨く繝･繝｡繝ｳ繝医・縺ｿ・医さ繝ｼ繝牙､画峩縺ｪ縺暦ｼ・
---

## 2026-06-29 JST - Grok - Cartography hardening v1.7.2 / v1.7.3

### Summary

- v1.7.2: Python `validate_output_dir` / layout 蜃ｺ蜉帙ｒ TS 縺ｨ邨ｱ荳縲～test_cartography_path_utils.py`
- v1.7.3: `validateCartographyGeneratedImagePath` + `resolveAllowedImagePath` before copy縲〕ayout subprocess tracking

### Verification

- `npm run compile && npm test` 騾夐℃・・1.7.3 繝ｪ繝ｪ繝ｼ繧ｹ譎ゑｼ・
---

## 2026-06-28 JST - Antigravity - Phase 7 Cartography Verification & Release (v1.7.0)

### 螟画峩讎りｦ・
- ChatGPT縲，laude縲；rok 縺ｫ繧医ｋ Phase 7 Cartography 縺ｮ邨ｱ蜷医ユ繧ｹ繝医♀繧医・ v1.7.0 繝ｪ繝ｪ繝ｼ繧ｹ貅門ｙ
- `world_forge.json` 縺ｮ x/y/biome縲｀ermaid pan/zoom縲，omfyUI 鄒顔坩邏吝慍蝗ｳ縲√ヴ繝ｳ overlay

### 讀懆ｨｼ

- `npm run compile` / `npm test` 騾夐℃
- `package.json` 竊・`1.7.0`

---

## Archived History・・026-06-27 莉･蜑搾ｼ・
2026-06-27 01:30 JST 莉･髯阪・隧ｳ邏ｰ繝ｭ繧ｰ縺ｯ **CP932 / Latin-1 豺ｷ蝨ｨ縺ｫ繧医ｊ譁・ｭ怜喧縺・* 縺励※縺翫ｊ縲∬・蜍募ｾｩ蜈・〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・
- **蜑企勁縺帙★繧｢繝ｼ繧ｫ繧､繝匁桶縺・** Git 螻･豁ｴ `git log -- AI_SHARED_LOG.md` 縺翫ｈ縺ｳ蜷・沿繧ｿ繧ｰ縺ｮ `CHANGELOG.md` 繧貞盾辣ｧ
- **豁｣譛ｬ:** 荳願ｨ・Current Snapshot + `CHANGELOG.md` + `DEVELOPMENT_TIMELINE.md`・・026-06-29 譖ｸ縺咲峩縺暦ｼ・- **蜀咲匱髦ｲ豁｢:** 蜈ｨ AI 蜷代￠繝峨く繝･繝｡繝ｳ繝医・ UTF-8・・OM 縺ｪ縺暦ｼ峨〒菫晏ｭ假ｼ・AI_COLLABORATION.md` 蜿ら・・・
