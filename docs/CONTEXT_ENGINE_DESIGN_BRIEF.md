# Context & Knowledge Engine — Design Brief (v0.2, north-star)

> ステータス: **設計依頼(未実装)**。この文書は Architecture Owner が「北極星設計」を確定させるための入力ブリーフであり、確定仕様ではない。実装着手はまだ。
> 起草: 2026-07-04, Opus 4.8(Architecture Owner ロール)。ChatGPT 5.5(概念拡張)/ Sonnet 5(スコープ制御・実コード検証)/ ユーザーの多AI相談から統合。
> v0.2: Grok・Gemini 3.1 Pro・ChatGPT 5.5 のレビューを反映(§2/§3/§4/§6/§9 更新)。3AI 独立収束の合意事項は locked、真の設計判断は §9 Open Questions へ。
> 対象バージョン: v1.76.0 実測時点。

---

## 0. なぜ今これが必要か(1段落)

LoreRelay は機能が膨大化した(Core だけで 126 ファイル、Campaign / Commerce / NPC Bonds / Settlement / Domain / Guild / Vehicle / World Observatory …)。各サブシステムが**独立に「自分の情報を優先度つきで GM プロンプトへ足す」**構造のため、機能追加ごとに総トークンが単調増加する。これは今後 LoreRelay 最大級のボトルネックになる。しかしこれは単なる「トークン削減」問題ではない。世界を作り、人を作り、市場・拠点・車両を作った次に必要なのは **「その世界で、誰が、何を知っていて、今この瞬間に何を思い出すべきか」を決める基幹** = Context & Knowledge Engine である。トークン削減はその副産物にすぎない。

---

## 1. 現行コードの棚卸し(実測・行番号付き)

**重要: Context Engine は新設ではない。`gmPromptBuilderCore.ts` の Budget/Priority/Activation 層を格上げする話。** 以下は 2026-07-04 に実コードを読んで確認した「既存の萌芽」。設計は必ずこの現物の上に被せること(二重実装厳禁)。

| 既存機構 (実ファイル) | 現在の役割 | Context Engine 上の対応概念 | 格上げ内容 |
|---|---|---|---|
| `PROMPT_CHUNK_PRIORITIES` (gmPromptBuilderCore.ts:410) | サブシステム別の**静的フラット優先度マップ**(campaignKit:94, campaignResources:91…) | Token Budgeter の原始形 = まさに「priority 91 なので入れて」戦争 | カテゴリ予約制 + provenance へ |
| `evictPromptChunksByBudget` / `evictMutablePromptChunks` (:589 / :536) | 文字数超過時に低優先度から drop/truncate | **既存の Budget Layer** | char→token、単一pool→カテゴリ予約pool、accounting 出力追加 |
| `PROMPT_NEVER_EVICT_CHUNK_IDS`=[gameRules,narrativeTime] (:446) | Tier 0 予約(絶対に落とさない) | **カテゴリ予約の原始形** | N カテゴリ予約へ一般化 |
| `shouldIncludePromptChunk` (:484) | モジュール ON/OFF で足切り | Accessibility の**モジュール粒度版** | "モジュール単位"→"アクターの知識単位"へ |
| `clampSimulationPromptModule` / `MAX_..._CHARS=2800` (:398) | モジュール単位の頭切り truncate | LOD なしの原始圧縮 | LOD 0–4 の段階圧縮へ |
| `fogOfWarCore.ts` | 地図の可視/不可視 | **Accessibility(空間軸)** | 情報アクセス可能性の一種として吸収 |
| `npcWhereaboutsTrustCore.ts` / `applyIntroductionTrustBoost`(LW3-W) | 信頼度で NPC 所在の可視性を制御 | **Accessibility(社会軸)** | 同上 |
| `cartographyRevealCore.ts` / `rumorKnownRegionIds` | 地図・伝聞アイテムの獲得 | **Acquired Knowledge** | KnowledgeEntry へ |
| `recentChanges` カテゴリ昇格(livingWorldBridge) | 世界変化を伝聞として GM へ | **Recent Memory / 伝聞** | Memory Ledger へ |
| `npcLifeEventsCore.ts` / `npcMilestones` | 盟友契り/宿敵等の一度きり発火 | **Episodic Memory** | Entity Timeline Index へ |
| `npcRelationshipCore.ts` (affinity) | 関係ラベル | **Retrieval relevance の一因子** | re-rank スコアの一項へ |
| `chronicleCore.ts` / `chronicleJournalCore.ts` | 年代記 | 期間要約(Medium/Long-term Memory) | Memory LOD へ |
| `worldObservatoryCore.ts`(リングバッファ24件) | 相場履歴 | 時間 LOD の先例(踏襲すべき実装パターン) | — |
| `parlorPromptBuilderCore.ts` / `parlorSessionCore.ts` | 1対1 NPC 会話 | **P0 Pilot の対象** | 最小の実験場 |
| `gameStateWebviewSanitizeCore.ts:sanitizeStatePatchForWebview()`(:330) | 内部 state → Webview 送出前の削除/変換 | **Context Accounting の audience 分離の先例** | Internal Full Accounting / User-safe Accounting の分離はこのパターンを踏襲(新規発明ではない) |

