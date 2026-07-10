# PORTRAIT-STUDIO-001 — Character Portrait Studio: High-Fidelity UX Prototype

- **Branch:** `ux/PORTRAIT-STUDIO-001-high-fidelity-prototype` (from `origin/main` @ `c0418a8`)
- **Prototype:** [`docs/prototypes/portrait-studio/`](../prototypes/portrait-studio/)
- **Screenshots:** [`docs/assets/portrait-studio-desktop.jpg`](../assets/portrait-studio-desktop.jpg), [`docs/assets/portrait-studio-narrow.jpg`](../assets/portrait-studio-narrow.jpg)
- **Scope:** UX vision + interactive prototype only. No production code, no runtime logic, no installed-Skill or Fantasy-workspace changes, no version bump.

Portrait Studio is the LoreRelay place where the player can always answer: *what is this
character's official portrait, what is merely generated, what is still running, and what
happens if I adopt this image* — the exact questions the real human smoke could not answer.

---

## 1. Repo Reality Audit

Audited at `origin/main` = `c0418a8552b8ab2d6247eff238e004d3ee944388`;
`task/MEDIA-COMFY-001-long-load-lifecycle` (`0173cb9`) inspected **read-only** via git objects.

| Surface | Where | What actually exists |
|---|---|---|
| Character profile UI | `webview/modules/52-character-creator.js`, `webview/script.js` | Creator modal with a single portrait preview. Listens to `portraitGenerated` / `expressionGenerated` / `imageGenStart` / `imageGenEnd{success}`. **No job state, no candidate concept, no history, no adoption UI** — a generated portrait simply appears. |
| Character JSON | `src/characterManager.ts`, `src/types/Character` | `characters/<id>.json`: `portrait: string` (absolute path), `expressions{}`, name/description/personality. **No `visualIdentity`, no portrait history field.** |
| Adoption authority (MEDIA-M1.1) | `src/portraitArtifact.ts`, `src/mediaArtifactCore.ts`, `docs/ai-tasks/MEDIA-M1.1-PORTRAIT-ARTIFACT-SYNC.md` | `TA_MEDIA_RESULT {success,outputPath,createdAt,characterId?,error?}` stdout record; `verifyAdoptedPortraitArtifact` requires: success=true → path inside `characters/` → **versioned name `<id>_portrait_<16hex>.(png|jpe?g|webp)`** → freshness ≥ generation start −2s → JSON `portrait` resolves to *exactly* that artifact. |
| Versioned vs fixed filenames | `src/characterId.ts` | Generated+adopted portraits are versioned (cache-safe). **Manual upload (`uploadPortrait`) still writes fixed `<id>_portrait.<ext>`** and writes JSON directly — a second, legal, non-versioned adoption path. The smoke's "manually renamed file written into JSON" is a third, informal path. All three can coexist; nothing surfaces the difference today. |
| External JSON watcher | `src/characterManager.ts` `initCharacterManager` | `FileSystemWatcher('characters/*.json')`, 75ms debounce → re-broadcasts `characterList`. External (Antigravity) adoption already refreshes the UI; Portrait Studio can rely on the same signal. |
| Duplicate-job guard | `src/characterManager.ts` | Single in-flight native `portraitProcess`; second Generate → `imageBusy` warning. **Jobs started outside the host (GM Skill / Antigravity) are invisible to this guard.** |
| MEDIA-COMFY-001 (branch) | `antigravity-skill/.../comfyui_generate.py`, `docs/ai-tasks/MEDIA-COMFY-001-LONG-LOAD-JOB-LIFECYCLE.md` | `TA_MEDIA_STATUS {promptId,state,elapsedSeconds}` heartbeat records; states `QUEUED / RUNNING / COMPLETED / ORPHANED / TIMED_OUT`; immediate `QUEUE_REJECTED` failure with **no polling**; failure `TA_MEDIA_RESULT` carries `state`+`promptId`+`lastState`; `COMFYUI_JOB_TIMEOUT` default 1200s; `COMFYUI_ORPHAN_GRACE`; no 300s cutoff. Status: VERIFYING, unmerged. |
| MEDIA-ARCHITECTURE-001 | `docs/ai-tasks/MEDIA-ARCHITECTURE-001-COMFYUI-ACTION-ROUTING-DESIGN.md` | Media Intent (`portrait_fullbody`/`portrait_bust`/`expression`/… + framing/aspect/continuity) → Media Profile (`src/mediaProfileCore.ts` — **implemented**, with preflight compatibility validation & reason codes) → Prompt Compiler → Validated Generation Plan. Intent schema & compiler are **conceptual**; `visualIdentity` (structured appearance + `referencePortraitPath` + `lastGoodSeed`) is **designed, not implemented**. |
| Generation quality reality | same doc §3 | Confirmed failures: thin description → generic art; model/workflow mismatch (Anima+SDXL) now blocked by preflight; composition problems (multi-subject, subject-too-small) have **no detection today**. |

