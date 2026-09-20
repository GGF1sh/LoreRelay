# COMBAT-STORY-SESSION-BRIDGE-V1-D-001

Status: **V1_D_DEFERRED** — design record, not an implementation gate. No implementation branch may be opened from this document.
Base investigated: `6a619b6393caf6f116825346a285fdf078681fa8` (`1.84.30`)
Depends on: Bridge V1-A (PR #57), V1-B (PR #59), V1-C — all COMPLETE on `main`.
Design PR: #69
Revision history: r1 proposed a three-choice aftermath layer · r2 disproved it against real code · **r3 (this) closes the lane as deferred**

---

## Verdict

**V1-D is deferred. No production code will be written for this lane.**

The lane set out to turn an APPLIED combat result into a player decision. Revision 2 established
against real code that no such decision can be built today. Revision 3 asked the remaining
question — *is there a smaller read-only version worth shipping instead?* — and the answer is no,
because **that version already ships**.

This document is retained as the record of *why* a meaningful post-combat decision is not
currently constructible, and what has to become true first.

---

## Why not even a minimal read-only debrief

The fallback considered was a small host-rendered card showing the confirmed result of the latest
battle: no new `game_state` key, no checkpoint schema, no prompt chunk, no ACK, no marker repair,
no GM turn, no mechanical effect. Read-only, UI-only dismissal, 3–5 production files.

**It was rejected because the surface already exists.**

The deterministic combat consequence block — encounter, terminal outcome, final tick, player HP at
combat end, receipt hash, simulation result hash — is already rendered to the player in the
**Inspector pane**, via a peek-only path that explicitly never consumes the V1-C ACK marker:

```ts
// src/gmPromptBuilder.ts:1677-1680
// Peek-only: Inspector must never ACK combat consequence inject markers.
considerInspectorChunk('combatConsequence', 'Combat Consequence', () =>
    buildCombatConsequenceCandidate()?.text ?? ''
);
```

It is host-authored, AI-immune, read-only, restart-safe, and already wired into the Inspector tab
(`webview/index.html:220`, rendered by `webview/modules/80-inspector.js`). A new debrief card would
present the same fields, from the same source, through a second code path — new UI, new i18n keys,
new render lifecycle, new review surface, and a second place for the same facts to drift — for
**zero new information**.

Against LoreRelay's stated priority — *「機能追加より100ターン壊れないこと」* — adding a duplicate
surface is a net negative regardless of how few files it touches.

The one thing the fallback would have added over the Inspector is placement: chat column rather
than a side tab. That is a discoverability tweak to an existing feature, not a lane. If the
combat result deserves better placement, that is a small, standalone Low-risk UI change to the
existing Inspector surface, and it should be scoped as such — **not** as V1-D, and not with any of
this document's lifecycle, marker, or ACK machinery attached.

### What was rejected along with it

Everything V1-D revision 2 proposed to build for an `ACKNOWLEDGE`-only feature is withdrawn:

| Withdrawn | Why |
| --- | --- |
| `combatAftermathHistory` in `game_state.json` | Durable save-schema growth with no mechanic to record |
| `game_state` ↔ side-marker mirror and repair path | Exactly-once machinery protecting nothing that can be double-applied |
| `.text-adventure/combat/aftermath/` markers | Same |
| Checkpoint snapshot/restore parity | New checkpoint surface for a value nothing reads |
| `combatAftermathResolution` prompt chunk + Accepted ACK | V1-C already injects the confirmed result exactly once |
| `acknowledgeCombatAftermath` message + host wiring | No decision to transmit |
| The V1-D1 / V1-D2 two-PR plan | Both PRs existed only to carry the above |

An acknowledgement is not a decision surface, and a state machine built for choices that do not
exist is speculative infrastructure for V1-E. The correct time to build it is when V1-E has a
mechanic that needs it — at which point its shape should be re-derived from that mechanic, not
inherited from this document.

---

## Retained findings (approved in revision 2)

These are the durable output of this lane. All were verified against `main` @ `6a619b6` and are
carried forward as constraints on V1-E and on any future combat-adjacent state work.

### 1. There is a world clock, but it is not a player-spendable resource

| Aspect | Evidence |
| --- | --- |
| Authority | `WorldState.worldTurn: number` — `src/worldStateCore.ts:63`; accessor `getWorldTurn()` at `src/worldState.ts:331` |
| Storage | `world_state.json` (`src/worldState.ts:64`) — a **different file** from `game_state.json`, with its own cache and write queue |
| Mutation | Exactly one path: `next.worldTurn = (state.worldTurn ?? 0) + 1` in `runSimulationStep` (`src/emergentSimulator.ts:153`), driven by an observer guarded by `(state.lastSimulatedGmTurn ?? 0) >= gmTurnCount` (`:131`) |
| Availability | Feature-gated: `isWorldStateEnabled()` requires **both** `loadGameRules().enableEmergentSimulation` **and** `world_state.json` to exist (`src/worldState.ts:83-87`) |
| Vocabulary | `ClockRef` / `ClockSpan` forbid bare turn numbers and separate `world` from `gm` — `docs/TERMINOLOGY_CONTRACT.md:34-54` |

Unusable as a cost for three independent reasons: it is absent whenever Living World is off; it is
simulator-owned and monotonic against `lastSimulatedGmTurn`, so forcing it would make the simulator
skip world steps; and mutating it alongside `game_state.json` would introduce a two-file crash
window into an exactly-once path.

### 2. There is no valid ledger for a deterministic "the player learned/did X" flag

| Candidate | Verdict |
| --- | --- |
| `hiddenState` | **AI-writable** — `ALLOWED_ROOTS` / `PATCHABLE_ROOT_KEYS`, `src/statePatch.ts:84,104` |
| `status` (incl. `condition[]`) | **AI-writable and turn-authoritative** — `src/statePatch.ts:82` and `src/workspaceStateQueueCore.ts:31` |
| `world` (`visitedLocationIds`, `discoveredRegionIds`, `knownFactionIds`) | **AI-writable** — `src/statePatch.ts:84`; also location-scoped, not battle-scoped |
| `WorldChangeEvent` log | `src/worldEventLogCore.ts:12` — inherits the Living World gate and the cross-file problem |
| `commerce` | LW1 Commerce feature gate |
| A new top-level `game_state` key | **Sound storage, no consumer.** Authoritative precisely because it is absent from both root-key lists — the property that makes V1-B's `combatBattleHistory` AI-immune — but nothing reads it, so the flag would be decorative |

### 3. HP is currently the only scarce player resource

This is the root cause of the lane's failure and the most portable finding here. Time is not
spendable (finding 1), information has no ledger (finding 2), and money is feature-gated. A
decision is a trade; with one currency there is nothing to trade against. Any set of post-combat
options built today collapses into a dominant strategy or a free reward.

### 4. A mechanical effect must be applied *after* the turn commit, never before dispatch

`status` is in `TURN_AUTHORITATIVE_ROOT_KEYS` (`src/workspaceStateQueueCore.ts:31`), so a GM turn
commit under the `'turn'` merge profile **owns** `status`, including `status.hp`. Revision 1's
"resolve mechanically, persist, then dispatch the turn" ordering would therefore let the AI's
returned `status` — built from prompt context predating the write — silently revert the effect.

**Rule for any future work:** apply mechanical effects at the **Accepted correlation boundary,
after the commit**, using the terminal marker rather than write ordering for exactly-once. Keys
outside `ALLOWED_ROOTS` and `TURN_AUTHORITATIVE_ROOT_KEYS` are unaffected.

### 5. Design properties worth reusing when V1-E is scoped

Not commitments — reusable conclusions, to be re-derived against whatever mechanic V1-E actually
lands:

- Deriving an opportunity from existing durable artifacts, rather than storing it while live,
  makes restart, resend, and preview non-events instead of state-machine hazards.
- The AI should never see an unresolved mechanical choice; it removes a whole class of
  "the model resolved the mechanic in prose" failures structurally rather than by instruction.
- A mechanical control must not be merged into `state.options`, which is AI-authored, rewritten
  every turn (`src/statePatch.ts:82`), and matched by exact string (`src/extension.ts:1169-1172`).
- The V1-C injected marker (`.text-adventure/combat/injected/<receiptHash>.json`) is an existing,
  durable, wall-clock-free "the player has been told" signal.
- Spent opportunities must not be restored by a rewind — **fixed by user decision, closed.**

---

## Conditions to resume

V1-D does not resume. A successor lane may be scoped only once **all four** hold:

1. **A second scarce resource exists** that is (a) present in every campaign, not behind a feature
   gate; (b) stored in `game_state.json` outside both `ALLOWED_ROOTS` (`src/statePatch.ts:81-85`)
   and `TURN_AUTHORITATIVE_ROOT_KEYS` (`src/workspaceStateQueueCore.ts:30-52`); and (c) read by at
   least one existing deterministic consumer the player can perceive.
2. **At least two post-combat options** can be generated deterministically from already-durable
   artifacts, such that neither dominates and neither is free.
3. **The mechanical effect has a consumer that already exists** — no new subsystem is required for
   the choice to matter.
4. **The resulting product value exceeds the durable-state and verification cost**, judged against
   *「機能追加より100ターン壊れないこと」*.

Until all four hold, no branch, no schema, and no lifecycle for this lane.

Cheapest credible route to condition 1, recorded as a suggestion and not a plan: bind post-combat
outcomes to the **next encounter's compiled roster**. The consumer already exists — `game_state`
HP already flows into the next battle's compiled roster via the V1-B path — so a durable,
AI-immune readiness value would give an option a real payoff *and* give its alternatives a real
price without inventing a subsystem. That is a V1-E scoping question, deliberately left open here.

---

## Superseded sections

Revisions 1 and 2 contained a User Experience flow, Schema, Lifecycle, Determinism/Idempotency
rules, a Prompt Boundary, a Minimal Slice, a Failure/Exploit analysis, Acceptance Criteria, and a
Suggested Touch Set. **All are withdrawn** and intentionally not carried forward: they described
machinery for choices that cannot exist, and leaving them in place would invite exactly the
speculative implementation this revision closes. They remain available in the PR #69 commit history
(`74da290`, `6c117d8`) if a successor lane wants to mine them.

There is no Acceptance Criteria section in this revision because there is nothing to accept. The
[Conditions to resume](#conditions-to-resume) replace it.

There is no Suggested Touch Set because **there is no production touch set**. This lane touches
documentation only.

---

## Final recommendation

**Merge PR #69 as the design record and move to a different product lane.**

What this lane produced is worth keeping, and it is not the feature it set out to build:

1. **A disproof, backed by code.** "Add meaningful post-combat choices" reads like a
   straightforwardly buildable feature. It is not, and the reason is structural rather than
   incidental — the game has one scarce player resource. That finding will resurface in every
   future attempt at a decision layer anywhere in LoreRelay, not just after combat.
2. **Four verified invariants** (findings 1, 2, 4, and the AI-immunity property of keys outside
   the root-key allowlists) that any future combat-adjacent state work would otherwise have had to
   rediscover, most likely by shipping a bug.
3. **A stopped implementation.** Revision 1 would have shipped a free-heal button and a flag
   nothing reads. Revision 2 would have shipped a durable state machine, a save-schema addition, a
   checkpoint surface, and a prompt ACK path in service of one confirmation button. Neither
   reaching `main` is the most valuable outcome here.

V1-C already delivers the actual player-facing goal that was reachable: the confirmed combat
result reaches the story exactly once, and is inspectable on demand. The next post-combat
increment should follow a currency, not precede one.

Verdict: **`V1_D_DEFERRED`**. No implementation branch. No production touch set.
