# LoreRelay AI Model Assignment Policy

> Status: Canonical model-routing policy
> Owner preference: Keisuke
> Updated: 2026-07-30 JST

## Authority

This file is the source of truth for model assignment in new LoreRelay handoffs.

When an older chat, archived task, PR comment, Google Drive note, or historical section of `docs/AI_INTEGRATOR_CHAT_HANDOFF.md` names a retired model, this policy wins. Historical evidence does not need to be rewritten, but retired models must not be proposed for new work.

## Retired from new assignments

Do not select or recommend any GPT / ChatGPT / Codex **5.5** model for new LoreRelay work.

Reasoning:

- GPT-5.6 Sol and 5.5 consume the same user cost tier, so choose 5.6 Sol when spending that tier.
- GPT-5.6 Terra is approximately the appropriate replacement for work that previously used 5.5-level capability.
- Keeping 5.5 in the option list adds routing ambiguity without a useful cost/performance role.

This includes handoff prose: do not write `Codex 5.5`, `ChatGPT 5.5`, or another 5.5 variant as the next model.

## Default routing

| Role | AI / Model | Reasoning | Use |
| --- | --- | --- | --- |
| Chief Integrator | ChatGPT 5.6 Thinking | High | architecture, orchestration, repo-wide verification |
| Critical runtime implementation / repair | Codex 5.6 Sol | Very High | difficult correctness-critical code and high-risk state transitions |
| Large normal implementation | Codex 5.6 Terra | High | substantial implementation where Sol is unnecessary |
| Normal design / organization | ChatGPT 5.4 or a current bounded-design model | appropriate | bounded design work |
| Normal implementation / repair | Codex 5.4 or a current bounded-code model | appropriate | bounded code work |
| Small mechanical repair / tests | Codex 5.4 mini or a current small-code model | appropriate | small touch set |
| Narrow race / state machine audit | o3 | narrow | crash windows / concurrency only |
| Independent adversarial architecture | Gemini Pro | High | design attack / second architecture review |
| Broad same-pattern audit | Gemini Flash | appropriate | bulk audit |
| UX / onboarding / product flow | Claude Sonnet | High | UX and product-flow lane |
| Gameplay exploit / boredom breaker | Grok | adversarial | dominant strategy / repetitive loop attacks |
| Repo engineer in local IDE | Antigravity / Gemini | High | direct local implementation when suitable |

## Routing rule

1. Use **5.6 Sol** when the task genuinely needs the highest OpenAI implementation tier.
2. Use **5.6 Terra** for substantial work that does not justify Sol.
3. Use smaller/current bounded models for mechanical or narrow work.
4. Never fall back to 5.5 merely because an old handoff or task packet names it.
5. Always include the exact current model and reasoning level in a handoff.

## Historical references

Existing merged PRs, review comments, task reports, and old handoff snapshots may retain 5.5 names as historical evidence. Do not edit those solely to erase the name. The prohibition applies to new routing decisions and new handoff wording.
