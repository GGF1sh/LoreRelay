# AI Shared Log

このファイルは、すべてのAIが共通で読み書きする作業ログです。
短く、時系列で、次のAIが迷わない情報だけを書いてください。長い分析はレビュー文書に分け、ここには要約と参照だけを残します。

## Current Snapshot

- Current package version: `0.3.1`
- Main source of truth: `CHANGELOG.md` + source code
- Main remaining work:
  - README screenshots/GIF, Ko-fi real URL
  - Private scenario vault: keep out of public Git / release archives. Do not describe private contents in shared docs.
  - Phase ST-A 残: `imagePromptTemplates` の GM/SKILL 連携、テンプレ適用 UI と再生成の統合
  - Phase ST-B2/B3: Connection + Generation プリセット（名前付き JSON）
  - `extension.ts` 分割: **完了**（~454 行。詳細は下記ログ）
  - `webview/script.js` 分割: **完了**（`webview/modules/` 8 ファイル + `build-webview.js`）
  - Git push: **完了**（`f279548` まで push 済み）

## 2026-06-26 - Antigravity - Code Review Improvements (Security, Stability & Persistence)

### Summary
- Refined Content-Security-Policy (CSP) in `webview/index.html` by adding `connect-src 'none';` explicitly.
- Hardened resource disposal in `src/extension.ts` by ensuring all active background processes (`grokProcess`, `gmProcess`, `imageGenerationProcess`, and `activeScriptProcess`) are killed on Webview panel disposal (`onDidDispose`) and extension deactivation (`deactivate()`).
- Added draft state persistence (`getState` / `setState`) in `webview/script.js` for `#free-input` and `#authors-note-input` to prevent users losing their drafts when the webview is hidden, reloaded, or recreated.

### Verification
- **Checked & Verified**: Run compile (`npm run compile`) and validation suite (`npm test`) on `2026-06-26 07:10 JST` confirming successful build and no regressions.

## 2026-06-26 - Antigravity - Commit and Push Installer Scripts

### Summary
- Committed and pushed the 4 localized installer script files (`install_antigravity_skill.bat`, `install_vscode_extension.bat`, `scripts/install_antigravity_skill.ps1`, `scripts/install_vscode_extension.ps1`) to `origin/main` as requested by the user.

