# LoreRelay v1.3.0 設計書 — Living World（生きている世界の接続強化）

> **作成日**: 2026-06-27  
> **担当**: Grok（設計） / ChatGPT（仕様化・受け入れ基準）  
> **前提ブランチ**: `refactor/ws-and-extension-split`（v1.2.0 完了後）  
> **スコープ**: コード実装ではなく **v1.3.0〜v1.4.0 の設計仕様**  
> **関連**: `WORLD_SYSTEM_DESIGN.md`（v1.2 全体設計の正本）、`CHANGELOG.md` [1.2.0]

---

## 0. エグゼクティブサマリー

v1.2.0 で World System の**骨格**（読み込み・表示・軽量シミュ・GM注入）は揃った。  
しかしプレイヤー体感としてはまだ **「手書き JSON を眺めるダッシュボード」** に留まっている。

v1.3.0 の目的は **「生成フェーズ」と「運用フェーズ」を接続し、シミュ結果が NPC・マップ・ナラティブに伝播する** こと。

| フェーズ | バージョン | 焦点 |
|---------|-----------|------|
| Stabilization | v1.2.0 ✅ | bundle修正・テスト・堅牢化（Phase 0〜2 完了） |
| **Generation** | **v1.3.0** | `worldForgeGenerator`、NPC シード、World タブ Generate UI |
| **Linkage** | **v1.3.1〜v1.4.0** | sim → npcRegistry → map → GM summary のイベントバス |
| **Visual** | **v1.5.0** | ComfyUI 連携（location 移動時 imagePrompt 自動生成） |

本書は **v1.3.0（生成）** と **v1.4.0（連携・体感）** の境界を明示する。

---

## 1. v1.2.0 実装ギャップ分析（設計の出発点）

`refactor/ws-and-extension-split` のソースを監査した結果、**設計書（`WORLD_SYSTEM_DESIGN.md`）に書いてあるが未配線** の項目:

| # | 項目 | 設計上の期待 | v1.2.0 実態 | 影響 |
|---|------|-------------|------------|------|
| G1 | World 生成 | `worldForgeGenerator` で seed から生成 | **手書き `world_forge.json` のみ** | 新規ユーザーが世界を作れない |
| G2 | NPC シード | `initialNpcs` → `npc_registry.json` ブートストラップ | **パースのみ。自動生成なし** | NPC Registry が空のまま始まる |
| G3 | sim → NPC | シミュ後に Needs urgency 更新 | **`emergentSimulator` は `world_state.json` のみ更新** | 派閥の食料不足が NPC に届かない |
| G4 | sim → globalEvents | 閾値でイベント生成 | **既存イベントの tick のみ。新規生成なし** | 世界が「動いてる」感が弱い |
| G5 | region.activeEvents | 地域イベント配列 | **シミュが書き込まない** | マップ危険度の根拠が見えない |
| G6 | NPC 注入フィルタ | 現在地の NPC のみ GM 注入 | **全 NPC から最大4件（無差別）** | トークン浪費・文脈ズレ |
| G7 | 変化サマリー | N ターンごとにプレイヤー向け要約 | **GM プロンプトに recentEvents 1行のみ** | プレイヤーが変化に気づけない |
| G8 | マップハイライト | 最近変化した地域を強調 | **危険度数値のみ。変化マーカーなし** | World タブが静的に見える |
| G9 | `imagePromptHint` | Region にフィールドあり | **WorldLocation には未実装** | ComfyUI 連携の足がかり不足 |
| G10 | `getFactionName()` | 表示名解決 | **ID をそのまま返す**（`emergentSimulator.ts:248`） | イベント文が読みにくい |

**v1.3.0 で必ず埋める**: G1, G2, G10  
**v1.4.0 で埋める**: G3〜G9（ComfyUI 本体は v1.5.0）

---

## 2. `worldForgeGenerator` 仕様（v1.3.0 コア）

### 2.1 目的

`worldSeed` / `theme` / 規模パラメータから **`world_forge.json` を生成** し、  
プレイヤーが VSCode 上で編集・上書き確認のうえゲーム開始できるようにする。

### 2.2 新規ファイル

