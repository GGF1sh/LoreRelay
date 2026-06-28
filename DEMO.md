# LoreRelay v1.6 — Demo Recording Guide

Use this checklist when capturing screenshots or a short demo video for README / marketplace.

## Suggested flow (5–8 minutes)

1. **Open Game UI** — `LoreRelay: Open Game UI`
2. **Load sample** — `LoreRelay: Load Scenario Pack` → `sample-scenarios/lost-catacombs`
3. **World Forge (optional)** — World tab → Generate World, or `LoreRelay: Generate World Forge` from the command palette
4. **Play one turn** — pick an option or free input; show GM response + status update
5. **World tab** — show Mermaid network map, location move, World Change Summary after a turn
6. **Inspector** — open 🔍 tab; show dice ledger / state patch after a turn
7. **Lorebook** — open 📖 tab; show pinned entry
8. **Director / Party** — show 🎬 and 👥 tabs (optional if party members exist)
9. **ComfyUI image** — trigger 🎨 or GM-generated scene if ComfyUI is running
10. **Visual Memory / Soulgaze** — with `textAdventure.vlm.provider` set to `ollama` or `openrouter`, analyze an image; show description in gallery / next GM turn context
11. **Remote Play** — start 📱; show player/spectator **URL copy panel** (not QR); blur tokens before publishing

## Quick verification before recording

```powershell
cd text-adventure-vsce
npm install
npm run compile
npm test
```

Optional: `npx @vscode/vsce package` to confirm VSIX builds.

## Assets in repo

Pre-rendered UI mockups (for README until you capture real screens):

| File | Use |
|------|-----|
| `docs/assets/hero-ui.svg` | Main README hero |
| `docs/assets/screenshot-inspector.svg` | Turn Inspector |
| `docs/assets/screenshot-remote-play.svg` | LAN remote play |
| `docs/assets/screenshot-party-director.svg` | Party speech control |
| `docs/assets/screenshot-lorebook.svg` | Lorebook editor |
| `docs/assets/screenshot-comfyui.svg` | ComfyUI integration |

Replace SVGs with PNG/GIF captures when ready; keep the same filenames or update README paths.

## Recommended capture settings

- VS Code theme: Dark+ or your usual LoreRelay workspace theme
- Resolution: 1280×720 or 1920×1080
- GIF: 10–15 fps, &lt; 8 MB for GitHub README
- Blur tokens in Remote Play URLs before publishing

## v1.6 highlights to mention on camera

- **Audit Wave**: hardened `game_state` validation, webview postMessage clamps, Remote Play security tests
- **Visual Memory**: images analyzed once, reused from `visual_memory.json` on later turns
- **World System**: procedural `world_forge.json` + per-turn `world_state` simulation