# Information & Rumor System — Idea Note

Status: Idea parking / not implemented  
Date: 2026-07-04  
Origin: User discussion about campaign-time in-world chat, rumors, misinformation, and reputation consequences.

## 1. Core Idea

LoreRelay should eventually support information as a world object, not just text in a chat log.

The motivating scenario:

- During campaign-time in-world chat, the player speaks with an NPC.
- The player can share information they know.
- The player can deliberately create or spread a false rumor.
- The player can hide their source, use a false name, disguise themselves, or pay someone else to spread it.
- Rumors can propagate through settlements, taverns, trade routes, caravans, guilds, and factions.
- False rumors can be weakened by evidence, contradicted by truth, or traced back to the source.
- If deception is exposed, relationship, reputation, faction trust, wanted status, or market behavior may change.

This is distinct from simple chat mode. It is a campaign-world mechanic that connects conversation, knowledge, reputation, and world simulation.

## 2. Vocabulary

Recommended conceptual split:

| Term | Meaning |
|---|---|
| `truth` | What actually happened in the world. Internal/canonical. |
| `claim` | A proposition someone may believe. It may be true, false, uncertain, or contradictory. |
| `knowledge` | What a specific actor knows or remembers. Actor-scoped. |
| `rumor` | A claim currently circulating in a social/location/faction network. |
| `lie` | A claim intentionally created or spread despite being false or unverified. |
| `source` | Visible and/or true origin of the information. |
| `confidence` | How strongly an actor or population believes the claim. |
| `reach` | Where the claim has spread. |
| `traceRisk` | Chance the true origin can be discovered. |
| `reputationImpact` | Consequence if believed or exposed. |

The most important design rule: **truth and belief must remain separate.**

## 3. Example Shape

Illustrative only; not a schema commitment.

```json
{
  "claimId": "claim_bandit_lord_poisoned_well",
  "subject": "bandit_lord",
  "predicate": "poisoned_well",
  "truthStatus": "false",
  "publicConfidence": 0.62,
  "knownBy": ["hearthmere_villagers", "caravan_west_road"],
  "origin": {
    "type": "player_planted",
    "visibleSource": "anonymous_traveler",
    "trueSource": "player",
    "traceRisk": 0.35
  }
}
```

Internal GM view:

> This rumor is false. Some villagers believe it. The visible source is an anonymous traveler, but the true source is the player. Investigation may expose that.

NPC/player-facing view:

> "People say the bandit lord poisoned the well."

## 4. Possible Player Actions

Future action concepts:

- `share_information`: tell an NPC something the player knows.
- `ask_about_rumor`: ask what the NPC has heard.
- `spread_rumor`: intentionally circulate an existing claim.
- `plant_false_claim`: create a new false or misleading claim.
- `spread_anonymously`: hide visible source.
- `use_disguise`: reduce traceability, with risk based on skill/reputation/location security.
- `hire_rumormonger`: pay an agent to spread a claim.
- `publish_notice`: place information on a board, broadsheet, radio, guild network, etc.
- `present_evidence`: strengthen, weaken, or disprove a claim.

These should eventually map to World Intent or domain-specific ops, but should not be added until Context Engine basics are stable.

## 5. Propagation Concepts

Rumors can move through:

- settlements and taverns;
- merchants and caravans;
- guilds and job boards;
- faction intelligence networks;
- ports, trade routes, radio towers, temples, schools, newspapers, bulletin boards;
- mobile bases or transport fleets.

Propagation should be bounded and abstract. Do not simulate every person.

Candidate mechanics:

- per-location/faction confidence bands;
- route-based spread at world tick;
- decay over time;
- distortion over hops;
- contradiction by stronger evidence;
- suppression by authority or fear;
- amplification by high-renown actors.

## 6. Consequences

If a rumor is believed:

- NPCs may change attitude, prices, patrol behavior, travel choices, quest offers, or faction stance.

If a false rumor is exposed:

- relationship loss;
- faction reputation loss;
- credibility damage;
- bounty/wanted pressure;
- counter-rumors;
- loss of access to informants;
- settlement unrest.

If a true rumor spreads:

- it can reveal map areas, markets, threats, opportunities, or hidden conflicts.

## 7. Relationship To Existing Systems

Likely integration points:

| Existing system | Relationship |
|---|---|
| Context Engine | actor-scoped knowledge, claim recall, uncertainty, contradictions |
| In-World Chat / Parlor | conversation surface for sharing or asking about information |
| Faction Reputation | trust loss/gain from rumor effects |
| NPC Relationship | belief, suspicion, betrayal, source trust |
| Living World / Observatory | propagation, decay, and world-level consequences |
| Cartography C9 | rumors can reveal distant regions as `rumored` without full discovery |
| Campaign Kit / Job Board | rumors become job leads or false leads |
| Settlement Mode | taverns/boards/markets as rumor hubs |
| Vehicle/Mobile Base/Caravan | route-based information spread |
| World Intent | future actions like `share_information` / `plant_false_claim` |

## 8. Safe Phase Split

Suggested future phases:

### R1 — Claim & Knowledge Core

- Pure types and parsers for `Claim`, `ActorKnowledge`, and source metadata.
- No propagation.
- No deception mechanics.

### R2 — Share Information Ops

- Player tells an NPC a known claim.
- NPC accepts / doubts / stores it based on trust and context.
- Campaign-time in-world chat can emit structured information sharing.

### R3 — Rumor Spread Simulation

- Location/faction/route-level spread.
- Confidence decay and distortion.
- Evidence can weaken or strengthen claims.

### R4 — Deception / False Rumor

- Player can plant false claims.
- Source concealment, disguise, proxy spreaders.
- Trace risk and exposure consequences.

### R5 — UI / Inspector

- "Tell this information"
- "Spread as rumor"
- "Spread anonymously"
- "Hire someone to spread it"
- Rumor reach / confidence / exposure risk display

## 9. Non-Goals For Now

- Do not implement immediately while Context Engine P0 and State Orchestrator SO2 are still stabilizing.
- Do not let GM free-write arbitrary rumor ledgers without validation.
- Do not expose hidden truth to player/remote clients via omission reasons or debug payloads.
- Do not simulate every population member.
- Do not make rumors auto-overwrite truth.

## 10. Design Note

This system is attractive because it lets LoreRelay turn social information into gameplay:

```text
chat -> claim -> belief -> rumor spread -> reputation/world reaction
```

That is very LoreRelay: conversation becomes state, but only through bounded, inspectable, reversible gates.
