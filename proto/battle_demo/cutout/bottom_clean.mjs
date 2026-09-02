// 底部侧向杂素清除：y >= below 且 x 在 [x0,x1] 保留列之外的像素 → 透明
import { decodePng, encodePng } from './png_codec.mjs';
const [file, below, x0, x1] = process.argv.slice(2);
const img = decodePng(file);
const { width, height, rgba } = img;
const Y = +below, X0 = +x0, X1 = +x1;
let wiped = 0;
for (let y = Y; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (x < X0 || x > X1) {
      const i = (y * width + x) * 4 + 3;
      if (rgba[i]) { rgba[i] = 0; wiped++; }
    }
  }
}
encodePng(file, width, height, rgba);
console.log(`[bottom_clean] ${file}: y>=${Y} 列外抹除 ${wiped}px`);
