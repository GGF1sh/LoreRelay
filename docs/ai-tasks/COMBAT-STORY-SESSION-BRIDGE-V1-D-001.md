# COMBAT-STORY-SESSION-BRIDGE-V1-D-001

Status: DESIGN LOCKED (revision 2 — pre-implementation questions resolved against real code)
Risk for implementation: **Medium** for V1-D1, **Medium** for V1-D2 (was High for the withdrawn single-PR shape)
Base: `6a619b6393caf6f116825346a285fdf078681fa8` (`1.84.30`)
Depends on: Bridge V1-A (PR #57), V1-B (PR #59), V1-C — all COMPLETE on `main`.
Design PR: #69

> **Revision 2 changed the product shape.** The choice layer (RECOVER / SEARCH / WITHDRAW) proposed
> in revision 1 is **not implementable on current `main`** and has been cut. See
> [Resolved decisions](#resolved-decisions) for the code evidence. What ships as V1-D is the
> deterministic aftermath **substrate** plus a real, honest terminal acknowledgement; the choice
> layer moves to V1-E behind one named prerequisite.

---

## Problem

V1-C closed the *narration* gap: an APPLIED combat result reaches the next GM turn as an
immutable fact block (`combatConsequence`, priority 88) with a durable inject-once ACK keyed by
`receiptHash`.

The remaining gap is a **player gap**. After a battle resolves, the player has nothing structured
to do with the result. The intended fix was a deterministic post-combat choice:

```text
APPLIED outcome → deterministic Aftermath candidates → 2–4 meaningful choices
→ normal Turn → deterministic result/history/memory → AI narrates only
```

Revision 2 investigated whether that is buildable now. **It is not**, for one reason that is
worth stating plainly because it outlives this lane:

> **On current `main`, HP is the only scarce player resource.** Time is not spendable, information
> has no ledger, and money is feature-gated. A choice layer needs at least two scarcities to trade
> between. V1-D therefore ships the substrate and the honest part of the UX; the choice layer is
> gated on landing one more currency.

---

## Resolved decisions

### Decision 1 — Campaign / world clock authority: **exists, but is not player-spendable**

| Question | Answer, with evidence |
| --- | --- |
| Authoritative field | `WorldState.worldTurn: number` — `src/worldStateCore.ts:63`, parsed at `:548`, defaulted at `:622`. Read accessor `getWorldTurn()` at `src/worldState.ts:331`. |
| Storage | `world_state.json` (`WORLD_STATE_FILENAME`, `src/worldState.ts:64`) — a **different file** from `game_state.json`, with its own cache, mtime invalidation, and write queue (`patchWorldStateQuestHooks`, `src/worldState.ts:305`). |
| Mutation path | Exactly one: `runSimulationStep` → `next.worldTurn = (state.worldTurn ?? 0) + 1` (`src/emergentSimulator.ts:153`). Driven by an observer guarded by `(state.lastSimulatedGmTurn ?? 0) >= gmTurnCount` (`:131`) and persisted via `persistWorldStepOutcome` (`:134`). |
| Availability | Feature-gated. `isWorldStateEnabled()` requires **both** `loadGameRules().enableEmergentSimulation` **and** `world_state.json` to exist (`src/worldState.ts:83-87`). Campaigns without Living World have no clock at all. |
| Vocabulary | The `ClockRef` / `ClockSpan` contract (`docs/TERMINOLOGY_CONTRACT.md:34-54`) forbids bare turn numbers and distinguishes `world` from `gm`. A previewed span is explicitly not proof that time advanced. |

**Ruling: `timeCostUnits` is removed from this design entirely.** Not "recorded but unbound" — removed.
Three independent reasons, any one sufficient:

1. **Not universally present.** A mechanic that silently does nothing whenever Living World is off
   is a decorative mechanic in exactly the campaigns most likely to run combat.
2. **Not ours to advance.** `worldTurn` is owned by the simulator and is monotonic against
   `lastSimulatedGmTurn`. Forcing it forward from a player choice would make the simulator skip
   world steps — corrupting a subsystem V1-D has no authority over (contract 8).
3. **Not atomic.** `world_state.json` and `game_state.json` are separate files with separate write
   queues. A resolution that mutated both would introduce a two-file crash window into a
   High-risk exactly-once path — precisely the hazard this design's determinism rules exist to
   prevent.

**Consequence: `RECOVER` is cut from V1-D.** Its payoff was real (HP written to `game_state` is
consumed by the next encounter's roster compile), but its *price* was `timeCostUnits`. With no
price, RECOVER is the "無料治療" exploit this design was written to prevent, so it must not ship.

### Decision 2 — SEARCH result authority: **no valid ledger exists**

Every candidate home was checked against one test: *is it durable, deterministic, atomic with the
resolution write, and immune to AI mutation?*

| Candidate | Verdict |
| --- | --- |
| `GameState.hiddenState` | **Rejected — AI-writable.** Listed in `ALLOWED_ROOTS` (`src/statePatch.ts:84`) and `PATCHABLE_ROOT_KEYS` (`:104`), so a GM turn patch can rewrite it. |
| `GameState.status` (incl. `condition[]`, which V1-B already writes) | **Rejected — AI-writable and turn-authoritative.** In `ALLOWED_ROOTS` (`src/statePatch.ts:82`) *and* in `TURN_AUTHORITATIVE_ROOT_KEYS` (`src/workspaceStateQueueCore.ts:31`). |
| `GameState.world` (`visitedLocationIds`, `discoveredRegionIds`, `knownFactionIds`) | **Rejected — AI-writable** (`src/statePatch.ts:84`) and location-scoped, not battle-site scoped. |
| `WorldChangeEvent` log (`src/worldEventLogCore.ts:12`) | **Rejected —** lives in `world_state.json`, is `worldTurn`-stamped, and inherits the Living World gate plus the non-atomicity of Decision 1. |
| `GameState.commerce` | **Rejected —** LW1 Commerce feature gate; absent in most campaigns. |
| A new top-level `game_state` key | **Valid storage, but no consumer.** See below. |

There *is* one architecturally sound home: a new top-level key, which is authoritative precisely
because it is absent from both `ALLOWED_ROOTS` and `TURN_AUTHORITATIVE_ROOT_KEYS` — the same
property that makes V1-B's `combatBattleHistory` AI-immune today. That is where
`combatAftermathHistory` lives.

But storage is not meaning. **No system on current `main` reads such a flag**, so a
`combat_site_searched` entry would be written, never consumed, and never change anything the
player can perceive. That is a decorative mechanic.

**Ruling: `SEARCH` is cut from V1-D and deferred to V1-E**, conditional on a consumer existing.

### Decision 3 — Consequence for the choice layer

The design's own rule from revision 1 stands: *an opportunity with fewer than two eligible choices
is not a decision and must not be generated.* With RECOVER and SEARCH cut, `WITHDRAW` stands
alone. **The choice layer cannot ship in V1-D.**

### Decision 4 — A blocker found while resolving 1–3: turn-authoritative `status` clobbering

Worth recording because it invalidates revision 1's dispatch order and will govern V1-E.

`status` is in `TURN_AUTHORITATIVE_ROOT_KEYS` (`src/workspaceStateQueueCore.ts:31`), so a GM turn
commit under the `'turn'` merge profile **owns** `status` — including `status.hp`. Revision 1
specified "resolve mechanically, persist, *then* dispatch the turn". Under that order the AI's
returned `status`, built from prompt context that predates the HP write, would be committed on top
of the V1-D delta and silently revert it.

**Ruling for V1-E:** any mechanical effect that touches `status` must be applied at the **Accepted
correlation boundary — after the turn commit**, never before dispatch. This is the same boundary
the decline path already uses, so it costs no new machinery, and exactly-once is still guaranteed
by the terminal marker rather than by ordering. V1-D itself writes nothing to `status`, so it is
unaffected; the rule is recorded here so V1-E does not rediscover it the hard way.

---

## What V1-D ships instead

A **deterministic combat debrief with a terminal acknowledgement**: the full aftermath substrate,
carrying the one piece of player-facing value that is honest today.

The player currently gets nothing structured after a battle — the result exists only inside
AI prose. V1-D gives them a host-authored, AI-immune card stating the confirmed outcome, and a
single deterministic acknowledgement that terminates the opportunity exactly once.

This is deliberately **not** dressed up as a choice. It is a receipt the player closes.

```text
APPLIED outcome (V1-B)
→ V1-C consequence injected + Accepted-ACKed
→ deterministic Aftermath opportunity derived (no write)
→ host-rendered debrief card + single ACKNOWLEDGE control
→ ACKNOWLEDGE, or auto-decline at the next Accepted turn
→ durable terminal record (game_state + side marker)
→ one-shot combatAftermathResolution prompt chunk (narration only)
```

Every determinism, idempotency, lifecycle, and authority property from revision 1 is retained
verbatim. Only the choice semantics are removed. When V1-E lands a currency, the choice layer
plugs into this substrate without reopening any of it — that is the point of shipping it now.

---

## Authority split

| Concern | Authority | Never |
| --- | --- | --- |
| Winner, HP, death, survival, `simulationResultHash`, `receiptHash` | Combat Core → receipt → V1-B apply | AI must not restate as new, recompute, or contradict |
| Whether an aftermath opportunity exists, and its content | Pure deterministic generator over V1-B/V1-C artifacts | AI must not invent, extend, remove, or re-offer |
| Exactly-once consumption | Durable marker under `.text-adventure/combat/aftermath/` + `game_state` mirror | AI has no part in this path |
| Prose, dialogue, sensory detail, character reaction | AI | AI must not attach a mechanical consequence to its prose |

The ten absolute contracts and where each is enforced:

1. **No AI re-decision of outcome/HP/death/survival/hash** — reads only `combatBattleHistory` +
   APPLIED marker; no receipt re-execution, no new HP source.
2. **No AI decision of applicability or mechanical result** — generation is a pure function; the
   AI is not called before the opportunity is terminal.
3. **AI narrates settled records only** — the sole new prompt chunk describes an *already
   terminal* opportunity.
4. **No synthetic GM `GameEntry`** — a host-rendered UI card plus a prompt chunk. Nothing enters
   `entries[]` except the player's own acknowledgement entry, exactly as `selectOption` does today.
5. **No HP re-application** — **V1-D writes nothing to `status` at all.** See Decision 4.
6. **No combat receipt reuse** — never reads `pending/*.json`, never calls
   `applyCombatOutcomeReceiptOnce`.
7. **V1-C ACK contract untouched** — `combatConsequence` / `injected/<receiptHash>.json` are read
   as a precondition signal only. New chunk ids and new marker directories; no change to V1-C
   token shape, priority, or ACK semantics.
8. **No redesign of Combat Core, RTS orders, or objective-protect (Future PR C)** — zero touches.
9. **Declining is defined** — a non-aftermath Accepted turn closes the opportunity durably as
   `declined`.
10. **No double consumption across restart / resend / duplicate observation** — one terminal marker
    per `receiptHash`, mirrored in `game_state`, plus an `opportunityDigest` staleness check.

---

## User experience

| Moment | What is visible | Authority |
| --- | --- | --- |
| Battle reaches terminal outcome | Battle View terminal result (existing V1-A/B). No aftermath surface. | Combat Core |
| Auto-apply on `receipt_pending` (`src/extension.ts:663`) or `textadventure.applyPendingCombatOutcomes` | No new chat UI. `combatBattleHistory` + player HP updated; APPLIED marker written. | V1-B |
| Player's next turn | GM narrates the battle's immediate consequence. On Accepted correlation `injected/<receiptHash>.json` is written. | V1-C |
| The `gameStateUpdate` that follows | **Debrief card appears** above `#options-bar`: host-written header, confirmed outcome, HP at combat end, and a single `ACKNOWLEDGE` control. | **V1-D** |
| Player acknowledges | Terminal record persisted, then dispatched as a normal turn. GM narrates the moment the party takes stock. Card disappears permanently for that battle. | **V1-D** |
| Player types free input instead | Normal turn. On Accepted correlation the opportunity closes as `declined`. Card disappears permanently. | **V1-D** |

The card opens **after** the V1-C consequence has actually been delivered, not at apply time — the
player reads what happened before the result is presented as settled, and the V1-C injected marker
is an existing, durable, wall-clock-free "the player has been told" signal that costs V1-D no new
state.

### A dedicated surface, never `state.options`

`state.options: string[]` (`src/types/GameState.ts:119`) is AI-authored, is in `ALLOWED_ROOTS`
(`src/statePatch.ts:82`) and `TURN_AUTHORITATIVE_ROOT_KEYS`
(`src/workspaceStateQueueCore.ts:32`), is rewritten wholesale every GM turn, and carries no
identity — `selectOption` matches by exact string (`src/extension.ts:1169-1172`) and forwards raw
text as free input. Merging a mechanical control into it would let the AI drop, reword, or
fabricate it.

The V1-D surface is therefore separate:

- new `<div id="combat-aftermath-bar">` above `#options-bar` (`webview/index.html:183`);
- populated only from a host-derived view model on `gameStateUpdate`;
- visually distinct from `.option-btn`, with a "確定処理 / Resolved mechanically" badge;
- acknowledgement posts a **new** message type `acknowledgeCombatAftermath`, not `selectOption`.

Free input is always allowed; the card never locks input. The card states up front that moving on
closes the debrief. The forfeit is written at Accepted correlation, not at input time, so a failed
turn does not consume the opportunity.

---

## Schema

Versioned, wall-clock-free. Ordering derives from `combatBattleHistory` array order plus
`sourceCampaignRevision`. No `createdAt`, no `Date.now()` in any identity, digest, or ordering
decision.

### `CombatAftermathFactV1` (pure, derived, never persisted standalone)

```ts
export const COMBAT_AFTERMATH_FACT_SCHEMA = 'combat-aftermath-fact-v1' as const;

export interface CombatAftermathFactV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_FACT_SCHEMA;
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    encounterId: string;
    terminalOutcomeCode: 'ALLY_WIN' | 'ENEMY_WIN' | 'TIMEOUT';
    finalTick: number;
    simulationResultHash: string;
    sourceCampaignRevision: number;
    playerHpAfter?: number;
    playerMaxHp?: number;
    playerIncapacitated?: boolean;
    /** sha256Stable over every field above. */
    factDigest: string;
}
```

Sources, and nothing else: one `CombatBattleHistoryEntry` (`src/campaignCombatApplyCore.ts:19`)
plus its matching `applied/<combatSessionId>.json` (`CombatAppliedMarker`, source of
`campaignInstanceId` / `timelineEpochId`). Rejected unless `receiptHash` **and** `combatSessionId`
agree across both, mirroring `tryBuildCombatConsequenceFact`
(`src/campaignCombatConsequenceCore.ts:47`).

### `CombatAftermathOpportunityV1` (derived, never persisted while live)

```ts
export const COMBAT_AFTERMATH_OPPORTUNITY_SCHEMA = 'combat-aftermath-opportunity-v1' as const;

export interface CombatAftermathOpportunityV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_OPPORTUNITY_SCHEMA;
    /** Stable ID: `aftermath:<receiptHash>` — one opportunity per battle, forever. */
    opportunityId: string;
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    factDigest: string;
    /** V1-D: always exactly ['ACKNOWLEDGE']. The array shape is the V1-E extension point. */
    actions: CombatAftermathActionId[];
    /** sha256Stable({schemaVersion, opportunityId, factDigest, actions}) — idempotency key. */
    opportunityDigest: string;
}

export type CombatAftermathActionId = 'ACKNOWLEDGE';
```

`actions` is an array carrying one element rather than a scalar, so V1-E extends the choice set
without a schema version bump or a digest-shape change.

### `CombatAftermathResolutionV1` (persisted in `game_state`)

```ts
export const COMBAT_AFTERMATH_RESOLUTION_SCHEMA = 'combat-aftermath-resolution-v1' as const;
export const COMBAT_AFTERMATH_HISTORY_KEY = 'combatAftermathHistory';
export const COMBAT_AFTERMATH_HISTORY_LIMIT = 20; // mirrors COMBAT_BATTLE_HISTORY_LIMIT

export interface CombatAftermathResolutionV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_RESOLUTION_SCHEMA;
    /** sha256Stable({opportunityId, opportunityDigest, disposition, actionId}) — narration ACK key. */
    resolutionId: string;
    opportunityId: string;
    opportunityDigest: string;
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    sourceCampaignRevision: number;
    disposition: 'acknowledged' | 'declined';
    actionId?: CombatAftermathActionId;   // present only when disposition === 'acknowledged'
}
```

`combatAftermathHistory` is a **new top-level key in `game_state.json`**. It is authoritative
precisely because it appears in neither `ALLOWED_ROOTS` (`src/statePatch.ts:81-85`) nor
`TURN_AUTHORITATIVE_ROOT_KEYS` (`src/workspaceStateQueueCore.ts:30-52`) — the same property that
makes `combatBattleHistory` AI-immune today. Bounded to 20 by the same `.slice(-LIMIT)` rule.

**V1-D deliberately has no `appliedEffect` field.** It mutates no gameplay resource. V1-E adds it
together with the currency it spends.

### `CombatAftermathMarkerV1` (durable side file — the exactly-once gate)

```text
.text-adventure/combat/aftermath/<receiptHash>.json
```

```ts
export const COMBAT_AFTERMATH_MARKER_SCHEMA = 'combat-aftermath-marker-v1' as const;

export interface CombatAftermathMarkerV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_MARKER_SCHEMA;
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    opportunityDigest: string;
    disposition: 'acknowledged' | 'declined';
    resolutionId: string;
    actionId?: CombatAftermathActionId;
}
```

Path sanitization follows `injectedConsequencePath` exactly — hex-only, ≤128 chars, `'invalid'`
fallback (`src/campaignCombatPendingStore.ts:36-39`) — written with `writeJsonAtomicNoVscode`.

### `CombatAftermathNarratedMarkerV1` (durable inject-once ACK, symmetric with V1-C)

```text
.text-adventure/combat/aftermathNarrated/<resolutionId>.json
```

```ts
export interface CombatAftermathNarratedMarkerV1 {
    schemaVersion: 'combat-aftermath-narrated-v1';
    resolutionId: string;
    receiptHash: string;
    sourceDigest: string;   // hashPromptReceiptText(block)
}
```

### Identity and idempotency keys

| Purpose | Key | Scope |
| --- | --- | --- |
| One terminal decision per battle | `receiptHash` | `aftermath/<receiptHash>.json` |
| Staleness / resend rejection | `opportunityDigest` | inbound `acknowledgeCombatAftermath` |
| One narration per resolution | `resolutionId` | `aftermathNarrated/<resolutionId>.json` |
| Cross-campaign / cross-timeline isolation | `campaignInstanceId` + `timelineEpochId` | every schema |
| Ordering | `combatBattleHistory` index, then `sourceCampaignRevision` | derivation only |

---

## Lifecycle

Five states; only the two terminal ones touch durable storage.

```text
                     (V1-C injected marker exists for this receiptHash,
                      newest eligible battle, no aftermath marker)
   ┌──────────┐   derive    ┌─────────┐   render    ┌───────────┐
   │ (no      │ ──────────► │ OFFERED │ ──────────► │ PRESENTED │
   │  offer)  │             └────┬────┘             └─────┬─────┘
   └──────────┘                  │                        │
                                 │ newer battle           │ acknowledgeCombatAftermath
                                 │ opens an offer         │  (digest matches)
                                 ▼                        ▼
                          ┌────────────┐          ┌──────────────┐
                          │ SUPERSEDED │          │ ACKNOWLEDGED │ ◄── durable, terminal
                          └────────────┘          └──────────────┘
                                 ▲
                                 │                ┌──────────────┐
                       (derived; no write)        │   DECLINED   │ ◄── durable, terminal
                                                  │ (non-aftermath│
                                                  │  turn Accepted)│
                                                  └──────────────┘
```

| State | Durable authority | Retryable | Crash window | Restart recovery | Duplicate observation |
| --- | --- | --- | --- | --- | --- |
| **OFFERED** | **None — derived.** `combatBattleHistory` + `applied/` + `injected/` present, `aftermath/` absent, newest eligible battle. | N/A — recomputation *is* the retry | None; nothing written | Re-derives identically; nothing was consumed | Byte-identical `opportunityDigest` from identical inputs |
| **PRESENTED** | **None — ephemeral UI.** Non-authoritative by contract; may render any number of times. | Yes | None | Re-renders from a fresh derivation | Harmless — presentation grants nothing |
| **SUPERSEDED** | **None — derived.** A strictly newer battle has an open or terminal offer. | N/A | None | Re-derives identically | Idempotent |
| **ACKNOWLEDGED** | `combatAftermathHistory` in `game_state.json` **and** `aftermath/<receiptHash>.json`. `game_state` primary; marker is the fast gate. | Yes — idempotent on `resolutionId` | Between the `game_state` write and the marker write — the same window V1-B already tolerates | **Repair path:** history contains `resolutionId` but marker missing ⇒ rewrite the marker only. Mirrors `campaignCombatApplyHost.ts:133-160`. | Second call with the same digest returns `already_resolved`, mutates nothing |
| **DECLINED** | Same two artifacts, `disposition: 'declined'`. Written only after `turnResultMatchesPromptReceipt` correlation. | Yes — idempotent on `receiptHash` | Crash before Accepted leaves the offer OFFERED — correct: an undelivered turn must not consume it | Offer re-derives and is presented again | `alreadySatisfied` on an identical marker; `failed` on a `receiptHash` collision with a different disposition |

Rejected alternatives, and why:

- **`PRESENTED` must not be durable.** It would add a write per render, a crash window protecting
  nothing, and a restart question with no player-visible answer. Presentation is not authority.
- **A separate persisted `SELECTED` state is unnecessary.** A `SELECTED → RESOLVED` split creates a
  durable intermediate a crash can strand, requiring resume/rollback for no benefit. Selection and
  resolution happen in one host call whose only durable output is terminal — the shape V1-B proved.
- **`SUPERSEDED` needs no write.** It is a function of the history array; deriving it cannot drift
  from the data.

---

## Determinism / idempotency

1. **No wall clock anywhere** — not in identity, digests, ordering, eligibility, or expiry.
   Ordering uses `combatBattleHistory` order then `sourceCampaignRevision`; the "player has been
   told" gate uses the V1-C injected marker's existence.
2. **Generation is pure** — `buildCombatAftermathOpportunity(fact)` performs no I/O, no randomness,
   no configuration reads. Same fact ⇒ identical `opportunityDigest` across processes.
3. **The resolver recomputes.** It re-derives the opportunity from current durable state; the
   client's `opportunityDigest` is only compared, never used as calculation input. Mismatch ⇒
   `STALE_OPPORTUNITY`, nothing applied.
4. **Exactly-once gated on `receiptHash`**, checked in order: marker exists → history contains
   `resolutionId` → derive → validate digest → write `game_state` → write marker.
5. **V1-D writes no gameplay resource.** No HP, no conditions, no flags, no clock. This is what
   drops the risk tier from High to Medium: the only durable mutation is an append to an AI-immune
   history array plus a side marker.
6. **Persistence uses the existing OCC path** — `mergeGameStateForPersist` with `readStateRevision`
   and `profile: 'default'`, exactly as `applyCombatOutcomeReceiptOnce`
   (`src/campaignCombatApplyHost.ts:163-170`), so a concurrent GM turn observes the revision bump.
   `profile: 'default'` is required: the `'turn'` profile is authoritative over `status` and would
   not preserve a non-turn-authoritative key correctly in a concurrent commit.
7. **Checkpoint / rewind parity with V1-C.** Checkpoints must snapshot and restore
   `combatAftermathHistory` exactly as V1-C requires for `combatBattleHistory`
   (`src/checkpointCombatCore.ts`). Side files under `.text-adventure/combat/` stay
   workspace-scoped, so a rewind does not resurrect a spent opportunity — **fixed by user decision,
   not reopened here.**
8. **Prompt chunk atomicity.** `combatAftermathResolution` is all-or-nothing under the global
   budget, inheriting the V1-C rule verbatim: if the block would be truncated or dropped, omit the
   chunk **and** its ACK token.
9. **Decline is independent of the prompt budget.** The decline marker is written because a
   non-aftermath turn reached Accepted, not because any block was injected — so a budget-evicted
   chunk cannot advance an ACK.

---

## Prompt boundary

One new chunk, registered alongside the V1-C entry (`src/gmPromptBuilder.ts:275`):

- chunk id: `combatAftermathResolution`
- category: `recent_events`
- priority: `87` (below `combatConsequence` 88, above Summary 85)
- selection: oldest `combatAftermathHistory` entry with no
  `aftermathNarrated/<resolutionId>.json`; at most one per assembly; none eligible ⇒ no chunk and
  no token
- Inspector/Preview may render the candidate and must **never** ACK it — same pure-peek split as
  `buildCombatConsequenceCandidate` (`src/gmPromptBuilder.ts:1389`)

```text
[Authoritative Combat Aftermath — Already Settled]
Encounter: <encounterId>
Battle outcome: <terminalOutcomeCode>
Player HP at combat end: <playerHpAfter>/<playerMaxHp>
Disposition: <acknowledged | declined>
Receipt: <receiptHash>
Resolution: <resolutionId>

These facts are immutable and already recorded in the game state.
This record was generated mechanically, not by you.
Narrate only how the party takes stock of what already happened.
Do not invent rewards, loot, deaths, HP changes, injuries, prisoners, survivors,
factions, discoveries, or elapsed time.
Do not offer, imply, or resolve any aftermath option.
Do not present these values as something happening now; they have already happened.
```

The AI is never told that an opportunity is open, only that one was settled — so it cannot
pre-empt, argue for, resolve in prose, or fabricate an option. **This property is load-bearing and
carries into V1-E.**

```ts
interface CombatAftermathAckToken {
    tokenId: string;               // combatAftermathResolution:<resolutionId>
    chunkId: 'combatAftermathResolution';
    resolutionId: string;
    receiptHash: string;
    sourceDigest: string;
}
```

ACK is attempted only after trusted `turnResultMatchesPromptReceipt` correlation, returning
`applied` / `alreadySatisfied` / `failed` with the same compensation-queue behavior as
`ackCombatConsequenceInjectedMarker` (`src/campaignCombatPendingStore.ts:87-122`).

---

## Minimal slice

**Two ordered PRs on a single implementation lane.** Not one PR: nothing in V1-D requires the
storage layer and the presentation layer to land atomically. The durable substrate is fully
testable headless, and splitting keeps each PR at Medium risk with a focused review surface.

### V1-D1 — deterministic aftermath substrate (headless)

1. `src/campaignCombatAftermathCore.ts` — pure fact builder, opportunity generator, digest
   helpers, resolution builder, prompt block formatter, history list/append.
2. `src/campaignCombatAftermathHost.ts` — derive current offer, acknowledge-once, decline-once,
   marker repair path.
3. `src/campaignCombatPendingStore.ts` — `aftermath/` and `aftermathNarrated/` read/write/ack.
4. `src/types/GameState.ts` — `combatAftermathHistory`.
5. `src/checkpoint.ts`, `src/checkpointCombatCore.ts` — snapshot/restore parity.
6. Focused tests for AC 1–11 and 15.

No UI, no prompt chunk, no user-visible change. Verifiable end to end by tests.

### V1-D2 — surface and narration

7. `webview/index.html`, `webview/modules/10-game-state.js`, `webview/modules/00-core.js`,
   `webview/styles/10-layout-chat.css`, `webview/script.js` — debrief card + `ACKNOWLEDGE`.
8. `src/webviewHandlers.ts`, `src/extension.ts` — `acknowledgeCombatAftermath` → resolve → dispatch
   a normal turn.
9. `src/gmPromptBuilder.ts`, `src/gmPromptBuilderCore.ts`, `src/promptReceiptCore.ts` — chunk,
   token, Inspector no-consume path.
10. i18n keys; version / changelog / generated registry.
11. Focused tests for AC 12–14 and 16.

### Implementation start conditions

- V1-D1 may start immediately from `main` after PR #69 merges, on a fresh branch.
- V1-D2 starts only after V1-D1 is merged; it must not be opened in parallel.
- Neither PR may write to `status`, `world`, `hiddenState`, `world_state.json`, or any other
  turn-authoritative or AI-patchable root.
- If either PR finds itself needing a new gameplay resource, **stop** — that is V1-E, and it needs
  the currency gate below, not an ad-hoc field.

---

## Out of scope

| Deferred | Reason |
| --- | --- |
| **The aftermath choice layer itself (RECOVER / SEARCH / WITHDRAW)** | **Decisions 1–3: no second scarce resource exists on `main`.** → V1-E |
| `timeCostUnits` and any clock binding | Decision 1 — no player-spendable clock; `worldTurn` is gated, simulator-owned, and in a different file |
| Prisoners, survivors, interrogation, pursuit | Needs durable participant/casualty data no artifact persists post-apply |
| Loot, salvage, item economy | Needs an inventory transaction contract |
| Injury / wound / condition effects | `status` is turn-authoritative and AI-patchable (Decision 4) |
| Faction reporting, intimidation, diplomacy | Needs faction reputation write authority |
| Making the AI offer-aware before resolution | Hands the model a lever over unresolved mechanics |
| Persisting the full receipt for richer generation | Schema growth on the V1-B path; separate gate |
| Combat Core, RTS orders, objective-protect (Future PR C) | Contract 8 |
| Restoring a spent opportunity after rewind | **Fixed: never restored.** User decision, closed |

---

## Failure / exploit analysis

Exploits 1–3 from revision 1 (*always-optimal SEARCH*, *free healing*, *free withdrawal*) are
**structurally eliminated**: V1-D grants and costs nothing, so there is no reward to farm. They
return as live risks in V1-E and are the reason the currency gate exists.

| # | Attack | Defense |
| --- | --- | --- |
| 1 | **AI prose overrides the mechanical record** | The AI sees only a settled record, with six explicit prohibitions. The record is written before dispatch and lives in a key absent from `ALLOWED_ROOTS` and `TURN_AUTHORITATIVE_ROOT_KEYS`, so no AI patch or turn commit can reach it. |
| 2 | **Resend for a double effect** | The inbound message carries `opportunityDigest`. After resolution the opportunity no longer derives, so nothing matches ⇒ `ALREADY_RESOLVED`, zero mutation. The `receiptHash` marker check precedes all derivation. |
| 3 | **Restart resurrects a spent opportunity** | Two independent durable records plus a repair path that rewrites only the missing marker. A crash between the writes repairs; it never re-applies. |
| 4 | **`receiptHash` cross-wiring** | Every schema carries `receiptHash` + `combatSessionId` + `campaignInstanceId` + `timelineEpochId`; generation rejects any history/APPLIED pair that disagrees. A same-`receiptHash` marker with a different digest returns `failed`, never `alreadySatisfied`. |
| 5 | **An old battle's aftermath appears after a new battle** | Only the newest eligible entry can offer; older un-marked entries derive as `SUPERSEDED` and are never presented. |
| 6 | **Prompt budget eviction advances the ACK** | The chunk is all-or-nothing (drop block ⇒ drop token), and the decline path does not depend on prompt inclusion at all. |
| 7 | **Never acknowledging, to dodge a cost** | There is no cost in V1-D, so there is nothing to dodge; declining is still durably recorded so V1-E inherits a complete history. |
| 8 | **Combat narration reappears every turn** | Untouched V1-C guarantee plus the symmetric `aftermathNarrated/<resolutionId>.json`. |
| 9 | **Rewind to re-roll the decision** | Side markers are workspace-scoped and survive a chat-history rewind. Known and accepted: a lost opportunity, never a duplicated one. |
| 10 | **Client forges `actionId` or a payload** | The host ignores every client-supplied value except `opportunityId` / `opportunityDigest`, which are only compared. An unknown `actionId` returns `INELIGIBLE_ACTION` and mutates nothing. |
| 11 | **Concurrent GM turn races the resolution write** | `mergeGameStateForPersist` + `readStateRevision` with `profile: 'default'`, as `applyCombatOutcomeReceiptOnce` does. |
| 12 | **Incapacitated player is shown a debrief** | No opportunity is generated when `playerIncapacitated === true`; the game-over path owns that state. |
| 13 | **A turn commit silently reverts V1-D state** | Decision 4. `combatAftermathHistory` is not turn-authoritative, and V1-D writes nothing to `status`. Covered by AC 11. |

---

## Acceptance criteria

Machine-testable; each maps to at least one focused test. AC 1–11 and 15 belong to V1-D1; AC 12–14
and 16 to V1-D2.

1. `buildCombatAftermathFact` returns `undefined` when the APPLIED marker is missing, or when
   `receiptHash` / `combatSessionId` disagree with the history entry.
2. `buildCombatAftermathOpportunity` is pure and stable: the same fact yields an identical
   `opportunityDigest` across repeated calls and across independently constructed equal inputs.
3. No opportunity is generated when `playerIncapacitated === true`.
4. `actions` is exactly `['ACKNOWLEDGE']` for every generated opportunity in V1-D.
5. Only the newest eligible `combatBattleHistory` entry yields an offer; an older un-marked entry
   derives as `SUPERSEDED` and is never returned.
6. No offer is derived until `injected/<receiptHash>.json` exists (V1-C consequence delivered).
7. Acknowledging twice with the same `opportunityDigest` mutates `game_state` exactly once; the
   second call returns `already_resolved` with byte-identical state.
8. An acknowledgement carrying a stale or mismatched `opportunityDigest` returns
   `STALE_OPPORTUNITY` and mutates nothing; an unknown `actionId` returns `INELIGIBLE_ACTION` and
   mutates nothing.
9. Repair path: when `combatAftermathHistory` contains the `resolutionId` but the marker file is
   missing, the host rewrites only the marker; history is unchanged.
10. A non-aftermath turn reaching Accepted correlation writes a `declined` marker and the offer
    stops deriving. A turn that does **not** reach Accepted leaves the offer intact.
11. **No V1-D write path touches `status`, `world`, `hiddenState`, or `world_state.json`**, and
    `combatAftermathHistory` survives a subsequent `'turn'`-profile commit unchanged.
12. The `combatAftermathResolution` chunk is emitted at most once per `resolutionId`, is absent
    when `aftermathNarrated/<resolutionId>.json` exists, and is absent when nothing is un-narrated.
13. Prompt-budget atomicity: when the chunk cannot fit, both block and ACK token are omitted and no
    `aftermathNarrated` marker is written.
14. The Inspector/Preview path renders the candidate block without writing any marker, verified by
    asserting marker absence after a preview.
15. Checkpoint round-trip preserves `combatAftermathHistory`; after save→restore a resolved
    opportunity does not re-derive as OFFERED.
16. V1-C regression: `combatConsequence` selection, priority, token shape, and
    `injected/<receiptHash>.json` ACK outcomes are unchanged, including when both chunks are
    candidates in the same assembly.

**Verification gate.** Medium risk per `docs/DEVELOPMENT_VERIFICATION_POLICY.md` — focused tests,
compile, and a short human smoke check per PR; a full suite is deferred to the final integration
tree. The High-risk tier from revision 1 no longer applies because V1-D mutates no gameplay
resource and adds no cross-file write. Do not escalate without a concrete reason.

---

## Suggested touch set

Verified against `main` @ `6a619b6`. Implementation is **not** part of this task.

**V1-D1 — new**

- `src/campaignCombatAftermathCore.ts`, `src/campaignCombatAftermathCore.test.ts`
- `src/campaignCombatAftermathHost.ts`, `src/campaignCombatAftermathHost.test.ts`

**V1-D1 — modified**

- `src/campaignCombatPendingStore.ts` — `aftermathMarkerPath`, `aftermathNarratedPath`,
  read/write/ack (pattern at `:36-122`)
- `src/types/GameState.ts` — `combatAftermathHistory` (near `:119`)
- `src/checkpoint.ts`, `src/checkpointCombatCore.ts` — snapshot/restore

**V1-D2 — modified**

- `src/gmPromptBuilder.ts` — chunk registry (`:275`), candidate builder (near `:1389`), ACK
  application (near `:1432`), Inspector chunk (`:1678`), chunk map (`:1854`), token override
  (`:2402`)
- `src/gmPromptBuilderCore.ts` — chunk id / priority / category
- `src/promptReceiptCore.ts` — `PromptConsumableAckToken` union member
- `src/webviewHandlers.ts` — `case 'acknowledgeCombatAftermath'` (near `:183`)
- `src/extension.ts` — resolve-then-dispatch wiring (near `:1167`)
- `webview/index.html` (`:183`), `webview/modules/10-game-state.js` (near `:604`),
  `webview/modules/00-core.js` (near `:58`), `webview/styles/10-layout-chat.css` (near `:525`),
  `webview/script.js` (`:1478`)
- locale files, `package.json` version, `CHANGELOG.md`, generated registry

Run `npm run knowledge -- combatAftermath` before introducing the shared chunk / message / state
vocabulary.

---

## Open question

**One remains, and it gates V1-E rather than V1-D.**

**Which scarce resource does the aftermath choice layer trade in?** V1-D ships without one by
design. The choice layer becomes implementable as soon as a resource exists that is (a) present in
every campaign, not behind a feature gate; (b) stored in `game_state.json` outside `ALLOWED_ROOTS`
and `TURN_AUTHORITATIVE_ROOT_KEYS`; (c) read by at least one system the player can perceive.

Two candidates, in recommended order:

1. **A host-owned campaign clock** — the natural fit for RECOVER, but it needs a consumer before it
   is anything more than a counter. Do not add it until something reads it.
2. **Bind aftermath outcomes to the next encounter's compiled roster** — cheapest genuinely real
   option, because the consumer already exists: `game_state` HP already flows into the next
   battle's compiled roster via the V1-B path. A durable, AI-immune readiness modifier read at
   compile time gives RECOVER a real payoff *and* gives its alternatives a real price, with no new
   subsystem.

This question must be answered before V1-E is scoped. It must **not** be answered inside V1-D1 or
V1-D2.

---

## Final recommendation

**Ship V1-D as two ordered PRs delivering the aftermath substrate and an honest debrief. Do not
ship a choice layer until a second scarce resource exists.**

The revision-2 investigation produced one finding that outranks everything else in this document:
*on current `main`, HP is the only scarce player resource.* A decision layer is a trade, and there
is currently nothing to trade against. Revision 1's RECOVER / SEARCH / WITHDRAW set read as a
decision only because `timeCostUnits` and a search flag were assumed to be real; both turned out to
be writes that nothing reads (SEARCH) or that nothing can safely perform (RECOVER's price).
Shipping them would have produced exactly the "見かけだけの選択肢" outcome this revision was asked
to prevent.

What is worth shipping now:

1. **The substrate is real work and is fully implementable today.** Derived-while-live
   opportunities, terminal-only durable writes, `receiptHash` idempotency, Accepted-boundary
   decline, V1-C-symmetric narration ACK, checkpoint parity. None of it changes when choices
   arrive, and all of it is the hard part.
2. **The debrief card is real player value.** After a battle the player currently sees nothing
   structured — only AI prose that may or may not mention the result correctly. A host-authored,
   AI-immune statement of the confirmed outcome is a genuine improvement and is honest about being
   a receipt rather than a decision.
3. **Four properties are now proven against code rather than assumed** — `combatAftermathHistory`
   is AI-immune because it is absent from both root-key allowlists; `status` is not, so V1-D must
   not touch it; `worldTurn` is simulator-owned, gated, and in another file; and a mechanical
   effect must be applied *after* the turn commit, never before dispatch. Those four facts are the
   real deliverable of this revision and will save V1-E a rediscovery cycle.

Routing for the implementation PRs, per `docs/AI_MODEL_ASSIGNMENT_POLICY.md`: **Codex 5.6 Terra**
for both — substantial bounded implementation against a locked contract, Medium risk, no
High-tier state-machine hazard remaining. Do not route to any 5.5 variant.

Verdict: `READY_TO_IMPLEMENT` for V1-D1 once PR #69 merges. V1-D2 follows V1-D1. The choice layer
is `BLOCKED` pending the open question above.
