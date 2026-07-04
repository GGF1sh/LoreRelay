# Changelog

このファイルは、プロジェクトの変更履歴を記録したものです。新しいAIがプロジェクトに参加する際、`AI_HANDOVER.md` と共にこのファイルを読むことで、過去の経緯や修正の理由を素早く把握できます。

関連レビュードキュメント（リポジトリ外のローカル資料がある場合はワークスペース親 `C:\AI\` を参照）

- `docs/REVIEW_FOLLOWUP_v1_28.md` — ChatGPT / Gemini レビュー対応状況
- `docs/COMMERCE_UI_V1_26_0_REVIEW.md` · `docs/LW2_TRUST_ROLE_V1_27_0_REVIEW.md` — 実装レビュー記録

## [Unreleased]

### Fixed

- **World Intent WI5R / WI5bR (self-review)** — mod loader no longer injects every scanned manifest (only enabled profile entries); empty mod registry still runs MOD checks; mobile base vehicles warn when settlement ledger is absent; alias cycle dedupe; WI5b Output Channel appends instead of clearing WI3b history; command messages i18n (`extension.*.workspaceSanity*`).

### Added

- **World Intent WI7b Migration Backup Restore Gate design** - added `docs/WORLD_INTENT_WI7B_MIGRATION_RESTORE_GATE.md`, defining a manual restore gate for WI7-created `vehicle_state.json` migration backups. Scope is explicit user-selected restore only: fixed backup directory, metadata validation, modal confirmation, strict pre-restore backup, atomic replacement, post-restore validation, bounded Output Channel reporting, and no auto-rollback/checkpoint/Git/Webview/Remote/GM-turn integration.

- **World Intent WI7 Migration Write-Back Gate design** - added `docs/WORLD_INTENT_WI7_MIGRATION_WRITEBACK_GATE.md`, defining the first explicit migration write-back gate. Scope is intentionally narrow: user-confirmed `vehicle_state.json` v0 -> v1 only, fresh dry-run before write, strict timestamped backup before atomic write, post-write validation, bounded Output Channel reporting, and no apply-all/rollback/Webview/Remote/GM-turn integration.

- **World Intent WI7 Migration Write-Back Gate** — opt-in host command `LoreRelay: Apply Vehicle State Migration` (`textadventure.applyVehicleStateMigration`). User-confirmed `vehicle_state.json` v0→v1 only; fresh read + WI6 dry-run before write; strict timestamped backup to `.lorerelay/backups/migrations/<timestamp>/` (independent of `writeJsonAtomic` createBackup); atomic write + post-write `parseVehicleState` validation; bounded `LoreRelay World Intent` reporting. No apply-all, rollback, GM-turn hook, or Webview/Remote/Replay wiring. `ledgerMigrationWritebackCore.ts` + `ledgerMigrationWritebackHost.ts` + `ledgerMigrationWritebackRunner.ts`; `scripts/test_ledger_migration_writeback_core.js`. `npm test` **195/195**.

- **World Intent WI6 Per-Ledger Migration Helper** — `ledgerMigrationCore.ts` + `vehicleMigrationCore.ts`: pure dry-run `migrateLedgerDocument` / `migrateVehicleStateDocument` with contiguous version-step chains. Pilot: `vehicle_state` implicit v0 (`{ vehicles }` without `version`) → v1 (`version: 1`), then `parseVehicleState` validation. No disk write, no global workspace migration, no `TurnResult`/`statePatch` changes. `scripts/test_ledger_migration_core.js` (design §12). `npm test` **193/193**.

- **World Intent WI6b Migration Preview Command design** - added `docs/WORLD_INTENT_WI6B_MIGRATION_PREVIEW_COMMAND_DESIGN.md`, defining an opt-in read-only host command (`LoreRelay: Preview Workspace Migrations`) that loads fixed known workspace ledgers, runs WI6 dry-run migration helpers, and prints bounded Output Channel diagnostics. The design forbids write-back, backups, apply buttons, GM-turn integration, Webview execution, Remote Play, replay export, and raw JSON diagnostics.

- **World Intent WI6b Migration Preview Command** — opt-in host command `LoreRelay: Preview Workspace Migrations` (`textadventure.previewWorkspaceMigrations`). Read-only loader for 8 fixed workspace ledgers; calls WI6 dry-run helpers (`migrateVehicleStateDocument` pilot + version probe for others); bounded report in `LoreRelay World Intent` Output Channel ending with `No files were changed.` No write-back, backup, apply button, GM-turn hook, or Webview/Remote/Replay wiring. `ledgerMigrationHostCore.ts` + `ledgerMigrationLoader.ts` + `ledgerMigrationRunner.ts`; `scripts/test_ledger_migration_host_core.js`. `npm test` **194/194**.

- **World Intent WI5b Workspace Sanity Check command** — opt-in host command `LoreRelay: Run Workspace Sanity Check` (`textadventure.runWorkspaceSanityCheck`). Read-only loader for `vehicle_state.json`, `settlement_state.json`, `game_rules.json`, `.lorerelay/mod_profile.json` + mod manifests; calls `buildWorldSanityReport`; shows bounded summary in `LoreRelay World Intent` Output Channel. No auto-fix, no GM-turn hook, no ledger writes. `worldIntentSanityHostCore.ts` + `worldIntentSanityLoader.ts` + `worldIntentSanityRunner.ts`; `scripts/test_world_intent_wi5b_sanity_host.js`. `npm test` **192/192**.

- **World Intent WI3a-1 Vehicles tab preview (Tier 1)** — read-only "would this work?" block in the vehicle detail card (`docs/WORLD_INTENT_WI3A_PREVIEW_UI_DESIGN.md`, Phase WI3a-1). New pure `webview/modules/89c-vehicle-intent-preview.js` (`LR_vehicleIntentPreview.computeRows`) derives `set_active_vehicle` / `move_vehicle` / `repair_vehicle` / `refuel_vehicle` status (`valid_noop` / `allowed` / `blocked` / `needs_input`) from fields already present in the existing `vehicleGarage` payload only — no `queryWorldIntent()`/`executeWorldIntent()` call, no new Webview→host message, no `src/*.ts` change. `damage_vehicle` is intentionally omitted (no player affordance); `move_vehicle` renders as "pick a destination to preview" rather than a real verdict, since no candidate destination exists client-side. No buttons/inputs/execute affordance. i18n keys added to all 4 locales (`webview.vehicles.intentPreview.*`); status shown via icon + text, not color alone. `scripts/test_webview_vehicle_intent_preview.js`. `npm test` **192/192**.

- **World Intent WI6 Per-Ledger Migration Helper design** - added `docs/WORLD_INTENT_WI6_LEDGER_MIGRATION_DESIGN.md`, defining a pure dry-run migration helper for per-ledger schema upgrades. The first pilot is intentionally tiny (`vehicle_state` v0 -> v1 by adding `version: 1`). Global workspace migration, write-back, semantic auto-fix, GM-turn integration, and State Orchestrator wiring are deferred.

- **World Intent WI5 Semantic Sanity Checker** — `worldIntentSanityCore.ts`: pure report-only `buildWorldSanityReport` over vehicle, mobile-base, mod/profile, and game-rule inputs. Reuses `validateVehicleFleet`, `validateMobileBaseLink`, `resolveModProfile`, and `parseVehicleWorldIntentBridgeMode`. Bounded issues (max 100), deterministic ordering, no auto-fix, no persistence, no `TurnResult`/`statePatch`/Webview changes. `scripts/test_world_intent_wi5_sanity_core.js` (design §12). `npm test` **191/191**.

- **World Intent WI5 Semantic Sanity Checker design** - added `docs/WORLD_INTENT_WI5_SANITY_CHECKER_DESIGN.md`, defining the next pure report-only checker for vehicle, mobile-base, mod/profile, and game-rule consistency. The design forbids auto-fix, persistence, GM-turn blocking, raw payload diagnostics, and State Orchestrator wiring.

- **World Intent WI4 Effect Accounting design** - added `docs/WORLD_INTENT_WI4_EFFECT_ACCOUNTING_DESIGN.md`, defining the next Codex gate as a narrow `refuel_vehicle` accounting pilot. The design records deterministic before/delta/after fuel explanations from canonical legacy vehicle state, without fuel consumption rules, persistence, replay export, Webview execution, or State Orchestrator wiring.

- **World Intent WI4 Effect Accounting** — `worldIntentEffectAccountingCore.ts`: pure `refuel_vehicle` `EffectAccountingEntry` (`before` / `delta` / `after` / `cause`) from canonical legacy pre/post state only. Capped gains use effective delta, not raw `op.amount`. WI3b batch report extended with `accountingEntries` in `shadow`/`compare_only`. No fuel consumption, disk write, TurnResult/statePatch changes. `scripts/test_world_intent_wi4_effect_accounting.js` (design §10). `npm test` **190/190**.

### Fixed

- **World Intent WI4R (self-review)** — reject accounting when `after > max` or `before > max`; skip bridge batch accounting when `enableVehicleSystem:false`; sequential multi-refuel batch tests; invalid `cause.type` sanitization test.

- **World Intent Core design** - added `docs/WORLD_INTENT_CORE_DESIGN.md`, defining a future common intent/query/execute layer inspired by Screeps, OpenRCT2, FreeOrion, and Freeciv design patterns without copying GPL code. The design keeps existing `turn_result.*Ops` intact and proposes a pure-core adapter path before any State Orchestrator integration.

- **World Intent Core ChatGPT gate** - added `docs/WORLD_INTENT_CORE_CHATGPT_GATE.md`, approving WI1 only as a pure skeleton plus `vehicleOps` adapter. The gate explicitly defers `TurnResult`, `statePatch`, ledger persistence, Webview execution, RequirementExpr evaluation, and State Orchestrator integration.

- **World Intent Core DeepResearch addendum** - extended the design with the Action Execution Kernel / Rule Kernel split, Intent vs GameAction boundary, post-commit event bus rule, visibility-aware ChangeSet guidance, effect-accounting roadmap, per-ledger migration direction, scheduler descriptor concept, and deferred materialization notes. WI1 scope remains unchanged.

- **World Intent Core WI1** — `worldIntentCore.ts` pure skeleton + `vehicleOps` adapter: `parseWorldIntent` / `parseWorldIntentBatch`, `queryWorldIntent`, `executeWorldIntent` (in-memory `nextVehicleState` only), `worldIntentFromVehicleOp` / `vehicleOpFromWorldIntent`. Supported: `subsystem: vehicle` + V3 actions (`set_active_vehicle`, `move_vehicle`, `damage_vehicle`, `repair_vehicle`, `refuel_vehicle`). Status taxonomy: `allowed`, `valid_noop`, `blocked`, `invalid`, `unsupported`, `failed`. No `TurnResult`, `statePatch`, persist, or Webview changes. `scripts/test_world_intent_core.js` (gate Required Tests 14). `npm test` **187/187**.

### Fixed

- **World Intent Core WI1R** — Codex review P1 fixes in `worldIntentCore.ts`: import `MAX_VEHICLE_OP_AMOUNT` / `MAX_VEHICLE_REFUEL_AMOUNT` from `vehicleOpsCore` (refuel cap was 999 vs 9999); non-`vehicle` `target.kind` returns `invalid` (`invalid_entity_kind`) even when `payload.vehicleId` is present; `execute_precondition_failed` uses `attempted: true` per gate `failed` contract. Tests: invalid entity kind, payload-only `vehicleId`, refuel amount parity. `npm test` **187/187**.

- **World Intent Core WI2** — closed 5-action `GameAction` registry in `worldIntentCore.ts`; query/execute share one internal `GameActionResolution` (no double `applyVehicleOps` on allowed execute). New `worldIntentVehicleParityCore.ts`: pure legacy↔WorldIntent shadow parity (`match` / `mismatch` / `not_comparable`) with `vehicleOpsCore` as oracle. Bridge contract types: `off` / `shadow` / `compare_only` only (no `apply`, no host wiring). `scripts/test_world_intent_wi2.js` (Gate Required Tests 30). `npm test` **188/188**.

- **World Intent Core WI3b** — host bridge diagnostics at `vehicleTurnOps` boundary: `vehicleWorldIntentBridgeCore.ts` (pure batch parity), `vehicleWorldIntentBridge.ts` (VS Code config/output). Modes `off` / `shadow` / `compare_only` via `textAdventure.worldIntent.vehicleBridgeMode` (default `off`). Pre-write clone parity; legacy `vehicleOps` remains canonical; single `vehicle_state.json` write; `statePatch.ts` unchanged. Parity fix: blocked/no-op `updated_turn` false positive in `worldIntentVehicleParityCore.ts`. `scripts/test_world_intent_wi3b.js` (Gate §10). `npm test` **189/189**.

## [1.76.0] - 2026-07-04

### Added

- **Graphics Upgrade — animation foundation + Track 1 Atmosphere Pass** — design: `docs/GRAPHICS_UPGRADE_DESIGN.md` / `docs/GRAPHICS_UPGRADE_IDEAS.md`. New `84a-webview-anim.js`: shared `requestAnimationFrame` driver (`window.LR_anim`) with per-handler fps throttle, `prefers-reduced-motion` + tab-visibility pause, and user `off`/`light`/`full` effects tier (`localStorage` `lr.effectsTier`, default `light`). Track 1 in `86-tile-overmap.js`: water shimmer, hazard pulse, `@` blink, rumored-marker flicker (deterministic `f(seed, phase)`; static fallback when motion off). `full` tier adds sparse ember particles on hazard tiles. `#world-effects-tier-btn` in World map toolbar. i18n: `effectsTierTitle` / `effectsTier.{off,light,full}` (4 locales). Tests: `test_webview_world_modules.js`.

- **Graphics Upgrade Track 2 — Settlement Diorama lighting/depth** — Webview-only, no payload change. `86c-settlement-diorama.js`: shadow mapping, `THREE.Fog`, `MeshStandardMaterial` PBR finish, genre-linked lighting via existing `palette.theme` / `palette.accent`. `configureDioramaLighting()` on initial build and content rebuild.

- **Graphics Upgrade Track 3 — Genre chrome / post-effects** — `webview/styles/9b-genre-chrome.css` (bundled last). Reuses manual `body[data-ui-theme]` (not auto `data-genre`) to avoid conflicting with player-chosen theme vs map/diorama genre keys. `#genre-fx-overlay` per-theme edge treatment; wires `--cyber-glow` / `--glass-glow` into GM/overmap/vehicle/mobile-base cards; themed GM sender glyph. Static CSS only. Tests: `test_webview_genre_chrome.js`. `npm test` **186/186**, `check_i18n_keys.js` 0 missing, `validate_utf8_docs.js` OK.

## [1.75.2] - 2026-07-04

### Fixed

- **ChatGPT review — Vehicle status/condition state machine (P1)** — `damage_vehicle` now moves movable statuses (`parked`, `docked`, etc.) to `damaged`; `repair_vehicle` restores `available` when HP reaches max. Regression tests in `test_vehicle_ops.js`.

- **ChatGPT review — Mobile Base undock clears stale parking (P1)** — `undock_mobile_base` deletes `vehicle.parkedAt` so map/UI no longer resolve to the old dock after deploy.

- **ChatGPT review — FoW rumored marker ID invariant (P1)** — All `rumored` overlay markers (including vehicle, parking, settlement pressure) get public `rumor_*` ids at build + sanitize choke points; canonical entity ids never leak in snapshot JSON.

- **ChatGPT review — Module tags parser (P2)** — Vehicle module `tags` accept free-form sanitized strings instead of filtering through `VALID_VEHICLE_KINDS`.

- **ChatGPT review — Mod mergeStrategy contract (P2)** — MOD1 officially supports `replace` only; unsupported strategies in manifests are ignored at parse time.

- **ChatGPT review — Negative vehicle caps (P3)** — Shared `normalizeCountCap()` clamps invalid `maxVehicles` in garage/prompt builders (negative values no longer become `slice(0, -1)`).

### Added

- **AI Command Tower design** - added `docs/AI_COMMAND_TOWER_DESIGN.md`, defining multi-AI task routing, reasoning-level policy, gate workflow, handoff packet format, conflict rules, and the boundary between coordination docs and a future runtime State Orchestrator.

- **Rules Profile Onboarding design** - added `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`, describing a goddess-style first-run setup flow that maps friendly questions and sandbox presets to `game_rules.json` without exposing every advanced flag up front.

## [1.75.1] - 2026-07-04

### Fixed

- **Gemini review — spawnWithTimeout process-tree kill (PR1)** — `killProcessTree()` uses `taskkill /T /F` on Windows and `pkill -P` + `SIGKILL` on POSIX so timed-out ComfyUI/Python grandchildren do not keep GPU VRAM. Extended `test_spawn_with_timeout.js` with a grandchild fixture.

- **Claude review — Vehicles tab UX polish follow-up (post-457639b)** — `applyI18n()` wires `data-i18n-aria-label` (F16/F17). Tile overlay marker declutter (F13): per-cell grouping, `+N` badge, raised glyph floors, clustered tooltips. `check_i18n_keys.js` scans `data-i18n-aria-label`.

### Added

- **Gemini review — Mobile Base disclosure/move contract tests** — `test_mobile_base_interior_disclosure.js` (party active MB only; settlement mismatch blocks interior). `test_mobile_base_move_vehicle_only.js` documents MB3 vehicle-only move (settlement ledger untouched).

## [1.75.0] - 2026-07-04

### Fixed

- **Claude UI/UX audit — Vehicle/Mobile Base i18n display** — enum/status/size/condition/armor/power/stock IDs render through Webview label dictionaries (`89a-vehicle-labels.js`); core snapshots pass `accessReasonCode` only (not English warning strings). 4-locale parity for access reasons, fuel bands, and common enums.

- **Claude audit — map ↔ Vehicles cross-navigation** — Tile overlay marker click opens Vehicles tab and selects the vehicle; detail card adds「地図で表示」/ Show on map → World tab + Tile mode + marker tooltip flash. Non-Tile modes show a Tile-mode hint when vehicle markers exist.

- **Claude audit — Mobile Base discoverability** — invalid/missing link shows a placeholder instead of silently hiding the section; `<details>` auto-expands when panel data is present.

### Added

- **Overlay vehicle readable list** — Tile map legend includes a keyboard-accessible vehicle marker list (F12 partial).

## [1.74.0] - 2026-07-04

### Fixed

- **ChatGPT review — FoW-safe rumored marker ids** — `overlayMarkerPublicId()` redacts canonical entity ids (`npc_*`, `faction_*`, `quest_*`, `discovery_*`, etc.) to `rumor_{kind}_{region}_{ordinal}` for `fogVisibility: 'rumored'` markers. `sanitizeOverlayMarker()` defense-in-depth for leaky ids. Remote Play / DevTools payloads no longer expose `secret_npc` or `faction_b` behind rumored labels. `test_map_overlay_core.js` extended.

- **ChatGPT review — Replay GM source timeline** — `advanceReplayGmSourceTimeline()` advances source `gmTurn` and `journalIndex` before `shouldIncludeEntry` skip, so excluded GM entries no longer shift chapter headings, dice blocks, or gallery extras. `test_replay_export_gm_timeline.js` added.

- **ChatGPT review — Replay gallery turn alignment** — `pickGalleryExtras()` matches `gmTurn` (not `worldTurn` vs replay `gmTurn`). `VisualMemoryEntry` gains optional `gmTurn` / `sourceEntryId`; `resolveEntryImage()` prefers `sourceEntryId`.

- **ChatGPT review — NPC acquaintance inference** — `deriveKnownNpcIds()` no longer promotes NPCs to known based on `visitedLocationIds`; only `lastInteractionTurn > 0` counts.

- **ChatGPT review — Replay export path containment** — `openReplayExport()` uses `isPathUnderWorkspaceExports()` instead of weak prefix `startsWith`.

- **Gemini review — bulk sim event-loop yield, replay snapshot freeze, Tier 0 prompt eviction** — async yield in bulk simulation; `snapshotReplayBuildInput()` deep-clones export inputs; prompt budget never evicts Tier 0 chunks.

- **Grok review — settlement cross-ledger atomicity, prompt bloat, webview sanitization** — M4 cross-ledger tests; settlement prompt bloat regression; webview payload sanitize hardening.

### Added

- **Mod System MOD1 pure resolver** — `modSystemCore.ts` load-order resolver (no I/O). `test_mod_system_core.js`.

- **Tech debt (review follow-up) — GM prompt bloat + region hazard line** — `vehicles`/`mobileBase` chunk priorities lowered (64/63) so they evict before `worldForge` under budget pressure. `buildVehiclePromptContext()` skips V5 integration lines in `compact` mode; per-chunk limit 800 chars in compact. `regionHazardPromptCore.ts` injects one capped hazard flavor line into World Forge context when the player region has a `hazard` tag. Tests: `test_prompt_budget_eviction.js` (vehicle eviction), `test_region_hazard_prompt_core.js`.

- **Vehicle System V5 trade/settlement/map integration** — `vehicleIntegrationCore.ts` adds GM helper lines (cannot-enter access, trade narration, repair/refuel service hooks). `world_forge.json` locations may declare optional `vehicleAccess`. Map overlay gains `vehicle` / `vehicle_parking` markers when `enableVehicleSystem` is ON. Garage panel uses forge access profiles. `test_vehicle_integration_core.js`, `test_webview_vehicle_integration.js`.
- **Mobile Base System MB5 interior view reuse** — `mobileBaseInteriorCore.ts` builds `mobileBaseInterior` payload (validated link → `settlementView` + optional `settlementDiorama`). Triple gate; blocks `locked`/`damaged`/`unsafe` interior without leaking layout. Webview reuses M3 Canvas and M5 Diorama renderers; Vehicles panel adds interior view buttons. `test_mobile_base_interior_core.js`, `test_webview_mobile_base_interior.js`.
- **Mobile Base System MB4 read-only Webview panel** — `mobileBaseViewCore.ts` builds capped `MobileBasePanelSnapshot` (facilities, stock bands, concerns, docking, hull/fuel, hangar). `mobileBaseBridge.buildMobileBasePanelWebviewPayload()` + `worldView` postMessage when triple gate ON. `89b-mobile-base-panel.js` section in Vehicles tab. No disk writes. `test_mobile_base_view_core.js`, `test_webview_mobile_base_panel.js`.

- **Vehicle System V4 read-only Webview garage panel** — `vehicleViewCore.ts` builds capped `VehicleGarageSnapshot`; `vehicleBridge.ts` + `worldView` postMessage (`enableVehicleSystem`, `vehicleGarage`). New tab `pane-vehicles` + `89-vehicles.js` / `89-vehicles.css`: fleet list, active vehicle card, cargo/crew bars, modules, fuel band, access warnings. No disk writes from Webview. `scripts/test_vehicle_view_core.js`, `test_webview_vehicle_garage.js`.

- **Mobile Base System MB3 mobileBaseOps apply gate** — `mobileBaseOpsCore.ts` parses/applies `turn_result.mobileBaseOps` (max 8): `dock_mobile_base`, `undock_mobile_base`, `move_mobile_base`, `consume_mobile_base_fuel`. Triple-flag gate; writes `vehicle_state.json` only (no settlement cross-write). `mobileBaseTurnOps.ts` wired in `statePatch` alongside `vehicleOps`. `scripts/test_mobile_base_ops.js`.

- **Vehicle System V3 vehicleOps apply gate** — `vehicleOpsCore.ts` parses/applies `turn_result.vehicleOps` (max 8): `set_active_vehicle`, `move_vehicle`, `damage_vehicle`, `repair_vehicle`, `refuel_vehicle`. `vehicleTurnOps.ts` persists to `vehicle_state.json` when `enableVehicleSystem` is ON (gated in `statePatch` / `turnLedgerPersistCore`). Cargo/module/carrier ops remain blocked. `scripts/test_vehicle_ops.js`.

- **Mobile Base System MB2 prompt wiring** — `mobileBaseBridge.ts` + `enableMobileBaseSystem` (default OFF; requires `enableVehicleSystem` + `enableSettlementMode`). `[Mobile Base]` GM prompt chunk links `vehicle.mobileBase` to `settlement_state.json` via `resolveActiveMobileBaseVehicle()`. `scripts/test_mobile_base_bridge.js`.

- **Vehicle System V2 I/O + GM prompt** — `vehicleState.ts` loads optional `vehicle_state.json` (mtime cache). `enableVehicleSystem` (default OFF) in `game_rules.json` gates `[Vehicles]` prompt chunk in `gmPromptBuilder`. `buildVehiclePromptContext()` prefers vehicles at `game_state.world.currentLocationId`. `scripts/test_vehicle_state.js` + prompt activation tests.

- **Vehicle System V1 pure core** — `vehicleCore.ts`: `parseVehicleState()`, `canVehicleAccessLocation()`, `validateVehicleFleet()` (fleet/carrier/hangar cycle and size checks), `buildVehiclePromptLines()`. Independent `vehicle_state.json` contract; size/access tags; no I/O or Webview. `scripts/test_vehicle_core.js`.

- **Mobile Base System MB1 pure link core** — `mobileBaseCore.ts`: `parseMobileBaseLink()`, `validateMobileBaseLink()`, `buildMobileBasePromptLines()` bridging Vehicle + Settlement ledgers (ship/landship/caravan/mobile_community). No cross-ledger writes. `scripts/test_mobile_base_core.js`.

## [1.73.0] - 2026-07-04

### Added

- **Settlement Mode M5 finish — Three.js lazy load** — `webview/vendor/three.min.js` is no longer prepended into `script.js`. Diorama mode lazy-loads Three.js on first use via `loadThreeJsLazy()` + `window.__LR_THREE_SCRIPT_URI__` from `extension.ts`. Default-OFF users avoid the Three.js parse cost. `test_webview_world_modules.js` asserts bundle separation.

### Added (carried from Unreleased development)

- **3-AI code review fixes (Settlement M5 + overlay + subprocess)** — M5a `revision` fingerprint and selected-layer local Z (fixes underground layers rendering below ground). M5b reuses WebGL renderer on content change (`revision`-aware rebuild) instead of `forceContextLoss` per update. `buildMapOverlayFromContext()` lets World View share one loaded snapshot with overlay (no duplicate disk reads / turn drift). `spawnWithTimeout` hard-kills hung ComfyUI/cartography/image-gen subprocesses. Tests: `test_settlement_diorama_revision_z.js`, `test_map_overlay_context_coherence.js`, `test_spawn_with_timeout.js`.

- **Settlement Mode M5b host diorama wiring** — `settlementDioramaBridge.ts` builds `settlementDiorama` from sanitized `settlementView` when both `enableSettlementMode` and `enableSettlementDiorama` are ON. `game_rules.json` gains `enableSettlementDiorama` (default OFF). `worldView` postMessage includes `enableSettlementDiorama` / `settlementDiorama`; overmap theme maps to diorama palette. No GM prompt, persistence, or remote/replay changes. `scripts/test_settlement_diorama_bridge.js` added.

- **Settlement Mode M5b Three.js diorama Webview renderer** — Read-only low-poly diorama view, Webview-only (no `*Core.ts`, no persistence, no `settlementOps`, no `insertChatText`). New module `webview/modules/86c-settlement-diorama.js` + `webview/styles/99-settlement-diorama.css`, registered as a sixth World map mode (`#world-map-mode-diorama` / `#world-diorama`), never replacing the existing Settlement Canvas (M3b). The renderer consumes only `msg.settlementDiorama` (the M5a `SettlementDioramaSnapshot`) and `msg.enableSettlementDiorama` — it never reads `settlement_state.json`/`settlement_layout.json`/raw `settlementView`. `blocks[]` become `BoxGeometry` meshes, `markers[]` become small cones/cylinders/boxes by kind, colors come from a closed client-side material→color map crossed with `snapshot.palette`; camera honors the `fixed_orbit` suggestion (`target`/`distance`/`yaw`/`pitch`/min/max) via a hand-rolled orbit (drag to rotate within pitch clamps, wheel to zoom within distance clamps, Reset/Fit buttons) — no OrbitControls, no fly/first-person camera. Hover/click raycasts against the mesh list and shows the sanitized `label` in a read-only detail panel (HTML-escaped). Three.js is vendored locally as `webview/vendor/three.min.js` (r149, MIT, UMD/global build — the only npm-published version with a non-ES-module `THREE` global; newer releases ship ESM-only) and prepended directly into the `script.js` bundle by `build-webview.js` so `THREE` exists before `86c` runs, with no CDN, no `extension.ts` change, and no separate `<script>` tag needed. Degrades gracefully to a marker-list text fallback (`#world-diorama-marker-fallback` + `#world-diorama-unavailable`) when `THREE`/WebGL is unavailable, and to an empty-state message when the flag is off or no snapshot has been sent yet. `85-world.js` gained `syncDioramaMapModeUi()` (shows the mode button only when `enableSettlementDiorama === true` **and** the snapshot has blocks/markers) mirroring the existing `settlement` mode-switch pattern. New i18n keys (`mapModeDiorama`, `dioramaEmpty`, `dioramaUnavailable`, `dioramaReset`, `dioramaFit`, `dioramaZoomIn`, `dioramaZoomOut`, `dioramaMarkerList`) added to all four locales. `scripts/test_webview_world_modules.js` extended with bundle-order, symbol, and read-only (`no insertChatText/writeJsonAtomic/fs/settlementOps`) assertions. Verified via a static preview harness (mocked `_dioramaWorldMsg`) confirming actual WebGL rendering (GPU pixel sampling + screenshot), zoom in/out/reset, detail-panel click selection, and both fallback states. Host wiring (`enableSettlementDiorama` flag default/persistence, `worldView.ts` → `buildSettlementDioramaSnapshot()`, remote/replay) is **not** part of this pass — see `AI_SHARED_LOG.md` for the Grok follow-up note. `npm test` **157/157**, `npm run compile`, `test_webview_world_modules.js`, `check_i18n_keys.js`, `validate_utf8_docs.js` all pass.

- **Settlement Mode M5a diorama snapshot pure core** — `settlementDioramaCore.ts`: pure `buildSettlementDioramaSnapshot()` converts sanitized M3 `SettlementViewSnapshot` into capped low-poly scene primitives (`blocks`, `markers`, optional `labels`, `camera`, `palette`). Closed tile-code → material mapping, allow-list pickers, deterministic caps with warnings. No Three.js, Webview, persistence, or raw canonical JSON. `scripts/test_settlement_diorama_core.js` added.

- **Settlement Mode M5 Low-poly Diorama design/gate** - added `docs/SETTLEMENT_MODE_M5_DESIGN.md` and `docs/SETTLEMENT_MODE_M5_CHATGPT_GATE.md`. M5 is a dream track, default OFF, split into M5a pure `settlementDioramaCore.ts` snapshot from sanitized M3 `settlementView` and M5b Three.js read-only renderer behind a later gate. Parent Settlement design and AI prompts now link the M5 contract. Design only; no runtime code.

- **Settlement Mode M3b/M4c isometric Webview UX polish** — Visual/UX-only pass, no `*Core.ts` or persistence changes. `86b-settlement-isometric.js` / `98-settlement-isometric.css` / `index.html`: (1) layer buttons now show a small dot affordance for layers absent from `view.layers` (genuinely unbuilt, per `deriveEffectiveSettlementLayers`) with a translated title hint; (2) a new `#world-settlement-layer-note` shows "This layer has no tiles or markers yet." when a *present* layer has zero tiles/markers and no expansion preview is shown (avoids stacking with the expand panel's own hint); (3) the expand panel gained a per-layer heading ("Preview options for {layer}") and the currently-previewed profile button now gets an `is-active` highlight so hovering multiple missing-layer options has clear visual feedback; (4) the ghost expansion preview's dashed outline changed from a near-invisible `rgba(0,0,0,0.35)` stroke to a bright high-contrast dashed stroke (`drawIsoDiamond` gained an optional `strokeOverride` param) so the preview reads clearly against any tile color; (5) fixed a pre-existing zoom-pivot bug in `drawSettlementIsometric()` — the canvas scaled around the literal canvas center while the isometric origin places content off-center, so any non-1 zoom (including the existing "Fit" button) drifted the whole layer toward a corner; the pivot now tracks the content's true geometric center, leaving the zoom=1 resting view pixel-identical while fixing Fit/zoom-in/out; (6) switching settlement layers now auto-recenters (transient, not persisted to `localStorage`) instead of keeping a differently-sized layer's stale pan/zoom, which is what surfaced the pivot bug; (7) the detail panel body and marker fallback list gained `max-height` + scroll instead of unbounded growth for long sanitized text. New i18n keys (`settlementExpandForLayer`, `settlementLayerUnbuilt`, `settlementLayerEmpty`) added to all four locales. Verified via a static preview harness (mocked `_settlementWorldMsg`) exercising present/missing/empty-layer states, ghost hover-swap, and the Fit/zoom pivot fix. `npm test` **156/156**, `test_webview_world_modules.js`, `test_settlement_view_core.js`, `check_i18n_keys.js`, `validate_utf8_docs.js` all pass.

- **M2a remote player mini-map** — `remote-player/index.html`/`player.css`/`player.js` add a collapsible, read-only mini-map panel above `#chat-log`. Renders `state.mapOverlay.markers[]` (already sanitized by `buildMapOverlaySnapshot`/`buildWorkspaceMapOverlay`) as colored dots on a 64x64 canvas grid, colored by marker kind/tone (falls back to `MAP_TONE_COLORS`, matching the Webview `86-tile-overmap.js` palette). `fogVisibility: 'rumored'` markers render semi-transparent with a ring outline. Tap/click shows a bottom tooltip with `label` and optional `detail` (both HTML-escaped via the existing `escapeHtml` helper), auto-hiding after 4s. Panel hides entirely when `mapOverlay` is missing or `markers` is empty. No click handlers write state or call `insertChatText`/`postMessage`; the panel only reads `state.mapOverlay` from the existing WebSocket `state` broadcast. Legend lists only the marker kinds present. Manually verified via a static preview harness (mocked WebSocket `state` push) on a 375px mobile viewport.

- **M2 replay/remote map overlay wiring** — `mapOverlayBridge.ts` centralizes workspace loading for `buildMapOverlaySnapshot()`. `worldView`, `replayExport`, and `remotePlayServer` all consume the same sanitized snapshot (`sanitizeMapOverlaySnapshot` / `pickMapOverlaySnapshotKeys`). Replay HTML/Markdown exports append a FoW-safe map overlay section. Remote play `state` broadcasts include `mapOverlay`. `scripts/test_map_overlay_replay_remote.js` added.

- **Settlement Mode M4c UX preview/request flow** — Webview-only, no new persistence. `settlementViewCore.ts` adds `buildSettlementExpansionPreviews()`: a pure, read-only ghost preview per missing layer (`z1`/`z0`/`z-1`/`z-2`), computed in-memory via the existing M4a `applyExpandLayerToLayout()` and capped at `MAX_EXPANSION_PREVIEWS`. `worldView.ts` attaches the result as `settlementExpansionPreviews` on the `worldView` postMessage (sibling to `settlementView`, same pattern as `mapOverlay`/`tileOvermap`). `86b-settlement-isometric.js` renders a dashed/translucent ghost overlay for the hovered profile and a bounded "Request cellar / waterworks / shelter / ruins / roof / watch platform / expansion" button panel per currently-viewed missing layer (existing layers never show the panel); clicking a button only calls `vscode.postMessage({ type: 'insertChatText', ... })` with a structured `expand_layer` request for the GM to act on — the Webview never writes `settlement_layout.json` and never calls `settlementOps` apply directly. Persistence remains exclusively the M4b `turn_result.settlementOps.expand_layer` ledger path, untouched by this change. i18n added to all four locales. Tests: extended `test_settlement_view_core.js` (determinism, no-mutation, key allow-list, missing-layer/profile coverage) and `test_webview_world_modules.js` (new symbols + fs-free assertion on the settlement module). `npm test` **149/149**.

### Fixed

- **Settlement state entity dedupe** — `parseSettlementState()` now dedupes `structures`, `residents`, `visitors`, `merchants`, and `incidents` on parse (last-wins, matching stocks/layout). Aligns canonical state with view-layer dedupe expectations. `scripts/test_settlement_state_entity_dedupe.js` added.

- **Settlement layout layer normalization (PR3)** — `parseSettlementLayout()` now dedupes zone/marker IDs (last-wins), unions declared `layers` with zone/marker `layerId` refs into effective layers, and sorts canonically. `deriveEffectiveSettlementLayers()` drives `buildLayerSummaries()` and `buildSettlementExpansionPreviews()` so orphan zones do not trigger false missing-layer CTAs. `scripts/test_settlement_layout_layer_normalization.js` added.

- **Settlement Z-level marker semantics (PR5)** — `buildStateMarkers()` scopes residents/visitors/merchants and `stock_low` markers to `z0` only; unresolved incidents render on the layer of their associated structure (`incident.kind` → `structure.layerId`, else `z0`). Prevents the same NPC appearing on every Z layer. `scripts/test_settlement_marker_layer_semantics.js` added.

- **Settlement expansion retry determinism (PR4)** — `deriveExpansionSeed()` no longer mixes `worldTurn` into the default hash (`settlementId:layerId:profile` only). Re-applying the same `expand_layer` op after reconcile at a different turn yields identical zone/marker coordinates; explicit `op.seed` / `context.seed` overrides unchanged. `scripts/test_settlement_expansion_retry_determinism.js` added.

- **Cross-ledger valid no-op contract (PR2)** — `tryApplyDiscoveryTurnOps()` / `tryApplyCampaignResourceTurnOps()` return structured `{ ok, applied }`; `persistTurnLedgersAfterCommit()` treats `{ ok: true, applied: false }` as handled for all ledgers (matching M4b settlement layout). Eliminates false partial-failure logs for valid discovery/resource no-ops.

- **Settlement zero-stock semantics (PR1)** — `adjustStockList` retains stock entries at `amount: 0` after consumption instead of removing them. Depleted supplies keep `(OUT)` prompt text, shortage event weights, and settlement pressure band signals. `scripts/test_settlement_stock_zero_semantics.js` added.

- **Settlement Mode M4b review fix** - separated `settlement_layout` ledger no-op handling from write failure handling. Existing `applySettlementLayoutTurnOps()` still reports actual disk writes, while the post-commit ledger path now treats valid no-op `expand_layer` ops as handled instead of logging a false partial failure. Missing `settlement_state.json` during apply now returns structured failure (`ok: false`) rather than a silent no-op. Added cross-ledger regression coverage.

## [1.72.0] - 2026-07-04

### Added

- **Settlement Mode M4b layout persistence** — `settlementLayoutTurnOpsCore.ts` / `settlementLayoutTurnOps.ts`: post-commit ledger apply for `turn_result.settlementOps.expand_layer` only; writes `settlement_layout.json` via `runSerializedSettlementLayoutMutation` + `writeJsonAtomic` when `enableSettlementMode` is ON. `settlement_state.json` read-only; no circuit breaker. `turnLedgerPersistCore` に `settlement_layout` target 追加、`statePatch` ledger phase 配線、`TurnResult.settlementOps` 型追加。`scripts/test_settlement_layout_turn_ops_core.js` / `test_settlement_layout_turn_ops.js` 追加、`test_cross_ledger_partial_failure.js` 拡張。テスト **149/149**。

## [1.71.0] - 2026-07-04

### Added

- **Settlement Mode M4a limited layer expansion** — `settlementLayerExpansionCore.ts`: pure `applyExpandLayerToLayout()` with bounded `expand_layer` profiles (`cellar`/`waterworks`/`shelter`/`ruins`/`roof`/`watchtower`/`generic`), deterministic seed derivation, zone/marker templates only (no tile arrays), layer/zone/marker caps, input immutability. `settlementCore.ts` に `ExpandLayerOp` パーサー stub 追加。`scripts/test_settlement_layer_expansion_core.js` 追加。テスト **147/147**。disk persistence / turn_result apply は未実装（M4b 別ゲート）。

## [1.70.0] - 2026-07-04

### Added

- **Settlement Mode M3b isometric Webview renderer** — World タブに **Settlement** マップモードを追加。`86b-settlement-isometric.js` + `98-settlement-isometric.css` で `settlementView` を Canvas 等角投影描画（ASCII グリフ、pan/zoom/reset/fit、レイヤー Z+1/Z0/Z-1/Z-2、hover ツールチップ、read-only 詳細パネル、マーカー一覧フォールバック）。クリックによる state 書き込みなし。表示設定は localStorage のみ。`worldView.settlementView` 配線 + `settlement_layout.json` ローダー + `setSettlementViewLayer` ハンドラ。4 ロケール i18n。テスト **146/146**。

## [1.69.0] - 2026-07-04

### Added

- **Settlement Mode M3a settlement view snapshot** — `settlementViewCore.ts`: pure `buildSettlementViewSnapshot()` with layer filtering, deterministic fallback layout (`layout_fallback` warning), zone/marker projection from optional `settlement_layout.json`, sanitized tile/marker allow-lists, caps, and qualitative `stock_low` / incident markers (no secret text or raw stock quantities). `scripts/test_settlement_view_core.js` 追加。テスト **146/146**。

## [1.68.0] - 2026-07-04

### Added

- **Settlement Mode M2a Webview map overlay** — `86-tile-overmap.js` が `worldView.mapOverlay` を既存タイル overmap Canvas 上に描画。7種マーカー（npc/merchant/caravan/faction_control/quest/discovery/settlement_pressure）を種別ごとの色・記号で表示。`fogVisibility: rumored` は半透明＋劣化グリフ。hover で `label`/`detail` を read-only ツールチップ表示。クリックによる state 書き込みなし（C9 不変条件）。`test_webview_world_modules.js` にシンボル検証追加。テスト **145/145**。

## [1.67.0] - 2026-07-04

### Added

- **Settlement Mode M2 pure cores** — `mapOverlayCore.ts`: FoW-safe `buildMapOverlaySnapshot()` (NPC/merchant/caravan/faction/quest/discovery/settlement-pressure markers, allow-list keys, per-kind caps). `settlementEventCore.ts`: deterministic adaptive event candidate selector + `deriveLegacyNote()` (no disk apply). `worldView` に `mapOverlay` ペイロードを追加（描画は未実装）。テスト **145/145**。

### Docs

- **Settlement Mode M4 design** — `docs/SETTLEMENT_MODE_M4_DESIGN.md` and `docs/SETTLEMENT_MODE_M4_CHATGPT_GATE.md`: designed limited Z-level expansion as M4a pure in-memory `expand_layer` core plus a separate M4b persistence apply-gate. Valid layers remain bounded to `z1`, `z0`, `z-1`, and `z-2`; no geology/mining/pathfinding/full tile arrays/direct Webview writes. Added M4 handoff prompts to `docs/SETTLEMENT_MODE_AI_PROMPTS.md`.
- **Settlement Mode M3 design** — `docs/SETTLEMENT_MODE_M3_DESIGN.md` and `docs/SETTLEMENT_MODE_M3_CHATGPT_GATE.md`: designed the StoneSense-style isometric settlement view as a two-step read-only projection. M3a defines `settlementViewCore.ts` snapshot generation from `settlement_state.json` / optional `settlement_layout.json`; M3b defines Canvas rendering with layer selector, pan/zoom, ASCII-safe fallback, and no state writes. Added M3 handoff prompts to `docs/SETTLEMENT_MODE_AI_PROMPTS.md`.
- **Settlement Mode M2 ChatGPT/Codex gate** — `docs/SETTLEMENT_MODE_M2_CHATGPT_GATE.md`: cleaned the M2 design contract and executed the sanitize/FoW gate in-session. M2a is approved as a `buildMapOverlaySnapshot` projection with strict marker allow-listing for Webview/replay/remote payloads; M2b is approved as a pure settlement event selector with no disk apply or `turn_result` wiring.

- **Settlement reference patterns** — `docs/SETTLEMENT_REFERENCE_PATTERNS.md`: added Caves of Qud and Kenshi pattern extraction for M2+ design. Qud is scoped to procedural history, village hubs, discoveries, and appraisal loops; Kenshi is scoped to outpost vulnerability, faction world-states, caravans/merchants, and away-time pressure. Updated Settlement design, AI prompts, and roadmap links. Design only; no code changes.
- **Narrative structure patterns** — new `docs/NARRATIVE_PATTERNS.md`: companion to Settlement reference patterns, scoped to *narrative-shaped* inspiration rather than simulation-shaped. Extracts Quality-Based Narrative (Fallen London/StoryNexus), RimWorld's adaptive event-pacing "storyteller," Wildermyth's legacy-props/scars pattern, and King of Dragon Pass/Six Ages-style single-decision framing. Cross-linked from `SETTLEMENT_REFERENCE_PATTERNS.md` and `AI_ROADMAP.md` M2 checklist. Design only; no code changes.
- **Settlement Mode M2 design** — new `docs/SETTLEMENT_MODE_M2_DESIGN.md`: splits M2 into two independent tracks. **M2a Map Overlay Layer** — NPC/merchant/caravan/faction/quest/discovery/settlement-pressure markers on the existing macro tile overmap, derived + non-persisted + never in GM prompt (same pattern as `tileOvermapCore`), with a single sanitize choke point (`buildMapOverlaySnapshot`) that webview/replay/remote all route through and normative FoW rules (resolves the M1 gate's Webview/replay/remote leak blocker). **M2b Settlement Event Pacing** — new `settlementEventCore` as a pure selector (RimWorld-style adaptive weighting + per-category cooldown, Wildermyth-style legacy notes); settlementOps disk apply stays deferred to a separate apply-gate. Includes data contract, per-source feature gating, module plan, acceptance tests, and AI handoff. Design only; no code changes.

## [1.66.0] - 2026-07-04

### Changed

- **世界観テーマでUI全体の配色が変わるように（Fable 5）** — これまでテーマボタンは背景グラデ（背景画像がない時のみ）しか変えなかったが、`body[data-ui-theme]` ＋ RGB変数（`--vr-accent-rgb` 等）駆動で、メッセージバブル・アクティブタブ・選択肢ボタン・送信ボタン・見出しチック・フォーカスリング・GMタイピングドット等のアクセント色が全テーマ追従するように。選択中のテーマボタンもアクセント色でハイライト。
- **テーマ整理** — `FF14` ボタンを削除（名称が直接的すぎるため。旧セーブの `theme: "ff14"` は既定ブルー＋既存背景グラデで互換維持）。新テーマ **Eastern**（茜×金、和風）・**Horror**（血赤×闇）・**Steampunk**（真鍮×セピア）を追加（背景グラデ＋UIパレット、`gmBridgeRunner.ts` の theme 語彙も更新）。
- 実装は `97-visual-refresh.css` に集約。注意点として、カスタムプロパティ内の `var()` は宣言要素で解決されるため、`--accent` 等の派生変数は `:root` ではなく `body[data-ui-theme]` 側で宣言している。

## [1.65.0] - 2026-07-04

### Changed

- **Webview visual refresh（Fable 5）** — 最後に読み込まれる新規レイヤー `webview/styles/97-visual-refresh.css` で見た目を統一的に洗練（既存CSS非破壊）。背景にアクセント色のラジアルグラデで奥行き、チャットタイトルにグラデーションテキスト、メッセージバブルを非対称ラウンド＋グラデ面＋洗練シャドウに、senderラベルをマイクロキャップスに、アクティブタブをピル＋発光アンダーラインに、セクション見出しにアクセント縦チック、選択肢ボタンをカード風グラデに、クイックリプライをゴーストチップに、入力欄をインセットシャドウ＋フォーカスリングに、Author's Note をアンダーラインスタイルに、リソースバーに内側ハイライト、スクロールバー細身化。狭いVSCodeパネルでヘッダーのボタン群が折り返すと切れていた問題も修正（高さ可変化）。静的ハーネスでレンダリング確認済み。

## [1.64.0] - 2026-07-04

### Changed

- **Webview UX polish（Fable 5）** — GMターン待ちの「考え中…」に、アニメーションするタイピングドット＋経過秒カウンタ（3秒超で表示）を追加し、長考中の生存感を改善。GM実行中は Quick Reply の Undo/Retry もロックして二重操作を防止。タブ列とクイックリプライ列（スクロールバー非表示の横スクロール）に端フェードを追加し「続きがある」ことを可視化。キーボード操作向けに `:focus-visible` フォーカスリング、`prefers-reduced-motion` 対応を追加。新規 `webview/styles/15-ux-polish.css` ＋ `20-input-audio-prep.js` の showGmLoading/hideGmLoading のみの変更（他モジュール非破壊）。テスト **143/143**。

## [1.63.0] - 2026-07-04

### Added

- **Settlement Mode M1 (pure core)** — `settlementCore.ts` / `settlementState.ts`: independent `settlement_state.json` parser, caps, deterministic tick (stock consumption, visitor/merchant/incident expiry), prompt-safe `[Settlement]` chunk gated by `enableSettlementMode` (default OFF), `settlementOps` type/parser stubs only (no disk apply). Optional `settlement_layout.json` contract parser. `scripts/test_settlement_core.js` + prompt chunk activation tests. テスト **143/143**.

### Docs

- **Settlement Mode ChatGPT/Codex gate** — `docs/SETTLEMENT_MODE_CHATGPT_GATE.md`: M1 contract/security gate executed in-session; `docs/SETTLEMENT_MODE_AI_PROMPTS.md` §1 is now an in-session gate (no cross-session paste loop).
- **Settlement Mode / StoneSense-style View design** — `docs/SETTLEMENT_MODE_DESIGN.md` and `docs/SETTLEMENT_MODE_AI_PROMPTS.md`: DF/CDDA/StoneSense/RimTalk-inspired M1–M5 plan.
- **Fable5 Wave 2 ブリーフ（F7–F12）** — `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md`: F7 謁見の間 / F8 隣国ライバル領主 / F9 主命・派遣 / F10 合戦リゾルバ / F11 ギルドマスター（温め枠）/ F12 家史エピローグ。`docs/PHASE_NAMING.md` に Wave 2 表を追加、F1–F5 の状態を出荷済みに更新。

## [1.62.0] - 2026-07-03

### Fixed

- **Split Brain サーキットブレーカー（PR-C impl）** — 長時間セッション向け横断 hardening。
  - `workspaceWriteCircuitBreakerCore.ts` — リトライ 1 回、連続失敗 3 回で circuit open、`executeCrossFileDualWrite`。
  - `workspaceStateQueue.ts` — game_state / world_state キューに guarded enqueue + 独立 circuit。
  - `workspaceWriteHealth.ts` — split-brain risk イベント記録（game_state ロールバックなし）。
  - `livingWorldCommercePersist.ts` — commerce dual-write を cross-file orchestrator 経由に。
  - `stateManager.ts` / `worldState.ts` — I/O 失敗を circuit に伝播、circuit open 時は書き込み拒否。

### Added

- `test_workspace_write_circuit_breaker.js` — circuit / retry / dual-write / queue 統合を検証。テスト **142/142**。

## [1.61.0] - 2026-07-03

### Fixed

- **Ledger sanitization（PR-E）** — Campaign Kit 台帳フィールドの Webview / Replay export 追従。
  - `campaignLedgerWebviewSanitizeCore.ts` — FoW-safe `pickDiscoveriesForWebviewCore` / `pickResourcesForWebviewCore`、whitelist 定数。
  - `campaignKitBridge.ts` — pure core に委譲。
  - `replayExportSanitizeCore.ts` — `discoveryOps` / `campaignResourceOps` / `valueHint` / `estValue` 等を export 赤札に追加。

### Added

- `test_ledger_sanitization.js` — Webview FoW・whitelist・export 赤札を検証。テスト **141/141**。

## [1.60.0] - 2026-07-03

### Fixed

- **Cross-ledger 部分失敗の補償方針（PR-D）** — `game_state` commit 成功後に discoveries / campaign_resources の片方だけ書き込み失敗した場合の契約を明文化・構造化。
  - `turnLedgerPersistCore.ts` — `CROSS_LEDGER_COMPENSATION_POLICY`（game_state ロールバックしない）、`persistTurnLedgersAfterCommit()`。
  - `statePatch.ts` — ledger outcome を検査し partial failure を structured log で出力。

### Added

- `test_cross_ledger_partial_failure.js` — commit ゲート、partial/total failure 分類、sell_discovery × discoveryOps 不整合シナリオを検証。テスト **140/140**。

## [1.59.0] - 2026-07-03

### Added

- **Split Brain edge case テスト拡充（PR-C テスト先行）** — `game_state` / `world_state` 独立 FIFO キューの横断 edge case を文書化・検証。サーキットブレーカー実装前の現行 merge 契約を固定。
  - ネストした game/world キュー直列化、commerce dual-write、observer tick × commerce flush インターリーブ、turn commit × observer、domain turn × world observer、片方のみ書き込み成功時の deferred merge。

### Added (tests)

- `test_split_brain_queue_edge_cases.js` — 上記シナリオを pure merge + queue runtime で検証。テスト **139/139**。

## [1.58.0] - 2026-07-03

### Fixed

- **プロンプト inactive chunk 省略（PR-8）** — OFF モジュールの chunk を組み立て前にスキップし、eviction で lorebook/vision が落ちやすい問題を緩和。
  - `shouldIncludePromptChunk()` / `PromptChunkActivationContext` を `gmPromptBuilderCore.ts` に追加。
  - Campaign / Domain / Guild / Chronicle / LW / Commerce travel 等を game_rules フラグでゲート。
  - **Observatory ON 時は chronicle GM chunk を省略**（Webview 年代記と重複・journal 再読込を避ける）。Observatory OFF + `recapInPrompt` 時のみ GM に年代記要約。

### Added

- `test_prompt_chunk_activation.js` — モジュール OFF / Observatory 切替のゲートを検証。テスト **138/138**。

## [1.57.0] - 2026-07-03

### Fixed

- **独立台帳 write queue（PR-7）** — `discoveries.json` / `campaign_resources.json` の turn ops 直書きを FIFO 直列化。
  - `runSerializedDiscoveryMutation` / `runSerializedCampaignResourcesMutation` を `workspaceStateQueue.ts` に追加。
  - `readDiscoveryLedgerFromDisk` / `readCampaignResourcesFromDisk` — キュー内で最新 disk を読んでから apply + atomic write + cache clear。
  - `discoveryTurnOps` / `campaignResourceTurnOps` は read-apply-write 全体をキュー内で実行。

### Added

- `test_independent_ledger_write_queue.js` — FIFO 順序・キュー独立性・直列更新を検証。テスト **137/137**。

## [1.56.0] - 2026-07-03

### Fixed

- **Observatory 副作用契約（PR-6）** — watch は `game_state` 非接触だが **読取専用ではない**（`world_state` + `npc_registry` + questHooks 等を進める）。契約をコード・UI・Docs で明文化。
  - `OBSERVER_TICK_CONTRACT` / `observerPersistSequence()` を `worldObservatoryCore.ts` に追加。
  - `computeOneWorldStep()` と `persistWorldStepOutcome()` に分離（registry は world_state 保存前にまとめて persist）。
  - World タブに副作用注記（i18n ×4）、`WORLD_OBSERVATORY_WIRING_BRIEF.md` に契約表を追記。

### Added

- `test_observer_tick_side_effect_contract.js` — watch/advance 契約と persist 順序を検証。テスト **136/136**。

## [1.55.0] - 2026-07-03

### Fixed

- **world_state questHooks 並行書き込み** — 観測者 tick と `acceptCampaignJob` が同時に `saveWorldState` すると、古いスナップショットの `questHooks` で上書きされ campaign 受諾フックが消える可能性があった。
  - `mergeQuestHooks()` — id 単位で union merge（disk-only フックを保持、同一 id は incoming 優先）。
  - `mergeWorldStateForPersist()` — `questHooks` をスプレッド上書きから merge に変更。
  - `patchWorldStateQuestHooks()` — accept 経路はキュー内で最新 disk を読み、`questHooks` のみ patch（markets/worldTurn を巻き戻さない）。

### Added

- `test_world_state_quest_accept_observer_race.js` — observer 古い snapshot + accept patch の merge 契約を検証。`test_workspace_state_queue_core.js` に questHooks ケース追加。テスト **135/135**。

## [1.54.0] - 2026-07-03

### Fixed

- **Campaign resources 初期値の整合** — `campaign_resources.json` 未作成時、`resolveCampaignResourcesForPrompt()` が表示するデフォルト10と `applyCampaignResourceTurnOps()` の適用起点がズレていた（初回 `delta: -1` が 10→9 ではなく 0→0 になり得る）。未作成時は `defaultCampaignResourceQuantities(kit)` から seed するよう修正。
- **sell_discovery の台帳検証** — `commerceCore.applyTradeOp()` が発見物台帳を確認せず credits を加算していた。`discoveryLedgerCore.validateSellDiscoveryTrade()` を追加し、存在しない ID・sold/consumed・unidentified・推定額±50% 外の value を拒否。`livingWorldTurnOps` が ledger を渡すよう配線。
- **独立台帳の原子性** — `commitGameState()` が `CommitGameStateResult` を返すよう変更。`statePatch.processTurnResult()` は `commit.ok` が false（skip/quarantine）のとき `discoveryOps` / `campaignResourceOps` を書かない（CHANGELOG v1.45.3 の意図をコードで強制）。

### Added

- `test_sell_discovery_trade_ops.js` · `test_turn_artifact_commit_atomicity.js` 新規。`test_campaign_resources_core.js` に default-seed ケース追加。テスト **134/134**。

### Docs

- `docs/CAMPAIGN_OBSERVATORY_REVIEW_GEMINI_v1_53.md` — ChatGPT v1.53.0 レビュー（複数台帳整合性 P1×3）を Gemini トリアージと統合。v1.54.0 で PR1–PR3 を反映済みと記録。

## [1.53.0] - 2026-07-03

### Added

- **World Observatory** — 「変わりゆく世界を見守る」観測ダッシュボード。設計ブリーフは `docs/WORLD_OBSERVATORY_WIRING_BRIEF.md`(Opus 4.8)。`enableWorldObservatory` 既定OFF。
  - **相場スパークライン** — `marketPriceHistory`(`world_state.json`、locationId→commodityId→直近24件のpriceIndex、リングバッファ)を新規追加。純関数 `worldObservatoryCore.ts:appendMarketPriceHistory()` が加算的に履歴を積む。`worldStateCore.ts` に型・パーサー追加(既存の `markets`/`npcPositions` と同じ検証パターン)。
  - **年代記タイムライン** — 既存の `chronicleCore.ts`/`chronicleLoader.ts`(F1 Chronicle)の出力を World タブへ横流し。`enableWorldObservatory` 時のみ計算(`state_journal.ndjson` 再読込のI/Oコストを通常時は避ける)、末尾30件を送信。
  - **観測者モード(watch/advance)** — プレイヤーのターンなしで世界を1ティック進める。`watch`=無コストで世界のみ進行(markets/NPC関係/派閥)。`advance`=それに加え作中1日分の旅費食料を消費(既存 `applyTravelFoodConsumption` を再利用、Commerce有効時のみ)。
- **観測ティックの配線(非破壊)** — `webview/modules/88-world-observatory.js`(新規、独立モジュール)が自前の `message` リスナーで描画し、ホットな `85-world.js` を一切変更しない。ホスト側は `webviewHandlers.ts` に `observerWorldTick` case 1件、`extension.ts` に `handleObserverWorldTick()` 1関数を追加するのみ。
- **安全性の核心** — 観測ティックは既存 `emergentSimulator.ts:maybeTickSimulation` の中核ロジックを `runOneWorldStep()` として抽出・共有(挙動は不変、`test_emergent_simulator.js` で確認済み)。`watch` モードは `world_state.json` のみを変更し、`game_state.json`(Persist-Before-Narrate領域)には一切触れないため、観測を回してもプレイヤーのセーブは壊れない。`advance` モードの資源消費のみ、Commerce UI の直接取引(`executeLivingWorldDirectTrade`)と同じ安全な非同期・楽観的並行制御(`scheduleCommercePersist` + `readStateRevision`)を再利用して `game_state.json` へ反映する。
- **自動観測の氾濫対策** — 自動観測はWebview側の `setInterval`(最短1.1秒間隔、連続200tickで自動停止)で駆動し、ホストは冪等な1ティックハンドラに徹する(dispose漏れ・多重起動を回避)。
- `test_world_observatory_core.js` 新規(9ケース: 履歴の追記/上限/非破壊/不正値除去/`parseWorldState` ラウンドトリップとサニタイズ)。テスト **132/132**、`check_version_consistency.js` PASS。

## [1.52.0] - 2026-07-03

### Added

- **Campaign Kit Phase G — campaign resources** — Campaign Kitのジャンル別資源(postapoc_scavengerのwater/ammo/medicine等)を実際に消費・補給できるプレイヤー状態として正本化。`campaignResourcesCore.ts`(純関数): `campaign_resources.json`(任意, resourceId→数量, 0〜999999にクランプ)、初回は未作成でもアクティブなキットの全資源にデフォルト値10を自動補完して表示。
- **campaignResourceOps** — `turn_result.campaignResourceOps`(最大8件、`{ op: "delta"|"set", resourceId, amount, reason? }`)。`delta`は加減算(負値で消費)、`set`は絶対値固定。**アクティブなキットの語彙に無いresourceIdは Core が無害に無視**(discoveries.jsonの`DiscoveryKind`ゲーティングと同じ設計思想 — GMが未定義の資源を捏造できない)。`statePatch.ts`で`discoveryOps`永続化の直後に配線(`discoveries.json`と同じ独立ファイルパターン、`game_state.json`本体は非破壊)。
- **GM プロンプト** — `[Campaign Resources]`(優先度91、上限900字)で各資源の残量を表示、残量2以下は`(low)`、0は`(OUT)`と明示し「無視せず物語上の重みを持たせる」よう指示。
- **World タブ UI** — Campaign パネル上部に物資チップ(残量に応じて緑/黄/赤)を表示(i18n: en/ja/zh-CN/zh-TW)。

### Notes

- Commerce `tradeOps`とは意図的に非連携(独立したid空間) — 市場での購入が自動的に資源を補充するわけではなく、GMが物語として「井戸で水を補給した」等をcampaignResourceOpsで反映する設計。既存の`applyTravelFoodConsumption`(旅行時の食料消費、`PlayerCommerceState.food`)とは別軸(あちらはCommerce本体のbase resource、こちらはCampaign Kitのジャンル別資源)、共存可能。
- `test_campaign_resources_core.js`新規(パース・クランプ・キット語彙ゲーティング・0床止め・プロンプト表示を検証)。テスト **131/131**、`check_version_consistency.js` PASS。

## [1.51.0] - 2026-07-03

### Added

- **Faction reputation market demand** — 支配派閥へのプレイヤー評判が、その派閥が支配する市場の `priceIndex` を段階的にdriftさせる。`worldSimCommerceCore.ts` に `tickFactionReputationMarketDemand()` を追加: hostile(+25%)/unfriendly(+10%)/neutral(0%)/friendly(-10%)/allied(-20%)のtier別バイアスへ、1tickあたり最大0.03ずつ緩やかに近づく(既存の在庫回復/世界イベント連動とは独立した第二の価格ドライバ)。
- **配線** — `enableCommerce` と `enableFactionReputation` の両方が有効な場合のみ自動適用(`livingWorldBridge.ts` の `factionMarketDemandEnabled()`)。市場の所在地を World Forge の `WorldLocation.factionControl` から解決し、`world_state.factions[].playerReputation` を参照。新規フラグの追加は不要(既存2フラグの組み合わせ)。
- **Campaign Kit との連携** — `docs/CAMPAIGN_KIT_DESIGN.md` の Integration Matrix を更新。派閥支配下の探索地/拠点で「評判が悪いと足元を見られる、評判が良いと安く買い叩ける」という手触りが Campaign Kit のジャンルループ上でも自然に効くようになった。

### Notes

- `docs/COMMERCE_AND_AGENCY_BRIEF.md` の元設計(LW1-PR1「相場が派閥/regionイベントに連動」)を拡張する形で実装、既存の食料危機/鍛冶イベント連動とは重複しない。`test_faction_market_demand.js` 新規追加(tier別drift・1tickあたりcap・無関係派閥での無反応・`runLivingWorldTick`でのopt-in配線を検証)。テスト **130/130**、`check_version_consistency.js` PASS。

## [1.50.0] - 2026-07-03

### Added

- **Campaign Kit Phase F — services state machine** — `DiscoveryEntry` に `condition`(`standard`/`repaired`/`upgraded`/`damaged`)と `estValue`(GM基準価格見積もり)を追加。`computeSuggestedSellValue()` が `estValue × 倍率`(standard 1x/repaired 1.3x/upgraded 1.6x/damaged 0.6x)を算出し、これまで文章上のヒントに過ぎなかった「修理/改造で価値が変わる」を**数値としてCore正本化**した。
- **サービス可能性ゲート** — `isServiceableStatus`/`resolveDiscoveryConditionAfterPatch`(`discoveryAppraisalCore.ts`)により、`condition` の変更は発見物が `identified`/`appraised` の場合のみ適用され、`unidentified`(鑑定前は何を直すか分からない)・`sold`/`consumed`(既に手放した物は直せない)への `condition` op は Core が無害に無視する。`estValue` にはこのゲートは掛からない(GM側の見積もりでプレイヤー非公開)。
- **曖昧さの維持** — `discoveries.json` プロンプト・World タブとも、`condition`/推定売却額は `unidentified` の間は一切表示しない(`formatEntryLine`/`pickDiscoveriesForWebview` 双方でゲート)。鑑定前に価値が漏れる設計バグを避けた。
- **GM プロンプト連携** — `[Campaign Discoveries]` に `[condition] ~推定額` を追記。`sell_discovery` の交渉額をこの推定額に近づけるよう GM に指示。Campaign Kit の Services ループ行も「修理/改造で discoveryOps condition/estValue を設定」という具体的な手順に更新。
- **World タブ UI** — 発見物カードに condition バッジ + 推定額を表示(i18n: en/ja/zh-CN/zh-TW)。

### Notes

- `discoveries.json`・discoveryOps の既存フィールドは非破壊(追加フィールドのみ)。`test_discovery_ledger_core.js`/`test_discovery_appraisal_core.js`/`test_discovery_turn_ops_core.js` にゲーティング・倍率計算・曖昧さ維持のテストを追加。テスト **129/129**、`check_version_consistency.js` PASS。

## [1.49.0] - 2026-07-03

### Added

- **Campaign Kit Phase E — genre presets** — 組み込みプリセットに `modern_occult`（現代オカルト調査員）と `survival_horror`（サバイバルホラー）を追加。これで `CampaignKitGenre` enum の全ジャンル（fantasy / postapocalypse / space / eastern_fantasy / cyberpunk / modern_occult / horror）にプリセットが揃い、job board の `modern_occult` / `horror` テンプレート分岐が実プリセットで裏打ちされた。各プリセットは 6 種の発見物分類（material / lore / social / route / threat / quest）を完備。
- **テーマ推定の拡張** — `inferCampaignKitIdFromTheme` が occult/心霊/儀式/除霊 → `modern_occult`、horror/感染/outbreak/恐怖 → `survival_horror` を推定。両者は post-apoc の bare-`ruins` フォールバックより前に評価され、「haunted ruins」がサルベージ扱いにならない。
- **Services ループの GM 誘導** — `buildCampaignKitPromptBlock` に拠点サービス（修理・改造・補給・訓練）ガイダンス行を追加。**修理/改造で発見物の価値・用途が変わる**ことを明示し、価格/在庫変動は Commerce `tradeOps`、発見物の状態更新は `discoveryOps`（identifiedLabel/status）経由で正本化するよう GM に指示。
- **Game Rules UI** — Campaign Kit プリセットのドロップダウンに Modern occult / Survival horror を追加（i18n: en/ja/zh-CN/zh-TW）。

### Notes

- 追加は既存 Core（Commerce / Quest Hooks / World Forge）に非破壊。`campaignKitCore.ts` 一本に集約してホット共有ファイルへの同時編集を回避。`test_campaign_kit_core.js` にプリセット網羅・全ジャンル被覆・discovery taxonomy・services ループ検証を追加。テスト **129/129**。

## [1.48.0] - 2026-07-03

### Added

- **sell_discovery trade op** — `tradeOps` に `sell_discovery` を追加；鑑定済み発見物の売却で credits 加算 + `discoveryOps` で `sold` 遷移を GM プロンプトで案内。
- **Campaign quest reputation** — Job board / QuestHook に `factionId` を伝播；完了時 GM が `reputationOps` を出力するよう `[Active Quest]` プロンプトを拡張。
- **Webview** — Findings に **Sell finding**、Job board に **Client: factionId** バッジ。

### Fixed

- `campaignJobBoardCore` — `factionId` を location `factionControl` から解決（Region 型エラー修正）。
- `commerceCore` — `sell_discovery` を per-location trade delta 集計から除外。
- `factionReputationCore` — campaign クエストの `hook.factionId` を reputation 解決に使用。

## [1.47.0] - 2026-07-03

### Added

- **Campaign Kit Phase D** — Appraisal status machine (`discoveryAppraisalCore.ts`): valid transitions, auto-promote on `identifiedLabel`, GM prompt guidance; webview **Request/Complete appraisal** chat inserts.
- **Campaign job accept → questHooks** — World tab **Accept job** creates active `questHooks` (`source: campaign`); accepted postings hidden from board; `campaignJobQuestCore.ts` + `campaignJobAccept.ts`.

## [1.46.0] - 2026-07-03

### Added

- **Campaign Kit Phase C — Job/Rumor board** — `campaignJobBoardCore.ts`: deterministic hub postings from kit genre + World Forge expedition sites; GM prompt chunk `campaignJobBoard` (priority 92).
- **Campaign Kit World tab panel** — Discoveries ledger (status/kind badges, no GM `valueHint`) + job board with **Inquire** chat insert; `campaignKitBridge.ts` + `worldView.ts` payload.
- **Tests** — `test_campaign_job_board_core.js`; extended `test_world_view_simulation_payload.js` and prompt budget eviction checks.

## [1.45.3] - 2026-07-03

### Fixed

- **Campaign Kit review (v1.45.2 follow-up)**
  - `discoveryOps` は `commitGameState` 成功後のみ `discoveries.json` へ書き込み（失敗時の ledger だけ更新を防止）。
  - Game Rules UI の「自動」プリセットで `campaignKitId` を空文字にクリア可能に。
  - Agentic Referee が `discoveryOps` をパース・マージ。
  - Game Rules 更新時に Campaign Kit / Discovery キャッシュを無効化。
  - 無効 `discoveries.json` 読み込み時のキャッシュクリア；同一内容の no-op 書き込みをスキップ。

### Verification

- `npm test` **126/126**

## [1.45.2] - 2026-07-03

### Added

- **Campaign Kit Phase D-lite** — `turn_result.discoveryOps` persists add/update/remove to `discoveries.json` on turn apply.
- **Start Hub** — bundled `scrapbound-settlement` scavenger demo button.
- **Game Rules UI** — `enableCampaignKit` toggle + preset selector.

### Verification

- `npm test` **125/125**

## [1.45.1] - 2026-07-03

### Fixed

- **Campaign Kit review hardening**
  - `campaign_kit.json` が存在する場合は invalid でも `game_rules` にフォールバックしない。
  - 未知の `campaignKitId` はサイレント置換せず無効化。
  - `version !== 1` の kit を拒否。
  - テーマ推定: `space ruins` が post-apoc に誤マッチしないよう順序修正。
  - Discovery Ledger は Campaign Kit 有効時のみ GM 注入。
- **Scrapbound sample** — `playerRole: adventurer`、commerce ブロック修正、`enableNpcRegistry: false`。

### Verification

- `npm test` **124/124**

## [1.45.0] - 2026-07-03

### Added

- **Campaign Kit foundation** — `campaign_kit.json` / `game_rules.enableCampaignKit` for genre-agnostic hub-job-expedition-discovery loops; built-in presets (fantasy guild, post-apocalyptic scavenger, space frontier, eastern fantasy, cyberpunk courier).
- **Discovery Ledger (Phase B)** — optional `discoveries.json` injects `[Campaign Discoveries]` into GM prompt (unidentified salvage, rumors, route intel).
- **Scrapbound sample** — `sample-scenarios/scrapbound-settlement` post-apocalyptic scavenger demo (Campaign Kit + Commerce + discoveries seed).
- **Docs** — `docs/CAMPAIGN_KIT_QUICKSTART.md`; `CAMPAIGN_KIT_DESIGN.md` integration matrix + phase roadmap.

### Verification

- `npm test` **123/123**
- `npm run compile` クリーン

## [1.44.3] - 2026-07-03

### Fixed

- **Cross-review hardening（Grok 1.37.x + Gemini simulation）**
  - Commerce: `flushScheduledCommercePersist` を GM プロンプト構築前 + `turn_result` 適用前に同期実行；pending 検出 + 再入ガード。
  - Prompt: `clampSimulationPromptModule` で Domain/Guild ブロックを cap；競合時 eviction テスト追加。
  - Export: Parlor/LW3/ドリフト JSON フェンスを `replayExportSanitizeCore` で redact。
  - Merge: `mergeTurnStatusOnConflict` が UI 保護配列を正規化。
  - Webview: `pickDomainForWebview` / `pickGuildForWebview` の FoW 回帰テスト追加。

### Verification

- `npm test` **121/121**
- `npm run compile` クリーン

## [1.44.2] - 2026-07-03

### Docs

- **Version truth sync** — `docs/VERSION_TRUTH.md` · README version badges（4 ロケール）· Roadmap 要約 · `docs/FEATURE_MATRIX.md` Guild 行 · `AI_SHARED_LOG` Current Snapshot → **1.44.2**（G1–G4 完了反映）。
- **`scripts/check_version_consistency.js`** — `package.json` / `package-lock.json` / README バッジの整合チェック（`npm test` に登録）。

### Verification

- `npm test` **118/118**
- `npm run compile` クリーン

## [1.44.1] - 2026-07-03

### Fixed

- **G1–G4 Guild hardening（コードレビュー対応）**
  - G4: `refreshGuildSnapshotOnCommit` は hall 在席の `weekly_commit` のみ・`guildSinceLastVisit` を消さない；帰還ドリフトは単一シミュレーション；`adventurerBondMap` を travel drift に渡す；`recentChanges` の重複 eventId 衝突を index で回避；スナップショットから roster 復元。
  - G2/G3: クエスト cap 超過の accept を拒否；パーティ `npcIds` 重複排除；カウンター/クエストプロンプトのラベルサニタイズ。
  - 共通: `validateGuild` 冒険者 dedupe；`parseGuildSnapshot` / `parseSinceLastGuildVisitDelta` 検証強化；`enableGuildMode` OFF 時に sub-flags を強制 OFF。

### Verification

- `npm test` **117/117**（drift / quest / request 回帰テスト追加）
- `npm run compile` クリーン

## [1.44.0] - 2026-07-03

### Added

- **G4 Guild absence drift + Since-last-visit** — `src/guildDriftCore.ts` · `src/guildHallDriftCore.ts`: `simulateBoardWeek`（副長=最高 skill 冒険者、在席時 `maintain_hall`+`open_board`）、`computeSinceLastGuildVisitDelta`（cap 24週）、hall 離脱/帰還ドリフト。
  - 配線: `statePatch.applyGuildTravelDrift` · `guildTurnOpsCore.refreshGuildSnapshotOnCommit` · GM プロンプト Since-last-visit · `recentChanges` に `category:'guild'` 伝聞昇格 · `enableRivalGuild` 宣言のみ（未配線）。

### Verification

- `npm test` **117/117**（`scripts/test_guild_drift_core.js` 新規）
- `npm run compile` クリーン

## [1.43.0] - 2026-07-03

### Added

- **G3 Guild party dispatch + quest resolution** — `src/guildQuestCore.ts`: `assign_party`、`computeQuestGradeWeights`（skill×Bond×difficulty）、`resolveQuestOutcome`（同一 seed→同一 grade）、週次 `advanceActiveQuests`。
  - `guildCore.ts`: `assign_party` parse/apply、週次コミットで active クエスト tick・帰還判定、`lastQuestReports`。
  - 配線: `adventurerBondMap`（Registry `playerTrust`）· `enableGuildParties`（既定 OFF）· GM プロンプト `[Guild — Quests]` · World タブパーティ編成 UI · i18n 4言語。

### Verification

- `npm test` **116/116**（`scripts/test_guild_quest_core.js` 新規）
- `npm run compile` クリーン · `node scripts/build-webview.js` OK

## [1.42.0] - 2026-07-03

### Added

- **G2 Guild request board** — `src/guildRequestCore.ts` · `src/guildPromptCore.ts`: 10種依頼の決定論キュー、`resolve_request`（accept/decline/negotiate）、一括（bulk）/面談（full）GM プロンプト tier。
  - `guildCore.ts`: `open_board` で `pendingRequests` 生成（`requestsEnabled` 時のみ）、`applyGuildRequest` で accept/negotiate → `GuildQuest` 昇格（negotiate は報酬 20% 減）。
  - 配線: `guildBridge.buildGuildPromptContext` · `gmPromptBuilder` guild chunk · `game_rules.enableGuildRequests`（既定 OFF）· World タブ掲示板 UI（面談/裁定ボタン）· i18n 4言語。

### Verification

- `npm test` **115/115**（`scripts/test_guild_request_core.js` 新規）
- `npm run compile` クリーン · `node scripts/build-webview.js` OK

## [1.41.0] - 2026-07-03

### Added

- **G1 Guild Master engine** — `src/guildCore.ts`: 週刻み（48週/年）のギルド状態コア。`weekly_commit` / `recruit_adventurer` / `dismiss_adventurer` の `guildOps`、10種ギルドイベント、決定論 `applyWeeklyCommit`（依頼・クエストは G2/G3 で追加予定）。
  - 配線: `guildTurnOpsCore.ts` · `guildTurnOps.ts` · `guildBridge.ts` · `statePatch` · `worldView` · `GUILD_TURN_AUTHORITATIVE_ROOT_KEYS` · `game_rules.enableGuildMode`（既定 OFF）。
  - World タブ「⚔️ Guild」読み取り専用パネル（金庫/備蓄/6ステータス/冒険者一覧）· Game Rules チェックボックス · i18n 4言語。

### Verification

- `npm test` **114/114**（`scripts/test_guild_core.js` 新規）
- `npm run compile` クリーン · `node scripts/build-webview.js` OK

## [1.40.1] - 2026-07-03

### Fixed

- **Domain Wave 2 hardening（コードレビュー対応）** — F8/F9/F10 の入力検証を v1.39.7 と同水準に揃えた。
  - `validateRivalLord`: `regionId` / `factionId` を `CHARACTER_ID_PATTERN` で検証（`controlledRegionId` と整合）。
  - `parseDomainOps` `dispatch_officer`: `targetId` を `sanitizeMissionTargetId`、`months` を `clampMissionMonths` でパース時に正規化。
  - `parseBattleState`: `opponentLabel` を `CHARACTER_ID_PATTERN` で検証。永続化ラウンドの `narrativeHintId` は安全な文字列のみ許可。
  - `test_domain_turn_merge_conflict.js`: commerce-ui 競合時に `domain.rival` / `activeMissions` / `activeBattle` が落ちないことを明示テスト追加（`DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS` の `domain` ルートでカバー済みだが回帰防止）。

### Verification

- `npm test` **113/113**（rival/mission/battle/turn-merge の新規 assert 含む）
- `npm run compile` クリーン

## [1.40.0] - 2026-07-03

### Added

- **D3 Domain UI（World タブ「🏰 Domain」パネル）** — `enableDomainMode` 時に表示。領地名・爵位・年月・財政/食料/兵力・7 ステータスバー（治安/民忠/農業/商業/防備/文化/威信）・家臣一覧（派遣中は明示）。
  - **F7 謁見**（`enableDomainAudience`）: 陳情カード（陳情者・要旨）+ grant/deny/compromise 裁定ボタン → チャット挿入（GM が `domainOps.audience_ruling` に変換）。
  - **F8 隣国ライバル**（`enableDomainRivals`）: 開示済み情報のみ表示（未開示時は「探れ」ヒント、FoW 規約を維持）。
  - **F9 主命・派遣**（`enableDomainMissions`）: 派遣中一覧（家臣・任務種・残り月数）+ 帰還報告 + 派遣フォーム（家臣/任務/期間セレクト + ボタン）。
  - **F10 合戦**（`enableMassBattle`）: 現ラウンド・両軍残存兵力 + 采配3ボタン（強攻/堅守/奇策）、または直近の合戦結果。
  - **月次行動チップ**: `actionCatalog`（11 種）をトグル選択（`monthlyActionsRemaining` を上限にクランプ）→「今月の方針」テキストを一括挿入。
  - **設計方針の踏襲**: 全ての操作は `insertChatText`（既存パターン）でチャット入力欄にテキストを挿入するのみ — Commerce Buy/Sell のような直接適用ではなく、GM が読んで `domainOps` を書く既存契約を維持。
  - Game Rules パネルに `enableDomainAudience` / `enableDomainRivals` / `enableDomainMissions` / `enableMassBattle` のチェックボックスを追加（`enableDomainMode` の子項目として表示）。
  - 配線: `domainCore.DOMAIN_ACTION_CATALOG`（新規 export）· `domainBridge.pickDomainForWebview`（陳情の完全な内容・region 名解決・action catalog を追加）· `worldView.ts`（`domain` peyload を `worldView` postMessage に追加）· `webview/modules/85-world.js`（`renderDomainPanel` 他 12 関数）· `webview/modules/70-game-rules.js` · `webview/index.html`。
  - i18n: 4 言語 74 キー追加（`webview.world.domain*` 66 + `webview.gameRules.*` 8）。FoW/webview allowlist 規約どおり、rival の真の数値は一切送信しない（`disclosedStrength`/`disclosedStance` のみ）。

### Verification

- `npm test` **113/113**（`check_i18n_keys.js` 0 missing × 4 locale、`validate_webview_html_structure.js` div balance OK）
- `npm run compile` クリーン、`node --check webview/script.js` 構文チェック OK
- **手動 F5 テストは未実施** — VSCode Extension Development Host での実機確認は次セッションで推奨（本リポジトリの既存慣習どおり）

## [1.39.13] - 2026-07-03

### Added

- **§F10 Mass Battle Resolver engine** — `src/massBattleCore.ts`: 3ラウンド固定・采配3択（assault/hold/stratagem の三すくみ、±15%重み）の決定論合戦解決。ラウンドごとに `domainOps { kind: "battle_round", tactic }` で采配を宣言、`resolveBattleRound` が troops/quality/marshal skill から損耗を決定論算出。3ラウンド到達 or 全滅で `concludeBattle` が victory/costly_victory/stalemate/retreat/rout を判定し troops/publicOrder/prestige/treasury に delta。
  - **F8 との連携**: `enableMassBattle` ON 時、隣国ライバルの `raid` は即時delta（暫定解決）ではなく `domain.activeBattle` を開始するようになった（rivalLordCore 側の暫定 raid resolve は上書き・撤回）。決着時に rival.strength にも delta が反映される。OFF（既定）時は F8 出荷時の即時delta動作を完全維持（後方互換）。
  - `[Domain — Battle]` は tier 非依存で毎ターン注入（進行中は現ラウンド + 采配説明、決着直後は結果1行を次の月次コミットまで表示）。GM への「数値捏造禁止」行を必須で含む。
  - 配線: `domainCore`（state/config/ops/validate/applyMonthlyCommit の rival raid 分岐・applyBattleRound）· `gameRules`（`enableMassBattle` 既定 OFF）· `domainTurnOps.ts` · `domainBridge.ts`（進行中/結果プロンプト行 + `pickDomainForWebview` 公開サブセット）。
  - `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` §F10。

### Verification

- `npm test` **113/113**（`test_mass_battle_core.js` 24 assert: ラウンド決定論・三すくみ有利判定・決着分類5種・F8/F10 連携両方向・validate フィルタ）

## [1.39.12] - 2026-07-03

### Added

- **§F9 Officer Missions engine** — `src/domainMissionCore.ts`: 4 mission kind（espionage/trade_run/survey/parley）× 4 grade（triumph/success/setback/disaster）の決定論解決。`domainOps { kind: "dispatch_officer", mission: { npcId, kind, targetId?, months? } }` で任命済み家臣を1–3ヶ月派遣（`domain.activeMissions`、最大 `domainMaxActiveMissions` 既定2）。月次コミットごとに1ヶ月経過し、期限が来ると `resolveMissionOutcome` が officer.skill + playerTrust（Registry disposition、既定50）+ seed で決定論に grade を判定し delta を適用、`domain.lastMissionReports` に帰還報告を記録。
  - **家臣に使い道を追加**: 低 trust（`playerBondCore` rival 以下）の家臣を派遣すると `disaster` 重みが上昇 — D5 の Bond 設計がそのままリスク管理ゲームになる（ブリーフどおり）。
  - **派遣中は不在**: 評定（Council）から除外、留守ドリフトの steward 判定からも除外（`domainDriftCore.ts` の `presentOfficers` フィルタ）。
  - 配線: `domainCore`（state/config/ops/validate/applyMonthlyCommit — 月次ティック・解決・council 除外を一体で処理）· `domainOfficerBondCore.buildOfficerTrustMap`（Registry → trust map）· `gameRules`（`enableDomainMissions` 既定 OFF・`domainMaxActiveMissions` 1–3）· `domainTurnOps.ts`（trust map 構築）· `domainBridge.ts`（`[Domain — Missions]` 派遣中一覧 + `[Domain — Missions Returned]` 帰還報告 + `pickDomainForWebview` 公開サブセット）。
  - `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` §F9。

### Verification

- `npm test` **112/112**（`test_domain_mission_core.js` 23 assert: 決定論・派遣ゲート・上限・council/steward 除外・validate フィルタ・月またぎ解決）

## [1.39.11] - 2026-07-03

### Added

- **§F8 Rival Lord tick engine** — `src/rivalLordCore.ts`: 3変数（strength/aggression/stance）の軽量隣国領主。月次コミットごとに `tickRivalLord` が決定論で1手選択（build/trade/raid_prep/envoy/raid, 重み付き無作為・raid は raid_prep 済みのみ発火）。`raid` は playerDomain の troops/defense との比較で自動 delta を適用（F10 合戦リゾルバが後で置き換える暫定解決）。
  - `domain.rival` を `enableDomainRivals` + `rivalRegionId`（World Forge `connectedTo` 隣接から自動選定、または `domainRivalRegionId` 明示指定）で月次コミット時に遅延初期化。
  - `diplomacy` 行動 → `resolveRivalDiplomacy`（stance を友好側へ1段階、決定論の成功判定）。`espionage`/`gather_rumors` → `discloseRivalInfo`（FoW と同じ「開示済みのみ GM に渡す」規約。`disclosedStrength`/`disclosedStance` 以外は絶対にプロンプト/webview に出さない）。
  - `raid_prep` は `domain.flags.rivalRaidPrep` を立て、既存の `neighbor_militarize` イベント重みを+12（`officer_discontent` と同型の flags パターン）。
  - 配線: `domainCore`（state/config/validate/applyMonthlyCommit）· `gameRules`（`enableDomainRivals` 既定 OFF・`domainRivalRegionId` 任意）· `domainTurnOps.ts`（World Forge 隣接解決）· `domainBridge.ts`（`[Domain — Rival]` 開示情報のみの1行 + `pickDomainForWebview` 公開サブセット）。
  - `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` §F8。

### Verification

- `npm test` **111/111**（`test_rival_lord_core.js` 21 assert: 決定論・raid ゲート・開示ゲート・stance 遷移・validate・イベント重み接続・lazy init 統合）

## [1.39.10] - 2026-07-03

### Added

- **§F7 Audience Hall（謁見の間）engine** — `src/domainAudienceCore.ts`: 10 種の陳情テンプレ（allowlist）+ 決定論の陳情キュー生成（`buildAudienceQueue`, 重み付き無作為抽選・重複なし・seed 決定論）+ 裁定 delta（`resolvePetitionRuling`, grant/deny/compromise）。月次コミットで `audience` 行動を選ぶと `domain.pendingPetitions` に陳情者が並び、GM が `[Domain — Audience]` ブロックで各陳情を演じ、プレイヤーが `domainOps { kind: "audience_ruling", petitionId, rulingId }` で裁く。Core が delta を適用しキューから消費、Chronicle に `kind: 'domain'` 裁定行。`game_rules.enableDomainAudience`（既定 OFF）+ `domainAudienceSize`（1–4, 既定 3）。
  - 配線: `domainCore`（action/opKind/state/parse/apply）· `TurnResult.domainOps` · `chronicleCore` · `domainPromptCore`/`domainBridge`（tier 非依存で pending 陳情を毎ターン注入）· `gameRules` · `pickDomainForWebview`（D3 UI 用に pendingPetitions 公開）。
  - **UI は D3（1.40.0）待ち** — 本 Ver は Core + GM プロンプト + ops のエンジン部のみ。`docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` §F7。

### Verification

- `npm test` **110/110**（`test_domain_audience_core.js` 17 assert: 決定論・clamp・重み・裁定 delta・parse/apply・キュー消費・validate フィルタ）

## [1.39.9] - 2026-07-03

### Fixed

- **Domain PR-A turn merge** — `DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS` (`domain` + drift roots) merged on `profile: 'turn'` revision conflict so `monthly_commit` is not dropped when commerce-ui advances `stateRevision`. `test_domain_turn_merge_conflict.js`.

### Verification

- `npm test` **109/109**

## [1.39.8] - 2026-07-03

### Added

- **Domain §14 balance harness** — `domain_balance_harness_lib.js` (shared 12-month strategies), harness stdout: stat trajectories + event frequency + `--json` / `--months`; `npm run domain:balance`. `test_domain_balance_core.js` covers balanced/martial/trade.

### Verification

- `npm test` **108/108**
- `npm run domain:balance`

## [1.39.7] - 2026-07-03

### Fixed

- **Domain hardening** — `parseDomainOps` officer `npcId` via `sanitizeDomainPromptLabel`; `validateDomain` region id pattern + event allowlist (`isValidDomainEventId`); council personality newline strip.
- **statePatch reapply ordering** — `applyTurnResultToGameState` runs `elapsedWorldTurns` before domain travel drift (matches `processTurnResult`).

### Changed

- **Docs consistency** — `VERSION_TRUTH.md`, README version badges (4 locales), `FEATURE_MATRIX.md` Domain row, `AI_SHARED_LOG` Current Snapshot → **1.39.7**.

### Verification

- `npm test` **108/108**

## [1.39.6] - 2026-07-03

### Added

- **Domain §10.3 compact prompt** — `DOMAIN_COMPACT_BASE_LINES` (3), `buildDomainCompactBaseLines` / `buildDomainStandardPrompt` (officers count + single pending line), `resolveDomainPromptTier` wiring in `domainBridge` (full on commit only; `DOMAIN_EVENT_FOCUS_LINE` on standard when event pending). Tests tightened in `test_domain_prompt_core.js` / `test_domain_core.js`.

### Verification

- `npm test` **108/108**

## [1.39.5] - 2026-07-03

### Added

- **Domain §9.3 monthly council** — `domainCouncilCore.ts`: role/stat-threshold templates, `lastMonthlyActions` context, personality trait lead, `[Domain — Council]` on `monthly_commit` only (max 5 lines). `test_domain_council_core.js`.

### Verification

- `npm test` **108/108**

## [1.39.4] - 2026-07-03

### Added

- **Domain §9.2 / D5 officer bonds** — `domainOfficerBondCore.ts`: `assessOfficerBonds` (playerTrust rival-or-below, nemesis/estrangement milestones), `syncOfficerDiscontentFlag`, registry-gated `appoint_officer`, bond-aware council lines + GM hint. `test_domain_officer_bond_core.js`.

### Fixed

- **Domain drift hardening (v1.39.3)** — Drift runs after `elapsedWorldTurns`; one-shot since-last-visit report; depart without `nextLocationId`; snapshot refresh on all `domainOps`; GM prompt sanitization; capped-month honesty.

### Verification

- `npm test` **107/107**

## [1.39.3] - 2026-07-03

### Added

- **Domain §9.1 absence drift** — `domainDriftCore.ts` (steward monthly tick, `computeSinceLastDomainVisitDelta`, `category: 'domain'`), `domainRegionDriftCore.ts` (depart snapshot / return apply), `statePatch` region travel hook, `[Living World — Since last visit]` domain lines in Domain prompt. `test_domain_since_last_visit.js`.

### Verification

- `npm test` **106/106**

## [1.39.2] - 2026-07-03

### Added

- **Domain §8 event-first + seasonal effects** — `resolveSeasonalActionBonus` (spring agriculture, winter festival), `festival_gathering` + `officer_discontent` events, `computeDomainEventWeight`, `buildSeasonalDomainGmHint` injected on monthly commit (full tier).

### Verification

- `npm test` **105/105**

## [1.39.1] - 2026-07-03

### Added

- **Domain §1.4 mitigations** — Event-first mechanical effects (`applyDomainEventEffect`), monthly tax/harvest income, `lastEventId` + GM event hints, prompt tiers (minimal/standard/full), `domainLedgerCore` treasury/credits wallet rules, `test_domain_balance_core.js` + `test_domain_ledger_core.js`.

### Verification

- `npm test` **105/105**

## [1.39.0] - 2026-07-03

### Added

- **Domain Mode D1–D2** — `domainCore.ts` (stats, monthly actions, seasonal effects, weighted events), `domainTurnOpsCore.ts` / `domainTurnOps.ts` (`turn_result.domainOps`), `domainPromptCore.ts` / `domainBridge.ts` (compact/full GM prompt + council lines), Chronicle `kind: 'domain'`. Game rule `enableDomainMode` (default OFF) + `domainMonthDays` / `domainMonthlyActions`.
- **Tests & harness** — `test_domain_core.js`, `test_domain_prompt_core.js`, `test_domain_turn_ops.js`, `domain_balance_harness.js`.

### Verification

- `npm test` **103/103**

## [1.38.0] - 2026-07-03

### Added

- **In-World Chat mode** — third experience profile (`inworld`) for talking as residents inside the current campaign world without `turn_result.json` or campaign state mutation. Separate `inworld_session.json`, Start Hub entry, header toggle, prompt builder, Parlor-style chat UI with World/Inspector panes visible for reference.
- **Narrative Time — Three Clocks** — Campaign GM prompt block separating Exchange (scene detail), Narrative Time (`/status/time`), and World Day (`elapsedWorldTurns`). Beat-specific density rules (social = 0 days; travel/rest = explicit commit). Documented in `docs/WORLD_TIME_PASSAGE_IDEA.md` §C. Agentic Referee contract aligned.

### Fixed

- **Campaign webview trust boundary follow-up** — `gameStateWebviewSanitizeCore` sends only public `commerce` / `world` subsets to Webview; `statePatch` export is allowlist-based.
- **Campaign OCC regression coverage** — `test_state_merge_inventory_race.js`; commerce debounce flush-before-deactivate tests.

### Verification

- `npm test` **100/100**

## [1.37.7] - 2026-07-03

### Fixed

- **Campaign PR3 — export sanitization** — `replayExportSanitizeCore`: replay/saga export で `entry.content` の絶対パス赤塗り、`hiddenState` 等を含む JSON フェンス除去、公開フィールドのみ pick。`exportHtml` の画像は `resolveAllowedImagePath` 経由のみ埋め込み。

### Verification

- `npm test` **98/98**

## [1.37.6] - 2026-07-03

### Fixed

- **Campaign PR2 — LW3 bond prompt chunks** — `[Living World — Bonds]` / `[Your Bonds]` を `worldState` chunk から分離。独立 priority（62/61）で budget eviction 時に先に落ちる。`buildLivingWorldBondPromptBlocks`。
- **Campaign PR4 — commerce/turn interleave tests** — debounce coalesce + flush-before-turn + revision-advanced flush の統合 smoke（`test_commerce_turn_interleave.js`）。

### Verification

- `npm test` **97/97**

## [1.37.5] - 2026-07-03

### Fixed

- **Campaign P0 PR1-lite — commerce-ui 常時 commerce-only merge** — debounce flush 時、revision 競合がなくても stale `gameState` スナップショット全体を spread せず、`commerce`（+ entries id マージ）のみ更新。

### Verification

- `npm test` **96/96**（commerce-ui no-conflict 回帰テスト追加）

## [1.37.4] - 2026-07-03

### Fixed

- **Campaign P0 PR6-lite — status 配列 OCC** — `turn` プロファイルの revision 競合時、`status.inventory` / `condition` / `skills` は disk 優先（GM ターン待ち中の消費・削除が復活しない）。`hp` 等の GM 権威フィールドは incoming を適用。

### Verification

- `npm test` **96/96**（inventory 競合ケース追加）

## [1.37.3] - 2026-07-03

### Fixed

- **Campaign P0 PR3 — キュー分割 + Commerce debounce** — `game_state` / `world_state` を別 FIFO キューに分離（head-of-line ブロック解消）。Commerce UI 書き込み 80ms debounce。`writeJsonAtomic` rename リトライ（Windows EPERM 対策）。GM ターン前に `flushScheduledCommercePersist`。

### Verification

- `npm test` **96/96**

## [1.37.2] - 2026-07-03

### Fixed

- **Campaign P0 PR2 — webview ホワイトリスト** — `pickGameStateForWebview` / `pickTurnResultForWebview` で許可フィールドのみ構築。`statePatch` から `hiddenState` / `director.notes` 等を除外。未知キー（`__SECRET_TEST_DATA__` 等）は CI で検出。

### Verification

- `npm test` **94/94**

## [1.37.1] - 2026-07-03

### Fixed

- **Campaign P0 PR1 — merge 意味論修正** — `mergeGameStateForPersist` に revision ベースの `turn` / `commerce-ui` / `entries-only` プロファイル。ターン commit 時に disk 再読込＋差分再適用。Commerce 売却後の cargo 復活を防止。

### Verification

- `npm test` **93/93**

## [1.37.0] - 2026-07-03

### Fixed

- **Campaign P0 — state race** — `workspaceStateQueue` で `game_state.json` / `world_state.json` 書き込みを FIFO 直列化。`commitGameState` / `saveWorldState` は reload-before-write + entries/id・world map マージ。ターン処理と Living World は world_state をバッチ保存、直接取引は game + world を単一キュー操作に統合。
- **Campaign P0 — trust leak** — Webview 向け `sanitizeNpcAgencyOpsForWebview` / `sanitizeGameStateForWebview`（`hiddenState`・`director.notes` 除去）。Inspector・World タブに防御表示。

### Verification

- `npm test` **92/92**

## [1.36.0] - 2026-07-03

### Added

- **Parlor Mode Phase C — 移行**
  - `parlorPromoteCore` + 昇格ウィザード（`LoreRelay: Promote Parlor to Campaign`、🎛️ パネル）
  - Campaign → Parlor 降格 + 任意の履歴インポート（`campaign.frozenAt`）
  - `parlor_archive.ndjson` 自動アーカイブ + セッション `summary` 更新
  - `experience.json` `lastParlorSnapshot`（昇格ロールバック用メタデータ）
  - Core: `parlorPromoteCore` · `parlorArchiveCore` · `parlorDemoteCore`

### Fixed

- **Parlor（Gemini レビュー follow-up #2）** — `promptContext.effectivePromptCharBudget` で 8% + 固定マージン、`clampDelimitedContext` を行単位ドロップに変更、Parlor `vscode-lm` で早期 `gmStart` / 全 early-return で `gmEnd`、ローディング中 `parlor-settings-btn` 無効化。

### Docs

- `docs/PARLOR_MODE_GEMINI_CODE_REVIEW.md` — 改定基準の P0–P3 網羅 triage

### Verification

- `npm test` **90/90**（+3 Phase C core tests）

## [1.35.0] - 2026-07-03

### Added

- **Parlor Mode Phase B** — ST 体験の完成
  - `connection_profiles.json` UI（接続プロファイル切替）
  - `persona.json` 編集（プレイヤー人格を Parlor プロンプトへ注入）
  - `backgrounds/` ギャラリー（Parlor 背景選択）
  - clipboard フォールバックに `PARLOR_SKILL.md` 参照ヘッダ
  - Core: `connectionProfileCore` · `personaCore` · `parlorBackgroundCore`
  - Webview: `87-parlor-settings.js` · ヘッダー 🎛️ パネル

### Fixed

- **Parlor（Gemini レビュー follow-up）** — プロンプト安全マージン 1200 文字、履歴は行単位ドロップ、ロアはスニペット単位ドロップ、GM 待機中プロファイル切替ロック、LM 応答後の Parlor モード再確認。

### Docs

- `docs/PARLOR_MODE_GEMINI_CODE_REVIEW.md` — Gemini 5 項目の triage

### Verification

- `npm test` **87/87**（+3 Phase B core tests）

## [1.34.0] - 2026-07-03

### Added

- **Parlor Mode Phase A（Phase 12）** — SillyTavern 風の **1対1 RP** とフル **Campaign** を同一拡張内で切替。
  - `experience.json` + `parlor_session.json`（`turn_result` / `game_state` 非経路）
  - `vscode-lm` プレーンテキスト応答（月額 AI・API キー不要）
  - Start Hub「🎭 キャラと話す」、ヘッダー 🎭/⚔️ トグル、Parlor 時 CRPG パネル非表示
  - Core: `experienceCore` · `parlorSessionCore` · `parlorPromptBuilderCore` · `parlorBridge`

### Fixed

- **Parlor プロンプト予算の安全性** — 巨大キャラ/ロア/履歴でも system rules・plain-text 契約・UNTRUSTED 境界・現在のユーザー発言を必ず保持（ChatGPT Phase 3 gate, `906e5d4`）。
- **Gemini LW3-P2 レビュー（同梱）** — 交易絆バッチ化、関係グラフ/マイルストーン整合、プレイヤー絆 GC、派閥信頼減衰、LW ターン段階化。

### Docs

- `docs/PARLOR_MODE_DESIGN.md` · `PARLOR_MODE_AI_PROMPTS.md` · `PARLOR_MODE_CHATGPT_REVIEW.md` · `PARLOR_MODE_GEMINI_DELIVERABLES.md`
- `TextAdventureGMSkill/PARLOR_SKILL.md`

### Verification

- `npm run compile` · `npm test` — **84/84**

## [1.33.0] - 2026-07-03

### Added

- **LW3-P2: 絆の交易波及** — `applyPlayerBondTradeAdjustment()`（純関数, `playerBondCore.ts`）。tradeOps 適用後、その市場に**固い盟友**（trusted_companion 到達済み・背信なし）が同席していれば純増減の **10% をプレイヤー有利**に、**敵対**（nemesis）が同席していれば **10% 不利**に credits を調整（上限 500/バッチ、両方居れば盟友優先）。`livingWorldTurnOps.ts` に配線、NPC の所在は `resolveNpcLocation`（agency 準拠、移動中は不在）。
- Tests: `test_player_bond_core.js` に +10 件（還元/上乗せ/盟友優先/背信無効/不在無効/0無調整/上限）。

### Fixed（Gemini コードレビュー対応, P0-P2）

- **P0 game_state バリデーション漏れ** — `salvageGameStateFromUnknown()` を追加。ロード時・エラー時に不正な state データを自動サルベージ（`gameStateSanitize.ts`, `gameStateSync.ts`）。
- **P1 プロンプトのコンテキスト超過** — `evictPromptChunksByBudget()` で優先度ベースの eviction（gameRules > chronicle > … > vision、`gmPromptBuilderCore.ts`, `gmPromptBuilder.ts`）。
- **P1 LLM JSON パース失敗** — `repairJsonForParse()` / `parseJsonObjectWithRecovery()` で末尾カンマ・コードフェンス内 JSON を修復（`agenticGmCore.ts`）。
- **P1 メモリ/ロアの肥大化** — `MAX_MEMORY_BANK_CHUNKS=2000`, `MAX_LOREBOOK_ENTRIES_SCAN=2000` の上限を追加（`memoryBank.ts`, `lorebookMatcher.ts`）。
- **P2 Webview 非同期通信のレース** — `syncSeq` 付きメッセージで古い更新を破棄（`10-game-state.js`, `80-inspector.js`, `90-bootstrap.js`）。
- 見送り: Zod 導入（既存の実行時バリデーション強化で対応）、vector memory offload / VLM 要約キュー（将来フェーズ）、CSP 全面厳格化（別 PR）。P2 経路探索無限ループ・マップ seed 再現性は既存機構（`MAX_PATH_HOPS`、forge seed）で対応済みのため変更なし。
- Tests: `test_game_state_sanitize.js`, `test_agentic_gm_core.js`, `test_prompt_budget_eviction.js`（新規）。

### Verification

- `npm run compile` · `npm test` — **82/82**

## [1.32.0] - 2026-07-03

### Added

- **LW3-P: あなたの絆（主人公が関係の網に入る）** — `src/playerBondCore.ts`（決定論・自己完結）。既存 `disposition`（playerTrust/playerRomance/playerFear）の閾値越えで**プレイヤー↔NPC の決定的な転機**を一度きり発火:
  - **固い盟友**（trust ≥85） / **特別な想い**（romance ≥80） / **敵対**（trust ≤15） / **畏怖**（fear ≥80） / **背信**（盟友/想いの後に trust ≤25）
  - `world_state.playerNpcMilestones`（npcId→到達id）で再発火抑制。伝聞イベント（「Eldaはあなたを固い盟友と認めた」、expires 20）に昇格。
- **GM `[Living World — Your Bonds]`** — プレイヤーの現在の立ち位置を毎ターン注入、このtickの転機には ★。GM が NPC の態度に反映（数値は出さない、romance の解釈は世界観に委ねる）。
- **World タブ** — Bonds セクション先頭に「あなた × Elda 🤝固い盟友」行（kind ラベルのみ、4ロケール i18n）。
- **Tests** — `test_player_bond_core.js`（16件・単独コンパイル型）+ host 統合2件（発火→永続→★注入→再発火なし、parse round-trip）。**81/81**。

### Design

- これで LW3 の関係網が完成: **NPC↔NPC**（v1.29-31）+ **プレイヤー↔NPC**（本版）。太閤の「顔の見える駆け引き」が主人公自身に適用される。

### Added (LW3-P2: 絆の交易波及)

- **盟友の店では商いに情が乗る** — `applyPlayerBondTradeAdjustment()`（純関数）: tradeOps 適用後、その市場に**固い盟友**（trusted_companion 到達済み・背信なし）が居れば純増減の **10% をプレイヤー有利**に、**敵対**（nemesis）が居れば **10% 不利**に credits を調整（上限 500/バッチ、両方居れば盟友優先=顔なじみが取りなす）。
- 全 op が同一市場のバッチのみ対象（Commerce UI の通常経路）。NPC の所在は `resolveNpcLocation`（agency 準拠、移動中は不在）。
- **Tests** — core +10件（還元/上乗せ/盟友優先/背信無効/不在無効/0無調整/上限）。**81/81**。

## [1.31.0] - 2026-07-02

### Added

- **LW3-L: 関係のライフイベント（北極星の最深部・ガンパレの「転機」）** — `src/npcLifeEventsCore.ts`（決定論・自己完結）。affinity が極端な閾値を跨いだ瞬間だけ「決定的な転機」を**一度きり**発火:
  - **盟友の契り**（sworn_allies, ≥85） / **離れがたい仲**（inseparable, ≥95） / **宿敵**（bitter_enemies, ≤-85）
  - **決別**（estranged — 契りを交わした二人が 0 未満に割る） / **和解**（reconciled — 宿敵が +10 まで戻る）
  - 各転機は `world_state.npcMilestones`（ペアキー→到達 id）に記録され再発火しない。世界の伝聞イベント（`recentChanges`, category `npc`, expires 20）に昇格し、Since-last-visit / World Changes で GM に届く。
- **theme-neutral な解釈** — "inseparable" は世界観次第で**深い友情・恋・義兄弟**のいずれにも読める、と gmHint で明示（押し付けない）。数値は絶対に出さない。**破壊的な NPC 削除はしない**（転機は「出来事」として提示、意味づけは GM）。
- **World タブ表示** — Bonds 行に到達したマイルストーンをバッジ表示（🛡️盟友の契り / 💠離れがたい仲 / 🗡️宿敵 / 💔決別 / 🕊️和解、4ロケール i18n）。raw affinity は非送信のまま。
- **Tests** — `test_npc_life_events_core.js`（15件・単独コンパイル型）+ host 統合3件（inseparable 発火→milestone 永続化→再発火せず、npcMilestones の parse round-trip）。**80/80**。

## [1.30.0] - 2026-07-02

### Added

- **LW3-W: 絆が世界へ波及（双方向ループの完成）** — `src/npcBondEffectsCore.ts`（決定論・自己完結）。世界→関係（v1.29.0）に加え、関係→世界が閉じた:
  - **盟友物流** — ally（affinity ≥70）ペアが別々の市場に居ると、共通商品の在庫が両市場で +1/tick（上限60）。「二人が親しくなったから物が流れる」。
  - **敵対摩擦** — enemy（≤-70）ペアの居場所の市場は priceIndex +0.05/tick（上限4）。「不和が商いを軋ませる」。
  - 移動中（未到着）のNPCは効果に参加しない。recovery（Tier1）の**後**に適用され、ボーナスが回復に食われない。
- **紹介効果（太閤の紹介状）** — `applyIntroductionTrustBoost()`: 盟友の `playerTrust` がペナルティ -25 で伝播。低信頼で「行方不明」だったNPCも、その盟友と親しければ whereabouts が見える（GM プロンプト / World タブ両経路）。例: Elda(信頼100)の盟友 Marcus(信頼20) → 実効75で exact 表示。
- **Tests** — `test_npc_bond_effects_core.js`（19件・単独コンパイル型）+ host 統合2件（紹介で unknown→at、盟友物流で両市場在庫増）。**79/79**。

### Design

- GM/LLM は一切関与しない純 Tier-1/2 フィードバック。プレイヤーは相場と人の見え方の変化として体感する。

### Added (可視化)

- **盟友の噂に物流の気配** — ally 昇格の噂が「二人の間で商いが動き始めたらしい」に（LW3-W の予告）。
- **World タブ「(◯◯の紹介)」タグ** — 紹介経由で見えている NPC に紹介者名を表示（4ロケール i18n、unknown 時は非表示）。

## [1.29.0] - 2026-07-02

### Added

- **LW3 NPC間関係（北極星: ガンパレ共生システムの第一歩）** — 名ありNPC(≤10)同士が世界データ由来で関係を変える。`src/npcRelationshipCore.ts`（決定論・自己完結）: **同席** +3/tick・**共通の危機**（同 reason で同tickに移動）+8・**派閥動態**（紛争/critical時、異派閥 -10 / 同派閥 +4）。affinity ±100 clamp、ラベル閾値 ally 70 / friend 30 / rival -30 / enemy -70。
- **ホスト配線** — `game_rules.enableNpcRelationships`（既定 OFF、Registry+Agency 前提）; `world_state.npcRelationships`（ペアキー検証つき永続化）; `tickLivingWorldAfterSim` が tick 後に `evolveRelationships`; GM プロンプト `[Living World — Bonds]`（顕著な関係 + 直近変化を伝聞素材として注入）; `turn_result.relationshipOps`（GM の例外的確定、registry検証・clamp）。
- **Tests** — `test_npc_relationship_core.js`（26件・単独コンパイル型）、`test_npc_relationship_host.js`（13件: 永続化round-trip / gate / tick進化 / Bonds注入 / OFF時無干渉）。78/78。

### Design

- 黄金律維持: affinity は Core 決定論、GM は変化を**伝聞として narrate**（NPC同士の会話自動生成はしない）。`docs/LIVING_WORLD_LW3_RELATIONSHIPS.md` 参照。

### Added (UI / GM / Demo)

- **GM スキーマヒント** — `RELATIONSHIP_OPS_PROMPT_LINE`（Bonds は伝聞として narrate・数値は発明しない・物語上の決定的変化のみ `relationshipOps` 最大2件/turn）。
- **Game Rules パネル** — 「Enable NPC Bonds (LW3)」チェックボックス（`gr-npc-relationships`、4ロケール i18n 付き）。
- **World タブ「NPC Bonds」セクション** — 顕著な関係をラベルのみ表示（🤝盟友 / 🙂友好 / ⚡不和 / ⚔️敵対）。**raw affinity は webview に送らない**（v1.27.1 の DevTools リーク方針を踏襲）。
- **trade-routes デモ** — `enableNpcRelationships: true` + README に体験手順8（Elda × Marcus が同席で友好になる／紛争イベントで異派閥が離れる）。
- **噂イベント（伝聞の核心）** — affinity の**ラベル遷移**（中立→友好 等）のみ `recentChanges` に `category: 'npc'` の世界イベントとして昇格（「EldaとMarcusが友好の間柄になったと噂されている」、gmHint 付き、最大4件/tick、10ターンで失効）。留守中の関係変化が Since-last-visit / World Changes の伝聞に乗る。

## [1.28.0] - 2026-07-02

### Added

- **`docs/FEATURE_MATRIX.md`** — stable / beta / experimental 一覧。
- **`docs/LIVING_WORLD_QUICKSTART.md`** — trade-routes 5 分チュートリアル。
- **`docs/REVIEW_FOLLOWUP_v1_28.md`** — ChatGPT / Gemini レビュー follow-up。

### Fixed

- **Replay Export Markdown** — `formatMarkdownImageRef()` wraps paths with spaces/parens in angle brackets.
- **Release workflow** — fail if git tag `vX.Y.Z` ≠ `package.json` version.

## [1.27.2] - 2026-07-02

### Changed

- **Version truth docs** — `docs/VERSION_TRUTH.md`; `AI_SHARED_LOG` Current Snapshot, `AI_HANDOVER`, `VSCODE_CHATGPT_CATCHUP` updated so AI agents read `package.json` instead of stale v1.6–v1.18 references.

## [1.27.1] - 2026-07-02

### Fixed

- **NPC whereabouts DevTools leak** — `worldView` omits `locationId`, `arrivesTurn`, and `inTransit` from the webview payload when `precision === 'unknown'`.
- **GM approximate transit wording** — no redundant `en route to heading toward …` in `[Living World — NPC whereabouts]`.
- **Trust threshold drift** — `gmPromptBuilder` imports `TRUST_WHEREABOUTS_EXACT_MIN` / `TRUST_WHEREABOUTS_UNKNOWN_MAX` from `npcWhereaboutsTrustCore`.

## [1.27.0] - 2026-07-02

### Added

- **LW2 v1+ trust-linked whereabouts** — `npcWhereaboutsTrustCore.ts`: playerTrust ≥70 exact location + reason; 31–69 region-level rumor; ≤30「行方不明」. GM `[Living World — NPC whereabouts]` and World tab both respect precision.
- **playerRole GM motivation** — `livingWorldPlayerRoleCore.ts`; `[Living World — Caravan]` prepends role-specific trade motivation (merchant/adventurer/retainer/smith/ruler).
- **Tests** — `test_npc_whereabouts_trust_core.js`, `test_living_world_player_role_core.js`.

## [1.26.0] - 2026-07-02

### Added

- **BRIEF v1+ Commerce UI** — `enableCommerceUi` game rule (default `false`); World tab Buy/Sell buttons at current location only; Caravan `playerRole` selector (`merchant` / `adventurer` / `retainer` / `smith` / `ruler`).
- **`livingWorldCommerceUiCore.ts`** — `executeDirectTrade()` via `applyTradeOps` (no narration parsing); location guard `WRONG_LOCATION`.
- **`livingWorldCommerceUi.ts`** — host persistence for direct trade + role changes.
- **Game Rules panel** — Commerce UI toggle + default player role.
- **`sample-scenarios/trade-routes`** — `enableCommerceUi: true` for demo.
- **Tests** — `test_living_world_commerce_ui_core.js`.
- **Docs** — `docs/CODE_REVIEW_PROMPT_LIVING_WORLD.md` for external AI reviewers.

## [1.25.0] - 2026-07-02

### Added

- **LW2-PR2 GM prompt** — `[Living World — Caravan]` (credits/food/cargo); NPC whereabouts show human-readable `reason` on stationary and in-transit NPCs (`formatNpcAgencyReason`).
- **Inspector market debug** — when Commerce ON + debug console visible: location/commodity/multiplier controls apply `priceIndex` bumps to `world_state.markets`.
- **`livingWorldMarketDebugCore.ts`** — shared batch apply for sandbox phrases and Inspector.

## [1.24.0] - 2026-07-02

### Fixed

- **Travel / bulk sim Living World tick** — `persistWorldSimulationSteps()` now runs `applyLivingWorldAfterSimulationStep()` after each emergent sim step so `elapsedWorldTurns` advances markets and NPC positions (was faction-only).

### Added

- **World tab Caravan panel** — read-only `credits` / `food` / `transport` / `cargo` from `game_state.commerce`.
- **NPC whereabouts reason** — agenda/reason shown inline (not tooltip-only).
- **Debug market command** — sandbox phrase e.g. 「小麦相場を2倍に」 applies `applyMarketPriceMultiplier()` to `world_state.markets`.
- **Tests** — `test_world_sim_living_world.js`, `test_market_price_multiplier.js`; trade-routes README playthrough checklist.

## [1.23.0] - 2026-07-02

### Added

- **Living World LW1-PR2/PR3/LW2/LW-DEMO (Codex overnight + Grok finish)** — World tab read-only market table; Inspector `tradeOps` / `npcAgencyOps`; NPC whereabouts (≤10 clamp); travel-plan GM block; `sample-scenarios/trade-routes` demo pack.
- **`commerce.food`** — travel rations on `game_state.commerce`; deducted on `elapsedWorldTurns` (clamped at 0); depleted-food warning in GM prompt.
- **GM schema hints** — `TRADE_OPS_PROMPT_LINE` / `NPC_AGENCY_OPS_PROMPT_LINE` in world prompt; agentic Referee JSON shape documents `tradeOps`, `npcAgencyOps`, `elapsedWorldTurns`.
- **`scripts/test_living_world_turn_ops.js`** — food consumption unit tests.

## [1.22.1] - 2026-07-02

### Fixed

- **Since-last-visit** — `recordLocationVisit()` が退出地点の市場スナップショット（`marketSnapshotByLocation`）を保存するよう修正。`buildLivingWorldGmLines()` が同一 `markets` 参照で差分ゼロになっていた問題を解消。`statePatch` は到着時に `prevLocationId` で退出記録。

## [1.22.0] - 2026-07-02

### Added

- **Living World LW-W1 (initial wire)** — `@lorerelay/world-kit` cores synced into extension: Commerce, Transport, Tier-1 market tick, NPC Agency, GM `[Living World — …]` blocks.
- **`livingWorldBridge.ts`** — ticks after each `runSimulationStep`; `tradeOps` / `npcAgencyOps` on turn_result; `game_rules.enableCommerce` / `enableNpcAgency` (default OFF).
- **`scripts/sync_world_kit.js`**, **`AGENTS.md`**, `scripts/test_living_world_bridge.js`.

### Docs

- `C:\AI\lorerelay-world-kit` v0.1.0 (standalone package, 5/5 tests).
- `docs/OVERNIGHT_HANDOFF.md` — LLM/agent overnight workflow notes.

## [1.21.1] - 2026-07-02

### Added

- **F5 Replay Export** — `replayExportCore.ts` / `replayExportPathsCore.ts` でチャット履歴 + F1 年表章見出し + `visual_memory.json` ギャラリーから Markdown / 自己完結 HTML を `exports/` へ書き出し。`excludedFromPrompt`・`imageBlocked` を尊重。
- **Inspector** — 形式・画像/GM/ダイス ON-OFF と書き出しボタン。
- **コマンド** — `LoreRelay: Export Replay (Markdown/HTML)`（`textadventure.exportReplay`）。HTML はブラウザ、MD はエディタで開く。
- **`scripts/test_replay_export_core.js`** — 除外フラグ・空ログ・画像 ON/OFF・パス検証。

## [1.21.0] - 2026-07-02

### Added

- **F4 Travel Encounter** — `travelEncounterCore.ts` で旅コマンド時に worldSeed + 経路リージョン + `Region.hazard` から決定論エンカウントを抽選し `[Travel — Encounters]` を GM プロンプトへ注入。
- **Game Rules（gated）** — `enableTravelEncounters`（既定 OFF）、`travelEncounterDensity`（low / medium / high）。
- **`scripts/test_travel_encounter_core.js`** — 同 seed 再現性・BFS 経路・密度。

## [1.20.0] - 2026-07-02

### Added

- **F3 Faction Reputation** — `factionReputationCore.ts` で派閥単位のプレイヤー評判（-100..100）を `world_state.factions.*.playerReputation` に追跡。
- **更新源** — クエスト完了時の自動 delta（NPC `factionId` / イベント `factionId`）+ 任意 `turn_result.reputationOps`。
- **GM プロンプト（gated）** — `textAdventure.reputation.inPrompt` + `game_rules.enableFactionReputation` で `[Player Reputation]` 1 行注入。
- **World タブ** — 派閥カードに評判バー（Game Rules ON 時）。
- **`scripts/test_faction_reputation_core.js`**

### Settings

- `game_rules.json` → `enableFactionReputation`（default `false`）
- `textAdventure.reputation.inPrompt`（default `false`）

## [1.19.1] - 2026-07-02

### Added

- **F2 Pacing Director** — `journalBeatCore.ts` / `pacingCore.ts` で直近ジャーナルを beat 分類（戦闘/会話/探索/移動/静寂）。偏り検知時のみ `[Director — Pacing]` 1 行を GM プロンプトへ注入（LLM 不使用）。
- **`scripts/test_pacing_core.js`** — beat 判定・偏り検知・閾値未満は空。

### Settings

- `textAdventure.pacing.hintInPrompt`（default `false`）
- `textAdventure.pacing.windowSize`（default `5`）
- `textAdventure.pacing.dominanceThreshold`（default `0.8`）

## [1.19.0] - 2026-07-02

### Added

- **F1 Chronicle** — `chronicleCore.ts` / `chronicleJournalCore.ts` で `state_journal.ndjson` + `recentChanges` + `questHooks` から決定論的年表を生成。LLM 要約なし。
- **GM プロンプト注入（gated）** — `textAdventure.chronicle.recapInPrompt`（既定 OFF）でセッション再開後の最初の GM ターンに `[Previously]` ブロックを inject-once 注入。`lastInjectedChronicleTurn` で二重注入防止。
- **Inspector 年表ビュー** — 章ごと折りたたみの read-only Chronicle 表示 + Refresh。
- **`scripts/test_chronicle_core.js`** — 章分割・recap 上限・壊れ行スキップ・inject 判定。

### Settings

- `textAdventure.chronicle.recapInPrompt`（default `false`）
- `textAdventure.chronicle.maxRecapLines`（default `5`）

## [1.18.0] - 2026-07-02

### Added

- **Debug sandbox v2** — 拡張コマンド: HP 操作、現在地移動、ロマンス/恐怖、地図アイテム付与、物語的休息・旅（`宿で休む` / `N日かけて◯◯へ旅する`）。
- **Debug Console (Inspector)** — バルク世界シム + サンドボックスを統合。デバッグシナリオ中は設定なしでコンソール表示・クイック挿入チップ。
- **Layer B (v1)** — `turn_result.elapsedWorldTurns` で GM ターンから世界シミュを N ステップ進行。`narrativeTimePassageCore.ts` / `worldSimPersist.ts`。Emergent Simulation ON 時 GM プロンプトに 1 行追加。

### Changed

- バルク世界シムの永続化を `worldSimPersist.ts` に集約（デバッグサンドボックス・Inspector・`elapsedWorldTurns` 共通）。

## [1.17.0] - 2026-07-02

### Added

- **Debug sandbox scenario** — 同梱 `sample-scenarios/debug-sandbox`。`meta.tags: ["debug"]` のシナリオで、プレイヤーの自然言語を決定論的に解釈（GM不要・即時 `turn_result`）。好感度（`npc_registry`）、地図の霧（`cartographyReveal`）、世界シミュ N ステップ（`world_state.json`）。Start Hub **🔧 デバッグサンドボックス** ボタン。`src/debugScenarioCore.ts` / `debugScenarioRunnerCore.ts`。手順: `sample-scenarios/debug-sandbox/DEBUG_SANDBOX.md`。
- **Scenario pack** — `game_rules.json` を `OPTIONAL_PACK_FILES` に追加（パック同梱時にワークスペースへコピー）。

## [1.16.0] - 2026-07-02

Cartography **C9**（地図/伝聞アイテム + 遠隔 FoW 開示）— プレイ体験の機能追加のためマイナー繰り上げ。設計: `docs/CARTOGRAPHY_C9_DESIGN.md`（Claude）。

### Added

- **Cartography C9 — 遠隔 FoW 開示（案 D）** — `turn_result.cartographyReveal` 検証チャネル。`/world` allowlist 無改修。`discovered` / `rumorKnownRegionIds`（弱い噂）を拡張が派生反映。`src/cartographyRevealCore.ts` + `fogOfWarCore` rumorKnown マージ。
- **Cartography C9 — 地図アイテム UX** — `grantItems` → `game_state.world.mapItems`。World タブ「地図・情報」+「広げる」→ `insertChatText`。任意 `world_forge.mapItems` 定義。
- **Cartography C9 — GM プロンプト（gated）** — `textAdventure.cartography.revealInPrompt`（既定 OFF）で `cartographyReveal` 指示行を `[World]` に追加。
- **Agentic GM** — Referee が `cartographyReveal` を passthrough（`agenticGmCore.ts`）。
- **Debug: bulk world simulation advance** — `textAdventure.debug.bulkWorldSim`（既定 OFF）で Inspector から Emergent Simulation を N ステップ一括実行。`docs/WORLD_TIME_PASSAGE_IDEA.md`。

## [1.15.2] - 2026-07-02

### Added

- **Cartography Phase 8 PR5 — Auto Location Image（gated）** — `textAdventure.cartography.autoLocationImage`（既定 OFF）と `autoLocationImageCooldownTurns`。`processTurnResult` で `currentLocationId` 変化時に ComfyUI 設定済みならサイレントキュー。`lastGeneratedLocationId` / `lastAutoImageGmTurn` で重複・クールダウン管理。レガシー `imageGen.autoOnLocationChange` は新設定 OFF 時のみ継続。
- **Cartography Phase 8 PR6 — GM FoW 1行（gated）** — `textAdventure.cartography.fogInPrompt`（既定 OFF）で `[World]` 末尾に未探索リージョン名を最大5件・約120字で追加。`buildFogUnexploredPromptLine` + `listUnexploredRegionNames`。

## [1.15.1] - 2026-07-02

### Added

- **Cartography Phase 8 PR4 — 動的マップフィードバック** — `dangerLevel` に応じたピン色（琥珀/赤+⚠）、`controllingFaction` のリージョンラベル派閥アイコン+CSSティント、`recentChanges`（`mapHighlight`）の脈動バッジ。FoW 未探索は非表示。`src/mapFeedbackCore.ts` + 羊皮紙/タイル Webview 描画。高危険リージョン進入時の羊皮紙フラッシュ。

## [1.15.0] - 2026-07-02

Cartography Phase 8（探索霧 + ピン操作）— マイナーではなくプレイ体験の機能追加のため **1.15** に繰り上げ。

### Added

- **Fog of War（PR1+PR2）** — Region グラフ駆動の探索霧。`discoveredRegionIds` / `visitedLocationIds` を拡張が `currentLocationId` 変化時に派生。羊皮紙・タイル・Mermaid 3モードに暗幕/シルエット表示。`src/fogOfWarCore.ts`。
- **ピン インタラクション（PR3）** — 探索済みピンのクリックで共通詳細パネル（種別・危険度・派閥）+ チャット入力へ行動文挿入（移動/調査/現在地うかがい）。羊皮紙 44px ヒット領域、タイル 22px 半径ヒットテスト、Mermaid ノードクリック。`insertChatText` → `insertChatDraft` 経路。i18n 10キー×4言語。

## [1.14.8] - 2026-07-02

### Added

- **ユーザーガイド** — `docs/USER_GUIDE.md`（3分スタート、タブ一覧、World / Cartography / Visual Memory の使い方、つまずき対処）。
- **Cartography Phase 8 ブリーフ** — `docs/CARTOGRAPHY_PHASE8_BRIEF.md`（Fog of War・ピン UX の設計依頼テンプレ、AI 分担の推奨）。

### Changed

- **i18n 検証強化** — `check_i18n_keys.js` が `src/**/*.ts` の `t('extension.*')` / `t('webview.*')` も走査。新機能追加時の zh-CN/zh-TW 漏れを CI で検出しやすく。

## [1.14.7] - 2026-07-02

### Fixed

- **lorebookMatcher ReDoS ガード強化** — `isPotentiallyEvilRegex` をエスケープ対応スキャナーに刷新。`(\w+)+` / `(\d+)+` / `(a|a){1,N}` / `.*{3,}` 連鎖など従来ヒューリスティックの抜け道を塞ぐ。`test_lorebook_redos.js` 追加。Python `TextAdventureGMSkill/scripts/gm_bridge_common.py` も同等ガードに同期。

## [1.14.6] - 2026-07-02

### Fixed

- **vscode-lm GM ブリッジ** — `game_state.json` への直接マージを廃止し、`turn_result.json`（`statePatch` + `narration`）経由で `processTurnResult` パイプラインに統一。Ollama / Grok 等と同じ `applyStatePatch`・スキーマ検証・ジャーナル記録が適用される。`vscodeLmTurnResultCore.ts` + `test_vscode_lm_turn_result_core.js` 追加。

## [1.14.5] - 2026-07-02

### Added

- Maintenance hardening: `scripts/run_all_tests.js` now applies a per-test timeout (default 60s, with longer remote-play smoke timeouts) so hung tests fail clearly instead of freezing CI.
- Webview World/Tile Overmap smoke coverage: `test_webview_world_modules.js` verifies World map mode DOM, bundle order, tile renderer wiring, fallback theme symbols, and `pane-world` div balance.
- Release automation: tag pushes (`v*`) now build and upload a VSIX artifact through `.github/workflows/release.yml`, and attach it to the GitHub Release.
- Turn Inspector now expands Prompt Budget reporting with per-section used/limit character details for Summary, Saga, Memory, Lorebook, Party, World, NPC Awareness, and Vision context.

### Changed

- CI now runs `validate-and-smoke` separately from the `coverage` job, avoiding the previous full-suite run followed by another unit run under c8.
- `package-lock.json` version metadata is synchronized with `package.json`.

## [1.14.4] - 2026-07-02

### Added

- **Core カバレッジ（Phase 3）** — `test_scenario_pack_core.js` 新設。`mediaPathCore` / `cartographyPathCore` / `ttsBridgeCore` のユニットテスト拡充。共有 `scripts/test_helpers/vscode_stub.js` 追加。

### Changed

- **c8 しきい値引き上げ** — lines/statements 70% / functions 65% / branches 65%（Phase 2 の 55/50/60 から段階的に引き上げ）。現状ベースライン ~92% lines / ~75% branches。

## [1.14.3] - 2026-07-02

### Added

- **Core カバレッジ（Phase 2）** — `c8` で `out/*Core.js` を計測。`npm run test:coverage`、`.c8rc.json` しきい値（lines/statements 55% / functions 50% / branches 60%）。CI で coverage 実行 + `lcov.info` artifact アップロード。

### Changed

- **validateGameState 数値範囲強化** — `world.regions.*.dangerLevel` は `Number.isFinite` + 0–10。`world.worldTurnAtLastSync` は有限・非負のみ許可。`test_validate_game_state.js` に回帰テスト追加。

## [1.14.2] - 2026-07-02

### Changed

- **テストランナー統合（Phase 1）** — `scripts/run_all_tests.js` で validate / unit / smoke をマニフェスト駆動実行。`npm test` / `test:unit` / `test:smoke` / `test:validate` に分割。`TESTING.md` 追加。README に CI バッジ。

### Added

- Prompt Budget controls: `textAdventure.promptBudget.mode` (`auto` / `compact` / `balanced` / `expanded`) and `textAdventure.promptBudget.maxTokens` now cap GM prompt context from Story Summary, Saga, Memory Bank, Lorebook, Party cards, NPC awareness, World State, and Vision snippets. Turn Inspector shows the active budget target next to the estimated injected tokens.
- GM Skill prompt-budget guidance: normal play should read `game_state.json` and relevant domain files only; `state_journal.ndjson`, full `game_history.json`, and verbatim Saga archives are not GM context.

## [1.14.1] - 2026-07-02

### Changed

- **Tile Overmap テーマ解決を extension 側へ移動** — `resolveOvermapThemeKey()` を `tileOvermapCore.ts` に集約し、`worldView` メッセージで `overmapThemeKey` を Webview へ渡すように。Cartography と Webview でテーマ判定がズレるリスクを低減。
- **World タブ JS の分割** — Tile Overmap 描画を `webview/modules/86-tile-overmap.js` に分離。`85-world.js` は World View の受け取りと各 render 呼び出しに専念。
- **日本語主人公 ID の安定化** — 非 ASCII 名は `char_<hash>`（FNV-1a 6桁）を生成。`Date.now()` 依存の `char_日時` ID を廃止。

### Added

- **主人公自動登録のリセットコマンド** — `LoreRelay: Reset Protagonist Bootstrap`（`textadventure.resetProtagonistBootstrap`）。スキップ済みワークスペースで登録ダイアログを再表示できる。

## [1.14.0] - 2026-07-02

### Added

- **ジャンル別テーマリスキン（Tile Overmap）** — タイルマップがワールドテーマに応じて見た目を変えるように。cyberpunk（ネオン都市・スプロール郊外）/ post-apocalyptic（灰の平原・廃墟都市）/ zombie（感染都市・繁茂した草地）/ scifi（コロニードーム・レゴリス平原）/ steampunk（煤けた煉瓦街）/ cosmic-horror（霧の湿原・黒い海）/ oriental（竹林・棚田）/ modern の8テーマオーバーライド。バイオームコード語彙は不変（差し替えるのはスタイルテーブルだけ = 将来の画像タイルセットと同じ seam）。テーマ解決は羊皮紙マップと同じキーワードマッチ方式（`resolveOvermapThemeKey`）。
- **リージョンハザード（`Region.hazard`）** — 「放射能汚染地域」等のゲームプレイ的意味を持つ特殊地形をリージョン単位のオプショナル1単語で表現: `radiation` / `toxic` / `infested` / `quarantine` / `anomaly` / `haunted` / `storm` / `corrupted` の8種（パーサ検証つき、不正値は破棄）。タイルマップ上では該当リージョンのタイルに ☢☣☠╬◊†§▒ マーカーと色調シフトを決定論的に散布（`tileOvermapCore` が owner リージョンを追跡、海岸線上書きタイルには乗らない）。**GM が読むのはリージョンあたり1単語だけ**で、タイル散布自体は保存されない。
- **World Forge Generator: 新テーマ6種 + ハザード自動散布** — `post-apocalyptic` / `zombie-apocalypse` / `scifi` / `steampunk` / `cosmic-horror` / `oriental-fantasy` を追加（リージョン/派閥名テーブル・NPC名・ロア年表・リージョン型ウェイト・バイオームマッピング各テーマ分）。テーマ×バイオーム条件でハザードを確率散布し（例: zombie の city は 50% で `infested`）、ハザード付きリージョンは dangerLevel も引き上げ。生成はシード決定論的。
- **羊皮紙マップの新テーマスタイル** — `cartographyThemeStyles.json` に steampunk / cosmic-horror（`horror` が zombie ルールに食われないよう先行配置）/ oriental の ComfyUI プロンプトスタイルを追加。

## [1.13.0] - 2026-07-02

### Added

- **Tile Overmap（ローグライク風タイルマップ表示モード）** — World タブの地図に第3のモード「タイル」を追加（図解 / 羊皮紙 / タイル）。`world_forge.json` のリージョン配置（x/y/biome/connectedTo）から Dwarf Fortress / CDDA 風の 64×64 ASCII タイルグリッドを Canvas 描画する。`src/tileOvermapCore.ts` が worldSeed とリージョンレイアウトからノイズ付き Voronoi で**決定論的に**導出するため、タイルデータは一切永続化されず（`game_state.json` 肥大化なし）、GM プロンプトにも一切注入されない（表示専用レイヤー）。街道は `connectedTo` エッジから Bresenham で生成、sea/coast バイオームを持つ世界のみ外周に海岸線ノイズを追加。ロケーションピン（⌂ / 現在地 @）とリージョンラベルは羊皮紙マップと同じ percent 座標系（`cartographyPins` / `cartographyRegionLabels`）を再利用。15 種の単一文字バイオームコードを安定したタイル ID 語彙として定義してあり、将来 CDDA の `tile_config.json` 方式（コード → スプライトアトラス）の画像タイルセットへ `TILE_OVERMAP_ASCII_THEME` / `drawOvermapTile()` の差し替えだけで移行できる。`scripts/test_tile_overmap_core.js` を npm test に追加。

## [1.12.2] - 2026-07-02

### Fixed

- **Cartography: `cartographyThemeStyles.json` not found in packaged extension** — `.vscodeignore` excludes `src/**`, but `comfyui_generate_cartography.py` read theme styles from `src/`. Sync `src/cartographyThemeStyles.json` → `scripts/cartographyThemeStyles.json` on `npm run compile`; Python resolves `scripts/` first (VSIX-safe), then `src/` (dev repo).

## [1.12.1] - 2026-07-02

### Fixed

- **Installer: Antigravity IDE へ LoreRelay が入らない** — `install_vscode_extension.ps1` が存在しない `~/.gemini/antigravity-ide/extensions` のみを対象にしていた問題を修正。`antigravity-ide --install-extension`（CLI）を優先し、フォールバックで `~/.antigravity/extensions` と `~/.gemini/antigravity-ide/extensions` へ VSIX 直展開。VSIX は `.zip` コピー後に展開（Windows `Expand-Archive` 制限）。`install_common.ps1` を dot-source。Antigravity の stderr 警告で失敗扱いにならないよう CLI 呼び出しを硬化。
- **バッチの役割表示** — `install_vscode_extension_ja.bat`（UI拡張）と `install_antigravity_skill.bat`（チャットスキル）の違いを実行時に明示。

## [1.12.0] - 2026-07-02

### Added

- **Protagonist auto-bootstrap (First Session)** — Start Hub の「質問しながら作る」や Quickstart 完了後、会話・`turn_result.playerCharacter` から主人公を抽出し `characters/{id}.json` へ登録（インタビュー時は確認ダイアログ、Quickstart は自動）。`controlledBy: player`、アクティブキャラ設定、パーティ Join まで一括。`protagonistBootstrap.ts` / `protagonistBootstrapCore.ts`。`world_forge.json` watcher + `turn_result` 処理からデバウンス起動。
- **`turn_result.playerCharacter`** — GM が世界生成ターンで主人公スナップショットを渡せる任意フィールド（`name` / `description` / `personality` / `equipment`）。
- **Cartography LoRA（ユーザー設定）** — `textAdventure.cartography.lora` / `cartography.loraWeight`（リポジトリ default は空）。`TA_LORA` 環境変数が優先。Output に LoRA source 表示。
- **ComfyUI 推奨 LoRA ドキュメント** — `docs/CARTOGRAPHY_RECOMMENDED_LORAS.md`（Mapcraft 第一推奨、テーマ別候補、User Settings 例）。`cartographyLoraPresets.ts` を実ファイル名 `mapcraft_il_v1` 等に更新、DnD Battlemaps / LargeFantasyCityMap 等を追加。

### Changed

- インタビューキックオフテンプレ（4言語）— 世界生成時に `world_forge.json` と `turn_result.playerCharacter` を GM に依頼する文言を追加。
- `docs/FIRST_SESSION.md` — 主人公の自動プロフィール登録を追記。

## [1.11.2] - 2026-07-02

### Added

- **First session polish (A)** — Start Hub に **🎮 お試しデモ**（`harbor-mist`）と **🗺️ 地図デモ**（`lost-catacombs`）ボタン。`loadBundledSampleScenario()` でフォルダ選択なし読み込み。同梱 `world_forge.json` 等もワークスペースへコピー。`docs/FIRST_SESSION.md`。
- **TTS / character help (B)** — `docs/TTS_QUICKSTART.md`（system → local → OpenAI 段階導線）。TTS メニューと Character タブにインラインヘルプ（パーティ vs アクティブ、削除時の画像範囲）。
- Free-text input (`#free-input`) is now a proper multi-line `<textarea>` that auto-grows with content (up to a max height, then scrolls) instead of a single-line `<input>`. **Ctrl/Cmd+Enter now sends**; plain Enter (and Shift+Enter) just inserts a newline — the Send button still sends on a click either way. Placeholder text updated in all 4 locales to reflect the new shortcut.

### Fixed

- **Player messages rendered twice in the live session (but only one was ever saved).** The webview optimistically renders the player's message with a client-generated `id: user-<Date.now()>` right when it's sent. Once `persistPlayerInputEntry()` (above) started actually writing that entry to `game_state.json`, the extension was generating its *own*, different `user-<Date.now()>` id for it — so when the next `gameStateUpdate` came back, `applyGameState()`'s existing-id dedup check didn't recognize it as the same entry and rendered it a second time. Reload/restart looked fine because the full-history path replaces `messageHistory` wholesale from disk, which only ever had one copy. Fixed by having the webview generate the id up front and send it along (`entryId` on the `freeInput`/`selectOption` postMessage, from `sendFreeInput()`, the Options-button handler, and the dice-roll "send to GM" button), and having `persistPlayerInputEntry()` reuse that same id instead of minting a new one when it's a valid entry id.
- **Player messages after the very first turn were never actually persisted.** `ensureInitialGameStateForPlayerInput()` only wrote the player's chat entry to `game_state.json` when the file didn't exist yet (i.e. only ever the *first* turn in a brand-new workspace) — for every turn after that, the player's message only ever lived in the webview's own ephemeral `vscode.setState()` cache, never on disk. Reloading the window (or the `game_state.json` watcher re-reading from disk for any other reason) would silently drop it from the visible history, even though the GM's reply that followed it stayed. Renamed to `persistPlayerInputEntry()` and it now always appends the player's entry to `game_state.json` before invoking the GM bridge, matching the Persist-Before-Narrate principle for both halves of a turn, not just the GM's.
- GM turns could be silently dropped whenever `status.condition`/`status.inventory`/`status.skills` came back from the GM as a plain string (e.g. `"—"`) instead of an array — `validateGameState()` correctly requires an array, but `processTurnResult()` rejected the *entire turn* rather than just that one field. Added a lenient `normalizeStatusArrayFields()` pass (wraps a lone string into a single-element array, or `[]` if blank) right before validation, so one field-shape hiccup from the LLM no longer eats a whole turn. Reproduced via the `extension.error.gameStateLoad (Schema Violation)` toast the user hit in `g:\AI\LoreRelayWorlds\PostApocalypse`.
- Localized installer batch files now keep their wrapper messages ASCII-only while still passing `-Language` to the PowerShell installer. This avoids cmd.exe mojibake and broken parenthesized blocks in `install_vscode_extension_ja.bat`, `install_vscode_extension_zh-CN.bat`, and `install_vscode_extension_zh-TW.bat`.

## [1.11.1] - 2026-07-02

### Added

- Character Profile pane: a 🗑 Delete button next to Save. Deletes the character JSON plus its portrait/expression images, and clears it from `party.json` / `active_character.txt` if referenced (`characterManager.deleteCharacter`, new `deleteCharacter` webview message).

### Fixed

- **Duplicate player messages when sending quickly**: input was only disabled once the extension's `gmStart` message round-tripped back to the webview, leaving a window (client → extension → back) where a fast second Enter-press/click on Send or an Options button could resend before the UI visibly locked. `sendFreeInput()` and the Options-button handler now call `showGmLoading()` (which disables input) immediately/client-side right after posting, instead of waiting for the round trip.
- **GM turns silently vanishing (first turn in a fresh workspace especially prone)**: `turn_result.json` could be written correctly by the GM bridge (visible in the "LoreRelay: GM Bridge" Output channel) yet never get merged into `game_state.json` or shown as a chat message, because the `turn_result.json` `FileSystemWatcher`'s `onDidCreate` event doesn't reliably fire for a file's very first creation in a workspace. The `finishGmRun()` fallback that ran 250ms after the bridge process closed only knew how to detect a GM that edited `game_state.json` directly — it had no path for "turn_result.json exists on disk but the watcher never picked it up." Added a direct file-check fallback (`gameStateSync.checkPendingTurnResultFile()`, wired into `turnResultFallback.ts` via dependency injection to avoid a circular import) that's tried first; also swept once on `startGameStateWatcher()` startup so a leftover unprocessed `turn_result.json` self-heals on the next window reload instead of requiring manual cleanup.
- Audited every other `window.confirm()`/`prompt()`/`alert()` call in the webview for the same silent-no-op sandboxing issue and fixed each:
  - **Rewind to turn** (🔱 chat action and the input-bar rewind button) and **Git Timeline branch creation** (⎇ chat action and Inspector panel) now confirm via a native extension-host modal (shared `confirmDestructive()` helper in `webviewHandlers.ts`) instead of a silently-ignored webview `confirm()`.
  - **Checkpoint label** input (both the input-bar and quick-reply "save checkpoint" buttons) now uses `vscode.window.showInputBox()` on the extension host instead of a silently-ignored webview `prompt()` (which previously meant every checkpoint quietly saved with a blank/auto-generated label, custom names never actually worked).
  - **Lorebook entry delete** is purely client-side (draft state, not yet persisted), so it now uses a small custom in-page confirm modal (`webviewConfirm()` in `00-core.js`) instead of `window.confirm()`.
  - **Lorebook save-failure** and **Quickstart empty-prompt validation** used `alert()`, also silently ignored. The lorebook one was redundant anyway (the extension host already shows a native error message with the same detail) and was removed; Quickstart's empty-prompt check now shows an inline invalid-field state instead.
- Delete-character confirmation used the webview's `window.confirm()`, which VS Code silently no-ops (webview iframes aren't granted `allow-modals`) — clicking Delete did nothing and showed no prompt. Moved the confirmation to a native `vscode.window.showWarningMessage({ modal: true })` dialog on the extension-host side instead, matching the existing pattern used for Git Timeline init / scenario pack loading.
- Full Character Editor ("✏️ Full Editor" modal) was entirely hard-coded in English with no `data-i18n` attributes — switching the UI locale had no effect on it. Added ~90 `webview.characterCreator.*` i18n keys across all 4 locales (en/ja/zh-TW/zh-CN) covering every label, placeholder, button, and the default sprite-expression names.
- Empty workspace onboarding: the first GM turn now bootstraps a minimal `game_state.json` before invoking the GM bridge, so a valid `turn_result.json` can be merged even when the world folder starts blank.
- Character prompt context: imported/active character cards are no longer implicitly injected as party members. Only characters explicitly added to the party are included in GM party context.
- GM bridge prompts now explicitly require `turn_result.json` to be written as UTF-8 JSON, with a Windows PowerShell `-Encoding utf8` reminder to reduce mojibake JSON failures.

## [1.11.0] - 2026-07-01

**Adaptive TTS** — NPC ごとの voice profile、system TTS ルーティング、local edge-tts / OpenAI external bridge。ChatGPT レビュー指摘のフォールバック・タイムアウト・プライバシー硬化を同梱。

### Added — Phase 11A: NPC voice profiles

- **設計・プロンプト** — `PHASE11_ADAPTIVE_TTS_DESIGN.md`、`phase8_planning_and_prompts.md`（Claude/Grok/ChatGPT 向け）。11A（system）と 11B（local/external）のスコープ分割。
- **Core** — `npcVoiceCore.ts` / `ttsProviderCore.ts` で `npc_registry.json` の任意 `voice` フィールドをパース（caps + `sanitizeVoiceId`）。
- **Webview** — `61-tts-npc.js` が sender 名マッチ＋現在地で NPC 声を適用（同名曖昧時はグローバル TTS）。World タブ 🔊 Preview、TTS パネル NPC voice count。4 言語 i18n。
- **Code Comments ルール** — `AI_COLLABORATION.md` § Code Comments（Core ↔ Webview ミラー同期）。

### Added — Phase 11B: local/external TTS bridge

- **Bridge** — `ttsBridgeCore.ts` / `ttsBridgeRunner.ts`、`TextAdventureGMSkill/scripts/tts_local.py`（edge-tts）。Webview `requestNpcTts` → extension MP3 base64 再生。
- **OpenAI TTS** — `tts.external.provider=openai` + SecretStorage API key（`tts.external.enabled` default off）。
- **Attribution** — `GameEntry.speakerNpcId` + `turn_result.gmEntry` 対応。設定 `tts.local.*` / `tts.external.*`、コマンド Test Local TTS / Set TTS API Key。

### Fixed — Phase 11B hardening (ChatGPT review)

- **Webview fallback** — `ttsAudioReady` 時に `pendingBridgeTts` plan を再生開始まで保持。MP3 decode/play 失敗時も system TTS へフォールバック。
- **Bridge timeout** — `tts.local.timeoutMs`（default 30s）で subprocess kill、OpenAI fetch は `AbortController`。必ず `ttsAudioFailed` を返す。
- **Temp MP3 lifecycle** — `.text-adventure/tts/*.mp3` を読み込み後削除。
- **VoiceId sanitization** — 全 C0/DEL 制御文字を拒否（改行/タブ含む）。
- **Privacy logs** — TTS Output Channel は文字数 + voice のみ（台詞本文なし）。

## [1.10.0] - 2026-07-01

**Campaign Engine** — v1.7.3 以降の Phase 8〜10 と基盤硬化をまとめてリリース。世界イベントがクエストになり、GM が Referee/Narrator に分かれ、ターン履歴を Git Timeline で分岐できる。

### Added — Phase 8: Event-to-Quest

- **Quest Board** — `questGeneratorCore.ts` が `recentChanges` と urgent NPC needs から deterministic Quest Hooks を生成。World タブで available → active、active quest の GM prompt 注入、`turn_result.json.resolvedQuests` で完了反映。
- **Quest 完了報酬** — NPC 由来クエスト完了時に `playerTrust +10`、関連 need 解決、完了メモリ追加。Quest Board に報酬テキスト表示（4 言語）。
- **Quest Board i18n** — ラベル・空状態・Accept/ACTIVE・source バッジを 4 言語化。`testing_checklist.md` に手動確認手順。

### Added — Phase 9: Agentic Campaign Engine

- **二段階 GM（9A/9B）** — State Referee → Narrator。中間成果物は `.text-adventure/agentic/`、マージ後のみ `turn_result.json` 書き込み。設定 `textAdventure.gmBridge.agentic.*`（default off）。
- **マルチプロバイダ（9B）** — `grok` / `vscode-lm` / `ollama` / `koboldcpp` / `openrouter`。`agentic_stage_gm.py`（stdout のみ）、`runVscodeLmAgenticStage()`。
- **設計・テスト** — `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`、`test_agentic_gm_core.js`、`testing_checklist.md` に agentic E2E 手順。

### Added — Phase 10: Git Timeline

- **安全性** — 初回 `git init` 前にモーダル確認、拒否時は `gitAutoCommitInterval=0`、未コミット変更時は branch/switch をブロック、`shell: false`。
- **Inspector パネル** — 現在ブランチと `timeline/*` 一覧、Switch ボタン。`getGitTimelineStatus()` / `switchToBranch()`。
- **コミット対象拡張** — `world_forge.json` / `world_state.json` / `npc_registry.json` を含む。実在パスのみ `git add`。

### Added — UX & onboarding

- **Start Hub** — 空ワークスペースで「どんな冒険を始めますか？」ハブ（ざっと作る / 質問しながら作る、プリセットチップ、4 言語）。
- **画像ツッコミ** — シーン画像下の「ツッコむ」ボタンで描写ズレ修正依頼を入力欄へ差し込み。

### Added — Infrastructure

- **`commitGameState()` 単一関所** — 全 `game_state.json` 書き込みを `stateManager.ts` に集約。
- **`vscode-lm` プロバイダ** — VS Code Language Model API 経由の GM。`engines.vscode` を `^1.93.0` に引き上げ。
- **Local model scan** — `modelScanner.ts`、ComfyUI 向け checkpoint / LoRA / GGUF 分類。
- **Cartography 進化** — Voronoi レイアウト、テーマ別プロンプト、HTML ラベル/ピン overlay、任意 LoRA プリセット、direct workflow、docs。
- **Phase 8-11 planning** — `phase8_planning_and_prompts.md`。

### Fixed — Agentic GM

- ステージ前に古い `referee_result.json` / `narrator_result.json` を削除（stale 誤採用防止）。
- Agentic base prompt から単発 GM の `turn_result.json` 指示を除外。
- マルチプロバイダ: stdout JSON フォールバック、OpenRouter キー取得統一、busy flag クリーンアップ。

### Fixed — World & state hardening (Phase 2–6)

- `gameStateSanitize.ts`、HP/MP 検証、ReDoS lorebook、`hiddenDice` null フィルタ、checkpoint migrate/sanitize。
- `capRecentChangesByWorldTurn`、`capVisualMemoryEntries`、Since Last Visit 再注入防止。
- Remote Play `maxClients` 認証済みのみカウント。Cartography / NPC 防御の一貫性。

### Fixed — Webview & i18n

- タブ切替・クリック・空白表示の重大バグ群、`#theme-header` 閉じタグ欠落、Webview アセットキャッシュ、World タブ位置/スクロール。
- 19+ i18n キー追加、`check_i18n_keys.js` 修正、`webview/index.html` 文字化け修正。

### Fixed — Other

- VSIX インストーラー・`ws` 依存・Installer i18n。Cartography ComfyUI workflow / 空リージョンクラッシュ。

### Changed — v1.10.0 release polish

- **`commitGameState` strict/salvage モード** — `stateManagerCore.ts` に純関数 `resolveGameStatePersistPlan()` を切り出し。`strict` は validate 失敗時に書かない。`salvage`（default）は sanitize → 再 validate、NG なら `game_state.invalid.latest.json` に退避して正本を守る。
- **Agentic 設定説明** — `package.json` の `gmBridge.agentic.enabled` をマルチプロバイダ対応の説明に更新。
- **`@types/vscode`** — `^1.93.0` に引き上げ（`engines.vscode` と整合）。
- **CHANGELOG 整理** — `[Unreleased]` の Phase 8〜10 塊を本セクションへ移動。過去セクションの文字化けは `9df8738` から復元済み。## [1.7.3] - 2026-06-29

### Fixed — Cartography & Remote Play (Claude review)

- **`cartographyRunner.ts`**: ComfyUI 生成 PNG を `validateCartographyGeneratedImagePath` + `resolveAllowedImagePath` で検証してから `copyFileSync`。
- **`cartographyRunner.ts`**: layout subprocess を `cartographyProcess` に追跡（deactivate 時の孤児プロセス防止）。未使用の `lastPngLine` 追跡を削除。
- **`remotePlayServer.ts`**: `/media` で `file` パラメータ欠落を署名検証より先にチェック。

## [1.7.2] - 2026-06-29

### Fixed — Cartography path alignment (ChatGPT review)

- **`cartography_path_utils.py`**: `validate_output_dir()` を TypeScript と同様に workspace root のみ許可（サブディレクトリ不可）。
- **`validate_layout_output_path()`**: 出力先を workspace 直下に限定（親ディレクトリ一致）。
- **`render_cartography_layout.py`**: `validate_layout_output_path()` を適用。引数省略時の既定出力を `world_map.layout.png` に統一。
- **Tests**: `test_cartography_path_utils.py` / `.js`；layout smoke test を workspace root 出力に合わせて更新。
- **Docs**: `CARTOGRAPHY_WORKFLOW_CONTRACT.md` にパス安全ルール表を追記。

## [1.7.1] - 2026-06-28

### Added — Cartography Hardening

- **`cartographyPathCore.ts`**: workspace 配下の `world_forge.json` / 地図出力パス検証。
- **`cartography_path_utils.py`**: Python CLI の forge / output ディレクトリ安全化。
- **Tests**: `test_cartography_path_core.js`、`test_cartography_layout_smoke.js`、`validate_cartography_workflow.js`。
- **Docs**: `docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`。
- **Demo**: `sample-scenarios/lost-catacombs/world_map.layout.png`、`CARTOGRAPHY_DEMO.md`。
- **README / DEMO**: 4言語 v1.7.1 反映、クイックスタート、Cartography を Optional 明記。

## [1.7.0] - 2026-06-28
### Added — World tab Cartography UI integration

- **`cartographyRunner.ts`**: VS Code コマンド / Webview から `comfyui_generate_cartography.py` を spawn。`world_map.png` と `world_map.layout.png` をワークスペースに保存。
- **コマンド** `LoreRelay: Generate World Map Image`（`textadventure.generateWorldMapImage`）。
- **`worldView.ts`**: `cartographyImage`・`cartographyPins`・`cartographyHasImage` を Webview へ postMessage。
- **World タブ UI**: Mermaid 図解 / 羊皮紙画像の切替、📍 ピンオーバーレイ（現在地ハイライト）、「Map Image」ボタン。
- **設定**: `textAdventure.imageGen.controlNet`（Cartography 用 SDXL Canny モデル名、任意）。

### Added — Cartography ComfyUI (Phase 7 Grok)

- **`cartographyLayoutCore.ts`**: `world_forge.json` から ControlNet 用レイアウト spec・プロンプト・HTML ピン座標（%）を pure 生成。
- **`render_cartography_layout.py`**: biome 色ブロブ + 接続線のレイアウト PNG（stdlib のみ）。
- **`comfyui_generate_cartography.py`**: レイアウト描画 → ComfyUI upload → SDXL Canny ControlNet ワークフロー実行。
- **`comfyui/workflow_cartography_sdxl_canny.json`**: パーチメント古地図向け Cartography ワークフロー。
- **Docs**: `docs/CARTOGRAPHY_COMFYUI.md`（Option A アーキテクチャ、モデル/LoRA 推奨、運用手順）。
- **Tests**: `test_cartography_layout_core.js`。

### Added — World Map Pan & Zoom + Biome Styling

- **World Map Pan & Zoom** (`webview/modules/85-world.js`): Mermaid マップ上でマウスドラッグによる移動（Pan）とマウスホイールによる拡大縮小（Zoom 0.15x〜5x、カーソル中心）を実装。ダブルクリックでリセット。npm モジュール不使用のフルスクラッチ実装。`#world-mermaid` を `overflow:hidden` の viewport として CSS 注入し、内部 SVG に CSS `matrix()` transform を適用。
- **Biome-based Mermaid Styling** (`src/worldMapGenerator.ts`):
  - 15 種の biome (`forest` / `desert` / `mountain` / `sea` / `coast` / `city` / `plains` / `swamp` / `wasteland` / `ruins` / `dungeon` / `underground` / `snow` / `volcanic` / `other`) に対応した絵文字アイコン・subgraph 背景色・ノードカラーを定義。
  - region の subgraph ラベルに biome アイコン（例: 🌲 Forest、⛰️ Mountain、🌊 Sea）を付与。
  - `style <regionId> fill:...,stroke:...` で subgraph 背景を暗色テーマ向け色に着色。
  - `classDef biome_<name>` でロケーションノードを biome カラーに染色（fill / stroke / text color）。
  - `region.biome` が未設定の場合は `inferRegionBiomeFromType(region.type)` でフォールバック。

## [1.6.3] - 2026-06-28

### Added — Cartography data foundation

- **Region cartography fields**: `world_forge.json` の `Region` に optional `x`, `y`, `biome` を追加。座標は `0..1000` の相対マップ座標。
- **Biome typing**: `RegionBiome` union を追加し、`forest` / `sea` / `city` / `underground` などの地形分類を型定義。
- **Parser hardening**: `parseWorldForge` が `x/y` を整数へ丸めて `0..1000` にクランプ。非数値座標は無視。未知 `biome` は `Region.type` 由来の安全な値にフォールバック。
- **Generator support**: `generateWorldForge` が新規生成Regionへ deterministic な `x/y/biome` を付与。接続グラフに合う円配置ベースで、隣接Regionが極端に離れない初期配置にした。
- **Docs**: `docs/CARTOGRAPHY_DESIGN.md` を追加し、LLM向け `world_forge.json` Cartography生成プロンプトを記録。
- **Tests**: `test_world_forge.js` / `test_world_forge_generator.js` に座標・biome・接続距離の回帰テストを追加。

## [1.6.2] - 2026-06-28

### Security — Remote Play signed media URLs

- **`remoteMediaSignatureCore`** (新規): `/media` 用 short-TTL HMAC 署名（`file` + `exp` + `sig`）。`crypto.timingSafeEqual` で検証。
- **`remotePlayServer`**: 画像 URL から session token を除去。レガシー `?token=` は 401 で拒否。署名期限切れは 403。
- **設定**: `textAdventure.remotePlay.mediaUrlTtlSec`（既定 300 秒、60–3600）。
- **テスト**: `test_remote_media_signature_core.js` + `test_remote_play_server.js` 更新。

## [1.6.0] - 2026-06-28

### Fixed — Audit Wave T7 (Remote Play セキュリティ再監査)

#### `remotePlayServer.ts` — セキュリティ補強

- **`serveMedia` 二重デコード除去 (P1)**: `URLSearchParams.get('file')` は既に URL デコード済みなのに `decodeURIComponent()` を再適用していた。`%252F..` 等のダブルエンコードトラバーサル試行が `resolveAllowedImagePath` より手前で意図せず展開される可能性を排除。`path.normalize(file)` に変更。
- **`serveStatic` `startsWith` にパスセパレータ追加 (P1)**: `remote-player` プレフィックスのみの比較では `remote-player-evil/` 等のディレクトリが理論上マッチし得た。`path.sep` サフィックスを追加してプレフィックス混同を防止。

#### テスト追加 — 9 件

| テスト | スクリプト |
|--------|-----------|
| `/media` パストラバーサル (`../../evil.png`) → 403 | `test_remote_play_server.js` |
| `/media` ダブルエンコードトラバーサル (`%252F..`) → 403 | `test_remote_play_server.js` |
| `disposeRemotePlayServer` 後の `running=false` | `test_remote_play_server.js` |
| Spectator からの `freeInput` → `Spectator mode (read-only)` | `test_ws_functionality.js` |
| 4001 文字超 WS メッセージ → close 1009 | `test_ws_functionality.js` |
| Pre-auth 非 auth メッセージ → Unauthorized + close 1008 | `test_ws_functionality.js` |
| token ローテーション後の旧 token WS 拒否 | `test_ws_functionality.js` |
| token ローテーション後の新 token WS 受理 | `test_ws_functionality.js` |
| `isGmBusy=true` → `GM is busy` / `isGameOverActive=true` → `Game over` / `text>2000` → `Invalid input` | `test_ws_functionality.js` |

#### 確認済み回帰テスト（変更なし）

- `maxClients` 超過 → code 1008 即切断 ✅
- Pre-auth で state 漏れなし (`sendToClient force` は handshake のみ) ✅
- `remoteInputLocked` が `finally` で確実に解除（GM エラー・kill 時も） ✅
- `/media` token 必須・`resolveAllowedImagePath` で二重防御 ✅
- `rotateRemotePlayToken` が全クライアントを切断して新 token を生成 ✅
- `notifyRemoteGmBusy(false)` が `releaseRemoteInputLock()` を呼ぶ ✅
- `disposeRemotePlayServer` → `stopRemotePlayServer` の完全な状態リセット ✅
- `buildRemotePlayerState` が `hiddenDice.result` を含まない（型レベルで存在しない） ✅

## [1.6.1] - 2026-06-28

### Merged to `main`
- `refactor/ws-and-extension-split` / `feat/v1.5-visual-memory` を `main` にマージ（Phase 6 監査ウェーブ一式）。
- マージ時に `zh-CN` / `zh-TW` へ World タブ・Game Rules 翻訳キー 18 件を補完（`validate.js` locale 同期）。

### Fixed — Audit Wave T8 (Extension Hub)

- **handleGenerateWorldForge**: コマンドパレット経路でも seed/theme/カウントを `webviewHandlersCore` で正規化・クランプ。`isValidEventId` で seed 検証。
- **handleGenerateLocationImage**: `isValidEventId` ガードを hub 側にも追加。
- **deactivate / panel dispose**: `resetGmBridgeSessions()` を呼び出し、Grok/LLM `--continue` フラグの残留を防止。`panel` / watcher 参照をクリア。
- **oocSidekick**: Webview へ送る commentary を 500 文字にクランプ。
- **clampWorldGenCount**: `webviewHandlersCore` に移動し hub/webview で共有。
- **.gitignore**: `sample-scenarios/**/scenario.json` を追跡対象に（`test_sample_scenarios.js` の CI 失敗を解消）。

## [1.5.9] - 2026-06-28

### Fixed — Audit Wave T5/T6 (Visual + Webview)

#### T6 — Webview & postMessage
- **webviewHandlersCore** (新規): World Forge seed/theme、Mermaid target、memory backend、equipment notify、文字列クランプの pure 検証。
- **webviewHandlers**: `generateImage` prompt/entryId 検証、`generateWorldForge` seed を `isValidEventId` で検証、`generateLocationImage` に locationId 検証、checkpoint ID 検証、Mermaid/memory backend allowlist、`requestVlmAnalysis`/`setNpcPortrait` で resolved path を渡すよう修正。
- **85-world.js**: クライアント側でも seed 形式・数値クランプを二重適用。

#### T5 — Visual / VLM 回帰
- **vlmQueue**: 非同期キューの `pendingPath` を unresolved ではなく `resolveAllowedImagePath` 済みパスに統一。
- **テスト**: `scripts/test_webview_handlers_core.js` を追加。

## [1.5.7] - 2026-06-28

### Fixed — Audit Wave T4 (ST Import / Character / Lorebook)

- **characterId**: `resolveCharacterJsonPath` がメタファイル予約 ID（`party`, `dynamic_profiles`, `party_director`, `active_character`）をブロックするよう修正 — 「party」という名前の Tavern カードが `party.json` を上書きする P0 バグを修正。
- **tavernCardImporterCore** (新規): `extractJsonFromPng` と `normalizeCharacterBook` を pure モジュールに抽出（vscode 非依存、Node テスト可能）。
- **tavernCardImporter**: `saveCharacterBookAsLorebook` を `fs.writeFileSync` から `writeJsonAtomic` に変更（非アトミック書き込み解消）。保存形式を `{format, source, entries}` ラッパーに変更し `readLorebookFile` との互換性を修正（P0 バグ: 以前は常に空ロードになっていた）。
- **tavernCardImporter**: `normalizeCharacterBook` にエントリ数 200 件・content 4000 文字・key 200 文字・key 数 20 件の上限を追加（DoS 防止）。
- **characterManager**: `loadCharacterById` に `isValidCharacterId` ガードを追加（パストラバーサル防止）。`getPartyIds` が `filterValidCharacterIds` でフィルタリングするよう修正。
- **lorebookMatcher**: 正規表現パターン長が 200 文字を超えた場合に部分文字列マッチにフォールバック（ReDoS ガード）。
- **テスト**: `scripts/test_tavern_card_importer.js` を新規作成（35 件）、`npm test` に統合。

## [1.5.6] - 2026-06-28

### Fixed — Audit Wave T3 (World + NPC + Living Feedback)

- **worldForgeCore**: `parseRegion` で `dangerLevel` を 0–10 にクランプ。`parseFaction` で `power` を 0–100 にクランプ（手動編集 JSON からの範囲外値を阻止）。
- **worldStateCore**: `parseFactionWorldState` で `power`/`morale` を 0–100 にクランプ。`parseGlobalEvent` で `id` を `isValidEventId` で検証（スペース・パス区切り等を含む不正 ID を破棄）。`WorldChangeEvent` との一貫性を確保。
- **npcBridgeCore**: `upsertNeed` のデッドパラメータ `candidateId` を除去。呼び出し側で不要な `makeNeedId` 計算を排除。
- **テスト**: `test_world_forge.js` に dangerLevel/power クランプの回帰テスト（6件）を追加。`test_world_state.js` に power/morale クランプ（5件）・GlobalEvent id バリデーション（2件）の回帰テストを追加。

## [1.5.5] - 2026-06-28

### Fixed — Audit Wave T2 (GM Bridge & Turn Pipeline)
- **diceRoller**: マクロ数上限（20）、`reason` 長さクランプ、`dc` 範囲クランプ（1–10000）。
- **gmPromptBuilderCore**: `buildHintTextFromContents`（6000文字上限）と `buildWorldChangeSummaryFromChanges` を pure モジュールに抽出。世界変化サマリは最新 sim ステップの non-info のみ注入。
- **gmBridgeRunner**: GM 失敗・kill 時に `dice_ledger.json` をクリアし、次ターンへのロール持ち越しを防止。`killGmBridgeProcesses` で `remoteInputLocked` を確実に解除。
- **テスト**: `test_dice_roller.js`、`test_gm_prompt_builder_core.js` を追加。

## [1.5.4] - 2026-06-28

### Fixed — Audit Wave T1/T7 (State & Remote)
- **validateGameState 拡張**: `hiddenState` 型検証、`world.lastGeneratedImage` / `lastGeneratedLocationId` / `worldTurnAtLastSync` の検証強化、`npcMemoryUpdates[].npcId` を `isValidEntryId` で検証。
- **npcMemoryUpdates パース**: 不正 `npcId` を `parseNpcMemoryUpdatesFromGameState` でスキップ（二重防御）。
- **mergeGmEntryFromTurn**: `gmEntry.image` パスを 500 文字にクランプ。
- **テスト**: `scripts/test_validate_game_state.js` を新規追加。`test_ws_functionality.js` を `npm test` に統合。

## [1.5.3] - 2026-06-28

### Fixed — Visual Memory Phase 5 follow-up review
- **Gallery Analyze 復元漏れ**: `gameStateSync` が Webview 表示用URIへ変換する前の `rawImagePath` を履歴エントリと `latestImageRawPath` に保持し、フル履歴再送・Webview再表示後も Analyze ボタンが使えるよう修正。
- **Gallery 重複抑制**: Webview URI だけでなく `rawPath` の正規化比較でも同一画像をマージし、再表示やURI再生成で同じ画像が重複しにくいよう修正。
- **Visual Memory hash I/O**: `hashImageFile()` の読み込み処理を `try/finally` 化し、例外時もファイルディスクリプタを確実に閉じるよう修正。
- **回帰テスト**: Webview bundle テストに `latestImageRawPath` / `imagePathsLooselyMatch` の存在確認を追加。
- **テスト安定化**: World Forge Generator の決定性テストが実時間 `generatedAt` のミリ秒差でフレークしないよう、生成内容比較から timestamp のみ除外。

## [1.5.2] - 2026-06-28

### Fixed — Visual Memory Phase 5c/5d コードレビュー
- **portraitImagePath パース漏れ**: `parseNpcEntry` が `portraitImagePath` を読み込んでおらず、再起動でポートレートが消える問題を修正。
- **setNpcPortrait 無検証**: `npcId` / 画像パスを `isValidEntryId` + `resolveAllowedImagePath` で検証。
- **Gallery ↔ VLM パス不一致**: `rawImagePath` を resolved path で統一。`vlmAnalysisComplete` をキャッシュヒット時も送信。パス比較を正規化マッチに変更。
- **Analyze ボタン固着**: `vlmAnalysisFailed` イベントでギャラリー UI を復帰。
- **QuickPick 無制限**: visual memory から最大40件・許可パスのみ表示。
- **getEntriesByLocation**: 無効 `locationId` 拒否 + ソート/上限。

## [1.5.1] - 2026-06-28

### Fixed — Visual Memory Phase 5a/5b コードレビュー
- **game_state 書き戻し**: `latestImage` と解析対象パスの比較を `resolveAllowedImagePath` 経由の realpath 一致に変更（相対/絶対パス不一致で description が書けない問題を修正）。
- **VLM 無効時**: `enqueueVlmAnalysis` / GM bridge が無駄にキュー投入しないよう `isVlmEnabled()` ガード。`buildVisionContext` も空返し（「解析中」誤表示を防止）。
- **パス安全**: `hashImageFile` が許可ルート外のファイルを読まないよう `resolveAllowedImagePath` を通す。
- **メタデータ**: `worldTurn` を `game_state.world` ではなく `world_state.json` から取得。`locationId` を `isValidEntryId` で検証。
- **説明文**: `sanitizeVlmDescription` で game_state / visual_memory への書き込みを正規化・上限化。

### Added
- **`vlmQueueCore.ts`**: 純関数 `sanitizeVlmDescription` / `resolvedImagePathsMatch`。
- **`scripts/test_vlm_queue_core.js`**: 上記の単体テスト。

## [1.4.1] - 2026-06-28

### Fixed — Living World Feedback hardening (Phase 4b 監査)
- **NPC bridge 二重適用**: `maybeTickSimulation` が `recentChanges` 全件を毎 tick 再処理していた問題を修正。`stepEvents`（当該ステップ分のみ）を NPC bridge に渡すよう変更。
- **イベント洪水**: 食料枯渇は 0 への遷移時のみ発行。地域危険度は整数ティア上昇時のみ発行。
- **Need upsert**: 食料/安全 Need の `relatedEventId` を安定キーにし、繰り返し tick で Need が増殖しないよう修正。
- **statePatch /world**: ルート `/world` 一括置換を拒否。許可サブパスの値に ID 形式・dangerLevel 0–10 検証を追加。
- **マップハイライト**: 期限切れ `recentChanges` を `pruneExpiredEvents` で除外してから 🔥 表示。

### Added
- **`scripts/test_npc_bridge.js`**: food crisis upsert・region safety・ハイライト抽出のテスト。
- **emergentSimulator / statePatch テスト拡充**: recentChanges・world allowlist カバレッジ追加。

## [1.3.2] - 2026-06-28

### Fixed — Phase 1–4 安全監査
- **Phase 4 上書きフロー復旧**: `handleGenerateWorldForge` が `ensureWorldStateExists` + `overwrite: false` のままだった問題を修正。生成成功時は常に `resetWorldStateFromForge`、上書き時は NPC registry も `overwrite: true` で同期。`enableWorldForge` / `enableNpcRegistry` を自動 ON。
- **Webview 生成パラメータ**: `regionCount` / `factionCount` / `npcCount` を generator と同じ範囲にクランプ（悪意ある postMessage 対策）。
- **worldMapGenerator**: 派閥→ロケーション辺を描画済みロケーションのみ・最大30本に制限（巨大 forge での Mermaid 爆発防止）。
- **parseWorldForge / parseWorldState**: 配列・エントリ数の上限を追加。参照 ID（`regionId` / `factionControl` 等）を `asId` で検証。

## [1.3.1] - 2026-06-28

### Fixed — Phase 5 World × ComfyUI 連携（コードレビュー対応）
- **初回ロード誤発火**: `autoOnLocationChange` がパネル初回 `sendCurrentState` で発火しないよう、`lastGoodGameState` 存在かつ `oldLocationId` 定義時のみフック実行。
- **game_state 書き戻し廃止**: `lastGeneratedLocationId` の追跡を `locationImageTracker.ts`（拡張機能メモリ）に移行。`sendCurrentState` からの `writeJsonAtomic` 副作用を削除。
- **ライブ worldState 反映**: 手動・自動とも `loadWorldState()` を `buildLocationImagePrompt` に渡し、シミュ後の danger / controllingFaction をプロンプトに反映。
- **画像モード**: `'illustrious'` ハードコードを廃止し `getResolvedImageMode()`（`image_gen_config.json` 参照）に統一。
- **60s クールダウン**: 同一 location の自動再生成を `locationImageTracker` で抑制。
- **キュー dedup**: location 画像に `entryId: loc:<id>` を付与。

### Added
- **`locationImageBuilderCore.ts`**: vscode 非依存の純関数プロンプトビルダー。
- **`locationImageTracker.ts`**: 自動生成のメモリ追跡・クールダウン。
- **`scripts/test_location_image_builder.js`**: プロンプト合成・トラッカーの単体テスト。

### Changed
- **World タブ Scene Image ボタン**: 3秒タイマー廃止。`imageGenEnd` / `locationImageGenEnd` で UI 復帰。

## [1.3.0] - 2026-06-27

### Added — World Forge Generator (Phase 4)
- **`worldForgeGeneratorCore.ts`**: `worldSeed` / `theme` / 規模パラメータから決定的に `world_forge.json` を手続き型生成（region グラフ・派閥関係・NPC 配置・loreHistory）。
- **`worldForgeGenerator.ts`**: 生成結果の `writeJsonAtomic` 保存・パース検証・キャッシュ無効化。
- **`bootstrapNpcRegistryFromForge()`**: `initialNpcs` から `npc_registry.json` を自動シード（role ベースの personalityTraits 付与）。
- **`resetWorldStateFromForge()`**: 生成・上書き時に `world_state.json` を forge から再構築（旧 state との不整合を防止）。
- **World タブ Generate UI**: seed/theme/regions/factions/NPCs 入力フォーム + `worldGenStart/End` 進捗表示。
- **コマンド**: `textadventure.generateWorldForge`（コマンドパレットからも実行可）。
- **設定**: `textAdventure.worldForge.defaultRegionCount` / `defaultFactionCount` / `defaultNpcCount` / `llmEnrich`。
- **テスト**: `scripts/test_world_forge_generator.js`（決定性・参照整合・テーマ差分）。

### Fixed
- **`getFactionName()`**: `emergentSimulator` の派閥イベント文が ID ではなく表示名を使用。
- **生成後の Game Rules**: 成功時に `enableWorldForge` / `enableNpcRegistry` を自動 ON。
- **上書き時の整合性**: 既存 `world_forge.json` 上書き時、NPC registry（overwrite）と world_state（再生成）も同期更新。

## [1.2.0] - 2026-06-27

### Fixed
- **WorldタブUIのバンドル漏れ修正**: `scripts/build-webview.js` の `JS_MODULE_ORDER` に `85-world.js` が含まれていなかったバグを修正し、正しくUIがロードされるように。
- **バージョン表記の整合性確保**: `package.json` および `package-lock.json` のバージョン表記を `1.2.0` へ引き上げ。
- **Webviewバンドル検証テストの新規導入**: `scripts/test_webview_bundle.js` を追加し、ビルド後のスクリプト内に `worldView` 等の主要シンボルが存在することを保証する自動テストを `npm test` に組み込み。

### Added
- **生きている世界システム (World System)**:
  - `world_forge.json` に基づき地域、派閥、NPC初期配置、歴史などをシード定義・生成・検索する World Forge モジュール (`worldForge.ts`, `worldForgeCore.ts`) を実装。
  - NPCの好感度、恐怖、信頼などの関係値（Disposition）、記憶（Memory）、動的ニーズ（Needs）を保持・管理する NPC Registry モジュール (`npcRegistry.ts`, `npcRegistryCore.ts`) を実装。LLMの `npcMemoryUpdates` による自動更新やGMへのコンテキスト注入に対応。
  - Webview上に地域と派閥の接続図と現在地（★）を描画する「World」タブ（Mermaid.jsによる動的ネットワーク図 + 派閥ステータスカードUI）を追加。
  - LLMを介さない軽量ルールベースの自律進行シミュレータ (`emergentSimulator.ts`, `worldState.ts`, `worldStateCore.ts`) を実装。ターン経過に伴う資源消費、パワーバランス、危険度、警告イベントを自動計算。
  - GMプロンプトビルダーに世界状態とNPC関係値を注入する `buildWorldStatePromptContext` と `buildNpcRegistryPromptContext` を統合。
- **VLM 統合 (Soulgaze)**:
  - プレイヤーの入力画像やシーン背景を Vision LLM (Ollama/OpenRouter) を使って非同期でテキスト解析・要約し、GMのナラティブ描写に組み込む Vision コンテキスト注入機能を実装 (`vlmProvider.ts`, `gmBridgeRunner.ts`)。

## [1.1.3] - 2026-06-27

### Fixed — Claude Review Follow-up (v1.1.2 残件)
- **`isGameOverActive()` キャッシュ化**: `gameStateSync.getCachedGameState()` 経由で `gameOver.active` を参照し、毎ターンの `readFileSync` を廃止。
- **`timingSafeEqual` トークン比較**: WebSocket 認証と `/media` エンドポイントで `crypto.timingSafeEqual` による定数時間比較に変更。
- **`remoteInputLocked` 60s ウォッチドッグ**: GM クラッシュ時の永続ロックを防ぐタイマーを追加。`acquireRemoteInputLock()` / `releaseRemoteInputLock()` で一元管理。
- **GM プロンプト I/O 削減**: `gmPromptBuilder` が `getCachedGameState()` を優先利用。ロアブックは mtime キャッシュで再読み込みを抑制。

### Note
- **VLM (`buildVisionContext`)** は意図的スタブのまま（パス文字列のみ）。真の multimodal 統合は Phase 4A で対応予定。

## [1.1.2] - 2026-06-27

### Fixed — Security & Stability (Post-v1.1.2 Code Review)
- **Command Double Registration**: Fixed critical command registration crash by removing the duplicate `checkForUpdates` command registration from `extension.ts`.
- **WebSocket Connection Limits**: Implemented connection limit (`maxClients`) verification upon connection, rejecting clients beyond the limit with close code `1008`.
- **Pre-Authentication Message Delivery**: Fixed a bug where `authRequired` and `Unauthorized` messages were dropped due to a state verification check on `sendToClient()`. Implemented a `force` delivery mechanism.
- **WebSocket Closure Safety**: Added a `50ms` delay on client disconnect following error messages, allowing client sockets to parse error messages before connection termination.
- **Input Locking Safety**: Wrapped player action executions in `try...catch...finally` blocks to guarantee `remoteInputLocked` is always released, preventing permanent lockout of remote clients in case of GM failure.
- **Sync I/O Minimization**: Implemented a memory cache for Game Rules to avoid repeated synchronous `fs.readFileSync` checks per turn.

### Added
- **WebSocket Integration Tests**: Added `scripts/test_ws_functionality.js` verifying maxClients, pre-auth messages, delayed closures, and input lock safety.

## [1.1.1] - 2026-06-26

### Fixed — Hotfixes
- **Security Hardening**: Removed external QR code generation dependency and localized Mermaid.js rendering to run without CDN.
- **Bug Fixes**: Fixed 'Easy' difficulty persistence issue, and fixed dynamic resource bar append issue in the UI.

## [1.1.0] - 2026-06-26

### Added — Phase 5: Advanced Simulation & Visualizations
- **Game Rules Toggles**: Added toggles for experimental features: "Skill Commentary", "Background Simulation", and "Auto Lorebook Growth" in the settings panel. These influence the GM's prompt behavior.
- **Quest Flow & Relations Graphs**: Added `🗺️ Quest Flow` and `🕸️ Relations` buttons. They trigger Mermaid.js flowchart generation by the GM.
- **Mermaid.js Rendering**: Embedded Mermaid.js into the webview. Any ` ```mermaid ` block returned by the LLM is automatically rendered as an interactive diagram.
- **Affection/Reputation Trackers**: Added visual progress bars (0-100) for tracking dynamic stats like `affection` or `reputation` sent in the `status` payload.

