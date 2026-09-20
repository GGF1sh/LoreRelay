# LoreRelay ユーザーガイド

初めて LoreRelay を使う人向けの**実用ガイド**です。開発者向けの詳細は [AI_HANDOVER.md](../AI_HANDOVER.md)、アーキテクチャ深掘りは [WORLD_AND_VISUAL_MEMORY.md](WORLD_AND_VISUAL_MEMORY.md) を参照してください。

---

## このガイドで分かること

| 章 | 内容 |
|----|------|
| [1. 3分で始める](#1-3分で始める) | インストール不要の最短ルート |
| [2. UI の見方](#2-ui-の見方) | タブごとに「何ができるか」 |
| [3. World System](#3-world-system) | 世界生成・シミュレーション・World タブ |
| [4. Cartography（地図）](#4-cartography地図) | 羊皮紙 / タイル / ComfyUI 連携 |
| [5. Visual Memory](#5-visual-memory-soulgaze) | 生成画像の記憶と GM への再注入 |
| [6. よくあるつまずき](#6-よくあるつまずき) | 初回プレイで多い症状 |

---

## 1. 3分で始める

### 最短ルート（お試しデモ）

1. 空フォルダを VS Code で開く
2. コマンドパレット → **`LoreRelay: Open Game UI`**
3. **Start Hub** → **🎮 お試しデモを始める**（同梱 `harbor-mist`）
4. 選択肢を1つ送る → GM ナレーションが表示されれば成功

30分コース: [FIRST_SESSION.md](FIRST_SESSION.md)

### GM との接続方式（どれか1つ）

| 方式 | 向いている人 | 設定 |
|------|-------------|------|
| **手動コピペ** | ブラウザ版 ChatGPT / Claude / Gemini | `SKILL.md` を AI に貼る |
| **Grok / Ollama / clipboard** | ローカル完結 | `textAdventure.gmBridge.provider` |
| **Antigravity** | ファイル自動書き込み | [ANTIGRAVITY_GUIDE.md](../ANTIGRAVITY_GUIDE.md) |
| **vscode-lm** | Copilot / Codex 等（VS Code LM） | モデル選択コマンドで確認 |

**正規データフロー:** GM は毎ターン **`turn_result.json`** を書く → 拡張が検証して **`game_state.json`** にマージ。

---

## 2. UI の見方

Game UI は上部タブで機能が分かれています。

| タブ | 主な用途 |
|------|----------|
| **Chat** | ナレーション・選択肢・自由入力・Start Hub |
| **Status** | HP/MP・所持品・現在地（`game_state.status`） |
| **Inspector** | ターンごとの dice / statePatch / 発火ロア |
| **World** | 地図（Mermaid / 羊皮紙 / タイル）、Forge 生成、派閥・クエスト |
| **Character** | 主人公・NPC カード・パーティ |
| **Lorebook** | ST 互換ワールド情報の閲覧・編集 |
| **Memory** | TF-IDF メモリ検索プレビュー |
| **Party** | Party Director ランタイム |
| **Scenario** | Scenario Director・エンディング進行 |

**ヘッダー右側のよく使うボタン**

- **🌐** — UI 言語（ja / en / zh-CN / zh-TW）
- **🔊** — TTS 有効化（[TTS_QUICKSTART.md](TTS_QUICKSTART.md)）
- **📢** — 直近 GM 文の読み上げ

---

## 3. World System

### 何ができるか

- **World Forge** — シード付きで地域・ロケーション・派閥・NPC を procedural 生成
- **Emergent Simulation** — N ターンごとに資源・危険度・派閥関係が自律更新
- **World タブ** — 関係図（Mermaid）、派閥ステータス、クエストボード

### 使い方（初めて）

1. **Game Rules**（歯車）→ **World Forge** を ON
2. **World** タブ → **Generate World**（テーマ・地域数を選んで生成）
3. 1〜3ターン進める → **World Changes** が GM プロンプトに注入される
4. **Inspector** で `statePatch` の `/world/...` を確認（許可されたパスのみ適用）

### ファイルの意味

| ファイル | 役割 |
|---------|------|
| `world_forge.json` | 静的な世界設計図（地域の x/y/biome 含む） |
| `world_state.json` | 動的状態（現在地、訪問済み、派閥資源、直近イベント） |
| `npc_registry.json` | NPC の記憶・ニーズ・関係 |

詳細: [WORLD_AND_VISUAL_MEMORY.md](WORLD_AND_VISUAL_MEMORY.md) §2

---

## 4. Cartography（地図）

Cartography は **任意機能** です。ComfyUI がなくても **レイアウト PNG + ピン** まで試せます。

### 3つの表示モード（World タブ）

| モード | 必要なもの | 見えるもの |
|--------|-----------|-----------|
| **Mermaid** | なし | 地域グラフ（関係の可視化） |
| **Parchment** | `world_map.layout.png`（または生成） | 羊皮紙風マップ + 📍 ピン |
| **Tile** | `world_forge.json` の x/y/biome | CDDA/DF 風 ASCII タイル（表示専用・GM に送らない） |

### 初めて地図を見る（3分・ComfyUI 不要）

1. Start Hub → **🗺️ 地図デモ**（または `Load Scenario Pack` → `lost-catacombs`）
2. **World** タブ → **Parchment**
3. 同梱 `world_map.layout.png` と地域ピンが表示される

### イラスト地図まで（上級・ComfyUI 必要）

1. ComfyUI を API モードで起動
2. `textAdventure.imageGen.comfyuiUrl` を設定
3. コマンド **`LoreRelay: Generate World Map Image`**
4. 生成後 **Parchment** で `world_map.png` を表示

手順の詳細: [CARTOGRAPHY_COMFYUI.md](CARTOGRAPHY_COMFYUI.md)  
LoRA・テーマ別プロンプト: [CARTOGRAPHY_RECOMMENDED_LORAS.md](CARTOGRAPHY_RECOMMENDED_LORAS.md)

### 現状の限界（Phase 7 時点）

- ピンは**表示**が中心（クリックで移動・詳細ポップアップは限定的）
- **Fog of War**（未探索の霧）は未実装
- 場所移動時の**自動背景生成**は `locationImageBuilder` 経由で可能だが、手動/設定依存

探索感を一段上げる設計ブリーフ: [CARTOGRAPHY_PHASE8_BRIEF.md](CARTOGRAPHY_PHASE8_BRIEF.md)

---

## 5. Visual Memory（Soulgaze）

### 何ができるか

ComfyUI 等で生成したシーン画像を **VLM** が分析し、`visual_memory.json` に蓄積。以降の GM プロンプトに情景コンテキストが自動注入されます。

### 使い方

1. `textAdventure.vlm.enabled` を ON
2. VLM プロバイダを設定（Ollama `llava` や OpenRouter 多模態）
3. シーン画像が生成されるとキューに入り、分析後に Memory へ追記
4. **Inspector** / プロンプトプレビューで Vision スニペットを確認

詳細: [WORLD_AND_VISUAL_MEMORY.md](WORLD_AND_VISUAL_MEMORY.md) §3

---

## 6. よくあるつまずき

| 症状 | 対処 |
|------|------|
| 初回ターンが表示されない | **Reload Window**。`turn_result.json` があれば自動マージ（v1.11.1+） |
| `Schema Violation` トースト | GM が `status.condition` 等を配列ではなく文字列で返した可能性 |
| 地図が真っ白 | `world_forge.json` に `x/y` があるか、Parchment モードか確認 |
| ComfyUI 接続エラー | URL・ポート・`--listen` を確認。`List Image Models` コマンドで疎通 |
| 翻訳が英語のまま | ヘッダー 🌐 で locale 変更、または `textAdventure.locale` |

---

## 次に読むドキュメント

| 目的 | ドキュメント |
|------|-------------|
| 30分初回プレイ | [FIRST_SESSION.md](FIRST_SESSION.md) |
| Antigravity 連携 | [ANTIGRAVITY_GUIDE.md](../ANTIGRAVITY_GUIDE.md) |
| GM ブリッジ設定 | [GM_BRIDGE_PRESETS.md](../GM_BRIDGE_PRESETS.md) |
| テスト・CI | [TESTING.md](../TESTING.md) |
| 開発引き継ぎ | [AI_HANDOVER.md](../AI_HANDOVER.md) |