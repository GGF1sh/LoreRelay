# README Screenshots & Ko-fi Plan

This document outlines the visual showcase strategy (screenshots/GIFs) for the LoreRelay extension and details the monetization/support strategy using Ko-fi.

> **現状（v1.7.3）:** `docs/assets/*.svg` は **SVG モック** です。README / Marketplace 用の **実スクショ・GIF** は未撮影。手順は [`DEMO.md`](../DEMO.md) を参照。

---

## 1. Screenshot Showcase Plan

README.md と拡張機能マーケットプレイスに掲載する **5 枚のスクショ + 1 本の GIF** を準備します。

### Screenshot 1: Active Inspector Panel

- **Visual:** VS Code サイドパネルの LoreRelay Inspector。ゲーム状態 JSON、直近の state patch ログ、ダイス ledger。
- **English:** "Inspect the live game state, dice histories, and LLM-applied state patches in real-time."
- **Japanese:** 「リアルタイムにゲームステータス、ダイス履歴、LLM によって適用された差分パッチを検査可能。」

### Screenshot 2: Remote Play Interface

- **Visual:** VS Code で Remote Play サーバー稼働中 + スマホ/ブラウザのレトロ風プレイヤー UI。
- **English:** "Cast your adventure to local devices! Let players roll dice and view logs from their phone or browser."
- **Japanese:** 「スマホやブラウザからダイスを振ってログを見れる、ローカルリモートプレイ機能。」

### Screenshot 3: Interactive Game Rules Configurator

- **Visual:** Webview の Game Rules 設定（HP/MP、難易度、カスタムダイス式）。
- **English:** "Tweak RPG mechanics, max HP/MP stats, and dice difficulty coefficients dynamically."
- **Japanese:** 「RPG メカニクス、HP/MP の上限、ダイス難易度係数などを動的に設定・カスタマイズ。」

### Screenshot 4: Media Agent (BGM & SFX Triggering)

- **Visual:** GM ナレーションに合わせて BGM/SFX が自動再生されるログ画面。
- **English:** "Automated ambient soundscapes and SFX triggered by natural language narration."
- **Japanese:** 「GM の描写テキストから、自動的に環境 BGM や効果音（SFX）をバックグラウンドで再生。」

### Screenshot 5: SillyTavern Import Utility

- **Visual:** コマンドパレットで `LoreRelay: Import SillyTavern Character` を実行し、カード PNG が JSON に変換される様子。
- **English:** "Directly import your favorite SillyTavern character cards (.png/.json) and Lorebooks into your game."
- **Japanese:** 「SillyTavern のキャラカードや世界観設定（ロアブック）をそのまま VS Code に簡単インポート。」

### Bonus: World Tab Cartography（v1.7+）

- **Visual:** World タブの Diagram / Parchment 切替、Mermaid pan/zoom、ピン overlay。
- **English:** "Pan and zoom your living world map — diagram or AI-generated parchment style."
- **Japanese:** 「生きた世界地図をパン・ズーム。図解モードと AI 羊皮紙モードを切り替え。」

### GIF: One-turn gameplay loop

- **内容:** プレイヤー入力 → GM 応答 → Inspector 更新 → ギャラリー画像追加（約 15〜30 秒）。
- **撮影:** `sample-scenarios/lost-catacombs` 推奨。

---

## 2. 撮影手順（実機）

1. `npm run compile` で拡張をビルドし、VS Code で開発ホストを起動。
2. `sample-scenarios/lost-catacombs` をワークスペースとして開く。
3. `LoreRelay: Open UI` → 1 ターン以上プレイして状態を用意。
4. Windows の **Win+Shift+S** または ShareX で各画面をキャプチャ。
5. GIF は ScreenToGif 等で 15〜30 秒に圧縮（幅 1280px 以下推奨）。
6. `docs/assets/` に `screenshot-*.png` / `demo-loop.gif` として保存し README を更新。

---

## 3. Ko-fi Support & Integration Plan

コア機能にペイウォールを設けず、任意のサポート（チップ）モデルを提案します。

### Key Goals

- 拡張機能は 100% オープンソースかつ無料のまま維持。
- Ko-fi による任意のサポート導線を README に配置。
- サポーター向けの軽いビジュアル特典（カスタムテーマ等）は将来検討。

### README Placement

- 英語 README の「Support」セクションに Ko-fi バッジ。
- 日本語 README に同等の一文（翻訳済みリンク）。

---

## 4. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-06-26 | 初版（Gemini 設計） |
| 2026-06-29 | UTF-8 修正、SVG モック現状明記、Cartography スクショ追加 |