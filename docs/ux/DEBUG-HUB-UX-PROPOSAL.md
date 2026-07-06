# Debug Hub UX Proposal

Source: Claude Sonnet 5 UX exploration, 2026-07-06.

## Chief Disposition

Useful design artifact, but it drifted from the requested Playable Milestone visual pass into DEBUG-UX-001 / QA tooling architecture.

Disposition:

- KEEP as DEBUG-UX-001 design input;
- do not treat as Playable Milestone UX implementation;
- do not implement Phase 2-4 yet;
- Phase 1 lane split may proceed independently if limited to Webview presentation only.

## Core UX Proposal

Reorganize the current Inspector surface into three lanes:

- Timeline: Git Timeline, Chronicle, Replay Export
- Debug: Prompt Context, Context Inspector, Debug Trace, Bulk Sim, Living World market debug
- QA: future QA Runner UI

The proposal preserves existing Inspector and Debug Trace behavior and changes entry/navigation structure first.

## Strong Findings

1. Current Inspector mixes player-facing history tools with developer diagnostics, making orientation difficult.
2. Context Inspector and Debug Trace are visually disconnected and lack a shared turn/run identity.
3. Existing QA core should remain aligned with current types:
   - run mode: `quick | full | benchmark`
   - determinism: separate configuration axis, not a fourth run mode.
4. Future Webview exports should follow the existing host-mediated pattern:
   - Webview postMessage
   - extension host performs filesystem write
   - result message returned to Webview
5. Headless AI handoff may later use short Markdown reports plus full JSON data.

## Deferred Architecture

Do not implement yet:

- `turnId` / `runId` contract changes;
- new QA host command;
- QA/debug report exporters;
- `.bat` headless QA/debug entry points;
- cross-lane Context Inspector ↔ Debug Trace jump logic.

These require separate host/runtime tasks and may conflict with current prompt/runtime stabilization work.

## Safe Immediate Slice

Phase 1 only:

- add Timeline / Debug / QA lane navigation inside Inspector;
- move existing sections under those visual containers;
- keep existing message handlers and capabilities unchanged;
- QA lane remains a clearly marked placeholder only;
- no backend, command, state, prompt, or runtime contract changes.

## Relation to DEBUG-UX-001

This proposal is accepted as design input for `DEBUG-UX-001`, not as completion of that task.
