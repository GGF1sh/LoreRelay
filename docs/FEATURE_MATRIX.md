# Feature Matrix — Stable vs Experimental

> **正本:** `package.json` + [`VERSION_TRUTH.md`](VERSION_TRUTH.md) + `src/gameRules.ts` の `DEFAULT_GAME_RULES`  
> 初見向け。詳細履歴は [`CHANGELOG.md`](../CHANGELOG.md)。

## 現在の入口（1.89.2 ソース）

配布VSIXの機能は [VERSION_TRUTH.md](VERSION_TRUTH.md) で別に確認してください。以下は機能の入口であり、すべての組合せの実プレイ保証ではありません。

| 遊びたいこと | 入口・対応範囲 | 注意・手順 |
| --- | --- | --- |
| 世界を作って始める | Start Hub → **世界を作りはじめる** → 世界生成セットアップ → プレビュー → **この世界を使う** | 種類・シード・規模・つながり・言語・有効な仕組みを確認して採用。採用後に「主人公を作る」へ。GM接続は別に選ぶ |
| 保存した冒険を再開 | Start Hub → 続ける | プレイ用フォルダを開く。復元・Undoは既存のTimeline/checkpoint経路 |
| GMと話す | **LoreRelay: AI接続**、Parlor / In-World / Campaign | [接続・利用枠と確認範囲](AI_CONNECTIONS.md)。接続準備と応答成功を区別 |
| 買う・売る・市場へ移動・日送り | 共通の「行動」／Action Hub | Commerceを有効化。確定結果が所持金・在庫へ反映される。自由な描写だけでは取引確定にならない |
| 船と航路を選ぶ | ワールド → 航路・渡河 | [船・橋・渡し・移動拠点の停泊先](WATER_NAVIGATION.md)。市場移動は日送りと別操作 |
| 依頼と人物との関係 | クエスト／NPC Registry／Campaign Kit | 完了は受理された `resolvedQuests` などの状態更新による。依頼文の報酬ヒントだけで金品が自動支給される保証はない |
| イラスト地図を使う | 地図の画像取込・位置合わせ・主人公マーカー | [イラスト地図](ILLUSTRATED_MAPS.md)。画像とピン・地名は別レイヤー |
| 場面画像を作る・戻す | **この場面を絵にする** → プロンプト → 外部生成 → 画像取込・採用 | [場面画像](VISUAL_COMPOSER_V1.md)。表示専用。GM記憶・世界の正本へ自動反映しない |
| ローカルで画像生成 | 画像生成設定 → 用途テンプレート／キャラクターの立ち絵生成／ワールドの場所・地図生成 | [同梱workflow](../COMFYUI_WORKFLOWS.md)、[実機で確認した設定と保存先](COMFYUI_LOCAL_PLAYCHECK.md)。SDXL対応checkpoint、地図には対応ControlNetが必要 |
| 拠点・車両の外観や内装 | **この拠点を絵にする**／**この車両を絵にする** | [設計図・参考PNGと取込](STRUCTURE_ART.md)。絵に描かれた施設はゲーム上で増えない |
| 長い冒険を振り返る | Chronicle／Turn Inspector／リプレイ出力 | GMへ送った情報と予算内で省略された情報を確認。全記憶の無制限保持ではない |
| 戦闘を試す | コマンドでBattle Viewを開始 | 実験中。物語からの自動開始や単体アバター直接操作UIは未提供 |

以下は個別のルールと既定値です。新規世界では、選んだ生成オプションやシナリオが一部を有効化します。

