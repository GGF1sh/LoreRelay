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
| タグ `v*` push | `.github/workflows/release.yml` が VSIX を添付 |

**注意:** main の `package.json` が **1.27.1** でも、Release が **v1.14.5** のままなら「インストール済み拡張は古い」状態。コードは進んでいるが **配布は遅れている**。

## 3. 説明ドキュメント（履歴・スナップショット）

`README.md` の「v1.6.2 で追加」、`WORLD_AND_VISUAL_MEMORY.md` の「v1.6.1 時点」などは **機能導入時のラベル** または **古いスナップショット**。現行版の代わりに使わない。

AI 向けの動的サマリ:

- `AI_SHARED_LOG.md` 先頭 **Current Snapshot**
- `AI_HANDOVER.md` §4（ただし版番号は本ファイルと `package.json` で上書き確認）

## AI 作業前の 30 秒チェック

```powershell
cd C:\AI\text-adventure-vsce
node -p "require('./package.json').version"
git fetch origin
git log origin/main --oneline -1
```

## ズレを直すときの優先順位

1. **タグ + Release** — `package.json` と一致する `vX.Y.Z` を push（配布を追いつかせる）
2. **Current Snapshot 更新** — `AI_SHARED_LOG.md`
3. **キャッチアッププロンプト** — `VSCODE_CHATGPT_CATCHUP.md`
4. **履歴ドキュメント** — 版番号を「現行」と書き換えるのではなく、冒頭に「アーキテクチャ参考・現行は CHANGELOG」と注記

## 現行（手動更新: 2026-07-02）

| 項目 | 値 |
|------|-----|
| `package.json` | **1.28.0** |
| main 先頭 | v1.28 doc/stability pass（LW 機能本体は v1.27.1 相当） |
| GitHub Release latest | **v1.14.5**（`v1.27.x` タグ未打ち — 配布遅れ） |
| Living World | v1.23〜1.27.1（Commerce UI, trust whereabouts, playerRole GM） |