# Cartography C9 — 設計ブリーフ（地図/伝聞アイテム & 遠隔 FoW 開示）

> **ID:** Cartography **C9**（Roadmap Phase 9 = Agentic GM とは別軸。命名は `docs/PHASE_NAMING.md` 参照）  
> **目的:** C8（FoW）では「足で踏むと霧が晴れる」だけだった世界に、**地図・噂・情報源** による先行開示を足す。実装前にゲームフィール / GM 契約 / データモデルを固める。  
> **推奨フロー:** 本ブリーフ → **Claude** が設計 doc → **ChatGPT** が allowlist・セキュリティレビュー → **Grok（Cursor）** が実装。

---

## 前提

Cartography **C8** 実装レビュー **PASS**（Gemini, 2026-07-02）— `docs/CARTOGRAPHY_C8_REVIEW_GEMINI.md`。C9 設計・実装へ進行可。

---

## 現状（Cartography C8 完了分・v1.15.2）

| 項目 | 状態 |
|------|------|
| Region FoW（discovered / rumored / unknown） | ✅ `src/fogOfWarCore.ts` |
| `discoveredRegionIds` 派生（`currentLocationId` 変化時） | ✅ `processTurnResult` |
| `rumored` = discovered の `connectedTo` 隣接（非永続導出） | ✅ |
| 3モード描画（Parchment / Tile / Mermaid） | ✅ `webview/modules/85-world.js` 等 |
| ピン操作（詳細パネル・チャット挿入・44px ヒット） | ✅ C8 PR3 |
| danger / faction / recentChanges 動的 FB | ✅ C8 PR4 |
| Auto Location Image（gated） | ✅ C8 PR5 |
| GM FoW 1行（`fogInPrompt`、gated） | ✅ C8 PR6 |
| **GM による遠隔リージョンの先行開示** | ❌ C8 Non-Goal |
| **地図/伝聞アイテム（プレイヤーが「使う」UI）** | ❌ 未実装 |
| 構造化インベントリ | ❌ `GameStatus.inventory` は `string[]` のみ（緩い） |

### C8 から引き継ぐ不変条件（設計で破らないこと）

1. **タイル FoW は非永続** — 64×64 マスクを `game_state` に保存しない。
2. **GM プロンプト FoW 追加は既定 OFF** — ON 時も **1行・≈40 tokens**（C8 PR6 と整合）。
3. **`rumored/unknown` の locationName は worldView でマスク** — Remote Play / spectator 漏れ防止。
4. **ピンクリックは移動実行しない** — チャット挿入提案まで（Persist-Before-Narrate）。
5. **sim イベントで FoW を勝手に晴らさない** — プレイヤー知覚のみ。
6. **後方互換** — `connectedTo` グラフ駆動、座標無し forge でもクラッシュしない。

### C9 で**再検討してよい**こと（C8 では禁止だった）

- **`statePatch` `/world` allowlist の拡張**（下記 Q1 案 B）
- GM が narration と整合する **明示的な遠隔開示**（キーワード自動解析は引き続き Non-Goal）

---

## 背景（C8 設計 doc からの持ち越し）

`docs/CARTOGRAPHY_PHASE8_DESIGN.md` §8 **Q1** より:

| 案 | 概要 | C8 時点の評価 |
|----|------|----------------|
| **A** | 拡張派生のみ（`currentLocationId` + 隣接 `connectedTo`） | C8 で採用・実装済み |
| **B** | append-only `/world/discoveredRegionIds` を allowlist に追加。GM が「地図入手」等を表現 | **C9 で地図/伝聞アイテムと一緒に検討** |
| **C** | narration キーワード解析で自動開示 | Non-Goal（誤検知） |

**C9 設計 doc では Q1 の A/B を必ず比較表で結論づけること**（採用案・却下理由・ハイブリッド案があれば明記）。

---

## 設計で決めるべき問い（Claude への依頼文にそのまま使える）

### 必須 — Q1: 遠隔 FoW 開示のメカニズム（A/B 比較）

1. **案 A を C9 でも維持する場合**
   - 地図アイテムは **UI/チャット挿入のヒントだけ** で、実際の開示は依然 `currentLocationId` 移動のみ？
   - それでプレイヤー体験は十分か？