### Added — Phase 4: Extended Core & UI Tools (Antigravity)
- **Git Time Travel**: Auto-commit interval setting and `⎇ (Branch)` button in messages to branch timelines.
- **Equipment Slots**: Character Profile now supports Weapon, Armor, Accessory slots with one-click GM notification (`📤 Equip & Notify GM`).
- **Force Speak (🪄 Speak as...)**: Quick Reply bar button to force a specific character/NPC to speak next.
- **Export Saga to HTML (🌐 Export HTML)**: Quick Reply bar button to export the entire chat log with base64 embedded images as a rich HTML file.
- **Responsive WebUI**: Drag-to-resize border (`#resizer`) between chat and status panes. Status tabs collapse to icons when space is limited.
- **Locale Selection**: Added `textAdventure.locale` to VS Code settings (`package.json`) to select UI language (`en`, `ja`, `zh-cn`, `zh-tw`).
- **Python Auto-Setup**: Extended `setup.ps1` to auto-install `chromadb` and `scikit-learn` from `requirements.txt` if Python is available.

（次のマイルストーン: Phase 2B TavernCard V1/V2 完全対応 / Phase 4A VLM 統合 / 実験的機能の追加）

## [1.0.0] - 2026-06-26

**LoreRelay v1.0 — public release polish.**

