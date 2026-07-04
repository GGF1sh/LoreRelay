# Mod System Design - Load Order / Profiles / Conflict Viewer

Status: design + gate-ready contract. No implementation in this document.

Track: optional system, default OFF for automatic application.

This document defines a LoreRelay mod system inspired by high-level mod-loader
patterns: profiles, load order, virtual overrides, conflict visibility, and
compatibility patches.

This document does not authorize copying code, UI, file formats, assets, names,
or prose from Mod Organizer 2, Bethesda games, Nexus tools, Steam Workshop,
SillyTavern extensions, or any other project. Use only high-level design
patterns.

## 0. Goal

LoreRelay will attract users who want to add:

- world presets;
- scenario packs;
- lorebooks;
- character cards;
- vehicle definitions;
- mobile bases;
- settlement templates;
- transport contract catalogs;
- image generation presets;
- TTS voice presets;
- prompt snippets;
- maps and visual assets.

The mod system should let users install multiple packages and decide:

- which mods are enabled;
- which profile uses which mods;
- which load order wins;
- what records conflict;
- what compatibility patches are needed;
- what a mod changes before applying it.

Core rule:

> Mods are data overlays. They should not directly mutate campaign state until
> a user explicitly imports/applies them.

## 1. Mental Model

Use a virtual overlay model:

```text
base game / built-in presets
  -> enabled mods in load order
  -> compatibility patches
  -> resolved virtual view
  -> explicit import/apply into a workspace
```

Load order rule:

> Earlier mods load first. Later mods override conflicting records.

This mirrors common user expectations:

- top/earlier = base or dependency;
- bottom/later = patch or personal override;
- later wins for same record ID/path.

The system must show conflicts rather than hide them.

## 2. Mod Folder Layout

Recommended workspace/global structure:

```text
LoreRelayMods/
  mods/
    author.mod-id/
      lorerelay_mod.json
      data/
      assets/
      docs/
  profiles/
    default.mod_profile.json
    postapoc.mod_profile.json
  cache/
    resolved/
```

Optional per-workspace structure:

```text
.lorerelay/
  mods/
  mod_profile.json
  mod_lock.json
```

Global mods are reusable. Workspace profiles choose what is enabled.

## 3. Mod Manifest

```ts
type LoreRelayModManifest = {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  license?: string;
  homepage?: string;
  categories?: ModCategory[];
  dependencies?: ModDependency[];
  conflicts?: ModConflictDeclaration[];
  provides?: ModProvidedRecord[];
  files?: ModFileDeclaration[];
  safety?: ModSafetyDeclaration;
};
```

Closed categories:

```ts
type ModCategory =
  | 'scenario'
  | 'world'
  | 'lorebook'
  | 'character'
  | 'vehicle'
  | 'mobile_base'
  | 'settlement'
  | 'commerce'
  | 'transport'
  | 'image_preset'
  | 'tts'
  | 'prompt'
  | 'ui_theme'
  | 'asset'
  | 'compat_patch'
  | 'other';
```

Rules:

- `id` must be globally safe and namespaced, e.g. `author.mod-id`.
- `version` should be semver-like but parsed defensively.
- manifests must be UTF-8.
- manifests must be capped and sanitized before display.
- no executable scripts in V1.

## 4. Mod Profile and Load Order

```ts
type ModProfile = {
  profileVersion: 1;
  name: string;
  enabledMods: ModLoadEntry[];
};

type ModLoadEntry = {
  modId: string;
  enabled: boolean;
  priority: number;
  note?: string;
};
```

Rules:

- lower `priority` loads earlier;
- higher `priority` loads later and wins conflicts;
- disabled mods are ignored;
- missing dependencies are reported before resolution;
- cyclic dependencies are reported;
- profiles are explicit and portable.

## 5. Record Model

Mods should expose records by stable keys:

```ts
type ModRecordKey = {
  domain: ModRecordDomain;
  id: string;
};

type ModRecordDomain =
  | 'scenario'
  | 'world_region'
  | 'world_location'
  | 'faction'
  | 'lore_entry'
  | 'character'
  | 'vehicle'
  | 'mobile_base'
  | 'settlement_template'
  | 'transport_contract_template'
  | 'image_preset'
  | 'tts_voice'
  | 'prompt_snippet'
  | 'asset';
```

Conflict rule:

> Same domain + same id = conflict. Later enabled mod wins unless a merge
> strategy is explicitly defined.

## 6. Merge Strategies

Default strategy:

- `replace` for records with the same key;
- later mod wins.

Optional explicit strategies:

```ts
type ModMergeStrategy =
  | 'replace'
  | 'append'
  | 'append_unique'
  | 'patch_fields'
  | 'delete'
  | 'disabled';
```

Rules:

- V1 should support `replace` only in pure resolution, plus conflict reporting.
- `append` / `patch_fields` require separate gates because they can create
  subtle schema corruption.
- delete/tombstone records require a separate gate.
- never merge prompt snippets blindly into system prompts.

## 7. Conflict Viewer

Conflict output should be explicit:

```ts
type ModConflictReport = {
  profileName: string;
  conflicts: ModRecordConflict[];
  missingDependencies: ModDependencyIssue[];
  loadOrderWarnings: string[];
};

type ModRecordConflict = {
  key: ModRecordKey;
  winnerModId: string;
  overriddenModIds: string[];
  reason: 'same_record_id' | 'asset_path' | 'declared_conflict' | 'dependency_order';
};
```

UI should eventually answer:

- which mod wins;
- which mod is overridden;
- what record/path conflicts;
- whether a compatibility patch exists;
- whether changing load order would alter the result.

## 8. ID Collision / Similar ID Handling

Automatic replacement is risky.

Recommended behavior:

1. Exact same `domain + id`:
   - conflict;
   - later mod wins in resolved virtual view;
   - report winner/losers.
2. Similar IDs:
   - warn only;
   - do not auto-replace;
   - offer suggested aliases or compatibility patch.
3. Explicit alias:
   - allowed only via a compatibility patch.

```ts
type ModAliasRule = {
  domain: ModRecordDomain;
  fromId: string;
  toId: string;
  reason?: string;
};
```

Rules:

- no silent auto-remap in V1;
- alias rules are data-only and visible;
- alias cycles are rejected;
- aliases may not cross unsafe domains without a gate.

This prevents "helpful" automation from silently changing a campaign's meaning.

## 9. Safety Model

V1 mods are data-only.

Blocked in V1:

- executable JavaScript/TypeScript;
- shell commands;
- Python scripts;
- arbitrary VS Code commands;
- remote URLs loaded at runtime;
- external texture/model downloads;
- prompt injection that changes LoreRelay system rules silently;
- overwriting workspace campaign state without confirmation.

Allowed in V1:

- JSON records;
- Markdown docs;
- local images/audio assets referenced by manifest;
- scenario/lore/character data after validation.

Import/apply must be explicit:

- preview resolved virtual data;
- show conflicts;
- user confirms import into workspace;
- write through existing atomic write patterns.

## 10. Implementation Phases

### MOD1 - Pure Resolver

Goal:

- parse mod manifests;
- parse mod profiles/load order;
- resolve enabled mods into a virtual record set;
- report conflicts;
- no file I/O in core;
- no Webview;
- no workspace writes.

Files:

- `src/modSystemCore.ts`
- `scripts/test_mod_system_core.js`

Core functions:

```ts
parseModManifest(input: unknown): ParsedModManifest | undefined;
parseModProfile(input: unknown): ModProfile;
resolveModProfile(input: ModResolveInput): ModResolveResult;
```

### MOD2 - Local Mod Scanner

After MOD1 gate:

- read `LoreRelayMods/mods/*/lorerelay_mod.json`;
- build installed mod list;
- no apply/import yet.

### MOD3 - Profile UI / Conflict Viewer

Read-only first:

- enabled/disabled;
- load order list;
- conflict report;
- dependency warnings.

No drag-write until a gate approves profile persistence.

### MOD4 - Explicit Import / Apply

Apply resolved records into a workspace only after:

- conflict preview;
- user confirmation;
- atomic writes;
- backup/checkpoint.

### MOD5 - Compatibility Patches / Aliases

Later:

- explicit alias rules;
- compatibility patch packs;
- schema-aware patching.

## 11. Tests

MOD1 required tests:

- invalid manifest rejected safely;
- safe manifest parsed;
- profile disabled mods ignored;
- load order later wins exact conflicts;
- conflict report lists winner and overridden mods;
- missing dependency reported;
- dependency cycle reported;
- similar IDs warn but do not auto-remap;
- explicit alias rule parsed but not applied unless gate approves;
- output deterministic;
- input not mutated.

## 12. Non-Goals

- No executable mods.
- No script extender.
- No runtime arbitrary code.
- No silent auto-remap.
- No direct workspace mutation.
- No Webview write path in MOD1.
- No Steam/Nexus integration in V1.
- No remote download manager in V1.
- No schema-blind patch merging.

## 13. AI Division

Recommended order:

1. **Codex/ChatGPT**: gate this design and approve MOD1 pure resolver only.
2. **Grok/Codex**: implement `modSystemCore.ts` + tests.
3. **Codex/ChatGPT**: implementation gate.
4. **Claude**: read-only conflict viewer UI after core passes.
5. **Gemini**: user-facing mod author guide and README wording.

Key instruction:

> A LoreRelay mod is a data overlay. Load order creates a resolved virtual view;
> user confirmation is required before workspace state changes.

