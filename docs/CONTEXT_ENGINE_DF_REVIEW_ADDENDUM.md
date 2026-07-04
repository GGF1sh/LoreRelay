# Context Engine — Dwarf Fortress Review Addendum (v1)

> Gemini(DF Raws調査)/ Grok(実コード照合)/ ChatGPT(設計補正)の統合レビューを受け、Architecture Owner が [`CONTEXT_ENGINE_NORTH_STAR.md`](CONTEXT_ENGINE_NORTH_STAR.md) v0.4 への追加・修正だけを判定したもの。**North Star の全面書き直しではない。DF模倣でもない。**
> 起草: 2026-07-04。Gap A/B は Sonnet 5 が実コードで検証済み(下記)。

## 0. DF由来の分類(誤帰属を避けるため必須)

| 区分 | 内容 |
|---|---|
| **A. DF Rawで実証** | Capability合成(`[PERMITTED_JOB:...]`)、Interaction の Source/Target/Context/Effect分離、Secret習得経路(research/teaching/recording)、文化ごとの概念許可/禁止(`SELECT_SYMBOL`/`CULL_SYMBOL`) |
| **B. DF Rawからの推論(内部実装未確認)** | 上記が実際にどうシミュレーションへ配線されているかの内部ロジック |
| **C. LoreRelay既存(DFは補強材料に過ぎない)** | **Fact/Claim分離・KnowledgeEntry・Context Provenance・AcquisitionType は全て North Star v0.2–0.4 で LoreRelay 側が独立に決定済み。「DFから新発見した」は誤り。** DFはこの設計が他のシミュレーションゲームでも有効という外部補強に過ぎない。 |

**実コード検証(今回追加)**:
- **Gap A 確認**: `worldEventLogCore.ts:23,276` の `WorldChangeEvent.npcIds` は、`chronicleCore.ts:166-178` の `extractWorldChangeEvents()` が生成する `ChronicleEvent{worldTurn,kind,text,regionId,factionId}` に運ばれず**確実に消える**。Grokの指摘は事実。
- **Gap B 確認**: `npcRegistryCore.ts:23` `NpcMemoryEntry = {id,turn,content,emotionalWeight,tags}` に owner/claim/acquisition/confidence/source は無い。Grokの指摘は事実。

---

## 1. Architecture Owner 決定(10問)

### Q1. LOAD-BEARING決定の変更要否 → **変更なし**

Fact/Claim分離・Knowledge≠Memory・actor-first根拠(v0.4で修正済み)のいずれも、DF調査は**反証ではなく補強**として機能した。LOAD-BEARING決定(§North Star: Q1所有モデル/Q2参照先/Q4キー/Q8境界/Q9方式)は無変更。

### Q2. `actor≤10`前提の完全除去 → **v0.4で完了済み(再確認)**

前回セッションでQ1根拠・F5・F7・§5残リスクを含め全箇所修正済み。本addendumで新たな残骸は見つかっていない。

### Q3. Event-Participant preservation → **C(participant metadataだけ今修正)+ 別チケット化。Context Engine本体はB(別管理)のまま**

`npcIds`消失はContext Engineの設計判断ではなく**既存コードの実バグ**(Chronicle projection実装の抜け)。North Starを膨らませてまで扱う話ではないが、放置するとEntity Timeline Index(P1以降)の入力が最初から欠損する。**独立の小修正チケットとして切り出す**(`ChronicleEvent`型に`npcIds?`を追加し`extractWorldChangeEvents`で運ぶだけの数行修正、Context Engine自体の実装を待たずに今直せる)。「Historical Event Backbone」(全Event種を統合スキーマへ)は別イニシアチブ(§2A)。

### Q4. Entity Timeline Index を P0/P1へ → **P0には入れない、P1でderived indexとして導入**

P0(Context Inspector)は既存データのseedとschema/selectionロジック検証に専念(既存スコープ通り)。Timeline Indexは実際の候補提供(`ContextProvider`)が動き出すP1から、**canonical ledgerではなくderived index**(`entityId→eventIds`等、v0.2/北極星で既に方針一致)として導入。

### Q5. Capability layer → **今はやらない。SEPARATE INITIATIVE**

ChatGPT Correction 1/2に全面同意: Feature Flag(`enable*`)とWorld Entity Capabilityは別物であり、混同・全面移行は禁止。導入するとしても1系統(Faction/Settlement/Vehicle/MobileBaseのどれか)でpilotし、`CapabilityDefinition`のようなRegistry/validation layerを伴う。**Context Engineの北極星には一切含めない。**

### Q6. Claim に temporal context → **`validAt`のみ今追加(ADD AS TUNABLE)、`validFrom`/`validUntil`レンジはRESERVE**

「間違った信念」と「古くなった信念」は別物という指摘は正しい。ただしMVPは既にbelief revisionをしない(Q2)と決めている。**単一フィールド`validAt?: ClockRef`だけ今`Claim`に追加**(Bobが北港にいた、のように「いつの時点の話か」を1点だけ持てる。これがないと後から全Claimへのスキーマ移行が必要になるため、安いうちに予約する)。範囲(`validFrom`/`validUntil`、期間を持つ出来事用)と、staleness検知による自動失効ロジックはMVP過剰設計と判断し予約のみ。

### Q7. Identity / Public Identity / Form の schema reservation → **RESERVE IN SCHEMA(EntityRef側)**