### Added

- **Sample scenarios (3)** — `lost-catacombs`, `neon-rain`, `harbor-mist` in `sample-scenarios/` and `TextAdventureGMSkill/scenarios/`.
- **`MODEL_PRESETS.md`** + `presets/` — recommended GM bridge and `image_gen_config.json` snippets (Grok, Ollama, OpenRouter, illustrious/pony/natural).
- **`COMFYUI_WORKFLOWS.md`** + `comfyui/` — bundled `workflow_api.json` (512) and `workflow_sdxl_1024.json`.
- **README visuals** — `docs/assets/*.svg` UI mockups; [`DEMO.md`](DEMO.md) recording guide.
- **`scripts/test_sample_scenarios.js`** — validates bundled scenario packs in `npm test`.

### Changed

- README (ja/en/zh) — screenshots section, v1.0 feature list, scenario table, preset links; roadmap updated (Remote Play shipped in v0.7).

## [0.7.0] - 2026-06-26

Party Director & Remote Play enhancements (see v0.7 roadmap).

## [0.3.3] - 2026-06-26

Phase 2B 完了（`a693892`）とフェーズ 3 ゲート（SKILL 同期・Python 整合・E2E スモーク）。

### Added — Phase 2B: ST ロアブックマッチングエンジン

- **`src/lorebookMatcher.ts`** (新規): vscode 依存なしの純粋マッチング関数 `matchEntriesAgainstText` を分離。`LorebookEntry` インターフェースに ST 互換フィールドを追加:
  - `use_regex?: boolean` — キーを正規表現として評価（`/pattern/flags` 形式と裸のパターン両対応。不正な正規表現はサブストリングフォールバック）
  - `secondary_keys?: string[]` — AND 条件: primary key ヒット後に secondary key のいずれかも一致する必要あり
  - `insertion_order?: number` — ST の挿入順位。`priority` が未設定の場合に参照（降順ソート）
