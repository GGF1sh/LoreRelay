# Grok レビュー・機能提案（元文 / ベースライン）

> **出典:** Grok による LoreRelay レビュー（会話共有、**v0.3.3 前後の視点**）  
> **用途:** Claude に **この文書の改良版** を書いてもらうときの入力（`CLAUDE_REVIEW_PROMPT.md` 参照）  
> **注意:** そのまま公開しない。v1.0.0 では多くの「未実装」が解消済み（下表参照）。

---

## プロジェクト要約（Grok）

VSCode 拡張として実装されたローカルファーストの AI GM UI。`game_state.json` / `turn_result.json` によるファイルベース橋渡しで任意の AI と連携し、CRPG 的ダッシュボード（キャラシート、画像、BGM/SFX、ダイス）を提供。SillyTavern 的柔軟性と没入型 TRPG 体験のハイブリッド。

---

## コードレビュー — 良い点（Grok）

| 領域 | 評価 |
|------|------|
| モジュール設計 | `src/` 細分化、責務明確（gameStateSync, lorebookMatcher, memoryBank, mediaAgent, remotePlayServer 等） |
| 状態同期 | FileSystemWatcher、デバウンス、turn_result SHA-256 冪等、writeJsonAtomic、リトライ |
| Webview セキュリティ | CSP + nonce + asWebviewUri + localResourceRoots |
| 先進機能 | ST インポート、profileUpdates、summary、hiddenDice、MediaAgent 非同期画像キュー |
| その他 | i18n、チェックポイント、アーカイブ、AI 協業ドキュメント |

---

## コードレビュー — 改善点（Grok → Claude が v1.0 で再検証）

| # | 論点 | Grok の指摘 | v1.0 で確認すること |
|---|------|-------------|---------------------|
| G1 | `panel` グローバル | extension.ts のモジュールレベル panel | dispose 十分か、GamePanelManager 化の要否 |
| G2 | memoryBank 日本語 | 英語単語 + bigram 中心、日本語 RP で弱い | `memoryBank.ts` 現状、ChromaDB 併用で緩和されているか |
| G3 | スキーマバージョン | game_state_schema に schemaVersion なし | マイグレーション戦略の要否 |
| G4 | 可観測性 | void fire-and-forget、ログ散在 | 中央ロガー要否 |
| G5 | postMessage 型 | スキーマ検証が緩い | webviewHandlers + Zod 等の要否 |
| G6 | テスト不足 | コアロジックのユニットテスト少 | `npm test` 現状（validate, lorebook, statePatch, director, party, scenarios） |
| G7 | 超長時間プレイ | gameEntryHistory 全件保持 | サマリー・除外・archive の実効性 |

---

## 機能提案（Grok → v1.0 実装状況）

| 優先 | 機能 | v1.0 状態 |
|------|------|-----------|
| ★★★★★ | Lorebook 管理 UI + ST 互換 | **v0.5 実装済**（閲覧・編集・保存・pinned）。TavernCard V1/V2 完全対応は **未**（AI_ROADMAP Phase 2B） |
| ★★★★★ | MemoryBank 日本語 + 階層メモリ | **v0.5d Memory UI** + backend 切替。日本語トークナイザー強化は **要検討** |
| ★★★★☆ | TTS キャラ別 | Webview TTS あり（`60-tts-quickreply-imagegen.js`）。キャラ別ボイスは **要検討** |
| ★★★★☆ | 複数 NPC / 関係値 | **v0.7 Party Director**（verbosity, relationships, party_director.json） |
| ★★★★ | 履歴検索・インライン編集 | editEntry / exclude あり。全文検索は **要検討** |
| 中 | キャンペーン/セーブ洗練 | チェックポイント・Undo あり |
| 中 | Prompt テンプレートライブラリ | Inspector で breakdown 表示あり |
| 中 | VN 風ビジュアル強化 | sprite/background あり |
| 中 | リモートプレイ拡張 | **v0.7** player/spectator + QR。マルチプレイヤーイニシアチブは **未** |

