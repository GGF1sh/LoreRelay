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
