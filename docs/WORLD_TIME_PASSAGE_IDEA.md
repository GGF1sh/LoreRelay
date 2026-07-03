# World Time Passage — アイデア & 実装メモ

> **関連:** Emergent Simulation（`src/emergentSimulator.ts`）、Living World（`world_state.json`）、Cartography FoW（C8）

---

## 概要

プレイヤーが「宿で休む」「旅に出る」「何十ターンも経過した」という **物語的時間経過** と、開発者が世界シミュを一気に進めて観察する **デバッグ用途** を分けて設計する。

| 層 | 状態 | 説明 |
|----|------|------|
| **A. デバッグ・バルクシム** | **実装済み** | Inspector から `worldTurn` を N ステップ進める（GM ターン不変） |
| **B. 物語的時間経過** | **v1 部分実装** | デバッグサンドボックスで休息・旅コマンド。通常プレイは `turn_result.elapsedWorldTurns`（GM 契約） |
| **C. 三層時計モデル** | **プロンプト実装済み** | Exchange / Narrative Time / World Day の分離。GM プロンプト `[Narrative Time — Three Clocks]` |

---

## C. 三層時計モデル（設計原則）

プレイヤー↔GM の **やり取り回数** と **ゲーム内で経った時間** は 1:1 ではない。これはバグではなく、TRPG/CRPG の可変時間圧縮（variable time compression）として設計する。

### 三つの時計

| 時計 | 何を測るか | 典型例 | 更新経路 |
|------|-----------|--------|----------|
| **Exchange（やり取り）** | 場面の解像度（プレイヤー↔GM 往復） | 酒場で30回しゃべる | GM ターン数（自動） |
| **Narrative Time（物語時間）** | その場面内の経過（分・時・「夕方」） | 同じ夕方のうち45分 | `statePatch` → `/status/time`、必要なら `/director/scene` |
| **World Day（世界日）** | 市場・NPC・情勢シミュ | 旅3日、一晩休む | `turn_result.elapsedWorldTurns` → `worldTurn` |

**原則:** やり取りは「場面の細かさ」、時間は「GM がその手で確定する量」。

### Beat 別の時間密度

`journalBeatCore.ts` の beat 分類と同じ発想で、1 Exchange あたりの Narrative Time / World Day の期待値が変わる。

| Beat | やり取り | Narrative Time | World Day (`elapsedWorldTurns`) |
|------|---------|----------------|--------------------------------|
| **social（会話）** | 多い | 少ない（分〜1時間） | **0**（同じ scene/location が続く限り） |
| **exploration（調査）** | 中程度 | 数時間 | **0**（明示休息まで） |
| **combat（戦闘）** | 少ない | ラウンド単位（秒〜分） | **0**（数日戦など明示時のみ） |
| **travel（移動）** | 少ない | モンタージュ（日〜週） | **コミット時に N 日**（`planTravel` 等） |
| **downtime（休息）** | 1〜数 | 一晩〜数日 | **コミット時に N 日** |

### GM 運用ルール（4つ）

1. **通常の会話・調査** — `elapsedWorldTurns = 0`。`director.scene` と location が変わらない限り、何十往復しても World Day は進めない。
2. **Narrative Time のみ更新可** — 灯りが弱まる、夕暮れが深まる等は `/status/time` で表現してよい（シムは動かさない）。
3. **World Day はコミットイベントのみ** — 明示の休息、明示の旅、GM が narration で確定した時間スキップ。`turn_result` で日数を確定する。
4. **旅はモンタージュ** — 道中の少数 Exchange で多数の日数を表す。`[Living World — Travel Plan]` の `plan.days` を `elapsedWorldTurns` に載せる。

### 例

| シーン | Exchange | Narrative Time | World Day |
|--------|----------|----------------|-----------|
| 酒場で長話 | 30+ | 15分〜1時間 | 0 |
| 町→町の旅 | 3〜5 | モンタージュ（1日目、雨の2日目、着港） | +3（例） |
| 宿で一晩 | 1 | 翌朝 | +1 |

### In-World Chat との関係

**In-World Chat** は三層すべて **停止**（参照のみ）。Campaign 本編との切り分け。

### コード

| ファイル | 役割 |
|----------|------|
| `src/gmPromptBuilderCore.ts` | `buildNarrativeTimePromptBlock()` — GM 向け三層ルール |
| `src/gmPromptBuilder.ts` | Campaign プロンプトに `narrativeTime` チャンクとして注入 |
| `src/agenticGmCore.ts` | Referee JSON 契約の `elapsedWorldTurns` 説明 |
| `src/journalBeatCore.ts` | beat 分類（social/travel 等） |

### 将来（未実装）

- `turn_result.elapsedNarrativeMinutes` — 表示・年表用の任意フィールド（シムは動かさない）
- UI で `status.time`（物語時刻）と `worldTurn`（世界日）を分離表示

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
| **GM プロンプト** | `[Narrative Time — Three Clocks]`（常時）+ Emergent Simulation ON 時に World Day コミット手順 |

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

1. ~~**時間の単位**~~ — **決定（§C）:** Exchange / `status.time` / `elapsedWorldTurns`（World Day）の三層。`elapsedNarrativeMinutes` は将来。
2. ~~**シムとの対応**~~ — **決定:** 1泊 ≈ 1 `worldTurn`、旅 N 日 ≈ N ステップ（明示コミット時のみ）。
3. **休息の効果** — HP/MP 回復は `statePatch` 既存経路か、専用 ops か
4. ~~**GM 契約**~~ — **決定:** 会話中は `elapsedWorldTurns=0`、休息・旅・スキップ時のみ `turn_result` で確定。
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