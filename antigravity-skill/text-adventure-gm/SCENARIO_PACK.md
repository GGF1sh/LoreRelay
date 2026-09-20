# Scenario Pack Format (`text-adventure-scenario/1.0`)

シナリオパックは、特定の冒険を**ワンクリックで開始**できる自己完結したフォルダです。
「本体無料 + シナリオ課金」モデル（Booth / Gumroad 等での配布・販売）の単位にもなります。

## フォルダ構成

```
my-scenario/
  scenario.json      # 必須: メタ情報 + GMセットアップ + 開始シーン
  cover.png          # 任意: サムネイル画像
  bgm.json + bgm/    # 任意: このシナリオ専用のBGM
  sfx.json + sfx/    # 任意: このシナリオ専用のSE
  SKILL.addon.md     # 任意: このシナリオ固有の追加GMルール
```

`scenario.json` だけでも成立します。BGM/SE/追加ルールは付けたいときだけ。

## `scenario.json` スキーマ

| フィールド | 必須 | 説明 |
|-----------|:---:|------|
| `format` | ✓ | `"text-adventure-scenario/1.0"` 固定 |
| `meta.title` | ✓ | シナリオ名 |
| `meta.author` | | 作者名 |
| `meta.version` | | パックのバージョン |
| `meta.description` | | 紹介文（ストア掲載用） |
| `meta.cover` | | サムネイル画像のファイル名 |
| `meta.tags` | | 検索用タグ（配列） |
| `setup.world` | ✓ | 世界観・舞台設定（GMへの指示） |
| `setup.protagonist` | ✓ | 主人公の設定（職業・装備・目的） |
| `setup.tone` | ✓ | トーン（硬派／コミカル等） |
| `setup.imageMode` | | 画像生成モード（pony/illustrious/natural/standard） |
| `setup.theme` | | UIテーマ（fantasy/cyberpunk/scifi/ff14/postapoc/modern） |
| `setup.rules` | | このシナリオ固有のルール（HP上限・判定方針など） |
| `opening.narrative` | ✓ | 開始シーンの情景描写（最初のGMメッセージ） |
| `opening.status` | | 開始ステータス（location/time/condition/funds） |
| `opening.options` | | 開始時の選択肢（配列） |
| `opening.bgm` | | 開始時のBGMトラックID |
| `opening.sfx` | | 開始時のSE ID |

## 2つの使われ方

### 1. VSCode から読み込む（プレイヤー視点）
コマンド **「Text Adventure: Load Scenario Pack」** を実行 → パックのフォルダを選択すると:
- `opening` から `game_state.json` を生成し、開始シーンが UI に表示される
- `setup.theme` が UI テーマに適用される
- パックに `bgm.json` / `sfx.json` があれば、その場で音源設定が切り替わる
- パックの `scenario.json` がワークスペース直下にコピーされ、GM が参照できる

### 2. GM（AI）が読み込む（進行視点）
ワークスペースに `scenario.json` がある場合、GM は開始時の質問をスキップし、
`setup` の内容（世界観・主人公・トーン・ルール）に従ってゲームを進行します。
（`SKILL.md` の「ゲームの開始手順」を参照）

## ゲームオーバールール（任意 `setup.gameOver`）

DREAMIO 風の終了判定をシナリオごとに指定できます。

```json
"setup": {
  "gameOver": {
    "mode": "strict",
    "onHpZero": true,
    "allowImpossibleActions": false
  }
}
```

詳細は `SKILL.md` の「ゲームオーバー」節を参照。

## Workshop 配布

ZIP 配布・ストア掲載用メタデータは [`SCENARIO_WORKSHOP.md`](SCENARIO_WORKSHOP.md) を参照。
VSCode コマンド **Export Scenario Pack (Workshop ZIP)** で `workshop.json` 付き ZIP を生成できます。

## 配布のヒント

- フォルダごと zip にして配布できます（Workshop 形式推奨）。
- `bgm/` `sfx/` に音源を同梱する場合はライセンスに注意（CC0 推奨）。同梱の合成SEは自由に再配布可能です。
- 画像生成は受け手の ComfyUI 環境に依存するため、`setup.imageMode` と推奨チェックポイントを `meta.description` に明記すると親切です。

## サンプル（v1.0 — 3本）

| フォルダ | タイトル | テーマ |
|---------|---------|--------|
| `scenarios/lost-catacombs/` | 忘れられた地下聖堂 | fantasy |
| `scenarios/neon-rain/` | Neon Rain — Missing Synapse | cyberpunk |
| `scenarios/harbor-mist/` | 港町の霧 — 灯台の手紙 | modern |

拡張機能リポジトリにも同梱: `text-adventure-vsce/sample-scenarios/`。
そのまま **LoreRelay: Load Scenario Pack** で読み込めます。