### Verification
- **Checked & Verified**: Ran `git status` locally in `c:\AI\text-adventure-vsce` on `2026-06-26 07:00 JST` (local timezone of the user's check environment) confirming a clean working directory and successful push to remote.

## 2026-06-26 - ChatGPT/Codex - Schema Strictness & Message Action Hardening

### Summary
- Reviewed the post-Claude/Grok/Gemini SillyTavern-related implementation with focus on schema consistency and edge cases around edit/exclude/branch actions.
- Tightened `game_state.json` validation and runtime guards so malformed entries warn cleanly instead of breaking history sync or Webview updates.
- Ensured prompt exclusion is respected by recent-history context and Memory Bank history chunks.

### Files touched
- `game_state_schema.json`
- `src/validateGameState.ts`
- `src/extension.ts`
- `src/checkpoint.ts`
- `src/memoryBank.ts`
- `scripts/validate.js`
- `test/fixtures/game_state_valid.json`
- `test/fixtures/game_state_invalid_metadata.json` (new)

### Decisions
- `entries[].id` and `profileUpdates[].characterId` now use the same safe ID pattern as runtime handlers.
- `hiddenDice[].result` is explicitly rejected in both validator behavior and JSON Schema intent.
- Invalid `entries` are warned by `validateGameState` and skipped by runtime history/UI processing.
- `excludedFromPrompt` now suppresses recent prompt context and Memory Bank history retrieval, not just Webview opacity.

### Remaining / Next
- Existing unrelated installer-script changes were already present before this pass and were not touched.
- A future pass can add real unit tests around `checkpoint.ts` and edit/exclude handlers if the project moves beyond the current lightweight `scripts/validate.js`.

### Verification
- `npm run compile` passed
- `npm test` passed
- `git diff --check` passed with only CRLF conversion warnings

## 2026-06-26 07:22 JST - Grok - push + 追加分割（webview / scenarioPack）

### Push
- `origin/main` へ push 完了: `ca00a2e..f279548`（webviewHandlers / gameStateSync / 8-module refactor / log fix）

### 分割ログ

| 時刻 (JST) | コミット | 対象 | 内容 | 行数 |
|:---|:---|:---|:---|:---|
| 07:22 | (this) | `webview/modules/*.js` | `script.js` を 8 モジュールへ分割。`scripts/build-webview.js` で結合、`compile` に統合 | 単体最大 495 行（`10-game-state.js`） |
| 07:22 | (this) | `src/scenarioPack.ts` | `loadScenarioPack` / `validateScenarioPack` / `exportScenarioPack` | `extension.ts` 660→454 |

#### webview モジュール構成
- `00-core.js` — vscode API, i18n, 状態変数
- `10-game-state.js` — ゲーム状態適用・メッセージ描画・UI
- `20-input-audio-prep.js` — 入力・STT・チェックポイント・ローディング
- `30-bgm-sfx.js` — BGM / SE
- `40-dice-calc-tabs.js` — ダイス・電卓・タブ
- `50-character-saga.js` — キャラ・アーカイブ・インライン編集
- `60-tts-quickreply-imagegen.js` — TTS・Quick Reply・Image Gen 設定
- `90-bootstrap.js` — DOMContentLoaded 初期化・postMessage ルーター

### 残りの長いファイル（次回候補）
- `webview/style.css` (~1,251 行) — コンポーネント別 CSS 分割は任意
- `TextAdventureGMSkill/scripts/gm_bridge_common.py` (~467 行, Git 外)

### Verification
- `npm run compile` / `npm test` — 2026-06-26 07:22 JST OK

## 2026-06-26 07:19 JST - Grok - extension.ts 分割（第三〜十歩: 一括完了）

### 分割ログ（時系列・行数 Before/After）

| 時刻 (JST) | コミット | 抽出ファイル | 移した主な関数・責務 | extension.ts 行数 |
|:---|:---|:---|:---|:---|
| 07:19 | `2fe4e10` | `workspacePaths.ts` | `getActiveWorkspaceFolder`, `getWorkspacePath`, `getGameStatePath`, `getHistoryPath`, `getGmProvider` | 2,251 → 2,197 |
| 07:19 | `2fe4e10` | `skillScriptRunner.ts` | `resolveGmBridgeScript`, `resolvePythonCommand`, `getMemoryBackendSetting`, `buildLocalGmEnv`, `runSkillScript`, `killActiveScriptProcess` | → 2,141 |
| 07:19 | `2fe4e10` | `gmBridgeRunner.ts` | `getGmBridgeOutputChannel`, `invokeGmBridge` 系（Grok/Ollama/Kobold/OpenRouter/カスタム）, `fallbackToClipboard`, `killGmBridgeProcesses` | → 1,799 |
| 07:19 | `2fe4e10` | `imageGenRunner.ts` | `resolveComfyScript`, `getSkillDir`, `buildImageGenEnv`, `runImageGeneration`, `applyImageToEntryById`, `runListImageModels`, Image Gen 設定パネル | → 1,516 |
| 07:19 | `2fe4e10` | `mediaManifest.ts` | `sendBgmManifest`, `sendSfxManifest`, `startMediaManifestWatchers` | → 1,379 |
| 07:19 | `2fe4e10` | `characterManager.ts` | キャラ CRUD, パーティ, `sendCharacterList`, `generatePortrait`, `uploadPortrait` | → 1,115 |
| 07:19 | `2fe4e10` | `gmPromptBuilder.ts` | `buildGmPromptContext`, `buildGrokPrompt`, `processProfileUpdates`, `maybeSuggestArchive`, lorebook/memory/party 文脈 | → 796 |
| 07:19 | `2fe4e10` | `checkpointHandlers.ts` | Undo/Rewind/Checkpoint/再生成, `handleEditEntry`, `handleToggleExcludeEntry`, `archiveSaga`, `summarizeHistory` | → **660** |

### パターン
- 各モジュールは `initXxx(deps)` で `getPanel` 等を依存注入（`gameStateSync` と同型）。
- `extension.ts` に残すもの: `activate`/`deactivate`, シナリオ読込, OpenRouter キー管理, locale, `handlePlayerInput`, ST インポートコマンド, `createWebviewHandlerDeps`。

### Files touched
- `src/workspacePaths.ts`, `src/skillScriptRunner.ts`, `src/gmBridgeRunner.ts`, `src/imageGenRunner.ts`, `src/mediaManifest.ts`, `src/characterManager.ts`, `src/gmPromptBuilder.ts`, `src/checkpointHandlers.ts`, `src/extension.ts`, `CHANGELOG.md`, `AI_SHARED_LOG.md`, `C:\AI\GROK_CODE_REVIEW.md`

### Verification
- `npm run compile` — 2026-06-26 07:19 JST OK
- `npm test` — 2026-06-26 07:19 JST OK

## 2026-06-26 - Grok - extension.ts 分割（第二歩: gameStateSync）

### Summary
- `gameStateSync.ts`: `sendCurrentState`、FileSystemWatcher、`game_history.json` 読み書き、`safeImageUri`、履歴蓄積ロジックを分離。`initGameStateSync(deps)` で依存注入。
- `extension.ts` ~2,763 → ~2,481 行。累計 ~380 行削減。

### Files touched
- `src/gameStateSync.ts` (new), `src/extension.ts`, `CHANGELOG.md`, `AI_SHARED_LOG.md`, `C:\AI\GROK_CODE_REVIEW.md`

### Verification
- `npm run compile` / `npm test`

## 2026-06-26 - Grok - extension.ts 分割（第一歩: webviewHandlers）

### Summary
- `webviewHandlers.ts`: 全 postMessage ルーティング（30+ message types）を `extension.ts` から切り出し。
- `entryId.ts`: `isValidEntryId` を共通化。
- `extension.ts` ~2,865 → ~2,763 行。compile + test 通過。

### Files touched
- `src/webviewHandlers.ts` (new), `src/entryId.ts` (new), `src/extension.ts`, `CHANGELOG.md`, `C:\AI\GROK_CODE_REVIEW.md`, `AI_SHARED_LOG.md`

### Verification
- `npm run compile` / `npm test`

## 2026-06-26 - Grok - 第二回コードレビュー文書更新

### Summary
- `C:\AI\GROK_CODE_REVIEW.md` に v0.3.1 時点の第二回全体レビューを追記。React/.bat 未整備などの誤記を訂正、#24〜30 の新指摘表・就活評価・優先順位を更新。

### Files touched
- `C:\AI\GROK_CODE_REVIEW.md`, `AI_SHARED_LOG.md`

## 2026-06-26 - Grok - v0.3.1 Phase ST-A (Image Gen Settings)

### Summary
Gemini/Codex プランに沿い Phase ST-A を実装。ワークスペース `image_gen_config.json` + Webview 🎨 設定パネル + `comfyui_generate.py` 連携。v0.3.0 で欠けていた locales（quickReply / msg / imageGen）も 4 言語追加。

### Files touched
- `src/imageGenConfig.ts` (new)
- `src/extension.ts`
- `TextAdventureGMSkill/scripts/comfyui_generate.py`
- `webview/index.html`, `webview/script.js`, `webview/style.css`
- `locales/*.json`, `package.json`, `CHANGELOG.md`, `AI_SHARED_LOG.md`

### Verification
- `npm run compile`
- `npm test`
- `python -m py_compile comfyui_generate.py`

## 2026-06-26 - Claude Sonnet 4.6 - v0.3.0 ST Phase ST-B + ST-D 実装

### Summary
SillyTavern 参考画像 (#9, #16, #17, #18) の UI パターンを LoreRelay に取り込んだ。

- Quick Reply バー (`#quick-reply-bar`): 入力欄直上に横スクロール対応のショートカットボタンバーを追加（7ボタン）
- Message Action Bar (`.msg-actions`): 各メッセージホバーでアイコンボタンバーを表示（7ボタン）
- インライン編集: ✏️ → textarea 切替 → 保存 → `game_state.json` 即時更新
- バックエンド新ハンドラ: `editEntry` / `toggleExcludeEntry` / `branchFromEntry` / `loadScenario`
- `GameEntry` 型に `excludedFromPrompt?` / `editedAt?` を追加・スキーマ反映

参考資料: `C:\AI\SillyTavern参考画像\PLAN.md`, `C:\AI\SillyTavern参考画像\INDEX.md`, `C:\AI\text-adventure-vsce\implementation_plan.md`

### Files touched
- `src/types/GameState.ts`
- `game_state_schema.json`
- `src/extension.ts`
- `webview/index.html`
- `webview/script.js`
- `webview/style.css`
- `CHANGELOG.md`, `AI_SHARED_LOG.md`, `AI_HANDOVER.md`, `DEVELOPMENT_TIMELINE.md`, `SILLYTAVERN_COMPAT.md`

### Verification
- `npm run compile` 通過 (TypeScript エラーなし)

## 2026-06-26 - Antigravity - Localize installer scripts in 4 languages

### Summary
- Localized the installer scripts (`install_vscode_extension.bat` and `install_antigravity_skill.bat`) into 4 languages (en, ja, zh-CN, zh-TW).
- Migrated processing to Unicode-compliant PowerShell scripts (`scripts/install_vscode_extension.ps1` and `scripts/install_antigravity_skill.ps1`) to prevent CMD Mojibake/syntax crash issues on different locale code pages.
- Created `locales/installer.json` to store localization strings.
- Kept lightweight, ASCII-only `.bat` files in the root directory for easy double-clicking.

### Verification
- **Checked & Verified**: The user manually ran `install_antigravity_skill.bat` and `install_vscode_extension.bat` (after compiling the VSIX package via `vsce package`) locally in `c:\AI\text-adventure-vsce` on `2026-06-26 05:23 JST` and confirmed correct CJK console display and successful installation.

## 2026-06-26 - Grok - v0.2.11 review fixes (image regen / VSIX / LICENSE)

### Summary
- Image regen: `entryId` + `applyImageToEntryById` + Webview `updateEntry`（履歴と game_state の ID 一致）。
- `.vscodeignore` 拡充、MIT `LICENSE`、`install_antigravity_skill.bat` フォールバック、`imagePrompt` 検証。

### Files touched
- `src/extension.ts`, `webview/script.js`, `src/validateGameState.ts`, `.vscodeignore`, `LICENSE`, `install_antigravity_skill.bat`, `CHANGELOG.md`

## 2026-06-26 - Codex - Pre-publication docs/package cleanup

### Summary
- Added a conservative README roadmap note for Remote Play Mode (LAN/Tailscale, no direct public exposure).
- Fixed VSIX packaging ignore rules so compiled `out/` is not excluded.
- Removed concrete private vault path wording from the shared log.
- Made the private vault packaging helper path-agnostic.

### Files touched
- `README.md`
- `.vscodeignore`
- `AI_HANDOVER.md`
- `AI_COLLABORATION.md`
- `AI_SHARED_LOG.md`
- `scripts/package_private_vault.ps1`

### Verification
- `npm run compile` passed
- `npm test` passed
- `package_private_vault.ps1` PowerShell syntax check passed

## 2026-06-26 - Grok - v0.2.10 Claude review fixes (R1/R2)

### Summary
- Claude v0.2.9 フルレビューの Medium 2件を修正: checkpointId 検証、Retry の gameOver ガード。
- `isGameOverActive()` を `handlePlayerInput` / `handleRegenerateLastTurn` で共有。

### Files touched
- `src/checkpoint.ts`, `src/extension.ts`, `CHANGELOG.md`, `package.json`, `C:\AI\CLAUDE_REVIEW.md`

## 2026-06-26 - Claude Sonnet 4.6 - v0.2.9 フルレビュー

### Summary
- 新規 Medium 2件（checkpointId path traversal / Retry の gameOver ガード欠如）。High/Critical なし。
- 既存 GROK/Claude 指摘は全対応済みを確認。修正後リリース可と判断。

## 2026-06-25 - Grok - v0.2.9 DREAMIO features + workshop + AI Dungeon refs

### Summary
- gameOver overlay + SKILL.md presets; checkpoint save/restore + rewind-to-turn; regenerate (Retry); Author's Note; Scenario Workshop export/validate.
- SCENARIO_WORKSHOP.md, package_scenario.py, lost-catacombs gameOver strict preset.

### Verification
- `npm run compile` passed
- `npm test` passed (180 keys / locale)
- `package_scenario.py` smoke test passed (lost-catacombs)

## 2026-06-25 - Grok - v0.2.8 security + DREAMIO STT

### Summary
- Grok bridge: `-p` → `--prompt-file` via `writePromptFile()` (no prompt in process args).
- Custom command bridge: `{actionFile}` placeholder; default args use `--prompt-file {actionFile}`.
- `--yolo` → `--always-approve` (current grok CLI).
- DREAMIO-inspired voice input (STT): 🎤 button, Web Speech API, 4 locales.
- Promoted Undo/TTS from [Unreleased] to v0.2.8; updated GROK_CODE_REVIEW.md.

### Files touched
- `src/playerAction.ts`, `src/extension.ts`, `package.json`
- `webview/index.html`, `webview/script.js`, `webview/style.css`
- `locales/*.json`, `CHANGELOG.md`, `AI_SHARED_LOG.md`, `GROK_CODE_REVIEW.md`

### Verification
- `npm run compile` passed
- `npm test` passed (147 keys / locale)

## 2026-06-25 - Antigravity - Implement 1-Turn Undo (Rewind) Feature

### Summary
- Implemented DREAMIO-inspired 1-turn Undo (rewind) feature.
- Enhanced `gameEntryHistory` to store metadata snapshots (`status`, `options`, `theme`, `bgm`, `mood`, `sfx`, `latestImage`, `background`, `sprite`, `summary`) inside `game_history.json` for precise rollbacks.
- Added `undo-btn` button (`⏪ Undo`) to the Webview input area and wired it to send an `undoLastTurn` message.
- Implemented `handleUndoLastTurn` in `extension.ts` to pop the last User and GM entries, write the reverted snapshot back to `game_state.json`, refresh the log UI, and trigger speech cancellation.
- Added localization strings in 4 languages (ja, en, zh-CN, zh-TW).

### Files touched
- `locales/ja.json`, `en.json`, `zh-CN.json`, `zh-TW.json`
- `webview/index.html`
- `webview/script.js`
- `src/extension.ts`
- `CHANGELOG.md`

### Verification
- `npm run compile` passed
- `npm test` passed (143 keys validated successfully)

## 2026-06-25 - Antigravity - Implement AI Voice Narration (TTS)

### Summary
- Implemented Web Speech API-based AI Voice Narration (TTS) feature inside the Webview, inspired by DREAMIO.
- Added Voice Settings pop-up panel (Enabled, Speed rate, Volume controls) near the language select menu.
- Handled automatic speech cancellation upon player input (free text / click choices).
- Supported dynamic, localized voice matching for 4 languages (ja, en, zh-CN, zh-TW).
- Updated state persistence to save TTS preferences.
- **Fixed**: Used optional chaining (`?.`) and checked `SpeechSynthesisUtterance` availability to prevent JS crashes on browsers/platforms that do not support speech synthesis.

### Files touched
- `locales/ja.json`, `en.json`, `zh-CN.json`, `zh-TW.json`
- `webview/index.html`
- `webview/style.css`
- `webview/script.js`
- `CHANGELOG.md`

### Verification
- `npm run compile` passed
- `npm test` passed (139 keys validated successfully)

## 2026-06-25 - Antigravity - Fix runImageGeneration multi-root WS bug

### Summary
- Fixed `runImageGeneration()` to resolve workspace path via `getWorkspacePath()` instead of hardcoded `workspaceFolders[0]`.

### Files touched
- `src/extension.ts`

### Verification
- `npm run compile` passed
- `npm test` passed

## 2026-06-25 - Grok - Pre-release security hardening (v0.2.7)

### Summary
- ChatGPT code review items: character ID path validation, action redaction via `--action-file`, expanded `.gitignore`, safe lorebook import, extended `validateGameState` + fixtures, calc Enter fix, README OpenRouter wording.

### Verification
- `npm run compile` passed
- `npm test` passed (135 keys / locale + validateGameState fixtures)

## 2026-06-25 - Grok - Auto archive prompt + ChromaDB (v0.2.6)

### Summary
- Provider-aware archive suggest (30 vs 80 turns). Optional ChromaDB memory backend.

### Verification
- `npm run compile` passed
- `npm test` passed (133 keys / locale + archive milestone cases)
- `memory_bank.py --rebuild --backend auto` passed (tfidf fallback when chromadb absent)
- `pip install chromadb` + `--rebuild --backend chromadb` passed (2 chunks, all-MiniLM-L6-v2)
- `memory_bank.py --resolve --text ... --json` passed
- Post-archive milestone reset fix in `archiveSaga()` (re-prompt after next threshold)

## 2026-06-25 - Grok - Saga Archiver + Memory Bank (v0.2.5)

### Summary
- CHIM/Bannerlord phase 2: `archive_saga.py`, `memory_common.py`, `memory_bank.py`, `src/memoryBank.ts`.
- Saga chapters in `sagas/`, TF-IDF memory injection for Grok + local LLM bridges.

### Verification
- `npm run compile` passed
- `npm test` passed (127 keys / locale)
- `memory_bank.py --rebuild` + `--resolve` smoke test passed

## 2026-06-25 - Grok - v0.2.4 polish (Antigravity [Unreleased] 仕上げ)

### Summary
- Read `CHANGELOG.md` + `AI_SHARED_LOG.md` first; fixed gaps in Antigravity's Dynamic Profiles / Party / Summarizer / OpenRouter work.
- `charPartyCb` bug, Grok prompt parity (party + dynamic + summary), `profileUpdates` processing for Grok path, meta JSON exclusion, i18n.

### Verification
- `npm run compile` passed
- `npm test` passed (122 keys / locale)

## 2026-06-25 - Antigravity - Dynamic Profiles & OpenRouter

### Summary
- **Dynamic Profiles:** Implemented memory updates. The GM can output `profileUpdates` to modify an NPC's relationship/memory. Saves to `characters/dynamic_profiles.json` and injects into future prompts without touching original character cards.
- **OpenRouter GM Provider:** Added `openrouter_gm.py` and VSCode settings (`apiKey`, `model`). Users can now use Claude 3.5 Sonnet, GPT-4o, etc. directly from the UI.

### Verification
* `npm run compile` passed.
* Tested schema updates and parsing logic.

## 2026-06-25 - Antigravity - Party System & Context Summarizer

### Summary
- Context Summarizerの実装 (`extension.ts` と `summarize_gm.py` の追加、UI側からの呼び出し連携)
- パーティーシステム（複数キャラ同行）のUI（チェックボックス）とデータ保存（`party.json`）
- GMプロンプトに「【現在の同行メンバー / パーティー】」としてキャラ情報を注入する処理 (`gm_bridge_common.py`)

### Verification
* v0.2.3のCharacter Profile SystemはComfyUIと連携し正しく動作することを確認（ユーザー報告に基づく）。
* パーティーシステムのチェックボックス変更時に `party.json` へ保存される処理と、複数キャラクターの設定が `gm_bridge_common.py` によってLLMへ注入される処理を実装した。
* 履歴要約機能において、Grok, Ollama, KoboldCPP のAPIを叩いて履歴を要約する `summarize_gm.py` スクリプトを実装。Webviewのボタンクリックから連携可能になった。UI上で要約の手動修正も可能。

## 2026-06-25 - Grok - SillyTavern compat + v0.2.3 (resumed after cancel)

### Summary
- ST character/lorebook import commands, GM prompt injection (character + lorebook), VN `background`/`sprite`, Character Profile i18n.
- `package.json` v0.2.3, `SILLYTAVERN_COMPAT.md`, import scripts, consolidated CHANGELOG.

### Files touched
- `package.json`, `locales/*.json`, `webview/index.html`, `webview/script.js`
- `src/extension.ts` (already had import + buildGmPromptContext)
- `TextAdventureGMSkill/scripts/gm_bridge_common.py`, `SKILL.md`
- `CHANGELOG.md`, `AI_HANDOVER.md`

### Verification
- `npm run compile` passed
- `npm test` passed (114 keys / locale)
- `import_st_card.py` / `import_st_lorebook.py` / `resolve_lorebook.py` smoke test passed

## 2026-06-25 - Grok - Quick setup scripts (setup.ps1 / setup.sh)

### Summary
- `scripts/setup.ps1` + `scripts/setup.sh`: detect skill, npm build, game workspace + settings, multi-root `.code-workspace`, optional VSIX install.

### Verification
- `setup.ps1 -SkipVsix` passed on Windows (C:\AI layout)

## 2026-06-25 - Grok - Release v0.2.2

### Summary
- Promoted `[Unreleased]` (hiddenDice, diceRequest, CI, schema validation, image placeholder, Antigravity guide) to **v0.2.2**.
- Bumped `package.json`, synced `AI_HANDOVER.md`.

### Verification
- `npm run compile` passed
- `npm test` passed (v0.2.2)

## 2026-06-25 - Claude - GM ダイス要求（diceRequest）+ 自動ロール機能

### Summary
- `diceRequest` フィールドで GM がユーザーにダイスを振らせられるように。
- Webview が自動ロール → `playSfxAsync` で音の成否を検出 → 失敗時はフォールバックメッセージ表示。
- `rollDice(count, sides, skipSound)` に `skipSound` パラメータ追加（自動ロール時に重複再生を防ぐ）。
- `lastDiceRequestId` で同一要求の重複処理を防止。
- `SKILL.md` に diceRequest の使用手順を追記。

### Files touched
- `src/types/GameState.ts` (`DiceRequest` 型、`GameState.diceRequest` フィールド)
- `game_state_schema.json` (diceRequest スキーマ)
- `webview/script.js` (playSfxAsync, rollDice skipSound, handleDiceRequest, applyGameState, lastDiceRequestId)
- `locales/*.json` (requestBanner / requestFallback / requestInvalid キー × 4 ファイル)
- `C:\AI\TextAdventureGMSkill\SKILL.md` (diceRequest セクション追加)

### Decisions
- 音が鳴らない = 「ユーザーが体験できていない」とみなしフォールバックを表示（ブラウザ autoplay 制限対策）。
- `id` フィールドは任意。省略時は `notation|purpose` を dedup キーに使用。

### Verification
- `npm run compile` パス
- `npm test` パス（94 keys / locale）

---

## 2026-06-25 - Claude - 隠しダイスロール（GM スクリーン）機能

### Summary
- `game_state.json` に `hiddenDice` フィールドを追加。GM が出目を書かずに「振った事実」だけを通知できる。
- Webview は「🎲 GM が 1d20 を振りました（遭遇判定）」+ ダイス音を表示。出目はユーザーに見えない。
- `extension.ts` で Webview 送信前に `result` フィールドをストリップ（defence in depth）。
- `SKILL.md` に「隠しダイスロール（GMスクリーン）」セクションを追加。

### Files touched
- `src/types/GameState.ts` (`HiddenDiceEntry` 型、`GameState.hiddenDice` フィールド)
- `game_state_schema.json` (hiddenDice スキーマ)
- `src/extension.ts` (import 更新、result ストリップ、hiddenDice を Webview に送信)
- `webview/script.js` (applyGameState で hiddenDice → 通知 + `playSfx('dice')`)
- `locales/ja.json`, `en.json`, `zh-CN.json`, `zh-TW.json` (webview.dice.hiddenRoll キー追加)
- `C:\AI\TextAdventureGMSkill\SKILL.md` (隠しダイスロールセクション追加)

### Decisions
- `purpose` フィールドは任意。省略時はラベルなしで通知される。
- `result` フィールドはスキーマに含めず、extension 側でも除去する二重防護。

### Verification
- `npm run compile` パス
- `npm test` パス（91 keys / locale）

---

## 2026-06-25 - Claude - Antigravity 連携ガイド

### Summary
- `ANTIGRAVITY_GUIDE.md` を新規作成。clipboard モード（手動ペースト運用）と command モード（CLI 全自動）の2通りを解説。
- `GM_BRIDGE_PRESETS.md` の clipboard セクションを拡充し、`ANTIGRAVITY_GUIDE.md` へ参照追加。比較表の列名・内容を整理。
- `README.md` の Mode A に Antigravity 向け案内文と `ANTIGRAVITY_GUIDE.md` へのリンクを追加。

### Files touched
- `ANTIGRAVITY_GUIDE.md` (new)
- `GM_BRIDGE_PRESETS.md`
- `README.md`

### Decisions
- Antigravity の内部 CLI 仕様は不明なため、`command` セクションはプレースホルダ形式で「実際の CLI に合わせてください」と明記。
- clipboard モードを主軸に据え、動作フローを箇条書きで明確に示した。

### Verification
- `npm run compile` パス
- `npm test` パス

---

## 2026-06-25 - Claude - ランタイム JSON Schema 検証

### Summary
- `extension.ts` に `validateGameState()` を追加（外部ライブラリなし）。
- `game_state.json` 読み込み後に呼び出し、違反があれば GM Bridge 出力チャンネルにログ + セッション初回のみ `showWarningMessage`。
- 違反があっても処理は継続（graceful degradation）。
- 検証対象: `entries` 配列必須・各エントリの必須フィールドと型・`role` enum・`options` 配列・`status.hp/mp` のバー構造。

### Files touched
- `src/extension.ts`（`validateGameState()` 追加、`schemaWarningShown` フラグ追加、`sendCurrentState` 内で呼び出し）

### Decisions
- Ajv などの外部ライブラリを使わず、インライン実装。既存の devDependencies 構成を変えない。
- 警告は `schemaWarningShown` フラグで初回のみ表示（ファイル変更のたびに通知が出ないよう制御）。

### Verification
- `npm run compile` パス
- `npm test` パス

---

## 2026-06-25 - Claude - 画像ブロック時プレースホルダ UI (image placeholder)

### Summary
- 画像パスがセキュリティポリシーでブロックされたとき、チャットログにプレースホルダを表示するように修正。
- `extension.ts`: `safeImageUri` が undefined を返した場合、`e.imageBlocked = true` を entry に付与して Webview に通知。
- `script.js`: `entry.imageBlocked` を検出し、ロックアイコン付きの `div.scene-img-placeholder` を描画。
- `style.css`: `.scene-img-placeholder` スタイル（破線ボーダー、半透明グラス調）を追加。
- `GameState.ts`: `GameEntry.imageBlocked?: boolean` を型定義に追加。
- 4 ロケール: `webview.image.blocked` キーを追加（ja/en/zh-CN/zh-TW）。

### Files touched
- `src/extension.ts`
- `src/types/GameState.ts`
- `webview/script.js`
- `webview/style.css`
- `locales/ja.json`, `en.json`, `zh-CN.json`, `zh-TW.json`

### Verification
- `npm run compile` パス
- `npm test` パス（90 keys / locale）

---

## 2026-06-25 - Claude - GitHub Actions CI 追加

### Summary
- `.github/workflows/ci.yml` を新規作成。push/PR 時に `npm ci` → `npm run compile` → `npm test` を ubuntu-latest で実行。
- Node.js 20 + npm cache で高速化。

### Files touched
- `.github/workflows/ci.yml` (new)
- `AI_SHARED_LOG.md`

### Decisions
- Node.js バージョンは LTS 20（VSCode 拡張として stable 版で検証）。
- `npm ci` を使用（`npm install` ではなく lock-file 固定）。

### Verification
- `npm run compile` ローカルパス済み
- `npm test` ローカルパス済み（All validations passed）

---

## 2026-06-24 - Grok - i18n (ja/en/zh-CN/zh-TW) (v0.2.1)

### Summary
- Added `textAdventure.locale`, `locales/*.json`, `src/i18n.ts`, Webview language dropdown, localized extension messages and GM prompts.

### Files touched
- `locales/ja.json`, `en.json`, `zh-CN.json`, `zh-TW.json`, `src/i18n.ts`
- `src/extension.ts`, `webview/index.html`, `webview/script.js`, `webview/style.css`
- `TextAdventureGMSkill/scripts/gm_bridge_common.py`, `ollama_gm.py`, `koboldcpp_gm.py`
- `package.json`, `scripts/validate.js`, `CHANGELOG.md`, `README.md`, `AI_HANDOVER.md`

### Verification
- `npm run compile` passed
- `npm test` passed (4 locale files, 89 keys each)

## 2026-06-24 - Grok - Ollama / KoboldCPP GM Bridge Presets (v0.2.0)

### Summary
- Added `ollama` and `koboldcpp` GM bridge providers with Python scripts that call local LLM APIs, roll `{{DICE:...}}` via `dice.py`, and write `game_state.json`.
- Preset guide: `GM_BRIDGE_PRESETS.md`.

### Files touched
- `TextAdventureGMSkill/scripts/gm_bridge_common.py`, `ollama_gm.py`, `koboldcpp_gm.py` (new)
- `src/extension.ts`, `package.json`
- `CHANGELOG.md`, `GM_BRIDGE_PRESETS.md`, `README.md`, `AI_HANDOVER.md`, `AI_SHARED_LOG.md`

### Decisions
- Local LLM bridges do not auto-run ComfyUI; narrative + game_state only.
- Output channel renamed to "Text Adventure: GM Bridge".

### Verification
- `npm run compile` passed
- `npm test` passed
- `gm_bridge_common.py` dice substitution smoke test passed

## 2026-06-24 - Grok - Code Review Fixes (v0.1.9)

### Summary
- Implemented generic GM bridge (`grok` / `clipboard` / `command`), multi-root workspace folder setting, stricter image path policy, dice-to-GM button, `npm test`, and `GameState` type import in extension.

### Files touched
- `src/extension.ts`
- `package.json`
- `webview/index.html`, `webview/script.js`, `webview/style.css`
- `scripts/validate.js` (new)
- `CHANGELOG.md`, `AI_SHARED_LOG.md`, `AI_HANDOVER.md`

### Decisions
- `gmBridge.provider=command` uses arg array with `{action}`/`{cwd}` placeholders; Ollama users can configure their own spawn args.
- Image paths outside workspace/skill are rejected (not just missing-file check).
- Kept `grokBridge.*` settings for backward compatibility; `gmBridge.provider` takes precedence when set.

### Remaining / Next
- Add GitHub Actions workflow running `npm run compile && npm test`.
- README demo GIF per Antigravity log.

### Verification
- `npm run compile` passed
- `npm test` passed

## 2026-06-25 00:00 JST - Antigravity - GameState Schema & CRPG UI

### Summary
- Defined TypeScript interface (`GameState.ts`) and JSON schema (`game_state_schema.json`) to enforce structured GameState.
- Enhanced Webview to render a CRPG-like character sheet (HP/MP bars, condition/inventory/skills tags).
- Updated GM prompt (`SKILL.md`) to output this new structure.
- Updated `README.md` to highlight "Hacker Edition" philosophy and CRPG elements inspired by Saga & Seeker.

### Files touched
- `src/types/GameState.ts` (New)
- `game_state_schema.json` (New)
- `webview/index.html`
- `webview/style.css`
- `webview/script.js`
- `C:\AI\TextAdventureGMSkill\SKILL.md`
- `README.md`
- `CHANGELOG.md`

### Decisions
- Replaced flat status representation with a highly structured object containing HP/MP progress bars and arrays for items/skills.
- Left the Ko-fi link as a placeholder in `README.md` per user's preference.

### Remaining / Next
- Create screenshots or a demo GIF showcasing the new CRPG Character Sheet and update `README.md` media.
- Investigate image generation issues (e.g. tattoos) with ComfyUI prompt adjustments if requested by the user.

### Verification
- `npm run compile` passed in `C:\AI\text-adventure-vsce`.

## 2026-06-24 23:30 JST - ChatGPT - Collaboration Protocol Added

### Summary
- Added a common collaboration rule file and this shared log so future AI agents know where to read and write status.
- Clarified that implementation facts belong in source code and `CHANGELOG.md`, while opinions and long analysis belong in review documents.

### Files touched
- `AI_COLLABORATION.md`
- `AI_SHARED_LOG.md`
- `AI_HANDOVER.md`
- `CHANGELOG.md`

### Decisions
- `AI_SHARED_LOG.md` is the shared write/read surface for all AI agents.
- `AI_COLLABORATION.md` defines which information belongs in which file.
- Review files remain useful, but they are not the source of truth for implementation status.

### Remaining / Next
- Replace README donation placeholder links with real URLs.
- Add screenshots or a demo GIF before public release.
- Consider adding `GameState` schema next; it will reduce drift between GM output and Webview parsing.

### Verification
- `npm run compile` passed in `C:\AI\text-adventure-vsce`.
