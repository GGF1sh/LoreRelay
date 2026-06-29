# VS Code ChatGPT 用 — コンテキスト更新プロンプト

> **用途:** VS Code 内の ChatGPT が v1.6.3 前後の古い認識のまま止まっているとき、  
> このファイルを `@` で添付するか、下の「コピー用プロンプト」をそのまま貼って使う。

**リポジトリ:** `C:\AI\text-adventure-vsce`  
**現在の正しい版:** **v1.7.3**（`package.json` / `CHANGELOG.md [1.7.3]`）

---

## コピー用プロンプト（そのまま貼る）

```
【重要】あなたの LoreRelay に関する認識は古い可能性が高いです。
会話履歴や以前の説明（v1.6.3 前後）を信じないでください。
実装の正本は CHANGELOG.md とソースコードです。

まず次のファイルを、この番号順で読んでください（VS Code なら @ で添付）。
読み終えるまでコード提案・設計判断・「未実装」宣言はしないでください。

必読（順番厳守）:
1. @AI_SHARED_LOG.md … 先頭の「Current Snapshot」のみでよい（ここが最新の要約）
2. @CHANGELOG.md … [1.7.3] と [Unreleased] を重点。v1.7.0〜1.7.3 を必ず読む
3. @AI_HANDOVER.md … アーキテクチャ全体（turn_result フロー含む）
4. @AI_ROADMAP.md … Phase 7 完了・Phase 8 計画中を確認
5. @package.json … version フィールドで 1.7.3 を確認

読了後、次の形式だけで返答してから待機してください:

---
【読了確認】
- 認識していた版: （あなたが思っていた版、例 v1.6.3）
- 正しい現行版: 1.7.3
- v1.6.3 以降で入った主な変更（3〜5 行）:
- Phase 7 Cartography の状態: 完了 / 未完了
- 次の本命タスク（AI_ROADMAP より）:
- まだ未着手の公開 polish（あれば）:
---

「読了確認」を出すまで、次のタスクには進まないでください。

【v1.6.3 → v1.7.3 で特に勘違いしやすい点】
- Phase 7 Cartography は **完了**（v1.7.0 UI、v1.7.1 硬化、v1.7.2/1.7.3 レビュー修正）
- World タブに Diagram / Parchment 切替、ComfyUI 羊皮紙地図、layout PNG、ピン overlay あり
- パス検証は TS + Python で統一済み（cartographyPathCore / cartography_path_utils）
- 正規 GM 出力は turn_result.json（Persist-Before-Narrate）。game_state 直書きはフォールバック
- 次の機能候補は Phase 8 Event-to-Quest（計画中）。Cartography 本体は「これから」ではない

【セキュリティ・設計を聞かれたときの追加必読】
- @src/cartographyRunner.ts
- @src/remotePlayServer.ts
- @src/webviewHandlers.ts
- @TextAdventureGMSkill/SKILL.md（パス: C:\AI\TextAdventureGMSkill\SKILL.md）

【制約】
- 「v1.6.x 時点では未実装」など、CHANGELOG を読まずに言わない
- 古いレビュー文書（CLAUDE_CODE_REVIEW.md 等のスタブ）だけで判断しない
- 不明点は AI_SHARED_LOG の Current Snapshot と CHANGELOG を引用して答える
```

---

## 短縮版（忙しいとき）

```
LoreRelay の認識を v1.7.3 に更新してください。v1.6.3 前提は捨ててください。

@AI_SHARED_LOG.md の Current Snapshot → @CHANGELOG.md [1.7.3] → @AI_HANDOVER.md → @AI_ROADMAP.md の順で読んで、
「現行版 1.7.3 / Phase 7 完了 / 次は Phase 8」と 3 行で要約してから話してください。
それまで実装提案しないで。
```

---

## 読了後に続けたいときの例

読了確認が返ってきたら、続けて例えば:

```
では CHANGELOG [1.7.2] と [1.7.3] を前提に、
src/cartographyRunner.ts のセキュリティを Critical/High/Medium/Low でレビューして。
```

または:

```
Phase 8 Event-to-Quest の設計案を、turn_result パイプラインを壊さない範囲で提案して。
```

---

## 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-29 | 初版（v1.7.3 キャッチアップ用） |