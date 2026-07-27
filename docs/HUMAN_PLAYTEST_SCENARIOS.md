# Human Playtest Scenarios

> Status: Current canonical human playtest procedure
> Purpose: Let a human actually play current `main` in a short session and find real
> breakage, confusing UX, and control feel that automated tests and static harnesses
> cannot judge.
> Scope: This document lists **what to play and what to look for**, not a feature
> inventory. It does not replace `docs/AI_INTEGRATOR_CHAT_HANDOFF.md` or
> `docs/ai-tasks/LORELAY-CURRENT-HANDOFF.md`.

Before playing, follow `docs/AI_WORKFLOW.md` and
`docs/DEVELOPMENT_VERIFICATION_POLICY.md`. This document itself does not add a new
verification tier — it only tells a human what to click and what to watch.

## How to use this document

- Run **A → B → C → D** as the normal rotation (roughly 45–70 minutes total).
- **E1** and **E2** are separate optional tracks. Do not mix them into the normal
  rotation; they need a second device or an external AI environment.
- The **Optional** neon-rain smoke at the end is not part of the normal rotation.
- Do not turn this into a checklist-completion exercise. The goal is to notice real
  problems, not to accumulate evidence. If something already plays fine, a short note
  ("no issues") is enough — do not manufacture extra screenshots or repeat steps that
  did not reveal anything new.
- If a step's stated **Allowed skip reason** applies, record `SKIPPED_WITH_REASON` and
  move on. Do not add new audits or hardening passes to try to unblock a skip.

## Human-only checks vs. existing automated/static coverage

Some things below can only be judged by an actual human playing the app; others are
already checked by existing automated tests or static tooling, so a human should not
repeat them from scratch every session:

| Already covered (do not re-verify by hand) | Still human-only |
|---|---|
| Combat Lab determinism (`combatLabCore.ts` self-verifies via repeated resolve on each run; `combat_test_manifest.js` CI suite) | Whether combat feels readable/enjoyable to watch (VFX, pacing, clarity) |
| i18n key completeness across locales (`check_i18n_keys.js`) | Whether a key actually renders correctly on screen in context |
| Start Hub button wiring (can be pre-checked with the static webview harness) | Whether the layout/labels look right and nothing is visually broken |
| — | Checkpoint/save data-shape correctness — see note below |

Because determinism is already machine-verified, **do not** ask a human to repeat a Run
twice to "prove" determinism (see section C). The human's job is to judge the
player-visible result.

**Checkpoint/save is not machine-verified end to end.** The repository has no unit
test that exercises the checkpoint save/restore round trip; the only test reference to
`checkpointHandlers.ts` is a textual assertion in
`scripts/test_runtime_accepted_replay_guard.js` that the source contains certain
`runTimelineRestore(...)` call strings, not a behavioral test. Treat section D below as
the real coverage for this path, not a repeat of something already proven.

---

## A. 起動スモーク (Startup Smoke)

**Purpose:** Confirm the app starts, Start Hub renders correctly, and the most basic
interactive path (debug-sandbox) works — without spending time launching every entry
point.

**Estimated time:** ~5 minutes

**Preconditions:** Current `main` extension installed/reloaded; workspace open; panel
not yet opened this session.

**Steps:**
1. Open the LoreRelay panel.
2. Visually check the Start Hub: main button groups, individual buttons, and preset
   chips are all present and rendered — **do not click every button**, this step is a
   visual/layout check only.
3. Start `debug-sandbox` (the only scenario actually launched in this step).
4. In chat, send: `ヘルプ`, then `状態`, then `5ターン経過`.
5. Confirm the `Adventure Status` tab and the Combat Lab card both appear (Combat Lab
   self-mounts there; it is not a Start Hub button).

**What to observe:**
- No raw i18n keys visible anywhere (e.g. no literal strings like
  `webview.xxx.yyy`).
- No obvious layout breakage (overlapping text, cut-off panels, unreadable buttons).
- The three debug-sandbox commands return sensible responses and the turn counter
  advances by 5.

**Pass criteria:** Start Hub renders cleanly with no raw i18n keys or broken layout;
debug-sandbox responds to all three commands without error; Adventure Status and
Combat Lab card both appear.

