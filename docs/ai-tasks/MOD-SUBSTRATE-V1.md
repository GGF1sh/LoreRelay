# MOD-SUBSTRATE-V1 — Safe Declarative MOD Substrate

Status: Revision 2 accepted and merged; Slice 1 implemented as a dormant validation substrate

Design merge: `origin/main` at `a2ed867e668b6272da78bdedf0791c90f1e12e95`

Date: 2026-09-02 JST

Target product: LoreRelay `1.84.32` and later, subject to each package compatibility range

## 1. Decision and scope

LoreRelay V1 MODs are validated, declarative data packages. They contribute definitions and presentation through existing or narrowly added parsers. They never become a second game engine and never receive executable authority.

The design gate is **GO for Slice 1 only**: manifest validation, package normalization and hashing, deterministic resolution, campaign profile/lock schemas, and Safe Mode decisions. Activating package content remains gated on the later slices and their tests.

V1 never executes JavaScript, TypeScript, Python, PowerShell, shell commands, executables, Node modules, VS Code APIs, WASM, macros, install/update scripts, or MOD-declared network requests. `node:vm` is not a sandbox and is not part of this design. A package never receives `fs`, `child_process`, environment variables, SecretStorage, API keys, sockets, arbitrary workspace paths, VS Code commands, or write access to canonical game state, world state, receipt files, or accepted-turn evidence.

Adult content uses this same substrate. `adult` is a visibility and consent classification, not a capability or privilege level.

## 2. Evidence: verified existing seams

The following are current code facts, not proposed APIs.

| Candidate | Verified code and consumer | V1 classification | Reason |
| --- | --- | --- | --- |
| Scenario templates | `src/scenarioPack.ts`: `validateScenarioData`, `loadScenarioPack`, and `loadScenarioPackFromDir`; `src/scenarioPackCore.ts`: `applyScenarioLocaleOverlay` and `OPTIONAL_PACK_FILES` | Supported, new-campaign import only | A format check and real campaign-start consumer exist. The current folder loader also copies optional files and writes canonical state, so MOD code must use a stricter adapter and must not pass an untrusted package to the current directory loader unchanged. |
| Lorebooks | `src/lorebookLoader.ts`: `loadLorebookForUi`, `validateLorebookUiEntries`, and `saveLorebookFromUi`; Symbol Registry: `src/lorebookMatcher.ts:isPotentiallyEvilRegex`; host/webview `lorebookList` and `saveLorebook` messages | Supported | Parser/validation, matcher, editor, and prompt consumer exist. MOD IDs and size/regex limits need a stricter wrapper. |
| Player personas | `src/personaPresetCore.ts`: `parsePlayerPersonaPreset`; `src/personaPreset.ts`: `listPlayerPersonaPresets` and `getPlayerPersonaPreset` | Supported | Versioned JSON parser and real selection consumer exist. V1 contributes persona presets, not arbitrary character database writes. |
| Full characters | `src/scenarioPack.ts:ensureScenarioStarterProtagonist` ultimately calls character-manager writes | Deferred | Creating or replacing campaign characters mutates canonical character/party state. V1 only permits a scenario-selected starter through the existing explicit new-campaign flow. |
| Genre World Presets | `src/genreWorldPresetCore.ts`: frozen `GENRE_WORLD_PRESET_REGISTRY`, private registry construction/validation, `getPreset`, `resolvePresetId`, `validatePresetForGeneration`, and reproduction checks | Deferred | The consumer is real, but the registry and downstream theme/campaign-kit maps are compile-time base tables. No external registration/compatibility boundary exists yet. |
| Campaign kits | `src/campaignKitCore.ts`: `parseCampaignKitConfig` and `buildCampaignKitPromptBlock`; `src/campaignKit.ts`: `resolveActiveCampaignKit` and `buildCampaignKitPromptContext` | Supported in Slice 4, single selected definition | A data parser and bounded prompt consumer exist and explicitly keep Core operations canonical. The current parser is permissive/fallback-oriented, so MOD input needs a strict wrapper. |
| Quest definitions | `src/questGeneratorCore.ts:generateQuestHooks` generates mutable world quest hooks rather than loading a definition registry | Deferred | There is no declarative package registry with deterministic merge semantics. |
| Item definitions | Targeted Symbol Registry and filename lookup found no package-ready declarative item registry/parser/consumer | Deferred | File names or narrative item text are not an authority boundary. |
| Runtime abilities | `src/combatAbilityValidator.ts`: `validateAbilityDefinition` and `validateAbilityFixtureDocument` | Deferred | Validation is strong, but no MOD-safe runtime catalog merge and canonical campaign integration boundary is established. |
| Combat fixtures | `src/combatAbilityValidator.ts:validateAbilityFixtureDocument`; the existing Combat Lab consumes fixture-shaped data | V1 read-only/import-only | Fixtures may be imported into Combat Lab after validation. They do not alter campaign combat catalogs or results. |
| Localization | `src/i18n.ts`: `loadBundle`, `t`, `getWebviewStrings`, and `getGmPromptStrings`; host/webview `localeBundle` message | Supported for MOD-owned resources only | A locale/fallback consumer exists. V1 must not overlay Core/security/mechanics strings. |
| Local backgrounds/assets | `src/parlorBackgroundCore.ts`: raster extension allowlist and bounded listing; `src/parlorBackground.ts`: contained path resolution and `asWebviewUri`; `src/extension.ts` configures webview resource roots | Supported through a new asset broker | A presentation consumer exists. Current helpers do not supply archive, realpath, MIME, package-size, or symlink defenses sufficient for untrusted packages. |
| Workspace paths/atomic JSON | `src/workspacePaths.ts`: `getWorkspacePath`, `writeJsonAtomic`, and `writeJsonAtomicAsync` | Reuse for profile/lock writes after containment validation | Existing atomic rename helpers are suitable for bounded JSON writes but do not by themselves validate an untrusted path. |
| Checkpoints | `src/checkpoint.ts`: `CheckpointFile` formats `1.0`/`1.1`, `.text-adventure/checkpoints`, save/load helpers | Requires a format extension before MOD activation | Current checkpoints contain history and optional combat battle history, but no MOD profile/lock evidence and no cross-ledger rollback guarantee. |
| Host/webview boundary | `src/extension.ts` posts locale/lorebook data, routes scenario load, uses `asWebviewUri`, and currently gives the main panel workspace roots | Reuse messages only through typed MOD adapters | V1 must never send inactive content and must issue asset URIs only after broker validation. It must not rely on broad `localResourceRoots` as package authorization. |

No current source file is a general MOD loader. Existing imports remain legacy product features and do not implicitly satisfy this contract.

## 3. Authority model

The selected authority model has three layers:

1. **Base content** — shipped with LoreRelay, immutable as registry input at runtime, and addressed as `base:<local-id>` at the MOD resolver boundary.
2. **Validated MOD contributions** — installed packages whose exact versions and hashes resolve into a campaign lock. They may add definitions and presentation but cannot write canonical state.
3. **Campaign-local configuration** — the user's explicit profile, selected singleton definitions, adult approvals, and the resolved lock for this campaign.

