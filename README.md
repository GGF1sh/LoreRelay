# LoreRelay - Local-first AI Game Master UI 🎲

[English](README_en.md) | [日本語](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local-first AI Game Master UI**

**Antigravity（無料）× LoreRelay × ComfyUI——APIキー不要・追加コストゼロで、フロンティアモデルがGMを務めるフルオートRPG環境。**

既存のAIサブスクリプションを最大限活用し、SillyTavernのようなバックエンドの自由度と、Saga & Seekerのような本格的なCRPG体験を統合したVSCode拡張機能です。
手動のコピペ（またはローカルエージェントによる自動化）でJSONを受け渡し、あなた自身の環境を自由にハックして遊べる「Hacker Edition」のUIレイヤーを提供します。

> 💡 **Notice:** もしこの拡張機能が気に入ったら、ぜひ[コーヒーを一杯奢ってください！☕](https://ko-fi.com/promptpalette)

---

## 🌟 Features

- 💸 **No Extra API Costs (by default):** ローカルLLM・Grok CLI・手動コピペ運用なら従量課金APIキーは不要。OpenRouter を使う場合のみ API キーが必要です。
- 🧩 **Agent Bridge:** Grok Build などのローカル実行可能AIなら、Webviewの選択肢・自由入力をそのままGMに送信できます。
- 🎨 **Glassmorphism UI:** 半透明のチャットUI、世界観テーマ切り替え、画像ギャラリーを備えたリッチな表示装置。
- ⚔️ **CRPG Character Sheet:** Saga & Seeker 等にインスパイアされた、HP/MPプログレスバー、スキル、インベントリを視覚的に管理できるステータスパネル。
- 🖼️ **Local Image Generation:** ComfyUIと連携し、AIが描写した情景をその場でローカル生成してギャラリーに表示。
- 🎵 **Adaptive BGM & SFX:** `bgm.json` / `sfx.json` に登録した音源を、GMが自動制御し、クロスフェード再生します。
- 📦 **Scenario Packs:** `scenario.json` を含むフォルダを読み込むだけで、開始シーン・テーマ・専用BGM/SEをまとめて適用できます。
- 🎲 **Built-in Dice Roller & Calculator:** TRPGライクな判定に必須のダイスロール（NdX）と数式電卓を内蔵。
- 💾 **Persistent Adventure Log:** `game_history.json` に冒険ログを保存し、VSCode再起動後も履歴を復元できます。
- 🔍 **Turn Inspector (v0.5+):** ダイス台帳・statePatch・発火ロアをターンごとに可視化。
- 📖 **Lorebook & Memory UI:** ST互換ロアブックの閲覧/編集、Memory 検索プレビュー、ピン留め常時注入。
- 🎬 **Scenario & Party Director:** `scenario.json` / `party_director.json` と `game_state` ランタイム連動。
- 📱 **Remote Play (v0.7):** LAN 参加用 QR、player / spectator ロール。
- 🌍 **Living World System (v1.3+):** `world_forge.json` に基づく動的な地域・派閥・NPC自動生成機能（World Forge）。Mermaid.jsによる動的ネットワーク図を備えたWorldタブを搭載。
- ⚙️ **Emergent Simulation:** 毎ターンの経過に伴い、資源消費・パワーバランス・NPCの好感度や恐怖が自動計算・進行する自律シミュレーターを内蔵。

---

## 📸 Screenshots & Demo

<p align="center">
  <img src="docs/assets/hero-ui.svg" alt="LoreRelay main UI" width="720" />
</p>

| Inspector | Remote Play | Party Director |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-inspector.svg" width="240" alt="Turn Inspector" /> | <img src="docs/assets/screenshot-remote-play.svg" width="240" alt="Remote Play" /> | <img src="docs/assets/screenshot-party-director.svg" width="240" alt="Party Director" /> |

| Lorebook | ComfyUI |
|:---:|:---:|
| <img src="docs/assets/screenshot-lorebook.svg" width="360" alt="Lorebook editor" /> | <img src="docs/assets/screenshot-comfyui.svg" width="360" alt="ComfyUI scene generation" /> |

実機のスクショやデモ GIF に差し替える手順は [`DEMO.md`](DEMO.md) を参照してください。

---

## 🚀 How to Play

この拡張機能は、AIが書き出す `game_state.json` を監視してUIをレンダリングする疎結合な仕組みを採用しています。あなたの環境に合わせて2通りの遊び方があります。

### Mode A: 自動連携モード (Recommended)
**対象:** Antigravity, Grok CLI, VSCode Copilot (Cursor) などの**ローカルファイル書き込みが可能なエージェントAI**を使っている場合。

1. AIに同梱の `SKILL.md` を読み込ませ、「このスキルに従ってゲームマスターを開始して」と指示します。
2. 以降、あなたはAIとチャットするだけです。AIが自動でダイスを振り、ComfyUIで画像を生成し、`game_state.json` を更新します。
3. VSCode上でこの拡張機能を開いておけば、UIがリアルタイムに更新されます！

> **Antigravity をお使いの方:** Webviewの選択肢クリック → クリップボードへコピー → Antigravityチャットに貼り付け → 自動更新、という手軽な運用が可能です。詳細は [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) を参照してください。

### Mode B: 手動コピペモード
**対象:** 通常のブラウザ版 ChatGPT, Claude, Gemini を使っている場合。

1. ブラウザのAIに `SKILL.md` のテキストをコピペし、「この指示に従ってGMをして」と伝えます。
2. AIが返してくるJSONコードブロックをコピーし、VSCode上の `game_state.json` に手動で上書き保存します。
3. 保存した瞬間にVSCodeのUIが切り替わります。（画像生成やダイスロールは手動で行うか、ブラウザAIの機能で代用してください）

---

## 🛠️ Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+)
- **Python** (画像生成・ダイス用スクリプトの実行に必要)
- **ComfyUI** (ローカルで画像を生成する場合。APIモード起動が必要)

### 2. Quick setup (recommended)

`TextAdventureGMSkill` を `text-adventure-vsce` の隣（例: `C:\AI\` 配下）に置いた状態で:

**Windows (PowerShell):**
```powershell
cd text-adventure-vsce
.\scripts\setup.ps1
```

**macOS / Linux:**
```bash
cd text-adventure-vsce
chmod +x scripts/setup.sh
./scripts/setup.sh
```

スクリプトが行うこと:
- GM スキルパス自動検出 → `my-adventure/.vscode/settings.json` 生成
- `npm install` / `compile` / `test`
- （任意）VSIX パッケージ → `code --install-extension`
- `text-adventure.code-workspace` 生成（Game + Skill + Extension の 3 ルート）

オプション例: `-Locale en` `-GmProvider clipboard` `-SkipVsix`

### 3. Manual extension installation
1. このリポジトリをクローンまたはダウンロードします。
2. VSCodeでフォルダを開き、ターミナルで `npm install` を実行します。
3. `F5` キーを押して、拡張機能をデバッグ起動するか、`npx @vscode/vsce package` で VSIX をインストールします。
4. コマンドパレット (`Ctrl+Shift+P`) から `Text Adventure: Open Game UI` を実行するとパネルが開きます。

### 4. Configuration
VSCodeの設定画面（Settings）から `textAdventure.skillPath` を検索し、同梱の `comfyui_generate.py` スクリプトの絶対パスを指定してください。

主な設定:

- `textAdventure.skillPath` — `comfyui_generate.py` の絶対パス
- `textAdventure.locale` — UI / エラー / GM プロンプトの言語（`ja` / `en` / `zh-CN` / `zh-TW`）。Webview ヘッダーの 🌐 からも変更可
- `textAdventure.gmBridge.provider` — `grok` / `ollama` / `koboldcpp` / `clipboard` / `command`（詳細は `GM_BRIDGE_PRESETS.md`）
- `textAdventure.grokBridge.*` — Grok Build 自動送信の有効化、CLIパス、フォールバック設定
- `textAdventure.imageGen.*` — ComfyUI / Stability Matrix のURL、checkpoint、workflow、生成サイズ
- `textAdventure.bgm.*` — BGMマニフェストと音量
- `textAdventure.sfx.*` — SEマニフェストと音量

### 5. Scenario Packs
コマンドパレットから `LoreRelay: Load Scenario Pack` を実行し、`scenario.json` を含むフォルダを選択すると、開始状態・テーマ・専用BGM/SEを読み込めます。

**同梱サンプル（3本）** — 拡張リポジトリの `sample-scenarios/`:

| フォルダ | ジャンル | テーマ |
|---------|---------|--------|
| `lost-catacombs` | 王道ダンジョン探索 | fantasy |
| `neon-rain` | サイバーパンク・ノワール | cyberpunk |
| `harbor-mist` | 港町ミステリー | modern |

GM スキル側にも同じパックがあります: `TextAdventureGMSkill/scenarios/`。

### 6. Model & ComfyUI presets (v1.0)
- 推奨 GM / 画像設定: [`MODEL_PRESETS.md`](MODEL_PRESETS.md)（`presets/` の JSON をコピー）
- ComfyUI ワークフロー: [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md)（`comfyui/workflow_api.json` / `workflow_sdxl_1024.json`）

---

## 🗺️ Roadmap

v1.3 までの主要機能（World System, NPC Registry, Emergent Simulation, VLM 統合準備など）は実装済みです。今後は VLM 完全統合による自律的な情景認識や、NPC内面のさらなる連動機能などを検討しています。

---

## 🤝 Contributing & Support
このプロジェクトは、AI時代の「新しいテキストアドベンチャーの遊び場」を目指す実験的OSSです。
バグ報告やプルリクエストは大歓迎です！

もしこのプロジェクトにワクワクしてくれたなら……
👉 **[Buy me a coffee ☕](https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
