# EXTERNAL-AGENT-001 — Antigravity UX / Relay Intake

Date: 2026-07-07 JST
Status: CONFIRMED
Severity: P1
Priority: Critical for Antigravity-based playtesting
Source: user-observed live workflow + screenshot
As-of main: `b4ad9d6234974b62f081441f49f4fa01aad969ad`

## Product failure

LoreRelay currently behaves like the active GM front-end while Antigravity is the actual GM executor.

Observed live state:

```text
Antigravity side
→ user sends choice / text there
→ Antigravity produces GM output
→ Antigravity edits turn_result.json

LoreRelay side
→ still shows GM processing timer
→ still shows option buttons
→ still shows free-text input / Send
→ those controls do not reach Antigravity in the tested flow
```

This is worse than visual clutter.

It creates false affordances and split-brain ownership of the turn.

A user can reasonably believe an action submitted from LoreRelay has reached the active GM when it has not.

## Immediate playtest consequence

Gameplay Slice 1's 30-minute playtest is blocked for the user's current Antigravity workflow until the transport / ownership problem is made honest.

The Slice 1 gameplay implementation itself remains verified.

This blocker is about the surrounding GM execution surface.

## Required product distinction

LoreRelay needs an explicit execution mode / provider ownership distinction.

### In-app GM mode

LoreRelay owns:

- user input;
- option submission;
- provider invocation;
- processing state;
- response rendering.

Existing chat affordances may remain interactive.

### External Agent mode

Antigravity or another IDE agent owns the AI turn.

LoreRelay should become:

- world / state surface;
- deterministic action surface;
- turn-request producer;
- result observer / receiver.

It must not pretend to be the provider transport.

## V0 UX contract

When External Agent mode is active:

### Hide or replace false affordances

Do not show an in-app provider-owned `GM is processing...` bubble.

Replace it with an honest external state, for example:

```text
External GM: waiting for result
```

or no transient bubble at all.

Do not leave option buttons, free-text input, or Send controls wired to a path that cannot reach the active agent.

### Preserve useful surfaces

Keep:

- transcript / accepted history;
- world state;
- map;
- checkpoints;
- dice / tools that actually execute locally;
- deterministic NOAI actions;
- result receipts.

The transcript may be visually compacted because the external agent already renders a parallel conversation.

### Route every AI-mediated action through one relay contract

The following should share one external request path:

- free-text player input;
- selected GM option;
- map / world action that requires AI interpretation;
- author note if included in the next turn.

Conceptual shape:

```text
LoreRelay action
→ ExternalAgentTurnRequest
→ adapter / relay
→ Antigravity
→ external result
→ turn_result.json / accepted result path
```

Do not create separate ad-hoc bridges for each button type.

## Transport reality

Do not claim direct Antigravity submission until an actual supported command / API is verified.

The implementation gate must first determine which of these is real:

### Option A — Supported Antigravity command / API

Preferred if available.

LoreRelay invokes the external agent through a stable supported interface.

### Option B — Clipboard + focus handoff

Honest fallback:

```text
button click
→ build request text / packet
→ copy to clipboard
→ focus external-agent pane if possible
→ user pastes / submits
```

This is not full automation but is materially better than a dead Send button.

### Option C — File-based request handshake

LoreRelay writes a stable request artifact such as:

```text
.lorerelay/external-agent/request.json
```

with:

```text
requestId
turnId
playerText / selectedOption
authorNote
context references
createdAt
```

An external agent may read it and produce the normal result artifact.

Do not assume Antigravity continuously watches this file unless that behavior is explicitly configured and verified.

## Important authority rule

External Agent mode does not change state authority.

```text
External agent proposes / writes a result
→ LoreRelay validates / accepts through existing boundaries
→ canonical state changes only after accepted processing
```

The external agent must not gain direct canonical authority merely because it runs in the IDE.

## Scope for next Gate

The next task is not implementation yet.

It should audit:

1. how LoreRelay currently detects / invokes providers;
2. which webview controls dispatch local GM turns;
3. which controls are deterministic local actions;
4. how Antigravity currently produces `turn_result.json`;
5. whether Antigravity exposes any supported VS Code command / API for chat insertion or submission;
6. the minimum mode switch needed to prevent false affordances;
7. the smallest honest relay transport available now.

## Out of scope

- redesigning the whole chat UI;
- changing Gameplay Slice 1 mechanics;
- adding a new canonical action authority;
- scraping or simulating keyboard input as a hidden automation hack;
- assuming unsupported Antigravity internals;
- auto-submitting without a verified interface.

## Integrator verdict

`EXTERNAL_AGENT_RELAY_GATE_REQUIRED`
