# MEDIA-ARCHITECTURE-001  
## ComfyUI Media Profiles, Action Routing, and AI Delegation Boundaries

| Field | Value |
| --- | --- |
| **Branch** | `research/MEDIA-ARCHITECTURE-001` |
| **Base main** | `6d5beff9dc1cc74d4a88344f9fdd93bb181b8de5` |
| **Kind** | Architecture research + design (no production implementation) |
| **Date** | 2026-07-10 (JST) |
| **Author role** | Primary synthesis (read-only repo inspection + external research) |

### Executive verdict

**`MEDIA_ARCHITECTURE_001_DESIGN_READY`**

LoreRelay already has working local ComfyUI execution, MediaAgent queueing, cartography-specific runners, and a proven Antigravity Relay handoff for **GM turns**. It does **not** yet have a safe media architecture: checkpoint / workflow / prompt-mode / size are orthogonal knobs, so invalid combinations (e.g. Anima checkpoint + SDXL `CheckpointLoaderSimple` workflow + Illustrious mode) reach ComfyUI and fail at runtime (`clip input is invalid: None`).

**Target direction (stable):**

1. **Media Intent** (game meaning) → **Media Profile** (compatible stack) → **Prompt Compiler** (family dialect) → **Validated Generation Plan** → **local ComfyUI executor**.  
2. **Action Router** classifies each button as **LOCAL / DELEGATED / HYBRID**, orthogonal to **transport** (**DIRECT / MANUAL_HANDOFF**).  
3. Do **not** optimize permanently for one user’s GPU; ship **hardware tiers + profiles** that scale by detected VRAM/capabilities, with a documented **reference machine** (e.g. 12 GB NVIDIA class) for built-in defaults.  
4. LLM should rarely drive ComfyUI shell; AI proposes structured specs; LoreRelay validates and executes deterministically.

---

## 1. Executive summary (one page)

| Problem | Fix |
| --- | --- |
| Independent image knobs allow illegal stacks | **Profile** binds model family + workflow + encoders + prompt compiler + defaults |
| One global mode for all image jobs | **Media Intent** per job type (portrait, scene, map, …) |
| Generic character description → generic art | Durable **visualIdentity** on character (user-editable) |
| Expression = new txt2img | **Reference-based** low-denoise / identity path first |
| Clipboard vs Antigravity special-cased | **Transport capability** on Action Router |
| AI invents Comfy commands | **Structured result contracts**; local executor only |
| Overfit to 4070 SUPER 12 GB | **Tiers** (fast / balanced / quality) + optional auto-detect VRAM; reference profile, not hard lock |

---

## 2. Current architecture map

### 2.1 Image generation stack (today)

```text
Webview buttons / MediaAgent / auto-location / cartography command
        │
        ▼
imageGenConfig.json (v1) + VS Code settings textAdventure.imageGen.*
  checkpoint, workflowPath, mode, steps, cfg, width, height  (independent)
        │
        ▼
imageGenRunner / characterManager / cartographyRunner
  build env → spawn comfyui_generate.py
        │
        ▼
workflow JSON (API format)
  CheckpointLoaderSimple → CLIPTextEncode ×2 → KSampler → VAEDecode → SaveImage
  (cartography: separate canny/direct SDXL graphs + ControlNet knobs)
        │
        ▼
ComfyUI HTTP API (Stability Matrix / local)
```

**Authoritative pieces today:**

| Piece | Owner | Persist |
| --- | --- | --- |
| Global / workspace image knobs | `imageGenConfig.ts` + settings | `image_gen_config.json` v1 + VS Code config |
| Queue + circuit breaker | `imageGenRunner.ts` / `imageGenCircuitCore.ts` | ephemeral + failure counters |
| Portrait / expression | `characterManager.ts` | character JSON + files under `characters/` |
| Scene auto / GM imagePrompt | `mediaAgent.ts` + turn results | game_state / history |
| Location auto image | `autoLocationImageRunner.ts` + `locationImageBuilder*` | tracking on world |
| World map | `cartographyRunner.ts` + cartography workflows | `world_map*.png` |
| Python executor | `comfyui_generate.py` (+ skill copy) | none |
| Prompt “mode” dialect | `PROMPT_PRESETS` in Python + mode string | config |

### 2.2 Prompt modes (today)

Hard-coded in Python: `pony` | `illustrious` | `natural` | `standard` — **prefix/suffix/negative only**. Not bound to workflow graph family. No validation that checkpoint’s text encoder matches workflow loader nodes.

### 2.3 GM / Relay execution (today)

```text
handlePlayerInput
  if antigravityRelay.enabled:
    write antigravity_relay_request.json
    clipboard payload (optional)
    wait for turn_result.json (requestId correlation)
  else:
    invokeGmBridge (ollama/openrouter/vscode-lm/command/…)
    or fallbackToClipboard
```

