# AI Master Roadmap (Blackboard)

このファイルは、AIエージェント (Antigravity, Claude, Grok, Gemini等) が共有する「タスク管理の黒板 (Blackboard)」です。作業を開始する前にここを確認し、作業が完了したら `[ ]` を `[x]` に変更して保存してください。

> **設計方針**: 派手な機能よりも「壊れない・可視化されたGM基盤」を最優先とし、SillyTavernの資産（キャラクターカード・ロアブック）を完全に読み込める、開発者・パワーユーザー向けの「AI GMコンソール」を目指します。

---

## 🟢 Phase 1: 確定的判定とルール基盤 (担当: Antigravity)
*ステータス: 完了*
- [x] Phase 1.0: `{{roll 1d20}}` 等のダイスマクロをパースし、RNG（乱数）を確定させてからLLMへ送る機能の実装
- [x] Phase 1.5: RPG要素（HP/MP）のON/OFFやデフォルトパラメータを調整できる `Game Rules` 設定UIと `game_rules.json` の永続化基盤

---

## 🟢 Phase 2: 厳格な状態管理とST互換性の完成 (担当: Claude / Antigravity)
*ステータス: 完了*
LLMのハルシネーション（勝手な改変）を防ぐ「壊れないGM基盤」と、資産をそのまま引き継げるインポーターの完成。
- [x] State Patch (Persist-Before-Narrate) の実装
- [x] Turn Result & State Journal (`turn_result.json`, `state_journal.ndjson`)
- [x] Dice Ledger
- [x] GM Debug Console (Turn Inspector UI)
- [x] ST Character Card Importer (V2)
- [x] ST Lorebook Importer
- [x] 状態のV1→V2自動マイグレーション

---

## 🟢 Phase 3: World System & Emergent Simulation (担当: Claude / Antigravity / Gemini)
*ステータス: 完了 (v1.3.0 - v1.3.2)*
- [x] World Forge (`world_forge.json`) と World State (`world_state.json`) の実装
- [x] NPC Registry (`npc_registry.json`) の実装 (好感度・記憶・Needs)
- [x] Emergent Simulator (ターン経過に伴うリソース・危険度・派閥パワーの自動変動)
- [x] World Forge Generator (Seed/Themeベースの決定論的生成機能)
- [x] Webview World Tab & Mermaid Map Rendering
- [x] World x ComfyUI Integration (ロケーション画像プロンプト、自動画像生成、クールダウン抑制)
- [x] 安全監査 (上限チェック、ID検証、Mermaid描画制限、Webview postMessageのクランプ)

---

## 🟢 Phase 4 (v1.4.0 - v1.4.1): Living World Feedback
*ステータス: 完了 (v1.4.1)*
**目的**: Emergent Simulation の変動を「出来事」として履歴化し、プレイヤーやNPCに体感させる。

- [x] **1. World Event Log (`recentChanges` in world_state.json)**
  - simulator が resource/region イベントを生成・記録（WorldChangeEvent 型, FIFO 上限 20 件）
- [x] **2. World Change Summary**
  - `buildWorldChangeSummaryContext()` — シム直後の 1 GM ターンのみ「Since Last Visit」形式で注入
- [x] **3. World Tab Event Timeline**
  - World タブ内に「World Changes」欄を追加し、最新5件を新しい順に表示
- [x] **4. Map Highlight**
  - `mapHighlight: true` のリージョンを Mermaid 上で 🔥 表示
- [x] **5. NPC Reaction Propagation (目玉機能)**
  - 食料危機 → `need: material` urgency 75、危険度上昇 → `need: emotional` urgency 60
- [x] **Hardening (v1.4.1)**
  - pruneExpiredEvents、MAX_RECENT_CHANGES=20 FIFO、severity/ID 検証、dedup、format 1.0→1.1 migration

---

## 🟢 Phase 5 (v1.5.0 - v1.5.1): Visual Memory / Soulgaze
*ステータス: 完了 (v1.5.1)*
**目的**: 生成された画像や入力画像を、GMの記憶・世界状態・シーン管理に戻し、AIに「視覚」を持たせる。

