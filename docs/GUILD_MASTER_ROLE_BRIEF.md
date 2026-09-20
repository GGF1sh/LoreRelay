# Guild Master Mode — 冒険者ギルド運営レイヤー設計（Guild Master / Quest Board）

> **ID:** **F11 / Guild サブトラック（G1–G4）** — Domain（D*）に続く **role layer の第2ロール**。命名は `docs/PHASE_NAMING.md` を参照。
> **Status:** **設計 v1（方向確定）** — Keisuke 判断反映 2026-07-03（週刻み / op分離 / 一括提示＋面談モード）
> **対象読者:** 実装担当（Grok / Codex / Claude Code）· レビュー（ChatGPT / Gemini）· 次セッション AI
> **前提ドキュメント:** `docs/DOMAIN_MODE_DESIGN.md`（レシピ元）· `docs/COMMERCE_AND_AGENCY_BRIEF.md` · `docs/LIVING_WORLD_LW3_RELATIONSHIPS.md`（Bond）
> **一行:** Domain で確立した **role layer レシピ**をそのまま第2ロールに写像し、「玉座で民を裁く」を「ギルドの受付で依頼を捌く」に置き換える。新規ロジックはデータ定義2枚（依頼人テーブル / クエスト判定テーブル）だけ。**コードは薄い**。

---

## 0. 現状スナップショット（2026-07-03）

### 0.1 すでにある材料（レシピの土台 — Domain が実証済み）

| レシピ要素 | Domain 実体 | Guild が再利用する形 |
|------|------|-----------------|
| 状態コア（純関数, no vscode/fs） | `domainCore.ts` | `guildCore.ts`（新規・骨格は移植） |
| 署名アクション（周期コミット） | `applyMonthlyCommit`（`audience` action） | `applyWeeklyCommit`（`open_board` action） |
| 陳情キュー（決定論生成＋裁定 delta） | `domainAudienceCore.ts` / `buildAudienceQueue` | `guildRequestCore.ts` / `buildRequestQueue` |
| 派遣＋skill判定 | `domainMissionCore.ts` / `resolveMissionOutcome` | `guildQuestCore.ts` / `resolveQuestOutcome`（**＋Bond**） |
| 留守ドリフト＋Since-last-visit | `domainDriftCore.ts` | `guildDriftCore.ts` |
| プロンプト層 | `domainPromptCore.ts` | `guildPromptCore.ts` |
| Bridge（flag gate→lazy init→ops適用→UI） | `domainBridge.ts` | `guildBridge.ts` |
| Bond 供給 | `playerBondCore` · `npcRelationshipCore`（LW3） | 冒険者忠誠 → クエスト判定重み |
| NPC Registry | 名あり NPC ≤10 | 冒険者ロスター（≤5）＝名ありNPC |
| 世界イベント→依頼 | `questGeneratorCore.generateQuestHooks` | **世界の変動が掲示板の依頼に自動流入** |
| Since-last-visit | `livingWorldBridge` | 留守中のギルド変化報告 |

### 0.2 まだ無いもの（本 doc で設計する）

- `game_state.guild` スキーマと `validateGuild`
- `guildCore.ts`（純関数: 週次行動 resolve・イベント重み・clamp）
- `guildRequestCore.ts`（依頼人生成）/ `guildQuestCore.ts`（クエスト判定）/ `guildDriftCore.ts`（留守進行）
- `turn_result.guildOps` チャネル（`domainOps` 同型）
- GM プロンプト `[Guild — …]` ブロック（**一括提示 / 面談** 2 tier）
- World タブ「ギルド」パネル
- `game_rules.enableGuildMode` ほか（既定 **false**）

---

## 1. ビジョンと北極星

### 1.1 提供する体験

| 体験 | 説明 |
|------|------|
| **受付に座って依頼を捌く** | 掲示板に来た依頼人を一括提示 → 受諾/謝絶/交渉。GM が依頼人を演じ、Core が機械確定 |
| **冒険者を送り出す側** | 太閤IIの「主命を出す側」。パーティを編成しクエストへ派遣、skill＋Bond＋seed で決定論判定 |
| **育てた絆が成否になる** | LW3 Bond をそのまま判定重みに。盟友の冒険者は失敗しにくく、宿敵は依頼金を持ち逃げする |
| **留守でも回るギルド** | 自分が冒険に出ている間、副長がボードを回す（留守ドリフト） |

### 1.2 北極星（参照作品）

