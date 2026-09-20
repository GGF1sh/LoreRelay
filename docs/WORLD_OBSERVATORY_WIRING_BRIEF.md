# World Observatory — 器＋観測者モード 配線ブリーフ

> 作成: 2026-07-03 / Claude (Opus 4.8) / 対象版 v1.52.0
> 目的: 「変わりゆく世界を見守る」観測ダッシュボードを **並行開発中の 85-world.js を触らず**、
> かつ **プレイヤーターンなしで世界を進める観測ティック**を安全に配線するための実装指示書。
> 見た目のモックは Fable5 作成（`docs/mockups/world_observatory_mockup.html` 予定）。本書は器と配線のみ。

---

## 0. 前提として検証済みの事実（v1.52.0 実測）

| 事実 | 出典 |
|------|------|
| Webview モジュールは各自 `window.addEventListener('message', …)` を登録できる（05/61/70/80/81/82/83/84/87 が既に実施） | `scripts/build-webview.js` の連結順・各モジュール |
| `renderWorldView(msg)` は `typeof updateNpcTtsFromWorldView === 'function'` の guard で他モジュール関数を呼ぶ | `webview/modules/85-world.js:157-160` |
| ホストの webview メッセージルータは `switch(message.type){ … deps.xxx() }` | `src/webviewHandlers.ts:198` (`case 'loadWorld'`) |
| `deps.sendWorldView()` → `extension.ts:1018` → `pushWorldViewToWebview()` が worldView 組立＋送信の単一口 | `src/extension.ts:1018` |
| 世界1ステップ = `runSimulationStep(forge,state)`（clone→`worldTurn++`→faction/region tick） | `src/emergentSimulator.ts:97-99` |
| ステップ後処理 = registry反映 → `applyLivingWorldAfterSimulationStep` → `generateQuestHooks` → `saveWorldState` | `src/emergentSimulator.ts:60-81`（`maybeTickSimulation`） |
| `tickLivingWorldAfterSim` は markets/npcPositions/relationships を進め **`world_state` だけを変更** | `src/livingWorldBridge.ts:178` |
| **価格履歴はどこにも保存されていない**（markets は現在の priceIndex のみ保持） | grep `priceHistory` → 0件 |

### 🟢 安全性の核心（これが本機能を「危険地帯」から降ろす）

観測ティックが書き込むのは **`world_state.json`（＋条件付きで `npc_registry.json`）だけ**。
`game_state.json` は **一切触らない** ＝ Persist-Before-Narrate パイプライン（`turn_result.json`→検証→
`game_state.json`→`state_journal.ndjson`）とは物理的に別系統。GM も narrative も走らない。
したがって観測ティックが暴走しても **プレイヤーのセーブは破壊されない**。この分離を崩す実装を書かないこと。

### 副作用契約（v1.56.0 — `worldObservatoryCore.OBSERVER_TICK_CONTRACT`）

**Watch は「読取専用」ではない。** プレイヤー/GM ターンなしで Living World を1ステップ進める。

| モード | 書き込み | 書かない |
|--------|----------|----------|
| **watch** | `world_state.json`, `npc_registry.json` | `game_state.json` |
| **advance** | 上記 + `game_state.commerce.food`（Commerce ON 時、`scheduleCommercePersist` 経由） | `game_state.entries` / ターンジャーナル |

**`computeOneWorldStep` が進める world_state フィールド（共有パイプライン）:**  
`worldTurn`, `markets`, `factions`, `regions`, `questHooks`, `npcPositions`, `npcRelationships`, `recentChanges`, `globalEvents`, `marketPriceHistory`（観測所のみ追記）

**永続化順序（`persistWorldStepOutcome`）:** `npc_registry`（変更時のみ）→ `world_state`

UI: World タブ観測所ヘッダ下に `webview.observatory.sideEffectsWatch/Advance` を表示。  
テスト: `test_observer_tick_side_effect_contract.js`

---

## 1. 器（Webview）— 85-world.js を触らない

### 新規ファイル
- `webview/modules/86-world-observatory.js`
- `webview/styles/86-world-observatory.css`

### build 登録（唯一の既存ファイル編集・非ホット）
`scripts/build-webview.js` の JS 連結順配列（8-28行）に `'86-world-observatory.js'` を
**`'85-world.js'` の直後**に追加。CSS 側の配列にも `86-world-observatory.css` を同様に追加。
※ `86-tile-overmap.js` が既に存在するため実ファイル名は衝突回避で `86b-` か `88-` を推奨。
最終的な採番は実装者判断（連結順が 85 の後・90-bootstrap の前であればよい）。

