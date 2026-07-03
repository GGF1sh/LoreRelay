# バージョンの正本（AI・人間向け）

LoreRelay には **3 種類の「版」** があり、混同すると Web Grok / ChatGPT 等が「main は v1.6.1」と誤認します。

## 1. ソースの正本（いちばん信頼する）

| 確認先 | 意味 |
|--------|------|
| `package.json` の `version` | **現在のコード版** |
| `CHANGELOG.md` の先頭セクション（`[Unreleased]` の次） | **実装済み機能の正本** |
| `git log origin/main -1` | **公開 main の先頭コミット** |

**リポジトリ:** https://github.com/GGF1sh/LoreRelay  
**ローカル正本パス:** `C:\AI\text-adventure-vsce`（`C:\AI\LoreRelay` は古いクローンのことがある）

## 2. 配布の正本（VSIX・更新通知）

| 確認先 | 意味 |
|--------|------|
| [GitHub Releases](https://github.com/GGF1sh/LoreRelay/releases) | **ユーザーが `Check for Updates` で取る版** |
| タグ `v*` push | `.github/workflows/release.yml` が VSIX を添付（`package.json` と一致必須） |

**注意:** main の `package.json` が **1.34.0** でも、GitHub Release が古いタグのままなら「インストール済み拡張は古い」状態。コードは進んでいるが **配布は遅れている**。

## 3. 説明ドキュメント（履歴・スナップショット）

`README.md` Features 内の「(v1.3+)」、`WORLD_AND_VISUAL_MEMORY.md` の「v1.6.1 時点」、`README` 末尾 Roadmap の **世代表** などは **機能導入時のラベル** または **要約**。現行版の数字は `package.json` が正本。

| ドキュメント | 役割 |
|--------------|------|
| [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) | stable / experimental の初見向け一覧 |
| [`AI_ROADMAP.md`](../AI_ROADMAP.md) | タスク黒板（Phase 完了・次期トラック） |
| [`AI_SHARED_LOG.md`](../AI_SHARED_LOG.md) 先頭 **Current Snapshot** | AI 向け動的サマリ |

## AI 作業前の 30 秒チェック

```powershell
cd C:\AI\text-adventure-vsce
node -p "require('./package.json').version"
git fetch origin
git log origin/main --oneline -1
git tag -l "v*" | Sort-Object { [version]($_ -replace '^v','') } | Select-Object -Last 3
```

## ズレを直すときの優先順位

1. **タグ + Release** — `package.json` と一致する `vX.Y.Z` を push（配布を追いつかせる）
2. **Current Snapshot 更新** — `AI_SHARED_LOG.md`
3. **README バッジ + Roadmap** — `package.json` と同期
4. **キャッチアッププロンプト** — `VSCODE_CHATGPT_CATCHUP.md`
5. **履歴ドキュメント** — 版番号を「現行」と書き換えるのではなく、冒頭に「アーキテクチャ参考・現行は CHANGELOG」と注記

## 現行（手動更新: 2026-07-03）

| 項目 | 値 |
|------|-----|
| `package.json` | **1.41.0** |
| CHANGELOG 先頭 | **[1.41.0]** G1 Guild Master engine |
| Domain Mode | D1–D5 + **D3 UI 完了**（1.40.0）· F7 謁見 / F8 ライバル領主 / F9 主命・派遣 / F10 合戦リゾルバ、**全て engine + World タブ UI 済み** — `docs/DOMAIN_MODE_DESIGN.md` §12 · `docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md` §F7–§F10 |
| GitHub Release latest | **タグ push 次第** — `release.yml` で VSIX 生成 |
| Living World | v1.23–1.34（Commerce / Agency / LW3 / Parlor）+ Domain v1.39.x–1.40.0 |
| テスト | `npm test` **113/113**（webview UI は compile + i18n/HTML 検証のみ。**F5 実機確認は未実施**） |