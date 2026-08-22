#!/usr/bin/env python3
"""task_api.py · 任务箱微型 API（零依赖，标准库实现）

启动: python3 scripts/task_api.py [端口]   # 默认 8787
路由:
  GET  /api/projects                     项目列表
  POST /api/projects      {id,name}      建项目
  GET  /api/{pid}/board                  看板数据 {tasks, events}
  POST /api/{pid}/tasks   {id,title,...} 新建卡
  PATCH/api/{pid}/tasks/{tid}            改卡（col/status/summary/owner）
  POST /api/{pid}/events  {dir,ev,detail} 加事件
数据: tasks/box.db（SQLite WAL）· 校验逻辑统一在 task_box.py
"""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import task_box
from task_box import BoxError, add_event, add_project, check_board, get_board, list_projects, update_task, upsert_task

ROUTE_TASK = re.compile(r"^/api/([^/]+)/tasks/([^/]+)$")
ROUTE_BOARD = re.compile(r"^/api/([^/]+)/board$")
ROUTE_EVENTS = re.compile(r"^/api/([^/]+)/events$")
ROUTE_TASKS = re.compile(r"^/api/([^/]+)/tasks$")


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n)) if n else {}

    def do_OPTIONS(self):
        self._send(204, {})

    def _route(self) -> str:
        """归一化路径：剥掉查询串（?t=...），只留路由部分"""
        return self.path.split("?", 1)[0]

    def do_GET(self):
        p = self._route()
        if p == "/api/projects":
            self._send(200, list_projects())
            return
        m = ROUTE_BOARD.match(p)
        if m:
            try:
                self._send(200, get_board(m.group(1)))
            except BoxError as e:
                self._send(404, {"error": str(e)})
            return
        # 静态文件（dashboard.html / tasks/threads/*.md 等），限定项目根内
        import os
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        rel = os.path.normpath(self.path.split("?")[0].lstrip("/")) or "dashboard.html"
        path = os.path.join(root, rel)
        if not path.startswith(root) or not os.path.isfile(path):
            self._send(404, {"error": "not found"})
            return
        ctype = ("text/html" if path.endswith(".html") else
                 "text/markdown" if path.endswith(".md") else
                 "application/json" if path.endswith(".json") else
                 "image/png" if path.endswith(".png") else "text/plain")
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            p = self._route()
            if p == "/api/projects":
                b = self._body()
                add_project(b["id"], b["name"])
                self._send(200, {"ok": True})
                return
            m = ROUTE_TASKS.match(p)
            if m:
                b = self._body()
                upsert_task(m.group(1), b["id"], b["title"],
                            status=b.get("status", ""), owner=b.get("owner", ""),
                            col=b.get("col", "inbox"), summary=b.get("summary", ""),
                            thread=b.get("thread", ""))
                self._send(200, {"ok": True})
                return
            m = ROUTE_EVENTS.match(p)
            if m:
                b = self._body()
                if not b.get("ev"):
                    raise BoxError("events 需要 ev 字段")
                add_event(m.group(1), b["ev"], dir_=b.get("dir", ""),
                          detail=b.get("detail", ""), t=b.get("t"))
                cols = check_board(m.group(1))  # 写后自动断言
                self._send(200, {"ok": True, "cols": cols})
                return
            self._send(404, {"error": "no route"})
        except (BoxError, KeyError) as e:
            self._send(400, {"error": str(e)})

    def do_PATCH(self):
        try:
            m = ROUTE_TASK.match(self._route())
            if not m:
                self._send(404, {"error": "no route"})
                return
            b = self._body()
            row = update_task(m.group(1), m.group(2),
                              col=b.get("col"), status=b.get("status"),
                              summary=b.get("summary"), owner=b.get("owner"))
            cols = check_board(m.group(1))
            self._send(200, {"ok": True, "task": row, "cols": cols})
        except (BoxError, KeyError) as e:
            self._send(400, {"error": str(e)})


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(task_box.init_db())
    print(f"[task_api] http://127.0.0.1:{port} · db={task_box.DB_PATH}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
