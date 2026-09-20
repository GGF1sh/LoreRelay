# Reference Note — eramegaten as an AI-Off Text Simulation Reference

Date: 2026-07-07 JST
Status: REFERENCE NOTE
Scope boundary: Adult / R-18 content, dialogue text, event prose, and related mechanics are excluded from this analysis.

## Verdict

`eramegaten` is one of the closest useful reference points for LoreRelay's AI-optional direction because it demonstrates how a Japanese community-built text simulation can sustain long play through deterministic systems, dense data, recurring decisions, and extensible content.

The useful target is not its subject matter and not literal mechanic copying.

The useful target is:

```text
many parameters / states
→ a small number of graspable decisions
→ time / scarcity / opportunity cost
→ persistent consequences
→ long replayability
```

This refines the common warning against parameter soup.

The better rule is:

> A parameter is justified when it converges into a decision the player can actually grasp and regret.

## Highest-value lessons for LoreRelay

### 1. Decision compression

Dense traits, affinities, resistances, resources, and states are not automatically bad.

They become useful when they converge into questions such as:

- who should I send to negotiate?
- what do I spend this turn on?
- what information should I obtain before committing?
- what growth path do I choose next?

LoreRelay should judge every new parameter by whether it changes a readable player decision.

### 2. External pressure without a universal action-point system

A deadline, quota, chapter objective, or deteriorating situation can make time valuable without introducing a generic `Town Action Budget`.

This is attractive for LoreRelay because direct action caps can feel artificial, while campaign pressure can make ordinary actions compete naturally.

Do not add a global deadline everywhere.

Use pressure only where it gives existing systems a shared reason to matter.

### 3. Agent selection as gameplay

A personality / affinity matrix can turn social systems into a decision:

```text
understand counterpart
→ choose who speaks / represents the group
→ commit that person
→ resolve consequences
```

This is more promising than a universal Charisma button because it makes NPC identity operational.

### 4. Information progression

Hidden information that becomes more precise through observation, analysis, relationships, or role can create deterministic uncertainty without randomness.

This aligns with LoreRelay's separation of:

- World Truth
- Access
- Knowledge
- Memory
- Awareness

### 5. Community-scale content organization

The repository is valuable as a reference for long-lived community expansion:

- large data sets;
- modular content;
- event conditions;
- character state;
- recurring action loops;
- compatibility pressure over time.

LoreRelay should learn the content-management lessons without copying engine-era global flag patterns or direct script mutation.

## Major correction: do not copy hard alignment departure

For LoreRelay, this rule would be too blunt:

```text
attribute mismatch
→ companion leaves
```

LoreRelay is an AI-dialogue game. A major advantage of the product should be that social conflict creates an intervention window rather than an immediate binary eviction.

Recommended translation:

```text
attribute / value mismatch
→ friction pressure
→ NPC intent forms
→ player gets a dialogue window
→ player proposes persuasion / concession / compromise
→ server validates concrete commitments
→ deterministic outcome is committed
→ memory records what was promised and what happened
```

Possible outcomes:

- stays;
- stays under a condition;
- refuses a specific role or mission;
- demands separation from another NPC;
- requests compensation or a concession;
- leaves temporarily;
- leaves permanently after unresolved or repeated conflict.

The important rule is:

> Dialogue may negotiate the consequence. Dialogue must not erase the underlying conflict for free.

Otherwise the dominant strategy becomes:

```text
say persuasive words to the AI
→ bypass every mechanical cost
```

A good LoreRelay version should let a skilled player talk their way through conflict, but the persuasion should usually settle into something authoritative and costly:

- a promise;
- a concession;
- a future action;
- a role change;
- a resource commitment;
- a relationship risk.

This preserves both advantages:

```text
deterministic simulation makes disagreement real
+
AI dialogue makes the response space flexible
```

## Proposed future social loop

Working shape:

```text
Pressure
→ Intent
→ Dialogue Window
→ Proposal
→ Typed Commitment / Concession
→ Deterministic Resolution
→ Event Receipt / Memory
```

This is a future design candidate, not an active implementation task.

It should reuse existing relationship, event-history, knowledge, and authority boundaries before adding new state infrastructure.

## What not to import

### Full future-value preview for uncertain systems

A complete result preview can be excellent for irreversible crafting or combination systems.

It is not automatically appropriate for travel / market opportunities.

Gameplay Slice 1 intentionally avoids:

- predicted arrival price;
- expected profit;
- route ranking;
- recommendation scores.

Those would strengthen the scanner / dominant-strategy problem.

Borrow preview UI only when the future result is legitimately authoritative and the decision benefits from certainty.

### Hard attribute gates as universal social resolution

Use them as pressure inputs, not automatic final outcomes.

### Global flag sprawl

Do not copy anonymous flag-number architecture.

Prefer typed facts, stable identities, receipts, validated actions, and explicit migrations.

### Parameter density without convergence

Do not add traits merely because a reference game has many traits.

Ask:

> Which player decision changes because this value exists?

If the answer is unclear, the parameter is not ready.

## Reference classification

Best use of `eramegaten` for LoreRelay:

```text
AI-off core loop reference
+ Japanese text UI reference
+ decision compression reference
+ long-lived community content reference
```

Not:

```text
mechanic template to copy literally
```

## Relationship to Narration on Demand

LoreRelay already aims for deterministic routine play while reserving AI for dialogue, interpretation, and meaningful scenes.

That makes the combination unusually strong:

```text
era-style deterministic systems create real pressure
→ LoreRelay exposes a readable intervention window
→ AI handles the important conversation
→ typed authority commits the consequence
```

The strategic opportunity is not to replace the AI with an era game.

It is to build an era-grade deterministic game underneath an AI conversation layer that matters exactly when fixed menus become too rigid.
