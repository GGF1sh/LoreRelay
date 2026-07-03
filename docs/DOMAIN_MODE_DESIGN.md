# Domain Mode — 領地運営レイヤー設計（Lordship / Fief Management）

> **ID:** **D1–D5**（Domain サブトラック）— Living World（LW*）・Fable5（F*）・Cartography（C*）とは別軸。命名は `docs/PHASE_NAMING.md` を参照。  
> **Status:** **設計 v2（レビュー反映）** — v1.38.0 時点 · Claude レビュー 2026-07-03 反映
> **対象読者:** 実装担当（Grok / Codex / Claude Code）· レビュー（ChatGPT / Gemini）· 次セッション AI  
> **前提ドキュメント:** `docs/COMMERCE_AND_AGENCY_BRIEF.md` · `docs/WORLD_TIME_PASSAGE_IDEA.md` §C · `docs/PARLOR_MODE_DESIGN.md` · `WORLD_SYSTEM_DESIGN.md`  
> **一行:** LoreRelay の既存ワールド資産の上に、**任意 ON の領主プレイ層**を載せる。数値は骨格・イベント確率、物語は AI GM。太閤立志伝 **II 程度**の軽さで始め、ガチ SLG にはしない。

---

## 0. 現状スナップショット（2026-07-03）

### 0.1 すでにある材料（Domain の土台）

| 領域 | 実体 | Domain との関係 |
|------|------|-----------------|
| World Forge | 国・`regions`・`locations`・`factions` | `controlledRegionId` の正本 |
| World State | `worldTurn`・派閥・`recentChanges`・市場 | 隣国情勢・月次 tick の入力 |
| NPC Registry | 名あり NPC ≤10 | 家臣・商人・使者の候補 |
| LW3 Bonds | `npcRelationshipCore` · `playerBondCore` · `npcLifeEventsCore` | 家臣忠誠・離反マイルストーン（**D5 は別 loyalty テーブルにしない**） |
| Faction Reputation | `factionReputationCore` | 隣国・商会・宗教との関係 |
| Since-last-visit | `livingWorldBridge` · `buildSinceLastVisitLines` | 留守中の領地変化報告（§9.1） |
| Commerce (LW1) | `commerce` / `tradeOps` | 領地 `commerce` stat → 月次収支・市場への軽い接続 |
| Travel / Layer B | `elapsedWorldTurns` · `planTravel` | **月次コミット**の時間軸 |
| Chronicle | `chronicleCore` | 「◯年春、領主は農地開発を命じた」 |
| Narrative Time | `[Narrative Time — Three Clocks]` | 会話多・日数少 / 旅は少数 Exchange で多数日 |
| Experience | `campaign` · `parlor` · `inworld` | Domain は **Campaign 専用**（In-World は参照のみ） |
| `playerRole: ruler` | `livingWorldPlayerRoleCore.ts` | **動機1行のみ** — Domain の本実装先 |

### 0.2 まだ無いもの（本 doc で設計する）

- `game_state.domain` スキーマと validate
- `domainCore.ts`（純関数: 月次行動 resolve・イベント重み・clamp）
- `turn_result.domainOps` チャネル（`tradeOps` 同型）
- GM プロンプト `[Domain — …]` ブロック
- World タブ「領地」パネル
- `game_rules.enableDomainMode`（既定 **false**）

---

## 1. ビジョンと北極星

### 1.1 提供する体験

| 体験 | 説明 |
|------|------|
| **領主として振る舞う** | 「今月は農地開発と治安維持。隣国の噂も集めたい」→ 数値・年表・GM narration が連動 |
| **世界に住む** | In-World Chat で家臣・商人と領地情勢を語る（状態は変えない） |
| **AI GM と SLG の中間** | 盤面操作ではなく **会話で方針を述べ、Core が機械確定** |

### 1.2 北極星（参照作品）

| 作品 | 取り入れるもの | **取り入れない**もの |
|------|----------------|---------------------|
| 太閤立志伝 II | 月次行動2つ・領地ステータス少数・家臣少数 | 全国統一シム・大量イベント |
| D&D 領地運営 | 治安・民忠・収入のトレードオフ | フル kingdom management ルールブック |
| Meine Reise / 巡り廻る | 職業（`ruler`）で同じ世界を違う視点で | フル生活シム |

**スコープ上限（v1）:** 領地 **1つ**（`controlledRegionId` 1件）。複数領地・継承・王位継承は Non-Goal。

### 1.3 設計の黄金律（LW と同型）

