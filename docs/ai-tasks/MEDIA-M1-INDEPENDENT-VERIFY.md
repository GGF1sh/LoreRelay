# MEDIA-M1 Independent Adversarial Verification

Status: `MEDIA_M1_VERIFY_PASS`

Reviewer role: independent adversarial verification. The accepted architecture was
designed by Grok; the implementation was produced by GPT-5.6 Sol High. This review
agrees with neither by default and searched for real defects and counterexamples.

Verifier: Claude (Opus 4.8, high reasoning). Date: 2026-07-10 (JST).
Method: direct source inspection + behavioral testing at real production seams.
No production code was modified. No merge was performed. No subagents were used.

---

## 1. Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `e4292f550025349a21ff4259c854e73fc1326219` | `e4292f5…1326219` | MATCH |
| Implementation commit | `046385f52a3f3f12ae1fc49aa9c46ae8798e2e60` | present | MATCH |
| Candidate / report HEAD | `e2297138f8cf042d7a40f6e109464814d8ddcc66` | present | MATCH |
| Ancestry | `main → 046385f → e229713` | `merge-base --is-ancestor` both true | MATCH |
| Ahead / behind vs main | 2 / 0 | `0 2` (`--left-right --count main...cand`) | MATCH |
| Second commit | docs/report only | `e229713` = 196 insertions to `MEDIA-M1-COMPATIBILITY-PROFILE-SPINE.md` only | MATCH |
| M2–M7 leakage | none | none found (Section 19) | CLEAN |

Review branch created: `task/MEDIA-M1-independent-verify` off `e2297138`.
Confirmed `git diff e2297138 HEAD --stat` is empty — the reviewer made no code edits.

### Production touch set (14 files, separated from tests/fixtures/docs/generated)

Source (6): `src/mediaProfileCore.ts` (new), `src/mediaCompatibility.ts` (new),
`src/imageGenConfig.ts`, `src/imageGenRunner.ts`, `src/characterManager.ts`,
`src/cartographyRunner.ts`.
Python (1): `antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py`.
Webview (3): `webview/index.html`, `webview/script.js` (generated), `webview/modules/60-tts-quickreply-imagegen.js`.
Locales (4): `locales/{en,ja,zh-CN,zh-TW}.json`.

Tests/fixtures (not production): `scripts/test_media_profile_compatibility.js`,
`scripts/test_comfyui_media_contract.py`, `scripts/run_all_tests.js`, `fixtures/media-m1/*`.
Generated artifacts: `docs/generated/SYMBOL_REGISTRY.md`, `docs/generated/symbol_registry.json`.

---

## 2. Real failure must be closed — VERIFIED CLOSED

Accepted human failure: `Anima\matureritualANIMA_test011.safetensors` + SDXL simple
graph (`CheckpointLoaderSimple + CLIPTextEncode + KSampler`) + `illustrious` mode,
old runtime error `clip input is invalid: None`.

Traced through the real production preflight seams (`preflightSceneGeneration`,
`preflightPortraitGeneration`, `preflightExpressionGeneration`,
`preflightWorldMapGeneration`) against the real repo workflow
`comfyui/workflow_sdxl_1024.json` and the `anima-incompatible` / `anima-explicit` fixtures:

1. Exact bad configuration resolves **incompatible** with reason `MODEL_GRAPH_MISMATCH`,
   message `Model family anima is incompatible with workflow family sdxl_checkpoint_simple.`
   (names both families). Also `PROFILE_NOT_FOUND` because no Anima profile exists in M1.
2. `executeAfterMediaPreflight` returns `{executed:false}` on a failed preflight, so the
   queue/spawn callback is **never invoked** (behaviorally asserted: `spawnCalls === 0`).
3. Spawn is never reached — every generation spawn site sits behind a preflight (Section 10).
4. Python is not required to fail first: the rejection is produced by the TS host before
   any subprocess launch; `env.TA_MEDIA_PREFLIGHT` is never set to `validated` on rejection.
5. Circuit-breaker failure count is not incremented: the rejection short-circuits before the
   spawn/result path that calls `recordImageGenFailure`; the queue drain explicitly skips the
   failure counter when `preflightRejected` (imageGenRunner.ts:183–195).
6. Retry after correction remains possible — a rejection does not latch and does not open the
   circuit; correcting settings and re-requesting proceeds normally.