```
src/
├── worldForgeGeneratorCore.ts   ← 純関数・型（テスト可能）
├── worldForgeGenerator.ts       ← I/O、LLM 呼び出し、設定読み込み
scripts/
└── test_world_forge_generator.js
```

### 2.3 入力インターフェース

```typescript
export interface WorldForgeGeneratorInput {
    worldSeed: string;           // 必須。決定的乱数の種
    theme: string;               // 例: "dark-fantasy", "cyberpunk", "dungeon-crawler"
    regionCount: number;         // 3〜12（デフォルト 5）
    factionCount: number;        // 2〜6（デフォルト 3）
    npcCount: number;            // 2〜20（デフォルト 6）
    locale?: SupportedLocale;    // 生成テキストの言語
}

export interface WorldForgeGeneratorOptions {
    /** 手続き型のみ（LLM 不使用）。CI・オフライン用 */
    proceduralOnly?: boolean;
    /** LLM で loreHistory / description を肉付け */
    llmEnrich?: boolean;
    /** 既存 world_forge.json をマージ拡張（上書きではない） */
    mergeMode?: boolean;
}
```

### 2.4 手続き型生成 vs LLM 補完の役割分担

| レイヤー | 担当 | 理由 |
|--------|------|------|
| **手続き型（必須）** | ID 採番、region グラフ、location 配置、faction 関係（enemies/allies）、resource 初期値、dangerLevel | 決定的・テスト可能・スキーマ保証 |
| **LLM 補完（任意）** | `description`, `loreHistory[].event`, `goals[]`, NPC `description`, `imagePromptHint` | 創造性。失敗してもフォールバック可能 |
| **人間編集（推奨）** | 生成後の JSON を World タブ or エディタで修正 | 「Hacker Edition」思想の維持 |

#### 手続き型アルゴリズム（概要）

1. `seedrandom(worldSeed)` で決定的 PRNG（`worldForgeGeneratorCore.ts` 内に軽量実装、外部依存なし）
2. **Region グラフ**: `regionCount` 個のノードを ring + 1〜2 本の chord で `connectedTo` 構築
3. **Location 配置**: 各 region に 1〜3 locations。`type` は region.type から重み付き抽選
4. **Faction 生成**: `factionCount` 個。type 分布: hostile 30% / neutral 40% / friendly 30%
5. **支配関係**: settlement 系 location に `factionControl` を割当（隣接 region は異なる派閥が支配しやすい）
6. **敵対グラフ**: hostile ↔ neutral/friendly のペアを最低1組保証
7. **initialNpcs**: `npcCount` 個を location に分散。quest-giver を最低1人
8. **loreHistory**: テンプレ3件（帝国→崩壊→現代）を theme に合わせたプレースホルダー

#### LLM 補完フロー（`llmEnrich: true` 時）

```
手続き型で骨格 JSON 生成
    ↓
gmBridge（clipboard / ollama / grok）に「以下の骨格を肉付けせよ」プロンプト
    ↓
返却 JSON を parseWorldForge() で再検証
    ↓
失敗 → 手続き型骨格のまま保存（部分成功許容）
```

**重要**: LLM は **ファイルを直接書かない**。拡張機能が `parseWorldForge` → `writeJsonAtomic` する（既存アーキテクチャ踏襲）。

### 2.5 出力 JSON 構造（最低限）

既存 `lorerelay-world-forge/1.0` スキーマをそのまま使用。追加フィールドは v1.3 では **入れない**（破壊的変更回避）。

必須充足条件（生成器の受け入れ基準）:

- `meta.worldName` 非空
- `geography.regions.length >= 1`
- `geography.locations.length >= 1`
- `factions.length >= 2`（対立構造のため）
- 全 `location.regionId` が存在する region を参照
- 全 `factionControl` / `factionId` が存在する faction を参照
- `initialNpcs` の `locationId` が存在する location を参照

### 2.6 生成後の連鎖処理（v1.3.0 で実装）

```
generateWorldForge(input)
    ↓ writeJsonAtomic
world_forge.json
    ↓ bootstrapWorldFromForge()  ← 新規オーケストレータ
├── buildInitialWorldState() → world_state.json（既存）
├── bootstrapNpcRegistryFromForge() → npc_registry.json（新規）
├── optional: lorebook エントリ追加（autoLorebookGrowth ON 時のみ）
└── pushWorldViewToWebview()
```

