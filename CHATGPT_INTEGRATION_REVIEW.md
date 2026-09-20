# ChatGPT 用 — 統合レビュー・ゲートプロンプト

> **用途:** Claude（UI）と Grok（ComfyUI/パイプライン）が修正した**後**、  
> VS Code 内 ChatGPT に渡す最終ゲート用プロンプト。  
> Webview の実画面は見えない前提で、差分・テスト・生成物・ドキュメントを確認する。

**テスト WS:** `C:\AITest`  
**本体:** `C:\AI\text-adventure-vsce`  
**現行版:** `1.7.3`

---

## 役割分担（確定版）

| 順 | AI | 担当 |
|----|-----|------|
| 1 | **Claude** | Webview 実画面、UI/UX、World タブ、Cartography 表示、i18n 漏れ、操作感 |
| 2 | **Grok** | ComfyUI、Cartography workflow、Python/TS パイプライン、`world_map.layout.png` / `world_map.png` |
| 3 | **ChatGPT** | 統合レビュー、`npm run compile` / `npm test`、セキュリティ・パス検証、CHANGELOG 整理、commit 判断 |

ChatGPT は **Webview のピクセル確認はできない**。スクショまたは生成 PNG をユーザーが渡すか、ファイル・ログ・テストで判断する。

---

## コピー用プロンプト（Claude/Grok 作業後）

```
あなたは LoreRelay v1.7.3 の統合レビュー担当（ChatGPT）です。
Claude（UI）と Grok（Cartography/ComfyUI）が既に修正済みです。新規大規模実装はせず、ゲートレビューに徹してください。

【前提更新 — 会話履歴の v1.6.3 認識は捨てる】
@AI_SHARED_LOG.md の Current Snapshot
@CHANGELOG.md の [Unreleased] と [1.7.3]
@package.json（version 1.7.3）

【テストワークスペース】
- プレイ/状態: C:\AITest
- 本体コード: C:\AI\text-adventure-vsce
- turn_result.json は意図的に無し（GM テスト時に生成）

【既知の Grok 修正（cc32a93 付近）— レビュー対象】
- i18n: Quick Reply export/forceSpeak/questFlow/relations 等 19 キー × 4 言語
- World「Map Image」ボタンの i18n 化
- comfyui_generate_cartography.py: world_map.layout.png 再利用（パス検証整合）
- scripts/check_i18n_keys.js を npm test に追加

【Claude 修正があれば】
git diff またはユーザーが貼った変更概要を前提にレビュー

【あなたのタスク】
1. 差分レビュー（深刻度 Critical/High/Medium/Low）
   - turn_result / statePatch 不変条件を壊していないか
   - cartographyPathCore / remotePlay / postMessage セキュリティ
   - i18n キー漏れ: node scripts/check_i18n_keys.js の結果を確認
2. コマンド実行（この環境で実行し結果を報告）
   - cd C:\AI\text-adventure-vsce
   - npm run compile && npm test
   - node scripts/check_i18n_keys.js
3. C:\AITest の生成物確認（存在すれば）
   - world_map.layout.png
   - world_map.png（ComfyUI 成功時）
   - game_rules.json に enableWorldForge: true があるか（World タブ用）
4. CHANGELOG [Unreleased] と AI_SHARED_LOG が作業内容と一致しているか
5. commit / push が必要か判断（不要なら理由を書く）

【出力形式】
## 読了・前提
## 差分レビュー表
## テスト結果（コマンドログ要約）
## AITest 生成物・設定
## 残リスク / ユーザー手動確認リスト
## 推奨次アクション（commit するか、追加修正は誰向けか）

【制約】
- Phase 7 Cartography は「これから」ではなく完了済み（v1.7.0〜1.7.3）
- 画面スクショが無くても「見た目OK」と断定しない
- 修正する場合は最小 diff のみ。本体は C:\AI\text-adventure-vsce
```

---

## 短縮版

```
LoreRelay v1.7.3。Claude/Grok 修正後の統合レビュー担当です。
@AI_SHARED_LOG.md @CHANGELOG.md [Unreleased] を読み、
git diff（または cc32a93 以降）をレビュー → npm run compile && npm test を実行 →
check_i18n_keys、C:\AITest の world_map*.png、game_rules.json を確認 →
レビュー表 + 残タスクを出してください。画面は見えないので断定しない。
```

---

## 2026-06-30 時点の進捗メモ

| 担当 | 状態 |
|------|------|
| Grok | i18n 補完、ComfyUI layout パスバグ修正、`C:\AITest` で layout PNG 生成成功。ComfyUI 羊皮紙は checkpoint 未設定で 400（環境） |
| Claude | ユーザーが先に投入済み（UI 側修正想定） |
| ChatGPT | **このプロンプトで統合ゲート** |

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-30 | 初版（AITest レビュー流れ・ChatGPT ゲート用） |