# Scene prompt composer and image import V1

Open **Illustrate this scene / この場面を絵にする** on a published GM message,
or use either quick image action to open the latest published GM turn.
The composer works without an AI connection, API key or running ComfyUI.

1. Read the unchanged published passage, then edit the separate art direction,
   required features, exclusions, composition, style and aspect ratio (default 16:9).
2. Copy the full prompt to ChatGPT, Gemini, Grok or another tool. The destination
   is a label; no provider is called. Advanced tags and negative text are manually
   editable; there is no automatic translation or model-specific conversion.
3. Save the draft or export UTF-8 text. Prompt copy/export also saves the draft.
4. Drop one PNG/JPEG/WebP (up to 20 MiB) or choose a file. Optionally record the
   generation service as a user report. Import initially means **gallery only**.
5. Adopt the candidate as that turn's image or as the current background. Each
   target can be replaced or removed without deleting the candidate/source file.
   Gallery thumbnails reopen the composer, including drafts from invalidated turns.

The original turn remains fixed while play advances. Missing or edited source text,
a timeline epoch change (including Undo), or a different campaign invalidates its
presentation binding. Images remain stored; they never move to the newest turn.
Existing ComfyUI configuration, queue, retry/regeneration and VLM features remain
available through their existing controls.

## Persistence and authority

`.text-adventure/visuals/presentation.json` has schemaVersion 1, with `drafts`,
`candidates` and `bindings`. Pixel files use SHA-256 names; identical bytes are
stored once while different briefs retain separate candidate receipts.

Brief sources contain campaign/session, timeline epoch, turn ID, exact public text
and its hash. An existing accepted identity is recorded when available. Legacy
histories without a scope use a workspace-derived legacy session; no canonical
scope/ledger is created or repaired by this feature, and no historical revision
is fabricated. Candidate receipts freeze the brief, prompt and hashes, creation
time and user-reported service. Unknown model, seed and cost are not inferred.

Presentation writes use a dedicated synchronous lock and atomic manifest rename;
no lock is held across a file dialog. Symlink/junction store paths and invalid
image containers are rejected. A process crash while holding `write.lock` fails
closed on the next write; remove that lock only after confirming no writer is
active. Original imported files are never modified.

Each candidate offers Delete image with an inline confirmation. Deleting removes
the candidate and its turn/background assignments from the saved gallery. Drafts,
original files and managed image bytes are retained (pixels may be shared by
other candidates); this action does not reclaim disk space. Reimporting remains
possible.

The local webview route accepts IDs, edits and bounded image bytes, not a source
context or destination filesystem path. It rechecks host history and workspace.
Only published GM text is used; no world, NPC-secret or model prompt data is read
to build the brief. Presentation overlays never enter `messageHistory`, canonical
state, `visual_memory.json` or its automatic image-analysis-to-GM prompt path.
There is no remote/MCP interface or paid/provider fallback in this version.

## Validation

`node scripts/test_visual_composer.js` exercises the real compiled host/core/store
with temporary files and native UI stubs: public-only context, full-length text,
copy/export, image validation, deduplication, immutable receipts, adoption/removal,
replacement, stale turns, campaign isolation, workspace changes during dialogs,
restart readback and unchanged canonical files. The suite is registered with
`consumesCompiledOutput: true`; compile before running it directly.

The browser smoke test uses the actual composer module, host and store with a
synthetic harbor passage and an existing preview asset. It verifies editing,
copy, import, adoption, reload, and inactive-turn gallery retention. Native file
dialogs are stubbed; this is not a claim of a real Extension Host GUI smoke pass.
