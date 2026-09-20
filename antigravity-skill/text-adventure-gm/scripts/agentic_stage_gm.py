#!/usr/bin/env python3
"""
Agentic GM stage runner for LoreRelay Phase 9B.

Runs a single State Referee or Narrator stage prompt against a local LLM API.
Writes nothing to game_state.json or turn_result.json — response goes to stdout only.
The extension parses stdout (or stage JSON files the model may write) and merges later.

Usage:
  python agentic_stage_gm.py --cwd <workspace> --provider ollama --prompt-file <path>
  python agentic_stage_gm.py --cwd <workspace> --provider koboldcpp --prompt-file <path> --url http://127.0.0.1:5001
  python agentic_stage_gm.py --cwd <workspace> --provider openrouter --prompt-file <path> --model anthropic/claude-3.5-sonnet

Environment:
  OLLAMA_URL, OLLAMA_MODEL, KOBOLDCPP_URL, OPENROUTER_API_KEY, TA_GM_PYTHON
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from gm_bridge_common import resolve_dice_script, substitute_dice_markers

STAGE_SYSTEM = (
    "You are LoreRelay's agentic GM stage assistant. "
    "Follow the user prompt exactly. "
    "Do not write game_state.json or turn_result.json. "
    "Output only the stage result requested in the prompt."
)


def read_prompt_file(path: Path) -> str:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError("Prompt file is empty")
    return text


def chat_ollama(url: str, model: str, system: str, user: str, timeout: int = 300) -> str:
    base = url.rstrip("/")
    endpoint = f"{base}/api/chat"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Ollama に接続できません ({endpoint})。`ollama serve` が起動しているか確認してください: {e}"
        ) from e

    message = body.get("message") or {}
    content = message.get("content") or body.get("response") or ""
    if not content.strip():
        raise RuntimeError(f"Ollama が空の応答を返しました: {body}")
    return content


def generate_kobold(url: str, prompt: str, max_length: int = 2048, timeout: int = 600) -> str:
    base = url.rstrip("/")
    endpoint = f"{base}/api/v1/generate"
    payload = {
        "prompt": prompt,
        "max_context_length": 8192,
        "max_length": max_length,
        "temperature": 0.75,
        "top_p": 0.92,
        "top_k": 100,
        "rep_pen": 1.1,
        "stop_sequence": ["```\n\n", "\n\nUser:", "\n\nプレイヤー:"],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"KoboldCPP に接続できません ({endpoint})。koboldcpp を起動し API ポートを確認してください: {e}"
        ) from e

    results = body.get("results") or []
    if not results:
        raise RuntimeError(f"KoboldCPP が空の応答を返しました: {body}")
    text = results[0].get("text") or ""
    if not text.strip():
        raise RuntimeError(f"KoboldCPP が空テキストを返しました: {body}")
    return text


def call_openrouter(api_key: str, model: str, system: str, user: str, max_tokens: int = 4096) -> str:
    endpoint = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/GGF1sh/LoreRelay",
        "X-Title": "LoreRelay Agentic GM",
    }
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "max_tokens": max_tokens,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            res = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        raise RuntimeError(f"OpenRouter HTTP {e.code}: {err_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"OpenRouter connection error: {e.reason}") from e

    choices = res.get("choices") or []
    if not choices:
        raise RuntimeError(f"OpenRouter returned no choices: {res}")
    content = choices[0].get("message", {}).get("content", "").strip()
    if not content:
        raise RuntimeError("OpenRouter returned empty content")
    return content


def run_provider(provider: str, cwd: Path, prompt: str, args: argparse.Namespace) -> str:
    if provider == "ollama":
        url = args.url or os.environ.get("OLLAMA_URL", "http://localhost:11434")
        model = args.model or os.environ.get("OLLAMA_MODEL", "llama3.2")
        return chat_ollama(url, model, STAGE_SYSTEM, prompt)
    if provider == "koboldcpp":
        url = args.url or os.environ.get("KOBOLDCPP_URL", "http://127.0.0.1:5001")
        full_prompt = f"{STAGE_SYSTEM.strip()}\n\n### Instruction:\n{prompt}\n\n### Response:\n"
        return generate_kobold(url, full_prompt)
    if provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not set")
        model = args.model or os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
        return call_openrouter(api_key, model, STAGE_SYSTEM, prompt)
    raise ValueError(f"Unsupported provider: {provider}")


def main() -> int:
    parser = argparse.ArgumentParser(description="LoreRelay agentic GM stage (stdout only)")
    parser.add_argument("--cwd", required=True, help="Workspace root")
    parser.add_argument(
        "--provider",
        required=True,
        choices=["ollama", "koboldcpp", "openrouter"],
        help="Local LLM provider",
    )
    parser.add_argument("--prompt-file", required=True, help="UTF-8 file with full stage prompt")
    parser.add_argument("--model", default="", help="Model name override")
    parser.add_argument("--url", default="", help="Ollama or KoboldCPP base URL override")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    if not cwd.is_dir():
        print(f"Invalid cwd: {cwd}", file=sys.stderr)
        return 2

    try:
        prompt = read_prompt_file(Path(args.prompt_file).resolve())
        raw = run_provider(args.provider, cwd, prompt, args)
        dice_script = resolve_dice_script()
        text = substitute_dice_markers(raw, dice_script)
        print(text, flush=True)
        return 0
    except Exception as e:
        print(f"[agentic_stage_gm] {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())