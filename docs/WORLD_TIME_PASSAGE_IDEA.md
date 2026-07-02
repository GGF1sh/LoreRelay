# World Time Passage — アイデア & 実装メモ

> **関連:** Emergent Simulation（`src/emergentSimulator.ts`）、Living World（`world_state.json`）、Cartography FoW（C8）

---

## 概要

プレイヤーが「宿で休む」「旅に出る」「何十ターンも経過した」という **物語的時間経過** と、開発者が世界シミュを一気に進めて観察する **デバッグ用途** を分けて設計する。

| 層 | 状態 | 説明 |
|----|------|------|
| **A. デバッグ・バルクシム** | **実装済み** | Inspector から `worldTurn` を N ステップ進める（GM ターン不変） |
| **B. 物語的時間経過** | **v1 部分実装** | デバッグサンドボックスで休息・旅コマンド。通常プレイは `turn_result.elapsedWorldTurns`（GM 契約） |

---

## A. デバッグ・バルクシム（実装済み）

### 使い方

1. VS Code 設定で `textAdventure.debug.bulkWorldSim` を **true**
2. Game Rules で **Emergent Simulation** を ON（`world_forge.json` 必須）
3. **Inspector** タブ → 「デバッグ: 世界シミュを進める」
4. ステップ数を入力 → **進める** → 確認ダイアログで実行

### 設定

| キー | 既定 | 説明 |
|------|------|------|
| `textAdventure.debug.bulkWorldSim` | `false` | UI 表示 + 実行許可 |
| `textAdventure.debug.bulkWorldSimMaxSteps` | `50` | 1回あたり上限（1–100） |

### 挙動

- `runSimulationStep` を N 回ループ（`src/worldSimBulkCore.ts`）
- `world_state.json` を保存。NPC Registry 有効時はイベントを各ステップで反映
- 終了時に `generateQuestHooks` を 1 回実行
- **`lastSimulatedGmTurn` は更新しない** — GM 会話ターン数と世界ターンは独立
- **FoW（C8）は変化しない** — シムはプレイヤー知覚ではない（設計どおり）

### コード

| ファイル | 役割 |
|----------|------|
| `src/worldSimBulkCore.ts` | 純関数・要約生成 |
| `src/worldSimBulkRunner.ts` | 設定ゲート・永続化 |
| `webview/modules/80-inspector.js` | Inspector UI |
| `scripts/test_world_sim_bulk_core.js` | 単体テスト |

### 次 GM ターンで見えるもの

- World タブの danger / faction / recentChanges / Quest Board 更新
- プロンプトの `[World State — Turn N]` と `Since Last Visit`（Living World 既存経路）

---

## B. 物語的時間経過（v1 部分実装）

### 実装済み（v1.18.0）

| 経路 | 内容 |
|------|------|
| **デバッグサンドボックス** | `宿で休む`（+1 worldTurn・HP全回復）、`N日かけて◯◯へ旅する`（+N worldTurn・移動） |
| **通常 GM** | `turn_result.elapsedWorldTurns`（1–100）— `statePatch` 適用後に `persistWorldSimulationSteps` |
| **GM プロンプト** | Emergent Simulation ON 時 `[World]` に `ELAPSED_WORLD_TURNS_PROMPT_LINE` |

### 未実装（B 残り）

### なぜ面白いか

- **宿で休息** — HP/MP 回復（RPG ON 時）+ 世界が1〜数ターン動く + GM が「翌朝の様子」を描写
- **旅** — 移動に日数がかかる CRPG 感。道中は GM narration、到着で `currentLocationId` 更新
- **長期スキップ** — 「1ヶ月の封印」「冬眠」など。バルクシム + GM による「その間に起きたこと」要約

### おすすめアーキテクチャ（B3 ハイブリッド）

C8 ピン操作と同じパターン:

```
プレイヤー提案（チャット挿入 / ボタン）
    → GM が turn_result で確定（日数・休息の種別）
    → 拡張がバルクシム or ステータス更新を機械実行
    → GM が narration で物語を書く
```

### 設計で決めること（C9 / 別トラック設計時）

1. **時間の単位** — `worldTurn` そのもの vs `game_state.status.time`（表示用テキスト）vs 新フィールド `elapsedDays`
2. **シムとの対応** — 1泊 = 1 `worldTurn`？ 旅 3 日 = 3 ステップ？
3. **休息の効果** — HP/MP 回復は `statePatch` 既存経路か、専用 ops か
4. **GM 契約** — `turn_result` に `elapsedWorldTurns` を足すか、narration のみか
5. **FoW** — 時間経過だけでは霧は晴れない（C8 維持）。移動は別途 `currentLocationId`
6. **Remote Play** — バルクシム結果は全員同じ `world_state` を見る

### Non-Goals（B）

- narration キーワードだけで自動的に何十日も進める（誤検知）
- シムだけ回して GM をスキップ（物語層では GM narration 必須）
- per-role で異なる経過時間

### Player Journey 案（設計 doc 用メモ）

| # | シーン | 操作 | 世界 | 描写 |
|---|--------|------|------|------|
| J1 | 宿屋 | 「ここで一晩休む」挿入 → GM 承認 | +1 worldTurn、HP 回復 patch | 翌朝の街の変化 |
| J2 | 長旅 | 「3日かけて北の森へ」 | +3 worldTurn、移動 patch | 道中の出来事（短く） |
| J3 | 封印 | 「100年後に目覚める」 | +N worldTurn（上限要検討） | GM が世紀の要約 |

---

## 通常プレイとの関係

通常は `maybeTickSimulation` が **GM ターン数 ÷ simIntervalTurns** で 1 ステップだけ進む。バルクシム（A）はその制限を外して **観察・テスト用** にまとめて進める。物語層（B）は将来的に「プレイヤーが明示した時間経過」にだけバルクシムを紐づける想定。

---

## 関連ドキュメント

- `WORLD_SYSTEM_DESIGN.md` — Emergent Sim 全体
- `docs/CARTOGRAPHY_PHASE8_DESIGN.md` — FoW（時間経過では霧は晴れない）
- `docs/CARTOGRAPHY_C9_BRIEF.md` — 地図アイテム（旅・噂と組み合わせ可）
- `docs/PHASE_NAMING.md` — トラック命名