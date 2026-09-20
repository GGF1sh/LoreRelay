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

Grok は `dice.py` 実行・`turn_result.json` 書き込み・ComfyUI 画像生成までツール経由で自動処理します。

---

### VS Code Language Model API（Claude Code / Copilot 等）

月額サブスクの AI 拡張が VS Code 内に登録しているモデルを、**API キーなし**で GM に使うプロバイダです。右チャット欄の UI そのものとは連動しません（裏で `vscode.lm.selectChatModels()` → `sendRequest()` を呼び、応答は LoreRelay Webview と出力パネルに反映されます）。

```json
{
  "textAdventure.gmBridge.provider": "vscode-lm"
}
```

特定のモデルに絞る場合（いずれか・組み合わせ可。空欄 = 検出された最初のモデルを自動選択）:

```json
{
  "textAdventure.gmBridge.provider": "vscode-lm",
  "textAdventure.gmBridge.vscodeLm.vendor": "anthropic",
  "textAdventure.gmBridge.vscodeLm.family": "claude-sonnet-4",
  "textAdventure.gmBridge.vscodeLm.model": ""
}
```

| 使いたい AI | `vscodeLm.vendor` の目安 | 備考 |
|:---|:---|:---|
| Claude Code | `anthropic` | Claude Pro/Max で右チャットが使える状態が前提 |
| GitHub Copilot | `openai` または `github` | Copilot 拡張にサインイン済みであること |
| Codex / OpenAI ChatGPT 拡張 | `openai` | **`LoreRelay: List Available VS Code LM Models` に表示される場合のみ**。表示されない場合は下記の「Codex / ChatGPT 拡張をGMエージェントとして使う」を参照 |
| Gemini 系 | `google` | Google 系 AI 拡張が `vscode.lm` にモデルを登録している場合 |

**事前準備:**

1. 対象の AI 拡張を VS Code / Antigravity にインストールし、**右チャットで普通に使える状態**（サインイン済み）にする
2. コマンドパレット → **`LoreRelay: List Available VS Code LM Models`** を実行し、出力チャンネル「LoreRelay: LM Models」にモデルが列挙されることを確認
3. ワークスペースを信頼済み（Restricted Mode だと GM Bridge が動かない場合あり）

**動作フロー:**

```
[Webview] 選択肢クリック / 自由入力
    ↓ postMessage
[extension] vscode.lm → 選択モデルに GM プロンプト送信（ストリーム）
    ↓ 応答末尾の ```json ブロックを解析
[game_state.json] 直接マージ・書き込み
    ↓ FileSystemWatcher
