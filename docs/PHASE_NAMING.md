# Phase 命名規則（Roadmap × Cartography）

> **目的:** 「Phase 9 が2つある」などの混乱を防ぐ。新規ドキュメント・CHANGELOG・AI 申し送りは本規則に従う。

---

## 軸モデル（v1.18 以降は 4 軸）

LoreRelay には **独立した番号体系** がある。

| 軸 | プレフィックス | 用途 | 例 |
|----|----------------|------|-----|
| **Roadmap Phase** | `Phase N`（グローバル） | プロダクト全体のマイルストーン。`AI_ROADMAP.md` が正本 | Phase 9 = Agentic GM |
| **Cartography** | `C7` / `C8` / `C9` … | 地図・探索 UX。`docs/CARTOGRAPHY_*` | C9 = 遠隔 FoW |
| **Living World** | `LW` / `LW-W1` / `LW1` / `LW2` | 世界ファースト・貿易・NPC 反応。`docs/COMMERCE_AND_AGENCY_BRIEF.md` | LW1 = Commerce |
| **Domain** | `D1` … `D5` | 領地運営・領主プレイ。`docs/DOMAIN_MODE_DESIGN.md` | D1 = Domain Core |
| **Fable5** | `F1` … `F6` | journal/演出/評判/旅/書き出し/地図逆輸入。`docs/FABLE5_FEATURE_PROPOSALS_DESIGN.md` | F1 = Chronicle |

**ルール:** Cartography の作業を **Roadmap Phase 番号だけで呼ばない**。LW と Fable5 は **Cartography C* とも別トラック**。

---

## Roadmap Phase 一覧（`AI_ROADMAP.md`）

| Phase | 機能 | 状態 | おおよその Ver |
|-------|------|------|----------------|
| 1 | ダイス・Game Rules | 完了 | v1.0 系 |
| 2 | State Patch / ST 互換 | 完了 | v1.1 系 |
| 3 | World System / Emergent Sim | 完了 | v1.3 系 |
| 4 | Living World Feedback | 完了 | v1.4 系 |
| 5 | Visual Memory / Soulgaze | 完了 | v1.5 系 |
| 6 | Audit Wave | 完了 | v1.6 系 |
| 7 | **Cartography 基盤**（C7 と同義） | 完了 | v1.7 系 |
| 8 | Event-to-Quest / Quest Board | 完了 | v1.10 系 |
| 9 | **Agentic GM**（Split-Role） | 完了 | v1.10 系 |
| 10 | Git Native Timeline | 完了 | v1.10 系 |
| 11 | Adaptive TTS | 完了 | v1.11 系 |
| 12 | Tile Overmap | 完了 | v1.13–1.14 系 |

> Roadmap Phase 7 = Cartography **基盤のみ**。FoW 以降は Cartography サブトラック（C8+）で追う。

---

## Cartography サブトラック（`docs/CARTOGRAPHY_*`）

| ID | 名称 | 状態 | Ver | 設計 doc |
|----|------|------|-----|----------|
| **C7** | 基盤（layout / Parchment / ComfyUI / ピン） | 完了 | v1.7.x | `docs/CARTOGRAPHY_DESIGN.md` |
| **C8** | FoW & Living Map（探索霧・ピン操作・動的 FB） | 完了・**レビュー PASS** | v1.15.x | 設計: `docs/CARTOGRAPHY_PHASE8_DESIGN.md` / レビュー: `docs/CARTOGRAPHY_C8_REVIEW_GEMINI.md` ※ |
| **C9** | 地図/伝聞アイテム + 遠隔 FoW 開示 | **完了** | v1.16.0 | 設計: `docs/CARTOGRAPHY_C9_DESIGN.md` |

※ ファイル名の `PHASE8` は **Cartography C8** を指す（Roadmap Phase 8 ではない）。リネームは任意・低優先。

---

## Living World サブトラック（`docs/COMMERCE_AND_AGENCY_BRIEF.md`）

| ID | 名称 | 状態 | 想定 Ver |
|----|------|------|----------|
| **LW-W1** | 動く世界の深化 | ブリーフ済・未実装 | 1.20.0 |
| **LW1** | Commerce（貿易・輸送） | ブリーフ済・未実装 | 1.21.0 |
| **LW2** | NPC Agency（世界への反応） | ブリーフ済・未実装 | 1.22.0 |

