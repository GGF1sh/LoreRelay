# Claude 用 — プロダクトレビュー文書の改良プロンプト（v1.0.0）

Grok が書いた **LoreRelay の総合レビュー＋機能提案** を、Claude に **v1.0 時点で書き直し・改良** してもらうときのプロンプトです。  
（コードの行単位監査ではなく、**読み物としてのレビュー文書** を仕上げる依頼）

読むファイルの順番は [`CLAUDE_REVIEW_FILES.md`](CLAUDE_REVIEW_FILES.md) を参照。

---

## 貼り付け用（ここからコピー）

````
あなたは LoreRelay のプロダクト・アーキテクチャアドバイザーです。
依頼者（Keisuke）から、**Grok が書いたレビュー文書の改良版** を作成してほしいと言われています。

## やってほしいこと（これが本題）

**コードのバグ探しではなく、レビュー文書そのものを書き直す・改良する。**

1. 下記「元文（Grok）」と同じ **トーン・読みやすさ・構成** を維持しつつ、内容を **v1.0.0 時点で正確** に更新する
2. Grok が「未実装」と書いている機能のうち、**既に入っているものは「実装済み」に差し替え**、残りだけを提案に残す
3. 良い点・改善点・機能提案を **具体化**（ファイル名・バージョン・既存 UI 名を入れる）
4. 2026 年 AI RP トレンドは維持しつつ、LoreRelay の **差別化**（ローカル ComfyUI、game_state 疎結合、VSCode、statePatch）を軸に優先度を付け直す
5. 最後に「次の 1〜3 セッションでやること」を、Grok より **今の状態に即した** 内容にする

**出力は日本語の Markdown 1 本**（そのまま README 横断資料やブログに貼れる品質）。コードブロックは最小限でよい。

## 元文（Grok）— これを改良する

`GROK_REVIEW_v1_BASELINE.md` または依頼者が貼った全文を正とする。要旨:

- LoreRelay = VSCode 拡張のローカルファースト AI GM UI
- game_state.json / turn_result.json によるファイル橋渡し
- v0.3.3 時点で完成度高い、モジュール設計良い
- 良い点: gameStateSync, lorebookMatcher, memoryBank, mediaAgent, remotePlay, セキュリティ, i18n 等
- 改善点: panel グローバル、memoryBank 日本語、schemaVersion なし、ログ散在、postMessage 緩い、テスト少、長時間 history
- 機能提案: Lorebook UI、Memory 日本語、TTS、NPC 管理、履歴検索 等（★表付き）
- まとめ: Lorebook + Memory 強化が最優先

→ **v1.0 では v0.5〜v1.0 で大量に進んでいる**ので、元文をそのまま延長しないこと。

## 読むファイルの順番（正確性のため・この順）

詳細は `CLAUDE_REVIEW_FILES.md`。レビュー文書作成用の **短縮ルート**:

### Step 1 — 何ができたか把握（必須）
1. `CHANGELOG.md` — **[1.0.0] → [0.7.0] → [0.6.x] → [0.5.x]**（実装の正本）
2. `AI_ROADMAP.md` — 完了 / 未完了チェックボックス
3. `README.md` — v1.0 機能一覧・サンプル 3 本
4. `package.json` — version `1.0.0`

### Step 2 — Grok 元文との対照（必須）
5. `GROK_REVIEW_v1_BASELINE.md` — Grok の論点一覧（再掲用の下書き）

### Step 3 — 文書の主張を裏付ける代表ソース（推奨）
6. `AI_HANDOVER.md` — アーキテクチャ一言説明用
7. `src/gameStateSync.ts` — 状態同期の堅牢さの記述用
8. `src/lorebookMatcher.ts` + `webview/modules/81-lorebook.js` — Lorebook（Grok は UI 無しと書いている）
9. `src/memoryBank.ts` + `webview/modules/82-memory.js` — Memory / 日本語論点
10. `src/scenarioDirectorCore.ts` + `webview/modules/83-director.js` — v0.6 Director
11. `src/partyDirectorCore.ts` + `webview/modules/84-party.js` — v0.7 Party（Grok の NPC 提案と対照）
12. `src/remotePlayServer.ts` + `webview/modules/55-remote-play.js` — QR / spectator（Grok は観戦「検討」と書いている）
13. `webview/modules/80-inspector.js` — Turn Inspector（Grok 未記載）
14. `src/extension.ts` — panel グローバル論点の現状確認
15. `game_state_schema.json` — schemaVersion の有無
16. `scripts/validate.js` + `package.json` の `npm test` — テストの現状（Grok は少ないと書いている）

