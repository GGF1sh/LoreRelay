# Fable 5 Feature Proposals — Wave 2 設計ブリーフ集（F7–F12）

> **著者:** Claude Fable 5（2026-07-03）
> **前提:** Wave 1（F1–F6, `docs/FABLE5_FEATURE_PROPOSALS_DESIGN.md`）のうち F1 Chronicle / F2 Pacing / F3 Reputation / F4 Travel Encounter / F5 Replay Export は出荷済み。Domain Mode（D1–D5, `docs/DOMAIN_MODE_DESIGN.md`）は D3 UI と D4 市場ボーナスを残してコア完了（v1.39.9）。
> **本ブリーフの狙い:** 「D&D の領主」「太閤立志伝 II の内政」が骨格として入った今、**その骨格を"遊び"に変える層**を提案する。共通診断: Domain v1 は 1 領地・ライバル不在・家臣に使い道が少ないため、放置すると §1.4 の「乾いた表計算」リスクが再燃する。Wave 2 の主軸は **「領主の椅子に座る体験」（F7）と「世界の側にも意思がある」（F8）** の 2 本。
> **設計哲学（不変）:** ① LLM は narration 専任、数値・抽選は決定論 Core。② 新規ロジックは `*Core.ts`（vscode/fs 非依存の純関数）＋ JSON 契約。③ GM 注入は少トークンの行ビルダー。④ `game_rules.json` で **既定 OFF**。
> **命名注記:** 本ブリーフでは Fable5 トラックとして F7–F12 を振る。Domain 直系（F7/F8/F9/F10）は実装時に **D6–D9** として `PHASE_NAMING.md` の Domain 表へ再登録してよい（F3 が LW1 に合流した前例と同じ）。

---

## 0. 依存関係と推奨順序

```
（前提 P0）D3 Domain UI ── Wave 2 全体の土俵。先に出荷する
F7 Audience（謁見） ──── petition イベント/popularSupport を消費。単独で成立
F8 Rival Lords ────────→ F9 諜報派遣の対象・F10 合戦の相手・espionage/rumor_mill に実体を供給
F9 Officer Missions ───→ officers + 留守ドリフト再利用。F8 があると諜報が生きる
F10 Mass Battle ───────→ troops/defense の出口。F8 の raid / bandit_activity を解決
F11 Guild Master Mode ──→ Domain パターンの第2ロール。Quest Board + NPC Registry 再利用
F12 House Epilogue ────→ chronicleCore + replayExport 拡張。いつでも差し込める箸休め
```

| 順 | 機能 | コスト | 効き | 一言 |
|----|------|--------|------|------|
| 0 | **D3 UI（既存 P0）** | 中 | 大 | Wave 2 の前提。数値が見えないと F7 以降が刺さらない |
| 1 | **F7 謁見の間（Audience Hall）** | 小〜中 | 大 | D&D 領主体験の本丸。「裁く」は会話ゲーと最高相性 |
| 2 | **F8 隣国ライバル領主** | 中 | **最大** | 1 領地ソリティア問題の根治。太閤 II の「他の大名も生きている」感 |
| 3 | **F9 主命・派遣** | 小〜中 | 中〜大 | 家臣 5 人に使い道を与える。太閤 II の「主命」の逆側 |
| 4 | **F10 合戦リゾルバ** | 中 | 中〜大 | troops/defense の出口。3 ラウンド決定論で SLG 化を回避 |
| 5 | **F12 家史エピローグ** | 小 | 中（共有 wow） | 太閤立志伝エンディング年表。README/SNS 素材にもなる |
| 6 | **F11 ギルドマスターモード** | 大 | 大 | Domain の次の大物。v1.45+ の主軸候補として温める |

**推奨着手順:** D3 → F7 → F8 → F9 → F10 →（F12 は任意タイミング）→ F11。

---

## F7 — 謁見の間 / Audience Hall（裁定・陳情システム）

**一行:** 月に一度「謁見日」を開くと、領地の数値と世界状態から**決定論生成された陳情者 2–4 名**が現れ、プレイヤーが会話で裁く。裁定結果は `domainOps` 経由で数値に反映。

### なぜこれが本丸か
D&D の領主ファンタジーの中核は帳簿ではなく **「玉座に座って民を裁く」場面**。現状の `petition` イベントは narration ヒント 1 行で終わるが、LoreRelay は会話ゲーなので「陳情 → 尋問 → 裁定」はそのまま最良のゲームプレイになる。stat はここで「陳情の中身を決める入力」として生き、乾いた表計算の対極になる。

