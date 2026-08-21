# 放置武侠 · ZCode 走通流程验证 v0.1

> 状态：**进行中（Leo 实操）**
> 日期：2026-08-18
> 目标：用 7 天 ZCode 体验期,把「AI 生成 UI 素材 → 交付项目 → ZCode 拼装 → 预览验收」整条链路跑通一次。

---

## 1. 流程全景

```
[混元游戏 / CogView]          [项目目录]            [ZCode]
  生成素材(网页)    →   下载 PNG 放入 assets/ui/  →  @引用 + 指令拼装 → preview/index.html
      ① 素材生成              ② 交付                 ③ 拼装
```

---

## 2. 第①步：生成素材（你在网页操作）

**推荐平台**：混元游戏视觉生成平台（hunyuan.tencent.com/game，免费）或智谱 CogView（有免费额度）。

**每条 prompt 前置风格圣经**（来自 04-UI风格规范-v0.1）：

```
中国风水墨武侠游戏素材，活泼年轻的水墨国风，明快清透，
灵动轻盈的毛笔线条，宣纸背景+天青晕染，墨色为主+朱砂/竹青/淡金点缀，
现代国风气质（参考一念逍遥/逆水寒），明亮不灰暗，年轻不老气，非Q版，
游戏资产，干净背景，无文字无水印
```

**追加素材类型描述**：

| 素材 | 追加描述 | 存放位置 |
|---|---|---|
| 主按钮 ×2 | 游戏主按钮,朱砂色底,墨笔勾边,边缘有晕染感,圆角矩形,扁平可平铺 | `buttons/btn_primary_normal.png`（+1 张按下变暗版 `_pressed.png`） |
| 面板 ×1 | 游戏对话框面板,宣纸/羊皮纸底,边缘做旧做残破感,简单云纹边框,整体透明可平铺 | `panels/panel_dialog.png` |
| 图标 ×3 | 水墨简笔图标,一勾一划:剑、掌法、铜钱,纯色墨线+少量朱砂点缀,透明底 | `icons/icon_sword.png` / `icon_palm.png` / `icon_coin.png` |

**要求**：全部选透明底 PNG（若有背景,用平台的一键去背景功能）,尺寸尽量接近 README 里登记的规格。

---

## 3. 第②步：交付素材（你在文件管理器操作）

1. 下载 PNG,按上表放入 `placement-wuxia/assets/ui/` 对应子目录
2. **重命名必须精确**（ZCode 按文件名 + README 定位素材）
3. 打开 `assets/ui/README.md`,更新每个素材的实际尺寸/九宫格边距（生成图尺寸可能与模板不同）
4. 若某素材没生成成功,README 里保留占位行即可,拼装时 ZCode 会用 CSS 占位

---

## 4. 第③步：ZCode 拼装（你在 ZCode 里操作）

在 ZCode 对话中输入：

```
@placement-wuxia/assets/ui/README.md @placement-wuxia/assets/ui
按 README 素材说明,把 preview/index.html 里三处待拼装区域完成:
1. #faction-panel 背景用 panel_dialog.png(九宫格裁切,边距按 README)
2. 三个 .skill-slot 分别用 icon_sword / icon_palm / icon_coin,居中透明底
3. #main-btn 用 btn_primary_normal 和 btn_primary_pressed,按下时切换
素材缺失处保留 CSS 占位并告诉我缺了哪张。
```

等 ZCode 完成后,**浏览器打开 `preview/index.html` 验收**。

---

## 5. 验收标准（三关）

- [ ] **效果**：水墨国风风格统一,素材不拉伸变形,按钮按下去有状态切换
- [ ] **可维护**：ZCode 产出的 HTML/CSS 结构清晰,素材引用都在 assets/ui/ 下
- [ ] **稳定**：页面无报错,刷新正常

---

## 6. 本次验证结论记录（走通后填）

| 项 | 结果 |
|---|---|
| 素材平台用了哪个? | |
| 素材生成顺利吗?（几张成功/失败） | |
| ZCode 拼装一次过吗? | |
| 全程耗时/卡点 | |
| 下次优化的环节 | |

---

## 7. 变更记录

| 日期 | 版本 | 变更 | 签字 |
|---|---|---|---|
| 2026-08-18 | v0.1 | 创建:UI 素材→ZCode 走通流程验证 | Leo |
