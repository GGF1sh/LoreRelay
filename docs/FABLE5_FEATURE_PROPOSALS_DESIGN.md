# Fable 5 Feature Proposals — 設計ブリーフ集（F1–F6）

> **著者:** Claude Fable 5（2026-07-02）
> **前提:** LoreRelay 本体（GM UI・State Patch・World Sim・Cartography C9・Debug Sandbox・Layer B 時間経過）は v1.18.0 で一段落。次期主軸の **Living World（LW1 Commerce / LW2 Agency, `docs/COMMERCE_AND_AGENCY_BRIEF.md`）とは別軸で、既存資産の上に安く乗る**追加機能を 6 本提案する。
> **設計哲学（本プロジェクト踏襲）:** ①LLM は narration 専任、数値・履歴は拡張が決定論。②新規ロジックは `*Core.ts`（vscode/fs 非依存の純関数）＋ JSON 契約。③GM への注入は「数トークンの 1 行」を基本とし `gmPromptBuilderCore.ts` の pure line-builder として足す。④新機能は `game_rules.json` で **既定 OFF**、物語専用シナリオは現状維持。
> **推奨フロー:** 本ブリーフ → 個別設計 doc（必要時）→ セキュリティ / allowlist レビュー → 実装。各節は独立トラックとして切り出し可能。

---

## 0. 依存と推奨順序

```
F1 Chronicle ──┐(journal→年表)
               ├─→ F2 Pacing Director（journal 分類を共有）
F1/journal ────┘
F3 Reputation ────────→ (LW1 Commerce の入場可否/相場に接続)
F4 Travel Encounter ──→ (Layer B / Region.hazard を活用、LW1 移動の布石)
F5 Replay Export ─────→ (journal + chat + gallery、README GIF 不足も解消)
F6 Map Import ────────→ (vlmQueue の逆流用、world_forge 下書き)
```

| 順 | 機能 | コスト | 効き | 推奨タイミング |
|----|------|--------|------|----------------|
| 1 | **F1 Chronicle** | 中 | 大 | LW で出来事が増える**前**に入れる（相乗） |
| 2 | **F2 Pacing Director** | 小 | 中〜大 | F1 の分類器を共有、直後 |
| 3 | **F3 Faction Reputation** | 小 | 中 | LW1 設計 doc に 1 節として混ぜるのが自然 |
| 4 | **F4 Travel Encounter** | 中 | 中 | LW1 移動実装と同時が理想 |
| 5 | **F5 Replay Export** | 小 | 中 | 箸休め枠。README 素材にも |
| 6 | **F6 Map Import** | 中〜大 | 大(wow) | VLM 精度依存。下書き+人間確認前提 |

---

## F1 — Chronicle / 「前回までのあらすじ」

**一行:** 決定論的イベント記録から年表を生成し、セッション再開時に GM プロンプトへ「Previously on…」を数行注入する。LLM 要約に頼らず幻覚ゼロ。

### 目的・なぜ今
長期キャンペーンの最大の敵は GM のコンテキスト切れ。LoreRelay には既に **完全な決定論的イベント記録**がある：`state_journal.ndjson`（1 行 = enriched `TurnResult`：`beforeHash`/`afterHash`/`appliedAt` + turn_result 本体、`src/statePatch.ts:503`）、`world_state.recentChanges`（`WorldChangeEvent[]`, FIFO 20, `src/worldEventLogCore.ts`）、`questHooks`（`src/worldStateCore.ts:16`）。これを年表化すれば、要約 LLM 呼び出しなしで「これまでのあらすじ」が作れる。LW1/LW2 で世界が動き出すと出来事量が増えるので、**先に**入れると効果が倍。

### 既存 seam
- 記録源: `state_journal.ndjson`（enriched TurnResult 逐次追記, `statePatch.ts`）、`world_state.recentChanges`、`world_state.questHooks`。
- 注入パターン: `buildWorldChangeSummaryFromChanges()` の inject-once 方式（`gmPromptBuilderCore.ts:197`、`lastInjectedWorldChangeSummaryTurn` で二重注入防止）をそのまま踏襲。
- プロンプト予算: `PromptBudgetPolicy`（`gmPromptBuilderCore.ts`）に `chronicleChars` を追加。

