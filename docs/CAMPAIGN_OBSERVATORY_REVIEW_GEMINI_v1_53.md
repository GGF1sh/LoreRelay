# Campaign Kit / World Observatory — 統合コードレビュー（Gemini + ChatGPT v1.53.0 → v1.54.0）

> **日付:** 2026-07-03  
> **対象:** `lorerelay` **v1.53.0** レビュー → **v1.54.0** で P1×3 反映  
> **レビュアー:** Gemini（ファイルツリー中心）+ ChatGPT（v1.53.0 実装レビュー）+ Grok 旧レビュー（v1.37.x / v1.44.2）  
> **トリアージ:** Grok（ソース実読）  
> **テスト:** `npm test` **134/134**（v1.54.0、`check_version_consistency.js` 含む）

## 総合判定

| 判定 | 内容 |
|------|------|
| **Ship** | v1.54.0 で ChatGPT P1×3（複数台帳整合性）を反映。**Gemini P0×2 は過大評価**のまま却下。残タスクは Observatory `world_state` LWW（P1）と P2 横断インフラ。 |
| **Gemini P0（原文）** | **0 件採用** — いずれも実装確認で P1 以下へ降格 |
| **ChatGPT P1（v1.53.0）** | **3 件すべて実在** — v1.54.0 で修正済み（下記 §ChatGPT Findings） |
| **Grok 旧レビュー** | v1.44.2 / 118 tests の記述は **陳腐化**。Domain/Guild authoritative merge は **v1.39.9+ で既に対応済み**。 |

---

## Executive Summary（修正版）

機能は Guild / Domain に加え **Campaign Kit**（discovery / job board / sell_discovery / campaign resources）と **World Observatory**（市場スパークライン・年代記・観測者 tick）へ水平拡張したが、Gemini が想定した「自律 Tick の乱立」と「プロンプト無制限追記」という構図とは **実装が一致しない**。

- **状態更新:** 多くの Campaign 系は **GM ターン commit 時**（`statePatch` → `discoveryTurnOps`）か **UI の単発同期書き込み**（`campaignJobAccept` → `world_state.questHooks`）。`worldKitTickCore.ts` は **バックグラウンドワーカーではなく** `runOneWorldStep` 内の同期 LW 1 ステップ。
- **Observatory tick:** `watch` は **`world_state.json` のみ**、`advance` の `game_state` 食料消費は **`readStateRevision` + `scheduleCommercePersist`**（Commerce UI 直接取引と同経路）。
- **プロンプト:** `evictPromptChunksByBudget` + `PROMPT_CHUNK_PRIORITIES` があり、Campaign 系 chunk は **prio 92–94**（Domain 67 / Guild 66 より高い）。`test_prompt_budget_eviction.js` で検証済み。

**最大リスク（v1.54.0 後）**

1. ~~**P1:** `world_state.json` questHooks LWW（観測者 tick × accept job）~~ — **FIXED v1.55.0**
2. ~~**P2:** Observatory watch 副作用境界~~ — **FIXED v1.56.0**（`OBSERVER_TICK_CONTRACT` + UI + compute/persist 分離）
3. ~~**P2:** 独立台帳 write queue~~ — **FIXED v1.57.0**（`runSerializedDiscoveryMutation` / `runSerializedCampaignResourcesMutation`）
4. ~~**P2:** プロンプト inactive chunk 省略~~ — **FIXED v1.58.0**（`shouldIncludePromptChunk`）

**v1.54.0 で解消（ChatGPT P1×3）**

| ID | 問題 | 修正 |
|----|------|------|
| C-P1a | `campaign_resources.json` 未作成時、プロンプト default 10 vs ops 空台帳 | `campaignResourceTurnOps.ts` で `defaultCampaignResourceQuantities` seed |
| C-P1b | `sell_discovery` が台帳未検証で credits 加算 | `validateSellDiscoveryTrade()` + `livingWorldTurnOps` ledger 配線 |
| C-P1c | `commitGameState()` void → skip/quarantine 後も ledger 更新 | `CommitGameStateResult` + `statePatch` で `commit.ok` ゲート |

---

## ChatGPT Findings（v1.53.0 実読 — v1.54.0 反映状況）

### C-P1a: campaign_resources 初期値ズレ — **FIXED v1.54.0**

