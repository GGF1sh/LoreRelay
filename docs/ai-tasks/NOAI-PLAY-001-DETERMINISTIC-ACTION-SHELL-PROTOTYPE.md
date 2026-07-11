# NOAI-PLAY-001 — 「暮らす」決定論プレイヤーアクションシェル 高忠実度プロトタイプ

- **Branch:** `ux/NOAI-PLAY-001-deterministic-action-shell-prototype`(isolated worktree from `origin/main` @ `6d97673dd7f48baf48eb1cf0859fac06b33217da`, v1.78.2)
- **Scope:** リポジトリ実態に基づくプロダクト設計+インタラクティブ高忠実度プロトタイプのみ。`src/**`・本番webview・package version・生成バンドル・GM Skill・ユーザーのライブワークスペースには一切触れていない。
- **Deliverables:** `docs/prototypes/noai-play-shell/{index.html,styles.css,prototype.js,sample-data.json}` / `docs/assets/noai-play-shell-{desktop,narrow}.jpg` / 本レポート
- **Companion works(read-only inspection):** EXPERIENCE-ARCH-001 `9cc4637` / PLAY-UX-001 `644c1ae` / WORLD-PULSE-001 `7e9a8ae` / RETURN-UX-001 `f9e641ec`

**Verdict: `NOAI_PLAY_001_PROTOTYPE_READY_FOR_IMPLEMENTATION`**(§15の依存条件つき)

---

## 1. リポジトリ実態監査(repo reality audit)

`origin/main @ 6d97673` を直接読んだ(レポート類の自己申告ではなくコントラクトを確認)。前提: NOAI-SOAK-001 は統合済みで、決定論ロングホライズンランナー(`scripts/run_noai_soak.js` + `src/noaiSoakRunnerCore.ts`)が存在する。しかし **ユーザー向けNOAIプレイモードはまだ存在しない**。`aiParticipationPolicy`(`always|onDemand|simulationOnly`)はコアにあるが、消費するUIシェルがない。

### 監査で確認した決定論システム(抜粋・行番号は当該コミット)

| システム | 実体 | プレイヤー行動として使えるか |
|---|---|---|
| 直接取引 | `livingWorldCommerceUiCore.executeDirectTrade`(`WRONG_LOCATION` 検査つき)→ ホスト `livingWorldCommerceUi.ts` で配線済み | **今すぐ**(buy/sell、全拒否コード付き) |
| 取引検証 | `commerceCore.applyTradeOp` — `INSUFFICIENT_CREDITS / INSUFFICIENT_CARGO / INSUFFICIENT_STOCK / CARGO_CAPACITY / NOT_TRADED_HERE / INVALID_QTY` | **今すぐ**(阻害理由の語彙そのもの) |
| 機会提示 | `buildCommerceDecisionSurface` — 遠隔市場の差益+**travelPreview(days/foodCost)**+evidence(`recent_event`/`reputation_*`/`low_stock`)、**FoW発見済みゲート** | **今すぐ**(読み取り専用の「見立て」) |
| 旅程計算 | `transportCore.planTravel` — BFS経路・日数=hops/speed・食料=日数×輸送手段×荷重係数 | **今すぐ**(計算)/確定適用は**要接続** |
| 時間経過 | `narrativeTimePassageCore.clampElapsedWorldTurns`(≤100)+ `livingWorldTurnOpsCore.applyTravelFoodConsumption` | **要接続**(器は完成) |
| 世界シム | `worldSimBulkCore.runBulkWorldSimulation`(≤100/chunk)+ `worldSimCommerceCore.tickMarketRecovery` — NOAI-SOAK-001で1000刻の決定論を実証済み | **今すぐ** |
| 絆と取引の連動 | `playerBondCore.batchPlayerBondTradeAdjustments` — 盟友(信頼85+)同席市場で純収支±10%(1バッチ上限500) | **今すぐ**(GMターン内で稼働中) |
| 絆の節目 | `playerBondCore.detectPlayerBondEvents`(盟友85+/想い80+/敵対≤15/畏怖80+、節目≤8/NPC) | **要接続**(会話・手当て等の行為配線) |
| 領地(領主) | `domainCore` — **11政務**カタログ(`DOMAIN_ACTION_CATALOG`は「World tab action chips用」と明記)、**月2手**(max4)、季節補正、謁見裁定、官吏任命/派遣、隣領男爵、`monthly_commit` | **今すぐ**(opsパーサ+確定適用器が完備) |
| 組合(組合長) | `guildCore` — **7采配**、**週2手**、依頼裁定(accept/decline/negotiate)、隊派遣 `assign_party`、`weekly_commit` | **今すぐ** |
| 資源 | `campaignResourcesCore.applyCampaignResourceOps`(±500/op、8op/turn) | **要接続**(採集・製作レシピの配線) |
| 発見物 | `discoveryLedgerCore` — 状態係数つき査定 `sell_discovery` | **今すぐ** |
| 車輌 | `vehicleOpsCore.applyVehicleOps`(set_active/move/damage/repair/refuel) | **今すぐ**(`enableVehicleSystem` ゲート) |
| 現在地 | `GameState.world.currentLocationId` + `visitedLocationIds` + `npcPositions[npcId].locationId/arrivesTurn` | **今すぐ**(読み) |
| 古い観測 | `worldStateCore.lastVisitTurnByLocation` / `marketPriceHistory`(≤24点) | **今すぐ** |
| レシート | `promptReceiptCore`(受領ID/digest)+ `worldIntentEffectAccountingCore`(EffectCause/Entry)+ `wce_` イベントID(`makeEventId`) | **今すぐ**(記録の同一性基盤) |
| 遭遇 | `travelEncounterCore.rollTravelEncounters`(density低中高・severity flavor/notable) | **今すぐ**(GMプロンプト行生成) |
| デバッグ実績 | `debugScenarioCore` — `narrative_rest / narrative_travel / world_sim / location_set` 等が**デバッグタグ限定**で既に決定論実行されている | パターン実証済み(そのまま製品化はしない) |