1. **数値・在庫・イベント抽選は決定論 Core** — `domainCore.ts`（vscode/fs なし）
2. **GM/LLM は narration 専任** — narration からの月次行動自動パースは Non-Goal（v1）
3. **明示コミットで時間が進む** — 会話の Exchange 数 ≠ 経過月数（`WORLD_TIME_PASSAGE_IDEA.md` §C 準拠）
4. **面白さの重心は stat 育成ではなくイベント連鎖** — 数値はイベント重み用。プレイヤーが体感するのは物語（§1.4）

### 1.4 設計リスクと対策（Claude レビュー 2026-07-03）

| リスク | 内容 | 対策 |
|--------|------|------|
| **乾いた表計算** | 月2行動 × +2〜+3 だと stat 100 到達に 15〜25 ヶ月。1領地のみだと「薄い資源ティック」化 | **イベント連鎖を主役** — `applyDomainEventEffect` + 月次収入 + GM event hint **✅ v1.39.1** |
| **バランス未検証** | UI 前に「数値が生きてるか」分からない | `domain_balance_harness.js` + **`test_domain_balance_core.js`** **✅ v1.39.1** |
| **二重帳簿** | `treasury` vs `commerce.credits` | `domainLedgerCore.ts` + GM `DOMAIN_LEDGER_PROMPT_LINE` **✅ v1.39.1** |
| **プロンプト肥大** | Domain + LW + Commerce + Bonds 同時注入 | D2 **3段 tier**（minimal/standard/full）+ ledger/event 行は commit 時のみ **✅ v1.39.1** |

---

## 2. 体験モードとの住み分け

| モード | Domain の扱い |
|--------|---------------|
| **Campaign + `enableDomainMode`** | `domainOps` で領地更新可。月次コミットで World Day 進行 |
| **In-World Chat** | `game_state.domain` を **参照のみ** 注入。`domainOps` / `statePatch` 禁止（In-World 既存契約と同じ） |
| **Parlor** | Domain 非表示・非読込 |

```
入口の軽さ（維持）:
  Parlor → 簡易チャット
  Campaign → AI GM
  In-World → 世界内雑談

濃い人だけ ON:
  Living World · Commerce · NPC Agency · Domain Mode
```

---

## 3. 三層時計との接続

Domain の **「月」** は World Day の **明示コミット** として扱う。

| 操作 | Exchange | Narrative Time | World Day / Domain |
|------|----------|----------------|-------------------|
| 家臣と長話（同月） | 多い | 分〜時 | **0**（`elapsedWorldTurns=0`） |
| 「今月の方針を決める」 | 1〜数 | 月次会議 | **`domainOps` + `elapsedWorldTurns: domainMonthDays`** |
| 旅・戦役キャンペーン | 通常 | モンタージュ | 既存 Layer B（旅日数）と併用可 |

### 3.1 月次コミット契約（推奨）

プレイヤーが月次方針を送り、GM が `turn_result` で確定:

```json
{
  "elapsedWorldTurns": 30,
  "domainOps": {
    "kind": "monthly_commit",
    "actions": ["agriculture", "public_order"],
    "intelligence": "gather_rumors"
  }
}
```

- `elapsedWorldTurns`: 1 ヶ月 = **30 World Day**（設定可能・既定 30）。`worldSimPersist` 既存経路で市場・NPC も進む。
- `domainOps` は Core がパース・適用。GM は結果を narration のみ。

**会話中に月が勝手に進まない** — `[Narrative Time — Three Clocks]` と矛盾しない。

---

## 4. アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  domainCore.ts（純関数）                                      │
│  validateDomain · resolveMonthlyActions · rollDomainEvents   │
│  applyDomainOps · buildDomainPromptLines · clamp stats       │
└───────────────────────────┬─────────────────────────────────┘
                            │ JSON 契約
┌───────────────────────────▼─────────────────────────────────┐
│  game_state.json                                            │
│    domain: { treasury, food, troops, stats…, officers[] }   │
│  world_forge.json（任意）                                    │
│    domainDefaults?: { monthDays, actionCatalog, eventTable }  │
│  turn_result.json                                           │
│    domainOps?: { kind, actions[], … }                       │
│    elapsedWorldTurns（月次コミット時）                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ Host Runner
┌───────────────────────────▼─────────────────────────────────┐
│  domainBridge.ts · domainTurnOps.ts（新規）                  │
│  gmPromptBuilder → [Domain — RegionName]                    │
│  chronicleCore → kind: 'domain' イベント                       │
│  worldView → Domain パネル（D3）                             │
└─────────────────────────────────────────────────────────────┘
```

**`tradeOps` / `npcAgencyOps` と同型:** 専用チャネル → Core 適用 → GM は数値を捏造しない。

---

## 5. Game Rules

`game_rules.json` に追加（**既定 OFF**）。

| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableDomainMode` | `false` | 領地運営レイヤー全体 |
| `domainMonthDays` | `30` | 1 ヶ月あたりの `elapsedWorldTurns`（1–100 に clamp） |
| `domainMonthlyActions` | `2` | 月あたり選択可能な行動数（1–4） |

