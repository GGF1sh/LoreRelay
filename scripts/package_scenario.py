#!/usr/bin/env python3
"""Package a scenario folder for Workshop-style distribution (zip)."""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_SCENARIO_FIELDS = ("format", "meta", "setup", "opening")
WORKSHOP_FORMAT = "text-adventure-workshop/1.0"
SCENARIO_FORMAT = "text-adventure-scenario/1.0"


def validate_scenario(data: dict) -> list[str]:
    errors: list[str] = []
    if data.get("format") != SCENARIO_FORMAT:
        errors.append(f'format must be "{SCENARIO_FORMAT}"')
    meta = data.get("meta")
    if not isinstance(meta, dict) or not meta.get("title"):
        errors.append("meta.title is required")
    setup = data.get("setup")
    if not isinstance(setup, dict):
        errors.append("setup object is required")
    else:
        for key in ("world", "protagonist", "tone"):
            if not setup.get(key):
                errors.append(f"setup.{key} is recommended")
    opening = data.get("opening")
    if not isinstance(opening, dict) or not opening.get("narrative"):
        errors.append("opening.narrative is required")
    return errors


def ensure_workshop_manifest(scenario_dir: Path, scenario: dict) -> Path:
    workshop_path = scenario_dir / "workshop.json"
    if workshop_path.exists():
        return workshop_path
    meta = scenario.get("meta") or {}
    payload = {
        "format": WORKSHOP_FORMAT,
        "engineVersion": "0.2.9",
        "packagedAt": datetime.now(timezone.utc).isoformat(),
        "scenarioFile": "scenario.json",
        "title": meta.get("title", scenario_dir.name),
        "author": meta.get("author", ""),
        "version": meta.get("version", "1.0.0"),
        "description": meta.get("description", ""),
        "tags": meta.get("tags", []),
        "license": "CC-BY-4.0",
        "homepage": "",
    }
    workshop_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return workshop_path


def package_dir(scenario_dir: Path, out_zip: Path) -> None:
    scenario_path = scenario_dir / "scenario.json"
    if not scenario_path.exists():
        raise FileNotFoundError("scenario.json not found in selected folder")
    scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
    errors = validate_scenario(scenario)
    if errors:
        raise ValueError("; ".join(errors))
    ensure_workshop_manifest(scenario_dir, scenario)

    skip_dirs = {".git", "__pycache__", "node_modules", ".text-adventure"}
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in scenario_dir.rglob("*"):
            if not file_path.is_file():
                continue
            rel = file_path.relative_to(scenario_dir)
            if any(part in skip_dirs for part in rel.parts):
                continue
            zf.write(file_path, arcname=str(rel).replace("\\", "/"))
    print(str(out_zip.resolve()))


def main() -> int:
    parser = argparse.ArgumentParser(description="Package scenario folder to zip")
    parser.add_argument("--dir", required=True, help="Scenario pack folder")
    parser.add_argument("--out", default="", help="Output zip path (default: <dir>.zip)")
    args = parser.parse_args()
    scenario_dir = Path(args.dir).resolve()
    out_zip = Path(args.out).resolve() if args.out else scenario_dir.with_suffix(".zip")
    try:
        package_dir(scenario_dir, out_zip)
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())