# Gate Report: PROMPT-001A — Candidate → Selected → Delivered → Accepted → Consumed 順序契約

| Field | Value |
|:---|:---|
| **Gate Owner (this run)** | Claude Opus 4.8 — Architecture Gate Owner 代理（ChatGPT 5.5/5.4 不在時の代行） |
| **As-of Commit** | `3eaae2540f1dfc1b8a3e33b4ce261eeefc2a322b` (`origin/main`) |
| **Task Packet As-of** | `4d56b28`（HEADの1つ前・実コード同一につき current として扱った） |
| **Package version** | `1.77.15` |
| **Verdict** | **READY_FOR_ADVERSARIAL_REVIEW** |

---

## 1. Reality Check

**判定: CONFIRMED（Task Packet の仮説より深刻）**

Task Packet の仮説「budget eviction で落とされる前に consumed 扱いされている」は現行main実コードで確認された。ただし実態はそれより一段悪く、**消費（durable marker前進）は eviction の前どころか、prompt文字列 build 時点（Candidate生成時点）で確定している** — Selected / Delivered / Accepted のいずれよりも早い。

### 証拠チェーン

1. `buildGmPromptChunkSpecsWithMeta`（[src/gmPromptBuilder.ts:1347](../../src/gmPromptBuilder.ts)）が候補生成時に `consume*` を直接呼ぶ:
   - L1377: `considerPromptChunk(meta,'chronicle',…, () => consumeChronicleRecapContext(policy))`
   - L1416: `considerPromptChunk(meta,'worldChangeSummary',…, consumeWorldChangeSummaryContext)`
2. `considerPromptChunk`（L1330-1345）は `build()`（=consume）を即時実行してから `specs` に push する。
3. `consume*` は durable marker を前進させる:
   - `consumeChronicleRecapContext` → `markChronicleInjected(sourceTurn)` + `clearChronicleSessionPending()`（L1140-1145）
   - `consumeWorldChangeSummaryContext` → `markWorldChangeSummaryInjected(turn)`（L1094-1097）
   - いずれも `saveWorldState(...)` で **`world_state.json` へディスク書込**（[src/worldState.ts:129,138](../../src/worldState.ts)）
4. その**後**に eviction が走る: `buildGmPromptContext` → `evictPromptChunksByBudget(specs, targetChars)`（L1433）。
5. **rollback / unmark は存在しない。** marker は `>= turn` ガードで単調前進のみ（worldState.ts:128,137）。失敗・棄却・evictionで戻す経路はコード全体に無い。
6. `chronicle`(priority 90) / `worldChangeSummary`(priority 66) は `PROMPT_NEVER_EVICT_CHUNK_IDS`（`gameRules`/`narrativeTime`/`director`のみ、[src/gmPromptBuilderCore.ts:459-463](../../src/gmPromptBuilderCore.ts)）に含まれず **eviction対象**。損失シナリオは実際に到達可能。
7. Provider送信は build の**後**: Grok経路（`gmBridgeRunner.ts:442`）・vscode-lm経路（`gmBridgeRunner.ts:975`）・agentic経路（`agenticGmRunner.ts:89`）いずれも「消費が確定した後に」プロセス起動/`sendRequest`する。

### 追加違反（Q7: Inspector separation）

`buildGmPromptBreakdown`（Inspector/Preview用データ源, L1168-1245）は L1236 で **`buildGmPromptChunkSpecsWithMeta`（=consume系）** を呼んでいる。**Preview/Inspector のデータ生成そのものが消費副作用を持つ** — Inspector/Previewはconsumption markerを進めてはならないという原則(Q7)に違反。

---

## 2. Current Execution Trace（現行main）

```
invokeGrokBridge / invokeVscodeLm / agenticGmRunner
  └─ buildGrokPrompt / buildGmPromptContext           (gmBridgeRunner:442 / :975 / agenticGmRunner:89)
       └─ buildGmPromptChunkSpecsWithMeta
            ├─ considerPromptChunk('chronicle', consumeChronicleRecapContext)
            │     └─ markChronicleInjected + clearChronicleSessionPending  ★DISK WRITE = 消費確定
            └─ considerPromptChunk('worldChangeSummary', consumeWorldChangeSummaryContext)
                  └─ markWorldChangeSummaryInjected                        ★DISK WRITE = 消費確定
       └─ evictPromptChunksByBudget(specs)              ★消費の"後"に脱落判定。string[]のみ返り chunk identity 喪失
  └─ postPromptContextToWebview()
       └─ buildGmPromptBreakdown → buildGmPromptChunkSpecsWithMeta  ★Inspector経路も再度消費呼び出し(冪等だが原則違反)
  └─ beginGmRun(onAcceptedTurn)                         (turnResultFallback.ts:109)
  └─ [PROVIDER 送信]  ← Delivered はここ。消費済みの後。
  └─ finishGmRun(prevState, playerAction, success)      (turnResultFallback.ts:138)
       └─ (success時 250ms後) checkPendingTurnResultFile() → 成功なら onAcceptedTurn()  ★真のAccepted境界（既存）
  └─ [canonical turn commit / turn_result.json 適用]    ← 未確認・本Gate範囲外（SO3側）
```

