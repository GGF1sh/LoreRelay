# Text Adventure GM Skill for Antigravity

This is a generic Game Master (GM) Custom Skill for the Antigravity (Gemini / Claude) AI Assistant.
It allows the AI to act as a Game Master for a text adventure game in any setting you choose (Fantasy, Sci-Fi, Cyberpunk, etc.), while automatically generating scene images using your local ComfyUI instance.

## Features
- **Generic Roleplay Engine**: Just tell the AI what kind of world you want to play in, and it will adapt.
- **Strict Formatting**: The AI outputs the story in a clean `[Narrative]`, `[Status]`, and `[Options]` format.
- **ComfyUI Integration**: The AI automatically calls a local Python script to generate a scene image based on the narrative and displays it in the chat.
- **Adaptive BGM**: Drop in your own music and the GM switches tracks to match the scene (battle, town, sad, …) via a simple `bgm.json` manifest.
- **Sound Effects**: 8 license-free SFX bundled (dice, hit, coin, level-up, …); the GM fires them via the `sfx` field. Swap in your own CC0 sounds anytime.

## Prerequisites
- A local installation of [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (or via StabilityMatrix).
- Python 3 installed on your system.

## Generation Modes
Depending on the ComfyUI checkpoint you use, you may need specific quality tags (like `score_9` or `masterpiece`). The script supports different prompt generation modes:
- **`pony`**: Automatically prepends `score_9` tags and sets appropriate negatives. (Use with Pony Diffusion V6 XL and derivatives).
- **`illustrious`**: Appends `masterpiece, absurdres` etc., and uses strong negative tags. (Use with Illustrious XL and derivatives. This is the default mode).
- **`natural`**: Uses minimal tags to allow the model to interpret your natural language prompt.
- **`standard`**: Adds basic `masterpiece` quality tags.

When you start a game, tell the GM which mode you want to use.

## Installation

1. Clone or download this repository.
2. Move the `TextAdventureGMSkill` folder into your Antigravity skills directory:
   - Global: `~/.gemini/config/skills/`
   - Workspace: `<your-workspace>/.agents/skills/`
3. Configure your ComfyUI Workflow:
   - Open `scripts/workflow_api.json`.
   - Change the `"ckpt_name"` to a model that actually exists in your ComfyUI environment (e.g., `v1-5-pruned-emaonly.safetensors` or an SDXL model).
   - If using SDXL, change the `"width"` and `"height"` in the `EmptyLatentImage` node to `1024`.

## Image Backend Configuration (ComfyUI / Stability Matrix / models)

You no longer have to edit `workflow_api.json` to switch servers or models — the
generation script reads the following **environment variables** (overriding the
workflow defaults). The VSCode extension sets these automatically from its
`textAdventure.imageGen.*` settings; when running the script directly you can set
them yourself.

| Variable | Meaning | Example |
|----------|---------|---------|
| `COMFYUI_URL` | Server URL. Works for both standalone ComfyUI and the ComfyUI bundled in **Stability Matrix** (just point at its port). | `http://127.0.0.1:8188` |
| `TA_CHECKPOINT` | Checkpoint `.safetensors` name (overrides the workflow). May include a subfolder prefix exactly as `--list-models` shows it. | `IL\prefectIllustriousXL_v8.safetensors` |
| `TA_WORKFLOW` | Path to a custom ComfyUI API-format workflow JSON. | `D:\my\workflow.json` |
| `TA_STEPS` / `TA_CFG` | Sampling steps / CFG scale. | `28` / `5.5` |
| `TA_WIDTH` / `TA_HEIGHT` | Output resolution (use 1024 for SDXL). | `1024` / `1024` |

> **Where are my models?** Checkpoints live in your ComfyUI install under
> `models/checkpoints/` (Stability Matrix: `Data/Models/StableDiffusion/`).
> `TA_CHECKPOINT` takes the name **relative to that folder** — if your model sits in
> a subfolder (e.g. `IL/`), include it: `IL\prefectIllustriousXL_v8.safetensors`.
> Run `--list-models` to see the exact names.

### List available models

To see exactly which checkpoint names your server accepts:

```bash
python scripts/comfyui_generate.py --list-models
```

(or in VSCode: run the command **"Text Adventure: List Image Models"**). This queries
the running ComfyUI server and prints every checkpoint filename you can pass to
`TA_CHECKPOINT`.

## Background Music (BGM)

The VSCode UI can play **your own** background music and let the GM switch tracks
to match the scene (battle, town, sad moment, …). You provide the audio files and
a manifest; the GM picks what plays.

### Setup

1. Copy `bgm.sample.json` to your game workspace root and rename it `bgm.json`.
2. Put your audio files (`.mp3` / `.ogg` / `.wav` / `.m4a`) in the workspace root or
   a `bgm/` subfolder next to `bgm.json`.
3. Edit each track's `file` to match your filenames. Adjust `mood` / `description`.

```json
{
  "defaultVolume": 50,
  "tracks": [
    { "id": "battle", "file": "battle.mp3", "mood": "combat,fight",
      "description": "Fast, intense battle theme", "loop": true, "volume": 1.0 }
  ]
}
```

### How the GM chooses a track

Each turn the GM writes one of these into `game_state.json`:

- `"bgm": "battle"` — play a specific track id (deterministic), **or**
- `"mood": "combat"` — auto-select the track whose `mood` list contains that word.

You can also let the AI judge purely from vibes: it reads each track's
`description` and picks the best fit. Either way, the player can always override
with the play / volume / mute controls and the track buttons in the UI.

> **Note:** Audio autoplay is blocked until you interact with the panel once
> (click a track button or the ▶ button). After that, the GM's track changes
> crossfade automatically.

## Sound Effects (SE)

One-shot sound effects (dice, hit, coin, level-up, …) play **on top of** the BGM
when the GM triggers them.

- **Works out of the box.** 8 license-free SFX are bundled in `sfx/`, generated by
  `scripts/generate_sfx.py` (pure synthesis — no third-party license at all).
  `sfx.json` is also bundled, so SE works without any setup.
- **The GM triggers them** by writing `"sfx": "hit"` (or `"sfx": ["hit","coin"]`)
  into `game_state.json`. Available ids: `click`, `dice`, `success`, `fail`,
  `coin`, `hit`, `levelup`, `magic`.
- **Upgrade the sounds** by dropping higher-quality CC0 files (e.g. from
  [kenney.nl](https://kenney.nl/assets?q=audio) — all CC0) into `sfx/` with the
  same filename, or add your own entries to `sfx.json`.
- **Regenerate** the bundled set anytime: `python scripts/generate_sfx.py`.

The player can adjust SE volume / mute independently of the BGM in the UI panel.

## How to Play

1. Start ComfyUI (or Stability Matrix) locally. By default it should listen on
   `http://127.0.0.1:8188`; set `COMFYUI_URL` if you use a different port.
2. Open Antigravity (your AI assistant).
3. Type: `/adventure` or "Start a text adventure game".
4. The AI will ask you for your desired setting, character details, tone, image
   mode, and **image generation timing** (every turn / on scene change / manual).
5. Answer the prompts, and the game will begin! The AI will generate and embed
   images into the chat according to your chosen timing.

## Output
Generated images are saved by default to the `output/` folder inside this skill
directory. Writes to system directories (e.g. `C:\Windows`, `/etc`) are blocked
for safety.
