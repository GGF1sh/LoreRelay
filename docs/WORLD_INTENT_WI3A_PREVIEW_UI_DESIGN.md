# World Intent WI3a: Vehicles Tab Preview UI Design

> Author: Claude (Sonnet 5), per `docs/WORLD_INTENT_WI3A_CLAUDE_PROMPT.md`.
> Status: **design only** — no implementation authority granted here.
> Scope: Webview UI/UX design + implementation plan for a read-only World Intent preview inside the existing Vehicles tab.
> Baseline reviewed: `AI_SHARED_LOG.md` Current Snapshot (v1.76.0), `CHANGELOG.md` [Unreleased], `WORLD_INTENT_CORE_DESIGN.md`, `WORLD_INTENT_WI2_CHATGPT_GATE.md`, `WORLD_INTENT_WI3B_CHATGPT_GATE.md`, `src/worldIntentCore.ts`, `src/worldIntentVehicleParityCore.ts`, `webview/modules/89-vehicles.js`, `webview/modules/89a-vehicle-labels.js`, `webview/style.css`.

## 0. Restated Constraints (from the WI3a prompt)

- No Webview execution of `executeWorldIntent()`. No `queryWorldIntent()` call site inside the Webview bundle either, unless a host round-trip is used (see §5).
- No writes to `vehicle_state.json` / `game_state.json` / `turn_result.json`.
- No execute/apply button, no auto-repair/refuel, no state mutation, no Remote Play write.
- Any host read-only query endpoint is a **separate gate**, not approved by this document.
- This is UI/UX + implementation planning only.

## 1. What Data Already Exists vs. What a Real Preview Needs

This is the single most important framing decision, so it drives everything below.

`msg.vehicleGarage` (built host-side, already sent to the Webview on every `worldView` message) already carries, per vehicle: `isActive`, `status`, `hp`/`maxHp`, `fuelCurrent`/`fuelMax`, `powerType`, `accessReasonCode`, `accessRestrictions`, `parkingFallbackId`, `atCurrentLocation`. That is exactly the state `queryVehicleGameAction()` in `worldIntentCore.ts` inspects for the **no-payload** parts of its taxonomy (already active / hp already max / fuel already max / lost / system disabled / no tank / fuel type mismatch).

What the existing snapshot does **not** carry is a candidate *payload* — a destination for `move_vehicle`, or an amount for `damage_vehicle` / `repair_vehicle` / `refuel_vehicle`. `queryWorldIntent()`'s `allowed` vs `valid_noop` distinction for those three actions is payload-dependent (an `applyVehicleOps()` dry run), and WI3a must not introduce a payload-carrying host round-trip without a new gate.

Conclusion: **WI3a should ship two tiers**, not one:

- **Tier 1 (payload-free "would this even be worth asking?" preview)** — fully computable from data already in `vehicleGarage`, zero new host surface, ships now.
- **Tier 2 (payload-aware "what would actually happen?" preview)** — requires a new read-only Webview→host query message carrying a candidate `WorldIntent`-shaped payload and a `queryWorldIntent()` response. This is explicitly **out of WI3a's approved scope** and is flagged back to the gate in §7.

Conflating these two tiers was the main UX risk found during this design pass (see §2, F1).

## 2. Findings / UX Risks

