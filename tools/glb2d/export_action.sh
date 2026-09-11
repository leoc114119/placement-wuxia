#!/bin/zsh
# 3D→2D 动作帧导出（完整管线 · 一条命令）
#
# 管线：render(4x, flatcel) → downsample(4x→1x) → postprocess(描边+量化)
#       → PNG 落盘 → PNG-8 无损编码
#
# 用法：
#   ./export_action.sh <glb> <tex.raw> <outDir> <animIdx|none> <durSec> <srcFramesCSV> <yawMapCSV>
# 例：
#   ./export_action.sh m.glb t.raw out 1 1.875 "0,4,12,19,24" "right:90,rightup:45,..."
#
# 关键参数（均有实测依据，勿随意改）：
#   --palette 256 --palette-reserve 8  → 量化 248 色，留 8 位给描边墨色，
#                                        使最终 ≤255 色 → PNG-8 可无损编码
#   --depth-thresh 0.08 / --normal-thresh 0.95 → 描边只取真实形体转折，
#                                        不会把发丝/衣褶细纹理也描出来
#   SS=4（960×1280）→ 必须超采样，否则边缘锯齿
set -e
GLB="$1"; TEX="$2"; OUT="$3"; ANIM="$4"; DUR="$5"; SRCFRAMES="$6"; YAWMAP="$7"

TOOLS="$(cd "$(dirname "$0")" && pwd)"
SS=4
W=$(( 240 * SS )); H=$(( 320 * SS ))
NPX_TOTAL=56   # 模型自带动画的总帧数（walk=56@30fps），用于 t = srcFrame/dur 换算；由调用方保证
mkdir -p "$OUT"

# 后处理参数（zsh 数组，勿写成字符串——字符串会被当成单个参数导致静默用默认值）
PP=(--palette 256 --palette-reserve 8 --outline 1 --depth-thresh 0.08 --normal-thresh 0.95 --chroma-blur 0 --speckle 1)

IFS=',' read -rA DIRS <<< "$YAWMAP"
IFS=',' read -rA SRC <<< "$SRCFRAMES"

for entry in "${DIRS[@]}"; do
  dir="${entry%%:*}"
  yaw="${entry##*:}"
  i=1
  for sf in "${SRC[@]}"; do
    t=$(python3 -c "print(round($sf/$NPX_TOTAL*$DUR,5))")
    node "$TOOLS/render.mjs" "$GLB" /tmp/_ea.raw $W $H "$ANIM" "$t" flatcel "$TEX" 2048 2048 "$yaw" /tmp/_ea >/dev/null 2>&1
    node "$TOOLS/downsample.mjs" /tmp/_ea.raw /tmp/_ea.depth /tmp/_ea.normal /tmp/_ea1 $W $H $SS >/dev/null
    node "$TOOLS/postprocess.mjs" /tmp/_ea1.raw /tmp/_ea1.depth /tmp/_ea1.normal /tmp/_ea2.raw 240 320 $PP >/dev/null
    python3 -c "
from PIL import Image
im = Image.frombytes('RGBA', (240, 320), open('/tmp/_ea2.raw','rb').read())
im.save('$OUT/${dir}_${i}.png')
"
    i=$((i+1))
  done
  echo "  $dir done"
done

# PNG-8 无损编码
python3 "$TOOLS/png8_encode.py" "$OUT" "$OUT"
echo "TOTAL: $(ls $OUT/*.png | wc -l | tr -d ' ') files @ $OUT"
