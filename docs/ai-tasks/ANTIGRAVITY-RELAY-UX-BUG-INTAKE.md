# Antigravity Relay UX Bug Intake

Date: 2026-07-07 JST
Source: user live playtest screenshot / Antigravity workflow
Status: `CONFIRMED_BUG_INTAKE`

## Problem

When the user drives LoreRelay through Antigravity, the normal LoreRelay Web UI becomes misleading noise.

Observed screen state:

- LoreRelay Web UI still displays normal input, option buttons, and `GM processing` state.
- Antigravity is the actual active channel that receives/produces the turn result.
- Typing or clicking in LoreRelay's own UI is not the useful action path for this workflow.
- Therefore the in-app waiting spinner, action buttons, and input affordances become confusing rather than helpful.

The user summarized the issue as:

> If actions cannot be taken from LoreRelay itself while using Antigravity, the LoreRelay-side UI is mostly noise. LoreRelay needs a format that sends the relevant turn/request/result toward Antigravity instead.

## Product interpretation

This is not a gameplay-design failure and not a Slice 1 bug.

It is a **relay-mode UX boundary bug**:

```text
Normal LoreRelay UI assumes LoreRelay is the active action executor.
Antigravity workflow makes Antigravity the active executor/editor.
The UI does not visually switch roles.
```

## Desired behavior

LoreRelay should provide a clear `External Agent / Antigravity Relay Mode` where the Web UI becomes a source of structured context and copy/send payloads, not a competing action surface.

Possible v0 behavior:

1. Hide or disable normal chat input / option buttons while relay mode is active.
2. Replace `GM processing` with a clear external-agent state, e.g. `Waiting for Antigravity result`.
3. Show one compact payload panel:
   - current turn prompt/request;
   - selected options if any;
   - minimal world state needed;
   - target output file / expected result path if applicable.
4. Provide copy/export actions for Antigravity:
   - copy prompt;
   - copy JSON payload;
   - open/save `turn_request.json` / `turn_result.json` style files.
5. Make the allowed action path visually explicit:

```text
LoreRelay displays/export context
→ Antigravity edits/runs/apply result
→ LoreRelay imports/observes result
```

## Non-goals

Do not solve this by adding more normal UI buttons.
Do not make the UI pretend the local LoreRelay input can drive the turn if Antigravity is the active executor.
Do not couple this to Gameplay Slice 1.
Do not add new gameplay mechanics.

## Why this matters

For AI-assisted development/playtesting, the player needs one active control surface.

Two surfaces showing action affordances at the same time creates false agency:

```text
UI says: click/type here
actual workflow says: use Antigravity
```

That mismatch makes live playtest noise worse and can invalidate feedback about the actual game loop.

## Proposed next gate

Create a narrow UX/design gate for:

```text
ANTIGRAVITY-RELAY-001
External Agent Relay Mode / Payload Panel
```

Recommended owner:

```text
Claude Sonnet High — UX gate
Codex 5.5 High — implementation after gate
```

## Verdict

`ANTIGRAVITY_RELAY_UX_BUG_CONFIRMED`
