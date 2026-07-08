# ANTIGRAVITY-INSTALL-001 Implementation

## Scope

- Repository: `C:\AI\text-adventure-vsce`
- Exact `origin/main` at start: `176cd5f050a19cb09e70006af7f7760921d5dd8b`
- Branch: `task/ANTIGRAVITY-INSTALL-001-vsix-integrity`

## Initial install inspection

Requested literal paths:

- `C:\Users\Keisuke.antigravity\extensions` -> missing
- `C:\Users\Keisuke.gemini\antigravity-ide\extensions` -> missing

Actual Antigravity extension locations used by the installer helpers:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15`

Initial installed LoreRelay version at both actual locations: `1.77.15`

Recoverable pre-live backup created at:

- `C:\Users\Keisuke\antigravity-installer-backups\20260708-132128-lorerelay`

## Proven facts

1. The real VSIX produced from current main is valid immediately after packaging.
   - ZIP central directory opens successfully.
   - Required entries exist:
     - `[Content_Types].xml`
     - `extension.vsixmanifest`
     - `extension/package.json`
   - `extension/package.json` version matches `package.json`.

2. The canonical packaged VSIX can be kept pristine across the CLI attempt.
   - Final packaged file:
     - path: `C:\AI\wt-antigravity-install-001\lorerelay-1.77.15.vsix`
     - size: `25426478` bytes
     - SHA-256: `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`
   - Isolated CLI attempt telemetry:
     - original hash before: `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`
     - temp-copy hash before: `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`
     - original hash after: `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`
     - temp-copy hash after: `fc646498ce2484a2821a0468fb066dc1a5ba2de9ee70d7fc0b2a349e34c9db6e`

3. The old installer had two real integrity hazards.
   - It handed the canonical VSIX directly to the Antigravity CLI without preflight validation or hash proof.
   - Its direct-folder fallback deleted existing `miya.lorerelay-*` installs before the replacement archive had been fully extracted and validated.

4. The old fallback error path was misleading.
   - A real archive extraction failure could continue into a secondary `'extension' directory not found` diagnosis.
   - This is now terminated at the primary archive error boundary.

5. The historical `yauzl / fd-slicer` extraction failure was not reproduced on the repaired path.
   - Current unresolved boundary:
     - current main produces a valid VSIX;
     - isolated CLI install can succeed while emitting the warning
       `[createInstance] extensionManagementService depends on antigravityAnalytics which is NOT registered.`
     - if a future `yauzl / fd-slicer` failure reappears, the evidence now points to the Antigravity CLI extraction path rather than immediate VSIX corruption from current main.

## Implementation

Changed code:

- `scripts/install_common.ps1`
- `scripts/install_vscode_extension.ps1`
- `scripts/run_all_tests.js`
- `scripts/test_antigravity_installer.js`
- `scripts/test_antigravity_installer.ps1`

Key repairs:

- added VSIX preflight validation with size, SHA-256, ZIP-open, required-entry, and version checks;
- added isolated temporary-copy CLI install path so the canonical validated VSIX is never handed directly to the CLI;
- made direct-folder install validate first, then extract to temp, then atomically replace with rollback;
- made archive extraction failures terminate with the primary extraction error;
- made CLI success detection robust to warning stderr noise;
- added focused installer-safety tests and registered them in the full suite.

## Focused tests

`node scripts/test_antigravity_installer.js`

- PASS: valid VSIX passes preflight
- PASS: truncated/corrupt VSIX fails before install mutation
- PASS: canonical VSIX remains unchanged across isolated CLI attempt
- PASS: invalid archive leaves fake existing install unchanged
- PASS: atomic replacement succeeds for a valid synthetic VSIX
- PASS: rollback restores old version on simulated replacement failure

## Full verification

Commands run:

- `npm ci --include=dev`
- `node scripts/test_antigravity_installer.js`
- `npm run compile`
- `npm run generate:symbol-registry`
- `node scripts/test_symbol_registry.js`
- `npm test`
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install_vscode_extension.ps1 -Target antigravity`

Results:

- `npm run compile` -> PASS
- `npm test` -> PASS (`228/228`)

## Live installation result

Final live installer run:

- packaged LoreRelay `1.77.15`
- validated VSIX before install
- Antigravity CLI isolated-copy install -> PASS
- direct-folder atomic install -> PASS for both actual Antigravity extension directories

Final installed locations:

- `C:\Users\Keisuke\.antigravity\extensions\miya.lorerelay-1.77.15`
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions\miya.lorerelay-1.77.15`

Final installed version at both locations: `1.77.15`

Non-LoreRelay extension folders changed:

- `C:\Users\Keisuke\.antigravity\extensions` -> no
- `C:\Users\Keisuke\.gemini\antigravity-ide\extensions` -> no

## Verdict

`ANTIGRAVITY_INSTALLER_REPAIR_READY_FOR_VERIFY`
