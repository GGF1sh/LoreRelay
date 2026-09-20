# Adversarial Review Report: PROMPT-001A (Gate Attack)

> Submitted by the user from Gemini 3.1 Pro and preserved as the reviewer artifact. Chief Integrator corrections and disposition are recorded separately; this report is not silently rewritten.

| Field | Value |
|:---|:---|
| **Role** | Adversarial Architect (Gemini 3.1 Pro) |
| **Target Gate** | `PROMPT-001A` (Drafted by Claude Opus 4.8) |
| **As-of Commit** | `6af4bc590725c4383da89ce44f4ec0c4124ebbed` (current main equivalent) |
| **Verdict** | **RETURN_TO_ARCHITECTURE (REQUIRE_TASK_SPLIT)** |

---

## 1. Current Main Snapshot & Verification

The current HEAD and behavior of the state synchronizer (`src/gameStateSync.ts`), turn fallback (`src/turnResultFallback.ts`), and core patch logic (`src/statePatch.ts`) were examined. The code has not fundamentally changed regarding prompt consumption or acceptance boundaries since Claude's analysis, meaning Claude's observation of premature consumption is correct. However, Claude's proposed solution (the "Accepted" contract) contains fatal flaws when applied to the existing orchestration.

---

## 2. Gate Claims Tested

| Claim | Verdict | Evidence |
|:---|:---|:---|
| Candidate generation purity is needed | **SURVIVES** | Immediate consumption during build causes undeniable losses upon eviction. |
| Budgeter must maintain chunk identity | **SURVIVES** | Without identity, we cannot trace what was actually Delivered. |
| `onAcceptedTurn` is the correct Accepted boundary | **FAILS** | Fires before canonical commit. Fails in race conditions. |
| at-least-once delivery retry is safe | **FAILS** | Current dedupe logic permanent-drops retries upon internal failure. |
| A chunk identity receipt is sufficient | **FAILS** | Needs immutable source token to prevent stale ACK. |

---

## 3. Acceptance Boundary Trace (The Fatal Flaw)

Claude's Gate proposes that `onAcceptedTurn` (via `markTurnResultHandled()`) represents the `Accepted` state, at which point consumables should be marked consumed.

Here is the actual trace of `processTurnResultFileAt` in current `main`:

```typescript
// 1. Parsing & Dedupe
const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
if (hash === lastProcessedTurnHash) return false;
const turnResult = JSON.parse(content);

// 2. MARKERS SET (PREMATURE)
lastProcessedTurnHash = hash;
markTurnResultHandled(); // ⚠️ FIRES `onAcceptedTurn` CALLBACK HERE!

// 3. CANONICAL COMMIT
const enriched = processTurnResult(turnResult); // Validation & State Commit happens HERE

// 4. OBSERVABILITY
panel.webview.postMessage(...)
```

**Failure Point:** The callback proposed by Claude as the "Accepted" trigger fires at Step 2. The actual validation and state changes happen at Step 3 (`processTurnResult`).

---

## 4. Fatal Counterexamples

### Fatal Scenario A: False Accepted (Hypothesis A & B Confirmed)

