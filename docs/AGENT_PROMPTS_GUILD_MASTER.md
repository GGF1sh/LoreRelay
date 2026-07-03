# Guild Master (F11) — エージェント投入プロンプト集（コピペ用）

> **使い方:** Antigravity / Grok / Codex / Gemini など別 AI を「実装担当」にして、下のプロンプトを **上から順に 1 つずつ** 投げる。各プロンプトは自己完結 — 前提を毎回埋め込んである。
> **土台仕様書:** `docs/GUILD_MASTER_ROLE_BRIEF.md`（各タスクの詳細・データ定義・DoD はここが正）。
> **親レシピ:** `docs/DOMAIN_MODE_DESIGN.md` ＋ `src/domainCore.ts` / `domainAudienceCore.ts` / `domainMissionCore.ts` / `domainDriftCore.ts`（Guild はこれらの写像 — 迷ったら Domain の実装を読む）。
> **安全柵:** `AGENTS.md`（あれば）。危険操作は禁止。
> **鉄則:** 1 タスク = 1 プロンプト = 小さいコミット。完了条件（DoD）を満たすまで「done」と言わせない。
> **並行開発注意:** このリポジトリは複数 AI が同時編集中。作業前に必ず `package.json` の版数・`CHANGELOG.md`・対象ファイルの実際の中身を確認すること（本 doc に書いた行番号・関数名は執筆時点のものであり、実装時に古くなっている可能性がある——引用する前に grep で実在確認）。新規ファイル追加は git add -A ではなくパス指定でコミット。

---

## 監督（Antigravity 等）への常設ヘッダー

各タスクプロンプトの前に、この管制ルールを 1 度セットしておく:

```
あなたは LoreRelay（C:\AI\text-adventure-vsce）の実装担当です。
作業前に必ず読む: docs/GUILD_MASTER_ROLE_BRIEF.md, docs/DOMAIN_MODE_DESIGN.md, AGENTS.md（あれば）。

絶対ルール:
1. ファイル削除・git reset --hard・git clean -fdx・format 系は使わない。
2. 大きな変更の前に実装計画を1つ出す。1タスク=1論理変更=小さいコミット。
3. BRIEF に無い機能を勝手に足さない。迷ったら BRIEF §12「§迷った時の既定」に従う。
4. 依頼生成・イベント抽選・クエスト判定は決定論 Core（hashSeed、同一入力→同一結果）。
   LLM は narration 専任。依頼人の会話・冒険者の武勇伝の自動生成は作らない（黄金律、BRIEF §1.3）。
5. 新規コードは src/domainCore.ts / domainAudienceCore.ts / domainMissionCore.ts /
   domainDriftCore.ts の構造をそのまま写像する（BRIEF §0.1 の対応表通り）。
   命名・clamp・validate・parseOps のパターンを勝手に変えない。
6. webview を触る場合: webview/modules/*.js を編集し scripts/build-webview.js で束ねる。
   webview/script.js と style.css は生成物なので直接編集しない。
7. 完了条件(DoD)を全て満たすまで完了報告しない:
   - cd text-adventure-vsce && npm run compile （TSエラー0）
   - npm test （既存テストを1件も壊さない・新規テスト追加。件数は実行して実測すること、
     ドキュメントの古い数字を信じない）
   - 全 game_rules フラグは既定 false のまま。フラグ OFF 時の既存挙動が変わっていないか確認。
8. 存在しない関数/ファイルを引用しない。呼ぶ前に grep で実在確認する。
9. 最後に必ず報告: 変更ファイル / 実行コマンド / テスト結果(数字) / 残課題 / BRIEF から外れた判断があればその理由。

危険を感じたら止めて、ログを残して次のタスクへ行かず待機すること。
```

---

## TASK G1 — guildCore.ts 基盤 + 週次コミット（依頼なし）

