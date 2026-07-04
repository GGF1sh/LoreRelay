# Graphics Upgrade Ideas — アイデアノート

> 2026-07-04 Claude とのブレストから。Webview 見た目の豪華さ底上げ案。
> 実装対象は「動き・光・統一感・奥行き」の4軸。永続化/ops/canonical state には触れない前提。

## 採用（着手順）

1. **✅ 実装済み（土台 + Atmosphere Pass）** — `webview/modules/84a-webview-anim.js`（共有アニメ駆動系
   `window.LR_anim`、off/light/full の実行時切替）＋タイルオーバーマップの水面揺らぎ・hazard tint 脈動・
   `@` 明滅・rumored マーカー点滅・（fullティアのみ）残り火パーティクル。詳細:
   [`GRAPHICS_UPGRADE_DESIGN.md`](GRAPHICS_UPGRADE_DESIGN.md) §1-2、`AI_SHARED_LOG.md` 2026-07-04 Claude。
2. **未着手 — ジオラマ（M5）のライティング/奥行き** — 方向光+アンビエント+簡易シャドウ、
   背景フォグ/グラデーション天空、マテリアル質感差、ジャンル連動ライティングプロファイル。
3. **未着手 — テーマのクローム/ポストエフェクト拡張（統一感）** — 8ジャンルテーマをタイル配色だけでなく
   UI枠装飾・Canvas ポストエフェクト（スキャンライン/フィルムグレイン/紙テクスチャ）・
   チャット区切り装飾まで拡張。

## 保留（後回し・別コスト）

4. **アセット依存トラック** — タイルのスプライトセット化（`drawOvermapTile()` は差し替え前提設計）、
   NPC/背景アート。ComfyUI 自前生成なら供給問題を回避できるので LoreRelay の思想と相性は良いが、
   素材調達/選定という別種の作業が乗るため、1-3 が一段落してから着手する。

## 備考

- 4つとも Webview read-only 領域。turn_result / vehicleOps 等の apply-gate ワークフローは不要。
- 1-3 は相互に関連（Atmosphere Pass は tile + diorama + テーマCSSを横断）ため、
  設計は一括、実装はトラックごとに区切って進める想定。
