# COMBAT-STORY-SESSION-BRIDGE-V1-C-GATE-001

Status: DESIGN LOCKED
Risk: High for implementation (save/history schema + durable prompt ACK)
Base: `d89614d7d95752dfee7c16db3d6966531680774e` (`1.84.23`)
Depends on: Bridge V1-A PR #57, Bridge V1-B PR #59

## Goal

Carry an already-applied combat result into later narration without letting AI recompute or alter combat authority.

```text
APPLIED combat outcome
→ deterministic combat consequence fact/history
→ next GM turn or later narration-on-demand prompt block
→ Accepted-correlated durable ACK by receiptHash
```

## Authority lock

Authoritative facts come only from Bridge V1-A/V1-B artifacts:

- `combatBattleHistory` in `game_state.json`;
- matching `.text-adventure/combat/applied/<combatSessionId>.json` marker;
- immutable receipt-derived hashes and outcome fields.

AI may describe, explain, interpret, or dramatize these facts. AI must not change the winner, HP result, terminal code, hashes, or rerun combat.

## Injection surface decision

Use a dedicated GM prompt chunk named `combatConsequence`.

Do **not** append a synthetic `GameEntry`:

- `GameEntry.role` currently supports only `gm` and `user`;
- a generated system fact must not masquerade as GM prose;
- chat-history mutation would mix presentation with simulation authority.

A future deterministic UI event/card is separate scope.

## Fact schema

Add a pure, versioned fact built from one applied history entry plus its matching APPLIED marker.

```ts
interface CombatConsequenceFactV1 {
    schemaVersion: 'combat-consequence-fact-v1';
    combatSessionId: string;
    encounterId: string;
    requestId: string;
    terminalOutcomeCode: string;
    finalTick: number;
    receiptHash: string;
    simulationResultHash: string;
    compiledSnapshotHash?: string;
    sourceCampaignRevision: number;
    playerHpBefore?: number;
    playerHpAfter?: number;
    playerMaxHp?: number;
    playerIncapacitated?: boolean;
}
```

For new applications, extend `CombatBattleHistoryEntry` with the optional player-result snapshot fields already known by `CombatApplyPlan`. Existing history remains valid because the fields are optional. Do not read current live HP later and present it as the combat-end snapshot.

Full roster/casualty narration is outside V1-C unless a later receipt-history schema explicitly persists it.

## Source selection

- Read `combatBattleHistory` in stored order.
- A candidate is eligible only when a matching APPLIED marker exists and its `receiptHash` matches.
- Ignore PENDING and closure artifacts.
- Select at most one oldest unacknowledged fact per prompt assembly.
- If no eligible fact exists, emit no chunk and no token.

## Prompt block

The pure builder emits a bounded structured block similar to:

```text
[Authoritative Combat Consequence]
Encounter: <encounterId>
Outcome: <terminalOutcomeCode>
Final tick: <finalTick>
Player HP after: <value/max when captured>
Receipt: <receiptHash>
Simulation result: <simulationResultHash>

These mechanics are fixed. Narrate their immediate consequences naturally.
Do not change the winner, HP result, hashes, or apply combat state again.
```

Prompt integration:

- chunk id: `combatConsequence`;
- category: `recent_events`;
- priority: `88` (below Chronicle `90`, above Summary `85`);
- pure Inspector/Preview path may display the candidate but must never ACK it;
- production path attaches one consumable token.

## Durable inject-once ACK

Extend `PromptConsumableAckToken`:

```ts
interface CombatConsequenceAckToken {
    tokenId: string; // combatConsequence:<receiptHash>
    chunkId: 'combatConsequence';
    combatSessionId: string;
    receiptHash: string;
    sourceDigest: string;
}
```

ACK is attempted only after trusted `turnResultMatchesPromptReceipt` correlation.

Persist a marker atomically at:

```text
.text-adventure/combat/injected/<receiptHash>.json
```

Marker schema:

```ts
interface CombatConsequenceInjectedMarkerV1 {
    schemaVersion: 'combat-consequence-injected-v1';
    combatSessionId: string;
    receiptHash: string;
    sourceDigest: string;
}
```

ACK result contract:

- matching marker already exists → `alreadySatisfied`;
- atomic marker write succeeds → `applied`;
- mismatch or write failure → `failed` and retain compensation truth.

A crash before Accepted ACK may repeat the fact later; it must never mark an undelivered fact as injected.

## Required implementation touch set

Expected files, kept narrow:

- `src/campaignCombatApplyCore.ts` (+ focused tests);
- new `src/campaignCombatConsequenceCore.ts` (+ tests);
- new or narrowly extended combat marker store (+ tests);
- `src/promptReceiptCore.ts` (+ tests);
- `src/gmPromptBuilderCore.ts`;
- `src/gmPromptBuilder.ts` (+ focused prompt/ACK tests);
- version/changelog/generated registry files when required.

Run `npm run knowledge -- combatConsequence` before introducing the shared chunk/token vocabulary.

## Verification gate

Implementation is High risk because it changes durable history/ACK behavior.

Required:

- focused pure fact-builder and backward-compatibility tests;
- APPLIED/hash mismatch exclusion tests;
- Preview/Inspector no-consume test;
- Accepted-correlated ACK and exact-duplicate no-op tests;
- ACK write-failure compensation test;
- prompt budget/selection test;
- one independent High-risk review;
- one full suite on the final executable tree;
- post-merge smoke proving one narration injection and no repeated injection after Accepted ACK.

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond this risk tier without a concrete reason.

## Out of scope

- changing combat winner or HP mutation rules;
- full participant/casualty synchronization;
- quest/objective/world-state consequences;
- direct `GameEntry` or chat-history insertion;
- automatic extra AI calls;
- UI event cards;
- Future PR C objective-protect work;
- unrelated V1-B P2 follow-ups.

## Implementation verdict

`READY_TO_IMPLEMENT` after this design-only gate is merged. Use a fresh implementation branch from the resulting `main`; do not implement on the design branch.
