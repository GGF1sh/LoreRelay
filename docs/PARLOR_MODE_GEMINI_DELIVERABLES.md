# Parlor Mode — Gemini 成果物（2026-07-03）

設計フェーズ 1 の文案・テスト計画。実装反映: README 要約 · `locales/*` i18n · `testing_checklist.md` §10。

## README 4言語

英日簡繁の Parlor 節は各 `README*.md` に要約反映済み。Gemini 原文の全文は本ファイル作成時のチャットログを参照。

要点:

- Parlor ⟷ Campaign 1クリック切替
- ST 100% 互換ではない旨を明記
- vscode-lm（月額）と clipboard（Antigravity）の使い分け
- 3ステップ: インポート → Start Hub → 昇格

## i18n キー（実装済み）

| キー | 用途 |
|------|------|
| `webview.startHub.parlorTitle` | Start Hub ボタン |
| `webview.startHub.parlorDesc` | サブテキスト |
| `webview.startHub.parlorNeedsCard` | 未インポート時 |
| `webview.parlor.modeLabel` | ヘッダートグル |
| `webview.campaign.modeLabel` | ヘッダートグル |

## スクショ計画（未撮影）

- `feature-parlor-mode.png` — CRPG パネルなしの 1対1 チャット
- `feature-profile-toggle.png` — Parlor ⟷ Campaign 切替 UI

詳細: `docs/readme-screenshots-plan.md` への追記は次回 polish。

## 手動テスト

`testing_checklist.md` §10 Parlor Mode (Phase A) に反映済み。