### モジュール構造（85-world.js への依存ゼロ）
```js
// 86-world-observatory.js
window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'worldView') { renderWorldObservatory(msg); }
});

function renderWorldObservatory(msg) {
    // 1. #world-content 内に自前コンテナ #world-observatory を無ければ生成
    // 2. msg.simEnabled が false / observatory 無効なら hidden にして return
    // 3. 相場ティッカー: msg.marketPriceHistory を描画（§3で新設）
    // 4. 年代記:       msg.chronicle を主データ源に描画（§4・氾濫対策C）
    // 5. 相関図:       msg.npcBonds（85-world も使う既存フィールド）を再利用して描画
    // 6. 観測モードトグル watch/advance（§6-A）＋「1ティック」「自動観測」ボタン
    //    → vscode.postMessage({ type:'observerWorldTick', mode })
    //    自動観測は setInterval(rateMs>=1000)・連続tick≤上限で自動停止（§6-C）
}
```
`worldView` は broadcast なので 85 と 86 の両方が受信する。85 は既存パネルを、86 は観測所を
それぞれ独立に描く。**相互の DOM を触らない**こと（`#world-observatory` 配下のみ操作）。

`npcBonds` は既に worldView に載っている（`85-world.js:253 renderNpcBonds(msg.npcBonds …)`）ので
相関図はそのまま再利用可。年代記と価格履歴は §3/§4 で worldView に追加する。

---

## 2. 観測ティックの配線（ホスト）

### 2-1. ルータに1 case 追加
`src/webviewHandlers.ts` の switch に：
```ts
case 'observerWorldTick': {
    const mode = message.mode === 'advance' ? 'advance' : 'watch'; // 既定 watch にサニタイズ
    deps.handleObserverWorldTick(mode);   // 同期でよい（sim は決定論・軽量）
    break;
}
```
`WebviewHandlerDeps` インターフェース（`webviewHandlers.ts:80` 付近、`sendWorldView(): void;` の並び）に
`handleObserverWorldTick(mode: 'watch' | 'advance'): void;` を追加。

### 2-2. ホスト実装（新規関数）
`src/extension.ts` に `handleObserverWorldTick()` を実装し deps に配線：
```ts
function handleObserverWorldTick(mode: 'watch' | 'advance'): void {
    runObserverWorldTick(mode);  // ↓ 新規 core、world_state のみ更新（advance時のみ資源も）
    pushWorldViewToWebview();    // 既存の単一送信口を再利用
}
```

### 2-3. 観測ティック本体（新規ファイル `src/worldObservatoryTick.ts`）
**既存の `maybeTickSimulation` を「gmTurnCount ゲート抜き」で再利用するだけ**。新ロジックを書かない：
```ts
export function runObserverWorldTick(mode: 'watch' | 'advance'): void {
    const rules = loadGameRules();
    if (!observerModeEnabled(rules)) { return; }          // §5 の新フラグ
    const forge = loadWorldForge();
    if (!forge) { return; }
    const state = ensureWorldStateExists(forge);

    let { state: next } = runSimulationStep(forge, state); // worldTurn++ / 決定論
    // registry 反映（maybeTickSimulation:60-73 と同一手順を関数抽出して共有するのが理想）
    let registry: NpcRegistry | undefined;
    if (rules.enableNpcRegistry) { registry = loadNpcRegistry(); /* stepEvents 反映 */ }
    next = applyLivingWorldAfterSimulationStep(forge, next, registry);
    if (mode === 'advance') { next = applyObserverTimeCost(next); } // §6-A: advance のみ資源消費
    next = appendMarketPriceHistory(next);                 // §3
    generateQuestHooks(next, registry, false);
    saveWorldState(next);
}
```
> リファクタ推奨: `maybeTickSimulation` の 51-80 行（forge読込〜saveWorldState）を
> `runOneWorldStep(gmTurnCount?)` として抽出し、`maybeTickSimulation` と `runObserverWorldTick`
> の双方から呼ぶ。コード重複を避け、将来のシミュ変更が両経路に自動反映される。
> **抽出は emergentSimulator.ts の編集を伴う（ホット度: 中）。衝突回避のため新関数追加＋
> 旧関数はそれを呼ぶ形にし、既存の呼び出し側シグネチャは変えないこと。**

### 2-4. 自動観測ループの所有者 = Webview（ホストはステートレス）
- `86-world-observatory.js` 側で `setInterval(() => vscode.postMessage({type:'observerWorldTick'}), rateMs)`。
- 「停止」で `clearInterval`。タブ離脱・パネル破棄でも必ず解除。
- ホストは1ティック=1メッセージの純粋な冪等ハンドラに徹する → ライフサイクル管理不要・キャンセル容易・
  往復レイテンシで自然にレート制限。**ホスト側 setInterval は採用しない**（dispose 漏れ・多重起動の温床）。

---

## 3. 唯一の新規永続データ: 価格履歴リングバッファ

`world_state` 拡張型に追加（既存 `ext.markets` と同じ場所・`LivingWorldWorldStateExt`）：
```ts
// locationId -> commodityId -> priceIndex の末尾N件（既定 N=24）
marketPriceHistory?: Record<string, Record<string, number[]>>;
```
`appendMarketPriceHistory(state)`（新規・純関数）: 現在の各 market の priceIndex を push、24件超で shift。
`sendWorldView`（`extension.ts:1018` 経由の組立）に `marketPriceHistory` を積む1行を追加。
- 加算的・後方互換（未定義なら空 = スパークラインは1点から育つ）。
- サイズ上限: markets≤5 × commodities≤5 × 24 = 最大600数値。無害。