**実測で確定した1点(2026-07-04, Sonnet 5 検証)**: `parlorPromptBuilderCore.ts` は `PROMPT_CHUNK_PRIORITIES` / `evictPromptChunksByBudget` を**一切参照しない**。つまり §2/現行コードの「worldState:68 > memory:45」eviction リスクは **`gmPromptBuilderCore.ts` 経路(Campaign/GM モード)限定**であり、Parlor モードは影響を受けない(別経路で identity を供給しているため)。「NPCが自分が誰か忘れる」という v0.1 の表現はこの意味で範囲が広すぎた。正確には: **「現行のフラット eviction では、GM/Campaign モードにおいて会話主体に重要な記憶・Lore が世界状態より先に削除され得る構造的リスクが実在する」**。

> ⚠️ 表の下半分(recentChanges 昇格 / introduction trust boost の内部)はメモリ由来の記述であり、本セッションでファイルを直接読んでいない項目を含む。**Repository-wide Consistency Review(Gemini ロール)が、この表を1件ずつ現地確認して確定させること。**

---

## 2. ロックされた7つの制約(全AI合意済み・変更にはユーザー承認要)

1. **Rumor propagation は MVP 対象外。** 情報伝播(hop/distortion/confidence が世界を移動する Information Packet)は概念として保持するが実装は後続フェーズ。MVP の rumor は「既に取得済みの低信頼 Knowledge」で代替する。
2. **Semantic retrieval は optional かつ pluggable。** MVP は埋め込みゼロで完全動作する。local-first の本体は semantic 検索なしで成立しなければならない。方式(transformers.js / Ollama embed / 外部API)は**決めない**。決めるのは「必須にしない」ことだけ。
3. **Accessibility と Current Awareness は導出物であり、正本台帳を作らない。** 永続するのは World Truth / Knowledge / Memory の3つのみ。Accessibility と Awareness はリクエスト時に `canAccessFact()` / `buildAwareness()` で導出する。
4. **既存機構の全件棚卸しを設計確定前に完了する(§1)。** 新概念を発明する前に既存実装へ寄せる。二重実装は禁止。
5. **Context Accounting / Provenance は必須。** 全 ContextItem は出所(source)を持ち、選択結果は included/omitted を理由つきで説明可能でなければならない。
6. **最初の Pilot は Context Inspector(GM へ渡さない可視化)であり、live GM 置換ではない。**
7. **Shadow Mode 比較を rollout 前に行う。** 旧プロンプト経路と新 Context Engine を並走させ差分を比較してから opt-in。

---

## 3. 層モデル(5概念・3永続台帳)

```text
1. World Truth        ← 永続台帳: 実際に起きたこと(Event/Fact Ledger)
2. Accessible Info    ← 導出: canAccessFact(actor, fact, ctx)  ※保存しない
3. Acquired Knowledge ← 永続台帳: KnowledgeLedger(誰が実際に知ったか)
4. Memory             ← 永続台帳: MemoryLedger(今も覚えているか / LOD付き)
5. Current Awareness  ← 導出: buildAwareness(request)  ※保存しない
```

