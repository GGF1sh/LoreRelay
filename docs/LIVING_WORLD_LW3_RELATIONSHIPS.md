# Living World — LW3: NPC間の関係（North Star / ガンパレ共生システム）

> **これは何:** 名ありNPC(≤10)同士が「世界の出来事の結果として」関係を変える決定論システムの **ホスト統合スペック**。
> **なぜ:** BRIEF §0.5 の北極星（ガンパレード・マーチ = 見ていない所で仲間同士の関係が動く）。§5.6 で v0 Non-Goal にしていた future arc の**第一歩**。
> **黄金律:** affinity(好感度) は決定論 Core が動かす。LLM は変化を **伝聞として narrate** するだけ（数値は書き換えない）。NPC同士の会話自動生成は依然 Non-Goal。
> **書いた人:** Opus 4.8（2026-07-02 深夜）。**Core とテストは実装・検証済み。以下はホスト配線の指示書。**

---

## 0. 実装済み（このスペックの土台）

| 成果物 | 状態 |
|--------|------|
| `src/npcRelationshipCore.ts` | ✅ **完全自己完結の純関数 Core**（vscode/他モジュール非依存）。プロジェクト全体で `npm run compile` 緑。 |
| `scripts/test_npc_relationship_core.js` | ✅ 単独実行テスト 26 アサーション全通過（`node scripts/test_npc_relationship_core.js`）。この1ファイルだけを temp に自前コンパイルするので**リポジトリ全体のビルド状態に依存しない**。 |

**✅ ホスト配線 完了（v1.29.0, 2026-07-02 深夜, Opus 4.8）:**
- `game_rules.enableNpcRelationships`（既定 OFF, `npcRelationshipsEnabled()` gate = Registry+Agency 前提）
- `world_state.npcRelationships` 永続化（`parseWorldState` にペアキー検証 + ±100 clamp + 上限64件）
- `tickLivingWorldAfterSim` → `evolveRelationships`（tick.npcMoves を shared_crisis 判定に使用）
- `buildLivingWorldGmLines` → `[Living World — Bonds]`（livingWorldPromptCore は sync 対象のため文字列連結で低侵襲に）
- `turn_result.relationshipOps` → `applyLivingWorldTurnOps` で適用（型は `types/TurnResult.ts` に追加済み）
- テスト2本を MANIFEST 登録済み。**78/78 全緑。** 以下 §1〜2 は当時の設計指示（実装済みの記録として残す）。

**残タスク（v1+ / 後続）:**
- Game Rules パネル（webview ⚙️）にチェックボックス追加（`enableCommerceUi` と同パターン）
- World タブに「知人同士の関係」表示（信頼連動の曖昧化は `npcWhereaboutsTrustCore` に倣う）
- GM スキーマヒント（`RELATIONSHIP_OPS_PROMPT_LINE`）を world プロンプトに追加
- trade-routes デモの README に「Elda と Marcus が友好になる」体験手順を追記

### Core の公開 API（そのまま呼べる）
```
pairKey(a,b)                       正規化ペアキー "idA|idB"
getAffinity(map,a,b)               好感度読み取り(既定0, self0)
describeRelationship(aff)           'ally'|'friend'|'neutral'|'rival'|'enemy'
evolveRelationships(input)          {relationships, changes} 1tick進める(決定論)
parseRelationshipOps(raw)           turn_result.relationshipOps をパース
applyRelationshipOps(map,ops,reg)   GM ops 適用(≤10 registry 検証・clamp)
listNotableRelationships(map,reg)   neutral以外を |affinity| 降順(UI/prompt用)
buildRelationshipPromptLines(...)   [Living World — Bonds] の行を生成
定数: MAX/MIN_AFFINITY=±100, AFFINITY_ALLY=70/FRIEND=30/RIVAL=-30/ENEMY=-70,
      CO_LOCATION_STEP=3, SHARED_CRISIS_STEP=8, FACTION_CONFLICT_STEP=-10,
      FACTION_KINSHIP_STEP=4, MAX_NAMED_NPC_RELATIONSHIP=10
```

### v0 の関係変化ルール（Core 実装済み）
| トリガー | 効果 | 意味 |
|----------|------|------|
| **同席** | 同じ場所に居合わせるペア +3/tick | 顔見知りになる（移動中は不在扱いで除外） |
| **共通の危機** | 同 reason/agenda で同tickに動いたペア +8 | 危機の盟友（例: 食料危機で共に買い付け） |
| **派閥動態** | 紛争/critical イベント時、異派閥 -10 / 同派閥 +4 | 対立の激化・同志の結束 |

全変化は ±100 に clamp、ペアごとに純増減 + 最大寄与の reason で1件に集約。上限に張り付いたら change を出さない（ノイズ抑制）。

---

## 1. データ契約（ホストが追加する箇所）

### game_rules（既定 OFF）
```jsonc
{ "enableNpcRelationships": false }
```
- 依存: `enableNpcRegistry` + `enableNpcAgency`（両方 ON が前提。位置が動かないと関係も動かない）。
- `gameRules.ts` の型・既定・sanitize に追加（`enableCommerce`/`enableNpcAgency` と同パターン）。

### world_state 拡張
```jsonc
{ "npcRelationships": { "npc_elda|npc_marcus": 24 } }
```
- `NpcRelationshipMap`（`src/npcRelationshipCore.ts` の型）。`LivingWorldWorldStateExt`（`livingWorldBridge.ts`）に `npcRelationships?: NpcRelationshipMap;` を追加。

