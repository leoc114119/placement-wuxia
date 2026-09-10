# T45 seq=323 · 右向 Phase B + Phase C 候选交接

## 范围

- Phase B 右系 7 帧：`walk_right_1/2/3`、`atk_right_1/2/3/4`。
- jump 三帧按冻结口径豁免，不配锚。
- Phase C 对应左系 7 帧：全部由右系候选确定性水平镜像派生。
- 0 生成；runtime 未改；candidate-only。

## 复用与处理

- 复用既有独立剑模/裸剑层来源和 seq=232 的镜像公式：`x_left=239-x_right+dx`，本批逐帧 `dx=0`。
- 右系 layerOrder=`weapon_front`；遮罩使用白名单 `complete_fist_cutout_top_with_grip_window`。
- 右系逐帧使用当前 seq=321 final body candidate SHA；左系 body/weapon/mask 均确定性镜像，记录 `derivedFrom`。
- 遮罩为身体 alpha ROI 加完整拳顶遮挡区；逐帧拳区 weapon pixels after mask=`0`，主体域删除=`0`、RGB 改动=`0`。

## 机器自证

- 右系 7/7：weapon source、translation、fist center、angle、mask SHA、weapon bbox、fist ROI 遮罩证据齐全。
- 左系 7/7：body mirror exact、weapon/mask mirror exact、angle sign inverted、dx/dy ledger 齐全。
- `qa/phaseB_C_qa.json`：`allRightMachineChecksPass=true`、`allLeftMirrorDerived=true`、`runtimeTouched=false`。

## 产物

`assets/_trial_20260910/t45_hero_weapon_phaseB_C_seq323/`

- `manifest.json`：14 字段模板行 + leftDerivation ledger
- `weapon_layers/`、`occlusion_masks/`、`composites/`
- `qa/phaseB_C_qa.json`

等待 Leo 视觉门与 PM2 规格门；未过门前不写正式 runtime。