### 既存 seam
- `petition` / `bandit_activity` / `religious_friction` 等の Domain イベント（§8）→ 陳情の種
- `npcRegistry`（名あり NPC が陳情者として登場可）· `factionReputationCore`（商会/宗教の代表者）
- `domainOps` 専用チャネル（GM 直 patch 禁止の既存契約をそのまま使う）
- `chronicleCore`（「◯年春、領主は水争いを裁いた」）

### 新規 Core + 契約
`src/domainAudienceCore.ts`（純関数）
```ts
export interface Petition {
  id: string;                 // 'water_dispute' | 'tax_relief' | 'bandit_bounty' | …（allowlist）
  petitioner: { name: string; npcId?: string; factionId?: string };
  summary: string;            // テンプレ生成 ≤100字。LLM 生成ではない
  stakes: PetitionStakes;     // 各裁定選択肢の delta（treasury/popularSupport/publicOrder/factionRep）
}
// 陳情キューは stats + pendingEvents + factionRep + seed から決定論生成
export function buildAudienceQueue(domain, worldState, seed): Petition[];
export function resolvePetitionRuling(petition, rulingId): DomainDelta;
```
- `turn_result.domainOps` に `kind: 'audience_ruling'`（`petitionId` + `rulingId`）を追加。1 謁見日 = 月次行動 1 枠（actionCatalog に `audience` を追加）。
- GM には `[Domain — Audience]` ブロックで陳情者・争点・**選択肢ごとの帰結ヒント**を注入。GM は陳情者を演じ、プレイヤーの裁定を `audience_ruling` で確定するだけ。
- 裁定テンプレは 3 択基本（例: 原告支持 / 被告支持 / 折衷・領庫負担）＋ GM 自由裁定は「最も近い rulingId に丸める」規約。

### Game Rules（既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableDomainAudience` | `false` | 謁見システム（要 `enableDomainMode`） |
| `domainAudienceSize` | `3` | 1 謁見日の陳情数（1–4） |

### v0 スコープ（**engine 部 ✅ v1.39.10** — UI は D3 待ち）
- [x] `domainAudienceCore.ts` + 陳情テンプレ 10 種（allowlist）**✅**
- [x] `domainOps.kind: 'audience_ruling'` パース + `applyDomainOps` 適用（statePatch は既存 `applyDomainTurnOps` 経路で自動）**✅**
- [x] `[Domain — Audience]` プロンプトブロック（pending 陳情がある限り tier 非依存で毎ターン注入）**✅**
- [x] Chronicle `kind: 'domain'` に裁定行（`formatAudienceChronicleText`）**✅**
- [x] `scripts/test_domain_audience_core.js`（キュー決定論・delta・不正 rulingId・validate フィルタ、17 assert）**✅**
- [ ] i18n 4 言語（陳情/裁定ラベル）— **D3 UI と同時**（現状 UI 参照面が無い）
- [ ] World タブ「謁見」パネル・裁定チップ — **D3 と同梱**

> **実装メモ（v1.39.10）:** `audience` を月次行動カタログに追加し、コミットで `buildAudienceQueue` が `domain.pendingPetitions`（陳情 id の配列）を積む。裁定は `domainOps.audience_ruling` で1件ずつ消費。陳情の stakes はテンプレ id から純関数で再導出するため state に構造体を保存しない（`pendingPetitions` は id 文字列のみ）。`domainAudienceCore` は `domainCore` から**型のみ**を import（実行時依存は `domainCore → domainAudienceCore` の一方向）。

### Non-Goals
- 法廷シミュ・証拠システム（会話と 3 択で十分）
- 陳情文の LLM 生成（テンプレ + 変数のみ。演技は GM の仕事）

---

## F8 — 隣国ライバル領主 / Rival Lords Tick

**一行:** 隣接 region に **3 変数だけの軽量領主**（strength / aggression / stance）を置き、月次コミットごとに決定論で 1 手動かす。espionage・diplomacy・国境イベントに「実体」が生まれる。

### なぜ最重要か
太閤立志伝 II が単なる帳簿ゲーでなかったのは **他の大名も同じ盤上で生きていた**から。Domain v1 は意図的にライバルを外したが（Non-Goal: 全国統一シム）、その結果 `espionage` は空の噂を拾い、`diplomacy` は宛先のない外交になっている。「全国シム」と「ソリティア」の間に、**1 隣国 × 3 変数 × 月 1 手**という細い最適点がある。