#### `bootstrapNpcRegistryFromForge(forge: WorldForge)`

`initialNpcs` から `npc_registry.json` を生成:

```typescript
// 各 initialNpc について
npcs[id] = {
    name, locationId, factionId,
    disposition: defaultDisposition(),
    needs: [],  // v1.4 で sim 連携時に追加
    memories: [{
        id: 'mem_seed_001',
        turn: 0,
        content: description || `${name} appears in the world.`,
        emotionalWeight: 'neutral',
        tags: ['world-gen']
    }],
    personalityTraits: inferTraitsFromRole(role),  // 手続き型
    dialogueHints: {}  // LLM enrich 時のみ
}
```

**既存 registry がある場合**: `mergeMode` でなければ上書き確認ダイアログ。  
ID 衝突時は `_${seed}` サフィックスで回避。

### 2.7 VSCode 設定（`package.json` contributes）

```json
"textAdventure.worldForge.defaultRegionCount": { "default": 5, "minimum": 3, "maximum": 12 },
"textAdventure.worldForge.defaultFactionCount": { "default": 3, "minimum": 2, "maximum": 6 },
"textAdventure.worldForge.defaultNpcCount": { "default": 6, "minimum": 2, "maximum": 20 },
"textAdventure.worldForge.llmEnrich": { "default": false }
```

### 2.8 Webview UI（World タブ）

| 要素 | 動作 |
|------|------|
| **Generate World** ボタン | `postMessage({ type: 'generateWorldForge', seed, theme, regionCount, ... })` |
| プレビューパネル | 生成前に手続き型の骨格をプレビュー（地域名・派閥名のみ） |
| Overwrite 確認 | 既存 `world_forge.json` がある場合モーダル |
| 進捗表示 | `worldGenStart` / `worldGenEnd`（imageGen と同パターン） |

**配置**: `85-world.js` の empty 状態（`world_forge.json` 未存在時）にフォーム表示。

### 2.9 コマンド（任意）

- `textadventure.generateWorldForge` — コマンドパレットからも実行可
- シナリオパック読み込み時: `scenario.json` に `worldForge.generateOnLoad: true` があれば自動生成提案

---

## 3. サブシステム連携仕様（v1.4.0 — 設計先行）

v1.3.0 では **生成の接続** を優先。  
**sim → NPC → map → GM** の連携は v1.4.0 で実装するが、ここでインターフェースを固定する。

### 3.1 新規: `worldEventBus.ts`（イベント中継層）

シミュレータが直接 `npcRegistry` を触らず、**構造化イベント** を発行する。

```typescript
export interface WorldChangeEvent {
    id: string;
    worldTurn: number;
    source: 'simulation' | 'player' | 'gm';
    category: 'faction' | 'region' | 'resource' | 'npc' | 'global';
    severity: 'info' | 'warning' | 'critical';
    factionId?: string;
    regionId?: string;
    locationId?: string;
    npcIds?: string[];
    message: string;          // プレイヤー向け短文（ローカライズキー可）
    gmHint?: string;          // GM 向け追加コンテキスト
    mapHighlight?: boolean;   // Mermaid で region を強調
    expiresAfterTurns?: number;
}

export function emitWorldChanges(events: WorldChangeEvent[]): void;
export function getRecentWorldChanges(maxAge: number): WorldChangeEvent[];
```

**保存先**: `world_state.json` に新フィールド `recentChanges: WorldChangeEvent[]`（最大20件、FIFO）。

> v1.4 で `format` を `lorerelay-world-state/1.1` に上げる。v1.3 では追加しない。

### 3.2 連携シナリオ（受け入れ基準付き）

#### シナリオ A: 食料不足 → NPC Need

```
tickResources: food === 0
    → emit { category: 'resource', factionId, message: '食料が底をついた', severity: 'warning' }
    → npcBridge: 同 factionId の NPC に need を追加/urgency+20
        need: { type: 'material', description: '食料の確保が急務', urgency: 75, relatedEventId }
    → World タブ: 派閥カード recentEvents に表示（既存 UI）
    → GM: buildWorldStatePromptContext に [⚠ Faction crisis] 行追加
```

