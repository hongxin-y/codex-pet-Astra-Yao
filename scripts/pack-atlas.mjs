#!/usr/bin/env node
/** Package reviewed artwork; never ask a generator to place the final grid. */
import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { FRAME_WIDTH as W, FRAME_HEIGHT as H, SHEET_WIDTH, SHEET_HEIGHT } from '../src/atlas.js'

const root = new URL('../', import.meta.url)
const output = fileURLToPath(new URL('spritesheet.webp', root))
const before = await readFile(output)
const base = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
if (base.info.width !== SHEET_WIDTH || base.info.height !== SHEET_HEIGHT) throw new Error('Invalid base atlas geometry')
const pixels = Buffer.from(base.data)
const stride = SHEET_WIDTH * 4

function bounds(data, width, height) {
  let left = width, top = height, right = 0, bottom = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
    }
  }
  if (!right || !bottom) throw new Error('Empty replacement frame')
  return { left, top, width: right - left, height: bottom - top }
}

async function readFrame(path, rectangle, { minComponent = 24 } = {}) {
  const { data, info } = await sharp(path).extract(rectangle).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Remove only barely visible matte dust from generated transparent inputs.
  // Retain the actual soft alpha edges while preparing source frames.
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 24) data.fill(0, offset, offset + 4)
  }
  // Tight generated rows can contain a few disconnected pixels from the
  // preceding pose (for example a shoe tip above a thinking frame). Remove
  // tiny isolated matte fragments, retaining all substantial components.
  const seen = new Uint8Array(info.width * info.height)
  const queue = new Int32Array(seen.length)
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !data[start * 4 + 3]) continue
    let head = 0, tail = 1
    queue[0] = start; seen[start] = 1
    while (head < tail) {
      const pixel = queue[head++], x = pixel % info.width, y = Math.floor(pixel / info.width)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || nx >= info.width || ny < 0 || ny >= info.height) continue
        const neighbor = ny * info.width + nx
        if (seen[neighbor] || !data[neighbor * 4 + 3]) continue
        seen[neighbor] = 1; queue[tail++] = neighbor
      }
    }
    if (tail < minComponent) for (let index = 0; index < tail; index++) data.fill(0, queue[index] * 4, queue[index] * 4 + 4)
  }
  const box = bounds(data, info.width, info.height)
  const cropped = await sharp(data, { raw: info }).extract(box).raw().toBuffer()
  return {
    data: cropped,
    width: box.width,
    height: box.height,
    offset: { left: rectangle.left + box.left, top: rectangle.top + box.top },
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function torsoCenter(data, width, height) {
  // White bodice/skirt pixels anchor the body, rather than the asymmetrical
  // hair/staff bounding box. This is placement only, not a body-ratio audit.
  let mass = 0, center = 0
  for (let y = Math.floor(height * 0.48); y < height * 0.76; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b, a] = data.subarray(i, i + 4)
      if (a < 128 || r < 160 || g < 155 || b < 145 || Math.max(r, g, b) - Math.min(r, g, b) > 75) continue
      mass += a; center += x * a
    }
  }
  if (!mass) throw new Error('Cannot place frame: no white bodice anchor')
  return center / mass
}

function legCenter(data, width, height) {
  // Exposed leg pixels keep grounded frames aligned while excluding the
  // asymmetric staff and hair from the horizontal body pivot.
  let mass = 0, center = 0
  for (let y = Math.floor(height * 0.70); y < Math.floor(height * 0.97); y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const [r, g, b, a] = data.subarray(i, i + 4)
      if (a < 128 || r < 155 || g < 85 || b < 55 || r < g * 1.15 || g < b * 1.05) continue
      mass += a; center += x * a
    }
  }
  if (!mass) throw new Error('Cannot place frame: no leg anchor')
  return center / mass
}

// The torso/leg center aligns to the atlas midpoint, not the asymmetric
// combined bounds of the character, hair, and staff.
const masterAnchor = W / 2

function put(row, column, data, width = W, height = H, left = 0, top = 0) {
  if (left < 0 || top < 0 || left + width > W || top + height > H) throw new Error(`Frame ${row},${column} would clip`)
  for (let y = 0; y < height; y++) {
    data.copy(pixels, ((row * H + top + y) * SHEET_WIDTH + column * W + left) * 4, y * width * 4, (y + 1) * width * 4)
  }
}

