# Commerce & NPC Agency — 設計ブリーフ（流用可能ワールド・キット）

> **ID:** Living World **LW1**（Commerce）+ **LW2**（NPC Agency）— Cartography C* / Roadmap Phase とは別軸。命名は `docs/PHASE_NAMING.md` を拡張予定。  
> **目的:** 貿易・輸送・名あり NPC の自律を **ON/OFF 可能なコアシステム** として設計し、LoreRelay 以外のゲームにも流用できる `*Core.ts` + JSON 契約にする。  
> **きっかけ:** LoreRelay 本体（GM UI・Cartography・世界シミュ・デバッグ）は一段落。次の「遊びの深み」は **港巡り / キャラバン / 太閤立志伝的な顔の見える駆け引き** 方向。  
> **設計の優先順位（2026-07 合意）:** **先に世界が動く** → その中で NPC がどう動くか。NPC 単体の「スケジューラ」より、**動く世界の結果として顔が見える** 方が面白い。  
> **推奨フロー:** 本ブリーフ → 設計 doc（Claude 等）→ セキュリティ/allowlist レビュー（必要時）→ Grok 実装。

---

## 0. 世界ファースト（World-first）

```
世界ターン +1
    → 派閥 resources / morale / region danger が変わる
    → 市場の相場・在庫が連動（Commerce）
    → イベントログ・地図 FB（recentChanges）が更新
    → その結果として名あり NPC が「次にどこへ行くか」が決まる（Agency）
    → GM はプレイヤーが触れた範囲だけ narration
```

| 順番 | レイヤー | 既存 |
|------|----------|------|
| **1** | **動く世界** | `emergentSimulator`（派閥 tick）、`world_state`、`mapFeedback` |
| **2** | **経済・需給** | LW1 Commerce（派閥・地域と相場を結ぶ） |
| **3** | **NPC の居場所** | LW2 Agency（世界イベントの **反応** として移動・Needs 更新） |

**LW2 単独で「NPC だけ動かす」は避ける。** 例: 食料危機イベント（既に `gmHint` あり）→ 南港の小麦高騰 → 商人 NPC が買い付けに向かう、という **因果の向き** を正とする。

太閤立志伝的な「会いに行かないと話せない」は、**世界が回ったあと** の NPC 位置として現れると、ただのテレポート SCHEDULER より説得力が出る。

---

## 0.5 北極星（原体験）

本ブリーフの憧憬の源泉。これらが共通して示す体験：**自分が中心ではない、勝手に生きている世界に、選んだ役割で参加する**。

| 作品 | 年代 | 提供する体験 |
|------|------|-----------|
| **ガンパレード・マーチ** | 2000 | 共生システム。プレイヤー不在で世界が動く。仲間同士の恋愛・死・変化は他人事で、自分は一人でしかない |
| **太閤立志伝シリーズ** | 1993- | ロール選択（家臣・商人・忍者）で「なぜ動くか」が変わる。顔の見える駆け引き（≤10名ありNPC） |
| **巡り廻る** | 2010s | 世界に**住む**手触り。冒険ではなく「その世界で食っていく生活」。日常の中に冒険がある |
| **Meine Reise** (DLSite) | 2010s | **職業選択**（冒険者・家臣・王・鍛冶屋等）で同じ世界を違う視点で体験。集約シム（派閥成長・店の改善）と名ありNPC（≤登録キャラ）が2層で動く。「探索中もどこかで誰かが商売、小国が大国に、鍛冶屋が腕を上げて良い装備を並べる」 |

**設計上の示唆**：本ブリーフの 10 人制限・2層シム・playerRole の根拠がここにある。

---

## 1. ビジョン（なぜ今やるか）

| 憧れ | コア体験 | LoreRelay 既存との接続 |
|------|----------|------------------------|
| 大航海時代 | 港を巡り、相場差で儲ける | Cartography、Layer B 時間経過、`location` |
| X:Universe | 星系間の需給・輸送 | `world_forge` リージョン、`world_state` 派閥 resources |
| ポストアポカ | キャラバン・コンボイ | テーマ別 `transportKinds`（見た目だけ差し替え） |
| 太閤立志伝 | **十人程度の名あり NPC** が動き、会う/会わないが効く | `npc_registry`、信頼・Needs、Emergent Sim |

