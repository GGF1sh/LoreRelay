# LoreRelay - Development Timeline

このドキュメントは、LoreRelay（旧 Text Adventure Engine）が**「わずか2日間でどのように構築されたか」**の履歴を記録したものです。
開発者（Keisuke）が複数のAIエージェント（ChatGPT, Claude, Grok, Antigravity）と協働し、要件定義からアーキテクチャ設計、実装、テスト、i18n（多言語）対応、そして高度なAI機能の統合までを常識外れのスピードで完遂した軌跡です。

## Timeline (JST)

### Day 1: 2026-06-24 (v0.1.0 - v0.2.1)
**「コアエンジンの構築とマルチLLM対応」**
*   **初期構築**: VSCode 拡張機能の基盤（Webviewとの双方向通信、`game_state.json` のファイル監視）をゼロから構築。(v0.1.0)
*   **UI/UX設計**: Glassmorphism（すりガラス調）デザイン、CRPGライクなステータス画面、画像ギャラリー、ダイス計算機の実装。
*   **セキュリティ・アーキテクチャレビュー**: ChatGPT / Grokによるコードレビューを実施し、CSPの導入、XSS対策、シェルインジェクション対策を即日完了。(v0.1.1 - v0.1.2)
*   **LLM連携強化**: Grok Build、Ollama、KoboldCPP などローカル/クラウドLLMとの汎用ブリッジ（通信層）を構築。(v0.1.9 - v0.2.0)
*   **国際化 (i18n)**: 1日目にして4言語（日本語、英語、簡体字、繁体字）への対応を完了。(v0.2.1)

### Day 2: 2026-06-25 (v0.2.2 - v0.2.9)
**「CRPG体験の高度化と、モダンUIの統合」**
*   **ゲーム体験の向上**: 隠しダイスロール機能、シーンに合わせた自動BGMクロスフェード、ローカル効果音（SE）システムの追加。(v0.1.6 - v0.2.2)
*   **SillyTavern 互換**: 既存のキャラクターカード（PNG/JSON）やLorebook（世界観設定）のインポート機能を実装。(v0.2.3)
*   **インテリジェント・メモリ管理**: TF-IDF / ChromaDBを用いた記憶の自動抽出（Memory Bank）、Saga Archiverによる長期記憶の自動圧縮機能を実装。(v0.2.5 - v0.2.6)
*   **DREAMIOインスパイア機能**: 1ターンの巻き戻し（Undo / Retry）、Web Speech APIを用いた音声入力（STT）、音声ナレーション（TTS）など、モダンなテキストアドベンチャーUXをわずか1日で追加実装。(v0.2.8 - v0.2.9)

### Day 3: 2026-06-26 (v0.2.10 - v0.3.0)
**「リブランドとオープンソース公開、SillyTavern UX 統合」**
*   **公開準備**: プロジェクト名を「Text Adventure Engine」から「LoreRelay」へリネーム。
*   **ドキュメント整備**: 3言語（英語、簡体字、繁体字）のREADME翻訳を生成し、GitHubへリポジトリをパブリック公開。
*   **SillyTavern 参考 UI 統合 (v0.3.0)**: Claude Sonnet 4.6 が SillyTavern のスクリーンショット18枚を参照資料として、Phase ST-B（Quick Reply バー）と Phase ST-D（Message Action Bar）を1セッションで実装。インライン編集・プロンプト除外・ブランチ分岐など、ゲームプレイ中のメッセージ操作体験を大幅に強化。

---

## The AI-Native Workflow

この爆速開発を可能にしたのは、単なる「コード生成ツールの利用」ではなく、**「AIネイティブなプロジェクトマネジメント」**です。

1.  **AI間のコンテキスト共有**: `AI_SHARED_LOG.md` と `CHANGELOG.md` を「AI同士の引き継ぎ資料（Source of Truth）」として運用。
2.  **適材適所のAI活用**:
    *   **Grok / Antigravity**: ターミナル操作を伴う高速なコーディングとプロトタイピング。
    *   **Claude**: アーキテクチャのセキュリティレビューと、UX（ダイスロール、エラーハンドリング等）の緻密なブラッシュアップ。
    *   **ChatGPT / Gemini**: プロジェクトの方向性（Hacker Editionとしてのポジショニング）やビジネスモデルの壁打ち。
3.  **疎結合アーキテクチャ**: `game_state.json` をハブとする状態駆動（State-driven）設計により、各AIがUI側とロジック側を独立して安全に拡張できる構造を実現。
