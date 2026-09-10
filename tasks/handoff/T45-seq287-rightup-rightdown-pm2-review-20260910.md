# T45 seq=287 · 右上/右下 walk-atk-jump PM2 二审包

## 状态

- `visualReview=selected_by_Leo`
- `specGate=pending_pm_scan`
- `integrationGate=not_handed_off`
- `runtimeRelease=false`

## 范围

右上、右下各 10 帧：`walk×3 + atk×4 + jump×3`。右向定稿动作作为新生成的动作源；右上/右下 idle 不动；cast 沿用原三帧，不重生成。

## 产物

- `assets/_trial_20260910/t45_hero_rightup_rightdown_pm2_review_seq287/normalized/rightup/`
- `assets/_trial_20260910/t45_hero_rightup_rightdown_pm2_review_seq287/normalized/rightdown/`
- `assets/_trial_20260910/t45_hero_rightup_rightdown_pm2_review_seq287/qa/manifest_seq287.json`
- `assets/_trial_20260910/t45_hero_rightup_rightdown_pm2_review_seq287/manifest.json`

## 机械核对

20 帧均为 `240×320 RGBA`；视觉高度在 T45 允许带内；脚底基线 `y=300`；全像素 alpha 质心 `x=120±1`；画布边缘透明；无武器/文字；runtime 未修改。

PM2 请独立复核来源 SHA、逐帧动作/方向、尺寸/比例/脚线/质心及状态字段。通过前保持 candidate-only。
