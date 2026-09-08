# README image provenance

The four language READMEs use the same twelve images: an opening illustration, light/dark conversations, generated map artwork and two map UI views, trade, logistics, a scene image, party, lorebook and battle. Images appear alongside the corresponding play features. Captions distinguish current UI captures, earlier feature screenshots and illustration. No generated mockup is presented as a functioning game screen.

| Asset | Source | What it demonstrates |
| --- | --- | --- |
| `hero-ui.jpg` | Existing repository illustration | A lantern-lit tavern with an AI GM. Atmosphere artwork, not an application screenshot. |
| `readme-light-v1.85.2.png` | Captured 2026-09-08, source 1.85.2 / `3da512c51fec4d433f6fb1891761161406f5c817`, real VS Code 1.136.1 Extension Development Host | Story display with the dedicated Host's Default Light Modern theme and the same saved synthetic market conversation as the dark capture. No new model request. Some dark GM cards retain weak text contrast; the screenshot is unretouched and does not establish an accessibility pass. |
| `readme-story-v1.85.2.png` | Captured 2026-09-08, source 1.85.2 / `2d7242ebbf9934f647b7fbe4f08e0a0ed31c7376`, real VS Code 1.136.1 Extension Development Host | Story display, saved narration, choices and input. The synthetic market fixture's saved Antigravity conversation was loaded into a fresh isolated workspace for presentation. This capture did not request a new model response. |
| `readme-commerce-v1.85.2.png` | Same isolated Host and date, before loading the saved conversation | Actual Action Hub opened through the Actions button. Wheat purchase estimate: price 9, credits 20 → 11, stock 48 → 47, cargo 0 → 1. These are projected values; Review/Confirm was not executed. |
| `screenshot-world-map.png` | Existing repository feature showcase, retained from before this refresh | World Map overlay on generated map artwork. Its capture date and source version were not re-established; it is not evidence of the current top-level UI layout. See [map fixture](worldmap-showcase-fixture/). |
| `worldmap-showcase-fixture/world_map.png` | Existing generated map fixture | Map artwork generated from a regional layout, shown separately from the interactive overlay. Not a screenshot or a new generation in this task. |
| `screenshot-world-map-detail.png` | Existing feature screenshot | Selected ruin with danger, region and travel/investigation entries. |
| `screenshot-logistics.png` | Existing feature screenshot | Markets, settlements and facilities linked by trade routes. A preview, not evidence of an executed world turn. |
| `screenshot-comfyui.png` | Existing feature screenshot | Generated dungeon scene displayed inside the adventure log. |
| `screenshot-party-director.png` | Existing feature screenshot | Companion speech controls and relationship choices. |
| `screenshot-lorebook.png` | Existing feature screenshot | Enabled, disabled and pinned lorebook entries. |
| `screenshot-battle-view.png` | Existing feature screenshot | Experimental combat with unit HP, gambits, movement orders and a combat log. |

The three `readme-*-v1.85.2.png` images are direct screenshots of the real Webview element via the existing local CDP/Playwright fixture tooling. Only UI navigation, the isolated Host's theme setting and scrolling were used for framing; no DOM content was replaced to fabricate controls or results. These captures use English UI text in all four READMEs, with localized alt text and captions. No personal account screens, ordinary campaigns or secrets are included. Earlier screenshots have not been re-certified against the current source; captions identify them as feature showcases.

The illustration returns to the opening, while real light/dark game screens follow the play-style introduction. Existing assets are reused without binary duplication. No new image-generation request was needed for this visual refresh.
