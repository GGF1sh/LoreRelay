# Genesis Mode Assets

> Status: bundled asset catalog for future Genesis Guide UI.
> Runtime folder: `webview/assets/genesis/`.
> Current code hook: `rulesProfileCore.resolveRulesProfile().assetHint`.

Gemini generated a small visual pack for the first-session Genesis Guide. The assets have been copied into the extension under stable names so future Webview UI work can reference them without depending on Antigravity/Gemini artifact paths.

## Boundary

- These are local bundled Webview assets.
- The original `C:\Users\...\antigravity-ide\brain\...` paths are not used at runtime.
- Webview code must receive or construct `asWebviewUri` URLs from extension-owned paths; do not expose absolute local filesystem paths.
- `assetHint` is non-authoritative metadata. It must not be written into `game_rules.json`.
- Missing assets should degrade to the existing Quickstart / Start Hub UI, not block world creation.

## Genre Mapping

| Genesis genre | Guide asset | Background asset |
|---------------|-------------|------------------|
| `fantasy` | `guide_fantasy_goddess.png` | `background_fantasy.png` |
| `post_apocalypse` | `guide_post_apocalypse_mechanic.png` | `background_post_apocalypse.png` |
| `cyberpunk` | `guide_cyberpunk_ai_avatar.png` | `background_cyberpunk.png` |
| `sci_fi` | `guide_space_alien_mercenary.png` | `background_sci_fi.png` |
| `eastern` | `guide_eastern_xianxia_fairy.png` | `background_eastern.png` |
| `horror` | `guide_horror_hooded.png` | `background_horror.png` |
| `modern` | `guide_modern_occult_librarian.png` | `background_modern.png` |

## Extra Pack Assets

These are bundled for likely future Genesis genres or theme variants, but are not currently selected by `GENESIS_GENRES`:

| Candidate use | Asset |
|---------------|-------|
| Steampunk | `guide_steampunk_automaton.png` |
| Cozy fantasy / tavern start | `guide_cozy_tavern_master.png` |
| Steampunk background | `background_steampunk.png` |
| Cozy fantasy background | `background_cozy.png` |

## ComfyUI Prompt Drafts (optional regeneration / variants)

These drafts are for regenerating or adding guide/background variants with a local ComfyUI (Illustrious/Anima-style anime checkpoints work well). They are documentation only — the runtime never requires ComfyUI, and generated files must be bundled under `webview/assets/genesis/` with stable names before UI use.

Common suffixes:

- Guide portrait: `solo, upper body, looking at viewer, warm welcoming expression, detailed face, soft rim light, masterpiece, best quality` / negative: `lowres, bad hands, extra fingers, watermark, text, signature`
- Background: `no humans, scenery, wide shot, depth of field, masterpiece, best quality` (portrait negatives minus hand terms)

| Genre | Guide portrait draft | Background draft |
|-------|----------------------|------------------|
| fantasy | `1girl, gentle goddess guide, flowing robes, golden ornaments, ancient ruin hall, warm lantern light` | `ancient stone ruins, warm lantern light, ivy, painterly fantasy vista` |
| post_apocalypse | `1girl, scavenger mechanic, goggles on head, patched jacket, toolbelt, rusted workshop` | `post-apocalyptic wasteland, rusted vehicles, scavenger settlement, dramatic dusk sky` |
| cyberpunk | `1girl, holographic AI avatar, translucent glowing body, neon reflections, rainy megacity alley` | `cyberpunk neon city, rainy street, holographic ads, high contrast night` |
| sci_fi | `1girl, alien mercenary guide, exotic skin markings, utility flight suit, starport concourse` | `space frontier starport, exploration vessel, alien horizon, cinematic lighting` |
| eastern | `1girl, xianxia fairy guide, hanfu, floating ribbons, misty mountain shrine path` | `misty mountains, shrine path, ink-painting style, soft dawn light` |
| horror | `1girl, hooded mysterious guide, pale skin, candlelight, abandoned corridor, subdued palette` | `abandoned streets at night, tense shadows, distant safe room light, survival horror mood` |
| modern | `1girl, occult librarian, glasses, cardigan, hidden ritual sigils, urban library at night` | `modern city at night, quiet library window light, subtle ritual signs, investigative mood` |

Extra-pack variants: steampunk (`automaton guide, brass gears, victorian workshop` / `steampunk skyline, airships, brass and steam`), cozy (`tavern master, apron, hearth light` / `cozy tavern interior, fireplace, wooden beams`).

## G2 UI Notes

When the Genesis Guide Webview UI is implemented:

1. Use the `assetHint.guideWebviewPath` / `assetHint.backgroundWebviewPath` values as extension-relative Webview asset keys.
2. Convert them to `asWebviewUri` in the host before sending them to the Webview, or provide a host message that maps asset keys to safe Webview URIs.
3. Keep image loading optional. The deterministic rules profile must still work without these images.
4. Do not add image assets to GM prompts. They are onboarding UI decoration only.
