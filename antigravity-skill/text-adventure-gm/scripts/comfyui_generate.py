import sys
import json
import urllib.request
import urllib.error
import urllib.parse
import time
import os
import uuid
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from portrait_artifact import PortraitAdoptionError, adopt_character_portrait


MEDIA_RESULT_PREFIX = "TA_MEDIA_RESULT "

# ===== 画像生成バックエンド設定 =====
# ComfyUI / StabilityMatrix(内蔵ComfyUI) / その他 ComfyUI 互換サーバーに対応。
# 環境変数で上書き可能（VSCode 拡張が settings から渡す）。CLI から直接使う場合も使える。
#
#   COMFYUI_URL   : ComfyUI サーバーの URL（既定: http://127.0.0.1:8188）
#                   StabilityMatrix の場合もポートは通常 8188。変更している場合はここで指定。
#   TA_CHECKPOINT : 使用するチェックポイント(.safetensors)のファイル名。空ならワークフロー既定値。
#   TA_STEPS      : サンプリングステップ数
#   TA_CFG        : CFG スケール
#   TA_WIDTH      : 画像の幅
#   TA_HEIGHT     : 画像の高さ
#   TA_WORKFLOW   : 使用するワークフロー JSON のパス（既定: 同ディレクトリの workflow_api.json）
COMFYUI_URL = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
WORKFLOW_PATH = os.environ.get(
    "TA_WORKFLOW",
    os.path.join(os.path.dirname(__file__), "workflow_api.json")
)
try:
    HTTP_TIMEOUT = float(os.environ.get("COMFYUI_HTTP_TIMEOUT", "30"))
except ValueError:
    HTTP_TIMEOUT = 30.0

# プロンプト・プリセット（モード別）
def _load_workspace_image_config():
    """ワークスペースの image_gen_config.json を読み込む（TA_IMAGE_CONFIG または cwd）。"""
    config_path = os.environ.get("TA_IMAGE_CONFIG", "").strip()
    if not config_path:
        config_path = os.path.join(os.getcwd(), "image_gen_config.json")
    if not os.path.isfile(config_path):
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        print(f"Warning: could not read {config_path}: {e}", file=sys.stderr)
        return {}


PROMPT_PRESETS = {
    "pony": {
        "pos_prefix": "score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, source_anime, rating_safe, ",
        "pos_suffix": "",
        "neg": "low quality, worst quality, text, watermark"
    },
    "illustrious": {
        "pos_prefix": "",
        "pos_suffix": ", masterpiece, best quality, very aesthetic, absurdres, highly detailed",
        "neg": "lowres, worst quality, low quality, bad anatomy, bad proportions, blurry, jpeg artifacts, watermark, signature, text"
    },
    "natural": {
        "pos_prefix": "",
        "pos_suffix": "",
        "neg": "low quality, worst quality, bad anatomy"
    },
    "standard": {
        "pos_prefix": "",
        "pos_suffix": ", masterpiece, best quality, highly detailed",
        "neg": "low quality, worst quality, text, watermark"
    }
}

def _connection_hint():
    return (
        f"ComfyUI サーバー（{COMFYUI_URL}）に接続できません。\n"
        "  - ComfyUI / StabilityMatrix が起動しているか確認してください。\n"
        "  - ポートが既定(8188)と異なる場合は環境変数 COMFYUI_URL または\n"
        "    VSCode 設定 textAdventure.imageGen.comfyuiUrl を確認してください。"
    )


def list_models():
    """ComfyUI から利用可能なチェックポイント一覧を取得して表示する。"""
    try:
        with urllib.request.urlopen(f"{COMFYUI_URL}/object_info/CheckpointLoaderSimple", timeout=10) as response:
            info = json.loads(response.read())
    except Exception as e:
        print(_connection_hint(), file=sys.stderr)
        print(f"(詳細: {e})", file=sys.stderr)
        sys.exit(1)

    try:
        ckpts = info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0]
    except (KeyError, IndexError, TypeError):
        print("チェックポイント情報を取得できませんでした。", file=sys.stderr)
        sys.exit(1)

    print(f"利用可能なチェックポイント ({COMFYUI_URL}):")
    for name in ckpts:
        print(f"  {name}")
    sys.exit(0)


