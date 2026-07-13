# LORERELAY-TEST-CONSOLE-001 — Command Trust Repair

## Prompt / task identity

| Field | Value |
| --- | --- |
| Prompt timestamp | `2026-07-14 06:02:04 JST (Asia/Tokyo)` |
| Task id | `LORERELAY-TEST-CONSOLE-001-COMMAND-TRUST-REPAIR` |
| Repair branch | `tooling/LORERELAY-TEST-CONSOLE-001-command-trust-repair` |
| Repair worktree | `C:\AI\wt-lorerelay-test-console-001-command-trust-repair` |
| Required current main | `08807d98234cada6d10ee194779d56202afa2fbd` (confirmed match) |
| Required version | `1.82.4` (confirmed) |
| Original Test Console candidate branch | `tooling/LORERELAY-TEST-CONSOLE-001` |
| Original candidate exact tip | `dad0988cd94d616620b13fa946d6c3f036ca00da` (repair branch created from here) |
| Independent verifier report commit | `ecad18b2198274f065d547c633efa096ed6318f6` |
| Verifier report | `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001-INDEPENDENT-VERIFY.md` |
| Verifier verdict | `LORERELAY_TEST_CONSOLE_001_REPAIR_REQUIRED` |

## Reproduced vulnerability

The verifier's finding was reproduced by static and behavioral inspection of the candidate tip
(`dad0988`) before any repair code was written:

```js
// tools/test-console/lib/engine.js (candidate tip, now removed)
shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command.executable)
```

This fixed the `spawn EINVAL` failure for `npm.cmd`, but Node's `shell: true` on Windows
concatenates `command.executable` + `command.args` into a single string handed to `cmd.exe`,
which reinterprets shell metacharacters instead of passing arguments through verbatim. The
verifier demonstrated, and this repair independently re-confirmed via the new self-test suite
(`argv is preserved exactly for shell metacharacters and unicode (shell:false)`, run against the
*old* code path before the fix, and the *rewritten* engine after):

- `&` executes a second command.
- `>` performs redirection to a new file.
- `%PATH%` expands to the live environment variable.
- Arguments containing spaces or quotes are re-tokenized rather than preserved.
- `cli.js run --plan <plan.json>` parses the plan as arbitrary JSON and passes
  `command.executable` / `command.args` straight to `spawn`, with no revalidation against a
  planner-regenerated canonical command set. A hand-edited plan could therefore supply any
  executable, including a `.cmd`/`.bat` path, and reach the `shell: true` branch.

The one full-suite run recorded on the candidate tip used the safe fixed form `npm.cmd` +
`['test']` (no metacharacters), so it legitimately passed 251/251 — but the execution path itself
was not fail-closed, which is exactly the invariant the verifier flagged.

## Trust-boundary design

The repair establishes a single rule: **a persisted plan is untrusted declarative data and must
never be able to choose an executable, argument list, shell flag, working directory, or
environment override.** Only version-controlled, trusted code may produce an executable process
definition, and only that trusted code's own in-memory objects may reach `child_process.spawn`.

Concretely:

1. **`tools/test-console/lib/trusted-commands.js`** (new) is the *only* place spawn-authority
   values (`executable`, `args`) are constructed. It is keyed purely by command id — never by
   anything read out of a plan file — and stamps every hydrated command with a private
   `Symbol('lorerelay-test-console-trusted-command')` (`TRUSTED_MARKER`). A `Symbol` cannot be
   produced by `JSON.parse`, so a plan file can never forge trust the way it could forge a
   `"trusted": true` string field.
2. **`tools/test-console/lib/planner.js`** no longer computes `executable`/`args`/`command`
   itself. It only decides *which* trusted command ids are selected, with what `phase`,
   `category`, `reasons`, and (for a few rules) an `exclusiveGroup` override — all of which are
   scheduling/display metadata, not spawn authority. It looks up the human-readable `command`
   display string from the registry so plan files stay readable without becoming authoritative.
