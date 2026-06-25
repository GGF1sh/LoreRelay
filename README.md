# LoreRelay - Local-first AI Game Master UI 🎲

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local-first AI Game Master UI**

既存のAIサブスクリプション（ChatGPT Plus, Claude Pro, Gemini Advancedなど）やローカルLLM（Ollama / KoboldCPP）をそのまま使って、テキストアドベンチャーをリッチUIで遊ぶためのVSCode拡張機能です。
ローカル実行可能なエージェントAI（Antigravity等）なら全自動でゲーム状態が反映され、通常のブラウザ版AIなら生成された状態（JSON）を手動でコピペするだけで手軽に遊べます。
**基本は追加の従量課金APIキー不要**です。Ollama / KoboldCPP / Grok CLI はローカルまたは既存サブスクで動き、**OpenRouter は任意のクラウド接続**（APIキー設定が必要）として使えます。

これはクローズドなAI RPGサービスではありません。あなた自身のAIアシスタント、ローカル画像生成、音源、シナリオを組み合わせて遊ぶための、**完全にオープンで改造可能な「Hacker Edition」のUIレイヤー**です。Saga & Seeker のような本格的なCRPG体験を、あなたが持つ環境で自由にハックして作り上げることができます。

> 💡 **Notice:** もしこの拡張機能が気に入ったら、ぜひ[コーヒーを一杯奢ってください！☕](https://ko-fi.com/YOUR_KOFI_LINK)

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

---

## 📸 Screenshots & Demo

<!-- 
💡 開発者へのヒント:
公開時は、ここに以下の要素が伝わるスクリーンショット（またはデモGIF）を配置してください。
1. CRPGライクなキャラクターシート（HP/MPバー、スキルバッジ）
2. Glassmorphism デザインのチャットUIとダイスローラー
3. ComfyUIでローカル自動生成された美麗な情景画像ギャラリー
-->

*(Screenshot placeholder - please add media here before release)*

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
コマンドパレットから `Text Adventure: Load Scenario Pack` を実行し、`scenario.json` を含むフォルダを選択すると、開始状態・テーマ・専用BGM/SEを読み込めます。

サンプルは GM スキル側の `TextAdventureGMSkill/scenarios/lost-catacombs/` にあります。

---

## 🗺️ Roadmap

- **Remote Play Mode:** 自宅PCをGMサーバーとして使い、LANまたはTailscale経由でスマホブラウザからプレイするモードを検討中です。初期スコープは `game_state.json` の表示、プレイヤー行動の送信、生成画像の閲覧に絞ります。インターネットへの直接公開は想定していません。

---

## 🤝 Contributing & Support
このプロジェクトは、AI時代の「新しいテキストアドベンチャーの遊び場」を目指す実験的OSSです。
バグ報告やプルリクエストは大歓迎です！

もしこのプロジェクトにワクワクしてくれたなら……
👉 **[Buy me a coffee ☕](https://ko-fi.com/YOUR_KOFI_LINK)**

---
**Enjoy your adventure!**
