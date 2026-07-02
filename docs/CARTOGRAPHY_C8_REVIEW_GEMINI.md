# Cartography C8 — 実装レビュー報告書（Gemini）

| 項目 | 値 |
|------|-----|
| **レビュア** | Gemini |
| **日付** | 2026-07-02 JST |
| **対象** | Cartography **C8**（Fog of War & Living Map）PR1〜6 |
| **設計正本** | `docs/CARTOGRAPHY_PHASE8_DESIGN.md` |
| **コミット範囲** | `c8432b8`（PR1+2）〜 `28463c3`（PR5+6）/ **v1.15.2** |
| **総合判定** | **PASS** — 不変条件（Critical）含め設計通り。次フェーズ（C9 設計）へ進行可 |

---

## サマリ

設計ドキュメントと対象コミット範囲のコードベースを照合し、レビューを実施した。

**結論:** 不変条件（Critical）を含むすべての要件が設計通りに実装されており、マージ状態として問題なし。既存フィールドの再利用、GM プロンプト負荷の抑制、`game_state` の肥大化回避による FoW 実装は特に洗練されている。

---

## 不変条件（Critical）検証 — すべてクリア

| # | 条件 | 結果 | 根拠 |
|---|------|------|------|
| 1 | タイル FoW は非永続 | ✅ | `tileOvermap` / `game_state` に 64×64 配列なし。クライアント側 `fogRegionLayout` 距離判定オーバーレイ |
| 2 | GM プロンプト FoW は既定 OFF | ✅ | `gmPromptBuilder.ts` が `cartography.fogInPrompt` 参照、default false。ON 時も行数・トークン制限 |
| 3 | `statePatch` `/world` allowlist 無改修 | ✅ | `statePatch.ts` で `currentLocationId` 変化検知 → `applyFogOnLocationVisit` が `visitedLocationIds` / `discoveredRegionIds` を拡張側で追記 |
| 4 | 既存 `visitedLocationIds` を再利用 | ✅ | 新規 Location FoW フィールドなし |
| 5 | Remote Play 情報漏れ防止 | ✅ | `maskCartographyPinsForFog` 等で unknown/rumored の locationName を Webview 送信前にマスク |
| 6 | 後方互換 | ✅ | `normalizeFogWorldState` で `discoveredRegionIds` 欠落セーブを現在地から初期化 |

---

## PR 別チェックリスト

### PR1 — FoW コア（`fogOfWarCore.ts`, `statePatch.ts`）

- [x] `applyFogOnLocationVisit`: `currentLocationId` 変化時に `visitedLocationIds` / `discoveredRegionIds` 追記
- [x] `deriveRumoredRegionIds`: discovered の `connectedTo` から rumored を再計算（非永続）

### PR2 — worldView + Webview 3モード

- [x] `worldView.ts`: `buildFogPayload` → `fog` オブジェクトを Webview へ転送
- [x] `worldMapGenerator.ts`: `fog_unknown` / `fog_rumored` classDef

### PR3 — ピン操作

- [x] `WorldViewLocationPinMeta`: `fogVisibility`, `isCurrent` 等の表示制御フラグ

### PR4 — 動的フィードバック（`mapFeedbackCore.ts`）

- [x] `buildMapFeedbackPayload`: `fogVisibility === 'discovered'` のみ danger/highlight を送信（メタ知識防止）

### PR5 — Auto Location Image（gated）

- [x] `statePatch.ts`: `cartography.autoLocationImage` ゲート、`shouldTriggerAutoLocationImage` で重複・cooldown

### PR6 — GM FoW 1行（gated）

- [x] `gmPromptBuilder.ts`: `cartography.fogInPrompt` ゲート、既定動作に影響なし

---

## 所見

アーキテクチャ制約（トークン節約、決定論、シミュレーションとの分離）を遵守した実装。コードベースへのマージ状態として問題なし。**Cartography C9（地図/伝聞アイテム）の設計へ進行してよい。**

---

## 関連

- レビュー依頼プロンプト: （セッション内生成。必要なら `docs/CARTOGRAPHY_C8_REVIEW_PROMPT.md` として固定化可）
- 命名: `docs/PHASE_NAMING.md`
- 次トラック: `docs/CARTOGRAPHY_C9_BRIEF.md`