This fits the existing code only if each contribution is adapted into an existing parser/consumer and all gameplay effects continue through current Core validators and commit paths. MOD data cannot authoritatively set current HP, damage, winners, settlement results, economy results, world clock, receipt/application state, accepted-turn correlation, or campaign history. Scenario import may propose initial data only inside the existing explicit new-campaign operation.

Prompt text is advisory context. Parsed operations and canonical commit functions remain authoritative after model output.

## 4. Directory and discovery contract

The implementation must use these roots:

```text
<context.globalStorageUri.fsPath>/mods/
  packages/<mod-id>/<version>/
  staging/<uuid>/
  validation-reports/<uuid>.json

<workspace>/.text-adventure/
  mods/<mod-id>/<version>/
  mod-staging/<uuid>/
  mod-validation-reports/<uuid>.json
  mod-profile.json
  mod-lock.json
  checkpoints/
```

- `packages/` contains globally installed packages.
- Workspace `mods/` contains campaign-local packages and is never copied into canonical state files.
- `mod-profile.json` is user intent; `mod-lock.json` is resolved machine truth.
- The user chooses `global` or `workspace` as the install destination before extraction. Global imports use `<globalStorage>/mods/staging/<uuid>`; workspace imports use `<workspace>/.text-adventure/mod-staging/<uuid>`. Each staging root is adjacent to its destination root and must resolve to the same filesystem/volume as that destination.
- Imports are copied/extracted into a fresh destination-local staging directory, validated there, then installed by same-filesystem atomic rename. Source folders/ZIPs are never modified. A cross-device rename fallback, copy-then-delete fallback, or overwrite fallback is forbidden.
- V1 has no quarantine payload store. On failure it removes only the bounded destination-local staging copy and writes a non-sensitive report in that scope's validation-report directory. The original selected folder/ZIP remains untouched. This avoids silently deleting local adult content while also avoiding durable retention of hostile payloads.
- Discovery enumerates only the two exact package roots at `<id>/<version>/`. It never scans parent directories, the full workspace, home directories, drives, PATH, or arbitrary locations.
- Enumeration is metadata-only: it reads each bounded root `lorerelay.mod.json` but does not open payload files. Whole-package validation/hashing requires a separate request bound to exact source, ID, version, and discovered manifest hash. An adult package payload is not opened unless that exact hashing request also carries explicit adult-content read authorization.
- During discovery, both path segments must pass canonical MOD ID/SemVer validation, and the directory `<id>/<version>` strings must exactly equal manifest `id` and `version`. Case folding, normalization, aliases, and redirects do not repair a mismatch; the package is rejected with an attributed path/manifest mismatch.
- Installed means a valid package directory exists. Enabled means the profile requests it. Locked means the resolver selected its exact version and hashes. Campaign-required means the active lock names it. These terms are not interchangeable.

No production code may build these paths from unsanitized manifest strings. Parsed IDs/versions must pass validation before joining, and the final real path must remain under its configured root.

## 5. Manifest contract

Each package root contains exactly one `lorerelay.mod.json` at its root. A ZIP wrapper directory is not accepted in V1.

```json
{
  "format": "lorerelay-mod/1",
  "id": "author.package-name",
  "version": "1.0.0",
  "name": "Package Name",
  "description": "Short description",
  "authors": ["Author"],
  "lorerelay": {
    "minVersion": "1.84.32",
    "maxVersionExclusive": "2.0.0"
  },
  "contentRating": "general",
  "contentTags": [],
  "capabilities": ["asset", "scenario"],
  "dependencies": [],
  "optionalDependencies": [],
  "conflicts": [],
  "entrypoints": {
    "scenarios": [
      { "id": "harbor-night", "path": "content/scenarios/harbor-night.json" }
    ],
    "assets": [
      { "path": "content/assets/assets.json" }
    ]
  }
}
```

### 5.1 Field rules

| Field | Contract |
| --- | --- |
| `format` | Required exact string `lorerelay-mod/1`. Any other version is rejected. |
| `id` | Required, 3–128 ASCII characters, regex `^[a-z0-9](?:[a-z0-9-]{0,31})(?:\.[a-z0-9](?:[a-z0-9-]{0,31})){1,5}$`. At least two dot-separated labels. |
| `version` | Required SemVer 2 version. Pre-release identifiers are allowed; build metadata is rejected so equal-precedence versions cannot produce directory ambiguity. |
| `name` | Required non-empty UTF-8 text, 1–120 Unicode scalar values. |
| `description` | Optional, at most 2,000 UTF-8 bytes. |
| `authors` | Required array of 1–16 non-empty strings, each at most 120 Unicode scalar values. No executable/contact behavior is inferred. |
| `lorerelay.minVersion` | Required stable SemVer version, inclusive. |
| `lorerelay.maxVersionExclusive` | Optional stable SemVer version, exclusive and greater than `minVersion`. |
| `contentRating` | Required: `general`, `mature`, or `adult`. |
| `contentTags` | Sorted unique subset of `sexual-content`, `nudity`, `strong-language`, `graphic-violence`, `horror`, `substance-use`. `sexual-content` is invalid with `general`. |
| `capabilities` | Sorted unique subset of `scenario`, `lorebook`, `persona`, `localization`, `asset`, `campaign-kit`, `prompt-fragment`, `combat-lab-fixture`. It must equal the non-empty `entrypoints` capability set exactly. It grants no runtime permission. |
| `dependencies` | At most 64 unique objects `{ "id": string, "version": semver-range }`. Self-dependency is rejected. |
| `optionalDependencies` | Same shape/limit. IDs may not also occur in required dependencies. Optional packages never make a required reference safe. |
| `conflicts` | At most 64 unique objects `{ "id": string, "version": semver-range, "reason"?: string }`; reason max 240 bytes. Conflict evaluation is symmetric once either selected package declares it. |
| `entrypoints` | Exact keys listed below; at most 64 descriptors per key and 256 total. |

Dependency/profile ranges use deterministic SemVer comparator ranges only. URLs, Git references, distribution tags such as `latest`, and environment-dependent ranges are rejected. Prereleases match only when the range explicitly names a prerelease.

V1 rejects `loadAfter` and `loadBefore`; dependency edges are the only ordering edges. It also rejects manifest checksums; authoritative hashes are calculated by the loader and stored in the lockfile.

The manifest is limited to 64 KiB before parsing, must be strict UTF-8 without BOM, must contain no duplicate JSON keys, and must be a plain JSON object. JSON integer values outside the exact IEEE-754 safe range `[-(2^53 - 1), 2^53 - 1]` are rejected before canonicalization rather than rounded. Unknown fields are rejected at every manifest control-object level. Malformed or partially understood manifests are never accepted with defaults.

### 5.2 Entrypoint keys

```text
scenarios:          [{ id, path }]
lorebooks:          [{ id, path }]
personas:           [{ id, path }]
localization:       [{ locale, path }]
assets:             [{ path }]
campaignKits:       [{ id, path }]
promptFragments:    [{ path }]
combatLabFixtures:  [{ id, path }]
```

`id` is a local resource ID. `path` is a validated package-relative POSIX path. Each referenced document has its own strict format/version schema. Every package file must be the manifest, a declared/transitively declared content file, `README.md`, `LICENSE`, or `LICENSE.txt`; undeclared files are rejected rather than ignored. All files, including allowed documentation, are hashed.

