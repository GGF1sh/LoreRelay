# LoreRelay Logistics Graph Canvas Architecture

Task: `LOGISTICS-GRAPH-CANVAS-ARCHITECTURE-001`
Status: design only
Implementation status: not started
Source HEAD: `e103a9a29bf43e82d0bed1cfab117171b257a610` (`task/WORLD-SIM-UX-POLISH-001-CORRECTIONS`, v1.84.6)
Supersedes nothing. Extends `docs/ECONOMY_LOGISTICS_ARCHITECTURE.md` §10 (UI visualization contract).

---

## 0. Decision summary

```text
RECOMMENDED_ARCHITECTURE
  Existing SVG + a single transformed viewport group.
  No new runtime dependency.
  Deterministic region-clustered hybrid layout, computed once per dataset.
  Manual node positions persisted in localStorage, never in world files.
  One shared route-geometry contract with node ports, lanes, and bounded
  obstacle detours.
  Hue = status. Width = throughput. Opacity = relevance. Accent halo =
  commodity family. Six families with an explicit `unclassified` fallback.
```

### SLICE 4: factual visual encoding

`85b3-logistics-visual-encoding.js` is a pure module that receives the
already-rendered factual route/node set and returns visual tokens only. It does
not receive or alter coordinates, ports, lanes, `pathD`, camera state, or
persisted layout data.

- Route hue is a theme token for factual status. Open is solid; rumored is a
  medium dash; impaired/strained/raided is an irregular dash; blocked is a
  strong interrupted dash; and conflicted geometry has a diagnostic pattern.
  An unknown status falls back to a neutral dotted pattern.
- Width is `2 + 5 * sqrt(min(volume, q75) / q75)` px, clamped to 2--7 px;
  invalid, missing, and negative volume use 2 px. `q75` is taken only from the
  current rendered factual route set, so one extreme cannot flatten ordinary
  routes.
- Relevance is one pure group-opacity result: primary objects are 1, factual
  same-family objects are 0.55, and unrelated objects are 0.18. A selected
  route, its endpoints, the selected node, and the current location are always
  primary. Filtering never removes a route or node.
- Commodity filtering adds one strong focus-token halo to the exact commodity
  and a weaker focus-token halo to the same factual family, while retaining the
  status-coloured main stroke and status dash. No family colour is painted in
  the all-commodities overview. Family tokens come only from factual `family`,
  `familyKey`, or `category` metadata; absent metadata uses the generic exact-
  commodity treatment and reports `familyMetadataAvailable: false`.

The compact localized legend explains hue, width, opacity, arrow direction,
dash, and the filter-only commodity accent. The visual encoding test verifies
these channels and byte-stable geometry inputs; the Webview interaction test
verifies DOM attributes, raised selected-route layering, continuous hit paths,
and factual click/keyboard selection.

The current graph fails not because SVG is the wrong renderer, but because it has **no camera**
and **no spatial model**. It compensates by shrinking everything into one box. Adding a camera
removes the reason the compression exists. Replacing the renderer would additionally destroy the
existing headless test harness (§9.4) for no layout benefit.

---

## 1. Current implementation: what exists and where it breaks

### 1.1 Inspected surface

| File | Lines | Role |
| --- | --- | --- |
| [`webview/modules/85b-economy-logistics.js`](webview/modules/85b-economy-logistics.js) | 877 | All rendering, layout, selection, filter, animation |
| [`webview/styles/85b-economy-logistics.css`](webview/styles/85b-economy-logistics.css) | 504 | Node/route/legend styling |
| [`src/economyLogisticsViewCore.ts`](src/economyLogisticsViewCore.ts) | 414 | Sanitized read-only view model (pure core) |
| [`src/economyLogisticsPreviewCore.ts`](src/economyLogisticsPreviewCore.ts) | 152 | Cold-start derived preview |
| [`src/worldView.ts`](src/worldView.ts) | 948 | Host payload assembly (`economyLogistics` at :825, :896) |
| [`scripts/build-webview.js`](scripts/build-webview.js) | — | Concatenates `webview/modules/*.js` → `webview/script.js` |

Existing guard: [`scripts/test_webview_payload_whitelist.js:252`](scripts/test_webview_payload_whitelist.js:252) already fails the
build if logistics view state leaks into `WorldState` or `CommerceForge`. Every persistence decision
in §10 is constrained by that test, and deliberately stays compatible with it.

### 1.2 Root cause of the reported symptoms

**Fit-everything-into-one-viewport is literally implemented in CSS.**

[`85b-economy-logistics.css:175`](webview/styles/85b-economy-logistics.css:175)

```css
.logistics-network {
  width: 100%;
  min-width: 620px;
  max-height: 520px;   /* ← the whole problem */
  min-height: 260px;
}
```

The SVG carries `viewBox="0 0 W H"` with the default `preserveAspectRatio="xMidYMid meet"`, and
[`buildLogisticsLayout()`](webview/modules/85b-economy-logistics.js:218) grows `H` linearly with the
tallest column:

```js
const height = Math.max(280, ...columns.map((column) => 72 + column.length * 92));
```

So a 15-node column produces `viewBox` height ≈ 1452 against a 520 px box → uniform downscale of
≈ 0.36. A 60 px node renders at ≈ 21 px tall. **This is the "vertically compressed nodes"
complaint**, and it gets monotonically worse with every added location. Aspect ratio is actually
preserved; the perceived vertical squeeze is the combination of uniform shrink with a fixed 620 px
minimum width, which letterboxes horizontally while the content keeps growing downward.

### 1.3 Enumerated limitations

| # | Limitation | Evidence |
| --- | --- | --- |
| L1 | No camera. Only `overflow:auto` scroll plus a modal "view large" lightbox. | [`:625`](webview/modules/85b-economy-logistics.js:625), [`:841`](webview/modules/85b-economy-logistics.js:841) |
| L2 | Layout is three fixed columns keyed on node *kind*, not on geography or connectivity: `region`=0, `settlement\|facility`=1, `market\|store`=2. | [`logisticsNodeRank()`](webview/modules/85b-economy-logistics.js:151), [`buildLogisticsLayout()`](webview/modules/85b-economy-logistics.js:218) |
| L3 | `node.regionId` exists in the view model but the renderer never reads it. Regions are a *column*, not a container. | [`economyLogisticsViewCore.ts:51`](src/economyLogisticsViewCore.ts:51) |
| L4 | Edges start/end at a **fixed horizontal ±78 offset from node centre**, always at centre-y — not at the node boundary. | [`logisticsRouteGeometry()`](webview/modules/85b-economy-logistics.js:361) |
| L5 | Same-column routes degenerate: `from.x === to.x` ⇒ `direction = 1` ⇒ `start.x = x+78`, `end.x = x−78`. The edge runs **backwards through its own source node**. | same |
| L6 | Routes are appended to the SVG **before** nodes, so node shapes paint over them. | [`:666-670`](webview/modules/85b-economy-logistics.js:666) |
| L7 | No obstacle awareness. A rank-0 → rank-2 route crosses the entire rank-1 column. | — |
| L8 | Curve offset is `bend = round((hash(routeId) − 0.5) × 44)` — deterministic but arbitrary. Not lane-assigned. Parallel routes can land on near-identical bends; a reverse route hashes independently and may coincide with its forward twin. | [`:365`](webview/modules/85b-economy-logistics.js:365) |
| L9 | Label anti-collision is a greedy 7-step slide (`±42/±28` box) tested only against other route labels — never against nodes or crossings. | [`:431-443`](webview/modules/85b-economy-logistics.js:431) |
| L10 | **Opacity carries two meanings**: utilisation (`0.55 + util*0.4`) *and* de-emphasis (`is-unrelated`). | [`:419`](webview/modules/85b-economy-logistics.js:419) |
| L11 | The commodity filter *removes* unrelated routes, then `occupiedRanks` recomputes column x-positions — so **nodes jump** when the filter changes. | [`visibleLogisticsData()`](webview/modules/85b-economy-logistics.js:335), [`:227`](webview/modules/85b-economy-logistics.js:227) |
| L12 | Every node and route is an individual tab stop. At 60 nodes the panel is a keyboard trap. | [`bindLogisticsActivation()`](webview/modules/85b-economy-logistics.js:251) |
| L13 | Contract gap: `logisticsNodeRole()` maps `vehicle\|caravan\|envoy\|mobile_base\|city\|town\|village`, but `VALID_NODE_KINDS` in the core only admits `region\|settlement\|facility\|market\|store`. Those visual treatments are unreachable dead code today. | [`:165`](webview/modules/85b-economy-logistics.js:165) vs [`economyLogisticsViewCore.ts:125`](src/economyLogisticsViewCore.ts:125) |
| L14 | Contract gap: `logisticsNodeScale()` reads `node.scale`, which `EconomyLogisticsNodeView` never emits. The explicit-tier branch is dead; only degree is used. | [`:177`](webview/modules/85b-economy-logistics.js:177) |
| L15 | Any state change calls `renderEconomyLogisticsPanel()`, which does `panel.replaceChildren()` — a full DOM rebuild. A camera on top of this would rebuild the graph on every wheel tick. | [`:733`](webview/modules/85b-economy-logistics.js:733) |

L13 and L14 matter for this design: the task asks for vehicle/caravan/envoy/Mobile-Base node
treatments and minor/standard/major tiers. **Those are visual contracts that the core does not yet
feed.** This document specifies the visuals and names the core change required to reach them
(§5.5). It does not assume the data already exists.

### 1.4 What is already correct and must be preserved

- Commodity has **no hue** today. Status drives colour. Do not regress this into per-commodity colours.
- Colour is already paired with a glyph (`◆ × ! ?`) and dash patterns.
- `prefers-reduced-motion` is honoured, with a persisted user override.
- Animation is declarative SMIL driven by `<mpath href="#pathId">` — one geometry, shared by stroke and particles. **This is the seed of the shared geometry contract in §6.**
- All numbers are sanitized and clamped in the pure core; the webview never invents values.
- `logisticsTruncateLabel()` measures CJK width units, not characters.

---

## 2. Camera and viewport

### 2.1 Model

One transform, applied to one group. The SVG root stops carrying a data-dependent `viewBox`.

```text
<svg class="logistics-network" viewBox="0 0 Wpx Hpx">   ← viewport size, not content size
  <defs/>
  <g class="logistics-camera" transform="translate(tx,ty) scale(k)">
    <g class="layer-regions"/>
    <g class="layer-edges"/>
    <g class="layer-edges-raised"/>
    <g class="layer-nodes"/>
    <g class="layer-labels"/>
  </g>
</svg>
<div class="logistics-minimap"/>       ← untransformed HTML overlay
<div class="logistics-camera-toolbar"/>
```

`world → screen: s = k·w + t`   `screen → world: w = (s − t)/k`

### 2.2 Constants

