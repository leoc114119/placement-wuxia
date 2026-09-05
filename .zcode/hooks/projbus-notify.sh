#!/bin/zsh
# projbus 分钟级轮询 + macOS 系统通知（rd/art/arch 三箱，有新未读即弹通知）
# 由 launchd 每 5 分钟调用；状态文件防重复弹窗
export PROJBUS_DB="$HOME/.projbus/projbus.sqlite"
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
STATE="$HOME/.projbus/notify_state"
CLI="$REPO/scripts/projbus/projbus"

[ -x "$CLI" ] && [ -f "$PROJBUS_DB" ] || exit 0

touch "$STATE"
total_new=0
notify_text=""

for role in rd art arch; do
  count=$("$CLI" poll-context --to "$role" --db "$PROJBUS_DB" 2>/dev/null | grep -o '共 [0-9]* 条未读' | grep -o '[0-9]*')
  count=${count:-0}
  prev=$(grep "^${role}=" "$STATE" 2>/dev/null | head -1 | cut -d= -f2)
  prev=${prev:-0}
  delta=$((count - prev))
  if [ "$delta" -gt 0 ]; then
    total_new=$((total_new + delta))
    notify_text="${notify_text}${role}箱 +${delta}条; "
  fi
  grep -v "^${role}=" "$STATE" > "${STATE}.tmp" 2>/dev/null || true
  echo "${role}=${count}" >> "${STATE}.tmp"
  mv "${STATE}.tmp" "$STATE"
done

if [ "$total_new" -gt 0 ]; then
  osascript -e "display notification \"${notify_text}（projbus）\" with title \"projbus 总线有新消息\" sound name \"Glass\"" >/dev/null 2>&1 || true
fi