## 6. Supported content and merge behavior

| Capability | Document contract | Permitted operation | Base target/replace |
| --- | --- | --- | --- |
| `scenario` | Existing `text-adventure-scenario/1.0`, wrapped by strict MOD limits | Add namespaced selectable scenario; explicit new-campaign import | No replacement. Initial state still goes through the scenario/new-campaign adapter. |
| `lorebook` | Existing LoreRelay lorebook entries plus strict IDs, size, count, and regex checks | Append namespaced entries in resolved load order | Cannot replace/disable base or another MOD entry. |
| `persona` | Existing persona preset version `1` | Add namespaced selectable persona | Cannot write/replace a saved character. |
| `localization` | New `lorerelay-localization/1` map for MOD-owned resource fields | Overlay only the same package's resource labels/descriptions for one locale | Core `t()` keys and other MODs are invalid targets. |
| `asset` | New `lorerelay-assets/1` catalog with `{ id, kind, path, mediaType, alt? }` | Add namespaced image/audio/background/icon asset | No asset override or external URL. |
| `campaign-kit` | Existing campaign-kit version `1` behind a new strict validator | Select exactly one campaign kit before campaign creation/fork | No merge or replacement; selection is explicit and locked. |
| `prompt-fragment` | New `lorerelay-prompt-fragments/1` | Append bounded attributed fragments by fixed slot/load order | Cannot target or replace system/Core prompt sections. |
| `combat-lab-fixture` | Existing `combat-ability-v1` fixture document | Import/read/run in Combat Lab only | Never registers abilities/statuses in campaign runtime. |

V1 supports only add/append, package-local localization overlay, explicit singleton selection, and package enable/disable at profile level. It does **not** support generic merge-by-id, `replace`, resource-level `disable`, base/MOD patching, or asset override. A duplicate canonical resource ID is an error; no last-wins rule exists.

Deferred from V1: external Genre World Presets, runtime quest definitions, runtime item definitions, runtime ability/status catalogs, arbitrary full-character records, save migrations, code MODs, and any patch language. These require separate authority proofs.

## 7. Identity and reference rules

- A local resource ID is 1–128 ASCII characters matching `^[a-z0-9][a-z0-9._/-]{0,127}$`, with no empty segment, `.` segment, or `..` segment.
- A MOD definition authored as `plasma-rifle` in `author.weaponpack` becomes `author.weaponpack:plasma-rifle`.
- Base definitions are canonicalized at the resolver boundary as `base:<legacy-id>`. Existing unnamespaced IDs remain accepted only in existing base content and save compatibility paths.
- Inside a MOD document, an unqualified reference resolves only within the same MOD. `base:<id>` explicitly references base content. `<mod-id>:<local-id>` references another MOD and is valid only when that MOD is a required dependency satisfying the declared range.
- Optional dependencies cannot be the target of a required static reference. Optional integration needs a future explicit optional block schema.
- MOD documents may reference but not replace base definitions. No MOD may target another MOD for replacement in V1.
- Canonical IDs are compared byte-for-byte after ASCII validation. Filesystem case rules never determine identity.

## 8. Dependency, conflict, and deterministic load order

Resolution is offline over installed candidates from the two configured roots.

1. Start from enabled profile requests, not directory enumeration. Canonically validate every installed `<id>/<version>` path against its manifest before it can become a candidate.
2. Apply explicit profile source restrictions. `source: "global"` or `"workspace"` excludes the other root. With `source: "any"`, global and workspace candidates having the same `id@version`, `manifestHash`, and `contentHash` are one logical candidate; record `workspace` as its canonical source. If either hash differs, resolution fails with `DUPLICATE_VARIANT`. A same-source duplicate is invalid.
3. Sort every MOD ID's logical candidates by SemVer descending, then canonical source `workspace` before `global`. Compare SemVer precedence first and the full exact version string second; build metadata is already forbidden.
4. Run the canonical depth-first constraint search below. This search, not a greedy single pass, decides exact versions:
   1. Seed constraints from all enabled profile entries. Keep currently constrained but unassigned MOD IDs in ascending Unicode code-point order.
   2. Pick the smallest unassigned ID. Try its still-compatible candidates in the order from step 3.
   3. Tentatively assign one candidate; add its required dependency ranges, expand newly discovered IDs, and intersect all ranges for each ID. Apply matching conflict constraints immediately.
   4. If any constrained ID has no candidate, an assigned version leaves its intersected range, a declared conflict matches, or the selected dependency graph contains a cycle, undo that assignment and try the next candidate.
   5. Recurse until every constrained ID is assigned. The first complete valid assignment is the canonical solution. Record failed branches in visitation order. If all branches fail, emit no partial lock; select the failure at greatest assignment depth, break equal-depth ties by earliest visitation, then sort that failure's diagnostics by code, MOD ID, and dependency path before returning them.
5. Required dependencies participate in backtracking. Thus a higher version whose transitive graph conflicts may be replaced by the next candidate version. The resolver never silently stops after the first highest-version failure.
6. Optional dependencies do not add candidates or influence backtracking. After the required solution exists, add an optional edge only when that ID is already selected and its version matches; otherwise emit an attributed optional-dependency diagnostic.
7. Build directed edges dependency → dependent from the complete assignment and perform Kahn topological sort. Whenever several nodes have zero indegree, choose MOD ID in ascending Unicode code-point order. Filesystem order and profile array order are never tie-breakers.
8. Emit the exact assignment, resolved dependency edges, canonical source, and load order into the lockfile.

Resolver version 1 admits at most 512 physical installed candidates across the two configured roots and at most 10,000 attempted candidate assignments in the canonical search. The next candidate or search step beyond either limit fails with `RESOLUTION_COMPLEXITY_LIMIT` and emits no partial lock. These counters are deterministic inputs to resolver semantics; a wall-clock timeout may protect a caller operationally but must never choose a version, change traversal, or become an authoritative resolution result.

Two installed versions of one ID are allowed. A campaign lock requesting an unavailable exact version never falls forward or backward automatically. Given the same normalized candidate set and profile, all implementations must traverse the same branches and produce the same solution or failure.

## 9. Campaign profile and lockfile

### 9.1 `mod-profile.json` — user intent

```json
{
  "format": "lorerelay-mod-profile/1",
  "enabled": [
    { "id": "author.package-name", "version": "^1.0.0", "source": "any" }
  ],
  "selected": {
    "campaignKit": "author.package-name:frontier-loop"
  },
  "adultContent": {
    "allow": false,
    "approvals": []
  }
}
```

Adult approvals have exact shape `{ id, version, manifestHash, contentHash }`. Hashes are calculated before consent is checked. Profile array order has no load-order meaning. Unknown fields, duplicate IDs, invalid ranges, and selections outside enabled packages are errors.

### 9.2 `mod-lock.json` — resolved truth