### Step 4 — 機能提案の根拠（任意）
17. `MODEL_PRESETS.md` / `COMFYUI_WORKFLOWS.md` / `sample-scenarios/` — v1.0 同梱物
18. `AI_ROADMAP.md` の Phase 2B（TavernCard 未完了）— 残提案用

読了したら「Step 1〜○ 読了。Grok 元文の改良を開始」と一言宣言してから執筆すること。

## 出力フォーマット（Grok 改良版 — この見出し構成で）

```markdown
# LoreRelay レビューと機能提案（Claude 改良版 / v1.0.0）

（1 段落のプロジェクト要約 — Grok 元文を更新）

## 1. 総合評価（v1.0.0）

（v0.3.3 → v1.0 で何が変わったか。3〜5 行）

## 2. コード・アーキテクチャレビュー

### 2.1 良い点（継続して評価できること）
（箇条書き。Grok の良い点を残しつつ v1.0 の新規モジュールを追加）

### 2.2 改善点・注意点（依然として有効なもの）
（Grok の G1〜G7 を更新。「対応済み」「一部」「未」のラベル付き）

### 2.3 v0.3.3 から解消・大幅進展した項目
（Grok が課題としたが v1.0 で入ったもの — Lorebook UI, Inspector, Director, Party, Remote Play QR 等）

## 3. 機能提案（2026 AI RP トレンド × v1.0 以降）

### 3.1 トレンド要約（短く）

### 3.2 高優先（表形式）
| 優先 | 機能 | 理由 | v1.0 の状態 | 次の一手 |
（★は 1〜5。Grok 表を書き直す。「Lorebook UI」は実装済みなら別行に）

### 3.3 中優先（箇条書きまたは短表）

## 4. 差別化とポジション

（SillyTavern / Saga & Seeker / 純チャット RP との違い。2〜4 行）

## 5. おすすめの次のステップ（1〜3 セッション）

（Grok の「Lorebook + Memory 最優先」を v1.0 前提で **書き換え**。具体タスク名）

## 6. 深掘りオファー（任意）

（読者向けに「次に詳しく書けるテーマ」を 3〜5 個）
```

## 書くときのルール

- **元文より長くしすぎない**（目安: Grok 原文の 1〜1.3 倍）。冗長な一般論は削る
- 推測で「未実装」と書く前に CHANGELOG / ROADMAP / ソースを確認
- コード監査レポート（Critical/High 表）は **出さない**（別依頼）
- ポジティブだが甘くない。個人 OSS としての完成度は認めつつ、次の投資先は明確に
- 日本語。技術用語（statePatch, Lorebook, ComfyUI）はそのまま可

## やらないこと

- 行番号付きバグリスト
- game_state 疎結合アーキテクチャの否定
- Grok 原文をほぼコピペしただけの更新（必ず v1.0 の差分を織り込む）

準備できたら、上記フォーマットで **Grok レビュー改良版** を 1 本出力してください。
````

---

## 使い方

1. Claude に **貼り付け用** をコピー
2. 同時に添付（推奨）:
   - `GROK_REVIEW_v1_BASELINE.md`（Grok 元文）
   - `CHANGELOG.md`
   - `AI_ROADMAP.md`
   - `CLAUDE_REVIEW_FILES.md`（読む順の参照用）
3. 出力された Markdown を `LORE_RELAY_REVIEW.md` などに保存して共有

### 最小添付

```
GROK_REVIEW_v1_BASELINE.md
CHANGELOG.md（[1.0.0] まで）
AI_ROADMAP.md
```

### 品質を上げたいときの追加添付

`AI_HANDOVER.md` + Step 3 の代表ソース 5〜10 ファイル

---

## 関連ファイル

| ファイル | 用途 |
|----------|------|
| `GROK_REVIEW_v1_BASELINE.md` | Grok 元文（改良の入力） |
| `CLAUDE_REVIEW_FILES.md` | 正確性のための読む順リスト |
| `C:\AI\CLAUDE_REVIEW.md` | 過去の Claude レビュー（参照用・任意） |

コード監査が欲しいときは、別途「セキュリティ監査モード」と明記して依頼すること（本プロンプトの対象外）。