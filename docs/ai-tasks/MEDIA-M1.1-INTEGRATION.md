# MEDIA-M1.1 integration closeout

## Status

**VERIFYING — REAL_INSTALL_AND_HUMAN_SMOKE_PENDING**

This integration is not marked DONE.  No live installer was run.

## Integration provenance

- Expected and fetched `origin/main`: `e9f9a916063ab530ccfe184cfe66a34f9588c399`.
- Candidate: `task/MEDIA-M1.1-repair-canonical-install-chain` at `0d61d03d26ce77aabc2382179adbadae02590b3d`.
- `origin/main` was confirmed as an ancestor of the candidate, with no unexpected main movement.
- The isolated integration branch fast-forwarded the complete candidate chain; no last-commits-only cherry-pick was used.

Candidate lineage after `e9f9a916063ab530ccfe184cfe66a34f9588c399`:

1. `0836b18c2b126f4a5a1afa34cdf5054333eb4d31` — portrait artifact adoption.
2. `f2720fb0fa4c4145dc259830767129da34d85786` — portrait sync handoff.
3. `b75be72b611000cd4a97a92adbca4711f7331dfa` — installed-Skill SHA-256 gate and version `1.78.1`.
4. `9644773f40442c7405e5e502916467ece49c4a0a` — installed-Skill repair record.
5. `43384be3a6f64ea20d01ac746db1fe117e9b0532` — canonical root BAT install chain.
6. `9c1d7f5d0dd6ab1d8bd6f4c77315354b2c3033ad` — canonical install-chain repair record.
7. `0d61d03d26ce77aabc2382179adbadae02590b3d` — candidate verification pass.

Additional docs-only review commits carried into the integration history:

- Original `f38e8ddd4c62129dab6e9074ec5b428b2c1dac6d`, integrated as `20224c5` — `MEDIA_M1_1_REPAIR_REQUIRED` review document only.
- Original `3f0cf43b33db9dc415de2c18b35cf080e9a6a147`, integrated as `d0c8c42` — `MEDIA_M1_1_REPAIR_VERIFY_PASS` review document only.

Both additional commits were confirmed to modify only `docs/ai-tasks` files.

## Version and installer checks

- `package.json`: `1.78.1`.
- `package-lock.json` root: `1.78.1`.
- `package-lock.json` `packages[""]`: `1.78.1`.
- Canonical human action remains `install_extension_antigravity.bat`.
- The root BAT installs the extension and then installs/verifies the GM Skill from the same managed, SHA-validated checkout.
- No live installation occurred.

## Post-integration gates

| Gate | Result |
| --- | --- |
| `npm run compile` | PASS |
| `python scripts/test_portrait_artifact_adoption.py` | PASS |
| `node scripts/test_portrait_artifact_sync.js` | PASS |
| `node scripts/test_antigravity_skill_installer.js` | PASS |
| `node scripts/test_antigravity_install_chain.js` | PASS on process-local Git safe-directory recheck |
| `node scripts/test_antigravity_installer_bootstrap.js` | PASS on process-local Git safe-directory recheck |
| `node scripts/check_version_consistency.js` | PASS |
| `node scripts/check_i18n_keys.js` | PASS |
| `npm run check:symbol-registry` | PASS |
| First `npm test` attempt | Environment-blocked: 237/239 |
| Integration-repair `npm test` (run once) | PASS: 239/239 |

The first full-suite attempt did not expose a production-candidate defect.  The two scripts that did not execute were:

- `scripts/test_antigravity_install_chain.js`
- `scripts/test_antigravity_installer_bootstrap.js`

Both stopped before their test cases ran because their child Git process reported:

```
fatal: detected dubious ownership in repository at 'C:/AI/media-m1-1-integration'
'C:/AI/media-m1-1-integration/.git' is owned by:
    2025SETPC/CodexSandboxOffline (...-1004)
but the current user is:
    2025SETPC/Keisuke (...-1002)
To add an exception for this directory, call:

    git config --global --add safe.directory C:/AI/media-m1-1-integration
```

The exact directory Git required as safe was `C:/AI/media-m1-1-integration`. No global or machine-wide Git configuration was changed. Instead, the two focused tests and the repaired full-suite process inherited only:

```
GIT_CONFIG_COUNT=1
GIT_CONFIG_KEY_0=safe.directory
GIT_CONFIG_VALUE_0=C:/AI/media-m1-1-integration
```

Both focused tests passed with that process-local configuration. The new integration-repair full-suite gate then passed `239/239`.

## Push state

Before push, `origin/main` was rechecked and remains `e9f9a916063ab530ccfe184cfe66a34f9588c399`. No production files changed after the verified candidate; the remaining integration change is this documentation update. Main will be pushed only after this record is committed.

## Next human terminal gate

1. Fully exit Antigravity.
2. Run only `C:\AI\text-adventure-vsce\install_extension_antigravity.bat`.
3. Require overall exit `0`.
4. Require LoreRelay `1.78.1` installed.
5. Require GM Skill installed and SHA-256 verified.
6. Restart Antigravity.
7. Perform the MEDIA-M1.1 human portrait smoke.
