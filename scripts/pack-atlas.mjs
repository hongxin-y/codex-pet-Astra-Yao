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

async function readFrame(path, rectangle) {
  const { data, info } = await sharp(path).extract(rectangle).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  // Remove only barely visible matte dust from generated transparent inputs.
  // Retain the actual soft alpha edges; never change the original atlas rows.
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
    if (tail < 24) for (let index = 0; index < tail; index++) data.fill(0, queue[index] * 4, queue[index] * 4 + 4)
  }
  const box = bounds(data, info.width, info.height)
  const cropped = await sharp(data, { raw: info }).extract(box).raw().toBuffer()
  return { data: cropped, width: box.width, height: box.height }
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

// Match the actual idle rig, whose asymmetric composition is not centered on
// the cell's geometric midpoint. Derive the anchor instead of guessing x=96.
const master = await sharp(before).extract({ left: 0, top: 0, width: W, height: H }).ensureAlpha().raw().toBuffer()
const masterBox = bounds(master, W, H)
const masterBody = await sharp(master, { raw: { width: W, height: H, channels: 4 } }).extract(masterBox).raw().toBuffer()
const masterAnchor = masterBox.left + torsoCenter(masterBody, masterBox.width, masterBox.height)

function put(row, column, data, width = W, height = H, left = 0, top = 0) {
  if (left < 0 || top < 0 || left + width > W || top + height > H) throw new Error(`Frame ${row},${column} would clip`)
  for (let y = 0; y < height; y++) {
    data.copy(pixels, ((row * H + top + y) * SHEET_WIDTH + column * W + left) * 4, y * width * 4, (y + 1) * width * 4)
  }
}

async function placeGenerated(frames, destinations) {
  // One uniform scale per source set, never stretch individual poses to pass
  // a height check. The generator's output pixel dimensions are not guaranteed.
  const scale = 198 / median(frames.map((frame) => frame.height))
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]
    const width = Math.round(frame.width * scale), height = Math.round(frame.height * scale)
    const resized = await sharp(frame.data, { raw: { width: frame.width, height: frame.height, channels: 4 } })
      .resize(width, height, { fit: 'fill', kernel: sharp.kernel.nearest }).raw().toBuffer()
    const left = Math.round(masterAnchor - torsoCenter(resized, width, height))
    const top = 203 - height
    if (top < 1 || left < 1 || left + width > W - 1) throw new Error(`Insufficient gutter in replacement ${destinations[index]}: ${width}x${height} at ${left},${top}; source ${frame.width}x${frame.height}, scale ${scale}`)
    put(...destinations[index], resized, width, height, left, top)
  }
  return scale
}

for (const row of [1, 5, 7, 8, 9, 10]) pixels.fill(0, row * H * stride, (row + 1) * H * stride)

// The existing left run is the reviewed, coherent animation rig. Materialize
// its mirror in the native right-run row so Codex and DSH use the same pixels.
for (let column = 0; column < 8; column++) {
  const input = await sharp(before).extract({ left: column * W, top: 2 * H, width: W, height: H }).ensureAlpha().raw().toBuffer()
  const mirrored = await sharp(input, { raw: { width: W, height: H, channels: 4 } }).flop().raw().toBuffer()
  put(1, column, mirrored)
}
// Evenly distributed phases from the same cycle; six unique drawings, no
// standing gesture montage or duplicated cells used to fill the working row.
const workingPhases = [0, 1, 3, 4, 5, 7]
for (const [column, phase] of workingPhases.entries()) {
  const input = await sharp(before).extract({ left: phase * W, top: 2 * H, width: W, height: H }).ensureAlpha().raw().toBuffer()
  put(7, column, input)
}

const actionsPath = fileURLToPath(new URL('assets/atlas-source/actions.png', root))
const actionMeta = await sharp(actionsPath).metadata()
if (actionMeta.width !== 1704 || actionMeta.height !== 923) throw new Error('Action source changed; review its extraction rectangles')
const actionFrames = [], actionDestinations = []
for (const { row, top, bottom, cuts } of [
  { row: 5, top: 243, bottom: 467, cuts: [0, 220, 433, 645, 857, 1071, 1284, 1497, 1704] },
  { row: 8, top: 685, bottom: 923, cuts: [0, 220, 433, 646, 858, 1071, 1284] },
]) {
  for (let column = 0; column < cuts.length - 1; column++) {
    actionFrames.push(await readFrame(actionsPath, { left: cuts[column], top, width: cuts[column + 1] - cuts[column], height: bottom - top }))
    actionDestinations.push([row, column])
  }
}
const actionScale = await placeGenerated(actionFrames, actionDestinations)

const lookPath = fileURLToPath(new URL('assets/atlas-source/look.png', root))
const lookMeta = await sharp(lookPath).metadata()
if (lookMeta.width !== 1205 || lookMeta.height !== 1305) throw new Error('Look source changed; review its extraction rectangles')
const lookFrames = [], lookDestinations = []
const lookX = [0, 335, 634, 928, 1205], lookY = [0, 323, 647, 966, 1305]
for (let index = 0; index < 16; index++) {
  const r = Math.floor(index / 4), c = index % 4
  lookFrames.push(await readFrame(lookPath, { left: lookX[c], top: lookY[r], width: lookX[c + 1] - lookX[c], height: lookY[r + 1] - lookY[r] }))
  lookDestinations.push([9 + Math.floor(index / 8), index % 8])
}
const lookScale = await placeGenerated(lookFrames, lookDestinations)

// Encode before writing so a packing/encoding error leaves the asset intact.
const encoded = await sharp(pixels, { raw: { width: SHEET_WIDTH, height: SHEET_HEIGHT, channels: 4 } })
  .webp({ lossless: true, effort: 6 }).toBuffer()
await writeFile(output, encoded)
console.log(`Packed ${SHEET_WIDTH}x${SHEET_HEIGHT} lossless RGBA WebP (${(encoded.length / 1024).toFixed(1)} KiB)`)
console.log(`Shared scales: actions ${actionScale.toFixed(4)}, look ${lookScale.toFixed(4)}; standing occupied bottom 203`)
