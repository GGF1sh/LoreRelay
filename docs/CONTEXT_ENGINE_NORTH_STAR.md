# Context & Knowledge Engine — North-Star Spec (v0.4)

> ステータス: **北極星仕様(Draft、4AIレビュー中)**。Architecture Owner(Opus 4.8)が [`CONTEXT_ENGINE_DESIGN_BRIEF.md`](CONTEXT_ENGINE_DESIGN_BRIEF.md) v0.2 §9 の Open Questions 10問に決定を下したもの。
> 起草: 2026-07-04, Opus 4.8。v0.3.1でactor≤10前提を§0のみ訂正→**本文への伝播漏れをChatGPT 5.5レビューが指摘、v0.4でQ1根拠/F5/F7/§5を全面修正(Sonnet 5検証・反映)**。
> **この後も Grok(adversarial)/ Gemini(repo consistency)/ ChatGPT(systems critic)/ Fable 5(narrative UX)のレビューを前提とする。まだ実装しない。**
> 各決定に **可逆性(Reversibility)** を付す: `LOAD-BEARING`=後から覆すと下流総やり直し / `TUNABLE`=後から数値・実装を差し替え可能。

---

## 0. 設計を規定する実測前提(v0.3.1 で訂正)

> **訂正(2026-07-04, ユーザー確認)**: `MAX_NAMED_NPC_RELATIONSHIP=10` は pre-1.0 の超初期に置かれた定数で、**「実際に狙う規模」を検討した上での設計決定ではない**。ユーザーの意向は「**スペックが許す限り大規模、ただしユーザーが設定可能な数字**」。以下、Actor数を10固定と仮定していた箇所を訂正する。

| 実測値 | 実ファイル | 訂正後の扱い |
|---|---|---|
| 名ありNPC **≤10体**(`slice(0,10)` で強制、5ファイル16箇所) | npcRelationshipCore.ts:12, npcAgencyCore.ts:15, npcRegistry.ts, npcBondEffectsCore.ts, npcLifeEventsCore.ts | **legacy 定数、design constraint として扱わない。**上限は将来 `enableNpcRelationships` 系フラグと並ぶ設定値(`maxNamedNpcCount`)にすべき。数値自体はこの spec の範囲外 |
| NPCあたり記憶 **≤10件** | npcRegistry.ts:23 (`MAX_MEMORIES_PER_NPC`) | 同上、legacy。Memory の LOD 圧縮(§Q6)がある以上、件数上限より **token/salience 予算での自然な淘汰**に寄せるべき |
| 独立JSONファイル台帳パターン(discoveries.json 等、game_state.json非破壊) | discoveryLedgerCore / campaignResourcesCore | 変更なし。Nが増えても様式は同じ |
| char基準の予算eviction | gmPromptBuilderCore.ts:536 | 変更なし(token化は§Q7) |

### Q1 は無傷で残る、無傷でないのは既存LW3関係性システム(別イニシアチブ)

幸い **Q1(actor-partitioned map = `Record<actorId, KnowledgeEntry[]>`)はNに依存せず素直にスケールする**(N=10でもN=500でもO(N)の辞書)。Context Engine のスキーマ判断はこの訂正で変更不要。

**変更が必要なのは Context Engine ではなく既存 LW3 の関係性システム側**: `npcRelationshipCore.ts` は全ペアを疎マップ(`"idA|idB"→affinity`)で持つため常時 O(N²) メモリではないが、(a) 登録順で機械的に `slice(0,N)` 切り捨てるため N+1 体目以降が関係性システムに一切現れない、(b) 同席処理は同一地点のNPC数に対し組み合わせ的にコストが増える。**「スペックが許す限り大規模」を目指すなら、この2点の再設計(切り捨てをやめ設定可能な上限に、同席処理を疎/イベント駆動に)が別途必要。** これは Context Engine の Pilot(P0-P3)をブロックしない独立課題として切り出す。

> ボトルネックは NPC 数だけでなく、World Truth / Event Ledger 側の増大(§Q10 windowing)にもある。Grok の adversarial ケースは「起こったら壊れる」の証明用に引き続き有効。

