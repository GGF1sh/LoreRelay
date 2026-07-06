# NotebookLM Campaign Brain / Grounded Narrator POC

Status: IDEA NOTE / USER-ONLY POC CANDIDATE
Date: 2026-07-06 JST
Origin: user discovery of `teng-lin/notebooklm-py`

## Executive idea

Do not treat NotebookLM as LoreRelay's authoritative GM first.

Treat it as an optional, user-only:

- Campaign Brain
- Lore Oracle
- Grounded Narrator
- Long-memory synthesis provider

The strongest initial use is not canonical mutation. It is source-grounded reading, recall, and narration over long campaign history.

## Why it fits LoreRelay

LoreRelay is moving toward:

- deterministic simulation for routine actions
- AI Participation Policy
- Narration on Demand
- Narrative Sampling
- selective Context Engine retrieval
- explicit separation of mutation and narration

NotebookLM fits naturally after deterministic state mutation:

`Deterministic Core -> Canonical Commit -> Event Receipts -> Context Selection -> NotebookLM -> Narration`

World mutation remains LoreRelay authority.

NotebookLM reads and tells the story.

## Initial POC role

### S-tier: Lore Oracle

Examples:

- Who is this NPC?
- What past events matter to this relationship?
- What did the player previously promise?
- What source supports this recollection?

### S-tier: Narration on Demand

Examples:

- Narrate the last 20 turns as a travel memoir.
- Tell only the dangerous moments.
- Describe the last month from an NPC viewpoint.
- Summarize this trade expedition for the guild master.

### S-tier: canon / setting-grounded narration

A notebook can hold:

- World Bible
- Campaign Kit
- Lorebook
- World Forge
- NPC profiles
- Accepted Campaign History
- Chronicle
- Major Historical Events
- GM Contract

Then LoreRelay supplies only current state and selected recent events.

### A-tier: NPC dialogue synthesis

Only after LoreRelay applies deterministic knowledge/access filtering.

Never ask NotebookLM to decide what an NPC is allowed to know.

Correct boundary:

`World Truth -> LoreRelay Access/Knowledge Filter -> permitted source/context subset -> NotebookLM -> natural dialogue`

Source selection is useful, but must not be treated as a security or epistemic authority until tested.

### B-tier: full AI GM

Deferred.

Do not initially ask NotebookLM to produce authoritative:

- statePatch
- ledger mutation
- canonical commit
- strict TurnResult schema

Structured API envelopes are not equivalent to strict model-generated LoreRelay schema compliance.

## POC architecture

Recommended first topology:

`LoreRelay TypeScript -> localhost REST or CLI adapter -> notebooklm-py Python sidecar -> NotebookLM`

Do not port the Python client into TypeScript for the POC.

Possible integration transports:

- local REST sidecar
- CLI invocation
- MCP for experiments

Preferred POC: local REST sidecar, because it gives LoreRelay one explicit optional provider boundary.

## User-only first

Initial scope:

- local user experiment only
- opt-in
- no default product dependency
- no public-support promise
- no canonical mutation authority
- no required cloud dependency

Fallback remains existing LoreRelay providers.

NotebookLM outage or API breakage must not prevent normal LoreRelay play.

## First notebook shape

One notebook per test campaign.

Example:

`Notebook: FF14 - Lux Campaign`

Sources:

- World Bible
- campaign rules
- selected lorebook material
- important NPC profiles
- accepted campaign history
- Chronicle summaries
- major events
- narration contract

Do not upload every mutable file automatically in v1.

## First experiment

Use one existing campaign.

1. Create a notebook.
2. Add a curated source corpus.
3. Configure narrator/GM persona.
4. Provide current state in the query.
5. Provide a bounded set of selected accepted events.
6. Ask for narration only.
7. Compare against an existing LoreRelay provider.

Compare:

- setting adherence
- historical recall
- contradiction rate
- Japanese prose quality
- latency
- conversation continuity
- citation usefulness
- source update latency
- behavior after many turns

## Example POC request

```text
You are a LoreRelay narrator.

Current canonical state:
...

Selected accepted events:
...

Use only the provided current state and notebook sources.
Do not invent canonical changes.
Narrate this scene in Japanese.
Return prose only.
```

