#!/usr/bin/env python3
"""
Context Summarizer for VSCode Text Adventure.
Reads game_history.json, generates a summary using the configured GM provider,
and updates game_state.json with the 'summary' field.
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Try to import common bridge logic
try:
    from gm_bridge_common import load_json_file, write_game_state, resolve_python
except ImportError:
    def load_json_file(path: Path):
        if not path.is_file(): return None
        try: return json.loads(path.read_text(encoding="utf-8"))
        except: return None
        
    def write_game_state(cwd: Path, state: dict):
        out = cwd / "game_state.json"
        out.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
        return out


def call_grok(prompt: str, cwd: Path) -> str:
    # Try to find grok binary
    grok_cmd = "grok"
    if os.name == 'nt':
        home = Path(os.environ.get("USERPROFILE", ""))
        grok_exe = home / ".grok" / "bin" / "grok.exe"
        if grok_exe.exists():
            grok_cmd = str(grok_exe)
            
    print(f"Calling Grok for summary...")
    proc = subprocess.run(
        [grok_cmd, "-p", prompt, "--yolo", "--raw"],
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    if proc.returncode != 0:
        print(f"Grok failed: {proc.stderr}", file=sys.stderr)
        return ""
    return proc.stdout.strip()


def call_ollama(prompt: str, url: str, model: str) -> str:
    if not url: url = "http://127.0.0.1:11434"
    if not model: model = "llama3"
    endpoint = f"{url.rstrip('/')}/api/generate"
    data = {
        "model": model,
        "prompt": prompt,
        "system": "You are a helpful assistant. Summarize the text precisely and concisely.",
        "stream": False
    }
    
    print(f"Calling Ollama ({model}) at {endpoint} for summary...")
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            return res.get("response", "").strip()
    except urllib.error.URLError as e:
        print(f"Ollama request failed: {e}", file=sys.stderr)
        return ""


def call_koboldcpp(prompt: str, url: str) -> str:
    if not url: url = "http://127.0.0.1:5001"
    endpoint = f"{url.rstrip('/')}/api/v1/generate"
    
    system_prompt = "You are a helpful assistant. Summarize the text precisely and concisely."
    full_prompt = f"{system_prompt}\n\nText to summarize:\n{prompt}\n\nSummary:"
    
    data = {
        "prompt": full_prompt,
        "max_length": 500,
        "temperature": 0.5,
        "top_p": 0.9,
    }
    
    print(f"Calling KoboldCPP at {endpoint} for summary...")
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            return res.get("results", [{}])[0].get("text", "").strip()
    except urllib.error.URLError as e:
        print(f"KoboldCPP request failed: {e}", file=sys.stderr)
        return ""


def call_openrouter(prompt: str, api_key: str, model: str) -> str:
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
            {"role": "system", "content": "You are a helpful assistant. Summarize the text precisely and concisely."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5,
        "max_tokens": 500
    }
    
    print(f"Calling OpenRouter ({model}) API for summary...", flush=True)
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode("utf-8"))
            choices = res.get("choices", [])
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "").strip()
    except urllib.error.HTTPError as e:
        print(f"OpenRouter HTTP Error {e.code}: {e.reason}", file=sys.stderr)
        return ""
    except urllib.error.URLError as e:
        print(f"OpenRouter Connection Error: {e.reason}", file=sys.stderr)
        return ""


def summarize(provider: str, cwd: Path):
    history_path = cwd / "game_history.json"
    history = load_json_file(history_path)
    if not history or not isinstance(history, list):
        print("No history found to summarize.")
        return
        
    text_to_summarize = ""
    for entry in history:
        if isinstance(entry, dict) and entry.get("content"):
            role = entry.get("sender", entry.get("role", "Unknown"))
            text_to_summarize += f"{role}: {entry['content']}\n\n"
            
    if len(text_to_summarize.strip()) < 100:
        print("History too short to summarize.")
        return

    if len(text_to_summarize) > 30000:
        text_to_summarize = "..." + text_to_summarize[-30000:]

    summary_prompt = (
        "Please summarize the following text adventure history into a concise synopsis. "
        "Focus on the main plot points, important character interactions, and current objectives. "
        "Keep the summary under 500 words and output ONLY the summary text.\n\n"
        f"--- History ---\n{text_to_summarize}\n--- End History ---\n\n"
        "Synopsis:"
    )

    summary_text = ""
    if provider == "ollama":
        url = os.environ.get("OLLAMA_URL", "")
        model = os.environ.get("OLLAMA_MODEL", "")
        summary_text = call_ollama(summary_prompt, url, model)
    elif provider == "koboldcpp":
        url = os.environ.get("KOBOLDCPP_URL", "")
        summary_text = call_koboldcpp(summary_prompt, url)
    elif provider == "openrouter":
        api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
        model = os.environ.get("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet").strip()
        if not api_key:
            print("Error: OPENROUTER_API_KEY is not set. Summary failed.", file=sys.stderr)
            sys.exit(1)
        summary_text = call_openrouter(summary_prompt, api_key, model)
    elif provider == "grok":
        summary_text = call_grok(summary_prompt, cwd)
    else:
        print(f"Summarizer not supported for provider: {provider}")
        sys.exit(1)

    if not summary_text:
        print("Failed to generate summary.", file=sys.stderr)
        sys.exit(1)
        
    print("\n--- Generated Summary ---")
    print(summary_text)
    
    state_path = cwd / "game_state.json"
    state = load_json_file(state_path) or {}
    state["summary"] = summary_text
    write_game_state(cwd, state)
    print("\ngame_state.json updated with new summary.")


def main():
    parser = argparse.ArgumentParser(description="Context Summarizer for GM Bridge")
    parser.add_argument("--cwd", type=str, default=".", help="Workspace path")
    parser.add_argument("--provider", type=str, required=True, help="GM provider (grok, ollama, koboldcpp)")
    args = parser.parse_args()

    cwd = Path(args.cwd).resolve()
    summarize(args.provider, cwd)


if __name__ == "__main__":
    main()