---

## 1. 全体パイプライン(純粋性の隔離を明示)

```text
ContextRequest
   │
   ▼  (すべて deterministic, pure)
[1] Access/Acquire Filter   canAcquire() — このactorが新規に知り得る情報源
[2] Candidate Gathering     各 ContextProvider が候補を提出(subsystemは選別しない)
   │
   ▼  ┄┄┄┄ 唯一の非決定論境界 ┄┄┄┄
[3] Semantic Augment        optional。候補を"追加"するのみ。ON時のみ。RetrievalReceipt発行
   │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
   ▼  (ここから再び deterministic, pure)
[4] Recall Gate             canRecall() — 既得知識が想起されるか(salience/staleness、accessは無関係)
[5] Deterministic Re-rank   §Q(スコア合成)
[6] Category Budgeter       min/target/max + borrow(§Q7)
[7] LOD Compression         予算に合わせ LOD 0..4 を選択
   │
   ▼
ContextBuildResult { bundle, accountingInternal, accountingUserSafe? }
```

**不変条件(全体)**: `(WorldTruth, KnowledgeLedger, MemoryLedger, ContextRequest)` が同じなら、`semanticRetrieval:false` の下で出力は完全再現可能でなければならない([3]以外に非決定論を持ち込まない)。これが LoreRelay の pure-core 文化とテスト戦略の前提。

---

## 2. Open Questions への決定(§9 の10問 + 派生)

### Q1. KnowledgeEntry の所有モデル → **actor-partitioned map を正本、fact→knowers は派生索引** `LOAD-BEARING`

**決定**: 正本は `Record<actorId, KnowledgeEntry[]>`(= actor-owned ledger を1ファイル `knowledge_ledger.json` に直列化)。エントリは `actor` を**持たない**(キーが権威。denormalization による split-brain を避ける)。将来の Rumor 伝播(fact-first 走査)が必要になった時は、ロード時に `factId/claimId → actorId[]` の**派生索引**をメモリ上に構築する。第二の正本は作らない。

**根拠(v0.4 訂正: 「小規模だから」ではなく「アクセスパターンがactor-firstだから」)**: (a) Context Engine の支配的クエリは「actor X が今回の会話で知っている関連情報は?」= actor-first であり、この形は actor 数の大小に関係なく成立する。(b) 独立JSONファイル台帳パターンに自然に乗る。(c) 派生索引方式なら伝播フェーズを塞がない。global-ledger+knower方式は「fact起点で誰が知っているか総当り」型クエリが支配的な場合にのみ優位だが、それは LoreRelay の主要ユースケース(GM プロンプト構築 = actor起点)ではない。

**容量特性の訂正(ChatGPT指摘)**: 「Nに依存せずスケールする」は不正確だった。正確には**総容量は actor数 × actorあたりKnowledge数(O(N×K))に比例**する。`claimId` 参照のみで本文を複製しないため1entryは軽量だが、N・Kが大きくなれば per-actor compaction/windowing(§Q6 の salience 淘汰、休眠知識の圧縮)が必須になる。**利点は「全世界を毎回スキャンしなくて済む」ことであり、「容量がNに無関係」ではない。**

**可逆性**: LOAD-BEARING。ここを global-first に変えるとスキーマ・永続・全クエリが変わる。~~ただし actor≤10 が崩れない限り再検討不要~~ → **actor数の大小に関わらずこの判断は成立するため、再検討条件は「fact起点クエリ(誰が知っているか総当り)が支配的になった場合」のみ**(現状のGM会話ユースケースでは発生しない)。

### Q2. Knowledge は fact のみ参照か / 矛盾解決の粒度 → **Claim を参照、矛盾は"解決しない・提示する"** `LOAD-BEARING`(参照先) / `TUNABLE`(解決ロジック)

