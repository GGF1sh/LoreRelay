# Claude Code Review Prompt（アーカイブ）

> 過去セッション用のレビュープロンプトでした。文字化けにより破損していたためスタブ化（2026-06-29）。

新しいレビューを依頼する場合は、次を使用してください。

```
LoreRelay v1.7.3 のコードレビューをお願いします。
先に AI_HANDOVER.md、CHANGELOG.md [1.7.3]、変更対象ファイルを読んでください。

観点:
- セキュリティ（パストラバーサル、postMessage、Remote Play）
- statePatch / turn_result パイプラインの整合
- テスト不足

出力: 深刻度付き表 + 修正案（diff 可能なら）
```

長期レビュー記録は `C:\AI\CLAUDE_REVIEW.md` に追記してください。