def queue_prompt(prompt_json):
    p = {"prompt": prompt_json}
    data = json.dumps(p).encode('utf-8')
    req =  urllib.request.Request(f"{COMFYUI_URL}/prompt", data=data)
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code}: {e.reason}\nBody: {error_body}", file=sys.stderr)
        return None
    except urllib.error.URLError as e:
        print(_connection_hint(), file=sys.stderr)
        print(f"(詳細: {e})", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error connecting to ComfyUI: {e}", file=sys.stderr)
        return None

def get_history(prompt_id):
    try:
        with urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}", timeout=HTTP_TIMEOUT) as response:
            return json.loads(response.read())
    except Exception:
        return {}

def get_image(filename, subfolder, folder_type):
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    try:
        with urllib.request.urlopen(f"{COMFYUI_URL}/view?{url_values}", timeout=HTTP_TIMEOUT) as response:
            return response.read()
    except Exception as e:
        print(f"Error fetching image: {e}", file=sys.stderr)
        return None


def print_help():
    print("Usage: python comfyui_generate.py <prompt> [output_dir] [mode] [options]")
    print("       python comfyui_generate.py --list-models")
    print("       python comfyui_generate.py --help")
    print("")
    print("Modes: pony, illustrious, natural, standard")
    print("Portrait adoption options:")
    print("  --character-id <id>   Adopt the exact generated artifact for this character")
    print("  --workspace <path>    Workspace containing characters/<id>.json")
    print("")
    print(f"Successful generation emits: {MEDIA_RESULT_PREFIX}<json>")


def _option_value(args, option):
    if option not in args:
        return ""
    index = args.index(option)
    if index + 1 >= len(args):
        raise ValueError(f"{option} requires a value")
    return args[index + 1]


def _emit_media_result(result):
    print(f"{MEDIA_RESULT_PREFIX}{json.dumps(result, ensure_ascii=False, separators=(',', ':'))}")

