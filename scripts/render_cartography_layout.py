#!/usr/bin/env python3
"""
Render a ControlNet layout mask PNG from world_forge.json cartography data.

Uses biome-colored region blobs + connection lines on parchment-tinted background.
Stdlib-only (zlib/struct); optional Pillow not required.

Usage:
  python render_cartography_layout.py <world_forge.json> [output.png] [--size 1024]
"""
from __future__ import annotations

import json
import math
import struct
import sys
import zlib
from pathlib import Path

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
LINE_RGB = (40, 28, 18)


def clamp_map(v: float) -> int:
    return max(0, min(MAP_SIZE, int(round(v))))


def map_to_px(coord: int, size: int) -> int:
    return int((clamp_map(coord) / MAP_SIZE) * (size - 1))


def infer_biome(region: dict) -> str:
    biome = region.get("biome")
    if isinstance(biome, str) and biome in BIOME_RGB:
        return biome
    rtype = region.get("type", "other")
    mapping = {
        "forest": "forest",
        "mountains": "mountain",
        "ocean": "sea",
        "urban": "city",
        "ruins": "ruins",
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

    def draw_line(self, x0: int, y0: int, x1: int, y1: int, rgb: tuple[int, int, int]) -> None:
        dx = abs(x1 - x0)
        dy = -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            for oy in (-1, 0, 1):
                for ox in (-1, 0, 1):
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


def render_layout(spec: dict) -> bytes:
    size = spec["size"]
    canvas = Canvas(size, size, PARCHMENT)
    by_id = {r["id"]: r for r in spec["regions"]}

    for a, b in spec["edges"]:
        ra, rb = by_id.get(a), by_id.get(b)
        if not ra or not rb:
            continue
        x0, y0 = map_to_px(ra["x"], size), map_to_px(ra["y"], size)
        x1, y1 = map_to_px(rb["x"], size), map_to_px(rb["y"], size)
        canvas.draw_line(x0, y0, x1, y1, LINE_RGB)

    for r in spec["regions"]:
        rgb = BIOME_RGB.get(r["biome"], BIOME_RGB["other"])
        cx, cy = map_to_px(r["x"], size), map_to_px(r["y"], size)
        pr = int(r["radius"] / MAP_SIZE * size)
        canvas.fill_circle(cx, cy, max(12, pr), rgb)

    return canvas.to_png()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 1

    forge_path = Path(sys.argv[1])
    out_path = Path(sys.argv[2]) if len(sys.argv) >= 3 and not sys.argv[2].startswith("--") else forge_path.with_suffix(".layout.png")
    size = DEFAULT_SIZE
    args = sys.argv[2:]
    if "--size" in args:
        idx = args.index("--size")
        if idx + 1 < len(args):
            size = int(args[idx + 1])

    if not forge_path.is_file():
        print(f"Error: not found: {forge_path}", file=sys.stderr)
        return 1

    spec = load_spec(forge_path, size)
    png = render_layout(spec)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(png)
    print(str(out_path.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())