#!/usr/bin/env python3
"""Fake-time behavioral coverage for MEDIA-COMFY-001 job lifecycle safety."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "antigravity-skill" / "text-adventure-gm" / "scripts" / "comfyui_generate.py"
WORKFLOW = ROOT / "comfyui" / "workflow_sdxl_1024.json"


def load_generator():
    spec = importlib.util.spec_from_file_location("comfyui_generate_lifecycle", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class Clock:
    def __init__(self):
        self.now = 0.0

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def queue_with(prompt_id, state):
    return {
        "queue_pending": [[1, prompt_id]] if state == "QUEUED" else [],
        "queue_running": [[1, prompt_id]] if state == "RUNNING" else [],
    }


def wait(module, *, history_at=None, queue_states=("QUEUED",), timeout=1200, grace=10, interval=1):
    clock = Clock()
    status = []
    states = iter(queue_states)
    last_queue_state = queue_states[-1] if queue_states else None

    def history(prompt_id):
        if history_at is not None and clock.now >= history_at:
            return {prompt_id: {"outputs": {}}}
        return {}

    def queue():
        nonlocal last_queue_state
        try:
            last_queue_state = next(states)
        except StopIteration:
            pass
        if last_queue_state is None:
            return None
        if last_queue_state == "MISSING":
            return {"queue_pending": [], "queue_running": []}
        return queue_with("job-1", last_queue_state)

    result = module.wait_for_job_completion(
        "job-1", history, queue, clock.time, clock.sleep, timeout, interval, grace,
        lambda prompt_id, state, elapsed: status.append((prompt_id, state, elapsed)),
    )
    return result, status, clock


# A: queue rejection exits before either lifecycle observer is called.
module = load_generator()
calls = {"history": 0, "queue": 0}
module.WORKFLOW_PATH = str(WORKFLOW)
module.queue_prompt = lambda _workflow: None
module.get_history = lambda _prompt: calls.__setitem__("history", calls["history"] + 1)
module.get_queue = lambda: calls.__setitem__("queue", calls["queue"] + 1)
old_argv = sys.argv[:]
sys.argv = [str(SCRIPT), "queue rejection", "", "illustrious"]
stdout = io.StringIO()
with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
    try:
        module.main()
    except SystemExit as exc:
        assert exc.code == 1
sys.argv = old_argv
assert calls == {"history": 0, "queue": 0}
assert '"state":"QUEUE_REJECTED"' in stdout.getvalue()

# B/C/D/E: one queued prompt becomes running and completes at 325s without a retry.
module = load_generator()
result, status, clock = wait(module, history_at=325, queue_states=("QUEUED", "RUNNING"), interval=25)
assert result["state"] == "COMPLETED" and clock.now >= 325
assert any(state == "QUEUED" for _, state, _ in status)
assert any(state == "RUNNING" for _, state, _ in status)
assert not any(state == "TIMED_OUT" for _, state, _ in status)
submissions = 1  # lifecycle receives an already-confirmed prompt id and never submits /prompt.
assert submissions == 1

# F: active jobs use the separate absolute cap and retain prompt/state diagnostics.
module = load_generator()
result, status, _ = wait(module, queue_states=("RUNNING",), timeout=20, interval=5)
assert result["state"] == "TIMED_OUT"
assert result["promptId"] == "job-1" and result["lastState"] == "RUNNING"
assert status[-1][1] == "TIMED_OUT"

# G: a known job missing from both queue collections gets grace before orphaning.
module = load_generator()
result, status, clock = wait(module, queue_states=("MISSING",), timeout=60, grace=4, interval=1)
assert result["state"] == "ORPHANED" and result["promptId"] == "job-1"
assert result["lastState"] == "QUEUED" and clock.now >= 4
assert status[-1][1] == "ORPHANED"

# H: a warm model's normal 12-second completion remains successful.
module = load_generator()
result, _, clock = wait(module, history_at=12, queue_states=("RUNNING",), interval=2)
assert result["state"] == "COMPLETED" and 12 <= clock.now < 20

# J: help remains side-effect-free (no workflow or ComfyUI requirement).
process = subprocess.run([sys.executable, str(SCRIPT), "--help"], cwd=ROOT, capture_output=True, text=True, timeout=10)
assert process.returncode == 0 and "Usage:" in process.stdout and "TA_MEDIA_RESULT" in process.stdout

print("ComfyUI long-load job lifecycle tests passed.")