3. **`tools/test-console/lib/plan-trust.js`** (new) is the shared validation/hydration boundary
   used by *both* the CLI and the dashboard server (see below) — there is exactly one trust
   model, not two.
4. **`tools/test-console/lib/engine.js`** always spawns with `shell: false`, unconditionally
   refuses any `executable` ending in `.cmd`/`.bat`, and unconditionally refuses any command
   object that does not carry `TRUSTED_MARKER === true` — regardless of how it got there. This is
   the defense-in-depth layer: even a bug in the CLI/server hydration step could not cause the
   engine to execute an untrusted definition.

## Trusted registry design

`trusted-commands.js` exposes `hydrateTrustedCommand({ id, phase, category, reasons,
exclusiveGroup, workspaceWriter })` and rejects unknown ids outright (`Unknown trusted command
id: <id>`). The registry recognizes exactly these id shapes, matching the manifest already
shared with `npm test`:

| Id pattern | Executable definition |
| --- | --- |
| `test:<manifest file>` | `process.execPath` (or `python` for `.py` entries) running `scripts/<file>` directly |
| `full-suite` | `process.execPath` running `scripts/run_all_tests.js` directly — semantically identical to `npm test` (`"test": "node scripts/run_all_tests.js"` in `package.json`) |
| `boundary:webview-parity`, `boundary:i18n`, `boundary:version-consistency`, `boundary:utf8-docs` | Alias to the corresponding `test:<file>` manifest entry (already direct `node` execution, no change needed) |
| `boundary:compile` | `process.execPath` running the **trusted npm JS CLI** (`npm-cli.js`) with `['run', 'compile']` — never `npm.cmd` |
| `boundary:symbol-registry` | Same npm-CLI mechanism, `['run', 'check:symbol-registry']` |

The trusted npm CLI entrypoint is resolved by `resolveNpmCli()`: it prefers
`process.env.npm_execpath` (set by npm itself when available) and falls back to
`path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')` — the
same resolution `npm.cmd` itself performs internally, just invoked directly via
`process.execPath` instead of through the `.cmd` wrapper and `cmd.exe`. If neither candidate
exists on disk, `resolveNpmCli()` throws with a clear diagnostic rather than falling back to
`npm.cmd`, `cmd.exe`, or `shell: true` — confirmed by manually invoking `boundary:compile` and
`boundary:symbol-registry` end-to-end through the real engine during this repair (both exited 0).

`test-impact-rules.json`'s `compile` / `symbol-registry` boundary entries were stripped down to
`{ "id": ..., "category": "validate" }` — the `executable`/`args`/`command`/`timeoutMs` fields
that used to live in that JSON file were removed, since JSON config (even trusted,
version-controlled JSON) is no longer where spawn authority is allowed to live; that authority
now lives solely in `trusted-commands.js`'s `NPM_SCRIPT_BOUNDARIES` map.

## Plan-schema decision

The plan schema was bumped from `schemaVersion: 1` to `schemaVersion: 2`. A `schemaVersion: 2`
plan's `selectedCommands` entries are purely declarative: `id`, `command` (display only),
`category`, `phase`, `exclusiveGroup`, `workspaceWriter`, `reasons`. They never contain
`executable`, `args`, `shell`, `cwd`, or `env` — `validatePlanShape` in `plan-trust.js` treats the
mere *presence* of any of those five fields on a selected command as tampering and rejects the
plan outright, rather than silently ignoring them.

Old `schemaVersion: 1` plans (the format the candidate tip produced, where `executable`/`args`
were authoritative) are rejected with an explicit migration message:

> `Plan schemaVersion 1 is not supported (expected 2). Stale-schema plans predate the
> command-trust repair and are rejected rather than executed; regenerate the plan with the
> current Test Console CLI.`

