# ANTIGRAVITY-INSTALL-002 - Implementation

- AI: Codex
- Model: GPT-5.4
- Reasoning: High
- Role: Focused installer performance repair for the real everyday Antigravity installation path
- Date: 2026-07-08 JST

## Exact baseline

- Expected `origin/main`: `a90ba596c32d491af5d517295f39bba805e56558`
- Observed `origin/main` after fetch: `a90ba596c32d491af5d517295f39bba805e56558`
- Baseline verdict: MATCH

Implementation branch:

```text
task/ANTIGRAVITY-INSTALL-002-fast-install
```

Dedicated worktree:

```text
C:\AI\wt-antigravity-install-002-fast-install
```

The dirty root worktree at `C:\AI\text-adventure-vsce` was not reset, cleaned, switched, or stashed.

## Phase 1 - Real user entrypoint provenance

Root worktree at investigation time:

```text
branch: task/ANTIGRAVITY-INSTALL-001-verify
HEAD:   ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7
relation to origin/main: 4 behind / 1 ahead
status:
- M webview/script.js
- ?? .claude/
```

Tracked-content comparison from the root worktree against exact `origin/main`:

```text
git diff --name-only origin/main..HEAD -- install_extension_antigravity.bat scripts/install_vscode_extension.ps1 scripts/install_common.ps1 .vscodeignore
-> scripts/install_common.ps1
-> scripts/install_vscode_extension.ps1
```

Meaning:

- `install_extension_antigravity.bat` tracked content matched current main.
- `.vscodeignore` tracked content matched current main at the start of this task.
- `scripts/install_common.ps1` differed from current main.
- `scripts/install_vscode_extension.ps1` differed from current main.

Conclusion:

- The visible everyday BAT entrypoint itself was not the stale part.
- The BAT delegated into stale installer scripts in the dirty root worktree.
- Therefore a normal BAT invocation from the dirty root was not proven to use intended current-main installer code.

## Phase 4 - Exact source of the visible `Expand-Archive`

The user-observed visible path:

```text
Expand-Archive
C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-....zip
```

was traced to the stale root installer code, not current main.

Exact stale-root source evidence in `C:\AI\text-adventure-vsce\scripts\install_common.ps1`:

- `Expand-ArchiveSafe` copied `.vsix` to a temp file named:

```text
lorerelay-vsix-{guid}.zip
```

- then generated a temp PowerShell script named:

```text
lorerelay-unzip-{guid}.ps1
```

- that script executed:

```text
Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force
```

Current implementation branch evidence:

- `scripts/install_common.ps1` now extracts with:

```text
[System.IO.Compression.ZipFile]::ExtractToDirectory(...)
```

- current run log from the clean worktree contained:

```text
VISIBLE_EXPAND_ARCHIVE=False
```

Classification:

`stale root installer code`

More precisely:

```text
install_extension_antigravity.bat
-> stale root scripts/install_vscode_extension.ps1
-> stale root scripts/install_common.ps1::Expand-ArchiveSafe
-> temp lorerelay-vsix-....zip
-> visible Expand-Archive
```

This was not the current-main CLI path and not the repaired clean-worktree install path.

## Implemented changes

### 1. Package hygiene

Updated `.vscodeignore` to defensively exclude local AI/worktree artifacts:

- `.claude/**`
- `.codex/**`
- `*.vsix`

This prevents accidental packaging of local AI worktrees and nested VSIX artifacts during ordinary user installs.

### 2. Canonical VSIX output moved outside the repo

Added helpers in `scripts/install_common.ps1`:

- `Get-LoreRelayVsixArtifactsDir()`
- `New-LoreRelayVsixArtifactPath(version)`

New behavior:

- the canonical generated installer VSIX is written to:

```text
C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-artifacts\lorerelay-1.77.15.vsix
```

- no canonical generated VSIX is written into:

```text
C:\AI\text-adventure-vsce
```

### 3. CLI-success path no longer runs direct-folder fallback

Added orchestration helper in `scripts/install_common.ps1`:

- `Invoke-PrimaryInstallWithFallback(...)`

New Antigravity behavior in `scripts/install_vscode_extension.ps1`:

- try Antigravity CLI first
- if CLI succeeds:
  - mark install successful
  - explicitly skip direct-folder fallback
- if CLI is unavailable or fails:
  - run safe direct-folder fallback

### 4. Fallback reuse avoids repeated archive extraction

Added reusable prepared-content helpers in `scripts/install_common.ps1`:

- `New-PreparedVsixInstallContent(...)`
- `Remove-PreparedVsixInstallContent(...)`
- `Install-PreparedExtensionToDirAtomic(...)`

Fallback behavior now:

- validate once
- extract once
- reuse the prepared extension content across all fallback roots
- preserve existing atomic replacement / rollback safety

### 5. Real fallback target inspection

