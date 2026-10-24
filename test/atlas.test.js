import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ANIMATIONS,
  COLUMNS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  LOOK_CELLS,
  ROWS,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  animationFor,
  columnOf,
  describeAtlas,
  frameIndex,
  isFinished,
  lastFrameIndex,
  lookCell,
  lookCellForVector,
  lookIndexOfDegrees,
  normalizeDegrees,
  spriteGeometry,
} from '../src/atlas.js'

test('atlas dimensions describe a Codex v2 spritesheet', () => {
  assert.equal(FRAME_WIDTH, 192)
  assert.equal(FRAME_HEIGHT, 208)
  assert.equal(COLUMNS, 8)
  assert.equal(ROWS, 11)
  assert.equal(SHEET_WIDTH, 1536)
  assert.equal(SHEET_HEIGHT, 2288)

  const atlas = describeAtlas()
  assert.equal(atlas.spriteVersionNumber, 2)
  assert.equal(atlas.sheetWidth, SHEET_WIDTH)
  assert.equal(atlas.sheetHeight, SHEET_HEIGHT)
  assert.equal(atlas.lookRow, 9)
  assert.equal(atlas.lookCells, 16)
  assert.equal(Object.keys(atlas.animations).length, 9)
})

test('animation table uses the Codex row and frame counts', () => {
  assert.deepEqual(ANIMATIONS.idle, { row: 0, frames: 6, interval: 160 })
  // The mirrored pixels are now in the asset's native right-run row.
  assert.deepEqual(ANIMATIONS.runningRight, { row: 1, frames: 8, interval: 120 })
  assert.deepEqual(ANIMATIONS.runningLeft, { row: 2, frames: 8, interval: 120 })
  assert.deepEqual(ANIMATIONS.waving, { row: 3, frames: 4, interval: 200 })
  assert.deepEqual(ANIMATIONS.jumping, { row: 4, frames: 5, interval: 140 })
  assert.deepEqual(ANIMATIONS.failed, { row: 5, frames: 8, interval: 140 })
  assert.deepEqual(ANIMATIONS.waiting, { row: 6, frames: 6, interval: 150 })
  assert.deepEqual(ANIMATIONS.running, { row: 7, frames: 6, interval: 120 })
  assert.deepEqual(ANIMATIONS.review, { row: 8, frames: 6, interval: 360 })
  assert.equal(animationFor('missing'), ANIMATIONS.idle)
})

test('columnOf uses every repaired frame and clamps', () => {
  assert.equal(columnOf('idle', 3), 3)
  assert.equal(columnOf('failed', 4), 4)
  assert.equal(columnOf('failed', 5), 5)
  assert.equal(columnOf('failed', 6), 6)
  assert.equal(columnOf('failed', 99), 7)
  assert.equal(columnOf('failed', -1), 0)
  assert.equal(columnOf('failed', 1.7), 1)
})

test('looping and one-shot frame math agree', () => {
  assert.equal(frameIndex('idle', 0), 0)
  assert.equal(frameIndex('idle', 159), 0)
  assert.equal(frameIndex('idle', 160), 1)
  assert.equal(frameIndex('idle', 160 * 6), 0)
  assert.equal(frameIndex('idle', 160 * 7), 1)
  assert.equal(lastFrameIndex('jumping', 10 ** 9), 4)
  assert.equal(isFinished('jumping', (5 - 1) * 140), true)
  assert.equal(isFinished('jumping', 100), false)
})

test('look directions are clockwise starting at up', () => {
  assert.equal(normalizeDegrees(0), 0)
  assert.equal(normalizeDegrees(-90), 270)
  assert.equal(normalizeDegrees(720 + 45), 45)

  assert.equal(lookIndexOfDegrees(0), 0)
  assert.equal(lookIndexOfDegrees(22.5), 1)
  assert.equal(lookIndexOfDegrees(90), 4)
  assert.equal(lookIndexOfDegrees(180), 8)
  assert.equal(lookIndexOfDegrees(270), 12)
  assert.equal(lookIndexOfDegrees(359), 0)
  assert.equal(lookIndexOfDegrees(350), 16 % LOOK_CELLS)

  assert.deepEqual(lookCell(0), { row: 9, column: 0 })
  assert.deepEqual(lookCell(7), { row: 9, column: 7 })
  assert.deepEqual(lookCell(8), { row: 10, column: 0 })
  assert.deepEqual(lookCell(15), { row: 10, column: 7 })
  assert.deepEqual(lookCell(16), { row: 9, column: 0 })
})

test('screen vectors map to the right look cell', () => {
  assert.deepEqual(lookCellForVector(0, -10), { row: 9, column: 0 }) // up
  assert.deepEqual(lookCellForVector(10, 0), { row: 9, column: 4 }) // right
  assert.deepEqual(lookCellForVector(0, 10), { row: 10, column: 0 }) // down
  assert.deepEqual(lookCellForVector(-10, 0), { row: 10, column: 4 }) // left
  assert.equal(lookCellForVector(Number.NaN, 1), null)
})

test('sprite geometry scales the whole sheet', () => {
  const cell = spriteGeometry(192, 2, 3)
  assert.equal(cell.width, 192)
  assert.equal(cell.height, 208)
  assert.equal(cell.backgroundSize, '1536px 2288px')
  assert.equal(cell.backgroundPosition, '-576px -416px')

  const scaled = spriteGeometry(96, 0, 0)
  assert.equal(scaled.height, 104)
  assert.equal(scaled.backgroundSize, '768px 1144px')
})
