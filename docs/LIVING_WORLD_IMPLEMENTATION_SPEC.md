# Living World — 実装仕様書（LW1-PR2 〜 LW-DEMO）

> **対象読者:** Antigravity（監督）／ Claude Code ／ Codex ／ ローカル Coder（Qwen2.5-Coder-14B 等）。
> **前提ドキュメント:** `docs/COMMERCE_AND_AGENCY_BRIEF.md`（思想・北極星）、`../lorerelay-world-kit/docs/DESIGN.md`（コア設計）、`docs/OVERNIGHT_HANDOFF.md`（現状）、両プロジェクトの `AGENTS.md`（安全柵）。
> **書いた人:** Opus 4.8（2026-07-02、寝る前仕込み）。**この仕様は「何を作るか」を確定し、実装は agent に任せるための命令書。**
> **黄金律:** 数値・在庫・座標は **決定論 Core**。GM/LLM は **narration 専任**。narration からの自動売買パースは Non-Goal。

---

## 0. 現状スナップショット（2026-07-02 実測・検証済み）

**動いているもの（v1.22.0 / world-kit v0.1.0）:**

| 領域 | 実体 | 状態 |
|------|------|------|
| Core 群 | `lorerelay-world-kit/src/*.ts`（commerce/transport/worldSimCommerce/npcAgency/livingWorldPrompt/worldKitTick） | ✅ テスト 5/5 |
| 同期 | `scripts/sync_world_kit.js`（world-kit → 本体 src へコピー） | ✅ |
| Game Rules | `src/gameRules.ts` に `enableCommerce` / `enableNpcAgency`（既定 **false**） | ✅ |
| Sim後tick | `emergentSimulator.ts` → `tickLivingWorldAfterSim()` | ✅ |
| GM注入 | `gmPromptBuilder.ts` → `buildLivingWorldGmLines()` → `[Living World — …]` | ✅ |
| ターン適用 | `livingWorldTurnOps.ts` → `applyLivingWorldTurnOps()`（tradeOps / npcAgencyOps） | ✅ |
| 訪問記録 | `statePatch.ts:458` → `recordLocationVisit()` | ✅（ただし §1 参照） |
| Fixtures | `lorerelay-world-kit/fixtures/trade_routes_{forge,state}.json`（north_farm / elda_shop / south_port） | ✅ |

**Core の公開 API（実測・そのまま呼べる。存在しない関数を発明しないこと）:**

```
commerceCore:        computeUnitPrice, quoteMarketPrice, cargoWeight, transportCapacity,
                     cargoFits, parseTradeOps, applyTradeOp, applyTradeOps,
                     buildMarketPriceTable, initializeMarketState
                     const: MAX_TRADE_OPS_PER_TURN=16, MAX_TRADE_QTY=999, MIN_PRICE=1
transportCore:       findLocationPath, findRegionPath, computeTravelDays,
                     computeFoodConsumption, resolveTransportForTheme, planTravel
                     const: MAX_PATH_HOPS=32, DEFAULT_TRAVEL_DAYS=3, MIN_TRAVEL_DAYS=1
worldSimCommerceCore: applyWorldEventsToMarkets, tickMarketRecovery, computeSinceLastVisitDelta
                     const: DEFAULT_MARKET_RECOVERY_PER_TICK=2, MAX_PRICE_INDEX=4,
                            MIN_PRICE_INDEX=0.25, FOOD_CRISIS_PRICE_BUMP=0.35, STEEL_IMPROVEMENT_STOCK=3
npcAgencyCore:       parseNpcAgencyOps, resolveNpcLocation, listNpcPresence, reactNpcsToWorld,
                     applyNpcAgencyOps, advanceNpcArrivals
                     const: MAX_NAMED_NPC_AGENCY=10, DEFAULT_AGENDA_TRAVEL_DAYS=3
livingWorldPromptCore: buildCommercePromptLines, buildSinceLastVisitLines, buildNpcAgencyPromptLines,
                     buildLivingWorldPromptBlocks, formatLivingWorldGmInjection
worldKitTickCore:    runLivingWorldTick, defaultPlayerCommerce
host (livingWorldBridge.ts): livingWorldEnabled, resolveCommerceForge, ensureLivingWorldMarkets,
                     tickLivingWorldAfterSim, buildLivingWorldGmLines, recordLocationVisit
host (livingWorldTurnOps.ts): getOrInitPlayerCommerce, applyLivingWorldTurnOps
```

**まだ無いもの（このドキュメントで作る）:** World タブ相場表 / Inspector 表示 / Since-last-visit 実データ / Transport×Layer B / NPC whereabouts のプレイヤー可視化 / trade-routes デモシナリオ。

---

## 1. 🔴 最優先: 既知バグ — Since-last-visit が常にゼロ