- **`src/gmPromptBuilder.ts`**: `matchLorebookEntries` を `matchEntriesAgainstText` の薄いラッパーに置き換え。`LorebookEntry` を `lorebookMatcher` から import。
- **`scripts/test_lorebook.js`** (新規): ロアブックマッチングエンジンの単体テスト（11ケース: サブストリング/OR/大小文字/Regex/不正Regex/Secondary Keys/ソート/maxEntries/空入力）。
- **`scripts/validate.js`**: `test_lorebook.js` を `npm test` に統合。

### Added — フェーズ 3 ゲート（Grok）

- **`scripts/test_turn_result_pipeline.js`**: `statePatch` + `mergeGmEntryFromTurn` + `lorebookMatcher` 統合スモークテスト。
- **`scripts/test_lorebook_python.py`**: Python `match_lorebook` と TS エンジンの整合スモークテスト。
- **`TextAdventureGMSkill/SKILL.md`**: 正規契約を `turn_result.json`（Persist-Before-Narrate）に更新。`game_state.json` 直書きは緊急フォールバックに格下げ。ロアブック `triggeredLore` / ST 互換フィールドを追記。
- **`gm_bridge_common.py`**: `match_lorebook()` を TS `lorebookMatcher` と同等の regex / secondary_keys / insertion_order ロジックに更新。

