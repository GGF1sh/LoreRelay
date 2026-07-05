# LoreRelay Terminology Contract

> Status: Approved Contract
> Purpose: Establish a definitive naming and typing convention for all LoreRelay cross-system integration, preventing ambiguity in identity, time, and system boundaries.

## 1. Identity & References

**Forbidden:** Bare strings for cross-ledger foreign keys (e.g., `targetId: "abc"` without knowing if it's an NPC or a vehicle).

**Contract:**
All cross-ledger references must use or map to the `EntityRef` structure:
```typescript
type EntityKind = 'region' | 'location' | 'faction' | 'npc' | 'vehicle' | 'settlement' | 'mod' | 'mobile_base' | 'guild' | 'domain';

interface EntityRef {
  kind: EntityKind;
  id: string;
}
```
*Rule:* `EntityKind` must always be `snake_case`.

## 2. Time & Temporal Boundaries

**Forbidden:** Bare numbers for time or the ambiguous word `turn` (e.g., `expiresIn: 5` or `turn: 10`).

**Contract:**
Different simulation layers run on different clocks. Time references must explicitly state their domain using a `ClockRef`:
```typescript
interface ClockRef {
  clock: 'world' | 'gm' | 'domainMonth' | 'guildDrift' | 'simTick';
  value: number;
}
```
*Rule:* Always distinguish between `gmTurn` (narrative dialog time) and `worldTurn` (background simulation time).

## 3. Subsystems & Architecture Domains

**Forbidden:** Vague, overlapping module names like `world`, `sim`, `core`.

**Contract:**
Subsystems emitting deep traces or intents must use their specific, canonical `camelCase` identifiers:
- `worldSimCommerce`
- `npcAgency`
- `livingWorldClassifier`
- `contextEngine`
- `stateOrchestrator`

## 4. Intent Actions

**Forbidden:** Generic verbs like `update`, `doAction`, `process`.

**Contract:**
`WorldIntent` actions must be `snake_case` in a `verb_noun` format:
- `buy_wheat`
- `expand_layer`
- `restock_steel`
