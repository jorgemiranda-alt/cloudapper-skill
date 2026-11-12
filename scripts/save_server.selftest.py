# Self-check of save_server.py CORS: only https://*.cloudapper.com pages get CORS; Node-side PUTs still save.
import sys, tempfile, threading, urllib.request, importlib.util, os
d = tempfile.mkdtemp(); sys.argv = ["x", d, "8799"]
spec = importlib.util.spec_from_file_location("ss", os.path.join(os.path.dirname(os.path.abspath(__file__)), "save_server.py")); ss = importlib.util.module_from_spec(spec); spec.loader.exec_module(ss)
srv = ss.HTTPServer(("127.0.0.1", 8799), ss.Handler); threading.Thread(target=srv.serve_forever, daemon=True).start()
def opt(o):
    r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8799/x.json", method="OPTIONS", headers={"Origin": o}))
    return r.headers.get("Access-Control-Allow-Origin")
assert opt("https://web.cloudapper.com") == "https://web.cloudapper.com"
assert opt("https://m2sys.cloudapper.com") == "https://m2sys.cloudapper.com"
assert opt("https://evil.example") is None
assert opt("https://cloudapper.com.evil.io") is None
assert opt("http://web.cloudapper.com") is None
urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8799/t.json", data=b"{}", method="PUT"))
assert os.listdir(d) == ["t.json"]; srv.shutdown(); print("cors ok")
