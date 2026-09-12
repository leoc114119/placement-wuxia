#!/usr/bin/env python3
"""生成自包含预览页（图片全部内嵌 base64，不依赖本地服务与相对路径）。

用法：python3 build_preview_precision.py
输出：assets/_trial_20260912/预览_细节精修A.html
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4"
REF = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4_A"
RAW = ROOT / "assets/_trial_20260912/glb2d_idle/idle_6dir_v4_A/_raw_preview"
OUT = ROOT / "assets/_trial_20260912/预览_细节精修A.html"
FACINGS = [("left", "左"), ("leftdown", "左下"), ("leftup", "左上"),
           ("right", "右"), ("rightdown", "右下"), ("rightup", "右上")]
FRAME_MS = 1327


def uri(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def main() -> None:
    data = {}
    for key, folder in (("src", SRC), ("ref", REF)):
        for facing, _ in FACINGS:
            data[f"{key}_{facing}"] = [uri(folder / f"idle_{facing}_{i}.png") for i in range(1, 6)]
    for facing, _ in FACINGS:
        data[f"raw_{facing}"] = [uri(RAW / f"raw_{facing}_{i}.png") for i in range(1, 6)]

    html = TEMPLATE.replace("__DATA__", json.dumps(data, ensure_ascii=False)) \
                   .replace("__FACINGS__", json.dumps(FACINGS, ensure_ascii=False)) \
                   .replace("__MS__", str(FRAME_MS))
    OUT.write_text(html, encoding="utf-8")
    print(f"{OUT}  ({OUT.stat().st_size/1024:.0f} KB)")


TEMPLATE = """<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>idle 六向 · 细节精修 A 方案对照</title>
<style>
 body{background:#16161a;color:#e8e8ea;font:14px/1.6 -apple-system,"PingFang SC",sans-serif;margin:0;padding:20px}
 h1{font-size:18px;margin:0 0 4px} .sub{color:#9aa;margin-bottom:16px}
 .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
 .card{background:#1e1e24;border:1px solid #333;border-radius:8px;padding:10px}
 .card h2{font-size:14px;margin:0 0 8px;color:#ffd866}
 .pair{display:flex;gap:10px;justify-content:center}
 .col{text-align:center}
 .col span{display:block;font-size:12px;color:#99a;margin-bottom:4px}
 canvas{image-rendering:pixelated;background:#0e0e11;border:1px solid #2a2a30;border-radius:4px}
 .bar{margin:0 0 14px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
 button{background:#2c2c34;color:#e8e8ea;border:1px solid #444;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:13px}
 button.on{background:#3a4a6a;border-color:#5a7aa8}
</style></head><body>
<h1>idle 六向 · 细节精修 A 方案对照</h1>
<div class="sub">左=现在线上的源帧 &nbsp;|&nbsp; 右=A 方案精修（mxai gpt-image-2 / 一条方向一张图 / 逐帧配准后回填原 alpha）&nbsp;|&nbsp; 已放 3× 便于看细节</div>
<div class="bar">
 <span>缩放</span>
 <button data-z="1">1×</button><button data-z="2">2×</button><button data-z="3" class="on">3×</button>
 <button id="pause">暂停</button>
 <span id="tip" style="color:#889">每帧 1327ms，与原 idle 节奏一致</span>
</div>
<div class="grid" id="grid"></div>
<script>
const D=__DATA__, F=__FACINGS__, MS=__MS__;
let zoom=3, paused=false, t0=performance.now();
const grid=document.getElementById('grid');
const canvases=[];
for(const [key,label] of F){
  const card=document.createElement('div'); card.className='card';
  card.innerHTML='<h2>'+label+'</h2><div class="pair">'+
    '<div class="col"><span>源帧</span><canvas data-k="src_'+key+'" width="240" height="320"></canvas></div>'+
    '<div class="col"><span>A 方案（套源轮廓）</span><canvas data-k="ref_'+key+'" width="240" height="320"></canvas></div>'+
    '<div class="col"><span>模型原始（未裁）</span><canvas data-k="raw_'+key+'" width="240" height="320"></canvas></div></div>';
  grid.appendChild(card);
}
document.querySelectorAll('canvas').forEach(c=>{
  const img=new Image(); img.src=D[c.dataset.k][0]; c._imgs=D[c.dataset.k]; c._i=0; c._ready=false;
  img.onload=()=>{c._ready=true; c.getContext('2d').drawImage(img,0,0);};
  canvases.push(c);
});
function applyZoom(){ canvases.forEach(c=>{ c.style.width=(240*zoom)+'px'; c.style.height=(320*zoom)+'px'; }); }
applyZoom();
function frameAt(ms){ return Math.floor(ms/MS)%5; }
function loop(now){
  if(!paused && now-t0>0){
    const i=frameAt(now);
    canvases.forEach(c=>{ if(c._i!==i && c._ready){
      const im=new Image(); im.onload=()=>{ c.getContext('2d').clearRect(0,0,240,320); c.getContext('2d').drawImage(im,0,0); c._i=i; };
      im.src=c._imgs[i];
    }});
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
document.querySelectorAll('[data-z]').forEach(b=>b.onclick=()=>{
  zoom=+b.dataset.z; document.querySelectorAll('[data-z]').forEach(x=>x.classList.remove('on'));
  b.classList.add('on'); applyZoom();
});
document.getElementById('pause').onclick=e=>{ paused=!paused; if(!paused) t0=performance.now();
  e.target.textContent=paused?'播放':'暂停'; };
</script></body></html>
"""

if __name__ == "__main__":
    main()