---

## Grok のまとめ（Claude への期待）

強みは「ローカルメディア + 構造化状態 + ファイルベースのハッカー親和性」。次の投資先として Lorebook + Memory の UI/UX と日本語 memory が効く、と Grok は述べたが **UI 側は v0.5〜v0.7 で大幅に進んだ**。Claude は **v1.0 以降のギャップ**（TavernCard 完全対応、schema versioning、日本語 RAG、テスト拡充）に焦点を当てること。

---

## Grok 原文（全文）— Claude が改良するベース文

以下を **文体・構成の参考** にしつつ、v1.0.0 向けに書き直す。

---

**LoreRelay** のコードレビューと機能提案を、しっかりした視点でまとめます。

これは **VSCode拡張として実装されたローカルファーストのAI GM（Game Master）UI** で、 `game_state.json`（および `turn_result.json`）を介したファイルベースの橋渡しにより、任意のAI（Claude / Grok / Ollamaなど）と連携しつつ、CRPG的な視覚ダッシュボード（キャラクタシート、画像ギャラリー、BGM/SFX、ダイス）を提供するユニークなプロジェクトです。SillyTavernの思想（柔軟なバックエンド + Lorebook的な仕組み）を一部取り入れつつ、「チャット中心」ではなく「没入型TRPG/テキストアドベンチャー体験」に寄せている点が特徴的です。

v0.3.3時点で既に**かなり完成度が高く、モジュール設計も整っている**印象です。以下で詳細にレビューします。

### 1. コードレビュー（良い点・改善点）

#### 良い点（特に評価できる部分）

- **モジュール設計の優秀さ** — `gameStateSync.ts`, `lorebookMatcher.ts`, `memoryBank.ts`, `mediaAgent.ts`, `imageGenRunner.ts`, `remotePlayServer.ts` 等
- **状態同期の堅牢さ** — FileSystemWatcher、300msデバウンス、turn_result SHA-256 冪等、writeJsonAtomic、リトライ
- **Webviewセキュリティ** — CSP + nonce + asWebviewUri + localResourceRoots
- **既存の先進的機能** — ST インポート、profileUpdates、summary、hiddenDice/diceRequest、MediaAgent 画像キュー
- **その他** — i18n、チェックポイント/アーカイブ、AI 協業ドキュメント

#### 改善点・注意すべきポイント

- グローバルな `panel` 変数管理（extension.ts）
- 日本語テキスト処理の弱さ（memoryBank）
- 状態のバージョニングが無い（schemaVersion）
- エラーハンドリング・可観測性（void、ログ散在）
- Webview側の型安全性（postMessage スキーマ緩い）
- テストの少なさ
- 超長時間プレイ時の gameEntryHistory 全件保持

### 2. 機能提案（2026年現在のAI RPトレンドから）

トレンド: 長文耐性（RAG/Summarization）、Lorebook進化、没入メディア（TTS/VN）、動的状態管理、構造化+視覚化。

#### 高優先

| 優先 | 機能 |
|------|------|
| ★★★★★ | Lorebook管理UI + フルST互換強化 |
| ★★★★★ | MemoryBankの日本語強化 + 階層メモリ |
| ★★★★☆ | TTS統合（キャラクター別ボイス） |
| ★★★★☆ | 複数NPC/キャラクター管理ツール |
| ★★★★ | 履歴の検索・フィルタ・インライン編集 |

#### 中優先

キャンペーン/セーブ管理、Promptテンプレート、VN風ビジュアル、統計トラッキング、リモートプレイ拡張（複数プレイヤー、観戦、イニシアチブ）

### まとめ（Grok）

強みはローカルメディア + 構造化状態管理 + ファイルベースのハッカー親和性。**最優先投資先は Lorebook + MemoryBank 周りの UI/UX 強化**（特に日本語 memory）。