# AI Ops Knowledge & Integration Audit

- **AI:** Grok  
- **Model:** Grok 4.5 (High)  
- **Role:** Independent audit (no production code changes)  
- **Date:** 2026-07-09 (JST)  
- **Repository:** `C:\AI\text-adventure-vsce`  
- **Expected main:** `e95997acb74137edc50302d1446f18e795e36df7`  
- **Observed HEAD / origin/main:** `e95997acb74137edc50302d1446f18e795e36df7` (MATCH)

---

## Audit 1 — Knowledge dictionaries: use, enforcement, rot

### 1.1 Symbol Registry

| Layer | Path / command | Role |
| --- | --- | --- |
| Generator | `scripts/generate_symbol_registry.js` | Scans TS/webview/package → `docs/generated/symbol_registry.json` + `SYMBOL_REGISTRY.md` |
| Scripts | `npm run generate:symbol-registry` / `check:symbol-registry` | Write / staleness check |
| Tests | `scripts/test_symbol_registry.js` in `run_all_tests.js` | Shape + `--check` currency |
| CI | `.github/workflows/ci.yml` | Runs `compile` + `test:validate` + `test:smoke` + unit coverage — **does not specially name Symbol Registry**, but unit suite includes it when `test:coverage` / full unit runs |

**What it actually does**

- Deterministic inventory of exported TS symbols, webview top-level functions, `window.*` APIs, host↔webview message types, `textAdventure.*` config keys.
- Explicit design intent (handoff): *“New AI agents should consult the generated registry before doing broad symbol discovery.”* (`docs/AI_INTEGRATOR_CHAT_HANDOFF.md` §Symbol Registry).

**What it does *not* do**

- No runtime enforcement.
- **Not referenced by `docs/AI_PROMPT_HANDOFF_POLICY.md`** (grep: zero hits for symbol/terminology/glossary).
- Not in the “start of fresh chat” mandatory read list (only handoff, backlog, findings, prompt policy, exploration budget, external review packet).
- Not required in default compact AI handoff template as a mandatory touch file.
- Integrator docs list it as “consult,” not “must open before coding.”

**Utilization judgment**

| Use mode | Status |
| --- | --- |
| Generated + tested | **Active** |
| Integration gate (`check` / full suite) | **Active but noisy** (Windows CRLF false-stale; see Audit 2) |
| AI handoff *enforced* read | **Mostly aspirational / soft** — recommended once, not operationalized in prompt policy |
| Prevents duplicate functions in practice | **Only if human/AI opens the file** |

**Dead-weight risk:** Medium for AI agents who never open `docs/generated/SYMBOL_REGISTRY.md`. Low for CI integrity of the generator itself.

---

### 1.2 Terminology Contract

| Layer | Path | Role |
| --- | --- | --- |
| Contract | `docs/TERMINOLOGY_CONTRACT.md` | Canonical naming, `EntityKind`, clocks, domains |
| Checker | `scripts/check_terminology_contract.js` (`npm run check:terminology`) | Heuristic WARN scan over `src/**/*.ts` only |
| Full suite | **Not** in `run_all_tests.js` | Optional manual script |
| CI | **Not** run in `ci.yml` | Dead relative to automated merge gates |

Checker behavior (observed): **172 warning(s), 0 failure(s)** — never fails the process on current main. Rules are soft (`duplicate-EntityKind`, `severity-literal-check`, `legacy-id-wire-field`, `clockref-candidate`).

**AI handoff**

- Listed under “Current terminology layers” in integrator handoff (inventory).
- **No binding rule** in `AI_PROMPT_HANDOFF_POLICY.md`.
- Backlog still tracks `TERM-001` / findings inbox notes incomplete enforcement and webview/new terms not covered.

---

### 1.3 EntityKind drift (contract vs production)

**Do not declare which is “correct.”** Record as multi-source drift.