async function placeGenerated(frames, destinations, {
  anchor = 'torso',
  scaleOverride,
  alignBottom = true,
} = {}) {
  // One uniform scale per source set, never stretch individual poses to pass
  // a height check. The generator's output pixel dimensions are not guaranteed.
  const scale = scaleOverride ?? (198 / median(frames.map((frame) => frame.height)))
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]
    const height = Math.round(frame.height * scale)
    const resizedResult = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .resize({ height, kernel: sharp.kernel.nearest }).raw().toBuffer({ resolveWithObject: true })
    const { data: resized, info: { width } } = resizedResult
    const bodyAnchor = anchor === 'legs'
      ? legCenter(resized, width, height)
      : torsoCenter(resized, width, height)
    const desiredLeft = Math.round(masterAnchor - bodyAnchor)
    const maxLeft = W - 1 - width
    if (maxLeft < 1) throw new Error(`Frame ${destinations[index]} is wider than its cell: ${width}px`)
    const left = Math.max(1, Math.min(maxLeft, desiredLeft))
    if (Math.abs(left + bodyAnchor - masterAnchor) > 6) {
      throw new Error(`Body anchor for ${destinations[index]} would land at x=${(left + bodyAnchor).toFixed(1)} outside ${masterAnchor.toFixed(1)} +/- 6; frame ${width}x${height}, anchor ${bodyAnchor.toFixed(1)}, desired left ${desiredLeft}`)
    }
    const sourceTop = frame.offset?.top ?? 0
    const proposedTop = alignBottom ? 203 - height : Math.max(1, Math.round(sourceTop * scale))
    const top = Math.min(H - 1 - height, proposedTop)
    if (top < 1 || top + height > H - 1 || left + width > W - 1) {
      throw new Error(`Insufficient gutter in replacement ${destinations[index]}: ${width}x${height} at ${left},${top}; source ${frame.width}x${frame.height}, scale ${scale}`)
    }
    put(...destinations[index], resized, width, height, left, top)
  }
  return scale
}

for (let row = 0; row < 11; row++) pixels.fill(0, row * H * stride, (row + 1) * H * stride)

const normalizedRoot = 'assets/atlas-source/normalized/'
const normalizedSources = Object.fromEntries(
  ['idle', 'run', 'wave', 'jump', 'failed', 'waiting', 'review'].map((name) => [
    name,
    fileURLToPath(new URL(`${normalizedRoot}${name}.png`, root)),
  ]),
)

async function gridFrames(path, count, { columns = 4, rows = 2, frameBounds = {} } = {}) {
  const meta = await sharp(path).metadata()
  const frames = []
  for (let index = 0; index < count; index++) {
    const column = index % columns, row = Math.floor(index / columns)
    const left = Math.floor(meta.width * column / columns)
    const right = Math.floor(meta.width * (column + 1) / columns)
    const panelTop = Math.floor(meta.height * row / rows)
    const panelBottom = Math.floor(meta.height * (row + 1) / rows)
    const top = frameBounds[index]?.top ?? panelTop
    const bottom = frameBounds[index]?.bottom ?? panelBottom
    const rectangle = { left, top, width: right - left, height: bottom - top }
    const frame = await readFrame(path, rectangle, { minComponent: 5000 })
    frame.offset = { left: frame.offset.left - left, top: frame.offset.top - top }
    frames.push(frame)
  }
  return frames
}

const idleSourceFrames = await gridFrames(normalizedSources.idle, 7)
// The source's later idle variants change the visible lower-body length. Hold
// one open-eye master pose and use its scale-matched blink frame so the loop
// cannot appear to shrink or bob between unrelated generated poses.
const idleFrames = [
  idleSourceFrames[0],
  idleSourceFrames[0],
  idleSourceFrames[1],
  idleSourceFrames[0],
  idleSourceFrames[0],
  idleSourceFrames[0],
]
const idleScale = 198 / median(idleFrames.map((frame) => frame.height))
await placeGenerated(idleFrames, idleFrames.map((_, column) => [0, column]), { scaleOverride: idleScale })

