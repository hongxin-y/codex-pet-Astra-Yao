# 图集 imagegen 源图与提示词记录

使用内置 imagegen；没有调用 CLI/API 后备路径。本轮重新生成并统一第 0–8 行所有动画帧，使用 `assets/atlas-source/normalized/` 中的待机、跑步、挥手、跳跃、失败、等待和思考源图。
左右跑步复用同一组连贯动作并做水平镜像；第 7 行从跑步相位中抽取 6 帧。第 9–10 行使用下面的全身转身源图。
早期 `look.png` 是头部注视方案，现已被全身转身源图取代，仅作历史参考。生成器未精确返回请求尺寸，最终网格由 `scripts/pack-atlas.mjs` 确定。

## 当前源图与取帧布局

- `normalized/idle.png`：7 格；运行时使用前 6 格。
- `normalized/run.png`：8 格；用于左右跑步以及第 7 行的 6 个工作跑步相位。
- `normalized/wave.png`：2×2 四格全身挥手图。
- `normalized/jump.png`：5 格；第 4 帧向下延伸到默认分隔线之外，打包器为该格扩展裁切区域。
- `normalized/failed.png`、`waiting.png`、`review.png`：分别为 8、6、6 格。
- `turntable/`：16 格全身转身源图及分批角度过渡图。

## 早期动作图集提示词（历史草案）

以下是曾用于规划图集布局的长提示词，不代表当前源图的逐字生成提示；当前实际源图来自上面的分组文件。

```text
Use case: identity-preserve. Production pixel-art animation repair.
Input 1 is the master character identity reference (one 192x208 sprite); input 2 is a good idle strip for style only. Neither image is the output layout.
Create a NEW REPLACEMENT PATCH ATLAS using that EXACT same character rig, head size, eye style, anatomy, staff, clothing, pixel texture and palette. Output a clean transparent 1536x832 canvas with exactly EIGHT COLUMNS and FOUR ROWS. Each cell is exactly 192x208. No grid drawn, no labels, no extra borders or padding. Character scale must match the provided master: staff top y=5, shoe bottom y=202, head about 65x65, torso centered x=96, outfit and full long hair matching the original. No sprite clipping. Empty cells must be perfectly transparent.

ROW 0: EIGHT successive rightward RUNNING frames. Side-three-quarter facing screen RIGHT. Upper body upright/slightly forward at a FIXED height. Alternate left-foot and right-foot contact with passing and full-stride poses. In contact frames one leg is visibly extended downward to the baseline, other leg swings behind or forward. NO frame may show sitting/kneeling/squatting; NEVER put both knees bent underneath the body. At least one leg extends toward the ground in every frame. Keep head, shoulders and hips at consistent height. Constant-length microphone staff held upright in the same hand in every frame, long teal hair streaming behind to screen left. Smooth closed loop.

ROW 1: EIGHT successive STANDING SAD/sighing failure frames, same front three-quarter view as the master. Both shoes remain on the ground with legs upright and same head/torso size as master. Eyes lower, shoulders subtly droop, tiny blink/sigh changes ONLY. Gold staff stays vertical on left side of image, same length and hand. NO sitting, kneeling, crouching, collapsing, lying down or changes of view in any cell. Smooth subtle loop.

ROW 2: SIX successive RUNNING IN PLACE frames, front three-quarter view facing slightly screen LEFT, suitable for working/busy. Legs visibly alternate extended contact and passing strides with consistent torso/head height. The moving feet and flowing cape must make it clearly a run, never a series of standing hand gestures. NO kneeling, sitting, squatting, crossed legs or size changes. Same gold staff and hand, no missing prop. Columns 6 and 7 completely empty.

ROW 3: SIX successive calm THINKING frames. All frames hold the SAME hand-on-chin gesture, head upright with identical head position and body scale, shoes on baseline. Only eyes shift gently, one blink, tiny hair movement. NO bowed head, nod, posture changes, pointing or crossed arms. Same gold staff upright on left in the other hand. Columns 6 and 7 completely empty.

This sheet is game animation data, not a presentation. Use exactly the requested number of rows and columns, identical cell dimensions, and align every sprite to them. Do not add rows. No background, shadow, checkerboard, white fringe, text, numbers, frame outlines or watermark. Preserve the original crisp small-pixel style, not rounded vector/chibi redesign.
```

