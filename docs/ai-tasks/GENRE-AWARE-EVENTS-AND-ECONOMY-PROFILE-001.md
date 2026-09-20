# GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001

> **Status: DESIGN ONLY — not yet implemented.**
> このファイルはコード調査に基づく設計地図。実装は未着手。次に着手するAIは
> まず本ファイルと下記の実ファイルを読み、`AGENTS.md` の安全ルール（仕様外の
> 機能を勝手に足さない・小さく分割する）に従うこと。
>
> - Base: `f641d0f`（package.json 1.82.3）
> - 調査者: Claude Opus 4.8（2026-07-14）
> - 推奨担当/推論: Opus 4.8 最大（複数系統横断＋データ駆動化＋フォールバック設計を含むため）

## 1. 問題設定（ユーザー要望）

1. **イベントがシナリオのジャンルに対応していない**。「ホラー世界で好況バブルのような
   陽気なイベントが出る」を避けたい。ジャンルごとに出得るイベント種類を分けたい。
2. **世界観ごとに経済の緩急（緩い/キツい）を変えられるようにしたい**。ユーザーが作った
   世界の設定で経済難易度を選べると良い。

物語・GM応答の質は今回は度外視。決定論的な世界シム／経済シムのイベントとパラメータが対象。

## 2. コードで裏取りした現状（正確なマップ）

イベントを生む系統は **5つ**あり、ジャンル（theme）を見ているのは **Campaign Kit だけ**。

| 系統 | ファイル | ジャンル対応 | 備考 |
|---|---|---|---|
| 世界シム（派閥資源/敵対摩擦/地域危険度） | `src/emergentSimulator.ts` | ❌ 非依存 | メッセージは汎用固定文字列。`runSimulationStep(forge, state)` |
| 経済ショック（食料危機→価格、鍛冶→在庫） | `src/worldSimCommerceCore.ts` | ❌ 非依存 **＋commodity名ハードコード** | 下記3.が最重要 |
| Campaign Kit（掲示板/噂/発見物） | `src/campaignKitCore.ts` | ✅ 7ジャンルプリセット | ただし世界シムとは別系統・非連携 |
| 旅エンカウント（放射線/嵐/generic） | region hazard系（`travelEncounter*`） | ❌ 地域ハザード駆動、theme非ゲート | `GameRules.travelEncounterDensity` で密度のみ調整可 |
| NPCライフイベント（盟友/宿敵/決別） | `src/npcLifeEventsCore.ts` | ➖ 意図的に中立 | GM解釈前提。theme-neutralは設計思想（変更対象外候補） |

### 「イベントカタログ」は存在しない

ユーザーがイメージする「イベントの種類一覧」は、**データとしては存在しない**。イベントは
tick関数の中で条件分岐→直接 `worldEvents.push(...)` されるハードコードであり、
データ駆動のテンプレート集ではない（例: `emergentSimulator.ts:230-245` の食料枯渇、
`:291-302` の敵対摩擦）。よって「ジャンル別に出し分ける」には、まずイベント生成を
"データ（テンプレート＋発生条件＋許可ジャンル）"に外出しする作業が前提になる。

イベント種別の既存タキソノミーは固定enumのみ:
`WorldEventType = 'environmental' | 'political' | 'military' | 'social' | 'magical' | 'other'`
（`src/worldStateCore.ts:12`）。`'magical'` はファンタジー寄りで、既にジャンル非中立。

## 3. 最重要の発見: 経済ショックが commodity 名ハードコード

`src/worldSimCommerceCore.ts` の `applyWorldEventsToMarkets()` は、価格ショックを
コモディティID `wheat` / `steel` に**直接キー**している:

- `worldSimCommerceCore.ts:75-77` — 食料危機は `next[loc]?.wheat` の priceIndex を +0.35
- `worldSimCommerceCore.ts:85-88` — 鍛冶改善は `next[loc]?.steel` の stock/価格
- トレース側も `:284-323` で `wheat`/`steel` 前提

→ ホラー/サイバーパンク/SF等、`wheat` という品目が無い世界では、食料危機イベントが
**発火しても `?.wheat` が undefined で静かに何もしない**。つまり「変なイベントが出る」以前に、
経済ショックが農耕ファンタジー専用に配線されている。ジャンル対応の前に **commodity抽象化**
（「主食カテゴリ」「素材カテゴリ」等の役割タグ、または forge 側で shock 対象 commodity を宣言）
が必要。

## 4. 逆に「既にレールがある」もの（ゼロからではない）

- **`MarketTickOptions.recoveryPerTick?`（`worldSimCommerceCore.ts:20`）が既に上書き可能**。
  現状は常に既定 `DEFAULT_MARKET_RECOVERY_PER_TICK=2`（`:12`）で呼ばれるだけ。緩急ノブの
  一部（回復速度）はここに配線するだけで通る。
- **enum型の難易度ノブの前例が既にある**: `GameRules.travelEncounterDensity: 'low'|'medium'|'high'`
  （`src/gameRulesCore.ts:21`）。経済にも同型（例 `economyProfile: 'easy'|'normal'|'harsh'`）を
  足すのが自然。`GameRules` に経済難易度ノブは現状**皆無**。
