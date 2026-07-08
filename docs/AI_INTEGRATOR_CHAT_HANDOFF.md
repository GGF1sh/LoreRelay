# LoreRelay AI Integrator Chat Handoff

> Status: Living operational handoff
> Owner preference: Keisuke
> Purpose: Let a fresh LoreRelay integration chat resume orchestration without depending on a long prior conversation.
> Update rule: When a durable operating rule, model assignment, review lesson, or major task state changes, update this file.

---

## 0. Read this first in a new integration chat

The integration chat is the **Chief Integrator / orchestration lane**.

It is not the default place for long speculative design discussion. Other chats may be used as casual design/research companions. This chat should keep execution state coherent across GitHub, tests, reviews, branches, and AI handoffs.

At the start of a fresh chat:

1. Get current JST with the user-info tool.
2. Fetch current `origin/main` state from GitHub.
3. Read, in this order:
   - `docs/AI_INTEGRATOR_CHAT_HANDOFF.md`
   - `docs/AI_REVIEW_BACKLOG.md`
   - `docs/AI_FINDINGS_INBOX.md`
   - `docs/AI_PROMPT_HANDOFF_POLICY.md`
   - `docs/AI_EXPLORATION_BUDGET_POLICY.md`
   - `docs/AI_EXTERNAL_REVIEW_PACKET_POLICY.md`
4. Reconcile this snapshot against current GitHub before acting. This file can become stale; current main and tests are authoritative.
5. If the user explicitly tags Google Drive, search Drive for relevant LoreRelay material and state clearly when nothing relevant exists.

Recommended opening instruction for a new chat:

```text
Read docs/AI_INTEGRATOR_CHAT_HANDOFF.md first, then reconcile it against current main, docs/AI_REVIEW_BACKLOG.md, and docs/AI_FINDINGS_INBOX.md before making any task decision.
```

---

## 1. Project identity and fixed local path

Repository:

```text
GGF1sh/LoreRelay
```

Canonical local repo path for local agents:

```text
C:\AI\text-adventure-vsce
```

Local-agent prompts should begin with:

```text
Repository:
C:\AI\text-adventure-vsce

Before starting:
cd C:\AI\text-adventure-vsce
git fetch origin

Do not search for the repository elsewhere.
Do not inspect unrelated worktrees.
```

User timezone:

```text
Asia/Tokyo (JST)
```

Do not invent another repo location. Do not send browser-only AIs local file paths unless they genuinely have local filesystem access.

---

## 2. Source of Truth hierarchy

Use this order:

1. current GitHub `main`
2. tests / CI / post-merge smoke evidence
3. `docs/AI_REVIEW_BACKLOG.md`
4. `docs/AI_FINDINGS_INBOX.md`
5. `AI_SHARED_LOG.md`
6. GitHub design / task / review docs
7. Google Drive docs
8. old chats, pasted AI reports, memory

Important consequences:

- A pasted AI report is not accepted evidence until its branch/commit is verified on GitHub.
- A claimed PASS is not accepted until the exact code path and tests are checked.
- A branch can be stale even when its implementation looks correct.
- A Drive idea note can inform design but does not override current code or accepted GitHub contracts.

---

## 3. Mandatory behavior on LoreRelay turns

For every integration turn:

1. Get current JST before responding.
2. Verify any claimed GitHub commit/report before accepting it.
3. Update central GitHub control artifacts when task state changes.
4. Keep chat concise; put detailed audits and repair lists in GitHub docs.
5. Never claim Google Drive was updated unless it actually was.
6. Never mark a task `DONE` before merge + post-merge smoke, and also satisfy any task-specific terminal gate such as a required human playtest.
7. If Google Drive is explicitly tagged, search it when relevant.

When the user pastes an AI implementation report:

```text
report
→ fetch exact commit
→ compare to intended base/main
→ inspect actual diff and critical files
→ verify contract/code path
→ write durable review/intake if needed
→ update board
→ only then accept / repair / merge
```

---

## 4. User communication preferences

The user strongly prefers compact orchestration messages.

