#!/usr/bin/env python3
"""Smoke tests for cartography_path_utils (stdlib only)."""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from cartography_path_utils import (  # noqa: E402
    WORLD_FORGE_BASENAME,
    WORLD_MAP_LAYOUT_BASENAME,
    validate_forge_path,
    validate_layout_output_path,
    validate_output_dir,
)

failed = 0


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def fail(msg: str) -> None:
    global failed
    print(f"FAIL: {msg}", file=sys.stderr)
    failed += 1


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="lr-cart-py-") as tmp:
        root = Path(tmp)
        forge = root / WORLD_FORGE_BASENAME
        forge.write_text('{"format":"lorerelay-world-forge/1.0"}', encoding="utf-8")

        try:
            validate_forge_path(forge, root)
            ok("accepts workspace world_forge.json")
        except ValueError:
            fail("should accept workspace world_forge.json")

        try:
            validate_forge_path(root / "evil.json", root)
            fail("should reject wrong basename")
        except ValueError:
            ok("rejects wrong basename")

        try:
            validate_output_dir(root, root)
            ok("accepts workspace as output dir")
        except ValueError:
            fail("should accept workspace as output dir")

        nested = root / "output"
        nested.mkdir()
        try:
            validate_output_dir(nested, root)
            fail("should reject nested output dir")
        except ValueError as exc:
            if "workspace root" in str(exc):
                ok("rejects nested output dir")
            else:
                fail(f"unexpected nested output dir error: {exc}")

        layout = root / WORLD_MAP_LAYOUT_BASENAME
        try:
            validate_layout_output_path(layout, root)
            ok("accepts workspace root layout path")
        except ValueError:
            fail("should accept workspace root layout path")

        nested_layout = nested / WORLD_MAP_LAYOUT_BASENAME
        try:
            validate_layout_output_path(nested_layout, root)
            fail("should reject nested layout path")
        except ValueError as exc:
            if "workspace root" in str(exc):
                ok("rejects nested layout path")
            else:
                fail(f"unexpected nested layout error: {exc}")

    if failed:
        return 1
    print("All cartography path utils tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())