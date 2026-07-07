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

Instead use instructions like:

> Read the listed task/review documents as source of truth. Verify or implement only the remaining recorded blockers. Do not broaden scope.

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
