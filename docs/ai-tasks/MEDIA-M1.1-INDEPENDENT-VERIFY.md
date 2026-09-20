# MEDIA-M1.1 Independent Adversarial Verification

Status: `MEDIA_M1_1_REPAIR_REQUIRED`

Reviewer role: independent adversarial verification. This review agrees with neither the
implementer nor the report by default and searched for real defects and counterexamples.

Verifier: Claude (Opus 4.8, high reasoning). Date: 2026-07-10 (JST).
Method: direct source inspection + behavioral testing at real production seams (compiled
`out/` modules, real fixtures, real installed-skill state on the canonical machine).
No production code modified. No merge performed. No subagents used.

---

## 1. Integrity — PASS

| Item | Expected | Observed | Result |
| --- | --- | --- | --- |
| `origin/main` | `e9f9a916063ab530ccfe184cfe66a34f9588c399` | matches | MATCH |
| Implementation commit | `0836b18c2b126f4a5a1afa34cdf5054333eb4d31` | present | MATCH |
| Candidate / report HEAD | `f2720fb0fa4c4145dc259830767129da34d85786` | present | MATCH |
| Ancestry | `main → 0836b18 → f2720fb` | `merge-base --is-ancestor` both true | MATCH |
| Ahead / behind vs main | 2 / 0 | `0 2` | MATCH |
| Second commit | report only | `f2720fb` = 194 insertions to `MEDIA-M1.1-PORTRAIT-ARTIFACT-SYNC.md` only | MATCH |

Review branch `task/MEDIA-M1.1-independent-verify` created off `f2720fb`; `git diff f2720fb HEAD`
is empty (reviewer made no code edits). `git diff --check` clean.

Production touch set (source, separated from tests/generated/docs): `src/mediaArtifactCore.ts` (new),
`src/portraitArtifact.ts` (new), `src/characterManager.ts`, `src/extension.ts`,
`antigravity-skill/text-adventure-gm/scripts/comfyui_generate.py`,
`antigravity-skill/text-adventure-gm/scripts/portrait_artifact.py` (new),
`antigravity-skill/text-adventure-gm/SKILL.md`, `locales/{en,ja,zh-CN,zh-TW}.json`.

---

## 2. Gate results summary

| Gate | Verdict |
| --- | --- |
| 1. CLI help | PASS |
| 2. Exact artifact authority | PASS |
| 3. Portrait adoption atomicity | PASS |
| 4. Regeneration / cache | PASS |
| 5. Character JSON + left UI sync | PASS |
| 6. Native generatePortrait | PASS |
| 7. Antigravity Skill contract | PASS |
| **8. Installed-Skill drift gate** | **FAIL — required gate silently skipped by default** |
| 9. Python argument contract | PASS |
| 10. Tests (237/237) | PASS |

Nine of ten gates pass and are behaviorally proven. Gate 8 — the highest-scrutiny item — fails:
a required install-verification safety gate is now silently skipped by default, with real,
currently-present drift on the canonical machine, and no wired mandatory replacement. Per the
task's explicit rule ("If the change merely made tests green by weakening a required safety gate,
verdict must be REPAIR_REQUIRED"), the final verdict is `MEDIA_M1_1_REPAIR_REQUIRED`.

---

## 3. Gate 8 — Installed-Skill drift gate (BLOCKER)

### The change

`scripts/test_antigravity_file_bridge.js`:

```js
// before
if (fs.existsSync(installedSkill)) {
    assert.strictEqual(sha256(sourceSkill), sha256(installedSkill),
        'installed skill must match repo-owned source when present');
}
// after
if (fs.existsSync(installedSkill) && process.env.LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC === '1') {
    assert.strictEqual(sha256(sourceSkill), sha256(installedSkill),
        'installed skill must match repo-owned source during an explicit installation verification');
}
```

The installed-vs-repo SKILL.md hash check now runs only when `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1`.

### The legitimate half (satisfied)

Requirement "ordinary source tests may not require an already-installed old Skill to match a new
candidate" is satisfied. MEDIA-M1.1 legitimately changes `SKILL.md`; a task explicitly forbidden
from running the installer should not fail source tests merely because the machine's installed
skill is older than the repo. Gating the check out of the default source-test path is a reasonable
separation of concerns in **motivation**.

### The failing half (the blocker)

