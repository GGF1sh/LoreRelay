# Settlement Reference Patterns

Status: design notes only. No implementation in this document.

This document records reference patterns for Settlement Mode and nearby systems.
It does not authorize copying code, schemas, data, sprites, names, prose, or
setting-specific text from any referenced work. Use these notes only as
high-level design inspiration.

This document is scoped to *simulation-shaped* inspiration (world/settlement
behavior). See [`docs/NARRATIVE_PATTERNS.md`](NARRATIVE_PATTERNS.md) for
*narrative-shaped* inspiration (Quality-Based Narrative, RimWorld-style event
pacing, Wildermyth-style legacy props, King of Dragon Pass-style decision
framing) — how the same state turns into a readable scene.

## 1. Role Split

| Reference | Useful Pattern | LoreRelay Layer |
|---|---|---|
| Dwarf Fortress | settlement ledger, incident history, layered space, emergent reports | Settlement Mode core, Chronicle |
| StoneSense | readable isometric view over a separate simulation model | display-only settlement snapshot |
| Cataclysm: Dark Days Ahead | overmap-to-local abstraction, survival resources, data-driven content | Tile Overmap, Campaign Kit, resource pressure |
| RimTalk-style mods | characters speaking from inside a running world | In-World Chat, NPC Registry |
| Caves of Qud | procedural history, village hub density, strange discoveries, appraisal loop | World Forge, discoveries, Chronicle, lore generation |
| Kenshi | outpost vulnerability, faction world-states, roaming pressure, away-time progression | Settlement Mode, Living World, Commerce, Observatory |

The short version:

- DF/CDDA/StoneSense define the **shape of the settlement and map data**.
- Caves of Qud defines the **density of world meaning and discovery**.
- Kenshi defines the **pressure of a world that does not wait for the player**.

## 2. Caves of Qud Pattern Extraction

Caves of Qud is most useful as inspiration for world texture, not as a direct
settlement schema source.

Patterns worth extracting:

1. **Procedural history with consequences**
   - Regions, villages, ruins, factions, relics, and rumors should feel linked.
   - LoreRelay mapping: `world_forge.json`, Chronicle entries, discoveries, and
     settlement incidents can reference the same generated causes.

2. **Village-as-hub**
   - A village is not only a map node. It is a bundle of merchants, repair,
     rumors, local norms, faction ties, and small quests.
   - LoreRelay mapping: locations with `type=settlement`, Campaign Kit hubs,
     settlement visitors, merchants, and job board hooks.

3. **Unidentified findings and appraisal**
   - The excitement comes from finding something strange, then later learning
     what it is and why it matters.
   - LoreRelay mapping: Campaign Kit `discoveries.json`, appraisal states,
     value hints, lore unlocks, and Chronicle updates.

4. **Data-driven expansion**
   - Content should be extendable by adding packs, taxonomies, and event
     catalogs rather than rewriting core systems.
   - LoreRelay mapping: scenario packs, campaign kit presets, settlement event
     catalogs, and Lorebook entries.

Avoid:

- copying names, prose, mutation/chrome mechanics, creature lists, or setting
  assumptions;
- making every campaign use weird science-fantasy tone by default;
- turning Settlement M1 into a combat/RPG rules rewrite.

## 3. Kenshi Pattern Extraction

Kenshi is most useful as inspiration for settlement pressure and long-running
world motion.

Patterns worth extracting:

1. **The world does not wait**
   - Caravans leave, merchants arrive, factions fight, and dangers shift even
     when the player is away.
   - LoreRelay mapping: World Observatory ticks, Living World recent changes,
     settlement visitor/merchant expiry, and away-time settlement ticks.

2. **Outpost vulnerability**
   - A base is not just a reward. It attracts attention and creates new
     maintenance problems.
   - LoreRelay mapping: `security`, `morale`, `stocks`, unresolved incidents,
     faction reputation, and event weights.

3. **Faction world-states**
   - Territory and road safety can change in stages rather than via one-off
     narration.
   - LoreRelay mapping: `world_state.regions`, faction control, recent changes,
     quest hooks, and settlement event conditions.

4. **Expedition-return loop**
   - The player leaves to scavenge, trade, recruit, or resolve danger, then
     returns with resources, problems, contacts, injuries, and rumors.
   - LoreRelay mapping: Campaign Kit expedition loop into
     `settlement_state.json`, discoveries, services, and merchant stays.

5. **Companions and residents**
   - Recruits, residents, guards, traders, and specialists are story pressure,
     not just stats.
   - LoreRelay mapping: NPC Registry, In-World Chat, residents, visitors, and
     speaker-aware TTS.

Avoid:

- real-time squad AI;
- freeform building placement;
- detailed pathfinding;
- full economy simulation;
- copying faction names, locations, or setting content.

## 4. Design Hooks For Future Phases

These are not M1 requirements. They are hooks for M2+.

### Qud-like Discovery Hooks

- `discovery.kind`: artifact, route, ruin, relic, rumor, threat, specimen,
  contract, anomaly.
- `discovery.appraisalState`: unknown, identified, appraised, contextualized.
- Chronicle line: "what this discovery changed about the known world."
- Lorebook unlock: a bounded entry generated only after identification.

### Kenshi-like Settlement Pressure Hooks

- `settlement_state.security` and `morale` influence incident weights.
- `stocks.food`, `stocks.water`, `stocks.medicine`, and `stocks.parts` create
  shortages and repair loops.
- faction reputation can influence merchant arrivals, toll demands, threats, and
  recruitment.
- away-time tick can create "while you were gone" reports.

### Map And View Hooks

- M2 overlays can show caravans, faction-front pressure, jobs, known hazards,
  and settlement stress markers.
- M3 isometric view should make the settlement readable, not simulate every
  physical tile.
- M4 limited Z layers can unlock scenario-specific cellars, waterworks, ruins,
  roofs, watchtowers, or shelters.

## 5. Prompt Guidance

When handing this to an AI agent:

```text
Use Caves of Qud only as inspiration for procedural history, strange
discoveries, village hubs, and appraisal loops. Do not copy content or tone.

Use Kenshi only as inspiration for outpost vulnerability, faction pressure,
merchant/visitor motion, and away-time world progression. Do not implement
real-time squad AI, freeform base building, or full economy simulation.

Keep LoreRelay's source of truth in JSON ledgers and pure core functions. Views
are read-only projections. M2+ may use these patterns, but M1 remains the safe
settlement ledger foundation.
```

## 6. Practical Priority

1. M2 should benefit most from Kenshi-style map pressure and caravan/merchant
   markers.
2. Campaign Kit and discoveries should benefit most from Qud-style unidentified
   findings and appraisal.
3. M3 should stay StoneSense-inspired: readable projection, not a new engine.
4. M4 can use DF/CDDA/Kenshi pressure to justify limited layer expansion, but
   not a full underground simulation.