| ID | Severity | Finding | Recommendation |
|----|----------|---------|-----------------|
| F1 | P0 | The prompt asks for "valid_noop / blocked / invalid" display for move/damage/refuel, but the Webview has no candidate destination or amount to query against — showing a confident status for those would be misleading (e.g. labeling "Move" as `allowed` with no destination chosen is meaningless). | Split into Tier 1 (state-only, no payload) and Tier 2 (payload-aware, needs a new gated endpoint). Tier 1 statuses for payload-bearing actions must read as an availability precheck ("would need a destination"), not a real `allowed`/`valid_noop` verdict. |
| F2 | P1 | `queryWorldIntent()`'s taxonomy (`allowed/valid_noop/blocked/invalid/unsupported`) is a developer-facing contract, not written for players. Rendering raw status words in a player-facing tab would read as debug leakage. | Map every status to a player-facing phrase + icon (see §4 i18n keys), never render the raw status enum string in the UI. |
| F3 | P1 | `accessReasonCode` (already shown today as "access warning") and the *new* preview blocked-reason codes (`vehicle_system_disabled`, `vehicle_not_found`, `vehicle_lost`, `no_fuel_tank`, `fuel_type_mismatch`) are different vocabularies that describe overlapping situations (e.g. both can explain "why can't I use this vehicle"). Showing both independently risks duplicate/contradictory messages. | Tier 1 preview should reuse `item.accessReasonCode` where it already covers a blocked cause (lost, system disabled) instead of re-deriving a second reason code client-side. Only compute the vehicle-op-specific reasons (`already_active`, `hp_already_max`, `fuel_already_max`, `no_fuel_tank`, `fuel_type_mismatch`) locally, since those have no existing UI representation. |
| F4 | P1 | `move_vehicle`'s real taxonomy depends on parking-metadata/status-transition subtleties (WI2 gate §7.4) that are not visible in `vehicleGarage` at all (no "parked" vs "available" distinction beyond `status`, no parking correction state). A client-side approximation would drift from the real oracle and could be wrong in exactly the confusing way WI2 warned about (§7.4 of the WI2 gate). | Do not attempt a client-side `move_vehicle` noop guess. Render Move as a Tier-2-only action: "Availability: OK / Blocked — pick a destination to see if it would change anything" with no noop/allowed claim in Tier 1. |
| F5 | P2 | The five registry actions map awkwardly onto UI affordances players already have: `set_active_vehicle` happens by clicking a roster item (not a button), while `damage_vehicle` is GM/simulation-originated and never player-initiated at all. Presenting `damage_vehicle` as a "candidate action" in a player tab is confusing — players don't damage their own vehicle on purpose. | Only surface `set_active_vehicle`, `move_vehicle`, `repair_vehicle`, `refuel_vehicle` as visible preview rows. `damage_vehicle` has no player-facing affordance and should be omitted from the Vehicles tab preview entirely (it can still exist in a future Inspector/debug view). |
| F6 | P2 | The WI3b bridge-mode contract (`off`/`shadow`/`compare_only`) is a *developer diagnostic* for legacy-vs-WorldIntent parity on GM-issued `turn_result.vehicleOps`, unrelated to a *player-facing* "would this work" preview. The WI3a prompt lists bridge-mode UI states alongside preview states, which invites conflating the two features. | Do not show WI3b bridge mode in the Vehicles tab. If a bridge-mode indicator is wanted at all, it belongs in the existing debug/Inspector surface (`src/debugScenarioCore.ts` / Inspector console), gated separately, and is out of scope for this player-facing design. |
| F7 | P2 | `renderGarage()` re-renders the whole detail card on every `worldView` message; adding a preview block naively could cause flicker or lose transient focus during rapid GM turns. | Preview block should be a pure function of `item` fields already diffed by the existing render cycle — no new timers/animation, same re-render cadence as the rest of the card (consistent with the "no `@keyframes`" convention in Track 3). |

## 3. Recommended UI Layout

Extend `vehicle-detail-card` (rendered by `renderDetail()` in `89-vehicles.js`) with one new block, placed **after** the existing warnings and **before** the modules section, so it sits next to the stats it explains:

```
┌ vehicle-detail-card ──────────────────────────────┐
│ [Name]                          [Active] [MobileBase] │
│ kind · size · status · location                    │
│ (existing warnings: access / parking fallback / limits) │
│ Condition: ...                                      │
│ Fuel: ...                                           │
│ Parking / Carrier rows                              │
│ Cargo / Crew bars                                   │
│ Passengers row                                      │
│ ┌ vehicle-intent-preview ─────────────────────────┐ │  <- NEW
│ │ Would this work? (preview, not applied)          │ │
│ │  ● Set active   — Already active                 │ │
│ │  ● Move          — Pick a destination to preview │ │
│ │  ● Repair        — Blocked: vehicle system off   │ │
│ │  ● Refuel        — Already full                  │ │
│ └───────────────────────────────────────────────────┘ │
│ Modules: ...                                        │
│ [Show on map]                                       │
└──────────────────────────────────────────────────────┘
```

