# AI 引き継ぎプロンプト集（v0.3.2 以降）

> **目的:** Gemini / Grok / ChatGPT / Claude に何を読ませ、どの順番で、どんな指示を出すかを固定する。  
> **更新:** 2026-06-26（Phase 2B 着手前）  
> **リポジトリ:** https://github.com/GGF1sh/LoreRelay（`main`、`9570a8f` 以降）  
> **パッケージ版:** `0.3.2`

---

## 0. 推奨実行順序（全体フロー）

```
【フェーズ 0 — 全員が同じ前提を読む】（並列可・各 AI のセッション開始時に必須）
    ↓
【フェーズ 1 — 並列投入】
    ChatGPT … SKILL.md 改訂 + セキュリティ監査（設計・文案。コードは書かなくてよい）
    Gemini  … Phase 4A 設計 + README 文案 + ST ロアブック調査（設計のみ）
    ↓
【フェーズ 2 — 実装の本体】
    Claude  … Phase 2B ロアブックエンジン実装（Gemini の調査結果があればそれも読む）
    ↓
【フェーズ 3 — 実機・仕上げ】
    Grok    … E2E 検証 + 監査/Claude 実装のフォロー + skill zip + commit/push
```

| 順番 | AI | いつ投げるか | ブロックする相手 |
|------|-----|-------------|-----------------|
| 0 | 全員 | 最初 | なし |
| 1a | **ChatGPT** | フェーズ 0 直後（Claude と並列可） | Claude の SKILL 改訂を待たない（ドラフト先行） |
| 1b | **Gemini** | フェーズ 0 直後（Claude と並列可） | Phase 2B 実装は Gemini 調査完了後が理想 |
| 2 | **Claude** | Gemini の ST 調査が出たら最適。無くても開始可 | Grok E2E は Claude 実装後 |
| 3 | **Grok** | Claude + ChatGPT ドラフト反映後 | なし（最終ゲート） |

---

## 1. 全 AI 共通 — 必読ファイル（この順で読ませる）

各 AI の**最初のメッセージ**に、次を添える:

```
次のファイルを、この番号順に読んでから作業を開始してください。
読了したら「1〜8 読了」とだけ返してから、下の【タスク】に進んでください。

1. C:\AI\text-adventure-vsce\AI_HANDOVER.md
2. C:\AI\text-adventure-vsce\CHANGELOG.md          … [0.3.2] と [Unreleased] を重点
3. C:\AI\text-adventure-vsce\AI_ROADMAP.md         … Phase 2B が次の本命
4. C:\AI\text-adventure-vsce\AI_SHARED_LOG.md      … Current Snapshot のみでよい
5. C:\AI\text-adventure-vsce\AI_HANDOVER_PROMPTS.md … 本ファイル（自分のセクション）
6. C:\AI\text-adventure-vsce\game_state_schema.json
7. C:\AI\text-adventure-vsce\src\types\TurnResult.ts
8. C:\AI\GROK_CODE_REVIEW.md                       … #25 #28 と第二回レビュー表
```

### 役割別の追加必読（共通 8 の後に読む）

| AI | 追加で読むファイル（順番） |
|----|---------------------------|
| **Claude** | `src/statePatch.ts` → `src/gameStateSync.ts` → `src/gmPromptBuilder.ts` → `src/turnResultFallback.ts` → `webview/modules/80-inspector.js` |
| **Grok** | `src/gmBridgeRunner.ts` → `src/turnResultFallback.ts` → `src/remotePlayServer.ts` → `TextAdventureGMSkill/scripts/gm_bridge_common.py` |
| **Gemini** | `src/gmPromptBuilder.ts`（`buildVisionContext`）→ `GEMINI_REVIEW.md` → `C:\AI\多言語検索を用いたLoreRelay類似システムの調査.md`（あれば） |
| **ChatGPT** | `TextAdventureGMSkill/SKILL.md` → `src/webviewHandlers.ts` → `src/remotePlayServer.ts` → `webview/modules/00-core.js`（postMessage 周辺） |

---

## 2. ChatGPT 向け

### いつ使うか
- **フェーズ 1**（Claude と並列で最初に投げる）
- SKILL.md とセキュリティの「設計・文案」を先に固め、Claude/Grok が実装に落とす