### Changed

- **`remotePlayServer.ts`**: `127.0.0.1` バインド時は LAN URL を表示しない（ChatGPT S-07）。Output Channel のトークン全文ログをマスク。

### Security

- ChatGPT 監査 (`C:\AI\CHATGPT_SECURITY_AND_SKILL.md`) を参照。S-07 部分対応。S-02〜S-06 は将来対応。

### Added（ドキュメント）

- **`AI_HANDOVER_PROMPTS.md`**（`c93ee26`）: マルチ AI 引き継ぎ手順書。

## [0.3.2] - 2026-06-26

コードレビュー（`7576998`〜HEAD）指摘に基づく堅牢化リリース。Phase 1〜3 の未記載分もこの版にまとめて記録。

### Added — Phase 2A: Persist-Before-Narrate E2E

- **`turn_result.json` パイプライン**: Python GM bridges（Ollama / KoboldCPP / OpenRouter）が `turn_result.json` をアトミック書き込み。TS `processTurnResult` が `statePatch` を検証・適用し、`narration` / `gmEntry` を `entries` にマージ、`state_journal.ndjson` に `beforeHash` / `afterHash` / `appliedAt` を追記。
- **`src/turnResultFallback.ts`**: Grok / カスタム GM が `game_state.json` を直接更新した場合、GM 開始前スナップショットから `turn_result.json` を合成（Inspector・ジャーナル・MediaAgent をパッチ経路に統一）。
- **`src/mediaPaths.ts`**: `isAllowedImagePath` を共通化（`gameStateSync` ↔ `remotePlayServer` の循環依存を解消）。
- **`scripts/test_state_patch.js`**: `applyStatePatch` / `mergeGmEntryFromTurn` / `buildStatePatchFromDiff` の単体テスト（`npm test` に統合）。
- **Python `gm_bridge_common.py`**: `build_state_patch()` / `write_turn_result()` / `game_rules.json` プロンプト注入 / `triggeredLore` 出力。`TA_LEGACY_WRITE_GAME_STATE=1` で旧 `game_state.json` 直書きにフォールバック可能。