これは費用対効果が非常に高い予約。理由: `Claim.subject`が常に正本actorIdへ解決される前提だと、「Aliceは`masked_merchant`を知っているが`masked_merchant`=Bobだとは知らない」を**原理的に表現できない**。後付けは全Claim/KnowledgeEntryの参照方式を変えることになり高コスト。**今のうちに`EntityRef`へ「未解決の識別子」形を1バリアント追加するだけ**で予約できる:

```ts
type EntityRef =
  | { kind: 'npc' | 'player' | 'faction' | 'party'; id: string }   // 正本ID解決済み
  | { kind: 'alias'; label: string };                              // 未解決(actorが知る「呼び名」のみ)
```

canonical identity ↔ current form ↔ public identity ↔ role の解決ロジック自体(偽名バレ・変装解除等)は別イニシアチブ。**今回はEntityRefの型にこのバリアントを空けるだけ**に留める。

### Q8. Acquisition metadata のMVP範囲 → **method + acquiredAt + sourceActor?/sourceEvent? を今追加、sourceDocumentは型だけ予約**

Provenance必須(設計ブリーフ§2 ロック済み制約#5)と既に整合するため、`sourceActor`/`sourceEvent`は安価に今入れる価値がある(「なぜAIがこれを知っていた」の説明責任に直結)。`sourceDocument`はDocument/Book的な仕組みがまだ無いため、フィールドの型だけ予約し値は空でよい。

```ts
type KnowledgeAcquisition = {
  method: 'witnessed' | 'told' | 'document' | 'inferred' | 'research' | 'broadcast';
  sourceActor?: EntityRef;
  sourceEvent?: EventRef;
  sourceDocument?: EntityRef;   // 型のみ予約、Document系実装までは常に undefined
  acquiredAt: ClockRef;
};
```

### Q9. Simulation LOD → **Context Engineに含めない。SEPARATE INITIATIVE(既存 task_c5bae24a と統合すべき)**

北極星v0.4 §5で既に明記済みの通り、NPC N-スケール対応タスクが並行進行中。Simulation Scale Profile / Actor Tier(Focused/Named Background/Population)の設計は**そちらのタスクの領分**。ここで重複決定しない。

### Q10. v0.4→v0.5 分類表

| 項目 | 分類 |
|---|---|
| actor≤10前提の除去 | **DONE**(v0.4で完了) |
| Q1根拠を「actor-first」に | **DONE**(v0.4で完了) |
| `Claim.validAt` | **ADD AS TUNABLE**(今スキーマに追加) |
| `EntityRef`の alias バリアント | **RESERVE IN SCHEMA**(今型に追加、解決ロジックは作らない) |
| `KnowledgeAcquisition.sourceActor/sourceEvent` | **ADD AS TUNABLE**(今スキーマに追加) |
| `KnowledgeAcquisition.sourceDocument` | **RESERVE IN SCHEMA**(型のみ) |
| `ChronicleEvent`の`npcIds`消失修正 | **SEPARATE INITIATIVE**(小規模・低リスク、Context Engine実装を待たず独立で直してよい) |
| Historical Event Backbone(全Event統合) | **SEPARATE INITIATIVE**(大規模移行、P0を膨らませない) |
| Entity Timeline Index | **RESERVE**(P0には含めない、P1でderived indexとして導入) |
| Capability layer全般 | **SEPARATE INITIATIVE** |
| World Forge Cultural Constraint layer(`SELECT_SYMBOL`/`CULL_SYMBOL`相当) | **SEPARATE INITIATIVE**(World Forge側の課題、Context Engineとは無関係) |
| Simulation LOD / Actor Tiers | **SEPARATE INITIATIVE**(task_c5bae24aと統合) |
| DF物理・流体・部位・micro pathing | **REJECT**(ユーザー方針通り、対象外) |

---

## 2. 別イニシアチブの記録(見失い防止)

- **A. Historical Event Backbone**: World/NPC/Settlement/Faction/Vehicle の各Eventを`HistoricalEvent`共通スキーマへ将来寄せる案。全面移行は禁止。まずは§Q3のparticipant preservation小修正のみ今やる。
- **B. Capability Layer**: Feature Flag(bool)と World Entity Capability(string[]+Registry)を分離。1系統でpilot。
- **C. World Forge Cultural Constraint**: `preferredConcepts`/`forbiddenConcepts`/`symbolWeights`等をLLM生成前段に置く案。World Forge側の別課題。
- **D. Simulation LOD / Actor Tiers**: 既存task_c5bae24aへ統合すべき(重複回避)。

これらはContext Engine北極星のスコープ外。着手する際は本addendumを起点にすること。

---

## 3. North Star v0.4 への具体的スキーマ差分(次コミットで適用)

- `Claim` に `validAt?: ClockRef` を追加。
- `EntityRef` に `{ kind: 'alias'; label: string }` バリアントを追加。
- `KnowledgeAcquisition`(新設、v0.2の`acquisitionType: string`だった箇所を置換)に `sourceActor?/sourceEvent?/sourceDocument?` を追加。
- §2に「DF Review Addendum参照」のポインタを追記。

> 結論(ユーザーへの申し送り): 今回のDF調査で最も価値があったのは新機能の発見ではなく、**「IDと明示的な関係でEntity/Event/Claim/Knowledge/Identityを繋ぐ」という設計思想の裏取り**。North Starの土台は揺らいでいない。追加すべきは3つの安価なスキーマ拡張(validAt/EntityRef alias/Acquisition source系)のみで、それ以外は全て別イニシアチブへ切り出した。