def main():
    if len(sys.argv) < 2:
        print_help()
        sys.exit(1)

    if sys.argv[1] in ("--help", "-h"):
        print_help()
        sys.exit(0)

    # モデル一覧取得モード
    if sys.argv[1] in ("--list-models", "-l"):
        list_models()

    prompt_text = sys.argv[1]
    extra_args = sys.argv[4:]
    try:
        character_id = _option_value(extra_args, "--character-id")
        adoption_workspace = _option_value(extra_args, "--workspace")
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(2)
    if bool(character_id) != bool(adoption_workspace):
        print("Error: --character-id and --workspace must be provided together.", file=sys.stderr)
        sys.exit(2)

    # デフォルトの保存先をスクリプト実行パスからの相対で定義
    default_output = os.path.join(os.path.dirname(os.path.dirname(__file__)), "output")
    raw_output_dir = sys.argv[2] if (len(sys.argv) >= 3 and sys.argv[2]) else default_output
    output_dir = os.path.abspath(raw_output_dir)

    # システムディレクトリへの書き込みを拒否
    _BLOCKED = ['C:\\Windows', 'C:\\Program Files', 'C:\\System32',
                '/etc', '/usr', '/bin', '/sbin', '/root', '/boot']
    normalized_output_dir = os.path.normcase(os.path.abspath(output_dir))
    blocked_dirs = [os.path.normcase(os.path.abspath(b)) for b in _BLOCKED]

    def is_inside_blocked_dir(candidate, blocked):
        try:
            return os.path.commonpath([candidate, blocked]) == blocked
        except ValueError:
            return False

    if any(is_inside_blocked_dir(normalized_output_dir, b) for b in blocked_dirs):
        print(f"Error: blocked output directory: {output_dir}", file=sys.stderr)
        sys.exit(1)

    # M1 host preflight is the compatibility authority. Once validated, do not
    # re-resolve legacy workspace values and recreate a different stack here.
    host_validated = os.environ.get("TA_MEDIA_PREFLIGHT", "").strip().lower() == "validated"
    ws_config = {} if host_validated else _load_workspace_image_config()
    if host_validated:
        required_contract = ("TA_MEDIA_PROFILE_ID", "TA_MODEL_FAMILY", "TA_GRAPH_FAMILY", "TA_WORKFLOW")
        missing_contract = [name for name in required_contract if not os.environ.get(name, "").strip()]
        if missing_contract:
            print(f"Error: incomplete validated media contract: {', '.join(missing_contract)}", file=sys.stderr)
            sys.exit(1)

    # モードの取得 (デフォルトは illustrious)
    mode = sys.argv[3].lower() if len(sys.argv) >= 4 else ""
    if not mode:
        mode = str(os.environ.get("TA_MODE", ws_config.get("mode", "illustrious"))).lower()
    if mode not in PROMPT_PRESETS:
        mode = "illustrious"

    preset = PROMPT_PRESETS[mode]

    workflow_path = WORKFLOW_PATH
    ws_workflow = str(ws_config.get("workflowPath", "")).strip()
    if not host_validated and ws_workflow and os.path.isfile(ws_workflow):
        workflow_path = ws_workflow

    # 1. ワークフローの読み込み
    try:
        with open(workflow_path, 'r', encoding='utf-8') as f:
            workflow = json.load(f)
    except Exception as e:
        print(f"Error reading workflow: {e}", file=sys.stderr)
        sys.exit(1)

    # 2. プロンプトの書き換え (ID: 6 = Positive, ID: 7 = Negative を想定)
    def _safe_str(val):
        return str(val).strip() if val is not None else ""

    pos_prefix = _safe_str(os.environ.get("TA_POSITIVE_PREFIX", ws_config.get("positivePrefix", preset["pos_prefix"])))
    pos_suffix = _safe_str(os.environ.get("TA_POSITIVE_SUFFIX", ws_config.get("positiveSuffix", preset["pos_suffix"])))
    neg_override = _safe_str(os.environ.get("TA_NEGATIVE_PROMPT", ws_config.get("negativePrompt", "")))

    def concat_prompts(p1, p2):
        if not p1: return p2
        if not p2: return p1
        if p1.endswith(",") or p2.startswith(","):
            return f"{p1} {p2}".strip()
        return f"{p1}, {p2}"

    final_positive = concat_prompts(concat_prompts(pos_prefix, prompt_text.strip()), pos_suffix)
    final_negative = neg_override if neg_override else preset["neg"]
    
    if "6" in workflow and "inputs" in workflow["6"] and "text" in workflow["6"]["inputs"]:
        workflow["6"]["inputs"]["text"] = final_positive
    if "7" in workflow and "inputs" in workflow["7"] and "text" in workflow["7"]["inputs"]:
        workflow["7"]["inputs"]["text"] = final_negative

    # 環境変数による生成設定の上書き（VSCode 設定 / CLI 環境変数から）
    def _apply_num(node_id, key, env_name, cast):
        val = os.environ.get(env_name)
        if val and node_id in workflow and "inputs" in workflow[node_id]:
            try:
                workflow[node_id]["inputs"][key] = cast(val)
            except ValueError:
                print(f"Warning: {env_name}='{val}' を数値に変換できません。無視します。", file=sys.stderr)

    def _apply_config_num(node_id, key, value, cast):
        if value and node_id in workflow and "inputs" in workflow[node_id]:
            try:
                workflow[node_id]["inputs"][key] = cast(value)
            except (ValueError, TypeError):
                print(f"Warning: config value for {key}='{value}' ignored.", file=sys.stderr)

    # チェックポイント(モデル)の上書き — ノード4 = CheckpointLoaderSimple
    checkpoint = os.environ.get("TA_CHECKPOINT", "").strip() or str(ws_config.get("checkpoint", "")).strip()
    if checkpoint and "4" in workflow and "inputs" in workflow["4"]:
        workflow["4"]["inputs"]["ckpt_name"] = checkpoint

    steps_val = os.environ.get("TA_STEPS") or ws_config.get("steps")
    if steps_val:
        _apply_config_num("3", "steps", steps_val, int)
    else:
        _apply_num("3", "steps", "TA_STEPS", int)

    cfg_val = os.environ.get("TA_CFG") or ws_config.get("cfg")
    if cfg_val:
        _apply_config_num("3", "cfg", cfg_val, float)
    else:
        _apply_num("3", "cfg", "TA_CFG", float)

    width_val = os.environ.get("TA_WIDTH") or ws_config.get("width")
    if width_val:
        _apply_config_num("5", "width", width_val, int)
    else:
        _apply_num("5", "width", "TA_WIDTH", int)

    height_val = os.environ.get("TA_HEIGHT") or ws_config.get("height")
    if height_val:
        _apply_config_num("5", "height", height_val, int)
    else:
        _apply_num("5", "height", "TA_HEIGHT", int)

    sampler = os.environ.get("TA_SAMPLER", "").strip() or str(ws_config.get("samplerName", "")).strip()
    if sampler and "3" in workflow and "inputs" in workflow["3"] and "sampler_name" in workflow["3"]["inputs"]:
        workflow["3"]["inputs"]["sampler_name"] = sampler
    elif sampler:
        print(f"Warning: sampler_name not supported by workflow; ignored ({sampler}).", file=sys.stderr)

    scheduler = os.environ.get("TA_SCHEDULER", "").strip() or str(ws_config.get("scheduler", "")).strip()
    if scheduler and "3" in workflow and "inputs" in workflow["3"] and "scheduler" in workflow["3"]["inputs"]:
        workflow["3"]["inputs"]["scheduler"] = scheduler
    elif scheduler:
        print(f"Warning: scheduler not supported by workflow; ignored ({scheduler}).", file=sys.stderr)

    # シード値をランダム化
    if "3" in workflow and "inputs" in workflow["3"] and "seed" in workflow["3"]["inputs"]:
        workflow["3"]["inputs"]["seed"] = int(time.time()) % 1000000000

    # 3. ジョブをキューに入れる
    response = queue_prompt(workflow)
    if not response or "prompt_id" not in response:
        print("Failed to queue prompt.", file=sys.stderr)
        sys.exit(1)

    prompt_id = response["prompt_id"]

    # 4. 完了までポーリング (最大5分)
    history = {}
    max_wait = 300
    elapsed = 0
    while elapsed < max_wait:
        history = get_history(prompt_id)
        if prompt_id in history:
            break
        time.sleep(2)
        elapsed += 2
    else:
        print("Timeout waiting for ComfyUI.", file=sys.stderr)
        sys.exit(1)

    # 5. 画像をダウンロードして保存
    prompt_result = history[prompt_id]
    outputs = prompt_result.get("outputs", {})
    if not outputs:
        print(f"No outputs found in history: {json.dumps(prompt_result)}", file=sys.stderr)

    for node_id in outputs:
        node_output = outputs[node_id]
        if "images" in node_output:
            for image_info in node_output["images"]:
                filename = image_info["filename"]
                subfolder = image_info["subfolder"]
                folder_type = image_info["type"]
                
                image_data = get_image(filename, subfolder, folder_type)
                if image_data:
                    save_filename = f"scene_{uuid.uuid4().hex[:8]}.png"
                    save_path = os.path.join(output_dir, save_filename)
                    
                    os.makedirs(output_dir, exist_ok=True)
                    
                    with open(save_path, "wb") as f:
                        f.write(image_data)
                    
                    # 絶対パスを標準出力に出力 (Antigravityが受け取る用)
                    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                    result = {
                        "success": True,
                        "outputPath": os.path.abspath(save_path),
                        "createdAt": created_at,
                    }
                    if character_id:
                        try:
                            result = adopt_character_portrait(
                                adoption_workspace,
                                character_id,
                                save_path,
                                created_at,
                            )
                        except (PortraitAdoptionError, OSError, ValueError) as error:
                            _emit_media_result({
                                "success": False,
                                "outputPath": os.path.abspath(save_path),
                                "createdAt": created_at,
                                "characterId": character_id,
                                "error": str(error),
                            })
                            print(f"Portrait adoption failed: {error}", file=sys.stderr)
                            sys.exit(1)

                    print(result["outputPath"])
                    _emit_media_result(result)
                    sys.exit(0)

    print("Image generation finished but no image found.", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    main()