### UXブランチの確認(read-only)

- **EXPERIENCE-ARCH-001**: 5面IA(PLAY/WORLD/PEOPLE/CHRONICLE/TOOLS)、権威パレット(金=正史/青=事実/金破線=兆候/点線=不確か)、モーション予算、400px規約、「同じ家の別の部屋」原則。本プロトタイプはこの家の**新しい部屋**として設計した。
- **WORLD-PULSE-001 / RETURN-UX-001**: プロトタイプ規約(JA-first・シナリオタブ・skip-link・provenanceレジェンド・`sample-data.json` に「拡張が永続化しないフィールドは発明しない」注記)と**共有世界アルヴェリオン**(銀天秤商会/宿場町ハロウ/王都リュミナ/小麦・鋼・塩・薬草…)。本プロトタイプは同じ世界を再利用し、家の連続性を保った。
- **PLAY-UX-001**: Cinematicは本番実装(プレゼンテーションのみのCSSモード)。「物語る」への出口として接続。

---

## 2. 利用可能アクションのソースマップ(source map)

分類は3値。**プロトタイプUI上でも「開発用レンズ」を点けると全アクションにこのタグが表示される**(誠実性の担保)。

```text
AVAILABLE NOW(実装済 — ロジックも確定適用器もmainに存在)
  buy/sell 直接取引        commerceCore.applyTradeOp + executeDirectTrade
  機会の見立て+根拠        buildCommerceDecisionSurface(evidence/travelPreview)
  旅程の計算               transportCore.planTravel(days/foodCost/経路)
  世界を進める             worldSimBulkCore + tickMarketRecovery(SOAK実証済み)
  盟友の取引補正           batchPlayerBondTradeAdjustments(±10%/上限500)
  週次采配・依頼裁定・隊派遣  guildCore(weekly_commit / resolve_request / assign_party)
  月次政務・謁見・官吏派遣    domainCore(monthly_commit / audience_ruling / dispatch_officer)
  発見物の売却             discoveryLedgerCore.validateSellDiscoveryTrade
  車輌操作                 vehicleOpsCore.applyVehicleOps
  居場所・不在の判定        npcPositions / currentLocationId
  観測の鮮度               lastVisitTurnByLocation

DERIVABLE WITH A SMALL ADAPTER(要接続 — 部品完備、プレイヤー向けホストコマンド1本)
  旅の確定適用   = planTravel + location_set patch + clampElapsedWorldTurns
                   + applyTravelFoodConsumption + world_sim ticks(全部品実装済み)
  休む/一日を終える = clampElapsedWorldTurns + runBulkWorldSimulation(debug実証済み)
  採集/製作      = applyCampaignResourceOps(allowlistレシピを足すだけ)
  話す/見舞う/手当て = playerBond milestones + (資源消費) — 行為→絆Δのallowlist定義
  遭遇の確定発火  = rollTravelEncounters を旅アダプタへ(現状はGM行生成)

FUTURE / NOT AVAILABLE(構想 — 本番ロジックなし。UIでは「構想」と明示)
  自店の値付け(市場価格は需給指数のみ)
  治療の身体状態モデル(HPはあるが疾病/品質なし)
  仕事の熟練/品質、雇用契約、生産チェーン
```