Requirements "canonical integration/install verification must still have a **mandatory** way to
prove installed Skill == repo Skill" and "no important release gate may now silently skip this
check" are **not** satisfied.

**Repo-wide search finding.** `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC` appears in exactly two
places in the entire repository: the test that reads it, and the report doc that mentions it.
**Nothing sets it** — not `install_antigravity_skill.ps1`, not `install_vscode_extension.ps1`, not
the `install_extension_antigravity.bat` flow, not `install_common.ps1`, not any `package.json`
script, not CI, not any post-merge smoke doc or checklist. The installer (`install_antigravity_skill.ps1`)
merely copies the skill folder and performs **no** post-install hash verification; the only
`Get-FileSha256` uses in `install_common.ps1` are for VSIX integrity, not SKILL.md drift. So the
drift detector for the Antigravity skill now has **no** wired, mandatory path in any canonical gate.

**Historical role (this was a real gate, not a nicety).** `docs/ai-tasks/ANTIGRAVITY-RELAY-002-REPAIR-VERIFY.md`
records this exact check functioning as the canonical drift gate:
> "Before reinstall, this machine had a **stale** installed skill (`ecc8ef17…` ≠ repo `43f2cbb5…`),
> so `test_antigravity_file_bridge.js` failed the optional 'if installed, must match' hash. … After
> reinstall from the repair tree, the hash matched and the test passed."
> Smoke table: `test_antigravity_file_bridge.js` — PASS "After reinstalling skill from repo source;
> **FAIL** before if installed skill stale."

