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
  TA_WIDTH, TA_HEIGHT, TA_WORKFLOW, TA_MODE, TA_CONTROL_STRENGTH,
  TA_LORA, TA_LORA_WEIGHT
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
from cartography_path_utils import (  # noqa: E402
    WORLD_MAP_LAYOUT_BASENAME,
    validate_forge_path,
    validate_output_dir,
)
from cartography_theme_styles import resolve_theme_style  # noqa: E402
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
DEFAULT_WORKFLOW = REPO_ROOT / "comfyui" / "workflow_cartography_sdxl_canny.json"
DIRECT_WORKFLOW = REPO_ROOT / "comfyui" / "workflow_cartography_sdxl_direct.json"
RENDER_SCRIPT = SCRIPT_DIR / "render_cartography_layout.py"

CARTOGRAPHY_NEGATIVE_CORE = (
    "star chart, astrolabe, zodiac wheel, celestial diagram, astronomical map, magic circle, "
    "summoning circle, ritual circle, radial symmetry, circular diagram, radial grid, "
    "compass rose centerpiece, ornate mandala, spherical globe, planet in space, "
    "abstract diagram, infographic, flowchart, node graph visualization, "
    "floating object, tilted paper, perspective view, landscape background, scenic valley, "
    "mountains behind map, broken glass, shattered pane, diamond shape, kite shape, torn paper, "
    "satellite photo, GPS smartphone app, "
    "isometric city, character portrait, anime face, creature close-up, "
    "3d render, photorealistic photograph, text, letters, words, watermark, signature, "
    "lowres, worst quality, blurry"
)

PROMPT_PRESETS = {
    "illustrious": {
        "pos_suffix": ", masterpiece, best quality, highly detailed regional map illustration",
        "neg": CARTOGRAPHY_NEGATIVE_CORE,
    },
    "natural": {
        "pos_suffix": ", highly detailed illustrated regional map",
        "neg": CARTOGRAPHY_NEGATIVE_CORE,
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


def resolve_mapcraft_style_tag(theme: str) -> str:
    """Mapcraft LoRA style tags (see Civitai model card)."""
    key = theme.lower().replace(" ", "-").replace("_", "-")
    if "cyber" in key or "scifi" in key or "sci-fi" in key:
        return "sci-fi"
    if "postapoc" in key or "post-apoc" in key or "wasteland" in key:
        return "post-apocalyptic"
    if "zombie" in key or "undead" in key or "horror" in key:
        return "post-apocalyptic"
    if key == "modern" or "urban" in key:
        return "modern"
    return ""


def build_lora_prompt_prefix(lora_name: str, theme: str) -> str:
    lower = lora_name.lower()
    if "mapcraft" in lower:
        style_tag = resolve_mapcraft_style_tag(theme)
        tags = "mapcraft, battle map, top-down view, from above, no humans, highly detailed, exterior, landscape"
        if style_tag:
            tags = f"{tags}, {style_tag}"
        return f"{tags}, "
    return ""


def apply_lora(workflow: dict, lora_name: str | None, weight: float) -> None:
    """Insert LoraLoader node 14 and rewire KSampler + CLIP encoders when TA_LORA is set."""
    if not lora_name or not lora_name.strip():
        return
    w = max(0.0, min(1.0, weight))
    workflow["14"] = {
        "inputs": {
            "lora_name": lora_name.strip(),
            "strength_model": w,
            "strength_clip": w,
            "model": ["4", 0],
            "clip": ["4", 1],
        },
        "class_type": "LoraLoader",
        "_meta": {"title": "Optional Map LoRA (TA_LORA)"},
    }
    if "3" in workflow:
        workflow["3"]["inputs"]["model"] = ["14", 0]
    if "6" in workflow:
        workflow["6"]["inputs"]["clip"] = ["14", 1]
    if "7" in workflow:
        workflow["7"]["inputs"]["clip"] = ["14", 1]


def parse_lora_weight(raw: str | None, default: float = 0.45) -> float:
    if not raw or not str(raw).strip():
        return default
    try:
        w = float(str(raw).strip())
    except ValueError:
        return default
    return max(0.0, min(1.0, w))


def build_prompts(forge_path: Path, mode: str, lora_name: str = "") -> tuple[str, str]:
    data = json.loads(forge_path.read_text(encoding="utf-8"))
    world_name = data.get("meta", {}).get("worldName", "Fantasy World")
    theme = data.get("meta", {}).get("theme", "fantasy")
    map_type, render_style, extra_neg = resolve_theme_style(theme)
    lora_prefix = build_lora_prompt_prefix(lora_name, theme) if lora_name else ""
    regions = data.get("geography", {}).get("regions", [])
    biomes = {}
    for r in regions:
        if isinstance(r, dict):
            b = r.get("biome") or r.get("type") or "other"
            biomes[b] = biomes.get(b, 0) + 1
    biome_text = ", ".join(f"{c} {b}" for b, c in sorted(biomes.items()) if c)
    preset = PROMPT_PRESETS.get(mode, PROMPT_PRESETS["illustrious"])
    positive = (
        f"{lora_prefix}"
        f"flat top-down {map_type} of {world_name}, {render_style}, "
        f"orthographic bird eye view, map fills entire square frame edge to edge, "
        f"distinct zone borders, route network between locations, readable macro geography, "
        f"no labels, no typography, no UI frame, no floating objects, no perspective tilt, "
        f"{theme} world setting, featuring {biome_text}"
        f"{preset['pos_suffix']}"
    )
    negative = preset["neg"]
    if extra_neg:
        negative = f"{negative}, {extra_neg}"
    return positive, negative


def resolve_workflow_path(layout_mode: str) -> Path:
    explicit = os.environ.get("TA_WORKFLOW", "").strip()
    if explicit:
        return Path(explicit)
    if layout_mode == "lineart":
        return DIRECT_WORKFLOW
    return DEFAULT_WORKFLOW


def render_layout(forge_path: Path, layout_path: Path, size: int) -> None:
    layout_mode = os.environ.get("TA_LAYOUT_MODE", "voronoi").strip().lower()
    cmd = [
        sys.executable, str(RENDER_SCRIPT), str(forge_path), str(layout_path),
        "--size", str(size), "--layout-mode", layout_mode,
    ]
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

    layout_mode = os.environ.get("TA_LAYOUT_MODE", "voronoi").strip().lower()
    workflow_path = resolve_workflow_path(layout_mode)
    if not workflow_path.is_file():
        print(f"Error: workflow not found: {workflow_path}", file=sys.stderr)
        return 1

    mode = os.environ.get("TA_MODE", "illustrious").lower()
    width = int(os.environ.get("TA_WIDTH", "1024"))
    height = int(os.environ.get("TA_HEIGHT", "1024"))

    output_dir.mkdir(parents=True, exist_ok=True)
    layout_path = output_dir / WORLD_MAP_LAYOUT_BASENAME
    if not layout_path.is_file():
        layout_path = output_dir / "cartography_layout.png"
    force_layout = os.environ.get("TA_FORCE_LAYOUT", "").strip().lower() in ("1", "true", "yes")
    if force_layout or not layout_path.is_file():
        render_layout(forge_path, layout_path, max(width, height))

    uploaded_name = upload_image(layout_path)

    with workflow_path.open("r", encoding="utf-8") as f:
        workflow = json.load(f)

    lora_name = os.environ.get("TA_LORA", "").strip()
    lora_weight = parse_lora_weight(os.environ.get("TA_LORA_WEIGHT"))
    pos, neg = build_prompts(forge_path, mode, lora_name)
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
    apply_lora(workflow, lora_name, lora_weight)

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
