# Action Recorder V1

Risk: High. Base `f5be03c7e67709414177c4dbf3f87afd9a57b1b1` (#102).
Architecture remains Automation Control Plane V1. Human Play is unperformed and
not replaced; the owner authorized Recorder before Human Play.

Use the normal campaign command palette:
- LoreRelay: Commerce録画を開始
- LoreRelay: Commerce録画を停止
- LoreRelay: Commerce録画テンプレートを出力

The status bar indicates active recording and can stop it. Recording starts stopped,
does not resume after reload, stops on workspace change, and stops/notifies at 100
operations. Export stops recording and uses a user-selected JSON destination.

The shared service captures observers when admitting a new request and invokes only
still-subscribed observers after settlement. Duplicate requests do not emit another
event. A stopped/restarted observer cannot inherit in-flight work. Observer errors
and mutation of event copies cannot change gameplay receipts. The Recorder accepts
only human-player results in its selected workspace and performs no canonical write.

Records contain the three Commerce action IDs, whitelisted normalized public
parameters, classification and whitelisted numeric results. Campaign IDs become
reference aliases. Unknown references preserve no original identity. Free text,
request IDs, confirmation handles, internal witnesses, workspace paths and arbitrary
result metadata are not serialized. Partial/unknown/rejected results require manual
review and produce no automatic execution steps.

## From template to registered fixture

The exported `lorerelay-action-template/1` document is explicitly non-executable.
`resolveRecordedActionTemplate` is an offline pure helper: supply the template,
a candidate catalog ID and explicit reference bindings when unresolved. It accepts
only values in the existing merchant fixture and rejects uncertain outcomes. It
rebuilds the existing preview/execute/wait_receipt/assert_receipt vocabulary, ignoring
editable template steps. Resolution does not register or run the candidate.

Review the candidate, add its JSON under `scripts/action_scenarios`, and explicitly
add the fixed catalog entry in `run_action_scenario.js`. The CLI accepts catalog IDs
only; it never accepts an arbitrary template/workspace path. `recorded_merchant_v1`
is an explicitly registered example from the tested human Commerce recording. The
runner maps request aliases to fresh UUIDs per replay while preserving exact duplicate
semantics within a run. It always obtains fresh previews and confirmations.

No live campaign snapshot is copied. Matching a public ID to a known fixture is a
template binding, not evidence that the original campaign state is reproduced.
Test Console initially passed 24/24, focused 21/21. Tests cover sanitation, explicit
recording boundaries, unknown references, uncertain outcomes, 100-operation stop,
registered replay, fresh IDs and equal gameplay with/without a Recorder. Final
independent review, suite and integration evidence is recorded in the PR.

PR #103 independent review completed without findings. CI exposed the existing
command-palette localization contract, which the initial focused selection missed.
The repair uses package NLS keys in all four bundles and adds command palette gating
to the Recorder impact rule. The targeted gating check passes. Final evidence is
recorded on the PR rather than requiring a post-verification code change.