- [x] **1. Visual Memory Cache (`visual_memory.json`)**
  - 画像の解析結果を hash キーでキャッシュ (visualMemoryCore.ts + visualMemory.ts)
  - MAX_ENTRIES=500, LRU eviction, mtime-based cache
- [x] **2. Non-blocking VLM Queue**
  - ターン進行を止めず、バックグラウンドで Ollama/OpenRouter VLM による画像解析を実施 (vlmQueue.ts)
- [x] **3. Scene Context Builder**
  - buildVisionContext() が visual_memory.json を優先参照; buildVisualContextSnippet() で @locationId 付きスニペット注入
- [x] **4. Gallery Metadata & UI**
  - galleryImages を GalleryEntry[] に拡張、locationId/worldTurn/prompt を保持
- [x] **Visual World Polish (v1.5.1)**
  - World タブに「Scene History」「NPCs Here」パネル、portrait 紐付け

---

## 🟢 Phase 6 (v1.5.4 → v1.6.1): Audit Wave — 硬化ウェーブ
*ステータス: 完了*
機能追加ではなく、巨大化したコードベースをトラック分割して補強・テスト穴埋めを行う。

- [x] **T1**: Core State & Patch — `validateGameState` 拡張、`gameStateSanitize.ts`、`checkpointHandlers` 統一
- [x] **T2**: GM Bridge & Turn — `gmPromptBuilderCore`、`diceRoller` クランプ、ReDoS lorebook
- [x] **T3**: World + NPC + Living Feedback（再監査）
- [x] **T4**: ST Import / Character / Lorebook
- [x] **T5**: Visual Memory + Image Gen + VLM（回帰）
- [x] **T6**: Webview & postMessage — `webviewHandlersCore`、85-world クランプ
- [x] **T7**: Remote Play セキュリティ再監査（`maxClients` 認証済みのみカウント等）
- [x] **T8**: Extension Hub — World Forge hub、GM session reset、sample scenario git

---

## 🟢 Phase 7 (v1.7.0 → v1.7.3): Cartography
*ステータス: 完了*

世界地図の可視化と ComfyUI 連携パイプライン。v1.7.3 でパス安全・レビュー指摘対応まで完了。

- [x] Region `x` / `y` / `biome`、Mermaid biome スタイル、pan/zoom
- [x] `cartographyLayoutCore.ts` + `render_cartography_layout.py`（Voronoi デフォルト）
- [x] `comfyui_generate_cartography.py` + World タブ **Diagram / Parchment** + ピン overlay
- [x] `cartographyPathCore.ts` / `cartography_path_utils.py` パス検証
- [x] workflow 契約・smoke test・theme JSON 同期・任意 LoRA プリセット

---

## 🟢 Phase 8 (v1.10.0): Event-to-Quest & Objective Visualizer (担当: Gemini)
*ステータス: 実用レベルで完了（v1.10.0 でリリース。残るのはイベント由来クエスト報酬など任意拡張）*

World Simulator / NPC Registry で発生した出来事を、プレイヤーが選んで追える optional quest hook として可視化する。Railroad ではなく「今この世界で助けを求めていること」の提示を目的にする。

- [x] `recentChanges` から warning/critical 相当の Quest Hook を自動生成
- [x] NPC の urgent needs (`urgency >= 70`) から依頼を自動生成
- [x] `world_state.json.questHooks` の型・パーサー・上限を追加
- [x] Webview World タブに Quest Board を表示
- [x] Quest Board から available quest を active にできる
- [x] Active Quest を GM prompt に短く注入
- [x] `turn_result.json.resolvedQuests` で active quest を completed に更新
- [x] Quest Board の i18n 化
- [x] `testing_checklist.md` に手動確認手順を追加
- [x] 報酬・好感度・NPC need 解決への反映（Claude, `statePatch.ts` — NPC由来クエスト完了時に `applyNpcMemoryUpdates()` 経由で trust+10・need解決・メモリ追加。Quest Board に報酬テキスト表示）

関連ファイル: `phase8_planning_and_prompts.md`, `src/questGeneratorCore.ts`, `src/worldStateCore.ts`, `webview/modules/85-world.js`

---

