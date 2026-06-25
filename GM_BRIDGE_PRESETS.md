# GM Bridge プリセット

Webview の入力を GM に渡す方法（`textAdventure.gmBridge.provider`）と、各バックエンドの設定例です。

## 言語（i18n）

UI・エラー・GM プロンプトは `textAdventure.locale` で切り替え（`ja` / `en` / `zh-CN` / `zh-TW`）。Webview ヘッダーの 🌐 プルダウンからも変更できます。Ollama / KoboldCPP ブリッジは同じ locale でナラティブ言語を指定します。

## クイック設定（settings.json）

### Grok Build（デフォルト）

```json
{
  "textAdventure.gmBridge.provider": "grok",
  "textAdventure.grokBridge.enabled": true,
  "textAdventure.grokBridge.autoApprove": true
}
```

前提: `grok` CLI、`SKILL.md` がワークスペースまたは `~/.grok/skills/` にあること。  
Grok は `dice.py` 実行・`game_state.json` 書き込み・ComfyUI 画像生成までツール経由で自動処理します。

---

### Ollama（ローカル LLM）

```json
{
  "textAdventure.gmBridge.provider": "ollama",
  "textAdventure.gmBridge.ollama.url": "http://localhost:11434",
  "textAdventure.gmBridge.ollama.model": "llama3.2",
  "textAdventure.gmBridge.python": "python",
  "textAdventure.skillPath": "C:\\AI\\TextAdventureGMSkill\\scripts\\comfyui_generate.py"
}
```

**事前準備:**

1. [Ollama](https://ollama.com/) をインストール
2. ターミナルで `ollama serve`（常駐している場合は不要）
3. モデルを取得: `ollama pull llama3.2`（または好みのモデル）
4. モデル名を `gmBridge.ollama.model` に合わせる

**動作:** 拡張が `ollama_gm.py` を起動 → Ollama `/api/chat` → 応答を解析 → `game_state.json` を書き込み → Webview が自動更新。

**ダイス:** モデルが本文中に `{{DICE:1d20}}` を出力すると、スクリプトが `dice.py` で実際に振って置換します。

**制限:** ComfyUI 画像生成は自動では行いません（手動または別途 Grok 等を使用）。

---

### KoboldCPP（ローカル GGUF）

```json
{
  "textAdventure.gmBridge.provider": "koboldcpp",
  "textAdventure.gmBridge.koboldcpp.url": "http://127.0.0.1:5001",
  "textAdventure.gmBridge.python": "python",
  "textAdventure.skillPath": "C:\\AI\\TextAdventureGMSkill\\scripts\\comfyui_generate.py"
}
```

**事前準備:**

1. [KoboldCPP](https://github.com/LostRuins/koboldcpp) で `koboldcpp.exe` を起動（例: GUI からモデル読み込み）
2. API が有効なポートを確認（デフォルト `5001`）
3. `--url` が実際のポートと一致していること

**動作:** `koboldcpp_gm.py` → `/api/v1/generate` → `game_state.json` 更新。

**制限:** Ollama と同様。ツール実行・画像生成はブリッジ外。JSON 出力の安定性はモデル依存（ instruct 系 GGUF 推奨）。

---

### クリップボードのみ（Antigravity / ブラウザ AI 等）

```json
{
  "textAdventure.gmBridge.provider": "clipboard"
}
```

Webview の入力をクリップボードにコピー。お好みの AI チャットに貼り付け、GM が `game_state.json` を更新する運用向け。

**Antigravity ユーザー向け:** Webview で選択肢をクリック → クリップボードにコピー → Antigravity チャットに Ctrl+V → Antigravity が `game_state.json` を書き込む → Webview 自動更新。  
詳細は [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) を参照してください。

---

### カスタムコマンド

```json
{
  "textAdventure.gmBridge.provider": "command",
  "textAdventure.gmBridge.command": "C:\\path\\to\\my_gm_bridge.exe",
  "textAdventure.gmBridge.commandArgs": [
    "--cwd", "{cwd}",
    "--action", "{action}"
  ]
}
```

プレースホルダ: `{action}` = プレイヤー行動、`{cwd}` = ワークスペースルート。

Ollama / KoboldCPP 用 Python スクリプトを独自ラッパーから呼ぶ場合にも使えます。

---

## 比較

| Provider | 主な用途 | game_state 自動更新 | dice.py | ComfyUI 画像 |
|:---|:---|:---|:---|:---|
| `grok` | Grok Build（推奨） | ○（ツール） | ○ | ○ |
| `ollama` | ローカル LLM（Ollama） | ○（ブリッジ） | ○（`{{DICE:...}}`） | × |
| `koboldcpp` | ローカル GGUF（KoboldCPP） | ○（ブリッジ） | ○（`{{DICE:...}}`） | × |
| `clipboard` | Antigravity / ブラウザ AI | ×（手動ペースト） | AI 次第 | AI 次第 |
| `command` | Antigravity CLI / 独自 AI | AI 次第 | AI 次第 | AI 次第 |

## トラブルシュート

- **「ollama_gm.py が見つかりません」** → `textAdventure.skillPath` を `comfyui_generate.py` の絶対パスに設定
- **Ollama 接続エラー** → `ollama serve` と `ollama list` でモデル確認
- **KoboldCPP 接続エラー** → koboldcpp の「ポート」「Launch Browser/API」設定を確認
- **JSON が壊れる** → instruct 系モデルに変更、または `gmBridge.ollama.model` を大きめモデルに
- **ログ確認** → VSCode 出力パネル「Text Adventure: GM Bridge」