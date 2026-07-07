# NOAI Phase 1A Implementation Gate

Status: GATE_READY_FOR_ADVERSARIAL_REVIEW  
Date: 2026-07-07 JST  
Owner: ChatGPT / GPT-5.5 / High reasoning  
Source of truth: `origin/main` at `4b9db3016cdb89d9520166040a2471098adeea04`  
Branch: `task/NOAI-PHASE1A-implementation-gate`

## 1. Goal

Design only the minimal implementation contract for:

```text
deterministic direct Travel
→ authoritative Time advance
→ location mutation
→ stable Travel Event history
```

No implementation or merge is performed by this gate.

## 2. Source-of-truth conclusions

The required documents and current source show:

- NOAI Phase 0 is merged and post-merge smoke passed (`226/226`).
- Commerce is the proven deterministic direct-action pilot.
- `travelEncounterCore.findRegionPath()` already provides pure deterministic route connectivity.
- `worldSimBulkCore.runBulkWorldSimulation()` already provides pure multi-step Time simulation.
- current AI TurnResult flow mutates location before `elapsedWorldTurns`; Phase 1A must not copy that ordering.
- `WorldChangeEvent` / `recentChanges` remains the canonical visible history backbone.
- current `executeCrossFileDualWrite()` detects partial writes but is explicitly not an atomic transaction.
- State Orchestrator has pure 2PC planning/sequence cores, but current runtime is not a finished generic transaction host that Phase 1A can simply invoke.
- the World tab already has discovered location pins and a location detail panel in `webview/modules/85-world.js`.

## 3. Hard scope boundary

### In scope

- one direct Travel action;
- deterministic route validation;
- deterministic route-hop duration;
- authoritative world Time advancement;
- destination location + Fog mutation;
- one stable Travel Event;
- retry / duplicate protection;
- recoverable failure behavior;
- reuse of existing travel/time/fog/event cores.

### Out of scope

- route risk;
- weather;
- random encounter;
- rumor;
- contract;
- town action budget;
- AI narration;
- direct rest/wait;
- other direct actions;
- transport-demand generation;
- Commerce shortage logic;
- global `worldEventLogCore` identity changes;
- finishing State Orchestrator SO3 generally.

## 4. Canonical action contract

Phase 1A must execute in this semantic order:

```text
1. player chooses destination
2. host creates one stable Travel identity
3. fresh origin + fresh worldTurn authority are loaded
4. route + duration are deterministically planned
5. Time is applied exactly once
6. location/Fog is applied only after Time succeeds
7. Travel Event history is finalized only after location succeeds
8. retry resumes the first incomplete phase
```

No AI provider, prompt, TurnResult, narration, or free-text parser participates.

## 5. Action-time intent vs persist-time authority

Action-time intent is only:

```ts
interface DirectTravelIntent {
    travelId: string;
    destinationLocationId: string;
}
```

`travelId` is generated once at the host action boundary using the existing Phase 0 identity primitive (`createPromptReceiptId()`, optionally aliased for Travel).

The Webview supplies only `destinationLocationId`.

The Webview is not authority for:

- origin;
- route;
- duration;
- start/end `worldTurn`;
- event ID;
- event message.

Before the first canonical mutation, fresh-read:

- `game_state.json`;
- `world_state.json`;
- World Forge;
- Game Rules;
- NPC registry when NPC simulation is enabled.

Authority is:

```text
fromLocationId = fresh game_state.world.currentLocationId
startWorldTurn = fresh world_state.worldTurn
```

## 6. Phase 0 Commerce barrier

Before the Travel authority snapshot:

```text
flushScheduledCommercePersist()
```

must run.

If Commerce persistence cannot settle, Travel fails before Time/location/history mutation.

This prevents:

```text
pending trade
→ Travel advances old market state
→ trade flushes afterward
```

and preserves future:

```text
Commerce shortage → Transport demand → Travel
```

## 7. Destination validation

A new plan is allowed only when:

