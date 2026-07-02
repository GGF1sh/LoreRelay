# ChatGPT / Gemini レビュー follow-up（v1.28）

**日付:** 2026-07-02  
**入力:** ChatGPT 総評（v1.27.1）、Gemini スキャン（c3d9b5d）

## 実施済み（本パス）

| 指摘 | 対応 |
|------|------|
| ChatGPT P1: 初見が機能密度で迷う | [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) |
| ChatGPT P1: Living World クイックスタート | [`LIVING_WORLD_QUICKSTART.md`](LIVING_WORLD_QUICKSTART.md) |
| ChatGPT P1: tag / package.json 不一致 | `release.yml` に一致チェック |
| ChatGPT P2: Replay Markdown 画像パス | `formatMarkdownImageRef()` — `<path with spaces>` |
| ChatGPT P2: CHANGELOG ローカルパス | 冒頭を repo 相対表記に変更 |
| 版ズレ（Web Grok 誤認） | [`VERSION_TRUTH.md`](VERSION_TRUTH.md)（v1.27.2） |
| Gemini: Prompt budget 枯渇 | FEATURE_MATRIX に注記；既存 `test_prompt_context_budget.js` |

## 未実施（次フェーズ）

| 指摘 | 理由 |
|------|------|
| Living World demo GIF / スクショ | ユーザー手動・デザイン作業 |
| README 冒頭「まず何を押すか」全面改稿 | 別 PR（範囲大） |
| レビュー md を `docs/reviews/` へ移動 | ファイルは `C:\AI\` 直下に残存 |
| `git tag v1.27.x` Release | **ユーザー操作** — VERSION_TRUTH 参照 |

## レビュアーへの返し

- **main** = `package.json` 正本（v1.28.0 時点）
- **GitHub Release** = タグ push まで遅れることがある
- Living World 体験は `LIVING_WORLD_QUICKSTART.md` + trade-routes