# GENRE-AWARE-EVENTS-EXCLUSION-LIST-002

> **Status: DESIGN / SPEC — 実装未着手（C1〜C4）。**
> このファイルは -001 の後継。-001 の「ジャンル別イベント出し分け」を、
> **ハードなジャンル自動ゲートではなく「世界ごとの除外リスト＋人間/GMがそれに書き込む」**
> という方針に再設計したもの。設計判断は確定済み。実装は下位モデル/他AIで機械的に進めてよい。
>
> - Base: `b4166bc`（Slice A economyProfile 完了時点）
> - 先行完了: B1 = commodity脱ハードコード（`dde7cf5`）, A = economyProfile（`b4166bc`）
> - 設計者: Claude Opus 4.8 high（2026-07-14）

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond its risk tier without a concrete reason.

---

## 1. 背景：なぜ「ジャンル自動ゲート」を捨てたか

-001 §5 は「イベントテンプレートに `allowedThemes` を付けて theme と突合」する設計だった。
実コードとユーザー判断で **これは誤りと確定**：

- **機械的にジャンル不可能なイベントは1つも無い**。domain/guild の `festival_gathering` /
  `bad_harvest` 等は「士気↑集会」「食料生産の失敗」という**普遍メカニクス**で、
  農耕ファンタジー色は **GMヒントの固定語彙だけ**（"seasonal festival" / "Crop yields failed"）。
- ジャンル文字列からの自動除外は**誤除外**を生む：Darkest Dungeon 的な町シム込みホラーの祭り、
  サイバーパンクのネオン祭りは正当。「horror→祭り禁止」は間違い。
- -001 の唯一の**決定論的**ジャンル結合（commodity `wheat`/`steel`）は **B1 で解消済み**。

### 採用する方針（ユーザー確定）

> 世界観構築時に **GM（LLM）が「このイベントは居る/要らない」を緩く考えて選ぶ**。
> 要らないものは **OFF** にできる。判定基準は**できる限り緩く**——**このゲームには Undo がある**ので、
> 不適合が出たら巻き戻して「これは無し」にすればいい。加えて**イベント発生時に「今後この世界から除外」
> チェックボックス**も置く。

→ **システムは自動でジャンル判定しない。**「除外は人間/GMが決めて溜める deny-list」。既定は全部ON。
ジャンルの知恵は全部この deny-list に**書き込むだけ**の上位層に寄せる。

---

## 2. アーキテクチャ：決定論の背骨は1つだけ

> **世界ごとの任意 `excludedEventIds`（除外イベントIDの集合）を永続状態に持ち、
> 各イベント roller が除外IDをスキップする。既定は空＝現状挙動。ジャンルロジックはゼロ。**

全機能（C2 チェックボックス / C3 トグル / C4 GM提案）はこの集合に**書き込むだけ**。回帰は空既定で
ゼロ（既存サンプルシナリオは domain/guild モードを1つも使っていない＝二重に安全）。

### イベントID名前空間（衝突回避）

roller ごとにID空間が別なので、**namespace prefix 付き文字列**で統一する：

```
"domain:festival_gathering"   "domain:bad_harvest"   ...
"guild:festival_recruits"     "guild:tavern_rumor"   ...
"audience:festival_request"   ...
```

`excludedEventIds: string[]`（永続は配列、実行時は `Set<string>` 化）。将来 world-sim イベントを
足すときも `"worldsim:..."` で同じ仕組みに乗る。

**prefix の付け間違い防止のため、namespace 処理は小さな helper 1組に集約する**（手書き
`` `domain:${id}` `` を散らさない）。C1 で作るのはこの2関数だけ。大きなイベントレジストリは作らない：

```ts
type EventKind = 'domain' | 'guild' | 'audience';
function toExcludedEventId(kind: EventKind, eventId: string): string { return `${kind}:${eventId}`; }
function isExcludedEvent(set: ReadonlySet<string>, kind: EventKind, eventId: string): boolean {
    return set.has(toExcludedEventId(kind, eventId));
}
```

### 除外の対象は「ランダム発生イベント」だけ

除外リストが効くのは **roller が引くランダムイベント**（`festival_gathering` 等）のみ。
**プレイヤーが自分で選ぶ行動は禁止しない**（例：domain の `festival` アクション
`domainCore.ts:215` はそのまま使える）。「ランダムに祭りイベントが降ってくる」のは止められるが、
「祭りを開く政策を選ぶ」のは自由、という区別を守る。

---

