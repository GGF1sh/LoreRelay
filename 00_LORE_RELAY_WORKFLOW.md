# LoreRelay Workflow Entry Point

This root file is the stable first stop for LoreRelay repository work. It intentionally stays short; do not copy the detailed workflow rules here.

## Before planning, reviewing, delegating, or implementing

1. Get the current JST and fetch `origin/main`.
2. Read [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md).
3. Read [`docs/DEVELOPMENT_VERIFICATION_POLICY.md`](docs/DEVELOPMENT_VERIFICATION_POLICY.md) before planning verification.
4. Read [`docs/AI_INTEGRATOR_CHAT_HANDOFF.md`](docs/AI_INTEGRATOR_CHAT_HANDOFF.md) when current integration or orchestration state is needed.
5. Verify the actual repository, branch, exact HEAD, open pull requests, CI, and merge state.
6. Treat current GitHub `main` as authoritative over old chats, pasted AI reports, remembered SHAs, or stale handoffs.
7. Verify a claimed implementation through its exact commit, diff, and relevant evidence before accepting it.

## Operating guardrails

- Keep one implementation lane by default and obey the verification tier.
- Do not broaden a narrow task or repeat already valid evidence without a concrete new risk.
- Do not modify protected dirty checkouts or unrelated worktrees.
- Do not merge, mark ready, resolve review threads, force-push, reset, or delete worktrees unless the user has explicitly authorized that action.
- Long-term product direction may be informed by the Google Drive command memo, but GitHub code, tests, and accepted repository contracts remain the technical source of truth.

When this file conflicts with the canonical documents above or current `main`, the canonical documents and current `main` win.
