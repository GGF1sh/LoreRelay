# VS Code ChatGPT 用 — コンテキスト更新プロンプト

> **用途:** VS Code 内の ChatGPT / Grok 等が古い版（v1.6〜v1.18 等）のまま止まっているとき、  
> このファイルを `@` で添付するか、下の「コピー用プロンプト」をそのまま貼って使う。

**リポジトリ:** `C:\AI\text-adventure-vsce`（正本。`C:\AI\LoreRelay` は古いクローンのことがある）  
**版の正本:** `package.json` の `version` + [`docs/VERSION_TRUTH.md`](docs/VERSION_TRUTH.md)

---

## コピー用プロンプト（そのまま貼る）

```
【重要】あなたの LoreRelay に関する認識は古い可能性が高いです。
会話履歴や以前の説明（v1.6.x / v1.11.x / v1.14.x 前後）を信じないでください。
実装の正本は package.json、CHANGELOG.md、docs/VERSION_TRUTH.md です。

まず次を読んでください（VS Code なら @ で添付）。読み終えるまでコード提案・「未実装」宣言はしないでください。

必読（順番厳守）:
1. @docs/VERSION_TRUTH.md … main と GitHub Release の違い
2. @AI_SHARED_LOG.md … 先頭「Current Snapshot」のみ
3. @package.json … version フィールド（現行版の唯一の数字）
4. @CHANGELOG.md … [Unreleased] の次のセクション（最新リリース）
5. @AI_HANDOVER.md … アーキテクチャ全体

読了後、次の形式だけで返答してから待機してください:

---
【読了確認】
- 認識していた版: （例 v1.6.1 / v1.14.5）
- 正しい現行版（package.json）: （ここに実際の数字）
- GitHub Release latest（あれば）: （VERSION_TRUTH 参照）
- v1.23 以降の Living World（2〜3 行）:
- 次の本命タスク（Current Snapshot より）:
---

「読了確認」を出すまで、次のタスクには進まないでください。
```

---

## よくある誤認

| 誤り | 正しい理解 |
|------|------------|
| 「公開 main は v1.6.1」 | main の `package.json` を見る（2026-07-02 時点 **1.27.1**） |
| 「Release = 最新コード」 | Release はタグ push 時のみ更新。コードだけ進んで Release が遅れることがある |
| `WORLD_AND_VISUAL_MEMORY.md` の冒頭 | アーキテクチャ参考。版番号は CHANGELOG が正本 |