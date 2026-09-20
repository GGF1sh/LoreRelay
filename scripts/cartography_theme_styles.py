"""Shared cartography theme styles (source: src/cartographyThemeStyles.json)."""
from __future__ import annotations

import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent


def _resolve_theme_styles_path() -> Path:
    """Packaged VSIX ships scripts/ but excludes src/ (.vscodeignore)."""
    candidates = [
        SCRIPT_DIR / "cartographyThemeStyles.json",
        REPO_ROOT / "src" / "cartographyThemeStyles.json",
    ]
    for path in candidates:
        if path.is_file():
            return path
    raise FileNotFoundError(
        "cartographyThemeStyles.json not found. Expected scripts/ or src/ under extension root."
    )


_cached: dict | None = None


def _load() -> dict:
    global _cached
    if _cached is None:
        _cached = json.loads(_resolve_theme_styles_path().read_text(encoding="utf-8"))
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