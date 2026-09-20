#!/usr/bin/env python3
"""Smoke tests for cartography LoRA wiring in comfyui_generate_cartography.py."""
from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

from comfyui_generate_cartography import (  # noqa: E402
    apply_lora,
    build_lora_prompt_prefix,
    parse_lora_weight,
    resolve_mapcraft_style_tag,
)

failed = 0


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def fail(msg: str) -> None:
    global failed
    print(f"FAIL: {msg}", file=sys.stderr)
    failed += 1


def main() -> int:
    workflow_path = REPO_ROOT / "comfyui" / "workflow_cartography_sdxl_canny.json"
    workflow = json.loads(workflow_path.read_text(encoding="utf-8"))

    apply_lora(workflow, "mapcraft_il_v1.safetensors", 0.45)
    if workflow.get("14", {}).get("class_type") != "LoraLoader":
        fail("node 14 LoraLoader missing")
    else:
        ok("LoraLoader node inserted")

    if workflow["3"]["inputs"]["model"] != ["14", 0]:
        fail(f"KSampler model link wrong: {workflow['3']['inputs']['model']}")
    else:
        ok("KSampler rewired to LoRA")

    if workflow["6"]["inputs"]["clip"] != ["14", 1]:
        fail("positive CLIP not rewired")
    else:
        ok("positive CLIP rewired")

    prefix = build_lora_prompt_prefix("mapcraft_illustrious.safetensors", "cyberpunk")
    if "mapcraft" not in prefix or "sci-fi" not in prefix:
        fail(f"mapcraft prefix unexpected: {prefix!r}")
    else:
        ok("mapcraft prompt prefix")

    if resolve_mapcraft_style_tag("postapoc-wasteland") != "post-apocalyptic":
        fail("postapoc style tag")
    else:
        ok("postapoc style tag")

    if parse_lora_weight("not-a-number", 0.45) != 0.45:
        fail("parse_lora_weight invalid")
    else:
        ok("parse_lora_weight invalid fallback")

    if parse_lora_weight("0.8", 0.45) != 0.8:
        fail("parse_lora_weight valid")
    else:
        ok("parse_lora_weight valid")

    if failed:
        print(f"comfyui cartography lora tests: {failed} failure(s)", file=sys.stderr)
        return 1
    print("comfyui cartography lora tests passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())