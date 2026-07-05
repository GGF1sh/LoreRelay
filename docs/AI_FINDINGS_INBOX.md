# AI Findings Inbox

新規の不具合や改善点（Finding）を発見したAIエージェントは、`AI_REVIEW_BACKLOG.md` を直接編集**せず**、こちらのInboxに追記してください。
ここで報告された内容を Chief Integrator が審査し、正式なバックログIDを発行します。

## 📥 新規報告フォーマット
報告の際は、以下のフォーマットで表に追記してください。
- **Candidate ID**: `[AI名]-YYYYMMDD-00X` 形式としてください。AI自身が正式なID（例: `PROMPT-002`）を発行してはいけません。

| Candidate ID | Reporter | As-of Commit | Evidence (ファイル/行/理由) | Suggested Severity | Duplicate Of | Decision |
|:---|:---|:---|:---|:---|:---|:---|
| `GEMINI-20260705-001` | 例: Gemini 3.5 Flash | `4d56b28` | `src/example.ts` L42: ... | P1 | - | (判定待ち) |

---

## 報告一覧 (Reported Findings)

| Candidate ID | Reporter | As-of Commit | Evidence (ファイル/行/理由) | Suggested Severity | Duplicate Of | Decision |
|:---|:---|:---|:---|:---|:---|:---|
| `CLAUDE-20260705-001` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts` L1236: `buildGmPromptBreakdown`（Inspector/Previewデータ源）が消費系 `buildGmPromptChunkSpecsWithMeta` を呼び、World Change Summary/Chronicleのdurable markerを前進させる。Preview/Inspectorは消費してはならない原則に違反。 | P1 | `PROMPT-001B`(強く関連) | (判定待ち) |
| `CLAUDE-20260705-002` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts` L1100-1112: `chronicleSessionPending`はモジュールレベル`let`（in-memory）で、durable marker群と消費タイミング/永続性が非対称。build時clearのため単一失敗で当該セッション中chronicle recapが恒久欠落しうる。 | P2 | `PROMPT-001A`(本Gate契約に内包済み) | (判定待ち) |
| `CLAUDE-20260705-003` | Claude Opus 4.8 | `3eaae25` | `src/gmPromptBuilder.ts`: 1 GM turnあたり全prompt chunkが`buildGmPromptContext`+`buildGmPromptBreakdown`で二重build。純化後も冗長。 | P3 | `PROMPT-001C` | (判定待ち) |
