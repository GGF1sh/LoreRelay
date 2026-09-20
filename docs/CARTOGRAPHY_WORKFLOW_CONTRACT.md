# Cartography ComfyUI Workflow Contract

`comfyui/workflow_cartography_sdxl_canny.json` is consumed by `scripts/comfyui_generate_cartography.py` via **fixed node IDs**. Do not renumber nodes without updating the script and this contract.

## Required nodes

| Node ID | `class_type` | Role | Script override |
|:---:|:---|:---|:---|
| `3` | `KSampler` | Sample | `steps`, `cfg`, `seed` via `TA_STEPS` / `TA_CFG` |
| `4` | `CheckpointLoaderSimple` | Checkpoint | `ckpt_name` via `TA_CHECKPOINT` |
| `5` | `EmptyLatentImage` | Size | `width`, `height` via `TA_WIDTH` / `TA_HEIGHT` |
| `6` | `CLIPTextEncode` | Positive prompt | Dynamic parchment prompt text |
| `7` | `CLIPTextEncode` | Negative prompt | Dynamic negative text |
| `8` | `VAEDecode` | Decode | — |
| `9` | `SaveImage` | Output | `filename_prefix: world_map` |
| `10` | `ControlNetLoader` | Canny CN | `control_net_name` via `TA_CONTROL_NET` |
| `11` | `LoadImage` | Layout mask | Uploaded layout filename |
| `12` | `Canny` | Edge extract | Thresholds editable in workflow |
| `13` | `ControlNetApplyAdvanced` | Apply CN | `strength` via `TA_CONTROL_STRENGTH` |

## Validation

```bash
node scripts/validate_cartography_workflow.js
```

Run automatically in `npm test`.

## Editing safely

1. Open the workflow in ComfyUI, export API format JSON.
2. Preserve node IDs `3`–`13` or update `comfyui_generate_cartography.py` and this table together.
3. Run `npm test` (includes workflow contract check).

## Path safety (CLI + extension)

TypeScript (`cartographyPathCore.ts`) and Python (`cartography_path_utils.py`) share the same rules:

| Artifact | Allowed location |
|----------|------------------|
| `world_forge.json` | Anywhere under workspace root (regular file, no symlink) |
| `world_map.png` / `world_map.layout.png` | Workspace root only (no subdirectories) |
| ComfyUI output directory | Workspace root only |

CLI scripts must call `validate_output_dir()` / `validate_layout_output_path()` even when spawned from the extension.

## Related files

- Layout PNG (no ComfyUI): `scripts/render_cartography_layout.py`
- Full pipeline: `scripts/comfyui_generate_cartography.py`
- VS Code spawn: `src/cartographyRunner.ts`
- Design: `docs/CARTOGRAPHY_COMFYUI.md`