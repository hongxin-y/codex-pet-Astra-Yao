# 图集修复使用的 imagegen 提示词

使用内置 imagegen；没有调用 CLI/API 后备路径。输入母版是修复前图集第 0 行第 0 列。
动作源图只采用下面提示词生成结果中的第 1、3 行（站立失败、托腮思考）；生成的跑步帧未采用，
最终跑步复用原图第 2 行的连贯姿势。朝向源图采用第二组提示词生成结果。
生成器未精确返回请求尺寸，最终网格由 `scripts/pack-atlas.mjs` 确定。

## 动作源图

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

## 注视源图

```text
Use case: identity-preserve.
Asset type: pixel-art desktop pet cursor-look animation patch.
Input 1 is the exact master character design and desired proportions; input 2 is the corrected action artwork, a supporting style reference. Create sixteen head/gaze directions of the SAME character, matching the master and corrected action artwork. Teal long hair, white headband, golden right-side hair ornament, red/black jacket/cape, white dress, black shoes, golden ring microphone staff. Same eye shape, head width, head/body ratio, dress length and staff length as the master, never a thinner or shorter redesign.

Output a transparent PNG-style atlas with FOUR equal COLUMNS and FOUR equal ROWS, sixteen cells total. Target canvas1536x1664, each cell384x416, i.e. draw at exactly 2x the master sprite scale for later uniform downsampling. Same character size and identical body placement in all sixteen cells. The standing body and upright gold staff are in exactly the master pose throughout. Shoe soles at y404 in each double-size cell; staff top y10 and tip y404. Torso centered x192. Small blank gutter on all sides inside each cell. No sprite overlaps into another cell.

Reading order left-to-right, then top-to-bottom: look toward screen-space angles 0,22.5,45,67.5,90,112.5,135,157.5,180,202.5,225,247.5,270,292.5,315,337.5 degrees, where 0 is UP,90 RIGHT,180 DOWN,270 LEFT. These are the directions the HEAD AND EYES look at a cursor, not full-body rotations. All bodies keep the same front three-quarter standing view. Gently tilt/turn only the head and shift pupils: first frame looks up, fifth frame right, ninth frame down, thirteenth frame left, other frames interpolate those directions. Keep head size constant in profile, not squashed; keep upright torso and steady feet. Same hand holds the microphone staff at the same image side. No back view, no spinning body, no blinks masquerading as directions.
Pure transparency, no checkerboard drawn, no background, no colored fringe, no shadow, no gridlines, no text, no numbering. Match the crisp original pixel-art rendering and face identity; no vector/cartoon redesign.
```
