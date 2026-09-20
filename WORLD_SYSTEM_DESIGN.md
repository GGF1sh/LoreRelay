# LoreRelay 世界生成・生きている世界システム 全体設計書

> **作成日**: 2026-06-27  
> **対象バージョン**: v1.1.x 以降  
> **設計方針**: ファイルベースの状態管理を崩さない・計算コストを抑える・段階的実装・GMプロンプトへの自然な統合

---

## 1. 全体像とアーキテクチャ図

### 追加する4つのサブシステム

```
┌─────────────────────────────────────────────────────────────┐
│                     LoreRelay v2.x                          │
│                                                             │
│  ┌──────────────────┐   ┌─────────────────────────────┐   │
│  │  World Forge     │──▶│  world_forge.json            │   │
│  │  (世界生成エンジン)│   │  (地域・派閥・NPC・歴史)      │   │
│  └──────────────────┘   └───────────┬─────────────────┘   │
│           │                         │                       │
│           ▼                         ▼                       │
│  ┌──────────────────┐   ┌─────────────────────────────┐   │
│  │  Emergent Sim    │──▶│  world_state.json            │   │
│  │  (簡易シミュレータ)│   │  (派閥関係・資源・イベント)    │   │
│  └──────────────────┘   └───────────┬─────────────────┘   │
│           │                         │                       │
│           ▼                         ▼                       │
│  ┌──────────────────┐   ┌─────────────────────────────┐   │
│  │  NPC Memory      │──▶│  npc_registry.json           │   │
│  │  + Disposition   │   │  (記憶・感情・需要・関係値)    │   │
│  │  + Needs         │   └───────────┬─────────────────┘   │
│  └──────────────────┘               │                       │
│           │                         │                       │
│           ▼                         ▼                       │
│  ┌──────────────────────────────────────────────────┐      │
│  │              gmPromptBuilder.ts                   │      │
│  │  (World Forge + World State + NPC Memory を注入)  │      │
│  └──────────────────────────────────────────────────┘      │
│           │                                                  │
│           ▼                                                  │
│  ┌──────────────────────────────────────────────────┐      │
│  │   生きている世界マップ (Webview タブ)              │      │
│  │   Mermaid + ComfyUI 連携ビジュアライザ            │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 既存システムとの関係

| 既存ファイル/モジュール | 役割 | 新システムとの関係 |
|---|---|---|
| `game_state.json` | ターンごとの状態 | `worldState` キーを追加してシミュ結果を保持 |
| `scenario.json` | シナリオ定義 | `worldForge` キーを追加して世界種を定義 |
| `lorebook.json` | 世界知識 | World Forge の生成結果を自動エントリ追加 |
| `party_director.json` | NPC制御 | NPC Disposition をここから読む（拡張） |
| `characters/` ディレクトリ | キャラクター定義 | `npc_registry.json` が参照先の一つになる |
| `gmPromptBuilder.ts` | GMへのコンテキスト注入 | 新しい `buildWorldPromptContext()` を追加 |

---

## 2. ファイルフォーマット仕様

### 2-A: `world_forge.json` — 世界の種（シナリオ単位）

**配置場所**: `<workspace>/world_forge.json` または `<scenario>/world_forge.json`

```json
{
  "format": "lorerelay-world-forge/1.0",
  "meta": {
    "worldName": "崩壊の大陸アルカディア",
    "worldSeed": "arcadia-2847",
    "theme": "dark-fantasy",
    "generatedAt": "2026-06-27T12:00:00Z",
    "generationMethod": "ai-generated"
  },
  "geography": {
    "regions": [
      {
        "id": "northern_wastes",
        "name": "北方荒野",
        "type": "wilderness",
        "climate": "tundra",
        "dangerLevel": 7,
        "description": "かつての帝国が滅びた地。魔法の残滓が漂う。",
        "connectedTo": ["imperial_ruins", "frost_peaks"],
        "resourceNodes": ["ancient_mana_crystal", "frozen_ore"],
        "imagePromptHint": "frozen wasteland, ruins of an ancient empire, purple aurora"
      }
    ],
    "locations": [
      {
        "id": "last_bastion",
        "name": "最後の砦",
        "regionId": "northern_wastes",
        "type": "settlement",
        "population": 340,
        "factionControl": "survivors_guild",
        "description": "生存者たちが集まる最後の拠点。",
        "services": ["inn", "blacksmith", "market"]
      }
    ]
  },
  "factions": [
    {
      "id": "survivors_guild",
      "name": "生存者同盟",
      "type": "neutral",
      "power": 60,
      "resources": { "food": 40, "weapons": 30, "mana": 10 },
      "goals": ["生き残る", "北方の謎を解明する"],
      "enemies": ["void_cult"],
      "allies": [],
      "description": "帝国崩壊後に各地の生存者が結成した緩やかな同盟。"
    }
  ],
  "loreHistory": [
    {
      "era": "帝国時代",
      "yearsBefore": 200,
      "event": "アルカディア帝国の最盛期。魔法技術が頂点に達する。"
    },
    {
      "era": "崩壊期",
      "yearsBefore": 50,
      "event": "虚無の召喚実験が失敗し、帝国が瞬く間に崩壊。"
    }
  ],
  "initialNpcs": [
    {
      "id": "elder_mira",
      "name": "長老ミラ",
      "role": "quest-giver",
      "locationId": "last_bastion",
      "factionId": "survivors_guild",
      "description": "80歳の賢者。帝国崩壊を生き延びた数少ない証人。"
    }
  ]
}
```

**設計ポイント**:
- `generationMethod` が `"manual"` なら手書き、`"ai-generated"` ならWorld Seed + AI生成
- `initialNpcs` は `npc_registry.json` の初期データの種になる
- `factions` の情報はエマージェントシミュレーションの初期値になる

---

### 2-B: `world_state.json` — 世界の現在状態（ランタイム）

**配置場所**: `<workspace>/world_state.json`  
**更新タイミング**: シミュレーションステップ実行時（プレイヤーターンn回ごと）

```json
{
  "format": "lorerelay-world-state/1.0",
  "lastUpdated": "2026-06-27T12:30:00Z",
  "worldTurn": 15,
  "factions": {
    "survivors_guild": {
      "power": 55,
      "resources": { "food": 35, "weapons": 28, "mana": 8 },
      "morale": 60,
      "recentEvents": ["食料備蓄が15%減少", "北方偵察隊が行方不明"]
    },
    "void_cult": {
      "power": 70,
      "resources": { "food": 20, "weapons": 60, "mana": 90 },
      "morale": 85,
      "recentEvents": ["新たな信者を20人獲得", "要塞を一か所制圧"]
    }
  },
  "regions": {
    "northern_wastes": {
      "dangerLevel": 8,
      "controllingFaction": null,
      "activeEvents": ["void_anomaly_spreading"]
    }
  },
  "globalEvents": [
    {
      "id": "void_anomaly_spreading",
      "type": "environmental",
      "severity": "major",
      "description": "虚無の歪みが北方から拡大中。",
      "turnsRemaining": 10,
      "triggerCondition": null
    }
  ],
  "pendingWorldEvents": []
}
```

---

### 2-C: `npc_registry.json` — NPC記憶・感情・需求管理

**配置場所**: `<workspace>/npc_registry.json`

```json
{
  "format": "lorerelay-npc-registry/1.0",
  "npcs": {
    "elder_mira": {
      "name": "長老ミラ",
      "locationId": "last_bastion",
      "factionId": "survivors_guild",
      "disposition": {
        "playerTrust": 60,
        "playerRomance": 0,
        "playerFear": 5,
        "mood": "worried",
        "lastInteractionTurn": 12
      },
      "needs": [
        {
          "id": "find_scouts",
          "type": "quest",
          "description": "行方不明の偵察隊を探してほしい",
          "urgency": 80,
          "relatedEventId": "void_anomaly_spreading"
        },
        {
          "id": "reassurance",
          "type": "emotional",
          "description": "希望の言葉が必要",
          "urgency": 40,
          "relatedEventId": null
        }
      ],
      "memories": [
        {
          "id": "mem_001",
          "turn": 5,
          "content": "プレイヤーが食料を寄付してくれた",
          "emotionalWeight": "positive",
          "tags": ["generosity", "trust-building"]
        },
        {
          "id": "mem_002",
          "turn": 10,
          "content": "プレイヤーが虚無の儀式に興味を示した",
          "emotionalWeight": "suspicious",
          "tags": ["void", "caution"]
        }
      ],
      "personalityTraits": ["wise", "protective", "nostalgic"],
      "dialogueHints": {
        "highTrust": "内密の話ができる。帝国の秘密を明かすかもしれない。",
        "lowTrust": "表面的な情報のみ共有。警戒した態度。",
        "highUrgency": "「時間がない」という言い回しを多用する。"
      }
    }
  }
}
```

**Disposition の数値定義**:
| フィールド | 範囲 | 意味 |
|---|---|---|
| `playerTrust` | 0-100 | 信頼度。70+で秘密を話す |
| `playerRomance` | 0-100 | ロマンス好感度 |
| `playerFear` | 0-100 | プレイヤーへの恐怖。50+で態度が変わる |
| `mood` | enum | `happy/worried/angry/sad/neutral/excited` |

**Needs の `urgency`**:
- 0-30: バックグラウンドニーズ（言及しない）
- 31-60: 機会があれば話題に出る
- 61-80: 積極的に助けを求める
- 81-100: 緊急。毎ターン言及する

---

### 2-D: `world_map.mmd` — Mermaid世界マップ（自動生成）

**配置場所**: `<workspace>/world_map.mmd`  
**生成元**: `world_forge.json` + `world_state.json`  
**更新タイミング**: シミュレーションステップ後に自動再生成

```
graph TD
  subgraph northern_wastes["北方荒野 (危険度8)"]
    last_bastion["🏰 最後の砦\n生存者同盟支配\n人口340"]
    void_shrine["⚫ 虚無の祠\n虚無教団支配"]
  end
  subgraph imperial_ruins["帝国廃墟"]
    ancient_vault["🔒 古代の金庫室\n未制圧"]
  end
  northern_wastes -->|危険: void_anomaly| imperial_ruins
  survivors_guild((生存者同盟\n⚡55)) -->|支配| last_bastion
  void_cult((虚無教団\n⚡70)) -->|支配| void_shrine
  void_cult -.->|敵対| survivors_guild
