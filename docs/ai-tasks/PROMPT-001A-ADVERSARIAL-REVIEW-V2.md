# Adversarial Review Report: PROMPT-001A V2 Differential Attack

> Submitted by the user from Gemini 3.1 Pro and preserved as the reviewer artifact. Chief Integrator disposition is recorded separately.

| Field | Value |
|:---|:---|
| **Role** | Adversarial Architect (Gemini 3.1 Pro) |
| **Target Gate** | `PROMPT-001A-GATE-REPORT-V2.md` |
| **Current HEAD reported by reviewer** | `eeb9f4309f2eba671c950e536c9a46b3404b2f1c` |
| **Verdict** | **ACCEPT_V2_WITH_REQUIRED_AMENDMENTS (SAME_TASK_BUT_DONE_SEMANTICS_AMEND)** |

---

## 1. Differential Scope

今回のレビューでは、V1で確定済みの内容（Accepted境界の誤り、receiptの問題）は再調査せず、**V2のOption C（Pure shadow candidate path + legacy production authority）が staging の戦略として安全か、そして PROMPT-001A の Task Identity と矛盾しないか** に焦点を当てて攻撃しました。

---

## 2. V2 Claims Tested (Required Differential Verdict Table)

| V2 Claim | Verdict | Evidence / Reason |
|:---|:---|:---|
| Option C is merge-safe alone | **SURVIVES** | プロダクション経路の挙動を変えないため、退行（regression）リスクはゼロです。 |
| Production remains behavior-equivalent | **SURVIVES** | 共有ビルダーの legacy path は既存の副作用を完全に維持します。 |
| Pure path is structurally safe | **AMEND** | Boolean flag (`true/false`) による純化は呼び出し漏れを生みます。明示的な wrapper 構造が必要です（Attack 3）。 |
| PROMPT-001A can be DONE after V2 | **FAILS** | プロダクションの破綻（eviction loss）が残る状態を「DONE」とは呼べません（Attack 1 & 6）。 |
| Option A rejection is sound | **AMEND** | V2の却下理由（Stale ACK Raceが生じる）は技術的に不正確です（Attack 4）。 |
| C authority switch is sufficiently defined | **SURVIVES** | Cに移行する権限とロジックの定義は適切です。 |

---

## 3. Fatal Counterexamples

**Fatal Counterexample はありません。**

Option C はプロダクションの振る舞いを「意図的に凍結」するため、V2の実装自体が新たなクラッシュやバグを生むシナリオは発見されませんでした。コードの安全性という観点では極めて優秀な staging です。

---

## 4. Attack 評価詳細

### Attack 1 & 6: Task Identity & Acceptance Contradiction (FAILS)

V2の最大の弱点は、**Task Packet の Objective（eviction loss の解消）を放棄しているのに PROMPT-001A を DONE にしようとしている点**です。

「コードを安全に分割デプロイすること（merge-safe）」と「タスクが完了したこと（DONE）」を混同しています。

- **判定**: `SAME_TASK_BUT_DONE_SEMANTICS_AMEND`
- PROMPT-001A の Objective は変更しません。ただし、Option C 実装直後、PROMPT-001A は `DONE` ではなく **`BLOCKED (Waiting for PROMPT-001C)`** とならなければなりません。本番環境のバグが直るまでタスクは完了しません。

### Attack 2 & 3: Shared Builder Flag Safety (AMEND)

`buildGmPromptChunkSpecsWithMeta(consumeMarkers: boolean)` という設計は Boolean blindness の危険があります。`false` が何を意味するのか Call-site で自明ではありません。

- **Shape 2 (Wrapper 構造) の義務化**:
  内部の `buildCandidateSpecsPure()` は完全に純関数とし、外側に `legacyProductionBuilderWrapper()` を被せて、そこで初めて `consume*` を発火させる構造にすべきです。これにより「引数の付け忘れによる意図しない消費」を型レベルで防げます。

### Attack 4: Option A Rejection の不正確性 (AMEND)

V2は Option A を「Stale ACK Race を起こす」として却下しましたが、これは不正確です。Option A の ACK はプロバイダ通信の「前」に同期的に行われるため、15秒の通信遅延による Race は起きません。

ただし、「プロバイダが失敗しても消費済みになる（Delivery保証がない）」という欠点は依然として残るため、Option C を採用するという結論自体は支持します。

### Attack 5: Inspector Ordering Artifact (SURVIVES)

プロダクションが `chronicleSessionPending` などを消費（クリア）した直後に Inspector が描画されるため、Inspector には直近の Chronicle が表示されないというアーティファクトが存在します。これは現行 main に既に存在するバグであり、V2がこれを悪化させることはないため容認します（解決は PROMPT-001B / C に委ねます）。

---

## 5. Required Amendments

実装前に以下の修正を Task Packet および Gate 契約に適用してください。

1. **Done Semantics の修正**: Option C の実装をマージした後、PROMPT-001A のステータスは `DONE` ではなく `BLOCKED (Depends on PROMPT-001C)` へ移行する。
2. **Wrapper 構造の強制**: `boolean` フラグによる分岐を禁止し、`buildCandidateSpecsPure`（完全純関数）と、それをラップして副作用を注入する `legacyProductionBuilderWrapper` の2層構造にすること。
3. **Task Packet の Acceptance Criteria 更新**: 「Inspector が純化されること」と「Production が Legacy 副作用を正確に維持すること」を当座の Criteria とし、Eviction Loss 解決は PROMPT-001C との統合テストとする。

---

## 6. New Finding Candidates

新規のバグは発見されませんでした（現行のアーティファクトは既知）。

---

## 7. Final Differential Verdict

**ACCEPT_V2_WITH_REQUIRED_AMENDMENTS**

Claude 4.8 による V2 Option C は、稼働中の本番システムに退行バグを絶対に入れないための「安全な架け橋（Staging）」として非常に優れています。

ただし、中央管制の観点から「バグが本番に残っているのにタスクを完了（DONE）扱いにする」という甘えは許されません。Required Amendments に従い Wrapper 構造を採用し、DONE セマンティクスを修正した上で、本実装へタスクを回すことを許可します。
