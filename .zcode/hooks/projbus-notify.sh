#!/bin/zsh
# projbus 分钟级轮询 + macOS 系统通知（rd/art/arch 三箱，有新未读即弹通知）
# 由 launchd 每 120 秒调用（StartInterval=120）；状态文件防重复弹窗
export PROJBUS_DB="$HOME/.projbus/projbus.sqlite"
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
STATE="$HOME/.projbus/notify_state"
CLI="$REPO/scripts/projbus/projbus"

[ -x "$CLI" ] && [ -f "$PROJBUS_DB" ] || exit 0

touch "$STATE"
total_new=0
notify_text=""

for role in rd art arch; do
  # ⚠️ 必须显式 --limit：poll-context 默认只返回最旧 50 条，计数会被封顶在 50，
  #    积压 ≥50 后 delta 恒为 0 → 通知永久失效（2026-09-11 实测：rd 实际 103 条却记 50）。
  count=$("$CLI" poll-context --to "$role" --limit 1000 --db "$PROJBUS_DB" 2>/dev/null | grep -o '共 [0-9]* 条未读' | grep -o '[0-9]*')
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
  # 主通道=系统音（afplay 不依赖通知中心权限，launchd 后台可用）；osascript 视觉通知为尽力通道
  afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1 || true
  sleep 0.4
  afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1 || true
  osascript -e "display notification \"${notify_text}（projbus）\" with title \"projbus 总线有新消息\" sound name \"Glass\"" >/dev/null 2>&1 || true
fi
