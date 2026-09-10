#!/bin/zsh
# PM2 发单助手：发 projbus 消息 + **立即命令行唤醒收件方**（不依赖任何钩子）
#
# 用法：scripts/pm2_dispatch.sh <payload.json> <idempotency-key> [recipient=art] [kind=delivery]
#
# 为什么需要它：Codex 侧有对外 CLI（codex queue），所以「我 → 美术线」这个方向
# 可以做到**秒级唤醒**——发完立刻调用 scripts/codex_turn_driver.py，它会把
# 「水位线之后的新消息」摘要投进美术线线程并起回合。
# 反向（美术线 → 我）ZCode 无对外 CLI，只能靠 10 分钟定时巡检，做不到事件驱动。
set -e
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
PAYLOAD="$1"; KEY="$2"; TO="${3:-art}"; KIND="${4:-delivery}"
[ -f "$PAYLOAD" ] || { echo "payload 文件不存在: $PAYLOAD"; exit 1; }
[ -n "$KEY" ] || { echo "缺少 idempotency-key"; exit 1; }

echo "── 1) 发消息（to=$TO）──"
python3 "$REPO/scripts/projbus/projbus" send --from rd --to "$TO" --kind delivery \
  --kind "$KIND" --payload-file "$PAYLOAD" --idempotency-key "$KEY"

echo "── 2) 立即唤醒 $TO（命令行 codex queue）──"
# --force：人工派单不受自动唤醒的每小时上限约束
python3 "$REPO/scripts/codex_turn_driver.py" --role "$TO" --force || true

echo "── 3) 收件方线程状态 ──"
python3 "$REPO/scripts/codex_turn_driver.py" --status | sed -n '1,4p'
