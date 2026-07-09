# AI Review Backlog & Central Control Board

**Board Code Baseline:** `e4280d0` (Gameplay Slice 1 merged to main)
**Control Artifacts Synced Through:** `93983ea` (durable integrator-chat handoff added)
**Last Reconciled:** 2026-07-08 JST
**Chief Integrator:** ChatGPT Browser

このドキュメントは、LoreRelayプロジェクトにおいて稼働する複数のAIエージェントのタスクを中央管制（Central Control）するためのバックログです。

## ⚠️ AIエージェントへの重要指示 (CRITICAL INSTRUCTION FOR ALL AIs)
1. **WIP Limit 制限**: 
   - `IMPLEMENTING` (本実装): 最大3本
   - `ADVERSARIAL_REVIEW`: 最大2本
   - `Architecture P0/P1 Gate` (設計策定): 最大2本
   - **同一 Touch Set に対する同時着手: 最大1本**（依存関係やファイルの競合を防ぐため）
2. **1タスク = 1チャット = 1ブランチ = 1ワークツリー**: 担当タスクを実行する際は専用のブランチと隔離されたワークツリーを使用してください。
3. **Task Packet制**: 各実装タスクは `docs/ai-tasks/[ID].md` のパケットを持ちます。AIは全体バックログと自タスクのパケットのみを読み、範囲外（Out of Scope）のコードには絶対に触れないでください。
4. **新規課題の報告**: 新規課題は直接バックログへ追記せず、`AI_FINDINGS_INBOX.md` へ報告してください。

---

## 🚦 Status 状態遷移モデル (State Machine)
- `DISCOVERED` → `CONFIRMED` → `GATE_DRAFTED` → `ADVERSARIAL_REVIEW` → `READY_TO_IMPLEMENT` → `IMPLEMENTING` → `VERIFYING` → `BULK_AUDIT` → `SECOND_REVIEW` → `DONE`
- 例外: `BLOCKED`, `DEFERRED`, `REJECTED`

---

## 📋 Active Backlog

