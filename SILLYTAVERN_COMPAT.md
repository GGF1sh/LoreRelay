# SillyTavern 互換ガイド

LoreRelay は SillyTavern（ST）の **キャラクターカード** と **World Info / Lorebook** を取り込んで、構造化テキストアドベンチャーとして遊べます。

---

## 🚀 Quick Start for SillyTavern Users

SillyTavern を導入済みの方なら、以下の3ステップで環境を構築できます。

1. **拡張機能のインストール**
   配布パッケージ内の `install_vscode_extension.bat` をダブルクリックして、VSCode に LoreRelay をインストールします。
2. **キャラカード / ロアブックのインポート**
   VSCode で空のゲーム用フォルダを開き、`Ctrl+Shift+P` → **`Text Adventure: Import SillyTavern Character`** を実行します。お手持ちの ST 用 `.png` や `.json` を選択するだけで、即座に取り込まれます。
   （同様に **`Import SillyTavern Lorebook`** で世界観も取り込めます）
3. **ゲーム開始**
   コマンド **`Text Adventure: Open UI`** でゲーム画面を開き、あとは Antigravity 等の GM に指示を出すだけ。
   ※ 既存の API キー（OpenRouter等）を使う場合は、設定画面からキーを入力して手動コピペで遊ぶことも可能です。

---

## 取り込めるもの

| ST 資産 | 当プロジェクトでの扱い |
|:---|:---|
| キャラカード（`.png` / `.json`） | `characters/<id>.json`（Character Profile） |
| World Info / Lorebook | ワークスペース直下 `lorebook.json` |
| 立ち絵 PNG | `portrait` フィールド（カード PNG 自体を参照可） |

## キャラクターカードのインポート

### VSCode コマンド

`Ctrl+Shift+P` → **Text Adventure: Import SillyTavern Character**

`.json` または `.png`（embedded `chara`）を選ぶと `characters/` に保存されます。

### CLI

```bash
python TextAdventureGMSkill/scripts/import_st_card.py "path/to/card.png" \
  --out-dir ./my-adventure/characters --set-active
```

`Character Profile` タブで編集・Active 指定できます。GM プロンプトに自動注入されます。

## Lorebook（World Info）のインポート

### VSCode コマンド

**Text Adventure: Import SillyTavern Lorebook** → ST の `world_info.json` 等を選択 → `lorebook.json` をワークスペースに生成。

### CLI

```bash
python TextAdventureGMSkill/scripts/import_st_lorebook.py world_info.json --out lorebook.json
```

GM ブリッジはプレイヤー行動＋直近ナラティブに含まれる **キーワード** でエントリを自動マッチし、プロンプトに `[Lorebook — matched entries]` として付加します。

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

Active Character の portrait を `sprite.image` 省略時のフォールバックに使う場合は、GM が `sprite.name` のみ指定しても可（将来拡張）。

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