No backward-compatibility shim was added for schemaVersion 1 — a stale plan cannot be
reinterpreted safely without also re-deriving trust for every field, which is exactly the
canonical-regeneration step already required for schemaVersion 2 plans, so there is no
meaningfully cheaper "safe" path for old plans than "regenerate a new one."

## Canonical regeneration behavior

`plan-trust.js`'s `loadTrustedPlan(planPath)` — the CLI's `run --plan` boundary — performs, in
order:

1. `JSON.parse` the file as untrusted data (catches malformed JSON explicitly).
2. `validatePlanShape` — schema version, required field types, and the forbidden-field check
   described above.
3. `assertRepositoryIdentity` — the plan's `repositoryRoot` must resolve to the real LoreRelay
   checkout; current `HEAD`, working-tree dirty/staged/untracked identity, package version, and
   current branch must all match what the plan claims; `baseSha` must be a real commit in this
   repository (`git cat-file -e`).
4. Regenerate a **canonical plan** via `makePlan()` using only the loaded plan's own
   `baseSha`/`headSha`/`mode` — i.e., the same trusted planner code runs again, against the live
   repository, from scratch.
5. `assertDeclarativeMatch` — compare `changedFiles`, `unknownFiles`, `requiresFullSuite`,
   `humanSmoke`, and every selected command's `id`/`phase`/`category`/`exclusiveGroup`/
   `workspaceWriter`/`reasons` between the loaded plan and the canonical one. Any difference
   throws, quoting both snapshots.
6. Only *then* hydrate the canonical plan's `selectedCommands` through
   `trusted-commands.hydrateTrustedCommand` and return that as the plan actually executed.

The loaded file is therefore never itself executed — even in the "everything matches" case, the
commands that run are the freshly hydrated canonical ones, not anything deserialized from disk.

The dashboard server's `/api/run` handler generates its own plan via `makePlan()` (never reads an
external file), but was changed to route that plan through `hydrateOwnPlan()` — the same
hydration call `loadTrustedPlan` uses internally — instead of handing planner output directly to
`ExecutionEngine`. This was a deliberate "do not maintain two trust models" choice even though the
dashboard's plan was never attacker-controlled JSON.

## Engine defense in depth

`ExecutionEngine.executeCommand` calls `assertTrustedExecutable(command)` before every spawn:

- Throws if `command[TRUSTED_MARKER] !== true` (catches a forged plain `trusted: true` field, or
  any command that reached the engine without going through the registry).
- Throws if `executable` is missing or empty.
- Throws if `executable` matches `/\.(cmd|bat)$/i` — unconditionally, even if the marker is
  present (a hydrator bug could never produce this today, since `hydrateTrustedCommand` itself
  also refuses `.cmd`/`.bat` definitions, but the engine does not trust the hydrator alone).
- `spawn(..., { shell: false, ... })` unconditionally — no platform/extension conditional
  remains.

## Adversarial test matrix

All of the following were added to `tools/test-console/test/test_console.test.js` and pass
(34/34 total, including all pre-existing regression tests):

**Plan tamper rejection** (each against a real fixture git repository, comparing a loaded plan to
a freshly regenerated canonical plan):
added `executable` field · added `args` field · swapped command id · changed `phase` · changed
`category` · base SHA moved forward to a real, different commit (hiding a changed file) · head SHA
no longer matches current HEAD · injected `changedFiles` entry · injected `unknownFiles` entry ·
changed `mode` · changed `version` · changed dirty-diff hash — **12/12 rejected**.

**Shell / metacharacter safety** — a disposable trusted Node fixture receives argv containing
plain text with spaces, quoted text, Japanese/Unicode text, a path with spaces, and the literal
strings `&`, `&&`, `|`, `||`, `>`, `<`, `^`, `%PATH%`, `(`, `)`. The child process writes
`process.argv.slice(2)` back out; the test asserts `deepStrictEqual` against the original array
and asserts no sentinel/redirect files (`SENTINEL.txt`, `SENTINEL2.txt`, `REDIRECT_POISON.txt`)
were created — **exact argv preservation confirmed, no second command, no redirection, no
environment expansion**.