### 新規 Core + 契約
`src/chronicleCore.ts`（純関数, vscode/fs なし）
```ts
export interface ChronicleEvent {          // journal 行 / WorldChangeEvent を正規化した中間表現
  worldTurn: number;
  gmTurn?: number;
  kind: 'quest' | 'world' | 'travel' | 'combat' | 'milestone';
  text: string;                            // ≤ 120 字、決定論生成（テンプレ埋め込み）
  regionId?: string; factionId?: string; npcId?: string;
}
export interface ChronicleChapter { index: number; title: string; events: ChronicleEvent[]; }

// journal 行(any[]) + recentChanges + questHooks → 章分割された年表
export function buildChronicle(input: ChronicleInput): ChronicleChapter[];
// 章の区切りは決定論: elapsedWorldTurns の大ジャンプ / act・chapter 変化 / N ターン蓄積
export function buildChronicleRecap(chapters: ChronicleChapter[], maxLines: number, maxChars: number): string;
```
- **年表テキストは journal のフィールドから機械生成**（例: `resolvedQuests` → 「クエスト『X』達成」、`cartographyReveal` → 「地図で Y を知った」、`elapsedWorldTurns` → 「N 日が経過」、`WorldChangeEvent.message` をそのまま）。自由文の LLM 要約はしない。
- 保存: 年表は **導出物なので保存しない**（journal から都度再構成、メモ化）。Tile Overmap と同じ「保存なし・再導出」方針。

### プロンプト注入
`gmPromptBuilderCore.ts` に純関数 `buildChronicleRecapLine()` を追加し、`gmPromptBuilder.ts` のプロンプト組み立てで **セッション再開後の最初の GM ターンのみ** `[Previously]` ブロックとして先頭付近に注入。inject-once は `world_state` に `lastInjectedChronicleTurn` を足して管理（`recentChanges` の既存パターンと同型）。

### Game Rules（gated, 既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `textAdventure.chronicle.recapInPrompt` | `false` | 再開時に `[Previously]` を注入 |
| `chronicle.maxRecapLines` | `5` | 注入行数上限 |

### UI
World タブ or Inspector に「年表 / Chronicle」ビュー（章ごとに折りたたみ）。読み物としても価値。

### v0 スコープ
- [x] `chronicleCore.ts` + 型 + `buildChronicle` / `buildChronicleRecap`
- [x] journal reader（`state_journal.ndjson` を安全に行パース、上限・壊れ行スキップ）
- [x] `buildChronicleRecapLine()` を `gmPromptBuilderCore.ts` に追加、`gmPromptBuilder.ts` から呼ぶ
- [x] `lastInjectedChronicleTurn` を `worldStateCore.ts` に追加 + ack 経路
- [x] Inspector / World タブに年表ビュー（read-only）
- [x] `scripts/test_chronicle_core.js`（章分割・recap 上限・空 journal・壊れ行）
- [x] i18n 4 ロケール

### Non-Goals
- LLM による自由文要約（幻覚源。決定論テンプレのみ）。
- journal の恒久フォーマット変更（既存 enriched TurnResult をそのまま読む）。

### 担当推奨
設計→Claude、実装→Grok。Core が純関数なのでテスト先行しやすい。

---

## F2 — Pacing Director / 演出ペース 1 行注入

**一行:** 直近 N ターンを決定論的に分類（戦闘/会話/探索/移動）し、偏りがあれば GM に 1 行だけヒントを足す。「ずっと戦闘」「ずっと日常」の単調化対策。

### 目的・なぜ今
AI GM はプレイヤーの入力に引きずられて場面が単調化しがち。turn_result の内容（ダイス頻度、HP 変動、location 変化、`diceRequest` 等）から **場面の種類を機械分類**できるので、偏りを検知して「次は静かな場面や会話の機会を検討せよ」を 1 行足すだけで体感が変わる。F1 の journal 分類器（`ChronicleEvent.kind`）を共有できる。hazard 1 行注入（ロードマップ未着手）と同じ「数トークン哲学」。

