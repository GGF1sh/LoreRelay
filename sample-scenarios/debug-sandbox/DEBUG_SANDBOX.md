# Debug Sandbox — `debug-sandbox`

開発・検証用の同梱シナリオ。プレイヤーの自然言語が **決定論的デバッグコマンド** として解釈され、GM を呼ばずに状態が更新されます。

## 読み込み方

1. Start Hub の **🔧 デバッグサンドボックス**
2. `LoreRelay: Load Scenario Pack` → `sample-scenarios/debug-sandbox`

## Inspector デバッグコンソール

**Inspector** タブ上部に **Debug Console** が表示されます（サンドボックス読み込み時は VS Code 設定不要）。

- **世界シミュ N ステップ** — 従来のバルク進行
- **クイック挿入チップ** — チャット欄へコマンドを挿入（編集して送信）

## コマンド一覧

| カテゴリ | 例 |
|----------|-----|
| 一覧 | `ヘルプ` / `状態` |
| 信頼・好感 | `エルダの好感度を上げて` / `信頼を+20` / `信頼を80に` |
| ロマンス・恐怖 | `エルダのロマンスを+10` / `アレンの恐怖を下げて` |
| HP | `HPを全回復` / `HPを15に` / `HP+5` |
| 移動 | `エルダの店に移動` |
| 霧 | `地図の霧を晴らして` / `市場通りを発見` |
| 地図アイテム | `古い港の地図を入手` |
| **物語的時間** | `宿で休む`（+1ターン・HP回復） / `3日かけてエルダの店へ旅する` |
| 世界シミュのみ | `5ターン経過` |

認識できない発言は通常の GM ターンに回ります。

## 通常プレイでの時間経過（Layer B）

デバッグ以外では GM が `turn_result.elapsedWorldTurns` を返すと世界シミュが進みます（Emergent Simulation 要）。詳細: `docs/WORLD_TIME_PASSAGE_IDEA.md`

## 実装

- `src/debugScenarioCore.ts` — コマンド解析
- `src/narrativeTimePassageCore.ts` — 休息・旅
- `src/worldSimPersist.ts` — 世界シミュ永続化
- `meta.tags` に `"debug"` が必要