**Evidence to retain:** One screenshot of the Start Hub, one screenshot after `5ターン経過`. Nothing more.

**Allowed skip reason:** None — this step is fast enough that it should always run.

---

## B. 通常プレイ (Normal Play — `scrapbound-settlement`)

**Purpose:** Play the main gameplay loop (Campaign Kit + Commerce) end to end and
judge whether it is fun, clear, and free of dead ends.

**Estimated time:** ~20–30 minutes

**Preconditions:** `scrapbound-settlement` launched fresh (via the Start Hub
"スカベンジャーデモ" button).

**Steps:**
1. 掲示板を見る (check the board)
2. 暮らす (live/settle)
3. 取引で何か購入 (buy something at a trade)
4. 一日を終える (end the day)
5. 旅タブを確認 (check the travel tab)
6. If a destination is available: travel there, then 売却 (sell)
7. If no destination is available yet: this is not a failure by itself — see pass
   criteria below
8. 状態確認 (check status)

**What to observe:**
- Whether appraisal state transitions make sense (unidentified → identified → sellable).
- Whether trade UI numbers stay consistent (money, stock, prices).
- Whether the travel tab's destination list is understandable.
- Fun, friction points, and whether GM responses feel natural — record these as human
  judgment notes, not as pass/fail line items.

**Pass criteria:** The loop completes through step 8 without a hard dead end.
Traveling to another market and selling there is **not** a required pass condition. If
no destination exists yet, pass requires only that the reason it's unavailable, and
what the player needs to do next, is understandable from the UI/narration.

**Evidence to retain:** 3–4 screenshots (board, trade, post-sell or post-status), plus
a short free-text note on fun/friction/GM naturalness. If something got stuck, keep the
relevant chat log excerpt for that turn.

**Allowed skip reason:** Skip only if `scrapbound-settlement` fails to launch at all
(record the launch error and treat as a blocker, not a skip).

---

## C. Combat Lab / Battle View (`mixed_arms_showcase`)

**Purpose:** Confirm Combat Lab's Command Playtest flow and Battle View are usable and
visually clear to a human, since Combat Lab has no story-driven entry point and is
otherwise only reachable by opening it directly.

**Estimated time:** ~10–15 minutes

**Preconditions:** Adventure Status tab open (Combat Lab is self-mounted there).

**Steps:**
1. In the scenario dropdown, select `mixed_arms_showcase`.
2. Run it once and check the result table and combat log.
3. Start a Command Playtest of the same scenario (this begins **paused** — Start does
   not auto-run).
4. Select an allied unit and issue `attack_move`. This only queues the order.
5. Click **Run** (or **Step** to advance one tick at a time) so the queued order is
   actually executed.
6. Open Battle View.
7. Try Fit, Zoom, and Pan.
8. Check the result table/outcome banner.

**What to observe:**
- Unit selection, attack-target lines, ranged/melee visual distinction, status-effect
  icons, and VFX are all legible and in sync with the underlying state.
- Fit/Zoom/Pan feel responsive and don't break the camera.
- Command mode vs. spectator mode controls enable/disable sensibly.

**Pass criteria:** Run completes and shows a result; Command Playtest accepts the
`attack_move` order and the unit responds; Battle View opens, and Fit/Zoom/Pan all
work; the result table displays a coherent outcome.

Do **not** require running Run twice to compare results for determinism — that is
already covered by existing automated tests (see the coverage table above). A single
Run is sufficient for this human pass.

**Evidence to retain:** One screenshot during active VFX/combat, one screenshot of the
result table.

**Allowed skip reason:** None expected under normal `main`; if Combat Lab fails to
mount on the Adventure Status tab, record as a blocker, not a skip.

---

## D. 保存・再起動・継続 (Save / Restart / Continuity)

**Purpose:** Confirm save, undo, checkpoint restore, and auto-restore all return the
player to the state they expect, using an explicit, unambiguous operation order.

**Estimated time:** ~5–10 minutes

**Preconditions:** Any scenario already a few turns in (reuse the state from B or C).

