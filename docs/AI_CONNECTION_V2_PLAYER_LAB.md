# AI Connection V2: Player Lab and separate QA analysis

> Real-service status as of 2026-09-08 is summarized in [AI Connections](AI_CONNECTIONS.md). Codex/Grok/Antigravity Player and separate QA runs have since completed; Claude/DeepSeek real-service checks are deferred. The evidence requirements and earlier limitations below describe the initial implementation boundary, not a claim that those later runs remain pending.

These are explicit local fixture runs. They do not attach to a normal campaign, reuse a GM conversation, or run a background agent. The existing manual MCP Player Lab remains available.

## Player run

After compilation, invoke `node scripts/run_connected_player_lab.js PROVIDER MODEL --send-fixture-context`.
Providers are `codex`, `claude`, `google`, `grok`, and `deepseek`. The consent flag authorizes sending the fixed fixture's public player view and task to the chosen provider for this invocation. Subscription providers consume their own allowance. DeepSeek uses metered API billing, with at most 4096 output tokens per model request.

The fixed `player_lab_support_v1` catalog, initial public-state digest, shared task digest and budget of ten Commerce operations are identical across providers. Each operation uses at most two fresh model requests: select an action from public observations, then approve its normalized public quote. The runner retains the opaque handle, allocates a fresh request ID, and calls the existing Player delegation and Shared Game Action Service. A stop, refusal, invalid response, busy/stale rejection, partial/unknown result, or disconnect ends the run without automatic retry.

The Commerce world progression used by this catalog is deterministic by world turn; it has no shared world RNG parameter. Reports therefore record `worldRandomness.seed: null` with that provenance instead of inventing a seed. Official transports do not share a model-sampling seed; `modelSamplingSeed` remains null. This is not a claim of deterministic model decisions. Model comparisons still require an evidence audit.

Reports are under `.test-runs/connected-player-lab/<run>/result.json`. They include requested and protocol-reported models, client version or executable fingerprint where available, normalized public operation parameters, classifications, receipt read-back, failure stage, fixture/task hashes and budget. Missing model/version evidence stays null. Model self-introductions are never identity evidence. `complete` remains false pending review of the actual service run and its conditions.

## Authentication and separation

Profiles are fixed beneath `.test-runs/ai-lab-profiles/player/<provider>` and `.test-runs/ai-lab-profiles/qa/<provider>`. They are separate from GM profiles and from each other. Nothing copies credentials or conversations out of another profile. Authenticate these dedicated profiles with the respective official client before running:

| Provider | Official profile environment | Login operation |
| --- | --- | --- |
| Codex | `CODEX_HOME` = dedicated profile | `codex login` |
| Claude | `CLAUDE_CONFIG_DIR` = dedicated profile | `claude auth login --claudeai` |
| Google | `HOME` / Windows `USERPROFILE` = dedicated profile | Official `agy -p /usage` login flow |
| Grok | `GROK_HOME`, `HOME` / Windows `USERPROFILE` = dedicated profile | `grok login --device-auth` |

Use a separate terminal/process for these environment values; do not overwrite the user's normal profile variables. The runner launches native clients without a shell, disables their available tool/MCP/customization paths, and allocates fresh working directories outside the repository for each request. A profile existing on disk or a CLI being installed does not mean authentication or inference succeeded. No automatic provider/model/API fallback is performed.

DeepSeek accepts one JSON object containing `apiKey` through stdin, with EOF, for the explicit local invocation. It never accepts the key in argv, stores it in a report, or imports a normal campaign. Do not put a literal key in shell history. GM gameplay continues to use VS Code SecretStorage; this fixture CLI does not extract that secret. A trusted local launcher may supply stdin from a secret store. No personal authentication is installed in CI.

## QA run

`node scripts/run_connected_qa_lab.js PROVIDER MODEL --send-fixture-context` is a separate entrypoint with a QA-only profile and session. It reuses `runLifecycle` and the existing real Extension Host fixture, checkpoint/restore/reload checks and allowlisted inspection. After reload, it executes one scripted end day through the QA bridge and supplies numeric/boolean before/after metrics to the model. It adds no endpoint, arbitrary selector, shell access, role-switch operation, or alternate simulator.

The local `.test-runs/connected-qa-lab/<run>/result.json` retains synthetic metric paths for reproduction; the article exporter removes them. Metrics are bounded to 500 and depth 20; truncation is explicit. The model may propose up to ten typed findings. Categories separate new-discovery candidates, known-reproduction candidates, decision errors, connection failures and preferences. Every model proposal remains `requires_reproduction_and_triage`, even when its numeric expectation can be evaluated. Neither a model accusation nor an empty finding list proves correctness. This narrow numeric inspector does not claim to assess all narrative, visual or balance issues.

## Article drafts and comparison

`node scripts/export_ai_lab_article.js RESULT_FILE [RESULT_FILE ...]` accepts up to five reports and writes ignored `draft.md` and `comparison.json` artifacts. It projects only known fields, replaces campaign IDs with anonymous fixture references, and excludes raw model responses, game prose, account data, confirmation handles, request IDs and witnesses. It does not publish an article. Keep the full local fixture report for reproduction and manually triage findings before writing claims of discovery.

`node scripts/compare_player_lab.js ...` now accepts five Player reports. Cash flow is not profit and operation count is not a model ranking. Fair Player evidence and internal QA evidence must never be pooled into one Player comparison or supplied to the same model conversation.

## Evidence and limitations

The focused tests exercise all five transport bindings using scripted client responses, public selection/quote approval, three Commerce operations in the production fixture service, cancellation, no retry, safe recording and article projection. `test_connected_qa_lab_host.js` runs only in the existing isolated Windows/Ubuntu live-Host job; it uses a scripted model response while exercising the actual Extension Host lifecycle and extra end day. This proves the Host path, not provider inference.

Real provider authentication and three consecutive GM turns plus interruption in both conversation-only and stateful play remain separate evidence requirements. The reported Codex localhost callback refusal is not resolved by these tests; the absence of a listener when later inspected does not identify why it ended at the moment of login. Human Play remains unperformed and is not replaced by these checks.