## 3. Slice C1（背骨）— 下位モデルで十分・決定論・回帰ゼロ

### 3.1 永続先 ★最重要：Undo境界の外に置く（確定済み）

**除外リストは turn Undo で巻き戻ってはいけない。** さもないと壊れる：
「不適切イベント発生 → 『今後除外』を押す → Undoで発生前へ戻る → 除外設定も一緒に巻き戻る →
また同じイベントが出る」という間抜けな挙動になる。除外は**キャンペーン設定**であって
ランタイム・スナップショットではない。

**確定した住処：`GameRules`（`game_rules.json` / `src/gameRulesCore.ts`）に `excludedEventIds?: string[]` を追加。**
`GameState` には**入れない**。根拠（実コードで確認済み、下流は再調査不要）：

- Undo は `handleUndoLastTurn`（`src/checkpointHandlers.ts:264`）＝**エントリ履歴を truncate して
  game_state を書き戻すだけ**。`runTimelineRestore`（`:79`→`:84`）も history＋game_state のみを触り、
  **`game_rules.json` には一切触れない**。→ game_rules は Undo 安全。
- `game_rules` は economyProfile / travelEncounterDensity / enable 群と**同じキャンペーン設定ストア**。
  除外リストの性質（world-authoring 意図＋プレイヤートグル＋in-play除外）と完全に一致。
- `loadGameRules()` は既に sim/roller のホスト層（emergentSimulator, domain/guild drift 等）へ
  流れている → roller への配線が最短。
- 設定UI（`webview/modules/70-game-rules.js`）が既に game_rules を編集 → C3 トグルの自然な置き場。

実装：`gameRulesCore.ts` の `GameRules` interface に `excludedEventIds?: string[]` を追加し、
`normalizeGameRules` で **string配列・各要素は namespaced id 形式・件数上限**（例 200）に正規化
（既存の optional field 追加と同型。`DEFAULT_GAME_RULES` には空/未指定でよい）。

### 3.2 roller スキップ配線（3箇所、構造同一）

各 roller のループ先頭に「除外IDならスキップ」を1行足す。除外集合は**引数で明示的に渡す**
（純関数を保つ。config 経由でも可だが引数が最小侵襲）。

| roller | ファイル:行 | 現シグネチャ | 追加 |
|---|---|---|---|
| domain | `src/domainCore.ts:794` `rollDomainEvent` | `(domain, seed, intelligence?, actions?)` | `excludedIds?: ReadonlySet<string>` を末尾に。ループ`for (const def of DOMAIN_EVENTS)`直後で `if (isExcludedEvent(excludedIds, 'domain', def.id)) continue;` |
| guild | `src/guildCore.ts:717` `rollGuildEvent` | `(guild, seed, actions?)` | 同型、`isExcludedEvent(excludedIds, 'guild', def.id)` |
| audience | `src/domainAudienceCore.ts:231` 付近の選択 | size ベース選択 | 候補列挙時に `isExcludedEvent(_, 'audience', id)` でフィルタ |

- roller 呼び出し元（`applyMonthlyCommit` `domainCore.ts:849` / `simulateStewardMonth`
  `domainDriftCore.ts:139` / guild 側 `guildCore.ts:788` `guildDriftCore.ts:172`）で、
  host が読んだ `excludedEventIds` を Set 化して渡す。config（`DomainConfig`/`GuildConfig`）に
  `excludedEventIds?` を足して運ぶのが既存の設定流路に沿う。

### Quiet イベントは「除外不可」ではなく「触らせない」

domain/guild は候補が空なら `domain_quiet_month` / `guild_quiet_week` へフォールバックする構造。
これらは安全弁なので、**エラーで弾くのではなく、そもそも除外の対象から外す**：
- UI のイベント一覧に**出さない**（C3）
- GM の除外提案の対象に**しない**（C4）
- 保存データに万一入っていても roller は**無視**（＝quiet は常に発火可能）

→ 「全部除外」しても quiet に落ちるので domain/guild が無音で壊れることはない。

### Audience は空でよい（偽 quiet を作らない）

audience には quiet petition が無い。全 petition を除外したら**空の queue を返す**のが自然
（現状も候補配列から重み選択し、候補が尽きれば終了する構造なので空を表現できる）。
`audience_quiet_day` のような偽イベントは**足さない**。

### 3.3 C1 の検証（Medium risk：単一サブシステム・可逆・スキーマ移行なし）

