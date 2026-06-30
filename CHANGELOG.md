# Changelog

このファイルは、プロジェクトの変更履歴を記録したものです。新しいAIがプロジェクトに参加する際、`AI_HANDOVER.md` と共にこのファイルを読むことで、過去の経緯や修正の理由を素早く把握できます。

関連レビュードキュメント
- `C:\AI\GROK_CODE_REVIEW.md` — Grok によるコードレビュー指摘と対応状況
- `C:\AI\GEMINI_REVIEW.md` — Gemini による全体評価・ビジネスモデル提案
- `C:\AI\CLAUDE_REVIEW.md` — Claude による実装改善・Saga & Seeker 競合分析

## [Unreleased]

### Fixed

- **i18n** — Quick Reply（`export` / `forceSpeak` / `questFlow` / `relations`）、Character 装備・操作主体、Inspector hidden state、OOC empty、World 地図ボタンなど 19+ キーを 4 言語に追加。`scripts/check_i18n_keys.js` を `npm test` に統合。
- **Cartography ComfyUI** — `comfyui_generate_cartography.py` が許可外の一時 layout 名（`cartography_layout_{uuid}.png`）を使っていたため、既存の `world_map.layout.png` を再利用するか `cartography_layout.png` にフォールバックするよう修正（v1.7.3 パス検証と整合）。
- **i18n — World タブ残存漏れ** (Claude review) — `85-world.js` に 21 キーを T() 化（World Forge UI 全ラベル、シーン履歴/NPC/イベント/World Changes 見出し、派閥空状態、シム Power/Morale バー、Scene Image ボタン状態、マップパンヒント）。4 言語に 21 キーを追加。`webview.inspector.noHiddenState` も 4 言語追加。
- **`check_i18n_keys.js`** — JS ファイル内の `T()` (大文字) を拾わないバグを修正（正規表現 `(?:t|i18n)` → `(?:T|t|i18n)`）。これにより Grok が追加した `T()` 呼び出しも検証対象に。
- **i18n — ゲームルールダイアログ ツールチップ** — 「高度なAIルール」配下 6 チェックボックスの `title` 属性（英語ハードコード）を `data-i18n-title` に変換し、4 言語にツールチップキー（`tipSkillCommentary` 等 6 件）を追加。
- **UX — World タブ位置** — 9 タブ中 8 番目で画面外に隠れていた「ワールド」タブを 4 番目（Inspector の直後）に移動。スクロール不要でアクセス可能に。
- **UX — タブバー横スクロール** — 通常マウスホイール（縦）でタブバーを横スクロール可能に。ポインタドラッグ（クリック&左右スライド）にも対応。ドラッグ後の誤クリック抑止を追加。CSS に `cursor: grab` を追加してスクロール可能であることを示す。
- **重大 — タブ切り替えが冒険ステータス以外で機能しない** — CSS `.tab-pane:not(.active){display:none!important}` と JS の inline `style.display` 方式が矛盾し、`.active` クラスが tab-pane に付け替わらないため `!important` が inline スタイルに勝ち、冒険ステータス以外の全タブ（キャラクター/インスペクター/ワールド等）が真っ黒（非表示）になっていた。JS のタブ切り替えで `.active` クラスと inline display の両方を切り替えるよう修正。
- **重大 — タブクリックが全滅** — タブバー横スクロールの `setPointerCapture` が click イベントを tabsHeader に再ターゲットし、全 `.tab-btn` の click ハンドラーを無効化していた。`setPointerCapture` を除去し document レベルの pointer 追跡に変更。
- **World タブのデータ未取得** — タブを開いた際に `loadWorld` を送信してワールドデータをプッシュするよう修正。
- **重大 — 右側タブが空白になる** — ステータスタブ切替を `#status-tabs` の委譲ハンドラへ統一し、対象 pane の null ガードと `.tab-pane.active { display:flex!important; }` を追加。ボタンの active 表示と pane 表示が食い違っても、キャラクター/ワールド等の pane が確実に再表示されるよう修正。
- **重大 — Webview アセットのキャッシュで修正が反映されない** — `asWebviewUri` で生成する `script.js`/`style.css`/Mermaid vendor の URI にキャッシュバスター（各ビルド成果物の mtime を `?v=` で付与）が無く、Webview の Chromium が古い JS/CSS をディスクキャッシュして `Reload Window` でも反映されなかった。`extension.ts` でアセット URI にバージョンクエリを付与。以降はリロードで確実に最新が反映される（初回のみ Extension Host の完全再起動が必要）。
- **重大 — VSIX インストーラーが古い拡張を再インストールする** — README のSVG参照で VSIX 作成が失敗した後、インストーラーが残存していた `lorerelay-1.5.3.vsix` を拾ってインストールしていた。README画像をPNGへ変更し、インストーラーを「現在の `package.json` version の VSIXを明示生成・旧 `miya.lorerelay` をアンインストール・生成失敗時は停止」へ修正。
- **Installer i18n** — `install_vscode_extension_zh-CN.bat` / `install_vscode_extension_zh-TW.bat` の成功・失敗メッセージと終了コード返却を日本語版と同じ構成に統一。`install_antigravity_skill.bat` にも UTF-8 codepage 指定を追加。
- **重大 — インストール版が `command not found` で起動しない** — `.vscodeignore` が `node_modules/**` を除外していたため、Remote Play の実行時依存 `ws` が VSIX に含まれず、activation 時に `Cannot find module 'ws'` で拡張が落ちていた。VSIX に `node_modules/ws` のみ含める例外を追加。

### Changed

