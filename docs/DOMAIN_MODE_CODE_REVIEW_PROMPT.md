# Domain Mode コードレビュー用プロンプト（他 AI 向け・コピペ用）

> **目的:** v1.39.0〜v1.39.8 の Domain Mode（領地運営）実装を、別の AI（ChatGPT / Claude / Gemini / Codex 等）にレビューさせる。  
> **対象リポジトリ:** `C:\AI\text-adventure-vsce`  
> **現行版:** `package.json` **1.39.8**（`CHANGELOG.md` [1.39.8] まで）  
> **設計正本:** `docs/DOMAIN_MODE_DESIGN.md`（§12 フェーズ · §20 次アクション）

---

## 依頼者メモ（人間向け）

- **実装は一旦ストップ。** 次マイルストーンは **D3 UI（1.40.0 想定）** — 本レビューでは **未実装であることが期待仕様**。
- Grok が v1.39.7 で 1 回 hardening 済み。**独立した第三者レビュー**を求める。
- レビュー結果は表形式（P0/P1/P2）で返してほしい。修正案はファイル名＋関数名まで具体化。

---

## レビュアーへのプロンプト（全文コピー）

````
あなたは LoreRelay（VS Code 拡張・ローカルファースト AI GM UI）のシニアコードレビュアーです。
**Domain Mode（D1–D5 サブトラック、v1.39.0–1.39.8）** の実装をレビューしてください。

## 背景（30 秒）

- Campaign モードで任意 ON の「領地運営」レイヤー。太閤立志伝風の **月次方針は GM が `turn_result.domainOps` で明示コミット**。
- 数値・イベント抽選は **決定論 Core**、GM/LLM は narration 専任（LW と同型）。
- `enableDomainMode` は **既定 OFF**。Parlor / In-World では domain を変更しない設計。

## 必読ドキュメント（この順）

1. `docs/DOMAIN_MODE_DESIGN.md` — §1.3 黄金律 · §1.4 リスク · §9–§10 · §12 フェーズ · §20 次アクション
2. `CHANGELOG.md` — `[1.39.0]` 〜 `[1.39.8]`
3. `docs/VERSION_TRUTH.md` — 版の正本
4. `docs/PHASE_NAMING.md` — D1–D5 サブトラック定義
5. `docs/WORLD_TIME_PASSAGE_IDEA.md` §C — 三層時計（月次コミットと `elapsedWorldTurns`）

## レビュー対象ファイル（優先度順）

### P0 — Core（vscode/fs なし）

| ファイル | 役割 |
|----------|------|
| `src/domainCore.ts` | stats · monthly actions · events · `parseDomainOps` · `validateDomain` · tiers |
| `src/domainPromptCore.ts` | compact/standard/full GM ブロック（§10.3） |
| `src/domainDriftCore.ts` | 留守中ドリフト · since-last-visit delta |
| `src/domainRegionDriftCore.ts` | depart/return snapshot · drift apply |
| `src/domainTurnOpsCore.ts` | `domainOps` → `game_state.domain` |
| `src/domainOfficerBondCore.ts` | 家臣 = playerBond（別 loyalty なし） |
| `src/domainCouncilCore.ts` | 月次評定 Council 行（commit のみ） |
| `src/domainLedgerCore.ts` | treasury vs credits 境界 |

### P0 — Host 配線

| ファイル | 役割 |
|----------|------|
| `src/domainBridge.ts` | GM プロンプト注入 · tier · council · since-last-visit |
| `src/domainTurnOps.ts` | rules/registry 読み込み · bond context |
| `src/statePatch.ts` | `applyDomainTurnOps` · `applyDomainTravelDrift` · **順序**（elapsed → drift → domainOps） |
| `src/gmPromptBuilderCore.ts` | domain チャンク priority 67 |
| `src/agenticGmCore.ts` | Referee `domainOps` 契約 |
| `src/chronicleCore.ts` | `kind: 'domain'` |

### P1 — テスト・チューニング