### turn_result 拡張（GM の例外的確定）
```jsonc
{ "relationshipOps": [ { "a": "npc_elda", "b": "npc_marcus", "delta": 10, "reason": "manual" } ] }
```

---

## 2. 配線ポイント（既存 LW の型に相乗り）

**adapter は既にある:** `registryToAgencyLike()`（`livingWorldBridge.ts` / `livingWorldTurnOps.ts`）が `{name, locationId, factionId}` を返す = `RelationshipRegistryLike` にそのまま合致。`npcPositions` は `RelationshipPositionsLike` に合致。`recentChanges` は `{worldTurn, category, severity, message}` に写す。

### 2.1 tick 中で関係を進める
`tickLivingWorldAfterSim()`（`livingWorldBridge.ts`）内、**`reactNpcsToWorld` の後**で:
```ts
if (rules.enableNpcRelationships && rules.enableNpcRegistry && rules.enableNpcAgency) {
  const { relationships, changes } = evolveRelationships({
    registry: registryToAgencyLike(registry),
    positions: ext.npcPositions ?? {},
    relationships: ext.npcRelationships ?? {},
    worldTurn: state.worldTurn,
    recentChanges: mapRecentChanges(state.recentChanges),
    agencyMoves: tick.moves,   // ← reactNpcsToWorld / runLivingWorldTick が返す moves
  });
  ext.npcRelationships = relationships;
  // changes を worldEventLog に流すと「Since last visit」で伝聞に出せる(任意・推奨)
}
```
※ `runLivingWorldTick` が現状 `moves` を返していなければ、その戻り値に moves を含める最小修正が必要（Core 側 or host 側で `reactNpcsToWorld` の moves を拾う）。

### 2.2 GM プロンプトに `[Living World — Bonds]`
`buildLivingWorldGmLines()`（`livingWorldBridge.ts`）で、他ブロックと並べて:
```ts
if (rules.enableNpcRelationships) {
  const notable = listNotableRelationships(ext.npcRelationships ?? {}, registryToAgencyLike(registry));
  const lines = buildRelationshipPromptLines(notable, /*recent changes if kept*/ [], registryToAgencyLike(registry));
  // lines を [Living World — Bonds] ブロックとして formatLivingWorldGmInjection に足す
}
```

### 2.3 turn_result の relationshipOps 適用
`applyLivingWorldTurnOps()`（`livingWorldTurnOps.ts`）に、tradeOps/npcAgencyOps と同じ形で:
```ts
if (rules.enableNpcRelationships && rules.enableNpcRegistry && rules.enableNpcAgency) {
  const ops = parseRelationshipOps(turnResult.relationshipOps);
  if (ops.length > 0) {
    const ws = loadWorldState();
    if (ws) {
      const rel = applyRelationshipOps(ws.npcRelationships ?? {}, ops, registryToAgencyLike(loadNpcRegistry()));
      saveWorldState({ ...ws, npcRelationships: rel });
    }
  }
}
```

### 2.4 World タブ（任意・v1）
`listNotableRelationships()` を World タブに「知人同士の関係」一覧として表示。**信頼連動**にするなら既存 `npcWhereaboutsTrustCore` と同様、低信頼のプレイヤーには曖昧に（「二人は親しいらしい」程度）。v0 は出さない/そのまま出すでも可。

---

## 3. 受け入れ条件

- fixtures（Elda=merchants / Marcus=smiths、共に elda_shop）+ 全フラグ ON で数ターン進めると、Elda と Marcus の affinity が上がり、閾値 30 で `[Living World — Bonds]` に「Elda と Marcus: 友好」が出る。
- 紛争/critical イベント後、異派閥ペアの affinity が下がる。
- `relationshipOps` で GM が例外的に関係を動かせる（registry 外・self は無視）。
- **OFF 時は一切出ない**（既定 OFF、物語シナリオ非破壊）。
- `node scripts/test_npc_relationship_core.js` 緑 / `npm run compile` 緑 / `npm test`（マニフェスト登録後）緑。

---

## 4. Non-Goals（v0 を膨らませない）

- NPC同士の**会話・セリフの自動生成**（GM narration に任せる。§5.6 の一線は維持）。
- 恋愛・婚姻・死といった重いライフイベント（future arc。affinity 基盤ができてから）。
- 三者以上の派閥政治シミュ。ランダムな関係変動（世界データ由来のみ）。

---

## 5. これが北極星にどう効くか

ガンパレの「見ていない所で仲間の関係が動いていた」は、**安い決定論 tick**（Tier 1/2 と同じ思想）で 8 割出せる。プレイヤーが港を離れている間に Elda と Marcus が同じ店で過ごして親しくなり、戻ると GM が「そういえば二人、最近よく一緒にいるらしいぞ」と伝聞で語る — これが affinity=決定論・narration=GM の分業で、LLM に丸投げせず実現できる。次段（v1）は affinity を whereabouts/クエスト/価格交渉に波及させ、「関係が世界に影響する」段階へ。

---

## 6. 変更履歴
| 日付 | 内容 |
|------|------|
| 2026-07-02 | 初版（Opus 4.8）。`npcRelationshipCore.ts` + 単独テスト26件を実装・検証。ホスト配線スペックを記述。 |
