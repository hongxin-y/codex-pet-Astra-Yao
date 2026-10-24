import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONFIG_PATCH_FIELDS,
  applyPatch,
  clampNumber,
  defaults,
  normalizeConfig,
  readConfig,
  readNullableNumber,
} from '../src/config.js'

test('defaults match the cordis patch shipped with the bundle', () => {
  assert.deepEqual(Object.keys(defaults), [...CONFIG_PATCH_FIELDS])
  assert.deepEqual(normalizeConfig({}), defaults)
})

test('normalizeConfig unwraps cosmokit volatile values', () => {
  const wrapped = {
    enabled: { get: () => true },
    scale: { get: () => 1.25 },
    opacity: { get: () => 0.8 },
    locked: { get: () => 1 },
    posX: { get: () => 42 },
  }
  assert.deepEqual(readConfig(wrapped), {
    ...defaults,
    scale: 1.25,
    opacity: 0.8,
    locked: 1,
    posX: 42,
  })
  const config = normalizeConfig(wrapped)
  assert.equal(config.scale, 1.25)
  assert.equal(config.opacity, 0.8)
  assert.equal(config.locked, true)
  assert.equal(config.posX, 42)
  assert.equal(config.posY, null)
})

test('normalizeConfig clamps out-of-range numbers', () => {
  const config = normalizeConfig({ scale: 9, opacity: 0, posX: '12.6', posY: '' })
  assert.equal(config.scale, 2)
  assert.equal(config.opacity, 0.3)
  assert.equal(config.posX, 13)
  assert.equal(config.posY, null)
})

test('clampNumber and readNullableNumber tolerate junk', () => {
  assert.equal(clampNumber('nope', 0, 1, 0.5), 0.5)
  assert.equal(clampNumber(undefined, 0, 1, 0.5), 0.5)
  assert.equal(clampNumber(-3, 0, 1, 0.5), 0)
  assert.equal(readNullableNumber('12.4'), 12)
  assert.equal(readNullableNumber(null), null)
  assert.equal(readNullableNumber(''), null)
})

test('applyPatch validates the patch shape', () => {
  assert.throws(() => applyPatch(defaults, null), /must be an object/u)
  assert.throws(() => applyPatch(defaults, []), /must be an object/u)
  assert.throws(() => applyPatch(defaults, { nope: 1 }), /unknown config field: nope/u)
})

test('applyPatch applies, clamps and coerces fields', () => {
  const next = applyPatch(defaults, { scale: '1.5', opacity: 2, locked: 'yes', posX: null, paused: 0 })
  assert.equal(next.scale, 1.5)
  assert.equal(next.opacity, 1)
  assert.equal(next.locked, true)
  assert.equal(next.posX, null)
  assert.equal(next.paused, false)
  assert.equal(next.enabled, true)
  assert.equal(defaults.scale, 1, 'applyPatch must not mutate the defaults')
})