- `resolveCampaignResourcesForPrompt()` は未作成時 `defaultCampaignResourceQuantities(kit)`（各10）を表示。
- 旧 `applyCampaignResourceTurnOps()` は `loadCampaignResources()` が undefined のまま `applyCampaignResourceOps` へ → `quantities[id] ?? 0` で **0→0**。
- テスト: `test_campaign_resources_core.js` default-seed ケース。

### C-P1b: sell_discovery 台帳非連動 — **FIXED v1.54.0**

- 旧 `commerceCore.applyTradeOp` は `credits += value` のみ。`discoveryOps` は別フェーズで best-effort。
- 新: `identified`/`appraised` のみ売却可、sold/consumed/未知 ID 拒否、推定額 ±50%（`estValue` × condition multiplier 基準）。
- テスト: `test_sell_discovery_trade_ops.js`。

### C-P1c: commitGameState 成功不明 — **FIXED v1.54.0**

- 旧 `statePatch.ts` L751–757: `commitGameState()` 後 **無条件** `applyDiscoveryTurnOps` / `applyCampaignResourceTurnOps`。
- CHANGELOG v1.45.3 の「commit 成功後のみ」意図と **コードが不一致**だった（Gemini ドキュメントの「安全」記述も誤り）。
- 新: `commitGameState()` → `CommitGameStateResult`；`!commit.ok` なら ledger 書き込みスキップ + turn 失敗。
- テスト: `test_turn_artifact_commit_atomicity.js`（`resolveGameStatePersistPlan` ゲート契約）。

### C-P2: Observatory watch 副作用 — **FIXED v1.56.0**

- `computeOneWorldStep` / `persistWorldStepOutcome` に分離。`OBSERVER_TICK_CONTRACT` + UI 注記 + `WORLD_OBSERVATORY_WIRING_BRIEF.md` 契約表。

### C-P2: campaign_resources / discoveries write queue — **FIXED v1.57.0**

- `runSerializedDiscoveryMutation` / `runSerializedCampaignResourcesMutation` + キュー内 disk 再読込。

### C-P3: package.json description — **FIXED v1.54.0**

- 「AI GM UI」→ campaign engine / world sim / guild-domain 統合の短い説明へ更新。

---

## Findings トリアージ

### Gemini P0-1: 独立 Tick/Ops 乱立によるバックグラウンド競合

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | Observatory / Campaign が各自 Tick し、ロックなしで Global State を破壊。クエスト受諾が Tick で消える。 |
| **実装確認** | **過大評価（P0 不採用）** |
| **根拠** | ① `worldObservatoryTick.ts` — `watch` は `game_state` 非接触。② `campaignJobAccept.ts` — `world_state.questHooks` のみ更新。③ `discoveryTurnOps.ts` / `campaignResourceTurnOps.ts` — `statePatch` 成功後の **ターン commit** のみ。④ `worldKitTickCore.ts` — 名前は Tick だが **emergentSimulator 内の同期関数**（独立スケジューラではない）。⑤ `game_state` 側は `workspaceStateQueueCore` の **revision 付き merge**（Domain/Guild authoritative keys 済）。 |
| **残るリスク** | **P1（限定）:** 観測者 **auto tick** と **Accept job** が同時に `world_state.json` を `saveWorldState` すると、読み取り→マージなしの **全体上書き**で `questHooks` が落ちうる。 |
| **重大度（修正）** | **P1**（Observatory ON + Campaign accept 併用時） |
| **修正案** | `world_state` にも `stateRevision` + merge、または accept 時に最新 `world_state` を再読込してから `questHooks` だけ patch。短期は Observatory auto と accept の **直列化**でも可。 |
| **テスト** | `test_world_state_quest_accept_observer_race.js`（モック FS で並行 save） |
| **確信度** | Gemini High → **当社: Medium（world_state 限定）** |

---