### Normal chat response

Usually include only:

- current JST;
- verdict/current status;
- durable GitHub artifact written or verified;
- next AI / Model / Reasoning;
- one compact paste-ready prompt when needed.

Do **not** repeat a long numbered audit in chat after it has already been written to GitHub.

The user explicitly disliked repeated blocks such as “1 through 6” after the details were already durable.

Long chats can cause salience/context-prioritization failures even when information is not literally forgotten. Therefore:

- move durable rules into GitHub;
- move task details into review/task docs;
- start new chats from this handoff rather than relying on conversational memory.

Do not produce giant handoff prompts unless the target AI cannot read the durable docs.

Do not omit `Model` or `Reasoning` in AI handoffs.

---

## 5. Compact AI handoff format

Default:

```text
AI:
<Model provider / product>

Model:
<exact model>

Reasoning:
<level>

Role:
<one line>

Repository:
C:\AI\text-adventure-vsce

Before starting:
cd C:\AI\text-adventure-vsce
git fetch origin

Read:
- exact durable docs/files

Task:
One concise task only.

Exploration budget:
<narrow / repo-wide rule>

Do not:
- broaden scope
- touch forbidden systems

Output:
<path or commit expectations>

Final verdict:
<exact verdict strings>
```

For narrow work, the prompt should often say:

```text
Read the listed task/review documents as source of truth.
Fix or verify only the remaining recorded blockers.
Do not broaden scope.
```

---

## 6. Exploration budget rules

A prior narrow UX Gate consumed about 100k tokens because an exploration agent was allowed to roam. This is considered a process failure.

Use the repository policy:

### Small repair / focused verify

```text
target <=15k tokens
no subagent
no exploration agent
named docs + smallest exact touch set
normally <=8 source files
```

### UX Gate / implementation Gate / narrow architecture

```text
target <=30k tokens
no broad repo scan
no subagent by default
normally <=15 source files
```

### Repo-wide audit / cross-system architecture

Large exploration is allowed only when the task explicitly says it is repo-wide.

Mandatory stop rule:

```text
If the task exceeds its exploration tier:
stop broadening
write verified facts
list exact unknowns
return BLOCKED_BY_EXPLORATION_BUDGET
```

Do not reward an AI for spending huge context on a narrow task.

---

## 7. Model / role matrix

Default assignments:

| Role | AI / Model | Reasoning | Use |
| --- | --- | --- | --- |
| Chief Integrator | ChatGPT 5.5 Thinking | High | architecture, orchestration, repo-wide verification |
| Normal design / organization | ChatGPT 5.4 | appropriate | bounded design work |
| Critical runtime implementation / repair | Codex 5.5 | Very High | difficult correctness-critical code |
| Large normal implementation | Codex 5.5 | High | integration / substantial implementation |
| Normal implementation / repair | Codex 5.4 | appropriate | bounded code work |
| Small mechanical repair / tests | Codex 5.4 mini | appropriate | small touch set |
| Narrow race / state machine audit | o3 | narrow | crash windows / concurrency only |
| Independent adversarial architecture | Gemini 3.1 Pro | High | design attack / second architecture review |
| Broad same-pattern audit | Gemini 3.5 Flash | appropriate | bulk audit |
| UX / onboarding / product flow | Claude Sonnet | High | default Claude lane |
| Independent implementation verification | Claude Sonnet | High | used successfully for Slice 1 |
| Gameplay exploit / boredom breaker | Grok | adversarial | dominant strategy / repetitive loop attacks |
| Repo engineer in local IDE | Antigravity / Gemini | High | direct local implementation when suitable |

Default Claude handoff:

```text
AI:
Claude

Model:
Claude Sonnet

Reasoning:
High
```

Do not automatically use the most expensive model for tiny mechanical fixes.

---

## 8. Task lifecycle and WIP control

Lifecycle:

```text
DISCOVERED
→ CONFIRMED
→ GATE_DRAFTED
→ ADVERSARIAL_REVIEW
→ READY_TO_IMPLEMENT
→ IMPLEMENTING
→ VERIFYING
→ BULK_AUDIT
→ SECOND_REVIEW
→ DONE
```