---

## 3. ユーザー向け用語の決定(terminology)

**採用: 「暮らす」(直接・決定論)⇄「物語る」(任意のAI語り)。**

- リポジトリ根拠: Cinematic(語りの劇場)が既に「物語」側の部屋として実装済み。`aiParticipationPolicy` の3値に対し、プレイヤー語彙は「モード名」ではなく**動詞**で与えるのが家の文法(世界の脈/遊びに戻る、と同族)。
- 「NOAI/AI OFF/シミュレーションのみ」は開発語としてレポート・設定内部にのみ残す。プレイヤーには**劣化モードではなく主体性**として提示: バナー文言は「この部屋の行動は決定論エンジンが確定します。AIは呼ばれません — あなたが『物語にする』と頼んだときだけ」。
- 派生語彙(provenance): **確定**(fact/エンジンが書いた)・**見立て**(estimate/画面の計算)・**不確か**(unknown/霧・古い観測)・**語り**(narration/事実を変えない)・**節目**(canon/年代記ピン)。WORLD-PULSE/RETURN-UXの 事実/兆候/不確か/語り と同系で、書き込み部屋向けに「確定」を主役にした。

---

## 4. 決定論プレイヤーループ(player loop)

```text
いまの私(状況・手元・同席者・残り刻)
  → 行動を選ぶ(家族=Work/Trade/Travel/People/Life/Manage/Govern)
  → 確認シート: 使うもの[確定] / 条件[✓✕] / 確かなこと[確定] / 見立て / わからないこと[不確か]
  → 「行う」= コミット(エンジンだけが数値を確定)
  → 確定レシート: 「確定 — 世界に書き込まれました」試み/成否/Δ(before→after)/事実/記録ID(wce_)
  → 世界の応答(市場回復・出来事)
  → 任意: 「この出来事を物語にする」(AI 1回・記録不変の明示)
  → 次の状況(または「一日を終える」)
```

プロトタイプで全ステップ動作確認済み(§13)。レシートは**読める受領書**であってデバッグログではない: Δは `銭 92 → 68(−24)` 形式、事実は箇条書き、`wce_` IDは末尾に小さく(世界の脈への将来リンク先)。

---

## 5. アクション分類(taxonomy)

リポジトリ能力から導出した6家族(すべてのロールに全部は出さない — シナリオごとに3〜5):

| 家族 | 源 | 例 |
|---|---|---|
| 仕事 WORK | campaignResources(要接続) | 薬草を摘む/手当て |
| 商い TRADE | commerceCore(実装済) | 仕入れ/売却/食料購入 |
| 移動 TRAVEL | transportCore(計算=実装済/適用=要接続) | ハロウへ下りる(1日・食料−4) |
| 人 PEOPLE | playerBond(要接続) | 見舞う/立ち話 |
| 暮らし LIFE | timePassage(要接続) | 休む/荷を検める(0刻・観察) |
| 采配 MANAGE / 政 GOVERN | guildCore/domainCore(実装済) | 週の采配2手/月の政務2手/裁定 |

各カードの構成要素: 名前(明朝)・時間チップ(1刻/2日/刻を使わない)・費用チップ・条件(✓/✕+現在値)・不確かさ・相手・**source(module::symbol+availability)**・不可時は**理由(コード付き)+建設的ヒント**。生の内部コマンドは一次UIに出さない。自由入力欄は置かない — 将来AIが解釈する場合も、**権威はallowlist済み検証intentに解決されてから**エンジンに渡る(§9)。

