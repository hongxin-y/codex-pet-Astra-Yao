#!/usr/bin/env node
/**
 * Verify the package is a valid, shippable DSH plugin.
 *
 * Checks the parts DSH itself looks at (package manifest fields, bundle patch,
 * built client bundle) plus the pet asset contract (atlas dimensions declared
 * in src/atlas.js must match the real spritesheet header).
 *
 * Run with `npm run verify`; exits non-zero on the first broken invariant.
 */

import { readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  COLUMNS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  ROWS,
  SHEET_HEIGHT,
  SHEET_WIDTH,
  SPRITE_VERSION,
  describeAtlas,
} from '../src/atlas.js'
import { CONFIG_PATCH_FIELDS, defaults } from '../src/config.js'

const root = new URL('..', import.meta.url)
const problems = []
const notes = []

function fail(message) {
  problems.push(message)
}

function ok(message) {
  notes.push(message)
}

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

async function readText(path) {
  return readFile(new URL(path, root), 'utf8')
}

/** Minimal WebP header reader: returns { width, height, format }. */
function webpSize(buffer) {
  if (buffer.length < 30) throw new Error('file is too small to be a WebP image')
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('missing RIFF signature')
  if (buffer.toString('ascii', 8, 12) !== 'WEBP') throw new Error('missing WEBP signature')

  let offset = 12
  while (offset + 8 <= buffer.length) {
    const fourcc = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (fourcc === 'VP8X') {
      return {
        format: 'VP8X',
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3),
      }
    }
    if (fourcc === 'VP8 ') {
      const sync = data + 3
      if (buffer[sync] === 0x9d && buffer[sync + 1] === 0x01 && buffer[sync + 2] === 0x2a) {
        return {
          format: 'VP8',
          width: buffer.readUInt16LE(sync + 3) & 0x3fff,
          height: buffer.readUInt16LE(sync + 5) & 0x3fff,
        }
      }
      throw new Error('malformed VP8 key frame header')
    }
    if (fourcc === 'VP8L') {
      const bits = buffer.readUInt32LE(data + 1)
      return {
        format: 'VP8L',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      }
    }
    offset = data + size + (size % 2)
  }
  throw new Error('no VP8X, VP8 or VP8L chunk found')
}

// --- package manifest -------------------------------------------------------

const pkg = await readJson('package.json')

if (pkg.name !== 'dsh-pet-astra-yao') fail(`package.json name is ${JSON.stringify(pkg.name)}, expected dsh-pet-astra-yao`)
if (pkg.type !== 'module') fail('package.json must declare "type": "module"')
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(String(pkg.version))) fail(`package.json version ${pkg.version} is not semver`)
if (!pkg.exports?.['./client']) fail('package.json exports must expose "./client" (the DSH browser bundle)')
if (pkg.exports?.['./client'] !== './lib/client.js') fail('"./client" must resolve to ./lib/client.js')
if (pkg.dsh?.bundle?.patch !== './cordis.patch.yml') fail('package.json dsh.bundle.patch must point at ./cordis.patch.yml')
if (pkg.dsh?.client?.platform !== 'web') fail('package.json dsh.client.platform must be "web"')
if (!Array.isArray(pkg.dsh?.client?.inject)) fail('package.json dsh.client.inject must be an array')
if (pkg.dsh?.client?.inject?.length > 0) fail('dsh.client.inject must stay empty: the bundle uses only baseline modules')
if (!existsSync(new URL(pkg.main, root))) fail(`package.json main ${pkg.main} does not exist`)
if (pkg.engines?.node !== '>=22.19') fail('package.json engines.node must be ">=22.19" for DSH')
ok(`package.json: ${pkg.name}@${pkg.version}, main ${pkg.main}, client ${pkg.exports['./client']}`)

// --- bundle patch -----------------------------------------------------------