**推奨依存（エラーではなく UI ヒント）:**

| 機能 | 推奨 |
|------|------|
| Domain | `enableWorldForge` |
| 隣国・市場連動 | `enableEmergentSimulation` |
| 商人・使者 | `enableNpcRegistry` + `enableNpcAgency` |
| 交易収支 | `enableCommerce` |
| 領主ロール動機 | `commerce.playerRole` または `game_rules.playerRole` = `ruler` |

OFF 時: `domain` キーが `game_state` にあっても読まない・表示しない。

---

## 6. データモデル

### 6.1 `game_state.domain`（v1 スキーマ案）

```json
{
  "domain": {
    "enabled": true,
    "controlledRegionId": "riverhold",
    "rank": "minor_lord",
    "calendarMonth": 3,
    "calendarYear": 1,
    "treasury": 320,
    "food": 800,
    "troops": 120,
    "publicOrder": 62,
    "popularSupport": 55,
    "agriculture": 48,
    "commerce": 41,
    "defense": 36,
    "culture": 20,
    "prestige": 15,
    "monthlyActionsRemaining": 2,
    "lastCommitWorldTurn": 90,
    "officers": [
      { "npcId": "sayo", "role": "steward", "skill": 58 }
    ],
    "pendingEvents": [],
    "flags": {}
  }
}
```

| フィールド | 型 | 説明 |
|------------|-----|------|
| `controlledRegionId` | string | World Forge `geography.regions[].id` |
| `rank` | enum | `minor_lord` \| `baron` \| `count` — **進行軸**（§9.4）。`prestige` 閾値で叙任 |
| `calendarMonth` / `calendarYear` | number | 領地暦（Chronicle 表示用。`worldTurn` とは別ラベル可） |
| `treasury` / `food` / `troops` | number | 0–9999（clamp） |
| `publicOrder` … `prestige` | number | 0–100（clamp） |
| `monthlyActionsRemaining` | number | 今月残り行動枠。月次コミットでリセット |
| `officers` | array | D5。最大 5 人。**`npcId` + `role` のみ** — 忠誠は `playerBondCore` / disposition から読む |
| `pendingEvents` | array | Core が積んだ次月持ち越しイベント id |
| `flags` | object | ストーリー用ブール（例: `borderTension`） |

**Commerce との関係（v1 / D4 境界）:**

- 領地 `treasury` と `commerce.credits` は **別フィールド**（v1 は `treasury` 正本）。
- 月次収支で `treasury` ±N。Commerce ON 時は「領地商業 → 市場在庫回復ボーナス」程度の軽い接続のみ。
- **D4 で必ず決める:** 商人 NPC がプレイヤーに支払う場面は `tradeOps` → `commerce.credits` か、領庫入金 → `treasury` か。v1 推奨: **個人商取引 = credits、領地税・徴収・月次収入 = treasury**。GM プロンプトに1行明記。

### 6.2 `world_forge.json` 拡張（任意・D4）

```json
{
  "domainDefaults": {
    "monthDays": 30,
    "monthlyActions": 2,
    "actionCatalog": ["agriculture", "commerce", "public_order", "train_troops", "fortify", "diplomacy", "recruit", "inspect", "festival", "espionage"],
    "eventTable": [
      { "id": "bad_harvest", "weight": 10, "conditions": { "agricultureMax": 40 } },
      { "id": "merchant_visit", "weight": 15, "conditions": { "commerceMin": 50 } }
    ]
  }
}
```

無ければ `domainCore` 内蔵デフォルトを使用。

### 6.3 `turn_result.domainOps`（v1 契約）

```typescript
interface DomainOps {
  kind: 'monthly_commit' | 'appoint_officer' | 'dismiss_officer';
  /** monthly_commit: 選択した行動 id（最大 domainMonthlyActions） */
  actions?: string[];
  /** 任意: 諜報・噂収集など補助指示（イベント重みにのみ影響） */
  intelligence?: 'gather_rumors' | 'scout_border' | 'none';
  /** appoint_officer / dismiss_officer（D5） */
  officer?: { npcId: string; role: OfficerRole };
}
```

**Agentic Referee** にも同型の1行ヒントを追加（実装時）。

**statePatch 許可パス（追加候補）:**

- `/domain/*` — Core 経由のみ。GM 直 patch は **禁止**（`domainOps` 専用チャネル）。

---

## 7. 月次行動カタログ（v1）