**受け入れ基準**: `enableEmergentSimulation` + `enableNpcRegistry` 両方 ON で、5 sim ターン以内に食料0の派閥があれば、関連 NPC の `needs` に urgency >= 60 のエントリが1件以上できること。

#### シナリオ B: 敵対派閥 power 増加 → region danger → GM 警告

```
tickEnemyFriction: enemyState.power > 60 && faction.type === 'hostile'
    → region dangerLevel += 0.5（既存）
    → emit { category: 'region', regionId, mapHighlight: true, gmHint: '...' }
    → buildWorldForgePromptContext: 現在地 region の danger を [⚠ RISING] タグ付きで注入
```

**受け入れ基準**: dangerLevel が sim 前後で変化した region が `recentChanges` に `mapHighlight: true` で記録されること。

#### シナリオ C: プレイヤーが拠点を救う → controllingFaction 変化

```
GM turn_result.statePatch: world.currentLocationId 変更
    +  narrative で「拠点奪還」判定（GM 任せ）
    → statePatch: regions[rid].controllingFaction = 'player_faction'  ← v1.4 で allowlist 追加
    → emit { category: 'faction', message: '○○が△△の支配下に', mapHighlight: true }
    → generateWorldMap: 該当 location ラベルに 🚩 追加
```

**受け入れ基準**: `statePatch` で `regions.*.controllingFaction` を更新でき、次の `pushWorldViewToWebview` で Mermaid に反映されること。

### 3.3 `worldMapGenerator` 拡張（v1.4.0）

```typescript
export interface WorldMapOptions {
    highlightRegionIds?: string[];   // recentChanges から抽出
    changedSinceTurn?: number;       // このターン以降に変化した地域
}
```

Mermaid 表現:

- 変化地域: `subgraph id["名前 危険:8 🔥"]` — `🔥` は `recentChanges` に `mapHighlight` がある場合
- 現在地: 既存の `★` 維持
- 新支配: location ラベルに `🚩`

### 3.4 GM プロンプト注入の改善（v1.4.0）

| 関数 | 変更 |
|------|------|
| `buildWorldStatePromptContext` | `recentChanges` から最大3件の `gmHint` を追加 |
| `buildNpcRegistryPromptContext` | **現在地フィルタ** — `game_state.world.currentLocationId` と一致する `locationId` の NPC のみ。最大3人 |
| 新規 `buildWorldChangeSummaryContext` | sim 実行直後の1ターンのみ注入。「Since last visit: ...」形式。~100トークン |

#### 世界変化サマリーの出し方（プレイヤー体感仕様）

| 経路 | タイミング | 内容 |
|------|-----------|------|
| **World タブ** | sim 毎 | `recentChanges` リスト（過去5件） |
| **チャット inline** | sim 直後の最初の GM ターン | `game_state` に `worldChangeBanner?: string` — Webview がバナー表示 |
| **GM ナラティブ** | 重要度 `critical` のみ | プロンプトで「自然に1文触れよ」と指示。毎ターン強制しない |
| **Mermaid** | 常時 | `mapHighlight` 地域に 🔥（3ターンで消える） |

**推奨頻度**: `simIntervalTurns`（デフォルト5）ごとにサマリー。毎ターンはうるさい。

---

## 4. ComfyUI 連携案（v1.5.0 設計）

v1.3 では **スキーマ拡張のみ** 先行可。画像生成本体は v1.5。

### 4.1 スキーマ追加（v1.3 で型定義のみ、v1.5 で動作）

```typescript
// worldForgeCore.ts — WorldLocation に追加
imagePromptHint?: string;

// 任意: 生成済み画像のキャッシュキー
lastGeneratedImage?: string;  // game_state.world 側で管理
```

### 4.2 location 移動時の imagePrompt 自動生成（v1.5）

```
game_state.world.currentLocationId 変更検知（gameStateSync）
    ↓
buildLocationImagePrompt(forge, locationId, worldState)
    ↓ テンプレート合成（LLM 不要）
"[theme] [region.imagePromptHint] [location.description] danger:[N] faction:[name]"
    ↓
if (textAdventure.imageGen.autoOnLocationChange === true)
    mediaAgent.queueImageGen(prompt)
```

**設定**:

- `textAdventure.imageGen.autoOnLocationChange` — デフォルト `false`（明示 OPT-IN）
- `textAdventure.imageGen.includeFactionInPrompt` — デフォルト `true`
- `textAdventure.imageGen.includeDangerInPrompt` — デフォルト `true`

