# MOD Substrate V1 — Slice 3A local install

Base: `3795fd48ecccea7b2216dae65d242bcc908bb075` (Slice 2B).
Risk: High. UI-less install lifecycle and read-only resolve preview only.

## Host contract

- `inspectLocalModImport` accepts one explicit local folder or ZIP. It reads metadata and the exact root manifest, not other entry payloads, and returns an opaque in-process inspection capability containing only ID, version, manifest hash and rating. Copying/forging the returned object grants nothing. Paths and authored content are not exposed by the capability.
- `installLocalModPackage` requires that capability, a configured global/workspace root and an explicit destination. Adult packages additionally require a trusted caller's explicit package-read permission. Manifest/source identity drift invalidates inspection. Permission to inspect, permission to read adult payloads, and hash-bound activation approval are different operations.
- Source files are never modified. A folder containing the selected destination scope (including a source equal to the workspace or derived MOD scope) is rejected before creating any destination, staging or report directory. Folder reads reuse the bounded ordinary-file walker and final tree snapshot. ZIP metadata is preflighted before decompression. The exact source buffers are copied/extracted to a new destination-local UUID staging directory, then re-read through existing discovery/hash/content closure and all current strict content adapters.
- Global staging is `<globalStorage>/mods/staging/<uuid>` adjacent to `packages`; workspace staging is `<workspace>/.text-adventure/mod-staging/<uuid>` adjacent to `mods`. A private nested `mods/packages/<id>/<version>` layout inside the UUID lets the existing exact-directory validation path verify staging without giving it installed/active authority.
- All configured path ancestors must be ordinary, realpath-equal directories. The host pins directory device/inode/mode, uses exclusive/no-follow file creation where available, checks source handles before/after bounded reads, and rechecks staged tree entries and directory membership immediately before publication.
- Publication is one same-device atomic directory rename. Device identity must be positive and equal; Windows drive-root identity must also agree. `EXDEV` has no copy/delete or overwrite fallback. A scope-local exclusive `.install-lock` directory serializes installer processes. A stale lock fails closed; no automatic lock-stealing or general filesystem cleanup is added.
- Existing versions are never silently replaced: identical validated content returns `MOD_ALREADY_INSTALLED`; changed manifest/content hashes return `MOD_INSTALL_VARIANT_CONFLICT`; unvalidated existing targets return `MOD_INSTALL_VERSION_EXISTS`. Windows native directory rename rejects a concurrent destination. On POSIX, exclusive `mkdir` reserves the target before publication; rename replaces only that transaction's identity-checked empty reservation. A foreign empty target wins the race and is preserved. The reservation briefly exposes an empty, invalid package directory, never partial payload. Failed publication removes only an owned, unchanged, empty reservation. Updates/uninstall are deferred.
- Cleanup uses the transaction's created-node inventory and pinned identities, not recursive deletion or a source path. It removes only owned staged files/directories. If ownership/containment cannot still be proved, it reports `retained` instead of deleting unknown/replaced data. Reports under the destination-local validation-report root contain only format, error code and cleanup status, never payload, source path or exception text. The original import is retained in all cases.
- Installation returns a metadata-only rescan. After publication, the host checks the installed tree against the validated staging snapshot and can issue an opaque `ModInstalledReadAuthorization` bound to the actual destination, ID, version, manifest/content hashes and full tree identity. A changed published tree receives no read capability. A post-commit verification/rescan failure is diagnostic, not a false claim that installation rolled back. Successful install does not enable content or change campaign state.

## ZIP subset and limits

ZIP32 single-disk stored/deflate only; root `lorerelay.mod.json` must exist exactly. No wrapper directory, self-extracting prefix, trailing data, archive comment, ZIP64, encryption, unknown method/flag/platform, nested archive, links or special-file attributes. Filenames are strict UTF-8/NFC; without the UTF-8 flag, only ASCII names are accepted. Central/local names, methods, flags, sizes, CRC and signed/unsigned data descriptors must agree. Records cannot overlap, contain unexplained gaps, or alias a directory/file under case folding.

Only bounded timestamp/UID metadata extras (`0x5455`, `0x7875`, `0x000a`) are ignored; no metadata affects paths, permissions or sizes. Unicode alternate-name fields, UNIX link metadata and other unknown extras fail closed.

