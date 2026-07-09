#!/usr/bin/env python3
"""
Match lorebook entries against text (SillyTavern World Info style).

Usage:
  python resolve_lorebook.py --cwd <workspace> --text "tavern fight"
  python resolve_lorebook.py --file lorebook.json --text "keyword"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_lorebook(cwd: Path, explicit: str | None) -> list[dict]:
    paths = []
    if explicit:
        paths.append(Path(explicit))
    paths.extend([cwd / "lorebook.json", cwd / "world_info.json"])

    for p in paths:
        if p.is_file():
            try:
                raw = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(raw, dict) and isinstance(raw.get("entries"), list):
                    return [e for e in raw["entries"] if e.get("enabled", True)]
            except (json.JSONDecodeError, OSError):
                pass
    return []


def match_entries(entries: list[dict], text: str, max_entries: int = 5) -> list[dict]:
    hay = text.lower()
    hits: list[tuple[int, dict]] = []
    for entry in entries:
        keys = entry.get("keys") or []
        if isinstance(keys, str):
            keys = [keys]
        matched = False
        for key in keys:
            k = str(key).strip().lower()
            if k and k in hay:
                matched = True
                break
        if matched:
            hits.append((int(entry.get("priority") or 0), entry))
    hits.sort(key=lambda x: -x[0])
    return [e for _, e in hits[:max_entries]]


def format_context(matches: list[dict]) -> str:
    if not matches:
        return ""
    parts = ["[Lorebook — matched entries]"]
    for e in matches:
        label = e.get("comment") or e.get("id") or "entry"
        parts.append(f"--- {label} ---")
        parts.append(str(e.get("content") or "").strip())
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve lorebook keyword matches")
    parser.add_argument("--cwd", default=".", help="Workspace root")
    parser.add_argument("--file", default="", help="Explicit lorebook.json path")
    parser.add_argument("--text", required=True, help="Text to scan for keywords")
    parser.add_argument("--max", type=int, default=5)
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    entries = load_lorebook(cwd, args.file or None)
    matches = match_entries(entries, args.text, args.max)
    print(format_context(matches))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())