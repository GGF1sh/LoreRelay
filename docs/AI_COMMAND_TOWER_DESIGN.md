# AI Command Tower Design

> Status: design only.
> Scope: multi-AI coordination, task routing, review gates, and handoff hygiene for LoreRelay.
> Non-scope: runtime state orchestration, JSON ledger persistence, or automated agent execution.

## 1. Purpose

LoreRelay now has many cooperating subsystems: Campaign, Parlor, In-World Chat, Living World, Settlement, Vehicle, Mobile Base, Mod System, Visual Memory, TTS, ComfyUI, and replay/export. The project also uses several AI assistants with different strengths. The AI Command Tower is the project-level operating model that decides:

- which AI should receive which task;
- what context packet each AI must read;
- what reasoning level is appropriate;
- which safety gate must run before implementation;
- where work history and decisions are written;
- when a task is ready for commit, release, or another AI.

The Command Tower is not a new autonomous AI agent. It is a coordination layer for the human user and assisting AIs.

## 2. Core Principle

Keep the implementation architecture decentralized, but centralize coordination.

- Code remains modular: `*Core.ts`, host wrappers, Webview modules, and JSON ledgers stay separated.
- Authority is centralized: every task gets a declared owner, scope, gate, verification plan, and handoff target.
- No AI is allowed to infer that "everything should be refactored" from a local task.
- No AI is allowed to treat review notes as source of truth over source code, `CHANGELOG.md`, and `AI_SHARED_LOG.md`.

## 3. Roles

### Human User

Final authority. Chooses priorities, approves risky scope expansion, confirms local-only/private data usage, and decides releases.

### Codex / ChatGPT

Architecture gatekeeper and contract writer.

Best for:

- cross-ledger contracts;
- security boundaries;
- state/write-surface audits;
- prompt and context-budget design;
- splitting large tasks into safe phases;
- final code review after Grok/Claude/Gemini changes.

Avoid using for:

- pure visual taste polish without a concrete code target;
- long broad research unless the user wants synthesis.

### Claude

UI/UX, Webview ergonomics, copy polish, and interaction design.

Best for:

- Webview layout and CSS;
- empty states, onboarding, and Start Hub flows;
- accessibility and i18n UI details;
- visual polish for Vehicle, Mobile Base, Settlement, Mod Manager, Parlor, and map views.

Guardrails:

- read-only UI unless explicitly authorized;
- no new persistence path;
- no canonical JSON writes from Webview;
- no hidden state mutation behind "preview" buttons.

### Grok

Fast implementation and Windows-local verification.

Best for:

- `*Core.ts` pure function implementation;
- tests and regression fixes;
- provider scripts, ComfyUI, local CLI integration;
- commit/push/release packaging when explicitly requested.

Guardrails:

- must not skip gate docs for cross-ledger work;
- must commit only intended files;
- must report exact commit hash, tests, and unresolved risks.

### Gemini

Large-context synthesis, documentation, README, user-facing positioning, and long-form consistency checks.

Best for:

- comparing docs against actual state;
- README and multi-language documentation;
- feature positioning and external explanation;
- screenshot/demo planning;
- broad design synthesis from many AI outputs.

Guardrails:

- design/docs first unless explicitly asked for code;
- must not treat old review docs as current truth.

### Local Coder Model

Optional low-cost assistant for narrow, mechanical sub-tasks.

Best for:

- small pure helpers;
- exhaustive enum/table updates;
- local test fixtures;
- repeated low-risk refactors.

Guardrails:

- never sole owner of security, persistence, or cross-ledger changes;
- output must be reviewed by Codex/ChatGPT or Grok before merge.

## 4. Task Classes

Every task should be assigned one class before dispatch.

| Class | Description | Primary AI | Gate |
|---|---|---|---|
| Contract | Data model, write boundary, ledger contract | Codex/ChatGPT | Required before implementation |
| Pure Core | Parser, validator, deterministic state transform | Grok/Codex | Unit tests required |
| Host Wiring | VS Code, filesystem, queues, provider scripts | Grok/Codex | Compile + integration tests |
| Webview UI | HTML/CSS/JS, read-only rendering, accessibility | Claude | UI scope guard |
| UX Audit | Findings, priority, copy, interaction flow | Claude/Gemini | No code unless requested |
| Docs/Release | README, changelog, guides, release notes | Gemini/Codex | Source-of-truth check |
| Security Review | path, prompt, postMessage, secrets, trust boundary | Codex/ChatGPT | Must list severity |
| E2E/Packaging | install script, VSIX, release, smoke tests | Grok | Manual gaps recorded |

## 5. Reasoning Level Policy

Use the smallest reasoning level that matches the risk.

| Level | Use when | Examples |
|---|---|---|
| Low | mechanical copy, wording, known small fix | locale typo, button label, README line |
| Medium | ordinary UI polish or isolated implementation | Vehicles tab CSS, MOD panel empty state |
| High | architecture, cross-ledger, security, multi-AI routing | State Orchestrator, Mobile Base ops, Mod loader contract |
| Highest | only when decisions are irreversible or highly coupled | rewriting persistence architecture, release-blocking incident postmortem, broad migration plan |

If the user is already on a higher level than recommended, continue unless the task is trivial and the user asks to conserve tokens. If the user is below the recommended level, stop and ask for a switch before deep design or risky implementation.

## 6. Dispatch Packet

Every AI handoff should contain a compact packet:

```md
LoreRelay task packet

Current version:
Branch/commit:
Task class:
Recommended model:
Recommended reasoning:

Read first:
1. AI_SHARED_LOG.md Current Snapshot
2. CHANGELOG.md latest section
3. Relevant design/gate doc
4. Relevant source files

Goal:

Allowed scope:

Forbidden scope:

Required verification:

Required log updates:
- CHANGELOG.md [Unreleased] if code/docs changed
- AI_SHARED_LOG.md with summary, files, verification, next steps

Report format:
- summary
- files changed
- tests run
- commit hash if committed
- remaining risks
```

## 7. Standard Workflow

### Step 0: Snapshot

Before assigning work, read:

1. `AI_SHARED_LOG.md` Current Snapshot
2. `CHANGELOG.md` latest section
3. `docs/VERSION_TRUTH.md`
4. `git status --short`

If these disagree, source code and `CHANGELOG.md` win over older review docs.

### Step 1: Classify

Pick one task class. If a task mixes UI, persistence, and security, split it.

Example:

- "Mod Manager" becomes:
  - MOD2 local scanner contract;
  - MOD2 implementation;
  - MOD3 read-only UI;
  - MOD3 UI gate.

### Step 2: Gate

Run a gate before implementation when the task touches:

- more than one JSON ledger;
- any write path;
- postMessage or Webview trust boundary;
- prompt injection boundary;
- secrets or external APIs;
- mod loading or user-provided files;
- remote play / LAN / websocket.

### Step 3: Implement

Implementation should be small enough that one AI can verify it. If not, split.

Preferred implementation order:

1. pure core + tests;
2. host wrapper;
3. Webview read-only payload;
4. UI rendering;
5. docs and handoff.

### Step 4: Review

Different AI from implementer reviews the result.

Recommended review pairs:

- Grok implementation -> Codex/ChatGPT gate review
- Claude UI -> Grok tests/smoke + Codex scope check
- Gemini docs -> Codex source-truth check

### Step 5: Commit/Release

Only after:

- `npm run compile`
- `npm test`
- i18n checker if locales touched
- UTF-8 checker if docs touched
- `AI_SHARED_LOG.md` updated
- `CHANGELOG.md` updated for user-visible changes

## 8. Work Board

Use `AI_ROADMAP.md` for long-term phases. Use `AI_SHARED_LOG.md` for short-term state.

For active multi-AI batches, add a short "Command Tower Batch" entry to `AI_SHARED_LOG.md`:

```md
## YYYY-MM-DD JST - Command Tower Batch - <name>

- Objective:
- Current owner:
- Pending owners:
- Gate docs:
- Must not touch:
- Verification:
- Next decision:
```

This prevents the "which AI has the ball?" problem.

## 9. Conflict Rules

When AI outputs disagree:

1. Source code beats review docs.
2. `CHANGELOG.md` beats chat history.
3. `AI_SHARED_LOG.md` Current Snapshot beats old handoff prompts.
4. Gate docs beat implementation suggestions.
5. User instruction beats all project defaults, except destructive operations still need explicit approval.

When two AIs edited the same area:

- do not merge conceptually by memory;
- inspect `git diff`;
- identify owned files;
- keep unrelated changes;
- run focused tests before broad tests.

## 10. Safety Boundaries

The following always require a gate:

- new JSON ledger write;
- changing ledger order;
- cross-ledger partial failure behavior;
- Webview command that can mutate state;
- mod system conflict resolution;
- user file import;
- external API or executable invocation;
- secret storage;
- LAN/remote exposure;
- prompt content that includes untrusted character/lore/mod text.

The following are safe for Claude without a gate if explicitly read-only:

- CSS layout;
- labels and empty states;
- aria/i18n wiring;
- rendering of already-sanitized snapshots;
- map marker declutter that does not change source data.

## 11. AI Prompt Libraries

Keep feature-specific prompts in `docs/*_AI_PROMPTS.md`.

Recommended structure:

```md
# <Feature> AI Prompts

## 0. Shared Header
Read order, source of truth, forbidden scope.

## 1. ChatGPT/Codex Gate
Contract, risks, required decisions.

## 2. Grok Implementation
Exact files, tests, gate result dependency.

## 3. Claude UI/UX
Read-only UI scope, accessibility/i18n constraints.

## 4. Gemini Docs
README, screenshots, user guide, positioning.

## 5. Final Review
Verification matrix and release checklist.
```

## 12. State Orchestrator Boundary

Do not confuse AI Command Tower with runtime State Orchestrator.

AI Command Tower:

- coordinates humans and AIs;
- routes work;
- defines review gates;
- records handoffs.

State Orchestrator:

- runtime code architecture;
- transaction plans;
- ledger writes;
- queues, atomic writes, partial failure.

They should be linked but separate. The Command Tower may create tasks for a future State Orchestrator, but it must not pretend to enforce runtime invariants by documentation alone.

## 13. Immediate Recommendations

1. Create or update feature prompt docs with a shared header and explicit owner order.
2. Add a "Command Tower Batch" log entry whenever more than two AIs are involved.
3. For upcoming systems, use this default route:
   - Codex/ChatGPT: contract and gate;
   - Grok: pure core and tests;
   - Claude: read-only UI/UX;
   - Gemini: docs and positioning;
   - Codex/ChatGPT: final gate.
4. Do not start a new persistence-heavy feature until its write surface is listed in a gate doc.
5. Keep "highest reasoning" for migrations and incidents, not ordinary UI polish.

