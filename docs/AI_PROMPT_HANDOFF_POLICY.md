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

Do not paste long numbered sections such as `1` through `10+` into chat when those details are already recorded in GitHub.

Instead use instructions like:

> Read the listed task/review documents as source of truth. Verify or implement only the remaining recorded blockers. Do not broaden scope.

## When long prompts are acceptable

Only use a long inline prompt when:

- the target AI cannot access the GitHub documents;
- critical details are not yet recorded anywhere durable;
- the user explicitly asks for the full detailed prompt.

## LoreRelay default

GitHub is the source of truth for task detail.
Chat is for compact orchestration.
