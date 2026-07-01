#!/usr/bin/env python3
"""
Render a ControlNet layout mask PNG from world_forge.json cartography data.

Uses Voronoi biome regions (default), legacy circles, or lineart masks for ControlNet.
Stdlib-only (zlib/struct); optional Pillow not required.

Usage:
  python render_cartography_layout.py <world_forge.json> [output.png] [--size 1024]
    [--layout-mode voronoi|lineart|full|roads]
"""
from __future__ import annotations

import json
import math
import struct
import sys
import zlib
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
from cartography_path_utils import (  # noqa: E402
    WORLD_FORGE_BASENAME,
    WORLD_MAP_LAYOUT_BASENAME,
    validate_forge_path,
    validate_layout_output_path,
)

MAP_SIZE = 1000
DEFAULT_SIZE = 1024

BIOME_RGB = {
    "forest": (34, 120, 52),
    "desert": (210, 176, 72),
    "mountain": (120, 108, 96),
    "sea": (32, 72, 168),
    "coast": (64, 148, 188),
    "city": (196, 92, 40),
    "plains": (148, 188, 72),
    "swamp": (56, 96, 64),
    "wasteland": (168, 132, 88),
    "ruins": (108, 88, 72),
    "dungeon": (72, 56, 88),
    "underground": (56, 48, 72),
    "snow": (208, 220, 232),
    "volcanic": (168, 48, 32),
    "other": (128, 128, 128),
}

PARCHMENT = (228, 210, 176)
WHITE = (252, 248, 240)
LINE_RGB = (40, 28, 18)
BORDER_RGB = (24, 16, 10)


def clamp_map(v: float) -> int:
    return max(0, min(MAP_SIZE, int(round(v))))


def map_to_px(coord: int, size: int) -> int:
    return int((clamp_map(coord) / MAP_SIZE) * (size - 1))


def infer_biome(region: dict) -> str:
    biome = region.get("biome")
    if isinstance(biome, str):
        alias = {
            "grassland": "plains",
            "grass": "plains",
            "lake": "sea",
            "river": "coast",
            "ocean": "sea",
        }
        biome = alias.get(biome, biome)
        if biome in BIOME_RGB:
            return biome
    rtype = region.get("type", "other")
    mapping = {
        "forest": "forest",
        "mountains": "mountain",
        "plains": "plains",
        "ocean": "sea",
        "water": "sea",
        "urban": "city",
        "settlement": "city",
        "ruins": "ruins",
        "cave": "dungeon",
        "dungeon": "dungeon",
        "wilderness": "plains",
    }
    return mapping.get(rtype, "other")


def region_radius(biome: str) -> int:
    if biome == "sea":
        return 96
    if biome == "city":
        return 48
    if biome == "mountain":
        return 80
    return 72


def fallback_pos(index: int, total: int) -> tuple[int, int]:
    angle = (2 * math.pi * index / max(1, total)) - math.pi / 2
    radius = 220 if total <= 4 else 300
    return (
        clamp_map(500 + math.cos(angle) * radius),
        clamp_map(500 + math.sin(angle) * radius),
    )


def load_spec(path: Path, size: int) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    regions_raw = data.get("geography", {}).get("regions", [])
    regions = []
    for i, r in enumerate(regions_raw):
        if not isinstance(r, dict) or not r.get("id"):
            continue
        biome = infer_biome(r)
        if isinstance(r.get("x"), (int, float)) and isinstance(r.get("y"), (int, float)):
            x, y = clamp_map(r["x"]), clamp_map(r["y"])
        else:
            x, y = fallback_pos(i, len(regions_raw))
        regions.append({
            "id": r["id"],
            "name": r.get("name", r["id"]),
            "biome": biome,
            "x": x,
            "y": y,
            "radius": region_radius(biome),
            "connectedTo": r.get("connectedTo") or [],
        })

    by_id = {r["id"]: r for r in regions}
    seen = set()
    edges = []
    for r in regions:
        for tid in r["connectedTo"]:
            if tid not in by_id:
                continue
            key = tuple(sorted((r["id"], tid)))
            if key in seen:
                continue
            seen.add(key)
            edges.append((r["id"], tid))

    return {
        "worldName": data.get("meta", {}).get("worldName", "World"),
        "theme": data.get("meta", {}).get("theme"),
        "size": size,
        "regions": regions,
        "edges": edges,
    }


