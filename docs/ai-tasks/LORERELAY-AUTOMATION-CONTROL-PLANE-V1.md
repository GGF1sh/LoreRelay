# LoreRelay Automation Control Plane V1

Status: accepted architecture; implementation tracked in [Commerce Slice 1](GAME-ACTION-DRIVER-V1-COMMERCE.md).
Architecture verdict: `AUTOMATION_CONTROL_PLANE_V1_ARCHITECTURE_CONFIRMED_WITH_REFINEMENTS`.
Base: `32529df244937f3858064a6ecd2c0785eb8ed9ab`.

## Contract

Human Webview, a future Player Agent, and the fixture Scenario Runner share a small
Game Action application service. It owns authorization, request matching, the existing
workspace mutation gate, commit-time revalidation, canonical execution, persistence
confirmation and typed receipts. Existing pure cores remain the mechanics owners.
Presentation and confirmation interaction remain in the Webview adapter. QA inspection
is a separate information plane, never another game executor or a universal debug flag.

External requests contain only actionId, requestId, parameters, optional
expectedActionSetHash and confirmationToken. Unknown fields are rejected. Trusted
principal, capabilities and workspace identity come from internal session factories;
JSON cannot create them. Caller sessions, campaign identity, timeline epoch and
authorization generation remain internal.

The public actionSetHash hashes only the projected action list, parameter schemas,
selectable targets, public availability/quotes and public permissions. Hidden-only
changes that leave this projection unchanged do not alter this hash. Canonical
fingerprints and authorization/timeline witnesses stay inside the Host. The public
hash is neither a credential nor a proof of the whole state.

Preview reads a snapshot and invokes existing mechanics on copies. It must not write
canonical state, advance gameplay RNG, reserve/consume resources or commit a receipt.
An ephemeral opaque handle may be issued. It binds caller, workspace/campaign/epoch,
action version, normalized parameters, quote, internal witness, authorization and
expiry. Receiving a preview does not grant consent. The adapter must separately record
the user's confirmation of that handle. Player Agent confirmation requires delegated
gameplay authority. Content hashes and external `confirmed: true` are not credentials.

QA scripted confirmation is interpreted only inside the runner, for a catalog-owned
fixture in a runner-created workspace, under a trusted QA session, and only for an
action that permits it. It cannot grant adult content permissions. Adult visibility,
payload read, package approval and session permission remain separate requirements.

Receipts distinguish rejected_invalid, rejected_busy, rejected_stale,
rejected_forbidden, committed, committed_partial, outcome_unknown and
committed_with_warning. Admission, commit status, public result and QA diagnostics are
separate. A secondary publication or refresh failure does not erase a successful
canonical commit. Partial or unknown results must not be retried automatically.

Replay is host-session-bounded, not durable exactly-once. Matching includes workspace,
caller, campaign/epoch, action, request ID and normalized parameters. Exact duplicates
return the existing authorized result; changed payloads under the same request ID are
rejected. Retention expiry/restart does not establish non-execution. Waiting timeout
is not cancellation and never releases a live mutation gate. There is no distributed
process lock or generic transaction framework in V1.

## Information and tools

Player Agent receives a closed player view, public actions, preview and its own
receipts. Hidden targets must not leak through IDs, schema enums, reason strings,
hashes or internal event counts. Public reasons such as insufficient credits may be
specific. Narrator receives only a separate projection of committed narration facts.

QA may inspect validated fixture game state and enumerated gameplay ledgers, receipts
and diagnostic witnesses. It may not read arbitrary paths, provider credentials,
unrelated user data or unauthorized adult payloads. Read-only inspection must not
invoke recovery/open handlers. A model session that has read QA state cannot become a
fair Player Agent by changing its role label; sessions and tool sets must be separate.

## Delivery sequence

1. **Commerce Action Driver:** shopkeeper trade, market travel and end day; shared
   production service; fixture-only linear JSON runner. High Risk.
2. **Live Extension QA:** isolated Host lifecycle, checkpoint 1.3 round trips and later
   MOD/semantic UI integration in bounded PRs. Host-sent intent and actual rendered
   control state are distinct evidence. Checkpoint 1.3 covers complete game state and
   its enumerated seven ledgers; legacy checkpoints/Undo do not inherit that guarantee.
3. **Action Recorder:** sanitized fixture templates; never reusable consent tokens,
   arbitrary text, secrets or raw adult metadata.
4. **Player Agent/MCP:** thin player adapter with separate QA/Narrator tool sets;
   no new gameplay implementation or implied durable replay guarantee.

Slice 1 excludes Combat, MOD/checkpoint/Story GM automation, live IPC, semantic Webview
snapshots, Recorder, MCP, a Player Agent runtime, arbitrary campaign CLI, arbitrary
filesystem/shell/JS, a generic plugin framework, and repurposing Remote Play or Test
Console HTTP as a game-control bridge.

## Verification and authority

The owner explicitly permits Slice 1 before Human Play for this task. Human Play is
neither complete nor replaced by automation. Follow
[Development Verification Policy](../DEVELOPMENT_VERIFICATION_POLICY.md): Test Console
plan first, focused tests, one independent implementation review, at most one concrete
repair and its verification, one full suite on the final unchanged executable tree,
exact-head CI, eligible Standard Close, then post-merge main CI. The architecture
review does not count as implementation review.
