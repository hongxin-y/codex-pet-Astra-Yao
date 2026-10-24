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
 *   row 9  clockwise screen-space look directions 000..157.5 degrees
 *   row 10 clockwise screen-space look directions 180..337.5 degrees
 *
 * Look cells span a full 360deg cursor-look loop in 22.5deg increments:
 * 000 up, 090 right, 180 down, 270 left. The lower body stays anchored while
 * the head, neck, shoulders and upper body follow the gaze naturally.
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
export const LOOK_SWEEP_DEGREES = 360
export const LOOK_STEP_DEGREES = LOOK_SWEEP_DEGREES / LOOK_CELLS // 22.5

/**
 * The repaired atlas uses the native rows without skipped or duplicated
 * playback columns. Row 1 contains the materialized mirror of row 2; row 7
 * samples six distinct phases of that same run. Failed is a standing sigh
 * throughout; review is a steady hand-on-chin loop at a calmer cadence.
 */
export const ANIMATIONS = Object.freeze({
  idle: Object.freeze({ row: 0, frames: 6, interval: 160 }),
  runningRight: Object.freeze({ row: 1, frames: 8, interval: 120 }),
  runningLeft: Object.freeze({ row: 2, frames: 8, interval: 120 }),
  waving: Object.freeze({ row: 3, frames: 4, interval: 200 }),
  jumping: Object.freeze({ row: 4, frames: 5, interval: 140 }),
  failed: Object.freeze({ row: 5, frames: 8, interval: 140 }),
  waiting: Object.freeze({ row: 6, frames: 6, interval: 150 }),
  running: Object.freeze({ row: 7, frames: 6, interval: 120 }),
  review: Object.freeze({ row: 8, frames: 6, interval: 360 }),
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

/** Look cell around the full screen-space loop (0 = up, 90 = right, 180 = down, 270 = left). */
export function lookIndexOfDegrees(degrees) {
  const value = Number(degrees)
  const normalized = normalizeDegrees(Number.isFinite(value) ? value : 0)
  return Math.round(normalized / LOOK_STEP_DEGREES) % LOOK_CELLS
}

/** Grid cell of a look-direction index. */
export function lookCell(index) {
  const value = Number(index)
  const rounded = Math.round(Number.isFinite(value) ? value : 0)
  const i = ((rounded % LOOK_CELLS) + LOOK_CELLS) % LOOK_CELLS
  return { row: LOOK_ROW + Math.floor(i / COLUMNS), column: i % COLUMNS }
}

/**
 * Map a screen-space cursor vector to the clockwise look loop. +x is right and
 * +y is down; zero degrees points upward from the pet.
 */
export function lookCellForVector(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null
  const degrees = normalizeDegrees((Math.atan2(dx, -dy) * 180) / Math.PI)
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
