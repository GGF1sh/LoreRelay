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

2B adds synthetic MOD fixtures and separately correlated Host/rendered semantic
state with fixed-control UI actions. Recorder follows with explicit recording and
sanitized fixture templates. Player/MCP follows with explicit campaign pairing,
bounded delegation and separate player/QA/narration information planes. None of
these later interfaces is part of 2A.