const patch = await readText('cordis.patch.yml')
if (!/^-\s+insert:/mu.test(patch)) fail('cordis.patch.yml must contain an "- insert:" list entry')
if (!/^\s*(?:-\s+)?id:\s*dsh-pet-astra-yao\s*$/mu.test(patch)) fail('cordis.patch.yml must insert a row with id dsh-pet-astra-yao')
if (!/^\s*(?:-\s+)?name:\s*dsh-pet-astra-yao\s*$/mu.test(patch)) fail('cordis.patch.yml must load the package name dsh-pet-astra-yao')
for (const field of CONFIG_PATCH_FIELDS) {
  if (!new RegExp(`^\\s+${field}:`, 'mu').test(patch)) fail(`cordis.patch.yml config is missing ${field}`)
}
const patchFields = [...patch.matchAll(/^\s{8}([A-Za-z][\w]*):/gmu)].map((match) => match[1])
for (const field of patchFields) {
  if (!Object.hasOwn(defaults, field)) fail(`cordis.patch.yml sets unknown config field ${field}`)
}
ok(`cordis.patch.yml: insert row for dsh-pet-astra-yao with ${patchFields.length} config fields`)

// --- built client bundle ----------------------------------------------------

const bundlePath = new URL('lib/client.js', root)
if (!existsSync(bundlePath)) {
  fail('lib/client.js is missing — run `npm run build` and commit the result (DSH serves the built bundle)')
} else {
  const bundle = await readFile(bundlePath, 'utf8')
  const bundleStat = await stat(bundlePath)
  const coreStat = await stat(new URL('src/client.core.js', root))
  if (!bundle.includes('window.__ModuleLoader__.load(')) fail('lib/client.js does not register through window.__ModuleLoader__.load')
  if (!bundle.includes(`id: ${JSON.stringify(pkg.name)}`)) fail('lib/client.js bundle id does not match the package name')
  if (!bundle.includes('dsh-pet-astra-yao-client')) fail('lib/client.js does not register the dsh-pet-astra-yao-client module')
  if (!bundle.includes(pkg.version)) fail('lib/client.js was built from a different version — run `npm run build`')
  if (bundleStat.mtimeMs + 1 < coreStat.mtimeMs) fail('lib/client.js is older than src/client.core.js — run `npm run build`')
  ok(`lib/client.js: ${bundleStat.size} bytes, bundle id ${pkg.name}`)
}

// --- spritesheet ------------------------------------------------------------

const sheet = await readFile(new URL('spritesheet.webp', root))
const size = webpSize(sheet)
if (size.width !== SHEET_WIDTH || size.height !== SHEET_HEIGHT) {
  fail(`spritesheet.webp is ${size.width}x${size.height} (${size.format}); the ${SPRITE_VERSION} atlas requires ${SHEET_WIDTH}x${SHEET_HEIGHT}`)
}
if (sheet.length > 20 * 1024 * 1024) fail('spritesheet.webp is larger than the 20 MiB Codex limit')
const sheetHash = createHash('sha256').update(sheet).digest('hex')
const atlas = describeAtlas()
if (atlas.sheetWidth !== SHEET_WIDTH || atlas.sheetHeight !== SHEET_HEIGHT) fail('src/atlas.js sheet dimensions are inconsistent')
if (atlas.frameWidth !== FRAME_WIDTH || atlas.frameHeight !== FRAME_HEIGHT) fail('src/atlas.js frame dimensions are inconsistent')
if (atlas.columns !== COLUMNS || atlas.rows !== ROWS) fail('src/atlas.js grid dimensions are inconsistent')
ok(`spritesheet.webp: ${size.width}x${size.height} ${size.format}, ${(sheet.length / 1024 / 1024).toFixed(2)} MiB, sha256 ${sheetHash.slice(0, 12)}…`)

// --- pet manifest -----------------------------------------------------------

const pet = await readJson('pet.json')
if (pet.id !== 'astra-yao') fail(`pet.json id is ${JSON.stringify(pet.id)}, expected astra-yao`)
if (pet.spriteVersionNumber !== SPRITE_VERSION) fail(`pet.json spriteVersionNumber must be ${SPRITE_VERSION}`)
if (!existsSync(new URL(pet.spritesheetPath, root))) fail(`pet.json spritesheetPath ${pet.spritesheetPath} does not exist`)
ok(`pet.json: ${pet.displayName} (${pet.id}), spriteVersionNumber ${pet.spriteVersionNumber}`)

// --- report -----------------------------------------------------------------

for (const note of notes) console.log(`  ok   ${note}`)
if (problems.length > 0) {
  console.error('')
  for (const problem of problems) console.error(`  FAIL ${problem}`)
  process.exitCode = 1
} else {
  console.log(`\nverified ${pkg.name}@${pkg.version}: installable DSH plugin with a ${SHEET_WIDTH}x${SHEET_HEIGHT} ${SPRITE_VERSION} atlas`)
}