- **AI handover docs** — `AI_HANDOVER.md` 全面更新（v1.7.3、`turn_result` フロー）、`AI_SHARED_LOG.md` Current Snapshot 刷新、`AI_ROADMAP.md` Phase 7/8 追記。
- **UTF-8 統一** — 文字化けしていた 14+ Markdown を UTF-8 で書き直しまたはスタブ化。`.editorconfig`、`scripts/validate_utf8_docs.js` を追加。`AI_HANDOVER_PROMPTS.md` を v1.7.3 に更新。
- **VS Code ChatGPT 用** — `VSCODE_CHATGPT_CATCHUP.md`（v1.6.3 止まり向けコンテキスト更新プロンプト）を追加。
- **AITest レビュー流れ** — `CHATGPT_INTEGRATION_REVIEW.md`（Claude/Grok 後の統合ゲート用プロンプト）を追加。

## [1.7.3] - 2026-06-29

### Fixed — Cartography & Remote Play (Claude review)

- **`cartographyRunner.ts`**: ComfyUI 生成 PNG を `validateCartographyGeneratedImagePath` + `resolveAllowedImagePath` で検証してから `copyFileSync`。
- **`cartographyRunner.ts`**: layout subprocess を `cartographyProcess` に追跡（deactivate 時の孤児プロセス防止）。未使用の `lastPngLine` 追跡を削除。
- **`remotePlayServer.ts`**: `/media` で `file` パラメータ欠落を署名検証より先にチェック。

## [1.7.2] - 2026-06-29

### Fixed — Cartography path alignment (ChatGPT review)

- **`cartography_path_utils.py`**: `validate_output_dir()` を TypeScript と同様に workspace root のみ許可（サブディレクトリ不可）。
- **`validate_layout_output_path()`**: 出力先を workspace 直下に限定（親ディレクトリ一致）。
- **`render_cartography_layout.py`**: `validate_layout_output_path()` を適用。引数省略時の既定出力を `world_map.layout.png` に統一。
- **Tests**: `test_cartography_path_utils.py` / `.js`；layout smoke test を workspace root 出力に合わせて更新。
- **Docs**: `CARTOGRAPHY_WORKFLOW_CONTRACT.md` にパス安全ルール表を追記。

## [1.7.1] - 2026-06-28

### Added — Cartography Hardening

- **`cartographyPathCore.ts`**: workspace 配下の `world_forge.json` / 地図出力パス検証。
- **`cartography_path_utils.py`**: Python CLI の forge / output ディレクトリ安全化。
- **Tests**: `test_cartography_path_core.js`、`test_cartography_layout_smoke.js`、`validate_cartography_workflow.js`。
- **Docs**: `docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`。
- **Demo**: `sample-scenarios/lost-catacombs/world_map.layout.png`、`CARTOGRAPHY_DEMO.md`。
- **README / DEMO**: 4言語 v1.7.1 反映、クイックスタート、Cartography を Optional 明記。

## [1.7.0] - 2026-06-28
### Added — World tab Cartography UI integration

- **`cartographyRunner.ts`**: VS Code コマンド / Webview から `comfyui_generate_cartography.py` を spawn。`world_map.png` と `world_map.layout.png` をワークスペースに保存。
- **コマンド** `LoreRelay: Generate World Map Image`（`textadventure.generateWorldMapImage`）。
- **`worldView.ts`**: `cartographyImage`・`cartographyPins`・`cartographyHasImage` を Webview へ postMessage。
- **World タブ UI**: Mermaid 図解 / 羊皮紙画像の切替、📍 ピンオーバーレイ（現在地ハイライト）、「Map Image」ボタン。
- **設定**: `textAdventure.imageGen.controlNet`（Cartography 用 SDXL Canny モデル名、任意）。

### Added — Cartography ComfyUI (Phase 7 Grok)

- **`cartographyLayoutCore.ts`**: `world_forge.json` から ControlNet 用レイアウト spec・プロンプト・HTML ピン座標（%）を pure 生成。
- **`render_cartography_layout.py`**: biome 色ブロブ + 接続線のレイアウト PNG（stdlib のみ）。
- **`comfyui_generate_cartography.py`**: レイアウト描画 → ComfyUI upload → SDXL Canny ControlNet ワークフロー実行。
- **`comfyui/workflow_cartography_sdxl_canny.json`**: パーチメント古地図向け Cartography ワークフロー。
- **Docs**: `docs/CARTOGRAPHY_COMFYUI.md`（Option A アーキテクチャ、モデル/LoRA 推奨、運用手順）。
- **Tests**: `test_cartography_layout_core.js`。

### Added — World Map Pan & Zoom + Biome Styling

- **World Map Pan & Zoom** (`webview/modules/85-world.js`): Mermaid マップ上でマウスドラッグによる移動（Pan）とマウスホイールによる拡大縮小（Zoom 0.15x〜5x、カーソル中心）を実装。ダブルクリックでリセット。npm モジュール不使用のフルスクラッチ実装。`#world-mermaid` を `overflow:hidden` の viewport として CSS 注入し、内部 SVG に CSS `matrix()` transform を適用。
- **Biome-based Mermaid Styling** (`src/worldMapGenerator.ts`):
  - 15 種の biome (`forest` / `desert` / `mountain` / `sea` / `coast` / `city` / `plains` / `swamp` / `wasteland` / `ruins` / `dungeon` / `underground` / `snow` / `volcanic` / `other`) に対応した絵文字アイコン・subgraph 背景色・ノードカラーを定義。
  - region の subgraph ラベルに biome アイコン（例: 🌲 Forest、⛰️ Mountain、🌊 Sea）を付与。
  - `style <regionId> fill:...,stroke:...` で subgraph 背景を暗色テーマ向け色に着色。
  - `classDef biome_<name>` でロケーションノードを biome カラーに染色（fill / stroke / text color）。
  - `region.biome` が未設定の場合は `inferRegionBiomeFromType(region.type)` でフォールバック。

## [1.6.3] - 2026-06-28

### Added — Cartography data foundation