| ファイル | 役割 |
|----------|------|
| `scripts/test_domain_core.js` | parse/validate/tier/event weights |
| `scripts/test_domain_prompt_core.js` | compact tier 行数 |
| `scripts/test_domain_turn_ops.js` | turn_result 適用 |
| `scripts/test_domain_since_last_visit.js` | 留守ドリフト |
| `scripts/test_domain_officer_bond_core.js` | bond · appoint ゲート |
| `scripts/test_domain_council_core.js` | council commit-only |
| `scripts/test_domain_ledger_core.js` | ledger 行 |
| `scripts/test_domain_balance_core.js` | 12ヶ月戦略 assert |
| `scripts/domain_balance_harness_lib.js` | harness 共有ロジック |
| `scripts/domain_balance_harness.js` | `npm run domain:balance` |

### P2 — 設定・UI（部分のみ）

| ファイル | 備考 |
|----------|------|
| `src/gameRules.ts` | `enableDomainMode` · `domainMonthDays` · `domainMonthlyActions` |
| `webview/index.html` + `webview/modules/70-game-rules.js` | チェックボックスのみ。**World タブ領地パネルは未（D3）** |
| `src/domainBridge.ts` `pickDomainForWebview` | **定義のみ・webview 未配線** |

## アーキテクチャ鉄則（違反は P0）

1. **Core に `vscode` / `fs` が無いこと**（`domain*Core.ts`）
2. **`statePatch` 直書き `/domain/*` 禁止** — 変更は `turn_result.domainOps` のみ
3. **会話ターン ≠ 経過月** — `domain` は `monthly_commit`（+ appoint/dismiss）でのみ更新
4. **GM プロンプト注入** — compact 既定、full + Council は commit 時のみ（§10.3）
5. **留守ドリフト** — リージョン出入り時 · `elapsedWorldTurns` **後**に drift 適用
6. **since-last-visit** — ワンショット消費（領地内移動で clear）
7. **家臣** — Registry + playerBond。`appoint_officer` は registry 外を拒否
8. **allowlist** — region id · event id · officer npcId のサニタイズ（v1.39.7 hardening）

## 重点レビュー観点（Grok 済みだが再検証してほしい）

| # | 観点 | 確認箇所 |
|---|------|----------|
| 1 | `applyTurnResultToGameState` と `processTurnResult` の **drift 順序一致** | `statePatch.ts` |
| 2 | `parseDomainOps` / `validateDomain` の **注入・不正 id** | `domainCore.ts` |
| 3 | `pendingEvents` / `lastEventId` が **既知イベント id のみ**か | `domainCore.ts` |
| 4 | GM プロンプトに **生の flags / 未サニタイズ label** が漏れないか | `domainBridge.ts` · `domainPromptCore.ts` |
| 5 | 留守ドリフト **二重適用・キャップ表示の正直さ** | `domainDriftCore.ts` · `domainRegionDriftCore.ts` |
| 6 | `refreshDomainSnapshotOnCommit` が **全 domainOps** で走るか | `domainTurnOpsCore.ts` |
| 7 | Commerce 併用時 **treasury vs credits** の二重帳簿 | `domainLedgerCore.ts` |
| 8 | **決定論** — 同一 seed で `rollDomainEvent` が安定か | `domainCore.ts` |
| 9 | **In-World / Parlor** で domain が変更されない契約 | `statePatch` 経路全体 |
| 10 | webview に **domain 全フィールド**が漏れていないか（D3 前のリスク） | `pickDomainForWebview` · sanitize 未配線 |

## 既知の未実装（バグではない）

- **D3** World タブ領地 UI · 行動チップ · `pickDomainForWebview` 配線
- **D4 残** — `commerce` stat → `tickMarketRecovery` ボーナス
- **`test_chronicle_core.js`** の `kind: 'domain'` 専用 assert
- **replay export** への domain pick

## チェックリスト（各項目 OK / NG / 要確認）

