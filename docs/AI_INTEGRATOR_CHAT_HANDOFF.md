# LoreRelay AI Integrator Chat Handoff

> Status: Living operational handoff
> Owner preference: Keisuke
> Purpose: Let a fresh LoreRelay integration chat resume orchestration without depending on a long prior conversation.
> Update rule: When a durable operating rule, model assignment, review lesson, or major task state changes, update this file.

> **Current entrypoint:** Start with `docs/AI_WORKFLOW.md` and the verification policy. This document is a current-state handoff and historical evidence, not a reason to repeat its old checks or copy it into a prompt. When this file conflicts with the canonical workflow, the canonical workflow and current `main` win.

---

## 0. Read this first in a new integration chat

The integration chat is the **Chief Integrator / orchestration lane**.

It is not the default place for long speculative design discussion. Other chats may be used as casual design/research companions. This chat should keep execution state coherent across GitHub, tests, reviews, branches, and AI handoffs.

At the start of a fresh chat:

1. Get current JST and fetch `origin/main`.
2. Read `docs/AI_WORKFLOW.md`, then this handoff only when current integration state is needed.
3. Reconcile the needed sections against `docs/AI_REVIEW_BACKLOG.md`, `docs/AI_FINDINGS_INBOX.md`, and current `main`; do not read every archived task document.
4. If the user explicitly tags Google Drive, search Drive for relevant LoreRelay material and state clearly when nothing relevant exists.

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
- PLAYTEST-UNBLOCK-001 is DONE and the machine is ready for the 5-minute Japanese Scrapbound / Start Hub smoke before resuming the longer playtest.

The human test was previously blocked by Antigravity Relay UX noise and then by the Japanese Scrapbound / Start Hub smoke issue. PLAYTEST-UNBLOCK-001 cleared the immediate app readiness blocker; ANTIGRAVITY-RELAY-001 still remains separate and pending real relay smoke.

When testing, capture:

- whether pressure is readable;
- whether the player hesitates;
- Run vs Sell local decisions;
- whether the user scans all markets mechanically;
- whether evidence labels explain anything;
- whether the loop becomes repetitive;
- whether the UI feels like work.

### Playtest Unblock 001

Status:

```text
DONE
```

Purpose:

```text
Unblock the user's immediate Japanese Scrapbound / Start Hub human smoke so they can return to actual gameplay testing.
```

Final known evidence:

```text
implementation: 4ce73dff7fbea0b416f4687a6554ede0cb1826ca
small repair: f03ff0c085b315702a4c370c8a396e94375540cb
adversarial review: 4e3fd36912da03ad0afcf08716b1cc1f2d499368
final verify: abc26509973cc6acdbcce529686814f527382277
integration tip: 9c4748226761efa5b73b9f9c9e68374de9db5a6a
post-merge smoke doc: af33cf7c50c489b2adedac6dd5cc68b787b2414b
```

Durable conclusions:

- focused PLAYTEST-UNBLOCK tests passed
- Scrapbound sample integrity and scenario pack tests passed
- webview bundle test passed
- Symbol Registry passed after CRLF-only local normalization
- full suite passed `230/230`
- literal everyday BAT install used `origin/main` with no installer-ref override
- managed installer checkout was `9c4748226761efa5b73b9f9c9e68374de9db5a6a`
- package hygiene class passed: `976` files, `25466364` bytes, SHA-256 `928280aa289b7c361351ad849f0a2d808c5e65b37229b449aa3b418df1594dc0`
- old visible `Expand-Archive` path did not appear
- Antigravity CLI succeeded and direct-folder fallback did not run after CLI success
- final installed version remained `1.77.15`

Immediate human smoke now requested:

```text
1. Open LoreRelay.
2. Set locale to Japanese.
3. Load Scrapbound.
4. Confirm Japanese narrative/status/options.
5. Open Character Profile and confirm レン・ヴェイル.
6. Click Start Hub.
7. Wait several seconds / allow normal state sync.
8. Confirm Start Hub does not kick back to chat.
9. Click Resume.
10. Confirm exact same session returns.
```

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

### Antigravity Relay 002

Purpose:

```text
LoreRelay writes .text-adventure/antigravity_relay_request.json
-> visible Antigravity Relay toggle ON
-> user runs /text-adventure-gm on the right
-> repo-owned GM skill reads the exact workspace request first
-> turn_result.json with matching metadata.requestId returns to LoreRelay
```

Current task state:

```text
ANTIGRAVITY-RELAY-002: VERIFYING - REAL_SMOKE_READY
```

Evidence:

