# World System & Visual Memory — Architecture Deep Dive

LoreRelay v1.6.1 時点の **Living World** と **Visual Memory / Soulgaze** の設計・データフロー・硬化ポイントをまとめたドキュメントです。

---

## 1. 全体像

LoreRelay は「AI が書く JSON」を UI が描画する疎結合アーキテクチャですが、v1.3 以降は **世界の静的設計** と **ターンごとの動的状態**、v1.5 以降は **画像の視覚記憶** が GM プロンプトに入り、単なるチャット UI を超えた **シミュレーション基盤** になっています。

```
┌─────────────────────────────────────────────────────────────────┐
│                        GM Bridge / SKILL.md                      │
│   (Grok / Ollama / clipboard / … が game_state.json を更新)      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
 world_forge.json        world_state.json      visual_memory.json
 (静的ワールド設計)        (動的シミュレーション)   (VLM 情景記憶)
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                ▼
                    gmPromptBuilder.ts
              (World / World Changes / Vision セクション)
                                │
                                ▼
                         次ターンの GM 叙述
```

---

## 2. World System（v1.3+）

### 2.1 二層構造

| レイヤー | ファイル | 役割 |
|---------|---------|------|
| **Forge（設計図）** | `world_forge.json` | 地域・ロケーション・派閥・初期 NPC の procedural 生成結果。シードで再現可能 |
| **State（ランタイム）** | `world_state.json` | 現在地点、訪問済み、派閥資源、危険度、直近の World Change イベント |

- **生成**: `worldForgeGeneratorCore.ts`（pure、mulberry32 PRNG）→ `worldForgeGenerator.ts` がワークスペースへ保存
- **入口**: Webview の World タブ、`textadventure.generateWorldForge` コマンド、Quickstart
- **検証**: `webviewHandlersCore.ts` で seed/theme/カウントをクランプ、`isValidEventId` で seed 形式チェック（v1.6 T8）

### 2.2 Emergent Simulation

`emergentSimulator.ts` が `game_rules.json` の `enableEmergentSimulation` と `simIntervalTurns` に従い、N ターンごとに:

- 派閥の資源・士気・影響力を更新
- 地域の `dangerLevel` を微調整
- `worldEventLogCore` 経由で `recentChanges` を蓄積
- `npcBridgeCore` で NPC レジストリへイベントを反映

GM は毎ターン全部を計算するのではなく、**自律シミュレーターが世界を「生き続けさせる」** 役割を担います。

### 2.3 GM プロンプトへの注入

`gmPromptBuilder.ts` は次のセクションを組み立てます:

| セクション | ソース | 内容 |
|-----------|--------|------|
| `World` | `world_forge.json` + `game_state.world` | 現在地、派閥、危険度、ロケーション説明 |
| `World Changes` | `world_state.recentChanges` | 直近ターンの変化サマリー（`gmPromptBuilderCore`） |
| `NPC Awareness` | `npc_registry.json` | 登録 NPC の認識状態 |

### 2.4 statePatch の安全設計（Audit Wave T2）

LLM が `game_state` を patch する際、`statePatch.ts` は **`/world` の一括置換を拒否** し、許可 subpath を限定します:

- `currentLocationId`
- `regions/*/controllingFaction`
- `regions/*/dangerLevel`

さらに patch 件数上限（50）、value サイズ上限（100KB）、world value の型検証があります。World 全体を AI が壊すリスクを大幅に下げています。

### 2.5 ComfyUI 連動（ロケーション画像）

ロケーション移動時、`locationImageBuilder.ts` が `world_forge.json` からプロンプトを組み立て、ComfyUI で背景を生成できます。v1.6 では `generateLocationImage` に `isValidEventId` ガードが hub / webview 両方に入っています。

---

## 3. Visual Memory / Soulgaze（v1.5+）

### 3.1 目的

生成画像は「ギャラリーに一度表示して終わり」ではなく、**VLM が情景を言語化して蓄積**し、以降の GM 叙述と整合させます（Soulgaze）。

### 3.2 データモデル

`visualMemoryCore.ts`（pure、テスト可能）:

```typescript
VisualMemoryEntry {
  imageHash: string;      // SHA-256 先頭 16 hex（重複排除キー）
  imagePath: string;
  description: string;    // ≤ 1200 文字
  analyzedAt: string;
  worldTurn?: number;
  locationId?: string;
  generationPrompt?: string;
  tags?: VisualMemoryTag[];
}
```

永続化先: `visual_memory.json`（最大 500 エントリ）

### 3.3 処理フロー

```
画像生成完了 (ComfyUI / 手動)
        │
        ▼
enqueueVlmAnalysis(path, meta)   ← imageGenRunner / gmBridgeRunner
        │
   ┌────┴────┐
   │ cache?  │
   └────┬────┘
   hit │ miss
       │    └──► vlmProvider.analyzeImage()
       │              │
       │              ▼
       │         visual_memory.json へ store
       │              │
       └──────► game_state.latestImageDescription へ write
                  （latestImage が一致する場合のみ）
                       │
                       ▼
              Webview: vlmAnalysisComplete
```

