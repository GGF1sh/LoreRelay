# Cartography C8 — 設計ブリーフ（探索感の強化）

> **命名:** Cartography **C8**。次トラックは **C9**（`docs/CARTOGRAPHY_C9_BRIEF.md`）。`docs/PHASE_NAMING.md` 参照。

> **目的:** 「プレイヤーが世界を探索している感覚」を一段上げる。実装前に **ゲームフィール / UX 仕様** を固めるためのブリーフ。  
> **推奨:** このファイルを **Claude** に渡して仕様案を書かせ、確定後 **Grok（Cursor）** で実装する二段構え。

---

## 現状（Phase 7 完了分）

| 項目 | 状態 |
|------|------|
| Region `x/y/biome` + `connectedTo` | ✅ `world_forge.json` |
| Voronoi レイアウト PNG | ✅ `render_cartography_layout.py` |
| ComfyUI 羊皮紙生成 | ✅ ControlNet Canny（任意） |
| Webview ピン overlay | ✅ Parchment モード |
| Tile Overmap | ✅ 表示専用・GM 非送信 |
| Fog of War | ❌ 未実装 |
| ピンクリック → 移動 / 詳細 | ❌ 限定的 |
| 移動時の自動背景 | △ `locationImageBuilder` あり・手動/設定依存 |

---

## 設計で決めるべき問い（Claude への依頼文にそのまま使える）

1. **Fog of War の粒度**
   - リージョン単位 vs ロケーション単位 vs タイル単位？
   - `world_state.visitedLocations` / `discoveredRegions` との整合は？
   - GM プロンプトに「未探索」を送るか、UI のみか？

2. **ピンインタラクション**
   - クリック → 何が起きる？（現在地表示 / ロケーション詳細 / 「ここへ移動」提案 / GM への行動テンプレ挿入）
   - 現在地 `@` と目的地 `⌂` のルール
   - モバイル / Remote Play でのタップ領域

3. **動的変化の見せ方**
   - `dangerLevel` 上昇 → 地図上の色・マーカー変化？
   - `world_state.recentChanges` → ピン横のイベントバッジ？
   - 派閥支配の塗り替えアニメーション要否

4. **3モードの役割分担**
   - Mermaid = 関係理解、Parchment = 叙情的探索、Tile = ローグライク感
   - モード切替時の状態引き継ぎ（ズーム・中心・FoW）

5. **データ永続化の原則（不変条件）**
   - タイルグリッドは **導出のみ**（`game_state.json` 肥大化禁止）
   - FoW 状態は `world_state.json` に保存してよいか
   - GM が読むのは **要約1行** まで（トークン予算）

---

## 参考にすべき既存コード

| 領域 | ファイル |
|------|----------|
| ピン座標 | `cartographyLayoutCore.ts`, `webview/modules/85-world.js` |
| タイル導出 | `tileOvermapCore.ts` |
| 訪問状態 | `worldStateCore.ts`, `world_state.json` |
| ロケーション画像 | `locationImageBuilderCore.ts` |
| プロンプト注入 | `gmPromptBuilder.ts`（World セクション） |

---

## 成果物の期待形式（Claude 出力テンプレ）

1. **プレイヤージャーニー**（3〜5ステップのユーザーフロー図）
2. **データモデル差分**（`world_state` / `game_state` に追加するフィールド案）
3. **UI ワイヤー**（World タブ・各モードの Before/After）
4. **GM 契約**（GM が書いてよい world patch / 読むべきでないデータ）
5. **PR 分割案**（FoW → ピン UX → 自動背景 の順など）

---

## 誰に何を頼むか（推奨分担）

| 役割 | 推奨 | 理由 |
|------|------|------|
| **探索感・UX 仕様** | **Claude** | ゲームフィール、プレイヤー心理、Fog of War 意味論、Saga & Seeker 比較に強い |
| **DF/CDDA 的な地図期待** | **Grok（ブラウザ）** | タイル文化・Roguelike 地図の慣習のブレインストーム |
| **商品化・差別化** | **Gemini** | 競合ポジション、有料アセット（LoRA/テーマパック）との接続 |
| **実装・テスト** | **Grok（Cursor）** | リポジトリ慣習、Core 抽出、CI 回帰に慣れている |

**おすすめフロー:** Claude に本ブリーフ + `CARTOGRAPHY_DESIGN.md` + `tileOvermapCore.ts` を読ませて **Phase 8 設計 doc** を出す → レビュー後 Cursor で `/implement` または `/design`。