### 4.3 World タブからの手動生成（v1.5）

- 現在地ノードをクリック → 「Generate Scene Image」
- 生成結果を Gallery + `game_state.latestImage` に連動

---

## 5. 優先順位つきタスク表

### v1.3.0 — World Forge Generator（Claude 実装 + Gemini UI/docs）

| P | タスク | ファイル | 工数 |
|---|--------|---------|------|
| P0 | `worldForgeGeneratorCore.ts` 手続き型生成 | 新規 | M |
| P0 | `worldForgeGenerator.ts` I/O + 設定 | 新規 | S |
| P0 | `bootstrapNpcRegistryFromForge()` | `worldForge.ts` or 新規 `worldBootstrap.ts` | S |
| P0 | `getFactionName()` 修正（forge 参照） | `emergentSimulator.ts` | XS |
| P1 | `test_world_forge_generator.js` | 新規 | S |
| P1 | World タブ Generate UI | `85-world.js`, `webviewHandlers.ts`, `extension.ts` | M |
| P1 | VSCode 設定 4件 | `package.json` | XS |
| P2 | LLM enrich オプション | `worldForgeGenerator.ts` + SKILL 追記 | M |
| P2 | `sample-scenarios/*/world_forge.json` 自動生成サンプル1件 | samples | S |
| P2 | README / `WORLD_SYSTEM_DESIGN.md` 更新 | docs | S |

### v1.4.0 — Living World Feedback（Claude 主導）

| P | タスク | ファイル | 工数 |
|---|--------|---------|------|
| P0 | `worldEventBus.ts` | 新規 | M |
| P0 | sim → emitWorldChanges 配線 | `emergentSimulator.ts` | M |
| P0 | npcBridge（sim → needs） | `npcRegistry.ts` 新関数 | M |
| P1 | `recentChanges` in world_state | `worldStateCore.ts` + schema | S |
| P1 | NPC 現在地フィルタ | `gmPromptBuilder.ts` | S |
| P1 | マップ 🔥 ハイライト | `worldMapGenerator.ts`, `85-world.js` | S |
| P1 | `buildWorldChangeSummaryContext` | `gmPromptBuilder.ts` | S |
| P2 | `statePatch` で `regions.*.controllingFaction` | `statePatch.ts` | S |
| P2 | World タブ recentChanges セクション | `85-world.js` | S |

### v1.5.0 — Visual World / ComfyUI

| P | タスク | 工数 |
|---|--------|------|
| P0 | `WorldLocation.imagePromptHint` 型追加 + 生成器対応 | S |
| P0 | `buildLocationImagePrompt()` | M |
| P1 | `autoOnLocationChange` 設定 + mediaAgent 連携 | M |
| P2 | World タブ「Generate Scene Image」 | M |

---

## 6. 既存コードへの影響マトリクス

| ファイル | v1.3.0 変更 | v1.4.0 変更 | 破壊的変更 |
|---------|------------|------------|-----------|
| `worldForgeCore.ts` | なし（型そのまま） | なし | なし |
| `worldForge.ts` | bootstrap 関数追加 | — | なし |
| `worldStateCore.ts` | なし | `recentChanges` 追加 | フォーマット 1.0→1.1（後方互換 parse） |
| `emergentSimulator.ts` | `getFactionName` 修正 | emit 配線 | なし |
| `npcRegistry.ts` | bootstrap 追加 | `applySimNeeds()` 追加 | なし |
| `gmPromptBuilder.ts` | なし | フィルタ + summary | なし |
| `worldMapGenerator.ts` | なし | highlight オプション | なし |
| `worldView.ts` | generate 結果 push | recentChanges 送信 | なし |
| `gameStateSync.ts` | generate 完了時の push | location 変更 detect | なし |
| `statePatch.ts` | なし | region faction allowlist | なし |
| `85-world.js` | Generate UI | recentChanges UI | なし |
| `game_state_schema.json` | なし | `worldChangeBanner?` | 任意フィールド |

---

## 7. 失敗しやすい点と対策

