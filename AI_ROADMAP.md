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

## 🟡 Phase 4 (v1.4.0 - v1.4.1): Living World Feedback (Next!)
*ステータス: 未着手*
**目的**: Emergent Simulation の変動を「出来事」として履歴化し、プレイヤーやNPCに体感させる。

- [ ] **1. World Event Log (`world_event_log.ndjson`)**
  - simulator が faction_conflict, danger_shift などのイベントを生成・記録
- [ ] **2. World Change Summary**
  - 数ターン（3〜5 GMターン）ごとに「世界の変化」をサマリーとして出力
- [ ] **3. World Tab Event Timeline**
  - World タブ内に「Recent Events」欄を追加し、最新5件や重要度別に表示
- [ ] **4. Map Highlight**
  - 最近変化した region/location を World Map 上でハイライト（danger上昇で赤枠など）
- [ ] **5. NPC Reaction Propagation (目玉機能)**
  - World Event の発生を関連 NPC の Needs や Memory に反映（例：襲撃された町のNPCに `need: safety` を追加）
- [ ] **Hardening (v1.4.1)**
  - event log pruning, max event count, severity clamp, duplicate dedup, migration

---

## ⚪ Phase 5 (v1.5.0 - v1.5.1): Visual Memory / Soulgaze
*ステータス: 予定*
**目的**: 生成された画像や入力画像を、GMの記憶・世界状態・シーン管理に戻し、AIに「視覚」を持たせる。

- [ ] **1. Visual Memory Cache (`visual_memory.json/ndjson`)**
  - 画像の解析結果を hash キーでキャッシュ
- [ ] **2. Non-blocking VLM Queue**
  - ターン進行を止めず、バックグラウンドで Ollama/OpenRouter VLM による画像解析を実施
- [ ] **3. Scene Context Builder**
  - 抽出した視覚コンテキスト（Notable visual details, Mood 等）を次ターンの GM プロンプトに注入
- [ ] **4. Gallery Metadata & UI**
  - ギャラリー画像に locationId, prompt, worldTurn などのメタデータを付与
  - 手動 "Analyze Image" ボタンの追加（Gallery/World Tab）
- [ ] **Visual World Polish (v1.5.1)**
  - World タブから場所画像履歴の閲覧、NPC portrait との紐付け