- **Region cartography fields**: `world_forge.json` の `Region` に optional `x`, `y`, `biome` を追加。座標は `0..1000` の相対マップ座標。
- **Biome typing**: `RegionBiome` union を追加し、`forest` / `sea` / `city` / `underground` などの地形分類を型定義。
- **Parser hardening**: `parseWorldForge` が `x/y` を整数へ丸めて `0..1000` にクランプ。非数値座標は無視。未知 `biome` は `Region.type` 由来の安全な値にフォールバック。
- **Generator support**: `generateWorldForge` が新規生成Regionへ deterministic な `x/y/biome` を付与。接続グラフに合う円配置ベースで、隣接Regionが極端に離れない初期配置にした。
- **Docs**: `docs/CARTOGRAPHY_DESIGN.md` を追加し、LLM向け `world_forge.json` Cartography生成プロンプトを記録。
- **Tests**: `test_world_forge.js` / `test_world_forge_generator.js` に座標・biome・接続距離の回帰テストを追加。

## [1.6.2] - 2026-06-28

### Security — Remote Play signed media URLs

- **`remoteMediaSignatureCore`** (新規): `/media` 用 short-TTL HMAC 署名（`file` + `exp` + `sig`）。`crypto.timingSafeEqual` で検証。
- **`remotePlayServer`**: 画像 URL から session token を除去。レガシー `?token=` は 401 で拒否。署名期限切れは 403。
- **設定**: `textAdventure.remotePlay.mediaUrlTtlSec`（既定 300 秒、60–3600）。
- **テスト**: `test_remote_media_signature_core.js` + `test_remote_play_server.js` 更新。

## [1.6.0] - 2026-06-28

### Fixed — Audit Wave T7 (Remote Play セキュリティ再監査)

#### `remotePlayServer.ts` — セキュリティ補強

- **`serveMedia` 二重デコード除去 (P1)**: `URLSearchParams.get('file')` は既に URL デコード済みなのに `decodeURIComponent()` を再適用していた。`%252F..` 等のダブルエンコードトラバーサル試行が `resolveAllowedImagePath` より手前で意図せず展開される可能性を排除。`path.normalize(file)` に変更。
- **`serveStatic` `startsWith` にパスセパレータ追加 (P1)**: `remote-player` プレフィックスのみの比較では `remote-player-evil/` 等のディレクトリが理論上マッチし得た。`path.sep` サフィックスを追加してプレフィックス混同を防止。

#### テスト追加 — 9 件

| テスト | スクリプト |
|--------|-----------|
| `/media` パストラバーサル (`../../evil.png`) → 403 | `test_remote_play_server.js` |
| `/media` ダブルエンコードトラバーサル (`%252F..`) → 403 | `test_remote_play_server.js` |
| `disposeRemotePlayServer` 後の `running=false` | `test_remote_play_server.js` |
| Spectator からの `freeInput` → `Spectator mode (read-only)` | `test_ws_functionality.js` |
| 4001 文字超 WS メッセージ → close 1009 | `test_ws_functionality.js` |
| Pre-auth 非 auth メッセージ → Unauthorized + close 1008 | `test_ws_functionality.js` |
| token ローテーション後の旧 token WS 拒否 | `test_ws_functionality.js` |
| token ローテーション後の新 token WS 受理 | `test_ws_functionality.js` |
| `isGmBusy=true` → `GM is busy` / `isGameOverActive=true` → `Game over` / `text>2000` → `Invalid input` | `test_ws_functionality.js` |

#### 確認済み回帰テスト（変更なし）

- `maxClients` 超過 → code 1008 即切断 ✅
- Pre-auth で state 漏れなし (`sendToClient force` は handshake のみ) ✅
- `remoteInputLocked` が `finally` で確実に解除（GM エラー・kill 時も） ✅
- `/media` token 必須・`resolveAllowedImagePath` で二重防御 ✅
- `rotateRemotePlayToken` が全クライアントを切断して新 token を生成 ✅
- `notifyRemoteGmBusy(false)` が `releaseRemoteInputLock()` を呼ぶ ✅
- `disposeRemotePlayServer` → `stopRemotePlayServer` の完全な状態リセット ✅
- `buildRemotePlayerState` が `hiddenDice.result` を含まない（型レベルで存在しない） ✅

## [1.6.1] - 2026-06-28

### Merged to `main`
- `refactor/ws-and-extension-split` / `feat/v1.5-visual-memory` を `main` にマージ（Phase 6 監査ウェーブ一式）。
- マージ時に `zh-CN` / `zh-TW` へ World タブ・Game Rules 翻訳キー 18 件を補完（`validate.js` locale 同期）。

### Fixed — Audit Wave T8 (Extension Hub)

- **handleGenerateWorldForge**: コマンドパレット経路でも seed/theme/カウントを `webviewHandlersCore` で正規化・クランプ。`isValidEventId` で seed 検証。
- **handleGenerateLocationImage**: `isValidEventId` ガードを hub 側にも追加。
- **deactivate / panel dispose**: `resetGmBridgeSessions()` を呼び出し、Grok/LLM `--continue` フラグの残留を防止。`panel` / watcher 参照をクリア。
- **oocSidekick**: Webview へ送る commentary を 500 文字にクランプ。
- **clampWorldGenCount**: `webviewHandlersCore` に移動し hub/webview で共有。
- **.gitignore**: `sample-scenarios/**/scenario.json` を追跡対象に（`test_sample_scenarios.js` の CI 失敗を解消）。

## [1.5.9] - 2026-06-28

### Fixed — Audit Wave T5/T6 (Visual + Webview)

#### T6 — Webview & postMessage
- **webviewHandlersCore** (新規): World Forge seed/theme、Mermaid target、memory backend、equipment notify、文字列クランプの pure 検証。
- **webviewHandlers**: `generateImage` prompt/entryId 検証、`generateWorldForge` seed を `isValidEventId` で検証、`generateLocationImage` に locationId 検証、checkpoint ID 検証、Mermaid/memory backend allowlist、`requestVlmAnalysis`/`setNpcPortrait` で resolved path を渡すよう修正。
- **85-world.js**: クライアント側でも seed 形式・数値クランプを二重適用。

