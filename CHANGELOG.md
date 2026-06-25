# Changelog

このファイルは、プロジェクトの変更履歴を記録したものです。
新しいAIがプロジェクトに参加する際、`AI_HANDOVER.md` と共にこのファイルを読むことで、過去の経緯や修正の理由を素早く把握できます。

関連レビュードキュメント:
- `C:\AI\GROK_CODE_REVIEW.md` — Grok によるコードレビュー指摘と対応状況
- `C:\AI\GEMINI_REVIEW.md` — Gemini による全体評価・ビジネスモデル提案
- `C:\AI\CLAUDE_REVIEW.md` — Claude による実装改善・Saga & Seeker 競合分析

## [Unreleased]

### Fixed
- Tightened `game_state.json` validation for `entries[].id`, entry metadata fields, `status.location/time/funds`, `profileUpdates[].characterId`, and hidden dice result leakage.
- Hardened message edit/exclude/branch handling so invalid entry IDs are ignored, malformed entries do not break history sync, and missing entries no longer emit false success updates.
- Preserved message metadata (`imagePrompt`, `imageBlocked`, `excludedFromPrompt`, `editedAt`) when restoring state from checkpoint/rewind snapshots.

### Changed
- `excludedFromPrompt` now affects GM prompt context and Memory Bank history retrieval in addition to Webview display opacity.
- Added validation coverage for schema-critical rules in `scripts/validate.js` and a new invalid metadata fixture.

## [0.3.1] - 2026-06-26

### Added (Phase ST-A — Image Gen Settings & Workspace Config)

- **`image_gen_config.json`**: ワークスペース直下にセッション別の ComfyUI 設定を保存。checkpoint / mode / steps / cfg / width / height / sampler / scheduler / positive prefix・suffix / negative prompt / prompt templates を保持。
- **Image Gen Settings パネル** (Webview ヘッダー 🎨): Glassmorphism スライドインパネルからライブ編集。フォーカスアウト時に自動保存 (`updateImageGenConfig`)。
- **`src/imageGenConfig.ts`**: 設定の読み書き・サニタイズ（数値範囲・文字列長制限）。
- **`comfyui_generate.py`**: `TA_IMAGE_CONFIG` または cwd の `image_gen_config.json` を最優先適用。`TA_POSITIVE_PREFIX` / `TA_NEGATIVE_PROMPT` 等の環境変数にも対応。
- **i18n**: `webview.quickReply.*` / `webview.msg.*` / `webview.imageGen.*` を 4 言語に追加（v0.3.0 UI の未訳キー補完を含む）。

### Changed
- `buildImageGenEnv()` がワークスペース設定を VSCode `textAdventure.imageGen.*` より優先して `comfyui_generate.py` へ渡す。
- 画像生成のデフォルトモードが `image_gen_config.json` の `mode` を参照するよう変更。

## [0.3.0] - 2026-06-26

### Added (Phase ST-B + ST-D — Quick Reply Bar & Message Action Bar)

- **Quick Reply バー** (`#quick-reply-bar`): チャット入力欄の直上に横スクロール可能なショートカットボタンバーを新設。標準ボタン: ⏪ Undo / 🔄 Retry / 💾 Checkpoint / 📝 Summary / 🎨 Gen Image / 📂 Load Pack / 📖 Archive。ゲームオーバー時は他の入力欄と同様に一括ロック。
- **Message Action Bar** (`.msg-actions`): 各メッセージをホバーした際にインライン表示されるアイコンボタンバーを新設 (SillyTavern Phase ST-D)。ボタン: 📄 Copy / 📢 Speak (TTS) / 🎨 Gen Image / 🚩 Checkpoint / 👁️ Exclude / 🔱 Branch / ✏️ Edit。
- **インライン編集** (`startInlineEdit`): ✏️ ボタン押下でメッセージ本文が `<textarea>` に切り替わり、保存後に `editEntry` メッセージを送信して `game_state.json` を即時更新。
- **プロンプト除外トグル** (`toggleExcludeEntry`): 👁️ ボタンで `excludedFromPrompt: true/false` をトグル。Webview 側は対象メッセージを半透明 (`opacity: 0.4`) に。
- **ブランチ作成** (`branchFromEntry`): 🔱 ボタンで確認後、指定ターンを基点として `handleRestoreToTurn` を再利用し歴史を分岐。
- **`editEntry` ハンドラ** (extension.ts): 指定 ID の `content` を `game_state.json` と `gameEntryHistory` の両方に書き込み、`editedAt` タイムスタンプを付与。
- **`toggleExcludeEntry` ハンドラ** (extension.ts): `excludedFromPrompt` をトグル保存し、`entryExcludeToggled` で Webview を即時同期。
- **`loadScenario` ハンドラ** (extension.ts): Quick Reply の「Load Pack」ボタンから既存の `loadScenarioPack()` を呼び出し。

### Changed
- `GameEntry` 型に `excludedFromPrompt?: boolean` と `editedAt?: string` を追加 (`src/types/GameState.ts`)。
- `game_state_schema.json` に `imageBlocked` / `excludedFromPrompt` / `editedAt` フィールドを追加。
- `setInputLocked()` が `.qr-btn` も一括で `disabled` にするよう拡張。
- `applyI18n()` が Quick Reply バーのボタンラベルも `data-i18n` で切り替え可能 (キー `webview.quickReply.*`)。