- 永続する: **World Truth / Knowledge / Memory**。
- 毎回導出する: **Accessibility / Awareness**(所属変更で可視性が変わる、user message 依存のため)。
- 最終的に GM プロンプトへ入るのは「このアクターが知っていて、今回の会話で思い出しそうな情報」= Awareness の出力のみ。

### ⚠️ v0.1 のバグ修正: Access と Recall は別の判定(ChatGPT 5.5 指摘, 確定採用)

v0.1 は「Accessibility は導出、`canAccessFact()` で判定」とだけ書いており、これを**既得知識の再想起(recall)判定にも使ってしまう読み方ができた**。それは誤り。例: Alice が商人ギルド所属時代に秘密を知り、その後脱退した場合——

- 現在の Access(そのギルド情報網への**新規アクセス**) = ない
- 既に持っている Knowledge(その秘密) = ある、消えない

`canAccessFact()` は **「新しく知識を取得できるか」にのみ使う。既に Acquired Knowledge になった情報の再想起には使ってはならない。** これは Invariant として明文化する:

```ts
canAcquire(actor: EntityRef, source: InformationSource, ctx: WorldContext): boolean;  // 新規取得のゲート
canRecall(actor: EntityRef, entry: KnowledgeEntry, ctx: WorldContext): boolean;        // 既得知識の想起判定(salience/staleness等が要因、accessibilityではない)
```

Access を失っても Knowledge は保持される、というのが不変条件。Architecture Owner はこの2関数を明確に別シグネチャとして確定させること(§9 Q5)。

### 決定論と semantic の境界(pure-core 志向との和解)

> **Engine は (WorldState, KnowledgeLedger, MemoryLedger, ContextRequest) に対して決定論的でなければならない。唯一の非決定論源は optional な Semantic Retriever で、それは candidate generation 段にのみ隔離する。** 選択(re-rank)と予算(budget)段は完全に決定論・再現可能・テスト可能に保つ。これが「pure core 志向」と「hybrid 検索」の両立点。**embedding に "このNPCが知っているか / 開示していいか" を判定させてはならない(それは deterministic)。** semantic は「意味的に関係する昔の事件を候補として拾う」補助輪に限る。

パイプライン:
```text
World  →  1.Access/Knowledge Filter (deterministic)
       →  2.Candidate Generation
       →  3.Retrieval (Entity/Location/Faction/Topic/Time, deterministic)
       →  4.Semantic Search (optional, 候補追加のみ)
       →  5.Deterministic Re-ranking
       →  6.Token Budgeter (category-reserved)
       →  7.Compression / LOD
       →  AI
```

---

## 4. コアスキーマ(たたき台・Architecture Owner が確定)