```js
const LOGISTICS_ZOOM_MIN  = 0.25;   // matches SETTLEMENT_ZOOM_MIN precedent
const LOGISTICS_ZOOM_MAX  = 3.0;    // matches SETTLEMENT_ZOOM_MAX precedent
const LOGISTICS_ZOOM_STEP = 1.15;   // multiplicative, per button/key press
const LOGISTICS_WHEEL_K   = 0.0015; // k' = k · exp(−deltaY · K)
const LOGISTICS_FIT_PAD   = 32;     // px, screen space
const LOGISTICS_FIT_SLACK = 0.92;   // leave 8% margin after a fit
const LOGISTICS_PAN_STEP  = 48;     // px per arrow key (Shift ×4)
```

Range rationale: 0.25 shows a ~40-node world in a 900 px panel; 3.0 makes an 11 px label readable
at 33 px for low-vision users without a separate magnifier. Reusing the settlement view's numbers
([`86b-settlement-isometric.js:49`](webview/modules/86b-settlement-isometric.js:49)) keeps muscle
memory consistent across LoreRelay's two spatial panels.

### 2.3 Pointer-centred wheel zoom

The invariant: **the world point under the cursor does not move.**

```js
function zoomAt(camera, screenPoint, nextK) {
  const k = clamp(nextK, LOGISTICS_ZOOM_MIN, LOGISTICS_ZOOM_MAX);
  if (k === camera.k) { return camera; }
  return {
    k,
    tx: screenPoint.x - (screenPoint.x - camera.tx) * (k / camera.k),
    ty: screenPoint.y - (screenPoint.y - camera.ty) * (k / camera.k),
  };
}
```

- `wheel` handler must call `preventDefault()`; otherwise the surrounding status column scrolls.
- `ctrlKey`/`metaKey` + wheel arrives from trackpad pinch in Chromium — same code path, no branch.
- `deltaMode === 1` (line) must be normalised (`deltaY × 16`) before use.
- Clamping at the limits must **not** move `tx/ty` (early return above), or the graph creeps
  sideways when the user keeps scrolling at max zoom.

### 2.4 Pan

| Input | Action |
| --- | --- |
| Drag on background (`pointerdown` where `event.target` is the SVG root or `.layer-regions` fill) | Pan. `setPointerCapture`. |
| Middle-button drag anywhere | Pan (works over dense node areas). |
| Drag on a node | Move the node (§4.5) — not the camera. |
| Space + drag | Pan, even over a node (escape hatch for dense clusters). |
| Arrow keys | Pan by `LOGISTICS_PAN_STEP`, ×4 with Shift. |

Drag threshold: 4 px before a pan/move begins, so a click that jitters still selects. The existing
`_settlementDidDrag` flag ([`86b-settlement-isometric.js:11`](webview/modules/86b-settlement-isometric.js:11))
is the precedent — reuse the pattern, not the variable.

No inertia, no easing when `prefers-reduced-motion: reduce`. With motion allowed, camera commands
(fit/centre) ease over 180 ms; wheel/drag are always 1:1 with the input, never eased.

### 2.5 Commands

| Command | Key | Behaviour | Destructive |
| --- | --- | --- | --- |
| Zoom in / out | `+` / `-` | `k × 1.15^±1` about the **viewport centre** (not the pointer — the pointer may be outside). | no |
| Fit all | `0` | bbox of all *visible* nodes + regions. `k = clamp(min(vw/bw, vh/bh) × 0.92, MIN, MAX)`, centred. | no |
| Fit selection | `F` | bbox of the selection **plus its direct neighbours and connecting routes**. A single node alone would fit to `MAX` and lose all context. | no |
| Centre selected | `C` | keep `k`, translate so the selection's centre is the viewport centre. | no |
| Reset camera | `Shift+0` | = fit all, and clears the stored camera entry. | no |
| Reset layout | toolbar only | discards manual positions, recomputes automatic layout, then fits all. **Confirm dialog.** | **yes** |
| Reset filters | toolbar only | filters → defaults. Never touches positions or camera (§8.4). | no |

Keys are only live while focus is inside the graph region (`.logistics-network-viewport`), so they
never steal `0`/`F`/`C` from the chat composer.

### 2.6 No automatic refit

**Rule: a data push never moves the camera.**

Refit happens in exactly four cases:

1. First open for a `scopeKey` with no stored camera.
2. An explicit user command from §2.5.
3. The stored camera fails validation (§10.4).
4. The content bbox and the viewport rect **do not intersect at all** *and* the user has not moved
   the camera during this session. This covers "the world was replaced under you and you are now
   staring at empty space". If the user *has* panned this session, do not teleport them — instead
   show a non-modal `⤢ Fit all` nudge chip in the toolbar corner.

Case 4 is the only automatic move, it is a strict "content is 100% off-screen" test (not a
heuristic), and it is suppressed by any user camera input.

### 2.7 Minimap

- Fixed 168 × 112 px, bottom-right, inside `.logistics-network-viewport` (already `position:relative`,
  [`:139`](webview/styles/85b-economy-logistics.css:139)).
- Content: region rectangles (fill only), one 2 px dot per node, **no edges** — edges at minimap
  scale are noise. Shortage nodes get a 3 px dot. Selection gets the focus colour.
- The viewport rectangle is a stroked rect updated on camera change.
- Click = centre there. Drag the rect = pan. Drag outside = centre-and-drag.
- Redraw policy: the minimap **contents** redraw only on layout/filter change. Camera changes touch
  only the viewport rect's `x/y/width/height`. This is the difference between a 60 fps minimap and a
  slideshow.
- Hidden below 420 px panel width (`LOGISTICS_COMPACT_WIDTH_PX`, already defined at
  [`:7`](webview/modules/85b-economy-logistics.js:7)) and hideable via the toolbar.

### 2.8 Semantic zoom

Three levels, resolved from `k` with hysteresis so a stationary pointer at a boundary cannot flicker.

```text
far     k < 0.55   region containers + region labels, aggregate/major nodes only,
                   major routes (throughput tier ≥ 3) and region-to-region bundles.
                   No node names on minor nodes. No route labels. No badges.

medium  0.55 ≤ k < 1.15
                   all nodes at their tier size, all node names, all routes,
                   arrowheads, width tier, status dash/hue, exception glyphs.
                   No metric text. No commodity chips. No ports.

near    k ≥ 1.15   + commodity chips, "flow / capacity" metric text,
                   risk + status detail, port markers, region member counts.
```

```js
const LOGISTICS_ZOOM_BANDS = [
  { level: 'far',    enter: 0.55, exit: 0.50 },   // ascending / descending thresholds
  { level: 'medium', enter: 1.15, exit: 1.10 },
];
```

Implementation: the level is a single class on the SVG root (`is-zoom-far|medium|near`). **All
label/chip visibility is CSS**, not DOM churn:

```css
.logistics-network.is-zoom-far  .logistics-route-label { display: none; }
.logistics-network.is-zoom-far  .logistics-node-minor  { display: none; }
.logistics-network:not(.is-zoom-near) .logistics-commodity-chip { display: none; }
```

Elements hidden by semantic zoom stay in the DOM. That keeps their `aria-label`/`<title>` reachable
for screen readers even when they are visually suppressed, and keeps zooming free of layout work.

### 2.9 Camera performance contract

A camera change writes **exactly two things** and rebuilds nothing:

```js
cameraGroup.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
svgRoot.style.setProperty('--logistics-camera-k', String(k));
```

Everything that must stay constant in *screen* space reads that variable:

```css
.logistics-route-label { font-size: calc(11px / var(--logistics-camera-k, 1)); }
.logistics-node-label  { font-size: calc(12px / var(--logistics-camera-k, 1)); }
.logistics-route-hit   { vector-effect: non-scaling-stroke; stroke-width: 12; }
```

`vector-effect: non-scaling-stroke` gives the invisible hit path a constant 12 px screen target at
every zoom, with no JS. Route *visible* stroke width intentionally scales with the camera — thin at
far zoom is correct.

`renderEconomyLogisticsPanel()` must be split so that the camera path never enters it (fixes L15):

```text
renderEconomyLogisticsPanel()   → full rebuild. Data / filter / selection changes only.
applyLogisticsCamera(camera)    → transform + CSS var + zoom band class + minimap rect.
```

---

## 3. Layout model

### 3.1 Comparison

| | Fixed hierarchical (today) | Force-directed | **Region-clustered hybrid** |
| --- | --- | --- | --- |
| Same data → same layout | ✅ | ⚠️ only with a fixed seed *and* fixed iteration count | ✅ |
| Stable after data change | ❌ columns re-flow (L11) | ❌ everything moves | ✅ unaffected regions never move |
| Reflects geography | ❌ ignores `regionId` (L3) | ❌ emergent, not authored | ✅ regions are the primary structure |
| Reflects connectivity | ❌ | ✅ | ✅ within a region (barycentre) and between (weighted packing) |
| Crossing count | ❌ worst case — all traffic funnels through 3 bands | ✅ good | ✅ good locally; inter-region crossings bounded by bundling |
| Predictable / user mental model | ✅ trivially | ❌ "why did it move?" | ✅ |
| Cost | O(n) | O(n²) per tick × ~300 ticks | O(n + e) + fixed 4 sweeps |
| Motion after settle | none | perpetual jitter unless frozen | none |
| New dependency | no | d3-force or hand-rolled | no |

### 3.2 Choice: region-clustered hybrid

**Rejected — fixed hierarchical.** It is the current design, and its failure is structural, not a
tuning problem. Ranking by `kind` throws away `regionId`, the one authored spatial fact the payload
already carries (L3). Every route between two regions must cross the same three vertical bands, so
crossings grow as O(n²) in the worst case and no amount of curve tuning fixes it. It also makes the
layout depend on *which kinds are currently visible*, which is why nodes jump when the filter
changes (L11).

