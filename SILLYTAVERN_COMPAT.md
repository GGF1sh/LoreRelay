# SillyTavern 互換ガイド

LoreRelay は SillyTavern（ST）の **キャラクターカード** と **World Info / Lorebook** を取り込んで、構造化テキストアドベンチャーとして遊べます。

---

## Quick Start for SillyTavern Users

SillyTavern を導入済みの方なら、以下の 3 ステップで環境を構築できます。

1. **拡張機能のインストール**
   配布パッケージ内の `install_vscode_extension.bat` をダブルクリックして、VSCode に LoreRelay をインストールします。
2. **キャラカード / ロアブックのインポート**
   VSCode で空のゲーム用フォルダを開き、`Ctrl+Shift+P` → **`LoreRelay: Import SillyTavern Character`** を実行します。お手持ちの ST 用 `.png` や `.json` を選択するだけで、即座に取り込まれます。
   （同様に **`Import SillyTavern Lorebook`** で世界観も取り込めます。）
3. **ゲーム開始**
   コマンド **`LoreRelay: Open UI`** でゲーム画面を開き、あとは Antigravity 等の GM に指示を渡すだけ。
   ※ 既存の API キー（OpenRouter 等）を使う場合は、設定画面からキーを入力して手動コピペで遊ぶことも可能です。

---

## 取り込めるもの

| ST 資産 | 当プロジェクトでの扱い |
|:---|:---|
| キャラカード（`.png` / `.json`） | `characters/<id>.json`（Character Profile） |
| World Info / Lorebook | ワークスペース直下 `lorebook.json` |
| 立ち絵 PNG | `portrait` フィールド（カード PNG 自体を参照可） |

## 今後取り込むと強い ST 由来の機能候補

SillyTavern の設定量をそのまま移植するより、LoreRelay では「ローカル GM 環境で遊びやすくする薄いレイヤー」として取り込む方針が合います。

| ST 機能 | LoreRelay での落とし込み | 優先度 | 状態 |
|:---|:---|:---|:---|
| Connection Profile | Ollama / KoboldCPP / OpenRouter / Grok Build などの接続先を名前付きプリセット化 | 高 | 一部（settings.json） |
| Text Completion Preset | temperature / top_p / repetition penalty / max tokens などをモデル別プリセットとして保存 | 高 | 計画中 |
| Prompt / Instruct Template | ChatML などのテンプレートを GM ブリッジ単位で切り替え | 中 | 計画中 |
| Quick Reply | 入力欄上の横スクロールバー（Undo/Retry/Checkpoint/Summary/Gen Image/Load Pack/Archive） | — | **実装済み v0.3.0** |
| World Info / Lorebook | import 拡張、優先度・有効/無効・キーワード一致ログを UI で確認 | 高 | **実装済み（Phase 2B+）** |
| Background Gallery | `backgrounds/` の画像ギャラリー、チャット用/グローバル用の背景切り替え | 中 | 計画中 |
| Persona / Character Override | プレイヤー人格、GM 口調、シナリオ補足をプロファイルとして保存 | 中 | 計画中 |
| ComfyUI Live Settings | Webview 🎨 パネル + ワークスペース `image_gen_config.json` | — | **実装済み v0.3.1** |
| Image Prompt Template | キャラ/シーン/背景/直近発言別の画像プロンプトテンプレート | 高 | 一部 |
| Message Action Bar | Copy / Speak / Gen Image / Checkpoint / Exclude / Branch / Edit | — | **実装済み v0.3.0** |
| Summarize | 章要約・現在概要、直近ログ要約を分けて管理 | 高 | 一部 |
| Vector Storage | Lorebook と履歴の検索補助。ローカル埋め込みが使える場合だけ任意機能化 | 低 | Memory Bank あり |
| TTS / STT Preset | 音声、速度、読み上げ対象をプリセット化 | 中 | Web Speech API あり |

公開リポジトリでは、個人向けデータや個別嗜好の中身は含めず、保存先・インポート形式・ローカル分割の仕組みだけを提供します。

## キャラクターカードのインポート

### VSCode コマンド

`Ctrl+Shift+P` → **LoreRelay: Import SillyTavern Character**

`.json` または `.png`（Embedded `chara`）を選ぶと `characters/` に保存されます。

### CLI

```bash
python TextAdventureGMSkill/scripts/import_st_card.py "path/to/card.png" \
  --out-dir ./my-adventure/characters --set-active
```

`Character Profile` タブで編集・Active 指定できます。GM プロンプトに自動注入されます。

## Lorebook（World Info）のインポート

### VSCode コマンド

**LoreRelay: Import SillyTavern Lorebook** → ST の `world_info.json` 等を選択 → `lorebook.json` をワークスペースに生成。

### CLI

```bash
python TextAdventureGMSkill/scripts/import_st_lorebook.py world_info.json --out lorebook.json
```

GM ブリッジはプレイヤー行動・直近ナラティブに含まれる **キーワード** でエントリを自動マッチし、プロンプトに `[Lorebook — matched entries]` として付加します。

手動確認:

```bash
python TextAdventureGMSkill/scripts/resolve_lorebook.py --cwd . --text "酒場で戦闘"
```

## VN 演出（game_state.json）

GM が毎ターン指定可能:

```json
{
  "background": "C:\\path\\to\\tavern.png",
  "sprite": {
    "name": "Alice",
    "image": "C:\\path\\to\\alice_happy.png",
    "expression": "happy",
    "position": "center"
  }
}
```

- `background` — 全画面背景（テーマグラデーションの上に表示）
- `sprite` — 立ち絵レイヤー（Character Profile の portrait パスも可）

Active Character の portrait を `sprite.image` 省略時のフォールバックに使う場合、GM が `sprite.name` のみ指定しても可（将来拡張）。

## シナリオパックとの併用

```
my-scenario/
  scenario.json
  lorebook.json      # このシナリオ専用 World Info
  characters/        # 主要 NPC カードを import 済み
```

`Load Scenario Pack` 後に `lorebook.json` をパックに含めておくと、GM がキーワードで世界観を引けます。

## R-18 コンテンツ

公開リポジトリには載せず、**別 ZIP / 別フォルダ**（`scenarios-r18/` 等）で配布してください。協業 AI 向けドキュメントからは除外します。

## 対応フォーマット

- ST Character Card v2（`tEXt` / `chara` base64 PNG、JSON `spec: chara_card_v2`）
- ST World Info（`entries` オブジェクト形式）
- 当プロジェクト形式 `text-adventure-lorebook/1.0`

未対応（将来）: V3 専用フィールドの完全互換、ST 拡張機能スクリプトの直接実行、Swipe 分岐。