| 作品 | 取り入れるもの | **取り入れない**もの |
|------|----------------|---------------------|
| 太閤立志伝 II | 主命を「出す側」・少数ロスター・週次の手数 | 全国シム・大量イベント |
| ギルド運営もの（一般） | Quest Board・依頼受注・報酬/評判 | フル経営シム・在庫最適化ゲー |
| D&D ギルド | 依頼人との交渉・冒険者の生死リスク | フルパーティ戦術戦闘 |

**スコープ上限（v0）:** ギルド **1つ**（`hallLocationId` 1件）。支部・のれん分け・ギルド連合は Non-Goal。

### 1.3 設計の黄金律（Domain / LW と同型 — **厳守**）

1. **依頼生成・クエスト判定・イベント抽選は決定論 Core**（`hashSeed` FNV、同一入力→同一結果）。
2. **GM/LLM は narration 専任**。依頼人の人物像・台詞・冒険者の武勇伝は全部 GM が演じる。**会話は自動生成しない**。
3. **明示コミットで時間が進む**。会話の Exchange 数 ≠ 経過週数（`open_board` / `weekly_commit` が時計）。
4. **面白さの重心は stat 育成でなくイベント連鎖**。数値はイベント/判定の重み用。プレイヤーが体感するのは物語。
5. **全 stat clamp・全 ops サニタイズ**（改行/制御文字除去・`CHARACTER_ID_PATTERN`）。破壊的 NPC 削除なし。

---

## 2. 確定した設計判断（Keisuke, 2026-07-03）

| 論点 | 決定 | 実装への含意 |
|------|------|------|
| **① 時間刻み** | **週（week）** — 月は長すぎる | `calendarWeek` / `calendarYear`、`WEEKS_PER_YEAR = 48`（12週×4季）。Domain の `calendarMonth` を week に置換 |
| **② 依頼受諾と派遣** | **分離（2 op）** | `resolve_request`（受諾/謝絶/交渉）で依頼を受注クエストに昇格 → 別途 `assign_party` でパーティ派遣。太閤IIらしい手触り |
| **③ 開帳の会話** | **基本は複数依頼を一括提示 / モード切り替えで単一依頼のフル会話** | `resolveGuildBoardTier()` が `bulk`（既定）と `full`（面談）を返す。面談は World タブの「面談」ボタン→`focusRequestId` で発火 |

---

## 3. コアデータモデル（`guildCore.ts`）