This is verified at a real production seam, not only a direct validator unit call.

---

## 3. Profile authority — PASS

Precedence in `validateMediaCompatibility`: explicit `modelFamily` wins for the effective
family (`actualFamily = modelFamily !== 'unknown' ? modelFamily : checkpointFamilyHint`);
a filename hint is carried separately and only produces a **conflict**, never a silent
override. Filename hints are weak evidence used for migration/diagnostics only.

| Case | Input | Result | Verdict |
| --- | --- | --- | --- |
| A | explicit `sdxl` + filename `anima…` | `MODEL_PROFILE_MISMATCH` (hint anima vs declared sdxl) | clear conflict, not silent reclassification ✔ |
| B | explicit `anima` + filename `…sdxl/xl_…` | `MODEL_PROFILE_MISMATCH` + `MODEL_GRAPH_MISMATCH` + `PROFILE_NOT_FOUND` | clear rejection ✔ |
| C | unknown filename + legal SDXL workflow, no explicit family/profile | `MODEL_FAMILY_AMBIGUOUS` (+ `PROFILE_NOT_FOUND`) | **fails closed**; recoverable via UI profile/family ✔ |
| D | ambiguous legacy v1 | `PROFILE_NOT_FOUND` + `MODEL_FAMILY_AMBIGUOUS` | never claims compatible ✔ |

Explicit declarations are not silently overridden by filename guesses. Confirmed.

---

## 4. V1 → V2 migration — PASS

- Loading v1 preserves all sanitized fields under `legacy`; nothing is destroyed.
- `saveImageGenConfig` re-sanitizes and retains `legacy`; saving does not erase legacy fields.
- Deterministic and idempotent: `load → sanitize → save → reload → sanitize` is stable
  (`isV2` branch reuses stored `modelFamily`/`profileId`; `sanitizeLegacyFields` is idempotent).
- **Migration does not continually rewrite the file**: `loadImageGenConfig` never writes; only
  an explicit settings save (`handleUpdateImageGenConfig` → `saveImageGenConfig`) writes to disk.
- Recovery from a failed migration is possible: explicit UI `profileId` + `modelFamily` +
  `checkpoint` override the migrated values on the next save (verified against the v2 `isV2`
  branch). A user cannot become permanently stuck.
- No `image_gen_config.json` → `DEFAULT_IMAGE_GEN_CONFIG` (family `unknown`, fails closed sensibly).
- VS Code settings fallback preserved in `buildImageGenEnv` (workspace config overrides settings).

Verdict: **migration is safe and non-destructive.**

---

## 5. Profile schema safety — PASS

`sanitizeMediaProfile` rejects: missing id/displayName, unsupported `modelFamily`/`graphFamily`,
empty `mediaKinds`/`promptModes`/`requiredNodeClasses`; ids are lowercased and de-duplicated;
media kinds/prompt modes filtered against allow-sets; defaults clamped (test proves steps 999→150).
`getBuiltInMediaProfile` returns isolated deep copies (test mutates one lookup and proves the
registry is unaffected). Unknown id → `undefined` (fail closed).

Injection safety: production only resolves a `profileId` string against the 5 hard-coded
built-ins via `Array.find` on exact lowercased id — never object indexing — so a hostile id
(`__proto__`, etc.) cannot masquerade as a trusted built-in and cannot cause prototype pollution.
Custom-profile storage is not generalized in M1, so no user JSON is ever elevated to a built-in.
M1 does not create a future custom-profile injection surface.

---

## 6. Graph detection — ACCEPTABLE FOR M1 (documented limitation)

`detectMediaGraphFamily` checks only the **presence of class_type names** in the graph
(SDXL simple = simple triad; canny = cartography set + `Canny`; direct = cartography set).
It does **not** verify connectivity, CLIP source, or that a single connected subgraph exists.

Consequence: a structurally broken workflow whose node names are correct but disconnected, or a
workflow containing two unrelated subgraphs, would pass graph-family detection. The report admits
this ("graph evidence, not universal model introspection"). Crucially, the **exact accepted bad
stack** (Anima × SDXL simple) is closed by model-family evidence, not by connectivity, so the
real failure is caught regardless of this limitation. This limitation permits a different, not-yet-
observed class of malformed workflow to pass preflight and then fail at ComfyUI runtime — acceptable
for M1 because no runtime-installation proof is claimed. Not a blocker.