---

## 6. 予測と結果の区別(prediction vs result)

- **KNOWN(確か)**: その場の確定値のみ — 単価×数量、所要日数、食料コスト、前提条件。確認シートで「確定」チップ。
- **ESTIMATED(見立て)**: 価格圧力%、盟友+10%見込み、季節補正、危険度傾向。金破線チップ。honesty rule: 時系列が実在しない指標(派閥の趨勢等)は描かない — 実在するのは `marketPriceHistory` のみ(WORLD-PULSE F5 を継承)。
- **UNKNOWN(不確か)**: FoWの向こう、9日前の観測、遭遇の中身。点線チップ。**ヒント内の古い数字にも「不確か」を付けた**(立ち往生: 「差額+3銭/袋 — 9日前の観測 [不確か]」)。
- 実行後は**実際の確定Δのみ**をレシートに。見立てとの差(王都の塩 14→着時13)はレシートの事実行で observation update として示す。

---

## 7. 時間とケイデンス(time & cadence)

リポジトリが既に3種のケイデンスを持つ — これをそのままロールの器にした:

| ケイデンス | 源 | 予算 | 締め |
|---|---|---|---|
| **日**(暮らし手) | slots試作(朝/昼/夕=3刻)+ worldSim 1step/日 | 3刻 | 「一日を終える」 |
| **週**(組合長) | `guildWeeklyActions`(既定2, max4) | 2手 | 「週を締める」= weekly_commit |
| **月**(領主) | `domainMonthlyActions`(既定2, max4)+ `domainMonthDays=30` | 2手 | 「月を締める」= monthly_commit |

暦は30日/月・4季で統一表示(`第4月22日(夏)・112刻目`)。**安全な時間送り**: 「一日を終える」は必ず事前プレビュー(何がtickするか)→確認→世界の応答1件、を経る。**正直な空振り**を明文化: 「進めるを押しても面白いことが起きる保証はありません。静かな日は静かに終わります」。連打誘導を避けるため、送りは1日単位のみ(まとめ送りは将来の束ね計画=有界バッチとして§11)。無制限の自動化キューは置かない。

---

## 8. AI参加モデル(AI participation)

4状態: **直接**(既定・AIゼロ)/ **これを語る**(レシート単位)/ **回のまとめ**(将来)/ **フルGM**(既存)。

**最安全設計 = 「結果単位のopt-in+入り口でのプレイスタイル既定」**を採用:
- グローバル常時トグルは危険(いつ課金/呼び出しが起きるか不透明になる)。**per-result** なら「AIを1回呼びます — この結果を語り直すだけ」がその都度明示できる。
- キャンペーン入り口(RETURN-UXの敷居)で既定スタイル(暮らす/語り付き/フルGM)を選ぶ — `aiParticipationPolicy` の消費点。
- 確認シートに**呼ぶ回数(1回)・できること(語りのみ)・できないこと(記録改変)**を毎回列挙。低価値の連発を防ぐため、Δもイベントも無いレシートには語りCTAを出さない(**意味変化しきい値**)。

---

## 9. 権威境界(authority boundaries)

```text
シミュレーションが「何が起きたか」を決める
→ レシート(wce_ ID・EffectAccounting)がそれを証明する
→ AIは説明・語り直しができる
→ AIは状態を書き換えない(黙ってはなおさら)
```

UI上の担保: (1) 語りブロックは**出典レシートID**を常に持ち「記録は変わっていません」を明記、削除しても記録は残る。(2) 語り確認シートが**毎回**不変条項を列挙。(3) 美文がレシートより上位に見えないよう、語りはハッチ枠+明朝イタリック=**装飾的に「別物」**。(4) 自由入力は権威経路に存在しない。(5) 週/月の締めも「選んだ采配のallowlist」だけがopsに変換される(guild/domain opsパーサの既存挙動と同型)。

---

## 10. 非冒険者ロールの支持(non-adventurer roles)

7切替シナリオ(プロトタイプ左上タブ):