Exceptions:

```text
BLOCKED
DEFERRED
REJECTED
```

WIP limits:

```text
IMPLEMENTING max 3
Architecture P0/P1 Gate max 2
ADVERSARIAL_REVIEW max 2
same Touch Set implementation max 1
```

One task should normally map to:

```text
1 task
1 chat
1 branch
1 isolated worktree
```

---

## 9. Code-grounding Gate for external AI reviews

This rule was added after a false PASS caused by semantic plausibility being mistaken for implemented mechanics.

Never infer a mechanic because related field names are nearby.

Mandatory principles:

```text
field exists
≠
mechanic exists

mechanic exists
≠
two values are comparable

higher abstract indicator
≠
higher actual outcome
```

For every PASS-critical claim verify:

```text
input
→ function / rule
→ mutation or returned value
→ authority / persistence boundary
→ player-visible outcome
```

Forbidden review habits:

- field-name proximity as evidence;
- design-doc wording as evidence of implementation;
- semantic/domain plausibility as evidence;
- searching only for confirming evidence.

When code and design disagree, prefer `FAIL` or `BLOCKED` over inventing a missing connection.

---

## 10. Core architecture principles

Keep these distinctions explicit:

```text
Existence volume != processing volume
Candidate != Selected != Delivered != Consumed
Canonical State != Causal Input
Query / Preview != Mutation
Process Exit != Accepted Turn
Partial restore != time travel
Server decides authority
Trace records real cause
Stable IDs must be collision resistant
World Truth / Access / Knowledge / Memory / Awareness differ
Shadow before authority is preferred
```

Most important product principle:

> The current LoreRelay priority is not more features. It is surviving 100 turns without breaking.

---

## 11. Current product direction

LoreRelay has evolved from:

```text
AI GM
+ many game systems
```

into a three-layer direction:

```text
1. Deterministic World Simulation
2. Player Decision Surface
3. AI only where meaning / dialogue / narration adds value
```

Current decision doctrine:

```text
1. Causal Connection
2. Player Readability / Attribution
3. Decision Surface
```

Current diagnosis:

```text
Connection        substantial
Readability       partial
Decision Surface  weak but improving
```

Useful transformations:

```text
Hidden Drift
→ Readable Pressure
→ Actionable Choice
```

and:

```text
Background Causality
→ Player Attribution
→ Decision Window
→ Commitment
→ Consequence Memory
```

Main gameplay evaluation question:

> What did the player have to think about?

---

## 12. AI participation doctrine

Drive and GitHub ideas converge on:

```text
Simulation decides what happened.
AI may explain, narrate, interpret, name, or converse.
AI must not secretly become simulation authority.
```

Useful rules:

```text
AI may interpret the simulation.
AI may not become the simulation.
```

```text
AI may name the world.
AI may not secretly rebalance the world.
```

Narration on Demand direction:

```text
deterministic simulation
→ interesting event selection
→ optional AI narration / dialogue / recap
```

The world should be able to continue through long AI-silent periods.

---

## 13. Important future product ideas already recorded

### AI World Dressing

AI can propose world-specific display names and flavor for existing mechanical entities.

Good first scope:

- commodity display names;
- regional specialties as aliases/flavor;
- shop/inn/workshop names;
- transport display names;
- short descriptions.

Do not let naming silently change IDs, prices, stock, market authority, or simulation balance.

### NOAI long-horizon playtest

Correct future order:

```text
NOAI long-horizon runner
+ minimal structured telemetry
+ deterministic aggregate checks
```

Only after machine summaries exist should a read-only AI analyst be added.

### Social conflict / persuasion loop

A strong future slice candidate:

```text
Pressure
→ Intent
→ Dialogue Window
→ Proposal
→ Typed Commitment / Concession
→ Deterministic Resolution
→ Event Receipt / Memory
```

Core rule:

> Dialogue may negotiate the consequence. Dialogue must not erase the underlying conflict for free.