**Rejected — force-directed.** It directly contradicts the brief ("do not copy Obsidian's constantly
moving force simulation… stable and predictable"). Even frozen after N iterations, it fails the
harder requirement: **adding one node re-solves the whole system**, so every other node drifts.
Users who dragged a node somewhere meaningful lose that meaning on the next world tick. It is also
the only option that would need a dependency or ~200 lines of physics we would then own forever.

**Chosen — region-clustered hybrid.** It matches the data we actually have (`regionId` is authored;
routes are authored), gives a readable local hierarchy *inside* each region where flow direction is
the story, and spatial separation *between* regions where geography is the story. Critically it is
**locally stable**: a new facility in region A cannot move region B, because region placement depends
only on the region-level aggregate graph, not on member coordinates.

### 3.3 Algorithm

Pure function, no RNG, no `Date`, no DOM:

```js
computeLogisticsLayout(nodes, routes, options) → {
  nodes:   Map<nodeId, {x, y, w, h, tier}>,
  regions: Map<regionId, {x, y, w, h, label, memberIds, collapsed}>,
  bounds:  {minX, minY, maxX, maxY},
  algo:    'region-hybrid-1',
}
```

**Step 1 — Partition.** Group by `node.regionId`. Nodes without one go to a synthetic
`__unassigned` region, which renders without a container chrome (§4.1). `kind === 'region'` nodes
are *not* members; they become the region container's identity if their id matches a `regionId`,
otherwise they stay ordinary nodes in `__unassigned`.

**Step 2 — Intra-region ranking.** Build the subgraph of routes with both endpoints in the region.
Break cycles deterministically: sort edges by `(fromId, toId, routeId)` and drop any edge that
closes a cycle in that order. Longest-path layering on the resulting DAG assigns rank. Isolated
nodes get rank 0. This produces the *flow* reading — sources left, markets right — but scoped to a
region instead of imposed globally.

**Step 3 — Intra-region ordering.** Within each rank, order by the barycentre of already-placed
neighbours, **exactly 4 sweeps** (down, up, down, up), ties broken by `nodeId` ascending. Fixed
iteration count is what makes this deterministic and terminating; there is no convergence test and
no early exit.

**Step 4 — Intra-region coordinates.**

```text
x = rankIndex × RANK_GAP_X                       (RANK_GAP_X = 260)
y = cumulative stack of (tierHeight + NODE_GAP_Y) (NODE_GAP_Y = 36), rank centred
```

**Step 5 — Region placement.** Region ordering is **topology-only**. Count inter-region routes
(route endpoints in different populated regions) per region; order by
`(−interRegionRouteCount, −memberCount, regionId)`. **Ordinary simulation metrics never affect layout
coordinates** — do not weight by `route.volume`, `capacity`, utilisation, or any other live flow
metric. Place row-major into a grid whose column count is `ceil(sqrt(regionCount))`, packing each
region box at its natural size with `REGION_GAP = 120` between boxes and `REGION_PADDING = 28`
inside. Well-connected regions land adjacent via topology, without any iterative solver and without
flow-weighted reordering.

**Step 6 — Merge manual positions.** For every node with a stored manual position (§10.2), place it
exactly at the stored coordinates (region-local or absolute world) and add it to the **fixed
obstacle** set. Manual coordinates are never mutated by automatic collision resolution. Automatic
nodes resolve around manuals **within the same region only** (+y in `NODE_GAP_Y` steps, then a
bounded overflow lane). If two manuals overlap, keep both exact stored coordinates and record
`unresolvedOverlapIds`. If automatic overflow attempts are exhausted without clearance, restore the
automatic node's start pose and record `unresolvedOverlapIds` — do not claim a successful overflow
placement.

**Pure-layout cross-region guard.** Independently of the UI drag clamp, `computeLogisticsLayout()`
must not accept a manual of region A that occupies another populated region's packed container.
Such positions are projected deterministically into the owner's valid interior and reported in
`diagnostics.crossRegionManualIds`. Empty free space outside the owner is allowed; wrong-region id
mismatches remain `wrongRegionManualIds` / dropped. Input storage objects are never mutated.

**Determinism obligations** (each is a test in Slice 2):

- Same input, twice → byte-identical output.
- Input arrays **shuffled** → identical output. Every sort key ends in an id, so no comparison ever
  ties.
- No `Math.random`, no `Date.now`, no iteration-order dependence on object key insertion.

### 3.4 Node dragging and reset

- Drag moves one node. Dropping writes `{x, y}` to the positions store (§10.2), rounded to 1 px.
- A dragged node does **not** re-run the layout. Nothing else moves. This is the whole point.
- A topology-only index (`byNodeId`, unordered endpoint-pair groups, sorted route IDs, and stable
  lane metadata) is built during full rendering and reused for pointer moves. A drag recomputes the
  moved node's incident routes, pair siblings, and routes incident to its immediate neighbours when
  their port ordering can change. Remote components and their DOM/labels are untouched.
- Reset layout → clear the positions key → recompute → fit all. Confirmed, because it is the one
  destructive action in the panel.
- No multi-select drag in this design. It is a plausible follow-up, not a requirement.

---

## 4. Region groups

### 4.1 Container

- Rounded rect (`rx: 14`) behind everything, `fill: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-focusBorder) 12%)`, 1 px dashed border.
- **Fill opacity, never hue.** Region identity is position + label, not colour. In high-contrast
  themes the fill drops to `transparent` and only the border remains (§9).
- Label chip at top-left *inside* the box: `▾ Region name  (7)`. The chevron is the collapse control
  and is a real `<g role="button">` with its own `aria-expanded`.
- `__unassigned` renders no box, no label, no chevron — just its nodes. A world with no `regionId`
  anywhere therefore looks exactly like a plain graph, which is the correct behaviour for the many
  existing scenarios that never authored regions.

### 4.2 Collapse

Collapsed region → one aggregate node at the region box's centre, `major` tier, hexagonal container
shape with a stacked-shadow edge (a second offset outline), badge = member count.

Route re-targeting when region R is collapsed:

```text
route.from ∈ R and route.to ∈ R   → hidden (internal traffic, surfaced in the detail panel)
route.from ∈ R xor route.to ∈ R   → endpoint rewritten to the aggregate node
both endpoints in collapsed regions→ both rewritten; a self-loop is hidden
```

Bundling of rewritten routes: group by `(otherEndpointId, direction, commodityFamily)`, then merge.

```text
bundle.volume     = Σ member.volume
bundle.capacity   = Σ member.effectiveCapacity
bundle.status     = worst status among members  (blocked > raided > strained > open)
bundle.risk       = max member risk             (never averaged — averaging hides the dangerous leg)
bundle.count      = member count
```

A bundle renders with a **double stroke** (a 2 px parallel offset line), a count badge, and — per
§7.5 — never more than one hue. Its detail panel lists every constituent route with its own metrics,
so collapsing hides pixels, never facts.

### 4.3 Protection rules

A region is **never auto-collapsed**. Collapse is a user action only, and even then:

- The current-location node's region cannot be collapsed while it is the current location. The
  chevron is disabled with a tooltip explaining why.
- Collapsing a region that contains the selected node, or an endpoint of the selected route: allowed,
  but the selection **survives**. The aggregate node gets `is-holding-selection` (an inner ring), the
  selected route keeps rendering at full weight into the aggregate, and the detail panel keeps
  showing the same facts.
- Filters never collapse or expand anything.
- Collapse state is a view preference (§10.3), not a layout mutation. Expanding restores the exact
  member positions, including manual ones.

### 4.4 Deterministic placement inside a region

Steps 2–4 of §3.3, run on the region's induced subgraph only. Because the subgraph depends only on
the region's own members and internal routes, the interior is stable against changes anywhere else
in the world.

---

## 5. Node visual language

### 5.1 Principles

- **Shape carries kind. Border style carries certainty. Badge carries function. Colour is the third
  redundant channel, never the only one.**
- Restraint: 8 kinds, 3 tiers, 4 states. That is already 96 combinations; anything more elaborate
  stops being readable.

### 5.2 Kinds

| Kind | Shape | Border | Badge | Existing path |
| --- | --- | --- | --- | --- |
| region (container) | rounded rect, translucent | 1 px dashed | `▾`/`▸` + count | new |
| region (collapsed aggregate) | hexagon + stacked shadow | 2 px solid | count | new |
| settlement / city | rect, clipped corners | 1 px solid | `◆` | [`:186`](webview/modules/85b-economy-logistics.js:186) |
| market | stadium / pill | 1 px solid | `M` | [`:187`](webview/modules/85b-economy-logistics.js:187) |
| facility | plain rect, right angles | 1 px solid | `F`, `⚙` when a processing site | [`:188`](webview/modules/85b-economy-logistics.js:188) |
| store | rect with an awning notch | 1 px solid | `S` | [`:194`](webview/modules/85b-economy-logistics.js:194) |
| vehicle | chevron-ended rect | 1 px **dashed** (mobile) | `→` | [`:189`](webview/modules/85b-economy-logistics.js:189) |
| caravan | split double rect | 1 px **dashed** (mobile) | `C` | [`:190`](webview/modules/85b-economy-logistics.js:190) |
| envoy / moving group | diamond | 1 px **dotted** (transient) | `E` | [`:191`](webview/modules/85b-economy-logistics.js:191) |
| Mobile Base | hexagon | 2 px double | `B` | [`:192`](webview/modules/85b-economy-logistics.js:192) |

Dashed = *moves through the world*. Dotted = *transient or uncertain*. Solid = *fixed installation*.
That rule is the only thing a user has to learn, and it survives greyscale.

Shape paths already exist for all of them. The blocker is L13, not the drawing.

### 5.3 Size tiers

| Tier | Box | Label cap (CJK width units) | Rule |
| --- | --- | --- | --- |
| minor | 112 × 44 | 13 | degree ≤ 1 |
| standard | 152 × 60 | 19 (today's value) | degree 2–3 |
| major | 184 × 72 | 24 | degree ≥ 4, or a collapsed aggregate, or `node.scale === 'major'` |

`logisticsTruncateLabel()` currently hard-codes 19 units ([`:213`](webview/modules/85b-economy-logistics.js:213)).
It must take the cap as a parameter, or minor nodes will overflow and major nodes will truncate
early. Explicit `node.scale` wins when present; degree is the fallback (today's behaviour, L14).

### 5.4 States

| State | Treatment | Channel |
| --- | --- | --- |
| selected | 2 px focus-coloured ring + 3 px outer halo, raised into `.layer-nodes` end, `aria-selected="true"` | geometry |
| current location | `▼` pin glyph above the box + solid accent bar (the existing `M 12 5 H 140` accent, [`:534`](webview/modules/85b-economy-logistics.js:534)) | geometry |
| preview (`snapshotSource === 'derived_preview'`) | 6 % diagonal hatch fill + `~` prefix on the kind label | texture |
| unavailable / rumoured | **dotted border** + `?` badge | border style |
| dimmed by filter / unrelated to selection | opacity 0.28 | opacity |

Note the split: **rumoured uses border style, not opacity**, because opacity is reserved for
relevance (§7.4). A rumoured node that is also filter-relevant must stay fully opaque, or the two
meanings collide the way they do today (L10).

**Current location and the endpoints of the selected route are never dimmed and never hidden**, by
any filter, any semantic-zoom level, or any collapse. This is an invariant, tested in Slice 5.

### 5.5 Required core change (contract gap L13/L14)

To reach vehicle/caravan/envoy/Mobile-Base treatments, `VALID_NODE_KINDS` in
[`economyLogisticsViewCore.ts:125`](src/economyLogisticsViewCore.ts:125) must admit them, and
`EconomyFlowDefinition`'s `EconomyNodeKind` must define them. That is a **simulation contract
change**, not a UI change, and it is explicitly **out of scope for this graph work**. Until it
happens:

- The webview keeps the mappings (they are already written and harmless).
- The legend must not advertise kinds the payload cannot produce. `renderLogisticsLegend()`
  ([`:595`](webview/modules/85b-economy-logistics.js:595)) currently lists `vehicle`, `caravan`,
  `envoy`, `mobile_base` unconditionally — it should list only the kinds present in the payload.
  That is a one-line fix inside Slice 4 and it removes a lie from the UI today.

---

## 6. Edge routing

### 6.1 Comparison

| | Straight | **Cubic Bézier** | Orthogonal | **Bundled** |
| --- | --- | --- | --- | --- |
| Parallel routes separable | ❌ collinear | ✅ lane offsets | ✅ lane offsets | n/a |
| Reverse distinguishable | ❌ identical line | ✅ opposite bend | ✅ opposite lane | n/a |
| Obstacle avoidance | ❌ | ✅ control-point detour | ✅ needs a real router | ✅ inherently |
| Arrowhead angle | trivial | derivative at t=1 | trivial | derivative |
| `<mpath>` particle support | ✅ | ✅ (in use today) | ✅ | ✅ |
| Label anchor | midpoint | `pointAt(t)` | corner-averse | midpoint |
| Reads as "trade" | ⚠️ mechanical | ✅ | ❌ reads as circuits/pipes | ✅ at far zoom |
| Cost to own | trivial | ~120 lines (mostly exists) | 400+ lines of routing | ~80 lines on top of Bézier |

**Chosen: cubic Bézier as the single primitive, plus opt-in bundling for region-to-region traffic at
far zoom.** Straight lines are not a separate mode — a Bézier with zero lane offset and no detour
*is* a straight line, which keeps one code path instead of three.

**Rejected — orthogonal routing.** It needs a genuine channel router to look acceptable, it reads as
a circuit diagram rather than trade flow, and its corner density makes labels and arrowheads harder
to place, not easier. The cost is entirely disproportionate to the benefit for a world map.

**Bundling is bounded**: only region↔region aggregate edges, only at `far` zoom or when a region is
collapsed. Never inside a region, never at `near` zoom. Unbounded edge bundling destroys the
one-route-one-line mapping that the detail panel depends on.

### 6.2 The shared geometry contract

One function; every consumer reads from its output. Nothing re-derives a coordinate.

```js
/**
 * @returns {null | {
 *   d: string,                       // the single path string
 *   start: {x,y}, end: {x,y},        // boundary points, on ports
 *   c1: {x,y}, c2: {x,y},
 *   pointAt: (t:number) => {x,y},
 *   tangentAt: (t:number) => number, // radians; arrowhead orientation
 *   labelAnchor: {x, y, t},          // §6.7
 *   lane: number,                    // signed lane index
 *   detoured: boolean,               // §6.6 fired
 * }}
 */
function logisticsRouteGeometry(route, fromBox, toBox, context) { … }
```

Consumers, all fed from that one object:

| Consumer | Reads |
| --- | --- |
| `.logistics-route-line` (visible stroke) | `d` |
| `.logistics-route-hit` (invisible 12 px screen-width target) | `d` |
| `marker-end` arrowhead | `d` (SVG orients it from the path itself via `orient="auto-start-reverse"` — already correct at [`:657`](webview/modules/85b-economy-logistics.js:657)) |
| SMIL particles | `<mpath href="#pathId">` → the same `d` (already correct at [`:492`](webview/modules/85b-economy-logistics.js:492)) |
| Labels | `labelAnchor` |
| Selection halo | `d` |

`context` carries what the geometry needs and cannot derive: the port assignment table, the lane
table, and the obstacle index. All three are computed once per layout, not per edge.

### 6.3 Ports

Replaces the fixed `±78` horizontal offset (L4/L5).

- Each node box exposes **12 ports**: 3 per side, at 25 %/50 %/75 % of that side.
- Base port choice: intersect the segment (fromCentre → toCentre) with the source box; take the side
  it exits; pick the slot nearest the intersection.
- Slot assignment: for all edges leaving a node through the same side, sort by
  `(angle, direction, routeId)` and deal them into slots in that order. Deterministic, and it spreads
  a fan of routes instead of stacking them.
- Overflow (> 3 edges on a side) reuses slots in the same order — with the lane offsets of §6.4 the
  lines still separate immediately after leaving the port.
- Consequence: `from.x === to.x` no longer degenerates. Vertically stacked nodes connect
  bottom-port → top-port, which is the correct picture and kills L5 outright.

### 6.4 Lanes

For the multiset of routes sharing an **unordered** node pair `{A,B}`:

```js
const members = routesBetween(A, B)
  .sort((a, b) => (dirRank(a) - dirRank(b)) || compareId(a.id, b.id)); // A→B before B→A
const n = members.length;
lane[i] = (i - (n - 1) / 2) * LANE_GAP;          // LANE_GAP = 14
```

- Perfectly deterministic; no hashing (kills the arbitrary `hash(routeId)` bend, L8).
- **Reverse routes are structurally distinguishable**: A→B sorts before B→A, so with `n = 2` they get
  lanes `−7` and `+7` — opposite bends, always, plus opposite arrowheads. A right-hand-traffic
  convention (`sign(lane)` follows direction) is applied so the pair reads as a two-way road rather
  than a random pair of curves.
- The lane offset is applied **perpendicular to the start→end chord**, to both control points:

```js
const [ux, uy] = perpendicularUnit(start, end);
c1 = { x: start.x + dx*0.36 + ux*lane, y: start.y + dy*0.36 + uy*lane };
c2 = { x: end.x   - dx*0.36 + ux*lane, y: end.y   - dy*0.36 + uy*lane };
```

### 6.5 Zoom independence

Lanes, ports, and detours are computed in **world space, from the layout only**. `k` is not an input
to `logisticsRouteGeometry()`. Zooming therefore cannot change route topology — it only changes how
many pixels the same `d` occupies. This is a hard invariant and a Slice 3 test: geometry output must
be byte-identical at `k = 0.25` and `k = 3.0`.

### 6.6 Obstacle avoidance

Goal: *no route passes through an unrelated node.* Bounded, deterministic, no router.

```text
obstacles = all node boxes, inflated by 14px per side, minus the route's own two endpoints
           (and minus the endpoints of a bundle's members)

candidate 0: the direct/lane Bézier from §6.4
blockingObstacleIds = every inflated obstacle intersected by candidate 0
obstacleEnvelope = union bounds of blockingObstacleIds
then, in order:
    route above obstacleEnvelope using an absolute minY corridor
    route below obstacleEnvelope using an absolute maxY corridor
    route left of obstacleEnvelope using an absolute minX corridor
    route right of obstacleEnvelope using an absolute maxX corridor
    route through one deterministic outer corridor beyond the complete graph-obstacle envelope
accept a candidate only when it misses every unrelated inflated obstacle
if every bounded candidate fails:
    keep a finite direct/lane path, mark conflicted = true,
    and report every obstacle ID that the displayed fallback actually intersects
```

Each cubic segment is checked with the existing fixed 24-sample collision test. The concrete column,
row, staggered, sided, outer-corridor, and impossible fixtures are covered by production tests. Full
geometry runs once per render; node pointer moves run only the topology-bounded affected route group.

Because edges now avoid unrelated nodes, the layer order can put edges **under** nodes without any
visual loss — the only overlap left is at the endpoints, where the edge terminates on the boundary
anyway. That resolves L6 without ever drawing a line across a node's face.

### 6.7 Labels

- Anchor from `labelAnchor`, chosen by scoring candidate `t ∈ {0.5, 0.38, 0.62, 0.28, 0.72}` against:
  1. distance to any other placed label (want > 44 px),
  2. distance to any node box (want > 12 px),
  3. **distance to any curve-curve intersection among rendered edges (want > 20 px)** — this is the
     requirement today's code does not implement at all (L9).
- Intersections are found once per layout by sampling each edge into 24 segments and doing a
  segment-segment test between edges whose bounding boxes overlap. Same sample buffer as §6.6 — pay
  for it once.
- Highest score wins; ties break on lowest `t`, then `routeId`. Deterministic.
- Labels only exist at `near` zoom (§2.8), so this scoring runs against a much smaller set than the
  full edge list.

### 6.8 Layer order and raising

```text
.layer-regions        region boxes + labels
.layer-edges          all routes, unselected
.layer-edges-raised   the selected route (and, in commodity-filter mode, matching routes)
.layer-nodes          all nodes
.layer-labels         node labels, route labels, badges
```

A selected route rises above **unrelated routes** (`.layer-edges-raised`) but stays below nodes.
That satisfies "selected route can raise above unrelated routes" without the visual lie of a line
crossing over a settlement's face. Moving a route between layers on selection is a single
`appendChild` — no rebuild.

---

## 7. Commodity colour strategy

### 7.1 The rule

Never assign a colour per commodity. A world with 40 goods would need 40 hues; the eye resolves
about 8, and the current data model already permits arbitrary authored ids (`sakuradite`,
`moon_peach`, …) with no bound.

### 7.2 Six families and the honest fallback

```text
food                 raw_materials        manufactured
luxury               strategic            passengers_information
                     unclassified  ← fallback, NOT a seventh family
```

Resolution order — **this must not invent data**:

```text
1. commodity.family            (a NEW optional authored field, six values, opt-in)
2. derived from CommodityDef.role, which today is only 'staple' | 'material':
       'staple'   → food
       'material' → raw_materials
3. 'unclassified'
```

That is the whole chain, and it is deliberately shallow. **`CommodityRole` in
[`livingWorldTypes.ts:22`](src/livingWorldTypes.ts:22) is literally `'staple' | 'material'` and is
optional.** So in every scenario authored today, the honest answer is that most goods resolve to
`unclassified`. The design must be *good* in that state, not merely survive it:

- `unclassified` gets **no hue at all** — a neutral `--vscode-descriptionForeground` accent.
- Commodity-filter mode (§7.4) keys on `commodityId`, **not** on family. It works perfectly with zero
  families defined. The family accent is an enhancement, never a dependency.
- The family legend renders only families actually present in the payload. A world with two families
  shows two swatches, not six.

Explicitly rejected: deriving a family (or a hue) from a hash of the commodity id. It is exactly the
"arbitrary unique colour per commodity" the brief forbids, wearing a hat.

The `strategic` flag already computed in the view core
([`economyLogisticsViewCore.ts:318`](src/economyLogisticsViewCore.ts:318)) is **not** the `strategic`
family. Today it means "appears in a processing recipe or is short somewhere" — a *derived salience*
flag, not a taxonomy. Reusing it as a family would silently mislabel goods. It stays a separate
badge.

### 7.3 Overview mode

Default. Encoding priority, in order: **direction → throughput → status → selection.**

- Direction: arrowhead at the destination port + particle/dash motion.
- Throughput: stroke width tier.
- Status: hue + dash pattern + exception glyph.
- Selection: raised layer + halo; everything else dims.
- Commodity: **not encoded visually at all.** It is text, in the label and the detail panel.

### 7.4 Commodity-filter mode

When one commodity (or family) is selected:

- Routes carrying it: full opacity, raised into `.layer-edges-raised`, plus an **accent halo** — a
  second stroke beneath the line, `stroke-width: width + 6`, at 35 % opacity, in the family colour.
- Unrelated routes: opacity 0.28, stay in place, keep their status hue at reduced opacity.
- Nodes: endpoints of matching routes stay full; others dim to 0.28. Current location and the
  selected route's endpoints never dim (§5.4).
- **Nothing is removed from the layout.** This is the fix for L11: dimming replaces filtering-out, so
  `occupiedRanks` never recomputes and nodes never jump. The layout is a function of the *data*, not
  of the *filter*.
- The accent colour lives on the halo, **not on the stroke hue**, precisely so hue keeps meaning
  status in both modes. This is the design's central colour decision.

### 7.5 Multi-commodity routes never become rainbows

In the actual data model, `TradeRoute.commodityId` is **singular**
([`ECONOMY_LOGISTICS_ARCHITECTURE.md` §4](docs/ECONOMY_LOGISTICS_ARCHITECTURE.md)). One route carries
exactly one commodity. So multi-commodity edges arise from exactly one place: **bundles** (§4.2).

Bundle rule:

```text
all members share one family → that family's accent halo
otherwise                    → neutral accent, count badge "×N"
never                        → a gradient, a dashed multi-hue, or per-segment colours
```

The bundle's detail panel lists every member with its own family and metrics. Facts live in text;
the line stays one colour.

### 7.6 Channel table — one meaning each

| Channel | Meaning | Values | Notes |
| --- | --- | --- | --- |
| **hue** | route **status** | open / strained / blocked / raided / rumoured | Always. Both modes. Never commodity. |
| **line width** | **throughput** tier | 4 tiers from `volume` | `1.5 + sqrt(v/vmax) × 6` today ([:414](webview/modules/85b-economy-logistics.js:414)) → quantise to 4 tiers so widths are comparable, not vernier. Disrupted routes keep a 2.5 floor. |
| **dash pattern** | route **status** (redundant) | solid / dash / long-dash / dot-dash / dotted | Deliberately redundant with hue. This is the colour-blind and greyscale path, and it carries **no independent meaning**. |
| **opacity** | **relevance** to the current filter/selection | 1.0 / 0.28 | **Changed from today.** Opacity currently doubles as utilisation (L10); it must not. |
| **arrowhead** | **direction** | one, at the destination port | Nothing else. Fixed screen size ([:654](webview/modules/85b-economy-logistics.js:654) already correct). |
| **animation** | **liveness**; speed tier = throughput tier | present iff `volume > 0` | No independent meaning; speed mirrors the width tier so the two never disagree. Off under reduced motion. |
| **accent halo** | **commodity family** | 6 + neutral | Filter mode only. |
| **glyph badge** | **exception** state | `◆` bottleneck, `×` blocked, `!` raided, `?` rumoured | Position-stable next to the label. |
| **border style** (nodes) | **certainty** | solid fixed / dashed mobile / dotted transient-or-rumoured | §5.2, §5.4. |

**Utilisation is deliberately not a continuous visual channel.** It surfaces as (a) the `◆`
bottleneck glyph at ≥ 0.85 with unmet demand at the destination — the rule already in
[`economyLogisticsViewCore.ts:13,330`](src/economyLogisticsViewCore.ts:13) — and (b) a number at
`near` zoom and in the detail panel. Encoding it in opacity, as today, is what forces opacity to mean
two things at once.

---

## 8. Route details, filtering, and search

### 8.1 Selection model

```text
click route
  → route raised to .layer-edges-raised, halo applied
  → both endpoint nodes forced visible and un-dimmed (even if a filter would dim them)
  → all unrelated routes → opacity 0.28
  → detail panel populated, aria-live="polite" (already correct at :685)
  → camera does NOT move  (fit-selection is F, an explicit user command)
Escape / click background / Clear → deselect
```

The existing `Escape` handling ([`:738`](webview/modules/85b-economy-logistics.js:738)) already stops
propagation so one press does the innermost thing. Keep exactly that.

### 8.2 Detail panel — factual fields only

Every field below already exists in `EconomyLogisticsRouteView`. Nothing is invented.

| Field | Source |
| --- | --- |
| origin / destination | `fromNodeId` / `toNodeId` → `node.label` |
| direction | `origin → destination` (routes are directed) |
| commodities | `commodityId` → `commodity.name` (+ family when known; bundles list all) |
| current flow | `volume` |
| effective capacity | `effectiveCapacity` (and `baseCapacity` as "base") |
| utilisation | `utilization` as a percentage |
| status | `status` ∈ open/strained/blocked/raided |
| risk | `risk` (0–1) + the existing low/medium/high band |
| vehicles / groups | **blocked on L13** — no vehicle node kind reaches the view model yet. Omit the row entirely rather than showing an empty one. |
| known disruptions | `status !== 'open'`, plus `bottleneck` with the destination's `unmetDemand` |

### 8.3 Explaining `4.6 / 6.8`

Today the label is a bare `volume/effectiveCapacity` with no unit and no explanation
([`:448`](webview/modules/85b-economy-logistics.js:448)). It must read as:

```text
4.6 / 6.8   =   flow / capacity, per world tick
                ├── 4.6  units actually moving this tick  (TradeFlowSummary.volume)
                └── 6.8  effective capacity after operational modifiers
                         (base capacity 8.0, reduced by route condition/disruption)
utilisation = 4.6 / 6.8 = 68%
```

Concretely: the graph label keeps `4.6 / 6.8` (space is scarce), but gains
`aria-label` + `<title>` + a detail-panel row spelling out **"flow / capacity (per tick)"**. When
`effectiveCapacity !== baseCapacity` the panel shows both, because that gap *is* the disruption
story and is currently invisible. New localisation keys are needed in all four
`locales/*.json`; the ratio must never be presented as a bare fraction with no unit.

### 8.4 Filters

| Control | Type | Behaviour |
| --- | --- | --- |
| commodity | select (exists, [:280](webview/modules/85b-economy-logistics.js:280)) | dim, don't remove (§7.4) |
| commodity family | select | only lists families present |
| route status | multi-toggle | open / strained / blocked / raided |
| region | multi-select | dims non-members; does not collapse |
| node type | multi-toggle | only lists kinds present in the payload |
| selected vehicle/group | select | **blocked on L13**; hidden until the kinds exist |
| search by node name | text | substring, case-insensitive, `String.prototype.normalize('NFKC')` so JA/ZH width variants match; matches highlight, non-matches dim |
| show only connected to selection | toggle | dims everything > 1 hop from the selection |
| reset filters | button | defaults; **never touches positions or camera** |

**Invariant: filtering never writes the positions key.** Filters live in the prefs key (§10.3);
positions live in their own key (§10.2); the two code paths do not intersect. This is asserted by a
Slice 5 test that snapshots the positions store before and after a filter sweep.

Filters compose as AND across controls, OR within a multi-select.

---

## 9. Accessibility

### 9.1 Keyboard navigation

The current model — every node and route a tab stop (L12) — must go. Replacement:

```text
The graph is ONE tab stop:  role="application", aria-roledescription="logistics graph",
                            aria-label="…", tabindex="0", roving inner focus.
Arrow keys      pan the camera            (no element focused)
Tab / Shift+Tab enter / leave the graph   (never cycles 60 nodes)
Once inside:
  n / N         next / previous node in layout order (row-major by y, then x)
  e / E         next / previous edge of the focused node, by port order
  Enter / Space select the focused element
  Escape        clear selection, then release focus outward
  0 F C + -     camera commands (§2.5)
```

Focused element gets `.is-focused` and the roving `tabindex="0"`; all others `tabindex="-1"`.

### 9.2 The list view is not a consolation prize

A toggle switches between **Graph** and **List**. The list is a real `<table>` of routes
(origin, destination, commodity, flow/capacity, utilisation, status, risk), sortable, fully
navigable. It is:

- the screen-reader path (a `role="application"` canvas is a poor primary),
- the narrow-Webview path (§9.6),
- the honest answer for anyone who wants numbers, not pictures.

Both views share the same filter and selection state. Selecting in one selects in the other.

### 9.3 Visible focus

`outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px` on every interactive element —
the pattern already used at [`:63`](webview/styles/85b-economy-logistics.css:63). Inside the SVG,
where `outline` is unreliable across engines, use an explicit focus ring `<rect>`/`<path>` sibling
whose stroke width divides by `--logistics-camera-k` so it stays 2 screen px at every zoom.

### 9.4 High contrast

- Detect via `@media (forced-colors: active)` and VS Code's `--vscode-contrastBorder` being set.
- Region fills → `transparent`; only borders remain.
- All strokes → minimum 1.5 px; the accent halo → a dashed outline instead of a translucent glow
  (translucency is meaningless in forced-colors).
- Never rely on `color-mix()` backgrounds for meaning; they are decoration only.

### 9.5 Reduced motion / colour-blind

- Reduced motion: no particles, no marching dashes, no camera easing. Already detected at
  [`:9`](webview/modules/85b-economy-logistics.js:9); extend it to the camera.
- Colour-blind: every hue is doubled by a dash pattern and a glyph (§7.6). The panel must be fully
  operable in greyscale — that is the acceptance test, not a palette choice.

### 9.6 Narrow Webview

`LOGISTICS_COMPACT_WIDTH_PX = 420` already exists ([`:7`](webview/modules/85b-economy-logistics.js:7))
but only switches the *animation* mode. Extend it:

| Width | Behaviour |
| --- | --- |
| < 420 px | Default to **List** view. Minimap hidden. Graph still reachable via the existing lightbox ([`:841`](webview/modules/85b-economy-logistics.js:841)), which gets the full camera. |
| ≥ 420 px | Graph view, marching dashes. |
| ≥ 640 px | Particles, minimap visible. |

The existing `ResizeObserver` on the viewport ([`:53`](webview/modules/85b-economy-logistics.js:53))
is the right hook — it deliberately measures the scrollable viewport rather than the window, which is
exactly what a docked narrow column needs. Reuse it; do not re-measure the window.

### 9.7 Japanese and Chinese label lengths

- `logisticsTruncateLabel()`'s width-unit model (wide chars = 2 units,
  [`:205`](webview/modules/85b-economy-logistics.js:205)) is correct and stays. Its cap becomes a
  per-tier parameter (§5.3).
- Region labels get their own cap, derived from the region box width, not the node cap.
- The full untruncated label always exists in `<title>`, the `aria-label`, and the detail panel.
  Truncation is never lossy for a screen reader or a hover.
- Detail-panel rows must wrap, not ellipsis: `flow / capacity` reads
  `流量 / 輸送力（1ターンあたり）` in JA, which will not fit a 120 px label column.
- Legend and toolbar strings must be measured in ZH-Hans/ZH-Hant too; both are already shipped
  (`locales/zh-CN.json`, `locales/zh-TW.json`) and both are typically ~60 % the width of the JA
  string, so JA is the binding constraint for width tests.

---

## 10. Technology recommendation

### 10.1 Verdict

> **Keep SVG. Add a transformed viewport group. Add no dependency. Write the layout ourselves.**
>
> **D3-force: not justified. ELK: not justified. Cytoscape: not justified.**

### 10.2 Why no dependency — the decisive constraint

**LoreRelay's webview has no module system.** [`scripts/build-webview.js`](scripts/build-webview.js)
*concatenates* `webview/modules/*.js` into one `webview/script.js` in a hard-coded order. There is no
bundler, no `import`, no `require`, no `node_modules` resolution in the webview. Dropping in any npm
graph library means **first introducing a bundler into the build** — a change of a completely
different magnitude and risk than the graph feature itself, affecting all 38 modules.

Then the CSP ([`webview/index.html:5`](webview/index.html:5)):

```
default-src 'none'; script-src 'nonce-{{nonce}}'; connect-src 'none';
```

No `unsafe-eval`, no `wasm-unsafe-eval`, no external origin. ELK's JS build historically leans on a
worker plus generated code paths that are hostile to a nonce-only, `connect-src 'none'` policy; a
worker would need its own nonce-blessed inline bootstrap or a `blob:` worker source that this CSP
does not grant.

| | Bundle | CSP | Webview | Maintenance | Determinism | A11y |
| --- | --- | --- | --- | --- | --- | --- |
| **No dependency (chosen)** | **0 KB** | ✅ trivially | ✅ | We own ~600 lines, all testable in `vm` | ✅ by construction | ✅ real DOM nodes |
| d3-force | ~30 KB (+ d3-zoom ~10 KB) | ✅ | ✅ | small | ❌ **iterative; contradicts the brief's core requirement** | n/a |
| ELK.js | ~1.5 MB min | ⚠️ worker / generated-code paths vs nonce-only + `connect-src 'none'` | ⚠️ | GWT-transpiled Java — effectively unpatchable by us | ✅ | n/a |
| Cytoscape.js | ~400 KB min | ✅ | ⚠️ canvas-only | large surface we would not use 90 % of | ⚠️ depends on layout choice | ❌ canvas — no DOM, no `<title>`, no focus |

Even setting the bundler aside: **d3-force is disqualified by the requirement, not by its size.** The
brief asks for a stable layout with no motion after settling; d3-force's entire value proposition is
the opposite. We would import it and then fight it.

**d3-zoom** deserves a specific mention because it is the one library that does exactly what §2
needs. It is still declined: §2.3's `zoomAt()` is nine lines, we need custom hit-target rules (drag a
node vs pan the background vs Space-drag) that would mean fighting d3-zoom's event capture anyway,
and adding a bundler to save nine lines is not a trade worth making.

### 10.3 Why not Canvas or WebGL

- **Canvas would break the existing test harness.**
  [`scripts/test_economy_logistics_webview.js`](scripts/test_economy_logistics_webview.js) runs the
  real module inside `node:vm` against a hand-written `FakeElement` DOM — no jsdom, no browser. That
  harness works precisely because rendering produces inspectable DOM. A canvas renderer produces
  pixels, which this harness cannot assert on at all. We would lose the existing tests and gain a
  screenshot-diff dependency.
- **Canvas would break accessibility.** `<title>`, `aria-label`, real focus, and the screen-reader
  route descriptions of §9 all come free from SVG elements. On canvas, every one of them must be
  re-implemented against a parallel hidden DOM — which is just SVG with extra steps.
- **WebGL** is unjustifiable at this scale and adds a driver/blocklist failure mode inside a VS Code
  webview.
- **Scale check**: ~7 elements/node + ~6/route. A 200-node, 400-route world ≈ 3800 SVG elements —
  comfortable for Chromium. Semantic zoom (§2.8) and the §2.9 camera contract (no DOM writes on
  wheel) keep interaction smooth. The existing isometric settlement view already uses Canvas where
  Canvas is right (thousands of tiles, no per-tile semantics); the logistics graph is the opposite
  workload — few elements, rich per-element semantics. Different tool, correctly.

**Escape hatch, documented not built**: if a real world ever exceeds ~400 nodes, the answer is
aggressive region collapsing (§4.2) and viewport culling — not a renderer rewrite. Culling
(skip elements whose world bbox misses the viewport + 200 px margin, above 150 nodes) is specified in
Slice 5 and is a ~30-line addition to the same SVG path.

---

## 11. Migration and persistence

### 11.1 Storage medium

`localStorage`, following the settlement precedent
(`SETTLEMENT_PREFS_PREFIX = 'lorerelay.settlementView.v2.'`,
[`86b-settlement-isometric.js:55`](webview/modules/86b-settlement-isometric.js:55)).

- **Not** `vscode.setState()` — that is the chat/session blob
  ([`modules/90-bootstrap.js:196`](webview/modules/90-bootstrap.js:196)) and layout does not belong in it.
- **Never** `WorldState`, `CommerceForge`, or any scenario file. This is not merely a design
  preference: [`test_webview_payload_whitelist.js:252`](scripts/test_webview_payload_whitelist.js:252)
  already **fails the build** if logistics state appears in `worldStateCore`, `livingWorldTypes`, or
  as an `ext.economyLogistics` assignment in the bridge. Graph layout is a **view preference about a
  view**, not a fact about the world.

All access wrapped in `try/catch`; on failure (private mode, quota) the panel degrades to
**in-memory-for-this-session**, exactly as the existing animation preference does
([`:25`](webview/modules/85b-economy-logistics.js:25)).

### 11.2 Keys

```text
lorerelay.logistics.camera.v1.<scopeKey>    → {"v":1,"k":0.82,"tx":-140,"ty":-60,"ts":1750000000000}
lorerelay.logistics.layout.v1.<scopeKey>    → {"v":1,"algo":"region-hybrid-1",
                                               "positions":{"<nodeId>":{"x":120,"y":340,"ts":…}}}
lorerelay.logistics.prefs.v1.<scopeKey>     → {"v":1,"view":"graph","filters":{…},
                                               "collapsed":["region_north"],"minimap":true}
```

Three keys, not one, because they have three different lifetimes and three different reset commands
(§2.5). Resetting the camera must not be able to touch positions, and no filter write may ever open
the positions key (§8.4).

### 11.3 Scope key

```text
scopeKey = payload.scopeKey ?? 'default'
```

`worldView.ts` supplies a short, stable, sanitized identifier — a hash of the workspace folder path,
plus the scenario id when one exists. Constraints:

- It is a **derived, transient payload field**, like `snapshotSource` already is. It is not persisted
  into `WorldState`, so it does not trip the whitelist test.
- `[a-z0-9_-]{1,32}` only; it is concatenated into a storage key.
- Fallback `'default'` when the host does not supply it, so the webview never breaks if the field is
  absent. **Slice 1 and Slice 2 must both work with `'default'`**; the host field is a Slice 2
  refinement, and it is the *only* production `src/` change in this entire design.

Two scenarios in two workspaces therefore never share a camera or a layout. Reopening the same
scenario restores exactly what the user left.

### 11.4 Schema version and invalid/stale recovery

```js
const LOGISTICS_LAYOUT_SCHEMA = 1;
const LOGISTICS_ALGO_ID = 'region-hybrid-1';
```

| Condition | Recovery |
| --- | --- |
| `v !== 1` | discard the entry, recompute. Never throw, never warn the user. |
| `algo !== 'region-hybrid-1'` | discard **positions** (the automatic baseline they were nudged from no longer exists), keep camera. |
| JSON parse failure | discard that key only. |
| `k`/`tx`/`ty` not finite, or `k` outside [0.25, 3.0] | discard camera → fit all. |
| position not finite, or `|x|` or `|y|` > 50000 | drop that node's entry; the node reverts to its automatic slot. Mirrors the existing settlement guard (`Math.abs(pan.x) < 20000`, [`:220`](webview/modules/86b-settlement-isometric.js:220)). |
| stored `positions` exceeds 500 entries | prune the oldest by `ts` (LRU) down to 500. |

Bad data is always *dropped and recomputed*, never surfaced as an error. A corrupt layout key must
degrade to "the graph looks freshly opened", which is a perfectly good state.

### 11.5 Node added / removed

| Event | Behaviour |
| --- | --- |
| **Node added** | No stored position → placed by the automatic layout (§3.3), with existing manual positions treated as fixed obstacles. **The camera does not move**; the node may appear off-screen, and the minimap is how the user finds it. Nothing else on the canvas moves. |
| **Node removed** | Its stored position is **retained** (tombstoned). Cheap, and if the node returns — a rebuilt scenario, a re-enabled facility — it returns exactly where the user put it. Pruned only by the 500-entry LRU cap. |
| **Node's `regionId` changes** | Its manual position is dropped (it would now sit outside its region's box) and it is placed automatically inside the new region. This is the one case where a manual position is silently discarded, and it is correct: the position's meaning was "here, in this region". |
| **Route added/removed** | Geometry re-derives. Node positions never change. Node *tier* may change (degree-derived, §5.3) — that resizes a box in place; it does not move anything. |