---

## 7. Required node validation — PASS

Every `profile.requiredNodeClasses` entry is checked against the workflow's node-class **Set**
(`REQUIRED_NODE_MISSING` per missing class; duplicates cannot falsely help). Unknown graph →
`graphFamily = 'unknown'` → `GRAPH_FAMILY_UNKNOWN`; a profile family is never inherited by an
unproven graph. `REQUIRED_NODE_MISSING` is a distinct code from `MODEL_GRAPH_MISMATCH`.
Runtime `object_info` is not consulted — documented, and no installed-capability claim is made.

---

## 8. Queue and configuration races — PASS (source-verified)

- **Preflight before enqueue**: `enqueueImageGeneration` runs `preflightSceneGeneration` and
  returns `false` without touching the circuit when incompatible.
- **Revalidation before execution**: `drainImageQueue → executeImageGenerationOutcome` runs
  `preflightSceneGeneration` **again** immediately before spawn.
- Config changed to incompatible while a job waits → the second preflight rejects before spawn,
  returns `preflightRejected:true`, and the drain loop **skips** `recordImageGenFailure`
  ("rejected without consuming circuit-breaker failure count").
- Reverse (invalid → corrected → retry) → a fresh request passes (no latch).
- `queuedEntryIds` is cleared after every job outcome, including preflight rejection
  (imageGenRunner.ts:196–198) — no dedup leak.
- One bad queued job does **not** block later good jobs: the loop continues on `preflightRejected`
  and only breaks when the circuit actually opens.
- `imageGenerationProcess` is cleared on completion/timeout/error paths; no stuck busy state.

Note: this wiring is verified by source inspection; there is no dedicated behavioral integration
test that enqueues-then-mutates-then-drains. See Section 18.

---

## 9. Circuit-breaker separation — PASS

Compatibility failure ≠ runtime generation failure:
- Preflight reject (direct and queue) does not increment the failure count.
- Repeated incompatible clicks cannot open the 5-minute circuit.
- A valid preflight followed by a real subprocess failure still increments the circuit
  (imageGenRunner.ts:517–528 direct; 187–194 queue) and later success still resets it.

The circuit state machine itself is behaviorally tested (`test_image_gen_circuit_core.js`:
fresh-closed, single-increment, open-at-threshold + cooldown, success-resets). The
"compat-reject-does-not-increment" wiring inside `drainImageQueue` is source-verified.

---

## 10. Direct scene / MediaAgent path — PASS (no bypass found)

All real image **generation** spawn seams sit behind a preflight:

| Seam | Entry points | Preflight |
| --- | --- | --- |
| `executeImageGenerationOutcome` (comfyui_generate.py) | direct `runImageGeneration`, queue drain | `preflightSceneGeneration` |
| `enqueueImageGeneration` | MediaAgent (`mediaAgent.ts`), location (`autoLocationImageRunner.ts`, `gameStateSync.ts`, `extension.ts:1307`) | `preflightSceneGeneration` (enqueue) + re-preflight on drain |
| Genesis | `runImageGeneration(…, 'genesis')` | via `executeImageGenerationOutcome` |
| Portrait | `generatePortrait` | `preflightPortraitGeneration` |
| Expression | `generateExpression` | `preflightExpressionGeneration` |
| World map | `runCartographyGeneration` | `preflightWorldMapGeneration` |

The only non-preflighted spawn of `comfyui_generate.py` is `runListImageModels` (`--list-models`),
which is a read-only `/object_info` query and correctly exempt — it does not generate an image.
No alternate generation spawn path bypasses preflight.

---

## 11. Portrait path — PASS

`generatePortrait`: preflight runs before spawn; on rejection it returns early **before**
assigning `portraitProcess` and **before** sending `imageGenStart`, so the UI never enters a busy
state and no process handle leaks. On success it spawns, tracks `portraitProcess`, and always
emits `imageGenEnd` on close/error. Retry works after correction (only a live process blocks).
Workflow resolved for preflight is the same `workflow_api.json` next to the script that Python runs.

---

## 12. Expression path — PASS

`generateExpression` mirrors portrait: preflight before spawn, `expressionProcess` not set on
rejection, no `imageGenStart` on rejection, `imageGenEnd` always emitted on completion. Expression
still uses txt2img (identity continuity is M4 — not a defect here). Compatibility cannot be bypassed.

