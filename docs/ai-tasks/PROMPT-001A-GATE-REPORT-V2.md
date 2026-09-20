# Gate Report V2: PROMPT-001A — Candidate / Preview Purity（merge-safe staging 改訂版）

| Field | Value |
|:---|:---|
| **Gate Owner (this run)** | Claude Opus 4.8 — Architecture Gate Owner 代理（ChatGPT 5.5/5.4 不在時の代行） |
| **As-of Commit (current main HEAD)** | `eeb9f4309f2eba671c950e536c9a46b3404b2f1c` |
| **Code baseline** | src/ は `3eaae25`(V1解析時) 以降 **未変更**。`6af4bc5`→`eeb9f43` の差分は docs のみ。 |
| **Package version** | `1.77.15` |
| **Supersedes** | [`PROMPT-001A-GATE-REPORT.md`](PROMPT-001A-GATE-REPORT.md)（V1, 差戻し済み） |
| **Canonical inputs** | [Adversarial Review](PROMPT-001A-ADVERSARIAL-REVIEW.md)（Gemini 3.1 Pro）/ [Integrator Disposition](PROMPT-001A-INTEGRATOR-DISPOSITION.md）/ [RUNTIME-002A](RUNTIME-002A.md) |
| **Verdict** | **READY_FOR_ADVERSARIAL_REVIEW** |

> このV2は、V1のバグ診断の再提出ではない。中心課題は **「candidate/preview を純化すると Chronicle Recap / World Change Summary が毎ターン再注入される退行が起きうる」問題を、PROMPT-001A 単独で main へ入れても安全な形で解決すること** である。

---

## 1. Current Main Snapshot

- **HEAD**: `eeb9f43`（= Chief Integrator 同期SHAと一致、検証済み）。
- **package version**: `1.77.15`。
- **V1以降のコード変更**: なし。`src/gmPromptBuilder.ts` / `gmPromptBuilderCore.ts` / `gameStateSync.ts` / `turnResultFallback.ts` / `statePatch.ts` は V1解析時点と同一（間の6コミットは全て `docs:`）。したがってV1の実コード追跡は現HEADでも有効。
- **関連構造の再確認（現HEAD）**:
  - `buildGmPromptChunkSpecsWithMeta` は **production と inspector の両方**から呼ばれる共有 candidate builder。
    - production: `buildGmPromptContext`（[gmPromptBuilder.ts:1428-1434](../../src/gmPromptBuilder.ts)）
    - inspector: `buildGmPromptBreakdown`（[gmPromptBuilder.ts:1236](../../src/gmPromptBuilder.ts)）
  - 当該 builder 内で消費副作用を持つのは **2 chunk のみ**: `chronicle`（L1377, `consumeChronicleRecapContext`）と `worldChangeSummary`（L1416, `consumeWorldChangeSummaryContext`）。
  - leaf には既に peek/consume の二重化が存在: `buildChronicleRecapContext(consume:boolean, policy)`（consume=false で marker 不前進）、`peekWorldChangeSummaryContext` / `consumeWorldChangeSummaryContext`。**純化の部品は既にコード内に存在する。**
  - `applyPromptChunkBudgetRecords`（[gmPromptBuilderCore.ts:611-648](../../src/gmPromptBuilderCore.ts)）は `id` + `finalText` を持つ record 配列を返す → **selection 後に「どの consumable が生き残ったか」は id で識別可能**（本判断の重要事実。後述）。

---

## 2. V1 Failure Summary（生き残り / 破綻）

| V1の主張 | 判定（Adversarial + Chief確定） |
|:---|:---|
| Candidate/Preview purity が必要（build時消費 → eviction損失） | **SURVIVES**（正しい） |
| Budgeter は chunk identity を保持すべき | **SURVIVES**（正しい） |
| Inspector が消費副作用を持つ | **SURVIVES**（CLAUDE-20260705-001 として PROMPT-001A に吸収） |
| `onAcceptedTurn` が正しい Accepted 境界 | **FAILS** — `markTurnResultHandled()` は `processTurnResult()`（検証・canonical commit）の**前**に発火。Accepted 境界を誤認。 |
| at-least-once retry は安全 | **FAILS** — 現行 dedupe が内部失敗時に retry を恒久抑止（`RUNTIME-002A` 領域）。 |
| chunk-id だけの receipt で十分 | **FAILS** — delivery時に固定する immutable source token が必要（stale ACK race）。 |
| 1タスクに provider/acceptance/consumption を同梱 | **REJECTED** — 原子分割（RUNTIME-002A / 001A / 001C）へ。 |

**結論**: 診断は正しいが、契約が壊れた Accepted 境界に依存し、消費実装まで抱え込みすぎた。V2 は **候補/プレビュー純化と staging のみ**に狭める。

---

## 3. Accepted Adversarial Amendments（V2で確定的に受け入れる補正）

1. **Accepted boundary は PROMPT-001A から除去。** `onAcceptedTurn` / `markTurnResultHandled()` の正しさ・順序は `RUNTIME-002A` が所有。V2 は Accepted 境界を一切定義・実装しない。
2. **RUNTIME-002A 分離。** handled/dedupe ordering、`lastProcessedTurnHash`、`processTurnResult(false)` の失敗伝播は 001A では触れない（Do Not Touch）。
3. **immutable ACK token は PROMPT-001C 所有。** delivery-time に固定する source token（例 `sourceTurn`）を用いた accepted-time consumption は C。V2 は receipt を作らない。
   - Chief Correction D を反映: 契約は `currentTurn === sourceTurn` の等価チェックではなく「**delivered token（例 10）だけを `markWorldChangeSummaryInjected(10)` で前進、current state から再計算しない**」。11〜12 は未消費で残す。ただしこの wiring は C。
4. **RUNTIME-002A の Runtime バグ（Correction 1）を 001A 内で直さない。** hash を handled 扱い→callback→`processTurnResult()`→false→caller が失敗扱いしない、の経路は RUNTIME-002A へ委譲。

---

## 4. Merge-safe Staging Decision

### 採用: **Option C（Pure shadow candidate path + legacy production authority）** — 精緻化版

**方式:**

- `buildGmPromptChunkSpecsWithMeta`（共有 candidate builder）に **purity フラグ**（例 `{ consumeMarkers: boolean }`、既定 = legacy=true）を追加する。
- `chronicle` / `worldChangeSummary` の consider 呼び出しのみ、フラグに従い **peek 変種（消費なし）** か **consume 変種（legacy）** を選ぶ。他 chunk は不変。
- **inspector 経路**（`buildGmPromptBreakdown` の L1236 呼び出し）は **pure（consumeMarkers=false）** を渡す → Inspector/Preview は消費しない。
- **production 経路**（`buildGmPromptContext`）は **legacy（consumeMarkers=true）** のまま → 現行と**バイト等価**、消費タイミング不変。

すなわち:

```
             ┌─ buildGmPromptContext (production)  ── consumeMarkers=true  … LEGACY authority（現行と同一、まだ本番権限）
shared build ┤
             └─ buildGmPromptBreakdown (inspector) ── consumeMarkers=false … PURE shadow path（副作用ゼロ、まだ本番権限なし）
```

**この方式が満たすもの:**
- ✅ Inspector/Preview purity（CLAUDE-20260705-001 解消）。
- ✅ **再利用可能な pure candidate path** を確立（C がそのまま production authority に昇格させる対象）。
- ✅ **PROMPT-001A 単独で完全に merge-safe**: production の common path は現行とバイト等価 → repeat-injection 退行はゼロ（production は依然 legacy 消費するため二重注入しない）。
- ✅ **新規 temporary code を一切作らない**。「temporary」なのはコードではなく *状態*（legacy が本番権限を持ち続ける）。C は「フラグを pure 側へ倒し、marker 前進を accepted callback へ移し、legacy consume 呼び出しを削除」するだけ。→ 永久化リスク最小（criterion 6）。
- ✅ Touch Set は `src/gmPromptBuilder.ts` **1ファイルのみ**（criterion 5）。
- ✅ 親バグを DONE に見せかけない: production の early-consumption（eviction損失・provider失敗損失）は **意図的に legacy として残す**ことを明示（criterion 7、§10・§本文で loud disclosure）。

### 却下: Option A（Temporary compatibility ACK after selection）

- A は candidate build を純化した上で、**selection 後に生き残った consumable を production で ACK** する。`applyPromptChunkBudgetRecords` の id 付き record により *技術的には可能*。
- しかし A は **production の消費権限ロジックを PROMPT-001A に再導入する**。これは V1 が差し戻された「provider/acceptance/consumption を 001A に詰め込む」スコープ膨張の再来。
- さらに A の「生き残りを ACK」は **immutable source token を欠く退化した receipt** であり、Adversarial の Fatal Scenario B（stale ACK race: provider 生成中に world_turn が 10→12 へ進むと 12 を誤 ACK）と**同じ欠陥を production に出荷**してしまう。安全な delivery-time token 固定は本質的に **PROMPT-001C の receipt 問題**であり、A に置くと C の責務を侵食する（Chief 指摘の懸念そのもの）。
- 結論: A は「known-racy な部分消費」を早期に本番投入する。却下。

### 却下: Option B（Atomic deployment with PROMPT-001C）

- B は pure path を作るが production authority を切り替えず、**C と揃って初めて** 切替（原子デプロイ）。
- 欠点: A（001A）単独 merge 時の production behavior を「legacy 維持」と定義すれば実質 C-shadow に一致する。一方で「C と原子的に揃える」制約を課すと **1タスク=1ブランチ原則に反する A↔C の統合カップリング**が生じ、criterion 1（PROMPT-001A 単独 merge-safe）を損なう。
- C-shadow は同じ安全性を **独立 merge** で達成するため厳密に上位。却下。

### Option C の成立性検証（Chief 要請: 盲信せず現行コードで確認）

- **二重build**: production と inspector は現状も独立に build している（既存挙動）。C は inspector 側を peek にするのみ。二重build 自体は CLAUDE-20260705-003 として **PROMPT-001C** が receipt で解消予定。V2 は悪化させない。
- **path divergence（正しさ）**: production `buildGmPromptContext` は無変更 → 現行と完全同一。分岐は「inspector が peek」のみで、副作用の *除去* 方向。正しさの分岐なし。
- **legacy wrapper 副作用**: 変更は builder への flag スレッドと inspector 呼び出し1箇所のみ。既定 legacy=true のため production は不変。副作用注入なし。
- **future C 移行**: C は `buildGmPromptContext` を pure 側へ倒し、selection/delivery で immutable token 付き receipt を捕捉、accepted callback（RUNTIME-002A 提供）で消費、legacy consume 呼び出しを削除。V2 が作る pure path がそのまま C の昇格対象。安全に成立。

→ **Option C は現行コードで安全に成立する。採用。**

---

## 5. PROMPT-001A V2 Contract（Aだけが所有する不変条件）

### 5.1 Pure Candidate Path（定義）
purity フラグを false にした candidate build（= pure path）は、以下を**行わない**:
- canonical state write 禁止
- durable ACK marker 更新禁止（`markWorldChangeSummaryInjected` / `markChronicleInjected` を呼ばない）
- `chronicleSessionPending` clear 禁止
- provider 呼び出し禁止
- 外部プロセス起動禁止

**スコープ限定（over-purify 禁止）**: 本契約は消費副作用を持つと確認済みの **`chronicle` と `worldChangeSummary` の 2 chunk のみ**を対象とする。他 chunk の既存 read/parse cache（例 `loadWorldState` の parse-warning cache 等）は消費ではないため純化対象外。無制限な純化はしない。

### 5.2 Preview / Inspector Isolation
`buildGmPromptBreakdown` および `postPromptContextToWebview` 経由の Preview path は、`worldChangeSummary` / `chronicle` を**消費しない**（pure path を使用）。
- **PROMPT-001B 全体は吸収しない**。V2 が扱うのは今回確認済みの当該 2 consumable の副作用のみ。Inspector の他の read-only 契約・表示精度は 001B が所有。

### 5.3 Legacy Authority During Staging
- **Legacy authority（本番権限あり）**: production `buildGmPromptContext` → consume 変種。現行どおり build 時に marker 前進 / pending clear。**staging 中は維持**。
- **Shadow（本番権限なし）**: pure candidate path。inspector が使用。marker を一切動かさない。
- **まだ本番権限を持たない**: accepted-time consumption、delivery receipt、immutable ACK token（全て C）。

### 5.4 Authority Switch Point（001A は switch を実装しない）
`PROMPT-001C` が以下を完成させた時点で legacy → accepted-consumption へ切替可能:
1. `RUNTIME-002A` が canonical commit 成功後の truthful Accepted 境界を提供済み、かつ
2. C が selection/delivery で **immutable source token 付き receipt** を捕捉、かつ
3. C が消費を Accepted 境界かつ delivered token のみに限定。

切替操作（`buildGmPromptContext` を pure へ倒す / legacy consume 呼び出し削除 / marker 前進を accepted callback へ移設）は **C が実施**。001A は行わない。

### 5.5 Parent Completion Semantics（DONE の意味）
**PROMPT-001A が DONE でも「早期消費問題全体が解決済み」を意味しない。**

| PROMPT-001A DONE で保証されるもの | C まで未解決（意図的残存） |
|:---|:---|
| Inspector/Preview が marker/pending を前進させない | production の eviction 損失（build時消費→evict）※ |
| 副作用ゼロの pure candidate path が存在し inspector が使用 | production の provider 失敗時 early-consumption ※ |
| production common path が現行とバイト等価（退行なし） | accepted-time consumption / immutable ACK / delivery receipt |
| Touch Set が `gmPromptBuilder.ts` に限定 | `chronicleSessionPending` の durable parity（CLAUDE-002 → C）|

※ 重要: **V2（Option C）は production の headline バグ（eviction 損失）を production では未修正のまま残す。** これは意図的で、正しい修正には immutable token 付き receipt（= C）が必要なため。§10 に明記。

---

## 6. Current → Staged → Final Execution Shape

```
── CURRENT ────────────────────────────────────────────────
buildGmPromptContext (prod) ─┐
                             ├─> buildGmPromptChunkSpecsWithMeta
buildGmPromptBreakdown(insp) ┘        ├─ chronicle          → consumeChronicleRecapContext → markChronicleInjected + clearPending (DISK WRITE)
                                      └─ worldChangeSummary  → consumeWorldChangeSummaryContext → markWorldChangeSummaryInjected (DISK WRITE)
                                   … その後 evictPromptChunksByBudget（消費の後に脱落判定）
   ⇒ inspector も消費 / evict されたら恒久損失 / provider送信・Accepted の前に消費

── AFTER PROMPT-001A (Option C-shadow) ─────────────────────
buildGmPromptChunkSpecsWithMeta(consumeMarkers=true)  ← buildGmPromptContext (prod)   … LEGACY（現行と同一、まだ early-consume）
buildGmPromptChunkSpecsWithMeta(consumeMarkers=false) ← buildGmPromptBreakdown (insp) … PURE（peek、副作用ゼロ）
   ⇒ Inspector/Preview 非消費 / pure candidate path 確立 / production 挙動は不変（merge-safe alone）
   ⇒ production の eviction損失・provider失敗損失は legacy として意図的に残存

── AFTER RUNTIME-002A + PROMPT-001C ────────────────────────
RUNTIME-002A: canonical commit 成功後の truthful Accepted 境界 / retry 抑止解消
PROMPT-001C : buildGmPromptContext を pure へ切替
              selection→delivery で immutable source token 付き receipt 捕捉
              消費(markWorldChangeSummaryInjected/markChronicleInjected/clearChronicleSessionPending)を
                「Accepted かつ delivered token のみ」に限定
              legacy consume 呼び出し削除
   ⇒ eviction損失・provider失敗損失が retryable に / 早期消費問題 完全解決
```

---

## 7. Exact Scope and Touch Set

**In Scope（実装AIが触ってよい範囲）**
- `src/gmPromptBuilder.ts` のみ:
  - `buildGmPromptChunkSpecsWithMeta`（および必要なら `considerPromptChunk`）へ purity フラグを追加。
  - `chronicle` / `worldChangeSummary` の 2 consider 呼び出しをフラグで peek/consume 切替。
  - `buildGmPromptBreakdown`（L1236 の呼び出し）を pure モードへ。
  - `buildGmPromptContext` は legacy（consume）を明示的に指定（挙動不変）。

**追加ファイルは正当化が必要**（現状 001A では不要と判断）。

**Out of Scope / Do Not Touch**
- `RUNTIME-002A` の解決、`lastProcessedTurnHash`、`markTurnResultHandled`、final Accepted boundary
- provider delivery semantics、immutable ACK token wiring、delivery receipt（C）
- `gmPromptBuilderCore.ts` の budgeter アルゴリズム、`contextEngineBudgeterCore.ts`
- `gameStateSync.ts` / `turnResultFallback.ts` / `statePatch.ts`
- provider runner（`gmBridgeRunner.ts` / `agenticGmRunner.ts`）
- Context Engine P2、State Orchestrator、multi-ledger atomicity、コード実装（本Gateは設計のみ）

---

## 8. Acceptance Criteria（検証可能）

1. pure path で candidate build を実行後、`world_state.json` の `lastInjectedWorldChangeSummaryTurn` / `lastInjectedChronicleTurn` が不変。
2. pure path で candidate build を実行後、in-memory `chronicleSessionPending` が不変。
3. `buildGmPromptBreakdown` / `postPromptContextToWebview` を任意回数呼んでも marker・pending が不変（Inspector isolation）。
4. production `buildGmPromptContext` の出力文字列が現行と同一（common path バイト等価; 回帰なし）。
5. production `buildGmPromptContext` 実行時の marker 前進タイミング・値が現行と同一（legacy authority 維持の証明）。
6. purity フラグは `chronicle` / `worldChangeSummary` の 2 chunk のみに作用し、他 chunk の出力・順序に影響しない。
7. `src/gmPromptBuilder.ts` 以外のファイル（特に provider runner / TurnResult acceptance path / budgeter core）が変更されていない（構造チェック）。
8. `markWorldChangeSummaryInjected` / `markChronicleInjected` / `clearChronicleSessionPending` の呼び出し元が **legacy production path のみ**であり、pure path・inspector から到達不能（構造/grep）。

---

## 9. Required Tests（列挙のみ・コード不可）

1. candidate purity: pure build 実行後に markers 不変。
2. build×N idempotent: pure build を複数回呼んでも markers / pending 不変。
3. inspector isolation: `postPromptContextToWebview` 経由で markers / pending 不変。
4. legacy parity: production `buildGmPromptContext` の出力・marker 前進が現行スナップショットと一致。
5. flag scope: purity フラグ切替が `chronicle` / `worldChangeSummary` 以外の chunk に影響しないこと。
6. pending non-clear on pure path: pure build が `chronicleSessionPending` を clear しないこと。
7. structural: 001A が provider runner / acceptance / budgeter core を変更しないこと（差分範囲チェック）。
8. staging behavior: pure path のみでは（legacy 不在を仮定した shadow 実行で）非 evicted consumable が **消費されない**ことを確認し、production authority が legacy 側にあることを明示的に固定するテスト。

---

## 10. Residual Risks（001A後も意図的に残す既知リスク・隠さない）

- **R1（headline・重大）: production の early-consumption は未修正。** Option C は production の消費を legacy のまま残すため、**eviction 損失（build時消費→budget脱落で恒久損失）と provider 失敗時 early-consumption の両方が production に残存**する。PROMPT-001A DONE は「早期消費問題解決」を意味しない。完全解決は `RUNTIME-002A` + `PROMPT-001C`。
- **R2: Inspector の表示順序アーティファクト。** runner では production build（消費）が inspector build より先に走るため、pure な inspector peek は既に消費済みの当該 2 consumable を「不在」と表示しうる（実際の prompt には含まれていた）。これは現行の `sections`（既に peek）でも存在する既存挙動で、V2 で悪化しない。Inspector 表示精度は `PROMPT-001B` 領域、Out of Scope。
- **R3: `chronicleSessionPending` の durable parity 未解決（CLAUDE-20260705-002）。** pure path は pending を clear しないが、production legacy は依然 build 時に clear する。durable/in-memory 非対称の恒久修正は `PROMPT-001C`。
- **R4: Accepted 境界は依然 false。** `markTurnResultHandled()` が canonical commit 前に発火する問題は `RUNTIME-002A` 未着手のため残存。001A は関与しない。

---

## 11. Dependency Impact

| Task | 判定 | 根拠 |
|:---|:---|:---|
| `RUNTIME-002A` | **前提（並行可・独立）** | truthful Accepted 境界を提供。001A とは Touch Set が異なり（`gameStateSync`/`turnResultFallback`/`statePatch` vs `gmPromptBuilder`）独立に進行可。C の前に必要。 |
| `PROMPT-001B` | **UNBLOCKED / 部分先行** | 001A が当該 2 consumable の inspector 消費を解消。001B は Inspector 全般の read-only 契約・表示精度（R2 含む）を担い、吸収されず残る。 |
| `PROMPT-001C` | **BLOCKED until (RUNTIME-002A ∧ PROMPT-001A ∧ PROMPT-001B)** | 001A の pure path を production authority へ昇格。RUNTIME-002A の Accepted 境界に消費を接続。immutable ACK token / receipt / pending parity / 二重build 解消（CLAUDE-002/003, GEMINI-002）を所有。 |
| `PROMPT-001D2` | **BLOCKED until A/B/C** | Category Budgeter shadow 統合は selected/delivered identity（C の receipt）に依存。変更なし。 |

依存順序: `RUNTIME-002A` →（Accepted 境界）／ `PROMPT-001A` →（pure candidate path）／ `PROMPT-001B` →（Inspector read-only）→ **`PROMPT-001C`**（receipt + accepted consumption + authority switch）→ `PROMPT-001D2`。

---

## 12. Gate Verdict

## ✅ READY_FOR_ADVERSARIAL_REVIEW

**根拠:**
- Adversarial（Gemini 3.1 Pro）と Chief Integrator の全補正を反映し、Accepted 境界・immutable ACK・receipt を 001A から除去、`RUNTIME-002A` / `PROMPT-001C` へ正しく委譲した。
- 中心課題（純化による repeat-injection 退行）を **Option C（pure shadow + legacy production authority）** で解決。**PROMPT-001A 単独で main へ merge しても production はバイト等価で退行ゼロ**、かつ Inspector purity を達成、C への authority 移行点を明示した。
- 新規 temporary code を作らず（criterion 6）、Touch Set を `gmPromptBuilder.ts` 単独に限定（criterion 5）、parent バグの false-DONE を §5.5・§10 で明示的に否定（criterion 7）。

**Adversarial Reviewer（Gemini 3.1 Pro）への申し送り（攻撃してほしい点）:**
1. **R1 の受容可否**: production の eviction 損失を C まで残す判断は妥当か。「純化のたびに部分修正を本番投入」より「legacy 維持 + 原子的 authority switch」が安全という前提を攻撃せよ。
2. **purity フラグ機構の是非**: 共有 builder に flag を通す設計が、意図せず production を純化してしまう経路（デフォルト値・呼び出し漏れ）を持たないか。
3. **R2 の順序アーティファクト**が、単なる表示問題を超えて誤消費や誤 retry を誘発しないか（特に inspector が production より先に走る経路が存在しないか）。
4. **Option C を却下し Option A を採るべき反証**: immutable token を伴う「post-selection ACK」を A の範囲で安全に実装でき、かつ C の receptacle を侵食しない設計が本当に存在しないか。