#### T5 — Visual / VLM 回帰
- **vlmQueue**: 非同期キューの `pendingPath` を unresolved ではなく `resolveAllowedImagePath` 済みパスに統一。
- **テスト**: `scripts/test_webview_handlers_core.js` を追加。

## [1.5.7] - 2026-06-28

### Fixed — Audit Wave T4 (ST Import / Character / Lorebook)

- **characterId**: `resolveCharacterJsonPath` がメタファイル予約 ID（`party`, `dynamic_profiles`, `party_director`, `active_character`）をブロックするよう修正 — 「party」という名前の Tavern カードが `party.json` を上書きする P0 バグを修正。
- **tavernCardImporterCore** (新規): `extractJsonFromPng` と `normalizeCharacterBook` を pure モジュールに抽出（vscode 非依存、Node テスト可能）。
- **tavernCardImporter**: `saveCharacterBookAsLorebook` を `fs.writeFileSync` から `writeJsonAtomic` に変更（非アトミック書き込み解消）。保存形式を `{format, source, entries}` ラッパーに変更し `readLorebookFile` との互換性を修正（P0 バグ: 以前は常に空ロードになっていた）。
- **tavernCardImporter**: `normalizeCharacterBook` にエントリ数 200 件・content 4000 文字・key 200 文字・key 数 20 件の上限を追加（DoS 防止）。
- **characterManager**: `loadCharacterById` に `isValidCharacterId` ガードを追加（パストラバーサル防止）。`getPartyIds` が `filterValidCharacterIds` でフィルタリングするよう修正。
- **lorebookMatcher**: 正規表現パターン長が 200 文字を超えた場合に部分文字列マッチにフォールバック（ReDoS ガード）。
- **テスト**: `scripts/test_tavern_card_importer.js` を新規作成（35 件）、`npm test` に統合。

## [1.5.6] - 2026-06-28

### Fixed — Audit Wave T3 (World + NPC + Living Feedback)

- **worldForgeCore**: `parseRegion` で `dangerLevel` を 0–10 にクランプ。`parseFaction` で `power` を 0–100 にクランプ（手動編集 JSON からの範囲外値を阻止）。
- **worldStateCore**: `parseFactionWorldState` で `power`/`morale` を 0–100 にクランプ。`parseGlobalEvent` で `id` を `isValidEventId` で検証（スペース・パス区切り等を含む不正 ID を破棄）。`WorldChangeEvent` との一貫性を確保。
- **npcBridgeCore**: `upsertNeed` のデッドパラメータ `candidateId` を除去。呼び出し側で不要な `makeNeedId` 計算を排除。
- **テスト**: `test_world_forge.js` に dangerLevel/power クランプの回帰テスト（6件）を追加。`test_world_state.js` に power/morale クランプ（5件）・GlobalEvent id バリデーション（2件）の回帰テストを追加。

## [1.5.5] - 2026-06-28

### Fixed — Audit Wave T2 (GM Bridge & Turn Pipeline)
- **diceRoller**: マクロ数上限（20）、`reason` 長さクランプ、`dc` 範囲クランプ（1–10000）。
- **gmPromptBuilderCore**: `buildHintTextFromContents`（6000文字上限）と `buildWorldChangeSummaryFromChanges` を pure モジュールに抽出。世界変化サマリは最新 sim ステップの non-info のみ注入。
- **gmBridgeRunner**: GM 失敗・kill 時に `dice_ledger.json` をクリアし、次ターンへのロール持ち越しを防止。`killGmBridgeProcesses` で `remoteInputLocked` を確実に解除。
- **テスト**: `test_dice_roller.js`、`test_gm_prompt_builder_core.js` を追加。

## [1.5.4] - 2026-06-28

### Fixed — Audit Wave T1/T7 (State & Remote)
- **validateGameState 拡張**: `hiddenState` 型検証、`world.lastGeneratedImage` / `lastGeneratedLocationId` / `worldTurnAtLastSync` の検証強化、`npcMemoryUpdates[].npcId` を `isValidEntryId` で検証。
- **npcMemoryUpdates パース**: 不正 `npcId` を `parseNpcMemoryUpdatesFromGameState` でスキップ（二重防御）。
- **mergeGmEntryFromTurn**: `gmEntry.image` パスを 500 文字にクランプ。
- **テスト**: `scripts/test_validate_game_state.js` を新規追加。`test_ws_functionality.js` を `npm test` に統合。

## [1.5.3] - 2026-06-28

### Fixed — Visual Memory Phase 5 follow-up review
- **Gallery Analyze 復元漏れ**: `gameStateSync` が Webview 表示用URIへ変換する前の `rawImagePath` を履歴エントリと `latestImageRawPath` に保持し、フル履歴再送・Webview再表示後も Analyze ボタンが使えるよう修正。
- **Gallery 重複抑制**: Webview URI だけでなく `rawPath` の正規化比較でも同一画像をマージし、再表示やURI再生成で同じ画像が重複しにくいよう修正。
- **Visual Memory hash I/O**: `hashImageFile()` の読み込み処理を `try/finally` 化し、例外時もファイルディスクリプタを確実に閉じるよう修正。
- **回帰テスト**: Webview bundle テストに `latestImageRawPath` / `imagePathsLooselyMatch` の存在確認を追加。
- **テスト安定化**: World Forge Generator の決定性テストが実時間 `generatedAt` のミリ秒差でフレークしないよう、生成内容比較から timestamp のみ除外。

## [1.5.2] - 2026-06-28

