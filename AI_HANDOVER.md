# AI Handover Document (LoreRelay)

他のAI（Claude, ChatGPT, Grok, Geminiなど）にこのプロジェクトを引き継ぐための共通ドキュメントです。
新しいAIにこのプロジェクトを理解させる場合は、以下の順で読み込ませてください。

1. 本ファイル（`AI_HANDOVER.md`）— プロジェクト概要
2. `AI_COLLABORATION.md` — 複数AIで作業するときの書き込みルール
3. `AI_SHARED_LOG.md` — 全AIが共通で読む/追記する最新作業ログ
4. `CHANGELOG.md` — 実装済み変更の履歴
5. **`C:\AI\GROK_CODE_REVIEW.md`** — Grok によるコードレビュー指摘・対応状況
6. **`C:\AI\GEMINI_REVIEW.md`** — Gemini 3.5 Flash による全体評価・ビジネスモデル提案
7. **`C:\AI\CLAUDE_REVIEW.md`** — Claude Sonnet 4.6 による実装改善・競合分析（Saga & Seeker 比較）

> [!IMPORTANT]
> **現在の実装の正本は `CHANGELOG.md` とソースコードです。**
> レビュー文書は議論の記録を含むため、古い「未対応」記述が残っている場合があります。新しいAIは `AI_COLLABORATION.md` のルールに従い、`AI_SHARED_LOG.md` で直近作業を確認してから、`CHANGELOG.md` の最新バージョン（現在 **v0.2.7**）とソースコードを確認してください。

## 1. プロジェクトの目的
AI（LLM）をゲームマスター（GM）として利用し、リッチなUIでテキストアドベンチャーゲームをプレイするためのシステムです。
AIとの対話そのものは各環境（VSCode拡張機能のチャット欄やWeb UIなど）で行い、ゲームの状態やリッチなUI表示を専用のVSCode拡張機能（Webview）でレンダリングするアーキテクチャを採用しています。

これにより、**ユーザーは追加のAPIキー（従量課金）を購入することなく、サブスクリプション済み（ChatGPT Plus, Gemini Advanced, Claude Proなど）のAIをGMとして利用可能**です。

> [!NOTE]
> **連携方式についての注意**
> - **Antigravityなどのローカル実行可能エージェントAI:** ファイルの書き込みやPythonコマンドの実行が可能なため、完全自動でこのWebview UIと連動します。
> - **通常のブラウザ版AI (ChatGPT Plus, Claude Proなど):** ブラウザ環境からは直接ユーザーのPCのファイルを書き換えることができません。そのため、ブラウザAIにGMをさせる場合は、AIに出力させた `game_state.json` の内容をユーザーが手動でコピーしてローカルのファイルに上書き保存する（または中継ブリッジアプリを使用する）必要があります。
## 2. 全体アーキテクチャ

システムは大きく2つのコンポーネントに分かれています。

### A. GMスキル（AI側の指示書）
- **場所:** `C:\AI\TextAdventureGMSkill\SKILL.md` (またはユーザーのシステム上のエージェントスキルフォルダ)
- **役割:** AIに対して「GMとしてどう振る舞うか」を指示するシステムプロンプト。
- **機能:**
  - ナラティブ（情景描写）の生成。
  - ステータス（現在地、HP、所持金など）の管理。
  - 選択肢の提示。
  - **画像生成連携:** Pythonスクリプト (`comfyui_generate.py`) を呼び出し、ローカルのComfyUIで情景画像を生成する。
  - **ダイスロール連携:** Pythonスクリプト (`dice.py`) を呼び出し、乱数を取得する。
  - **状態の出力:** 毎ターンの終わりに、現在のゲーム状態を `game_state.json` としてワークスペースに書き出す。