class Canvas:
    def __init__(self, width: int, height: int, bg: tuple[int, int, int]):
        self.w = width
        self.h = height
        self.pixels = bytearray(c for _ in range(width * height) for c in bg)

    def set_px(self, x: int, y: int, rgb: tuple[int, int, int]) -> None:
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            self.pixels[i : i + 3] = bytes(rgb)

    def fill_circle(self, cx: int, cy: int, radius: int, rgb: tuple[int, int, int]) -> None:
        r2 = radius * radius
        for y in range(max(0, cy - radius), min(self.h, cy + radius + 1)):
            for x in range(max(0, cx - radius), min(self.w, cx + radius + 1)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    self.set_px(x, y, rgb)

    def stroke_circle(self, cx: int, cy: int, radius: int, rgb: tuple[int, int, int], width: int = 2) -> None:
        for ring in range(width):
            r = max(1, radius - ring)
            r2_outer = r * r
            r2_inner = max(0, (r - 1) * (r - 1))
            for y in range(max(0, cy - r), min(self.h, cy + r + 1)):
                for x in range(max(0, cx - r), min(self.w, cx + r + 1)):
                    d2 = (x - cx) ** 2 + (y - cy) ** 2
                    if r2_inner < d2 <= r2_outer:
                        self.set_px(x, y, rgb)

    def draw_line(self, x0: int, y0: int, x1: int, y1: int, rgb: tuple[int, int, int]) -> None:
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            for oy in range(-2, 3):
                for ox in range(-2, 3):
                    self.set_px(x0 + ox, y0 + oy, rgb)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def to_png(self) -> bytes:
        raw = b"".join(
            b"\x00" + self.pixels[y * self.w * 3 : (y + 1) * self.w * 3]
            for y in range(self.h)
        )
        compressed = zlib.compress(raw, 9)

        def chunk(tag: bytes, data: bytes) -> bytes:
            return (
                struct.pack(">I", len(data))
                + tag
                + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
            )

        ihdr = struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)
        return b"".join([
            b"\x89PNG\r\n\x1a\n",
            chunk(b"IHDR", ihdr),
            chunk(b"IDAT", compressed),
            chunk(b"IEND", b""),
        ])


def build_voronoi_owner_grid(regions: list, size: int) -> list[int]:
    """Nearest-seed Voronoi: pixel owner index per cell (flat row-major)."""
    if not regions:
        return [0] * (size * size)
    seeds = [
        (map_to_px(r["x"], size), map_to_px(r["y"], size), i)
        for i, r in enumerate(regions)
    ]
    owners = [0] * (size * size)
    for y in range(size):
        row_off = y * size
        for x in range(size):
            best_d = 10**12
            best_i = 0
            for sx, sy, idx in seeds:
                d = (x - sx) * (x - sx) + (y - sy) * (y - sy)
                if d < best_d:
                    best_d = d
                    best_i = idx
            owners[row_off + x] = best_i
    return owners


def paint_voronoi_regions(canvas: Canvas, regions: list, owners: list[int], size: int) -> None:
    for y in range(size):
        row_off = y * size
        for x in range(size):
            region = regions[owners[row_off + x]]
            rgb = BIOME_RGB.get(region["biome"], BIOME_RGB["other"])
            canvas.set_px(x, y, rgb)


def stroke_voronoi_borders(canvas: Canvas, owners: list[int], size: int, rgb: tuple[int, int, int], width: int = 2) -> None:
    """Paint Voronoi cell borders; width thickens perpendicular to the edge."""
    half = max(0, width - 1)
    for y in range(size):
        row_off = y * size
        for x in range(size):
            idx = owners[row_off + x]
            if x + 1 < size and owners[row_off + x + 1] != idx:
                for oy in range(-half, half + 1):
                    py = y + oy
                    if 0 <= py < size:
                        canvas.set_px(x, py, rgb)
                        canvas.set_px(x + 1, py, rgb)
            if y + 1 < size and owners[(y + 1) * size + x] != idx:
                for ox in range(-half, half + 1):
                    px = x + ox
                    if 0 <= px < size:
                        canvas.set_px(px, y, rgb)
                        canvas.set_px(px, y + 1, rgb)


def draw_region_centers(canvas: Canvas, regions: list, size: int, rgb: tuple[int, int, int]) -> None:
    for r in regions:
        cx, cy = map_to_px(r["x"], size), map_to_px(r["y"], size)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                canvas.set_px(cx + dx, cy + dy, rgb)


def draw_road_network(canvas: Canvas, spec: dict, rgb: tuple[int, int, int]) -> None:
    """Legacy straight center-to-center roads (full/roads modes)."""
    size = spec["size"]
    by_id = {r["id"]: r for r in spec["regions"]}
    for a, b in spec["edges"]:
        ra, rb = by_id.get(a), by_id.get(b)
        if not ra or not rb:
            continue
        x0, y0 = map_to_px(ra["x"], size), map_to_px(ra["y"], size)
        x1, y1 = map_to_px(rb["x"], size), map_to_px(rb["y"], size)
        canvas.draw_line(x0, y0, x1, y1, rgb)


