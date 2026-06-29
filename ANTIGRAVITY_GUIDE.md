# Antigravity 連携ガイド

Antigravity（ローカル実行可能なエージェント AI）を GM として使うための設定ガイドです。

Antigravity はファイル書き込みと Python コマンド実行が可能なため、**ゲームの全処理（ダイス・画像生成・turn_result.json 出力）を自動化**できます。

---

## 1 分でわかるフルオート連携の仕組み（The Magic）

LoreRelay は、Antigravity（Gemini）と VSCode の Webview を **`turn_result.json` / `game_state.json` のファイル監視（FileSystemWatcher）** だけで疎結合に繋いでいます。

1. **Antigravity の思考と行動:** GM スキルを読み込んだ Antigravity が、状況を判定して `turn_result.json` を書き込みます（正規フロー）。拡張が `statePatch` をマージして `game_state.json` を更新します。
2. **VSCode の即時反映:** VSCode 拡張が変更を約 0.3 秒で検知し、Webview（リッチ UI）に `postMessage` で即座に変更を流し込みます。
3. **画像と音の自動生成:** Antigravity が状況に合わせて ComfyUI の生成コマンドを叩くと、生成された画像パスが JSON に追加され、UI 上に情景画像が表示されます。

WebSocket サーバーも、複雑な API 連携も不要。**「AI が JSON を書き込むだけで、ネイティブゲームのような UI が動く」** のがこのアーキテクチャの強みです。

> **レガシー:** `game_state.json` への直接書き込みも動作しますが、`turn_result.json`（Persist-Before-Narrate）が正規フローです。

---

## インストール手順

Antigravity 用の GM スキルは、同梱のバッチファイルでワンクリック導入できます。

1. 配布パッケージ内の `install_antigravity_skill.bat` をダブルクリックします。
2. `skills\text-adventure-gm` または隣接する `TextAdventureGMSkill` から、`%USERPROFILE%\.gemini\config\skills\text-adventure-gm` へ `SKILL.md` と `scripts\` がコピーされます。
3. Antigravity を再起動すると、スキルが認識されます。

---

## どの連携モードを使うか

| モード | 向いている人 | 自動化度 |
|--------|-------------|---------|
| **Mode 1: クリップボード** | 手軽に試したい | 低（Ctrl+V で貼り付け） |
| **Mode 2: コマンドライン** | Antigravity CLI がある | 高（入力を自動送信） |

---

## Mode 1: クリップボード連携（最も手軽）

### 設定（VSCode settings.json）

```json
{
  "textAdventure.gmBridge.provider": "clipboard",
  "textAdventure.grokBridge.fallbackToClipboard": true
}
```

### 手順

1. VSCode でゲームワークスペースを開く（`game_state.json` を置くフォルダ）。
2. コマンドパレット (`Ctrl+Shift+P`) から `LoreRelay: Open Game UI` を実行。
3. Antigravity のチャット欄に `SKILL.md` の内容を読み込ませる:
   ```
   以下のスキル指示を読んで、テキストアドベンチャーの GM を開始してください。
   [SKILL.md の内容をここにコピー]
   ```
4. Antigravity が「ゲームを開始します」と答えたら準備完了。
5. Webview で選択肢をクリックするか自由入力すると、テキストが**クリップボードにコピー**される。
6. Antigravity のチャット欄に **Ctrl+V** でペーストして送信。
7. Antigravity がダイスを振り、必要なら画像を生成し、`turn_result.json` を書き込む。
8. Webview が自動更新される。

### SKILL.md の場所

```
C:\AI\TextAdventureGMSkill\SKILL.md
```

シナリオパックを使う場合は、ワークスペースに `scenario.json` を置いてから Antigravity に指示してください。

---

## Mode 2: コマンドライン連携（半自動）

Antigravity に CLI / ヘッドレス実行モードがある場合、Webview の入力を**自動で Antigravity に送信**できます。

### 設定（VSCode settings.json）

```json
{
  "textAdventure.gmBridge.provider": "command",
  "textAdventure.gmBridge.command": "antigravity",
  "textAdventure.gmBridge.commandArgs": [
    "--prompt", "{action}",
    "--cwd", "{cwd}",
    "--yolo"
  ]
}
```

> **注意:** `command` / `commandArgs` は Antigravity の実際の CLI に合わせてください。
>
> `{action}` = プレイヤーの入力テキスト、`{cwd}` = ワークスペースルートのパス。

### 動作フロー（半自動）

```
[Webview] 選択肢クリック / 自由入力
    ↓ postMessage
[extension.ts] antigravity --prompt "プレイヤーの行動: ..." --cwd <workspace>
    ↓ ファイル書き込み (dice.py / comfyui_generate.py 経由)
[turn_result.json] → [game_state.json]
    ↓ FileSystemWatcher
[Webview] 自動更新
```

---

## スキルのセットアップ

Antigravity がツール実行（`run_command`）に対応している場合、SKILL.md をそのまま読み込めます。

| 方法 | 手順 |
|:---|:---|
| システムプロンプトとして渡す | チャット開始時に SKILL.md の内容をコピー |
| スキルファイルとして登録 | Antigravity のスキルフォルダに `text-adventure-gm` として配置 |
| ワークスペース参照 | ワークスペースに SKILL.md を置き、「このファイルを読んで GM を開始して」と指示 |

---

## ダイスロールと画像生成

Antigravity がコマンド実行できる場合、SKILL.md の指示どおりに自動で実行されます。

| 機能 | スクリプト | 動作 |
|:---|:---|:---|
| ダイスロール | `python dice.py 1d20` | 結果をナラティブに使用 |
| 画像生成 | `python comfyui_generate.py <prompt> <output_dir>` | ComfyUI で情景画像を生成 |
| 地図生成 | `python comfyui_generate_cartography.py` | Cartography 羊皮紙地図（任意） |

スクリプトの場所: `C:\AI\TextAdventureGMSkill\scripts\`

ComfyUI が起動していない場合、画像生成はスキップされます（ゲーム進行には影響しません）。

---

## トラブルシューティング

| 症状 | 確認事項 |
|:---|:---|
| Webview が更新されない | `turn_result.json` または `game_state.json` がワークスペースに書き込まれているか確認 |
| クリップボードにコピーされない | `gmBridge.provider` が `clipboard` になっているか確認 |
| ダイスが振られない | `dice.py` のパスが正しいか、Python が実行できるか確認 |
| 画像が表示されない | ComfyUI が API モードで起動しているか確認 (`http://127.0.0.1:8188`) |
| JSON エラーの警告が出る | VSCode 出力パネル「Text Adventure: GM Bridge」でスキーマ違反の詳細を確認 |

---

## 関連ドキュメント

- [`GM_BRIDGE_PRESETS.md`](GM_BRIDGE_PRESETS.md) — 全 provider の設定例と比較表
- [`C:\AI\TextAdventureGMSkill\SKILL.md`](../TextAdventureGMSkill/SKILL.md) — GM スキル本文
- [`C:\AI\TextAdventureGMSkill\SCENARIO_PACK.md`](../TextAdventureGMSkill/SCENARIO_PACK.md) — シナリオパック仕様