### 既存 seam
- 分類元: `state_journal.ndjson`（直近 N 行）、または実行時に保持している recent entries。
- 注入: `gmPromptBuilderCore.ts` の 1 行ビルダー（`ELAPSED_WORLD_TURNS_PROMPT_LINE` 等と同じ定数/関数群）。

### 新規 Core
`src/pacingCore.ts`（純関数）
```ts
export type Beat = 'combat' | 'social' | 'exploration' | 'travel' | 'downtime';
export interface PacingWindow { counts: Record<Beat, number>; dominant: Beat; ratio: number; }
export function classifyTurnBeat(turn: JournalTurnLike): Beat;   // ダイス/HP/location/diceRequest から決定論
export function analyzeRecentPacing(turns: JournalTurnLike[], windowSize: number): PacingWindow;
export function buildPacingHintLine(w: PacingWindow, threshold: number): string; // 偏り閾値未満は空文字
```
- 判定は完全に決定論（LLM 不使用）。閾値（例: 直近 5 ターン中 4 ターン同一 beat）を超えたときだけ 1 行返す。

### プロンプト注入
`buildPacingHintLine()` を `gmPromptBuilder.ts` の `[Director]` 相当セクション末尾へ。空文字なら注入なし（大半のターンは何も足さない）。

### Game Rules（gated, 既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `textAdventure.pacing.hintInPrompt` | `false` | ペースヒント 1 行注入 |
| `pacing.windowSize` | `5` | 分類ウィンドウ |
| `pacing.dominanceThreshold` | `0.8` | この比率超で偏りと判定 |

### v0 スコープ
- [x] `pacingCore.ts` + `classifyTurnBeat` / `analyzeRecentPacing` / `buildPacingHintLine`
- [x] `gmPromptBuilder.ts` から gated 注入
- [x] `scripts/test_pacing_core.js`（各 beat 判定・偏り検知・閾値未満は空）
- [x] i18n（ヒント文の 4 ロケール）

### Non-Goals
- 「面白さ」の主観判定。あくまで beat の統計的偏りだけを見る。
- プレイヤー行動の強制（Railroad 化しない。ヒントは示唆のみ）。

### 担当推奨
軽量。Claude 設計＋実装まで一気でも可。F1 と同時進行推奨（分類器共有）。

---

## F3 — Faction Reputation / 派閥評判

**一行:** プレイヤーの**派閥単位の評判**（NPC 個別 trust とは別軸）を `world_state` に持ち、クエスト完了・NPC trust 変動から派生更新。LW1 の相場・入場可否に直結する布石。

### 目的・なぜ今
現状 `npc_registry` に NPC 個別の trust はあるが、**派閥に対するプレイヤーの評判**は無い。`FactionWorldState`（`worldStateCore.ts:32`）に `playerReputation` を足せば、GM 1 行注入＋World タブ表示だけで成立し、LW1 Commerce が来たら「敵対派閥の市場は割高/入れない」にそのまま接続できる。ブリーフの「世界ファースト」因果（`docs/COMMERCE_AND_AGENCY_BRIEF.md` §0）に素直に乗る。

### 既存 seam
- `FactionWorldState`（power/morale/resources）に `playerReputation?: number`（-100..100, 既定 0）を追加。
- 更新源: `statePatch.ts` の `resolvedQuests` 経路（既に `applyNpcMemoryUpdates()` で NPC trust を動かしている, `AI_ROADMAP.md` Phase 8）、NPC trust の閾値変化。
- 注入: `gmPromptBuilderCore.ts`（既存 world faction 出力の隣に 1 行）。

### 新規 Core
`src/factionReputationCore.ts`（純関数）
```ts
export interface ReputationDelta { factionId: string; delta: number; reason?: string; }
export function clampReputation(v: unknown): number;                 // -100..100
export function applyReputationDeltas(cur: Record<string, number>, deltas: ReputationDelta[]): Record<string, number>;
export function reputationTier(v: number): 'hostile'|'unfriendly'|'neutral'|'friendly'|'allied';
export function buildReputationPromptLine(factions: {id:string;name:string;rep:number}[], max:number): string;
```

