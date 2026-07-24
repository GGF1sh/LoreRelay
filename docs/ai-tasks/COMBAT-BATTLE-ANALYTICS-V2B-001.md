# COMBAT-BATTLE-ANALYTICS-V2B-001 — Battle Analytics Data Layer

Date: 2026-07-24 JST
Base: `origin/main` @ `3daf96368c20f2b704e1946bf494c290a0b61ac9`
Branch: `task/COMBAT-BATTLE-ANALYTICS-V2B-001`
Risk: Medium (single-subsystem logic, no schema migration, no state authority change)
Author: Claude Opus 4.8 (High) — data layer only
Next AI / role: Fable 5 — display layer (in-battle feed + result table UI)

## 1. Why

LORERELAY-UI-REVIEW-001 (2026-07-24, live UI review of PR #44's Battle View) の核心的な結論:

> 戦闘が動いていることは分かるが、なぜ勝った／負けたのか理解できない。

原因はデータの不在ではなく**廃棄**だった。`stepCombat` は毎tick `attacks` / `heals` /
`deaths` / `decisions` / `mechanicsReceipts` を返しているが、
`advanceCombatCommandPlaytest` は `commandReceipts` だけ残して他を全部捨てていた。
本タスクはこの捨てられていたイベントを集計し、snapshot経由で全subscriber
（Combat Lab / Battle View）へ届くようにする。combat-coreは無変更。

## 2. What changed

- **New: `src/combatPlaytestAnalyticsCore.ts`** — 純関数の集計モジュール。
  - `foldCombatStepEvents(previous, events)`: 1tick分のイベントを畳み込んで新しい
    analytics値を返す（copy-on-fold、前の値は不変）。
  - ユニット別: 与ダメ / 被ダメ / 与回復 / 被回復 / 撃破数 / 攻撃回数 / ヒット数 /
    回避数 / 死亡tick / 最終攻撃対象(+観測tick) / 被害者別与ダメ内訳。
  - ライブフィード: 直近 `COMBAT_ANALYTICS_RECENT_EVENT_LIMIT`(=24) 件の
    attack/heal/death エントリのリング。致死打は同一attackエントリに `lethal: true`
    を立て、deathエントリと二重表示にならない形。
  - 撃破クレジット: 同一tick内でその死亡者に最後に攻撃した者へ帰属
    （combat-coreは死亡を引き起こした攻撃の直後にdeathをpushするため正確）。
  - 回避: mechanicsReceiptsの `kind: 'dodged'` を `tick|attacker|victim` キーで
    attackイベントと照合。ダメージ0でもreceiptが無ければdodgeに数えない。
- **`src/combatCommandPlaytestCore.ts`** — セッションに `analytics` を追加、
  advance時に `foldCombatStepEvents` を呼ぶ（イベントは従来receiptsを取っていた
  同じ `stepped.events`）。snapshotのunitに `action` / `targetId` / `targetTick` /
  `stats`、トップレベルに `recentEvents` を追加。既存フィールドは全て無変更。
- **`scripts/combat_test_manifest.js`** — 新グループ `combat:playtest-analytics`。
- **`docs/generated/symbol_registry.json` / `SYMBOL_REGISTRY.md`** — 再生成。

## 3. Snapshot contract for Fable 5 (display layer)

`combatCommandPlaytestState` メッセージの `state` に追加されたもの:

```ts
state.units[i].action    // string | null — combat-coreの現在行動ラベル（例: "攻撃", "接近", "回復", "待機"）
state.units[i].targetId  // string | null — 最後に攻撃/照準した相手。攻撃対象線の描画用
state.units[i].targetTick// number | null — targetIdの観測tick。古い対象線のフェード判定用
state.units[i].stats     // CombatPlaytestUnitStats — リザルト表の1行
state.recentEvents       // CombatPlaytestLogEntry[] — 戦闘中ログフィード（古い順、最大24件）
```

`CombatPlaytestUnitStats`: `damageDealt` / `damageTaken` / `healingGiven` /
`healingReceived` / `kills` / `attacksMade` / `hits` / `dodges` /
`diedAtTick` / `topTargetId`（最多与ダメ対象、リザルト表の「主な攻撃対象」列用）。

`CombatPlaytestLogEntry`: `{ tick, kind: 'attack'|'heal'|'death', sourceId?, targetId, amount?, dodged?, lethal? }`。

表示側の想定（UIレビュー由来、実装はFable 5の裁量）:
1. 戦闘中: recentEventsを「剣士1 → 敵2 18ダメージ」形式で流すコンパクトなフィード。
2. 決着後: stats を「キャラ | 与ダメ | 被ダメ | 回復 | 撃破 | 生存」のリザルト表に。
   決着カード（現在生存ユニットを覆い隠している）をこの表を含む非遮蔽レイアウトに
   作り直すのが本命。閉じる操作も必須。
3. targetId + 座標で攻撃対象線を引く。targetTickが古い（例: 現在tick-90超）なら
   フェードまたは非表示。

数値は非整数になり得る（tick 0.033秒刻みの実数ダメージ）。表示時は丸めること。

## 4. Verification

- `npm run compile` 通過。
- 新focusedテスト `src/combatPlaytestAnalyticsCore.test.ts` 24/24
  （純関数フォールドの単体 + 実セッションでの決着到達・保存則・決定論・非破壊性）。
- Test Console plan（compile / validate.js / playtest core・host・webview adapter 3suite /
  i18n keys / combat manifest coverage / symbol registry）9/9 PASS。
- Full suiteは方針通り最終統合時へ委譲。

## 5. Findings recorded elsewhere

- combat-coreの空カタログ×mechanics_v1膠着バグ → `docs/AI_FINDINGS_INBOX.md`
  `CLAUDE-20260724-001`（P3、実運用未発現）。
- UIレビューで観測した「Command Playtest tick 0 vs Battle View tick 277」のtick
  不一致について: `CombatCommandPlaytestHost` は単一セッション・全subscriber同報
  （`broadcastState`が全員に同一snapshotを送る）であることをコードで確認したため、
  **セッションが2本走る「分裂」は起きていない**。残る候補はCombat Lab webview側の
  受信ガード（`activeStartId`不一致・`pendingPeerAdopt`未プライム時はsnapshotを
  無視する）による表示未更新だが、これはUIレビュー時の再現条件を実機で踏んでいない
  ため未確定。Fable 5がリザルトUI実装時に両パネル並置で確認するのが安い。

## 6. Out of scope

決着カードUI・リザルト表UI・対象線描画（→ Fable 5）、Adventure Statusタブの
プレイ/開発者ツール分離、射程円・状態異常表示（V2-C）、MP/TP・ZoC等のcombat-core
拡張、PR #44（Battle View foundation）とのマージ順調整。