優先: **世界が先に動く** → NPC はその結果（§0 世界ファースト）。

---

## Domain サブトラック（`docs/DOMAIN_MODE_DESIGN.md`）

| ID | 名称 | 状態 | 想定 Ver |
|----|------|------|----------|
| **D1** | Domain Core（stats・月次行動・validate） | 設計済・未実装 | 1.39.0 |
| **D1.5** | Domain + Time + Chronicle | 設計済・未実装 | 1.39.0 |
| **D2** | Domain Prompt + `domainOps` | 設計済・未実装 | 1.39.0 |
| **D3** | Domain UI（World タブ） | 設計済・未実装 | 1.40.0 |
| **D4** | Domain Events + Commerce 接続 | 設計済・未実装 | 1.41.x |
| **D5** | Officers + NPC 任命 | 設計済・未実装 | 1.41.x |

前提: Campaign モード · `enableDomainMode` 既定 **OFF** · 三層時計（`WORLD_TIME_PASSAGE_IDEA.md` §C）準拠。

---

## Fable5 サブトラック（`docs/FABLE5_FEATURE_PROPOSALS_DESIGN.md`）

| ID | 名称 | 状態 | 想定 Ver |
|----|------|------|----------|
| **F1** | Chronicle（あらすじ） | 設計済・未実装 | 1.19.0 |
| **F2** | Pacing Director | 設計済・未実装 | 1.19.0（F1 同梱可） |
| **F3** | 派閥レピュテーション | 設計済・未実装 | 1.20.x / LW1 合流 |
| **F4** | 旅路エンカウント | 設計済・未実装 | LW1 移動と同時 |
| **F5** | リプレイ書き出し | **1.21.1** ✅ | 箸休み |
| **F6** | 地図インポート（逆 Cartography） | 設計済・未実装 | 1.22.x |

---

## 設計 doc と Ver の関係

- **ブリーフ・設計 doc の追加だけ** → `package.json` の Ver は上げない。
- **機能が出荷（ユーザーが設定/UI で触れる）** → マイナー繰上（例: F1+F2 → **1.19.0**）。
- 複数トラック同梱は `AI_ROADMAP.md` の「次期ロードマップ」表に従う。

---

## 衝突していた呼び方（整理）

| 旧表現 | 正しい呼び方 |
|--------|----------------|
| 「Cartography Phase 8」（FoW） | **Cartography C8** または「C8 FoW」 |
| 「Phase 8 Quest Board」 | **Roadmap Phase 8** |
| 「Phase 9 Agentic GM」 | **Roadmap Phase 9**（完了済み） |
| 設計 doc §8 Q1 の「Phase 9」（地図アイテム） | **Cartography C9** |

---

## 新規ドキュメントの命名

| 種類 | 推奨ファイル名 | タイトル例 |
|------|----------------|------------|
| Cartography 設計ブリーフ | `docs/CARTOGRAPHY_C9_BRIEF.md` | Cartography C9 — 設計ブリーフ |
| Cartography 設計正本 | `docs/CARTOGRAPHY_C9_DESIGN.md` | Cartography C9 — 設計ドキュメント |
| Roadmap 系設計 | `PHASE{N}_*_DESIGN.md`（ルート） | Phase 9: Agentic Campaign Engine |
| レビュー用プロンプト | `docs/CARTOGRAPHY_C9_REVIEW_PROMPT.md` | — |

CHANGELOG では次の形式を推奨:

```md
- **Cartography C9 — …** — （本文）
```

Roadmap 全体の機能なら:

```md
- **Phase 11 — …** — （本文）
```

---

## AI 申し送りテンプレ（1行）

```
Roadmap Phase 9（Agentic GM）は完了。Cartography 次は C9（地図/伝聞アイテム）。命名は docs/PHASE_NAMING.md 参照。
```

---

## メンテナンス TODO（低優先）

- [ ] `AI_ROADMAP.md` Phase 12 の「将来: fog of war」→ C8 完了に更新
- [ ] `docs/CARTOGRAPHY_PHASE8_DESIGN.md` タイトルに「(Cartography C8)」注釈
- [ ] `docs/USER_GUIDE.md` の FoW「未実装」→ 実装済みに更新
- [ ] `phase8_planning_and_prompts.md` 先頭に「Roadmap Phase 8 ≠ Cartography C8」注釈