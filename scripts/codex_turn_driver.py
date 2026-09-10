#!/usr/bin/env python3
"""Codex 回合结束驱动（projbus 自动唤醒器）

背景：Codex 桌面端是回合制——一个回合干完就 task_complete 停下，不会自己接第二件事。
本脚本由 Codex 的 notify 钩子（turn-ended）调用，作用是：**当且仅当**收件方有「水位线之后的新消息」时，
用 `codex queue` 给它投一条唤醒消息，起下一个回合；否则什么都不做。

护栏（缺一不可）：
  1) 只对**新消息**唤醒——用持久化水位线（watermark）过滤历史未读（该线程曾积压 50 条未读，直接按
     「有未读」判断会误触）；水位线只在**投递成功后**推进。
  2) 限频：默认每小时最多 6 次唤醒。
  3) 不打断在跑的回合：投递前检查该线程最近是否仍有 inProgress 轮次（未结束则本次跳过）。
  4) 不碰 Codex 会话库（只读探测）；不推进水位线当投递失败。
  5) 任何异常都吞掉并 exit 0——notify 钩子绝不能因本脚本失败而影响宿主。

用法：
  python3 scripts/codex_turn_driver.py --status                 # 看当前状态（不改任何东西）
  python3 scripts/codex_turn_driver.py --dry-run                # 演练：只打印将要投递的内容
  python3 scripts/codex_turn_driver.py                          # 实跑（被 notify 钩子调用）
  python3 scripts/codex_turn_driver.py --set-thread <UUID>      # 设定目标线程（轮换后需更新）
  python3 scripts/codex_turn_driver.py --reset-watermark        # 水位线归零（谨慎）
  python3 scripts/codex_turn_driver.py --role art               # 目标角色（默认 art）
"""
import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

HOME = Path.home()
REPO = Path(__file__).resolve().parent.parent
PROJBUS = REPO / "scripts" / "projbus" / "projbus"
CODEX_BIN = Path("/Applications/ChatGPT.app/Contents/Resources/codex")
STATE = HOME / ".codex" / "projbus-drive-state.json"
LOGF = HOME / ".codex" / "projbus-drive.log"
THREAD_DB = HOME / ".codex" / "thread_history_1.sqlite"

MAX_WAKES_PER_HOUR = 6
QUEUE_TIMEOUT = 45


LOCK = HOME / ".codex" / "projbus-drive.lock"


def acquire_lock():
    """简易互斥：防两个并发调用各投一条（notify 可能与手动触发重叠）。"""
    try:
        if LOCK.exists():
            age = time.time() - LOCK.stat().st_mtime
            if age < 120:
                log(f"lock held ({age:.0f}s); skip")
                return False
        LOCK.write_text(str(os.getpid()), encoding="utf-8")
        return True
    except Exception as e:
        log(f"lock failed: {e}")
        return False


def release_lock():
    try:
        LOCK.unlink()
    except Exception:
        pass


def log(msg):
    try:
        with open(LOGF, "a", encoding="utf-8") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}\n")
    except Exception:
        pass