```json
{
  "format": "lorerelay-mod-lock/1",
  "resolverVersion": 1,
  "resolvedWithLoreRelay": "1.84.32",
  "profileHash": "sha256:...",
  "adultContentAllowed": false,
  "packages": [
    {
      "id": "author.package-name",
      "version": "1.0.0",
      "source": "workspace",
      "manifestHash": "sha256:...",
      "contentHash": "sha256:...",
      "contentRating": "general",
      "contentTags": [],
      "capabilities": ["asset", "scenario"],
      "dependencies": [],
      "engineCompatibility": "compatible"
    }
  ],
  "loadOrder": ["author.package-name"],
  "selected": {
    "campaignKit": null
  },
  "aggregateHash": "sha256:..."
}
```

The profile parser accepts at most 256 KiB. Because one valid 512-package graph can exceed that size, the lock parser has a separate 8 MiB canonical JSON limit. The resolver must serialize and parse its own result within that same limit before returning success; it returns an explicit lock-size/schema error instead of emitting a lock that startup cannot read.

The lock contains no timestamp, secret, URI, drive letter, username, or absolute path. `source` is only `global` or `workspace`. Package and dependency arrays are canonical-order arrays. `aggregateHash` is the hash of the canonical lock with that field omitted.

The lock is generated only by an explicit Resolve action before campaign creation or by an explicit post-creation campaign-fork operation. Startup verifies but never rewrites it. Profile drift is shown as a proposed change; the campaign may continue with the locked set if it is still available, or fork after resolution.

Open behavior:

| Condition | Normal open behavior |
| --- | --- |
| All exact versions/hashes match | Activate in locked order. |
| Required package missing or exact version unavailable | Block activation; offer diagnostics, install/rescan, or Safe Mode. |
| Manifest/content hash changed under same version | Treat as tampering/drift; block activation and never rewrite lock. |
| Different installed version exists | Ignore it for this campaign; block if the locked version is absent. |
| LoreRelay version outside any package range | Block activation; offer Safe Mode. |
| LoreRelay version changed but remains compatible and resolver semantics are unchanged | Permit with an `ENGINE_VERSION_DRIFT` warning; do not rewrite lock. Replay evidence records the actual engine version. |
| Resolver version changed | Require an explicit re-resolve/migration decision; do not silently reinterpret the graph. |
| Locked adult package exists while adult display/session permission is off | Do not activate it or expose its content; offer explicit session permission or Safe Mode. |

## 10. Hashing and reproducibility

All hashes use SHA-256 and the `sha256:<lowercase-hex>` representation.

1. Validate every relative path and reject duplicates after Unicode NFC, `/` separator, and Windows case-fold normalization.
2. Sort normalized relative paths by UTF-8 byte order.
3. Normalize JSON by strict duplicate-key parsing, recursively NFC-normalizing string values and object keys (reject keys that collide after normalization), then producing RFC 8785 JSON Canonicalization Scheme bytes.
4. Normalize permitted text files, including prompt/localization entrypoints, `README.md`, and license files, as strict UTF-8 without BOM, Unicode NFC, and LF line endings. Reject NUL and disallowed controls rather than deleting them.
5. Hash binary assets byte-for-byte.
6. Frame every file as `uint32be(pathByteLength) || pathBytes || uint64be(contentByteLength) || normalizedContentBytes`; concatenate frames in sorted path order and hash them. The package hash covers every permitted file, including canonical manifest and documentation.
7. `manifestHash` is SHA-256 of the canonical manifest alone. `contentHash` is the framed whole-package hash.
8. After computing the hash, perform one final bounded metadata re-enumeration of the exact package root and compare canonical path, type, size, identity, link count, and modification metadata with the tree observed while reading. Any addition, deletion, rename, replacement, or metadata drift fails with `PACKAGE_TREE_CHANGED_DURING_HASH`; an old walk is never returned as a successful candidate.

Prompt files are normal text entrypoints and therefore included in `contentHash`. Raw prompt text is not copied into the lock. The same normalized package produces the same hash on every supported OS; a changed semantic JSON value, text, undeclared file, or binary changes it.

## 11. Adult-content policy

- `contentRating` is author-supplied classification: `general`, `mature`, or `adult`.
- Adult packages are hidden in the MOD Manager by default. A global/user UI preference may reveal adult package metadata; this preference is separate from campaign enablement and is not a lock capability.
- Enabling each adult package requires a modal confirmation bound to exact `id`, `version`, `manifestHash`, and `contentHash`. Any manifest or normalized package-content change invalidates the approval, including a same-version change whose manifest bytes are unchanged. Resolve/fork cannot reuse an approval unless all four values match; otherwise it returns `ADULT_REAPPROVAL_REQUIRED` before writing a lock.
- The campaign profile must also set `adultContent.allow: true`. Revealing packages does not enable them, and allowing adult content does not approve every package.
- Inactive or unapproved adult packages contribute no definitions, localization, assets, prompts, previews, search terms, or webview messages. Discovery may read only the bounded root manifest needed to classify the package.
- Turning off adult visibility/session permission does not delete, rewrite, downgrade, or uninstall local content. A locked campaign then opens only after explicit session permission or in Safe Mode.
- Adult rating grants no extra filesystem, prompt, state, network, code, or canonical authority. Provider/cloud policies remain independent; local-model use changes none of these rules.
- LoreRelay need not distribute adult packages. V1 defines no marketplace, generation feature, password, hidden flag, or privileged NSFW mode.

## 12. Prompt contribution boundary

Allowed slots, in fixed order, are:

1. `narrator-style`
2. `character-voice`
3. `setting-flavor`
4. `content-preferences`
5. `scene-vocabulary`
6. `lore-context`

`lorerelay-prompt-fragments/1` contains an array of `{ id, slot, text }`. IDs are local resource IDs. There is no role, priority, system/developer message, tool declaration, schema override, or arbitrary insertion point.

Composition is slot order, then locked package order, then canonical fragment ID. Duplicate canonical IDs fail. Fragments are wrapped with immutable attribution containing package ID, version, fragment ID, and slot. Inspector must show the same attribution and allow explicit viewing of the normalized text.

Limits:

- one fragment: 2,048 UTF-8 bytes and 512 provider-counted tokens;
- one package: 8,192 bytes and 2,048 tokens;
- active aggregate: 32,768 bytes and 8,192 tokens;
- maximum 32 fragments per package.

The implementation must use the normal provider prompt-budget token counter after deterministic composition; tests inject a deterministic counter. Either the byte or token limit is sufficient to reject. Text normalization follows the hashing rules. Control characters and invalid UTF-8 are rejected; HTML/Markdown is inert text, never executed. Semantic prompt injection cannot be reliably sanitized, so authority is enforced structurally after the model response.

Fragments are advisory and cannot alter combat winners, HP/damage, economy settlement, receipts/hashes, accepted-turn authority, operation schemas, parser allowlists, save paths, or system/security instructions. The existing parser/validator/commit path remains the only route to canonical effects. Conflicting prose fragments coexist in deterministic attributed order; LoreRelay does not silently pick a winner. Users resolve the conflict by disabling a package and forking/re-resolving the campaign.

Inactive packages and adult packages without both approvals are excluded before prompt construction.

## 13. Asset and path security

### 13.1 Asset catalog

`lorerelay-assets/1` permits these kinds and media types:

| Kind | Media types/extensions | Per-file limit |
| --- | --- | --- |
| `image`, `background`, `icon` | `image/png` `.png`; `image/jpeg` `.jpg`/`.jpeg`; `image/webp` `.webp` | 10 MiB; decoded dimensions at most 8192×8192 and 40 million pixels |
| `bgm`, `sfx`, `audio` | `audio/mpeg` `.mp3`; `audio/ogg` `.ogg`; `audio/wav` `.wav` | 25 MiB; validated header; `bgm`/`audio` at most 20 minutes and `sfx` at most 60 seconds |

Extension, declared media type, and sniffed magic bytes must agree. SVG, GIF/animated image formats, HTML, CSS, fonts, video, playlists, external URLs, `file:` URLs, data URLs, executables, archives, and polyglot/unknown formats are rejected in V1. SVG remains deferred until a proven sanitizer exists.

The asset broker resolves only a locked canonical asset ID, rechecks containment/regular-file status, and then creates a webview URI. Webview code receives that URI and metadata, never a filesystem path. The existing broad workspace `localResourceRoots` setting is not authorization and must not be used to accept a MOD-supplied URI.

### 13.2 Relative path validation

Every manifest/archive/catalog path must:

- be strict UTF-8, Unicode NFC, use `/`, be at most 240 UTF-8 bytes, and contain at most 32 segments;
- be relative, non-empty, and contain no empty, `.`, `..`, backslash, colon, NUL/control, drive, device, URI, UNC, or ADS syntax;
- contain no Windows reserved segment (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, including names with extensions or trailing spaces/dots);
- remain below the package root after `resolve`, `lstat`, and `realpath` containment checks;
- resolve only through ordinary directories to an ordinary file, never a symlink, junction, reparse point, device, socket, pipe, or hard link with an unexpected link count;
- be unique after NFC and Windows invariant case-fold normalization.

Folder import first walks without following links, under the same file-count/size limits, then copies validated regular files into staging. Validation is repeated on the staged copy to reduce time-of-check/time-of-use risk.

## 14. ZIP/folder import contract

V1 limits are:

- source ZIP: at most 128 MiB;
- at most 2,048 archive/package files and 256 directories;
- total expanded regular-file bytes: at most 256 MiB;
- per-entry expansion ratio: at most 100:1; aggregate ratio: at most 50:1;
- JSON content file: at most 4 MiB unless a stricter type limit applies;
- nested archives and encrypted entries: rejected.

The importer must preflight the central directory before extraction, reject ZIP Slip/absolute/backslash/device paths, reject symlink/hardlink/special type bits, reject duplicate normalized paths and case collisions, and reserve the expanded-byte budget before writing an entry. The root manifest must be at `lorerelay.mod.json` exactly. Invalid UTF-8 filenames, partial/multi-root packages, data descriptors that exceed declared limits, and extraction count/size drift fail the import.

Extraction writes only to a fresh destination-local staging directory opened with no-follow semantics where available. Before installation, the implementation proves staging and destination are on the same filesystem (`stat.dev` where meaningful and Windows volume identity on Windows); inability to prove this fails with `CROSS_DEVICE_STAGING`. Any failure closes handles and removes only that exact resolved staging directory after verifying it is under the selected scope's staging root. Installation is one same-filesystem atomic rename to the target derived from validated manifest `<id>/<version>`; the installed path segments are rechecked for exact manifest equality. An existing target is never overwritten. A same `id@version` with another hash is an explicit conflict.

## 15. Failure policy and Safe Mode

Normal activation is all-or-nothing for the locked graph. A malformed, corrupt, missing, incompatible, conflicted, or changed required package prevents all MOD contributions from entering the campaign. LoreRelay reports exact package IDs, versions, expected/actual hashes, dependency path, and validation codes without including adult content text.

Safe Mode is a campaign recovery mode with these rules:

- Canonical `game_state.json`, `world_state.json`, history, receipts, and checkpoints remain untouched and can be inspected through sanitized existing views.
- No MOD definitions, assets, prompt fragments, localization, scenario templates, campaign kits, or combat fixtures activate.
- Before any V1 adult MOD can activate, every machine-authored history entry created from a scenario opening or accepted GM turn must persist `modContext: { format: "lorerelay-mod-context/1", lockFingerprint, adultActive }`. `lockFingerprint` is the active lock `aggregateHash`; `adultActive` is `true` when any adult-rated package was active for that whole entry. Checkpoint/history copying preserves this marker byte-for-byte.
- Safe Mode never attempts sentence-level or per-MOD causal attribution. When adult visibility/session permission is off, it replaces the presentation of an entire machine-authored entry whose marker has `adultActive: true` with a generic placeholder; the stored entry is not modified. User-authored entries are not classified by this MOD marker.
- If a campaign has MOD lock/checkpoint evidence that adult content may have been active but a machine-authored entry lacks valid `modContext`, Safe Mode conservatively placeholders that whole machine-authored entry. A campaign with no MOD profile/lock history remains ordinary unmodded history and is not redacted merely because it lacks markers.
- A stored fingerprint is not an allowlist by itself. Before a non-adult marker can authorize display in a campaign that may have adult history, Safe Mode must match both its fingerprint and `adultActive` value against a `modContext` independently reconstructed from the fully manifest-bound lock. A missing match, conflicting classification, or forged `adultActive: false` for a known adult lock placeholders the whole machine-authored entry.
- Marked or conservatively hidden history is never sent to a provider because Safe Mode cannot advance turns. The marker proves only coarse active-loadout context, not which package influenced any sentence.
- Unresolved canonical IDs render as inert attributed placeholders. Raw unknown fields remain on disk; there is no base-ID substitution and no silent pruning.
- MOD assets render placeholders. Existing world/scenario state remains inspectable but its missing definition is not recreated.
- Combat, economy, travel, world generation, model turns, normal save/checkpoint writes, and canonical mutation commands are disabled while required definitions or lock evidence are unavailable.
- Allowed actions are diagnostics/export, package install/rescan outside campaign files, adult visibility choice, restore inspection, and an explicit recovery-fork workflow after a backup and successful new resolution.

Safe Mode does not promise playability without MODs. It is read-only/limited recovery, not an automatic unmodder.

## 16. Enable, disable, update, and uninstall

Before campaign creation, users may change the profile freely; Resolve must succeed before Start. Installed packages do nothing merely by existing.

After campaign creation:

- Profile changes are compared with the lock and shown as an impact diff. They never rewrite the lock on open.
- Any enabled set, selected singleton, exact version, manifest hash, content hash, or adult approval change requires a pre-change checkpoint/backup and creates a new campaign lineage/fork in V1. The original remains locked and recoverable.
- Disabling is considered mechanically safe only after reference analysis finds no persisted IDs from the package. Even then, V1 changes the fork's identity/lock; it never edits the original in place.
- Updates are exact-version pins per campaign. There is no automatic update, background download, install script, or online update check. `Rescan` only discovers local candidates.
- A package change requires host reload/reopen before activation so no stale prompt/registry/webview contribution remains.
- Workspace-local uninstall is blocked while the current campaign lock references that exact version. Global uninstall requires explicit confirmation and never edits any campaign; other workspaces may later report it missing.
- Uninstall removes only the exact validated package version directory after resolving it under the package root. It never deletes campaign profile/lock/history/content.