```text
implementation: 33e652b690360f889d6543515846fb5afe07a9b4
repair: 2ffe79e9e0970984eb38d44c34fcce22c556bbe4
failed independent review: cf9f3b43d42bbd0793d11c94e31998def8a98d9e
repair verify: 09ce5a6dd71391cfcd6d290ca3b359eb323c7065
main integration: dc86941e1f49c1f7517e24e80f3f6e87a2bdc2b6
post-merge smoke: 31570183d880b31d77eb4f98a6e71d7803bf7709
automated result: PASS (compile, focused Relay tests, i18n, Symbol Registry, npm test 231/231)
install result: PASS via install_extension_antigravity.bat; installed Gemini skill hash matched repo-owned skill
```

Next required gate:

```text
Run the real human smoke:
1. Open LoreRelay.
2. Turn Antigravity Relay ON.
3. Choose one left-side action.
4. Run /text-adventure-gm on the right.
5. Confirm no 1/5 genre wizard.
6. Confirm same request/action is processed.
7. Confirm result returns left.
```

Do not mark ANTIGRAVITY-RELAY-002 DONE until the real smoke is recorded.

### Antigravity Relay 003

Purpose:

```text
Recover the real Antigravity smoke path so the user can use the short GM Skill trigger:
LoreRelay writes the pending request file
-> user sends /text-adventure-gm process pending LoreRelay request
-> repo-owned GM skill processes the exact workspace request
-> turn_result.json returns to LoreRelay
-> LoreRelay imports it and clears the waiting state
```

Current task state:

```text
ANTIGRAVITY-RELAY-003: VERIFYING - REAL_SMOKE_PARTIAL_PASS_SUPERSEDED_BY_004
```

Evidence:

```text
implementation candidate: 1e18d259006db589756cbe07525911119dc5bb87
independent verify: 3e203f253e3f8563a9b9a6859790aa2ee3882e58
main integration: 4aff826aad5198e5bdc6b05b54ad74a9dd44fcd1
post-merge smoke: a0f8426f5ff972cbf732949630764900334d1143
automated result: PASS (compile, focused Relay tests, i18n, Symbol Registry after CRLF-only normalization, npm test 231/231)
install result: PASS via install_extension_antigravity.bat; installed Gemini skill hash matched repo-owned skill
```

Real human smoke result:

```text
ANTIGRAVITY_RELAY_003_REAL_SMOKE_PARTIAL_PASS
```

Passed:

- pending request file created
- short trigger processed pending request
- right generated turn_result.json
- left imported result
- narration/status/options appeared
- multi-turn continuation worked

Failed / superseded by ANTIGRAVITY-RELAY-004:

- successful waiting row did not clear
- old GM loading timer remained
- pending/accepted UX was unclear

Do not claim full automatic chat injection. The short right-side trigger is the expected product behavior for this gate.

### Antigravity Relay 004

Purpose:

```text
Close the real-smoke UX gap after Relay 003:
generic GM loading row
-> Relay-specific pending UI with exact short trigger
-> explicit relayWaitingStateDone on matching accepted import
-> waiting row removed, timer stopped, controls unlocked
```

Current task state:

```text
ANTIGRAVITY-RELAY-004: VERIFYING - REAL_SMOKE_READY
```

Evidence:

```text
implementation candidate: 5103dc3fbbe2a06121be1a73bed5be086432a67e
independent verify: 292f3d97eececafa98106c31a86c0eaee5aaf896
main integration: c03c8d4b35f4b992313b67ed7690aa3930cfa552
post-merge smoke: 27a51234d52298c9843282587e44ffb6304c31f6
automated result: PASS (compile, focused Relay tests, i18n, Symbol Registry after CRLF-only normalization, npm test 232/232)
install result: PASS via install_extension_antigravity.bat; actual Antigravity IDE install target hash matched managed latest webview script; installed Gemini skill hash matched repo-owned skill
```

Current human gate:

```text
1. Open a fresh empty game workspace in Antigravity.
2. Open LoreRelay.
3. Turn Antigravity Relay ON.
4. Send one left-side LoreRelay action.
5. Confirm the generic "GM がターンを処理中..." row becomes Relay-specific waiting UI.
6. Confirm only one waiting row exists.
7. Confirm the UI clearly shows:
   /text-adventure-gm process pending LoreRelay request
8. Confirm a one-click copy action copies only that short command.
9. Send that short command on the right.
10. Confirm right processes the pending request file.
11. Confirm left imports the result.
12. Confirm waiting row disappears.
13. Confirm elapsed timer is gone.
14. Confirm controls unlock.
15. Confirm narration/options remain visible.
16. Click one returned option on the left.
17. Confirm the second turn enters the same Relay pending state.
18. Confirm the user does not need to copy the option text into the right chat.
```

Do not claim automatic right-side chat injection or automatic model-turn submission. The current product boundary is:

```text
left action
-> pending request
-> one short right-side trigger
-> result returns left
```

Do not mark ANTIGRAVITY-RELAY-004 DONE until this real smoke is recorded.

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
ANTIGRAVITY-INSTALL-002 is DONE.
ANTIGRAVITY-RELAY-001 remains VERIFYING - REAL_RELAY_SMOKE_PENDING.
Do not collapse these tasks into one status.
```

### Antigravity Install 002

Status:

```text
DONE
```

Purpose:

```text
Fast Antigravity install path and terminal root-entrypoint bootstrap
for the literal everyday BAT path
C:\AI\text-adventure-vsce\install_extension_antigravity.bat
```

Final known evidence:

```text
fast-install implementation: e3208a342c0a684b0e749a90816535c0cb6c344f
root-entrypoint final candidate: 8b6dacb672161d3afb1067f6c56448ab04256e82
prior independent review: 650adedc1c98e884a58c65789f2e7c17e3d696c2
final independent review: 8c9ccb573d26c47dcd6d0effd63256af56f5b787
integration tip: e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce
post-merge smoke doc: ff5a054eaec3832a0cf508763bbe5fe17984eba7
```

Durable conclusions:

- terminal literal BAT smoke used no installer-ref override and resolved `origin/main`
- managed installer checkout was `C:\AI\wt-lorerelay-installer-current` at `e9f9fef520ceecd2810ba09c4ce1c72e321cd8ce`
- physical root branch/HEAD stayed unchanged at `task/ANTIGRAVITY-INSTALL-001-verify` / `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- root dirty state stayed exactly `M install_extension_antigravity.bat`, `M webview/script.js`, `?? .claude/`
- package hygiene class passed: `970` files, `25435878` bytes, SHA-256 `912f9624bf3a31994fc4c520e133d3bd3a74f1f2bdf703b07e783de9463e489c`
- no old visible `Expand-Archive` / `lorerelay-vsix-<guid>.zip` path appeared
- Antigravity CLI succeeded and direct-folder fallback did not run after CLI success
- final installed version remained `1.77.15`
- automated post-merge suite passed `229/229` after CRLF-only Symbol Registry normalization

Important boundary:

