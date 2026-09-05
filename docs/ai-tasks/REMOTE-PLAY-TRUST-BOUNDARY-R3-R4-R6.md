# Remote Play trust boundary R3 / R4 / R6

Date: 2026-09-05 JST. Risk: **High** (authentication, remote access, security boundary).
Exact base: `0024cd7b7cfdf5db3332927456090c59ef363445`.

## Repair

- R3: independent random player and spectator credentials bind roles on the server. Query/message role hints cannot authorize input. Rotation replaces both credentials and disconnects existing clients.
- R4: reject non-object JSON, arrays, and non-string message types before authorization/dispatch. A terminal socket message catch contains unexpected failures. Error logs never interpolate exceptions or credentials; the 4000-character limit remains.
- R6: cache typed logical media references, materializing fresh signed URLs for broadcasts and authentication. URLs carry opaque IDs, with filesystem paths confined to a server-owned registry. A separate media signing key rotates with credentials. TTL/signature verification and filesystem allow-list checks remain enforced. The registry lasts for the server session and is cleared on stop, preserving already issued URLs until expiry/rotation.
- Report the OS-assigned loopback port so the existing HTTP/WebSocket seam can use port 0. No UI change, dependency, or network framework.

## Evidence

The user's 2026-09-05 GPT-6 Pro R3/R4/R6 reproduction is reused as independent pre-repair review. No additional review AI or subagent.

Test Console plan inspected after the repair. Existing server tests lacked the reported adversarial cases, so those cases were added there. The existing WebSocket spectator test now uses the spectator credential while claiming player.

`npm run test:run -- --plan .test-runs/plans/2026-09-05T11-50-04-792Z-0024cd7b-verify.json`: **PASS**, 8 commands, 0 failures/skips. Includes compile, focused R3/R4/R6 loopback regressions, existing WebSocket max-client/input-lock/cooldown/GM-busy/game-over/oversize regressions, validation, and registry checks.

Focused coverage includes player input, spectator escalation and input denial, both old credentials rejected after rotation, malformed JSON/shapes/types before and after auth, unexpected dependency failure at the socket boundary, secret-free logs, live/late/reconnect/current-key media requests, expiry and old-key rejection, credential/signing-key separation, wire path redaction, and filesystem revalidation.

`npm test` on executable commit `a95b4ee2302cf2a207084167805085b24601369a`: **PASS, 344/344**, including 16 combat groups / 736 tests, 0 failures, 164.7 seconds. Executed exactly once; subsequent changes to this record are documentation only. Log: `.test-runs/full-suite.log` in the task worktree. This includes unchanged signature verifier, media-path validation, and map FoW coverage.

GitHub integration: [PR #98](https://github.com/GGF1sh/LoreRelay/pull/98). Exact-head and post-merge CI are checked live as part of Standard Close; the final task response reports their exact SHAs and results. Full suite was required by the High risk policy even though the Console's inferred plan did not request it.

## Scope and close

R1/R2/R5, MOD cleanup, gameplay, and UI are excluded. Original dirty checkout and existing worktrees are preserved. No Computer Use.

Standard Close is authorized by the task. Merge requires exact-head CI success, no requested changes/conflicts, no dangerous base/head movement, and completion of any naturally started automatic review.