**方針:** 数百 NPC やフル経済シミュは Non-Goal。最初は **商品 3〜5・市場 3〜5・名あり NPC ≤10** で「ループが回る」ことを証明する。

---

## 2. 流用アーキテクチャ（他ゲームにも載せる）

### 2.0 2層シム設計

**Meine Reise に学ぶ構造**：世界が「生きてる」と感じるのは、実は**2つの層が独立して動く**ことから。

| 層 | 責務 | スケール | コスト | 例 |
|----|------|---------|--------|-----|
| **Tier 1: 集約シム（安い）** | 派閥成長・相場・店の在庫改善。決定論Core。LLM不要 | 3~5市場、複数派閥 | CPU+ストレージ（ほぼゼロ） | 「鍛冶屋が日々腕を上げ、良い装備が店に並ぶ」は**個別NPC追跡ではなく**市場在庫の改善として出す |
| **Tier 2: 名ありNPC（濃い）** | ≤10名ありキャラの位置・信頼・Needs。GM がこれを目撃・ナラティブ化 | ≤10 | GM narration（既存） | 商人「エルダ」が南港に到着、手紙をくれた、信頼が上がった |

**結果**：「プレイヤーが探索中もどこかで世界が動いてる」感覚は Tier 1 で安く出し、「あの人どこ？何やってるの？」という個人的な興味は Tier 2 で濃くする。Meine Reise の「お気に入り登録」= Tier 2 の≤10人制限の根拠。

### 2.1 アーキテクチャ図

```
┌────────────────────────────────────────────────────────────┐
│  @lorerelay/world-kit（将来の npm / モノレポ候補）           │
│  commerceCore.ts    … 相場・売買・積載量（vscode なし）     │
│  npcAgencyCore.ts   … 位置・予定・簡易 agenda（vscode なし）│
│  transportCore.ts   … 移動日数・消費（テーマ非依存の計算）    │
└───────────────────────────┬────────────────────────────────┘
                            │ JSON 契約
┌───────────────────────────▼────────────────────────────────┐
│  world_forge.json  … 商品・市場・輸送種別（テーマ別表示名）  │
│  world_state.json  … 各地在庫・価格指数・npcPositions       │
│  game_state.json   … credits/cargo（Commerce ON 時のみ）    │
│  turn_result.json  … tradeOps / npcAgencyOps / elapsed…    │
└───────────────────────────┬────────────────────────────────┘
                            │ Runner（ホスト固有）
┌───────────────────────────▼────────────────────────────────┐
│  LoreRelay extension … statePatch 適用・GM プロンプト注入   │
│  （将来）Unity / Web / 卓上補助 … 同じ Core + 別 Runner    │
└────────────────────────────────────────────────────────────┘
```

**原則**

1. **Core は純関数 + 型** — `cartographyRevealCore` / `worldSimBulkCore` と同型。
2. **GM/LLM は narration 専任** — 価格・在庫・NPC 座標は拡張が決定論。誤検知の narration 解析は Non-Goal。
3. **世界観はデータ** — 馬車・帆船・荷台クリーチャーは `transportKinds` の表示名差し替え。計算式は共通。
4. **デバッグファースト** — `debug-sandbox` から相場・NPC 位置をいじれる（既存デバッグコンソール拡張）。

---

## 3. Game Rules（ON/OFF）

`game_rules.json` に追加（既定 **OFF** — 物語専用シナリオは現状維持）。

| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableCommerce` | `false` | 数値経済・売買・cargo。OFF 時は `status.funds` テキストのみ |
| `enableNpcAgency` | `false` | 名あり NPC の位置・予定が `worldTurn` で更新。OFF 時は `locationId` 固定 |
| `enableStructuredCargo` | `false` | （任意）`status.inventory` string[] から `game_state.cargo[]` へ段階移行 |

**依存関係（推奨）**

- Commerce → `enableWorldForge` + （推奨）`enableEmergentSimulation`
- Npc Agency → `enableNpcRegistry` + （推奨）`enableEmergentSimulation`
- 両方 ON でも可。片方だけ ON でも可。

Webview ⚙️ Game Rules パネルにチェックボックス追加（既存パターン踏襲）。

---

## 4. LW1 — Commerce（貿易・輸送）

### 4.1 プレイヤー体験

- 各市場（`location` または `region`）で **買う / 売る**。
- **移動**（Layer B・旅）で日数と輸送コスト（食料・燃料・耐久）がかかる。
- テーマで輸送の見た目が変わる（馬車・船・キャラバン・貨物船）。

**Tier 1（集約シムの実感例）**：月余りぶりに南港に戻ったら、前は品切れだった鋼がずらり並んでいた — これは個別NPCではなく、市場の「在庫改善tick」が見える化した結果。同じ仕組みで「派閥がこの1ヶ月で勢力を広げた」なら相場も変わってる。世界が動いてたんだ、という手応え。

### 4.2 データ（案）

**world_forge 拡張（任意ブロック）**

```json
{
  "commerce": {
    "commodities": [
      { "id": "wheat", "name": "小麦", "basePrice": 10, "weight": 1 }
    ],
    "markets": [
      { "locationId": "elda_shop", "commodityIds": ["wheat"], "supplyBias": 1.2 }
    ],
    "transportKinds": [
      { "id": "wagon", "name": "馬車", "capacity": 20, "speed": 1, "themes": ["fantasy"] }
    ]
  }
}
```

**world_state 拡張**

```json
{
  "markets": {
    "elda_shop": { "wheat": { "stock": 40, "priceIndex": 1.0 } }
  }
}
```

**game_state 拡張（Commerce ON 時）**

```json
{
  "commerce": {
    "credits": 500,
    "cargo": [{ "commodityId": "wheat", "qty": 5 }],
    "transportId": "wagon"
  }
}
```

### 4.3 turn_result チャネル（案）

```json
{
  "tradeOps": [
    { "op": "buy", "marketLocationId": "elda_shop", "commodityId": "wheat", "qty": 10 },
    { "op": "sell", "marketLocationId": "south_port", "commodityId": "wheat", "qty": 10 }
  ]
}
```

- 拡張が検証・価格計算・在庫更新・`credits` 更新。
- GM は同ターンの narration で「交渉の様子」を書く（結果の数値は書き換えない）。

### 4.4 テーマ別輸送（見た目）

| theme | transportKinds 例 | UI 文言例 |
|-------|-------------------|-----------|
| fantasy | wagon, sailing_ship | 馬車・帆船 |
| post-apocalyptic | beast_cart, convoy_truck | 荷台クリーチャー・コンボイ |
| scifi | cargo_shuttle, freighter | 輸送艇・貨物船 |
| oriental / sengoku | palanquin, river_boat | 駕籠・河船（太閤寄りは Commerce 薄めでも可） |

### 4.5 v0 スコープ（最初のマイルストーン）

- [ ] 商品 **3**・市場 **3**・売買のみ
- [ ] `credits` + `cargo`（重量上限 1 種の輸送）
- [ ] `tradeOps` パース + 単体テスト
- [ ] World タブに簡易相場表（または Inspector）
- [ ] デバッグコマンド: 「小麦相場を2倍に」

### 4.6 Non-Goals（LW1 v0）

- 動的 AI 商人の自由交渉（数値は Core、セリフは GM）
- 何百品目の完全シミュ
- narration キーワードだけの自動売買

---

## 5. LW2 — NPC Agency（動く世界への **反応**）

> **前提:** LW0/LW1 で世界・市場が動いていること。Agency は **第 2 層**。

### 5.1 プレイヤー体験（太閤寄り）

- **十人程度**の registry 登録 NPC が、**世界イベント・派閥変動・相場** に反応して別の場所にいることがある。
- 会いに行かないと情報・クエスト・売買が発生しない。
- 信頼・Needs と連動（「南港に向かう」と聞いている、など）。
- 移動の **理由** は `world_state` のイベント / Commerce 変動から導出（独立ランダム歩行は v0 Non-Goal）。

**例（Tier 2 の濃さ）**：商人「エルダ」が小麦危機（世界イベント）を聞いて南港に買い付けに。月後、彼女は別の商人「マルクス」と顔見知りになっていて、手紙をくれた。そのマルクスは実は鍛冶屋で、良い鋼が入った時に優先的に売ってくれる（Tier 1 の在庫改善と Tier 2 のNPC関係が絡む）。

### 5.2 データ（案）

**npc_registry** — 既存 `locationId` は「初期位置」。Agency ON 時は `world_state` が正。

**world_state 拡張**

```json
{
  "npcPositions": {
    "npc_elda": {
      "locationId": "elda_shop",
      "arrivesTurn": 12,
      "agenda": "restock_wheat"
    }
  }
}
```

### 5.3 更新経路（世界ファースト）

| 経路 | 用途 | 優先 |
|------|------|------|
| **Emergent Sim + 世界イベント** | 派閥食料危機 → 商人が買い付け location へ、等 | **主** |
| **Commerce 変動** | 相場差 → `material` Need 充足のため移動 | **主** |
| `turn_result.npcAgencyOps` | GM が例外・物語的確定（世界と矛盾しない範囲） | 補 |
| デバッグサンドボックス | QA 用の手動配置 | 補 |

独立した「3ターンごとにランダム移動」は **Non-Goal**（世界と無関係なテレポートに見えるため）。

### 5.4 turn_result チャネル（案）

```json
{
  "npcAgencyOps": [
    { "npcId": "npc_elda", "locationId": "south_port", "arrivesTurn": 15 }
  ]
}
```

### 5.5 v0 スコープ

- [ ] 上限 **10** NPC（registry キー数でクランプ）
- [ ] 位置の読み書き + GM プロンプト「誰がどこにいるか」1 ブロック
- [ ] 1 種類の自動移動ルール（例: agenda に従い N ターン後に到着）
- [ ] Cartography / World タブで「知人のおおよその場所」（信頼閾値で詳細度変化は v1+）

### 5.6 Non-Goals（LW2 v0）

- 百人規模のシム
- フル日程スケジューラ（CRPG レベル）
- **NPC 同士の自動会話生成・関係の自動更新**（GM narration に任せる）

**注記：北極星と v0 の差異**  
§0.5 で挙げたガンパレード・マーチの北極星「仲間同士で勝手に関係が変わる」は、LW2 v0 の割り切り（位置・Needs のみ）では到達しない。これは **v0+ で世界データ駆動の関係変化** として再検討すべき future arc。エルダとマルクスが「手紙で信頼が上がった」は GM が見守って narrate する形で、自動生成ではなく世界シムの「出来事」を拾う設計に留める。

> **🆕 LW3 着手（2026-07-02, Opus 4.8）:** この future arc の第一歩を実装。`src/npcRelationshipCore.ts`（決定論・純関数、テスト26件）で、名ありNPC同士が **同席／共通の危機／派閥対立** といった世界データから affinity を変える。会話の自動生成はせず、変化を GM が伝聞で語る（黄金律維持）。ホスト配線は `docs/LIVING_WORLD_LW3_RELATIONSHIPS.md`。エルダ×マルクスが elda_shop 同席で「友好」になるのがデモ想定。

---

## 6. 既存システムとの統合

| 既存 | 統合方針 |
|------|----------|
| Cartography C8/C9 | 市場は `location` ピン。噂で未訪港の相場ヒント（C9 `rumor` と親和） |
| Layer B `elapsedWorldTurns` | 旅の日数 = 輸送時間 + 世界シミュ N ステップ |
| Emergent Simulation | **主軸。** 派閥・地域 tick → 市場・NPC 反応の入力（既存 `gmHint` を拡張） |
| `npc_registry` Needs | 世界変動後の **反応** — `material` Need → 買い付け先 location |
| Agentic GM | `tradeOps` / `npcAgencyOps` を Referee passthrough（C9 `cartographyReveal` 同型） |
| debug-sandbox | 相場・NPC 位置・cargo のデバッグコマンド追加 |

---

## 7. 設計 doc で決めるべき問い（次の Claude プロンプト用）

### Commerce

1. **市場の粒度** — `location` のみか `region` もか。
2. **価格式** — `basePrice × priceIndex × supplyBias` で足りるか。シム連動はいつ入れるか。
3. **`tradeOps` vs `statePatch`** — 専用チャネル（C9 案 D 同型）を採用するか。
4. **cargo と inventory** — 共存期間とマイグレーション。
5. **輸送** — 移動 1 回あたりの `consumption` 定義（食料・燃料の有無）。
6. **playerRole（新）** — v0 では 1 ロール（例：交易商人）でいいか。将来 `game_rules.playerRole` で職業選択（太閤型）を想定し、ロール別に交易の動機を変える余地を持つアーキか（§0.5 参照）。

### NPC Agency

1. **正本** — `npc_registry.locationId` vs `world_state.npcPositions` の優先順位。
2. **自動移動** — シムだけか、GM ops 必須か、ハイブリッドか。
3. **プレイヤーへの情報** — 常に正確な位置か、噂精度か（信頼連動）。
4. **上限とパフォーマンス** — 10 人固定か、設定可能か。

### 共通

1. **パッケージ切り出し** — `packages/world-kit/` を今作るか、実装後に切るか。
2. **サンプルシナリオ** — `sample-scenarios/trade-routes`（仮）を同梱するか。
3. **テーマ × 主軸レイヤー（新）** — 大航海・X は LW1(Commerce) 主役、太閤・ポストアポカは LW2(Agency) 主役。v0 で複数テーマ対応させるか、単一テーマでいくか。

---

## 8. 実装フェーズ案（PR 粒度・世界ファースト順）

| PR | 内容 | 依存 |
|----|------|------|
| **LW0** | 本ブリーフ + `game_rules` フラグ（未実装スタブ）+ 命名 `PHASE_NAMING` 1 行 | — |
| **LW-W1** | **動く世界の深化** — region 危険度 tick、イベント→市場/地図 FB の見える化、GM プロンプト「Since last visit」強化 | LW0 |
| **LW1-PR1** | `commerceCore.ts` + 相場が **派閥/region イベント** に連動 | LW-W1 |
| **LW1-PR2** | `tradeOps` + UI + デバッグ相場操作 | PR1 |
| **LW1-PR3** | `transportCore` + Layer B 連動 + テーマ別 forge サンプル | PR2 |
| **LW2-PR1** | `npcAgencyCore.ts` — **世界/Commerce イベントの反応** で `npcPositions` 更新 | LW1-PR1 推奨 |
| **LW2-PR2** | プロンプト「誰がどこにいるか（理由付き）」+ デバッグ | PR1 |
| **LW-DEMO** | 同梱シナリオ — 数ターン放置で世界が変わり、NPC が追いついてくるデモ | LW-W1+ |

---

## 9. LoreRelay「次に何するか」が空いたときの推奨順

Cartography・Agentic GM・デバッグ・Layer B v1 まで到達済みのため、**本体 polish だけでは伸びしろが薄い** フェーズ。

**おすすめの主軸（世界ファースト）:**

1. **LW-W1（動く世界の深化）** — 既存 `emergentSimulator` をプレイヤーが **体感的に** わかる層に。地図 FB・Inspector・GM 1 ブロック。ここが土台。
2. **LW1 v0（三港三商品）** — 世界 tick と相場を結ぶ。大航海/X の「世界が回ってから儲ける」。
3. **LW2 v0（十人の反応）** — 上記の **結果** として NPC が動く。太閤感はここで初めて効く。
4. **world-kit 切り出し** — LW-W1 か LW1-PR1 のあと。

**並行でよい polish（主軸を阻害しない）:**

- README スクショ、hazard プロンプト 1 行、戦術マップは別トラックのまま据え置き。

---

## 10. 関連ドキュメント

| ファイル | 内容 |
|----------|------|
| `WORLD_SYSTEM_DESIGN.md` | 世界シミュ・派閥 resources |
| `docs/WORLD_TIME_PASSAGE_IDEA.md` | 旅・休息（輸送時間と結合） |
| `docs/CARTOGRAPHY_C9_DESIGN.md` | 専用 turn_result チャネルの先例 |
| `docs/PHASE_NAMING.md` | LW1/LW2 命名を追記予定 |
| `sample-scenarios/debug-sandbox/DEBUG_SANDBOX.md` | デバッグ拡張の足場 |

---

## 11. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-07-02 | 初版骨子（貿易・NPC・ON/OFF・流用・太閤/大航海/X） |
| 2026-07-02 | §0 世界ファースト — 先に世界が動き、NPC はその反応。推奨順を LW-W1 → LW1 → LW2 に変更 |
| 2026-07-02 | 原体験統合（Meine Reise, ガンパレード・マーチ, 巡り廻る）— §0.5 北極星追加。2層シム設計（§2.0）を明記。鍛冶屋例を§4/5に追加。§7 に playerRole・テーマ×主軸を設計問いに追加。§5.6 に v0 と北極星の差異を注記。 |
| 2026-07-02 | **`C:\AI\lorerelay-world-kit`** — Commerce / Transport / Tier-1 sim / NPC Agency / GM prompt cores を別パッケージ化（v0.1.0, tests 5/5）。LoreRelay 本体への配線は LW-W1 以降。 |