Observed real extension roots:

- `C:\Users\Keisuke\.antigravity\extensions`
- `C:\Users\Keisuke\.antigravity-ide\extensions`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions`

All three existed and all three contained `miya.lorerelay-1.77.15`.

Therefore:

- multiple direct-folder targets are genuinely necessary on fallback in this environment
- fallback discovery was expanded to include `.antigravity-ide\extensions`
- fast-path CLI success still skips fallback entirely, per task requirement

## Focused tests added/updated

Extended `scripts/test_antigravity_installer.ps1` to prove:

1. artifact helper keeps generated VSIX outside the repo root
2. `.vscodeignore` excludes:
   - `.claude/**`
   - `.codex/**`
   - `*.vsix`
3. CLI success does not invoke direct-folder fallback
4. CLI failure invokes direct-folder fallback
5. existing integrity / atomic replace / rollback tests still pass

## Test results

Focused installer test:

```text
node scripts/test_antigravity_installer.js
-> PASS
```

Compile:

```text
npm run compile
-> PASS
```

Full suite handling:

- first sequential `npm test` hit only the known Symbol Registry Windows CRLF false-positive
- proved zero real content diff:

```text
git diff --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json
-> exit 0

git diff --ignore-cr-at-eol --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json
-> exit 0
```

- normalized with:

```text
npm run generate:symbol-registry
node scripts/test_symbol_registry.js
```

- final rerun:

```text
npm test
-> PASS (228/228)
```

## Package-content proof

Behavior proof with ignore probes in the clean implementation worktree:

- created temporary untracked:
  - `.claude/package-probe.txt`
  - `.codex/package-probe.txt`
  - `nested-probe.vsix`
- ran `npx @vscode/vsce ls --tree`
- verified all three were excluded
- removed the probes afterward

Actual packaged VSIX from the repaired clean-worktree install path:

```text
Path:   C:\Users\Keisuke\AppData\Local\Temp\lorerelay-vsix-artifacts\lorerelay-1.77.15.vsix
Files:  969
Size:   25439343 bytes
SHA256: ca2a92b6e84035da4d01fdda5fee379a67e2168d1bbb0a58da61dd0755ac9bd3
```

ZIP content checks:

```text
HAS_REQUIRED_CONTENT_TYPES=True
HAS_REQUIRED_MANIFEST=True
HAS_REQUIRED_PACKAGE_JSON=True
NESTED_VSIX_COUNT=0
CLAUDE_ENTRY_COUNT=0
CODEX_ENTRY_COUNT=0
GIT_ENTRY_COUNT=0
BACKUPISH_ENTRY_COUNT=0
```

Result:

- clean package is in the expected normal class near 25 MB, not the prior 76 MB class
- no nested VSIX
- no `.claude`
- no `.codex`
- no `.git`
- no installer backup/staging/temp content

## Real normal-entrypoint timing proof

BAT-equivalent command run from the clean implementation worktree:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install_vscode_extension.ps1 -Target antigravity
```

Recorded phase timestamps:

```text
Install started at:   2026-07-08T18:37:09.1539385+09:00
Package complete at:  2026-07-08T18:37:24.8657550+09:00
CLI install complete: 2026-07-08T18:37:30.7195047+09:00
Install finished at:  2026-07-08T18:37:30.7216244+09:00
```

Computed durations:

```text
package phase: 15712 ms
cli phase:      5854 ms
total:         21568 ms
wrapper total: 21775 ms
```

Observed runtime behavior:

```text
FALLBACK_RAN=False
SKIPPED_FALLBACK=True
VISIBLE_EXPAND_ARCHIVE=False
WRAPPER_EXIT=0
```

This proves the repaired normal path:

- packaged outside the repo worktree
- succeeded through CLI
- did not run direct-folder fallback after CLI success
- did not show the old visible `Expand-Archive` path

## Final installed version evidence

Observed post-run install directories:

```text
C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15
C:\Users\Keisuke\.antigravity-ide\extensions\miya.lorerelay-1.77.15
C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15
```

Observed versions:

```text
all three -> 1.77.15
```

Observed last-write times after the measured install:

- `.antigravity-ide\extensions\miya.lorerelay-1.77.15`
  - updated during the measured CLI run
- `.antigravity\extensions\miya.lorerelay-1.77.15`
  - unchanged during the measured CLI-success run
- `.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15`
  - unchanged during the measured CLI-success run

This matches the intended new contract:

- CLI success is the fast authoritative path
- direct-folder roots remain available only for fallback

## Changed files

- `.vscodeignore`
- `scripts/install_common.ps1`
- `scripts/install_vscode_extension.ps1`
- `scripts/test_antigravity_installer.ps1`

## Final verdict

`ANTIGRAVITY_INSTALL_002_READY_FOR_VERIFY`
