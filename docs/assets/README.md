# README image provenance

The four language READMEs use the same three assets. Captions distinguish current UI captures from the earlier map showcase. No generated mockup is presented as a functioning game screen.

| Asset | Source | What it demonstrates |
| --- | --- | --- |
| `readme-story-v1.85.2.png` | Captured 2026-09-08, source 1.85.2 / `2d7242ebbf9934f647b7fbe4f08e0a0ed31c7376`, real VS Code 1.136.1 Extension Development Host | Story display, saved narration, choices and input. The synthetic market fixture's saved Antigravity conversation was loaded into a fresh isolated workspace for presentation. This capture did not request a new model response. |
| `readme-commerce-v1.85.2.png` | Same isolated Host and date, before loading the saved conversation | Actual Action Hub opened through the Actions button. Wheat purchase estimate: price 9, credits 20 → 11, stock 48 → 47, cargo 0 → 1. These are projected values; Review/Confirm was not executed. |
| `screenshot-world-map.png` | Existing repository feature showcase, retained from before this refresh | World Map overlay on generated map artwork. Its capture date and source version were not re-established; it is not evidence of the current top-level UI layout. See [map fixture](worldmap-showcase-fixture/). |

The two new images are direct screenshots of the real Webview element via the existing local CDP/Playwright fixture tooling. Only UI navigation and scrolling were used for framing; no DOM content was replaced to fabricate controls or results. The capture uses English UI text in all four READMEs, with localized alt text and captions. No personal account screens, ordinary campaigns or secrets are included.

Existing assets, including `hero-ui.jpg`, remain in the repository for other documentation. The README now leads with the actual game UI rather than an illustrative hero image. No new image-generation request was needed for this refresh.
