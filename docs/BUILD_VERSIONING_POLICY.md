# LoreRelay Build Versioning Policy

- Source-only commits that do not produce an installable VSIX do not require a version bump.
- Every VSIX intended for human installation must have a unique embedded extension version.
- Rebuilding materially different code with the same package version is prohibited.
- Normal human-test builds increment the patch version.
- Completed feature milestones may increment the minor version.
- Artifact filenames must include the actual embedded manifest version.
- Old VSIX files must not be assigned invented versions merely by renaming.
- The currently recommended install must be placed under the explicit `current` artifact directory.
- Superseded builds belong under `archive`.
- Packaging instructions must never say “do not bump version” when producing an installable human-test VSIX.
