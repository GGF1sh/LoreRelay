# NOAI-PLAY-P4 Independent Verification

**Verdict:** `NOAI_PLAY_P4_REPAIR_REQUIRED`

**Date:** 2026-07-12  
**Verifier worktree:** `C:\AI\wt-noai-play-p4-independent-verify`  
**Verifier branch:** `task/NOAI-PLAY-P4-independent-verify`  
**Implementation branch published tip:** `94690406e81813c31419355b5eb9b2840528b35f`  
**origin/main:** `b5a5789e3e96991cd298eed7024589acfccbebcd`  
**Candidate version:** `1.80.0` (unchanged)

---

## Publication (encoding fix)

| Check | Result |
| --- | --- |
| Implementation branch | `task/NOAI-PLAY-P4-deterministic-travel` |
| Local HEAD before push | `94690406e81813c31419355b5eb9b2840528b35f` |
| HEAD parent | `6f39f3b0b6d9999959ee57471d0215607b5574af` |
| Implementation ancestry includes `b020614b` | yes |
| origin/main | `b5a5789e3e96991cd298eed7024589acfccbebcd` |
| Worktree clean at publish | yes |
| Version | `1.80.0` |
| Push | normal (non-force) `6f39f3b..9469040` |
| Remote tip after fetch | `94690406e81813c31419355b5eb9b2840528b35f` |

Commit `9469040` touches only:

- `docs/ai-tasks/NOAI-PLAY-P4-DETERMINISTIC-TRAVEL.md`

Exactly one line changed (mojibake UI names → correct Japanese):

- Added compact `旅に出る` action under `暮らす`.

Post-fix report contains none of: `譌` `蜃` `繧` `證`.

---

## Candidate lineage

```
origin/main  b5a5789e3e96991cd298eed7024589acfccbebcd
    ↓ parent of
b020614b     Add deterministic market travel
    ↓ parent of
6f39f3b0     Document NOAI PLAY P4 verification   (report-only)
    ↓ parent of
94690406     docs: fix P4 report UI encoding      (one-line report-only)
```

**Shape:** main + 3  

| Commit | Parent | Scope |
| --- | --- | --- |
| `b020614b` | `origin/main` (`b5a5789`) | implementation |
| `6f39f3b0` | `b020614b` | report-only (`NOAI-PLAY-P4-DETERMINISTIC-TRAVEL.md`) |
| `94690406` | `6f39f3b0` | one-line report encoding fix |

Isolated verification branch created at `9469040` in a fresh worktree. Audit not performed in the implementation worktree.

---

## Inspected files

**Priority (8):**

1. `src/deterministicMarketTravel.ts`
2. `src/marketTravelRequestGate.ts`
3. `src/extension.ts` (host commit/preview path + shared gate wiring)
4. `src/webviewHandlers.ts` (message routing only)
5. `webview/modules/85-world.js`
6. `scripts/test_market_travel_core.js`
7. `scripts/run_noai_play_p4_fixtures.js`
8. `scripts/run_all_tests.js` (manifest inclusion)

**Mechanical / expanded for authority or call-chain:**

- `src/deterministicWorkspaceMutationGate.ts`
- `webview/script.js` (EOL-normalized equality to module build)
- generated symbol registry (check mode only)
- `docs/ai-tasks/NOAI-PLAY-P4-DETERMINISTIC-TRAVEL.md` (not trusted as proof)
- external log `C:\AI\logs\noai-play-p4-full-suite.log`
- independent full-suite log `C:\AI\logs\noai-play-p4-independent-verify-full-suite.log`

Implementation code was not modified during verification.

---

## 1. Destination authority

**Production path (`deterministicMarketTravel.ts`):**

- Destinations = `commerce.markets[].locationId` ∩ `world_forge.geography.locations` via `resolveCommerceForge` + forge load.
- Current location excluded (`market.locationId === currentId` skipped).
- Unknown location id with no forge row is skipped; unknown requested id fails `UNKNOWN_DESTINATION`.
- Same-location fails `SAME_LOCATION`.
- Labels for receipts come from forge location names, not webview free text.
- Destination id from webview is validated by host regex (`^[A-Za-z0-9_-]{1,64}$`) then revalidated against canonical destinations at commit via `previewMarketTravel` after shared gate acquisition.
- No free-text destination reaches mutation; webview only posts selected option `id`.
- `reachabilityBasis` is hard-coded factual `known_market_location` (no invented route/distance/cost/time; `fixedCosts: []`, `elapsedWorldTurns: 0`).
- Stale destination after commit-time reread: re-enumeration rejects destinations no longer in markets∩locations.

