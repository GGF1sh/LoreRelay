# Cartography demo — `lost-catacombs`

Bundled files for trying LoreRelay **World Map** without generating a world from scratch.

| File | Purpose |
|:---|:---|
| `world_forge.json` | 2 regions with `x` / `y` / `biome` (underground) + locations |
| `world_state.json` | Sample runtime state (`currentLocationId`, factions) |
| `world_map.layout.png` | Pre-rendered ControlNet layout (no ComfyUI required for Parchment preview) |

## Quick try (no ComfyUI)

1. `LoreRelay: Load Scenario Pack` → this folder
2. Game Rules → enable **World Forge**
3. Open **World** tab → switch **Parchment**
4. You should see `world_map.layout.png` with location pins (📍). Full parchment art needs step 2 below.

## Full parchment map (ComfyUI optional)

1. ComfyUI running with SDXL + SDXL Canny ControlNet
2. `textAdventure.imageGen.comfyuiUrl` / `checkpoint` configured
3. `LoreRelay: Generate World Map Image` or World tab **Map Image**
4. Output: `world_map.png` in workspace root → Parchment tab shows illustrated map + pins

See [`docs/CARTOGRAPHY_COMFYUI.md`](../../docs/CARTOGRAPHY_COMFYUI.md) and [`docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md`](../../docs/CARTOGRAPHY_WORKFLOW_CONTRACT.md).