1. World Forge exists.
2. authoritative world simulation is enabled.
3. fresh current location exists in Forge.
4. destination exists in Forge.
5. destination differs from current location.
6. destination is discovered by fresh Fog authority.
7. origin/destination resolve to regions.
8. `findRegionPath()` returns a path.

Required bounded failures include:

- `SIM_OFF`
- `NO_CURRENT_LOCATION`
- `INVALID_DESTINATION`
- `DESTINATION_UNDISCOVERED`
- `ALREADY_THERE`
- `NO_ROUTE`
- `TRAVEL_RECOVERY_REQUIRED`
- `REPAIR_REQUIRED`

Validation failure performs zero canonical mutation.

## 8. Deterministic route and duration

Reuse only route connectivity from `travelEncounterCore`:

```text
routeRegionIds = findRegionPath(regions, fromRegionId, toRegionId)
```

Do not call `rollTravelEncounters()`.

Phase 1A duration is exactly:

```text
same region: 1 world step
otherwise: max(1, routeRegionIds.length - 1)
```

Then apply the existing world-turn clamp.

No duration modifier comes from weather, danger, transport, cargo, shortage, rumors, contracts, or encounters.

The committed plan freezes route and steps for retry.

Recommended field:

```text
planVersion: 1
```

## 9. Canonical plan

```ts
interface DirectTravelPlan {
    planVersion: 1;
    travelId: string;
    eventId: string;
    fromLocationId: string;
    toLocationId: string;
    fromRegionId: string;
    toRegionId: string;
    routeRegionIds: string[];
    travelSteps: number;
    startWorldTurn: number;
    endWorldTurn: number;
}
```

`endWorldTurn` equals the actual computed world-state result, not `start + guessed steps` from UI state.

## 10. Durable same-write Travel receipt

Stable event IDs alone cannot prove Time was applied exactly once.

Critical failure window:

```text
world Time write succeeds
→ process dies
→ retry
```

Therefore Time advancement and its Travel witness must be one `world_state` write.

Add a bounded typed receipt:

```ts
interface DirectTravelReceipt {
    schemaVersion: 1;
    planVersion: 1;
    phase: 'time_applied' | 'completed';
    travelId: string;
    eventId: string;
    fromLocationId: string;
    toLocationId: string;
    fromRegionId: string;
    toRegionId: string;
    routeRegionIds: string[];
    travelSteps: number;
    startWorldTurn: number;
    endWorldTurn: number;
    npcSourceDigest?: string;
    npcTargetDigest?: string;
    npcStageFile?: string;
}
```

WorldState field:

```text
directTravelReceipts?: DirectTravelReceipt[]
```

Rules:

- at most one non-completed receipt;
- malformed active receipt fails closed;
- active receipt is never removed by the completed-receipt cap;
- keep up to 128 completed receipts;
- completed receipt is execution/idempotency authority, not a second visible history stream.

Hard invariant:

```text
there is no state where Travel advanced worldTurn
but no durable Travel receipt exists
```

## 11. Existing Time core reuse

Do not create a second simulation loop.

Extract/reuse one no-write computation path preserving the current semantics of `persistWorldSimulationSteps()`:

- current rules;
- current Forge;
- `runBulkWorldSimulation()`;
- current `enableNpcRegistry` behavior;
- current `applyLivingWorldAfterSimulationStep()` behavior;
- current summary semantics.

Recommended refactor in `worldSimPersist.ts`:

```text
compute from already-fresh snapshots
→ return next world state + optional next NPC registry + summary
→ caller decides persistence ordering
```

Existing `persistWorldSimulationSteps()` should use the same computation helper.

Forbidden:

- a Travel-specific tick loop;
- omitting Living World after-step behavior;
- calling `persistWorldSimulationSteps()` and trying to repair ordering afterward.

## 12. Departure snapshot ordering

Before simulation, on the fresh pre-travel world snapshot:

```text
recordLocationVisit(startState, fromLocationId, startState.markets)
```

must record departure at `startWorldTurn`.

Then Time advances.

Required meaning:

```text
fresh origin
→ departure snapshot at start turn
→ Time advance
→ arrival location mutation
```

Do not stamp departure with the end turn.

This preserves future shortage/market-delta reasoning.