Main exploit to attack:

```text
persuasive prose
→ free bypass of all consequences
```

### eramegaten reference constraint

The user explicitly required that R-18 content from that reference project must never be inspected, summarized, quoted, or discussed.

Use only non-adult simulation, UI, decision-compression, long-term content organization, and related design lessons.

---

## 14. Current execution snapshot — 2026-07-08 JST

Always re-fetch current GitHub before acting.

### Gameplay Slice 1 — The Fading Spike

Status:

```text
VERIFYING
```

Key integration:

- merged to main at `e4280d0`;
- post-merge smoke PASS recorded at `669cae3`;
- implementation verification baseline was `55ec1bb`;
- human 30-minute hybrid playtest is still required before terminal completion;
- direct AI-off travel commit seam is not part of Slice 1.

The human test was blocked by Antigravity Relay UX noise.

When testing, capture:

- whether pressure is readable;
- whether the player hesitates;
- Run vs Sell local decisions;
- whether the user scans all markets mechanically;
- whether evidence labels explain anything;
- whether the loop becomes repetitive;
- whether the UI feels like work.

### Antigravity Relay 001

Purpose:

```text
LoreRelay prepares context
→ clipboard
→ user pastes into Antigravity chat
→ Antigravity writes conforming turn_result.json
→ existing LoreRelay watcher imports/applies it
```

There is no proven API path that directly injects LoreRelay text into the Antigravity chat UI.

Current task state:

```text
ANTIGRAVITY-RELAY-001: VERIFYING — REAL_RELAY_SMOKE_PENDING
```

Evidence:

```text
implementation/integration: 8e7dc27ff583d43641297941886c7c89a0f53a9c
candidate head: 4e1c748e924f061367f3cd70804557846c98e470
independent final verify: c10f1720312efe2ef41bb766e3d9c66007c939d7
post-merge automated smoke: b15f0483874c1a2807d815b72bdaa50e5c83c920
automated smoke result: PASS (compile, focused relay, Slice 1 regression, i18n, Symbol Registry, npm test 227/227)
```

Next required gate:

```text
Run a real 1-2 turn Antigravity clipboard/file relay smoke.
```

Do not mark ANTIGRAVITY-RELAY-001 DONE until that external relay proof is recorded. Do not re-open broad design unless the real smoke reveals a concrete defect.

### Antigravity Install 001

Status:

```text
DONE
```

Final known evidence:

```text
implementation: 3cb51a31b173ac511b6d9522e03a405a867b665b
independent verify: ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7
integration to main: a5dea994480ec9dd84933027aa7172f263cd15fa
post-merge smoke doc: c06bb874e002b44c6577459d30489fe659acb97a
```

Durable conclusions:

- clean package hygiene passed with `968` entries, size `25434266`, SHA-256 `abf6e0ebee5558800e822c9a6acec42100f2c64d2fdd79f480999bcee496fad7`
- no nested VSIX was present in the clean package
- no `.git`, `.claude`, backup, or temp extraction content was present in the clean package
- repaired installer passed focused tests, compile, and full suite `228/228`
- live Antigravity install smoke succeeded and final installed version was `1.77.15`

Important boundary:

```text
ANTIGRAVITY-INSTALL-001 is DONE.
ANTIGRAVITY-RELAY-001 remains VERIFYING - REAL_RELAY_SMOKE_PENDING.
Do not collapse these tasks into one status.
```

### Symbol Registry generator

User and integrator concluded that a manually maintained function/variable dictionary would rot.

Correct design:

```text
source code
→ deterministic scanner
→ docs/generated/symbol_registry.json
→ docs/generated/SYMBOL_REGISTRY.md
```

Branch/head at this snapshot:

```text
branch: task/SYMBOL-REGISTRY-generator
head: e7eacf81105b27abf72153f21a6f4bdd39eae973
base: 885a1be81abba1c48a5abd94948fea0a479c75b2
```

Verified GitHub relation at snapshot time:

```text
exactly 1 commit ahead
0 behind
```

Changed files:

- `docs/generated/SYMBOL_REGISTRY.md`
- `docs/generated/symbol_registry.json`
- `package.json`
- `scripts/generate_symbol_registry.js`
- `scripts/run_all_tests.js`
- `scripts/test_symbol_registry.js`

Reported tests:

```text
npm run check:symbol-registry PASS
node scripts/test_symbol_registry.js PASS
npm run compile PASS
npm test 227/227 PASS
```

This branch has been merged and post-merge smoke passed.

Final known post-merge evidence:

- implementation commit `82acffca923b9ff0836c034674aefebdf6ab9c72`;
- independent verify commit `051a3e874b33a2278e40182a421bab15b76d0870`, merged to main as `16df40b5db1f8fa7aae45b9c565558a21593f02a`;
- post-merge smoke doc commit `5b85f2999bb97f75356300a2373fbe1b738fcd80`;
- full suite `227/227` at completion.

New AI agents should consult the generated registry before doing broad symbol discovery.

Do not register every local variable. The valuable scope is shared/public/cross-system symbols:

- exported TS declarations;
- important top-level Webview functions;
- `window.*` APIs;
- host↔webview message types;
- `textAdventure.*` configuration keys.

Keep curated terminology docs and generated symbol registry as separate layers.

### NOAI Phase 0

Status:

```text
DONE
```

Final known post-merge evidence:

- integration tip `22c4602`;
- post-merge result `20d982a`;
- full suite `226/226` at completion.

### Runtime 003A

Status:

```text
DONE
```

Purpose:

```text
Durable Accepted Turn Identity / Restart Replay Guard
```

Final known integration:

- merge `5740fbb`;
- post-merge smoke `d6bd50d`;
- `225/225` at completion.

---

## 15. Recommended immediate order after this handoff

Unless current GitHub has moved on:

```text
A. Run a real 1-2 turn Antigravity clipboard/file relay smoke.
B. Run the 30-minute Gameplay Slice 1 human playtest.
C. Choose the next gameplay/product slice based on actual playtest evidence.
```

Symbol Registry generator work is already implemented, verified, merged, and smoked. Do not restart it while clearing the Relay smoke gate.

Do not start a large new gameplay subsystem merely because the current test is inconvenient.

---

## 16. Common failure patterns learned in this project

### 16.1 Stale branch construction

An implementation was created from `55ec1bb` while accepted main was 21 commits ahead.

Rule:

```text
Always compare implementation head to current intended base.
Do not merge a branch merely because its own tests pass.
```

### 16.2 Fake focused tests

A relay test once built a local hard-coded payload object and asserted itself.

Rule:

```text
A focused test must execute production code or a production-extracted pure helper.
```

### 16.3 Guessed DOM IDs

`player-send-btn` was used while the actual DOM ID was `send-btn`.

Rule:

```text
Never accept UI wiring claims without checking the real markup/source.
```

### 16.4 Wrong lifecycle signal

Relay waiting was cleared by any state refresh instead of an accepted external result.

Rule:

```text
ambient state update
!=
accepted external turn result
```

### 16.5 Normal-GM UI in external-agent mode

The original live bug showed `GM processing` even though Antigravity required manual paste.

Rule:

```text
Only one active control surface should be presented.
Do not show false action affordances.
```

### 16.6 Generated-file drift

`webview/script.js` must be regenerated from source modules and must not contain unrelated generated-only edits.

### 16.7 EOL-only dirty files

Known Windows EOL noise can affect:

- `webview/script.js`
- `webview/style.css`
- `webview/vendor/mermaid.min.js`

Do not mix EOL cleanup into unrelated tasks.

### 16.8 Untracked local tool folders

A pre-existing `.claude/` folder has appeared in local worktrees. Do not commit it accidentally.

### 16.9 Hard-coded English in a four-locale app

New user-facing strings should use the established locale path unless the accepted scope explicitly says otherwise.

### 16.10 Design prose mistaken for code reality

A persuasive design document can bias reviewers into searching only for confirming evidence.

Always falsify critical assumptions.

---

## 17. Prompting lessons by AI