2. **案 B（allowlist 拡張）を採用する場合**
   - append-only `/world/discoveredRegionIds` の patch 形式（`add` op？ 重複拒否？ 上限？）
   - GM が誤って全マップ開示したときのガード（1ターンあたり件数上限、id 検証、既存 discovered は no-op）
   - **拡張派生**（訪問）と **GM 明示追記** の優先順位・マージルール
   - Agentic GM（Referee）経由時のバリデーション
   - allowlist 拡張は不変条件3のスコープ拡大 → **トレードオフ表** を必ず書く

3. **案 C 以外の第三案**（あれば）
   - 例: `turn_result` の新フィールド `revealedRegionIds`（`statePatch` とは別経路）
   - 例: `game_state.world.knownRumorRegionIds`（噂専用・discovered より弱い）

### 地図/伝聞アイテムの UX

4. **アイテムの存在形態**
   - 既存 `GameStatus.inventory: string[]` を流用 vs `game_state.world` に専用フィールド
   - シナリオパック（`world_forge` / lorebook）での定義方法
   - 「古い地図」「噂のメモ」「商人からの情報」などの **テンプレ種別**

5. **プレイヤー操作フロー**
   - World タブから使うか、インベントリパネルか、チャットコマンドか
   - 使用時: 即開示 vs GM ターン待ち（「地図を広げる」行動として挿入 → GM が patch）
   - C8 の `insertChatText` パターンとの統合

6. **開示の強さ**
   - 地図アイテム → `discovered` 直昇格 vs `rumored` のみ
   - 遠隔リージョン（非隣接）を許すか、隣接チェーンのみか
   - ロケーション単位の部分開示は C9 スコープか（C8 は Region 主）

### GM 契約・プロンプト

7. **GM が書いてよいこと / 読むこと**
   - 案 B 採用時の allowlist 行の追加
   - GM への指示テンプレ（「プレイヤーが地図を使った」ことを narration でどう扱うか）
   - `fogInPrompt` との関係（未踏リストに「地図で既知だが未踏」のリージョンを含めるか）

8. **拒否すべきパターン**
   - GM が `discoveredRegionIds` を削除・上書き
   - narration だけで内部状態を変える（patch なし）
   - spectator に漏れる worldView フィールド

### データモデル・永続化

9. **`game_state.world` 追加候補**（採否を設計 doc で決める）
   - `revealedByItemRegionIds` / `mapItemsConsumed` / `activeRumors`
   - アイテム消費の有無（使い捨て地図 vs 永久参照）

10. **`world_state.json` / `world_forge.json`**
    - 変更が必要か（基本は C8 同様「変更なし」で済むか）

### 体験・Non-Goals

11. **Player Journeys（3本必須）**
    - J1: 商人から「北の森の地図」を得て World タブで未知が rumored/discovered に変わる
    - J2: NPC の噂だけで遠隔リージョン名が **rumored** になる（中身は未踏）
    - J3: 誤った古い地図（存在しない regionId）を渡されたときの UX

12. **C9 Non-Goals（明示）**
    - narration キーワード自動開示（案 C）
    - タイル単位永続 FoW
    - クリック即移動
    - per-role 別 FoW（player vs spectator）
    - フル RPG インベントリシステム（重量・装備スロット等）

---

## 参考にすべき既存コード

| 領域 | ファイル |
|------|----------|
| FoW コア | `src/fogOfWarCore.ts` |
| 訪問派生 | `src/statePatch.ts`（`processTurnResult`, `WORLD_SUBPATH_ALLOWLIST`） |
| worldView / マスク | `src/worldView.ts` |
| World タブ UI | `webview/modules/85-world.js`, `86-tile-overmap.js` |
| チャット挿入 | `src/webviewHandlers.ts`（`insertChatText`） |
| GM プロンプト | `src/gmPromptBuilderCore.ts`（FoW 1行: `buildFogUnexploredPromptLine`） |
| 型 | `src/types/GameState.ts`（`GameStateWorld`, `GameStatus.inventory`） |
| C8 設計正本 | `docs/CARTOGRAPHY_PHASE8_DESIGN.md`（§3.1, §5, §8 Q1） |
| 命名規則 | `docs/PHASE_NAMING.md` |

---