### 既存 seam
- World Forge `regions` / `factions`（隣国の正本）· `factionReputationCore`（好悪）
- `neighbor_militarize` / `rumor_mill` / `spy_arrival` / `trade_route_disruption` イベント（既存 id をそのまま実体化）
- `flags.borderTension`（既存ストーリーフラグ）· `worldSimPersist` 月次 tick 経路
- Since-last-visit（留守中に隣国が動いた報告）

### 新規 Core + 契約
`src/rivalLordCore.ts`（純関数）
```ts
export interface RivalLord {
  regionId: string; factionId?: string;
  strength: number;      // 0–100（兵力・国力の合算 1 本）
  aggression: number;    // 0–100（Forge の danger / faction 敵対度から導出）
  stance: 'friendly' | 'neutral' | 'wary' | 'hostile';   // factionRep から離散化
}
// 月次: weighted roll で 1 手 { build | trade | raid_prep | envoy | raid }
export function tickRivalLord(rival, playerDomain, worldState, seed): RivalAction;
```
- `game_state.domain.rivals: RivalLord[]`（**最大 2**。v0 は 1 推奨）。
- Rival の手は **Domain イベント表への重み注入**として現れる（`raid_prep` → 翌月 `neighbor_militarize` 重み UP → `raid` → F10 へ）。直接 stat を書き換えるのは raid 成立時のみ。
- `espionage` / `gather_rumors` の結果が **rival の実数値開示**になる（「隣国の兵は約 300、当主は好戦的」）。FoW と同じ「知っている情報だけ GM に渡す」規約。
- `diplomacy` 行動 → `stance` 遷移表（決定論）+ `factionReputation` delta（既存 Core 再利用）。

### Game Rules（既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableDomainRivals` | `false` | ライバル領主 tick（要 `enableDomainMode` + `enableEmergentSimulation` 推奨） |
| `domainRivalCount` | `1` | 1 または 2 に clamp |

### v0 スコープ（**engine 部 ✅ v1.39.11** — UI は D3 待ち）
- [x] `rivalLordCore.ts`（導出・tick・stance 遷移・開示ゲート）**✅** — balance harness への rival 軌道追加は任意（未）
- [x] Domain イベント重み接続（`neighbor_militarize` +12 on `flags.rivalRaidPrep`）**✅**
- [x] `[Domain — Rival]` プロンプト行（**開示済み情報のみ**、compact 1 行）**✅**
- [x] espionage / gather_rumors / diplomacy 行動の効果を rival に配線 **✅**
- [x] `scripts/test_rival_lord_core.js`（tick 決定論・開示ゲート・stance 遷移・raid ゲート・validate、21 assert）**✅**
- [ ] World タブ「隣国」表示（開示情報のみ）— **D3 と同梱**
- [ ] i18n 4 言語

> **実装メモ（v1.39.11）:** v0 は**単一** rival（`domain.rival`、複数化は非スコープ）。`enableDomainRivals` ON + `domainRivalRegionId` 未指定時は World Forge の `Region.connectedTo` から自動選定（無ければ controlledRegionId 以外の最初の region）。`raid` は F10 合戦リゾルバ実装までの**暫定**解決（troops/defense比較の単純delta）— F10 出荷時に置き換え予定。

### Non-Goals
- ライバル領地のフル Domain 化（変数は 3 つまで。**内政 AI は作らない**）
- 領地の奪取・併合（v1 スコープ上限「領地 1 つ」を維持。raid は数値と物語で被害を与えるのみ）
- 3 国以上の外交網

---

## F9 — 主命・派遣 / Officer Missions

**一行:** 家臣を「諜報・行商・探索・折衝」に N ヶ月派遣し、帰還時に **skill + bond + seed の決定論判定**で結果報告を受け取る。太閤 II で秀吉が受けていた主命を、今度は**出す側**として遊ぶ。

### なぜ
D5 で家臣は Bond 接続されたが、現状の用途は評定 1 行と留守ドリフトのみ。「任命したのに使い道がない」は F7/F8 が入るほど目立つ。派遣は**留守ドリフトのパイプをそのまま逆向きに使える**ため実装が安い（派遣中の家臣が「留守」になる）。

### 既存 seam
- `officers[]`（npcId + role + skill）· `playerBondCore`（忠誠 = 成功率と裏切り分岐）
- `domainDriftCore` / since-last-visit（「帰還報告」の注入パターンをそのまま流用）
- F8 rivals（諜報の対象）· Cartography C9（探索派遣 → 遠隔 FoW 開示と接続可）
- `npcLifeEventsCore`（派遣先での決定的事件: 出奔・武勇伝）