1. **静かな薬師**(シルヴァ・日) — 危機なしの営み。採集/手当て/市/見舞い/休む。静かな空状態。
2. **宿場の店主**(ハロウ・日) — 仕入れ/店売り。**盟友ダン同席で+10%見込み→確定+5銭**をレシートで実証。鋼はINSUFFICIENT_CREDITSで正直に不可+ヒント。値札変更は「構想」タグで誠実に非実装宣言。
3. **隊商主**(ヴェルサ・日+旅) — decision surface由来の機会カード(圧力+35%/根拠チップ/旅プレビュー2日・食料5)。出発は2日を消費し現在地が変わる。
4. **組合長**(王都・週) — 週2手の采配チップ、依頼2件の裁定(受ける/詰める/断る)、受注→隊派遣が解禁。個人インベントリではなく**組合の帳面**(金庫/物資/名声/規律/町の受け+在籍3名)。
5. **領主**(山峡・月) — 月2手の政務チップ(11種)、謁見2請願、軍監派遣。**領の帳面**(国庫/食料/兵/治安/民心/威信)。RTSダッシュボードではなく政務日誌の文体。
6. **立ち往生** — 5種の阻害(銭/扱い品目/手持ち/食料/相手不在)+古い観測。全てに建設的ヒント、**回復連鎖**(食料購入→移動解禁)を実装。
7. **語りの後で**(300刻) — 大口納品レシート+世界の応答+語りの意思決定。長期台帳の畳みを実演。

ヘッダの手元表示もロール加重: 商人系は銭/食料/荷、組合長・領主は帳面パネルが主役(個人財布は消える)。

---

## 11. 100/300ターン生存(scaling)

EXPERIENCE-ARCH §12 の機構を書き込み部屋に適用:

- **日誌は常に有界**: 今日(生)→昨日まで/月ごと(`<details>`束+件数+要約1行)→**節目**(金ピン・年代記へ)。300刻シナリオで実演: 今日2件+今月38件束+第9月束+第4〜8月束×5+節目2本。
- **反復の減衰**: 「『小麦の仕入れ』が4日続いています — 明日からは束ねて記します」(束ね予告)。同型連打への構造的答えは(a)日次束ね、(b)語りCTAのしきい値、(c)週/月ロールへの**昇格**(日次作業が采配1手に畳まれる — guild/domainの器が既にそれ)。
- **復帰**: RETURN-UXが敷居を担う。暮らすは開いた瞬間の「いまの私」+古い観測バッジで再開文脈を返す。
- **通知ゼロ**: 世界の変化はピン/世界の応答エントリのみ。バナー恒常表示なし。
- UIだけでゲームバランスが解決するとは主張しない — 「最善ボタン一強」の是正はエンジン側の多様性(価格・季節・出来事)に依存する(§15)。

---

## 12. 部屋間の接続(cross-surface)

| 遷移 | 契約 |
|---|---|
| 世界へ戻る(RETURN-UX)→ 暮らす | 敷居カードの「続きから」= PLAYの参加モードが「暮らす」ならこの画面に着地 |
| 暮らす → 物語る(Cinematic) | ヘッダ「物語る」/ レシートの「物語にする」— 現在の場面・選択レシートを語りの部屋で開く |
| レシート `wce_` ID → 世界の脈 | 記録IDタップで該当イベントの根拠カードへ(Pulseは読み取り専用のまま) |
| 相手つき行動 → 人々 | 「相手: ミラ婆」→ PEOPLE台帳(信頼・節目) |
| 節目ピン → 年代記 | 金ピン→該当章 |
| どこからでも → 暮らす | 家の規則「▸ 遊びに戻る」に相当する常設復帰(このプロトタイプでは各部屋リンクがトースト契約文を表示) |

迷路防止: この部屋の一次コンテンツは行動カードと日誌のみ。パネル起動ボタンの格子は置いていない。

---

## 13. アクセシビリティ/レスポンシブ検証(a11y & responsive)

実施した検証(ローカルサーバ `http.server` + Browser paneで実操作):

