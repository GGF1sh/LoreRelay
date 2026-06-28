"""Path safety helpers for cartography CLI scripts (stdlib only)."""
from __future__ import annotations

import os
from pathlib import Path

WORLD_FORGE_BASENAME = "world_forge.json"
WORLD_MAP_IMAGE_BASENAME = "world_map.png"
WORLD_MAP_LAYOUT_BASENAME = "world_map.layout.png"


def _is_under_root(resolved: Path, root: Path) -> bool:
    try:
        resolved.relative_to(root)
        return True
    except ValueError:
        return resolved == root


def validate_forge_path(forge_path: Path, workspace_root: Path | None = None) -> Path:
    resolved = forge_path.resolve()
    if resolved.name != WORLD_FORGE_BASENAME:
        raise ValueError(f"forge path must be named {WORLD_FORGE_BASENAME}")
    if not resolved.is_file():
        raise ValueError(f"world_forge not found: {resolved}")
    if workspace_root is not None:
        root = workspace_root.resolve()
        if not _is_under_root(resolved, root):
            raise ValueError("world_forge.json must be inside the workspace root")
    return resolved


def validate_output_dir(output_dir: Path, workspace_root: Path | None = None) -> Path:
    resolved = output_dir.resolve()
    if workspace_root is not None:
        root = workspace_root.resolve()
        if resolved != root and not _is_under_root(resolved, root):
            raise ValueError("output directory must be the workspace root")
    resolved.mkdir(parents=True, exist_ok=True)
    return resolved


def validate_layout_output_path(output_path: Path, workspace_root: Path) -> Path:
    resolved = output_path.resolve()
    root = workspace_root.resolve()
    if resolved.name not in (WORLD_MAP_LAYOUT_BASENAME, "cartography_layout.png"):
        raise ValueError("layout output must be world_map.layout.png or cartography_layout.png")
    if not _is_under_root(resolved.parent, root):
        raise ValueError("layout output must be inside the workspace root")
    return resolved