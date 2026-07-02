# Living World — 5 Minute Quickstart

> **対象:** Commerce + NPC Agency + trade-routes デモを初めて触る人（と AI レビュアー）。  
> **正本仕様:** [`LIVING_WORLD_IMPLEMENTATION_SPEC.md`](LIVING_WORLD_IMPLEMENTATION_SPEC.md) · [`COMMERCE_AND_AGENCY_BRIEF.md`](COMMERCE_AND_AGENCY_BRIEF.md)

## 0. 前提

- LoreRelay 拡張が入っている（`package.json` 版は [`VERSION_TRUTH.md`](VERSION_TRUTH.md) 参照）
- ワークスペース: `sample-scenarios/trade-routes` をフォルダとして開く

## 1. Game Rules（30 秒）

Game Rules パネルで ON:

- Enable World Forge
- Enable Emergent Simulation
- Enable NPC Registry
- Enable Commerce
- **Enable Commerce UI**（Buy/Sell ボタン）
- Enable NPC Agency

`simIntervalTurns: 1` 推奨（デモは `game_rules.json` に既に近い設定あり）。

**Developer: Reload Window**

## 2. World タブ（1 分）

| パネル | 見るもの |
|--------|----------|
| **Caravan** | credits, food, cargo, **playerRole** |
| **Markets** | 現在地の商品価格；Commerce UI ON なら **Buy / Sell** |
| **NPC Whereabouts** | Elda / Marcus の位置（信頼度で精度が変わる） |

## 3. UI で売買（1 分）

1. `game_state` で現在地を `elda_shop` 等にする（GM ターンで移動でも可）
2. World → Markets → 小麦など **Buy** ×1
3. Caravan の credits / cargo が変わる（**GM ナレーション解析なし** — Core が `applyTradeOps`）

## 4. 世界を動かす（1 分）

- GM ターンを数回送る、または Inspector の **Advance World Simulation**
- Markets の price/stock が変わる
- 食料危機イベント後、NPC が安い小麦市場へ動くことがある（agency）

## 5. Since last visit（任意）

1. ある港を離れる（location 変更）
2. 数ターン / bulk sim
3. 同じ港に戻る → GM プロンプトに `[Living World — Since last visit]`（相場差分）

## 6. 信頼度と行方不明（1 分）

`npc_registry.json` の Elda `disposition.playerTrust` を編集:

| Trust | World タブ | GM whereabouts |
|-------|------------|----------------|
| 80 | 地点名 + reason | exact |
| 50 | 地域名 / 「〜方面へ」 | approximate |
| 20 | 行方不明 | unknown（payload に locationId なし v1.27.1+） |

手動チェック全文: [`testing_checklist.md`](../testing_checklist.md) §9b–9c。

## 7. GM プロンプトで確認

Turn Inspector プレビューに出るブロック例:

```
[Living World — Caravan]
Role: Merchant — Profit from regional price spreads; …
Credits: … | Food: … | Transport: …

[Living World — Markets]
…

[Living World — NPC whereabouts]
Elda: at …
```

Agentic モードでは `turn_result.tradeOps` / `npcAgencyOps` も利用可（UI 売買と同型 Core）。

## トラブルシュート

| 症状 | 確認 |
|------|------|
| Markets / Caravan が出ない | `enableCommerce` + `world_forge.json` + `world_state.json` |
| Buy/Sell がない | `enableCommerceUi` |
| NPC 一覧が空 | `enableNpcRegistry` + `enableNpcAgency` |
| 相場が動かない | `enableEmergentSimulation` + sim interval |

## 関連

- [`FEATURE_MATRIX.md`](FEATURE_MATRIX.md) — 機能の安定度一覧
- [`CODE_REVIEW_PROMPT_LIVING_WORLD.md`](CODE_REVIEW_PROMPT_LIVING_WORLD.md) — 他 AI 向けレビュー用