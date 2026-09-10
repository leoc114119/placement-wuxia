#!/usr/bin/env python3
"""Codex 线程健康探针（只读）

用途：把「线程轮换」从"要靠记得看"变成"一条命令出数"。
- 列出最近的 Codex 会话 rollout 文件与大小（`~/.codex/sessions` + `~/.codex/archived_sessions`）
- 从 `~/.codex/thread_history_1.sqlite` 读到该线程的：轮次总数 / inProgress 孤儿数 / contextCompaction 次数
- 按 SKILL §12 阈值给出 ⚠️ 轮换建议

阈值（SKILL §12）：轮次 ≥150 / rollout ≥300MB / contextCompaction ≥30 → 收尾该线程、写交接文档、开新线程。

用法：
    python3 scripts/codex_thread_health.py            # 自动取"最近活跃"的线程
    python3 scripts/codex_thread_health.py --thread <thread-id>
    python3 scripts/codex_thread_health.py --all      # 列所有 rollout 与其大小（前 10 大）

只读：不写任何 Codex 状态；sqlite 以 mode=ro 打开。
"""
import argparse
import os
import re
import sqlite3
import sys
from pathlib import Path

HOME = Path.home()
CODEX = HOME / ".codex"
SESS_DIRS = [CODEX / "sessions", CODEX / "archived_sessions"]
THREAD_DB = CODEX / "thread_history_1.sqlite"

LIM_TURNS = 150
LIM_ROLLOUT_MB = 300
LIM_COMPACT = 30

ROLLOUT_RE = re.compile(r"rollout-.*-(01a[0-9a-f-]{32,})\.jsonl$")


def rollout_files():
    out = []
    for d in SESS_DIRS:
        if d.is_dir():
            out.extend(d.rglob("rollout-*.jsonl"))
    return out


def thread_of(p: Path):
    m = ROLLOUT_RE.search(p.name)
    return m.group(1) if m else None


def db_stats(thread_id):
    """返回 (turns_total, turns_inprogress, compaction_count)；读不到则 None。"""
    if not THREAD_DB.exists():
        return None
    try:
        con = sqlite3.connect(f"file:{THREAD_DB}?mode=ro", uri=True)
        like = thread_id[:12] + "%"
        turns = con.execute(
            "select count(*), sum(status='inProgress') from thread_turns where thread_id like ?",
            (like,),
        ).fetchone()
        comp = con.execute(
            "select count(*) from thread_items where thread_id like ? and item_type='contextCompaction'",
            (like,),
        ).fetchone()
        con.close()
        return (turns[0] or 0, turns[1] or 0, comp[0] or 0)
    except Exception as e:  # 只读探针：读不到就如实报缺口，不阻断
        return ("err", str(e), None)


def report(path: Path, verbose=True):
    size = path.stat().st_size
    mb = size / 1048576
    tid = thread_of(path)
    flags = []
    if mb >= LIM_ROLLOUT_MB:
        flags.append(f"rollout {mb:.0f}MB ≥ {LIM_ROLLOUT_MB}MB")
    stats = db_stats(tid) if tid else None
    if stats and stats[0] != "err":
        turns, inprog, comp = stats
        if turns >= LIM_TURNS:
            flags.append(f"轮次 {turns} ≥ {LIM_TURNS}")
        if comp is not None and comp >= LIM_COMPACT:
            flags.append(f"压缩 {comp} 次 ≥ {LIM_COMPACT}")
        extra = f"轮次 {turns} | inProgress 计数 {inprog}（>0 且长时间不变即为孤儿轮次）| 压缩 {comp} 次"
    else:
        extra = f"库内统计读不到（{stats[1] if stats else 'n/a'}）"
    if verbose:
        print(f"  线程 {tid or '(未识别)'}")
        print(f"  rollout {mb:.1f} MB  {path}")
        print(f"  {extra}")
        print("  判定: " + ("🔁 **该轮换了** —— " + "；".join(flags) if flags else "✅ 未触阈值"))
    return flags, mb, tid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--thread", help="指定 thread id")
    ap.add_argument("--all", action="store_true", help="列出前 10 大 rollout")
    a = ap.parse_args()

    files = rollout_files()
    if not files:
        print("未找到任何 rollout 文件（路径检查: ~/.codex/sessions, ~/.codex/archived_sessions）")
        return 1

    if a.all:
        print("=== 最大的 10 个 rollout ===")
        for p in sorted(files, key=lambda x: -x.stat().st_size)[:10]:
            print(f"  {p.stat().st_size/1048576:8.1f} MB  {thread_of(p) or '?'}  {p.name}")
        return 0

    if a.thread:
        cand = [p for p in files if a.thread in p.name]
        if not cand:
            print(f"未找到线程 {a.thread} 的 rollout")
            return 1
        target = max(cand, key=lambda p: p.stat().st_mtime)
    else:
        target = max(files, key=lambda p: p.stat().st_mtime)

    print("=== 最近活跃的 Codex 线程健康 ===")
    flags, mb, tid = report(target)
    print()
    print("阈值（SKILL §12）: 轮次 ≥150 / rollout ≥300MB / 压缩 ≥30 次 —— 任一达到即：写交接文档 → 开新线程")
    return 2 if flags else 0


if __name__ == "__main__":
    sys.exit(main())
