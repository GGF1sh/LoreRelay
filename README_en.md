# LoreRelay - Local-first AI Game Master UI 軸

[English](README_en.md) | [譌･譛ｬ隱枉(README.md) | [邂菴謎ｸｭ譁Ⅹ(README_zh-CN.md) | [郢・ｫ比ｸｭ譁Ⅹ(README_zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.72.0-blue.svg)](https://github.com/GGF1sh/LoreRelay/releases)
[![GitHub](https://img.shields.io/badge/GitHub-GGF1sh%2FLoreRelay-181717?logo=github)](https://github.com/GGF1sh/LoreRelay)

**Local-first AI Game Master UI**

**Antigravity (Free) ﾃ・LoreRelay ﾃ・ComfyUI 窶披・A fully automated RPG environment hosted by frontier models, requiring no API keys or extra costs.**

A VSCode extension that maximizes your existing AI subscriptions, combining backend freedom like SillyTavern with an authentic CRPG experience like Saga & Seeker.
By passing JSON via manual copy-paste (or automating via local agents), it provides a completely open and hackable "Hacker Edition" UI layer to build your own adventure environment.

> 庁 **Notice:** If you like this extension, please consider [buying me a coffee 笘評(https://ko-fi.com/promptpalette)

---

## 検 Features

- 頂 **No Extra API Costs (by default):** No pay-as-you-go API keys are needed for local LLMs, Grok CLI, or manual copy-paste operations. An API key is only required if you use OpenRouter.
- ｧｩ **Agent Bridge:** If you use a locally executable AI like Grok Build, you can send Webview choices and free text input directly to the GM.
- 耳 **Glassmorphism UI:** A rich display featuring a translucent chat UI, worldview theme switching, and an image gallery.
- 笞費ｸ・**CRPG Character Sheet:** A visual status panel inspired by Saga & Seeker and others, managing HP/MP progress bars, skills, and inventory.
- 名・・**Local Image Generation & World Integration (v1.3+):** Integrates with ComfyUI for on-the-spot scene generation; World System can auto-generate backgrounds on location changes.
- 七 **Adaptive BGM & SFX:** Automatically controls and crossfades sound sources registered in `bgm.json` / `sfx.json` based on the GM's instructions.
- 逃 **Scenario Packs:** Load a folder containing `scenario.json` to apply the starting scene, theme, and dedicated BGM/SFX all at once.
- 軸 **Built-in Dice Roller & Calculator:** Includes a dice roller (NdX) and math calculator essential for TRPG-like checks.
- 沈 **Persistent Adventure Log:** Saves adventure logs to `game_history.json`, allowing you to restore your history even after restarting VSCode.
- 剥 **Turn Inspector:** Per-turn dice ledger, state patches, and triggered lore.
- 当 **Lorebook & Memory UI:** ST-compatible lorebook editor, memory search preview, pinned lore injection.
- 汐 **Scenario & Party Director:** `scenario.json` / `party_director.json` with `game_state` runtime overrides.
- 導 **Remote Play (v0.7+):** LAN join URLs (copy & share), player / spectator roles. WebSocket auth, input clamps, and **signed `/media` URLs** (short-TTL HMAC, v1.6.2+).
- 訣 **Living World System (v1.3+):** `world_forge.json` (World Forge), emergent simulation, World tab Mermaid map with biome styling and pan/zoom (v1.6.3+).
- 亮・・**Cartography / Parchment Map (v1.7+, optional advanced):** Region `x/y/biome` 竊・layout PNG 竊・ComfyUI ControlNet parchment map 竊・Webview pin overlay. Requires ComfyUI + SDXL Canny; layout-only works with Python alone.
- 笞呻ｸ・**Emergent Simulation:** Per-turn resource consumption, power balance, and NPC affinity/fear auto-simulation.
- 孱・・**Robust State Management:** Size clamps, invalid ID purge, and safe state migrations to prevent UI crashes from oversized data.
- 早・・**Visual Memory / Soulgaze (v1.5+):** VLM analyzes generated images into `visual_memory.json` and injects visual context into later GM prompts.
- 白 **Audit Wave Hardening (v1.6):** Seven-track audit across State, GM Bridge, World, ST Import, Webview, Remote Play, and Extension Hub with pure validation modules and expanded regression tests.
- 床 **Domain Mode (v1.39+, experimental):** Lordship / fief management 窶・`enableDomainMode` OFF by default ﾂｷ F7窶擢10 engine + World tab UI (v1.40.0).
- 笞費ｸ・**Guild Master (v1.41窶・.44, experimental):** Adventurer guild / quest board 窶・`enableGuildMode` OFF by default ﾂｷ weekly commit ﾂｷ request rulings ﾂｷ party dispatch ﾂｷ absence drift.

Architecture deep dive: [`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md)

### Requirements at a glance

| Tier | What you need |
|------|---------------|
| **Required (core play)** | VSCode 1.85+, Python, `TextAdventureGMSkill` (`SKILL.md`) |
| **Recommended** | GM Bridge (Grok / Ollama / clipboard, etc.) or manual copy-paste |
| **Optional 窶・images** | ComfyUI (API mode) for scene backgrounds and parchment maps |
| **Optional 窶・vision** | VLM (Ollama `llava` or OpenRouter multimodal) for Soulgaze |
| **Optional 窶・multiplayer** | Remote Play (same LAN) |
| **Optional 窶・maps** | Cartography 窶・layout PNG needs Python only; illustrated parchment needs ComfyUI + SDXL Canny |

### Data flow (Persist-Before-Narrate)

Each turn, the GM should write **`turn_result.json`** (`statePatch` + `narration` + `gmEntry` + `turnId`). The extension validates the patch, merges into **`game_state.json`**, and appends an audit entry to `state_journal.ndjson`.

Direct **`game_state.json`** overwrites are an **emergency fallback** (manual paste or legacy GM). `turnResultFallback` then synthesizes `turn_result.json` so Inspector, journal, and MediaAgent stay on the same path.

**Cartography pipeline (optional):** `world_forge.json` (region `x` / `y` / `biome`) 竊・layout PNG (`world_map.layout.png`) 竊・(optional) ComfyUI ControlNet 竊・`world_map.png` 竊・桃 pin overlay in the World tab

---

## 萄 Screenshots & Demo

<p align="center">
  <img src="docs/assets/hero-ui.png" alt="LoreRelay main UI" width="720" />
</p>

| Inspector | Remote Play | Party Director |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-inspector.png" width="240" alt="Turn Inspector" /> | <img src="docs/assets/screenshot-remote-play.png" width="240" alt="Remote Play" /> | <img src="docs/assets/screenshot-party-director.png" width="240" alt="Party Director" /> |

| Lorebook | ComfyUI | World Map |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-lorebook.png" width="240" alt="Lorebook editor" /> | <img src="docs/assets/screenshot-comfyui.png" width="240" alt="ComfyUI scene generation" /> | <img src="docs/assets/screenshot-world-map.png" width="240" alt="Parchment world map with pins" /> |

See [`DEMO.md`](DEMO.md) to replace mockups with real screenshots or a demo GIF.

---

## 噫 How to Play

### Quick start (3 minutes)

1. `LoreRelay: Load Scenario Pack` 竊・`sample-scenarios/lost-catacombs`
2. `LoreRelay: Open Game UI` 竊・enable **World Forge** in Game Rules
3. **World** tab 竊・**Parchment** to see bundled `world_map.layout.png` and pins (no ComfyUI)
4. Play one turn and watch the GM response

For illustrated parchment maps: start ComfyUI, then `LoreRelay: Generate World Map Image`. See [`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md) (**optional / advanced**).

This extension uses a loosely coupled mechanism that watches `turn_result.json` (canonical) or `game_state.json` (fallback) from the AI and renders the UI. There are two ways to play depending on your environment.

### Mode A: Auto-Sync Mode (Recommended)
**Target:** If you are using an **agent AI capable of writing to local files**, such as Antigravity, Grok CLI, or VSCode Copilot (Cursor).

1. Have the AI read the included `SKILL.md` and instruct it to "Start the Game Master according to this skill."
2. After that, just chat with the AI. The AI will automatically roll dice, generate images with ComfyUI, and update `game_state.json`.
3. Keep this extension open in VSCode, and the UI will update in real-time!

> **For Antigravity users:** You can easily operate by clicking a choice in the Webview 竊・copy to clipboard 竊・paste into Antigravity chat 竊・auto update. See [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) for details.

### Mode B: Manual Copy & Paste Mode
**Target:** If you are using standard browser-based ChatGPT, Claude, or Gemini.

1. Copy and paste the text of `SKILL.md` into the browser AI and say, "Act as a GM following these instructions."
2. Copy the JSON code block the AI returns and manually overwrite `game_state.json` in VSCode.
3. The moment you save, the VSCode UI will switch. (Perform image generation and dice rolls manually, or use the browser AI's features as a substitute).

---

## 屏・・Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+) 窶・required
- **Python** 窶・required (dice, layout maps, GM bridge scripts)
- **TextAdventureGMSkill** 窶・required (`SKILL.md` and `scripts/`; place next to this repo)
- **ComfyUI** 窶・*optional* (scene images and parchment maps only; start in API mode)
- **VLM** 窶・*optional* (Visual Memory / Soulgaze via Ollama or OpenRouter)

### 2. Quick setup (recommended)

With `TextAdventureGMSkill` placed next to `text-adventure-vsce` (e.g., under `C:\AI\`):

**Windows (PowerShell):**
```powershell
cd text-adventure-vsce
.\scripts\setup.ps1
```

**macOS / Linux:**
```bash
cd text-adventure-vsce
chmod +x scripts/setup.sh
./scripts/setup.sh
```

What the script does:
- Auto-detects GM skill path 竊・generates `my-adventure/.vscode/settings.json`
- `npm install` / `compile` / `test`
- (Optional) VSIX package 竊・`code --install-extension`
- Generates `text-adventure.code-workspace` (3 roots: Game + Skill + Extension)

Example options: `-Locale en` `-GmProvider clipboard` `-SkipVsix`

### 3. Manual extension installation
1. Clone or download this repository.
2. Open the folder in VSCode and run `npm install` in the terminal.
3. Press `F5` to start debugging the extension, or install the VSIX with `npx @vscode/vsce package`.
4. Run `LoreRelay: Open Game UI` from the Command Palette (`Ctrl+Shift+P`) to open the panel.

### 4. Configuration
Search for `textAdventure.skillPath` in VSCode Settings and specify the absolute path to the included `comfyui_generate.py` script.

Main settings:

- `textAdventure.skillPath` 窶・Absolute path to `comfyui_generate.py`
- `textAdventure.locale` 窶・Language for UI / errors / GM prompts (`ja` / `en` / `zh-CN` / `zh-TW`). Can also be changed from the 倹 in the Webview header.
- `textAdventure.gmBridge.provider` 窶・`grok` / `ollama` / `koboldcpp` / `clipboard` / `command` (Details in `GM_BRIDGE_PRESETS.md`)
- `textAdventure.grokBridge.*` 窶・Enable Grok Build auto-send, CLI path, fallback settings
- `textAdventure.imageGen.*` 窶・ComfyUI / Stability Matrix URL, checkpoint, workflow, generation size
- `textAdventure.imageGen.controlNet` 窶・SDXL Canny model name for Cartography (optional)
- `textAdventure.vlm.*` 窶・Soulgaze VLM (`provider` / `model` / `endpoint`)
- `textAdventure.mediaAgent.*` 窶・background image queue, early BGM/SFX from GM stream
- `textAdventure.remotePlay.*` 窶・port, `bindAddress`, `mediaUrlTtlSec` (signed media URL TTL), etc.
- `textAdventure.bgm.*` 窶・BGM manifest and volume
- `textAdventure.sfx.*` 窶・SFX manifest and volume

### 5. Command palette (key commands)

| Command | Purpose |
|---------|---------|
| `LoreRelay: Open Game UI` | Open the main Webview |
| `LoreRelay: Load Scenario Pack` | Load a folder containing `scenario.json` |
| `LoreRelay: Generate World Forge` | Procedurally generate `world_forge.json` |
| `LoreRelay: Generate World Map Image` | Parchment map via ComfyUI (optional) |
| `LoreRelay: Start Remote Play (LAN)` | Issue a LAN join URL |
| `LoreRelay: List Image Models` | List ComfyUI checkpoints |
| `LoreRelay: Import SillyTavern Character Card` | Import ST character card |
| `LoreRelay: Import SillyTavern Lorebook` | Import ST lorebook |
| `LoreRelay: Export Scenario Pack (Workshop ZIP)` | Export a distribution ZIP |
| `LoreRelay: Validate Scenario Pack` | Validate pack structure |

### 6. Key workspace files

| File | Role |
|------|------|
| `game_state.json` | Merged game state the UI renders |
| `turn_result.json` | Per-turn GM output (canonical persistence) |
| `state_journal.ndjson` | Audit journal of state patches |
| `world_forge.json` | Static world design (regions, factions, NPC seeds) |
| `world_state.json` | Dynamic simulation (visited, faction resources, etc.) |
| `visual_memory.json` | VLM scene memory |
| `game_history.json` | Adventure log (restored after restart) |
| `world_map.layout.png` / `world_map.png` | Cartography layout / parchment image |
| `npc_registry.json` | NPC awareness and relationships |

### 7. Scenario Packs
Run `LoreRelay: Load Scenario Pack` from the Command Palette and select a folder containing `scenario.json`.

**Bundled samples (3)** in `sample-scenarios/`:

| Folder | Genre | Theme | Notes |
|--------|-------|-------|-------|
| `lost-catacombs` | Classic dungeon crawl | fantasy | **Cartography demo** (`world_forge.json` + `world_map.layout.png`) |
| `neon-rain` | Cyberpunk noir | cyberpunk | |
| `harbor-mist` | Cozy harbor mystery | modern | |

Also under `TextAdventureGMSkill/scenarios/`.

### 8. SillyTavern compatibility & Workshop

- Import ST characters and lorebooks via the commands above or the Webview. See [`SILLYTAVERN_COMPAT.md`](SILLYTAVERN_COMPAT.md)
- Export and validate scenario packs to build Workshop-ready ZIPs (marketplace publishing is under consideration)

### 9. Model & ComfyUI presets
- [`MODEL_PRESETS.md`](MODEL_PRESETS.md) 窶・copy JSON from `presets/`
- [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md) 窶・scene + cartography workflows
- Cartography (optional): [`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md) ﾂｷ [`docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`](docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md) ﾂｷ [`docs/CARTOGRAPHY_DESIGN.md`](docs/CARTOGRAPHY_DESIGN.md)
- Demo walkthrough: [`sample-scenarios/lost-catacombs/CARTOGRAPHY_DEMO.md`](sample-scenarios/lost-catacombs/CARTOGRAPHY_DEMO.md)

### 10. Documentation index

| Document | Topic |
|----------|-------|
| [`AI_HANDOVER.md`](AI_HANDOVER.md) | Handover guide for other AIs |
| [`CHANGELOG.md`](CHANGELOG.md) | Version history |
| [`GM_BRIDGE_PRESETS.md`](GM_BRIDGE_PRESETS.md) | Ollama / KoboldCPP presets |
| [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) | Antigravity workflow |
| [`SILLYTAVERN_COMPAT.md`](SILLYTAVERN_COMPAT.md) | SillyTavern compatibility |
| [`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md) | World / Visual Memory architecture |
| [`DEMO.md`](DEMO.md) | Replacing screenshots and demo GIFs |

---

## 亮・・Roadmap

> **Source of truth:** `package.json` (currently **1.52.0**) ﾂｷ [`CHANGELOG.md`](CHANGELOG.md) ﾂｷ [`docs/VERSION_TRUTH.md`](docs/VERSION_TRUTH.md) ﾂｷ task board: [`AI_ROADMAP.md`](AI_ROADMAP.md)

**Shipped (summary)**

| Era | Highlights |
|-----|------------|
| **v1.3窶・.7** | World Forge / Emergent Sim / Visual Memory / Audit Wave / Cartography |
| **v1.10窶・.11** | Quest Board (Event-to-Quest) ﾂｷ Agentic GM ﾂｷ Git Timeline ﾂｷ Adaptive TTS |
| **v1.13窶・.18** | Tile Overmap ﾂｷ Cartography C8/C9 ﾂｷ Debug sandbox ﾂｷ world time passage |
| **v1.19窶・.21** | Chronicle ﾂｷ Pacing Director ﾂｷ faction reputation ﾂｷ travel encounters ﾂｷ Replay Export |
| **v1.23窶・.33** | Living World economy (Commerce / Agency) ﾂｷ Commerce UI ﾂｷ trust whereabouts ﾂｷ **LW3 bonds** (NPC竊年PC / player竊年PC / trade ripple) |
| **v1.34** | Parlor Mode (1-on-1 RP) ﾂｷ ST card import |
| **v1.39窶・.40** | Domain Mode (D1窶泥5) ﾂｷ D3 World tab UI ﾂｷ F7 audience / F8 rivals / F9 missions / F10 mass battle |
| **v1.41窶・.44** | Guild Master G1窶敵4 (weekly commit ﾂｷ request board ﾂｷ party dispatch ﾂｷ absence drift) |

See [`docs/FEATURE_MATRIX.md`](docs/FEATURE_MATRIX.md) and `sample-scenarios/trade-routes`.

**Planned**

- README / DEMO screenshots and GIFs
- Overmap image tilesets, hazard one-line GM injection
- Prompt budget priority sliding (long sessions)
- Workshop / marketplace publishing

---

## ､・Contributing & Support
This project is an experimental OSS aiming to be a "new playground for text adventures" in the AI era.
Bug reports and pull requests are highly welcome!

If this project excites you...
痩 **[Buy me a coffee 笘評(https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
