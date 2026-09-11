#!/bin/zsh
# 批量导出：3D 模型 → 各方向 × 各动画帧 的 2D 精灵帧（完整管线）
#
# 管线：render(SS×, flatcel, 双线性) → downsample(SS×→1×) → postprocess(描边+量化+去斑)
#
# 用法：./export_frames.sh <glb> <tex.raw> <texW> <texH> <outDir> <animIdx|none> <durSec> <nFrames> <SS> <yaw...>
# 例：  ./export_frames.sh m.glb tex.raw 2048 2048 out 1 1.875 8 4 270 0 90 180
#
# ⚠️ 参数必须用「数组」传给 node：zsh 默认不对未加引号的变量做词分割，
#    写成 `node x.mjs $PP` 会把整串当成一个参数，脚本匹配不到任何 --flag，
#    从而静默使用默认阈值（本会话已踩此坑：批跑产物带彩色噪点）。
set -e
GLB="$1"; TEX="$2"; TW="$3"; TH="$4"; OUT="$5"; ANIM="$6"; DUR="$7"; NF="$8"; SS="$9"
shift 9
YAWS=("$@")

TOOLS="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
W=$(( 240 * SS )); H=$(( 320 * SS ))

# 后处理参数（数组形式，保证正确拆分）
# 阈值标定：法线阈值 0.95（高）—— 避免把头发分缕、衣褶等"细纹理"也描出来，
# 否则头发会呈"铁丝网"观感；深度阈值 0.08 —— 只描真正的前后层交界。
PP=(--palette 256 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

for yaw in "${YAWS[@]}"; do
  for (( i=0; i<NF; i++ )); do
    if [ "$ANIM" = "none" ]; then
      T=0
    else
      T=$(python3 -c "print(round($DUR*$i/$NF, 4))")
    fi
    node "$TOOLS/render.mjs" "$GLB" /tmp/_ex.raw $W $H "$ANIM" "$T" flatcel "$TEX" $TW $TH $yaw /tmp/_ex >/dev/null
    node "$TOOLS/downsample.mjs" /tmp/_ex.raw /tmp/_ex.depth /tmp/_ex.normal /tmp/_ex1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_ex1.raw /tmp/_ex1.depth /tmp/_ex1.normal "$OUT/yaw${yaw}_f${i}.raw" 240 320 $PP
  done
  echo "  yaw $yaw done ($NF frames)"
done
echo "TOTAL: $(ls "$OUT"/*.raw | wc -l | tr -d ' ') frames -> $OUT"