```

---

## 3. モジュール責務とファイル構成

### 新規作成するTypeScriptモジュール

```
src/
├── worldForge.ts           ← World Forgeデータ読み込み・パース・バリデーション
├── worldForgeCore.ts       ← 型定義（WorldForge, Region, Faction, InitialNpc）
├── worldState.ts           ← WorldState読み込み・シミュレーションステップ適用
├── worldStateCore.ts       ← 型定義（WorldState, FactionState, GlobalEvent）
├── npcRegistry.ts          ← NPCRegistry読み込み・Disposition更新・Memory追加
├── npcRegistryCore.ts      ← 型定義（NpcEntry, Disposition, Need, NpcMemory）
├── worldMapGenerator.ts    ← world_forge + world_state → Mermaid MMD生成
└── emergentSimulator.ts    ← 軽量シミュレーションロジック（ターン経過処理）
```

### 各モジュールの責務

#### `worldForgeCore.ts` — 型定義のみ
```typescript
export interface WorldForge { /* ... */ }
export interface Region { /* ... */ }
export interface Faction { /* ... */ }
export interface InitialNpc { /* ... */ }
```

#### `worldForge.ts` — データアクセス層
- `loadWorldForge(): WorldForge | undefined`
- `getForgeRegions(): Region[]`
- `getForgeFactions(): Faction[]`
- `getForgeInitialNpcs(): InitialNpc[]`
- キャッシュパターンは `lorebookLoader.ts` と同一

#### `worldState.ts` — ランタイム状態
- `loadWorldState(): WorldState | undefined`
- `saveWorldState(state: WorldState): void`
- `getWorldTurn(): number`
- `incrementWorldTurn(): number`
- `getFactionState(id: string): FactionState | undefined`

#### `npcRegistry.ts` — NPC内面管理
- `loadNpcRegistry(): NpcRegistry`
- `getNpcEntry(id: string): NpcEntry | undefined`
- `updateDisposition(npcId: string, delta: Partial<Disposition>): void`
- `addNpcMemory(npcId: string, memory: Omit<NpcMemory, 'id'>): void`
- `resolveNpcNeeds(npcId: string): Need[]` — urgency順ソート済み
- `saveNpcRegistry(): void`

#### `emergentSimulator.ts` — シミュレーション
- `runSimulationStep(worldForge, worldState, playerTurn): WorldState`
- 派閥パワー変動・資源消費・イベント進行を計算
- 重い計算は一切しない（ルールベースの四則演算のみ）

#### `worldMapGenerator.ts` — Mermaid生成
- `generateWorldMap(forge: WorldForge, state: WorldState): string`
- MMDテキストを返す（ファイル書き込みは呼び出し側）

---

## 4. データフロー

### フロー1: World Forge → GMプロンプト注入

```
world_forge.json
    │
    ▼ loadWorldForge()
