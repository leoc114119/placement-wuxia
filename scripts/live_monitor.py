#!/usr/bin/env python3
"""live_monitor.py — 施工现场监控守护进程
监控：① zcode 进程存活 ② 项目代码文件变更（排除 tasks/ dist/ node_modules）
输出：tasks/live.json（dashboard 施工现场面板数据源，5s 刷新）
用法：nohup python3 scripts/live_monitor.py > /tmp/live-monitor.log 2>&1 &
"""
import json, os, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tasks", "live.json")
# 代码施工区（ZCode 干活会动的地方）
WATCH_DIRS = ["game.ts", "types.ts", "env.d.ts", "config", "systems", "ui", "net", "tests", "package.json", "tsconfig.json"]
WATCH = [os.path.join(ROOT, d) for d in WATCH_DIRS]


def zcode_running() -> bool:
    r = subprocess.run(["ps", "aux"], capture_output=True, text=True)
    return "zcode.cjs" in r.stdout


def snapshot():
    """返回 {path: mtime} 只含存在的路径"""
    snap = {}
    for p in WATCH:
        if os.path.isfile(p):
            snap[p] = os.path.getmtime(p)
        elif os.path.isdir(p):
            for dirpath, _, files in os.walk(p):
                if "node_modules" in dirpath:
                    continue
                for f in files:
                    fp = os.path.join(dirpath, f)
                    try:
                        snap[os.path.relpath(fp, ROOT)] = os.path.getmtime(fp)
                    except OSError:
                        pass
    return snap


def main():
    prev = snapshot()
    events = [{"t": time.strftime("%H:%M:%S"), "ev": "监控启动"}]
    while True:
        time.sleep(5)
        running = zcode_running()
        curr = snapshot()
        # 变更检测
        changed = []
        for p, m in curr.items():
            if p not in prev:
                changed.append(f"新增 {p}")
            elif m != prev[p]:
                changed.append(f"修改 {p}")
        removed = [p for p in prev if p not in curr]
        changed += [f"删除 {p}" for p in removed]
        prev = curr
        ts = time.strftime("%H:%M:%S")
        for c in changed[:20]:
            events.insert(0, {"t": ts, "ev": c})
        events = events[:80]
        # git 状态摘要
        try:
            g = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, cwd=ROOT)
            dirty = [l for l in g.stdout.strip().split("\n") if l and "tasks/" not in l][:8]
            gsum = f"git 未提交 {len(dirty)} 项" if dirty else "git 干净"
        except Exception:
            gsum = ""
        running_task = ""
        try:
            for f in os.listdir(os.path.join(ROOT, "tasks", "working")):
                if f.endswith(".md"):
                    running_task = "当前施工：" + f.replace(".md", "")
        except Exception:
            pass
        data = {
            "running": running,
            "summary": (running_task + " · " + gsum if running_task else gsum),
            "events": events,
            "ts": ts,
        }
        with open(OUT, "w") as f:
            json.dump(data, f, ensure_ascii=False)


if __name__ == "__main__":
    main()