```ts
// --- 4.0 時計参照(bare number 禁止, Grok/ChatGPT 指摘・確定採用) ---
// 理由: 実際に過去 gmTurn/worldTurn 混同インシデントが発生済み
// (CHANGELOG.md:94 "Replay gallery matches gmTurn not worldTurn")。
// Domain/Guild/Simulation はそれぞれ別の時間概念を持つため bare number は禁止。
type ClockRef = { clock: 'world' | 'gm' | 'domainMonth' | 'guildDrift' | 'simTick'; value: number };

// --- 4.1 出所を必ず持つ Context の最小単位 ---
type ContextItem = {
  id: string;
  content: string;            // LOD に応じて差し替わる本文
  source:
    | { type: 'world_fact'; id: string }
    | { type: 'memory'; id: string }
    | { type: 'relationship'; id: string }
    | { type: 'rumor'; id: string }
    | { type: 'current_scene' }
    | { type: 'system_rule'; id: string };
  certainty: number;          // 情報の確からしさ(0..1)
  relevanceScore: number;     // §5 の合成スコア
  tokenCost: number;          // char ではなく token で
  lod: 0 | 1 | 2 | 3 | 4;     // 0=IDのみ … 4=原文
};

// --- 4.2a World Fact と Claim/Proposition の分離(3AI 独立収束・確定採用) ---
// Grok・Gemini・ChatGPT が独立に同じ穴を指摘: factId 参照だけでは
// 「誤解」「古い情報」「勘違い」を表現できない(真実しか弱く信じられない)。
// 例: World Truth = King.deadCause:'illness' だが
//     Alice の Knowledge は Claim「王は暗殺された」confidence 0.7 になり得る。
type Claim = {
  id: string;
  subject: EntityRef;
  predicate: string;
  value: JsonValue;
  truthRelation?: 'confirmed' | 'contradicted' | 'unknown';  // World Truth との関係(GM/Engine内部の正本判定用、actorには見せない)
};

// --- 4.2b 知識台帳(MVP: 伝播シミュレーションなし) ---
// ⚠️ 「誰の知識か」(actor-owned ledger か global ledger+knower参照か)は
// Architecture Owner が確定させる未決事項。§9 Q1 を参照。以下は暫定形。
type KnowledgeEntry = {
  actor: EntityRef;                                            // 誰の知識か(v0.1で欠落していた必須フィールド)
  claimId: string;                                              // factId ではなく Claim を指す
  acquisitionType: 'witnessed' | 'told' | 'document' | 'inferred';
  confidence: number;
  acquiredAt: ClockRef;                                         // bare number 禁止
};

// --- 4.2c 記憶台帳(参照+想起メタデータ、Knowledgeの複製ではない。二重正本を避ける) ---
type MemoryEntry = {
  actor: EntityRef;
  knowledgeRef?: string;      // KnowledgeEntry への参照(複製しない)
  eventRef?: string;          // TimelineEvent への参照
  memoryType: 'episodic' | 'semantic' | 'relationship' | 'commitment';
  salience: number;           // recall されやすさ(staleness減衰の入力)
  lastRecalledAt?: ClockRef;
  summaryRefs: { lod1?: string; lod2?: string; lod3?: string };  // LOD別の要約文への参照
};

// --- 4.3 Entity Timeline Index(全文検索ではなく索引) ---
type TimelineEvent = {
  eventId: string;
  worldTurn: number;
  eventType: string;
  participants: EntityRef[];
  locations: LocationRef[];
  factions: EntityRef[];
  topics: string[];
  importance: number;
  emotionalWeight?: number;
  summary: string;
  sourceRefs: string[];
};

// --- 4.4 差し替え可能な候補取得器(semantic は optional 実装) ---
interface ContextCandidateRetriever {
  retrieve(request: RetrievalRequest): Promise<ContextCandidate[]>;
}
type ContextCapabilities = { semanticRetrieval: boolean; localEmbedding: boolean };

// --- 4.5 入力 ---
type ContextRequest = {
  mode: 'parlor' | 'in_world_chat' | 'campaign' | 'observer';
  speaker?: EntityRef;
  interlocutors: EntityRef[];
  playerRole?: EntityRef;
  currentLocation?: LocationRef;
  currentSituation?: string;
  userMessage: string;
  clocks: ClockSnapshot;
  budget: TokenBudget;
};

// --- 4.6 出力: bundle + accounting(#5 制約) ---
// ⚠️ Gemini 指摘(確定採用): Context Accounting をそのまま Webview/Remote Player へ
// 出すと "Omitted: 暗殺者の正体(理由: inaccessible)" のように
// 「秘密が存在すること自体」が漏洩する(過去の Map Overlay ID 漏れ修正と同種の罠)。
// gameStateWebviewSanitizeCore.ts の sanitize パターンを踏襲し、
// Internal Full Accounting と User-safe Accounting を必ず分離する。
// P0 Context Inspector は GM/Developer 専用画面とし、Remote Player へ生送りしない。
type ContextBuildResult = {
  bundle: ContextBundle;         // mandatory / currentScene / speakerIdentity /
                                 // relationships / relevantMemories /
                                 // relevantWorldFacts / rumors /
                                 // activeCommitments / compressedBackground
  accountingInternal: {          // GM/Developer専用。sanitize前提でWebviewへ渡さない
    candidatesConsidered: number;
    included: ContextDecision[];   // {itemId, category, tokens, reason}
    omitted: ContextDecision[];    // {itemId, reason: 'inaccessible'|'low_relevance'|'budget_exceeded'|'redundant'}
    tokenBudget: number;
    tokenUsed: number;
    truncationOccurred: boolean;
    retrievalReceipt?: RetrievalReceipt;  // semantic retriever使用時のみ、Shadow/Debug用
  };
  accountingUserSafe?: {         // Remote Player等へ出してよい要約のみ(存在の有無を漏らさない粒度)
    truncationOccurred: boolean;
    tokenUsed: number;
    tokenBudget: number;
  };
};

// --- 4.7 Semantic Retriever 使用時の再現性(ChatGPT指摘, Shadow/Debug用途に限定) ---
// embeddingモデル更新等でcandidate setが変わると、re-rankがdeterministicでも結果が変わる。
// 本編の正本には保存不要だが、Shadow Mode比較・デバッグには必須。
type RetrievalReceipt = {
  retrieverId: string;
  retrieverVersion: string;
  candidateIds: string[];
  queryHash: string;
};
```