**Rejection tests**: `.cmd` executable refused even when marked trusted · `.bat` executable
refused even when marked trusted · unknown trusted command id refused by the registry · forged
plain `"trusted": true` field refused by the engine (real `Symbol` marker absent) · stale
`schemaVersion: 1` plan with authoritative executable fields refused by the loader — **5/5**.

**Existing policy regression** (unchanged behavior, rerun): stale plan after HEAD/dirty change ·
exact-fingerprint resume · changed-fingerprint invalidation · repeated full-suite guard requires
`--allow-repeat-full-suite` + reason · timeout status honesty · live cancellation · webview/locale/
installer rule selection (including exclusive-group assignment) · unknown-file fail-closed ·
docs-only narrow plan · artifact generation (`plan.json`/`results.json`/`summary.md`/
`index.html`/logs) — **all pass**.

Server-level adversarial checks documented by the independent verifier (loopback-only bind, path
traversal 403, request body size cap, duplicate-run 409, stop→cancel) were not re-added as new
automated self-tests in this repair, since `server.js`'s only change was routing `/api/run`
through `hydrateOwnPlan()` before constructing `ExecutionEngine` — the request-handling code above
that line is untouched. These were re-verified conceptually by code review, not re-run as fresh
adversarial probes; see Known limitations.

## Focused validation results

Run from a clean worktree at the final repaired tip:

| Check | Result |
| --- | --- |
| `npm.cmd install` | PASS (0 vulnerabilities, 202 packages) |
| `npm.cmd run compile` | PASS |
| `npm.cmd run test:console:self` | PASS 34/34 |
| `npm.cmd test -- --list` | PASS; **Total entries: 251** |
| `node scripts/check_version_consistency.js` | PASS; version **1.82.4** |
| `node scripts/validate_utf8_docs.js` | PASS (1145 files) |
| Manifest order/uniqueness vs `main` | PASS — only `test_test_console.js` added; original 250 entries remain ordered and unique |
| Focused console plan (`--mode focused`) + run | PASS 3/3 (`validate_utf8_docs`, `check_version_consistency`, `test_test_console`); **no full-suite command in the plan**; unknown files: 0 |
| `boundary:compile` / `boundary:symbol-registry` manual engine invocation | PASS (exit 0), confirmed resolving to `process.execPath` + `npm-cli.js`, not `npm.cmd` |

Focused-run fingerprint: `561c5e7973aa5d0e69e707c3c4a94fbebe69b0a4828cc4a3a2f8c3e25687e2ee`.

## Full-suite result

Because the process-spawn path changed, one complete full-suite run was executed on the final
repaired tree via an `integration`-mode plan generated and run through the repaired CLI itself
(`node tools/test-console/cli.js plan --mode integration` → `run --plan`):

