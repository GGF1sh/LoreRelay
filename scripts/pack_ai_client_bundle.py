"""Archive an existing MCPB build; never overwrite an existing artifact."""
import json
import pathlib
import sys
import zipfile

if len(sys.argv) != 3:
    raise SystemExit("usage: python scripts/pack_ai_client_bundle.py BUILD_DIRECTORY NEW_FILE.mcpb")
source = pathlib.Path(sys.argv[1]).resolve(strict=True)
destination = pathlib.Path(sys.argv[2]).resolve()
if destination.suffix != ".mcpb" or destination.is_relative_to(source):
    raise SystemExit("output must be a new .mcpb file outside the source directory")
manifest = json.loads((source / "manifest.json").read_text(encoding="utf-8"))
if manifest.get("manifest_version") != "0.3":
    raise SystemExit("unsupported manifest version")
files = sorted(source.rglob("*"))
if any(p.is_symlink() or not p.resolve().is_relative_to(source) for p in files):
    raise SystemExit("links outside the bundle are not allowed")
with zipfile.ZipFile(destination, "x", zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        if file.is_file():
            archive.write(file, file.relative_to(source).as_posix())
print(destination)
