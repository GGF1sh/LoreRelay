# Parlor Mode — AI 振り分けプロンプト集

> **用途:** Claude が 5 時間制限中のため、Parlor Mode Phase A を **Gemini / ChatGPT / Grok** の 3 AI に分担する。  
> **設計正本:** [`PARLOR_MODE_DESIGN.md`](PARLOR_MODE_DESIGN.md)  
> **日付:** 2026-07-03

---

## 0. 実行順序（Claude なしフロー）

```
【フェーズ 0 — 全員】設計 doc 読了（並列可）
    ↓
【フェーズ 1 — 並列】
    Gemini  … UX / README / オンボーディング文案
    ChatGPT … セキュリティ監査 + PARLOR_SKILL.md ドラフト
    ↓
【フェーズ 2 — Grok】Phase A 実装（上記ドラフトを参照）
    ↓
【フェーズ 3 — 並列レビュー】
    ChatGPT … 差分セキュリティゲート
    Gemini  … README 整合・ユーザージャーニー確認
    ↓
【フェーズ 4 — Grok】修正 + npm test + CHANGELOG + push
```

| 順 | AI | ブロック |
|----|-----|---------|
| 0 | 全員 | なし |
| 1 | Gemini + ChatGPT | Grok 実装の「文案・監査観点」 |
| 2 | Grok | フェーズ 1 の成果物があると尚よいが、無くても Phase A 開始可 |
| 3 | ChatGPT + Gemini | Grok の PR/差分 |
| 4 | Grok | なし |

---

## 1. 全 AI 共通 — 必読（この順）

```
次を読んでから作業してください。読了したら「1. 読了」とだけ返答してからタスクへ。

1. C:\AI\text-adventure-vsce\AI_HANDOVER.md
2. C:\AI\text-adventure-vsce\docs\PARLOR_MODE_DESIGN.md
3. C:\AI\text-adventure-vsce\docs\PARLOR_MODE_AI_PROMPTS.md（本ファイルの自分向けセクション）
4. C:\AI\text-adventure-vsce\CHANGELOG.md … [Unreleased] と [1.33.0]
5. C:\AI\text-adventure-vsce\SILLYTAVERN_COMPAT.md
6. C:\AI\text-adventure-vsce\GM_BRIDGE_PRESETS.md
```

### 役割別の追加必読

| AI | 追加ファイル |
|----|-------------|
| **Gemini** | `docs/readme-screenshots-plan.md`, `webview/index.html`（Start Hub）, `README.md` |
| **ChatGPT** | `src/gmBridgeRunner.ts`, `src/webviewHandlers.ts`, `webview/modules/00-core.js`, `TextAdventureGMSkill/SKILL.md` |
| **Grok** | `src/vscodeLmTurnResultCore.ts`, `src/gmBridgeRunner.ts`, `src/gameRules.ts`, `src/characterManager.ts`, `src/lorebookMatcher.ts` |

---

## 2. Gemini 向け — UX・ドキュメント

### いつ投げるか

フェーズ 1（Grok 実装と並列）。**コード変更はしない。**

### コピー用プロンプト

