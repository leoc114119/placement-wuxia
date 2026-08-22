#!/bin/bash
# 每日 git bundle 冷备：placement-wuxia 全历史打包到 iCloud + 本地，各保留最近 7 份
# 由 LaunchAgent com.leo.placement-wuxia-bundle 每日 10:00 调度；手动亦可直接运行
set -euo pipefail

REPO="$HOME/WorkBuddy/Claw/placement-wuxia"
STAMP=$(date +%Y%m%d)
NAME="placement-wuxia-$STAMP.bundle"
KEEP=7

DESTS=(
  "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Backups/placement-wuxia"
  "$HOME/Backups/placement-wuxia"
)

for d in "${DESTS[@]}"; do
  mkdir -p "$d"
  echo "[$(date '+%F %T')] bundling -> $d/$NAME"
  git -C "$REPO" bundle create "$d/$NAME" --all
done

for d in "${DESTS[@]}"; do
  ls -t "$d"/placement-wuxia-*.bundle 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do
    echo "[$(date '+%F %T')] prune -> $old"
    rm -f "$old"
  done
done

echo "[$(date '+%F %T')] backup done"
