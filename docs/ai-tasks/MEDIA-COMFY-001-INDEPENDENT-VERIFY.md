# MEDIA-COMFY-001 Independent Adversarial Verify

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent adversarial verification (no implementation changes, no merge)  
- **Date:** 2026-07-10 (JST)  
- **Worktree:** `C:\AI\wt-media-comfy-001-verify` @ `0173cb9`  
- **Not run:** live installer; real ComfyUI generation  

## Final verdict

```text
MEDIA_COMFY_001_VERIFY_PASS
```

---

## Real incident under test

Human-smoke failure mode that must not recur:

1. `/prompt` accepted a generation  
2. Job stayed genuinely active while a model loaded **> 300s**  
3. Old client timed out at **300s**  
4. Original ComfyUI job continued  
5. Later completed and produced an image  
6. A **retry** had already been submitted  
7. Retry completed quickly (warm model)  
8. **Two images** from one perceived failed attempt  

Repair must observe one confirmed job through long load, not re-`/prompt` on wall-clock 300s, and not report success without a real lifecycle result.

---

## 1. Integrity

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `c0418a8552b8ab2d6247eff238e004d3ee944388` | exact match (`docs: record MEDIA-M1.1 integration repair`) | MATCH |
| Main moved? | no | tip still `c0418a8` at end of verify | NO |
| Candidate branch | `task/MEDIA-COMFY-001-long-load-lifecycle` | tip `0173cb97932698257541537466c6978f42201e51` | MATCH |
| Shape `main...candidate` | exactly one commit ahead | `0 1` | MATCH |
| Version | `1.78.2` | package / lock root / `packages[""]` / 4 README badges / CHANGELOG `[1.78.2]` / VERSION_TRUTH | MATCH |

### Production touch set (candidate vs main)

```text
antigravity-skill/text-adventure-gm/SKILL.md          (+2 Skill rules)
antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py  (lifecycle)
package.json (+ lock, READMEs, CHANGELOG, VERSION_TRUTH)  (1.78.2)
docs/ai-tasks/MEDIA-COMFY-001-LONG-LOAD-JOB-LIFECYCLE.md
scripts/run_all_tests.js (+ lifecycle test registration)
scripts/test_comfyui_job_lifecycle.py
```

No `src/**` / `webview/**` / extension installer redesign. Unrelated production surface not widened. PASS.

---

## 2. Queue rejection

**Main path (old vs new):** old `main` exited with “Failed to queue prompt” only; new emits structured failure then exits 1 **before** `wait_for_job_completion`.

```text
queue_prompt → None / missing prompt_id
  → _failure_result("QUEUE_REJECTED", ...)
  → exit 1
  → wait_for_job_completion never entered
```

Packaged test **A** (`scripts/test_comfyui_job_lifecycle.py`):

- `queue_prompt` forced to return `None`  
- `get_history` / `get_queue` instrumented counters stay **0**  
- stdout contains `"state":"QUEUE_REJECTED"`  
- `SystemExit` code **1**  

| Requirement | Result |
| --- | --- |
| HTTP 400 / no `prompt_id` → immediate failure | PASS (`queue_prompt` returns `None` on HTTPError; main treats as reject) |
| Zero lifecycle polling | PASS |
| No QUEUED / RUNNING status | PASS (no status emitter before wait) |
| No retry `/prompt` | PASS (single `queue_prompt` call site in `main`; reject exits) |

---

## 3. State observation

`wait_for_job_completion` states:

| State | How entered | Result payload |
| --- | --- | --- |
| **QUEUED** | exact id in `queue_pending` | status emit; continues |
| **RUNNING** | exact id in `queue_running` | status emit; continues |
| **COMPLETED** | `prompt_id in history` (checked **before** queue) | returns history |
| **ORPHANED** | queue observed and id absent for ≥ `orphan_grace` | returns with `lastState` prior |
| **TIMED_OUT** | `elapsed >= job_timeout` | returns `promptId` + `lastState` |
| **QUEUE_REJECTED** | main only (never inside wait) | `_failure_result` |

