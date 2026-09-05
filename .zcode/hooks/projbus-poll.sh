#!/bin/zsh
# session-start 钩子：开工自动查看 projbus 未读（rd 收件箱）
export PROJBUS_DB="$HOME/.projbus/projbus.sqlite"
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
if [ -x "$REPO/scripts/projbus/projbus" ] && [ -f "$PROJBUS_DB" ]; then
  echo "── projbus 未读（rd）──"
  "$REPO/scripts/projbus/projbus" poll-context --to rd --db "$PROJBUS_DB" || true
fi
