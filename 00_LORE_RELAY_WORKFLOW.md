# LoreRelay Workflow Entry Point

This root file is the stable first stop for LoreRelay repository work. It intentionally stays short; do not copy the detailed workflow rules here.

## Before planning, reviewing, delegating, or implementing

1. Get the current JST and fetch `origin/main`.
2. Read [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md).
3. Before assigning an AI/model, read [`docs/AI_MODEL_ASSIGNMENT_POLICY.md`](docs/AI_MODEL_ASSIGNMENT_POLICY.md).
4. Read [`docs/DEVELOPMENT_VERIFICATION_POLICY.md`](docs/DEVELOPMENT_VERIFICATION_POLICY.md) before planning verification.
5. Read [`docs/AI_INTEGRATOR_CHAT_HANDOFF.md`](docs/AI_INTEGRATOR_CHAT_HANDOFF.md) when current integration or orchestration state is needed.
6. Verify the actual repository, branch, exact HEAD, open pull requests, CI, and merge state.
7. Treat current GitHub `main` as authoritative over old chats, pasted AI reports, remembered SHAs, or stale handoffs.
8. Verify a claimed implementation through its exact commit, diff, and relevant evidence before accepting it.

## Operating guardrails

- Keep one implementation lane by default and obey the verification tier.
- Do not broaden a narrow task or repeat already valid evidence without a concrete new risk.
- Do not modify protected dirty checkouts or unrelated worktrees.
- **Merge authorization (aligned with Standard close):** For eligible narrow work, a task that requests implementation already authorizes the [Standard close](docs/AI_WORKFLOW.md#standard-close): commit, push, open the PR, and—when the verification policy permits—merge, mark ready, and resolve non-blocking review threads in the same task. No separate “please merge” line is required. Do **not** merge when the change is not eligible (for example High-risk work still blocked, `REQUEST_CHANGES`, merge conflicts, required CI failure, or a dangerous HEAD move), or when the user/task explicitly forbids merge.
- **Destructive git actions still need explicit user authorization:** force-push, hard reset, deleting or pruning worktrees, and rewriting shared history—unless the user has clearly authorized that action for this task.
- Long-term product direction may be informed by the Google Drive command memo, but GitHub code, tests, and accepted repository contracts remain the technical source of truth.

When this file conflicts with the canonical documents above or current `main`, the canonical documents and current `main` win.