- **設定を tick に運ぶ継ぎ目が既にある**: `WorldKitTickInput`（`src/worldKitTickCore.ts` の
  interface。`runLivingWorldTick` がこの型を受け取る）は `commerceEnabled`/`agencyEnabled`/`maxNamedNpcCount` 等、
  **game_rules由来の設定を既にフィールドとして受け取っている**。ここに `economyProfile` を
  1本足し、`tickMarketRecovery` の options（`recoveryPerTick` 等）へ流すのが最小侵襲。
- **theme（ジャンルタグ）の型付き経路は一様ではない**: `WorldForge` は relevant world-simulation
  path で `meta.theme` を公開する。一方、`runLivingWorldTick` の `WorldKitTickInput.forge` は
  `CommerceForge` 型であり、`CommerceForge` / `WorldKitTickInput` は同じ `meta` path を現状公開しない。
  commerce/theme wiring には、`input.forge.meta.theme` が普遍的に存在すると仮定せず、theme を
  明示的に渡す field または型を安全に広げる seam が必要。
- **Campaign Kit の7ジャンルプリセットが「ジャンル×語彙」のモデル**として既に存在
  （classic_fantasy_guild / postapoc_scavenger / space_frontier / eastern_fantasy /
  cyberpunk_courier / modern_occult / survival_horror）。イベントのジャンルゲートは、
  この分類軸を流用/拡張するのが一貫性的にベスト。

固定モジュール定数（全世界共通、現状は options で開いていない）:
`MAX_PRICE_INDEX=4`（`:13`）, `MIN_PRICE_INDEX=0.25`（`:14`）,
`FOOD_CRISIS_PRICE_BUMP=0.35`（`:15`）, `STEEL_IMPROVEMENT_STOCK=3`（`:16`）。
緩急ノブで動かすならこれらを options 経由に開く。

## 5. Opus級の判断が要る設計分岐点（実装前に決める）

1. **データ駆動化の境界** — 全5系統を一気にイベントカタログ化するか、まず
   経済ショックの `wheat/steel` ハードコード解消＋theme ゲートだけに絞るか（小さく始める推奨）。
2. **ジャンルタグの正本** — `worldForge.meta.theme` / `GameRules.campaignKitId` /
   Genesis genre の3つが併存。イベント/経済のゲートにどれを正本とするか、そして
   **自由入力ワールドで theme が無い/未知の場合のフォールバック**（= 全ジャンル中立イベントのみ、
   が安全側）。ユーザーの「ユーザー世界観で自由に」を満たすには、theme 未指定でも破綻しない
   ことが必須。
3. **緩急ノブの粒度** — enum1個（`easy/normal/harsh`）で全定数を係数スケールするか、
   項目別（回復速度・ショック強度・価格上限を個別）に開くか。`travelEncounterDensity` に
   倣うなら前者が UI/i18n/既存パターン的に軽い。

## 6. 最小侵襲な配線マップ（実装時の当たり）

```
GameRules.economyProfile?           (gameRulesCore.ts — 新規、travelEncounterDensity に倣う)
   │  loadGameRules() → host
   ▼
WorldKitTickInput.economyProfile    (worldKitTickCore.ts interface — 新規フィールド、既存の enabled 群と同じ流し方)
   │
   ▼
tickMarketRecovery(forge, markets, {
   recoveryPerTick: profileToRecovery(economyProfile),   ← :20 の既存 optional を活用
   shockScale / maxPriceIndex: ...                        ← :13-16 定数を options 化して渡す
})

theme ゲート:
   WorldForge.meta.theme (world simulation path)
      または commerce tick に追加する明示的な theme seam
      → イベントテンプレートの allowedThemes と突合
   （未指定/未知 theme は「中立イベントのみ許可」にフォールバック）

commodity 抽象化:
   worldSimCommerceCore の wheat/steel 直キーを、forge 側の
   「shock 対象 commodity 宣言」or「commodity role タグ（staple/material）」参照に置換
```

`runSimulationStep(forge, state)`（`emergentSimulator.ts:151`）は現状 game_rules を
受け取らない点に注意。世界シム側イベントに economyProfile/theme を効かせるなら、
呼び出し元（`worldSimBulkCore.ts:107,182` 等）で input を足すか、forge/state 経由で運ぶ。

## 7. 検証の当たり（実装後）

- 既存の決定論 soak（`node scripts/run_noai_soak.js --mode full`）で回帰を担保。theme別/
  economyProfile別の soak シナリオを `scripts/noai_soak_scenarios/` に追加すると、
  「harsh で価格が張り付かないか」「theme ゲートで想定イベントのみ発火するか」を数値で確認できる。
- `--keep-temp` の telemetry（Actions/Money/PriceIndex/RejectReasons）が緩急の効き具合の実測に使える。
- ジャンル別バランスの「面白さ/キツさ」判断自体は数値だけでは決まらない → soak の数値レポートを
  Opus 4.8 に渡して定性評価、が前提の運用（本タスクの範囲外だが後続で必要）。

## 8. 非ゴール / 安全メモ

- NPCライフイベントの theme 中立は設計思想（GM解釈前提）。安易に theme ゲートしない。
- `game_rules.json` へ非正本メタ（assetHint 等）を書かない既存規約を踏襲。
- 新規依存は足さない（`AGENTS.md`）。全て純関数Core＋既存の options/input 拡張で収まる想定。
- 大きく一括変更せず、§5-1 の通り「経済ショックの脱ハードコード＋theme ゲート」から
  小さく切ること。