---

## 13. World map safety — PASS

`runCartographyGeneration` builds the cartography env (forcing the canny/direct SDXL workflow) and
runs `preflightWorldMapGeneration` **before** `renderStableLayout` and before the ComfyUI spawn.

| Case | Result |
| --- | --- |
| A. Anima/non-SDXL binding + cartography canny | rejected before layout **and** before spawn (`MODEL_GRAPH_MISMATCH`) ✔ |
| B. SDXL binding + canny | passes → existing map executor reachable ✔ |
| C. SDXL binding + direct | passes → existing map executor reachable ✔ |
| D. Pony (SDXL-compatible) | accepted intentionally (`isSdxlCompatibleModelFamily` includes pony); safe because Pony is SDXL-architecture on the `CheckpointLoaderSimple` graph ✔ |
| E. Generic scene profile override | impossible: scene profiles do not list `world_map` in `mediaKinds`; the cartography guard profile is forced via `profileIdOverride`, and a mismatched graph yields `GRAPH_FAMILY_MISMATCH` ✔ |

The cartography workflow contract cannot be silently overridden by a generic scene profile.

---

## 14. Python validated contract — PASS (local override, not overstated as security)

`comfyui_generate.py`:
- `host_validated = TA_MEDIA_PREFLIGHT == 'validated'`; when validated, `ws_config = {}` so the
  workspace `workflowPath`/`checkpoint`/`mode`/steps/CFG are **not** reloaded and cannot recreate a
  different stack (drift-proof).
- Incomplete validated contract (`TA_MEDIA_PROFILE_ID`, `TA_MODEL_FAMILY`, `TA_GRAPH_FAMILY`,
  `TA_WORKFLOW`) → `exit 1` with an explicit message.
- Direct standalone usage without the host contract still works (falls back to workspace config).

Boundary characterization: a local user who manually exports `TA_MEDIA_PREFLIGHT=validated` plus the
four contract vars and runs the script directly can bypass the TS preflight. This is an **ordinary
local-user override on the user's own machine**, not a remote security boundary — there is no remote
attacker in this path. The report frames the contract as anti-drift authority, which is accurate; it
does **not** overstate it as remote security.

Limitation (recorded): validated mode checks contract **completeness**, not **consistency** — Python
trusts the host's family/graph decision. Acceptable for M1 because the TS host is the declared
authority and it does perform the consistency validation before setting `validated`.

---

## 15. Checkpoint resolution gap — ACCEPTABLE, no overstatement

M1 does not query ComfyUI `object_info`; a non-empty checkpoint name is treated as
runtime-resolvable after graph/family validation. The user-facing copy says the stack is
"compatible" and asks to select a compatible profile/checkpoint — it never claims the checkpoint is
"installed". Preflight may pass while ordinary runtime later reports a missing checkpoint. This
matches the accepted behavior and does not produce a misleading installed/exists claim.

---

## 16. UI / settings — PASS

`index.html` adds a **Media Profile** selector (`ig-profile`: unresolved / sdxl-illustrious-simple /
pony-sdxl-simple / sdxl-generic-simple — the two cartography guards are correctly not user-selectable)
and a **Checkpoint family** selector (`ig-model-family`: unknown "generation blocked" / sdxl / pony /
anima). `collectImageGenConfigFromForm` persists both `profileId` and `modelFamily`;
`applyImageGenConfigForm` reflects saved values on reopen. All legacy advanced fields remain.
Incompatible configuration is surfaced as an error and is **not** silently auto-corrected. The known
Anima configuration is recoverable entirely through these selectors. i18n key integrity: 0 missing
across en / zh-CN / zh-TW (ja is base). User-facing copy is understandable and non-overstated.

---

## 17. False blocking / distribution risk — PASS (practical escape hatch)

For distributed users with arbitrary checkpoints, a neutral-named custom SDXL fine-tune with no
explicit family/profile **fails closed** (`MODEL_FAMILY_AMBIGUOUS` / `PROFILE_NOT_FOUND`). Recovery
does **not** require editing JSON: selecting Media Profile (e.g. "SDXL Simple / Generic" or
"…/Illustrious") + Checkpoint family = SDXL persists `profileId` + `modelFamily='sdxl'` and passes.
Misleading filenames are overridden by the explicit declarations (hint is weak evidence only). Because
a UI escape hatch exists and works, M1 is not too strict to the point of a blocker.

