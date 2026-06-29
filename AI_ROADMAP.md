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
  - MAX_ENTRIES=500, LRU eviction, mtime-based cache, 58 tests
- [x] **2. Non-blocking VLM Queue**
  - ターン進行を止めず、バックグラウンドで Ollama/OpenRouter VLM による画像解析を実施 (vlmQueue.ts)
  - キャッシュヒット時は同期即座返却、ミス時は fire-and-forget、単一スロットキュー
- [x] **3. Scene Context Builder**
  - buildVisionContext() が visual_memory.json を優先参照; buildVisualContextSnippet() で @locationId 付きスニペット注入
- [x] **4. Gallery Metadata & UI**
  - galleryImages を GalleryEntry[] に拡張、locationId/worldTurn/prompt を保持
  - サムネイル上に badges 表示 (📍 location、T{turn}、👁 Analyzed)
  - 手動 "👁 Analyze" ボタン、VLM 完了後に description をツールチップ表示
  - vlmAnalysisComplete で即時 gallery 更新、vscode.setState に永続化
- [x] **Visual World Polish (v1.5.1)**
  - World タブに「Scene History」ストリップ（visual_memory から最新4件、T{turn} バッジ付き）
  - World タブに「NPCs Here」パネル（portrait 表示、urgentNeed 数、「Set Portrait」ボタン）
  - NpcEntry に portraitImagePath? フィールド追加
  - QuickPick フローで analyzed 画像一覧から portrait を選択して npc_registry.json へ紐付け

---

## 🟢 Phase 6 (v1.5.4 → v1.6.1): Audit Wave — 硬化ウェーブ
*ステータス: 完了*
機能追加ではなく、巨大化したコードベースを7トラックに分割して補強・テスト穴埋めを行う。

- [x] **T7 メタ**: `test_ws_functionality.js` を `npm test` に統合
- [x] **T1**: Core State & Patch — `validateGameState` 拡張、`npcMemoryUpdates` 二重防御、`mergeGmEntry` image クランプ、`test_validate_game_state.js`
- [x] **T2**: GM Bridge & Turn — `gmPromptBuilderCore`、`diceRoller` クランプ、GM失敗時 dice ledger クリア、remote unlock
- [x] **T3**: World + NPC + Living Feedback（再監査）
- [x] **T4**: ST Import / Character / Lorebook
- [x] **T5**: Visual Memory + Image Gen + VLM（回帰）— vlmQueue pendingPath 修正
- [x] **T6**: Webview & postMessage — webviewHandlersCore、ハンドラ検証強化、85-world クランプ
- [x] **T7**: Remote Play セキュリティ再監査（v1.6.0 / `7147982`）
- [x] **T8**: Extension Hub — World Forge hub、GM session reset、sample scenario git（`754c6ed`）

---

## 🟢 Phase 7 (v1.7.0 → v1.7.3): Cartography
*ステータス: 完了*

世界地図の可視化と ComfyUI 羊皮紙パイプライン。v1.7.1〜1.7.3 でパス安全・レビュー指摘対応まで硬化済み。

- [x] Region `x` / `y` / `biome`、Mermaid biome スタイル・pan/zoom（v1.6.3 基盤）
- [x] `cartographyLayoutCore.ts` + `render_cartography_layout.py`（レイアウト PNG）
- [x] `comfyui_generate_cartography.py` + World タブ **Diagram / Parchment** + ピン overlay
- [x] `cartographyPathCore.ts` / `cartography_path_utils.py` パス検証
- [x] workflow 契約・smoke test・`lost-catacombs` デモ layout
- [x] v1.7.2 Python/TS パス統一、v1.7.3 生成 PNG コピー前検証

---

## 🟡 Phase 8 (v1.8+): Event-to-Quest
*ステータス: 計画中*

世界シミュレーションの出来事をプレイ可能なクエストへ接続する。

- [ ] `recentChanges` / 派閥・地域イベントから Quest Hook 候補を生成
- [ ] NPC Need から依頼化
- [ ] World タブに「Quest Hooks」表示
- [ ] Scenario Director へ optional objective 追加
- [ ] 解決後に `world_state` / `npc_registry` へ反映

**並行候補（公開 polish）:** README 実スクショ/GIF、Cartography stale UX、`testing_checklist.md` 消化
