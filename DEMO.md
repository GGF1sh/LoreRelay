# LoreRelay v1.0 — Demo Recording Guide

Use this checklist when capturing screenshots or a short demo video for README / marketplace.

## Suggested flow (3–5 minutes)

1. **Open Game UI** — `LoreRelay: Open Game UI`
2. **Load sample** — `LoreRelay: Load Scenario Pack` → `sample-scenarios/lost-catacombs`
3. **Play one turn** — pick an option or free input; show GM response + status update
4. **Inspector** — open 🔍 tab; show dice ledger / state patch after a turn
5. **Lorebook** — open 📖 tab; show pinned entry
6. **Director / Party** — show 🎬 and 👥 tabs (optional if party members exist)
7. **Remote Play** — start 📱; show QR panel + phone spectator URL
8. **Image** — trigger 🎨 or GM-generated scene if ComfyUI is running

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