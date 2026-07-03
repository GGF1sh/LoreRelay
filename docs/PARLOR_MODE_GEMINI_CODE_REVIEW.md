# Parlor Mode — Gemini コードレビュー triage（2026-07-03）

Gemini が Phase A（v1.34.0）に対して挙げた 5 項目の評価と対応状況。

| # | Gemini 重大度 | 評価 | 対応 |
|---|---------------|------|------|
| 1 | P0 トークン推定誤差 | **部分妥当** — Parlor は `promptContext.ts` のトークン推定を使っていない（**文字数予算**）。ただし API 側の実効上限に対するバッファは有用 | `PARLOR_PROMPT_SAFETY_MARGIN_CHARS`（1200）追加。`finalBlock` を末尾 `slice` で切らないよう再構成 |
| 2 | P1 モード切替ステート汚染 | **現状は低リスク** — `buildParlorUserPrompt` は `world_state` / `worldStateCore` を参照しない（キャラ + ロア + `parlor_session` のみ） | ドキュメント化。Promote 実装時に再検証 |
| 3 | P1 非同期中のモードトグル | **妥当** | GM ローディング中は `experience-profile-btn` を disabled。クリック時 `gm-loading` があれば無視 |
| 4 | P2 履歴圧縮で JSON/MD 破損 | **部分妥当** — ロアはスニペット単位ドロップ、履歴は**行単位**（メッセージ単位）ドロップに変更 | `truncateParlorHistoryLines` · `buildParlorLoreContext` スニペット単位 |
| 5 | P2 二重送信 | **既存対応あり** — `parlorInFlight` + `isParlorBridgeBusy` | LM 応答後に `isParlorMode()` 再確認を追加 |

## 意図的に見送り（Phase B）

- Campaign ステートのメモリ「スナップショット退避」— プロンプト経路に載っていないため Phase A では過剰
- Webview E2E 競合テスト — 手動 `testing_checklist.md` §10 でカバー。自動 E2E は別トラック
- `AbortController` で LM キャンセル — vscode.lm API 連携コスト大。UI ロックで十分

## 検証

- `npm test` — parlor prompt テストに safety margin · 行単位履歴 · 日本語/絵文字境界を追加