### Fixed — Visual Memory Phase 5c/5d コードレビュー
- **portraitImagePath パース漏れ**: `parseNpcEntry` が `portraitImagePath` を読み込んでおらず、再起動でポートレートが消える問題を修正。
- **setNpcPortrait 無検証**: `npcId` / 画像パスを `isValidEntryId` + `resolveAllowedImagePath` で検証。
- **Gallery ↔ VLM パス不一致**: `rawImagePath` を resolved path で統一。`vlmAnalysisComplete` をキャッシュヒット時も送信。パス比較を正規化マッチに変更。
- **Analyze ボタン固着**: `vlmAnalysisFailed` イベントでギャラリー UI を復帰。
- **QuickPick 無制限**: visual memory から最大40件・許可パスのみ表示。
- **getEntriesByLocation**: 無効 `locationId` 拒否 + ソート/上限。

## [1.5.1] - 2026-06-28

### Fixed — Visual Memory Phase 5a/5b コードレビュー
- **game_state 書き戻し**: `latestImage` と解析対象パスの比較を `resolveAllowedImagePath` 経由の realpath 一致に変更（相対/絶対パス不一致で description が書けない問題を修正）。
- **VLM 無効時**: `enqueueVlmAnalysis` / GM bridge が無駄にキュー投入しないよう `isVlmEnabled()` ガード。`buildVisionContext` も空返し（「解析中」誤表示を防止）。
- **パス安全**: `hashImageFile` が許可ルート外のファイルを読まないよう `resolveAllowedImagePath` を通す。
- **メタデータ**: `worldTurn` を `game_state.world` ではなく `world_state.json` から取得。`locationId` を `isValidEntryId` で検証。
- **説明文**: `sanitizeVlmDescription` で game_state / visual_memory への書き込みを正規化・上限化。

### Added
- **`vlmQueueCore.ts`**: 純関数 `sanitizeVlmDescription` / `resolvedImagePathsMatch`。
- **`scripts/test_vlm_queue_core.js`**: 上記の単体テスト。

## [1.4.1] - 2026-06-28

### Fixed — Living World Feedback hardening (Phase 4b 監査)
- **NPC bridge 二重適用**: `maybeTickSimulation` が `recentChanges` 全件を毎 tick 再処理していた問題を修正。`stepEvents`（当該ステップ分のみ）を NPC bridge に渡すよう変更。
- **イベント洪水**: 食料枯渇は 0 への遷移時のみ発行。地域危険度は整数ティア上昇時のみ発行。
- **Need upsert**: 食料/安全 Need の `relatedEventId` を安定キーにし、繰り返し tick で Need が増殖しないよう修正。
- **statePatch /world**: ルート `/world` 一括置換を拒否。許可サブパスの値に ID 形式・dangerLevel 0–10 検証を追加。
- **マップハイライト**: 期限切れ `recentChanges` を `pruneExpiredEvents` で除外してから 🔥 表示。

### Added
- **`scripts/test_npc_bridge.js`**: food crisis upsert・region safety・ハイライト抽出のテスト。
- **emergentSimulator / statePatch テスト拡充**: recentChanges・world allowlist カバレッジ追加。

## [1.3.2] - 2026-06-28

### Fixed — Phase 1–4 安全監査
- **Phase 4 上書きフロー復旧**: `handleGenerateWorldForge` が `ensureWorldStateExists` + `overwrite: false` のままだった問題を修正。生成成功時は常に `resetWorldStateFromForge`、上書き時は NPC registry も `overwrite: true` で同期。`enableWorldForge` / `enableNpcRegistry` を自動 ON。
- **Webview 生成パラメータ**: `regionCount` / `factionCount` / `npcCount` を generator と同じ範囲にクランプ（悪意ある postMessage 対策）。
- **worldMapGenerator**: 派閥→ロケーション辺を描画済みロケーションのみ・最大30本に制限（巨大 forge での Mermaid 爆発防止）。
- **parseWorldForge / parseWorldState**: 配列・エントリ数の上限を追加。参照 ID（`regionId` / `factionControl` 等）を `asId` で検証。

## [1.3.1] - 2026-06-28

### Fixed — Phase 5 World × ComfyUI 連携（コードレビュー対応）
- **初回ロード誤発火**: `autoOnLocationChange` がパネル初回 `sendCurrentState` で発火しないよう、`lastGoodGameState` 存在かつ `oldLocationId` 定義時のみフック実行。
- **game_state 書き戻し廃止**: `lastGeneratedLocationId` の追跡を `locationImageTracker.ts`（拡張機能メモリ）に移行。`sendCurrentState` からの `writeJsonAtomic` 副作用を削除。
- **ライブ worldState 反映**: 手動・自動とも `loadWorldState()` を `buildLocationImagePrompt` に渡し、シミュ後の danger / controllingFaction をプロンプトに反映。
- **画像モード**: `'illustrious'` ハードコードを廃止し `getResolvedImageMode()`（`image_gen_config.json` 参照）に統一。
- **60s クールダウン**: 同一 location の自動再生成を `locationImageTracker` で抑制。
- **キュー dedup**: location 画像に `entryId: loc:<id>` を付与。

### Added
- **`locationImageBuilderCore.ts`**: vscode 非依存の純関数プロンプトビルダー。
- **`locationImageTracker.ts`**: 自動生成のメモリ追跡・クールダウン。
- **`scripts/test_location_image_builder.js`**: プロンプト合成・トラッカーの単体テスト。

### Changed
- **World タブ Scene Image ボタン**: 3秒タイマー廃止。`imageGenEnd` / `locationImageGenEnd` で UI 復帰。

## [1.3.0] - 2026-06-27

