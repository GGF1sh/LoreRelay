# Narrative Structure Patterns

Status: design notes only. No implementation in this document.

This document records reference patterns for how emergent state becomes
readable story, as a companion to
[`docs/SETTLEMENT_REFERENCE_PATTERNS.md`](SETTLEMENT_REFERENCE_PATTERNS.md).
That document covers *simulation-shaped* inspiration (Dwarf Fortress, CDDA,
StoneSense, Kenshi). This document covers *narrative-shaped* inspiration:
how other games turn state into scenes without simulating a world.

It does not authorize copying code, schemas, data, names, prose, or
setting-specific text from any referenced work. Use these notes only as
high-level design inspiration.

## Why this is a separate axis

LoreRelay's actual substrate is JSON ledgers + `*Core.ts` pure functions +
GM narration, not a running simulation. Grok's four references (DF / CDDA /
Qud / Kenshi) mostly answer "how should the world behave." This document
answers a different question: "how should behavior turn into a scene the
GM can narrate," which is arguably the sharper fit for LoreRelay's actual
architecture.

## 1. Role Split

| Reference | Useful Pattern | LoreRelay Layer |
|---|---|---|
| Fallen London / Sunless Sea / StoryNexus (Quality-Based Narrative) | state as tagged "qualities" gating storylets, no physical simulation needed | GM prompt context, discoveries, settlement incidents, Chronicle |
| RimWorld | a pacing "storyteller" that scales event frequency/intensity to current state rather than flat random tables | Settlement event weighting, incident cooldowns |
| Wildermyth | emergent events become durable named props/scars that resurface later in the story | Chronicle, discoveries, NPC dialogue hooks |
| King of Dragon Pass / Six Ages | periodic single meaningful choice (council/ritual) with mood-affecting consequences, not a management panel | Settlement decisions, faction/clan mood systems |

## 2. Quality-Based Narrative (QBN) Extraction

Fallen London-style games do not simulate a world; they gate story content
behind named "qualities" (flags/counters) and let text authorship do the
rest. LoreRelay already resembles this shape more than it resembles a
simulation.

Patterns worth extracting:

1. **Qualities as the only state surface**
   - Numbers and flags (`morale`, `safety`, discovery counts, faction
     standing) are the entire mechanical model; everything else is prose.
   - LoreRelay mapping: treat `settlement_state` scores, discovery
     `appraisalState`, and faction reputation as the canonical "qualities"
     that gate GM narration, instead of adding new simulated subsystems.

2. **Storylets, not scripts**
   - Content unlocks when a combination of qualities crosses a threshold,
     not on a fixed timeline.
   - LoreRelay mapping: settlement incidents/visitors/discoveries can be
     expressed as "available when conditions X, Y hold," which keeps
     `settlementEventCore` a pure condition evaluator instead of a state
     machine that needs new persistent fields for every story beat.

3. **No physical grid required for depth**
   - QBN games get narrative richness without simulating geography at all.
   - LoreRelay mapping: this is a reminder that M2/M3 map/isometric work is
     presentation, not the source of narrative depth — depth comes from
     qualities and storylets, which can ship before or independently of any
     renderer.

Avoid:

- adding a full storylet authoring engine; LoreRelay's GM narration already
  fills that role, so this pattern only needs vocabulary and threshold
  discipline, not new tooling.

## 3. RimWorld "Storyteller" Pacing Extraction

RimWorld's distinctive contribution is not its incidents but the director
that decides *when* and *how hard* to trigger them based on colony wealth,
recent event density, and time since last major event.

Patterns worth extracting:

1. **Adaptive event weighting over flat random tables**
   - Event probability should scale with current settlement state (wealth,
     unresolved incidents, morale/safety) rather than a fixed chance per
     tick.
   - LoreRelay mapping: `settlementEventCore` can weight incident selection
     by `stocks` abundance, `safety`, and recent incident count instead of
     uniform random rolls.

2. **Cooldowns prevent narrative fatigue**
   - A director tracks time-since-last-event per category so the same kind
     of incident does not repeat back-to-back.
   - LoreRelay mapping: add a lightweight per-category cooldown counter to
     the settlement tick, purely to bound repetition, not to add new
     persistent simulation.