[Webview] 自動更新
```

**`grok` / Antigravity+SKILL との違い（重要）:**

| 項目 | `vscode-lm` | `grok` / Antigravity+SKILL |
|:---|:---|:---|
| 正規出力 | `game_state.json` へ直接マージ | `turn_result.json`（Persist-Before-Narrate） |
| `dice.py` | ×（`{{DICE:1d20}}` マーカーの拡張内置換のみ） | ◎ ツール実行 |
| ComfyUI 画像 | × | ◎（Grok / SKILL 経由） |
| 右チャット欄に会話表示 | × | clipboard なら ○（手動ペースト） |
| 追加 API コスト | なし（各拡張の月額に含まれる） | なし |

**向いている人:** VS Code で Claude Code や Copilot の月額を既に使っており、手軽にテキストアドベンチャーを試したい。フルオート（ダイス・画像・`turn_result`）は `grok` または Antigravity の `clipboard` + `SKILL.md` を検討。

**Antigravity ユーザー向け:** Antigravity 右の GEMINI チャットと「連動」したい場合は本プロバイダではなく、下記 **クリップボード** モード + [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) を使ってください。

---

### Codex / OpenAI ChatGPT 拡張をGMエージェントとして使う

VSCode Marketplace の **Codex - OpenAI's coding agent** は VSCode 内で動作し、ローカルファイルを読んだり書いたりできます。ただし、これは必ずしも `vscode.lm` にモデルを公開するという意味ではありません。

`LoreRelay: List Available VS Code LM Models` に OpenAI / Codex / GPT 系モデルが出ない場合は、`textAdventure.gmBridge.provider = "vscode-lm"` ではなく、Codex/ChatGPT 拡張を LoreRelay の横で動く GM エージェントとして使ってください。

運用:

1. VSCodeでプレイ用ワークスペース（例: `C:\AITest`）を開く
2. `LoreRelay: Open Game UI` でWebviewを開く
3. Codex/ChatGPT 拡張のチャットに以下を渡す
4. プレイヤー行動ごとに、Codex/ChatGPT が `turn_result.json` を書き込む
5. LoreRelay が FileSystemWatcher で反映する

```text
C:\AITest をLoreRelayのプレイ用ワークスペースとして使います。
AI_HANDOVER.md と SKILL.md を読んで、LoreRelayのGMとして進行してください。
私の行動ごとに turn_result.json を Persist-Before-Narrate 方式で書き込んでください。
```

この方式は `clipboard` より手間が少なく、ブラウザ版 ChatGPT と違ってローカルファイルへ直接反映できます。一方で、LoreRelay が Codex をAPIとして直接呼ぶわけではないため、Webviewの送信ボタンから完全自動で Codex に投げる動作ではありません。

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

**動作:** 拡張が `ollama_gm.py` を起動 → Ollama `/api/chat` → 応答を解析 → `turn_result.json` / `game_state.json` を書き込み → Webview が自動更新。

**ダイス:** モデルが本文中に `{{DICE:1d20}}` を出力すると、スクリプトが `dice.py` で実際に振って置換します。

**制約:** ComfyUI 画像生成は自動では行いません（手動または別途 Grok 等を使用）。

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

**制約:** Ollama と同様。ツール実行・画像生成はブリッジ外。JSON 出力の安定性はモデル依存（instruct 系 GGUF 推奨）。

---

### クリップボードのみ（Antigravity / ブラウザ AI 等）

```json
{
  "textAdventure.gmBridge.provider": "clipboard"
}
```

Webview の入力をクリップボードにコピー。お好みの AI チャットに貼り付け、GM が `turn_result.json` を更新する運用向け。

**Antigravity ユーザー向け:** Webview で選択肢をクリック → クリップボードにコピー → Antigravity チャットに Ctrl+V → Antigravity が `turn_result.json` を書き込む → Webview 自動更新。

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

## 比較表

| Provider | 主な用途 | turn_result 自動更新 | dice.py | ComfyUI 画像 | 月額サブスクのみ |
|:---|:---|:---|:---|:---|:---|
| `grok` | Grok Build（フルオート推奨） | ○（ツール経由） | ◎ | ◎ | ○（Grok CLI） |
| `vscode-lm` | VS Code 内 AI 拡張（Claude/Copilot 等） | ○（`game_state` 書き込み後に合成） | △（マーカー置換のみ） | × | ○ |
| `clipboard` | Antigravity / ブラウザ AI | ×（手動ペースト） | AI 次第 | AI 次第 | ○ |
| `ollama` | ローカル LLM（Ollama） | ○（ブリッジ） | ○（`{{DICE:...}}`） | × | ○（ローカル無料） |
| `koboldcpp` | ローカル GGUF（KoboldCPP） | ○（ブリッジ） | ○（`{{DICE:...}}`） | × | ○（ローカル無料） |
| `command` | Antigravity CLI / 独自 AI | AI 次第 | AI 次第 | AI 次第 | ○ |
| `openrouter` | クラウド API（Claude/GPT/Gemini 等） | ○（ブリッジ） | ○（`{{DICE:...}}`） | × | ×（API キー必要） |

---

## トラブルシューティング

- **「vscode-lm: AI モデルが見つかりません」** → Copilot / Claude Code 等をインストール・サインイン後、`LoreRelay: List Available VS Code LM Models` で一覧確認。`vscodeLm.vendor` が実際の vendor と一致するか調整
- **Codex / OpenAI ChatGPT 拡張はVSCode上で動いているのに `vscode-lm` に出ない** → その拡張が `vscode.lm` にモデルを公開していない状態です。上記の「Codex / OpenAI ChatGPT 拡張をGMエージェントとして使う」方式で、`turn_result.json` を直接書き込ませてください
- **vscode-lm で応答はあるが UI が更新されない** → 出力パネル「Text Adventure: GM Bridge」でストリーム末尾に ` ```json ` ブロックがあるか確認。無いと `game_state.json` へのマージが不完全になる場合あり
- **「ollama_gm.py が見つかりません」** → `textAdventure.skillPath` または `comfyui_generate.py` の絶対パスに設定
- **Ollama 接続エラー** → `ollama serve` と `ollama list` でモデル確認
- **KoboldCPP 接続エラー** → koboldcpp の「ポート」「Launch Browser/API」設定を確認
- **JSON が壊れる** → instruct 系モデルに変更、または `gmBridge.ollama.model` を大きめモデルに
- **ログ確認** → VSCode 出力パネル「Text Adventure: GM Bridge」（vscode-lm のストリームもここに出る）