### 11.6 Reset behaviour

| Command | Clears | Keeps |
| --- | --- | --- |
| Reset camera / Fit all | camera key | positions, prefs |
| **Reset layout** (confirmed) | positions key | camera, prefs. Recomputes, then fits all. |
| Reset filters | `prefs.filters` | positions, camera, collapse state |
| Expand all regions | `prefs.collapsed` | everything else |

No command clears all three. There is deliberately no "reset everything" button; it would be the one
click that destroys manual work the user cannot recover.

---

## 12. Implementation slices

Global stop conditions, applying to every slice:

- **Any change under `src/` other than the two named below → stop and report.** The named ones are
  `worldView.ts` (`scopeKey`, one field, Slice 2) and `economyLogisticsViewCore.ts` (`family`, Slice 4).
- No new dependency. No `package.json` change. → stop.
- No version bump, no `CHANGELOG`, no packaging, no release. → stop.
- Never touch `C:\AI\text-adventure-vsce` or `C:\AI\worktrees\LoreRelay\integration-current`.
- Sizing per [`docs/DEVELOPMENT_VERIFICATION_POLICY.md`](docs/DEVELOPMENT_VERIFICATION_POLICY.md).
  These are **Medium risk**: webview-only, read-only view, no persistence of authoritative state.
  Focused tests only. No full suite until Slice 6.