```
目的: Guild Master ロールの状態コアを作る。まだ依頼人もクエストも出さず、
週次アクションでの stat/イベント循環と World タブへの最小表示だけを通す。

前提(必読):
- docs/GUILD_MASTER_ROLE_BRIEF.md §3(データモデル)・§4(週次コミット)・§4.1(イベント表)
- src/domainCore.ts 全体（型・clamp・validate・applyMonthlyCommit・rollDomainEvent の実装を
  そのまま構造コピーする対象）

やること:
1. src/guildCore.ts を新規作成。BRIEF §3 の型定義(GuildState/GuildConfig/GuildOps等)、
   定数(MAX_GUILD_ADVENTURERS等)をそのまま実装。
   domainCore.ts から以下を「名前を置換して」移植:
   - clampDomainStat → clampGuildStat, clampDomainResource → clampGuildResource
   - resolveRankFromPrestige → resolveRankFromRenown(renown>=60 renowned, >=30 reputable, else chartered)
   - getDomainSeason → getGuildSeason(calendarWeek): WEEKS_PER_SEASON=12 で判定
   - advanceDomainCalendar → advanceGuildCalendar(week>WEEKS_PER_YEAR→1, year+1)
   - normalizeDomainConfig → normalizeGuildConfig
   - validateDomain → validateGuild（controlledRegionId→hallLocationId、officers→adventurers等）
   - parseDomainOps → parseGuildOps（kind: 'weekly_commit'|'recruit_adventurer'|
     'dismiss_adventurer' のみ、resolve_request/assign_party は TASK G2/G3 で追加）
   - hashSeed（FNV実装をそのまま複製。domainCore への runtime import は禁止 — コア間は疎結合）
2. GUILD_EVENTS（BRIEF §4.1 の10種）を DOMAIN_EVENTS 構造で定義。効果は
   ACTION_DELTAS/DOMAIN_EVENT_EFFECTS 相当を Guild の stat 名(coffers/supplies/renown/
   discipline/townFavor/facilities/safety/lore)で定義。GUILD_EVENT_GM_HINTS も用意。
3. applyWeeklyCommit(state, ops, config, worldTurnSeed) を applyMonthlyCommit 構造で実装。
   BRIEF §4 の手順1-2,6のみ（3=依頼生成、4=クエストtick、5=rivalは後続タスクでスタブ or 未実装）。
4. appointAdventurer/dismissAdventurer を appointOfficer/dismissOfficer 構造で実装。
5. game_rules.ts に enableGuildMode: false（他の enableGuild* は未追加でよい）を追加。
   sanitizeGameRules に boolean ガードを追加(既存 enableDomainMode の追加パターンを踏襲)。
6. World タブに最小 Guild パネル（coffers/renown/townFavor/discipline/adventurers一覧のみ表示、
   read-only）。既存 Domain パネルの webview モジュール構造を参考に配置。
7. テスト scripts/test_guild_core.js を新規（`scripts/run_all_tests.js` に登録）:
   validate/parseOps の正常系異常系、
   computeGuildEventWeight の重み条件、applyWeeklyCommit の決定論性
   （同一 domain+ops+seed→同一結果を複数回呼んで比較）。

DoD:
- npm run compile: TSエラー0
- npm test: 既存件数を壊さず、新規テストが全て緑（実行して実数を報告すること）
- enableGuildMode=false のとき既存挙動・既存テストに一切影響なし
- 依頼(request)・クエスト(quest)関連コードはまだ書かない（次タスクの範囲）
```

---

## TASK G2 — guildRequestCore.ts: 依頼人キュー + 一括/面談 tier