**決定**: KnowledgeEntry は **Claim** を参照する(World Fact を直接参照しない。v0.2で確定)。同一 actor が同一 `(subject, predicate)` について**矛盾する複数 Claim を同時に保持してよい**(例: 「王は死んだ」conf0.7 と「王は生きている」conf0.3)。**MVP は矛盾を自動解決しない。** Engine は最高confidenceのClaimを出すか、より物語的には「矛盾を抱えている」こと自体をcontextとして提示できる(GMが『Aliceは食い違う噂を聞いている』と描ける)。

**スコープ境界(重要)**: 信念の**保存**は MVP に入る。信念の**改訂ダイナミクス**(新証拠で古い信念をいつ上書きするか)は「Belief Dynamics」フェーズとして MVP 外。MVP は store & retrieve のみ、belief revision はしない。

**可逆性**: Claim参照は LOAD-BEARING。矛盾解決ロジックは後付けなので TUNABLE。

### Q3. P0 スコープでの fact/claim 分離の実装範囲 → **スキーマ完全 / 生成はスタブ** `TUNABLE`

**決定**: P0(Context Inspector)は Claim + KnowledgeEntry の**スキーマと retrieval/表示**(confidence付き)を実装する。ただしゲームプレイからの Claim **生成**(GM出力→Claim化のingest pipeline)は P0 では作らない。P0 は既存データ(既存の known-NPC 情報等)を confirmed Claim へ手動/機械マッピングして seed する。これで epistemics 生成系を作らずに選別・表示ロジックを検証できる。

### Q4. 同一 actor の矛盾 Claim 共存の invariant → **一意キーは `(actor, claimId)`、`(actor,subject,predicate)`ではない** `LOAD-BEARING`

**決定**: KnowledgeLedger の一意性キーは `(actor, claimId)`。同一 actor が同じ Claim を二重に持つことは禁止(その場合は confidence を更新)。だが同一 `(subject, predicate)` に対する複数の異なる Claim は許可(=矛盾を許容)。これにより「知っていることの二重計上」は防ぎつつ「食い違う信念」は表現できる。

### Q5. `canAcquire()` / `canRecall()` の正式シグネチャ + 基本型 → **下記に確定** `LOAD-BEARING`(分離) / `TUNABLE`(内部条件)

```ts
type EntityRef  = { kind: 'npc' | 'player' | 'faction' | 'party'; id: string };
type LocationRef = { id: string };                    // cartography の region/settlement id
type ClockRef   = { clock: 'world' | 'gm' | 'domainMonth' | 'guildDrift' | 'simTick'; value: number };
type WorldContext = {                                 // 導出の入力(読み取り専用スナップショット)
  clocks: Record<ClockRef['clock'], number>;
  actorLocation: (a: EntityRef) => LocationRef | undefined;
  factionMembership: (a: EntityRef) => string[];
  trustToward: (a: EntityRef, b: EntityRef) => number;
};

// 新規取得のゲート(空間: 同席=fogOfWar / 社会: 派閥・信頼=whereaboutsTrust / 文書: 所持)
declare function canAcquire(actor: EntityRef, source: InformationSource, ctx: WorldContext): boolean;

// 既得知識の想起ゲート。入力は salience/staleness のみ。**access には一切依存しない**。
declare function canRecall(actor: EntityRef, entry: MemoryEntry, ctx: WorldContext): boolean;
```

**不変条件(v0.2 バグ修正の恒久化)**: `canRecall` は `canAcquire`・access・現在地・派閥所属に**依存してはならない**。アクセス喪失は既得知識を決して消さない。テストで「actorをギルドから脱退させても既得Claimが recall され続ける」を保証すること。

### Q6. MemoryLedger の正式化 + salience 減衰 → **参照+想起メタ / 半減期モデル / Knowledge⊋Memory** `TUNABLE`

**決定**: MemoryEntry(v0.2 §4.2c)を正本化。**Knowledge と Memory は 1:1 ではない**:
- Knowledge = 「頭の中にある事実の集合」(canRecall の母集団)。
- Memory = 「想起されやすさ」のオーバーレイ。MemoryEntry を**持たない** KnowledgeEntry は "dormant knowledge"(休眠知識): ambient salience では出ないが、**強い直接キュー(明示的なuser mention / 直接エンティティ一致)でのみ想起可能**。これは「知ってはいるが長年思い出さなかった、聞かれて初めて出てきた」を自然に表現し、かつ休眠知識が salience 予算を食わない(トークン節約)。

