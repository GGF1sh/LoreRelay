"""Shared cartography theme styles (source: src/cartographyThemeStyles.json)."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
THEME_STYLES_PATH = REPO_ROOT / "src" / "cartographyThemeStyles.json"

_cached: dict | None = None


def _load() -> dict:
    global _cached
    if _cached is None:
        _cached = json.loads(THEME_STYLES_PATH.read_text(encoding="utf-8"))
    return _cached


def normalize_theme_key(theme: str) -> str:
    return theme.lower().replace(" ", "-").replace("_", "-")


def resolve_theme_style(theme: str) -> tuple[str, str, str]:
    """Returns (map_type, render_style, extra_negative)."""
    key = normalize_theme_key(theme)
    data = _load()
    for rule in data.get("rules", []):
        exact = rule.get("matchExact") or []
        if any(key == e for e in exact):
            return rule["mapType"], rule["renderStyle"], rule["extraNegative"]
        for fragment in rule.get("matchAny") or []:
            if fragment in key:
                return rule["mapType"], rule["renderStyle"], rule["extraNegative"]
    default = data["default"]
    return default["mapType"], default["renderStyle"], default["extraNegative"]