| Source | `EntityKind` members |
| --- | --- |
| `docs/TERMINOLOGY_CONTRACT.md` | `region \| location \| faction \| npc \| vehicle \| settlement \| mod \| **mobile_base \| guild \| domain**` |
| `src/entityIdentityCore.ts` (D1 identity core) | `region \| location \| faction \| npc \| vehicle \| settlement \| mod` — **no** mobile_base/guild/domain |
| `src/worldIntentCore.ts` | Includes **`mobile_base`, `guild`, `domain`** (and re-exports own `EntityKind`) |

Implications:

- Contract is **wider** than D1 identity core.
- World Intent already has the wider set; identity core is intentionally minimal (CHANGELOG D1a: “minimal EntityKind set”).
- Checker allows local `EntityKind` in `entityIdentityCore.ts` and `worldIntentCore.ts` without failing; it does **not** assert equality with `TERMINOLOGY_CONTRACT.md`.
- AI that “follows the contract” may invent identity kinds that D1 identity inventory will not accept; AI that “follows entityIdentityCore” may under-model World Intent kinds.

**Drift class:** Cross-layer vocabulary skew (doc vs D1 vs World Intent), unenforced, known-adjacent to `TERM-001`.

---

### 1.4 Event Classification Glossary

| Layer | Status |
| --- | --- |
| Doc | `docs/EVENT_CLASSIFICATION_GLOSSARY.md` — composite match = category + signal; ban severity-only semantics |
| Production pilot | `evaluateFoodCrisisEvent` (+ other evaluators) in `src/livingWorldTypes.ts`; consumers include `debugTraceEmitCore.ts` and living-world paths |
| Tests | `scripts/test_event_classification.js` in full unit suite — **enforced for pilot evaluators** |
| Terminology checker | WARN-only on bare `.severity ===` patterns |
| AI handoff | Listed as a layer; **no mandatory read** in prompt policy |

**Utilization judgment**

- **Not dead** for food-crisis / related evaluators (code + unit tests).
- **Partial** for “all simulation systems”: glossary is aspirational beyond piloted evaluators.
- AI agents are not forced to open the glossary before adding new event matching.

---

### 1.5 Dead / soft-dead inventory

| Asset | Generated/tested | CI hard gate | AI must-read | Production runtime |
| --- | --- | --- | --- | --- |
| Symbol Registry | Yes | Via unit `--check` (EOL-fragile on Windows) | Soft recommend only | No |
| TERMINOLOGY_CONTRACT | Yes (doc) | No (`check:terminology` optional, warn-only) | Soft inventory | No |
| EVENT_CLASSIFICATION_GLOSSARY | Partial (pilot code+test) | Via `test_event_classification.js` for pilots | Soft | Partial |
| EntityKind single source of truth | **No** | No | Conflicting sources | Split cores |

---

### 1.6 Minimal ops improvements (no code redesign required)

These are **process/prompt** changes that reduce AI blind spots without gameplay redesign:

1. **Handoff policy (must-read on symbol work)**  
   Add to `AI_PROMPT_HANDOFF_POLICY.md` / compact handoff template:  
   - Before adding shared helpers, message types, or config keys: search `docs/generated/symbol_registry.json` (or MD index).  
   - Before new entity kinds or clocks: open `TERMINOLOGY_CONTRACT.md` **and** state which core owns the kind (`entityIdentityCore` vs `worldIntentCore`).  
   - Before severity-based world reactions: open `EVENT_CLASSIFICATION_GLOSSARY.md` and prefer `evaluate*Event` helpers.

2. **Document EntityKind layers explicitly** (doc-only)  
   One short table in TERMINOLOGY_CONTRACT:  
   - D1 identity kinds (narrow)  
   - World Intent kinds (wide)  
   - Wire JSON legacy IDs  
   Mark `mobile_base` / `guild` / `domain` as **World Intent / campaign domain vocabulary**, not D1 identity inventory, until intentionally promoted.

3. **Promote terminology check carefully**  
   - Either keep warn-only and run on NORMAL lane only, or  
   - Add `--fail-on=duplicate-EntityKind` for new files only later.  
   Do **not** make 172 current WARNs a merge blocker overnight.