**Current-location authority:**

- P4 reads/writes only `game_state.json` → `world.currentLocationId`.
- P3 end-day also uses the same field. No second player-location authority is mutated by P4.
- Residual risk (honest): other subsystems may *display* location-derived data from other caches/views; P4 does not write `world_state.json`. If a future path treated world_state location as authoritative player position, consistency would need separate work. For this first slice, established player location authority is `game_state.world.currentLocationId`.

---

## 2. Zero-turn contract

Successful `executeMarketTravel`:

- Mutates only `world.currentLocationId` once in the in-memory next state then `commitGameState`.
- Receipt `elapsedWorldTurns: 0`.
- Does not import or call end-day, bulk sim, Living World after-step, market recovery, Relay/GM/ComfyUI/image paths (static import ban asserted in focused test).
- Does not advance world turn; harness shows `worldTurn` unchanged.
- No invented travel events; no world_state write.

Host path: request gate → shared mutation gate → `executeMarketTravel` only.

---

## 3. Preview purity

`previewMarketTravel` / `handleMarketTravelPreview`:

- Reads rules, forge, commerce, game_state, world_state existence only.
- No `commitGameState`, no shared mutation gate, no request gate mutation path.
- Preview result is factual: current, destinations, selected destination, `elapsedWorldTurns: 0`, empty costs, `systemsNotAdvanced` list.
- Destination change/cancel in UI only clears local preview flags; no host mutation until explicit confirm with new requestId.

---

## 4. Shared mutation gate

Host uses the **same module-level** `deterministicWorkspaceMutationGate` instance for P2 (`shopkeeper_trade`), P3 (`end_day`), and P4 (`market_travel`) in `extension.ts`.

Required order on commit (observed):

1. P4 `marketTravelRequestGate.run`
2. `deterministicWorkspaceMutationGate.run` acquire
3. Canonical reread inside `executeMarketTravel` → `previewMarketTravel`
4. Destination revalidation (unknown/same fail closed)
5. Mutation of `currentLocationId`
6. `commitGameState` outcome checked
7. Disk reread verify → result
8. `finally` release on shared gate

Gate properties (from `deterministicWorkspaceMutationGate.ts` + tests):

- Immediate `WORLD_MUTATION_IN_PROGRESS` when occupied
- No queue, no delayed retry, no timeout force-unlock
- Released only by own `finally` (or extension-level `dispose` on deactivate)
- Throws → `status: 'failed'` + release
- Persistence failure path returns failure after release
- `clearWorkspace` refuses to clear while active (returns false)
- Panel dispose disposes **request** gates only; does **not** unlock a live shared mutation
- Separate workspace keys are independent

---

## 5. P4 request-id gate

| Behavior | Result |
| --- | --- |
| Same `requestId` while pending | coalesces to one `execute` |
| Completed replay | returns cached result; does not move again |
| Different `requestId` while pending | terminal `BUSY` (also cached) |
| Malformed/missing requestId | host rejects before gate; no mutation |
| Cache bound | default cap 32, min 1 max 128; oldest eviction |
| Panel dispose | request gate cleared; shared mutation not unlocked by dispose |
| Stale webview response | UI requires `msg.requestId === _marketTravelPendingRequestId` |
| Automatic retry | none (copy and UI) |

**Adversarial same requestId, different destination:**

- Gate keys only by `requestId`. Destination is closed over in the first `execute`.
- Pending reuse: coalesces to original execute (original destination).
- Completed reuse: returns original receipt with original destination; does not re-execute and does not claim the second destination.
- Treats original binding as authoritative; does **not** falsely report success for the changed payload destination. Acceptable under “return original result clearly bound to original destination or fail closed.”

---

## 6. Persistence truth

Success mutation path:

- `commitGameState(nextGame, { mode: 'salvage', baseRevision, mergeProfile: 'turn' })`
- Target field: `game_state.json` → `world.currentLocationId`
- Commit result `.ok` required; throw → `PERSIST_FAILED`
- Post-write disk reread must match destination or `VERIFY_FAILED`
- Neither `PERSIST_FAILED` nor `VERIFY_FAILED` reports success (`ok: false`)
- No rollback claim; no rollback implementation
- Replay does not re-enter execute (request gate)
- After ok response, host attempts `pushWorldViewToWebview`; failure sets `refreshFailed` / receipt `refreshFailed` without undoing persist
- `world_state.json` and markets are not written by P4