### turn_result チャネル（任意）
```json
{ "reputationOps": [ { "factionId": "guild_x", "delta": 10, "reason": "quest" } ] }
```
- 拡張が検証・clamp・適用。GM は narration のみ。`resolvedQuests` からの自動派生を主、`reputationOps` を補とする。

### Game Rules（gated, 既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableFactionReputation` (`game_rules.json`) | `false` | 評判の追跡・注入 |
| `textAdventure.reputation.inPrompt` | `false` | GM プロンプトに評判 1 行 |

### v0 スコープ
- [x] `FactionWorldState.playerReputation` を型・パーサ・clamp に追加（`worldStateCore.ts`）
- [x] `factionReputationCore.ts` + tier / delta 適用 / 1 行ビルダー
- [x] `resolvedQuests` 完了時に関連派閥へ自動 delta（`statePatch.ts`）
- [x] World タブに派閥評判バー（既存 faction 表示に追記）
- [x] `scripts/test_faction_reputation_core.js`（clamp・tier 境界・delta 合成）
- [x] i18n

### Non-Goals
- 派閥間外交シミュ（power/morale の既存シムに任せる）。
- 評判に応じた自動イベント発火（v0 は表示＋GM ヒントまで。発火は LW で）。

### 担当推奨
LW1 設計 doc に §「Reputation」として合流させるのが最も自然（Claude が LW1 設計時に統合）。単独先行も可。

---

## F4 — Travel Encounter / 旅路エンカウント

**一行:** Layer B の「N 日かけて旅する」を時間スキップから**イベント**に変える。worldSeed + 経路リージョン + `Region.hazard` から決定論的にエンカウントを引き、turn_result 経由で GM に 1 行渡す。

### 目的・なぜ今
v1.18 の `narrativeTimePassageCore.ts`（rest/travel パース, `elapsedWorldTurns`）は現状ただの早送り。`Region.hazard`（8 種, `worldForgeCore.ts:5`）と `Region.connectedTo`（グラフ）が素材として既にあるので、決定論エンカウント表を引けば「3 日目: 放射能嵐に遭遇」を作れる。LW1 の大航海/キャラバン路線の移動を面白くする布石。Tile Overmap と同じ「worldSeed から決定論導出・保存なし」で幻覚ゼロ。

### 既存 seam
- 旅パース: `parseNarrativeTimePassage()` / `clampElapsedWorldTurns()`（`narrativeTimePassageCore.ts`）。
- 経路: `Region.connectedTo` / `hazard`（`worldForgeCore.ts`）、現在地→目的地の region パス（`cartographyPathCore.ts` にパス検証あり）。
- 適用: `elapsedWorldTurns` → `worldSimPersist.ts`（既存の世界シム進行）。

### 新規 Core
`src/travelEncounterCore.ts`（純関数, 決定論 PRNG）
```ts
export interface EncounterSeed { worldSeed: string; fromRegionId: string; toRegionId: string; dayIndex: number; }
export interface TravelEncounter { day: number; regionId: string; hazard?: RegionHazard; text: string; severity: 'flavor'|'notable'; }
// worldSeed+region+day のハッシュで決定論抽選（同じ旅は同じ結果 = リロード耐性）
export function rollTravelEncounters(seed: EncounterSeed[], hazardTable: HazardEncounterTable): TravelEncounter[];
export function buildTravelEncounterPromptLines(encs: TravelEncounter[], max: number): string;
```
- hazard 種別ごとの文言テーブルはデータ（`transportKinds` 同様テーマで差し替え可能）。
- **抽選は worldSeed + regionId + dayIndex の決定論ハッシュ**。リロードしても同じ旅は同じ結果（journal と矛盾しない）。

### turn_result / 注入
- 旅コマンド処理時に拡張がエンカウントを算出し、その旅の narration ターンの GM プロンプトに `[Travel]` 数行を注入（`gmPromptBuilderCore.ts` の純関数）。GM は数値ではなく描写を書く。
- `elapsedWorldTurns` と同居（旅の日数分だけ世界も進む）。

### Game Rules（gated, 既定 OFF）
| フラグ | 既定 | 役割 |
|--------|------|------|
| `enableTravelEncounters` (`game_rules.json`) | `false` | 旅エンカウント算出・注入 |
| `travel.encounterDensity` | `medium` | flavor/notable の頻度 |