| ID | Area / 内容 | Severity | Priority | Status | Depends On | Touch Set | Owner | Reviewer |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **PROMPT** | | | | | | | | |
| `PROMPT-001A` | Candidate→Budget→Delivered→Consumed順序契約（Option C staging merged + smoke passed） | P1 | Critical | **DONE** (`1773a9d`; terminal criteria satisfied by PROMPT-001C) | `PROMPT-001C, RUNTIME-002A` | merged; terminal criteria satisfied | - | - |
| `PROMPT-001B` | Inspector read-only / no rebuild side effects | P1 | High | **DONE** (`933252c`; re-smoke `222/222`) | `PROMPT-001A` | merged + post-merge re-smoke passed | - | - |
| `PROMPT-001C` | Prompt Assembly Receipt + immutable ACK / accepted consumption | P1 | High | **DONE** (`1773a9d`; post-merge smoke `223/223`) | `PROMPT-001A, B, RUNTIME-002A` | merged + post-merge smoke passed | - | - |
| `PROMPT-001D1`| Category Budgeter pure core | - | - | **DONE** (`8c7f733`) | - | | - | - |
| `PROMPT-001D2`| Category Budgeter shadow integration | P1 | High | **DONE** (`a319e68`; post-merge smoke `224/224`; smoke doc `7cb6c10`) | `PROMPT-001A, B, C` | merged + post-merge smoke passed | - | - |
| **TEMP** | | | | | | | | |
| `TEMP-001A` | Future-entry resurrection / replace semantics | - | - | **DONE** (`6ea886a`) | - | | - | - |
| `TEMP-001B` | Multi-ledger temporal checkpoint/restore | P0 | Critical | CONFIRMED | - | | ChatGPT | Gemini 3.1 Pro |
| `TEMP-001C` | Restore transaction / rollback / failure atomicity | P1 | High | CONFIRMED | `TEMP-001B` | | ChatGPT | Gemini |
| `TEMP-002A` | Git snapshot ordering | P1 | High | CONFIRMED | - | | ChatGPT | Gemini |
| **RUNTIME** | | | | | | | | |
| `RUNTIME-001A`| Temporal boundary GM session reset | - | - | **DONE** (`6ea886a`) | - | | - | - |
| `RUNTIME-001B`| RuntimeContextKey / Campaign identity | P1 | High | CONFIRMED | - | | ChatGPT | Gemini |
| `RUNTIME-001C`| Provider-specific session identity | P1 | High | CONFIRMED | - | | ChatGPT | Gemini |
| `RUNTIME-001D`| Async job epoch: Image/VLM stale writes | P1 | High | CONFIRMED | `RUNTIME-001B` | | ChatGPT | Gemini |
| `RUNTIME-002A`| TurnResult handled/dedupe ordering + post-commit Accepted boundary | P1 | Critical | **DONE** (`6fc5700`; smoke `221/221`) | - | merged + smoke passed | - | - |
| `RUNTIME-003A`| Durable Accepted Turn Identity / Restart Replay Guard | P1 | Critical | **DONE** (`5740fbb`; post-merge smoke `d6bd50d`; `225/225`) | `RUNTIME-002A` | merged + clean post-merge smoke passed | - | - |
| **NOAI** | | | | | | | | |
| `NOAI-PHASE0` | Core-only AI participation policy + direct Commerce trade event history | Product/Runtime | High | **DONE** (`22c4602`; post-merge smoke `20d982a`; `226/226`) | `RUNTIME-003A` | merged + post-merge smoke passed | - | - |
| `NOAI-PLAYTEST-001` | Long-horizon deterministic soak + structured telemetry + later read-only AI analyst | Product/QA | High | DISCOVERED (idea `5a6a2f5`) | `DET-001` | separate future gate; must not block Slice 1 human playtest | ChatGPT 5.5 High | Gemini / Grok / Claude by role |
| **GAMEPLAY** | | | | | | | | |
| `GAMEPLAY-SLICE1` | Existing hidden market drift → player Decision Surface (`The Fading Spike`) | Gameplay | Critical | **VERIFYING** (post-merge smoke PASS `669cae3`; merged `e4280d0`) | `NOAI-PHASE0` | human 30-minute playtest still required; no direct travel seam | User / ChatGPT | AI log analysis optional after test |
| `PLAYTEST-UNBLOCK-001` | Japanese Scrapbound / Start Hub smoke unblock for human playtest | Gameplay/UX | Critical | **DONE** (impl `4ce73df`; repair `f03ff0c`; reviews `4e3fd3`/`abc2650`; main `9c47482`; smoke `af33cf7`) | `GAMEPLAY-SLICE1` | merged + terminal literal BAT install PASS; machine ready for 5-minute human smoke; full suite `230/230` | Codex 5.5 High | Claude / Codex verify |
| **UX / TOOLING** | | | | | | | | |
| `ANTIGRAVITY-INSTALL-001` | Antigravity VSIX installer integrity / package hygiene / isolated CLI install | Tooling | High | **DONE** (impl `3cb51a3`; verify `ec453fb`; main `a5dea99`; smoke `c06bb87`) | - | merged + package hygiene PASS + live install smoke PASS; keep Relay task separate | Codex 5.4 | Claude Sonnet 5 |
| `ANTIGRAVITY-INSTALL-002` | Antigravity installer fast path + root everyday BAT bootstrap to managed current checkout | Tooling | High | **DONE** (fast impl `e3208a3`; root candidate `8b6dacb`; reviews `650aded`/`8c9ccb5`; main `e9f9fef`; smoke `ff5a054`) | `ANTIGRAVITY-INSTALL-001` | merged + terminal literal BAT smoke PASS (`229/229`, package `970` files / `25435878` bytes); keep Relay task separate | Codex 5.5 High | Claude Sonnet 5 |
| `ANTIGRAVITY-RELAY-001` | External Agent Relay Mode / clipboard payload handoff; suppress misleading normal-GM UI while Antigravity is active | UX/Tooling | High | **VERIFYING — REAL_RELAY_SMOKE_PENDING** (integration `8e7dc27`; verify `c10f172`; automated smoke `b15f048`) | - | next gate: real 1-2 turn Antigravity clipboard/file relay smoke; do not mark DONE before external relay proof | Antigravity / Gemini 3.1 Pro High | ChatGPT 5.5 High |
| `ANTIGRAVITY-RELAY-002` | Real Antigravity file bridge, repo-owned GM skill, visible Relay toggle | UX/Tooling | High | **VERIFYING - REAL_SMOKE_READY** (impl `33e652b`; repair `2ffe79e`; failed review `cf9f3b`; repair verify `09ce5a`; main `dc86941`; smoke `3157018`) | `ANTIGRAVITY-RELAY-001` | merged + automated post-merge smoke PASS (`231/231`) + Antigravity BAT install PASS; next gate: real human `/text-adventure-gm` smoke | Codex 5.5 High | Independent repair verify |
| `ANTIGRAVITY-RELAY-003` | Real-smoke recovery for short GM Skill trigger and pending request processing | UX/Tooling | High | **VERIFYING - REAL_SMOKE_READY** (impl `1e18d25`; verify `3e203f2`; main `4aff826`; smoke `a0f8426`) | `ANTIGRAVITY-RELAY-002` | merged + automated post-merge smoke PASS (`231/231`) + Antigravity BAT install PASS; next gate: real human `/text-adventure-gm process pending LoreRelay request` smoke | Codex 5.5 High | Independent verify |
| **D2 (Determinism)**| | | | | | | | |
| `DET-001` | Determinism hash/order stability | - | - | **DONE** (`4d56b28`) | - | | - | - |
| `D2-001A` | Inventory / checker | Architecture | High | **ADVERSARIAL_REVIEW** | `DET-001, RUNTIME-001B`| (設計フェーズ) | ChatGPT 5.4 | Gemini 3.1 Pro |
| `D2-001B` | Manifest core | Architecture | High | CONFIRMED | `D2-001A` | | | |
| `D2-001C` | Provider capture | Architecture | High | CONFIRMED | `D2-001B` | | | |
| `D2-001D` | Dice/ID receipts | Architecture | High | CONFIRMED | `D2-001B` | | | |
| `D2-001E` | QA replay mock | Architecture | High | CONFIRMED | `D2-001D` | | | |
| **IDENT & TERM**| | | | | | | | |
| `IDENT-001A` | Entity Reference Inventory Core | - | - | **DONE** (`192b017`) | - | | - | - |
| `IDENT-001B` | Dangling ref validator / duplicate owner | P1 | High | CONFIRMED | `IDENT-001A` | `entityReferenceInventoryCore.ts`| Grok/Antigravity | ChatGPT / Gemini |
| `TERM-001` | EntityKind / ClockRef / Event class contract | P1 | High | BULK_AUDIT | - | terminology docs + checker; reconcile stale board touch-set wording later | Gemini 3.5 Flash | |
| `SYMBOL-REGISTRY-001` | Deterministic generated registry for shared functions/types/message types/config keys | Tooling/Docs | High | **DONE** (impl `82acffc`; verify `051a3e8` / main `16df40b`; smoke `5b85f29`) | `TERM-001` related, not blocked | generator + generated JSON/Markdown + tests; integrated to main; post-merge smoke PASS (`227/227`) | Codex 5.5 Very High | ChatGPT 5.5 High |
| **OTHERS** | | | | | | | | |
| `REMOTE-001` | Remote Audience Security & Spectator Role | P1 | High | CONFIRMED | - | | ChatGPT | Gemini 3.5 Flash |
| `TRACE-001` | False causality in Trace/Debug logs | P1 | High | CONFIRMED | - | | ChatGPT | Gemini |
| `SO3-001` | SO3 path boundary safety | P1 | High | CONFIRMED | - | | ChatGPT | Gemini |
| `DEBUG-UX-001`| Debug Hub UX (Timeline / Debug / QA lanes) | Enhancement| Medium | **GATE_DRAFTED** | - | Webview (`ux/debug-hub`) | Claude Sonnet | |

