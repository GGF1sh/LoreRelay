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

## Phase C（v1.36.0）— 昇格・降格・アーカイブ

### P0: 大規模 Campaign 履歴インポートのメモリ枯渇

**対象:** `src/parlorDemoteCore.ts`, `src/parlorBridge.ts`

| 評価 | **妥当** |
|------|----------|
| 対応 | `splitCampaignImportForParlor()` — 直近 500 件のみ `parlor_session`、超過分は `parlor_archive.ndjson` へバッチ直書き |
| テスト | 1200 件モックで active=500 / archived=700 を検証 |

### P0: NDJSON 追記の競合

**対象:** `src/parlorArchive.ts`

| 評価 | **部分妥当** — 現行は `appendFileSync`（同期）だがバルクインポートで連続 append あり |
|------|-----------------------------------------------------------------------------|
| 対応 | インメモリ書き込みキューで ndjson append を直列化 |
| テスト | 5 行 NDJSON の parse 整合性テスト |

### P1: 降格→再昇格ループの状態不整合

**対象:** `src/parlorPromote.ts`, `experience.json` `campaign.frozenAt`

| 評価 | **妥当** |
|------|----------|
| 対応 | `frozenAt` + 既存 `game_state.json` 検知時、「凍結 Campaign 再開」vs「Parlor から新規作成（バックアップ上書き）」を選択 |
| 見送り | 部分マージ（インベントリ合成）は Phase C スコープ外 — 再開パスで既存 state を保持 |

### P1: 昇格時スキーマミスマッチ

**対象:** `src/parlorPromoteCore.ts`

| 評価 | **妥当** |
|------|----------|
| 対応 | `sanitizePromotedGameState()` — `schemaVersion: 2`、entry id 正規化、必須フィールド初期値。`validateGameState` を promote 前にログ |
| テスト | 最小 promote 出力の `validateGameState` パス |

### P2: サマリ長期肥大化

**対象:** `src/parlorArchiveCore.ts`

| 評価 | **妥当** |
|------|----------|
| 対応 | `compressParlorSessionSummary()` — 上限超過時ヘッダー + 圧縮マーカー + 末尾 6 行を保持 |
| テスト | 80 回 merge ループで 4000 字以内 + compressed マーカー |

### P3（Phase C）

| 項目 | 評価 | 対応 |
|------|------|------|
| 昇格ウィザード中の LLM 割り込み | 情報 | 既存 `gmStart` ロック + `parlorInFlight`。ウィザードはホスト modal で十分 |
| `frozenAt` タイムゾーン | **非問題** | `toISOString()` UTC 使用済み |

---

## 別紙: Grok 全体コードレビュー（Campaign / LW）

v1.36.0 スコープ外。以下は **記録のみ**（別 PR トラック）:

| 重大度 | テーマ | 推奨トラック |
|--------|--------|-------------|
| P0 | GM/Commerce/World 同時更新 race | PR1 State Atomicity |
| P0 | Trust whereabouts Webview 漏洩 | PR2 Trust Sanitization |
| P1 | Prompt bloat / Replay XSS | PR3–PR4 |

Parlor Phase C とは独立。`docs/PARLOR_MODE_GEMINI_CODE_REVIEW.md` に追記し、Campaign 本体は `AI_ROADMAP.md` / 別イシューで管理。

---

## P3: 軽微な問題点のまとめ（Phase A–B 含む）

| 項目 | 評価 | 対応 |
|------|------|------|
| UI スレッドの音声バッファ | 情報 | Parlor 長履歴時のプロファイリング推奨。Web Worker 化は別トラック |
| i18n キー欠損（Promote 等） | 情報 | Phase B で `webview.parlor.*` 追加済み。Promote は Phase C。`check_i18n_keys.js` は `npm test` に含まれる |
| CI i18n 100% 強制 | 推奨 | 既存 `scripts/check_i18n_keys.js` が validate カテゴリで実行中 |

---

## 検証

```bash
npm run compile
npm test   # 90/90+（parlor promote/demote/archive 含む）
```

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-03 | 初版 5 項目 triage（Phase A follow-up） |
| 2026-07-03 | 改定基準の全 P0–P3 網羅 triage + `promptContext` マージン・`clampDelimitedContext` 行ドロップ・早期 `gmStart` |
| 2026-07-03 | Phase C follow-up — bulk import split、archive queue、frozen resume、sanitize promote、summary compress |