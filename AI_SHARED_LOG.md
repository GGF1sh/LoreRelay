# AI Shared Log

> **最新状態は先頭の Current Snapshot を正とする。** 以下は履歴。実装の正本は `CHANGELOG.md` + ソースコード。

---

## Current Snapshot

**更新: 2026-06-30 JST**

| 項目 | 値 |
|------|-----|
| Package version | **1.7.3** (`package.json`, `CHANGELOG.md` [1.7.3]) |
| Source of truth | `CHANGELOG.md` + source code |
| Task blackboard | `AI_ROADMAP.md` |
| Handover doc | `AI_HANDOVER.md`（2026-06-29 刷新） |
| Text encoding | **UTF-8（BOM なし）** — `.editorconfig` + `scripts/validate_utf8_docs.js` |

### v1.7.x で入ったこと（要約）

- **v1.7.0** — Cartography UI（Diagram / Parchment、ComfyUI、ピン overlay）
- **v1.7.1** — パス検証、workflow 契約、デモ layout、README 4言語
- **v1.7.2** — Python/TS パス仕様統一（ChatGPT review）
- **v1.7.3** — `copyFileSync` 前検証、layout 子プロセス追跡、Remote Play `/media` チェック順（Claude review）

### Main remaining work

- README **実スクショ / GIF**（`docs/assets/*.svg` はモック。手順は `DEMO.md`）
- [`testing_checklist.md`](testing_checklist.md) の手動確認
- Cartography UX polish（stale 表示、再生成促し）— 任意
- **v1.8 Event-to-Quest** — 次の機能候補（`AI_ROADMAP.md` Phase 8）
- Private scenario vault: 公開 Git / 共有ドキュメントの対象外

### AI連携時の動作確認ルール

- 実装したがユーザー未確認の機能は `testing_checklist.md` に残す
- 「とりあえず先に進めて」でも未確認の積み上げを把握し、適宜プレイ確認を促す
- 作業開始前に `AI_ROADMAP.md` と本 Snapshot を確認し、完了済みフェーズを壊さない

---

## 2026-06-30 JST - Grok - AITest workspace review (i18n + Cartography)

### Summary

- `C:\AITest` で layout PNG 生成成功（`world_map.layout.png`）
- ComfyUI 羊皮紙生成は layout バグ修正後にキューまで到達。ユーザ環境では `sd_xl_base_1.0.safetensors` が未インストールのため 400（`TA_CHECKPOINT` 要設定）
- Quick Reply 等 19 キーの i18n 不足を 4 言語で補完。World「Map Image」ボタンも i18n 化

### Files touched

- `locales/*.json`, `webview/index.html`, `webview/modules/85-world.js`
- `scripts/comfyui_generate_cartography.py`, `scripts/check_i18n_keys.js`, `package.json`
- `CHANGELOG.md`, `AI_SHARED_LOG.md`

### Verification

- `npm run compile && npm test`
- `python scripts/render_cartography_layout.py C:\AITest\world_forge.json C:\AITest\world_map.layout.png`

### Remaining (manual in Extension Host)

- World タブ実表示（Mermaid / 派閥 / Diagram↔Parchment）
- ComfyUI で `world_map.png` 生成（checkpoint 設定後）
- Extension Host リロードで i18n 修正を確認

---

## 2026-06-29 JST - Grok - UTF-8 encoding fix (docs)

### Summary

- 14 個の Markdown が不正 UTF-8 / 文字化けしていたため、重要ドキュメントを UTF-8 で書き直し
- レビュー系・`implementation_plan.md` はスタブ化（`CHANGELOG.md` / `C:\AI\*_REVIEW.md` へ誘導）
- `AI_SHARED_LOG.md` 旧履歴（v1.1.2 以降の破損ブロック）をアーカイブ注記に差し替え
- `.editorconfig`（charset=utf-8）と `scripts/validate_utf8_docs.js` を追加

### Files touched

- `AI_COLLABORATION.md`, `AI_HANDOVER_PROMPTS.md`, `ANTIGRAVITY_GUIDE.md`, `GM_BRIDGE_PRESETS.md`, `SILLYTAVERN_COMPAT.md`
- `DEVELOPMENT_TIMELINE.md`, `docs/readme-screenshots-plan.md`
- `CLAUDE_*.md`, `GROK_REVIEW_v1_BASELINE.md`, `implementation_plan.md`
- `AI_SHARED_LOG.md`, `.editorconfig`, `scripts/validate_utf8_docs.js`, `CHANGELOG.md`

### Verification

- `node scripts/validate_utf8_docs.js`

---

## 2026-06-29 JST - Grok - AI handover docs refresh

### Summary

- `AI_HANDOVER.md` を全面書き直し（文字化け解消、v1.7.3、`turn_result` フロー、残件更新）
- `AI_SHARED_LOG.md` 先頭に Current Snapshot を再配置
- `AI_ROADMAP.md` に Phase 7（Cartography）完了と Phase 8 候補を追記

### Files touched

- `AI_HANDOVER.md`, `AI_SHARED_LOG.md`, `AI_ROADMAP.md`, `CHANGELOG.md`

### Verification

- ドキュメントのみ（コード変更なし）

---

## 2026-06-29 JST - Grok - Cartography hardening v1.7.2 / v1.7.3

### Summary

- v1.7.2: Python `validate_output_dir` / layout 出力を TS と統一、`test_cartography_path_utils.py`
- v1.7.3: `validateCartographyGeneratedImagePath` + `resolveAllowedImagePath` before copy、layout subprocess tracking

### Verification

- `npm run compile && npm test` 通過（v1.7.3 リリース時）

---

## 2026-06-28 JST - Antigravity - Phase 7 Cartography Verification & Release (v1.7.0)

### 変更概要

- ChatGPT、Claude、Grok による Phase 7 Cartography の統合テストおよび v1.7.0 リリース準備
- `world_forge.json` の x/y/biome、Mermaid pan/zoom、ComfyUI 羊皮紙地図、ピン overlay

### 検証

- `npm run compile` / `npm test` 通過
- `package.json` → `1.7.0`

---

## Archived History（2026-06-27 以前）

2026-06-27 01:30 JST 以降の詳細ログは **CP932 / Latin-1 混在により文字化け** しており、自動復元できませんでした。

- **削除せずアーカイブ扱い:** Git 履歴 `git log -- AI_SHARED_LOG.md` および各版タグの `CHANGELOG.md` を参照
- **正本:** 上記 Current Snapshot + `CHANGELOG.md` + `DEVELOPMENT_TIMELINE.md`（2026-06-29 書き直し）
- **再発防止:** 全 AI 向けドキュメントは UTF-8（BOM なし）で保存（`AI_COLLABORATION.md` 参照）