## 13. NPC side-ledger recovery

When NPC simulation is disabled, skip this section.

When enabled, stage the exact computed NPC target before Time authority commits, for example:

```text
.text-adventure/runtime/noai-direct-travel/<travelId>/npc_registry.target.json
```

Receipt records:

- source digest;
- target digest;
- stage-file reference.

After Time+receipt commit:

```text
if current NPC digest == target:
    already applied
else if current NPC digest == source:
    write exact staged target and verify target digest
else:
    REPAIR_REQUIRED
```

Never overwrite a third unexpected generation.

If required staging data is missing, fail `REPAIR_REQUIRED` and do not mutate location/history.

## 14. Location mutation ordering and authority

Location mutation runs only after:

- Time+receipt is durable;
- required NPC convergence is satisfied.

Fresh-read `game_state` and compare to active receipt:

```text
current == from: apply location phase
current == to: already satisfied; continue
current == anything else: REPAIR_REQUIRED
```

Reuse `applyFogOnLocationVisit()`.

Travel owns only:

- `world.currentLocationId`;
- `world.visitedLocationIds` changes from Fog core;
- `world.discoveredRegionIds` changes from Fog core.

Add a narrow game-state merge profile such as:

```text
travel-ui
```

It must preserve all unrelated roots and unrelated `world.*` fields from fresh disk.

Do not replace the whole `world` root from an action-time snapshot.

## 15. Stable Travel Event identity

Final Travel Event ID depends only on stable `travelId`.

Recommended shape:

```text
wce_travel_<normalized travelId>
```

Use bounded slug/hash behavior like the proven Phase 0 Commerce-local pattern.

ID must not depend on:

- `worldTurn`;
- origin/destination;
- route;
- steps;
- array position;
- retry count.

Do not change global `worldEventLogCore` identity semantics.

Use `makeWorldChangeEvent()` for shape, then apply a Travel-local final ID.

Event contract:

```text
category: region
severity: info
source: player
worldTurn: receipt.endWorldTurn
regionId: destination region
locationId: destination location
factionId: omitted
mapHighlight: omitted/false
gmHint: omitted
expiresAfterTurns: omitted
```

Routine Travel must not set `mapHighlight`, avoiding hidden region-danger NPC coupling.

Message is built from authoritative receipt facts, not UI text.

## 16. Event finalization

Only after location is satisfied, perform one serialized `world_state` write that:

1. merges the stable Travel Event into `recentChanges`;
2. updates the matching receipt from `time_applied` to `completed`.

Event timestamp is always:

```text
receipt.endWorldTurn
```

If finalization is delayed while the world later advances, do not retimestamp Travel to the later turn.

Retry behavior:

- stable event ID prevents duplicate history;
- completed receipt prevents duplicate Time/location mutation;
- if a completed event later leaves bounded `recentChanges`, the completed receipt still blocks replay.

Do not reinsert an evicted event merely because an ancient duplicate action is replayed.

## 17. Active transaction rule

At most one active direct Travel receipt may exist.

When a new direct Travel call begins:

```text
no active receipt: validate and plan request
active receipt: resume/finish it first; do not start another Travel
```

A different destination requested during recovery returns `TRAVEL_RECOVERY_REQUIRED`.

## 18. Failure atomicity definition

The repository does not provide physically simultaneous atomic rename across world state, NPC registry, and game state.

Phase 1A therefore requires **recoverable transaction atomicity**:

1. no location mutation before durable Time authority;
2. no history finalization before location is satisfied;
3. no success before Time + required NPC convergence + location + event/completed receipt are durable;
4. every completed phase has a durable witness;
5. retry starts at the first incomplete phase;
6. completed phases are never applied twice;
7. third-generation divergence fails closed;
8. new Travel is blocked while recovery is active.

Do not use `executeCrossFileDualWrite()` as proof of this contract.

## 19. State machine

```text
NO_RECEIPT
  → fresh authority / plan / optional NPC stage
  → TIME_COMMIT
  → advanced world + active receipt(time_applied)
  → NPC convergence
  → location/Fog mutation
  → Travel Event + completed receipt in one world write
  → COMPLETED
```