### Added — Phase 2C: Turn Inspector

- **🔍 Inspector タブ**: ターン ID、整合性ハッシュ、ダイス台帳、状態パッチ、`triggeredLore` を表示（欠落していた `pane-inspector` HTML を追加、4 言語 i18n 15 キー）。
- **動的リソースバー**: `status` 内の任意キーを動的表示（Phase 4B 骨格）。

### Added — Phase 1 / 1.5

- **Phase 1.0**: `src/diceRoller.ts` — 入力中の `{{roll 1d20+2}}` 等をローカル確定し、LLM へ `[System Roll: …]` として注入。
- **Phase 1.5**: `game_rules.json` + Webview ⚙️ Game Rules パネル（RPG 要素 ON/OFF、最大 HP/MP、ダイス難易度）。`gmPromptBuilder` / Python システムプロンプトへ反映。

### Added — Phase 3A / 3B

- **Phase 3A (MediaAgent)**: `src/mediaAgent.ts` — GM stdout 早期 BGM/SFX、画像キュー、`turn_result` フック。設定 `textAdventure.mediaAgent.*`。
- **Phase 3B (Remote Play)**: `src/remotePlayServer.ts` + `remote-player/` — LAN WebSocket 同期、📱 トグル、コマンド `startRemotePlay` / `stopRemotePlay`。

