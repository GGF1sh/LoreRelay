# Graphics Upgrade Ideas — アイデアノート

> 2026-07-04 Claude とのブレストから。Webview 見た目の豪華さ底上げ案。
> 実装対象は「動き・光・統一感・奥行き」の4軸。永続化/ops/canonical state には触れない前提。

## 採用（着手順）

1. **✅ 実装済み（土台 + Atmosphere Pass）** — `webview/modules/84a-webview-anim.js`（共有アニメ駆動系
   `window.LR_anim`、off/light/full の実行時切替）＋タイルオーバーマップの水面揺らぎ・hazard tint 脈動・
   `@` 明滅・rumored マーカー点滅・（fullティアのみ）残り火パーティクル。詳細:
   [`GRAPHICS_UPGRADE_DESIGN.md`](GRAPHICS_UPGRADE_DESIGN.md) §1-2、`AI_SHARED_LOG.md` 2026-07-04 Claude。
2. **✅ 実装済み（ジオラマ ライティング/奥行き）** — `86c-settlement-diorama.js`。
   シャドウマッピング（bounds連動フラスタム）、`THREE.Fog`（palette.backgroundと同色）、
   素材別 metalness/roughness（`MeshLambertMaterial`→`MeshStandardMaterial`）、
   `palette.theme`/`palette.accent`（既存だが未使用だった）を使ったジャンル連動ライティング。
   ペイロード変更ゼロ。常時アニメは入れていない（設計判断どおり）。詳細:
   `AI_SHARED_LOG.md` 2026-07-04 Claude「Graphics Upgrade Track 2」。
3. **✅ 実装済み（ジャンルクローム/ポストエフェクト）** — `webview/styles/9b-genre-chrome.css` +
   `#genre-fx-overlay`。設計から逸脱し `data-genre` 自動付与ではなく既存の手動 `body[data-ui-theme]`
   を再利用（マップ/ジオラマのジャンルキーとプレイヤー選択テーマの二重信号を避ける）。
   CRT/ビネット/グレイン/ダスト等の静的エッジ処理、`--cyber-glow`/`--glass-glow` の配線、
   GM送信者グリフ。詳細: `AI_SHARED_LOG.md` 2026-07-04 Claude「Graphics Upgrade Track 3」。

## 保留（後回し・別コスト）

4. **アセット依存トラック** — タイルのスプライトセット化（`drawOvermapTile()` は差し替え前提設計）、
   NPC/背景アート。ComfyUI 自前生成なら供給問題を回避できるので LoreRelay の思想と相性は良いが、
   素材調達/選定という別種の作業が乗るため、1-3 が一段落してから着手する。

## 備考

- 4つとも Webview read-only 領域。turn_result / vehicleOps 等の apply-gate ワークフローは不要。
- 1-3 は相互に関連（Atmosphere Pass は tile + diorama + テーマCSSを横断）ため、
  設計は一括、実装はトラックごとに区切って進める想定。