### B. VSCode拡張機能（表示用UI）
- **場所:** `C:\AI\text-adventure-vsce\`
- **役割:** `game_state.json` を監視し、リッチなUI（Webview）にレンダリングする「表示装置」。
- **技術スタック:** TypeScript, VSCode Webview API, HTML/CSS/JS (Glassmorphismデザイン)
- **機能:**
  - `game_state.json` の変更を監視（watch）し、UIを更新。
  - ログの色分け表示、選択肢のクリッカブル化。
  - 画像ギャラリー、背景テーマの切り替え。
  - **ダイスローラー＆電卓:** ユーザーが手動でダイスを振ったり計算したりできるUIパネル。
  - **BGM自動制御:** ユーザーが用意した音源を `bgm.json` に登録すると、GM が場面に合わせて `game_state.json` の `bgm`/`mood` で曲を切り替え、Webview がクロスフェード再生する。手動操作（再生・音量・ミュート）も可能。
  - **効果音(SE):** ライセンスフリーの合成SEを同梱（`generate_sfx.py` 生成）。GM が `game_state.json` の `sfx` で単発再生。CC0素材への差し替えも可能。
  - **シナリオパック:** `scenario.json` を含むフォルダを「Load Scenario Pack」で読み込むと、開始シーン・テーマ・専用BGM/SEが一括適用される。形式は `C:\AI\TextAdventureGMSkill\SCENARIO_PACK.md` 参照。
  - **画像生成バックエンド設定:** ComfyUI / Stability Matrix のURL・モデル(checkpoint)・生成パラメータを `textAdventure.imageGen.*` で指定可能。
  - **多言語:** `textAdventure.locale`（`ja` / `en` / `zh-CN` / `zh-TW`）。`locales/*.json` + Webview 🌐 プルダウン。GM プロンプト・Ollama/Kobold ブリッジも連動。
  - **GM ブリッジ:** UI上の選択肢・自由入力を GM に送信（`textAdventure.gmBridge.provider`: `grok` / `ollama` / `koboldcpp` / `clipboard` / `command`）。デフォルトは Grok Build headless。Ollama/KoboldCPP プリセットは `GM_BRIDGE_PRESETS.md` 参照。
  - **クリップボードフォールバック:** GM ブリッジ失敗時、または `provider=clipboard` 時にクリップボードへコピー。
  - **ダイス→GM:** ダイスロール後「GMに送る」で結果を GM ブリッジへ渡せる。
  - **SillyTavern 互換:** キャラカード / ロアブックのインポート（`SILLYTAVERN_COMPAT.md`）。Character Profile タブ、Active キャラ・ロアブックの GM プロンプト注入。VN 演出（`background` / `sprite`）。
  - **CHIM 風メモリ:** `dynamic_profiles.json`、`party.json`、`summary`、`sagas/`（Saga Archiver）、`memories/`（TF-IDF またはオプション ChromaDB）。プロバイダー別の自動アーカイブ促し（30/80 ターン）。OpenRouter GM 対応。

## 3. ファイル連携の仕組み (game_state.json)
AIとUIの通信は、すべて `game_state.json` を介して行われます。

1. **[User]** チャット欄で行動を入力（例: "1を選択する"）
2. **[AI GM]** 入力を受け取り、結果を推論。必要に応じて `dice.py` でダイスを振る。
3. **[AI GM]** `comfyui_generate.py` を呼び出して画像を生成。
4. **[AI GM]** 最新のゲーム状態を `game_state.json` に上書き保存。
5. **[VSCode UI]** ファイルの変更を検知し、Webview画面を更新。

### Grok Build 連携（推奨構成）

Webview の選択肢・自由入力は VSCode 拡張が Grok Build に自動送信する（`textAdventure.grokBridge.enabled`、デフォルト ON）。

```
[Webview] 選択肢クリック / 自由入力
    ↓ postMessage
[extension.ts] grok -p "プレイヤーの行動: ..." --cwd <workspace> --yolo [--continue]
    ↓ ファイル書き込み
[game_state.json]
    ↓ FileSystemWatcher
[Webview] 自動更新
```

**前提条件:**
- `grok` CLI が PATH または `%USERPROFILE%\.grok\bin\grok.exe` にあること
- ワークスペースに GM スキル（`SKILL.md`）が配置または `~/.grok/skills/` にインストールされていること
- 初回ターン以降は `--continue` で Grok セッションを継続

**設定:** VSCode → `textAdventure.grokBridge.*`（`enabled`, `command`, `autoApprove`, `fallbackToClipboard`）

## 4. AIへの指示（あなたがこれからやること）
このプロジェクトを引き継いだAIは、以下の点に注意して開発やサポートを行ってください。

- **作業ルールの確認:** まず `AI_COLLABORATION.md` を読み、作業後は `AI_SHARED_LOG.md` に追記してください。
- **最新状態の確認:** まず `CHANGELOG.md` の最新セクションを読み、現在の実装バージョンと追加機能を確認してください。
- **コードレビュー指摘の確認:** `C:\AI\GROK_CODE_REVIEW.md` の「対応状況サマリー」を確認し、**未対応**の指摘があれば優先度を判断して対応してください。v0.2.2 で CI・Schema 検証・画像プレースホルダ・Antigravity ガイド・ダイス連携は対応済み。残りは主に README/GIF・Ko-fi URL など公開準備。
- **プロダクト方針の確認:** `C:\AI\GEMINI_REVIEW.md` にマネタイズ案がある。`C:\AI\CLAUDE_REVIEW.md` に Saga & Seeker 競合分析・ロードマップがある。
- **UIの修正:** `C:\AI\text-adventure-vsce\webview\` 内の HTML/CSS/JS を修正してください。VSCode APIとの通信は `postMessage` を使用しています。
- **GMルールの修正:** `C:\AI\TextAdventureGMSkill\SKILL.md` を修正してください。
- **動作確認:** VSCode拡張機能のフォルダで `F5` キーを押し、「Extension Development Host」を起動してテストします。
- **乱数・計算:** AIは自身の推論で乱数を生成したり計算したりせず、必ず用意された `dice.py` などのスクリプトをターミナルで実行して結果を取得してください。

## 4.0 Private Scenario Vault

Private/local scenario vaults are intentionally outside the public repository scope. Do not read, edit, summarize, index, or mention private scenario contents in shared docs unless the user explicitly asks for that local-only work.

## 4.1 現在の主な残件

- **公開準備:** README のスクリーンショット/GIF差し替え、Ko-fi 実URL反映。
- **UX強化:** セットアップの polish（`setup.ps1` は実装済み。VSIX 同梱インストーラーは任意）。

### v0.2.x で実装済みの主な機能（詳細は `CHANGELOG.md`）

| 版 | 内容 |
|:---|:---|
| v0.2.2 | 隠しダイス・diceRequest・画像プレースホルダ・Schema 検証・CI・Antigravity ガイド |
| v0.2.1 | i18n（ja/en/zh-CN/zh-TW）+ Webview 言語プルダウン |
| v0.2.0 | Ollama / KoboldCPP GM ブリッジ |

## 5. フォルダ構成
- `C:\AI\text-adventure-vsce\` : VSCode拡張機能のプロジェクトルート
  - `src/extension.ts` : 拡張機能のエントリーポイント（Webview作成、ファイル監視）
  - `webview/` : UI実装（index.html, style.css, script.js）
- `C:\AI\TextAdventureGMSkill\` : AI GM用のスキルフォルダ
  - `SKILL.md` : AIへの指示書
  - `scripts/` : 画像生成(`comfyui_generate.py`)・ダイス(`dice.py`)・SE生成(`generate_sfx.py`)のPythonスクリプト
  - `sfx/` + `sfx.json` : 同梱のライセンスフリー効果音とマニフェスト
  - `bgm.sample.json` : BGMマニフェストのテンプレート（ユーザーが `bgm.json` にコピーして使う）
  - `scenarios/` : シナリオパック（`lost-catacombs/` はサンプル）
  - `SCENARIO_PACK.md` : シナリオパック形式の仕様

## 6. 競合・ポジショニング（Saga & Seeker との比較）

類似製品として **[Saga & Seeker](https://store.steampowered.com/app/3522640/Saga__Seeker/)** (Steam, $9.99, 2026-02-27) が存在する。
こちらは一般ゲーマー向けのポリッシュされたスタンドアロンアプリで、AI が BGM も制御し、コミュニティシナリオ共有機能も持つ。

**本プロジェクトの差別化点（Hacker Edition）:**
- **追加費用 $0** — 既存 AI サブスク（ChatGPT Plus / Claude Pro 等）をそのまま GM として利用
- **AI の選択自由** — ChatGPT / Claude / Grok / Gemini / Ollama（ローカル LLM）など何でも使える
- **ローカル画像生成** — ComfyUI + 好みの LoRA で世界観に合った画像を自動生成
- **任意 TRPG ルール対応** — `SKILL.md` を書き換えればクトゥルフ・SW・独自システムも動く
- **完全オープン** — OSS、開発者が自由にハック可能

詳細な比較分析は `C:\AI\CLAUDE_REVIEW.md` を参照。