| Feature | Default (`game_rules`) | Status | Notes |
|---------|------------------------|--------|-------|
| AI GM / GM Bridge | ON (settings) | **stable** | Grok, vscode-lm, Ollama, etc. |
| RPG mechanics (HP/MP) | ON | **stable** | `enableRpgMechanics` |
| World Forge | OFF | **beta** | Needs `world_forge.json` |
| Emergent Simulation | OFF | **beta** | Needs `world_state.json` |
| NPC Registry | OFF | **beta** | Needs `npc_registry.json` |
| Quest Board | with sim | **stable** | Event/NPC hooks |
| Git Timeline / checkpoints | ON | **stable** | Branch / rewind |
| Chronicle (`[Previously]`) | setting | **stable** | `chronicleCore` deterministic |
| Pacing Director | setting | **beta** | Prompt hint |
| Faction Reputation | OFF | **experimental** | `enableFactionReputation` |
| Travel Encounters | OFF | **experimental** | `enableTravelEncounters` |
| Cartography (FoW, map items) | optional | **beta** | ComfyUI optional |
| Replay Export | command | **stable** | Markdown / HTML |
| Remote Play | command | **beta** | LAN; signed media URLs |
| TTS / NPC Voice | setting | **beta** | Phase 11 |
| Agentic GM (2-stage) | OFF | **experimental** | Referee + Narrator |
| **Living World Commerce** | OFF | **experimental** | `enableCommerce` |
| **Commerce UI (Buy/Sell)** | OFF | **experimental** | `enableCommerceUi` |
| **NPC Agency** | OFF | **experimental** | `enableNpcAgency`, ≤10 NPCs |
| Trust-linked whereabouts | with agency | **experimental** | v1.27+ |
| Inspector market debug | debug | **dev only** | Commerce ON + debug console |
| **NPC Bonds (LW3)** | OFF | **experimental** | `enableNpcRelationships` |
| **Player bonds / trade ripple** | with LW3 | **experimental** | v1.32–1.33 · `playerBondCore` |
| **Domain Mode (lordship)** | OFF | **experimental** | v1.39.x + D3 UI (v1.40.0) · `enableDomainMode` |
| **Domain Audience (謁見)** | OFF | **experimental** | v1.40.0 · `enableDomainAudience` · World タブパネル済み |
| **Domain Rivals (隣国ライバル)** | OFF | **experimental** | v1.40.0 · `enableDomainRivals` · World タブパネル済み |
| **Domain Missions (主命・派遣)** | OFF | **experimental** | v1.40.0 · `enableDomainMissions` · World タブパネル済み |
| **Domain Mass Battle (合戦)** | OFF | **experimental** | v1.40.0 · `enableMassBattle` · World タブパネル済み |
| **Guild Master Mode** | OFF | **experimental** | v1.41.0 · `enableGuildMode` · weekly commit + World タブ |
| **Guild Requests (依頼板)** | OFF | **experimental** | v1.42.0 · `enableGuildRequests` · bulk / parley tier |
| **Guild Parties (派遣)** | OFF | **experimental** | v1.43.0 · `enableGuildParties` · Bond 連動クエスト判定 |
| **Guild Absence Drift** | with guild | **experimental** | v1.44.0 · hall 離脱/帰還 · Since-last-visit プロンプト |
| **Campaign Kit** | OFF | **beta** | v1.48.0 · sell_discovery + campaign quest reputation |
| **Discovery Ledger** | optional file | **beta** | v1.45.2 · `discoveries.json` + `discoveryOps` on turn apply |

## Quick demo paths

| Goal | Path |
|------|------|
| First play | Start Hub → 世界を作りはじめる → プレビュー → この世界を使う、または同梱シナリオ |
| 実機プレイ記録 | [1.89.3: 交易・移動・画像・保存再開](GAMEPLAY_PLAYCHECK.md)。AI操作。Grok新規会話は再ログイン待ちで未確認 |
| Living World | [`LIVING_WORLD_QUICKSTART.md`](LIVING_WORLD_QUICKSTART.md) + `sample-scenarios/trade-routes` |
| Scavenger / Campaign Kit | [`CAMPAIGN_KIT_QUICKSTART.md`](CAMPAIGN_KIT_QUICKSTART.md) + `sample-scenarios/scrapbound-settlement` |
| Map / FoW | Cartography + `lost-catacombs` or generated world |
| Long campaign | Chronicle + Git Timeline + Replay Export |

## Prompt budget (Gemini review note)

Living World + Chronicle + NPC blocks grow GM context. Mitigations today:

- `promptBudget` modes (`compact` / `balanced` / `expanded`)
- Turn Inspector shows budget breakdown
- `scripts/test_prompt_context_budget.js`

現在は優先度に基づくプロンプト予算内の省略・切詰めがあります。重要な制約は保持されますが、すべての詳細が毎ターン送られるわけではありません。Turn Inspectorで実際の送信情報を確認してください。