### 新規 Core + 契約
`src/domainMissionCore.ts`（純関数）
```ts
export interface OfficerMission {
  officerNpcId: string;
  kind: 'espionage' | 'trade_run' | 'survey' | 'parley';
  targetId?: string;          // rival regionId / 商会 factionId / 未踏 locationId
  monthsRemaining: number;    // 1–3
}
export function resolveMissionOutcome(mission, officer, bond, seed): MissionOutcome;
// outcome: { grade: 'triumph'|'success'|'setback'|'disaster', deltas, reportLines }
```
- 発令は `domainOps.kind: 'dispatch_officer'`。帰還月の monthly_commit で自動 resolve → `[Domain — Council]` の直後に **帰還報告 1–3 行**を注入。
- 派遣中は評定に不在（council 行から除外）・留守ドリフトの steward 対象からも除外。
- bond が `rival` 以下の家臣を espionage に出すと `disaster`（寝返り・情報漏洩）の重みが上がる — **D5 の Bond 設計がそのままリスク管理ゲームになる**。

### Game Rules（既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableDomainMissions` | `false` | 派遣システム（要 `enableDomainMode`） |
| `domainMaxActiveMissions` | `2` | 同時派遣数（1–3） |

### v0 スコープ（**engine 部 ✅ v1.39.12** — UI は D3 待ち）
- [x] `domainMissionCore.ts` + 4 mission kind × 4 grade の結果テンプレ **✅**
- [x] `dispatch_officer` パース + 帰還 resolve の monthly_commit 配線 **✅**
- [x] council / drift（steward 判定）からの派遣中除外 **✅**
- [x] `scripts/test_domain_mission_core.js`（決定論・bond リスク・帰還月境界・上限・validate、23 assert）**✅**
- [ ] World タブ「派遣」表示 — **D3 と同梱**
- [ ] i18n 4 言語

> **実装メモ（v1.39.12）:** trust は `domainOfficerBondCore.buildOfficerTrustMap`（Registry disposition.playerTrust、既定50）で解決し `DomainConfig.officerTrustMap` として domainCore に渡す（rival の region 解決と同型のホスト側解決パターン）。月次コミット1回 = 1ヶ月経過。評定除外は `domainCore.applyMonthlyCommit` 内で完結、留守ドリフトの steward 判定除外は `domainDriftCore.ts` の `presentOfficers` フィルタ。帰還した月は評定に**復帰**する（「家族に迎えられ、その日のうちに助言する」という自然な扱い）。

### Non-Goals
- 派遣中の逐次イベント（帰還時一括報告のみ。途中経過は GM の脚色に任せる）
- プレイヤー同行（それは通常の Campaign 旅）

---

## F10 — 合戦リゾルバ / Mass Battle Resolver

**一行:** 盗賊討伐・国境紛争・raid 防衛を **3 ラウンド固定の決定論リゾルバ**で解決する。各ラウンド、プレイヤーは方針 1 つ（強攻/堅守/奇策）を選び、GM がラウンドごとに戦況を narrate する。

### なぜ
`troops` / `defense` / `train_troops` / `fortify` は現状「イベント重みを下げる保険」でしかなく、**出口（使う場面）がない**。かといってヘクス戦術マップは Non-Goal（CK3/信長級の複雑さ）。太閤 II の合戦がそうだったように、**数ラウンドの采配選択 + 兵数差**で十分にドラマになる。会話ゲーとしては「ラウンドごとに GM が戦場を描写 → プレイヤーが采配を宣言」が最良の形。

### 既存 seam
- `troops` / `defense` / officers（marshal の skill が補正）· `bandit_activity` / F8 `raid`（開戦トリガー）
- Agentic Referee（采配パースの二段確定と相性が良い）· dice.py（演出用の公開ロール可）
- Chronicle（「◯年冬、川辺の戦い。勝利、兵 20 を失う」）