```text
ANTIGRAVITY-INSTALL-002 is DONE.
ANTIGRAVITY-RELAY-001 remains VERIFYING - REAL_RELAY_SMOKE_PENDING.
Do not mark Relay DONE until the real clipboard/file relay smoke is recorded.
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

Operational lookup command:

```text
npm run knowledge -- <query>
```

Conditional use rules:

- Before adding a shared helper/exported type/public webview function/reusable constant, run the lookup for the proposed name.
- Before adding or changing a host-webview message, look up the message type and check protocol pairing output.
- Before adding a `textAdventure.*` configuration key, look up the proposed key.
- Before adding entity kinds, clock vocabulary, or cross-ledger reference terms, read the relevant `TERMINOLOGY_CONTRACT.md` section and identify the owning layer: D1 Identity Core, World Intent, or broader campaign/domain vocabulary.
- Before adding severity/event semantic reactions, read `EVENT_CLASSIFICATION_GLOSSARY.md` and look for existing `evaluate*Event` helpers.

Do not make all AI agents read the full Symbol Registry on every task; use targeted lookup instead.

KNOWLEDGE-OPS-001 status:

```text
DONE
```

Final known integration evidence:

- audit evidence `409868ea6f4ce40a1d8af3b48606c45e06106dbd`;
- implementation `e80292ad321d66324797f1f322dab72ec7b62bec`;
- protocol-pairing repair `02efaf9e98689b0ed0d1a94ae28d30b6a27ba4e5`;
- original independent verify `11db84a478916fac184554f0c7172fc1546b2705`;
- repair verify `2440a88b4a548d470044589dd94ccfb8f541314a`;
- post-merge smoke `docs/ai-tasks/KNOWLEDGE-OPS-001-POST-MERGE-SMOKE.md`;
- FAST gates passed: compile, knowledge lookup focused tests, Symbol Registry tests, `npm run knowledge -- relayWaitingStateDone`, `npm run knowledge -- EntityKind`.

Important review lesson:

- the original independent verify said `VERIFY_PASS`, but its own synthetic wrong-side receiver counterexample violated the protocol-pairing gate;
- the integrator classification is therefore `REPAIR_REQUIRED` for that verify, closed by the side-aware pairing repair and repair verify;
- host-to-webview senders pair only with `webview/modules/*` receivers, and webview-to-host senders pair only with `src/*` receivers.

AI-OPS integration lane rule:

- FAST lane is appropriate for doc/tooling-only integrations with accepted implementation + repair evidence and narrow smoke gates;
- NORMAL lane is appropriate when source/runtime behavior or packaging risk requires full suite and ordinary post-merge smoke;
- RECOVERY lane is appropriate when evidence is missing, main moved unexpectedly, or the task state must be reconstructed from local artifacts;
- do not silently promote a task to FAST when a verifier has an unresolved blocker.

### MEDIA-ARCHITECTURE-001

Status:

```text
DESIGN_READY
M1 is integrated separately; M2-M7 remain unstarted.
```

Durable design:

```text
docs/ai-tasks/MEDIA-ARCHITECTURE-001-COMFYUI-ACTION-ROUTING-DESIGN.md
design commit: 78c19eb4365634da2c248f8c34082b1f6be3f1ea
verdict: MEDIA_ARCHITECTURE_001_DESIGN_READY
```

Accepted target architecture (do not invent a competing stack):

```text
Media Intent
-> Media Profile
-> Prompt Compiler
-> Validated Generation Plan
-> local ComfyUI executor
```

Accepted execution architecture:

```text
LOCAL / DELEGATED / HYBRID
orthogonal to
DIRECT / MANUAL_HANDOFF
```

Product constraint:

```text
LoreRelay is distributed / multi-user.
Do not hard-lock media defaults to one personal GPU or one checkpoint path.
Use Media Profiles + hardware tiers + AUTO among installed compatible profiles.
Reference machine (e.g. 12GB NVIDIA class) is for built-in balanced defaults only.
```

M1 post-merge state:

```text
implementation: 046385f52a3f3f12ae1fc49aa9c46ae8798e2e60
candidate report: e2297138f8cf042d7a40f6e109464814d8ddcc66
independent verify: 18d81f90cc1004929f872214e8efd800c850802f
main integration: 34fec195396ef5cad695f04bd5b67fb4822e520c
normal gates: PASS, npm test 235/235 (run once)
status: VERIFYING — INSTALLER_RECOVERY_PENDING
installer recovery is supplied by INSTALLER-RELEASE-001 at version 1.78.0.
durable evidence: docs/ai-tasks/MEDIA-M1-POST-MERGE-SMOKE.md
```

### INSTALLER-RELEASE-001

```text
status: VERIFYING — REAL_INSTALL_PENDING
implementation: ee005c5f27c95348838526943eaf27e92f9c5939
independent verify: 9ba4fe47c2726bec83e5ba0942aff9fe82f545eb
FAST gates: PASS (compile, version consistency, installer PowerShell tests)
release identity: 1.78.0; expected VSIX lorerelay-1.78.0.vsix
durable evidence: docs/ai-tasks/INSTALLER-RELEASE-001-INTEGRATION.md
```

Required human sequence:

```text
1. Fully exit Antigravity IDE.
2. Run C:\AI\text-adventure-vsce\install_extension_antigravity.bat.
3. Require installer exit 0.
4. Require installed LoreRelay version 1.78.0.
5. Restart Antigravity.
6. Continue MEDIA-M1 real smoke A-D.
7. Do not mark INSTALLER-RELEASE-001 DONE before the real canonical BAT succeeds.
8. Do not mark MEDIA-M1 DONE before its human smoke passes. Do not begin M2-M7.
```

Remaining implementation sequence:

```text
M2  Media Intent + Prompt Compiler (scene / portrait)

M3  visualIdentity Core (LOCAL only)
    - schema, storage, edit UI, use in generation
    - do NOT add temporary AI handoff / HYBRID fill-if-missing here

M4  Expression Reference (img2img / reference continuity)

M5  Action Router + Manual Handoff
    - first place to activate HYBRID visualIdentity fill-if-missing via GM/provider

M6  Cartography Profile full integration

M7  Hardware Tier + AUTO
```

Sequencing trap to avoid:

```text
Do not implement HYBRID AI fill-if-missing in M3 before M5 Action Router exists,
or a throwaway one-off AI delegation path will appear.
```

M1 recommended AI: Codex High (touches image generation path). Do not under-effort M1.

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
A. Run the 5-minute Japanese Scrapbound / Start Hub human smoke from PLAYTEST-UNBLOCK-001.
B. Run the 30-minute Gameplay Slice 1 human playtest.
C. Run the ANTIGRAVITY-RELAY-004 real completion-state smoke with `/text-adventure-gm process pending LoreRelay request` when returning to Relay.
D. MEDIA-ARCHITECTURE-001 is DESIGN_READY on main (docs only). After Codex weekly quota resets, start M1 Compatibility Gate + Profile Spine (Codex High). Do not start M3 HYBRID AI fill before M5.
E. Choose the next gameplay/product slice based on actual playtest evidence.
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