## 已弃用：头部注视源图

```text
Use case: identity-preserve.
Asset type: pixel-art desktop pet cursor-look animation patch.
Input 1 is the exact master character design and desired proportions; input 2 is the corrected action artwork, a supporting style reference. Create sixteen head/gaze directions of the SAME character, matching the master and corrected action artwork. Teal long hair, white headband, golden right-side hair ornament, red/black jacket/cape, white dress, black shoes, golden ring microphone staff. Same eye shape, head width, head/body ratio, dress length and staff length as the master, never a thinner or shorter redesign.

Output a transparent PNG-style atlas with FOUR equal COLUMNS and FOUR equal ROWS, sixteen cells total. Target canvas1536x1664, each cell384x416, i.e. draw at exactly 2x the master sprite scale for later uniform downsampling. Same character size and identical body placement in all sixteen cells. The standing body and upright gold staff are in exactly the master pose throughout. Shoe soles at y404 in each double-size cell; staff top y10 and tip y404. Torso centered x192. Small blank gutter on all sides inside each cell. No sprite overlaps into another cell.

Reading order left-to-right, then top-to-bottom: look toward screen-space angles 0,22.5,45,67.5,90,112.5,135,157.5,180,202.5,225,247.5,270,292.5,315,337.5 degrees, where 0 is UP,90 RIGHT,180 DOWN,270 LEFT. These are the directions the HEAD AND EYES look at a cursor, not full-body rotations. All bodies keep the same front three-quarter standing view. Gently tilt/turn only the head and shift pupils: first frame looks up, fifth frame right, ninth frame down, thirteenth frame left, other frames interpolate those directions. Keep head size constant in profile, not squashed; keep upright torso and steady feet. Same hand holds the microphone staff at the same image side. No back view, no spinning body, no blinks masquerading as directions.
Pure transparency, no checkerboard drawn, no background, no colored fringe, no shadow, no gridlines, no text, no numbering. Match the crisp original pixel-art rendering and face identity; no vector/cartoon redesign.
```

## 挥手行与 16 向转身（当前使用）

挥手源为 `assets/atlas-source/normalized/wave.png`，采用 2×2 四格全身图。之前源图的人物跨越两行，错误的提取范围会切掉小腿和鞋部；已换成每格独立、脚部完整的源图。四帧持杖手和全身比例一致，只改变另一只手的挥动幅度及表情。

转身源保存在 `assets/atlas-source/turntable/`：四向基准图，以及正面→右侧、右侧→背面、背面→左侧、左侧→正面四条各含 4 帧的过渡图。正面、侧面和背面基准参考了用户补充的角色图；背面帧不显示脸，手杖保持同一只手。转身各方向的腿部比例略微加长，并按源图组统一缩放、腿部中心横向对齐、鞋底对齐到 `y=203`。孤立的小型生成碎片会在打包时去除，避免把杂色留进正式图集。方向顺序为 0° 正面、90° 右侧、180° 无脸背面、270° 左侧，每格递增 22.5°。早期整张 4×4 转身候选存在中间角度重复，未采用。

各动作源图都强调固定比例和透明背景。跳跃第 4 帧超出默认分隔线，打包器单独扩展提取范围以保留完整鞋部；挥手源按 2×2 布局提取。转身条带每组使用相邻基准角，按角度顺序生成，不把脸转到背面的错误一侧。最终坐标、裁切、组内共同尺度、身体锚点、基线和无裁切检查由 `scripts/pack-atlas.mjs` 负责。