## [0.2.11] - 2026-06-26

### Added
- DREAMIO-style manual image regeneration: Added `imagePrompt` field to `game_state.json` and a UI button to edit and regenerate scene images via ComfyUI.
- README に v0.3 候補として Remote Play Mode のロードマップを追加（LAN/Tailscale 前提、直接公開なし）。
- `LICENSE`（MIT）を追加。
- `SILLYTAVERN_COMPAT.md` に Connection Profile / Text Completion Preset / Quick Reply / Background Gallery など、今後取り込む ST 由来機能候補を整理。

### Security / Privacy
- Claudeレビュー対応: Webview CSP を nonce + `webview.cspSource` 方式へ更新し、`script-src 'unsafe-inline'` と旧 `vscode-webview-resource:` を除去。
- Claudeレビュー対応: TTS の `innerHTML` パースを廃止し、GMテキストをプレーンテキストとして扱うよう変更。
- Claudeレビュー対応: OpenRouter APIキーを VS Code SecretStorage に保存するコマンドを追加。既存 settings の `apiKey` は互換フォールバック扱いに変更。
- Claudeレビュー対応: `TextAdventureGMSkill/scripts/comfyui_generate.py` に HTTP timeout と出力先ブロック判定の正規化を追加。

### Fixed
- 画像再生成が `entryIndex` ではなく **`entry.id`** で履歴・`game_state.json`・Webview を一貫更新するよう修正（`updateEntry` メッセージ）。
- ツールバーの画像生成ボタンが直近 GM ターンの `entry.id` を渡すよう修正し、孤立画像にならないようにした。
- 画像生成の多重起動ガードを追加し、spawn エラー時も Webview の loading 状態が閉じるよう修正。
- `updateSummary` の入力型・最大長を検証。
- `game_state.json` のスキーマ警告フラグを、正常化後にリセットするよう修正。
- `TextAdventureGMSkill/scripts/openrouter_gm.py` の `max_tokens` を 3000 既定 + `--max-tokens` / `OPENROUTER_MAX_TOKENS` で調整可能に変更。
- `install_antigravity_skill.bat` が `..\TextAdventureGMSkill` をフォールバックコピー元として解決。
- VSIX から内部資料（`AI_*.md`、`src/`、`test/`、`*.map` 等）を除外するよう `.vscodeignore` を拡充（`out/` と `scripts/package_scenario.py` は同梱維持）。
- `validateGameState` に `entries[].imagePrompt` 検証を追加。

### Changed
- 共有ログ、AI協業文書、private scenario vault パッケージ補助スクリプトから、公開向けに不要なローカル具体パスを除去。

## [0.2.10] - 2026-06-26

### Security
- `checkpointId` を `/^cp-\d+$/` で検証（`loadCheckpointFile` / `deleteCheckpointFile` の path traversal 対策）。
- `handleRegenerateLastTurn` に `gameOver` ガードを追加（`handlePlayerInput` と同様）。

## [0.2.9] - 2026-06-25

