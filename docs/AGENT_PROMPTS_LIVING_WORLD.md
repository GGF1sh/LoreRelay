# Living World — エージェント投入プロンプト集（コピペ用）

> **使い方:** 圭佑さんが寝ている間、Antigravity を「監督」にして下のプロンプトを **上から順に 1 つずつ** 投げる。各プロンプトは自己完結 — 前提を毎回埋め込んである。
> **土台仕様書:** `docs/LIVING_WORLD_IMPLEMENTATION_SPEC.md`（各タスクの詳細はここ）。
> **安全柵:** `AGENTS.md`（両プロジェクト）。危険操作は禁止。
> **鉄則:** 1 タスク = 1 プロンプト = 小さいコミット。完了条件（DoD）を満たすまで「done」と言わせない。

---

## 監督（Antigravity 等）への常設ヘッダー

各タスクプロンプトの前に、この管制ルールを 1 度セットしておく:

```
あなたは LoreRelay（C:\AI\text-adventure-vsce）の実装監督です。
作業前に必ず読む: docs/LIVING_WORLD_IMPLEMENTATION_SPEC.md, AGENTS.md, docs/OVERNIGHT_HANDOFF.md。

絶対ルール:
1. ファイル削除・git reset --hard・git clean -fdx・format 系は使わない。
2. 大きな変更の前に実装計画を1つ出す。1タスク=1論理変更=小さいコミット。
3. 仕様書(SPEC)に無い機能を勝手に足さない。迷ったら SPEC §6 の既定に従う。
4. 数値・在庫・座標は決定論 Core。LLM は narration 専任。narration 自動売買パースは作らない。
5. webview は webview/modules/*.js を編集し scripts/build-webview.js で束ねる。
   webview/script.js と style.css は生成物なので直接編集しない。
6. 完了条件(DoD, SPEC §7)を全て満たすまで完了報告しない:
   - lorerelay-world-kit を触ったら: cd lorerelay-world-kit && npm test
   - 本体反映: node scripts/sync_world_kit.js
   - cd text-adventure-vsce && npm run compile （TSエラー0）
   - npm test （既存 68/68 を割らない・新規テスト追加）
7. 存在しない関数/ファイルを引用しない。SPEC §0 の API 一覧が正。呼ぶ前に grep で実在確認。
8. 最後に必ず報告: 変更ファイル / 実行コマンド / テスト結果(数字) / 残課題。

危険を感じたら止めて、ログを残して次のタスクへ行かず待機すること。
```

---

## TASK 1 — Since-last-visit バグ修正（最優先・小）

```
目的: 「留守中に相場がどう動いたか」が GM プロンプトに絶対に出ない既知バグを直す。

現状(検証済み): src/livingWorldBridge.ts の buildLivingWorldGmLines() は
computeSinceLastVisitDelta を marketsBefore=markets, marketsAfter=markets（同一参照）で
呼んでおり差分が常にゼロ。recordLocationVisit() はターン番号しか記録していない。

やること(SPEC §1 の通り):
1. LivingWorldWorldStateExt(src/livingWorldBridge.ts:18付近) に追加:
     marketSnapshotByLocation?: Record<string, Record<string, MarketStockEntry>>;
2. recordLocationVisit(): ターン記録に加え、その locationId に対応する market state を
   ディープコピー(JSON round-trip 可)して marketSnapshotByLocation[locationId] に保存。
3. buildLivingWorldGmLines(): marketsBefore を ext.marketSnapshotByLocation?.[playerLocationId]
   から供給。無ければ Since-last-visit をスキップ。marketsAfter は現在の markets。
4. 新規 Node テスト test/test_since_last_visit_host.js:
   退出 → tickMarketRecovery で market 変動 → 再訪で delta が非ゼロを検証。

DoD: npm run compile OK / npm test で新テスト含め緑。
受け入れ: fixtures + enableCommerce で港を離れ数ターン後に戻ると
[Living World — Since last visit] が実際の price/stock 変化付きで出る。
```

