#!/usr/bin/env python3
# Live preview of the Krabbels website, straight from the project folders.
# No copying: /ux-demo/ is 5-demos/UX-demo, /testdemo/ is 5-demos/Testdemo, …
# Every page reloads by itself as soon as a file changes.
#
#   python3 9-website/dev.py          → http://localhost:5177
#   python3 9-website/dev.py 8000     → other port
import os, sys, time, threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROUTES = {  # url prefix → folder (same as bijwerken.py)
    "/wireframes/": ROOT / "3-design/wireframes/site",
    "/prototypes/drawing-life/": ROOT / "5-demos/Drawing Life",
    "/prototypes/main-game/": ROOT / "5-demos/Main Game",
    "/prototypes/draw-and-play/": ROOT / "5-demos/Draw and Play",
    "/testdemo/": ROOT / "5-demos/Testdemo",
    "/demo-stijl/": ROOT / "5-demos/Demo-v2",
    "/ux-demo/": ROOT / "5-demos/UX-demo",
}
WATCH = [HERE] + list(ROUTES.values())

RELOAD = b"""<script>(()=>{let v=null;setInterval(async()=>{try{const r=await fetch('/__versie',{cache:'no-store'});const n=await r.text();if(v&&n!==v)location.reload();v=n;}catch(e){}},600);})();</script>"""
BACK = '<a href="{up}" style="position:fixed;left:12px;bottom:12px;z-index:99999;font:600 13px/1 Inter,system-ui,sans-serif;color:#fff;background:rgba(34,34,34,.72);padding:8px 12px;border-radius:999px;text-decoration:none;opacity:.55">← overzicht</a>'


def latest():
    m = 0.0
    for base in WATCH:
        for dp, dn, fn in os.walk(base):
            dn[:] = [d for d in dn if d not in (".git", "node_modules", "v2", "prototypes", "testdemo", "demo-stijl", "ux-demo", "wireframes") or base != HERE]
            for f in fn:
                if f.startswith("."):
                    continue
                try:
                    m = max(m, os.stat(os.path.join(dp, f)).st_mtime)
                except OSError:
                    pass
    return m


VERSION = {"v": latest()}


def watcher():
    while True:
        VERSION["v"] = latest()
        time.sleep(0.4)


class Handler(SimpleHTTPRequestHandler):
    def route(self):
        path = unquote(urlsplit(self.path).path)
        for prefix in sorted(ROUTES, key=len, reverse=True):
            if path.startswith(prefix) or path + "/" == prefix:
                return ROUTES[prefix], path[len(prefix):], prefix
        return HERE, path.lstrip("/"), None

    def translate_path(self, path):
        base, rest, _ = self.route()
        p = (base / rest).resolve()
        return str(p)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/__versie"):
            body = str(VERSION["v"]).encode()
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
            return
        base, rest, prefix = self.route()
        path = unquote(urlsplit(self.path).path)
        if prefix and path + "/" == prefix:  # /ux-demo → /ux-demo/
            self.send_response(301); self.send_header("Location", prefix); self.end_headers(); return
        target = Path(self.translate_path(self.path))
        if target.is_dir():
            target = target / "index.html"
        if target.suffix == ".html" and target.exists():
            html = target.read_bytes()
            extra = RELOAD
            if prefix and b"krabbels-overzicht" not in html:
                extra += BACK.format(up="../" * prefix.strip("/").count("/") + "../").encode()
            low = html.lower()
            i = low.rfind(b"</body>")
            html = html[:i] + extra + html[i:] if i >= 0 else html + extra
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(html))); self.end_headers(); self.wfile.write(html)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5177
    threading.Thread(target=watcher, daemon=True).start()
    print(f"Krabbels live: http://localhost:{port}  (herlaadt vanzelf bij elke wijziging)")
    ThreadingHTTPServer(("", port), Handler).serve_forever()
