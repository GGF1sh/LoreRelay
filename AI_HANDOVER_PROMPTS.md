# AI 引き継ぎプロンプト集（v1.7.3 以降）

> **目的:** Gemini / Grok / ChatGPT / Claude / Antigravity に何を読ませ、どの順で、どんな指示を渡すかを固定する。
>
> **更新:** 2026-06-29（v1.7.3、Phase 7 完了・Phase 8 計画）
>
> **リポジトリ:** https://github.com/GGF1sh/LoreRelay（`main`）
>
> **パッケージ版:** `1.7.3`

---

## 0. 推奨実行順序（全体フロー）

```
【フェーズ 0 — 全員が同じ前提を読む】（並列可・各 AI のセッション開始時に必須）
    ↓
【フェーズ 1 — 設計・レビュー】（並列可）
    ChatGPT … セキュリティ監査・SKILL.md 改訂ドラフト（設計のみ）
    Gemini  … README / スクショ計画・次フェーズ設計（設計のみ）
    ↓
【フェーズ 2 — 実装本体】
    Claude  … TypeScript 実装（Phase 8 や polish など AI_ROADMAP の未完了項目）
    ↓
【フェーズ 3 — 実機・仕上げ】
    Grok    … E2E 検証 + レビュー反映 + skill zip + commit/push
```

| 順序 | AI | いつ投げるか | ブロックする相手 |
|------|-----|-------------|-----------------|
| 0 | 全員 | 最初 | なし |
| 1 | **ChatGPT** / **Gemini** | フェーズ 0 直後（並列可） | Claude 実装を待たない（ドラフト先行） |
| 2 | **Claude** | 設計があれば参照。無くても開始可 | Grok E2E は Claude 実装後 |
| 3 | **Grok** | Claude + ドラフト反映後 | なし（最終ゲート） |

---

## 1. 全 AI 共通 — 必須ファイル（この順で読ませる）

各 AI の**最初のメッセージ**に、次を添える:

```
次のファイルを、この番号順で読んでから作業を開始してください。
読み終えたら、「1. 読了」とだけ返してから、下の【タスク】に進んでください。

1. C:\AI\text-adventure-vsce\AI_HANDOVER.md
2. C:\AI\text-adventure-vsce\AI_HANDOVER_PROMPTS.md … 本ファイルの自分向けセクション
3. C:\AI\text-adventure-vsce\AI_COLLABORATION.md
4. C:\AI\text-adventure-vsce\CHANGELOG.md          … [1.7.3] と [Unreleased] を重点
5. C:\AI\text-adventure-vsce\AI_ROADMAP.md         … Phase 8 が次の本命候補
6. C:\AI\text-adventure-vsce\AI_SHARED_LOG.md      … Current Snapshot + 直近ログ
7. C:\AI\text-adventure-vsce\game_state_schema.json
8. C:\AI\text-adventure-vsce\src\types\TurnResult.ts
```

### 役割別の追加必読（共通 8 の後に読む）

| AI | 追加で読むファイル（順序） |
|----|---------------------------|
| **Claude** | `src/statePatch.ts` → `src/gameStateSync.ts` → `src/gmPromptBuilder.ts` → `src/turnResultFallback.ts` → `src/cartographyRunner.ts` → `webview/modules/85-world.js` |
| **Grok** | `src/gmBridgeRunner.ts` → `src/turnResultFallback.ts` → `src/remotePlayServer.ts` → `src/cartographyPathCore.ts` → `TextAdventureGMSkill/scripts/gm_bridge_common.py` |
| **Gemini** | `src/gmPromptBuilder.ts`（`buildVisionContext`）→ `GEMINI_REVIEW.md` → `docs/readme-screenshots-plan.md` |
| **ChatGPT** | `TextAdventureGMSkill/SKILL.md` → `src/webviewHandlers.ts` → `src/remotePlayServer.ts` → `webview/modules/00-core.js`（postMessage 周辺） |
| **Antigravity** | `ANTIGRAVITY_GUIDE.md` → `TextAdventureGMSkill/SKILL.md` → ワークスペースの `turn_result.json` フロー |

---

## 2. ChatGPT 向け

### VS Code 内 ChatGPT が古い認識のとき（v1.6.3 止まり等）

会話履歴で古い版に固定されている場合は、作業指示の**前**に [`VSCODE_CHATGPT_CATCHUP.md`](VSCODE_CHATGPT_CATCHUP.md) を `@` 添付するか、同ファイルの「コピー用プロンプト」を貼る。読了確認が返るまで実装提案させない。

### Phase 11 Adaptive TTS レビュー（11A+11B 完了後・次の一手）