**salience 減衰(決定論)**:
```
effectiveSalience(m, now) = max( importanceFloor(m),  baseSalience(m) * 2^(-elapsed / halfLife) )
   elapsed = now.value - (m.lastRecalledAt ?? m.acquiredAt).value    // 同一 clock 種別で比較すること
```
**移植性ガード**: この float 値は**永続化しない**。単一 build 呼び出し内の**順位比較にのみ**使う(プラットフォーム間の float ドリフトが永続状態を汚さない)。順位は同点時 id 昇順で安定化。halfLife/importanceFloor は TUNABLE。

### Q7. Category Budgeter の擬似コード(競合時の再配分順) → **確定** `TUNABLE`

```
allocate(categories, totalBudget):
  # Tier-0 (System/Rules) は min=target=max で不可侵
  1. minSum = Σ cat.min
     if minSum > totalBudget:                      # 過小予算 = 設定エラー
        Tier-0 を確保後、非Tier-0 の min を比例縮小(縮退動作、警告を accounting へ)
  2. 各 cat に min を確定配分
  3. remaining = totalBudget - Σ allocated
     # target まで: 固定カテゴリ優先順(deterministic)で埋める
     for cat in CATEGORY_FILL_ORDER:
        take = min(cat.target - cat.min, remaining); cat.alloc += take; remaining -= take
  4. if remaining > 0:
     # 余剰は borrowUnused=true のカテゴリが、各自の"最上位候補の relevanceScore"降順で max まで入札
     for cat in categories sorted by topCandidateRelevance desc, where borrowUnused:
        take = min(cat.max - cat.alloc, remaining); cat.alloc += take; remaining -= take
  5. 各カテゴリ内: item を relevanceScore 降順で詰める。
     入りきらない時は **item を落とす前に LOD を下げる**(4→…→0)。LOD0でも入らなければ item を落とす。
     全ての順位・タイは id 昇順で安定化。
```
**最低文脈フロア**: どのカテゴリも System/Rules・Speaker Identity・Current Scene は LOD0 未満(=消滅)にしない下限を持つ(§Q10 の「全部LOD0」失敗を防ぐ)。

### Q8. Internal vs User-safe Accounting の境界 → **非干渉性(non-interference)で定義** `LOAD-BEARING`

**決定**: `accountingUserSafe` に載せてよいのは**集計値のみ**(tokenUsed / tokenBudget / truncationOccurred)。**itemId・omission理由・category名・claim/fact id は一切載せない**。

**検証可能な不変条件(これが境界の正体)**: *「あるactorがアクセスできない秘密の有無だけが異なる2つの世界状態は、同一の `accountingUserSafe` を生成しなければならない」*(non-interference / 情報非干渉性)。これは「Omitted: 暗殺者の正体(inaccessible)」型のメタ・スポイラー漏洩(過去の Map Overlay ID 漏れと同種)を、テストで機械的に検出できる形にする。P0 Inspector は GM/Developer 専用面とし、Remote Player へは `accountingUserSafe` すら既定で送らない。実装は既存 `gameStateWebviewSanitizeCore.ts` の sanitize 境界を踏襲(新規発明しない)。

### Q9. ContextProvider interface + migration 経路 → **strangler-fig で確定** `LOAD-BEARING`(方式) / `TUNABLE`(順序)

```ts
interface ContextProvider {
  id: string;                                        // 'campaignResources' 等、既存 chunk id と対応
  category: ContextCategory;                         // Speaker/Relationships/WorldInfo/…
  gather(request: ContextRequest, ctx: WorldContext): ContextCandidate[];  // 選別も予算判断もしない
}
type ContextCandidate = {
  item: Omit<ContextItem, 'relevanceScore'>;         // LOD別本文・provenance・tokenCost を持つ
  signals: RelevanceSignals;                          // entity overlap/recency/importance 等の生信号(最終スコアは Engine が合成)
};
```