**Steps, in this exact order:**
1. Create a **named Save** (💾 Save with a name).
2. Advance **one turn**.
3. **Undo** — confirm it returns to the turn immediately before step 2.
4. Advance **one or more turns** again.
5. Use **checkpoint Restore** on the named save from step 1 — confirm it returns to
   that exact point.
6. Close the panel and reopen it — confirm the state **auto-restores** without any
   explicit load action.

**What to observe:**
- Compare the actual state fields that changed during this scenario's play — e.g. HP,
  money, position, inventory — between the point they were saved/expected and the
  point after each restore/undo. Only compare fields that actually moved; do not
  require checking every field in the state model.

**Pass criteria:** Undo (step 3), checkpoint Restore (step 5), and auto-restore
(step 6) each land on the correct, expected state for the compared fields.

**Evidence to retain:** A screenshot of the state panel right before the named save
(step 1) and one right after auto-restore (step 6), for direct comparison.

**Allowed skip reason:** None — this is a core reliability check.

---

## E1. Remote Play

> Separate track. Do not run as part of the normal A–D rotation.

**Purpose:** Confirm a second connected device can join, play, and stay in sync
without the host losing state.

**Estimated time:** ~10+ minutes

**Preconditions:** A second device or a separate browser session on the same network;
host has a scenario in progress.

**Steps:**
1. Start Remote Play from "⋯ More controls".
2. Open the player URL on the second device/browser.
3. Open the spectator URL (if used) as well.
4. Take an action from the second device; confirm it reflects on the host.
5. Disconnect the second device, then reconnect; confirm state stays consistent.

**What to observe:** Sync correctness between host and remote client; disconnect/
reconnect behavior; any network-specific errors.

**Pass criteria:** Actions from the remote client reflect on the host without
desync; reconnect restores the session without corruption.

**Evidence to retain:** One screenshot from the second device showing a synced action.

**Allowed skip reason:** No second device/browser available this session —
`SKIPPED_WITH_REASON: no second device`.

---

## E2. Antigravity Relay

> Separate track. Do not mix with E1 — different preconditions and different pass
> criteria (external AI hand-off, not network sync).

**Purpose:** Confirm the Relay hand-off to an external AI environment (Antigravity)
completes a full round trip.

**Estimated time:** ~10+ minutes

**Preconditions:** A real Antigravity environment available; a scenario in progress.

**Steps:**
1. Turn Antigravity Relay ON.
2. Send a left-side action; confirm the pending-request / "waiting for external AI"
   state is shown clearly.
3. Run the short trigger command in Antigravity (per current Relay UI instructions).
4. Confirm the result imports back into LoreRelay.
5. Confirm the waiting state clears and controls unlock (re-enter-able for the next
   turn).

**What to observe:** Whether the pending/waiting UI is unambiguous; whether the
result import is clean; whether the player can immediately take another turn after
completion.

**Pass criteria:** Full round trip completes — send, external processing, import,
waiting state clears, and the panel is ready for the next input.

**Evidence to retain:** One screenshot of the pending-request state, one of the
imported result.

**Allowed skip reason:** No real Antigravity environment available this session —
`SKIPPED_WITH_REASON: no Antigravity environment`.

---

## Optional: neon-rain manual load smoke

> Not part of the normal rotation. `neon-rain` is **not wired to the Start Hub** — it
> is only reachable via the `LoreRelay: Load Scenario Pack` command, which opens a
> folder picker (it does not accept a typed scenario ID).

**Purpose:** A lightweight check that the manual-load path for an unwired scenario
still works, nothing more.

**Estimated time:** ~5 minutes

**Preconditions:** None beyond the extension being installed.

**Steps:**
1. Run `LoreRelay: Load Scenario Pack`.
2. In the folder picker, select the `sample-scenarios/neon-rain` directory.
3. Confirm it loads and the opening narration/status renders.

**What to observe:** Whether selecting the `neon-rain` directory through the folder
picker resolves and loads the scenario without error.

**Pass criteria:** Scenario loads and opening content renders without error.

**Evidence to retain:** One screenshot of the loaded scenario.

**Allowed skip reason:** This entire step is optional — skip freely with
`SKIPPED_WITH_REASON: optional, not run this session`.