| id | 表示名 | 主効果 | 典型コスト |
|----|--------|--------|------------|
| `agriculture` | 農地開発 | `agriculture` +2、来月 `food` 収入 + | `treasury` -40 |
| `commerce` | 商業振興 | `commerce` +2 | `treasury` -30 |
| `public_order` | 治安維持 | `publicOrder` +3 | `treasury` -25、`troops` -0 |
| `train_troops` | 兵の訓練 | `troops` +10、`defense` +1 | `treasury` -50、`food` -20 |
| `fortify` | 築城・防備 | `defense` +3 | `treasury` -60 |
| `diplomacy` | 外交 | 隣国 `factionReputation` +（別途） | `treasury` -20 |
| `recruit` | 人材登用 | イベント `officer_candidate` 重み UP | `treasury` -30 |
| `inspect` | 視察 | `popularSupport` +1、GM に現地描写ヒント | `treasury` -10 |
| `festival` | 祭り・慰撫 | `popularSupport` +3、`culture` +1 | `treasury` -35、`food` -15 |
| `espionage` | 諜報 | 隣国イベント・`borderTension` 情報 | `treasury` -25 |

`resolveMonthlyActions(domain, actions, forgeDefaults)` が **決定論**で delta を返す。テスト必須。

---

## 8. イベント（v1 — 主役レイヤー）**✅ v1.39.2**

**設計原則（イベント・ファースト）:** プレイヤーが月次コミット後に「何が起きたか」を narration で受け取るのが主体験。stat +2 は裏方。1領地・ライバル大名なしの v1 では、**毎月最低1件は domain イベント候補を GM に渡す**（重み0でも `domain_quiet_month` など雰囲気イベント可）。

数値は **イベント確率と GM プロンプト** に効かせる。フルシミュにはしない。

### 8.1 季節効果（`calendarMonth`）**✅ v1.39.2**

| 季節 | 月 | 効果 |
|------|-----|------|
| 春 | 3–5 | `agriculture` 行動ボーナス +1（`resolveSeasonalActionBonus`） |
| 夏 | 6–8 | 基準 |
| 秋 | 9–11 | 収穫: `food` +、`bad_harvest` 重み DOWN |
| 冬 | 12, 1–2 | `food` 月次 -N（兵・民食）、`festival` 行動ボーナス +1 support/culture、`festival_gathering` 重み UP |

ほぼタダで `food` stat に意味が生まれる。`domainCore` 内で決定論。

| id | トリガー傾向 | GM への効き |
|----|-------------|-------------|
| `bad_harvest` | `agriculture` 低 | 食料危機・民怨 narration |
| `merchant_visit` | `commerce` 高 | 交易機会・NPC 来訪 |
| `bandit_activity` | `publicOrder` 低 | 盗賊イベント |
| `neighbor_militarize` | `defense` 低 / 隣国 danger 高 | 国境不穏 |
| `officer_discontent` | 家臣在任 + `flags.officerDiscontent`（D5: bond `rival` 以下） | 家臣イベント（別 loyalty 数値は使わない）**✅ v1.39.2** |
| `petition` | `popularSupport` 低 | 領民陳情 |
| `trade_route_disruption` | `commerce` 中・世界イベント | 収入減 |
| `rumor_mill` | `intelligence: gather_rumors` | 隣国噂（FoW は変えない） |
| `spy_arrival` | `espionage` 選択時 | 密使 |
| `religious_friction` | `culture` 低・派閥敵対 | ギルド/宗教対立 |

`rollDomainEvents(domain, worldState, rngSeed)` — `worldSeed` または `worldTurn` から決定論（幻覚ゼロ）。

Chronicle 例:

```text
[domain] Spring, Year 1 — Lord ordered agricultural development (agriculture +2).
```

---

## 9. 既存システム統合

| 既存 | 統合方針 |
|------|----------|
| **Commerce** | 領地 `commerce` stat が高いと `tickMarketRecovery` ボーナス（D4）。個人/領庫の財布境界は §6.1 |
| **NPC Agency** | 商人来訪・密使は `npcAgencyOps` と連動可（GM 確定後） |
| **Faction Reputation** | `diplomacy` 行動 → `factionReputation` delta（既存 Core 再利用） |
| **Chronicle** | `kind: 'domain'` イベント追加 |
| **In-World Chat** | `buildInWorldContextBlock` に `[Domain summary]` 1 段落（参照のみ） |
| **`playerRole: ruler`** | Domain ON 時は `[Living World — Ruler]` を `[Domain — …]` に置換または併記 |
| **Replay Export** | `domain` は `pick*ForWebview` 同様、公開サブセットのみ |

### 9.1 留守中ドリフト（Living World 北極星 — **本丸接続**）**✅ v1.39.3**

プレイヤーが冒険で領地を離れている間、任命済み **steward（代官）** が月次相当の軽い tick を回す（全 stat ではなく **イベント重み + treasury/food 微変動**）。