- **フロー**: 薬師で 確認→行う→確定レシート(薬草5→8束/残り刻減)→語り追加(出典明記・記録不変)→語り削除、立ち往生で **5阻害+回復連鎖**(食料購入→移動解禁、レシートに「条件を満たした」)を動作確認。コンソールエラー0。
- **構造**: skip-link/`role=tablist`(矢印キー移動)/`role=dialog`+フォーカストラップ+Esc+呼出元へフォーカス復帰/`aria-live`(残り刻・日誌・トースト)/provenanceは**色+枠線形状+文言**の三重(グレースケール耐性)。
- **日本語長文**: `overflow-wrap:anywhere`・行間1.7-2.0・明朝=物語/権威、ゴシック=計器の使い分け。
- **reduced-motion**: アニメはシート出現のみ(モーション予算1)— `prefers-reduced-motion` で全停止。
- **狭幅**: ≤1100で2列→≤760で1列+ボトムシート→400pxは §13検証記録参照(横スクロールなし)。
- **静かな空状態**: 薬師「急ぎの用はない」、空の日誌「まだ今日の記録はありません」、空振りの一日「静かな一日だった」。

---

## 14. 本番実装スライス案(production slices)

依存順(各スライスは独立レビュー可能な薄さ):

1. **P1: 参加モードの正史化** — Game Rules選択UIが `aiParticipationPolicy` を書き、PLAYに「暮らす」状態を追加(空シェル: いまの私+日誌のみ)。
2. **P2: 商いパネル移植** — 既存 `executeDirectTrade` 配線を暮らすの確認シート/レシートUIで包む(新権威なし)。盟友補正の見立て表示。
3. **P3: 一日を終える** — 新ホストコマンド(clampElapsedWorldTurns+bulk sim 1+市場回復+世界の応答1件)。SOAKの不変条件をそのまま回帰テストに。
4. **P4: 旅アダプタ** — planTravelプレビュー+確定適用(location_set patch+食料消費+日数tick+遭遇行)。
5. **P5: 週/月の采配面** — guild/domain opsをプレイヤーUIから直接発行(GMターン経由の既存パーサを再利用)。
6. **P6: 語り接続** — レシート→Cinematicへの受け渡し(語りは新規権威を持たない)。
7. **P7: 生活アダプタ群** — 採集/会話レシピ(campaignResource/playerBondのallowlist)。
8. **P8: 日誌の束ねと節目** — 日次/月次束ね、`majorArcs`(EXPERIENCE-ARCH slice 6と共有)。

各スライスの受け入れ条件: 決定論(同seed同結果 — NOAI-SOAKランナーで検証可能)・レシートID一意・語りゼロ呼び出しでの完走。

---

## 15. 限界と依存(limitations)

- **プロトタイプは演出**: 数値遷移は `sample-data.json` の事前計算(エンジン非接続)。決定論の実証は NOAI-SOAK-001 が担い、ここではUX契約のみを示した。
- **静的な阻害文**: 試作では不可理由の金額が固定文字列(本番は都度導出 — 立ち往生で食料購入後も鋼の「所持92」が残るのは試作の既知事項)。
- **仕事(採集/手当て)の中身**: 資源opsは実在するがレシピ概念がない。allowlistレシピの設計が P7 の前提。
- **自店値付け・治療モデル・生産チェーンは構想** — UIタグどおり未実装。
- **語りの実文**: 300刻シナリオのみ手書きサンプル、他は定型文。P6でCinematic/GM経路に接続するまで品質は語れない。
- **バランス非主張**: 「最善ボタン一強」への最終回答はエンジンの多様性次第。本UIは受け皿(束ね・昇格・しきい値)を用意したに留まる。
- **remote-player 未検討**: 400px規約は満たすが、リモートクライアントへの写像は別タスク。

---

## 付録: 検証記録(実施ログ要旨)

- `python -m http.server 8945` で配信し Browser pane で実操作(シナリオ7種の描画・全暦整合を `node` で機械検証: healer=第2月28日/shopkeeper=第4月22日/caravan=第5月21日/guild=第23週/ruler=第2月/blocked=第7月23日/aftermath=第10月30日)。
- スクリーンショット: `docs/assets/noai-play-shell-desktop.jpg`(1600px)/`noai-play-shell-narrow.jpg`(400px)— headless Chrome で取得。
- 400px `document.documentElement.scrollWidth === clientWidth` 確認済み(横オーバーフローなし)。