### 読ませるファイル
1. 共通必読 1〜8（上記）
2. `C:\AI\TextAdventureGMSkill\SKILL.md`
3. `C:\AI\text-adventure-vsce\src\webviewHandlers.ts`
4. `C:\AI\text-adventure-vsce\src\remotePlayServer.ts`
5. `C:\AI\text-adventure-vsce\src\gmBridgeRunner.ts`
6. `C:\AI\CLAUDE_REVIEW.md`（セキュリティ経緯の参考）

### コピペ用プロンプト

```
あなたは LoreRelay のセキュリティレビューと GM プロンプト（SKILL.md）設計担当です。
作業前に AI_HANDOVER_PROMPTS.md の「ChatGPT 向け」および共通必読 1〜8 を読んでください。

【現状】v0.3.2
- Persist-Before-Narrate: turn_result.json → TS statePatch → game_state.json
- Grok / locale プロンプトは turn_result 指示済みだが、SKILL.md はまだ game_state 直書き
- Remote Play: トークンが URL クエリにも載る

【タスク 1: セキュリティ監査】
次を重点レビューし、深刻度付き（Critical/High/Medium/Low）で表にまとめてください:
- src/remotePlayServer.ts
- src/webviewHandlers.ts
- src/gmBridgeRunner.ts
- webview/modules/*.js の postMessage 受信
- TextAdventureGMSkill/SKILL.md

観点: 認証 bypass、パストラバーサル、CSP、シェル注入、シークレット漏洩、LAN 露出、トークン URL 露出

【タスク 2: SKILL.md 改訂ドラフト（全文）】
Persist-Before-Narrate に合わせて SKILL.md を書き直す草案を Markdown で提示:
- 毎ターン turn_result.json を書く（statePatch + narration + turnId + 任意 gmEntry）
- game_state.json 直書きは「緊急フォールバック」と明記
- 既存ルール維持: dice.py / hiddenDice（result 禁止）/ profileUpdates / bgm / sfx / gameOver
- turn_result.json の具体 JSON 例を 1 つ

【タスク 3: テスト計画】
npm test（validate.js + test_state_patch.js）を超えるテスト戦略:
- 優先度付きケース一覧（statePatch, lorebook, remotePlay, turnResultFallback）
- Vitest 導入 vs scripts/*.js 継続の判断

【出力】
1. セキュリティ所見表
2. SKILL.md 改訂ドラフト（そのまま差し替え可能な全文）
3. テスト計画チェックリスト

【制約】
- コード変更はしない（文案・設計のみ）
- 出力先の提案: C:\AI\CHATGPT_SECURITY_AND_SKILL.md（新規ファイル案として本文に含める）
```

### 成果物の置き場（Grok が後で実装）
- `C:\AI\CHATGPT_SECURITY_AND_SKILL.md`（ChatGPT が出力したらユーザーが保存、または Grok が保存）
- `TextAdventureGMSkill/SKILL.md` の更新は **Grok または Claude** がドラフトを反映

---

## 3. Gemini 向け

### いつ使うか
- **フェーズ 1**（ChatGPT と並列）
- **Claude の Phase 2B の前**に ST ロアブック調査を終わらせると効率が良い

### 読ませるファイル
1. 共通必読 1〜8
2. `C:\AI\text-adventure-vsce\src\gmPromptBuilder.ts`（`matchLorebookEntries`）
3. `C:\AI\GEMINI_REVIEW.md`
4. `C:\AI\多言語検索を用いたLoreRelay類似システムの調査.md`（存在すれば）
5. `C:\AI\text-adventure-vsce\SILLYTAVERN_COMPAT.md`

### コピペ用プロンプト