帰還時は既存 **Since-last-visit** パイプに `category: 'domain'` を足す:

```
[Living World — Since last visit]
Domain (90 turns away): While you were abroad, Steward Sayo collected taxes (+40 treasury).
                        Bandit activity increased (public order -5). [domain:bandit_activity]
```

| 項目 | 仕様 |
|------|------|
| スナップショット | `domainSnapshotAtDepart`（location 退出時または月次コミット時） |
| 差分計算 | `computeSinceLastDomainVisitDelta()` — `worldSimCommerceCore` 同型の純関数 |
| GM 注入 | `buildLivingWorldGmLines` または `[Domain — …]` にマージ |
| 黄金律 | 留守 tick も **決定論 Core**。GM は報告のみ |

→ Domain が独立 SLG ではなく **「世界は君がいなくても動く」の領地版** になる。

### 9.2 家臣 = Bond 接続（D5 設計変更）**✅ v1.39.4**

別テーブルの `loyalty` は **廃止**。家臣は Registry の `npcId` + `role` のみ保持。

| 用途 | ソース |
|------|--------|
| 忠誠・好感 | `playerBondCore` / `world_state` player↔NPC disposition |
| 家臣同士の関係 | `npcRelationshipCore`（評定の対立・連帯） |
| 決定的転機 | `npcLifeEventsCore`（裏切り・誓いのマイルストーン） |
| `officer_discontent` | bond が `rival` 以下、または life event `betrayal` 到達 |

`appoint_officer` は Registry に存在する `npcId` のみ。評定 council 行（§10.3）は Registry の `personality` を1行要約。

### 9.3 月次評定（Council）注入 **✅ v1.39.5**

`monthly_commit` 確定ターンのみ、任命済み officer ごとに **立場から1行** を GM プロンプトへ（最大5行）:

```
[Domain — Council]
Sayo (steward): Worried about treasury after fortify last month.
Marcus (marshal): Recommends training troops before border rumors spread.
```

既存 NPC メタデータの再利用。LLM 生成ではない（テンプレ + stat 閾値）。

### 9.4 Rank / Prestige 進行軸

4X 化せず **細い1本の目的** を与える:

| `prestige` | 効果 |
|------------|------|
| 0–29 | `minor_lord` |
| 30–59 | `baron` 叙任イベント解禁 · `monthlyActions` +0（将来+1は D4 以降検討） |
| 60+ | `count` · 隣国外交イベント重み UP |

叙任時: GM が式典を narrate（数値は Core が `rank` を更新）。勝敗のない sandbox に「方向性」だけ足す。

---

## 10. GM プロンプト（D2 仕様）

### 10.1 注入ブロック

```
[Domain — Riverhold]
Rank: minor_lord · Month 3, Year 1
Treasury 320 · Food 800 · Troops 120
Public order 62 · Popular support 55
Agriculture 48 · Commerce 41 · Defense 36
Monthly actions remaining: 2
Officers: Sayo (steward, bond: trusted)
Pending: border_tension_rumor
Guidance: Stats are canonical. Narrate mood and NPC reactions only.
          Monthly policy changes require turn_result.domainOps (monthly_commit).
          Do not invent treasury or troop numbers in narration.
```

- チャンク id: `domain`、priority: **67**（`worldState` 68 の直下）
- `enableDomainMode` OFF または `domain` 未初期化時は空

### 10.3 Compact モードと評定 **✅ v1.39.6**

| 条件 | 注入 |
|------|------|
| `pendingEvents.length === 0` かつ officers 0 | 3行サマリのみ（treasury/food/troops + month） |
| `monthly_commit` ターン | フルブロック + `[Domain — Council]`（§9.3） |
| 通常会話ターン | コンパクト + pending イベントあれば1行 |

LW + Commerce + Bonds と併用時は **prompt budget eviction** で domain は worldState より先に落ちる設計（priority 67）。compact を既定にしフルはコミット時のみ。

### 10.2 プロンプト行（Core 定数）

```typescript
export const DOMAIN_OPS_PROMPT_LINE =
  'When the player commits to a monthly domain policy (up to N actions), '
  + 'set turn_result.domainOps: { kind: "monthly_commit", actions: [...], intelligence?: "..." }. '
  + 'Set elapsedWorldTurns to domainMonthDays (default 30) for the same commit. '
  + 'Core applies stat changes; narrate outcomes only.';
```

---

## 11. UI（D3 仕様）

**World タブ** に「領地」サブパネル（`enableDomainMode` 時のみ）。