- archive <=128 MiB; central directory <=2 MiB;
- <=2,048 files, <=256 directories including implicit directories/root;
- <=256 MiB expanded bytes; per-entry expansion <=100:1, aggregate <=50:1;
- manifest <=64 KiB; other JSON/text <=4 MiB; binary <=25 MiB before stricter asset validation;
- actual decompressed output is bounded by its declared reservation, then exact output size, complete compressed-input consumption and CRC are checked;
- current content validators enforce stricter Scenario/Lorebook/Persona/localization/image/audio limits and reject unsupported capabilities.

Format reference: [PKWARE APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT). Decompression uses Node's bounded [zlib options](https://nodejs.org/api/zlib.html#class-options); no archive dependency, shell extraction or MOD code execution is introduced.

## Resolve preview, not campaign mutation

`resolveInstalledModProfile` snapshots a validated profile, rescans metadata and filters candidates by known version range, selected source and engine compatibility before reading payloads. Its bounded metadata search follows required dependencies only from eligible versions, retaining possible alternatives for deterministic backtracking. Unrelated IDs and excluded versions/sources are not read.

Adult payload reads require destination/content-bound installed-package capabilities supplied as `adultReadRequests`; original import-inspection tokens, copied objects and profile intent/approvals alone grant no read authorization. The host checks the actual root, ancestor pins and complete tree identity before hashing, checks each expected file identity before opening payload, and compares the resulting content hash again. Same-manifest payload drift or another installed source invalidates the capability. These process-local capabilities are currently minted only by successful installation; reauthorization of existing adult packages after restart belongs to the later explicit Manager flow. Payload-read authorization does not create adult activation approval.

Each candidate passes current content adapters. The bounded existing deterministic resolver checks versions, dependencies, compatibility, conflicts, global/workspace variants, content-hash-bound adult approval and canonical source selection. Preview returns the lock and canonical profile/lock JSON **without writing them** or touching runtime authority. Hashing per preview is capped at 256 MiB total package bytes in addition to existing resolver bounds. The next Manager lane must implement explicit preview acceptance/fork/persistence through campaign-lineage safeguards; this slice does not auto-rewrite control files.

## Slice 2B P2 closed

Localization rejects generic URI scheme tokens, Markdown inline/reference links, image syntax and autolinks (including email/`www` forms). Ordinary `Note: prose`, `時刻: 12:30`, numeric ratios and bracketed words remain unchanged. An ASCII scheme-like word immediately followed by a colon and non-whitespace text is conservatively treated as a URI; whitespace after a prose label avoids that ambiguity.

Direct regressions include the three reported values: `javascript:alert(1)`, `mailto:user@example.com`, `[link](/path)`, and prove rejection at the actual install boundary.

## Verification and exclusions

Before planning verification, follow `docs/DEVELOPMENT_VERIFICATION_POLICY.md`. Do not escalate beyond its risk tier without a concrete reason.

Focused install and localization regressions, selected Test Console plan, one fixed-HEAD independent security review, one repair pass/direct verification if needed, one full suite on the final executable tree, exact-head CI and eligible Standard Close. Exact SHAs/results and any stopped-test error record belong in the PR; do not claim pending evidence as PASS.

PR #93's single independent review evaluated `c7c3f044356bd8baa4e194b87102f715c5c39298`. Its four findings are addressed in one repair pass:

| Finding | Repair | Direct regression |
| --- | --- | --- |
| P1 source/destination overlap | Reject overlap before destination creation | Workspace-as-source, nested storage and derived-scope equality leave the source untouched |
| P1 ineligible payload reads | Filter version/source/compatibility before dependency closure and hashing | Out-of-range, incompatible and unselected-source adult variants stay unopened while the general candidate resolves |
| P1 adult read capability identity | Mint installed-destination/content/tree-bound capability; verify before payload access | Exact approval succeeds; old inspection/forged/other-root capabilities fail; same-manifest payload drift is rejected without opening payload |
| P2 concurrent empty target | Native Windows rejection or exclusive POSIX reservation | Injected foreign empty target retains its inode and contents; only losing staging is cleaned |

Repair-focused install coverage: 126 assertions. The platform-specific publication regression exercises Windows locally and POSIX in Linux CI. Repair verification is not a second independent review; the reviewed and repaired HEADs remain separately recorded in the PR.

No Manager, file-picker UI, enable/disable UI, adult opt-in UI, localization UI strings, human smoke/Computer Use, Prompt MOD, Campaign Kit, Combat fixtures, replace/patch, arbitrary code, installer update/uninstall, or Start Hub/product-UX changes. Production adult-session permission remains OFF.