worldForge.ts
    │
    ▼ buildWorldForgePromptContext()
gmPromptBuilder.ts ── [World Forge Context] セクションとしてプロンプトに追加
    │
    ▼
LLM (GM)
```

### フロー2: シミュレーション実行（n ターンごと）

```
プレイヤーターン終了
    │
    ▼ (playerTurnCount % simInterval === 0)
emergentSimulator.runSimulationStep()
    │
    ├── world_state.json を更新
    ├── npc_registry.json の Needs urgency を更新
    └── world_map.mmd を再生成
         │
         ▼
    Webview の「世界マップ」タブを自動更新
```

### フロー3: NPC Memory 更新（GMレスポンス処理時）

```
LLMレスポンス (turn_result.json)
    │
    ▼ (npcMemoryUpdates フィールドを読む)
npcRegistry.updateDisposition() / addNpcMemory()
    │
    ▼ npc_registry.json に書き込み（writeJsonAtomic）
    │
    ▼ 次ターンの buildNpcRegistryPromptContext() で注入
```

---

## 5. GMプロンプトへの注入設計

`gmPromptBuilder.ts` に以下の関数を追加する：

### `buildWorldForgePromptContext()` — 世界の設定を注入
```
[World — Factions & Regions]
Active factions: 生存者同盟 (power:55, morale:60), 虚無教団 (power:70, morale:85)
Current threat: void_anomaly_spreading (severity: major, 残り10ターン)
Player location: 最後の砦 (生存者同盟支配, 人口340)
Recent world events: 食料備蓄15%減少 / 北方偵察隊が行方不明
```

### `buildNpcRegistryPromptContext(nearbyNpcIds: string[])` — NPC内面を注入
```
[NPC Awareness — 長老ミラ]
Disposition: trust=60 (willing to share info), mood=worried
Active needs (HIGH): find missing scouts (urgency:80)
Active needs (MED): seeks reassurance (urgency:40)
Recent memory: "プレイヤーが虚無の儀式に興味を示した" → cautious
Dialogue hint: Use "time is running out" expressions. Can share faction intel.
```

### `buildWorldStatePromptContext()` — 世界の現在状態を注入（簡潔版）
```
[World State — Turn 15]
Faction balance: void_cult gaining power (70 vs 55). Tension rising.
Environmental: Void anomaly spreading north. 10 turns until critical.
```

### 注入の優先順位と条件

| コンテキスト | 注入条件 | トークン目安 |
|---|---|---|
| `WorldForgeFull` | 初回・シナリオ開始時のみ | ~800 |
| `WorldStateSummary` | 毎ターン（コンパクト版） | ~150 |
| `NpcRegistry` | プレイヤーが近くにいるNPCのみ | ~200/NPC |
| `WorldForgeFull` | ロアブック等で言及された地域名が出た時 | ~300 |

---

## 6. `game_state.json` / `scenario.json` への変更

### `game_state.json` の追加フィールド（`world` キー）

```json
{
  "world": {
    "currentLocationId": "last_bastion",
    "visitedLocationIds": ["last_bastion"],
    "knownFactionIds": ["survivors_guild"],
    "worldTurnAtLastSync": 15,
    "pendingNpcMemoryUpdates": []
  }
}
```

**設計ポイント**: `world_state.json` はターン単位で更新される世界全体の状態。`game_state.json` の `world` はプレイヤーが「知っている・いる」場所の追跡のみ担当。責務を分離する。

### `scenario.json` の追加フィールド（`worldForge` キー）

```json
{
  "format": "text-adventure-scenario/1.0",
  "meta": { "title": "..." },
  "worldForge": {
    "source": "world_forge.json",
    "simIntervalTurns": 5,
    "enableEmergentSim": true,
    "enableNpcRegistry": true,
    "enableLivingMap": true
  }
}
```

---

## 7. statePatch との連携

LLMは `turn_result.json` の `statePatch` 経由で以下を更新できる：

```json
{
  "statePatch": {
    "world.currentLocationId": "ancient_vault",
    "world.visitedLocationIds": ["last_bastion", "ancient_vault"]
  },
  "npcMemoryUpdates": [
    {
      "npcId": "elder_mira",
      "dispositionDelta": { "playerTrust": 10 },
      "newMemory": {
        "content": "プレイヤーが偵察隊の手がかりを見つけた",
        "emotionalWeight": "positive",
        "tags": ["trust-building", "quest-progress"]
      }
    }
  ]
}
```

`npcMemoryUpdates` は既存の `profileUpdates` と同様のパターンで処理する（`turn_result.json` → TS側で `npcRegistry.ts` を呼ぶ）。

---

## 8. Webview UI — 「世界マップ」タブ

### 追加するタブ

既存タブ（Director / Party / Inspector / Lorebook / Memory）の横に「**World**」タブを追加。

### タブの内容

**セクション1: 世界マップ（Mermaid）**
- `world_map.mmd` を読み込んでMermaidグラフをレンダリング
- シミュレーション後に自動更新

**セクション2: 派閥ステータス**
- 各派閥のパワー・リソース・最近のイベントをカード表示

**セクション3: NPC一覧**
- プレイヤーの現在地にいるNPCのDisposition / Needsをバー表示
- Turn Inspectorと同様の読み取り専用ビュー

**セクション4: シミュレーション制御**
- 「シミュを n ターン進める」ボタン（手動実行）
- 自動実行のON/OFF + インターバル設定

---

## 9. 実装フェーズ（段階的）

| フェーズ | 内容 | 優先度 | 推定規模 |
|---|---|---|---|
| **Step 2** | NPC Memory + Disposition + Needs | ★★★ 最高 | ~600行 |
| **Step 3** | World Forge モジュール（型定義・ローダー・GMプロンプト注入） | ★★★ 高 | ~400行 |
| **Step 4** | 生きている世界マップ（Mermaid生成 + Webviewタブ） | ★★ 中 | ~350行 |
| **Step 5** | 簡易エマージェントシミュレーション層 | ★ 低 | ~300行 |

### Step 2 の詳細スコープ（次にやること）

1. `src/npcRegistryCore.ts` — 型定義
2. `src/npcRegistry.ts` — ロード・保存・更新API
3. `src/gmPromptBuilder.ts` — `buildNpcRegistryPromptContext()` 追加
4. `src/webviewHandlers.ts` — `npcMemoryUpdates` の処理を追加
5. `npc_registry.json` スキーマ定義（JSONSchemaファイル）
6. Webviewへの簡易NPC表示（PartyタブにDispositionバー追加）

### Step 3 の詳細スコープ

1. `src/worldForgeCore.ts` — 型定義
2. `src/worldForge.ts` — ロード・キャッシュ
3. `src/gmPromptBuilder.ts` — `buildWorldForgePromptContext()` 追加
4. `game_state.json` スキーマに `world` キー追加

### Step 4 の詳細スコープ

1. `src/worldMapGenerator.ts` — Mermaid生成ロジック
2. Webviewに「World」タブ追加
3. `world_state.json` 変更を監視してタブ自動更新

### Step 5 の詳細スコープ

1. `src/emergentSimulator.ts` — シミュレーションロジック
2. `src/worldState.ts` — 更新・保存
3. ターン進行フック（`gameStateSync.ts` 経由）

---

## 10. 設計上の制約・注意点

### 計算コストを抑える原則
- シミュレーションは**四則演算のみ**（LLM呼び出しなし）
- NPC Memoryは**最大10件**まで（古いものは自動圧縮）
- GMプロンプトへのNPC注入は**プレイヤーの現在地の近くにいるNPCのみ**
- `world_state.json` の更新は**n ターンごと**（デフォルト: 5）

### ファイルベース設計の原則（既存踏襲）
- すべての永続データはJSONファイル
- 書き込みは `writeJsonAtomic()` を使う（既存パターン）
- キャッシュは mtime ベース（`lorebookLoader.ts` と同じパターン）

### GMプロンプトのトークン予算
- 全コンテキスト合計で **+500トークン以内** を目標
- `WorldStateSummary`: ~150トークン（毎ターン注入）
- `NpcRegistry`: 近くにいるNPCのみ × ~150トークン/NPC
- `WorldForgeFull`: 必要時のみ（ロアブックと同様の発火ルール）

### 既存機能との衝突を避ける
- `party_director.json` の `relationships` フィールドと `npc_registry.json` の `disposition.playerTrust` は**別物**（party_directorはパーティーメンバー間の関係、npc_registryはワールドNPCとプレイヤーの関係）
- `profileUpdates`（既存）は動的プロフィール更新。`npcMemoryUpdates`（新規）はNPC記憶・感情の更新。両立させる

---

## 11. サンプルシナリオ連携

既存の `lost-catacombs` シナリオに World Forge を追加する実装例：

```json
// sample-scenarios/lost-catacombs/world_forge.json
{
  "format": "lorerelay-world-forge/1.0",
  "meta": {
    "worldName": "古代地下墓地の世界",
    "worldSeed": "catacombs-001",
    "theme": "dungeon-crawler"
  },
  "factions": [
    {
      "id": "undead_legion",
      "name": "不死の軍団",
      "type": "hostile",
      "power": 80,
      "resources": { "food": 0, "weapons": 70, "mana": 50 }
    },
    {
      "id": "grave_watchers",
      "name": "墓守協会",
      "type": "neutral",
      "power": 40
    }
  ]
}
```

---

*この設計書は全体の整合性を固めるためのものです。各Stepの実装時に詳細を更新してください。*
