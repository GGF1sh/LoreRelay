# LoreRelay AI Workflow

> Canonical entrypoint for an AI task. Git documents are the source of truth; do not copy their long rules into chat.

## Start here

1. Fetch `origin/main`, use its current tip as the base, and confirm any required ancestor.
2. Read this file, then [development verification policy](DEVELOPMENT_VERIFICATION_POLICY.md).
3. Read only the task-specific documents named by the task or current state below. Do not bulk-read `docs/ai-tasks`.

## Route the task

| Need | Source of truth / action |
| --- | --- |
| Risk tier and verification scope | [Development Verification Policy](DEVELOPMENT_VERIFICATION_POLICY.md) |
| Exploration limit | [AI Exploration Budget Policy](AI_EXPLORATION_BUDGET_POLICY.md) |
| Compact handoff | [AI Prompt Handoff Policy](AI_PROMPT_HANDOFF_POLICY.md) |
| Current integration state | [AI Integrator Chat Handoff](AI_INTEGRATOR_CHAT_HANDOFF.md), reconciled with current `main` |
| Active backlog and new findings | [AI Review Backlog](AI_REVIEW_BACKLOG.md) and [AI Findings Inbox](AI_FINDINGS_INBOX.md) |
| Task history and archive rules | [AI task index](ai-tasks/README.md) |

## Before changing shared vocabulary or protocol

Run `npm run knowledge -- <query>` only when the change touches a shared helper, exported type, public webview function, reusable constant, host-to-webview or webview-to-host message, or `textAdventure.*` configuration key. It searches the Symbol Registry and curated vocabulary together.

For entity, clock, or cross-ledger terms, read [Terminology Contract](TERMINOLOGY_CONTRACT.md). For semantic event behavior, read [Event Classification Glossary](EVENT_CLASSIFICATION_GLOSSARY.md). A lookup is targeted navigation, not a requirement to read the generated registry for every task.

## Test Console first

Before manually enumerating many tests, generate a plan from the real base and head:

```powershell
npm run test:plan -- --base origin/main --head HEAD --mode verify
```

Inspect the selected tests and reasons. Add focused coverage only when the plan misses a changed behavior. Run a saved plan with `npm run test:run -- --plan <plan.json>`. See [Test Console guide](TEST_CONSOLE.md) for the dashboard and CLI entrypoints. `LoreRelay_Test_Console.bat` and `npm run test:console` open the same local dashboard; `npm run test:console:self` checks the Console itself.

The Console proposes evidence; the risk tier decides whether a full suite is required. Do not rerun a Human Play Gate or existing same-tree evidence without a concrete new risk. Documentation-only work needs link/path and UTF-8 validation plus relevant tool self-checks, not compile or a full suite.

## Keep the operation small

- Medium and lower risk work normally uses one AI; High risk normally uses no more than two.
- Do not automatically split implementation, verification, and integration into separate chats.
- Keep PR creation, minor thread replies, resolution, and merge in one task when the policy permits.
- `COMMENTED`, P2/P3 findings, and known baselines are non-blocking. Block only on `REQUEST_CHANGES`, merge conflicts, required CI failure, or a dangerous HEAD move.
- Stop and reassess when verification exceeds implementation or repeats evidence without adding information.

## Standard close

Commit, push, create the PR, and merge eligible narrow work in the same task. The final handoff reports only the current JST, exact base/final SHA, risk tier, checks, remaining issue, and verdict.