---

## 4. 年代記データを worldView に載せる

`chronicleCore.ts`（既存・`buildChronicle` 系）は journal + world events から決定論タイムラインを生成済み。
現状はテキスト recap にのみ使用。worldView 組立時に `chronicle`（`ChronicleEvent[]` の末尾 ~30件）を
追加送信する。**新規計算は不要**、既存 core の出力を webview へ横流しするだけ。

---

## 5. ゲートフラグ（Campaign Kit と同じ既定OFF方式）

`game_rules` に `enableWorldObservatory?: boolean`（既定 OFF）を追加。
- `70-game-rules.js` にチェックボックス（i18n en/ja/zh-CN/zh-TW）。
- OFF 時: 観測所パネル hidden・`observerWorldTick` は no-op（`observerModeEnabled` false）。
- 意味を持つのは `enableEmergentSimulation` + `enableCommerce`/`enableNpcAgency` 等が有効な時。
  それらが OFF でも観測所は「動かない世界」を静的表示するだけで害はない。

---

## 6. 設計判断（2026-07-03 ユーザー確定済み）

| # | 論点 | 確定 | 実装への落とし込み |
|---|------|------|--------------------|
| A | 観測はプレイヤー資源/時間を消費するか | **トグルで両対応** | 観測所UIに「観測モード」トグル: `watch`（無コスト・世界のみ）/`advance`（作中N日経過・`applyTravelFoodConsumption` 等で資源消費）。既定は `watch`。§2-3 で分岐（下記） |
| B | worldTurn がGMターンより先行 | 仕様として許容 | 「留守中に世界が動いた」演出。Since-last-visit 差分が増えるのは狙い通り。氾濫は C で抑える |
| C | recentChanges の氾濫 | **chronicle 主データ源＋tick上限** | 観測所は `recentChanges` ではなく **append-only な chronicle**（§4）を主表示にする。加えて自動観測に**ハードtick上限＋最短間隔（例: 最短1.0s・連続≤上限）** |
| D | 自動観測の速度既定値 | 1.1s/tick（暫定） | 上限は C のハードcapで担保。UXで調整可 |

### 確定Aの分岐（§2-3 に組み込む）
```ts
export function runObserverWorldTick(mode: 'watch' | 'advance'): void {
    // …（forge/state/step は共通）…
    next = applyLivingWorldAfterSimulationStep(forge, next, registry);
    if (mode === 'advance') {
        // 作中 1 日経過として資源/時間を消費（Commerce 有効時のみ）
        next = applyObserverTimeCost(next /*, days=1 */);   // applyTravelFoodConsumption を再利用
    }
    // mode === 'watch' は資源に触れない（世界のみ）
    next = appendMarketPriceHistory(next);
    // …save…
}
```
- `mode` は webview の postMessage に含める: `{ type:'observerWorldTick', mode:'watch'|'advance' }`。
- `advance` の資源消費は **Commerce/該当機能が有効なときだけ**。無効なら `watch` と同挙動（無害）。
- `applyTravelFoodConsumption`（`livingWorldTurnOpsCore.ts`）は既存。observer 用に薄いラッパー
  `applyObserverTimeCost` を作り、旅行文脈の引数（輸送手段/積載）を「滞在＝最小消費」に固定して呼ぶ。

### 確定Cの実装
- 観測所の年代記セクションは **§4 の `chronicle` を主データ源**にする（recentChanges は 85 側の既存パネルに任せる）。
- 自動観測ループ（§2-4・webview所有）に **ハードtick上限**（例: 1セッション連続 ≤ N tick）と
  **最短間隔ガード**（`rateMs >= 1000`）を実装。上限到達で自動停止＋UI通知。

---

## 7. 実装順（衝突最小の推奨バトン順）

1. **§3 価格履歴**（world_state 拡張＋`appendMarketPriceHistory`＋テスト）— 純関数、衝突ゼロ
2. **§5 フラグ**（game_rules＋70-game-rules.js チェックボックス）
3. **§2 ティック配線**（`worldObservatoryTick.ts` 新規＋ router 1 case＋deps 1本＋extension glue）
   - emergentSimulator の共有関数抽出は「新関数追加・旧シグネチャ不変」で
4. **§4 chronicle を worldView に添付**（1行）
5. **§1 器**（`86*-world-observatory.js` / `.css`＋build登録）— Fable5 のモック HTML を移植
6. 統合テスト: 観測ティックで world_state のみ変化・game_state 不変を検証する `test_world_observatory_tick.js`

**共通の禁止事項**: `85-world.js` の既存 render 関数の中身を書き換えない（新モジュールで完結させる）。
`emergentSimulator.ts` / `statePatch.ts` のホット領域は「追加」のみ、既存呼び出しのシグネチャを変えない。
作業前に `package.json` 版数・`CHANGELOG` 先頭・対象ファイル mtime を再確認。
