#!/usr/bin/env python3
"""
Saga Archiver — 古い game_history.json を散文の「章」に圧縮。
Bannerlord ChatSyncAuto の Saga Archiver を参考にした実装。

保存先:
  sagas/chapter-NNN.json       … LLM が書いた章テキスト
  sagas/verbatim/chapter-NNN.json … 生ログ（必ず残す）

Usage:
  python archive_saga.py --provider grok --cwd .
  python archive_saga.py --provider ollama --turns 12 --min-entries 20
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from bridge_llm import complete_text
from memory_common import (
    SAGA_FORMAT,
    SAGA_INDEX_FORMAT,
    load_saga_index,
    rebuild_memory_index,
    sagas_dir,
)

try:
    from gm_bridge_common import load_json_file
except ImportError:
    def load_json_file(path: Path):
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None


def format_history_batch(entries: list[dict]) -> str:
    lines: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        content = str(entry.get("content") or "").strip()
        if not content:
            continue
        sender = entry.get("sender") or entry.get("role") or "Unknown"
        eid = entry.get("id") or "?"
        lines.append(f"[{eid}] {sender}: {content}")
    return "\n\n".join(lines)


def parse_chapter_output(raw: str) -> tuple[str, str]:
    text = (raw or "").strip()
    if not text:
        return "Untitled Chapter", ""
    lines = text.splitlines()
    if lines and lines[0].lstrip().startswith("#"):
        title = lines[0].lstrip("#").strip() or "Untitled Chapter"
        body = "\n".join(lines[1:]).strip()
        return title, body or text
    return "Untitled Chapter", text


def archive_saga(
    provider: str,
    cwd: Path,
    *,
    turns: int = 10,
    min_entries: int = 15,
) -> bool:
    history_path = cwd / "game_history.json"
    history = load_json_file(history_path)
    if not history or not isinstance(history, list):
        print("No game_history.json found to archive.")
        return False

    valid = [e for e in history if isinstance(e, dict) and e.get("content")]
    if len(valid) < min_entries:
        print(f"Need at least {min_entries} history entries to archive (have {len(valid)}).")
        return False

    batch = valid[:turns]
    if len(batch) < 3:
        print("Not enough entries in archive batch.")
        return False

    batch_text = format_history_batch(batch)
    system = (
        "You are a literary chronicler for a text adventure game. "
        "Write past-tense narrative prose. Preserve names, places, and outcomes."
    )
    user_prompt = (
        "Turn the following adventure log entries into one saga chapter.\n"
        "- Write 300–600 words in past tense.\n"
        "- First line MUST be a short title prefixed with '# ' (e.g. '# The Tavern Brawl').\n"
        "- Output ONLY the title line and chapter prose.\n\n"
        f"--- Log entries ---\n{batch_text}\n--- End ---"
    )

    print(f"Archiving {len(batch)} entries via {provider}...", flush=True)
    raw = complete_text(provider, cwd, system, user_prompt, max_tokens=900)
    if not raw:
        print("Failed to generate saga chapter.", file=sys.stderr)
        return False

    title, content = parse_chapter_output(raw)
    if not content:
        print("Empty chapter content.", file=sys.stderr)
        return False

    saga_root = sagas_dir(cwd)
    verbatim_dir = saga_root / "verbatim"
    saga_root.mkdir(parents=True, exist_ok=True)
    verbatim_dir.mkdir(parents=True, exist_ok=True)

    index = load_saga_index(cwd)
    chapter_num = int(index.get("nextChapter") or len(index.get("chapters", [])) + 1)
    chapter_id = f"chapter-{chapter_num:03d}"

    source_ids = [str(e.get("id") or "") for e in batch if e.get("id")]
    chapter_doc = {
        "format": SAGA_FORMAT,
        "id": chapter_id,
        "chapter": chapter_num,
        "title": title,
        "content": content,
        "sourceTurnIds": source_ids,
        "entryCount": len(batch),
        "archivedAt": datetime.now(timezone.utc).isoformat(),
    }

    (saga_root / f"{chapter_id}.json").write_text(
        json.dumps(chapter_doc, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (verbatim_dir / f"{chapter_id}.json").write_text(
        json.dumps(batch, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    chapters = list(index.get("chapters", []))
    chapters.append(chapter_id)
    index.update({
        "format": SAGA_INDEX_FORMAT,
        "chapters": chapters,
        "nextChapter": chapter_num + 1,
    })
    (saga_root / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    archived_ids = {id_ for id_ in source_ids if id_}
    remaining = [e for e in history if not (isinstance(e, dict) and e.get("id") in archived_ids)]
    history_path.write_text(json.dumps(remaining, ensure_ascii=False, indent=2), encoding="utf-8")

    mem_path = rebuild_memory_index(cwd)
    print(f"\n--- {title} ---")
    print(content[:500] + ("..." if len(content) > 500 else ""))
    print(f"\nSaved {chapter_id}. Removed {len(batch)} entries from game_history.json.")
    print(f"Verbatim log: sagas/verbatim/{chapter_id}.json")
    print(f"Memory index rebuilt: {mem_path}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Archive old history into saga chapters")
    parser.add_argument("--cwd", default=".", help="Workspace path")
    parser.add_argument("--provider", required=True, help="grok | ollama | koboldcpp | openrouter")
    parser.add_argument("--turns", type=int, default=10, help="Entries to archive from the start")
    parser.add_argument("--min-entries", type=int, default=15, help="Minimum history length required")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    ok = archive_saga(
        args.provider,
        cwd,
        turns=max(3, args.turns),
        min_entries=max(5, args.min_entries),
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()