**検証済み（実コードで確認）:** `src/livingWorldBridge.ts` の `buildLivingWorldGmLines()`（132–141行）は差分をこう計算している:

```ts
computeSinceLastVisitDelta({
  ...
  marketsBefore: markets,   // ← 現在の markets
  marketsAfter: markets,    // ← 同一オブジェクト！ 差分は常に 0
  ...
})
```

`recordLocationVisit()`（`statePatch.ts:458`）は `lastVisitTurnByLocation[loc] = worldTurn` の **ターン番号しか記録していない**。よって「留守中に相場がどう動いたか」は絶対に出せない。これが `docs/OVERNIGHT_HANDOFF.md` の「Since-last-visit snapshot on location leave」タスクの正体。

**修正仕様（LW1-PR2 に含める）:**

1. `LivingWorldWorldStateExt`（`livingWorldBridge.ts:18`）に追加:
   ```ts
   /** 各ロケーション退出時点の市場スナップショット（Since-last-visit 用）。 */
   marketSnapshotByLocation?: Record<string, Record<string, MarketStockEntry>>;
   ```
2. `recordLocationVisit()` を拡張: ターン記録に加え、**その location の market state をディープコピーして** `marketSnapshotByLocation[locationId]` に保存。
3. `buildLivingWorldGmLines()`: `marketsBefore` を `ext.marketSnapshotByLocation?.[playerLocationId]` から供給（無ければ delta スキップ）。`marketsAfter` は現在の `markets`。
4. Node テスト `test/test_since_last_visit_host.js`（新規）: 退出 → market を tick で変動 → 再訪で delta が非ゼロを検証。

**受け入れ条件:** enableCommerce + fixtures で、ある港を離れて数ターン後に戻ると GM プロンプトに `[Living World — Since last visit]` が **実際の price/stock 変化を伴って** 出る。

---

## 2. LW1-PR2 — World タブ相場表 + Inspector（read-only）

**目的:** プレイヤーが「今どこで何がいくらか」を UI で見られる。売買はまだ GM 経由（tradeOps）。UI は表示専用。

### 2.1 データフロー
```
extension（状態変化時）
  → buildMarketPriceTable(commerce, markets)   // commerceCore に既存
  → postMessage({ type: 'livingWorldMarkets', payload })
  → webview module が World タブ内にテーブル描画
```

### 2.2 作業
- **src 側:** World タブ状態送信時（`worldView.ts` 付近、既存の world postMessage を踏襲）に `enableCommerce` かつ commerce forge があれば `buildMarketPriceTable()` の結果を payload に含める。列: `locationName / commodityName / unitPrice / stock / priceIndex`。
- **webview 側:** `webview/modules/` に相場表を描画するモジュールを追加（既存 World タブ描画関数の隣。`scripts/build-webview.js` が束ねる前提 — **`webview/script.js` を直接編集しない**）。read-only テーブル。空なら非表示。
- **Inspector:** 既存 Turn Inspector に「Living World ops」欄を追加し、直近 `turn_result` の `tradeOps` / `npcAgencyOps` を件数付きで表示（無ければ非表示）。
- **§1 のバグ修正を本 PR に同梱。**

### 2.3 受け入れ条件
- fixtures ロード + enableCommerce ON で World タブに 3 市場の相場表。
- sim tick 後（数ターン進める）に stock / priceIndex が更新される。
- OFF 時・commerce ブロック無し時はテーブル非表示（レイアウト崩れ無し）。
- `postMessage` 値は既存パターン同様にクランプ（NaN/負値/巨大配列を弾く。`worldView` の既存クランプに倣う）。

### 2.4 Non-Goal
- UI からの直接売買ボタン（v1+）。数値編集。ドラッグ。

---

## 3. LW1-PR3 — Transport × Layer B（旅で食料と相場が動く）

**目的:** 「移動には日数と食料がかかり、その間に世界が回る」。大航海／巡り廻るの生活感の芯。

### 3.1 接続点
既存の Layer B 時間経過（`narrativeTimePassageCore.ts` / `worldSimPersist.ts`、`turn_result.elapsedWorldTurns`）に commerce の輸送を噛ませる。

### 3.2 仕様
1. **輸送種別解決:** `game_state.commerce.transportId`（無ければテーマから `resolveTransportForTheme(commerce, theme)`）。
2. **旅の計算:** 目的地が判明したら `planTravel({ ... }, cargoWeight)` で `days` を得る。`narrativeDays`（GM が「3日かけて」と言った場合の `elapsedWorldTurns`）があればそれを優先（Core が対応済み）。
3. **食料消費:** `computeFoodConsumption(days, foodPerDay, cargoWeight)` を `game_state`（食料は既存 `status` かコマース側か要決定 — §6 の問い）から減算。
4. **世界を回す:** 旅の各ワールドステップで既存 sim tick + `tickLivingWorldAfterSim()` を回す（N 日 = N tick か、まとめて 1 回か → §6）。
5. **到着処理:** 到着 location で `recordLocationVisit()`（§1 修正後）。次ターンの GM プロンプトに Since-last-visit が出る。

