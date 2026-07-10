# MEDIA-M1: Compatibility Gate + Media Profile Spine

Status: `MEDIA_M1_READY_FOR_VERIFY`

## Delivery identity

- Base `origin/main`: `e4292f550025349a21ff4259c854e73fc1326219`
- Branch: `task/MEDIA-M1-compatibility-profile-spine`
- Implementation commit: `046385f` (`feat: add media profile compatibility preflight`)
- Scope: M1 only. No merge was performed.

## Reproduced failure fixture

The production failure is represented by `fixtures/media-m1/anima-incompatible/image_gen_config.json` and the repository SDXL-simple workflow:

- checkpoint family: Anima-like (`Anima\matureritualANIMA_test011.safetensors`)
- workflow graph: `CheckpointLoaderSimple -> CLIPTextEncode -> KSampler`
- prompt mode: `illustrious`
- generation settings: 28 steps, CFG 7, 1024 x 1024

The focused regression test proves that this stack returns `MODEL_GRAPH_MISMATCH`, names both `anima` and `sdxl_checkpoint_simple` in the readable reason, does not set the validated executor contract, and does not invoke the execution callback.

## Media Profile schema

M1 profiles are compatibility units with only these production fields:

- `schemaVersion`, `id`, and `displayName`
- `modelFamily`
- `graphFamily`
- supported `mediaKinds`
- compatible `promptModes`
- `requiredNodeClasses`
- safe generation `defaults`

Built-ins cover SDXL/Illustrious, Pony on an SDXL-compatible graph, generic SDXL, and two internal M1 cartography guards (Canny/direct). Checkpoint names and user workflow paths remain workspace/user bindings; no personal model path or GPU requirement is built in.

M1 intentionally does not add prompt compilers, Media Intent, visual identity, reference-image strategy, hardware tiers, AUTO selection, or action transport.

## Configuration migration

`image_gen_config.json` now sanitizes into a version 2 envelope while retaining all sanitized version 1 fields under `legacy`.

- Existing v1 values are not deleted or overwritten silently.
- An Illustrious/SDXL or Pony filename hint can provide weak, deterministic migration evidence when it agrees with prompt mode.
- An Anima hint is diagnostic evidence only and is never assigned to an SDXL profile.
- Unknown/ambiguous legacy model families remain unresolved and generation fails closed.
- Version 2 exposes explicit `profileId` and `modelFamily` bindings.
- The existing image settings panel adds only Media Profile and checkpoint-family selectors; all legacy advanced values remain.
- Changing settings and retrying is sufficient; a compatibility rejection does not latch or open the runtime circuit.

Filename hints are not authoritative. An explicit profile declaration remains primary, and a filename hint that conflicts with an explicit family produces a mismatch instead of silently changing the selection.

## Compatibility rules

Before local ComfyUI queue/spawn, validation returns structured reason codes plus a readable message and checks:

1. the selected/resolved profile exists;
2. the workflow resolves to an existing regular `.json` file and parses as a ComfyUI API graph;
3. detected graph evidence matches the declared graph family;
4. every profile-required node class is present in the graph;
5. a checkpoint binding exists in configuration/environment or in `CheckpointLoaderSimple`;
6. the declared/diagnostic model family is compatible with the profile and graph;
7. prompt mode is compatible with the profile;
8. requested media kind is supported.

Compatibility rejection is a preflight outcome. Runtime subprocess/Comfy failures after a valid preflight retain the existing image circuit-breaker behavior. A queued job rechecks compatibility immediately before execution; if configuration changed to an invalid stack while queued, it is rejected without incrementing the circuit failure count.

## Graph-family detection limits

M1 recognizes only the repository's current safety-relevant patterns:

- SDXL simple: `CheckpointLoaderSimple + CLIPTextEncode + KSampler`
- SDXL cartography Canny: the simple nodes plus `LoadImage`, `ControlNetLoader`, `ControlNetApplyAdvanced`, and `Canny`
- SDXL cartography direct: the cartography nodes without `Canny`

This is graph evidence, not universal model introspection. M1 does not claim to identify every ComfyUI architecture or inspect safetensor contents. When model family or graph family cannot be proven, generation fails closed and requests explicit profile/family selection. Runtime `object_info` discovery is not yet available at this host seam, so M1 validates required classes in the workflow graph; installed runtime capability discovery remains later work.

## Execution seams covered

- direct scene/genesis generation in `imageGenRunner`
- local image queue used by MediaAgent and location generation
- character portrait generation
- character expression generation
- cartography world-map generation
- Python `comfyui_generate.py` boundary

The TypeScript host resolves and validates the plan. It passes `TA_MEDIA_PROFILE_ID`, `TA_MODEL_FAMILY`, `TA_GRAPH_FAMILY`, the resolved workflow/checkpoint, and `TA_MEDIA_PREFLIGHT=validated`. The Python executor treats that contract as authoritative and does not reload workspace values that could recreate a different stack.

## World-map safety

M1 does not implement full cartography profile routing. It adds the narrow required guard:

- cartography continues selecting its existing Canny/direct workflow exactly as before;
- the inherited checkpoint/model binding is validated against that SDXL graph before layout or ComfyUI subprocess spawn;
- Anima/non-SDXL inheritance is rejected with a world-map-specific message;
- SDXL and Pony SDXL-compatible bindings can continue into the existing map executor.