The LoreRelay canonical post-merge install smoke runs `npm test` locally on a machine that has the
skill installed (handoff records repeatedly show "npm test NNN/NNN" plus "installed Gemini skill
hash matched repo-owned skill"). Before MEDIA-M1.1, that smoke's `npm test` would FAIL on a stale
installed skill and force a reinstall. After MEDIA-M1.1, the same smoke passes with a stale skill.

### Behavioral proof (not source-grep alone)

On this canonical developer machine, right now:

```
repo source SKILL.md sha256:   847426599f6ab7e940fc23b2c8bd4d1506e228c20a260c9559ba55f7510198b7
installed  SKILL.md sha256:   6f51703d45f7bb399339357f20667cbeb29cf082e455d88049645e6304492dfb   (DRIFT)

node scripts/test_antigravity_file_bridge.js                                   -> PASS  (drift ignored)
LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1 node scripts/test_antigravity_file_bridge.js -> FAIL exit 1
   AssertionError: installed skill must match repo-owned source during an explicit installation verification
```

Real drift exists **now** (MEDIA-M1.1 changed `SKILL.md`; the installed copy predates it). The full
`npm test` reports **237/237** on this machine while the installed Antigravity skill is stale — i.e.
a post-merge install smoke of this very candidate would report all-green while the user is still
running the OLD skill without the new portrait-adoption contract. That is precisely the
"stale skill / false success" class MEDIA-M1.1 set out to eliminate on the AI side, reintroduced on
the install-verification side.

### Verdict for Gate 8

The separation is legitimate in motivation but the implementation removed a real, previously-firing
release gate from the default path without wiring any mandatory replacement. The change "made tests
green by weakening a required safety gate." → **REPAIR_REQUIRED**.

### Required repair (small, non-invasive — not a redesign)

Any one of the following restores a mandatory canonical proof that installed == repo:

1. Add a post-copy hash assertion to `install_antigravity_skill.ps1` (installed SKILL.md sha256 must
   equal source after `Install-SkillFolderAtomic`), making the installer itself the gate,
   independent of the env var; **or**
2. Add a wired `package.json` script (e.g. `test:install-verify`) that sets
   `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` and runs at least `test_antigravity_file_bridge.js`,
   and reference it as a **required** step in the canonical post-merge install smoke procedure; **or**
3. Document `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1` as a mandatory step in the canonical install
   smoke checklist (weakest option; relies on procedure discipline).

Additionally, the current stale installed skill on the canonical machine must be reinstalled from
repo source before the MEDIA-M1.1 human smoke, or that smoke would validate a stale skill.

---

## 4. Gate 1 — CLI help — PASS

`comfyui_generate.py` handles `--help`/`-h` as the first branch in `main()`, before `--list-models`
and before any prompt/workflow/network processing: `print_help(); sys.exit(0)`. Exit 0, no workflow
load, no ComfyUI request. `test_portrait_artifact_adoption.py` exercises this behaviorally
(exit 0 with a missing workflow and unreachable endpoint). Normal generation is unaffected (help is
only matched at `argv[1]`).

## 5. Gate 2 — Exact artifact authority — PASS (behaviorally proven)

- Host parses only `TA_MEDIA_RESULT ` lines via `parseMediaArtifactResult`, keeping the **last**
  valid record; the legacy plain absolute-path line is ignored.
- `verifyAdoptedPortraitArtifact` requires the versioned name
  `^<id>_portrait_[0-9a-f]{16}\.(png|jpe?g|webp)$`, so an old `scene_*.png` path can never be
  accepted as the adopted artifact.
- Freshness: `createdAt` must be ≥ `notBeforeMs − 2000`; a stale earlier-attempt result is rejected.
- `test_portrait_artifact_sync.js` proves all of the above with two competing `TA_MEDIA_RESULT`
  lines (a stale 2020 one + a fresh one): the fresh/last one wins, the stale one is rejected, and a
  bare legacy path returns `undefined`.

## 6. Gate 3 — Portrait adoption atomicity — PASS (behaviorally proven)

`portrait_artifact.py::adopt_character_portrait`:
- character-id regex `^[A-Za-z0-9_-]{1,64}$`; workspace resolved `strict=True`.
- artifact `is_symlink()` rejected before resolve; `resolve(strict=True)` then `_is_under(workspace)`
  gives real Windows containment through junctions; extension allow-list; size bounds.
- `characters/` resolved strict and contained; character JSON must be a non-symlink file whose `id`
  matches.
- destination opened with `"xb"` (exclusive create — no overwrite); JSON written atomically
  (`os.replace`); on any exception the newly created destination is unlinked and the error re-raised,
  leaving the previous JSON/portrait authoritative.
- `test_portrait_artifact_adoption.py` passes and covers the failure-preservation and containment
  cases. Path-traversal/symlink/junction escape is blocked by the symlink reject + strict realpath
  containment on both the Python and host (`resolveAllowedImagePath` via `realpathSync` + `isUnderRoot`,
  symlink rejected via `lstatSync`) sides.

## 7. Gate 4 — Regeneration / cache — PASS (behaviorally proven)

- Version token = `sha256(file_bytes + created_at)[:16]`; `created_at` carries microseconds, so a
  regeneration yields a new token → new filesystem path → new Webview URI even for identical bytes.
  `test_portrait_artifact_sync.js` asserts the fresh URI (`newUri !== oldUri`).
- Cleanup runs only after the authoritative JSON update and only removes files matching
  `^<id>_portrait_[0-9a-f]{16}\.(ext)$`, skipping the just-adopted destination, symlinks, and
  non-files.
- User-uploaded portraits use the fixed name `<id>_portrait.<ext>` (`resolvePortraitPath`) with **no**
  version token, so they never match the cleanup pattern. Other characters' files are protected by
  the per-`characterId` `re.escape` anchor + `fullmatch`. Neither is deleted.

## 8. Gate 5 — Character JSON + left UI sync — PASS

- Adopted path is written exactly (host verify requires `character.portrait` to normalize-equal the
  adopted artifact).
- `initCharacterManager` creates a `characters/*.json` `FileSystemWatcher`, **disposes any prior
  watcher first** (no leak/duplication across panel/workspace/session re-init), debounces refreshes
  at 75 ms (rapid writes coalesce; no stale UI), refreshes only when a panel exists, and registers
  the watcher in `subscriptions` for disposal. External Antigravity writes to `characters/<id>.json`
  therefore refresh the left Character Profile.

## 9. Gate 6 — Native generatePortrait — PASS

- The old directory-wide `readdirSync`+newest-`scene_*` scan is **gone** from `generatePortrait`; it
  now spawns with `--character-id`/`--workspace`, parses the exact subprocess stdout, and verifies
  via `verifyAdoptedPortraitArtifact`.
- `generationStartedAt = Date.now()` is captured before spawn and used as the freshness floor.
- `imageGenEnd` is always posted in `finishPortrait` (runs on `close` and `error`, guarded by
  `finished`); `portraitProcess` is cleared there, so busy state always clears and retry works.
- `success` is set true only after durable adoption is verified and the URI/messages are posted.
- Note: `generateExpression` still uses the legacy `scene_*` scan (line ~628). That is **out of
  MEDIA-M1.1 scope** (expression identity is M4) and not a regression; recorded as a boundary, not a
  defect.

## 10. Gate 7 — Antigravity Skill contract — PASS

`SKILL.md` (asserted by `test_portrait_artifact_sync.js`) forbids false portrait success,
newest-file guessing ("Never select the newest file in a directory"), stale `turn_result.json`
portrait paths, and invented `file:///` Markdown; and requires a successful `TA_MEDIA_RESULT` plus
exact character-JSON binding as authority.

## 11. Gate 9 — Python argument contract — PASS

- `--character-id` and `--workspace` are parsed from `argv[4:]`; `_option_value` raises (exit 2) if
  an option is present without a value.
- Pairing enforced: `bool(character_id) != bool(adoption_workspace)` → exit 2.
- Standalone generation (neither flag) stays backward compatible: prints the plain path and emits a
  `success:true` `TA_MEDIA_RESULT` without a `characterId`; positional prompt/output/mode remain
  intact. (Minor: flags placed before position 4 are silently treated as positionals; the documented
  native/Skill invocation always passes the three positionals first, so this is a non-issue in
  practice.)

## 12. Gate 10 — Tests — PASS (237/237)

```
npm run compile                                 -> PASS (lorerelay@1.78.0)
python scripts/test_portrait_artifact_adoption.py -> PASS
node scripts/test_portrait_artifact_sync.js       -> PASS (12 behavioral assertions)
python scripts/test_comfyui_media_contract.py     -> PASS
node scripts/test_antigravity_file_bridge.js      -> PASS (default env — see Gate 8)
node scripts/check_i18n_keys.js                   -> PASS (0 missing across en/zh-CN/zh-TW)
npm run check:symbol-registry                     -> PASS
npm test                                          -> PASS 237/237 (44.1s)
```

The behavioral tests genuinely prove exact artifact selection, stale-artifact rejection, cache
refresh (fresh URI), and host-side failed-adoption non-mutation — not source grep alone. The
Python adoption test covers the mutation-preservation and containment paths.

---

## 13. Counterexample of record

Canonical machine, current state: installed `SKILL.md` (`6f51703d…`) ≠ repo `SKILL.md`
(`847426599f…`). Default `npm test` → 237/237 green; `LORERELAY_REQUIRE_INSTALLED_SKILL_SYNC=1
node scripts/test_antigravity_file_bridge.js` → FAIL exit 1. A required install-verification gate is
silently skipped by default, and no repo mechanism sets the flag. This is the counterexample that
prevents a PASS verdict.

## 14. Limitations / boundaries (non-blocking)

- `generateExpression` still uses the legacy newest-`scene_*` scan (M4 scope, not M1.1).
- Freshness tolerance is ±2 s; combined with the mandatory exact JSON→artifact binding this is not
  exploitable in practice.
- Host `object_info`/installed-checkpoint proof remains out of scope (inherited MEDIA-M1 limitation).

## 15. Scope — PASS

No Media Intent, prompt compiler, visualIdentity, expression img2img, Action Router, manual-handoff
generalization, hardware tier/AUTO, cloud, or model management was introduced. Only portrait
artifact adoption/sync.

---

## Final verdict

`MEDIA_M1_1_REPAIR_REQUIRED`

The portrait artifact adoption and sync implementation is otherwise strong: the exact artifact
authority, adoption atomicity, cache-fresh regeneration, character-bounded cleanup, native
`generatePortrait` verification, watcher sync, and Python argument contract all hold under
adversarial testing and are behaviorally proven, with 237/237 tests passing. However, the Gate 8
change to the installed-Skill drift check removed a real, previously-firing canonical
install-verification gate from the default path without wiring any mandatory replacement — and the
canonical machine currently has undetected skill drift that the default suite reports as green.
Per the task's explicit rule, a required safety gate weakened to green mandates
`MEDIA_M1_1_REPAIR_REQUIRED`. The repair is small and scoped (Section 3): restore a mandatory
canonical proof that the installed Skill matches repo source, and reinstall the drifted skill before
the human smoke.
