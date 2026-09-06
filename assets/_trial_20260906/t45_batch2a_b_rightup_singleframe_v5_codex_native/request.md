# T45 · 山贼乙右上待机锚，逐张重建

Leo rejected the previous grouped correction because the b right-up/right-down heads and rendering drifted away from the b-right anchor. Leo instructed the pipeline to work one frame at a time with no batch reuse.

This job contains only `shanzei_b_rightup`. The selected high-resolution b-right source is the only authority for identity, rendering, material treatment and head-to-body proportion. The cropped white model supplies only the target right-up/rear viewpoint. No previously rendered b right-up frame is attached, so it cannot contaminate the style or ratio.

Stop after this one candidate and present it to Leo. Do not start b-rightdown until Leo has reviewed this result.