## 成果物の期待形式（Claude 出力テンプレ）

設計 doc は `docs/CARTOGRAPHY_C9_DESIGN.md` として保存する想定。C8 設計 doc と同じ章立てを推奨:

1. **Executive Summary**（200字以内）
2. **Player Journeys**（3本・mermaid 可）
3. **Feature Spec**
   - 3.1 地図/伝聞アイテム
   - 3.2 遠隔 FoW 開示（**Q1 A/B 比較表 + 採用案** — 必須）
   - 3.3 UI（World タブ / インベントリ連携）
4. **Data Model Delta**（`game_state` / `worldView` / シナリオ定義）
5. **GM Contract**（allowlist 変更がある場合は before/after 表）
6. **Non-Goals**
7. **PR Plan**（独立マージ可能な DAG。例: C9-PR1 開示コア → PR2 アイテム UX → PR3 GM プロンプト）
8. **Risks & Open Questions**

コードは書かない（interface / 疑似コードのみ）。実装は Grok 担当。

---

## 誰に何を頼むか（推奨分担）

| 役割 | 推奨 | 理由 |
|------|------|------|
| **主設計（UX / Journeys / データモデル）** | **Claude** | C8 と同様。探索感・CRPG 的「情報入手」の意味論 |
| **allowlist・セキュリティ・GM 契約レビュー** | **ChatGPT** | `statePatch` 拡張・spectator 漏れ・Agentic Referee 整合 |
| **ローグライク地図文化のブレスト** | **Grok（ブラウザ）** | CDDA/DF の map item 慣習（任意） |
| **実装・テスト** | **Grok（Cursor）** | `*Core.ts` 抽出・`npm test`・webview smoke |

**ゲート:** 案 B（allowlist 拡張）を採用する場合、ChatGPT レビュー **PASS 前に実装開始しない**。

---

## Claude へコピペするプロンプト

```markdown
あなたは LoreRelay（text-adventure-vsce）の Cartography **C9** 設計担当（Claude）です。
Roadmap Phase 9（Agentic GM）とは別トラックです。命名は `docs/PHASE_NAMING.md` を読んでください。

## 必読（この順）

1. `docs/PHASE_NAMING.md`
2. `docs/CARTOGRAPHY_C9_BRIEF.md`（本依頼のスコープ）
3. `docs/CARTOGRAPHY_PHASE8_DESIGN.md`（C8 正本。§3.1 FoW、§5 GM Contract、§8 Q1 を重点）
4. `src/fogOfWarCore.ts`
5. `src/statePatch.ts`（`WORLD_SUBPATH_ALLOWLIST` と `processTurnResult` の FoW 派生）
6. `src/types/GameState.ts`（`GameStateWorld`, `GameStatus.inventory`）
7. `CHANGELOG.md` の v1.15.x（C8 実装サマリ）

## タスク

`docs/CARTOGRAPHY_C9_DESIGN.md` を新規作成してください。実装コードは書かず、interface / 疑似コードのみ。

### 必須要件

1. **§8 Q1 の A/B を比較表で評価し、採用案を決める**
   - A: 拡張派生のみ（C8 維持）
   - B: append-only `/world/discoveredRegionIds` allowlist 拡張
   - C（キーワード解析）は Non-Goal のまま
   - ハイブリッドや第三案があれば併記

2. **地図/伝聞アイテム**の Player Journey 3本（ブリーフ §11 参照）

3. **C8 不変条件 1–6** を踏まえたうえで、C9 で変える点だけ明示

4. **GM Contract** — allowlist 変更するなら before/after。しないなら「無改修を維持する理由」

5. **PR Plan** — 独立マージ可能な DAG（C9-PR1…）

6. **Remote Play** — worldView での情報漏れ対策を Feature Spec に含める

### 出力後

- 設計 doc パスを冒頭に明記
- 未決事項は Open Questions に残し、実装者（Grok）が勝手に決めないこと
```

---

## 次のステップ（ユーザー / PM）

1. 上記プロンプトを Claude に渡す
2. `docs/CARTOGRAPHY_C9_DESIGN.md` をレビュー
3. 案 B なら ChatGPT に GM Contract レビュー依頼
4. 確定後 Grok に `/design` または `/implement`（PR Plan 単位）