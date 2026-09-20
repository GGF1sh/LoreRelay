# MEDIA-COMFY-001 integration closeout

## Status

**VERIFYING — REAL_INSTALL_AND_LONG_LOAD_HUMAN_SMOKE_PENDING**

This work is not marked DONE. No live installer and no real ComfyUI generation ran during integration.

## Exact lineage

- Expected and verified `origin/main` before integration: `c0418a8552b8ab2d6247eff238e004d3ee944388`.
- Candidate branch: `task/MEDIA-COMFY-001-long-load-lifecycle`.
- Candidate SHA: `0173cb97932698257541537466c6978f42201e51`, confirmed exactly one commit ahead of the expected main and integrated by fast-forward.
- Independent verification source SHA: `6d34dfd272b482e2518d9fe32a47ba5ff4706598`.
- The independent verification was docs-only and added only `docs/ai-tasks/MEDIA-COMFY-001-INDEPENDENT-VERIFY.md`; it was cherry-picked as `daea37a`.
- The final main SHA is the closeout commit that adds this record, reported after the guarded push in the integration handoff.

## Version and lifecycle checks

- Version remains `1.78.2` in `package.json`, package-lock root, and package-lock `packages[""]`.
- The former `max_wait = 300` implementation is absent.
- `COMFYUI_JOB_TIMEOUT` defaults to `1200`; `COMFYUI_HTTP_TIMEOUT` remains a separate per-request transport timeout.
- The wait lifecycle contains no `/prompt` resubmission; the only queue submission occurs before lifecycle observation.
- The repo-owned GM Skill forbids duplicate retry for confirmed queued/running jobs.

## Post-integration gates

| Gate | Result |
| --- | --- |
| `python scripts/test_comfyui_job_lifecycle.py` | PASS |
| `python scripts/test_portrait_artifact_adoption.py` | PASS |
| `node scripts/test_portrait_artifact_sync.js` | PASS |
| `node scripts/test_antigravity_skill_installer.js` | PASS |
| `node scripts/test_antigravity_file_bridge.js` | PASS |
| `node scripts/check_version_consistency.js` | PASS |
| `npm run compile` | PASS |
| `npm test` (run once) | PASS — 240/240 |

No live installer ran. No real ComfyUI generation ran.

## Accepted non-blocking follow-ups

These are intentionally not repaired during integration, because changing the verified candidate would invalidate its verification:

- Portrait-adoption success `TA_MEDIA_RESULT` drops `promptId` / `jobState`.
- A stale source comment still says `最大5分`.

## Next human terminal gate

1. Fully exit Antigravity.
2. Run only: `C:\AI\text-adventure-vsce\install_extension_antigravity.bat`.
3. Require extension `1.78.2`.
4. Require installed GM Skill SHA-256 matches repo source.
5. Restart Antigravity.
6. Perform one real long-load ComfyUI smoke.
7. Prove:
   - original prompt submitted once;
   - job may remain alive beyond 300 seconds;
   - no client timeout at 300 seconds;
   - no duplicate retry;
   - exactly one intended final generation result;
   - portrait adoption still succeeds when requested.