### v0 スコープ
- [x] `travelEncounterCore.ts` + 決定論抽選 + hazard 文言テーブル
- [x] 現在地→目的地の region パス導出（`cartographyPathCore.ts` 活用 or 隣接 BFS）
- [x] 旅コマンド処理から算出→ `buildTravelEncounterPromptLines()` 注入
- [x] `scripts/test_travel_encounter_core.js`（同 seed 再現性・hazard マッピング・密度）
- [x] i18n（hazard × 文言、4 ロケール）

### Non-Goals
- 戦術戦闘（エンカウントは描写フック。戦闘は既存ダイス/GM に委譲）。
- 経路上の戦闘解決の自動化。

### 担当推奨
設計→Claude、実装→Grok。LW1 の transport/移動実装と同時が理想。

---

## F5 — Replay Export / リプレイ小説エクスポート

**一行:** チャットログ + journal + gallery 画像（locationId 紐付け済み）から整形 HTML/Markdown を書き出す。プレイ成果が「共有できる読み物」になり、README の実スクショ/GIF 不足も解消。

### 目的・なぜ今
`GameEntry`（`types/GameState.ts:49`：role/sender/content/image/speakerNpcId）と `GalleryEntry`（locationId/worldTurn/prompt 保持, Phase 5）と journal が揃っている。ローカル完結・LLM 不要で「読み物」を書き出せる。`AI_ROADMAP.md` の Parallel polish「README 実スクショ/GIF」の実効解にもなる。

### 既存 seam
- チャット: `game_state.json` entries（`GameEntry[]`）。
- 画像: gallery `GalleryEntry[]`（locationId/worldTurn 紐付け）。
- 見出し: F1 `chronicleCore.ts` の章分割を流用（章 = 見出し、entries = 本文）。

### 新規 Core
`src/replayExportCore.ts`（純関数, fs なし＝文字列生成のみ）
```ts
export interface ReplayOptions { includeImages: boolean; includeGm: boolean; includeDice: boolean; format: 'markdown'|'html'; }
export function buildReplayMarkdown(entries: GameEntryLike[], chapters: ChronicleChapter[], gallery: GalleryLike[], opt: ReplayOptions): string;
export function buildReplayHtml(...): string;   // 自己完結 HTML（インライン CSS、画像は相対 or data URI）
```
- `excludedFromPrompt` や `imageBlocked` を尊重。ネタバレ用 `hiddenState` は既定で除外。
- 出力先はワークスペース内（`git` 対象外の `exports/` 推奨、パスは既存 `workspacePaths.ts` 経由で検証）。

### UI
Inspector に「リプレイを書き出す」ボタン → format/画像 ON-OFF の簡易ダイアログ → ファイル生成 + 「開く」。

### v0 スコープ
- [x] `replayExportCore.ts`（Markdown + 自己完結 HTML）
- [x] entries → 見出し（F1 章）+ 発言者 + 画像埋め込みの整形
- [x] 書き出しコマンド + Inspector ボタン + パス検証（`exports/` under workspace）
- [x] `scripts/test_replay_export_core.js`（除外フラグ尊重・画像 ON/OFF・空ログ）
- [x] i18n

### Non-Goals
- クラウド共有/アップロード（ローカルファイルのみ。外部送信しない）。
- LLM による清書（生ログ整形のみ。清書は将来の別トラック）。

### 担当推奨
軽量・独立。任意の AI。F1 完了後だと章見出しが使えて綺麗。

---

## F6 — Map Import / 手描き地図インポート（逆 Cartography）

**一行:** ユーザーが描いた/拾った地図画像を既存 `vlmQueue` で解析し、リージョン候補 → `world_forge.json` の**下書き**を生成。「世界→地図」の逆向き。精度は VLM 依存のため**下書き + 人間確認**前提。

### 目的・なぜ今
VLM 基盤（`vlmQueue.ts` / `vlmQueueCore.ts` / `visualMemoryCore.ts`）、Voronoi レイアウト（`cartographyLayoutCore.ts`）、biome/region 語彙（`worldForgeCore.ts`）が全部既存。新規なのは **解析プロンプトとレビュー UI だけ**。wow 系を 1 本入れるならこれ。ただし VLM は誤読するので「AI が下書き→人間が確定」を設計の前提に据える。

