#!/usr/bin/env python3
"""
Generate a parchment fantasy world map from world_forge.json via ComfyUI ControlNet.

Pipeline:
  1. render_cartography_layout.py -> biome layout PNG
  2. Upload layout to ComfyUI input folder
  3. Queue workflow_cartography_sdxl_canny.json with dynamic prompts

Usage:
  python comfyui_generate_cartography.py <world_forge.json> [output_dir]

Environment (optional):
  COMFYUI_URL, TA_CHECKPOINT, TA_CONTROL_NET, TA_STEPS, TA_CFG,
  TA_WIDTH, TA_HEIGHT, TA_WORKFLOW, TA_MODE
"""
from __future__ import annotations

import json
import mimetypes
import os
import subprocess
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))
from cartography_path_utils import validate_forge_path, validate_output_dir  # noqa: E402
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
DEFAULT_WORKFLOW = REPO_ROOT / "comfyui" / "workflow_cartography_sdxl_canny.json"
RENDER_SCRIPT = SCRIPT_DIR / "render_cartography_layout.py"

PROMPT_PRESETS = {
    "illustrious": {
        "pos_suffix": ", masterpiece, best quality, very aesthetic, absurdres, highly detailed map art",
        "neg": "lowres, worst quality, low quality, blurry, watermark, signature, text overlay, satellite photo",
    },
    "natural": {
        "pos_suffix": ", highly detailed illustrated map",
        "neg": "low quality, worst quality, blurry, watermark",
    },
}