```
あなたは LoreRelay の設計・ドキュメント・調査担当（Gemini）です。
作業前に AI_HANDOVER_PROMPTS.md の「Gemini 向け」および共通必読 1〜8 を読んでください。

【プロジェクト】
LoreRelay = VS Code 上のローカルファースト AI GM コンソール（v0.3.2）
- turn_result パイプライン完了。次: Phase 2B（ST ロアブック）、Phase 4A（VLM）

【タスク 1: Phase 4A VLM 設計】
ComfyUI 生成画像（latestImage）を VLM に読ませるフローを設計:
- 呼び出しタイミング（毎ターン / 画像更新時のみ）
- gmPromptBuilder.buildVisionContext の拡張案
- ローカル VLM（Ollama vision）と API の切り替え設定案
- プライバシー・コスト・レイテンシ

【タスク 2: README / 公開素材】
スクリーンショット 5 枚の構成案 + 日英キャプション:
Inspector / Remote Play / Game Rules / MediaAgent / ST インポート
Ko-fi 導線の短い文案（GEMINI_REVIEW のコンテンツ課金参照）

【タスク 3: Phase 2B 調査（Claude 向け引き継ぎ）】
SillyTavern World Info / Lorebook の発火条件を整理:
- 最低限対応すべき ST 機能リスト（Regex Keys, Secondary Keys, Depth, priority 等）
- 現状 LoreRelay（substring マッチ）とのギャップ表
- 実装優先順位の提案（MVP / 将来）

【出力ファイル（本文に全文を含める）】
- docs/phase-4a-vlm-design.md の内容
- docs/phase-2b-st-lorebook-spec.md の内容
- docs/readme-screenshots-plan.md の内容

【制約】
- コード変更はしない
- turn_result / statePatch アーキテクチャを壊す提案はしない
```

### 成果物
- Claude が読む: `docs/phase-2b-st-lorebook-spec.md`（Grok がファイル化）
- 将来用: `docs/phase-4a-vlm-design.md`, `docs/readme-screenshots-plan.md`

---

## 4. Claude 向け

### いつ使うか
- **フェーズ 2**（Gemini の Phase 2B 調査があると理想。無くても開始可）
- ChatGPT の SKILL ドラフトは参照用。実装は turn_result 優先。

### 読ませるファイル
1. 共通必読 1〜8
2. `src/statePatch.ts`
3. `src/gameStateSync.ts`
4. `src/gmPromptBuilder.ts`
5. `src/turnResultFallback.ts`
6. `webview/modules/80-inspector.js`
7. `scripts/test_state_patch.js`（テストの書き方の参考）
8. **（あれば）** `docs/phase-2b-st-lorebook-spec.md`（Gemini 出力）
9. **（あれば）** `C:\AI\CHATGPT_SECURITY_AND_SKILL.md` の SKILL ドラフト部分

### コピペ用プロンプト

```
あなたは LoreRelay（text-adventure-vsce）の TypeScript 実装担当（Claude）です。
作業前に AI_HANDOVER_PROMPTS.md の「Claude 向け」および共通必読 1〜8 を読んでください。
docs/phase-2b-st-lorebook-spec.md があればそれも読んでください。

【現状】v0.3.2 — Phase 2A/2C/3A/3B 完了。次は AI_ROADMAP Phase 2B。

【タスク: Phase 2B — ST ロアブックエンジン】
1. src/gmPromptBuilder.ts の matchLorebookEntries() を拡張
   - 現状: 単純 substring のみ
   - 目標: Regex Keys + priority（MVP）。Secondary Keys / Depth は仕様に余力があれば
2. triggeredLore を turn_result / Python gm_bridge_common.py と整合
3. scripts/test_lorebook.js を新規作成し npm test（validate.js）に統合
4. game_state_schema / TurnResult 型は必要最小限の変更のみ

【副タスク（時間があれば）】
- profileUpdates を turn_result 経路でも安全に処理する設計
- statePatch の nested diff 改善（トップレベル以外）

【制約】
- writeJsonAtomic を使う
- npm run compile && npm test 必須
- CHANGELOG [Unreleased]、AI_SHARED_LOG、AI_ROADMAP の Phase 2B を更新
- git commit（メッセージ例: feat(phase-2b): ST lorebook matching engine）

【成果物】
- 実装 diff
- ST 機能 ↔ 実装状況の対応表（コメントまたは docs/phase-2b-implementation.md）
```

### 完了後
- Grok に E2E とマージを依頼（本ファイルセクション 5）

---

## 5. Grok 向け

