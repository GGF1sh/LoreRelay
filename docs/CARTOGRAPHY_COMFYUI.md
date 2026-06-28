# Cartography ComfyUI — Option A (Parchment Map + HTML Pins)

Phase 7 Grok deliverable: generate a **parchment-style world map image** from `world_forge.json` cartography (`x`, `y`, `biome`), then overlay **player/location pins in HTML** (coordinates from `cartographyLayoutCore.ts`).

Related: [`CARTOGRAPHY_DESIGN.md`](CARTOGRAPHY_DESIGN.md) (data schema + LLM prompt)

---

## 1. Architecture (JSON → aligned map)

```
world_forge.json
    │
    ├─► cartographyLayoutCore.ts  ──► pin % positions (HTML overlay)
    │
    ├─► render_cartography_layout.py ──► layout PNG (biome blobs + roads)
    │         │
    │         └─► Canny edge (in ComfyUI workflow)
    │                   │
    │                   └─► SDXL ControlNet + parchment prompt
    │                             │
    │                             └─► world_map_*.png (background)
    │
    └─► Webview: <img> + absolutely positioned 📍 pins (future UI hook)
```

### Why layout mask + ControlNet?

Text-only img2img cannot guarantee that **sea stays west** and **mountains stay north**. Option A uses a **deterministic layout image**:

| Layout layer | Purpose |
|--------------|---------|
| Parchment tint background | Sets paper tone bias |
| Biome-colored circles at `region.x/y` | Anchors terrain zones |
| Dark lines along `connectedTo` | Roads / trade routes for Canny |

The layout is converted to **Canny edges** inside ComfyUI (`workflow_cartography_sdxl_canny.json`). ControlNet preserves macro geography while the checkpoint paints parchment illustration style.

### Coordinate mapping

- Map space: `0..1000` (see `CARTOGRAPHY_DESIGN.md`)
- Image pixels: `pixel = round(coord / 1000 * (size - 1))`
- HTML overlay: `leftPct = coord / 1000 * 100`

Locations without own `x/y` inherit their `regionId` center plus a **stable hash offset** (`buildCartographyPinPositions`) so multiple towns in one region do not stack.

---

## 2. Bundled assets

| File | Role |
|------|------|
| `src/cartographyLayoutCore.ts` | Pure layout spec, prompts, pin math |
| `scripts/render_cartography_layout.py` | Layout PNG renderer (stdlib) |
| `scripts/comfyui_generate_cartography.py` | Full ComfyUI pipeline CLI |
| `comfyui/workflow_cartography_sdxl_canny.json` | SDXL + Canny ControlNet API workflow |
| `scripts/test_cartography_layout_core.js` | Unit tests |

---

## 3. Quick run

```powershell
cd C:\AI\text-adventure-vsce

# 1) Preview layout mask only
python scripts/render_cartography_layout.py C:\AI\my-adventure\world_forge.json C:\AI\my-adventure\world_map.layout.png

# 2) Full map generation (ComfyUI must be running on :8188)
$env:TA_CHECKPOINT = "illustriousXL_v80.safetensors"   # exact name from List Image Models
$env:TA_CONTROL_NET = "diffusion_pytorch_model_sdxl_canny.safetensors"  # your SDXL Canny CN
python scripts/comfyui_generate_cartography.py C:\AI\my-adventure\world_forge.json C:\AI\my-adventure\output
```

The script prints the absolute path to `world_map_*.png` on success.

### Suggested `image_gen_config.json` snippet

```json
{
  "mode": "illustrious",
  "checkpoint": "YOUR_ILLUSTRIOUS_XL.safetensors",
  "workflowPath": "C:\\AI\\text-adventure-vsce\\comfyui\\workflow_cartography_sdxl_canny.json",
  "width": 1024,
  "height": 1024,
  "steps": 28,
  "cfg": 6.5
}
```

Environment overrides: `TA_CONTROL_NET`, `TA_CONTROL_STRENGTH` (default 0.82), `TA_MODE`.

---

## 4. Model & LoRA recommendations

### Primary checkpoint (pick one you have)

| Model | Strength | Notes |
|-------|----------|-------|
| **Illustrious XL v8.0** | ★★★★★ | Best match for LoreRelay `illustrious` preset; strong illustration line art |
| **Flux.1 Dev** | ★★★★☆ | Sharper detail; needs Flux ControlNet workflow variant (not bundled yet) |
| **SDXL 1.0 base** | ★★★☆☆ | Fallback; less “TRPG book” feel |

### ControlNet

| Asset | Use |
|-------|-----|
| **SDXL Canny** (`diffusion_pytorch_model_sdxl_canny.safetensors` or equivalent) | Bundled workflow default |
| Strength `0.75–0.88` | Lower = more painterly freedom; higher = stricter geography |

### Optional LoRAs (stack 0.4–0.7)

| LoRA style | Search keywords | Effect |
|------------|---------------|--------|
| Parchment / antique map | `parchment map`, `antique cartography`, `fantasy map` | Paper tone + ink edge |
| Ink border / compass | `compass rose`, `map border` | Decorative frame |
| Sepia / aged paper | `aged paper`, `old manuscript` | Color grading |

Avoid character/anime LoRAs — they pull toward portraits, not top-down maps.

### Prompt template (auto-built)

**Positive** (from `buildCartographyPositivePrompt` / Python CLI):

```text
ancient parchment fantasy world map of {worldName}, {theme} cartography,
top-down illustrated map on aged paper, hand-drawn coastlines, mountain chains, forests,
ornate compass rose, decorative border, ink lines, warm sepia tones,
no modern UI, featuring {biome counts…}, masterpiece, best quality…
```

**Negative:**

```text
lowres, worst quality, blurry, watermark, signature, text overlay,
modern map, GPS, satellite photo, 3d render, anime character, sci-fi HUD
```

---

## 5. HTML overlay (Option A UI hook)

When the parchment image is shown in the World tab:

```html
<div class="world-cartography-stage" style="position:relative">
  <img src="{worldMapImageUrl}" alt="World map" style="width:100%;display:block" />
  <button class="world-map-pin" style="left:{leftPct}%;top:{topPct}%"
          title="{locationName}">📍</button>
</div>
```

Pin coordinates: `buildCartographyPinPositions(forge)` from extension host → `worldView` postMessage (future PR).

Current player highlight: match `currentLocationId` and add `.is-current` class.

---

## 6. Troubleshooting

| Issue | Fix |
|-------|-----|
| ControlNet node missing | Install **ComfyUI-ControlNet** models for SDXL; set `TA_CONTROL_NET` to exact filename |
| Layout ignores coords | Ensure regions have integer `x/y` in `world_forge.json` (see Cartography generator v1.6.3+) |
| Map too literal / flat | Lower `TA_CONTROL_STRENGTH` to ~0.7; raise `TA_CFG` slightly |
| Geography drifts | Raise strength to ~0.9; verify layout PNG blobs align before generation |
| Canny too noisy | Edit workflow node `12` thresholds (`low_threshold` / `high_threshold`) |

---

## 7. Next integration steps (post-Grok)

1. Extension command `LoreRelay: Generate World Map Image` → spawn `comfyui_generate_cartography.py`
2. Save `world_map.png` + `world_map.layout.png` beside `world_forge.json`
3. `worldView.ts` post `cartographyImage` + `cartographyPins` to `85-world.js`
4. Toggle in World tab: Mermaid (live) vs Parchment (generated)