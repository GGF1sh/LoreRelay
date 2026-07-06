# World Map / README Showcase — Independent Verification Result

Role: Independent Visual UX / Code Verifier  
AI: ChatGPT  
Model: GPT-5.5  
Reasoning: High  
Date: 2026-07-06 JST

## 1. Review identity and fixed refs

- Repository confirmed exactly: `GGF1sh/LoreRelay`.
- Current `origin/main` fetched for review: `f604e8fda7ae3bf7b7d4f50bfe2c0ee454505f8c` (`docs: move PROMPT-001D2 D2-V1 repair to reverify`).
- Reviewed branch: `ux/worldmap-showcase-visual-polish`.
- Reviewed branch tip before this verification-result-only commit: `013145c0ada63d91214dfa82340ab490d3cc70bb`.
- Implementation commit confirmed to exist and reviewed exactly: `013145c0ada63d91214dfa82340ab490d3cc70bb`.
- No rebase, merge, implementation edit, or source modification was performed during verification.

## 2. Authenticity / product truth

**Verdict: PASS**

The showcase is authentic rather than a Photoshop/mockup presentation.

- The two README World Map images are committed as `docs/assets/screenshot-world-map.png` and `docs/assets/screenshot-world-map-detail.png` and are documented as captures of the actual LoreRelay Webview shell.
- The screenshot fixture is explicitly stored under `docs/assets/worldmap-showcase-fixture/`, and is presentation-only. It is not wired into a production loader, sample scenario, canonical game state, or authority path.
- `world_map.png` is background artwork generated through the existing cartography/ComfyUI pipeline. The UI overlays are not baked into that image: pins, region labels, route SVG, fog overlays, legend, selection state, and the location detail panel are rendered by the real Webview code.
- The implementation does not add or imply runtime ComfyUI dependence for ordinary World Map behavior. ComfyUI is used only when generating the parchment background image.
- README wording explicitly distinguishes the ComfyUI-generated background from Webview-drawn overlays.

The fixture contains exactly 10 regions and 14 locations. It includes settlement/city content, ruins, one dungeon, a free-port location, mountain-region content, high-danger regions, an unexplored Cinder Wastes region, five factions with faction control, and a connected region graph used to derive trade/travel route lines.

The requested claim set is materially truthful:

- `10 regions`: confirmed.
- `14 locations`: confirmed.
- cities / ruins / dungeons / ports / mountains: confirmed by fixture region/location content and rendered map semantics.
- danger zones: confirmed by danger levels and existing danger presentation.
- unexplored territory: confirmed by fog state and the Cinder Wastes fixture region.
- faction territory: confirmed by faction-control data and existing region feedback/tint presentation.
- trade routes: confirmed by `connectedTo` graph -> route-edge derivation -> SVG Webview rendering.
- pin detail card: confirmed existing Webview behavior.
- type / danger / faction presentation: confirmed as actual pin metadata/detail behavior where the underlying location has those fields; faction is not fabricated for locations without faction ownership.
- Fog of War: confirmed as existing authority-derived fog behavior extended to route edges.

No unsupported backend behavior is claimed.

## 3. World Map data / route safety

**Verdict: PASS — SAFE**

`buildCartographyLayoutSpec()` remains the authority for graph normalization. Route construction reuses that normalized output rather than inventing a separate fixture-specific graph.

Safety properties confirmed:

- Route identity is based on stable `region.id` strings, not array position.
- `connectedTo` targets not present in the capped region set are ignored safely.
- Reverse duplicates are deduplicated using a normalized sorted ID pair.
- Each undirected edge is emitted once, preventing accidental double overdraw.
- Route endpoint coordinates are resolved by region ID from the generated layout spec.
- A defensive missing-endpoint check drops malformed route edges.
- Region iteration and `connectedTo` iteration preserve deterministic source order; duplicate suppression is deterministic for a fixed forge document.
- The richer fixture does not alter production authority, persistence, or canonical state.

One nuance: edge orientation (`fromRegionId` / `toRegionId`) follows the first encountered declaration, but rendering and fog masking are symmetric, so this is not a correctness or information-leak issue.

