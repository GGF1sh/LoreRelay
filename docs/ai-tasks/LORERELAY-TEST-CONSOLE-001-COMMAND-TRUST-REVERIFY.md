# LORERELAY-TEST-CONSOLE-001 — Command-Trust Repair Independent Re-Verification

## Prompt / verifier identity

| Field | Value |
| --- | --- |
| Prompt timestamp | `2026-07-14 06:38:46 JST (Asia/Tokyo)` |
| Verifier model | Grok 4.5 (xAI) / Grok Build independent re-verifier |
| Reverification branch | `tooling/LORERELAY-TEST-CONSOLE-001-command-trust-reverify` |
| Reverification worktree | `C:\AI\wt-lorerelay-test-console-001-command-trust-reverify` |
| Repair worktree (read-only evidence) | `C:\AI\wt-lorerelay-test-console-001-command-trust-repair` |
| This report path | `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001-COMMAND-TRUST-REVERIFY.md` |

## Exact identities

| Gate | Required | Observed |
| --- | --- | --- |
| `origin/main` | `08807d98234cada6d10ee194779d56202afa2fbd` | match |
| Version | `1.82.4` | match |
| Original Test Console candidate | `dad0988cd94d616620b13fa946d6c3f036ca00da` | match |
| Original independent verifier report | `ecad18b2198274f065d547c633efa096ed6318f6` | present |
| Repair tip | `584f7f07075c39f6e28e0f564dcc8ccb17b7ea98` | match (local + origin) |
| Tested executable tree | `bf08601a9d7c7c9bed64f429a631f4bb3e202a0b` | match |
| Commits after executable tree | only docs `584f7f0` | match |
| Ahead of `dad0988` | 4 ahead / 0 behind | `4 0` |
| Merge commits | none | none |
| `584f7f0` documentation-only | yes | only two docs files |
| Frozen Relay tip | `9e304d7188e2e0c61852e204879bf1580f5e3415` | match |

Repair commits (`dad0988` → `584f7f0`):

1. `3b660be` fix(tooling): remove shell execution from Test Console  
2. `7322199` fix(tooling): validate and hydrate canonical test plans  
3. `bf08601` test(tooling): cover plan tampering and Windows metacharacters  
4. `584f7f0` docs: record Test Console command trust repair  

## Changed scope (candidate → repair)

Exactly these files (no extras):

- `tools/test-console/cli.js`
- `tools/test-console/lib/engine.js`
- `tools/test-console/lib/plan-trust.js`
- `tools/test-console/lib/planner.js`
- `tools/test-console/lib/server.js`
- `tools/test-console/lib/trusted-commands.js`
- `tools/test-console/test-impact-rules.json`
- `tools/test-console/test/test_console.test.js`
- `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001-COMMAND-TRUST-REPAIR.md`
- `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001.md`

No product/runtime, locale, installer, version, gameplay, simulation, or live-data changes.

## Static trust-boundary result

### Engine — PASS

- Every child spawn uses `shell: false` (hard-coded).
- `assertTrustedExecutable` rejects `.cmd` / `.bat` before spawn.
- Execution requires non-serializable `TRUSTED_MARKER` (`Symbol`); plain `"trusted": true` cannot forge it.
- `cwd` is always `plan.repositoryRoot`; `env` is always `process.env` (not plan fields).
- No `cmd.exe /c`, PowerShell command strings, or argument concatenation for test execution remain in the engine.
- Note: dashboard `listen({ open: true })` may still open a browser via OS launcher (`cmd.exe /c start` on Windows only for URL open). That path is **not** the Test Console command engine and does not execute plan commands.

### Trusted command registry — PASS

- Spawn authority (`executable` / `args`) is constructed only in version-controlled `lib/trusted-commands.js`.
- Unknown command IDs throw (`Unknown trusted command id`).
- `full-suite` hydrates to direct Node: `process.execPath` + `scripts/run_all_tests.js` (display: `node scripts/run_all_tests.js`).
- Ordinary JS tests use `process.execPath` + absolute script path.
- Python manifest entries use `python` + script path only.
- Compile / symbol-registry boundaries resolve through trusted npm JS CLI (`npm-cli.js`) invoked by `process.execPath`; missing entrypoint fails closed with no `npm.cmd` fallback.
- Registry refuses to hydrate `.cmd`/`.bat` executables.

### Plan trust — PASS

- `PLAN_SCHEMA_VERSION = 2`.
- Declarative plans carry IDs / scheduling / reasons only — no spawn authority on new planner output (`declareCommand`).
- schemaVersion 1 rejected.
- Presence of `executable`, `args`, `shell`, `cwd`, or `env` on selected commands rejected.
- `assertRepositoryIdentity` + `assertPlanCurrent` verify repository root, HEAD, branch, dirty identity, version, and base commit existence.
- `loadTrustedPlan` regenerates a canonical plan, requires exact declarative match, hydrates **only** the canonical plan.
- CLI (`loadTrustedPlan`) and dashboard (`hydrateOwnPlan` after in-memory `makePlan`) share `hydrateSelectedCommands` → `hydrateTrustedCommand`.