## User-facing failure behavior

Expected compatibility failures:

- do not enter the ComfyUI queue/spawn callback;
- do not start an automatic retry loop;
- do not consume an image circuit-breaker failure;
- show a localized, understandable error while text gameplay remains usable;
- log profile, model family, graph family, workflow path, structured reason code, and technical detail in the image/cartography output channel;
- can be retried immediately after settings are corrected.

Japanese copy explicitly says the image stack is incompatible and asks the user to select a compatible Media Profile/checkpoint. World-map copy explicitly requires an SDXL-compatible binding.

## Changed files

- Profile and preflight: `src/mediaProfileCore.ts`, `src/mediaCompatibility.ts`
- Configuration/settings: `src/imageGenConfig.ts`, `webview/index.html`, `webview/modules/60-tts-quickreply-imagegen.js`, generated `webview/script.js`
- Execution seams: `src/imageGenRunner.ts`, `src/characterManager.ts`, `src/cartographyRunner.ts`
- Python boundary: `antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py`
- Locales: `locales/en.json`, `locales/ja.json`, `locales/zh-CN.json`, `locales/zh-TW.json`
- Fixtures/tests: `fixtures/media-m1/*`, `scripts/test_media_profile_compatibility.js`, `scripts/test_comfyui_media_contract.py`, `scripts/run_all_tests.js`
- Generated knowledge artifacts: `docs/generated/SYMBOL_REGISTRY.md`, `docs/generated/symbol_registry.json`

## Fresh test evidence

Run on 2026-07-10 JST:

- `npm run compile` - PASS
- `node scripts/test_media_profile_compatibility.js` - PASS
- `python scripts/test_comfyui_media_contract.py` - PASS
- `node scripts/test_image_gen_circuit_core.js` - PASS
- `python scripts/test_comfyui_cartography_lora.py` - PASS
- `node scripts/validate_cartography_workflow.js` - PASS
- `node scripts/validate_cartography_workflow_direct.js` - PASS
- `node scripts/test_webview_bundle.js` - PASS
- `node scripts/check_i18n_keys.js` - PASS (1057 referenced keys; 0 missing in all four locales)
- `npm run check:symbol-registry` - PASS (3919 entries)
- `npm test` - PASS (`235/235` scripts)
- `git diff --check` - PASS

The focused tests cover profile sanitization/lookup, compatible and incompatible v1 migration, the exact Anima failure, legal SDXL/Illustrious and Pony paths, wrong media kind, missing/unknown/mismatched workflows, preflight/circuit separation, queue/spawn suppression, valid executor entry, portrait/expression/scene helpers, both world-map rejection and legal map execution, Japanese compatibility copy drift, and the Python validated-plan contract.

## Limitations

- No Anima graph/profile ships in M1; Anima remains blocked until an explicit compatible graph/profile is supplied in a later scoped task.
- M1 does not query ComfyUI `object_info` to prove installed checkpoint/node availability. A non-empty Comfy checkpoint name is treated as a runtime-resolvable binding after graph validation.
- Filename matching is deliberately weak and limited to migration/diagnostics.
- Custom profile storage/import is not generalized; M1 exposes the built-in compatibility spine and explicit workspace binding fields.
- Full cartography intent/profile routing remains M6.
- No image quality claim is made by automated tests.

## Exact human smoke steps

### A. Known bad image stack

1. Open Image Gen Settings.
2. Set/preserve an Anima-like checkpoint.
3. Set checkpoint family to `Anima`.
4. Use the SDXL-simple workflow and `Illustrious` mode.
5. Request a scene or portrait.

Expected:

- rejected before ComfyUI queue/spawn;
- clear compatibility message naming the model/workflow problem;
- technical reason in `LoreRelay: Image Gen`;
- no Python `clip input is invalid: None` traceback is needed to explain the failure;
- text gameplay remains usable.

### B. Legal SDXL/Illustrious stack

1. Select `SDXL Simple / Illustrious`.
2. Set checkpoint family to `SDXL`.
3. Bind a known installed SDXL/Illustrious checkpoint.
4. Keep the SDXL-simple workflow and retry generation.

Expected: preflight passes and generation reaches ComfyUI.

### C. Bad world-map inheritance

1. Restore the Anima/non-SDXL image binding from A.
2. Request world-map generation.

Expected: rejected before layout/SDXL cartography ComfyUI spawn with a message that world-map generation requires an SDXL-compatible binding.

### D. Legal world-map binding

1. Restore the compatible SDXL binding from B.
2. Request world-map generation again.

Expected: preflight passes and the existing cartography path can proceed.

## Next phase boundary

M1 ends at compatibility-safe Media Profiles and validated local execution plans. The next accepted phase is M2 (Media Intent plus family-specific prompt compilers for scene/portrait) and must be implemented as a separate task. M1 did not begin M2-M7, Action Router work, generalized manual handoff, visual identity, expression img2img, hardware/AUTO selection, cloud generation, model downloads, or custom-node installation.

## Final verdict

`MEDIA_M1_READY_FOR_VERIFY`
