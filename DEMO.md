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

| File | Use | Status |
|------|-----|--------|
| `docs/assets/hero-ui.jpg` | Main README hero | Real — ComfyUI illustration (IL `waiIllustriousSDXL_v170`), 2026-07-04 |
| `docs/assets/screenshot-status.png` | Adventure Log chat + status panel | Real — captured from the actual `webview/index.html` + `script.js` + `style.css` build (see below), 2026-07-04 |
| `docs/assets/screenshot-inspector.png` | Turn Inspector incl. Debug Trace | Real — same capture method, 2026-07-04 |
| `docs/assets/screenshot-remote-play.png` | LAN remote play panel | Real — same capture method (headless Chrome), 2026-07-06 |
| `docs/assets/screenshot-party-director.png` | Party speech control | Real — same capture method, 2026-07-06 |
| `docs/assets/screenshot-lorebook.png` | Lorebook editor | Real — same capture method, 2026-07-06 |
| `docs/assets/screenshot-comfyui.png` | ComfyUI scene generation inline in chat | Real — Webview capture; scene image generated via local ComfyUI (IL `waiIllustriousSDXL_v170`), 2026-07-06 |
| `docs/assets/screenshot-world-map.png` | World tab Parchment map overview | Real — same capture method, uses a dedicated 10-region/14-location showcase `world_forge.json` (`docs/assets/worldmap-showcase-fixture/`) rendered to a ComfyUI parchment background (Illustrious + Canny ControlNet, no LoRA — see fixture folder for generation notes), 2026-07-06 |
| `docs/assets/screenshot-world-map-detail.png` | World tab Parchment map, selected-location detail card | Real — same capture + fixture, with a high-danger ruin pin selected to show the type/danger/faction detail panel, 2026-07-06 |
| `docs/assets/screenshot-logistics.png` | Logistics graph canvas (trade network), maximized lightbox view | Real — same capture method, driven by the `scripts/create_ui_showcase_scenarios.js` / `capture_living_trade_worldview.js` `05-living-trade-world` fixture (`economyLogistics` payload), 2026-07-18 |
| `sample-scenarios/lost-catacombs/world_map.layout.png` | Real layout preview (cartography demo) | Real |

The old wireframe `.svg` placeholders for these five screenshots have been removed now that all `docs/assets/screenshot-*.png` files are real Webview captures.

### How the "Real" screenshots were captured (no VS Code needed)

The Webview is plain HTML/CSS/JS with no VS Code-only APIs beyond `acquireVsCodeApi()`
(a thin `postMessage` wrapper). To capture real, reproducible screenshots without an
Extension Development Host:

1. Copy `webview/index.html` + `webview/script.js` + `webview/style.css` (+ `webview/vendor/`)
   to a scratch folder and serve over plain HTTP.
2. In `index.html`, resolve the `{{styleUri}}` / `{{scriptUri}}` / `{{nonce}}` / `{{cspSource}}`
   template placeholders (the extension host normally substitutes these) and drop the strict
   CSP meta tag (not needed outside the real webview sandbox).
3. Stub `window.acquireVsCodeApi` to a no-op `postMessage`/`setState`/`getState`.
4. Load a locale file (e.g. `locales/ja.json`) and `postMessage({ type: 'localeBundle', ... })`,
   then `postMessage` a realistic `gameStateUpdate` / `debugCapabilities` / `debugTraceUpdate`
   payload — the same message shapes `src/gameStateSync.ts` / `src/extension.ts` send for real.
5. Capture with `chrome --headless=new --window-size=1280,900 --screenshot=out.png URL` for a
   fully deterministic shot (no manual clicking needed — drive tab switches via
   `document.querySelector('[data-target="..."]').click()` in an injected script keyed off a
   `?demo=` query param).

This reuses the exact production bundle, so screenshots stay authentic and cheap to refresh —
no throwaway mockups needed. All five previously-placeholder screenshots (Remote Play, Party
Director, Lorebook, ComfyUI, World Map) now use this method:

- **Remote Play**: call `updateRemotePlayButton({ running: true, urls: [...], spectatorUrls: [...], clients: [...] })` directly instead of a real `remotePlayStatus` postMessage (no LAN server needed for a screenshot).
- **Party Director**: post `characterList` (for display names) then `partyDirector` with a `members` map.
- **Lorebook**: post `lorebookList` with a few `entries` (mix of enabled/disabled/pinned to show the visual states).
- **World Map**: switch to Parchment mode and post a `worldView` message with `cartographyImage`, `cartographyPins`, `cartographyRegionLabels`, `cartographyRouteEdges`, and `locationPinCatalog` built from a `world_forge.json` (see `docs/assets/worldmap-showcase-fixture/` for the 10-region/14-location showcase world and its generated `world_map.png`). A minimal per-region `fog`/`regionMapFeedback` demonstrates the fog-of-war and faction-tint overlays; selecting a pin (`selectWorldLocationPin(id)`) shows the type/danger/faction detail card for the second screenshot.
- **ComfyUI**: push two `messageHistory` entries via `renderMessage()`, the second one carrying an `image` field pointing at a real ComfyUI-generated scene (see below).

If a screenshot needs a *new* generated image (not just UI with fixture data), generate it directly
against a running ComfyUI instance with the bundled `comfyui/workflow_sdxl_1024.json` template
(set `ckpt_name` to a checkpoint from `LoreRelay: List Image Models`, POST to `/prompt`, poll
`/history/{prompt_id}`, fetch via `/view?filename=...`) — this is exactly what the current
`screenshot-comfyui.png` scene image is.

One gotcha: capturing with `--disable-gpu` in headless Chrome can silently break
`backdrop-filter`/alpha-blended overlays (e.g. a modal's dimmed backdrop renders fully
transparent even though DOM/computed-style inspection looks correct) — omit that flag if a
screenshot involves a translucent backdrop.

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