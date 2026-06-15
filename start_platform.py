from __future__ import annotations

import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / "backend"
HOST = "127.0.0.1"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def main() -> None:
    sys.path.insert(0, str(BACKEND_DIR))
    from server import Handler
    from http.server import ThreadingHTTPServer

    port = find_free_port()
    server = ThreadingHTTPServer((HOST, port), Handler)
    url = f"http://{HOST}:{port}"

    print(f"考研信息类专业可视化平台已启动: {url}")
    print(f"项目目录: {BASE_DIR}")
    print("目录结构: data 存数据，backend 存后端，frontend 存前端")
    print("按 Ctrl+C 关闭平台")

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.8)
    webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