```ts
export const MAX_GUILD_ADVENTURERS = 5;          // = MAX_DOMAIN_OFFICERS
export const MAX_GUILD_ACTIONS_PER_WEEK = 4;
export const DEFAULT_GUILD_WEEKLY_ACTIONS = 2;
export const WEEKS_PER_YEAR = 48;                // 12 週 × 4 季
export const WEEKS_PER_SEASON = 12;
export const GUILD_STAT_MIN = 0;
export const GUILD_STAT_MAX = 100;
export const GUILD_RESOURCE_MAX = 9999;
export const MAX_GUILD_PENDING_REQUESTS = 4;     // = MAX_AUDIENCE_QUEUE
export const DEFAULT_BOARD_SIZE = 3;             // = DEFAULT_AUDIENCE_SIZE
export const MAX_ACTIVE_QUESTS = 3;              // = MAX_ACTIVE_MISSIONS

export type GuildRank = 'chartered' | 'reputable' | 'renowned';       // ← prestige→rank 同型
export type AdventurerClass = 'warrior' | 'scout' | 'mage' | 'healer' | 'rogue'; // ← OfficerRole 同型
export type GuildActionId =
  | 'recruit_drive' | 'train' | 'maintain_hall' | 'advertise'
  | 'stock_supplies' | 'court_patrons' | 'open_board';   // ← open_board が audience 写像

export type GuildOpsKind =
  | 'weekly_commit'
  | 'recruit_adventurer' | 'dismiss_adventurer'
  | 'resolve_request'          // 依頼裁定（audience_ruling 写像）
  | 'assign_party';            // クエスト派遣（dispatch_officer 写像）

export interface GuildAdventurer {
  npcId: string;
  klass: AdventurerClass;
  skill?: number;              // 0–100（DomainOfficer.skill と同じ。Bond は state に持たず host が bondMap で解決）
}

export interface GuildQuest {
  id: string;                  // requestId から派生（makeId）
  requestId: string;           // GuildRequestId
  questKind: QuestKind;        // 'hunt'|'escort'|'recover'|'investigate'|'clear'
  difficulty: number;          // 0–100（判定閾値）
  rewardCoffers: number;
  status: 'accepted' | 'active';
  partyNpcIds?: string[];      // status==='active' のとき
  weeksRemaining?: number;     // status==='active' のとき（1–3、tick で減算）
}

export interface GuildState {
  enabled: boolean;
  hallLocationId: string;                  // ← controlledRegionId 写像
  rank: GuildRank;
  calendarWeek: number; calendarYear: number;
  coffers: number;                         // ← treasury（金庫）
  supplies: number;                        // ← food（消耗品在庫）
  renown: number;                          // ← prestige（依頼等級＋冒険者の質をゲート）
  discipline: number;                      // ← publicOrder（ギルドの規律）
  townFavor: number;                       // ← popularSupport（町の信頼）
  facilities: number; safety: number; lore: number; // ← agriculture/defense/culture 相当
  weeklyActionsRemaining: number;
  lastCommitWorldTurn?: number;
  lastEventId?: string;
  lastWeeklyActions?: GuildActionId[];
  adventurers: GuildAdventurer[];          // ≤ MAX_GUILD_ADVENTURERS
  pendingRequests?: string[];              // open_board で開いた依頼ID（pendingPetitions 写像）
  quests?: GuildQuest[];                    // 受注/派遣中（accepted＋active を status で区別）
  lastQuestReports?: string[];             // 帰還報告（lastMissionReports 写像・transient）
  rival?: RivalGuildState;                  // §F8 同型・温め枠（v0 未配線）
  pendingEvents: string[];
  flags: Record<string, boolean>;
}

export interface GuildConfig {
  weeklyActions: number;
  boardSize: number;                        // ← audienceSize
  maxActiveQuests: number;                  // ← maxActiveMissions
  adventurerBondMap?: Record<string, number>; // ← officerTrustMap（Registry disposition→Bond, 既定50）
  rivalsEnabled?: boolean;                  // §F8 温め枠
  rivalGuildLocationId?: string;
}

export interface GuildOps {
  kind: GuildOpsKind;
  actions?: GuildActionId[];
  adventurer?: { npcId: string; klass: AdventurerClass; skill?: number };
  requestId?: string;
  rulingId?: 'accept' | 'decline' | 'negotiate';
  quest?: { questId: string; npcIds: string[]; weeks?: number };
}
```

`clampGuildStat` / `clampGuildResource` / `resolveRankFromRenown`（renown≥60→renowned, ≥30→reputable, else chartered）/ `getGuildSeason(week)`（週→季）/ `advanceGuildCalendar` / `normalizeGuildConfig` / `validateGuild` / `parseGuildOps` は **`domainCore` の同名関数を移植し名前を置換**。`hashSeed` も同一実装を複製（コア間で runtime 依存を作らない Domain の方針を踏襲）。

---

## 4. 署名アクション：開帳ループ（`applyWeeklyCommit`）

`applyMonthlyCommit` と**同順序**で写像：

1. `weekly_commit.actions`（≤N）→ stat delta 適用 → passive 収入（会費・仲介手数料 = `applyWeeklyGuildIncome`）→ 季節効果 → `advanceGuildCalendar` → `weeklyActionsRemaining` リセット
2. `rollGuildEvent(seed)` でギルドイベント抽選（下表）→ 効果適用 → `pendingEvents` 追記
3. **`actions.includes('open_board')` のとき** → `buildRequestQueue(state, seed, boardSize)` → `pendingRequests = queue.map(r => r.id)`
4. `quests` の active 分を 1 週ずつ tick（`weeksRemaining--`）→ 期限到来分を `resolveQuestOutcome` で解決 → delta 適用＋`lastQuestReports` → 完了クエスト除去
5. `config.rivalsEnabled` なら `tickRivalGuild`（**温め枠：v0 は未配線でよい**）
6. 帰還していない冒険者は受付/編成候補から除外（`buildDomainCouncilLines` の away 除外と同型）

### 4.1 ギルドイベント（`GUILD_EVENTS` — `DOMAIN_EVENTS` 写像）