**Partial/competing authority:** single-file location write only; commerce/world markets untouched. Competing write risk is mitigated by shared workspace mutation gate with P2/P3.

---

## 7. Receipt contract

Successful receipt fields (typed):

- `requestId`, `origin` id/name, `destination` id/name
- `elapsedWorldTurns: 0`
- `marketAvailable: true`
- `reachabilityBasis: 'known_market_location'`
- `persisted: true`
- optional `refreshFailed`

Origin comes from commit-time preview reread (`preview.current`); destination from revalidated preview destination. No invented travel narration in receipt object. Replay returns same cached host response; disk already at destination so replay does not contradict disk if location still matches (no re-verify on pure replay).

---

## 8. Webview / UX audit

**Intended flow exists:** open → canonical destination select → read-only preview → explicit confirm → processing → receipt.

| Check | Result |
| --- | --- |
| Under 暮らす commerce UI area | yes (button inserted next to shopkeeper / end-day in commerce panel) |
| Free-text destination | no (`select` only) |
| Explicit confirmation | `移動を確定` after preview ready |
| Esc closes | yes |
| Focus return to initiator | yes on close |
| Stale response correlation | requestId match |
| BUSY / WORLD_MUTATION_IN_PROGRESS | non-success path; `data-state=busy` |
| Success styling on failure | not applied; failure text only |
| Auto retry | no |
| 400px wrap | dialog `width:min(100%,400px); overflow-wrap:anywhere` |
| Refresh after success | host pushes world view; `refreshFailed` preserves persisted truth in copy |

### BLOCKER: mojibake in product UI

Report encoding was fixed, but **production source and shipped bundle still use mojibake** for the travel action label / aria / dialog title:

- `webview/modules/85-world.js`: `travelOpen.textContent`, `aria-label`, dialog `aria-label`, `<h2>` contain corrupted glyphs (`譌` / `蜃` / `繧` …) instead of `旅に出る`.
- `webview/script.js` matches the module (EOL-normalized chunk equality after rebuild).
- Focused core test **asserts the mojibake string is present** in the bundle (`bundle.includes('…mojibake…')`), baking corruption into the expected contract.

`暮らす` and other nearby Japanese strings are correct. Durable report after `9469040` is clean.

**This alone fails the “no mojibake in source, bundle or report” bar → repair required.**

Committed `webview/script.js` matches canonical build after EOL normalization (norm-equal true; CRLF/LF byte size differs).

---

## 9. Fixture authenticity

Named fixtures listed by runner:

1. `successful_market_travel`
2. `same_location_rejection`
3. `unknown_destination_rejection`
4. `duplicate_request_travel`
5. `cross_action_travel_contention`
6. `travel_persistence_failure`
7. `travel_reload_persistence`

**Coverage blocker:** `scripts/run_noai_play_p4_fixtures.js` spawns `test_market_travel_core.js` **once**, then writes seven **static** JSON records with pre-canned evidence and prints their ids. It does **not** independently execute scenario-specific assertions per fixture name in temporary workspaces.

Broader behavioral coverage **does** exist inside `test_market_travel_core.js` (preview purity, success travel, same/unknown, persist/throw/verify fail, request gate, shared contention), but:

- labels are ceremonial at the fixture-runner boundary
- not all seven names map 1:1 to isolated proving functions (e.g. reload-after-close retention, full A–J contention matrix as named fixtures)

Per verification contract: ceremonial static records without independent scenario proof → **test coverage blocker → repair required.**

---

## 10. Contention findings

Proven in `test_market_travel_core.js` + shared gate unit tests:

| Case | Evidence |
| --- | --- |
| C. P4 active → P2 WORLD_MUTATION_IN_PROGRESS | shared hold test |
| D. P4 active → P3 WORLD_MUTATION_IN_PROGRESS | shared hold test |
| E. same requestId once | request gate test |
| F. different requestId → BUSY | request gate test |
| H. workspace A/B independent | other workspace completes while P4 held |
| I. thrown mutation releases gate | afterThrow then end_day completes |
| J. persistence failure releases | PERSIST_FAILED leaves location unchanged; gate not retained by core |

A/B (P2/P3 active → P4 busy) follow from the **same** shared gate implementation used by all three hosts; reverse direction is the same busy path. Full matrix not re-proven end-to-end as seven named P4 fixtures (see §9).