- `webview/script.js` and `webview/style.css` are **build outputs** — regenerate via
  `node scripts/build-webview.js` and commit them. Never hand-edit.
- On 3 consecutive failures of the same test: stop and report the log.

---

### SLICE 1 — Graph viewport and camera

**Scope.** The camera and nothing else. Layout, geometry, and colour stay exactly as they are today.
Remove `max-height: 520px`; give the SVG a viewport-sized `viewBox`; introduce `.logistics-camera`;
wire wheel/drag/keyboard; fit all / fit selection / centre / zoom in/out; camera persistence; split
`renderEconomyLogisticsPanel()` from `applyLogisticsCamera()` (L15). Semantic-zoom band class is set
but **no rules consume it yet**.

**Expected files.**

```text
new   webview/modules/85b0-logistics-camera.js     pure camera math, no DOM
edit  webview/modules/85b-economy-logistics.js     wiring, render split
edit  webview/styles/85b-economy-logistics.css     drop max-height, toolbar, camera var
edit  scripts/build-webview.js                     register 85b0 before 85b in JS_MODULE_ORDER
edit  locales/{en,ja,zh-CN,zh-TW}.json             camera command strings
new   scripts/test_logistics_camera.js
edit  scripts/run_all_tests.js                     register the new unit test
gen   webview/script.js, webview/style.css         build outputs
```

