#!/usr/bin/env python3
"""
Ollama GM bridge for Text Adventure Engine.

Usage:
  python ollama_gm.py --cwd <workspace> --action "プレイヤーの行動"
  python ollama_gm.py --cwd <workspace> --action "..." --model llama3.2 --url http://localhost:11434

Environment:
  OLLAMA_URL, OLLAMA_MODEL, TA_GM_PYTHON
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from gm_bridge_common import (
    add_player_action_args,
    build_user_prompt,
    get_system_prompt,
    log_player_action_redacted,
    normalize_locale,
    process_llm_response,
    read_player_action,
)


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Text Adventure GM bridge via Ollama")
    parser.add_argument("--cwd", required=True, help="Workspace root (game_state.json の場所)")
    add_player_action_args(parser)
    parser.add_argument("--model", default=os.environ.get("OLLAMA_MODEL", "llama3.2"), help="Ollama model name")
    parser.add_argument("--url", default=os.environ.get("OLLAMA_URL", "http://localhost:11434"), help="Ollama base URL")
    parser.add_argument("--continue-game", action="store_true", help="継続プレイ（プロンプトを短く）")
    parser.add_argument(
        "--locale",
        default=os.environ.get("TA_LOCALE", "en"),
        help="UI/GM language: ja, en, zh-CN, zh-TW",
    )
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    if not cwd.is_dir():
        print(f"Error: --cwd is not a directory: {cwd}", file=sys.stderr)
        return 1

    locale = normalize_locale(args.locale)
    try:
        player_action = read_player_action(args)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    user_prompt = build_user_prompt(cwd, player_action, args.continue_game, locale=locale)
    system_prompt = get_system_prompt(locale, cwd)
    print(f"[ollama_gm] model={args.model} url={args.url} locale={locale}", flush=True)
    log_player_action_redacted(player_action, "[ollama_gm]")

    try:
        raw = chat_ollama(args.url, args.model, system_prompt, user_prompt)
        print("[ollama_gm] LLM response received, processing...", flush=True)
        state = process_llm_response(cwd, raw, locale=locale)
        print(f"[ollama_gm] wrote {cwd / 'game_state.json'} (turn {state['entries'][0]['id']})", flush=True)
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())