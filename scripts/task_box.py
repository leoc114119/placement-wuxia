#!/usr/bin/env python3
"""task_box.py · 任务箱 SQLite 核心（放置武侠）

数据源升级（Leo 2026-08-22 拍板）：index.json 冻结退役，结构化状态迁入 tasks/box.db；
threads/LOG/questions/answers 等 Markdown 叙事层不变。
CLI(scripts/task.py) 与 API(scripts/task_api.py) 共用本模块——单一校验入口。

col 六值白名单 = 物理目录口径：inbox / working / questions / done / archive / backlog
"""
import json
import os
import sqlite3
from datetime import datetime

TASKS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tasks")
DB_PATH = os.path.join(TASKS_DIR, "box.db")

VALID_COLS = ["inbox", "working", "questions", "done", "archive", "backlog"]
DEFAULT_PROJECT = "placement-wuxia"

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS tasks(
  project_id TEXT NOT NULL REFERENCES projects(id),
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT DEFAULT '',
  owner TEXT DEFAULT '',
  col TEXT NOT NULL DEFAULT 'inbox',
  summary TEXT DEFAULT '',
  thread TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  PRIMARY KEY(project_id, id)
);
CREATE TABLE IF NOT EXISTS events(
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  t TEXT NOT NULL,
  dir TEXT DEFAULT '',
  ev TEXT NOT NULL,
  detail TEXT DEFAULT ''
);
"""


def now_stamp() -> str:
    return datetime.now().strftime("%m-%d %H:%M")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(import_index_json: bool = True) -> str:
    """建库建表；可选地从旧 index.json 一次性导入存量数据（幂等）。"""
    conn = connect()
    conn.executescript(SCHEMA)
    imported = ""
    if import_index_json and not conn.execute("SELECT 1 FROM projects LIMIT 1").fetchone():
        idx_path = os.path.join(TASKS_DIR, "index.json")
        if os.path.exists(idx_path):
            with open(idx_path, encoding="utf-8") as f:
                idx = json.load(f)
            conn.execute("INSERT INTO projects(id, name) VALUES(?,?)",
                         (DEFAULT_PROJECT, "放置武侠"))
            for t in idx.get("tasks", []):
                conn.execute(
                    "INSERT OR IGNORE INTO tasks(project_id,id,title,status,owner,col,summary,thread)"
                    " VALUES(?,?,?,?,?,?,?,?)",
                    (DEFAULT_PROJECT, t.get("id", ""), t.get("title", ""),
                     t.get("status", ""), t.get("owner", ""), t.get("col", "inbox"),
                     t.get("summary", ""), t.get("thread", "")))
            for e in idx.get("events", []):
                conn.execute(
                    "INSERT INTO events(project_id,t,dir,ev,detail) VALUES(?,?,?,?,?)",
                    (DEFAULT_PROJECT, e.get("t", ""), e.get("dir", ""),
                     e.get("ev", ""), e.get("detail", "")))
            imported = f"已从 index.json 导入 {len(idx.get('tasks', []))} 卡 / {len(idx.get('events', []))} 事件"
        else:
            conn.execute("INSERT INTO projects(id, name) VALUES(?,?)",
                         (DEFAULT_PROJECT, "放置武侠"))
    conn.commit()
    conn.close()
    return imported or "库已存在，跳过导入"


class BoxError(Exception):
    pass


def _require_project(conn, pid: str):
    if not conn.execute("SELECT 1 FROM projects WHERE id=?", (pid,)).fetchone():
        raise BoxError(f"项目不存在: {pid}")


def list_projects() -> list:
    conn = connect()
    rows = conn.execute("SELECT * FROM projects ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_project(pid: str, name: str):
    conn = connect()
    conn.execute("INSERT INTO projects(id,name) VALUES(?,?)", (pid, name))
    conn.commit()
    conn.close()


def get_board(pid: str) -> dict:
    """dashboard 数据源：tasks + events（events 倒序，最新在上）。"""
    conn = connect()
    _require_project(conn, pid)
    tasks = [dict(r) for r in conn.execute(
        "SELECT * FROM tasks WHERE project_id=? ORDER BY rowid", (pid,))]
    events = [dict(r) for r in conn.execute(
        "SELECT seq,t,dir,ev,detail FROM events WHERE project_id=? ORDER BY seq DESC",
        (pid,))]
    conn.close()
    return {"updated": now_stamp(), "project": pid, "tasks": tasks, "events": events}


def upsert_task(pid: str, tid: str, title: str, *, status: str = "", owner: str = "",
                col: str = "inbox", summary: str = "", thread: str = ""):
    if col not in VALID_COLS:
        raise BoxError(f"非法 col='{col}'，合法值: {VALID_COLS}")
    conn = connect()
    _require_project(conn, pid)
    conn.execute(
        "INSERT INTO tasks(project_id,id,title,status,owner,col,summary,thread)"
        " VALUES(?,?,?,?,?,?,?,?)"
        " ON CONFLICT(project_id,id) DO UPDATE SET title=excluded.title,"
        " status=excluded.status, owner=excluded.owner, col=excluded.col,"
        " summary=excluded.summary, thread=excluded.thread,"
        " updated_at=datetime('now','localtime')",
        (pid, tid, title, status, owner, col, summary, thread))
    conn.commit()
    conn.close()


def update_task(pid: str, tid: str, *, col: str = None, status: str = None,
                summary: str = None, owner: str = None) -> dict:
    sets, vals = [], []
    if col is not None:
        if col not in VALID_COLS:
            raise BoxError(f"非法 col='{col}'，合法值: {VALID_COLS}")
        sets.append("col=?"); vals.append(col)
    if status is not None:
        sets.append("status=?"); vals.append(status)
    if summary is not None:
        sets.append("summary=?"); vals.append(summary)
    if owner is not None:
        sets.append("owner=?"); vals.append(owner)
    if not sets:
        raise BoxError("没有可更新字段")
    sets.append("updated_at=datetime('now','localtime')")
    conn = connect()
    _require_project(conn, pid)
    cur = conn.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE project_id=? AND id=?",
                       (*vals, pid, tid))
    if cur.rowcount == 0:
        conn.close()
        raise BoxError(f"任务不存在: {pid}/{tid}")
    row = dict(conn.execute("SELECT * FROM tasks WHERE project_id=? AND id=?",
                            (pid, tid)).fetchone())
    conn.commit()
    conn.close()
    return row


def add_event(pid: str, ev: str, *, dir_: str = "", detail: str = "", t: str = None):
    conn = connect()
    _require_project(conn, pid)
    conn.execute("INSERT INTO events(project_id,t,dir,ev,detail) VALUES(?,?,?,?,?)",
                 (pid, t or now_stamp(), dir_, ev, detail))
    conn.commit()
    conn.close()


def check_board(pid: str) -> dict:
    """分布断言：返回 col 分布并跑健康检查（异常抛 BoxError）。"""
    board = get_board(pid)
    cols = {}
    for t in board["tasks"]:
        cols.setdefault(t["col"], []).append(t["id"])
    problems = []
    for t in board["tasks"]:
        if t["col"] not in VALID_COLS:
            problems.append(f"{t['id']} 非法 col={t['col']}")
        if not t["title"]:
            problems.append(f"{t['id']} 缺 title")
    if problems:
        raise BoxError("；".join(problems))
    return cols


if __name__ == "__main__":
    print(init_db())
