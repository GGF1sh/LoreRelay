#!/usr/bin/env python3
"""
Memory Bank CLI — TF-IDF インデックスの再構築 / 関連メモリの検索。

Usage:
  python memory_bank.py --cwd . --rebuild
  python memory_bank.py --cwd . --resolve --text "酒場 盗賊"
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from memory_chroma import resolve_memory_backend
from memory_common import build_memory_context, match_memories, rebuild_memory_index


def main():
    parser = argparse.ArgumentParser(description="Text Adventure memory bank")
    parser.add_argument("--cwd", default=".", help="Workspace path")
    parser.add_argument("--rebuild", action="store_true", help="Rebuild memories/index.json")
    parser.add_argument("--resolve", action="store_true", help="Match memories for --text")
    parser.add_argument("--text", default="", help="Hint text for --resolve")
    parser.add_argument("--max", type=int, default=3, help="Max matches for --resolve")
    parser.add_argument(
        "--backend",
        default="",
        help="tfidf | chromadb | auto (default: TA_MEMORY_BACKEND or auto)",
    )
    parser.add_argument("--json", action="store_true", help="Output --resolve results as JSON")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    backend = args.backend.strip() or None

    if args.rebuild:
        out = rebuild_memory_index(cwd, backend=backend)
        raw = json.loads(out.read_text(encoding="utf-8"))
        print(
            f"Rebuilt {raw.get('chunkCount', 0)} chunks "
            f"(backend={raw.get('backend', resolve_memory_backend(backend))}) -> {out}"
        )
        return

    if args.resolve:
        if not args.text.strip():
            print("Provide --text for --resolve", file=sys.stderr)
            sys.exit(1)
        matches = match_memories(cwd, args.text, max_results=max(1, args.max), backend=backend)
        if args.json:
            print(json.dumps(matches, ensure_ascii=False))
            return
        ctx = build_memory_context(cwd, args.text, max_results=max(1, args.max), backend=backend)
        if ctx:
            print(ctx)
        else:
            print("(no matches)")
        print(f"\n{len(matches)} match(es)", file=sys.stderr)
        return

    parser.print_help()


if __name__ == "__main__":
    main()