### 既存 seam
- 画像解析: `vlmQueue.ts`（Ollama/OpenRouter VLM、非ブロッキング）、`sanitizeVlmDescription()`（`vlmQueueCore.ts:7`）。
- 出力先: `worldForgeGeneratorCore.ts`（既存の seed/theme 生成器と同じ `WorldForge` 型を吐く）。
- 表示: 既存 World タブの Diagram/Parchment/Tile レンダラーでプレビュー。

### 新規 Core
`src/mapImportCore.ts`（純関数：VLM 生応答 → WorldForge 下書き）
```ts
export interface MapImportDraft { regions: Region[]; locations: WorldLocation[]; warnings: string[]; }
// VLM 構造化応答(JSON or 箇条書き)を厳格パース。座標は 0..1 正規化→レイアウトに委譲
export function parseMapVlmResponse(raw: string): MapImportDraft;
export function draftToWorldForge(draft: MapImportDraft, seed: string, theme: string): WorldForge;
export const MAP_IMPORT_VLM_PROMPT: string;   // 「地図から地名/地域/隣接/バイオームを JSON で」
```
- VLM 出力は**信用しない前提**でパース（ID 検証・件数上限・不明値は warning）。既存 `worldForgeCore` パーサの検証を通す。

### フロー
1. ユーザーが地図画像を選択 → `vlmQueue` に解析ジョブ投入（`MAP_IMPORT_VLM_PROMPT`）。
2. `parseMapVlmResponse()` で下書き生成 → **レビュー UI**（リージョン一覧・隣接・biome を編集可能）。
3. 確定で `world_forge.json` に書き出し（既存ジェネレータと同じ経路）。既存世界がある場合は上書き確認。

### Game Rules / 設定
- VLM 未設定時はボタン無効（既存 VLM 設定に依存）。外部 API opt-in は既存の SecretStorage 経路を再利用。

### v0 スコープ
- [ ] `mapImportCore.ts` + `parseMapVlmResponse` / `draftToWorldForge` + プロンプト定数
- [ ] `vlmQueue` に map-import ジョブ種別を追加（既存キューを流用）
- [ ] レビュー UI（生成前に人間が確認・編集、幻覚を弾く）
- [ ] `world_forge.json` 書き出し（既存確認ダイアログ・パス検証）
- [ ] `scripts/test_map_import_core.js`（壊れ VLM 応答・件数上限・ID 検証・warning）
- [ ] i18n

### Non-Goals
- ピクセル精密なジオメトリ復元（下書き。座標は正規化してレイアウトに委譲）。
- 画像の外部送信（VLM プロバイダは既存設定に従う。既定ローカル）。

### セキュリティ
- VLM 応答は完全に untrusted。ID/件数/長さ上限・prototype 汚染ガード（既存 `BLOCKED_KEYS` 方針）。
- 画像パスは `workspacePaths.ts` 経由で検証、任意パス読み出し禁止。

### 担当推奨
設計→Claude（VLM プロンプト設計 + パーサ堅牢化）、実装→Grok。精度検証は実画像で反復。

---

## 付録: 全機能に共通するチェック（実装前に確認）

- [ ] `npm run compile` / `npm test` PASS（各 Core に `scripts/test_*.js` を追加し `npm test` へ組み込み）。
- [ ] `check_i18n_keys.js` PASS（`t('extension.*')`/`t('webview.*')` の 4 ロケール漏れ検出）。
- [ ] 新 turn_result チャネルは `statePatch.ts` の検証を通す（allowlist・上限・prototype ガード）。
- [ ] GM 注入は `gmPromptBuilderCore.ts` の純関数として足し、予算 `PromptBudgetPolicy` に費目を追加。
- [ ] `game_rules.json` の新フラグは既定 OFF、Webview ⚙️ Game Rules にチェックボックス。
- [ ] `CHANGELOG.md` / `AI_ROADMAP.md` / `AI_SHARED_LOG.md` を更新。
