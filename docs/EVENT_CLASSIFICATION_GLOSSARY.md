# LoreRelay Event Classification Glossary

> Status: Approved contract draft
> Purpose: Define composite event matching rules so simulation systems do not infer meaning from broad fields such as `severity` alone.

## Core Rule

Semantic event matching must use a composite rule:

```text
semantic match = category gate + domain keyword/resource signal
```

Never trigger NPC agency, commerce reactions, relationship drift, or Debug Trace semantic labels from `severity` alone. A `warning` can be a faction warning, resource shortage, region hazard, or routine diagnostic. Those are different things.

## Event Fields

- `category`: broad domain such as `resource`, `faction`, `region`, or `info`.
- `severity`: urgency only: `info`, `warning`, `critical`.
- `message`: human-readable text; may contain domain keywords but is not authoritative by itself.
- `regionId`, `factionId`, `targetFactionId`: scoped routing fields. These do not define the semantic class by themselves.

## Canonical Semantic Events

| Semantic event | Required category | Required signal | Example consumers |
| --- | --- | --- | --- |
| `food_crisis` | `resource` | `food`, `wheat`, `食料`, `小麦` | NPC agency `restock_wheat`, wheat price bump |
| `steel_craft` | `resource` | `steel`, `smith`, `forge`, `鍛冶` | steel stock improvement, steel price easing |
| `faction_friction` | `faction` | `friction`, `conflict`, `border`, `紛争`, `対立` | relationship / power drift diagnostics |
| `region_danger` | `region` | `danger`, `hazard`, `unstable`, `危険度`, `不安定化` | region danger overlays / diagnostics |

## Forbidden Patterns

- `severity === "critical"` means conflict.
- `severity === "warning"` means shortage.
- `category === "resource"` means food crisis.
- `message.includes("food")` means food crisis without a `resource` category.
- `category === "faction"` plus a resource keyword triggers market or NPC restock behavior.

## Required Test Shape

Every semantic evaluator must include at least these tests:

- positive composite match;
- right keyword with wrong category must not match;
- right category without required keyword must not match;
- unrelated `warning` or `critical` severity must not match;
- Debug Trace conditions should expose both the category gate and keyword gate.

## Current Pilot

The first enforced pilot is `evaluateFoodCrisisEvent()` in `livingWorldTypes.ts`, shared by NPC agency, commerce, and Debug Trace. Additional evaluators should follow the same `SemanticEvaluation` shape.
