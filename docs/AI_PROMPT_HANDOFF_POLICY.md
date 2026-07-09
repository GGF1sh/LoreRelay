# AI Prompt Handoff Policy

Date: 2026-07-07 JST
Owner preference: Keisuke

## Core rule

Detailed reasoning, numbered audit points, attack matrices, known findings, and acceptance criteria belong in GitHub documents.

Chat messages and paste-ready prompts should stay compact.

## Chat / prompt format

Normally include only:

- AI
- Model
- Reasoning
- Role
- Repository / branch / commit when needed
- Exact documents or files to read
- One concise task instruction
- Output document path
- Final verdict format

Do not omit `Model` or `Reasoning` when handing work to another AI.

Current Claude default for LoreRelay UX / gameplay design work:

- AI: Claude
- Model: Claude Sonnet
- Reasoning: High

Use a different Claude model or reasoning level only when the task explicitly justifies it.

Do not paste long numbered sections such as `1` through `10+` into chat when those details are already recorded in GitHub.

When a detailed audit or integrator review has already been written to GitHub, do not re-summarize all findings in chat. Chat should normally contain only:

- verdict / current status;
- what durable artifact was written or verified;
- the next AI / model / reasoning;
- one compact paste-ready prompt when needed.

Instead use instructions like:

> Read the listed task/review documents as source of truth. Verify or implement only the remaining recorded blockers. Do not broaden scope.

## Exploration budget

For every narrow repair, verify, UX gate, or implementation gate, also follow:

- `docs/AI_EXPLORATION_BUDGET_POLICY.md`

Prompts should explicitly state the exploration tier and forbid open-ended subagents unless the task is intentionally repo-wide.

## Conditional knowledge lookup

Do not make every AI read the entire generated Symbol Registry for every task. Use the lookup workflow only when the task touches shared names, protocols, configuration, or semantic vocabulary.

Before adding a shared helper, exported type, public webview function, or reusable constant:

```powershell
npm run knowledge -- <proposed name>
```

Before adding or changing a host-webview message:

```powershell
npm run knowledge -- <message type>
```

Before adding a `textAdventure.*` configuration key:

```powershell
npm run knowledge -- <proposed config key>
```

Before adding entity kinds, clock vocabulary, or cross-ledger reference terms, read the relevant section of `docs/TERMINOLOGY_CONTRACT.md` and identify whether the change belongs to D1 Identity Core, World Intent, or broader campaign/domain vocabulary.

Before adding severity/event semantic reactions, read `docs/EVENT_CLASSIFICATION_GLOSSARY.md` and look for existing `evaluate*Event` helpers. Do not infer semantic meaning from `severity` alone.

## When long prompts are acceptable

Only use a long inline prompt when:

- the target AI cannot access the GitHub documents;
- critical details are not yet recorded anywhere durable;
- the user explicitly asks for the full detailed prompt.

## External / browser AI reviews

When the target AI cannot access the user's local filesystem, follow:

- `docs/AI_EXTERNAL_REVIEW_PACKET_POLICY.md`
- `docs/ai-review-packets/README.md`

Package local-only audits, designs, and prior reviews into an exact GitHub review packet before the next cross-AI handoff whenever practical.

Use an exact code commit and exact packet ref. Do not give browser-only AIs local paths or ask them to infer the task from current HEAD.

## LoreRelay default

GitHub is the source of truth for task detail.
Chat is for compact orchestration.