### 3.3 受け入れ条件
- enableCommerce + transport 定義済みで「南港へ向かう」→ 日数分ワールドが進み、食料が減り、到着後に相場変化が見える。
- 食料不足時は Core / host のどちらかで負にならずクランプし、GM に `[Living World]` で警告文脈を渡す（narration は GM）。

### 3.4 Non-Goal
- 積み下ろしミニゲーム、船の耐久、天候ルート分岐（future arc）。

---

## 4. LW2-PR1 — NPC whereabouts の可視化と ops 精緻化

**目的:** 「あの人、今どこ？」が世界の動きの結果として分かる（太閤／ガンパレの入口）。

### 4.1 現状
`applyLivingWorldTurnOps()` は `npcAgencyOps` を適用済み。`tickLivingWorldAfterSim()` は `reactNpcsToWorld()` を回す。GM プロンプトの `[Living World — NPC whereabouts]` は `agencyEnabled`（= `enableNpcAgency`）時に出る。**バックエンドは動いている。UI とルール精緻化が残り。**

### 4.2 仕様
1. **≤10 クランプの明示:** `applyNpcAgencyOps` / `reactNpcsToWorld` は Core 側で `MAX_NAMED_NPC_AGENCY=10` を尊重するが、host が registry を渡す時点でも 10 件超なら **登録順で先頭 10 件に制限**し、Inspector に「clamped」を出す。
2. **プレイヤー可視化（World タブ / 地図）:** registry NPC の現在地（`resolveNpcLocation`）を World タブに一覧。**信頼連動の精度は v1+** — v0 は「判明している知人のみ、在庫なら location 名、移動中なら『〜へ向かっている』」を表示。未訪問・低信頼は「行方不明」でよい（Non-Goal を増やさない）。
3. **理由の伝達:** `NpcPositionState.reason` を GM プロンプト・UI 両方で（あれば）表示。`reactNpcsToWorld` が食料危機で動かした NPC には reason が入る想定 — Core を確認し、無ければ reason を埋める最小修正。

### 4.3 受け入れ条件
- enableNpcAgency + enableNpcRegistry で Elda / Marcus が World タブに表示。
- 食料危機イベント後、商人系 NPC の location が安い小麦市場へ変わり、reason 付きで GM プロンプトと UI に出る。
- registry 11 件以上でクラッシュせず 10 件にクランプ。

### 4.4 Non-Goal（§5.6 of BRIEF 準拠）
- NPC 同士の自動会話生成・関係グラフ自動更新（**北極星だが v0 外**）。ランダムウォーク。フル日程スケジューラ。

---

## 5. LW-DEMO — trade-routes サンプルシナリオ

**目的:** 「数ターン放置 → 戻ると世界が変わっている」を **箱から出してすぐ体験** できるデモ。全機能の統合テスト兼ショーケース。

### 5.1 成果物
`sample-scenarios/trade-routes/`:
- `scenario.json`（既存シナリオパック形式。`SCENARIO_PACK.md` 準拠）
- `game_rules.json`: `enableWorldForge` / `enableEmergentSimulation` / `enableCommerce` / `enableNpcRegistry` / `enableNpcAgency` を **true**
- `world_forge.json`: `fixtures/trade_routes_forge.json` の commerce ブロックを取り込んだフルフォージ（3港 north_farm / elda_shop / south_port、小麦 wheat・鋼 steel、馬車 wagon・帆船 sailing_ship）
- `world_state.json`: `fixtures/trade_routes_state.json` ベース
- `npc_registry.json`: Elda（商人）、Marcus（鍛冶屋）
- `README.md`: 遊び方 + 「試す手順」（下記シナリオ体験）

### 5.2 体験シナリオ（README に明記・受け入れ条件）
1. north_farm で小麦を安く買う（GM に「小麦を10買う」→ tradeOps）。
2. south_port へ旅する（数日経過、食料消費、ワールド tick）。
3. 到着すると `[Since last visit]` に「小麦が値上がり」等が出る。
4. south_port で売って利益。credits 増加。
5. しばらく別行動 → 戻ると Marcus が鋼を並べている（Tier 1 在庫改善）。Elda が別港へ移動している（Tier 2）。

### 5.3 受け入れ条件
- クリーンな workspace にこのシナリオを置いて起動 → 上記 1–5 が破綻なく通る。
- `enableCommerce` を false にしても物語シナリオとして壊れない（数値は非表示、GM 続行）。