There is no same-`travelId` transition from `time_applied` back to Time computation.

## 20. Key failure matrix

| Failure | Required behavior |
|---|---|
| invalid/undiscovered/same/no-route destination | zero mutation |
| Commerce flush cannot settle | zero Travel mutation |
| NPC stage fails | no Time mutation |
| Time compute fails | no Time/location/history mutation |
| Time+receipt world write fails | no location/history mutation |
| crash after Time+receipt | retry never advances Time again |
| NPC digest == target | continue without rewrite |
| NPC digest == source | apply staged target once |
| NPC digest is third generation | `REPAIR_REQUIRED` |
| location write fails | active receipt remains; retry location |
| current location already destination | skip duplicate location write |
| current location is third location | `REPAIR_REQUIRED` |
| event construction/write fails | active receipt remains; retry finalization |
| event+completed receipt succeeds but response lost | idempotent completed result |
| duplicate completed `travelId` | no mutation |
| another Travel requested while active | `TRAVEL_RECOVERY_REQUIRED` |

## 21. Existing core reuse matrix

| Concern | Required reuse |
|---|---|
| connectivity | `findRegionPath()` |
| encounters | do not call `rollTravelEncounters()` |
| step bounds | existing elapsed/bulk clamp |
| Time | shared `runBulkWorldSimulation()` computation path |
| Living World after-step | existing `applyLivingWorldAfterSimulationStep()` path |
| departure snapshot | `recordLocationVisit()` |
| arrival Fog | `applyFogOnLocationVisit()` |
| event shape | `makeWorldChangeEvent()` |
| history dedupe | `mergeRecentChanges()` |
| game write | `commitGameState()` + narrow `travel-ui` profile |
| world write | serialized fresh-read transform |

## 22. NOAI Phase 0 alignment

Phase 1A preserves:

- no AI call;
- stable action identity generated once;
- fresh persist-time Time authority;
- final event identity independent of `worldTurn`;
- visible history stays in `recentChanges`;
- no global event-ID change;
- `aiParticipationPolicy` remains unconsumed/inert.

Phase 1A is stronger only because Travel spans Time + location and therefore needs durable phase receipts and recovery.

Do not retrofit Commerce during Phase 1A.

## 23. World tab / host integration

Reuse the existing discovered location detail surface in `webview/modules/85-world.js`.

For a discovered non-current pin:

- when authoritative simulation is available, the Move/Travel action posts one deterministic direct Travel request;
- disable the button while in flight;
- Examine remains the existing chat-draft action;
- Stay remains unchanged.

Add one narrow message:

```text
livingWorldDirectTravel
```

Payload:

```text
destinationLocationId
```

Route/time/origin/event identity are never accepted from the Webview.

Mirror the Phase 0 host path:

```text
85-world.js
→ webviewHandlers.ts
→ extension.ts dependency
→ livingWorld Travel host
```

On success refresh canonical state + World view. Do not generate narration.

`aiParticipationPolicy` does not gate this action in Phase 1A.

## 24. Future compatibility

The later chain:

```text
Commerce shortage → Transport demand → Travel
```

must be able to call the same direct Travel service.

Rules:

- Travel accepts destination intent, not a Commerce shortage object.
- `travelId` is independent of commodity, shortage, demand, transport, route, and `worldTurn`.
- future systems may decide why/where to travel, not own Travel commit semantics.
- a later deterministic duration model can use a new `planVersion` without changing active Phase 1A receipts.
- departure market snapshot remains before Time advance.
- pending Commerce is flushed before Travel authority.

## 25. Expected implementation touch set

Recommended new modules:

- `src/livingWorldTravelUiCore.ts`
- `src/livingWorldTravelUi.ts`
- `src/livingWorldTravelPersist.ts`

Expected existing files:

- `src/worldStateCore.ts` — receipt type/parser/cap;
- `src/worldState.ts` — serialized fresh-read transform helper if required;
- `src/worldSimPersist.ts` — shared no-write computation path;
- `src/workspaceStateQueueCore.ts` — narrow `travel-ui` merge profile;
- `src/webviewHandlers.ts` — one route;
- `src/extension.ts` — one host dependency;
- `webview/modules/85-world.js` — direct Travel click/result UX;
- locale files only for new user-visible Travel copy;
- `scripts/test_noai_phase1a.js` + test manifest;
- `testing_checklist.md`.

`webview/script.js` is generated and must not be hand-edited.

## 26. Required focused proof

Implementation tests must prove at least:

### Authority and route

- stale UI origin loses to fresh disk origin;
- same-region = 1 step;
- adjacent regions = 1 step;
- multi-hop = hop count;
- disconnected/undiscovered destination = zero mutation;
- encounter generator is never invoked.

### Ordering

- departure snapshot uses start turn;
- Time succeeds before location call;
- Time failure prevents location/event;
- location failure prevents event completion.

### Exactly once

- Time write contains advanced state + active receipt together;
- crash after that write does not run Time again;
- retry uses frozen plan;
- duplicate completed action performs zero mutation.

### NPC recovery

- source digest applies staged target once;
- target digest is already satisfied;
- third generation fails closed;
- missing required stage fails closed.

### Location

- origin applies destination once;
- destination is already satisfied;
- third location fails closed;
- Fog core is reused;
- unrelated concurrent game/world fields survive narrow merge.

### Event identity/history

- same `travelId` across different `worldTurn`s → same event ID;
- distinct `travelId`s → distinct IDs;
- delayed finalize keeps receipt `endWorldTurn`;
- retry leaves one history event;
- event has region/info/player, destination refs, no mapHighlight/factionId;
- event+completed receipt finalize together.

### Host/UI and regression

- invalid request creates no transaction;
- one click creates one intent;
- button blocks duplicate click while in flight;
- no provider call occurs;
- NOAI Phase 0 focused tests remain green;
- travel/time existing tests remain green;
- full `npm test` remains green.

## 27. Acceptance criteria

Implementation may pass only if all are true:

1. direct Travel performs zero AI/provider calls;
2. UI intent contains no authoritative origin/route/duration/worldTurn;
3. fresh origin and fresh worldTurn are used;
4. `findRegionPath()` defines connectivity;
5. Phase 1A duration is deterministic route-hop time only;
6. existing world simulation semantics are reused;
7. departure snapshot is captured at start turn;
8. Time and active receipt are written together;
9. same receipt can never advance Time twice;
10. NPC recovery is digest-guarded;
11. location cannot run before Time/NPC phase is satisfied;
12. location uses fresh disk state + narrow merge + Fog core;
13. history cannot finalize before location is satisfied;
14. final event ID depends only on stable `travelId`;
15. event metadata uses receipt completion turn;
16. same retry produces one event;
17. distinct actions produce distinct IDs;
18. event+completed receipt finalize in one world write;
19. completed receipt blocks replay even after event retention loss;
20. routine Travel cannot trigger highlighted-region NPC coupling;
21. global `worldEventLogCore` identity remains unchanged;
22. no second Travel begins during recovery;
23. Phase 0 and full suite remain green;
24. no out-of-scope feature is added.

## 28. Adversarial review schedules

Review must attack:

1. crash immediately after Time+receipt commit;
2. NPC source→target staging followed by unrelated third generation;
3. active receipt A→B followed by game location changed to C;
4. event+completed receipt success followed by lost response;
5. delayed event finalization after worldTurn advances again;
6. stale UI rendered at A while disk origin changes to B before click handling.

Expected result in every case: no double Time, no silent overwrite, no duplicate Travel Event, and no false success.

## 29. Final assessment

The repository already has the required deterministic domain cores. The missing piece is the transaction contract that binds them in the correct order.

This gate adds no new simulation subsystem, no second history system, no AI path, and no general State Orchestrator rewrite.

The design is implementable within Phase 1A scope and leaves a clean seam for later Commerce shortage → Transport demand → Travel.

## Final verdict

`NOAI_PHASE1A_GATE_READY_FOR_ADVERSARIAL_REVIEW`