### Gemini P0-2: Prompt Context 完全枯渇

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | Campaign / Discovery / Observatory が単純追記され、JSON 指示が忘却・クラッシュ確定。`PromptBudgetManager` 新設必須。 |
| **実装確認** | **誤検知に近い（P0 不採用）** — 対策は **既に存在** |
| **根拠** | `gmPromptBuilderCore.ts`: `evictPromptChunksByBudget`, `PROMPT_CHUNK_PRIORITIES`（`campaignKit:94`, `discoveryLedger:93`, `campaignJobBoard:92` > `domain:67`, `guild:66`）。`gmPromptBuilder.ts` で chunk ごと `limitChars`。`test_prompt_budget_eviction.js` / `test_prompt_context_budget.js` あり。 |
| **残るリスク** | **P2:** 全フラグ ON + 長セッションで **低優先 chunk の eviction が増える**（運用チューニング）。Observatory は **GM プロンプトに巨大ブロックを追加していない**（主に Webview / `world_state` 履歴）。 |
| **重大度（修正）** | **P2** |
| **修正案** | 新規中央 Manager より、**シナリオ別の inactive chunk スキップ**（例: Observatory OFF 時は chronicle 要約のみ）を `gmPromptBuilder.ts` で段階追加。 |
| **確信度** | Gemini High → **当社: Low–Medium（監視継続）** |

---

### Gemini P1: Webview イベント多重登録・メモリリーク

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | `88-world-observatory.js` 等で再描画のたびにリスナー蓄積。 |
| **実装確認** | **88 は一度だけ `ensureContainer` で bind**（`autoTimer` は `stopAutoObserve` で clear）。**85-world Campaign** は `renderWorldView` で DOM 差し替え＋新規 `addEventListener` — 旧ノードは破棄され **window リスナーは増えない**。 |
| **残るリスク** | **P3:** `renderWorldView` 頻度が極端に高い場合の GC 負荷。mount/unmount 統一は **将来のリファクタ候補**であって現状 P1 ではない。 |
| **重大度（修正）** | **P3** |
| **確信度** | Gemini Medium → **当社: Low** |

---

### Grok 旧 P1: Guild/Domain commit + drift タイミング

| 項目 | 判定 |
|------|------|
| **Grok 主張**（v1.44.2） | commit と travel/drift/mission の race |
| **現状** | `DOMAIN_TURN_AUTHORITATIVE_ROOT_KEYS` / `GUILD_TURN_AUTHORITATIVE_ROOT_KEYS` が `workspaceStateQueueCore.ts` に **既存**（Domain レビュー PR-A 相当は反映済み）。 |
| **重大度（修正）** | **P2** — 個別 mission/battle edge のテスト拡充は有用だが、指摘の「domain が authoritative 外」は **解消済み** |

---

### Grok 旧 P1: Prompt bloat Guild+Domain

| 項目 | 判定 |
|------|------|
| **現状** | Campaign chunk 追加後も eviction テスト通過。Guild/Domain は **低優先 tier**（66–67）。 |
| **重大度（修正）** | **P2**（継続監視） |

---

## Security / Privacy（Campaign / Observatory スコープ）

| 項目 | 確認結果 |
|------|----------|
| Webview payload leak | **良好** — `pickDiscoveriesForWebview` は `valueHint` 非送信。`pickJobBoardForWebview` は公開フィールドのみ。Observatory は `worldView` の集計データ（FoW 済み）。**GM 専用** `valueHint` / 内部 seed は Webview 未配線。 |
| Campaign quest `factionId` | Webview に **Client バッジ**として表示（意図的・FoW ではない）。 |
| `sell_discovery` | **v1.54.0** — `validateSellDiscoveryTrade` + ledger 配線。Webview はチャット挿入のみ。 |
| HTML export / path / Remote Play | Campaign/Observatory スコープ外 — 横断レビュー継続 |

---

## State Consistency（修正版）

| 経路 | 評価 |
|------|------|
| GM turn + `discoveryOps` / `campaignResourceOps` | **v1.54.0 で安全** — `commit.ok` ゲートで skip/quarantine 時は ledger 非更新 |
| UI `acceptCampaignJob` + GM turn | **低リスク** — `world_state` vs `game_state` はファイル分離 |
| UI `acceptCampaignJob` + Observer tick | **v1.55.0 で緩和** — `mergeQuestHooks` + accept は `patchWorldStateQuestHooks` |
| Observer `advance` + Commerce UI | **緩和済み** — revision 付き `scheduleCommercePersist` |
| `game_state` / `world_state` Split Brain | **緩和済み v1.62.0** — circuit breaker + dual-write orchestrator + split-brain health（PR-C impl） |

---

## Test Gap Analysis（採用案のみ）