**Focused tests** (`test_logistics_camera.js`, pure — no DOM needed):

- `zoomAt()` invariant: for 200 pseudo-random (fixed-table, not RNG) pointer/zoom pairs, the world
  point under the pointer is unchanged to within 1e-9.
- Clamping at MIN and MAX leaves `tx/ty` untouched.
- `deltaMode === 1` normalisation.
- `fitAll` on a known bbox → expected `k`, and the bbox centre lands on the viewport centre.
- `fitSelection` of a single node includes its neighbours and does not hit MAX.
- Camera persistence round-trip; rejects `k = NaN`, `k = 0`, `k = 99`, `tx = Infinity`, `v = 2`, and
  malformed JSON — each by falling back to fit-all, never by throwing.

**Acceptance gate.**

```bash
npm run compile
node scripts/build-webview.js
node scripts/test_logistics_camera.js
node scripts/test_economy_logistics_webview.js   # must still pass unchanged
```

**Stop conditions.** Any need to touch `src/`; any node-position or geometry change; any camera
change that triggers a DOM rebuild (that is the bug being fixed, not a compromise to accept).

---

### SLICE 2 — Stable node layout and persistence

**Scope.** `computeLogisticsLayout()` per §3.3. Region containers (§4.1) rendered, expand/collapse
chrome present. Node dragging, manual-position persistence, reset-to-automatic. `scopeKey` in
`worldView.ts` (**one field**). Aggregate collapsed nodes and route re-targeting (§4.2) land here;
bundling waits for Slice 3's geometry.