**重要な設計判断**:

1. **非ブロッキング**: VLM は fire-and-forget。GM ブリッジは待たない。説明は **次ターン以降** のプロンプトで効く。
2. **最新優先キュー**: 同時リクエスト時は `pendingPath` を上書き（busy 時は最新画像だけ分析）。
3. **パス統一（T5）**: キューには `resolveAllowedImagePath` 済みパスだけを渡す。Gallery ↔ VLM のパス不一致バグを修正。
4. **Stale write 防止**: `writeDescriptionToGameState` は `latestImage` がまだ同じ画像のときだけ description を書く。

### 3.4 VLM プロバイダー

`vlmProvider.ts`:

| 設定値 | 実際の接続先 |
|--------|-------------|
| `disabled` | 分析しない |
| `ollama` | ローカル `/api/generate`（llava 等） |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` |

v1.6.2 から設定 UI は `disabled / ollama / openrouter` の 3 択に整理。旧値 `openai` / `gemini` / `anthropic` はコード上 OpenRouter 経由として互換維持。

### 3.5 GM プロンプトへの戻り（Vision セクション）

`buildVisionContext()` の優先順位:

1. `visual_memory.json` のエントリ → `buildVisualContextSnippet()`（locationId / tags 含む）
2. `game_state.latestImageDescription`（フォールバック）
3. VLM 有効かつ分析中 → 「次ターンで利用可能」プレースホルダ

`buildGmPromptBreakdown()` の `vision` セクションとして Turn Inspector でも確認できます。

---

## 4. Audit Wave で固めた境界（v1.6）

| トラック | 主なモジュール | World / VLM 関連 |
|---------|---------------|------------------|
| T2 State | `validateGameState.ts`, `statePatch.ts` | world ID、dangerLevel 0–10、`npcMemoryUpdates` 二重防御 |
| T3 World | `worldStateCore.ts`, `npcBridgeCore.ts` | 数値クランプ、派閥/地域の範囲制限 |
| T5 Visual | `vlmQueue.ts`, `vlmQueueCore.ts` | resolved path 統一、description サニタイズ |
| T6 Webview | `webviewHandlersCore.ts` | `generateWorldForge` seed、`requestVlmAnalysis` path 検証 |
| T8 Hub | `extension.ts` | コマンドパレット経路でも同じクランプを適用 |

**原則**: VSCode 依存のないロジックは `*Core.ts` に切り出し、`scripts/test_*.js` で Node 単体テスト可能にする。

---

## 5. 関連ファイル早見表

| 領域 | ファイル |
|------|---------|
| World 生成 | `worldForgeGeneratorCore.ts`, `worldForgeGenerator.ts` |
| World 状態 | `worldState.ts`, `worldStateCore.ts` |
| シミュレーション | `emergentSimulator.ts`, `worldEventLogCore.ts` |
| NPC 連動 | `npcBridgeCore.ts`, `npcRegistry.ts` |
| VLM キュー | `vlmQueue.ts`, `vlmQueueCore.ts`, `vlmProvider.ts` |
| 視覚記憶 | `visualMemory.ts`, `visualMemoryCore.ts` |
| GM 注入 | `gmPromptBuilder.ts`, `gmPromptBuilderCore.ts` |
| Webview 検証 | `webviewHandlersCore.ts`, `webviewHandlers.ts` |
| 状態検証 | `validateGameState.ts`, `statePatch.ts` |

---

## 6. デバッグ・確認手順

1. `world_forge.json` を生成 → World タブで Mermaid 図とロケーション一覧を確認
2. 1 ターン進行 → `world_state.json` の `recentChanges` / `worldTurn` を確認
3. `textAdventure.vlm.provider` を `ollama` または `openrouter` に設定
4. 画像生成 → Gallery で Analyze → `visual_memory.json` にエントリ追加を確認
5. 次ターンの GM プロンプト（Turn Inspector の Vision セクション）に Visual Context が入ることを確認

```powershell
npm test   # test_world_forge_generator, test_visual_memory, test_vlm_queue 等
```

---

## 7. 今後（v1.6.2+ 候補）

- Remote Play `/media` の short-TTL HMAC 署名 URL（session token 直貼りから一段強化）
- VLM モデルプリセットの README / 設定 UI 整理
- World Change をデモ動画で見せやすい UI ハイライト

関連: [`WORLD_SYSTEM_V1.3_DESIGN.md`](../WORLD_SYSTEM_V1.3_DESIGN.md), [`phase-4a-vlm-design.md`](phase-4a-vlm-design.md), [`DEMO.md`](../DEMO.md)