| 表示 | ソース |
|------|--------|
| 領地名 | `controlledRegionId` → Forge 名解決 |
| 財政 / 食料 / 兵力 | `treasury` / `food` / `troops` |
| 治安 / 民忠 / 農業 / 商業 / 防備 | stats 0–100 |
| 今月残り行動 | `monthlyActionsRemaining` |
| 家臣一覧 | `officers` + Registry 名 |

**操作（v1）:**

- 行動チップを選んでチャットに挿入（「今月: 農地開発、治安維持」）
- 送信は通常 GM ターン（`domainOps` は GM が turn_result に書く）

盤面クリックで即確定は **Non-Goal**（v1）。会話主導を維持。

---

## 12. 実装フェーズ（v2 — イベント前倒し）

**推奨順序（Claude 合意・実装もこの順）:** D1 Core + harness → **D1b Events** → D1.5 Time → D2 Prompt → D3 UI → D4 Commerce 境界 → D5 Bond Officers

旧ロードマップではイベント表が D4 後ろだったが、**§1.4「乾いた表計算」リスク**のため **D1b で前倒し**（`docs/PHASE_NAMING.md` Domain 表と同期）。

### 12.1 フェーズ一覧（出荷状況）

| Phase | 名称 | 状態 | 出荷 Ver |
|-------|------|------|----------|
| **D1** | Domain Core + balance harness | **完了** | **1.39.0–1.39.1** |
| **D1b** | Domain Events（前倒し） | **完了** | **1.39.2** |
| **D1.5** | Domain + Time + Chronicle | **完了** | **1.39.0** |
| **D2** | Domain Prompt + `domainOps` | **完了** | **1.39.0–1.39.6**（§10.3 compact = 1.39.6） |
| **D3** | Domain UI（World タブ） | **未着手** | **1.40.0** 想定 |
| **D4** | Commerce 境界 + 留守ドリフト | **一部完了** | ledger **1.39.1** · drift **1.39.3** · 市場ボーナス **未** |
| **D5** | Officers via Bond + Council | **完了** | bond **1.39.4** · council **1.39.5** |

**次のマイルストーン:** **D3 UI**（`pickDomainForWebview` は D2 で用意済み・未配線）→ D4 残（`commerce` stat → `tickMarketRecovery` ボーナス）。

### Phase D1: Domain Core + Balance Harness **✅ v1.39.0–1.39.1**

| 項目 | 内容 |
|------|------|
| ファイル | `src/domainCore.ts` · `scripts/test_domain_core.js` · **`scripts/domain_balance_harness.js`** · `test_domain_balance_core.js` |
| 関数 | `validateDomain` · `defaultDomainState` · `resolveMonthlyActions` · `applyDomainDelta` · `parseDomainOps` · `applyDomainEventEffect` · `applyMonthlyDomainIncome` |
| 受け入れ | 月次2行動で決定論 delta · clamp · テスト 20+ · harness が12ヶ月軌道を stdout **✅** |

### Phase D1b: Domain Events（**前倒し** — 旧 D4 の核）**✅ v1.39.2**

| 項目 | 内容 |
|------|------|
| ファイル | `domainCore.ts` に `rollDomainEvent` · `computeDomainEventWeight` · `buildSeasonalDomainGmHint` · `resolveSeasonalActionBonus` |
| 受け入れ | 毎月コミット後にイベント id 決定論抽出 · `agriculture` 低 → `bad_harvest` 重み UP · 冬の food ドレイン · 季節 GM ヒント（commit/full tier） **✅** |

### Phase D1.5: Domain + Time + Chronicle **✅ v1.39.0**

| 項目 | 内容 |
|------|------|
| ファイル | `src/domainTurnOps.ts` · `src/domainTurnOpsCore.ts` · `chronicleCore.ts` 拡張 · `statePatch.ts` 配線 |
| 内容 | `monthly_commit` → `elapsedWorldTurns` + `domain` 更新 + Chronicle `kind: 'domain'` + **イベント結果** |
| 受け入れ | 会話のみのターンで `domain` 不変 · 月次コミットで `calendarMonth` +1 **✅**（`test_domain_turn_ops.js`） |

### Phase D2: Domain Prompt + turn_result **✅ v1.39.0–1.39.6**

| 項目 | 内容 |
|------|------|
| ファイル | `src/domainBridge.ts` · `src/domainPromptCore.ts` · `gmPromptBuilderCore.ts` · `agenticGmCore.ts` |
| 内容 | `[Domain — …]` 3段 tier（§10.3）· `DOMAIN_OPS_PROMPT_LINE` · **Council 行**（§9.3）· Referee 契約 · since-last-visit 注入 |
| 受け入れ | OFF 時空 · コミット時 full + Council · `domainOps` パース・merge **✅**（`test_domain_prompt_core.js` 他） |

### Phase D3: Domain UI **— 次フェーズ（1.40.0 想定）**