---

## 6. 実装前に確定すべき問い（agent は独断で決めず、この既定に従う）

BRIEF §7 の設計問いのうち、overnight 実装で詰まる箇所の **既定回答**（迷ったらこれ。逸脱時は理由をコミットに書く）:

| 問い | overnight 既定 |
|------|----------------|
| 市場粒度 | **location のみ**（`MarketDef.regionId` は将来用に残すが v0 未使用） |
| 価格式 | `basePrice × priceIndex × supplyBias`（`computeUnitPrice` のまま。変更しない） |
| tradeOps vs statePatch | **専用チャネル `tradeOps`**（C9 と同型。既に実装済み） |
| cargo と inventory | **併存**。`game_state.commerce.cargo` が正、既存 `status.inventory` は触らない |
| 食料の所在 | **`game_state.commerce` に `food` を持たせる**（`status` を汚さない）。無ければ旅で 0 クランプ + 警告のみ |
| 旅の tick 粒度 | **まとめて 1 tick**（N 日 → recovery を N 回相当で 1 回適用、`tickMarketRecovery` の options で日数を渡す。ループで重くしない） |
| NPC 正本 | agency ON かつ `arrivesTurn ≤ worldTurn` は `npcPositions`、それ以外は registry `locationId`（`resolveNpcLocation` 準拠） |
| NPC 上限 | **10 固定**（`MAX_NAMED_NPC_AGENCY`）。設定可能化は v1+ |
| playerRole | v0 は **merchant 固定**。`PlayerRole` 型は残す。ロール選択 UI は作らない |
| world-kit 切り出し | 既に別ディレクトリ。**今はモノレポ化しない**。`sync_world_kit.js` で同期する運用を維持 |

---

## 7. 全 PR 共通の完了条件（DoD）

どの PR も、以下を満たさない限り「完了」と報告しないこと:

1. `lorerelay-world-kit` を編集したら → `cd lorerelay-world-kit && npm test`（緑）。
2. 本体 src に反映するなら → `node scripts/sync_world_kit.js`（コアを本体へ同期）。
3. `cd text-adventure-vsce && npm run compile`（TS エラー 0）。
4. `npm test`（既存 **68/68** を割らない。新規テストは追加する）。
5. webview を触ったら → `scripts/build-webview.js` を通す（`script.js`/`style.css` を手編集しない）。
6. 1 PR = 1 論理変更 = 小さいコミット。危険操作（削除・`git reset --hard`・`git clean`・依存大量追加・スキーマ破壊マイグレーション）は **やらない**（`AGENTS.md`）。
7. 変更ファイル / 実行コマンド / テスト結果 / 残課題を最後にまとめる。

---

## 8. 推奨実装順（依存順）

```
1. §1 Since-last-visit バグ修正       ← 最優先・小さい・他の価値を底上げ
2. LW1-PR2 World タブ相場表 + Inspector（§1 を同梱）
3. LW2-PR1 NPC whereabouts 可視化      ← バックエンド済みで表示だけ、費用対効果高い
4. LW1-PR3 Transport × Layer B         ← 少し重い。Layer B 理解が要る
5. LW-DEMO trade-routes                ← 上記が揃ってから統合ショーケース
```

**overnight の安全な取り掛かり:** §1 → LW1-PR2 → LW2-PR1。LW1-PR3 は Layer B の既存挙動を読んでから。LW-DEMO は最後。

---

## 9. 関連ファイル早見表

| やりたいこと | 見るファイル |
|--------------|--------------|
| Core を直す | `lorerelay-world-kit/src/*.ts` → `sync_world_kit.js` |
| tick を差す | `src/emergentSimulator.ts`（`tickLivingWorldAfterSim` 呼び出し元） |
| GM 注入文言 | `src/gmPromptBuilder.ts` + `src/livingWorldBridge.ts:buildLivingWorldGmLines` |
| ターン適用 | `src/livingWorldTurnOps.ts` |
| 訪問記録 | `src/statePatch.ts`（`recordLocationVisit` 呼び出し, 458行付近） |
| フラグ | `src/gameRules.ts`（`enableCommerce`/`enableNpcAgency`） |
| World タブ UI | `webview/modules/*.js` + `src/worldView.ts` + `scripts/build-webview.js` |
| デモ | `sample-scenarios/`（既存 `debug-sandbox` / `lost-catacombs` を参考） |

---

## 10. 変更履歴
| 日付 | 内容 |
|------|------|
| 2026-07-02 | 初版（Opus 4.8）。現状検証 + Since-last-visit バグ特定 + LW1-PR2/PR3/LW2-PR1/LW-DEMO 仕様 + 既定回答 + DoD |