### 新規 Core + 契約
`src/massBattleCore.ts`（純関数）
```ts
export interface BattleSide { troops: number; quality: number; commanderSkill: number; fortification?: number; }
export type Tactic = 'assault' | 'hold' | 'stratagem';
// 1 ラウンド: 戦力比 + 采配相性（三すくみの軽い重み ±15%）+ seed → 損耗と優勢
export function resolveBattleRound(a: BattleSide, b: BattleSide, tacticA, tacticB, seed, round): RoundResult;
export function concludeBattle(rounds: RoundResult[]): BattleOutcome; // victory|costly_victory|stalemate|retreat|rout
```
- 契約は `domainOps.kind: 'battle_round'`（采配 1 つ）→ 3 ラウンド目または途中崩壊で `BattleOutcome` 確定、`troops` / `publicOrder` / `prestige` / rival `strength` に delta。
- 敵采配は seed + aggression から決定論（GM は選ばない）。**GM は各ラウンドの数値結果を受けて描写するだけ** — 兵数を捏造しない規約は Domain と同一。
- 敗北 = ゲームオーバーではなく「撤退 + treasury/popularSupport 打撃 + `borderTension` フラグ」。sandbox を壊さない。

### Game Rules（既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableMassBattle` | `false` | 合戦リゾルバ（要 `enableDomainMode`。F8 なしでも盗賊戦で成立） |

### v0 スコープ（**engine 部 ✅ v1.39.13** — UI は D3 待ち）
- [x] `massBattleCore.ts`（ラウンド resolve・三すくみ・崩壊判定）**✅** — 100戦バランスharnessは任意（未）
- [x] `battle_round` 契約 + `domain.activeBattle`（戦闘中の状態そのもの。専用 flags は不要と判断） **✅**
- [x] `[Domain — Battle]` プロンプト（現ラウンド戦況 + 選択肢3つ + 数値捏造禁止行、tier非依存で毎ターン注入）**✅**
- [x] `scripts/test_mass_battle_core.js`（決定論・全滅ゲート・三すくみ有利判定・5分類・F8連携双方向、24 assert）**✅**
- [ ] World タブ「合戦」表示 — **D3 と同梱**
- [ ] i18n 4 言語
- [ ] Chronicle `kind: 'domain'` への戦闘結果記録（journal スキーマ拡張が必要、任意の追加作業として保留）

> **実装メモ（v1.39.13）:** v0 のトリガーは **F8 隣国ライバルの `raid` のみ**（`enableMassBattle` ON 時、rivalLordCore の暫定 raid delta を上書き）。`bandit_activity` 等からの単独開戦は非スコープ（将来拡張点として温存）。`fortification` は `hold` 采配時のみ効くボーナスとして実装（防備行動 `defense` stat を援用）。`domain.troops` は戦闘中は変更されず、決着時に一度だけ確定 delta を適用（月次アクション `train_troops` 等と混線しない設計）。

### Non-Goals
- ヘクス/グリッド戦術マップ・ユニット種別（歩兵/騎兵の内訳は narration の領分）
- 攻城戦の多段階化（v0 は野戦と防衛戦のみ。攻城は fortification 補正で表現）
- プレイヤー個人戦闘との混線（一騎打ちは既存 Campaign 戦闘 beat に委譲するヒント行のみ）

---

## F11 — ギルドマスターモード / Guild Master Mode（次の大物・温め枠）

**一行:** Domain Mode で確立した「role layer レシピ」（状態 JSON + 月次コミット + 専用 ops + 決定論 Core + GM narration）を **冒険者ギルド運営**に適用する第 2 ロール。Quest Board のクエストに **NPC 冒険者パーティを割り当てて送り出す側**を遊ぶ。

### なぜ温め枠か
コストが大きい（Domain 級のサブトラック 1 本）。ただし戦略的価値も大きい: ① Quest Board・NPC Registry・Bonds・派遣（F9 Core 流用）と**既存資産の再利用率が Domain より高い**。② 「領主」より現代の TRPG/なろう読者層に刺さる題材で、外向けコピーの主役になれる。③ Domain → Guild と 2 例できた時点で **role layer を汎用フレームワーク化**（`roleLayerCore`）でき、商人・学院長・教団長など第 3 以降のロールが量産圏に入る。

### 骨子（詳細設計は着手時に別 doc）
- `game_state.guild`: funds / fame / members[]（npcId + class + level）/ activeContracts[]
- 月次コミット: 依頼受注（Quest Board から）→ パーティ編成 → F9 同型の決定論 resolve → 成果報告・訃報・レベルアップ
- 失敗と死亡が Bond / lifeEvents に接続（「あの新人を無理な依頼に出した」が物語になる）
- GM は受付嬢・帰還報告・酒場の空気を narrate