実装は Grok 完了済み（v1.10.0 / `main`）。**プライバシー・セキュリティ・ attribution のコードレビューは ChatGPT 担当。**

- 設計・プロンプト索引: [`phase8_planning_and_prompts.md`](phase8_planning_and_prompts.md) → **「Copy-paste prompt for ChatGPT (Phase 11A+11B review)」** をそのまま貼る
- 設計正本: [`PHASE11_ADAPTIVE_TTS_DESIGN.md`](PHASE11_ADAPTIVE_TTS_DESIGN.md)
- レビュー後: 指摘があれば Grok が修正 → 問題なければ v1.11.0 リリース整理

### AITest レビュー後の統合ゲート（Claude → Grok → ChatGPT）

| 順 | AI | 担当 |
|----|-----|------|
| 1 | Claude | Webview 実画面・UI/UX・World/Cartography 表示・i18n |
| 2 | Grok | ComfyUI・Cartography パイプライン・`C:\AITest` 生成物 |
| 3 | ChatGPT | 差分レビュー・`npm test`・CHANGELOG・commit 判断 |

ChatGPT 用プロンプト: [`CHATGPT_INTEGRATION_REVIEW.md`](CHATGPT_INTEGRATION_REVIEW.md)（画面は見えない前提）

### いつ使うか

- **フェーズ 1** — Claude と並列で最初に投げる
- SKILL.md とセキュリティの「設計・文案」を先に固め、Claude/Grok が実装に落とす

### コピー用プロンプト

```
あなたは LoreRelay のセキュリティレビューと GM プロンプト（SKILL.md）設計担当です。
作業前に AI_HANDOVER_PROMPTS.md の「ChatGPT 向け」および共通必読 1〜8 を読んでください。

【現状】v1.7.3
- Persist-Before-Narrate: turn_result.json → TS statePatch → game_state.json
- Cartography: ComfyUI 羊皮紙地図 + layout PNG + パス検証硬化済み
- Remote Play: HMAC 署名メディア URL、トークンは URL クエリにも載る場合あり

【タスク 1: セキュリティ監査】
次を重点レビューし、深刻度付き（Critical/High/Medium/Low）で表にまとめてください:
- src/remotePlayServer.ts
- src/webviewHandlers.ts
- src/cartographyRunner.ts
- webview/modules/*.js の postMessage 受信
- TextAdventureGMSkill/SKILL.md

観点: 認証 bypass、パストラバーサル、CSP、シェル注入、シークレット漏洩、LAN 露出

【タスク 2: SKILL.md 改訂ドラフト】
Persist-Before-Narrate に合わせて SKILL.md の改訂案を Markdown で提示:
- 毎ターン turn_result.json（statePatch + narration + turnId + 任意 gmEntry）
- game_state.json 直書きは「緊急フォールバック」と明記
- turn_result.json の具体 JSON 例を 1 つ

【制約】
- コード変更はしない（文案・設計のみ）
```

---

## 3. Gemini 向け

### いつ使うか

- **フェーズ 1** — ChatGPT と並列
- README 実スクショ/GIF 計画、Phase 8 Event-to-Quest の設計ドラフト

### コピー用プロンプト

```
あなたは LoreRelay の設計・ドキュメント・調査担当（Gemini）です。
作業前に AI_HANDOVER_PROMPTS.md の「Gemini 向け」および共通必読 1〜8 を読んでください。

【プロジェクト】LoreRelay = VS Code 上のローカルファースト AI GM コンソール（v1.7.3）
- Phase 7 Cartography 完了。次候補: Phase 8 Event-to-Quest（AI_ROADMAP.md）

【タスク 1: README 実スクショ計画】
docs/readme-screenshots-plan.md を更新:
- 現状 docs/assets/*.svg はモックであることを明記
- 実スクショ 5 枚 + GIF 1 本の撮影手順（DEMO.md 参照）
- 日英キャプション

【タスク 2: Phase 8 設計】
recentChanges / NPC Need から Quest Hook を生成するフローを設計:
- world_state / npc_registry との整合
- GM プロンプト注入のタイミング
- World タブ UI のワイヤーフレーム（テキストで可）

【制約】
- コード変更はしない
- turn_result / statePatch アーキテクチャを壊す提案はしない
```

---

## 4. Claude 向け

### いつ使うか

- **フェーズ 2** — `AI_ROADMAP.md` の未完了項目を実装
- 現時点の本命: **Phase 8 Event-to-Quest** または Cartography UX polish

### コピー用プロンプト