- focused test 新規 `scripts/test_event_exclusion_list.js`（＋`run_all_tests.js` manifest登録）：
  - 除外空 → 全イベント発火可能（＝現状の重み分布不変）
  - `"domain:festival_gathering"` 除外 → その週/月 festival_gathering が選ばれない（決定論seedで確認）
  - 全除外 → quiet 系にフォールバック（quiet 自体は除外不可）
  - guild 同型 1ケース
- 既存回帰：`test_domain_*` / `test_guild_*`（`--list` で確認）。
- soak不要（決定論の重み計算とスキップのみ、focused で網羅）。

---

## 4. Slice C2 — in-play「今後この世界から除外」チェックボックス（UI＋配線・下位モデル）

- イベント提示UIに「このイベントを今後この世界から除外」チェック → `excludedEventIds` に
  namespaced id を追加して保存。
- 接点：イベントが player に見える箇所（domain/guild の月次/週次結果表示、GMヒント surface）。
  `git grep` で `lastEventId` / `pendingEvents` の webview 送出経路を辿る。
- webview→host のメッセージ（既存 payload whitelist `test_webview_payload_whitelist.js` に準拠）で
  `{ type: 'excludeEvent', id }` を足す。i18n キー追加（`locales/*.json`、`check_i18n_keys.js` を通す）。

## 5. Slice C3 — ゲーム前のイベント種別ON/OFFトグル（UI＋配線・下位モデル）

- game_rules 設定UI（`webview/modules/70-game-rules.js` 付近、economyProfile/travelEncounterDensity と
  同じ並び）に「イベント除外リスト」を出す。有効な domain/guild イベントIDを列挙し（**quiet系は除く**）、
  チェックで `excludedEventIds` を編集。※`excludedEventIds` は game_rules なので保存は既存の
  game_rules 保存経路に乗る（Undoで消えない）。
- 表示ラベルは i18n。イベントID→表示名の対応表が要る（`DOMAIN_EVENT_GM_HINTS` のキー等から生成可）。

## 6. Slice C4 — 世界観構築時の GM 緩い初期除外提案（LLM統合・軽い判断）

- **方針は「できる限り緩く」**。GM は「この世界に**明らかに**居ないイベントだけ」を提案除外する。
  少しでも成立し得るものは**残す**（祭りのように語彙を変えれば成立するものは基本 ON のまま）。
  保険は Undo＋C2 チェック。
- **GM は強制決定しない。「推奨除外候補」を出すだけで、ユーザーがそのまま採用/解除できる**
  （提案＝初期チェック状態、最終確定は人間）。自動で `excludedEventIds` を書き切らない。
- 世界生成/Genesis フローの中で、有効イベント一覧（quiet 除く）＋各GMヒントを GM に渡し、
  「除外推奨IDのみ」を構造化出力させ、C3 と同じトグルUIに**チェック済み候補**として提示。
- プロンプト設計の判断はここだけ。緩い＋Undo前提なので低リスク。テストは決定論不可なので
  「出力が有効ID集合の部分集合か」「quiet を含まないか」の形式検証に留める。

---

## 7. モデル配分（重要）

- **Opus 4.8 high が要ったのは §1〜§2 のアーキテクチャ判断まで（完了）。**
- **C1〜C3 は機械実装**：型フィールド追加・roller3箇所スキップ・UI配線・i18n・focused test。
  下位モデル/他AIで十分。
- **C4 のプロンプト設計のみ軽い判断**。緩い方針が確定しているので下位モデルでも詰められる。

## 8. 非ゴール / 安全メモ

- **システムによる自動ジャンル判定は実装しない**（§1の結論）。deny-list は人間/GM が埋める。
- **除外リストは Undo 境界の外（`game_rules`）に置く**（§3.1）。`GameState` には入れない。
- 既定 `excludedEventIds = 空`。既存挙動を1ミリも変えない。
- 除外の対象は**ランダム発生イベントのみ**。プレイヤーが選ぶ行動（domain の `festival` 等）は禁止しない。
- `domain_quiet_month` / `guild_quiet_week` は UI/GM に出さず roller は無視（安全弁）。audience は空 queue 可。
- 世界シム（emergentSimulator）イベントは中立なので**対象外**。将来必要になったら同じ
  `"worldsim:"` prefix で C1 の仕組みに乗せるだけ。
- 新規依存を足さない（`AGENTS.md`）。純関数Core＋既存の config/state 拡張で収まる。
- 大きく一括変更せず C1→C2→C3→C4 の順で小さく切る。