### Queue parsing / false positives

`_queue_contains_prompt` matches **exact** equality only (recursive over list/tuple/dict). Adversarial probes:

| Shape | Match? |
| --- | --- |
| `queue_running: [[1, pid, {}]]` | yes |
| `queue_pending: [[0, pid]]` | yes |
| nested dict containing pid | yes |
| substring / prefix (`xxpidyy`, `pid0`) | **no** |
| other jobs only | **no** |
| empty queues | **no** |

PASS — no false-positive substring matches of the class that would keep a wrong job “alive” or orphan the wrong id.

---

## 4. Long-load counterexample (fake time)

Incident reconstruction with fake clock (packaged B/C/D/E + independent probe):

| Claim | Evidence | Result |
| --- | --- | --- |
| Original prompt submitted once | `main` calls `queue_prompt` once; `wait_for_job_completion` body contains **no** `queue_prompt` | PASS |
| Job RUNNING past 300s | fake-time RUNNING until history @ 325; status/timeline has no TIMED_OUT | PASS |
| No timeout at 300 | default `JOB_TIMEOUT=1200`; old `max_wait=300` removed | PASS |
| No second `/prompt` | wait loop only polls history+queue | PASS |
| Complete ~325s from original prompt | `history_at=325` → `COMPLETED`, `clock.now >= 325` | PASS |

This **prevents the exact incident**: client no longer abandons a live job at 300s and invites a retry while the original continues.

---

## 5. Queue endpoint unavailable

When `get_queue()` returns `None` (exception / non-dict):

- state stays **`last_state`** (initially `QUEUED` after accept)  
- **does not** start/advance orphan via the missing-id branch  
- absolute `job_timeout` still yields **TIMED_OUT** with honest `lastState`  

Independent probe: always-`None` queue → `TIMED_OUT` @ 15s, `lastState=QUEUED`, no `ORPHANED`. PASS.

Intermittent unavailability after RUNNING observed: still completes when history appears; no false orphan. PASS.

---

## 6. Orphan semantics (counterexamples)

| Counterexample | Expected | Observed | Result |
| --- | --- | --- | --- |
| Brief MISSING then RUNNING + late history | no orphan | COMPLETED; no ORPHANED status | PASS |
| pending → running | QUEUED then RUNNING then COMPLETED | status sequence includes both | PASS |
| Queue unavailable intermittently | no false orphan | COMPLETED; no ORPHANED | PASS |
| History appears during orphan grace | COMPLETED wins (history first) | COMPLETED before grace expires | PASS |
| Exact grace boundary | ORPHANED when `>= grace` | grace=4 → ORPHANED @ ≥4; `lastState=QUEUED` | PASS |

Packaged test **G** also pins MISSING → ORPHANED after grace with `lastState=QUEUED`. PASS.

---

## 7. Absolute timeout

| Claim | Evidence | Result |
| --- | --- | --- |
| Default 1200s | `JOB_TIMEOUT = _positive_float_env("COMFYUI_JOB_TIMEOUT", 1200)` | PASS |
| Positive override works | probe `900` → 900.0 | PASS |
| invalid / nonpositive fall back | `0`, `-5`, `not-a-number` → default 1200 | PASS |
| Timeout result has promptId + lastState | packaged **F**: TIMED_OUT, `promptId=job-1`, `lastState=RUNNING` | PASS |
| HTTP timeout separate | `HTTP_TIMEOUT` default 30; used only on individual HTTP calls | PASS |

---

## 8. Structured output

| Claim | Evidence | Result |
| --- | --- | --- |
| `TA_MEDIA_STATUS` deterministic/parseable | `TA_MEDIA_STATUS ` + compact JSON `promptId/state/elapsedSeconds` | PASS |
| Final `TA_MEDIA_RESULT` compatibility | still `TA_MEDIA_RESULT ` + JSON; success path retains `success/outputPath/createdAt` | PASS |
| Success includes promptId/jobState | base success dict adds both before emit | PASS (non-adoption path) |
| Failure includes lifecycle diagnostics | `_failure_result` carries `state`, optional `promptId`/`lastState` | PASS |
| Completed with no image → not success | `_failure_result("COMPLETED", "…no image found…", prompt_id, "COMPLETED")` then exit 1 | PASS |

