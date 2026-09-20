#!/usr/bin/env python3
"""Smoke test: Python gm_bridge_common.match_lorebook matches TS lorebookMatcher behavior."""
from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent.parent / "TextAdventureGMSkill" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from gm_bridge_common import is_potentially_evil_regex, match_lorebook  # noqa: E402

ENTRIES = [
    {"id": "e1", "keys": ["dragon"], "comment": "Dragon Lore", "priority": 10},
    {"id": "e2", "keys": ["town"], "use_regex": True, "comment": "Town Regex", "insertion_order": 20},
    {"id": "e3", "keys": ["magic"], "secondary_keys": ["scroll"], "comment": "Magic Scroll", "priority": 5},
    {"id": "e4", "keys": ["[bad("], "use_regex": True, "comment": "Bad Regex", "priority": 1},
]

TEXT = "A dragon roars over the town square"

hits = match_lorebook(ENTRIES, TEXT)
labels = [h.get("comment") or h.get("id") for h in hits]

assert "Dragon Lore" in labels, f"substring miss: {labels}"
assert "Town Regex" in labels, f"regex miss: {labels}"
assert "Magic Scroll" not in labels, f"secondary should not match: {labels}"
assert "Bad Regex" not in labels, f"bad regex should not match as regex: {labels}"
assert labels[0] == "Town Regex", f"insertion_order sort: {labels}"

print("OK: python match_lorebook ST-compatible smoke test")

for evil in [r"(a+)+$", r"(\w+)+", r"(a|a){1,100}", r".*.*.*.*.*"]:
    assert is_potentially_evil_regex(evil), f"python ReDoS guard should flag: {evil}"
print("OK: python is_potentially_evil_regex flags known evil patterns")

evil_entries = [{"keys": [r"(\w+)+"], "content": "evil", "use_regex": True, "enabled": True}]
assert match_lorebook(evil_entries, "a" * 8000, 5) == [], "evil regex should not match via substring fallback"
print("OK: python match_lorebook ReDoS fallback")