`beginGmRun(onAcceptedTurn)` / `checkPendingTurnResultFile` という acceptance 境界は**既に存在する**が、consume marker はこれに一切接続されていない。

---

## 3. Broken Invariant（3件に限定）

- **BI-1**: 消費が Candidate build 時点で確定し、Delivered/Accepted と分離されていない（Candidate ≠ Consumed の崩壊）。
- **BI-2**: 消費が eviction より前に走り、脱落chunkが retryable でなくなる。rollback不在のため恒久損失（Selected ≠ Consumed の崩壊）。
- **BI-3**: Inspector/Preview 生成 (`buildGmPromptBreakdown`) が消費副作用を持つ（Preview は消費してはならない、の崩壊。PROMPT-001Bと直結）。

---

## 4. Proposed Gate Contract

| State | 厳密な定義 | Authority Owner | 許可される副作用 |
|:---|:---|:---|:---|
| **Candidate** | 純関数 build の出力。prompt に入り得る全 chunk（`peek`ベース、text+id+priority）。 | `gmPromptBuilder` build層 | **副作用ゼロ**。canonical write / ACK / session pending clear / durable marker前進を全て禁止。 |
| **Selected** | `evictPromptChunksByBudget`を通過し budget内に残った chunk。**chunk identity(id) を保持**すること。 | Budgeter | なし。 |
| **Delivered** | Selected chunk のうち実際に provider request payload へ含まれ送信が発火したもの。 | Provider runner (`gmBridgeRunner` / `agenticGmRunner`) | request送信。まだ消費しない。 |
| **Accepted** | 応答が有効なturnとして受理された状態。HTTP成功/exit 0/stream完了とは別。 | `turnResultFallback` の `checkPendingTurnResultFile` → `onAcceptedTurn` | canonical turn commit。 |
| **Consumed** | `f(Accepted ∧ Delivered)`。Accepted かつ 当該consumableが実際にDeliveredされていた場合のみ marker前進。 | Acceptance path のみ | `markWorldChangeSummaryInjected`/`markChronicleInjected`/`clearChronicleSessionPending` を**ここでのみ**呼ぶ。 |

**中心原則:** 消費 = Candidate build でも eviction でも provider送信でもなく、「実際に配信された消費対象」が「turnがAcceptedになった」ときにだけ確定する。

---

## 5. Failure Matrix

### 現行main（BROKEN）

| Case | Candidate | Selected | Delivered | Accepted | Consumed(現状) | Retryable? |
|:---|:---:|:---:|:---:|:---:|:---:|:---|
| Budget eviction | ✅ | ❌ | ❌ | ❌ | **✅ BUG** | NO(恒久損失) |
| Provider request creation failure | ✅ | ✅ | ❌ | ❌ | **✅ BUG** | NO |
| Provider HTTP/process failure | ✅ | ✅ | △ | ❌ | **✅ BUG** | NO |
| Response parse failure | ✅ | ✅ | ✅ | ❌ | **✅ BUG** | NO |
| TurnResult validation rejection | ✅ | ✅ | ✅ | ❌ | **✅ BUG** | NO |
| Canonical commit failure | ✅ | ✅ | ✅ | △ | **✅ BUG** | NO |
| Successful accepted turn | ✅ | ✅ | ✅ | ✅ | ✅(偶然正) | n/a |

### 目標契約（TARGET）

| Case | Candidate | Selected | Delivered | Accepted | Consumed(契約) | Retryable? | Dup delivery? |
|:---|:---:|:---:|:---:|:---:|:---:|:---|:---|
| Budget eviction | ✅ | ❌ | ❌ | ❌ | ❌ | YES | no |
| Provider request creation failure | ✅ | ✅ | ❌ | ❌ | ❌ | YES | no |
| Provider HTTP/process failure | ✅ | ✅ | ✅ | ❌ | ❌ | YES | 可 |
| Response parse failure | ✅ | ✅ | ✅ | ❌ | ❌ | YES | 可 |
| TurnResult validation rejection | ✅ | ✅ | ✅ | ❌ | ❌ | YES | 可 |
| Canonical commit failure | ✅ | ✅ | ✅ | ❌ | ❌ | YES | 可 |
| Successful accepted turn | ✅ | ✅ | ✅ | ✅ | ✅(Deliveredのみ) | n/a | no |

**Retry semantics**: at-least-once（配信視点）。消費を Accepted まで遅延する結果、provider失敗後の再送で同一 World Change Summary / Chronicle が重複配信され得るがこれは許容する。恒久損失より安全。消費 marker 自体は Accepted時点で単調前進（accepted turnにつき at-most-once）で十分。