**migration(非破壊・漸進)**:
1. **P1 Shadow**: 既存の各 chunk builder を「chunk全体=1候補(LOD固定, category は現行 priority 表からマッピング)」で包む薄い adapter provider を作る。新 Engine を旧経路と**並走**させ出力差分を比較。旧 `evictPromptChunksByBudget` は残す。
2. subsystem を1つずつ「粗い chunk 提出」から「細かい候補提出(LOD variants付き)」へ移行。
3. 全移行後に旧 char-eviction を撤去。

repo文化(新規ファイル追加+非破壊レイヤリング)に一致。順序は TUNABLE(Campaign Resources 等の軽いものから)。

### Q10. Failure modes カタログ(Grok 投入用) → **下記** `TUNABLE`

| # | 攻撃/異常 | MVP の想定挙動 | 要検証 |
|---|---|---|---|
| F1 | 同名NPC(name衝突) | id が権威、name は表示のみ | id≠name の分離が全経路で保たれるか |
| F2 | 記憶改竄(truthRelation=contradicted の Claim 注入) | 保持し矛盾として提示、自動解決しない(Q2) | 改竄Claimが confirmed に昇格しないか |
| F3 | 健忘(knowledge除去) | access喪失では起きない。明示的 forget op のみ(Q5不変条件) | access操作で誤って消えないか |
| F4 | 複数世界時計の取り違え | ClockRef で clock 種別不一致を型で弾く(Q5) | 異clock比較を混入させられるか |
| F5 | 100万Event、かつ actor数も大規模化 | Event Ledger を worldTurn windowing。actor数拡大時は per-actor compaction(§Q1訂正)も併用 | window外参照でクラッシュしないか、大規模actor時にcompactionが間に合うか |
| F6 | 時間逆行/遡及編集(acquiredAt > now) | 負のelapsed → salience計算をクランプ | 未来取得で減衰が壊れないか |
| F7 | 矛盾Claim爆発(actorが無限にClaim蓄積) | per-actor Claim 上限は**設定可能な値**(legacy固定10ではない、§0訂正)で古い低salienceを退避 | 上限到達時の退避が決定論か、上限値を大きくした時の性能劣化が線形か |
| F8 | semantic retriever バージョンずれ | RetrievalReceipt で検出(v0.2 §4.7) | Shadow比較で差分を捕捉できるか |
| F9 | 予算枯渇(Σmin > budget) | Tier-0確保→比例縮小(Q7-1) | Speaker Identity が消滅しないか |
| F10 | 全部LOD0(文脈総崩れ) | 最低文脈フロア(Q7-5)で防止 | フロア下限が常に守られるか |

---

## 3. 永続する型の最終形(v0.2 からの確定差分)

- `Claim` : v0.2 §4.2a 通り。`truthRelation` は Engine内部専用(actor/GM-as-actorへ渡さない)。
- `KnowledgeEntry` : **`actor` を削除**(Q1: キーが権威)。一意キー `(actorKey, claimId)`。`acquiredAt: ClockRef`。
- `MemoryEntry` : v0.2 §4.2c 通り。Knowledge の複製ではなく参照(`knowledgeRef`)。持たない Knowledge=休眠(Q6)。
- `ContextBuildResult` : v0.2 §4.6 通り。`accountingInternal` / `accountingUserSafe`(non-interference, Q8)。
- 新規: `ContextProvider` / `ContextCandidate` / `RelevanceSignals`(Q9)、`CategoryBudget`(v0.2 §6)、`ClockRef` / `WorldContext`(Q5)。

永続化: `knowledge_ledger.json`(actor-partitioned)+ `memory_ledger.json`。いずれも game_state.json 非破壊の独立ファイル(discoveries.json パターン)。既定 OFF フラグ `enableContextEngine`。

---

## 4. Pilot への写像(何が P0 に入るか)

