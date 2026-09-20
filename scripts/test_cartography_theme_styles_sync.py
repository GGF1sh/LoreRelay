#!/usr/bin/env python3
"""Ensure Python theme resolver matches src/cartographyThemeStyles.json."""
from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from cartography_theme_styles import resolve_theme_style  # noqa: E402

failed = 0


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def fail(msg: str) -> None:
    global failed
    print(f"FAIL: {msg}", file=sys.stderr)
    failed += 1


def main() -> int:
    data = json.loads((REPO_ROOT / "src" / "cartographyThemeStyles.json").read_text(encoding="utf-8"))
    cases = [
        ("cyberpunk", data["rules"][0]),
        ("sci-fi-colony", data["rules"][1]),
        ("postapoc", data["rules"][2]),
        ("cosmic-horror", data["rules"][3]),
        ("zombie-horror", data["rules"][4]),
        ("modern", data["rules"][5]),
        ("steampunk-victorian", data["rules"][6]),
        ("oriental-fantasy", data["rules"][7]),
        ("ff14-style", data["rules"][8]),
        ("beginner-fantasy", data["default"]),
    ]
    for theme, expected in cases:
        got = resolve_theme_style(theme)
        want = (expected["mapType"], expected["renderStyle"], expected["extraNegative"])
        if got != want:
            fail(f"{theme}: {got!r} != {want!r}")
        else:
            ok(f"theme {theme}")

    if failed:
        print(f"theme style sync: {failed} failure(s)", file=sys.stderr)
        return 1
    print("theme style sync tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())