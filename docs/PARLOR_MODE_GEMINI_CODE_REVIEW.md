# Parlor Mode — Gemini コードレビュー triage

Date: 2026-07-03 JST  
Scope: v1.34.0 Phase A + v1.35.0 Phase B（改定レビュー基準: 上限なし・重大度順・原因別分割）

---

## P0: プロンプト予算配分の境界におけるシステム指示の欠落（推定誤差起因）

**対象:** `src/parlorPromptBuilderCore.ts`, `src/promptContext.ts`

| 評価 | **妥当** |
|------|----------|
| 現状 | Parlor は文字数予算。`assembleParlorUserPrompt` は `fixedPrefix` + `fixedSuffix`（system rules + ユーザー発言 + plain-text 契約）を固定保持 |
| 対応 | `PARLOR_PROMPT_SAFETY_MARGIN_CHARS`（1200）に加え、`promptContext.effectivePromptCharBudget()` で **8% ratio + 400 chars floor + fixed margin の max** を適用 |
| テスト | `test_parlor_prompt_builder_core.js` — 巨大キャラ/ロア/履歴・日本語/絵文字境界で末尾契約保持を検証 |

---

## P0: プロンプト予算超過時の圧縮による構造化データ破損（スライス起因）

**対象:** `src/parlorPromptBuilderCore.ts`（Gemini 指摘の `parlorSession.ts` / `gameStateSanitize.ts` は Campaign 経路 — Parlor では未使用）

| 評価 | **部分妥当**（Parlor ロア/キャラ境界のみ該当） |
|------|-----------------------------------------------|
| 現状 | 履歴は `truncateParlorHistoryLines` で**行単位ドロップ**。ロアは `buildParlorLoreContext` で**スニペット単位ドロップ** |
| 対応 | `clampDelimitedContext` を文字スライスから**内側行の whole-line ドロップ**に変更（BEGIN/END マーカー維持） |
| テスト | JSON フェンス入りロア + 予算圧迫で `BEGIN/END UNTRUSTED LOREBOOK` が残ることを検証 |

---

## P1: モード切替時のグローバルステート汚染

**対象:** `src/parlorBridge.ts`, `src/worldStateCore.ts`

| 評価 | **現状低リスク** |
|------|------------------|
| 理由 | `buildParlorUserPrompt` は `world_state` / `worldStateCore` / `game_state` を参照しない（キャラ + ロア + `parlor_session` + `persona.json` のみ） |
| 対応 | プロンプト経路の分離を維持。Phase C Promote 実装時にスナップショット退避を再検討 |
| テスト | 組み立てプロンプトに `turn_result.json` / `game_state.json` 要求が含まれないことを core テストで確認 |

---

## P1: 非同期通信中のモードトグルによる DOM クラッシュ

**対象:** `webview/modules/20-input-audio-prep.js`, `webview/modules/90-bootstrap.js`, `src/gmBridgeRunner.ts`

| 評価 | **妥当** |
|------|----------|
| 対応 | `gmStart` 時に `experience-profile-btn` + `parlor-settings-btn` を disabled。`gm-loading` 存在時はトグルクリック無視 |
| 追加 | `invokeParlorVscodeLm` で **モデル選択前**に `gmStart`、全 early-return パスで `gmEnd` を保証 |
| 見送り | `AbortController` による LM キャンセル — vscode.lm API コスト大。UI ロック + `isParlorMode()` 再確認で十分 |

---

## P1: Parlor Mode における二重送信時のメッセージキュー破壊

**対象:** `src/parlorBridge.ts`, `src/parlorSessionCore.ts`

| 評価 | **妥当（既存 + 強化）** |
|------|-------------------------|
| 対応 | `parlorInFlight` + `isParlorBridgeBusy()` でホスト側排他。Webview は `gmStart` で入力ロック |
| 備考 | `agenticGmCore` は Campaign 専用 — Parlor 経路では未使用 |
| テスト | 手動 `testing_checklist.md` §10 + ホスト側 busy 警告 `extension.error.gmBusy` |

---

## P2: モード混在によるエクスポートパスの競合

**対象:** `src/replayExportCore.ts`, `src/replayExportPathsCore.ts`

| 評価 | **将来リスク** — Phase C まで延期 |
|------|----------------------------------|
| 理由 | Parlor は `parlor_session.json` を使用し、Campaign replay エクスポート UI は Parlor 時非表示。現行衝突なし |
| 推奨 | Phase C で `parlor/` サブディレクトリまたは `parlor-` プレフィックスをパス生成に追加 |

---

## P2: 異常系におけるフォールバックのモード不整合

**対象:** `src/vscodeLmTurnResultCore.ts`, `src/turnResultFallback.ts`

| 評価 | **Parlor 非該当** |
|------|-------------------|
| 理由 | Parlor は `invokeParlorVscodeLm` / `fallbackToClipboardParlor` 経路。`turnResultFallback` は Campaign `turn_result` 専用 |
| 対応 | 経路分離をドキュメント化。clipboard Parlor は `PARLOR_SKILL.md` 参照ヘッダ付きプレーンテキスト契約 |

---

## P2: モード間でのメディアシグネチャの衝突

**対象:** `src/remoteMediaSignatureCore.ts`, `src/mediaAgent.ts`

| 評価 | **将来リスク** — Phase C まで延期 |
|------|----------------------------------|
| 理由 | Parlor Phase A/B では Image Gen パネル非表示。同一キャラの Parlor/Campaign 同時画像生成は未サポート |
| 推奨 | シグネチャハッシュに `experienceProfile` を含める（Phase C） |

---

## P3: 軽微な問題点のまとめ

| 項目 | 評価 | 対応 |
|------|------|------|
| UI スレッドの音声バッファ | 情報 | Parlor 長履歴時のプロファイリング推奨。Web Worker 化は別トラック |
| i18n キー欠損（Promote 等） | 情報 | Phase B で `webview.parlor.*` 追加済み。Promote は Phase C。`check_i18n_keys.js` は `npm test` に含まれる |
| CI i18n 100% 強制 | 推奨 | 既存 `scripts/check_i18n_keys.js` が validate カテゴリで実行中 |

---

## 検証

```bash
npm run compile
npm test   # 87/87（parlor prompt 境界テスト含む）
```

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-03 | 初版 5 項目 triage（Phase A follow-up） |
| 2026-07-03 | 改定基準の全 P0–P3 網羅 triage + `promptContext` マージン・`clampDelimitedContext` 行ドロップ・早期 `gmStart` |