### Added — World Forge Generator (Phase 4)
- **`worldForgeGeneratorCore.ts`**: `worldSeed` / `theme` / 規模パラメータから決定的に `world_forge.json` を手続き型生成（region グラフ・派閥関係・NPC 配置・loreHistory）。
- **`worldForgeGenerator.ts`**: 生成結果の `writeJsonAtomic` 保存・パース検証・キャッシュ無効化。
- **`bootstrapNpcRegistryFromForge()`**: `initialNpcs` から `npc_registry.json` を自動シード（role ベースの personalityTraits 付与）。
- **`resetWorldStateFromForge()`**: 生成・上書き時に `world_state.json` を forge から再構築（旧 state との不整合を防止）。
- **World タブ Generate UI**: seed/theme/regions/factions/NPCs 入力フォーム + `worldGenStart/End` 進捗表示。
- **コマンド**: `textadventure.generateWorldForge`（コマンドパレットからも実行可）。
- **設定**: `textAdventure.worldForge.defaultRegionCount` / `defaultFactionCount` / `defaultNpcCount` / `llmEnrich`。
- **テスト**: `scripts/test_world_forge_generator.js`（決定性・参照整合・テーマ差分）。

### Fixed
- **`getFactionName()`**: `emergentSimulator` の派閥イベント文が ID ではなく表示名を使用。
- **生成後の Game Rules**: 成功時に `enableWorldForge` / `enableNpcRegistry` を自動 ON。
- **上書き時の整合性**: 既存 `world_forge.json` 上書き時、NPC registry（overwrite）と world_state（再生成）も同期更新。

## [1.2.0] - 2026-06-27

### Fixed
- **WorldタブUIのバンドル漏れ修正**: `scripts/build-webview.js` の `JS_MODULE_ORDER` に `85-world.js` が含まれていなかったバグを修正し、正しくUIがロードされるように。
- **バージョン表記の整合性確保**: `package.json` および `package-lock.json` のバージョン表記を `1.2.0` へ引き上げ。
- **Webviewバンドル検証テストの新規導入**: `scripts/test_webview_bundle.js` を追加し、ビルド後のスクリプト内に `worldView` 等の主要シンボルが存在することを保証する自動テストを `npm test` に組み込み。

### Added
- **生きている世界システム (World System)**:
  - `world_forge.json` に基づき地域、派閥、NPC初期配置、歴史などをシード定義・生成・検索する World Forge モジュール (`worldForge.ts`, `worldForgeCore.ts`) を実装。
  - NPCの好感度、恐怖、信頼などの関係値（Disposition）、記憶（Memory）、動的ニーズ（Needs）を保持・管理する NPC Registry モジュール (`npcRegistry.ts`, `npcRegistryCore.ts`) を実装。LLMの `npcMemoryUpdates` による自動更新やGMへのコンテキスト注入に対応。
  - Webview上に地域と派閥の接続図と現在地（★）を描画する「World」タブ（Mermaid.jsによる動的ネットワーク図 + 派閥ステータスカードUI）を追加。
  - LLMを介さない軽量ルールベースの自律進行シミュレータ (`emergentSimulator.ts`, `worldState.ts`, `worldStateCore.ts`) を実装。ターン経過に伴う資源消費、パワーバランス、危険度、警告イベントを自動計算。
  - GMプロンプトビルダーに世界状態とNPC関係値を注入する `buildWorldStatePromptContext` と `buildNpcRegistryPromptContext` を統合。
- **VLM 統合 (Soulgaze)**:
  - プレイヤーの入力画像やシーン背景を Vision LLM (Ollama/OpenRouter) を使って非同期でテキスト解析・要約し、GMのナラティブ描写に組み込む Vision コンテキスト注入機能を実装 (`vlmProvider.ts`, `gmBridgeRunner.ts`)。

## [1.1.3] - 2026-06-27

### Fixed — Claude Review Follow-up (v1.1.2 残件)
- **`isGameOverActive()` キャッシュ化**: `gameStateSync.getCachedGameState()` 経由で `gameOver.active` を参照し、毎ターンの `readFileSync` を廃止。
- **`timingSafeEqual` トークン比較**: WebSocket 認証と `/media` エンドポイントで `crypto.timingSafeEqual` による定数時間比較に変更。
- **`remoteInputLocked` 60s ウォッチドッグ**: GM クラッシュ時の永続ロックを防ぐタイマーを追加。`acquireRemoteInputLock()` / `releaseRemoteInputLock()` で一元管理。
- **GM プロンプト I/O 削減**: `gmPromptBuilder` が `getCachedGameState()` を優先利用。ロアブックは mtime キャッシュで再読み込みを抑制。

### Note
- **VLM (`buildVisionContext`)** は意図的スタブのまま（パス文字列のみ）。真の multimodal 統合は Phase 4A で対応予定。

## [1.1.2] - 2026-06-27

### Fixed — Security & Stability (Post-v1.1.2 Code Review)
- **Command Double Registration**: Fixed critical command registration crash by removing the duplicate `checkForUpdates` command registration from `extension.ts`.
- **WebSocket Connection Limits**: Implemented connection limit (`maxClients`) verification upon connection, rejecting clients beyond the limit with close code `1008`.
- **Pre-Authentication Message Delivery**: Fixed a bug where `authRequired` and `Unauthorized` messages were dropped due to a state verification check on `sendToClient()`. Implemented a `force` delivery mechanism.
- **WebSocket Closure Safety**: Added a `50ms` delay on client disconnect following error messages, allowing client sockets to parse error messages before connection termination.
- **Input Locking Safety**: Wrapped player action executions in `try...catch...finally` blocks to guarantee `remoteInputLocked` is always released, preventing permanent lockout of remote clients in case of GM failure.
- **Sync I/O Minimization**: Implemented a memory cache for Game Rules to avoid repeated synchronous `fs.readFileSync` checks per turn.

### Added
- **WebSocket Integration Tests**: Added `scripts/test_ws_functionality.js` verifying maxClients, pre-auth messages, delayed closures, and input lock safety.

