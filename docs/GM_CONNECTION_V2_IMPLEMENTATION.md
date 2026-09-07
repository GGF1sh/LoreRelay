# GM Connection V2 — implementation checkpoint

Status: implementation verification passed; actual GM login/turn verification remains incomplete.
Human Play has not been performed. No end-to-end GM success is claimed.

Codex base: ea4cb92220871668eebd0de80b9b479cdbebf910 (#108 included).
Codex PR #109 HEAD: 6ce09dce4eea22d9f1083094e0ddf280f6bd70d2.
Merge / Claude base: 2635ceef627476b314e968e30863e2c72ec03115.
Current branch: feat/GM-CONNECTION-V2-CLAUDE. Reuses the ai-client-integration-kit-v1 worktree.
Owner-requested implementer: GPT-6 Astra / High; no automatic model downgrade or subagents.

## Scope and order

Human input to a subscription-backed GM comes first. Separate PRs: common GM + Codex,
Claude, Antigravity, Grok ACP, DeepSeek API, then Player/QA playtesting and sanitized blog evidence.
Existing game rules, provider routes and Player/QA authority remain the baseline.

## Implemented locally

- Bounded Codex App Server JSONL transport, subscription-auth preflight, official login URL,
  ephemeral GM thread, explicit model, disabled environment access, draft notifications and cancellation.
- Dedicated client profile; no copying account tokens, global MCP configuration or API keys.
- Windows npm installations resolve the official native codex.exe without executing a shell wrapper.
- Login waits for the correlated official completion notification; a premature manual confirmation
  cannot close the callback listener. Cancellation and a ten-minute timeout end the owned connection.
- AI connection picker adds Codex GM. Campaign dispatch and Parlor/In-World chat use the new client.
- Host-owned campaign/epoch/parent/session/request witness plus game-state, seven mutable ledgers,
  game-rules and World Forge fingerprints. Existing gameplay lease ownership is preserved at commit;
  standalone dispatch acquires the existing gate instead of inventing another lock.
- Host candidate entry into the existing serialized Accepted Turn pipeline after MOD authorization;
  no turn_result file left for a watcher to replay under a later epoch.
- Optional persistence observation on existing Accepted Turn processing reports partial ledger writes.
  Profile updates are deferred until after acceptance. No automatic replay of ambiguous outcomes.

## Evidence so far

- TypeScript compilation passed.
- New gate, JSONL and mocked-client focused tests passed; no actual model is used by them.
- Test Console plan 2026-09-07T16-47-24-819Z selected 35 focused tests. Initial run:
  34/35 focused passed; Player registration test failed because new initialization used a separately
  cached VS Code stub. Initialization moved to extension activation; Player MCP regression then passed.
- Runtime Accepted Turn regression includes direct candidate admission and stale refusal, and partial
  ledger observation; passed after those edits. Prompt receipt and vscode-lm normalization passed.
- Symbol registry regenerated and checked.
- Updated Test Console plan 2026-09-07T17-17-02-499Z passed all 40 focused tests and all
  43 selected commands (compile and boundary checks included). The later cancellation-input
  change passed its focused DOM-handler check and is included in the final suite.
- Final-tree real Windows Extension Host lifecycle regression passed, including commerce,
  complete checkpoint restore, stale epoch, panel reopen, reload and old-handle rejection.
- A readiness-only check using the user's actual dedicated fixture profile under the same
  Windows account returned login_required. No model was called. The browser attempt did not
  result in a currently usable login; an end-to-end login remains required.
- Final executable-tree full suite passed 367/367; Combat passed 736/736 (169.5 seconds).
  Log: ignored .test-runs/gm-v2-final-full-suite.log. No repeated full-suite run was performed.
- Real installed Codex App Server initialize/account-read succeeded in a fresh dedicated profile:
  login_required, modelCalled=false. No game context or credentials printed.
- Existing real Windows Extension Host lifecycle QA passed (commerce, checkpoint, epoch, reopen, reload).
  This is regression evidence, not proof of the new GM path or its rendered controls.
- Bounded Host adversarial fixture passed for ledger/config changes, restored epoch, late output after
  cancellation, post-authorization cancellation, busy, partial persistence, and inherited gameplay lease.
- Actual native-client login-listener probe passed: callbackReachable=true, modelCalled=false,
  browserOpened=false. This proves local listener startup only, not a completed OAuth exchange.
- User reached the real AI Connections / Codex GM model picker. A shell-wrapper launch failure was
  observed and repaired. The subsequent browser Continue redirected to localhost with connection
  refused. Its exact cause is still unproven; do not attribute it to the user's button timing.
  A fresh end-to-end login after the lifetime fix remains pending while the user sleeps.

## Pending before close

- User login in the isolated manual development Host, then actual model GM turns (3 plus stop),
  campaign and conversation-only verification, and actual Webview evidence.
- Codex #109 exact-head CI 34147603840 and Live QA 34147603785 passed. Post-merge CI
  34147885034 and Live QA 34147885066 passed on the merge SHA above. Actual GM service
  success remains unverified; integration does not satisfy that remaining evidence requirement.
- Review runtime limits and provider protocol version compatibility against actual client results.
- Typed partial reporting currently covers core/secondary ledgers and profile writes; assess other
  post-commit side effects before claiming complete persistence coverage.
- Claude implementation and local verification passed. Remaining providers and Player Lab are pending.

## Claude implementation

- Official `claude -p` structured JSON event stream; the final response enters the same GM
  normalization and Accepted Turn path as Codex. Conversation-only modes share the adapter too.
- Dedicated `CLAUDE_CONFIG_DIR` and work directory, Safe Mode, empty settings sources, disabled
  hooks/skills/tools, strict empty MCP configuration, no saved sessions, one maximum model turn.
- No `--bare`: the official documentation says it does not use subscription credentials.
  Authentication status must identify `claude.ai` and the first-party provider. API-key and
  alternate-provider environment variables are not inherited. No fallback model or resume option.
- Official `auth login --claudeai` handles the user's login; no token extraction or credential copying.
- Installed CLI 2.1.178 supports the required flags. Actual adapter readiness in an empty profile
  returned login_required, modelCalled=false. No Anthropic GM context has been transmitted.
- Mocked-process adversarial coverage includes auth/billing rejection, unexpected tools/model/session,
  invalid JSON, conflicting candidates, nonzero exit, quota, timeout and cancellation.

- Final Claude tree: Test Console 36/36 focused tests (39/39 commands), full suite 368/368,
  Combat 736/736 (166.9 seconds). Real Windows lifecycle_v1 QA passed; this is regression
  evidence, not a Claude inference or rendered GM acceptance claim.

Protocol references: [Claude CLI](https://code.claude.com/docs/en/cli-reference),
[programmatic usage](https://code.claude.com/docs/en/headless),
[subscription eligibility](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

## Full objective tracking

| Stage | Implementation | Real-service evidence | Integration |
| --- | --- | --- | --- |
| 1 Common GM + Codex | Integrated; live acceptance evidence pending | Authentication callback unresolved; no inference claimed | #109 merged; both post-merge CI passed |
| 2 Claude | Implemented locally; focused and full suite passed | CLI readiness only; login and inference pending | Pending |
| 3 Antigravity | Pending | Pending | Pending |
| 4 Grok ACP | Pending | Pending | Pending |
| 5 DeepSeek API | Pending | Pending | Pending |
| 6 Player/QA comparison and sanitized blog artifacts | Pending | Pending | Pending |

The user's overnight continuation retains the whole six-stage objective. User-login or external
account availability must be marked unverified and must not be replaced with fabricated inference
evidence. Publication authorization does not authorize copying credentials or bypassing consent.

The ignored .test-runs/gm-v2-manual workspace was seeded only from merchant_route_v1 and launched
with dedicated user-data and extensions directories. It is for interactive login/GM verification,
not the normal campaign. The production connection picker is used; no QA approval bypass is enabled.
