#!/usr/bin/env python3
"""task.py · 任务箱 CLI（直连 box.db，与 task_api 共用 task_box 校验）

用法:
  python3 scripts/task.py init                          # 建库+导入旧 index.json
  python3 scripts/task.py list [pid]                    # 列任务
  python3 scripts/task.py board <pid>                   # col 分布断言
  python3 scripts/task.py move <pid> <tid> <col> [--status S] [--summary S]
  python3 scripts/task.py event <pid> <dir> <ev> [detail] [--t "MM-DD HH:MM"]
  python3 scripts/task.py card <pid> <tid> "<title>" [--col C] [--thread f] [--owner o]

col 六值: inbox / working / questions / done / archive / backlog
"""
import argparse
import sys

import task_box
from task_box import (BoxError, VALID_COLS, add_event, add_project, check_board,
                      get_board, init_db, list_projects, update_task, upsert_task)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init")
    p_list = sub.add_parser("list"); p_list.add_argument("pid", nargs="?", default=task_box.DEFAULT_PROJECT)
    p_board = sub.add_parser("board"); p_board.add_argument("pid", default=task_box.DEFAULT_PROJECT)
    p_move = sub.add_parser("move")
    p_move.add_argument("pid"); p_move.add_argument("tid"); p_move.add_argument("col")
    p_move.add_argument("--status"); p_move.add_argument("--summary")
    p_ev = sub.add_parser("event")
    p_ev.add_argument("pid"); p_ev.add_argument("dir"); p_ev.add_argument("ev")
    p_ev.add_argument("detail", nargs="?", default=""); p_ev.add_argument("--t", default=None)
    p_card = sub.add_parser("card")
    p_card.add_argument("pid"); p_card.add_argument("tid"); p_card.add_argument("title")
    p_card.add_argument("--col", default="inbox"); p_card.add_argument("--thread", default="")
    p_card.add_argument("--owner", default="ZCode"); p_card.add_argument("--status", default="")
    p_card.add_argument("--summary", default="")

    a = ap.parse_args()
    try:
        if a.cmd == "init":
            print(init_db()); print(f"项目列表: {[p['id'] for p in list_projects()]}")
        elif a.cmd == "list":
            pid = a.pid
            b = get_board(pid)
            for t in b["tasks"]:
                print(f"[{t['col']:9s}] {t['id']:8s} {t['title']}  ({t['status']})")
            print(f"共 {len(b['tasks'])} 卡 · 事件 {len(b['events'])} 条")
        elif a.cmd == "board":
            cols = check_board(a.pid)
            print("断言通过 ✓ col 分布:", {k: v for k, v in sorted(cols.items())})
        elif a.cmd == "move":
            row = update_task(a.pid, a.tid, col=a.col, status=a.status, summary=a.summary)
            cols = check_board(a.pid)
            print(f"✓ {a.tid} → col={row['col']} status={row['status']}")
            print("分布:", {k: v for k, v in sorted(cols.items())})
        elif a.cmd == "event":
            add_event(a.pid, a.ev, dir_=a.dir, detail=a.detail, t=a.t)
            cols = check_board(a.pid)
            print(f"✓ 事件已登记 [{a.dir}] {a.ev}")
        elif a.cmd == "card":
            upsert_task(a.pid, a.tid, a.title, status=a.status, owner=a.owner,
                        col=a.col, summary=a.summary, thread=a.thread)
            cols = check_board(a.pid)
            print(f"✓ 卡片就位 {a.tid} ({a.col})")
    except BoxError as e:
        print(f"ERR: {e}", file=sys.stderr); sys.exit(1)


if __name__ == "__main__":
    main()