3. **Escalation as a legible curve, not randomness**
   - Threat/opportunity ramps predictably enough that players can feel
     "things are heating up" without it being scripted.
   - LoreRelay mapping: expose the current pacing pressure in the prompt
     chunk (e.g. a short phrase like "the settlement has been quiet for a
     while") so the GM can narrate escalation intentionally.

Avoid:

- copying RimWorld's wealth-scaling formulas or specific incident categories;
- building a general-purpose "director" service — this stays inside
  `settlementEventCore` as weighting logic, not a new subsystem.

## 4. Wildermyth "Legacy Props" Extraction

Wildermyth's signature move is that emergent, sometimes-random events
(an injury, an odd choice) get turned into a named, persistent object or
scar that keeps showing up in later scenes and dialogue.

Patterns worth extracting:

1. **Turn incidents into referenceable nouns**
   - Not just "a raid happened" but "the well the raiders broke," a thing
     that can be pointed at again later.
   - LoreRelay mapping: when a settlement incident resolves, it can leave
     behind a small durable note (already partially supported by
     `settlement_state.notes` and `structures[].note`) that Chronicle and
     discoveries can reference by name in future turns.

2. **Discovery-to-legacy pipeline**
   - Combine with the Qud appraisal loop: an unidentified discovery, once
     identified, becomes a story prop other systems can reference (an NPC
     asks about it, a rumor mentions it).
   - LoreRelay mapping: `discoveries.json` entries and settlement structure
     notes should be written so GM prompt context can call back to them by
     name, not just by category.

3. **Scars are cheap, not simulated**
   - Wildermyth does not simulate consequences mechanically; it just makes
     sure the text remembers.
   - LoreRelay mapping: this requires no new mechanical system, only a
     discipline of keeping short named strings around (bounded, capped,
     already covered by M1 text length limits) rather than discarding
     resolved incidents entirely.

Avoid:

- building a dedicated "legacy object" data model; reuse existing
  `notes`/`structures` fields with a naming discipline instead.

## 5. King of Dragon Pass / Six Ages Extraction

KoDP/Six Ages present settlement management as periodic single meaningful
choices (a council question, a ritual) rather than a always-on management
panel, with mood/relationship consequences that ripple into later choices.

Patterns worth extracting:

1. **One decision, clearly framed, per beat**
   - Instead of a dashboard of levers, the player faces one framed choice
     ("welcome the merchant caravan, or turn them away?") tied to current
     qualities.
   - LoreRelay mapping: when `settlementOps` grows past M1, expose new
     settlement decisions as GM-narrated multiple-choice moments (fits the
     existing option-button UI) rather than free-form stat editing.

2. **Consequences feed back into future framing**
   - A choice this season changes which choices/tones are available next
     season.
   - LoreRelay mapping: settlement decision outcomes should adjust
     `morale`/`safety`/faction reputation, which then changes which
     incidents `settlementEventCore` is likely to surface next — closing
     the loop with the RimWorld-style pacing pattern above.

Avoid:

- copying specific ritual/council mechanics or Glorantha-specific content;
- turning this into a full turn-based strategy layer — it stays scoped to
  occasional narrated decision points inside Settlement Mode.

## 6. Practical Priority

1. QBN vocabulary (qualities/storylets) should inform how M2 incident and
   discovery conditions are written from the start — it costs nothing and
   keeps `settlementEventCore` a pure evaluator.
2. RimWorld-style pacing (weighting + cooldowns) is the most direct addition
   to `settlementEventCore` for M2, ahead of any map/renderer work.
3. Wildermyth-style legacy props are a light discipline change (name things,
   keep short notes) applicable as soon as M1's `notes`/`structures` fields
   are used in anger — no schema change required.
4. KoDP-style single-decision framing is a UI/prompt pattern for whenever
   `settlementOps` grows past the M1 stub list; it pairs naturally with the
   RimWorld pacing signal ("why this choice, why now").

## 7. Prompt Guidance

When handing this to an AI agent:

```text
Use Fallen London / StoryNexus only as inspiration for treating existing
settlement scores and discovery states as "qualities" that gate narration,
not as a reason to build a new storylet engine.

Use RimWorld only as inspiration for adaptive event weighting and cooldowns
inside settlementEventCore, not for its specific incident catalog or wealth
formulas.

Use Wildermyth only as inspiration for keeping short, named, reusable notes
on resolved incidents/discoveries, not for a new "legacy object" data model.

Use King of Dragon Pass / Six Ages only as inspiration for framing settlement
decisions as one narrated choice at a time, not for a turn-based strategy
layer or setting-specific content.

Keep LoreRelay's source of truth in JSON ledgers and pure core functions.
These patterns are additive discipline for M2+, not new subsystems.
```
