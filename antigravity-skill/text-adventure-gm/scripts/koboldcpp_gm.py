#!/usr/bin/env python3
"""
KoboldCPP GM bridge for Text Adventure Engine.

KoboldCPP を起動した状態で HTTP API に接続します（デフォルト http://127.0.0.1:5001）。

Usage:
  python koboldcpp_gm.py --cwd <workspace> --action "プレイヤーの行動"
  python koboldcpp_gm.py --cwd <workspace> --action "..." --url http://127.0.0.1:5001

Environment:
  KOBOLDCPP_URL, TA_GM_PYTHON
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
            f"KoboldCPP に接続できません ({endpoint})。koboldcpp.exe を起動し API ポートを確認してください: {e}"
        ) from e

    results = body.get("results") or []
    if not results:
        raise RuntimeError(f"KoboldCPP が空の応答を返しました: {body}")
    text = results[0].get("text") or ""
    if not text.strip():
        raise RuntimeError(f"KoboldCPP が空テキストを返しました: {body}")
    return text


def build_kobold_prompt(system: str, user: str) -> str:
    return (
        f"{system.strip()}\n\n"
        f"### Instruction:\n{user.strip()}\n\n"
        f"### Response:\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Text Adventure GM bridge via KoboldCPP")
    parser.add_argument("--cwd", required=True, help="Workspace root")
    add_player_action_args(parser)
    parser.add_argument(
        "--url",
        default=os.environ.get("KOBOLDCPP_URL", "http://127.0.0.1:5001"),
        help="KoboldCPP API base URL",
    )
    parser.add_argument("--max-length", type=int, default=2048, help="max_length for /api/v1/generate")
    parser.add_argument("--continue-game", action="store_true", help="継続プレイ")
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
    full_prompt = build_kobold_prompt(get_system_prompt(locale, cwd), user_prompt)

    print(f"[koboldcpp_gm] url={args.url} locale={locale}", flush=True)
    log_player_action_redacted(player_action, "[koboldcpp_gm]")

    try:
        raw = generate_kobold(args.url, full_prompt, max_length=args.max_length)
        print("[koboldcpp_gm] LLM response received, processing...", flush=True)
        state = process_llm_response(cwd, raw, locale=locale)
        print(f"[koboldcpp_gm] wrote {cwd / 'game_state.json'} (turn {state['entries'][0]['id']})", flush=True)
        return 0
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())