### Residual (non-blocking for the incident)

On **portrait adoption success**, `result = adopt_character_portrait(...)` **replaces** the dict, so the emitted adoption result currently **omits** `promptId`/`jobState` (pre-existing adoption shape). Generation-without-adoption success still includes both. Does not reintroduce 300s timeout / duplicate `/prompt`. Track as a possible follow-up contract polish, **not** incident re-open.

Also residual: Japanese comment near poll still says “最大5分” while default job timeout is 1200s (comment drift only).

---

## 9. Portrait adoption regression

Candidate does not change `portrait_artifact.py`. Focused suites:

| Suite | Result |
| --- | --- |
| `python scripts/test_portrait_artifact_adoption.py` | PASS |
| `node scripts/test_portrait_artifact_sync.js` | PASS (exact artifact, versioned adoption, character JSON authority, no newest-file scan, Skill forbids false success) |

`--help` side-effect free: packaged test **J** — `python comfyui_generate.py --help` exit 0, prints Usage / `TA_MEDIA_RESULT`, no ComfyUI required. PASS.

---

## 10. Skill contract

Repo-owned `antigravity-skill/text-adventure-gm/SKILL.md` adds rules **8–9**:

| Required | Text | Result |
| --- | --- | --- |
| Queue failure → immediate stop | rule 8: HTTP 400 / nonzero queue failure / no `prompt_id` → stop; no waiting/running without evidence | PASS |
| No unsupported “still running” claims | rule 8 forbids reporting waiting/running without prompt/job evidence | PASS |
| No duplicate retry for confirmed live job | rule 9: after confirmed queued/running, do not duplicate-retry for slow model load | PASS |
| Completion only after successful `TA_MEDIA_RESULT` | rule 9: only `TA_MEDIA_RESULT` is completion evidence | PASS |

---

## 11. Tests

Worktree `C:\AI\wt-media-comfy-001-verify` @ `0173cb9`. Clean Desktop `PSModulePath` for Windows PowerShell 5.1 installer tests (host hygiene; not a candidate defect).

| Command | Result |
| --- | --- |
| `python scripts/test_comfyui_job_lifecycle.py` | PASS |
| `python scripts/test_portrait_artifact_adoption.py` | PASS |
| `node scripts/test_portrait_artifact_sync.js` | PASS |
| `node scripts/test_antigravity_skill_installer.js` | PASS |
| `node scripts/test_antigravity_file_bridge.js` | PASS |
| `node scripts/check_version_consistency.js` | PASS (`1.78.2`) |
| `npm run compile` | PASS |
| `npm test` (**once**) | **240/240** PASS |

---

## Incident closure map

| Incident step | Old behavior | Candidate |
| --- | --- | --- |
| Long model load >300s | client `max_wait=300` gave up | `JOB_TIMEOUT=1200` + RUNNING observation |
| Client timeout | silent abandon | TIMED_OUT only at absolute cap with diagnostics |
| Original job continues | yes, unobserved | observed until COMPLETED / ORPHANED / TIMED_OUT |
| Retry `/prompt` | encouraged by client failure | Skill forbids; client never re-submits inside wait |
| Double image | possible | single submission per process; no 300s false-fail path |

---

## Verdict rationale

Integrity and version identity hold; production delta is scoped to Comfy job lifecycle + Skill contract + version surfaces. Queue rejection, state machine, long-load counterexample, queue-unavailable fallback, orphan grace counterexamples, absolute vs HTTP timeout separation, structured status/result, portrait regression suites, Skill rules, and **240/240** all pass. Residuals (adoption result field drop; stale “5分” comment; weak hardcoded `submissions=1` in one packaged assert, mitigated by code inspection) do **not** re-open the double-generation failure mode.

```text
MEDIA_COMFY_001_VERIFY_PASS
```
)
