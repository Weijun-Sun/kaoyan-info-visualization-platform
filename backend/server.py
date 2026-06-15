from __future__ import annotations

import csv
import io
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pandas as pd

from data_service import dashboard_data, filter_data, get_options, get_summary, json_records


BASE_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = BASE_DIR / "frontend"
HOST = "127.0.0.1"


def _json(handler: SimpleHTTPRequestHandler, payload, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _csv(handler: SimpleHTTPRequestHandler, df: pd.DataFrame) -> None:
    buffer = io.StringIO()
    df.to_csv(buffer, index=False, quoting=csv.QUOTE_MINIMAL)
    body = buffer.getvalue().encode("utf-8-sig")
    handler.send_response(200)
    handler.send_header("Content-Type", "text/csv; charset=utf-8")
    handler.send_header("Content-Disposition", 'attachment; filename="kaoyan_search.csv"')
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)

        try:
            if path == "/api/health":
                return _json(self, {"ok": True, "summary": get_summary()})
            if path == "/api/summary":
                return _json(self, get_summary())
            if path == "/api/options":
                return _json(self, get_options())
            if path == "/api/dashboard":
                return _json(self, dashboard_data())
            if path == "/api/search":
                year_value = params.get("year", [""])[0]
                year = int(year_value) if year_value.isdigit() else None
                df = filter_data(
                    year=year,
                    school=params.get("school", [""])[0],
                    keyword=params.get("keyword", [""])[0],
                    min_score=_parse_float(params.get("minScore", [""])[0]),
                    max_score=_parse_float(params.get("maxScore", [""])[0]),
                )
                if params.get("export", ["0"])[0] == "1":
                    return _csv(self, df)
                limit = int(params.get("limit", ["300"])[0])
                return _json(self, {"total": int(len(df)), "rows": json_records(df.head(limit))})
            return super().do_GET()
        except Exception as exc:
            return _json(self, {"error": str(exc)}, status=500)


def run(port: int | None = None) -> None:
    resolved_port = port or int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer((HOST, resolved_port), Handler)
    print(f"考研信息类专业可视化平台已启动: http://{HOST}:{resolved_port}")
    print(f"前端目录: {FRONTEND_DIR}")
    print(f"数据目录: {BASE_DIR / 'data'}")
    server.serve_forever()


if __name__ == "__main__":
    run()