### Claude

Best for:

- UX flows;
- onboarding;
- decision-surface design;
- independent implementation verification.

Risk observed:

- can over-explore a narrow task if given permission or an exploration agent.

Prompt discipline:

```text
name exact docs
name exact open questions
set <=15k or <=30k budget
forbid exploration agent for narrow work
```

### Gemini 3.1 Pro / Antigravity

Best for:

- adversarial architecture;
- local repo implementation;
- direct IDE edits.

Risks observed:

- may report local success before commit/push;
- may implement from a stale branch;
- may satisfy prose while missing a concrete UI ID/lifecycle detail.

Always require:

```text
branch
full commit SHA
exact changed-file list
exact test commands/results
```

Then verify on GitHub.

### Codex

Best for:

- correctness-critical implementation;
- repo-wide deterministic tooling;
- difficult repair.

Good use of expensive/reset-limited capacity:

- reusable infrastructure such as the Symbol Registry generator;
- not a one-line UI ID fix.

### Gemini 3.5 Flash

Use for broad same-pattern audits, not nuanced final architecture acceptance.

### Grok

Use to attack:

- dominant strategies;
- save/reload exploits;
- repetitive loops;
- boredom and fake choices.

### o3

Use narrowly for:

- state machines;
- races;
- crash windows;
- ordering faults.

Do not use as a generic repo reviewer.

---

## 18. External AI review packet rules

Browser/external AIs must receive:

- exact code commit;
- exact review packet ref;
- exact task question.

Do not tell a browser-only AI to inspect `C:\AI\...`.

Do not ask it to infer the task from current HEAD.

When local-only artifacts matter, package them into a GitHub review packet whenever practical.

---

## 19. Google Drive handling

Drive is secondary to GitHub for implementation truth.

Known relevant Drive content includes:

- `LoreRelay Idea Note - Narration on Demand / AI Optional Living World`

It supports:

- Simulation Only mode;
- long AI-silent periods;
- selective context retrieval;
- AI sampling important events rather than receiving all logs.

At the time this handoff was written, Drive searches found no dedicated:

- integration-chat handoff;
- Antigravity Relay implementation spec;
- function/variable Symbol Registry.

Do not claim a relevant Drive document exists without searching.

---

## 20. Durable reference documents

Important policies:

```text
docs/AI_PROMPT_HANDOFF_POLICY.md
docs/AI_EXPLORATION_BUDGET_POLICY.md
docs/AI_EXTERNAL_REVIEW_PACKET_POLICY.md
docs/AI_REVIEW_BACKLOG.md
docs/AI_FINDINGS_INBOX.md
```

Important ideas:

```text
docs/ideas/NARRATION-ON-DEMAND-AI-OPTIONAL-LIVING-WORLD.md
docs/ideas/NARRATION-ON-DEMAND-NARRATIVE-SAMPLING-ADDENDUM.md
docs/ideas/NOTEBOOKLM-CAMPAIGN-BRAIN-POC.md
docs/ideas/NOAI-LONG-HORIZON-PLAYTEST-AND-AI-ANALYST.md
docs/ideas/ERAMEGATEN-AI-OFF-TEXT-SIM-REFERENCE.md
docs/ideas/AI-WORLD-DRESSING-CONTENT-PASS.md
```

Current terminology layers:

```text
docs/TERMINOLOGY_CONTRACT.md
docs/EVENT_CLASSIFICATION_GLOSSARY.md
scripts/check_terminology_contract.js
```

Planned/implemented generated discovery layer on its task branch:

```text
docs/generated/SYMBOL_REGISTRY.md
docs/generated/symbol_registry.json
```

---

## 21. Final rule for future integration chats

The purpose of this handoff is not to preserve every sentence from an old chat.

It should preserve:

```text
how the user wants the project managed
how evidence is accepted
how AIs are assigned and prompted
what failure patterns have already been learned
what the project is currently trying to become
what is actually unfinished right now
```

When this file and current main disagree:

```text
current main + tests win
```

When a new durable lesson is learned:

```text
update this file
```