## [1.1.1] - 2026-06-26

### Fixed — Hotfixes
- **Security Hardening**: Removed external QR code generation dependency and localized Mermaid.js rendering to run without CDN.
- **Bug Fixes**: Fixed 'Easy' difficulty persistence issue, and fixed dynamic resource bar append issue in the UI.

## [1.1.0] - 2026-06-26

### Added — Phase 5: Advanced Simulation & Visualizations
- **Game Rules Toggles**: Added toggles for experimental features: "Skill Commentary", "Background Simulation", and "Auto Lorebook Growth" in the settings panel. These influence the GM's prompt behavior.
- **Quest Flow & Relations Graphs**: Added `🗺️ Quest Flow` and `🕸️ Relations` buttons. They trigger Mermaid.js flowchart generation by the GM.
- **Mermaid.js Rendering**: Embedded Mermaid.js into the webview. Any ` ```mermaid ` block returned by the LLM is automatically rendered as an interactive diagram.
- **Affection/Reputation Trackers**: Added visual progress bars (0-100) for tracking dynamic stats like `affection` or `reputation` sent in the `status` payload.

### Added — Phase 4: Extended Core & UI Tools (Antigravity)
- **Git Time Travel**: Auto-commit interval setting and `⎇ (Branch)` button in messages to branch timelines.
- **Equipment Slots**: Character Profile now supports Weapon, Armor, Accessory slots with one-click GM notification (`📤 Equip & Notify GM`).
- **Force Speak (🪄 Speak as...)**: Quick Reply bar button to force a specific character/NPC to speak next.
- **Export Saga to HTML (🌐 Export HTML)**: Quick Reply bar button to export the entire chat log with base64 embedded images as a rich HTML file.
- **Responsive WebUI**: Drag-to-resize border (`#resizer`) between chat and status panes. Status tabs collapse to icons when space is limited.
- **Locale Selection**: Added `textAdventure.locale` to VS Code settings (`package.json`) to select UI language (`en`, `ja`, `zh-cn`, `zh-tw`).
- **Python Auto-Setup**: Extended `setup.ps1` to auto-install `chromadb` and `scikit-learn` from `requirements.txt` if Python is available.

（次のマイルストーン: Phase 2B TavernCard V1/V2 完全対応 / Phase 4A VLM 統合 / 実験的機能の追加）

## [1.0.0] - 2026-06-26

**LoreRelay v1.0 — public release polish.**

### Added

- **Sample scenarios (3)** — `lost-catacombs`, `neon-rain`, `harbor-mist` in `sample-scenarios/` and `TextAdventureGMSkill/scenarios/`.
- **`MODEL_PRESETS.md`** + `presets/` — recommended GM bridge and `image_gen_config.json` snippets (Grok, Ollama, OpenRouter, illustrious/pony/natural).
- **`COMFYUI_WORKFLOWS.md`** + `comfyui/` — bundled `workflow_api.json` (512) and `workflow_sdxl_1024.json`.
- **README visuals** — `docs/assets/*.svg` UI mockups; [`DEMO.md`](DEMO.md) recording guide.
- **`scripts/test_sample_scenarios.js`** — validates bundled scenario packs in `npm test`.

### Changed

- README (ja/en/zh) — screenshots section, v1.0 feature list, scenario table, preset links; roadmap updated (Remote Play shipped in v0.7).

## [0.7.0] - 2026-06-26

Party Director & Remote Play enhancements (see v0.7 roadmap).

## [0.3.3] - 2026-06-26

Phase 2B 完了（`a693892`）とフェーズ 3 ゲート（SKILL 同期・Python 整合・E2E スモーク）。

### Added — Phase 2B: ST ロアブックマッチングエンジン

- **`src/lorebookMatcher.ts`** (新規): vscode 依存なしの純粋マッチング関数 `matchEntriesAgainstText` を分離。`LorebookEntry` インターフェースに ST 互換フィールドを追加:
  - `use_regex?: boolean` — キーを正規表現として評価（`/pattern/flags` 形式と裸のパターン両対応。不正な正規表現はサブストリングフォールバック）
  - `secondary_keys?: string[]` — AND 条件: primary key ヒット後に secondary key のいずれかも一致する必要あり
  - `insertion_order?: number` — ST の挿入順位。`priority` が未設定の場合に参照（降順ソート）
- **`src/gmPromptBuilder.ts`**: `matchLorebookEntries` を `matchEntriesAgainstText` の薄いラッパーに置き換え。`LorebookEntry` を `lorebookMatcher` から import。
- **`scripts/test_lorebook.js`** (新規): ロアブックマッチングエンジンの単体テスト（11ケース: サブストリング/OR/大小文字/Regex/不正Regex/Secondary Keys/ソート/maxEntries/空入力）。
- **`scripts/validate.js`**: `test_lorebook.js` を `npm test` に統合。

### Added — フェーズ 3 ゲート（Grok）

- **`scripts/test_turn_result_pipeline.js`**: `statePatch` + `mergeGmEntryFromTurn` + `lorebookMatcher` 統合スモークテスト。
- **`scripts/test_lorebook_python.py`**: Python `match_lorebook` と TS エンジンの整合スモークテスト。
- **`TextAdventureGMSkill/SKILL.md`**: 正規契約を `turn_result.json`（Persist-Before-Narrate）に更新。`game_state.json` 直書きは緊急フォールバックに格下げ。ロアブック `triggeredLore` / ST 互換フィールドを追記。
- **`gm_bridge_common.py`**: `match_lorebook()` を TS `lorebookMatcher` と同等の regex / secondary_keys / insertion_order ロジックに更新。

### Changed

- **`remotePlayServer.ts`**: `127.0.0.1` バインド時は LAN URL を表示しない（ChatGPT S-07）。Output Channel のトークン全文ログをマスク。

### Security

