# MEDIA-M1 Post-Merge Smoke

Status: `MEDIA_M1_POST_MERGE_FAILED`

Date: 2026-07-10 JST.

## Evidence chain

- Design: `78c19eb4365634da2c248f8c34082b1f6be3f1ea`
- Implementation: `046385f52a3f3f12ae1fc49aa9c46ae8798e2e60`
- Candidate report: `e2297138f8cf042d7a40f6e109464814d8ddcc66`
- Independent verify: `18d81f90cc1004929f872214e8efd800c850802f`

Integrity checks passed before merge: `origin/main` was exactly
`e4292f550025349a21ff4259c854e73fc1326219`; implementation is the candidate
report's parent; candidate is the independent verifier's parent; and the verifier
commit changed only `docs/ai-tasks/MEDIA-M1-INDEPENDENT-VERIFY.md`.

The three accepted commits were integrated to `main` and pushed as
`34fec195396ef5cad695f04bd5b67fb4822e520c`.

## Normal post-merge gates

All specified gates passed. The full suite was run once: `235/235`.

- `npm run compile`
- `node scripts/test_media_profile_compatibility.js`
- `python scripts/test_comfyui_media_contract.py`
- `node scripts/test_image_gen_circuit_core.js`
- `python scripts/test_comfyui_cartography_lora.py`
- `node scripts/validate_cartography_workflow.js`
- `node scripts/validate_cartography_workflow_direct.js`
- `node scripts/test_webview_bundle.js`
- `node scripts/check_i18n_keys.js`
- `npm run check:symbol-registry`
- `npm test` — `235/235`

The compile regenerated `webview/script.js` with CRLF-only noise. It was confirmed
content-identical with `git diff --ignore-space-at-eol` and restored; no suite was
repeated.

## Canonical installer result

Ran the required canonical entrypoint:

```text
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

The managed checkout resolved `origin/main` to `34fec195396ef5cad695f04bd5b67fb4822e520c`.
VSIX packaging and integrity validation passed (version `1.77.15`, SHA-256
`8d9321a3cafe82f540e450351479664726261c97a44b658932c0f70479bbb2a6`).

Canonical install is **not PASS**: Antigravity IDE's CLI could not rename the live
`miya.lorerelay-1.77.15` directory (`EPERM`), requested an IDE restart, and the
direct-folder fallback ended with `Argument types do not match`. The installer exited
non-zero and stated that no IDE target succeeded. This blocks the required real human
smoke even though the observed canonical target contains the new files.

Observed target evidence (not a substitute for canonical installer PASS):

- target: `C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15`
- installed LoreRelay version: `1.77.15`
- installed `antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py` SHA-256:
  `93B92F96C7097A397D6A6175F81E79DA29257632D65FAFE317A8B3928BBEF799`
- repo-owned skill SHA-256: identical
- installed `webview/index.html` contains `Media Profile` and `ig-model-family`
- installed `out/imageGenRunner.js` imports `mediaCompatibility` and calls
  `preflightSceneGeneration`

Required recovery: restart Antigravity IDE to release the extension directory, rerun
the same canonical BAT until it exits successfully, then record a new closeout before
performing the human smoke. Do not treat the copied files as a successful installer
run.

## Human smoke: pending canonical installer PASS

After a successful canonical install, perform these checks without claiming image
quality improvement:

1. Bad portrait: SDXL Simple / Illustrious + Anima +
   `Anima\matureritualANIMA_test011.safetensors` +
   `C:\AI\text-adventure-vsce\comfyui\workflow_sdxl_1024.json` + `illustrious`.
   Expect a clear compatibility error, no queue/spawn, usable text gameplay, and
   immediate retry after correction.
2. Legal portrait: SDXL Simple / Illustrious + SDXL +
   `IL\prefectIllustriousXL_v8.safetensors` + the same workflow + `illustrious`.
   Expect preflight pass, ComfyUI request, and saveable portrait output.
3. Bad world-map inheritance: restore Anima family/checkpoint and request a world map.
   Expect rejection before cartography layout or ComfyUI spawn with an SDXL-compatible
   binding requirement.
4. Legal world-map binding: restore SDXL family and a compatible SDXL checkpoint.
   Expect the existing cartography path to proceed.

Do not mark M1 `DONE` until these human checks pass.

## Accepted narrow follow-ups after the real M1 smoke

- FOLLOW-UP A: Genesis image preflight rejection can leave its spinner visible until
  the 90-second client watchdog.
- FOLLOW-UP B: Queue revalidation / drain circuit separation is source-verified but
  lacks a dedicated enqueue -> mutate-config -> drain behavioral integration test.

Neither is repaired by this integration task.