### Added — インフラ・その他

- **Auto-Updater**: `updateManager.ts`、`update_lorerelay.bat` / `scripts/update_lorerelay.ps1`、`scripts/install_common.ps1`。
- **ステータス動的非表示**: `status` 欠落フィールド・`status` 全体の Webview 非表示（VN / 会話重視向け）。
- **Workspace Trust ガード**、**GM Bridge busy チェック統合**、**Grok CLI パス OS 非依存解決**。

### Changed

- **GM プロンプト（4 言語）**: `game_state.json` 直書きではなく `turn_result.json`（Persist-Before-Narrate）を指示。
- **`remotePlay.bindAddress` デフォルト**: `127.0.0.1`（LAN は `0.0.0.0` を明示設定）。
- **Remote Play**: GM 処理中のリモート入力 single-flight ロック（`remoteInputLocked`）。
- **MediaAgent**: JSON コードフェンス内のみストリーム解析、`clearMediaAgentCaches()` を GM セッション開始時に呼び出し。
- **`dice_ledger.json`**: `writeJsonAtomic` でアトミック書き込み。
- **`statePatch` allowlist 拡張**: `bgm` / `mood` / `sfx` / `theme` / `sprite` / `diceRequest` 等を schema 整合で許可。
- **`grokBridge.autoApprove` デフォルト**: `false`（セキュリティ強化）。
- **OpenRouter API キー**: 平文 settings から SecretStorage へ自動移行。
- **Refactor**: `extension.ts` モジュール分割、`webview/modules` + `build-webview.js`、`gameStateSync.ts`、`webviewHandlers.ts` 等。

### Fixed

- **Turn Inspector**: タブのみ存在しペイン HTML が欠落していた不具合。
- **Phase 2A E2E**: Python が `game_state.json` のみ直書きし `turn_result` / `narration` マージが未接続だった経路を修正。
- **状態検証**: スキーマ違反時は `sendCurrentState` を中止。チェックポイント復元時のメタデータ保持。
- **HiddenDice 重複表示**、**ダイス計算機上限**（100 面 / 10000 面）、**子プロセス二重発火**、**FileWatcher メモリリーク**。
- **メッセージ edit / exclude / branch** の不正 ID 無視、**入力・Author's Note 長さ検証**。

### Security

- **updateManager / インストーラー `.ps1`**: PowerShell コマンドインジェクション対策（`-File` + 名前付き引数）、GM skill アトミックインストール、VSIX 名正規表現検証、GitHub URL allowlist、HTTP/子プロセスタイムアウト。
- **シナリオ Pack**: `scenario_assets/` へアセットをローカルコピー（Webview `localResourceRoots` 制約対応）。

## [0.3.1] - 2026-06-26

### Added (Phase ST-A — Image Gen Settings & Workspace Config)

- **`image_gen_config.json`**: ワークスペース直下にセッション別の ComfyUI 設定を保存。checkpoint / mode / steps / cfg / width / height / sampler / scheduler / positive prefix・suffix / negative prompt / prompt templates を保持。
- **Image Gen Settings パネル** (Webview ヘッダー 🎨): Glassmorphism スライドインパネルからライブ編集。フォーカスアウト時に自動保存 (`updateImageGenConfig`)。
- **`src/imageGenConfig.ts`**: 設定の読み書き・サニタイズ（数値範囲・文字列長制限）。
- **`comfyui_generate.py`**: `TA_IMAGE_CONFIG` または cwd の `image_gen_config.json` を最優先適用。`TA_POSITIVE_PREFIX` / `TA_NEGATIVE_PROMPT` 等の環境変数にも対応。
- **i18n**: `webview.quickReply.*` / `webview.msg.*` / `webview.imageGen.*` を 4 言語に追加（v0.3.0 UI の未訳キー補完を含む）。

### Changed
- `buildImageGenEnv()` がワークスペース設定を VSCode `textAdventure.imageGen.*` より優先して `comfyui_generate.py` へ渡す。
- 画像生成のデフォルトモードが `image_gen_config.json` の `mode` を参照するよう変更。

## [0.3.0] - 2026-06-26

### Added (Phase ST-B + ST-D — Quick Reply Bar & Message Action Bar)

- **Quick Reply バー** (`#quick-reply-bar`): チャット入力欄の直上に横スクロール可能なショートカットボタンバーを新設。標準ボタン: ⏪ Undo / 🔄 Retry / 💾 Checkpoint / 📝 Summary / 🎨 Gen Image / 📂 Load Pack / 📖 Archive。ゲームオーバー時は他の入力欄と同様に一括ロック。
- **Message Action Bar** (`.msg-actions`): 各メッセージをホバーした際にインライン表示されるアイコンボタンバーを新設 (SillyTavern Phase ST-D)。ボタン: 📄 Copy / 📢 Speak (TTS) / 🎨 Gen Image / 🚩 Checkpoint / 👁️ Exclude / 🔱 Branch / ✏️ Edit。
- **インライン編集** (`startInlineEdit`): ✏️ ボタン押下でメッセージ本文が `<textarea>` に切り替わり、保存後に `editEntry` メッセージを送信して `game_state.json` を即時更新。
- **プロンプト除外トグル** (`toggleExcludeEntry`): 👁️ ボタンで `excludedFromPrompt: true/false` をトグル。Webview 側は対象メッセージを半透明 (`opacity: 0.4`) に。
- **ブランチ作成** (`branchFromEntry`): 🔱 ボタンで確認後、指定ターンを基点として `handleRestoreToTurn` を再利用し歴史を分岐。
- **`editEntry` ハンドラ** (extension.ts): 指定 ID の `content` を `game_state.json` と `gameEntryHistory` の両方に書き込み、`editedAt` タイムスタンプを付与。
- **`toggleExcludeEntry` ハンドラ** (extension.ts): `excludedFromPrompt` をトグル保存し、`entryExcludeToggled` で Webview を即時同期。
- **`loadScenario` ハンドラ** (extension.ts): Quick Reply の「Load Pack」ボタンから既存の `loadScenarioPack()` を呼び出し。

### Changed
- `GameEntry` 型に `excludedFromPrompt?: boolean` と `editedAt?: string` を追加 (`src/types/GameState.ts`)。
- `game_state_schema.json` に `imageBlocked` / `excludedFromPrompt` / `editedAt` フィールドを追加。
- `setInputLocked()` が `.qr-btn` も一括で `disabled` にするよう拡張。
- `applyI18n()` が Quick Reply バーのボタンラベルも `data-i18n` で切り替え可能 (キー `webview.quickReply.*`)。

## [0.2.11] - 2026-06-26

### Added
- DREAMIO-style manual image regeneration: Added `imagePrompt` field to `game_state.json` and a UI button to edit and regenerate scene images via ComfyUI.
- README に v0.3 候補として Remote Play Mode のロードマップを追加（LAN/Tailscale 前提、直接公開なし）。
- `LICENSE`（MIT）を追加。
- `SILLYTAVERN_COMPAT.md` に Connection Profile / Text Completion Preset / Quick Reply / Background Gallery など、今後取り込む ST 由来機能候補を整理。

### Security / Privacy
- Claudeレビュー対応: Webview CSP を nonce + `webview.cspSource` 方式へ更新し、`script-src 'unsafe-inline'` と旧 `vscode-webview-resource:` を除去。
- Claudeレビュー対応: TTS の `innerHTML` パースを廃止し、GMテキストをプレーンテキストとして扱うよう変更。
- Claudeレビュー対応: OpenRouter APIキーを VS Code SecretStorage に保存するコマンドを追加。既存 settings の `apiKey` は互換フォールバック扱いに変更。
- Claudeレビュー対応: `TextAdventureGMSkill/scripts/comfyui_generate.py` に HTTP timeout と出力先ブロック判定の正規化を追加。

### Fixed
- 画像再生成が `entryIndex` ではなく **`entry.id`** で履歴・`game_state.json`・Webview を一貫更新するよう修正（`updateEntry` メッセージ）。
- ツールバーの画像生成ボタンが直近 GM ターンの `entry.id` を渡すよう修正し、孤立画像にならないようにした。
- 画像生成の多重起動ガードを追加し、spawn エラー時も Webview の loading 状態が閉じるよう修正。
- `updateSummary` の入力型・最大長を検証。
- `game_state.json` のスキーマ警告フラグを、正常化後にリセットするよう修正。
- `TextAdventureGMSkill/scripts/openrouter_gm.py` の `max_tokens` を 3000 既定 + `--max-tokens` / `OPENROUTER_MAX_TOKENS` で調整可能に変更。
- `install_antigravity_skill.bat` が `..\TextAdventureGMSkill` をフォールバックコピー元として解決。
- VSIX から内部資料（`AI_*.md`、`src/`、`test/`、`*.map` 等）を除外するよう `.vscodeignore` を拡充（`out/` と `scripts/package_scenario.py` は同梱維持）。
- `validateGameState` に `entries[].imagePrompt` 検証を追加。

### Changed
- 共有ログ、AI協業文書、private scenario vault パッケージ補助スクリプトから、公開向けに不要なローカル具体パスを除去。

## [0.2.10] - 2026-06-26

### Security
- `checkpointId` を `/^cp-\d+$/` で検証（`loadCheckpointFile` / `deleteCheckpointFile` の path traversal 対策）。
- `handleRegenerateLastTurn` に `gameOver` ガードを追加（`handlePlayerInput` と同様）。

## [0.2.9] - 2026-06-25