```
あなたは LoreRelay Parlor Mode の UX・ドキュメント担当（Gemini）です。
Claude は 5h 制限のため本フェーズから除外されています。設計正本は docs/PARLOR_MODE_DESIGN.md です。

【現状】v1.33.0 / main
- ST キャラ・ロア取り込み済み
- GM 契約は turn_result 前提（Parlor ではプレーンチャットに変更予定）
- vscode-lm で月額 AI を API キーなし利用可

【タスク 1: README Parlor 節（4言語ドラフト）】
README.md / README_en.md / README_zh-CN.md / README_zh-TW.md に追記する Markdown 草案を提示:
- Parlor ⟷ Campaign の一行説明
- 月額 AI（vscode-lm）と clipboard（Antigravity Gemini）の使い分け
- ST からの 3 ステップ（インポート → Parlor 開始 → 昇格）
- 「SillyTavern 完全互換ではない」旨を正直に

【タスク 2: Start Hub 文案】
#start-hub に追加する「🎭 キャラと話す」ボタンのラベル・サブテキスト（4ロケール i18n キー案付き）
- 空 WS 時のみ表示
- harbor-mist デモとの棲み分け

【タスク 3: スクショ計画】
docs/readme-screenshots-plan.md に Parlor 用を追記:
- 必要画像 2 枚（チャットのみ UI / モード切替トグル）
- 撮影手順（サンプルキャラ、vscode-lm またはモック応答）

【タスク 4: 手動テスト章】
testing_checklist.md に「Parlor Mode (Phase A)」チェックリスト案（10項目以内）

【制約】
- リポジトリのコード・JSON は編集しない（文案・設計のみ）
- Persist-Before-Narrate は Campaign 専用と明記すること
```

### 完了定義

- [ ] 4言語 README 草案（Markdown で返答）
- [ ] i18n キー一覧（`webview.parlor.*` 等）
- [ ] スクショ計画追記案
- [ ] testing_checklist 追記案

---

## 3. ChatGPT 向け — セキュリティ・プロンプト契約

### いつ投げるか

フェーズ 1（Gemini と並列）。Grok 実装前の監査観点固め + 実装後のゲート。

### コピー用プロンプト（フェーズ 1 — 設計レビュー）

```
あなたは LoreRelay Parlor Mode のセキュリティ・GM プロンプト契約担当（ChatGPT）です。
設計正本: docs/PARLOR_MODE_DESIGN.md。コード変更はしない。

【タスク 1: Parlor セキュリティ監査（設計段階）】
以下の設計に対し、深刻度付き（Critical/High/Medium/Low）で表にまとめてください:

新規ファイル（予定）:
- parlor_session.json / experience.json / connection_profiles.json
- src/parlorSessionCore.ts, parlorPromptBuilderCore.ts
- Webview profile 切替 postMessage

観点:
- ワークスペース外パス書き込み
- ロアブック・キャラ description 経由のプロンプト注入 / XSS
- Parlor 履歴の Remote Play 漏洩（既定禁止で足りるか）
- clipboard モードの redaction 継続要件
- vscode-lm 応答に JSON が混入した場合の処理

【タスク 2: PARLOR_SKILL.md ドラフト】
TextAdventureGMSkill/PARLOR_SKILL.md として貼れる Markdown 全文を作成:
- turn_result.json を書かない
- プレーンテキスト応答のみ
- キャラカード + lorebook を読む手順
- Codex / ChatGPT 拡張（vscode-lm 非掲載時）向け運用
- Campaign SKILL.md との明確な分離

【タスク 3: 昇格（Parlor→Campaign）データ境界】
parlorPromoteCore が触るフィールドについて:
- 何を game_state に入れてよいか / 入れてはいけないか
- ユーザー確認が必要な項目

【制約】
- コード変更はしない
- 画面は見えない前提。ファイルパスと設計 doc で判断
```

### コピー用プロンプト（フェーズ 3 — 実装ゲート）

```
LoreRelay Parlor Mode Phase A — 統合セキュリティゲート（ChatGPT）

Grok が Phase A を実装しました。差分レビューに徹し、新規大規模実装はしない。

【読むファイル】
- docs/PARLOR_MODE_DESIGN.md
- src/parlorSessionCore.ts（新規）
- src/parlorPromptBuilderCore.ts（新規）
- src/experienceCore.ts / experience.ts（新規）
- src/gmBridgeRunner.ts（Parlor 分岐）
- src/webviewHandlers.ts
- webview/modules/90-bootstrap.js, 10-game-state.js

【確認】
1. parlor_session メッセージ上限クランプ
2. postMessage profile 切替の検証
3. Campaign 回帰（既存 npm test）
4. PARLOR_SKILL.md と実装の一致

【出力】
深刻度順の findings 表。修正案は具体的に。commit 可否の一言判断。
```