| eventId | 写像元 | 発火条件（重み+） | 効果の要旨 |
|---|---|---|---|
| `quest_board_dry` | bad_harvest | townFavor 低 | 依頼枯れ・coffers減 |
| `wealthy_patron` | merchant_visit | renown 高 | coffers大・renown+ |
| `adventurer_brawl` | bandit_activity | discipline 低 | discipline減・supplies減 |
| `rival_poaching` | neighbor_militarize | safety 低 | 冒険者引き抜き圧・renown+微 |
| `walk_in_petition` | petition | townFavor 低 | townFavor減・open_board 誘発ヒント |
| `supply_shortage` | trade_route_disruption | — | supplies減 |
| `tavern_rumor` | rumor_mill | intelligence=gather_rumors | renown+ |
| `festival_recruits` | festival_gathering | 季=該当 | townFavor+・応募増 |
| `member_discontent` | officer_discontent | requiresAdventurers, Bond低 | discipline減・renown減 |
| `guild_quiet_week` | domain_quiet_month | — | townFavor+微 |

各イベントに `GUILD_EVENT_GM_HINTS`（「Core は既に coffers を減らした。narration のみ」）を持たせる。

---

## 5. 依頼人の決定論生成（`guildRequestCore.ts` ＝ 謁見の写像）

`PETITION_DEFS` と**同構造**の `REQUEST_DEFS`。`renown`/`townFavor`/季節で重み付け、`buildAudienceQueue` と同一の **weighted-without-replacement** で N 件抽選。

```ts
export type GuildRequestId =
  | 'wolf_cull' | 'escort_caravan' | 'lost_heirloom' | 'haunted_mill'
  | 'bandit_bounty' | 'missing_child' | 'rare_herb' | 'debt_collection'
  | 'monster_nest' | 'ruin_survey';
export type QuestKind = 'hunt' | 'escort' | 'recover' | 'investigate' | 'clear';

export interface GuildRequestDef {
  id: GuildRequestId;
  clientArchetype: string;      // 'frightened farmer'（GM が実 NPC 名を演じる）
  summary: string;
  questKind: QuestKind;
  baseDifficulty: number;       // 0–100（受注クエストの difficulty 基準）
  baseReward: number;           // accept 時の rewardCoffers 基準
  rulings: Record<'accept'|'decline'|'negotiate', GuildStatDelta>;
  baseWeight: number;
  townFavorMax?: number; renownMin?: number; season?: GuildSeason; // 重み条件
}
```

**例（1件）:**
```ts
{
  id: 'wolf_cull', clientArchetype: 'frightened farmer', questKind: 'hunt',
  summary: 'Wolves have been savaging the outlying flocks; the village begs for a cull.',
  baseDifficulty: 30, baseReward: 40, baseWeight: 8, townFavorMax: 55,
  rulings: {
    accept:   { renown: 1, townFavor: 1 },              // ボードに受注クエスト昇格
    decline:  { townFavor: -2 },                        // 断って評判減
    negotiate:{ coffers: 15, townFavor: -1 },           // 前金で潤うが評判微減
  },
}
```

### 5.1 `resolve_request` op（②分離の前半）

`{ kind:'resolve_request', requestId, rulingId:'accept'|'decline'|'negotiate' }`

- **accept** → `resolvePetitionRuling` 同型で delta 適用。当該 request を `GuildQuest{ status:'accepted', difficulty=baseDifficulty(±renown補正), rewardCoffers=baseReward }` として `quests` に push。`pendingRequests` から除去。
- **negotiate** → delta（前金 coffers＋、townFavor−）。受注はするが `rewardCoffers` を減額（値切った分）。
- **decline** → delta のみ。ボードから消す。派遣不可。

`buildRequestPromptLines` は `pendingRequests` を**一括**で列挙（`buildAudiencePromptLines` 写像）。→ §7 の tier 参照。

---

## 6. パーティ派遣とクエスト判定（`guildQuestCore.ts` ＝ F9 の写像＋Bond）

### 6.1 `assign_party` op（②分離の後半）

`{ kind:'assign_party', quest:{ questId, npcIds:[...], weeks?:1-3 } }`

- 対象が `status:'accepted'` の受注クエストで、`npcIds` が全員 appointed かつ他クエストに未従事、`quests` の active 数 < `maxActiveQuests` の場合のみ成立（`dispatchOfficer` のガード写像）。
- 成立 → `status='active'`, `partyNpcIds`, `weeksRemaining = clamp(weeks,1,3)`。

### 6.2 判定（`resolveQuestOutcome` ＝ `resolveMissionOutcome` ＋ Bond ＋ difficulty）

```ts
export type QuestGrade = 'triumph' | 'success' | 'setback' | 'disaster';

// partySkill = パーティ平均 skill、avgBond = パーティ平均 Bond（bondMap 由来）
// difficulty が高いほど setback/disaster 側に重み。avgBond 低（PLAYER_TRUST_RIVAL_MAX 以下混在）→ disaster 増
export function computeQuestGradeWeights(
  partySkill: number, avgBond: number, difficulty: number
): Record<QuestGrade, number>;
```

