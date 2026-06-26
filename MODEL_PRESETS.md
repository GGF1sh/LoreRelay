# Recommended Model Presets (v1.0)

Copy snippets from `presets/` into your workspace `.vscode/settings.json` or `image_gen_config.json`.

## GM bridge (who runs the Game Master)

| Preset file | Best for | Notes |
|-------------|----------|-------|
| `presets/gm-grok.json` | **Grok Build** (recommended) | Full auto: dice, `game_state.json`, ComfyUI images |
| `presets/gm-ollama.json` | **Ollama** local LLM | Free offline; images manual unless you add Grok |
| `presets/gm-openrouter-quality.json` | **OpenRouter** cloud | Claude / GPT-4 class; needs API key |

See also [`GM_BRIDGE_PRESETS.md`](GM_BRIDGE_PRESETS.md) for clipboard / KoboldCPP / custom command.

### Suggested models by provider

| Provider | Model | Why |
|----------|-------|-----|
| Grok Build | (default CLI model) | Tool use for dice + files + image script |
| Ollama | `llama3.2` / `qwen2.5:7b` | Good JSON discipline for small VRAM |
| Ollama (quality) | `qwen2.5:14b` / `mistral` | Better narration, slower |
| OpenRouter | `anthropic/claude-sonnet-4` | Strong GM prose + instruction following |
| OpenRouter (budget) | `google/gemini-2.0-flash` | Fast turns, large context |

## Image generation (ComfyUI)

| Preset file | Scenario style | Workflow hint |
|-------------|----------------|---------------|
| `presets/image-illustrious.json` | Fantasy / anime (`lost-catacombs`, `neon-rain`) | `comfyui/workflow_sdxl_1024.json` |
| `presets/image-pony.json` | Anime / character-heavy | SDXL Pony checkpoint |
| `presets/image-natural.json` | Realistic (`harbor-mist`) | 768×512 or SDXL |

After copying a preset:

1. Set `checkpoint` to a name from **LoreRelay: List Image Models**.
2. Set `workflowPath` to an absolute path under `comfyui/` (see [`COMFYUI_WORKFLOWS.md`](COMFYUI_WORKFLOWS.md)).

## Sample scenarios ↔ presets

| Pack | Theme | Image mode | GM suggestion |
|------|-------|------------|---------------|
| `lost-catacombs` | fantasy dungeon | illustrious | Grok or OpenRouter |
| `neon-rain` | cyberpunk noir | illustrious | Grok or OpenRouter |
| `harbor-mist` | cozy mystery | natural | Ollama or clipboard + browser AI |

Load from `sample-scenarios/<name>/` (extension repo) or `TextAdventureGMSkill/scenarios/<name>/`.