#!/usr/bin/env python3
"""Behavioral M1 test: a host-validated plan is authoritative at the Python boundary."""

import importlib.util
import contextlib
import io
import os
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "antigravity-skill" / "text-adventure-gm" / "scripts" / "comfyui_generate.py"
WORKFLOW = ROOT / "comfyui" / "workflow_sdxl_1024.json"

spec = importlib.util.spec_from_file_location("comfyui_generate_media_m1", SCRIPT)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

old_argv = sys.argv[:]
old_env = os.environ.copy()
captured = {}
workspace_loads = 0


def forbidden_workspace_load():
    global workspace_loads
    workspace_loads += 1
    return {
        "checkpoint": "Anima\\must_not_override.safetensors",
        "workflowPath": str(ROOT / "fixtures" / "media-m1" / "unknown_workflow.json"),
    }


def capture_queue(workflow):
    captured["workflow"] = workflow
    return None


try:
    os.environ.update({
        "TA_MEDIA_PREFLIGHT": "validated",
        "TA_MEDIA_PROFILE_ID": "sdxl-illustrious-simple",
        "TA_MODEL_FAMILY": "sdxl",
        "TA_GRAPH_FAMILY": "sdxl_checkpoint_simple",
        "TA_WORKFLOW": str(WORKFLOW),
        "TA_CHECKPOINT": "validated_checkpoint.safetensors",
        "TA_MODE": "illustrious",
    })
    module.WORKFLOW_PATH = str(WORKFLOW)
    module._load_workspace_image_config = forbidden_workspace_load
    module.queue_prompt = capture_queue
    sys.argv = [str(SCRIPT), "media contract test", str(ROOT / "fixtures" / "media-m1"), "illustrious"]
    with contextlib.redirect_stderr(io.StringIO()):
        try:
            module.main()
        except SystemExit as exc:
            if exc.code != 1:
                raise AssertionError(f"unexpected exit code: {exc.code}") from exc

    assert workspace_loads == 0, "validated host contract must not reload legacy workspace config"
    assert captured.get("workflow"), "validated workflow should reach the queue seam"
    assert captured["workflow"]["4"]["inputs"]["ckpt_name"] == "validated_checkpoint.safetensors"
    print("comfyui validated media contract test passed.")
finally:
    sys.argv = old_argv
    os.environ.clear()
    os.environ.update(old_env)
