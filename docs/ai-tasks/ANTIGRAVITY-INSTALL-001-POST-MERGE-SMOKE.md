# ANTIGRAVITY-INSTALL-001 - Post-Merge Smoke

- Date: 2026-07-08 JST
- Repository: `GGF1sh/LoreRelay`
- Initial `origin/main`: `176cd5f050a19cb09e70006af7f7760921d5dd8b`
- Implementation commit: `3cb51a31b173ac511b6d9522e03a405a867b665b`
- Independent verify commit: `ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7`
- Integration tip pushed to `main`: `a5dea994480ec9dd84933027aa7172f263cd15fa`

## Precondition and integration

Verified before any write:

```text
git rev-parse origin/main
-> 176cd5f050a19cb09e70006af7f7760921d5dd8b

git rev-parse 3cb51a31b173ac511b6d9522e03a405a867b665b
-> 3cb51a31b173ac511b6d9522e03a405a867b665b

git rev-list --left-right --count origin/main...3cb51a31b173ac511b6d9522e03a405a867b665b
-> 0 1

git show --name-only --format=oneline ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7
-> docs/ai-tasks/ANTIGRAVITY-INSTALL-001-VERIFY.md only
```

Fresh clean integration worktree:

```text
C:\AI\wt-antigravity-install-001-main-smoke
```

Integration sequence:

```text
git merge --ff-only 3cb51a31b173ac511b6d9522e03a405a867b665b
git cherry-pick ec453fb9f79ad5f1d7c1b61a8bc0a08413869fd7
git push origin HEAD:main
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
-> a5dea994480ec9dd84933027aa7172f263cd15fa
```

## Smoke commands and results

Clean smoke worktree contained no tracked or untracked `*.vsix` before packaging.

```text
npm ci --include=dev
-> PASS

node scripts/test_antigravity_installer.js
-> PASS

npm run compile
-> PASS
```

Initial full suite run:

```text
npm test
-> FAIL only at test_symbol_registry.js
```

False-stale diagnosis for the known Windows EOL condition:

```text
git diff --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json
-> exit 0

git diff --ignore-cr-at-eol --exit-code -- docs/generated/SYMBOL_REGISTRY.md docs/generated/symbol_registry.json
-> exit 0
```

Normalization and rerun:

```text
npm run generate:symbol-registry
-> PASS

node scripts/test_symbol_registry.js
-> PASS

npm test
-> PASS (228/228)
```

## Package hygiene

Real package was produced to a path outside the repository worktree:

```text
C:\AI\antigravity-install-001-smoke-artifacts\lorerelay-1.77.15-clean-smoke.vsix
```

Package-content checks:

```text
npx @vscode/vsce ls --tree
-> listing captured to C:\AI\antigravity-install-001-smoke-artifacts\vsce-tree.txt

required entries present:
- [Content_Types].xml
- extension.vsixmanifest
- extension/package.json

ZIP_ENTRY_COUNT=968
NESTED_VSIX_COUNT=0
CLAUDE_ENTRY_COUNT=0
GIT_ENTRY_COUNT=0
BACKUPISH_ENTRY_COUNT=0
VSIX_VERSION=1.77.15
VSIX_EXTENSION_ID=miya.lorerelay
VSIX_SIZE=25434266
VSIX_SHA256=abf6e0ebee5558800e822c9a6acec42100f2c64d2fdd79f480999bcee496fad7
```

Package hygiene verdict:

- No nested `*.vsix` in the actual clean package.
- No `.git` content in the package.
- No `.claude` content in the package.
- No installer backup directories in the package.
- No temporary extraction directories in the package.

## Package size discrepancy explanation

Evidence from the dirty root worktree explains the historical large-package discrepancy.

Observed in the root repository worktree:

```text
npx @vscode/vsce ls --tree | Select-String '\.claude|\.vsix|backup|extract'
-> lorerelay-1.77.15.vsix
-> .claude/
```

Measured local `.claude` footprint:

```text
CLAUDE_FILES=11825
CLAUDE_DIRS=831
CLAUDE_BYTES=198753192
```

Additional evidence:

- `.vscodeignore` does not exclude `.claude/**`.
- `.vscodeignore` does not exclude `*.vsix`.

Therefore the most plausible cause of the large historical packages is packaging from a dirty worktree that contained untracked `.claude/` content and an untracked in-repo VSIX artifact. The clean smoke package disproves a repository-committed nested-VSIX problem:

- implementation live package: `25426478` bytes, SHA `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`
- independent verify package: `80185568` bytes, SHA `ecc063a831227c4fdb6bc5c4947901f09c79e89de92b7041469fa810cc888d69`
- historical failed package class: `12019 files`, `73.59 MB`
- clean smoke package: `968 files`, `25434266` bytes, SHA `abf6e0ebee5558800e822c9a6acec42100f2c64d2fdd79f480999bcee496fad7`

The clean package remains structurally valid, contains no nested VSIX, and was used as the authoritative package-hygiene result.

## Live install smoke

Installer run from exact merged main:

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install_vscode_extension.ps1 -Target antigravity
-> INSTALL_EXIT=0
```

Observed behavior:

- Canonical VSIX validation passed.
- CLI path used an isolated temp copy.
- Canonical hash before and after CLI attempt remained identical.
- CLI install reported success for the isolated temp-copy VSIX.
- Safe atomic folder fallback also succeeded for both actual Antigravity extension roots.

Installed locations after smoke:

```text
C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15
C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15
```

Post-install verification:

```text
Target: C:\Users\Keisuke\.antigravity\extensions
- VERSION=1.77.15
- NAME=lorerelay
- PUBLISHER=Miya
- NON_LORE_UNCHANGED=True
- ENTRY_COUNT_BEFORE=34
- ENTRY_COUNT_AFTER=34

Target: C:\Users\Keisuke\.gemini\antigravity-ide\extensions
- VERSION=1.77.15
- NAME=lorerelay
- PUBLISHER=Miya
- NON_LORE_UNCHANGED=True
- ENTRY_COUNT_BEFORE=1
- ENTRY_COUNT_AFTER=1
```

No unrelated extension folders changed. Existing LoreRelay installs were preserved across the repaired install paths.

## Working-tree cleanliness during smoke

Known non-committed noise after smoke:

```text
M docs/generated/SYMBOL_REGISTRY.md
M docs/generated/symbol_registry.json
M webview/script.js
M webview/style.css
M webview/vendor/mermaid.min.js
```

These were not committed as part of this task. The symbol-registry files were diagnosed as zero real content diff under Git. The webview files remain known EOL/generated noise and are outside the installer scope.

## Final verdict

`ANTIGRAVITY_INSTALLER_001_DONE_REAL_RELAY_SMOKE_PENDING`