### Added (DREAMIO + AI Dungeon / SillyTavern 参考)
- **ゲームオーバー検出** — `game_state.json` の `gameOver` フィールド。Webview オーバーレイ + 入力ロック。`SKILL.md` に strict/permissive/story プリセット。`setup.gameOver` をシナリオで指定可能。
- **チェックポイント & 任意ターン巻き戻し** — `.text-adventure/checkpoints/` に名前付き保存。ステータスパネルから「Rewind to turn」で履歴上の任意 GM ターンへ復元。
- **🔄 Retry（再生成）** — AI Dungeon 風。直前 GM 応答を別バリエーションで再生成。
- **Author's Note** — AI Dungeon / SillyTavern 風。次の1ターンのみ GM プロンプトに `[Author's Note: ...]` を付加。
- **Scenario Workshop** — `SCENARIO_WORKSHOP.md`、`workshop.json` 形式、`package_scenario.py`。コマンド: Validate / Export Scenario Pack (ZIP)。

### Changed
- `locales/*.json` — 180 キー（+33）。
- サンプル `lost-catacombs` に `setup.gameOver.strict` を追加。

## [0.2.8] - 2026-06-25

### Added
- DREAMIO から着想を得た 1ターン巻き戻し (Undo) 機能を追加。
  - 最新のプレイヤー行動と GM 応答を削除し、前ターンの状態にゲームをロールバックする。
  - `game_history.json` の各エントリに、ステータス、選択肢、テーマ、BGM/SE 状態のスナップショットメタデータをマージ保存し、完全な状態の復元に対応。
  - UI 下部入力欄に `⏪ Undo` ボタンを追加。
- DREAMIO から着想を得た AI 音声ナレーション (TTS) 機能を追加。
  - OS にインストールされた音声エンジン（日本語、英語、中国語）を自動選択してナラティブを読み上げる。
  - ヘッダーに音声設定パネル（有効/無効、音量、速度）を追加。
  - プレイヤーの入力時（自由入力 / 選択肢クリック）に、読み上げを自動でキャンセルする制御を追加。
  - `vscode.getState()` を通じた設定の永続化に対応。
- DREAMIO から着想を得た **音声入力 (STT)** 機能を追加。
  - 入力欄横の 🎤 ボタンで Web Speech API による音声認識。認識完了後に自動送信。
  - 4 ロケールに応じた `lang` 設定（ja-JP / en-US / zh-CN / zh-TW）。未サポート環境ではクラッシュせずメッセージ表示。

### Security / Privacy
- **Grok ブリッジ** — `-p` 引数でのプロンプト全文渡しを廃止し、`--prompt-file` + `.text-adventure/prompt-*.txt` 経由に変更（プロセス一覧からの漏洩防止）。
- **custom command ブリッジ** — `{actionFile}` プレースホルダを追加。デフォルト `commandArgs` を `--prompt-file {actionFile}` 形式に更新。
- Grok 自動承認フラグを `--yolo` から公式の `--always-approve` に更新。

### Fixed
- マルチルートワークスペースにおいて、画像生成 (`runImageGeneration`) が常に最初のフォルダに対して実行されてしまうバグを修正 (`getWorkspacePath()` を利用するよう統一)。
- Web Speech API (speechSynthesis) が無効または未サポートのブラウザ/プラットフォームにおいて、JS がクラッシュする問題を修正（オプショナルチェーンの導入および存在検証の追加）。

### Changed
- `locales/*.json` — 147 キー（+4 STT）。
- `GROK_CODE_REVIEW.md` — v0.2.8 時点の対応状況に更新。

## [0.2.7] - 2026-06-25

### Security / Privacy (pre-release hardening)
- **キャラクター ID 検証** — `^[a-zA-Z0-9_-]{1,64}$` + `path.resolve()` で `characters/` 配下拘束（`src/characterId.ts`）。
- **プレイ内容の秘匿** — Ollama/Kobold/OpenRouter は `--action-file` 経由。Output Channel は `[redacted action, length=N]`。Python 側ログも redact。
- **lorebook インポート** — 既存 `lorebook.json` がある場合は上書きせず `lorebook.imported.json` へ。
- **`.gitignore`** — `characters/`, `sagas/`, `memories/`, `lorebook*.json`, `.text-adventure/` 等を追加。

### Added
- **`src/validateGameState.ts`** — hiddenDice / diceRequest / profileUpdates / sprite / summary 等を検証。fixture テスト付き。

### Fixed
- 電卓で Enter キーが効かない回帰（`webview/script.js`）。

### Changed
- README — 「基本 API キー不要、OpenRouter は任意」と明記。
- `locales/*.json` — 135 キー（+2）。

## [0.2.6] - 2026-06-25

### Added
- **自動アーカイブ促し** — 履歴がプロバイダー別閾値を超えると Webview バナー + 通知で章アーカイブを提案。Ollama/Kobold/小型 OpenRouter は **30 ターン**、Grok / Gemini 級は **80 ターン**（設定で変更可）。
- **ChromaDB Memory Bank（オプション）** — `memory_chroma.py`。`textAdventure.memory.backend` = `auto` | `tfidf` | `chromadb`。`pip install chromadb` で embedding 検索、未導入時は TF-IDF にフォールバック。
- **`src/archivePrompt.ts`** — コンテキスト枠推定と閾値ロジック。

### Changed
- `memory_bank.py` — `--backend` / `--json` 対応。Grok プロンプトも Chroma 経由可能。
- `locales/*.json` — 133 キー（+11）。

## [0.2.5] - 2026-06-25

### Added (CHIM / Bannerlord 風メモリ — 第2段階)
- **Saga Archiver** — `archive_saga.py` + Webview「📖 章をアーカイブ」。古い `game_history.json` を過去形の散文章に圧縮 → `sagas/chapter-NNN.json`。verbatim バックアップは `sagas/verbatim/`。
- **Memory Bank（軽量 TF-IDF）** — `memory_common.py` / `memory_bank.py` / `src/memoryBank.ts`。Saga・ロアブック・動的プロフィール・履歴から関連メモリ top-3 を GM プロンプトに注入（ChromaDB 不要）。
- **共有 LLM クライアント** — `bridge_llm.py`（summarize / archive 共通）。

### Changed
- `gm_bridge_common.py` — Saga + Memory Bank を Ollama/Kobold/OpenRouter プロンプトに注入。`profileUpdates` 後にメモリインデックス再構築。
- `extension.ts` — Grok プロンプトにも Saga / Memory Bank を注入。`archiveSaga` ハンドラ。
- `SKILL.md` — Saga / Memory Bank の GM 手順。
- `locales/*.json` — 127 キー（+5）。

## [0.2.4] - 2026-06-25

### Added (Antigravity + Grok 仕上げ)
- **Dynamic Profiles（CHIM 風メモリ）** — GM が `profileUpdates` を出力 → `characters/dynamic_profiles.json` に永続化。Grok / ローカル LLM 両方でプロンプト注入。Grok 直書き `game_state.json` も extension が処理。
- **OpenRouter GM Provider** — `openrouter_gm.py`、`textAdventure.gmBridge.openRouter.*` 設定。
- **Context Summarizer** — Webview「要約生成」+ `summarize_gm.py`。`game_state.json` の `summary` を Grok / Ollama / KoboldCPP / OpenRouter で生成。
- **Party System** — Character Profile のパーティーチェックボックス + `party.json`。同行キャラを GM プロンプトに一括注入。

### Fixed (Grok — Antigravity 実装の穴埋め)
- **パーティー UI クラッシュ** — `charPartyCb` 未定義を修正。`partyIds` のチェックボックス同期。
- **Grok プロンプト不足** — `buildGmPromptContext` にパーティー・動的メモリ・あらすじを追加（Ollama 側との parity）。
- **メタ JSON 混入** — `party.json` / `dynamic_profiles.json` をキャラ一覧から除外。
- **要約ボタン** — 完了後に i18n 対応でボタンをリセット。
- **i18n** — あらすじ・パーティー・要約メッセージを 4 ロケール追加（122 キー）。

### Changed
- `SKILL.md` — パーティー・動的プロフィール・あらすじの GM 手順を追記。
- `game_state_schema.json` / `GameState.ts` — `summary` フィールド追加。

## [0.2.3] - 2026-06-25

### Added
- **SillyTavern 互換** — `SILLYTAVERN_COMPAT.md`。キャラカード（`.png` / `.json`）→ `characters/<id>.json`、World Info → `lorebook.json`。VSCode コマンド `Import SillyTavern Character Card` / `Import SillyTavern Lorebook`。
- **インポートスクリプト** — `import_st_card.py`、`import_st_lorebook.py`、`resolve_lorebook.py`（キーワードマッチ CLI）。
- **Character Profile タブ** — Webview でキャラ管理（名前・設定・性格・立ち絵）。Active キャラを Grok / Ollama / KoboldCPP プロンプトに自動注入。
- **ロアブック自動注入** — 直近ナラティブ＋プレイヤー行動からキーワードマッチしたエントリを GM プロンプトに付与。
- **VN 演出フィールド** — `game_state.json` の `background`（シーン背景）・`sprite`（立ち絵レイヤー、位置 left/center/right）。
- **クイックセットアップ** — `scripts/setup.ps1` / `scripts/setup.sh`（軽量ワンクリック）。
- **Character Profile i18n** — タブ・フォームを 4 ロケール対応（`webview.character.*` / `extension.st.*`）。

### Changed
- `gm_bridge_common.py` — キャラ記述の二重注入を整理（日本語ブロックのみ）。
- `locales/*.json` — 114 キー（94 → 114）。

## [0.2.2] - 2026-06-25

### Added (Claude — ダイス連携・品質基盤)
- **隠しダイスロール（GMスクリーン）** — `game_state.json` の `hiddenDice` で GM が振った事実のみ通知（出目非表示）。Webview に通知 + ダイス音。`extension.ts` が `result` をストリップ。`SKILL.md` 追記。4 ロケール対応。
- **GM ダイス要求・自動ロール** — `diceRequest` で GM がユーザーにダイスを振らせる。Webview 自動ロール + `playSfxAsync` で音の成否検出。失敗時はフォールバックで手動ロールを促す。`SKILL.md` 追記。4 ロケール対応。
- **画像ブロック時プレースホルダ UI** — `safeImageUri` 拒否時に `GameEntry.imageBlocked` → Webview で 🔒 プレースホルダ表示。4 ロケール対応。
- **ランタイム JSON Schema 検証** — `validateGameState()`（外部ライブラリ不要）。違反を GM Bridge 出力に記録、セッション初回のみ警告。処理は継続（graceful degradation）。
- **GitHub Actions CI** — `.github/workflows/ci.yml`（push/PR → `npm ci` / compile / test、Node 20）。
- **Antigravity 連携ガイド** — `ANTIGRAVITY_GUIDE.md`（clipboard / command 両モード）。`GM_BRIDGE_PRESETS.md`・`README.md` に参照追加。

### Changed
- `game_state_schema.json` / `GameState.ts` に `hiddenDice`・`diceRequest`・`imageBlocked` を追加。
- `locales/*.json` — 94 キー（ダイス・画像ブロック関連キー追加）。

## [0.2.1] - 2026-06-24

### Added
- **多言語 (i18n)** — `textAdventure.locale`（`ja` / `en` / `zh-CN` / `zh-TW`）。`locales/*.json` で Webview・拡張メッセージ・GM プロンプトを切り替え。
- **Webview 言語プルダウン** — チャットヘッダーの 🌐 から実行中に切り替え（設定 `textAdventure.locale` と同期）。
- **`src/i18n.ts`** — `t()` ヘルパー、Webview 向けバンドル配信。

### Changed
- Ollama / KoboldCPP ブリッジが `--locale` / `TA_LOCALE` で GM システムプロンプトの言語に対応。
- Grok プロンプトも `gm.prompt.*` ロケールキー経由で言語指定。

## [0.2.0] - 2026-06-24

### Added
- **Ollama GM ブリッジ** — `textAdventure.gmBridge.provider=ollama`。`TextAdventureGMSkill/scripts/ollama_gm.py` が Ollama API を呼び、`game_state.json` を自動更新。
- **KoboldCPP GM ブリッジ** — `provider=koboldcpp`。`koboldcpp_gm.py` が `/api/v1/generate` に接続。
- **共有ブリッジロジック** — `gm_bridge_common.py`（`{{DICE:1d20}}` マーカー → `dice.py` 実行、JSON 抽出、ターン ID 採番）。
- **GM ブリッジ設定** — `gmBridge.python` / `gmBridge.scriptPath` / `gmBridge.ollama.*` / `gmBridge.koboldcpp.url`。
- **プリセットドキュメント** — `GM_BRIDGE_PRESETS.md`（settings.json コピペ例・比較表）。

### Changed
- 出力チャンネル名を「Text Adventure: GM Bridge」に統一（Grok 専用名から汎用化）。

### Note（ローカル LLM の制限）
- Ollama / KoboldCPP は **ナラティブ + game_state.json 更新**まで自動。ComfyUI 画像生成は Grok 等のツール実行が必要。
- JSON 出力品質はモデル依存。instruct 系・十分なコンテキスト長を推奨。

## [0.1.9] - 2026-06-24

### Added (Grok コードレビュー対応)
- **汎用 GM ブリッジ** — `textAdventure.gmBridge.provider`（`grok` / `clipboard` / `command`）。カスタム CLI は `gmBridge.command` + `gmBridge.commandArgs`（`{action}`, `{cwd}` プレースホルダ）。
- **マルチルート WS 対応** — `textAdventure.workspaceFolder` で `game_state.json` の対象フォルダを指定可能。
- **ダイス結果の GM 送信** — Webview に「📤 GMに送る」ボタン。`freeInput` と同経路で GM ブリッジへ渡す。
- **軽量バリデーション** — `npm test`（`scripts/validate.js`）で schema / バージョンを確認。

### Changed
- **画像パスポリシー** — `safeImageUri` がワークスペースまたは GM スキル配下のファイルのみ許可。外部パスはコンソール警告のうえスキップ。
- **GM ローディングイベント** — `gmStart` / `gmEnd` に統一（`grokStart` / `grokEnd` は Webview で後方互換）。
- **ステータス後方互換** — 旧形式の文字列 `status.condition` を配列として表示。
- `extension.ts` が `types/GameState.ts` の `GameEntry` を import。

### Changed (ドキュメント整理)
- AI作業用ルール `AI_COLLABORATION.md` と `AI_SHARED_LOG.md` の追加、及び読み順の更新
- **GameState スキーマと CRPG キャラクターシートUIの追加**:
  - `src/types/GameState.ts` および `game_state_schema.json` を作成し、型安全な通信とAI出力の安定化を図った。
  - Webviewステータスパネルを拡張し、HP/MPのプログレスバー、コンディション、インベントリ、スキルのタグリスト表示を実装。
  - `SKILL.md` の出力例を新しい構造に更新。
  - `README.md` に Saga & Seeker 等にインスパイアされた「Hacker Edition」思想やCRPG要素のアピールを追記。
  - `AI_SHARED_LOG.md` を追加。全AIが共通で読む/追記する最新作業ログとして運用。
  - `AI_HANDOVER.md` の読み込み順に両ファイルを追加。
- **レビュー文書の整合**
  - `GROK_CODE_REVIEW.md` に残っていた古い「未対応」記述を v0.1.8 の実装状況に合わせて更新。
  - `AI_HANDOVER.md` に「実装の正本は CHANGELOG とソースコード」という注意書き、v0.1.8 時点の主な残件を追加。
- **README の公開向け更新**
  - v0.1.8 の機能（Grok Bridge、BGM/SE、シナリオパック、履歴永続化）を Features に反映。
  - 存在しない placeholder 画像リンクを削除し、スクリーンショット/GIF差し替え前提の記述に変更。

## [0.1.8] - 2026-06-24

### Added (Claude Sonnet 4.6 — 履歴永続化 & GM ローディング UI)

#### game_history.json ディスク永続化 (Grok #5 完全対応)
- **問題:** 全履歴が Webview の `vscode.setState()` とメモリのみに依存しており、VSCode 再起動で冒険ログが消えていた。
- **修正:** `extension.ts` に `getHistoryPath()` / `loadHistoryFromDisk()` / `saveHistoryToDisk()` を追加。
  - 起動時（`startWatchingGameState`）に `game_history.json` から既存履歴を復元し `gameEntryHistory[]` に読み込む。
  - 新エントリを検知するたびに自動保存（`sendCurrentState` 内で `historyUpdated` フラグで管理）。
  - パス: `<workspace>/game_history.json`（`game_state.json` と同じ場所）。

#### Grok ターン待ちローディング UI (CLAUDE_REVIEW A2)
- **extension.ts:** `invokeGrokBridge()` でプロセス開始時に `{ type: 'grokStart' }` を postMessage、終了時（成功・失敗・エラー全て）に `{ type: 'grokEnd', success }` を postMessage。
- **script.js:** `showGrokLoading()` — チャットに「⏳ GM がターンを処理中...」を表示し、自由入力・送信ボタン・選択肢ボタンを `disabled` にして二重送信を防止。`hideGrokLoading(success)` — ローディングを除去して入力を再有効化。失敗時はエラーメッセージを表示。

## [0.1.7] - 2026-06-24

### Added (Claude Sonnet 4.6 — 効果音(SE) & シナリオパック)

#### 効果音(SE)システム
- **ライセンスフリーSEを同梱** — `scripts/generate_sfx.py` がPython標準ライブラリのみで8種のSE（click/dice/success/fail/coin/hit/levelup/magic）を合成生成。サードパーティ素材を一切使わないため再配布・改変が自由。`TextAdventureGMSkill/sfx/` に生成済み、`sfx.json` も同梱で**箱から出してすぐ鳴る**。
- **GM によるSE発火** — `game_state.json` の `"sfx": "hit"` または `"sfx": ["hit","coin"]` でBGMに重ねてワンショット再生。
- **Webview SEプレイヤー** — 毎回新規 `Audio` で重ね再生（BGMを止めない）。曲ごと音量・全体音量・ミュートに対応。ダイスローラーUIも `dice` SEを再生。
- **同梱フォールバック** — workspace に `sfx.json` が無くても、スキル同梱の `sfx.json` を自動使用（`localResourceRoots` にスキルフォルダを追加）。
- 設定 `textAdventure.sfx.*`（enabled / manifestPath / volume）、UIにSE音量・ミュート行を追加。

#### シナリオパック
- **シナリオパック形式 `text-adventure-scenario/1.0` を定義**（`SCENARIO_PACK.md`）。`scenario.json`（meta + setup + opening）を中心に、任意で cover/bgm/sfx/追加ルールを同梱できる自己完結フォルダ。「本体無料＋シナリオ課金」モデルの配布単位。
- **読み込みコマンド「Text Adventure: Load Scenario Pack」**（`extension.ts`）— フォルダを選ぶと、開始シーンから `game_state.json` を生成・テーマ適用・パック専用BGM/SEの設定切り替え・`scenario.json` をworkspaceにコピーしてGMが参照可能に。
- **GM側の対応**（`SKILL.md`）— workspace に `scenario.json` があれば開始質問をスキップし、`setup` に従って進行。
- **動作するサンプルパック同梱** — `scenarios/lost-catacombs/`（忘れられた地下聖堂）。そのまま読み込んで遊べる。

## [0.1.6] - 2026-06-24

### Added (Claude Sonnet 4.6 — BGM自動制御)

Saga & Seeker の差別化要素だった「シーンに合わせた音楽」を、**ユーザー持ち込みの音源 + GM 自動選曲**という形で実装。

- **BGM マニフェスト `bgm.json`**
  - ユーザーが音源ファイル・ムード・説明文を登録するJSON。`TextAdventureGMSkill/bgm.sample.json` をテンプレートとして同梱（10シチュエーション: title/town/field/dungeon/tension/battle/boss/victory/sad/emotional）。
  - 音源は workspace 直下または `bgm/` サブフォルダに配置（.mp3/.ogg/.wav/.m4a）。
- **GM による自動選曲（2方式）**
  - `game_state.json` の `"bgm": "<id>"`（トラックID直接指定）または `"mood": "<mood>"`（ムード一致で自動選曲）。
  - AI に description を読ませて場面に合う曲を判断させることも可能。
  - `SKILL.md` に選曲ルール（場面転換時のみ切り替え等）を記載。
- **Webview BGM プレイヤー**（`webview/`）
  - 2つの `Audio` 要素によるクロスフェード（1.2秒）でシームレスに曲を切り替え。
  - 再生/一時停止・音量スライダー・ミュート・トラック手動選択のUIを追加（Glassmorphism 紫アクセント）。
  - ブラウザの自動再生ポリシーに対応（初回ユーザー操作までは曲名表示のみ、クリックで再生開始）。
  - 曲ごとの個別音量（`volume`）とループ設定（`loop`）に対応。
- **extension.ts**
  - `bgm.json` を読み込み、音源パスを検証して WebviewURI に変換し送信（`sendBgmManifest()`）。
  - `bgm.json` を FileSystemWatcher で監視し、変更時に自動リロード。dispose/deactivate でクリーンアップ。
  - 設定 `textAdventure.bgm.*`（enabled / manifestPath / volume）を追加。
- **CSP 更新** — `index.html` の Content-Security-Policy に `media-src` を追加（音声再生のため）。

## [0.1.5] - 2026-06-24

### Added (Claude Sonnet 4.6 — 画像生成バックエンドの設定化)

これまで ComfyUI の URL とモデル（チェックポイント）が完全ハードコードだった問題を解消。ComfyUI / Stability Matrix / 任意の ComfyUI 互換サーバーを設定で切り替え可能にした。

- **画像生成バックエンド設定 `textAdventure.imageGen.*` を追加**（`package.json`）
  - `backend` — `comfyui` / `stabilitymatrix` / `custom`（ラベル）
  - `comfyuiUrl` — サーバー URL（既定 `http://127.0.0.1:8188`。ポート変更に対応）
  - `checkpoint` — 使用するチェックポイント .safetensors のファイル名（空ならワークフロー既定）
  - `workflowPath` — カスタムワークフロー JSON のパス
  - `steps` / `cfg` / `width` / `height` — 生成パラメータ上書き（0 = ワークフロー既定）
- **`comfyui_generate.py` の環境変数対応**
  - `COMFYUI_URL` / `TA_CHECKPOINT` / `TA_WORKFLOW` / `TA_STEPS` / `TA_CFG` / `TA_WIDTH` / `TA_HEIGHT` を読み取り、ワークフローへ反映。
  - CFG は小数（例 5.5）にも対応。
  - 接続失敗時に「ComfyUI/StabilityMatrix が起動しているか / ポート設定」を案内する分かりやすいエラーメッセージを追加。
- **モデル一覧取得機能**
  - `python comfyui_generate.py --list-models` で、サーバーが受け付けるチェックポイント名を一覧表示。
  - VSCode コマンド **「Text Adventure: List Image Models」** を追加（`extension.ts`）。設定したモデル名が正しいか確認できる。
- **`extension.ts` のリファクタ**
  - スクリプトパス解決を `resolveComfyScript()` に、設定→環境変数の変換を `buildImageGenEnv()` に抽出。画像生成時に `Backend` / `Checkpoint` を Output に表示。
- **ドキュメント更新**
  - `TextAdventureGMSkill/README.md` に「Image Backend Configuration」節（環境変数表・モデルの場所・`--list-models`）を追加。
  - `SKILL.md` の画像生成連携に環境変数による接続先・モデル切り替えの説明を追加。

## [0.1.4] - 2026-06-24

### Fixed (Claude Sonnet 4.6 コードレビュー対応)

- **電卓の `Function()` 廃止 (Security)**
  - 問題: `new Function()` による動的コード評価を使用していた。CSP 強化時に機能停止するリスクがあった。
  - 修正: eval/Function を一切使わない再帰下降パーサー（`evaluateMath`）を `webview/script.js` に実装。加減乗除・べき乗・モジュロ・括弧・単項演算子に対応。
- **calcHistory の XSS 修正 (Security)**
  - 問題: 計算履歴を `innerHTML` に直接挿入していた。
  - 修正: `escapeHtml()` を経由するように変更。
- **ゲーム履歴のセッション内永続化 (Medium)**
  - 問題: 全履歴が Webview の `vscode.setState()` のみに依存しており、パネル再作成時に WebviewURI が陳腐化して画像が壊れる問題があった。
  - 修正: `extension.ts` が `gameEntryHistory[]` に全エントリを累積保持。パネル再表示（`requestState`）時は `fullHistory: true` フラグで全履歴を新しい WebviewURI に変換して再送信。Webview 側は `fullHistory` 受信時に chatLog をクリアして再描画。
- **画像パス検証の追加 (Medium)**
  - 問題: `asWebviewUri()` を存在しないパスに適用してもエラーにならず、画像が壊れた状態になっていた。
  - 修正: `safeImageUri()` ヘルパーを追加し、`fs.existsSync()` チェック後のみ URI 変換。存在しないパスは `delete entry.image` でスキップ。
- **ComfyUI 出力先バリデーション (Medium)**
  - 問題: `comfyui_generate.py` の `output_dir` 引数に任意パスを指定可能だった。
  - 修正: `os.path.abspath()` で正規化後、Windows/Linux 共通のシステムディレクトリへの書き込みをブロック。

### Added

- **画像生成ローディング表示 (UX)**
  - `extension.ts` から ComfyUI プロセス開始時に `imageGenStart`、終了時に `imageGenEnd` を postMessage。
  - `script.js` でチャットログ内に「🎨 AI がシーンを描画中...」を表示し、完了または失敗時に置き換え。
- **SKILL.md: 画像生成タイミングの設定追加**
  - 「毎ターン / 場面転換時のみ / 手動のみ」をゲーム開始時に選択可能に変更。毎ターン強制生成による遅延を回避できる。
- **Claude Sonnet 4.6 レビューの追加**
  - `C:\AI\CLAUDE_REVIEW.md` を新規作成。実装改善内容・Saga & Seeker との競合分析・ポジショニング提案を記録。
  - `AI_HANDOVER.md` に `CLAUDE_REVIEW.md` への参照と「Hacker Edition」ポジショニングセクションを追記。

### Changed (ドキュメント)
- **`CLAUDE_REVIEW.md` の拡充** — 他 AI 向け形式に整理（実装サマリー表・シーケンス図・ロードマップ優先順位・Steam 競合情報更新）。`GROK_CODE_REVIEW.md` の読み込み順に追記。
- **`package.json` バージョン** — `0.1.4` に同期。

## [0.1.3] - 2026-06-24

### Added
- **Grok Build ブリッジ**
  - Webview の選択肢・自由入力を `grok -p`（headless）に自動送信。Grok が `game_state.json` を更新すると Webview が自動反映される。
  - 設定項目 `textAdventure.grokBridge.*` を追加（enabled / command / autoApprove / fallbackToClipboard）。
  - 出力チャンネル「Text Adventure: Grok Bridge」で処理ログを表示。
  - Grok 失敗時は従来どおりクリップボードにフォールバック。
- **Gemini 3.5 Flash レビューの追加**
  - `C:\AI\GEMINI_REVIEW.md` を新規作成。開発プロセスの評価、アーキテクチャ分析、および「本体無料＋シナリオ等アセット課金」ビジネスモデル案を記録。
  - `AI_HANDOVER.md` に `GEMINI_REVIEW.md` への参照を追記。
  - Illustrious系モデル（`prefectIllustriousXL_v8.safetensors`）を使用したComfyUI画像生成テストの正常稼働（出力パス連携・Webview表示）を確認。

### Changed (ドキュメント)
- **CHANGELOG の整理**
  - `[0.1.2]` の重複見出しを解消し、v0.1.1（ChatGPT対応）を独立セクションに分離。
- **`GROK_CODE_REVIEW.md` のステータス更新**
  - 各指摘に対応状況（対応済み / 一部対応 / 未対応）と対応バージョンを追記。

## [0.1.2] - 2026-06-24

### Added (ドキュメント)
- **Grok コードレビュー記録の追加**
  - `C:\AI\GROK_CODE_REVIEW.md` を新規作成。VSCE拡張・GMスキル・Pythonスクリプトの全体レビュー結果を記録。
  - `AI_HANDOVER.md` に読み込み順を追記。

### Changed (Grok コードレビュー指摘への対応 Phase 1 & 2)
Grok による全体的なコードレビューを受け、Windows 特有の課題や UX 向上を実施。

- **画像生成のシェル非経由実行 (High)**
  - 問題: `terminal.sendText` によるコマンド構築では PowerShell 等でのシェルインジェクションリスクが完全には防げなかった。
  - 修正: `child_process.spawn` に変更し引数を安全に渡すように修正。実行状況は VSCode の Output パネルに表示。
- **ファイル監視の信頼性向上 (Medium)**
  - 問題: Node のネイティブ `fs.watch` では変更検知の安定性に欠ける場合があった。
  - 修正: VSCode API の `workspace.createFileSystemWatcher` に移行し、JSON パース失敗時のリトライロジック（最大3回）を追加。
- **メッセージ入力の検証 (Medium)**
  - 問題: Webview から送られる文字列に検証がなかった。
  - 修正: プロンプト・プレイヤー入力の文字数制限、画像生成モードの許可リスト検証を追加。
- **設定（Configuration）の導入 (Medium)**
  - 問題: ComfyUI 生成スクリプトのパスがソースコードにハードコードされていた。
  - 修正: `package.json` に設定項目 `textAdventure.skillPath` を追加。
- **UX の改善 (Medium)**
  - 修正: 選択肢クリック時に番号だけでなくテキスト全体を送信するように変更。
  - 修正: パネル再表示時のウェルカムメッセージ重複を解消（初回のみ表示）。
- **CSP とフォントの修正 (High)**
  - 問題: Google Fonts がブロックされていた。
  - 修正: `index.html` の CSP に `fonts.googleapis.com`（style-src）と `fonts.gstatic.com`（font-src）を追加。
- **activationEvents の最適化 (Low)**
  - 修正: `onCommand:textadventure.openGame` に変更し、コマンド実行時のみ拡張をアクティブ化。
- **debounceTimer のクリーンアップ (Low)**
  - 修正: パネル dispose 時および `deactivate` 時にタイマーをクリア。

## [0.1.1] - 2026-06-24

### Changed (ChatGPT コードレビュー指摘への対応)
他 AI（ChatGPT）によるコードレビューを受け、以下のセキュリティおよび安定性向上を実施。

- **Webview 画像表示の修正 (High)**
  - 問題: 絶対パスの画像が VSCode Webview でセキュリティ制限によりレンダリングされなかった。
  - 修正: `extension.ts` にて、JSON を Webview に送る前に `panel.webview.asWebviewUri()` を使用して URI を変換。
- **XSS 対策と CSP 導入 (High)**
  - 問題: `script.js` で `innerHTML` に直接画像タグを文字列として埋め込んでおり、スクリプトインジェクションのリスクがあった。
  - 修正: `index.html` に Content-Security-Policy (CSP) を追加。`script.js` では `document.createElement('img')` を使用。
- **ファイル監視のデバウンス処理 (Medium)**
  - 問題: AI が `game_state.json` を書き込んでいる途中で `fs.watch` が発火し、不完全な JSON をパースしてエラーになる可能性があった。
  - 修正: ファイル監視コールバックに 100ms のデバウンス処理を追加（v0.1.2 で FileSystemWatcher + 300ms に発展）。
- **ターミナルインジェクション対策 (Medium)**
  - 問題: ComfyUI を呼び出す引数がエスケープされておらず、シェルインジェクションの危険があった。
  - 修正: ダブルクォーテーションや `$` のサニタイズを追加（v0.1.2 で spawn 化により根本対応）。
- **ログ重複の解消 (Low)**
  - 問題: UI のプレイヤー発言自動追加と `SKILL.md` の記録指示が競合し、ログが重複していた。
  - 修正: `SKILL.md` からユーザー発言を記録する指示を削除。
- **ドキュメントの表現修正 (High)**
  - 問題: ブラウザ版 AI でも全自動で動くような誤解を招く記載だった。
  - 修正: `AI_HANDOVER.md` にブラウザ版 AI の手動コピペ要件を明記。

## [0.1.0] - 2026-06-24

### Added
- プロジェクトの初期構築完了。
- `extension.ts`: Webview の起動と `game_state.json` の監視ブリッジ機能を実装。
- Webview UI: Glassmorphism デザインのチャット、ステータス表示、画像ギャラリー、世界観テーマ切り替え（Fantasy/Cyberpunk 等）を実装。
- ダイス機能と計算機: `script.js` および `dice.py` を追加。
- ドキュメント: 他 AI への引き継ぎ用ドキュメント `AI_HANDOVER.md` を作成。
