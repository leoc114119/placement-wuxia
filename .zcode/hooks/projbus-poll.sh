#!/bin/zsh
# SessionStart 钩子：开工自动查看 projbus 未读（rd 收件箱）
# 2026-09-10 修正：poll-context 默认只返回**最旧**的 limit(50) 条——收件箱积压时新消息会被完全挡住。
#                故显式 --limit 300，并只把**最新**的若干条列出来（计数仍报全量）。
export PROJBUS_DB="$HOME/.projbus/projbus.sqlite"
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
CLI="$REPO/scripts/projbus/projbus"
if [ -x "$CLI" ] && [ -f "$PROJBUS_DB" ]; then
  echo "── projbus 未读（rd）──"
  "$CLI" poll-context --to rd --limit 300 --db "$PROJBUS_DB" | tail -12 || true
fi