Image buttons mostly **bypass Relay** and call ComfyUI directly (LOCAL process spawn), independent of GM provider. There is **no** unified Action Router for “portrait” vs “GM turn” vs “adapt character.”

### 2.4 Workflow inventory (repo-owned)

| Workflow | Role |
| --- | --- |
| `comfyui/workflow_sdxl_1024.json` | Generic SDXL txt2img (`CheckpointLoaderSimple` + dual CLIP from same ckpt) |
| `comfyui/workflow_api.json` | Bundled/skill default API graph (same family pattern) |
| `comfyui/workflow_cartography_sdxl_canny.json` | Map + ControlNet Canny |
| `comfyui/workflow_cartography_sdxl_direct.json` | Map direct |
| Skill `workflow_api.json` | Installed skill copy for Antigravity GM scripts |

### 2.5 Character portrait path (today)

`generatePortrait` builds English prose from `char.name` + `char.description` + theme, then runs the **same** Comfy pipeline as scenes. No durable structured visual identity; expression generation is a separate spawn with expression keyword, not a strong identity lock.

---

## 3. Current failure map

### 3.1 Confirmed human failure (accepted evidence)

Settings (example):

| Knob | Value |
| --- | --- |
| checkpoint | `Anima\matureritualANIMA_test011.safetensors` |
| workflow | `comfyui/workflow_sdxl_1024.json` |
| mode | `illustrious` |
| steps / cfg / size | 28 / 7 / 1024×1024 |

Runtime: **`ERROR: clip input is invalid: None`**

Interpretation: workflow expects CLIP outputs from `CheckpointLoaderSimple` suitable for SDXL dual-CLIP encode; Anima-class checkpoints (different packaging / encoder assumptions) do not supply the expected CLIP graph → CLIP is `None`.

**Root cause class:** independent configuration axes without a **compatibility unit** (profile).

### 3.2 Quality failure (accepted evidence)

Thin narrative description (“生真面目な見習い薬師…”) → technically valid but **generic** portrait. Missing durable, multi-field **visualIdentity** used by all portrait/scene compilers.

### 3.3 Structural smells

| Smell | Impact |
| --- | --- |
| One global image stack for all intents | Map, face, scene share wrong defaults |
| Expression ≈ new txt2img | Identity drift |
| MediaAgent auto-image uses global mode | Silent wrong family under auto |
| Circuit breaker only after failures | Wastes time; does not prevent illegal graphs |
| Relay proven for GM turns only | Image/AI-prep actions lack general manual handoff UX |
| Filename “hints” as mental model | Users pick Anima file into SDXL workflow |

### 3.4 Product distribution constraint (user note)

LoreRelay is a **distributed, multi-user** extension. Architecture must **not** hard-lock to one PC (4070 SUPER / 32 GB / Stability Matrix path). Use:

- **capability detection** (VRAM, Comfy object_info, installed nodes)  
- **named hardware tiers** (e.g. `vram_8`, `vram_12`, `vram_16_plus`, `unknown`)  
- **user-selectable profiles** with AUTO that picks a **compatible** installed profile  

The author’s machine is a **reference profile** for built-in defaults, not the product’s only supported configuration.

---

## 4. External research findings (2025–2026)

Sources: primary-oriented ComfyUI docs and workflow practice; secondary practical guides labeled.

### 4.1 Stable technical facts (architecture-relevant)