| 項目 | 内容 |
|------|------|
| ファイル | `worldView.ts` · `webview/modules/85-world.js` · i18n 4 言語 · `pickDomainForWebview` 配線 |
| 受け入れ | OFF 時パネル非表示 · 数値が `game_state` と一致 |
| 現状 | Game Rules の `enableDomainMode` チェックボックスのみ（v1.39.0）。World タブ領地パネルは **未** |

### Phase D4: Commerce 境界 + 留守ドリフト **一部 ✅**

| 項目 | 内容 |
|------|------|
| 内容 | treasury/credits ルール明文化 **✅ v1.39.1** · **`computeSinceLastDomainVisitDelta`**（§9.1）**✅ v1.39.3** · 市場ボーナス（`commerce` stat → `tickMarketRecovery`）**未** |
| 受け入れ | 離脱→再訪で domain delta が GM プロンプトに出る **✅** · 商人支払いは credits **✅**（ledger 行） |

### Phase D5: Officers via Bond（設計変更）**✅ v1.39.4–1.39.5**

| 項目 | 内容 |
|------|------|
| 内容 | `appoint_officer` · **playerBond / lifeEvents** 連動 **✅ v1.39.4** · 評定 council テンプレ **✅ v1.39.5** |
| 受け入れ | 家臣5人 · `officer_discontent` = bond マイルストーン · 別 loyalty フィールドなし **✅** |

**出荷 Ver（実績）:** D1–D2 + D1b + D1.5 + D4 核 + D5 → **1.39.0–1.39.8**（hardening 1.39.7 · harness 1.39.8）。**D3** → **1.40.0** 想定。D4 市場ボーナスは D3 後または同梱（§20.2-B）。

---

## 13. Non-Goals

| 項目 | 理由 |
|------|------|
| CK3 / 信長の野望級の複雑さ | 普通の SLG になる |
| narration から月次行動を自動パース | 誤検知（LW と同じ） |
| 複数領地・分封・継承 | v1 スコープ外 |
| リアルタイム RTS 戦闘 | Campaign の既存戦闘 beat に任せる |
| Domain を Parlor / In-World で変更 | モード設計と矛盾 |
| 全地域シミュ（数百村） | Tier 1 集約のみ（COMMERCE BRIEF §2.0 準拠） |

---

## 14. テスト方針

| スクリプト | 検証 |
|------------|------|
| `test_domain_core.js` | 行動 resolve · イベント重み · 季節 · clamp · parseDomainOps |
| `domain_balance_harness.js` + `domain_balance_harness_lib.js` | 固定戦略12ヶ月 · stat 軌道 · イベント頻度（`npm run domain:balance` · CI 任意）**✅ v1.39.8** |
| `test_domain_turn_ops.js` | turn_result 適用 · elapsedWorldTurns 連動 |
| `test_domain_since_last_visit.js` | 留守ドリフト delta |
| `test_domain_prompt_core.js` | compact/standard/full tier · Council · since-last-visit |
| `test_domain_council_core.js` | Council 行 · commit-only 注入 |
| `test_domain_officer_bond_core.js` | bond 評定 · appoint ゲート |
| `test_domain_since_last_visit.js` | 留守ドリフト delta |
| `test_chronicle_core.js` 拡張（任意） | `kind: 'domain'` エントリ専用 assert **未** |

---

## 15. セキュリティ・allowlist

- Webview には `domain` の **公開サブセット** のみ（`treasury` 等。`flags` 内部は要検討）
- `statePatch` 直書き `/domain/*` は v1 **禁止** — `domainOps` のみ
- Export / Replay は `replayExportSanitizeCore` 経由（将来の `domain` フィールドも pick 対象に追加）

---

## 16. 外向けコピー（案）

> LoreRelay は AI GM キャンペーンに加え、任意で **Domain Mode（領地運営）** を有効化できます。太閤立志伝的な月次方針を AI と会話しながら進め、数値は世界イベントの骨格、物語は GM が描きます。

---

## 17. 関連ドキュメント

| doc | 関係 |
|-----|------|
| `docs/COMMERCE_AND_AGENCY_BRIEF.md` §0.5 | 北極星・`playerRole` |
| `docs/WORLD_TIME_PASSAGE_IDEA.md` §C | 三層時計・月次コミット |
| `docs/PARLOR_MODE_DESIGN.md` | 体験プロファイル・入口の軽さ |
| `src/inWorldPromptBuilderCore.ts` | 参照のみコンテキスト拡張ポイント |
| `docs/PHASE_NAMING.md` | D1–D5 サブトラック |
| `docs/DOMAIN_MODE_CODE_REVIEW_PROMPT.md` | 他 AI 向けコードレビュー依頼（コピペ用） |

