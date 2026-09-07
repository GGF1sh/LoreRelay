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
| 2 Claude | Integrated | CLI readiness only; login and inference pending | #110 merged; post-merge CI passed |
| 3 Antigravity | Integrated | Native readiness only; login/inference pending | #111 merged; both post-merge CI passed |
| 4 Grok ACP | Integrated | Native readiness only; login/inference pending | #112 merged; both post-merge CI passed |
| 5 DeepSeek API | Implemented; final verification passed | Key/login/inference pending | Pending |
| 6 Player/QA comparison and sanitized blog artifacts | Pending | Pending | Pending |

The user's overnight continuation retains the whole six-stage objective. User-login or external
account availability must be marked unverified and must not be replaced with fabricated inference
evidence. Publication authorization does not authorize copying credentials or bypassing consent.

The ignored .test-runs/gm-v2-manual workspace was seeded only from merchant_route_v1 and launched
with dedicated user-data and extensions directories. It is for interactive login/GM verification,
not the normal campaign. The production connection picker is used; no QA approval bypass is enabled.

## Antigravity implementation

- Native official CLI 1.1.27 was downloaded into ignored .test-runs, verified against the official SHA512 manifest. The installer was inspected but not executed; normal user CLI installation/settings were not changed.
- Native --help uses stderr. The adapter checks the required flags and records the exact executable SHA256 because no version flag is exposed.
- A dedicated home/profile and fixed work directory contain deny rules for file access, URLs, shell, unsandboxed commands and MCP. The custom primary GM agent declares no tools, skills, plugins or MCP; extra AI credits and telemetry are disabled. The native fixture log confirmed the deny rules and zero named hooks.
- One NDJSON user input is sent on stdin to a fresh CLI process. Model/conversation identity, empty advertised tool set, terminal SUCCESS and one turn are required. Nonzero exit, invalid/foreign/conflicting events and cancellation cannot commit.
- Official /usage performs readiness without a model prompt. Native unauthenticated 1.1.27 waited for login instead of immediately exiting; the adapter detects the authentication-required diagnostic and terminates its owned request. The real readiness probe returned login_required, modelCalled=false.
- Explicit connection consent precedes official Google login. The browser callback code is passed only to the official CLI stdin, never saved/logged. Split URLs and cancelled input are covered by the process fixture. Workspace/session revalidation and Accepted Turn remain the existing shared Host path.
- Test Console: 37/37 focused, 40/40 commands. Real Windows lifecycle_v1 regression passed. Final full suite passed 370/370, Combat 736/736 (167.8 seconds); actual Google login, GM inference, three consecutive turns, stop and rendered acceptance remain UNVERIFIED. These fixture checks do not replace Human Play.
- Official references: https://antigravity.google/docs/cli/headless/ ; https://antigravity.google/docs/cli/install/ ; https://antigravity.google/docs/cli/permissions/ ; https://antigravity.google/docs/subagents

Claude #110 integration: final HEAD 7c16deb9b58da504ba196dde2d19cab0e7ac1c94; merge 10c2710e0da38dfd28c5bbe467917597422d5acd. Exact CI 34149273734 / Live QA 34149273772 passed. Post-merge CI 34149549554 / Live QA 34149549545 passed. Real Claude service acceptance remains pending.

## Grok ACP implementation

- Official native `grok agent stdio` uses JSON-RPC 2.0. The adapter initializes with no filesystem or terminal capability, rejects tool requests and uses a fresh session for one human input. Only a matching session's text followed by `end_turn` becomes a candidate. Cancellation, partial completion, foreign sessions and changed models cannot commit.
- Dedicated GROK_HOME, platform home and work directories isolate settings and authentication. API keys and backend overrides are excluded. Tools, subagents, memory, compatibility scanners, web search and automatic updater are disabled; permission rules deny all tools and model retries are zero.
- The connection picker shows transmission consent and requires an explicit model ID. Official `login --device-auth` runs in a dedicated VS Code terminal with strict environment inheritance. A premature readiness check leaves the login terminal alive. Cancellation/workspace invalidation disposes the owned terminal and client. No authentication code is collected by LoreRelay.
- Readiness requires an authenticated session and a matching reported model. When advertised, cached-token authentication is used; API-key authentication is never selected. Initialize success alone is not authentication success.
- Actual installed native 1.0.13 (5e9a58528b76), SHA256 bf43dc75f5478a106eab1e86d422c963e4dbe9666cf14dab363733d27bf1e672, returned login_required through the adapter with modelCalled=false. Real login, model response, three turns, stop and rendered GM acceptance remain UNVERIFIED.
- Bounded adversarial verification covered process isolation, cancellation, timeout, partial response, model changes and shared Host late-candidate rejection. The repair uses ACP's cancelled permission outcome and rejects model-change updates. Focused repair tests passed; final suite evidence is recorded below when complete.
- Test Console selected 37 focused tests / 40 commands and passed before the bounded repair. Grok protocol, process and shared Host tests passed after repair. No Human Play claim.

