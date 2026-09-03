# MOD Substrate V1 — Slice 2B presentation adapters

Base: `3e4c909e4c2e15b144fac00dd07472120002e848` (Slice 2A).
Risk: High. Scope: presentation only; activation still requires the existing profile/lock gate.

## Contract

- Build MOD localization and media catalogs from the same bounded buffers used for package hashing, in active-lock order. Catalog paths form a strictly validated transitive closure, not permission to read arbitrary paths.
- Inactive and unapproved adult packages contribute neither localization nor assets. Production adult-session permission remains false; this slice adds no consent UI.
- Keep original Scenario opening, Lorebook content and Persona prompt data unchanged. Translate only Scenario selection names/descriptions, Persona selection names, Lorebook display badges, and asset alternative text/descriptions.
- Append raster assets to the existing Parlor/In-World background gallery and audio to the existing BGM/SFX manifests. Selection stores canonical IDs, never file paths. No replace/patch or copying MOD payload into campaign definitions.
- A read-only `lorerelay-mod-asset` filesystem provider serves detached, hash-verified buffers through panel-scoped opaque URIs. Both `stat` and `readFile` recheck the active lock and package identities. No installed-package resource root or filesystem path is sent to the webview.
- Panel disposal revokes its URI grants. On authorization drift, future reads fail immediately; a one-second presentation refresh removes cached MOD choices/backgrounds and stops MOD audio already playing. Reopening is required to acquire a new presentation session.
- Legacy media paths cannot fall back into declared MOD packages or the global/workspace MOD roots.

## Data formats

Asset entrypoints reference JSON catalogs:

```json
{
  "format": "lorerelay-assets/1",
  "assets": [
    { "id": "harbor", "kind": "background", "path": "art/harbor.png", "mediaType": "image/png", "alt": "Harbor" },
    { "id": "harbor-music", "kind": "bgm", "path": "audio/harbor.wav", "mediaType": "audio/wav" }
  ]
}
```

The canonical IDs above are `<manifest.id>:harbor` and `<manifest.id>:harbor-music`. All IDs share the same collision domain as Scenario/Lorebook/Persona contributions. At most 256 assets per package and 1,024 total contribution IDs are accepted. Catalogs are at most 256 KiB; active documents total at most 4 MiB and active media buffers at most 64 MiB.

Localization entrypoints bind a document's exact locale. Keys use `canonical-resource-id#field`:

```json
{
  "format": "lorerelay-localization/1",
  "locale": "ja",
  "strings": {
    "example.story:arrival#name": "到着",
    "example.story:traveler#name": "旅人",
    "example.story:town#label": "港町",
    "example.story:harbor#alt": "港の風景"
  }
}
```

Only same-package existing resources and their allowed fields are accepted: Scenario/Persona `name` and `description`, Lorebook `label`, asset `alt`. Other fields, Core keys, foreign namespaces, duplicate resource/field/locale definitions and markup/URI-bearing strings fail closed. Values are at most 4 KiB; locale files at most 1 MiB. Resolution is exact requested locale (case-insensitive) → same-package `en` → original authored field. There is no language-only or cross-package fallback and no change to base i18n precedence.

## Supported media subset

Extension, declared MIME, container signature and bounded structural/header checks must agree. Images are limited to 10 MiB, 8192×8192 and 40 million pixels. Audio is limited to 25 MiB, 20 minutes for BGM/audio and 60 seconds for SFX.

- PNG: static only; CRC, chunk ordering, bounded decompression size, complete compressed-input consumption and scanline filter checks. Text/private/animation/EXIF/ICC chunks are rejected.
- JPEG: bounded baseline/progressive frame and scan structure, dimensions and exact end marker; optional metadata is rejected except a minimal JFIF header.
- WebP: static VP8/VP8L with bounded dimensions; optional VP8X/ALPH only. Animation, metadata and unknown RIFF chunks are rejected.
- WAV: mono/stereo integer PCM with consistent sample rate, block alignment, byte rate and exact sample-count duration. Only `fmt ` plus `data` chunks are accepted.
- MP3: Layer III frames with consistent stream headers and frame-count duration. ID3/unknown/trailing bytes are rejected; tags are not duration authorities.
- Ogg: one bounded Vorbis stream, page CRC/sequence/continuation/EOS checks, no user comments. Duration uses a conservative maximum-block bound as well as granule checks. Chained/multiplexed streams, Opus and unknown codecs are rejected.

These are deliberately conservative accepted subsets, not a general-purpose codec decoder or transcoder. Unsupported metadata/codecs must not be silently accepted. SVG, GIF, executable/archive/HTML/video/playlist formats and external/data/file URI catalog references remain excluded.

Format references: [PNG specification](https://www.w3.org/TR/png-3/), [WebP container](https://developers.google.com/speed/webp/docs/riff_container), [Vorbis specification](https://www.xiph.org/vorbis/doc/Vorbis_I_spec.html), [WAVEFORMATEX](https://learn.microsoft.com/en-us/windows/win32/api/mmreg/ns-mmreg-waveformatex). The virtual provider follows VS Code's [resource loading](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/resourceLoading.ts) and [webview URI conversion](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/common/webview.ts).

## Interrupted local validation and authorized resumption

The initial local work stopped under `AGENTS.md` after three new-test failures. These were intermediate failures, not acceptance evidence; no PR or merge had occurred.

| Attempt | Error | Classification and repair |
| --- | --- | --- |
| 1 | `SyntaxError: Octal escape sequences are not allowed in strict mode` | Test fixture literals: changed octal-like ZIP signatures to explicit hexadecimal escapes. |
| 2 | `SORTED_UNIQUE_REQUIRED` at `$.capabilities` | Test fixture manifest: sorted the capability array by the existing manifest contract. |
| 3 | `TypeError: Cannot read properties of undefined (reading 'trim')` in `getBgmManifestPath` | Shared test configuration stub returned undefined instead of the supplied default. Work stopped and the user explicitly authorized resumption. |

Resumption fixes the shared stub generically: `get(_key, defaultValue)` returns `defaultValue`; omitted defaults remain undefined. No production optional chaining or ad-hoc fallback was added. The first resumed run of `node scripts/test_mod_presentation_adapters.js` passed 130 assertions, including default values `''`, `0`, `false`, `null`, an object and an omitted default.

Required closing evidence remains focused checks, selected Test Console plan, one fixed-HEAD independent security review, any repair and direct verification, one final unchanged-tree full suite, exact-head CI and eligible Standard Close. Final SHAs/results are recorded in the PR rather than guessed in this document.

Excluded: installers, MOD Manager, adult opt-in UI, Prompt fragments, Campaign Kit, Combat fixtures, replace/patch and arbitrary code MODs.