Structure:

- Section heading `vehicle-intent-preview-title`, small caps, same treatment as `vehicle-bar-label`.
- One row per surfaced action (`set_active_vehicle`, `move_vehicle`, `repair_vehicle`, `refuel_vehicle` — see F5), each a `<div class="vehicle-intent-row" data-intent-status="...">` with:
  - an icon/dot (`vehicle-intent-dot`) colored by status class, not color alone (see Accessibility §5),
  - the action label,
  - the status phrase (mapped, not raw enum — see F2).
- No buttons, no `<input>`, no clickable affordance anywhere in this block. Confirm at implementation time that no `addEventListener` is attached inside this block (mirrors the existing read-only contract of `renderDetail()`).
- If `enableVehicleSystem` bridge/preview data is entirely unavailable (Tier 1 helper not loaded, or `LR_vehicleIntentPreview` missing), render nothing (fail closed, not an error state) — consistent with the existing `L()` fallback pattern in `89-vehicles.js`.

### Placement rationale

Putting it inside the same card (not a separate pane) keeps it next to the exact fields (`hp`/`maxHp`, `fuelCurrent`/`fuelMax`, `status`) that explain *why* a row shows what it shows, which doubles as free documentation for the player.

## 4. UI State Matrix

| Action (registry key) | Player-visible row? | Tier 1 (state-only) statuses shown | Tier 2 (payload-aware, future) additions |
|---|---|---|---|
| `vehicle:set_active_vehicle` | Yes | Already active (`valid_noop`) · Available to activate (`allowed`, generic — no real query needed since payload is just "this vehicle") · Blocked: lost / system off (`blocked`) | none needed — this action has no meaningful payload beyond the vehicle itself, so Tier 1 is already accurate |
| `vehicle:move_vehicle` | Yes | Blocked: lost / system off (`blocked`) · otherwise "Pick a destination to preview" (UI-only pseudo-state, not a taxonomy value) | Real `allowed` / `valid_noop` once a destination is chosen (requires Tier 2 endpoint) |
| `vehicle:damage_vehicle` | No (F5) | — | — (no player affordance; future Inspector-only) |
| `vehicle:repair_vehicle` | Yes | Already at max HP (`valid_noop`) · Repairable (`allowed`, generic) · Blocked: lost / system off (`blocked`) | Exact-amount preview once an amount is chosen |
| `vehicle:refuel_vehicle` | Yes | Already full (`valid_noop`) · No fuel tank / type mismatch (`blocked`, reusing existing reason codes) · Refuelable (`allowed`, generic) · Blocked: lost / system off (`blocked`) | Exact-amount preview once an amount is chosen |

Additional cross-cutting states:

| State | Meaning | Rendering |
|---|---|---|
| `preview unavailable` | Tier 1 helper script not loaded, or `vehicleGarage` item missing required fields | Preview block omitted entirely (no placeholder text, no error banner) |
| `bridge mode off / shadow / compare_only` | WI3b diagnostic bridge mode | **Not rendered in this tab at all** — see F6. Explicitly a non-goal for the Vehicles tab. |

Status → visual language (also satisfies §5 accessibility, not color-only):

| Status class | Icon/dot glyph | Text pattern |
|---|---|---|
| `valid_noop` | `●` neutral gray + "already …" | "Already active", "Already full", "Already at max HP" |
| `allowed` (generic, Tier 1) | `●` blue/green (reuses `--vscode-charts-green`) | "Available to activate", "Repairable", "Refuelable" |
| `blocked` | `●` amber/red (reuses existing `vehicle-warning` amber) | "Blocked: <reused accessReasonCode label>" or "Blocked: no fuel tank" |
| `needs_input` (UI-only, Move only) | `●` outline/dashed | "Pick a destination to preview" |