4. **Symbol Registry CRLF**  
   Normalize `--check` to ignore CR (ops tooling). Until then, integration lane must use `git diff --ignore-cr-at-eol` once, not regenerate loops.

5. **AI “duplicate function” checklist (3 commands)**  
   ```text
   1) rg / symbol_registry.json for candidate name
   2) rg host-webview message types if protocol
   3) rg package.json textAdventure.* if config
   ```

---

## Audit 2 — Integration + post-merge smoke cost (RELAY-004 as case study)

### 2.1 RELAY-004 main chain (after candidate)

From main `97b8b1e` → `e95997a` (4 commits):

| Commit | Role |
| --- | --- |
| `5103dc3` | Implementation |
| `c03c8d4` | Independent verify doc cherry-pick |
| `27a5123` | Post-merge smoke doc |
| `e95997a` | Control artifact sync (handoff + backlog) |

**Doc/control sync was split** into smoke doc + handoff/backlog — two pushes/commits after integration tip.

### 2.2 Steps recorded in `ANTIGRAVITY-RELAY-004-POST-MERGE-SMOKE.md`

| Step | Necessary? | Notes |
| --- | --- | --- |
| Preflight SHAs / ancestry / verify touch-set | **Yes** | Safety |
| FF main + cherry-pick verify + push | **Yes** | Integration |
| `npm run compile` | **Yes** | But also inside full suite path if suite recompiles? Suite assumes `out/` present; compile is justified once |
| Focused Relay tests (file_bridge, relay_core, relay_webview) | **Yes for FAST** | Overlap with full suite later |
| `check_i18n_keys` | **Yes for UI string tasks**; optional if suite always greps? Not all tasks; cheap — keep |
| `check:symbol-registry` | **Redundant with** `test_symbol_registry.js` in `npm test` | Double execution |
| CRLF diagnosis + `generate:symbol-registry` + re-check + **re-run full npm test** | **Mostly waste** after first EOL diagnosis | Same class as prior RELAY/INSTALL smokes |
| Full `npm test` | **Yes for NORMAL/RECOVERY**; optional on FAST if CI covers | ~40s+ on this host class |
| Full `install_extension_antigravity.bat` + multi-dir version listing + triple SKILL hash | **Yes for installer/runtime-facing tasks**; heavy | Can be RECOVERY or “install-touching only” |
| Cross-extension-dir webview hash + `relayWaitingStateDone` string probe | **Yes once for UX ship**; overkill every time | |
| Second full suite after generate | **No** if first suite only failed symbol CRLF | |

### 2.3 Duplication classes

1. **Focused tests ⊂ full suite** — running both is defense-in-depth but costs ~2× on unit path for small candidates.  
2. **`check:symbol-registry` ⊂ `test_symbol_registry.js`** — pure double.  
3. **CRLF re-investigation ritual** — repeated across INSTALL-001/002, RELAY-002/003/004 verifies; each spends diagnosis cycles though answer is known.  
4. **Push / commit fan-out** — implementation (often already on branch), verify branch push, main integration push, smoke doc push, control sync push.  
5. **Install path verification** — full BAT + multi-root extension dirs every time even when candidate did not touch installer.

### 2.4 Can NORMAL lane approach 2–3 minutes?

**Yes, for typical verified candidates**, if:

- compile once (~30–90s depending on machine)  
- focused tests only for the task domain (~5–30s)  
- **one** full unit suite **or** rely on CI for full unit (local: ~40–60s when green)  
- skip installer unless touch-set includes install/skill/package entry  
- replace Symbol Registry drama with one EOL-normalized check  

Rough target budget:

| Lane | Wall time target | Content |
| --- | --- | --- |
| **FAST** | ~2–3 min | Preflight + compile + focused tests + i18n if UI + push main (FF) + single smoke note; **no** full suite, **no** installer, **no** symbol regenerate loop |
| **NORMAL** | ~4–8 min | FAST + **one** `npm test` (or unit+smoke) + EOL-safe symbol check (ignore-cr, no re-generate unless real content diff) + verify cherry-pick; control sync can batch with smoke doc |
| **RECOVERY** | 10–20+ min | NORMAL + installer BAT + skill hash + multi-path install probe + optional re-run suite after install + real human smoke |