**Expected files.**

```text
new   webview/modules/85b1-logistics-layout.js     pure computeLogisticsLayout()
edit  webview/modules/85b-economy-logistics.js     use it; drag; persistence
edit  webview/styles/85b-economy-logistics.css     region containers, drag cursor
edit  src/worldView.ts                             scopeKey — one derived field, ONLY change
edit  scripts/build-webview.js                     register 85b1
edit  locales/*.json (4)
new   scripts/test_logistics_layout.js
edit  scripts/run_all_tests.js
gen   webview/script.js, webview/style.css
```

**Focused tests.**

- **Determinism**: same input twice → deep-equal. Input arrays shuffled → deep-equal. (Two separate
  tests; the second is the one that catches accidental insertion-order dependence.)
- No two node boxes overlap after layout (with and without manual positions in the mix).
- Every node's box is inside its region's box, minus padding.
- `__unassigned` produces no region box.
- Adding a node to region A leaves **every** node in region B byte-identical.
- Manual position survives a data push; the manual node's neighbours do not move.
- Reset clears only the positions key; the camera key is untouched.
- Storage: rejects non-finite, `|x| > 50000`, `v` mismatch, `algo` mismatch; LRU prunes at 500.
- `regionId` change drops that node's manual position (§11.5).
- `scopeKey` absent → `'default'`; two scope keys never read each other's data.

**Acceptance gate.**

```bash
npm run compile
node scripts/build-webview.js
node scripts/test_logistics_layout.js
node scripts/test_economy_logistics_webview.js
node scripts/test_webview_payload_whitelist.js   # scopeKey must not trip the state guard
```

**Stop conditions.** Any `src/` change beyond the single `scopeKey` field. Any non-determinism.
Any layout that depends on the active filter (that is L11 returning).

---

### SLICE 3 — Obstacle-aware route geometry

**Scope.** §6 in full: ports, lanes, reverse distinction, bounded obstacle detours, the shared
geometry contract, intersection-aware label anchors, layer order, region-to-region bundling. Fixes
L4/L5/L6/L7/L8/L9.

**Expected files.**

```text
new   webview/modules/85b2-logistics-geometry.js   pure geometry, no DOM
edit  webview/modules/85b-economy-logistics.js     consume it; layer order
edit  webview/styles/85b-economy-logistics.css     hit path, raised layer, bundle stroke
edit  scripts/build-webview.js
new   scripts/test_logistics_geometry.js
edit  scripts/run_all_tests.js
gen   webview/script.js, webview/style.css
```

**Focused tests.**

- Endpoints lie **on a node's boundary**, never at its centre, for 8 directional cases including
  `from.x === to.x` (the L5 regression) and `from.y === to.y`.
- Sampling any route at 24 points hits **no unrelated node's inflated AABB** across a fixture with 3
  known would-be crossings.
- Two parallel same-direction routes are separated by ≥ `LANE_GAP` along their whole length.
- A→B and B→A never coincide: minimum separation > 0 at every sampled `t`, and their bends have
  opposite signs.
- **Zoom independence**: geometry output is byte-identical for `k = 0.25` and `k = 3.0` (`k` must not
  even be a parameter — this test enforces the API shape).
- Determinism under shuffled route input.
- Label anchor is > 20 px from every computed curve intersection in a fixture built to force one.
- SMIL `<mpath>` still resolves: the `d` on the path with `id = pathId` equals `geometry.d`.
- Bundle merge: volume sums, capacity sums, status takes the worst, **risk takes the max, never the
  mean**.

**Acceptance gate.**

```bash
npm run compile
node scripts/build-webview.js
node scripts/test_logistics_geometry.js
node scripts/test_logistics_layout.js
node scripts/test_economy_logistics_webview.js
```

**Stop conditions.** Any `src/` change. Any geometry that reads camera state. Detour attempts
exceeding the bound of 3 (unbounded routing is out of scope by construction).

---

### SLICE 4 — Commodity/status visual encoding

**Scope.** §7 in full: six families + `unclassified`, the resolution chain, the accent halo,
**opacity re-assigned from utilisation to relevance** (L10), quantised width tiers, the channel
table, the detail panel with the `flow / capacity` explanation (§8.3), and the legend listing only
kinds/families actually present (§5.5). Node tiers and per-tier label caps (§5.3). Adds an optional
`family` to `EconomyLogisticsCommodityView` — **one core file**.

**Expected files.**

```text
edit  src/economyLogisticsViewCore.ts              family resolution: authored → role → unclassified
edit  webview/modules/85b-economy-logistics.js     channels, halo, tiers, detail panel, legend
edit  webview/styles/85b-economy-logistics.css     family accents, tiers, HC rules
edit  locales/{en,ja,zh-CN,zh-TW}.json             families, "flow / capacity (per tick)", tiers
edit  scripts/test_economy_logistics_view_core.js  family resolution cases
edit  scripts/test_economy_logistics_webview.js    channel assertions
gen   webview/script.js, webview/style.css
```

**Focused tests.**

- `role: 'staple'` → `food`; `role: 'material'` → `raw_materials`; no role → `unclassified`;
  authored `family` beats both.
- An unknown/custom id (`sakuradite`) with no role → `unclassified`, and **gets no hue**.
- **No commodity id ever influences a hue.** Assert by rendering two payloads that differ only in
  commodity ids and diffing every emitted colour/class — they must be identical.
- Opacity is a function of relevance only: a route's opacity is unchanged by `utilization`
  0.1 vs 0.9, and changes only under filter/selection.
- A bundle with mixed families gets the neutral accent, never two hues.
- The legend lists exactly the kinds/families present in the payload (the L13 lie is gone).
- `4.6 / 6.8` carries a unit-bearing `aria-label` and a detail-panel row; when
  `effectiveCapacity !== baseCapacity`, both are shown.
- Greyscale: every status remains distinguishable by dash + glyph with hue stripped.

**Acceptance gate.**

```bash
npm run compile
node scripts/build-webview.js
node scripts/test_economy_logistics_view_core.js
node scripts/test_economy_logistics_webview.js
node scripts/test_webview_payload_whitelist.js
```

**Stop conditions.** Any hue derived from a commodity id or a hash. Any `src/` change beyond the
`family` field. Any channel carrying two meanings.

---

### SLICE 5 — Filtering, minimap, semantic zoom

**Scope.** §8.4 filter controls, name search with NFKC, "only connected to selection", reset filters;
the minimap (§2.7) with its split redraw policy; semantic-zoom CSS bands with hysteresis (§2.8);
viewport culling above 150 nodes; §9.1 roving-tabindex keyboard model; §9.2 list view; §9.6 narrow
width behaviour.

**Expected files.**

```text
edit  webview/modules/85b-economy-logistics.js
new   webview/modules/85b3-logistics-minimap.js
edit  webview/styles/85b-economy-logistics.css
edit  scripts/build-webview.js
edit  locales/*.json (4)
new   scripts/test_logistics_filters.js
edit  scripts/run_all_tests.js
gen   webview/script.js, webview/style.css
```

**Focused tests.**

- **Filtering never writes the positions key**: snapshot the store, sweep every filter control,
  compare — byte-identical. (The §8.4 invariant.)
- Filtering never moves a node: positions before and after a filter sweep are deep-equal (L11 gone).
- Current location and the selected route's endpoints stay visible and un-dimmed under every filter
  combination, including one that excludes them.
- Search matches JA full-width and half-width forms of the same name via NFKC.
- Zoom band hysteresis: `k` oscillating across 0.55 ± 0.02 does not change the band.
- Minimap: camera change updates only the viewport rect; contents redraw only on layout/filter change
  (assert by spying on the DOM write path).
- Culling: a node outside viewport + margin is skipped only above the 150-node threshold, and is
  still present for `aria` when hidden by semantic zoom.
- Keyboard: the graph is exactly one tab stop; `n`/`e` traverse in the documented order.

**Acceptance gate.**