**Audit findings that shaped the design:**

1. **Authority is precise but invisible.** The M1.1 chain proves adoption, but the UI never
   shows *which* adoption path produced the current portrait. The studio's job is to render
   that chain, not replace it.
2. **There is no candidate ledger.** Non-adopted generations (`scene_*.png`, superseded
   versioned files) just sit in `characters/`. Candidate states are *derivable* from
   filesystem + JSON (exists / referenced / versioned-name / mtime), but per-candidate intent
   and job identity need a small new store (slice 5).
3. **Job lifecycle evidence arrives as stdout records** (`TA_MEDIA_STATUS`), which is exactly
   what an honest "still alive, don't retry" UI needs — after MEDIA-COMFY-001 merges.

## 2. Data Source Map

`existing source → data actually available → Portrait Studio presentation`

### AVAILABLE NOW

| Source | Data | Presentation |
|---|---|---|
| `characters/<id>.json` `portrait` | the one authoritative path | **A. ACTIVE PORTRAIT** — gold frame, exact file identity |
| `verifyAdoptedPortraitArtifact` rules | versioned-name regex, exact-path match | 採用の形 row: 正式採用 / 手動アップロード / 手動編集(検証外); 名前規約 準拠/規約外 |
| filesystem scan of `characters/` | existing images, mtime, referenced-or-not | **C. CANDIDATES** states GENERATED / SUPERSEDED / MISSING_FILE (derived) |
| `TA_MEDIA_RESULT` (M1.1) | success/outputPath/createdAt/error | job final state; ADOPTION_FAILED reason text |
| `imageGenStart/End`, single-process guard | native job in-flight bit | Generate-button duplicate guard (native jobs) |
| `characters/*.json` watcher | external adoption events | auto-refresh of active portrait |
| `MediaProfile` + preflight | profile id, families, defaults, validation | **E.** advanced fold: compiled plan rows (事実) |

### AVAILABLE AFTER MEDIA-COMFY-001

| Source | Data | Presentation |
|---|---|---|
| `TA_MEDIA_STATUS` stream | promptId, state, elapsedSeconds heartbeats | **B. GENERATION STATUS** — stage rail, elapsed clock, 最終観測 "N秒前に /queue で確認" |
| failure `TA_MEDIA_RESULT` | state=QUEUE_REJECTED/ORPHANED/TIMED_OUT + lastState | four visually distinct failure classes; safe-retry guidance |
| `COMFYUI_JOB_TIMEOUT` | absolute budget | 打ち切り予算 "06:48 / 上限 20:00" |

### FUTURE / NOT AVAILABLE

- **MediaIntent schema + Prompt Compiler + Validated Generation Plan** — the intent picker UX
  is prototyped, but today's host builds one hardcoded prompt from name+description+theme.
- **`visualIdentity`** — designed in MEDIA-ARCHITECTURE-001 §14; not in character JSON.
- **Composition / multi-subject detection** — no VLM heuristic runs on candidates today; the
  prototype labels these warnings 自動判定 and the report classifies the capability as future
  (slice 7).
- **Per-candidate intent/job metadata** — requires the candidate ledger (slice 5).

## 3. Information Architecture

Five layers, one page. Authority on the left, activity on the right, archive below — so
"what is official" and "what is happening" are never in the same visual channel.

```
PORTRAIT STUDIO ─ character identity (serif name, characters/<id>.json chip)
│  authority banner: 正史 = 画像ファイル + characters/<id>.json の portrait 参照。
│  provenance vocabulary: 事実 / 自動判定 / 将来機能
├─ A. 採用中の肖像 (gold — the ONLY gold element on screen)
│    large frame, 「採用中 — 正」 ribbon, exact filename, adoption kind
│    (正式採用/手動アップロード/手動編集), adopted-at, file validity,
│    naming-convention check; warning note when JSON points outside the
│    versioned convention.
├─ B. 生成の現在 — job lifecycle strip (right, top)
│    QUEUED → RUNNING → final stage rail; elapsed clock; promptId;
│    最終観測 heartbeat; timeout budget; state-specific message boxes;
│    raw TA_MEDIA_STATUS/RESULT fold.
├─ E. 新しく生成する — intent picker (right, below job)
│    立ち絵—全身 / ポートレート—バスト / 表情リファレンス cards; Generate button
│    with duplicate-job guard text; advanced fold = compiled plan (read-only).
├─ C. 候補と履歴 — candidates rail (full width)
│    2:3 cards large enough to judge composition; state chip per card
│    (生成済み(未採用)/旧版/ジョブ迷子/ファイル欠落/採用失敗); heuristic warning
│    chips; ghost blocks for missing images; older generations folded per batch.
└─ D. 採用の確認 — comparison modal
     current(gold) vs candidate side-by-side + explicit 4-item effect list.
```