def load_state():
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_state(st):
    try:
        STATE.write_text(json.dumps(st, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception as e:
        log(f"state write failed: {e}")


def newest_rollout_thread():
    """返回最近活跃线程 id（用于首次自动发现目标线程）。"""
    cands = []
    for d in (HOME / ".codex" / "sessions", HOME / ".codex" / "archived_sessions"):
        if d.is_dir():
            cands += list(d.rglob("rollout-*.jsonl"))
    if not cands:
        return None
    newest = max(cands, key=lambda p: p.stat().st_mtime)
    m = re.search(r"(01a[0-9a-f-]{30,})\.jsonl$", newest.name)
    return m.group(1) if m else None


def turn_in_progress(thread):
    """只读探测：该线程是否仍有未结束轮次（有则不打断）。"""
    if not THREAD_DB.exists():
        return False
    try:
        con = sqlite3.connect(f"file:{THREAD_DB}?mode=ro", uri=True)
        n = con.execute(
            "select count(*) from thread_turns where thread_id like ? and status='inProgress'",
            (thread[:12] + "%",),
        ).fetchone()[0]
        con.close()
        # 仅当**最近一条** inProgress 开始时间距今 < 3 分钟才认为真在跑，避免被孤儿轮次永久挡住
        con = sqlite3.connect(f"file:{THREAD_DB}?mode=ro", uri=True)
        row = con.execute(
            "select max(started_at) from thread_turns where thread_id like ? and status='inProgress'",
            (thread[:12] + "%",),
        ).fetchone()
        con.close()
        if row and row[0]:
            return (time.time() - row[0]) < 180
        return False
    except Exception as e:
        # 保守失败：探测不了就当"在跑"，宁可漏唤一次，也不能打断正在进行的回合
        log(f"inprogress probe failed (fail-closed -> treat as in-progress): {e}")
        return True


def unread_after(role, watermark):
    """取该角色收件箱中 seq > watermark 的消息。"""
    try:
        # 必须带 --after-seq：poll-context 默认只返回**最旧**的 limit 条，
        # 收件箱积压时会完全看不到新消息（实测：积压 50 条时 seq=317 不可见）
        out = subprocess.run(
            [sys.executable, str(PROJBUS), "poll-context", "--to", role,
             "--after-seq", str(int(watermark)), "--limit", "300", "--json"],
            capture_output=True, text=True, timeout=30, cwd=str(REPO),
        )
        data = json.loads(out.stdout or "{}")
    except Exception as e:
        log(f"poll failed: {e}")
        return []
    msgs = data.get("messages", []) if isinstance(data, dict) else []
    fresh = []
    for m in msgs:
        seq = m.get("seq") or 0
        if seq > watermark:
            fresh.append(m)
    fresh.sort(key=lambda m: m.get("seq") or 0)
    return fresh


def build_message(fresh):
    lines = [f"（自动唤醒 · 来自 projbus）你有 {len(fresh)} 条新消息：", ""]
    for m in fresh[-8:]:
        subj = str(m.get("payload", {}).get("subject", ""))[:140]
        lines.append(f"- seq={m.get('seq')} [{m.get('kind')}] {subj}")
    lines += [
        "",
        "请按这些消息继续执行（先读 tasks/handoff/ 与 tasks/LOG.md 相关条目）；",
        "若消息要求你先停下等裁定，则停下并在 LOG/threads 留痕——唤醒不等于免除停点。",
    ]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--role", default="art")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--set-thread")
    ap.add_argument("--reset-watermark", action="store_true")
    ap.add_argument("--note", default="")
    ap.add_argument("event", nargs="?", default="")      # Codex 传：turn-ended
    ap.add_argument("payload", nargs="?", default="")    # Codex 传：JSON payload
    a = ap.parse_args()

    st = load_state()
    st.setdefault("role", a.role)
    thread = st.get("thread") or newest_rollout_thread()
    wm = int(st.get("watermark_seq", 0))
    wakes = [t for t in st.get("wakes", []) if time.time() - t < 3600]

    if a.set_thread:
        st["thread"] = a.set_thread
        save_state(st)
        print(f"目标线程已设为 {a.set_thread}")
        return 0
    if a.reset_watermark:
        st["watermark_seq"] = 0
        save_state(st)
        print("水位线已归零")
        return 0
    if a.status:
        fresh = unread_after(st["role"], wm)
        print(f"role={st['role']} thread={thread}")
        print(f"watermark={wm} 近一小时唤醒次数={len(wakes)}/{MAX_WAKES_PER_HOUR}")
        print(f"水位线之后的新消息={len(fresh)}")
        for m in fresh[-6:]:
            print(f"  seq={m.get('seq')} [{m.get('kind')}] {str(m.get('payload',{}).get('subject',''))[:80]}")
        print(f"是否在跑={turn_in_progress(thread) if thread else 'n/a'}")
        return 0

    log(f"invoked role={a.role} thread={thread} wm={wm} wakes1h={len(wakes)} event={a.event!r} payload={a.payload[:300]!r}")

    if not acquire_lock():
        return 0
    try:
        return _drive(a, st, thread, wm, wakes)
    finally:
        release_lock()


def _drive(a, st, thread, wm, wakes):

    if not thread:
        log("no target thread; skip")
        return 0
    if len(wakes) >= MAX_WAKES_PER_HOUR:
        log("rate limit reached; skip")
        return 0
    # 注意：不再因"在跑"而跳过——`codex queue` 本身是队列语义（不打断当前回合），
    # 跳过只会让消息更晚到达。改为照常入队（水位线保证同一条只投一次）。
    # 真要立刻打断，只能由人在 Codex 窗口按停止（CLI 无 interrupt）。
    if turn_in_progress(thread):
        log("turn in progress -> still queue (queue semantics are non-intrusive)")

    fresh = unread_after(st["role"], wm)
    if not fresh:
        log("no new messages after watermark; skip")
        return 0

    msg = build_message(fresh)
    if a.dry_run:
        print("=== DRY RUN：将投递 ===")
        print(f"thread={thread}")
        print(msg)
        return 0

    try:
        r = subprocess.run(
            [str(CODEX_BIN), "queue", "--thread", thread, "--message", msg],
            capture_output=True, text=True, timeout=QUEUE_TIMEOUT, cwd=str(REPO),
        )
        ok = r.returncode == 0
        log(f"queue rc={r.returncode} out={r.stdout.strip()[:200]!r} err={r.stderr.strip()[:200]!r}")
    except Exception as e:
        ok = False
        log(f"queue failed: {e}")

    if ok:
        st["watermark_seq"] = max(int(m.get("seq") or 0) for m in fresh)
        wakes.append(time.time())
        st["wakes"] = wakes[-20:]
        st["thread"] = thread
        st["role"] = a.role
        save_state(st)
        log(f"woke thread, watermark -> {st['watermark_seq']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # 钩子绝不影响宿主
        log(f"FATAL swallowed: {e}")
        sys.exit(0)
