# LW2 Trust-based Whereabouts & PlayerRole GM Injection (v1.27.0) 実装レビュー

**レビュー日:** 2026-07-02
**レビュア:** Gemini (Antigravity)
**対象機能:** 信頼度連動の Whereabouts 精度変更 / PlayerRole の GM プロンプト反映
**対象バージョン:** v1.27.0（パッチ v1.27.1 含む）

## 1. レビューサマリ
**判定:** PASS（機能要件を完全に満たしており、テスト76/76も通過している良好な状態）
各Core層の純粋関数としての分離が徹底されており、WebviewのUI更新とGMプロンプトの両方に対して一貫したロジックで制御が行われています。

## 2. 機能要件の検証状況

### 2-1. `playerTrust` 連動の whereabouts 精度切り替え
- **判定: PASS**
- **実装状況:** 
  - `src/npcWhereaboutsTrustCore.ts` にて、`playerTrust` の値をベースに `exact` (≥ 70), `approximate` (31–69), `unknown` (≤ 30) を決定論的に判定する `resolveWhereaboutsPrecision` が美しく実装されています。
  - `formatWhereaboutsForDisplay` にて精度に基づいたラベルマスク（リージョン名のみへのフォールバック、行方不明化）が処理されています。
  - 拡張ホスト側の `src/worldView.ts` にて、生成された `precision` やマスク後の名称のみが Webview へ送出されており、Remote Play でのネタバレ防止（ブラウザDevToolsでの覗き見対策）も完璧です。

### 2-2. playerRole による GM プロンプトへの動機注入
- **判定: PASS**
- **実装状況:**
  - `src/livingWorldPlayerRoleCore.ts` にて、Roleごとの動機テキスト（`PLAYER_ROLE_MOTIVATION`）が一元管理されています。
  - `src/livingWorldPromptCore.ts` の `buildCaravanPromptLines` にて、スナップショットの `playerRole` を元に `buildPlayerRoleMotivationLine` を呼び出し、確実にプロンプトの先頭へ注入しています。

### 2-3. Webview への描画と多言語対応
- **判定: PASS**
- **実装状況:** 
  - `webview/modules/85-world.js` の `renderNpcWhereabouts` 内で `npc.precision` に応じた表示制御が行われており、`T('webview.world.npcWhereaboutsUnknown')` 等の多言語対応(i18n)キーも適切に使用されています。

## 3. 指摘事項への修正 (v1.27.1 パッチ)
初回のレビューで見落としていた以下の 3 点（P2相当）について、コードを修正しました。

1. **DevTools 覗き見防止の徹底**: `worldView.ts` において、`precision === 'unknown'` の場合に `locationId`, `arrivesTurn`, `inTransit` などの詳細フィールドを `undefined` としてペイロードから完全に除外するよう修正しました。
2. **GM文言の冗長解消**: `npcWhereaboutsTrustCore.ts` にて、移動中(inTransit)かつ精度が `approximate` の場合、すでに `heading toward` が含まれているため、プレフィックスの `en route to` を付けないように修正し、「en route to heading toward」の冗長な英語を解消しました。
3. **閾値の二重定義（マジックナンバー）解消**: `gmPromptBuilder.ts` にハードコードされていた 70 / 30 の閾値を、`npcWhereaboutsTrustCore.ts` の定数 (`TRUST_WHEREABOUTS_EXACT_MIN`, `TRUST_WHEREABOUTS_UNKNOWN_MAX`) に置き換え、将来的な不整合リスクを排除しました。

## 4. 総評
シミュレーションの真実(State)と、プレイヤーの知覚・メタ知識(View/Prompt)の分離が徹底された、テキストアドベンチャーの基盤として非常に理想的なアーキテクチャ設計です。上記の軽微な懸念点も修正されたため、このまま次の開発フェーズへと進めて問題ありません。
