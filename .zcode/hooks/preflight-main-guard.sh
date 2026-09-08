#!/bin/bash
# PRE-FLIGHT main 守卫（09-07 Leo 令）：Bash 命令写 main 前强制过 PRE-FLIGHT 检查单 B 段
# 机制：PreToolUse(Bash) 钩子；检测到推送/写入 main 的命令时，要求 tasks/.preflight-log
# 尾部存在新鲜过检记录（本日 + PRE-FLIGHT 字样），否则 exit 2 阻断并提示补留痕。
# 误放行兜底：本钩子只覆盖 ZCode 会话 Bash；新绕行形态出现时追加 pattern 并登记违反先例表。

input=$(cat)
cmd=$(printf '%s' "$input" | /usr/bin/python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('tool_input',{}).get('command','') or '')
except Exception:
    print('')
")

# 只拦包含 push 且目标是 main 的写主线的命令（本地 merge 不拦：可逆、远程未动）
if printf '%s' "$cmd" | grep -qE 'git +push' && printf '%s' "$cmd" | grep -qE '(:main| +main|HEAD +-> *main|main$)'; then
  log="tasks/.preflight-log"
  today=$(date +%Y-%m-%d)
  if [ -f "$log" ] && tail -5 "$log" | grep -q "$today" && tail -5 "$log" | grep -Eiq 'PRE-FLIGHT.*B[1-6].*(✓|已过|checked)'; then
    exit 0  # 有本日新鲜过检记录，放行
  fi
  echo "⛔ PRE-FLIGHT 守卫：该命令会写入 main。请先完成任务合并前检查单（tasks/PRE-FLIGHT-CHECKLIST.md B 段：四门原文/主架构验收 PASS/PM 纯净态复验/L 环/归档顺序/LOG 记忆），确认后在 tasks/.preflight-log 追加一行「$(date +%Y-%m-%d) PRE-FLIGHT B1-B6 已过 checked by <事由>」，再重试本命令。" >&2
  exit 2
fi
exit 0