1. Core/Host 分離
2. `enableDomainMode` OFF 時に prompt / ops / drift がすべて no-op
3. `monthly_commit` 空 actions 拒否
4. officer 最大 5 · pending 最大 8 · stat/resource clamp
5. プロンプト tier（minimal=3行 · standard · full on commit）
6. Council は commit 時のみ最大 5 行
7. region 離脱→再訪で drift + GM since-last-visit 行
8. bond `rival` 以下 → `officer_discontent` 重み / flag
9. `npm test` 108/108 · `npm run domain:balance` 実行可
10. 仕様外の自動パース（narration → domainOps）が無い

## 出力フォーマット（厳守）

### サマリー（3〜5 行）
全体評価: **Ship / Ship with fixes / Block** と最大リスク 1 件。

### 重大（P0）— マージ・タグ前に必須
| ID | ファイル:行（可能なら） | 問題 | 推奨修正 |
|----|-------------------------|------|----------|

### 中程度（P1）
（同表）

### 軽微（P2）/ 提案
箇条書き可。

### 良い点
2〜5 個。具体的に。

### 手動受け入れテスト案
`enableDomainMode: true` + `game_state.domain` ありで再現手順 3〜5 個。

### 未確認・要人間判断
静的解析では断定できない項目。

## 禁止事項

- D3 UI の大規模実装提案でレビューを終えない（§20 参照のみ）
- 存在しないファイル・関数を引用しない（引用前に grep で実在確認）
- 「おそらく動く」で P0 を見逃さない
- 仕様外の narration 自動パースを推奨しない

## 実行してほしいコマンド（可能なら）

```powershell
cd C:\AI\text-adventure-vsce
npm run compile
npm test
npm run domain:balance
```

結果の数字（例: 108/108）をサマリーに含めること。
````

---

## バージョン別差分メモ（レビュアー向け）

| Ver | 要点 |
|-----|------|
| **1.39.0** | D1 Core · D1.5 turn_ops · D2 prompt/bridge · Game Rules チェックボックス |
| **1.39.1** | §1.4 イベント効果 · prompt tier · ledger · balance test |
| **1.39.2** | §8 D1b 季節 · イベント重み · `festival_gathering` / `officer_discontent` |
| **1.39.3** | §9.1 留守ドリフト · statePatch region hook · hardening 第1弾 |
| **1.39.4** | §9.2 D5 officer bonds · registry appoint gate |
| **1.39.5** | §9.3 monthly council · `lastMonthlyActions` |
| **1.39.6** | §10.3 compact prompt（通常会話 3 行） |
| **1.39.7** | レビュー hardening — allowlist · reapply drift 順序 · council newline |
| **1.39.8** | §14 `domain_balance_harness_lib` · `npm run domain:balance` |

---

## Grok セルフレビューで直した項目（再検証歓迎）

| 項目 | 修正 Ver |
|------|----------|
| drift を `elapsedWorldTurns` 後に適用（本線 + reapply） | 1.39.3 / 1.39.7 |
| since-last-visit ワンショット消費 | 1.39.3 |
| `sanitizeDomainPromptLabel` · event/region allowlist | 1.39.7 |
| `parseDomainOps` officer id サニタイズ | 1.39.7 |

---

## レビュー結果の返却先

レビュー完了後、依頼者は次のいずれかに貼る:

- `AI_SHARED_LOG.md` に「Domain 外部レビュー YYYY-MM-DD」セクション
- 新規 `docs/DOMAIN_MODE_REVIEW_<AI名>_v1_39.md`（表形式のまま）

**判定基準:**

- P0 が 0 件 → D3 着手可（Ship / Ship with fixes）
- P0 が 1 件以上 → 修正リストを `docs/DOMAIN_MODE_DESIGN.md` §20 に追記してから D3

---

## 関連

- 設計: `docs/DOMAIN_MODE_DESIGN.md`
- Living World レビュー同型: `docs/CODE_REVIEW_PROMPT_LIVING_WORLD.md`
- フェーズ命名: `docs/PHASE_NAMING.md` Domain 表