| Pilot | 入るもの | 入らないもの |
|---|---|---|
| **P0 Context Inspector**(GMへ渡さない可視化) | スキーマ全部、canAcquire/canRecall、re-rank、Budgeter、LOD、accountingInternal 表示、seed済Claim | Claim自動生成、semantic、belief revision、Rumor伝播、User-safe面の外部送出 |
| P1 Shadow | adapter provider、旧/新 出力比較、RetrievalReceipt | 既定化 |
| P2 Parlor Opt-in | 設定ON時に Parlor で新Engineを実運用 | 全モード展開 |
| P3 Default→拡大 | In-World Chat→Campaign→Full Living World | — |

---

## 5. Architecture Owner として明言する残リスク(レビュー各AIへの申し送り)

1. ~~Q1 の actor≤10 前提が崩れるなら再検討~~ → **この前提は既に崩れている(§0訂正済み、ユーザー確認)。Q1自体はactor-first アクセスパターンという別根拠で無傷で残るが、容量はO(N×K)であり大規模化にはper-actor compactionが要る(上記訂正参照)。** → **Gemini**: 「actor-first クエリが支配的」という Q1 の新しい根拠自体が repo 全体の実際のクエリパターンと一致するか確認せよ(GM以外の経路でfact起点クエリが必要になる箇所がないか)。
2. **Q6 の休眠知識の想起キュー**: 「明示的user mention/直接エンティティ一致」の判定が弱いと、重要な休眠知識が永遠に出ない/逆に出過ぎる。→ **Fable 5**: narrative 観点で「NPCが何を自然に思い出す/思い出さないべきか」の期待値を定義せよ。
3. **Q2 の矛盾提示**: 「食い違う噂を抱えている」を GM プロンプトへどう渡すと自然か未定。→ **Fable 5 + ChatGPT**。
4. **Q10 全般**: → **Grok**: 上表を実際に壊し、特に F3(access≠knowledge)/F8(receipt)/F10(フロア)の invariant を破れるか試せ。加えて actor数拡大時(§0訂正)の性能劣化が線形か確認せよ。
5. **char→token**: tokenizer 依存を pure core にどう閉じ込めるか未決(GMプロバイダ毎に tokenizer が違う)。→ **ChatGPT**: local-first と多プロバイダ両立の tokenizer 抽象を提案せよ。
6. **Simulation Scale Profile / Actor LOD tiering(ChatGPT提案、未採否)**: 「全NPCを同じ密度で追わない」設計(Focused/Named Background/Population の3層)は Context Engine と相性が良い提案だが、**採否はこの spec では決めない**。理由: 現在 [task_c5bae24a](../.) 「NPC関係性システムのNスケール対応」が既にユーザーの手元で別セッション進行中で、そちらが `maxNamedNpcCount` 設定化・関係性の疎/イベント駆動化を扱う。ここで独自に LOD Tier を決めると設計が競合・重複する。**Architecture Owner は次のいずれかを選べ**: (a) この spec では言及に留め決定を保留し、進行中タスクの結果を見てから統合 (b) 至急すり合わせが必要なら Simulation Scale Profile の型だけ§0に「将来の拡張点」として予約し、フィールドは確定しない。

> **これは「ひとまずの北極星」である。** 10問に決定は下したが、Q1/Q2参照先/Q4キー/Q8境界/Q9方式 の5つが LOAD-BEARING。ここを覆す指摘は歓迎するが、覆すなら下流総やり直しになる自覚の上で。TUNABLE 項目(数値・減衰関数・移行順・失敗対処)は実装中に自由に調整してよい。次工程: 本 spec を4AIレビュー→ v0.4 で LOAD-BEARING を fix → P0 実装(Sonnet 5)。
>
> **v0.3→v0.3.1→v0.4 の教訓(ChatGPT指摘より)**: §0だけ訂正して本文(Q1根拠・F5・F7・§5)への伝播が漏れていた。前提訂正は「冒頭に注記」だけでなく、その前提を参照している全箇所を grep で洗い出し修正することを今後のドキュメント更新でも徹底する。