### Added (DREAMIO + AI Dungeon / SillyTavern 参考)
- **ゲームオーバー検出** — `game_state.json` の `gameOver` フィールド。Webview オーバーレイ + 入力ロック。`SKILL.md` に strict/permissive/story プリセット。`setup.gameOver` をシナリオで指定可能。
- **チェックポイント & 任意ターン巻き戻し** — `.text-adventure/checkpoints/` に名前付き保存。ステータスパネルから「Rewind to turn」で履歴上の任意 GM ターンへ復元。
- **🔄 Retry（再生成）** — AI Dungeon 風。直前 GM 応答を別バリエーションで再生成。
- **Author's Note** — AI Dungeon / SillyTavern 風。次の1ターンのみ GM プロンプトに `[Author's Note: ...]` を付加。
- **Scenario Workshop** — `SCENARIO_WORKSHOP.md`、`workshop.json` 形式、`package_scenario.py`。コマンド: Validate / Export Scenario Pack (ZIP)。

### Changed
- `locales/*.json` — 180 キー（+33）。
- サンプル `lost-catacombs` に `setup.gameOver.strict` を追加。

## [0.2.8] - 2026-06-25

### Added
- DREAMIO から着想を得た 1ターン巻き戻し (Undo) 機能を追加。
  - 最新のプレイヤー行動と GM 応答を削除し、前ターンの状態にゲームをロールバックする。
  - `game_history.json` の各エントリに、ステータス、選択肢、テーマ、BGM/SE 状態のスナップショットメタデータをマージ保存し、完全な状態の復元に対応。
  - UI 下部入力欄に `⏪ Undo` ボタンを追加。
- DREAMIO から着想を得た AI 音声ナレーション (TTS) 機能を追加。
  - OS にインストールされた音声エンジン（日本語、英語、中国語）を自動選択してナラティブを読み上げる。
  - ヘッダーに音声設定パネル（有効/無効、音量、速度）を追加。
  - プレイヤーの入力時（自由入力 / 選択肢クリック）に、読み上げを自動でキャンセルする制御を追加。
  - `vscode.getState()` を通じた設定の永続化に対応。
- DREAMIO から着想を得た **音声入力 (STT)** 機能を追加。
  - 入力欄横の 🎤 ボタンで Web Speech API による音声認識。認識完了後に自動送信。
  - 4 ロケールに応じた `lang` 設定（ja-JP / en-US / zh-CN / zh-TW）。未サポート環境ではクラッシュせずメッセージ表示。

### Security / Privacy
- **Grok ブリッジ** — `-p` 引数でのプロンプト全文渡しを廃止し、`--prompt-file` + `.text-adventure/prompt-*.txt` 経由に変更（プロセス一覧からの漏洩防止）。
- **custom command ブリッジ** — `{actionFile}` プレースホルダを追加。デフォルト `commandArgs` を `--prompt-file {actionFile}` 形式に更新。
- Grok 自動承認フラグを `--yolo` から公式の `--always-approve` に更新。

### Fixed
- マルチルートワークスペースにおいて、画像生成 (`runImageGeneration`) が常に最初のフォルダに対して実行されてしまうバグを修正 (`getWorkspacePath()` を利用するよう統一)。
- Web Speech API (speechSynthesis) が無効または未サポートのブラウザ/プラットフォームにおいて、JS がクラッシュする問題を修正（オプショナルチェーンの導入および存在検証の追加）。

### Changed
- `locales/*.json` — 147 キー（+4 STT）。
- `GROK_CODE_REVIEW.md` — v0.2.8 時点の対応状況に更新。

## [0.2.7] - 2026-06-25

### Security / Privacy (pre-release hardening)
- **キャラクター ID 検証** — `^[a-zA-Z0-9_-]{1,64}$` + `path.resolve()` で `characters/` 配下拘束（`src/characterId.ts`）。
- **プレイ内容の秘匿** — Ollama/Kobold/OpenRouter は `--action-file` 経由。Output Channel は `[redacted action, length=N]`。Python 側ログも redact。
- **lorebook インポート** — 既存 `lorebook.json` がある場合は上書きせず `lorebook.imported.json` へ。
- **`.gitignore`** — `characters/`, `sagas/`, `memories/`, `lorebook*.json`, `.text-adventure/` 等を追加。

### Added
- **`src/validateGameState.ts`** — hiddenDice / diceRequest / profileUpdates / sprite / summary 等を検証。fixture テスト付き。

### Fixed
- 電卓で Enter キーが効かない回帰（`webview/script.js`）。

### Changed
- README — 「基本 API キー不要、OpenRouter は任意」と明記。
- `locales/*.json` — 135 キー（+2）。

## [0.2.6] - 2026-06-25

### Added
- **自動アーカイブ促し** — 履歴がプロバイダー別閾値を超えると Webview バナー + 通知で章アーカイブを提案。Ollama/Kobold/小型 OpenRouter は **30 ターン**、Grok / Gemini 級は **80 ターン**（設定で変更可）。
- **ChromaDB Memory Bank（オプション）** — `memory_chroma.py`。`textAdventure.memory.backend` = `auto` | `tfidf` | `chromadb`。`pip install chromadb` で embedding 検索、未導入時は TF-IDF にフォールバック。
- **`src/archivePrompt.ts`** — コンテキスト枠推定と閾値ロジック。

### Changed
- `memory_bank.py` — `--backend` / `--json` 対応。Grok プロンプトも Chroma 経由可能。
- `locales/*.json` — 133 キー（+11）。

## [0.2.5] - 2026-06-25

### Added (CHIM / Bannerlord 風メモリ — 第2段階)
- **Saga Archiver** — `archive_saga.py` + Webview「📖 章をアーカイブ」。古い `game_history.json` を過去形の散文章に圧縮 → `sagas/chapter-NNN.json`。verbatim バックアップは `sagas/verbatim/`。
- **Memory Bank（軽量 TF-IDF）** — `memory_common.py` / `memory_bank.py` / `src/memoryBank.ts`。Saga・ロアブック・動的プロフィール・履歴から関連メモリ top-3 を GM プロンプトに注入（ChromaDB 不要）。
- **共有 LLM クライアント** — `bridge_llm.py`（summarize / archive 共通）。

### Changed
- `gm_bridge_common.py` — Saga + Memory Bank を Ollama/Kobold/OpenRouter プロンプトに注入。`profileUpdates` 後にメモリインデックス再構築。
- `extension.ts` — Grok プロンプトにも Saga / Memory Bank を注入。`archiveSaga` ハンドラ。
- `SKILL.md` — Saga / Memory Bank の GM 手順。
- `locales/*.json` — 127 キー（+5）。

## [0.2.4] - 2026-06-25

### Added (Antigravity + Grok 仕上げ)
- **Dynamic Profiles（CHIM 風メモリ）** — GM が `profileUpdates` を出力 → `characters/dynamic_profiles.json` に永続化。Grok / ローカル LLM 両方でプロンプト注入。Grok 直書き `game_state.json` も extension が処理。
- **OpenRouter GM Provider** — `openrouter_gm.py`、`textAdventure.gmBridge.openRouter.*` 設定。
- **Context Summarizer** — Webview「要約生成」+ `summarize_gm.py`。`game_state.json` の `summary` を Grok / Ollama / KoboldCPP / OpenRouter で生成。
- **Party System** — Character Profile のパーティーチェックボックス + `party.json`。同行キャラを GM プロンプトに一括注入。

### Fixed (Grok — Antigravity 実装の穴埋め)
- **パーティー UI クラッシュ** — `charPartyCb` 未定義を修正。`partyIds` のチェックボックス同期。
- **Grok プロンプト不足** — `buildGmPromptContext` にパーティー・動的メモリ・あらすじを追加（Ollama 側との parity）。
- **メタ JSON 混入** — `party.json` / `dynamic_profiles.json` をキャラ一覧から除外。
- **要約ボタン** — 完了後に i18n 対応でボタンをリセット。
- **i18n** — あらすじ・パーティー・要約メッセージを 4 ロケール追加（122 キー）。

### Changed
- `SKILL.md` — パーティー・動的プロフィール・あらすじの GM 手順を追記。
- `game_state_schema.json` / `GameState.ts` — `summary` フィールド追加。

## [0.2.3] - 2026-06-25

### Added
- **SillyTavern 互換** — `SILLYTAVERN_COMPAT.md`。キャラカード（`.png` / `.json`）→ `characters/<id>.json`、World Info → `lorebook.json`。VSCode コマンド `Import SillyTavern Character Card` / `Import SillyTavern Lorebook`。
- **インポートスクリプト** — `import_st_card.py`、`import_st_lorebook.py`、`resolve_lorebook.py`（キーワードマッチ CLI）。
- **Character Profile タブ** — Webview でキャラ管理（名前・設定・性格・立ち絵）。Active キャラを Grok / Ollama / KoboldCPP プロンプトに自動注入。
- **ロアブック自動注入** — 直近ナラティブ＋プレイヤー行動からキーワードマッチしたエントリを GM プロンプトに付与。
- **VN 演出フィールド** — `game_state.json` の `background`（シーン背景）・`sprite`（立ち絵レイヤー、位置 left/center/right）。
- **クイックセットアップ** — `scripts/setup.ps1` / `scripts/setup.sh`（軽量ワンクリック）。
- **Character Profile i18n** — タブ・フォームを 4 ロケール対応（`webview.character.*` / `extension.st.*`）。

### Changed
- `gm_bridge_common.py` — キャラ記述の二重注入を整理（日本語ブロックのみ）。
- `locales/*.json` — 114 キー（94 → 114）。

## [0.2.2] - 2026-06-25

### Added (Claude — ダイス連携・品質基盤)
- **隠しダイスロール（GMスクリーン）** — `game_state.json` の `hiddenDice` で GM が振った事実のみ通知（出目非表示）。Webview に通知 + ダイス音。`extension.ts` が `result` をストリップ。`SKILL.md` 追記。4 ロケール対応。
- **GM ダイス要求・自動ロール** — `diceRequest` で GM がユーザーにダイスを振らせる。Webview 自動ロール + `playSfxAsync` で音の成否検出。失敗時はフォールバックで手動ロールを促す。`SKILL.md` 追記。4 ロケール対応。
- **画像ブロック時プレースホルダ UI** — `safeImageUri` 拒否時に `GameEntry.imageBlocked` → Webview で 🔒 プレースホルダ表示。4 ロケール対応。
- **ランタイム JSON Schema 検証** — `validateGameState()`（外部ライブラリ不要）。違反を GM Bridge 出力に記録、セッション初回のみ警告。処理は継続（graceful degradation）。
- **GitHub Actions CI** — `.github/workflows/ci.yml`（push/PR → `npm ci` / compile / test、Node 20）。
- **Antigravity 連携ガイド** — `ANTIGRAVITY_GUIDE.md`（clipboard / command 両モード）。`GM_BRIDGE_PRESETS.md`・`README.md` に参照追加。

### Changed
- `game_state_schema.json` / `GameState.ts` に `hiddenDice`・`diceRequest`・`imageBlocked` を追加。
- `locales/*.json` — 94 キー（ダイス・画像ブロック関連キー追加）。

## [0.2.1] - 2026-06-24

### Added
- **多言語 (i18n)** — `textAdventure.locale`（`ja` / `en` / `zh-CN` / `zh-TW`）。`locales/*.json` で Webview・拡張メッセージ・GM プロンプトを切り替え。
- **Webview 言語プルダウン** — チャットヘッダーの 🌐 から実行中に切り替え（設定 `textAdventure.locale` と同期）。
- **`src/i18n.ts`** — `t()` ヘルパー、Webview 向けバンドル配信。

### Changed
- Ollama / KoboldCPP ブリッジが `--locale` / `TA_LOCALE` で GM システムプロンプトの言語に対応。
- Grok プロンプトも `gm.prompt.*` ロケールキー経由で言語指定。

## [0.2.0] - 2026-06-24

### Added
- **Ollama GM ブリッジ** — `textAdventure.gmBridge.provider=ollama`。`TextAdventureGMSkill/scripts/ollama_gm.py` が Ollama API を呼び、`game_state.json` を自動更新。
- **KoboldCPP GM ブリッジ** — `provider=koboldcpp`。`koboldcpp_gm.py` が `/api/v1/generate` に接続。
- **共有ブリッジロジック** — `gm_bridge_common.py`（`{{DICE:1d20}}` マーカー → `dice.py` 実行、JSON 抽出、ターン ID 採番）。
- **GM ブリッジ設定** — `gmBridge.python` / `gmBridge.scriptPath` / `gmBridge.ollama.*` / `gmBridge.koboldcpp.url`。
- **プリセットドキュメント** — `GM_BRIDGE_PRESETS.md`（settings.json コピペ例・比較表）。

### Changed
- 出力チャンネル名を「Text Adventure: GM Bridge」に統一（Grok 専用名から汎用化）。

### Note（ローカル LLM の制限）
- Ollama / KoboldCPP は **ナラティブ + game_state.json 更新**まで自動。ComfyUI 画像生成は Grok 等のツール実行が必要。
- JSON 出力品質はモデル依存。instruct 系・十分なコンテキスト長を推奨。

## [0.1.9] - 2026-06-24

### Added (Grok コードレビュー対応)
- **汎用 GM ブリッジ** — `textAdventure.gmBridge.provider`（`grok` / `clipboard` / `command`）。カスタム CLI は `gmBridge.command` + `gmBridge.commandArgs`（`{action}`, `{cwd}` プレースホルダ）。
- **マルチルート WS 対応** — `textAdventure.workspaceFolder` で `game_state.json` の対象フォルダを指定可能。
- **ダイス結果の GM 送信** — Webview に「📤 GMに送る」ボタン。`freeInput` と同経路で GM ブリッジへ渡す。
- **軽量バリデーション** — `npm test`（`scripts/validate.js`）で schema / バージョンを確認。

### Changed
- **画像パスポリシー** — `safeImageUri` がワークスペースまたは GM スキル配下のファイルのみ許可。外部パスはコンソール警告のうえスキップ。
- **GM ローディングイベント** — `gmStart` / `gmEnd` に統一（`grokStart` / `grokEnd` は Webview で後方互換）。
- **ステータス後方互換** — 旧形式の文字列 `status.condition` を配列として表示。
- `extension.ts` が `types/GameState.ts` の `GameEntry` を import。

### Changed (ドキュメント整理)
- AI作業用ルール `AI_COLLABORATION.md` と `AI_SHARED_LOG.md` の追加、及び読み順の更新
- **GameState スキーマと CRPG キャラクターシートUIの追加**:
  - `src/types/GameState.ts` および `game_state_schema.json` を作成し、型安全な通信とAI出力の安定化を図った。
  - Webviewステータスパネルを拡張し、HP/MPのプログレスバー、コンディション、インベントリ、スキルのタグリスト表示を実装。
  - `SKILL.md` の出力例を新しい構造に更新。
  - `README.md` に Saga & Seeker 等にインスパイアされた「Hacker Edition」思想やCRPG要素のアピールを追記。
  - `AI_SHARED_LOG.md` を追加。全AIが共通で読む/追記する最新作業ログとして運用。
  - `AI_HANDOVER.md` の読み込み順に両ファイルを追加。
- **レビュー文書の整合**
  - `GROK_CODE_REVIEW.md` に残っていた古い「未対応」記述を v0.1.8 の実装状況に合わせて更新。
  - `AI_HANDOVER.md` に「実装の正本は CHANGELOG とソースコード」という注意書き、v0.1.8 時点の主な残件を追加。
- **README の公開向け更新**
  - v0.1.8 の機能（Grok Bridge、BGM/SE、シナリオパック、履歴永続化）を Features に反映。
  - 存在しない placeholder 画像リンクを削除し、スクリーンショット/GIF差し替え前提の記述に変更。

## [0.1.8] - 2026-06-24

### Added (Claude Sonnet 4.6 — 履歴永続化 & GM ローディング UI)

#### game_history.json ディスク永続化 (Grok #5 完全対応)
- **問題:** 全履歴が Webview の `vscode.setState()` とメモリのみに依存しており、VSCode 再起動で冒険ログが消えていた。
- **修正:** `extension.ts` に `getHistoryPath()` / `loadHistoryFromDisk()` / `saveHistoryToDisk()` を追加。
  - 起動時（`startWatchingGameState`）に `game_history.json` から既存履歴を復元し `gameEntryHistory[]` に読み込む。
  - 新エントリを検知するたびに自動保存（`sendCurrentState` 内で `historyUpdated` フラグで管理）。
  - パス: `<workspace>/game_history.json`（`game_state.json` と同じ場所）。

#### Grok ターン待ちローディング UI (CLAUDE_REVIEW A2)
- **extension.ts:** `invokeGrokBridge()` でプロセス開始時に `{ type: 'grokStart' }` を postMessage、終了時（成功・失敗・エラー全て）に `{ type: 'grokEnd', success }` を postMessage。
- **script.js:** `showGrokLoading()` — チャットに「⏳ GM がターンを処理中...」を表示し、自由入力・送信ボタン・選択肢ボタンを `disabled` にして二重送信を防止。`hideGrokLoading(success)` — ローディングを除去して入力を再有効化。失敗時はエラーメッセージを表示。

## [0.1.7] - 2026-06-24

### Added (Claude Sonnet 4.6 — 効果音(SE) & シナリオパック)

#### 効果音(SE)システム
- **ライセンスフリーSEを同梱** — `scripts/generate_sfx.py` がPython標準ライブラリのみで8種のSE（click/dice/success/fail/coin/hit/levelup/magic）を合成生成。サードパーティ素材を一切使わないため再配布・改変が自由。`TextAdventureGMSkill/sfx/` に生成済み、`sfx.json` も同梱で**箱から出してすぐ鳴る**。
- **GM によるSE発火** — `game_state.json` の `"sfx": "hit"` または `"sfx": ["hit","coin"]` でBGMに重ねてワンショット再生。
- **Webview SEプレイヤー** — 毎回新規 `Audio` で重ね再生（BGMを止めない）。曲ごと音量・全体音量・ミュートに対応。ダイスローラーUIも `dice` SEを再生。
- **同梱フォールバック** — workspace に `sfx.json` が無くても、スキル同梱の `sfx.json` を自動使用（`localResourceRoots` にスキルフォルダを追加）。
- 設定 `textAdventure.sfx.*`（enabled / manifestPath / volume）、UIにSE音量・ミュート行を追加。

#### シナリオパック
- **シナリオパック形式 `text-adventure-scenario/1.0` を定義**（`SCENARIO_PACK.md`）。`scenario.json`（meta + setup + opening）を中心に、任意で cover/bgm/sfx/追加ルールを同梱できる自己完結フォルダ。「本体無料＋シナリオ課金」モデルの配布単位。
- **読み込みコマンド「Text Adventure: Load Scenario Pack」**（`extension.ts`）— フォルダを選ぶと、開始シーンから `game_state.json` を生成・テーマ適用・パック専用BGM/SEの設定切り替え・`scenario.json` をworkspaceにコピーしてGMが参照可能に。
- **GM側の対応**（`SKILL.md`）— workspace に `scenario.json` があれば開始質問をスキップし、`setup` に従って進行。
- **動作するサンプルパック同梱** — `scenarios/lost-catacombs/`（忘れられた地下聖堂）。そのまま読み込んで遊べる。

## [0.1.6] - 2026-06-24

### Added (Claude Sonnet 4.6 — BGM自動制御)

Saga & Seeker の差別化要素だった「シーンに合わせた音楽」を、**ユーザー持ち込みの音源 + GM 自動選曲**という形で実装。

- **BGM マニフェスト `bgm.json`**
  - ユーザーが音源ファイル・ムード・説明文を登録するJSON。`TextAdventureGMSkill/bgm.sample.json` をテンプレートとして同梱（10シチュエーション: title/town/field/dungeon/tension/battle/boss/victory/sad/emotional）。
  - 音源は workspace 直下または `bgm/` サブフォルダに配置（.mp3/.ogg/.wav/.m4a）。
- **GM による自動選曲（2方式）**
  - `game_state.json` の `"bgm": "<id>"`（トラックID直接指定）または `"mood": "<mood>"`（ムード一致で自動選曲）。
  - AI に description を読ませて場面に合う曲を判断させることも可能。
  - `SKILL.md` に選曲ルール（場面転換時のみ切り替え等）を記載。
- **Webview BGM プレイヤー**（`webview/`）
  - 2つの `Audio` 要素によるクロスフェード（1.2秒）でシームレスに曲を切り替え。
  - 再生/一時停止・音量スライダー・ミュート・トラック手動選択のUIを追加（Glassmorphism 紫アクセント）。
  - ブラウザの自動再生ポリシーに対応（初回ユーザー操作までは曲名表示のみ、クリックで再生開始）。
  - 曲ごとの個別音量（`volume`）とループ設定（`loop`）に対応。
- **extension.ts**
  - `bgm.json` を読み込み、音源パスを検証して WebviewURI に変換し送信（`sendBgmManifest()`）。
  - `bgm.json` を FileSystemWatcher で監視し、変更時に自動リロード。dispose/deactivate でクリーンアップ。
  - 設定 `textAdventure.bgm.*`（enabled / manifestPath / volume）を追加。
- **CSP 更新** — `index.html` の Content-Security-Policy に `media-src` を追加（音声再生のため）。

## [0.1.5] - 2026-06-24

### Added (Claude Sonnet 4.6 — 画像生成バックエンドの設定化)

これまで ComfyUI の URL とモデル（チェックポイント）が完全ハードコードだった問題を解消。ComfyUI / Stability Matrix / 任意の ComfyUI 互換サーバーを設定で切り替え可能にした。

- **画像生成バックエンド設定 `textAdventure.imageGen.*` を追加**（`package.json`）
  - `backend` — `comfyui` / `stabilitymatrix` / `custom`（ラベル）
  - `comfyuiUrl` — サーバー URL（既定 `http://127.0.0.1:8188`。ポート変更に対応）
  - `checkpoint` — 使用するチェックポイント .safetensors のファイル名（空ならワークフロー既定）
  - `workflowPath` — カスタムワークフロー JSON のパス
  - `steps` / `cfg` / `width` / `height` — 生成パラメータ上書き（0 = ワークフロー既定）
- **`comfyui_generate.py` の環境変数対応**
  - `COMFYUI_URL` / `TA_CHECKPOINT` / `TA_WORKFLOW` / `TA_STEPS` / `TA_CFG` / `TA_WIDTH` / `TA_HEIGHT` を読み取り、ワークフローへ反映。
  - CFG は小数（例 5.5）にも対応。
  - 接続失敗時に「ComfyUI/StabilityMatrix が起動しているか / ポート設定」を案内する分かりやすいエラーメッセージを追加。
- **モデル一覧取得機能**
  - `python comfyui_generate.py --list-models` で、サーバーが受け付けるチェックポイント名を一覧表示。
  - VSCode コマンド **「Text Adventure: List Image Models」** を追加（`extension.ts`）。設定したモデル名が正しいか確認できる。
- **`extension.ts` のリファクタ**
  - スクリプトパス解決を `resolveComfyScript()` に、設定→環境変数の変換を `buildImageGenEnv()` に抽出。画像生成時に `Backend` / `Checkpoint` を Output に表示。
- **ドキュメント更新**
  - `TextAdventureGMSkill/README.md` に「Image Backend Configuration」節（環境変数表・モデルの場所・`--list-models`）を追加。
  - `SKILL.md` の画像生成連携に環境変数による接続先・モデル切り替えの説明を追加。

## [0.1.4] - 2026-06-24

### Fixed (Claude Sonnet 4.6 コードレビュー対応)

- **電卓の `Function()` 廃止 (Security)**
  - 問題: `new Function()` による動的コード評価を使用していた。CSP 強化時に機能停止するリスクがあった。
  - 修正: eval/Function を一切使わない再帰下降パーサー（`evaluateMath`）を `webview/script.js` に実装。加減乗除・べき乗・モジュロ・括弧・単項演算子に対応。
- **calcHistory の XSS 修正 (Security)**
  - 問題: 計算履歴を `innerHTML` に直接挿入していた。
  - 修正: `escapeHtml()` を経由するように変更。
- **ゲーム履歴のセッション内永続化 (Medium)**
  - 問題: 全履歴が Webview の `vscode.setState()` のみに依存しており、パネル再作成時に WebviewURI が陳腐化して画像が壊れる問題があった。
  - 修正: `extension.ts` が `gameEntryHistory[]` に全エントリを累積保持。パネル再表示（`requestState`）時は `fullHistory: true` フラグで全履歴を新しい WebviewURI に変換して再送信。Webview 側は `fullHistory` 受信時に chatLog をクリアして再描画。
- **画像パス検証の追加 (Medium)**
  - 問題: `asWebviewUri()` を存在しないパスに適用してもエラーにならず、画像が壊れた状態になっていた。
  - 修正: `safeImageUri()` ヘルパーを追加し、`fs.existsSync()` チェック後のみ URI 変換。存在しないパスは `delete entry.image` でスキップ。
- **ComfyUI 出力先バリデーション (Medium)**
  - 問題: `comfyui_generate.py` の `output_dir` 引数に任意パスを指定可能だった。
  - 修正: `os.path.abspath()` で正規化後、Windows/Linux 共通のシステムディレクトリへの書き込みをブロック。

### Added

- **画像生成ローディング表示 (UX)**
  - `extension.ts` から ComfyUI プロセス開始時に `imageGenStart`、終了時に `imageGenEnd` を postMessage。
  - `script.js` でチャットログ内に「🎨 AI がシーンを描画中...」を表示し、完了または失敗時に置き換え。
- **SKILL.md: 画像生成タイミングの設定追加**
  - 「毎ターン / 場面転換時のみ / 手動のみ」をゲーム開始時に選択可能に変更。毎ターン強制生成による遅延を回避できる。
- **Claude Sonnet 4.6 レビューの追加**
  - `C:\AI\CLAUDE_REVIEW.md` を新規作成。実装改善内容・Saga & Seeker との競合分析・ポジショニング提案を記録。
  - `AI_HANDOVER.md` に `CLAUDE_REVIEW.md` への参照と「Hacker Edition」ポジショニングセクションを追記。

### Changed (ドキュメント)
- **`CLAUDE_REVIEW.md` の拡充** — 他 AI 向け形式に整理（実装サマリー表・シーケンス図・ロードマップ優先順位・Steam 競合情報更新）。`GROK_CODE_REVIEW.md` の読み込み順に追記。
- **`package.json` バージョン** — `0.1.4` に同期。

## [0.1.3] - 2026-06-24

### Added
- **Grok Build ブリッジ**
  - Webview の選択肢・自由入力を `grok -p`（headless）に自動送信。Grok が `game_state.json` を更新すると Webview が自動反映される。
  - 設定項目 `textAdventure.grokBridge.*` を追加（enabled / command / autoApprove / fallbackToClipboard）。
  - 出力チャンネル「Text Adventure: Grok Bridge」で処理ログを表示。
  - Grok 失敗時は従来どおりクリップボードにフォールバック。
- **Gemini 3.5 Flash レビューの追加**
  - `C:\AI\GEMINI_REVIEW.md` を新規作成。開発プロセスの評価、アーキテクチャ分析、および「本体無料＋シナリオ等アセット課金」ビジネスモデル案を記録。
  - `AI_HANDOVER.md` に `GEMINI_REVIEW.md` への参照を追記。
  - Illustrious系モデル（`prefectIllustriousXL_v8.safetensors`）を使用したComfyUI画像生成テストの正常稼働（出力パス連携・Webview表示）を確認。

### Changed (ドキュメント)
- **CHANGELOG の整理**
  - `[0.1.2]` の重複見出しを解消し、v0.1.1（ChatGPT対応）を独立セクションに分離。
- **`GROK_CODE_REVIEW.md` のステータス更新**
  - 各指摘に対応状況（対応済み / 一部対応 / 未対応）と対応バージョンを追記。

## [0.1.2] - 2026-06-24

### Added (ドキュメント)
- **Grok コードレビュー記録の追加**
  - `C:\AI\GROK_CODE_REVIEW.md` を新規作成。VSCE拡張・GMスキル・Pythonスクリプトの全体レビュー結果を記録。
  - `AI_HANDOVER.md` に読み込み順を追記。

### Changed (Grok コードレビュー指摘への対応 Phase 1 & 2)
Grok による全体的なコードレビューを受け、Windows 特有の課題や UX 向上を実施。

- **画像生成のシェル非経由実行 (High)**
  - 問題: `terminal.sendText` によるコマンド構築では PowerShell 等でのシェルインジェクションリスクが完全には防げなかった。
  - 修正: `child_process.spawn` に変更し引数を安全に渡すように修正。実行状況は VSCode の Output パネルに表示。
- **ファイル監視の信頼性向上 (Medium)**
  - 問題: Node のネイティブ `fs.watch` では変更検知の安定性に欠ける場合があった。
  - 修正: VSCode API の `workspace.createFileSystemWatcher` に移行し、JSON パース失敗時のリトライロジック（最大3回）を追加。
- **メッセージ入力の検証 (Medium)**
  - 問題: Webview から送られる文字列に検証がなかった。
  - 修正: プロンプト・プレイヤー入力の文字数制限、画像生成モードの許可リスト検証を追加。
- **設定（Configuration）の導入 (Medium)**
  - 問題: ComfyUI 生成スクリプトのパスがソースコードにハードコードされていた。
  - 修正: `package.json` に設定項目 `textAdventure.skillPath` を追加。
- **UX の改善 (Medium)**
  - 修正: 選択肢クリック時に番号だけでなくテキスト全体を送信するように変更。
  - 修正: パネル再表示時のウェルカムメッセージ重複を解消（初回のみ表示）。
- **CSP とフォントの修正 (High)**
  - 問題: Google Fonts がブロックされていた。
  - 修正: `index.html` の CSP に `fonts.googleapis.com`（style-src）と `fonts.gstatic.com`（font-src）を追加。
- **activationEvents の最適化 (Low)**
  - 修正: `onCommand:textadventure.openGame` に変更し、コマンド実行時のみ拡張をアクティブ化。
- **debounceTimer のクリーンアップ (Low)**
  - 修正: パネル dispose 時および `deactivate` 時にタイマーをクリア。

## [0.1.1] - 2026-06-24

### Changed (ChatGPT コードレビュー指摘への対応)
他 AI（ChatGPT）によるコードレビューを受け、以下のセキュリティおよび安定性向上を実施。

- **Webview 画像表示の修正 (High)**
  - 問題: 絶対パスの画像が VSCode Webview でセキュリティ制限によりレンダリングされなかった。
  - 修正: `extension.ts` にて、JSON を Webview に送る前に `panel.webview.asWebviewUri()` を使用して URI を変換。
- **XSS 対策と CSP 導入 (High)**
  - 問題: `script.js` で `innerHTML` に直接画像タグを文字列として埋め込んでおり、スクリプトインジェクションのリスクがあった。
  - 修正: `index.html` に Content-Security-Policy (CSP) を追加。`script.js` では `document.createElement('img')` を使用。
- **ファイル監視のデバウンス処理 (Medium)**
  - 問題: AI が `game_state.json` を書き込んでいる途中で `fs.watch` が発火し、不完全な JSON をパースしてエラーになる可能性があった。
  - 修正: ファイル監視コールバックに 100ms のデバウンス処理を追加（v0.1.2 で FileSystemWatcher + 300ms に発展）。
- **ターミナルインジェクション対策 (Medium)**
  - 問題: ComfyUI を呼び出す引数がエスケープされておらず、シェルインジェクションの危険があった。
  - 修正: ダブルクォーテーションや `$` のサニタイズを追加（v0.1.2 で spawn 化により根本対応）。
- **ログ重複の解消 (Low)**
  - 問題: UI のプレイヤー発言自動追加と `SKILL.md` の記録指示が競合し、ログが重複していた。
  - 修正: `SKILL.md` からユーザー発言を記録する指示を削除。
- **ドキュメントの表現修正 (High)**
  - 問題: ブラウザ版 AI でも全自動で動くような誤解を招く記載だった。
  - 修正: `AI_HANDOVER.md` にブラウザ版 AI の手動コピペ要件を明記。

## [0.1.0] - 2026-06-24

### Added
- プロジェクトの初期構築完了。
- `extension.ts`: Webview の起動と `game_state.json` の監視ブリッジ機能を実装。
- Webview UI: Glassmorphism デザインのチャット、ステータス表示、画像ギャラリー、世界観テーマ切り替え（Fantasy/Cyberpunk 等）を実装。
- ダイス機能と計算機: `script.js` および `dice.py` を追加。
- ドキュメント: 他 AI への引き継ぎ用ドキュメント `AI_HANDOVER.md` を作成。
