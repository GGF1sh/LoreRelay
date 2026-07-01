# LoreRelay v1.11 — Demo Recording Guide

Use this checklist when capturing screenshots or a short demo video for README / marketplace.

## Quick start (first 3 minutes)

**New player path (Start Hub):**

1. **Open Game UI** on an empty workspace — Start Hub appears
2. Click **🎮 Try the guided demo** (`harbor-mist`, no folder picker)
3. Send one option — show GM response + Status panel

**Map demo path:**

1. **Open Game UI** — `LoreRelay: Open Game UI`
2. **Load cartography demo** — Start Hub **🗺️ Map demo** or `Load Scenario Pack` → `sample-scenarios/lost-catacombs`
3. **Enable World Forge** — Game Rules → World Forge ON
4. **World tab** — **Parchment** view shows bundled `world_map.layout.png` + pins (no ComfyUI)
5. **Play one turn** — pick an option; show status + Inspector

Optional ComfyUI steps below.

## Suggested full flow (5–8 minutes)

1. **Open Game UI** — `LoreRelay: Open Game UI`
2. **Load sample** — `LoreRelay: Load Scenario Pack` → `sample-scenarios/lost-catacombs` (cartography demo) or `neon-rain`
3. **World Forge** — World tab → Generate World, or `LoreRelay: Generate World Forge`
4. **Cartography (optional)** — `LoreRelay: Generate World Map Image` if ComfyUI + ControlNet are ready
5. **Play one turn** — GM response + status update
6. **World tab** — Diagram (Mermaid + pan/zoom) vs **Parchment** (layout or `world_map.png`) + pins
7. **Inspector** — dice ledger / state patch
8. **Lorebook** — pinned entry
9. **ComfyUI scene** — World tab **Scene Image** or GM `imagePrompt`
10. **Visual Memory** — Soulgaze on a gallery image (`textAdventure.vlm.provider`)
11. **Remote Play** — start server; copy player/spectator URLs (signed `/media` links, not session tokens in image URLs)

## Quick verification before recording

```powershell
cd text-adventure-vsce
npm install
npm run compile
npm test
```

Optional: `npx @vscode/vsce package` to confirm VSIX builds.

## Assets in repo

| File | Use |
|------|-----|
| `docs/assets/hero-ui.svg` | Main README hero |
| `docs/assets/screenshot-inspector.svg` | Turn Inspector |
| `docs/assets/screenshot-remote-play.svg` | LAN remote play |
| `docs/assets/screenshot-party-director.svg` | Party speech control |
| `docs/assets/screenshot-lorebook.svg` | Lorebook editor |
| `docs/assets/screenshot-comfyui.svg` | ComfyUI integration |
| `docs/assets/screenshot-world-map.svg` | World tab parchment + pins |
| `sample-scenarios/lost-catacombs/world_map.layout.png` | Real layout preview (cartography demo) |

Replace SVGs with PNG/GIF when ready; keep filenames or update README paths.

## Recommended capture settings

- VS Code theme: Dark+ or your usual LoreRelay workspace theme
- Resolution: 1280×720 or 1920×1080
- GIF: 10–15 fps, &lt; 8 MB for GitHub README
- Blur tokens in Remote Play URLs before publishing

## v1.7 highlights to mention on camera

- **Cartography**: `world_forge.json` → layout PNG → optional ComfyUI parchment → Webview pin overlay
- **World Map UI**: Diagram / Parchment toggle, pan/zoom on Mermaid, current-location pin highlight
- **Signed Remote Play media**: short-TTL HMAC `/media` URLs (v1.6.2+)
- **Visual Memory**: `visual_memory.json` context on later GM turns
- **Living World**: procedural forge + emergent simulation + World Change Summary