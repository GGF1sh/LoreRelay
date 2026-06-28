# LoreRelay - Local-first AI Game Master UI 🎲

[English](README_en.md) | [日本語](README.md) | [简体中文](README_zh-CN.md) | [繁體中文](README_zh-TW.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Local-first AI Game Master UI**

**Antigravity (Free) × LoreRelay × ComfyUI —— A fully automated RPG environment hosted by frontier models, requiring no API keys or extra costs.**

A VSCode extension that maximizes your existing AI subscriptions, combining backend freedom like SillyTavern with an authentic CRPG experience like Saga & Seeker.
By passing JSON via manual copy-paste (or automating via local agents), it provides a completely open and hackable "Hacker Edition" UI layer to build your own adventure environment.

> 💡 **Notice:** If you like this extension, please consider [buying me a coffee ☕](https://ko-fi.com/promptpalette)

---

## 🌟 Features

- 💸 **No Extra API Costs (by default):** No pay-as-you-go API keys are needed for local LLMs, Grok CLI, or manual copy-paste operations. An API key is only required if you use OpenRouter.
- 🧩 **Agent Bridge:** If you use a locally executable AI like Grok Build, you can send Webview choices and free text input directly to the GM.
- 🎨 **Glassmorphism UI:** A rich display featuring a translucent chat UI, worldview theme switching, and an image gallery.
- ⚔️ **CRPG Character Sheet:** A visual status panel inspired by Saga & Seeker and others, managing HP/MP progress bars, skills, and inventory.
- 🖼️ **Local Image Generation & World Integration (v1.3+):** Integrates with ComfyUI for on-the-spot scene generation; World System can auto-generate backgrounds on location changes.
- 🎵 **Adaptive BGM & SFX:** Automatically controls and crossfades sound sources registered in `bgm.json` / `sfx.json` based on the GM's instructions.
- 📦 **Scenario Packs:** Load a folder containing `scenario.json` to apply the starting scene, theme, and dedicated BGM/SFX all at once.
- 🎲 **Built-in Dice Roller & Calculator:** Includes a dice roller (NdX) and math calculator essential for TRPG-like checks.
- 💾 **Persistent Adventure Log:** Saves adventure logs to `game_history.json`, allowing you to restore your history even after restarting VSCode.
- 🔍 **Turn Inspector:** Per-turn dice ledger, state patches, and triggered lore.
- 📖 **Lorebook & Memory UI:** ST-compatible lorebook editor, memory search preview, pinned lore injection.
- 🎬 **Scenario & Party Director:** `scenario.json` / `party_director.json` with `game_state` runtime overrides.
- 📱 **Remote Play (v0.7+):** LAN join URLs (copy & share), player / spectator roles. WebSocket auth, input clamps, and **signed `/media` URLs** (short-TTL HMAC, v1.6.2+).
- 🌍 **Living World System (v1.3+):** `world_forge.json` (World Forge), emergent simulation, World tab Mermaid map with biome styling and pan/zoom (v1.6.3+).
- 🗺️ **Cartography / Parchment Map (v1.7+, optional advanced):** Region `x/y/biome` → layout PNG → ComfyUI ControlNet parchment map → Webview pin overlay. Requires ComfyUI + SDXL Canny; layout-only works with Python alone.
- ⚙️ **Emergent Simulation:** Per-turn resource consumption, power balance, and NPC affinity/fear auto-simulation.
- 🛡️ **Robust State Management:** Size clamps, invalid ID purge, and safe state migrations to prevent UI crashes from oversized data.
- 👁️ **Visual Memory / Soulgaze (v1.5+):** VLM analyzes generated images into `visual_memory.json` and injects visual context into later GM prompts.
- 🔒 **Audit Wave Hardening (v1.6):** Seven-track audit across State, GM Bridge, World, ST Import, Webview, Remote Play, and Extension Hub with pure validation modules and expanded regression tests.

Architecture deep dive: [`docs/WORLD_AND_VISUAL_MEMORY.md`](docs/WORLD_AND_VISUAL_MEMORY.md)

---

## 📸 Screenshots & Demo

<p align="center">
  <img src="docs/assets/hero-ui.svg" alt="LoreRelay main UI" width="720" />
</p>

| Inspector | Remote Play | Party Director |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-inspector.svg" width="240" alt="Turn Inspector" /> | <img src="docs/assets/screenshot-remote-play.svg" width="240" alt="Remote Play" /> | <img src="docs/assets/screenshot-party-director.svg" width="240" alt="Party Director" /> |

| Lorebook | ComfyUI | World Map |
|:---:|:---:|:---:|
| <img src="docs/assets/screenshot-lorebook.svg" width="240" alt="Lorebook editor" /> | <img src="docs/assets/screenshot-comfyui.svg" width="240" alt="ComfyUI scene generation" /> | <img src="docs/assets/screenshot-world-map.svg" width="240" alt="Parchment world map with pins" /> |

See [`DEMO.md`](DEMO.md) to replace mockups with real screenshots or a demo GIF.

---

## 🚀 How to Play

### Quick start (3 minutes)

1. `LoreRelay: Load Scenario Pack` → `sample-scenarios/lost-catacombs`
2. `LoreRelay: Open Game UI` → enable **World Forge** in Game Rules
3. **World** tab → **Parchment** to see bundled `world_map.layout.png` and pins (no ComfyUI)
4. Play one turn and watch the GM response

For illustrated parchment maps: start ComfyUI, then `LoreRelay: Generate World Map Image`. See [`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md) (**optional / advanced**).

This extension uses a loosely coupled mechanism that watches the `game_state.json` exported by the AI and renders the UI. There are two ways to play depending on your environment.

### Mode A: Auto-Sync Mode (Recommended)
**Target:** If you are using an **agent AI capable of writing to local files**, such as Antigravity, Grok CLI, or VSCode Copilot (Cursor).

1. Have the AI read the included `SKILL.md` and instruct it to "Start the Game Master according to this skill."
2. After that, just chat with the AI. The AI will automatically roll dice, generate images with ComfyUI, and update `game_state.json`.
3. Keep this extension open in VSCode, and the UI will update in real-time!

> **For Antigravity users:** You can easily operate by clicking a choice in the Webview → copy to clipboard → paste into Antigravity chat → auto update. See [`ANTIGRAVITY_GUIDE.md`](ANTIGRAVITY_GUIDE.md) for details.

### Mode B: Manual Copy & Paste Mode
**Target:** If you are using standard browser-based ChatGPT, Claude, or Gemini.

1. Copy and paste the text of `SKILL.md` into the browser AI and say, "Act as a GM following these instructions."
2. Copy the JSON code block the AI returns and manually overwrite `game_state.json` in VSCode.
3. The moment you save, the VSCode UI will switch. (Perform image generation and dice rolls manually, or use the browser AI's features as a substitute).

---

## 🛠️ Setup & Installation

### 1. Prerequisites
- **VSCode** (v1.85+)
- **Python** (Required for executing image generation and dice scripts)
- **ComfyUI** (For local image generation. Must be started in API mode)

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
- Auto-detects GM skill path → generates `my-adventure/.vscode/settings.json`
- `npm install` / `compile` / `test`
- (Optional) VSIX package → `code --install-extension`
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

- `textAdventure.skillPath` — Absolute path to `comfyui_generate.py`
- `textAdventure.locale` — Language for UI / errors / GM prompts (`ja` / `en` / `zh-CN` / `zh-TW`). Can also be changed from the 🌐 in the Webview header.
- `textAdventure.gmBridge.provider` — `grok` / `ollama` / `koboldcpp` / `clipboard` / `command` (Details in `GM_BRIDGE_PRESETS.md`)
- `textAdventure.grokBridge.*` — Enable Grok Build auto-send, CLI path, fallback settings
- `textAdventure.imageGen.*` — ComfyUI / Stability Matrix URL, checkpoint, workflow, generation size
- `textAdventure.bgm.*` — BGM manifest and volume
- `textAdventure.sfx.*` — SFX manifest and volume

### 5. Scenario Packs
Run `LoreRelay: Load Scenario Pack` from the Command Palette and select a folder containing `scenario.json`.

**Bundled samples (3)** in `sample-scenarios/`:

| Folder | Genre | Theme | Notes |
|--------|-------|-------|-------|
| `lost-catacombs` | Classic dungeon crawl | fantasy | **Cartography demo** (`world_forge.json` + `world_map.layout.png`) |
| `neon-rain` | Cyberpunk noir | cyberpunk | |
| `harbor-mist` | Cozy harbor mystery | modern | |

Also under `TextAdventureGMSkill/scenarios/`.

### 6. Model & ComfyUI presets (v1.0)
- [`MODEL_PRESETS.md`](MODEL_PRESETS.md) — copy JSON from `presets/`
- [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md) — scene + cartography workflows
- Cartography (optional): [`docs/CARTOGRAPHY_COMFYUI.md`](docs/CARTOGRAPHY_COMFYUI.md) · [`docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`](docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md)

---

## 🗺️ Roadmap

**Shipped (v1.7.1)**

- v1.3: World Forge / Living World / Emergent Simulation / ComfyUI integration
- v1.5: Visual Memory / Soulgaze (VLM queue, GM prompt injection, gallery linkage)
- v1.6: Audit Wave (T1–T8) — validation modules, Remote Play re-audit, ST Import hardening
- v1.6.2: Remote Play **signed media URLs** (HMAC short-TTL)
- v1.6.3: Region **x / y / biome**, Mermaid biome styling, World Map pan/zoom
- v1.7: Cartography ComfyUI pipeline + World tab **Diagram / Parchment** + pin overlay
- v1.7.1: Cartography path validation, layout smoke test, workflow contract, README/DEMO refresh

**Planned (v1.8+)**

- **Event-to-Quest** — turn world simulation events into playable quest hooks
- VLM / Visual Memory operational quality
- Workshop distribution and marketplace publishing

---

## 🤝 Contributing & Support
This project is an experimental OSS aiming to be a "new playground for text adventures" in the AI era.
Bug reports and pull requests are highly welcome!

If this project excites you...
👉 **[Buy me a coffee ☕](https://ko-fi.com/promptpalette)**

---
**Enjoy your adventure!**
