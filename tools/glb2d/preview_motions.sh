#!/bin/zsh
# 动作预览批处理：下载 CMU 动作 → 重定向到我们的模型 → 渲关键帧 → 拼预览图
#
# 用法：./preview_motions.sh <model.glb> <tex.raw> <outDir> <motionId:label> ...
# 例：  ./preview_motions.sh m.glb t.raw out 02_07:剑术 13_17:拳击
set -e
GLB="$1"; TEX="$2"; OUT="$3"; shift 3
MOTIONS=("$@")

TOOLS="$(cd "$(dirname "$0")" && pwd)"
CACHE="${OUT}/bvh"
mkdir -p "$OUT" "$CACHE"
PP=(--palette 16 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)
NF=6            # 每个动作渲 6 帧
SS=3

for item in "${MOTIONS[@]}"; do
  ID="${item%%:*}"
  LABEL="${item#*:}"
  SUBJ=$(echo "$ID" | cut -d_ -f1)
  BVH="${CACHE}/${ID}.bvh"
  if [ ! -f "$BVH" ]; then
    curl -s -m 60 -A "Mozilla/5.0" -o "$BVH" \
      "https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/0${SUBJ}/${ID}.bvh" || { echo "  下载失败 $ID"; continue; }
  fi
  SZ=$(stat -f%z "$BVH" 2>/dev/null || echo 0)
  if [ "$SZ" -lt 10000 ]; then echo "  动作不存在或过小 $ID ($SZ B)"; continue; fi

  RT="${CACHE}/${ID}.rt.json"
  node "$TOOLS/retarget.mjs" "$GLB" "$BVH" "$RT" --frames 120 --fps 30 --root y >/dev/null 2>&1 || { echo "  重定向失败 $ID"; continue; }
  DUR=$(python3 -c "import json;print(json.load(open('$RT'))['duration'])")

  W=$((240*SS)); H=$((320*SS))
  for (( i=0; i<NF; i++ )); do
    T=$(python3 -c "print(round($DUR*$i/$NF,3))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_pv.raw $W $H none "$T" flatcel "$TEX" 2048 2048 225 /tmp/_pv "$RT" >/dev/null 2>&1
    node "$TOOLS/downsample.mjs" /tmp/_pv.raw /tmp/_pv.depth /tmp/_pv.normal /tmp/_pv1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_pv1.raw /tmp/_pv1.depth /tmp/_pv1.normal "${OUT}/${ID}_f${i}.raw" 240 320 $PP >/dev/null
  done
  echo "  ✔ ${ID} (${LABEL})  ${DUR}s  -> ${NF} 帧"
done
echo "DONE: $(ls ${OUT}/*.raw 2>/dev/null | wc -l | tr -d ' ') frames"