```
目的: 「受付に座って依頼人を捌く」体験の中核。掲示板の依頼を決定論生成し、
受諾/謝絶/交渉で裁定できるようにする。派遣(パーティ編成)はまだ作らない(TASK G3)。

前提: TASK G1 完了後。必読:
- docs/GUILD_MASTER_ROLE_BRIEF.md §2(②分離/③一括+面談 の決定事項)・§5・§5.1・§7
- src/domainAudienceCore.ts 全体（buildAudienceQueue の weighted-without-replacement
  抽選ロジック・resolvePetitionRuling・buildAudiencePromptLines をそのまま構造コピーする対象）

やること:
1. src/guildRequestCore.ts を新規作成。
   PETITION_DEFS → REQUEST_DEFS（BRIEF §5 の10種、各 clientArchetype/summary/questKind/
   baseDifficulty/baseReward/rulings(accept/decline/negotiate)/baseWeight/条件 を定義）。
   computePetitionWeight → computeRequestWeight（townFavorMax/renownMin/season条件）。
   buildAudienceQueue → buildRequestQueue（同じ hashSeed 抽選方式、size=boardSize）。
   resolvePetitionRuling → resolveRequestRuling（rulingId: accept|decline|negotiate）。
2. guildCore.ts の GuildOpsKind に 'resolve_request' を追加、parseGuildOps を拡張
   (requestId + rulingId の妥当性チェック、BRIEF §5.1 のガード)。
3. applyWeeklyCommit に BRIEF §4 手順3を追加: actions.includes('open_board') のとき
   buildRequestQueue → pendingRequests にセット（open_board を含まない週は
   既存 pendingRequests を上書きしない）。
4. resolveGuildRequest(state, requestId, rulingId) を applyAudienceRuling 構造で実装:
   - accept: delta適用 + GuildQuest{status:'accepted', difficulty, rewardCoffers} を
     quests に push、pendingRequests から除去
   - negotiate: delta適用（前金coffers+、townFavor-）+ accept同様に quests へ push だが
     rewardCoffers を値切り分減額（具体的な減額率は BRIEF に明記なし→ 20%減で実装し、
     コミットメッセージに明記）
   - decline: delta適用のみ、pendingRequests から除去、quest化しない
5. src/guildPromptCore.ts を新規作成:
   - resolveGuildBoardTier(state, focusRequestId?): focusRequestId が有効な
     pendingRequests を指すときのみ 'full'、それ以外は 'bulk'（BRIEF §7 の既定通り）
   - buildRequestBoardPromptLines(state): tier==='bulk' なら pendingRequests を
     buildAudiencePromptLines 構造で一括列挙。tier==='full' なら focusRequestId 1件を
     厚く描写するプロンプト行を生成。
   - GUILD_BOARD_OPS_PROMPT_LINE 定数（BRIEF §7 に文言例あり、それに準拠）
6. World タブ: pendingRequests を一覧表示 + 各行に「面談」ボタン
   （クリックで focusRequestId をチャットに挿入 — 既存 insertChatText 経由の
   パターンを Cartography のピンクリック実装(mapFeedbackCore.ts 付近)から踏襲）。
7. game_rules.ts に enableGuildRequests: false を追加。
8. テスト scripts/test_guild_request_core.js: queue の決定論性、各 ruling の delta 検証、
   accept→quest 昇格の内容検証、resolveGuildBoardTier の bulk/full 分岐、
   requestId/rulingId のサニタイズ（不正値・改行混入で例外にならないこと）。

DoD:
- npm run compile / npm test 緑（実数報告）
- enableGuildRequests=false で既存動作に影響なし
- 「一括提示が既定、面談はモード切り替え」の挙動が受け入れ基準通り動く
```

---

## TASK G3 — guildQuestCore.ts: パーティ派遣 + Bond連動クエスト判定