The lede under CANDIDATES states the core distinction in one sentence:
「ここにある画像は**存在するだけ**で、正史ではありません。」

## 4. Job Lifecycle UX

- **Stage rail, not spinner.** QUEUED → RUNNING → COMPLETED as discrete dots; the current
  stage breathes (reduced-motion: steady). Failure states repaint the final dot red with the
  failure name — `QUEUE_REJECTED` paints the *first* dot, because the job never existed.
- **Aliveness is evidence, not mood.** RUNNING shows: tabular elapsed clock (live-ticking),
  `最終観測: 4秒前（/queue で確認）`, promptId, and the timeout budget
  `06:48 / 上限 20:00（COMFYUI_JOB_TIMEOUT）`. Long model loads get a dedicated blue box:
  **「生きています。再試行しないでください。」** with the model-loading explanation and the
  concrete consequence (いま再試行すると同じ画像がもう一枚できます).
- **The Generate button is the retry policy.** While a job is alive it is disabled with the
  duplicate-job explanation; after QUEUE_REJECTED it is enabled with ✓ 再試行は安全 (no job
  exists); after ORPHANED/TIMED_OUT it warns that ComfyUI may still be working.
- **Raw records fold** shows the actual `TA_MEDIA_STATUS` / `TA_MEDIA_RESULT` lines — the
  evidence panel for power users, and a reminder that state comes from records, not narration.

## 5. Artifact Authority Model

Preserved exactly as MEDIA-M1.1 defines it, and made visible:

1. The banner states the single definition of 正史 (workspace artifact + validated JSON
   reference) and explicitly demotes AI narration and chat images.
2. Gold is reserved for the verified active portrait. Everything else — including a COMPLETED
   job card — stays in neutral/blue/red vocabulary. A finished generation *never* looks adopted.
3. The active panel renders the *provenance of the adoption itself*: 正式採用 (versioned name,
   verification chain) / 手動アップロード (fixed name, legal) / 手動編集 (JSON edited by hand,
   verification bypassed) — the mixed-history scenario shows the third case with a warning
   note, honest but not alarmist: JSON is still the law; the note recommends migrating to the
   versioned convention.
4. In the prototype, adoption mutates only in-memory state and says so in the toast; the
   production slice routes adoption through a host command that runs the existing
   verification and writes JSON atomically. No hidden auto-adoption anywhere: `portraitGenerated`
   arriving from the host updates the *candidate* rail, not the active slot, unless the host's
   verified adoption (JSON watcher) says otherwise.

## 6. Candidate / History Strategy

- **States:** 生成済み(未採用) / 採用中 / 旧版(superseded) / ジョブ迷子(orphaned job, no
  image) / ファイル欠落(record without file) / 採用失敗(image exists, verification refused —
  re-adoptable). Ghost blocks (◌ / ⊘) render missing imagery honestly instead of broken `<img>`.
- **Composition reality:** candidates carry heuristic warning chips (複数人物の可能性 /
  人物が画面に対して小さい), always tagged 自動判定 and never blocking — the player judges
  with their eyes; cards keep a 2:3 aspect large enough to do so.
- **20+ item strategy:** the rail shows only the recent/actionable generation (≤6 cards);
  older generations collapse into per-batch `<details>` folds
  (「2026-07-02 の生成（キャラ作成直後）— 12枚」) with a state tally and lazy thumbnails.
  Nothing infinite-scrolls; a long campaign's portrait archaeology stays one fold deep.
  The adoption lineage (v1 → v2 → current) remains readable through the 旧版 chain.

## 7. Adoption Interaction

Compare modal: current official (gold border) **vs** candidate, filenames underneath, then an
explicit numbered list of exactly what adoption does:

1. `characters/lisette.json` の portrait 参照がこの画像の正確なパスに書き換わる
2. この候補が「採用中（正）」になる
3. いままでの採用中の肖像は「旧版」として履歴に残る（ファイルは削除されない）
4. ほかの候補・無関係なファイルには一切触れない

