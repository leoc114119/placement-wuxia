#!/bin/zsh
# projbus 自动派发：定时轮询消息箱 → 有新消息就拉起对应的 Codex 会话
#
# 由 launchd 每 10 分钟调用（com.projbus.autodispatch.plist），脚本内再判时间窗 10:00~22:00。
# 为什么时间窗写在脚本里而不是 plist：launchd 的 StartInterval 不支持时间段，
# 只能在脚本入口判断小时，不在窗口内直接退出（零开销）。
#
# 机制：
#   art / arch（Codex 侧）→ 有水位线之后的新消息 → `codex queue` 拉起该线程
#   rd（ZCode 侧，本窗口）→ **无对外 CLI，拉不起** → 响铃+系统通知提示人开窗口
# 防重复：靠 codex_turn_driver 的持久化水位线（只在投递成功后推进）
#
# 用法：scripts/projbus_autodispatch.sh [--dry-run] [--ignore-window]
#   --dry-run        只演练不投递
#   --ignore-window  忽略 10-22 时间窗（用于手动触发/验证）
set -u
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
DRIVER="$REPO/scripts/codex_turn_driver.py"
PROJBUS="$REPO/scripts/projbus/projbus"
DRY=""; IGNORE=""
for a in "$@"; do
  [ "$a" = "--dry-run" ] && DRY="--dry-run"
  [ "$a" = "--ignore-window" ] && IGNORE=1
done

LOG="$HOME/.projbus/autodispatch.log"
mkdir -p "$(dirname "$LOG")"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# ── 时间窗：10:00 ~ 22:00（含 10 点整，不含 22 点整）──
H=$(date +%-H)
if [ -z "${IGNORE:-}" ] && { [ "$H" -lt 10 ] || [ "$H" -ge 22 ]; }; then
  exit 0
fi

# ── Codex 是否在运行（不在则无法投递，只提示）──
codex_up=0
pgrep -f "ChatGPT.app/Contents/Resources/codex" >/dev/null 2>&1 && codex_up=1

# ── 1) 拉起 Codex 侧（art / arch）──
# 判据＝水位线是否推进。driver 用 log() 写日志文件、stdout 为空，
# 所以不能靠 stdout 判断；而水位线只在投递成功后才推进，是可靠信号。
for role in art arch; do
  if [ "$codex_up" -eq 1 ]; then
    before=$(python3 "$REPO/scripts/projbus_wm.py" "$role" 2>/dev/null || echo 0)
    python3 "$DRIVER" --role "$role" --force $DRY >/dev/null 2>&1
    after=$(python3 "$REPO/scripts/projbus_wm.py" "$role" 2>/dev/null || echo 0)
    if [ "$before" != "$after" ]; then
      log "[$role] 已唤醒并投递（水位线 $before -> $after）"
    fi
  fi
done

# ── 2) rd（ZCode 侧）无法拉起 → 有新消息就响铃提示 ──
STATE="$HOME/.projbus/autodispatch_state"
first_run=0
[ -f "$STATE" ] || first_run=1
touch "$STATE"
count=$("$PROJBUS" poll-context --to rd --limit 1000 2>/dev/null | grep -o '共 [0-9]* 条未读' | grep -o '[0-9]*')
count=${count:-0}
prev=$(grep '^rd=' "$STATE" 2>/dev/null | head -1 | cut -d= -f2); prev=${prev:-0}
if [ "$first_run" -eq 0 ] && [ "$count" -gt "$prev" ]; then
  delta=$((count - prev))
  log "[rd] 新增 ${delta} 条未读（共 ${count}）—— ZCode 侧无 CLI，需人工开窗口处理"
  afplay /System/Library/Sounds/Glass.aiff >/dev/null 2>&1 || true
  osascript -e "display notification \"rd 箱 +${delta} 条（共 ${count}）；ZCode 侧需人工开窗口\" with title \"projbus 待处理\" sound name \"Glass\"" >/dev/null 2>&1 || true
fi
echo "rd=${count}" > "$STATE"

# ── 3) Codex 未运行时，提示 ──
if [ "$codex_up" -eq 0 ]; then
  log "[warn] Codex 未运行，art/arch 的消息无法自动拉起"
fi

exit 0