## 17. Save, checkpoint, export, clone, and replay compatibility

Current `CheckpointFile` formats `1.0`/`1.1` do not record MOD state and checkpoint restore does not claim whole-ledger rollback. MOD activation therefore requires a future `text-adventure-checkpoint/1.2` containing an optional canonical `modLockSnapshot` (the complete path-free lock object) and `modLockFingerprint` (`aggregateHash`). Its copied history retains each entry's coarse `modContext` marker. Unmodded checkpoints omit MOD fields and preserve current behavior.

- Save/open compares the active lock and installed hashes before any MOD contribution or canonical write.
- Restore requires the checkpoint fingerprint to equal the active lock. A mismatch blocks normal restore and offers Safe Mode or a new recovery fork; it never activates another loadout.
- Campaign export includes profile, lock, and checkpoint lock snapshots but not installed package payloads or absolute paths. Import reports exact missing packages and enters Safe Mode until they are installed.
- Campaign clone copies profile/lock unchanged and starts with the same campaign lineage parent. A changed profile produces a new lineage child.
- Every scenario-opening or accepted GM history entry created with an active MOD lock records the lock fingerprint and adult-active boolean described in Section 15 before the entry is committed. Replay/reproduction evidence records the same lock aggregate hash, ordered package `id@version` plus content hashes, resolver version, and actual LoreRelay version.
- Existing checkpoints without MOD metadata may be restored only into an unmodded profile, or inspected in Safe Mode. They are not guessed compatible with a modded campaign.

No V1 claim implies atomic rollback across every existing ledger. Lifecycle UI must state this limitation before a fork/update.

## 18. Localization behavior

Each localization document is `lorerelay-localization/1` with `{ format, locale, strings }`. Keys identify a resource owned by the same MOD and an allowlisted presentation field such as `name`, `label`, `description`, or `alt`. Attempts to address `webview.*`, `gm.*`, Core/security text, another package, operation/schema names, or prompt authority are rejected.

Resolution for a MOD-owned field is requested locale → the package's `en` entry → the source-language field in its definition. Missing text never falls through to another MOD. Two documents defining the same canonical resource/field/locale are a collision and fail that package. Values are plain escaped text, subject to per-string 4 KiB and per-locale-file 1 MiB limits.

Inactive/unapproved adult package localization is excluded before host-to-webview bundle construction. V1 does not alter `src/i18n.ts` base bundle precedence.

## 19. MOD Manager UX contract

The future MOD Manager belongs under Advanced/Settings, not among the Start Hub's three primary actions.

It must show installed packages, campaign-enabled/required state, exact version, source (`global`/`workspace`), compatibility, self-declared rating/tags, **Safe Data MOD** classification, capabilities, dependency diagnostics, conflicts, lock mismatch, locally available newer versions, resolved load order, and package validation errors. V1 never labels a package as an executable-capable MOD; a future unsafe-code category must display as unsupported and inactive.

Controls: Install Folder, Install ZIP, Rescan, Enable/Disable, View Details, Resolve Profile, Launch Safe Mode, and Reveal Package Folder. Reveal requires an explicit click and a revalidated installed root; it cannot accept a package-provided path. Update means choose another already installed local version. There is no marketplace.

Adult visibility is a separate control from enabling. Details/previews for hidden adult packages cannot leak through search, errors, thumbnails, localization, or accessibility text. Enabling each adult package shows and records the exact package ID, version, manifest hash, and whole-package content hash.

Inspector must attribute every active contribution by package/version/canonical resource ID, show why it is active, and expose deterministic order. It must not expose absolute filesystem paths or adult fragment text without visibility permission.

## 20. Threat model

| Threat | Prevention | Detection | Failure behavior | Required test | Deferred residual risk |
| --- | --- | --- | --- | --- | --- |
| Path traversal | Strict relative-path grammar and realpath containment | Normalized path validator | Reject package/import | `../`, mixed separator, encoded-looking segment cases | Platform filesystem quirks |
| Symlink/junction escape | No-follow walk; reject links/reparse points; staged recheck | `lstat`, reparse, realpath checks | Reject package | File/dir symlink and Windows junction fixtures | TOCTOU reduced, not eliminated on all Node platforms |
| ZIP Slip | Preflight every archive name before extraction | Central-directory normalization | Reject archive before writes | Absolute, `..`, drive, UNC entries | Malformed archive parser bugs |
| Decompression bomb | Compressed/expanded/ratio/count budgets | Reserved-byte accounting during extract | Abort and clean exact staging dir | Per-entry and aggregate overflow fixtures | Decoder CPU behavior within limits |
| Excessive file count/size | 2,048/256 MiB/type limits | Preflight plus streamed counters | Reject/abort | Boundary ±1 tests | Many valid small JSON values still cost CPU |
| Disguised executable/polyglot | Declared allowlist, magic sniff, undeclared-file rejection | Extension/MIME/magic agreement | Reject file/package | Renamed EXE/script and polyglot corpus | Media decoder vulnerabilities |
| Malformed manifest | Strict UTF-8, size, duplicate-key, schema validation | Stable validation codes | Reject package | Fuzz/property tests | New parser vulnerabilities |
| Unknown manifest version | Exact `lorerelay-mod/1` | Format check | Reject | Future/empty format cases | None in V1 |
| Dependency cycle | Directed graph validation | Cycle path report | Resolution fails | Multi-node/self cycle tests | None |
| Duplicate MOD ID/version | Exact path/manifest invariant; same-hash cross-scope coalescing; different-hash rejection | Candidate index diagnostics | Canonically select workspace source for identical `source:any`; otherwise fail/no overwrite | Same/different hash and source-restricted duplicates | User must remove different-content ambiguity |
| Namespace collision | Automatic package prefix and global uniqueness | Registry insertion check | Fail affected resolution | Same local IDs across/within packages | Legacy base IDs need adapter care |
| Load nondeterminism | Dependency-only DAG and stable byte ordering | Lock/order recomputation | Fail on mismatch | Shuffled enumeration/property tests | Locale library ordering must not be used |
| Lockfile drift | Canonical profile/package hashes | Startup recomputation | Block normal activation | Mutate each locked field/file | Manual disk rollback remains detectable only by hashes |
| Missing MOD | Exact lock lookup, no version fallback | Startup resolver | Block; Safe Mode | Remove locked package | Package acquisition is user responsibility |
| Changed content under same version | Whole-package content hash plus final bounded tree snapshot | Expected/actual and pre/post tree comparison | Tamper error; no lock rewrite | One-byte, JSON-semantic, add/delete/rename, and mid-hash changes | Mutation after the final verification instant remains an ordinary filesystem race and is rechecked before activation |
| Incompatible LoreRelay version | Inclusive/exclusive manifest bounds | Startup compatibility check | Block; Safe Mode | Below/at/above range tests | Authors may choose overly broad ranges |
| Prompt injection against authority | Fixed advisory slots and canonical post-model validation | Attribution plus operation-validation errors | Ignore/reject invalid model operation | Fragments demanding HP/winner/schema override | Narrative influence cannot be eliminated |
| Adult leakage while disabled | Four-value consent binding; pre-composition filter; coarse per-entry lock/adult marker bound back to verified lock classification | Leakage assertions across messages/search/assets/history | No activation; whole-entry Safe Mode placeholder, never selective prose inference | Snapshot all manager/webview/provider payloads and missing/invalid/forged-marker cases | Misclassified author metadata; marker is intentionally coarse |
| Inactive MOD leakage | Build registries solely from locked active graph | Contribution provenance audit | Drop package and fail on stray provenance | Disabled package sentinel test | Caches must be invalidated on reload |
| Malicious external asset URL | Relative local assets only; schemes forbidden | Catalog validator | Reject package | `http`, `file`, `data`, UNC tests | None in V1 |
| Direct save editing | No MOD callbacks/handles; data adapters return definitions | Canonical write audit and path tests | Reject unsupported entrypoint; canonical validators remain | Sentinel save/receipt files unchanged | Users can manually edit their own files outside LoreRelay |
| Secret/API-key exfiltration | No code/network/env/SecretStorage access; no external URLs | Capability allowlist and network-free tests | Reject package | Static forbidden-file and no-network harness | Prompt text sent to the user's chosen provider is disclosed by design |
| Prompt/asset denial of service | Per-item/package/aggregate budgets | Preflight/token/media counters | Reject or omit before activation; visible error | Limit ±1 and adversarial Unicode tests | Valid complex media decoder CPU |
| Update/uninstall corrupts campaign | Exact pins, backup/fork, atomic install, uninstall lock guard | Lock-reference check and post-action verification | Abort without campaign writes | Fault injection at every staging/rename step | Other unopened workspaces may later miss a global package |
| Case/reserved-name collision | NFC + invariant case-fold duplicate detection; Windows name rules | Cross-platform normalized index | Reject package | Case, trailing dot/space, `CON.txt` tests | Differences on exotic filesystems |
| Partial/cross-device extraction/install | Destination-local staging, filesystem identity proof, atomic final rename, never overwrite | Completion marker plus source/destination device check | Reject cross-device; clean exact staging; retain original source | Different-volume Windows fixture and process/fault interruption tests | Orphan staging cleanup needs bounded startup maintenance |