---

## 6. Minimal Change Boundary（責務単位・大規模refactor不要）

- **builder responsibility**: `buildGmPromptChunkSpecsWithMeta` / `buildGmPromptContext` / `buildGmPromptBreakdown` を純化。`consume*` 呼び出しを削除し `peek*` に統一。
- **delivery responsibility**: provider runner が eviction後に実際にpayloadへ入ったconsumable chunkのid/tokenを「delivered consumables receipt」として保持し、当該turnのacceptance境界へ引き渡す（**PROMPT-001C** の実体）。
- **acceptance responsibility**: `turnResultFallback` の `onAcceptedTurn` / `checkPendingTurnResultFile` 成功を唯一のトリガにする。
- **consumption responsibility**: Accepted時に receipt にある delivered consumables に対してのみ marker系を呼ぶ。これが marker前進の唯一の呼び出し箇所。

⚠️ **Touch Set 補正の必要性**: Packet記載の Touch Set は `src/gmPromptBuilder.ts` 単独だが、正しい実装には provider runner（receipt生成）と acceptance path（消費トリガ）への配線が必須。単一ファイルには収まらない。

---

## 7. Acceptance Criteria（精密化）

1. Candidate purity: build系関数実行後、`world_state.json` の `lastInjectedWorldChangeSummaryTurn`/`lastInjectedChronicleTurn`および in-memory `chronicleSessionPending` が不変。
2. Budget-evicted は次turnで retryable（marker未前進）。
3. Provider failure（作成/HTTP/parse）はいずれも marker未前進、次turn再配信。
4. Rejected turn は消費しない。
5. Canonical commit failure は消費しない。
6. Preview/Inspector（`postPromptContextToWebview`/`buildGmPromptBreakdown`）は何度呼んでも marker・pending不変。
7. 成功turnは実際にDeliveredされたconsumableのみ消費（evictされていたら前進しない）。
8. marker系関数(`markWorldChangeSummaryInjected`/`markChronicleInjected`/`clearChronicleSessionPending`)の呼び出し元は acceptance path 1箇所のみ。

---

## 8. Required Tests（列挙のみ）

1. candidate purity（build系呼び出しでmarker不変）
2. build×N idempotent
3. evict→retry（budget超過構成でmarker未前進・次turn再候補）
4. provider failure→retry（作成失敗/HTTP失敗/parse失敗の各種別）
5. rejected turn→no consume
6. accepted+delivered→consume
7. accepted+evicted→no consume
8. inspector isolation（`postPromptContextToWebview`経由でmarker不変）
9. chronicle session pending が失敗turn後も維持される（in-memory pendingがAcceptedまでclearされない）
10. marker呼び出し元の単一性（構造テスト/grep）

---

## 9. Dependency Impact

| Task | 判定 | 根拠 |
|:---|:---|:---|
| `PROMPT-001B` | UNBLOCKED AFTER GATE | builder純化(BI-3解消)でWorld Change/Chronicleの消費は無害化。ただし001Bはinspector全般のより広い範囲を担当し残存。 |
| `PROMPT-001C` | UNBLOCKED AFTER GATE（密結合） | 本Gateの「delivered consumables receipt」が001Cの実体。001Aと連続実装が自然。 |
| `PROMPT-001D2` | UNBLOCKED AFTER GATE | `evictPromptChunksByBudget`のidentity喪失問題を共有。Selected契約（identity保持）を先に確定する必要。 |

---

## New Finding Candidates（Inbox転記済み、Backlog未登録）

- `CLAUDE-20260705-001` — `buildGmPromptBreakdown`のInspector消費副作用（PROMPT-001Bと重複可能性、P1）
- `CLAUDE-20260705-002` — `chronicleSessionPending`のin-memory/durable非対称性（本Gate契約に内包、P2）
- `CLAUDE-20260705-003` — 1turnあたりprompt chunkの二重build（PROMPT-001Cと重複可能性、P3）

詳細は `docs/AI_FINDINGS_INBOX.md` 参照。

---

## Gate Verdict: READY_FOR_ADVERSARIAL_REVIEW

既存構造（`applyPromptChunkBudgetRecords`のrecord保持、`beginGmRun`/`onAcceptedTurn`のacceptance境界）を再利用でき、event bus等の過剰設計は不要。

**Adversarial Reviewer (Gemini 3.1 Pro) への申し送り:**
1. Touch Set拡張の是非 — `PROMPT-001A`のまま実装するか、001A(純化)+001C(receipt/acceptance消費)へ分割するか。
2. at-least-once（duplicate delivery許容）の妥当性 — 「重複注入 < 恒久損失」の前提の是非。
3. Delivered の判定点 — 送信途中で失敗したchunkを「delivered」とみなすかどうか。
