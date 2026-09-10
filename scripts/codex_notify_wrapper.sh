#!/bin/zsh
# Codex notify 钩子包装器（turn-ended）
#
# 作用：把 Codex 的 notify 事件**同时**交给两个接收方——
#   1) 原来的 Computer Use 客户端（保持原行为，参数原样透传）
#   2) projbus 自动唤醒器（scripts/codex_turn_driver.py，仅在有新消息时才会真的投递）
#
# 为什么需要包装：Codex 的 notify 是一个位置（config.toml 里的 notify 数组），
# 已被 Computer Use 占用；直接替换会弄坏它，所以改为「包装 → 转发 + 并联」。
#
# 安装位置：由 ~/.codex/config.toml 的 notify 指向本脚本。
# 日志：~/.codex/projbus-drive.log（含每次调用的 argv/env，便于核对 Codex 的钩子契约）
#
# 纪律：本脚本任何失败都不影响宿主——末尾一律 exit 0。

REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
ORIG_CLIENT="/Users/leochen/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
LOG="/Users/leochen/.codex/projbus-drive.log"

{
  printf '%s [wrapper] argv=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "${(j:,:)@}"
  printf '%s [wrapper] env-snapshot=%s\n' "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$(env | grep -E 'CODEX|THREAD|TURN' | tr '\n' ' ')"
} >> "$LOG" 2>/dev/null

# 1) 原样转发给 Computer Use 客户端（所有参数透传；失败也不影响下面）
if [ -x "$ORIG_CLIENT" ]; then
  "$ORIG_CLIENT" "$@" >> "$LOG" 2>&1 &
fi

# 2) 事件是 turn-ended 时，跑 projbus 自动唤醒器
if [ "$1" = "turn-ended" ]; then
  if [ -f "$REPO/scripts/codex_turn_driver.py" ]; then
    # 后台执行：notify 钩子不得阻塞宿主（driver 内含 queue 调用，最长 45s）
    nohup /usr/bin/env python3 "$REPO/scripts/codex_turn_driver.py" "$@" >> "$LOG" 2>&1 &
  fi
fi

exit 0
