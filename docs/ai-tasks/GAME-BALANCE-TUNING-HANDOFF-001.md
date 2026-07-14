# GAME-BALANCE-TUNING-HANDOFF-001

> 別チャット引き継ぎ用メモ。ゲームバランス調整(数値チューニング＋案出し)を
> Opus 4.8 (high) に依頼する続きとして書いた。実装作業はまだ何もしていない
> ―― このセッションでやったのは「今どこまで済んでいるかの裏取り」のみ。

## 0. まず読む順番

1. `AGENTS.md`（安全ルール）
2. `docs/VERSION_TRUTH.md`
3. **本ファイル**（今の状態・何が残っているか）
4. 必要なら `docs/ai-tasks/GENRE-AWARE-EVENTS-EXCLUSION-LIST-002.md`（後述、設計の正本）

`docs/ai-tasks/GENRE-AWARE-EVENTS-AND-ECONOMY-PROFILE-001.md`（-001）は
**もう正本ではない**。読むなら「最初の調査はここから始まった」という経緯把握用のみにし、
設計判断は必ず -002 を正とすること（-001 のジャンル自動ゲート案は -002 で明示的に破棄された）。

## 1. 現在のバージョン正本

```powershell
cd C:\AI\text-adventure-vsce
git fetch origin
git rev-parse origin/main
node -p "require('./package.json').version"
```

このセッション時点（2026-07-14）で確認した値: `origin/main` = `8d03804`, version = `1.82.5`。
**この会話に埋め込んだ値も次のセッションでは古くなる可能性がある。上のコマンドで必ず実測すること。**

## 2. 何がもう終わっているか（裏取り済み）

`-001`（自分＝Claude Opus 4.8 が2026-07-14に書いた最初の設計調査）を読んだ別セッションの
Opus 4.8 が、**設計方針そのものを1回作り直した**うえで、実装がかなり進んでいる。

### 2.1 -001 のジャンル自動ゲート案は破棄された

理由（`-002` §1 より）: 「機械的にジャンル不可能なイベントは1つも無い」「ジャンル文字列からの
自動除外は誤除外を生む（ホラー世界の祭りが正当なケース等）」とユーザー判断で確定。

### 2.2 採用された方針（`-002`）: 「除外は人間/GMが決めて溜める deny-list」

- システムは自動でジャンル判定しない。既定は全イベントON。
- 世界ごとの `excludedEventIds: string[]`（namespaced id、例 `"domain:festival_gathering"`）を
  `game_rules`（Undo境界の外、`GameState`には入れない）に持ち、各roller が除外IDをスキップするだけ。
- 除外対象は**ランダム発生イベントのみ**。プレイヤーが選ぶ行動（domainの`festival`アクション等）は対象外。

### 2.3 完了 / 進行中の Slice

| Slice | 内容 | 状態 | コミット |
|---|---|---|---|
| A | `GameRules.economyProfile: 'easy'\|'normal'\|'harsh'`、`worldKitTickCore.ts`で`resolveEconomyProfileParams()`経由で経済ティックへ配線済み | ✅完了 | `b4166bc` |
| B1 | `worldSimCommerceCore.ts`のcommodityハードコード(`wheat`/`steel`)脱却、`CommodityDef.role`('staple'\|'material')方式に。roleタグ無しワールドはレガシーidフォールバックで無変更 | ✅完了 | `dde7cf5` |
| C1 | 除外リストの背骨（`toExcludedEventId`/`isExcludedEvent`、roller3箇所でスキップ） | ✅完了 | `c69a74c` |
| C2 | プレイ中「今後この世界から除外」チェックボックスUI＋配線 | ✅完了 | `8acada8` |
| C3 | ゲーム開始前のイベント種別ON/OFFトグルUI（`70-game-rules.js`付近、economyProfileと同じ並び） | ❌未着手 | — |
| C4 | 世界観構築時のGMによる緩い初期除外提案（Genesisフロー、LLM構造化出力） | ❌未着手 | — |

`-002` §7 の判断: **Opus 4.8 highが要ったのは§1〜§2のアーキテクチャ判断まで（完了）。C1〜C3は
機械実装で下位モデルでも十分。C4のプロンプト設計のみ軽い判断が要る。**

### 2.4 economyProfile の効果範囲（実装済み、まだ検証・体感調整はしていない）

`resolveEconomyProfileParams()`（`worldSimCommerceCore.ts`）が easy/normal/harsh を実パラメータに変換し、
`worldKitTickCore.ts:runLivingWorldTick()` → `tickMarketRecovery()` の経済ティックに反映される配線は
存在する。**ただし easy/normal/harsh 各値が「実際に遊んで妥当な強さか」は誰も検証していない** ——
ここがこのタスクの本題。

## 3. ここから先、Opus 4.8 に頼みたいこと（このユーザーの要望）

> 「ただターン経過させるだけでなく、色んな風に弄ってゲームバランス整えて欲しいし案も出して欲しい」

想定する進め方（前セッションで合意した「まず現状計測＋調整案提示」の続き）:

1. **現状計測（決定論・モデル非依存、下位モデルでも良い）**
   `node scripts/run_noai_soak.js --mode full --keep-temp` を、可能なら
   `economyProfile` 別（easy/normal/harsh）・シナリオ別に回し、`report.md` の
   money/cargo/market stock/price index/reject reasons を集める。
   既存シナリオ定義: `scripts/noai_soak_scenarios/*.json`（`noai_merchant_300`が
   `merchant_balanced`、`noai_market_shock_recovery`が`merchant_stress`のprofile例）。
   economyProfile軸のsoakシナリオがまだ無ければ、既存を複製してprofileだけ変えたものを追加するのが早い。
2. **診断**: 価格指数が張り付く/すぐ回復しすぎる、所持金が単調増加/枯渇する等、
   プロファイル間で「体感の強弱」に見合った数値差が出ているかをOpusが定性判断。
3. **調整案 + 実装**: `worldSimCommerceCore.ts`のプロファイル別パラメータ（回復速度・
   ショック強度・価格上限）を弄る、または新しいノブを提案。小さく切って都度再計測。
4. **並行してC3/C4も候補**（本題のバランス調整と独立して進めても良い）。

## 4. 安全メモ / 非ゴール（`-002`から継承）

- システムによる自動ジャンル判定は実装しない（確定事項、蒸し返さない）。
- 除外リストは`game_rules`（Undo境界の外）。`GameState`に入れない。
- 世界シム（`emergentSimulator.ts`）イベントはジャンル中立という設計思想。安易にtheme ゲートしない。
- 新規依存を足さない（`AGENTS.md`）。
- 物語・GM応答の"質"は引き続き度外視。決定論的な数値パラメータが対象。

## 5. モデル/運用メモ

- 現状計測（soak実行・数値集計）はモデル非依存なので、実際どのモデルで走らせても結果は同じ。
- 「この数値配分は面白いか/キツすぎるか」の定性判断とパラメータ設計判断がOpus 4.8 highに
  やらせたい部分。
- **重要**: エージェント自身は「今どのモデルとして動いているか」を確実に知る手段がない
  （`/model`表示はユーザー操作のログとしてのみ見える）。依頼したいモデルに実際切り替わっているか、
  新チャット開始時にユーザー側で確認してから本題に入ること。
