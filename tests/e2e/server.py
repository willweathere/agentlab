"""A tiny static server for the built app, with the same SPA fallback Netlify uses.

Used by the browser tests and the screenshot script so they run against the production build.
"""

from __future__ import annotations

import contextlib
import http.server
import socketserver
import threading
from functools import partial
from pathlib import Path

DIST = Path(__file__).resolve().parents[2] / "dist"


class SpaHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep test output quiet
        pass

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if not path.exists() or (path.is_dir() and not (path / "index.html").exists()):
            self.path = "/index.html"
        return super().send_head()


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


@contextlib.contextmanager
def serve(port: int = 5630):
    if not (DIST / "index.html").exists():
        raise SystemExit("dist/ is missing. Run `npm run build` first.")
    handler = partial(SpaHandler, directory=str(DIST))
    httpd = _Server(("127.0.0.1", port), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        httpd.shutdown()
        httpd.server_close()