---

## 18. Test quality — PASS with honest source-level notes

Full suite: **235 / 235** (`npm test`, 45.8s). Focused: `test_media_profile_compatibility.js`,
`test_comfyui_media_contract.py`, `test_image_gen_circuit_core.js`,
`test_comfyui_cartography_lora.py` all pass. `npm run compile` PASS; `git diff --check` clean;
`check_i18n_keys` 0 missing; `check:symbol-registry` 3919 entries PASS.

Behaviorally proven (real production functions + real fixtures/workflow):
- exact Anima regression (`preflightSceneGeneration` on the bad fixture) ✔
- callback/spawn suppression (`executeAfterMediaPreflight`, `spawnCalls === 0`) and valid-path
  single execution ✔
- portrait / expression / scene seams all apply the same preflight ✔
- world-map rejection **and** legal canny/direct continuation, with spawn counting ✔
- Python validated-contract behavior ✔

Source-level only (verified by reviewer inspection, no dedicated behavioral test):
- queue **race** revalidation (enqueue-valid → mutate-to-invalid → drain-reject-without-circuit);
- the "compat reject does not increment circuit" wiring **inside** `drainImageQueue`
  (the circuit state machine is separately behaviorally tested).

Recommend adding one integration test for the queue-race + circuit-separation wiring in a follow-up.
This is a coverage gap, not a defect.

---

## 19. Scope — PASS (no M2–M7)

No Media Intent system, no family prompt compiler, no `visualIdentity`, no expression img2img, no
Action Router, no generalized manual handoff, no hardware tier / AUTO. Only two new `src` files
(`mediaProfileCore.ts`, `mediaCompatibility.ts`); grep for M2–M7 concepts in the core files is empty.

---

## 20. Verdicts summary

| Area | Verdict |
| --- | --- |
| Integrity | PASS (main exact, ancestry correct, 2/0, docs-only 2nd commit) |
| Real failure closed | PASS (behaviorally, at production seam) |
| Profile authority | PASS |
| Graph validation | ACCEPTABLE for M1 (presence-only; documented; real failure still closed) |
| Migration | PASS (non-destructive, idempotent, no continual rewrite, recoverable) |
| Schema / injection safety | PASS |
| Queue / circuit | PASS (queue-race + drain circuit wiring source-verified) |
| Portrait / expression | PASS |
| World map | PASS |
| Python boundary | PASS (local override, not overstated) |
| Distribution / recovery | PASS (UI escape hatch, no JSON editing required) |

### Limitations (recorded, none blocking)
1. Graph detection is class-presence-only (no connectivity) — documented; real failure still closed.
2. No `object_info` query — non-empty checkpoint name treated as runtime-resolvable; UI does not
   claim "installed".
3. Python validated contract checks completeness, not consistency; trusts the host authority.
4. Genesis image button uses an optimistic client spinner with a 90s watchdog: on a preflight
   rejection the host does not send `genesisImageGenerated`, so the genesis spinner lingers up to
   90s before self-recovering (the VS Code error message appears immediately). Minor UX only —
   no spawn, no circuit consumption, self-recovers; not on the required-gate list.
5. `runListImageModels` (`--list-models`) is not preflighted — correct, it is a read-only query.

### Counterexamples that break a required gate
None found. No adversarial case defeated the compatibility gate, migration safety, queue/circuit
separation, world-map guard, or the Python boundary.

### Blockers
None.

---

## Final verdict

`MEDIA_M1_VERIFY_PASS`

The exact accepted production failure (Anima × SDXL-simple × Illustrious) is behaviorally closed at
real production seams before any queue, spawn, layout, or Python execution, without consuming the
runtime circuit breaker and while remaining retryable. Profile authority, v1→v2 migration, schema
and injection safety, queue/config-race revalidation, circuit separation, portrait/expression seams,
world-map inheritance guarding, the Python validated contract, four-locale UI, and distribution
recovery all hold under adversarial testing. Recorded limitations are consistent with the stated M1
scope and none is a blocker. Recommended (non-blocking) follow-up: add a behavioral integration test
for the queue-race + `drainImageQueue` circuit-separation wiring.
