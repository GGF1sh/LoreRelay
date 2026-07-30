# COMBAT-STORY-SESSION-BRIDGE-V1-D-001

Status: DESIGN PROPOSED (design-only gate; not implemented)
Risk for implementation: **High** (durable save schema + new exactly-once resolution path + Accepted-correlated ACK)
Base: `6a619b6393caf6f116825346a285fdf078681fa8` (`1.84.30`)
Depends on: Bridge V1-A (PR #57), V1-B (PR #59), V1-C (`COMBAT-STORY-SESSION-BRIDGE-V1-C-GATE-001.md`) — all COMPLETE on `main`.

---

## Problem

V1-C closed the *narration* gap: an APPLIED combat result reaches the next GM turn as an
immutable fact block (`combatConsequence`, priority 88) with a durable inject-once ACK keyed by
`receiptHash`.

The remaining gap is a **player gap**, not a narration gap.

After a battle resolves, the player currently has nothing to decide. The AI narrates the
aftermath and the story simply continues. Longer AI prose does not fix this: a decision only
exists when the player trades one concrete thing for another and the machine — not the model —
records the result.

V1-D adds exactly that layer:

```text
APPLIED combat outcome (V1-B)
→ V1-C consequence injected + Accepted-ACKed
→ deterministic Aftermath opportunity derived (no write)
→ host-rendered decision surface (2–3 mechanical choices)
→ player selects → deterministic resolution + durable marker
→ selection dispatched as a normal Turn
→ one-shot `combatAftermathResolution` prompt chunk (narration only)
```

The AI never sees the choices before they are resolved, never decides eligibility, and never
computes an effect. It receives an already-settled record and describes it.

### What V1-D is not

It is not a loot system, an injury system, a prisoner system, a faction-diplomacy system, or a
pursuit system. It is the smallest surface that makes "what do I do now that the fighting
stopped?" a real question with a durable, non-repeating answer.

---

## Authority split

| Concern | Authority | Never |
| --- | --- | --- |
| Winner, HP, death, survival, `simulationResultHash`, `receiptHash` | Combat Core → receipt → V1-B apply | AI must not restate as new, recompute, or contradict |
| Which aftermath choices exist, and whether each is eligible | Pure deterministic generator over V1-B/V1-C artifacts | AI must not invent, extend, remove, or re-offer choices |
| The mechanical effect of the selected choice | Pure resolver + host durable write | AI must not compute, scale, or reinterpret a number |
| Exactly-once consumption of an opportunity | Durable marker under `.text-adventure/combat/aftermath/` + `game_state` mirror | AI has no part in this path |
| Prose, dialogue, sensory detail, character reaction | AI | AI must not attach a mechanical consequence to its prose |

Restating the ten absolute contracts from the task, and where each is enforced:

1. **AI does not re-decide outcome/HP/death/survival/`simulationResultHash`** — V1-D reads only
   `combatBattleHistory` + APPLIED marker; no receipt re-execution, no new HP source.
2. **AI does not decide applicability or mechanical result** — eligibility and effect are pure
   functions in `campaignCombatAftermathCore.ts`; the AI is not called before resolution.
3. **AI narrates settled choices only** — the only new prompt chunk describes an *already
   resolved* choice (`combatAftermathResolution`).
4. **No synthetic GM `GameEntry`** — the decision surface is a host-rendered UI strip and a prompt
   chunk. Nothing is written into `entries[]` except the player's own selection entry, exactly as
   `selectOption` already does today.
5. **No HP re-application** — the aftermath HP delta is a *separate, additive* effect applied once
   against live `status.hp`, keyed by `resolutionId`. It never re-reads or re-applies
   `playerHpAfter` from the combat snapshot.
6. **No combat receipt reuse** — V1-D never reads `pending/*.json` and never calls
   `applyCombatOutcomeReceiptOnce`. Receipts are already consumed and deleted by V1-B.
7. **V1-C ACK contract untouched** — `combatConsequence` / `injected/<receiptHash>.json` are read
   as a *precondition signal only*. V1-D adds new chunk ids and new marker directories; it does
   not modify V1-C token shape, priority, or ACK semantics.
8. **No redesign of Combat Core, RTS orders, or objective-protect (Future PR C)** — zero touches
   under the battle simulation, order slot, or objective subsystems.
9. **Declining is defined** — see [Lifecycle](#lifecycle): a non-aftermath Accepted turn closes the
   opportunity durably with `disposition: 'declined'`. Declining is a real, recorded choice with
   an opportunity cost, not an escape hatch.
10. **No double consumption across restart / resend / duplicate observation** — one terminal
    marker per `receiptHash`, mirrored in `game_state`, plus an `opportunityDigest` staleness check
    on every inbound selection.

---

## User experience

### Timeline of what the player sees

| Moment | What is visible | Authority |
| --- | --- | --- |
| Battle reaches terminal outcome | Battle View terminal result (existing V1-A/B behavior). **No aftermath surface yet.** | Combat Core |
| Auto-apply on `receipt_pending` (`extension.ts` session observer) or `textadventure.applyPendingCombatOutcomes` | No new chat UI. `combatBattleHistory` + player HP updated silently; APPLIED marker written. | V1-B |
| Player's next turn (any input) | GM narrates the battle's immediate consequence from the V1-C block. On Accepted correlation the `injected/<receiptHash>.json` marker is written. | V1-C |
| The `gameStateUpdate` that follows that turn | **Aftermath strip appears** above `#options-bar`: host-written header, deterministic situation line, and 2–3 mechanical choice chips with visible costs. | **V1-D (new)** |
| Player taps a chip | Selection is validated and resolved *mechanically first*, persisted, then dispatched as a normal turn. GM narrates the settled result. Strip disappears permanently for that battle. | **V1-D (new)** |
| Player types free input instead | Normal turn. On Accepted correlation the opportunity closes as `declined`. Strip disappears permanently for that battle. | **V1-D (new)** |

Deliberate sequencing note: the offer opens **after** the V1-C consequence has actually been
delivered, not at apply time. Two reasons — the player has by then read what happened in the
battle (an uninformed choice is not a decision), and the V1-C injected marker is an existing,
durable, wall-clock-free "the player has been told" signal that costs V1-D no new state.

### Mixed into `options`, or a dedicated surface?

**Dedicated surface. Do not merge into `state.options`.**

`state.options: string[]` (`src/types/GameState.ts:119`) is AI-authored, rewritten wholesale every
GM turn, and carries no identity — `selectOption` matches by exact string
(`src/extension.ts:1169-1172`) and forwards the raw text as free input. Merging aftermath choices
into that array would hand the AI the ability to silently drop, reword, reorder, or fabricate a
mechanical choice on its next turn. That breaks contracts 2 and 3 at the type level.

The aftermath surface is therefore a separate host-authored region:

- new `<div id="combat-aftermath-bar">` rendered **above** `#options-bar` in `webview/index.html`;
- populated only from a host-derived `combatAftermathOffer` view model on `gameStateUpdate`;
- visually distinct from `.option-btn` (own class, own border treatment, a "確定処理 / Resolved
  mechanically" badge and a one-shot "この戦闘で一度だけ" hint);
- each chip shows a deterministic effect hint (e.g. `HP +N · 時間コスト M`), never AI prose;
- selection posts a **new** message type `selectCombatAftermath`, not `selectOption`.

That visual and structural separation is what answers "戦闘結果注入とAftermath選択の違いが分か
る表示": AI narration lives in the chat column, AI options live in `#options-bar`, and machine
decisions live in a labelled strip of their own.

### Free input while the strip is shown

Allowed, always. Free input is a normal turn; the strip is not a modal and never locks input.
The consequence is declared up front in the strip's hint text: acting otherwise forfeits the
aftermath choice for that battle. The forfeit is written durably at that turn's Accepted
correlation, not at input time, so a failed or rejected turn does not consume the opportunity.

### Why it does not repeat

An opportunity is *derived*, never stored while live. It stops deriving the instant its terminal
marker exists. There is exactly one marker per `receiptHash` and it is terminal in every
disposition (`resolved`, `declined`). Additionally only the **newest** eligible battle can offer;
older un-marked battles are `SUPERSEDED` by derivation and never re-surface. The
`combatAftermathResolution` prompt chunk is inject-once per `resolutionId` with its own durable
ACK, so the resolution is narrated exactly once and then never re-enters the prompt.

---

## Schema

All schemas are versioned, wall-clock-free, and derive ordering from
`combatBattleHistory` array order plus `sourceCampaignRevision`. No `createdAt`, no `Date.now()`,
no timestamps in any identity, digest, or ordering decision.

### `CombatAftermathFactV1` (pure, derived, never persisted standalone)

```ts
export const COMBAT_AFTERMATH_FACT_SCHEMA = 'combat-aftermath-fact-v1' as const;

export interface CombatAftermathFactV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_FACT_SCHEMA;
    /** Identity — all three must agree across history entry and APPLIED marker. */
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    encounterId: string;
    /** Immutable combat truth, copied — never recomputed. */
    terminalOutcomeCode: 'ALLY_WIN' | 'ENEMY_WIN' | 'TIMEOUT';
    finalTick: number;
    simulationResultHash: string;
    sourceCampaignRevision: number;
    /** Combat-end player snapshot from V1-C history fields (may be absent on pre-V1-C history). */
    playerHpAfter?: number;
    playerMaxHp?: number;
    playerIncapacitated?: boolean;
    /** sha256Stable over every field above. Stable across restarts and processes. */
    factDigest: string;
}
```

Sources, and nothing else: one `CombatBattleHistoryEntry`
(`src/campaignCombatApplyCore.ts:19`) + its matching `applied/<combatSessionId>.json`
(`CombatAppliedMarker`, which is where `campaignInstanceId` / `timelineEpochId` come from).
Identity is rejected unless `applied.receiptHash === history.receiptHash` **and**
`applied.combatSessionId === history.combatSessionId`, mirroring
`tryBuildCombatConsequenceFact`.

### `CombatAftermathChoiceV1`

```ts
export type CombatAftermathChoiceId = 'RECOVER' | 'SEARCH' | 'WITHDRAW';

export interface CombatAftermathChoiceV1 {
    choiceId: CombatAftermathChoiceId;
    /** i18n keys, not free text — labels stay deterministic and localizable. */
    labelKey: string;
    effectHintKey: string;
    /** Fully determined at generation time; the resolver recomputes and must match. */
    effect: {
        hpDelta: number;          // signed, already clamped against playerMaxHp
        timeCostUnits: number;    // 0 | 1 | 2 in the minimal slice
        flags: string[];          // e.g. ['combat_site_searched'] — bounded, sorted, deduped
    };
}
```

`choiceId` is the **stable ID**; labels may be re-worded or re-translated without changing
identity or any digest.

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
    /** Sorted by fixed choiceId order so the digest is generation-order independent. */
    choices: CombatAftermathChoiceV1[];
    /** sha256Stable({schemaVersion, opportunityId, factDigest, choices}) — the idempotency key. */
    opportunityDigest: string;
}
```

### `CombatAftermathResolutionV1` (persisted in `game_state`)

```ts
export const COMBAT_AFTERMATH_RESOLUTION_SCHEMA = 'combat-aftermath-resolution-v1' as const;
export const COMBAT_AFTERMATH_HISTORY_KEY = 'combatAftermathHistory';
export const COMBAT_AFTERMATH_HISTORY_LIMIT = 20; // mirrors COMBAT_BATTLE_HISTORY_LIMIT

export interface CombatAftermathResolutionV1 {
    schemaVersion: typeof COMBAT_AFTERMATH_RESOLUTION_SCHEMA;
    /** sha256Stable({opportunityId, opportunityDigest, choiceId}) — narration ACK key. */
    resolutionId: string;
    opportunityId: string;
    opportunityDigest: string;
    receiptHash: string;
    combatSessionId: string;
    campaignInstanceId: string;
    timelineEpochId: string;
    sourceCampaignRevision: number;
    disposition: 'resolved' | 'declined';
    /** Present only when disposition === 'resolved'. */
    choiceId?: CombatAftermathChoiceId;
    /** What was actually applied — recomputed by the resolver, not copied from the client. */
    appliedEffect?: {
        hpBefore: number;
        hpAfter: number;
        playerMaxHp: number;
        timeCostUnits: number;
        flags: string[];
    };
}
```

`combatAftermathHistory` lives in `game_state.json` alongside `combatBattleHistory`, bounded to
20 entries by the same `.slice(-LIMIT)` rule.

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
    disposition: 'resolved' | 'declined';
    resolutionId?: string;   // required when disposition === 'resolved'
    choiceId?: CombatAftermathChoiceId;
}
```

Path sanitization follows `injectedConsequencePath` exactly: hex-only, ≤128 chars, `'invalid'`
fallback (`src/campaignCombatPendingStore.ts:36-39`). Written with
`writeJsonAtomicNoVscode`.

### `CombatAftermathNarratedMarkerV1` (durable inject-once ACK, symmetric with V1-C)

```text
.text-adventure/combat/aftermathNarrated/<resolutionId>.json
```

```ts
export interface CombatAftermathNarratedMarkerV1 {
    schemaVersion: 'combat-aftermath-narrated-v1';
    resolutionId: string;
    receiptHash: string;
    sourceDigest: string;   // hashPromptReceiptText(block) — same discipline as V1-C
}
```

### Identity, digests, and idempotency keys — summary

| Purpose | Key | Scope |
| --- | --- | --- |
| One decision per battle | `receiptHash` | `aftermath/<receiptHash>.json` |
| Staleness / resend rejection | `opportunityDigest` | inbound `selectCombatAftermath` |
| One narration per decision | `resolutionId` | `aftermathNarrated/<resolutionId>.json` |
| Cross-campaign / cross-timeline isolation | `campaignInstanceId` + `timelineEpochId` | every schema above |
| Ordering | `combatBattleHistory` index, then `sourceCampaignRevision` | derivation only |

---

## Lifecycle

Five states. Only two of them ever touch durable storage, and both of those writes are terminal.

```text
                     (V1-C injected marker exists for this receiptHash,
                      newest eligible battle, no aftermath marker)
   ┌──────────┐   derive    ┌─────────┐   render    ┌───────────┐
   │ (no      │ ──────────► │ OFFERED │ ──────────► │ PRESENTED │
   │  offer)  │             └────┬────┘             └─────┬─────┘
   └──────────┘                  │                        │
                                 │ newer battle           │ selectCombatAftermath
                                 │ opens an offer         │  (digest matches)
                                 ▼                        ▼
                          ┌────────────┐            ┌──────────┐
                          │ SUPERSEDED │            │ RESOLVED │  ◄── durable, terminal
                          └────────────┘            └──────────┘
                                 ▲                        ▲
                                 │                        │
                       (derived; no write)      ┌──────────┴──────────┐
                                                │      DECLINED       │  ◄── durable, terminal
                                                │ (non-aftermath turn │
                                                │  reaches Accepted)  │
                                                └─────────────────────┘
```

| State | Durable authority | Retryable | Crash window | Restart recovery | Duplicate observation |
| --- | --- | --- | --- | --- | --- |
| **OFFERED** | **None — purely derived.** `combatBattleHistory` + `applied/` + `injected/` present, `aftermath/` absent, newest eligible battle. | N/A (recomputation is the retry) | None — nothing is written | Re-derives identically; nothing was consumed, so nothing is lost or duplicated | Idempotent by construction: the same inputs yield a byte-identical `opportunityDigest` |
| **PRESENTED** | **None — ephemeral UI only.** Explicitly non-authoritative; the webview may render it any number of times. | Yes, freely | None | Re-renders from a fresh derivation on `gameStateUpdate` | Harmless — presentation grants nothing |
| **SUPERSEDED** | **None — derived.** A strictly newer battle in `combatBattleHistory` has an open or terminal offer. | N/A | None | Re-derives identically | Idempotent |
| **RESOLVED** | `combatAftermathHistory` entry in `game_state.json` **and** `aftermath/<receiptHash>.json`. `game_state` is the primary; the marker is the fast gate. | Yes — the write path is idempotent on `resolutionId` | Between the `game_state` write and the marker write. Same window V1-B already tolerates. | **Repair path:** if `combatAftermathHistory` already contains the `resolutionId` but the marker is missing, rewrite the marker only — never re-apply HP. Mirrors `stateHasReceiptApplied` repair in `campaignCombatApplyHost.ts:133-160`. | Second `selectCombatAftermath` with the same `opportunityDigest` returns `already_resolved` and mutates nothing. A different `choiceId` for a resolved `receiptHash` is **rejected**, not applied. |
| **DECLINED** | Same two artifacts, `disposition: 'declined'`, `appliedEffect` absent. Written only after `turnResultMatchesPromptReceipt` correlation. | Yes — idempotent on `receiptHash` | Crash before Accepted correlation leaves the offer OFFERED. That is correct: an undelivered turn must not consume the decision. | Offer re-derives and is presented again | `alreadySatisfied` when an identical decline marker exists; `failed` on `receiptHash` collision with a different disposition |

Deliberate rejections of the suggested `AVAILABLE → PRESENTED → SELECTED → RESOLVED` chain:

- **`PRESENTED` must not be durable.** Persisting it would add a write on every render, a crash
  window with nothing to protect, and a restart question ("was it shown?") that has no
  player-visible answer. Presentation is not authority.
- **`SELECTED` must not be a distinct persisted state.** A two-phase `SELECTED → RESOLVED` split
  introduces a durable intermediate that a crash can strand, requiring a resume/rollback path for
  no benefit. Selection and resolution happen inside one host call whose only durable output is
  the terminal record — the same shape V1-B already proved for apply.
- **A terminal `SUPERSEDED`/`EXPIRED` write is unnecessary.** Both are functions of the history
  array, so deriving them costs nothing and cannot drift from the data.

---

## Determinism / idempotency

1. **No wall clock anywhere.** Not in identity, digests, ordering, eligibility, or expiry. Ordering
   uses `combatBattleHistory` array order then `sourceCampaignRevision`; the "player has been
   told" gate uses the V1-C injected marker's existence, not elapsed time.
2. **Generation is a pure function** `buildCombatAftermathOpportunity(fact) → Opportunity | undefined`
   with no I/O, no randomness, and no configuration reads. Same fact ⇒ same
   `opportunityDigest`, byte for byte, across processes and machines.
3. **The resolver recomputes.** `resolveCombatAftermathChoice` re-derives the opportunity from
   current durable state and re-derives the effect from `choiceId`. The client's submitted
   `opportunityDigest` is only ever compared, never trusted as input to a calculation. A mismatch
   is `STALE_OPPORTUNITY` and applies nothing.
4. **Exactly-once is gated on `receiptHash`**, checked in this order:
   `aftermath/<receiptHash>.json` exists → `combatAftermathHistory` contains the `resolutionId` →
   derive → validate digest → write `game_state` → write marker.
5. **HP is additive and single-source.** `hpBefore` is read from live `status.hp.current` at
   resolve time; `hpAfter = clamp(0, playerMaxHp, hpBefore + hpDelta)`. The combat-end snapshot
   (`playerHpAfter`) is used **only** for eligibility, never as an HP source. This is why V1-D
   cannot double-apply combat HP even in principle.
6. **Checkpoint / rewind parity with V1-C.** Checkpoints must snapshot and restore
   `combatAftermathHistory` exactly as `COMBAT-STORY-SESSION-BRIDGE-V1-C-GATE-001.md` requires for
   `combatBattleHistory` (`src/checkpointCombatCore.ts`). Losing it on restore would make a
   resolved aftermath re-derive as OFFERED once the marker/history pair disagreed. Side files
   under `.text-adventure/combat/` remain workspace-scoped and are not embedded in chat history —
   the marker therefore still blocks a second resolution after a rewind, which is the correct
   conservative behavior.
7. **Prompt chunk atomicity.** `combatAftermathResolution` is all-or-nothing under the global
   prompt budget, inheriting the V1-C rule verbatim: if the block would be truncated or dropped,
   omit the entire chunk **and** its ACK token. Never durable-ACK a partial block.
8. **Decline is independent of the prompt budget.** The decline marker is written because a
   non-aftermath turn reached Accepted, not because any block was injected. Prompt inclusion and
   decline consumption are deliberately decoupled so a budget-evicted chunk cannot advance an ACK.

---

## Prompt boundary

Exactly one new chunk. Registered alongside the V1-C entry in `gmPromptBuilder.ts:275`:

- chunk id: `combatAftermathResolution`
- category: `recent_events`
- priority: `87` (below `combatConsequence` 88, above Summary 85)
- selection: oldest un-narrated `combatAftermathHistory` entry with `disposition: 'resolved'` and
  no `aftermathNarrated/<resolutionId>.json`; at most one per prompt assembly; no eligible entry
  ⇒ no chunk and no token
- Inspector/Preview path may display the candidate and must **never** ACK it (same
  `buildCombatConsequenceCandidate` split at `gmPromptBuilder.ts:1389`)

Block text:

```text
[Authoritative Combat Aftermath — Already Resolved]
Encounter: <encounterId>
Battle outcome: <terminalOutcomeCode>
Player chose: <choiceId>
Player HP: <hpBefore> → <hpAfter>/<playerMaxHp>
Time spent: <timeCostUnits>
Recorded: <flags joined, or "(none)">
Receipt: <receiptHash>
Resolution: <resolutionId>

These facts are immutable and have already been applied to the game state.
These choices were generated mechanically, not by you.
Narrate only what this choice looked like, sounded like, and cost.
Do not invent rewards, loot, deaths, HP changes, injuries, prisoners, survivors,
factions, discoveries, or time passing beyond the values above.
Do not offer, imply, or resolve any further aftermath option.
Do not present these numbers as something happening now; they have already happened.
```

The **offer** is intentionally *not* injected in the minimal slice. The AI is never told which
choices are on the table, so it cannot pre-empt one, argue for one, resolve one in prose, or
fabricate a fourth. Making the AI offer-aware is a V1-E question, not a V1-D one.

Durable ACK reuses the V1-C mechanism unchanged in shape:

```ts
interface CombatAftermathAckToken {
    tokenId: string;               // combatAftermathResolution:<resolutionId>
    chunkId: 'combatAftermathResolution';
    resolutionId: string;
    receiptHash: string;
    sourceDigest: string;          // hashPromptReceiptText(block)
}
```

ACK is attempted only after trusted `turnResultMatchesPromptReceipt` correlation, and returns
`applied` / `alreadySatisfied` / `failed` with the same compensation-queue behavior as
`ackCombatConsequenceInjectedMarker` (`src/campaignCombatPendingStore.ts:87-122`).

---

## Player decision surface

The minimal slice puts **three** things on the table and forces the player to spend one to keep
another:

| Axis | In the first slice? | How it bites |
| --- | --- | --- |
| **Immediate safety** | ✅ | `WITHDRAW` ends the scene now and forfeits everything else |
| **Time** | ✅ | `timeCostUnits` is recorded on every resolution; `RECOVER` and `SEARCH` cost, `WITHDRAW` does not |
| **Injury** | ✅ | `RECOVER` is the *only* way to convert time into HP; `hpDelta` is bounded |
| **Information** | ✅ | `SEARCH` yields a durable flag, never HP and never items |
| **Resource** | ❌ deferred to V1-E | Requires loot/inventory economy — out of scope |

The single structural rule that makes this a decision rather than a menu:
**one opportunity per battle, one choice per opportunity, terminal.** Every option is therefore
paid for with the options not taken.

### Why no option is a free win

- **`RECOVER` is not free healing.** `hpDelta` is a bounded fraction of the missing HP with a hard
  cap, never a full heal, and it costs the search. Its eligibility (`playerHpAfter < playerMaxHp`)
  means a healthy player cannot bank it.
- **`SEARCH` is not always optimal.** It is ineligible when `terminalOutcomeCode !== 'ALLY_WIN'`
  (you do not hold the ground) and ineligible below an HP-ratio threshold (you are in no shape to
  linger). It returns information only — never HP, never items — so a hurt player who takes it is
  strictly worse off than one who recovers.
- **`WITHDRAW` is not a free escape.** It is the universal fallback and always eligible, but it
  forfeits both HP recovery and the site flag. Choosing it when injured and victorious is a real
  loss.
- **Declining is not better than choosing.** It is mechanically identical to `WITHDRAW` minus the
  recorded intent, and it is durably logged as `declined` so later systems can read it.

Concrete minimal-slice generation table (`terminalOutcomeCode` × player HP state), all values
subject to a single pure `deriveEffect(choiceId, fact)`:

| Fact | RECOVER | SEARCH | WITHDRAW |
| --- | --- | --- | --- |
| `ALLY_WIN`, HP full | ✗ (nothing to heal) | ✓ | ✓ |
| `ALLY_WIN`, HP below max, ratio ≥ threshold | ✓ | ✓ | ✓ |
| `ALLY_WIN`, HP ratio < threshold | ✓ | ✗ (too hurt to linger) | ✓ |
| `ENEMY_WIN` | ✓ (if below max) | ✗ (field is not yours) | ✓ |
| `TIMEOUT` | ✓ (if below max) | ✗ (contested field) | ✓ |
| `playerIncapacitated === true` | — | — | **no opportunity is generated at all** |

An opportunity with fewer than two eligible choices is not generated. `WITHDRAW` alone is not a
decision.

---

## Minimal slice

One PR. Three choice ids. No new receipt persistence. No new AI call.

**In:**

1. Pure `campaignCombatAftermathCore.ts`: fact builder, opportunity generator (RECOVER / SEARCH /
   WITHDRAW), effect deriver, resolution builder, digest helpers, prompt block formatter, history
   list/append helpers.
2. Durable `campaignCombatAftermathHost.ts`: derive-current-offer, resolve-once, decline-once,
   marker repair path.
3. Marker storage in `campaignCombatPendingStore.ts`: `aftermath/` and `aftermathNarrated/`
   read/write/ack, following `injectedConsequencePath` sanitization and atomic-write discipline.
4. Prompt integration: `combatAftermathResolution` chunk + Accepted-correlated ACK token +
   Inspector no-consume path.
5. Webview surface: `#combat-aftermath-bar` strip, render on `gameStateUpdate`, distinct styling,
   one-shot hint, `selectCombatAftermath` message.
6. Host wiring: `webviewHandlers.ts` case → resolve → dispatch `handlePlayerInput` as a normal turn
   with the selected choice's canonical action text.
7. `combatAftermathHistory` in `GameState` + checkpoint snapshot/restore parity.
8. i18n keys for labels, effect hints, header, and the one-shot warning.

**Out (explicitly, and why):**

| Deferred | Reason |
| --- | --- |
| Prisoners, survivors, interrogation | Needs durable participant/casualty data that no artifact currently persists post-apply |
| Pursuit / chase of fleeing enemies | Needs enemy survival state; only `terminalOutcomeCode` survives apply |
| Loot, salvage, item economy | Needs an inventory transaction contract; `SEARCH` yields a flag, not goods |
| Full injury / wound / condition system | V1-D moves one bounded HP delta; nothing more |
| Faction reporting, intimidation, diplomacy | Needs faction reputation write authority |
| Making the AI offer-aware before resolution | Would hand the model a lever over unresolved mechanics |
| Multi-step or branching aftermath scenes | Second decision needs a second opportunity contract |
| Persisting the full receipt for richer generation | Schema growth on the V1-B path; separate gate |
| Advancing a campaign clock from `timeCostUnits` | See Open Question 1 |
| Combat Core, RTS orders, objective-protect (Future PR C) | Contract 8 |

---

## Failure / exploit analysis

| # | Attack | Defense |
| --- | --- | --- |
| 1 | **`SEARCH` is always the right button** | Ineligible unless `ALLY_WIN` *and* HP ratio ≥ threshold; yields information only, never HP or items; forfeits `RECOVER`. A hurt winner who searches is strictly worse off. |
| 2 | **Free healing** | `RECOVER` is one-shot per battle, bounded below full, gated on `playerHpAfter < playerMaxHp`, costs `timeCostUnits`, and forfeits `SEARCH`. It cannot be re-triggered: the marker is terminal. |
| 3 | **Free withdrawal** | `WITHDRAW` forfeits both other outcomes and is durably recorded. It is the correct choice sometimes, which is the point. |
| 4 | **AI prose overrides the mechanical result** | The AI never sees the offer, only the settled resolution. Its block carries five explicit prohibitions. `appliedEffect` is written to `game_state` **before** the turn is dispatched, so no AI output can precede or alter it. AI text has no write path to HP, flags, or history. |
| 5 | **Resend the selection for a double reward** | The inbound message carries `opportunityDigest`. After resolution the opportunity no longer derives, so the digest cannot match anything → `ALREADY_RESOLVED`, zero mutation. Additionally the `receiptHash` marker check precedes all derivation. |
| 6 | **Restart resurrects a spent choice** | Two independent durable records (`game_state.combatAftermathHistory` + `aftermath/<receiptHash>.json`) and a repair path that rewrites only the missing marker. Restart between the two writes repairs; it never re-applies HP. |
| 7 | **`receiptHash` cross-wiring** | Every schema carries `receiptHash` + `combatSessionId` + `campaignInstanceId` + `timelineEpochId`, and generation rejects any history/APPLIED pair whose `receiptHash` or `combatSessionId` disagree — the same predicate V1-C uses. A marker whose `receiptHash` matches but whose digest or session differs returns `failed`, never `alreadySatisfied`. |
| 8 | **An old battle's aftermath appears after a new battle** | Only the **newest** eligible entry in `combatBattleHistory` can offer; every older un-marked entry derives as `SUPERSEDED` and is never presented. |
| 9 | **Prompt budget eviction advances the ACK** | Two separate defenses: the resolution chunk is all-or-nothing (drop the block ⇒ drop the token), and the *decline* path never depends on prompt inclusion at all — it keys on Accepted correlation of a non-aftermath turn. |
| 10 | **Never choosing, to dodge the cost** | Declining is durably recorded at Accepted correlation and forfeits the recovery and the flag. There is no state in which not choosing dominates choosing. |
| 11 | **Combat narration reappears every turn** | Untouched V1-C guarantee (`injected/<receiptHash>.json`), plus the new symmetric `aftermathNarrated/<resolutionId>.json`. Neither block can re-enter the prompt after its Accepted ACK. |
| 12 | **Rewind to before the decision to re-roll it** | Side markers are workspace-scoped and survive a chat-history rewind, so the decision stays spent. This is the conservative direction: a lost opportunity, never a duplicated reward. Called out as a known, accepted behavior. |
| 13 | **Client submits a forged `choiceId` or effect** | The host ignores every client-supplied number. It re-derives the opportunity and re-derives the effect from `choiceId` alone; an ineligible or unknown `choiceId` returns `INELIGIBLE_CHOICE` and mutates nothing. |
| 14 | **Concurrent GM turn races the resolution write** | Resolution persists through `mergeGameStateForPersist` with `readStateRevision`, exactly as `applyCombatOutcomeReceiptOnce` does (`campaignCombatApplyHost.ts:163-170`), so a concurrent turn observes the revision bump. |
| 15 | **Incapacitated player is offered a choice** | No opportunity is generated when `playerIncapacitated === true`; the game-over path owns that state. |

---

## Acceptance criteria

Machine-testable. Each maps to at least one focused test.

1. `buildCombatAftermathFact` returns `undefined` when the APPLIED marker is missing, or when
   `receiptHash` / `combatSessionId` disagree with the history entry.
2. `buildCombatAftermathOpportunity` is pure and stable: the same fact produces an identical
   `opportunityDigest` across repeated calls and across independently constructed equal inputs.
3. Generation honors the eligibility table: `SEARCH` absent unless `ALLY_WIN` and HP ratio ≥
   threshold; `RECOVER` absent at full HP; `WITHDRAW` always present.
4. No opportunity is generated when `playerIncapacitated === true`, or when fewer than two choices
   would be eligible.
5. Only the newest eligible `combatBattleHistory` entry yields an offer; an older un-marked entry
   derives as `SUPERSEDED` and is never returned.
6. No offer is derived until `injected/<receiptHash>.json` exists (V1-C consequence delivered).
7. `resolveCombatAftermathChoice` applies `hpDelta` against **live** `status.hp.current`, clamped
   to `[0, playerMaxHp]`, and never reads `playerHpAfter` as an HP source.
8. Resolving twice with the same `opportunityDigest` mutates `game_state` exactly once; the second
   call returns `already_resolved` with byte-identical state.
9. A selection carrying a stale or mismatched `opportunityDigest` returns `STALE_OPPORTUNITY` and
   mutates nothing; an unknown or ineligible `choiceId` returns `INELIGIBLE_CHOICE` and mutates
   nothing.
10. Repair path: when `combatAftermathHistory` contains the `resolutionId` but the marker file is
    missing, the host rewrites only the marker — HP, flags, and history are unchanged.
11. A non-aftermath turn reaching Accepted correlation writes a `declined` marker; the offer stops
    deriving. A turn that does **not** reach Accepted leaves the offer intact.
12. The `combatAftermathResolution` chunk is emitted at most once per `resolutionId`, is absent
    when `aftermathNarrated/<resolutionId>.json` exists, and is absent entirely when no resolved
    entry is un-narrated.
13. Prompt-budget atomicity: when the chunk cannot fit, both the block and its ACK token are
    omitted, and no `aftermathNarrated` marker is written.
14. The Inspector/Preview path can render the candidate block without writing any marker
    (no-consume), verified by asserting marker absence after a preview.
15. Checkpoint round-trip preserves `combatAftermathHistory`; after save→restore, a resolved
    opportunity does not re-derive as OFFERED.
16. V1-C regression: `combatConsequence` selection, priority, token shape, and
    `injected/<receiptHash>.json` ACK outcomes are unchanged by V1-D's presence, including when
    both chunks are candidates in the same assembly.

---

## Suggested touch set

Verified against `main` @ `6a619b6`. Implementation is **not** part of this task.

**New**

- `src/campaignCombatAftermathCore.ts` — pure fact/opportunity/effect/resolution/prompt-block
- `src/campaignCombatAftermathCore.test.ts`
- `src/campaignCombatAftermathHost.ts` — derive current offer, resolve once, decline once, repair
- `src/campaignCombatAftermathHost.test.ts`

**Modified**

- `src/campaignCombatPendingStore.ts` — `aftermathMarkerPath`, `aftermathNarratedPath`, read/write/ack
- `src/gmPromptBuilder.ts` — chunk registry (`:275`), candidate builder (near `:1389`), ACK token
  application (near `:1432`), Inspector chunk (`:1678`), chunk map (`:1854`), token override
  (`:2402`)
- `src/gmPromptBuilderCore.ts` — chunk id/priority/category
- `src/promptReceiptCore.ts` — `PromptConsumableAckToken` union member
- `src/webviewHandlers.ts` — `case 'selectCombatAftermath'` (near `:183`)
- `src/extension.ts` — resolve-then-dispatch wiring alongside `handlePlayerInput` (near `:1167`)
- `src/types/GameState.ts` — `combatAftermathHistory`, `combatAftermathOffer` view model (near `:119`)
- `src/checkpoint.ts`, `src/checkpointCombatCore.ts` — snapshot/restore `combatAftermathHistory`
- `webview/index.html` — `#combat-aftermath-bar` above `#options-bar` (`:183`)
- `webview/modules/10-game-state.js` — `renderCombatAftermath` beside `renderOptions` (`:604`)
- `webview/modules/00-core.js` — element handle (near `:58`)
- `webview/styles/10-layout-chat.css` — distinct strip styling (near `:525`)
- `webview/script.js` — legacy bundle parity (`:1478`)
- locale files, `package.json` version, `CHANGELOG.md`, generated registry

Run `npm run knowledge -- combatAftermath` before introducing the shared chunk / message / state
vocabulary.

**Verification gate for the implementation PR:** High risk (durable save schema + exactly-once
resolution + Accepted-correlated ACK). Required — focused pure generation/eligibility/digest
tests; resolve-once and repair-path tests; stale-digest and ineligible-choice rejection tests;
decline-on-Accepted test; prompt selection/budget/no-consume tests; V1-C regression test;
checkpoint round-trip test; one independent High-risk review; one full suite on the final
executable tree; a post-merge smoke proving one offer, one resolution, one narration, and no
re-offer. Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`; do not
escalate beyond this tier without a concrete reason.

---

## Open questions

1. **Is there a canonical campaign clock that `timeCostUnits` should advance?** This design
   records `timeCostUnits` on every resolution but does not bind it to a world/turn clock, because
   no such authoritative field was confirmed within this task's read scope. If one exists, the
   binding is a two-line addition to the resolver and materially strengthens the time axis; if
   not, the opportunity cost still holds via the one-shot rule. **Decide before implementation.**
2. **Should `SEARCH`'s flag be a `game_state` boolean or a lorebook/world-flag entry?** A plain
   `flags: string[]` on the resolution is the minimal form and is what this design specifies, but
   if a canonical world-flag ledger exists it is the better home and avoids a second migration.
3. **Should a rewind past a resolved aftermath restore the opportunity?** This design says no
   (markers are workspace-scoped and survive), matching V1-C's conservative stance. If playtest
   shows rewind is a normal authoring loop rather than an exceptional recovery, a
   checkpoint-scoped marker set is the alternative — but it reopens exploit #6 and must be gated
   separately.

---

## Final recommendation

Implement V1-D as the three-choice slice above, in one High-risk PR, on a fresh branch cut from
the `main` that results from merging this design gate.

The load-bearing decisions, in order of how much they buy:

1. **The offer is derived, never stored while live.** Restart, duplicate observation, and preview
   become non-events instead of state-machine hazards, and the only durable writes are terminal.
2. **The offer opens on the V1-C injected marker, not at apply time.** The player decides after
   reading what happened, and V1-D gets a free, wall-clock-free sequencing signal.
3. **The decision surface is host-authored and structurally separate from `state.options`.** The
   AI cannot reword, drop, reorder, or fabricate a mechanical choice, because those choices never
   pass through it.
4. **The AI is not offer-aware.** It only ever sees a settled resolution, which removes an entire
   category of "the model resolved the mechanic in prose" failures rather than prohibiting it in
   English and hoping.
5. **One opportunity per battle, one choice, terminal — including declining.** This is what makes
   RECOVER / SEARCH / WITHDRAW a trade instead of a reward menu, and it is why the slice can stay
   this small and still feel like a decision.

Routing suggestion for the implementation PR, per `docs/AI_MODEL_ASSIGNMENT_POLICY.md`: **Codex
5.6 Sol** — correctness-critical durable state transitions with an exactly-once contract — with
the UI strip splittable to a bounded-code model if the PR is separated. Do not route to any 5.5
variant.

Verdict: `READY_TO_IMPLEMENT` once this design-only gate is merged. Do not implement on this
design branch.
