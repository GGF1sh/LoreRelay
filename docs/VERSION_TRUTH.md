# バージョンの正本（AI・人間向け）

LoreRelay には **3 種類の「版」** があり、混同すると Web Grok / ChatGPT 等が「main は v1.6.1」と誤認します。

## 1. ソースの正本（いちばん信頼する）

| 確認先 | 意味 |
|--------|------|
| `package.json` の `version` | **現在のコード版** |
| `CHANGELOG.md` の先頭セクション（`[Unreleased]` の次） | **実装済み機能の正本** |
| `git log origin/main -1` | **公開 main の先頭コミット** |

**リポジトリ:** https://github.com/GGF1sh/LoreRelay  
**ローカル正本パス:** `C:\AI\text-adventure-vsce`（`C:\AI\LoreRelay` は別クローンのことがある）

## 2. 配布の正本（VSIX・更新通知）

| 確認先 | 意味 |
|--------|------|
| [GitHub Releases](https://github.com/GGF1sh/LoreRelay/releases) | **ユーザーが `Check for Updates` で取る版** |
| タグ `v*` push | `.github/workflows/release.yml` が VSIX を生成（`package.json` と一致必須） |

**注意:** main の `package.json` が進んでいても、GitHub Release が古いタグのままなら「インストール済み拡張は古い」状態。コードは進んでいるが **配布が遅れている**。

## 3. 説明ドキュメント（履歴・スナップショット）

`README.md` Features 内の「v1.3+)」、`WORLD_AND_VISUAL_MEMORY.md` の「v1.6.1 時点」、`README` 末尾 Roadmap の **世代表** などは **機能導入時のラベル** または **参考**。現行版の数値は `package.json` が正本。

| ドキュメント | 役割 |
|--------------|------|
| [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) | stable / experimental の区分一覧 |
| [`AI_ROADMAP.md`](../AI_ROADMAP.md) | タスク粒度・Phase 完了・次候補トラック |
| [`AI_SHARED_LOG.md`](../AI_SHARED_LOG.md) 先頭 **Current Snapshot** | AI 向け動的サマリ |

## AI 作業前の 30 秒チェック

```powershell
cd C:\AI\text-adventure-vsce
node -p "require('./package.json').version"
node scripts/check_version_consistency.js
git fetch origin
git log origin/main --oneline -1
git tag -l "v*" | Sort-Object { [version]($_ -replace '^v','') } | Select-Object -Last 3
```

## ズレを直すときの優先順位

1. **タグ + Release** — `package.json` と一致する `vX.Y.Z` を push（順序を追いつかせる）
2. **Current Snapshot 更新** — `AI_SHARED_LOG.md`
3. **README バッジ + Roadmap** — `package.json` と同期
4. **キャッチアッププロンプト** — `VSCODE_CHATGPT_CATCHUP.md`
5. **履歴ドキュメント** — 版番号を「最新」と書き換えるのではなく、先頭に「アーキテクチャ参考・現行は CHANGELOG」と注記

## 現行（手動更新: 2026-07-04）

| 項目 | 値 |
|------|-----|
| `package.json` | **1.77.15** |
| CHANGELOG 先頭 | **[1.77.15]** Debug Trace retention + coalesce + live run |
| Campaign Kit | Phase A–G · 7 genre presets · sell_discovery · services state machine (condition/estValue) · **campaign resources** (campaignResourceOps) · factionId on campaign quests · `scrapbound-settlement` sample |
| Living World (LW1) | Commerce: 評判連動 market demand (v1.51.0) · 季節/region イベント連動 · **プレイヤー関係連動** (faction-controlled markets) |
| World Observatory | 新規 (v1.53.0): 市場価格履歴スパークライン・年代記タイムライン・観測者ティック (watch=無コスト / advance=資源消費)。`enableWorldObservatory` 既定 OFF |
| Domain Mode | D1–D5 + **D3 UI 完了** (v1.40.0) · F7–F10 engine + World タブ UI · v1.40.1 hardening |
| Guild Master (F11) | **G1–G4 完了** (v1.41.0–v1.44.1) · v1.44.1 hardening · `enableGuildMode` 既定 OFF |
| Parlor Mode | v1.34.0 出荷済 |
| Living World (履歴) | v1.23–v1.34 (Commerce / Agency / LW3) · Domain v1.39.x–v1.40.x |
| Debug Trace | P1 contracts (v1.77.14) · **retention/coalesce/live run** (v1.77.15) · Inspector UI Phase B + UX polish |
| GitHub Release latest | **v1.59.0** (`lorerelay-1.59.0.vsix` · タグ push で自動更新) ※コード版より遅れることがある |
| テスト | `npm test` **209/209**（`check_version_consistency.js` 含む · simulation batch は二重実行なし） |
