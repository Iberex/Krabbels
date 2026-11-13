#!/usr/bin/env python3
"""Tiny static web server for the game (no install needed): python serve.py [port]
Only listens on this computer (127.0.0.1). Sends no-cache headers so a `git pull` shows up right away."""
import http.server
import mimetypes
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
ROOT = os.path.dirname(os.path.abspath(__file__))

# Windows sometimes maps .js/.mjs to text/plain via the registry: browsers then refuse ES modules.
for ext, typ in {".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
                 ".css": "text/css", ".task": "application/octet-stream"}.items():
    mimetypes.add_type(typ, ext)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # quiet


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Krabbels: http://localhost:{PORT}/?bron=femto  of  ?bron=webcam   (Ctrl+C = stoppen)")
        httpd.serve_forever()