References: [official Grok ACP](https://docs.x.ai/build/cli/headless-scripting),
[official Grok settings](https://docs.x.ai/build/settings/reference),
[ACP prompt completion and cancellation](https://agentclientprotocol.com/protocol/v1/prompt-turn).

Antigravity #111: final HEAD 2f7359ea008795e75fc3c66de422312dcc9c263f; merge 659ae767fec3685824694ff8114c59e62b088ee1. Exact CI 34150807422 / Live QA 34150807429 and post-merge CI 34151079268 / Live QA 34151079330 passed.

Grok final verification: full suite 372/372, Combat 736/736 (170.0 seconds); real Windows lifecycle_v1 passed. Actual Grok login/inference and rendered GM acceptance remain unverified.

Grok #112: final HEAD fd1c473d71a8d815f0dea5c2bb90505fb6f64dfc; merge b3711e338729b80cbb9114eae8d2853d1c96396e. Exact CI 34152595593 / Live QA 34152595589 and post-merge CI 34152889518 / Live QA 34152889498 passed.

## DeepSeek API implementation

- Reuses the existing OpenRouter bridge's extracted OpenAI-compatible HTTP transport. The existing OpenRouter entrypoint keeps its prompt/result behavior. The DeepSeek entrypoint accepts one stdin request and returns an API envelope; it never opens or writes campaign files. Host prompt construction, normalization, stale witness and Accepted Turn remain shared.
- Explicit metered-API consent, text model and 1–32768 maximum output-token selection precede key entry. Keys use SecretStorage and a dedicated provider key. The model-list endpoint verifies readiness without generating a model response. Saving a key alone is not readiness. Readiness failure or cancellation before saving leaves the existing profile in place.
- The key is sent to the owned Python process through stdin, never command arguments, files or inherited API-key environment. Python runs with explicit UTF-8, no user site and no Python environment overrides. Dedicated working directory, fixed official DeepSeek endpoint, no redirects/proxies, bounded input/output and timeout; no model/tool loop or retries.
- Text-only non-thinking mode is explicit in setup. One successful assistant choice, matching reported model and stop finish reason are required. Length/tool/refusal/malformed responses cannot commit. Valid usage counters remain reportable even when the candidate is rejected. Cancellation while awaiting SecretStorage cannot start a process.
- Status displays input/output usage and a dated USD estimate range using the official 2026-09-08 price snapshot. Peak/off-peak and unknown cache split widen the range; unavailable counters are not reported as zero. This is not a billing guarantee or a free-web-chat route.
- Test Console selected 38/38 focused tests, 41/41 commands. Bounded adversarial verification covered redirects, response bounds, key-read races, partial paid responses, provider/model mismatch, cancellation and Host admission. Repair made the Python encoding explicit and invalidated setup across workspace/session changes; focused repair checks passed.
- No DeepSeek key was supplied and no account/model request was made. Actual API readiness, three consecutive GM turns, stop and rendered acceptance remain UNVERIFIED. Real Host lifecycle regression is separate from provider inference. Human Play remains unperformed.

Official references: [API contract](https://api-docs.deepseek.com/api/create-chat-completion/),
[dated pricing source](https://api-docs.deepseek.com/quick_start/pricing/).

DeepSeek final verification: full suite 375/375, Combat 736/736 (169.5 seconds), real Windows lifecycle_v1 passed. API account and model evidence remains pending.