## 🟢 Phase 9: Agentic Campaign Engine / 役割分担型GM (担当: ChatGPT & Grok)
*ステータス: Phase 9B 実装済み（v1.10.0 でリリース）*

LLM の役割を「State Referee（状態・ダイス・patch）」と「Narrator（描写）」へ分ける案。現行の single-stage GM Bridge を壊さず、二段階実行を optional にする。

- [x] ChatGPT/Codex: State Referee / Narrator 分離アーキテクチャを設計（`PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`）
- [x] Grok: `agenticGmCore.ts` + `agenticGmRunner.ts` + `gmBridgeRunner.ts` gate の Grok-only Phase 9A prototype を実装
- [x] 失敗時に current single-stage flow へ戻る fallback を設計
- [x] clipboard/manual GM workflow でも破綻しない運用案を設計（Phase 9A では既存 clipboard flow 維持）
- [x] Phase 9B: `vscode-lm` / local API providers への拡張（`agentic_stage_gm.py` + provider dispatch）

設計書: `PHASE9_AGENTIC_CAMPAIGN_DESIGN.md`

---

## 🟢 Phase 10 (v1.10.0): VS Code/Git Native Timeline / シナリオ分岐タイムライン (担当: Claude)
*ステータス: 完了（v1.10.0 でリリース。残るのは実運用での手動確認のみ）*

ゲーム用ワークスペースの Git branch を「並行世界 / セーブ分岐」として扱い、Webview から安全に branch 作成・確認・復帰できるようにする。

- [x] Inspector に Git Timeline ステータス表示（現在のブランチ + `timeline/*` 一覧、Switch ボタン）
- [x] `gitManager.ts` — 初回のみ同意ダイアログ付き `git init`（拒否時は `gitAutoCommitInterval=0` を自動設定）、`shell: false` 固定
- [x] ゲームワークスペース（`getWorkspacePath()`）だけを対象にする安全な Git helper（拡張機能自身のリポジトリには一切触れない）
- [x] Webview に scenario branches 一覧と switch UI を追加（GM メッセージの ⎇ ボタンで branch 作成、Inspector で一覧・切替）
- [x] destructive git command を自動実行しない安全策 — 未コミット変更がある間は branch 作成・切替の両方をブロック、切替前に対象ブランチの実在を再検証
- [x] `commitTurn` の対象ファイルを `world_forge.json` / `world_state.json` / `npc_registry.json` まで拡張（branch 復帰時に世界・NPC状態も復元されるように）

未確認: 実運用（実際にプレイしながら branch 作成 → 別ターンへ switch → 世界状態が正しく戻るか）の手動テスト。

---

## 🟢 Phase 11 (v1.11.0): Adaptive TTS / NPC個別音声 (担当: Claude 設計 → Grok 実装)
*ステータス: 完了（v1.11.0 でリリース。残るのは `testing_checklist.md` §7–8 の実機確認のみ）*

NPC ごとの声質・話速・感情トーンを `npc_registry.json` に保存し、system/local/external TTS provider へ接続できる基盤を作る。

- [x] 設計書 — `PHASE11_ADAPTIVE_TTS_DESIGN.md` + `phase8_planning_and_prompts.md` プロンプト
- [x] Phase 11A: `npcVoiceCore.ts` / `ttsProviderCore.ts` + Web Speech ルーティング + World Preview
- [x] `npc_registry.json` に voice profile metadata を追加（parser + caps）
- [x] Webview 📢 と NPC profile の sender 名マッチング
- [x] Phase 11B: local/external provider bridge（edge-tts local + OpenAI external）
- [x] `speakerNpcId` on GameEntry + turn_result gmEntry
- [x] 外部API opt-in（`tts.external.enabled` + SecretStorage API key）

---

## 🟢 Phase 12 (v1.13.0): Tile Overmap / ローグライク風タイルマップ (担当: Claude)
*ステータス: 完了（v1.13.0 でリリース。残るのは実機での見た目確認のみ）*

DF/CDDA 風のタイルオーバーマップ表示モード。「GM に読ませるデータ量を増やさない」ため、タイルは worldSeed + リージョンレイアウトから決定論的に導出する表示専用レイヤーとし、保存も GM プロンプト注入も一切しない。