| テスト名 | 優先 | 内容 |
|----------|------|------|
| `test_world_state_quest_accept_observer_race.js` | **P1** | 並行 `saveWorldState` で `questHooks` が消えないこと |
| `test_sell_discovery_trade_ops.js` | **Done v1.54.0** | 台帳検証 + credits + per-location delta スキップ |
| `test_turn_artifact_commit_atomicity.js` | **Done v1.54.0** | skip/quarantine 時 ledger ゲート契約 |
| `test_campaign_faction_reputation_resolve.js` | P2 | `hook.factionId` → `resolveFactionIdForQuestHook` |
| Guild/Domain commit e2e（Grok 案） | P2 | 既存 132 本に **追加**で十分；P0 ブロッカーではない |

**不要（Gemini 案）:** `test_world_observatory_tick_race` を Event Sourcing 前提で書く必要はなし — 先に `world_state` merge 方針を決める。

---

## Suggested Patch Plan（修正版）

| PR | 内容 | 優先 | Ver 目安 |
|----|------|------|----------|
| ~~**ChatGPT PR1**~~ | campaign_resources 初期値 seed | P1 | **1.54.0 ✓** |
| ~~**ChatGPT PR2**~~ | sell_discovery ledger 検証 | P1 | **1.54.0 ✓** |
| ~~**ChatGPT PR3**~~ | commitGameState result + ledger ゲート | P1 | **1.54.0 ✓** |
| ~~**PR-4**~~ | `mergeQuestHooks` + `patchWorldStateQuestHooks` | P1 | **1.55.0 ✓** |
| ~~**PR-5**~~ | `test_world_state_quest_accept_observer_race.js` | P1 | **1.55.0 ✓** |
| ~~**PR-6**~~ | Observatory 副作用契約 + compute/persist 分離 | P2 | **1.56.0 ✓** |
| ~~**PR-7**~~ | discoveries / campaign_resources serialized mutation queue | P2 | **1.57.0 ✓** |
| ~~**PR-8**~~ | プロンプト: inactive モジュール chunk 省略 | P2 | **1.58.0 ✓** |
| ~~**PR-C（tests）**~~ | Split Brain edge case テスト拡充（横断） | P2 | **1.59.0 ✓** |
| ~~**PR-C（impl）**~~ | サーキットブレーカー + dual-write + health | P2 | **1.62.0 ✓** |
| ~~**PR-D**~~ | Cross-ledger 部分失敗テスト + 補償方針 | P2 | **1.60.0 ✓** |
| ~~**PR-E**~~ | Ledger sanitization（Webview + export） | P2 | **1.61.0 ✓** |
| ~~PR（Gemini）~~ | ~~StateManager Event Sourcing 全面改修~~ | **却下** | — コスト対効果不適切 |
| ~~PR（Gemini）~~ | ~~Webview 全モジュール mount/unmount 強制~~ | **延期** | — 現状再現なし |

---

## Positive Notes（実装確認済み）

1. **Pure core 分離:** `campaignKitCore`, `campaignJobBoardCore`, `discoveryLedgerCore`, `discoveryAppraisalCore`, `worldObservatoryCore` — vscode/fs 非依存のテスト可能設計。
2. **Bridge 層:** `campaignKitBridge`, `campaignJobAccept` — Webview / prompt / accept の配線が明確。
3. **Observatory 設計:** `watch` / `advance` のコスト分離と `game_state` 触れない watch モードは意図がコードコメントで明示されている。
4. **テスト規律:** Campaign / Observatory それぞれ `test_*_core.js` が `run_all_tests.js` に登録（**132/132**）。
5. **サンプル:** `scrapbound-settlement` + `test_scrapbound_sample_integrity.js` で統合データ整合を継続検証。

---

## 依頼者向け一行

Gemini **P0×2 却下**、ChatGPT **P1×3 は v1.54.0 で反映済み**。次の焦点は **`world_state` LWW（観測者 tick × accept job）** と独立台帳 write queue。Event Sourcing 全面改修や Webview mount 強制は不要。

---

## 参照

- 同型トリアージ: [`DOMAIN_MODE_REVIEW_GEMINI_v1_39.md`](DOMAIN_MODE_REVIEW_GEMINI_v1_39.md)
- 版の正本: [`VERSION_TRUTH.md`](VERSION_TRUTH.md)（**1.59.0**）
- Campaign 設計: [`CAMPAIGN_KIT_DESIGN.md`](CAMPAIGN_KIT_DESIGN.md)