### 完了定義

- [ ] セキュリティ監査表（フェーズ 1）
- [ ] PARLOR_SKILL.md ドラフト全文
- [ ] 昇格データ境界メモ
- [ ] 実装後ゲートレビュー（フェーズ 3）

---

## 4. Grok 向け — Phase A 実装

### いつ投げるか

フェーズ 2。ChatGPT/Gemini のドラフトがあれば参照。無くても開始可。

### コピー用プロンプト

```
あなたは LoreRelay Parlor Mode Phase A の実装担当（Grok）です。
設計正本: docs/PARLOR_MODE_DESIGN.md。Claude は使わず、あなたが TypeScript + Webview を実装します。

【ゴール — Phase A MVP】
1. experience.json で profile: 'parlor' | 'campaign' を保持
2. parlor_session.json でプレーンチャット履歴
3. Parlor 時: vscode-lm（または既存 provider）で JSON 不要の応答 → 履歴追記 → Webview 更新
4. Parlor 時: World / Inspector / Character Sheet 等を CSS で非表示
5. Start Hub に「キャラと話す」ボタン
6. 新規 Core テスト + 既存 82 tests 回帰

【実装ルール】
- 純関数は *Core.ts（vscode 非依存）
- Campaign モードの挙動は変えない（既定 profile = 'campaign'）
- DEFAULT_GAME_RULES は触らない
- 1 PR 相当の focused diff（Phase A 全体で OK）

【新規ファイル（設計 doc 準拠）】
- src/parlorSessionCore.ts, parlorSession.ts
- src/experienceCore.ts, experience.ts
- src/parlorPromptBuilderCore.ts, parlorPromptBuilder.ts
- scripts/test_parlor_session_core.js
- scripts/test_parlor_prompt_builder_core.js

【触る既存】
- src/gmBridgeRunner.ts — profile === 'parlor' 分岐
- src/extension.ts — コマンド登録
- src/webviewHandlers.ts
- webview/index.html, modules/90-bootstrap.js, 10-game-state.js
- package.json — commands + configuration

【検証】
npm run compile && npm test
node scripts/validate_utf8_docs.js

【完了時】
- CHANGELOG.md [Unreleased] Added: Parlor Mode Phase A
- AI_SHARED_LOG.md に 5 行ログ
- AI_ROADMAP.md Phase 12 の [ ] → [x]（Phase A 項目）
- git commit + push origin main

【参照ドラフト】
ChatGPT の PARLOR_SKILL.md / Gemini の i18n キーがあれば取り込む。無ければ仮文案で進めてよい。
```

### 完了定義

- [ ] Phase A コード完了
- [ ] npm test 全通
- [ ] CHANGELOG / AI_SHARED_LOG / AI_ROADMAP 更新
- [ ] main に push

---

## 5. ユーザー操作チートシート

| 手順 | 操作 |
|------|------|
| 1 | 本ファイルを開く |
| 2 | **Gemini** に §1 必読 + **§2 プロンプト** を貼る |
| 3 | **ChatGPT** に §1 必読 + **§3 フェーズ1プロンプト** を貼る |
| 4 | ドラフトが揃ったら **Grok** に §1 必読 + **§4 プロンプト** を貼る |
| 5 | Grok 完了後 **ChatGPT** に **§3 フェーズ3ゲート** を貼る |
| 6 | **Gemini** に README 草案と実装の整合確認を依頼 |
| 7 | Grok が指摘修正 → push |

### 各 AI に最初に添える一文

```
LoreRelay v1.33.0 — Parlor Mode 設計フェーズです。
C:\AI\text-adventure-vsce\docs\PARLOR_MODE_AI_PROMPTS.md の自分向けセクションと必読を読んでから作業してください。
Claude は 5h 制限のため今回の分担から除外されています。
```

---

## 6. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-03 | 初版（Gemini / ChatGPT / Grok、Claude 除外） |