## 21. Implementation slices

All file names below are **proposed future touch sets**, not existing production seams unless listed in Section 2.

### Slice 1 — Manifest, path/hash core, resolver, profile/lock, Safe Mode decision

- Goal: accept no contributions; deterministically validate and resolve local package metadata into a lock and produce Safe Mode diagnostics.
- Expected touch set: new `src/mods/modManifestCore.ts`, `modPathCore.ts`, `modHashCore.ts`, `modResolverCore.ts`, `modProfileCore.ts`, `modSafeModeCore.ts`, and matching `*.test.ts` files. A thin `src/mods/modDiscoveryHost.ts` plus its focused test is permitted only if needed to prove the two roots; no import UI or other production files.
- Risk: **High** (security/path and campaign reproducibility boundary), even though dormant behind no contribution activation.
- Prerequisites: this design merged; exact schemas/limits copied into tests; no open overlapping package-loader PR.
- Excluded: ZIP extraction, package activation, UI, webview changes, canonical state writes, prompts.
- Acceptance: criteria AC-01 through AC-12, AC-21 through AC-25, plus deterministic property tests.
- Computer Use: no.
- Independent security review: yes, one bounded review per verification policy.

This is the recommended first implementation PR.

### Slice 2 — First declarative contributions

- Goal: activate scenarios (new campaign only), lorebooks, personas, MOD-owned localization, and safe assets through strict adapters.
- Expected touch set: new files under `src/mods/contributions/`; narrow changes to `src/scenarioPack.ts`, `src/lorebookLoader.ts`, `src/personaPreset.ts`, `src/i18n.ts`, `src/parlorBackground.ts`, host/webview message types, and focused tests. The scenario adapter must not call the current raw folder-copy path unchanged.
- Risk: **High** (canonical campaign initialization, prompt lore, asset path/privacy boundaries).
- Prerequisites: Slice 1 merged; checkpoint/lock activation gate available; strict content schemas.
- Excluded: Campaign Kit, free prompt fragments, Genre World Presets, runtime quests/items/abilities, ZIP install, manager UI.
- Acceptance: all common criteria plus type-specific parser/consumer, inactive/adult leakage, URI broker, and unmodded-regression tests.
- Computer Use: no for the core PR; a focused visual smoke is required only if presentation code changes.
- Independent security review: yes.

### Slice 3 — MOD Manager and local import lifecycle

- Goal: folder/ZIP install, rescan, enable/disable, profile resolve, diagnostics, adult visibility/confirmation, Safe Mode launch, and safe reveal.
- Expected touch set: new `src/mods/modImportHost.ts` and lifecycle host adapters; Advanced/Settings webview module/style; typed host↔webview messages; focused archive/path/UI tests.
- Risk: **High** (archive extraction, delete/uninstall, privacy, host/webview lifecycle).
- Prerequisites: Slices 1–2 merged; atomic staging/fault-injection harness; agreed campaign-fork UX.
- Excluded: online discovery/download/update, marketplace, scripts, auto-update.
- Acceptance: AC-11 through AC-19 plus fault injection, cancellation, confirmation, and no-content-leak snapshots.
- Computer Use: yes, one focused MOD Manager/adult/Safe Mode smoke after automated checks.
- Independent security review: yes.

### Slice 4 — Bounded guidance and lab-only fixtures

- Goal: strict single-selected Campaign Kit, fixed-slot prompt fragments, Inspector provenance, and Combat Lab fixture import/read-only use.
- Expected touch set: strict contribution adapters under `src/mods/contributions/`; narrow changes to `src/campaignKit.ts`/bridge, prompt composition, Inspector payload/view, and Combat Lab import path; focused authority tests.
- Risk: **High** (prompt injection and combat-authority boundary).
- Prerequisites: prior slices merged; provider token-budget hook identified; Inspector attribution schema agreed.
- Excluded: runtime ability/status registry, world preset registry extension, quest/item registry, accepted-result shortcuts.
- Acceptance: prompt byte/token/order/authority tests, campaign-kit singleton tests, fixture isolation tests, and full inactive/adult leakage tests.
- Computer Use: only if Inspector presentation changes; otherwise no.
- Independent security review: yes, focused on prompt and combat authority.

### Future — Unsafe code MODs

Deferred with no architectural entitlement from V1. It requires a separate threat model, distribution model, process isolation decision, permission UX, and explicit authorization. It must not reuse `node:vm` as a security claim.

## 22. Machine-testable acceptance criteria