- [x] `src/tileOvermapCore.ts` — ノイズ付き Voronoi で 64×64 biome グリッド + 街道（Bresenham）を導出（永続化なし・メモ化・空リージョンfallback）
- [x] `worldView.ts` — worldView message に `tileOvermap` フィールドを追加
- [x] Webview 第3マップモード「タイル」— Canvas ASCII レンダラー（`TILE_OVERMAP_ASCII_THEME`）、ピン/現在地 @/リージョンラベル、リサイズ対応、localStorage 永続化
- [x] i18n 4ロケール（`mapModeTile` / `overmapEmpty`）+ `scripts/test_tile_overmap_core.js`（npm test 組み込み）
- [x] v1.14.0: ジャンル別テーマリスキン（cyberpunk / postapoc / zombie / scifi / steampunk / cosmic-horror / oriental / modern の8種、`TILE_OVERMAP_THEME_OVERRIDES`）
- [x] v1.14.0: `Region.hazard`（radiation / toxic / infested / quarantine / anomaly / haunted / storm / corrupted の8種）+ タイル散布オーバーレイ + パーサ検証
- [x] v1.14.0: World Forge Generator 新テーマ6種（post-apocalyptic / zombie-apocalypse / scifi / steampunk / cosmic-horror / oriental-fantasy）+ テーマ×バイオーム条件のハザード自動散布
- [x] v1.14.0: 羊皮紙マップ用テーマスタイル追加（steampunk / cosmic-horror / oriental — cosmic は zombie ルールの `horror` マッチより前に配置すること）
- [ ] 将来: 画像タイルセット対応 — CDDA `tile_config.json` 方式（biome コード → スプライトアトラス）。`drawOvermapTile()` の差し替えだけで移行できる構造にしてある
- [x] fog of war（visited locations ベース）— **Cartography C8** 完了（v1.15.x）。設計: `docs/CARTOGRAPHY_PHASE8_DESIGN.md` / レビュー PASS: `docs/CARTOGRAPHY_C8_REVIEW_GEMINI.md`（Gemini, 2026-07-02）
- [x] **Cartography C9** — 地図/伝聞アイテム + 遠隔 FoW 開示（v1.16.0、`docs/CARTOGRAPHY_C9_DESIGN.md`）
- [x] **Debug sandbox** — 自然言語デバッグコマンド + Inspector デバッグコンソール（v1.17–1.18）
- [x] **World time passage B (v1)** — `elapsedWorldTurns` + サンドボックス休息・旅（v1.18.0、`docs/WORLD_TIME_PASSAGE_IDEA.md`）
- [ ] 将来: ローカル戦術マップ（建物内グリッド）は GM 連携設計が必要なため別トラック
- [ ] 将来: GM プロンプトへの hazard 1行注入（現在地リージョンに hazard がある時だけ「You are in a radiation zone」等を足す — 数トークンで済む）

---

## 次期ロードマップ（v1.18 以降・設計済み）

本体（GM 基盤 + Cartography C9 + Debug + Layer B）は **v1.18.0 で一段落**。以降は **3 トラック並行**（命名: `docs/PHASE_NAMING.md` §Living World / §Fable5）。

### トラック A — Fable5（既存資産に安く乗る・**実装優先**）

設計正本: `docs/FABLE5_FEATURE_PROPOSALS_DESIGN.md`

| ID | 機能 | 推奨 Ver（実装時） | 依存 |
|----|------|-------------------|------|
| **F1** | Chronicle（あらすじ・年表） | **1.19.0** ✅ | journal / recentChanges |
| **F2** | Pacing Director（1 行注入） | **1.19.1** ✅ | F1 分類器共有 |
| **F3** | 派閥レピュテーション | **1.20.0** ✅ | `resolvedQuests` |
| **F4** | 旅路エンカウント | **1.21.0** ✅ | Layer B + `Region.hazard` |
| **F5** | リプレイ書き出し | **1.21.1** ✅ | entries + gallery |
| **F6** | 手描き地図インポート | **1.22.x**（wow 枠） | `vlmQueue` |

**推奨実装順:** F1 → F2 →（並行 polish F5）→ F3 は LW1 設計に合流 → F4 は LW1 移動と同時。

