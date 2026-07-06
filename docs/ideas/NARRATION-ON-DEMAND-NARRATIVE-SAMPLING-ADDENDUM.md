# Narration on Demand — Narrative Sampling Addendum

Status: IDEA NOTE ADDENDUM
Date: 2026-07-06 JST
Parent: `docs/ideas/NARRATION-ON-DEMAND-AI-OPTIONAL-LIVING-WORLD.md`

## Refined user idea

For long play sessions, LoreRelay could let the player spend long stretches in deterministic simulation without AI, then let AI selectively "sample" or "pick" interesting pieces of what happened and turn them into narration.

This is not only:

> play without AI, then ask for one big summary

It can be:

> the world accumulates structured events, and AI later chooses a relevant subset to narrate richly

Working names:

- Narrative Sampling
- Event Sampling
- Story Sampling
- Narrative Tap
- Selected Retelling

## Example

The player spends an hour in simulation-oriented play:

- buys wheat
- travels north
- loses a cart wheel
- sleeps at an inn
- market prices change
- a companion gets irritated
- a faction starts a border dispute
- the player sells at a profit
- rain delays the return trip

No AI is required for each action.

Later the player asks:

> Describe what mattered on that trip.

LoreRelay should not dump every event into AI.

Instead:

`Historical Events -> relevance / significance / knowledge filtering -> selected narrative sample -> AI narration`

Possible selected sample:

- cart-wheel failure
- companion irritation
- border dispute rumor
- profitable sale

Routine price checks and low-value bookkeeping can remain background facts.

## Why this is stronger than simple NOAI mode

A simple NOAI mode only saves tokens.

Narrative Sampling changes the experience:

- simulation creates lived history;
- the player does not need narration for every mechanical action;
- AI can focus its token budget on memorable moments;
- the same event history can be narrated differently depending on request, viewpoint, NPC knowledge, or tone.

Examples:

> Tell me the trip as a travel diary.

> What would Elda remember about this week?

> Describe only the dangerous parts.

> Summarize the trade run for the guild master.

> Turn the last month into a tavern story.

The canonical events stay the same. The selected narrative lens changes.

## Selection dimensions

Possible selectors:

- event semantic class
- player relevance
- novelty
- consequence magnitude
- emotional importance
- relationship impact
- danger
- quest relevance
- location transition
- faction significance
- NPC knowledge/access
- recency
- explicit user request

The selector must not invent causality. It chooses from recorded history.

## Three layers

### 1. Simulation Layer

Deterministic systems create canonical change.

`GameAction -> Canonical Commit -> Event Receipt`

### 2. Selection Layer

LoreRelay chooses a bounded subset of historical events.

`Event History -> Filter / Rank / Sample -> Narrative Packet`

### 3. Narration Layer

AI turns the packet into prose, dialogue, recap, rumor, diary, or scene.

`Narrative Packet -> AI -> Read-only Retelling`

This separation is important:

- Simulation decides what happened.
- Selection decides what is relevant now.
- AI decides how to tell it.

## Interaction with Context Engine

This may become one of the strongest uses of the Context Engine.

NOAI play creates more history than can fit into a prompt. Therefore Context Engine must select from history instead of merely selecting from static lore.

The query can include:

- user request
- current scene
- involved entities
- audience or viewpoint
- knowledge/access constraints
- time range
- desired detail level

Example:

> Elda and I drink together. Let her bring up anything from the last ten days that she would realistically remember.

Selection should consider:

- events involving Elda
- events Elda witnessed or learned
- unresolved relationship tension
- high-significance shared travel events

Not all ten days of history.

## Interaction with long-term play

For 100+ turn campaigns, this may be more sustainable than mandatory AI-per-turn play.

Possible rhythm:

`simulation -> simulation -> simulation -> important event -> AI scene -> simulation -> simulation -> player requests recap -> AI narration`

This creates two complementary play styles inside one campaign:

- systems/sandbox play
- narrative/RPG play

The player can move between them without starting a different mode or campaign.

## Potential UI ideas

Not for implementation yet.

Possible controls:

- `Narrate this`
- `Describe recent events`
- `What mattered?`
- `Tell this from [NPC]'s perspective`
- `Turn this into a scene`
- `Summarize since last narration`

Possible event timeline affordance:

- select individual events
- select a time range
- let LoreRelay auto-pick
- inspect why an event was selected
- remove an event before sending to AI

## Important architecture rule

The AI narration must not retroactively change canonical history merely because it tells the story differently.

Default:

`Narrative Sampling = read-only retelling`

A later AI-mutating turn must be explicit and separate.

## New dependency insight

This refinement increases the value of:

- Historical Event Backbone
- stable Event IDs
- participant/involved-entity indexing
- causal trace
- event significance metadata
- knowledge/access filtering
- bounded Context Engine selection

It also suggests that long-term LoreRelay history should support more than chronological replay. It should support retrieval by:

- who
- where
- when
- consequence
- causality
- knowledge
- narrative significance

## Product statement

> The world keeps living while AI is silent. When you ask, LoreRelay picks the moments that matter and lets AI tell their story.

## Current recommendation

Keep this as a high-value extension of Narration on Demand.

Do not implement a crude NOAI toggle first. The more promising product is a unified AI Participation Policy plus a Narrative Sampling layer over trustworthy historical events.