### 先行判断が必要な点
- F9 Mission Core を guild resolve に流用できる形で書く（**F9 実装時に guild を意識した引数設計にする**こと — 本ブリーフ唯一の先行投資）
- `PHASE_NAMING.md` に **G トラック（G1…）** を新設するか、Domain の D 系に載せるか → G トラック推奨（別ロールは別軸）

---

## F12 — 家史エピローグ / House Chronicle & Epilogue Export

**一行:** Chronicle + Domain + Bonds から **太閤立志伝エンディング風の「家史」**（年表 + 家臣・隣国・派閥それぞれの「その後」）を決定論テンプレで生成し、Replay Export（F5）の新テンプレとして書き出す。

### なぜ
勝敗のないサンドボックスは「終わりの儀式」が弱い。既存の Replay Export はセッションログの書き出しだが、**キャンペーン単位の締め**として「◯◯家の記録: 3 年の治世、baron 叙任、家臣 Sayo は終生仕えた」が出ると、遊び終わりが共有可能な作品になる。README / Booth シナリオパックの実績スクリーンショットとしても機能する。

### 既存 seam
- `chronicleCore`（年表）· `replayExportSanitizeCore`（公開サブセット規約）
- `playerBondCore` / `npcLifeEventsCore`（「その後」テンプレの分岐入力: trusted → 「終生仕えた」、betrayal → 「袂を分かった」）
- `domain.rank` / `prestige` / stats 最終値（治世の総括行）· `factionReputation`

### 新規 Core
`src/epilogueCore.ts`（純関数）
```ts
export function buildHouseEpilogue(input: {
  chronicle: ChronicleChapter[]; domain?: DomainState;
  bonds: PlayerBondLike[]; factionRep: FactionRepLike[];
}): EpilogueDoc;  // { title, reignSummary, timeline, fates: { name, fateLine }[] }
```
- 全行テンプレ + 閾値分岐の決定論生成（Chronicle と同じ幻覚ゼロ方針）。LLM に「エピローグを書かせる」**任意モード**は将来枠（既定は決定論のみ）。
- 出力: Markdown / HTML（Replay Export の既存テンプレ機構に `house-epilogue` テンプレを追加）。

### v0 スコープ
- [ ] `epilogueCore.ts` + fate テンプレ（bond 5 段階 × lifeEvent 有無、i18n 4 言語）
- [ ] Replay Export にテンプレ追加 + コマンド `LoreRelay: Export House Epilogue`
- [ ] `scripts/test_epilogue_core.js`（分岐網羅・domain なし時の劣化動作）

### Non-Goals
- LLM 自由文エピローグを既定にすること（テンプレが正本）
- 続編セーブへの継承（世代交代は Domain v2 以降の議題）

---

## 13. バージョン計画（案）

| Ver | 内容 | 備考 |
|-----|------|------|
| 1.40.0 | **D3 Domain UI**（既存 P0）+ E Replay domain pick | Wave 2 の前提 |
| 1.41.0 | **F7 Audience** | actionCatalog `audience` 追加・D4 市場ボーナス同梱可 |
| 1.42.0 | **F8 Rival Lords** | balance harness に rival 軌道 |
| 1.43.0 | **F9 Missions**（guild 流用を意識した API で） | F8 後だと諜報が生きる |
| 1.44.0 | **F10 Mass Battle** | F8 raid の解決手段として |
| 1.4x.x | **F12 Epilogue** | 箸休め枠。どこに挟んでもよい |
| 1.45+ | **F11 / G1 Guild Master** | 別 doc（`docs/GUILD_MODE_DESIGN.md`）を先に書く |

**ブリーフ追加のみでは Ver は上げない**（`PHASE_NAMING.md` の規約どおり）。

## 14. 横断の受け入れ基準（全機能共通）

- `enable*` OFF 時: state に該当キーが残っていても読まない・注入しない・UI 非表示
- 決定論: 同一 seed + 同一入力で同一結果（テストで assert）
- プロンプト予算: 各ブロックは compact 既定・full は commit/戦闘ターンのみ（Domain §10.3 と同型）
- GM の数値捏造禁止行を各ブロック末尾に必ず 1 行
- `npm test` 全緑 + 新機能ごとに専用テストスクリプト + i18n 4 言語

## 15. AI 申し送り（1 行）

```
Fable5 Wave 2（F7–F12）ブリーフ済み。着手順: D3 UI → F7 謁見 → F8 ライバル領主 → F9 派遣 → F10 合戦。F9 は guild 流用を意識した API 設計にすること。正本 docs/FABLE5_WAVE2_PROPOSALS_DESIGN.md。
```
