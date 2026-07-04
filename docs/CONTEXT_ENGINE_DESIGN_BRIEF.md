# Context & Knowledge Engine — Design Brief (v0.1, north-star)

> ステータス: **設計依頼(未実装)**。この文書は Architecture Owner が「北極星設計」を確定させるための入力ブリーフであり、確定仕様ではない。実装着手はまだ。
> 起草: 2026-07-04, Opus 4.8(Architecture Owner ロール)。ChatGPT 5.5(概念拡張)/ Sonnet 5(スコープ制御)/ ユーザーの多AI相談から統合。
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

// --- 4.2 知識台帳(MVP: 伝播シミュレーションなし) ---
type KnowledgeEntry = {
  factId: string;
  acquisitionType: 'witnessed' | 'told' | 'document' | 'inferred';
  confidence: number;
  acquiredAt: number;         // worldTurn
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
type ContextBuildResult = {
  bundle: ContextBundle;         // mandatory / currentScene / speakerIdentity /
                                 // relationships / relevantMemories /
                                 // relevantWorldFacts / rumors /
                                 // activeCommitments / compressedBackground
  accounting: {
    candidatesConsidered: number;
    included: ContextDecision[];   // {itemId, category, tokens, reason}
    omitted: ContextDecision[];    // {itemId, reason: 'inaccessible'|'low_relevance'|'budget_exceeded'|'redundant'}
    tokenBudget: number;
    tokenUsed: number;
    truncationOccurred: boolean;
  };
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

予約例(12,000 tokens):
```text
System / Rules      2,000   (現行 PROMPT_NEVER_EVICT に相当)
Current Scene       2,000
Speaker Identity    1,000   ← 予約で保護。世界イベントに食われない
Relationships       1,000
Relevant Memories   2,000
World Information    1,500
Recent Events        1,000
Flexible Pool        1,500   ← カテゴリ間の余りを競う
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

## 9. Architecture Owner への確定タスク(このブリーフの次)

1. §4 スキーマを確定(特に EntityRef/LocationRef/ClockSnapshot/TokenBudget の定義)。
2. `canAccessFact()` / `buildAwareness()` の**決定論的**シグネチャと不変条件を定義。
3. §1 の既存機構を Engine へ寄せる **migration 経路**(subsystem が prompt chunk を書く現行 → subsystem が `ContextProvider` として候補を registerする形へ)。Shadow Mode(P1)があるので旧経路と並走で漸進移行可能。
4. char→token 移行の tokenizer 依存をどう pure core に閉じ込めるか(現行は char 基準)。
5. Failure modes 一覧(Adversarial Tester への投入前提)。

> **今は実装フェーズではない。北極星設計を1本作るフェーズ。この基幹は今後100コミット規模に影響し得る。**
