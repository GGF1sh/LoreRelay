#!/usr/bin/env python3
"""Behavioral tests for MEDIA-M1.1 generation and portrait adoption."""

from __future__ import annotations

import contextlib
from datetime import datetime, timezone
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "antigravity-skill" / "text-adventure-gm" / "scripts"
SCRIPT = SCRIPT_DIR / "comfyui_generate.py"
WORKFLOW = ROOT / "comfyui" / "workflow_sdxl_1024.json"
sys.path.insert(0, str(SCRIPT_DIR))

from portrait_artifact import PortraitAdoptionError, adopt_character_portrait  # noqa: E402


def load_generator():
    spec = importlib.util.spec_from_file_location("comfyui_generate_portrait_m11", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def write_character(workspace: Path, portrait: str) -> Path:
    characters = workspace / "characters"
    characters.mkdir(parents=True, exist_ok=True)
    target = characters / "hero.json"
    target.write_text(json.dumps({"id": "hero", "name": "Hero", "portrait": portrait}), encoding="utf-8")
    return target


def run_generation(module, workspace: Path, image_bytes: bytes):
    module.WORKFLOW_PATH = str(WORKFLOW)
    module.queue_prompt = lambda _workflow: {"prompt_id": "portrait-test"}
    module.get_history = lambda _prompt_id: {
        "portrait-test": {"outputs": {"9": {"images": [{"filename": "x.png", "subfolder": "", "type": "output"}]}}}
    }
    module.get_image = lambda _filename, _subfolder, _folder_type: image_bytes
    old_argv = sys.argv[:]
    stdout = io.StringIO()
    stderr = io.StringIO()
    sys.argv = [
        str(SCRIPT),
        "portrait prompt",
        str(workspace / "characters"),
        "illustrious",
        "--character-id",
        "hero",
        "--workspace",
        str(workspace),
    ]
    try:
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try:
                module.main()
            except SystemExit as exc:
                assert exc.code == 0, stderr.getvalue()
    finally:
        sys.argv = old_argv
    result_lines = [line for line in stdout.getvalue().splitlines() if line.startswith(module.MEDIA_RESULT_PREFIX)]
    assert result_lines, stdout.getvalue()
    return json.loads(result_lines[-1][len(module.MEDIA_RESULT_PREFIX):])


# --help/-h must finish before workflow/config/network behavior.
for flag in ("--help", "-h"):
    env = os.environ.copy()
    env["TA_WORKFLOW"] = str(ROOT / "definitely-missing-workflow.json")
    env["COMFYUI_URL"] = "http://127.0.0.1:1"
    process = subprocess.run(
        [sys.executable, str(SCRIPT), flag],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert process.returncode == 0, process.stderr
    assert "Usage:" in process.stdout and "TA_MEDIA_RESULT" in process.stdout
    assert "HTTP" not in process.stderr and "workflow" not in process.stderr.lower()

with tempfile.TemporaryDirectory(prefix="lorerelay-portrait-m11-") as temp:
    workspace = Path(temp)
    characters = workspace / "characters"
    old_fixed = characters / "hero_portrait.png"
    character_json = write_character(workspace, str(old_fixed))
    old_fixed.write_bytes(b"old-fixed")
    old_scene_a = characters / "scene_11111111.png"
    old_scene_b = characters / "scene_22222222.png"
    old_scene_a.write_bytes(b"old-scene-a")
    old_scene_b.write_bytes(b"old-scene-b")
    old_version = characters / "hero_portrait_aaaaaaaaaaaaaaaa.png"
    old_version.write_bytes(b"old-generated-version")

    module = load_generator()
    first = run_generation(module, workspace, b"new-portrait-one")
    first_path = Path(first["outputPath"])
    assert first["success"] is True and first["characterId"] == "hero"
    assert first_path.is_file() and first_path.read_bytes() == b"new-portrait-one"
    assert first_path.name.startswith("hero_portrait_") and first_path != old_fixed
    assert old_scene_a.exists() and old_scene_b.exists(), "old scene images must not be selected or broadly deleted"
    assert not old_version.exists(), "old generated portrait versions must be cleaned after successful adoption"
    profile = json.loads(character_json.read_text(encoding="utf-8"))
    assert profile["portrait"] == str(first_path)

    second = run_generation(module, workspace, b"new-portrait-two")
    second_path = Path(second["outputPath"])
    assert second_path.is_file() and second_path != first_path
    assert not first_path.exists(), "versioned generated portrait cleanup must stay bounded"
    assert json.loads(character_json.read_text(encoding="utf-8"))["portrait"] == str(second_path)

    before_missing = character_json.read_text(encoding="utf-8")
    try:
        adopt_character_portrait(workspace, "hero", workspace / "missing.png", datetime.now(timezone.utc).isoformat())
        raise AssertionError("missing artifact should fail")
    except (PortraitAdoptionError, FileNotFoundError):
        pass
    assert character_json.read_text(encoding="utf-8") == before_missing

    outside = workspace.parent / f"{workspace.name}-outside.png"
    outside.write_bytes(b"outside")
    try:
        try:
            adopt_character_portrait(workspace, "hero", outside, datetime.now(timezone.utc).isoformat())
            raise AssertionError("outside artifact should fail")
        except PortraitAdoptionError:
            pass
        assert character_json.read_text(encoding="utf-8") == before_missing
    finally:
        outside.unlink(missing_ok=True)

    failed_module = load_generator()
    failed_module.WORKFLOW_PATH = str(WORKFLOW)
    failed_module.queue_prompt = lambda _workflow: None
    old_argv = sys.argv[:]
    sys.argv = [str(SCRIPT), "failed prompt", str(characters), "illustrious", "--character-id", "hero", "--workspace", str(workspace)]
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                failed_module.main()
            except SystemExit as exc:
                assert exc.code == 1
    finally:
        sys.argv = old_argv
    assert character_json.read_text(encoding="utf-8") == before_missing

print("portrait artifact adoption tests passed.")
