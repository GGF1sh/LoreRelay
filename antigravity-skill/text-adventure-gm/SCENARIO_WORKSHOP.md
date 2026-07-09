# Scenario Workshop Distribution (`text-adventure-workshop/1.0`)

Steam Workshop / Booth / Gumroad 風にシナリオパックを配布するための形式です。
ベース仕様は [`SCENARIO_PACK.md`](SCENARIO_PACK.md)（`text-adventure-scenario/1.0`）の上に `workshop.json` メタデータを載せます。

## フォルダ構成（配布用）

```
my-adventure-pack/
  scenario.json       # 必須（SCENARIO_PACK.md 準拠）
  workshop.json       # 推奨（配布メタ・自動生成可）
  cover.png           # 任意（ストアサムネ）
  SKILL.addon.md      # 任意（シナリオ固有 GM ルール）
  lorebook.json       # 任意（World Info）
  characters/         # 任意（ST カード import 済み）
  bgm.json + bgm/     # 任意
  sfx.json + sfx/     # 任意
```

## `workshop.json` スキーマ

| フィールド | 必須 | 説明 |
|:---|:---:|:---|
| `format` | ✓ | `"text-adventure-workshop/1.0"` |
| `scenarioFile` | ✓ | 通常 `"scenario.json"` |
| `engineVersion` | ✓ | 対応 Text Adventure Engine 版（例 `"0.2.9"`） |
| `title` | ✓ | 表示名（`meta.title` と同期推奨） |
| `author` | | 作者 |
| `version` | | パック版 |
| `description` | | ストア説明文 |
| `tags` | | 検索タグ配列 |
| `license` | | 例 `CC-BY-4.0`, `All Rights Reserved` |
| `homepage` | | 作品ページ URL |
| `packagedAt` | | ISO8601（エクスポート時に自動付与） |

## VSCode コマンド

| コマンド | 用途 |
|:---|:---|
| **Text Adventure: Validate Scenario Pack** | `scenario.json` の必須フィールド検証 |
| **Text Adventure: Export Scenario Pack (Workshop ZIP)** | 検証 → `workshop.json` 自動生成 → ZIP 出力 |
| **Text Adventure: Load Scenario Pack** | プレイ用読み込み（従来どおり） |

## CLI（ZIP 作成）

```bash
python text-adventure-vsce/scripts/package_scenario.py --dir ./my-adventure-pack --out ./my-adventure-pack.zip
```

## 配布チェックリスト

- [ ] `scenario.json` の `format` が `text-adventure-scenario/1.0`
- [ ] `opening.narrative` と `setup.world` が記入済み
- [ ] `setup.gameOver` で死亡ルールを明示（strict / permissive / story）
- [ ] 画像・音源のライセンスを `workshop.json` または README に記載
- [ ] R-18 コンテンツは公開リポジトリに含めず別 ZIP で配布

## サンプル `workshop.json`

```json
{
  "format": "text-adventure-workshop/1.0",
  "scenarioFile": "scenario.json",
  "engineVersion": "0.2.9",
  "title": "忘れられた地下聖堂",
  "author": "Your Name",
  "version": "1.0.0",
  "description": "王道ダンジョン探索シナリオ。",
  "tags": ["fantasy", "dungeon", "solo"],
  "license": "CC-BY-4.0",
  "homepage": "https://example.com/my-pack"
}
```