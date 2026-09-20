# MEDIA-COMFY-001: Long-load ComfyUI job lifecycle

## Scope

The repo-owned `comfyui_generate.py` previously stopped after a fixed 300-second history-only poll. A real first model load can exceed that period, leaving the original ComfyUI prompt running while a caller retries and creates duplicate images.

## Repair

- Queue rejection or a missing `prompt_id` ends immediately with a `TA_MEDIA_RESULT` failure and no polling.
- A confirmed prompt is observed through `/history/<prompt_id>` plus `/queue` where available, with `QUEUED`, `RUNNING`, `COMPLETED`, `ORPHANED`, and `TIMED_OUT` machine-readable `TA_MEDIA_STATUS` records.
- `COMFYUI_JOB_TIMEOUT` is the configurable total lifecycle cap (default 1200 seconds); it is distinct from the per-request `COMFYUI_HTTP_TIMEOUT`.
- Pending/running prompts remain active beyond 300 seconds. Missing prompts receive `COMFYUI_ORPHAN_GRACE` before an orphan result. If queue observation is unavailable, the confirmed queued state is retained until history resolves or the absolute cap is reached.
- Final failures retain `TA_MEDIA_RESULT` compatibility and include `promptId` plus `lastState`; successful portrait adoption remains unchanged.

## Contract and verification

The repo-owned GM Skill now directs callers to stop on queue failure, never claim job activity without evidence, avoid duplicate submission while a confirmed prompt is queued/running, and require successful `TA_MEDIA_RESULT` before claiming completion.

`scripts/test_comfyui_job_lifecycle.py` uses fake time and covers queue rejection, queued-to-running completion at 325 seconds, no 300-second cutoff, absolute timeout, orphan grace, warm 12-second completion, and side-effect-free help. Existing portrait adoption, Skill installer/file bridge, compile, and the full suite remain required gates.

## Gate results

- `python scripts/test_comfyui_job_lifecycle.py` — PASS.
- `python scripts/test_portrait_artifact_adoption.py` — PASS.
- `node scripts/test_antigravity_skill_installer.js` — PASS.
- `node scripts/test_antigravity_file_bridge.js` — PASS.
- `npm run compile` — PASS.
- `npm test` — PASS, 240/240 (run once).

Status: **VERIFYING — REAL_COMFYUI_AND_HUMAN_SMOKE_PENDING**. No live installed Skill, Fantasy workspace, real ComfyUI generation, or live installer was touched.