```
目的: 太閤IIの「主命を出す側」。受注済みクエストにパーティを組んで派遣し、
skill・Bond・difficulty・seed から決定論で成否を判定する。

前提: TASK G2 完了後。必読:
- docs/GUILD_MASTER_ROLE_BRIEF.md §6・§6.1・§6.2
- src/domainMissionCore.ts 全体（resolveMissionOutcome・computeMissionGradeWeights・
  createOfficerMission・tickMissionMonth をそのまま構造コピーする対象）
- src/domainOfficerBondCore.ts（PLAYER_TRUST_RIVAL_MAX の定義・低信頼時の重み調整ロジック）
- Bond の実データソース: src/playerBondCore.ts / src/npcRelationshipCore.ts
  （host 側で npcId→trust/affinity をどう解決しているか、
  domainBridge.ts の officerTrustMap 組み立て箇所を読んで同じパターンで
  adventurerBondMap を組み立てる）

やること:
1. src/guildQuestCore.ts を新規作成:
   - assignParty(state, questId, npcIds, maxActiveQuests, weeks?) を dispatchOfficer 構造で
     実装（BRIEF §6.1 のガード: 対象クエストが status='accepted'、npcIds全員appointed かつ
     他クエスト未従事、active数<maxActiveQuests）
   - computeQuestGradeWeights(partySkill, avgBond, difficulty) を
     computeMissionGradeWeights ベースに実装。difficulty項を追加:
     edge = partySkill - difficulty を triumph/disaster 側の重みに反映
     （BRIEF §6.2 の記述通り。具体的な係数は domainMissionCore の
     lowTrust 分岐の桁感(±15〜25程度)に合わせて調整し、テストで固定する）
   - resolveQuestOutcome(quest, partyNpcIds, skillMap, bondMap, seed) を
     resolveMissionOutcome 構造で実装。grade→delta・report文言は
     BRIEF §6.2 の表(triumph/success/setback/disaster)通り。
     disaster時のBond宿敵混在(avgBond<=PLAYER_TRUST_RIVAL_MAXの一員が居る場合)は
     「持ち逃げ」文言 + coffers追加減 を上乗せ。
2. guildCore.ts の GuildOpsKind に 'assign_party' を追加、parseGuildOps を拡張。
3. applyWeeklyCommit に BRIEF §4 手順4を追加: quests の status='active' 分を
   weeksRemaining--、0到達で resolveQuestOutcome → delta適用 + lastQuestReports、
   完了分は quests から除去。
4. guildBridge.ts（新規 or TASK G1で作成済みなら追記）で adventurerBondMap を
   host側のBond解決から組み立てて config に渡す配線を追加。
5. guildPromptCore.ts に buildActiveQuestPromptLine（buildActiveMissionPromptLine構造、
   派遣中パーティの表示）と DOMAIN_MISSION_OPS_PROMPT_LINE 相当の
   GUILD_QUEST_OPS_PROMPT_LINE を追加。
6. World タブ: 受注済みクエスト一覧 + パーティ編成UI（冒険者チェックボックス選択→
   assign_party ops をチャット挿入）。
7. テスト scripts/test_guild_quest_core.js:
   - computeQuestGradeWeights: skill/bond/difficulty の各方向への重み変化を検証
   - 同一 seed+同一入力→同一 grade を複数回検証（決定論の核）
   - avgBond低（宿敵混在）→ disaster率上昇の検証
   - assignParty のガード（appointed外/重複従事/上限超過で no-op）

DoD:
- npm run compile / npm test 緑（実数報告）
- enableGuildParties=false（game_rules.ts に追加）で既存動作に影響なし
- 同一seedで同一grade（フレーク無し）をテストで担保
```

---

## TASK G4 — guildDriftCore.ts: 留守ドリフト + Since-last-visit

