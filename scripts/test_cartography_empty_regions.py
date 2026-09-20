#!/usr/bin/env python3
"""Empty geography.regions must not crash Voronoi layout rendering."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from render_cartography_layout import render_layout, load_spec  # noqa: E402

failed = 0


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def fail(msg: str) -> None:
    global failed
    print(f"FAIL: {msg}", file=sys.stderr)
    failed += 1


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lr-empty-voronoi-") as tmp:
        root = Path(tmp)
        forge = root / "world_forge.json"
        forge.write_text(
            json.dumps({
                "format": "lorerelay-world-forge/1.0",
                "meta": {"worldName": "Empty", "theme": "fantasy"},
                "geography": {"regions": [], "locations": []},
            }),
            encoding="utf-8",
        )
        try:
            spec = load_spec(forge, 256)
            png = render_layout(spec, layout_mode="voronoi")
        except Exception as exc:
            fail(f"voronoi empty regions raised: {exc}")
            png = b""
        else:
            ok("voronoi empty regions does not crash")

        if len(png) < 100:
            fail("voronoi empty regions PNG too small")
        else:
            ok("voronoi empty regions PNG emitted")

    if failed:
        print(f"empty regions tests: {failed} failure(s)", file=sys.stderr)
        return 1
    print("empty regions tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())