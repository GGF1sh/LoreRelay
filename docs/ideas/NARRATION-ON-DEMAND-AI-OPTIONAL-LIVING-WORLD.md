# Narration on Demand / AI Optional Living World

Status: IDEA NOTE
Date: 2026-07-06 JST
Origin: user idea + ChatGPT 5.5 discussion

## Core idea

LoreRelay should not require an AI call for every action.

The world can continue through deterministic systems, while AI participates only when narrative meaning, dialogue, interpretation, or scene writing is desired.

Conceptual shift:

> AI drives the world

becomes:

> The world can run on its own; AI gives it voice, meaning, dialogue, and narration when needed.

This is not a replacement for AI-GM play. It is an additional participation policy.

## User-facing policy candidates

Internal working name: `NarrationPolicy` / `AI Participation Policy`

Possible modes:

- Always — AI for every meaningful action
- Important Events — AI only for conversations, battles, major incidents, milestones, important arrivals
- On Demand — AI only when the user explicitly requests narration or dialogue
- Simulation Only — deterministic play with no AI call

Possible labels:

- 常時ナレーション
- 重要場面のみ
- 呼んだ時だけ
- シミュレーションのみ

Preferred product-facing name: **Narration on Demand**

Other possible names:

- Quiet Mode
- Simulation Mode
- Low-Token Mode

Avoid presenting this primarily as `NOAI Mode`; the point is not that AI disappears, but that it stays silent until useful.

## Example play loop

Routine play without AI:

- buy goods
- sell goods
- travel
- inspect market prices
- manage a base
- review guild work
- advance world simulation
- NPC agency progresses
- faction relations change

Deterministic path:

`Player Action -> Deterministic GameAction -> Canonical Commit -> Event Receipt`

Later, when the user requests:

- describe the last two days
- talk to an important NPC
- narrate entering a new city
- explain a battle
- summarize today's journey

LoreRelay can send selected history and current context to AI:

`Relevant Event Receipts + Current State + Context -> AI Narration`

## Why this fits LoreRelay

This aligns with existing architectural principles:

- Mutation != Narration
- Canonical State != Causal Input
- Query/Preview != Mutation
- Server decides authority
- Trace records real cause

It also moves AI closer to the role of narrator/interpreter instead of requiring it to act as the CPU for routine simulation.

Routine commerce should not need repeated LLM turns merely to perform deterministic state changes such as:

- money decrease
- inventory increase
- market stock decrease
- price movement
- time advance
- NPC Agency progress
- faction progress

AI can narrate the consequences later.

## Token and subscription value

A sequence of many routine actions could become:

`20 deterministic actions -> 1 narration request`

instead of:

`20 actions -> 20 prompts -> 20 context payloads -> 20 responses`

This strongly supports LoreRelay's goal of using existing AI subscriptions or local models without forcing unnecessary API/token cost.

## Automatic AI invocation

A future `NarrationPolicy` could decide when to invoke AI using real semantic meaning, for example:

- event semantic class
- player relevance
- relationship importance
- location transition
- quest milestone
- narrative significance

Examples:

AI usually not needed:

- minor market fluctuation
- routine NPC movement
- ordinary trade
- basic travel

AI potentially useful:

- faction war starts
- important NPC dies
- player enters unknown city
- major relationship change
- battle begins or ends
- important conversation starts

Do not trigger AI from unrelated severity labels or debug terminology alone. Decision rules should use event semantics and player relevance.

## Context Engine synergy

Longer AI-silent periods increase the value of selective context retrieval.

When narration is requested after many simulation turns, LoreRelay should not send all recent events blindly.

Example request:

> Talk with merchant companion Elda at the tavern.

Relevant context could be selected by:

- Elda knows it
- Elda was involved
- it affects the current relationship
- it is relevant to the current conversation
- it is recent or narratively significant

Therefore:

> The longer LoreRelay can run without AI, the more valuable the Context Engine becomes.

## Trace vs narration

Two different user questions should remain separate:

- `Why mechanically?` -> Debug Trace / causal explanation
- `What happened narratively?` -> AI narration

Example:

- market price rose -> Trace explains causal chain
- user asks for story version -> AI turns that causal history into prose

## Critical dependency: historical event backbone

Delayed narration cannot rely only on current state.

Current state such as:

- wheat: 120
- money: 4000
- Elda relationship: +20

is insufficient to narrate what happened.

LoreRelay needs structured historical facts such as:

- where goods were bought
- where the player traveled
- who was met
- what changed
- what was lost
- which event caused which state transition

Existing materials that may contribute:

- game_history.json
- Chronicle
- Replay
- Git Timeline
- state_journal.ndjson

However, long-term structured event participation and involvement remain a likely dependency. This idea increases the value of:

- Historical Event Backbone
- Timeline Index
- event participants / involved entities
- stable event identity
- Event Receipts

## Architectural sketch

Normal AI-GM path:

`Player Action -> AI -> State Patch -> Narration -> Accepted Commit`

AI-optional path:

`Player Action -> Deterministic GameAction -> Canonical Commit -> Event Receipt`

Later:

`Selected Receipts + Current State + Context -> AI Narration`

The major design requirement is to keep later narration read-only unless the user explicitly enters a new mutating AI turn.

## Product possibility

This could broaden LoreRelay from:

> AI Game Master UI

into:

> AI Optional Living World Engine

The intended experience could resemble a systems-driven sandbox such as trading, travel, settlement management, NPC agency, and faction simulation during routine play, with AI RPG scenes appearing only when the player wants the world to speak.

Possible emotional/product statement:

> The goal is not to make AI talk every second. The goal is to live in the world, and let AI give that world words when they matter.

## Risks and open questions

- What actions are safe to execute deterministically without AI interpretation?
- How are routine commands mapped to typed GameActions?
- How much event history must be retained?
- How are receipt summaries generated without losing causality?
- How should delayed narration avoid inventing events that never occurred?
- When does narration become a new mutating AI turn rather than a read-only retelling?
- How should automatic narration triggers interact with user preference and quotas?
- What is the minimum Historical Event Backbone required before this becomes robust?

## Suggested future task decomposition

Do not implement yet.

Potential future lanes:

1. Product / UX gate — AI Participation Policy modes and controls
2. Architecture gate — deterministic GameAction vs AI-mutating turn boundary
3. Event history gate — Event Receipt / Historical Event Backbone requirements
4. Context gate — delayed narration retrieval rules
5. Prototype — Commerce + Travel in On Demand mode
6. Token benchmark — compare Always vs On Demand play sessions

## Current recommendation

Keep as a high-value idea note, not an active implementation task yet.

The concept is unusually aligned with LoreRelay's current direction, but its real dependency is not a toggle. The key dependency is trustworthy deterministic action execution plus enough event history to narrate later without fabrication.
