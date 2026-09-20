# Genesis Guide Assets

This folder contains bundled local art for the Genesis Guide / Rules Profile onboarding flow.

These files are runtime Webview assets. Future UI wiring should resolve them through `asWebviewUri`; do not expose local absolute paths to the Webview.

## Stable Names

| Role | Genre / Use | File |
|------|-------------|------|
| Guide | Fantasy | `guide_fantasy_goddess.png` |
| Guide | Cyberpunk / AI | `guide_cyberpunk_ai_avatar.png` |
| Guide | Eastern fantasy | `guide_eastern_xianxia_fairy.png` |
| Guide | Horror / dark | `guide_horror_hooded.png` |
| Guide | Steampunk | `guide_steampunk_automaton.png` |
| Guide | Modern occult | `guide_modern_occult_librarian.png` |
| Guide | Post-apocalypse | `guide_post_apocalypse_mechanic.png` |
| Guide | Space opera | `guide_space_alien_mercenary.png` |
| Guide | Cozy fantasy | `guide_cozy_tavern_master.png` |
| Background | Fantasy | `background_fantasy.png` |
| Background | Cyberpunk | `background_cyberpunk.png` |
| Background | Post-apocalypse | `background_post_apocalypse.png` |
| Background | Sci-fi / space opera | `background_sci_fi.png` |
| Background | Eastern fantasy | `background_eastern.png` |
| Background | Horror / dark | `background_horror.png` |
| Background | Modern occult | `background_modern.png` |
| Background | Steampunk | `background_steampunk.png` |
| Background | Cozy fantasy | `background_cozy.png` |

## Current Integration

`rulesProfileCore.resolveRulesProfile()` returns an `assetHint` for supported Genesis genres. The hint is metadata only; it does not mutate `game_rules.json` and does not write canonical state.