## 5. Accessibility

- Each `vehicle-intent-row` carries `role="status"` is **not** appropriate (it's not a live update); instead use a plain `<div>` with visually-hidden text duplicating the status word for screen readers, e.g. `<span class="visually-hidden">Status: blocked.</span>` before the human phrase, so the dot's meaning isn't color-only.
- `aria-label` on the whole preview block: `aria-label="World Intent preview, read-only"` (i18n'd) so assistive tech announces this is informational, not actionable — important since it visually resembles a controls list.
- No `aria-live` region: the block re-renders synchronously with the rest of the card on `worldView` messages (same cadence as everything else in `renderDetail()`); marking it live would cause redundant announcements identical to existing behavior for the rest of the card, which does not use `aria-live` either.
- No focusable elements inside the block (no buttons/links) — screen reader and keyboard users tab past it exactly like the existing stat rows, consistent with F5/read-only intent.
- Status dots use both shape/icon and color (see table in §4) so color-blind users aren't relying on hue alone; reuse existing amber/green tokens already defined in `style.css` (`--vscode-editorWarning-foreground`, `--vscode-charts-green`) rather than introducing new hues.
- Text contrast: reuse existing `.vehicle-warning` / `.vehicle-muted` classes rather than inventing new color values, to stay within the theme's already-audited contrast (Track 3 genre chrome does not touch this card's text colors).

## 6. Required i18n Keys

All under `webview.vehicles.intentPreview.*`, added to the existing 4-locale set (`ja`/`en`/`zh-CN`/`zh-TW`) alongside the current `webview.vehicles.*` keys, and covered by `check_i18n_keys.js` like every other key in this file.

```text
webview.vehicles.intentPreview.title              "Would this work? (preview)"
webview.vehicles.intentPreview.ariaLabel           "World Intent preview, read-only"
webview.vehicles.intentPreview.action.setActive    "Set active"
webview.vehicles.intentPreview.action.move         "Move"
webview.vehicles.intentPreview.action.repair       "Repair"
webview.vehicles.intentPreview.action.refuel       "Refuel"
webview.vehicles.intentPreview.status.alreadyActive     "Already active"
webview.vehicles.intentPreview.status.availableActivate "Available to activate"
webview.vehicles.intentPreview.status.alreadyMaxHp      "Already at max HP"
webview.vehicles.intentPreview.status.repairable        "Repairable"
webview.vehicles.intentPreview.status.alreadyFull       "Already full"
webview.vehicles.intentPreview.status.refuelable        "Refuelable"
webview.vehicles.intentPreview.status.needsDestination  "Pick a destination to preview"
webview.vehicles.intentPreview.status.blockedPrefix     "Blocked: {reason}"
webview.vehicles.intentPreview.reason.noFuelTank        "no fuel tank"
webview.vehicles.intentPreview.reason.fuelTypeMismatch  "fuel type mismatch"
webview.vehicles.intentPreview.srStatusPrefix           "Status: {status}."
```

Notes:

- `status.blockedPrefix` reuses `{reason}` interpolation the same way `webview.vehicles.fleetMeta` already interpolates `{count}`/`{location}` in `89-vehicles.js`, so no new i18n plumbing is required.
- For lost/system-disabled blocked reasons, reuse the existing `L().accessReasonLabel(item.accessReasonCode)` string (already localized) instead of adding new reason keys for those two cases (per F3).

## 7. Implementation Plan

### Phase WI3a-1 — Webview-only static preview (in scope, no new gate needed)

- New pure module `webview/modules/89b-vehicle-intent-preview.js`, same IIFE/no-write pattern as `89a-vehicle-labels.js`. Exposes `window.LR_vehicleIntentPreview.computeRows(item, enableVehicleSystem)` returning an array of `{ action, statusClass, textKey, reasonText? }`.
- This module must **not** import or bundle any code from `src/worldIntentCore.ts`. It re-derives only the Tier 1, state-only subset of the taxonomy (already-active / already-max-hp / already-full / no-tank / type-mismatch / lost / system-off) directly from fields `vehicleGarage` already sends. This keeps the Webview trust boundary exactly where it is today: informational logic derived from data already pushed to the client, no new inbound query.
- `89-vehicles.js`'s `renderDetail()` calls `LR_vehicleIntentPreview.computeRows(...)` and renders the block from §3; falls back to rendering nothing if the helper is absent (same defensive pattern as the existing `L()` fallback).
- New CSS in `webview/style.css` near the existing `.vehicle-*` rules (§ around line 4650): `.vehicle-intent-preview`, `.vehicle-intent-row`, `.vehicle-intent-dot` (+ status modifier classes), reusing existing color tokens per §5.
- New test `scripts/test_webview_vehicle_intent_preview.js` (static/manifest-style, following the pattern of `test_webview_genre_chrome.js`): asserts module load order, i18n key presence via `check_i18n_keys.js`, and that the block emits no `<button>`/`<input>`/`addEventListener` (grep-based, mirroring how other Webview-only tests assert read-only contracts).
- No `src/*.ts` changes, no host message changes, no `worldIntentCore.ts` import from the Webview bundle.

### Phase WI3a-2 — Move preview refinement (still in scope)

- Once Phase 1 ships, revisit whether `move_vehicle`'s "pick a destination" state can be improved using data the map/cartography modules already have client-side (e.g., currently-selected map pin from `86-tile-overmap.js`), *without* querying the host. This is a UX nice-to-have, not a taxonomy correctness fix, and remains Webview-only.

### Phase WI3b-adjacent — Payload-aware Tier 2 preview (out of WI3a scope, needs new gate)

- Would require a new read-only Webview→host message, e.g. `queryVehicleIntentPreview` carrying `{ vehicleId, action, payload }`, host-side calling `queryWorldIntent()` (already pure, already exists) and returning `IntentQueryResult` verbatim (mapped through the same i18n layer as Tier 1).
- This crosses the Webview trust boundary (new inbound message type) even though it is read-only, so per the WI3a prompt's own instruction this must go back through a small Codex/ChatGPT gate before implementation — same reasoning WI3b already applied to the bridge-mode config surface. It's a distinct gate from WI3b's diagnostic bridge, since this one is player-facing and payload-carrying rather than a GM-turn diagnostic.

## 8. Non-Goals (restated for the implementer)

- No execute/apply button anywhere in this tab.
- No automatic repair/refuel triggered by viewing the preview.
- No state mutation, no new `postMessage` write, no Remote Play write.
- No rendering of `damage_vehicle` as a player action (F5).
- No rendering of WI3b bridge mode in this tab (F6).
- No client-side reimplementation of `move_vehicle`'s parking-metadata noop logic (F4) — that stays server-authoritative and out of Tier 1.

## 9. Risks That Must Go Back to the ChatGPT/Codex Gate

1. **Tier 2 payload-aware preview endpoint** (§7, Phase WI3b-adjacent) — any new Webview→host message, even read-only, needs its own gate: message shape, rate limits, whether it's allowed to run `queryWorldIntent()` per-keystroke while a player is choosing a destination/amount, and whether `enableVehicleSystem`/game-rules context can be safely exposed to that handler without leaking other subsystem state.
2. **Any future decision to show `damage_vehicle` or bridge-mode diagnostics in a player-facing surface** (F5, F6) — this design deliberately keeps them out; if a future request wants them back in, that reopens the "who is this UI for" question and should be re-gated rather than silently added to this component.
3. **Whether Tier 1's client-side reason derivation (`already_active`, `hp_already_max`, `fuel_already_max`, `no_fuel_tank`, `fuel_type_mismatch`) is allowed to drift from `worldIntentCore.ts`'s reason codes over time** — since Tier 1 intentionally does not import the core module, a future WI core change (e.g. a new blocked reason) will not automatically propagate to the Webview. Recommend a lightweight cross-check test (host-side) asserting the Tier 1 reason set is a subset of the current `worldIntentCore.ts` reason codes, so drift is caught at CI time rather than silently.