---

## 5. Re-ranking スコア(semantic は一項にすぎない)

```text
FinalScore =
  + task relevance
  + entity overlap
  + relationship relevance
  + location relevance
  + faction relevance
  + recency
  + importance
  + emotional salience
  + active goal relevance
  + explicit user mention
  - staleness
  - redundancy
  - token cost penalty
  (+ semantic score  ← optional, capability ON 時のみ)
```

---

## 6. Token Budgeter — カテゴリ予約制(現行フラット eviction の後継)

現行 `evictPromptChunksByBudget` は「pinned 予約 → 単一フラット mutable pool を優先度 evict」の2層。これを **N カテゴリ予約 + 可変 pool** へ格上げする。理由: 現行だと世界イベント(worldState:68)が identity/memory(memory:45, lorebook:40)より上位で、Opus 指摘の**「NPC が自分が誰か忘れる」**が実コードで起こり得る。

### ⚠️ v0.1 の固定割当は第二の「priority戦争」になり得る(3AI 収束・確定採用)

固定額の予約(Speaker Identity=1,000 固定など)は、方向は正しいが、Current Scene が 1,100 しか使わず 900 が死蔵される・Memory が今回 3,000 必要でも 2,000 で頭打ちになる、という新たな硬直を生む。**`min/target/max + borrowUnused` モデルへ変更する:**

```ts
type CategoryBudget = { min: number; target: number; max: number; borrowUnused: boolean };
```

アルゴリズム: (1) 全カテゴリへ `min` を保証 → (2) `target` まで配分 → (3) 余剰を Flexible Pool へ戻す → (4) relevance 順に `max` まで借用可。

予約の目安(12,000 tokens、`min/target/max`):
```text
System / Rules      2,000 / 2,000 / 2,000  (現行 PROMPT_NEVER_EVICT に相当、可変なし)
Current Scene         800 / 2,000 / 2,500
Speaker Identity       500 / 1,000 / 1,500  ← min保証で世界イベントに食われない
Relationships          300 / 1,000 / 1,500
Relevant Memories      800 / 2,000 / 3,000
World Information      500 / 1,500 / 2,000
Recent Events          300 / 1,000 / 1,500
Flexible Pool            0 / 1,500 / —      ← カテゴリ間の余りを吸収
```

+ Context LOD: 同一情報を LOD 0(ID)〜4(原文)で保持し、予算に応じて Engine が段階を選ぶ(Three.js / 地図 LOD と同じ発想)。例: `Bob: trusted friend` → `…recently disagreed over caravan policy` → 全文。

---

## 7. Pilot ラダー(小さく始める)

- **P0 — Context Inspector**: GM へ渡さない。NPC 選択 + user message → `[Build Context]` → included/omitted を理由つき表示。**選択ロジックだけを検証**。
- **P1 — Shadow Mode**: 旧プロンプトで実運用しつつ、裏で新 Engine も動かし Old vs New を比較。
- **P2 — Parlor Opt-in**: 設定 ON 時のみ Parlor Mode で新 Engine。
- **P3 — Default**: 既定化 → In-World Chat → Campaign GM → Full Living World の順に拡大。