---

## TASK 2 — LW1-PR2: World タブ相場表 + Inspector（read-only）

```
目的: 「今どこで何がいくらか」を World タブに表示する（read-only、売買はGM経由のまま）。
前提: TASK 1 完了後。SPEC §2 に詳細。

やること:
1. src 側(worldView.ts 付近, 既存 world postMessage を踏襲): enableCommerce かつ
   commerce forge があれば buildMarketPriceTable(commerce, markets)(commerceCore に既存)を
   payload に含め postMessage({ type:'livingWorldMarkets', ... })。
   列: locationName / commodityName / unitPrice / stock / priceIndex。
   値は既存 worldView のクランプに倣い NaN/負値/巨大配列を弾く。
2. webview/modules/ に相場表描画モジュールを追加(既存 World タブ描画の隣)。read-only。
   空なら非表示。scripts/build-webview.js で束ねる(script.js は直接編集しない)。
3. Turn Inspector に「Living World ops」欄: 直近 turn_result の tradeOps/npcAgencyOps を
   件数付き表示。無ければ非表示。

DoD: build-webview 実行 / compile OK / npm test 緑。
受け入れ(SPEC §2.3): fixtures+ON で3市場の相場表。sim tick 後に stock/priceIndex 更新。
OFF時・commerce無し時はテーブル非表示でレイアウト崩れなし。
Non-Goal: 売買ボタン・数値編集(v1+)。
```

---

## TASK 3 — LW2-PR1: NPC whereabouts 可視化 + ops 精緻化

```
目的: 「あの人今どこ?」を世界の動きの結果として World タブに出す。
前提: バックエンド(applyLivingWorldTurnOps / reactNpcsToWorld / GMプロンプト)は既に動作。
      表示とルール精緻化だけ。SPEC §4 に詳細。

やること:
1. host が registry を Core に渡す時点で 11件以上なら登録順で先頭10件にクランプし、
   Inspector に「clamped」を表示(Core の MAX_NAMED_NPC_AGENCY=10 と二重防御)。
2. World タブに registry NPC の現在地一覧を追加。resolveNpcLocation(npcAgencyCore) を使用。
   v0 の表示規則: 判明した知人のみ / 在庫は location 名 / 移動中は「〜へ向かっている」/
   未訪問・低信頼は「行方不明」。※信頼連動の精度調整は v1+、作り込まない。
3. NpcPositionState.reason を GM プロンプトと UI 両方で(あれば)表示。
   reactNpcsToWorld が動かした NPC に reason が入るか Core を確認し、無ければ埋める最小修正。

DoD: (Core を触ったら world-kit で npm test → sync) / compile OK / 本体 npm test 緑。
受け入れ(SPEC §4.3): enableNpcAgency+enableNpcRegistry で Elda/Marcus 表示。
食料危機後に商人系NPCが安い小麦市場へ reason 付きで移動。registry 11件でクラッシュせず10件。
Non-Goal: NPC同士の会話生成・関係グラフ更新(北極星だが v0外)・ランダムウォーク。
```

---

## TASK 4 — LW1-PR3: Transport × Layer B（旅で食料と相場が動く）