`computeMissionGradeWeights` を土台に **difficulty 項を追加**：`edge = partySkill - difficulty` を triumph/disaster に反映。Bond 低は `resolveMissionOutcome` の lowTrust 分岐そのまま（disaster 25 / triumph 半減）。

grade → delta ＋ report テンプレ（`MISSION_OUTCOME_DELTAS` / `REPORT_TEMPLATES` 写像）:

| grade | 効果の要旨 |
|---|---|
| **triumph** | coffers 大（`rewardCoffers`×1.5）＋renown＋依頼人 townFavor＋、パーティ Bond＋ |
| **success** | coffers（`rewardCoffers`）＋renown 微 |
| **setback** | coffers 半減＋supplies− |
| **disaster** | 報酬なし＋renown−＋townFavor−＋**パーティ欠員/負傷**（Bond 宿敵混在なら「依頼金持ち逃げ」= coffers−） |

seed は `hashSeed([seed, questId, partyNpcIds.join, partySkill, avgBond])`。**同一 seed→同一 grade** をテストで固定。

> **Bond 連動が Guild の旨味**：LW3 `npcRelationshipCore` の affinity をそのまま `avgBond` に。育てた盟友が失敗を減らし、放置した宿敵が事故る——太閤IIの家臣忠誠がクエスト成否になる。Domain の officerTrust 配線をそのまま流用できるので**追加配線コストほぼゼロ**。

---

## 7. GM プロンプト（`guildPromptCore.ts`）— 一括 / 面談 2 tier（③）

```ts
export function resolveGuildBoardTier(
  state: GuildState, focusRequestId?: string
): 'bulk' | 'full';
```

- **`bulk`（既定）**：`pendingRequests` を1件1〜2行で**一括列挙**。GM は依頼人たちをまとめて描写、プレイヤーは各 `requestId` を `resolve_request` で捌く。テンポ優先。
- **`full`（面談）**：World タブの依頼行「面談」ボタン → `focusRequestId` を prompt に渡す → その依頼人**1人だけ**をフル会話 tier で描写（謁見と同じ厚み）。値切り交渉のロールプレイはここで。

プロンプト行の型は Domain 準拠：`[Guild — Board]` / `[Guild — Parley]` / `[Guild — Quests]`（派遣中）/ `[Guild — Event]` / `[Guild — Season]`。各ブロック末尾に OPS_PROMPT_LINE：

```
GUILD_BOARD_OPS_PROMPT_LINE:
  Rule each request via turn_result.guildOps:
  { kind:"resolve_request", requestId:"<id>", rulingId:"accept"|"decline"|"negotiate" }.
  Then dispatch via { kind:"assign_party", quest:{ questId, npcIds:[...], weeks:1-3 } }.
  Core applies rewards and outcomes; narrate the client and the adventurers only.
  Do not invent coffers, renown, or quest results — Core is canonical.
```

`resolveGuildPromptTier(state, isCommitTurn)`（minimal/standard/full）も `resolveDomainPromptTier` 写像。

---

## 8. 留守ドリフト（`guildDriftCore.ts` ＝ `domainDriftCore` 丸ごと写像）

プレイヤーが冒険/放置中、**副長（deputy）または受付**がボードを回す。

- `simulateBoardWeek`：passive 会費 ＋ 季節効果 ＋ 週前進 ＋ `rollGuildEvent` の steward 版（deputy 在→`['maintain_hall','open_board']`、不在→`['maintain_hall']`）
- `computeSinceLastGuildVisitDelta`：`turnsAway → simulatedWeeks`（`MAX_GUILD_DRIFT_WEEKS` cap）、coffers/renown/townFavor 総 delta ＋ 直近4件の `GuildVisitChange{ category:'guild' }`
- `buildSinceLastGuildVisitLines`：「留守中、副長◯◯がギルドを切り盛りした。金庫+30、討伐依頼が2件流れ、新人が1人応募した…」を GM Since-last-visit に注入

`category:'guild'` の VisitChange を `recentChanges` に伝聞昇格させ、既存 Living World パイプ（LW3 NPC 噂と同経路）へ載せる。

---

## 9. game_rules フラグ（既定 **false** ・段階解禁）

`gameRules.ts` に Domain と同形で追加：

