# T45 第二批 manifest v2 整合回执

- 打回原因：seq=231 锁定 14 字段模板缺失，原 manifest 为指针式 22 行清单。
- 修正文件：`assets/_trial_20260909/t45_hero_weapon_second_batch_seq241/left_mirror_seq241_v1/manifest_22_rows_v2_locked_template.json`
- 行数：22（右 11 + 左 11）
- 字段：`frameId/bodyFrame/candidateBodySha256/runtimeBodySha256/bodyCorrection/gripPointPx/fistCenterPx/angleDeg/angleDefinition/layerOrder/maskPolicy/occlusionMaskPath+occlusionMaskSha256/visibleStubs/status`
- right visualReview：`selected_by_Leo`
- left visualReview：`pending_Leo`
- specGate：`pending_pm_scan`
- runtimeRelease：`false`
- mirror masks：`left_mirror_seq241_v1/masks_v2/`
- pixel rule：右系拳心均来自逐帧像素级定位；左系按 `x_left=239-x_right` 确定性镜像。
