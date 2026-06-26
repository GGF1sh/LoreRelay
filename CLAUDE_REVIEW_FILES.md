# Claude 用 — 読むファイル一覧（レビュー文書の改良向け）

Grok の **総合レビュー＋機能提案文書** を v1.0 向けに書き直すとき、**正確性のために読む順番**。

コード行単位の監査用ではない。文書の主張（「実装済み」「依然の課題」「次にやること」）を裏付けるためのリスト。

**現在バージョン:** `1.0.0`

---

## 読む順番（推奨ルート）

### Phase A — 実装の正本（必ず最初）

| 順 | ファイル | 文書で使う情報 |
|:--:|----------|----------------|
| A1 | `CHANGELOG.md` | [1.0.0][0.7.0][0.6.x][0.5.x] で何が入ったか |
| A2 | `AI_ROADMAP.md` | チェック済み / 未着手（Phase 2B TavernCard 等） |
| A3 | `README.md` | 公開機能の要約、サンプル 3 本 |
| A4 | `package.json` | バージョン番号 |

### Phase B — Grok 元文（改良の入力）

| 順 | ファイル | 文書で使う情報 |
|:--:|----------|----------------|
| B1 | `GROK_REVIEW_v1_BASELINE.md` | 書き直す元ネタ。論点 G1〜G7、機能提案表 |

### Phase C — Grok の記述を訂正するための代表ソース

Grok が **v0.3.3 前提** で書いた箇所を v1.0 で直すときに見る。

| 順 | ファイル | Grok 元文との関係 |
|:--:|----------|-------------------|
| C1 | `AI_HANDOVER.md` | プロジェクト要約の根拠 |
| C2 | `src/gameStateSync.ts` | 「状態同期の堅牢さ」 |
| C3 | `src/lorebookMatcher.ts` | ST 互換マッチング |
| C4 | `webview/modules/81-lorebook.js` | ★「Lorebook UI 無し」→ **v0.5c で実装済み** |
| C5 | `webview/modules/80-inspector.js` | Turn Inspector（Grok 未記載 → 良い点に追加） |
| C6 | `webview/modules/82-memory.js` + `src/memoryBank.ts` | Memory UI + 日本語 TF-IDF 論点 |
| C7 | `src/scenarioDirectorCore.ts` + `webview/modules/83-director.js` | Scenario Director v0.6 |
| C8 | `src/partyDirectorCore.ts` + `webview/modules/84-party.js` | ★「NPC/関係値」→ **v0.7 で一部実装** |
| C9 | `src/remotePlayServer.ts` + `webview/modules/55-remote-play.js` | ★「観戦検討」→ **spectator + QR 実装済み** |
| C10 | `src/gmPromptBuilder.ts` | GM 注入（director, party, lore, memory） |
| C11 | `src/extension.ts` | panel グローバル（改善点の現状） |
| C12 | `game_state_schema.json` | schemaVersion の有無（改善点） |
| C13 | `package.json` の `scripts.test` + `scripts/test_*.js` | ★「テスト少ない」→ **現状のテスト一覧** |

### Phase D — v1.0 同梱・次の提案用（任意）

| 順 | ファイル | 文書で使う情報 |
|:--:|----------|----------------|
| D1 | `sample-scenarios/*/scenario.json` | 3 本サンプル |
| D2 | `MODEL_PRESETS.md` / `presets/` | 推奨モデル |
| D3 | `COMFYUI_WORKFLOWS.md` / `comfyui/` | ワークフロー同梱 |
| D4 | `DEMO.md` | デモ・スクショ方針 |
| D5 | `src/tavernCardImporter.ts` | Phase 2B 残件の具体化 |

### Phase E — 過去レビュー（重複避け・任意）

| 順 | ファイル | 用途 |
|:--:|----------|------|
| E1 | `C:\AI\GROK_CODE_REVIEW.md` | 技術指摘の対応済み表 |
| E2 | `C:\AI\CLAUDE_REVIEW.md` | 過去のポジション・ロードマップ |

---

## Grok 元文 → v1.0 で書き換える対照表（Claude 用チートシート）

| Grok の記述 | v1.0 の事実（要ソース確認） |
|-------------|---------------------------|
| Lorebook 管理 UI が無いと辛い | **v0.5b〜c** 閲覧・編集・保存あり（`81-lorebook.js`） |
| テストがほとんど無い | `npm test` = validate + lorebook + statePatch + director + party + scenarios + media |
| リモートプレイ観戦は検討 | **v0.7** player/spectator + QR |
| NPC / 関係値ツール | **v0.7** Party Director（verbosity, relationships） |
| Inspector 無記載 | **v0.5a** Prompt / Turn Inspector |
| Scenario 進行ディレクター無記載 | **v0.6** director + game_state.director |
| 最優先は Lorebook + Memory UI | **UI は概ね完了** → 次は日本語 RAG、TavernCard 完全対応、schema 等にシフト |

---

## 添付セット

### 最小（文書改良だけ）

```
GROK_REVIEW_v1_BASELINE.md
CHANGELOG.md
AI_ROADMAP.md
README.md
```

### 標準（推奨）

最小 + Phase C の C1, C4, C6, C8, C9, C11, C13

### フル（最高精度）

Phase A〜D すべて

---

## 出力の保存先（依頼者が決める）

改良版 Markdown の保存例:

- `LORELAY_REVIEW_v1.md`（リポジトリ直下）
- または `C:\AI\CLAUDE_REVIEW.md` に「v1.0 プロダクトレビュー」章として追記

コード監査用の読みファイルリストが必要なときは、依頼時に「セキュリティ監査モード」と別途指定すること。