#!/usr/bin/env python3
"""
Import SillyTavern character card (JSON or PNG with embedded 'chara' tEXt) into
Text Adventure CharacterProfile JSON (characters/<id>.json).

Usage:
  python import_st_card.py path/to/card.png --out-dir ./characters
  python import_st_card.py path/to/card.json --out-dir ./characters --set-active
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import struct
import sys
from pathlib import Path


def slugify(name: str) -> str:
    s = re.sub(r"[^\w\s-]", "", name, flags=re.UNICODE).strip().lower()
    s = re.sub(r"[-\s]+", "_", s)
    return s[:48] or "imported_character"


def read_png_chara(path: Path) -> dict | None:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    offset = 8
    while offset + 8 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8].decode("ascii", errors="ignore")
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type not in ("tEXt", "iTXt"):
            continue
        if chunk_type == "tEXt":
            nul = chunk_data.find(b"\x00")
            if nul < 0:
                continue
            key = chunk_data[:nul].decode("latin-1", errors="ignore")
            text = chunk_data[nul + 1 :].decode("latin-1", errors="ignore")
        else:
            # iTXt: keyword\0compression\0lang\0translated\0text
            parts = chunk_data.split(b"\x00", 5)
            if len(parts) < 6:
                continue
            key = parts[0].decode("latin-1", errors="ignore")
            text = parts[5].decode("utf-8", errors="ignore")
        if key not in ("chara", "ccv"):
            continue
        try:
            raw = base64.b64decode(text)
            return json.loads(raw.decode("utf-8"))
        except (json.JSONDecodeError, ValueError):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                continue
    return None


def normalize_st_card(raw: dict) -> dict:
    """ST v2/v3 / CharX → flat character fields."""
    if not isinstance(raw, dict):
        raise ValueError("Invalid card JSON")

    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw

    name = str(data.get("name") or raw.get("name") or "Imported Character").strip()
    description = str(data.get("description") or data.get("appearance") or "").strip()
    personality = str(data.get("personality") or "").strip()
    scenario = str(data.get("scenario") or data.get("world_scenario") or "").strip()
    first_mes = str(data.get("first_mes") or data.get("greeting") or "").strip()
    mes_example = str(data.get("mes_example") or "").strip()
    creator_notes = str(data.get("creator_notes") or data.get("creatorcomment") or "").strip()
    system_prompt = str(data.get("system_prompt") or "").strip()

    if scenario and scenario not in description:
        description = f"{description}\n\n[Scenario]\n{scenario}".strip()
    if creator_notes:
        description = f"{description}\n\n[Creator Notes]\n{creator_notes}".strip()
    if system_prompt and system_prompt not in personality:
        personality = f"{personality}\n\n[System]\n{system_prompt}".strip()

    return {
        "name": name,
        "description": description,
        "personality": personality,
        "stSource": {
            "format": raw.get("spec") or "sillytavern",
            "spec_version": raw.get("spec_version"),
            "first_mes": first_mes,
            "mes_example": mes_example,
            "tags": data.get("tags") or raw.get("tags") or [],
        },
    }


def to_character_profile(card: dict, card_path: Path | None = None) -> dict:
    name = card["name"]
    char_id = slugify(name)
    profile: dict = {
        "id": char_id,
        "name": name,
        "description": card.get("description", ""),
        "personality": card.get("personality", ""),
    }
    if card.get("stSource"):
        profile["stSource"] = card["stSource"]
    if card_path and card_path.suffix.lower() == ".png" and card_path.is_file():
        profile["portrait"] = str(card_path.resolve())
    return profile


def load_card(path: Path) -> dict:
    if path.suffix.lower() == ".png":
        raw = read_png_chara(path)
        if not raw:
            raise ValueError(f"No ST character data in PNG: {path}")
        return normalize_st_card(raw)
    raw = json.loads(path.read_text(encoding="utf-8"))
    return normalize_st_card(raw)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import SillyTavern character card")
    parser.add_argument("card", help="Path to .json or .png character card")
    parser.add_argument("--out-dir", required=True, help="characters/ output directory")
    parser.add_argument("--set-active", action="store_true", help="Write active_character.txt")
    args = parser.parse_args()

    card_path = Path(args.card).resolve()
    out_dir = Path(args.out_dir).resolve()
    if not card_path.is_file():
        print(f"Error: file not found: {card_path}", file=sys.stderr)
        return 1

    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        card = load_card(card_path)
        profile = to_character_profile(card, card_path)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    out_file = out_dir / f"{profile['id']}.json"
    out_file.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out_file}")

    if args.set_active:
        (out_dir / "active_character.txt").write_text(profile["id"], encoding="utf-8")
        print(f"Set active character: {profile['id']}")

    if profile.get("stSource", {}).get("first_mes"):
        print("\n--- first_mes (opening line hint) ---")
        print(profile["stSource"]["first_mes"][:500])

    return 0


if __name__ == "__main__":
    raise SystemExit(main())