1. **Model families are not interchangeable in one graph.** Official troubleshooting distinguishes SD1.5 / SDXL / Flux (latent channels, dual CLIP vs DualCLIP+T5, etc.). Wrong encoder → load/run failures.  
   Primary: [ComfyUI model issues](https://docs.comfy.org/troubleshooting/model-issues).

2. **`CheckpointLoaderSimple` embeds model+CLIP(+VAE) assumptions.** SDXL-oriented simple workflows wire `CLIPTextEncode` to checkpoint CLIP outputs. Models that are not SDXL-compatible checkpoints will not feed those ports.

3. **Modern “modular” stacks** (UNET / dual clip loader / separate VAE) are first-class for non-classic checkpoints (Flux-class and similar). Practical guidance repeatedly separates **diffusion weights** from **text encoders**.  
   Secondary (practical): multi-family ComfyUI setup videos/guides (2024–2025).

4. **`/object_info`** exposes node input enums (checkpoint lists, etc.). LoreRelay already uses this for checkpoint listing; it should also drive **capability discovery** (node classes present, optional custom nodes).

5. **Prompt dialects differ by fine-tune culture** (Pony score tags, Illustrious aesthetic tags, natural language for newer encoder stacks). Encoding these as **compilers**, not global strings, matches practice.

6. **Identity-preserving edits** (expression) reliably need **reference conditioning** (img2img low denoise, IP-Adapter-class, face lock, inpaint) rather than pure txt2img. Exact node choice is volatile; the **intent** (same identity, expression delta) is stable.

### 4.2 Volatile recommendations (profile data, not core)

- Specific Anima / Illustrious / Pony recommended steps, CFG, LoRA lists  
- Fashionable identity nodes (IP-Adapter variants)  
- Exact VRAM occupancy numbers without measured profiles  

**Rule:** ship volatile data as **versioned built-in profiles** that can be updated without redesigning routers/compilers.

---

## 5. Stable vs volatile decisions

| Stable (core architecture) | Volatile (data / profiles) |
| --- | --- |
| Media Intent types | Concrete checkpoint filenames |
| Media Profile **schema** | Per-model step/CFG defaults |
| Compatibility validation **rules engine** | Bundled workflow JSON revisions |
| Prompt compiler **interface** | Tag lists / aesthetic suffixes |
| Action Router classes | Default “AUTO” ranking weights |
| Manual handoff state machine | Exact short trigger strings per transport |
| visualIdentity **storage location** | Fashion terms for beauty/style |
| Fail-closed before queue | Recommended LoRAs |

---

## 6. Recommended target architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ UI Button / MediaAgent / GM turn field                        │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Action Router                                                 │
│  class: LOCAL | DELEGATED | HYBRID                            │
│  transport: DIRECT | MANUAL_HANDOFF (capability of provider)  │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
        │ LOCAL                         │ DELEGATED / HYBRID
        ▼                               ▼
┌──────────────────┐         ┌────────────────────────────────┐
│ Deterministic    │         │ Provider Transport              │
│ host logic       │         │ API / process / vscode-lm /     │
└────────┬─────────┘         │ MANUAL_HANDOFF (Relay/clipboard)│
         │                   └───────────────┬────────────────┘
         │                                   │ structured AI result
         ▼                                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Media Intent (+ optional visualIdentity refs)                 │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Profile Router (intent + installed caps + tier + user pref)   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Prompt Compiler (family dialect)                              │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Compatibility Validator → Generation Plan                     │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ ComfyUI Executor (queue, circuit, workspace-safe paths)       │
└─────────────────────────────────────────────────────────────┘
```

**Principle:** Game state and simulation authority stay host-owned. AI may fill **proposals** (visualIdentity draft, narrative imagePrompt, media intent enrichment). Host **validates and executes**.

---

## 7. Action Router design

### 7.1 Concepts

| Concept | Meaning |
| --- | --- |
| **Action kind** | Stable product verb: `generatePortrait`, `generateSceneImage`, `saveCharacter`, … |
| **Execution class** | `LOCAL` \| `DELEGATED` \| `HYBRID` |
| **Transport** | How AI is reached if needed: `DIRECT` \| `MANUAL_HANDOFF` |
| **Provider** | Who answers AI: ollama, openrouter, vscode-lm, antigravity-relay, clipboard, none |

**Do not** branch UI on `if (antigravity)`. Branch on:

```text
needsAi = execution class ≠ LOCAL
transport = provider.capabilities.transport
```

### 7.2 Direct answers (section 21)

**A. Global `clipboardMode` vs capability router?**  
→ **Capability-based Action Router.** A single boolean is insufficient (Relay vs pure clipboard vs API differ). A boolean may remain as a **legacy alias** that forces `MANUAL_HANDOFF` for AI actions.

**B. AI → ComfyUI directly vs structured intent?**  
→ **Default: AI → structured intent/spec → host validation → local ComfyUI.**  
Direct AI shell/Comfy invent is rejected.

**C. Pure LOCAL examples**  
save/delete character, upload portrait, party add/remove, equipment notify (if pure state), settings toggles, cancel handoff, copy trigger, open image folder.

**D. Truly DELEGATED**  
GM narrative turn, summarize/archive that need LLM prose, free-form “adapt character to world” **semantic drafting**, world-building quickstart prose.

**E. HYBRID**  
generate portrait when visualIdentity missing (AI drafts identity → host generates); adapt-to-world that writes structured fields then host persists; optional “improve visualIdentity from scene analysis” (VLM → identity patch).

**F. Generalize Antigravity Relay?**  
→ **Generalize the pattern**, not necessarily one giant request file for everything.  
Recommend: **shared Manual Handoff state machine** + **narrow request schemas** (`gm_turn_request`, `media_spec_request`, …) with common envelope (`requestId`, workspace identity, expected output kind). Reuse Relay’s requestId fail-closed lessons.

**G. One profile for all image types?**  
→ **No.** Per-intent profile binding + shared family compilers.

**H. Prevent incompatible pairs?**  
→ Profile packages legal stacks; validator checks graph family vs installed weights/nodes **before** queue; reject with human-readable reason + suggested profile.

**I. Smallest first implementation phase?**  
→ **Phase M1: Media Profile + preflight validation** for existing txt2img path (block Anima+SDXL) + migration of v1 knobs into a default profile. No full Action Router yet.

**J. Postpone?**  
Full AUTO VRAM probing perfection, IP-Adapter productization, multi-character scene continuity graph, cloud backends, automatic chat injection, emblem/item media types (schema stubs only).

---

## 8. Direct vs delegated vs hybrid decision table

| Action | Class | Notes |
| --- | --- | --- |
| Save / delete character | LOCAL | |
| Upload portrait | LOCAL | |
| Party join/leave | LOCAL | |
| Generate portrait (identity complete + profile OK) | LOCAL | Host Comfy only |
| Generate portrait (identity missing) | HYBRID | AI → visualIdentity draft → host Comfy |
| Generate expression | LOCAL (preferred path) | Reference-based plan; AI only if identity missing |
| Generate scene from `imagePrompt` on GM entry | LOCAL | Prompt already semantic; compile+execute |
| Auto location image | LOCAL | Builder already deterministic |
| World map cartography | LOCAL | Separate profile/workflow |
| MediaAgent stream BGM/SFX | LOCAL | |
| MediaAgent auto image from GM | LOCAL after GM completed | |
| GM player turn | DELEGATED | Existing Relay/API/clipboard |
| Summarize / archive saga | DELEGATED | |
| Adapt character to world | HYBRID | AI draft fields → host save |
| Force-speak / director AI | DELEGATED | |
| Set equipment + notify GM | HYBRID or DELEGATED | state local + optional GM note |

Same button labels; router decides class + transport.

---

## 9. Provider transport capability model

```text
ProviderRecord {
  id: string
  executionSupport: ('DELEGATED' | 'HYBRID')[]
  transport: 'DIRECT' | 'MANUAL_HANDOFF'
  // DIRECT: API/process returns structured or free text the host can parse
  // MANUAL_HANDOFF: host writes pending + shows short trigger
}
```

Examples:

| Provider | transport |
| --- | --- |
| openrouter / ollama / kobold / vscode-lm | DIRECT |
| clipboard fallback | MANUAL_HANDOFF |
| antigravityRelay | MANUAL_HANDOFF |
| none / local-only mode | n/a for AI |

**Image LOCAL actions ignore GM transport** unless HYBRID prep needs AI.

---

## 10. Manual handoff architecture

### 10.1 Shared state (ephemeral + durable request file)

```text
ManualHandoffPending {
  requestId: string
  kind: 'gm_turn' | 'media_spec' | 'visual_identity' | …
  createdAt: string
  workspaceIdentity: string
  shortTrigger: string          // exact copyable command
  humanSummary: string          // one-line UI
  expectedResultKind: string
  payloadRef: workspace-relative path to request JSON
}
```

UI (one reusable panel/banner pattern, like Relay waiting):

- status: pending / error / done  
- exact trigger + **Copy**  
- Cancel (clears pending, unlocks)  
- no claim of auto-submit  

### 10.2 Relation to Antigravity Relay

| Reuse | Separate |
| --- | --- |
| requestId correlation | do not stuff media jobs into GM turn_result schema |
| workspace identity | narrow result contracts per kind |
| waiting UI state machine lessons | optional different file under `.text-adventure/` |
| fail-closed on mismatch | |

---

## 11. Media Intent schema (smallest useful)

```typescript
// Conceptual — not implemented
type MediaIntentType =
  | 'portrait_fullbody'
  | 'portrait_bust'
  | 'expression'
  | 'scene'
  | 'location'
  | 'world_map'
  | 'item'          // phase later
  | 'emblem';       // phase later

interface MediaIntent {
  schemaVersion: 1;
  type: MediaIntentType;
  subjects?: { characterId?: string; name?: string }[];
  visualIdentityRef?: string;     // characterId or embedded snapshot id
  locationId?: string;
  worldTheme?: string;
  action?: string;                // short free text
  mood?: string;
  timeOfDay?: string;
  weather?: string;
  framing?: 'full_body' | 'portrait' | 'wide' | 'map' | 'closeup';
  aspect?: '1:1' | '2:3' | '3:2' | '16:9' | 'auto';
  continuity?: {
    referenceImagePath?: string;  // workspace-relative
    lockIdentity?: boolean;
    lockOutfit?: boolean;
  };
  seedPolicy?: 'random' | 'fixed';
  seed?: number;
  // Optional raw override for advanced users only:
  userPromptHint?: string;
}
```

### Examples

**Standing portrait**

```json
{
  "schemaVersion": 1,
  "type": "portrait_fullbody",
  "subjects": [{ "characterId": "hero1", "name": "Lux" }],
  "visualIdentityRef": "hero1",
  "worldTheme": "fantasy",
  "framing": "full_body",
  "aspect": "2:3",
  "continuity": { "lockIdentity": true }
}
```

**Expression**

```json
{
  "schemaVersion": 1,
  "type": "expression",
  "subjects": [{ "characterId": "hero1" }],
  "visualIdentityRef": "hero1",
  "action": "smile, gentle eyes",
  "framing": "closeup",
  "continuity": {
    "referenceImagePath": "characters/hero1_portrait.png",
    "lockIdentity": true,
    "lockOutfit": true
  }
}
```

**Scene**

```json
{
  "schemaVersion": 1,
  "type": "scene",
  "subjects": [{ "characterId": "hero1" }],
  "locationId": "olive_village",
  "action": "preparing herbs at a wooden table",
  "mood": "calm morning",
  "framing": "wide",
  "aspect": "16:9"
}
```

**World map**

```json
{
  "schemaVersion": 1,
  "type": "world_map",
  "worldTheme": "fantasy",
  "framing": "map",
  "aspect": "1:1",
  "continuity": { "referenceImagePath": "world_map.layout.png" }
}
```

---

## 12. Media Profile schema (proposal)

```typescript
interface MediaProfile {
  schemaVersion: 1;
  id: string;                    // e.g. "illustrious-xl-scene-balanced"
  displayName: string;
  modelFamily: 'sdxl_illustrious' | 'sdxl_pony' | 'sdxl_generic' | 'anima_family' | 'cartography_sdxl' | 'unknown';
  intents: MediaIntentType[];    // which intents this profile may serve
  workflow: {
    path: string;                // repo or user path
    graphFamily: 'sdxl_checkpoint_simple' | 'modular_dual_clip' | 'cartography_canny' | 'cartography_direct' | string;
  };
  weights: {
    checkpoint?: string;         // if graph uses CheckpointLoaderSimple
    unet?: string;
    clip?: string[];             // ordered
    vae?: string;
  };
  requiredNodes: string[];       // class_type names
  promptCompilerId: string;      // 'illustrious_tags' | 'pony_score' | 'natural_prose' | 'cartography'
  defaults: {
    width: number; height: number;
    steps: number; cfg: number;
    samplerName?: string; scheduler?: string;
    denoise?: number;            // for img2img expression
  };
  loras?: { name: string; strength: number }[];
  controlNet?: { model: string; strength: number };
  hardware: {
    minVramGb?: number;
    tierHints?: ('vram_8' | 'vram_12' | 'vram_16_plus' | 'unknown')[];
  };
  fallbackProfileId?: string;
  // Validation
  rejectsFamilies?: string[];    // hard incompatibilities
}
```

### Built-in vs user vs workspace

| Layer | Content |
| --- | --- |
| Repo built-ins | Safe SDXL Illustrious/Pony/cartography profiles + validators |
| User global | Custom profiles pointing at personal checkpoints |
| Workspace | Intent→profile overrides for a campaign |
| Runtime discovery | Installed ckpts/nodes from Comfy `object_info`; never invent missing files |

**Filename hints** (path contains `anima`, `pony`, `illustrious`) = **weak evidence only** for suggesting a profile, never for silent execution without graph family match.

---

## 13. Prompt compiler architecture

```text
MediaIntent + visualIdentity + profile
        → PromptCompiler.compile()
        → { positive, negative?, extraConditioningHints? }
```

| Compiler id | Dialect |
| --- | --- |
| `natural_prose` | Full sentences (Anima-class / natural) |
| `illustrious_tags` | Hybrid tags + aesthetic suffixes |
| `pony_score` | score_/source_/rating_ conventions |
| `cartography` | Map/layout language; no character beauty tags |

**Rules:**

- Store **intent + identity**, not only final strings (recompile when profile changes).  
- Negative prompts are **compiler output**, optional per family.  
- Adding a compiler = new module + profile field; **no** per-button forks.

---

## 14. Character `visualIdentity` design

### 14.1 Minimal schema

```typescript
interface VisualIdentity {
  schemaVersion: 1;
  // structured, still human-editable
  apparentAge?: string;
  face?: string;
  eyes?: string;
  hair?: string;
  build?: string;
  heightImpression?: string;
  skin?: string;
  signatureFeatures?: string[];
  outfit?: string;
  palette?: string[];
  styleDirection?: string;   // e.g. "clean anime, earnest, soft lighting"
  notes?: string;            // freeform
  // continuity
  referencePortraitPath?: string;
  lastGoodSeed?: number;
}
```

Attach to **character profile JSON** (`characters/<id>.json`), not only chat prose.

### 14.2 Lifecycle

| When | Who | How |
| --- | --- | --- |
| Character create | User and/or AI | Form fields + optional “AI expand description → visualIdentity” HYBRID |
| Generate portrait without identity | HYBRID | AI returns VisualIdentity draft → user confirm or auto-accept soft → generate |
| Profile/model change | Host | Recompile prompts from same identity; do not discard identity |
| Edit | User | Character UI always wins over AI |

**AI may propose; AI must not silently overwrite without host write path.**

### 14.3 Why this fixes generic portraits

Compiler always injects structured identity fields before thin `description` prose. Scene appearances can reference the same identity for consistency.

---

## 15. Expression consistency strategy

| Approach | Reliability | VRAM (12 GB class) | Complexity | Verdict |
| --- | --- | --- | --- | --- |
| Pure txt2img + “same character” text | Low | Medium | Low | Reject as primary |
| img2img low denoise from portrait | Medium–High | Medium | Low | **Default phase 1** |
| IP-Adapter / ref adapters | High when nodes exist | Medium–High | Medium | Phase 2 if nodes detected |
| Face-lock / reactor-class | Variable / ethical noise | Medium | High | Optional advanced only |
| Inpaint mouth/eyes only | High for subtle | Medium | Medium | Phase 2 refinement |

**Recommended primary:** expression MediaIntent with `continuity.referenceImagePath` + profile `denoise` 0.25–0.45 + identity lock text. Fallback to txt2img only if no portrait exists (and warn).

---

## 16. Task-specific routing table

| Intent | Profile family | Compiler | Workflow family | Notes |
| --- | --- | --- | --- | --- |
| portrait_fullbody | illustrious/pony/anima* | matching | family graph | Prefer 2:3; simple BG |
| expression | same as portrait + img2img | short delta | img2img or ref graph | Requires portrait |
| scene | illustrious/natural | hybrid/prose | txt2img | Multi-subject from intent |
| location | same as scene | background template | txt2img | From world forge text |
| world_map | cartography_sdxl | cartography | canny/direct | ControlNet optional |
| item / emblem | later | later | later | Stub intents only |

\*Anima only if **anima graph profile** installed and validated—not via SDXL simple workflow.

---

## 17. Settings v1 → v2 migration

### v1 (`image_gen_config.json`)

Independent: checkpoint, workflowPath, mode, steps, cfg, width, height, sampler, templates…

### v2 (proposal)

```json
{
  "version": 2,
  "selectionMode": "auto" | "manual",
  "defaultProfileId": "illustrious-xl-balanced",
  "intentProfiles": {
    "scene": "illustrious-xl-balanced",
    "portrait_fullbody": "illustrious-xl-portrait",
    "expression": "illustrious-xl-expression-i2i",
    "world_map": "cartography-sdxl-canny"
  },
  "hardwareTier": "auto" | "vram_8" | "vram_12" | "vram_16_plus" | "unknown",
  "customProfiles": [],
  "legacy": { /* preserved v1 fields for one release */ }
}
```

**Migration algorithm:**

1. Read v1.  
2. Infer weak family from mode + checkpoint path hints.  
3. Bind to nearest **compatible** built-in profile if validation passes.  
4. If validation fails, set `selectionMode: "manual"` and surface UI: “previous settings incompatible; pick a profile.”  
5. Keep `legacy` copy for rollback one version.

VS Code settings: deprecate free-form checkpoint/workflow as primary UI; keep advanced override behind “Custom profile.”

---

## 18. Hardware-aware defaults (distribution-safe)

### 18.1 Reference machine (not exclusive)

Documented **reference** for built-in balanced profiles: NVIDIA **12 GB** class (e.g. 4070 SUPER), 32 GB system RAM, local ComfyUI/Stability Matrix.  

All shipped defaults must still run or **fail with a clear “insufficient VRAM / missing nodes”** message on smaller cards.

### 18.2 Tiers

| Tier | Typical VRAM | Defaults bias |
| --- | --- | --- |
| `vram_8` | ~8 GB | 768–896 edge, fewer steps, avoid dual heavy ref nets |
| `vram_12` | ~12 GB | 1024 class SDXL, expression i2i, cartography canny optional |
| `vram_16_plus` | 16 GB+ | higher res optional, more ref adapters |
| `unknown` | ? | conservative = `vram_8` behavior |

### 18.3 Runtime policy

- Prefer **one** heavyweight diffusion stack resident; do not load map ControlNet + portrait ref + large T5 simultaneously without offload.  
- AUTO selection: filter profiles by `requiredNodes` ∩ `object_info` and `minVramGb` ≤ detected/declared tier.  
- User override always wins after explicit confirm.

**Do not claim FPS or exact seconds without measured fixtures.**

---

## 19. Failure and validation model

### Preflight (before queue)

1. Profile exists and is enabled.  
2. Workflow file resolves under allowed roots.  
3. Graph family matches profile weights (e.g. `CheckpointLoaderSimple` requires SDXL-class ckpt binding).  
4. All `requiredNodes` present in Comfy `object_info`.  
5. Weight files exist (from object_info enums or filesystem scan).  
6. Intent continuity paths resolve inside workspace.  
7. Circuit breaker not open.

### On failure

- Human-readable **compatibility** error (not only Python traceback).  
- Suggest next `fallbackProfileId` if installed.  
- Do not queue.  
- Gameplay continues text-only.  
- Existing image circuit breaker remains for **runtime** failures after preflight passed.

---

## 20. Security / workspace authority

| Boundary | Rule |
| --- | --- |
| Paths | Only workspace + configured model roots; reuse `resolveAllowedImagePath` patterns |
| AI write | AI cannot write arbitrary paths; only structured results host accepts |
| Simulation | Image success must not mutate world authority beyond intended media fields |
| Secrets | No cloud keys in profiles; providers keep existing secret storage |
| Untrusted workspace | Keep existing trusted-workspace gates for process spawn |

---

## 21. Alternatives rejected

| Alternative | Why rejected |
| --- | --- |
| More independent settings fields | Amplifies illegal combinations |
| One global profile for all media | Map ≠ face ≠ scene |
| AI always drives Comfy via shell | Unsafe, nondeterministic, hard to test |
| Hardcode Anima as permanent core | Volatile; breaks other users |
| Hardcode 4070 SUPER only | Distribution product |
| Automatic chat injection as requirement | Not proven; out of scope |
| Replace ComfyUI | Local-first investment already works |
| Severity-free “always AUTO best quality” | VRAM/latency cliffs |

---

## 22. Risks and unknowns

| Risk | Mitigation |
| --- | --- |
| Anima/Qwen-class packaging varies by release | Profile-specific graphs; community validation suite |
| object_info incomplete offline | Cache last discovery; fail closed if required node missing |
| Profile explosion | Small built-in set + user custom; AUTO ranking |
| HYBRID latency | Cache visualIdentity; skip AI when complete |
| Expression i2i quality variance | Tune denoise; optional phase-2 adapters |
| Registry/protocol noise in knowledge tools | Orthogonal; use lookups for names only |

---

## 23–24. Phased implementation plan (Codex-sized)

### Phase M0 — Spec lock (docs only) ✅ this document

### Phase M1 — **Compatibility gate + profile spine** (first ship)

| | |
| --- | --- |
| **Goal** | Stop illegal checkpoint×workflow×mode combos; introduce profile records + preflight |
| **Touch-set (est.)** | `imageGenConfig.ts`, `imageGenRunner.ts`, `comfyui_generate.py` (read profile id), new `mediaProfile*.ts`, built-in JSON profiles, tests, i18n errors |
| **Risk** | Medium (generation path) |
| **AI** | Codex 5.5 / high effort |
| **Tests** | Unit: profile validate; reject Anima+SDXL fixture; migrate v1 sample; circuit still works |
| **Human smoke** | Yes: intentional bad combo rejected; good Illustrious/Pony path still generates |

### Phase M2 — **Media Intent + compilers for scene/portrait**

| | |
| --- | --- |
| **Goal** | Intent object + compilers; portrait/scene buttons build intents |
| **Touch-set** | new intent types, compilers, webview generate handlers, characterManager portrait path |
| **Risk** | Medium |
| **AI** | Codex high |
| **Tests** | Compiler snapshots per family; intent sanitize |
| **Human smoke** | Portrait + scene with two profiles |

### Phase M3 — **visualIdentity**

| | |
| --- | --- |
| **Goal** | Schema on character; UI edit; HYBRID fill-if-missing |
| **Touch-set** | character types, character UI, optional AI draft contract, i18n |
| **Risk** | Medium (UX) |
| **AI** | Codex + design pass |
| **Tests** | schema sanitize; generation uses identity fields |
| **Human smoke** | Thin description + identity fields → less generic art |

### Phase M4 — **Expression reference path**

| | |
| --- | --- |
| **Goal** | img2img/low-denoise expression profile |
| **Touch-set** | expression workflow profile, characterManager expression, tests |
| **Risk** | Medium |
| **AI** | Codex high |
| **Tests** | continuity path required; fallback warning |
| **Human smoke** | Same clothes/face, expression change |

### Phase M5 — **Action Router + manual handoff generalization**

| | |
| --- | --- |
| **Goal** | LOCAL/DELEGATED/HYBRID + transport; shared pending UI for non-GM AI prep |
| **Touch-set** | new router module, wire subset of buttons, handoff UI reuse Relay lessons |
| **Risk** | High (cross-cutting) |
| **AI** | Codex very high + **Grok independent verify** |
| **Tests** | router tables; handoff requestId fail-closed |
| **Human smoke** | HYBRID portrait with MANUAL_HANDOFF provider |

### Phase M6 — **Cartography profile integration**

| | |
| --- | --- |
| **Goal** | Map intents always use cartography profiles, not scene profile |
| **Touch-set** | cartographyRunner binding, profiles |
| **Risk** | Medium |
| **AI** | Codex high |
| **Tests** | wrong profile rejected for world_map intent |
| **Human smoke** | Map gen with SDXL canny profile |

### Phase M7 — **AUTO tier selection polish**

| | |
| --- | --- |
| **Goal** | hardwareTier + object_info filtering + UI explanation of chosen profile |
| **Risk** | Low–medium |
| **AI** | Codex medium |
| **Human smoke** | AUTO picks installed compatible profile |

---

## 25. Which phases need Grok independent verification

| Phase | Grok verify? |
| --- | --- |
| M1 compatibility gate | **Yes** (safety-critical) |
| M2 intents/compilers | Optional focused |
| M3 visualIdentity | Optional UX |
| M4 expression | **Yes** (quality claim) |
| M5 Action Router / handoff | **Yes** (protocol / authority) |
| M6 cartography binding | Optional |
| M7 AUTO | Optional |

---

## 26. Suggested human smoke tests (post-implementation)

1. **Illegal stack blocked:** Anima ckpt + SDXL simple workflow → preflight error, no Comfy queue.  
2. **Legal stack works:** Illustrious/Pony profile scene 1024 on 12 GB class machine.  
3. **Portrait with rich visualIdentity** less generic than description-only baseline.  
4. **Expression** from portrait reference keeps hair/outfit.  
5. **World map** cannot silently use scene illustrious profile.  
6. **AUTO** with only one family installed selects that family.  
7. **HYBRID** identity fill then local generate when provider is MANUAL_HANDOFF: short trigger only, no long dump.  
8. **Comfy offline:** clear error; text play continues.  
9. **Relay GM turn** still works unchanged (regression).  
10. **Small VRAM tier** refuses quality profile that declares minVram 16.

---

## Explicit answers (section 21 checklist)

| Q | Answer |
| --- | --- |
| **A** | Capability Action Router; boolean only as legacy force-manual |
| **B** | Structured intent → host validate → local Comfy (not AI→Comfy shell) |
| **C** | Pure state/file ops, uploads, copy/cancel, most media execute when fully specified |
| **D** | GM turns, summaries, open-ended semantic drafting |
| **E** | Identity creation, adapt-to-world, optional VLM assist |
| **F** | Generalize handoff **pattern**; narrow schemas per kind |
| **G** | No single profile for all intents |
| **H** | Profiles + preflight graph/weight/node validation |
| **I** | M1 compatibility + profile spine |
| **J** | Cloud, auto chat inject, fashion adapters, item/emblem full UX |

---

## Final verdict

**`MEDIA_ARCHITECTURE_001_DESIGN_READY`**

The design is implementable in focused phases starting with **compatibility-safe Media Profiles** and expanding to intents, visualIdentity, expression continuity, and a unified Action Router—without locking LoreRelay to a single user GPU or a single model fad.

---

## Appendix A — Source map (inspected)

- `src/imageGenConfig.ts`, `imageGenRunner.ts`, `imageGenCircuitCore.ts`  
- `src/characterManager.ts` (portrait/expression)  
- `src/mediaAgent.ts`, `autoLocationImageRunner.ts`, `locationImageBuilder*.ts`  
- `src/cartographyRunner.ts`, cartography workflows  
- `src/gmBridgeRunner.ts` (clipboard fallback), Antigravity relay core/host  
- `antigravity-skill/.../comfyui_generate.py`, `PROMPT_PRESETS`  
- `comfyui/workflow_sdxl_1024.json`, cartography JSON graphs  
- Knowledge lookups for imageGen / generatePortrait / mediaAgent / clipboard  

## Appendix B — Citation notes

- ComfyUI official troubleshooting: model family mismatches (SD1.5 / SDXL / Flux encoder differences).  
- Practical SDXL simple workflows using `CheckpointLoaderSimple` (comfy.org / community SDXL examples).  
- Secondary: multi-family loader practices (dual CLIP / separate VAE) for non-classic checkpoints.