| リスク | 症状 | 対策 |
|--------|------|------|
| **LLM 生成 JSON が壊れる** | `parseWorldForge` 失敗 | 手続き型骨格にフォールバック。部分マージしない |
| **上書き事故** | 既存セーブの世界が消える | Overwrite 確認 + `world_forge.json.bak` 自動バックアップ |
| **ID 衝突** | faction/region 重複 | `{theme}_{seq}` 強制 + 正規表現 `^[a-z][a-z0-9_]{1,31}$` |
| **sim ↔ NPC 二重更新** | 同一 Need が毎 sim で増殖 | `relatedEventId` で dedupe。既存 need は urgencyDelta のみ |
| **GM トークン爆発** | World コンテキストが長すぎ | 現在地 NPC フィルタ + recentChanges 最大3件 + 既存 500tok 予算維持 |
| **Mermaid 破綻** | 特殊文字でグラフが壊れる | 既存 `escapeMmdLabel` 維持。emoji は1個まで |
| **location 画像自動生成の迷惑** | 毎移動で ComfyUI 起動 | デフォルト OFF。クールダウン 60s |
| **initialNpcs と characters/ 重複** | 同名 NPC が二重管理 | v1.3 では `npc_registry` のみ。characters/ 連携は v1.6 以降 |
| **テストの決定性** | LLM enrich で CI が不安定 | CI は `proceduralOnly: true` のみ。LLM enrich は手動テスト |

---

## 8. 受け入れ基準（ChatGPT 整理 — v1.3.0 リリースゲート）

### 必須（すべて満たすこと）

- [ ] `generateWorldForge({ worldSeed: 'test', theme: 'dungeon-crawler' })` が valid な `world_forge.json` を生成
- [ ] 同一 seed で2回生成した結果が **バイト一致**（決定性）
- [ ] 生成後 `npc_registry.json` に `initialNpcs` 全員分のエントリがある
- [ ] 生成後 `world_state.json` が `buildInitialWorldState` で作成される
- [ ] World タブに Mermaid マップが表示される（`85-world.js` bundle 済み）
- [ ] `npm test` に `test_world_forge_generator.js` が含まれ全パス
- [ ] `emergentSimulator` のイベント文に派閥**名**が出る（ID ではない）
- [ ] 既存 `lost-catacombs` シナリオは手書き `world_forge.json` のまま動作（後方互換）

### 推奨（v1.3.1 で可）

- [ ] LLM enrich が ON でも parse 失敗時にクラッシュしない
- [ ] Generate UI から overwrite キャンセルができる
- [ ] `AI_SHARED_LOG.md` に生成フローが記録されている

---

## 9. Claude / Gemini への引き渡しプロンプト（コピペ用）

### Claude（v1.3.0 実装）

```
ブランチ: refactor/ws-and-extension-split
設計書: WORLD_SYSTEM_V1.3_DESIGN.md §2, §5(v1.3), §8

実装してほしいもの:
1. worldForgeGeneratorCore.ts + worldForgeGenerator.ts
2. bootstrapNpcRegistryFromForge()
3. emergentSimulator getFactionName 修正
4. test_world_forge_generator.js + npm test 追加
5. package.json 設定4件

World タブ UI は Gemini と競合しないよう、ハンドラ postMessage 型定義のみ先行可。
```

### Gemini（v1.3.0 UI + docs）

```
ブランチ: refactor/ws-and-extension-split
設計書: WORLD_SYSTEM_V1.3_DESIGN.md §2.8

Claude の generator 完了後:
1. 85-world.js Generate World フォーム
2. webviewHandlers.ts / extension.ts 配線
3. README v1.3 セクション
4. CHANGELOG [1.3.0]
5. AI_SHARED_LOG 追記
```

---

## 10. `WORLD_SYSTEM_DESIGN.md` との関係

| ドキュメント | 役割 |
|-------------|------|
| `WORLD_SYSTEM_DESIGN.md` | v1.2 全体アーキテクチャの正本（変更しない） |
| **本書** | v1.3〜v1.5 の差分設計・ギャップ埋め・受け入れ基準 |

v1.3.0 実装完了時に `WORLD_SYSTEM_DESIGN.md` §9 のフェーズ表を更新し、Step 2〜5 を ✅ にする。

---

*設計完了: 2026-06-27 — Phase 3 (ChatGPT 計画) 成果物*