Invariants: max one protected mutation per workspace; losers do not write; no automatic queue.

---

## 11. Original full-suite failure

Log: `C:\AI\logs\noai-play-p4-full-suite.log`

- Failed: `[unit] test_runtime_accepted_replay_guard.js: exit 1`
- Assertion class: two-process stale takeover / single winner (outside P4 changed-file boundary)
- Not modified during this verification
- Not assumed harmless; independent full-suite used as terminal evidence (§14)

---

## 12. Focused tests

After `npm install`, `npm run build:webview`, `npm run compile`:

| Script | Result |
| --- | --- |
| `node scripts/test_market_travel_core.js` | PASS |
| `node scripts/run_noai_play_p4_fixtures.js` | PASS (ceremonial — see §9) |
| `node scripts/test_deterministic_workspace_mutation_gate.js` | PASS |
| `node scripts/test_shopkeeper_direct_trade_core.js` | PASS |
| `node scripts/test_shopkeeper_repair.js` | PASS |
| `node scripts/test_end_day_world_progression.js` | PASS |
| `node scripts/run_noai_play_p3_fixtures.js` | PASS |
| `node scripts/test_antigravity_installer_bootstrap.js` | PASS |
| `node scripts/test_antigravity_install_chain.js` | PASS |
| `node scripts/test_webview_bundle.js` | PASS |
| `node scripts/test_webview_world_modules.js` | PASS |

P4 focused tests green; fixture runner green only as a label printer over the core suite.

---

## 13. Canonical gates

| Gate | Result |
| --- | --- |
| `npm run build:webview` | PASS |
| `npm run compile` | PASS |
| `node scripts/check_i18n_keys.js` | PASS |
| `npm run check:symbol-registry` | PASS |
| `node scripts/check_version_consistency.js` | PASS (`1.80.0`) |

Version not bumped. Build dirt restored; verification commit contains only this document.

---

## 14. Independent full suite

**Command (once):** `npm test`  
**Log:** `C:\AI\logs\noai-play-p4-independent-verify-full-suite.log`  
**Manifest:** Scripts: **246**  
**Result:** exit **1** — **Passed: 243/246**

Failed scripts:

1. `test_runtime_accepted_replay_guard.js`
2. `test_antigravity_installer.js`
3. `test_antigravity_skill_installer.js`

**Diagnostic single reruns (no full-suite rerun):**

| Script | Diagnostic |
| --- | --- |
| `test_runtime_accepted_replay_guard.js` | **PASS** (includes “two-process stale takeover has exactly one winner”) |
| `test_antigravity_installer.js` | **FAIL** — `Get-FileHash` not available in this PowerShell environment (`install_common.ps1` / `Get-FileSha256`) |
| `test_antigravity_skill_installer.js` | **FAIL** — same `Get-FileHash` environment defect |

P4/P2/P3/shared-gate focused units inside the suite passed where observed (`test_market_travel_core.js`, mutation gate, shopkeeper, end-day).

**Cannot mark VERIFY_PASS** without complete 246/246.

Environment-blocked installer scripts are **not** the sole failure mode; independent code audit already requires repair for UI mojibake and ceremonial fixtures. Full-suite incomplete also blocks PASS.

---

## 15. Limitations

- No live installer run
- No human smoke / live player workspace
- No Antigravity / Relay / LLM gameplay / ComfyUI / image generation / network gameplay
- No merge; main not modified
- Encoding-fix commit not amended/recreated
- Fixture authenticity judged from runner source, not trusted labels
- Contention reverse direction (P2/P3→P4) inferred from shared gate identity + unit tests rather than a dedicated P4-named fixture
- Full suite not 246/246; installer failures are environment (`Get-FileHash`)

---

## Repair required (summary)

1. **UI encoding:** replace mojibake `旅に出る` strings in `webview/modules/85-world.js` (and rebuild `webview/script.js`); stop asserting mojibake in `test_market_travel_core.js`.
2. **Fixture authenticity:** make `run_noai_play_p4_fixtures.js` (or equivalent) independently prove each of the seven scenarios in temporary workspaces with production core/gate paths, not static records after one broad run.
3. **Full-suite PASS gate:** re-run `npm test` to 246/246 after repairs in a clean environment (installer scripts need a host where `Get-FileHash` works, or an approved hermetic path).

---

## Final verdict

**`NOAI_PLAY_P4_REPAIR_REQUIRED`**