1. Provider responds with valid JSON but invalid semantic schema.
2. `processTurnResultFileAt` hashes the file, sets `lastProcessedTurnHash = hash`.
3. `markTurnResultHandled()` fires. (If Claude's Gate were implemented, context would be permanently marked **Consumed** here).
4. `processTurnResult()` throws a validation error.
5. The `catch` block in `processTurnResultFileAt` attempts a retry (`processTurnResultFileAt(fsPath, retryCount + 1)`).
6. The retry computes the same hash. It compares it to `lastProcessedTurnHash` (which was updated in step 2).
7. The retry instantly returns `false` (deduped) and drops the turn entirely.

**Result:** The context is consumed, the turn is dropped, and the provider is never asked to retry. The exact opposite of the Gate's promise.

### Fatal Scenario B: Stale ACK Token (Hypothesis C Confirmed)

1. Turn 10 context is selected and delivered. The receipt says `[ChunkID: worldChangeSummary]`.
2. Provider takes 15 seconds to reply.
3. During those 15 seconds, a quickstart overwrite advances the `world_state.turn` to 12.
4. Provider turn 10 returns and is accepted.
5. The consumption logic fires based on the receipt: "Mark worldChangeSummary as consumed".
6. The consumption logic marks `world_state.turn = 12` as injected (because it reads current state).

**Result:** Turn 12's summary is permanently lost, falsely acknowledged by turn 10's delivery.

---

## 5. Receipt Contract Attack (Minimal Immutable Token)

A receipt containing only the chunk ID is insufficient.
To safely defer consumption to the Accepted boundary, the receipt must contain an **Immutable ACK Token**.

For `worldChangeSummary` and `chronicle`, the minimum immutable token is the `sourceTurn` (or timeline version) they were generated against.

**Required Receipt Shape:**

```typescript
{
    chunkId: 'worldChangeSummary',
    ackToken: { sourceTurn: 10 } // MUST be matched at consumption time
}
```

If `currentTurn !== receipt.ackToken.sourceTurn`, the consumption MUST be a no-op to prevent acknowledging future events.

---

## 6. Failure Matrix Corrections (Target Contract)

Claude's Target Matrix assumed `Accepted` was robust. It is not.

| Case | Delivered | Accepted | Consumed | Retryable? |
|:---|:---:|:---:|:---:|:---|
| TurnResult validation rejection | ✅ | ❌ | ❌ | **NO** (Current dedupe bug suppresses retry) |
| Canonical commit failure | ✅ | ❌ | ❌ | **NO** (Current dedupe bug suppresses retry) |

To achieve the Gate's desired matrix, `lastProcessedTurnHash` and `markTurnResultHandled()` MUST be moved to **after** `processTurnResult()` succeeds.

---

## 7. Task Split Verdict

**VERDICT: OTHER ATOMIC SPLIT REQUIRED**

`PROMPT-001A` is too bloated and overlaps with existing orchestrator bugs. We must split it into strict sequence:

1. **`TEMP-004` (New Dependency)**: Fix State Orchestrator Dedupe Bug. Move `lastProcessedTurnHash` and `markTurnResultHandled()` assignment to *after* canonical `processTurnResult()` success.
2. **`PROMPT-001A`**: Candidate Purity only. Strip side-effects out of `gmPromptBuilder.ts`.
3. **`PROMPT-001C`**: Identity, Delivery Receipts (with Immutable ACK Tokens), and Delayed Consumption attached to the (now-fixed) Accepted boundary.

**Dependency Order:** `TEMP-004` -> `PROMPT-001A` -> `PROMPT-001C`.

---

## 8. Existing Candidate Triage

- `CLAUDE-20260705-001` (Inspector consumption side-effect): **ABSORB INTO PROMPT-001A**.
- `CLAUDE-20260705-002` (in-memory pending mismatch): **KEEP AS CANDIDATE** (Requires separate fix for durable parity).
- `CLAUDE-20260705-003` (double build per turn): **ABSORB INTO PROMPT-001C** (Receipt logic will naturally resolve this by passing the payload forward).

---

## 9. New Finding Candidates

- **Candidate ID**: `GEMINI-20260705-001`
- **Reporter**: Gemini 3.1 Pro (Adversarial Architect)
- **As-of Commit**: `6af4bc590725c438`
- **Evidence**: `gameStateSync.ts` L605-606 updates `lastProcessedTurnHash` before `processTurnResult()`. Catch block retry immediately dedupes itself and permanently drops failed turns.
- **Suggested Severity**: P0
- **Duplicate Of**: None.
- **Confidence**: 100% Confirmed.

- **Candidate ID**: `GEMINI-20260705-002`
- **Reporter**: Gemini 3.1 Pro (Adversarial Architect)
- **As-of Commit**: `6af4bc590725c438`
- **Evidence**: Claude's proposed Acceptance Consumption mechanism is vulnerable to stale ACKs if temporal events alter canonical state during provider generation. Consumption requires an Immutable ACK Token (e.g., `sourceTurn`).
- **Suggested Severity**: P1
- **Duplicate Of**: None.
- **Confidence**: 100% Confirmed.

---

## 10. Adversarial Review Verdict

**RETURN_TO_ARCHITECTURE**

The Gate drafted by Claude identifies the correct core problem but proposes a faulty contract that relies on a broken Accepted boundary and ignores stale ACK races.
The Architecture Gate (ChatGPT 5.5) must rewrite `PROMPT-001A` to focus purely on Candidate Purity, issue `TEMP-004` to fix the orchestration dedupe bug, and defer consumption logic to `PROMPT-001C`.
