#!/usr/bin/env python3
"""
OpenRouter GM Bridge for VSCode Text Adventure.
Calls OpenRouter's Chat Completions API.
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path

from gm_bridge_common import (
    add_player_action_args,
    build_user_prompt,
    get_latest_image_path,
    get_system_prompt,
    log_player_action_redacted,
    process_llm_response,
    read_player_action,
)


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def encode_image(image_path: Path) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')


def call_openrouter(api_key: str, model: str, system_prompt: str, user_prompt: str, max_tokens: int, image_path: Path | None = None) -> str:
    endpoint = "https://openrouter.ai/api/v1/chat/completions"
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/keisuke/text-adventure-vsce", # Required by OpenRouter
        "X-Title": "VSCode Text Adventure", # Required by OpenRouter
    }
    
    messages = [{"role": "system", "content": system_prompt}]
    
    if image_path and image_path.is_file():
        mime_type, _ = mimetypes.guess_type(str(image_path))
        if not mime_type:
            mime_type = "image/jpeg"
        base64_image = encode_image(image_path)
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{base64_image}"
                    }
                }
            ]
        })
    else:
        messages.append({"role": "user", "content": user_prompt})
    
    data = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens
    }
    
    print(f"Calling OpenRouter ({model}, max_tokens={max_tokens}) API...", flush=True)
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=90) as response:
            res = json.loads(response.read().decode("utf-8"))
            choices = res.get("choices", [])
            if not choices:
                print("No choices returned from OpenRouter.", file=sys.stderr)
                return ""
            return choices[0].get("message", {}).get("content", "").strip()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"OpenRouter HTTP Error {e.code}: {e.reason}\nBody: {err_body}", file=sys.stderr)
        return ""
    except urllib.error.URLError as e:
        print(f"OpenRouter Connection Error: {e.reason}", file=sys.stderr)
        return ""


def main():
    parser = argparse.ArgumentParser(description="OpenRouter GM Bridge")
    parser.add_argument("--cwd", type=str, required=True, help="Workspace path")
    add_player_action_args(parser)
    parser.add_argument("--locale", type=str, default="en", help="Target language locale")
    parser.add_argument("--continue-game", action="store_true", help="Is continuation")
    parser.add_argument("--model", type=str, default="anthropic/claude-3.5-sonnet", help="OpenRouter model")
    parser.add_argument("--max-tokens", type=int, default=env_int("OPENROUTER_MAX_TOKENS", 3000), help="OpenRouter max_tokens")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    
    if not api_key:
        print("Error: OPENROUTER_API_KEY environment variable is missing.", file=sys.stderr)
        sys.exit(1)

    try:
        player_action = read_player_action(args)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    system_prompt = get_system_prompt(args.locale, cwd)
    user_prompt = build_user_prompt(cwd, player_action, args.continue_game, args.locale)

    print("--- OpenRouter GM Bridge ---")
    print(f"Model: {args.model}")
    print(f"Locale: {args.locale}")

    image_path = get_latest_image_path(cwd)
    if image_path:
        print(f"Vision Context: Found latestImage at {image_path.name}")

    log_player_action_redacted(player_action)

    response_text = call_openrouter(api_key, args.model, system_prompt, user_prompt, args.max_tokens, image_path)
    if not response_text:
        print("Error: Failed to get response from OpenRouter API.", file=sys.stderr)
        sys.exit(1)

    print("\n--- LLM Response ---")
    print(response_text)

    # Dice resolution and state update
    print("\n--- Updating Game State ---")
    process_llm_response(cwd, response_text, locale=args.locale)
    print("Done.")


if __name__ == "__main__":
    main()
