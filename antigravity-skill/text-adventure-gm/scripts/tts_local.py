#!/usr/bin/env python3
"""
Local TTS bridge for LoreRelay Phase 11B.

Reads one JSON object from stdin:
  {"text": "...", "voice": "en-US-AriaNeural", "rate": "+0%", "lang": "en-US", "outputPath": "..."}

Writes MP3 to outputPath and prints one JSON line to stdout:
  {"ok": true, "audioPath": "...", "mimeType": "audio/mpeg"}
"""
from __future__ import annotations

import asyncio
import json
import sys


def _fail(msg: str) -> None:
    print(json.dumps({"ok": False, "error": msg}), flush=True)
    sys.exit(1)


async def _synthesize_edge(text: str, voice: str, rate: str, output_path: str) -> None:
    import edge_tts  # type: ignore

    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output_path)


def main() -> None:
    raw = sys.stdin.read()
    if not raw.strip():
        _fail("empty stdin")

    try:
        req = json.loads(raw)
    except json.JSONDecodeError:
        _fail("invalid stdin JSON")

    text = str(req.get("text", "")).strip()
    if not text:
        _fail("empty text")

    text = text[:4000]
    voice = str(req.get("voice", "en-US-AriaNeural")).strip() or "en-US-AriaNeural"
    rate = str(req.get("rate", "+0%")).strip() or "+0%"
    output_path = str(req.get("outputPath", "")).strip()
    if not output_path:
        _fail("missing outputPath")

    try:
        asyncio.run(_synthesize_edge(text, voice, rate, output_path))
    except ImportError:
        _fail("edge-tts not installed (pip install edge-tts)")
    except Exception as exc:  # noqa: BLE001 — return message to extension host
        _fail(str(exc)[:200])

    print(
        json.dumps({"ok": True, "audioPath": output_path, "mimeType": "audio/mpeg"}),
        flush=True,
    )


if __name__ == "__main__":
    main()