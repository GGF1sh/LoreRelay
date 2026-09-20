# Rules Profile / Genesis Guide AI Prompts

> Source design: `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
> Status: prompt pack for future implementation.

## 0. Shared Header

```markdown
LoreRelay Rules Profile / Genesis Guide task.

Before working, read:
1. `AI_SHARED_LOG.md` Current Snapshot
2. `CHANGELOG.md` latest section
3. `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
4. `src/gameRules.ts`
5. `src/quickstartRunner.ts`
6. `webview/modules/05-quickstart.js`
7. `webview/modules/70-game-rules.js`

Source of truth:
- Existing source code and `CHANGELOG.md` beat old chat history.
- The LLM guide is non-authoritative. A deterministic resolver must decide supported rule patches.

Hard constraints:
- Do not let Webview write canonical JSON directly.
- Do not let an LLM invent or apply unsupported `game_rules.json` fields.
- Manual Game Rules overrides must remain possible.
- Keep the initial user path short; advanced settings stay behind a secondary route.
```

## 1. ChatGPT / Codex Gate Prompt

```markdown
You are the architecture and security gate for LoreRelay's Genesis Guide / Rules Profile system.

Task:
Review `docs/RULES_PROFILE_ONBOARDING_DESIGN.md` and define the RP1/RP2 contract before implementation.

Decide:
1. Allowed `rulesPatch` fields for RP1.
2. Whether `rules_profile.json` is allowed in RP2 or deferred.
3. How manual Game Rules overrides interact with re-running Genesis Guide.
4. How unknown future fields are ignored.
5. Whether `vehicleFuelMode` should become a real `game_rules.json` field now or remain a profile hint.
6. Which tests are required for `rulesProfileCore.ts`.

Output:
- Findings table: severity / issue / recommendation.
- Approved RP1 data contract.
- Approved RP2 write boundary.
- Required tests.
- Explicit non-goals.

Do not implement code.
```

## 2. Grok Implementation Prompt - RP1 Pure Resolver

```markdown
Implement RP1 only: `rulesProfileCore.ts` pure resolver for LoreRelay Genesis Guide.

Read:
- `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
- `docs/RULES_PROFILE_AI_PROMPTS.md`
- ChatGPT/Codex RP1/RP2 gate result, if present
- `src/gameRules.ts`
- `src/campaignKitCore.ts`

Implement:
- `src/rulesProfileCore.ts`
- built-in profile catalog:
  - story-first
  - standard-adventure
  - wasteland-scavenger
  - road-warrior
  - hard-survival
  - settlement-sim
  - mobile-haven
  - light-parlor
- deterministic `resolveRulesProfile(answers)`
- output shape:
  - `profileId`
  - `rulesPatch`
  - `hints`
  - `summaryLines`
  - `warnings`
- parser/sanitizer for answers
- no vscode/fs imports
- no disk writes
- no Webview code

Tests:
- `scripts/test_rules_profile_core.js`
- one snapshot-ish assertion per built-in profile
- unknown values fall back safely
- manual override behavior is not implemented in RP1
- road-warrior keeps fuel as hint unless gate approved a real field
- mobile-haven enables only supported flags

Update:
- `CHANGELOG.md` [Unreleased]
- `AI_SHARED_LOG.md`

Verify:
- `npm run compile`
- `node scripts/test_rules_profile_core.js`
- `npm test`
- `node scripts/validate_utf8_docs.js`
```

## 3. Claude UI Prompt - RP3 Genesis Guide Wizard

```markdown
Implement the Genesis Guide Webview UI for LoreRelay, but only after RP1 `rulesProfileCore.ts` exists.

Recommended model: Claude Sonnet
Recommended reasoning: Medium

Read:
- `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
- `src/rulesProfileCore.ts`
- `webview/modules/05-quickstart.js`
- `webview/modules/70-game-rules.js`
- `webview/modules/90-bootstrap.js`
- `webview/index.html`
- `webview/style.css`
- locale files

Goal:
Add a friendly first-run wizard that appears from Start Hub and asks:
1. Genre
2. Playstyle & Signature System
3. Pressure & Bookkeeping
4. Protagonist / Party
5. Summary & Start

Design:
- Product-facing name: Genesis Guide.
- Persona changes by genre, but do not hard-code "goddess" everywhere.
- Keep the UI compact. 3-6 option chips per step.
- "Start now" or equivalent escape should be visible after enough answers exist.
- Advanced Game Rules remains a secondary path.

Strict constraints:
- Webview UI must not write JSON directly.
- No direct `game_rules.json` writes from JS.
- No direct `settlementOps`, `vehicleOps`, or other state mutation.
- Use postMessage only for a future host apply action.
- If host wiring does not exist yet, use a disabled/placeholder final button or emit a clearly named inert message for later wiring.
- Keep all text i18n-ready.

Update:
- `CHANGELOG.md` [Unreleased]
- `AI_SHARED_LOG.md`

Verify:
- `npm run compile`
- `npm test`
- i18n key checker
- UTF-8 docs checker
```

## 4. Grok Host Wiring Prompt - RP2/RP4

```markdown
Implement Genesis Guide host wiring after RP1 and RP3 are complete.

Read:
- `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
- `src/rulesProfileCore.ts`
- `src/gameRules.ts`
- `src/quickstartRunner.ts`
- Webview Genesis Guide module from RP3

Goal:
Wire the Webview guide to the host:
- receive selected answers via postMessage;
- resolve through `rulesProfileCore`;
- apply allowed `rulesPatch` through existing `saveGameRules()` sanitization;
- pass selected profile summary into Quickstart generation;
- never let LLM output directly apply flags.

Gate:
Follow ChatGPT/Codex RP2 write-boundary result.

Tests:
- host handler rejects unknown profile IDs;
- unsupported flags are ignored;
- `saveGameRules()` remains the only write path to `game_rules.json`;
- Quickstart can receive a profile summary without requiring an LLM provider.

Verify:
- `npm run compile`
- focused tests
- `npm test`
- UTF-8 docs checker
```

## 5. Gemini Docs Prompt

```markdown
Review and write user-facing documentation for LoreRelay Genesis Guide.

Read:
- `docs/RULES_PROFILE_ONBOARDING_DESIGN.md`
- `docs/FIRST_SESSION.md`
- `README.md`
- current implementation files if RP1/RP3/RP4 exist

Task:
Draft concise README and FIRST_SESSION updates explaining:
- Genesis Guide as first-run setup
- profile examples
- manual Game Rules override
- examples like "mobile base trading without fuel bookkeeping"

Do not implement code.
```

