#!/usr/bin/env python3
import argparse
import functools
import http.server
import json
import os
import posixpath
import socketserver
import urllib.parse


class SparkViewerHandler(http.server.SimpleHTTPRequestHandler):
    splat_extensions = {".spz", ".ply", ".splat", ".ksplat", ".sog"}
    allowed_log_extensions = splat_extensions | {".json", ".png", ".jpg", ".jpeg", ".txt"}

    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        clean_path = posixpath.normpath(urllib.parse.unquote(parsed.path))
        if clean_path.startswith("/"):
            clean_path = clean_path[1:]
        return os.path.join(self.directory, clean_path)

    def is_allowed_path(self, path):
        parsed = urllib.parse.urlparse(path)
        clean_path = posixpath.normpath(urllib.parse.unquote(parsed.path))
        if clean_path in {"/tools/spark_viewer", "/tools/spark_viewer/"}:
            return True
        if clean_path == "/tools/spark_viewer/index.html":
            return True
        if clean_path == "/Map2World/static/js/spark-navigation.js":
            return True
        if clean_path.startswith("/node_modules/"):
            return True
        if clean_path.startswith("/logs/"):
            _, ext = os.path.splitext(clean_path)
            return ext.lower() in self.allowed_log_extensions
        return False

    def list_runs(self):
        runs = []
        for log_root in ("logs",):
            logs_dir = os.path.join(self.directory, log_root)
            if not os.path.isdir(logs_dir):
                continue

            for current_dir, _, filenames in os.walk(logs_dir):
                files = []
                for filename in filenames:
                    _, ext = os.path.splitext(filename)
                    if ext.lower() not in self.splat_extensions:
                        continue
                    file_path = os.path.join(current_dir, filename)
                    rel_dir = os.path.relpath(current_dir, logs_dir)
                    rel_file = os.path.normpath(os.path.join(rel_dir, filename)) if rel_dir != "." else filename
                    files.append({
                        "name": rel_file,
                        "url": f"/{log_root}/{urllib.parse.quote(rel_file)}",
                        "size_bytes": os.path.getsize(file_path),
                    })
                if files:
                    files.sort(key=lambda item: (item["name"] != "stage1_sample.spz", item["name"] != "stage2_x2sr_sample.spz", item["name"] != "stage2_x4sr_sample.spz", item["name"]))
                    run_name = os.path.relpath(current_dir, logs_dir)
                    runs.append({
                        "name": f"{log_root}/{run_name}" if run_name != "." else log_root,
                        "mtime": os.path.getmtime(current_dir),
                        "files": files,
                    })
        runs.sort(key=lambda item: item["mtime"], reverse=True)
        return runs

    def send_json(self, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if urllib.parse.urlparse(self.path).path == "/api/runs":
            self.send_json({"runs": self.list_runs()})
            return
        if not self.is_allowed_path(self.path):
            self.send_error(403, "Only Spark viewer assets, node_modules, and logs splat assets are served.")
            return
        return super().do_GET()

    def do_HEAD(self):
        if not self.is_allowed_path(self.path):
            self.send_error(403, "Only Spark viewer assets, node_modules, and logs splat assets are served.")
            return
        return super().do_HEAD()


def main():
    parser = argparse.ArgumentParser(description="Serve the Spark viewer from the repo root.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--root", default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    args = parser.parse_args()

    handler = functools.partial(SparkViewerHandler, directory=args.root)
    with socketserver.TCPServer((args.host, args.port), handler) as httpd:
        print(f"Serving {args.root}")
        print(f"Open: http://{args.host}:{args.port}/tools/spark_viewer/?run=<logs-folder-name>")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