## Safety-property non-weakening result

| Property | Hand-edited persisted plan can weaken? | Mechanism |
| --- | --- | --- |
| `exclusiveGroup` | **No (current path)** | Included in declarative snapshot; mismatch rejects before hydrate/run |
| `workspaceWriter` | **No (current path)** | Same |
| `timeoutMs` | **No** | Taken only from registry definition (not from plan JSON) |
| `phase` | **No (current path)** | Declarative match rejects phase edits |

### Defense-in-depth (non-blocking hardening)

`hydrateTrustedCommand()` prefers descriptor-supplied `exclusiveGroup` / `workspaceWriter` when present over the registry definition:

```js
exclusiveGroup: descriptor.exclusiveGroup !== undefined ? descriptor.exclusiveGroup : …
workspaceWriter: Boolean(descriptor.workspaceWriter !== undefined ? descriptor.workspaceWriter : …)
```

An **internal future caller** that bypasses `loadTrustedPlan` / planner regeneration and passes `workspaceWriter: false` or a weaker `exclusiveGroup` could override registry safety properties.

**Classification:** non-blocking hardening recommendation (not an immediate reachable blocker).

**Current reachability:** production CLI and dashboard only hydrate commands from planner-produced (or regeneratively matched) descriptors; hand-edited plans that alter these fields fail `assertDeclarativeMatch` before execution. Independently verified with mutations of `workspaceWriter` and `exclusiveGroup`.

**Recommendation (do not block merge):** have `hydrateTrustedCommand` always apply registry `exclusiveGroup` / `workspaceWriter` / `timeoutMs` for known IDs, treating descriptor scheduling fields as non-authoritative or requiring exact equality with the registry definition.

## Persisted repaired full-suite evidence

Read-only:

`C:\AI\wt-lorerelay-test-console-001-command-trust-repair\.test-runs\2026-07-13T21-29-20-568Z-bf08601a`

| Artifact | Present |
| --- | --- |
| `plan.json` | yes |
| `results.json` | yes |
| `summary.md` | yes |
| `index.html` | yes |
| Focused logs | yes (3 commands) |
| Full-suite stdout/stderr | yes |

| Cross-check | Expected | Observed |
| --- | --- | --- |
| Fingerprint | `10b28786e10bd35f4694ecb1e4fdd71a97a1a33b575a0510c52564716f3ef30e` | match |
| Base SHA | `08807d98…` | match |
| Head SHA | `bf08601a…` | match |
| Version | `1.82.4` | match |
| Dirty | false | match |
| Unknown files | 0 | match |
| schemaVersion (plan) | 2 | match |
| Full-suite executable | direct Node `run_all_tests.js` | match (`node.exe` + absolute path) |
| Display command | `node scripts/run_all_tests.js` | match |
| `.cmd` / `.bat` / `cmd.exe` / shell:true in command defs | none | none (only launcher/docs path strings in reasons) |
| Focused | PASS | 3/3 PASS |
| Full-suite exit | 0 | match |
| Raw stdout | 251/251 | `Scripts: 251` + `Passed: 251/251` |
| Failed scripts | 0 | match |
| Summary | same fingerprint / PASS | match |
| Tip vs tested tree | docs-only after `bf08601` | match |

**Real 251-test suite was NOT rerun.**

Justification: evidence package complete and mutually consistent; raw full-suite stdout proves 251/251; head SHA is the repaired executable tree `bf08601`; docs-only commit follows; targeted trust + metacharacter + plan-tamper checks all pass independently.

## Targeted executable results

| Check | Result |
| --- | --- |
| `npm.cmd install` | PASS |
| `npm.cmd run compile` | PASS |
| `npm.cmd run test:console:self` | **PASS 34/34** |
| `npm.cmd test -- --list` | PASS; **Total entries: 251** |
| `node scripts/check_version_consistency.js` | PASS; **1.82.4** |
| `node scripts/validate_utf8_docs.js` | PASS |

Verifier shell used `npm.cmd` only for these host checks — not through the Test Console engine.

## Independent adversarial matrix

Disposable fixtures under `C:\AI\_verify-scratch\…` only (outside reverify worktree).

### Argv / metacharacters — PASS

Through `ExecutionEngine` with real `TRUSTED_MARKER` and `shell: false`:

- Ordinary text, spaces, Japanese/Unicode, quotes, path with spaces preserved **exactly** in `process.argv`.
- `&`, `&&`, `|`, `||`, `>`, `<`, `^`, `%PATH%`, `(`, `)` preserved literally.
- Injection-shaped args created **no** second command, **no** sentinel, **no** redirect file, **no** PATH expansion.
- No Node DEP0190 / shell warning.

### Engine rejection — PASS

| Case | Result |
| --- | --- |
| `.cmd` | rejected before spawn; no side-effect file |
| `.bat` | rejected; no side-effect file |
| Missing Symbol marker | rejected |
| Fake JSON `"trusted": true` | rejected |
| Unknown command ID | fail-closed |
| Missing executable | rejected |
| Side effects after rejections | none |

### Plan tampering — PASS

Every mutation rejected **before** execution (no sentinel side effects):

`executable`, `args`, command id, phase, category, base SHA, head SHA, changedFiles, unknownFiles, mode, version, dirty hash, workspaceWriter, exclusiveGroup, schemaVersion 1, shell, cwd, env.

Untampered declarative plan loads and hydrates with trust markers.

### Canonical full-suite definition — PASS

Hydrated integration `full-suite` is exactly equivalent to:

```text
node scripts/run_all_tests.js
```

(`process.execPath` + absolute `scripts/run_all_tests.js`; no shell wrapper.)

Compile boundary: `process.execPath` + `npm-cli.js run compile` with `workspaceWriter: true`.

### Server path — PASS

| Check | Result |
| --- | --- |
| Loopback bind | `127.0.0.1` |
| Path traversal static/runs | 404 / no leak |
| Duplicate Run while active | 202 then 409 |
| Stop | HTTP 200; cancel requested |
| Hydration boundary | `hydrateOwnPlan` stamps `TRUSTED_MARKER` on all commands |

## Hardening recommendations (non-blocking)

1. Make `hydrateTrustedCommand` ignore or hard-require registry values for `exclusiveGroup` and `workspaceWriter` so future internal callers cannot weaken them via descriptor overrides.
2. Optionally reject run-directory artifact plans that re-embed hydrated `executable`/`args` if ever reloaded (engine currently writes hydrated plans for audit; load path already rejects authority fields — keep that invariant).

These are **not** current blockers.

## Limitations

- Adversarial harness did not re-execute the full 251 suite (by policy).
- Browser-open helper in `server.js` still uses OS-specific launcher including `cmd.exe` for `start <url>` only; out of engine trust boundary for plan commands.
- Server stop was observed mid-run (`status=running` immediately after stop); cancel path is async and was confirmed by 200 + cancel API.

## Untouched confirmations

| Surface | Status |
| --- | --- |
| Repair implementation | **Not modified** (report-only commit on reverify branch) |
| Original candidate tip `dad0988` | Untouched |
| `origin/main` | Untouched; not pushed |
| Frozen Relay `9e304d7…` | Untouched |
| Installer / installed extension / live world / campaign data | Not operated on |
| Unrelated worktrees | Not modified for product code |

## Final verdict

### `LORERELAY_TEST_CONSOLE_001_COMMAND_TRUST_REVERIFY_PASS`

The command-trust repair closes the prior REPAIR_REQUIRED invariants:

- no `shell: true` for test execution;
- no `.cmd`/`.bat` spawn path;
- exact argv preservation under metacharacters;
- plans are untrusted declarative data; only registry hydration grants spawn authority;
- hand-edited plans rejected before execution;
- repaired full-suite evidence is direct Node 251/251 on tree `bf08601`.

### Integration recommendation

**Accept the command-trust repair for integration** with the original Test Console candidate stack, subject to normal product integration policy. Prefer landing the repair before or with any main merge of Test Console tooling. Optional follow-up hardening of `hydrateTrustedCommand` scheduling overrides can ship separately without blocking.

### Summary table

| Item | Value |
| --- | --- |
| Report tip | *(this commit after report-only commit)* |
| Repair tip | `584f7f07075c39f6e28e0f564dcc8ccb17b7ea98` |
| Original candidate tip | `dad0988cd94d616620b13fa946d6c3f036ca00da` |
| Base SHA | `08807d98234cada6d10ee194779d56202afa2fbd` |
| Version | `1.82.4` |
| Repaired fingerprint | `10b28786e10bd35f4694ecb1e4fdd71a97a1a33b575a0510c52564716f3ef30e` |
| Persisted full-suite | **251/251 PASS** (exit 0, direct Node) |
| Self-tests | **34/34 PASS** |
| Argv / metacharacters | **PASS** |
| Plan-tamper | **PASS** (all mutations rejected) |
| `.cmd`/`.bat` | **PASS** (rejected) |
| Server | **PASS** |
| Non-blocking hardening | hydrate descriptor override of exclusiveGroup/workspaceWriter |
| 251 suite re-run | **Not redundantly rerun** |
| Candidate/main/live untouched | **Confirmed** |