```
目的: 移動に日数・食料がかかり、その間に世界が回る。SPEC §3 に詳細。
前提: まず既存の Layer B 挙動を読むこと:
      src/narrativeTimePassageCore.ts, src/worldSimPersist.ts, turn_result.elapsedWorldTurns。

やること(SPEC §3.2, 既定は SPEC §6):
1. transportId は game_state.commerce.transportId、無ければ resolveTransportForTheme(commerce, theme)。
2. 目的地判明時 planTravel({...}, cargoWeight) で days。narrativeDays があれば優先(Core対応済)。
3. 食料は game_state.commerce.food に持たせる(status を汚さない)。
   computeFoodConsumption(days, foodPerDay, cargoWeight) 分を減算。0未満はクランプ+警告。
4. 旅は「まとめて1 tick」: N日分を tickMarketRecovery の options 経由で1回適用(ループで重くしない)。
   sim tick + tickLivingWorldAfterSim を回す。
5. 到着 location で recordLocationVisit()(TASK1修正後)。次ターン GM に Since-last-visit。

DoD: compile OK / npm test 緑 / 新規テストで食料減算と tick 前進を検証。
受け入れ(SPEC §3.3): 「南港へ向かう」で日数分ワールド前進・食料減・到着後に相場変化が見える。
食料不足は負にならずクランプし GM に [Living World] 警告文脈を渡す(narration は GM)。
Non-Goal: 積み下ろしミニゲーム・船耐久・天候ルート分岐。
```

---

## TASK 5 — LW-DEMO: trade-routes サンプルシナリオ

```
目的: 「数ターン放置→戻ると世界が変わっている」を箱から出してすぐ体験。SPEC §5 に詳細。
前提: TASK 1〜4 完了後。既存 sample-scenarios/(debug-sandbox, lost-catacombs)と
      SCENARIO_PACK.md の形式に倣う。

成果物 sample-scenarios/trade-routes/:
- scenario.json (既存形式準拠)
- game_rules.json: enableWorldForge/enableEmergentSimulation/enableCommerce/
                   enableNpcRegistry/enableNpcAgency = true
- world_forge.json: lorerelay-world-kit/fixtures/trade_routes_forge.json の commerce を
                    取り込んだフルフォージ(3港 north_farm/elda_shop/south_port,
                    小麦 wheat・鋼 steel, 馬車 wagon・帆船 sailing_ship)
- world_state.json: fixtures/trade_routes_state.json ベース
- npc_registry.json: Elda(商人), Marcus(鍛冶屋)
- README.md: 遊び方 + 下記「試す手順」

試す手順(README に明記・受け入れ条件 SPEC §5.2):
1. north_farm で小麦を安く買う 2. south_port へ旅(日数経過・食料消費・tick)
3. 到着で [Since last visit] に値上がり 4. south_port で売って利益(credits増)
5. しばらく別行動→戻ると Marcus が鋼を並べ(Tier1)、Elda が別港へ移動(Tier2)

DoD: クリーン workspace に置いて起動→手順1〜5が破綻なく通る。
     enableCommerce=false でも物語シナリオとして壊れない(数値非表示・GM続行)。
```

---

## ローカル Coder（Qwen2.5-Coder-14B 等）への切り出し向きサブタスク

Antigravity/Claude Code が主実装。ローカルは以下の**小さい・独立した**下請けに向く（VSCode + Continue/Cline 経由）:

- TASK 1 のディープコピー helper と Node テスト（純ロジック、vscode 不要）
- `buildMarketPriceTable` の出力を HTML テーブル文字列にする純関数 + そのユニットテスト
- 各 Core への JSDoc / 型コメント追加（挙動は変えない）
- コミットメッセージ・CHANGELOG 追記文の下書き
- 差分レビュー（「SPEC §6 の既定から外れていないか」チェック）

**ローカルに投げない:** Layer B 連携（文脈が重い）、webview ビルド配線、シナリオ統合。事実確認が要る設計判断も投げない（それっぽい嘘を吐きやすい）。

---

## 起きたときのチェックリスト（圭佑さん用）

- [ ] 各 TASK のコミットが小さく分かれているか（`git log --oneline`）
- [ ] `cd text-adventure-vsce && npm test` が緑か（68 以上）
- [ ] `cd lorerelay-world-kit && npm test` が緑か（5 以上）
- [ ] SPEC §6 の既定から外れた判断があればコミットに理由が書いてあるか
- [ ] 危険操作（削除・履歴改変・依存大量追加）が無いか
- [ ] trade-routes デモが手順どおり動くか（最終確認）
