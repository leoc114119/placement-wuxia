#!/usr/bin/env python3
"""projbus 收件箱批量清理（rd 侧历史积压）。

为什么需要：消息在 projbus 里的 ack 状态与「实际是否处理」是两回事——
历史上很多消息处理了（写进 LOG/threads、产出了文件），但没回到总线 ack，
于是 rd 箱越积越多、影响水位线与通知判据。

清理策略（按 kind 区分，不搞一刀切）：
  delivery    → received  （已收到；美术线的交付历史上都经 LOG 闭环）
  answer      → received  （对方答复；对方主动发出的不需要我们再确认）
  acceptance  → received  （验收结论）
  question    → **不动**  （提问需要真回应，不能替自己 ack）

用法：
  python3 projbus_cleanup_inbox.py --to rd [--dry] [--max-seq N] [--include-questions]
"""
import argparse, json, os, subprocess, sys, pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
CLI = REPO / "scripts" / "projbus" / "projbus"
DB = pathlib.Path.home() / ".projbus" / "projbus.sqlite"


def poll(to):
    out = subprocess.run([sys.executable, str(CLI), "poll-context", "--to", to,
                          "--limit", "1000", "--json", "--db", str(DB)],
                         capture_output=True, text=True)
    return json.loads(out.stdout)["messages"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--to", default="rd")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--max-seq", type=int, default=0, help="只清 seq <= N（0=全部）")
    ap.add_argument("--include-questions", action="store_true",
                    help="连 question 也标 received（默认跳过，因提问需真回应）")
    a = ap.parse_args()

    msgs = poll(a.to)
    todo, skipped = [], []
    for m in msgs:
        if a.max_seq and m["seq"] > a.max_seq:
            continue
        if m["kind"] == "question" and not a.include_questions:
            skipped.append(m); continue
        todo.append(m)

    from collections import Counter
    print(f"[{a.to}] 未读 {len(msgs)} 条 → 将 ack {len(todo)} 条，跳过 question {len(skipped)} 条")
    print("  将 ack 的 kind 分布:", dict(Counter(m["kind"] for m in todo)))
    if skipped:
        print("  跳过的 question:")
        for m in skipped:
            p = m.get("payload") or {}
            print(f"    seq={m['seq']:<4} {str(p.get('subject') or p.get('title') or '')[:60]}")

    if a.dry:
        print("\n[dry] 未实际执行")
        return

    ok = fail = 0
    for m in todo:
        r = subprocess.run([sys.executable, str(CLI), "ack",
                            "--message-id", m["message_id"],
                            "--state", "received",
                            "--note", "历史积压清理：已处理（详见 tasks/LOG.md）",
                            "--db", str(DB)], capture_output=True, text=True)
        if r.returncode == 0:
            ok += 1
        else:
            fail += 1
            print(f"  失败 seq={m['seq']}: {r.stderr.strip()[:120]}")
    print(f"\n完成：ack {ok} 条，失败 {fail} 条")


if __name__ == "__main__":
    main()
