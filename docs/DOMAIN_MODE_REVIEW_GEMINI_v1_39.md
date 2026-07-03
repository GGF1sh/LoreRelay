# Domain Mode — Gemini コードレビュー トリアージ（v1.39.8）

> **日付:** 2026-07-03  
> **対象:** `lorerelay_3` / Domain v1.39.0–1.39.8  
> **レビュアー:** Gemini（ファイルツリー中心・多く未読）  
> **トリアージ:** Grok（ソース実読）

## 総合判定

| 判定 | 内容 |
|------|------|
| **Ship with fixes** | Domain Core は出荷品質。ただし **turn マージで `domain` が authoritative 外** のため、Commerce UI 併用時に月次コミットが落ちうる（実バグ・D3 前に修正推奨）。 |
| **Gemini P0** | 0 件（P1 を P0 と読み替えない） |
| **採用する修正** | 1 件（domain merge）+ 2 件は D3 / インフラで計画 |

---

## Findings トリアージ

### P1-1: Domain の非同期状態競合（Gemini 原文）

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | Webview から領地資源を直接消費し、ターン完了で巻き戻る |
| **実装確認** | **現 v1.39.8 では再現不可（誤検知に近い）** |
| **根拠** | D3 UI **未実装**。`webviewHandlers.ts` に domain 操作なし。変更経路は `turn_result.domainOps` → `statePatch` のみ。`pickDomainForWebview` は未配線。 |
| **確信度（Gemini）** | High → **当社 triage: Low（現行）** |

**ただし関連する実バグ（Gemini 未指摘）:**

| 項目 | 内容 |
|------|------|
| **問題** | `mergeGameStateForPersist` の `profile: 'turn'` 衝突時、`domain` は `TURN_AUTHORITATIVE_ROOT_KEYS` に**含まれない** |
| **再現** | GM ターン中に `commerce-ui` が `stateRevision` を進める → ターン完了時 conflict → **disk の古い `domain` が勝ち、`monthly_commit` が消失** |
| **重大度** | **P1（実装バグ）** — Commerce+Domain 併用キャンペーンで起きうる |
| **修正** | `domain` を turn authoritative に追加（`world` と同様）。D3 実装後は `UI_PROTECTED_ON_TURN_COMMIT` に `domain` も検討 |
| **テスト** | `test_domain_turn_merge_conflict.js` — revision 衝突下で domain が turn 側を保持 |

```typescript
// workspaceStateQueueCore.ts — 修正案
export const TURN_AUTHORITATIVE_ROOT_KEYS = [
  // ...existing...
  'domain',
  'domainSnapshotAtDepart',
  'lastDomainVisitWorldTurn',
  'domainSinceLastVisit',
] as const;
```

（drift 補助フィールドを authoritative に含めるかは実装時に精査）

---

### P1-2: キュー分割 Split Brain（Gemini 原文）

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | `game_state` / `world_state` 独立キューで片方だけ失敗 → 乖離 |
| **実装確認** | **設計上のリスクは妥当**（`workspaceStateQueue.ts` にサーキットブレーカーなし） |
| **新規性** | Domain 追加起因ではなく **Campaign P0 PR3（キュー分割）からの既知トレードオフ** |
| **現状** | `syncFileQueueCore.ts` は同期 FIFO のみ。`test_sync_file_queue_core.js` は正常系のみ |
| **重大度** | **P1（インフラ・横断）** — Domain 専用ではない |
| **対応タイミング** | D3 前必須ではないが、**1.40 前後の横断 hardening** として §20 に残す |
| **確信度（Gemini）** | High（未読）→ **当社 triage: Medium（設計リスク実在、頻度は低）** |

---

### P2-1: インベントリ同種アイテム（Gemini 原文・推測）

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | 同一プロパティの配列要素削除が壊れる |
| **実装確認** | v1 スキーマは `status.inventory: string[]`。衝突時は **配列全体を disk または turn で置換**（`mergeTurnStatusOnConflict`） |
| **限界** | 同一文字列が2つある場合は区別不可 — **スキーマ上の既知制約** |
| **重大度** | **P2（将来オブジェクト inventory 化時）** — 現行 string[] では Gemini の「2本の剣」シナリオは未サポート |
| **テスト** | `test_state_merge_inventory_race.js` は conflict 時 disk 優先を検証済み |
| **確信度（Gemini）** | Medium → **当社 triage: Low（現スキーマ）** |

---

### P2-2: Replay Export 非同期サニタイズ（Gemini 原文）

| 項目 | 判定 |
|------|------|
| **Gemini 主張** | エクスポート中に state が変わりスナップショットが混ざる |
| **実装確認** | `replayExport.ts` は `getGameEntryHistory()` の**生参照**を同期で `buildReplayDocument`。`game_state.domain` はエクスポート対象外 |
| **リスク** | エクスポート処理が長い場合、entries 配列の途中変化は理論上あり得る（Domain とは無関係） |
| **重大度** | **P2（横断・低頻度）** |
| **確信度（Gemini）** | Medium → **当社 triage: Low–Medium** |

---

## Security Checklist（Gemini §3）— 当社コメント

| 項目 | Domain 関連 |
|------|-------------|
| Webview payload leak | **`domain` は webview 未配線** — D3 で `gameStateWebviewSanitize` 必須（Gemini「未確認」は D3 前として正しい） |
| Trust / replay 一貫性 | Domain は trust 非連動。replay に domain 未 pick（§20-E 残） |
| その他（XSS, path, Remote Play） | Domain スコープ外。別レビュー対象 |

---

## Gemini Positive Notes — 同意

- Core/Host 分離（`domain*Core.ts`）
- `replayExportSanitizeCore` 分離
- `test_domain_balance_core.js` / harness
- `test_state_merge_inventory_race.js` 追加の意図

---

## 採用する Patch Plan（優先順）

| PR | 内容 | Ver 目安 |
|----|------|----------|
| **PR-A** | `domain`（+ drift 補助キー）を `TURN_AUTHORITATIVE_ROOT_KEYS` に追加 + merge conflict テスト | **✅ 1.39.9** |
| **PR-B** | D3 着手時: `UI_PROTECTED_ON_TURN_COMMIT` に `domain` + webview sanitize | **1.40.0** |
| **PR-C** | キュー サーキットブレーカー（横断）— **v1.59.0 で edge case テスト先行**（`test_split_brain_queue_edge_cases.js`） | **1.40.x**（breaker 本体は未実装） |
| **PR-D** | Replay export `structuredClone(entries)` | 任意 |

---

## §20 への反映（推奨）

| 優先 | 内容 |
|------|------|
| **P0（Gemini 前）** | PR-A: turn merge で domain authoritative |
| P0 | D3 UI（従来どおり） |
| P1 | キュー circuit breaker（横断） |
| P2 | Replay snapshot |

---

## 依頼者向け一行

Gemini は **ファイル未読の推測が多い**が、「Domain UI 競合」の形は **現行では誤検知**。**本当に直すべきは** Commerce 併用時の **`domain` turn-merge 落ち**（コードで確認済み）。Split Brain は横断インフラ課題として妥当。