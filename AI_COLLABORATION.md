# AI Collaboration Rules

このファイルは、Claude / ChatGPT / Grok / Gemini / Antigravity など複数の AI が同じプロジェクトを引き継ぐための作業ルールです。新しい AI は、作業前に `AI_HANDOVER.md` とこのファイルを必ず読んでください。

## Source of Truth

実装状態の正本は、以下の順で判断します。

1. **ソースコード** — 実際の挙動の正本
2. **`CHANGELOG.md`** — 実装済み変更の履歴
3. **`AI_SHARED_LOG.md`** — 直近の作業状況、未コミット作業、次に触るべき点（先頭の **Current Snapshot** を優先）
4. **各レビュー文書** — 意見、分析、提案、過去の持論

レビュー文書は議論の記録を含むため、古い「未対応」や古い設計案が残る場合があります。実装済みかどうかは、必ずソースコードと `CHANGELOG.md` で確認してください。

## Read Order

新しい AI は、原則として以下の順で読みます。

1. `AI_HANDOVER.md`
2. `AI_HANDOVER_PROMPTS.md`（役割に応じたセクション）
3. `AI_COLLABORATION.md`（本ファイル）
4. `AI_SHARED_LOG.md`（Current Snapshot + 直近ログ）
5. `CHANGELOG.md` の最新セクション（現在 **v1.10.0**）
6. `AI_ROADMAP.md`
7. 必要に応じて `C:\AI\GROK_CODE_REVIEW.md`, `C:\AI\GEMINI_REVIEW.md`, `C:\AI\CLAUDE_REVIEW.md`

## Where to Write

| 内容 | 書く場所 |
|------|----------|
| 実装済みの変更履歴 | `CHANGELOG.md` |
| 作業開始/完了、現在の未解決点、次の AI への申し送り | `AI_SHARED_LOG.md` |
| 新しい技術レビューや長い考察 | `C:\AI\<MODEL>_REVIEW.md` または専用レビュー文書 |
| プロダクト方針・競合分析・マネタイズ案 | 既存レビュー文書、または `AI_SHARED_LOG.md` に短く要約して詳細文書へリンク |
| ユーザー向け導入/使い方 | `README.md`, `DEMO.md` |
| インシデント調査・再発防止（公開向け） | `docs/` 配下（例: `docs/WEBVIEW_TAB_DOM_POSTMORTEM.md`） |
| AI GM の振る舞い・出力契約 | `C:\AI\TextAdventureGMSkill\SKILL.md` |
| シナリオパック仕様 | `C:\AI\TextAdventureGMSkill\SCENARIO_PACK.md` |

## Update Rules

- 作業をした AI は、最後に `AI_SHARED_LOG.md` に追記してください。
- 実装変更をした場合は `CHANGELOG.md` の `[Unreleased]` にも追記してください。
- レビュー文書へ新しい意見を書く場合、`AI_SHARED_LOG.md` に 1〜3 行で要約し、該当ファイルへの参照を残してください。
- 既存レビュー文書の古い指摘を更新した場合は、元の議論を消しすぎず、対応状況を追記してください。
- 迷ったら `AI_SHARED_LOG.md` に「判断待ち」として残してください。

## Shared Log Entry Template

`AI_SHARED_LOG.md` には、次の形式で追記します。

```md
## YYYY-MM-DD HH:mm JST - <AI名> - <短いタイトル>

### Summary
- 何をしたか

### Files touched
- `path/to/file`

### Decisions
- 決めたこと、または決めなかったこと

### Remaining / Next
- 次の AI またはユーザーが見るべき残件

### Verification
- 実行した確認コマンド、または未実施理由
```

## Text Encoding

- リポジトリ内の Markdown / ソースは **UTF-8（BOM なし）** で保存してください。
- `.editorconfig` の `charset = utf-8` に従ってください。
- Windows のメモ帳や CP932 前提のエディタで保存すると文字化けの原因になります。

## Private Local Data

Private scenario vaults, personal play logs, imported character cards, lorebooks, generated memories, and local media are outside the public repository scope. Do not read, edit, summarize, index, glob, or mention private contents in shared docs unless the user explicitly asks for that local-only work.

## Code Comments

複数 AI が引き継ぐため、**設計書を読まなくてもソースだけで境界が分かる**コメントを書く。自明な処理の行コメントや CHANGELOG の写し経は不要。

### `*Core.ts`（純 TS・テスト可能）

ファイル先頭に 1〜3 行:

- 責務（何をパース/解決するか）
- `no vscode/fs/DOM imports`（または例外理由）
- 関連設計 doc があればファイル名（例: `PHASE11_ADAPTIVE_TTS_DESIGN.md`）

長いファイルは `// ---------------------------------------------------------------------------` で Types / Constants / Helpers などに区切る。既存例: `npcBridgeCore.ts`, `visualMemoryCore.ts`.

### export 型・フィールド

単位・範囲・フェーズ境界（11A/11B など）が自明でないフィールドだけ `/** ... */`。全フィールド義務ではない。

### export 関数

次のいずれかがあるときだけ JSDoc または 1 行コメント:

- 曖昧さの扱い（例: 同名 NPC → location で絞る、それでも曖昧なら undefined）
- フォールバック条件（例: external 無効時は system）
- 副作用・セキュリティ（例: `sanitizeVoiceId` はパス拒否）

テストで固定されている単純な clamp はコメント不要。

### Webview `modules/*.js`

- 対応する Core モジュール名を先頭に書く（例: `Mirrors src/ttsProviderCore.ts`）
- **数値テーブルや attribution ルールを Core と二重実装している場合は「同期必須」と明記**
- セクションは `// ===== ... =====` または区切り線（`60-tts-quickreply-imagegen.js` に倣う）

### 書かない

- 自明な代入・ループの説明
- 設計書全文の要約（リンクで足りる）
- 「この関数は X する」だけの JSDoc（関数名で分かる場合）

新規 `*Core.ts` や Webview ミラーモジュールを追加したら、上記を満たしているか diff で確認する。

## Do Not

- 既存のユーザー変更を勝手に巻き戻さない
- Private/local scenario vaults or personal play data を探索・編集・要約しない（ユーザーが明示したローカル作業を除く）
- `CHANGELOG.md` をレビューや議論モードの置き場にしない
- レビュー文書を唯一の正本として扱わない
- ローカル生成物（`game_state.json`, `game_history.json`, `__pycache__`, `.pyc`, 個人音源など）を公開用変更に混ぜない