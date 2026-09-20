# World generation setup: play presets and overview

The local world setup now offers story, adventure/trade, living-world and
management presets. Ten explicit feature switches and the existing entity-count
controls remain editable. These preferences are only applied when the displayed
world is accepted; preview and reroll do not update campaign rules.

Named user presets store genre, counts, naming language and feature choices in
the extension's persistent user state. They omit the seed so a preset can create
different worlds. Saving an existing name updates it; up to 20 names are retained.

Naming revision 1 is deterministic and local. Japanese names are generated for
worlds, regions, locations, factions and NPCs when Japanese is selected. Naming
does not alter IDs, topology or gameplay numbers. Existing worlds are never
renamed merely by opening setup or changing UI language. The locale and switches
are retained in optional generation provenance for reproduction. English legacy
generation with no experience options is unchanged. This is naming support, not
AI translation of the complete generated lore and descriptions.

The overview draws the actual region coordinates and connections, with selectable
regional location lists and faction names. It is a schematic, not generated
terrain artwork. The accepted world's overview is available on reopening setup.
The reroll button creates and previews a new seed in one click, including from
the preview card. Neither overview is an image-generation request.

Validation: the setup's existing save/preview parity tests and the new experience
test cover deterministic names, reload, unchanged topology, rule selection,
cancel/stale-input rejection and named-preset host persistence. Browser smoke uses
the actual setup markup/modules with synthetic host replies; it does not establish
a native VS Code dropdown or complete live Extension Host acceptance pass.
