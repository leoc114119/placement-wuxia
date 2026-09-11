#!/bin/zsh
# 研发 PM 通知主架构（Codex arch）助手
#
# 用途：研发 PM（ZCode 侧）需要主架构做技术方案/技术验收/答疑/规则解释时，
#       用本脚本发 projbus 消息并**立即命令行唤醒** Codex arch 线程。
#
# 为什么需要它：Codex 侧有对外 CLI（`codex queue`），所以「ZCode → Codex」
#   这个方向可做到**秒级唤醒**；反向（Codex → 我）ZCode 无对外 CLI，
#   只能靠定时巡检。故主动通知必须走本脚本，不能只发消息等对方轮询。
#
# 用法：
#   scripts/notify_arch.sh <payload.json> <idempotency-key> [kind=question]
#
#   payload.json 建议字段（内容自定，以下为约定）：
#     { "subject": "一句话标题",
#       "detail":  "正文/背景",
#       "ask":     "需要主架构给什么（方案/验收/答疑）",
#       "refs":    ["相关文档路径或 commit"] }
#
# 示例：
#   cat > /tmp/q.json <<'JSON'
#   {"subject":"战斗行走帧换 run 素材，请出接入方案",
#    "detail":"现有 walk 2 帧太慢，Leo 裁定改用 run 素材（5 帧）",
#    "ask":"请给接入方案：clipCounts/帧时长/是否覆盖 walk 文件",
#    "refs":["tasks/handoff/接入需求-jump-1帧改5帧-20260911.md"]}
#   JSON
#   scripts/notify_arch.sh /tmp/q.json "walk-to-run-20260911"
#
# 首次使用前需一次性配置 arch 的 Codex 线程（见下方 --set-thread 提示）。
set -e
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
PAYLOAD="$1"; KEY="$2"; KIND="${3:-question}"
[ -f "$PAYLOAD" ] || { echo "payload 文件不存在: $PAYLOAD"; exit 1; }
[ -n "$KEY" ] || { echo "缺少 idempotency-key"; exit 1; }

echo "── 1) 发消息（rd → arch，kind=$KIND）──"
python3 "$REPO/scripts/projbus/projbus" send --from rd --to arch --kind "$KIND" \
  --payload-file "$PAYLOAD" --idempotency-key "$KEY"

echo
echo "── 2) 立即唤醒 arch（命令行 codex queue）──"
python3 "$REPO/scripts/codex_turn_driver.py" --role arch --force || true

echo
echo "── 3) arch 线程状态 ──"
python3 "$REPO/scripts/codex_turn_driver.py" --role arch --status | sed -n '1,5p'