**Safety not reduced if:**

- Independent verify already ran focused + production-grounded tests.  
- CI on `main` still runs compile + validate + smoke + unit coverage.  
- FAST is only for **already VERIFY_PASS** candidates with clean touch-set.  
- RECOVERY is mandatory when installer, skill, package.json packaging, or multi-host install is in the touch-set.

### 2.5 Proposed lanes (actionable)

#### FAST integration lane (verified candidate, narrow touch-set)

```text
1. Preflight: main SHA, candidate SHA, ancestry, 0 1 / N ahead, verify doc SHA, touch-set
2. npm run compile
3. Task-focused tests only (e.g. relay suite for Relay UX)
4. node scripts/check_i18n_keys.js  # if locales/webview strings touched
5. Integrate (FF or agreed merge) + push main
6. One durable smoke line in ai-tasks OR batch with control sync later
STOP
```

**Skip:** full `npm test`, symbol generate loop, installer, multi-dir hash archaeology, second suite.

#### NORMAL integration lane (default ship)

```text
1–4 as FAST
5. npm test once   # accept  known CRLF-only symbol failure with:
   git diff --ignore-cr-at-eol --exit-code -- docs/generated/*
   # only if real content diff → generate + commit in same integration commit if required
6. Integrate + push
7. Post-merge smoke doc + handoff/backlog control sync in ONE commit when possible
```

**Skip:** installer unless packaging/install/skill paths touched; skip re-running full suite after EOL-only normalize.

#### RECOVERY integration lane (install/skill/packaging/human gate)

```text
NORMAL +
install_extension_antigravity.bat (canonical, NO_PAUSE)
assert managed checkout SHA == origin/main tip
assert install-target webview hash == managed checkout (single canonical IDE path)
assert Gemini skill hash == repo-owned skill if skill touched
optional: human real smoke checklist
```

### 2.6 CRLF policy (stop the loop)

Known fact (reconfirmed many times including this audit’s host history):

- `generate_symbol_registry.js --check` compares raw strings; Windows `core.autocrlf=true` checkout is CRLF; generator writes LF → false stale.
- Content after LF normalize matches git blob.

**Ops rule until tooling fixed:**

```text
On Windows, do NOT treat symbol-registry --check failure alone as content drift.
Use git diff --ignore-cr-at-eol on docs/generated/* first.
Do not re-run full npm test solely after EOL normalize.
```

Tooling fix (out of scope for this audit’s code changes, but recommended): normalize `\r\n` → `\n` inside `--check`.

---

## Cross-cutting conclusions

1. **Dictionaries exist in three maturity tiers:**  
   - Event pilot: real code + tests  
   - Symbol registry: real generator + tests, weak AI compulsion  
   - Terminology contract: real doc + soft checker, multi-EntityKind drift, not in suite/CI  

2. **AI duplication risk** is real because handoff *recommends* Symbol Registry but prompt policy does not *require* it, and EntityKind has two code owners plus a third doc list.

3. **Integration slowness** is dominated by ritual duplication (focused+full suite, symbol CRLF theater, multi-commit control sync, full installer for non-install candidates), not by RELAY-004’s actual safety needs.

4. **2–3 minute lane is realistic for FAST** verified narrow candidates; NORMAL stays a few minutes more; RECOVERY stays long on purpose.

---

## Final verdict

**AI_OPS_AUDIT_ACTIONABLE**

Actionable items (priority order):

1. Codify FAST / NORMAL / RECOVERY integration lanes in integrator handoff (process only).  
2. EOL-safe Symbol Registry check (tooling) + ban “regenerate + full retest” ritual for CRLF-only.  
3. Prompt-policy must-read rules for Symbol Registry + terminology layers on relevant tasks.  
4. Document EntityKind multi-layer drift without inventing a silent single source.  
5. Keep `check:terminology` warn-only until intentional fail modes are designed.

No production gameplay/ComfyUI changes required for the above.
