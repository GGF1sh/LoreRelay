# Live Extension QA Bridge V1

Risk: High. Architecture: [Automation Control Plane V1](LORERELAY-AUTOMATION-CONTROL-PLANE-V1.md).
Base: `30b766b03a7b89fbdf8dcd3bdee05a127b80f825` (Commerce Slice 1, PR #100).

The owner authorized Slice 2A, 2B, Recorder and Player Agent/MCP as sequential PRs,
each proceeding only after its predecessor's merge/main CI. Human Play remains
unperformed and is not replaced. Implementation stays GPT-6 Astra / High.

## Slice 2A: Host lifecycle

`npm run qa:live` runs only the catalog-owned `lifecycle_v1` fixture. The runner owns
the temporary workspace, user-data and extensions directories, and starts a real
Extension Development Host. It uses the official VS Code test SDK to acquire pinned
VS Code 1.136.1; a trusted operator may set `LORERELAY_QA_VSCODE` to an installed binary.
The runner manages the process directly because the Extension Tests launcher treats
a window reload as test termination. No shell is used to launch the binary.

The fixture marker activates the extension; it does not grant QA authority. The
bridge additionally requires development/test mode, a per-launch secret, a matching
runner-owned manifest under the temporary root, and a mutual IPC handshake. Normal
production activation has no QA endpoint. Windows named pipes and Unix sockets are
private launch endpoints, unrelated to Remote Play and Test Console HTTP.

The closed operation vocabulary covers player view/actions/preview/execute/receipt,
read-only inspection, checkpoint list/save/restore, panel reopen, window reload and
owned-host stop. Requests are session-bound and reject unknown fields/operations.
No role/path/command/JS input exists. Commerce uses the production shared service.
Checkpoint handlers return their result to QA and keep their existing human callers;
save uses the workspace gate and restore retains the existing timeline/gate owner.

Inspection reads only game_state and the seven existing snapshot ledgers. It does
not call recovery/open handlers. Checkpoint restoration compares complete game
content and all enumerated ledger presence/values; stateRevision is separately
required to advance by one because restore is a new canonical publication.
Reopen/reload must preserve the restored revision as well as content. Reload creates
a new Host session and cannot make an old confirmation safe to replay.

## Evidence

- Test Console first: 24/24 passed, 21 focused tests, no unknown files (initial tree).
- Windows actual Host lifecycle passed: trade/duplicate receipt, travel, end day,
  read-only preview, checkpoint restore, old-epoch rejection, reopen, reload and
  old-session rejection. Reload changed Host PID 12648 → 55876.
- Three initial integration attempts exposed path casing, overlapping bootstrap
  opens and an incorrect revision equality assertion. The owner instructed continued
  work. These were resolved; the Extension Tests reload limitation was then isolated
  and the runner changed to own the Development Host lifecycle. No stub/Chromium-only
  fallback is claimed as live Host evidence.
- Final focused, review, full-suite, exact-head and merge/main evidence belongs in
  this slice's PR. A dedicated CI matrix runs the real lifecycle on Ubuntu and Windows.

## Remaining sequence

PR #101 independent review completed at `a15b8a9` with three P2 findings. One repair
pins official SDK 2.5.2 (Node >=16, compatible with existing Node 20 CI), includes
download/spawn setup in cleanup, and terminates/awaits only an unconnected owned
Host after startup failure. Once connected, a timeout remains non-cancelling and
retains the fixture/Host rather than interrupting a canonical mutation.
Failure-worker regression proves prompt exit, closed IPC and owned-directory cleanup
for download failure and missing handshake. Windows normal lifecycle also passes.
Repair Test Console: **24/24 passed**, focused **21/21**, zero unknown files;
fingerprint `8933877366e445b5b7df91118c705e026becb4823fab1a61158e7b4dba17b64d`.

2B adds synthetic MOD fixtures and separately correlated Host/rendered semantic
state with fixed-control UI actions. Recorder follows with explicit recording and
sanitized fixture templates. Player/MCP follows with explicit campaign pairing,
bounded delegation and separate player/QA/narration information planes. None of
these later interfaces is part of 2A.

## Slice 2B: MOD Manager and actual rendering

Base: `224598d5960cea11f46d965a1845fcd4c4d13ee8` (#101, both post-merge workflows passed).
The fixed `mods_v1` catalog creates only synthetic general/adult manifests in an
empty isolated workspace. The runner uses the same real Development Host and now
also isolates VS Code's shared-data directory. IPC listener startup is inside the
owned cleanup region (the deferred #101 P2).

Host inspection returns a detached copy of the last public MOD Manager publication;
it does not discover, initialize or recover. A separate real-Webview probe reports
visibility, selected locale, enabled controls, package rows, preview and notice.
Host session, panel generation, probe ID and public publication revision correlate
responses. Missing, replaced or not-yet-rendered panels are explicitly unconfirmed.
Fixed click/select controls invoke normal DOM events. Adult visibility/approval,
arbitrary selectors, JavaScript, command names and paths are not exposed.

The real Host exposed a production empty-campaign mismatch: opening the panel lists
characters and creates an empty `characters` directory, which MOD eligibility rejected.
Only an ordinary empty characters directory is now accepted; any content still
requires a campaign fork. Unit coverage checks both sides and detached inspection.

Windows actual Host passed Safe Mode recovery, resolve/apply, enable/disable,
adult denial and metadata redaction, DOM/Host agreement, panel reopen/generation,
locale selection and reload consistency. Initial real-host attempts exposed a
collapsed header menu and the empty-directory mismatch; the owner's additional
repair/continuation authorization was used to resolve both. No fake renderer is
claimed as real Host evidence. Final focused, independent review, full-suite and
integration evidence is recorded in the 2B PR. Human Play remains unperformed.
