# Gameplay Slice 1: Existing Drift Reuse Audit

## Core Question
Is NOAI Phase 1A (Town Action Budgets, Shortage Chains) actually required before Gameplay Slice 1?

## Verdict
**C. PHASE1A_NOT_REQUIRED**

## Justification
The `main` branch already contains a deeply integrated, deterministic simulation spine (`worldSimCommerceCore.ts`, `transportCore.ts`, `agenticGmCore.ts`). The required gameplay pressure—scarcity, time, cost versus reward—already exists as hidden drifts. By surfacing these existing mechanics to the UI, exposing the cost of travel and the current state of markets and reputation, the player can be pushed into a Decision Surface without introducing arbitrary Action Points or new Ledgers.

---

## Causal Connection Audit

### 1. Existing Direct Travel Actions
- **Source File**: `src/gmPromptBuilder.ts` / `src/transportCore.ts`
- **Function**: `buildLivingWorldTravelPromptContext()` / `planTravel()`
- **Input State**: Player's natural language intent to travel, `LocationGraphNode`.
- **Output Mutation**: Outputs `turn_result.elapsedWorldTurns = plan.days` and `statePatch` modifying `/world/currentLocationId`.
- **Current Player Visibility**: Only visible via the AI's subsequent narration of the journey.
- **Current Intervention Point**: The player writes `I travel to [Location]` in the chat.
- **What is missing**: An explicit confirmation UI before the AI turn that surfaces the deterministic cost (`plan.days`, `foodCost`) so the player can abort or prepare before paying the time cost.

### 2. Time Advance Authority
- **Source File**: `src/agenticGmCore.ts`
- **Function**: Context parsing for `elapsedWorldTurns`.
- **Input State**: The `TurnResult` outputting `elapsedWorldTurns`.
- **Output Mutation**: The world simulation (`worldSimCommerceCore.ts`) steps forward by `elapsedWorldTurns` ticks.
- **Current Player Visibility**: Invisible. The player does not see the clock tick, only the after-effects if they check the market.
- **Current Intervention Point**: The player indirectly advances time by traveling or resting.
- **What is missing**: A UI indicator showing current date/time and a clear warning that traveling will advance time by X days, triggering market shifts.

### 3. Location Mutation
- **Source File**: `src/gmPromptBuilder.ts`
- **Function**: `buildLivingWorldTravelPromptContext()`
- **Input State**: `fromLocationId` and `toLocationId`.
- **Output Mutation**: `statePatch` injecting a replace of `/world/currentLocationId` with the target id.
- **Current Player Visibility**: AI narration and the World Tab updating its location context.
- **Current Intervention Point**: Player prompt.
- **What is missing**: Previewing the known traits/dangers of the target location before committing the mutation.

### 4. Travel Food Consumption
- **Source File**: `src/transportCore.ts`
- **Function**: `computeFoodConsumption()`
- **Input State**: `days`, `transport.foodPerDay`, `cargoWeight`.
- **Output Mutation**: Calculates `foodCost`. It is not strictly deducted via deterministic `statePatch` in the current prompt path.
- **Current Player Visibility**: Hidden.
- **Current Intervention Point**: None.
- **What is missing**: Emitting a deterministic deduction and blocking the travel intent if food is insufficient.

### 5. Commerce Price/Stock Drift
- **Source File**: `src/worldSimCommerceCore.ts`
- **Function**: `stepMarketStock()`
- **Input State**: `elapsedWorldTurns`, target stock thresholds.
- **Output Mutation**: Modifies `marketStock` and `marketPriceHistory` in `worldState.json`.
- **Current Player Visibility**: Observable through the World Observatory/Webview `marketPriceHistory` sparklines.
- **Current Intervention Point**: None; it happens passively.
- **What is missing**: The player needs to understand that staying in town to heal, or traveling to a distant town, will cause local stock to regenerate and prices to normalize.

### 6. Faction Reputation → Market Effects
- **Source File**: `src/worldSimCommerceCore.ts`
- **Function**: `driftMarketPricesTowardReputation()`
- **Input State**: `factionReputations`, `REPUTATION_PRICE_BIAS`.
- **Output Mutation**: Shifts `priceIndex` towards a surcharge for hostile factions or discount for allied factions by `REPUTATION_PRICE_DRIFT_PER_TICK`.
- **Current Player Visibility**: The player sees the final `unitPrice`, but the cause—reputation bias—is hidden.
- **Current Intervention Point**: The player can do faction quests to improve reputation.
- **What is missing**: The UI should explicitly explain when price is being affected by faction reputation.

### 7. Food Crisis / Smith Event → Market Effects
- **Source File**: `src/worldSimCommerceCore.ts`
- **Function**: `applyWorldChangeEventsToMarket()`
- **Input State**: Crisis or production-related world-change inputs such as famine, drought, smith, or mine.
- **Output Mutation**: Bumps `priceIndex` for affected commodities, including food-crisis price spikes.
- **Current Player Visibility**: AI narration of the event.
- **Current Intervention Point**: Player reading the narrative.
- **What is missing**: Exposing `recentChanges` clearly enough that the player can intentionally plan a trade route to exploit or answer the crisis.

## Conclusion: Supporting Slice 1 Directly
The existing `main` branch already possesses a robust, interwoven simulation of economy, time, and travel. A player can engage in a meaningful economic loop—buy low, pay the time/food cost of travel, arrive to find prices altered by reputation or crisis, and sell high.

To achieve Gameplay Slice 1, we do **not** need to build a new Town Action Budget system. We need to surface the existing `planTravel` costs (`days`, `foodCost`) and the existing `worldSimCommerceCore` impacts (reputation pricing, event spikes) onto a read-only Decision Surface before the player commits.

The scarcity is already there. It is currently invisible.
