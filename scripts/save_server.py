"""Tiny localhost PUT server that saves request bodies as files (used by export-app.js).

Usage: python -I save_server.py <output_dir> [port]   (default port 8766)
Binds to 127.0.0.1 only and keeps the basename of each path, so a request can't write outside
<output_dir>. Allows CORS so a script on the CloudApper page can PUT to it. Stop it when done.
GET /<name>.js returns that script from this folder, so a Playwright call can load export-app.js
without pasting (and echoing) its source. GET /app.json returns the last export's app.json.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer as HTTPServer
from urllib.parse import unquote

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8766


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        # Chrome's private network access check for a public page calling localhost.
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        name = os.path.basename(unquote(self.path.split("?")[0]))
        # .js from this folder (skill scripts), app.json from the export folder (freshness check).
        folder = os.path.dirname(os.path.abspath(__file__)) if name.endswith(".js") else OUT
        path = os.path.join(folder, name)
        if not (name.endswith(".js") or name == "app.json") or not os.path.isfile(path):
            self.send_response(404)
            self.end_headers()
            return
        body = open(path, "rb").read()
        self.send_response(200)
        self.send_header("Content-Type", "text/javascript")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_PUT(self):
        name = os.path.basename(unquote(self.path.split("?")[0]))
        if not name or name.startswith("."):
            self.send_response(400)
            self._cors()
            self.end_headers()
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(body)
        self.send_response(201)
        self._cors()
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print(f"saving to {OUT} on http://127.0.0.1:{PORT}/")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