```
あなたは LoreRelay（text-adventure-vsce）の TypeScript 実装担当（Claude）です。
作業前に AI_HANDOVER_PROMPTS.md の「Claude 向け」および共通必読 1〜8 を読んでください。

【現状】v1.7.3 — Phase 1〜7 完了。次は AI_ROADMAP Phase 8。

【タスク: AI_ROADMAP の未完了項目から 1 フェーズを実装】
1. Phase 8 Event-to-Quest のうち、スコープをユーザーと合意したサブセットを実装
2. scripts/test_*.js を追加または更新し npm test に統合
3. game_state_schema / TurnResult 型は必要最小限の変更のみ

【制約】
- writeJsonAtomic を使う
- npm run compile && npm test 必須
- CHANGELOG [Unreleased]、AI_SHARED_LOG、AI_ROADMAP を更新
- git commit（メッセージ例: feat(phase-8): quest hooks from world events）
```

---

## 5. Grok 向け

### いつ使うか

- **フェーズ 3** — Claude 実装 + ドラフト反映後が最終ゲート
- Windows 実環境で compile / test / E2E / commit / push を実行する役

### コピー用プロンプト

```
あなたは LoreRelay の Windows 実装・検証・リリース担当（Grok / Cursor）です。
作業前に AI_HANDOVER_PROMPTS.md の「Grok 向け」および共通必読 1〜8 を読んでください。
Claude の diff があればそれも読んでください。

【環境】C:\AI\text-adventure-vsce、C:\AI\TextAdventureGMSkill（skill は git 外）

【タスク A: 実機 E2E 検証レポート】
実際にコマンドを実行し、ログ付きで報告:
1. npm run compile && npm test
2. UTF-8 検証: node scripts/validate_utf8_docs.js
3. Ollama 1 ターン: turn_result → game_state → Inspector（可能なら）
4. Cartography: lost-catacombs デモで layout smoke（可能なら）

【タスク B: 引き継ぎ反映】
- Claude のコードが未マージならレビュー・修正
- ドキュメント文字化けがあれば UTF-8 で修正

【タスク C: ドキュメント更新】
- CHANGELOG [Unreleased]
- AI_SHARED_LOG.md に作業ログ
- package.json バージョン bump（必要なら）

【タスク D: 配布】
- TextAdventureGMSkill の変更を zip 化する手順を README か SHARED_LOG に 1 行記載
- git commit & push（GitHub GGF1sh/LoreRelay）

【制約】
- 「動くはず」で終わらせず、実行結果を書く
- 推測でスキップしない
```

---

## 6. Antigravity 向け

### いつ使うか

- ユーザーが Antigravity を GM として使うとき
- コード変更より **SKILL.md に従った turn_result 出力** が主目的

### コピー用プロンプト

```
あなたは LoreRelay のゲームマスター（Antigravity）です。
次を読んでから GM を開始してください:

1. C:\AI\TextAdventureGMSkill\SKILL.md
2. C:\AI\text-adventure-vsce\ANTIGRAVITY_GUIDE.md
3. ワークスペースの scenario.json / game_state.json（あれば）

【ルール】
- 毎ターン turn_result.json を書く（Persist-Before-Narrate）
- dice.py / comfyui_generate.py は SKILL.md の指示どおり実行
- game_state.json 直書きは緊急時のみ
```

---

## 7. ユーザー操作チートシート

| 手順 | 操作 |
|------|------|
| 1 | 本ファイル `AI_HANDOVER_PROMPTS.md` を開く |
| 2 | **ChatGPT** に「共通必読 1〜8」+ **セクション 2 プロンプト** を貼る |
| 3 | **Gemini** に「共通必読 1〜8」+ **セクション 3 プロンプト** を貼る |
| 4 | **Claude** に **セクション 4** を貼る |
| 5 | Claude 完了後 **Grok（Cursor）** に **セクション 5** を貼る |

### 各 AI に最初に添える一文（共通）

```
LoreRelay v1.7.3 の引き継ぎです。
C:\AI\text-adventure-vsce\AI_HANDOVER_PROMPTS.md を開き、
「自分向けセクション」と「共通必読 1〜8」を読んでから作業してください。
```

---

## 8. 完了定義（各フェーズ共通）

- [ ] `npm run compile && npm test` 成功
- [ ] `node scripts/validate_utf8_docs.js` 成功
- [ ] `CHANGELOG.md` 更新
- [ ] `AI_SHARED_LOG.md` に 5 行以内のログ
- [ ] `AI_ROADMAP.md` の該当 `[ ]` → `[x]`
- [ ] GitHub `main` に push（Grok フェーズ）
- [ ] `TextAdventureGMSkill/SKILL.md` が turn_result フローと一致（Grok フェーズ）

---

## 9. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-26 | 初版作成（v0.3.2 基準、Phase 2B 着手用） |
| 2026-06-29 | v1.7.3 へ全面更新、UTF-8 文字化け解消、Phase 8 へ差し替え |