Plus the caveat that no crop/edit step is required. Confirm is a single deliberate button
(「この候補を採用する」); cancel is equally reachable. After adoption the studio re-renders:
candidate → gold frame; former active → 旧版 card at the head of the rail; if the adopted file
is outside the versioned convention the authority note reappears — the rules don't bend for
the happy path. Esc closes; focus returns to the triggering card.

## 8. Failure-State Design

Four failure classes, four different faces (scenario 失敗と迷子):

| Class | Face | Retry story |
|---|---|---|
| QUEUE_REJECTED | first stage dot red; red box "ジョブはそもそも存在しません" | ✓ 再試行は安全 (green) — no duplicate possible |
| ORPHANED (job) | dashed candidate card, ◌ ghost, no image | 猶予期間超過の説明; check ComfyUI before retrying |
| MISSING_FILE | dotted candidate card, ⊘ ghost | record-without-artifact; adoption disabled with reason |
| ADOPTION_FAILED | red-tinted card, image visible | verification reason quoted verbatim (freshness rule); 再採用可能 |
| TIMED_OUT (designed) | final dot red | warns ComfyUI may still be running → duplicate risk |

## 9. Responsive / Accessibility Decisions

- **Keyboard:** skip-link; scenario tablist with roving tabindex + ←/→; every candidate action
  a native button; modal Esc-close with focus return (verified in-browser).
- **Reduced motion:** stage-dot breathing, modal/toast animations and transitions disabled;
  the ticking clock is textual and remains.
- **Not color-only:** failure classes differ by border style (solid/dashed/dotted), icon, and
  wording — not just hue; adoption state is a labeled ribbon, not a glow.
- **Long Japanese text:** `overflow-wrap:anywhere` on filenames/notes; the mixed scenario
  includes long adoption notes and the 200-char-class messages wrap cleanly at 400px
  (`scrollWidth === clientWidth` verified).
- **Responsive:** ~1560px = 2-column atelier (portrait left, activity right) + full-width
  archive; ≤860px single column with centered active frame, compare modal stacks vertically;
  ≤560px bottom-sheet modal, 2-up candidate grid. Missing images always render as ghosts.

## 10. Recommended Production Implementation Slices

Small, independently landable:

| # | Slice | Contents | Size |
|---|---|---|---|
| 1 | `portraitStudioCore.ts` (pure) | Derive studio view-model from character JSON + `characters/` listing: active identity, adoption-kind classification (versioned/fixed/manual), candidate states GENERATED/SUPERSEDED/MISSING_FILE, versioned-name check. Unit tests. No UI. | S |
| 2 | Studio webview panel (read-only) | New `89f-portrait-studio.js` + CSS (bundle-order contract like PLAY-UX-001); renders A+C from a new `portraitStudioView` host message built on existing loaders + JSON watcher; i18n ×4 locales. No writes. | M |
| 3 | Job status surface | Host parses `TA_MEDIA_STATUS` lines from the subprocess stream and forwards `portraitJobStatus{promptId,state,elapsedSeconds}` to the webview; stage rail + alive box + budget; Generate guard wired to job state. **Depends on MEDIA-COMFY-001 merge.** | M |
| 4 | Explicit adoption command | Host command `adoptPortraitCandidate(characterId, relativePath)`: re-runs path/ownership validation, writes JSON atomically (`writeJsonAtomic`), emits refresh; compare modal UI calls it. Manual-upload path unified to versioned names here too. | M |
| 5 | Candidate ledger (only new store) | Capped `characters/<id>.portraits.json` (≤50 entries: file, createdAt, intent id, promptId, terminal state) written by host on generation events; enables intent/job metadata on cards + batch folds. Design-gate the schema first. | M |
| 6 | Intent picker (interim) | Three fixed intents mapped to today's prompt builder (full-body / bust / expression variants) + advanced read-only compiled-plan fold from `MediaProfile` preflight. Full MediaIntent compiler stays with MEDIA-ARCHITECTURE-001 phases. | S–M |
| 7 | Composition heuristics (future gate) | Optional VLM pass tagging multi-subject / subject-too-small as 自動判定 chips; requires design + cost gate; UI slots already exist. | M |

---

**Verification performed:** prototype served locally and driven in-browser — all 4 scenarios
render with correct states; adoption flow (compare → confirm → gold frame moves, old active
becomes 旧版, authority warning clears when adopting a versioned file); Esc/focus-return;
tablist arrow keys; live elapsed/heartbeat tick (06:48→06:50 observed); no horizontal
overflow at 400px; console clean.

## Final Verdict

**PORTRAIT_STUDIO_001_PROTOTYPE_READY_FOR_IMPLEMENTATION**
