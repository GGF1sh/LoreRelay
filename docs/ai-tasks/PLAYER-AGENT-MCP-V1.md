# Player Agent / MCP V1

Risk: High. Base `c0069dcce4fc5652c2290488d6e474cc50af7c68` (#103).
The confirmed Automation Control Plane architecture is unchanged. Human Play is
unperformed and not replaced; the owner authorized these slices before Human Play.

## Connect a normal campaign

Use the command palette's LoreRelay Player Agent start command. Select the allowed
Commerce operations and 1–100 new execute admissions (default 10). The Host creates
a single-use local connection configuration in the LoreRelay Agent Connection output
channel; the optional copy button copies that configuration to the clipboard.
Configure an external MCP client with it. The Host then displays the actual client
session and campaign for explicit approval. Waiting connections expire in five
minutes; approved delegation expires after 30 minutes. Starting another connection
revokes the previous connection of that role. The stop command revokes delegation.

The configuration invokes Node directly with `out/playerMcp.js`. Node 20 or newer
is required. Do not wrap it in `npm run`, whose banner would pollute stdout. The
official TypeScript MCP SDK owns standard stdio framing and tool schema validation.
Normal logs never go to stdout. The runtime SDK, core and Zod are included in the
extension package; the standard client SDK is only a test dependency.

The five tools are `read_player_view`, `query_available`, `preview`, `execute`, and
`wait_receipt`. They delegate to the existing Commerce service. The Host owns the
workspace, campaign, principal, allowed actions, remaining admissions and expiry.
Transport arguments cannot manufacture any of those authorities. Read and preview
do not consume an execute admission. New well-formed execute requests consume one,
including stale/busy/rejected requests; exact request retransmission consumes none.
Reusing a request ID with different arguments is invalid. After exhaustion, reads,
previews and receipt queries remain available until revocation/expiry.

Preview alone does not approve a handle. Execute checks live delegation, then uses
the shared service's caller/scope/epoch/quote/witness/expiry-bound opaque handle.
Stop, disconnect, reload and workspace changes revoke pending authority. Revocation
does not cancel a started mutation or forcibly release the shared workspace gate.
Committed experience-profile transitions synchronously stop both connections, so
an idle Campaign → Parlor/In-World → Campaign round trip cannot revive a delegation.
No uncertain, partial, stale or busy result triggers automatic replay. A transport
timeout is `outcome_unknown`; query its receipt while the same session remains live.

Windows uses a random named pipe. Unix uses a private temporary directory and socket
with modes 0700/0600. A per-connection secret precedes the Host approval prompt; the
server session binds subsequent requests and responses. The endpoint accepts fixed
tool envelopes, never arbitrary commands, paths, shell, JavaScript or role changes.

## Separate authorities and evidence

The Narrator start/stop commands create an independently approved read-only connection
to `out/narratorMcp.js`. Its only tool is `read_committed_facts`, returning the same
published committed Player projection. It exposes no action or role-switch tool.
QA remains the isolated fixture CLI from Slice 2, with no Player-accessible QA tool.
Reading QA information in an AI conversation invalidates any claim that subsequent
Player actions in that same conversation demonstrate fair Player-only behavior.

`test_player_agent_mcp.js` uses the official standard stdio client against a spawned
adapter and production Commerce fixture service. It covers all three actions,
duplicate receipts/admission accounting, limits, denial, hidden-state exclusion,
caller-handle isolation, stale/busy results, expiry/epoch/workspace revocation and
partial/unknown deduplication. These are Node fixture integration checks, not Human
Play or evidence of clicking the normal Host approval UI. The separate Live Extension
QA workflow retains real Extension Host lifecycle/MOD/DOM checks on Windows and Linux.
Final focused, independent review, suite and exact-head/post-merge CI evidence is on
the PR.
