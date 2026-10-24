# 图集 imagegen 源图与提示词记录

2026-10-25 修复版使用内置 imagegen；没有调用 CLI/API 后备路径。当前源图、提示词与归档摘要见
[`coherent/generation.json`](../assets/atlas-source/coherent/generation.json)，固定格条带及哈希见
[`coherent/manifest.json`](../assets/atlas-source/coherent/manifest.json)。工作行已改为独立站立工作动作。
正式打包不再使用下方的旧规则网格，也不再逐帧缩放或局部拼贴。详见 [复核记录](atlas-review.md)。

## 旧版源图与取帧布局（历史记录，不再用于构建）

- `normalized/idle.png`：7 格；运行时使用前 6 格。
- `normalized/run.png`：8 格向左跑步；第 7 行从相位 `[0,1,3,4,5,7]` 取 6 格。
- `normalized/run-right.png`：4×2 八格向右跑步，独立绘制，持杖手仍在画面左侧。
- `normalized/wave.png`：2×2 四格全身挥手图，四帧都抬起画面右侧自由手。
- `normalized/jump.png`：5 格；第 4 帧向下延伸到默认分隔线之外，打包器为该格扩展裁切区域。
- `normalized/failed.png`：4×2 八格全身站立叹气循环。
- `normalized/waiting.png`：6 格等待动作；`normalized/review.png`：3×2 六格全身托腮思考循环。
- `look/row9-000-157.png`、`look/row10-180-337.png`：各 4×2 八格完整角色帧；顺序分别是 000–157.5° 和 180–337.5°。

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

## 已弃用：横向 180° 头部扫视

```text
Use case: identity-preserve.
Asset type: pixel-art desktop pet cursor-look animation patch.
Input 1 is the exact master character design and desired proportions; input 2 is the corrected action artwork, a supporting style reference. Create sixteen head/gaze directions of the SAME character, matching the master and corrected action artwork. Teal long hair, white headband, golden right-side hair ornament, red/black jacket/cape, white dress, black shoes, golden ring microphone staff. Same eye shape, head width, head/body ratio, dress length and staff length as the master, never a thinner or shorter redesign.

Output a transparent PNG-style atlas with FOUR equal COLUMNS and FOUR equal ROWS, sixteen cells total. Target canvas1536x1664, each cell384x416, i.e. draw at exactly 2x the master sprite scale for later uniform downsampling. Same character size and identical body placement in all sixteen cells. The standing body and upright gold staff are in exactly the master pose throughout. Shoe soles at y404 in each double-size cell; staff top y10 and tip y404. Torso centered x192. Small blank gutter on all sides inside each cell. No sprite overlaps into another cell.

Reading order left-to-right, then top-to-bottom: look toward screen-space angles 0,22.5,45,67.5,90,112.5,135,157.5,180,202.5,225,247.5,270,292.5,315,337.5 degrees, where 0 is UP,90 RIGHT,180 DOWN,270 LEFT. These are the directions the HEAD AND EYES look at a cursor, not full-body rotations. All bodies keep the same front three-quarter standing view. Gently tilt/turn only the head and shift pupils: first frame looks up, fifth frame right, ninth frame down, thirteenth frame left, other frames interpolate those directions. Keep head size constant in profile, not squashed; keep upright torso and steady feet. Same hand holds the microphone staff at the same image side. No back view, no spinning body, no blinks masquerading as directions.
Pure transparency, no checkerboard drawn, no background, no colored fringe, no shadow, no gridlines, no text, no numbering. Match the crisp original pixel-art rendering and face identity; no vector/cartoon redesign.
```

## 当前处理：全身动作帧与 16 向环绕注视

挥手、失败、思考和方向帧都直接使用完整角色源图，避免局部贴片带来的接缝、重复肢体和光照不一致。动作组按各自明确的列数提取：挥手 2×2，失败 4×2，思考 3×2；全组使用等比共同缩放、身体锚点和 `y=203` 脚底基线。

方向顺序使用屏幕坐标的完整环绕：0° 向上、90° 向右、180° 向下、270° 向左。第 9 行覆盖 000°–157.5°，第 10 行覆盖 180°–337.5°。头颈、肩部和少量上身顺着视线自然跟随；臀部、腿、鞋和持杖手/法杖稳定。生成整格角色帧，不用全身绕轴旋转，也不把独立头部粘贴到身体上。第 9、10 行分别使用行内统一等比尺度，归一到相同的 198 px 中位占用高度；不能逐格缩放。

向右跑步源独立生成，不再镜像向左跑步，避免法杖从画面左侧翻到右侧。所有最终坐标、取格、共同尺度、脚底基线和单格边界检查由 `scripts/pack-atlas.mjs` 处理。