### トラック B — Living World（世界ファースト・経済/自律）

設計正本: `docs/COMMERCE_AND_AGENCY_BRIEF.md`（§0 世界ファースト）

| ID | 機能 | Ver | 状態 |
|----|------|-----|------|
| **LW-W1** | 動く世界の深化（シム→可視化・GM Since last visit） | 1.20.0 | ✅ |
| **LW1** | Commerce（貿易・輸送・相場） | 1.21.0 | ✅ |
| **LW2** | NPC Agency + trust 所在 + Commerce UI | 1.22–1.27 | ✅ |
| **LW3** | NPC↔NPC / プレイヤー↔NPC 絆、世界波及、交易還元 | 1.29–1.33 | ✅ |

**次（LW4+ 候補）:** 絆マイルストーン統合タイムライン · ally/friction 噂の強化 · Workshop デモ GIF

### トラック C — Parallel polish（Ver 単独では上げない）

- README 実スクショ/GIF（**F5 が素材になる**）
- Cartography stale UX、`testing_checklist.md` 消化
- hazard 1 行注入（ロードマップ旧項目・F2/F4 と同 seam）

### Ver 上げルール（次期）

| 内容 | Ver |
|------|-----|
| **設計 doc / ブリーフのみ** | 上げない（`CHANGELOG [Unreleased]` に Docs 一行可） |
| **F1 または F1+F2 出荷** | **1.19.0**（プレイ体験・GM 注入） |
| **LW-W1 出荷** | **1.20.0** |
| **LW1 + F3 同梱など** | **1.21.0** |
| パッチ・i18n のみ | **1.x.y** パッチ |

> **現行 `package.json`:** **1.34.0**（2026-07-03 — Parlor Phase A）。設計 doc のみでは Ver を上げないルールは継続。

**Planning handoff:** `phase8_planning_and_prompts.md`（Phase 8-11 の担当AI別プロンプト）

---

## 🟡 Phase 12: Parlor Experience Profile（SillyTavern 的シンプル ⟷ フル CRPG）

*ステータス: 設計完了（2026-07-03）· 実装待ち（Claude 5h 制限 → Grok 担当）*

設計正本: [`docs/PARLOR_MODE_DESIGN.md`](docs/PARLOR_MODE_DESIGN.md)  
AI 振り分け: [`docs/PARLOR_MODE_AI_PROMPTS.md`](docs/PARLOR_MODE_AI_PROMPTS.md)（Gemini / ChatGPT / Grok — Claude 除外）

**目的:** 同一拡張内で **Parlor（1対1 RP・JSON 不要）** と **Campaign（現行）** を切替。ST ユーザー入口 + パワーユーザーの「休憩モード」。1クリック昇格/降格。

### Phase A — MVP（v1.34.0 候補）

- [x] `experience.json` + `parlor_session.json` 契約（`*Core.ts`）
- [x] `parlorPromptBuilderCore` + `gmBridgeRunner` Parlor 分岐（vscode-lm 優先）
- [x] Webview profile フィルタ（CRPG タブ非表示）
- [x] Start Hub「🎭 キャラと話す」
- [x] Core テスト + Campaign 回帰 **84/84**

### Phase B — ST 体験の完成（v1.35.0）

- [x] `connection_profiles.json` UI
- [x] `TextAdventureGMSkill/PARLOR_SKILL.md`
- [x] `persona.json` · 背景ギャラリー

### Phase C — 移行

- [ ] `parlorPromoteCore`（Parlor → Campaign 昇格ウィザード）
- [ ] Campaign → Parlor 降格 + history インポート
- [ ] `parlor_archive.ndjson` · 長期 summary

### AI 分担（2026-07-03）

| AI | 担当 |
|----|------|
| **Gemini** | README 4言語 · Start Hub 文案 · スクショ計画 · testing_checklist |
| **ChatGPT** | セキュリティ監査 · PARLOR_SKILL.md · 昇格データ境界 · 実装ゲート |
| **Grok** | Phase A 実装 · test · CHANGELOG · push |
| Claude | 5h 制限中 — 復帰後に Phase B UI polish 候補 |