def draw_border_roads(
    canvas: Canvas,
    spec: dict,
    owners: list[int],
    regions: list,
    size: int,
    rgb: tuple[int, int, int],
) -> None:
    """Paint roads along shared Voronoi borders between connected regions (no star spokes)."""
    region_to_idx = {r["id"]: i for i, r in enumerate(regions)}
    seen: set[tuple[str, str]] = set()
    for a_id, b_id in spec["edges"]:
        key = tuple(sorted((a_id, b_id)))
        if key in seen:
            continue
        seen.add(key)
        ia = region_to_idx.get(a_id)
        ib = region_to_idx.get(b_id)
        if ia is None or ib is None:
            continue
        for y in range(size):
            row_off = y * size
            for x in range(size):
                if owners[row_off + x] != ia:
                    continue
                if x + 1 < size and owners[row_off + x + 1] == ib:
                    for oy in range(-2, 3):
                        canvas.set_px(x, y + oy, rgb)
                        canvas.set_px(x + 1, y + oy, rgb)
                if y + 1 < size and owners[(y + 1) * size + x] == ib:
                    for ox in range(-2, 3):
                        canvas.set_px(x + ox, y, rgb)
                        canvas.set_px(x + ox, y + 1, rgb)


def render_voronoi_layout(spec: dict, lineart_only: bool = False) -> bytes:
    size = spec["size"]
    regions = spec["regions"]
    bg = WHITE if lineart_only else PARCHMENT
    canvas = Canvas(size, size, bg)
    if not regions:
        return canvas.to_png()

    owners = build_voronoi_owner_grid(regions, size)

    if not lineart_only:
        paint_voronoi_regions(canvas, regions, owners, size)

    stroke_voronoi_borders(canvas, owners, size, BORDER_RGB, width=2)
    draw_border_roads(canvas, spec, owners, regions, size, LINE_RGB)
    return canvas.to_png()


def render_layout(spec: dict, layout_mode: str = "voronoi") -> bytes:
    """layout_mode: voronoi | lineart | full | roads"""
    if layout_mode in ("voronoi", "lineart"):
        return render_voronoi_layout(spec, lineart_only=(layout_mode == "lineart"))

    size = spec["size"]
    canvas = Canvas(size, size, PARCHMENT)
    by_id = {r["id"]: r for r in spec["regions"]}
    draw_road_network(canvas, spec, LINE_RGB)

    if layout_mode == "roads":
        draw_region_centers(canvas, spec["regions"], size, LINE_RGB)
        return canvas.to_png()

    for r in spec["regions"]:
        rgb = BIOME_RGB.get(r["biome"], BIOME_RGB["other"])
        cx, cy = map_to_px(r["x"], size), map_to_px(r["y"], size)
        pr = int(r["radius"] / MAP_SIZE * size)
        canvas.fill_circle(cx, cy, max(12, pr), rgb)
        canvas.stroke_circle(cx, cy, max(12, pr), LINE_RGB, width=3)

    return canvas.to_png()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 1

    forge_path = Path(sys.argv[1])
    size = DEFAULT_SIZE
    layout_mode = "voronoi"
    args = sys.argv[2:]
    if "--size" in args:
        idx = args.index("--size")
        if idx + 1 < len(args):
            size = int(args[idx + 1])
    if "--layout-mode" in args:
        idx = args.index("--layout-mode")
        if idx + 1 < len(args):
            layout_mode = args[idx + 1].strip().lower()
    if layout_mode not in ("voronoi", "lineart", "full", "roads"):
        print(
            f"Error: unknown --layout-mode {layout_mode!r} (use voronoi, lineart, full, or roads)",
            file=sys.stderr,
        )
        return 1

    workspace_root = forge_path.parent if forge_path.name == WORLD_FORGE_BASENAME else None
    try:
        forge_path = validate_forge_path(forge_path, workspace_root)
        if workspace_root is None:
            workspace_root = forge_path.parent
        else:
            workspace_root = workspace_root.resolve()
        if len(sys.argv) >= 3 and not sys.argv[2].startswith("--"):
            out_path = validate_layout_output_path(Path(sys.argv[2]), workspace_root)
        else:
            out_path = validate_layout_output_path(
                workspace_root / WORLD_MAP_LAYOUT_BASENAME,
                workspace_root,
            )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    spec = load_spec(forge_path, size)
    png = render_layout(spec, layout_mode=layout_mode)
    out_path.write_bytes(png)
    print(str(out_path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())