- **AC-01** Malformed JSON, duplicate keys, BOM, oversize manifest, unknown field, and missing required field each produce a stable rejection code.
- **AC-02** Any manifest format except exact `lorerelay-mod/1` is rejected.
- **AC-03** Directory ID/version must exactly equal validated manifest ID/version; same-hash `source:any` global/workspace duplicates coalesce and record workspace, while different-hash or same-source duplicates reject.
- **AC-04** Invalid MOD/local/canonical namespace syntax rejects before path construction.
- **AC-05** Canonical backtracking selects a lower package version when its higher version has an unsatisfiable transitive graph; required dependency cycles reject only after every canonical candidate branch is evaluated.
- **AC-06** Shuffling filesystem enumeration, profile entries, and object-key insertion produces byte-identical candidate traversal, chosen versions, load order, diagnostics, and lock.
- **AC-07** JSON whitespace/key order and CRLF/LF equivalents produce the same normalized content hash.
- **AC-08** A changed semantic JSON value, normalized text, binary, or permitted documentation file under the same version produces a lock mismatch.
- **AC-09** A missing required package/exact version is detected before any contribution or canonical write.
- **AC-10** LoreRelay versions below min, at max-exclusive, and outside declared bounds reject activation; exact boundaries are tested.
- **AC-11** Absolute, traversal, backslash, drive, UNC, ADS, reserved-name, trailing-dot/space, and overlong paths reject.
- **AC-12** File/dir symlinks, junctions/reparse points, and realpath escapes reject in source and staged copies.
- **AC-13** ZIP Slip variants reject before extraction writes outside staging.
- **AC-14** ZIP/file/directory/expanded-size/compression-ratio limits pass at the limit and fail at limit + 1.
- **AC-15** Executables/scripts/modules/WASM/nested archives and renamed/disguised payloads reject by declaration and magic bytes.
- **AC-16** An installed but inactive package contributes zero registry entries, prompt bytes, strings, asset URIs, or webview messages.
- **AC-17** A disabled/unapproved adult package contributes zero content and no hidden text/preview/search/accessibility leakage.
- **AC-18** Adult visibility and exact-package enable approval are independent explicit actions; neither action implies the other, and approval stores exact ID/version/manifest/content hashes.
- **AC-19** Reclassifying a package as adult gives it byte-identical capability/authority limits; changing version, manifest hash, or content hash invalidates approval and blocks Resolve with `ADULT_REAPPROVAL_REQUIRED`.
- **AC-20** Adversarial prompt fragments cannot change accepted mechanic facts without a normal valid operation passing existing validation/commit paths.
- **AC-21** Any matching conflict is visible and resolution fails; install order cannot choose a silent winner.
- **AC-22** Serialized profile/lock/checkpoint evidence contains no absolute path, username, drive letter, URI, environment value, or secret.
- **AC-23** Safe Mode leaves canonical files byte-identical, retains unknown fields/IDs, sends no provider request, permits no normal save/mutation command, and placeholders the whole marked adult machine entry without claiming sentence-level attribution.
- **AC-24** Static/runtime harnesses show V1 executes no package code, process, Node module, VS Code command, WASM, network request, or install/update hook.
- **AC-25** With no profile/lock and no enabled packages, existing unmodded scenario, prompt, checkpoint, localization, asset, and campaign behavior is byte/behavior compatible.
- **AC-26** A lock expecting one loadout blocks restore of a checkpoint with another fingerprint; it never activates either loadout silently.
- **AC-27** Asset extension/media declaration/magic bytes must all agree; SVG/GIF/URL/data/file assets reject.
- **AC-28** Same-package localization fallback is deterministic and Core/other-package key targets reject.
- **AC-29** Prompt composition obeys slot/load/ID order and all fragment/package/aggregate byte and token limits at boundary ±1.
- **AC-30** Combat Lab fixture imports cannot change the campaign runtime ability/status catalog or canonical combat output path.
- **AC-31** Scenario MOD import cannot copy undeclared optional files or directly write canonical files outside the explicit new-campaign adapter.
- **AC-32** Global installs stage beside global packages and workspace installs stage beside workspace mods; a different-volume/device fixture fails with `CROSS_DEVICE_STAGING`, never falls back to copy/delete, leaves no partial installed version, and removes only the validated staging directory.
- **AC-33** Scenario-opening and accepted GM entries created under a MOD lock persist exact `{ lockFingerprint, adultActive }` evidence; missing/invalid evidence in a campaign that may have used adult MODs causes conservative whole-entry placeholders, while unmodded history is unchanged.
- **AC-34** Resolver version 1 passes at 512 physical candidates and 10,000 attempted assignments, fails the next candidate/assignment with `RESOLUTION_COMPLEXITY_LIMIT`, emits no partial lock, and produces the same result regardless of wall-clock timing.
- **AC-35** Discovery opens only bounded root manifests. Payload validation/hashing occurs only for one exact source/ID/version/manifest-hash request, and an adult payload is not read before explicit authorization.
- **AC-36** A maximum 512-package, 64-dependencies-per-package graph produces a lock that stays within the 8 MiB lock limit and round-trips through the same parser used at startup; the resolver never returns an unreadable success lock.
- **AC-37** Safe Mode derives history `modContext` only after binding redundant lock rating/tag/capability/dependency/order fields back to the exact installed manifests. A self-consistent aggregate hash cannot downgrade adult classification, and missing lock data with profile/checkpoint/history evidence is not treated as unmodded.
- **AC-38** Package hashing rejects Unicode invariant-case path collisions, files that grow or change after status validation, hard links, mismatched media magic, and every file outside the manifest plus trusted adapter-supplied transitive closure.
- **AC-39** A machine-authored history entry with a known adult lock fingerprint and forged `adultActive: false` is placeholdered by comparison with the independently verified lock context; a bare fingerprint list can never authorize display.
- **AC-40** Adding, deleting, or renaming a package entry after initial enumeration is rejected by final bounded tree revalidation with `PACKAGE_TREE_CHANGED_DURING_HASH` and produces no candidate.
- **AC-41** Strict JSON parsing and programmatic canonicalization accept `2^53 - 1` but reject integer values outside the exact IEEE-754 safe range with `JSON_UNSAFE_INTEGER`; distinct oversized integer spellings can never collapse to one content hash.

## 23. Unresolved implementation blockers and explicit non-goals

Blockers before content activation:

1. The current scenario folder loader recursively copies media folders and copies optional state/rule files; it is not the MOD import security boundary.
2. The current main webview permits workspace roots. MOD assets still need an ID-based broker; broad webview roots cannot stand in for authorization.
3. Current checkpoints lack MOD lock evidence and do not guarantee cross-ledger rollback.
4. `src/i18n.ts` has only shipped bundles; MOD localization needs a separate namespaced, presentation-only resolver.
5. Campaign-kit parsing is intentionally lenient and fallback-oriented; MOD validation must reject unknown/malformed input before calling it.
6. Adult classification is self-declared. V1 performs no censorship/classification AI, so malicious mislabeling remains a user/source trust risk.
7. A provider-specific token counter must be identified at Slice 4; byte limits remain mandatory regardless.

Out of scope: arbitrary scripts/code, Node/VS Code API access, process execution, network access, install/update scripts, online Workshop/downloads/repository, automatic updates, adult-content generation or bundling, hidden unlocks, provider-policy bypass, direct state/receipt writes, native/dynamic plugins, Hydrology, Product Discoverability, Combat aftermath, and S3 Inspector QA report implementation.

## 24. Go / No-Go verdict

**GO** to implement Slice 1 as one High-risk, security-reviewed PR with no production contribution activation or UI.

**NO-GO** to activate content, import ZIPs, or expose MOD Manager controls until their prerequisite slices and acceptance tests pass.

**NO-GO** for executable MODs in V1.

Final design verdict: `MOD_SUBSTRATE_V1_DESIGN_CONFIRMED`
