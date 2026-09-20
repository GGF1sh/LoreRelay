# Rules Profile Onboarding Design

> Status: design only.
> Purpose: connect Start Hub / Quickstart / Game Rules into a "goddess interview" flow that chooses a sandbox rules preset before world generation.
> Non-scope: implementation, new persistence beyond `game_rules.json`, or changing existing Quickstart behavior immediately.
> Asset catalog: `docs/GENESIS_MODE_ASSETS.md` / `webview/assets/genesis/`.

## 1. Problem

LoreRelay has grown from a text adventure UI into a configurable AI campaign engine. A new user currently sees either:

- Quickstart: a short prompt that generates world/character/scenario; or
- Game Rules: a dense manual settings panel.

That gap is now too large. Users need a friendly first-run guide that asks what kind of game they want, then maps those answers to `game_rules.json` and starter-world generation.

The desired fantasy is:

> A goddess-like guide appears before the campaign begins and asks what kind of world, danger, survival pressure, vehicles, settlements, and GM strictness the user wants.

This is not only flavor. It is a rules-profile wizard.

The guide art is optional UI chrome. `rulesProfileCore.resolveRulesProfile()` can return an `assetHint`, but that hint is not canonical state and must not be written to `game_rules.json`.

## 2. Design Goals

- Make empty-workspace onboarding legible and inviting.
- Let users choose "feel" before they see advanced toggles.
- Keep existing `game_rules.json` as the rule source of truth.
- Avoid dumping dozens of sliders into the first screen.
- Allow genre-specific presets such as Metal Max-like vehicle adventure, cozy fantasy, hard survival, mobile base, guild management, or settlement sim.
- Allow users to stop early and say "start with this."
- Keep advanced Game Rules panel as an override layer.

## 3. Non-Goals

- Do not implement a full 7DTD-style settings matrix in v1.
- Do not expose every internal feature flag in the first-run goddess flow.
- Do not let the Webview directly mutate canonical state beyond existing `updateGameRules` / future gated setup messages.
- Do not make the goddess conversation the only way to configure rules.
- Do not require an LLM provider for basic preset selection.

## 4. Layer Model

Rules should be resolved in layers:

1. `DEFAULT_GAME_RULES`
2. built-in rules profile
3. goddess interview answers
4. scenario pack / mod-provided suggested defaults, if accepted
5. manual Game Rules panel overrides

Later layers override earlier layers. Manual overrides always win.

## 5. Core Concepts

### Rules Profile

A named, human-facing bundle of game rules and prompt hints.

Example:

```json
{
  "id": "vehicle-adventure-light",
  "label": "Vehicle Adventure - Light",
  "summary": "Metal Max-like vehicle travel without fuel bookkeeping.",
  "tags": ["vehicle", "post-apocalyptic", "light"],
  "rulesPatch": {
    "enableWorldForge": true,
    "enableCampaignKit": true,
    "enableVehicleSystem": true,
    "enableTravelEncounters": true,
    "travelEncounterDensity": "medium"
  },
  "profileHints": {
    "vehicleFuelMode": "off",
    "repairComplexity": "simple",
    "survivalPressure": "low",
    "gmStrictness": "normal"
  }
}
```

`rulesPatch` maps to existing or future `game_rules.json` fields. `profileHints` are not canonical mechanics until implemented; they can be summarized into prompts or stored in a future `rules_profile.json` if needed.

### Goddess Interview

A staged setup conversation shown when the workspace is empty or when the user chooses "Create New World."

It can run in two modes:

- **Guided UI mode:** deterministic cards/buttons, no LLM required.
- **Conversational mode:** GM/provider asks follow-up questions, with a "start now" escape button.

The v1 implementation should prefer Guided UI mode with optional LLM flavor text. This avoids provider limitations.

### Setup Summary

Before writing files, LoreRelay shows a concise summary:

- world tone;
- complexity;
- survival pressure;
- vehicle/fuel model;
- settlement/mobile-base model;
- AI GM strictness;
- enabled systems.

The user can accept, go back, or open advanced rules.

## 6. Recommended First-Run Flow

### Step 0: Empty Workspace Start Hub

If no meaningful campaign files exist, show a large first-run panel:

- "Start a guided setup"
- "Use a quick preset"
- "Import character / scenario"
- "Open advanced Game Rules"

### Step 1: Goddess Greeting

The guide asks:

> What kind of world shall we build?

Choices:

- Fantasy adventure
- Post-apocalyptic scavenger
- Space frontier
- Eastern fantasy
- Cyberpunk courier
- Settlement / colony
- Vehicle / mobile base
- Custom

### Step 2: Playstyle

Ask what the user wants to do most.

- Story and relationships
- Exploration and discovery
- Survival and scarcity
- Trading and transport
- Settlement building
- Vehicle combat and travel
- Guild / domain management

This maps to feature flags and Campaign Kit presets.

### Step 3: Pressure

Ask how harsh the rules should feel.

- Gentle: danger exists, but recovery is easy.
- Standard: meaningful risk, forgiving defaults.
- Harsh: resources, wounds, and bad choices matter.
- Nightmare: only for players who want attrition.

This maps to RPG mechanics, simulation interval, encounter density, survival toggles, and GM strictness hints.

### Step 4: Bookkeeping

Ask how much management the user wants.

- Minimal: narrate details, track only major state.
- Light: track important resources and vehicles abstractly.
- Detailed: track fuel, repairs, stocks, settlement pressure.

This is where vehicle fuel can be turned off for Metal Max-like play.

### Step 5: Signature System

Ask if one special system should be emphasized.

- None, keep it simple.
- Vehicles
- Mobile base
- Settlement
- Guild
- Domain
- Living World

This prevents all advanced systems from turning on at once.

### Step 6: Protagonist and Party

Ask whether to create:

- only protagonist;
- protagonist + partner;
- small party;
- import SillyTavern character;
- decide later.

This links to existing protagonist bootstrap and future character onboarding.

### Step 7: Summary and Generate

Show:

- selected profile;
- enabled systems;
- disabled complexity;
- generated starter prompt for Quickstart.

Buttons:

- Start with this
- Ask me more
- Edit advanced rules
- Save preset

## 7. Built-in Profile Set

### Story First

For low bookkeeping and broad fantasy/adventure stories.

- World Forge ON
- Campaign Kit ON
- NPC Registry ON
- Living World optional OFF by default
- Vehicles/Settlement/Mobile Base OFF
- survival pressure low

### Beginner Fantasy

Tutorial-friendly RPG.

- RPG mechanics ON
- World Forge ON
- Campaign Kit ON
- Travel Encounters low/medium
- NPC Registry ON
- Quest hooks ON if available

### Post-Apocalyptic Scavenger

Inspired by scavenger road stories.

- World Forge ON
- Campaign Kit ON
- Commerce ON
- Vehicle System optional ON
- scarcity medium
- repair simple/abstract

### Metal Max-like Vehicle Adventure

Vehicle fantasy with low friction.

- Vehicle System ON
- fuel mode OFF or abstract
- repair simple
- vehicle access restrictions ON
- vehicle combat high as prompt hint
- Settlement/Mobile Base OFF unless selected

### Hard Survival

For 7DTD/CDDA-like pressure.

- Travel Encounters high
- Emergent Simulation ON
- World Observatory optional
- Commerce ON
- fuel mode detailed if vehicles enabled
- settlement pressure high if Settlement enabled

### Settlement Builder

For DF/Kenshi/RimWorld-like base play.

- Settlement Mode ON
- Commerce ON
- NPC Agency ON
- Living World ON
- Vehicle optional OFF
- Mobile Base OFF unless selected

### Mobile Base Caravan

For Space Haven / Fuga / trading ship / caravan play.

- Vehicle System ON
- Settlement Mode ON
- Mobile Base ON
- Commerce ON
- Travel Encounters medium
- fuel/feed mode abstract
- passengers/contracts future hint ON when implemented

### Light Parlor

For character chat before campaign.

- Parlor mode preferred
- Campaign systems OFF
- no world mutation
- quick upgrade path to Campaign

## 8. Rule Axes

Avoid exposing raw flags first. Ask about axes and translate them.

| Axis | Values | Example effects |
|---|---|---|
| Complexity | minimal / light / detailed | number of systems enabled |
| Danger | gentle / standard / harsh / nightmare | encounter density, GM strictness |
| Bookkeeping | off / abstract / detailed | fuel, repairs, stocks |
| World Motion | static / light / living | sim flags, observatory |
| Social Depth | simple / party / factional | NPC registry, relationships, factions |
| Base Play | none / settlement / mobile base | settlement and vehicle flags |
| Vehicle Play | none / light / road-warrior / logistics | vehicle flags, fuel mode hints |

## 9. Data Contract Proposal

MVP can write only `game_rules.json`.

Future profile metadata may use `rules_profile.json`:

```json
{
  "version": 1,
  "profileId": "mobile-base-caravan",
  "profileLabel": "Mobile Base Caravan",
  "createdBy": "goddess-onboarding",
  "answers": {
    "genre": "post-apocalyptic",
    "playstyle": "trading_transport",
    "pressure": "standard",
    "bookkeeping": "abstract",
    "signatureSystem": "mobile_base"
  },
  "hints": {
    "vehicleFuelMode": "abstract",
    "gmStrictness": "normal",
    "survivalPressure": "medium"
  },
  "manualOverridesAllowed": true
}
```

`rules_profile.json` is explanatory metadata, not the source of truth for feature gates. Feature gates remain in `game_rules.json`.

## 10. Prompt Contract

When using an LLM for the goddess voice, keep it non-authoritative.

The LLM may:

- ask questions;
- summarize answers;
- suggest a profile;
- create a Quickstart seed;
- write flavorful goddess narration.

The LLM must not:

- directly write files;
- invent unsupported settings;
- override manual Game Rules;
- claim a feature is enabled unless the deterministic resolver says so.

Recommended system prompt:

```text
You are LoreRelay's setup guide. Ask friendly setup questions and summarize the player's desired campaign.
Do not decide canonical mechanics by yourself. When recommending rules, use only the provided profile IDs and option IDs.
If the player says "start now", stop asking questions and summarize the current choices.
Output natural language for the user plus a compact selectedProfile/answers block only when requested by the host.
```

## 11. UI Structure

### Start Hub

Add a first-run card:

- Title: "世界を一緒に作る"
- Body: "女神の案内で、世界観・危険度・乗り物・拠点・管理の細かさを決めます。"
- Primary: "質問しながら始める"
- Secondary: "プリセットで始める"
- Tertiary: "高度な設定"

### Goddess Panel

Use compact wizard cards:

- question text;
- 3-6 option chips;
- optional free text;
- progress indicator;
- "Start now" button always visible after step 2.

### Summary Screen

Show a human-readable rules card, not raw JSON:

- "Fuel: off"
- "Vehicles: enabled"
- "Settlement: disabled"
- "World simulation: light"
- "GM strictness: standard"

Advanced users can open raw Game Rules after generation.

## 12. Implementation Phases

### RP1: Design and Pure Resolver

- `rulesProfileCore.ts`
- built-in profile catalog
- answer parser
- deterministic `resolveRulesProfile(answers): { rulesPatch, hints, summary }`
- tests for profile outputs

No Webview and no file writes.

### RP2: Host Apply Gate

- apply selected `rulesPatch` to `game_rules.json`
- use existing `saveGameRules()` sanitization
- optionally write `rules_profile.json`
- no world generation yet

### RP3: Start Hub / Goddess UI

- wizard UI in Webview
- no direct canonical writes except postMessage to host apply function
- i18n keys
- empty-state placement

### RP4: Quickstart Integration

- pass resolved profile summary into Quickstart seed
- use selected genre/playstyle to improve world generation
- do not require LLM to choose feature flags

### RP5: Advanced Preset Editor

- save custom profile
- duplicate preset
- import/export profile JSON
- future Mod System can provide suggested profiles

## 13. Safety and Review Gates

Gate required before RP2 because it writes `game_rules.json`.

Gate questions:

- Which fields are allowed in `rulesPatch`?
- Should `rules_profile.json` exist in RP2 or wait?
- How are unknown future flags ignored?
- How do manual overrides interact with a re-run goddess setup?
- Can scenario packs/mods suggest profiles without applying them?

## 14. AI Assignment

Recommended flow:

1. Codex/ChatGPT: RP1/RP2 contract gate.
2. Grok: `rulesProfileCore.ts` + tests.
3. Claude: Start Hub and Goddess UI/UX.
4. Gemini: README / first-session docs / preset copy.
5. Codex/ChatGPT: final review.

## 15. Open Questions

- Should `vehicleFuelMode` become a real `game_rules.json` field now, or remain a profile hint until Vehicle V6?
- Should survival needs be generalized before exposing "hunger/thirst/fatigue" options?
- Should goddess onboarding work in Parlor-only mode?
- Should custom profiles live in workspace or global extension storage?

## 16. Recommended Decision

Implement first as a deterministic rules-profile resolver plus a friendly Webview wizard. Keep the goddess voice as presentation, not authority.

This gives LoreRelay the feel of a living setup guide without letting an LLM silently enable unsupported systems or create cross-ledger complexity.