## 4. Fog-of-War information leak review

**Verdict: PASS — SAFE**

`maskCartographyRouteEdgesForFog()` uses the same `FogViewPayload` and `getRegionFogVisibility()` authority model as region labels and pins. It does not guess discovery state in the client.

Attack matrix:

| Case | Result | Verdict |
|---|---|---|
| A. visible -> fully hidden | route dropped | safe |
| B. fully hidden -> visible | route dropped | safe |
| C. fully hidden -> fully hidden | route dropped | safe |
| D. visible -> visible | route shown | correct |
| E. missing/empty fog record | endpoints resolve `unknown`; route dropped | conservative/safe |
| F. rumored / partial visibility | route shown only when both endpoints are at least rumored | consistent with existing semantics |

A route cannot reveal a fully hidden region merely because the opposite endpoint is visible. Direction reversal does not change the result. Both endpoint visibilities must be non-`unknown`.

The implementation is neither too permissive nor materially too aggressive. It is conservative for absent fog data and consistent with LoreRelay's existing `rumored` semantics, where rumored regions are already intentionally partially exposed.

## 5. World Map UI code quality

**Verdict: PASS**

Confirmed:

- Parchment icons map from real `locationPinCatalog.locationType` values.
- Unknown/unrecognized location types safely fall back to the generic `other` pin.
- The route SVG layer has `pointer-events: none` and sits below pins, so it does not block interaction.
- Route redraw starts with `routesEl.innerHTML = ''`; repeated updates do not accumulate route lines.
- Pin/label redraw starts with clearing the pin container.
- Fog overlays are explicitly removed before rebuild.
- Legend content is cleared and rebuilt; empty maps hide and clear it.
- No-image/no-route payloads are handled safely.
- Selected-pin class state is reconstructed from `_selectedPinId` during redraw and synchronized after world-view rendering.
- Existing one-time listener guards remain in place; the new route/legend code adds no global event listener.
- New user/world-derived strings are inserted with `textContent`, `createTextNode`, or attribute setters; the new code does not introduce an XSS path from fixture/world data.
- The only new `innerHTML` constants in the legend are fixed glyph markup, not data-derived strings.
- Route/legend layout uses percentage coordinates, flex wrapping, and `max-width: calc(100% - 12px)`; no catastrophic narrow-layout overflow was found statically.

The existing module already keeps current Webview state in module globals (`_worldViewMsg`, `_selectedPinId`, catalogs), but this change does not introduce a new authority source or weaken host authority.

## 6. README presentation quality

**Verdict: MAJOR_IMPROVEMENT**

All four localized READMEs use the same structure:

- World Map removed from the cramped third column.
- Party Director and Lorebook remain as a two-column row.
- World Map receives a dedicated heading and wide two-image overview/detail showcase.
- Both image references are valid repository-relative paths.
- Alt text accurately describes overview and selected-detail views.
- Captions distinguish generated background artwork from actual Webview overlays.
- HTML paragraph/image nesting is balanced and simple.
- Two 380px images in a centered paragraph degrade more sensibly on narrow GitHub views than the previous three-column table treatment.

No huge blank-space regression or broken table nesting was found in the changed markup.

The new section materially improves the showcase: map geography, fog, route network, overlay density, and the detail-card interaction are now legible at README scale instead of being compressed into a 230px third-column image.

## 7. Asset / ComfyUI review

**Verdict: PASS**

Confirmed present at the reviewed commit:

- `docs/assets/screenshot-world-map.png`
- `docs/assets/screenshot-world-map-detail.png`
- `docs/assets/worldmap-showcase-fixture/world_map.png`
- `docs/assets/worldmap-showcase-fixture/world_map.layout.png`
- `docs/assets/worldmap-showcase-fixture/world_forge.json`

README and DEMO references are repository-relative. No accidental local absolute path was introduced in the reviewed diff.

Generation documentation is internally consistent and truthful:

- Illustrious checkpoint used.
- Canny ControlNet used.
- `mapcraft_il_v1` LoRA was tested and rejected because the tested outputs degraded the desired campaign-atlas result.
- Final selected background used no LoRA.

