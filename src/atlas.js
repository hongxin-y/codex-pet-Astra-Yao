/**
 * Codex pet atlas geometry and animation table (spriteVersionNumber 2).
 *
 * The spritesheet is a fixed 8 x 11 grid of 192 x 208 frames:
 *
 *   row 0  idle                6 frames
 *   row 1  runningRight        8 frames
 *   row 2  runningLeft         8 frames
 *   row 3  waving              4 frames
 *   row 4  jumping             5 frames
 *   row 5  failed              8 frames
 *   row 6  waiting             6 frames
 *   row 7  running             6 frames
 *   row 8  review              6 frames
 *   row 9  look directions   000deg .. 157.5deg
 *   row 10 look directions   180deg .. 337.5deg
 *
 * Look cells step clockwise in 22.5deg increments and start at "up".
 * This module is dependency-free so the host plugin, the browser client
 * (through the build script) and the tests all share one source of truth.
 */

export const FRAME_WIDTH = 192
export const FRAME_HEIGHT = 208
export const COLUMNS = 8
export const ROWS = 11
export const SHEET_WIDTH = FRAME_WIDTH * COLUMNS // 1536
export const SHEET_HEIGHT = FRAME_HEIGHT * ROWS // 2288
export const SPRITE_VERSION = 2

export const LOOK_ROW = 9
export const LOOK_CELLS = 16
export const LOOK_STEP_DEGREES = 360 / LOOK_CELLS // 22.5

/**
 * Animation table, matching the Codex desktop pet defaults, except for two
 * quirks of this particular atlas:
 *
 *   runningRight  row 1 mixes three kneeling frames (174-189 px tall against
 *                 198 for the rest) into the cycle, so the pet plays row 2 -
 *                 which is clean - mirrored instead.
 *   failed        frame 5 is a lying-down pose; left in the loop the pet flops
 *                 to the floor and stands back up every second.
 *   review        the six-frame cycle ends in a head-down, eyes-closed nod, so
 *                 looping it at 150 ms makes the pet nod once a second. Only
 *                 the hand-on-chin pose (column 2) and its blink (column 3) are
 *                 used, at a much slower cadence, so "thinking" reads as
 *                 pondering instead of headbanging.
 */
export const ANIMATIONS = Object.freeze({
  idle: Object.freeze({ row: 0, frames: 6, interval: 160 }),
  runningRight: Object.freeze({ row: 2, frames: 8, interval: 120, flip: true }),
  runningLeft: Object.freeze({ row: 2, frames: 8, interval: 120 }),
  waving: Object.freeze({ row: 3, frames: 4, interval: 140 }),
  jumping: Object.freeze({ row: 4, frames: 5, interval: 140 }),
  failed: Object.freeze({
    row: 5,
    frames: 7,
    interval: 140,
    columns: Object.freeze([0, 1, 2, 3, 4, 6, 7]),
  }),
  waiting: Object.freeze({ row: 6, frames: 6, interval: 150 }),
  running: Object.freeze({ row: 7, frames: 6, interval: 120 }),
  review: Object.freeze({
    row: 8,
    frames: 3,
    interval: 620,
    columns: Object.freeze([2, 3, 2]),
  }),
})

/**
 * Session state -> animation. The pet has no codex-specific mood atlas, so
 * each DSH state borrows the closest Codex animation.
 */
export const MOOD_ANIMATIONS = Object.freeze({
  idle: 'idle',
  thinking: 'review',
  working: 'running',
  waiting: 'waiting',
  error: 'failed',
})

/** One-shot animations used for short pulses. */
export const PULSE_ANIMATIONS = Object.freeze({
  success: 'jumping',
  poke: 'waving',
})

export function animationFor(name) {
  return ANIMATIONS[name] ?? ANIMATIONS.idle
}

export function moodAnimation(mood) {
  return MOOD_ANIMATIONS[mood] ?? 'idle'
}

/** Frame column for animation at `elapsedMs` since it started (looping). */
export function frameIndex(animation, elapsedMs) {
  const { frames, interval } = animationFor(animation)
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return Math.floor(elapsedMs / interval) % frames
}

/** Sheet column of frame `index`; rows with holes list their own columns. */
export function columnOf(animation, index) {
  const { frames, columns } = animationFor(animation)
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0
  const clamped = Math.max(0, Math.min(frames - 1, safe))
  return columns ? columns[clamped] : clamped
}

/** Frame column clamped to the last frame, for one-shot playback. */
export function lastFrameIndex(animation, elapsedMs) {
  const { frames, interval } = animationFor(animation)
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return Math.min(frames - 1, Math.floor(elapsedMs / interval))
}

export function isFinished(animation, elapsedMs) {
  const { frames, interval } = animationFor(animation)
  return Number.isFinite(elapsedMs) && elapsedMs >= (frames - 1) * interval
}

/** Normalize any angle into [0, 360). */
export function normalizeDegrees(degrees) {
  const value = Number(degrees)
  if (!Number.isFinite(value)) return 0
  return ((value % 360) + 360) % 360
}

/** Look-direction cell index (0 = up, clockwise, 16 steps). */
export function lookIndexOfDegrees(degrees) {
  return Math.round(normalizeDegrees(degrees) / LOOK_STEP_DEGREES) % LOOK_CELLS
}

/** Grid cell of a look-direction index. */
export function lookCell(index) {
  const i = ((Math.round(Number(index) || 0) % LOOK_CELLS) + LOOK_CELLS) % LOOK_CELLS
  return { row: LOOK_ROW + Math.floor(i / COLUMNS), column: i % COLUMNS }
}

/**
 * Look cell for a screen-space vector pointing from the pet to the pointer.
 * +x is right, +y is down, and 0deg points up.
 */
export function lookCellForVector(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI
  return lookCell(lookIndexOfDegrees(degrees))
}

/**
 * CSS geometry for one frame rendered at `size` CSS pixels wide.
 * The background is the whole sheet scaled so one frame is `width` x `height`.
 */
export function spriteGeometry(size, row, column) {
  const width = Math.max(1, Math.round(Number(size) || 0))
  const height = Math.round((width * FRAME_HEIGHT) / FRAME_WIDTH)
  return {
    width,
    height,
    backgroundSize: `${width * COLUMNS}px ${height * ROWS}px`,
    backgroundPosition: `${-column * width}px ${-row * height}px`,
  }
}

/** Atlas description sent to the browser client and used by tests. */
export function describeAtlas() {
  return {
    spriteVersionNumber: SPRITE_VERSION,
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
    columns: COLUMNS,
    rows: ROWS,
    sheetWidth: SHEET_WIDTH,
    sheetHeight: SHEET_HEIGHT,
    lookRow: LOOK_ROW,
    lookCells: LOOK_CELLS,
    animations: ANIMATIONS,
    moods: MOOD_ANIMATIONS,
    pulses: PULSE_ANIMATIONS,
  }
}