---

## 🤖 AI 役割マトリックス (Role Assignments)

| 役割 (Role) | 推奨AIモデル | 職務内容 (Responsibilities) |
|:---|:---|:---|
| **Chief Integrator** | ChatGPT 5.5 | 【Lane A】タスクパケット生成、バックログ整理、成果物判定。コードは書かない。 |
| **Architecture Gate** | ChatGPT 5.4/5.5 | 【Lane A】アーキテクチャの整合性・契約策定。 |
| **Adversarial Architect** | Gemini 3.1 Pro | 【Lane B】既存設計の攻撃、破綻箇所の発見。1度に1つの重要Gateのみ。 |
| **Bulk Auditor** | Gemini 3.5 Flash | 【Main Sync】mainとBacklogの同期、現実とのズレ調査。大量同型検索。 |
| **Repo Engineer** | Antigravity (Gemini) | 【Lane Implementation】リポジトリの直接読み書き。 |
| **UX / Debug Hub** | Claude Sonnet | 【Lane C】ユーザー体験の設計、フロントエンド/Webviewの挙動レビュー。 |
| **Small Pure Core** | Grok | 純粋なロジックコアの実装やアルゴリズム最適化。 |
| **Repair / Tests** | Codex / Cursor | コンパイル救出、QAスクリプト、post-merge smoke。 |