```
目的: プレイヤーが冒険中や別行動している間も、副長/受付がギルドを回している体験。
戻ってきたときに「留守中に何が起きたか」を GM プロンプトに注入する。

前提: TASK G1〜G3 完了後。必読:
- docs/GUILD_MASTER_ROLE_BRIEF.md §8
- src/domainDriftCore.ts 全体（丸ごと写像対象。simulateStewardMonth・
  simulateDomainDrift・computeSinceLastDomainVisitDelta・
  buildSinceLastDomainVisitLines・parseDomainSnapshot をそのまま構造コピー）
- src/livingWorldBridge.ts の Since-last-visit 配線箇所
  （recentChanges への伝聞昇格、category による分岐がどこにあるか grep で確認）

やること:
1. src/guildDriftCore.ts を新規作成:
   - createGuildSnapshot/guildStateFromSnapshot（DomainSnapshot構造の写像）
   - simulateBoardWeek(state, seed, config): presentAdventurers（他タスクで
     activeQuests化した従事中は除外）に deputy役(discipline系ロール等、
     BRIEF に明記なければ adventurers[0] または最高skillを暫定deputyとし、
     コミットメッセージに実装判断を明記) が居れば
     ['maintain_hall','open_board']、不在なら ['maintain_hall']。
   - computeSinceLastGuildVisitDelta: turnsAway→simulatedWeeks（MAX_GUILD_DRIFT_WEEKS
     を domainDriftCore の MAX_DOMAIN_DRIFT_MONTHS(24)相当で新設、cap扱いも同様）。
     GuildVisitChange{category:'guild', ...} を直近4件保持。
   - buildSinceLastGuildVisitLines: 文言は BRIEF §8 の例文トーンに合わせる。
2. livingWorldBridge.ts（または相当のホスト側配線）に Guild の Since-last-visit を
   呼ぶ箇所を追加。既存 Domain の呼び出し箇所と同じパターンで
   （enableGuildMode ガード付き）。
3. category:'guild' の VisitChange を recentChanges への伝聞昇格経路に接続
   （LW3 NPC噂と同じ経路 — 既存コードで category ごとに分岐している箇所を探して
   'guild' を追加する。新しい分岐ロジックを作らない）。
4. game_rules.ts のフラグ群を最終形に揃える:
   enableGuildMode / enableGuildRequests / enableGuildParties / enableRivalGuild(未配線・
   宣言のみ) の4つが揃っているか確認。無ければ追加。
5. テスト scripts/test_guild_drift_core.js: drift の決定論性、cap動作、
   report文字列のサニタイズ（改行/制御文字混入で例外にならない）。

DoD:
- npm run compile / npm test 緑（実数報告）
- 全 enableGuild* フラグ既定false で既存動作・既存テストに一切影響なし
- 留守中に離脱→数ターン後再訪でSince-last-visitにギルドの変化が乗ることを
  手動 or 統合テストで確認
- rival(§F8相当)は宣言のみで未配線のままでよい（BRIEF §10 Non-Goals通り）
```

---

## ローカル Coder（Qwen2.5-Coder-14B 等）への切り出し向きサブタスク

Antigravity/Claude Code が主実装。ローカルは以下の**小さい・独立した**下請けに向く（VSCode + Continue/Cline 経由）:

- TASK G1 の `hashSeed` / `clampGuildStat` 系ユーティリティと単体テスト（純ロジック、vscode 不要）
- REQUEST_DEFS（TASK G2）のデータ定義10件を BRIEF §5 の例1件を手本に残り9件書く（ロジックなし、テーブル埋めのみ）
- 各 Core への JSDoc / 型コメント追加（挙動は変えない）
- コミットメッセージ・CHANGELOG 追記文の下書き
- 差分レビュー（「BRIEF §12 の既定から外れていないか」チェック）

**ローカルに投げない:** Bond配線（TASK G3、文脈が重い）・webview ビルド配線・Since-last-visit のホスト側接続（TASK G4）。事実確認が要る設計判断も投げない（それっぽい嘘を吐きやすい）。

---

## 起きたときのチェックリスト

- [ ] 各 TASK のコミットが小さく分かれているか（`git log --oneline`）
- [ ] `cd text-adventure-vsce && npm test` が緑か（実行前後の件数を比較し、減っていないか）
- [ ] BRIEF §12「§迷った時の既定」から外れた判断があればコミットに理由が書いてあるか
- [ ] 危険操作（削除・履歴改変・依存大量追加）が無いか
- [ ] 全 `enableGuild*` フラグが既定 false のままか（誤って true にしていないか）
- [ ] World タブの Guild パネルが enableGuildMode=false のとき非表示か（レイアウト崩れなし）
- [ ] G2 の「一括提示が既定・面談はモード切り替え」の体験が実際に動くか（最終確認）