### いつ使うか
- **フェーズ 3**（Claude 実装 + ChatGPT ドラフトの後が最終ゲート）
- Windows 実環境で compile / test / E2E / commit / push を実行する役

### 読ませるファイル
1. 共通必読 1〜8
2. `src/gmBridgeRunner.ts`
3. `src/turnResultFallback.ts`
4. `src/remotePlayServer.ts`
5. `TextAdventureGMSkill/scripts/gm_bridge_common.py`
6. **Claude 作業後:** `src/gmPromptBuilder.ts` の diff / 新規 `scripts/test_lorebook.js`
7. **ChatGPT 作業後:** `C:\AI\CHATGPT_SECURITY_AND_SKILL.md` または SKILL ドラフト
8. `C:\AI\GROK_CODE_REVIEW.md`（自分で #25 #28 を更新）

### コピペ用プロンプト

```
あなたは LoreRelay の Windows 実装・検証・リリース担当（Grok / Cursor）です。
作業前に AI_HANDOVER_PROMPTS.md の「Grok 向け」および共通必読 1〜8 を読んでください。
Claude の Phase 2B diff と ChatGPT の SKILL ドラフトがあればそれも読んでください。

【環境】C:\AI\text-adventure-vsce、C:\AI\TextAdventureGMSkill（skill は git 外）

【タスク A: 実機 E2E 検証レポート】
実際にコマンドを実行し、ログ付きで報告:
1. npm run compile && npm test
2. Ollama（ollama_gm.py）1 ターン: turn_result → game_state → Inspector
3. Grok bridge 1 ターン: turn_result 直書き or turnResultFallback 合成
4. Remote Play: デフォルト 127.0.0.1、0.0.0.0 時の警告表示

【タスク B: 引き継ぎ反映】
- ChatGPT の SKILL.md ドラフトを TextAdventureGMSkill/SKILL.md に反映
- Claude の Phase 2B コードが未マージならレビュー・修正
- セキュリティ High 以上は可能な範囲で実装（Remote Play トークン URL 等）

【タスク C: ドキュメント・レビュー更新】
- CHANGELOG: [Unreleased] または [0.3.3] に追記
- AI_SHARED_LOG.md に作業ログ
- GROK_CODE_REVIEW.md の #25 #28 ステータス更新
- package.json バージョン bump（必要なら 0.3.3）

【タスク D: 配布】
- TextAdventureGMSkill の変更を zip 化する手順を README か SHARED_LOG に 1 行記載
- git commit & push（GitHub GGF1sh/LoreRelay）

【制約】
- 「動くはず」で終わらせず、実行結果を書く
- 推測でスキップしない
```

---

## 6. ユーザー操作チートシート

### 最小手順（忙しいとき）

| 手順 | 操作 |
|------|------|
| 1 | このファイル `AI_HANDOVER_PROMPTS.md` を開く |
| 2 | **ChatGPT** に「共通必読 1〜8」+ **セクション 2 プロンプト** を貼る |
| 3 | **Gemini** に「共通必読 1〜8」+ **セクション 3 プロンプト** を貼る |
| 4 | Gemini の `phase-2b-st-lorebook-spec` が出たら **Claude** に **セクション 4** を貼る |
| 5 | Claude 完了後 **Grok（Cursor）** に **セクション 5** を貼る |

### 各 AI に最初に添える一文（共通）

```
LoreRelay v0.3.2 の引き継ぎです。
C:\AI\text-adventure-vsce\AI_HANDOVER_PROMPTS.md を開き、
「自分向けのセクション」と「共通必読 1〜8」を読んでから作業してください。
```

---

## 7. 完了の定義（全フェーズ共通）

- [ ] `npm run compile && npm test` 成功
- [ ] `CHANGELOG.md` 更新
- [ ] `AI_SHARED_LOG.md` に 5 行以内のログ
- [ ] `AI_ROADMAP.md` の該当 `[ ]` → `[x]`
- [ ] GitHub `main` に push（Grok フェーズ）
- [ ] `TextAdventureGMSkill/SKILL.md` が turn_result フローと一致（Grok フェーズ）

---

## 8. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-26 | 初版作成（v0.3.2 基準、Phase 2B 着手用） |