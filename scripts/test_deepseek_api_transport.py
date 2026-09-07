import io
import json
import pathlib
import sys
import unittest
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from contextlib import redirect_stdout
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "antigravity-skill/text-adventure-gm/scripts"))
import deepseek_gm
import openrouter_gm


class TransportTests(unittest.TestCase):
    def run_request(self, request):
        output = io.StringIO()
        with patch.object(sys, "stdin", io.TextIOWrapper(io.BytesIO(json.dumps(request).encode()))), \
                patch.object(deepseek_gm, "call_openai_compatible", return_value={"choices": []}) as call, \
                redirect_stdout(output):
            deepseek_gm.main()
        return call, json.loads(output.getvalue())

    def test_readiness_does_not_send_prompt(self):
        call, _ = self.run_request({"operation": "models", "apiKey": "fixture"})
        self.assertEqual(call.call_args.args[0], "https://api.deepseek.com/models")
        self.assertIsNone(call.call_args.args[2])
        self.assertFalse(call.call_args.kwargs["allow_redirects"])

    def test_generation_is_single_bounded_request(self):
        call, _ = self.run_request({"operation": "generate", "apiKey": "fixture", "model": "fixture-model",
                                    "maxTokens": 2048, "prompt": "fixture"})
        self.assertEqual(call.call_count, 1)
        payload = call.call_args.args[2]
        self.assertEqual(payload["max_tokens"], 2048)
        self.assertEqual(payload["model"], "fixture-model")
        self.assertNotIn("tools", payload)

    def test_invalid_budget_rejected_before_network(self):
        for limit in [0, 32769, True, "2048"]:
            with self.assertRaises(ValueError):
                self.run_request({"operation": "generate", "apiKey": "fixture", "model": "fixture",
                                  "maxTokens": limit, "prompt": "fixture"})

    def test_legacy_openrouter_reuses_transport(self):
        with patch.object(openrouter_gm, "call_openai_compatible", return_value={"choices": [{"message": {"content": "ok"}}]}) as call, \
                redirect_stdout(io.StringIO()):
            self.assertEqual(openrouter_gm.call_openrouter("fixture", "model", "system", "user", 100), "ok")
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0], "https://openrouter.ai/api/v1/chat/completions")

    def test_redirect_does_not_forward_key_and_response_is_bounded(self):
        paths = []
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_GET(self):
                paths.append(self.path)
                if self.path == "/redirect":
                    self.send_response(302)
                    self.send_header("Location", "/destination")
                    self.end_headers()
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"large":"' + b'x' * 100 + b'"}')
        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(server.server_port)
        try:
            with self.assertRaises(urllib.error.HTTPError) as redirected:
                openrouter_gm.call_openai_compatible(base + "/redirect", {"Authorization": "Bearer fixture"}, None,
                                                    allow_redirects=False, max_response_bytes=32)
            redirected.exception.close()
            self.assertEqual(paths, ["/redirect"])
            with self.assertRaisesRegex(ValueError, "too_large"):
                openrouter_gm.call_openai_compatible(base + "/large", {}, None, allow_redirects=False, max_response_bytes=32)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
