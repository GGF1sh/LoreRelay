# ComfyUI Workflows (Bundled)

LoreRelay ships API-format ComfyUI workflows for local scene image generation.

| File | Resolution | Typical use |
|------|------------|-------------|
| `comfyui/workflow_api.json` | 512×512 | SD 1.5 checkpoints, fast previews |
| `comfyui/workflow_sdxl_1024.json` | 1024×1024 | SDXL / Illustrious / Pony XL checkpoints |

## Quick setup

1. Start ComfyUI (or Stability Matrix) on `http://127.0.0.1:8188`.
2. Run **LoreRelay: List Image Models** and copy an exact checkpoint name.
3. In VS Code settings or workspace `image_gen_config.json`, set:
   - `workflowPath` — absolute path to one of the bundled JSON files above
   - `checkpoint` — name from step 2 (may include subfolder, e.g. `IL\\model.safetensors`)
   - `mode` — `illustrious` / `pony` / `natural` / `standard` (prompt presets)

Example `image_gen_config.json` (workspace root):

```json
{
  "mode": "illustrious",
  "checkpoint": "YOUR_CHECKPOINT.safetensors",
  "workflowPath": "C:\\AI\\text-adventure-vsce\\comfyui\\workflow_sdxl_1024.json",
  "steps": 28,
  "cfg": 7,
  "width": 1024,
  "height": 1024
}
```

Or via VS Code settings:

```json
{
  "textAdventure.imageGen.workflowPath": "C:\\AI\\text-adventure-vsce\\comfyui\\workflow_sdxl_1024.json",
  "textAdventure.imageGen.checkpoint": "YOUR_CHECKPOINT.safetensors"
}
```

## Environment variables (CLI / GM scripts)

`comfyui_generate.py` also accepts:

- `TA_WORKFLOW` — workflow JSON path
- `TA_CHECKPOINT`, `TA_STEPS`, `TA_CFG`, `TA_WIDTH`, `TA_HEIGHT`, `TA_MODE`

Default workflow when unset: `TextAdventureGMSkill/scripts/workflow_api.json` (same graph as `comfyui/workflow_api.json`).

## Troubleshooting

- **Checkpoint not found** — run List Image Models; names must match ComfyUI exactly.
- **Sampler / scheduler warnings** — custom workflows may omit fields; LoreRelay ignores unsupported keys safely.
- **VRAM** — use `workflow_api.json` (512) on low-VRAM GPUs; SDXL at 1024 needs more memory.