Pilot 対象は最小の `parlor*Core.ts`(1 NPC / 1 User / 1 会話)から。この段では Speaker Identity / Relationships / Relevant Memories / Known Facts / (低信頼)Rumors のみ。

---

## 8. モデル / ロール分担

| ロール | モデル / 推論 | 担当 |
|---|---|---|
| Architecture Owner | Opus 4.8 / high–max | concept boundaries, invariants, schemas, migration, 既存統合, failure modes。**コードは書かない** |
| Systems Critic | ChatGPT / high | Freeciv/FreeOrion/Screeps 比較, 抽象化の過不足, subsystem duplication, scalability |
| Repo-wide Consistency | Gemini / high | 全 repo 横断, §1 棚卸し表の現地確認, 「その機能もうあるぞ」検出 |
| Adversarial Tester | Grok | 100万Event/1万NPC/500年/同名NPC/記憶改竄/嘘/複数世界/記憶喪失 で壊す |
| Narrative UX Owner | Fable 5 | 何を自然に思い出すか, どう忘れるか, rumor 表現, 不確実性, 「知らない」の自然な返し |
| Implementation Owner | Sonnet 5 | 設計確定後: pure core / parser / tests / migration / integration |

---

## 9. Architecture Owner への Open Questions(v0.2, Grok/Gemini/ChatGPT 合意の上で残った真の設計判断)

以下は「意見が割れている」のではなく、**3AIレビューを経てなお Architecture Owner が明示的に決めないと下流(スキーマ・Pilot実装)が全部やり直しになる決定事項**。コードは書かず、この10問への回答をもって v0.3(確定仕様)とすること。

1. **KnowledgeEntry の所有モデル**: actor-owned ledger(`ActorKnowledgeLedger { actor, entries[] }`)か、global ledger + knower参照か? — Grok 曰く「これを先に決めないと全部ブレる」、最優先。
2. **Knowledge は canonical fact のみを参照するか**: false belief / outdated belief / contradiction をどう表現するか(§4.2a の Claim 分離は3AI合意で確定済みだが、contradiction 解決ロジックの粒度は未決)。
3. fact/claim/proposition の分離を Pilot(P0)スコープでどこまで実装するか(スキーマは4.2aで確定、MVP実装範囲は未定)。
4. §4.2b の `KnowledgeEntry.actor` フィールド追加は本ブリーフで確定済み。追加の invariant(同一 actor に対する矛盾する claim の共存を許すか)を定義せよ。
5. `canAcquire()` / `canRecall()` (§3 バグ修正で分離済み)の正式シグネチャと、EntityRef/LocationRef/WorldContext の型定義。
6. MemoryLedger(§4.2c で暫定形は提示済み)を正式化し、salience の減衰関数(staleness計算)を決定論的に定義せよ。
7. §6 の `min/target/max + borrowUnused` アルゴリズムの厳密な擬似コード化(競合時の再配分順序)。
8. §4.6 の Internal/User-safe Accounting 分離の具体的なフィールド境界線(何を user-safe 側に残してよいか)。
9. `ContextCandidateRetriever` interface(§4.4)を正式 schema へ昇格し、既存 subsystem がどう `ContextProvider` として register するかの migration 経路(prompt chunk を書く現行 → 候補を提供する形へ)。
10. Failure modes 一覧の作成(Adversarial Tester = Grok への投入前提: 100万Event/1万NPC/500年/同名NPC/記憶改竄/複数世界時計)。

### 保留中の実務判断(Architecture Owner確定を待つ、今は着手しない)

- **現行 priority 数値の緊急パッチ(`memory:45`を上げる等)は保留。** ChatGPT/Grok 一致: 数字だけ動かすと別の chunk が落ちるだけ。先に「巨大worldState + 必要なNPC memory + 予算超過 → 何が実際に落ちるか」を**GM/Campaignモード限定で**再現するテストを書き、実害箇所を確定してから対処する(長期解は §6 の Category Budgeter)。
- char→token 移行の tokenizer 依存を pure core にどう閉じ込めるか(現行は char 基準)。

> **今は実装フェーズではない。北極星設計を1本作るフェーズ。この基幹は今後100コミット規模に影響し得る。**