The runtime continues to use existing cartography image generation architecture; this implementation did not modify the ComfyUI workflow, Python generation scripts, or cartography runner.

Binary assets are ordinary committed PNG showcase/fixture assets. Exact byte-size accounting was not available through this review environment, so no independent numeric size assertion is made; no path/reference anomaly or duplicate accidental asset set was found.

## 8. i18n review

**Verdict: PASS**

The nine previously-English Inspector Timeline/Debug keys are translated in Japanese, Simplified Chinese, and Traditional Chinese. English remains valid.

The same commit also adds the six World Map location-type legend keys to all four locales.

No unrelated locale-key deletion or structural corruption appears in the reviewed diff. The implementation record reports `node scripts/check_i18n_keys.js` with 0 missing keys across ja/en/zh-CN/zh-TW.

## 9. Strict scope

**Verdict: PASS**

The implementation commit does not change:

- PROMPT-001A/B/C
- prompt receipt / ACK
- Accepted boundary
- prompt consumption
- TurnResult processing
- State Orchestrator authority
- provider identity
- campaign identity
- backend image-generation architecture

The changed implementation scope is limited to README/demo presentation, showcase assets/fixture, locale values, cartography layout/route derivation, route fog masking, World View payload threading, Webview World Map rendering, and generated Webview bundle/style artifacts.

## 10. Test quality and execution

### Independent execution availability

This verifier session had repository read/write connector access but no checked-out repository shell/worktree suitable for running `npm ci`, TypeScript compilation, or the Node test suite. Therefore execution was not independently repeated and is not represented as such.

### Static verification

**PASS** for the reviewed route/data/fog/UI paths.

### Recorded implementation execution

The implementation result document records:

- `npm ci --include=dev`: success, 202 packages, 0 vulnerabilities.
- `npm run compile`: success.
- `npm test`: 223/223 passed, including simulation regression batch 9/9.
- `node scripts/check_i18n_keys.js`: 0 missing keys across all four locales.

No GitHub commit status/check run was attached to the reviewed commit through the available status API, so those results remain implementation-run evidence, not independent CI evidence.

### Test-quality finding

The implementation commit does not add focused regression tests specifically for the newly introduced `buildCartographyRouteEdges()` and `maskCartographyRouteEdgesForFog()` branches. The code is small and statically safe, and the full recorded suite passed, so this is **not a blocker** for this visual-polish change. It is a worthwhile follow-up hardening item, especially for the six explicit fog attack cases.

## 11. Mergeability against current main

**Verdict: PASS — CLEAN NARROW REBASE EXPECTED**

Comparison of reviewed implementation commit against current `main`:

- Merge base: `16be517466a4f0a5947a54caa5de89214f539304`.
- Current main is six commits ahead of that base.
- The World Map branch is one implementation commit ahead of that base.
- The branches are currently diverged.
- Current-main changed paths visible in the comparison are control/docs paths for PROMPT-001D2 work, including `docs/AI_REVIEW_BACKLOG.md` and `docs/ai-tasks/...`.
- No current-main overlap was found with the World Map source paths, four READMEs, locale files, Webview World Map module, or showcase assets.

A clean narrow rebase is therefore expected. The generated `webview/script.js` can generally be a conflict risk when main also contains Webview module changes, but the current-main comparison shows no overlapping World Map/Webview source path change. Review conclusions should remain valid after a no-conflict rebase that does not alter the reviewed implementation files; generated bundle regeneration should still be checked as part of the normal post-rebase compile.

No rebase was performed during review.

## 12. Blockers

None.

## 13. New findings

1. **Non-blocking test gap:** no new focused tests were added for route-edge deduplication/malformed endpoints or the route-fog attack matrix. Static behavior is safe; targeted regression coverage would improve future confidence.
2. **Evidence boundary:** the implementation's 223/223 and compile/i18n results are credible recorded execution, but were not independently rerun in this connector-only verifier environment.
3. **Existing capture caveat retained:** the landmark emoji font-fallback issue documented by the implementer is a capture-environment presentation quirk, not a product-logic defect.

## 14. Final verdict

**WORLDMAP_VERIFYING_PASS**