```ts
enableGuildMode:     false,   // 親 flag（Registry 前提。OFF なら全 guild 層 dead）
enableGuildRequests: false,   // 依頼人キュー（開帳の会話）
enableGuildParties:  false,   // パーティ派遣＋クエスト判定＋Bond
enableRivalGuild:    false,   // §F8 同型・温め枠（v0 は宣言のみ・未配線）
```

Domain と Guild は排他でなく共存可（領主が私設ギルドを持つ等）。ただし v0 推奨デフォルトは「どちらか一方を有効化」。

---

## 10. Non-Goals（v0 で作らない）

- **合戦リゾルバ（F10 `massBattleCore`）の流用**：大型クエストで呼ぶのは魅力だがスコープ外。`disaster` grade で十分。
- **ライバルギルド（§F8）**：**温め枠**。テーブルの「別 doc 先行」に従い `enableRivalGuild` は宣言だけして未配線でリリース。
- **冒険者の恒久死・恋愛 arc**：欠員はカウンタ処理。生死/恋愛は future arc（LW3 方針踏襲）。
- **フル戦術戦闘・在庫最適化・複数支部**：Non-Goal。

---

## 11. ファイル構成・段階リリース・DoD

### 11.1 新規ファイル

```
src/guildCore.ts           // 状態・週次 commit・イベント・clamp・validate・parseOps
src/guildRequestCore.ts    // REQUEST_DEFS・buildRequestQueue・resolve delta・board prompt
src/guildQuestCore.ts      // computeQuestGradeWeights・resolveQuestOutcome・report
src/guildDriftCore.ts      // snapshot・simulateBoardWeek・Since-last-visit
src/guildPromptCore.ts     // [Guild — …] lines・OPS_PROMPT_LINE・tier(bulk/full)
src/guildBridge.ts         // flag gate→lazy init→guildOps 適用→World タブ配線
```
テスト：`test_guild_core.js` / `test_guild_request.js` / `test_guild_quest.js` / `test_guild_drift.js`

### 11.2 実装順（各 PR 独立 DoD）

1. **G1** `guildCore.ts` ＋ `enableGuildMode` ＋ `weekly_commit`（開帳なし・stat/イベントのみ）＋ World タブ Guild パネル。
   *テスト:* validate/parseOps、event weight、commit determinism。
2. **G2** `guildRequestCore.ts` ＋ `enableGuildRequests` ＋ `resolve_request` ＋ 一括/面談 tier。
   *テスト:* queue 決定論、ruling delta、accept→quest 昇格、prompt injection 耐性。
3. **G3** `guildQuestCore.ts` ＋ `enableGuildParties` ＋ `assign_party` ＋ Bond 連動。
   *テスト:* grade weights（skill×Bond×difficulty）、同一 seed→同一 grade、欠員/持ち逃げ。
4. **G4** `guildDriftCore.ts` ＋ Since-last-visit ＋ `category:'guild'` 伝聞。
   *テスト:* drift determinism、cap、report sanitize。

### 11.3 DoD 共通（Domain 準拠）

- `npm run compile` / `npm test` green。
- 黄金律維持（会話自動生成なし）。
- 全 flag 既定 OFF で既存挙動不変（回帰なし）。
- 決定論テストで同一 seed→同一結果を固定。
- 並行開発配慮：新規ファイル＋パス指定コミット、`run_all_tests.js` 等ホット共有ファイルの同時編集回避。

---

## 12. §迷った時の既定（実装者向け）

| 迷い | 既定 |
|------|------|
| 週→季の境界 | week 1–12 spring / 13–24 summer / 25–36 autumn / 37–48 winter |
| `open_board` を毎週やるか | 任意。やらない週は既存 `pendingRequests` を持ち越し（上書きしない） |
| 受注クエストの difficulty 補正 | `renown` が高いほど高難度依頼が来る（重み側）。個別 quest の difficulty は `baseDifficulty` 固定でよい |
| パーティ人数 | 1–3 名。0 名 `assign_party` は no-op |
| Bond 未解決の冒険者 | `adventurerBondMap` に無ければ既定 50（`DEFAULT_OFFICER_TRUST` 相当）で中立扱い |
| rival 関連 | v0 は `enableRivalGuild` OFF 前提。`tickRivalGuild` は stub でよい |
| 面談 tier の発火 | `focusRequestId` が有効な `pendingRequests` を指すときのみ `full`。無効/未指定は `bulk` |

---

*本 doc は「別 doc 先行（温め枠）」方針の先行仕様。実装着手時は `DOMAIN_MODE_DESIGN.md` の該当セクションを親レシピとして随時参照すること。*
