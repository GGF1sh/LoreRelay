#!/usr/bin/env python3
"""
Import SillyTavern World Info / Lorebook JSON into text-adventure-lorebook/1.0 format.

Usage:
  python import_st_lorebook.py path/to/world_info.json --out lorebook.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def normalize_keys(entry: dict) -> list[str]:
    keys: list[str] = []
    for field in ("keys", "key", "keysecondary"):
        val = entry.get(field)
        if isinstance(val, str) and val.strip():
            keys.append(val.strip())
        elif isinstance(val, list):
            keys.extend(str(k).strip() for k in val if str(k).strip())
    return list(dict.fromkeys(keys))


def convert_st_lorebook(raw: Any) -> dict:
    entries_out: list[dict] = []

    if isinstance(raw, dict) and "entries" in raw:
        entries_raw = raw["entries"]
        if isinstance(entries_raw, dict):
            items = sorted(
                entries_raw.items(),
                key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 0,
            )
            for key, entry in items:
                if not isinstance(entry, dict):
                    continue
                if entry.get("disable") is True:
                    continue
                keys = normalize_keys(entry)
                content = str(entry.get("content") or "").strip()
                if not keys or not content:
                    continue
                entries_out.append(
                    {
                        "id": f"entry-{key}",
                        "keys": keys,
                        "content": content,
                        "comment": str(entry.get("comment") or entry.get("name") or ""),
                        "priority": int(entry.get("order") or entry.get("priority") or 100),
                        "enabled": True,
                    }
                )
        elif isinstance(entries_raw, list):
            for i, entry in enumerate(entries_raw):
                if not isinstance(entry, dict) or entry.get("enabled") is False:
                    continue
                keys = normalize_keys(entry)
                content = str(entry.get("content") or "").strip()
                if not keys or not content:
                    continue
                entries_out.append(
                    {
                        "id": entry.get("id") or f"entry-{i}",
                        "keys": keys,
                        "content": content,
                        "comment": str(entry.get("comment") or ""),
                        "priority": int(entry.get("priority") or 100),
                        "enabled": True,
                    }
                )

    entries_out.sort(key=lambda e: -int(e.get("priority") or 0))
    return {
        "format": "text-adventure-lorebook/1.0",
        "source": "sillytavern",
        "entries": entries_out,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Import SillyTavern lorebook / world info")
    parser.add_argument("input", help="ST world_info.json or compatible lorebook JSON")
    parser.add_argument("--out", default="lorebook.json", help="Output path")
    args = parser.parse_args()

    src = Path(args.input).resolve()
    if not src.is_file():
        print(f"Error: not found: {src}", file=sys.stderr)
        return 1

    try:
        raw = json.loads(src.read_text(encoding="utf-8"))
        out = convert_st_lorebook(raw)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    if not out["entries"]:
        print("Warning: no lore entries converted. Check input format.", file=sys.stderr)

    dest = Path(args.out).resolve()
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {dest} ({len(out['entries'])} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())