| Field | Value |
| --- | --- |
| Base | `08807d98234cada6d10ee194779d56202afa2fbd` |
| Target (final repaired tip) | `bf08601a9d7c7c9bed64f429a631f4bb3e202a0b` |
| Exit code | `0` |
| Manifest result | **251/251** |
| Failed scripts | `0` |
| Focused | 3/3 |
| Full suite | PASS |
| Unknown files | 0 |
| New fingerprint | `10b28786e10bd35f4694ecb1e4fdd71a97a1a33b575a0510c52564716f3ef30e` (distinct from the candidate's prior `940ab85ac30f0b9c820a7585fba69f1dee46b07fbcb3ea86f0914a832bace77b` — not reused) |
| Artifact directory | `C:\AI\wt-lorerelay-test-console-001-command-trust-repair\.test-runs\2026-07-13T21-29-20-568Z-bf08601a` |
| Artifacts present | `plan.json`, `results.json`, `summary.md`, `index.html`, per-command stdout/stderr logs, `full-suite.stdout.log` / `full-suite.stderr.log` |
| `full-suite` command as recorded in `plan.json` | `executable: "C:\Program Files\nodejs\node.exe"`, `args: ["...\\scripts\\run_all_tests.js"]` — direct Node execution, no `npm.cmd`, `.cmd`, `.bat`, `cmd.exe`, PowerShell command string, or `shell: true` anywhere in the chain |

This full-suite run was executed exactly once, on a fresh fingerprint, per the "do not repeatedly
run the full suite on the same fingerprint" requirement.

## Changed files

```
tools/test-console/cli.js                    |   6 +-
tools/test-console/lib/engine.js             |  22 ++-
tools/test-console/lib/plan-trust.js         | 187 +++++++++++++++++
tools/test-console/lib/planner.js            |  77 +++----
tools/test-console/lib/server.js             |   6 +-
tools/test-console/lib/trusted-commands.js   | 161 +++++++++++++++
tools/test-console/test-impact-rules.json    |  15 +-
tools/test-console/test/test_console.test.js | 250 +++++++++++++++++++++-
```

No `src/**`, webview product, installer, locale, gameplay-sim, economy, or live-data files were
touched. `docs/ai-tasks/LORERELAY-TEST-CONSOLE-001.md` (the original candidate report) was left
unmodified; this document is a new, separate file.

## Known limitations

- Server-level adversarial checks (path traversal, body-size cap, loopback bind, duplicate-run
  409, stop→cancel) were not re-run as fresh automated probes in this repair pass, since the
  server's request-handling code was not touched — only the `/api/run` handler's construction of
  `ExecutionEngine` changed. An independent re-verifier should still re-confirm these, since they
  are part of the same trust surface conceptually.
- `resolveNpmCli()`'s fallback path assumes npm is installed alongside `node.exe` (true in this
  environment: `C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`). Environments where npm
  lives elsewhere and `npm_execpath` is not set (e.g., a bare `node cli.js` invocation with a
  non-standard global npm install) will fail closed with a diagnostic rather than silently
  falling back to `npm.cmd` — this is the intended fail-closed behavior, not a gap, but it means
  `boundary:compile`/`boundary:symbol-registry` require a discoverable npm installation.
- The adversarial metacharacter matrix was exercised through a disposable Node fixture, not
  through every possible manifest command; this mirrors the independent verifier's own
  limitation note and is considered sufficient because `shell: false` is now unconditional for
  every command, not command-specific.
- `tools/test-console/lib/preflight.js` still probes `npm.cmd --version` via `spawnSync` without
  `shell: true` for informational preflight data only (not part of the test-execution path); this
  was left untouched as out of scope — it is read-only version-probing, not command execution
  driven by plan content, and was not flagged by the independent verifier.

## Version decision

`package.json` version remains **`1.82.4`** — unchanged. This repair is tooling-only and does not
warrant a version bump per the same reasoning the original candidate and its verifier applied.

## Untouched-surfaces confirmation

| Surface | Status |
| --- | --- |
| `main` | Untouched; still at `08807d98234cada6d10ee194779d56202afa2fbd` (verified via `git rev-parse main` at the end of this task) |
| Frozen Relay candidate `task/HUMAN-SMOKE-RELAY-BANNER-RECOVERY-001` | Untouched; still at `9e304d7188e2e0c61852e204879bf1580f5e3415` |
| Installer / installed extension / live world / campaign data | Not operated on |
| Independent verifier branch/report | Not modified |

## Independent re-verification requirement

This repair should not be merged to `main` without an independent adversarial re-verification
covering: the full plan-tamper matrix reproduced against a separately constructed fixture, the
metacharacter/argv-preservation matrix reproduced independently (not just rerunning this repair's
own self-tests), confirmation that `resolveNpmCli()` cannot be tricked into resolving a
non-canonical npm entrypoint, and a fresh look at the server-level checks noted above under Known
limitations.
