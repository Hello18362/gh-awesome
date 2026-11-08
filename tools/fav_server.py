#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""本地收藏服务：静态站 + /api/fav 持久化。

为什么需要它：WorkBuddy 的预览窗口把网页放在 sandbox iframe 里跑（opaque origin），
页面里 localStorage / cookie / IndexedDB 全部不可用，收藏只能活在内存里。
这个服务把收藏存到 data/favorites.json，页面通过 HTTP 读写，绕开浏览器限制。

    python3 tools/fav_server.py            # 启动（Ctrl+C 停止）
    python3 tools/fav_server.py --open     # 启动并打开浏览器

接口：
    GET  /api/health   -> {"app":"gh-awesome","ok":true}
    GET  /api/fav      -> {"owner/repo": 时间戳, ...}
    POST /api/fav      <- 同上，整体覆盖写（原子替换）
其余路径按静态文件返回。
"""
import argparse
import http.server
import json
import os
import socketserver
import sys
import tempfile
import threading
import urllib.parse
import webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
DATA = os.path.join(DATA_DIR, "favorites.json")
PORTS = list(range(8765, 8776))          # 页面按这个范围探测

LOCK = threading.Lock()


def load_fav():
    try:
        with open(DATA, encoding="utf-8") as f:
            obj = json.load(f)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def save_fav(obj):
    os.makedirs(DATA_DIR, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, prefix=".favorites-", suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp, DATA)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/health":
            return self._json(200, {"app": "gh-awesome", "ok": True, "count": len(load_fav())})
        if path == "/api/fav":
            return self._json(200, load_fav())
        return super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path != "/api/fav":
            return self._json(404, {"ok": False, "error": "not found"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n > 1024 * 512:
            return self._json(413, {"ok": False, "error": "too large"})
        raw = self.rfile.read(n) if n else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            return self._json(400, {"ok": False, "error": "bad json"})
        if not isinstance(payload, dict):
            return self._json(400, {"ok": False, "error": "expect object"})

        # 增量语义：{"set": {名字: 时间戳}, "del": [名字]}
        # 只合并，不做整份覆盖 —— 空页面永远不可能把数据冲掉
        add = payload.get("set") or {}
        rem = payload.get("del") or []
        if not isinstance(add, dict):
            return self._json(400, {"ok": False, "error": "set must be object"})
        if not isinstance(rem, list):
            rem = []

        with LOCK:
            data = load_fav()
            for k, v in add.items():
                if isinstance(k, str) and 0 < len(k) < 200:
                    data[k] = v
            for k in rem:
                if isinstance(k, str):
                    data.pop(k, None)
            save_fav(data)

        return self._json(200, {"ok": True, "count": len(data)})

    def log_message(self, fmt, *args):
        pass


def already_running(port):
    """端口上是不是已经有我们自己的服务"""
    try:
        import urllib.request
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/api/health", timeout=0.8
        ) as r:
            return json.loads(r.read().decode("utf-8")).get("app") == "gh-awesome"
    except Exception:
        return False


class Server(socketserver.ThreadingTCPServer):
    # 进程退出后端口会进 TIME_WAIT，默认设置下 60 秒内绑不上，
    # 会白白漂移到 8766、8767…所以必须允许地址复用。
    allow_reuse_address = True
    daemon_threads = True


def bind(preferred=None):
    ports = [preferred] + [p for p in PORTS if p != preferred] if preferred else PORTS
    for port in ports:
        try:
            return Server(("127.0.0.1", port), Handler), port
        except OSError:
            if already_running(port):
                print(f"收藏服务已经在 {port} 端口运行了，不重复启动。")
                raise SystemExit(0)
            continue
    raise SystemExit("8765–8775 都被占用了，先把占用的进程关掉")


def daemonize():
    """双 fork + setsid 完全脱离父进程：
    关掉终端、退出脚本都不会影响它，比 nohup 更彻底。"""
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)
    os.chdir(ROOT)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open", action="store_true", help="启动后自动打开浏览器")
    ap.add_argument("--port", type=int, help="指定端口（默认自动挑 8765 起）")
    ap.add_argument("--daemon", action="store_true", help="脱离终端后台常驻")
    args = ap.parse_args()

    if args.daemon:
        daemonize()

    if args.port:
        httpd, port = bind(args.port)
    else:
        httpd, port = bind()

    url = f"http://127.0.0.1:{port}/index.html"
    print(f"收藏服务已启动：{url}")
    print(f"收藏保存在：{DATA}")
    if args.daemon:
        print("已在后台常驻，关掉这个窗口也不影响。")
    else:
        print("这个窗口别关；按 Ctrl+C 停止。")
    sys.stdout.flush()
    if args.open:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
