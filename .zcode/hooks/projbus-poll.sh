#!/bin/zsh
# SessionStart 钩子：开工自动查看 projbus 未读（rd 收件箱），并把「已送达」标掉。
#
# 2026-09-10 修正：poll-context 默认只返回**最旧**的 limit(50) 条——收件箱积压时新消息会被完全挡住。
#                故显式 --limit 300，并只把**最新**的若干条列出来（计数仍报全量）。
# 2026-09-11 v2：本钩子是 rd 的**真投递路径**——消息在此被注入会话上下文，
#                故投递后调 mark-delivered 标「已送达」。
#                ⚠️ 与「记账型轮询」区分：定时器（notify/autodispatch）只统计未读数，
#                绝不打标，否则机器人会把整箱标成已读、真人再也看不到未读。
export PROJBUS_DB="$HOME/.projbus/projbus.sqlite"
REPO="/Users/leochen/WorkBuddy/Claw/placement-wuxia"
CLI="$REPO/scripts/projbus/projbus"
if [ -x "$CLI" ] && [ -f "$PROJBUS_DB" ]; then
  echo "── projbus 未读（rd）──"
  "$CLI" unread --to rd --db "$PROJBUS_DB" 2>/dev/null || true
  "$CLI" poll-context --to rd --limit 300 --db "$PROJBUS_DB" | tail -12 || true
  # 真投递完成 → 标已送达（只标「已列出」的那部分序号，不碰未列出的）
  MAXSEQ=$("$CLI" poll-context --to rd --limit 300 --json --db "$PROJBUS_DB" 2>/dev/null \
           | python3 -c "import json,sys;m=json.load(sys.stdin)['messages'];print(max([x['seq'] for x in m],default=0))" 2>/dev/null)
  [ -n "$MAXSEQ" ] && [ "$MAXSEQ" -gt 0 ] && \
    "$CLI" mark-delivered --to rd --up-to-seq "$MAXSEQ" --db "$PROJBUS_DB" >/dev/null 2>&1 || true
fi
