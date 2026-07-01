# LoreRelay — First Session Guide (約30分)

空のワークスペースで **初回30分** を確実に遊ぶための手順です。

## 0. 準備（5分）

1. VS Code / Antigravity でプレイ用フォルダを開く（空で OK）
2. `TextAdventureGMSkill` を `textAdventure.skillPath` に設定（または同梱スキルを配置）
3. GM Bridge を1つ選ぶ（推奨順）
   - **手動コピペ** — 設定不要、SKILL.md をブラウザ AI に貼る
   - **Grok / Ollama / clipboard** — ローカル完結
   - **OpenRouter** — API キーが必要
4. `LoreRelay: Open Game UI` を開く

## 1. Start Hub → お試しデモ（3分）

チャットが空のとき **Start Hub** が表示されます。

1. **🎮 お試しデモを始める** をクリック
   - 同梱シナリオ `harbor-mist`（港町の霧）が読み込まれます
   - 設定やフォルダ選択は不要
2. 冒頭ナレーションと **3つの選択肢** が表示されたら成功
3. 選択肢を1つクリック、または下部の自由入力で行動を送る

> GM が応答しない場合: AI に `SKILL.md` と `scenario.json` を読ませ、`turn_result.json` を書くよう指示してください（[README](../README.md) Mode A/B 参照）。

## 2. 最初の3ターン（10分）

| ターン | やること | 確認ポイント |
|--------|----------|--------------|
| 1 | 選択肢または自由入力で行動 | GM ナレーションがチャットに追加される |
| 2 | 📍 Location が Status に更新されるか見る | `game_state.json` が壊れていない |
| 3 | **Inspector** タブを開く | ダイス台帳 / statePatch が見える |

オプション:

- **🔊 TTS** を有効化 → 📢 で読み上げ（[TTS_QUICKSTART.md](TTS_QUICKSTART.md)）
- **Character** タブ — Start Hub の「質問しながら作る」や Quickstart 後、主人公を **キャラクタープロフィールへ自動登録**（確認ダイアログあり）→ パーティに Join 済み

## 3. 世界を広げる（10分・任意）

### 地図デモ（上級）

Start Hub の **🗺️ 地図デモ** または `Load Scenario Pack` → `sample-scenarios/lost-catacombs`

1. **World** タブ → **Parchment** で `world_map.layout.png` とピン
2. Game Rules → **World Forge** ON
3. 1ターン進めて World Change Summary を確認

### 自分の世界を作る

Start Hub から:

- **🚀 ざっと作る** — 一文から世界生成（Quickstart）
- **💬 質問しながら作る** — 入力欄に GM への質問テンプレートを挿入

## 4. 困ったとき

| 症状 | 対処 |
|------|------|
| 初回ターンが表示されない | ウィンドウを Reload。`turn_result.json` があれば自動マージ（v1.11.1+） |
| ボタンを押しても何も起きない | v1.11.1+ で confirm 系は修正済み。拡張を再インストールして Reload |
| `Schema Violation` トースト | GM が `status.condition` 等を配列ではなく文字列で返した可能性（v1.11.2+ で緩和） |
| 二重送信 | 送信直後に入力がロックされる（v1.11.1+） |

## 5. 次のステップ

- [TTS_QUICKSTART.md](TTS_QUICKSTART.md) — 音声は段階的に
- [DEMO.md](../DEMO.md) — 録画・スクショ用フロー
- [testing_checklist.md](../testing_checklist.md) — リリース前手動確認