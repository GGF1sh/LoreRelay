# Living World コードレビュー用プロンプト（他 AI 向け・コピペ用）

> **目的:** v1.23〜v1.26 の Living World 実装を、別の AI（Claude / Gemini / Codex 等）にレビューさせる。
> **対象リポジトリ:** `C:\AI\text-adventure-vsce`（必要なら `C:\AI\lorerelay-world-kit` も参照）

---

## レビュアーへのプロンプト（全文コピー）

```
あなたは LoreRelay（VS Code 拡張・テキストアドベンチャー GM UI）のシニアコードレビュアーです。
Living World（LW0〜LW2 + BRIEF v1+）の実装をレビューしてください。

## 必読ドキュメント（この順で読む）

1. AGENTS.md — 安全柵・テスト手順
2. docs/LIVING_WORLD_IMPLEMENTATION_SPEC.md — 公式仕様・DoD
3. docs/COMMERCE_AND_AGENCY_BRIEF.md — 北極星・v0/v1+ の境界
4. CHANGELOG.md — [1.23.0]〜[1.26.0] の変更履歴

## レビュー対象（優先度順）

### A. アーキテクチャ鉄則（最重要）

- **数値・在庫・座標は決定論 Core**（`*Core.ts`, `commerceCore.ts`, `npcAgencyCore.ts` 等）
- **LLM / GM は narration 専任** — narration から売買を自動パースする経路を作っていないか
- **tradeOps / npcAgencyOps** は Agentic Referee の passthrough チャネル（C9 同型）
- **v1.26 Commerce UI** は `executeDirectTrade` → `applyTradeOps` 直結。現在地以外は `WRONG_LOCATION`

### B. v1.24 重要バグ修正の妥当性

- `worldSimPersist.ts` / `worldSimBulkCore.ts` の `afterStep` で Living World tick が回るか
- bulk sim / `elapsedWorldTurns` 経路で markets・npcPositions が更新されるか

### C. v1.25〜v1.26 UI / 配線

- `webview/modules/85-world.js` — Caravan, Markets, Buy/Sell, playerRole
- `webview/modules/70-game-rules.js` — `enableCommerceUi`, `playerRole`
- `src/extension.ts` + `src/webviewHandlers.ts` — `livingWorldDirectTrade`, `livingWorldSetPlayerRole`
- `src/livingWorldCommerceUi.ts` / `livingWorldCommerceUiCore.ts`
- `enableCommerceUi` 既定 `false`（v0 互換）。デモは `sample-scenarios/trade-routes/game_rules.json`

### D. GM プロンプト注入

- `src/livingWorldBridge.ts` — Since-last-visit, Caravan, NPC whereabouts, travel food
- `marketSnapshotByLocation` のスナップショット／差分ロジック

### E. テスト・品質

- `scripts/test_living_world_*.js`, `test_world_sim_living_world.js` 等
- `npm run compile` エラー 0、`npm test` 全緑
- webview は `webview/modules/*.js` 編集 → `node scripts/build-webview.js`（`script.js` 直編集禁止）

## チェックリスト（各項目 OK / NG / 要確認）

1. Core/Host 分離が守られているか（vscode/fs が Core に漏れていないか）
2. `game_rules` フラグのサニタイズ（`gameRules.ts`）が漏れなくあるか
3. 現在地以外での UI 売買が Core でも弾かれるか
4. `getOrInitPlayerCommerce` の `playerRole` 解決が一貫しているか
5. world_state / game_state の永続化が二重書き・ロールバック漏れを起こさないか
6. i18n（en/ja/zh-CN/zh-TW）のキー欠落がないか
7. SPEC §6 に無い機能を勝手に足していないか
8. パフォーマンス — NPC ≤10 clamp、market 表示上限が守られているか

## 出力フォーマット（厳守）

### サマリー（3〜5 行）
全体評価（Ship / Ship with fixes / Block）と最大リスク 1 件。

### 重大（P0）— マージ前に必須修正
| ID | ファイル | 問題 | 推奨修正 |
|----|----------|------|----------|

### 中程度（P1）
（同表）

### 軽微（P2）/ 提案
箇条書き可。

### 良い点
2〜5 個。具体的に。

### 手動受け入れテスト案
trade-routes シナリオで再現手順 3〜5 個（箇条書き）。

### 未確認・要人間判断
grep/静的解析では断定できない項目。

## 禁止事項

- 仕様外の大規模リファクタ提案のみで終わらないこと
- 存在しないファイル・関数を引用しないこと（引用前にリポジトリ内 grep で実在確認）
- 「おそらく動く」で P0 を見逃さないこと

## 実行してほしいコマンド（可能なら）

cd C:\AI\text-adventure-vsce
npm run compile
npm test
node scripts/build-webview.js

結果の数字（例: 74/74）をサマリーに含めること。
```

---

## バージョン別の差分メモ（レビュアー向けコンテキスト）

| Ver | 要点 |
|-----|------|
| 1.23.0 | commerce.food, tradeOps/npcAgencyOps スキーマ, trade-routes デモ |
| 1.24.0 | **bulk sim で LW tick が回っていなかったバグ修正**、Caravan 読み取り専用パネル |
| 1.25.0 | GM Caravan 注入、Inspector 相場デバッグ、NPC reason 表示 |
| 1.26.0 | **BRIEF v1+** — Buy/Sell UI、`enableCommerceUi`、`playerRole` 選択 |

---

## 関連プロンプト

- 実装タスク投入: `docs/AGENT_PROMPTS_LIVING_WORLD.md`
- 設計ブリーフ: `docs/COMMERCE_AND_AGENCY_BRIEF.md`