def _http_json(url: str, data: bytes | None = None, headers: dict | None = None, timeout: float = 60):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def upload_image(image_path: Path) -> str:
    boundary = f"----LoreRelay{uuid.uuid4().hex}"
    filename = image_path.name
    mime = mimetypes.guess_type(filename)[0] or "image/png"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    body += image_path.read_bytes()
    body += f"\r\n--{boundary}\r\n".encode("utf-8")
    body += (
        'Content-Disposition: form-data; name="overwrite"\r\n\r\n'
        "true\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    result = _http_json(f"{COMFYUI_URL}/upload/image", data=body, headers=headers)
    name = result.get("name") or filename
    subfolder = result.get("subfolder", "")
    if subfolder:
        return f"{subfolder}/{name}"
    return name


def build_prompts(forge_path: Path, mode: str) -> tuple[str, str]:
    data = json.loads(forge_path.read_text(encoding="utf-8"))
    world_name = data.get("meta", {}).get("worldName", "Fantasy World")
    theme = data.get("meta", {}).get("theme", "fantasy")
    regions = data.get("geography", {}).get("regions", [])
    biomes = {}
    for r in regions:
        if isinstance(r, dict):
            b = r.get("biome") or r.get("type") or "other"
            biomes[b] = biomes.get(b, 0) + 1
    biome_text = ", ".join(f"{c} {b}" for b, c in sorted(biomes.items()) if c)
    preset = PROMPT_PRESETS.get(mode, PROMPT_PRESETS["illustrious"])
    positive = (
        f"ancient parchment fantasy world map of {world_name}, {theme} cartography, "
        f"top-down illustrated map on aged paper, hand-drawn coastlines, mountain chains, "
        f"forests, ornate compass rose, decorative border, ink lines, warm sepia tones, "
        f"no modern UI, featuring {biome_text}"
        f"{preset['pos_suffix']}"
    )
    return positive, preset["neg"]


def render_layout(forge_path: Path, layout_path: Path, size: int) -> None:
    cmd = [sys.executable, str(RENDER_SCRIPT), str(forge_path), str(layout_path), "--size", str(size)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(proc.stderr or proc.stdout, file=sys.stderr)
        raise RuntimeError("render_cartography_layout.py failed")


def queue_prompt(workflow: dict) -> str:
    payload = json.dumps({"prompt": workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFYUI_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(e.read().decode("utf-8", errors="replace"), file=sys.stderr)
        raise
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI queue failed: {data}")
    return prompt_id


def wait_history(prompt_id: str, timeout_sec: int = 360) -> dict:
    for _ in range(timeout_sec // 2):
        try:
            hist = _http_json(f"{COMFYUI_URL}/history/{prompt_id}", timeout=15)
        except Exception:
            time.sleep(2)
            continue
        if prompt_id in hist:
            return hist[prompt_id]
        time.sleep(2)
    raise TimeoutError("ComfyUI cartography generation timed out")


def download_image(filename: str, subfolder: str, folder_type: str) -> bytes:
    q = urllib.parse.urlencode({
        "filename": filename,
        "subfolder": subfolder,
        "type": folder_type,
    })
    with urllib.request.urlopen(f"{COMFYUI_URL}/view?{q}", timeout=60) as resp:
        return resp.read()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 1

    forge_arg = Path(sys.argv[1])
    output_arg = Path(sys.argv[2]) if len(sys.argv) >= 3 else Path.cwd()
    workspace_root = forge_arg.parent if forge_arg.name == "world_forge.json" else output_arg
    try:
        forge_path = validate_forge_path(forge_arg, workspace_root)
        output_dir = validate_output_dir(output_arg, workspace_root)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    workflow_path = Path(os.environ.get("TA_WORKFLOW", str(DEFAULT_WORKFLOW)))
    if not workflow_path.is_file():
        print(f"Error: workflow not found: {workflow_path}", file=sys.stderr)
        return 1

    mode = os.environ.get("TA_MODE", "illustrious").lower()
    width = int(os.environ.get("TA_WIDTH", "1024"))
    height = int(os.environ.get("TA_HEIGHT", "1024"))

    layout_path = output_dir / f"cartography_layout_{uuid.uuid4().hex[:8]}.png"
    output_dir.mkdir(parents=True, exist_ok=True)
    render_layout(forge_path, layout_path, max(width, height))

    uploaded_name = upload_image(layout_path)

    with workflow_path.open("r", encoding="utf-8") as f:
        workflow = json.load(f)

    pos, neg = build_prompts(forge_path, mode)
    if "6" in workflow:
        workflow["6"]["inputs"]["text"] = pos
    if "7" in workflow:
        workflow["7"]["inputs"]["text"] = neg
    if "11" in workflow:
        workflow["11"]["inputs"]["image"] = uploaded_name
    if "4" in workflow and os.environ.get("TA_CHECKPOINT"):
        workflow["4"]["inputs"]["ckpt_name"] = os.environ["TA_CHECKPOINT"]
    if "10" in workflow and os.environ.get("TA_CONTROL_NET"):
        workflow["10"]["inputs"]["control_net_name"] = os.environ["TA_CONTROL_NET"]
    if "5" in workflow:
        workflow["5"]["inputs"]["width"] = width
        workflow["5"]["inputs"]["height"] = height
    if "3" in workflow:
        if os.environ.get("TA_STEPS"):
            workflow["3"]["inputs"]["steps"] = int(os.environ["TA_STEPS"])
        if os.environ.get("TA_CFG"):
            workflow["3"]["inputs"]["cfg"] = float(os.environ["TA_CFG"])
        workflow["3"]["inputs"]["seed"] = int(time.time()) % 1_000_000_000
    if "13" in workflow and os.environ.get("TA_CONTROL_STRENGTH"):
        workflow["13"]["inputs"]["strength"] = float(os.environ["TA_CONTROL_STRENGTH"])

    prompt_id = queue_prompt(workflow)
    result = wait_history(prompt_id)
    outputs = result.get("outputs", {})
    for node_out in outputs.values():
        for image in node_out.get("images", []):
            data = download_image(image["filename"], image.get("subfolder", ""), image.get("type", "output"))
            out_name = f"world_map_{uuid.uuid4().hex[:8]}.png"
            out_path = output_dir / out_name
            out_path.write_bytes(data)
            print(str(out_path.resolve()))
            return 0

    print(f"No image in ComfyUI outputs: {json.dumps(result)[:500]}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())