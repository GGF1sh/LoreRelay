"""summarize_gm.py / archive_saga.py 共通の LLM 呼び出し（Grok / Ollama / Kobold / OpenRouter）"""
from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


def call_grok(prompt: str, cwd: Path) -> str:
    grok_cmd = "grok"
    if os.name == "nt":
        home = Path(os.environ.get("USERPROFILE", ""))
        grok_exe = home / ".grok" / "bin" / "grok.exe"
        if grok_exe.exists():
            grok_cmd = str(grok_exe)

    proc = subprocess.run(
        [grok_cmd, "-p", prompt, "--yolo", "--raw"],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if proc.returncode != 0:
        print(f"Grok failed: {proc.stderr}", flush=True)
        return ""
    return proc.stdout.strip()


def call_ollama(prompt: str, system: str, url: str, model: str) -> str:
    if not url:
        url = "http://127.0.0.1:11434"
    if not model:
        model = "llama3"
    endpoint = f"{url.rstrip('/')}/api/generate"
    data = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            return res.get("response", "").strip()
    except urllib.error.URLError as e:
        print(f"Ollama request failed: {e}", flush=True)
        return ""


def call_koboldcpp(prompt: str, system: str, url: str, max_length: int = 800) -> str:
    if not url:
        url = "http://127.0.0.1:5001"
    endpoint = f"{url.rstrip('/')}/api/v1/generate"
    full_prompt = f"{system}\n\n{prompt}"
    data = {
        "prompt": full_prompt,
        "max_length": max_length,
        "temperature": 0.6,
        "top_p": 0.9,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            return res.get("results", [{}])[0].get("text", "").strip()
    except urllib.error.URLError as e:
        print(f"KoboldCPP request failed: {e}", flush=True)
        return ""


def call_openrouter(prompt: str, system: str, api_key: str, model: str, max_tokens: int = 800) -> str:
    endpoint = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://github.com/keisuke/text-adventure-vsce",
        "X-Title": "VSCode Text Adventure",
    }
    data = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.6,
        "max_tokens": max_tokens,
    }
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            choices = res.get("choices", [])
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "").strip()
    except urllib.error.HTTPError as e:
        print(f"OpenRouter HTTP Error {e.code}: {e.reason}", flush=True)
        return ""
    except urllib.error.URLError as e:
        print(f"OpenRouter Connection Error: {e.reason}", flush=True)
        return ""


def complete_text(
    provider: str,
    cwd: Path,
    system: str,
    user_prompt: str,
    *,
    max_tokens: int = 800,
) -> str:
    if provider == "ollama":
        url = os.environ.get("OLLAMA_URL", "")
        model = os.environ.get("OLLAMA_MODEL", "")
        return call_ollama(user_prompt, system, url, model)
    if provider == "koboldcpp":
        url = os.environ.get("KOBOLDCPP_URL", "")
        return call_koboldcpp(user_prompt, system, url, max_length=max_tokens)
    if provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet").strip()
        if not api_key:
            print("Error: OPENROUTER_API_KEY is not set.", flush=True)
            return ""
        return call_openrouter(user_prompt, system, api_key, model, max_tokens=max_tokens)
    if provider == "grok":
        full = f"{system}\n\n{user_prompt}"
        return call_grok(full, cwd)
    print(f"Unsupported provider: {provider}", flush=True)
    return ""