# AI Findings Inbox

新規の不具合や改善点（Finding）を発見したAIエージェントは、`AI_REVIEW_BACKLOG.md` を直接編集**せず**、こちらのInboxに追記してください。
ここで報告された内容を Chief Integrator が審査し、正式なバックログIDを発行します。

## 📥 新規報告フォーマット
報告の際は、以下のフォーマットで表に追記してください。
- **Candidate ID**: `[AI名]-YYYYMMDD-00X` 形式としてください。AI自身が正式なID（例: `PROMPT-002`）を発行してはいけません。

| Candidate ID | Reporter | As-of Commit | Evidence (ファイル/行/理由) | Suggested Severity | Duplicate Of | Decision |
|:---|:---|:---|:---|:---|:---|:---|
| `AI-YYYYMMDD-00X` | 例: AI / model | `abcdef0` | `src/example.ts` L42: ... | P1 | - | (判定待ち) |

---

## 報告一覧 (Reported Findings)

| Candidate ID | Reporter | As-of Commit | Evidence (ファイル/行/理由) | Suggested Severity | Duplicate Of | Decision |
|:---|:---|:---|:---|:---|:---|:---|
| `CLAUDE-20260705-001` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts` L1236: `buildGmPromptBreakdown`（Inspector/Previewデータ源）が消費系 `buildGmPromptChunkSpecsWithMeta` を呼び、World Change Summary/Chronicleのdurable markerを前進させる。Preview/Inspectorは消費してはならない原則に違反。 | P1 | `PROMPT-001B`(強く関連) | **ABSORB → PROMPT-001A** |
| `CLAUDE-20260705-002` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts` L1100-1112: `chronicleSessionPending`はモジュールレベル`let`（in-memory）で、durable marker群と消費タイミング/永続性が非対称。build時clearのため単一失敗で当該セッション中chronicle recapが恒久欠落しうる。 | P2 | `PROMPT-001A`(本Gate契約に内包済み) | **ABSORB → PROMPT-001C** |
| `CLAUDE-20260705-003` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts`: 1 GM turnあたり全prompt chunkが`buildGmPromptContext`+`buildGmPromptBreakdown`で二重build。純化後も冗長。 | P3 | `PROMPT-001C` | **ABSORB → PROMPT-001C** |
| `GEMINI-20260705-001` | Gemini 3.1 Pro | `6af4bc5` | `gameStateSync.ts`: `lastProcessedTurnHash`更新と`markTurnResultHandled()`が`processTurnResult()`より前。Canonical applyが`false`でもhandled/dedupe済みとなり、`processTurnResultFileAt()`が成功扱いし得る。 | P0 | - | **PROMOTED → RUNTIME-002A**（Chief判定: Severity P1 / Priority Critical） |
| `GEMINI-20260705-002` | Gemini 3.1 Pro | `6af4bc5` | Delayed consumptionでchunk IDのみをreceiptにすると、provider実行中にstateが進んだ際に未配信情報までACKする危険。delivery-time immutable source tokenが必要。 | P1 | - | **ABSORB → PROMPT-001C** |
| `CODEX-20260706-001` | Codex GPT-5.4 | `7070912` | Windows環境で`core.autocrlf=true`のとき、`npm run compile`が再生成するtracked outputs `webview/script.js` / `webview/style.css` / `webview/vendor/mermaid.min.js` が`git status`上modifiedになる一方、plain diff・`--ignore-cr-at-eol`・binary diffはいずれもpatchなし/exit 0。post-merge smokeやAI作業のcleanliness gateを偽陽性で止める。EOL policy / generated-file hygiene未固定。 | P3 | - | **KEEP CANDIDATE — separate from PROMPT-001A** |
| `CHATGPT-20260706-001` | ChatGPT GPT-5.5 Thinking | `3b09c70` | `lastProcessedTurnHash`はin-memoryのみで、startup sweepは既存`turn_result.json`を再処理する。成功済みfileを残したままextension hostがrestartすると、durable dedupeが無いためAccepted TurnResultを再適用し得る。 | P1 | `GEMINI-20260706-002A-1` | **PROMOTED → RUNTIME-003A**（Durable Accepted Turn Identity / Restart Replay Guard） |
| `CHATGPT-20260706-002` | ChatGPT GPT-5.5 Thinking | `3b09c70` | `processTurnResult()`はfresh revision検出前に`persistWorldSimulationSteps()`を実行し、fresh revision進行時の`applyTurnResultToGameState(turnResult, freshDisk, false)`でも`elapsedWorldTurns`を再処理するため、optimistic reapply pathで同一TurnResultのworld simulationが二重進行し得る。 | P1 | - | **KEEP CANDIDATE — needs dedicated runtime/temporal triage** |
| `GEMINI-20260706-002A-1` | Gemini 3.1 Pro | `7d8833d` | canonical commit成功後にprocessがdedupe前で落ち、restart後に同一fileが再観測されるcross-restart crash windowを指摘。特定のstale-revision→lost-callback機構は未確定だが、根本のdurable dedupe欠如は実在。 | P1 | `CHATGPT-20260706-001` | **DUPLICATE / ABSORB → RUNTIME-003A** |
| `CHATGPT-20260707-001` | ChatGPT GPT-5.5 Thinking | `b4ad9d6` | User-observed Antigravity execution flow: Antigravity is the actual GM executor, but LoreRelay still renders an in-app `GM processing` wait state, option buttons, free-text input, and Send affordances that do not reach Antigravity. Screenshot shows the external agent has already produced output / edited `turn_result.json` while LoreRelay still shows a long-running processing bubble. This is a split-brain UX and false-affordance problem, not cosmetic noise. | P1 | - | **PROMOTED → ANTIGRAVITY-RELAY-001** |
| `CHATGPT-20260708-001` | ChatGPT GPT-5.5 Thinking | `ee6fa55` | Shared naming/reference maintenance is incomplete: `docs/TERMINOLOGY_CONTRACT.md` and `docs/EVENT_CLASSIFICATION_GLOSSARY.md` exist, but no maintained function/variable/symbol registry was ever established despite prior discussion. `scripts/check_terminology_contract.js` scans TypeScript only and a narrow rule set, so Webview JS symbols and new workflow terms are not covered. Board also points `TERM-001` at non-existent `terminologyContract.ts`, while current contracts are Markdown + checker script. | P2 | `TERM-001` (related, not exact duplicate) | **KEEP CANDIDATE — needs terminology/symbol-registry reconciliation** |