---

## 18. レビュー履歴

| 日付 | レビュア | 反映 |
|------|----------|------|
| 2026-07-03 | Claude | §1.4 リスク · イベント前倒し · balance harness · Bond 家臣 · 留守ドリフト · rank 軸 · 季節 · compact prompt |
| 2026-07-03 | Grok | §12 フェーズ再編 · 出荷 Ver 実績表 · D3/D4 残タスク明記 · `PHASE_NAMING.md` 同期 |
| 2026-07-03 | Grok | §20 次アクション表 v1.39.8 同期 · 完了済み/優先度 · §19 申し送り更新 |
| 2026-07-03 | Gemini→Grok | 外部レビュー triage · `DOMAIN_MODE_REVIEW_GEMINI_v1_39.md` · PR-A domain merge |

---

## 19. AI 申し送り（1行）

```
Domain Mode v1.39.9: D1→D5 + hardening + harness + PR-A turn merge 完了。次 P0=D3 UI。正本 docs/DOMAIN_MODE_DESIGN.md §12・§20。
```

---

## 20. 次アクション

**現状（v1.39.8）:** `enableDomainMode` + Core / Events / Time / Prompt（compact）/ Bond / Council / 留守ドリフト / allowlist hardening / `npm run domain:balance` **完了**。**未:** World タブ UI · D4 市場ボーナス · chronicle 専用 assert · replay/webview domain pick。

### 20.1 完了済み（参考 — 再着手不要）

| 項目 | 出荷 Ver | 確認 |
|------|----------|------|
| D1 Core + harness | 1.39.0–1.39.8 | `npm test` · `npm run domain:balance` |
| D1b Events · D1.5 Time | 1.39.0–1.39.2 | `test_domain_core.js` · `test_domain_turn_ops.js` |
| D2 Prompt + tiers | 1.39.0–1.39.6 | `test_domain_prompt_core.js` |
| D4 留守ドリフト + ledger | 1.39.1–1.39.3 | `test_domain_since_last_visit.js` · `test_domain_ledger_core.js` |
| D5 Bond + Council | 1.39.4–1.39.5 | `test_domain_officer_bond_core.js` · `test_domain_council_core.js` |
| レビュー + hardening | 1.39.7 | region/event allowlist · reapply drift 順序 |
| §12 フェーズ表 · §14 harness | 1.39.8 | `domain_balance_harness_lib.js` |

### 20.2 次の作業

| 優先 | ID | 内容 | 主なファイル | 受け入れ | 想定 Ver |
|------|-----|------|--------------|----------|----------|
| ~~**P0**~~ | **A0** | **turn merge: `domain` authoritative** — Commerce 併用時の monthly_commit 落ち防止 | `workspaceStateQueueCore.ts` · `test_domain_turn_merge_conflict.js` | revision 衝突でも turn の `domain` が保持 | **✅ 1.39.9** |
| **P0** | **A** | **D3 Domain UI** — World タブ「領地」サブパネル | `worldView.ts` · `webview/modules/85-world.js` · i18n 4言語 | `enableDomainMode` OFF で非表示 · 数値が `game_state.domain` と一致 · 行動チップ→チャット挿入 | **1.40.0** |
| P0 配線 | A1 | `pickDomainForWebview` → webview message · `gameStateWebviewSanitize` に domain 公開サブセット | `domainBridge.ts` · `gameStateWebviewSanitize.ts` | webview に `flags` 内部を漏らさない | 1.40.0 |
| P1 | B | D4 残 — 領地 `commerce` stat → `tickMarketRecovery` ボーナス | `worldSimCommerceCore.ts` · `domainCore` 連携 | Commerce+Domain ON で高 commerce 領地の市場回復に加点 | 1.40.x |
| P2 | C | Chronicle `kind: 'domain'` 専用 assert | `test_chronicle_core.js` | `monthly_commit` 後 journal 行に domain テキスト | 任意 |
| P2 | D | バランスチューニング | `npm run domain:balance` · `domain_balance_harness.js` | 12ヶ月軌道・イベント頻度が設計意図内（乾いた表計算回避） | 随時 |
| P3 | E | Replay export に domain pick | `replayExportSanitizeCore.ts` | エクスポートに領地サマリのみ | D3 同梱可 |
| 配布 | — | GitHub Release | tag `v1.40.0`（D3 後） | `package.json` と一致 VSIX | D3 後 |

**推奨着手順:** Gemini レビュー反映（`docs/DOMAIN_MODE_REVIEW_GEMINI_v1_39.md`）→ **PR-A**（`domain` を turn authoritative に）→ **A1 + A**（D3 UI）→ **B** → 横断 **PR-C**（キュー CB）→ **C** / **D** は並行可。