```bash
npm run compile
node scripts/build-webview.js
node scripts/test_logistics_filters.js
node scripts/test_logistics_camera.js
node scripts/test_logistics_layout.js
node scripts/test_logistics_geometry.js
node scripts/test_economy_logistics_webview.js
```

**Stop conditions.** Any filter path that opens the positions key. Any culling that removes an
element a screen reader still needs.

---

### SLICE 6 — Actual VS Code visual verification

**Scope.** No new features. Verify in a real Webview, with real scenario data, at real widths. This
is the first slice that runs the full suite.

**Method** (matches the established harness approach — capture the real payload, render it in the
built-in browser; VS Code itself is not driven by computer-use):

```bash
node scripts/create_ui_showcase_scenarios.js
node scripts/capture_living_trade_worldview.js   # → _harness/living-trade-worldView.json
```

then render `webview/index.html` against that captured payload in the built-in browser harness and
inspect. `05-living-trade-world` is the right fixture: it is the scenario built specifically to
exercise trade.

**Checklist** (each is a screenshot, not a claim):

- No vertical compression at 12, 40, and 80 nodes — nodes stay at their tier size at `k = 1`.
- Wheel zoom is pointer-anchored; the point under the cursor does not drift.
- Data push does not move the camera.
- No route crosses an unrelated node. Reverse pairs are visibly distinct. Labels sit off
  intersections.
- Selecting a route dims the rest and keeps both endpoints readable.
- Region collapse/expand; the current-location region cannot be collapsed.
- Filter → nodes do not jump.
- Widths: 380 px (list view), 420 px, 900 px, lightbox.
- Themes: Dark+, Light+, **Dark High Contrast**.
- `prefers-reduced-motion` on: no particles, no eased camera.
- Greyscale screenshot: all statuses still distinguishable.
- JA and ZH-Hans locales: no clipped labels; the JA `flow / capacity` row wraps.
- Reload → camera and manual positions restored. Reset layout → automatic layout returns.

**Acceptance gate.**

```bash
npm run compile
npm test        # full suite — first and only time in this sequence
```

Plus the screenshot set attached to the report.

**Stop conditions.** Any visual defect that needs a *design* change (not a fix) → stop and report; do
not redesign inside a verification slice.

---

## 13. Required design verdict

```text
RECOMMENDED_ARCHITECTURE
  Renderer     : existing SVG + one transformed camera group. No new dependency.
  Camera       : pointer-centred wheel zoom (0.25–3.0), background/middle/Space drag pan,
                 keyboard pan+zoom, fit all / fit selection / centre / reset.
                 Camera writes exactly two things: the group transform and
                 --logistics-camera-k. Never rebuilds the DOM. Never auto-refits on data
                 change, except when content is 100% off-screen and the user has not
                 panned this session.
  Layout       : deterministic region-clustered hybrid ('region-hybrid-1').
                 Partition by regionId → intra-region longest-path ranking with 4 fixed
                 barycentre sweeps → region-level weighted grid packing. No RNG, no time,
                 no iteration-to-convergence. Shuffled input → identical output.
                 Manual drags persist and are treated as fixed obstacles.
  Regions      : translucent containers (opacity, never hue), expand/collapse, aggregate
                 node with re-targeted and bundled routes. Never auto-collapse. The
                 current location's region cannot be collapsed. Selection survives collapse.
  Edges        : cubic Bézier as the single primitive. 12 ports per node, deterministic
                 lane offsets (no hashing), reverse routes structurally opposite, bounded
                 bounded obstacle-envelope avoidance (direct, above/below/left/right,
                 graph-envelope outer corridor, finite conflicted fallback), intersection-aware
                 label anchors. One geometry contract feeds stroke, arrowhead, particles,
                 hit path, and labels. Geometry never reads the camera.
  Colour       : hue = status (always). width = throughput. opacity = relevance.
                 accent halo = commodity family (filter mode only). dash = status
                 (redundant, for greyscale). arrowhead = direction. animation = liveness.
                 Six families + 'unclassified'; resolution is authored family → the
                 existing CommodityRole ('staple'|'material') → unclassified. Never a
                 per-commodity or hashed hue. Bundles never show two hues.
                 Utilisation is a number and a bottleneck glyph, not a continuous channel.
  Persistence  : three localStorage keys (camera / layout / prefs), schema v1, per
                 scopeKey. Bad data is dropped and recomputed, never surfaced.
                 Nothing is written to WorldState — already enforced by
                 test_webview_payload_whitelist.js.
  src/ changes : exactly two, both one field — worldView.ts scopeKey (Slice 2) and
                 economyLogisticsViewCore.ts commodity family (Slice 4).

ALTERNATIVE_CONSIDERED
  d3-zoom for the camera (~10 KB, CSP-clean, does exactly what §2 needs).
    Declined: zoomAt() is nine lines; custom hit-target rules (drag node vs pan
    background vs Space-drag) would mean fighting its event capture; and the webview
    has no module system, so adopting it means introducing a bundler into a
    38-module concatenation build first. Not a trade worth making for nine lines.
    This is the strongest rejected option and the one to revisit if a bundler ever
    arrives for other reasons.
  Canvas with a parallel hidden DOM for accessibility.
    Declined: it is SVG with extra steps, and it would destroy the existing
    node:vm + FakeElement test harness that asserts on rendered structure.
  Orthogonal edge routing.
    Declined: needs a real channel router, reads as a circuit diagram rather than
    trade, and complicates arrowheads and labels rather than simplifying them.

REJECTED_APPROACHES
  Fixed hierarchical layout (the status quo).
    Structural failure, not a tuning problem: ranking by kind discards regionId, forces
    all inter-region traffic through three vertical bands, and makes the layout a
    function of the active filter — which is why nodes jump today.
  Force-directed layout (d3-force or hand-rolled).
    Contradicts the brief's core requirement. Even frozen, adding one node re-solves the
    whole system and drifts every other node, destroying the meaning of a user's drag.
  ELK.js.
    ~1.5 MB, GWT-transpiled Java we could not realistically patch, and worker/generated-code
    paths hostile to a nonce-only CSP with connect-src 'none'.
  Cytoscape.js.
    ~400 KB, canvas-only (no DOM, no <title>, no focus — §9 would have to be rebuilt),
    90% unused surface.
  WebGL.
    Unjustifiable at ~3800 elements; adds a driver/blocklist failure mode inside a webview.
  Per-commodity colour, or any hue derived from a commodity id hash.
    Explicitly forbidden by the brief, and unbounded: commodity ids are arbitrary and
    authored, while the eye resolves about eight hues.
  Writing graph layout into world simulation files.
    Already build-failing via test_webview_payload_whitelist.js:252, and wrong on the
    merits: layout is a view preference about a view, not a fact about the world.

IMPLEMENTATION_SEQUENCE
  SLICE 1  Graph viewport and camera            (85b0-logistics-camera.js;   no src/ change)
  SLICE 2  Stable node layout and persistence   (85b1-logistics-layout.js;   worldView.ts scopeKey)
  SLICE 3  Obstacle-aware route geometry        (85b2-logistics-geometry.js; no src/ change)
  SLICE 4  Factual visual encoding              (85b3-logistics-visual-encoding.js; no src/ change)
  SLICE 5  Filtering, minimap, semantic zoom    (85b3-logistics-minimap.js;  no src/ change)
  SLICE 6  Actual VS Code visual verification   (no feature work; full suite)

  Each slice ships independently and leaves the panel working. Slice 1 alone already
  removes the reported compression, because it deletes the reason the compression exists.
```

---

## Appendix A: implementation handoff prompt (SLICE 1)

```text
Model recommendation: GPT-5.6 Terra
Reasoning level: Medium

Worktree:
C:\AI\worktrees\LoreRelay\world-sim-ux-polish-corrections-001
Base: task/LOGISTICS-GRAPH-CANVAS-ARCHITECTURE-001

Implement only:
SLICE 1 — graph viewport and camera
from docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md §2 and §12.

Before planning verification, follow docs/DEVELOPMENT_VERIFICATION_POLICY.md.
This is Medium risk: webview-only, read-only view, no authoritative state.
Do not escalate beyond that tier without a concrete reason.

Read:
- AGENTS.md
- docs/DEVELOPMENT_VERIFICATION_POLICY.md
- docs/LOGISTICS_GRAPH_CANVAS_ARCHITECTURE.md  (§1, §2, §12 SLICE 1)
- webview/modules/85b-economy-logistics.js
- webview/styles/85b-economy-logistics.css
- webview/modules/86b-settlement-isometric.js  (pan/zoom precedent)
- scripts/build-webview.js
- scripts/test_economy_logistics_webview.js

Create:
- webview/modules/85b0-logistics-camera.js     (pure camera math; no DOM, no vscode)
- scripts/test_logistics_camera.js

Edit:
- webview/modules/85b-economy-logistics.js     (wire the camera; split render from applyCamera)
- webview/styles/85b-economy-logistics.css     (remove max-height:520px; toolbar; camera var)
- scripts/build-webview.js                     (register 85b0 before 85b)
- locales/{en,ja,zh-CN,zh-TW}.json             (camera command strings)
- scripts/run_all_tests.js                     (register the focused test)

Regenerate and commit the build outputs:
- node scripts/build-webview.js  →  webview/script.js, webview/style.css
Never hand-edit those two files.

Do NOT change anything under src/. Do NOT change node layout, route geometry, or
colour. Do NOT add a dependency. Do NOT bump the version or touch CHANGELOG.

Required behavior:
- one <g class="logistics-camera"> carries translate/scale; the SVG viewBox becomes
  viewport-sized, not content-sized;
- pointer-centred wheel zoom: the world point under the cursor must not move;
- zoom clamped to [0.25, 3.0]; clamping must not translate the camera;
- pan by background drag, middle drag, Space+drag, and arrow keys (Shift x4);
- fit all / fit selection / centre selected / zoom in / zoom out;
- a data push must NEVER move the camera (see §2.6 for the single narrow exception);
- a camera change writes ONLY the group transform and --logistics-camera-k,
  and must not call renderEconomyLogisticsPanel();
- camera persists to lorerelay.logistics.camera.v1.<scopeKey>, scopeKey='default'
  for this slice; all storage in try/catch, degrading to in-memory;
- invalid stored camera (NaN, k out of range, v mismatch, bad JSON) -> fit all,
  never throw;
- honour prefers-reduced-motion: no eased camera moves.

Verification limit:
    npm run compile
    node scripts/build-webview.js
    node scripts/test_logistics_camera.js
    node scripts/test_economy_logistics_webview.js

Run each at most once unless code changes after a concrete failure.
Do not run npm test, soak commands, or full-suite verification in this slice.

The worktree may contain unrelated user changes. Preserve them exactly.
Stop before commit and push.

Report:
- changed files;
- implementation summary;
- commands run;
- compile result;
- focused-test result;
- remaining issues or assumptions;
- confirmation that no commit or push was performed.
```