const runFrames = await gridFrames(normalizedSources.run, 8)
const runLeftScale = 198 / median(runFrames.map((frame) => frame.height))
await placeGenerated(runFrames, runFrames.map((_, column) => [2, column]), { scaleOverride: runLeftScale })
const runRightSource = fileURLToPath(new URL(`${normalizedRoot}run-right.png`, root))
const runRightFrames = await gridFrames(runRightSource, 8, { columns: 4, rows: 2 })
const runRightScale = 197 / median(runRightFrames.map((frame) => frame.height))
await placeGenerated(runRightFrames, runRightFrames.map((_, column) => [1, column]), { scaleOverride: runRightScale })
const workingPhases = [0, 1, 3, 4, 5, 7]
const workingFrames = workingPhases.map((phase) => runFrames[phase])
await placeGenerated(workingFrames, workingFrames.map((_, column) => [7, column]), { scaleOverride: runLeftScale })

const waveFrames = await gridFrames(normalizedSources.wave, 4, { columns: 2, rows: 2 })
const waveScale = 198 / Math.max(...waveFrames.map((frame) => frame.height))
await placeGenerated(waveFrames, waveFrames.map((_, column) => [3, column]), { anchor: 'legs', scaleOverride: waveScale })

// The fourth jump pose extends slightly below the top-row divider; include its
// full shoes instead of clipping them at the nominal 2-row panel boundary.
const jumpFrames = await gridFrames(normalizedSources.jump, 5, { frameBounds: { 3: { bottom: 500 } } })
const jumpScale = 198 / median(jumpFrames.map((frame) => frame.height))
await placeGenerated(jumpFrames, jumpFrames.map((_, column) => [4, column]), {
  scaleOverride: jumpScale,
  alignBottom: false,
})

const failedFrames = await gridFrames(normalizedSources.failed, 8, { columns: 4, rows: 2 })
const failedScale = 198 / Math.max(...failedFrames.map((frame) => frame.height))
await placeGenerated(failedFrames, failedFrames.map((_, column) => [5, column]), { anchor: 'legs', scaleOverride: failedScale })

const waitingFrames = await gridFrames(normalizedSources.waiting, 6)
const waitingScale = await placeGenerated(waitingFrames, waitingFrames.map((_, column) => [6, column]))

const reviewFrames = await gridFrames(normalizedSources.review, 6, { columns: 3, rows: 2 })
const reviewScale = 198 / Math.max(...reviewFrames.map((frame) => frame.height))
await placeGenerated(reviewFrames, reviewFrames.map((_, column) => [8, column]), { anchor: 'legs', scaleOverride: reviewScale })

const lookRoot = 'assets/atlas-source/look/'
const lookRow9Source = fileURLToPath(new URL(`${lookRoot}row9-000-157.png`, root))
const lookRow10Source = fileURLToPath(new URL(`${lookRoot}row10-180-337.png`, root))
const lookRow9Frames = await gridFrames(lookRow9Source, 8, { columns: 4, rows: 2 })
const lookRow10Frames = await gridFrames(lookRow10Source, 8, { columns: 4, rows: 2 })
const lookRow9Scale = 198 / median(lookRow9Frames.map((frame) => frame.height))
const lookRow10Scale = 198 / median(lookRow10Frames.map((frame) => frame.height))
await placeGenerated(lookRow9Frames, lookRow9Frames.map((_, column) => [9, column]), {
  anchor: 'legs',
  scaleOverride: lookRow9Scale,
})
await placeGenerated(lookRow10Frames, lookRow10Frames.map((_, column) => [10, column]), {
  anchor: 'legs',
  scaleOverride: lookRow10Scale,
})
// Encode before writing so a packing/encoding error leaves the asset intact.
const encoded = await sharp(pixels, { raw: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 4 } })
  .webp({ lossless: true, effort: 6 }).toBuffer()
await writeFile(output, encoded)
console.log(`Packed ${SHEET_WIDTH}x${SHEET_HEIGHT} lossless RGBA WebP (${(encoded.length / 1024).toFixed(1)} KiB)`)
console.log(`Shared scales: idle ${idleScale.toFixed(4)}, run left ${runLeftScale.toFixed(4)}, run right ${runRightScale.toFixed(4)}, wave ${waveScale.toFixed(4)}, jump ${jumpScale.toFixed(4)}, failed ${failedScale.toFixed(4)}, waiting ${waitingScale.toFixed(4)}, review ${reviewScale.toFixed(4)}, look rows ${lookRow9Scale.toFixed(4)}/${lookRow10Scale.toFixed(4)}; standing occupied bottom 203`)
