"""Tiny localhost PUT server that saves request bodies as files (used by export-app.js).

Usage: python -I save_server.py <output_dir> [port]   (default port 8766)
Binds to 127.0.0.1 only and keeps the basename of each path, so a request can't write outside
<output_dir>. Allows CORS so a script on the CloudApper page can PUT to it. Stop it when done.
"""
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
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
