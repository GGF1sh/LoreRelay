#!/usr/bin/env python3
"""One bounded API exchange for the Host adapter; never opens campaign files."""
import json
import sys
import urllib.error
from openrouter_gm import call_openai_compatible


def main():
    raw = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
    if len(raw) > 4 * 1024 * 1024:
        raise ValueError("deepseek_input_too_large")
    request = json.loads(raw.decode("utf-8"))
    key = request.get("apiKey")
    if not isinstance(key, str) or not key or len(key) > 4096 or "\n" in key or "\r" in key:
        raise ValueError("deepseek_key_required")
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + key}
    if request.get("operation") == "models":
        endpoint, payload = "https://api.deepseek.com/models", None
    elif request.get("operation") == "generate":
        model, prompt, limit = request.get("model"), request.get("prompt"), request.get("maxTokens")
        if not isinstance(model, str) or not model or not isinstance(prompt, str):
            raise ValueError("deepseek_invalid_request")
        if type(limit) is not int or not 1 <= limit <= 32768:
            raise ValueError("deepseek_invalid_limit")
        endpoint = "https://api.deepseek.com/chat/completions"
        payload = {"model": model, "messages": [{"role": "user", "content": prompt}],
                   "max_tokens": limit, "stream": False, "thinking": {"type": "disabled"}}
    else:
        raise ValueError("deepseek_invalid_request")
    result = call_openai_compatible(endpoint, headers, payload, max_response_bytes=4 * 1024 * 1024,
                                   allow_redirects=False)
    print(json.dumps({"result": result}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(json.dumps({"error": "deepseek_http_error", "status": error.code}), flush=True)
        sys.exit(1)
    except Exception:
        # Never print provider errors, credentials, prompt text or account data.
        print(json.dumps({"error": "deepseek_request_failed"}), flush=True)
        sys.exit(1)