## Citation / provenance opportunity

Potential Inspector view:

```text
Narration:
Elda remembered the North Port incident.

Grounding:
- npc_elda_history.md
- event_north_port_0140.md
- accepted_campaign_history.md
```

Important distinction:

- Citation can show what source supported an answer.
- Citation does not prove an NPC was allowed to know it.

LoreRelay retains Knowledge / Access authority.

## Narration on Demand synergy

This is especially promising after AI-silent simulation stretches.

Example:

`20 deterministic actions -> Narrative Sampling -> selected Event Receipts -> NotebookLM -> grounded retelling`

NotebookLM may reduce the need to pack the entire long-term campaign history into every ordinary LLM prompt.

## Branch / rewind problem

Critical risk:

Notebook contains future history.

Then LoreRelay rewinds to an earlier point.

Without branch-aware memory handling:

> AI remembers the future.

Therefore:

`Campaign identity != Notebook conversation identity`

Likely future mapping:

- Runtime/Campaign identity -> Notebook identity
- Provider session identity -> conversation identity
- rewind / branch -> conversation reset/fork and branch-aware source history

Do not sync mutable long-term campaign history automatically until branch/rewind semantics are defined.

## Privacy / local-first boundary

NotebookLM is cloud-based.

Therefore this integration must be explicit opt-in.

Suggested product boundary:

- Default: local / existing providers
- Optional: NotebookLM Campaign Brain

The UI must explain that selected campaign sources are sent to Google services.

This matters especially for:

- private RP
- adult content
- unpublished writing
- personal journals
- proprietary source material

## Authentication risk

The integration relies on an unofficial library using Google web/session authentication.

POC recommendation:

- use a dedicated experiment Google account
- do not initially use the user's main Gmail/Drive identity for durable unattended credentials
- never commit cookies/tokens
- keep credentials outside workspace/campaign files
- do not expose credentials to Webview

## Provider reliability

`notebooklm-py` is an unofficial client over undocumented APIs.

Therefore:

- optional provider only
- no core dependency
- graceful unavailable state
- version pinning for POC
- explicit compatibility check
- kill switch / disable setting

## Source update strategy questions

Do not decide yet.

Candidate approaches:

- immutable event source per major event
- periodic accepted-history digest
- Chronicle snapshot refresh
- branch-scoped campaign history source
- limited current-state source replacement

Need to test:

- source ingestion latency
- refresh behavior
- source count limits
- stale-source behavior
- duplicate-source handling

## Security / correctness tests before any NPC use

Must test whether source restriction is actually strict enough for product use.

Attack setup:

- Source A: public fact NPC may know
- Source B: secret fact NPC must not know

Ask with Source A selected only.

Verify whether answer leaks Source B.

Repeat across:

- fresh conversation
- continued conversation
- persona changes
- notebook with mixed sources
- source refresh

Until proven otherwise:

> source selection is a retrieval hint, not a security boundary.

## POC success criteria

The experiment is worth continuing if NotebookLM materially improves at least two of:

- long-term factual recall
- source-grounded consistency
- cited provenance
- long-context token efficiency
- narration quality over long campaign history

And does not create unacceptable issues in:

- latency
- auth fragility
- source sync effort
- privacy
- branch/rewind contamination

## Suggested lifecycle

Do not promote directly to implementation backlog.

Recommended sequence:

1. User-only manual POC
2. Results note
3. Optional local adapter prototype
4. Security/source-isolation experiment
5. Branch/rewind memory design
6. Product Gate
7. Only then consider official optional provider integration

## Working names

Preferred:

- NotebookLM Campaign Brain
- Grounded Narrator
- Grounded GM Brain

Avoid initially calling it:

- NotebookLM GM Provider

because the first POC should not grant canonical mutation authority.

## Current recommendation

Proceed with a user-only narration/lore-oracle experiment.

This is unusually aligned with LoreRelay's Narration on Demand and Narrative Sampling direction, but it must remain optional, cloud-opt-in, branch-aware, and non-authoritative until tested.