- ChatGPT 監査 (`C:\AI\CHATGPT_SECURITY_AND_SKILL.md`) を参照。S-07 部分対応。S-02〜S-06 は将来対応。

### Added（ドキュメント）

- **`AI_HANDOVER_PROMPTS.md`**（`c93ee26`）: マルチ AI 引き継ぎ手順書。

## [0.3.2] - 2026-06-26

コードレビュー（`7576998`〜HEAD）指摘に基づく堅牢化リリース。Phase 1〜3 の未記載分もこの版にまとめて記録。

### Added — Phase 2A: Persist-Before-Narrate E2E

- **`turn_result.json` パイプライン**: Python GM bridges（Ollama / KoboldCPP / OpenRouter）が `turn_result.json` をアトミック書き込み。TS `processTurnResult` が `statePatch` を検証・適用し、`narration` / `gmEntry` を `entries` にマージ、`state_journal.ndjson` に `beforeHash` / `afterHash` / `appliedAt` を追記。
- **`src/turnResultFallback.ts`**: Grok / カスタム GM が `game_state.json` を直接更新した場合、GM 開始前スナップショットから `turn_result.json` を合成（Inspector・ジャーナル・MediaAgent をパッチ経路に統一）。
- **`src/mediaPaths.ts`**: `isAllowedImagePath` を共通化（`gameStateSync` ↔ `remotePlayServer` の循環依存を解消）。
- **`scripts/test_state_patch.js`**: `applyStatePatch` / `mergeGmEntryFromTurn` / `buildStatePatchFromDiff` の単体テスト（`npm test` に統合）。
- **Python `gm_bridge_common.py`**: `build_state_patch()` / `write_turn_result()` / `game_rules.json` プロンプト注入 / `triggeredLore` 出力。`TA_LEGACY_WRITE_GAME_STATE=1` で旧 `game_state.json` 直書きにフォールバック可能。

### Added — Phase 2C: Turn Inspector

- **🔍 Inspector タブ**: ターン ID、整合性ハッシュ、ダイス台帳、状態パッチ、`triggeredLore` を表示（欠落していた `pane-inspector` HTML を追加、4 言語 i18n 15 キー）。
- **動的リソースバー**: `status` 内の任意キーを動的表示（Phase 4B 骨格）。

### Added — Phase 1 / 1.5

- **Phase 1.0**: `src/diceRoller.ts` — 入力中の `{{roll 1d20+2}}` 等をローカル確定し、LLM へ `[System Roll: …]` として注入。
- **Phase 1.5**: `game_rules.json` + Webview ⚙️ Game Rules パネル（RPG 要素 ON/OFF、最大 HP/MP、ダイス難易度）。`gmPromptBuilder` / Python システムプロンプトへ反映。

### Added — Phase 3A / 3B

- **Phase 3A (MediaAgent)**: `src/mediaAgent.ts` — GM stdout 早期 BGM/SFX、画像キュー、`turn_result` フック。設定 `textAdventure.mediaAgent.*`。
- **Phase 3B (Remote Play)**: `src/remotePlayServer.ts` + `remote-player/` — LAN WebSocket 同期、📱 トグル、コマンド `startRemotePlay` / `stopRemotePlay`。

### Added — インフラ・その他

- **Auto-Updater**: `updateManager.ts`、`update_lorerelay.bat` / `scripts/update_lorerelay.ps1`、`scripts/install_common.ps1`。
- **ステータス動的非表示**: `status` 欠落フィールド・`status` 全体の Webview 非表示（VN / 会話重視向け）。
- **Workspace Trust ガード**、**GM Bridge busy チェック統合**、**Grok CLI パス OS 非依存解決**。

### Changed

- **GM プロンプト（4 言語）**: `game_state.json` 直書きではなく `turn_result.json`（Persist-Before-Narrate）を指示。
- **`remotePlay.bindAddress` デフォルト**: `127.0.0.1`（LAN は `0.0.0.0` を明示設定）。
- **Remote Play**: GM 処理中のリモート入力 single-flight ロック（`remoteInputLocked`）。
- **MediaAgent**: JSON コードフェンス内のみストリーム解析、`clearMediaAgentCaches()` を GM セッション開始時に呼び出し。
- **`dice_ledger.json`**: `writeJsonAtomic` でアトミック書き込み。
- **`statePatch` allowlist 拡張**: `bgm` / `mood` / `sfx` / `theme` / `sprite` / `diceRequest` 等を schema 整合で許可。
- **`grokBridge.autoApprove` デフォルト**: `false`（セキュリティ強化）。
- **OpenRouter API キー**: 平文 settings から SecretStorage へ自動移行。
- **Refactor**: `extension.ts` モジュール分割、`webview/modules` + `build-webview.js`、`gameStateSync.ts`、`webviewHandlers.ts` 等。

### Fixed

- **Turn Inspector**: タブのみ存在しペイン HTML が欠落していた不具合。
- **Phase 2A E2E**: Python が `game_state.json` のみ直書きし `turn_result` / `narration` マージが未接続だった経路を修正。
- **状態検証**: スキーマ違反時は `sendCurrentState` を中止。チェックポイント復元時のメタデータ保持。
- **HiddenDice 重複表示**、**ダイス計算機上限**（100 面 / 10000 面）、**子プロセス二重発火**、**FileWatcher メモリリーク**。
- **メッセージ edit / exclude / branch** の不正 ID 無視、**入力・Author's Note 長さ検証**。

### Security

- **updateManager / インストーラー `.ps1`**: PowerShell コマンドインジェクション対策（`-File` + 名前付き引数）、GM skill アトミックインストール、VSIX 名正規表現検証、GitHub URL allowlist、HTTP/子プロセスタイムアウト。
- **シナリオ Pack**: `scenario_assets/` へアセットをローカルコピー（Webview `localResourceRoots` 制約対応）。

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
